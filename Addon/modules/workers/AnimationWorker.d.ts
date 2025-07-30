declare const glMatrix: any;
declare let mat4: any;
declare let vec3: any;
declare let vec4: any;
declare let quat: any;
interface CacheModelRequest {
    type: 'CACHE_MODEL';
    modelId: string;
    nodeIndex: number;
    inverseBindMatrices: Float32Array;
    jointIndices: Uint16Array;
}
interface AnimationRequest {
    type: 'CALCULATE_BONES';
    instanceId: number;
    requestId: number;
    modelId: string;
    nodeIndex: number;
    nodeMatrices: Float32Array;
}
interface AnimationResponse {
    type: 'BONES_CALCULATED';
    instanceId: number;
    requestId: number;
    boneMatrices: Float32Array;
}
interface ModelCache {
    nodeIndex: number;
    inverseBindMatrices: Float32Array;
    jointIndices: Uint16Array;
}
declare const modelCache: Map<string, ModelCache>;
declare function calculateBoneMatricesWithCache(nodeMatrices: Float32Array, inverseBindMatrices: Float32Array, jointIndices: Uint16Array, nodeIndex: number): Float32Array;
//# sourceMappingURL=AnimationWorker.d.ts.map