import { InstanceData, IInstanceManager, IGPUResourceManager } from './types';
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
    private instanceBuffers;
    private nextInstanceId;
    private dirtyInstances;
    private lastRenderTick;
    private cachedModelsInWorker;
    private _animationController;
    constructor(gl: WebGL2RenderingContext, modelLoader: ModelLoader, gpuResources: IGPUResourceManager);
    initialize(): void;
    createViewProjection(fov: number, resolution: {
        width: number;
        height: number;
    }, near: number, far: number, eye: Float32Array, center: Float32Array, up: Float32Array): {
        view: mat4;
        projection: mat4;
    };
    createModel(modelId: string, animationName?: string): Model;
    deleteModel(instanceId: number): void;
    updateInstance(instanceId: number, deltaTime: number): void;
    render(viewProjection: {
        view: mat4;
        projection: mat4;
    }, tick?: number): void;
    markInstanceDirty(instanceId: number): void;
    invalidateAnimationCache(instanceId: number): void;
    setModelBindPose(instance: Model): void;
    updateModelAnimation(instance: Model, deltaTime: number): void;
    private createError;
    private addToModelGroup;
    private removeFromModelGroup;
    updateAnimation(instance: InstanceData, deltaTime: number): void;
    private updateWorldMatrix;
    renderModelInstances(modelId: string, instanceGroup: Set<number>, viewProjection: {
        view: mat4;
        projection: mat4;
    }): void;
    renderShadowMapInstances(modelId: string, instanceGroup: Set<number>, viewProjection: {
        view: mat4;
        projection: mat4;
    }): void;
    private startAnimation;
    private cleanupInstance;
    setDebugShadowMap(enabled: boolean): void;
    setUseAnimationWorker(enabled: boolean): void;
    private cacheModelInWorkerIfNeeded;
    /**
     * Gets the shadow map manager instance.
     * @returns The shadow map manager
     */
    getShadowMapManager(): ShadowMapManager;
    enableModelNode(nodeName: string, instance: Model): void;
    get animationController(): AnimationController;
}
//# sourceMappingURL=InstanceManager.d.ts.map