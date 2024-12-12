interface SceneNode {
    nodeIndex: number;
    localMatrix: Float32Array;
    worldMatrix: Float32Array;
    children: number[];
    parent: number;
    mesh?: number;
    skin?: number;
}
export declare class SceneGraph {
    private nodes;
    private dirtyNodes;
    constructor();
    createNode(parent?: number, options?: {
        mesh?: number;
        skin?: number;
    }): number;
    setLocalMatrix(nodeIndex: number, matrix: Float32Array): void;
    getWorldMatrix(nodeIndex: number): Float32Array | null;
    updateWorldMatrices(): void;
    private updateNodeWorldMatrix;
    private markDirty;
    getNode(nodeIndex: number): SceneNode | null;
    findNodesByMesh(meshIndex: number): number[];
    findNodesBySkin(skinIndex: number): number[];
    reparentNode(nodeIndex: number, newParentIndex: number): boolean;
    removeNode(nodeIndex: number): void;
}
export {};
//# sourceMappingURL=SceneGraph.d.ts.map