import { Category, Action, Condition, Expression, addParam, Param } from 'jsr:@lost-c3/lib@3.3.5';
import type { Instance } from '../Instance.ts';

@Category('cameraId', 'Camera')
export default class CameraCategory {
    @Action('setCullingNearPlaneOffset', 'Set Culling Near Plane Offset', 'Set frustum culling near plane offset to {0}', 'Frustum Culling', {
        params: [
            addParam('offset', 'Offset', { type: Param.Number, initialValue: 0.01 })
        ]
    })
    setCullingNearPlaneOffset(this: Instance, offset: number) {
        // This controls how close the frustum culling near plane is relative to the camera
        // Smaller values = more aggressive culling (objects closer to camera may disappear)
        // Larger values = less aggressive culling (safer but less optimization)
        // @ts-ignore
        this.frustumCullingNearOffset = offset;
    }

    @Expression('getCullingNearPlaneOffset', 'Culling Near Offset', 'Get the frustum culling near plane offset')
    getCullingNearPlaneOffset(this: Instance): number {
        // @ts-ignore
        return this.frustumCullingNearOffset ?? 0.0;
    }
}