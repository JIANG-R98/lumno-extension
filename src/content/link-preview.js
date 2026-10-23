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
    openInTab: 'M10 6v2H5v11h11v-5h2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6zm11-3v8h-2V6.413l-7.793 7.794-1.414-1.414L17.585 5H13V3h8z'
  };

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const OPEN_SPRING = createSpringEasing(300, 22);
  const SOFT_SPRING = createSpringEasing(420, 30);

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
      --lp-progress: rgba(60, 110, 255, 0.85);
      --lp-control: rgba(255, 255, 255, 0.2);
      --lp-control-hover: rgba(255, 255, 255, 0.32);
      --lp-control-edge: rgba(255, 255, 255, 0.34);
      --lp-control-ink: #ffffff;
      --lp-notice-ink: #18181d;
      --lp-button: rgba(20, 20, 26, 0.08);
      --lp-button-hover: rgba(20, 20, 26, 0.14);
      position: fixed;
      inset: 0;
      overflow: hidden;
      color-scheme: light dark;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    @media (prefers-color-scheme: dark) {
      .root {
        --lp-panel: #1d1d21;
        --lp-panel-edge: rgba(255, 255, 255, 0.12);
        --lp-muted: rgba(235, 235, 245, 0.42);
        --lp-progress: rgba(120, 160, 255, 0.9);
        --lp-notice-ink: #f2f2f5;
        --lp-button: rgba(255, 255, 255, 0.1);
        --lp-button-hover: rgba(255, 255, 255, 0.16);
      }
    }
    .root[data-state="prewarm"] {
      opacity: 0;
      pointer-events: none;
    }
    .stage {
      position: absolute;
      inset: 0;
      background: var(--lp-stage);
    }
    .shot {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      object-fit: fill;
      transform-origin: 50% 50%;
      will-change: transform, filter;
    }
    .shot[hidden] {
      display: none;
    }
    .scrim {
      position: absolute;
      inset: 0;
      background: var(--lp-scrim);
      opacity: 0;
    }
    /* Without a screenshot the live page shows through, blurred. */
    .root[data-shot="none"] .stage {
      background: transparent;
      backdrop-filter: blur(16px) saturate(1.2);
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
      overflow: hidden;
      border-radius: 16px;
      background: var(--lp-panel);
      box-shadow:
        0 0 0 0.5px var(--lp-panel-edge),
        0 24px 64px rgba(0, 0, 0, 0.28),
        0 4px 16px rgba(0, 0, 0, 0.12);
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
    .progress {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      overflow: hidden;
      pointer-events: none;
      transition: opacity 240ms ease;
    }
    .progress::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      width: 36%;
      border-radius: 2px;
      background: var(--lp-progress);
      animation: lp-progress 1100ms cubic-bezier(0.45, 0, 0.25, 1) infinite;
    }
    .root[data-loaded="true"] .progress {
      opacity: 0;
    }
    @keyframes lp-progress {
      from { transform: translateX(-100%); }
      to { transform: translateX(280%); }
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
      box-shadow: inset 0 0 0 0.5px var(--lp-control-edge), 0 6px 18px rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(18px) saturate(1.6);
      cursor: pointer;
      transition: background-color 140ms ease, transform 140ms ease;
    }
    .control:hover {
      background: var(--lp-control-hover);
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

    const stage = document.createElement('div');
    stage.className = 'stage';
    const shot = document.createElement('img');
    shot.className = 'shot';
    shot.alt = '';
    shot.hidden = true;
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    stage.append(shot, scrim);

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
    const progress = document.createElement('div');
    progress.className = 'progress';
    const notice = document.createElement('div');
    notice.className = 'notice';
    const noticeText = document.createElement('div');
    noticeText.textContent = getMessage('link_preview_blocked', 'This page can’t be shown in a preview');
    const noticeButton = document.createElement('button');
    noticeButton.type = 'button';
    noticeButton.textContent = getMessage('link_preview_open_in_tab', 'Open in new tab');
    notice.append(noticeText, noticeButton);
    panel.append(placeholder, frame, progress, notice);

    const controls = document.createElement('div');
    controls.className = 'controls';
    const preview = {
      token,
      url,
      currentUrl: url,
      host,
      root,
      shot,
      scrim,
      windowElement,
      controls,
      frame,
      supportsPopover,
      shown: false,
      closing: false,
      loadCount: 0,
      aliveSinceLoad: false,
      prewarmTimer: 0,
      restoreFocus: null,
      cleanups: []
    };
    const closeButton = createControl('close', getMessage('link_preview_close', 'Close'), () => close(preview));
    const openInTabButton = createControl(
      'openInTab',
      getMessage('link_preview_open_in_tab', 'Open in new tab'),
      () => moveToTab(preview)
    );
    noticeButton.addEventListener('click', () => moveToTab(preview));
    controls.append(closeButton, openInTabButton);
    windowElement.append(panel, controls);
    root.append(stage, windowElement);
    shadow.append(style, root);

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
    frame.src = url;
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
      preview.currentUrl = data.url;
      preview.root.dataset.blocked = 'false';
    } else if (data.type === 'escape' && preview.shown) {
      close(preview);
    }
  }

  // Every document that really loads in the frame reports in before its load
  // event. A load nothing reported is Chrome's error page: the site refused
  // to be framed (or failed). The first one moves the link to a tab; a later
  // one (a link followed inside the preview) shows a notice instead.
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
      if (loadNumber === 1) {
        preview.refused = true;
        if (preview.shown) {
          moveToTab(preview);
        }
        return;
      }
      preview.root.dataset.blocked = 'true';
    }, ALIVE_GRACE_MS);
  }

  function teardown(preview) {
    clearTimeout(preview.prewarmTimer);
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

  function decodeScreenshot(shot, dataUrl) {
    if (!dataUrl) {
      return Promise.resolve(false);
    }
    shot.src = dataUrl;
    return (typeof shot.decode === 'function' ? shot.decode() : Promise.resolve())
      .then(() => true, () => false);
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
    const hasShot = await decodeScreenshot(preview.shot, message.screenshot);
    if (current !== preview || preview.closing) {
      return true;
    }
    preview.shot.hidden = !hasShot;
    preview.root.dataset.shot = hasShot ? 'image' : 'none';
    preview.root.dataset.state = 'open';
    preview.host.style.removeProperty('pointer-events');
    if (preview.refused) {
      moveToTab(preview);
      return true;
    }
    playOpening(preview, message.origin);
    try {
      preview.frame.focus();
    } catch (error) {
      // Focus stays on the page; Escape still closes from there.
    }
    return true;
  }

  function playOpening(preview, origin) {
    const reduced = reducedMotionQuery.matches;
    const rect = preview.windowElement.getBoundingClientRect();
    const originX = origin ? Math.min(Math.max(origin.x - rect.left, 0), rect.width) : rect.width / 2;
    const originY = origin ? Math.min(Math.max(origin.y - rect.top, 0), rect.height) : rect.height / 2;
    preview.windowElement.style.transformOrigin = `${originX}px ${originY}px`;
    preview.shot.animate([
      { transform: 'scale(1)', filter: 'blur(0px) brightness(1) saturate(1)', borderRadius: '0px' },
      { transform: 'scale(0.94)', filter: 'blur(14px) brightness(0.86) saturate(1.15)', borderRadius: '22px' }
    ], { duration: reduced ? 1 : 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
    preview.scrim.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduced ? 1 : 360,
      easing: 'ease-out',
      fill: 'forwards'
    });
    if (reduced) {
      preview.windowElement.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' });
      return;
    }
    preview.windowElement.animate([
      { transform: 'scale(0.56)' },
      { transform: 'scale(1)' }
    ], { duration: OPEN_SPRING.duration, easing: OPEN_SPRING.easing, fill: 'forwards' });
    preview.windowElement.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 150,
      easing: 'ease-out',
      fill: 'forwards'
    });
    preview.controls.animate([
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'scale(1)' }
    ], { duration: SOFT_SPRING.duration, delay: 120, easing: SOFT_SPRING.easing, fill: 'backwards' });
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
    preview.controls.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduced ? 1 : 110,
      easing: 'ease-out',
      fill: 'forwards'
    });
    preview.windowElement.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: reduced ? 'scale(1)' : 'scale(0.9)' }
    ], { duration: reduced ? 120 : 190, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    preview.scrim.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduced ? 1 : 260,
      easing: 'ease-out',
      fill: 'forwards'
    });
    const recede = preview.shot.animate([
      { transform: 'scale(0.94)', filter: 'blur(14px) brightness(0.86) saturate(1.15)', borderRadius: '22px' },
      { transform: 'scale(1)', filter: 'blur(0px) brightness(1) saturate(1)', borderRadius: '0px' }
    ], { duration: reduced ? 1 : 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
    recede.finished.then(finish, finish);
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
      sendResponse({ token: current && current.shown && !current.closing ? current.token : '' });
      return false;
    }
    return false;
  });
})();
