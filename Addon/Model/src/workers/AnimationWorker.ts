// AnimationWorker.ts - Handles animation calculations in a web worker
/// <reference lib="webworker" />

// Import gl-matrix
try {
    const workerPath = self.location.href;
    const baseUrl = workerPath.substring(0, workerPath.lastIndexOf('/workers/'));
    const glMatrixPath = baseUrl + '/gl-matrix-umd.js';
    importScripts(glMatrixPath);
} catch (e) {
    // Try relative path as fallback
    try {
        importScripts('../gl-matrix-umd.js');
    } catch (e2) {
        throw new Error('Could not load gl-matrix library');
    }
}

// Get gl-matrix types from global scope
declare const glMatrix: any;

// Extract the modules we need from glMatrix
const mat4 = glMatrix.mat4;
const vec3 = glMatrix.vec3;
const vec4 = glMatrix.vec4;
const quat = glMatrix.quat;

// Unified model caching request - sends ALL model data at once
interface CacheModelRequest {
    type: 'CACHE_MODEL';
    modelId: string;
    hierarchy: {
        nodeCount: number;
        parentIndices: Int32Array;  // -1 for root nodes
        bindPoseTransforms: Float32Array;  // 10 floats per node: tx,ty,tz, rx,ry,rz,rw, sx,sy,sz
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

// Compute full animation (keyframes + hierarchy + bones)
interface ComputeAnimationRequest {
    type: 'COMPUTE_ANIMATION';
    instanceId: number;
    requestId: number;
    modelId: string;
    animationName: string;
    animationTime: number;
    loop: boolean;
    needsBones: boolean;  // Only compute bones if model has skinning
}


// Full animation response with all transforms
interface ComputeAnimationResponse {
    type: 'ANIMATION_COMPUTED';
    instanceId: number;
    requestId: number;
    nodeTransforms: Float32Array;  // Packed: 10 floats per node
    animationMatrices: Float32Array;  // 16 floats per node
    boneMatricesMap?: Map<number, Float32Array>;  // Optional map of nodeIndex -> boneMatrices
}

// Animation channel structure
interface AnimationChannel {
    nodeIndex: number;
    targetPath: 'translation' | 'rotation' | 'scale';
    times: Float32Array;
    values: Float32Array;
}

// Model-specific caches
interface ModelCache {
    skins: Map<number, {  // nodeIndex -> skin data
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

// Instance-specific state
interface InstanceState {
    modelId: string;
    lastAnimationName?: string;
    lastAnimationTime?: number;
    cachedKeyframeIndices?: Map<string, number>;  // Channel key -> last keyframe index
}

const modelCache = new Map<string, ModelCache>();
const animationCache = new Map<string, Map<string, AnimationCache>>();  // modelId -> animName -> data
const hierarchyCache = new Map<string, HierarchyCache>();
const instanceStates = new Map<number, InstanceState>();

// Send ready message immediately after initialization
self.postMessage({ type: 'WORKER_READY' });

// Main message handler
self.onmessage = (event: MessageEvent) => {
    const { type } = event.data;
    
    if (type === 'CACHE_MODEL') {
        const { modelId, hierarchy, animations, skins } = event.data as CacheModelRequest;
        
        // Cache hierarchy
        hierarchyCache.set(modelId, {
            nodeCount: hierarchy.nodeCount,
            parentIndices: new Int32Array(hierarchy.parentIndices),
            bindPoseTransforms: new Float32Array(hierarchy.bindPoseTransforms)
        });
        
        // Cache animations
        const modelAnimations = new Map<string, AnimationCache>();
        for (const anim of animations) {
            // Find max duration from channels
            let duration = 0;
            for (const channel of anim.channels) {
                if (channel.times.length > 0) {
                    duration = Math.max(duration, channel.times[channel.times.length - 1]);
                }
            }
            modelAnimations.set(anim.name, { channels: anim.channels, duration });
        }
        animationCache.set(modelId, modelAnimations);
        
        // Cache skins
        const cache: ModelCache = { skins: new Map() };
        for (const skin of skins) {
            cache.skins.set(skin.nodeIndex, {
                inverseBindMatrices: new Float32Array(skin.inverseBindMatrices),
                jointIndices: new Uint16Array(skin.jointIndices)
            });
        }
        modelCache.set(modelId, cache);
        
        // Send single response when everything is cached
        self.postMessage({ 
            type: 'MODEL_CACHED', 
            modelId,
            animationCount: animations.length,
            skinCount: skins.length 
        });
        
    } else if (type === 'COMPUTE_ANIMATION') {
        handleComputeAnimation(event.data as ComputeAnimationRequest);
    } else {
        console.warn('[AnimationWorker] Unknown message type:', type);
    }
};


// Handle full animation computation request
function handleComputeAnimation(request: ComputeAnimationRequest): void {
    const { instanceId, requestId, modelId, animationName, animationTime, loop, needsBones } = request;
    
    try {
        // Get cached data
        const hierarchy = hierarchyCache.get(modelId);
        if (!hierarchy) {
            throw new Error(`Hierarchy not cached for model: ${modelId}`);
        }
        
        const animations = animationCache.get(modelId);
        const animation = animations?.get(animationName);
        if (!animation) {
            throw new Error(`Animation ${animationName} not cached for model: ${modelId}`);
        }
        
        // Get or create instance state
        let instanceState = instanceStates.get(instanceId);
        if (!instanceState) {
            instanceState = { 
                modelId,
                cachedKeyframeIndices: new Map()
            };
            instanceStates.set(instanceId, instanceState);
        } else {
            // Ensure cachedKeyframeIndices exists for existing instances
            if (!instanceState.cachedKeyframeIndices) {
                instanceState.cachedKeyframeIndices = new Map();
            }
        }
        
        // Update time with looping
        const time = loop ? (animationTime % animation.duration) : Math.min(animationTime, animation.duration);
        
        // Step 1: Interpolate keyframes to get node transforms
        const nodeTransforms = interpolateAnimation(
            animation,
            hierarchy,
            time,
            instanceState.cachedKeyframeIndices!
        );
        
        // Step 2: Compute hierarchy transforms
        const animationMatrices = computeHierarchyTransforms(
            nodeTransforms,
            hierarchy
        );
        
        // Step 3: Compute bone matrices if needed (for ALL skins)
        let boneMatricesMap: Map<number, Float32Array> | undefined;
        if (needsBones) {
            const modelData = modelCache.get(modelId);
            if (modelData) {
                boneMatricesMap = computeAllBoneMatricesFromHierarchy(
                    animationMatrices,
                    modelData,
                    hierarchy.nodeCount
                );
            }
        }
        
        // Update instance state
        instanceState.lastAnimationName = animationName;
        instanceState.lastAnimationTime = time;
        
        // Send response
        const response: ComputeAnimationResponse = {
            type: 'ANIMATION_COMPUTED',
            instanceId,
            requestId,
            nodeTransforms,
            animationMatrices,
            boneMatricesMap
        };
        
        // Transfer ownership of arrays
        const transfers: ArrayBuffer[] = [
            nodeTransforms.buffer,
            animationMatrices.buffer
        ];
        // Add all bone matrices to transfers
        if (boneMatricesMap) {
            for (const boneMatrices of boneMatricesMap.values()) {
                transfers.push(boneMatrices.buffer);
            }
        }
        
        self.postMessage(response, transfers);
        
    } catch (error) {
        console.error('[AnimationWorker] Error computing animation:', error);
    }
}

// Interpolate animation channels
function interpolateAnimation(
    animation: AnimationCache,
    hierarchy: HierarchyCache,
    time: number,
    keyframeCache: Map<string, number>
): Float32Array {
    // Start with bind pose
    const nodeTransforms = new Float32Array(hierarchy.bindPoseTransforms);
    
    // Apply animation channels
    for (const channel of animation.channels) {
        const { nodeIndex, targetPath, times, values } = channel;
        
        // Find keyframe indices
        const cacheKey = `${nodeIndex}_${targetPath}`;
        let startIdx = keyframeCache.get(cacheKey) || 0;
        
        // Binary search for correct keyframe
        const { startIndex, endIndex, factor } = findKeyframeIndices(times, time, startIdx);
        keyframeCache.set(cacheKey, startIndex);
        
        // Interpolate values
        const interpolated = interpolateValues(values, startIndex, endIndex, factor, targetPath);
        
        // Update node transforms (10 floats per node: tx,ty,tz, rx,ry,rz,rw, sx,sy,sz)
        const offset = nodeIndex * 10;
        if (targetPath === 'translation') {
            nodeTransforms[offset] = interpolated[0];
            nodeTransforms[offset + 1] = interpolated[1];
            nodeTransforms[offset + 2] = interpolated[2];
        } else if (targetPath === 'rotation') {
            nodeTransforms[offset + 3] = interpolated[0];
            nodeTransforms[offset + 4] = interpolated[1];
            nodeTransforms[offset + 5] = interpolated[2];
            nodeTransforms[offset + 6] = interpolated[3];
        } else if (targetPath === 'scale') {
            nodeTransforms[offset + 7] = interpolated[0];
            nodeTransforms[offset + 8] = interpolated[1];
            nodeTransforms[offset + 9] = interpolated[2];
        }
    }
    
    return nodeTransforms;
}

// Find keyframe indices using binary search
function findKeyframeIndices(
    times: Float32Array,
    time: number,
    hint: number = 0
): { startIndex: number; endIndex: number; factor: number } {
    // Check hint first
    if (hint < times.length - 1 && times[hint] <= time && time < times[hint + 1]) {
        const factor = (time - times[hint]) / (times[hint + 1] - times[hint]);
        return { startIndex: hint, endIndex: hint + 1, factor };
    }
    
    // Edge cases
    if (time <= times[0]) {
        return { startIndex: 0, endIndex: Math.min(1, times.length - 1), factor: 0 };
    }
    if (time >= times[times.length - 1]) {
        const lastIndex = times.length - 1;
        return { startIndex: Math.max(0, lastIndex - 1), endIndex: lastIndex, factor: 1 };
    }
    
    // Binary search
    let low = 0;
    let high = times.length - 1;
    
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (mid + 1 < times.length && times[mid] <= time && time < times[mid + 1]) {
            const factor = (time - times[mid]) / (times[mid + 1] - times[mid]);
            return { startIndex: mid, endIndex: mid + 1, factor };
        }
        
        if (times[mid] > time) {
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    
    return { startIndex: 0, endIndex: 0, factor: 0 };
}

// Interpolate between keyframe values
function interpolateValues(
    values: Float32Array,
    startIndex: number,
    endIndex: number,
    factor: number,
    targetPath: string
): Float32Array {
    const stride = targetPath === 'rotation' ? 4 : 3;
    const start = values.subarray(startIndex * stride, (startIndex + 1) * stride);
    const end = values.subarray(endIndex * stride, (endIndex + 1) * stride);
    
    const result = new Float32Array(stride);
    
    if (targetPath === 'rotation') {
        // Spherical linear interpolation for quaternions
        quat.slerp(result, start as Float32Array, end as Float32Array, factor);
        quat.normalize(result, result);
    } else {
        // Linear interpolation for translation/scale
        vec3.lerp(result, start as Float32Array, end as Float32Array, factor);
    }
    
    return result;
}

// Compute hierarchy transforms (world matrices)
function computeHierarchyTransforms(
    nodeTransforms: Float32Array,
    hierarchy: HierarchyCache
): Float32Array {
    const { nodeCount, parentIndices } = hierarchy;
    const animationMatrices = new Float32Array(nodeCount * 16);
    
    // Process nodes in order (parents before children)
    for (let i = 0; i < nodeCount; i++) {
        const offset = i * 10;
        const translation = nodeTransforms.subarray(offset, offset + 3);
        const rotation = nodeTransforms.subarray(offset + 3, offset + 7);
        const scale = nodeTransforms.subarray(offset + 7, offset + 10);
        
        // Create local matrix
        const localMatrix = mat4.create();
        mat4.fromRotationTranslationScale(localMatrix, rotation, translation, scale);
        
        // Apply parent transform
        const parentIndex = parentIndices[i];
        if (parentIndex >= 0) {
            const parentMatrix = animationMatrices.subarray(parentIndex * 16, (parentIndex + 1) * 16);
            mat4.multiply(localMatrix, parentMatrix, localMatrix);
        }
        
        // Store world matrix
        animationMatrices.set(localMatrix, i * 16);
    }
    
    return animationMatrices;
}

// Compute bone matrices for ALL skins from hierarchy transforms
function computeAllBoneMatricesFromHierarchy(
    animationMatrices: Float32Array,
    modelData: ModelCache,
    nodeCount: number
): Map<number, Float32Array> {
    // Return a map of nodeIndex -> boneMatrices for better efficiency
    const allBoneMatrices = new Map<number, Float32Array>();
    
    // Process each skin
    for (const [nodeIndex, skinData] of modelData.skins) {
        const { inverseBindMatrices, jointIndices } = skinData;
        const jointCount = jointIndices.length;
        const boneMatrices = new Float32Array(jointCount * 16);
        
        // Get node's world matrix and invert it
        const nodeMatrix = animationMatrices.subarray(nodeIndex * 16, (nodeIndex + 1) * 16);
        const nodeInverseMatrix = mat4.create();
        mat4.invert(nodeInverseMatrix, nodeMatrix);
        
        // Calculate bone matrix for each joint
        for (let j = 0; j < jointCount; j++) {
            const jointIdx = jointIndices[j];
            const jointMatrix = animationMatrices.subarray(jointIdx * 16, (jointIdx + 1) * 16);
            
            // Extract inverse bind matrix
            const inverseBindMatrix = inverseBindMatrices.subarray(j * 16, (j + 1) * 16);
            
            // Calculate: bone = nodeInverse * joint * inverseBind
            const boneMatrix = mat4.create();
            mat4.multiply(boneMatrix, nodeInverseMatrix, jointMatrix);
            mat4.multiply(boneMatrix, boneMatrix, inverseBindMatrix);
            
            // Store result
            boneMatrices.set(boneMatrix, j * 16);
        }
        
        allBoneMatrices.set(nodeIndex, boneMatrices);
    }
    
    return allBoneMatrices;
}

