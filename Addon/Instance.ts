import { GPUResourceManager, InstanceManager, ModelLoader, WebGLStateTracker } from './modules/index.js';
import { mat4 } from './modules/gl-matrix.js';

class LostInstance extends globalThis.ISDKInstanceBase {

	/** Use this for triggering plugin conditions */
	readonly Conditions = C3.Plugins[Lost.addonId].Cnds;

	public gpuResourceManager!: GPUResourceManager;
	public instanceManager!: InstanceManager;
	public modelLoader!: ModelLoader;
	public webGLStateTracker!: WebGLStateTracker;
	public get shadowMapManager() {
		return this.instanceManager?.getShadowMapManager();
	}
	private _viewMatrix: typeof mat4 = mat4.create();
	private _projectionMatrix: typeof mat4 = mat4.create();
	private _lastTick = -1;
	private _currentTick = -1;
	private _lastLoadedModelPath: string = '';
	private _useAnimationWorker: boolean = false; // Default to false for testing

	// Frustum culling near plane offset
	public frustumCullingNearOffset: number = 0.0;

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
		console.log('[rendera] WebGL2 supported', gl);

		// Initialize WebGL state tracker
		this.webGLStateTracker = WebGLStateTracker.initialize(gl);
		console.info('[rendera] WebGL state tracker initialized', this.webGLStateTracker);
		
		// Make state tracker available globally for debugging
		// @ts-ignore
		globalThis.renderaWebGLState = {
			snapshot: () => this.webGLStateTracker.snapshot(),
			restore: (snapshot: any) => this.webGLStateTracker.restore(snapshot),
			state: this.webGLStateTracker.getState(),
			original: this.webGLStateTracker.getOriginalMethods(),
			snapshotToLoggable: (snapshot: any) => this.webGLStateTracker.snapshotToLoggable(snapshot),
			verifyMonkeypatch: () => this.webGLStateTracker.verifyMonkeypatch(),
		};

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
		this.instanceManager.render(viewProjection, this._currentTick, this.frustumCullingNearOffset);
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
		const wasInitialized = this.initialized;
		if (!this.initialize()) return;
		
		// Trigger onRenderaReady on the first successful initialization during tick
		if (!wasInitialized && this.initialized) {
			// Use setTimeout to ensure the trigger happens after the runtime is ready
			setTimeout(() => {
				this._trigger(this.Conditions.onRenderaReady);
				console.info('[rendera] Triggered onRenderaReady event during first tick');
			}, 0);
		}

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

	public async setUseAnimationWorker(enabled: boolean): Promise<void> {
		this._useAnimationWorker = enabled;
		// Update instance manager's animation controller
		if (this.instanceManager) {
			await this.instanceManager.setUseAnimationWorker(enabled);
		}
	}

	public getUseAnimationWorker(): boolean {
		return this._useAnimationWorker;
	}
	
	// Animation event callback API for Rendera-Control
	public registerAnimationCallback(instanceId: any, callback: any): void {
		// Extract numeric ID if needed
		let numericId: number;
		if (typeof instanceId === 'number') {
			numericId = instanceId;
		} else if (instanceId && typeof instanceId.id === 'number') {
			numericId = instanceId.id;
		} else if (instanceId && typeof instanceId.instanceId === 'object' && typeof instanceId.instanceId.id === 'number') {
			numericId = instanceId.instanceId.id;
		} else {
			console.error('[rendera] Cannot extract numeric instanceId from:', instanceId);
			return;
		}
		
		if (!this.instanceManager) {
			console.warn('[rendera] Cannot register animation callback - instanceManager not initialized');
			return;
		}
		this.instanceManager.registerAnimationCallback(numericId, callback);
	}
	
	public unregisterAnimationCallback(instanceId: any): void {
		// Extract numeric ID if needed
		let numericId: number;
		if (typeof instanceId === 'number') {
			numericId = instanceId;
		} else if (instanceId && typeof instanceId.id === 'number') {
			numericId = instanceId.id;
		} else if (instanceId && typeof instanceId.instanceId === 'object' && typeof instanceId.instanceId.id === 'number') {
			numericId = instanceId.instanceId.id;
		} else {
			console.error('[rendera] Cannot extract numeric instanceId from:', instanceId);
			return;
		}

		if (!this.instanceManager) {
			console.warn('[rendera] Cannot unregister animation callback - instanceManager not initialized');
			return;
		}
		this.instanceManager.unregisterAnimationCallback(numericId);
	}

	/**
	 * Gets the world position of a bone/joint by name for a specific model instance.
	 * @param instanceId The numeric ID of the model instance
	 * @param boneName The name of the bone/joint
	 * @returns [x, y, z] world position or null if bone/instance not found
	 */
	public getBoneWorldPosition(instanceId: number, boneName: string): [number, number, number] | null {
		if (!this.instanceManager) {
			console.warn('[rendera] Cannot get bone position - instanceManager not initialized');
			return null;
		}

		// Delegate to instanceManager
		return this.instanceManager.getBoneWorldPosition(instanceId, boneName);
	}

	/**
	 * Gets the world position of a bone/joint by index for a specific model instance.
	 * @param instanceId The numeric ID of the model instance
	 * @param boneIndex The index of the bone/joint
	 * @returns [x, y, z] world position or null if bone/instance not found
	 */
	public getBoneWorldPositionByIndex(instanceId: number, boneIndex: number): [number, number, number] | null {
		if (!this.instanceManager) {
			console.warn('[rendera] Cannot get bone position - instanceManager not initialized');
			return null;
		}

		// Delegate to instanceManager
		return this.instanceManager.getBoneWorldPositionByIndex(instanceId, boneIndex);
	}

	/**
	 * Gets a list of all bones/joints for a model with their indices, names, and hierarchy.
	 * @param modelId The ID of the model
	 * @returns Object with bone information including hierarchy or null if model not found
	 */
	public getModelBones(modelId: string): { bones: Array<{ index: number; name: string; parentIndex: number | null; children: number[] }> } | null {
		if (!this.instanceManager) {
			console.warn('[rendera] Cannot get model bones - instanceManager not initialized');
			return null;
		}

		// Delegate to instanceManager
		return this.instanceManager.getModelBones(modelId);
	}

	/**
	 * Gets a list of all bones/joints for a specific instance with hierarchy information.
	 * @param instanceId The numeric ID of the model instance
	 * @returns Object with bone information including hierarchy or null if instance not found
	 */
	public getInstanceBones(instanceId: number): { bones: Array<{ index: number; name: string; parentIndex: number | null; children: number[] }> } | null {
		if (!this.instanceManager) {
			console.warn('[rendera] Cannot get instance bones - instanceManager not initialized');
			return null;
		}

		// Delegate to instanceManager
		return this.instanceManager.getInstanceBones(instanceId);
	}
};

/** Important to save export type for Typescript compiler */
export type { LostInstance as Instance };