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
/**
 * @packageDocumentation
 * @module asset-manager
 */

import Config, { IAssetInfo } from './config';
import { ILowLevelRequest } from './shared';
import Task from './task';

/**
 * @en
 * A collection of information about a request
 *
 * @zh
 * 请求的相关信息集合
 *
 */
export default class RequestItem extends Task {

    /**
     * @en
     * The uuid of request
     *
     * @zh
     * 请求资源的uuid
     *
     */
    public uuid = '';

    /**
     * @en
     * The final url of request
     *
     * @zh
     * 请求的最终url
     *
     */
    public url = '';

    /**
     * @en
     * The extension name of asset
     *
     * @zh
     * 资源的扩展名
     *
     */
    public ext = '';

    /**
     * @en
     * The content of asset
     *
     * @zh
     * 资源的内容
     *
     */
    public content: any = null;

    /**
     * @en
     * The file of asset
     *
     * @zh
     * 资源的文件
     *
     */
    public file: any = null;

    /**
     * @en
     * The information of asset
     *
     * @zh
     * 资源的相关信息
     *
     */
    public info: IAssetInfo | null = null;

    public config: Config | null = null;

    /**
     * @en
     * Custom options
     *
     * @zh
     * 自定义参数
     *
     */
    public declare options: ILowLevelRequest;

    public declare input: ILowLevelRequest;

    public declare subTasks: RequestItem[];

    /**
     * @en
     * Recycle this for reuse
     *
     * @zh
     * 回收 requestItem 用于复用
     *
     */
    public recycle (): boolean {
        if (super.recycle()) {
            this.uuid = '';
            this.url = '';
            this.ext = '';
            this.content = null;
            this.file = null;
            this.info = null;
            this.config = null;
            return true;
        }
        return false;
    }
}
