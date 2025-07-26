import { IGPUResourceCache } from './types';
export declare class GPUResourceCache implements IGPUResourceCache {
    private gl;
    private cachedState;
    private static readonly TRACKED_UBO_BINDING_POINTS;
    constructor(gl: WebGL2RenderingContext);
    cacheModelMode(): void;
    restoreModelMode(): void;
    /**
     * Clean up texture bindings on units we use (1-17) to avoid conflicts with C3
     * We skip unit 0 as it will be restored from cached state
     */
    private cleanupTextureUnits;
}
//# sourceMappingURL=GPUResourceCache.d.ts.map