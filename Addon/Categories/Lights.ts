import { Category, Action, Condition, Expression, addParam, Param } from 'jsr:@lost-c3/lib@3.3.3';
// import type { Instance } from '@Instance';
import type { Instance } from '../Instance.ts';

@Category('lightsId', 'Lights')
export default class LightsCategory {
    @Action('setPointLight', 'Set Point Light', 'Set point light at position {0},{1},{2}', 'Set point light...', {
        params: [
                addParam('lightNumber', 'Light Number', { type: Param.Number, initialValue: 0 }),
                addParam('x', 'X Position', { type: Param.Number }),
                addParam('y', 'Y Position', { type: Param.Number }),
                addParam('z', 'Z Position', { type: Param.Number }),
                addParam('color', 'Color', { type: Param.Number, initialValue: 0.0 }),
                addParam('intensity', 'Intensity', { type: Param.Number, initialValue: 1.0 }),
                addParam('attenuation', 'Attenuation', { type: Param.Number, initialValue: 0.0000001 })
        ]
    })
    setPointLight(this: Instance, lightNumber: number, x: number, y: number, z: number, color: number, intensity: number, attenuation: number) {
        const r = C3.GetRValue(color);
        const g = C3.GetGValue(color);
        const b = C3.GetBValue(color);
        this.gpuResourceManager.updateLight(lightNumber, {
            type: 'point',
            enabled: true,
            position: [x, y, z],
            color: [r, g, b],  // Default to white light
            intensity: intensity,
            attenuation: attenuation
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
