// Shared utility for automatic asset loading in Cavalry Web Player demos
// This file provides automatic loading of image, font, CSV, Excel, SVG, and Google Sheets assets
// when they are detected in scene files.

// Track which assets have already been loaded to prevent infinite loops
const loadedAssets = new Set();

// Helper function to automatically load image assets
async function handleAutoLoadImage(assetId, filename, Module, playerInstance = null) {
    console.log(`Attempting to auto-load image: ${filename} for asset ${assetId}`);
    
    // Try to fetch from root directory first
    let imageUrl = './' + filename;
    let response = await fetch(imageUrl);
    
    if (!response.ok) {
        // Try Assets/ subdirectory
        imageUrl = './Assets/' + filename;
        response = await fetch(imageUrl);
    }
    
    if (response.ok) {
        try {
            const imageData = await response.arrayBuffer();
            
            // Write the image file to the virtual filesystem
            Module.FS.writeFile(filename, new Uint8Array(imageData));

            // Use the WasmHelper's replaceImageAsset API
            // Try to get the app instance from various possible sources
            let app = null;
            if (playerInstance && playerInstance.app) {
                app = playerInstance.app;
            } else if (window.player && window.player.app) {
                app = window.player.app;
            } else if (window.app) {
                app = window.app;
            }
            
            if (app) {
                app.replaceImageAsset(filename, assetId);
                
                // Re-render the scene to show the new image
                let surface = null;
                if (playerInstance && playerInstance.surface) {
                    surface = playerInstance.surface;
                } else if (window.player && window.player.surface) {
                    surface = window.player.surface;
                } else if (window.surface) {
                    surface = window.surface;
                }
                
                if (surface) {
                    app.render(surface);
                }
                
                console.log(`Image asset auto-loaded successfully: ${assetId} -> ${filename}`);
                
                // Update status if element exists
                const statusElement = document.getElementById('status');
                if (statusElement) {
                    statusElement.textContent = `Auto-loaded image asset: ${filename}`;
                }
            } else {
                console.warn('Could not find app instance for auto-loading image asset');
            }
        } catch (error) {
            console.error(`Failed to auto-load image ${filename}:`, error);
        }
    } else {
        console.warn(`Could not find image file: ${filename} (tried root and Assets/ directory)`);
    }
}

// Helper function to automatically load font assets
async function handleAutoLoadFont(assetId, filename, Module, playerInstance = null) {
    console.log(`Attempting to auto-load font: ${filename} for asset ${assetId}`);
    
    // Try to fetch from root directory first
    let fontUrl = './' + filename;
    let response = await fetch(fontUrl);
    
    if (!response.ok) {
        // Try Assets/ subdirectory
        fontUrl = './Assets/' + filename;
        response = await fetch(fontUrl);
    }
    
    if (response.ok) {
        try {
            const fontData = await response.arrayBuffer();
            
            // Write the font file to the virtual filesystem
            Module.FS.writeFile(filename, new Uint8Array(fontData));
            
            console.log(`Font file written to virtual FS: ${filename}`);
            
            // Use the WasmHelper's replaceFontAsset API
            // Try to get the app instance from various possible sources
            let app = null;
            if (playerInstance && playerInstance.app) {
                app = playerInstance.app;
            } else if (window.player && window.player.app) {
                app = window.player.app;
            } else if (window.app) {
                app = window.app;
            }
            
            if (app) {
                app.replaceFontAsset(filename, assetId);
                
                // Re-render the scene to show font changes
                let surface = null;
                if (playerInstance && playerInstance.surface) {
                    surface = playerInstance.surface;
                } else if (window.player && window.player.surface) {
                    surface = window.player.surface;
                } else if (window.surface) {
                    surface = window.surface;
                }
                
                if (surface) {
                    app.render(surface);
                }
                
                console.log(`Font asset auto-loaded successfully: ${assetId} -> ${filename}`);
                
                // Update status if element exists
                const statusElement = document.getElementById('status');
                if (statusElement) {
                    statusElement.textContent = `Auto-loaded font: ${filename}`;
                }
                
                // Fire a custom event to notify the UI that fonts need to be refreshed
                // For us, this ensures font dropdowns are updated after auto-loading
                setTimeout(() => {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('cavalryFontLoaded', {
                            detail: { 
                                type: 'font', 
                                assetId: assetId, 
                                filename: filename,
                                source: 'auto-load' 
                            }
                        }));
                    }
                }, 50); // Small delay to ensure font is processed
            } else {
                console.warn('Could not find app instance for auto-loading font asset');
            }
        } catch (error) {
            console.error(`Failed to auto-load font ${filename}:`, error);
        }
    } else {
        console.warn(`Could not find font file: ${filename} (tried root and Assets/ directory)`);
    }
}

// Helper function to automatically load CSV assets
async function handleAutoLoadCSV(assetId, filename, Module, playerInstance = null) {
    console.log(`Attempting to auto-load CSV: ${filename} for asset ${assetId}`);
    
    // Try to fetch from root directory first
    let csvUrl = './' + filename;
    let response = await fetch(csvUrl);
    
    if (!response.ok) {
        // Try Assets/ subdirectory
        csvUrl = './Assets/' + filename;
        response = await fetch(csvUrl);
    }
    
    if (response.ok) {
        try {
            const csvData = await response.arrayBuffer();
            
            // Write the CSV file to the virtual filesystem
            Module.FS.writeFile(filename, new Uint8Array(csvData));
            
            console.log(`CSV file written to virtual FS: ${filename}`);
            
            // Use the WasmHelper's replaceCSVAsset API
            // Try to get the app instance from various possible sources
            let app = null;
            if (playerInstance && playerInstance.app) {
                app = playerInstance.app;
            } else if (window.player && window.player.app) {
                app = window.player.app;
            } else if (window.app) {
                app = window.app;
            }
            
            if (app) {
                app.replaceCSVAsset(filename, assetId);
                
                // Re-render the scene to show CSV changes
                let surface = null;
                if (playerInstance && playerInstance.surface) {
                    surface = playerInstance.surface;
                } else if (window.player && window.player.surface) {
                    surface = window.player.surface;
                } else if (window.surface) {
                    surface = window.surface;
                }
                
                if (surface) {
                    app.render(surface);
                }
                
                console.log(`CSV asset auto-loaded successfully: ${assetId} -> ${filename}`);
                
                // Update status if element exists
                const statusElement = document.getElementById('status');
                if (statusElement) {
                    statusElement.textContent = `Auto-loaded CSV: ${filename}`;
                }
                
                // Fire a custom event to notify the UI that CSV has been loaded
                setTimeout(() => {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('cavalryAutoLoadAsset', {
                            detail: { 
                                type: 'csv', 
                                assetId: assetId, 
                                filename: filename,
                                source: 'auto-load' 
                            }
                        }));
                    }
                }, 50); // Small delay to ensure CSV is processed
            } else {
                console.warn('Could not find app instance for auto-loading CSV asset');
            }
        } catch (error) {
            console.error(`Failed to auto-load CSV ${filename}:`, error);
        }
    } else {
        console.warn(`Could not find CSV file: ${filename} (tried root and Assets/ directory)`);
    }
}

// Helper function to automatically load Excel assets
async function handleAutoLoadExcel(assetId, filename, Module, playerInstance = null) {
    console.log(`Attempting to auto-load Excel: ${filename} for asset ${assetId}`);

    // Try to fetch from root directory first
    let excelUrl = './' + filename;
    let response = await fetch(excelUrl);

    if (!response.ok) {
        // Try Assets/ subdirectory
        excelUrl = './Assets/' + filename;
        response = await fetch(excelUrl);
    }

    if (response.ok) {
        try {
            const excelData = await response.arrayBuffer();

            // Write the Excel file to the virtual filesystem
            Module.FS.writeFile(filename, new Uint8Array(excelData));

            console.log(`Excel file written to virtual FS: ${filename}`);

            // Use the WasmHelper's replaceExcelAsset API
            // Try to get the app instance from various possible sources
            let app = null;
            if (playerInstance && playerInstance.app) {
                app = playerInstance.app;
            } else if (window.player && window.player.app) {
                app = window.player.app;
            } else if (window.app) {
                app = window.app;
            }

            if (app) {
                app.replaceExcelAsset(filename, assetId);

                // Re-render the scene to show Excel changes
                let surface = null;
                if (playerInstance && playerInstance.surface) {
                    surface = playerInstance.surface;
                } else if (window.player && window.player.surface) {
                    surface = window.player.surface;
                } else if (window.surface) {
                    surface = window.surface;
                }

                if (surface) {
                    app.render(surface);
                }

                console.log(`Excel asset auto-loaded successfully: ${assetId} -> ${filename}`);

                // Update status if element exists
                const statusElement = document.getElementById('status');
                if (statusElement) {
                    statusElement.textContent = `Auto-loaded Excel: ${filename}`;
                }

                // Fire a custom event to notify the UI that Excel has been loaded
                setTimeout(() => {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('cavalryAutoLoadAsset', {
                            detail: {
                                type: 'excel',
                                assetId: assetId,
                                filename: filename,
                                source: 'auto-load'
                            }
                        }));
                    }
                }, 50); // Small delay to ensure Excel is processed
            } else {
                console.warn('Could not find app instance for auto-loading Excel asset');
            }
        } catch (error) {
            console.error(`Failed to auto-load Excel ${filename}:`, error);
        }
    } else {
        console.warn(`Could not find Excel file: ${filename} (tried root and Assets/ directory)`);
    }
}

// Helper function to automatically load SVG assets
async function handleAutoLoadSVG(assetId, filename, Module, playerInstance = null) {
    console.log(`Attempting to auto-load SVG: ${filename} for asset ${assetId}`);

    // Try to fetch from root directory first
    let svgUrl = './' + filename;
    let response = await fetch(svgUrl);

    if (!response.ok) {
        // Try Assets/ subdirectory
        svgUrl = './Assets/' + filename;
        response = await fetch(svgUrl);
    }

    if (response.ok) {
        try {
            const svgData = await response.arrayBuffer();

            // Write the SVG file to the virtual filesystem
            Module.FS.writeFile(filename, new Uint8Array(svgData));

            console.log(`SVG file written to virtual FS: ${filename}`);

            // Use the WasmHelper's replaceSVGAsset API
            // Try to get the app instance from various possible sources
            let app = null;
            if (playerInstance && playerInstance.app) {
                app = playerInstance.app;
            } else if (window.player && window.player.app) {
                app = window.player.app;
            } else if (window.app) {
                app = window.app;
            }

            if (app) {
                app.replaceSVGAsset(filename, assetId);

                // Re-render the scene to show SVG changes
                let surface = null;
                if (playerInstance && playerInstance.surface) {
                    surface = playerInstance.surface;
                } else if (window.player && window.player.surface) {
                    surface = window.player.surface;
                } else if (window.surface) {
                    surface = window.surface;
                }

                if (surface) {
                    app.render(surface);
                }

                console.log(`SVG asset auto-loaded successfully: ${assetId} -> ${filename}`);

                // Update status if element exists
                const statusElement = document.getElementById('status');
                if (statusElement) {
                    statusElement.textContent = `Auto-loaded SVG: ${filename}`;
                }

                // Fire a custom event to notify the UI that SVG has been loaded
                setTimeout(() => {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('cavalryAutoLoadAsset', {
                            detail: {
                                type: 'svg',
                                assetId: assetId,
                                filename: filename,
                                source: 'auto-load'
                            }
                        }));
                    }
                }, 50); // Small delay to ensure SVG is processed
            } else {
                console.warn('Could not find app instance for auto-loading SVG asset');
            }
        } catch (error) {
            console.error(`Failed to auto-load SVG ${filename}:`, error);
        }
    } else {
        console.warn(`Could not find SVG file: ${filename} (tried root and Assets/ directory)`);
    }
}

// Helper function to automatically load Google Sheets assets
async function handleAutoLoadGoogleSheet(assetId, url, Module, playerInstance = null) {
    console.log(`Attempting to auto-load Google Sheet: ${url} for asset ${assetId}`);
    
    try {
        let app = null;
        if (playerInstance && playerInstance.app) {
            app = playerInstance.app;
        } else if (window.player && window.player.app) {
            app = window.player.app;
        } else if (window.app) {
            app = window.app;
        }
        
        if (app) {
            app.replaceGoogleSheet(url, assetId);
            
            console.log(`Google Sheets asset auto-loaded successfully: ${assetId} -> ${url}`);
            
            // Update status if element exists
            const statusElement = document.getElementById('status');
            if (statusElement) {
                statusElement.textContent = `Auto-loaded Google Sheets asset: ${assetId}`;
            }
        } else {
            console.warn('Could not find app instance for auto-loading Google Sheets asset');
        }
    } catch (error) {
        console.error(`Failed to auto-load Google Sheet ${url}:`, error);
    }
}

// Set up automatic asset loading system
function setupAutoAssetLoading(Module, playerInstance = null) {
    // Set up the event listener for automatic asset loading
    window.addEventListener('cavalryAutoLoadAsset', async (event) => {
        const { type, assetId, filename, url } = event.detail;
        const assetKey = `${type}:${assetId}:${filename || url}`;

        // Skip if this asset has already been loaded
        if (loadedAssets.has(assetKey)) {
            return;
        }

        console.log('Auto-loading asset:', event.detail);
        loadedAssets.add(assetKey);

        if (type === 'image') {
            await handleAutoLoadImage(assetId, filename, Module, playerInstance);
        } else if (type === 'font') {
            await handleAutoLoadFont(assetId, filename, Module, playerInstance);
        } else if (type === 'csv') {
            await handleAutoLoadCSV(assetId, filename, Module, playerInstance);
        } else if (type === 'excel') {
            await handleAutoLoadExcel(assetId, filename, Module, playerInstance);
        } else if (type === 'svg') {
            await handleAutoLoadSVG(assetId, filename, Module, playerInstance);
        } else if (type === 'googlesheet') {
            await handleAutoLoadGoogleSheet(assetId, url, Module, playerInstance);
        }
    });

    console.log('Auto asset loading system initialized');
}

// Export functions for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleAutoLoadImage,
        handleAutoLoadFont,
        handleAutoLoadCSV,
        handleAutoLoadExcel,
        handleAutoLoadSVG,
        handleAutoLoadGoogleSheet,
        setupAutoAssetLoading
    };
}

// Make functions available globally for script tag usage
if (typeof window !== 'undefined') {
    window.CavalryAutoAssetLoader = {
        handleAutoLoadImage,
        handleAutoLoadFont,
        handleAutoLoadCSV,
        handleAutoLoadExcel,
        handleAutoLoadSVG,
        handleAutoLoadGoogleSheet,
        setupAutoAssetLoading
    };
}