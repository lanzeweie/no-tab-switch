// ==UserScript==
// @name         我真的没有切屏！
// @namespace    https://github.com/lanzeweie
// @version      0.91
// @description  我真的没有切屏！！！采用多重策略，从内核层面阻止浏览器将失焦或隐藏状态暴露给网站。尽最大可能伪造一直在窗口的假象
// @author       lanzeweie@foxmail.com
// @match        *://*/*
// @grant        none
// @run-at       document-start
// @match        file:///*
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/555806/%E6%88%91%E7%9C%9F%E7%9A%84%E6%B2%A1%E6%9C%89%E5%88%87%E5%B1%8F%EF%BC%81.user.js
// @updateURL https://update.greasyfork.org/scripts/555806/%E6%88%91%E7%9C%9F%E7%9A%84%E6%B2%A1%E6%9C%89%E5%88%87%E5%B1%8F%EF%BC%81.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const blockEvents = ['visibilitychange', 'blur', 'focus', 'focusin', 'focusout', 'pagehide', 'pageshow'];
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalToString = Function.prototype.toString;

    // 创建一个看起来像原始函数的包装器
    const createStealthWrapper = function(original, wrapper) {
        // 使包装器的toString返回原始函数的字符串
        wrapper.toString = function() {
            return originalToString.call(original);
        };
        // 保留原始函数的name属性
        Object.defineProperty(wrapper, 'name', {
            value: original.name,
            configurable: true
        });
        // 保留原始函数的length属性（参数个数）
        Object.defineProperty(wrapper, 'length', {
            value: original.length,
            configurable: true
        });
        return wrapper;
    };

    // 隐蔽的addEventListener替换
    const wrappedAddEventListener = createStealthWrapper(originalAddEventListener, function(type, listener, options) {
        if (blockEvents.includes(type)) {
            addLog('proxy', `🚫 已代理并阻止 ${type} 监听器附加`, '#6f42c1');
            return;
        }
        return originalAddEventListener.call(this, type, listener, options);
    });

    EventTarget.prototype.addEventListener = wrappedAddEventListener;

    // 隐藏替换痕迹 - 防止 Function.prototype.toString 检测
    const originalFunctionToString = Function.prototype.toString;
    Function.prototype.toString = function() {
        if (this === wrappedAddEventListener || this === EventTarget.prototype.addEventListener) {
            return originalToString.call(originalAddEventListener);
        }
        return originalFunctionToString.call(this);
    };

    ["visibilitychange", "blur", "focus", "focusin", "focusout"].forEach((e) => {
        originalAddEventListener.call(
            window,
            e,
            (event) => {
                event.stopImmediatePropagation();
                event.stopPropagation();
                event.preventDefault();
                return false;
            },
            true
        );
    });

    // 虚假窗口尺寸配置（提前定义，供iframe保护使用）
    const FAKE_WINDOW_SIZE = {
        width: 1920,
        height: 1080,
        outerWidth: 1920,
        outerHeight: 1080,
        screenWidth: 1920,
        screenHeight: 1080,
        availWidth: 1920,
        availHeight: 1040,
        devicePixelRatio: 1
    };

    let isEnabled = true;
    let uiUpdateFunction = () => {};
    const interceptLog = [];
    const MAX_LOG_ITEMS = 15;

    function addLog(type, message, color = '#dc3545') {
        const timestamp = new Date().toLocaleTimeString();
        interceptLog.unshift({ time: timestamp, type: type, message: message, color: color });
        if (interceptLog.length > MAX_LOG_ITEMS) {
            interceptLog.pop();
        }
        if (uiUpdateFunction) {
            uiUpdateFunction();
        }
    }

    // iframe 保护系统
    const protectIframe = (iframe) => {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc) return;

            // 覆盖iframe的document属性
            const defineProperty = (obj, prop, value) => {
                try {
                    Object.defineProperty(obj, prop, {
                        get: () => value,
                        configurable: true
                    });
                } catch (e) {}
            };

            defineProperty(iframeDoc, 'hidden', false);
            defineProperty(iframeDoc, 'visibilityState', 'visible');
            defineProperty(iframeDoc, 'hasFocus', () => true);

            // 如果iframe有独立的window对象
            if (iframe.contentWindow) {
                defineProperty(iframe.contentWindow, 'innerWidth', FAKE_WINDOW_SIZE.width);
                defineProperty(iframe.contentWindow, 'innerHeight', FAKE_WINDOW_SIZE.height);
                defineProperty(iframe.contentWindow, 'outerWidth', FAKE_WINDOW_SIZE.outerWidth);
                defineProperty(iframe.contentWindow, 'outerHeight', FAKE_WINDOW_SIZE.outerHeight);
            }

            addLog('system', '🛡️ iframe 保护已注入', '#007bff');
        } catch (e) {
            // 跨域iframe无法访问，静默处理
        }
    };

    // 保存原始MutationObserver（在拦截之前）
    const OriginalMutationObserver = window.MutationObserver;

    // 监听现有和新增的iframe
    const observeIframes = () => {
        // 保护现有iframe
        document.querySelectorAll('iframe').forEach(protectIframe);

        // 监听新增iframe（使用原始MutationObserver避免被拦截）
        const observer = new OriginalMutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'IFRAME') {
                        // 等待iframe加载完成
                        originalAddEventListener.call(node, 'load', () => protectIframe(node), { once: true });
                        // 立即尝试保护（某些iframe可能已经加载）
                        protectIframe(node);
                    }
                });
            });
        });

        if (document.documentElement) {
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        }
    };

    // 在DOM准备好后启动iframe观察
    if (document.readyState === 'loading') {
        originalAddEventListener.call(document, 'DOMContentLoaded', observeIframes);
    } else {
        observeIframes();
    }

    let isUIVisible = false;
    let uiContainer = null;
    let uiMinimizedTag = null;

    // 持久化设置
    const STORAGE_KEY = 'screenProtectorUISettings';
    const loadSettings = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {}
        return { uiSystemEnabled: true, defaultUIVisible: false };
    };
    const saveSettings = (settings) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {}
    };
    const settings = loadSettings();

    const stats = {
        visibilitychange: 0,
        blur: 0,
        focusout: 0,
        focusin: 0,
        pagehide: 0,
        pageshow: 0,
        proxy: 0,
        get total() {
            return this.visibilitychange + this.blur + this.focusout + this.focusin + this.pagehide + this.pageshow + this.proxy;
        }
    };

    // 保存实际窗口尺寸（用于UI拖动等内部逻辑）
    const ACTUAL_WINDOW_SIZE = {
        width: window.innerWidth,
        height: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight
    };

    // 监听窗口大小变化，更新实际尺寸（在捕获阶段，阻止事件传播）
    originalAddEventListener.call(window, 'resize', (e) => {
        // 更新实际尺寸（用于内部UI拖动）
        ACTUAL_WINDOW_SIZE.width = window.innerWidth;
        ACTUAL_WINDOW_SIZE.height = window.innerHeight;
        ACTUAL_WINDOW_SIZE.outerWidth = window.outerWidth;
        ACTUAL_WINDOW_SIZE.outerHeight = window.outerHeight;

        // 阻止事件传播到网站的监听器
        if (isEnabled) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            addLog('system', '📐 拦截 resize 事件', '#007bff');
        }
    }, true);

    try {
        document.hasFocus = () => true;
        Object.defineProperty(document, 'hidden', {
            get() { return false; },
            configurable: true
        });
        Object.defineProperty(document, 'visibilityState', {
            get: () => 'visible',
            configurable: true
        });
        if (!document.__hasFocusPatched) {
            document.hasFocus = function() { return true; };
            document.__hasFocusPatched = true;
        }
        addLog('system', '✓ 属性覆盖成功 (hasFocus/hidden/visibilityState)', '#28a745');

        // 虚假窗口尺寸覆盖
        const defineProperty = (obj, prop, value) => {
            try {
                Object.defineProperty(obj, prop, {
                    get: () => value,
                    configurable: true
                });
            } catch (e) {
                // 如果无法定义属性，尝试直接赋值
                try {
                    obj[prop] = value;
                } catch (e2) {}
            }
        };

        // 窗口尺寸
        defineProperty(window, 'innerWidth', FAKE_WINDOW_SIZE.width);
        defineProperty(window, 'innerHeight', FAKE_WINDOW_SIZE.height);
        defineProperty(window, 'outerWidth', FAKE_WINDOW_SIZE.outerWidth);
        defineProperty(window, 'outerHeight', FAKE_WINDOW_SIZE.outerHeight);

        // 屏幕尺寸
        if (window.screen) {
            defineProperty(window.screen, 'width', FAKE_WINDOW_SIZE.screenWidth);
            defineProperty(window.screen, 'height', FAKE_WINDOW_SIZE.screenHeight);
            defineProperty(window.screen, 'availWidth', FAKE_WINDOW_SIZE.availWidth);
            defineProperty(window.screen, 'availHeight', FAKE_WINDOW_SIZE.availHeight);
            defineProperty(window.screen, 'colorDepth', 24);
            defineProperty(window.screen, 'pixelDepth', 24);
        }

        // 窗口位置
        defineProperty(window, 'screenLeft', 0);
        defineProperty(window, 'screenTop', 0);
        defineProperty(window, 'screenX', 0);
        defineProperty(window, 'screenY', 0);

        // 设备像素比
        defineProperty(window, 'devicePixelRatio', FAKE_WINDOW_SIZE.devicePixelRatio);

        // 设备方向（防止检测屏幕旋转）
        if (window.screen && window.screen.orientation) {
            try {
                Object.defineProperty(window.screen.orientation, 'type', {
                    get: () => 'landscape-primary',
                    configurable: true
                });
                Object.defineProperty(window.screen.orientation, 'angle', {
                    get: () => 0,
                    configurable: true
                });
            } catch (e) {}
        }
        defineProperty(window, 'orientation', 0);

        // 覆盖matchMedia以返回合理的媒体查询结果
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = function(query) {
            // 处理涉及设备尺寸的媒体查询
            if (query.includes('device-width') || query.includes('device-height')) {
                return {
                    matches: false,
                    media: query,
                    onchange: null,
                    addListener: function() {},
                    removeListener: function() {},
                    addEventListener: function() {},
                    removeEventListener: function() {},
                    dispatchEvent: function() { return true; }
                };
            }

            // 对于涉及视口尺寸的查询，修改结果
            const result = originalMatchMedia.call(window, query);

            // 检查查询是否涉及视口尺寸
            const viewportPatterns = [
                /\(\s*width\s*:\s*(\d+)px\s*\)/,
                /\(\s*min-width\s*:\s*(\d+)px\s*\)/,
                /\(\s*max-width\s*:\s*(\d+)px\s*\)/,
                /\(\s*height\s*:\s*(\d+)px\s*\)/,
                /\(\s*min-height\s*:\s*(\d+)px\s*\)/,
                /\(\s*max-height\s*:\s*(\d+)px\s*\)/
            ];

            let involvesViewport = false;
            for (const pattern of viewportPatterns) {
                if (pattern.test(query)) {
                    involvesViewport = true;
                    break;
                }
            }

            if (involvesViewport) {
                // 创建一个新的MediaQueryList对象，使用虚假的尺寸
                const fakeResult = {
                    matches: false,
                    media: query,
                    onchange: null,
                    addListener: function(callback) {
                        // 立即调用一次回调
                        if (typeof callback === 'function') {
                            callback({ matches: fakeResult.matches, media: query });
                        }
                    },
                    removeListener: function() {},
                    addEventListener: function(type, callback) {
                        if (type === 'change' && typeof callback === 'function') {
                            callback({ matches: fakeResult.matches, media: query });
                        }
                    },
                    removeEventListener: function() {},
                    dispatchEvent: function() { return true; }
                };

                // 计算查询是否匹配虚假尺寸
                try {
                    // 简单的解析逻辑
                    const widthMatch = query.match(/\(\s*(min-|max-)?width\s*:\s*(\d+)px\s*\)/);
                    const heightMatch = query.match(/\(\s*(min-|max-)?height\s*:\s*(\d+)px\s*\)/);

                    let matches = true;

                    if (widthMatch) {
                        const operator = widthMatch[1] || '';
                        const value = parseInt(widthMatch[2]);
                        if (operator === 'min-') {
                            matches = matches && (FAKE_WINDOW_SIZE.width >= value);
                        } else if (operator === 'max-') {
                            matches = matches && (FAKE_WINDOW_SIZE.width <= value);
                        } else {
                            matches = matches && (FAKE_WINDOW_SIZE.width === value);
                        }
                    }

                    if (heightMatch) {
                        const operator = heightMatch[1] || '';
                        const value = parseInt(heightMatch[2]);
                        if (operator === 'min-') {
                            matches = matches && (FAKE_WINDOW_SIZE.height >= value);
                        } else if (operator === 'max-') {
                            matches = matches && (FAKE_WINDOW_SIZE.height <= value);
                        } else {
                            matches = matches && (FAKE_WINDOW_SIZE.height === value);
                        }
                    }

                    fakeResult.matches = matches;
                } catch (e) {
                    // 解析失败时保持matches为false
                }

                return fakeResult;
            }

            return result;
        };

        addLog('system', '✓ 虚假窗口尺寸已设置 (' + FAKE_WINDOW_SIZE.width + 'x' + FAKE_WINDOW_SIZE.height + ')', '#28a745');
    } catch (e) {
        addLog('system', '❌ 属性覆盖失败: ' + e.message, '#dc3545');
    }

    const interceptOtherEvents = (e) => {
        if (!isEnabled) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        const eventType = e.type;
        if (stats.hasOwnProperty(eventType)) {
            stats[eventType]++;
            let logMessage = '';
            switch (eventType) {
                case 'visibilitychange':
                    logMessage = `📱 强力阻止 页面可见性检测`;
                    break;
                case 'pagehide':
                    logMessage = `📄 强力阻止 页面隐藏 (pagehide)`;
                    break;
                case 'pageshow':
                    logMessage = `📄 强力阻止 页面显示 (pageshow)`;
                    break;
                case 'focusin':
                    logMessage = `⚡ 强力阻止 焦点获得 (focusin)`;
                    break;
            }
            addLog(eventType, logMessage, '#28a745');
        }
    };

    try {
        ['visibilitychange', 'pagehide', 'pageshow', 'focusin'].forEach(eventType => {
            originalAddEventListener.call(window, eventType, interceptOtherEvents, true);
            originalAddEventListener.call(document, eventType, interceptOtherEvents, true);
        });
    } catch (e) {
         addLog('system', '❌ 监听器附加失败: ' + e.message, '#dc3545');
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
                    const filteredMutations = mutations.filter(mutation => {
                        return mutation.target !== document && mutation.target !== document.documentElement;
                    });
                    if (filteredMutations.length > 0) {
                        callback(filteredMutations);
                    }
                });
                return observer;
            };
            window.MutationObserver.prototype = originalMutationObserver.prototype;
        } catch (e) {
        }
    })();

    addLog('system', '防护系统已启动', '#4CAF50');


    const createUI = () => {
        if (window.top !== window.self) {
            return;
        }

        // 应用保存的设置
        isUIVisible = settings.defaultUIVisible;

        const hideUI = () => {
            if (uiContainer && uiContainer.parentNode) {
                uiContainer.parentNode.removeChild(uiContainer);
                uiContainer = null;
            }
            if (uiMinimizedTag && uiMinimizedTag.parentNode) {
                uiMinimizedTag.parentNode.removeChild(uiMinimizedTag);
                uiMinimizedTag = null;
            }
            addLog('system', 'UI 已隐藏 (刷新页面恢复)', '#999');
        };

        uiMinimizedTag = document.createElement('div');
        const tagLabel = document.createElement('span');
        const tagToggle = document.createElement('button');

        tagLabel.textContent = '防护';
        tagToggle.textContent = '✕';
        tagToggle.title = '移除 UI';
        tagToggle.style.cssText = 'background: none; border: none; color: inherit; cursor: pointer; padding: 0; font-size: 12px;';

        uiMinimizedTag.appendChild(tagLabel);
        uiMinimizedTag.appendChild(tagToggle);

        Object.assign(uiMinimizedTag.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: '999999',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
            userSelect: 'none',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            transition: 'background-color 0.2s'
        });

        const updateTagColor = () => {
            uiMinimizedTag.style.backgroundColor = isEnabled ? '#4CAF50' : '#999';
            tagLabel.textContent = isEnabled ? '正在防护' : '防护已停';
        };

        tagLabel.addEventListener('click', (e) => {
            e.stopPropagation();
            isUIVisible = !isUIVisible;
            if (uiContainer) uiContainer.style.display = isUIVisible ? 'block' : 'none';
            uiMinimizedTag.style.display = isUIVisible ? 'none' : 'flex';
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
        const hotkeyPanel = document.createElement('div');

        header.appendChild(title);
        controls.appendChild(toggleBtn);
        controls.appendChild(minimizeBtn);
        controls.appendChild(closeBtn);
        header.appendChild(controls);
        body.appendChild(statusPanel);
        body.appendChild(statsPanel);
        body.appendChild(logPanel);
        body.appendChild(settingsPanel);
        body.appendChild(hotkeyPanel);
        uiContainer.appendChild(header);
        uiContainer.appendChild(body);

        const appendUI = () => {
            if (document.body) {
                document.body.appendChild(uiContainer);
                document.body.appendChild(uiMinimizedTag);

                // 根据uiSystemEnabled决定是否显示
                if (!settings.uiSystemEnabled) {
                    uiContainer.style.display = 'none';
                    uiMinimizedTag.style.display = 'none';
                } else {
                    uiContainer.style.display = isUIVisible ? 'block' : 'none';
                    uiMinimizedTag.style.display = isUIVisible ? 'none' : 'flex';
                }
                updateTagColor();
            }
        };

        if (document.body) {
            appendUI();
        } else {
            originalAddEventListener.call(document, 'DOMContentLoaded', appendUI);
        }

        title.textContent = '🛡️ 防护';
        minimizeBtn.textContent = '—';
        minimizeBtn.title = '最小化';
        closeBtn.textContent = '✕';
        closeBtn.title = '关闭';

        const updateUI = () => {
            updateTagColor();
            if (isEnabled) {
                toggleBtn.textContent = '✓ 开启';
                toggleBtn.style.color = '#fff';
                toggleBtn.style.backgroundColor = '#4CAF50';
                toggleBtn.style.borderColor = '#4CAF50';
            } else {
                toggleBtn.textContent = '✗ 关闭';
                toggleBtn.style.color = '#fff';
                toggleBtn.style.backgroundColor = '#999';
                toggleBtn.style.borderColor = '#999';
            }

            statusPanel.innerHTML = `
                <div>焦点: 强制聚焦</div>
                <div>可见性: 伪装中</div>
            `;

            statsPanel.innerHTML = `
                <div>拦截: ${stats.total}</div>
                <div>代理: ${stats.proxy} | 事件: ${stats.visibilitychange + stats.pagehide + stats.pageshow + stats.focusin}</div>
            `;

            if (interceptLog.length === 0) {
                logPanel.innerHTML = '<div style="color: #999;">暂无日志</div>';
            } else {
                logPanel.innerHTML = interceptLog.slice(0, 5).map(log => {
                    return `<div style="font-size: 11px; color: #666; margin: 2px 0;">
                        ${log.time} - ${log.message}
                    </div>`;
                }).join('');
            }

            settingsPanel.innerHTML = `
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                    <input type="checkbox" id="uiSystemEnabledCheckbox" ${settings.uiSystemEnabled ? 'checked' : ''} style="cursor: pointer;">
                    <span>页面是否显示UI</span>
                </label>
            `;

            hotkeyPanel.innerHTML = `
                <div style="color: #666; font-size: 10px; line-height: 1.4;">
                    <strong>快捷键:</strong><br/>
                    Ctrl + Alt + H: 显示/隐藏 UI<br/>
                    <span style="color: #999;">(UI禁用后可用快捷键显示)</span>
                </div>
            `;

            const checkbox = document.getElementById('uiSystemEnabledCheckbox');
            if (checkbox && !checkbox._listener) {
                checkbox._listener = true;
                checkbox.addEventListener('change', (e) => {
                    settings.uiSystemEnabled = e.target.checked;
                    saveSettings(settings);
                    addLog('system', e.target.checked ? 'UI已启用' : '下次刷新UI将不可见，Ctrl+Alt+H显示', '#4CAF50');
                });
            }
        };

        uiUpdateFunction = updateUI;
        updateUI();

        const buttonBase = {
            background: 'none',
            border: '1px solid #ddd',
            borderRadius: '3px',
            cursor: 'pointer',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: 'bold',
            transition: 'all 0.2s',
            color: '#333'
        };

        Object.assign(uiContainer.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '280px',
            backgroundColor: '#fff',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '4px',
            zIndex: '999999',
            fontFamily: 'sans-serif',
            fontSize: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            display: isUIVisible ? 'block' : 'none'
        });

        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 10px',
            backgroundColor: '#f5f5f5',
            borderBottom: '1px solid #eee',
            cursor: 'move',
            userSelect: 'none',
            fontWeight: 'bold'
        });

        Object.assign(controls.style, { display: 'flex', gap: '4px' });
        Object.assign(toggleBtn.style, buttonBase);
        Object.assign(minimizeBtn.style, buttonBase);
        Object.assign(closeBtn.style, buttonBase);

        Object.assign(body.style, {
            padding: '8px 10px',
            maxHeight: '60vh',
            overflowY: 'auto',
            fontSize: '11px',
            lineHeight: '1.5'
        });

        const panelStyle = {
            marginBottom: '8px',
            padding: '6px',
            backgroundColor: '#fafafa',
            borderRadius: '3px',
            border: '1px solid #eee'
        };

        Object.assign(statusPanel.style, panelStyle);
        Object.assign(statsPanel.style, panelStyle);
        Object.assign(logPanel.style, { ...panelStyle, maxHeight: '80px', overflowY: 'auto' });
        Object.assign(settingsPanel.style, { ...panelStyle, padding: '6px' });
        Object.assign(hotkeyPanel.style, { ...panelStyle, padding: '6px' });

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isEnabled = !isEnabled;
            addLog('system', isEnabled ? '防护已开启' : '防护已关闭', isEnabled ? '#4CAF50' : '#999');
            updateUI();
        });

        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isUIVisible = false;
            uiContainer.style.display = 'none';
            uiMinimizedTag.style.display = 'flex';
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideUI();
        });

        let isDragging = false;
        let offset = { x: 0, y: 0 };

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            offset.x = e.clientX - uiContainer.getBoundingClientRect().left;
            offset.y = e.clientY - uiContainer.getBoundingClientRect().top;
            header.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let newX = e.clientX - offset.x;
            newX = Math.max(0, Math.min(newX, ACTUAL_WINDOW_SIZE.width - uiContainer.offsetWidth));
            let newRight = ACTUAL_WINDOW_SIZE.width - (newX + uiContainer.offsetWidth);
            Object.assign(uiContainer.style, {
                left: 'auto',
                right: `${Math.max(0, newRight)}px`,
                bottom: '20px',
                top: 'auto'
            });
        });

        window.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            header.style.cursor = 'move';
        });
    };

    originalAddEventListener.call(window, 'keydown', (e) => {
        if (e.key.toLowerCase() === 'h' && e.ctrlKey && e.altKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();

            // 如果UI系统被禁用，先启用
            if (!settings.uiSystemEnabled) {
                settings.uiSystemEnabled = true;
                saveSettings(settings);
                isUIVisible = true;
            } else {
                // 否则切换显示/隐藏
                isUIVisible = !isUIVisible;
            }

            if (uiContainer) {
                uiContainer.style.display = isUIVisible ? 'block' : 'none';
                if (uiMinimizedTag) {
                    uiMinimizedTag.style.display = isUIVisible ? 'none' : 'flex';
                }
            }
        }
    }, true);

    if (document.readyState === 'loading') {
        originalAddEventListener.call(window, 'DOMContentLoaded', createUI);
    } else {
        createUI();
    }

})();