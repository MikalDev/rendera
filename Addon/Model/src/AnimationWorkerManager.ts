// AnimationWorkerManager.ts - Manages communication with animation worker
import { ExtendedNode } from './types';

interface WorkerRequest {
    resolve: (result: Float32Array) => void;
    reject: (error: Error) => void;
}

export class AnimationWorkerManager {
    private worker: Worker | null = null;
    private pendingRequests = new Map<number, WorkerRequest>();
    private isInitialized = false;
    private isWorkerReady = false;
    private requestCounter = 0;
    private cachedModels = new Set<string>();
    
    constructor() {
        // No runtime needed with standard Worker API
    }
    
    // Initialize worker (called when animation worker is enabled)
    public async initialize(): Promise<void> {
        console.log('[AnimationWorkerManager] initialize() called');
        if (this.isInitialized) {
            console.log('[AnimationWorkerManager] Already initialized, returning');
            return;
        }
        
        try {
            // Determine the worker URL based on context
            let workerUrl = 'c3runtime/modules/workers/AnimationWorker.js';
            
            // Check if we're running in a worker context
            if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
                console.log('[AnimationWorkerManager] Running in worker context');
                // When creating a worker from within a worker, URLs are relative to the worker's location
                workerUrl = new URL('./workers/AnimationWorker.js', self.location.href).href;
            } else if (typeof window !== 'undefined') {
                // We're in the main thread
                console.log('[AnimationWorkerManager] Window location:', {
                    href: window.location.href,
                    hostname: window.location.hostname,
                    pathname: window.location.pathname,
                    protocol: window.location.protocol
                });
                
                // Check if we're in Construct preview
                if (window.location.hostname.includes('preview.construct.net')) {
                    // For preview.construct.net, extract the path from the current document
                    console.log('[AnimationWorkerManager] Construct preview mode detected');
                    
                    // Get the current script path from the stack trace or document
                    let scriptPath = '';
                    try {
                        // Try to get script path from error stack
                        const err = new Error();
                        const stack = err.stack || '';
                        const match = stack.match(/https?:\/\/[^)]+\.js/);
                        if (match) {
                            scriptPath = new URL(match[0]).pathname;
                            console.log('[AnimationWorkerManager] Script path from stack:', scriptPath);
                        }
                    } catch (e) {
                        console.log('[AnimationWorkerManager] Could not extract script path from stack');
                    }
                    
                    // If we couldn't get it from stack, try looking for our script in the document
                    if (!scriptPath) {
                        const scripts = Array.from(document.getElementsByTagName('script'));
                        const ourScript = scripts.find(s => s.src.includes('rendera') && s.src.includes('index.js'));
                        if (ourScript) {
                            scriptPath = new URL(ourScript.src).pathname;
                            console.log('[AnimationWorkerManager] Script path from document:', scriptPath);
                        }
                    }
                    
                    // The script is at /scripts/plugins/rendera/c3runtime/modules/index.js
                    // So worker should be at /scripts/plugins/rendera/c3runtime/modules/workers/AnimationWorker.js
                    // Extract the base path up to and including 'rendera/'
                    const pathMatch = scriptPath.match(/^(.*\/rendera\/)/);
                    if (pathMatch) {
                        const basePath = pathMatch[1];
                        workerUrl = `${basePath}c3runtime/modules/workers/AnimationWorker.js`;
                        console.log('[AnimationWorkerManager] Using base path:', basePath);
                    } else {
                        // Try another approach - get everything before c3runtime
                        const altMatch = scriptPath.match(/^(.*\/)c3runtime\//);
                        if (altMatch) {
                            const basePath = altMatch[1];
                            workerUrl = `${basePath}c3runtime/modules/workers/AnimationWorker.js`;
                            console.log('[AnimationWorkerManager] Using alt base path:', basePath);
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
                        console.log('[AnimationWorkerManager] Developer mode detected');
                        const baseUrl = new URL('./', window.location.href).href;
                        workerUrl = new URL('c3runtime/modules/workers/AnimationWorker.js', baseUrl).href;
                    }
                }
            }
            
            console.log('[AnimationWorkerManager] Creating worker with URL:', workerUrl);
            console.log('[AnimationWorkerManager] Current location:', window.location.href);
            
            try {
                // First try creating an inline worker to test if workers are allowed at all
                try {
                    const blob = new Blob(['console.log("Inline worker test");'], { type: 'application/javascript' });
                    const testWorker = new Worker(URL.createObjectURL(blob));
                    console.log('[AnimationWorkerManager] Inline worker test successful');
                    testWorker.terminate();
                } catch (inlineError) {
                    console.error('[AnimationWorkerManager] Cannot create inline worker:', inlineError);
                    console.error('[AnimationWorkerManager] This might be a CSP issue');
                }
                
                this.worker = new Worker(workerUrl);
                console.log('[AnimationWorkerManager] Worker created successfully');
                
                // Set up message handler
                this.worker.onmessage = (event) => {
                    // Check for ready message
                    if (event.data.type === 'WORKER_READY') {
                        console.log('[AnimationWorkerManager] Worker is ready');
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
                console.log('[AnimationWorkerManager] Worker initialized');
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
    
    // Cache model data in worker
    public async cacheModel(
        modelId: string,
        nodeIndex: number,
        inverseBindMatrices: Float32Array,
        jointIndices: Uint16Array
    ): Promise<void> {
        if (!this.worker || !this.isInitialized || !this.isWorkerReady) {
            throw new Error('AnimationWorker not ready');
        }
        
        if (this.cachedModels.has(modelId)) {
            return; // Already cached
        }
        
        return new Promise((resolve) => {
            // Copy data for transfer
            const inverseBindMatricesCopy = new Float32Array(inverseBindMatrices);
            const jointIndicesCopy = new Uint16Array(jointIndices);
            
            // Send cache request
            this.worker!.postMessage({
                type: 'CACHE_MODEL',
                modelId,
                nodeIndex,
                inverseBindMatrices: inverseBindMatricesCopy,
                jointIndices: jointIndicesCopy
            }, [
                inverseBindMatricesCopy.buffer,
                jointIndicesCopy.buffer
            ]);
            
            this.cachedModels.add(modelId);
            
            // Cache message handler
            const cacheHandler = (event: MessageEvent) => {
                if (event.data.type === 'MODEL_CACHED' && event.data.modelId === modelId) {
                    this.worker!.removeEventListener('message', cacheHandler);
                    resolve();
                }
            };
            this.worker!.addEventListener('message', cacheHandler);
        });
    }
    
    // Calculate bone matrices using worker
    public calculateBoneMatrices(
        instanceId: number,
        modelId: string,
        nodeIndex: number,
        nodeMatrices: Float32Array,
        inverseBindMatrices: Float32Array,
        jointIndices: Uint16Array
    ): Promise<Float32Array> {
        if (!this.worker || !this.isInitialized || !this.isWorkerReady) {
            // Return a promise that rejects so the fallback can handle it
            return Promise.reject(new Error('AnimationWorker not ready'));
        }
        
        // Cache model data if not already cached
        if (!this.cachedModels.has(modelId)) {
            return this.cacheModel(modelId, nodeIndex, inverseBindMatrices, jointIndices)
                .then(() => this.calculateBoneMatrices(instanceId, modelId, nodeIndex, nodeMatrices, inverseBindMatrices, jointIndices));
        }
        
        return new Promise((resolve, reject) => {
            const requestId = ++this.requestCounter;
            
            // Store promise handlers
            this.pendingRequests.set(requestId, { resolve, reject });
            
            // Log data sizes once to understand performance
            if (this.requestCounter === 1) {
                const jointCount = (nodeMatrices.length - 16) / 16;
                console.log('[AnimationWorkerManager] Optimized data transfer per frame:', {
                    nodeMatrix: '1 matrix (16 floats, 64 bytes)',
                    jointMatrices: `${jointCount} matrices (${jointCount * 16} floats, ${jointCount * 64} bytes)`,
                    totalFloats: nodeMatrices.length,
                    totalKB: (nodeMatrices.byteLength / 1024).toFixed(2),
                    reduction: 'Zero-copy transfer using transferables'
                });
            }
            
            // Send to worker with zero-copy transfer
            // Debug timing for first few frames
            const startTime = this.requestCounter <= 3 ? performance.now() : 0;
            
            this.worker!.postMessage({
                type: 'CALCULATE_BONES',
                instanceId,
                requestId,
                modelId,
                nodeIndex,
                nodeMatrices: nodeMatrices
            }, [
                nodeMatrices.buffer
            ]);
            
            if (this.requestCounter <= 3) {
                console.log(`[AnimationWorkerManager] postMessage took ${(performance.now() - startTime).toFixed(2)}ms`);
            }
        });
    }
    
    // Handle worker responses
    private handleWorkerMessage(event: MessageEvent): void {
        const { type, requestId, boneMatrices } = event.data;
        
        if (type === 'BONES_CALCULATED') {
            const request = this.pendingRequests.get(requestId);
            if (request) {
                this.pendingRequests.delete(requestId);
                request.resolve(boneMatrices);
            } else {
                console.warn('[AnimationWorkerManager] No pending request found for requestId:', requestId);
            }
        } else if (type !== 'WORKER_READY') {
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
            console.log('[AnimationWorkerManager] Worker terminated');
        }
    }
}