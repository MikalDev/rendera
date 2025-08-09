import { mat4, vec3 } from 'gl-matrix';
import type { Light, IGPUResourceManager } from './types';
import type { InstanceManager } from './InstanceManager';
export declare enum LightType {
    DIRECTIONAL = "directional",
    SPOT = "spot",
    POINT = "point"
}
/**
 * Defines the filtering mode for shadow map sampling.
 * NEAREST provides harder shadows with more aliasing but better performance.
 * LINEAR provides softer shadow edges but may introduce some artifacts.
 */
export declare enum ShadowFilterMode {
    NEAREST = "NEAREST",
    LINEAR = "LINEAR"
}
/**
 * Defines the format and precision of the shadow map texture.
 * DEPTH24_UINT - Standard 24-bit depth format, good balance of precision and memory
 * DEPTH32F_FLOAT - 32-bit float depth format, highest precision but more memory usage
 */
export declare enum ShadowMapFormat {
    DEPTH24_UINT = "DEPTH24_UINT",
    DEPTH32F_FLOAT = "DEPTH32F_FLOAT"
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
export declare class ShadowMapManager {
    private gpuResourceManager;
    private gl;
    private shadowMaps;
    private filterMode;
    private format;
    private resolution;
    private sceneBounds;
    private shadowMapShader;
    private lightToShadowMapIndex;
    private shadowMapIndexToLightId;
    private activeShadowMaps;
    private nextAvailableShadowMapIndex;
    private static DEBUG_SHADOWS;
    /** Default scene bounds used when no specific bounds are set */
    private static readonly DEFAULT_BOUNDS;
    private readonly matrixPool;
    /**
     * Creates a new ShadowMapManager instance.
     * @param gl - The WebGL2 context to use for rendering
     */
    constructor(gl: WebGL2RenderingContext, gpuResourceManager: IGPUResourceManager);
    /**
     * Initializes the shadow map manager with the specified settings.
     * @param resolution - The resolution of the shadow maps in pixels
     * @param filterMode - The filtering mode to use for shadow sampling (default: LINEAR)
     * @param format - The format to use for shadow maps (default: DEPTH24_UINT)
     */
    initialize(resolution?: number, filterMode?: ShadowFilterMode, format?: ShadowMapFormat): void;
    /**
     * Updates the scene bounds used for shadow frustum calculations.
     * @param bounds - The new scene bounds in world space
     * @throws Error if bounds are invalid
     */
    setSceneBounds(bounds: SceneBounds): void;
    /**
     * Gets the current scene bounds.
     * @returns A copy of the current scene bounds to prevent external modification
     */
    getSceneBounds(): SceneBounds;
    /**
     * Validates scene bounds for correctness.
     * @param bounds - The bounds to validate
     * @throws Error if bounds are invalid (not finite numbers, min > max, etc.)
     * @private
     */
    private validateBounds;
    /**
     * Expands the scene bounds to include the given point.
     * Useful for incrementally building bounds from scene geometry.
     * @param point - The point to include in world space
     */
    expandBounds(point: vec3): void;
    /**
     * Resets scene bounds to null, forcing use of default bounds until new bounds are set.
     */
    resetBounds(): void;
    /**
     * Creates shadow map resources for a light.
     * Sets up the depth texture, framebuffer, and other WebGL resources needed for shadow mapping.
     *
     * @param light - The light to create shadow map resources for
     * @returns The created shadow map resources
     * @throws Error if framebuffer initialization fails
     * @private
     */
    private createShadowMapResources;
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
    private calculateDirectionalLightMatrix;
    /**
     * Calculates the view-projection matrix for a spot light.
     * Creates a perspective projection based on the spot light's angle and position.
     *
     * @param light - The spot light to calculate the matrix for
     * @param bounds - The scene bounds to encompass in the shadow map
     * @returns The calculated view-projection matrix for shadow mapping
     * @private
     */
    private calculateSpotLightMatrix;
    /**
     * Updates the shadow map data for a light, creating resources if needed.
     * Should be called when light properties change or scene bounds are updated.
     * For directional lights, updates the view-projection matrix based on current bounds.
     *
     * @param lightId - Unique identifier for the light
     * @param light - The light to update shadow map data for
     */
    updateShadowMap(lightId: number, light: Light): void;
    /**
     * Changes the filtering mode for all shadow maps.
     * Updates existing shadow maps to use the new filtering mode.
     * No-op if the new mode is the same as the current mode.
     *
     * @param mode - The new filtering mode to use
     */
    setFilterMode(mode: ShadowFilterMode): void;
    /**
     * Cleans up all shadow map resources.
     * Deletes textures, framebuffers, and renderbuffers.
     * Should be called when the shadow map manager is no longer needed.
     */
    cleanup(): void;
    renderInstances(instanceManager: InstanceManager, shadowData: ShadowMapData): void;
    /**
     * Renders the shadow map for a given light.
     * Handles all the setup, rendering, and cleanup for shadow map generation.
     * Preserves WebGL state and restores it after rendering.
     *
     * @param lightId - The ID of the light to render shadows for
     * @param instanceManager - The instance manager that will render the scene
     * @throws Error if the shadow map resources aren't initialized
     */
    renderShadowMap(lightId: number, instanceManager: InstanceManager): void;
    /**
     * Gets the shadow map data needed for rendering with shadows.
     * Should be called during main render pass to get the shadow information.
     * Returns null if the light is disabled or no shadow map exists.
     *
     * @param lightId - The ID of the light to get shadow data for
     * @returns Object containing the shadow map texture and its view-projection matrix, or null if no shadow map exists
     */
    getShadowData(lightId: number): {
        texture: WebGLTexture;
        view: mat4;
        projection: mat4;
    } | null;
    private createGLResource;
    /**
     * Changes the resolution of all shadow maps.
     * Recreates all shadow maps with the new resolution.
     */
    setResolution(resolution: number): void;
    /**
     * Gets the current shadow map resolution.
     * @returns The current resolution in pixels
     */
    getResolution(): number;
    /**
     * Removes shadow map resources for a specific light.
     * @param lightId - ID of the light whose shadow map should be removed
     */
    removeShadowMap(lightId: number): void;
    private cleanupGLResources;
    /**
     * Renders shadow maps for all enabled lights.
     * Iterates over all shadow maps and renders them if the light is enabled.
     * @param instanceManager - The instance manager that will render the scene
     */
    renderAllShadowMaps(instanceManager: InstanceManager): void;
    /**
     * Updates all shadow maps using the provided array of lights.
     * Iterates over the lights and updates the shadow map for each enabled light that casts shadows.
     * @param lights - Array of lights to update shadow maps for
     */
    updateAllShadowMaps(lights: Light[]): void;
    /**
     * Renders a shadow map for debugging purposes.
     * @param lightId - The ID of the light to render the shadow map for
     */
    renderShadowMapDebug(lightId: number): void;
    /**
     * Helper method to create a shader program.
     * @param vertexSource - The vertex shader source code
     * @param fragmentSource - The fragment shader source code
     * @returns The created shader program
     */
    private createShaderProgram;
    /**
     * Helper method to compile a shader.
     * @param type - The shader type (VERTEX_SHADER or FRAGMENT_SHADER)
     * @param source - The shader source code
     * @returns The compiled shader
     */
    private compileShader;
    private debugShaderProgram;
    /**
     * Enable or disable debug logging for shadow map operations.
     * @param enabled - Whether to enable debug logging
     */
    static setDebugLogging(enabled: boolean): void;
    /**
     * Assigns a shadow map index to a light that casts shadows.
     * @param lightId - The ID of the light
     * @returns The shadow map index (0-7) or -1 if no slots available
     */
    private assignShadowMapIndex;
    /**
     * Releases a shadow map index when a light no longer casts shadows.
     * @param lightId - The ID of the light
     */
    private releaseShadowMapIndex;
    /**
     * Gets the shadow map index for a given light ID.
     * @param lightId - The ID of the light
     * @returns The shadow map index (0-7) or -1 if not found
     */
    getLightShadowMapIndex(lightId: number): number;
    /**
     * Gets the light ID for a given shadow map index.
     * @param shadowMapIndex - The shadow map index (0-7)
     * @returns The light ID or -1 if not found
     */
    getShadowMapLightId(shadowMapIndex: number): number;
    /**
     * Gets all active shadow map indices.
     * @returns Array of active shadow map indices (0-7)
     */
    getActiveShadowMapIndices(): number[];
    /**
     * Gets the mapping of light IDs to shadow map indices for all active shadow maps.
     * @returns Map of lightId -> shadowMapIndex
     */
    getLightToShadowMapMapping(): Map<number, number>;
    /**
     * Gets shadow data by shadow map index instead of light ID.
     * @param shadowMapIndex - The shadow map index (0-7)
     * @returns Shadow data or null if not found
     */
    getShadowDataByIndex(shadowMapIndex: number): {
        texture: WebGLTexture;
        view: mat4;
        projection: mat4;
        lightId: number;
    } | null;
}
export {};
//# sourceMappingURL=ShadowMapManager.d.ts.map