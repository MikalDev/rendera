import { InstanceData, IInstanceManager, IGPUResourceManager, InstanceId, type AnimationOptions, NodeTransforms, AnimationEventCallback } from './types';
import { ModelLoader } from './ModelLoader';
import { Model } from './Model';
import { AnimationController } from './AnimationController';
import { mat3, mat4 } from 'gl-matrix';
import { ShadowMapManager } from './ShadowMapManager';
import { ShaderUniformCache } from './ShaderUniformCache';
import { Frustum } from './Frustum';

export class InstanceManager implements IInstanceManager {
    private gl: WebGL2RenderingContext;
    private modelLoader: ModelLoader;
    private instances: Map<number, InstanceData> = new Map();
    public instancesByModel: Map<string, Set<number>> = new Map();
    private defaultShaderProgram: WebGLProgram;
    private shadowMapShader: WebGLProgram;
    private shadowMapManager: ShadowMapManager;
    public debugShadowMap: boolean = false;

    // Shader uniform location cache
    private uniformCache: ShaderUniformCache;

    // Reusable matrices to avoid allocations in render loop
    private static readonly IDENTITY_MATRIX: mat4 = mat4.create();
    private static readonly COORD_CONVERSION: mat3 = mat3.fromValues(1, 0, 0, 0, -1, 0, 0, 0, -1);
    private readonly tempMatrix: mat4 = mat4.create();
    private readonly tempNormalMatrix: mat3 = mat3.create();
    
    // GPU instance data
    private instanceBuffers: Map<string, {
        modelMatrix: WebGLBuffer;
        jointMatrices: WebGLBuffer;
        count: number;
    }> = new Map();
    
    private nextInstanceId = 1;
    private dirtyInstances: Set<number> = new Set();
    private lastRenderTick = -1;
    private cachedModelsInWorker: Set<string> = new Set();
    private _animationController: AnimationController;
    private frustum: Frustum = new Frustum();

    constructor(
        gl: WebGL2RenderingContext,
        modelLoader: ModelLoader,
        private gpuResources: IGPUResourceManager
    ) {
        this.gl = gl;
        this.modelLoader = modelLoader;
        this._animationController = new AnimationController(modelLoader);
        this.defaultShaderProgram = this.gpuResources.getDefaultShader();
        this.shadowMapManager = new ShadowMapManager(gl, this.gpuResources);
        this.shadowMapManager.initialize(2048);
        this.shadowMapShader = this.gpuResources.getShadowMapShader();
        
        // Initialize uniform cache
        this.uniformCache = new ShaderUniformCache(gl);
    }

    initialize(): void {
        this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
        this.gl.bindVertexArray(null);
        this.gl.useProgram(null);

        this.dirtyInstances.clear();
        this.instanceBuffers.clear();
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        this.gl.enable(this.gl.SCISSOR_TEST);
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
        this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 4);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.lineWidth(1.0);
    }

    createViewProjection(
        fov: number,
        resolution: { width: number, height: number },
        near: number,
        far: number,
        eye: Float32Array,
        center: Float32Array,
        up: Float32Array,
    ): { view: mat4, projection: mat4 } {
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, fov * Math.PI / 180, resolution.width / resolution.height, near, far);
        const viewMatrix = mat4.create();
        mat4.lookAt(viewMatrix, eye, center, up);
        return { view: viewMatrix, projection: projectionMatrix };
    }

    createModel(modelId: string, animationName?: string): Model | null {
        // Verify model exists
        const modelData = this.modelLoader.getModelData(modelId);
        if (!modelData) {
            return null;
        }
        
        // Cache model in worker if not already cached (only once per model)
        // Note: This is async but we don't await it to avoid blocking instance creation
        // The first animation frame might fall back to main thread while caching completes
        this.cacheModelInWorkerIfNeeded(modelId).catch(error => {
            console.error(`[InstanceManager] Failed to cache model ${modelId}:`, error);
        });

        // Create instance data
        const instanceId: InstanceId = {
            id: this.nextInstanceId++,
            modelId
        };

            if (modelData.animations.size > 0) {
                if (!animationName || !modelData.animations.has(animationName)) {
                    const firstAnimation = modelData.animations.keys().next().value;
                    animationName = firstAnimation;
                }
            } else {
                animationName = undefined;
            }

        const instanceData: InstanceData = {
            instanceId,
            transform: {
                position: new Float32Array([0, 0, 0]),
                rotation: new Float32Array([0, 0, 0, 1]), // Quaternion
                scale: new Float32Array([1, 1, 1])
            },
            renderOptions: {
                useNormalMap: false
            },
            animationState: {
                currentAnimation: animationName ?? null,
                currentTime: 0,
                speed: 1,
                loop: true,
                playing: false,
                animationMatrices: new Map<number, mat4>(),
                animationNodeTransforms: new Map<number, NodeTransforms>(),
                boneMatrices: new Map<number, Float32Array>()
            },
            worldMatrix: new Float32Array(16), // 4x4 matrix
            disabledNodes: new Set<string>(),
            allNodesDisabled: false,
            tintColor: [1, 1, 1], // Default white tint (no tinting)
            opacity: 1, // Default fully opaque
            materialOverrides: new Map<string, number>() // Material overrides per primitive
        };

        // Store instance
        this.instances.set(instanceId.id, instanceData);

        // Animate instance for 0 seconds to set bind pose
        this.updateAnimation(instanceData, 0);
        
        // Add to model group
        this.addToModelGroup(instanceId);
        
        // Create Model interface with direct instanceData reference
        return new Model(instanceId, this, instanceData);
    }

    deleteModel(instanceId: number): void {
        this.cleanupInstance(instanceId);
    }

    updateInstance(instanceId: number, deltaTime: number): void {
        const instance = this.instances.get(instanceId);
        if (!instance) return;

        if (instance.animationState.currentAnimation !== null) {
            this.updateAnimation(instance, deltaTime);
        }

        if (this.dirtyInstances.has(instanceId)) {
            this.updateWorldMatrix(instance);
        }
    }

    render(viewProjection: { view: mat4, projection: mat4 }, tick?: number, nearPlaneOffset: number = 0.0): void {
        if (tick !== undefined && tick === this.lastRenderTick) return;
        if (tick !== undefined) this.lastRenderTick = tick;
        if (this.instances.size === 0) return;

        // @ts-ignore
        let renderer: WebGLRenderer;
        // @ts-ignore
        const runtime = globalThis.veryBadLands
        if (runtime) {
            renderer = runtime.GetWebGLRenderer();
            renderer.EndBatch();
        }

        this.gpuResources.gpuResourceCache.cacheModelMode();

        if (this.shadowMapManager) {
            this.shadowMapManager.updateAllShadowMaps(this.gpuResources.lights);
            const shadowsWereRendered = this.shadowMapManager.renderAllShadowMaps(this, this.gpuResources.lights);

            if (shadowsWereRendered) {
                const cachedState = this.gpuResources.gpuResourceCache.getCachedModelState();
                if (cachedState) {
                    const tracker = (this.gpuResources as any).getWebGLStateTracker?.();
                    if (tracker) {
                        const original = tracker.getOriginalMethods();
                        original.bindFramebuffer(this.gl.FRAMEBUFFER, cachedState.boundFramebuffer || null);
                        original.viewport(...cachedState.viewport);
                        original.colorMask(...cachedState.colorMask);

                        if (cachedState.capabilities.get(this.gl.DEPTH_TEST)) {
                            original.enable(this.gl.DEPTH_TEST);
                        } else {
                            original.disable(this.gl.DEPTH_TEST);
                        }
                        original.depthFunc(cachedState.depthFunc);

                        if (cachedState.capabilities.get(this.gl.SCISSOR_TEST)) {
                            original.enable(this.gl.SCISSOR_TEST);
                        } else {
                            original.disable(this.gl.SCISSOR_TEST);
                        }
                        original.scissor(...cachedState.scissorBox);
                    }
                }
            }

            this.gpuResources.setMultipleShadowMapUniforms(
                this.defaultShaderProgram,
                this.shadowMapManager
            );
        }

        this.frustum.extractFromMatrix(viewProjection.view, viewProjection.projection);
        this.gl.colorMask(true, true, true, true);

        for (const [modelId, instanceGroup] of this.instancesByModel) {
            this.renderModelInstances(modelId, instanceGroup, viewProjection, nearPlaneOffset);
        }

        this.gpuResources.gpuResourceCache.restoreModelMode();
        if (runtime) renderer.SetTexture(null);
    }

    public markInstanceDirty(instanceId: number): void {
        this.dirtyInstances.add(instanceId);
    }

    public invalidateAnimationCache(instanceId: number): void {
        this._animationController.invalidateCache(instanceId);
    }

    public setModelBindPose(instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            this._animationController.setBindPose(instanceData);
        }
    }

    public updateModelAnimation(instance: Model, deltaTime: number): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            this.updateAnimation(instanceData, deltaTime);
        }
    }

    private addToModelGroup(instanceId: InstanceId): void {
        let group = this.instancesByModel.get(instanceId.modelId);
        if (!group) {
            group = new Set();
            this.instancesByModel.set(instanceId.modelId, group);
        }
        group.add(instanceId.id);
    }

    private removeFromModelGroup(instanceId: InstanceId): void {
        const group = this.instancesByModel.get(instanceId.modelId);
        if (group) {
            group.delete(instanceId.id);
            if (group.size === 0) {
                this.instancesByModel.delete(instanceId.modelId);
            }
        }
    }

    public updateAnimation(instance: InstanceData, deltaTime: number): void {
        if (instance.animationState.currentAnimation === null || !instance.animationState.playing) return;

        this._animationController.updateAnimation(instance, deltaTime);
        this.dirtyInstances.add(instance.instanceId.id);
    }

    private updateWorldMatrix(instance: InstanceData): void {
        // Calculate world matrix from position, rotation, and scale
       const srtMatrix = mat4.create();
       mat4.fromRotationTranslationScale(srtMatrix, instance.transform.rotation, instance.transform.position, instance.transform.scale);
       instance.worldMatrix.set(srtMatrix);
    }

    private isInstanceVisible(instance: InstanceData, modelData: any, nearPlaneOffset: number = 0.0): boolean {
        if (!modelData.boundingSphere) return true;

        const center = modelData.boundingSphere.center;
        const worldCenter: [number, number, number] = [
            instance.transform.position[0] + center[0] * instance.transform.scale[0],
            instance.transform.position[1] + center[1] * instance.transform.scale[1],
            instance.transform.position[2] + center[2] * instance.transform.scale[2]
        ];

        const worldBoundingSphere = {
            center: worldCenter,
            radius: modelData.boundingSphere.radius * Math.max(...instance.transform.scale)
        };

        return this.frustum.testSphere(worldBoundingSphere, nearPlaneOffset);
    }

    public renderModelInstances(
        modelId: string,
        instanceGroup: Set<number>,
        viewProjection: { view: mat4, projection: mat4 },
        nearPlaneOffset: number = 0.0
    ): void {
        const modelData = this.modelLoader.getModelData(modelId);
        if (!modelData) return;

        const shader = this.defaultShaderProgram;
        this.gl.useProgram(shader);

        // Cache uniform locations once per call
        const viewLoc = this.uniformCache.getLocation(shader, 'u_View');
        const projectionLoc = this.uniformCache.getLocation(shader, 'u_Projection');
        const modelLoc = this.uniformCache.getLocation(shader, 'u_Model');
        const nodeMatrixLoc = this.uniformCache.getLocation(shader, 'u_NodeMatrix');
        const useSkinningLoc = this.uniformCache.getLocation(shader, 'u_UseSkinning');
        const tintLoc = this.uniformCache.getLocation(shader, 'u_TintColor');
        const opacityLoc = this.uniformCache.getLocation(shader, 'u_Opacity');
        const normalMatrixLoc = this.uniformCache.getLocation(shader, 'u_NormalMatrix');

        // Set view/projection once per frame (same for all instances)
        this.gl.uniformMatrix4fv(viewLoc, false, viewProjection.view);
        this.gl.uniformMatrix4fv(projectionLoc, false, viewProjection.projection);

        for (const instanceId of instanceGroup) {
            const instance = this.instances.get(instanceId);
            if (!instance) continue;

            if (!this.isInstanceVisible(instance, modelData, nearPlaneOffset)) continue;

            this.updateWorldMatrix(instance);

            this.gpuResources.setNormalMapEnabled(
                this.defaultShaderProgram,
                instance.renderOptions.useNormalMap ?? false
            );

            // Set instance uniforms once per instance
            this.gl.uniformMatrix4fv(modelLoc, false, instance.worldMatrix);
            if (tintLoc !== -1) this.gl.uniform3fv(tintLoc, instance.tintColor);
            if (opacityLoc !== -1) this.gl.uniform1f(opacityLoc, instance.opacity);

            for (const renderableNode of modelData.renderableNodes) {
                if (instance.allNodesDisabled) continue;

                const nodeName = renderableNode.nodeName;
                const nodeIdentifier = nodeName || `node_${renderableNode.node.indexData.nodeIndex}`;

                if (instance.disabledNodes.has(nodeIdentifier)) continue;

                const animationState = instance.animationState;
                const nodeMatrix = animationState.animationMatrices.get(renderableNode.node.indexData.nodeIndex);

                // Set node uniforms once per node
                if (nodeMatrixLoc) {
                    this.gl.uniformMatrix4fv(nodeMatrixLoc, false, nodeMatrix || InstanceManager.IDENTITY_MATRIX);
                }

                let noBoneMatrices = true;
                const nodeBoneMatrices = animationState.boneMatrices.get(renderableNode.node.indexData.nodeIndex);
                if (nodeBoneMatrices && nodeBoneMatrices.length > 0) {
                    this.gpuResources.updateBoneUBO(nodeBoneMatrices, nodeBoneMatrices.length / 16);
                    noBoneMatrices = false;
                }
                if (useSkinningLoc) {
                    this.gl.uniform1i(useSkinningLoc, renderableNode.useSkinning && !noBoneMatrices ? 1 : 0);
                }

                const finalMatrix = nodeMatrix
                    ? mat4.multiply(this.tempMatrix, instance.worldMatrix, nodeMatrix)
                    : instance.worldMatrix;

                mat3.normalFromMat4(this.tempNormalMatrix, finalMatrix);

                if (!nodeMatrix) {
                    mat3.multiply(this.tempNormalMatrix, InstanceManager.COORD_CONVERSION, this.tempNormalMatrix);
                }

                this.gl.uniformMatrix3fv(normalMatrixLoc, false, this.tempNormalMatrix);

                const mesh = renderableNode.modelMesh;
                for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex++) {
                    const primitive = mesh.primitives[primitiveIndex];
                    const primitiveKey = `${renderableNode.node.indexData.nodeIndex}_${primitiveIndex}`;
                    const materialIndex = instance.materialOverrides.get(primitiveKey) ?? primitive.material;

                    this.gl.bindVertexArray(primitive.vao);
                    this.gpuResources.bindShaderAndMaterial(this.defaultShaderProgram, materialIndex, modelData);
                    this.gl.frontFace(this.gl.CW);

                    if (primitive.indexBuffer) {
                        this.gl.drawElements(this.gl.TRIANGLES, primitive.indexCount, primitive.indexType, 0);
                    } else {
                        this.gl.drawArrays(this.gl.TRIANGLES, 0, primitive.vertexCount);
                    }

                    this.gl.frontFace(this.gl.CCW);
                }
            }
        }
    }

    public renderShadowMapInstances(
        modelId: string,
        instanceGroup: Set<number>,
        viewProjection: { view: mat4, projection: mat4 }
    ): void {
        const modelData = this.modelLoader.getModelData(modelId);
        if (!modelData) return;

        const shadowShader = this.shadowMapShader;
        this.gl.useProgram(shadowShader);

        // Cache uniform locations once per call
        const viewProjLoc = this.uniformCache.getLocation(shadowShader, 'u_LightViewProjection');
        const modelLoc = this.uniformCache.getLocation(shadowShader, 'u_Model');
        const nodeMatrixLoc = this.uniformCache.getLocation(shadowShader, 'u_NodeMatrix');
        const useSkinningLoc = this.uniformCache.getLocation(shadowShader, 'u_UseSkinning');

        // Compute and set light view projection once per call
        mat4.multiply(this.tempMatrix, viewProjection.projection, viewProjection.view);
        this.gl.uniformMatrix4fv(viewProjLoc, false, this.tempMatrix);

        for (const instanceId of instanceGroup) {
            const instance = this.instances.get(instanceId);
            if (!instance) continue;

            if (!this.isInstanceVisible(instance, modelData)) continue;

            this.updateWorldMatrix(instance);

            // Set model matrix once per instance
            this.gl.uniformMatrix4fv(modelLoc, false, instance.worldMatrix);

            for (const renderableNode of modelData.renderableNodes) {
                if (instance.allNodesDisabled) continue;

                const nodeName = renderableNode.nodeName;
                const nodeIdentifier = nodeName || `node_${renderableNode.node.indexData.nodeIndex}`;

                if (instance.disabledNodes.has(nodeIdentifier)) continue;

                const animationState = instance.animationState;
                const animationMatrix = animationState.animationMatrices.get(renderableNode.node.indexData.nodeIndex);

                // Set node uniforms once per node
                if (nodeMatrixLoc) {
                    this.gl.uniformMatrix4fv(nodeMatrixLoc, false, animationMatrix || InstanceManager.IDENTITY_MATRIX);
                }

                let noBoneMatrices = true;
                const nodeBoneMatrices = animationState.boneMatrices.get(renderableNode.node.indexData.nodeIndex);
                if (nodeBoneMatrices && nodeBoneMatrices.length > 0) {
                    this.gpuResources.updateBoneUBO(nodeBoneMatrices, nodeBoneMatrices.length / 16);
                    noBoneMatrices = false;
                }
                if (useSkinningLoc) {
                    this.gl.uniform1i(useSkinningLoc, renderableNode.useSkinning && !noBoneMatrices ? 1 : 0);
                }

                const mesh = renderableNode.modelMesh;
                for (const primitive of mesh.primitives) {
                    this.gl.bindVertexArray(primitive.vao);
                    this.gl.frontFace(this.gl.CW);

                    if (primitive.indexBuffer) {
                        this.gl.drawElements(this.gl.TRIANGLES, primitive.indexCount, primitive.indexType, 0);
                    } else {
                        this.gl.drawArrays(this.gl.TRIANGLES, 0, primitive.vertexCount);
                    }

                    this.gl.frontFace(this.gl.CCW);
                }
            }
        }
    }

    // Public method for Model class to call with blending support
    public startAnimation(
        model: Model,
        animationName: string,
        options?: AnimationOptions
    ): void {
        const instance = this.instances.get(model.instanceId.id);
        if (!instance) {
            console.warn('[InstanceManager] Instance not found:', model.instanceId.id);
            return;
        }
        
        // Use AnimationController's startAnimation which supports blending
        this.animationController.startAnimation(instance, animationName, options);
    }

    private cleanupInstance(instanceId: number): void {
        const instance = this.instances.get(instanceId);
        if (!instance) return;

        // Remove from model group
        this.removeFromModelGroup(instance.instanceId);
        
        // Clear GPU resources
        const buffers = this.instanceBuffers.get(instance.instanceId.modelId);
        if (buffers) {
            // Clean up instance-specific GPU resources
            this.gpuResources.deleteBuffer(buffers.modelMatrix);
            this.gpuResources.deleteBuffer(buffers.jointMatrices);
        }

        // Remove instance data
        this.instances.delete(instanceId);
        this.dirtyInstances.delete(instanceId);
    }

    // Removed - Model handles this directly

    public setDebugShadowMap(enabled: boolean): void {
        this.debugShadowMap = enabled;
    }

    public async setUseAnimationWorker(enabled: boolean): Promise<void> {
        await this._animationController.setUseWorker(enabled);
    }
    
    // Animation event callback methods
    public registerAnimationCallback(instanceId: number, callback: AnimationEventCallback): void {
        this._animationController.registerAnimationCallback(instanceId, callback);
    }

    public unregisterAnimationCallback(instanceId: number): void {
        this._animationController.unregisterAnimationCallback(instanceId);
    }

    private async cacheModelInWorkerIfNeeded(modelId: string): Promise<void> {
        // Only cache once per model
        if (this.cachedModelsInWorker.has(modelId)) {
            return;
        }
        
        // Mark as cached (even if it fails, to avoid repeated attempts)
        this.cachedModelsInWorker.add(modelId);
        
        // Cache the model data in the worker
        try {
            await this._animationController.cacheModelInWorker(modelId);
        } catch (error) {
            console.error(`[InstanceManager] Failed to cache model ${modelId} in worker:`, error);
            // Remove from cache set so it can be retried
            this.cachedModelsInWorker.delete(modelId);
        }
    }

    /**
     * Gets the shadow map manager instance.
     * @returns The shadow map manager
     */
    public getShadowMapManager(): ShadowMapManager {
        return this.shadowMapManager;
    }

    public enableModelNode(nodeName: string, instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (!instanceData) return;

        if (instanceData.allNodesDisabled) {
            instanceData.allNodesDisabled = false;
            const modelData = this.modelLoader.getModelData(instance.instanceId.modelId);
            if (modelData && modelData.nodeNameMap) {
                for (const name of modelData.nodeNameMap.keys()) {
                    if (name !== nodeName) {
                        instanceData.disabledNodes.add(name);
                    }
                }
            }
        } else {
            instanceData.disabledNodes.delete(nodeName);
        }
    }

    get animationController(): AnimationController {
        return this._animationController;
    }

    /**
     * Sets the material for a specific node (and all its primitives).
     * @param instance The model instance
     * @param nodeName The name of the node
     * @param materialIndex The material index to use
     */
    public setInstanceMaterial(instance: Model, nodeName: string, materialIndex: number): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (!instanceData) {
            console.warn(`[InstanceManager] Instance ${instance.instanceId.id} not found`);
            return;
        }

        const modelData = this.modelLoader.getModelData(instance.instanceId.modelId);
        if (!modelData) {
            console.warn(`[InstanceManager] Model data not found for ${instance.instanceId.modelId}`);
            return;
        }

        // Validate material index
        const materials = modelData.materialSystem.materials;
        if (materialIndex < 0 || materialIndex >= materials.size) {
            console.warn(`[InstanceManager] Invalid material index ${materialIndex}. Model has ${materials.size} materials.`);
            return;
        }

        // Find the node by name
        const extendedNode = modelData.nodeNameMap.get(nodeName);
        if (!extendedNode) {
            console.warn(`[InstanceManager] Node "${nodeName}" not found in model`);
            return;
        }

        // Set material for all primitives in this node
        for (const renderableNode of modelData.renderableNodes) {
            if (renderableNode.node === extendedNode) {
                const nodeIndex = renderableNode.node.indexData.nodeIndex;
                for (let primitiveIndex = 0; primitiveIndex < renderableNode.modelMesh.primitives.length; primitiveIndex++) {
                    const primitiveKey = `${nodeIndex}_${primitiveIndex}`;
                    instanceData.materialOverrides.set(primitiveKey, materialIndex);
                }
                break;
            }
        }
    }

    public getBoneWorldPosition(instanceId: number, boneName: string): [number, number, number] | null {
        const instanceData = this.instances.get(instanceId);
        if (!instanceData) return null;

        const modelData = this.modelLoader.getModelData(instanceData.instanceId.modelId);
        if (!modelData) return null;

        const boneNode = modelData.nodeNameMap?.get(boneName);
        if (!boneNode) return null;

        const meshNode = this.findMeshNodeForJoint(modelData, boneNode.indexData.nodeIndex);
        if (!meshNode) return null;

        return this.computeBoneWorldPosition(instanceData, meshNode, boneNode);
    }

    public getBoneWorldPositionByIndex(instanceId: number, boneIndex: number): [number, number, number] | null {
        const instanceData = this.instances.get(instanceId);
        if (!instanceData) return null;

        const modelData = this.modelLoader.getModelData(instanceData.instanceId.modelId);
        if (!modelData) return null;

        const boneNode = modelData.nodeArray?.[boneIndex];
        if (!boneNode) return null;

        const meshNode = this.findMeshNodeForJoint(modelData, boneIndex);
        if (!meshNode) return null;

        return this.computeBoneWorldPosition(instanceData, meshNode, boneNode);
    }

    private findMeshNodeForJoint(modelData: any, jointNodeIndex: number): any {
        for (const renderableNode of modelData.renderableNodes) {
            if (renderableNode.useSkinning) {
                const skin = renderableNode.node.getSkin?.();
                if (skin) {
                    const joints = skin.listJoints();
                    if (joints.some((j: any) => j.indexData?.nodeIndex === jointNodeIndex)) {
                        return renderableNode.node;
                    }
                }
            }
        }
        return null;
    }

    private computeBoneWorldPosition(
        instanceData: InstanceData,
        meshNode: any,
        boneNode: any
    ): [number, number, number] | null {
        const meshNodeMatrix = instanceData.animationState.animationMatrices.get(meshNode.indexData.nodeIndex);
        if (!meshNodeMatrix) return null;

        const jointWorldMatrix = instanceData.animationState.animationMatrices.get(boneNode.indexData.nodeIndex);
        if (!jointWorldMatrix) return null;

        // boneWorld = instanceWorld × meshNodeWorld × boneLocal
        // where boneLocal = meshNodeInverse × jointWorld
        const meshNodeInverse = mat4.create();
        mat4.invert(meshNodeInverse, meshNodeMatrix);

        const boneLocalToMesh = mat4.create();
        mat4.multiply(boneLocalToMesh, meshNodeInverse, jointWorldMatrix);

        const boneWorldMatrix = mat4.create();
        mat4.multiply(boneWorldMatrix, instanceData.worldMatrix, meshNodeMatrix);
        mat4.multiply(boneWorldMatrix, boneWorldMatrix, boneLocalToMesh);

        return [boneWorldMatrix[12], boneWorldMatrix[13], boneWorldMatrix[14]];
    }

    /**
     * Gets a list of all bones/joints for a model with their indices, names, and hierarchy.
     * @param modelId The ID of the model
     * @returns Object with bone information including hierarchy or null if model not found
     */
    public getModelBones(modelId: string): { bones: Array<{ index: number; name: string; parentIndex: number | null; children: number[] }> } | null {
        const modelData = this.modelLoader.getModelData(modelId);
        if (!modelData) {
            console.warn(`[InstanceManager] Model data not found for ${modelId}`);
            return null;
        }

        // Build a map of child index -> parent index for quick lookup
        const parentMap = new Map<number, number>();
        modelData.jointData.forEach(joint => {
            joint.children.forEach(childIndex => {
                parentMap.set(childIndex, joint.index);
            });
        });

        // Return the joint data with hierarchy information
        const bones = modelData.jointData.map(joint => ({
            index: joint.index,
            name: joint.name || `bone_${joint.index}`, // Provide fallback name for unnamed bones
            parentIndex: parentMap.get(joint.index) ?? null, // null if root bone
            children: joint.children // Array of child bone indices
        }));

        return { bones };
    }

    /**
     * Gets a list of all bones/joints for a specific instance with hierarchy information.
     * @param instanceId The numeric ID of the model instance
     * @returns Object with bone information including hierarchy or null if instance not found
     */
    public getInstanceBones(instanceId: number): { bones: Array<{ index: number; name: string; parentIndex: number | null; children: number[] }> } | null {
        const instanceData = this.instances.get(instanceId);
        if (!instanceData) {
            console.warn(`[InstanceManager] Instance ${instanceId} not found`);
            return null;
        }

        return this.getModelBones(instanceData.instanceId.modelId);
    }

    /**
     * Checks if there are any model instances currently registered.
     * @returns true if there are any instances, false otherwise
     */
    public hasInstances(): boolean {
        return this.instances.size > 0;
    }
}

// @ts-ignore
globalThis.InstanceManager = InstanceManager;