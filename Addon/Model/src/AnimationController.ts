// src/AnimationController.ts
import { ModelLoader } from './ModelLoader';
import { InstanceData, AnimationOptions, AnimationState, ExtendedNode } from './types';
import { mat4, quat, vec3, vec4 } from 'gl-matrix';
import { Scene, Animation, Node, TypedArray } from '@gltf-transform/core';
import { AnimationWorkerManager } from './AnimationWorkerManager';

export class AnimationController {
    private useWorker: boolean = false;
    private workerManager: AnimationWorkerManager | null = null;
    
    constructor(private modelLoader: ModelLoader) {
        this.modelLoader = modelLoader;
    }

    public setUseWorker(enabled: boolean): void {
        console.log(`[AnimationController] setUseWorker called with enabled=${enabled}`);
        this.useWorker = enabled;
        console.log(`[AnimationController] Current workerManager state:`, this.workerManager ? 'exists' : 'null');
        
        // Initialize or terminate worker based on setting
        if (enabled) {
            if (!this.workerManager) {
                console.log('[AnimationController] Creating new AnimationWorkerManager');
                this.workerManager = new AnimationWorkerManager();
                console.log('[AnimationController] Calling workerManager.initialize()');
                this.workerManager.initialize().then(() => {
                    console.log('[AnimationController] Worker manager initialized successfully');
                }).catch((error) => {
                    console.error('[AnimationController] Worker manager initialization failed:', error);
                });
            } else {
                console.log('[AnimationController] Worker manager already exists');
            }
        } else {
            if (this.workerManager) {
                console.log('[AnimationController] Terminating worker manager');
                this.workerManager.terminate();
                this.workerManager = null;
            } else {
                console.log('[AnimationController] No worker manager to terminate');
            }
        }
        console.log(`[AnimationController] Worker mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    private fastSceneTraverse(
        scene: Scene, 
        modelData: any, 
        fcn: (node: Node) => void
    ): void {
        // Use a stack for iterative traversal (faster than recursion)
        const stack: number[] = [];
        
        // Push initial children indices
        for (let i = scene.listChildren().length - 1; i >= 0; i--) {
            const childNode = scene.listChildren()[i] as ExtendedNode;
            stack.push(childNode.indexData.nodeIndex);
        }

        // Process all nodes
        while (stack.length > 0) {
            const nodeIndex = stack.pop()!;
            const node = modelData.nodeArray[nodeIndex];
            
            fcn(node);

            // Push children indices in reverse order (to process left to right when popping)
            const children = node.listChildren();
            for (let i = children.length - 1; i >= 0; i--) {
                stack.push(children[i].indexData.nodeIndex);
            }
        }
    }

    private updateNodeLocalTransforms(instance: InstanceData): void {
        const modelData = this.modelLoader.getModelData(instance.instanceId.modelId);
        if (!modelData) return;
        const nodeTransforms = instance.animationState.animationNodeTransforms;
        
        this.fastSceneTraverse(modelData.scene, modelData, (node: Node) => {
            const extendedNode = node as ExtendedNode;
            const nodeMatrix = node.getMatrix();
            let translation: vec3;
            let rotation: vec4;
            let scale: vec3;
            
            if (nodeMatrix) {
                translation = vec3.create();
                rotation = quat.create();
                scale = vec3.create();
                
                mat4.getTranslation(translation, nodeMatrix);
                mat4.getRotation(rotation, nodeMatrix);
                mat4.getScaling(scale, nodeMatrix);
                
            } else {
                translation = node.getTranslation() || vec3.create();
                rotation = node.getRotation() || quat.create();
                scale = node.getScale() || vec3.create();
            }
            nodeTransforms.set(extendedNode.indexData.nodeIndex, { translation, rotation, scale });
        });
    }

    public setBindPose(instance: InstanceData): void {
        this.updateNodeLocalTransforms(instance);
        this.updateAnimationMatricesFromTransforms(instance);
        this.updateNodeHierarchyTransforms(instance);
    }

    

    private updateAnimationMatricesFromTransforms(instance: InstanceData): void {
        const animationMatrices = instance.animationState.animationMatrices;
        const nodeTransforms = instance.animationState.animationNodeTransforms;
        const modelData = this.modelLoader.getModelData(instance.instanceId.modelId);
        if (!modelData?.scene) return;
        
        this.fastSceneTraverse(modelData.scene, modelData, (node: Node) => {
            const extendedNode = node as ExtendedNode;
            const transform = nodeTransforms.get(extendedNode.indexData.nodeIndex);
            if (transform) {
                const animationMatrix = mat4.create();
                mat4.fromRotationTranslationScale(animationMatrix, transform.rotation, transform.translation, transform.scale);
                animationMatrices.set(extendedNode.indexData.nodeIndex, animationMatrix);
            }
        });
    }

    updateAnimation(instance: InstanceData, deltaTime: number): void {

        const animationState = instance.animationState;
        const currentAnimation = animationState.currentAnimation;
        const playing = animationState.playing;
        // const currentTime = animationState.currentTime;
        // const speed = animationState.speed;
        // const loop = animationState.loop;

        if (!playing) return;
        if (currentAnimation === null) return;

        const modelData = this.modelLoader.getModelData(instance.instanceId.modelId);
        const animations = modelData?.animations;
        if (!animations) return;
        const animation = animations.get(currentAnimation);
        if (!animation) {
            this.stopAnimation(instance);
            return;
        }

        // Find maximum duration across all channels
        const maxDuration = this.maxDuration(animation);

        // Update animation time
        instance.animationState.currentTime = this.updateTime(
            instance.animationState,
            deltaTime,
            maxDuration
        );
        // TODO: This can be optimized by creating a version of this at the model level and copying it to the instance
        this.updateNodeLocalTransforms(instance);

        // Update node transforms from animation
        this.updateNodeAnimationTransforms(instance, animation);

        // Update node hierarchy transforms
        this.updateNodeHierarchyTransforms(instance);

        // Update bone matrices if skinning
        if (modelData?.jointData?.length > 0) {
            this.updateNodeSkinningMatrices(instance);
        }
    }

    private updateNodeHierarchyTransforms(instance: InstanceData): void {
        const modelData = this.modelLoader.getModelData(instance.instanceId.modelId);
        if (!modelData) return;
        
        this.fastSceneTraverse(modelData.scene, modelData, (node: Node) => {
            const extendedNode = node as ExtendedNode;
            let parentMatrix;
            if (extendedNode.indexData.parentIndex !== null) {
                const parent = modelData?.nodeArray?.[extendedNode.indexData.parentIndex] as ExtendedNode;
                parentMatrix = instance.animationState.animationMatrices.get(parent.indexData.nodeIndex);
                if (!parentMatrix) {
                    console.warn('Parent matrix not found for node', node);
                    parentMatrix = mat4.create();
                }
            } else {
                parentMatrix = mat4.create();
            }
            const nodeTransforms = instance.animationState.animationNodeTransforms.get(extendedNode.indexData.nodeIndex);
            let animationMatrix = mat4.create();
            if (nodeTransforms) {
                const rotation = nodeTransforms.rotation ?? quat.create();
                const translation = nodeTransforms.translation ?? vec3.create();
                const scale = nodeTransforms.scale ?? vec3.create();
                mat4.fromRotationTranslationScale(animationMatrix, rotation, translation, scale);
            }
            mat4.multiply(animationMatrix, parentMatrix, animationMatrix);
            instance.animationState.animationMatrices.set(extendedNode.indexData.nodeIndex, animationMatrix);
        });
    }

    private maxDuration(animation: Animation): number {
        let maxDuration = 0
        for (const channel of animation.listChannels()) {
            const sampler = channel.getSampler();
            if (!sampler) continue;
            const input = sampler.getInput();
            if (input) {
                const times = input.getArray();
                if (times && times.length > 0) {
                    maxDuration = Math.max(maxDuration, times[times.length - 1]);
                }
            }
        }
        return maxDuration;
    }

    private updateTime(
        state: AnimationState, 
        deltaTime: number, 
        duration: number
    ): number {
        const newTime = state.currentTime + (deltaTime * state.speed);
        return state.loop ? (newTime % duration) : Math.min(newTime, duration);
    }

    private updateNodeAnimationTransforms(
        instance: InstanceData,
        animation: Animation
    ): void {
        const animationState = instance.animationState;
        
        for (const channel of animation.listChannels()) {
            const time = instance.animationState.currentTime;
            const sampler = channel.getSampler();
            const targetNode = channel.getTargetNode() as ExtendedNode;
            const targetPath = channel.getTargetPath();
            
            if (!sampler || !targetNode || !targetPath) continue;
            const input = sampler.getInput();
            const output = sampler.getOutput();


            if (!input || !output) continue;
            const { startIndex, endIndex, factor } = this.findKeyframeIndices(
                input.getArray() as Float32Array,
                time
            );



            // Get interpolated value
            const value = this.interpolateValues(
                output.getArray() as Float32Array,
                startIndex,
                endIndex,
                factor,
                targetPath
            );

            let nodeTransforms = animationState.animationNodeTransforms.get(targetNode.indexData.nodeIndex);
            if (!nodeTransforms) {
                console.warn(`Node transforms not found for node ${targetNode.getName()}`);
                continue;
            }

            // Apply transform based on path type
            switch (targetPath) {
                case 'translation':
                    nodeTransforms.translation = value as vec3;
                    break;
                case 'rotation':
                    nodeTransforms.rotation = value as vec4;
                    break;
                case 'scale':
                    nodeTransforms.scale = value as vec3;
                    break;
                case 'weights':
                    // TODO: for morph targets
                    break;
            }
        }
    }

    private updateNodeSkinningMatrices(instance: InstanceData): void {
        const modelData = this.modelLoader.getModelData(instance.instanceId.modelId);
        if (!modelData) return;
        
        // Collect all nodes with skins for bone calculation
        const nodesWithSkins: Node[] = [];
        this.fastSceneTraverse(modelData.scene, modelData, node => {
            const skin = node.getSkin();
            if (skin) {
                nodesWithSkins.push(node);
            }
        });
        
        // Update bones
        if (this.useWorker && this.workerManager) {
            // Fire and forget - start worker calculation
            this.updateBoneMatricesAsync(nodesWithSkins, instance);
        } else {
            // Sync path for main thread
            for (const node of nodesWithSkins) {
                this.updateBoneMatricesSync(node, instance);
            }
        }
    }
    
    // Fire-and-forget async bone calculation
    private async updateBoneMatricesAsync(nodes: Node[], instance: InstanceData): Promise<void> {
        // Process all nodes (results will be used next frame)
        for (const node of nodes) {
            try {
                await this.updateBoneMatricesWorker(node, instance);
            } catch (error) {
                // Check if it's just the worker not ready yet - this is expected during startup
                if (error instanceof Error && error.message === 'AnimationWorker not ready') {
                    // Just skip animation update until worker is ready
                    return;
                } else {
                    // Log other errors
                    console.error('[AnimationController] Worker calculation failed:', error);
                }
            }
        }
    }

    // Synchronous bone calculation for main thread
    private updateBoneMatricesSync(node: Node, instance: InstanceData): void {
        const skin = node.getSkin();
        if (!skin) {
            console.error(`Skin not found for node ${node.getName()}`);
            return;
        }
        const skinJoints = skin?.listJoints();
        if (!skinJoints) {
            console.error(`Skin joints not found for node ${node.getName()}`);
            return;
        }

        const inverseBindMatrices = skin.getInverseBindMatrices()?.getArray();
        if (!inverseBindMatrices) {
            console.error(`Inverse bind matrices not found for skin ${skin.getName()}`);
            return;
        }

        // Always use main thread for sync version
        this.updateBoneMatricesMainThread(node, instance, skinJoints, inverseBindMatrices);
    }
    
    // Asynchronous bone calculation using worker
    private async updateBoneMatricesWorker(node: Node, instance: InstanceData): Promise<void> {
        const skin = node.getSkin();
        if (!skin) return;
        
        const skinJoints = skin?.listJoints();
        if (!skinJoints) return;
        
        const extendedNode = node as ExtendedNode;
        const inverseBindMatrices = skin.getInverseBindMatrices()?.getArray();
        if (!inverseBindMatrices) return;
        
        const animationMatrices = instance.animationState.animationMatrices;
        
        // Prepare data for worker - only send joint matrices (KISS optimization)
        const jointMatrices = new Float32Array(skinJoints.length * 16);
        
        // Copy only joint matrices
        for (let i = 0; i < skinJoints.length; i++) {
            const jointNode = skinJoints[i] as ExtendedNode;
            const jointMatrix = animationMatrices.get(jointNode.indexData.nodeIndex);
            if (jointMatrix) {
                jointMatrices.set(jointMatrix, i * 16);
            }
        }
        
        // Also need the skinned node's matrix
        const nodeMatrix = animationMatrices.get(extendedNode.indexData.nodeIndex);
        const nodeMatrixArray = nodeMatrix ? new Float32Array(nodeMatrix) : new Float32Array(16);
        
        // Combine into single array: [nodeMatrix, ...jointMatrices]
        const nodeMatrices = new Float32Array(nodeMatrixArray.length + jointMatrices.length);
        nodeMatrices.set(nodeMatrixArray, 0);
        nodeMatrices.set(jointMatrices, 16);
        
        // Get joint indices
        const jointIndices = new Uint16Array(skinJoints.length);
        for (let i = 0; i < skinJoints.length; i++) {
            jointIndices[i] = (skinJoints[i] as ExtendedNode).indexData.nodeIndex;
        }
        
        // Calculate using worker
        const boneMatrices = await this.workerManager!.calculateBoneMatrices(
            instance.instanceId.id,
            instance.instanceId.modelId,
            extendedNode.indexData.nodeIndex,
            nodeMatrices,
            inverseBindMatrices as Float32Array,
            jointIndices
        );
        
        // Store result (will be used in next frame)
        instance.animationState.boneMatrices.set(extendedNode.indexData.nodeIndex, boneMatrices);
    }

    // DRY - Extract main thread logic to separate method
    private updateBoneMatricesMainThread(
        node: Node, 
        instance: InstanceData, 
        skinJoints: Node[], 
        inverseBindMatrices: TypedArray
    ): void {
        const extendedNode = node as ExtendedNode;
        const nodeBoneMatrices = instance.animationState.boneMatrices.get(extendedNode.indexData.nodeIndex) ?? new Float32Array(skinJoints.length * 16);

        // Create node inverse matrix
        const animationMatrices = instance.animationState.animationMatrices;
        const nodeInverseMatrix = mat4.create();
        const nodeAnimationMatrix = animationMatrices.get(extendedNode.indexData.nodeIndex);
        if (!nodeAnimationMatrix) {
            console.error(`Animation matrix not found for node ${node.getName()}`);
            return;
        }
        mat4.invert(nodeInverseMatrix, nodeAnimationMatrix);

        for (let jj = 0; jj < skinJoints.length; jj++) {
            const joint = skinJoints[jj] as ExtendedNode;
            const jointMatrix = animationMatrices.get(joint.indexData.nodeIndex) ?? mat4.create();
            const boneMatrix = mat4.create();
            const inverseBindMatrix = this.mat4FromTypedArray(inverseBindMatrices, jj);
            mat4.multiply(boneMatrix, nodeInverseMatrix, jointMatrix);
            mat4.multiply(boneMatrix, boneMatrix, inverseBindMatrix);
            nodeBoneMatrices.set(boneMatrix, jj * 16);
        }
        instance.animationState.boneMatrices.set(extendedNode.indexData.nodeIndex, nodeBoneMatrices);
    }

    private mat4FromTypedArray(array: TypedArray, index: number): mat4 {
        const result = mat4.create();
        const start = index * 16;
        for (let i = 0; i < 16; i++) { result[i] = array[start + i] }
        return result;
    }

    private findKeyframeIndices(
        times: Float32Array,
        time: number
    ): { startIndex: number; endIndex: number; factor: number } {
        if (time <= times[0]) {
            return { startIndex: 0, endIndex: 1, factor: 0 };
        }
        if (time >= times[times.length - 1]) {
            const lastIndex = times.length - 1;
            return { 
                startIndex: lastIndex - 1, 
                endIndex: lastIndex,
                factor: 1
            };
        }

        // Binary search for the appropriate time segment
        let low = 0;
        let high = times.length - 1;
        
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (mid + 1 >= times.length) {
                continue;
            }
            if (times[mid] <= time && time < times[mid + 1]) {
                const startIndex = mid;
                const endIndex = mid + 1;
                const factor = (time - times[startIndex]) / (times[endIndex] - times[startIndex]);
                return { startIndex, endIndex, factor };
            }
            
            if (times[mid] > time) {
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }

        // Fallback (should never happen with proper edge case handling)
        return { startIndex: 0, endIndex: 0, factor: 0 };
    }

    private interpolateValues(
        values: Float32Array,
        startIndex: number,
        endIndex: number,
        factor: number,
        targetPath: string
    ): vec3 | vec4 {
        let stride = 0;
        switch (targetPath) {
            case 'translation':
            case 'scale':
                stride = 3;
                break;
            case 'rotation':
                stride = 4;
                break;
            case 'weights':
                // TODO: for morph targets
                break;
        }
        const start = values.subarray(startIndex * stride, (startIndex + 1) * stride);
        const end = values.subarray(endIndex * stride, (endIndex + 1) * stride);
        
        const result = new Float32Array(stride);
        
        if (targetPath === 'rotation') {
            quat.slerp(result, start as Float32Array, end as Float32Array, factor);
            quat.normalize(result, result);
        } else {
            vec3.lerp(result, start as Float32Array, end as Float32Array, factor);
        }
        
        return result;
    }

    startAnimation(
        instance: InstanceData, 
        animationName: string, 
        options?: AnimationOptions
    ): void {
        const animationState = instance.animationState;
        animationState.currentAnimation = animationName;
        animationState.currentTime = 0;
        animationState.speed = options?.speed ?? 1;
        animationState.loop = options?.loop ?? true;
        animationState.playing = true;
        //animationState.animationMatrices.clear();
    }

    stopAnimation(instance: InstanceData): void {
        instance.animationState.playing = false;
        instance.animationState.currentAnimation = null;
        instance.animationState.currentTime = 0;
    }
}