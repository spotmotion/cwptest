class CavalryPlayer {
    constructor(canvas, Module) {
        this.canvas = canvas;
        this.Module = Module;
        this.surface = null;
        this.app = null;
        this.animationFrameId = null;

        this.canvas.addEventListener("webglcontextlost", e => {
            alert('WebGL context lost. You will need to reload the page.');
            e.preventDefault();
        }, false);

        window.addEventListener("resize", () => this.resize());
    }

    resize() {
        if (!this.app) return;

        const res = this.app.getSceneResolution();
        const maxW = window.innerWidth * 0.9;  // Use 90% of window width
        const maxH = window.innerHeight * 0.7; // Use 70% of window height
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

    async loadScene(contents, filename = 'scene.cv') {
        console.log(`Loading scene: ${filename}`);

        // Stop playback if running
        this.stop();

        // Clean up existing app
        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        try {
            // Write scene file to virtual filesystem with the given filename
            this.Module.FS.writeFile(filename, new Uint8Array(contents));

            // Create new app instance with the specific scene file path
            this.app = this.Module.Cavalry.MakeWithPath(filename);

            // Set up canvas target
            this.Module.specialHTMLTargets['#' + this.canvas.id] = this.canvas;

            // Initial resize and render
            this.resize();
            this.app.render(this.surface);

            return true;
        } catch (e) {
            console.error("Error loading scene:", e);
            return false;
        }
    }

    // New playback API using native WasmPlaybackManager
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

    // Set playback mode: 0 = Accurate (default), 1 = Smooth
    setPlaybackMode(mode) {
        if (!this.app) return;
        this.app.setPlaybackMode(mode);
    }

    updateFrameDisplay(status) {
        const currentFrame = status ? status.currentFrame : this.app.getFrame();
        const frameDisplay = document.getElementById('frameDisplay');
        const frameSlider = document.getElementById('frameSlider');

        if (frameDisplay) {
            frameDisplay.textContent = `Frame: ${currentFrame}`;
        }

        if (frameSlider) {
            const startFrame = this.app.getStartFrame();
            const endFrame = this.app.getEndFrame();
            frameSlider.min = startFrame;
            frameSlider.max = endFrame;
            frameSlider.value = currentFrame;
        }
    }

    // Set to a specific frame (pauses playback)
    setFrame(frame) {
        if (!this.app) return;
        this.stop();
        this.app.setFrame(frame);
        this.app.render(this.surface);
        this.updateFrameDisplay();
    }
}

let player = null;

// Import and initialise the Cavalry module
async function initialiseApp() {
    try {
        // Dynamically import the ES6 module
        const CavalryModule = await import('../wasm-lib/CavalryWasm.js');

        // Configure and create the module instance
        const Module = await CavalryModule.default({
            locateFile: (path) => `../wasm-lib/${path}`,
            print: (text) => console.log(text),
            printErr: (text) => console.error(text),
            canvas: document.getElementById('canvas')
        });

        // Initialise player
        const canvas = document.getElementById('canvas');
        player = new CavalryPlayer(canvas, Module);

        // Hide loading message
        document.getElementById('loading').style.display = 'none';

        // Set up file input
        const sceneInput = document.getElementById('sceneInput');
        const playButton = document.getElementById('playButton');
        const frameSlider = document.getElementById('frameSlider');
        const status = document.getElementById('status');
        const selectedSceneInfo = document.getElementById('selectedSceneInfo');

        // Enable scene input now that WASM is loaded
        sceneInput.disabled = false;
        status.textContent = 'Ready - Load a .cv scene file to begin';

        sceneInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Show selected file info
            selectedSceneInfo.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            selectedSceneInfo.style.display = 'block';

            status.textContent = 'Loading scene...';
            playButton.disabled = true;

            try {
                const contents = await file.arrayBuffer();
                // Use the actual filename so multiple scenes can be loaded without conflict
                const success = await player.loadScene(contents, file.name);

                if (success) {
                    status.textContent = `Scene loaded: ${file.name}`;
                    playButton.disabled = false;
                    frameSlider.disabled = false;

                    // Initialise frame display
                    player.updateFrameDisplay();

                    // Auto-play the scene
                    playButton.click();
                } else {
                    status.textContent = 'Failed to load scene';
                }
            } catch (error) {
                console.error('Error loading scene:', error);
                status.textContent = 'Error loading scene file';
            }
        });

        // Set up play/stop button
        playButton.addEventListener('click', () => {
            if (!player || !player.app) return;

            player.toggle();
            playButton.textContent = player.app.isPlaying() ? 'Stop' : 'Play';
        });

        // Set up frame slider
        frameSlider.addEventListener('input', (e) => {
            if (!player || !player.app) return;

            const frame = parseInt(e.target.value);
            player.setFrame(frame);
            playButton.textContent = 'Play';
        });

    } catch (error) {
        console.error('Failed to initialise Cavalry WASM:', error);
        document.getElementById('loading').textContent = 'Failed to load Cavalry WebAssembly module.';
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseApp);
} else {
    initialiseApp();
}
