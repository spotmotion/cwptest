class CavalryInteractivePlayer {
    constructor(canvas, Module) {
        this.canvas = canvas;
        this.Module = Module;
        this.surface = null;
        this.app = null;
        this.animationFrameId = null;
        this.isDragging = false;

        this.canvas.addEventListener("webglcontextlost", e => {
            alert('WebGL context lost. You will need to reload the page.');
            e.preventDefault();
        }, false);

        window.addEventListener("resize", () => this.resize());
        this.setupMouseInteraction();
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
        console.log("Loading Interactivity Demo scene...");

        // Stop playback if running
        this.stop();

        // Clean up existing app
        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        try {
            // Load the scene file
            const response = await fetch('./rig-control.cv');
            if (!response.ok) {
                throw new Error(`Failed to load scene: ${response.statusText}`);
            }

            const sceneData = await response.arrayBuffer();
            const filename = 'rig-control.cv';

            // Write scene file to virtual filesystem
            this.Module.FS.writeFile(filename, new Uint8Array(sceneData));

            // Create new app instance
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

    setupMouseInteraction() {
        // Mouse move for coordinate display
        this.canvas.addEventListener('mousemove', (e) => {
            const canvasCoords = this.getCanvasCoordinates(e);
            const cavalryCoords = this.canvasToCalvaryCoordinates(canvasCoords);

            // Update coordinate displays
            document.getElementById('canvasCoords').textContent = `${canvasCoords.x}, ${canvasCoords.y}`;
            document.getElementById('cavalryCoords').textContent = `${cavalryCoords.x.toFixed(1)}, ${cavalryCoords.y.toFixed(1)}`;
        });

        // Mouse down to start dragging
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.handleMouseInteraction(e);
        });

        // Mouse move while dragging
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.handleMouseInteraction(e);
            }
        });

        // Mouse up to stop dragging
        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Mouse leave to stop dragging
        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });

        // Click handling
        this.canvas.addEventListener('click', (e) => {
            this.handleMouseInteraction(e);
        });
    }

    getCanvasCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        return { x: Math.round(x), y: Math.round(y) };
    }

    canvasToCalvaryCoordinates(canvasCoords) {
        if (!this.app) return { x: 0, y: 0 };

        const res = this.app.getSceneResolution();
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;

        // Convert canvas coordinates to scene coordinates
        const sceneX = (canvasCoords.x / canvasWidth) * res.width;
        const sceneY = (canvasCoords.y / canvasHeight) * res.height;

        // Convert to Cavalry's Cartesian coordinate system (center = 0,0)
        const cavalryX = sceneX - (res.width / 2);
        const cavalryY = (res.height / 2) - sceneY; // Flip Y axis for Cartesian

        return { x: cavalryX, y: cavalryY };
    }

    handleMouseInteraction(event) {
        if (!this.app) return;

        const canvasCoords = this.getCanvasCoordinates(event);
        const cavalryCoords = this.canvasToCalvaryCoordinates(canvasCoords);

        // Set the falloff position
        this.app.setAttribute("null#4", "position", [cavalryCoords.x, cavalryCoords.y]);

        // Update displays
        document.getElementById('falloffX').textContent = cavalryCoords.x.toFixed(1);
        document.getElementById('falloffY').textContent = cavalryCoords.y.toFixed(1);

        // Re-render
        if (this.surface) {
            this.app.render(this.surface);
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

            this.app.tick(this.surface, timestamp);
            this.animationFrameId = requestAnimationFrame(tick);
        };

        this.animationFrameId = requestAnimationFrame(tick);
    }
}

// Initialize the application
let player = null;

async function initialiseApp() {
    try {
        console.log("Initialising Cavalry WASM module...");

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

        // Initialize player
        const canvas = document.getElementById('canvas');
        player = new CavalryInteractivePlayer(canvas, Module);

        // Set up automatic asset loading system
        window.CavalryAutoAssetLoader.setupAutoAssetLoading(Module, player);

        // Hide loading message
        document.getElementById('loading').style.display = 'none';

        // Set up UI elements
        const playButton = document.getElementById('playButton');
        const status = document.getElementById('status');

        status.textContent = 'Loading scene...';

        // Load the scene automatically
        const sceneLoaded = await player.loadScene();

        if (sceneLoaded) {
            status.textContent = 'Scene loaded - Click and drag on the canvas to interact';
            playButton.disabled = false;

            console.log("Interactivity demo ready");
        } else {
            status.textContent = 'Failed to load scene';
        }

        // Set up play/stop button
        playButton.addEventListener('click', () => {
            if (!player || !player.app) return;

            player.toggle();
            playButton.textContent = player.app.isPlaying() ? 'Stop' : 'Play';
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

// Start initialisation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseApp);
} else {
    initialiseApp();
}
