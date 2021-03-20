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
import Task, { CancelToken } from './task';
import { cache, clear, forEach, gatherAsset, getDepends, setProperties } from './utilities';
import { legacyCC } from '../global-exports';
import { path } from '../utils';
import downloader from './downloader';

/**
 * @packageDocumentation
 * @hidden
 */

export default function load (task: Task) {

    const progress = { finish: 0, total: task.input.length };

    task.output = [];

    const cancelToken = new CancelToken();

    task.input.foreach((request) => {
        const subTask = Task.create(RequestItem);
        subTask.input = request;
        subTask.cancelToken = cancelToken;
        subTask.priority = request.priority;
        subTask.onCancel = function () {
            this.recycle();
        };
        subTask.onError = function () {
            if (!EDITOR) {
                error(this.error!.message, this.error!.stack);
            }
            task.done(this.error);
            cancelToken.isCanceled = true;
            this.recycle();
        };
        subTask.onComplete = function () {
            task.dispatch('progress', ++progress.finish, progress.total, subTask.output);
            task.output.push(subTask.output);
            this.recycle();
        };
        task.subTasks.push(subTask);
    });

    loadOneAssetPipeline.asyncAll(task.subTasks);
    task.dependsOn(task.subTasks);
}



function processInput (task: RequestItem) {
    const item = task.input;
    if (item.uuid) {
        task.uuid = item.uuid;
        task.config = item.config;
        task.info = item.info;
        task.ext = item.ext || '.json';
        task.options = item;
    } else if (item.url) {
        task.url = item.url;
        task.uuid = item.uuid || item.url;
        task.ext = item.ext || path.extname(item.url);
        task.options = item;
    }
}

function combine (task: RequestItem) {
    if (!task.url) {
        let url = '';
        const config = task.config;
        const base = (config && config.base) ? config.base : legacyCC.assetManager.generalImportBase;

        const uuid = task.uuid;

        let ver = '';
        if (task.info) {
            ver = task.info.ver ? (`.${task.info.ver}`) : '';
        }

        // ugly hack, WeChat does not support loading font likes 'myfont.dw213.ttf'. So append hash to directory
        if (task.ext === '.ttf') {
            url = `${base}/${uuid.slice(0, 2)}/${uuid}${ver}/${task.info!.name}`;
        } else {
            url = `${base}/${uuid.slice(0, 2)}/${uuid}${ver}${task.ext}`;
        }

        task.url = url;
    }
}

function fetch (task: RequestItem) {
    const { options, uuid, file, info, ext, url } = task;
    const { reloadAsset } = options;

    if (file || (!reloadAsset && assets.has(uuid))) {
        task.done();
        return;
    }

    if (!info || !info.packs) {
        downloader.download(uuid, url, ext, options, (err, data) => {
            task.file = data;
            task.done(err);
        });
        return;
    }

    if (files.has(uuid)) {
        task.file = files.get(uuid);
        task.done();
        return;
    }

    packManager.load(task, options, (err, data) => {
        task.file = data;
        task.done(err);
    });
}

function parse (task: RequestItem) {
    const { file, options, uuid, ext } = task;

    if (!options.reloadAsset && assets.has(uuid)) {
        task.content = assets.get(uuid)!;
        task.done();
    } else {
        parser.parse(uuid, file, ext, options, (err, asset: Asset) => {
            task.content = asset;
            if (err) {
                task.done(err);
            } else {
                task.dependsOn(task.subTasks);
            }
        });
    }

}

function initialize (task: RequestItem) {
    const { uuid, options, content: asset } = task;
    if (task.subTasks.length > 0) {
        const { cacheAsset } = options;
        const map: Record<string, any> = Object.create(null);
        for (const subTask of task.subTasks) {
            map[subTask.uuid] = subTask.output;
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
        cache(uuid, asset, cacheAsset);
    }
    files.remove(uuid);
    parsed.remove(uuid);
    task.done();
}

const loadOneAssetPipeline = new Pipeline('loadOneAsset', [ processInput, combine, fetch, parse, initialize ]);
const preloadOneAssetPipeline = new Pipeline('loadOneAsset', [ processInput, combine, fetch ]);