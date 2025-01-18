import { IGPUResourceCache } from './types';

export class GPUResourceCache implements IGPUResourceCache {
    private gl: WebGL2RenderingContext;

    private cachedState: {
        vao: WebGLVertexArrayObject | null;
        textureBinding: WebGLTexture | null;
        shaderProgram: WebGLProgram | null;
        elementArrayBuffer: WebGLBuffer | null;
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
        
        this.cachedState = {
            vao,
            textureBinding,
            shaderProgram,
            elementArrayBuffer
        };
        //console.log('[rendera] GPUResourceCache: cachedState', this.cachedState);
    }

    restoreModelMode() {
        // console.log('[rendera] GPUResourceCache: restoreModelMode');
        if (this.cachedState) {
            // console.log('[rendera] GPUResourceCache: restoreModelMode', this.cachedState);
            this.gl.bindVertexArray(this.cachedState.vao);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.cachedState.textureBinding);
            this.gl.useProgram(this.cachedState.shaderProgram);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.cachedState.elementArrayBuffer);
        }
    }

}

