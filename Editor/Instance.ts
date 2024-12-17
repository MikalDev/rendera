class RenderaEditorInstance extends SDK.IInstanceBase {
	public gpuResourceManager: GPUResourceManager;
	public modelLoader: ModelLoader;
	public instanceManager: InstanceManager;
	public initialized: boolean = false;
	constructor(sdkType: SDK.ITypeBase, inst: SDK.IObjectInstance) {
		super(sdkType, inst);
		console.log('mikalRenderaEditorInstance constructor');
		globalThis.mikalRenderaEditor = this;
	}

	public initialize(): boolean {
		if (this.initialized) return true;
		// @ts-ignore
		const elements = document.getElementsByClassName('layoutView shared');
		const canvas = elements[0];
		if (!canvas) {
			console.error('[rendera] No canvas found');
			return false;
		}
		const gl = canvas.getContext('webgl2');
		if (!gl) {
			console.error('[rendera] No WebGL2 context found');
			return false;
		}
		const GPUResourceManager = globalThis.GPUResourceManager;
		const ModelLoader = globalThis.ModelLoader;
		const InstanceManager = globalThis.InstanceManager;
		// Initialize managers
		this.gpuResourceManager = new GPUResourceManager(gl);
		this.modelLoader = new ModelLoader(gl, this.gpuResourceManager);
		this.instanceManager = new InstanceManager(gl, this.modelLoader, this.gpuResourceManager);
		console.info('[rendera] GPUResourceManager created', this.gpuResourceManager);
		console.info('[rendera] InstanceManager created', this.instanceManager);
		console.info('[rendera] ModelLoader created', this.modelLoader);
		this.initialized = true;
		return true;
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
