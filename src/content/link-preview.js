import { toPreviewFrameUrl } from '../shared/link-preview-frame-url.js';
import * as TOAST from '../shared/ui/toast.js';

(function() {
  // The link preview surface, injected into a tab's top frame by
  // src/background/link-preview.js. It shows a link in a small window over
  // the page: a screenshot of the page recedes (scales down and blurs) behind
  // it, the window springs open from the click, and buttons outside the
  // window close it or move the page to a tab.
  //
  // The background first sends "prewarm" on mousedown: the window is built
  // invisible and its frame starts loading. "show" follows on click with the
  // screenshot and plays the opening.
  const RUNTIME_KEY = '_x_extension_link_preview_surface_2026_unique_';
  if (window[RUNTIME_KEY]) {
    return;
  }
  window[RUNTIME_KEY] = true;

  const HOST_ID = '_x_extension_link_preview_host_2026_unique_';
  const PREVIEW_FRAME_NAME = 'lumno-link-preview';
  const PREVIEW_MESSAGE_SOURCE = 'lumno-link-preview-frame';
  const PREVIEW_SURFACE_SOURCE = 'lumno-link-preview-surface';
  // A prewarmed window the click never claimed (the page kept the click).
  const PREWARM_TTL_MS = 4500;
  // How long after the frame's load event a page may still report in; the
  // report is posted at document start, so it nearly always arrives first.
  const ALIVE_GRACE_MS = 250;
  const FRAME_SANDBOX = [
    'allow-downloads',
    'allow-forms',
    'allow-modals',
    'allow-pointer-lock',
    'allow-popups',
    'allow-popups-to-escape-sandbox',
    'allow-presentation',
    'allow-same-origin',
    'allow-scripts',
    'allow-storage-access-by-user-activation'
  ].join(' ');
  const FRAME_ALLOW = 'autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share';
  const ICON_PATHS = {
    close: 'M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z',
    openInTab: 'M10 6v2H5v11h11v-5h2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6zm11-3v8h-2V6.413l-7.793 7.794-1.414-1.414L17.585 5H13V3h8z',
    copyLink: 'M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.007-1H7zM5.003 8L5 20h10V8H5.003zM9 6h8v10h2V4H9v2z',
    reload: 'M5.463 4.433A9.961 9.961 0 0 1 12 2c5.523 0 10 4.477 10 10 0 2.136-.67 4.116-1.81 5.74L17 12h3A8 8 0 0 0 6.46 6.228l-.997-1.795zm13.074 15.134A9.961 9.961 0 0 1 12 22C6.477 22 2 17.523 2 12c0-2.136.67-4.116 1.81-5.74L7 12H4a8 8 0 0 0 13.54 5.772l.997 1.795z',
    back: 'M7.828 11H20v2H7.828l5.364 5.364-1.414 1.414L4 12l7.778-7.778 1.414 1.414z'
  };

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Stiff springs: the window reaches 90% of its size in under 100ms and
  // overshoots about 3% at 150ms, so it lands crisply and still bounces.
  const OPEN_SPRING = createSpringEasing(600, 26);
  const SOFT_SPRING = createSpringEasing(640, 38);

  const STYLES = `
    :host {
      all: initial;
    }
    .root {
      --lp-stage: #0c0c0f;
      --lp-scrim: rgba(8, 8, 12, 0.2);
      --lp-panel: #ffffff;
      --lp-panel-edge: rgba(0, 0, 0, 0.12);
      --lp-muted: rgba(20, 20, 26, 0.48);
      --lp-control: rgba(255, 255, 255, 0.24);
      --lp-control-hover: rgba(255, 255, 255, 0.32);
      --lp-control-edge: rgba(255, 255, 255, 0.34);
      --lp-control-ink: #ffffff;
      --lp-notice-ink: #18181d;
      --lp-button: rgba(20, 20, 26, 0.08);
      --lp-button-hover: rgba(20, 20, 26, 0.14);
      position: fixed;
      inset: 0;
      /* Clipped, not hidden: a hidden overflow can still be scrolled by
         script, and a previewed page that scrolls an element into view
         past its own end (X does on load) carried the scroll out to here,
         lifting the whole window off the page. */
      overflow: clip;
      color-scheme: light dark;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    @media (prefers-color-scheme: dark) {
      .root {
        --lp-panel: #1d1d21;
        --lp-panel-edge: rgba(255, 255, 255, 0.12);
        --lp-muted: rgba(235, 235, 245, 0.42);
        --lp-notice-ink: #f2f2f5;
        --lp-button: rgba(255, 255, 255, 0.1);
        --lp-button-hover: rgba(255, 255, 255, 0.16);
      }
    }
    .root:focus {
      outline: none;
    }
    /* Not quite 0: Chrome neither rasters nor uploads a layer at opacity 0,
       which left all of it for the opening's first frame. At 0.002 it stays
       below one step of color, so nothing shows while it gets ready. */
    .root[data-state="prewarm"] {
      opacity: 0.002;
      pointer-events: none;
    }
    .stage {
      position: absolute;
      inset: 0;
      background: var(--lp-stage);
    }
    /* The receding page: its screenshot, and over it the same picture
       blurred once in advance (the veil). Receding scales the pair and
       crossfades from the screenshot to the veil, so the compositor animates
       only transform and opacity;
       animating a blur radius re-blurred two full-screen layers each frame. */
    /* captureVisibleTab takes the whole window, scrollbars included, while
       this layer stops at the page's scrollbar. Laid out at the window's
       size (set from innerWidth and innerHeight; vw leaves the scrollbar
       out on pages whose root always scrolls), the picture keeps the page's
       scale and its own scrollbar falls under the real one; fitted to the
       layer, it was narrower than the page and showed a second scrollbar
       while the preview closed. */
    .page {
      position: absolute;
      top: 0;
      left: 0;
      width: var(--lp-window-width, 100vw);
      height: var(--lp-window-height, 100vh);
      transform-origin: 50% 50%;
      will-change: transform;
    }
    .shot,
    .veil {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      object-fit: fill;
    }
    .shot {
      will-change: opacity;
    }
    /* Its edge is feathered (painted into the canvas, see paintVeil), so
       once the sharp screenshot has faded out from under it the receded
       page melts into the surround without a seam. */
    .veil {
      opacity: 0;
      will-change: opacity;
    }
    /* Fills the space the receding page leaves with the veil's picture, so
       the shrinking page shows no edge against it. Oversized so the blurred
       edge stays off screen. */
    .surround {
      position: absolute;
      inset: -48px;
      width: calc(100% + 96px);
      height: calc(100% + 96px);
      display: block;
    }
    .page[hidden],
    .surround[hidden] {
      display: none;
    }
    /* With a screenshot its tone is painted into the veil instead. */
    .scrim {
      position: absolute;
      inset: 0;
      display: none;
      background: var(--lp-scrim);
      opacity: 0;
    }
    /* Without a screenshot the live page shows through, blurred. */
    .root[data-shot="none"] .stage {
      background: transparent;
      backdrop-filter: blur(16px) saturate(1.2);
    }
    .root[data-shot="none"] .scrim {
      display: block;
    }
    .window {
      position: absolute;
      inset: 40px 0;
      width: min(1180px, calc(100vw - 176px));
      margin: 0 auto;
    }
    .panel {
      position: absolute;
      inset: 0;
      overflow: clip;
      border-radius: 26px;
      background: var(--lp-panel);
      box-shadow:
        0 0 0 0.5px var(--lp-panel-edge),
        0 24px 64px rgba(0, 0, 0, 0.28),
        0 4px 16px rgba(0, 0, 0, 0.12);
    }
    /* A continuous (squircle) corner like a macOS window's. Its curve starts
       as far from the corner as a 26pt continuous corner does, about 1.5
       times the radius, so it looks the size of the window corner. Only
       while the window is still: clipping the frame to it takes a mask pass
       on every frame, and the plain corner it stands in for while the window
       springs open or shrinks away looks the same at that size. */
    @supports (corner-shape: squircle) {
      .root[data-motion="still"] .panel {
        border-radius: 40px;
        corner-shape: squircle;
      }
    }
    .placeholder {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: var(--lp-muted);
      font-size: 13px;
      letter-spacing: 0.01em;
    }
    iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: transparent;
    }
    .notice {
      position: absolute;
      inset: 0;
      display: none;
      place-content: center;
      justify-items: center;
      gap: 14px;
      background: var(--lp-panel);
      color: var(--lp-notice-ink);
      font-size: 14px;
    }
    .root[data-blocked="true"] .notice {
      display: grid;
    }
    .notice button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 7px 16px;
      background: var(--lp-button);
      color: inherit;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .notice button:hover {
      background: var(--lp-button-hover);
    }
    .controls {
      position: absolute;
      top: 0;
      left: calc(100% + 14px);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .control {
      appearance: none;
      width: 38px;
      height: 38px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: var(--lp-control-ink);
      background: var(--lp-control);
      /* No backdrop blur: what lies under the buttons is the veil, already
         blurred, and re-blurring it under each button cost a render pass per
         button on every frame of the opening. */
      box-shadow: inset 0 0 0 0.5px var(--lp-control-edge), 0 6px 18px rgba(0, 0, 0, 0.18);
      cursor: pointer;
      transition: background-color 140ms ease, transform 140ms ease;
    }
    .control:hover {
      background: var(--lp-control-hover);
    }
    .control[hidden] {
      display: none;
    }
    /* While the page loads, an arc turns around the close button: out of
       the page's way, and gone once it has loaded. */
    .control-close {
      position: relative;
    }
    .control-close::after {
      content: "";
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      border: 1.5px solid transparent;
      border-top-color: rgba(255, 255, 255, 0.9);
      pointer-events: none;
      animation: lp-spin 820ms linear infinite;
      transition: opacity 240ms ease;
    }
    .root[data-loaded="true"] .control-close::after {
      opacity: 0;
      animation-play-state: paused;
    }
    @keyframes lp-spin {
      to { transform: rotate(1turn); }
    }
    .control:active {
      transform: scale(0.92);
    }
    .control:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.9);
      outline-offset: 2px;
    }
    .control svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    @media (max-width: 760px) {
      .window {
        inset: 64px 12px 12px;
        width: auto;
        margin: 0;
      }
      .controls {
        top: -50px;
        left: auto;
        right: 0;
        flex-direction: row-reverse;
      }
    }
  `;

  // The page receded behind the preview: scaled, and crossfaded to its veil, the
  // screenshot blurred by BLUR_CSS_PX and toned by VEIL_TONE. The veil is
  // painted at BLUR_RENDER_WIDTH pixels wide; blurred, it scales up unseen.
  const PAGE_AT_REST = { transform: 'scale(1)' };
  const PAGE_RECEDED = { transform: 'scale(0.95)' };
  const BLUR_CSS_PX = 16;
  const VEIL_TONE = 'brightness(0.9) saturate(1.1)';
  const BLUR_RENDER_WIDTH = 480;
  // The scrim over the receded page, and the width of the veil's feathered
  // edge in CSS pixels.
  const SCRIM_TONE = 'rgba(8, 8, 12, 0.2)';
  const FEATHER_CSS_PX = 48;

  let current = null;

  // Samples a damped spring from 0 to 1 into a CSS linear() easing, so the
  // window can overshoot and settle on the compositor like a physical spring.
  function createSpringEasing(stiffness, damping) {
    const step = 1 / 120;
    const samples = [0];
    let position = 0;
    let velocity = 0;
    let time = 0;
    let settledAt = step;
    while (time < 1.6) {
      for (let substep = 0; substep < 4; substep += 1) {
        const acceleration = -stiffness * (position - 1) - damping * velocity;
        velocity += acceleration * (step / 4);
        position += velocity * (step / 4);
      }
      time += step;
      samples.push(position);
      if (Math.abs(position - 1) > 0.002 || Math.abs(velocity) > 0.02) {
        settledAt = time;
      }
    }
    const used = samples.slice(0, Math.ceil(settledAt / step) + 1);
    used.push(1);
    const supportsLinear = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' &&
      CSS.supports('animation-timing-function', 'linear(0, 1)');
    return {
      duration: Math.round(settledAt * 1000),
      easing: supportsLinear
        ? `linear(${used.map((value) => Number(value.toFixed(4))).join(', ')})`
        : 'cubic-bezier(0.34, 1.4, 0.64, 1)'
    };
  }

  function getMessage(key, fallback) {
    try {
      const value = chrome.i18n && chrome.i18n.getMessage ? chrome.i18n.getMessage(key) : '';
      return value || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function send(message) {
    try {
      chrome.runtime.sendMessage(message, () => {
        void (chrome.runtime && chrome.runtime.lastError);
      });
    } catch (error) {
      // Ignore an extension context invalidated during reload or navigation.
    }
  }

  function createIcon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICON_PATHS[name]);
    svg.append(path);
    return svg;
  }

  function createControl(name, label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'control';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(createIcon(name));
    button.addEventListener('click', onClick);
    return button;
  }

  // Copies the address the preview is on now, which follows links taken
  // inside it. The page's clipboard API needs a secure page; elsewhere a
  // selected field inside the window copies instead, so focus stays here.
  function copyLink(preview) {
    const url = preview.currentUrl || preview.url;
    const clipboard = navigator.clipboard;
    const copied = clipboard && typeof clipboard.writeText === 'function'
      ? Promise.resolve(clipboard.writeText(url)).then(() => true, () => copyWithSelection(preview, url))
      : Promise.resolve(copyWithSelection(preview, url));
    copied.then((ok) => {
      if (preview.closing) {
        return;
      }
      if (ok) {
        showToast(preview, getMessage('link_preview_link_copied', 'Link copied'));
      } else {
        showToast(preview, getMessage('copy_page_url_failed_retry', 'Copy failed. Please try again.'), { error: true });
      }
    });
  }

  function copyWithSelection(preview, text) {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-hidden', 'true');
    field.style.cssText = 'position: fixed; left: -9999px; top: 0; opacity: 0;';
    preview.root.append(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    field.remove();
    return copied;
  }

  function showToast(preview, message, options) {
    const dark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) {
      preview.toastElement.setAttribute('data-theme', 'dark');
    } else {
      preview.toastElement.removeAttribute('data-theme');
    }
    preview.toast.show(message, options);
  }

  function postToFrame(preview, type) {
    try {
      preview.frame.contentWindow.postMessage({ source: PREVIEW_SURFACE_SOURCE, type }, '*');
    } catch (error) {
      // The frame may be between documents.
    }
  }

  // Back steps through the frame's own history only; the button shows while
  // the previewed page reports it has somewhere to go back to.
  function goBack(preview) {
    preview.root.dataset.loaded = 'false';
    postToFrame(preview, 'back');
  }

  // A page that reported in reloads itself, keeping its place in the
  // frame's history; Chrome's error page has no script, so it is loaded
  // again from its address.
  function reload(preview) {
    preview.root.dataset.loaded = 'false';
    if (preview.pageReported && preview.root.dataset.blocked !== 'true') {
      postToFrame(preview, 'reload');
    } else {
      preview.frame.src = toPreviewFrameUrl(preview.currentUrl || preview.url);
    }
  }

  function readHostLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
      return '';
    }
  }

  function applyHostStyle(host) {
    // Inline and important, so page rules for div or [popover] cannot move it.
    host.style.cssText = [
      'all: initial',
      'display: block',
      'position: fixed',
      'inset: 0',
      'width: 100vw',
      'height: 100vh',
      'max-width: none',
      'max-height: none',
      'margin: 0',
      'padding: 0',
      'border: 0',
      'background: transparent',
      'overflow: visible',
      'z-index: 2147483647'
    ].map((declaration) => `${declaration} !important`).join('; ');
  }

  function build(token, url) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('translate', 'no');
    applyHostStyle(host);
    const supportsPopover = typeof host.showPopover === 'function';
    if (supportsPopover) {
      host.setAttribute('popover', 'manual');
    }
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLES;

    const root = document.createElement('div');
    root.className = 'root';
    root.dataset.state = 'prewarm';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.tabIndex = -1;

    const stage = document.createElement('div');
    stage.className = 'stage';
    const surround = document.createElement('canvas');
    surround.className = 'surround';
    surround.hidden = true;
    const page = document.createElement('div');
    page.className = 'page';
    page.hidden = true;
    const shot = document.createElement('img');
    shot.className = 'shot';
    shot.alt = '';
    const veil = document.createElement('canvas');
    veil.className = 'veil';
    page.append(shot, veil);
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    stage.append(surround, page, scrim);

    const windowElement = document.createElement('div');
    windowElement.className = 'window';
    const panel = document.createElement('div');
    panel.className = 'panel';
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = readHostLabel(url);
    const frame = document.createElement('iframe');
    frame.name = PREVIEW_FRAME_NAME;
    frame.setAttribute('sandbox', FRAME_SANDBOX);
    frame.setAttribute('allow', FRAME_ALLOW);
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    const notice = document.createElement('div');
    notice.className = 'notice';
    const noticeText = document.createElement('div');
    noticeText.textContent = getMessage('link_preview_blocked', 'This page can’t be shown in a preview');
    const noticeButton = document.createElement('button');
    noticeButton.type = 'button';
    noticeButton.textContent = getMessage('link_preview_open_in_tab', 'Open in new tab');
    notice.append(noticeText, noticeButton);
    panel.append(placeholder, frame, notice);

    const controls = document.createElement('div');
    controls.className = 'controls';
    const preview = {
      token,
      url,
      currentUrl: url,
      frameUrl: toPreviewFrameUrl(url),
      host,
      root,
      page,
      shot,
      veil,
      surround,
      scrim,
      windowElement,
      panel,
      controls,
      frame,
      supportsPopover,
      shown: false,
      closing: false,
      loadCount: 0,
      aliveSinceLoad: false,
      prewarmTimer: 0,
      backButton: null,
      toastElement: null,
      toastGate: null,
      toast: null,
      restoreFocus: null,
      shotDecode: null,
      pageReported: false,
      cleanups: []
    };
    const closeButton = createControl('close', getMessage('link_preview_close', 'Close'), () => close(preview));
    closeButton.classList.add('control-close');
    const openInTabButton = createControl(
      'openInTab',
      getMessage('link_preview_open_in_tab', 'Open in new tab'),
      () => moveToTab(preview)
    );
    const copyLinkButton = createControl(
      'copyLink',
      getMessage('link_preview_copy_link', 'Copy link'),
      () => copyLink(preview)
    );
    const reloadButton = createControl('reload', getMessage('link_preview_reload', 'Reload'), () => reload(preview));
    // Last, so it comes and goes without moving the others.
    const backButton = createControl('back', getMessage('link_preview_back', 'Back'), () => goBack(preview));
    backButton.hidden = true;
    preview.backButton = backButton;
    noticeButton.addEventListener('click', () => moveToTab(preview));
    controls.append(closeButton, openInTabButton, copyLinkButton, reloadButton, backButton);
    windowElement.append(panel, controls);
    // The window sits in the top layer, so a toast of the page's own would
    // stay under it; this one lives in the window.
    const toastStylesheet = document.createElement('link');
    toastStylesheet.rel = 'stylesheet';
    toastStylesheet.href = chrome.runtime.getURL('src/shared/ui/toast.css');
    const toastElement = document.createElement('div');
    toastElement.className = 'x-lumno-toast';
    toastElement.setAttribute('data-show', 'false');
    toastElement.setAttribute('role', 'status');
    toastElement.setAttribute('aria-live', 'polite');
    toastElement.style.setProperty('--x-lumno-toast-top', 'max(24px, calc(env(safe-area-inset-top) + 12px))');
    preview.toastElement = toastElement;
    preview.toastGate = TOAST.createToastStyleGate(toastElement, { stylesheetElement: toastStylesheet, windowObj: window });
    preview.toast = TOAST.createToastController(toastElement, { windowObj: window });
    root.append(stage, windowElement, toastElement);
    shadow.append(style, toastStylesheet, root);

    // A press outside the window closes it.
    stage.addEventListener('click', () => close(preview));
    // The page under the screenshot must not scroll while the preview is up.
    const blockScroll = (event) => event.preventDefault();
    root.addEventListener('wheel', blockScroll, { passive: false });
    root.addEventListener('touchmove', blockScroll, { passive: false });

    frame.addEventListener('load', () => handleFrameLoad(preview));
    listen(preview, window, 'message', (event) => handleFrameMessage(preview, event));
    listen(preview, window, 'keydown', (event) => {
      if (preview.shown && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(preview);
      }
    }, true);
    listen(preview, window, 'pagehide', () => {
      send({ action: 'linkPreviewClose', token: preview.token });
    });

    // Until the click claims it, the invisible window must not take the
    // press: the click has to land on the link that started it.
    host.style.setProperty('pointer-events', 'none', 'important');
    // The address is set before the frame is connected: a frame connected
    // without one loads about:blank first, and that load would count as the
    // page's (see handleFrameLoad).
    frame.src = preview.frameUrl;
    document.documentElement.append(host);
    if (supportsPopover) {
      host.showPopover();
    }
    return preview;
  }

  function listen(preview, target, type, listener, options) {
    target.addEventListener(type, listener, options);
    preview.cleanups.push(() => target.removeEventListener(type, listener, options));
  }

  // Keys go to the preview window until the previewed page has reported in,
  // then to the page. A frame still on its initial empty document (a slow
  // site) has nothing listening, and Escape would not close the preview.
  function focusPreviewedPage(preview) {
    if (!preview.shown || preview.closing || !preview.pageReported || !preview.root.matches(':focus')) {
      return;
    }
    try {
      preview.frame.focus();
    } catch (error) {
      // Focus stays on the window; Escape still closes from there.
    }
  }

  function handleFrameMessage(preview, event) {
    if (!event || event.source !== preview.frame.contentWindow) {
      return;
    }
    const data = event.data;
    if (!data || data.source !== PREVIEW_MESSAGE_SOURCE) {
      return;
    }
    if (data.type === 'alive' && typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) {
      preview.aliveSinceLoad = true;
      preview.pageReported = true;
      focusPreviewedPage(preview);
      // Until the page moves on, the link keeps its own address where the
      // frame loads it through another (see toPreviewFrameUrl).
      preview.currentUrl = data.url === preview.frameUrl ? preview.url : data.url;
      preview.root.dataset.blocked = 'false';
      preview.backButton.hidden = data.canGoBack !== true;
    } else if (data.type === 'background' && typeof data.color === 'string' &&
        /^rgba?\([\d.,\s%/]+\)$/.test(data.color)) {
      preview.panel.style.backgroundColor = data.color;
    } else if (data.type === 'loading') {
      preview.root.dataset.loaded = 'false';
    } else if (data.type === 'loaded') {
      preview.root.dataset.loaded = 'true';
    } else if (data.type === 'escape' && preview.shown) {
      close(preview);
    }
  }

  // Every document that really loads in the frame reports in before its load
  // event. A load nothing reported is Chrome's error page: the site refused
  // to be framed (or failed). The window says so and offers a tab; moving the
  // link to a tab on its own read as the preview being cut off by a jump.
  function handleFrameLoad(preview) {
    preview.loadCount += 1;
    const loadNumber = preview.loadCount;
    setTimeout(() => {
      if (current !== preview || preview.closing || loadNumber !== preview.loadCount) {
        return;
      }
      const alive = preview.aliveSinceLoad;
      preview.aliveSinceLoad = false;
      preview.root.dataset.loaded = 'true';
      if (alive) {
        return;
      }
      preview.root.dataset.blocked = 'true';
    }, ALIVE_GRACE_MS);
  }

  // The page under the preview cannot be used while it is up, so a new
  // navigation it starts by itself (a site acting late on the press the
  // preview took, or a same-site page in the preview reaching out to it)
  // is held back, a scripted reload included. Back, Forward, the user's own
  // reload and the page replacing its own address in place still go through.
  function holdPageNavigation(preview) {
    const navigation = window.navigation;
    if (!navigation || typeof navigation.addEventListener !== 'function') {
      return;
    }
    listen(preview, navigation, 'navigate', (event) => {
      const sameDocument = Boolean(event.destination && event.destination.sameDocument);
      const held = event.navigationType === 'push' ||
        (event.navigationType === 'replace' && !sameDocument) ||
        (event.navigationType === 'reload' && !event.userInitiated);
      if (held && event.cancelable && !event.downloadRequest && !preview.closing) {
        event.preventDefault();
      }
    });
  }

  function fitPageToWindow(preview) {
    preview.root.style.setProperty('--lp-window-width', `${window.innerWidth}px`);
    preview.root.style.setProperty('--lp-window-height', `${window.innerHeight}px`);
  }

  // The page under the preview keeps its scroll position while the preview
  // is open, and gets it back when the preview goes: anything that scrolls
  // it meanwhile (the previewed page chaining its scroll past its edge, a
  // script) happens out of sight behind the screenshot.
  function holdPageScroll(preview) {
    const left = window.scrollX;
    const top = window.scrollY;
    const restore = () => {
      if (window.scrollX !== left || window.scrollY !== top) {
        window.scrollTo({ left, top, behavior: 'instant' });
      }
    };
    listen(preview, window, 'scroll', restore, { passive: true });
    preview.cleanups.push(restore);
  }

  function teardown(preview) {
    clearTimeout(preview.prewarmTimer);
    preview.toast.destroy();
    preview.toastGate.destroy();
    preview.cleanups.splice(0).forEach((cleanup) => cleanup());
    preview.frame.removeAttribute('src');
    preview.host.remove();
    if (current === preview) {
      current = null;
    }
  }

  function prewarm(token, url) {
    if (current && !current.shown) {
      teardown(current);
    }
    if (current) {
      // A preview is already on screen; the page under it cannot be pressed.
      return false;
    }
    const preview = build(token, url);
    current = preview;
    preview.prewarmTimer = setTimeout(() => {
      if (current === preview && !preview.shown) {
        teardown(preview);
      }
    }, PREWARM_TTL_MS);
    return true;
  }

  function decodeImage(image, dataUrl) {
    image.src = dataUrl;
    return (typeof image.decode === 'function' ? image.decode() : Promise.resolve())
      .then(() => true, () => false);
  }

  // Paints the veil: the screenshot blurred and toned, small. The blurred
  // edge would fade to transparent, so a slightly enlarged copy is painted
  // first to fill it, then the copy that lines up with the screenshot. The
  // surround gets the same picture.
  function paintVeil(preview) {
    const image = preview.shot;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const context = preview.veil.getContext('2d');
    if (!width || !height || !context) {
      return false;
    }
    const scale = Math.min(1, BLUR_RENDER_WIDTH / width);
    const canvasWidth = Math.max(1, Math.round(width * scale));
    const canvasHeight = Math.max(1, Math.round(height * scale));
    // The screenshot is in device pixels; the blur is meant in CSS pixels.
    const radius = BLUR_CSS_PX * (width / Math.max(1, window.innerWidth)) * scale;
    const pad = Math.ceil(radius * 2);
    preview.veil.width = canvasWidth;
    preview.veil.height = canvasHeight;
    context.filter = `blur(${radius}px) ${VEIL_TONE}`;
    context.drawImage(image, -pad, -pad, canvasWidth + pad * 2, canvasHeight + pad * 2);
    context.drawImage(image, 0, 0, canvasWidth, canvasHeight);
    // The scrim's tone goes into the picture rather than a layer of its own
    // over the whole window.
    context.filter = 'none';
    context.fillStyle = SCRIM_TONE;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    const surroundContext = preview.surround.getContext('2d');
    if (surroundContext) {
      preview.surround.width = canvasWidth;
      preview.surround.height = canvasHeight;
      surroundContext.drawImage(preview.veil, 0, 0);
    }
    featherEdges(context, canvasWidth, canvasHeight, FEATHER_CSS_PX * canvasWidth / Math.max(1, window.innerWidth));
    return true;
  }

  // Fades the veil's edges out, once: a CSS mask did the same on every frame
  // the veil faded in, each time compositing the whole window offscreen.
  function featherEdges(context, width, height, feather) {
    const fade = (x0, y0, x1, y1, length) => {
      const gradient = context.createLinearGradient(x0, y0, x1, y1);
      const stop = Math.min(0.5, feather / Math.max(1, length));
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(stop, '#000');
      gradient.addColorStop(1 - stop, '#000');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      return gradient;
    };
    context.save();
    context.globalCompositeOperation = 'destination-in';
    context.fillStyle = fade(0, 0, width, 0, width);
    context.fillRect(0, 0, width, height);
    context.fillStyle = fade(0, 0, 0, height, height);
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  // The screenshot usually arrives while the button is still down, so a
  // large one is decoded and its veil painted before the click, and the
  // opening starts at once.
  function acceptScreenshot(preview, dataUrl) {
    if (!dataUrl) {
      return;
    }
    preview.shotDecode = decodeImage(preview.shot, dataUrl)
      .then((decoded) => decoded && paintVeil(preview))
      .then((painted) => {
        if (painted && current === preview && !preview.closing) {
          showShot(preview);
        }
        return painted;
      });
  }

  // The picture joins the invisible window as soon as it is ready, so it is
  // decoded for the GPU and uploaded before the click instead of on the
  // opening's first frame.
  function showShot(preview) {
    fitPageToWindow(preview);
    preview.page.hidden = false;
    preview.surround.hidden = false;
    preview.root.dataset.shot = 'image';
  }

  async function show(message) {
    if (current && current.shown) {
      if (current.token === message.token) {
        return true;
      }
      return false;
    }
    if (!current || current.token !== message.token || current.url !== message.url) {
      prewarm(message.token, message.url);
    }
    const preview = current;
    if (!preview) {
      return false;
    }
    clearTimeout(preview.prewarmTimer);
    preview.shown = true;
    preview.restoreFocus = document.activeElement;
    holdPageScroll(preview);
    holdPageNavigation(preview);
    fitPageToWindow(preview);
    listen(preview, window, 'resize', () => fitPageToWindow(preview));
    acceptScreenshot(preview, message.screenshot);
    const hasShot = await (preview.shotDecode || Promise.resolve(false));
    if (current !== preview || preview.closing) {
      return true;
    }
    if (hasShot) {
      showShot(preview);
    } else {
      preview.page.hidden = true;
      preview.surround.hidden = true;
      preview.root.dataset.shot = 'none';
    }
    preview.root.dataset.state = 'open';
    preview.host.style.removeProperty('pointer-events');
    playOpening(preview, message.origin);
    preview.root.focus({ preventScroll: true });
    focusPreviewedPage(preview);
    return true;
  }

  function playOpening(preview, origin) {
    const reduced = reducedMotionQuery.matches;
    preview.root.dataset.motion = 'moving';
    const rect = preview.windowElement.getBoundingClientRect();
    const originX = origin ? Math.min(Math.max(origin.x - rect.left, 0), rect.width) : rect.width / 2;
    const originY = origin ? Math.min(Math.max(origin.y - rect.top, 0), rect.height) : rect.height / 2;
    preview.windowElement.style.transformOrigin = `${originX}px ${originY}px`;
    const recede = { duration: reduced ? 1 : 360, easing: 'cubic-bezier(0.2, 0.9, 0.1, 1)', fill: 'forwards' };
    const blurIn = { duration: reduced ? 1 : 260, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'forwards' };
    preview.page.animate([PAGE_AT_REST, PAGE_RECEDED], recede);
    preview.shot.animate([{ opacity: 1 }, { opacity: 0 }], blurIn);
    preview.veil.animate([{ opacity: 0 }, { opacity: 1 }], blurIn);
    preview.scrim.animate([{ opacity: 0 }, { opacity: 1 }], blurIn);
    if (reduced) {
      preview.root.dataset.motion = 'still';
      preview.windowElement.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' });
      return;
    }
    const spring = preview.windowElement.animate([
      { transform: 'scale(0.78)' },
      { transform: 'scale(1)' }
    ], { duration: OPEN_SPRING.duration, easing: OPEN_SPRING.easing, fill: 'forwards' });
    spring.finished.then(() => {
      if (!preview.closing) {
        preview.root.dataset.motion = 'still';
      }
    }, () => {});
    preview.windowElement.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 110,
      easing: 'ease-out',
      fill: 'forwards'
    });
    preview.controls.animate([
      { opacity: 0, transform: 'scale(0.7)' },
      { opacity: 1, transform: 'scale(1)' }
    ], { duration: SOFT_SPRING.duration, delay: 60, easing: SOFT_SPRING.easing, fill: 'backwards' });
  }

  function close(preview, closeOptions) {
    if (!preview || preview.closing) {
      return;
    }
    preview.closing = true;
    send({ action: 'linkPreviewClose', token: preview.token });
    const instant = Boolean(closeOptions && closeOptions.instant) || !preview.shown;
    const restoreFocus = preview.restoreFocus;
    const finish = () => {
      teardown(preview);
      if (restoreFocus && typeof restoreFocus.focus === 'function' && restoreFocus.isConnected) {
        try {
          restoreFocus.focus({ preventScroll: true });
        } catch (error) {
          // The element may refuse focus now.
        }
      }
    };
    if (instant) {
      finish();
      return;
    }
    const reduced = reducedMotionQuery.matches;
    preview.root.style.pointerEvents = 'none';
    preview.root.dataset.motion = 'moving';
    preview.controls.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduced ? 1 : 110,
      easing: 'ease-out',
      fill: 'forwards'
    });
    preview.windowElement.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: reduced ? 'scale(1)' : 'scale(0.92)' }
    ], { duration: reduced ? 120 : 160, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    const restore = { duration: reduced ? 1 : 280, easing: 'cubic-bezier(0.2, 0.9, 0.1, 1)', fill: 'forwards' };
    const blurOut = { duration: reduced ? 1 : 220, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' };
    preview.shot.animate([{ opacity: 0 }, { opacity: 1 }], blurOut);
    preview.veil.animate([{ opacity: 1 }, { opacity: 0 }], blurOut);
    preview.scrim.animate([{ opacity: 1 }, { opacity: 0 }], blurOut);
    preview.page.animate([PAGE_RECEDED, PAGE_AT_REST], restore).finished.then(finish, finish);
  }

  function moveToTab(preview) {
    const url = preview.currentUrl || preview.url;
    send({ action: 'linkPreviewOpenInTab', url });
    close(preview, { instant: true });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.action !== 'string') {
      return false;
    }
    if (message.action === 'lumnoLinkPreviewPrewarm') {
      sendResponse(prewarm(String(message.token || ''), String(message.url || '')));
      return false;
    }
    if (message.action === 'lumnoLinkPreviewScreenshot') {
      const accepted = Boolean(current) && !current.shown && current.token === String(message.token || '') &&
        typeof message.screenshot === 'string' && message.screenshot.length > 0;
      if (accepted) {
        acceptScreenshot(current, message.screenshot);
      }
      sendResponse(accepted);
      return false;
    }
    if (message.action === 'lumnoLinkPreviewShow') {
      show({
        token: String(message.token || ''),
        url: String(message.url || ''),
        screenshot: typeof message.screenshot === 'string' ? message.screenshot : '',
        origin: message.origin || null
      }).then(sendResponse, () => sendResponse(false));
      return true;
    }
    if (message.action === 'lumnoLinkPreviewPing') {
      // Answers for a preview still opening too: its own frame loading can
      // make the background ask before the click reaches this surface.
      sendResponse({ token: current && !current.closing ? current.token : '' });
      return false;
    }
    return false;
  });
})();
