import { Category, Action, Condition, Expression, addParam, Param } from 'jsr:@lost-c3/lib@3.3.3';
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
            return;
        }
        const result = this.modelLoader.readDocument(path);
        if (!result) {
            console.error('[rendera] Model not found', modelId, path);
            return;
        }
        console.info('[rendera] Model loaded', modelId, path);
    }

    /** @Conditions */
    // @Condition('onCondition', 'On condition', 'On condition')
    // onCondition() {
    //     return false;
    // }

    /** @Expressions */
    //@Expression('expression', 'Expression')
    //Expression() {
    //    return 'Value';
    //}
}