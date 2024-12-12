class RenderaEditorType extends SDK.ITypeBase {
	constructor(sdkPlugin: SDK.IPluginBase, iObjectType: SDK.IObjectType) {
		super(sdkPlugin, iObjectType);
	}
};

/** Important to save export type for Typescript compiler */
export type { RenderaEditorType as EditorType };
