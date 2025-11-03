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
                addParam('castShadow', 'Cast Shadow', { type: Param.Boolean, initialValue: false }),
                addParam('specularIntensity', 'Specular Intensity', { type: Param.Number, initialValue: 1.0, desc: 'Per-light specular multiplier (0-2)' })
        ]
    })
    setPointLight(this: Instance, lightNumber: number, x: number, y: number, z: number, color: number, intensity: number, attenuation: number, castShadow: boolean, specularIntensity: number) {
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
            castShadows: castShadow,
            specularIntensity: specularIntensity
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
            addParam('castShadow', 'Cast Shadow', { type: Param.Boolean, initialValue: false }),
            addParam('specularIntensity', 'Specular Intensity', { type: Param.Number, initialValue: 1.0, desc: 'Per-light specular multiplier (0-2)' })
        ]
    })
    setSpotLight(this: Instance, lightNumber: number, x: number, y: number, z: number, directionX: number,
        directionY: number, directionZ: number, angle: number, spotPenumbra: number,
        color: number, intensity: number, attenuation: number, castShadow: boolean, specularIntensity: number) {
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
            castShadows: castShadow,  // Fixed: changed from castShadow to castShadows
            specularIntensity: specularIntensity
        });
    }

    @Action('setShadowMapResolution', 'Set Shadow Map Resolution', 'Set shadow map resolution to {0}', 'Set shadow map resolution', {
        params: [
            addParam('resolution', 'Resolution (128-4096, power of 2)', { type: Param.Number, initialValue: 1024 })
        ]
    })
    setShadowMapResolution(this: Instance, resolution: number) {
        // Clamp to valid power of 2 values
        const validResolutions = [128, 256, 512, 1024, 2048, 4096];
        const closestResolution = validResolutions.reduce((prev, curr) => 
            Math.abs(curr - resolution) < Math.abs(prev - resolution) ? curr : prev
        );
        
        if (this.shadowMapManager) {
            this.shadowMapManager.setResolution(closestResolution);
        }
    }

    @Action('setGISkyColor', 'Set GI Sky Color', 'Set global illumination sky color to {0}', 'Set the color of light coming from above (sky hemisphere)', {
        params: [
            addParam('color', 'Sky Color', { type: Param.Number, desc: 'RGB color for light from above' })
        ]
    })
    setGISkyColor(this: Instance, color: number) {
        // @ts-ignore
        const r = C3.GetRValue(color);
        // @ts-ignore
        const g = C3.GetGValue(color);
        // @ts-ignore
        const b = C3.GetBValue(color);
        // C3 returns values 0-1, so we use them directly
        this.gpuResourceManager.setGISkyColor([r, g, b]);
    }

    @Action('setGIGroundColor', 'Set GI Ground Color', 'Set global illumination ground color to {0}', 'Set the color of light bouncing from below (ground hemisphere)', {
        params: [
            addParam('color', 'Ground Color', { type: Param.Number, desc: 'RGB color for light from below' })
        ]
    })
    setGIGroundColor(this: Instance, color: number) {
        // @ts-ignore
        const r = C3.GetRValue(color);
        // @ts-ignore
        const g = C3.GetGValue(color);
        // @ts-ignore
        const b = C3.GetBValue(color);
        // C3 returns values 0-1, so we use them directly
        this.gpuResourceManager.setGIGroundColor([r, g, b]);
    }

    @Action('setGIIntensity', 'Set GI Intensity', 'Set global illumination intensity to {0}', 'Set the intensity of global illumination (0-1)', {
        params: [
            addParam('intensity', 'GI Intensity', { type: Param.Number, initialValue: 0.2, desc: 'Global illumination contribution (0 = off, 1 = full)' })
        ]
    })
    setGIIntensity(this: Instance, intensity: number) {
        this.gpuResourceManager.setGIIntensity(intensity);
    }

    @Action('setLambertWrap', 'Set Lambert Wrap', 'Set Lambert wrap to {0}', 'Set the Lambert wrap factor for softer shadows (0-1)', {
        params: [
            addParam('wrap', 'Lambert Wrap', { type: Param.Number, initialValue: 0.1, desc: 'Shadow softness factor (0 = hard shadows, 1 = very soft)' })
        ]
    })
    setLambertWrap(this: Instance, wrap: number) {
        this.gpuResourceManager.setLambertWrap(wrap);
    }

    // Specular lighting actions
    @Action('setSpecularEnabled', 'Enable Specular', 'Set specular lighting {0}', 'Enable or disable specular highlights', {
        params: [
            addParam('enabled', 'Enabled', { type: Param.Combo, items: ['Disabled', 'Enabled'], initialValue: 'Enabled' })
        ]
    })
    setSpecularEnabled(this: Instance, enabled: number) {
        this.gpuResourceManager.setSpecularEnabled(enabled === 1);
    }

    @Action('setSpecularStrength', 'Set Specular Strength', 'Set specular strength to {0}', 'Control the intensity of specular highlights (0-2)', {
        params: [
            addParam('strength', 'Strength', { type: Param.Number, initialValue: 1.0, desc: '0=none, 1=normal, 2=intense' })
        ]
    })
    setSpecularStrength(this: Instance, strength: number) {
        this.gpuResourceManager.setSpecularStrength(strength);
    }

    @Action('setSpecularShininess', 'Set Specular Shininess', 'Set specular shininess to {0}', 'Control the size/focus of specular highlights (0-2)', {
        params: [
            addParam('shininess', 'Shininess', { type: Param.Number, initialValue: 1.0, desc: '0=rough/broad, 2=shiny/tight' })
        ]
    })
    setSpecularShininess(this: Instance, shininess: number) {
        this.gpuResourceManager.setSpecularShininess(shininess);
    }

    @Action('setLightSpecularIntensity', 'Set Light Specular Intensity', 'Set light {0} specular intensity to {1}', 'Set per-light specular multiplier', {
        params: [
            addParam('lightNumber', 'Light Number', { type: Param.Number, initialValue: 0 }),
            addParam('specularIntensity', 'Specular Intensity', { type: Param.Number, initialValue: 1.0, desc: 'Per-light specular multiplier (0-2)' })
        ]
    })
    setLightSpecularIntensity(this: Instance, lightNumber: number, specularIntensity: number) {
        this.gpuResourceManager.setLightSpecularIntensity(lightNumber, specularIntensity);
    }

    /** @Conditions */
    // @Condition('onCondition', 'On condition', 'On condition')
    // onCondition() {
    //     return false;
    // }

    /** @Expressions */
    @Expression('shadowMapResolution', 'Shadow Map Resolution')
    shadowMapResolution(this: Instance) {
        return this.shadowMapManager ? this.shadowMapManager.getResolution() : 1024;
    }

    @Expression('specularEnabled', 'Specular Enabled', 'Get whether specular lighting is enabled (0 or 1)')
    specularEnabled(this: Instance) {
        return this.gpuResourceManager.getSpecularEnabled() ? 1 : 0;
    }

    @Expression('specularStrength', 'Specular Strength', 'Get the current specular strength')
    specularStrength(this: Instance) {
        return this.gpuResourceManager.getSpecularStrength();
    }

    @Expression('specularShininess', 'Specular Shininess', 'Get the current specular shininess')
    specularShininess(this: Instance) {
        return this.gpuResourceManager.getSpecularShininess();
    }
}
