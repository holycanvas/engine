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
import { EDITOR } from 'internal:constants';
import { Asset } from '../assets';
import { error, warn } from '../platform/debug';
import packManager from './pack-manager';
import parser from './parser';
import { Pipeline } from './pipeline';
import RequestItem from './request-item';
import { CompleteCallbackNoData, assets, files, parsed, pipeline, transformPipeline, IRequest, ILowLevelRequest } from './shared';
import Task from './task';
import { cache, clear, forEach, gatherAsset, getDepends, setProperties } from './utilities';
import { legacyCC } from '../global-exports';

/**
 * @packageDocumentation
 * @hidden
 */

export default function load (task: Task, done: CompleteCallbackNoData) {
    let firstTask = false;
    if (!task.progress) {
        task.progress = { finish: 0, total: task.input.length, canInvoke: true };
        firstTask = true;
    }

    const { options, progress, cancelToken } = task;

    options!.__exclude__ = options!.__exclude__ || Object.create(null);

    task.output = [];

    forEach(task.input as RequestItem[], (item, cb) => {
        const subTask = Task.create({
            input: item,
            onProgress: task.onProgress,
            options,
            progress,
            onComplete: (err, result) => {
                if (err && !task.isFinish) {
                    if (!legacyCC.assetManager.force || firstTask) {
                        if (!EDITOR) {
                            error(err.message, err.stack);
                        }
                        cancelToken!.isCanceled = true;
                        done(err);
                    } else if (progress.canInvoke) {
                        task.dispatch('progress', ++progress.finish, progress.total, item);
                    }
                }
                task.output.push(result);
                subTask.recycle();
                cb(null);
            },
        });

        loadOneAssetPipeline.async(subTask);
    }, () => {
        options!.__exclude__ = null;

        if (task.isFinish) {
            clear(task, true);
            task.dispatch('error');
            return;
        }

        gatherAsset(task);
        clear(task, true);
        done();
    });
}

const loadOneAssetPipeline = new Pipeline('loadOneAsset', [

    function parse (task: Task) {
        const options = task.options;
        const item = task.input;
        // local options will overlap glabal options
        js.addon(item, options);
        if (item.preset) {
            js.addon(item, presets[item.preset]);
        }
        if (item.uuid) {
            const uuid = decodeUuid(item.uuid);
            let config: Config | null = null;
            let info: IAssetInfo | null = null;
            if (!item.bundle) {
                const bundle = bundles.find((bundle) => !!bundle.getAssetInfo(uuid));
                item.bundle = (bundle && bundle.name) || '';
            }
            if (bundles.has(item.bundle)) {
                config = bundles.get(item.bundle)!.config;
                info = config.getAssetInfo(uuid);
                if (info && info.redirect) {
                    if (!bundles.has(info.redirect)) { throw new Error(`Please load bundle ${info.redirect} first`); }
                    config = bundles.get(info.redirect)!.config;
                    info = config.getAssetInfo(uuid);
                }
            }
            const out: RequestItem = RequestItem.create();
            out.uuid = uuid;
            out.config = config;
            out.info = info;
            out.ext = item.ext || '.json';
            out.isNative = item.__isNative__;
            task.output = out;
        } else if (item.url) {
            const out: RequestItem = RequestItem.create();
            out.url = item.url;
            out.uuid = item.uuid || item.url;
            out.ext = item.ext || path.extname(item.url);
            out.isNative = item.__isNative__ !== undefined ? item.__isNative__ : true;
            task.output = out;
        }
    },

    function combine (task: Task) {
        const input = task.output = task.input;
        const item = input as RequestItem;
        if (!item.url) {
            let url = '';
            let base = '';
            const config = item.config;
            if (item.isNative) {
                base = (config && config.nativeBase) ? (config.base + config.nativeBase) : legacyCC.assetManager.generalNativeBase;
            } else {
                base = (config && config.importBase) ? (config.base + config.importBase) : legacyCC.assetManager.generalImportBase;
            }

            const uuid = item.uuid;

            let ver = '';
            if (item.info) {
                if (item.isNative) {
                    ver = item.info.nativeVer ? (`.${item.info.nativeVer}`) : '';
                } else {
                    ver = item.info.ver ? (`.${item.info.ver}`) : '';
                }
            }

            // ugly hack, WeChat does not support loading font likes 'myfont.dw213.ttf'. So append hash to directory
            if (item.ext === '.ttf') {
                url = `${base}/${uuid.slice(0, 2)}/${uuid}${ver}/${item.options.__nativeName__}`;
            } else {
                url = `${base}/${uuid.slice(0, 2)}/${uuid}${ver}${item.ext}`;
            }

            item.url = url;
        }
    },

    function fetch (task, done) {
        const item = task.output = task.input as RequestItem;
        const { options, isNative, uuid, file } = item;
        const { reloadAsset } = options;

        if (file || (!reloadAsset && !isNative && assets.has(uuid))) {
            done();
            return;
        }

        packManager.load(item, task.options, (err, data) => {
            item.file = data;
            done(err);
        });
    },

    function parse (task, done) {
        const item: RequestItem = task.output = task.input;
        const { id, file, options } = item;

        if (item.isNative) {
            parser.parse(id, file, item.ext, options, (err, asset) => {
                if (err) {
                    done(err);
                    return;
                }
                item.content = asset;
                done();
            });
        } else {
            const { uuid } = item;
            if (!options.reloadAsset && assets.has(uuid)) {
                item.content = assets.get(uuid)!;
                done();
            } else {
                options.__uuid__ = uuid;
                parser.parse(id, file, 'import', options, (err, asset: Asset) => {
                    if (!err) {
                        item.content = asset;
                    }
                    item.loadDepends = true;
                    done(err);
                });
            }
        }
    },

    function loadDepends (task) {
        const { input: item, progress } = task;
        if (!item.loadDepends) {
            task.done();
            return;
        }

        const { uuid, config, content: asset } = item as RequestItem;
        if (task.options!.__exclude__[uuid]) {
            task.done();
            return;
        }

        task.options!.__exclude__[uuid] = true;
        const depends: IRequest[] = [];
        getDepends(uuid, asset, Object.create(null), depends, config!);
        progress.total += depends.length;

        depends.map((depend) => {
            const subTask = Task.create();
            subTask.input = depend[0];
        });
        const subTask = Task.create({
            input: depends,
            options: task.options,
            onProgress: task.onProgress,
            onError: Task.prototype.recycle,
            progress,
            onComplete: done,
        });

        loadOneAssetPipeline.async(subTask);
        task.subTask = subTask;
    },

    function initialize (task) {
        const { input: item, progress } = task;
        const id = item.id;
        if (task.subTask) {
            const { uuid, options, content: asset } = item as RequestItem;
            const { cacheAsset } = options;
            const subTask = task.subTask as Task;
            const output = Array.isArray(subTask.output) ? subTask.output : [subTask.output];
            const map: Record<string, any> = Object.create(null);
            for (const dependAsset of output) {
                if (!dependAsset) { continue; }
                map[dependAsset instanceof Asset ? `${dependAsset._uuid}@import` : `${uuid}@native`] = dependAsset;
            }

            setProperties(uuid, asset, map);
            try {
                if (asset.onLoaded && !asset.__onLoadedInvoked__) {
                    asset.onLoaded();
                    asset.__onLoadedInvoked__ = true;
                }
            } catch (e) {
                error(e.message, e.stack);
            }
            subTask.recycle();
            task.subTask = null;
            cache(uuid, asset, cacheAsset);
        }
        files.remove(id);
        parsed.remove(id);
        if (progress.canInvoke) {
            task.dispatch('progress', ++progress.finish, progress.total, item);
        }
        task.done();
    },
]);
