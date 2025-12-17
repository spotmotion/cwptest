class CavalryTextEditingPlayer {
    constructor(canvas, Module) {
        this.canvas = canvas;
        this.Module = Module;
        this.surface = null;
        this.app = null;
        this.animationFrameId = null;
        this.textNodePath = "textShape#1.text";
        this.colorNodePath = "textShape#1.material.materialColor";
        
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
        const maxH = window.innerHeight * 0.6;
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
        console.log("Loading Text Editing Demo scene...");
        
        // Stop playback if running
        this.stop();
        
        // Clean up existing app
        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        try {
            // Load the scene file from the text-editing folder
            const response = await fetch('./Text Editing.cv');
            if (!response.ok) {
                throw new Error(`Failed to load scene: ${response.statusText}`);
            }
            
            const sceneData = await response.arrayBuffer();
            const filename = 'Text Editing.cv';
            
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

    getCurrentText() {
        if (!this.app) {
            console.error("Cannot get text: app not initialized");
            return "";
        }

        try {
            const nodeId = "textShape#1";
            const attrId = "text";

            const textValue = this.app.getAttribute(nodeId, attrId);

            return textValue || "Enter Your Text";
        } catch (e) {
            console.error("Error getting text:", e);
            // Fallback to default scene text
            return "Enter Your Text";
        }
    }

    setCurrentText(newText) {
        if (!this.app) {
            console.error("Cannot set text: app not initialized");
            return false;
        }

        try {
            // Parse the node path to use with individual attribute methods
            const parts = this.textNodePath.split('.');
            const nodeId = parts[0]; // "textShape#1"
            const attrId = parts[1]; // "text"
            
            this.app.setAttribute(nodeId, attrId, newText);
            
            // Render the scene to update the display
            if (this.surface) {
                this.app.render(this.surface);
            }
            return true;
        } catch (e) {
            console.error("Error setting text:", e);
            return false;
        }
    }

    getCurrentColor() {
        if (!this.app) {
            console.error("Cannot get color: app not initialized");
            return "#ffffff";
        }

        try {
            const nodeId = "textShape#1";
            const attrId = "material.materialColor";

            const colorValue = this.app.getAttribute(nodeId, attrId);

            // Convert color object to hex (values are 0-255)
            if (colorValue && typeof colorValue === 'object') {
                const r = Math.round(colorValue.r !== undefined ? colorValue.r : 255);
                const g = Math.round(colorValue.g !== undefined ? colorValue.g : 255);
                const b = Math.round(colorValue.b !== undefined ? colorValue.b : 255);
                return this.rgbToHex(r, g, b);
            }
            
            return "#ffffff";
        } catch (e) {
            console.error("Error getting color:", e);
            // Return a default color
            return "#ffffff";
        }
    }

    setCurrentColor(hexColor) {
        if (!this.app) {
            console.error("Cannot set color: app not initialized");
            return false;
        }

        try {
            // Convert hex to RGB
            const rgb = this.hexToRgb(hexColor);
            if (!rgb) {
                console.error("Invalid hex color:", hexColor);
                return false;
            }
            
            // Parse the node path
            const nodeId = "textShape#1";
            const attrId = "material.materialColor";
            
            this.app.setAttribute(nodeId, attrId, {r: rgb.r, g: rgb.g, b: rgb.b, a: 255});
            
            // Render the scene to update the display
            if (this.surface) {
                this.app.render(this.surface);
            }
            return true;
        } catch (e) {
            console.error("Error setting color:", e);
            return false;
        }
    }

    hexToRgb(hex) {
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Parse hex values
        if (hex.length === 3) {
            // Short form like "f00"
            hex = hex.split('').map(c => c + c).join('');
        }
        
        if (hex.length !== 6) {
            return null;
        }
        
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return { r, g, b };
    }

    rgbToHex(r, g, b) {
        const toHex = (n) => {
            const hex = Math.round(Math.min(255, Math.max(0, n))).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return '#' + toHex(r) + toHex(g) + toHex(b);
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
        
        // Initialize player
        const canvas = document.getElementById('canvas');
        player = new CavalryTextEditingPlayer(canvas, Module);
        
        // Hide loading message
        document.getElementById('loading').style.display = 'none';
        
        // Set up UI elements
        const playButton = document.getElementById('playButton');
        const restartButton = document.getElementById('restartButton');
        const textInput = document.getElementById('textInput');
        const colorPicker = document.getElementById('colorPicker');
        const colorHex = document.getElementById('colorHex');
        const frameSlider = document.getElementById('frameSlider');
        const status = document.getElementById('status');

        status.textContent = 'Loading scene...';

        // Load the scene automatically
        const sceneLoaded = await player.loadScene();
        
        if (sceneLoaded) {
            status.textContent = 'Scene loaded - Ready to edit text and color';
            playButton.disabled = false;
            restartButton.disabled = false;
            textInput.disabled = false;
            frameSlider.disabled = false;
            colorPicker.disabled = false;
            colorHex.disabled = false;
            
            // Get the initial text value and populate input
            const currentText = player.getCurrentText();
            textInput.value = currentText;
            
            // Get the initial color value and populate color controls
            const currentColor = player.getCurrentColor();
            colorPicker.value = currentColor;
            colorHex.value = currentColor;
            
            // Initialize frame display
            player.updateFrameDisplay();
        } else {
            status.textContent = 'Failed to load scene';
        }
        
        // Helper function to update text
        function updateText(newText) {
            if (!player || !player.app) return;
            
            // Update the scene
            if (player.setCurrentText(newText)) {
                // Success feedback
                console.log('Text updated successfully');
            } else {
                status.textContent = 'Failed to update text';
            }
        }
        
        // Set up play/stop button
        playButton.addEventListener('click', () => {
            if (!player || !player.app) return;

            player.toggle();
            playButton.textContent = player.app.isPlaying() ? 'Stop' : 'Play';
        });

        // Set up restart button
        restartButton.addEventListener('click', () => {
            if (!player || !player.app) return;

            const wasPlaying = player.app.isPlaying();
            player.stop();
            player.app.setFrame(0);
            player.app.render(player.surface);
            player.updateFrameDisplay();
            if (wasPlaying) {
                player.play();
            }
        });

        // Set up text input
        textInput.addEventListener('input', () => {
            updateText(textInput.value);
        });
        
        // Helper function to update color and sync inputs
        function updateColor(newColor, sourceInput) {
            if (!player || !player.app) return;
            
            // Validate hex color
            if (!newColor.match(/^#[0-9A-Fa-f]{6}$/)) {
                // Try to fix common issues
                if (newColor.match(/^[0-9A-Fa-f]{6}$/)) {
                    newColor = '#' + newColor;
                } else if (newColor.match(/^#[0-9A-Fa-f]{3}$/)) {
                    // Expand short form
                    newColor = '#' + newColor.slice(1).split('').map(c => c + c).join('');
                } else {
                    console.error("Invalid color format:", newColor);
                    return;
                }
            }
            
            // Update the scene
            if (player.setCurrentColor(newColor)) {
                // Sync the other input field
                if (sourceInput === colorPicker) {
                    colorHex.value = newColor;
                } else if (sourceInput === colorHex) {
                    colorPicker.value = newColor;
                }
            } else {
                status.textContent = 'Failed to update color';
            }
        }
        
        // Set up color picker change handler
        colorPicker.addEventListener('input', () => {
            updateColor(colorPicker.value, colorPicker);
        });
        
        // Set up hex input change handler
        colorHex.addEventListener('input', () => {
            const hexValue = colorHex.value.trim();
            if (hexValue) {
                updateColor(hexValue, colorHex);
            }
        });
        
        // Also handle blur event for hex input (when user finishes typing)
        colorHex.addEventListener('blur', () => {
            const hexValue = colorHex.value.trim();
            if (hexValue) {
                // Try to clean up the value
                let cleanHex = hexValue;
                if (!cleanHex.startsWith('#')) {
                    cleanHex = '#' + cleanHex;
                }
                colorHex.value = cleanHex;
                updateColor(cleanHex, colorHex);
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
        
        // Auto-play if scene was loaded successfully
        if (sceneLoaded) {
            playButton.click();
        }
        
    } catch (error) {
        console.error('Failed to initialize Cavalry WASM:', error);
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