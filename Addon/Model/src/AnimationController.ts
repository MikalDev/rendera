// src/AnimationController.ts
import { ModelLoader } from './ModelLoader';
import { InstanceData, AnimationOptions, AnimationState } from './types';
import { mat4, quat, vec3, vec4 } from 'gl-matrix';
import { Animation, Node, TypedArray } from '@gltf-transform/core';

export class AnimationController {
    constructor(private modelLoader: ModelLoader) {
        this.modelLoader = modelLoader;
    }

    private updateNodeLocalTransforms(instance: InstanceData): void {
        const modelData = this.modelLoader.getModelData(instance.instanceId.modelId);
        if (!modelData) return;
        const nodeTransforms = instance.animationState.animationNodeTransforms;
        const scene = modelData.scene;
        scene.traverse(node => {
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
            nodeTransforms.set(node, { translation, rotation, scale });
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
        const scene = this.modelLoader.getModelData(instance.instanceId.modelId)?.scene;
        if (!scene) return;
        scene.traverse(node => {
            const transform = nodeTransforms.get(node);
            if (transform) {
                const animationMatrix = mat4.create();
                mat4.fromRotationTranslationScale(animationMatrix, transform.rotation, transform.translation, transform.scale);
                animationMatrices.set(node, animationMatrix);
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
        const scene = modelData.scene;

        scene.traverse(node => {
            let parentMatrix
            // Get parent node
            const parent = node.getParentNode();
            if (parent !== null) {
                parentMatrix = instance.animationState.animationMatrices.get(parent);
                if (!parentMatrix) {
                    console.warn(`Parent animation matrix not found for node ${node.getName()}`);
                    parentMatrix = mat4.create();
                }
            } else {
                parentMatrix = mat4.create();
            }
            const nodeTransforms = instance.animationState.animationNodeTransforms.get(node);
            let animationMatrix = mat4.create();
            if (nodeTransforms) {
                const rotation = nodeTransforms.rotation ?? quat.create();
                const translation = nodeTransforms.translation ?? vec3.create();
                const scale = nodeTransforms.scale ?? vec3.create();
                mat4.fromRotationTranslationScale(animationMatrix, rotation, translation, scale);
            }
            mat4.multiply(animationMatrix, parentMatrix, animationMatrix );
            instance.animationState.animationMatrices.set(node, animationMatrix);
        });
        // console.info(`Updated animation matrices for instance ${instance.instanceId.id}`);
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
            const targetNode = channel.getTargetNode();
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

            let nodeTransforms = animationState.animationNodeTransforms.get(targetNode);
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
        const scene = modelData.scene;
        const animationMatrices = instance.animationState.animationMatrices;
        scene.traverse(node => {
            const skin = node.getSkin();
            if (skin) {
                this.updateBoneMatrices(node, instance);
            }
        });
    }

    private updateBoneMatrices(node: Node, instance: InstanceData): void {
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

        const nodeBoneMatrices = instance.animationState.boneMatrices.get(node) ?? new Float32Array(skinJoints.length * 16);

        // Create node inverse matrix
        const animationMatrices = instance.animationState.animationMatrices;
        const nodeInverseMatrix = mat4.create();
        const nodeAnimationMatrix = animationMatrices.get(node);
        if (!nodeAnimationMatrix) {
            console.error(`Animation matrix not found for node ${node.getName()}`);
            return;
        }
        mat4.invert(nodeInverseMatrix, nodeAnimationMatrix);
        const inverseBindMatrices = skin.getInverseBindMatrices()?.getArray();
        if (!inverseBindMatrices) {
            console.error(`Inverse bind matrices not found for skin ${skin.getName()}`);
            return;
        }

        for (let jj = 0; jj < skinJoints.length; jj++) {
            const joint = skinJoints[jj];
            const jointMatrix = animationMatrices.get(joint) ?? mat4.create();
            const boneMatrix = mat4.create();
            const inverseBindMatrix = this.mat4FromTypedArray(inverseBindMatrices, jj);
            mat4.multiply(boneMatrix, nodeInverseMatrix, jointMatrix);
            mat4.multiply(boneMatrix, boneMatrix, inverseBindMatrix);
            // mat4.multiply(boneMatrix, jointMatrix, inverseBindMatrix);
            nodeBoneMatrices.set(boneMatrix, jj * 16);
        }
        instance.animationState.boneMatrices.set(node, nodeBoneMatrices);
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