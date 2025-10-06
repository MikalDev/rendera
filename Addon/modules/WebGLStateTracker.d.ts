/**
 * WebGL2 State Tracker - Captures and restores WebGL state
 */
export interface WebGLState {
    activeTexture: number;
    textureBindings: Map<number, Record<number, WebGLTexture | null>>;
    boundFramebuffer: WebGLFramebuffer | null;
    boundReadFramebuffer: WebGLFramebuffer | null;
    boundDrawFramebuffer: WebGLFramebuffer | null;
    boundArrayBuffer: WebGLBuffer | null;
    boundElementArrayBuffer: WebGLBuffer | null;
    boundUniformBuffer: WebGLBuffer | null;
    boundTransformFeedbackBuffer: WebGLBuffer | null;
    uniformBufferBindings: Map<number, WebGLBuffer | null>;
    boundVertexArray: WebGLVertexArrayObject | null;
    currentProgram: WebGLProgram | null;
    viewport: number[];
    scissorBox: number[];
    capabilities: Map<number, boolean>;
    blendSrcRGB: number;
    blendDstRGB: number;
    blendSrcAlpha: number;
    blendDstAlpha: number;
    blendEquationRGB: number;
    blendEquationAlpha: number;
    blendColor: number[];
    depthFunc: number;
    depthMask: boolean;
    depthRange: number[];
    stencilFunc: number;
    stencilRef: number;
    stencilMask: number;
    stencilFail: number;
    stencilZFail: number;
    stencilZPass: number;
    colorMask: boolean[];
    clearColor: number[];
    cullFaceMode: number;
    frontFace: number;
    polygonOffsetFactor: number;
    polygonOffsetUnits: number;
    pixelStorei: Map<number, number | boolean>;
}
export declare class WebGLStateTracker {
    private gl;
    private state;
    private original;
    private static instance;
    constructor(gl: WebGL2RenderingContext);
    /**
     * Initialize or get the singleton instance
     */
    static initialize(gl: WebGL2RenderingContext): WebGLStateTracker;
    /**
     * Get the current instance
     */
    static getInstance(): WebGLStateTracker | null;
    /**
     * Apply monkeypatch to WebGL context
     */
    private applyMonkeypatch;
    /**
     * Verify that monkeypatch was applied successfully
     */
    verifyMonkeypatch(): {
        success: boolean;
        patchedMethods: string[];
        unpatchedMethods: string[];
        totalMethods: number;
    };
    /**
     * Take a snapshot of the current WebGL state
     */
    snapshot(): WebGLState;
    /**
     * Restore WebGL state from a snapshot
     */
    restore(snapshot: WebGLState): void;
    /**
     * Get the current state
     */
    getState(): WebGLState;
    /**
     * Get original WebGL methods
     */
    getOriginalMethods(): Record<string, Function>;
    /**
     * Convert snapshot to loggable format
     */
    snapshotToLoggable(snapshot: WebGLState): any;
}
//# sourceMappingURL=WebGLStateTracker.d.ts.map