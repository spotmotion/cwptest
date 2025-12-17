import { loadWebCodecVideoAsset, setupWebCodecHooks } from './webcodec-helper.js';

const SCENE_FILENAME = 'Video Asset.cv';
const VIDEO_ASSET_ID = 'asset#2';
const DEFAULT_VIDEO_PATH = './Assets/demoVideo.mov';

class CavalryVideoAssetPlayer {
    constructor(canvas, Module) {
        this.canvas = canvas;
        this.Module = Module;
        this.surface = null;
        this.app = null;
        this.animationFrameId = null;
        this.videoAssetId = VIDEO_ASSET_ID;
        this.defaultVideoPath = DEFAULT_VIDEO_PATH;
        this.videoReady = false;
        this.hooksInstalled = false;

        this.canvas.addEventListener('webglcontextlost', (event) => {
            alert('WebGL context lost. Reload the page.');
            event.preventDefault();
        }, false);

        window.addEventListener('resize', () => this.resize());
    }

    async loadScene() {
        console.log('Loading Video Asset demo scene…');

        this.stop();

        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        const response = await fetch(`./${SCENE_FILENAME}`);
        if (!response.ok) {
            throw new Error(`Failed to load scene file: ${response.status} ${response.statusText}`);
        }

        const sceneData = await response.arrayBuffer();
        this.Module.FS.writeFile(SCENE_FILENAME, new Uint8Array(sceneData));

        this.app = this.Module.Cavalry.MakeWithPath(SCENE_FILENAME);
        this.Module.specialHTMLTargets[`#${this.canvas.id}`] = this.canvas;

        this.resize();
        this.renderCurrentFrame();

        this.videoReady = false;
        return true;
    }

    async prepareVideo(videoSource = this.defaultVideoPath) {
        if (!this.app) {
            throw new Error('Cannot prepare video before the scene is loaded.');
        }

        if (!this.hooksInstalled) {
            setupWebCodecHooks(this);
            this.hooksInstalled = true;
        }

        // Dispose any previously loaded video asset for this ID
        this.disposeVideoAsset();

        await loadWebCodecVideoAsset(this, this.videoAssetId, videoSource);

        this.videoReady = true;
        this.app.setFrame(this.app.getStartFrame());
        this.renderCurrentFrame();
        this.updateFrameDisplay();
    }

    disposeVideoAsset() {
        const assets = window._videoAssets;
        if (!assets) return;

        const asset = assets[this.videoAssetId];
        if (!asset) return;

        try {
            if (asset.decoder?.state !== 'closed') {
                asset.decoder.close();
            }
        } catch (error) {
            console.warn('Failed to close previous decoder:', error);
        }

        if (asset.ptr) {
            const frameBytes = asset.frameBytes || (asset.width * asset.height * 4);
            this.Module.HEAPU8.fill(0, asset.ptr, asset.ptr + frameBytes);
            this.Module._free(asset.ptr);
            asset.ptr = null;
            asset.frameBytes = 0;
        }

        if (asset.canvasCleanup) {
            try {
                asset.canvasCleanup();
            } catch (cleanupError) {
                console.warn('Failed to remove fallback canvas:', cleanupError);
            }
        }

        asset.canvas = null;
        asset.canvasCleanup = null;
        asset.pendingPrefetch = null;
        asset.prefillRequested = false;
        asset.decodeQueue = [];

        delete assets[this.videoAssetId];
        this.videoReady = false;
    }

    resize() {
        if (!this.app) return;

        const res = this.app.getSceneResolution();
        const maxW = window.innerWidth * 0.65;
        const maxH = window.innerHeight * 0.75;
        const scale = Math.min(maxW / res.width, maxH / res.height, 1);
        const newWidth = Math.floor(res.width * scale);
        const newHeight = Math.floor(res.height * scale);

        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        this.canvas.style.width = `${newWidth}px`;
        this.canvas.style.height = `${newHeight}px`;

        this.surface = this.Module.makeWebGLSurfaceFromElement(
            this.canvas,
            newWidth,
            newHeight
        );

        this.renderCurrentFrame();
    }

    renderCurrentFrame() {
        if (this.app && this.surface) {
            this.app.render(this.surface);
        }
    }

    play() {
        if (!this.app || !this.videoReady) return;

        this.app.play();
        console.log(`Starting playback at ${this.app.getFPS()} FPS`);
        this.runPlaybackLoop();
    }

    stop() {
        if (this.app) {
            this.app.stop();
        }
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    toggle() {
        if (!this.app) return;

        if (this.app.isPlaying()) {
            this.stop();
        } else {
            this.play();
        }
    }

    runPlaybackLoop() {
        const tick = (timestamp) => {
            if (!this.app || !this.app.isPlaying()) return;

            const status = this.app.tick(this.surface, timestamp);

            if (status.frameChanged) {
                this.updateFrameDisplay(status);
            }

            this.animationFrameId = requestAnimationFrame(tick);
        };

        this.animationFrameId = requestAnimationFrame(tick);
    }

    updateFrameDisplay(status) {
        if (!this.app) return;

        const currentFrame = status ? status.currentFrame : this.app.getFrame();
        const frameDisplay = document.getElementById('frameDisplay');
        const frameSlider = document.getElementById('frameSlider');

        if (frameDisplay) {
            frameDisplay.textContent = `Frame: ${currentFrame}`;
        }

        if (frameSlider && !frameSlider.disabled) {
            frameSlider.value = currentFrame;
        }
    }
}

let player = null;

async function initialiseApp() {
    const status = document.getElementById('status');
    const playButton = document.getElementById('playButton');
    const frameSlider = document.getElementById('frameSlider');
    const prevFrameButton = document.getElementById('prevFrameButton');
    const nextFrameButton = document.getElementById('nextFrameButton');

    try {
        const CavalryModule = await import('../wasm-lib/CavalryWasm.js');
        const Module = await CavalryModule.default({
            locateFile: (path) => `../wasm-lib/${path}`,
            print: (text) => console.log(text),
            printErr: (text) => console.error(text),
            canvas: document.getElementById('canvas')
        });

        document.getElementById('loading').style.display = 'none';

        player = new CavalryVideoAssetPlayer(document.getElementById('canvas'), Module);
        window.player = player;

        status.textContent = 'Loading scene…';
        await player.loadScene();

        status.textContent = 'Decoding video…';
        await player.prepareVideo();
        status.textContent = 'Video ready. Use the controls to play or scrub.';

        const startFrame = player.app.getStartFrame();
        const endFrame = player.app.getEndFrame();
        frameSlider.min = startFrame;
        frameSlider.max = endFrame;
        frameSlider.value = startFrame;
        frameSlider.disabled = false;

        playButton.disabled = false;
        prevFrameButton.disabled = false;
        nextFrameButton.disabled = false;

        playButton.addEventListener('click', () => {
            if (!player || !player.videoReady) return;

            player.toggle();
            playButton.textContent = player.app.isPlaying() ? 'Stop' : 'Play';
        });

        frameSlider.addEventListener('input', (event) => {
            if (!player || !player.app) return;

            const targetFrame = Number(event.target.value);
            player.app.setFrame(targetFrame);
            player.renderCurrentFrame();
            player.updateFrameDisplay();
        });

        const stepFrame = (direction) => {
            if (!player || !player.app || !player.videoReady) return;

            player.stop();
            playButton.textContent = 'Play';

            const current = player.app.getFrame();
            const start = player.app.getStartFrame();
            const end = player.app.getEndFrame();
            let target = current + direction;

            if (target < start) target = start;
            if (target > end) target = end;

            player.app.setFrame(target);
            player.renderCurrentFrame();
            player.updateFrameDisplay();
        };

        prevFrameButton.addEventListener('click', () => stepFrame(-1));
        nextFrameButton.addEventListener('click', () => stepFrame(1));

        if (player.videoReady) {
            playButton.click();
        }
    } catch (error) {
        console.error('Failed to initialise:', error);
        status.textContent = `Failed to load: ${error.message}. Ensure demoVideo.mov is in video-asset/Assets/`;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseApp);
} else {
    initialiseApp();
}
