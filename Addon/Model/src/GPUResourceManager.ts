import { ModelError, ModelErrorCode } from './errors';
import { GPUResourceCache } from './GPUResourceCache';
import { IGPUResourceManager, IGPUResourceCache, Light, ModelData, MAX_BONES } from './types';
import { mat4 } from 'gl-matrix';
import type { ShadowMapManager } from './ShadowMapManager';

export class GPUResourceManager implements IGPUResourceManager {
    private gl: WebGL2RenderingContext;
    private shaderSystem: ShaderSystem;
    public gpuResourceCache: IGPUResourceCache;
    
    // Debug flag
    private static DEBUG_SHADOWS = false; // Set to true to enable debug logging
    
    // Track resources for cleanup
    private buffers: Set<WebGLBuffer> = new Set();
    private textures: Set<WebGLTexture> = new Set();
    private vaos: Set<WebGLVertexArrayObject> = new Set();
    
    // Dummy shadow texture for unused shadow map slots
    private dummyShadowTexture: WebGLTexture | null = null;

    private readonly MAX_LIGHTS = 8;
    public lights: Light[] = new Array(8);
    private dirtyLightParams: boolean = false;
    private dirtyLightStates: Set<number> = new Set();

    private cameraPosition: [number, number, number] = [0, 0, 0];
    private dirtyCameraPosition: boolean = false;

    // Global Illumination state
    private giState = {
        skyColor: [0.5, 0.7, 1.0] as [number, number, number],      // Light blue sky
        groundColor: [0.2, 0.15, 0.1] as [number, number, number],  // Brown ground
        intensity: 0.2,                                              // Default 20% GI contribution
        lambertWrap: 0.1                                            // Slight shadow softening
    };
    private dirtyGIState: boolean = true;  // Set to true initially to apply default values

    // UBO for bone matrices
    private boneUBO: WebGLBuffer | null = null;
    private readonly BONE_UBO_BINDING_POINT = 0;

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
            attenuation: 1,
            castShadows: false,
            direction: [0, 0, -1]
        }));
        this.gpuResourceCache = new GPUResourceCache(gl);
        
        // Initialize and bind the bone UBO to ensure it's always available
        this.initializeBoneUBO();
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

    createTexture(image: ImageData | HTMLImageElement | ImageBitmap): WebGLTexture {
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

    // UBO management methods
    private initializeBoneUBO(): void {
        if (this.boneUBO) return;
        
        this.boneUBO = this.gl.createBuffer();
        if (!this.boneUBO) {
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                'Failed to create bone UBO'
            );
        }
        
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, this.boneUBO);
        // Allocate space for MAX_BONES matrices (each matrix is 64 bytes)
        const sizeInBytes = MAX_BONES * 64;
        this.gl.bufferData(this.gl.UNIFORM_BUFFER, sizeInBytes, this.gl.DYNAMIC_DRAW);
        
        // Always bind the UBO to the binding point so it's available for shaders
        this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, this.BONE_UBO_BINDING_POINT, this.boneUBO);
        
        // Track this buffer for cleanup
        this.buffers.add(this.boneUBO);
    }

    public updateBoneUBO(boneMatrices: Float32Array, boneCount: number): void {
        if (!this.boneUBO) {
            this.initializeBoneUBO();
        }
        
        // Validate bone count
        if (boneCount > MAX_BONES) {
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                `Bone count ${boneCount} exceeds maximum of ${MAX_BONES}`
            );
        }
        
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, this.boneUBO);
        this.gl.bufferSubData(this.gl.UNIFORM_BUFFER, 0, boneMatrices);
        this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, this.BONE_UBO_BINDING_POINT, this.boneUBO);
    }

    public linkUniformBlocks(program: WebGLProgram): void {
        // Link the BoneData uniform block to the binding point
        const boneBlockIndex = this.gl.getUniformBlockIndex(program, 'BoneData');
        if (boneBlockIndex !== this.gl.INVALID_INDEX) {
            this.gl.uniformBlockBinding(program, boneBlockIndex, this.BONE_UBO_BINDING_POINT);
        }
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

        const int MAX_BONES = 256;
        const int MAX_SHADOW_MAPS = 8;

        layout(std140) uniform BoneData {
            mat4 u_BoneMatrices[MAX_BONES];
        };

        uniform mat4 u_Model;
        uniform mat4 u_View;
        uniform mat4 u_Projection;
        uniform mat3 u_NormalMatrix;
        uniform mat4 u_NodeMatrix;
        uniform bool u_UseSkinning;
        uniform bool u_UseShadowMap;
        uniform mat4 u_LightViewProjections[MAX_SHADOW_MAPS];  // Light view-projection matrices
        uniform bool u_ShadowEnabled[MAX_SHADOW_MAPS];  // Which shadow maps are active

        out vec2 v_UV;
        out vec3 v_Normal;
        out vec3 v_Position;
        out mat3 v_TBN;
        out vec4 v_PositionsFromLight[MAX_SHADOW_MAPS];  // Positions from each light's perspective

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

            // Apply coordinate conversion to normals (GLB Y-up right-handed to C3 Y-down left-handed)
            // This converts: Y-up to Y-down (flip Y), right-handed to left-handed (flip Z)
            vec3 convertedNormal = normal * vec3(1.0, -1.0, -1.0);
            vec3 convertedTangent = tangent.xyz * vec3(1.0, -1.0, -1.0);

            if (u_UseSkinning) {
                for (int i = 0; i < 4; i++) {
                    uint joint = joints[i];
                    skinVertex += weights[i] * (u_BoneMatrices[joint] * vec4(position, 1.0));
                    skinnedNormal += weights[i] * (mat3(u_BoneMatrices[joint]) * convertedNormal);
                    skinnedTangent += weights[i] * (mat3(u_BoneMatrices[joint]) * convertedTangent);
                }
                gl_Position = u_Projection * u_View * u_Model * skinVertex;
                v_Position = (u_Model * skinVertex).xyz;
                N = normalize(u_NormalMatrix * skinnedNormal);
                T = normalize(u_NormalMatrix * skinnedTangent.xyz);
            } else {
                gl_Position = u_Projection * u_View * u_Model * u_NodeMatrix * vec4(nPosition, 1.0);
                v_Position = (u_Model * u_NodeMatrix * vec4(nPosition, 1.0)).xyz;
                N = normalize(u_NormalMatrix * convertedNormal);
                T = normalize(u_NormalMatrix * convertedTangent);
            }

            vec3 B = normalize(cross(N, T)) * handedness;
            
            v_Normal = N;
            v_TBN = mat3(T, B, N);
            
            // Calculate positions from light perspectives for shadow mapping
            if (u_UseShadowMap) {
                // Fix: Use consistent world position calculation for both skinned and non-skinned
                vec4 worldPos;
                if (u_UseSkinning) {
                    worldPos = u_Model * skinVertex;
                } else {
                    worldPos = u_Model * u_NodeMatrix * vec4(position, 1.0);
                }
                
                // Calculate position from each shadow-casting light's perspective
                for (int i = 0; i < MAX_SHADOW_MAPS; i++) {
                    if (u_ShadowEnabled[i]) {
                        v_PositionsFromLight[i] = u_LightViewProjections[i] * worldPos;
                    } else {
                        v_PositionsFromLight[i] = vec4(0.0); // Initialize unused positions
                    }
                }
            } else {
                // Initialize all positions to zero when shadows are disabled
                for (int i = 0; i < MAX_SHADOW_MAPS; i++) {
                    v_PositionsFromLight[i] = vec4(0.0);
                }
            }
        }`;

        const fragmentShader = `#version 300 es
        precision highp float;
        precision highp sampler2DShadow;  // Match ShadowMapManager's precision

        // Light structure matching TypeScript definitions
        struct Light {
            bool enabled;
            int type;          // 0=point, 1=directional, 2=spot
            vec3 position;     // Used by point/spot
            vec3 direction;    // Used by directional/spot
            vec3 color;
            float intensity;
            float attenuation; // Used by point/spot
            float cosAngle;   // Used by spot
            float spotPenumbra;// Used by spot
        };

        const int MAX_LIGHTS = 8;
        const int MAX_SHADOW_MAPS = 8;
        uniform Light u_Lights[MAX_LIGHTS];

        in vec2 v_UV;
        in vec3 v_Normal;
        in vec3 v_Position;
        in mat3 v_TBN;
        in vec4 v_PositionsFromLight[MAX_SHADOW_MAPS];  // Positions from each light's perspective

        uniform vec3 u_CameraPosition;
        uniform vec4 u_BaseColorFactor;
        uniform vec3 u_EmissiveFactor;
        uniform float u_MetallicFactor;
        uniform float u_RoughnessFactor;
        uniform vec3 u_TintColor;
        uniform float u_Opacity;
        
        // Global Illumination uniforms (with defaults for safety)
        uniform vec3 u_SkyColor;
        uniform vec3 u_GroundColor;
        uniform float u_GIIntensity;
        uniform float u_LambertWrap;

        uniform sampler2D u_BaseColorSampler;
        uniform sampler2D u_NormalSampler;
        uniform sampler2D u_MetallicRoughnessSampler;
        uniform sampler2D u_OcclusionSampler;
        uniform sampler2D u_EmissiveSampler;
        
        // Individual shadow map samplers (WebGL doesn't support sampler2DShadow arrays)
        uniform sampler2DShadow u_ShadowMap0;
        uniform sampler2DShadow u_ShadowMap1;
        uniform sampler2DShadow u_ShadowMap2;
        uniform sampler2DShadow u_ShadowMap3;
        uniform sampler2DShadow u_ShadowMap4;
        uniform sampler2DShadow u_ShadowMap5;
        uniform sampler2DShadow u_ShadowMap6;
        uniform sampler2DShadow u_ShadowMap7;
        
        uniform bool u_UseNormalMap;
        uniform bool u_UseShadowMap;
        uniform bool u_ShadowEnabled[MAX_SHADOW_MAPS];  // Which shadow maps are active
        uniform int u_LightToShadowMap[MAX_LIGHTS];  // Maps light index to shadow map index (-1 = no shadow)
        uniform float u_ShadowBias;  // Bias to prevent shadow acne

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
                float cosCutoff = light.cosAngle;
                float cosOuterCutoff = light.cosAngle * (1.0 - light.spotPenumbra);
                float epsilon = cosCutoff - cosOuterCutoff;
                float spotIntensity = clamp((cosTheta - cosOuterCutoff) / epsilon, 0.0, 1.0);

                attenuation = spotIntensity / (1.0 + light.attenuation * distance * distance);
            }
            
            vec3 H = normalize(V + L);

            // Calculate NdotL
            float NdotL = max(dot(N, L), 0.0);

            // Apply Lambert wrap to soften lighting transitions (subsurface scattering effect)
            // This only affects diffuse, keeping specular highlights sharp
            float diffuseNdotL = (NdotL + u_LambertWrap) / (1.0 + u_LambertWrap);
            diffuseNdotL = max(diffuseNdotL, 0.0);

            // Early exit if no lighting contribution
            if (diffuseNdotL <= 0.0) return vec3(0.0);

            // Calculate F0 (surface reflection at zero incidence)
            vec3 F0 = mix(vec3(0.04), baseColor, metallic);

            // Calculate PBR components using unwrapped NdotL for accurate specular
            vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
            float NdotV = max(dot(N, V), 0.0);
            float D = distributionGGX(N, H, roughness);
            float G = geometrySmith(NdotV, max(NdotL, 0.001), roughness);

            // Cook-Torrance specular BRDF (uses unwrapped NdotL for sharp highlights)
            vec3 specular = (D * F * G) / max(4.0 * NdotV * max(NdotL, 0.001), 0.001);

            // Energy-conserving diffuse
            vec3 kD = (vec3(1.0) - F) * (1.0 - metallic);
            vec3 diffuse = kD * baseColor / PI;

            // Combine: diffuse uses wrapped NdotL (soft), specular uses unwrapped NdotL (sharp)
            return (diffuse * diffuseNdotL + specular * max(NdotL, 0.0)) * light.color * light.intensity * attenuation;
        }

        float calculateShadowForMap(vec4 fragPosLightSpace, int shadowMapIndex, Light light) {
            if (!u_UseShadowMap || !u_ShadowEnabled[shadowMapIndex]) return 1.0;
            
            // Perform perspective divide
            vec3 projCoords = fragPosLightSpace.xyz / fragPosLightSpace.w;
            
            // Transform to [0,1] range
            projCoords = projCoords * 0.5 + 0.5;
            
            // Basic bounds check
            if (projCoords.x < 0.0 || projCoords.x > 1.0 || 
                projCoords.y < 0.0 || projCoords.y > 1.0 || 
                projCoords.z > 1.0) {
                // DEBUG: Show which shadow maps are out of bounds
                // This will help us see if lights are covering the right areas
                return 1.0;
            }
            
            // Calculate bias based on surface angle and light type
            float bias = u_ShadowBias;
            vec3 normal = getNormal();
            vec3 lightDir;
            
            if (light.type == 1) { // Directional light
                lightDir = normalize(-light.direction);
            } else { // Point or spot light
                lightDir = normalize(light.position - v_Position);
            }
            
            float cosTheta = max(dot(normal, lightDir), 0.0);
            bias *= tan(acos(cosTheta));
            bias = clamp(bias, 0.0, 0.01);
            
            // Add bias to avoid shadow acne
            if (light.type == 2) {
                bias = 0.00001;
            }
            float currentDepth = projCoords.z - bias;
            
            // Use individual shadow map uniforms with proper sampler2DShadow sampling
            float shadow = 0.0;
            
            if (shadowMapIndex == 0) {
                shadow = texture(u_ShadowMap0, vec3(projCoords.xy, currentDepth));
            } else if (shadowMapIndex == 1) {
                shadow = texture(u_ShadowMap1, vec3(projCoords.xy, currentDepth));
            } else if (shadowMapIndex == 2) {
                shadow = texture(u_ShadowMap2, vec3(projCoords.xy, currentDepth));
            } else if (shadowMapIndex == 3) {
                shadow = texture(u_ShadowMap3, vec3(projCoords.xy, currentDepth));
            } else if (shadowMapIndex == 4) {
                shadow = texture(u_ShadowMap4, vec3(projCoords.xy, currentDepth));
            } else if (shadowMapIndex == 5) {
                shadow = texture(u_ShadowMap5, vec3(projCoords.xy, currentDepth));
            } else if (shadowMapIndex == 6) {
                shadow = texture(u_ShadowMap6, vec3(projCoords.xy, currentDepth));
            } else if (shadowMapIndex == 7) {
                shadow = texture(u_ShadowMap7, vec3(projCoords.xy, currentDepth));
            }
            
            return shadow;
        }

        void main() {
            vec3 N = getNormal();
            vec3 V = normalize(u_CameraPosition - v_Position);
            
            // Sample material textures
            vec4 baseColorSample = texture(u_BaseColorSampler, v_UV) * u_BaseColorFactor;
            vec4 metallicRoughness = texture(u_MetallicRoughnessSampler, v_UV);
            vec4 emissiveSample = texture(u_EmissiveSampler, v_UV) * vec4(u_EmissiveFactor, 1.0);
            // Default to 1.0 if AO texture is black/missing
            float aoSample = max(texture(u_OcclusionSampler, v_UV).r, 0.01);
            
            vec3 baseColor = SRGBtoLinear(baseColorSample.rgb);
            float metallic = metallicRoughness.b * u_MetallicFactor;
            float roughness = max(metallicRoughness.g * u_RoughnessFactor, MIN_ROUGHNESS);
            
            // Calculate lighting
            vec3 color = vec3(0.0);
            
            for(int i = 0; i < MAX_LIGHTS; i++) {
                vec3 lightContrib = calculateLightContribution(u_Lights[i], N, V, baseColor, metallic, roughness);
                
                // Calculate shadows for lights that cast them
                float shadow = 1.0;
                int shadowMapIndex = u_LightToShadowMap[i];
                if (shadowMapIndex >= 0 && shadowMapIndex < MAX_SHADOW_MAPS) {
                    shadow = calculateShadowForMap(v_PositionsFromLight[shadowMapIndex], shadowMapIndex, u_Lights[i]);
                }

                color += lightContrib * shadow;
            }
            
            // Calculate hemispheric ambient GI
            vec3 hemisphericAmbient = vec3(0.0);
            if (u_GIIntensity > 0.0) {
                // After coordinate conversion, Y+ points up correctly
                // Map normal Y component from [-1,1] to [0,1] for blending
                // When N.y is +1 (pointing up), we want sky color (upFactor = 1)
                // When N.y is -1 (pointing down), we want ground color (upFactor = 0)
                float upFactor = (N.y + 1.0) * 0.5;
                hemisphericAmbient = mix(u_GroundColor, u_SkyColor, upFactor) * u_GIIntensity;
            }
            
            // Add ambient (including GI), AO, and emissive (unaffected by shadows)
            vec3 ambient = hemisphericAmbient * baseColor * aoSample;
            vec3 emissive = SRGBtoLinear(emissiveSample.rgb);
            color += ambient + emissive;
            
            // Tone mapping and gamma correction
            color = color / (color + vec3(1.0)); // Simple Reinhard tone mapping
            color = pow(color, vec3(1.0/2.2));   // Gamma correction
            
            // Apply tint and opacity
            color = color * u_TintColor * u_Opacity;
            float finalAlpha = baseColorSample.a * u_Opacity;
            
            // Debug: Visualize GI contribution
            // Uncomment one of these lines to debug:
            // fragColor = vec4(hemisphericAmbient, 1.0); // Show only GI
            // float debugUpFactor = (-N.y + 1.0) * 0.5;
            // fragColor = vec4(vec3(debugUpFactor), 1.0); // Show normal Y mapping (white = up, black = down)
            // fragColor = vec4(u_SkyColor * u_GIIntensity, 1.0); // Show sky color
            
            fragColor = vec4(color, finalAlpha);
        }`;

        const program = this.shaderSystem.createProgram(vertexShader, fragmentShader, 'default');
        this.linkUniformBlocks(program);
        return program;
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

    // Global Illumination methods
    setGISkyColor(color: [number, number, number]): void {
        console.log('[GI] Setting sky color:', color);
        this.giState.skyColor = color;
        this.dirtyGIState = true;
    }

    setGIGroundColor(color: [number, number, number]): void {
        console.log('[GI] Setting ground color:', color);
        this.giState.groundColor = color;
        this.dirtyGIState = true;
    }

    setGIIntensity(intensity: number): void {
        // Clamp between 0 and 1
        this.giState.intensity = Math.max(0, Math.min(1, intensity));
        console.log('[GI] Setting intensity:', this.giState.intensity);
        this.dirtyGIState = true;
    }

    setLambertWrap(wrap: number): void {
        // Clamp between 0 and 1
        this.giState.lambertWrap = Math.max(0, Math.min(1, wrap));
        console.log('[GI] Setting Lambert wrap:', this.giState.lambertWrap);
        this.dirtyGIState = true;
    }

    setLightEnabled(index: number, enabled: boolean): void {
        if (index >= this.MAX_LIGHTS) return;
        
        this.lights[index].enabled = enabled;
        this.dirtyLightStates.add(index);
        
        // Validate shadow count if enabling a light that casts shadows
        if (enabled && this.lights[index].castShadows) {
            this.validateShadowCount();
        }
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

    private updateGIUniforms(shader: WebGLProgram): void {
        if (this.dirtyGIState) {
            const skyLoc = this.gl.getUniformLocation(shader, 'u_SkyColor');
            const groundLoc = this.gl.getUniformLocation(shader, 'u_GroundColor');
            const intensityLoc = this.gl.getUniformLocation(shader, 'u_GIIntensity');
            const wrapLoc = this.gl.getUniformLocation(shader, 'u_LambertWrap');
            
            if (skyLoc) this.gl.uniform3fv(skyLoc, this.giState.skyColor);
            if (groundLoc) this.gl.uniform3fv(groundLoc, this.giState.groundColor);
            if (intensityLoc) this.gl.uniform1f(intensityLoc, this.giState.intensity);
            if (wrapLoc) this.gl.uniform1f(wrapLoc, this.giState.lambertWrap);
            
            // Debug logging
            console.log('[GI] Updating uniforms:', {
                skyColor: this.giState.skyColor,
                groundColor: this.giState.groundColor,
                intensity: this.giState.intensity,
                lambertWrap: this.giState.lambertWrap,
                locations: {
                    sky: skyLoc !== null,
                    ground: groundLoc !== null,
                    intensity: intensityLoc !== null,
                    wrap: wrapLoc !== null
                }
            });
            
            this.dirtyGIState = false;
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
            if ('cosAngle' in light) {
                this.gl.uniform1f(this.gl.getUniformLocation(shader, `${prefix}.cosAngle`), light.cosAngle);
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
        this.updateGIUniforms(shader);
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
        
        this.lights[index].cosAngle = angle;
        this.lights[index].spotPenumbra = penumbra;
        this.dirtyLightParams = true;
    }

    setLightCastShadows(index: number, castShadows: boolean): void {
        if (index >= this.MAX_LIGHTS) return;
        
        if (GPUResourceManager.DEBUG_SHADOWS) {
            console.log(`[GPUResourceManager] Setting light ${index} castShadows to ${castShadows} (type: ${this.lights[index].type}, enabled: ${this.lights[index].enabled})`);
        }
        
        this.lights[index].castShadows = castShadows;
        this.dirtyLightParams = true; // Trigger light updates
        
        // Validate shadow count and warn if exceeded
        this.validateShadowCount();
    }

    private validateShadowCount(): void {
        const shadowCastingLights = this.lights.filter(light => light.enabled && light.castShadows);
        if (shadowCastingLights.length > 8) {
            console.warn(`Warning: ${shadowCastingLights.length} lights are configured to cast shadows, but maximum supported is 8. Some lights may not cast shadows.`);
        }
    }

    /**
     * @deprecated Use setMultipleShadowMapUniforms instead
     */
    setShadowMapUniforms(
        shader: WebGLProgram, 
        enabled: boolean, 
        shadowMap: WebGLTexture | null = null,
        lightViewProjection: mat4 | null = null,
        bias: number = 0.001
    ): void {
        this.gl.useProgram(shader);
        
        const useShadowMapLoc = this.gl.getUniformLocation(shader, 'u_UseShadowMap');
        if (useShadowMapLoc) {
            this.gl.uniform1i(useShadowMapLoc, enabled ? 1 : 0);
        }

        if (enabled && shadowMap && lightViewProjection) {
            // Use texture unit 10 for shadow map
            this.gl.activeTexture(this.gl.TEXTURE10);  // Changed from TEXTURE7
            // Clear any existing texture bindings to prevent type conflicts with C3
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
            this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, null);
            this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, null);
            this.gl.bindTexture(this.gl.TEXTURE_3D, null);
            this.gl.bindTexture(this.gl.TEXTURE_2D, shadowMap);
            const shadowMapLoc = this.gl.getUniformLocation(shader, 'u_ShadowMap');
            if (shadowMapLoc) {
                this.gl.uniform1i(shadowMapLoc, 10);  // Tell shader to use texture unit 10
            }

            const lightVPLoc = this.gl.getUniformLocation(shader, 'u_LightViewProjection');
            if (lightVPLoc) {
                this.gl.uniformMatrix4fv(lightVPLoc, false, lightViewProjection);
            }

            const biasLoc = this.gl.getUniformLocation(shader, 'u_ShadowBias');
            if (biasLoc) {
                this.gl.uniform1f(biasLoc, bias);
            }
        }
    }

    /**
     * Sets uniforms for multiple shadow maps using data from ShadowMapManager.
     * This method replaces setShadowMapUniforms for the new multi-shadow architecture.
     */
    setMultipleShadowMapUniforms(
        shader: WebGLProgram,
        shadowMapManager: ShadowMapManager,
        bias: number = 0.001
    ): void {
        this.gl.useProgram(shader);
        
        // Get active shadow map data
        const activeShadowMapIndices = shadowMapManager.getActiveShadowMapIndices();
        const lightToShadowMapping = shadowMapManager.getLightToShadowMapMapping();
        
        if (GPUResourceManager.DEBUG_SHADOWS) {
            console.log(`[GPUResourceManager] Setting up shadow uniforms - Active shadow maps: [${activeShadowMapIndices.join(', ')}], Light mappings:`, Array.from(lightToShadowMapping.entries()));
        }
        
        // Set global shadow map enabled flag
        const useShadowMapLoc = this.gl.getUniformLocation(shader, 'u_UseShadowMap');
        const shadowsEnabled = activeShadowMapIndices.length > 0;
        if (useShadowMapLoc) {
            this.gl.uniform1i(useShadowMapLoc, shadowsEnabled ? 1 : 0);
        }

        // Set shadow bias
        const biasLoc = this.gl.getUniformLocation(shader, 'u_ShadowBias');
        if (biasLoc) {
            this.gl.uniform1f(biasLoc, bias);
        }

        // All sampler2DShadow uniforms need valid textures
        const dummyTexture = this.createDummyShadowTexture();
        
        // Initialize shadow enabled array (all false)
        const shadowEnabledArray = new Array(8).fill(0); // MAX_SHADOW_MAPS = 8
        const lightToShadowArray = new Array(8).fill(-1); // MAX_LIGHTS = 8, -1 = no shadow
        const viewProjectionMatrices: Float32Array[] = new Array(8);

        // First, collect data for active shadow maps
        for (const shadowMapIndex of activeShadowMapIndices) {
            shadowEnabledArray[shadowMapIndex] = 1;
            
            const shadowData = shadowMapManager.getShadowDataByIndex(shadowMapIndex);
            if (shadowData) {
                // Calculate combined view-projection matrix
                const viewProjection = new Float32Array(16);
                const combined = mat4.create();
                mat4.multiply(combined, shadowData.projection, shadowData.view);
                mat4.copy(viewProjection, combined);
                viewProjectionMatrices[shadowMapIndex] = viewProjection;
                
                if (GPUResourceManager.DEBUG_SHADOWS) {
                    const lightId = shadowMapManager.getShadowMapLightId(shadowMapIndex);
                    const sample = `[${combined[0].toFixed(2)}, ${combined[1].toFixed(2)}, ${combined[12].toFixed(2)}, ${combined[13].toFixed(2)}]`;
                    console.log(`[GPUResourceManager] Shadow map ${shadowMapIndex} -> Light ${lightId}, VP matrix set, sample: ${sample}`);
                }
            }
        }
        
        // Bind textures to all 8 texture units
        // Every sampler2DShadow uniform must have a valid texture
        for (let i = 0; i < 8; i++) {
            this.gl.activeTexture(this.gl.TEXTURE10 + i);
            
            // Get texture for this slot
            const shadowData = activeShadowMapIndices.includes(i) 
                ? shadowMapManager.getShadowDataByIndex(i)
                : null;
            
            const textureToUse = (shadowData && shadowData.texture) 
                ? shadowData.texture 
                : dummyTexture;
            
            this.gl.bindTexture(this.gl.TEXTURE_2D, textureToUse);
        }

        // Set light-to-shadow mapping
        for (const [lightId, shadowMapIndex] of lightToShadowMapping) {
            if (lightId < 8) { // MAX_LIGHTS = 8
                lightToShadowArray[lightId] = shadowMapIndex;
                if (GPUResourceManager.DEBUG_SHADOWS) {
                    console.log(`[GPUResourceManager] Light ${lightId} -> Shadow map ${shadowMapIndex} mapping set`);
                }
            }
        }

        // Set uniform arrays
        const shadowEnabledLoc = this.gl.getUniformLocation(shader, 'u_ShadowEnabled');
        if (shadowEnabledLoc) {
            this.gl.uniform1iv(shadowEnabledLoc, shadowEnabledArray);
        }

        const lightToShadowMapLoc = this.gl.getUniformLocation(shader, 'u_LightToShadowMap');
        if (lightToShadowMapLoc) {
            this.gl.uniform1iv(lightToShadowMapLoc, lightToShadowArray);
        }

        // Set uniforms for all 8 shadow map slots
        // Each uniform points to the corresponding texture unit (10+i)
        for (let i = 0; i < 8; i++) {
            const uniformName = `u_ShadowMap${i}`;
            const location = this.gl.getUniformLocation(shader, uniformName);
            if (location !== null) {
                this.gl.uniform1i(location, 10 + i);
            }
        }

        // Set light view-projection matrices array
        const lightViewProjectionsLoc = this.gl.getUniformLocation(shader, 'u_LightViewProjections');
        if (lightViewProjectionsLoc) {
            // Create a flat array of all matrices (8 matrices * 16 floats each)
            const allMatrices = new Float32Array(8 * 16);
            for (let i = 0; i < 8; i++) {
                if (viewProjectionMatrices[i]) {
                    allMatrices.set(viewProjectionMatrices[i], i * 16);
                } else {
                    // Set identity matrix for unused slots
                    const identity = mat4.create();
                    allMatrices.set(identity, i * 16);
                }
            }
            this.gl.uniformMatrix4fv(lightViewProjectionsLoc, false, allMatrices);
        }
    }

    /**
     * Enable or disable debug logging for GPU resource operations.
     * @param enabled - Whether to enable debug logging
     */
    static setDebugLogging(enabled: boolean): void {
        GPUResourceManager.DEBUG_SHADOWS = enabled;
        console.log(`[GPUResourceManager] Debug logging ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Creates a dummy shadow texture for unused shadow map slots.
     */
    private createDummyShadowTexture(): WebGLTexture {
        if (this.dummyShadowTexture) {
            return this.dummyShadowTexture;
        }
        
        const texture = this.gl.createTexture();
        if (!texture) {
            throw this.createError(
                ModelErrorCode.GL_ERROR,
                'Failed to create dummy shadow texture'
            );
        }
        
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        
        // Create a 4x4 depth texture (some drivers have issues with 1x1)
        this.gl.texImage2D(
            this.gl.TEXTURE_2D, 
            0, 
            this.gl.DEPTH_COMPONENT24,
            4, 
            4, 
            0,
            this.gl.DEPTH_COMPONENT, 
            this.gl.UNSIGNED_INT,
            null
        );
        
        // Set required parameters for sampler2DShadow
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_COMPARE_MODE, this.gl.COMPARE_REF_TO_TEXTURE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_COMPARE_FUNC, this.gl.LEQUAL);
        
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        
        this.dummyShadowTexture = texture;
        this.textures.add(texture);
        
        return texture;
    }

    getShadowMapShader(): WebGLProgram {
        const vertexShader = `#version 300 es
        precision highp float;
        precision highp int;
        
        layout(location = 0) in vec3 position;
        layout(location = 3) in uvec4 joints;
        layout(location = 4) in vec4 weights;

        const int MAX_BONES = 256;

        layout(std140) uniform BoneData {
            mat4 u_BoneMatrices[MAX_BONES];
        };

        uniform mat4 u_Model;
        uniform mat4 u_NodeMatrix;
        uniform mat4 u_LightViewProjection;
        uniform bool u_UseSkinning;

        void main() {
            // Set position to the vertex position
            vec3 nPosition = position;
            
            if (u_UseSkinning) {
                vec4 skinVertex = vec4(0.0);
                for (int i = 0; i < 4; i++) {
                    uint joint = joints[i];
                    skinVertex += weights[i] * (u_BoneMatrices[joint] * vec4(position, 1.0));
                }
                gl_Position = u_LightViewProjection * u_Model * skinVertex;
            } else {
                gl_Position = u_LightViewProjection * u_Model * u_NodeMatrix * vec4(nPosition, 1.0);
            }
        }`;

        const fragmentShader = `#version 300 es
        precision highp float;
        
        void main() {
            // No color output needed for shadow map
            // The depth is automatically written
        }`;

        const program = this.shaderSystem.createProgram(vertexShader, fragmentShader, 'shadowmap');
        this.linkUniformBlocks(program);
        return program;
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

