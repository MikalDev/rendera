(function () {
    'use strict';

    // AnimationWorker.ts - Handles animation calculations in a web worker
    /// <reference lib="webworker" />
    // Debug: Log worker startup
    console.log('[AnimationWorker] Starting initialization...');
    console.log('[AnimationWorker] Worker location:', self.location.href);
    // Import gl-matrix - use absolute path from worker location
    // Worker is at /scripts/plugins/rendera/c3runtime/modules/workers/, gl-matrix is at /scripts/plugins/rendera/c3runtime/modules/
    try {
        console.log('[AnimationWorker] Worker location:', self.location.href);
        // For Construct 3 preview, we need to construct the absolute path
        const workerPath = self.location.href;
        const baseUrl = workerPath.substring(0, workerPath.lastIndexOf('/workers/'));
        const glMatrixPath = baseUrl + '/gl-matrix-umd.js';
        console.log('[AnimationWorker] Attempting to import gl-matrix from:', glMatrixPath);
        importScripts(glMatrixPath);
        console.log('[AnimationWorker] Successfully imported gl-matrix');
    }
    catch (e) {
        console.error('[AnimationWorker] Failed to import gl-matrix:', e.message);
        console.error('[AnimationWorker] Worker path was:', self.location.href);
        // Try relative path as fallback
        try {
            console.log('[AnimationWorker] Trying relative path: ../gl-matrix-umd.js');
            importScripts('../gl-matrix-umd.js');
            console.log('[AnimationWorker] Successfully imported gl-matrix from relative path');
        }
        catch (e2) {
            console.error('[AnimationWorker] Relative import also failed:', e2.message);
            throw new Error('Could not load gl-matrix library');
        }
    }
    // Extract the modules we need from glMatrix
    let mat4;
    let vec3;
    let vec4;
    let quat;
    // After importing, extract the modules
    try {
        if (typeof glMatrix !== 'undefined') {
            mat4 = glMatrix.mat4;
            vec3 = glMatrix.vec3;
            vec4 = glMatrix.vec4;
            quat = glMatrix.quat;
            console.log('[AnimationWorker] gl-matrix modules extracted successfully');
        }
        else {
            throw new Error('glMatrix global not found after import');
        }
    }
    catch (e) {
        console.error('[AnimationWorker] Failed to extract gl-matrix modules:', e);
    }
    const modelCache = new Map();
    // Send ready message immediately after initialization
    self.postMessage({ type: 'WORKER_READY' });
    // Main message handler
    self.onmessage = (event) => {
        const { type } = event.data;
        if (type === 'CACHE_MODEL') {
            const { modelId, nodeIndex, inverseBindMatrices, jointIndices } = event.data;
            // Store model data in cache
            modelCache.set(modelId, {
                nodeIndex,
                inverseBindMatrices: new Float32Array(inverseBindMatrices),
                jointIndices: new Uint16Array(jointIndices)
            });
            console.log('[AnimationWorker] Cached model data:', {
                modelId,
                nodeIndex,
                jointCount: jointIndices.length,
                cacheSize: modelCache.size
            });
            self.postMessage({ type: 'MODEL_CACHED', modelId });
        }
        else if (type === 'CALCULATE_BONES') {
            const { instanceId, requestId, modelId, nodeIndex, nodeMatrices } = event.data;
            try {
                // Get cached model data
                const cache = modelCache.get(modelId);
                if (!cache) {
                    throw new Error(`Model data not cached for: ${modelId}`);
                }
                const boneMatrices = calculateBoneMatricesWithCache(nodeMatrices, cache.inverseBindMatrices, cache.jointIndices, nodeIndex);
                // Send result back with transferable
                const response = {
                    type: 'BONES_CALCULATED',
                    instanceId,
                    requestId,
                    boneMatrices
                };
                self.postMessage(response, [boneMatrices.buffer]);
            }
            catch (error) {
                console.error('[AnimationWorker] Error calculating bones:', error);
            }
        }
        else {
            console.warn('[AnimationWorker] Unknown message type:', type);
        }
    };
    // Core bone matrix calculation with cached data
    function calculateBoneMatricesWithCache(nodeMatrices, inverseBindMatrices, jointIndices, nodeIndex) {
        const jointCount = jointIndices.length;
        const boneMatrices = new Float32Array(jointCount * 16);
        // Extract node's world matrix (first 16 floats) and invert it
        const nodeMatrix = new Float32Array(16);
        for (let i = 0; i < 16; i++) {
            nodeMatrix[i] = nodeMatrices[i];
        }
        const nodeInverseMatrix = mat4.create();
        mat4.invert(nodeInverseMatrix, nodeMatrix);
        // Calculate bone matrix for each joint
        for (let j = 0; j < jointCount; j++) {
            // Joint matrices now start at offset 16
            const jointMatrix = new Float32Array(16);
            const jointMatrixOffset = 16 + (j * 16);
            // Extract joint matrix
            for (let i = 0; i < 16; i++) {
                jointMatrix[i] = nodeMatrices[jointMatrixOffset + i];
            }
            // Extract inverse bind matrix
            const inverseBindMatrix = new Float32Array(16);
            const invBindOffset = j * 16;
            for (let i = 0; i < 16; i++) {
                inverseBindMatrix[i] = inverseBindMatrices[invBindOffset + i];
            }
            // Calculate: bone = nodeInverse * joint * inverseBind
            const boneMatrix = mat4.create();
            mat4.multiply(boneMatrix, nodeInverseMatrix, jointMatrix);
            mat4.multiply(boneMatrix, boneMatrix, inverseBindMatrix);
            // Store result
            const boneOffset = j * 16;
            for (let i = 0; i < 16; i++) {
                boneMatrices[boneOffset + i] = boneMatrix[i];
            }
        }
        return boneMatrices;
    }
    // Verify gl-matrix is available
    console.log('[AnimationWorker] Verifying gl-matrix availability:', {
        mat4Available: typeof mat4 !== 'undefined',
        mat4Create: typeof (mat4 === null || mat4 === void 0 ? void 0 : mat4.create) === 'function',
        mat4Multiply: typeof (mat4 === null || mat4 === void 0 ? void 0 : mat4.multiply) === 'function',
        mat4Invert: typeof (mat4 === null || mat4 === void 0 ? void 0 : mat4.invert) === 'function'
    });
    // Log that worker is ready
    console.log('[AnimationWorker] Worker fully initialized and ready to receive messages');

})();
