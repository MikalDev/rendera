import { mat4, vec3 } from 'gl-matrix';
import { BoundingSphere } from './types';
export interface FrustumPlane {
    normal: vec3;
    distance: number;
}
export declare class Frustum {
    planes: FrustumPlane[];
    constructor();
    /**
     * Extract frustum planes from view-projection matrix using Gribb & Hartmann method
     * Uses a very close near plane for culling
     */
    extractFromMatrix(viewMatrix: mat4, projectionMatrix: mat4, nearPlaneDistance?: number): void;
    /**
     * Extract near plane distance from projection matrix
     */
    private extractNearFromProjection;
    /**
     * Extract far plane distance from projection matrix
     */
    private extractFarFromProjection;
    /**
     * Normalize a frustum plane
     */
    private normalizePlane;
    /**
     * Test if a bounding sphere is inside the frustum
     * Returns true if sphere is visible (inside or intersecting)
     */
    testSphere(sphere: BoundingSphere): boolean;
    /**
     * Get distance from sphere center to a specific plane
     */
    getDistanceToPlane(sphere: BoundingSphere, planeIndex: number): number;
}
//# sourceMappingURL=Frustum.d.ts.map