# I Really Didn't Switch Screens!!!

Believe it or not, I'm telling you — I did not switch screens.

---

## What Is This Thing

We're in the information age. On my own computer, why should I be restricted by all sorts of rules and limitations?

Some websites, the moment you switch screens, pop up a warning: "We've detected you left the page." Videos get forcibly paused. Check-ins get invalidated. Online exams mark you as cheating. It's my own device — I call the shots.

<img src="./image/image.png" width="500" />

So this script has a simple mission — intercept all the signals that the browser tries to snitch about: "He switched tabs," "He minimized the window," "He went to another tab." When a website asks the browser, "Is this person still watching?", the browser will obediently reply: "Yes, yes, hasn't blinked once."

And in reality? I might be happily scrolling on my phone, chatting with friends, looking up info, or copy-pasting.

Bottom line: my computer, my rules!

## Use Cases

Mind-numbing online courses / corporate training that require watching. Online exams / written tests with screen-switch warnings. Video sites that auto-pause when you switch to another tab. Reading and check-in pages that stop counting time when you leave. Web mini-games that stop working when they lose focus. Online meetings that secretly log "not watching screen."

Screen-switch protection, screen-switch interception, anti-screen-switch, anti-screen-switch detection, switching screens without being detected, blocking screen-switch reminders, screen-switch cheating, tab switching, window minimization, focus loss, page leave detection, online course AFK, video no-pause, online exam, corporate training AFK, page visibility detection, visibilitychange interception, window switch detection, page blur monitoring

## Usage


## Interception Methods

### 1. addEventListener Event Registration Interception
By rewriting `EventTarget.prototype.addEventListener`, events are intercepted before the page scripts register their listeners. When the target event type is detected as `visibilitychange`, `blur`, `focus`, `focusin`, `focusout`, `pagehide`, or `pageshow`, a no-op is returned directly, preventing the listener from being attached to the DOM.

> **Use Case**: Online exam systems and video platforms that attempt to register screen-switch detection events at page load.

### 2. Capture Phase Event Termination
At the earliest stage of event propagation (capture phase), intercept callbacks are registered with the highest priority. When `visibilitychange`, `blur`, `focus`, `focusin`, or `focusout` events fire, `event.preventDefault()`, `event.stopPropagation()`, and `event.stopImmediatePropagation()` are called in sequence, thoroughly blocking the event from reaching any subsequent listeners at all three levels.

> **Use Case**: Scenarios where the website has already registered its event listeners. The capture phase preemptively intercepts and prevents the events from bubbling up to the website's callbacks.

### 3. Browser API Property Override
Directly overwrite the return values of browser-provided page visibility APIs:
- `document.hasFocus()` is replaced to always return `true`, indicating the window is always focused;
- `document.hidden`'s getter is overridden to always return `false`, indicating the page is never hidden;
- `document.visibilityState`'s getter is overridden to always return `'visible'`, indicating the page is in a visible state.

> **Use Case**: Scenarios where websites check page state by reading API properties rather than listening for events, such as polling timers that check page visibility.

### 4. Page Lifecycle Event Double Interception
For four types of page lifecycle events — `visibilitychange`, `pagehide`, `pageshow`, `focusin` — capture phase interceptors are registered on both the `window` and `document` levels. Triggering at either level stops propagation, providing a double layer of insurance.

> **Use Case**: Covers browser lifecycle state changes such as tab switching, window minimize/restore, and page entering the background.

### 5. MutationObserver DOM Observer Interception
Rewrite `MutationObserver.prototype.observe`. When the observation target is detected as `document` or `document.documentElement`, a no-op mock instance is returned, preventing websites from indirectly inferring page visibility state by monitoring DOM changes.

> **Use Case**: Some websites monitor DOM attribute changes or node additions/removals to help determine whether the user has switched screens. This strategy blocks that type of indirect detection.

### 6. Fullscreen Request Interception and Spoofing
Intercept all browser-prefixed `requestFullscreen` and `exitFullscreen` methods. When a website requests fullscreen, the actual fullscreen operation is not performed, but a successful Promise is returned, and a `fullscreenchange` event is manually dispatched to make the website believe fullscreen was successful. A fake fullscreen target element is also recorded, and status properties like `document.fullscreenElement` and `document.fullscreen` are spoofed.

> **Use Case**: Online exam systems that enforce fullscreen monitoring, video sites with fullscreen playback detection, web apps that require fullscreen state to continue operating.

### 7. CSS :fullscreen Pseudo-class Detection Protection
Intercept `window.getComputedStyle`. When in pseudo-fullscreen state, queries for `:fullscreen` pseudo-class styles on the fullscreen element return expected fullscreen style values (e.g., `position: fixed`, width/height equal to screen dimensions), preventing websites from verifying fullscreen authenticity via CSS pseudo-class style changes.

> **Use Case**: Advanced anti-cheat systems that check element background color or layout changes via `getComputedStyle(el, ':fullscreen')` to determine whether the page is truly in fullscreen.

### 8. Dimension Sniffing Protection
When a fullscreen request is detected, `window.innerWidth`/`innerHeight` are dynamically adjusted to match `screen.width`/`screen.height`, and a `resize` event is triggered. Original dimensions are restored when exiting fullscreen. Prevents websites from verifying fullscreen authenticity via comparisons like `window.innerWidth === screen.width`.

> **Use Case**: Scenarios where websites verify fullscreen status by comparing window dimensions to screen resolution, such as detection logic requiring "the window must fill the entire screen to count as fullscreen."

## Development / Testing

The project includes `index.html` for simulated detection, with the following built-in detection mechanisms:

| Detection Item | Mechanism Description |
|---|---|
| Page Visibility | Listens to `visibilitychange` event, detects changes in `document.hidden` state |
| Window Focus | Listens to `window.blur` event, detects window focus loss |
| Window Size | Listens to `window.resize` event, identifies minimize, split-screen, maximize behaviors |
| Fullscreen Change | Listens to `fullscreenchange` event, detects exiting fullscreen |
| Fullscreen State Verification | Checks `document.fullscreenElement` and `document.fullscreen` properties to verify whether fullscreen state is real |
| CSS Pseudo-class Detection | Checks via `getComputedStyle(el, ':fullscreen')` whether fullscreen pseudo-class styles are in effect |
| Dimension Consistency | Compares `window.innerWidth` with `screen.width` to verify whether window size matches screen size during fullscreen |
| Pop-up Requests | Rewrites `window.open`, intercepts and logs pop-up calls |
| DevTools Detection | Infers DevTools open status via `outerWidth - innerWidth` difference |
| Keyboard Shortcuts | Listens to `keydown`, detects Alt+Tab, F11, Ctrl+W and other screen-switching shortcuts |
| Right-click Menu | Listens to `contextmenu` event, detects "Inspect Element" entry |
| API Tampering Detection | Every 2 seconds checks whether property getters for `visibilityState`, `hidden`, `hasFocus`, `addEventListener`, `innerWidth`/`innerHeight`, `fullscreenElement` etc. have been replaced with non-native functions |
| State Cross-validation | Every 3 seconds compares the consistency of `hasFocus()` and `visibilityState` return values. `hasFocus=true` but `visibilityState≠visible` is flagged as abnormal |
| DNA Identification (Stack Trace Penetration) | Uses the `Illegal invocation` error stack signature of native C++ getters to detect extension injection traces (chrome-extension, userscript, Tampermonkey, etc.). Excessively deep stacks or eval injections are flagged as positive |
| Exam Mode | One-click fullscreen exam mode. Monitors fullscreen exit count (max 3). Auto-forces re-entry if fullscreen is not restored within timeout. Forcefully terminates if limit is exceeded |