export declare class AnimationWorkerManager {
    private worker;
    private pendingRequests;
    private isInitialized;
    private isWorkerReady;
    private requestCounter;
    private cachedModels;
    constructor();
    initialize(): Promise<void>;
    cacheModel(modelId: string, nodeIndex: number, inverseBindMatrices: Float32Array, jointIndices: Uint16Array): Promise<void>;
    calculateBoneMatrices(instanceId: number, modelId: string, nodeIndex: number, nodeMatrices: Float32Array, inverseBindMatrices: Float32Array, jointIndices: Uint16Array): Promise<Float32Array>;
    private handleWorkerMessage;
    private handleWorkerError;
    terminate(): void;
}
//# sourceMappingURL=AnimationWorkerManager.d.ts.map