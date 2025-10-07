/**
 * WebGL2 State Tracker - Captures and restores WebGL state
 */

export interface WebGLState {
    // Texture state
    activeTexture: number;
    textureBindings: Map<number, Record<number, WebGLTexture | null>>;

    // Framebuffer state
    boundFramebuffer: WebGLFramebuffer | null;
    boundReadFramebuffer: WebGLFramebuffer | null;
    boundDrawFramebuffer: WebGLFramebuffer | null;

    // Buffer state
    boundArrayBuffer: WebGLBuffer | null;
    boundElementArrayBuffer: WebGLBuffer | null;
    boundUniformBuffer: WebGLBuffer | null;
    boundTransformFeedbackBuffer: WebGLBuffer | null;

    // Uniform buffer base bindings (indexed bindings)
    uniformBufferBindings: Map<number, WebGLBuffer | null>;

    // VAO state
    boundVertexArray: WebGLVertexArrayObject | null;

    // Program state
    currentProgram: WebGLProgram | null;

    // Viewport and scissor
    viewport: number[];
    scissorBox: number[];

    // Enable/disable state
    capabilities: Map<number, boolean>;

    // Blend state
    blendSrcRGB: number;
    blendDstRGB: number;
    blendSrcAlpha: number;
    blendDstAlpha: number;
    blendEquationRGB: number;
    blendEquationAlpha: number;
    blendColor: number[];

    // Depth state
    depthFunc: number;
    depthMask: boolean;
    depthRange: number[];

    // Stencil state
    stencilFunc: number;
    stencilRef: number;
    stencilMask: number;
    stencilFail: number;
    stencilZFail: number;
    stencilZPass: number;

    // Color state
    colorMask: boolean[];
    clearColor: number[];

    // Clear values
    clearDepth: number;

    // Culling
    cullFaceMode: number;
    frontFace: number;

    // Polygon offset
    polygonOffsetFactor: number;
    polygonOffsetUnits: number;

    // Pixel store parameters
    pixelStorei: Map<number, number | boolean>;
}

export class WebGLStateTracker {
    private gl: WebGL2RenderingContext;
    private state: WebGLState;
    private original: Record<string, Function>;
    private static instance: WebGLStateTracker | null = null;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;

        // Initialize state
        this.state = {
            activeTexture: gl.TEXTURE0,
            textureBindings: new Map(),
            boundFramebuffer: null,
            boundReadFramebuffer: null,
            boundDrawFramebuffer: null,
            boundArrayBuffer: null,
            boundElementArrayBuffer: null,
            boundUniformBuffer: null,
            boundTransformFeedbackBuffer: null,
            uniformBufferBindings: new Map(),
            boundVertexArray: null,
            currentProgram: null,
            viewport: [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight],
            scissorBox: [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight],
            capabilities: new Map([
                [gl.BLEND, false],
                [gl.CULL_FACE, false],
                [gl.DEPTH_TEST, false],
                [gl.DITHER, true],
                [gl.POLYGON_OFFSET_FILL, false],
                [gl.SAMPLE_ALPHA_TO_COVERAGE, false],
                [gl.SAMPLE_COVERAGE, false],
                [gl.SCISSOR_TEST, false],
                [gl.STENCIL_TEST, false],
            ]),
            blendSrcRGB: gl.ONE,
            blendDstRGB: gl.ZERO,
            blendSrcAlpha: gl.ONE,
            blendDstAlpha: gl.ZERO,
            blendEquationRGB: gl.FUNC_ADD,
            blendEquationAlpha: gl.FUNC_ADD,
            blendColor: [0, 0, 0, 0],
            depthFunc: gl.LESS,
            depthMask: true,
            depthRange: [0, 1],
            stencilFunc: gl.ALWAYS,
            stencilRef: 0,
            stencilMask: 0xFFFFFFFF,
            stencilFail: gl.KEEP,
            stencilZFail: gl.KEEP,
            stencilZPass: gl.KEEP,
            colorMask: [true, true, true, true],
            clearColor: [0, 0, 0, 0],
            clearDepth: 1,
            cullFaceMode: gl.BACK,
            frontFace: gl.CCW,
            polygonOffsetFactor: 0,
            polygonOffsetUnits: 0,
            pixelStorei: new Map([
                [gl.UNPACK_ALIGNMENT, 4],
                [gl.UNPACK_FLIP_Y_WEBGL, false],
                [gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false],
                [gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL],
            ]),
        };

        // Store original methods
        this.original = {
            activeTexture: gl.activeTexture.bind(gl),
            bindTexture: gl.bindTexture.bind(gl),
            bindFramebuffer: gl.bindFramebuffer.bind(gl),
            bindBuffer: gl.bindBuffer.bind(gl),
            bindBufferBase: gl.bindBufferBase.bind(gl),
            bindVertexArray: gl.bindVertexArray.bind(gl),
            useProgram: gl.useProgram.bind(gl),
            viewport: gl.viewport.bind(gl),
            scissor: gl.scissor.bind(gl),
            enable: gl.enable.bind(gl),
            disable: gl.disable.bind(gl),
            blendFunc: gl.blendFunc.bind(gl),
            blendFuncSeparate: gl.blendFuncSeparate.bind(gl),
            blendEquation: gl.blendEquation.bind(gl),
            blendEquationSeparate: gl.blendEquationSeparate.bind(gl),
            blendColor: gl.blendColor.bind(gl),
            depthFunc: gl.depthFunc.bind(gl),
            depthMask: gl.depthMask.bind(gl),
            depthRange: gl.depthRange.bind(gl),
            stencilFunc: gl.stencilFunc.bind(gl),
            stencilMask: gl.stencilMask.bind(gl),
            stencilOp: gl.stencilOp.bind(gl),
            colorMask: gl.colorMask.bind(gl),
            clearColor: gl.clearColor.bind(gl),
            clearDepth: gl.clearDepth.bind(gl),
            cullFace: gl.cullFace.bind(gl),
            frontFace: gl.frontFace.bind(gl),
            polygonOffset: gl.polygonOffset.bind(gl),
            pixelStorei: gl.pixelStorei.bind(gl),
        };

        this.applyMonkeypatch();
    }

    /**
     * Initialize or get the singleton instance
     */
    public static initialize(gl: WebGL2RenderingContext): WebGLStateTracker {
        if (!WebGLStateTracker.instance) {
            WebGLStateTracker.instance = new WebGLStateTracker(gl);
        }
        return WebGLStateTracker.instance;
    }

    /**
     * Get the current instance
     */
    public static getInstance(): WebGLStateTracker | null {
        return WebGLStateTracker.instance;
    }

    /**
     * Apply monkeypatch to WebGL context
     */
    private applyMonkeypatch(): void {
        const gl = this.gl;
        const state = this.state;
        const original = this.original;

        // Monkeypatch methods
        (gl as any).activeTexture = (texture: number) => {
            state.activeTexture = texture;
            return original.activeTexture(texture);
        };

        (gl as any).bindTexture = (target: number, texture: WebGLTexture | null) => {
            const unit = state.activeTexture - gl.TEXTURE0;
            if (!state.textureBindings.has(unit)) {
                state.textureBindings.set(unit, {});
            }
            state.textureBindings.get(unit)![target] = texture;
            return original.bindTexture(target, texture);
        };

        (gl as any).bindFramebuffer = (target: number, framebuffer: WebGLFramebuffer | null) => {
            if (target === gl.FRAMEBUFFER) {
                state.boundFramebuffer = framebuffer;
                state.boundReadFramebuffer = framebuffer;
                state.boundDrawFramebuffer = framebuffer;
            } else if (target === gl.READ_FRAMEBUFFER) {
                state.boundReadFramebuffer = framebuffer;
            } else if (target === gl.DRAW_FRAMEBUFFER) {
                state.boundDrawFramebuffer = framebuffer;
            }
            return original.bindFramebuffer(target, framebuffer);
        };

        (gl as any).bindBuffer = (target: number, buffer: WebGLBuffer | null) => {
            if (target === gl.ARRAY_BUFFER) {
                state.boundArrayBuffer = buffer;
            } else if (target === gl.ELEMENT_ARRAY_BUFFER) {
                state.boundElementArrayBuffer = buffer;
            } else if (target === gl.UNIFORM_BUFFER) {
                state.boundUniformBuffer = buffer;
            } else if (target === gl.TRANSFORM_FEEDBACK_BUFFER) {
                state.boundTransformFeedbackBuffer = buffer;
            }
            return original.bindBuffer(target, buffer);
        };

        (gl as any).bindBufferBase = (target: number, index: number, buffer: WebGLBuffer | null) => {
            if (target === gl.UNIFORM_BUFFER) {
                state.uniformBufferBindings.set(index, buffer);
            }
            return original.bindBufferBase(target, index, buffer);
        };

        (gl as any).bindVertexArray = (vao: WebGLVertexArrayObject | null) => {
            state.boundVertexArray = vao;
            return original.bindVertexArray(vao);
        };

        (gl as any).useProgram = (program: WebGLProgram | null) => {
            state.currentProgram = program;
            return original.useProgram(program);
        };

        (gl as any).viewport = (x: number, y: number, width: number, height: number) => {
            state.viewport = [x, y, width, height];
            return original.viewport(x, y, width, height);
        };

        (gl as any).scissor = (x: number, y: number, width: number, height: number) => {
            state.scissorBox = [x, y, width, height];
            return original.scissor(x, y, width, height);
        };

        (gl as any).enable = (cap: number) => {
            state.capabilities.set(cap, true);
            return original.enable(cap);
        };

        (gl as any).disable = (cap: number) => {
            state.capabilities.set(cap, false);
            return original.disable(cap);
        };

        (gl as any).blendFunc = (sfactor: number, dfactor: number) => {
            state.blendSrcRGB = sfactor;
            state.blendDstRGB = dfactor;
            state.blendSrcAlpha = sfactor;
            state.blendDstAlpha = dfactor;
            return original.blendFunc(sfactor, dfactor);
        };

        (gl as any).blendFuncSeparate = (srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number) => {
            state.blendSrcRGB = srcRGB;
            state.blendDstRGB = dstRGB;
            state.blendSrcAlpha = srcAlpha;
            state.blendDstAlpha = dstAlpha;
            return original.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha);
        };

        (gl as any).blendEquation = (mode: number) => {
            state.blendEquationRGB = mode;
            state.blendEquationAlpha = mode;
            return original.blendEquation(mode);
        };

        (gl as any).blendEquationSeparate = (modeRGB: number, modeAlpha: number) => {
            state.blendEquationRGB = modeRGB;
            state.blendEquationAlpha = modeAlpha;
            return original.blendEquationSeparate(modeRGB, modeAlpha);
        };

        (gl as any).blendColor = (r: number, g: number, b: number, a: number) => {
            state.blendColor = [r, g, b, a];
            return original.blendColor(r, g, b, a);
        };

        (gl as any).depthFunc = (func: number) => {
            state.depthFunc = func;
            return original.depthFunc(func);
        };

        (gl as any).depthMask = (flag: boolean) => {
            state.depthMask = flag;
            return original.depthMask(flag);
        };

        (gl as any).depthRange = (zNear: number, zFar: number) => {
            state.depthRange = [zNear, zFar];
            return original.depthRange(zNear, zFar);
        };

        (gl as any).stencilFunc = (func: number, ref: number, mask: number) => {
            state.stencilFunc = func;
            state.stencilRef = ref;
            state.stencilMask = mask;
            return original.stencilFunc(func, ref, mask);
        };

        (gl as any).stencilMask = (mask: number) => {
            state.stencilMask = mask;
            return original.stencilMask(mask);
        };

        (gl as any).stencilOp = (fail: number, zfail: number, zpass: number) => {
            state.stencilFail = fail;
            state.stencilZFail = zfail;
            state.stencilZPass = zpass;
            return original.stencilOp(fail, zfail, zpass);
        };

        (gl as any).colorMask = (r: boolean, g: boolean, b: boolean, a: boolean) => {
            state.colorMask = [r, g, b, a];
            return original.colorMask(r, g, b, a);
        };

        (gl as any).clearColor = (r: number, g: number, b: number, a: number) => {
            state.clearColor = [r, g, b, a];
            return original.clearColor(r, g, b, a);
        };

        (gl as any).clearDepth = (depth: number) => {
            state.clearDepth = depth;
            return original.clearDepth(depth);
        };

        (gl as any).cullFace = (mode: number) => {
            state.cullFaceMode = mode;
            return original.cullFace(mode);
        };

        (gl as any).frontFace = (mode: number) => {
            state.frontFace = mode;
            return original.frontFace(mode);
        };

        (gl as any).polygonOffset = (factor: number, units: number) => {
            state.polygonOffsetFactor = factor;
            state.polygonOffsetUnits = units;
            return original.polygonOffset(factor, units);
        };

        (gl as any).pixelStorei = (pname: number, param: number | boolean) => {
            state.pixelStorei.set(pname, param);
            return original.pixelStorei(pname, param);
        };

        console.log("[rendera] WebGL state tracker monkeypatch applied successfully");
        console.log("[rendera] Patched methods:", Object.keys(original));

        const verification = this.verifyMonkeypatch();
        const status = verification.success ? "SUCCESS" : "FAILED";
        console.log(`[rendera] Monkeypatch verification: ${status}`, verification);
    }

    /**
     * Verify that monkeypatch was applied successfully
     */
    public verifyMonkeypatch(): { success: boolean; patchedMethods: string[]; unpatchedMethods: string[]; totalMethods: number } {
        const patchedMethods: string[] = [];
        const unpatchedMethods: string[] = [];

        for (const [methodName, originalMethod] of Object.entries(this.original)) {
            if ((this.gl as any)[methodName] !== originalMethod) {
                patchedMethods.push(methodName);
            } else {
                unpatchedMethods.push(methodName);
            }
        }

        return {
            success: unpatchedMethods.length === 0,
            patchedMethods,
            unpatchedMethods,
            totalMethods: Object.keys(this.original).length
        };
    }

    /**
     * Take a snapshot of the current WebGL state
     */
    public snapshot(): WebGLState {
        // Deep copy texture bindings
        const textureBindingsCopy = new Map<number, Record<number, WebGLTexture | null>>();
        for (const [unit, bindings] of this.state.textureBindings.entries()) {
            textureBindingsCopy.set(unit, { ...bindings });
        }

        return {
            activeTexture: this.state.activeTexture,
            textureBindings: textureBindingsCopy,
            boundFramebuffer: this.state.boundFramebuffer,
            boundReadFramebuffer: this.state.boundReadFramebuffer,
            boundDrawFramebuffer: this.state.boundDrawFramebuffer,
            boundArrayBuffer: this.state.boundArrayBuffer,
            boundElementArrayBuffer: this.state.boundElementArrayBuffer,
            boundUniformBuffer: this.state.boundUniformBuffer,
            boundTransformFeedbackBuffer: this.state.boundTransformFeedbackBuffer,
            uniformBufferBindings: new Map(this.state.uniformBufferBindings),
            boundVertexArray: this.state.boundVertexArray,
            currentProgram: this.state.currentProgram,
            viewport: [...this.state.viewport],
            scissorBox: [...this.state.scissorBox],
            capabilities: new Map(this.state.capabilities),
            blendSrcRGB: this.state.blendSrcRGB,
            blendDstRGB: this.state.blendDstRGB,
            blendSrcAlpha: this.state.blendSrcAlpha,
            blendDstAlpha: this.state.blendDstAlpha,
            blendEquationRGB: this.state.blendEquationRGB,
            blendEquationAlpha: this.state.blendEquationAlpha,
            blendColor: [...this.state.blendColor],
            depthFunc: this.state.depthFunc,
            depthMask: this.state.depthMask,
            depthRange: [...this.state.depthRange],
            stencilFunc: this.state.stencilFunc,
            stencilRef: this.state.stencilRef,
            stencilMask: this.state.stencilMask,
            stencilFail: this.state.stencilFail,
            stencilZFail: this.state.stencilZFail,
            stencilZPass: this.state.stencilZPass,
            colorMask: [...this.state.colorMask],
            clearColor: [...this.state.clearColor],
            clearDepth: this.state.clearDepth,
            cullFaceMode: this.state.cullFaceMode,
            frontFace: this.state.frontFace,
            polygonOffsetFactor: this.state.polygonOffsetFactor,
            polygonOffsetUnits: this.state.polygonOffsetUnits,
            pixelStorei: new Map(this.state.pixelStorei),
        };
    }

    /**
     * Restore WebGL state from a snapshot
     * @param snapshot The state snapshot to restore
     */
    public restore(snapshot: WebGLState): void {
        const gl = this.gl;
        const original = this.original;

        // Restore textures without validation - trust that textures are valid
        original.activeTexture(snapshot.activeTexture);
        for (const [unit, bindings] of snapshot.textureBindings.entries()) {
            original.activeTexture(gl.TEXTURE0 + unit);
            for (const [target, texture] of Object.entries(bindings)) {
                original.bindTexture(Number(target), texture || null);
            }
        }
        original.activeTexture(snapshot.activeTexture);

        // Restore framebuffers without validation - trust that framebuffers are valid
        original.bindFramebuffer(gl.FRAMEBUFFER, snapshot.boundFramebuffer || null);

        if (snapshot.boundReadFramebuffer !== snapshot.boundFramebuffer) {
            original.bindFramebuffer(gl.READ_FRAMEBUFFER, snapshot.boundReadFramebuffer || null);
        }

        if (snapshot.boundDrawFramebuffer !== snapshot.boundFramebuffer) {
            original.bindFramebuffer(gl.DRAW_FRAMEBUFFER, snapshot.boundDrawFramebuffer || null);
        }

        // IMPORTANT: Restore VAO first, before element array buffer
        // VAOs capture the ELEMENT_ARRAY_BUFFER binding when they are bound,
        // so we must restore the VAO before restoring the element buffer
        // Restore without validation - trust that VAOs are valid
        original.bindVertexArray(snapshot.boundVertexArray || null);

        // Restore buffers without validation - trust that buffers are valid
        // This avoids expensive gl.isBuffer calls
        original.bindBuffer(gl.ARRAY_BUFFER, snapshot.boundArrayBuffer || null);
        original.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, snapshot.boundElementArrayBuffer || null);
        if (snapshot.boundUniformBuffer !== undefined) {
            original.bindBuffer(gl.UNIFORM_BUFFER, snapshot.boundUniformBuffer);
        }
        if (snapshot.boundTransformFeedbackBuffer !== undefined) {
            original.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, snapshot.boundTransformFeedbackBuffer);
        }

        // Restore uniform buffer base bindings
        if (snapshot.uniformBufferBindings) {
            for (const [index, buffer] of snapshot.uniformBufferBindings.entries()) {
                original.bindBufferBase(gl.UNIFORM_BUFFER, index, buffer);
            }
        }

        // Restore program without validation - trust that programs are valid
        original.useProgram(snapshot.currentProgram || null);

        // Restore viewport and scissor
        original.viewport(...snapshot.viewport);
        original.scissor(...snapshot.scissorBox);

        // Restore capabilities
        for (const [cap, enabled] of snapshot.capabilities.entries()) {
            if (enabled) {
                original.enable(cap);
            } else {
                original.disable(cap);
            }
        }

        // Restore blend state
        original.blendFuncSeparate(
            snapshot.blendSrcRGB,
            snapshot.blendDstRGB,
            snapshot.blendSrcAlpha,
            snapshot.blendDstAlpha
        );
        original.blendEquationSeparate(
            snapshot.blendEquationRGB,
            snapshot.blendEquationAlpha
        );
        original.blendColor(...snapshot.blendColor);

        // Restore depth state
        original.depthFunc(snapshot.depthFunc);
        original.depthMask(snapshot.depthMask);
        original.depthRange(...snapshot.depthRange);

        // Restore stencil state
        original.stencilFunc(snapshot.stencilFunc, snapshot.stencilRef, snapshot.stencilMask);
        original.stencilOp(snapshot.stencilFail, snapshot.stencilZFail, snapshot.stencilZPass);

        // Restore color state
        original.colorMask(...snapshot.colorMask);
        original.clearColor(...snapshot.clearColor);
        if (snapshot.clearDepth !== undefined) {
            original.clearDepth(snapshot.clearDepth);
        }

        // Restore culling
        original.cullFace(snapshot.cullFaceMode);
        original.frontFace(snapshot.frontFace);

        // Restore polygon offset
        original.polygonOffset(snapshot.polygonOffsetFactor, snapshot.polygonOffsetUnits);

        // Restore pixel store parameters
        if (snapshot.pixelStorei) {
            for (const [pname, value] of snapshot.pixelStorei.entries()) {
                original.pixelStorei(pname, value as any);
            }
        }

        // Update internal state
        this.state = this.snapshot(); // Re-snapshot to update internal state
    }

    /**
     * Get the current state
     */
    public getState(): WebGLState {
        return this.state;
    }

    /**
     * Get original WebGL methods
     */
    public getOriginalMethods(): Record<string, Function> {
        return this.original;
    }

    /**
     * Convert snapshot to loggable format
     */
    public snapshotToLoggable(snapshot: WebGLState): any {
        const result: any = { ...snapshot };

        // Convert Maps to objects for better console logging
        if (result.textureBindings instanceof Map) {
            result.textureBindings = Object.fromEntries(result.textureBindings);
        }
        if (result.capabilities instanceof Map) {
            result.capabilities = Object.fromEntries(result.capabilities);
        }
        if (result.pixelStorei instanceof Map) {
            result.pixelStorei = Object.fromEntries(result.pixelStorei);
        }

        return result;
    }
}