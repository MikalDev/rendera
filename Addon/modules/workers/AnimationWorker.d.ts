declare const glMatrix: any;
declare const mat4: any;
declare const vec3: any;
declare const vec4: any;
declare const quat: any;
interface CacheModelRequest {
    type: 'CACHE_MODEL';
    modelId: string;
    hierarchy: {
        nodeCount: number;
        parentIndices: Int32Array;
        bindPoseTransforms: Float32Array;
    };
    animations: Array<{
        name: string;
        channels: Array<{
            nodeIndex: number;
            targetPath: 'translation' | 'rotation' | 'scale';
            times: Float32Array;
            values: Float32Array;
        }>;
    }>;
    skins: Array<{
        nodeIndex: number;
        inverseBindMatrices: Float32Array;
        jointIndices: Uint16Array;
    }>;
}
interface ComputeAnimationRequest {
    type: 'COMPUTE_ANIMATION';
    instanceId: number;
    requestId: number;
    modelId: string;
    animationName: string;
    animationTime: number;
    loop: boolean;
    needsBones: boolean;
}
interface ComputeAnimationResponse {
    type: 'ANIMATION_COMPUTED';
    instanceId: number;
    requestId: number;
    nodeTransforms: Float32Array;
    animationMatrices: Float32Array;
    boneMatricesMap?: Map<number, Float32Array>;
}
interface AnimationChannel {
    nodeIndex: number;
    targetPath: 'translation' | 'rotation' | 'scale';
    times: Float32Array;
    values: Float32Array;
}
interface ModelCache {
    skins: Map<number, {
        inverseBindMatrices: Float32Array;
        jointIndices: Uint16Array;
    }>;
}
interface AnimationCache {
    channels: AnimationChannel[];
    duration: number;
}
interface HierarchyCache {
    nodeCount: number;
    parentIndices: Int32Array;
    bindPoseTransforms: Float32Array;
}
interface InstanceState {
    modelId: string;
    lastAnimationName?: string;
    lastAnimationTime?: number;
    cachedKeyframeIndices?: Map<string, number>;
}
declare const modelCache: Map<string, ModelCache>;
declare const animationCache: Map<string, Map<string, AnimationCache>>;
declare const hierarchyCache: Map<string, HierarchyCache>;
declare const instanceStates: Map<number, InstanceState>;
declare function handleComputeAnimation(request: ComputeAnimationRequest): void;
declare function interpolateAnimation(animation: AnimationCache, hierarchy: HierarchyCache, time: number, keyframeCache: Map<string, number>): Float32Array;
declare function findKeyframeIndices(times: Float32Array, time: number, hint?: number): {
    startIndex: number;
    endIndex: number;
    factor: number;
};
declare function interpolateValues(values: Float32Array, startIndex: number, endIndex: number, factor: number, targetPath: string): Float32Array;
declare function computeHierarchyTransforms(nodeTransforms: Float32Array, hierarchy: HierarchyCache): Float32Array;
declare function computeAllBoneMatricesFromHierarchy(animationMatrices: Float32Array, modelData: ModelCache, nodeCount: number): Map<number, Float32Array>;
//# sourceMappingURL=AnimationWorker.d.ts.map