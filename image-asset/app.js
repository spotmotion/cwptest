class CavalryImageAssetPlayer {
    constructor(canvas, Module) {
        this.canvas = canvas;
        this.Module = Module;
        this.surface = null;
        this.app = null;
        this.animationFrameId = null;
        this.imageAssetId = "asset#2"; // this should match the scene's assetId

        this.canvas.addEventListener("webglcontextlost", e => {
            alert('WebGL context lost. You will need to reload the page.');
            e.preventDefault();
        }, false);

        window.addEventListener("resize", () => this.resize());
    }

    resize() {
        if (!this.app) return;

        const res = this.app.getSceneResolution();
        const maxW = window.innerWidth * 0.5;
        const maxH = window.innerHeight * 0.7;
        const scale = Math.min(maxW / res.width, maxH / res.height, 1);
        const newWidth = Math.floor(res.width * scale);
        const newHeight = Math.floor(res.height * scale);

        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        this.canvas.style.width = newWidth + "px";
        this.canvas.style.height = newHeight + "px";

        this.surface = this.Module.makeWebGLSurfaceFromElement(
            this.canvas, newWidth, newHeight
        );
        this.app.render(this.surface);
    }

    async loadScene() {
        console.log("Loading Image Asset Demo scene...");

        // Stop playback if running
        this.stop();

        // Clean up existing app
        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        try {
            // Load the scene file from the image-asset folder
            const response = await fetch('./Image Asset.cv');
            if (!response.ok) {
                throw new Error(`Failed to load scene: ${response.statusText}`);
            }

            const sceneData = await response.arrayBuffer();
            const filename = 'Image Asset.cv';

            // Write scene file to virtual filesystem
            this.Module.FS.writeFile(filename, new Uint8Array(sceneData));

            // Create new app instance with the specific scene file path
            this.app = this.Module.Cavalry.MakeWithPath(filename);

            // Set up canvas target
            this.Module.specialHTMLTargets['#' + this.canvas.id] = this.canvas;

            // Initial resize and render
            this.resize();
            this.app.render(this.surface);

            console.log("Scene loaded successfully");
            return true;
        } catch (e) {
            console.error("Error loading scene:", e);
            return false;
        }
    }

    replaceImageAsset(imageFile) {
        return this.replaceImageAssetWithId(imageFile, this.imageAssetId);
    }

    replaceImageAssetWithId(imageFile, assetId) {
        return new Promise((resolve, reject) => {
            if (!this.app) {
                reject(new Error("Cannot replace image: app not initialised"));
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    // Convert ArrayBuffer to Uint8Array
                    const imageData = new Uint8Array(e.target.result);

                    // Write the image file to the virtual filesystem
                    const virtualFileName = imageFile.name;
                    this.Module.FS.writeFile(virtualFileName, imageData);

                    console.log(`Image file written to virtual FS: ${virtualFileName}`);

                    // Use the replaceImageAsset API to update the scene with specified asset ID
                    this.app.replaceImageAsset(virtualFileName, assetId);

                    // Re-render the scene to show the new image
                    if (this.surface) {
                        this.app.render(this.surface);
                    }

                    console.log(`Image asset replaced successfully: ${assetId} -> ${virtualFileName}`);
                    resolve();
                } catch (error) {
                    console.error("Error replacing image asset:", error);
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error("Failed to read image file"));
            };

            // Read the file as ArrayBuffer
            reader.readAsArrayBuffer(imageFile);
        });
    }

    play() {
        if (!this.app) return;

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
        const currentFrame = status ? status.currentFrame : this.app.getFrame();
        const frameDisplay = document.getElementById('frameDisplay');
        const frameSlider = document.getElementById('frameSlider');

        if (frameDisplay) {
            frameDisplay.textContent = `Frame: ${currentFrame}`;
        }

        if (frameSlider) {
            frameSlider.value = currentFrame;
        }
    }
}

let player = null;


// Import and initialise the Cavalry module
async function initialiseApp() {
    try {
        console.log("Initialising Cavalry module...");

        // Dynamically import the ES6 module
        const CavalryModule = await import('../wasm-lib/CavalryWasm.js');

        // Configure and create the module instance
        const Module = await CavalryModule.default({
            locateFile: (path) => `../wasm-lib/${path}`,
            print: (text) => console.log(text),
            printErr: (text) => console.error(text),
            canvas: document.getElementById('canvas')
        });

        console.log("Cavalry module loaded");

        // initialise player
        const canvas = document.getElementById('canvas');
        player = new CavalryImageAssetPlayer(canvas, Module);

        // Set up automatic asset loading system
        window.CavalryAutoAssetLoader.setupAutoAssetLoading(Module, player);

        // Hide loading message
        document.getElementById('loading').style.display = 'none';

        // Set up UI elements
        const playButton = document.getElementById('playButton');
        const imageInput = document.getElementById('imageInput');
        const selectedFileInfo = document.getElementById('selectedImageInfo');
        const frameSlider = document.getElementById('frameSlider');
        const frameDisplay = document.getElementById('frameDisplay');
        const status = document.getElementById('status');

        status.textContent = 'Loading scene...';

        // Load the scene automatically
        const sceneLoaded = await player.loadScene();

        if (sceneLoaded) {
            status.textContent = 'Scene loaded - Ready to replace image assets';
            playButton.disabled = false;
            imageInput.disabled = false;
            frameSlider.disabled = false;

            // Set up frame slider
            const startFrame = player.app.getStartFrame();
            const endFrame = player.app.getEndFrame();
            frameSlider.min = startFrame;
            frameSlider.max = endFrame;
            frameSlider.value = startFrame;
            frameDisplay.textContent = `Frame: ${startFrame}`;

            // initialise frame display
            player.updateFrameDisplay();

            console.log("Image asset demo ready");
        } else {
            status.textContent = 'Failed to load scene';
        }

        // Set up play/stop button
        playButton.addEventListener('click', () => {
            if (!player || !player.app) return;

            player.toggle();
            playButton.textContent = player.app.isPlaying() ? 'Stop' : 'Play';
        });

        // Set up image file input
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) {
                selectedFileInfo.style.display = 'none';
                return;
            }

            // Show selected file info
            selectedFileInfo.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            selectedFileInfo.style.display = 'block';

            // Replace image asset immediately
            try {
                status.textContent = 'Replacing image asset...';
                await player.replaceImageAsset(file);
                status.textContent = `Image replaced successfully: ${file.name}`;
            } catch (error) {
                console.error("Failed to replace image:", error);
                status.textContent = `Failed to replace image: ${error.message}`;
            }
        });

        // Set up frame slider
        frameSlider.addEventListener('input', (e) => {
            const frame = parseInt(e.target.value);
            if (player && player.app) {
                player.stop();
                player.app.setFrame(frame);
                if (player.surface) {
                    player.app.render(player.surface);
                }
                player.updateFrameDisplay();
                playButton.textContent = 'Play';
            }
        });

        // Auto-play if scene was loaded successfully
        if (sceneLoaded) {
            playButton.click();
        }

    } catch (error) {
        console.error('Failed to initialise Cavalry WASM:', error);
        document.getElementById('loading').innerHTML =
            '<div style="color: #ff6b6b;">Failed to load Cavalry WebAssembly module.<br>Please check the console for details.</div>';
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseApp);
} else {
    initialiseApp();
}
