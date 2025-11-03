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
    /**
     * Sets the tint color for this model instance.
     * @param r Red component (0-1)
     * @param g Green component (0-1)
     * @param b Blue component (0-1)
     */
    setTintColor(r: number, g: number, b: number): void;
    /**
     * Sets the opacity for this model instance.
     * @param opacity Opacity value (0-1, where 0 is transparent and 1 is opaque)
     */
    setOpacity(opacity: number): void;
    /**
     * Sets the material for a specific node (and all its primitives).
     * @param nodeName The name of the node (or 'node_<index>' for unnamed nodes)
     * @param materialIndex The index of the material to use (must be valid in model's material array)
     */
    setMaterial(nodeName: string, materialIndex: number): void;
    /**
     * Resets all material overrides for this instance, reverting to the model's default materials.
     */
    resetMaterials(): void;
}
//# sourceMappingURL=Model.d.ts.map