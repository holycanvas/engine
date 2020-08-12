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
import RequestItem from './request-item';
import { assets, CompleteCallbackNoData, fetchPipeline } from './shared';
import Task from './task';
import { clear, forEach, getDepends } from './utilities';

export default function fetch (task: Task, done: CompleteCallbackNoData) {

    let firstTask = false;
    if (!task.progress) {
        task.progress = { finish: 0, total: task.input.length };
        firstTask = true;
    }

    const { options, progress } = task;
    const depends = [];
    const total = progress.total;
    options!.__exclude__ = options!.__exclude__ || Object.create(null);

    task.output = [];

    forEach(task.input as RequestItem[], (item, cb) => {

        if (!item.isNative && assets.has(item.uuid)) {
            const asset = assets.get(item.uuid);
            asset!.addRef();
            // @ts-ignore
            handle(item, task, asset, null, asset.__asyncLoadAssets__, depends, total, done);
            return cb();
        }

        packManager.load(item, task.options, (err, data) => {
            if (err) {
                if (!task.isFinish) {
                    if (!assetManager.force) {
                        error(err.message, err.stack);
                        done(err);
                    }
                    else {
                        handle(item, task, null, null, false, depends, total, done);
                    }
                }
            }
            else {
                if (!task.isFinish) {
                    handle(item, task, null, data, !item.isNative, depends, total, done);
                }
            }
            cb();
        });

    }, () => {

        if (task.isFinish) {
            clear(task, true);
            return task.dispatch('error');
        }
        if (depends.length > 0) {

            // stage 2 , download depend asset
            const subTask = Task.create({
                input: depends,
                progress,
                options,
                onProgress: task.onProgress,
                onError: Task.prototype.recycle,
                onComplete: (err) => {
                    if (!err) {
                        task.output.push.apply(task.output, subTask.output);
                        subTask.recycle();
                    }
                    if (firstTask) { decreaseRef(task); }
                    done(err);
                },
            });
            fetchPipeline.async(subTask);
            return;
        }
        if (firstTask) { decreaseRef(task); }
        done();
    });
}

function decreaseRef (task: Task) {
    const output = task.output as RequestItem[];
    for (let i = 0, l = output.length; i < l; i++) {
        if (output[i].content) {
            (output[i].content as Asset).decRef(false);
        }
    }
}

function handle (item: RequestItem, task: Task, content: any, file: any, loadDepends: boolean, depends: any[], last: number, done: CompleteCallbackNoData) {

    const exclude = task.options!.__exclude__;
    const progress = task.progress;

    item.content = content;
    item.file = file;
    task.output.push(item);

    if (loadDepends) {
        exclude[item.uuid] = true;
        const err = getDepends(item.uuid, file || content, exclude, depends, true, false, item.config!);
        if (err) {
            if (!assetManager.force) {
                error(err.message, err.stack);
                return done(err);
            }
            item.file = null;
        }
        progress.total = last + depends.length;
    }

    task.dispatch('progress', ++progress.finish, progress.total, item);
}
