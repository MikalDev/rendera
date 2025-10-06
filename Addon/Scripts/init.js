// ============================================================================
// Renderer Proxy Initialization
// ============================================================================

// Wrap initialization in a function that executes after a delay
function initializeRendererProxy(delayMs = 1000) {
    setTimeout(() => {
        console.log("[rendera] sdk access");

        // Create a proxy to capture the renderer
        globalThis.capturedRenderer = null;
        globalThis.veryBadLands = null;
        globalThis.verySadLands = null;

        const OriginalIRenderer = globalThis.IRenderer;

        // Replace the original IRenderer with a proxied version
        globalThis.IRenderer = new Proxy(OriginalIRenderer, {
            construct(target, args) {
                console.log("[rendera] Constructing IRenderer");
                const instance = new target(...args);

                // Capture the renderer and runtime from the module scope
                globalThis.verySadLands = args[1];
                globalThis.veryBadLands = args[0];
                globalThis.capturedRenderer = instance;

                console.log("[rendera] Captured veryBadLands:", globalThis.veryBadLands);
                console.log("[rendera] Captured verySadLands:", globalThis.verySadLands);
                console.log("[rendera] Captured renderer instance:", instance);

                const gl = args[0]?._gl || args[1]?._gl;
                if (gl) {
                    console.log("[rendera] WebGL context available:", gl);
                } else {
                    console.warn("[rendera] WebGL context not immediately available");
                }

                return instance;
            }
        });
    }, delayMs);
}

// Execute the initialization immediately (0ms delay)
initializeRendererProxy(0);