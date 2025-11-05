/// <reference lib="dom" />

import { Model } from './Model';

import { Node, Animation, Scene, Document as gltfDocument } from '@gltf-transform/core';

import { mat4, vec3, vec4 } from 'gl-matrix';
import { MaterialSystem } from './MaterialSystem';
import { WebGLState } from './WebGLStateTracker';

export const MAX_BONES = 256;

// Coordinate system conversion: glTF (right-handed Y-up) to C3 (left-handed Y-down)
export const COORDINATE_CONVERSION_MATRIX = mat4.fromValues(
    1,  0,  0,  0,  // X unchanged
    0, -1,  0,  0,  // Flip Y (Y-up to Y-down)
    0,  0, -1,  0,  // Flip Z (right-handed to left-handed)
    0,  0,  0,  1
);

// Apply coordinate conversion to a matrix
export function applyCoordinateConversion(sourceMatrix: mat4): mat4 {
    const result = mat4.create();
    mat4.multiply(result, COORDINATE_CONVERSION_MATRIX, sourceMatrix);
    return result;
}

export interface IAnimationTarget {
    updateTransform(
        path: 'translation' | 'rotation' | 'scale',
        values: Float32Array
    ): void;
}

export interface ExtendedNode extends Node {
    indexData: {
        nodeIndex: number;
        parentIndex: number | null;
        childrenIndices: number[];
    };
}

export type Nullable<T> = T | null;

export interface BoundingSphere {
    center: [number, number, number];
    radius: number;
}

export interface INodeHierarchy {
    getWorldMatrix(): Float32Array;
    getChildren(): Node[];
}

export interface ISkinDeformer {
    updateJointMatrices(worldMatrices: Map<number, Float32Array>): void;
}

// Core identification types
export interface ModelId {
    readonly id: string;
}

export interface InstanceId {
    readonly id: number;
    readonly modelId: string;
}

// Transform and animation
export interface Transform {
    position: Float32Array;
    rotation: Float32Array;
    scale: Float32Array;
}

export interface AnimationState {
    currentAnimation: string | null;
    playing: boolean;
    currentTime: number;
    speed: number;
    blendFactor?: number;
    loop: boolean;
    animationNodeTransforms: Map<number, NodeTransforms>;
    animationMatrices: Map<number, mat4>; // Node index to animation matrix calculated by animation controller for this instance
    boneMatrices: Map<number, Float32Array>;
    // Simple blending state - only exists during transitions
    blendSource?: Map<number, NodeTransforms>;  // Snapshot when blend starts
    blendDuration?: number;   // How long to blend (0 = no blending)
}

export interface NodeTransforms {
    rotation: vec4;
    translation: vec3;
    scale: vec3;
    weights?: Float32Array;
}

// Mesh and GPU resources
export interface MeshPrimitive {
    vao: WebGLVertexArrayObject;
    material: number;
    indexBuffer: WebGLBuffer;
    indexCount: number;
    indexType: number;
    vertexCount: number;
    hasSkin: boolean;
    attributes: {
        POSITION?: WebGLBuffer;
        NORMAL?: WebGLBuffer;
        TEXCOORD_0?: WebGLBuffer;
        JOINTS_0?: WebGLBuffer;
        WEIGHTS_0?: WebGLBuffer;
    };
}

export interface ModelMesh {
    primitives: MeshPrimitive[];
    name: string;
}

// Materials
export interface MaterialData {
    program: WebGLProgram;
    textures: Map<string, WebGLTexture>;
    uniforms?: Record<string, number | boolean | number[]>;
}

// Define a fixed mapping from sampler names to texture units
export const SAMPLER_TEXTURE_UNIT_MAP: Record<string, number> = {
    'u_BaseColorSampler': 0,
    'u_NormalSampler': 1,
    'u_MetallicRoughnessSampler': 2,
    'u_OcclusionSampler': 3,
    'u_EmissiveSampler': 4,
    // Add more samplers here as needed
};

// Shadow mapping
export class ShadowAtlasSlot {
    readonly index: number;      // 0-15 for 4x4 grid
    readonly pixelOffset: [number, number];  // Pixel offset for viewport
    readonly resolution: number; // 1024 for now (each slot in 4K atlas)
    
    constructor(index: number) {
        if (index < 0 || index > 15) {
            throw new Error(`Shadow atlas slot index must be 0-15, got ${index}`);
        }
        this.index = index;
        const row = Math.floor(index / 4);
        const col = index % 4;
        this.pixelOffset = [col * 1024, row * 1024];
        this.resolution = 1024;
    }
}

// Animation

export type SkeletalTransformType = 'translation' | 'rotation' | 'scale';
export type InterpolationType = 'LINEAR' | 'STEP' | 'CUBICSPLINE';

// Instance data
export interface InstanceData {
    readonly instanceId: InstanceId;
    transform: Transform;
    animationState: AnimationState;
    worldMatrix: Float32Array;
    renderOptions: {
        useNormalMap?: boolean;
        lightPosition?: [number, number, number];
    };
    disabledNodes: Set<string>;
    allNodesDisabled: boolean;
    tintColor: [number, number, number]; // RGB 0-1
    opacity: number; // 0-1
    // Maps a unique primitive identifier (nodeIndex_primitiveIndex) to material index
    materialOverrides: Map<string, number>;
}

// Main class interfaces
export interface IModelLoader {
    hasModel(modelId: ModelId): boolean;
    readDocument(url: string, blobGLB: Blob | null): Promise<boolean>;
    processModel(modelId: ModelId): Promise<boolean>;
    getModelData(modelId: string): ModelData | null;
    deleteModel(modelId: string): void;
    generateModelId(url: string): ModelId;
    initialized: boolean;
}

export interface IGPUResourceCache {
    cacheModelMode(): void;
    restoreModelMode(): void;
    getCachedModelState(): WebGLState | null;
}

export interface IInstanceManager {
    // Essential methods that need manager access
    updateModelAnimation(instance: Model, deltaTime: number): void;
    setModelBindPose(instance: Model): void;
    startAnimation(instance: Model, animationName: string, options?: AnimationOptions): void;

    // Helper methods for Model class
    markInstanceDirty(instanceId: number): void;
    invalidateAnimationCache(instanceId: number): void;

    // Complex node operations that need model data access
    enableModelNode(nodeName: string, instance: Model): void;

    // Material switching
    setInstanceMaterial(instance: Model, nodeName: string, materialIndex: number): void;

    // Bone position queries
    getBoneWorldPosition(instanceId: number, boneName: string): [number, number, number] | null;
    getBoneWorldPositionByIndex(instanceId: number, boneIndex: number): [number, number, number] | null;

    // Bone list queries
    getModelBones(modelId: string): { bones: Array<{ index: number; name: string; parentIndex: number | null; children: number[] }> } | null;
    getInstanceBones(instanceId: number): { bones: Array<{ index: number; name: string; parentIndex: number | null; children: number[] }> } | null;

    // Rendering (internal use)
    renderShadowMapInstances(
        modelId: string,
        instanceGroup: Set<number>,
        viewProjection: { view: mat4, projection: mat4 }
    ): void;
}

export interface IModel {
    readonly instanceId: InstanceId;
    setPosition(x: number, y: number, z: number): void;
    setRotation(quaternion: Float32Array): void;
    setScale(x: number, y: number, z: number): void;
    playAnimation(name: string, options?: AnimationOptions): void;
    stopAnimation(): void;
    setAnimationSpeed(speed: number): void;
    setNormalMapEnabled(enabled: boolean): void;
    setBindPose(): void;
    updateAnimation(deltaTime: number): void;
    enableAllNodes(): void;
    disableAllNodes(): void;
    enableNode(nodeName: string): void;
    disableNode(nodeName: string): void;
    isNodeEnabled(nodeName: string): boolean;
}

export enum TextureType {
    BaseColor,
    MetallicRoughness,
    Normal,
    Occlusion,
    Emissive
}

// Supporting interfaces
export interface ModelData {
    meshes: ModelMesh[];
    materials: MaterialData[];
    animations: Map<string, Animation>;
    jointData: JointData[];
    rootNode: Node;
    scene: Scene;
    renderableNodes: {
        node: ExtendedNode;
        modelMesh: ModelMesh;
        useSkinning: boolean;
        nodeName?: string;
    }[];
    materialSystem: MaterialSystem;
    nodeArray?: Node[];
    nodeNameMap: Map<string, ExtendedNode>;
    boundingSphere?: BoundingSphere;
    boneScale?: number; // Scale factor detected from inverse bind matrices
}

export interface JointData {
    index: number;
    name: string;
    inverseBindMatrix: mat4;
    children: number[];
    node: Node;
}

export interface AnimationOptions {
    loop?: boolean;
    speed?: number;
    blendDuration?: number;
}

export type BufferUsage = WebGL2RenderingContext['STATIC_DRAW'] | WebGL2RenderingContext['DYNAMIC_DRAW'];

// Animation event system
export enum AnimationEventType {
    LOOP = 'loop',
    COMPLETE = 'complete',
    START = 'start',
    STOP = 'stop'
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

export type AnimationEventCallback = (data: AnimationEventData) => void;

// GPU resource management
export interface IGPUResourceManager {
    createBuffer(data: BufferSource, usage: BufferUsage): WebGLBuffer;
    createTexture(image: ImageData | HTMLImageElement | ImageBitmap): WebGLTexture;
    deleteBuffer(buffer: WebGLBuffer): void;
    deleteTexture(texture: WebGLTexture): void;
    deleteVertexArray(vao: WebGLVertexArrayObject): void;
    createVertexArray(): WebGLVertexArrayObject;
    getShader(modelId: string): WebGLProgram | null;
    getDefaultShader(): WebGLProgram;
    createIndexBuffer(data: BufferSource, usage: BufferUsage): WebGLBuffer;
    setNormalMapEnabled(program: WebGLProgram, enabled: boolean): void;
    setLightPosition(program: WebGLProgram, lightPosition: [number, number, number]): void;
    updateLight(index: number, lightParams: Partial<Light>): void;
    setLightEnabled(index: number, enabled: boolean): void;
    setLightDirection(index: number, direction: [number, number, number]): void;
    setLightColor(index: number, color: [number, number, number]): void;
    setLightIntensity(index: number, intensity: number): void;
    setSpotLightParams(index: number, angle: number, penumbra: number): void;
    setLightCastShadows(index: number, castShadows: boolean): void;
    bindShaderAndMaterial(shader: WebGLProgram, materialIndex: number, modelData: ModelData): void;
    setShadowMapUniforms(
        shader: WebGLProgram, 
        enabled: boolean, 
        shadowMap: WebGLTexture | null,
        lightViewProjection: mat4 | null,
        bias?: number
    ): void;
    setMultipleShadowMapUniforms(
        shader: WebGLProgram,
        shadowMapManager: any, // ShadowMapManager type would create circular dependency
        bias?: number
    ): void;
    getShadowMapShader(): WebGLProgram;
    updateCameraPosition(position: [number, number, number]): void;
    updateBoneUBO(boneMatrices: Float32Array, boneCount: number): void;
    gpuResourceCache: IGPUResourceCache;
    lights: Light[];
    getWebGLStateTracker?(): any; // Optional: returns WebGLStateTracker instance if available
}

// Add this type definition
export type AttributeSemantic = 'POSITION' | 'NORMAL' | 'TEXCOORD_0' | 'JOINTS_0' | 'WEIGHTS_0';

// Add new light types
export interface LightBase {
    enabled: boolean;
    color: [number, number, number];
    intensity: number;
    castShadows: boolean;
    specularIntensity: number;  // Per-light specular multiplier (0-1, default 1)
    attenuationConstant: number;
    attenuationLinear: number;
    attenuationQuadratic?: number;
}

export interface PointLight extends LightBase {
    type: 'point';
    position: [number, number, number];
    attenuation: number;
}

export interface DirectionalLight extends LightBase {
    type: 'directional';
    direction: [number, number, number];
}

export interface SpotLight extends LightBase {
    type: 'spot';
    position: [number, number, number];
    direction: [number, number, number];
    cosAngle: number;
    spotPenumbra: number;
    attenuation: number;
}

export type Light = PointLight | DirectionalLight | SpotLight;

export interface AnimationTrack {
    jointIndex: number;
    times: Float32Array;
    values: Float32Array;
    interpolation: string;
    transformType: 'translation' | 'rotation' | 'scale';
}