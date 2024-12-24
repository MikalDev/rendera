// renderer-analyzer.ts
// import type { GPUResourceManager, ModelLoader, InstanceManager } from '../Builds/source/c3runtime/modules/index.js';

interface MatrixInfo {
	type: 'perspective' | 'view';
	matrix: Float32Array;
	name?: string;
}

class RendererAnalyzer {
	public renderer: any;
	public matrices: MatrixInfo[] = [];
	public endBatchName: string | null = null;
	public gl: WebGL2RenderingContext | null = null;

	constructor(classDefinition: any, instance: any) {
		// Find and call first static method
		const staticMethod = this.findFirstStaticMethod(classDefinition);
		if (!staticMethod) {
			throw new Error('No static method found');
		}
		this.renderer = classDefinition[staticMethod](instance);
		
		this.analyzeMatrices(this.renderer);
		this.findEndBatchFunction(this.renderer);
		this.gl = this.findWebGL2Context(this.renderer);
	}

	private findWebGL2Context(renderer: any): WebGL2RenderingContext | null {
		// Check direct properties first
		for (const [key, value] of Object.entries(renderer)) {
			// Check if the property is the WebGL2 context itself
			if (value instanceof WebGL2RenderingContext) {
				return value;
			}
		}
		return null;
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

class RenderaEditorInstance extends SDK.IInstanceBase {
	public gpuResourceManager!: InstanceType<typeof globalThis.GPUResourceManager>;
	public modelLoader!: InstanceType<typeof globalThis.ModelLoader>;
	public instanceManager!: InstanceType<typeof globalThis.InstanceManager>;
	private _initialized: boolean = false;
	public get initialized(): boolean {
		return (this._initialized && this.modelLoader.initialized)
	}
	private rendererAnalyzer!: RendererAnalyzer;
	constructor(sdkType: SDK.ITypeBase, inst: SDK.IObjectInstance) {
		super(sdkType, inst);
		console.log('mikalRenderaEditorInstance constructor');
		// @ts-ignore
		globalThis.mikalRenderaEditor = this;
	}

	public initialize(iRenderer: any): boolean {
		if (this.initialized) return true;
		this.rendererAnalyzer = new RendererAnalyzer(globalThis.SDK.Gfx.IWebGLRenderer, iRenderer);
		const gl = this.rendererAnalyzer.gl;
		// Initialize managers
		this.gpuResourceManager = new globalThis.GPUResourceManager(gl);
		this.modelLoader = new globalThis.ModelLoader(gl, this.gpuResourceManager);
		this.instanceManager = new globalThis.InstanceManager(gl, this.modelLoader, this.gpuResourceManager);
		console.info('[rendera] GPUResourceManager created', this.gpuResourceManager);
		console.info('[rendera] InstanceManager created', this.instanceManager);
		console.info('[rendera] ModelLoader created', this.modelLoader);
		this._initialized = true;
		return true;
	}
	
	Draw() {
		if (!this.initialized) return;
		if (!this.rendererAnalyzer.endBatchName) {
			console.error('[rendera] No end batch function found');
			return;
		}
		const matrices = this.rendererAnalyzer.matrices;
		const view = matrices.find(m => m.type === 'view');
		const projection = matrices.find(m => m.type === 'perspective');
		if (!view || !projection) {
			console.error('[rendera] No view or projection matrix found');
			return;
		}
		// renderer endBatch()
		this.rendererAnalyzer.renderer[this.rendererAnalyzer.endBatchName]()
		const viewProjection = {view: view.matrix, projection: projection.matrix}
		this.instanceManager.render(viewProjection);
	}
	
	Release() {

	}
	
	OnCreate() {

	}
	
	OnPropertyChanged(id: string, value: EditorPropertyValueType) {

	}
	
	LoadC2Property(name: string, valueString: string) {
		return false;		// not handled
	}
};

/** Important to save export type for Typescript compiler */
export type { RenderaEditorInstance as EditorInstance };
