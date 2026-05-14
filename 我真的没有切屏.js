// ==UserScript==
// @name         我真的没有切屏！
// @namespace    https://github.com/lanzeweie/no-tab-switch
// @version      2.10
// @description  我真的没有切屏！！！采用多重策略，从内核层面阻止浏览器将失焦或隐藏状态暴露给网站。尽最大可能伪造一直在窗口的假象。新增全屏拦截与伪造功能！
// @author       lanzeweie@foxmail.com
// @match        *://*/*
// @match        about:blank
// @match        about:srcdoc
// @grant        none
// @run-at       document-start
// @match        file:///*
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/555806/%E6%88%91%E7%9C%9F%E7%9A%84%E6%B2%A1%E6%9C%89%E5%88%87%E5%B1%8F%EF%BC%81.user.js
// @updateURL https://update.greasyfork.org/scripts/555806/%E6%88%91%E7%9C%9F%E7%9A%84%E6%B2%A1%E6%9C%89%E5%88%87%E5%B1%8F%EF%BC%81.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 第一层：即时伪装层（脚本执行第一时刻）
    // 解决竞态条件：确保在网站内联脚本执行前就完成关键属性伪装
    // ==========================================
    const _defineProperty = (obj, prop, value) => {
        try {
            Object.defineProperty(obj, prop, { get: () => value, configurable: true, enumerable: true });
        } catch (e) {}
    };

    // 立即冻结窗口尺寸（捕获初始值）
    const FAKE_WINDOW_SIZE = {
        width: window.innerWidth || 1920,
        height: window.innerHeight || 1080,
        outerWidth: window.outerWidth || 1920,
        outerHeight: window.outerHeight || 1080,
        screenWidth: window.screen ? window.screen.width : 1920,
        screenHeight: window.screen ? window.screen.height : 1080,
        availWidth: window.screen ? window.screen.availWidth : 1920,
        availHeight: window.screen ? window.screen.availHeight : 1040,
        devicePixelRatio: window.devicePixelRatio || 1
    };

    // 立即覆盖窗口尺寸属性
    _defineProperty(window, 'innerWidth', FAKE_WINDOW_SIZE.width);
    _defineProperty(window, 'innerHeight', FAKE_WINDOW_SIZE.height);
    _defineProperty(window, 'outerWidth', FAKE_WINDOW_SIZE.outerWidth);
    _defineProperty(window, 'outerHeight', FAKE_WINDOW_SIZE.outerHeight);

    // 立即覆盖屏幕尺寸属性
    if (window.screen) {
        _defineProperty(window.screen, 'width', FAKE_WINDOW_SIZE.screenWidth);
        _defineProperty(window.screen, 'height', FAKE_WINDOW_SIZE.screenHeight);
        _defineProperty(window.screen, 'availWidth', FAKE_WINDOW_SIZE.availWidth);
        _defineProperty(window.screen, 'availHeight', FAKE_WINDOW_SIZE.availHeight);
        _defineProperty(window.screen, 'colorDepth', 24);
        _defineProperty(window.screen, 'pixelDepth', 24);
    }

    // 立即覆盖窗口位置属性
    _defineProperty(window, 'screenLeft', 0);
    _defineProperty(window, 'screenTop', 0);
    _defineProperty(window, 'screenX', 0);
    _defineProperty(window, 'screenY', 0);
    _defineProperty(window, 'devicePixelRatio', FAKE_WINDOW_SIZE.devicePixelRatio);

    // 立即覆盖设备方向属性
    if (window.screen && window.screen.orientation) {
        try {
            Object.defineProperty(window.screen.orientation, 'type', { get: () => 'landscape-primary', configurable: true });
            Object.defineProperty(window.screen.orientation, 'angle', { get: () => 0, configurable: true });
        } catch (e) {}
    }
    _defineProperty(window, 'orientation', 0);

    // 立即覆盖 document.hidden 和 visibilityState
    try {
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true, enumerable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true, enumerable: true });
    } catch (e) {}

    // ==========================================
    // 第二层：核心拦截层
    // ==========================================
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalToString = Function.prototype.toString;
    const _Function_toString = Function.prototype.toString;
    const fakeFunctionRegistry = new WeakMap();
    const _Reflect_apply = Reflect.apply;

    let isEnabled = true;
    let uiUpdateFunction = () => {};
    const interceptLog = [];
    const MAX_LOG_ITEMS = 15;

    function addLog(type, message, color = '#dc3545') {
        const timestamp = new Date().toLocaleTimeString();
        interceptLog.unshift({ time: timestamp, type, message, color });
        if (interceptLog.length > MAX_LOG_ITEMS) interceptLog.pop();
        if (uiUpdateFunction) uiUpdateFunction();
    }

    let isBFCacheRecovery = false;

    // 创建看起来像原始函数的包装器
    const createStealthWrapper = function(original, wrapper) {
        wrapper.toString = function() { return originalToString.call(original); };
        Object.defineProperty(wrapper, 'name', { value: original.name, configurable: true });
        Object.defineProperty(wrapper, 'length', { value: original.length, configurable: true });
        return wrapper;
    };

    // 隐蔽的addEventListener替换 - 采用"回调函数代理"策略
    const wrappedAddEventListener = createStealthWrapper(originalAddEventListener, function(type, listener, options) {
        const sensitiveEvents = ["visibilitychange", "blur", "focus", "focusin", "focusout", "pagehide", "pageshow", "resize"];

        if (sensitiveEvents.includes(type) && listener) {
            let proxyListener;

            if (typeof listener === 'function') {
                proxyListener = function(event) {
                    if (event.type === 'pageshow' && event.persisted) return listener.apply(this, arguments);
                    if (isEnabled && event.isTrusted) return;
                    return listener.apply(this, arguments);
                };
            } else if (typeof listener === 'object' && listener.handleEvent) {
                proxyListener = {
                    handleEvent: function(event) {
                        if (event.type === 'pageshow' && event.persisted) return listener.handleEvent.call(listener, event);
                        if (isEnabled && event.isTrusted) return;
                        return listener.handleEvent.call(listener, event);
                    }
                };
            }

            if (proxyListener) {
                proxyListener.toString = function() { return listener.toString(); };
                return originalAddEventListener.call(this, type, proxyListener, options);
            }
        }

        return originalAddEventListener.call(this, type, listener, options);
    });
    EventTarget.prototype.addEventListener = wrappedAddEventListener;

    // 捕获阶段拦截器：同时在 window 和 document 上安装
    const _captureHandler = (event) => {
        if (event.type === 'pageshow' && event.persisted) {
            isBFCacheRecovery = true;
            return;
        }
        if (isEnabled && event.isTrusted) {
            event.stopImmediatePropagation();
            event.stopPropagation();
            event.preventDefault();
            if (stats.hasOwnProperty(event.type)) {
                stats[event.type]++;
                if (uiUpdateFunction) uiUpdateFunction();
            }
            return false;
        }
    };

    ["visibilitychange", "blur", "focus", "focusin", "focusout", "pagehide", "pageshow"].forEach((e) => {
        originalAddEventListener.call(window, e, _captureHandler, true);
        originalAddEventListener.call(document, e, _captureHandler, true);
    });

    // 封死 on- 属性赋值 (DOM 0级事件防御)
    const blockProperties = ['onresize', 'onvisibilitychange', 'onblur', 'onfocus', 'onpagehide', 'onpageshow', 'onmouseleave', 'onmouseout'];
    blockProperties.forEach(prop => {
        const interceptSetter = {
            get: function() { return null; },
            set: function(val) { addLog('system', `🚫 强力拦截 ${prop} 赋值尝试`, '#ffc107'); },
            configurable: true,
            enumerable: true
        };
        try { Object.defineProperty(window, prop, interceptSetter); } catch (e) {}
        try { Object.defineProperty(Document.prototype, prop, interceptSetter); } catch (e) {}
        try { Object.defineProperty(HTMLElement.prototype, prop, interceptSetter); } catch (e) {}
    });

    // 拦截 ResizeObserver
    try {
        const OriginalResizeObserver = window.ResizeObserver;
        window.ResizeObserver = class FakeResizeObserver {
            constructor(callback) { this.callback = callback; }
            observe(target) { addLog('system', '🛡️ 拦截 ResizeObserver 监控', '#007bff'); }
            unobserve(target) {}
            disconnect() {}
        };
        window.ResizeObserver.toString = function() { return OriginalResizeObserver.toString(); };
    } catch (e) {}

    // 持久化设置
    const STORAGE_KEY = 'screenProtectorUISettings';
    const loadSettings = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return { advancedGhostMode: false, defaultUIVisible: false };
    };
    const saveSettings = (settings) => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
    };
    const settings = loadSettings();

    // UI 状态变量
    let isUIVisible = false;
    let uiContainer = null;
    let uiMinimizedTag = null;
    let isUIBuilt = false;

    const stats = {
        visibilitychange: 0, blur: 0, focusout: 0, focusin: 0, pagehide: 0, pageshow: 0, proxy: 0,
        get total() { return this.visibilitychange + this.blur + this.focusout + this.focusin + this.pagehide + this.pageshow + this.proxy; }
    };

    const ACTUAL_WINDOW_SIZE = {
        width: window.innerWidth, height: window.innerHeight,
        outerWidth: window.outerWidth, outerHeight: window.outerHeight
    };

    // 监听窗口大小变化
    originalAddEventListener.call(window, 'resize', (e) => {
        ACTUAL_WINDOW_SIZE.width = window.innerWidth;
        ACTUAL_WINDOW_SIZE.height = window.innerHeight;
        ACTUAL_WINDOW_SIZE.outerWidth = window.outerWidth;
        ACTUAL_WINDOW_SIZE.outerHeight = window.outerHeight;
        if (isEnabled) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            addLog('system', '📐 拦截 resize 事件', '#007bff');
        }
    }, true);

    // ==========================================
    // 终极伪装系统：拦截底层 toString 和 call/apply
    // ==========================================
    function registerFake(fakeFn, nativeString) {
        fakeFunctionRegistry.set(fakeFn, nativeString);
        return fakeFn;
    }

    Function.prototype.toString = function() {
        if (this && fakeFunctionRegistry.has(this)) return fakeFunctionRegistry.get(this);
        return _Reflect_apply(_Function_toString, this, arguments);
    };
    registerFake(Function.prototype.toString, _Reflect_apply(_Function_toString, _Function_toString, []));

    const _call = Function.prototype.call;
    const fakeCall = function call(thisArg, ...args) {
        if (this && this.name === 'get hidden') return false;
        if (this && this.name === 'get visibilityState') return 'visible';
        if (this && this.name === 'hasFocus') return true;
        return _Reflect_apply(this, thisArg, args);
    };
    Object.defineProperty(fakeCall, 'name', { value: 'call', configurable: true });
    Object.defineProperty(fakeCall, 'length', { value: 1, configurable: true });
    Function.prototype.call = fakeCall;
    registerFake(Function.prototype.call, _Reflect_apply(_Function_toString, _call, []));

    const _apply = Function.prototype.apply;
    const fakeApply = function apply(thisArg, argsArray) {
        if (this && this.name === 'get hidden') return false;
        if (this && this.name === 'get visibilityState') return 'visible';
        if (this && this.name === 'hasFocus') return true;
        return _Reflect_apply(this, thisArg, argsArray || []);
    };
    Object.defineProperty(fakeApply, 'name', { value: 'apply', configurable: true });
    Object.defineProperty(fakeApply, 'length', { value: 2, configurable: true });
    Function.prototype.apply = fakeApply;
    registerFake(Function.prototype.apply, _Reflect_apply(_Function_toString, _apply, []));

    function createPerfectGetter(propName, returnValue) {
        const getter = function() { return returnValue; };
        Object.defineProperty(getter, 'name', { value: `get ${propName}`, configurable: true });
        registerFake(getter, `function get ${propName}() { [native code] }`);
        return getter;
    }

    const fakeHasFocus = function() { return true; };
    Object.defineProperty(fakeHasFocus, 'name', { value: 'hasFocus', configurable: true });
    registerFake(fakeHasFocus, `function hasFocus() { [native code] }`);

    // ==========================================
    // 第三层：全屏拦截与伪造系统
    // 拦截强制全屏请求并伪造全屏状态，防止通过全屏检测切屏
    // ==========================================
    let fakeFullscreenElement = null;

    // 需要覆盖的方法列表（包含旧版浏览器的兼容前缀）
    const requestMethods = [
        'requestFullscreen',
        'webkitRequestFullscreen',
        'mozRequestFullScreen',
        'msRequestFullscreen'
    ];

    // 拦截请求全屏方法
    requestMethods.forEach(method => {
        if (Element.prototype[method]) {
            const originalMethod = Element.prototype[method];

            const fakeRequest = function(options) {
                // 记录当前要求全屏的元素
                fakeFullscreenElement = this;

                // 延迟触发事件，模拟异步完成
                setTimeout(() => {
                    // 触发标准事件和兼容事件
                    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evtName => {
                        document.dispatchEvent(new Event(evtName, { bubbles: true }));
                    });
                    addLog('system', '🖥️ 拦截全屏请求并伪造成功', '#007bff');
                }, 10);

                // requestFullscreen 返回 Promise
                return Promise.resolve();
            };

            // 伪装 toString
            Object.defineProperty(fakeRequest, 'name', { value: method, configurable: true });
            Object.defineProperty(fakeRequest, 'length', { value: originalMethod.length, configurable: true });
            registerFake(fakeRequest, originalMethod.toString());

            Element.prototype[method] = fakeRequest;
        }
    });

    // 拦截退出全屏方法
    const exitMethods = [
        'exitFullscreen',
        'webkitExitFullscreen',
        'mozCancelFullScreen',
        'msExitFullscreen'
    ];

    exitMethods.forEach(method => {
        if (Document.prototype[method]) {
            const originalExit = Document.prototype[method];

            const fakeExit = function() {
                fakeFullscreenElement = null;
                setTimeout(() => {
                    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evtName => {
                        document.dispatchEvent(new Event(evtName, { bubbles: true }));
                    });
                    addLog('system', '🖥️ 拦截退出全屏请求', '#007bff');
                }, 10);
                return Promise.resolve();
            };

            // 伪装 toString
            Object.defineProperty(fakeExit, 'name', { value: method, configurable: true });
            Object.defineProperty(fakeExit, 'length', { value: originalExit.length, configurable: true });
            registerFake(fakeExit, originalExit.toString());

            Document.prototype[method] = fakeExit;
        }
    });

    // 伪造 Document 上的全屏状态属性
    const fullscreenProperties = [
        'fullscreenElement',
        'webkitFullscreenElement',
        'mozFullScreenElement',
        'msFullscreenElement'
    ];

    fullscreenProperties.forEach(prop => {
        try {
            const getter = function() { return fakeFullscreenElement; };
            Object.defineProperty(getter, 'name', { value: `get ${prop}`, configurable: true });
            registerFake(getter, `function get ${prop}() { [native code] }`);
            Object.defineProperty(Document.prototype, prop, {
                get: getter,
                set: undefined,
                enumerable: true,
                configurable: true
            });
        } catch(e) {}
    });

    // 伪造布尔值状态属性
    const fullscreenBoolProps = [
        'fullscreen',
        'webkitIsFullScreen',
        'mozFullScreen'
    ];

    fullscreenBoolProps.forEach(prop => {
        try {
            const getter = function() { return fakeFullscreenElement !== null; };
            Object.defineProperty(getter, 'name', { value: `get ${prop}`, configurable: true });
            registerFake(getter, `function get ${prop}() { [native code] }`);
            Object.defineProperty(Document.prototype, prop, {
                get: getter,
                set: undefined,
                enumerable: true,
                configurable: true
            });
        } catch(e) {}
    });

    // 拦截全屏事件监听器
    const fullscreenEvents = [
        'fullscreenchange',
        'webkitfullscreenchange',
        'mozfullscreenchange',
        'MSFullscreenChange',
        'fullscreenerror',
        'webkitfullscreenerror',
        'mozfullscreenerror',
        'MSFullscreenError'
    ];

    fullscreenEvents.forEach(eventType => {
        originalAddEventListener.call(document, eventType, (event) => {
            if (isEnabled && event.isTrusted) {
                // 允许我们自己触发的事件通过
                return;
            }
        }, true);
    });

    // 尺寸嗅探防护：当检测到全屏请求时，动态调整尺寸
    const updateFullscreenSizes = () => {
        if (fakeFullscreenElement) {
            // 全屏状态下，innerWidth/innerHeight 应该等于 screen.width/screen.height
            const screenW = window.screen ? window.screen.width : 1920;
            const screenH = window.screen ? window.screen.height : 1080;
            _defineProperty(window, 'innerWidth', screenW);
            _defineProperty(window, 'innerHeight', screenH);
            _defineProperty(window, 'outerWidth', screenW);
            _defineProperty(window, 'outerHeight', screenH);
        } else {
            // 非全屏状态，恢复原始尺寸
            _defineProperty(window, 'innerWidth', ACTUAL_WINDOW_SIZE.width);
            _defineProperty(window, 'innerHeight', ACTUAL_WINDOW_SIZE.height);
            _defineProperty(window, 'outerWidth', ACTUAL_WINDOW_SIZE.outerWidth);
            _defineProperty(window, 'outerHeight', ACTUAL_WINDOW_SIZE.outerHeight);
        }
    };

    // 监听我们自己的全屏事件来更新尺寸
    document.addEventListener('fullscreenchange', updateFullscreenSizes);
    document.addEventListener('webkitfullscreenchange', updateFullscreenSizes);
    document.addEventListener('mozfullscreenchange', updateFullscreenSizes);
    document.addEventListener('MSFullscreenChange', updateFullscreenSizes);

    // CSS :fullscreen 伪类检测防护
    // 拦截 getComputedStyle 以在伪全屏状态下返回正确的样式
    try {
        const originalGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = function(element, pseudoElt) {
            const style = originalGetComputedStyle.call(window, element, pseudoElt);

            // 如果当前处于伪全屏状态，且查询的是全屏元素或其子元素
            if (fakeFullscreenElement && element === fakeFullscreenElement) {
                // 创建一个代理来拦截样式读取
                return new Proxy(style, {
                    get(target, prop) {
                        // 如果查询 :fullscreen 伪类的样式
                        if (pseudoElt === ':fullscreen' || pseudoElt === ':-webkit-full-screen' ||
                            pseudoElt === ':-moz-full-screen' || pseudoElt === ':-ms-fullscreen') {
                            // 返回一个表示"正在全屏"的样式对象
                            // 通常全屏时元素会占满整个屏幕
                            const value = target[prop];
                            // 某些样式在全屏时会有特定值
                            if (prop === 'position') return 'fixed';
                            if (prop === 'top' || prop === 'left') return '0px';
                            if (prop === 'width') return (window.screen ? window.screen.width : 1920) + 'px';
                            if (prop === 'height') return (window.screen ? window.screen.height : 1080) + 'px';
                            if (prop === 'zIndex') return '2147483647';
                            return value;
                        }
                        return target[prop];
                    }
                });
            }

            return style;
        };

        // 伪装 toString
        registerFake(window.getComputedStyle, originalGetComputedStyle.toString());
        Object.defineProperty(window.getComputedStyle, 'name', { value: 'getComputedStyle', configurable: true });
        Object.defineProperty(window.getComputedStyle, 'length', { value: originalGetComputedStyle.length, configurable: true });

        addLog('system', '✓ CSS :fullscreen 伪类防护已启动', '#28a745');
    } catch (e) {
        addLog('system', '⚠️ CSS 伪类防护启动失败: ' + e.message, '#ffc107');
    }

    addLog('system', '✓ 全屏拦截系统已启动', '#28a745');

    // ==========================================
    // 覆盖原型链和后续创建的任何窗口
    // ==========================================
    function applyDocumentPatch(targetWindow) {
        if (!targetWindow || targetWindow.__has_been_patched__) return;
        targetWindow.__has_been_patched__ = true;

        try {
            const ifrFunctionProto = targetWindow.Function.prototype;
            const bindToIframeContext = (fn) => {
                try { Object.setPrototypeOf(fn, ifrFunctionProto); } catch(e) {}
                return fn;
            };

            // 修复 iframe 内部的 toString
            const _ifrFunctionToString = ifrFunctionProto.toString;
            const fakeIfrToString = function() {
                if (this && fakeFunctionRegistry.has(this)) return fakeFunctionRegistry.get(this);
                return _Reflect_apply(_ifrFunctionToString, this, arguments);
            };
            ifrFunctionProto.toString = bindToIframeContext(fakeIfrToString);
            registerFake(fakeIfrToString, _Reflect_apply(_ifrFunctionToString, _ifrFunctionToString, []));

            // 修复 iframe 内部的 call
            const _ifrCall = ifrFunctionProto.call;
            const fakeIfrCall = function call(thisArg, ...args) {
                if (this && this.name === 'get hidden') return false;
                if (this && this.name === 'get visibilityState') return 'visible';
                if (this && this.name === 'hasFocus') return true;
                return _Reflect_apply(this, thisArg, args);
            };
            Object.defineProperty(fakeIfrCall, 'name', { value: 'call', configurable: true });
            ifrFunctionProto.call = bindToIframeContext(fakeIfrCall);
            registerFake(fakeIfrCall, _Reflect_apply(_ifrFunctionToString, _ifrCall, []));

            // 修复 iframe 内部的 apply
            const _ifrApply = ifrFunctionProto.apply;
            const fakeIfrApply = function apply(thisArg, argsArray) {
                if (this && this.name === 'get hidden') return false;
                if (this && this.name === 'get visibilityState') return 'visible';
                if (this && this.name === 'hasFocus') return true;
                return _Reflect_apply(this, thisArg, argsArray || []);
            };
            Object.defineProperty(fakeIfrApply, 'name', { value: 'apply', configurable: true });
            ifrFunctionProto.apply = bindToIframeContext(fakeIfrApply);
            registerFake(fakeIfrApply, _Reflect_apply(_ifrFunctionToString, _ifrApply, []));

            // 原型链级别 Getter 伪造
            const TargetDocProto = targetWindow.Document ? targetWindow.Document.prototype : null;
            if (TargetDocProto) {
                const enforceNativeContext = function(ctx) {
                    if (!ctx || ctx.nodeType !== 9) throw new targetWindow.TypeError("Illegal invocation");
                };

                const fakeHasFocus = bindToIframeContext(function() { enforceNativeContext(this); return true; });
                Object.defineProperty(fakeHasFocus, 'name', { value: 'hasFocus', configurable: true });
                registerFake(fakeHasFocus, `function hasFocus() { [native code] }`);
                TargetDocProto.hasFocus = fakeHasFocus;

                const hiddenGetter = bindToIframeContext(function() { enforceNativeContext(this); return false; });
                Object.defineProperty(hiddenGetter, 'name', { value: 'get hidden', configurable: true });
                registerFake(hiddenGetter, `function get hidden() { [native code] }`);
                Object.defineProperty(TargetDocProto, 'hidden', { get: hiddenGetter, set: undefined, enumerable: true, configurable: true });

                const visibilityGetter = bindToIframeContext(function() { enforceNativeContext(this); return 'visible'; });
                Object.defineProperty(visibilityGetter, 'name', { value: 'get visibilityState', configurable: true });
                registerFake(visibilityGetter, `function get visibilityState() { [native code] }`);
                Object.defineProperty(TargetDocProto, 'visibilityState', { get: visibilityGetter, set: undefined, enumerable: true, configurable: true });
            }

            // 封杀 iframe 内部的 onblur
            const blockProps = ['onblur', 'onfocus', 'onvisibilitychange', 'onpagehide', 'onpageshow', 'onresize'];
            blockProps.forEach(prop => {
                const interceptSetter = { get: function() { return null; }, set: function() {}, configurable: true };
                try { Object.defineProperty(targetWindow, prop, interceptSetter); } catch (e) {}
                if (TargetDocProto) try { Object.defineProperty(TargetDocProto, prop, interceptSetter); } catch (e) {}
            });

            // 事件拦截器
            const eventsToBlock = ["visibilitychange", "blur", "focus", "focusin", "focusout", "pagehide", "pageshow", "resize"];
            eventsToBlock.forEach((e) => {
                originalAddEventListener.call(targetWindow, e, (event) => {
                    if (isEnabled && event.isTrusted) {
                        event.stopImmediatePropagation();
                        event.stopPropagation();
                        event.preventDefault();
                        return false;
                    }
                }, true);
                if (targetWindow.document) {
                    originalAddEventListener.call(targetWindow.document, e, (event) => {
                        if (isEnabled && event.isTrusted) {
                            event.stopImmediatePropagation();
                            event.stopPropagation();
                            event.preventDefault();
                            return false;
                        }
                    }, true);
                }
            });

            // 同步窗口尺寸属性
            const defineProperty = (obj, prop, value) => {
                try { Object.defineProperty(obj, prop, { get: () => value, configurable: true }); } catch (e) {}
            };

            defineProperty(targetWindow, 'innerWidth', FAKE_WINDOW_SIZE.width);
            defineProperty(targetWindow, 'innerHeight', FAKE_WINDOW_SIZE.height);
            defineProperty(targetWindow, 'outerWidth', FAKE_WINDOW_SIZE.outerWidth);
            defineProperty(targetWindow, 'outerHeight', FAKE_WINDOW_SIZE.outerHeight);

            if (targetWindow.screen) {
                defineProperty(targetWindow.screen, 'width', FAKE_WINDOW_SIZE.screenWidth);
                defineProperty(targetWindow.screen, 'height', FAKE_WINDOW_SIZE.screenHeight);
                defineProperty(targetWindow.screen, 'availWidth', FAKE_WINDOW_SIZE.availWidth);
                defineProperty(targetWindow.screen, 'availHeight', FAKE_WINDOW_SIZE.availHeight);
                defineProperty(targetWindow.screen, 'colorDepth', 24);
                defineProperty(targetWindow.screen, 'pixelDepth', 24);
            }

            defineProperty(targetWindow, 'screenLeft', 0);
            defineProperty(targetWindow, 'screenTop', 0);
            defineProperty(targetWindow, 'screenX', 0);
            defineProperty(targetWindow, 'screenY', 0);
            defineProperty(targetWindow, 'devicePixelRatio', FAKE_WINDOW_SIZE.devicePixelRatio);

            if (targetWindow.screen && targetWindow.screen.orientation) {
                try {
                    Object.defineProperty(targetWindow.screen.orientation, 'type', { get: () => 'landscape-primary', configurable: true });
                    Object.defineProperty(targetWindow.screen.orientation, 'angle', { get: () => 0, configurable: true });
                } catch (e) {}
            }
            defineProperty(targetWindow, 'orientation', 0);

        } catch (e) {}
    }

    try {
        applyDocumentPatch(window);

        // 拦截 createElement
        const originalCreateElement = Document.prototype.createElement;
        const iframeProto = HTMLIFrameElement.prototype;
        const origCwGetter = Object.getOwnPropertyDescriptor(iframeProto, 'contentWindow');

        Document.prototype.createElement = function(tagName, options) {
            const el = originalCreateElement.call(this, tagName, options);
            if (typeof tagName === 'string' && tagName.toLowerCase() === 'iframe') {
                if (origCwGetter && origCwGetter.get) {
                    Object.defineProperty(el, 'contentWindow', {
                        get: function() {
                            const cw = origCwGetter.get.call(this);
                            if (cw && !cw.__has_been_patched__) applyDocumentPatch(cw);
                            return cw;
                        },
                        configurable: true, enumerable: true
                    });
                }
            }
            return el;
        };
        registerFake(Document.prototype.createElement, originalCreateElement.toString());

        // 拦截 contentWindow
        try {
            const originalContentWindowDesc = Object.getOwnPropertyDescriptor(iframeProto, 'contentWindow');
            if (originalContentWindowDesc && originalContentWindowDesc.get) {
                const originalContentWindowGetter = originalContentWindowDesc.get;
                Object.defineProperty(iframeProto, 'contentWindow', {
                    get: function() {
                        const cw = originalContentWindowGetter.call(this);
                        if (cw && !cw.__has_been_patched__) applyDocumentPatch(cw);
                        return cw;
                    },
                    set: function(val) { originalContentWindowDesc.set.call(this, val); },
                    enumerable: true, configurable: true
                });
            }
        } catch (e) {}

        // 拦截 contentDocument
        try {
            const originalContentDocumentDesc = Object.getOwnPropertyDescriptor(iframeProto, 'contentDocument');
            if (originalContentDocumentDesc && originalContentDocumentDesc.get) {
                const originalContentDocumentGetter = originalContentDocumentDesc.get;
                Object.defineProperty(iframeProto, 'contentDocument', {
                    get: function() {
                        const cd = originalContentDocumentGetter.call(this);
                        if (cd && cd.defaultView && !cd.defaultView.__has_been_patched__) applyDocumentPatch(cd.defaultView);
                        return cd;
                    },
                    enumerable: true, configurable: true
                });
            }
        } catch (e) {}

        // MutationObserver 监控新增节点
        try {
            new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    [...mutation.addedNodes].forEach(node => {
                        if (!node) return;
                        if (node instanceof HTMLIFrameElement) {
                            try { if (node.contentWindow && !node.contentWindow.__has_been_patched__) applyDocumentPatch(node.contentWindow); } catch (e) {}
                        }
                        try {
                            if (node.querySelectorAll) {
                                node.querySelectorAll('iframe').forEach(ifr => {
                                    try { if (ifr.contentWindow && !ifr.contentWindow.__has_been_patched__) applyDocumentPatch(ifr.contentWindow); } catch (e2) {}
                                });
                            }
                        } catch (e) {}
                    });
                });
            }).observe(document, { childList: true, subtree: true });
            addLog('system', '🛡️ MutationObserver 已启动', '#007bff');
        } catch (e) {}

        // 扫描已存在的 iframe
        const scanExistingIframes = () => {
            try {
                document.querySelectorAll('iframe').forEach(ifr => {
                    try { if (ifr.contentWindow && !ifr.contentWindow.__has_been_patched__) applyDocumentPatch(ifr.contentWindow); } catch (e) {}
                });
                if (window.frames) {
                    for (let i = 0; i < frames.length; i++) {
                        try { if (frames[i] && !frames[i].__has_been_patched__) applyDocumentPatch(frames[i]); } catch (e) {}
                    }
                }
            } catch (e) {}
        };

        scanExistingIframes();
        if (document.readyState === 'loading') {
            originalAddEventListener.call(document, 'DOMContentLoaded', scanExistingIframes, true);
        } else {
            scanExistingIframes();
        }

        const patchNestedIframes = (nodes) => {
            nodes.forEach(node => {
                if (!node) return;
                if (node instanceof HTMLIFrameElement || node.nodeName === 'IFRAME') {
                    try { applyDocumentPatch(node.contentWindow); } catch(e) {}
                }
                if (node.querySelectorAll) {
                    try { node.querySelectorAll('iframe').forEach(ifr => applyDocumentPatch(ifr.contentWindow)); } catch(e) {}
                }
            });
        };

        // 拦截 DOM 插入 API
        const domMethods = ['appendChild', 'insertBefore', 'replaceChild', 'append', 'prepend'];
        domMethods.forEach(method => {
            const originalNodeMethod = Node.prototype[method];
            if (originalNodeMethod) {
                const fakeMethod = function(...nodes) {
                    const result = originalNodeMethod.apply(this, arguments);
                    patchNestedIframes(nodes);
                    return result;
                };
                registerFake(fakeMethod, _Function_toString.call(originalNodeMethod));
                Node.prototype[method] = fakeMethod;
            }

            const originalElementMethod = Element.prototype[method];
            if (originalElementMethod && originalElementMethod !== originalNodeMethod) {
                const fakeElementMethod = function(...nodes) {
                    const result = originalElementMethod.apply(this, arguments);
                    patchNestedIframes(nodes);
                    return result;
                };
                registerFake(fakeElementMethod, _Function_toString.call(originalElementMethod));
                Element.prototype[method] = fakeElementMethod;
            }
        });

        // 封堵同步注入漏洞
        ['insertAdjacentHTML', 'insertAdjacentElement'].forEach(method => {
            const originalMethod = Element.prototype[method];
            if (originalMethod) {
                const fakeMethod = function(position, textOrElement) {
                    const result = originalMethod.apply(this, arguments);
                    patchNestedIframes([this.parentNode || this]);
                    return result;
                };
                registerFake(fakeMethod, _Function_toString.call(originalMethod));
                Element.prototype[method] = fakeMethod;
            }
        });

        ['write', 'writeln'].forEach(method => {
            const originalMethod = Document.prototype[method];
            if (originalMethod) {
                const fakeMethod = function(...args) {
                    const result = originalMethod.apply(this, arguments);
                    patchNestedIframes([document.documentElement]);
                    return result;
                };
                registerFake(fakeMethod, _Function_toString.call(originalMethod));
                Document.prototype[method] = fakeMethod;
            }
        });

        // 拦截 innerHTML
        const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        if (originalInnerHTML && originalInnerHTML.set) {
            const fakeSet = function(val) {
                originalInnerHTML.set.call(this, val);
                if (typeof val === 'string' && val.toLowerCase().includes('iframe')) patchNestedIframes([this]);
            };
            registerFake(fakeSet, _Function_toString.call(originalInnerHTML.set));
            Object.defineProperty(Element.prototype, 'innerHTML', { set: fakeSet, get: originalInnerHTML.get, enumerable: true, configurable: true });
        }

        addLog('system', '✓ 核弹级防御已启动', '#28a745');

        // 覆盖 matchMedia
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = function(query) {
            if (query.includes('device-width') || query.includes('device-height')) {
                return { matches: false, media: query, onchange: null, addListener: function() {}, removeListener: function() {}, addEventListener: function() {}, removeEventListener: function() {}, dispatchEvent: function() { return true; } };
            }

            const result = originalMatchMedia.call(window, query);
            const viewportPatterns = [/\(\s*width\s*:\s*(\d+)px\s*\)/, /\(\s*min-width\s*:\s*(\d+)px\s*\)/, /\(\s*max-width\s*:\s*(\d+)px\s*\)/, /\(\s*height\s*:\s*(\d+)px\s*\)/, /\(\s*min-height\s*:\s*(\d+)px\s*\)/, /\(\s*max-height\s*:\s*(\d+)px\s*\)/];

            let involvesViewport = false;
            for (const pattern of viewportPatterns) {
                if (pattern.test(query)) { involvesViewport = true; break; }
            }

            if (involvesViewport) {
                const fakeResult = {
                    matches: false, media: query, onchange: null,
                    addListener: function(callback) { if (typeof callback === 'function') callback({ matches: fakeResult.matches, media: query }); },
                    removeListener: function() {},
                    addEventListener: function(type, callback) { if (type === 'change' && typeof callback === 'function') callback({ matches: fakeResult.matches, media: query }); },
                    removeEventListener: function() {},
                    dispatchEvent: function() { return true; }
                };

                try {
                    const widthMatch = query.match(/\(\s*(min-|max-)?width\s*:\s*(\d+)px\s*\)/);
                    const heightMatch = query.match(/\(\s*(min-|max-)?height\s*:\s*(\d+)px\s*\)/);
                    let matches = true;

                    if (widthMatch) {
                        const operator = widthMatch[1] || '';
                        const value = parseInt(widthMatch[2]);
                        if (operator === 'min-') matches = matches && (FAKE_WINDOW_SIZE.width >= value);
                        else if (operator === 'max-') matches = matches && (FAKE_WINDOW_SIZE.width <= value);
                        else matches = matches && (FAKE_WINDOW_SIZE.width === value);
                    }

                    if (heightMatch) {
                        const operator = heightMatch[1] || '';
                        const value = parseInt(heightMatch[2]);
                        if (operator === 'min-') matches = matches && (FAKE_WINDOW_SIZE.height >= value);
                        else if (operator === 'max-') matches = matches && (FAKE_WINDOW_SIZE.height <= value);
                        else matches = matches && (FAKE_WINDOW_SIZE.height === value);
                    }

                    fakeResult.matches = matches;
                } catch (e) {}

                return fakeResult;
            }

            return result;
        };

        addLog('system', '✓ 虚假窗口尺寸已设置 (' + FAKE_WINDOW_SIZE.width + 'x' + FAKE_WINDOW_SIZE.height + ')', '#28a745');
    } catch (e) {
        addLog('system', '❌ 属性覆盖失败: ' + e.message, '#dc3545');
    }


    (function() {
        try {
            const originalObserve = MutationObserver.prototype.observe;
            MutationObserver.prototype.observe = function(target, options) {
                if (target === document || target === document.documentElement) {
                    addLog('system', '🛡️ 拦截 DOM 观察器', '#007bff');
                    return { disconnect: () => {}, observe: () => {}, unobserve: () => {} };
                }
                return originalObserve.apply(this, arguments);
            };
            const originalMutationObserver = window.MutationObserver;
            window.MutationObserver = function(callback) {
                const observer = new originalMutationObserver((mutations) => {
                    const filteredMutations = mutations.filter(mutation => mutation.target !== document && mutation.target !== document.documentElement);
                    if (filteredMutations.length > 0) callback(filteredMutations);
                });
                return observer;
            };
            window.MutationObserver.prototype = originalMutationObserver.prototype;
        } catch (e) {}
    })();

    addLog('system', '防护系统已启动', '#4CAF50');

    // ==========================================
    // UI 构建工厂
    // ==========================================
    const buildUIDOM = () => {
        if (isUIBuilt || window.top !== window.self) return;

        // 默认UI是最小化状态
        isUIVisible = false;

        const hideUI = () => {
            if (uiContainer && uiContainer.parentNode) { uiContainer.parentNode.removeChild(uiContainer); uiContainer = null; }
            if (uiMinimizedTag && uiMinimizedTag.parentNode) { uiMinimizedTag.parentNode.removeChild(uiMinimizedTag); uiMinimizedTag = null; }
            isUIBuilt = false;
            addLog('system', 'UI 已从页面彻底销毁', '#999');
        };

        uiMinimizedTag = document.createElement('div');
        const tagLabel = document.createElement('span');
        const tagToggle = document.createElement('button');

        tagLabel.textContent = '防护';
        tagToggle.textContent = '✕';
        tagToggle.style.cssText = 'background: none; border: none; color: inherit; cursor: pointer; padding: 0; font-size: 12px; margin-left: 8px;';

        uiMinimizedTag.appendChild(tagLabel);
        uiMinimizedTag.appendChild(tagToggle);

        Object.assign(uiMinimizedTag.style, {
            position: 'fixed', bottom: '20px', right: '20px', color: 'white',
            padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontFamily: 'sans-serif',
            fontWeight: 'bold', cursor: 'pointer', zIndex: '999999', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
            display: 'flex', alignItems: 'center'
        });

        const updateTagColor = () => {
            uiMinimizedTag.style.backgroundColor = isEnabled ? '#4CAF50' : '#999';
            tagLabel.textContent = isEnabled ? `切屏拦截${stats.total}次` : '拦截关闭';
        };

        tagLabel.addEventListener('click', (e) => {
            e.stopPropagation();
            isUIVisible = true;
            uiContainer.style.display = 'block';
            uiMinimizedTag.style.display = 'none';
        });

        tagToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            hideUI();
        });

        uiContainer = document.createElement('div');
        const header = document.createElement('div');
        const title = document.createElement('div');
        const controls = document.createElement('div');
        const toggleBtn = document.createElement('button');
        const minimizeBtn = document.createElement('button');
        const closeBtn = document.createElement('button');
        const body = document.createElement('div');
        const statusPanel = document.createElement('div');
        const statsPanel = document.createElement('div');
        const logPanel = document.createElement('div');
        const settingsPanel = document.createElement('div');

        header.appendChild(title);
        controls.appendChild(toggleBtn); controls.appendChild(minimizeBtn); controls.appendChild(closeBtn);
        header.appendChild(controls);
        body.appendChild(statusPanel); body.appendChild(statsPanel); body.appendChild(logPanel);
        body.appendChild(settingsPanel);
        uiContainer.appendChild(header); uiContainer.appendChild(body);

        const appendUI = () => {
            if (document.body) {
                document.body.appendChild(uiContainer);
                document.body.appendChild(uiMinimizedTag);
                isUIBuilt = true;
                updateTagColor();
            }
        };

        if (document.body) appendUI();
        else originalAddEventListener.call(document, 'DOMContentLoaded', appendUI);

        title.textContent = '我真的没有切屏！！';
        minimizeBtn.textContent = '—'; closeBtn.textContent = '✕';

        const updateUI = () => {
            if (!isUIBuilt) return;
            updateTagColor();
            toggleBtn.textContent = isEnabled ? '✓ 开启' : '✗ 关闭';
            toggleBtn.style.backgroundColor = isEnabled ? '#4CAF50' : '#999';
            toggleBtn.style.color = '#fff';

            statusPanel.innerHTML = `<div>状态: 正在底层拦截...</div>`;
            statsPanel.innerHTML = `<div>共拦截事件: ${stats.total} 次</div>`;

            logPanel.innerHTML = interceptLog.length === 0 ?
                '<div style="color: #999;">暂无日志</div>' :
                interceptLog.slice(0, 5).map(log => `<div style="font-size: 11px; color: ${log.color}; margin: 2px 0;">${log.time} - ${log.message}</div>`).join('');

            settingsPanel.innerHTML = `
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #d93025; font-weight: bold;">
                    <input type="checkbox" id="ghostModeCheckbox" ${settings.advancedGhostMode ? 'checked' : ''}>
                    <span>👻 幽灵模式 (极致防检测)</span>
                </label>
                <div style="font-size: 10px; color: #666; margin-top: 4px;">开启后刷新页面，完全不注入任何UI代码。按 Ctrl+Alt+H 随时唤醒。</div>
                <div style="color: #666; font-size: 10px; line-height: 1.4; margin-top: 6px;">
                    <strong>快捷键:</strong> Ctrl + Alt + H: 显示/隐藏 UI
                </div>
            `;

            const checkbox = document.getElementById('ghostModeCheckbox');
            if (checkbox && !checkbox._listener) {
                checkbox._listener = true;
                checkbox.addEventListener('change', (e) => {
                    settings.advancedGhostMode = e.target.checked;
                    saveSettings(settings);
                    addLog('system', e.target.checked ? '已开启幽灵模式，请刷新页面生效！' : '已关闭幽灵模式，刷新后默认显示UI', e.target.checked ? '#d93025' : '#4CAF50');
                });
            }
        };

        const buttonBase = { background: 'none', border: '1px solid #ddd', borderRadius: '3px', cursor: 'pointer', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' };

        Object.assign(uiContainer.style, {
            position: 'fixed', bottom: '20px', right: '20px', width: '280px', backgroundColor: '#fff',
            color: '#333', border: '1px solid #ddd', borderRadius: '4px', zIndex: '999999',
            fontFamily: 'sans-serif', fontSize: '12px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            display: 'none'
        });

        Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: '#f5f5f5', borderBottom: '1px solid #eee' });
        Object.assign(controls.style, { display: 'flex', gap: '4px' });
        Object.assign(minimizeBtn.style, buttonBase); Object.assign(closeBtn.style, buttonBase);

        // toggleBtn 单独设置，保留 backgroundColor
        Object.assign(toggleBtn.style, { ...buttonBase, backgroundColor: isEnabled ? '#4CAF50' : '#999', color: '#fff' });

        uiUpdateFunction = updateUI;
        updateUI();

        Object.assign(body.style, { padding: '8px 10px', maxHeight: '60vh', overflowY: 'auto' });
        const panelStyle = { marginBottom: '8px', padding: '6px', backgroundColor: '#fafafa', borderRadius: '3px', border: '1px solid #eee' };
        Object.assign(statusPanel.style, panelStyle); Object.assign(statsPanel.style, panelStyle);
        Object.assign(logPanel.style, { ...panelStyle, maxHeight: '80px', overflowY: 'auto' });
        Object.assign(settingsPanel.style, panelStyle);

        toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); isEnabled = !isEnabled; addLog('system', isEnabled ? '防护已开启' : '防护已关闭', isEnabled ? '#4CAF50' : '#999'); updateUI(); });
        minimizeBtn.addEventListener('click', (e) => { e.stopPropagation(); uiContainer.style.display = 'none'; uiMinimizedTag.style.display = 'flex'; });
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); hideUI(); });
    };

    // ==========================================
    // 启动控制器
    // ==========================================
    const initProtector = () => {
        if (window.top !== window.self) return;

        if (settings.advancedGhostMode) {
            console.log('%c[防护系统] 👻 幽灵模式已激活：DOM 零污染运行中。按 Ctrl+Alt+H 随时唤醒控制面板。', 'color: #d93025; font-weight: bold; font-size: 12px;');
        } else {
            buildUIDOM();
        }
    };

    // 快捷键：Ctrl + Alt + H
    originalAddEventListener.call(window, 'keydown', (e) => {
        if (e.key.toLowerCase() === 'h' && e.ctrlKey && e.altKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();

            if (!isUIBuilt) {
                buildUIDOM();
                addLog('system', '⚠️ 警告：UI 已强行注入 DOM', '#ff9800');
            } else {
                isUIVisible = !isUIVisible;
                if (uiContainer) uiContainer.style.display = isUIVisible ? 'block' : 'none';
                if (uiMinimizedTag) uiMinimizedTag.style.display = isUIVisible ? 'none' : 'flex';
            }
        }
    }, true);

    // BFCache 防护
    originalAddEventListener.call(window, 'pageshow', (e) => {
        if (e.persisted) {
            try { applyDocumentPatch(window); } catch(err) {}
            addLog('system', '🔄 BFCache 恢复检测 - 已重新应用防御补丁', '#ff9800');
        }
    }, true);

    if (document.readyState === 'loading') {
        originalAddEventListener.call(window, 'DOMContentLoaded', initProtector);
    } else {
        initProtector();
    }

})();
