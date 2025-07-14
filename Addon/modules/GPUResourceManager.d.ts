import { IGPUResourceManager, IGPUResourceCache, Light, ModelData } from './types';
import { mat4 } from 'gl-matrix';
import type { ShadowMapManager } from './ShadowMapManager';
export declare class GPUResourceManager implements IGPUResourceManager {
    private gl;
    private shaderSystem;
    gpuResourceCache: IGPUResourceCache;
    private static DEBUG_SHADOWS;
    private buffers;
    private textures;
    private vaos;
    private readonly MAX_LIGHTS;
    lights: Light[];
    private dirtyLightParams;
    private dirtyLightStates;
    private cameraPosition;
    private dirtyCameraPosition;
    private boneUBO;
    private readonly BONE_UBO_BINDING_POINT;
    constructor(gl: WebGL2RenderingContext);
    createBuffer(data: BufferSource, usage: number): WebGLBuffer;
    createIndexBuffer(data: BufferSource, usage: number): WebGLBuffer;
    createTexture(image: ImageData | HTMLImageElement | ImageBitmap): WebGLTexture;
    deleteBuffer(buffer: WebGLBuffer): void;
    deleteTexture(texture: WebGLTexture): void;
    deleteVertexArray(vao: WebGLVertexArrayObject): void;
    createVertexArray(): WebGLVertexArrayObject;
    private initializeBoneUBO;
    updateBoneUBO(boneMatrices: Float32Array, boneCount: number): void;
    linkUniformBlocks(program: WebGLProgram): void;
    dispose(): void;
    private createError;
    getShader(modelId: string): WebGLProgram;
    setNormalMapEnabled(shader: WebGLProgram, enabled: boolean): void;
    setLightPosition(shader: WebGLProgram, lightPosition: [number, number, number]): void;
    getDefaultShader(): WebGLProgram;
    updateLight(index: number, lightParams: Partial<Light>): void;
    updateCameraPosition(position: [number, number, number]): void;
    setLightEnabled(index: number, enabled: boolean): void;
    private updateLightUniforms;
    private updateCameraPositionUniforms;
    private updateAllLightUniforms;
    private updateLightEnableStates;
    private getLightTypeValue;
    bindShaderAndMaterial(shader: WebGLProgram, materialIndex: number, modelData: ModelData): void;
    setLightDirection(index: number, direction: [number, number, number]): void;
    setLightColor(index: number, color: [number, number, number]): void;
    setLightIntensity(index: number, intensity: number): void;
    setSpotLightParams(index: number, angle: number, penumbra: number): void;
    setLightCastShadows(index: number, castShadows: boolean): void;
    private validateShadowCount;
    /**
     * @deprecated Use setMultipleShadowMapUniforms instead
     */
    setShadowMapUniforms(shader: WebGLProgram, enabled: boolean, shadowMap?: WebGLTexture | null, lightViewProjection?: mat4 | null, bias?: number): void;
    /**
     * Sets uniforms for multiple shadow maps using data from ShadowMapManager.
     * This method replaces setShadowMapUniforms for the new multi-shadow architecture.
     */
    setMultipleShadowMapUniforms(shader: WebGLProgram, shadowMapManager: ShadowMapManager, bias?: number): void;
    /**
     * Enable or disable debug logging for GPU resource operations.
     * @param enabled - Whether to enable debug logging
     */
    static setDebugLogging(enabled: boolean): void;
    getShadowMapShader(): WebGLProgram;
}
export declare class ShaderSystem {
    private gl;
    private currentProgram;
    private programs;
    constructor(gl: WebGL2RenderingContext);
    createProgram(vertexSource: string, fragmentSource: string, name: string): WebGLProgram;
    useProgram(name: string): void;
    private compileProgram;
    private compileShader;
    private createError;
    getProgram(name: string): WebGLProgram;
    dispose(): void;
}
//# sourceMappingURL=GPUResourceManager.d.ts.map