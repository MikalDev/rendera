import { Model } from './Model';
import { Node, Animation, Scene } from '@gltf-transform/core';
import { mat4, vec3, vec4 } from 'gl-matrix';
import { MaterialSystem } from './MaterialSystem';
export declare const MAX_BONES = 256;
export interface IAnimationTarget {
    updateTransform(path: 'translation' | 'rotation' | 'scale', values: Float32Array): void;
}
export interface ExtendedNode extends Node {
    indexData: {
        nodeIndex: number;
        parentIndex: number | null;
        childrenIndices: number[];
    };
}
export type Nullable<T> = T | null;
export interface INodeHierarchy {
    getWorldMatrix(): Float32Array;
    getChildren(): Node[];
}
export interface ISkinDeformer {
    updateJointMatrices(worldMatrices: Map<number, Float32Array>): void;
}
export interface ModelId {
    readonly id: string;
}
export interface InstanceId {
    readonly id: number;
    readonly modelId: string;
}
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
    animationMatrices: Map<number, mat4>;
    boneMatrices: Map<number, Float32Array>;
}
export interface NodeTransforms {
    rotation: vec4;
    translation: vec3;
    scale: vec3;
    weights?: Float32Array;
}
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
export interface MaterialData {
    program: WebGLProgram;
    textures: Map<string, WebGLTexture>;
    uniforms?: Record<string, number | boolean | number[]>;
}
export declare const SAMPLER_TEXTURE_UNIT_MAP: Record<string, number>;
export type SkeletalTransformType = 'translation' | 'rotation' | 'scale';
export type InterpolationType = 'LINEAR' | 'STEP' | 'CUBICSPLINE';
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
}
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
}
export interface IInstanceManager {
    updateModelAnimation(instance: Model, deltaTime: number): void;
    setModelBindPose(instance: Model): void;
    markInstanceDirty(instanceId: number): void;
    invalidateAnimationCache(instanceId: number): void;
    enableModelNode(nodeName: string, instance: Model): void;
    renderShadowMapInstances(modelId: string, instanceGroup: Set<number>, viewProjection: {
        view: mat4;
        projection: mat4;
    }): void;
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
export declare enum TextureType {
    BaseColor = 0,
    MetallicRoughness = 1,
    Normal = 2,
    Occlusion = 3,
    Emissive = 4
}
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
    setShadowMapUniforms(shader: WebGLProgram, enabled: boolean, shadowMap: WebGLTexture | null, lightViewProjection: mat4 | null, bias?: number): void;
    setMultipleShadowMapUniforms(shader: WebGLProgram, shadowMapManager: any, // ShadowMapManager type would create circular dependency
    bias?: number): void;
    getShadowMapShader(): WebGLProgram;
    updateCameraPosition(position: [number, number, number]): void;
    updateBoneUBO(boneMatrices: Float32Array, boneCount: number): void;
    gpuResourceCache: IGPUResourceCache;
    lights: Light[];
}
export type AttributeSemantic = 'POSITION' | 'NORMAL' | 'TEXCOORD_0' | 'JOINTS_0' | 'WEIGHTS_0';
export interface LightBase {
    enabled: boolean;
    color: [number, number, number];
    intensity: number;
    castShadows: boolean;
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
//# sourceMappingURL=types.d.ts.map