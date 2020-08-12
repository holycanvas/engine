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
import { Asset } from '../assets';
import { error } from '../platform/debug';
import assetManager from './asset-manager';
import packManager from './pack-manager';
import parser from './parser';
import { Pipeline } from './pipeline';
import RequestItem from './request-item';
import { assets, CompleteCallbackNoData, files, parsed, pipeline } from './shared';
import Task from './task';
import { cache, checkCircleReference, clear, forEach, gatherAsset, getDepends, setProperties } from './utilities';

interface IProgress {
    finish: number;
    total: number;
}

interface ILoadingRequest {
    content: Asset;
    finish: boolean;
    err?: Error | null;
    callbacks: Array<{ done: CompleteCallbackNoData; item: RequestItem }>;
}

export default function load (task: Task, done: CompleteCallbackNoData) {

    if (!task.progress) {
        task.progress = {finish: 0, total: task.input.length};
    }

    const { options, progress } = task;

    options!.__exclude__ = options!.__exclude__ || Object.create(null);

    task.output = [];

    forEach(task.input as RequestItem[], (item, cb) => {

        const subTask = Task.create({
            input: item,
            onProgress: task.onProgress,
            options,
            progress,
            onComplete: (err, result) => {
                if (err && !task.isFinish && !assetManager.force) { done(err); }
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
            return task.dispatch('error');
        }

        gatherAsset(task);
        clear(task, true);
        done();
    });
}

const loadOneAssetPipeline = new Pipeline('loadOneAsset', [

    function fetch (task, done) {
        const item = task.output = task.input as RequestItem;
        const { options, isNative, uuid, file } = item;
        const { reload } = options;

        if (file || (!reload && !isNative && assets.has(uuid))) { return done(); }

        packManager.load(item, task.options, (err, data) => {
            if (err) {
                if (assetManager.force) {
                    err = null;
                }
                else {
                    error(err.message, err.stack);
                }
                data = null;
            }
            item.file = data;
            done(err);
        });
    },

    function parse (task, done) {

        const item: RequestItem = task.output = task.input;
        const progress: IProgress = task.progress;
        const exclude: Record<string, ILoadingRequest> = task.options!.__exclude__;
        const { id, file, options } = item;

        if (item.isNative) {
            parser.parse(id, file, item.ext, options, (err, asset) => {
                if (err) {
                    if (!assetManager.force) {
                        error(err.message, err.stack);
                        return done(err);
                    }
                }
                item.content = asset;
                task.dispatch('progress', ++progress.finish, progress.total, item);
                files.remove(id);
                parsed.remove(id);
                done();
            });
        }
        else {
            const { uuid } = item;
            if (uuid in exclude) {

                const { finish, content, err, callbacks } = exclude[uuid];
                task.dispatch('progress', ++progress.finish, progress.total, item);

                if (finish || checkCircleReference(uuid, uuid, exclude) ) {
                    if (content) { content.addRef(); }
                    item.content = content;
                    done!(err);
                }
                else {
                    callbacks.push({ done, item });
                }
            }
            else {
                if (!options.reload && assets.has(uuid)) {
                    const asset = assets.get(uuid)!;
                    // @ts-ignore
                    if (options.__asyncLoadAssets__ || !asset.__asyncLoadAssets__) {
                        item.content = asset.addRef();
                        task.dispatch('progress', ++progress.finish, progress.total, item);
                        done();
                    }
                    else {
                        loadDepends(task, asset, done, false);
                    }
                }
                else {
                    parser.parse(id, file, 'import', options, (err, asset: Asset) => {
                        if (err) {
                            if (assetManager.force) {
                                err = null;
                            }
                            else {
                                error(err.message, err.stack);
                            }
                            return done(err);
                        }

                        asset._uuid = uuid;
                        loadDepends(task, asset, done, true);
                    });
                }
            }
        }
    },
]);

function loadDepends (task: Task, asset: Asset, done: CompleteCallbackNoData, init: boolean) {

    const { input: item, progress } = task;
    const { uuid, id, options, config } = item as RequestItem;
    const { __asyncLoadAssets__, cacheAsset } = options;

    const depends = [];
    // add reference avoid being released during loading dependencies
    asset.addRef();
    getDepends(uuid, asset, Object.create(null), depends, false, __asyncLoadAssets__, config!);
    task.dispatch('progress', ++progress.finish, progress.total += depends.length, item);

    const repeatItem: ILoadingRequest = task.options!.__exclude__[uuid] = { content: asset, finish: false, callbacks: [{ done, item }] };

    const subTask = Task.create({
        input: depends,
        options: task.options,
        onProgress: task.onProgress,
        onError: Task.prototype.recycle,
        progress,
        onComplete: (err) => {
            asset.decRef(false);
            // @ts-ignore
            asset.__asyncLoadAssets__ = __asyncLoadAssets__;
            repeatItem.finish = true;
            repeatItem.err = err;

            if (!err) {

                const output = Array.isArray(subTask.output) ? subTask.output : [subTask.output];
                const map: Record<string, any> = Object.create(null);
                for (const dependAsset of output) {
                    if (!dependAsset) { continue; }
                    map[dependAsset instanceof Asset ? dependAsset._uuid + '@import' : uuid + '@native'] = dependAsset;
                }

                if (!init) {
                    // @ts-ignore
                    if (asset.__nativeDepend__ && !asset._nativeAsset) {
                        if (!setProperties(uuid, asset, map)) {
                            try {
                                asset.onLoaded();
                            }
                            catch (e) {
                                error(e.message, e.stack);
                            }
                        }
                    }
                }
                else {
                    if (!setProperties(uuid, asset, map)) {
                        try {
                            asset.onLoaded();
                        }
                        catch (e) {
                            error(e.message, e.stack);
                        }
                    }
                    files.remove(id);
                    parsed.remove(id);
                    cache(uuid, asset, cacheAsset !== undefined ? cacheAsset : assetManager.cacheAsset);
                }
                subTask.recycle();
            }

            const callbacks = repeatItem.callbacks;

            for (let i = 0, l = callbacks.length; i < l; i++) {

                const cb = callbacks[i];
                asset.addRef();
                cb.item.content = asset;
                cb.done(err);

            }

            callbacks.length = 0;
        },
    });

    pipeline.async(subTask);
}
