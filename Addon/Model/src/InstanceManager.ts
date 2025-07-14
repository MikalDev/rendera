import { ModelError, ModelErrorCode } from './errors';
import { InstanceData, IInstanceManager, IGPUResourceManager, InstanceId, type AnimationOptions, MAX_BONES, NodeTransforms } from './types';
import { ModelLoader } from './ModelLoader';
import { Model } from './Model';
import { AnimationController } from './AnimationController';
import { mat3, mat4 } from 'gl-matrix';
import { ShadowMapManager } from './ShadowMapManager';

export class InstanceManager implements IInstanceManager {
    private gl: WebGL2RenderingContext;
    private modelLoader: ModelLoader;
    private instances: Map<number, InstanceData> = new Map();
    public instancesByModel: Map<string, Set<number>> = new Map();
    private defaultShaderProgram: WebGLProgram;
    private shadowMapShader: WebGLProgram;
    private shadowMapManager: ShadowMapManager;
    public debugShadowMap: boolean = false;
    
    // GPU instance data
    private instanceBuffers: Map<string, {
        modelMatrix: WebGLBuffer;
        jointMatrices: WebGLBuffer;
        count: number;
    }> = new Map();
    
    private nextInstanceId = 1;
    private dirtyInstances: Set<number> = new Set();

    private _animationController: AnimationController;

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
    }

    initialize(): void {
        // Log WebGL context attributes
        const contextAttributes = this.gl.getContextAttributes();
        console.log('WebGL Context Attributes:', contextAttributes);

        // Basic WebGL2 initialization
        this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);
        
        // Enable blending for transparency
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        // Set viewport
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

        // Clear any existing buffers/state
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
        this.gl.bindVertexArray(null);
        this.gl.useProgram(null);

        // Clear instance tracking
        this.dirtyInstances.clear();
        this.instanceBuffers.clear();

        // Clear canvas
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Enable additional WebGL features
        this.gl.enable(this.gl.SCISSOR_TEST);  // For viewport clipping
        
        // Set pixel store parameters
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);  // Flip textures right-side up
        this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 4);  // Standard pixel alignment
        
        // Set default texture parameters
        this.gl.activeTexture(this.gl.TEXTURE0);
        
        // Set default line width
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

    createModel(modelId: string, animationName?: string): Model {
        // Verify model exists
        const modelData = this.modelLoader.getModelData(modelId);
        if (!modelData) {
            throw this.createError(
                ModelErrorCode.RESOURCE_NOT_FOUND,
                `Model ${modelId} not found`
            );
        }

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
            worldMatrix: new Float32Array(16) // 4x4 matrix
        };

        // Store instance
        this.instances.set(instanceId.id, instanceData);

        // Animate instance for 0 seconds to set bind pose
        this.updateAnimation(instanceData, 0);
        
        // Add to model group
        this.addToModelGroup(instanceId);
        
        // Create Model interface
        return new Model(instanceId, this);
    }

    deleteModel(instanceId: number): void {
        this.cleanupInstance(instanceId);
    }

    updateInstance(instanceId: number, deltaTime: number): void {
        const instance = this.instances.get(instanceId);
        if (!instance) return;

        // Update animation if active
        if (instance.animationState.currentAnimation !== null ) {
            this.updateAnimation(instance, deltaTime);
        }

        // Update world matrix if transform is dirty
        if (this.dirtyInstances.has(instanceId)) {
            this.updateWorldMatrix(instance);
        }
    }

    render(viewProjection: { view: mat4, projection: mat4 }): void {
        // Render each model group
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
            this.shadowMapManager.renderAllShadowMaps(this);
        }

        // Set multiple shadow map uniforms using new multi-shadow system
        if (this.shadowMapManager) {
            // Debug: Log shadow setup once per frame (if debug enabled)
            const DEBUG_SHADOWS = false; // Set to true to enable debug logging
            if (DEBUG_SHADOWS) {
                const activeShadowMaps = this.shadowMapManager.getActiveShadowMapIndices();
                console.log(`[InstanceManager] Frame render - Active shadow maps: [${activeShadowMaps.join(', ')}]`);
            }
            
            this.gpuResources.setMultipleShadowMapUniforms(
                this.defaultShaderProgram,
                this.shadowMapManager
            );
        }

        for (const [modelId, instanceGroup] of this.instancesByModel) {
            this.renderModelInstances(modelId, instanceGroup, viewProjection);
        }

        if (this.shadowMapManager && this.debugShadowMap) {
            // Debug the first active shadow map
            const activeShadowMapIndices = this.shadowMapManager.getActiveShadowMapIndices();
            if (activeShadowMapIndices.length > 0) {
                const firstActiveShadowMapIndex = activeShadowMapIndices[0];
                const lightId = this.shadowMapManager.getShadowMapLightId(firstActiveShadowMapIndex);
                if (lightId >= 0) {
                    this.shadowMapManager.renderShadowMapDebug(lightId);
                }
            }
        }

        this.gpuResources.gpuResourceCache.restoreModelMode();
        if (runtime) renderer.SetTexture(null);
    }

    public setModelPosition(x: number, y: number, z: number, instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            instanceData.transform.position.set([x, y, z]);
            this.dirtyInstances.add(instance.instanceId.id);
        }
    }

    public setModelRotation(quaternion: Float32Array, instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            instanceData.transform.rotation.set(quaternion);
            this.dirtyInstances.add(instance.instanceId.id);
        }
    }

    public setModelScale(x: number, y: number, z: number, instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            instanceData.transform.scale.set([x, y, z]);
            this.dirtyInstances.add(instance.instanceId.id);
        }
    }

    public setModelBindPose(instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            this._animationController.setBindPose(instanceData);
        }
    }

    public playModelAnimation(
        animationName: string, 
        instance: Model,
        options?: AnimationOptions
    ): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            this.startAnimation(instanceData, animationName, options);
        }
    }

    public updateModelAnimation(instance: Model, deltaTime: number): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            this.updateAnimation(instanceData, deltaTime);
        }
    }

    public stopModelAnimation(instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            instanceData.animationState.currentAnimation = null;
        }
    }

    private createError(code: ModelErrorCode, message: string): ModelError {
        return { name: 'ModelError', code, message };
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

    public renderModelInstances(
        modelId: string, 
        instanceGroup: Set<number>, 
        viewProjection: { view: mat4, projection: mat4 }
    ): void {
        const modelData = this.modelLoader.getModelData(modelId);
        if (!modelData) return;

        // Basic shader setup TODO: move to GPUResourceManager
        this.gl.useProgram(this.defaultShaderProgram);

        // For each instance
        for (const instanceId of instanceGroup) {
            const instance = this.instances.get(instanceId);
            if (!instance) continue;

            const renderOptions = instance.renderOptions;

            // Set normal map state for this instance
            this.gpuResources.setNormalMapEnabled(
                this.defaultShaderProgram, 
                renderOptions.useNormalMap ?? false
            );

            // Update world matrix
            this.updateWorldMatrix(instance);

            // For each mesh in the model
            for (const renderableNode of modelData.renderableNodes) {
                const mesh = renderableNode.modelMesh;
                for (const primitive of mesh.primitives) {
                    // const material = modelData.materials[primitive.material];
                    // const shader = material.program;
                    // TODO: move to GPUResourceManager
                    const shader = this.defaultShaderProgram;

                    // 1. Bind shader
                    // TODO: move to GPUResourceManager
                    this.gl.useProgram(shader);

                    // 2. Bind VAO (contains vertex attributes setup)
                    this.gl.bindVertexArray(primitive.vao);

                    // 3. Set required uniforms
                    const viewLoc = this.gl.getUniformLocation(shader, 'u_View');
                    const projectionLoc = this.gl.getUniformLocation(shader, 'u_Projection');
                    const modelMatrixLoc = this.gl.getUniformLocation(shader, 'u_Model');
                    const normalMatrixLoc = this.gl.getUniformLocation(shader, 'u_NormalMatrix');
                    const nodeMatrixLoc = this.gl.getUniformLocation(shader, 'u_NodeMatrix');
                    const useSkinningLoc = this.gl.getUniformLocation(shader, 'u_UseSkinning');
                    this.gl.uniformMatrix4fv(viewLoc, false, viewProjection.view);
                    this.gl.uniformMatrix4fv(projectionLoc, false, viewProjection.projection);
                    this.gl.uniformMatrix4fv(modelMatrixLoc, false, instance.worldMatrix);
                    const animationState = instance.animationState;
                    const animationMatrices = animationState.animationMatrices;
                    const animationMatrix = animationMatrices.get(renderableNode.node.indexData.nodeIndex);
                    if (nodeMatrixLoc) {
                        if (animationMatrix) {
                            this.gl.uniformMatrix4fv(nodeMatrixLoc, false, animationMatrix);
                        } else {
                            this.gl.uniformMatrix4fv(nodeMatrixLoc, false, mat4.create());
                        }
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

                    // Calculate normal matrix (inverse transpose of the upper 3x3 model matrix)
                    const normalMatrix = mat3.create();
                    // Get nodeMatrix from instance from animation matrices
                    const nodeMatrix = animationMatrices.get(renderableNode.node.indexData.nodeIndex);
                    if (nodeMatrix) {
                        const nodeWorldMatrix = mat4.create();
                        mat4.multiply(nodeWorldMatrix, nodeMatrix, instance.worldMatrix);
                        mat3.normalFromMat4(normalMatrix, nodeWorldMatrix);
                    } else {
                        mat3.normalFromMat4(normalMatrix, instance.worldMatrix);
                    }

                    this.gl.uniformMatrix3fv(normalMatrixLoc, false, normalMatrix);
                   
                    // 5. Bind material properties (textures and uniforms)
                    this.gpuResources.bindShaderAndMaterial(this.defaultShaderProgram, primitive.material, modelData);

                    // 6. Draw
                    if (primitive.indexBuffer) {
                        this.gl.drawElements(
                            this.gl.TRIANGLES,
                            primitive.indexCount,
                            primitive.indexType,
                            0
                        );
                    } else {
                        this.gl.drawArrays(
                            this.gl.TRIANGLES,
                            0,
                            primitive.vertexCount
                        );
                    }
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

        // Get shadow map shader
        const shadowShader = this.shadowMapShader;
        this.gl.useProgram(shadowShader);

        // For each instance
        for (const instanceId of instanceGroup) {
            const instance = this.instances.get(instanceId);
            if (!instance) continue;

            // Update world matrix
            this.updateWorldMatrix(instance);

            // For each mesh in the model
            for (const renderableNode of modelData.renderableNodes) {
                const mesh = renderableNode.modelMesh;
                for (const primitive of mesh.primitives) {
                    // 1. Bind VAO
                    this.gl.bindVertexArray(primitive.vao);

                    // 2. Set minimal required uniforms for shadow mapping
                    const viewProjLoc = this.gl.getUniformLocation(shadowShader, 'u_LightViewProjection');
                    const modelMatrixLoc = this.gl.getUniformLocation(shadowShader, 'u_Model');
                    const nodeMatrixLoc = this.gl.getUniformLocation(shadowShader, 'u_NodeMatrix');
                    const useSkinningLoc = this.gl.getUniformLocation(shadowShader, 'u_UseSkinning');

                    // Combine view and projection for efficiency
                    const lightViewProj = mat4.multiply(mat4.create(), viewProjection.projection, viewProjection.view);
                    this.gl.uniformMatrix4fv(viewProjLoc, false, lightViewProj);
                    this.gl.uniformMatrix4fv(modelMatrixLoc, false, instance.worldMatrix);

                    // Handle animation matrices if present
                    const animationState = instance.animationState;
                    const animationMatrices = animationState.animationMatrices;
                    const animationMatrix = animationMatrices.get(renderableNode.node.indexData.nodeIndex);
                    
                    if (nodeMatrixLoc) {
                        if (animationMatrix) {
                            this.gl.uniformMatrix4fv(nodeMatrixLoc, false, animationMatrix);
                        } else {
                            this.gl.uniformMatrix4fv(nodeMatrixLoc, false, mat4.create());
                        }
                    }

                    // Handle skinning
                    let noBoneMatrices = true;
                    const nodeBoneMatrices = animationState.boneMatrices.get(renderableNode.node.indexData.nodeIndex);
                    if (nodeBoneMatrices && nodeBoneMatrices.length > 0) {
                        this.gpuResources.updateBoneUBO(nodeBoneMatrices, nodeBoneMatrices.length / 16);
                        noBoneMatrices = false;
                    }
                    if (useSkinningLoc) {
                        this.gl.uniform1i(useSkinningLoc, renderableNode.useSkinning && !noBoneMatrices ? 1 : 0);
                    }

                    // Draw
                    if (primitive.indexBuffer) {
                        this.gl.drawElements(
                            this.gl.TRIANGLES,
                            primitive.indexCount,
                            primitive.indexType,
                            0
                        );
                    } else {
                        this.gl.drawArrays(
                            this.gl.TRIANGLES,
                            0,
                            primitive.vertexCount
                        );
                    }
                }
            }
        }
    }

    private startAnimation(
        instance: InstanceData,
        animationName: string,
        options?: AnimationOptions
    ): void {
        const animationState = instance.animationState;
        animationState.currentAnimation = animationName;
        animationState.currentTime = 0;
        animationState.playing = true;
        if (options) {
            animationState.speed = options.speed ?? 1;
            animationState.loop = options.loop ?? true;
        }
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

    public setModelNormalMapEnabled(enabled: boolean, instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            instanceData.renderOptions.useNormalMap = enabled;
            this.dirtyInstances.add(instance.instanceId.id);
        }
    }

    public setDebugShadowMap(enabled: boolean): void {
        this.debugShadowMap = enabled;
    }

    get animationController(): AnimationController {
        return this._animationController;
    }
}

// @ts-ignore
globalThis.InstanceManager = InstanceManager;