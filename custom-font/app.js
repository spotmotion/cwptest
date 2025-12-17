class CavalryCustomFontPlayer {
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
        console.log("Loading Custom Font Demo scene...");

        // Stop playback if running
        this.stop();

        // Clean up existing app
        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        try {
            // Load the scene file from the custom-font folder
            const response = await fetch('./Custom Font.cv');
            if (!response.ok) {
                throw new Error(`Failed to load scene: ${response.statusText}`);
            }

            const sceneData = await response.arrayBuffer();
            const filename = 'Custom Font.cv';

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

    loadCustomFont(fontFile) {
        return new Promise((resolve, reject) => {
            if (!this.app) {
                reject(new Error("Cannot load font: app not initialised"));
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    // Convert ArrayBuffer to Uint8Array
                    const fontData = new Uint8Array(e.target.result);

                    // Write the font file to the virtual filesystem
                    const virtualFileName = fontFile.name;
                    this.Module.FS.writeFile(virtualFileName, fontData);

                    console.log(`Font file written to virtual FS: ${virtualFileName}`);

                    // Load font and get the family name
                    const fontFamilyName = this.Module.loadFont(virtualFileName);

                    if (fontFamilyName) {
                        console.log(`Font loaded successfully: ${fontFamilyName}`);
                        resolve(fontFamilyName); // Return the font family name
                    } else {
                        reject(new Error("Failed to load font - no family name returned"));
                    }
                } catch (error) {
                    console.error("Error loading custom font:", error);
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error("Failed to read font file"));
            };

            // Read the file as ArrayBuffer
            reader.readAsArrayBuffer(fontFile);
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

            this.app.tick(this.surface, timestamp);
            this.animationFrameId = requestAnimationFrame(tick);
        };

        this.animationFrameId = requestAnimationFrame(tick);
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
        player = new CavalryCustomFontPlayer(canvas, Module);

        // Set up automatic asset loading system
        window.CavalryAutoAssetLoader.setupAutoAssetLoading(Module, player);

        // Hide loading message
        document.getElementById('loading').style.display = 'none';

        // Set up UI elements
        const playButton = document.getElementById('playButton');
        const fontInput = document.getElementById('fontInput');
        const selectedFontInfo = document.getElementById('selectedFontInfo');
        const fontFamilySelect = document.getElementById('fontFamilySelect');
        const fontStyleSelect = document.getElementById('fontStyleSelect');
        const applyFontButton = document.getElementById('applyFontButton');
        const status = document.getElementById('status');

        status.textContent = 'Loading scene...';

        // Load the scene automatically
        const sceneLoaded = await player.loadScene();

        if (sceneLoaded) {
            status.textContent = 'Scene loaded - Ready to load and apply fonts';
            playButton.disabled = false;
            fontInput.disabled = false;

            // initialise font dropdowns with available fonts
            populateFontFamilies();

            // Set up font loaded event listener to refresh dropdowns
            window.addEventListener('cavalryFontLoaded', (event) => {
                if (event.detail.type === 'font') {
                    console.log('Font loaded callback received, refreshing font dropdowns...');
                    // Small delay to ensure font is fully processed
                    setTimeout(() => {
                        populateFontFamilies();
                        status.textContent = `Font Asset loaded from ${event.detail.source}: ${event.detail.filename}`;
                    }, 150); // Slightly longer delay for auto-loaded fonts
                }
            });

            console.log("Custom font demo ready");
        } else {
            status.textContent = 'Failed to load scene';
        }

        // Helper function to populate font families dropdown
        function populateFontFamilies() {
            try {
                // Check if the method exists
                if (typeof player.app.queryFonts !== 'function') {
                    console.error("queryFonts method is not available");
                    status.textContent = 'Font query API not available';
                    // Add a fallback font for testing
                    fontFamilySelect.innerHTML = '<option value="">Select a font family...</option>';
                    const option = document.createElement('option');
                    option.value = 'Arial';
                    option.textContent = 'Arial (fallback)';
                    fontFamilySelect.appendChild(option);
                    return;
                }

                console.log("Querying fonts...");
                const fonts = player.app.queryFonts();
                console.log("Fonts returned:", fonts, "Type:", typeof fonts);

                fontFamilySelect.innerHTML = '<option value="">Select a font family...</option>';

                // Handle emscripten VectorString
                if (fonts && fonts.size && typeof fonts.size === 'function') {
                    const fontCount = fonts.size();
                    console.log("Font count:", fontCount);

                    for (let i = 0; i < fontCount; i++) {
                        const fontFamily = fonts.get(i);
                        console.log(`Font ${i}:`, fontFamily);

                        const option = document.createElement('option');
                        option.value = fontFamily;
                        option.textContent = fontFamily;
                        fontFamilySelect.appendChild(option);
                    }

                    if (fontCount > 0) {
                        fontFamilySelect.disabled = false;
                    }
                } else if (Array.isArray(fonts)) {
                    // Fallback: handle as regular array
                    fonts.forEach(fontFamily => {
                        const option = document.createElement('option');
                        option.value = fontFamily;
                        option.textContent = fontFamily;
                        fontFamilySelect.appendChild(option);
                    });
                    fontFamilySelect.disabled = false;
                } else {
                    console.error("Unexpected fonts structure:", fonts);
                    status.textContent = 'Error: Could not retrieve font list';
                }
            } catch (error) {
                console.error("Error populating font families:", error);
                status.textContent = 'Error loading font list: ' + error.message;
            }
        }

        // Helper function to populate font styles dropdown based on selected family
        function populateFontStyles(fontFamily) {
            if (!fontFamily) {
                fontStyleSelect.innerHTML = '<option value="">Select a font style...</option>';
                fontStyleSelect.disabled = true;
                applyFontButton.disabled = true;
                return;
            }

            try {
                console.log("Getting styles for font:", fontFamily);
                const styles = player.app.getFontStyles(fontFamily);
                console.log("Styles returned:", styles, "Type:", typeof styles);

                fontStyleSelect.innerHTML = '<option value="">Select a font style...</option>';

                // Handle emscripten VectorString
                if (styles && styles.size && typeof styles.size === 'function') {
                    const styleCount = styles.size();
                    console.log("Style count:", styleCount);

                    for (let i = 0; i < styleCount; i++) {
                        const style = styles.get(i);
                        console.log(`Style ${i}:`, style);

                        const option = document.createElement('option');
                        option.value = style;
                        option.textContent = style;
                        fontStyleSelect.appendChild(option);
                    }

                    fontStyleSelect.disabled = styleCount === 0;
                } else if (Array.isArray(styles)) {
                    // Fallback: handle as regular array
                    styles.forEach(style => {
                        const option = document.createElement('option');
                        option.value = style;
                        option.textContent = style;
                        fontStyleSelect.appendChild(option);
                    });
                    fontStyleSelect.disabled = false;
                } else {
                    console.error("Unexpected styles structure:", styles);
                    fontStyleSelect.disabled = true;
                }
            } catch (error) {
                console.error("Error populating font styles:", error);
                fontStyleSelect.disabled = true;
            }
        }

        // Set up play/stop button
        playButton.addEventListener('click', () => {
            if (!player || !player.app) return;

            player.toggle();
            playButton.textContent = player.app.isPlaying() ? 'Stop' : 'Play';
        });

        // Set up font file input
        fontInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validate font file type
            const validTypes = ['.ttf', '.otf', '.woff', '.woff2'];
            const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

            if (!validTypes.includes(fileExtension)) {
                status.textContent = `Invalid font type: ${fileExtension}. Please select a .ttf, .otf, .woff, or .woff2 file.`;
                return;
            }

            // Show selected file info
            selectedFontInfo.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            selectedFontInfo.style.display = 'block';

            try {
                status.textContent = 'Loading custom font...';
                const fontFamilyName = await player.loadCustomFont(file);
                status.textContent = `Font loaded successfully: ${fontFamilyName}`;

                // Refresh the font family dropdown to include the new font
                populateFontFamilies();

                // Auto-select the newly loaded font
                fontFamilySelect.value = fontFamilyName;
                populateFontStyles(fontFamilyName);
            } catch (error) {
                console.error("Failed to load font:", error);
                status.textContent = `Failed to load font: ${error.message}`;
            }
        });

        // Set up font family selection
        fontFamilySelect.addEventListener('change', (e) => {
            const selectedFamily = e.target.value;
            populateFontStyles(selectedFamily);
        });

        // Set up font style selection
        fontStyleSelect.addEventListener('change', (e) => {
            const selectedStyle = e.target.value;
            applyFontButton.disabled = !selectedStyle;
        });

        // Set up font application
        applyFontButton.addEventListener('click', () => {
            if (!player || !player.app) return;

            const fontFamily = fontFamilySelect.value;
            const fontStyle = fontStyleSelect.value;

            if (!fontFamily || !fontStyle) {
                status.textContent = 'Please select both font family and style';
                return;
            }

            try {
                // Create FontData object and apply to textShape#1
                const fontData = {font: fontFamily, style: fontStyle};
                player.app.setAttributeFont("textShape#1", "font", fontData);
                player.app.setAttributeFont("textShape#2", "font", fontData);

                // Render the scene to show changes
                if (player.surface) {
                    player.app.render(player.surface);
                }

                status.textContent = `Applied font: ${fontFamily} ${fontStyle}`;
            } catch (error) {
                console.error("Failed to apply font:", error);
                status.textContent = `Failed to apply font: ${error.message}`;
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
