# [Plugin] Addon bare-bones

There is a Lost bare-bones project for 'plugin' addon type.

<!-- ## Installation
Use `lost create --plugin` -->

## Development
- Use `deno task build` OR `lost build` to build addon.
- Use `deno task serve` OR `lost serve` to build AND start web development server for testing addon.

- Changes
    - main.js fixes runtime scripts
    - from \\ from draco in plugin.js (move out of subfolder?)
    - change export of gl-matrix.js to use named exports and not factory function
    - change import of glMatrix to use named imports
        - import { mat4 } from './modules/gl-matrix.js';
    - change runtime to use WebGLRenderer instead of WebGL2Renderer

    main.js
    import "./plugin.js"
    import "./type.js"
    import "./instance.js"
    import "./actions.js"
    import "./conditions.js"
    import "./expressions.js"

    // renderer-analyzer.ts

interface MatrixInfo {
    type: 'perspective' | 'view';
    matrix: Float32Array;
    name?: string;
}

class RendererAnalyzer {
    public renderer: any;
    public matrices: MatrixInfo[] = [];
    public endBatchName: string | null = null;

    constructor(classDefinition: any, instance: any) {
        // Find and call first static method
        const staticMethod = this.findFirstStaticMethod(classDefinition);
        if (!staticMethod) {
            throw new Error('No static method found');
        }
        this.renderer = classDefinition[staticMethod](instance);
        
        this.analyzeMatrices(this.renderer);
        this.findEndBatchFunction(this.renderer);
    }

    private findFirstStaticMethod(cls: any): string | undefined {
        return Object.getOwnPropertyNames(cls)
            .find(name => typeof cls[name] === 'function' && name !== 'prototype');
    }

    private analyzeMatrices(renderer: any): void {
        for (const [key, value] of Object.entries(renderer)) {
            if (value instanceof Float32Array && value.length === 16) {
                this.matrices.push({
                    type: value[15] === 0 ? 'perspective' : 'view',
                    matrix: value,
                    name: key
                });
            }
        }
    }

	private findEndBatchFunction(renderer: any): void {
		// Get the prototype of the renderer
		const prototype = Object.getPrototypeOf(renderer);
		
		// Scan through all functions on the prototype
		for (const [key, value] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
			console.log('mikalRenderaEditor findEndBatchFunction key', key);
			if (typeof value.value === 'function') {
				// Convert function to string to analyze its content
				const funcString = value.value.toString();
				if (key == "FF") {
					debugger
				}
				if (this.detectPattern(funcString)) {
					this.endBatchName = key;
					break;
				}
			}
		}
	}
		

    public detectPattern(code: string): boolean {
		// Regex to match a function with no parameters (in a single line or otherwise):
		const funcRegex = /^[A-Za-z_$][A-Za-z_$0-9]*\s*\(\s*\)/;
		const funcMatch = code.match(funcRegex);
		if (!funcMatch) {
		  return false;
		}
	  
		const body = code 
	  
		// Pattern to find assignments ending in "= 0;" that start with this.var references
		const assignmentRegex = /((?:this\.\w+\s*=\s*)+0\s*)/g;
		const assignments = body.match(assignmentRegex);
		if (!assignments) {
		  return false; // No assignments found
		}
	  
		let allVars = [];
		for (const assignment of assignments) {
		  const varsInChain = assignment.match(/this\.(\w+)/g);
		  if (varsInChain) {
			allVars.push(...varsInChain);
		  }
		}
	  
		const uniqueVars = [...new Set(allVars)];
	  
		// Check if exactly 5 distinct variables were assigned
		return uniqueVars.length === 5;
	  }	  
}

