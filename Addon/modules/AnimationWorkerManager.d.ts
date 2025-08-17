import { Animation, Node } from '@gltf-transform/core';
interface AnimationResult {
    nodeTransforms: Float32Array;
    animationMatrices: Float32Array;
    boneMatricesMap?: Map<number, Float32Array>;
}
export declare class AnimationWorkerManager {
    private workers;
    private workerCount;
    private pendingRequests;
    private isInitialized;
    private workerReadyStates;
    private requestCounter;
    private cachedModels;
    private instanceCache;
    private pendingCacheRequests;
    constructor();
    private areAllWorkersReady;
    private processPendingCacheRequests;
    initialize(): Promise<void>;
    cacheModel(modelId: string, modelData: {
        nodes: Node[];
        animations: Map<string, Animation>;
        skins: Array<{
            nodeIndex: number;
            inverseBindMatrices: Float32Array;
            jointIndices: Uint16Array;
        }>;
    }): Promise<void>;
    private cacheModelInternal;
    isModelReady(modelId: string): boolean;
    getWorkerPoolStatus(): {
        workerCount: number;
        workersInitialized: number;
        allReady: boolean;
        isInitialized: boolean;
    };
    requestAnimation(instanceId: number, modelId: string, animationName: string, animationTime: number, loop: boolean, needsBones: boolean, blendSource: Float32Array | undefined, blendDuration: number | undefined, callback: (result: AnimationResult) => void): void;
    /** @deprecated Use requestAnimation for better performance */
    computeAnimation(instanceId: number, modelId: string, animationName: string, animationTime: number, loop: boolean, needsBones: boolean): Promise<AnimationResult>;
    private handleWorkerMessage;
    private handleWorkerError;
    terminate(): void;
}
export {};
//# sourceMappingURL=AnimationWorkerManager.d.ts.map