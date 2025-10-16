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

    // Temporary shadow map state - not persistent between calls
    private tempShadowState: {
        textureBinding2D: WebGLTexture | null;
        framebufferBinding: WebGLFramebuffer | null;
        viewport: Int32Array;
        depthTest: boolean;
        depthFunc: number;
        colorWritemask: boolean[];
        scissorTest: boolean;
        blend: boolean;
        currentProgram: WebGLProgram | null;
        colorClearValue: Float32Array;
        depthClearValue: number;
    } | null = null;

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
     * Cache the current GL state before shadow map rendering.
     * Uses WebGLStateTracker snapshot when available for better performance.
     */
    cacheShadowMapState(): void {
        // Try to get state from WebGLStateTracker first (more efficient)
        const tracker = WebGLStateTracker.getInstance();
        if (tracker) {
            const state = tracker.getState();

            // Get current texture binding for active texture unit
            const activeUnit = (state.activeTexture - this.gl.TEXTURE0);
            const textureBinding2D = state.textureBindings.get(activeUnit)?.[this.gl.TEXTURE_2D] ?? null;

            // Convert viewport array if needed
            const viewport = state.viewport.length === 4
                ? new Int32Array(state.viewport)
                : this.gl.getParameter(this.gl.VIEWPORT);

            // Convert color clear value if needed
            const colorClearValue = state.clearColor.length === 4
                ? new Float32Array(state.clearColor)
                : this.gl.getParameter(this.gl.COLOR_CLEAR_VALUE);

            this.tempShadowState = {
                textureBinding2D: textureBinding2D,
                framebufferBinding: state.boundFramebuffer,
                viewport: viewport,
                depthTest: state.capabilities.get(this.gl.DEPTH_TEST) ?? false,
                depthFunc: state.depthFunc,
                colorWritemask: state.colorMask,
                scissorTest: state.capabilities.get(this.gl.SCISSOR_TEST) ?? false,
                blend: state.capabilities.get(this.gl.BLEND) ?? false,
                currentProgram: state.currentProgram,
                colorClearValue: colorClearValue,
                depthClearValue: state.clearDepth ?? 1.0  // Use tracked clearDepth value
            };
        } else {
            // Fallback to GL queries if tracker not available
            this.tempShadowState = {
                textureBinding2D: this.gl.getParameter(this.gl.TEXTURE_BINDING_2D),
                framebufferBinding: this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING),
                viewport: this.gl.getParameter(this.gl.VIEWPORT),
                depthTest: this.gl.getParameter(this.gl.DEPTH_TEST),
                depthFunc: this.gl.getParameter(this.gl.DEPTH_FUNC),
                colorWritemask: this.gl.getParameter(this.gl.COLOR_WRITEMASK),
                scissorTest: this.gl.getParameter(this.gl.SCISSOR_TEST),
                blend: this.gl.getParameter(this.gl.BLEND),
                currentProgram: this.gl.getParameter(this.gl.CURRENT_PROGRAM),
                colorClearValue: this.gl.getParameter(this.gl.COLOR_CLEAR_VALUE),
                depthClearValue: this.gl.getParameter(this.gl.DEPTH_CLEAR_VALUE)
            };
        }
    }

    /**
     * Restore the cached GL state after shadow map rendering.
     * Clears the temp state after restoring to prevent stale references.
     */
    restoreShadowMapState(): void {
        if (this.tempShadowState) {
            // Restore all cached GL state
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.tempShadowState.textureBinding2D);
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.tempShadowState.framebufferBinding);
            this.gl.viewport(
                this.tempShadowState.viewport[0],
                this.tempShadowState.viewport[1],
                this.tempShadowState.viewport[2],
                this.tempShadowState.viewport[3]
            );
            
            if (this.tempShadowState.depthTest) {
                this.gl.enable(this.gl.DEPTH_TEST);
            } else {
                this.gl.disable(this.gl.DEPTH_TEST);
            }
            
            this.gl.depthFunc(this.tempShadowState.depthFunc);
            this.gl.colorMask(
                this.tempShadowState.colorWritemask[0],
                this.tempShadowState.colorWritemask[1],
                this.tempShadowState.colorWritemask[2],
                this.tempShadowState.colorWritemask[3]
            );
            
            if (this.tempShadowState.scissorTest) {
                this.gl.enable(this.gl.SCISSOR_TEST);
            } else {
                this.gl.disable(this.gl.SCISSOR_TEST);
            }
            
            if (this.tempShadowState.blend) {
                this.gl.enable(this.gl.BLEND);
            } else {
                this.gl.disable(this.gl.BLEND);
            }

            // Validate program before restoring - only restore if valid
            if (this.tempShadowState.currentProgram && this.gl.isProgram(this.tempShadowState.currentProgram)) {
                this.gl.useProgram(this.tempShadowState.currentProgram);
            } else {
                if (this.tempShadowState.currentProgram) {
                    console.error('[GPUResourceCache] Invalid shader program detected during restore - skipping restoration');
                }
                this.gl.useProgram(null);  // Unbind program instead of using invalid one
            }
            this.gl.clearColor(
                this.tempShadowState.colorClearValue[0],
                this.tempShadowState.colorClearValue[1],
                this.tempShadowState.colorClearValue[2],
                this.tempShadowState.colorClearValue[3]
            );
            this.gl.clearDepth(this.tempShadowState.depthClearValue);
            
            // Clear temp state after restore to prevent stale references
            this.tempShadowState = null;
        }
    }

    /**
     * Get the cached shadow state.
     * Returns the temporary state if available.
     */
    getShadowState() {
        return this.tempShadowState;
    }

    /**
     * Clear the shadow state cache (e.g., on context loss).
     */
    clearShadowStateCache(): void {
        this.tempShadowState = null;
    }

}

