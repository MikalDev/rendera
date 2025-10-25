import { IGPUResourceCache } from './types';
import { WebGLState } from './WebGLStateTracker';
export declare class GPUResourceCache implements IGPUResourceCache {
    private gl;
    private cachedModelState;
    private cachedState;
    private static readonly TRACKED_UBO_BINDING_POINTS;
    private cachedShadowState;
    constructor(gl: WebGL2RenderingContext);
    cacheModelMode(): void;
    restoreModelMode(): void;
    /**
     * Clean up texture bindings on units we use (1-17) to avoid conflicts with C3
     * We skip unit 0 as it will be restored from cached state
     *
     * IMPORTANT: Uses original GL methods (via tracker) to avoid polluting tracker state
     * before restore() syncs it back to the snapshot.
     */
    private cleanupTextureUnits;
    /**
     * Cache the current GL state before shadow map rendering.
     * Uses WebGLStateTracker snapshot when available for better performance.
     */
    cacheShadowMapState(): void;
    /**
     * Restore the cached GL state after shadow map rendering.
     * Uses WebGLStateTracker for consistent state management.
     */
    restoreShadowMapState(): void;
    /**
     * Get the cached shadow state.
     * Returns the cached WebGLState snapshot if available.
     */
    getShadowState(): WebGLState | null;
    /**
     * Clear the shadow state cache (e.g., on context loss).
     */
    clearShadowStateCache(): void;
}
//# sourceMappingURL=GPUResourceCache.d.ts.map