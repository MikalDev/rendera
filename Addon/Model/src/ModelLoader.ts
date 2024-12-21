import { Animation,Accessor, Document, Node, Primitive, WebIO, Texture, Mesh, TextureInfo } from '@gltf-transform/core';
import { ModelError, ModelErrorCode, createModelError } from './errors';
import { AttributeSemantic, ModelId, ModelData, IGPUResourceManager, MeshPrimitive, MaterialData, IModelLoader, SAMPLER_TEXTURE_UNIT_MAP, ModelMesh } from './types';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { DracoDecoderModule } from './draco_decoder_gltf';
import { mat4} from 'gl-matrix';
import { MaterialSystem } from './MaterialSystem';
export class ModelLoader implements IModelLoader {
    public gl: WebGL2RenderingContext;
    private loadedModels: Map<string, ModelData> = new Map();
    private gpuResources: IGPUResourceManager;
    private webio!: WebIO;
    private _pendingDocuments = new Map<string, Document>();
    private _modelsLoading = new Map<string, boolean>();
    public initialized: boolean = false;

    constructor(gl: WebGL2RenderingContext, gpuResources: IGPUResourceManager) {
        this.gl = gl;
        this.gpuResources = gpuResources;
        this.createWebIO();
    }

    private async createWebIO(): Promise<void> {
        const dracoDecoder = await (DracoDecoderModule as () => Promise<unknown>)();
        console.log('ModelLoader: dracoDecoder loaded')
        this.webio = new WebIO()
            .registerExtensions([...ALL_EXTENSIONS])
            .registerDependencies({
                'draco3d.decoder': dracoDecoder
            });
        this.initialized = true;
    }

    async loadModel(modelPath: string, blobGLB: Blob | null = null): Promise<ModelData> {
        if (this._modelsLoading.has(modelPath)) {
            console.warn('[rendera] ModelLoader: loadModel - model already loading', modelPath);
            return {id: modelPath};
        }
        this._modelsLoading.set(modelPath, true);
        await this.readDocument(modelPath, blobGLB);
        await this.processPendingDocuments();
        this._modelsLoading.delete(modelPath);
        return {id: modelPath};
    }

    async readDocument(modelPath: string, blobGLB: Blob): Promise<boolean> {
        try {
            let document;
            if (blobGLB) {
                // Convert Blob to ArrayBuffer
                const arrayBuffer = await blobGLB.arrayBuffer();
                document = await this.webio.readBinary(new Uint8Array(arrayBuffer));
            } else {
                document = await this.webio.read(modelPath);
            }
            
            console.info('[rendera] ModelLoader: read', modelPath);
            this._pendingDocuments.set(modelPath, document);
            return true;
        } catch (error) {
            throw this.createModelError(ModelErrorCode.LOAD_FAILED, `Failed to read document: ${error}`);
        }
    }

    hasModel(modelId: ModelId): boolean {
        return this.loadedModels.has(modelId.id);
    }

    modelLoading(modelId: ModelId): boolean {
        return this._modelsLoading.has(modelId.id);
    }

    async processModel(modelId: ModelId): Promise<boolean> {

        const document = this._pendingDocuments.get(modelId.id);
        this._pendingDocuments.delete(modelId.id);
        if (!document) {
            console.error('[rendera] ModelLoader: processModel - document not found', modelId.id);
            return false;
        }

        const modelData = await this.processDocument(document);
        if (!modelData) {
            console.error('[rendera] ModelLoader: processModel - modelData not found', modelId.id);
            return false;
        }
        
        // Store model data
        this.loadedModels.set(modelId.id, modelData);
        // const preparedModelData = this.prepareModelDataForWorker(modelData);
        //console.log('[rendera] ModelLoader: processModel - preparedModelData', preparedModelData);
        console.info('[rendera] ModelLoader: processModel - modelData loaded', modelId.id);
        return true;
    }

    get pendingDocuments(): Map<string, Document> {
        return this._pendingDocuments;
    }

    async processPendingDocuments(): Promise<number> {
        const pendingDocuments = this.pendingDocuments;
        if (pendingDocuments.size === 0) return 0;
        console.log('[rendera] ModelLoader: processPendingDocuments', this.pendingDocuments.size);
        let count = 0;
		for (const [id, _document] of pendingDocuments.entries()) {
			const modelId: ModelId = { id };
			await this.processModel(modelId);
			count++;
			console.info('[rendera] processFiles', modelId.id);
		}
        return count;
    }

    getModelData(modelId: string): ModelData | null {
        return this.loadedModels.get(modelId) || null;
    }

    deleteModel(modelId: string): void {
        const modelData = this.loadedModels.get(modelId);
        if (!modelData) return;

        // Clean up GPU resources
        this.cleanupModelResources(modelData);
        this.loadedModels.delete(modelId);
    }

    private async processDocument(document: Document): Promise<ModelData> {
        const modelData: ModelData = {
            meshes: [],
            materials: [],
            animations: new Map(),
            jointData: [],
            rootNode: document.getRoot().listScenes()[0].listChildren()[0],
            scene: document.getRoot().listScenes()[0],
            renderableNodes: [],
            materialSystem: new MaterialSystem(this.gl, SAMPLER_TEXTURE_UNIT_MAP)
        };

        /*
        await Promise.all([
            this.processMeshes(document, modelData),
            this.processMaterials(document, modelData),
            this.processAnimations(document, modelData),
            this.processJoints(document, modelData)
        ]);
        */

        console.log('ModelLoader: processDocument',);
        this.gpuResources.gpuResourceCache.cacheModelMode();
        // Process each component sequentially for easier debugging
        console.log('ModelLoader: processAnimations', modelData);
        await this.processJoints(document, modelData);
        console.log('ModelLoader: processJoints', modelData);
        await this.processRenderableNodes(document, modelData);
        console.log('ModelLoader: processRenderableNodes', modelData);
        this.gpuResources.gpuResourceCache.restoreModelMode();
        await this.processMaterials(document, modelData);
        console.log('ModelLoader: processMaterials', modelData);
        console.log('ModelLoader: processDocument', modelData);
        await this.processAnimations(document, modelData);

        return modelData;
    }

    private async processRenderableNodes(document: Document, modelData: ModelData): Promise<void> {
        const scene = document.getRoot().listScenes()[0];
        scene.traverse(node => {
            const mesh = node.getMesh();
            if (mesh) {
                const modelMesh = this.processMesh(mesh, document);
                console.log('ModelLoader: processRenderableNodes', node.getName(), !!node.getSkin());
                modelData.renderableNodes.push({
                    node,
                    modelMesh,
                    useSkinning: !!node.getSkin()
                });
            }
        });
    }

    private processMesh(mesh: Mesh, document: Document): ModelMesh {
        const modelMesh: ModelMesh = {
            primitives: [],
            name: mesh.getName() || ''
        };
        for (const primitive of mesh.listPrimitives()) {
            const primData = this.processPrimitive(primitive, document);
            modelMesh.primitives.push(primData);
        }
        return modelMesh;
    }

    private processPrimitive(
        primitive: Primitive,
        document: Document
    ): MeshPrimitive {
        const vao = this.gpuResources.createVertexArray();
        this.gl.bindVertexArray(vao);

        const attributes: MeshPrimitive['attributes'] = {};

        let hasSkin = false;
        
        // Get position attribute first and validate
        const positionAttribute = primitive.getAttribute('POSITION');
        if (!positionAttribute) {
            throw this.createModelError(
                ModelErrorCode.INVALID_DATA,
                'Primitive missing required POSITION attribute'
            );
        }

        const TYPE_TO_SIZE: Record<string, number> = {
            SCALAR: 1,
            VEC2: 2,
            VEC3: 3,
            VEC4: 4,
            MAT2: 4,
            MAT3: 9,
            MAT4: 16
        };

        // Process vertex attributes
        for (const semantic of primitive.listSemantics()) {
            const accessor = primitive.getAttribute(semantic)!;
            const buffer = this.createAttributeBuffer(accessor);
            attributes[semantic as AttributeSemantic] = buffer;

            const location = this.getAttributeLocation(semantic);
            console.log('ModelLoader: processPrimitive', location, semantic);
            this.gl.enableVertexAttribArray(location);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            
            const componentType = accessor.getComponentType();
            const elementSize = TYPE_TO_SIZE[accessor.getType()] ?? 1;
            const normalized = accessor.getNormalized();

            console.log('ModelLoader: processPrimitive', location, semantic, componentType, elementSize, normalized);

            if (semantic === 'JOINTS_0') {
                hasSkin = true;
                console.log('ModelLoader: processPrimitive', componentType, elementSize, location);
                this.gl.vertexAttribIPointer(
                    location,
                    elementSize,
                    componentType,
                    0,  // stride of 0 lets WebGL handle stride automatically
                    0   // no offset needed
                );
            } else {
                this.gl.vertexAttribPointer(
                    location,
                    elementSize,
                    componentType,
                    normalized,
                0,  // stride of 0 lets WebGL handle stride automatically
                0   // no offset needed
                );
            }
        }

        // Disable skinning attributes if not used
        if (!hasSkin) {
            console.log('ModelLoader: processPrimitive - disable skinning attributes');
            this.gl.disableVertexAttribArray(this.getAttributeLocation('JOINTS_0'));
            this.gl.vertexAttribI4uiv(this.getAttributeLocation('JOINTS_0'), [0, 0, 0, 0]);
            this.gl.disableVertexAttribArray(this.getAttributeLocation('WEIGHTS_0'));
            this.gl.vertexAttrib4fv(this.getAttributeLocation('WEIGHTS_0'), [0, 0, 0, 0]);
        }

        // Process indices
        const indices = primitive.getIndices();
        const indexBuffer = indices ? this.createIndexBuffer(indices) : null;

        // Unbind VAO first
        this.gl.bindVertexArray(null);

        // Then unbind buffers
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);

        return {
            material: this.getMaterialIndex(primitive, document),
            indexBuffer: indexBuffer!,
            indexCount: indices?.getCount() ?? 0,
            indexType: this.getIndexType(indices ?? null),
            vertexCount: positionAttribute.getCount(),
            hasSkin: !!primitive.getAttribute('JOINTS_0'),
            attributes,
            vao
        };
    }

    private getMaterialIndex(primitive: Primitive, document: Document): number {
        const material = primitive.getMaterial();
        const materials = document.getRoot().listMaterials();
        return material ? materials.indexOf(material) : 0;
    }

    private async processMaterials(
        document: Document, 
        modelData: ModelData
    ): Promise<void> {
        const materials = document.getRoot().listMaterials();
        
        for (const material of materials) {
            const materialData: MaterialData = {
                program: this.gpuResources.getDefaultShader(),
                textures: new Map(),
                uniforms: {
                    u_BaseColorFactor: Array.from(material.getBaseColorFactor() || [1, 1, 1, 1]),
                    u_MetallicFactor: material.getMetallicFactor() ?? 1.0,
                    u_RoughnessFactor: material.getRoughnessFactor() ?? 1.0,
                    u_EmissiveFactor: Array.from(material.getEmissiveFactor() || [0, 0, 0])
                }
            };

            // Iterate over the SAMPLER_TEXTURE_UNIT_MAP to assign textures
            for (const [samplerName] of Object.entries(SAMPLER_TEXTURE_UNIT_MAP)) {
                let texturePromise: Promise<WebGLTexture> | null = null;
                
                switch (samplerName) {
                    case 'u_BaseColorSampler':
                        const baseColorTexture = material.getBaseColorTexture();
                        if (baseColorTexture) {
                            const textureInfo = material.getBaseColorTextureInfo();
                            texturePromise = this.loadTexture(baseColorTexture, textureInfo);
                        }
                        break;
                    case 'u_MetallicRoughnessSampler':
                        const metallicRoughnessTexture = material.getMetallicRoughnessTexture();
                        if (metallicRoughnessTexture) {
                            const textureInfo = material.getMetallicRoughnessTextureInfo();
                            texturePromise = this.loadTexture(metallicRoughnessTexture, textureInfo);
                        }
                        break;
                    case 'u_NormalSampler':
                        const normalTexture = material.getNormalTexture();
                        if (normalTexture) {
                            const textureInfo = material.getNormalTextureInfo();
                            texturePromise = this.loadTexture(normalTexture, textureInfo);
                        }
                        break;
                    case 'u_OcclusionSampler':
                        const occlusionTexture = material.getOcclusionTexture();
                        if (occlusionTexture) {
                            const textureInfo = material.getOcclusionTextureInfo();
                            texturePromise = this.loadTexture(occlusionTexture, textureInfo);
                        }
                        break;
                    case 'u_EmissiveSampler':
                        const emissiveTexture = material.getEmissiveTexture();
                        if (emissiveTexture) {
                            const textureInfo = material.getEmissiveTextureInfo();
                            texturePromise = this.loadTexture(emissiveTexture, textureInfo);
                        }
                        break;
                    // Add more cases here if additional samplers are defined in SAMPLER_TEXTURE_UNIT_MAP
                    default:
                        console.warn(`Unhandled sampler name: ${samplerName}`);
                }

                if (texturePromise) {
                    const texture = await texturePromise;
                    materialData.textures.set(samplerName, texture);
                }
            }
            modelData.materialSystem.addMaterial(materialData);
        }
    }

    private processAnimations(document: Document, modelData: ModelData): void {
        const animations = document.getRoot().listAnimations();
        for (const animation of animations) {
            modelData.animations.set(animation.getName(), animation);
        }
    }

    private processJoints(document: Document, modelData: ModelData) {
        const skins = document.getRoot().listSkins();
        console.info('ModelLoader: processJoints:', skins.length);
        if (skins.length === 0) return;

        const skin = skins[0];
        const joints = skin.listJoints();

        if (joints.length === 0) {
            throw this.createModelError(
                ModelErrorCode.INVALID_DATA,
                'Skin contains no joints'
            );
        }

        // Get all inverse bind matrices at once
        const inverseBindMatrices = skin.getInverseBindMatrices();
        if (!inverseBindMatrices) {
            throw this.createModelError(
                ModelErrorCode.INVALID_DATA,
                'Skin missing inverse bind matrices'
            );
        }

        const matrices = inverseBindMatrices.getArray();
        if (!matrices) {
            throw this.createModelError(
                ModelErrorCode.INVALID_DATA,
                'Failed to get inverse bind matrices data'
            );
        }

        modelData.jointData = joints.map((joint, index) => {
            // Get the inverse bind matrix for this joint (16 floats per matrix)
            const matrixOffset = index * 16;
            const inverseBindMatrix = mat4.fromValues(
                matrices[matrixOffset], matrices[matrixOffset + 1], matrices[matrixOffset + 2], matrices[matrixOffset + 3],
                matrices[matrixOffset + 4], matrices[matrixOffset + 5], matrices[matrixOffset + 6], matrices[matrixOffset + 7],
                matrices[matrixOffset + 8], matrices[matrixOffset + 9], matrices[matrixOffset + 10], matrices[matrixOffset + 11],
                matrices[matrixOffset + 12], matrices[matrixOffset + 13], matrices[matrixOffset + 14], matrices[matrixOffset + 15]
            );

            // Get child indices, validating each one
            const children = joint.listChildren()
                .map(child => joints.indexOf(child as Node))
                .filter(idx => idx !== -1); // Remove any invalid indices

            return {
                index,
                name: joint.getName() || `joint_${index}`,
                inverseBindMatrix,
                children,
                node: joint
            };
        });
        console.log('ModelLoader: processJoints', modelData.jointData);
    }

    private cleanupModelResources(modelData: ModelData): void {
        // Should null-check resources before deletion
        // TODO: Implement
        // - delete primitive buffers
        // - delete vertex arrays

        // Clean up textures
        modelData.materialSystem.cleanup();
    }

    private createModelError(
        code: ModelErrorCode, 
        message: string
    ): ModelError {
        return createModelError(code, message);
    }

    public generateModelId(url: string): ModelId {
        return {
            id: url
        };
        /*
        // Simple hash function for URL
        const hash = Array.from(url).reduce(
            (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 
            0
        );
        return {
            id: `model_${Math.abs(hash).toString(16)}`,
        };
        */
    }

    // Helper methods for buffer creation and texture loading...
    private createAttributeBuffer(accessor: Accessor): WebGLBuffer {
        const array = accessor.getArray();
        if (!array) {
            throw this.createModelError(
                ModelErrorCode.INVALID_DATA,
                'Accessor array is null'
            );
        }
        return this.gpuResources.createBuffer(array, this.gl.DYNAMIC_DRAW);
    }

    private createIndexBuffer(accessor: Accessor): WebGLBuffer {
        const array = accessor.getArray();
        if (!array) {
            throw this.createModelError(
                ModelErrorCode.INVALID_DATA,
                'Index accessor array is null'
            );
        }
        return this.gpuResources.createIndexBuffer(array, this.gl.STATIC_DRAW);
    }

    private async loadTexture(textureNode: Texture, textureInfo: TextureInfo | null): Promise<WebGLTexture> {
        const imageData = await textureNode.getImage();
        if (!imageData) {
            throw this.createModelError(ModelErrorCode.INVALID_DATA, 'Texture image data is null');
        }
        
        // Create a blob from the array buffer and convert to image
        const blob = new Blob([imageData], { type: 'image/png' });
        const imageUrl = URL.createObjectURL(blob);
        const image = await this.loadImage(imageUrl);
        URL.revokeObjectURL(imageUrl);

        const texture = this.gpuResources.createTexture(image);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        
        // Get wrap modes from textureInfo or use defaults
        const wrapS = textureInfo?.getWrapS() ?? this.gl.REPEAT;
        const wrapT = textureInfo?.getWrapT() ?? this.gl.REPEAT;
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, wrapS);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, wrapT);

        // Get min/mag filters from textureInfo or use defaults
        const minFilter = textureInfo?.getMinFilter() ?? this.gl.LINEAR_MIPMAP_LINEAR;
        const magFilter = textureInfo?.getMagFilter() ?? this.gl.LINEAR;
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, minFilter);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, magFilter);

        // Generate mipmaps if using a mipmap filter
        if (minFilter === this.gl.LINEAR_MIPMAP_LINEAR || 
            minFilter === this.gl.LINEAR_MIPMAP_NEAREST ||
            minFilter === this.gl.NEAREST_MIPMAP_LINEAR ||
            minFilter === this.gl.NEAREST_MIPMAP_NEAREST) {
            this.gl.generateMipmap(this.gl.TEXTURE_2D);
        }
        
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        
        return texture;
    }

    private loadImage(url: string): Promise<ImageBitmap> {
        return fetch(url)
            .then(response => response.blob())
            .then(blob => createImageBitmap(blob));
    }

    private getIndexType(accessor: Accessor | null): number {
        return accessor?.getComponentType() ?? this.gl.UNSIGNED_SHORT;
    }

    // Helper function to map semantics to attribute locations
    private getAttributeLocation(semantic: string): number {
        switch (semantic) {
            case 'POSITION': return 0;
            case 'NORMAL': return 1;
            case 'TEXCOORD_0': return 2;
            case 'JOINTS_0': return 3;
            case 'WEIGHTS_0': return 4;
            case 'TANGENT': return 5;
            default: throw this.createModelError(
                ModelErrorCode.INVALID_DATA,
                `Unsupported attribute semantic: ${semantic}`
            );
        }
    }
    // Worker data structures
    public prepareModelDataForWorker(modelData: ModelData) {
        const { nodes, rootNode } = createWorkerNodes(modelData);
    
        return {
            ...modelData,
            // Replace gltf Nodes with WorkerNodes
            renderableNodes: modelData.renderableNodes.map(rn => ({
                node: nodes.get(nodeToId(rn.node))!,  // Convert to WorkerNode
                useSkinning: rn.useSkinning
            })),
            // Remove WebGL resources
            meshes: undefined,
            materials: undefined,
            materialSystem: undefined,
            // Include scene traversal root
            scene: {
                traverse: (fn: (node: WorkerNode) => void) => rootNode.traverse(fn)
            },
            // Convert animations to use WorkerNodes
            animations: Array.from(modelData.animations.entries()).map(([name, anim]) => ({
                name,
                channels: anim.listChannels().map(channel => ({
                    input: channel.getSampler()?.getInput()?.getArray(),
                    output: channel.getSampler()?.getOutput()?.getArray(),
                    targetPath: channel.getTargetPath(),
                    targetNode: nodes.get(nodeToId(channel.getTargetNode()!))!
                }))
            }))
        };
    }
}

globalThis.ModelLoader = ModelLoader;