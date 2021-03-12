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
import { legacyCC } from '../global-exports';
import { js, path } from '../utils';
import Config, { IAssetInfo } from './config';
import { decodeUuid } from './helper';
import RequestItem from './request-item';
import { bundles, ILowLevelRequest, IRequest, presets } from './shared';
import Task from './task';

declare class TransformTask extends Task {
    input: ILowLevelRequest;
    output: RequestItem;
}

export function parse (task: TransformTask) {
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
}

export function combine (task: Task) {
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
}
