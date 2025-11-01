import { mat4, vec3, vec4 } from 'gl-matrix';
import { BoundingSphere } from './types';

export interface FrustumPlane {
    normal: vec3;
    distance: number;
}

export class Frustum {
    public planes: FrustumPlane[] = [];
    
    constructor() {
        // Initialize 6 planes: left, right, bottom, top, near, far
        for (let i = 0; i < 6; i++) {
            this.planes.push({
                normal: [0, 0, 0],
                distance: 0
            });
        }
    }

    /**
     * Extract frustum planes from view-projection matrix using Gribb & Hartmann method
     * Uses a very close near plane for culling
     */
    public extractFromMatrix(viewMatrix: mat4, projectionMatrix: mat4): void {
        // Combine view and projection matrices
        const viewProj = mat4.create();
        mat4.multiply(viewProj, projectionMatrix, viewMatrix);
                
        // Extract planes using Gribb & Hartmann method
        // Left plane: add 4th column to 1st column
        this.planes[0].normal[0] = viewProj[3] + viewProj[0];
        this.planes[0].normal[1] = viewProj[7] + viewProj[4];
        this.planes[0].normal[2] = viewProj[11] + viewProj[8];
        this.planes[0].distance = viewProj[15] + viewProj[12];
        
        // Right plane: subtract 1st column from 4th column  
        this.planes[1].normal[0] = viewProj[3] - viewProj[0];
        this.planes[1].normal[1] = viewProj[7] - viewProj[4];
        this.planes[1].normal[2] = viewProj[11] - viewProj[8];
        this.planes[1].distance = viewProj[15] - viewProj[12];
        
        // Bottom plane: add 4th column to 2nd column
        this.planes[2].normal[0] = viewProj[3] + viewProj[1];
        this.planes[2].normal[1] = viewProj[7] + viewProj[5];
        this.planes[2].normal[2] = viewProj[11] + viewProj[9];
        this.planes[2].distance = viewProj[15] + viewProj[13];
        
        // Top plane: subtract 2nd column from 4th column
        this.planes[3].normal[0] = viewProj[3] - viewProj[1];
        this.planes[3].normal[1] = viewProj[7] - viewProj[5];
        this.planes[3].normal[2] = viewProj[11] - viewProj[9];
        this.planes[3].distance = viewProj[15] - viewProj[13];
        
        // Near plane: add 4th column to 3rd column
        this.planes[4].normal[0] = viewProj[3] + viewProj[2];
        this.planes[4].normal[1] = viewProj[7] + viewProj[6];
        this.planes[4].normal[2] = viewProj[11] + viewProj[10];
        this.planes[4].distance = viewProj[15] + viewProj[14];
        
        // Far plane: subtract 3rd column from 4th column
        this.planes[5].normal[0] = viewProj[3] - viewProj[2];
        this.planes[5].normal[1] = viewProj[7] - viewProj[6];
        this.planes[5].normal[2] = viewProj[11] - viewProj[10];
        this.planes[5].distance = viewProj[15] - viewProj[14];
        
        // Normalize all planes
        for (let i = 0; i < 6; i++) {
            this.normalizePlane(i);
        }
    }

    /**
     * Normalize a frustum plane
     */
    private normalizePlane(index: number): void {
        const plane = this.planes[index];
        const length = Math.sqrt(
            plane.normal[0] * plane.normal[0] +
            plane.normal[1] * plane.normal[1] +
            plane.normal[2] * plane.normal[2]
        );
        
        if (length > 0) {
            plane.normal[0] /= length;
            plane.normal[1] /= length;
            plane.normal[2] /= length;
            plane.distance /= length;
        }
    }

    /**
     * Test if a bounding sphere is inside the frustum
     * Returns true if sphere is visible (inside or intersecting)
     */
    public testSphere(sphere: BoundingSphere, nearPlaneOffset: number = 0.0): boolean {
        for (let i = 0; i < 6; i++) {
            const plane = this.planes[i];
            
            // Calculate distance from sphere center to plane
            const distance = 
                plane.normal[0] * sphere.center[0] +
                plane.normal[1] * sphere.center[1] +
                plane.normal[2] * sphere.center[2] +
                plane.distance;
            
            // If sphere is completely behind any plane, it's outside the frustum
            if (distance + nearPlaneOffset < -sphere.radius) {
                return false;
            }
        }
        
        // Sphere is inside or intersecting the frustum
        return true;
    }

    /**
     * Get distance from sphere center to a specific plane
     */
    public getDistanceToPlane(sphere: BoundingSphere, planeIndex: number): number {
        const plane = this.planes[planeIndex];
        return plane.normal[0] * sphere.center[0] +
               plane.normal[1] * sphere.center[1] +
               plane.normal[2] * sphere.center[2] +
               plane.distance;
    }
}