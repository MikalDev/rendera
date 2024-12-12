class RenderaPlugin extends globalThis.ISDKPluginBase {
	constructor() {
		super();
		// @ts-ignore
		globalThis.veryBadLands = c3_runtimeInterface._localRuntime
		// @ts-ignore
		console.log('[runtime] veryBadLands', globalThis.veryBadLands);
	}
};

/** Important to save export type for Typescript compiler */
export type { RenderaPlugin };