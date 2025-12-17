// Import the web component
import './cavalry-shadow-player.js';

// Main application logic
let shadowPlayer = null;
let Module = null;

async function initialiseApp() {
    try {
        console.log("Initialising Cavalry WASM module for Shadow DOM demo...");
        
        // Hide loading overlay (page level)
        document.getElementById('loading').style.display = 'none';
        
        // Get the shadow player element
        shadowPlayer = document.getElementById('shadowPlayer');
        
        // Dynamically import the ES6 module
        const CavalryModule = await import('../wasm-lib/CavalryWasm.js');
        
        // Configure and create the module instance
        Module = await CavalryModule.default({
            locateFile: (path) => `../wasm-lib/${path}`,
            print: (text) => console.log(text),
            printErr: (text) => console.error(text)
        });
        
        console.log("Cavalry WASM module loaded");
        
        // Initialise the shadow player component
        await shadowPlayer.initialise(Module);
        
        // Set up automatic asset loading
        // Note: We pass the shadowPlayer which has the app reference
        window.CavalryAutoAssetLoader.setupAutoAssetLoading(Module, shadowPlayer);
        
        // Set up UI elements
        const status = document.getElementById('status');

        // Update status
        status.textContent = 'Scene loaded in Shadow DOM';
        
        // Update component info
        const res = shadowPlayer.getSceneResolution();

        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (shadowPlayer && shadowPlayer.resize) {
                shadowPlayer.resize();
            }
        });
        
        console.log("Shadow DOM demo ready!");
        console.log("Open DevTools and inspect the <cavalry-shadow-player> element to see the shadow DOM structure");
        
    } catch (error) {
        console.error('Failed to initialise Cavalry WASM:', error);
        document.getElementById('status').textContent = 'Failed to load';
    }
}

// Start initialisation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseApp);
} else {
    initialiseApp();
}