const fs = require('node:fs');
const path = require('node:path');

// Create package.json for the types package
const packageJson = {
  "name": "@rendera/types",
  "version": "1.0.0",
  "description": "TypeScript type definitions for Rendera 3D renderer",
  "main": "index.d.ts",
  "types": "index.d.ts",
  "files": ["*.d.ts", "*.d.ts.map"],
  "keywords": ["rendera", "3d", "renderer", "types", "typescript", "construct3"],
  "author": "",
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  }
};

// Create the rendera-types directory if it doesn't exist
const typesDir = path.join(__dirname, '..', 'rendera-types');
if (!fs.existsSync(typesDir)) {
  fs.mkdirSync(typesDir, { recursive: true });
}

// Write package.json
fs.writeFileSync(
  path.join(typesDir, 'package.json'),
  JSON.stringify(packageJson, null, 2)
);

// Create a README for the types package
const readme = `# Rendera Types

TypeScript type definitions for the Rendera 3D renderer plugin for Construct 3.

## Installation

\`\`\`bash
npm install @rendera/types --save-dev
\`\`\`

## Usage

In your TypeScript files:

\`\`\`typescript
/// <reference types="@rendera/types" />

// Now you can use globalThis.rendera with full type support
const instanceManager = globalThis.rendera.instanceManager;
const model = instanceManager.createModel('myModel');
\`\`\`

Or import specific types:

\`\`\`typescript
import type { InstanceManager, Model } from '@rendera/types';
\`\`\`

## Available Types

- \`InstanceManager\` - Main manager for 3D model instances
- \`Model\` - Individual 3D model instance
- \`ModelLoader\` - Handles loading of 3D models
- \`AnimationController\` - Controls model animations
- \`GPUResourceManager\` - Manages GPU resources
- \`ShadowMapManager\` - Handles shadow mapping
- And more...

## Global Access

The types assume that rendera is available on \`globalThis\`:

\`\`\`typescript
globalThis.rendera.instanceManager
globalThis.rendera.modelLoader
// etc.
\`\`\`
`;

fs.writeFileSync(
  path.join(typesDir, 'README.md'),
  readme
);

// Copy all .d.ts and .d.ts.map files from Addon/modules to rendera-types
const modulesDir = path.join(__dirname, '..', 'Addon', 'modules');
if (fs.existsSync(modulesDir)) {
  const files = fs.readdirSync(modulesDir);
  files.forEach(file => {
    if (file.endsWith('.d.ts') || file.endsWith('.d.ts.map')) {
      const sourcePath = path.join(modulesDir, file);
      const destPath = path.join(typesDir, file);
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${file}`);
    }
  });
}

// Create an index.d.ts that exports all the main types
const indexContent = `// Main exports for Rendera 3D renderer
export { InstanceManager } from './InstanceManager';
export { Model } from './Model';
export { ModelLoader } from './ModelLoader';
export { AnimationController } from './AnimationController';
export { GPUResourceManager } from './GPUResourceManager';
export { ShadowMapManager } from './ShadowMapManager';
export * from './types';

// Global declaration for Rendera
declare global {
  interface Window {
    rendera: {
      instanceManager: InstanceManager;
      modelLoader: ModelLoader;
      gpuResourceManager: GPUResourceManager;
    };
  }
  
  var rendera: {
    instanceManager: InstanceManager;
    modelLoader: ModelLoader;
    gpuResourceManager: GPUResourceManager;
  };
}

export {};
`;

fs.writeFileSync(
  path.join(typesDir, 'index.d.ts'),
  indexContent
);

console.log('Types package setup complete!');
console.log(`Created rendera-types package in ${typesDir}`);