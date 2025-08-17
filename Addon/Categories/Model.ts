import { Category, Action, Condition, Expression, addParam, Param } from 'jsr:@lost-c3/lib@3.3.5';
// import type { Instance } from '@Instance';
import type { Instance } from '../Instance.ts';

@Category('modelId', 'Model')
export default class ModelCategory {
    /** @Actions */
    @Action('loadModel', 'Load Model', 'Load model {0}', 'Load model...', {
        params: [
            addParam('path', 'Path', { type: Param.String })
        ]
    })
    loadModel(this: Instance, path: string) {
        const modelId = this.modelLoader.generateModelId(path);
        if (this.modelLoader.hasModel(modelId)) {
            console.info('[rendera] Model already loaded', modelId, path);
            // Trigger immediately if already loaded
            this._triggerModelLoaded(path);
            return;
        }
        
        // Load model asynchronously
        this.modelLoader.loadModel(path).then(() => {
            console.info('[rendera] Model loaded', modelId, path);
            // Trigger the onModelLoaded condition
            this._triggerModelLoaded(path);
        }).catch((error) => {
            console.error('[rendera] Failed to load model', modelId, path, error);
        });
    }

    /** @Conditions */
    @Condition('isModelLoaded', 'Is model loaded', 'Model {0} is loaded', 'Is model loaded?', {
        params: [
            addParam('modelPath', 'Model path', { type: Param.String })
        ]
    })
    isModelLoaded(this: Instance, modelPath: string) {
        const modelId = this.modelLoader.generateModelId(modelPath);
        return this.modelLoader.hasModel(modelId);
    }

    @Condition('isModelLoading', 'Is model loading', 'Model {0} is loading', 'Is model currently loading?', {
        params: [
            addParam('modelPath', 'Model path', { type: Param.String })
        ]
    })
    isModelLoading(this: Instance, modelPath: string) {
        const modelId = this.modelLoader.generateModelId(modelPath);
        return this.modelLoader.modelLoading(modelId);
    }

    @Condition('isRenderaReady', 'Is Rendera ready', 'Rendera is ready', 'Check if Rendera is initialized and ready to load models', {})
    isRenderaReady(this: Instance) {
        return this.initialized;
    }

    @Condition('onModelLoaded', 'On model loaded', 'On model {0} loaded', 'Triggers when model finishes loading', {
        isTrigger: true,
        params: [
            addParam('modelPath', 'Model path', { type: Param.String })
        ]
    })
    onModelLoaded(this: Instance, modelPath: string) {
        // For triggers with parameters, we need to check if this is the correct instance
        // The trigger fires for all instances, but only returns true for matching paths
        return this.getLastLoadedModelPath() === modelPath;
    }

    @Condition('onRenderaReady', 'On Rendera ready', 'On Rendera ready', 'Triggers when Rendera is fully initialized and ready to load models', {
        isTrigger: true
    })
    onRenderaReady(this: Instance) {
        // This trigger fires once when Rendera is ready
        // The instance will handle triggering this condition after initialization
        return true;
    }

    /** @Expressions */
    @Expression('modelLoaded', 'Model loaded', 'Get model loaded status for {0}', {
        params: [
            addParam('modelPath', 'Model path', { type: Param.String })
        ]
    })
    modelLoaded(this: Instance, modelPath: string) {
        // Return 1 if loaded, 0 if not
        const modelId = this.modelLoader.generateModelId(modelPath);
        return this.modelLoader.hasModel(modelId) ? 1 : 0;
    }

    @Action('setAnimationWorker', 'Set animation worker', 'Set animation worker to {0}', 'Enable/disable animation worker', {
        params: [
            addParam('enabled', 'Enabled', { type: Param.Boolean, initialValue: false })
        ]
    })
    setAnimationWorker(this: Instance, enabled: boolean) {
        this.setUseAnimationWorker(enabled);
    }

    @Expression('animationWorkerEnabled', 'Animation worker enabled', 'Get animation worker status', {})
    animationWorkerEnabled(this: Instance) {
        return this.getUseAnimationWorker() ? 1 : 0;
    }
}