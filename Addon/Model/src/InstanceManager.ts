import { ModelError, ModelErrorCode } from './errors';
import { InstanceData, IInstanceManager, IGPUResourceManager, InstanceId, type AnimationOptions, MAX_BONES, NodeTransforms, AnimationEventCallback } from './types';
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

    // Debug tracking for bone position logging
    private lastBoneLogTick = -1;
    private loggedInstancesThisTick: Set<number> = new Set();

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

        // Update animation if active
        if (instance.animationState.currentAnimation !== null ) {
            this.updateAnimation(instance, deltaTime);
        }

        // Update world matrix if transform is dirty
        if (this.dirtyInstances.has(instanceId)) {
            this.updateWorldMatrix(instance);
        }
    }

    render(viewProjection: { view: mat4, projection: mat4 }, tick?: number, nearPlaneOffset: number = 0.0): void {
        // Skip rendering if already rendered this tick
        if (tick !== undefined && tick === this.lastRenderTick) {
            return;
        }
        if (tick !== undefined) {
            this.lastRenderTick = tick;
        }

        // Early exit if there are no instances to render
        if (this.instances.size === 0) {
            return;
        }

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
            // Pass lights array for optimized early exit when no shadows are cast
            const shadowsWereRendered = this.shadowMapManager.renderAllShadowMaps(this, this.gpuResources.lights);

            // Restore GL state after shadow rendering
            // Trust the cached state - if C3 resized, syncWithGLState() will fix it next frame
            if (shadowsWereRendered) {
                const cachedState = this.gpuResources.gpuResourceCache.getCachedModelState();
                if (cachedState) {
                    const tracker = (this.gpuResources as any).getWebGLStateTracker?.();
                    if (tracker) {
                        const original = tracker.getOriginalMethods();

                        // Restore framebuffer
                        original.bindFramebuffer(this.gl.FRAMEBUFFER, cachedState.boundFramebuffer || null);

                        // Restore viewport
                        original.viewport(...cachedState.viewport);
                        // Restore color mask (shadow rendering disables it)
                        original.colorMask(...cachedState.colorMask);
                        // Restore depth test state
                        if (cachedState.capabilities.get(this.gl.DEPTH_TEST)) {
                            original.enable(this.gl.DEPTH_TEST);
                        } else {
                            original.disable(this.gl.DEPTH_TEST);
                        }
                        original.depthFunc(cachedState.depthFunc);
                        // Restore scissor test state
                        if (cachedState.capabilities.get(this.gl.SCISSOR_TEST)) {
                            original.enable(this.gl.SCISSOR_TEST);
                        } else {
                            original.disable(this.gl.SCISSOR_TEST);
                        }
                        original.scissor(...cachedState.scissorBox);
                    }
                }
            }
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

        // Update frustum from view-projection matrices
        this.frustum.extractFromMatrix(viewProjection.view, viewProjection.projection);

        // Ensure color mask is enabled before rendering 3D models
        // Shadow rendering disables it, and we need it enabled for visible output
        this.gl.colorMask(true, true, true, true);

        for (const [modelId, instanceGroup] of this.instancesByModel) {
            this.renderModelInstances(modelId, instanceGroup, viewProjection, nearPlaneOffset);
        }

        this.gpuResources.gpuResourceCache.restoreModelMode();
        if (runtime) renderer.SetTexture(null);
    }

    // Helper method for Model class to mark instance as dirty
    public markInstanceDirty(instanceId: number): void {
        this.dirtyInstances.add(instanceId);
    }

    // Helper method for Model class to invalidate animation cache
    public invalidateAnimationCache(instanceId: number): void {
        // Delegate to animation controller which manages the cache
        this._animationController.invalidateCache(instanceId);
    }

    public setModelBindPose(instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            this._animationController.setBindPose(instanceData);
        }
    }

    // Removed - Model handles this directly

    public updateModelAnimation(instance: Model, deltaTime: number): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            this.updateAnimation(instanceData, deltaTime);
        }
    }

    // Removed - Model handles these directly

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

    // DRY: Extract bounding sphere culling logic
    private isInstanceVisible(instance: InstanceData, modelData: any, nearPlaneOffset: number = 0.0): boolean {
        if (!modelData.boundingSphere) {
            return true; // No bounding sphere = always visible
        }

        // KISS: Simple approximation - transform center and apply max scale
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
        const isVisible = this.frustum.testSphere(worldBoundingSphere, nearPlaneOffset);
        

        return isVisible;
    }

    public renderModelInstances(
        modelId: string, 
        instanceGroup: Set<number>, 
        viewProjection: { view: mat4, projection: mat4 },
        nearPlaneOffset: number = 0.0
    ): void {
        const modelData = this.modelLoader.getModelData(modelId);
        if (!modelData) return;

        // Shader is already bound by setMultipleShadowMapUniforms in the render() function
        // No need to bind it again here

        // For each instance
        for (const instanceId of instanceGroup) {
            const instance = this.instances.get(instanceId);
            if (!instance) continue;

            // KISS Frustum culling: Test instance bounding sphere
            if (!this.isInstanceVisible(instance, modelData, nearPlaneOffset)) {
                continue;
            }

            // Update world matrix for rendering
            this.updateWorldMatrix(instance);

            const renderOptions = instance.renderOptions;

            // Set normal map state for this instance
            this.gpuResources.setNormalMapEnabled(
                this.defaultShaderProgram, 
                renderOptions.useNormalMap ?? false
            );

            // For each mesh in the model
            for (const renderableNode of modelData.renderableNodes) {
                // Check if this node is disabled for this instance
                if (instance.allNodesDisabled) {
                    continue; // Skip all nodes
                }
                
                const nodeName = renderableNode.nodeName;
                const nodeIdentifier = nodeName || `node_${renderableNode.node.indexData.nodeIndex}`;
                
                if (instance.disabledNodes.has(nodeIdentifier)) {
                    continue; // Skip rendering this node
                }
                
                const mesh = renderableNode.modelMesh;
                for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex++) {
                    const primitive = mesh.primitives[primitiveIndex];

                    // Check for material override for this instance
                    const primitiveKey = `${renderableNode.node.indexData.nodeIndex}_${primitiveIndex}`;
                    const materialIndex = instance.materialOverrides.get(primitiveKey) ?? primitive.material;

                    // const material = modelData.materials[materialIndex];
                    // const shader = material.program;
                    // TODO: move to GPUResourceManager
                    const shader = this.defaultShaderProgram;

                    // Shader is already bound - no need to bind again
                    // 1. Bind VAO (contains vertex attributes setup)
                    this.gl.bindVertexArray(primitive.vao);

                    // 2. Set required uniforms using cached locations
                    const viewLoc = this.uniformCache.getLocation(shader, 'u_View');
                    const projectionLoc = this.uniformCache.getLocation(shader, 'u_Projection');
                    const modelLoc = this.uniformCache.getLocation(shader, 'u_Model');
                    const nodeMatrixLoc = this.uniformCache.getLocation(shader, 'u_NodeMatrix');
                    const useSkinningLoc = this.uniformCache.getLocation(shader, 'u_UseSkinning');
                    
                    this.gl.uniformMatrix4fv(viewLoc, false, viewProjection.view);
                    this.gl.uniformMatrix4fv(projectionLoc, false, viewProjection.projection);
                    this.gl.uniformMatrix4fv(modelLoc, false, instance.worldMatrix);
                    
                    // Set tint and opacity uniforms
                    const tintLoc = this.uniformCache.getLocation(shader, 'u_TintColor');
                    const opacityLoc = this.uniformCache.getLocation(shader, 'u_Opacity');
                    if (tintLoc !== -1) this.gl.uniform3fv(tintLoc, instance.tintColor);
                    if (opacityLoc !== -1) this.gl.uniform1f(opacityLoc, instance.opacity);
                    
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
                    let finalMatrix: mat4;
                    
                    if (nodeMatrix) {
                        const nodeWorldMatrix = mat4.create();
                        mat4.multiply(nodeWorldMatrix, instance.worldMatrix, nodeMatrix);
                        finalMatrix = nodeWorldMatrix;
                    } else {
                        finalMatrix = instance.worldMatrix;
                    }

                    // Calculate normal matrix (inverse transpose)
                    mat3.normalFromMat4(normalMatrix, finalMatrix);

                    // Apply coordinate conversion for static meshes (when nodeMatrix is null)
                    // Shader converts normals from GLB (Y-up, RH) to C3 (Y-down, LH)
                    // NormalMatrix must account for this conversion
                    if (!nodeMatrix) {
                        const coordConversion = mat3.fromValues(1, 0, 0, 0, -1, 0, 0, 0, -1);
                        mat3.multiply(normalMatrix, coordConversion, normalMatrix);
                    }

                    const normalMatrixLoc = this.uniformCache.getLocation(shader, 'u_NormalMatrix');
                    this.gl.uniformMatrix3fv(normalMatrixLoc, false, normalMatrix);

                    // 3. Bind material properties (textures and uniforms)
                    // Use materialIndex which may be overridden per instance
                    this.gpuResources.bindShaderAndMaterial(this.defaultShaderProgram, materialIndex, modelData);

                    // 4. Handle winding order for coordinate conversion
                    // Since we flip Y and Z axes (2 flips), triangle winding is reversed
                    // Switch from CCW (default) to CW for proper culling
                    this.gl.frontFace(this.gl.CW);

                    // 5. Draw
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
                    
                    // Reset to default winding order
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

        // Get shadow map shader
        const shadowShader = this.shadowMapShader;
        this.gl.useProgram(shadowShader);

        // For each instance
        for (const instanceId of instanceGroup) {
            const instance = this.instances.get(instanceId);
            if (!instance) continue;

            // KISS Frustum culling for shadow maps: Test instance bounding sphere
            if (!this.isInstanceVisible(instance, modelData)) {
                continue;
            }

            // Update world matrix for shadow rendering
            this.updateWorldMatrix(instance);

            // For each mesh in the model
            for (const renderableNode of modelData.renderableNodes) {
                // Check if this node is disabled for this instance
                if (instance.allNodesDisabled) {
                    continue; // Skip all nodes
                }
                
                const nodeName = renderableNode.nodeName;
                const nodeIdentifier = nodeName || `node_${renderableNode.node.indexData.nodeIndex}`;
                
                if (instance.disabledNodes.has(nodeIdentifier)) {
                    continue; // Skip rendering this node
                }
                
                const mesh = renderableNode.modelMesh;
                for (const primitive of mesh.primitives) {
                    // 1. Bind VAO
                    this.gl.bindVertexArray(primitive.vao);

                    // 2. Set minimal required uniforms for shadow mapping using cached locations
                    const viewProjLoc = this.uniformCache.getLocation(shadowShader, 'u_LightViewProjection');
                    const modelLoc = this.uniformCache.getLocation(shadowShader, 'u_Model');
                    const nodeMatrixLoc = this.uniformCache.getLocation(shadowShader, 'u_NodeMatrix');
                    const useSkinningLoc = this.uniformCache.getLocation(shadowShader, 'u_UseSkinning');

                    // Combine view and projection for efficiency
                    const lightViewProj = mat4.multiply(mat4.create(), viewProjection.projection, viewProjection.view);
                    this.gl.uniformMatrix4fv(viewProjLoc, false, lightViewProj);
                    this.gl.uniformMatrix4fv(modelLoc, false, instance.worldMatrix);

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

                    // Handle winding order for coordinate conversion in shadow maps too
                    this.gl.frontFace(this.gl.CW);
                    
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
                    
                    // Reset to default winding order
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

    // Removed - Model handles these directly

    public enableModelNode(nodeName: string, instance: Model): void {
        const instanceData = this.instances.get(instance.instanceId.id);
        if (instanceData) {
            // If all nodes were disabled, we need to disable all except this one
            if (instanceData.allNodesDisabled) {
                instanceData.allNodesDisabled = false;
                const modelData = this.modelLoader.getModelData(instance.instanceId.modelId);
                if (modelData && modelData.nodeNameMap) {
                    // Disable all nodes except the one being enabled
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
    }

    // Removed - Model handles these directly

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

    /**
     * Gets the world position of a bone/joint by name for a specific instance.
     * @param instanceId The numeric ID of the model instance
     * @param boneName The name of the bone/joint
     * @returns [x, y, z] world position or null if bone/instance not found
     */
    public getBoneWorldPosition(instanceId: number, boneName: string): [number, number, number] | null {
        const instanceData = this.instances.get(instanceId);
        if (!instanceData) {
            console.warn(`[InstanceManager] Instance ${instanceId} not found`);
            return null;
        }

        const modelData = this.modelLoader.getModelData(instanceData.instanceId.modelId);
        if (!modelData) {
            console.warn(`[InstanceManager] Model data not found for instance ${instanceId}`);
            return null;
        }

        // Debug: Log all bone positions once per tick for this instance
        const currentTick = Date.now();
        if (currentTick !== this.lastBoneLogTick) {
            // New tick, clear logged instances
            this.lastBoneLogTick = currentTick;
            this.loggedInstancesThisTick.clear();
        }

        if (!this.loggedInstancesThisTick.has(instanceId)) {
            // First bone request for this instance this tick - log all bones
            this.loggedInstancesThisTick.add(instanceId);
            console.log(`[InstanceManager] === All bone positions for instance ${instanceId} ===`);
            console.log(`[InstanceManager] Instance position:`, Array.from(instanceData.transform.position));
            console.log(`[InstanceManager] Instance scale:`, Array.from(instanceData.transform.scale));

            if (modelData.jointData) {
                const unitsScale = 100;
                modelData.jointData.forEach((joint, idx) => {
                    const boneMatrix = instanceData.animationState.animationMatrices.get(joint.index);
                    if (boneMatrix) {
                        // Unscaled
                        const boneWorldMatrix = mat4.create();
                        mat4.multiply(boneWorldMatrix, instanceData.worldMatrix, boneMatrix);
                        const posUnscaled = [boneWorldMatrix[12], boneWorldMatrix[13], boneWorldMatrix[14]];

                        // Scaled
                        const scaledBoneMatrix = mat4.clone(boneMatrix);
                        scaledBoneMatrix[12] *= unitsScale;
                        scaledBoneMatrix[13] *= unitsScale;
                        scaledBoneMatrix[14] *= unitsScale;
                        const boneWorldMatrixScaled = mat4.create();
                        mat4.multiply(boneWorldMatrixScaled, instanceData.worldMatrix, scaledBoneMatrix);
                        const posScaled = [boneWorldMatrixScaled[12], boneWorldMatrixScaled[13], boneWorldMatrixScaled[14]];

                        const modelPos = [boneMatrix[12], boneMatrix[13], boneMatrix[14]];
                        console.log(`[InstanceManager]   [${idx}] ${joint.name}: world=${posUnscaled.map(v => v.toFixed(1))} scaled=${posScaled.map(v => v.toFixed(1))} model=${modelPos.map(v => v.toFixed(1))}`);
                    }
                });
            }
            console.log(`[InstanceManager] ====================================`);
        }

        // Find the node by name
        const boneNode = modelData.nodeNameMap?.get(boneName);
        if (!boneNode) {
            console.warn(`[InstanceManager] Bone "${boneName}" not found in model`);
            return null;
        }

        // Get the bone's model-space transform from animation matrices
        const boneModelMatrix = instanceData.animationState.animationMatrices.get(boneNode.indexData.nodeIndex);
        if (!boneModelMatrix) {
            console.warn(`[InstanceManager] Animation matrix not found for bone "${boneName}"`);
            return null;
        }

        // Apply units scale to bone position (temporary hardcoded to 100)
        // The bone positions are in model-space units and need to match the mesh vertex scale
        const unitsScale = 100;
        const scaledBoneMatrix = mat4.clone(boneModelMatrix);
        scaledBoneMatrix[12] *= unitsScale;
        scaledBoneMatrix[13] *= unitsScale;
        scaledBoneMatrix[14] *= unitsScale;

        // Transform to world space using instance's world matrix
        const boneWorldMatrix = mat4.create();
        mat4.multiply(boneWorldMatrix, instanceData.worldMatrix, scaledBoneMatrix);

        // Extract translation component from world matrix
        const position: [number, number, number] = [
            boneWorldMatrix[12],
            boneWorldMatrix[13],
            boneWorldMatrix[14]
        ];

        return position;
    }

    /**
     * Gets the world position of a bone/joint by index for a specific instance.
     * @param instanceId The numeric ID of the model instance
     * @param boneIndex The index of the bone/joint
     * @returns [x, y, z] world position or null if bone/instance not found
     */
    public getBoneWorldPositionByIndex(instanceId: number, boneIndex: number): [number, number, number] | null {
        const instanceData = this.instances.get(instanceId);
        if (!instanceData) {
            console.warn(`[InstanceManager] Instance ${instanceId} not found`);
            return null;
        }

        // Get the bone's model-space transform from animation matrices
        const boneModelMatrix = instanceData.animationState.animationMatrices.get(boneIndex);
        if (!boneModelMatrix) {
            console.warn(`[InstanceManager] Animation matrix not found for bone index ${boneIndex}`);
            return null;
        }

        // Apply units scale to bone position (temporary hardcoded to 100)
        // The bone positions are in model-space units and need to match the mesh vertex scale
        const unitsScale = 100;
        const scaledBoneMatrix = mat4.clone(boneModelMatrix);
        scaledBoneMatrix[12] *= unitsScale;
        scaledBoneMatrix[13] *= unitsScale;
        scaledBoneMatrix[14] *= unitsScale;

        // Transform to world space using instance's world matrix
        const boneWorldMatrix = mat4.create();
        mat4.multiply(boneWorldMatrix, instanceData.worldMatrix, scaledBoneMatrix);

        // Extract translation component
        const position: [number, number, number] = [
            boneWorldMatrix[12],
            boneWorldMatrix[13],
            boneWorldMatrix[14]
        ];

        return position;
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
}

// @ts-ignore
globalThis.InstanceManager = InstanceManager;