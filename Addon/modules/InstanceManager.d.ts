import { InstanceData, IInstanceManager, IGPUResourceManager, type AnimationOptions, AnimationEventCallback } from './types';
import { ModelLoader } from './ModelLoader';
import { Model } from './Model';
import { AnimationController } from './AnimationController';
import { mat4 } from 'gl-matrix';
import { ShadowMapManager } from './ShadowMapManager';
export declare class InstanceManager implements IInstanceManager {
    private gpuResources;
    private gl;
    private modelLoader;
    private instances;
    instancesByModel: Map<string, Set<number>>;
    private defaultShaderProgram;
    private shadowMapShader;
    private shadowMapManager;
    debugShadowMap: boolean;
    private uniformCache;
    private instanceBuffers;
    private nextInstanceId;
    private dirtyInstances;
    private lastRenderTick;
    private cachedModelsInWorker;
    private _animationController;
    private frustum;
    constructor(gl: WebGL2RenderingContext, modelLoader: ModelLoader, gpuResources: IGPUResourceManager);
    initialize(): void;
    createViewProjection(fov: number, resolution: {
        width: number;
        height: number;
    }, near: number, far: number, eye: Float32Array, center: Float32Array, up: Float32Array): {
        view: mat4;
        projection: mat4;
    };
    createModel(modelId: string, animationName?: string): Model | null;
    deleteModel(instanceId: number): void;
    updateInstance(instanceId: number, deltaTime: number): void;
    render(viewProjection: {
        view: mat4;
        projection: mat4;
    }, tick?: number, nearPlaneOffset?: number): void;
    markInstanceDirty(instanceId: number): void;
    invalidateAnimationCache(instanceId: number): void;
    setModelBindPose(instance: Model): void;
    updateModelAnimation(instance: Model, deltaTime: number): void;
    private createError;
    private addToModelGroup;
    private removeFromModelGroup;
    updateAnimation(instance: InstanceData, deltaTime: number): void;
    private updateWorldMatrix;
    private isInstanceVisible;
    renderModelInstances(modelId: string, instanceGroup: Set<number>, viewProjection: {
        view: mat4;
        projection: mat4;
    }, nearPlaneOffset?: number): void;
    renderShadowMapInstances(modelId: string, instanceGroup: Set<number>, viewProjection: {
        view: mat4;
        projection: mat4;
    }): void;
    startAnimation(model: Model, animationName: string, options?: AnimationOptions): void;
    private cleanupInstance;
    setDebugShadowMap(enabled: boolean): void;
    setUseAnimationWorker(enabled: boolean): Promise<void>;
    registerAnimationCallback(instanceId: number, callback: AnimationEventCallback): void;
    unregisterAnimationCallback(instanceId: number): void;
    private cacheModelInWorkerIfNeeded;
    /**
     * Gets the shadow map manager instance.
     * @returns The shadow map manager
     */
    getShadowMapManager(): ShadowMapManager;
    enableModelNode(nodeName: string, instance: Model): void;
    get animationController(): AnimationController;
    /**
     * Sets the material for a specific node (and all its primitives).
     * @param instance The model instance
     * @param nodeName The name of the node
     * @param materialIndex The material index to use
     */
    setInstanceMaterial(instance: Model, nodeName: string, materialIndex: number): void;
    /**
     * Gets the world position of a bone/joint by name for a specific instance.
     * @param instanceId The numeric ID of the model instance
     * @param boneName The name of the bone/joint
     * @returns [x, y, z] world position or null if bone/instance not found
     */
    getBoneWorldPosition(instanceId: number, boneName: string): [number, number, number] | null;
    /**
     * Gets the world position of a bone/joint by index for a specific instance.
     * @param instanceId The numeric ID of the model instance
     * @param boneIndex The index of the bone/joint
     * @returns [x, y, z] world position or null if bone/instance not found
     */
    getBoneWorldPositionByIndex(instanceId: number, boneIndex: number): [number, number, number] | null;
}
//# sourceMappingURL=InstanceManager.d.ts.map