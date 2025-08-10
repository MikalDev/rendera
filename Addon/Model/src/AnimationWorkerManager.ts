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
    private worker: Worker | null = null;
    private pendingRequests = new Map<number, WorkerRequest>();
    private isInitialized = false;
    private isWorkerReady = false;
    private requestCounter = 0;
    private cachedModels = new Set<string>();
    private instanceCache = new Map<number, { modelId: string; lastTime: number; }>();
    
    constructor() {
        // No runtime needed with standard Worker API
    }
    
    // Initialize worker (called when animation worker is enabled)
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Determine the worker URL based on context
            let workerUrl = 'c3runtime/modules/workers/AnimationWorker.js';
            
            // Check if we're running in a worker context
            if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
                // When creating a worker from within a worker, URLs are relative to the worker's location
                workerUrl = new URL('./workers/AnimationWorker.js', self.location.href).href;
            } else if (typeof window !== 'undefined') {
                
                // Check if we're in Construct preview
                if (window.location.hostname.includes('preview.construct.net')) {
                    
                    // Get the current script path from the stack trace or document
                    let scriptPath = '';
                    try {
                        // Try to get script path from error stack
                        const err = new Error();
                        const stack = err.stack || '';
                        const match = stack.match(/https?:\/\/[^)]+\.js/);
                        if (match) {
                            scriptPath = new URL(match[0]).pathname;
                        }
                    } catch (e) {
                        // Ignore
                    }
                    
                    // If we couldn't get it from stack, try looking for our script in the document
                    if (!scriptPath) {
                        const scripts = Array.from(document.getElementsByTagName('script'));
                        const ourScript = scripts.find(s => s.src.includes('rendera') && s.src.includes('index.js'));
                        if (ourScript) {
                            scriptPath = new URL(ourScript.src).pathname;
                        }
                    }
                    
                    // The script is at /scripts/plugins/rendera/c3runtime/modules/index.js
                    // So worker should be at /scripts/plugins/rendera/c3runtime/modules/workers/AnimationWorker.js
                    // Extract the base path up to and including 'rendera/'
                    const pathMatch = scriptPath.match(/^(.*\/rendera\/)/);
                    if (pathMatch) {
                        const basePath = pathMatch[1];
                        workerUrl = `${basePath}c3runtime/modules/workers/AnimationWorker.js`;
                    } else {
                        // Try another approach - get everything before c3runtime
                        const altMatch = scriptPath.match(/^(.*\/)c3runtime\//);
                        if (altMatch) {
                            const basePath = altMatch[1];
                            workerUrl = `${basePath}c3runtime/modules/workers/AnimationWorker.js`;
                        } else {
                            // Fallback
                            workerUrl = 'c3runtime/modules/workers/AnimationWorker.js';
                        }
                    }
                } else {
                    // Local development
                    const isDeveloperMode = window.location.protocol === 'file:' || 
                                           window.location.hostname === 'localhost' ||
                                           window.location.hostname === '127.0.0.1';
                    
                    if (isDeveloperMode) {
                        const baseUrl = new URL('./', window.location.href).href;
                        workerUrl = new URL('c3runtime/modules/workers/AnimationWorker.js', baseUrl).href;
                    }
                }
            }
            
            
            try {
                this.worker = new Worker(workerUrl);
                
                // Set up message handler
                this.worker.onmessage = (event) => {
                    // Check for ready message
                    if (event.data.type === 'WORKER_READY') {
                        this.isWorkerReady = true;
                    }
                    
                    this.handleWorkerMessage(event);
                };
                
                this.worker.onerror = (error) => {
                    console.error('[AnimationWorkerManager] Worker error event:', error);
                    console.error('[AnimationWorkerManager] Worker URL was:', workerUrl);
                    console.error('[AnimationWorkerManager] Error type:', error.type);
                    console.error('[AnimationWorkerManager] Error filename:', (error as any).filename);
                    console.error('[AnimationWorkerManager] Error lineno:', (error as any).lineno);
                    console.error('[AnimationWorkerManager] Error message:', (error as any).message);
                    this.handleWorkerError(error);
                };
                
                this.isInitialized = true;
            } catch (err) {
                console.error('[AnimationWorkerManager] Failed to create worker:', err);
                throw err;
            }
        } catch (error) {
            console.error('[AnimationWorkerManager] Failed to initialize worker:', error);
            // Don't throw - just mark as not initialized
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
        if (!this.worker || !this.isInitialized || !this.isWorkerReady) {
            throw new Error('AnimationWorker not ready');
        }
        
        if (this.cachedModels.has(modelId)) {
            return; // Already cached
        }
        
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
            // Send everything in one message
            this.worker!.postMessage({
                type: 'CACHE_MODEL',
                modelId,
                hierarchy: {
                    nodeCount,
                    parentIndices,
                    bindPoseTransforms
                },
                animations: animationBatch,
                skins: skinsData
            }, transfers);
            
            // Mark as cached immediately
            this.cachedModels.add(modelId);
            
            // Wait for confirmation
            const handler = (event: MessageEvent) => {
                if (event.data.type === 'MODEL_CACHED' && event.data.modelId === modelId) {
                    this.worker!.removeEventListener('message', handler);
                    resolve();
                }
            };
            this.worker!.addEventListener('message', handler);
        });
    }
    
    
    // Check if model is cached and ready for animation
    public isModelReady(modelId: string): boolean {
        return this.cachedModels.has(modelId);
    }
    
    // Fire-and-forget animation request with callback
    public requestAnimation(
        instanceId: number,
        modelId: string,
        animationName: string,
        animationTime: number,
        loop: boolean,
        needsBones: boolean,
        callback: (result: AnimationResult) => void
    ): void {
        if (!this.worker || !this.isInitialized || !this.isWorkerReady) {
            console.warn('[AnimationWorkerManager] Worker not ready for animation request');
            return;
        }
        
        const requestId = ++this.requestCounter;
        
        // Store callback instead of promise handlers
        this.pendingRequests.set(requestId, { 
            resolve: callback, 
            reject: (error) => console.error('[AnimationWorkerManager] Animation failed:', error),
            instanceId 
        });
        
        // Send request immediately without waiting
        this.worker!.postMessage({
            type: 'COMPUTE_ANIMATION',
            instanceId,
            requestId,
            modelId,
            animationName,
            animationTime,
            loop,
            needsBones
        });
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
        if (!this.worker || !this.isInitialized || !this.isWorkerReady) {
            return Promise.reject(new Error('AnimationWorker not ready'));
        }
        
        return new Promise((resolve, reject) => {
            const requestId = ++this.requestCounter;
            
            // Store promise handlers
            this.pendingRequests.set(requestId, { resolve, reject, instanceId });
            
            this.worker!.postMessage({
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
        
        // Reject all pending requests
        for (const [timestamp, request] of this.pendingRequests) {
            request.reject(new Error('Worker error: ' + error.message));
        }
        this.pendingRequests.clear();
    }
    
    // Clean up worker
    public terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;
            this.isWorkerReady = false;
            this.pendingRequests.clear();
            this.instanceCache.clear();
        }
    }
}