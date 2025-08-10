import { Animation, Node } from '@gltf-transform/core';
interface AnimationResult {
    nodeTransforms: Float32Array;
    animationMatrices: Float32Array;
    boneMatricesMap?: Map<number, Float32Array>;
}
export declare class AnimationWorkerManager {
    private worker;
    private pendingRequests;
    private isInitialized;
    private isWorkerReady;
    private requestCounter;
    private cachedModels;
    private instanceCache;
    constructor();
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
    isModelReady(modelId: string): boolean;
    requestAnimation(instanceId: number, modelId: string, animationName: string, animationTime: number, loop: boolean, needsBones: boolean, callback: (result: AnimationResult) => void): void;
    /** @deprecated Use requestAnimation for better performance */
    computeAnimation(instanceId: number, modelId: string, animationName: string, animationTime: number, loop: boolean, needsBones: boolean): Promise<AnimationResult>;
    private handleWorkerMessage;
    private handleWorkerError;
    terminate(): void;
}
export {};
//# sourceMappingURL=AnimationWorkerManager.d.ts.map