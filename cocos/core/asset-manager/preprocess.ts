/*
 Copyright (c) 2020 Xiamen Yaji Software Co., Ltd.

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
import { js } from '../utils/js';
import { bundles, CompleteCallbackNoData, IRequest, presets, Request, transformPipeline } from './shared';
import Task from './task';

export default function preprocess (task: Task) {
    const requests = task.input as Request;
    const options = task.options;
    const originRequests = Array.isArray(requests) ? requests : [requests];
    const req: IRequest[] = [];
    for (const request of originRequests) {
        if (typeof request === 'string') {
            req.push({ uuid: request });
        } else if (request.path && request.bundle) {
            const bundle = bundles.get(request.bundle);
            if (!bundle) {
                throw new Error(`Bundle ${request.bundle} doesn't contain ${request.path}`);
            }
            const info = bundle.getInfoWithPath(request.path, request.type);
            if (!info) {
                throw new Error(`Bundle ${request.bundle} doesn't contain ${request.path}`);
            }
            request.uuid = info.uuid;
            req.push(request);
        } else if (request.dir && request.bundle) {
            const bundle = bundles.get(request.bundle);
            if (!bundle) {
                throw new Error(`Bundle ${request.bundle} doesn't contain ${request.dir}`);
            }
            const infos = bundle.getDirWithPath(request.dir, request.type);
            infos.forEach((info) => {
                req.push({ uuid: info.uuid, bundle: request.bundle });
            });
        } else if (request.scene && request.bundle) {
            const bundle = bundles.get(request.bundle);
            if (!bundle) {
                throw new Error(`Bundle ${request.bundle} doesn't contain ${request.scene}`);
            }
            const info = bundle.getSceneInfo(request.scene);
            if (!info) {
                throw new Error(`Bundle ${request.bundle} doesn't contain ${request.scene}`);
            }
            request.uuid = info.uuid;
            req.push(request);
        } else if (!request.uuid && !request.url) {
            throw new Error(`Can not parse this input:${JSON.stringify(request)}`);
        }
    }
    req.forEach(item => {
        js.addon(item, options);
        if (item.preset) {
            js.addon(item, presets[item.preset]);
        }
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
    })
    task.output = req;
    done();
}
