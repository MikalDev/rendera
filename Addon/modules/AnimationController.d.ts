import { ModelLoader } from './ModelLoader';
import { InstanceData, AnimationOptions } from './types';
export declare class AnimationController {
    private modelLoader;
    constructor(modelLoader: ModelLoader);
    private fastSceneTraverse;
    private updateNodeLocalTransforms;
    setBindPose(instance: InstanceData): void;
    private updateAnimationMatricesFromTransforms;
    updateAnimation(instance: InstanceData, deltaTime: number): void;
    private updateNodeHierarchyTransforms;
    private maxDuration;
    private updateTime;
    private updateNodeAnimationTransforms;
    private updateNodeSkinningMatrices;
    private updateBoneMatrices;
    private mat4FromTypedArray;
    private findKeyframeIndices;
    private interpolateValues;
    startAnimation(instance: InstanceData, animationName: string, options?: AnimationOptions): void;
    stopAnimation(instance: InstanceData): void;
}
//# sourceMappingURL=AnimationController.d.ts.map