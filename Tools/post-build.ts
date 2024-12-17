try {
    // Read the addon.json file
    const addonPath = 'Builds/Source/addon.json';
    const content = await Deno.readTextFile(addonPath);
    const addonData = JSON.parse(content);

    // Reorder the editor-scripts array
    addonData['editor-scripts'] = [
        "plugin.js",
        "type.js",
        "instance.js",
        "c3runtime/modules/index.js",
        "c3runtime/modules/gl-matrix.js"
    ];

    // Reorder the file-list array
    addonData['file-list'] = [
        "c3runtime/main.js",
        "c3runtime/plugin.js",
        "c3runtime/type.js",
        "c3runtime/instance.js",
        "c3runtime/expressions.js",
        "c3runtime/actions.js",
        "c3runtime/conditions.js",
        "c3runtime/modules/index.js",
        "c3runtime/modules/gl-matrix.js",
        "lang/en-US.json",
        "instance.js",
        "type.js",
        "plugin.js",
        "icon.svg",
        "files/draco_decoder_gltf.wasm",
        "aces.json"
    ];

    // Write the updated content back to the file
    await Deno.writeTextFile(addonPath, JSON.stringify(addonData, null, 2));
    console.log("✓ Successfully updated addon.json");
} catch (error) {
    console.error("Error processing file:", error);
}