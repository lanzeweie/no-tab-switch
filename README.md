# 我真的没有切屏！！！

相不相信由你啦，反正我说我就是没有切屏。

---

## 这玩意儿是干嘛的

都信息时代了，在我自己的电脑上做事，凭什么还要被各种条条框框限制？

某些网站哈，切个屏就弹窗警告："检测到您离开了页面"。看个视频被迫暂停，签个到直接判无效，考个试甚至直接记违规。我自己的设备，我做主，

<img src="./image/image.png" width="500" />

所以，这个脚本的使命很简单——把浏览器试图打小报告的那些"他切屏了"、"他最小化了"、"他去看别的标签了"的信号，统统拦截！网站想问浏览器"这人还在看吗？"，浏览器只会乖乖回答："在呢在呢，眼睛都没眨一下。"

而实际上？我可能正在愉快地刷着手机，或者跟朋友聊天，查资料，复制粘贴。

咱就是说 我的电脑，我做主！

## 使用场景

恶心人的网课/企业培训挂机、带切屏警告的在线考试/笔试、切后台就自动暂停的视频网站、离开页面就不计时的阅读和签到、失去焦点就罢工的网页小游戏、会偷偷记录"未看屏幕"的在线会议

切屏保护、切屏拦截、防切屏、防切屏检测、切屏不被发现、禁止切屏提醒、切屏作弊、切换标签页、最小化窗口、失去焦点、离开页面检测、网课挂机、视频不暂停、在线考试、企业培训挂机、页面不可见检测、visibilitychange拦截
 、窗口切换检测、页面失焦监控  

## 使用方法


## 拦截方法

### 1. addEventListener 事件注册拦截
通过重写 `EventTarget.prototype.addEventListener`，在页面脚本注册事件监听器之前进行拦截。当检测到目标事件类型为 `visibilitychange`、`blur`、`focus`、`focusin`、`focusout`、`pagehide`、`pageshow` 时，直接返回空操作，阻止监听器被附加到 DOM 上。

> **适用场景**：页面加载时即尝试注册切屏检测事件的在线考试系统、视频播放平台等。

### 2. 捕获阶段事件终止
在事件传播的最早阶段（capture phase），以最高优先级注册拦截回调。当 `visibilitychange`、`blur`、`focus`、`focusin`、`focusout` 事件被触发时，依次调用 `event.preventDefault()`、`event.stopPropagation()`、`event.stopImmediatePropagation()`，从三个层面彻底阻断事件向后续监听器传递。

> **适用场景**：网站已提前注册好事件监听器的情况，通过捕获阶段先行拦截，阻止事件冒泡到网站的回调函数。

### 3. 浏览器 API 属性覆盖
直接覆写浏览器提供的页面可见性相关 API 的返回值：
- `document.hasFocus()` 被替换为始终返回 `true`，表示窗口始终处于聚焦状态；
- `document.hidden` 的 getter 被覆盖为始终返回 `false`，表示页面未被隐藏；
- `document.visibilityState` 的 getter 被覆盖为始终返回 `'visible'`，表示页面处于可见状态。

> **适用场景**：网站通过读取 API 属性（而非监听事件）来判断页面状态的场景，如轮询检查页面可见性的定时器逻辑。

### 4. 页面生命周期事件双重拦截
针对 `visibilitychange`、`pagehide`、`pageshow`、`focusin` 四类页面生命周期相关事件，同时在 `window` 和 `document` 两个层级注册捕获阶段拦截器，任一层级触发均可终止传播，形成双重保险。

> **适用场景**：覆盖 Tab 切换、窗口最小化/恢复、页面进入后台等浏览器生命周期状态变化的检测。

### 5. MutationObserver DOM 观察器拦截
重写 `MutationObserver.prototype.observe` 方法，当检测到观察目标为 `document` 或 `document.documentElement` 时，返回一个无操作的模拟实例，阻止网站通过监听 DOM 变化间接推断页面可见性状态。

> **适用场景**：部分网站通过监听 DOM 属性变化或节点增删来辅助判断用户是否切屏，此策略可阻断该类间接检测手段。

### 6. 全屏请求拦截与伪造
拦截所有浏览器前缀的 `requestFullscreen` 和 `exitFullscreen` 方法。当网站请求全屏时，不实际执行全屏操作，但返回成功的 Promise，并手动触发 `fullscreenchange` 事件，让网站误以为全屏已成功。同时记录虚假的全屏目标元素，伪造 `document.fullscreenElement`、`document.fullscreen` 等状态属性。

> **适用场景**：在线考试系统强制全屏监控、视频网站全屏播放检测、需要全屏状态才能继续操作的网页应用。

### 7. CSS :fullscreen 伪类检测防护
拦截 `window.getComputedStyle` 方法，当处于伪全屏状态时，对全屏元素的 `:fullscreen` 伪类样式查询返回全屏应有的样式值（如 `position: fixed`、宽高等于屏幕尺寸等），防止网站通过 CSS 伪类样式变化来验证全屏状态的真实性。

> **适用场景**：高级防作弊系统通过 `getComputedStyle(el, ':fullscreen')` 检查元素背景色或布局变化来判断是否真正进入全屏的场景。

### 8. 尺寸嗅探防护
当检测到全屏请求时，动态将 `window.innerWidth`/`innerHeight` 调整为等于 `screen.width`/`screen.height`，并触发 `resize` 事件。退出全屏时恢复原始尺寸。防止网站通过 `window.innerWidth === screen.width` 的尺寸比对来判断全屏状态的真实性。

> **适用场景**：网站通过比较窗口尺寸与屏幕分辨率来验证全屏状态的场景，如"窗口必须占满整个屏幕才算全屏"的检测逻辑。

## 开发/测试
项目中 index.html 可进行模拟检测，内置以下检测机制：

| 检测项 | 机制说明 |
|---|---|
| 页面可见性 | 监听 `visibilitychange` 事件，检测 `document.hidden` 状态变化 |
| 窗口焦点 | 监听 `window.blur` 事件，检测窗口焦点转移 |
| 窗口尺寸 | 监听 `window.resize` 事件，识别最小化、分屏、最大化等行为 |
| 全屏变化 | 监听 `fullscreenchange` 事件，检测退出全屏行为 |
| 全屏状态验证 | 检查 `document.fullscreenElement` 和 `document.fullscreen` 属性，验证全屏状态是否真实 |
| CSS 伪类检测 | 通过 `getComputedStyle(el, ':fullscreen')` 检查全屏伪类样式是否生效 |
| 尺寸一致性 | 比对 `window.innerWidth` 与 `screen.width`，验证全屏时窗口尺寸是否等于屏幕尺寸 |
| 弹窗请求 | 重写 `window.open`，拦截并记录弹窗调用 |
| 开发者工具 | 通过 `outerWidth - innerWidth` 差值推断 DevTools 开启状态 |
| 键盘快捷键 | 监听 `keydown`，检测 Alt+Tab、F11、Ctrl+W 等切屏相关快捷键 |
| 右键菜单 | 监听 `contextmenu` 事件，检测"检查元素"入口 |
| API 篡改检测 | 每 2 秒检查 `visibilityState`、`hidden`、`hasFocus`、`addEventListener`、`innerWidth`/`innerHeight`、`fullscreenElement` 等属性 getter 是否被替换为非原生函数 |
| 状态交叉验证 | 每 3 秒比对 `hasFocus()` 与 `visibilityState` 返回值的一致性，`hasFocus=true` 但 `visibilityState≠visible` 即判定异常 |
| DNA 鉴定（堆栈穿透） | 利用原生 C++ getter 的 `Illegal invocation` 错误堆栈特征，检测扩展注入痕迹（chrome-extension、userscript、Tampermonkey 等），堆栈过深或有 eval 注入即判定阳性 |
| 考试模式 | 一键进入全屏考试模式，监控退出全屏次数（上限 3 次），超时未恢复全屏自动强制切回，超出上限强制终止 |