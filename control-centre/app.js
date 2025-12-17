class CavalryControlCentrePlayer {
    constructor(canvas, Module) {
        this.canvas = canvas;
        this.Module = Module;
        this.surface = null;
        this.app = null;
        this.animationFrameId = null;
        this.controlCentreAttributes = [];
        this.attributeControls = new Map();

        this.canvas.addEventListener("webglcontextlost", e => {
            alert('WebGL context lost. You will need to reload the page.');
            e.preventDefault();
        }, false);

        window.addEventListener("resize", () => this.resize());
    }

    // Helper function to convert Emscripten vector to JavaScript array
    vectorToArray(vector) {
        if (!vector || typeof vector.size !== 'function') {
            return [];
        }
        // Use the elegant one-liner approach suggested online
        return new Array(vector.size()).fill(0).map((_, id) => vector.get(id));
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

    async loadScene(contents = null, filename = 'Control Centre.cv') {
        console.log(`Loading scene: ${filename}`);

        // Stop playback if running
        this.stop();
        
        // Clean up existing app
        if (this.app !== null) {
            delete this.app;
            this.app = null;
        }

        try {
            let sceneData;
            
            if (contents) {
                // Use provided file contents
                sceneData = contents;
            } else {
                // Load default scene
                const response = await fetch('./Control Centre.cv');
                if (!response.ok) {
                    throw new Error(`Failed to load scene: ${response.statusText}`);
                }
                sceneData = await response.arrayBuffer();
            }
            
            // Write scene file to virtual filesystem
            this.Module.FS.writeFile(filename, new Uint8Array(sceneData));
            
            // Create new app instance
            this.app = this.Module.Cavalry.MakeWithPath(filename);
            
            // Set up canvas target
            this.Module.specialHTMLTargets['#' + this.canvas.id] = this.canvas;
            
            // Initial resize and render
            this.resize();
            this.app.render(this.surface);
            this.play();
            console.log("Scene loaded successfully");
            return true;
        } catch (e) {
            console.error("Error loading scene:", e);
            return false;
        }
    }

    async loadControlCentreAttributes() {
        if (!this.app) {
            console.error("App not initialized");
            return;
        }

        try {
            // Get the active composition ID
            const activeCompId = this.app.getActiveComp();
            
            // Check if getControlCentreAttributes method exists
            if (typeof this.app.getControlCentreAttributes !== 'function') {
                console.warn("getControlCentreAttributes method not available - using fallback");
                // Fallback: try to discover attributes manually or use empty array
                this.controlCentreAttributes = [];
                this.showErrorMessage("Control Centre API not available in this build. Please rebuild the WASM module with the latest changes.");
                return;
            }
            
            // Get Control Centre Attributes for this Composition
            const ccAttributesVector = this.app.getControlCentreAttributes(activeCompId);
            
            // Converts the internal VectorString to JavaScript array
            this.controlCentreAttributes = this.vectorToArray(ccAttributesVector);
            
            if (this.controlCentreAttributes.length === 0) {
                this.showNoControlsMessage();
                return;
            }

            // Generate UI for each attribute
            await this.generateDynamicUI();
            
        } catch (error) {
            console.error("Error loading control centre attributes:", error);
            this.showErrorMessage(`Failed to load control centre attributes: ${error.message}`);
        }
    }

    async generateDynamicUI() {
        const dynamicControlsContainer = document.getElementById('dynamicControls');
        dynamicControlsContainer.innerHTML = '';
        
        if (!Array.isArray(this.controlCentreAttributes)) {
            console.error("controlCentreAttributes is not an array:", this.controlCentreAttributes);
            this.showErrorMessage("Invalid attribute data");
            return;
        }
        
        for (const attrPath of this.controlCentreAttributes) {
            
            if (typeof attrPath !== 'string') {
                console.error("Invalid attribute path (not a string):", attrPath);
                continue;
            }
            
            const pathParts = attrPath.split('.');
            if (pathParts.length < 2) {
                console.error("Invalid attribute path format (no dot separator):", attrPath);
                continue;
            }
            
            const [nodeId, ...attrIdParts] = pathParts;
            const attrId = attrIdParts.join('.'); // Handle attribute IDs with dots
            
            try {
                // Check if getAttributeDefinition method exists
                if (typeof this.app.getAttributeDefinition !== 'function') {
                    console.error("getAttributeDefinition method not available");
                    continue;
                }
                
                // Get attribute definition to understand the type and constraints
                const definition = this.app.getAttributeDefinition(nodeId, attrId);
                
                if (!definition || !definition.type) {
                    console.warn(`No valid definition found for ${attrPath}`);
                    continue;
                }
                
                // Create control based on attribute type
                const controlElement = await this.createControlForAttribute(attrPath, definition);
                if (controlElement) {
                    dynamicControlsContainer.appendChild(controlElement);
                }
            } catch (error) {
                console.error(`Error processing attribute ${attrPath}:`, error);
                // Continue processing other attributes even if one fails
            }
        }
        
        // Check if we created any controls
        if (dynamicControlsContainer.children.length === 0) {
            this.showNoControlsMessage();
        }
    }

    async createControlForAttribute(attrPath, definition) {
        const [nodeId, attrId] = attrPath.split('.');
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group';
        
        // Create label
        const label = document.createElement('label');
        label.className = 'control-label';
        label.textContent = attrId; // Use attribute ID as label for now
        controlGroup.appendChild(label);

        let controlElement = null;
        const type = definition.type;
        const numericInfo = definition.numericInfo;
        
        // Get current value
        const currentValue = await this.getAttributeValue(nodeId, attrId, type);
        
        switch (type) {
            case 'int':
                controlElement = await this.createIntControl(attrPath, definition, currentValue);
                break;
            case 'bool':
                controlElement = await this.createBoolControl(attrPath, definition, currentValue);
                break;
            case 'string':
                controlElement = await this.createStringControl(attrPath, definition, currentValue);
                break;
            case 'double':
                controlElement = await this.createDoubleControl(attrPath, definition, currentValue);
                break;
            case 'double2':
                controlElement = await this.createDouble2Control(attrPath, definition, currentValue);
                break;
            case 'Color':
            case 'color':
                controlElement = await this.createColorControl(attrPath, definition, currentValue);
                break;
            default:
                console.log(`Unsupported attribute type: ${type} for ${attrPath}`);
                return null;
        }
        
        if (controlElement) {
            controlGroup.appendChild(controlElement);
            
            // Add info about constraints if present
            if ((type === 'int' || type === 'double') && (numericInfo.hasHardMin || numericInfo.hasHardMax)) {
                const infoDiv = document.createElement('div');
                infoDiv.className = 'control-info';
                let infoText = '';
                if (numericInfo.hasHardMin && numericInfo.hasHardMax) {
                    infoText = `Range: ${numericInfo.hardMin} - ${numericInfo.hardMax}`;
                } else if (numericInfo.hasHardMin) {
                    infoText = `Min: ${numericInfo.hardMin}`;
                } else if (numericInfo.hasHardMax) {
                    infoText = `Max: ${numericInfo.hardMax}`;
                }
                infoDiv.textContent = infoText;
                controlGroup.appendChild(infoDiv);
            }
        }
        
        return controlGroup;
    }

    async createIntControl(attrPath, definition, currentValue) {
        const [nodeId, attrId] = attrPath.split('.');
        const numericInfo = definition.numericInfo;
        
        // Determine if this should be a slider or input
        const hasMinMax = numericInfo.hasHardMin && numericInfo.hasHardMax;
        
        if (hasMinMax) {
            // Create slider
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'control-input';
            slider.min = numericInfo.hardMin;
            slider.max = numericInfo.hardMax;
            slider.step = numericInfo.hasStep ? numericInfo.step : 1;
            slider.value = currentValue || 0;
            
            slider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.app.setAttribute(nodeId, attrId, value);
                this.app.render(this.surface);
            });
            
            this.attributeControls.set(attrPath, slider);
            return slider;
        } else {
            // Create number input
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'control-input';
            input.value = currentValue || 0;
            
            if (numericInfo.hasHardMin) input.min = numericInfo.hardMin;
            if (numericInfo.hasHardMax) input.max = numericInfo.hardMax;
            if (numericInfo.hasStep) input.step = numericInfo.step;
            
            input.addEventListener('change', (e) => {
                const value = parseInt(e.target.value);
                this.app.setAttribute(nodeId, attrId, value);
                this.app.render(this.surface);
            });
            
            this.attributeControls.set(attrPath, input);
            return input;
        }
    }

    async createBoolControl(attrPath, definition, currentValue) {
        const [nodeId, attrId] = attrPath.split('.');
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'control-input';
        checkbox.checked = currentValue || false;
        
        checkbox.addEventListener('change', (e) => {
            this.app.setAttribute(nodeId, attrId, e.target.checked);
            this.app.render(this.surface);
        });
        
        this.attributeControls.set(attrPath, checkbox);
        return checkbox;
    }

    async createStringControl(attrPath, definition, currentValue) {
        const [nodeId, attrId] = attrPath.split('.');
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'control-input';
        input.value = currentValue || '';
        
        input.addEventListener('change', (e) => {
            this.app.setAttribute(nodeId, attrId, e.target.value);
            this.app.render(this.surface);
        });
        
        this.attributeControls.set(attrPath, input);
        return input;
    }

    async createDoubleControl(attrPath, definition, currentValue) {
        const [nodeId, attrId] = attrPath.split('.');
        const numericInfo = definition.numericInfo;
        
        // Determine if this should be a slider or input
        const hasMinMax = numericInfo.hasHardMin && numericInfo.hasHardMax;
        
        if (hasMinMax) {
            // Create slider
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'control-input';
            slider.min = numericInfo.hardMin;
            slider.max = numericInfo.hardMax;
            slider.step = numericInfo.hasStep ? numericInfo.step : 0.1;
            slider.value = currentValue || 0;
            
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.app.setAttribute(nodeId, attrId, value);
                this.app.render(this.surface);
            });
            
            this.attributeControls.set(attrPath, slider);
            return slider;
        } else {
            // Create number input
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'control-input';
            input.value = currentValue || 0;
            input.step = 'any';
            
            if (numericInfo.hasHardMin) input.min = numericInfo.hardMin;
            if (numericInfo.hasHardMax) input.max = numericInfo.hardMax;
            if (numericInfo.hasStep) input.step = numericInfo.step;
            
            input.addEventListener('change', (e) => {
                const value = parseFloat(e.target.value);
                this.app.setAttribute(nodeId, attrId, value);
                this.app.render(this.surface);
            });
            
            this.attributeControls.set(attrPath, input);
            return input;
        }
    }

    async createDouble2Control(attrPath, definition, currentValue) {
        const [nodeId, attrId] = attrPath.split('.');
        
        const container = document.createElement('div');
        container.className = 'double2-controls';
        
        // Create X input
        const inputX = document.createElement('input');
        inputX.type = 'number';
        inputX.className = 'control-input';
        inputX.placeholder = 'X';
        inputX.step = 'any';
        inputX.value = currentValue ? currentValue.x : 0;
        
        // Create Y input
        const inputY = document.createElement('input');
        inputY.type = 'number';
        inputY.className = 'control-input';
        inputY.placeholder = 'Y';
        inputY.step = 'any';
        inputY.value = currentValue ? currentValue.y : 0;
        
        const updateValue = () => {
            const x = parseFloat(inputX.value) || 0;
            const y = parseFloat(inputY.value) || 0;
            this.app.setAttribute(nodeId, attrId, [x, y]);
            this.app.render(this.surface);
        };
        
        inputX.addEventListener('change', updateValue);
        inputY.addEventListener('change', updateValue);
        
        container.appendChild(inputX);
        container.appendChild(inputY);
        
        this.attributeControls.set(attrPath, {x: inputX, y: inputY});
        return container;
    }

    async createColorControl(attrPath, definition, currentValue) {
        const [nodeId, attrId] = attrPath.split('.');
        
        const container = document.createElement('div');
        container.className = 'color-controls';
        
        // Create color picker
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.className = 'control-input color-picker';
        
        // Create hex text input
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'control-input hex-input';
        hexInput.placeholder = '#FFFFFF';
        hexInput.maxLength = 7;
        
        // Set initial values from current color
        let initialHex = '#ffffff';
        if (currentValue && typeof currentValue === 'object') {
            initialHex = this.rgbToHex(
                Math.round(currentValue.r || 0),
                Math.round(currentValue.g || 0),
                Math.round(currentValue.b || 0)
            );
        }
        colorPicker.value = initialHex;
        hexInput.value = initialHex;
        
        // Update scene function
        const updateColor = (hexColor, sourceInput) => {
            // Validate and normalize hex color
            let normalizedHex = hexColor;
            if (!normalizedHex.match(/^#[0-9A-Fa-f]{6}$/)) {
                // Try to fix common issues
                if (normalizedHex.match(/^[0-9A-Fa-f]{6}$/)) {
                    normalizedHex = '#' + normalizedHex;
                } else if (normalizedHex.match(/^#[0-9A-Fa-f]{3}$/)) {
                    // Expand short form
                    normalizedHex = '#' + normalizedHex.slice(1).split('').map(c => c + c).join('');
                } else {
                    console.error("Invalid color format:", hexColor);
                    return false;
                }
            }
            
            // Convert hex to RGB
            const rgb = this.hexToRgb(normalizedHex);
            if (!rgb) {
                console.error("Failed to convert hex to RGB:", normalizedHex);
                return false;
            }
            
            // Update the scene using setAttribute with colour object
            this.app.setAttribute(nodeId, attrId, {r: rgb.r, g: rgb.g, b: rgb.b, a: 255});
            this.app.render(this.surface);
            
            // Sync the other input field
            if (sourceInput === colorPicker) {
                hexInput.value = normalizedHex;
            } else if (sourceInput === hexInput) {
                colorPicker.value = normalizedHex;
            }
            
            return true;
        };
        
        // Color picker event handler
        colorPicker.addEventListener('input', () => {
            updateColor(colorPicker.value, colorPicker);
        });
        
        // Hex input event handlers
        hexInput.addEventListener('input', () => {
            const hexValue = hexInput.value.trim();
            if (hexValue && hexValue.length >= 4) { // Allow partial updates
                updateColor(hexValue, hexInput);
            }
        });
        
        hexInput.addEventListener('blur', () => {
            const hexValue = hexInput.value.trim();
            if (hexValue) {
                // Try to clean up the value on blur
                let cleanHex = hexValue;
                if (!cleanHex.startsWith('#')) {
                    cleanHex = '#' + cleanHex;
                }
                hexInput.value = cleanHex;
                updateColor(cleanHex, hexInput);
            }
        });
        
        container.appendChild(colorPicker);
        container.appendChild(hexInput);
        
        this.attributeControls.set(attrPath, {picker: colorPicker, hex: hexInput});
        return container;
    }

    // Color conversion utilities (from text-editing demo)
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

    async getAttributeValue(nodeId, attrId, type) {
        try {
            const value = this.app.getAttribute(nodeId, attrId);

            // Handle double2 - convert array to {x, y} object for UI compatibility
            if (type === 'double2' && Array.isArray(value)) {
                return {x: value[0], y: value[1]};
            }

            return value;
        } catch (error) {
            console.error(`Error getting attribute value for ${nodeId}.${attrId}:`, error);
            return null;
        }
    }

    showNoControlsMessage() {
        const dynamicControlsContainer = document.getElementById('dynamicControls');
        dynamicControlsContainer.innerHTML = `
            <div class="no-controls-message">
                No control centre attributes found in this scene.
            </div>
        `;
    }

    showErrorMessage(message) {
        const dynamicControlsContainer = document.getElementById('dynamicControls');
        dynamicControlsContainer.innerHTML = `
            <div class="no-controls-message">
                Error: ${message}
            </div>
        `;
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
        player = new CavalryControlCentrePlayer(canvas, Module);
        
        // Set up automatic asset loading system
        window.CavalryAutoAssetLoader.setupAutoAssetLoading(Module, player);
        
        // Hide loading message
        document.getElementById('loading').style.display = 'none';
        
        // Set up UI elements
        const playButton = document.getElementById('playButton');
        const sceneInput = document.getElementById('sceneInput');
        const selectedSceneInfo = document.getElementById('selectedSceneInfo');
        const status = document.getElementById('status');

        status.textContent = 'Loading scene...';

        // Load the scene automatically
        const sceneLoaded = await player.loadScene();
        
        if (sceneLoaded) {
            status.textContent = 'Loading Control Centre Attributes...';
            
            // Load and generate control centre UI
            await player.loadControlCentreAttributes();
            
            status.textContent = 'Scene loaded';
            playButton.disabled = false;
        } else {
            status.textContent = 'Failed to load scene';
        }
        
        // Set up file input for loading new scenes
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
                    status.textContent = 'Loading Control Centre Attributes...';
                    
                    // Load and generate control centre UI for the new scene
                    await player.loadControlCentreAttributes();
                    
                    status.textContent = `Scene loaded: ${file.name}`;
                    playButton.disabled = false;
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