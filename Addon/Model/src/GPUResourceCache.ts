import { IGPUResourceCache } from './types';

export class GPUResourceCache implements IGPUResourceCache {
    private gl: WebGL2RenderingContext;

    private cachedState: {
        // Original 4 states
        vao: WebGLVertexArrayObject | null;
        textureBinding: WebGLTexture | null;
        shaderProgram: WebGLProgram | null;
        elementArrayBuffer: WebGLBuffer | null;
        // Additional critical states
        activeTexture: number;
        arrayBuffer: WebGLBuffer | null;
        uniformBufferBindings: (WebGLBuffer | null)[];
    } | null = null;

    // Track which UBO binding points we care about
    private static readonly TRACKED_UBO_BINDING_POINTS = [0, 1, 2, 3]; // Track first 4 binding points

    // Temporary shadow map state - not persistent between calls
    private tempShadowState: {
        textureBinding2D: WebGLTexture | null;
        framebufferBinding: WebGLFramebuffer | null;
        viewport: Int32Array;
        depthTest: boolean;
        depthFunc: number;
        colorWritemask: boolean[];
        scissorTest: boolean;
        blend: boolean;
        currentProgram: WebGLProgram | null;
        colorClearValue: Float32Array;
        depthClearValue: number;
    } | null = null;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
    }

    cacheModelMode() {
        // console.log('[rendera] GPUResourceCache: cacheModelMode');
        // Get currently bound VAO
        const vao = this.gl.getParameter(this.gl.VERTEX_ARRAY_BINDING);
        
        // Get currently bound texture
        const textureBinding = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
        
        // Get current shader program
        const shaderProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);

        // Get current element array buffer
        const elementArrayBuffer = this.gl.getParameter(this.gl.ELEMENT_ARRAY_BUFFER_BINDING);
        
        // Get active texture unit
        const activeTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
        
        // Get array buffer binding
        const arrayBuffer = this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING);
        
        // Get uniform buffer bindings for tracked binding points
        const uniformBufferBindings: (WebGLBuffer | null)[] = [];
        for (const bindingPoint of GPUResourceCache.TRACKED_UBO_BINDING_POINTS) {
            const buffer = this.gl.getIndexedParameter(this.gl.UNIFORM_BUFFER_BINDING, bindingPoint);
            uniformBufferBindings.push(buffer);
        }
        
        this.cachedState = {
            vao,
            textureBinding,
            shaderProgram,
            elementArrayBuffer,
            activeTexture,
            arrayBuffer,
            uniformBufferBindings
        };
        //console.log('[rendera] GPUResourceCache: cachedState', this.cachedState);
    }

    restoreModelMode() {
        // console.log('[rendera] GPUResourceCache: restoreModelMode');
        if (this.cachedState) {
            // console.log('[rendera] GPUResourceCache: restoreModelMode', this.cachedState);
            
            // First, clean up any texture bindings we might have created on units 1-17
            // This ensures C3 doesn't encounter unexpected textures
            this.cleanupTextureUnits();
            
            // Restore active texture unit first (before binding textures)
            this.gl.activeTexture(this.cachedState.activeTexture);
            
            // Restore original 4 states
            this.gl.bindVertexArray(this.cachedState.vao);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.cachedState.textureBinding);
            this.gl.useProgram(this.cachedState.shaderProgram);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.cachedState.elementArrayBuffer);
            
            // Restore additional states
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.cachedState.arrayBuffer);
            
            // Restore uniform buffer bindings
            for (let i = 0; i < this.cachedState.uniformBufferBindings.length; i++) {
                const bindingPoint = GPUResourceCache.TRACKED_UBO_BINDING_POINTS[i];
                const buffer = this.cachedState.uniformBufferBindings[i];
                if (buffer !== undefined) {
                    this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, bindingPoint, buffer);
                }
            }
            
            // Clear cached state after restoration
            this.cachedState = null;
        }
    }

    /**
     * Clean up texture bindings on units we use (1-17) to avoid conflicts with C3
     * We skip unit 0 as it will be restored from cached state
     */
    private cleanupTextureUnits(): void {
        // Use cached activeTexture if available, otherwise query GL
        const currentActiveTexture = this.cachedState?.activeTexture ?? this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
        
        // Clean material texture units (1-4)
        for (let unit = 1; unit <= 4; unit++) {
            this.gl.activeTexture(this.gl.TEXTURE0 + unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        }
        
        // Clean shadow map texture units (10-17)
        for (let unit = 10; unit <= 17; unit++) {
            this.gl.activeTexture(this.gl.TEXTURE0 + unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        }
        
        // Restore the active texture unit
        this.gl.activeTexture(currentActiveTexture);
    }

    /**
     * Cache the current GL state before shadow map rendering.
     * Always queries fresh state to avoid stale references to deleted objects.
     */
    cacheShadowMapState(): void {
        // Always query fresh GL state to avoid stale references
        this.tempShadowState = {
            textureBinding2D: this.gl.getParameter(this.gl.TEXTURE_BINDING_2D),
            framebufferBinding: this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING),
            viewport: this.gl.getParameter(this.gl.VIEWPORT),
            depthTest: this.gl.getParameter(this.gl.DEPTH_TEST),
            depthFunc: this.gl.getParameter(this.gl.DEPTH_FUNC),
            colorWritemask: this.gl.getParameter(this.gl.COLOR_WRITEMASK),
            scissorTest: this.gl.getParameter(this.gl.SCISSOR_TEST),
            blend: this.gl.getParameter(this.gl.BLEND),
            currentProgram: this.gl.getParameter(this.gl.CURRENT_PROGRAM),
            colorClearValue: this.gl.getParameter(this.gl.COLOR_CLEAR_VALUE),
            depthClearValue: this.gl.getParameter(this.gl.DEPTH_CLEAR_VALUE)
        };
    }

    /**
     * Restore the cached GL state after shadow map rendering.
     * Clears the temp state after restoring to prevent stale references.
     */
    restoreShadowMapState(): void {
        if (this.tempShadowState) {
            // Restore all cached GL state
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.tempShadowState.textureBinding2D);
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.tempShadowState.framebufferBinding);
            this.gl.viewport(
                this.tempShadowState.viewport[0],
                this.tempShadowState.viewport[1],
                this.tempShadowState.viewport[2],
                this.tempShadowState.viewport[3]
            );
            
            if (this.tempShadowState.depthTest) {
                this.gl.enable(this.gl.DEPTH_TEST);
            } else {
                this.gl.disable(this.gl.DEPTH_TEST);
            }
            
            this.gl.depthFunc(this.tempShadowState.depthFunc);
            this.gl.colorMask(
                this.tempShadowState.colorWritemask[0],
                this.tempShadowState.colorWritemask[1],
                this.tempShadowState.colorWritemask[2],
                this.tempShadowState.colorWritemask[3]
            );
            
            if (this.tempShadowState.scissorTest) {
                this.gl.enable(this.gl.SCISSOR_TEST);
            } else {
                this.gl.disable(this.gl.SCISSOR_TEST);
            }
            
            if (this.tempShadowState.blend) {
                this.gl.enable(this.gl.BLEND);
            } else {
                this.gl.disable(this.gl.BLEND);
            }
            
            this.gl.useProgram(this.tempShadowState.currentProgram);
            this.gl.clearColor(
                this.tempShadowState.colorClearValue[0],
                this.tempShadowState.colorClearValue[1],
                this.tempShadowState.colorClearValue[2],
                this.tempShadowState.colorClearValue[3]
            );
            this.gl.clearDepth(this.tempShadowState.depthClearValue);
            
            // Clear temp state after restore to prevent stale references
            this.tempShadowState = null;
        }
    }

    /**
     * Get the cached shadow state.
     * Returns the temporary state if available.
     */
    getShadowState() {
        return this.tempShadowState;
    }

    /**
     * Clear the shadow state cache (e.g., on context loss).
     */
    clearShadowStateCache(): void {
        this.tempShadowState = null;
    }

}

