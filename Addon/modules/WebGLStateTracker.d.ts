/**
 * WebGL2 State Tracker - Captures and restores WebGL state
 */
/**
 * Options for selective state capture and restoration
 */
export interface SnapshotOptions {
    /** Skip capturing/restoring texture bindings (performance optimization) */
    skipTextures?: boolean;
    /** Skip capturing/restoring buffer bindings */
    skipBuffers?: boolean;
    /** Skip capturing/restoring pixel store parameters */
    skipPixelStore?: boolean;
}
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
    clearDepth: number;
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
     * @param options Optional flags to skip capturing certain state (for performance)
     */
    snapshot(options?: SnapshotOptions): WebGLState;
    /**
     * Restore WebGL state from a snapshot
     * @param snapshot The state snapshot to restore
     * @param options Optional flags to skip restoring certain state (for performance)
     */
    restore(snapshot: WebGLState, options?: SnapshotOptions): void;
    /**
     * Synchronize tracker state with actual GL state by querying all tracked parameters.
     * Use this when you suspect the tracker is out of sync with reality (e.g., after C3 resize).
     * This is expensive (lots of GL queries) so only call when necessary.
     */
    syncWithGLState(): void;
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