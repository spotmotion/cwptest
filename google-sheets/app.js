class CavalryGoogleSheetsPlayer {
    constructor(canvas, Module) {
        this.canvas = canvas;
        this.Module = Module;
        this.surface = null;
        this.app = null;
        this.animationFrameId = null;

        // Google Sheets configuration
        this.googleSheetUrl = "https://docs.google.com/spreadsheets/d/1rVlarBTepZjU8XIMyLARwJs_YV3rv6yILOvs0HBsBXk/edit?gid=0#gid=0";
        this.assetId = "asset#2";

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
        console.log("Loading Google Sheet Demo scene...");
        
        // Stop playback if running
        this.stop();
        
        // Clean up existing app
        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        try {
            // Load the scene file from the google-sheets folder
            const response = await fetch('./Google Sheet Demo.cv');
            if (!response.ok) {
                throw new Error(`Failed to load scene: ${response.statusText}`);
            }
            
            const sceneData = await response.arrayBuffer();
            const filename = 'Google Sheet Demo.cv';
            
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

    async loadGoogleSheetData() {
        if (!this.app) {
            console.error("Cannot load Google Sheet data: app not initialised");
            return false;
        }

        try {
            console.log("Loading Google Sheet data...", this.googleSheetUrl);
            
            // Use the new Google Sheets API
            this.app.replaceGoogleSheet(this.googleSheetUrl, this.assetId);
            
            // Give it a moment for the async fetch to complete, then render and start playing
            // Note: In a real implementation, you might want to add a callback
            // or event system to know when the data has loaded
            setTimeout(() => {
                if (this.app && this.surface) {
                    this.app.render(this.surface);
                    console.log("Rendered with updated Google Sheet data");
                    
                    // Automatically start playback after data loads
                    if (!this.app.isPlaying()) {
                        this.play();
                        console.log("Auto-started playback after data load");
                    }
                }
            }, 2000); // Wait 2 seconds for fetch to complete
            
            return true;
        } catch (e) {
            console.error("Error loading Google Sheet data:", e);
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
        const CavalryModule = await import('/CavalryWasm.js');
        
        // Configure and create the module instance
        const Module = await CavalryModule.default({
            locateFile: (path) => `/wasm-lib/${path}`,
            print: (text) => console.log(text),
            printErr: (text) => console.error(text),
            canvas: document.getElementById('canvas')
        });
        
        console.log("Cavalry WASM module loaded");
        
        // initialise player
        const canvas = document.getElementById('canvas');
        player = new CavalryGoogleSheetsPlayer(canvas, Module);
        
        // Hide loading message
        document.getElementById('loading').style.display = 'none';
        
        // Set up UI elements
        const playButton = document.getElementById('playButton');
        const reloadButton = document.getElementById('reloadButton');
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
            status.textContent = 'Scene loaded';
            playButton.disabled = false;
            reloadButton.disabled = false;
            frameSlider.disabled = false;
            
            // initialise frame display
            player.updateFrameDisplay();
            
            playButton.click();
        } else {
            status.textContent = 'Failed to load scene';
        }
        
        // Set up reload button
        reloadButton.addEventListener('click', async () => {
            if (!player || !player.app) return;
            
            reloadButton.disabled = true;
            reloadButton.textContent = 'Reloading...';
            status.textContent = 'Reloading Google Sheet data...';
            
            const success = await player.loadGoogleSheetData();
            
            reloadButton.disabled = false;
            reloadButton.textContent = 'Reload Sheet Data';
            
            if (success) {
                status.textContent = 'Google Sheet data reloaded successfully';
                
                // Update UI after auto-play starts
                setTimeout(() => {
                    if (player.app && player.app.isPlaying()) {
                        playButton.textContent = 'Stop';
                        status.textContent = 'Playing with updated Google Sheet data';
                    }
                }, 2500); // Slightly after the data load timeout
            } else {
                status.textContent = 'Failed to reload Google Sheet data';
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