import { createFile } from 'https://unpkg.com/mp4box@1.4.2/dist/mp4box.all.js';

const DEBUG_VIDEO_TRACK_INFO = true;
const DEBUG_DECODE_QUEUE = false;
const DEBUG_DECODE_DELIVERY = false;

/**
 * WebCodec Video Asset Loader for Cavalry Web Player
 *
 * This module handles video decoding for Cavalry's web player using the WebCodecs API.
 * It manages the communication between the browser's video decoder (frontend) and
 * Cavalry's rendering engine (backend).
 *
 * == Architecture Overview ==
 *
 * 1. MP4 Parsing (mp4box.js):
 *    - Parses MP4 container format
 *    - Extracts video samples and metadata
 *    - Provides frame data to the decoder
 *
 * 2. Video Decoding (WebCodecs VideoDecoder):
 *    - Decodes compressed video frames to raw RGBA pixels
 *    - Handles keyframe-based seeking for random access
 *    - Adapts to browser capabilities (direct copy vs canvas fallback)
 *
 * 3. Frame Transfer (Callbacks to Cavalry):
 *    - Decoded frames are sent to Cavalry via player.app.onPrefetchFrame()
 *    - Cavalry requests additional frames via player.Module.prefetchFrames()
 *    - This creates a pull-based streaming system
 *
 * == Callback Flow ==
 *
 * Frontend → Backend:
 *   player.app.onPrefetchFrame(assetId, frameIndex, pixelDataPtr, width, height)
 *   └─ Called when a frame is decoded and ready
 *   └─ Transfers RGBA pixel data to Cavalry's memory
 *   └─ Cavalry caches the frame for rendering
 *
 * Backend → Frontend:
 *   player.Module.prefetchFrames(assetId, startFrame, count)
 *   └─ Called when Cavalry needs more frames
 *   └─ Triggers feedBatch() to decode the requested range
 *   └─ Decoded frames are sent back via onPrefetchFrame()
 *
 * == Key Concepts ==
 *
 * - Initial Prefill: First 10 frames are decoded immediately for smooth playback start
 * - Chunk-based Prefetching: Frames are fetched in 10-frame chunks as playback progresses
 * - Keyframe Seeking: Random access requires decoding from the nearest keyframe
 * - Browser Adaptation: Automatically detects and uses fastest copy method per browser
 */

/**
 * Creates or resizes a canvas for frame extraction (Safari fallback)
 *
 * @param {Object} asset - Video asset object
 * @param {number} width - Required canvas width
 * @param {number} height - Required canvas height
 * @returns {HTMLCanvasElement|OffscreenCanvas} Canvas element
 */
function ensureCanvasForAsset(asset, width, height) {
    if (!asset) return null;

    const needsCanvas = !asset.canvas;
    const needsResize = !needsCanvas && (asset.canvas.width !== width || asset.canvas.height !== height);

    if (needsCanvas) {
        if (typeof OffscreenCanvas !== 'undefined') {
            asset.canvas = new OffscreenCanvas(width, height);
        } else if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.style.position = 'absolute';
            canvas.style.left = '-9999px';
            canvas.style.top = '0';
            canvas.style.pointerEvents = 'none';
            canvas.style.visibility = 'hidden';
            document.body.appendChild(canvas);
            asset.canvas = canvas;
            asset.canvasCleanup = () => {
                if (canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                }
            };
        }
    }

    if (asset.canvas && (needsCanvas || needsResize)) {
        asset.canvas.width = width;
        asset.canvas.height = height;
    }

    return asset.canvas;
}

/**
 * Extracts pixel data from a VideoFrame using canvas (Safari fallback method)
 *
 * Safari doesn't support VideoFrame.copyTo() with layout options, so we use
 * a canvas-based approach to extract RGBA pixel data.
 *
 * @param {VideoFrame} frame - WebCodecs VideoFrame to extract from
 * @param {Object} rect - Region to extract {x, y, width, height}
 * @param {number} width - Output width
 * @param {number} height - Output height
 * @param {Object} asset - Video asset (provides canvas)
 * @returns {Uint8ClampedArray} RGBA pixel data
 */
function copyFrameViaCanvas(frame, rect, width, height, asset) {
    const canvas = ensureCanvasForAsset(asset, width, height);
    if (!canvas) {
        throw new Error('Canvas fallback unavailable on this platform.');
    }

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Failed to obtain 2D context for canvas fallback.');
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(frame, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    return imageData.data; // Uint8ClampedArray
}

/**
 * Loads and decodes a video asset for use in Cavalry
 *
 * This is the main entry point for video asset loading. It:
 * 1. Downloads the video file
 * 2. Parses the MP4 container with mp4box.js
 * 3. Sets up WebCodecs VideoDecoder and AudioDecoder
 * 4. Decodes the initial 10 frames for smooth playback start
 * 5. Registers callbacks for Cavalry to request additional frames
 *
 * @param {Object} player - Cavalry player instance with Module and app properties
 * @param {string} assetId - Unique identifier for this video asset
 * @param {string} videoUrl - URL or path to the MP4 video file
 * @returns {Promise} Resolves when initial frames are decoded and ready
 */
export async function loadWebCodecVideoAsset(player, assetId, videoUrl) {
    console.log(`Loading AV assetId=${assetId}, videoUrl=${videoUrl}`);
    window.currentAssetId = assetId;
    let response;
    try {
        response = await fetch(videoUrl);
        if (!response.ok) {
            throw new Error(`Failed to load video. HTTP status: ${response.status} for video ${videoUrl}`);
        }
    } catch (err) {
        throw new Error(`Network error while loading video: ${err.message}`);
    }

    const buffer = await response.arrayBuffer();
    const mp4boxFile = createFile();

    return new Promise((resolve, reject) => {
        let frameIndex = 0;
        let resolved = false;
        let fps = 0;

        mp4boxFile.onReady = (info) => {
            const videoTrack = info.tracks.find(t => t.type === "video");

            if (!videoTrack) return reject("No video track found.");

            const codec = videoTrack.codec;
            const codedWidth = videoTrack.video.width;
            const codedHeight = videoTrack.video.height;

            // Fallback to default FPS if not declared
            fps = 30.0;
            if (videoTrack.avg_frame_rate) {
                if (typeof videoTrack.avg_frame_rate === "string" && videoTrack.avg_frame_rate.includes("/")) {
                    const [num, den] = videoTrack.avg_frame_rate.split("/").map(Number);
                    fps = num / den;
                } else if (typeof videoTrack.avg_frame_rate === "number") {
                    fps = videoTrack.avg_frame_rate;
                }
            }
            const timescale = videoTrack.timescale;
            const totalFrames = videoTrack.nb_samples || Math.floor((videoTrack.duration / videoTrack.timescale) * fps);

            // Use a 96MB cap for decoded frame cache (RGBA), to avoid WASM heap growth
            const maxFrames = Math.floor((96 * 1024 * 1024) / (codedWidth * codedHeight * 4));
            const initialPrefillFrames = Math.min(10, maxFrames); // Initial buffering strategy

            const bytesPerPixel = 4;
            const frameBytes = codedWidth * codedHeight * bytesPerPixel;

            // Allocate a single reusable memory block for decoded frame data
            const ptr = player.Module._malloc(frameBytes);
            player.Module.HEAPU8.fill(0, ptr, ptr + frameBytes);

            if (DEBUG_VIDEO_TRACK_INFO) {
                console.log('Track Info:');
                console.log(` - ID: ${videoTrack.id}`);
                console.log(` - Codec: ${codec}`);
                console.log(` - Width: ${codedWidth}`);
                console.log(` - Height: ${codedHeight}`);
                const estimatedFPS = (videoTrack.nb_samples / (videoTrack.duration / videoTrack.timescale)).toFixed(2);
                console.log(` - FPS (estimated from duration/samples): ${videoTrack.nb_samples}/(${videoTrack.duration}/${videoTrack.timescale}) = ${estimatedFPS}`);
                console.log(` - Timescale: ${videoTrack.timescale}`);
                console.log(` - Duration: ${videoTrack.duration}`);
                console.log(` - Number of Samples: ${videoTrack.nb_samples}`);
            }

            // Build AVCC config buffer if missing — required by decoder
            let avccDescription = videoTrack.avcDecoderConfigRecord || null;
            if (!avccDescription) {
                const trak = mp4boxFile.getTrackById(videoTrack.id);
                const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.find(e => e.avcC);
                avccDescription = buildAVCCDescription(entry?.avcC);
            }

            /**
             * VideoDecoder output callback - processes each decoded frame
             *
             * This callback is invoked by the WebCodecs VideoDecoder for each successfully
             * decoded video frame. It performs the following steps:
             *
             * 1. Extracts the frame index from the decode queue
             * 2. Copies RGBA pixel data to Cavalry's memory buffer
             * 3. Calls player.app.onPrefetchFrame() to transfer the frame to Cavalry
             *
             * The callback adapts to browser capabilities:
             * - Chrome/Edge: Uses fast VideoFrame.copyTo() method
             * - Safari: Falls back to canvas-based extraction
             *
             */
            const decoderOutput = async (frame) => {
                const asset = window._videoAssets?.[assetId];
                if (!asset) {
                    frame.close();
                    return;
                }

                const timestampMap = asset.decodeQueueByTimestamp;

                let queueEntry = null;
                let targetFrameIndex;

                if (timestampMap && typeof frame.timestamp === 'number') {
                    const entriesForTimestamp = timestampMap.get(frame.timestamp);
                    if (Array.isArray(entriesForTimestamp) && entriesForTimestamp.length) {
                        queueEntry = entriesForTimestamp.shift() || null;

                        if (!entriesForTimestamp.length) {
                            timestampMap.delete(frame.timestamp);
                        } else {
                            timestampMap.set(frame.timestamp, entriesForTimestamp);
                        }

                        if (queueEntry && Array.isArray(asset.decodeQueue)) {
                            const idx = asset.decodeQueue.indexOf(queueEntry);
                            if (idx >= 0) {
                                asset.decodeQueue.splice(idx, 1);
                            }
                        }

                        if (DEBUG_DECODE_QUEUE && queueEntry) {
                            console.log(`[VideoDecoder] asset=${assetId} matched queue entry by timestamp=${frame.timestamp}µs -> frame=${queueEntry.frameIndex}`);
                        }
                    }
                }

                if (!queueEntry && Array.isArray(asset.decodeQueue) && asset.decodeQueue.length) {
                    queueEntry = asset.decodeQueue.shift();

                    if (queueEntry?.timestamp != null && timestampMap) {
                        const entries = timestampMap.get(queueEntry.timestamp);
                        if (Array.isArray(entries)) {
                            const idx = entries.indexOf(queueEntry);
                            if (idx >= 0) {
                                entries.splice(idx, 1);
                            }
                            if (!entries.length) {
                                timestampMap.delete(queueEntry.timestamp);
                            }
                        }
                    }
                }

                if (queueEntry && typeof queueEntry === 'object') {
                    targetFrameIndex = typeof queueEntry.frameIndex === 'number'
                        ? queueEntry.frameIndex
                        : typeof queueEntry.sampleIndex === 'number'
                            ? queueEntry.sampleIndex
                            : frameIndex;

                    frameIndex = Math.max(frameIndex, (typeof targetFrameIndex === 'number' ? targetFrameIndex : frameIndex) + 1);

                    if (queueEntry.deliver === false) {
                        if (DEBUG_DECODE_DELIVERY) {
                            console.log(`[VideoDecoder] asset=${assetId} skipping non-deliverable frame=${targetFrameIndex} timestamp=${frame.timestamp}`);
                        }
                        frame.close();
                        return;
                    }
                } else if (typeof queueEntry === 'number') {
                    targetFrameIndex = queueEntry;
                    frameIndex = Math.max(frameIndex, targetFrameIndex + 1);
                } else {
                    targetFrameIndex = frameIndex++;
                }

                if (!queueEntry) {
                    console.warn(`[VideoDecoder] asset=${assetId} decoded frame with no queue metadata timestamp=${frame.timestamp}`);
                }

                // During initial prefill, stop processing once we have enough frames
                if (asset.isInitialPrefill && asset.currentPrefillIndex >= asset.initialPrefillFrames) {
                    frame.close();
                    return;
                }

                const defaultWidth = frame.displayWidth || frame.codedWidth || codedWidth;
                const defaultHeight = frame.displayHeight || frame.codedHeight || codedHeight;
                const visibleRect = frame.visibleRect || { x: 0, y: 0, width: defaultWidth, height: defaultHeight };
                const frameWidth = Math.max(1, Math.round(visibleRect.width));
                const frameHeight = Math.max(1, Math.round(visibleRect.height));
                const stride = frameWidth * bytesPerPixel;

                const codedW = frame.codedWidth || defaultWidth;
                const codedH = frame.codedHeight || defaultHeight;

                const rect = {
                    x: Math.round(visibleRect.x || 0),
                    y: Math.round(visibleRect.y || 0),
                    width: frameWidth,
                    height: frameHeight
                };

                rect.x = Math.min(Math.max(rect.x, 0), Math.max(0, codedW - frameWidth));
                rect.y = Math.min(Math.max(rect.y, 0), Math.max(0, codedH - frameHeight));

                const copyOptions = {
                    format: "RGBA",
                    rect,
                    layout: [{
                        offset: 0,
                        stride,
                        rows: frameHeight,
                        columns: frameWidth
                    }]
                };

                let requiredBytes;
                // Use stride-based size if we know allocationSize doesn't work
                if (asset.useStrideSize) {
                    requiredBytes = stride * frameHeight;
                } else {
                    try {
                        requiredBytes = frame.allocationSize(copyOptions);
                    } catch (allocationErr) {
                        if (!asset.useStrideSize) {
                            console.warn('frame.allocationSize failed, switching to stride-based size.', allocationErr);
                            asset.useStrideSize = true;
                        }
                        requiredBytes = stride * frameHeight;
                    }
                }

                if (!asset.ptr || asset.frameBytes < requiredBytes) {
                    if (asset.ptr) {
                        player.Module.HEAPU8.fill(0, asset.ptr, asset.ptr + asset.frameBytes);
                        player.Module._free(asset.ptr);
                    }

                    asset.ptr = player.Module._malloc(requiredBytes);
                    asset.frameBytes = requiredBytes;
                }

                const wasmBuffer = new Uint8Array(player.Module.HEAPU8.buffer, asset.ptr, requiredBytes);

                let copySucceeded = false;

                // Use cached copy method if already determined, otherwise test both
                if (asset.copyMethod === 'canvas') {
                    // Known to need canvas fallback
                    try {
                        const canvasPixels = copyFrameViaCanvas(frame, rect, frameWidth, frameHeight, asset);
                        wasmBuffer.set(canvasPixels);
                        copySucceeded = true;
                    } catch (fallbackError) {
                        console.error('Canvas fallback failed:', fallbackError);
                    }
                } else {
                    // Try direct copyTo first (or if method is 'direct')
                    try {
                        await frame.copyTo(wasmBuffer, copyOptions);
                        copySucceeded = true;
                        if (!asset.copyMethod) {
                            asset.copyMethod = 'direct';
                            console.log('[VideoDecoder] Using direct copyTo method');
                        }
                    } catch (err) {
                        // Only log warning on first failure
                        if (!asset.copyMethod) {
                            console.warn('VideoFrame.copyTo failed, switching to canvas fallback.', err);
                            asset.copyMethod = 'canvas';
                        }
                        try {
                            const canvasPixels = copyFrameViaCanvas(frame, rect, frameWidth, frameHeight, asset);
                            wasmBuffer.set(canvasPixels);
                            copySucceeded = true;
                        } catch (fallbackError) {
                            console.error('Canvas fallback failed:', fallbackError);
                        }
                    }
                }

                if (copySucceeded) {
                    asset.width = frameWidth;
                    asset.height = frameHeight;
                    asset.frameBytes = requiredBytes;

                    player.app.onPrefetchFrame(assetId, targetFrameIndex, asset.ptr, frameWidth, frameHeight);

                    // Trigger a render if not currently playing (for seek/scrubbing)
                    // The playback loop handles rendering during playback
                    if (player.surface && !player.playing) {
                        player.app.render(player.surface);
                    }
                } else {
                    console.error(`[VideoDecoder] Failed to copy decoded frame asset=${assetId} frame=${targetFrameIndex}`);
                    if (asset.ptr) {
                        player.Module.HEAPU8.fill(0, asset.ptr, asset.ptr + asset.frameBytes);
                        player.Module._free(asset.ptr);
                        asset.ptr = null;
                        asset.frameBytes = 0;
                    }
                }

                frame.close();

                if (!copySucceeded) {
                    return;
                }

                if (asset.isInitialPrefill) asset.currentPrefillIndex++;
            };

            const decoder = new VideoDecoder({
                output: decoderOutput,
                error: e => reject("VideoDecoder error: " + e)
            });

            decoder.configure({
                codec,
                codedWidth,
                codedHeight,
                ...(avccDescription && { description: avccDescription })
            });

            window._videoAssets = window._videoAssets || {};
            window._videoAssets[assetId] = {
                ptr,
                decoder,
                decoderOutput,
                width: codedWidth,
                height: codedHeight,
                timescale,
                fps,
                totalFrames,
                initialPrefillFrames,
                isInitialPrefill: true,
                currentPrefillIndex: 0,
                mp4boxFile,
                trackId: videoTrack.id,
                isFetching: false,
                frameBytes,
                canvas: null,
                canvasCleanup: null,
                pendingPrefetch: null,
                prefillRequested: false,
                decodeQueue: [],
                decodeQueueByTimestamp: new Map(),
                frameDuration: timescale / (fps || 30) || 1,
                frameToDecode: [],
                decodeToFrame: [],
                frameTimestamps: [],
            };

            player.app.createWebAsset(assetId, false);
            player.app.setVideoAssetInfo(assetId, totalFrames, fps, initialPrefillFrames);

            const samples = [];
            mp4boxFile.onSamples = async (id, user, sampleList) => {
                const asset = window._videoAssets?.[assetId];
                if (!asset || id !== videoTrack.id) {
                    return;
                }

                for (const sample of sampleList) {
                    const decodeIndex = samples.length;
                    const compositionTimestamp = getCompositionTimestamp(sample);
                    const timestampMicros = convertTimestampToMicros(compositionTimestamp, timescale, decodeIndex, asset.fps);

                    const normalizedSample = {
                        ...sample,
                        decodeIndex,
                        compositionTimestamp,
                        timestampMicros
                    };

                    samples.push(normalizedSample);
                }

                asset.samples = samples;
                updatePresentationTimeline(asset);

                const pending = asset.pendingPrefetch;
                if (pending && hasFramesForRange(asset, pending.start, pending.count)) {
                    asset.pendingPrefetch = null;
                    feedBatch(assetId, pending.start, pending.count);
                }

                if (!asset.prefillRequested && hasFramesForRange(asset, 0, initialPrefillFrames)) {
                    asset.prefillRequested = true;
                    feedBatch(assetId, 0, initialPrefillFrames).then(() => {
                        if (!resolved) {
                            resolved = true;
                            resolve();
                        }
                    });
                }
            };

            mp4boxFile.setExtractionOptions(videoTrack.id, null, { nbSamples: totalFrames  });
            mp4boxFile.start();
        };

        mp4boxFile.onError = e => reject("MP4Box error: " + e);
        buffer.fileStart = 0;
        mp4boxFile.appendBuffer(buffer);
        mp4boxFile.flush();
    });
}


/**
 * Sets up callback hooks for Cavalry to request video frames
 *
 * This establishes the communication channel from Cavalry (backend) to the web player (frontend).
 * When Cavalry needs frames, it calls player.Module.prefetchFrames() which triggers feedBatch().
 *
 * This creates a pull-based system where:
 * - Cavalry requests frames as needed for playback
 * - The web player decodes and delivers those frames
 * - No frames are decoded unnecessarily
 *
 * @param {Object} player - Cavalry player instance
 */
export function setupWebCodecHooks(player) {
    player.Module.prefetchFrames = (assetId, start, count) => {
        const asset = window._videoAssets?.[assetId];
        if (asset) {
            asset.isInitialPrefill = false;
        }
        feedBatch(assetId, start, count);
    };
}

function getCompositionTimestamp(sample) {
    if (typeof sample?.cts === 'number') {
        return sample.cts;
    }
    if (typeof sample?.dts === 'number') {
        return sample.dts;
    }
    return null;
}

function convertTimestampToMicros(compositionTimestamp, timescale, decodeIndex, fps) {
    if (typeof compositionTimestamp === 'number' && Number.isFinite(compositionTimestamp)) {
        return Math.round((compositionTimestamp / timescale) * 1e6);
    }

    const frameDurationMicros = fps ? Math.round(1e6 / fps) : 0;
    return decodeIndex * frameDurationMicros;
}

function updatePresentationTimeline(asset) {
    const { samples, timescale, fps } = asset;
    if (!Array.isArray(samples) || !samples.length) {
        asset.frameToDecode = [];
        asset.decodeToFrame = [];
        asset.frameTimestamps = [];
        return;
    }

    const timeline = samples.map((sample, decodeIndex) => {
        const compositionTimestamp = getCompositionTimestamp(sample);
        sample.compositionTimestamp = compositionTimestamp;
        const timestampMicros = convertTimestampToMicros(compositionTimestamp, timescale, decodeIndex, fps);
        sample.timestampMicros = timestampMicros;
        return {
            decodeIndex,
            timestampMicros,
        };
    });

    timeline.sort((a, b) => {
        if (a.timestampMicros !== b.timestampMicros) {
            return a.timestampMicros - b.timestampMicros;
        }
        return a.decodeIndex - b.decodeIndex;
    });

    const frameToDecode = [];
    const frameTimestamps = [];
    const decodeToFrame = new Array(timeline.length);

    timeline.forEach((entry, frameIndex) => {
        frameToDecode[frameIndex] = entry.decodeIndex;
        frameTimestamps[frameIndex] = entry.timestampMicros;
        decodeToFrame[entry.decodeIndex] = frameIndex;
        const sample = samples[entry.decodeIndex];
        sample.frameIndex = frameIndex;
    });

    asset.frameToDecode = frameToDecode;
    asset.decodeToFrame = decodeToFrame;
    asset.frameTimestamps = frameTimestamps;
}

function hasFramesForRange(asset, start, count) {
    if (!Number.isFinite(count) || count <= 0) {
        return false;
    }

    const { frameToDecode } = asset;
    if (!Array.isArray(frameToDecode) || frameToDecode.length === 0) {
        return false;
    }

    const endFrame = start + count - 1;
    if (frameToDecode.length <= endFrame) {
        return false;
    }

    for (let frame = start; frame <= endFrame; frame++) {
        if (frameToDecode[frame] == null) {
            return false;
        }
    }

    return true;
}

/**
 * Decodes a batch of video frames for Cavalry
 *
 * This function handles frame decoding with intelligent keyframe management:
 *
 * 1. Overlap Prevention: Checks if a similar range is already being decoded
 * 2. Keyframe Detection: Finds the nearest keyframe before the requested start
 * 3. Decoder Feeding: Submits frames to the VideoDecoder starting from the keyframe
 * 4. Selective Queueing: Only queues requested frames for transfer to Cavalry
 *
 * Example: Request frames 410-419
 * - Finds keyframe at frame 400
 * - Decodes frames 400-419 (decoder needs keyframe context)
 * - But only sends frames 410-419 to Cavalry (via decode queue)
 *
 * This enables random access seeking while maintaining decode efficiency.
 *
 * @param {string} assetId - Video asset identifier
 * @param {number} start - First frame to decode
 * @param {number} count - Number of frames to decode
 */
async function feedBatch(assetId, start, count) {
    const asset = window._videoAssets?.[assetId];
    if (!asset) {
        console.warn(`[feedBatch] Skipped: asset not found (${assetId})`);
        return;
    }

    // Check if we're already fetching this exact range or an overlapping range
    if (asset.currentFetchRange) {
        const [fetchStart, fetchEnd] = asset.currentFetchRange;
        const requestEnd = start + count - 1;
        // Check for overlap: ranges overlap if NOT (requestEnd < fetchStart OR start > fetchEnd)
        if (!(requestEnd < fetchStart || start > fetchEnd)) {
            return;
        }
    }

    const { decoder, samples, timescale, frameToDecode, decodeToFrame } = asset;
    if (!decoder || !samples || !Array.isArray(frameToDecode) || frameToDecode.length === 0) {
        console.warn(`[feedBatch] Decoder or samples unavailable for ${assetId}`);
        return;
    }

    if (!hasFramesForRange(asset, start, count)) {
        if (!asset.pendingPrefetch || asset.pendingPrefetch.start !== start || asset.pendingPrefetch.count !== count) {
            asset.pendingPrefetch = { start, count };
            if (asset.mp4boxFile) {
                try {
                    asset.mp4boxFile.flush();
                } catch (flushErr) {
                    console.warn('mp4box flush during pending prefetch failed', flushErr);
                }
            }
        }
        setTimeout(() => feedBatch(assetId, start, count), 16);
        return;
    }

    asset.pendingPrefetch = null;

    if (!Array.isArray(asset.decodeQueue)) {
        asset.decodeQueue = [];
    }

    const requestEndFrameExclusive = Math.min(start + count, frameToDecode.length);
    const framesToDeliver = new Set();
    const decodeIndicesForRequest = [];

    for (let frame = start; frame < requestEndFrameExclusive; frame++) {
        const decodeIndex = frameToDecode[frame];
        if (decodeIndex != null) {
            framesToDeliver.add(frame);
            decodeIndicesForRequest.push(decodeIndex);
        }
    }

    if (!decodeIndicesForRequest.length) {
        if (!asset.pendingPrefetch || asset.pendingPrefetch.start !== start || asset.pendingPrefetch.count !== count) {
            asset.pendingPrefetch = { start, count };
        }
        setTimeout(() => feedBatch(assetId, start, count), 16);
        return;
    }

    asset.currentFetchRange = [start, requestEndFrameExclusive - 1];

    try {
        const minDecodeIndex = Math.min(...decodeIndicesForRequest);
        const maxDecodeIndex = Math.max(...decodeIndicesForRequest);

        let keyframeIndex = minDecodeIndex;
        for (let i = minDecodeIndex; i >= 0; i--) {
            if (samples[i]?.is_sync) {
                keyframeIndex = i;
                break;
            }
        }

        const decodeEndExclusive = Math.min(maxDecodeIndex + 1, samples.length);
        let index = keyframeIndex;

        while (index < decodeEndExclusive) {
            const sample = samples[index];
            if (!sample) {
                index++;
                continue;
            }

            const frameIndexRaw = Array.isArray(decodeToFrame) ? decodeToFrame[index] : sample.frameIndex;
            const frameIndex = typeof frameIndexRaw === 'number' ? frameIndexRaw : null;
            const timestampMicros = typeof sample.timestampMicros === 'number'
                ? sample.timestampMicros
                : convertTimestampToMicros(sample.compositionTimestamp, timescale, index, asset.fps);

            const queueEntry = {
                sampleIndex: index,
                frameIndex,
                deliver: frameIndex != null && framesToDeliver.has(frameIndex),
                timestamp: timestampMicros
            };

            asset.decodeQueue.push(queueEntry);

            if (DEBUG_DECODE_QUEUE) {
                const sampleNumber = typeof sample.number === 'number' ? sample.number : 'n/a';
                console.log(`[feedBatch] asset=${assetId} queued sample=${index} (number=${sampleNumber}) frame=${frameIndex ?? 'n/a'} deliver=${queueEntry.deliver} timestamp=${timestampMicros}`);
            }

            if (asset.decodeQueueByTimestamp) {
                const existing = asset.decodeQueueByTimestamp.get(timestampMicros);
                if (Array.isArray(existing)) {
                    existing.push(queueEntry);
                } else {
                    asset.decodeQueueByTimestamp.set(timestampMicros, [queueEntry]);
                }
            }

            const chunkInit = {
                type: sample.is_sync ? "key" : "delta",
                timestamp: timestampMicros,
                data: sample.data
            };

            if (typeof sample.duration === 'number') {
                chunkInit.duration = Math.round((sample.duration / timescale) * 1e6);
            }

            const chunk = new EncodedVideoChunk(chunkInit);

            try {
                decoder.decode(chunk);
            } catch (err) {
                console.error(`[VideoDecoder] decode() failed asset=${assetId} sample=${index} frame=${frameIndex} timestamp=${timestampMicros}`, err);
            }

            index++;
        }
    } finally {
        setTimeout(() => {
            asset.currentFetchRange = null;
        }, 100);
    }
}

function buildAVCCDescription(avcC) {
    if (!avcC || !avcC.SPS || !avcC.PPS) return null;

    const sps = avcC.SPS[0]?.data;
    const pps = avcC.PPS[0]?.data;
    if (!sps || !pps) return null;

    const ext = avcC.ext instanceof Uint8Array ? avcC.ext : null;
    const extLength = ext ? ext.length : 0;

    const length = 11 + sps.length + pps.length + extLength;
    const avcc = new Uint8Array(length);

    let offset = 0;
    avcc[offset++] = 1; // configurationVersion
    avcc[offset++] = avcC.AVCProfileIndication;
    avcc[offset++] = avcC.profile_compatibility || 0;
    avcc[offset++] = avcC.AVCLevelIndication;
    avcc[offset++] = 0xFF; // lengthSizeMinusOne (usually 3)
    avcc[offset++] = 0xE1; // numOfSPS (0xE0 | 1)

    avcc[offset++] = (sps.length >> 8) & 0xFF;
    avcc[offset++] = sps.length & 0xFF;
    avcc.set(sps, offset);
    offset += sps.length;

    avcc[offset++] = 1; // numOfPPS
    avcc[offset++] = (pps.length >> 8) & 0xFF;
    avcc[offset++] = pps.length & 0xFF;
    avcc.set(pps, offset);
    offset += pps.length;

    // Append ext if present
    if (ext) {
        avcc.set(ext, offset);
    }

    return avcc;
}
