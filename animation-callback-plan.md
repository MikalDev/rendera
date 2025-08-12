# Animation Event Callback System Implementation Plan

## Overview
Implement a callback registration system to allow Rendera-Control instances to receive animation events from the Rendera singleton addon.

## Architecture Decision
**Chosen Approach: Callback Registration with Instance Triggers**

### Why This Approach?
1. **Clean Separation**: Rendera handles animation logic, Rendera-Control handles triggers
2. **Per-Instance Control**: Each Rendera-Control instance manages its own triggers
3. **C3 Integration**: Triggers fire from Rendera-Control, making them available in event sheets
4. **Type Safety**: Callback interfaces provide clear contracts

## Implementation Flow
```
Rendera-Control Instance → Registers callbacks → Rendera Singleton
                                                        ↓
                                              Animation happens
                                                        ↓
                                              Event detected
                                                        ↓
Rendera-Control Instance ← Callback invoked ← Rendera Singleton
        ↓
   Fires C3 Trigger
```

## Implementation Steps

### 1. Add Event Types and Callbacks Interface
**File: `Addon/Model/src/types.ts`**

Add the following interfaces:
```typescript
export enum AnimationEventType {
    LOOP = 'loop',
    COMPLETE = 'complete',
    FRAME = 'frame',
    START = 'start'
}

export interface AnimationEventData {
    instanceId: number;
    modelId: string;
    animationName: string;
    eventType: AnimationEventType;
    currentTime: number;
    duration: number;
    progress: number; // 0-1
}

export interface AnimationCallbacks {
    onLoop?: (data: AnimationEventData) => void;
    onComplete?: (data: AnimationEventData) => void;
    onFrame?: (data: AnimationEventData) => void;
    onStart?: (data: AnimationEventData) => void;
}
```

### 2. Implement Callback Registry in AnimationController
**File: `Addon/Model/src/AnimationController.ts`**

Add to class:
```typescript
private animationCallbacks: Map<number, AnimationCallbacks> = new Map();
private previousAnimationTimes: Map<number, number> = new Map();

public registerAnimationCallbacks(instanceId: number, callbacks: AnimationCallbacks): void {
    this.animationCallbacks.set(instanceId, callbacks);
}

public unregisterAnimationCallbacks(instanceId: number): void {
    this.animationCallbacks.delete(instanceId);
    this.previousAnimationTimes.delete(instanceId);
}

private fireAnimationEvent(
    instanceId: number,
    eventType: AnimationEventType,
    animationName: string,
    currentTime: number,
    duration: number
): void {
    const callbacks = this.animationCallbacks.get(instanceId);
    if (!callbacks) return;
    
    const eventData: AnimationEventData = {
        instanceId,
        modelId: '', // Get from instance
        animationName,
        eventType,
        currentTime,
        duration,
        progress: duration > 0 ? currentTime / duration : 0
    };
    
    switch (eventType) {
        case AnimationEventType.LOOP:
            callbacks.onLoop?.(eventData);
            break;
        case AnimationEventType.COMPLETE:
            callbacks.onComplete?.(eventData);
            break;
        case AnimationEventType.FRAME:
            callbacks.onFrame?.(eventData);
            break;
        case AnimationEventType.START:
            callbacks.onStart?.(eventData);
            break;
    }
}
```

Modify `updateTime()` method:
```typescript
private updateTime(
    state: AnimationState, 
    deltaTime: number, 
    duration: number,
    instanceId: number,
    animationName: string
): number {
    const previousTime = this.previousAnimationTimes.get(instanceId) ?? 0;
    const newTime = state.currentTime + (deltaTime * state.speed);
    
    let finalTime: number;
    
    if (state.loop) {
        finalTime = newTime % duration;
        
        // Detect loop
        if (newTime >= duration && previousTime < duration) {
            this.fireAnimationEvent(
                instanceId,
                AnimationEventType.LOOP,
                animationName,
                finalTime,
                duration
            );
        }
    } else {
        finalTime = Math.min(newTime, duration);
        
        // Detect completion
        if (finalTime >= duration && previousTime < duration) {
            this.fireAnimationEvent(
                instanceId,
                AnimationEventType.COMPLETE,
                animationName,
                finalTime,
                duration
            );
        }
    }
    
    // Always fire frame event
    this.fireAnimationEvent(
        instanceId,
        AnimationEventType.FRAME,
        animationName,
        finalTime,
        duration
    );
    
    this.previousAnimationTimes.set(instanceId, finalTime);
    return finalTime;
}
```

### 3. Expose API through InstanceManager
**File: `Addon/Model/src/InstanceManager.ts`**

Add methods:
```typescript
public registerAnimationCallbacks(instanceId: number, callbacks: AnimationCallbacks): void {
    this._animationController.registerAnimationCallbacks(instanceId, callbacks);
}

public unregisterAnimationCallbacks(instanceId: number): void {
    this._animationController.unregisterAnimationCallbacks(instanceId);
}
```

### 4. Expose Public API in Rendera Instance
**File: `Addon/Instance.ts`**

Add public methods:
```typescript
public registerAnimationCallbacks(instanceId: number, callbacks: any): void {
    if (!this.instanceManager) return;
    this.instanceManager.registerAnimationCallbacks(instanceId, callbacks);
}

public unregisterAnimationCallbacks(instanceId: number): void {
    if (!this.instanceManager) return;
    this.instanceManager.unregisterAnimationCallbacks(instanceId);
}
```

### 5. Create Documentation
**File: `renderaComms.md`**

Create comprehensive documentation for Rendera-Control developers with:
- API reference
- Usage examples
- Event flow diagrams
- TypeScript interfaces
- Integration guide

## Testing Strategy

1. **Loop Detection**
   - Test with looping animation
   - Verify callback fires when animation wraps from end to start
   - Check event data accuracy

2. **Completion Detection**
   - Test with non-looping animation
   - Verify callback fires at exact duration
   - Ensure no multiple fires

3. **Frame Events**
   - Verify continuous frame events during playback
   - Check progress calculation (0-1 range)

4. **Memory Management**
   - Test callback unregistration
   - Verify no memory leaks with instance cleanup
   - Check Map cleanup

5. **Multiple Instances**
   - Test multiple Rendera-Control instances
   - Verify correct callback routing
   - Check instance isolation

## Usage Example for Rendera-Control

```javascript
// In Rendera-Control instance
_onCreate() {
    // Get Rendera singleton
    const rendera = this.runtime.objects.Rendera.getFirstInstance();
    
    // Register callbacks
    rendera.registerAnimationCallbacks(this.instanceId, {
        onLoop: (data) => {
            // Store event data for conditions
            this.lastAnimationEvent = data;
            // Fire C3 trigger
            this.runtime.trigger(this.conditions.OnAnimationLoop, this);
        },
        onComplete: (data) => {
            this.lastAnimationEvent = data;
            this.runtime.trigger(this.conditions.OnAnimationComplete, this);
        },
        onFrame: (data) => {
            this.animationProgress = data.progress;
            // Could fire frame trigger if needed
        }
    });
}

_onDestroy() {
    const rendera = this.runtime.objects.Rendera.getFirstInstance();
    rendera.unregisterAnimationCallbacks(this.instanceId);
}
```

## Files to Modify Summary

1. `Addon/Model/src/types.ts` - Add interfaces
2. `Addon/Model/src/AnimationController.ts` - Core implementation
3. `Addon/Model/src/InstanceManager.ts` - API forwarding
4. `Addon/Instance.ts` - Public API
5. `renderaComms.md` - Documentation (new file)

## Notes

- Instance IDs must be consistent between Rendera and Rendera-Control
- Consider adding batch registration for multiple instances
- May want to add priority system for callbacks
- Consider adding event filtering options