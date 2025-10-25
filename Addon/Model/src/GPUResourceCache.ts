import { IGPUResourceCache } from './types';
import { WebGLStateTracker, WebGLState } from './WebGLStateTracker';

export class GPUResourceCache implements IGPUResourceCache {
    private gl: WebGL2RenderingContext;

    // New: Using WebGLState snapshot instead of manual state tracking
    private cachedModelState: WebGLState | null = null;

    // Old implementation kept for reference/comparison
    private cachedState: {
        // Original 4 states
        vao: WebGLVertexArrayObject | null;
        textureBinding: WebGLTexture | null;
        shaderProgram: WebGLProgram | null;
        elementArrayBuffer: WebGLBuffer | null;
        // Additional critical states
        activeTexture: number;
        arrayBuffer: WebGLBuffer | null;
        uniformBufferBindings: (WebGLBuffer | null)[];
    } | null = null;

    // Track which UBO binding points we care about
    private static readonly TRACKED_UBO_BINDING_POINTS = [0, 1, 2, 3]; // Track first 4 binding points


    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
    }

    cacheModelMode() {
        // New implementation using WebGLStateTracker
        const tracker = WebGLStateTracker.getInstance();
        if (tracker) {
            this.cachedModelState = tracker.snapshot();
            return;
        }
    }

    restoreModelMode() {
        // New implementation using WebGLStateTracker
        const tracker = WebGLStateTracker.getInstance();
        if (tracker && this.cachedModelState) {
            // Clean up texture units before restoring (same as old implementation)
            this.cleanupTextureUnits();

            // Restore the complete WebGL state
            tracker.restore(this.cachedModelState);

            // Clear cached state after restoration
            this.cachedModelState = null;
            return;
        }
    }

    /**
     * Clean up texture bindings on units we use (1-17) to avoid conflicts with C3
     * We skip unit 0 as it will be restored from cached state
     *
     * IMPORTANT: Uses original GL methods (via tracker) to avoid polluting tracker state
     * before restore() syncs it back to the snapshot.
     */
    private cleanupTextureUnits(): void {
        // Get the WebGLStateTracker to access original methods
        const tracker = WebGLStateTracker.getInstance();
        if (!tracker) {
            // Fallback: use regular GL methods if tracker not available
            const currentActiveTexture = this.cachedModelState?.activeTexture ??
                                        this.cachedState?.activeTexture ??
                                        this.gl.getParameter(this.gl.ACTIVE_TEXTURE);

            for (let unit = 1; unit <= 4; unit++) {
                this.gl.activeTexture(this.gl.TEXTURE0 + unit);
                this.gl.bindTexture(this.gl.TEXTURE_2D, null);
            }

            for (let unit = 10; unit <= 17; unit++) {
                this.gl.activeTexture(this.gl.TEXTURE0 + unit);
                this.gl.bindTexture(this.gl.TEXTURE_2D, null);
            }

            this.gl.activeTexture(currentActiveTexture);
            return;
        }

        // Use original methods to avoid updating tracker state
        const original = tracker.getOriginalMethods();
        const currentActiveTexture = this.cachedModelState?.activeTexture ??
                                    this.cachedState?.activeTexture ??
                                    this.gl.getParameter(this.gl.ACTIVE_TEXTURE);

        // Clean material texture units (1-4) using original methods
        for (let unit = 1; unit <= 4; unit++) {
            original.activeTexture(this.gl.TEXTURE0 + unit);
            original.bindTexture(this.gl.TEXTURE_2D, null);
        }

        // Clean shadow map texture units (10-17) using original methods
        for (let unit = 10; unit <= 17; unit++) {
            original.activeTexture(this.gl.TEXTURE0 + unit);
            original.bindTexture(this.gl.TEXTURE_2D, null);
        }

        // Restore the active texture unit using original method
        original.activeTexture(currentActiveTexture);
    }

    /**
     * Get the cached model state.
     * Returns the cached WebGLState snapshot if available.
     */
    getCachedModelState(): WebGLState | null {
        return this.cachedModelState;
    }

}

