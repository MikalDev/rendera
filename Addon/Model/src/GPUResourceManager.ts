import { ModelError, ModelErrorCode } from './errors';
import { GPUResourceCache } from './GPUResourceCache';
import { IGPUResourceManager, IGPUResourceCache, Light, ModelData } from './types';

export class GPUResourceManager implements IGPUResourceManager {
    private gl: WebGL2RenderingContext;
    private shaderSystem: ShaderSystem;
    public gpuResourceCache: IGPUResourceCache;
    
    // Track resources for cleanup
    private buffers: Set<WebGLBuffer> = new Set();
    private textures: Set<WebGLTexture> = new Set();
    private vaos: Set<WebGLVertexArrayObject> = new Set();

    private readonly MAX_LIGHTS = 8;
    private lights: Light[] = new Array(8);
    private dirtyLightParams: boolean = false;
    private dirtyLightStates: Set<number> = new Set();

    private cameraPosition: [number, number, number] = [0, 0, 0];
    private dirtyCameraPosition: boolean = false;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.shaderSystem = new ShaderSystem(gl);
        
        // Initialize lights array with default values
        this.lights = Array(this.MAX_LIGHTS).fill(null).map(() => ({
            type: 'point',
            enabled: false,
            position: [0, 0, -5],
            color: [1, 1, 1],
            intensity: 0,
            attenuation: 1
        }));
        this.gpuResourceCache = new GPUResourceCache(gl);
    }

    createBuffer(data: BufferSource, usage: number): WebGLBuffer {
        const buffer = this.gl.createBuffer();
        if (!buffer) {
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                'Failed to create WebGL buffer'
            );
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, data, usage);
        this.buffers.add(buffer);

        return buffer;
    }

    createIndexBuffer(data: BufferSource, usage: number): WebGLBuffer {
        const buffer = this.gl.createBuffer();
        if (!buffer) {
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                'Failed to create WebGL buffer'
            );
        }
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, data, usage);
        this.buffers.add(buffer);

        return buffer;
    }

    createTexture(image: ImageData | HTMLImageElement): WebGLTexture {
        const texture = this.gl.createTexture();
        if (!texture) {
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                'Failed to create WebGL texture'
            );
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            image
        );
        this.gl.generateMipmap(this.gl.TEXTURE_2D);
        this.textures.add(texture);

        return texture;
    }

    deleteBuffer(buffer: WebGLBuffer): void {
        this.gl.deleteBuffer(buffer);
        this.buffers.delete(buffer);
    }

    deleteTexture(texture: WebGLTexture): void {
        this.gl.deleteTexture(texture);
        this.textures.delete(texture);
    }

    deleteVertexArray(vao: WebGLVertexArrayObject): void {
        this.gl.deleteVertexArray(vao);
        this.vaos.delete(vao);
    }

    createVertexArray(): WebGLVertexArrayObject {
        if (!this.gl) throw new Error('Error, no gl context');
        const vao = this.gl.createVertexArray();
        if (!vao) {
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                'Failed to create WebGL vertex array object'
            );
        }
        this.vaos.add(vao);
        return vao;
    }

    // Resource cleanup
    dispose(): void {
        // Clean up all resources
        this.buffers.forEach(buffer => this.deleteBuffer(buffer));
        this.textures.forEach(texture => this.deleteTexture(texture));
        this.vaos.forEach(vao => this.deleteVertexArray(vao));
        this.shaderSystem.dispose();
    }

    private createError(code: ModelErrorCode, message: string): ModelError {
        return { name: 'ModelError', code, message };
    }

    getShader(modelId: string): WebGLProgram {
        const shader = this.shaderSystem.getProgram(modelId);
        if (!shader) {
            throw this.createError(
                ModelErrorCode.RESOURCE_NOT_FOUND,
                `Shader not found for model: ${modelId}`
            );
        }
        return shader;
    }

    setNormalMapEnabled(shader: WebGLProgram, enabled: boolean): void {
        const location = this.gl.getUniformLocation(shader, 'u_UseNormalMap');
        if (location) {
            this.gl.uniform1i(location, enabled ? 1 : 0);
        }
    }

    setLightPosition(shader: WebGLProgram, lightPosition: [number, number, number]): void {
        const location = this.gl.getUniformLocation(shader, 'u_LightPosition');
        if (location) {
            this.gl.uniform3fv(location, lightPosition);
        }
    }

    getDefaultShader(): WebGLProgram {
        const vertexShader = `#version 300 es
        precision highp float;
        precision highp int;
        layout(location = 0) in vec3 position;
        layout(location = 1) in vec3 normal;
        layout(location = 2) in vec2 uv;
        layout(location = 3) in uvec4 joints;
        layout(location = 4) in vec4 weights;
        layout(location = 5) in vec4 tangent;

        const int MAX_BONES = 64;

        uniform mat4 u_Model;
        uniform mat4 u_View;
        uniform mat4 u_Projection;
        uniform mat4 u_BoneMatrices[MAX_BONES];  // Maximum number of joints
        uniform mat3 u_NormalMatrix;
        uniform mat4 u_NodeMatrix;
        uniform bool u_UseSkinning;
        out vec2 v_UV;
        out vec3 v_Normal;
        out vec3 v_Position;
        out mat3 v_TBN;

        void main() {
            v_UV = uv;
            // Calculate bitangent using cross product and tangent.w for handedness

            // Set nPosition to the vertex position
            vec3 nPosition = position;

            highp vec4 skinVertex = vec4(0.0);
            highp vec3 skinnedNormal = vec3(0.0);
            highp vec3 skinnedTangent = vec3(0.0);

            vec3 N;
            vec3 T;

            highp float handedness = tangent.w;

            if (u_UseSkinning) {
                for (int i = 0; i < 4; i++) {
                    uint joint = joints[i];
                    skinVertex += weights[i] * (u_BoneMatrices[joint] * vec4(position, 1.0));
                    skinnedNormal += weights[i] * (mat3(u_BoneMatrices[joint]) * normal); // Apply skinning to normals
                    skinnedTangent += weights[i] * (mat3(u_BoneMatrices[joint]) * tangent.xyz);
                }
                gl_Position = u_Projection * u_View * u_Model * skinVertex;
                // gl_Position = u_Projection * u_View * u_NodeMatrix * skinVertex;
                v_Position = (u_Model * skinVertex).xyz;
                N = normalize(u_NormalMatrix * skinnedNormal);
                T = normalize(u_NormalMatrix * skinnedTangent.xyz);
            } else {
                gl_Position = u_Projection * u_View * u_Model * u_NodeMatrix * vec4(nPosition, 1.0);
                // gl_Position = u_Projection * u_View * u_Model * vec4(nPosition, 1.0);
                v_Position = (u_Model * u_NodeMatrix * vec4(nPosition, 1.0)).xyz;
                N = normalize(u_NormalMatrix * normal);
                T = normalize(u_NormalMatrix * tangent.xyz);
            }

            vec3 B = normalize(cross(N, T)) * handedness;
            
            v_Normal = N;
            // Create TBN matrix for transforming from tangent space to world space
            v_TBN = mat3(T, B, N);
            
        }`;

        const fragmentShader = `#version 300 es
        #extension GL_EXT_shader_texture_lod : enable
        #extension GL_OES_standard_derivatives : enable
        precision highp float;

        // Light structure matching TypeScript definitions
        struct Light {
            bool enabled;
            int type;          // 0=point, 1=directional, 2=spot
            vec3 position;     // Used by point/spot
            vec3 direction;    // Used by directional/spot
            vec3 color;
            float intensity;
            float attenuation; // Used by point/spot
            float spotAngle;   // Used by spot
            float spotPenumbra;// Used by spot
        };

        const int MAX_LIGHTS = 8;
        uniform Light u_Lights[MAX_LIGHTS];

        in vec2 v_UV;
        in vec3 v_Normal;
        in vec3 v_Position;
        in mat3 v_TBN;

        uniform vec3 u_CameraPosition;
        uniform vec4 u_BaseColorFactor;
        uniform vec3 u_EmissiveFactor;
        uniform float u_MetallicFactor;
        uniform float u_RoughnessFactor;

        uniform sampler2D u_BaseColorSampler;
        uniform sampler2D u_NormalSampler;
        uniform sampler2D u_MetallicRoughnessSampler;
        uniform sampler2D u_OcclusionSampler;
        uniform sampler2D u_EmissiveSampler;
        uniform bool u_UseNormalMap;

        layout(location = 0) out vec4 fragColor;

        const float PI = 3.141592653589793;
        const float MIN_ROUGHNESS = 0.04;

        // Convert SRGB to Linear space
        vec3 SRGBtoLinear(vec3 srgb) {
            return pow(srgb, vec3(2.2));
        }

        // Obtain the normal vector
        vec3 getNormal() {
            if (u_UseNormalMap) {
                // Sample normal from normal map and transform to [-1,1] range
                vec3 normalMap = texture(u_NormalSampler, v_UV).rgb * 2.0 - 1.0;
                // Transform normal from tangent space to world space using TBN matrix
                return normalize(v_TBN * normalMap);
            } else {
                return normalize(v_Normal);
            }
        }

        // Calculate Fresnel Reflectance
        vec3 fresnelSchlick(float cosTheta, vec3 F0) {
            return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
        }

        // Calculate Geometry Occlusion (G) using Schlick-GGX
        float geometrySchlickGGX(float NdotV, float roughness) {
            float a = roughness;
            float k = (a * a) / 2.0;

            float nom = NdotV;
            float denom = NdotV * (1.0 - k) + k;

            return nom / denom;
        }

        // Calculate Geometry Function (G)
        float geometrySmith(float NdotV, float NdotL, float roughness) {
            float ggx2 = geometrySchlickGGX(NdotV, roughness);
            float ggx1 = geometrySchlickGGX(NdotL, roughness);
            return ggx1 * ggx2;
        }

        // Calculate Normal Distribution Function (D) using GGX
        float distributionGGX(vec3 N, vec3 H, float roughness) {
            float a = roughness * roughness;
            float a2 = a * a;
            float NdotH = max(dot(N, H), 0.0);
            float NdotH2 = NdotH * NdotH;

            float nom = a2;
            float denom = (NdotH2 * (a2 - 1.0) + 1.0);
            denom = PI * denom * denom;

            return nom / denom;
        }

        // Calculate light contribution based on type
        vec3 calculateLightContribution(Light light, vec3 N, vec3 V, vec3 baseColor, float metallic, float roughness) {
            if (!light.enabled) return vec3(0.0);
            
            vec3 L;
            float attenuation = 1.0;
            
            // Calculate light direction and attenuation based on light type
            if (light.type == 0) { // Point light
                vec3 lightDir = light.position - v_Position;
                float distance = length(lightDir);
                L = normalize(lightDir);
                attenuation = 1.0 / (1.0 + light.attenuation * distance * distance);
            } 
            else if (light.type == 1) { // Directional light
                L = normalize(-light.direction);
            }
            else if (light.type == 2) { // Spot light
                vec3 lightDir = light.position - v_Position;
                float distance = length(lightDir);
                L = normalize(lightDir);
                
                // Spot light cone calculation
                float cosTheta = dot(L, normalize(-light.direction));
                float cosCutoff = light.spotAngle;
                float cosOuterCutoff = light.spotAngle * (1.0 - light.spotPenumbra);
                float epsilon = cosCutoff - cosOuterCutoff;
                float spotIntensity = clamp((cosTheta - cosOuterCutoff) / epsilon, 0.0, 1.0);
                
                attenuation = spotIntensity / (1.0 + light.attenuation * distance * distance);
            }
            
            vec3 H = normalize(V + L);
            float NdotL = max(dot(N, L), 0.0);
            
            if (NdotL <= 0.0) return vec3(0.0);
            
            // Calculate F0 (surface reflection at zero incidence)
            vec3 F0 = mix(vec3(0.04), baseColor, metallic);
            
            // Calculate specular and diffuse components
            vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
            float D = distributionGGX(N, H, roughness);
            float G = geometrySmith(max(dot(N, V), 0.0), NdotL, roughness);
            
            vec3 specular = (F * D * G) / max(4.0 * max(dot(N, V), 0.0) * NdotL, 0.001);
            vec3 kD = (vec3(1.0) - F) * (1.0 - metallic);
            vec3 diffuse = kD * baseColor / PI;
            
            return (diffuse + specular) * light.color * light.intensity * NdotL * attenuation;
        }

        void main() {
            vec3 N = getNormal();
            vec3 V = normalize(u_CameraPosition - v_Position);
            
            // Sample material textures
            vec4 baseColorSample = texture(u_BaseColorSampler, v_UV) * u_BaseColorFactor;
            vec4 metallicRoughness = texture(u_MetallicRoughnessSampler, v_UV);
            vec4 emissiveSample = texture(u_EmissiveSampler, v_UV) * vec4(u_EmissiveFactor, 1.0);
            float aoSample = texture(u_OcclusionSampler, v_UV).r;
            
            vec3 baseColor = SRGBtoLinear(baseColorSample.rgb);
            float metallic = metallicRoughness.b * u_MetallicFactor;
            float roughness = max(metallicRoughness.g * u_RoughnessFactor, MIN_ROUGHNESS);
            
            // Calculate lighting
            vec3 color = vec3(0.0);
            for(int i = 0; i < MAX_LIGHTS; i++) {
                color += calculateLightContribution(u_Lights[i], N, V, baseColor, metallic, roughness);
            }
            
            // Add ambient and emissive
            vec3 ambient = vec3(0.03) * baseColor * aoSample;
            vec3 emissive = SRGBtoLinear(emissiveSample.rgb);
            color += ambient + emissive;
            
            // Tone mapping and gamma correction
            color = color / (color + vec3(1.0)); // Simple Reinhard tone mapping
            color = pow(color, vec3(1.0/2.2));   // Gamma correction
            
            fragColor = vec4(color, baseColorSample.a);
            // fragColor = vec4(baseColorSample.rgb * NdotL, baseColorSample.a);
            // Debug: Output normal as color
            // fragColor = vec4(N * 0.5 + 0.5, 1.0);
            // fragColor = vec4(vec3(NdotL), baseColorSample.a);
        }`;

        return this.shaderSystem.createProgram(vertexShader, fragmentShader, 'default');
    }

    updateLight(index: number, lightParams: Partial<Light>): void {
        if (index >= this.MAX_LIGHTS) return;
        
        Object.assign(this.lights[index], lightParams);
        this.dirtyLightParams = true;
    }

    updateCameraPosition(position: [number, number, number]): void {
        this.cameraPosition = position;
        this.dirtyCameraPosition = true;
    }

    setLightEnabled(index: number, enabled: boolean): void {
        if (index >= this.MAX_LIGHTS) return;
        
        this.lights[index].enabled = enabled;
        this.dirtyLightStates.add(index);
    }

    private updateLightUniforms(shader: WebGLProgram): void {
        if (this.dirtyLightParams) {
            this.updateAllLightUniforms(shader);
            this.dirtyLightParams = false;
            this.dirtyLightStates.clear();
        } else if (this.dirtyLightStates.size > 0) {
            this.updateLightEnableStates(shader);
            this.dirtyLightStates.clear();
        }
    }

    private updateCameraPositionUniforms(shader: WebGLProgram): void {
        if (this.dirtyCameraPosition) {
            this.gl.uniform3fv(this.gl.getUniformLocation(shader, 'u_CameraPosition'), this.cameraPosition);
            this.dirtyCameraPosition = false;
        }
    }

    private updateAllLightUniforms(shader: WebGLProgram): void {
        for (let i = 0; i < this.MAX_LIGHTS; i++) {
            const light = this.lights[i];
            const prefix = `u_Lights[${i}]`;

            this.gl.uniform1i(this.gl.getUniformLocation(shader, `${prefix}.enabled`), light.enabled ? 1 : 0);
            this.gl.uniform1i(this.gl.getUniformLocation(shader, `${prefix}.type`), this.getLightTypeValue(light.type));
            this.gl.uniform3fv(this.gl.getUniformLocation(shader, `${prefix}.color`), light.color);
            this.gl.uniform1f(this.gl.getUniformLocation(shader, `${prefix}.intensity`), light.intensity);

            if ('position' in light) {
                this.gl.uniform3fv(this.gl.getUniformLocation(shader, `${prefix}.position`), light.position);
            }
            if ('direction' in light) {
                this.gl.uniform3fv(this.gl.getUniformLocation(shader, `${prefix}.direction`), light.direction);
            }
            if ('attenuation' in light) {
                this.gl.uniform1f(this.gl.getUniformLocation(shader, `${prefix}.attenuation`), light.attenuation);
            }
            if ('spotAngle' in light) {
                this.gl.uniform1f(this.gl.getUniformLocation(shader, `${prefix}.spotAngle`), light.spotAngle);
                this.gl.uniform1f(this.gl.getUniformLocation(shader, `${prefix}.spotPenumbra`), light.spotPenumbra);
            }
        }
    }

    private updateLightEnableStates(shader: WebGLProgram): void {
        for (const index of this.dirtyLightStates) {
            const location = this.gl.getUniformLocation(shader, `u_Lights[${index}].enabled`);
            if (location) {
                this.gl.uniform1i(location, this.lights[index].enabled ? 1 : 0);
            }
        }
    }

    private getLightTypeValue(type: Light['type']): number {
        switch (type) {
            case 'point': return 0;
            case 'directional': return 1;
            case 'spot': return 2;
            default: return 0;
        }
    }

    bindShaderAndMaterial(shader: WebGLProgram, materialIndex: number, modelData: ModelData): void {
        const materialSystem = modelData.materialSystem;
        this.gl.useProgram(shader);
        this.updateCameraPositionUniforms(shader);
        this.updateLightUniforms(shader);
        materialSystem.bindMaterial(materialIndex, shader);
    }

    setLightDirection(index: number, direction: [number, number, number]): void {
        if (index >= this.MAX_LIGHTS) return;
        if (this.lights[index].type !== 'directional') return;
        this.lights[index].direction = direction;
        this.dirtyLightParams = true;
    }

    setLightColor(index: number, color: [number, number, number]): void {
        if (index >= this.MAX_LIGHTS) return;
        
        this.lights[index].color = color;
        this.dirtyLightParams = true;
    }

    setLightIntensity(index: number, intensity: number): void {
        if (index >= this.MAX_LIGHTS) return;
        
        this.lights[index].intensity = intensity;
        this.dirtyLightParams = true;
    }

    setSpotLightParams(index: number, angle: number, penumbra: number): void {
        if (index >= this.MAX_LIGHTS || this.lights[index].type !== 'spot') return;
        
        this.lights[index].spotAngle = angle;
        this.lights[index].spotPenumbra = penumbra;
        this.dirtyLightParams = true;
    }
}

// ShaderSystem for managing shaders and programs
export class ShaderSystem {
    private gl: WebGL2RenderingContext;
    private currentProgram: WebGLProgram | null = null;
    private programs: Map<string, WebGLProgram> = new Map();

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
    }

    createProgram(
        vertexSource: string,
        fragmentSource: string,
        name: string
    ): WebGLProgram {
        const program = this.compileProgram(
            vertexSource,
            fragmentSource
        );
        this.programs.set(name, program);
        return program;
    }

    useProgram(name: string): void {
        const program = this.programs.get(name);
        if (!program) {
            throw this.createError(
                ModelErrorCode.RESOURCE_NOT_FOUND,
                `Shader program '${name}' not found`
            );
        }

        if (this.currentProgram !== program) {
            this.gl.useProgram(program);
            this.currentProgram = program;
        }
    }

    private compileProgram(
        vertexSource: string,
        fragmentSource: string
    ): WebGLProgram {
        const vertexShader = this.compileShader(vertexSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentSource, this.gl.FRAGMENT_SHADER);

        const program = this.gl.createProgram();
        if (!program) {
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                'Failed to create shader program'
            );
        }

        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        // Check for linking errors
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const info = this.gl.getProgramInfoLog(program);
            this.gl.deleteProgram(program);
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                `Failed to link shader program: ${info}`
            );
        }

        // Clean up individual shaders as they're no longer needed
        this.gl.deleteShader(vertexShader);
        this.gl.deleteShader(fragmentShader);

        return program;
    }

    private compileShader(source: string, type: number): WebGLShader {
        const shader = this.gl.createShader(type);
        if (!shader) {
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                'Failed to create shader'
            );
        }

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        // Check for compilation errors
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const info = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                `Failed to compile ${type === this.gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader: ${info}`
            );
        }

        return shader;
    }

    private createError(code: ModelErrorCode, message: string): ModelError {
        return { name: 'ModelError', code, message };
    }

    getProgram(name: string): WebGLProgram {
        const program = this.programs.get(name);
        if (!program) {
            throw this.createError(
                ModelErrorCode.RESOURCE_NOT_FOUND,
                `Shader program '${name}' not found`
            );
        }
        return program;
    }

    dispose(): void {
        // Clean up all resources
        this.programs.forEach(program => this.gl.deleteProgram(program));
    }
}