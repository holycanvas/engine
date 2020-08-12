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

import { warnID } from '../platform';
import {safeMeasureText} from '../utils/text-utils';
import { CompleteCallback, Options } from './shared';

interface IFontLoadHandle {
    fontFamilyName: string;
    refWidth: number;
    onComplete: CompleteCallback;
    startTime: number;
}

let _canvasContext: CanvasRenderingContext2D | null = null;
let _intervalId = -1;
// letter symbol number CJK
const _testString = 'BES bswy:->@123\u4E01\u3041\u1101';

const _fontFaces = Object.create(null);

const _loadingFonts: IFontLoadHandle[] = [];
// 3 seconds timeout
const _timeout = 3000;

// Refer to https://github.com/typekit/webfontloader/blob/master/src/core/fontwatcher.js
const useNativeCheck = (() => {
    let nativeCheck;
    return (): boolean => {
        if (nativeCheck === undefined) {
            if ('FontFace' in window) {
                const match = /Gecko.*Firefox\/(\d+)/.exec(window.navigator.userAgent);
                const safari10Match = /OS X.*Version\/10\..*Safari/.exec(window.navigator.userAgent) && /Apple/.exec(window.navigator.vendor);

                if (match) {
                    nativeCheck = parseInt(match[1], 10) > 42;
                }
                else if (safari10Match) {
                    nativeCheck = false;
                }
                else {
                    nativeCheck = true;
                }

            } else {
                nativeCheck = false;
            }
        }

        return nativeCheck;

    };
})();

function _checkFontLoaded () {
    let allFontsLoaded = true;
    const now = Date.now();

    for (let i = _loadingFonts.length - 1; i >= 0; i--) {
        const fontLoadHandle = _loadingFonts[i];
        const fontFamily = fontLoadHandle.fontFamilyName;
        // load timeout
        if (now - fontLoadHandle.startTime > _timeout) {
            warnID(4933, fontFamily);
            fontLoadHandle.onComplete(null, fontFamily);
            _loadingFonts.splice(i, 1);
            continue;
        }

        const oldWidth = fontLoadHandle.refWidth;
        _canvasContext!.font = '40px ' + fontFamily;
        const newWidth = safeMeasureText(_canvasContext!, _testString);
        // loaded successfully
        if (oldWidth !== newWidth) {
            _loadingFonts.splice(i, 1);
            fontLoadHandle.onComplete(null, fontFamily);
        }
        else {
            allFontsLoaded = false;
        }
    }

    if (allFontsLoaded) {
        clearInterval(_intervalId);
        _intervalId = -1;
    }
}

// refer to https://github.com/typekit/webfontloader/blob/master/src/core/nativefontwatchrunner.js
function nativeCheckFontLoaded (start: number, font: string, callback: CompleteCallback): void {
    const loader = new Promise((resolve, reject) => {
        const check = () => {
            const now = Date.now();

            if (now - start >= _timeout) {
                reject();
            }
            else {
                // @ts-ignore
                document.fonts.load('40px ' + font).then((fonts) => {
                    if (fonts.length >= 1) {
                        resolve();
                    }
                    else {
                        setTimeout(check, 100);
                    }
                }, () => {
                    reject();
                });
            }
        };

        check();
    });

    let timeoutId: number | null = null;
    const timer = new Promise((resolve, reject) => {
        timeoutId = setTimeout(reject, _timeout);
    });

    Promise.race([timer, loader]).then(() => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }

        callback(null, font);
    }, () => {
        warnID(4933, font);
        callback(null, font);
    });
}

export function loadFont (url: string, options: Options, onComplete: CompleteCallback) {
    const fontFamilyName = _getFontFamily(url);

    // Already loaded fonts
    if (_fontFaces[fontFamilyName]) {
        return onComplete(null, fontFamilyName);
    }

    if (!_canvasContext) {
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 100;
        labelCanvas.height = 100;
        _canvasContext = labelCanvas.getContext('2d');
    }

    // Default width reference to test whether new font is loaded correctly
    _canvasContext!.font = '40px ' + fontFamilyName;
    const refWidth = safeMeasureText(_canvasContext!, _testString);

    // Setup font face style
    const fontStyle = document.createElement('style');
    fontStyle.type = 'text/css';
    let fontStr = '';
    if (isNaN(Number(fontFamilyName))) {
        fontStr += '@font-face { font-family:' + fontFamilyName + '; src:';
    }
    else {
        fontStr += '@font-face { font-family:"' + fontFamilyName + '"; src:';
    }
    fontStr += 'url("' + url + '");';
    fontStyle.textContent = fontStr + '}';
    document.body.appendChild(fontStyle);

    // Preload font with div
    const preloadDiv = document.createElement('div');
    const divStyle = preloadDiv.style;
    divStyle.fontFamily = fontFamilyName;
    preloadDiv.innerHTML = '.';
    divStyle.position = 'absolute';
    divStyle.left = '-100px';
    divStyle.top = '-100px';
    document.body.appendChild(preloadDiv);

    if (useNativeCheck()) {
        nativeCheckFontLoaded(Date.now(), fontFamilyName, onComplete);
    }
    else {
        // Save loading font
        const fontLoadHandle = {
            fontFamilyName,
            refWidth,
            onComplete,
            startTime: Date.now(),
        };
        _loadingFonts.push(fontLoadHandle);
        if (_intervalId === -1) {
            _intervalId = setInterval(_checkFontLoaded, 100);
        }
    }
    _fontFaces[fontFamilyName] = fontStyle;
}

export function _getFontFamily (fontHandle: string): string {
    const ttfIndex = fontHandle.lastIndexOf('.ttf');
    if (ttfIndex === -1) { return fontHandle; }

    const slashPos = fontHandle.lastIndexOf('/');
    let fontFamilyName;
    if (slashPos === -1) {
        fontFamilyName = fontHandle.substring(0, ttfIndex) + '_LABEL';
    } else {
        fontFamilyName = fontHandle.substring(slashPos + 1, ttfIndex) + '_LABEL';
    }
    if (fontFamilyName.indexOf(' ') !== -1) {
        fontFamilyName = '"' + fontFamilyName + '"';
    }
    return fontFamilyName;
}
