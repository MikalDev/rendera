import { InstanceId, IModel, IInstanceManager, AnimationOptions } from './types';
export declare class Model implements IModel {
    readonly instanceId: InstanceId;
    private _manager;
    constructor(instanceId: InstanceId, manager: IInstanceManager);
    setNormalMapEnabled(enabled: boolean): void;
    setPosition(x: number, y: number, z: number): void;
    setRotation(quaternion: Float32Array): void;
    setScale(x: number, y: number, z: number): void;
    playAnimation(animationName: string, options?: AnimationOptions): void;
    updateAnimation(deltaTime: number): void;
    stopAnimation(): void;
    setBindPose(): void;
    setQuaternion(x: number, y: number, z: number, w: number): void;
    get manager(): IInstanceManager;
}
//# sourceMappingURL=Model.d.ts.map