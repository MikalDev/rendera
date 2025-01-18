import { IGPUResourceCache } from './types';
export declare class GPUResourceCache implements IGPUResourceCache {
    private gl;
    private cachedState;
    constructor(gl: WebGL2RenderingContext);
    cacheModelMode(): void;
    restoreModelMode(): void;
}
//# sourceMappingURL=GPUResourceCache.d.ts.map