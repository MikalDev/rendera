import { mat4, vec3 } from 'gl-matrix';
export declare class ScreenSpaceShadowManager {
    private gl;
    private _depthTexture;
    private _shadowShader;
    private quadVAO;
    private quadBuffer;
    private resolution;
    private debugShadows;
    constructor(gl: WebGL2RenderingContext);
    initialize(): void;
    private createQuad;
    private setupDepthTexture;
    captureDepthBuffer(): void;
    private createShadowShader;
    computeShadows(viewProjection: {
        view: mat4;
        projection: mat4;
    }, lightPosition: vec3): void;
    resize(width: number, height: number): void;
    cleanup(): void;
    get depthTexture(): WebGLTexture | null;
    get shadowShader(): WebGLProgram | null;
    setDebugMode(enabled: boolean): void;
}
//# sourceMappingURL=ScreenSpaceShadowManager.d.ts.map