# Animation Callbacks Example for Rendera-Control

This example shows how to use animation callbacks to trigger events when animations finish, loop, or reach specific states. Works with both worker and non-worker animation modes.

## JavaScript Implementation in Rendera-Control

```javascript
// Example: Character controller with animation callbacks
class CharacterAnimationController {
    constructor(renderaInstance, modelInstance, instanceId) {
        this.rendera = renderaInstance;
        this.model = modelInstance;
        this.instanceId = instanceId;
        this.currentState = 'idle';
        
        // Register callback for this instance
        this.setupAnimationCallbacks();
    }
    
    setupAnimationCallbacks() {
        // Register a callback function that will receive all animation events
        this.rendera.registerAnimationCallback(this.instanceId, (eventData) => {
            this.handleAnimationEvent(eventData);
        });
    }
    
    handleAnimationEvent(eventData) {
        const { 
            instanceId, 
            modelId, 
            animationName, 
            eventType, 
            currentTime, 
            duration, 
            progress 
        } = eventData;
        
        // Handle different event types
        switch(eventType) {
            case 'start':
                console.log(`Animation '${animationName}' started on instance ${instanceId}`);
                this.onAnimationStart(animationName);
                break;
                
            case 'complete':
                console.log(`Animation '${animationName}' completed on instance ${instanceId}`);
                this.onAnimationComplete(animationName);
                break;
                
            case 'loop':
                console.log(`Animation '${animationName}' looped on instance ${instanceId}`);
                this.onAnimationLoop(animationName);
                break;
                
            case 'stop':
                console.log(`Animation '${animationName}' stopped on instance ${instanceId}`);
                this.onAnimationStop(animationName);
                break;
                
            case 'frame':
                // Called every frame - use sparingly to avoid performance impact
                // Useful for syncing effects at specific animation times
                if (animationName === 'Attack' && progress > 0.5 && progress < 0.55) {
                    this.triggerAttackHitbox();
                }
                break;
        }
    }
    
    onAnimationStart(animationName) {
        // Trigger Construct 3 event or update game state
        if (animationName === 'Jump') {
            // Could trigger a Construct event here
            runtime.callFunction('OnCharacterJumpStart', this.instanceId);
        }
    }
    
    onAnimationComplete(animationName) {
        // Handle animation completion
        switch(animationName) {
            case 'Jump':
                // Return to idle after jump
                this.playAnimation('Idle', { loop: true });
                runtime.callFunction('OnCharacterLanded', this.instanceId);
                break;
                
            case 'Attack':
                // Return to combat idle after attack
                this.playAnimation('CombatIdle', { loop: true });
                break;
                
            case 'Death':
                // Trigger death sequence
                runtime.callFunction('OnCharacterDeath', this.instanceId);
                break;
        }
    }
    
    onAnimationLoop(animationName) {
        // Handle looping animations
        if (animationName === 'Walk' || animationName === 'Run') {
            // Play footstep sound
            runtime.callFunction('PlayFootstepSound', this.instanceId);
        }
    }
    
    onAnimationStop(animationName) {
        // Clean up when animation is manually stopped
        console.log(`Stopped ${animationName}`);
    }
    
    triggerAttackHitbox() {
        // Called at specific point in attack animation
        runtime.callFunction('ActivateAttackHitbox', this.instanceId);
    }
    
    playAnimation(name, options = {}) {
        // Play animation with optional blending
        this.model.playAnimation(name, {
            loop: options.loop || false,
            speed: options.speed || 1.0,
            blendDuration: options.blendDuration || 0.3
        });
    }
    
    // Clean up when destroying the character
    destroy() {
        this.rendera.unregisterAnimationCallback(this.instanceId);
    }
}

// Usage in Construct 3 Runtime
const runtime = globalThis.runtime;
const rendera = runtime.objects.Rendera.getFirstInstance();
const character = runtime.objects.Character.getFirstInstance();

// Create animation controller for the character
const animController = new CharacterAnimationController(
    rendera,
    character.model,  // Assuming character has a model reference
    character.instanceId
);

// Play animations with automatic callbacks
animController.playAnimation('Jump', { loop: false });

// The callbacks will automatically fire when:
// - Animation starts: 'start' event
// - Animation completes: 'complete' event (for non-looping)
// - Animation loops: 'loop' event (for looping animations)
// - Animation is stopped: 'stop' event
```

## Integration with Construct 3 Events

### Set up Functions in Event Sheet:

1. **OnCharacterJumpStart(instanceId)**
   - Triggered when jump animation starts
   - Can play jump sound effect
   - Set character state to "jumping"

2. **OnCharacterLanded(instanceId)**
   - Triggered when jump animation completes
   - Play landing effect
   - Set character state to "grounded"

3. **OnCharacterDeath(instanceId)**
   - Triggered when death animation completes
   - Destroy character instance
   - Trigger game over or respawn

4. **PlayFootstepSound(instanceId)**
   - Triggered each time walk/run animation loops
   - Play footstep sound with variation

5. **ActivateAttackHitbox(instanceId)**
   - Triggered at specific point in attack animation
   - Enable damage collision detection

## Animation Event Types

```typescript
enum AnimationEventType {
    START = 'start',      // Animation started playing
    COMPLETE = 'complete', // Animation reached end (non-looping)
    LOOP = 'loop',        // Animation restarted from beginning
    FRAME = 'frame',      // Called every frame (use sparingly)
    STOP = 'stop'         // Animation was stopped manually
}
```

## Event Data Structure

```typescript
interface AnimationEventData {
    instanceId: number;       // Instance ID of the model
    modelId: string;         // Model identifier
    animationName: string;   // Name of the animation
    eventType: string;       // Type of event (start/complete/loop/frame/stop)
    currentTime: number;     // Current time in animation (seconds)
    duration: number;        // Total animation duration (seconds)
    progress: number;        // Progress 0-1 (currentTime/duration)
}
```

## Worker vs Non-Worker Mode

The callback system works identically in both modes:

- **Non-Worker Mode**: Callbacks fire immediately during animation update
- **Worker Mode**: Callbacks fire on main thread after time calculation, before worker processing

Both modes guarantee:
- Accurate event timing
- All events fire in order
- No missed events during mode switches

## Best Practices

1. **Register Once**: Register callbacks when creating model instances
2. **Unregister on Destroy**: Always unregister when destroying instances
3. **Avoid Heavy Processing in FRAME Events**: Frame events fire 60 times per second
4. **Use Instance IDs**: Track which instance triggered the event
5. **Batch State Changes**: Update game state in complete/loop events, not every frame

## Common Patterns

### Animation Chaining
```javascript
onAnimationComplete(animationName) {
    const sequence = {
        'Intro': 'Idle',
        'Attack1': 'Attack2',
        'Attack2': 'Attack3',
        'Attack3': 'CombatIdle'
    };
    
    const nextAnim = sequence[animationName];
    if (nextAnim) {
        this.playAnimation(nextAnim, { 
            loop: nextAnim.includes('Idle'),
            blendDuration: 0.2 
        });
    }
}
```

### State Machine Integration
```javascript
onAnimationComplete(animationName) {
    // Transition to next state based on current state
    switch(this.currentState) {
        case 'attacking':
            this.setState('idle');
            break;
        case 'jumping':
            this.setState('falling');
            break;
        case 'dying':
            this.setState('dead');
            break;
    }
}
```

### Synchronized Effects
```javascript
handleAnimationEvent(eventData) {
    if (eventData.eventType === 'frame') {
        // Sync particle effects to animation progress
        if (eventData.animationName === 'Charging') {
            const intensity = eventData.progress;
            this.updateChargeEffect(intensity);
        }
    }
}
```

## Debugging

Enable console logging to see all animation events:

```javascript
this.rendera.registerAnimationCallback(this.instanceId, (eventData) => {
    console.log('Animation Event:', eventData);
    this.handleAnimationEvent(eventData);
});
```

This will show:
- Event timing
- Animation names
- Progress values
- Instance IDs

Perfect for debugging animation sequences and timing issues.