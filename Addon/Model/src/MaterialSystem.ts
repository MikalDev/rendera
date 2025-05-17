import { MaterialData } from './types';

// MaterialSystem for handling materials and shaders
export class MaterialSystem {
    private gl: WebGL2RenderingContext;
    private materials: Map<number, MaterialData>;
    private currentMaterial: number | null = null;
    private samplerTextureUnitMap: Record<string, number>;

    constructor(
        gl: WebGL2RenderingContext,
        samplerTextureUnitMap: Record<string, number>
    ) {
        this.gl = gl;
        this.materials = new Map<number, MaterialData>();
        this.samplerTextureUnitMap = samplerTextureUnitMap;
    }

    cleanup(): void {
        this.materials.forEach((material) => {
            material.textures.forEach((texture) => {
                if (texture) this.gl.deleteTexture(texture);
            });
        });
        this.materials.clear();
    }

    addMaterial(material: MaterialData): void {
        this.materials.set(this.materials.size, material);
    }

    bindMaterial(materialIndex: number, shader: WebGLProgram): void {
        // TODO: move this check to GPUResourceManager (needs to check if model && material are the same, not just material index)
        // if (this.currentMaterial === materialIndex) return;

        const material = this.materials.get(materialIndex);
        if (!material) return;

        this.applyMaterial(material, shader);
        this.currentMaterial = materialIndex;
    }

    private applyMaterial(material: MaterialData, shader: WebGLProgram): void {
        // First, unbind all possible texture units that might be used
        for (const unit of Object.values(this.samplerTextureUnitMap)) {
            this.gl.activeTexture(this.gl.TEXTURE0 + unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        }

        // Then bind textures to their fixed texture units based on sampler names
        material.textures.forEach((texture, samplerName) => {
            const textureUnit = this.samplerTextureUnitMap[samplerName];
            if (textureUnit === undefined) {
                console.warn(`No texture unit defined for sampler '${samplerName}'.`);
                return;
            }

            const location = this.gl.getUniformLocation(shader, samplerName);
            const useTextureLoc = this.gl.getUniformLocation(shader, `u_Use${samplerName.slice(2)}`);
            
            if (texture && location !== null) {
                // Texture exists, bind it and enable its use
                this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
                this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                this.gl.uniform1i(location, textureUnit);
                if (useTextureLoc !== null) {
                    this.gl.uniform1i(useTextureLoc, 1);
                }
            } else {
                // No texture, disable its use
                if (useTextureLoc !== null) {
                    this.gl.uniform1i(useTextureLoc, 0);
                }
            }
        });

        // Set material uniforms
        if (material.uniforms) {
            for (const [name, value] of Object.entries(material.uniforms)) {
                const location = this.gl.getUniformLocation(shader, name);
                if (location === null) continue;

                // Handle different uniform types
                if (Array.isArray(value)) {
                    switch (value.length) {
                        case 2:
                            this.gl.uniform2fv(location, value);
                            break;
                        case 3:
                            this.gl.uniform3fv(location, value);
                            break;
                        case 4:
                            this.gl.uniform4fv(location, value);
                            break;
                        case 16:
                            this.gl.uniformMatrix4fv(location, false, value);
                            break;
                        default:
                            console.warn(`Unhandled uniform array length for '${name}': ${value.length}`);
                    }
                } else if (typeof value === 'number') {
                    this.gl.uniform1f(location, value);
                } else if (typeof value === 'boolean') {
                    this.gl.uniform1i(location, value ? 1 : 0);
                } else {
                    console.warn(`Unhandled uniform type for '${name}': ${typeof value}`);
                }
            }
        }
    }
}