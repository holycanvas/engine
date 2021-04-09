/*
 Copyright (c) 2017-2020 Xiamen Yaji Software Co., Ltd.

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
 * @module component/audio
 */

import {
    ccclass, type, serializable, override,
} from 'cc.decorator';
import { Asset } from '../core/assets/asset';
import { legacyCC } from '../core/global-exports';
import { AudioType } from '../../pal/audio/type';

export interface AudioMeta {
    url: string;
    type: AudioType;
    duration: number;
}

/**
 * @en
 * The audio clip asset. <br>
 * 'started' event is emitted once the audio began to play. <br>
 * 'ended' event is emitted once the audio stopped. <br>
 * Low-level platform-specific details are handled independently inside each clip.
 * @zh
 * 音频片段资源。<br>
 * 每当音频片段实际开始播放时，会发出 'started' 事件；<br>
 * 每当音频片段自然结束播放时，会发出 'ended' 事件。<br>
 * 每个片段独立处理自己依赖的平台相关的底层细节。
 */
@ccclass('cc.AudioClip')
export class AudioClip extends Asset {
    public static AudioType = AudioType;

    @serializable
    protected _duration = 0; // we serialize this because it's unavailable at runtime on some platforms

    protected _loadMode = AudioType.UNKNOWN_AUDIO;

    protected _meta: AudioMeta | null = null;

    constructor () {
        super();
        this.loaded = false;
    }

    set _nativeAsset (meta: AudioMeta | null) {
        this._meta = meta;
        if (meta) {
            this.loaded = true;
            this._loadMode = meta.type;
            this.emit('load');
        } else {
            this._meta = null;
            this._loadMode = AudioType.UNKNOWN_AUDIO;
            this._duration = 0;
            this.loaded = false;
        }
    }

    get _nativeAsset () {
        return this._meta;
    }

    @override
    get _nativeDep () {
        return {
            uuid: this._uuid,
            audioLoadMode: this.loadMode,
            ext: this._native,
            __isNative__: true,
        };
    }

    get loadMode () {
        return this._loadMode;
    }

    public getDuration () { return this._meta ? this._meta.duration : this._duration; }
}

legacyCC.AudioClip = AudioClip;
