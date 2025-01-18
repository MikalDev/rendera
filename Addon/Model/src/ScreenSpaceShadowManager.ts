import { mat4, vec3 } from 'gl-matrix';

export class ScreenSpaceShadowManager {
    private gl: WebGL2RenderingContext;
    private _depthTexture: WebGLTexture | null = null;
    private _shadowShader: WebGLProgram | null = null;
    private quadVAO: WebGLVertexArrayObject | null = null;
    private quadBuffer: WebGLBuffer | null = null;
    private resolution: { width: number; height: number };
    private debugShadows: boolean = true;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.resolution = { width: gl.canvas.width, height: gl.canvas.height };
    }

    initialize(): void {
        // Enable required extensions
        const depthTexture = this.gl.getExtension('WEBGL_depth_texture');
        const depthComponent = this.gl.getExtension('EXT_depth_components');
        const packedDepth = this.gl.getExtension('WEBGL_packed_depth_stencil');

        // Log WebGL capabilities
        console.log('Depth bits:', this.gl.getParameter(this.gl.DEPTH_BITS));
        console.log('Stencil bits:', this.gl.getParameter(this.gl.STENCIL_BITS));
        console.log('Available extensions:', this.gl.getSupportedExtensions());
        console.log('Context attributes:', this.gl.getContextAttributes());

        this.createQuad();
        this.createShadowShader();
        this.setupDepthTexture(this.resolution.width, this.resolution.height);
    }

    private createQuad(): void {
        // Create a full-screen quad for the shadow pass
        const vertices = new Float32Array([
            -1, -1,  // Bottom-left
             1, -1,  // Bottom-right
            -1,  1,  // Top-left
             1,  1   // Top-right
        ]);

        this.quadVAO = this.gl.createVertexArray();
        this.quadBuffer = this.gl.createBuffer();

        this.gl.bindVertexArray(this.quadVAO);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
        
        // Reset bindings
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.bindVertexArray(null);
    }

    private setupDepthTexture(width: number, height: number): void {
        // Create and set up the depth texture
        this._depthTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this._depthTexture);
        
        // Initialize empty texture with DEPTH24_STENCIL8 format to match default framebuffer
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.DEPTH24_STENCIL8,
            width,
            height,
            0,
            this.gl.DEPTH_STENCIL,
            this.gl.UNSIGNED_INT_24_8,
            null
        );

        // Set texture parameters
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        
        // Unbind
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    captureDepthBuffer(): void {
        // Create a temporary framebuffer
        const framebuffer = this.gl.createFramebuffer();
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);

        // Create a color texture to satisfy framebuffer completeness
        const colorTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, colorTexture);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.resolution.width,
            this.resolution.height,
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            null
        );
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);

        // Attach color texture to framebuffer
        this.gl.framebufferTexture2D(
            this.gl.FRAMEBUFFER,
            this.gl.COLOR_ATTACHMENT0,
            this.gl.TEXTURE_2D,
            colorTexture,
            0
        );

        // Attach depth texture to framebuffer
        this.gl.framebufferTexture2D(
            this.gl.FRAMEBUFFER,
            this.gl.DEPTH_STENCIL_ATTACHMENT,
            this.gl.TEXTURE_2D,
            this._depthTexture,
            0
        );

        // Check framebuffer status
        const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
        if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
            console.error('Framebuffer is not complete:', status);
            return;
        }

        // Copy depth from default framebuffer to our framebuffer
        this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, null);
        this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, framebuffer);
        this.gl.blitFramebuffer(
            0, 0, this.resolution.width, this.resolution.height,
            0, 0, this.resolution.width, this.resolution.height,
            this.gl.DEPTH_BUFFER_BIT,
            this.gl.NEAREST
        );

        // Clean up
        this.gl.deleteFramebuffer(framebuffer);
        this.gl.deleteTexture(colorTexture);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    private createShadowShader(): void {
        const vertexShaderSource = `#version 300 es
            layout(location = 0) in vec2 a_Position;
            out vec2 v_TexCoord;
            
            void main() {
                v_TexCoord = a_Position * 0.5 + 0.5;
                gl_Position = vec4(a_Position, 0.0, 1.0);
            }
        `;

        const fragmentShaderSource = `#version 300 es
            precision highp float;
            precision highp sampler2D;
            
            uniform sampler2D u_DepthTexture;
            uniform mat4 u_InverseProjection;
            uniform mat4 u_InverseView;
            uniform mat4 u_Projection;
            uniform vec3 u_LightPosition;
            uniform vec2 u_ScreenSize;
            uniform bool u_DebugShadows;
            
            in vec2 v_TexCoord;
            out vec4 fragColor;

            const float SHADOW_SOFTNESS = 32.0;
            const float SHADOW_INTENSITY = 20.0;
            const int MAX_STEPS = 64;
            const float MIN_DIST = 0.1;
            const float MAX_DIST = 100.0;
            const float NEAR = 0.1;
            const float FAR = 1000.0;
            const float MIN_STEP_SIZE = 0.01;
            const float DISTANCE_SCALE = 0.02;
            
            // Convert depth from [0,1] to view-space Z
            float viewSpaceZFromDepth(float depth) {
                // Convert to NDC depth in [-1, 1]
                float z_ndc = 2.0 * depth - 1.0;
                
                // Convert to view space Z (negative because view looks down -Z)
                return -(2.0 * NEAR * FAR) / (FAR + NEAR - z_ndc * (FAR - NEAR));
            }

            // Get view space position from depth and UV
            vec3 viewSpacePositionFromDepth(vec2 texCoord, float depth) {
                // Convert to NDC space
                vec2 ndc = texCoord * 2.0 - 1.0;
                float z_ndc = 2.0 * depth - 1.0;
                
                // Construct clip space position
                vec4 clipPos = vec4(ndc, z_ndc, 1.0);
                
                // Transform to view space
                vec4 viewPos = u_InverseProjection * clipPos;
                return viewPos.xyz / viewPos.w;
            }
            
            // Transform world position to view space
            vec3 worldToViewSpace(vec3 worldPos) {
                vec4 viewPos = u_InverseView * vec4(worldPos, 1.0);
                return viewPos.xyz;
            }
            
            // Transform view position to UV coordinates
            vec2 viewToUV(vec3 viewPos) {
                // Transform to clip space using forward projection
                vec4 clipPos = u_Projection * vec4(viewPos, 1.0);
                
                // Perspective divide
                vec3 ndc = clipPos.xyz / clipPos.w;
                
                // Convert to UV coordinates
                return ndc.xy * 0.5 + 0.5;
            }
            
            float computeShadow() {
                float depth = texture(u_DepthTexture, v_TexCoord).r;
                if (depth >= 1.0) return 1.0; // Skip skybox/background
                
                // Get current fragment position in view space
                vec3 viewPos = viewSpacePositionFromDepth(v_TexCoord, depth);
                
                // Convert light position to view space
                vec3 lightViewPos = worldToViewSpace(u_LightPosition);
                
                // Calculate light direction and distance in view space
                vec3 lightDir = normalize(lightViewPos - viewPos);
                float lightDist = length(lightViewPos - viewPos);
                
                float shadow = 0.0;
                float stepSize = lightDist / float(MAX_STEPS);
                
                // Calculate view-space dependent bias
                float viewDepth = abs(viewPos.z);
                float baseBias = 0.005; // Reduced from 0.05 for tighter shadows
                float distanceFactor = viewDepth / FAR;
                float angleFactor = 1.0 - max(0.0, dot(vec3(0.0, 0.0, -1.0), lightDir));
                float bias = baseBias * (1.0 + distanceFactor * 2.0 + angleFactor * 5.0);
                
                for(int i = 0; i < MAX_STEPS; i++) {
                    vec3 sampleViewPos = viewPos + lightDir * (float(i) * stepSize);
                    
                    // Project sample position to UV
                    vec2 sampleUV = viewToUV(sampleViewPos);
                    
                    if(sampleUV.x < 0.0 || sampleUV.x > 1.0 || 
                       sampleUV.y < 0.0 || sampleUV.y > 1.0) {
                        continue;
                    }
                    
                    float sampleDepth = texture(u_DepthTexture, sampleUV).r;
                    float sampleViewZ = viewSpaceZFromDepth(sampleDepth);
                    
                    // Compare Z values with bias
                    float currentViewZ = sampleViewPos.z;
                    if(currentViewZ < sampleViewZ - bias) {
                        shadow += 1.0 / SHADOW_SOFTNESS;
                    }
                }
                
                // Apply shadow intensity
                shadow = min(shadow * SHADOW_INTENSITY, 1.0);
                return 1.0 - shadow;
            }
            
            void main() {
                float depth = texture(u_DepthTexture, v_TexCoord).r;
                
                if (u_DebugShadows) {
                    float shadowFactor = computeShadow();
                    fragColor = vec4(vec3(shadowFactor), 1.0);
                } else {
                    float shadowFactor = computeShadow();
                    // With SRC_COLOR blending, output the shadow factor directly
                    // shadowFactor of 0.0 = fully shadowed (black)
                    // shadowFactor of 1.0 = no shadow (unchanged)
                    fragColor = vec4(vec3(shadowFactor), 1.0);
                }
            }
        `;

        // Create shader program
        const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER)!;
        const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;

        this.gl.shaderSource(vertexShader, vertexShaderSource);
        this.gl.shaderSource(fragmentShader, fragmentShaderSource);

        this.gl.compileShader(vertexShader);
        this.gl.compileShader(fragmentShader);

        // Check for shader compilation errors
        if (!this.gl.getShaderParameter(vertexShader, this.gl.COMPILE_STATUS)) {
            console.error('Vertex shader compilation failed:', this.gl.getShaderInfoLog(vertexShader));
            return;
        }
        if (!this.gl.getShaderParameter(fragmentShader, this.gl.COMPILE_STATUS)) {
            console.error('Fragment shader compilation failed:', this.gl.getShaderInfoLog(fragmentShader));
            return;
        }

        // Create and link program
        this._shadowShader = this.gl.createProgram()!;
        this.gl.attachShader(this._shadowShader, vertexShader);
        this.gl.attachShader(this._shadowShader, fragmentShader);
        this.gl.linkProgram(this._shadowShader);

        // Check for linking errors
        if (!this.gl.getProgramParameter(this._shadowShader, this.gl.LINK_STATUS)) {
            console.error('Shader program linking failed:', this.gl.getProgramInfoLog(this._shadowShader));
            return;
        }

        // Clean up
        this.gl.deleteShader(vertexShader);
        this.gl.deleteShader(fragmentShader);
    }

    computeShadows(viewProjection: { view: mat4, projection: mat4 }, lightPosition: vec3): void {
        if (!this._shadowShader || !this.quadVAO || !this._depthTexture) return;

        // Store current state
        const currentProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
        const currentBlendSrc = this.gl.getParameter(this.gl.BLEND_SRC_RGB);
        const currentBlendDst = this.gl.getParameter(this.gl.BLEND_DST_RGB);
        const currentBlendEq = this.gl.getParameter(this.gl.BLEND_EQUATION_RGB);

        // Set up blending based on debug mode
        if (this.debugShadows) {
            // Debug mode: replace contents
            this.gl.blendFunc(this.gl.ONE, this.gl.ZERO);
        } else {
            // Normal mode: multiplicative blending
            // Change to DST_COLOR for multiplicative darkening
            // This allows shadow intensity to directly control darkness
            this.gl.blendFunc(this.gl.ZERO, this.gl.SRC_COLOR);
        }
        this.gl.blendEquation(this.gl.FUNC_ADD);

        // Use shadow shader
        this.gl.useProgram(this._shadowShader);

        // Calculate inverse matrices
        const inverseProjection = mat4.invert(mat4.create(), viewProjection.projection);
        const inverseView = mat4.invert(mat4.create(), viewProjection.view);

        // Set uniforms
        this.gl.uniformMatrix4fv(
            this.gl.getUniformLocation(this._shadowShader, 'u_InverseProjection'),
            false,
            inverseProjection
        );
        this.gl.uniformMatrix4fv(
            this.gl.getUniformLocation(this._shadowShader, 'u_InverseView'),
            false,
            inverseView
        );
        this.gl.uniformMatrix4fv(
            this.gl.getUniformLocation(this._shadowShader, 'u_Projection'),
            false,
            viewProjection.projection
        );
        this.gl.uniform3fv(
            this.gl.getUniformLocation(this._shadowShader, 'u_LightPosition'),
            lightPosition
        );
        this.gl.uniform2f(
            this.gl.getUniformLocation(this._shadowShader, 'u_ScreenSize'),
            this.resolution.width,
            this.resolution.height
        );
        this.gl.uniform1i(
            this.gl.getUniformLocation(this._shadowShader, 'u_DebugShadows'),
            this.debugShadows ? 1 : 0
        );

        // Bind depth texture
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this._depthTexture);
        this.gl.uniform1i(
            this.gl.getUniformLocation(this._shadowShader, 'u_DepthTexture'),
            0
        );

        // Draw full-screen quad
        this.gl.bindVertexArray(this.quadVAO);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        // Reset state
        this.gl.bindVertexArray(null);
        this.gl.useProgram(currentProgram);
        this.gl.blendFunc(currentBlendSrc, currentBlendDst);
        this.gl.blendEquation(currentBlendEq);
    }

    resize(width: number, height: number): void {
        this.setupDepthTexture(width, height);
    }

    cleanup(): void {
        if (this._depthTexture) this.gl.deleteTexture(this._depthTexture);
        if (this._shadowShader) this.gl.deleteProgram(this._shadowShader);
        if (this.quadVAO) this.gl.deleteVertexArray(this.quadVAO);
        if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
    }

    get depthTexture(): WebGLTexture | null {
        return this._depthTexture;
    }

    get shadowShader(): WebGLProgram | null {
        return this._shadowShader;
    }

    setDebugMode(enabled: boolean): void {
        this.debugShadows = enabled;
    }
} 