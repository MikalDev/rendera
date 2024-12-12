export enum ModelErrorCode {
    LOAD_FAILED = 'LOAD_FAILED',
    RESOURCE_CREATION_FAILED = 'RESOURCE_CREATION_FAILED',
    INVALID_MODEL = 'INVALID_MODEL',
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
    ANIMATION_NOT_FOUND = 'ANIMATION_NOT_FOUND',
    GL_ERROR = 'GL_ERROR',
    INVALID_DATA = 'INVALID_DATA',
    NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
    ANIMATION_INVALID_DATA = 'ANIMATION_INVALID_DATA',
    ANIMATION_INTERPOLATION_ERROR = 'ANIMATION_INTERPOLATION_ERROR'
}

export interface ModelError extends Error {
    code: ModelErrorCode;
    modelId?: string;
}

export function createModelError(
    code: ModelErrorCode, 
    message: string, 
    modelId?: string
): ModelError {
    return {
        name: 'ModelError',
        message,
        code,
        modelId
    };
}