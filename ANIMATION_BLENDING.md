# Animation Blending API for Rendera-Control

## Overview
The Rendera plugin now supports smooth animation blending (cross-fading) between animations. This allows for natural transitions when switching from one animation to another.

## Usage from Rendera-Control

### JavaScript API
When using Rendera-Control or direct JavaScript access, you can enable animation blending by passing a `blendDuration` option to the `playAnimation` method:

```javascript
// Get the model instance (from Rendera-Control)
const model = runtime.objects.YourModelInstance;

// Play animation with smooth 0.5 second blend transition
model.playAnimation("run", {
    loop: true,
    speed: 1.0,
    blendDuration: 0.5  // Blend over 0.5 seconds
});

// Later, transition to idle with 1 second blend
model.playAnimation("idle", {
    loop: true,
    blendDuration: 1.0  // Smooth 1 second transition
});

// Instant switch (no blending) - just omit blendDuration
model.playAnimation("jump", {
    loop: false
    // No blendDuration = instant switch
});
```

### From Construct 3 Events

If using Rendera-Control's action system in Construct 3:

1. Use the "Play Animation" action
2. Set the animation name
3. Set loop (true/false)
4. Set speed (default 1.0)
5. Set blend duration (in seconds, 0 for no blending)

## API Reference

### AnimationOptions Interface
```typescript
interface AnimationOptions {
    loop?: boolean;        // Default: true
    speed?: number;        // Default: 1.0 (0.1 to 10.0)
    blendDuration?: number; // Default: undefined (no blending)
}
```

### Parameters

- **loop**: Whether the animation should repeat
- **speed**: Playback speed multiplier (0.1x to 10x)
- **blendDuration**: Time in seconds to blend from current animation to new one
  - `0` or `undefined`: Instant switch (no blending)
  - `> 0`: Smooth transition over specified duration

## How It Works

When `blendDuration` is specified:

1. The system captures the current pose (position, rotation, scale of all bones/nodes)
2. The new animation starts playing from time 0
3. Over the blend duration, the system interpolates:
   - Translation: Linear interpolation
   - Rotation: Spherical linear interpolation (slerp)
   - Scale: Linear interpolation
4. After blend completes, only the target animation continues playing

## Performance Notes

- Blending adds minimal overhead (one extra transform interpolation pass)
- Blend state is automatically cleaned up after completion
- Works with both main thread and worker thread animation modes
- No performance impact when not using blending

## Best Practices

- **Walking to Running**: Use 0.2-0.5 second blends
- **Action to Idle**: Use 0.5-1.0 second blends  
- **Death/Hit Reactions**: Use instant switch (no blend)
- **Looping Animations**: Always use blending for smooth loops

## Example: Character Controller

```javascript
class CharacterController {
    constructor(modelInstance) {
        this.model = modelInstance;
        this.currentState = 'idle';
    }
    
    setState(newState, blendTime = 0.3) {
        if (newState === this.currentState) return;
        
        const animations = {
            'idle': { name: 'Idle', loop: true },
            'walk': { name: 'Walk', loop: true },
            'run': { name: 'Run', loop: true },
            'jump': { name: 'Jump', loop: false }
        };
        
        const anim = animations[newState];
        if (anim) {
            this.model.playAnimation(anim.name, {
                loop: anim.loop,
                speed: 1.0,
                blendDuration: blendTime
            });
            this.currentState = newState;
        }
    }
}

// Usage
const character = new CharacterController(modelInstance);
character.setState('walk', 0.3);  // Blend to walk over 0.3 seconds
character.setState('run', 0.2);   // Quick blend to run
character.setState('idle', 0.5);  // Smooth return to idle
```

## Compatibility

- Requires Rendera plugin version 1.1.0 or higher
- Works with all GLTF/GLB models with animations
- Compatible with skeletal and node-based animations
- No changes needed for models without blending (backward compatible)