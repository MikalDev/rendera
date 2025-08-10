# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rendera is a 3D renderer plugin for Construct 3 with shadow mapping support. The codebase uses TypeScript and is built using the Lost framework (Construct 3 addon builder) and Rollup.

## Build Commands

### Full Build Pipeline
```bash
deno task bp
```
This runs the complete build pipeline: Model module build → Lost build → Post-build processing

### Development Builds
```bash
# Watch mode (rebuilds on file changes)
deno task dev

# Build and serve with hot reload
deno task serve
```

### Model Module Only
```bash
cd Addon/Model
npm run build  # One-time build
npm run watch  # Watch mode
```

## Testing

### Run Model Module Tests
```bash
cd Addon/Model
npm test
```
This starts a local HTTP server to test 3D models and rendering features.

## Architecture Overview

### Core Components

1. **Runtime Architecture** (`Addon/`)
   - **Model System** (`Addon/Model/src/`): Handles 3D model loading, GPU resources, animations
   - **Render System** (`Addon/Model/src/rendering/`): Multi-pass rendering with shadow mapping
   - **Plugin Integration** (`Addon/Scripts/`): Construct 3 runtime integration

2. **Key Classes**
   - `ModelManager`: Central manager for 3D models and GPU resources
   - `ShadowMapManager`: Handles shadow map generation and rendering
   - `AnimationManager`: Skeletal animation system
   - `ModelType`: Model configuration and state management

3. **GPU Resource Management**
   - Resources are cached in `gpuResourcesMap` to avoid duplicates
   - Vertex Array Objects (VAOs) managed per model instance
   - Texture and buffer cleanup handled automatically

### Shadow Mapping Implementation

The shadow mapping system (`Addon/Model/src/rendering/ShadowMapManager.ts`) supports:
- Directional, point, and spot lights
- Configurable resolution (512-4096)
- PCF (Percentage Closer Filtering) for soft shadows
- Multi-pass rendering pipeline

### Build System Details

1. **Lost Framework** (`lost.config.ts`): Constructs the Construct 3 addon structure
2. **Model Module Build** (`Addon/Model/rollup.config.js`): Bundles TypeScript into ES modules
3. **Post-Build** (`Tools/post-build.ts`): Reorders addon.json for proper loading

## Development Tips

- When modifying shader code, check both vertex and fragment shaders in the respective TypeScript files
- GPU resources must be properly cleaned up - use the existing disposal patterns
- Animation data is stored in `AnimationData` objects with tracks for each animated property
- The project uses column-major matrix ordering (gl-matrix convention)

## Git Workflow

Follow the branch naming convention: `<type>/<ticket-id>/<description>`
- Types: feature, bugfix, hotfix, release, docs, test, chore, refactor
- Example: `feature/shadow-map-improvements`

## Design Principles

Follow these design patterns when contributing to the codebase:

- **DRY (Don't Repeat Yourself)**: Extract common functionality into reusable functions or classes. If you find yourself copying code, create a shared utility instead.

- **YAGNI (You Aren't Gonna Need It)**: Only implement features that are currently needed. Avoid adding speculative functionality that might be useful "someday."

- **SOLID**: 
  - Single Responsibility: Each class/function should have one reason to change
  - Open/Closed: Classes should be open for extension but closed for modification
  - Liskov Substitution: Derived classes must be substitutable for their base classes
  - Interface Segregation: Many specific interfaces are better than one general interface
  - Dependency Inversion: Depend on abstractions, not concrete implementations

- **KISS (Keep It Simple, Stupid)**: Prefer simple, readable solutions over clever or complex ones. Code should be easy to understand and maintain.