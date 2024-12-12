import { mat4 } from "gl-matrix";

interface SceneNode {
    nodeIndex: number;
    localMatrix: Float32Array;  // 4x4 matrix from glMatrix
    worldMatrix: Float32Array;  // 4x4 matrix from glMatrix
    children: number[];        // indices into nodes array
    parent: number;           // index into nodes array, -1 for root
    mesh?: number;            // optional mesh reference
    skin?: number;            // optional skin reference
}

export class SceneGraph {
    private nodes: SceneNode[] = [];
    private dirtyNodes: Set<number> = new Set();
    
    constructor() {
        // Initialize root node
        this.nodes.push({
            nodeIndex: 0,
            localMatrix: new Float32Array(16),  // Identity matrix
            worldMatrix: new Float32Array(16),  // Identity matrix
            children: [],
            parent: -1        // Root has no parent
        });
    }

    createNode(
        parent: number = 0,
        options?: {
            mesh?: number;
            skin?: number;
        }
    ): number {
        const nodeIndex = this.nodes.length;
        
        const node: SceneNode = {
            nodeIndex,
            localMatrix: new Float32Array(16),  // Identity matrix
            worldMatrix: new Float32Array(16),  // Identity matrix
            children: [],
            parent,
            ...options
        };

        // Add to parent's children
        if (parent >= 0 && parent < this.nodes.length) {
            this.nodes[parent].children.push(nodeIndex);
        }

        this.nodes.push(node);
        this.markDirty(nodeIndex);
        
        return nodeIndex;
    }

    setLocalMatrix(
        nodeIndex: number, 
        matrix: Float32Array
    ): void {
        if (nodeIndex >= 0 && nodeIndex < this.nodes.length) {
            const node = this.nodes[nodeIndex];
            node.localMatrix.set(matrix);
            this.markDirty(nodeIndex);
        }
    }

    getWorldMatrix(nodeIndex: number): Float32Array | null {
        if (nodeIndex >= 0 && nodeIndex < this.nodes.length) {
            return this.nodes[nodeIndex].worldMatrix;
        }
        return null;
    }

    updateWorldMatrices(): void {
        if (this.dirtyNodes.size === 0) return;

        // Start from root and traverse in order
        this.updateNodeWorldMatrix(0, null);
        this.dirtyNodes.clear();
    }

    private updateNodeWorldMatrix(
        nodeIndex: number, 
        parentWorldMatrix: Float32Array | null
    ): void {
        const node = this.nodes[nodeIndex];

        if (parentWorldMatrix) {
            // Multiply parent's world matrix with node's local matrix
            mat4.multiply(
                node.worldMatrix,
                parentWorldMatrix,
                node.localMatrix
            );
        } else {
            // Root node just copies its local matrix
            mat4.copy(node.worldMatrix, node.localMatrix);
        }

        // Recursively update children
        for (const childIndex of node.children) {
            this.updateNodeWorldMatrix(childIndex, node.worldMatrix);
        }
    }

    private markDirty(nodeIndex: number): void {
        // Mark node and all its children as dirty
        this.dirtyNodes.add(nodeIndex);
        
        const node = this.nodes[nodeIndex];
        for (const childIndex of node.children) {
            this.markDirty(childIndex);
        }
    }

    // Query methods
    getNode(nodeIndex: number): SceneNode | null {
        return this.nodes[nodeIndex] || null;
    }

    findNodesByMesh(meshIndex: number): number[] {
        return this.nodes
            .filter(node => node.mesh === meshIndex)
            .map(node => node.nodeIndex);
    }

    findNodesBySkin(skinIndex: number): number[] {
        return this.nodes
            .filter(node => node.skin === skinIndex)
            .map(node => node.nodeIndex);
    }

    // Hierarchy manipulation
    reparentNode(
        nodeIndex: number, 
        newParentIndex: number
    ): boolean {
        if (nodeIndex === newParentIndex ||
            nodeIndex === 0 || // Can't reparent root
            nodeIndex >= this.nodes.length ||
            newParentIndex >= this.nodes.length) {
            return false;
        }

        const node = this.nodes[nodeIndex];
        const oldParent = this.nodes[node.parent];
        const newParent = this.nodes[newParentIndex];

        // Remove from old parent
        oldParent.children = oldParent.children.filter(
            child => child !== nodeIndex
        );

        // Add to new parent
        newParent.children.push(nodeIndex);
        node.parent = newParentIndex;

        // Update transforms
        this.markDirty(nodeIndex);
        return true;
    }

    // Cleanup
    removeNode(nodeIndex: number): void {
        if (nodeIndex === 0) return; // Can't remove root

        const node = this.nodes[nodeIndex];
        if (!node) return;

        // Reparent children to grandparent
        for (const childIndex of node.children) {
            this.reparentNode(childIndex, node.parent);
        }

        // Remove from parent's children
        const parent = this.nodes[node.parent];
        parent.children = parent.children.filter(
            child => child !== nodeIndex
        );

        // Mark slot as available (could be reused)
        this.nodes[nodeIndex] = null!;
        this.dirtyNodes.delete(nodeIndex);
    }
}