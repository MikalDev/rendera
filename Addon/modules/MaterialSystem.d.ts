import { MaterialData } from './types';
export declare class MaterialSystem {
    private gl;
    private materials;
    private currentMaterial;
    private samplerTextureUnitMap;
    constructor(gl: WebGL2RenderingContext, samplerTextureUnitMap: Record<string, number>);
    cleanup(): void;
    addMaterial(material: MaterialData): void;
    bindMaterial(materialIndex: number, shader: WebGLProgram): void;
    private applyMaterial;
}
//# sourceMappingURL=MaterialSystem.d.ts.map