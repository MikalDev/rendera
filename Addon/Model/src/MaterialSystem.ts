import { MaterialData } from './types';
import { ShaderUniformCache } from './ShaderUniformCache';

// MaterialSystem for handling materials and shaders
export class MaterialSystem {
    private gl: WebGL2RenderingContext;
    private materials: Map<number, MaterialData>;
    private currentMaterial: number | null = null;
    private samplerTextureUnitMap: Record<string, number>;
    private uniformCache: ShaderUniformCache;

    // Default textures for missing material properties
    private defaultTextures: Map<string, WebGLTexture> = new Map();

    constructor(
        gl: WebGL2RenderingContext,
        samplerTextureUnitMap: Record<string, number>
    ) {
        this.gl = gl;
        this.materials = new Map<number, MaterialData>();
        this.samplerTextureUnitMap = samplerTextureUnitMap;
        this.uniformCache = new ShaderUniformCache(gl);
        this.createDefaultTextures();
    }

    private createDefaultTextures(): void {
        // Create 1x1 default textures for missing material properties
        const createTexture = (r: number, g: number, b: number, a: number): WebGLTexture => {
            const texture = this.gl.createTexture();
            if (!texture) throw new Error('Failed to create default texture');

            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(
                this.gl.TEXTURE_2D, 0, this.gl.RGBA,
                1, 1, 0,
                this.gl.RGBA, this.gl.UNSIGNED_BYTE,
                new Uint8Array([r, g, b, a])
            );
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

            return texture;
        };

        // White texture for base color (255, 255, 255, 255)
        this.defaultTextures.set('u_BaseColorSampler', createTexture(255, 255, 255, 255));

        // Flat normal map (128, 128, 255) = (0.5, 0.5, 1.0) in normalized space
        this.defaultTextures.set('u_NormalSampler', createTexture(128, 128, 255, 255));

        // Metallic-Roughness: R=unused, G=roughness(max), B=metallic(0), A=255
        // G=255 (max roughness), B=0 (no metallic)
        this.defaultTextures.set('u_MetallicRoughnessSampler', createTexture(0, 255, 0, 255));

        // White for occlusion (no occlusion = 1.0)
        this.defaultTextures.set('u_OcclusionSampler', createTexture(255, 255, 255, 255));

        // Black for emissive (no emission)
        this.defaultTextures.set('u_EmissiveSampler', createTexture(0, 0, 0, 255));
    }

    cleanup(): void {
        this.materials.forEach((material) => {
            material.textures.forEach((texture) => {
                if (texture) this.gl.deleteTexture(texture);
            });
        });
        this.materials.clear();

        // Clean up default textures
        this.defaultTextures.forEach((texture) => {
            this.gl.deleteTexture(texture);
        });
        this.defaultTextures.clear();
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
        // Bind all samplers - either from material or use defaults
        // This prevents texture state from leaking between materials
        for (const [samplerName, textureUnit] of Object.entries(this.samplerTextureUnitMap)) {
            const location = this.uniformCache.getLocation(shader, samplerName);
            if (location === null) continue;

            this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);

            // Get texture from material, or use default if missing
            const materialTexture = material.textures.get(samplerName);
            const textureToUse = materialTexture || this.defaultTextures.get(samplerName);

            if (textureToUse) {
                this.gl.bindTexture(this.gl.TEXTURE_2D, textureToUse);
                this.gl.uniform1i(location, textureUnit);
            } else {
                // No texture and no default - unbind to be safe
                this.gl.bindTexture(this.gl.TEXTURE_2D, null);
            }
        }

        // Set material uniforms
        if (material.uniforms) {
            for (const [name, value] of Object.entries(material.uniforms)) {
                const location = this.uniformCache.getLocation(shader, name);
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