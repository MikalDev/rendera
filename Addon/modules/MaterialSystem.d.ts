import { MaterialData } from './types';
export declare class MaterialSystem {
    private gl;
    materials: Map<number, MaterialData>;
    private currentMaterial;
    private samplerTextureUnitMap;
    private uniformCache;
    private defaultTextures;
    constructor(gl: WebGL2RenderingContext, samplerTextureUnitMap: Record<string, number>);
    private createDefaultTextures;
    cleanup(): void;
    addMaterial(material: MaterialData): void;
    bindMaterial(materialIndex: number, shader: WebGLProgram): void;
    private applyMaterial;
}
//# sourceMappingURL=MaterialSystem.d.ts.map