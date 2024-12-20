// Wrap initialization in a function that executes after a delay
function initializeRendererProxy(delayMs = 1000) {
    setTimeout(() => {
        console.log("[rendera] sdk access");
        
        // Create a proxy to capture the renderer
        globalThis.capturedRenderer = null;
        globalThis.veryBadLands = null;

        const OriginalIRenderer = globalThis.IRenderer;

        // Replace the original IRenderer with a proxied version
        globalThis.IRenderer = new Proxy(OriginalIRenderer, {
            construct(target, args) {
                console.log("[rendera] Constructing IRenderer");
                const instance = new target(...args);
                // Capture the renderer from the module scope
                globalThis.verySadLands = args[1];
                globalThis.veryBadLands = args[0];
                return instance;
            }
        });
    }, delayMs);
}

// Execute the initialization with a 1 second delay
initializeRendererProxy(0);