import { DrawBatch2D } from "../renderer/draw-batch";
import { MeshBuffer } from "../renderer/mesh-buffer";
import { Renderer2D } from "./renderer-2d";
import { TreeNode2D } from "./tree-node";
import * as VertexFormat from '../renderer/vertex-format';
import { Attribute } from "../../core/gfx/base/define";

export class RenderGroup2D extends TreeNode2D {
    public shouldCulling = false;
    public batchDirty = true;
    public sortedRenderers: Renderer2D[];
    public drawBatches: DrawBatch2D[] = [];
    public meshBuffers: MeshBuffer[] = [];
    public colorDirtyRenderers: Renderer2D[] = [];
    public batchDirtyRenderers: Renderer2D[] = [];
    public verticesDirtyRenderers: Renderer2D[] = [];
    public uvDirtyRenderers: Renderer2D[] = [];
    public indicesDirtyRenderers: Renderer2D[] = [];

    public updateAllDirtyRenderer () {
        const colorDirtyRenderer = this.colorDirtyRenderers;
        for (let i = 0; i < colorDirtyRenderer.length; i++) {
            colorDirtyRenderer[i].updateColor();
        }
        const verticesDirtyRenderers = this.verticesDirtyRenderers;
        for (let i = 0; i < verticesDirtyRenderers.length; i++) {
            verticesDirtyRenderers[i].updateVertices();
        }
        const uvDirtyRenderers = this.uvDirtyRenderers;
        for (let i = 0; i < uvDirtyRenderers.length; i++) {
            uvDirtyRenderers[i].updateUvs();
        }
        const indicesDirtyRenderers = this.indicesDirtyRenderers;
        for (let i = 0; i < indicesDirtyRenderers.length; i++) {
            indicesDirtyRenderers[i].updateUvs();
        }
    }

    public updateBatches () {
        if (this.orderDirty) {
            this.sortedRenderers.length = 0;
            this.walk(this.addRenderer.bind(this));
            this.batchDirty = true;
        }
        this.updateAllDirtyRenderer();
        if (this.batchDirty && this.sortedRenderers.length > 0) {
            this.drawBatches.length = 0;
            let lastTexture = this.sortedRenderers[0].texture;
            let lastBatchHash = this.sortedRenderers[0]._batchHash;
            let lastRenderer = this.sortedRenderers[0];

            for (let i = 1, l = this.sortedRenderers.length; i < l; i++) {
                const renderer  = this.sortedRenderers[i];
                const texture = renderer.texture;

                if (lastTexture !== texture || lastBatchHash !== renderer._batchHash) {
                    this.autoMergeBatches(lastRenderer);
                    lastTexture = texture;
                    lastRenderer = renderer;
                }

                renderer.fillBuffer();
            }
            this.autoMergeBatches(lastRenderer);
        }
    }

    get currBufferBatch () {
        if (this._currMeshBuffer) return this._currMeshBuffer;
        // create if not set
        this._currMeshBuffer = this.acquireBufferBatch();
        return this._currMeshBuffer;
    }

    set currBufferBatch (buffer: MeshBuffer | null) {
        if (buffer) {
            this._currMeshBuffer = buffer;
        }
    }

    get batches () {
        return this._batches;
    }

    /**
     * Acquire a new mesh buffer if the vertex layout differs from the current one.
     * @param attributes
     */
    public acquireBufferBatch (attributes: Attribute[] = VertexFormat.vfmtPosUvColor) {
        const strideBytes = attributes === VertexFormat.vfmtPosUvColor ? 36 /* 9x4 */ : VertexFormat.getAttributeStride(attributes);
        if (!this._currMeshBuffer || (this._currMeshBuffer.vertexFormatBytes) !== strideBytes) {
            this._requireBufferBatch(attributes);
            return this._currMeshBuffer;
        }
        return this._currMeshBuffer;
    }

    public registerCustomBuffer (attributes: MeshBuffer | Attribute[], callback: ((...args: number[]) => void) | null) {
        let batch: MeshBuffer;
        if (attributes instanceof MeshBuffer) {
            batch = attributes;
        } else {
            batch = this._bufferBatchPool.add();
            batch.initialize(attributes, callback || this._recreateMeshBuffer.bind(this, attributes));
        }
        const strideBytes = batch.vertexFormatBytes;
        let buffers = this._customMeshBuffers.get(strideBytes);
        if (!buffers) { buffers = []; this._customMeshBuffers.set(strideBytes, buffers); }
        buffers.push(batch);
        return batch;
    }

    public unRegisterCustomBuffer (buffer: MeshBuffer) {
        const buffers = this._customMeshBuffers.get(buffer.vertexFormatBytes);
        if (buffers) {
            for (let i = 0; i < buffers.length; i++) {
                if (buffers[i] === buffer) {
                    buffers.splice(i, 1);
                    break;
                }
            }
        }
    }

    public autoMergeBatches (renderComp: Renderer2D) {
        const buffer = this.currBufferBatch;
        const ia = buffer?.recordBatch();
        const mat = renderComp.material;
        if (!ia || !mat || !buffer) {
            return;
        }
        let blendState;
        let depthStencil;
        let dssHash = 0;
        let bsHash = 0;

        const curDrawBatch = new DrawBatch2D();
        curDrawBatch.renderScene = this._getRenderScene();
        curDrawBatch.visFlags = renderComp.layer;
        curDrawBatch.bufferBatch = buffer;
        curDrawBatch.texture = renderComp.texture.getGFXTexture();
        curDrawBatch.sampler = renderComp.texture.getGFXSampler();
        curDrawBatch.inputAssembler = ia;
        curDrawBatch.useLocalData = null;
        curDrawBatch.textureHash = renderComp.texture.getHash();
        curDrawBatch.samplerHash = renderComp.texture.getSamplerHash();
        curDrawBatch.fillPasses(mat, depthStencil, dssHash, blendState, bsHash, null);

        this.drawBatches.push(curDrawBatch);

        buffer.vertexStart = buffer.vertexOffset;
        buffer.indicesStart = buffer.indicesOffset;
        buffer.byteStart = buffer.byteOffset;
    }

    prepareBuffer () {
        const bufferCount = Math.ceil(this.verticesCount / 65535);
        for (let i = 0; i < bufferCount; i++) {
            const meshBuffer = new MeshBuffer();
            meshBuffer.initialize(VertexFormat.vfmtPosUvColor, 65535, 1)
            this.meshBuffers.push()
        }
    }

    public addRenderer (node: TreeNode2D) {
        if (node instanceof Renderer2D) {
            this.sortedRenderers.push(node);
            node.root = this;
        }
    }
}