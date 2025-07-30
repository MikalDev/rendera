import { GPUResourceManager, InstanceManager, ModelLoader } from './modules/index.js';
import { mat4 } from './modules/gl-matrix.js'

class LostInstance extends globalThis.ISDKInstanceBase {

	/** Use this for triggering plugin conditions */
	readonly Conditions = C3.Plugins[Lost.addonId].Cnds;

	public gpuResourceManager!: GPUResourceManager;
	public instanceManager!: InstanceManager;
	public modelLoader!: ModelLoader;
	private _viewMatrix: typeof mat4 = mat4.create();
	private _projectionMatrix: typeof mat4 = mat4.create();
	private _lastTick = -1;
	private _currentTick = -1;
	private _lastLoadedModelPath: string = '';
	private _useAnimationWorker: boolean = false; // Default to false for testing
	
	public initialized = false;

	constructor() {
		super();
		/** 
		 * Use auto-created declaration file for your plugin properties after build
		 * @type {PluginProperties}
		 */
		const properties = this._getInitProperties() as PluginProperties;

		this._setTicking(true);

		// @ts-ignore globalThis not typed
		globalThis.rendera = this
	}

	_release() {
		super._release();
	}

	public initialize(): boolean {
		if (this.initialized)
			return true;
		// @ts-ignore
		const renderer = globalThis.verySadLands;
		const gl = renderer._gl;
		console.log('[rendera] WebGL2 supported', gl);;
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

	public draw(iRenderer: unknown): void {
		if (this._currentTick <= this._lastTick) {
			return;
		}
		this._lastTick = this._currentTick;

		let viewProjection = this.instanceManager.createViewProjection(60, { width: 854, height: 480 }, 0.1, 1000, [100, 100, 600], [100, 100, 0], [0, 1, 0]);
		// @ts-ignore
		const runtime = globalThis.veryBadLands
		const renderer = runtime.GetWebGLRenderer()
		const view = renderer._matMV
		const projection = renderer._matP
		viewProjection = {view, projection}
		this.instanceManager.render(viewProjection, this._currentTick);
	}

	_getViewProjectionMatrices(): {viewMatrix: typeof mat4, projectionMatrix: typeof mat4} {
		const runtime = this.runtime;
		// @ts-ignore
		const camera = runtime.objects["3DCamera"] as I3DCameraObjectType<IInstance>;
		if (!camera) {
			console.warn('[rendera] No 3DCamera found');
			return {viewMatrix: mat4.create(), projectionMatrix: mat4.create()};
		}
		// console.log('[rendera] camera', camera);
		const camPos = camera.getCameraPosition();
		const camLook = camera.getLookPosition();
		const camUp = camera.getUpVector();
		const viewMatrix = mat4.create();
		mat4.lookAt(viewMatrix, camPos, camLook, camUp);
		const projectionMatrix = mat4.create();
		const fov = camera.fieldOfView;
		const viewPortWidth = runtime.viewportWidth;
		const viewPortHeight = runtime.viewportHeight;
		mat4.perspective(projectionMatrix, fov, viewPortWidth / viewPortHeight, 1, 10000);
		return {viewMatrix, projectionMatrix};
	}

	async _tick() {
		if (!this.initialize()) return;

		// Get view and projection matrices
		const {viewMatrix, projectionMatrix} = this._getViewProjectionMatrices();
		this._viewMatrix = viewMatrix;
		this._projectionMatrix = projectionMatrix;
		// console.log('[rendera] viewMatrix', viewMatrix);
		// console.log('[rendera] projectionMatrix', projectionMatrix);

		// Process pending gltfdocuments
		const count = await this.modelLoader.processPendingDocuments();
		if (count > 0) {
			console.info('[rendera] processPendingDocuments', count);
		}
		this._currentTick++;
	}

	public getViewMatrix() {
		return this._viewMatrix;
	}

	public getProjectionMatrix() {
		return this._projectionMatrix;
	}

	public _triggerModelLoaded(modelPath: string) {
		this._lastLoadedModelPath = modelPath;
		// Trigger the onModelLoaded condition
		this._trigger(this.Conditions.onModelLoaded);
	}

	public getLastLoadedModelPath() {
		return this._lastLoadedModelPath;
	}

	public setUseAnimationWorker(enabled: boolean): void {
		console.log(`[rendera] setUseAnimationWorker called with enabled=${enabled}`);
		this._useAnimationWorker = enabled;
		// Update instance manager's animation controller
		if (this.instanceManager) {
			console.log('[rendera] Calling instanceManager.setUseAnimationWorker');
			this.instanceManager.setUseAnimationWorker(enabled);
		} else {
			console.warn('[rendera] instanceManager is not initialized yet');
		}
		console.log(`[rendera] Animation worker ${enabled ? 'enabled' : 'disabled'}`);
	}

	public getUseAnimationWorker(): boolean {
		return this._useAnimationWorker;
	}
};

/** Important to save export type for Typescript compiler */
export type { LostInstance as Instance };