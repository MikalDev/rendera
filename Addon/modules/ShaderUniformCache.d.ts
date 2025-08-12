/**
 * Manages uniform location caching for WebGL shader programs.
 * Automatically caches uniform locations on first access and provides
 * invalidation mechanisms for shader recompilation.
 *
 * This class follows SOLID principles and reduces repeated GL calls
 * by caching uniform locations per shader program.
 */
export declare class ShaderUniformCache {
    private gl;
    private cache;
    constructor(gl: WebGL2RenderingContext);
    /**
     * Gets a uniform location, using cache if available.
     * @param program - The shader program
     * @param uniformName - Name of the uniform
     * @returns The uniform location or null if not found
     */
    getLocation(program: WebGLProgram, uniformName: string): WebGLUniformLocation | null;
    /**
     * Gets multiple uniform locations at once.
     * Useful for initializing a set of commonly used uniforms.
     * @param program - The shader program
     * @param uniformNames - Array of uniform names
     * @returns Map of uniform names to locations
     */
    getLocations(program: WebGLProgram, uniformNames: string[]): Map<string, WebGLUniformLocation | null>;
    /**
     * Invalidates cache for a specific program.
     * Call this when a shader is recompiled or deleted.
     * @param program - The shader program to invalidate
     */
    invalidateProgram(program: WebGLProgram): void;
    /**
     * Clears the entire cache.
     * Call this on context loss or reset.
     */
    clear(): void;
    /**
     * Gets the number of cached programs.
     * Useful for debugging and monitoring.
     */
    getCachedProgramCount(): number;
    /**
     * Gets the number of cached uniforms for a program.
     * @param program - The shader program
     */
    getCachedUniformCount(program: WebGLProgram): number;
}
//# sourceMappingURL=ShaderUniformCache.d.ts.map