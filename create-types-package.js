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
const typesDir = path.join(__dirname, 'rendera-types');
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

console.log('Types package setup complete!');
console.log('Run "npm run copy-types" in Addon/Model to copy the type files.');