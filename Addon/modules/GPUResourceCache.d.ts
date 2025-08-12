import { IGPUResourceCache } from './types';
export declare class GPUResourceCache implements IGPUResourceCache {
    private gl;
    private cachedState;
    private static readonly TRACKED_UBO_BINDING_POINTS;
    private tempShadowState;
    constructor(gl: WebGL2RenderingContext);
    cacheModelMode(): void;
    restoreModelMode(): void;
    /**
     * Clean up texture bindings on units we use (1-17) to avoid conflicts with C3
     * We skip unit 0 as it will be restored from cached state
     */
    private cleanupTextureUnits;
    /**
     * Cache the current GL state before shadow map rendering.
     * Always queries fresh state to avoid stale references to deleted objects.
     */
    cacheShadowMapState(): void;
    /**
     * Restore the cached GL state after shadow map rendering.
     * Clears the temp state after restoring to prevent stale references.
     */
    restoreShadowMapState(): void;
    /**
     * Get the cached shadow state.
     * Returns the temporary state if available.
     */
    getShadowState(): {
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
    } | null;
    /**
     * Clear the shadow state cache (e.g., on context loss).
     */
    clearShadowStateCache(): void;
}
//# sourceMappingURL=GPUResourceCache.d.ts.map