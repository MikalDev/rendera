import { InstanceId, IModel, IInstanceManager, AnimationOptions } from './types';

export class Model implements IModel {
    readonly instanceId: InstanceId;
    private _manager: IInstanceManager;

    constructor(instanceId: InstanceId, manager: IInstanceManager) {
        this.instanceId = instanceId;
        this._manager = manager;
    }

    public setNormalMapEnabled(enabled: boolean): void {
        this._manager.setModelNormalMapEnabled(enabled, this);
    }

    public setPosition(x: number, y: number, z: number): void {
        this._manager.setModelPosition(x, y, z, this);
    }

    public setRotation(quaternion: Float32Array): void {
        this._manager.setModelRotation(quaternion, this);
    }

    public setScale(x: number, y: number, z: number): void {
        this._manager.setModelScale(x, y, z, this);
    }

    public playAnimation(animationName: string, options?: AnimationOptions): void {
        this._manager.playModelAnimation(animationName, this, options);
    }

    public updateAnimation(deltaTime: number): void {
        this._manager.updateModelAnimation(this, deltaTime);
    }

    public stopAnimation(): void {
        this._manager.stopModelAnimation(this);
    }

    public setBindPose(): void {
        this._manager.setModelBindPose(this);
    }

    // Additional convenience methods
    public setQuaternion(x: number, y: number, z: number, w: number): void {
        const quat = new Float32Array([x, y, z, w]);
        this._manager.setModelRotation(
            quat,
            this
        );
    }

    get manager(): IInstanceManager {
        return this._manager;
    }

}
