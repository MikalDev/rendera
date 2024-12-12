import { IGPUResourceManager, IGPUResourceCache, Light, ModelData } from './types';
export declare class GPUResourceManager implements IGPUResourceManager {
    private gl;
    private shaderSystem;
    gpuResourceCache: IGPUResourceCache;
    private buffers;
    private textures;
    private vaos;
    private readonly MAX_LIGHTS;
    private lights;
    private dirtyLightParams;
    private dirtyLightStates;
    private cameraPosition;
    private dirtyCameraPosition;
    constructor(gl: WebGL2RenderingContext);
    createBuffer(data: BufferSource, usage: number): WebGLBuffer;
    createIndexBuffer(data: BufferSource, usage: number): WebGLBuffer;
    createTexture(image: ImageData | HTMLImageElement): WebGLTexture;
    deleteBuffer(buffer: WebGLBuffer): void;
    deleteTexture(texture: WebGLTexture): void;
    deleteVertexArray(vao: WebGLVertexArrayObject): void;
    createVertexArray(): WebGLVertexArrayObject;
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