import { InstanceId, IModel, IInstanceManager, AnimationOptions, InstanceData } from './types';
export declare class Model implements IModel {
    readonly instanceId: InstanceId;
    private _manager;
    private _instanceData;
    constructor(instanceId: InstanceId, manager: IInstanceManager, instanceData: InstanceData);
    get animationSpeed(): number;
    set animationSpeed(speed: number);
    get normalMapEnabled(): boolean;
    set normalMapEnabled(enabled: boolean);
    setPosition(x: number, y: number, z: number): void;
    setRotation(quaternion: Float32Array): void;
    setScale(x: number, y: number, z: number): void;
    setAnimationSpeed(speed: number): void;
    setNormalMapEnabled(enabled: boolean): void;
    playAnimation(animationName: string, options?: AnimationOptions): void;
    updateAnimation(deltaTime: number): void;
    stopAnimation(): void;
    setBindPose(): void;
    setQuaternion(x: number, y: number, z: number, w: number): void;
    /**
     * Enables all nodes in this model instance for rendering.
     */
    enableAllNodes(): void;
    /**
     * Disables all nodes in this model instance from rendering.
     * This is more efficient than disabling nodes individually.
     */
    disableAllNodes(): void;
    /**
     * Enables a specific node by name for rendering.
     * @param nodeName The name of the node to enable. For unnamed nodes, use 'node_<index>'.
     */
    enableNode(nodeName: string): void;
    /**
     * Disables a specific node by name from rendering.
     * @param nodeName The name of the node to disable. For unnamed nodes, use 'node_<index>'.
     */
    disableNode(nodeName: string): void;
    /**
     * Checks if a specific node is enabled for rendering.
     * @param nodeName The name of the node to check. For unnamed nodes, use 'node_<index>'.
     * @returns True if the node is enabled, false if disabled.
     */
    isNodeEnabled(nodeName: string): boolean;
    get manager(): IInstanceManager;
}
//# sourceMappingURL=Model.d.ts.map