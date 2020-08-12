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

import { EDITOR } from 'internal:constants';
import MissingScript from '../components/missing-script';
import { deserialize, Details } from '../data';
import { decodeUuid } from './helper';

let missingClass;

export interface IDependProp {
    uuid: string;
    owner: any;
    prop: string;
}

export default function (json: Record<string, any>, options?: Record<string, any>) {
    let classFinder;
    if (EDITOR) {
        missingClass = missingClass || EditorExtends.MissingReporter.classInstance;
        classFinder = (type, data, owner, propName) => {
            const res = missingClass.classFinder(type, data, owner, propName);
            if (res) {
                return res;
            }
            return MissingScript;
        };
        classFinder.onDereferenced = missingClass.classFinder.onDereferenced;
    }
    else {
        classFinder = MissingScript.safeFindClass;
    }

    const tdInfo = Details.pool.get() as Details;

    let asset;
    try {
        asset = deserialize(json, tdInfo, {
            classFinder,
            customEnv: options,
        });
    }
    catch (e) {
        Details.pool.put(tdInfo);
        throw e;
    }

    if (EDITOR && missingClass) {
        missingClass.reportMissingClass(asset);
        missingClass.reset();
    }

    const uuidList = tdInfo.uuidList;
    const objList = tdInfo.uuidObjList;
    const propList = tdInfo.uuidPropList;
    const depends: IDependProp[] = [];

    for (let i = 0; i < uuidList.length; i++) {
        const dependUuid = uuidList[i];
        depends[i] = {
            uuid: decodeUuid(dependUuid),
            owner: objList[i],
            prop: propList[i],
        };
    }

    // non-native deps
    asset.__depends__ = depends;
    // native dep
    if (asset._native) {
        asset.__nativeDepend__ = true;
    }
    Details.pool.put(tdInfo);
    return asset;

}
