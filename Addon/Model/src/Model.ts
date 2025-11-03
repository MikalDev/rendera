import { InstanceId, IModel, IInstanceManager, AnimationOptions, InstanceData } from './types';

export class Model implements IModel {
    readonly instanceId: InstanceId;
    private _manager: IInstanceManager;
    private _instanceData: InstanceData;

    constructor(instanceId: InstanceId, manager: IInstanceManager, instanceData: InstanceData) {
        this.instanceId = instanceId;
        this._manager = manager;
        this._instanceData = instanceData;
    }

    // Getter/Setter for animation speed
    get animationSpeed(): number {
        return this._instanceData.animationState.speed;
    }

    set animationSpeed(speed: number) {
        // Clamp speed to reasonable values (0.1x to 10x)
        this._instanceData.animationState.speed = Math.max(0.1, Math.min(10, speed));
    }

    // Getter/Setter for normal map
    get normalMapEnabled(): boolean {
        return this._instanceData.renderOptions.useNormalMap ?? false;
    }

    set normalMapEnabled(enabled: boolean) {
        this._instanceData.renderOptions.useNormalMap = enabled;
    }

    // Direct property access methods
    public setPosition(x: number, y: number, z: number): void {
        this._instanceData.transform.position.set([x, y, z]);
        this._manager.markInstanceDirty(this.instanceId.id);
    }

    public setRotation(quaternion: Float32Array): void {
        this._instanceData.transform.rotation.set(quaternion);
        this._manager.markInstanceDirty(this.instanceId.id);
    }

    public setScale(x: number, y: number, z: number): void {
        this._instanceData.transform.scale.set([x, y, z]);
        this._manager.markInstanceDirty(this.instanceId.id);
    }

    // Deprecated - use animationSpeed property instead
    public setAnimationSpeed(speed: number): void {
        this.animationSpeed = speed;
    }

    // Deprecated - use normalMapEnabled property instead
    public setNormalMapEnabled(enabled: boolean): void {
        this.normalMapEnabled = enabled;
    }

    public playAnimation(animationName: string, options?: AnimationOptions): void {
        // Use the manager's startAnimation method which properly handles blending
        // The manager has access to AnimationController with the new blending logic
        this._manager.startAnimation(this, animationName, options);
    }

    public updateAnimation(deltaTime: number): void {
        // Delegate to manager as it needs access to AnimationController
        this._manager.updateModelAnimation(this, deltaTime);
    }

    public stopAnimation(): void {
        this._instanceData.animationState.currentAnimation = null;
        this._instanceData.animationState.playing = false;
        this._instanceData.animationState.currentTime = 0;
        this._manager.invalidateAnimationCache(this.instanceId.id);
    }

    public setBindPose(): void {
        // Delegate to manager as it needs access to AnimationController
        this._manager.setModelBindPose(this);
    }

    // Additional convenience methods
    public setQuaternion(x: number, y: number, z: number, w: number): void {
        const quat = new Float32Array([x, y, z, w]);
        this.setRotation(quat);
    }

    /**
     * Enables all nodes in this model instance for rendering.
     */
    public enableAllNodes(): void {
        this._instanceData.disabledNodes.clear();
        this._instanceData.allNodesDisabled = false;
    }

    /**
     * Disables all nodes in this model instance from rendering.
     * This is more efficient than disabling nodes individually.
     */
    public disableAllNodes(): void {
        this._instanceData.allNodesDisabled = true;
        this._instanceData.disabledNodes.clear();
    }

    /**
     * Enables a specific node by name for rendering.
     * @param nodeName The name of the node to enable. For unnamed nodes, use 'node_<index>'.
     */
    public enableNode(nodeName: string): void {
        if (this._instanceData.allNodesDisabled) {
            // If all nodes were disabled, we need to switch to individual mode
            this._instanceData.allNodesDisabled = false;
            // We'd need access to all node names to disable all except this one
            // For now, delegate to manager for this complex case
            this._manager.enableModelNode(nodeName, this);
        } else {
            this._instanceData.disabledNodes.delete(nodeName);
        }
    }

    /**
     * Disables a specific node by name from rendering.
     * @param nodeName The name of the node to disable. For unnamed nodes, use 'node_<index>'.
     */
    public disableNode(nodeName: string): void {
        if (this._instanceData.allNodesDisabled) {
            return; // Already all disabled
        }
        this._instanceData.disabledNodes.add(nodeName);
    }

    /**
     * Checks if a specific node is enabled for rendering.
     * @param nodeName The name of the node to check. For unnamed nodes, use 'node_<index>'.
     * @returns True if the node is enabled, false if disabled.
     */
    public isNodeEnabled(nodeName: string): boolean {
        if (this._instanceData.allNodesDisabled) {
            return false;
        }
        return !this._instanceData.disabledNodes.has(nodeName);
    }

    get manager(): IInstanceManager {
        return this._manager;
    }

    /**
     * Sets the tint color for this model instance.
     * @param r Red component (0-1)
     * @param g Green component (0-1) 
     * @param b Blue component (0-1)
     */
    public setTintColor(r: number, g: number, b: number): void {
        this._instanceData.tintColor = [
            Math.max(0, Math.min(1, r)),
            Math.max(0, Math.min(1, g)),
            Math.max(0, Math.min(1, b))
        ];
        this._manager.markInstanceDirty(this.instanceId.id);
    }

    /**
     * Sets the opacity for this model instance.
     * @param opacity Opacity value (0-1, where 0 is transparent and 1 is opaque)
     */
    public setOpacity(opacity: number): void {
        this._instanceData.opacity = Math.max(0, Math.min(1, opacity));
        this._manager.markInstanceDirty(this.instanceId.id);
    }

    /**
     * Sets the material for a specific node (and all its primitives).
     * @param nodeName The name of the node (or 'node_<index>' for unnamed nodes)
     * @param materialIndex The index of the material to use (must be valid in model's material array)
     */
    public setMaterial(nodeName: string, materialIndex: number): void {
        this._manager.setInstanceMaterial(this, nodeName, materialIndex);
    }

    /**
     * Resets all material overrides for this instance, reverting to the model's default materials.
     */
    public resetMaterials(): void {
        this._instanceData.materialOverrides.clear();
    }

}
