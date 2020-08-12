/****************************************************************************
 Copyright (c) 2019 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
  worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
  not use Cocos Creator software for developing other software or tools that's
  used for developing games. You are not granted to publish, distribute,
  sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/
import { TEST } from 'internal:constants';
import { director, Director } from '..';
import { Asset } from '../assets';
import { isValid } from '../data';
import { Node, Scene } from '../scene-graph';
import Cache from './cache';
import dependUtil from './depend-util';
import { assets } from './shared';

function visitAsset (asset: Asset, deps: string[]) {
    // Skip assets generated programmatically or by user (e.g. label texture)
    if (!asset._uuid) {
        return;
    }
    deps.push(asset._uuid);
}

function visitComponent (comp: any, deps: string[]) {
    const props = Object.getOwnPropertyNames(comp);
    for (let i = 0; i < props.length; i++) {
        const propName = props[i];
        if (propName === 'node' || propName === '__eventTargets') { continue; }
        const value = comp[propName];
        if (typeof value === 'object' && value) {
            if (Array.isArray(value)) {
                for (let j = 0; j < value.length; j++) {
                    const val = value[j];
                    if (val instanceof Asset) {
                        visitAsset(val, deps);
                    }
                }
            }
            else if (!value.constructor || value.constructor === Object) {
                const keys = Object.getOwnPropertyNames(value);
                for (let j = 0; j < keys.length; j++) {
                    const val = value[keys[j]];
                    if (val instanceof Asset) {
                        visitAsset(val, deps);
                    }
                }
            }
            else if (value instanceof Asset) {
                visitAsset(value, deps);
            }
        }
    }
}

function visitNode (node: any, deps: string[]) {
    for (let i = 0; i < node._components.length; i++) {
        visitComponent(node._components[i], deps);
    }
    for (let i = 0; i < node._children.length; i++) {
        visitNode(node._children[i], deps);
    }
}

function descendOpRef (asset: Asset, refs: Record<string, number>, exclude: string[], op: number) {
    exclude.push(asset._uuid);
    const depends = dependUtil.getDeps(asset._uuid);
    for (let i = 0, l = depends.length; i < l; i++) {
        const dependAsset = assets.get(depends[i]);
        if (!dependAsset) { continue; }
        const uuid = dependAsset._uuid;
        if (!(uuid in refs)) {
            refs[uuid] = dependAsset.refCount + op;
        }
        else {
            refs[uuid] += op;
        }
        if (exclude.includes(uuid)) { continue; }
        descendOpRef(dependAsset, refs, exclude, op);
    }
}

const _temp = [];
function checkCircularReference (asset: Asset) {
    // check circular reference
    const refs = Object.create(null);
    refs[asset._uuid] = asset.refCount;
    descendOpRef(asset, refs, _temp, -1);
    _temp.length = 0;
    if (refs[asset._uuid] !== 0) { return refs[asset._uuid]; }

    for (const uuid in refs) {
        if (refs[uuid] !== 0) {
            descendOpRef(assets.get(uuid) as Asset, refs, _temp, 1);
        }
    }
    _temp.length = 0;

    return refs[asset._uuid];
}

class ReleaseManager {

    private _persistNodeDeps = new Cache<string[]>();
    private _toDelete = new Cache<Asset>();
    private _eventListener: boolean = false;

    public init (): void {
        this._persistNodeDeps.clear();
        this._toDelete.clear();
    }

    public _addPersistNodeRef (node: Node) {
        const deps = [];
        visitNode(node, deps);
        for (let i = 0, l = deps.length; i < l; i++) {
            const dependAsset = assets.get(deps[i]);
            if (dependAsset) {
                dependAsset.addRef();
            }
        }
        this._persistNodeDeps.add(node.uuid, deps);
    }

    public _removePersistNodeRef (node: Node) {
        if (!this._persistNodeDeps.has(node.uuid)) { return; }

        const deps = this._persistNodeDeps.get(node.uuid) as string[];
        for (let i = 0, l = deps.length; i < l; i++) {
            const dependAsset = assets.get(deps[i]);
            if (dependAsset) {
                dependAsset.decRef();
            }
        }
        this._persistNodeDeps.remove(node.uuid);
    }

    // do auto release
    public _autoRelease (oldScene: Scene, newScene: Scene, persistNodes: Node[]) {

        // transfer refs from persist nodes to new scene
        for (let i = 0, l = persistNodes.length; i < l; i++) {
            const node = persistNodes[i];
            // @ts-ignore
            const sceneDeps = dependUtil._depends.get(newScene._id);
            const deps = this._persistNodeDeps.get(node.uuid) as string[];
            for (const dep of deps) {
                const dependAsset = assets.get(dep);
                if (dependAsset) {
                    dependAsset.addRef();
                }
            }
            if (!sceneDeps) { continue; }

            if (!sceneDeps.persistDeps) {
                sceneDeps.persistDeps = [];
            }
            sceneDeps.persistDeps.push(...deps);
        }

        if (!oldScene) { return; }

        // @ts-ignore
        const childs = dependUtil.getDeps(oldScene._id);
        for (let i = 0, l = childs.length; i < l; i++) {
            const asset = assets.get(childs[i]);
            if (asset) {
                asset.decRef(TEST || oldScene.autoReleaseAssets);
            }
        }
        // @ts-ignore
        const dependencies = dependUtil._depends.get(oldScene._id);
        if (dependencies && dependencies.persistDeps) {
            const persistDeps = dependencies.persistDeps;
            for (let i = 0, l = persistDeps.length; i < l; i++) {
                const asset = assets.get(persistDeps[i]);
                if (asset) {
                    asset.decRef(TEST || oldScene.autoReleaseAssets);
                }
            }
        }
        // @ts-ignore
        dependUtil.remove(oldScene._id);
    }

    public tryRelease (asset: Asset, force = false): void {
        if (force) {
            return this._free(asset, force);
        }

        this._toDelete.add(asset._uuid, asset);
        if (!this._eventListener) {
            this._eventListener = true;
            director.once(Director.EVENT_AFTER_DRAW, this._freeAssets, this);
        }
    }

    private _freeAssets () {
        this._eventListener = false;
        this._toDelete.forEach((asset) => {
            this._free(asset);
        });
        this._toDelete.clear();
    }

    private _free (asset: Asset, force = false) {
        this._toDelete.remove(asset._uuid);

        if (!isValid(asset, true)) { return; }

        if (!force) {
            if (asset.refCount > 0) {
                if (checkCircularReference(asset) > 0) { return; }
            }
        }

        // remove from cache
        assets.remove(asset._uuid);
        const depends = dependUtil.getDeps(asset._uuid);
        for (let i = 0, l = depends.length; i < l; i++) {
            const dependAsset = assets.get(depends[i]);
            if (dependAsset) {
                dependAsset.decRef(false);
                this._free(dependAsset, false);
            }
        }
        asset.destroy();
        dependUtil.remove(asset._uuid);
    }
}

export default new ReleaseManager();
