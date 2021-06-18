import { DrawBatch2D } from "../renderer/draw-batch";
import { MeshBuffer } from "../renderer/mesh-buffer";
import { Renderer2D } from "./renderer-2d";
import { TreeNode2D } from "./tree-node";
import * as VertexFormat from '../renderer/vertex-format';
import { Attribute } from "../../core/gfx/base/define";

export class RenderGroup2D extends TreeNode2D {
    public shouldCulling = false;
    public batchDirty = true;
    public orderDirty = true;
    public verticesDataCount = 0;
    public indicesDataCount = 0;
    public sortedRenderers: Renderer2D[];
    public drawBatches: DrawBatch2D[] = [];
    public meshBuffer: MeshBuffer | null = null;
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
            this.verticesDataCount = 0;
            this.indicesDataCount = 0;
            const temp: TreeNode2D[] = [];
            temp.push(this);
            while (temp.length > 0) {
                const treenode = temp.pop();
                const children = treenode.children;
                for (let i = children.length - 1; i >= 0; i--) {
                    temp.push(children[i]);
                }
                treenode.root = this;
                if (treenode.isRenderer) { 
                    this.sortedRenderers.push(treenode as Renderer2D);
                    if ((treenode as Renderer2D).isVisible) {
                        this.verticesDataCount += (treenode as Renderer2D).verticesCount * 9;
                        this.indicesDataCount += (treenode as Renderer2D).indicesCount;
                    }
                }
            }
            this.orderDirty = false;
            this.batchDirty = true;
        }

        this.updateAllDirtyRenderer();
        if (this.batchDirty && this.sortedRenderers.length > 0) {
            this.drawBatches.length = 0;
            let lastTexture = this.sortedRenderers[0].texture;
            let lastBatchHash = this.sortedRenderers[0]._batchHash;
            let lastRenderer = this.sortedRenderers[0];
            lastRenderer.fillBuffer();

            for (let i = 1, l = this.sortedRenderers.length; i < l; i++) {
                const renderer  = this.sortedRenderers[i];
                if (!renderer.isVisible) continue;
                const texture = renderer.texture;

                const bufferExceedMaxSize = !this.meshBuffer.request(renderer.verticesCount, renderer.indicesCount)

                if (lastTexture !== texture || lastBatchHash !== renderer._batchHash || bufferExceedMaxSize) {
                    this.autoMergeBatches(lastRenderer);
                    lastTexture = texture;
                    lastBatchHash = renderer._batchHash;
                    lastRenderer = renderer;
                }

                if (bufferExceedMaxSize) {
                    this.meshBuffer.switchBufferAndReset();
                }

                renderer.fillBuffer();
                
            }
            this.autoMergeBatches(lastRenderer);
            this.batchDirty = false;
        }
    }

    public autoMergeBatches (renderComp: Renderer2D) {
        const buffer = this.meshBuffer;
        const ia = buffer.recordBatch();
        const mat = renderComp.material;
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
    }

    prepareBuffer () {
        if (!this.meshBuffer) {
            this.meshBuffer = new MeshBuffer();
            this.meshBuffer.initialize(VertexFormat.vfmtPosUvColor, this.verticesDataCount, this.indicesDataCount);
        } else if (this.meshBuffer.verticesCount < this.verticesDataCount) {
            
        }
    }
}