class CavalryCSVPlayer {
    constructor(canvas, Module) {
        this.canvas = canvas;
        this.Module = Module;
        this.surface = null;
        this.app = null;
        this.animationFrameId = null;

        // CSV configuration
        this.csvAssetId = "asset#3";

        this.canvas.addEventListener("webglcontextlost", e => {
            alert('WebGL context lost. You will need to reload the page.');
            e.preventDefault();
        }, false);

        window.addEventListener("resize", () => this.resize());
    }

    resize() {
        if (!this.app) return;

        const res = this.app.getSceneResolution();
        const maxW = window.innerWidth * 0.9;
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
        console.log("Loading CSV Demo scene...");

        // Stop playback if running
        this.stop();

        // Clean up existing app
        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        try {
            // Load the scene file from the csv folder
            const response = await fetch('./CSV Demo.cv');
            if (!response.ok) {
                throw new Error(`Failed to load scene: ${response.statusText}`);
            }

            const sceneData = await response.arrayBuffer();
            const filename = 'CSV Demo.cv';

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

    validateCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            return { valid: false, error: 'CSV must have at least 2 rows (header + data)' };
        }
        const columns = lines[0].split(',').length;
        if (columns < 2) {
            return { valid: false, error: 'CSV must have at least 2 columns' };
        }
        return { valid: true };
    }

    async replaceCSVAsset(file) {
        if (!this.app) {
            console.error("Cannot replace CSV asset: app not initialised");
            return { success: false, error: 'App not initialised' };
        }

        try {
            // Read file contents as text for validation
            const csvText = await file.text();

            // Validate CSV structure
            const validation = this.validateCSV(csvText);
            if (!validation.valid) {
                console.error("CSV validation failed:", validation.error);
                return { success: false, error: validation.error };
            }

            // Read file as ArrayBuffer for writing to virtual filesystem
            const csvData = await file.arrayBuffer();
            const filename = file.name;

            // Write to virtual filesystem
            this.Module.FS.writeFile(filename, new Uint8Array(csvData));

            // Replace the CSV asset
            this.app.replaceCSVAsset(filename, this.csvAssetId);

            // Re-render to show changes
            this.app.render(this.surface);

            console.log(`CSV asset replaced with: ${filename}`);
            return { success: true };
        } catch (e) {
            console.error("Error replacing CSV asset:", e);
            return { success: false, error: e.message };
        }
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
        if (!this.app) return;

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
}

let player = null;

// Import and initialise the Cavalry module
async function initialiseApp() {
    try {
        console.log("Initializing Cavalry WASM module...");

        // Dynamically import the ES6 module
        const CavalryModule = await import('../wasm-lib/CavalryWasm.js');

        // Configure and create the module instance
        const Module = await CavalryModule.default({
            locateFile: (path) => `../wasm-lib/${path}`,
            print: (text) => console.log(text),
            printErr: (text) => console.error(text),
            canvas: document.getElementById('canvas')
        });

        console.log("Cavalry WASM module loaded");

        // Initialise player
        const canvas = document.getElementById('canvas');
        player = new CavalryCSVPlayer(canvas, Module);

        // Set up automatic asset loading system
        window.CavalryAutoAssetLoader.setupAutoAssetLoading(Module, player);

        // Hide loading message
        document.getElementById('loading').style.display = 'none';

        // Set up UI elements
        const playButton = document.getElementById('playButton');
        const csvInput = document.getElementById('csvInput');
        const selectedCSVInfo = document.getElementById('selectedCSVInfo');
        const frameSlider = document.getElementById('frameSlider');
        const status = document.getElementById('status');

        status.textContent = 'Loading scene...';

        // Load the scene automatically
        const sceneLoaded = await player.loadScene();

        // Set up play/stop button
        playButton.addEventListener('click', () => {
            if (!player || !player.app) return;

            player.toggle();
            playButton.textContent = player.app.isPlaying() ? 'Stop' : 'Play';
        });

        if (sceneLoaded) {
            status.textContent = 'Scene loaded - CSV will auto-load';
            playButton.disabled = false;
            csvInput.disabled = false;
            frameSlider.disabled = false;

            // Initialise frame display
            player.updateFrameDisplay();

            // Auto-play
            playButton.click();
        } else {
            status.textContent = 'Failed to load scene';
        }

        // Set up CSV file input
        csvInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Show selected file info
            selectedCSVInfo.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            selectedCSVInfo.style.display = 'block';

            status.textContent = 'Validating and loading CSV...';

            const result = await player.replaceCSVAsset(file);

            if (result.success) {
                status.textContent = `CSV loaded: ${file.name}`;
            } else {
                status.textContent = `Error: ${result.error}`;
                selectedCSVInfo.textContent = `Failed: ${result.error}`;
            }
        });

        // Set up frame slider
        frameSlider.addEventListener('input', (e) => {
            if (!player || !player.app) return;

            const frame = parseInt(e.target.value);
            player.app.setFrame(frame);
            player.app.render(player.surface);
            player.updateFrameDisplay();
        });

        // Set up download example CSV button
        const downloadCSV = document.getElementById('downloadCSV');
        downloadCSV.addEventListener('click', () => {
            const link = document.createElement('a');
            link.href = './Assets/City Popoulation - Sheet1.csv';
            link.download = 'City Population - Sheet1.csv';
            link.click();
        });

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
