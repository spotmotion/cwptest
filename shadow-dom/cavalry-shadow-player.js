// Web Component that encapsulates Cavalry player in Shadow DOM
export class CavalryShadowPlayer extends HTMLElement {
    constructor() {
        super();
        this.canvas = null;
        this.player = null;
        this.Module = null;
        this.app = null;
        this.surface = null;
    }

    connectedCallback() {
        // Create shadow root - this encapsulates everything
        const shadow = this.attachShadow({ mode: 'open' });
        
        // Add styles to shadow DOM
        const style = document.createElement('style');
        style.textContent = `
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }
            
            .player-container {
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.1);
                border-radius: 12px;
                overflow: hidden;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            canvas {
                display: block;
                max-width: 100%;
                max-height: 100%;
            }
            
            .loading {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
                text-align: center;
            }
            
            .loading-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid rgba(255,255,255,0.3);
                border-top: 4px solid #fff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 10px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        shadow.appendChild(style);
        
        // Create container
        const container = document.createElement('div');
        container.className = 'player-container';
        
        // Create loading indicator
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.innerHTML = '<div class="loading-spinner"></div>Loading...';
        container.appendChild(loading);
        
        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.width = 800;
        this.canvas.height = 450;
        this.canvas.style.display = 'none'; // Hidden until loaded
        
        // Generate unique ID for this canvas
        this.canvasId = `shadow-canvas-${Math.random().toString(36).substring(7)}`;
        this.canvas.id = this.canvasId;
        
        container.appendChild(this.canvas);
        shadow.appendChild(container);
        
        // Store references for external access
        this.loadingElement = loading;
        this.containerElement = container;
    }

    async initialise(Module) {
        this.Module = Module;
        
        // CRITICAL: Register the shadow DOM canvas with Emscripten
        // This allows WASM to find the canvas even though it's in shadow DOM
        this.Module.specialHTMLTargets['#' + this.canvasId] = this.canvas;
        
        console.log(`Registered shadow DOM canvas with ID: ${this.canvasId}`);
        
        // Load scene
        await this.loadScene();
        
        // Hide loading, show canvas
        this.loadingElement.style.display = 'none';
        this.canvas.style.display = 'block';
        
        return this;
    }

    async loadScene() {
        console.log("Loading scene in shadow DOM...");
        
        try {
            // Load the scene file
            const response = await fetch('./Shadow DOM.cv');
            if (!response.ok) {
                throw new Error(`Failed to load scene: ${response.statusText}`);
            }
            
            const sceneData = await response.arrayBuffer();
            const filename = 'Shadow DOM.cv';
            
            // Write scene file to virtual filesystem
            this.Module.FS.writeFile(filename, new Uint8Array(sceneData));
            
            // Create app instance
            this.app = this.Module.Cavalry.MakeWithPath(filename);
            
            // Create surface and render
            this.resize();
            this.app.render(this.surface);
            
            console.log("Scene loaded successfully in shadow DOM");
            return true;
        } catch (e) {
            console.error("Error loading scene:", e);
            return false;
        }
    }

    resize() {
        if (!this.app || !this.containerElement) return;
        
        const res = this.app.getSceneResolution();
        const maxW = 600; // Fixed size for simplicity
        const maxH = 400;
        const scale = Math.min(maxW / res.width, maxH / res.height, 1);
        const newWidth = Math.floor(res.width * scale);
        const newHeight = Math.floor(res.height * scale);
        
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        
        this.surface = this.Module.makeWebGLSurfaceFromElement(
            this.canvas, newWidth, newHeight
        );
        
        if (this.app) {
            this.app.render(this.surface);
        }
    }

    getSceneResolution() {
        if (!this.app) return { width: 0, height: 0 };
        return this.app.getSceneResolution();
    }
}

// Register the custom element
customElements.define('cavalry-shadow-player', CavalryShadowPlayer);