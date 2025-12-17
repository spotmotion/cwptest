class CavalrySaveImagePlayer {
    constructor(canvas, Module) {
        this.canvas = canvas;
        this.Module = Module;
        this.surface = null;
        this.app = null;
        
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
        console.log("Loading Save Image Demo scene...");
        
        // Clean up existing app
        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        try {
            // Load the scene file from the save-image folder
            const response = await fetch('./Export Image.cv');
            if (!response.ok) {
                throw new Error(`Failed to load scene: ${response.statusText}`);
            }
            
            const sceneData = await response.arrayBuffer();
            const filename = 'Export Image.cv';
            
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

    async saveFullSizeImage(format = 'png') {
        if (!this.app) {
            throw new Error("Cannot save image: app not initialised");
        }

        try {
            const res = this.app.getSceneResolution();
            console.log(`Rendering full-size image: ${res.width}x${res.height}`);
            
            // Store original canvas dimensions
            const originalWidth = this.canvas.width;
            const originalHeight = this.canvas.height;
            const originalStyleWidth = this.canvas.style.width;
            const originalStyleHeight = this.canvas.style.height;
            
            // Temporarily resize the canvas to full resolution
            this.canvas.width = res.width;
            this.canvas.height = res.height;
            this.canvas.style.width = res.width + 'px';
            this.canvas.style.height = res.height + 'px';
            
            // Create full-size surface and render
            const fullSizeSurface = this.Module.makeWebGLSurfaceFromElement(
                this.canvas, res.width, res.height
            );
            this.app.render(fullSizeSurface);
            
            // Create offscreen canvas to capture the image
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = res.width;
            offscreenCanvas.height = res.height;
            const ctx = offscreenCanvas.getContext('2d');
            
            // Draw the WebGL canvas to the offscreen canvas
            ctx.drawImage(this.canvas, 0, 0, res.width, res.height);
            
            // Convert to blob
            const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
            const blob = await new Promise(resolve => {
                offscreenCanvas.toBlob(resolve, mimeType, format === 'jpeg' ? 0.95 : 1.0);
            });
            
            // Restore original canvas dimensions
            this.canvas.width = originalWidth;
            this.canvas.height = originalHeight;
            this.canvas.style.width = originalStyleWidth;
            this.canvas.style.height = originalStyleHeight;
            
            // Re-render at original size
            this.surface = this.Module.makeWebGLSurfaceFromElement(
                this.canvas, originalWidth, originalHeight
            );
            this.app.render(this.surface);
            
            // Create download link
            const url = URL.createObjectURL(blob);
            const fileName = `cavalry-export.${format}`;
            
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Clean up
            URL.revokeObjectURL(url);
            
            console.log(`Image saved: ${fileName} (${res.width}x${res.height})`);
            return fileName;
        } catch (error) {
            console.error("Error saving full-size image:", error);
            throw error;
        }
    }

    updateResolutionInfo() {
        if (!this.app) return;
        
        const res = this.app.getSceneResolution();
        const resolutionInfo = document.getElementById('resolutionInfo');
        if (resolutionInfo) {
            resolutionInfo.textContent = `Resolution: ${res.width} × ${res.height}`;
        }
    }

    setSceneColor(hexColor) {
        if (!this.app) return;
        
        // Convert hex to RGB
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        
        // Set the material colour
        this.app.setAttribute("basicShape#5", "material.materialColor", {r, g, b, a: 255});
        
        // Re-render
        if (this.surface) {
            this.app.render(this.surface);
        }
    }

    setRandomSeed(seed) {
        if (!this.app) return;
        
        // Set the random seed
        this.app.setAttribute("random#1", "seed", seed);
        
        // Re-render
        if (this.surface) {
            this.app.render(this.surface);
        }
    }

    getSceneColor() {
        if (!this.app) return '#000000';
        
        const color = this.app.getAttribute("basicShape#5", "material.materialColor");
        
        // Convert to hex
        const toHex = (n) => {
            const hex = Math.round(Math.min(255, Math.max(0, n))).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        
        return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
    }

    getRandomSeed() {
        if (!this.app) return 1;
        return this.app.getAttribute("random#1", "seed");
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
        
        // initialise player
        const canvas = document.getElementById('canvas');
        player = new CavalrySaveImagePlayer(canvas, Module);
        
        // Set up automatic asset loading system
        window.CavalryAutoAssetLoader.setupAutoAssetLoading(Module, player);
        
        // Hide loading message
        document.getElementById('loading').style.display = 'none';
        
        // Set up UI elements
        const formatSelect = document.getElementById('formatSelect');
        const saveImageButton = document.getElementById('saveImageButton');
        const colorPicker = document.getElementById('colorPicker');
        const colorHex = document.getElementById('colorHex');
        const seedInput = document.getElementById('seedInput');
        const randomiseSeedButton = document.getElementById('randomiseSeedButton');
        const status = document.getElementById('status');

        status.textContent = 'Loading scene...';

        // Load the scene automatically
        const sceneLoaded = await player.loadScene();
        
        if (sceneLoaded) {
            status.textContent = 'Scene loaded - Ready to export images';
            formatSelect.disabled = false;
            saveImageButton.disabled = false;
            colorPicker.disabled = false;
            colorHex.disabled = false;
            seedInput.disabled = false;
            randomiseSeedButton.disabled = false;
            
            // Update resolution info
            player.updateResolutionInfo();
            
            // initialise with current values from scene
            const currentColor = player.getSceneColor();
            colorPicker.value = currentColor;
            colorHex.value = currentColor;
            
            const currentSeed = player.getRandomSeed();
            seedInput.value = currentSeed;
            
            console.log("Save image demo ready");
        } else {
            status.textContent = 'Failed to load scene';
        }
        
        // Set up color picker
        colorPicker.addEventListener('input', (e) => {
            const color = e.target.value;
            colorHex.value = color;
            if (player && player.app) {
                player.setSceneColor(color);
            }
        });
        
        // Set up color hex input
        colorHex.addEventListener('input', (e) => {
            const color = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                colorPicker.value = color;
                if (player && player.app) {
                    player.setSceneColor(color);
                }
            }
        });
        
        // Set up seed input
        seedInput.addEventListener('input', (e) => {
            const seed = parseInt(e.target.value) || 0;
            if (player && player.app) {
                player.setRandomSeed(seed);
            }
        });
        
        // Set up randomise seed button
        randomiseSeedButton.addEventListener('click', () => {
            const randomSeed = Math.floor(Math.random() * 1000000);
            seedInput.value = randomSeed;
            if (player && player.app) {
                player.setRandomSeed(randomSeed);
            }
        });
        
        // Set up save image button
        saveImageButton.addEventListener('click', async () => {
            if (!player || !player.app) return;
            
            const format = formatSelect.value;
            const originalText = saveImageButton.textContent;
            
            try {
                saveImageButton.textContent = 'Saving...';
                saveImageButton.disabled = true;
                
                const fileName = await player.saveFullSizeImage(format);
                status.textContent = `Image saved: ${fileName}`;
                
                // Reset button after a delay
                setTimeout(() => {
                    if (status.textContent.includes('Image saved:')) {
                        status.textContent = 'Scene loaded - Ready to export images';
                    }
                }, 3000);
                
            } catch (error) {
                console.error("Failed to save image:", error);
                status.textContent = `Failed to save image: ${error.message}`;
            } finally {
                saveImageButton.textContent = originalText;
                saveImageButton.disabled = false;
            }
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