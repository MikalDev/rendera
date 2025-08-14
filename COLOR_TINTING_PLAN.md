# Color Tinting and Opacity Implementation Plan

## Overview
Implement per-model color tinting and opacity support where the final color is multiplied by `vec4(tint * opacity, opacity)`. This allows for runtime color modification and transparency effects at the model instance level.

## Current Ubershader Analysis

### Fragment Shader Output (Line 636)
```glsl
fragColor = vec4(color, baseColorSample.a);
```

### Key Shader Components
- **PBR Pipeline**: Full physically-based rendering with metallic/roughness workflow
- **Multi-light Support**: Up to 8 lights with shadow mapping
- **Material Textures**: BaseColor, Normal, MetallicRoughness, Occlusion, Emissive
- **Global Illumination**: Hemispheric ambient lighting
- **Tone Mapping**: Reinhard + gamma correction

## Implementation Plan

### 1. **Shader Modifications**

#### Add Tint Uniforms
```glsl
// Fragment shader additions (around line 366)
uniform vec3 u_ModelTint;     // RGB tint color [0-1]
uniform float u_ModelOpacity; // Opacity multiplier [0-1]
```

#### Modify Final Output
```glsl
// Replace line 636:
// fragColor = vec4(color, baseColorSample.a);

// With tinted and opacity-modified output:
vec3 tintedColor = color * u_ModelTint * u_ModelOpacity;
float finalAlpha = baseColorSample.a * u_ModelOpacity;
fragColor = vec4(tintedColor, finalAlpha);
```

### 2. **TypeScript Interface Extensions**

#### Update Types
```typescript
// In types.ts - extend InstanceData
export interface InstanceData {
    // ... existing fields
    tintColor: [number, number, number];  // RGB tint [0-1]
    opacity: number;                      // Opacity [0-1]
}

// Extend IModel interface
export interface IModel {
    // ... existing methods
    setTintColor(r: number, g: number, b: number): void;
    setOpacity(opacity: number): void;
    getTintColor(): [number, number, number];
    getOpacity(): number;
}
```

#### Extend GPUResourceManager
```typescript
// In GPUResourceManager.ts
export class GPUResourceManager {
    // Add method to set tint uniforms
    setModelTint(shader: WebGLProgram, tint: [number, number, number], opacity: number): void {
        const tintLoc = this.gl.getUniformLocation(shader, 'u_ModelTint');
        const opacityLoc = this.gl.getUniformLocation(shader, 'u_ModelOpacity');
        
        if (tintLoc) this.gl.uniform3fv(tintLoc, tint);
        if (opacityLoc) this.gl.uniform1f(opacityLoc, opacity);
    }
}
```

### 3. **Model Class Implementation**

#### Add Tint Properties and Methods
```typescript
// In Model.ts
export class Model implements IModel {
    // Add getters/setters
    get tintColor(): [number, number, number] {
        return this._instanceData.tintColor;
    }
    
    set tintColor(color: [number, number, number]) {
        this._instanceData.tintColor = [
            Math.max(0, Math.min(1, color[0])),
            Math.max(0, Math.min(1, color[1])),
            Math.max(0, Math.min(1, color[2]))
        ];
        this._manager.markInstanceDirty(this.instanceId.id);
    }
    
    get opacity(): number {
        return this._instanceData.opacity;
    }
    
    set opacity(opacity: number) {
        this._instanceData.opacity = Math.max(0, Math.min(1, opacity));
        this._manager.markInstanceDirty(this.instanceId.id);
    }
    
    // Public methods
    public setTintColor(r: number, g: number, b: number): void {
        this.tintColor = [r, g, b];
    }
    
    public setOpacity(opacity: number): void {
        this.opacity = opacity;
    }
    
    public getTintColor(): [number, number, number] {
        return [...this.tintColor];
    }
    
    public getOpacity(): number {
        return this.opacity;
    }
}
```

### 4. **Instance Manager Updates**

#### Initialize Default Values
```typescript
// In InstanceManager.ts - createInstance method
const instanceData: InstanceData = {
    // ... existing fields
    tintColor: [1.0, 1.0, 1.0],  // Default: no tint (white)
    opacity: 1.0                  // Default: fully opaque
};
```

#### Rendering Integration
```typescript
// In renderModelInstances method, before drawing
this.gpuResources.setModelTint(shader, instance.tintColor, instance.opacity);
```

### 5. **Transparency Support**

#### Enable Alpha Blending
```typescript
// In InstanceManager.ts render method
// Check if any instances have opacity < 1.0
const hasTransparency = Array.from(this.instances.values())
    .some(instance => instance.opacity < 1.0);

if (hasTransparency) {
    // Enable alpha blending for transparent objects
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    
    // Optional: Disable depth writing for transparent objects
    // this.gl.depthMask(false);
} else {
    this.gl.disable(this.gl.BLEND);
    this.gl.depthMask(true);
}
```

#### Depth Sorting Consideration
```typescript
// Optional: Sort transparent instances back-to-front
// This would require extending the rendering pipeline
// For now, render in instance order (simpler implementation)
```

### 6. **API Examples**

#### Basic Usage
```javascript
// Set red tint at 50% intensity
model.setTintColor(1.0, 0.5, 0.5);

// Set 75% opacity (25% transparent)
model.setOpacity(0.75);

// Property-style access
model.tintColor = [0.2, 0.8, 1.0];  // Light blue tint
model.opacity = 0.5;                // 50% transparent
```

#### Animation Effects
```javascript
// Fade in effect
let opacity = 0.0;
const fadeIn = setInterval(() => {
    opacity += 0.02;
    model.setOpacity(opacity);
    if (opacity >= 1.0) {
        clearInterval(fadeIn);
    }
}, 16); // 60 FPS

// Damage effect (flash red)
const originalTint = model.getTintColor();
model.setTintColor(1.0, 0.3, 0.3);  // Red tint
setTimeout(() => {
    model.setTintColor(...originalTint);  // Restore
}, 200);
```

### 7. **Performance Considerations**

#### Uniform Caching
```typescript
// Track if tint uniforms are dirty per instance
interface InstanceData {
    // ... existing fields
    tintDirty: boolean;  // Flag for uniform updates
}
```

#### Batch Rendering
- Instances with same tint/opacity can be batched together
- Sort by tint values to minimize uniform changes
- Transparent objects should be rendered after opaque ones

### 8. **Backward Compatibility**

#### Default Values
- **Tint**: `[1.0, 1.0, 1.0]` (white/no tint)
- **Opacity**: `1.0` (fully opaque)
- No visual changes for existing models without explicit tint/opacity changes

#### Migration
- Existing models automatically get default values
- No breaking changes to existing API

### 9. **Testing Strategy**

#### Unit Tests
```typescript
// Test tint color clamping
model.setTintColor(-0.5, 1.5, 0.5);
expect(model.getTintColor()).toEqual([0.0, 1.0, 0.5]);

// Test opacity clamping  
model.setOpacity(1.5);
expect(model.getOpacity()).toBe(1.0);
```

#### Visual Tests
- Solid color models with various tints
- Transparency gradients (opacity 0.0 to 1.0)
- Animated tint changes
- Multiple transparent models with depth

### 10. **Future Enhancements**

#### Advanced Features (Not in Initial Implementation)
- **Per-material tinting**: Different tint for diffuse vs emissive
- **HDR tinting**: Tint values > 1.0 for brightness boost
- **Gradient tinting**: Vertex-based color variation
- **Temporal tinting**: Built-in fade/pulse animations

#### Shader Optimizations
- Conditional compilation based on tint usage
- Pack tint and opacity into single vec4 uniform
- Instance data textures for large model counts

## Implementation Order

1. **Shader modifications** (uniforms + output)
2. **TypeScript interfaces** (types + GPUResourceManager)
3. **Model class** (properties + methods)
4. **Instance manager** (defaults + rendering integration)
5. **Transparency support** (alpha blending)
6. **Testing and validation**

## Estimated Effort
- **Implementation**: 4-6 hours
- **Testing**: 2-3 hours  
- **Documentation**: 1 hour
- **Total**: 7-10 hours

This plan provides a solid foundation for model-level color tinting and opacity with clean API design and efficient implementation.