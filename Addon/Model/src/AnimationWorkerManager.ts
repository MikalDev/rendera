// AnimationWorkerManager.ts - Manages per-instance animation worker communication
import { ExtendedNode } from './types';
import { Animation, Node } from '@gltf-transform/core';

interface WorkerRequest {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    instanceId: number;
}

interface AnimationResult {
    nodeTransforms: Float32Array;
    animationMatrices: Float32Array;
    boneMatricesMap?: Map<number, Float32Array>;
}

export class AnimationWorkerManager {
    private workers: Worker[] = [];
    private workerCount: number = 4;
    private pendingRequests = new Map<number, WorkerRequest>();
    private isInitialized = false;
    private workerReadyStates: boolean[] = [];
    private requestCounter = 0;
    private cachedModels = new Set<string>();
    private instanceCache = new Map<number, { modelId: string; lastTime: number; }>();
    private pendingCacheRequests: Array<{
        modelId: string;
        modelData: any;
        resolve: () => void;
        reject: (error: Error) => void;
    }> = [];
    
    constructor() {
        // No runtime needed with standard Worker API
    }
    
    private areAllWorkersReady(): boolean {
        return this.workerReadyStates.length === this.workerCount && 
               this.workerReadyStates.every(ready => ready);
    }
    
    private async processPendingCacheRequests(): Promise<void> {
        if (this.pendingCacheRequests.length === 0) return;
        
        
        // Process all pending requests
        const requests = [...this.pendingCacheRequests];
        this.pendingCacheRequests = [];
        
        for (const request of requests) {
            try {
                await this.cacheModelInternal(request.modelId, request.modelData);
                request.resolve();
            } catch (error) {
                request.reject(error as Error);
            }
        }
    }
    
    // Initialize workers (called when animation worker is enabled)
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }
        
        
        try {
            // Simple worker URL resolution - relative to the HTML page
            // In export: HTML is at root, worker at scripts/plugins/rendera/c3runtime/modules/workers/
            // In preview: different structure, needs absolute path
            let workerUrl = 'scripts/plugins/rendera/c3runtime/modules/workers/AnimationWorker.js';
            
            // Check if we're in Construct preview/editor  
            if (typeof window !== 'undefined' && window.location.hostname.includes('construct.net')) {
                // In preview, needs absolute path
                workerUrl = '/scripts/plugins/rendera/c3runtime/modules/workers/AnimationWorker.js';
            }
            
            // Initialize worker arrays
            this.workers = [];
            this.workerReadyStates = [];
            
            // Create all workers in parallel
            const workerPromises: Promise<void>[] = [];
            
            for (let i = 0; i < this.workerCount; i++) {
                const workerPromise = new Promise<void>((resolve, reject) => {
                    try {
                        const worker = new Worker(workerUrl);
                        const workerIndex = i;
                        
                        // Initialize ready state
                        this.workerReadyStates[workerIndex] = false;
                        
                        // Set up message handler with worker index
                        worker.onmessage = (event) => {
                            // Check for ready message
                            if (event.data.type === 'WORKER_READY') {
                                this.workerReadyStates[workerIndex] = true;
                                resolve();
                            }
                            
                            this.handleWorkerMessage(event);
                        };
                        
                        worker.onerror = (error) => {
                            console.error(`[AnimationWorkerManager] Worker ${workerIndex} error:`, error);
                            console.error('[AnimationWorkerManager] Worker URL was:', workerUrl);
                            this.handleWorkerError(error);
                            reject(error);
                        };
                        
                        this.workers[workerIndex] = worker;
                        
                    } catch (err) {
                        console.error(`[AnimationWorkerManager] Failed to create worker ${i}:`, err);
                        reject(err);
                    }
                });
                
                workerPromises.push(workerPromise);
            }
            
            // Wait for all workers to be ready
            await Promise.all(workerPromises);
            
            this.isInitialized = true;
            
            // Process any pending cache requests
            await this.processPendingCacheRequests();
            
        } catch (error) {
            console.error('[AnimationWorkerManager] Failed to initialize workers:', error);
            // Clean up any partially created workers
            this.terminate();
            this.isInitialized = false;
        }
    }
    
    // Unified model caching - sends ALL model data in one message
    public async cacheModel(
        modelId: string,
        modelData: {
            nodes: Node[];
            animations: Map<string, Animation>;
            skins: Array<{
                nodeIndex: number;
                inverseBindMatrices: Float32Array;
                jointIndices: Uint16Array;
            }>;
        }
    ): Promise<void> {
        if (this.cachedModels.has(modelId)) {
            return; // Already cached
        }
        
        if (!this.isInitialized || !this.areAllWorkersReady()) {
            // Queue the request for when workers are ready
            return new Promise((resolve, reject) => {
                this.pendingCacheRequests.push({
                    modelId,
                    modelData,
                    resolve,
                    reject
                });
            });
        }
        
        // Delegate to internal method that does the actual work
        return this.cacheModelInternal(modelId, modelData);
    }
    
    private async cacheModelInternal(
        modelId: string,
        modelData: {
            nodes: Node[];
            animations: Map<string, Animation>;
            skins: Array<{
                nodeIndex: number;
                inverseBindMatrices: Float32Array;
                jointIndices: Uint16Array;
            }>;
        }
    ): Promise<void> {
        // Prepare hierarchy data
        const nodeCount = modelData.nodes.length;
        const parentIndices = new Int32Array(nodeCount);
        const bindPoseTransforms = new Float32Array(nodeCount * 10);
        
        modelData.nodes.forEach((node, i) => {
            const extNode = node as ExtendedNode;
            parentIndices[i] = extNode.indexData.parentIndex ?? -1;
            
            const offset = i * 10;
            const translation = node.getTranslation() || [0, 0, 0];
            const rotation = node.getRotation() || [0, 0, 0, 1];
            const scale = node.getScale() || [1, 1, 1];
            
            bindPoseTransforms[offset] = translation[0];
            bindPoseTransforms[offset + 1] = translation[1];
            bindPoseTransforms[offset + 2] = translation[2];
            bindPoseTransforms[offset + 3] = rotation[0];
            bindPoseTransforms[offset + 4] = rotation[1];
            bindPoseTransforms[offset + 5] = rotation[2];
            bindPoseTransforms[offset + 6] = rotation[3];
            bindPoseTransforms[offset + 7] = scale[0];
            bindPoseTransforms[offset + 8] = scale[1];
            bindPoseTransforms[offset + 9] = scale[2];
        });
        
        // Prepare animations data
        const animationBatch: any[] = [];
        const transfers: ArrayBuffer[] = [];
        
        // Add hierarchy buffers to transfers
        transfers.push(parentIndices.buffer, bindPoseTransforms.buffer);
        
        for (const [animName, animation] of modelData.animations) {
            const channels: any[] = [];
            
            for (const channel of animation.listChannels()) {
                const sampler = channel.getSampler();
                const targetNode = channel.getTargetNode() as ExtendedNode;
                const targetPath = channel.getTargetPath();
                
                if (!sampler || !targetNode || !targetPath) continue;
                
                const input = sampler.getInput();
                const output = sampler.getOutput();
                if (!input || !output) continue;
                
                const times = new Float32Array(input.getArray()!);
                const values = new Float32Array(output.getArray()!);
                
                channels.push({
                    nodeIndex: targetNode.indexData.nodeIndex,
                    targetPath,
                    times,
                    values
                });
                
                transfers.push(times.buffer, values.buffer);
            }
            
            animationBatch.push({ name: animName, channels });
        }
        
        // Prepare skins data - no need to copy, arrays are already new from AnimationController
        const skinsData = modelData.skins.map(skin => {
            transfers.push(skin.inverseBindMatrices.buffer, skin.jointIndices.buffer);
            
            return {
                nodeIndex: skin.nodeIndex,
                inverseBindMatrices: skin.inverseBindMatrices,
                jointIndices: skin.jointIndices
            };
        });
        
        return new Promise((resolve) => {
            // Send model data to ALL workers
            const cachePromises: Promise<void>[] = [];
            
            for (let workerIndex = 0; workerIndex < this.workers.length; workerIndex++) {
                const worker = this.workers[workerIndex];
                
                // Create separate data copies for each worker (ArrayBuffers can only be transferred once)
                const workerParentIndices = new Int32Array(parentIndices);
                const workerBindPoseTransforms = new Float32Array(bindPoseTransforms);
                const workerTransfers: ArrayBuffer[] = [
                    workerParentIndices.buffer,
                    workerBindPoseTransforms.buffer
                ];
                
                // Copy animation data for this worker
                const workerAnimationBatch = animationBatch.map(anim => ({
                    name: anim.name,
                    channels: anim.channels.map((channel: any) => ({
                        nodeIndex: channel.nodeIndex,
                        targetPath: channel.targetPath,
                        times: new Float32Array(channel.times),
                        values: new Float32Array(channel.values)
                    }))
                }));
                
                // Add animation transfers for this worker
                for (const anim of workerAnimationBatch) {
                    for (const channel of anim.channels) {
                        workerTransfers.push(channel.times.buffer, channel.values.buffer);
                    }
                }
                
                // Copy skins data for this worker
                const workerSkinsData = skinsData.map(skin => ({
                    nodeIndex: skin.nodeIndex,
                    inverseBindMatrices: new Float32Array(skin.inverseBindMatrices),
                    jointIndices: new Uint16Array(skin.jointIndices)
                }));
                
                // Add skin transfers for this worker
                for (const skin of workerSkinsData) {
                    workerTransfers.push(skin.inverseBindMatrices.buffer, skin.jointIndices.buffer);
                }
                
                // Create promise for this worker
                const workerPromise = new Promise<void>((workerResolve) => {
                    const handler = (event: MessageEvent) => {
                        if (event.data.type === 'MODEL_CACHED' && event.data.modelId === modelId) {
                            worker.removeEventListener('message', handler);
                            workerResolve();
                        }
                    };
                    worker.addEventListener('message', handler);
                });
                
                // Send message to this worker
                worker.postMessage({
                    type: 'CACHE_MODEL',
                    modelId,
                    hierarchy: {
                        nodeCount,
                        parentIndices: workerParentIndices,
                        bindPoseTransforms: workerBindPoseTransforms
                    },
                    animations: workerAnimationBatch,
                    skins: workerSkinsData
                }, workerTransfers);
                
                cachePromises.push(workerPromise);
            }
            
            // Wait for all workers to confirm caching
            Promise.all(cachePromises).then(() => {
                // Mark as cached only after all workers confirm
                this.cachedModels.add(modelId);
                resolve();
            });
        });
    }
    
    
    // Check if model is cached and ready for animation
    public isModelReady(modelId: string): boolean {
        return this.cachedModels.has(modelId);
    }
    
    // Debug method to check worker pool status
    public getWorkerPoolStatus(): { 
        workerCount: number; 
        workersInitialized: number; 
        allReady: boolean; 
        isInitialized: boolean;
    } {
        return {
            workerCount: this.workerCount,
            workersInitialized: this.workers.length,
            allReady: this.areAllWorkersReady(),
            isInitialized: this.isInitialized
        };
    }
    
    // Fire-and-forget animation request with callback
    public requestAnimation(
        instanceId: number,
        modelId: string,
        animationName: string,
        animationTime: number,
        loop: boolean,
        needsBones: boolean,
        blendSource: Float32Array | undefined,
        blendDuration: number | undefined,
        callback: (result: AnimationResult) => void
    ): void {
        if (this.workers.length === 0 || !this.isInitialized || !this.areAllWorkersReady()) {
            return;
        }
        
        const requestId = ++this.requestCounter;
        
        // Select worker using round-robin based on instanceId (KISS approach)
        const workerIndex = instanceId % this.workers.length;
        const selectedWorker = this.workers[workerIndex];
        
        // Store callback instead of promise handlers
        this.pendingRequests.set(requestId, { 
            resolve: callback, 
            reject: (error) => console.error('[AnimationWorkerManager] Animation failed:', error),
            instanceId 
        });
        
        // Prepare message and transfers
        const message: any = {
            type: 'COMPUTE_ANIMATION',
            instanceId,
            requestId,
            modelId,
            animationName,
            animationTime,
            loop,
            needsBones
        };
        
        const transfers: ArrayBuffer[] = [];
        
        // Add blend parameters if provided
        if (blendSource && blendDuration) {
            message.blendSource = blendSource;
            message.blendDuration = blendDuration;
            transfers.push(blendSource.buffer);
        }
        
        // Send request to selected worker
        selectedWorker.postMessage(message, transfers);
    }
    
    // Keep the old method for backward compatibility but mark as deprecated
    /** @deprecated Use requestAnimation for better performance */
    public computeAnimation(
        instanceId: number,
        modelId: string,
        animationName: string,
        animationTime: number,
        loop: boolean,
        needsBones: boolean
    ): Promise<AnimationResult> {
        if (this.workers.length === 0 || !this.isInitialized || !this.areAllWorkersReady()) {
            return Promise.reject(new Error('AnimationWorkers not ready'));
        }
        
        return new Promise((resolve, reject) => {
            const requestId = ++this.requestCounter;
            
            // Select worker using round-robin based on instanceId (same as requestAnimation)
            const workerIndex = instanceId % this.workers.length;
            const selectedWorker = this.workers[workerIndex];
            
            // Store promise handlers
            this.pendingRequests.set(requestId, { resolve, reject, instanceId });
            
            selectedWorker.postMessage({
                type: 'COMPUTE_ANIMATION',
                instanceId,
                requestId,
                modelId,
                animationName,
                animationTime,
                loop,
                needsBones
            });
        });
    }
    
    // Handle worker responses
    private handleWorkerMessage(event: MessageEvent): void {
        const { type, requestId } = event.data;
        
        if (type === 'ANIMATION_COMPUTED') {
            const request = this.pendingRequests.get(requestId);
            if (request) {
                this.pendingRequests.delete(requestId);
                const result: AnimationResult = {
                    nodeTransforms: event.data.nodeTransforms,
                    animationMatrices: event.data.animationMatrices,
                    boneMatricesMap: event.data.boneMatricesMap
                };
                request.resolve(result);
            }
        } else if (type !== 'WORKER_READY' && 
                   type !== 'MODEL_CACHED') {
            console.warn('[AnimationWorkerManager] Unknown message type from worker:', type);
        }
    }
    
    // Handle worker errors
    private handleWorkerError(error: ErrorEvent): void {
        console.error('[AnimationWorkerManager] Worker error:', error);
        
        // Individual requests will timeout if the worker becomes unresponsive
        // This is more robust for multi-worker scenarios where one worker failing
        // shouldn't kill all animation processing
    }
    
    // Clean up workers
    public terminate(): void {
        for (const worker of this.workers) {
            worker.terminate();
        }
        this.workers = [];
        this.workerReadyStates = [];
        this.isInitialized = false;
        this.pendingRequests.clear();
        this.instanceCache.clear();
        
        // Reject any pending cache requests
        for (const request of this.pendingCacheRequests) {
            request.reject(new Error('Worker manager terminated'));
        }
        this.pendingCacheRequests = [];
    }
}