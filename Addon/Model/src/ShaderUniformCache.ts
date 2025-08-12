/**
 * Manages uniform location caching for WebGL shader programs.
 * Automatically caches uniform locations on first access and provides
 * invalidation mechanisms for shader recompilation.
 * 
 * This class follows SOLID principles and reduces repeated GL calls
 * by caching uniform locations per shader program.
 */
export class ShaderUniformCache {
    private gl: WebGL2RenderingContext;
    // Map<ShaderProgram, Map<UniformName, Location>>
    private cache: Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>;
    
    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.cache = new Map();
    }
    
    /**
     * Gets a uniform location, using cache if available.
     * @param program - The shader program
     * @param uniformName - Name of the uniform
     * @returns The uniform location or null if not found
     */
    getLocation(program: WebGLProgram, uniformName: string): WebGLUniformLocation | null {
        // Get or create program cache
        if (!this.cache.has(program)) {
            this.cache.set(program, new Map());
        }
        
        const programCache = this.cache.get(program)!;
        
        // Get or query uniform location
        if (!programCache.has(uniformName)) {
            const location = this.gl.getUniformLocation(program, uniformName);
            programCache.set(uniformName, location);
        }
        
        return programCache.get(uniformName)!;
    }
    
    /**
     * Gets multiple uniform locations at once.
     * Useful for initializing a set of commonly used uniforms.
     * @param program - The shader program
     * @param uniformNames - Array of uniform names
     * @returns Map of uniform names to locations
     */
    getLocations(program: WebGLProgram, uniformNames: string[]): Map<string, WebGLUniformLocation | null> {
        const locations = new Map<string, WebGLUniformLocation | null>();
        for (const name of uniformNames) {
            locations.set(name, this.getLocation(program, name));
        }
        return locations;
    }
    
    /**
     * Invalidates cache for a specific program.
     * Call this when a shader is recompiled or deleted.
     * @param program - The shader program to invalidate
     */
    invalidateProgram(program: WebGLProgram): void {
        this.cache.delete(program);
    }
    
    /**
     * Clears the entire cache.
     * Call this on context loss or reset.
     */
    clear(): void {
        this.cache.clear();
    }
    
    /**
     * Gets the number of cached programs.
     * Useful for debugging and monitoring.
     */
    getCachedProgramCount(): number {
        return this.cache.size;
    }
    
    /**
     * Gets the number of cached uniforms for a program.
     * @param program - The shader program
     */
    getCachedUniformCount(program: WebGLProgram): number {
        return this.cache.get(program)?.size ?? 0;
    }
}