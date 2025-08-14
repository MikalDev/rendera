# Rendera-Control: Add Model Tint & Opacity Actions

## Task  
Add 2 actions to Rendera-Control addon for setting model tint and opacity.

⚠️ **PREREQUISITE**: The Rendera plugin must first implement `setTintColor()` and `setOpacity()` methods. These do not currently exist.

## Required Rendera Plugin Changes First

### 1. Add tint/opacity to InstanceData interface:
```typescript
export interface InstanceData {
    // ... existing fields
    tintColor: [number, number, number]; // RGB 0-1
    opacity: number; // 0-1
}
```

### 2. Add methods to Model class:
```typescript
public setTintColor(r: number, g: number, b: number): void {
    this._instanceData.tintColor = [r, g, b];
    this._manager.markInstanceDirty(this.instanceId.id);
}

public setOpacity(opacity: number): void {
    this._instanceData.opacity = opacity;
    this._manager.markInstanceDirty(this.instanceId.id);
}
```

### 3. Update shaders to use tint/opacity uniforms:
Fragment shader needs:
```glsl
uniform vec3 u_TintColor;
uniform float u_Opacity;

// In main():
vec4 finalColor = vec4(baseColor.rgb * u_TintColor, baseColor.a * u_Opacity);
gl_FragColor = finalColor;
```

### 4. Update InstanceManager to set uniforms:
```typescript
// Set tint and opacity uniforms
const tintLoc = this.uniformCache.getLocation(shader, 'u_TintColor');
const opacityLoc = this.uniformCache.getLocation(shader, 'u_Opacity');
if (tintLoc !== -1) this.gl.uniform3fv(tintLoc, instance.tintColor);
if (opacityLoc !== -1) this.gl.uniform1f(opacityLoc, instance.opacity);
```

## Rendera-Control Implementation (After Plugin Changes)

### Add helper method (DRY):
```typescript
private withModel(modelUID: number, action: (model: any) => void): void {
    const model = this.getModelByUID(modelUID);
    if (model) {
        action(model);
    }
}
```

### Add actions to existing Rendera-Control action category:

```typescript
@Action('setTint', 'Set model tint', 'Set model {0} tint to RGB({1}, {2}, {3})', {
    params: [
        addParam('modelUID', 'Model UID', { type: Param.Number }),
        addParam('red', 'Red (0-1)', { type: Param.Number, initialValue: 1 }),
        addParam('green', 'Green (0-1)', { type: Param.Number, initialValue: 1 }),
        addParam('blue', 'Blue (0-1)', { type: Param.Number, initialValue: 1 })
    ]
})
setTint(modelUID: number, red: number, green: number, blue: number): void {
    this.withModel(modelUID, model => {
        model.setTintColor(
            Math.max(0, Math.min(1, red)),
            Math.max(0, Math.min(1, green)), 
            Math.max(0, Math.min(1, blue))
        );
    });
}

@Action('setOpacity', 'Set model opacity', 'Set model {0} opacity to {1}', {
    params: [
        addParam('modelUID', 'Model UID', { type: Param.Number }),
        addParam('opacity', 'Opacity (0-1)', { type: Param.Number, initialValue: 1 })
    ]
})
setOpacity(modelUID: number, opacity: number): void {
    this.withModel(modelUID, model => {
        model.setOpacity(Math.max(0, Math.min(1, opacity)));
    });
}
```

## Principles Applied
- **DRY**: `withModel()` helper eliminates duplicate model lookup
- **KISS**: Simple validation with clamp function
- **SOLID**: Single responsibility per action, common pattern extracted
- **YAGNI**: No unnecessary getters or complex features

## Usage
- **Set red tint**: Action "Set model tint" → UID: 1, RGB: (1, 0.5, 0.5)
- **Make transparent**: Action "Set model opacity" → UID: 1, Opacity: 0.5