/*
const filePath = "./Builds/Source/addon.json";

try {
    const content = await Deno.readTextFile(filePath);
    const updatedContent = content.replaceAll('"c3runtime/instance.js",', '"c3runtime/instance.js",\n\t\t"c3runtime/main.js",');
    await Deno.writeTextFile(filePath, updatedContent);
    console.log("✓ Successfully updated addon.json");
} catch (error) {
    console.error("Error processing file:", error);
}

const mainPath = "./Builds/Source/c3runtime/main.js";

const mainContent = '    import "./plugin.js"\n    import "./type.js"\n    import "./instance.js"\n    import "./actions.js"\n    import "./conditions.js"\n    import "./expressions.js"'

try {
    await Deno.writeTextFile(mainPath, mainContent);
console.log("✓ Successfully wrote main.js");
} catch (error) {
    console.error("Error processing file:", error);
}
*/
const pluginPath = "./Builds/Source/plugin.js";

try {
    const content = await Deno.readTextFile(pluginPath);
    let updatedContent = content.replaceAll('this._info.SetIcon(icon.path, icon.iconType);', 'this._info.SetIcon(icon.path, icon.iconType);\n\t\tthis._info.SetRuntimeModuleMainScript("c3runtime/main.js")');
    updatedContent = updatedContent.replaceAll('"files/', '"');
    updatedContent = updatedContent.replaceAll('"c3runtime/modules/', '"');
    await Deno.writeTextFile(pluginPath, updatedContent);
    console.log("✓ Successfully updated plugin.js");
} catch (error) {
    console.error("Error processing file:", error);
}

