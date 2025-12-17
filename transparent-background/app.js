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
            const startFrame = this.app.getStartFrame();
            const endFrame = this.app.getEndFrame();
            frameSlider.min = startFrame;
            frameSlider.max = endFrame;
            frameSlider.value = currentFrame;
        }
    }
}

let player = null;

// Background configurations
const backgrounds = {
    gradient1: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    gradient2: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)',
    gradient3: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    solid1: '#1a1a1a',
    solid2: '#f0f0f0',
    animated: 'linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)'
};

let animatedBgInterval = null;

function setBackground(bgType) {
    // Clear any existing animation
    if (animatedBgInterval) {
        clearInterval(animatedBgInterval);
        animatedBgInterval = null;
    }

    const body = document.body;

    if (bgType === 'animated') {
        // Create animated gradient effect
        body.style.background = backgrounds.animated;
        body.style.backgroundSize = '400% 400%';
        body.style.animation = 'gradient 15s ease infinite';

        // Add animation keyframes if not already present
        if (!document.querySelector('#gradientAnimation')) {
            const style = document.createElement('style');
            style.id = 'gradientAnimation';
            style.textContent = `
                @keyframes gradient {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
            `;
            document.head.appendChild(style);
        }
    } else {
        body.style.animation = 'none';
        body.style.background = backgrounds[bgType];
        body.style.backgroundAttachment = 'fixed';
        body.style.backgroundSize = 'cover';
    }
}

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

        // initialise player
        const canvas = document.getElementById('canvas');
        player = new CavalryPlayer(canvas, Module);

        // Hide loading message
        document.getElementById('loading').style.display = 'none';

        // Load the "Over and Over.cv" scene automatically
        const status = document.getElementById('status');
        const playButton = document.getElementById('playButton');
        const frameSlider = document.getElementById('frameSlider');

        status.textContent = 'Loading scene...';

        try {
            // Fetch the scene file
            const response = await fetch('Over and Over.cv');
            if (!response.ok) {
                throw new Error(`Failed to fetch scene: ${response.statusText}`);
            }

            const contents = await response.arrayBuffer();
            const success = await player.loadScene(contents, 'Over and Over.cv');

            if (success) {
                status.textContent = 'Scene loaded: Over and Over.cv';
                playButton.disabled = false;
                frameSlider.disabled = false;

                // initialise frame display
                player.updateFrameDisplay();

                // Auto-play the scene
                player.play();
                playButton.textContent = 'Stop';
            } else {
                status.textContent = 'Failed to load scene';
            }
        } catch (error) {
            console.error('Error loading scene:', error);
            status.textContent = 'Error loading scene file';
        }

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
            player.stop();
            player.app.setFrame(frame);
            player.app.render(player.surface);
            player.updateFrameDisplay();
            playButton.textContent = 'Play';
        });

        // Set up background options
        const bgOptions = document.querySelectorAll('.bg-option');
        bgOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                // Remove active class from all options
                bgOptions.forEach(opt => opt.classList.remove('active'));
                // Add active class to clicked option
                e.target.classList.add('active');
                // Set the background
                setBackground(e.target.dataset.bg);
            });
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
