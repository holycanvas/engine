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
import { Asset, SceneAsset } from '../assets';
import { legacyCC } from '../global-exports';
import { error, errorID } from '../platform/debug';
import assetManager from './asset-manager';
import Config, { IAddressableInfo, IAssetInfo, IConfigOption, ISceneInfo } from './config';
import releaseManager from './releaseManager';
import RequestItem from './request-item';
import { assets, AssetType, bundles, CompleteCallback, CompleteCallbackNoData, Options, ProgressCallback, RequestType } from './shared';
import { parseLoadResArgs, parseParameters } from './utilities';

/**
 * @en
 * A bundle contains an amount of assets(includes scene), you can load, preload, release asset which is in this bundle
 *
 * @zh
 * 一个包含一定数量资源（包括场景）的包，你可以加载，预加载，释放此包内的资源
 *
 */
export default class Bundle {

    private _config: Config = new Config();

    get config (): Config {
        return this._config;
    }

    /**
     * @en
     * The name of this bundle
     *
     * @zh
     * 此 bundle 的名称
     *
     */
    get name (): string {
        return this._config.name;
    }

    /**
     * @en
     * The dependency of this bundle
     *
     * @zh
     * 此 bundle 的依赖
     *
     */
    get deps (): string[] {
        return this._config.deps!;
    }

    /**
     * @en
     * The root path of this bundle, such like 'http://example.com/bundle1'
     *
     * @zh
     * 此 bundle 的根路径, 例如 'http://example.com/bundle1'
     *
     */
    get base (): string {
        return this._config.base;
    }

    /**
     * @en
     * Get asset's info using path, only valid when asset is in bundle folder.
     *
     * @zh
     * 使用 path 获取资源的配置信息
     *
     * @param path - The relative path of asset, such as 'images/a'
     * @param type - The constructor of asset, such as  `cc.Texture2D`
     * @returns The asset info
     *
     * @example
     * var info = bundle.getInfoWithPath('image/a', cc.Texture2D);
     *
     */
    public getInfoWithPath (path: string, type?: AssetType | null): IAddressableInfo | null {
        return this._config.getInfoWithPath(path, type);
    }

    /**
     * @en
     * Get all asset's info within specific folder
     *
     * @zh
     * 获取在某个指定文件夹下的所有资源信息
     *
     * @param path - The relative path of folder, such as 'images'
     * @param type - The constructor should be used to filter paths
     * @param out - The output array
     * @returns Infos
     *
     * @example
     * var infos = [];
     * bundle.getDirWithPath('images', cc.Texture2D, infos);
     */
    public getDirWithPath (path: string, type?: AssetType | null, out?: IAddressableInfo[]): IAddressableInfo[] {
        return this._config.getDirWithPath(path, type, out);
    }

    /**
     * @en
     * Get asset's info with uuid
     *
     * @zh
     * 通过 uuid 获取资源信息
     *
     * @method getAssetInfo
     * @param  uuid - The asset's uuid
     * @returns info
     *
     * @example
     * var info = bundle.getAssetInfo('fcmR3XADNLgJ1ByKhqcC5Z');
     *
     */
    public getAssetInfo (uuid: string): IAssetInfo | null {
        return this._config.getAssetInfo(uuid);
    }

    /**
     * @en
     * Get scene'info with name
     *
     * @zh
     * 通过场景名获取场景信息
     *
     * @method getSceneInfo
     * @param name - The name of scene
     * @return info
     *
     * @example
     * var info = bundle.getSceneInfo('first.fire');
     *
     */
    public getSceneInfo (name: string): ISceneInfo | null {
        return this._config.getSceneInfo(name);
    }

    /**
     * @en
     * Initialize this bundle with options
     *
     * @zh
     * 初始化此 bundle
     *
     * @param options
     *
     */
    public init (options: IConfigOption) {
        this._config.init(options);
        bundles.add(options.name, this);
    }

    public load<T extends Asset> (paths: string|string[], type: AssetType | null,
                                  onProgress: ProgressCallback | null,
                                  onComplete: CompleteCallback<T|T[]> | null): void;
    public load<T extends Asset> (paths: string|string[], onProgress: ProgressCallback | null, onComplete: CompleteCallback<T|T[]> | null): void;
    public load<T extends Asset> (paths: string|string[], type: AssetType | null, onComplete?: CompleteCallback<T|T[]> | null): void;
    public load<T extends Asset> (paths: string|string[], onComplete?: CompleteCallback<T|T[]> | null): void;

    /**
     * @en
     * Load the asset within this bundle by the path which is relative to bundle's path
     *
     * @zh
     * 通过相对路径加载分包中的资源。路径是相对分包文件夹路径的相对路径
     *
     * @param paths - Paths of the target assets.The path is relative to the bundle's folder, extensions must be omitted.
     * @param type - Only asset of type will be loaded if this argument is supplied.
     * @param onProgress - Callback invoked when progression change.
     * @param onProgress.finish - The number of the items that are already completed.
     * @param onProgress.total - The total number of the items.
     * @param onProgress.item - The finished request item.
     * @param onComplete - Callback invoked when all assets loaded.
     * @param onComplete.error - The error info or null if loaded successfully.
     * @param onComplete.assets - The loaded assets.
     *
     * @example
     * // load the texture (${project}/assets/resources/textures/background.jpg) from resources
     * cc.resources.load('textures/background', cc.Texture2D, (err, texture) => console.log(err));
     *
     * // load the audio (${project}/assets/resources/music/hit.mp3) from resources
     * cc.resources.load('music/hit', cc.AudioClip, (err, audio) => console.log(err));
     *
     * // load the prefab (${project}/assets/bundle1/misc/character/cocos) from bundle1 folder
     * bundle1.load('misc/character/cocos', cc.Prefab, (err, prefab) => console.log(err));
     *
     * // load the sprite frame (${project}/assets/some/xxx/bundle2/imgs/cocos.png) from bundle2 folder
     * bundle2.load('imgs/cocos', cc.SpriteFrame, null, (err, spriteFrame) => console.log(err));
     *
     */
    public load<T extends Asset> (paths: string|string[],
                                  assetType?: AssetType | ProgressCallback | CompleteCallback<T|T[]> | null,
                                  onProg?: ProgressCallback | CompleteCallback<T|T[]> | null,
                                  onComp?: CompleteCallback<T|T[]> | null) {
        const { type, onProgress, onComplete } = parseLoadResArgs(assetType, onProg, onComp);
        const options = { __requestType__: RequestType.PATH, type, bundle: this.name, __outputAsArray__: Array.isArray(paths) };
        assetManager.loadAny(paths, options, onProgress, onComplete);
    }

    public preload (paths: string|string[], type: AssetType|null, onProgress: ProgressCallback|null, onComplete: CompleteCallback<RequestItem[]>|null): void;
    public preload (paths: string|string[], onProgress: ProgressCallback | null, onComplete: CompleteCallback<RequestItem[]> | null): void;
    public preload (paths: string|string[], type: AssetType | null, onComplete?: CompleteCallback<RequestItem[]> | null): void;
    public preload (paths: string|string[], onComplete?: CompleteCallback<RequestItem[]> | null): void;

    /**
     * @en
     * Preload the asset within this bundle by the path which is relative to bundle's path.
     * After calling this method, you still need to finish loading by calling `Bundle.load`.
     * It will be totally fine to call `Bundle.load` at any time even if the preloading is not
     * yet finished
     *
     * @zh
     * 通过相对路径预加载分包中的资源。路径是相对分包文件夹路径的相对路径。调用完后，你仍然需要通过 `Bundle.load` 来完成加载。
     * 就算预加载还没完成，你也可以直接调用 `Bundle.load`。
     *
     * @param paths - Paths of the target asset.The path is relative to bundle folder, extensions must be omitted.
     * @param type - Only asset of type will be loaded if this argument is supplied.
     * @param onProgress - Callback invoked when progression change.
     * @param onProgress.finish - The number of the items that are already completed.
     * @param onProgress.total - The total number of the items.
     * @param onProgress.item - The finished request item.
     * @param onComplete - Callback invoked when the resource loaded.
     * @param onComplete.error - The error info or null if loaded successfully.
     * @param onComplete.items - The preloaded items.
     *
     * @example
     * // preload the texture (${project}/assets/resources/textures/background.jpg) from resources
     * cc.resources.preload('textures/background', cc.Texture2D);
     *
     * // preload the audio (${project}/assets/resources/music/hit.mp3) from resources
     * cc.resources.preload('music/hit', cc.AudioClip);
     * // wait for while
     * cc.resources.load('music/hit', cc.AudioClip, (err, audioClip) => {});
     *
     * * // preload the prefab (${project}/assets/bundle1/misc/character/cocos) from bundle1 folder
     * bundle1.preload('misc/character/cocos', cc.Prefab);
     *
     * // load the sprite frame of (${project}/assets/bundle2/imgs/cocos.png) from bundle2 folder
     * bundle2.preload('imgs/cocos', cc.SpriteFrame);
     * // wait for while
     * bundle2.load('imgs/cocos', cc.SpriteFrame, (err, spriteFrame) => {});
     *
     */
    public preload (paths: string|string[],
                    assetType?: AssetType | ProgressCallback | CompleteCallback<RequestItem[]> | null,
                    onProg?: ProgressCallback | CompleteCallback<RequestItem[]> | null,
                    onComp?: CompleteCallback<RequestItem[]> | null) {
        const { type, onProgress, onComplete } = parseLoadResArgs(assetType, onProg, onComp);
        assetManager.preloadAny(paths, { __requestType__: RequestType.PATH, type, bundle: this.name }, onProgress, onComplete);
    }

    public loadDir<T extends Asset> (dir: string, type: AssetType | null, onProgress: ProgressCallback | null, onComplete: CompleteCallback<T[]> | null): void;
    public loadDir<T extends Asset> (dir: string, onProgress: ProgressCallback | null, onComplete: CompleteCallback<T[]> | null): void;
    public loadDir<T extends Asset> (dir: string, type: AssetType | null, onComplete?: CompleteCallback<T[]> | null): void;
    public loadDir<T extends Asset> (dir: string, onComplete?: CompleteCallback<T[]> | null): void;
    /**
     * @en
     * Load all assets under a folder inside the bundle folder.<br>
     * <br>
     * Note: All asset paths in Creator use forward slashes, paths using backslashes will not work.
     *
     * @zh
     * 加载目标文件夹中的所有资源, 注意：路径中只能使用斜杠，反斜杠将停止工作
     *
     * @param dir - path of the target folder.The path is relative to the bundle folder, extensions must be omitted.
     * @param type - Only asset of type will be loaded if this argument is supplied.
     * @param onProgress - Callback invoked when progression change.
     * @param onProgress.finish - The number of the items that are already completed.
     * @param onProgress.total - The total number of the items.
     * @param onProgress.item - The latest request item
     * @param onComplete - A callback which is called when all assets have been loaded, or an error occurs.
     * @param onComplete.error - If one of the asset failed, the complete callback is immediately called with the error.
     *                           If all assets are loaded successfully, error will be null.
     * @param onComplete.assets - An array of all loaded assets.
     *
     * @example
     * // load all audios (resources/audios/)
     * cc.resources.loadDir('audios', cc.AudioClip, (err, audios) => {});
     *
     * // load all textures in "resources/imgs/"
     * cc.resources.loadDir('imgs', cc.Texture2D, null, function (err, textures) {
     *     var texture1 = textures[0];
     *     var texture2 = textures[1];
     * });
     *
     * // load all prefabs (${project}/assets/bundle1/misc/characters/) from bundle1 folder
     * bundle1.loadDir('misc/characters', cc.Prefab, (err, prefabs) => console.log(err));
     *
     * // load all sprite frame (${project}/assets/some/xxx/bundle2/skills/) from bundle2 folder
     * bundle2.loadDir('skills', cc.SpriteFrame, null, (err, spriteFrames) => console.log(err));
     *
     */
    public loadDir<T extends Asset> (dir: string,
                                     assetType?: AssetType | ProgressCallback | CompleteCallback<T[]> | null,
                                     onProg?: ProgressCallback | CompleteCallback<T[]> | null,
                                     onComp?: CompleteCallback<T[]> | null) {
        const { type, onProgress, onComplete } = parseLoadResArgs(assetType, onProg, onComp);
        assetManager.loadAny(dir, { __requestType__: RequestType.DIR, type, bundle: this.name, __outputAsArray__: true }, onProgress, onComplete);
    }

    public preloadDir (dir: string, type: AssetType | null, onProgress: ProgressCallback | null, onComplete: CompleteCallback<RequestItem[]> | null): void;
    public preloadDir (dir: string, onProgress: ProgressCallback | null, onComplete: CompleteCallback<RequestItem[]> | null): void;
    public preloadDir (dir: string, type: AssetType | null, onComplete?: CompleteCallback<RequestItem[]> | null): void;
    public preloadDir (dir: string, onComplete?: CompleteCallback<RequestItem[]> | null): void;

    /**
     * @en
     * Preload all assets under a folder inside the bundle folder.<br> After calling this method, you still need to finish loading by calling `Bundle.loadDir`.
     * It will be totally fine to call `Bundle.loadDir` at any time even if the preloading is not yet finished
     *
     * @zh
     * 预加载目标文件夹中的所有资源。调用完后，你仍然需要通过 `Bundle.loadDir` 来完成加载。
     * 就算预加载还没完成，你也可以直接调用 `Bundle.loadDir`。
     *
     * @param dir - path of the target folder.The path is relative to the bundle folder, extensions must be omitted.
     * @param type - Only asset of type will be preloaded if this argument is supplied.
     * @param onProgress - Callback invoked when progression change.
     * @param onProgress.finish - The number of the items that are already completed.
     * @param onProgress.total - The total number of the items.
     * @param onProgress.item - The latest request item
     * @param onComplete - A callback which is called when all assets have been loaded, or an error occurs.
     * @param onComplete.error - If one of the asset failed, the complete callback is immediately called with the error.
     *                                   If all assets are preloaded successfully, error will be null.
     * @param onComplete.items - An array of all preloaded items.
     *
     * @example
     * // preload all audios (resources/audios/)
     * cc.resources.preloadDir('audios', cc.AudioClip);
     *
     * // preload all textures in "resources/imgs/"
     * cc.resources.preloadDir('imgs', cc.Texture2D);
     * // wait for while
     * cc.resources.loadDir('imgs', cc.Texture2D, (err, textures) => {});
     *
     * // preload all prefabs (${project}/assets/bundle1/misc/characters/) from bundle1 folder
     * bundle1.preloadDir('misc/characters', cc.Prefab);
     *
     * // preload all sprite frame (${project}/assets/some/xxx/bundle2/skills/) from bundle2 folder
     * bundle2.preloadDir('skills', cc.SpriteFrame);
     * // wait for while
     * bundle2.loadDir('skills', cc.SpriteFrame, (err, spriteFrames) => {});
     */
    public preloadDir (dir: string,
                       assetType?: AssetType | ProgressCallback | CompleteCallback<RequestItem[]>| null,
                       onProg?: ProgressCallback | CompleteCallback<RequestItem[]>| null,
                       onComp?: CompleteCallback<RequestItem[]>| null) {
        const { type, onProgress, onComplete } = parseLoadResArgs(assetType, onProg, onComp);
        assetManager.preloadAny(dir, { __requestType__: RequestType.DIR, type, bundle: this.name }, onProgress, onComplete);
    }

    public loadScene (sceneName: string, options: Options | null, onProgress: ProgressCallback | null, onComplete: CompleteCallback<SceneAsset> | null): void;
    public loadScene (sceneName: string, onProgress: ProgressCallback | null, onComplete: CompleteCallback<SceneAsset> | null): void;
    public loadScene (sceneName: string, options: Options | null, onComplete?: CompleteCallback<SceneAsset> | null): void;
    public loadScene (sceneName: string, onComplete?: CompleteCallback<SceneAsset> | null): void;
    /**
     * @en
     * Loads the scene within this bundle by its name.
     *
     * @zh
     * 通过场景名称加载分包中的场景。
     *
     * @param sceneName - The name of the scene to load.
     * @param options - Some optional parameters
     * @param onProgress - Callback invoked when progression change.
     * @param onProgress.finish - The number of the items that are already completed.
     * @param onProgress.total - The total number of the items.
     * @param onProgress.item - The latest request item
     * @param onComplete - callback, will be called after scene launched.
     * @param onComplete.err - The occurred error, null indicetes success
     * @param onComplete.sceneAsset - The scene asset
     *
     * @example
     * bundle1.loadScene('first', (err, sceneAsset) => cc.director.runScene(sceneAsset));
     *
     */
    public loadScene (sceneName: string,
                      opts?: Options | ProgressCallback | CompleteCallback<SceneAsset> | null,
                      onProg?: ProgressCallback | CompleteCallback<SceneAsset> | null,
                      onComp?: CompleteCallback<SceneAsset> | null) {
        const { options, onProgress, onComplete } = parseParameters(opts, onProg, onComp);

        options.preset = options.preset || 'scene';
        options.bundle = this.name;
        assetManager.loadAny({ scene: sceneName }, options, onProgress, (err, sceneAsset) => {
            if (err) {
                error(err.message, err.stack);
                if (onComplete) { onComplete(err); }
            }
            else if (sceneAsset instanceof SceneAsset && sceneAsset.scene) {
                const scene = sceneAsset.scene;
                // @ts-ignore
                scene._id = sceneAsset._uuid;
                scene.name = sceneAsset.name;
                if (onComplete) { onComplete(null, sceneAsset); }
            }
            else {
                if (onComplete) { onComplete(new Error('The asset ' + sceneAsset._uuid + ' is not a scene')); }
            }
        });
    }

    public preloadScene (sceneName: string, options: Options | null, onProgress: ProgressCallback, onComplete: CompleteCallbackNoData | null): void;
    public preloadScene (sceneName: string, onProgress: ProgressCallback | null, onComplete: CompleteCallbackNoData | null): void;
    public preloadScene (sceneName: string, options: Options | null, onComplete?: CompleteCallbackNoData | null): void;
    public preloadScene (sceneName: string, onComplete?: CompleteCallbackNoData | null): void;

    /**
     * @en
     * Preloads the scene within this bundle by its name. After calling this method, you still need to finish loading
     * by calling `Bundle.loadScene` or `cc.director.loadScene`.It will be totally fine to call `Bundle.loadDir` at any
     * time even if the preloading is not yet finished
     *
     * @zh
     * 通过场景名称预加载分包中的场景.调用完后，你仍然需要通过 `Bundle.loadScene` 或 `cc.director.loadScene` 来完成加载。
     * 就算预加载还没完成，你也可以直接调用 `Bundle.loadScene` 或 `cc.director.loadScene`。
     *
     * @param sceneName - The name of the scene to preload.
     * @param options - Some optional parameters
     * @param onProgress - callback, will be called when the load progression change.
     * @param onProgress.finish - The number of the items that are already completed
     * @param onProgress.total - The total number of the items
     * @param onProgress.item The latest request item
     * @param onComplete - callback, will be called after scene loaded.
     * @param onComplete.error - null or the error object.
     *
     * @example
     * bundle1.preloadScene('first');
     * // wait for a while
     * bundle1.loadScene('first', (err, scene) => cc.director.runScene(scene));
     *
     */
    public preloadScene (sceneName: string,
                         opts?: Options | ProgressCallback | CompleteCallbackNoData | null,
                         onProg?: ProgressCallback | CompleteCallbackNoData | null,
                         onComp?: CompleteCallbackNoData | null) {
        const { options, onProgress, onComplete } = parseParameters(opts, onProg, onComp);

        options.bundle = this.name;
        assetManager.preloadAny({scene: sceneName}, options, onProgress, (err) => {
            if (err) {
                errorID(1210, sceneName, err.message);
            }
            if (onComplete) { onComplete(err); }
        });
    }

    /**
     * @en
     * Get cached asset within this bundle by path and type. <br>
     * After you load asset with {{#crossLink "Bundle/load:method"}}{{/crossLink}} or {{#crossLink "Bundle/loadDir:method"}}{{/crossLink}},
     * you can acquire them by passing the path to this API.
     *
     * @zh
     * 通过路径与类型获取已缓存资源。在你使用 {{#crossLink "Bundle/load:method"}}{{/crossLink}} 或者 {{#crossLink "Bundle/loadDir:method"}}{{/crossLink}} 之后，
     * 你能通过传路径通过这个 API 获取到这些资源。
     *
     * @param path - The path of asset
     * @param type - Only asset of type will be returned if this argument is supplied.
     * @returns - the asset has been cached
     *
     * @example
     * bundle1.get('music/hit', cc.AudioClip);
     */
    public get<T extends Asset> (path: string, type?: AssetType | null): T | null {
        const info = this.getInfoWithPath(path, type);
        if (info) {
            return assets.get(info.uuid) as T || null;
        }
        else {
            return null;
        }
    }

    /**
     * @en
     * Release the asset loaded by {{#crossLink "Bundle/load:method"}}{{/crossLink}} or {{#crossLink "Bundle/loadDir:method"}}{{/crossLink}}
     * and it's dependencies. Refer to {{#crossLink "AssetManager/releaseAsset:method"}}{{/crossLink}} for detailed informations.
     *
     * @zh
     * 释放通过 {{#crossLink "Bundle/load:method"}}{{/crossLink}} 或者 {{#crossLink "Bundle/loadDir:method"}}{{/crossLink}} 加载的资源。
     * 详细信息请参考 {{#crossLink "AssetManager/releaseAsset:method"}}{{/crossLink}}
     *
     * @param path - The path of asset
     * @param type - Only asset of type will be released if this argument is supplied.
     *
     * @example
     * // release a texture which is no longer need
     * bundle1.release('misc/character/cocos');
     *
     */
    public release (path: string, type?: AssetType | null) {
        const asset = this.get(path, type);
        if (asset) {
            releaseManager.tryRelease(asset, true);
        }
    }

    /**
     * @en
     * Release all unused assets within this bundle. Refer to {{#crossLink "AssetManager/releaseAll:method"}}{{/crossLink}} for detailed informations.
     *
     * @zh
     * 释放此包中的所有没有用到的资源。详细信息请参考 {{#crossLink "AssetManager/releaseAll:method"}}{{/crossLink}}
     *
     * @private
     *
     * @example
     * // release all unused asset within bundle1
     * bundle1.releaseUnusedAssets();
     *
     */
    public releaseUnusedAssets () {
        assets.forEach((asset) => {
            const info = this.getAssetInfo(asset._uuid);
            if (info && !info.redirect) {
                releaseManager.tryRelease(asset);
            }
        });
    }

    /**
     * @en
     * Release all assets within this bundle. Refer to {{#crossLink "AssetManager/releaseAll:method"}}{{/crossLink}} for detailed informations.
     *
     * @zh
     * 释放此包中的所有资源。详细信息请参考 {{#crossLink "AssetManager/releaseAll:method"}}{{/crossLink}}
     *
     * @example
     * // release all asset within bundle1
     * bundle1.releaseAll();
     */
    public releaseAll () {
        assets.forEach((asset) => {
            const info = this.getAssetInfo(asset._uuid);
            if (info && !info.redirect) {
                releaseManager.tryRelease(asset, true);
            }
        });
    }

    public _destroy () {
        this._config.destroy();
    }

}

/**
 * @en
 * resources is a bundle and controls all asset under assets/resources
 *
 * @zh
 * resources 是一个 bundle，用于管理所有在 assets/resources 下的资源
 */
export const resources: Bundle = new Bundle();
legacyCC.resources = resources;
