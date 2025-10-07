import { mat4, vec3 } from 'gl-matrix';
import type { Light, DirectionalLight, SpotLight, IGPUResourceManager } from './types';
import type { InstanceManager } from './InstanceManager';

const SHADOW_MAP_CONSTANTS = {
    MIN_RESOLUTION: 128,
    MAX_RESOLUTION: 4096,
    MAX_SHADOW_MAPS: 8
} as const;

export enum LightType {
    DIRECTIONAL = 'directional',
    SPOT = 'spot',
    POINT = 'point'
    // Add others as needed
}

/**
 * Defines the filtering mode for shadow map sampling.
 * NEAREST provides harder shadows with more aliasing but better performance.
 * LINEAR provides softer shadow edges but may introduce some artifacts.
 */
export enum ShadowFilterMode {
    NEAREST = 'NEAREST',
    LINEAR = 'LINEAR'
}

/**
 * Defines the format and precision of the shadow map texture.
 * DEPTH24_UINT - Standard 24-bit depth format, good balance of precision and memory
 * DEPTH32F_FLOAT - 32-bit float depth format, highest precision but more memory usage
 */
export enum ShadowMapFormat {
    DEPTH24_UINT = 'DEPTH24_UINT',
    DEPTH32F_FLOAT = 'DEPTH32F_FLOAT'
}

/**
 * Internal data structure for storing shadow map resources and state.
 */
interface ShadowMapData {
    /** The depth texture used for shadow mapping */
    texture: WebGLTexture;
    /** Reference to the light casting this shadow */
    light: Light;
    /** Framebuffer used for rendering the shadow map */
    framebuffer: WebGLFramebuffer;
    /** Matrix transforming world space to light space */
    view: mat4;
    /** Matrix transforming world space to light space */
    projection: mat4;
}

/**
 * Represents the axis-aligned bounding box of the scene in world space.
 * Used to calculate the shadow map frustum that encompasses all visible objects.
 */
interface SceneBounds {
    /** Minimum point of the bounding box in world space */
    min: vec3;
    /** Maximum point of the bounding box in world space */
    max: vec3;
}

/**
 * Manages shadow map generation and resources for a scene's lights.
 * Handles creation, updating, and rendering of shadow maps for different light types.
 * Currently supports directional lights, with architecture ready for spot and point lights.
 */
export class ShadowMapManager {
    private gpuResourceManager: IGPUResourceManager;
    private gl: WebGL2RenderingContext;
    private shadowMaps: Map<number, ShadowMapData>;
    private filterMode: ShadowFilterMode;
    private format: ShadowMapFormat;
    private resolution: number = 4096;
    private sceneBounds: SceneBounds | null;
    private shadowMapShader: WebGLProgram;
    
    // New properties for light-to-shadowmap associations
    private lightToShadowMapIndex: Map<number, number>; // lightId -> shadowMapIndex (0-7)
    private shadowMapIndexToLightId: Map<number, number>; // shadowMapIndex -> lightId
    private activeShadowMaps: Set<number>; // Set of active shadowMapIndices (0-7)
    private nextAvailableShadowMapIndex: number = 0;
    
    // Debug flag
    private static DEBUG_SHADOWS = false; // Set to true to enable debug logging
    /** Default scene bounds used when no specific bounds are set */
    private static readonly DEFAULT_BOUNDS: SceneBounds = {
        min: vec3.fromValues(-1000, -1000, -1000),
        max: vec3.fromValues(1000, 1000, 1000)
    };
    
    private readonly matrixPool: {
        view: mat4;
        projection: mat4;
    } = {
        view: mat4.create(),
        projection: mat4.create()
    };
    
    /**
     * Creates a new ShadowMapManager instance.
     * @param gl - The WebGL2 context to use for rendering
     */
    constructor(gl: WebGL2RenderingContext, gpuResourceManager: IGPUResourceManager) {
        this.gpuResourceManager = gpuResourceManager;
        this.gl = gl;
        this.shadowMaps = new Map();
        this.filterMode = ShadowFilterMode.LINEAR; // Default to linear for better quality
        this.format = ShadowMapFormat.DEPTH24_UINT; // Default to 24-bit depth
        this.sceneBounds = ShadowMapManager.DEFAULT_BOUNDS;
        this.shadowMapShader = this.gpuResourceManager.getShadowMapShader();
        
        // Initialize new tracking properties
        this.lightToShadowMapIndex = new Map();
        this.shadowMapIndexToLightId = new Map();
        this.activeShadowMaps = new Set();
        this.nextAvailableShadowMapIndex = 0;
        
    }

    /**
     * Initializes the shadow map manager with the specified settings.
     * @param resolution - The resolution of the shadow maps in pixels
     * @param filterMode - The filtering mode to use for shadow sampling (default: LINEAR)
     * @param format - The format to use for shadow maps (default: DEPTH24_UINT)
     */
    initialize(
        resolution: number = 4096, 
        filterMode: ShadowFilterMode = ShadowFilterMode.LINEAR,
        format: ShadowMapFormat = ShadowMapFormat.DEPTH24_UINT
    ): void {
        if (!Number.isInteger(Math.log2(resolution)) || 
            resolution < SHADOW_MAP_CONSTANTS.MIN_RESOLUTION || 
            resolution > SHADOW_MAP_CONSTANTS.MAX_RESOLUTION) {
            throw new Error(`Shadow map resolution must be a power of 2 between ${SHADOW_MAP_CONSTANTS.MIN_RESOLUTION} and ${SHADOW_MAP_CONSTANTS.MAX_RESOLUTION}`);
        }
        this.resolution = resolution;
        this.filterMode = filterMode;
        this.format = format;
    }

    /**
     * Updates the scene bounds used for shadow frustum calculations.
     * @param bounds - The new scene bounds in world space
     * @throws Error if bounds are invalid
     */
    setSceneBounds(bounds: SceneBounds): void {
        this.validateBounds(bounds);
        
        // Create a copy to prevent external modification
        this.sceneBounds = {
            min: vec3.clone(bounds.min),
            max: vec3.clone(bounds.max)
        };
    }

    /**
     * Gets the current scene bounds.
     * @returns A copy of the current scene bounds to prevent external modification
     */
    getSceneBounds(): SceneBounds {
        const bounds = this.sceneBounds || ShadowMapManager.DEFAULT_BOUNDS;
        return {
            min: vec3.clone(bounds.min),
            max: vec3.clone(bounds.max)
        };
    }

    /**
     * Validates scene bounds for correctness.
     * @param bounds - The bounds to validate
     * @throws Error if bounds are invalid (not finite numbers, min > max, etc.)
     * @private
     */
    private validateBounds(bounds: SceneBounds): void {
        // Check if vectors are valid
        if (!bounds.min || !bounds.max || 
            bounds.min.length !== 3 || bounds.max.length !== 3) {
            throw new Error('Scene bounds must have valid min and max vectors');
        }

        // Check if min is actually less than max for each component
        for (let i = 0; i < 3; i++) {
            if (bounds.min[i] > bounds.max[i]) {
                throw new Error(`Scene bounds min[${i}] must be less than or equal to max[${i}]`);
            }
        }

        // Check for invalid values
        const checkVector = (v: vec3, name: string) => {
            for (let i = 0; i < 3; i++) {
                if (!Number.isFinite(v[i])) {
                    throw new Error(`Scene bounds ${name}[${i}] must be a finite number`);
                }
            }
        };
        checkVector(bounds.min, 'min');
        checkVector(bounds.max, 'max');
    }

    /**
     * Expands the scene bounds to include the given point.
     * Useful for incrementally building bounds from scene geometry.
     * @param point - The point to include in world space
     */
    expandBounds(point: vec3): void {
        if (!this.sceneBounds) {
            this.sceneBounds = {
                min: vec3.clone(point),
                max: vec3.clone(point)
            };
            return;
        }

        // Expand bounds to include the point
        for (let i = 0; i < 3; i++) {
            this.sceneBounds.min[i] = Math.min(this.sceneBounds.min[i], point[i]);
            this.sceneBounds.max[i] = Math.max(this.sceneBounds.max[i], point[i]);
        }
    }

    /**
     * Resets scene bounds to null, forcing use of default bounds until new bounds are set.
     */
    resetBounds(): void {
        this.sceneBounds = null;
    }

    /**
     * Creates shadow map resources for a light.
     * Sets up the depth texture, framebuffer, and other WebGL resources needed for shadow mapping.
     * 
     * @param light - The light to create shadow map resources for
     * @returns The created shadow map resources
     * @throws Error if framebuffer initialization fails
     * @private
     */
    private createShadowMapResources(light: Light): ShadowMapData {
        // Store current WebGL state
        const currentTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
        const currentFramebuffer = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING);
        const currentDepthTest = this.gl.getParameter(this.gl.DEPTH_TEST);
        const currentDepthFunc = this.gl.getParameter(this.gl.DEPTH_FUNC);
        const currentColorMask = this.gl.getParameter(this.gl.COLOR_WRITEMASK);

        try {
            // Create resources
            const texture = this.createGLResource(() => this.gl.createTexture(), 'texture');
            const framebuffer = this.createGLResource(() => this.gl.createFramebuffer(), 'framebuffer');
            
            if (ShadowMapManager.DEBUG_SHADOWS) {
                // Create a unique identifier for this texture
                const textureId = performance.now().toString(36).substr(2, 5);
                (texture as any).__debugId = textureId;
            }

            // Setup texture
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

            // Configure format based on settings
            const format = this.format === ShadowMapFormat.DEPTH32F_FLOAT
                ? {
                    internalFormat: this.gl.DEPTH_COMPONENT32F,
                    format: this.gl.DEPTH_COMPONENT,
                    type: this.gl.FLOAT
                }
                : {
                    internalFormat: this.gl.DEPTH_COMPONENT24,
                    format: this.gl.DEPTH_COMPONENT,
                    type: this.gl.UNSIGNED_INT
                };

            this.gl.texImage2D(
                this.gl.TEXTURE_2D, 0, format.internalFormat,
                this.resolution, this.resolution, 0,
                format.format, format.type, null
            );

            // Set texture parameters
            const filter = this.filterMode === ShadowFilterMode.LINEAR ? this.gl.LINEAR : this.gl.NEAREST;
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, filter);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, filter);
            
            // Use CLAMP_TO_EDGE for shadow edges
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            
            // Set up comparison mode for shadow sampling
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_COMPARE_MODE, this.gl.COMPARE_REF_TO_TEXTURE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_COMPARE_FUNC, this.gl.LEQUAL);

            // Setup framebuffer
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
            this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.TEXTURE_2D, texture, 0);
            
            // Configure framebuffer
            this.gl.drawBuffers([this.gl.NONE]);
            this.gl.readBuffer(this.gl.NONE);

            // Verify framebuffer is complete
            const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
            if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
                this.gl.deleteTexture(texture);
                this.gl.deleteFramebuffer(framebuffer);
                throw new Error('Framebuffer initialization failed: ' + status);
            }

            // Reset bindings
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

            return { 
                texture, 
                light, 
                framebuffer,
                view: mat4.create(), 
                projection: mat4.create() 
            };
        } finally {
            // Restore all WebGL state
            this.gl.bindTexture(this.gl.TEXTURE_2D, currentTexture);
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, currentFramebuffer);
            if (currentDepthTest) {
                this.gl.enable(this.gl.DEPTH_TEST);
            } else {
                this.gl.disable(this.gl.DEPTH_TEST);
            }
            this.gl.depthFunc(currentDepthFunc);
            this.gl.colorMask(
                currentColorMask[0],
                currentColorMask[1],
                currentColorMask[2],
                currentColorMask[3]
            );
        }
    }

    /**
     * Calculates the view-projection matrix for a directional light.
     * Creates an orthographic projection that encompasses the entire scene bounds
     * and positions the view matrix based on the light's direction.
     * 
     * @param light - The directional light to calculate the matrix for
     * @param bounds - The scene bounds to encompass in the shadow map
     * @returns The calculated view-projection matrix for shadow mapping
     * @private
     */
    private calculateDirectionalLightMatrix(light: DirectionalLight, bounds: SceneBounds): { view: mat4; projection: mat4 } {
        // Use pool matrices directly
        mat4.identity(this.matrixPool.view);
        mat4.identity(this.matrixPool.projection);
        this.validateBounds(bounds);  // Validate bounds before using
        
        const center = vec3.create();
        const size = vec3.create();

        // Calculate scene center and size
        vec3.add(center, bounds.max, bounds.min);
        vec3.scale(center, center, 0.5);
        vec3.sub(size, bounds.max, bounds.min);

        // Calculate the maximum scene dimension
        const maxSize = Math.max(size[0], size[1], size[2]);

        // Create view matrix looking from light direction
        const lightDir = vec3.create();
        // Negate the light direction to get the correct shadow direction
        vec3.negate(lightDir, light.direction);
        
        const lightPos = vec3.create();
        vec3.scaleAndAdd(lightPos, center, lightDir, maxSize);

        const up = Math.abs(lightDir[1]) > 0.99 ? vec3.fromValues(1, 0, 0) : vec3.fromValues(0, 1, 0);
        mat4.lookAt(
            this.matrixPool.view,
            lightPos,
            center,
            up
        );

        // Create orthographic projection that encompasses the scene
        mat4.ortho(
            this.matrixPool.projection,
            -maxSize/2, maxSize/2,
            -maxSize/2, maxSize/2,
            0.1, maxSize * 2
        );
        
        return { 
            view: mat4.clone(this.matrixPool.view), 
            projection: mat4.clone(this.matrixPool.projection) 
        };
    }

    /**
     * Calculates the view-projection matrix for a spot light.
     * Creates a perspective projection based on the spot light's angle and position.
     * 
     * @param light - The spot light to calculate the matrix for
     * @param bounds - The scene bounds to encompass in the shadow map
     * @returns The calculated view-projection matrix for shadow mapping
     * @private
     */
    private calculateSpotLightMatrix(light: SpotLight, bounds: SceneBounds): { view: mat4; projection: mat4 } {
        // Use pool matrices directly
        mat4.identity(this.matrixPool.view);
        mat4.identity(this.matrixPool.projection);
        this.validateBounds(bounds);

        // Calculate scene center for reference
        const center = vec3.create();
        vec3.add(center, bounds.max, bounds.min);
        vec3.scale(center, center, 0.5);
        
        const size = vec3.create();
        vec3.sub(size, bounds.max, bounds.min);
        const maxSize = Math.max(size[0], size[1], size[2]);

        // Normalize the light direction
        const normalizedDir = vec3.create();
        vec3.normalize(normalizedDir, light.direction);

        // Calculate target point using light direction - look towards scene center for better coverage
        const target = vec3.create();
        const sceneDistance = vec3.distance(light.position, center);
        const lookDistance = Math.max(sceneDistance, maxSize); // Look at least scene-distance or scene-size away
        vec3.scaleAndAdd(target, light.position, normalizedDir, lookDistance);

        // Calculate up vector ensuring it's perpendicular to light direction
        const up = vec3.fromValues(0, 1, 0); // Default up vector
        const right = vec3.create();
        vec3.cross(right, normalizedDir, up);
        
        // If light direction is too close to up vector, use a different up vector
        if (vec3.length(right) < 0.001) {
            vec3.set(up, 0, 0, 1);
            vec3.cross(right, normalizedDir, up);
        }
        
        vec3.normalize(right, right);
        vec3.cross(up, right, normalizedDir);
        vec3.normalize(up, up);

        // Create view matrix looking from light position along light direction
        mat4.lookAt(
            this.matrixPool.view,
            light.position,
            target,
            up
        );

        // Use fixed near/far planes relative to light position
        const nearPlane = 0.1;
        const farPlane = vec3.distance(light.position, bounds.min) * 2;

        // Convert cosAngle to radians for perspective matrix
        const angleInRadians = Math.acos(light.cosAngle) * 2; // Double for full cone angle
        
        // Create perspective projection
        mat4.perspective(
            this.matrixPool.projection,
            angleInRadians,
            1.0, // Keep square for shadow map
            nearPlane,
            farPlane
        );

        if (ShadowMapManager.DEBUG_SHADOWS) {
            console.log(`[ShadowMapManager] Spot light matrix calc - pos: [${light.position[0].toFixed(1)}, ${light.position[1].toFixed(1)}, ${light.position[2].toFixed(1)}], dir: [${light.direction[0].toFixed(2)}, ${light.direction[1].toFixed(2)}, ${light.direction[2].toFixed(2)}], target: [${target[0].toFixed(1)}, ${target[1].toFixed(1)}, ${target[2].toFixed(1)}], angle: ${(angleInRadians * 180 / Math.PI).toFixed(1)}°`);
        }

        return { 
            view: mat4.clone(this.matrixPool.view), 
            projection: mat4.clone(this.matrixPool.projection) 
        };
    }

    /**
     * Updates the shadow map data for a light, creating resources if needed.
     * Should be called when light properties change or scene bounds are updated.
     * For directional lights, updates the view-projection matrix based on current bounds.
     * 
     * @param lightId - Unique identifier for the light
     * @param light - The light to update shadow map data for
     */
    updateShadowMap(lightId: number, light: Light): void {
        // Check if light should cast shadows
        if (!light.enabled || !light.castShadows) {
            // If light exists but shouldn't cast shadows, remove it
            if (this.shadowMaps.has(lightId)) {
                if (ShadowMapManager.DEBUG_SHADOWS) {
                    console.log(`[ShadowMapManager] Removing shadow map for light ${lightId} (enabled: ${light.enabled}, castShadows: ${light.castShadows})`);
                }
                this.removeShadowMap(lightId);
            }
            return;
        }
        
        if (light.type === LightType.DIRECTIONAL && vec3.len(light.direction) === 0) {
            if (ShadowMapManager.DEBUG_SHADOWS) {
                console.log(`[ShadowMapManager] Skipping light ${lightId}: directional light has zero-length direction`);
            }
            return;
        }

        // Assign shadow map index if needed
        const shadowMapIndex = this.assignShadowMapIndex(lightId);
        if (shadowMapIndex === -1) {
            // Cannot assign shadow map (max limit reached)
            return;
        }
        
        // Get or create shadow map resources
        let shadowData = this.shadowMaps.get(lightId);
        if (!shadowData) {
            if (ShadowMapManager.DEBUG_SHADOWS) {
                console.log(`[ShadowMapManager] Creating new shadow map resources for light ${lightId} (type: ${light.type})`);
            }
            shadowData = this.createShadowMapResources(light);
            this.shadowMaps.set(lightId, shadowData);
            
            if (ShadowMapManager.DEBUG_SHADOWS) {
                const textureId = (shadowData.texture as any).__debugId || 'unknown';
                console.log(`[ShadowMapManager] Stored shadow map for light ${lightId} with texture ID ${textureId}`);
            }
        } else {
            if (ShadowMapManager.DEBUG_SHADOWS) {
                const textureId = (shadowData.texture as any).__debugId || 'unknown';
                console.log(`[ShadowMapManager] Reusing existing shadow map for light ${lightId} with texture ID ${textureId}`);
            }
        }

        // Update light reference in case it changed
        shadowData.light = light;

        // Get current bounds
        const bounds = this.getSceneBounds();

        // Calculate view-projection matrix based on light type
        if (light.type === LightType.DIRECTIONAL) {
            const matrices = this.calculateDirectionalLightMatrix(light, bounds);
            shadowData.view = matrices.view;
            shadowData.projection = matrices.projection;
        } else if (light.type === LightType.SPOT) {
            const matrices = this.calculateSpotLightMatrix(light, bounds);
            shadowData.view = matrices.view;
            shadowData.projection = matrices.projection;
        }
        // Future light types will be handled here
        // else if (light.type === 'point') { ... }
    }

    /**
     * Changes the filtering mode for all shadow maps.
     * Updates existing shadow maps to use the new filtering mode.
     * No-op if the new mode is the same as the current mode.
     * 
     * @param mode - The new filtering mode to use
     */
    setFilterMode(mode: ShadowFilterMode): void {
        if (this.filterMode === mode) return;
        
        const currentTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
        
        try {
            this.filterMode = mode;
            for (const [_, data] of this.shadowMaps) {
                this.gl.bindTexture(this.gl.TEXTURE_2D, data.texture);
                const filter = mode === ShadowFilterMode.LINEAR ? this.gl.LINEAR : this.gl.NEAREST;
                this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, filter);
                this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, filter);
            }
        } finally {
            this.gl.bindTexture(this.gl.TEXTURE_2D, currentTexture);
        }
    }

    /**
     * Cleans up all shadow map resources.
     * Deletes textures, framebuffers, and renderbuffers.
     * Should be called when the shadow map manager is no longer needed.
     */
    cleanup(): void {
        for (const [_, data] of this.shadowMaps) {
            this.cleanupGLResources(data);
        }
        this.shadowMaps.clear();
        
        // Clear association tracking
        this.lightToShadowMapIndex.clear();
        this.shadowMapIndexToLightId.clear();
        this.activeShadowMaps.clear();
        this.nextAvailableShadowMapIndex = 0;
    }

    renderInstances(instanceManager: InstanceManager, shadowData: ShadowMapData): void {
        for (const [modelId, instanceGroup] of instanceManager.instancesByModel) {
            instanceManager.renderShadowMapInstances(modelId, instanceGroup, { view: shadowData.view, projection: shadowData.projection });
        }
    }

    /**
     * Internal method that renders a shadow map without managing GL state.
     * Used when rendering multiple shadow maps in a frame.
     * 
     * @param lightId - The ID of the light to render shadows for
     * @param instanceManager - The instance manager that will render the scene
     * @throws Error if the shadow map resources aren't initialized
     * @private
     */
    private renderShadowMapInternal(lightId: number, instanceManager: InstanceManager): void {
        const shadowData = this.shadowMaps.get(lightId);
        if (!shadowData) {
            throw new Error(`No shadow map data found for light ${lightId}`);
        }

        // Set up shadow rendering state (no try/finally needed, state is managed at frame level)
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, shadowData.framebuffer);
        this.gl.viewport(0, 0, this.resolution, this.resolution);
        
        if (ShadowMapManager.DEBUG_SHADOWS) {
            const textureId = (shadowData.texture as any).__debugId || 'unknown';
            console.log(`[ShadowMapManager] Rendering shadow map for light ${lightId}, using texture ID ${textureId}, framebuffer ${shadowData.framebuffer}`);
        }

        this.gl.disable(this.gl.SCISSOR_TEST);

        // Clear depth buffer
        this.gl.clearDepth(1.0);
        this.gl.clear(this.gl.DEPTH_BUFFER_BIT);

        // Set up depth test state
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LESS);

        // Disable color writing as we only need depth
        this.gl.colorMask(false, false, false, false);

        // Render the scene from light's perspective
        this.renderInstances(instanceManager, shadowData);
    }

    /**
     * Public method that renders a single shadow map with GL state management.
     * Handles all the setup, rendering, and cleanup for shadow map generation.
     * Preserves WebGL state and restores it after rendering.
     * 
     * @param lightId - The ID of the light to render shadows for
     * @param instanceManager - The instance manager that will render the scene
     * @throws Error if the shadow map resources aren't initialized
     */
    renderShadowMap(lightId: number, instanceManager: InstanceManager): void {
        // Check if the shadow map exists and is enabled
        const shadowData = this.shadowMaps.get(lightId);
        if (!shadowData || !shadowData.light.enabled) {
            return; // Skip disabled or non-existent shadow maps
        }
        
        // Render shadow map directly - state management should be handled at frame level
        this.renderShadowMapInternal(lightId, instanceManager);
    }

    /**
     * Gets the shadow map data needed for rendering with shadows.
     * Should be called during main render pass to get the shadow information.
     * Returns null if the light is disabled or no shadow map exists.
     * 
     * @param lightId - The ID of the light to get shadow data for
     * @returns Object containing the shadow map texture and its view-projection matrix, or null if no shadow map exists
     */
    getShadowData(lightId: number): { texture: WebGLTexture; view: mat4; projection: mat4 } | null {
        const shadowData = this.shadowMaps.get(lightId);
        if (!shadowData || !shadowData.light.enabled) {
            return null;
        }
        return {
            texture: shadowData.texture,
            view: mat4.clone(shadowData.view),
            projection: mat4.clone(shadowData.projection)
        };
    }

    private createGLResource<T>(creator: () => T | null, resourceName: string): T {
        const resource = creator();
        if (!resource) {
            throw new Error(`Failed to create WebGL ${resourceName}`);
        }
        return resource;
    }

    /**
     * Changes the resolution of all shadow maps.
     * Recreates all shadow maps with the new resolution.
     */
    setResolution(resolution: number): void {
        if (!Number.isInteger(Math.log2(resolution)) || 
            resolution < SHADOW_MAP_CONSTANTS.MIN_RESOLUTION || 
            resolution > SHADOW_MAP_CONSTANTS.MAX_RESOLUTION) {
            throw new Error(`Shadow map resolution must be a power of 2 between ${SHADOW_MAP_CONSTANTS.MIN_RESOLUTION} and ${SHADOW_MAP_CONSTANTS.MAX_RESOLUTION}`);
        }

        // Store old shadow maps
        const oldMaps = new Map(this.shadowMaps);
        
        // Update resolution
        this.resolution = resolution;
        
        // Recreate all shadow maps with new resolution
        this.shadowMaps.clear();
        for (const [lightId, data] of oldMaps) {
            this.cleanupGLResources(data);
            if (data.light.enabled) {
                this.updateShadowMap(lightId, data.light);
            }
        }
    }

    /**
     * Gets the current shadow map resolution.
     * @returns The current resolution in pixels
     */
    getResolution(): number {
        return this.resolution;
    }

    /**
     * Removes shadow map resources for a specific light.
     * @param lightId - ID of the light whose shadow map should be removed
     */
    removeShadowMap(lightId: number): void {
        const shadowData = this.shadowMaps.get(lightId);
        if (shadowData) {
            this.cleanupGLResources(shadowData);
            this.shadowMaps.delete(lightId);
            // Release the shadow map index association
            this.releaseShadowMapIndex(lightId);
        }
    }

    private cleanupGLResources(data: ShadowMapData): void {
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.deleteTexture(data.texture);
        this.gl.deleteFramebuffer(data.framebuffer);
    }

    /**
     * Begins a shadow map rendering frame.
     * Caches GL state once for the entire shadow rendering pass.
     */
    private beginShadowMapFrame(): void {
        // Cache GL state once at the beginning of the frame
        this.gpuResourceManager.gpuResourceCache.cacheShadowMapState();
    }

    /**
     * Ends a shadow map rendering frame.
     * Restores the cached GL state after all shadow maps are rendered.
     */
    private endShadowMapFrame(): void {
        // Restore GL state once at the end of the frame
        this.gpuResourceManager.gpuResourceCache.restoreShadowMapState();
    }

    /**
     * Renders shadow maps for all enabled lights.
     * Optimized to bypass entire shadow stage when no lights cast shadows.
     * @param instanceManager - The instance manager that will render the scene
     * @param lights - Optional array of lights to check for shadow casting (for early exit optimization)
     */
    renderAllShadowMaps(instanceManager: InstanceManager, lights?: Light[]): void {
        // Ultra-fast early exit: if lights array is provided, check if ANY light casts shadows
        // This avoids even checking the shadowMaps collection if no lights will cast shadows
        if (lights && !this.hasAnyShadowCastingLights(lights)) {
            return; // No lights cast shadows - skip EVERYTHING including state checks
        }

        // Early exit if no shadow maps have been created
        if (this.shadowMaps.size === 0) {
            return; // Skip entire shadow map stage including state store/restore
        }

        // Check if any enabled lights need rendering
        let hasEnabledShadows = false;
        for (const [, shadowData] of this.shadowMaps) {
            if (shadowData.light.enabled && shadowData.light.castShadows) {
                hasEnabledShadows = true;
                break;
            }
        }

        // Skip if no enabled shadow-casting lights
        if (!hasEnabledShadows) {
            return; // Bypass shadow state store/restore entirely
        }

        // Cache GL state once for all shadow maps
        this.beginShadowMapFrame();

        try {
            // For each light that casts shadows
            for (const [lightId, shadowData] of this.shadowMaps) {
                if (shadowData.light.enabled && shadowData.light.castShadows) {
                    this.renderShadowMapInternal(lightId, instanceManager);
                }
            }
        } finally {
            // Restore GL state once after all shadow maps
            this.endShadowMapFrame();
        }
    }

    /**
     * Checks if any lights in the array have shadows enabled.
     * This is a fast check to determine if shadow rendering is needed at all.
     * @param lights - Array of lights to check
     * @returns true if at least one enabled light has castShadows set to true
     */
    hasAnyShadowCastingLights(lights: Light[]): boolean {
        for (const light of lights) {
            if (light.enabled && light.castShadows) {
                return true;
            }
        }
        return false;
    }

    /**
     * Updates all shadow maps using the provided array of lights.
     * Iterates over the lights and updates the shadow map for each enabled light that casts shadows.
     * @param lights - Array of lights to update shadow maps for
     */
    updateAllShadowMaps(lights: Light[]): void {
        lights.forEach((light, index) => {
            // updateShadowMap now handles the castShadows check internally
            this.updateShadowMap(index, light);
        });
    }

    /**
     * Renders a shadow map for debugging purposes.
     * @param lightId - The ID of the light to render the shadow map for
     */
    renderShadowMapDebug(lightId: number): void {
        const shadowData = this.shadowMaps.get(lightId);
        if (!shadowData) {
            throw new Error(`No shadow map data found for light ${lightId}`);
        }

        // Cache GL state for debug rendering (called independently from frame-level management)
        this.beginShadowMapFrame();

        try {
        // Set up state for debug rendering
        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.disable(this.gl.BLEND);
        this.gl.viewport(0, 0, this.resolution, this.resolution);

        // Check if the shader program is already created
        if (!this.debugShaderProgram) {
            const vertexShaderSource = `#version 300 es
            in vec2 a_position;
            out vec2 v_texCoord;
            void main() {
                v_texCoord = a_position * 0.5 + 0.5;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }`;

            const fragmentShaderSource = `#version 300 es
            precision highp float;
            precision highp sampler2DShadow;
            
            in vec2 v_texCoord;
            uniform sampler2DShadow u_depthTexture;
            out vec4 outColor;
            
            void main() {
                // Compare with a fixed ref value = 0.5 for demonstration.
                // Values in the texture < 0.5 become "1," others become "0," possibly plus PCF if filters are set to LINEAR.
                float shadowResult = texture(u_depthTexture, vec3(v_texCoord, 0.9999999999999999));
                outColor = vec4(vec3(shadowResult), 1.0);
            }`;

            this.debugShaderProgram = this.createShaderProgram(vertexShaderSource, fragmentShaderSource);
        }

        this.gl.useProgram(this.debugShaderProgram);

        // Bind the shadow map texture
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, shadowData.texture);
        const texLocation = this.gl.getUniformLocation(this.debugShaderProgram, 'u_depthTexture');
        if (texLocation === null) {
            throw new Error('Could not find u_depthTexture uniform');
        }
        this.gl.uniform1i(texLocation, 0);

        // Create and set up vertex buffer
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        const positions = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1,
        ]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.debugShaderProgram, 'a_position');
        if (positionLocation === -1) {
            throw new Error('Could not find a_position attribute');
        }
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);

        // Draw the quad
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        // Clean up
        this.gl.disableVertexAttribArray(positionLocation);
        this.gl.deleteBuffer(positionBuffer);
        
        // Restore comparison mode
        this.gl.bindTexture(this.gl.TEXTURE_2D, shadowData.texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_COMPARE_MODE, this.gl.COMPARE_REF_TO_TEXTURE);
        
        } finally {
            // Restore GL state
            this.endShadowMapFrame();
        }
    }

    /**
     * Helper method to create a shader program.
     * @param vertexSource - The vertex shader source code
     * @param fragmentSource - The fragment shader source code
     * @returns The created shader program
     */
    private createShaderProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource);
        const program = this.gl.createProgram();
        if (!program) {
            throw new Error('Failed to create shader program');
        }
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error('Failed to link program: ' + this.gl.getProgramInfoLog(program));
        }
        this.gl.deleteShader(vertexShader);
        this.gl.deleteShader(fragmentShader);
        return program;
    }

    /**
     * Helper method to compile a shader.
     * @param type - The shader type (VERTEX_SHADER or FRAGMENT_SHADER)
     * @param source - The shader source code
     * @returns The compiled shader
     */
    private compileShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type);
        if (!shader) {
            throw new Error('Failed to create shader');
        }
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error('Failed to compile shader: ' + this.gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    // Add a property to cache the shader program
    private debugShaderProgram: WebGLProgram | null = null;

    /**
     * Enable or disable debug logging for shadow map operations.
     * @param enabled - Whether to enable debug logging
     */
    static setDebugLogging(enabled: boolean): void {
        ShadowMapManager.DEBUG_SHADOWS = enabled;
        console.log(`[ShadowMapManager] Debug logging ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Assigns a shadow map index to a light that casts shadows.
     * @param lightId - The ID of the light
     * @returns The shadow map index (0-7) or -1 if no slots available
     */
    private assignShadowMapIndex(lightId: number): number {
        if (this.lightToShadowMapIndex.has(lightId)) {
            const existingIndex = this.lightToShadowMapIndex.get(lightId)!;
            if (ShadowMapManager.DEBUG_SHADOWS) {
                console.log(`[ShadowMapManager] Light ${lightId} already has shadow map index ${existingIndex}`);
            }
            return existingIndex;
        }

        if (this.activeShadowMaps.size >= SHADOW_MAP_CONSTANTS.MAX_SHADOW_MAPS) {
            console.warn(`Cannot assign shadow map to light ${lightId}: maximum shadow maps (${SHADOW_MAP_CONSTANTS.MAX_SHADOW_MAPS}) reached`);
            return -1;
        }

        // Find the next available shadow map index
        let shadowMapIndex = this.nextAvailableShadowMapIndex;
        while (this.activeShadowMaps.has(shadowMapIndex) && shadowMapIndex < SHADOW_MAP_CONSTANTS.MAX_SHADOW_MAPS) {
            shadowMapIndex++;
        }

        if (shadowMapIndex >= SHADOW_MAP_CONSTANTS.MAX_SHADOW_MAPS) {
            // Wrap around and search from 0
            shadowMapIndex = 0;
            while (this.activeShadowMaps.has(shadowMapIndex) && shadowMapIndex < SHADOW_MAP_CONSTANTS.MAX_SHADOW_MAPS) {
                shadowMapIndex++;
            }
        }

        if (shadowMapIndex >= SHADOW_MAP_CONSTANTS.MAX_SHADOW_MAPS) {
            console.warn(`Cannot assign shadow map to light ${lightId}: no available shadow map slots`);
            return -1;
        }

        // Assign the shadow map index
        this.lightToShadowMapIndex.set(lightId, shadowMapIndex);
        this.shadowMapIndexToLightId.set(shadowMapIndex, lightId);
        this.activeShadowMaps.add(shadowMapIndex);
        this.nextAvailableShadowMapIndex = (shadowMapIndex + 1) % SHADOW_MAP_CONSTANTS.MAX_SHADOW_MAPS;

        if (ShadowMapManager.DEBUG_SHADOWS) {
            console.log(`[ShadowMapManager] Assigned shadow map index ${shadowMapIndex} to light ${lightId}. Active shadow maps: [${Array.from(this.activeShadowMaps).sort().join(', ')}]`);
        }

        return shadowMapIndex;
    }

    /**
     * Releases a shadow map index when a light no longer casts shadows.
     * @param lightId - The ID of the light
     */
    private releaseShadowMapIndex(lightId: number): void {
        const shadowMapIndex = this.lightToShadowMapIndex.get(lightId);
        if (shadowMapIndex !== undefined) {
            this.lightToShadowMapIndex.delete(lightId);
            this.shadowMapIndexToLightId.delete(shadowMapIndex);
            this.activeShadowMaps.delete(shadowMapIndex);
            
            if (ShadowMapManager.DEBUG_SHADOWS) {
                console.log(`[ShadowMapManager] Released shadow map index ${shadowMapIndex} from light ${lightId}. Active shadow maps: [${Array.from(this.activeShadowMaps).sort().join(', ')}]`);
            }
        }
    }

    /**
     * Gets the shadow map index for a given light ID.
     * @param lightId - The ID of the light
     * @returns The shadow map index (0-7) or -1 if not found
     */
    getLightShadowMapIndex(lightId: number): number {
        return this.lightToShadowMapIndex.get(lightId) ?? -1;
    }

    /**
     * Gets the light ID for a given shadow map index.
     * @param shadowMapIndex - The shadow map index (0-7)
     * @returns The light ID or -1 if not found
     */
    getShadowMapLightId(shadowMapIndex: number): number {
        return this.shadowMapIndexToLightId.get(shadowMapIndex) ?? -1;
    }

    /**
     * Gets all active shadow map indices.
     * @returns Array of active shadow map indices (0-7)
     */
    getActiveShadowMapIndices(): number[] {
        return Array.from(this.activeShadowMaps).sort();
    }

    /**
     * Gets the mapping of light IDs to shadow map indices for all active shadow maps.
     * @returns Map of lightId -> shadowMapIndex
     */
    getLightToShadowMapMapping(): Map<number, number> {
        return new Map(this.lightToShadowMapIndex);
    }
    
    /**
     * Checks if any lights are currently casting shadows.
     * Useful for optimization decisions and debugging.
     * @returns true if at least one enabled light is casting shadows
     */
    hasActiveShadows(): boolean {
        if (this.shadowMaps.size === 0) {
            return false;
        }
        
        for (const [, shadowData] of this.shadowMaps) {
            if (shadowData.light.enabled) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Gets shadow data by shadow map index instead of light ID.
     * @param shadowMapIndex - The shadow map index (0-7)
     * @returns Shadow data or null if not found
     */
    getShadowDataByIndex(shadowMapIndex: number): { texture: WebGLTexture; view: mat4; projection: mat4; lightId: number } | null {
        const lightId = this.shadowMapIndexToLightId.get(shadowMapIndex);
        if (lightId === undefined) {
            if (ShadowMapManager.DEBUG_SHADOWS) {
                console.log(`[ShadowMapManager] getShadowDataByIndex(${shadowMapIndex}): No lightId found`);
                console.log(`[ShadowMapManager] shadowMapIndexToLightId map:`, Array.from(this.shadowMapIndexToLightId.entries()));
            }
            return null;
        }

        const shadowData = this.shadowMaps.get(lightId);
        if (!shadowData || !shadowData.light.enabled) {
            if (ShadowMapManager.DEBUG_SHADOWS) {
                console.log(`[ShadowMapManager] getShadowDataByIndex(${shadowMapIndex}): No shadowData for light ${lightId} or light disabled`);
            }
            return null;
        }

        if (ShadowMapManager.DEBUG_SHADOWS) {
            // Use the debug ID we assigned during creation
            const textureId = (shadowData.texture as any).__debugId || 'unknown';
            console.log(`[ShadowMapManager] getShadowDataByIndex(${shadowMapIndex}) -> Light ${lightId}, texture ID: ${textureId}`);
            console.log(`[ShadowMapManager] shadowMapIndexToLightId map:`, Array.from(this.shadowMapIndexToLightId.entries()));
            console.log(`[ShadowMapManager] lightToShadowMapIndex map:`, Array.from(this.lightToShadowMapIndex.entries()));
        }

        return {
            texture: shadowData.texture,
            view: mat4.clone(shadowData.view),
            projection: mat4.clone(shadowData.projection),
            lightId: lightId
        };
    }
}