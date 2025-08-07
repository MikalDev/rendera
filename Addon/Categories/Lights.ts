import { Category, Action, Condition, Expression, addParam, Param } from 'jsr:@lost-c3/lib@3.3.5';
// import type { Instance } from '@Instance';
import type { Instance } from '../Instance.ts';

@Category('lightsId', 'Lights')
export default class LightsCategory {
    @Action('setPointLight', 'Set Point Light', 'Set point light at position {0},{1},{2}', 'Set point light', {
        params: [
                addParam('lightNumber', 'Light Number', { type: Param.Number, initialValue: 0 }),
                addParam('x', 'X Position', { type: Param.Number }),
                addParam('y', 'Y Position', { type: Param.Number }),
                addParam('z', 'Z Position', { type: Param.Number }),
                addParam('color', 'Color', { type: Param.Number, initialValue: 0.0 }),
                addParam('intensity', 'Intensity', { type: Param.Number, initialValue: 1.0 }),
                addParam('attenuation', 'Attenuation', { type: Param.Number, initialValue: 0.0 }),
                addParam('castShadow', 'Cast Shadow', { type: Param.Boolean, initialValue: false })
        ]
    })
    setPointLight(this: Instance, lightNumber: number, x: number, y: number, z: number, color: number, intensity: number, attenuation: number, castShadow: boolean) {
        // @ts-ignore
        const r = C3.GetRValue(color);
        // @ts-ignore
        const g = C3.GetGValue(color);
        // @ts-ignore
        const b = C3.GetBValue(color);
        this.gpuResourceManager.updateLight(lightNumber, {
            type: 'point',
            enabled: true,
            position: [x, y, z],
            color: [r, g, b],
            intensity: intensity,
            attenuation: attenuation,
            castShadows: castShadow
        });
    }
    @Action('setSpotLight', 'Set Spot Light', 'Set spot light at position {0},{1},{2}', 'Set spot light', {
        params: [
            addParam('lightNumber', 'Light Number', { type: Param.Number, initialValue: 0 }),
            addParam('x', 'X Position', { type: Param.Number }),
            addParam('y', 'Y Position', { type: Param.Number }),
            addParam('z', 'Z Position', { type: Param.Number }),
            addParam('direction-x', 'Direction X', { type: Param.Number }),
            addParam('direction-y', 'Direction Y', { type: Param.Number }),
            addParam('direction-z', 'Direction Z', { type: Param.Number }),
            addParam('angle', 'Cone angle (degrees)', { type: Param.Number, initialValue: 45.0 }),
            addParam('penumbra', 'Penumbra', { type: Param.Number, initialValue: 0.0 }),
            addParam('color', 'Color', { type: Param.Number, initialValue: 0.0 }),
            addParam('intensity', 'Intensity', { type: Param.Number, initialValue: 1.0 }),
            addParam('attenuation', 'Attenuation', { type: Param.Number, initialValue: 0.0 }),
            addParam('castShadow', 'Cast Shadow', { type: Param.Boolean, initialValue: false })
        ]
    })
    setSpotLight(this: Instance, lightNumber: number, x: number, y: number, z: number, directionX: number, 
        directionY: number, directionZ: number, angle: number, spotPenumbra: number,
        color: number, intensity: number, attenuation: number, castShadow: boolean) {
        // @ts-ignore
        const r = C3.GetRValue(color);
        // @ts-ignore
        const g = C3.GetGValue(color);
        // @ts-ignore
        const b = C3.GetBValue(color);
        this.gpuResourceManager.updateLight(lightNumber, {
            type: 'spot',
            enabled: true,
            position: [x, y, z],
            direction: [directionX, directionY, directionZ],
            cosAngle: Math.cos(angle*Math.PI/180),
            spotPenumbra: spotPenumbra,
            color: [r, g, b],
            intensity: intensity,
            attenuation: attenuation,
            castShadows: castShadow  // Fixed: changed from castShadow to castShadows
        });
    }

    /** @Conditions */
    // @Condition('onCondition', 'On condition', 'On condition')
    // onCondition() {
    //     return false;
    // }

    /** @Expressions */
    //@Expression('expression', 'Expression')
    //Expression() {
    //    return 'Value';
    //}
}
