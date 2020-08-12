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

import { Asset, error, path } from '..';
import { legacyCC } from '../global-exports';
import Bundle from './bundle';
import Cache from './cache';
import CacheManager from './cache-manager';
import dependUtil from './depend-util';
import downloader from './downloader';
import factory from './factory';
import fetch from './fetch';
import * as helper from './helper';
import load from './load';
import packManager from './pack-manager';
import parser from './parser';
import { IPipe, Pipeline } from './pipeline';
import preprocess from './preprocess';
import releaseManager from './releaseManager';
import RequestItem from './request-item';
import { CompleteCallback, CompleteCallbackNoData, Input, Options, presets, ProgressCallback } from './shared';
import { assets, BuiltinBundleName, bundles, fetchPipeline, files, parsed, pipeline, RequestType, transformPipeline } from './shared';
import Task from './task';
import { combine, parse } from './urlTransformer';
import { asyncify, parseParameters } from './utilities';

/**
 * @en
 * This module controls asset's behaviors and information, include loading, releasing etc. it is a singleton
 * All member can be accessed with `cc.assetManager`.
 *
 * @zh
 * 此模块管理资源的行为和信息，包括加载，释放等，这是一个单例，所有成员能够通过 `cc.assetManager` 调用
 *
 */
class AssetManager {

    /**
     * @en
     * Normal loading pipeline
     *
     * @zh
     * 正常加载管线
     *
     */
    public pipeline: Pipeline = pipeline.append(preprocess).append(load);

    /**
     * @en
     * Fetching pipeline
     *
     * @zh
     * 下载管线
     *
     */
    public fetchPipeline: Pipeline = fetchPipeline.append(preprocess).append(fetch);

    /**
     * @en
     * Url transformer
     *
     * @zh
     * Url 转换器
     *
     */
    public transformPipeline: Pipeline = transformPipeline.append(parse).append(combine);

    /**
     * @en
     * The collection of bundle which is already loaded, you can remove cache with {{#crossLink "AssetManager/removeBundle:method"}}{{/crossLink}}
     *
     * @zh
     * 已加载 bundle 的集合， 你能通过 {{#crossLink "AssetManager/removeBundle:method"}}{{/crossLink}} 来移除缓存
     *
     */
    public bundles: Cache<Bundle> = bundles;

    /**
     * @en
     * The collection of asset which is already loaded, you can remove cache with {{#crossLink "AssetManager/releaseAsset:method"}}{{/crossLink}}
     *
     * @zh
     * 已加载资源的集合， 你能通过 {{#crossLink "AssetManager/releaseAsset:method"}}{{/crossLink}} 来移除缓存
     *
     * assets: AssetManager.Cache<cc.Asset>
     */
    public assets: Cache<Asset> = assets;

    public generalImportBase = '';
    public generalNativeBase = '';

    /**
     * @en
     * Manage relationship between asset and its dependencies
     *
     * @zh
     * 管理资源依赖关系
     */
    public dependUtil = dependUtil;

    /**
     * @en
     * Whether or not load asset forcely, if it is true, asset will be loaded regardless of error
     *
     * @zh
     * 是否强制加载资源, 如果为 true ，加载资源将会忽略报错
     *
     */
    public force = false;

    /**
     * @en
     * Some useful function
     *
     * @zh
     * 一些有用的方法
     *
     */
    public utils = helper;

    /**
     * @en
     * Manage all downloading task
     *
     * @zh
     * 管理所有下载任务
     *
     */
    public downloader = downloader;

    /**
     * @en
     * Manage all parsing task
     *
     * @zh
     * 管理所有解析任务
     *
     */
    public parser = parser;

    /**
     * @en
     * Manage all packed asset
     *
     * @zh
     * 管理所有合并后的资源
     *
     */
    public packManager = packManager;

    /**
     * @en
     * Whether or not cache the loaded asset
     *
     * @zh
     * 是否缓存已加载的资源
     *
     */
    public cacheAsset = true;

    /**
     * @en
     * Cache manager is a module which controls all caches downloaded from server in non-web platform.
     *
     * @zh
     * 缓存管理器是一个模块，在非 WEB 平台上，用于管理所有从服务器上下载下来的缓存
     *
     */
    public cacheManager: CacheManager | null = null;

    /**
     * @en
     * The preset of options
     *
     * @zh
     * 可选参数的预设集
     *
     */
    public presets = presets;

    public factory = factory;

    private _releaseManager = releaseManager;

    private _preprocessPipe: IPipe = preprocess;

    private _fetchPipe: IPipe = fetch;

    private _loadPipe: IPipe = load;

    private _files = files;

    private _parsed = parsed;

    /**
     * @en
     * The builtin 'main' bundle
     *
     * @zh
     * 内置 main 包
     */
    public get main (): Bundle | null {
        return bundles.get(BuiltinBundleName.MAIN) || null;
    }

    /**
     * @en
     * The builtin 'resources' bundle
     *
     * @zh
     * 内置 resources 包
     *
     */
    public get resources (): Bundle | null {
        return bundles.get(BuiltinBundleName.RESOURCES) || null;
    }

    /**
     * @en
     * Initialize assetManager with options
     *
     * @zh
     * 初始化资源管理器
     *
     * @param options - the configuration
     *
     */
    public init (options: Record<string, any> = Object.create(null)) {
        this._files.clear();
        this._parsed.clear();
        this._releaseManager.init();
        this.assets.clear();
        this.bundles.clear();
        this.packManager.init();
        this.downloader.init(options.bundleVers);
        this.parser.init();
        this.dependUtil.init();
        this.generalImportBase = options.importBase;
        this.generalNativeBase = options.nativeBase;
    }

    /**
     * @en
     * Get the bundle which has been loaded
     *
     * @zh
     * 获取已加载的分包
     *
     * @param name - The name of bundle
     * @return - The loaded bundle
     *
     * @example
     * // ${project}/assets/test1
     * cc.assetManager.getBundle('test1');
     *
     * cc.assetManager.getBundle('resources');
     *
     */
    public getBundle (name: string): Bundle | null {
        return bundles.get(name) || null;
    }

    /**
     * @en
     * Remove this bundle. NOTE: The asset whthin this bundle will not be released automatically,
     * you can call {{#crossLink "Bundle/releaseAll:method"}}{{/crossLink}} manually before remove it if you need
     *
     * @zh
     * 移除此包, 注意：这个包内的资源不会自动释放, 如果需要的话你可以在摧毁之前手动调用 {{#crossLink "Bundle/releaseAll:method"}}{{/crossLink}} 进行释放
     *
     * @param bundle - The bundle to be removed
     *
     * @typescript
     * removeBundle(bundle: cc.AssetManager.Bundle): void
     */
    public removeBundle (bundle: Bundle) {
        bundle._destroy();
        bundles.remove(bundle.name);
    }

    public loadAny (requests: Input, options: Options | null, onProgress: ProgressCallback | null, onComplete: CompleteCallback | null): void;
    public loadAny (requests: Input, onProgress: ProgressCallback | null, onComplete: CompleteCallback | null): void;
    public loadAny (requests: Input, options: Options | null, onComplete?: CompleteCallback | null): void;
    public loadAny (requests: Input, onComplete?: CompleteCallback | null): void;

    /**
     * @en
     * General interface used to load assets with a progression callback and a complete callback. You can achieve almost all
     * effect you want with combination of `requests` and `options`.It is highly recommended that you use more simple API,
     * such as `load`, `loadDir` etc. Every custom parameter in `options` will be distribute to each of `requests`. if request
     * already has same one, the parameter in request will be given priority. Besides, if request has dependencies, `options`
     * will distribute to dependencies too. Every custom parameter in `requests` will be tranfered to handler of `downloader`
     * and `parser` as `options`. You can register you own handler downloader or parser to collect these custom parameters for some effect.
     *
     * Reserved Keyword: `uuid`, `url`, `path`, `dir`, `scene`, `type`, `priority`, `preset`, `audioLoadMode`, `ext`,
     * `bundle`, `onFileProgress`, `maxConcurrency`, `maxRequestsPerFrame`, `maxRetryCount`, `version`, `responseType`,
     * `withCredentials`, `mimeType`, `timeout`, `header`, `reload`, `cacheAsset`, `cacheEnabled`,
     * Please DO NOT use these words as custom options!
     *
     * @zh
     * 通用加载资源接口，可传入进度回调以及完成回调，通过组合 `request` 和 `options` 参数，几乎可以实现和扩展所有想要的加载效果。非常建议
     * 你使用更简单的API，例如 `load`、`loadDir` 等。`options` 中的自定义参数将会分发到 `requests` 的每一项中，如果request中已存在同名的
     * 参数则以 `requests` 中为准，同时如果有其他依赖资源，则 `options` 中的参数会继续向依赖项中分发。request中的自定义参数都会以 `options`
     * 形式传入加载流程中的 `downloader`, `parser` 的方法中, 你可以扩展 `downloader`, `parser` 收集参数完成想实现的效果。
     *
     * 保留关键字: `uuid`, `url`, `path`, `dir`, `scene`, `type`, `priority`, `preset`, `audioLoadMode`, `ext`, `bundle`, `onFileProgress`,
     *  `maxConcurrency`, `maxRequestsPerFrame`, `maxRetryCount`, `version`, `responseType`, `withCredentials`, `mimeType`, `timeout`, `header`,
     *  `reload`, `cacheAsset`, `cacheEnabled`, 请不要使用这些字段为自定义参数!
     *
     * @param requests - The request you want to load
     * @param options - Optional parameters
     * @param onProgress - Callback invoked when progression change
     * @param onProgress.finished - The number of the items that are already completed
     * @param onProgress.total - The total number of the items
     * @param onProgress.item - The current request item
     * @param onComplete - Callback invoked when finish loading
     * @param onComplete.err - The error occured in loading process.
     * @param onComplete.data - The loaded content
     *
     * @example
     * cc.assetManager.loadAny({url: 'http://example.com/a.png'}, (err, img) => cc.log(img));
     * cc.assetManager.loadAny(['60sVXiTH1D/6Aft4MRt9VC'], (err, assets) => cc.log(assets));
     * cc.assetManager.loadAny([{ uuid: '0cbZa5Y71CTZAccaIFluuZ'}, {url: 'http://example.com/a.png'}], (err, assets) => cc.log(assets));
     * cc.assetManager.downloader.register('.asset', (url, options, onComplete) => {
     *      url += '?userName=' + options.userName + "&password=" + options.password;
     *      cc.assetManager.downloader.downloadFile(url, null, onComplete);
     * });
     * cc.assetManager.parser.register('.asset', (file, options, onComplete) => {
     *      var json = JSON.parse(file);
     *      var skin = json[options.skin];
     *      var model = json[options.model];
     *      onComplete(null, {skin, model});
     * });
     * cc.assetManager.loadAny({ url: 'http://example.com/my.asset', skin: 'xxx', model: 'xxx', userName: 'xxx', password: 'xxx' });
     *
     */
    public loadAny (reqs: Input,
                    opts?: Options | ProgressCallback | CompleteCallback | null,
                    onProg?: ProgressCallback | CompleteCallback | null,
                    onComp?: CompleteCallback | null) {

        const { options, onProgress, onComplete } = parseParameters(opts, onProg, onComp);
        options.preset = options.preset || 'default';
        const task = new Task({input: reqs, onProgress, onComplete: asyncify(onComplete), options});
        pipeline.async(task);
    }

    public preloadAny (requests: Input, options: Options | null, onProgress: ProgressCallback | null, onComplete: CompleteCallback<RequestItem[]> | null): void;
    public preloadAny (requests: Input, onProgress: ProgressCallback | null, onComplete: CompleteCallback<RequestItem[]> | null): void;
    public preloadAny (requests: Input, options: Options | null, onComplete?: CompleteCallback<RequestItem[]> | null): void;
    public preloadAny (requests: Input, onComplete?: CompleteCallback<RequestItem[]> | null): void;

    /**
     * @en
     * General interface used to preload assets with a progression callback and a complete callback.It is highly recommended that you use
     * more simple API, such as `preloadRes`, `preloadResDir` etc. Everything about preload is just likes `cc.assetManager.loadAny`, the
     * difference is `cc.assetManager.preloadAny` will only download asset but not parse asset. You need to invoke `cc.assetManager.loadAny(preloadTask)`
     * to finish loading asset
     *
     * @zh
     * 通用预加载资源接口，可传入进度回调以及完成回调，非常建议你使用更简单的 API ，例如 `preloadRes`, `preloadResDir` 等。`preloadAny` 和 `loadAny`
     * 几乎一样，区别在于 `preloadAny` 只会下载资源，不会去解析资源，你需要调用 `cc.assetManager.loadAny(preloadTask)` 来完成资源加载。
     *
     * @param requests - The request you want to preload
     * @param options - Optional parameters
     * @param onProgress - Callback invoked when progression change
     * @param onProgress.finished - The number of the items that are already completed
     * @param onProgress.total - The total number of the items
     * @param onProgress.item - The current request item
     * @param onComplete - Callback invoked when finish preloading
     * @param onComplete.err - The error occured in preloading process.
     * @param onComplete.items - The preloaded content
     *
     * @example
     * cc.assetManager.preloadAny('0cbZa5Y71CTZAccaIFluuZ', (err) => cc.assetManager.loadAny('0cbZa5Y71CTZAccaIFluuZ'));
     *
     */
    public preloadAny (reqs: Input,
                       opts?: Options | ProgressCallback | CompleteCallback<RequestItem[]> | null,
                       onProg?: ProgressCallback | CompleteCallback<RequestItem[]> | null,
                       onComp?: CompleteCallback<RequestItem[]> | null) {

        const { options, onProgress, onComplete } = parseParameters(opts, onProg, onComp);
        options.preset = options.preset || 'preload';
        const task = new Task({input: reqs, onProgress, onComplete: asyncify(onComplete), options});
        fetchPipeline.async(task);
    }

    public postLoadNative (asset: Asset, options: Options | null, onComplete: CompleteCallbackNoData | null): void;
    public postLoadNative (asset: Asset, onComplete?: CompleteCallbackNoData | null): void;

    /**
     * @en
     * Load native file of asset, if you check the option 'Async Load Assets', you may need to load native file with this before you use the asset
     *
     * @zh
     * 加载资源的原生文件，如果你勾选了'延迟加载资源'选项，你可能需要在使用资源之前调用此方法来加载原生文件
     *
     * @param asset - The asset
     * @param options - Some optional parameters
     * @param onComplete - Callback invoked when finish loading
     * @param onComplete.err - The error occured in loading process.
     *
     * @example
     * cc.assetManager.postLoadNative(texture, (err) => console.log(err));
     *
     */
    public postLoadNative (asset: Asset, opts?: Options | CompleteCallbackNoData | null, onComp?: CompleteCallbackNoData | null) {
        const { options, onComplete } = parseParameters(opts, undefined, onComp);

        if (!asset._native || asset._nativeAsset) {
            return asyncify(onComplete)(null);
        }

        const depend = dependUtil.getNativeDep(asset._uuid);
        if (!depend) { return; }
        if (!bundles.has(depend.bundle)) {
            const bundle = bundles.find((b) => !!b.getAssetInfo(asset._uuid));
            if (bundle) {
                depend.bundle = bundle.name;
            }
        }

        this.loadAny(depend, options, (err, native) => {
            if (!err) {
                if (!asset._nativeAsset) { asset._nativeAsset = native; }
            }
            else {
                error(err.message, err.stack);
            }
            if (onComplete) { onComplete(err); }
        });
    }

    public loadRemote<T extends Asset> (url: string, options: Options | null, onComplete?: CompleteCallback<T> | null): void;
    public loadRemote<T extends Asset> (url: string, onComplete?: CompleteCallback<T> | null): void;
    public loadRemote<T extends Bundle> (url: string, options: Options | null, onComplete: CompleteCallback<T> | null): void;
    /**
     * @en
     * Load remote asset with url, such as audio, image, text and so on.
     *
     * @zh
     * 使用 url 加载远程资源，例如音频，图片，文本等等。
     *
     * @param url - The url of asset
     * @param options - Some optional parameters
     * @param options.audioLoadMode - Indicate which mode audio you want to load
     * @param options.ext - If the url does not have a extension name, you can specify one manually.
     * @param onComplete - Callback invoked when finish loading
     * @param onComplete.err - The error occured in loading process.
     * @param onComplete.asset - The loaded texture
     *
     * @example
     * cc.assetManager.loadRemote('http://www.cloud.com/test1.jpg', (err, texture) => console.log(err));
     * cc.assetManager.loadRemote('http://www.cloud.com/test2.mp3', (err, audioClip) => console.log(err));
     * cc.assetManager.loadRemote('http://www.cloud.com/test3', { ext: '.png' }, (err, texture) => console.log(err));
     *
     */
    public loadRemote<T extends Asset|Bundle> (url: string, opts?: Options | CompleteCallback<T> | null, onComp?: CompleteCallback<T> | null) {

        const { options, onComplete } = parseParameters(opts, undefined, onComp);

        if (this.assets.has(url)) {
            return asyncify(onComplete)(null, this.assets.get(url));
        }

        options.__isNative__ = true;
        options.preset = options.preset || 'remote';
        this.loadAny({url}, options, null, (err, data) => {
            if (err) {
                error(err.message, err.stack);
                if (onComplete) { onComplete(err, null); }
            }
            else {
                factory.create(url, data, options.ext || path.extname(url), options, (p1, p2) => {
                    if (onComplete) { onComplete(p1, p2 as T); }
                });
            }
        });
    }

    public loadScript (url: string|string[], options: Options | null, onComplete?: CompleteCallbackNoData | null): void;
    public loadScript (url: string|string[], onComplete?: CompleteCallbackNoData | null): void;

    /**
     * @en
     * Load script
     *
     * @zh
     * 加载脚本
     *
     * @param url - Url of the script
     * @param options - Some optional paramters
     * @param options.isAsync - Indicate whether or not loading process should be async
     * @param onComplete - Callback when script loaded or failed
     * @param onComplete.err - The occurred error, null indicetes success
     *
     * @example
     * loadScript('http://localhost:8080/index.js', null, (err) => console.log(err));
     */
    public loadScript (url: string|string[], opts?: Options | CompleteCallbackNoData | null, onComp?: CompleteCallbackNoData | null) {
        const { options, onComplete } = parseParameters(opts, undefined, onComp);
        options.__requestType__ = RequestType.URL;
        options.preset = options.preset || 'script';
        this.loadAny(url, options, onComplete);
    }

    public loadBundle (nameOrUrl: string, options: Options | null, onComplete?: CompleteCallback<Bundle> | null): void;
    public loadBundle (nameOrUrl: string, onComplete?: CompleteCallback<Bundle> | null): void;

    /**
     * @en
     * load bundle
     *
     * @zh
     * 加载资源包
     *
     * @param nameOrUrl - The name or root path of bundle
     * @param options - Some optional paramter, same like downloader.downloadFile
     * @param options.version - The version of this bundle, you can check config.json in this bundle
     * @param onComplete - Callback when bundle loaded or failed
     * @param onComplete.err - The occurred error, null indicetes success
     * @param onComplete.bundle - The loaded bundle
     *
     * @example
     * loadBundle('http://localhost:8080/test', null, (err, bundle) => console.log(err));
     *
     */
    public loadBundle (nameOrUrl: string, opts?: Options | CompleteCallback<Bundle> | null, onComp?: CompleteCallback<Bundle> | null) {
        const { options, onComplete } = parseParameters(opts, undefined, onComp);

        const bundleName = path.basename(nameOrUrl);

        if (this.bundles.has(bundleName)) {
            return asyncify(onComplete)(null, this.getBundle(bundleName));
        }

        options.preset = options.preset || 'bundle';
        options.ext = 'bundle';
        this.loadRemote(nameOrUrl, options, onComplete);
    }

    /**
     * @en
     * Release asset and it's dependencies.
     * This method will not only remove the cache of the asset in assetManager, but also clean up its content.
     * For example, if you release a texture, the texture asset and its gl texture data will be freed up.
     * Notice, this method may cause the texture to be unusable, if there are still other nodes use the same texture,
     * they may turn to black and report gl errors.
     *
     * @zh
     * 释放资源以及其依赖资源, 这个方法不仅会从 assetManager 中删除资源的缓存引用，还会清理它的资源内容。
     * 比如说，当你释放一个 texture 资源，这个 texture 和它的 gl 贴图数据都会被释放。
     * 注意，这个函数可能会导致资源贴图或资源所依赖的贴图不可用，如果场景中存在节点仍然依赖同样的贴图，它们可能会变黑并报 GL 错误。
     *
     * @param asset - The asset to be released
     *
     * @example
     * // release a texture which is no longer need
     * cc.assetManager.releaseAsset(texture);
     *
     */
    public releaseAsset (asset: Asset): void {
        releaseManager.tryRelease(asset, true);
    }

    /**
     * @en
     * Release all unused assets. Refer to {{#crossLink "AssetManager/releaseAsset:method"}}{{/crossLink}} for detailed informations.
     *
     * @zh
     * 释放所有没有用到的资源。详细信息请参考 {{#crossLink "AssetManager/releaseAsset:method"}}{{/crossLink}}
     *
     * @hidden
     *
     */
    public releaseUnusedAssets () {
        assets.forEach((asset) => {
            releaseManager.tryRelease(asset);
        });
    }

    /**
     * @en
     * Release all assets. Refer to {{#crossLink "AssetManager/releaseAsset:method"}}{{/crossLink}} for detailed informations.
     *
     * @zh
     * 释放所有资源。详细信息请参考 {{#crossLink "AssetManager/releaseAsset:method"}}{{/crossLink}}
     *
     */
    public releaseAll () {
        assets.forEach((asset) => {
            releaseManager.tryRelease(asset, true);
        });
    }
}

export default legacyCC.assetManager = new AssetManager();
legacyCC.AssetManager = AssetManager;
