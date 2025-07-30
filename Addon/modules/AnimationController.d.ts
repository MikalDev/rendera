import { ModelLoader } from './ModelLoader';
import { InstanceData, AnimationOptions } from './types';
export declare class AnimationController {
    private modelLoader;
    private useWorker;
    private workerManager;
    constructor(modelLoader: ModelLoader);
    setUseWorker(enabled: boolean): void;
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
    private updateBoneMatricesAsync;
    private updateBoneMatricesSync;
    private updateBoneMatricesWorker;
    private updateBoneMatricesMainThread;
    private mat4FromTypedArray;
    private findKeyframeIndices;
    private interpolateValues;
    startAnimation(instance: InstanceData, animationName: string, options?: AnimationOptions): void;
    stopAnimation(instance: InstanceData): void;
}
//# sourceMappingURL=AnimationController.d.ts.map