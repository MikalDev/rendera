import { IGPUResourceManager, IGPUResourceCache, Light, ModelData } from './types';
import type { ShadowMapManager } from './ShadowMapManager';
export declare class GPUResourceManager implements IGPUResourceManager {
    private gl;
    private shaderSystem;
    gpuResourceCache: IGPUResourceCache;
    private uniformCache;
    private static DEBUG_SHADOWS;
    private buffers;
    private textures;
    private vaos;
    private dummyShadowTexture;
    private readonly MAX_LIGHTS;
    lights: Light[];
    private dirtyLightParams;
    private dirtyLightStates;
    private cameraPosition;
    private dirtyCameraPosition;
    private giState;
    private dirtyGIState;
    private specularState;
    private dirtySpecularState;
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
    setGISkyColor(color: [number, number, number]): void;
    setGIGroundColor(color: [number, number, number]): void;
    setGIIntensity(intensity: number): void;
    setLambertWrap(wrap: number): void;
    setSpecularEnabled(enabled: boolean): void;
    setSpecularStrength(strength: number): void;
    setSpecularShininess(shininess: number): void;
    setViewPosition(position: [number, number, number]): void;
    getSpecularEnabled(): boolean;
    getSpecularStrength(): number;
    getSpecularShininess(): number;
    setLightEnabled(index: number, enabled: boolean): void;
    private updateLightUniforms;
    private updateCameraPositionUniforms;
    private updateGIUniforms;
    private updateSpecularUniforms;
    private updateAllLightUniforms;
    private updateLightEnableStates;
    private getLightTypeValue;
    bindShaderAndMaterial(shader: WebGLProgram, materialIndex: number, modelData: ModelData): void;
    setLightDirection(index: number, direction: [number, number, number]): void;
    setLightColor(index: number, color: [number, number, number]): void;
    setLightIntensity(index: number, intensity: number): void;
    setLightSpecularIntensity(index: number, specularIntensity: number): void;
    setSpotLightParams(index: number, angle: number, penumbra: number): void;
    setLightCastShadows(index: number, castShadows: boolean): void;
    private validateShadowCount;
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
    /**
     * Creates a dummy shadow texture for unused shadow map slots.
     */
    private createDummyShadowTexture;
    getShadowMapShader(): WebGLProgram;
    /**
     * Gets the WebGLStateTracker instance if available
     * @returns The WebGLStateTracker instance or undefined
     */
    getWebGLStateTracker(): any;
}
export declare class ShaderSystem {
    private gl;
    private currentProgram;
    private programs;
    constructor(gl: WebGL2RenderingContext);
    createProgram(vertexSource: string, fragmentSource: string, name: string): WebGLProgram;
    private compileProgram;
    private compileShader;
    private createError;
    getProgram(name: string): WebGLProgram;
    dispose(): void;
}
//# sourceMappingURL=GPUResourceManager.d.ts.map