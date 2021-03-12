/*
 Copyright (c) 2019-2020 Xiamen Yaji Software Co., Ltd.

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
 */
/**
 * @packageDocumentation
 * @hidden
 */
import { EDITOR, TEST } from 'internal:constants';
import { Asset } from '../assets/asset';
import { isValid } from '../data/object';
import { Node, Scene } from '../scene-graph';
import Cache from './cache';
import dependUtil from './depend-util';
import { assets, references } from './shared';
import { ImageAsset } from '../assets/image-asset';
import { TextureBase } from '../assets/texture-base';
import { callInNextTick } from '../utils/misc';

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
            } else if (!value.constructor || value.constructor === Object) {
                const keys = Object.getOwnPropertyNames(value);
                for (let j = 0; j < keys.length; j++) {
                    const val = value[keys[j]];
                    if (val instanceof Asset) {
                        visitAsset(val, deps);
                    }
                }
            } else if (value instanceof Asset) {
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

class ReleaseManager {
    private _persistNodeDeps = new Cache<string[]>();
    private _toDelete = new Cache<Asset>();
    private _eventListener = false;

    public init (): void {
        this._persistNodeDeps.clear();
        this._toDelete.clear();
    }

    public tryRelease (asset: Asset, force = false): void {
        if (!(asset instanceof Asset)) { return; }
        if (force) {
            this._free(asset, force);
            return;
        }

        this._toDelete.add(asset._uuid, asset);
        if (!this._eventListener) {
            this._eventListener = true;
            callInNextTick(this._freeAssets.bind(this));
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
        const uuid = asset._uuid;
        this._toDelete.remove(uuid);

        if (!isValid(asset, true)) { return; }

        // remove from cache
        assets.remove(uuid);
        // only release non-gc asset in editor
        if (!EDITOR || (asset instanceof ImageAsset || asset instanceof TextureBase)) {
            asset.destroy();
        }
        dependUtil.remove(uuid);
        if (EDITOR) {
            references!.remove(uuid);
        }
    }
}

export default new ReleaseManager();
