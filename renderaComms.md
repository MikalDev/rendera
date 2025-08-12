# Rendera-Control Communication API

## Overview

This document describes the communication API between the **Rendera** singleton addon and **Rendera-Control** instance-based addons in Construct 3. The API enables Rendera-Control instances to receive animation events from their associated 3D models.

## Animation Event System

### Event Types

The animation event system fires callbacks for the following animation states:

```typescript
enum AnimationEventType {
    START = 'start',      // Animation begins playing
    LOOP = 'loop',        // Animation loops back to beginning
    COMPLETE = 'complete', // Non-looping animation finishes
    FRAME = 'frame',      // Every animation frame update
    STOP = 'stop'         // Animation stopped by user
}
```

### Event Data Structure

Each event provides detailed information about the animation state:

```typescript
interface AnimationEventData {
    instanceId: number;      // Unique instance ID
    modelId: string;         // Model identifier
    animationName: string;   // Name of the animation
    eventType: AnimationEventType; // Type of event
    currentTime: number;     // Current animation time in seconds
    duration: number;        // Total animation duration
    progress: number;        // Progress (0-1)
}
```

## API Methods

### Register Animation Callback

Register a callback function to receive animation events for a specific instance:

```javascript
rendera.registerAnimationCallback(instanceId, callback)
```

**Parameters:**
- `instanceId` (number): The unique ID of the Rendera-Control instance
- `callback` (function): Function to receive animation events

### Unregister Animation Callback

Remove the callback for a specific instance:

```javascript
rendera.unregisterAnimationCallback(instanceId)
```

**Parameters:**
- `instanceId` (number): The unique ID of the Rendera-Control instance

## Integration Example

### Basic Setup in Rendera-Control

```javascript
// In your Rendera-Control instance onCreate
_onCreate() {
    // Get the Rendera singleton
    const rendera = this.runtime.objects.Rendera.getFirstInstance();
    
    if (!rendera) {
        console.warn('Rendera singleton not found');
        return;
    }
    
    // Store reference for later use
    this._rendera = rendera;
    
    // Register callback for this instance
    rendera.registerAnimationCallback(this.instanceId, (eventData) => {
        this._handleAnimationEvent(eventData);
    });
}

// Handle animation events
_handleAnimationEvent(eventData) {
    // Store event data for conditions
    this.lastAnimationEvent = eventData;
    
    // Fire appropriate Construct 3 triggers based on event type
    switch(eventData.eventType) {
        case 'start':
            this.runtime.trigger(this.conditions.OnAnimationStart, this);
            break;
            
        case 'loop':
            this.runtime.trigger(this.conditions.OnAnimationLoop, this);
            break;
            
        case 'complete':
            this.runtime.trigger(this.conditions.OnAnimationComplete, this);
            break;
            
        case 'frame':
            // Update progress for expressions
            this.animationProgress = eventData.progress;
            // Optionally trigger frame event (may be high frequency)
            // this.runtime.trigger(this.conditions.OnAnimationFrame, this);
            break;
            
        case 'stop':
            this.runtime.trigger(this.conditions.OnAnimationStop, this);
            break;
    }
}

// Clean up on destroy
_onDestroy() {
    if (this._rendera) {
        this._rendera.unregisterAnimationCallback(this.instanceId);
    }
}
```

### Implementing Conditions in Rendera-Control

```javascript
// In your conditions.js
Cnds.OnAnimationStart = function() {
    // Trigger already fired by callback
    return true;
};

Cnds.OnAnimationLoop = function() {
    return true;
};

Cnds.OnAnimationComplete = function() {
    return true;
};

// Add condition to check specific animation
Cnds.IsAnimationPlaying = function(animationName) {
    return this.lastAnimationEvent && 
           this.lastAnimationEvent.animationName === animationName;
};
```

### Implementing Expressions

```javascript
// In your expressions.js
Exps.AnimationProgress = function(ret) {
    ret.set_float(this.animationProgress || 0);
};

Exps.CurrentAnimationName = function(ret) {
    ret.set_string(this.lastAnimationEvent?.animationName || "");
};

Exps.AnimationTime = function(ret) {
    ret.set_float(this.lastAnimationEvent?.currentTime || 0);
};
```

## Performance Considerations

### Filtering High-Frequency Events

The `FRAME` event fires every animation frame and can impact performance. Consider filtering it:

```javascript
_handleAnimationEvent(eventData) {
    // Skip frame events if not needed
    if (eventData.eventType === 'frame') {
        // Only update internal state, don't fire triggers
        this.animationProgress = eventData.progress;
        return;
    }
    
    // Handle other events...
}
```

### Batch Processing

If you need frame-by-frame updates, consider batching:

```javascript
_handleAnimationEvent(eventData) {
    if (eventData.eventType === 'frame') {
        // Accumulate frame data
        this._frameCount = (this._frameCount || 0) + 1;
        
        // Process every Nth frame
        if (this._frameCount % 10 === 0) {
            this.runtime.trigger(this.conditions.OnAnimationUpdate, this);
        }
        return;
    }
    // Handle other events...
}
```

## Event Flow Diagram

```
Rendera-Control Instance
        |
        | registerAnimationCallback()
        v
Rendera Singleton (InstanceManager)
        |
        v
AnimationController
        |
        | Animation plays
        v
    Event Detected
        |
        | fireAnimationEvent()
        v
    Callback Invoked
        |
        v
Rendera-Control Instance
        |
        | runtime.trigger()
        v
    C3 Event Sheet
```

## Best Practices

1. **Always unregister callbacks** in `_onDestroy()` to prevent memory leaks
2. **Filter events** you don't need, especially `FRAME` events
3. **Store event data** for use in conditions and expressions
4. **Check for Rendera singleton** before registering callbacks
5. **Use instance IDs consistently** between Rendera and Rendera-Control

## Debugging

To debug animation events, add logging to your callback:

```javascript
_handleAnimationEvent(eventData) {
    console.log(`[Rendera-Control ${this.instanceId}] Animation event:`, {
        type: eventData.eventType,
        animation: eventData.animationName,
        progress: (eventData.progress * 100).toFixed(1) + '%',
        time: eventData.currentTime.toFixed(2) + 's'
    });
    
    // Handle event...
}
```

## TypeScript Support

If using TypeScript in your Rendera-Control addon:

```typescript
interface AnimationEventData {
    instanceId: number;
    modelId: string;
    animationName: string;
    eventType: 'start' | 'loop' | 'complete' | 'frame' | 'stop';
    currentTime: number;
    duration: number;
    progress: number;
}

type AnimationEventCallback = (data: AnimationEventData) => void;

interface IRenderaInstance {
    registerAnimationCallback(instanceId: number, callback: AnimationEventCallback): void;
    unregisterAnimationCallback(instanceId: number): void;
}
```

## Limitations

- Only animation events are supported (not transform or node state changes)
- One callback per instance (not per event type)
- Callbacks are not persisted across save/load
- Events are only fired for playing animations

## Future Enhancements

Potential future additions to the API:
- Transform change events (position, rotation, scale)
- Node visibility events
- Model loading events
- Custom user-defined events