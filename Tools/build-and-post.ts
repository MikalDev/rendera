console.log("Starting build process...");

const modelBuildProcess = new Deno.Command("npm", { args: ["run", "build"], cwd: "./Addon/Model" });
const modelBuildOutput = await modelBuildProcess.output();
console.log(modelBuildOutput);

console.log("Model build completed successfully.");


// Run the build and wait for it to complete
const buildProcess = new Deno.Command("lost", { args: ["build"] });
const buildOutput = await buildProcess.output();
console.log(buildOutput);

console.log("Build completed successfully, running post-build...");
// Add a small delay to ensure all files are written
await new Promise(resolve => setTimeout(resolve, 1000));

// Run the post-build script
await import("./post-build.ts");