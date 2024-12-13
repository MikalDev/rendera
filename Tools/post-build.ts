const filePath = "./Builds/Source/plugin.js";

try {
    const content = await Deno.readTextFile(filePath);
    const updatedContent = content.replaceAll("external-dom-script", "external-runtime-script");
    await Deno.writeTextFile(filePath, updatedContent);
    console.log("✓ Successfully updated plugin.js");
} catch (error) {
    console.error("Error processing file:", error);
}