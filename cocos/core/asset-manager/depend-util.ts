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
import { BUILD, DEV, EDITOR } from 'internal:constant';
import { Asset } from '..';
// import { getDependUuidList , hasNativeDep } from '../platform/deserialize-compiled';
// import deserializeForCompiled from '../platform/deserialize-compiled';
import Cache from './cache';
import deserialize, { IDependProp } from './deserialize';
import { decodeUuid } from './helper';
import { files, parsed } from './shared';

interface IDependencies {
    nativeDep?: Record<string, any>;
    deps: string[];
    parsedFromExistAsset?: boolean;
    preventPreloadNativeObject?: boolean;
    preventDeferredLoadDependents?: boolean;
    persistDeps?: string[];
}

/**
 * @en
 * Control asset's dependency list, it is a singleton. All member can be accessed with `cc.assetManager.dependUtil`
 *
 * @zh
 * 控制资源的依赖列表，这是一个单例, 所有成员能通过 `cc.assetManager.dependUtil` 访问
 *
 */
class DependUtil {

    public _depends: Cache<IDependencies> = new Cache<IDependencies>();

    public init (): void {
        this._depends.clear();
    }

    /**
     * @en
     * Get asset's native dependency. For example, Texture's native dependency is image.
     *
     * @zh
     * 获取资源的原生依赖，例如 Texture 的原生依赖是图片
     *
     * @param uuid - asset's uuid
     * @returns native dependency
     *
     * @example
     * var dep = dependUtil.getNativeDep('fcmR3XADNLgJ1ByKhqcC5Z');
     */
    public getNativeDep (uuid: string): Record<string, any> | null {
        const depend = this._depends.get(uuid);
        if (depend && depend.nativeDep) {
            return Object.assign({}, depend.nativeDep);
        }
        return null;
    }

    /**
     * @en
     * Get asset's direct referencing non-native dependency list. For example, Material's non-native dependencies are Texture.
     *
     * @zh
     * 获取资源直接引用的非原生依赖列表，例如，材质的非原生依赖是 Texture
     *
     * @param uuid - asset's uuid
     * @returns direct referencing non-native dependency list
     *
     * @example
     * var deps = dependUtil.getDeps('fcmR3XADNLgJ1ByKhqcC5Z');
     *
     */
    public getDeps (uuid: string): string[] {
        if (this._depends.has(uuid)) {
            return this._depends.get(uuid)!.deps;
        }
        return [];
    }

    /**
     * @en
     * Get non-native dependency list of the loaded asset, include indirect reference.
     * The returned array stores the dependencies with their uuid, after retrieve dependencies,
     *
     * @zh
     * 获取某个已经加载好的资源的所有非原生依赖资源列表，包括间接引用的资源，并保存在数组中返回。
     * 返回的数组将仅保存依赖资源的 uuid。
     *
     * @param uuid - The asset's uuid
     * @returns non-native dependency list
     *
     * @example
     * var deps = dependUtil.getDepsRecursively('fcmR3XADNLgJ1ByKhqcC5Z');
     *
     */
    public getDepsRecursively (uuid: string): string[] {
        const exclude = Object.create(null);
        const depends = [];
        this._descend(uuid, exclude, depends);
        return depends;
    }

    public remove (uuid: string) {
        this._depends.remove(uuid);
    }

    /**
     * @en
     * Extract dependency list from serialized data or asset and then store in cache.
     *
     * @zh
     * 从序列化数据或资源中提取出依赖列表，并且存储在缓存中。
     *
     * @param uuid - The uuid of serialized data or asset
     * @param json - Serialized data or asset
     * @returns dependency list, include non-native and native dependency
     *
     * @example
     * downloader.downloadFile('test.json', {responseType: 'json'}, null, (err, file) => {
     *     var dependencies = parse('fcmR3XADNLgJ1ByKhqcC5Z', file);
     * });
     *
     */
    public parse (uuid: string, json: any): IDependencies {
        let out: IDependencies | null = null;
        if (Array.isArray(json) || json.__type__) {

            if (this._depends.has(uuid)) {
                return this._depends.get(uuid)!;
            }

            if (Array.isArray(json) /* && (!(BUILD || deserializeForCompiled.isCompiledJson(json)) || !hasNativeDep(json))*/) {
                out = {
                    deps: this._parseDepsFromJson(json),
                };
            }
            else {
                try {
                    const asset = deserialize(json);
                    out = this._parseDepsFromAsset(asset);
                    if (out.nativeDep) {
                        out.nativeDep.uuid = uuid;
                    }
                    parsed.add(uuid + '@import', asset);
                }
                catch (e) {
                    files.remove(uuid + '@import');
                    out = { deps: [] };
                }
            }
        }
        // get deps from an existing asset
        else {
            if (!EDITOR && this._depends.has(uuid)) {
                out = this._depends.get(uuid)!;
                if (out.parsedFromExistAsset) {
                    return out;
                }
            }
            out = this._parseDepsFromAsset(json);
        }
        // cache dependency list
        this._depends.add(uuid, out);
        return out;
    }

    private _parseDepsFromAsset (asset: Asset): IDependencies {
        const out: IDependencies = {
            deps: [],
            parsedFromExistAsset: true,
            preventPreloadNativeObject: (asset.constructor as typeof Asset).preventPreloadNativeObject,
            preventDeferredLoadDependents: (asset.constructor as typeof Asset).preventDeferredLoadDependents,
        };
        // @ts-ignore
        const deps = asset.__depends__ as IDependProp[];
        for (let i = 0, l = deps.length; i < l; i++) {
            out.deps.push(deps[i].uuid);
        }

        // @ts-ignore
        if (asset.__nativeDepend__) {
            out.nativeDep = asset._nativeDep;
        }

        return out;
    }

    private _parseDepsFromJson (json: Record<string, any>): string[] {
        let depends: string[] | null = null;
        // if (DEV) {
            // if (deserializeForCompiled.isCompiledJson(json)) {
            //     depends = getDependUuidList(json);
            //     depends!.forEach((uuid, index) => depends![index] = decodeUuid(uuid));
            //     return depends!;
            // }

        depends = [];
        function parseDependRecursively (data: Record<string, any>, out: string[]) {
            if (!data || typeof data !== 'object' || data.__id__) { return; }
            const uuid = data.__uuid__;
            if (Array.isArray(data)) {
                for (let i = 0, l = data.length; i < l; i++) {
                    parseDependRecursively(data[i], out);
                }
            }
            else if (uuid) {
                out.push(decodeUuid(uuid));
            }
            else {
                for (const prop in data) {
                    parseDependRecursively(data[prop], out);
                }
            }
        }
        parseDependRecursively(json, depends);
        return depends;
        // }
        // else {
        //     depends = getDependUuidList(json);
        //     depends!.forEach((uuid, index) => depends![index] = decodeUuid(uuid));
        // }
        // return depends!;
    }

    private _descend (uuid: string, exclude: Record<string, any>, depends: string[]): void {
        const deps = this.getDeps(uuid);
        for (let i = 0; i < deps.length; i++) {
            const depend = deps[i];
            if (!exclude[depend]) {
                exclude[depend] = true;
                depends.push(depend);
                this._descend(depend, exclude, depends);
            }
        }
    }
}

export default new DependUtil();
