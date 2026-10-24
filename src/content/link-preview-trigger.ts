// @ts-nocheck
import { toPreviewFrameUrl } from '../shared/link-preview-frame-url';

(function() {
  // Runs in every frame. In an ordinary frame it turns Shift+click on a link
  // into a link preview (see src/background/link-preview.ts). Inside the
  // preview's own frame it tells the preview surface that a real page loaded
  // there (a page refused for framing shows Chrome's error page, where no
  // content script runs) and passes Escape up so the preview can close.
  const RUNTIME_KEY = '_x_extension_link_preview_trigger_2026_unique_';
  const PREVIEW_FRAME_NAME = 'lumno-link-preview';
  const PREVIEW_MESSAGE_SOURCE = 'lumno-link-preview-frame';
  const PREVIEW_SURFACE_SOURCE = 'lumno-link-preview-surface';
  const previousRuntime = window[RUNTIME_KEY];
  if (previousRuntime && typeof previousRuntime.cleanup === 'function') {
    try {
      previousRuntime.cleanup();
    } catch (error) {
      // A listener from the previous extension context may already be invalid.
    }
  }

  const cleanups = [];
  function listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  }

  function isPreviewFrame() {
    try {
      return window.top !== window && window.name === PREVIEW_FRAME_NAME;
    } catch (error) {
      return false;
    }
  }

  function send(message, callback) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        void (chrome.runtime && chrome.runtime.lastError);
        if (typeof callback === 'function') {
          callback(response);
        }
      });
    } catch (error) {
      // Ignore an extension context invalidated during reload or navigation.
    }
  }

  // The Options switch, on until storage says otherwise as it defaults to on.
  // Like every synced setting it lives in sync storage unless the user keeps
  // settings local (local-primary), so both areas are read and the active
  // one decides. The keys are settings.js's, spelled out here: importing it
  // would double this every-frame script.
  const ENABLED_STORAGE_KEY = '_x_extension_link_preview_enabled_2026_unique_';
  const LOCAL_PRIMARY_STORAGE_KEY = '_x_extension_local_primary_2026_unique_';
  let triggerEnabled = true;

  function followEnabledSetting() {
    const storage = typeof chrome !== 'undefined' && chrome ? chrome.storage : null;
    if (!storage || !storage.local) {
      return;
    }
    const stored = { sync: undefined, local: undefined, localPrimary: false };
    const apply = () => {
      const areaName = stored.localPrimary || !storage.sync ? 'local' : 'sync';
      triggerEnabled = stored[areaName] !== false;
    };
    const read = (area, keys, take) => {
      try {
        area.get(keys, (result) => {
          void (chrome.runtime && chrome.runtime.lastError);
          take(result || {});
          apply();
        });
      } catch (error) {
        // Ignore an extension context invalidated during reload or navigation.
      }
    };
    read(storage.local, [ENABLED_STORAGE_KEY, LOCAL_PRIMARY_STORAGE_KEY], (result) => {
      stored.local = result[ENABLED_STORAGE_KEY];
      stored.localPrimary = result[LOCAL_PRIMARY_STORAGE_KEY] === true;
    });
    if (storage.sync) {
      read(storage.sync, [ENABLED_STORAGE_KEY], (result) => {
        stored.sync = result[ENABLED_STORAGE_KEY];
      });
    }
    const onChanged = storage.onChanged;
    if (!onChanged || typeof onChanged.addListener !== 'function') {
      return;
    }
    const listener = (changes, areaName) => {
      if (!changes || (areaName !== 'sync' && areaName !== 'local')) {
        return;
      }
      if (changes[ENABLED_STORAGE_KEY]) {
        stored[areaName] = changes[ENABLED_STORAGE_KEY].newValue;
      }
      if (areaName === 'local' && changes[LOCAL_PRIMARY_STORAGE_KEY]) {
        stored.localPrimary = changes[LOCAL_PRIMARY_STORAGE_KEY].newValue === true;
      }
      apply();
    };
    onChanged.addListener(listener);
    cleanups.push(() => onChanged.removeListener(listener));
  }

  function isPreviewGesture(event) {
    return triggerEnabled &&
      Boolean(event) &&
      event.isTrusted === true &&
      event.button === 0 &&
      event.shiftKey === true &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey;
  }

  function readAnchorHref(element) {
    if (!element || typeof element.getAttribute !== 'function') {
      return '';
    }
    const tagName = String(element.tagName || '').toLowerCase();
    if (tagName !== 'a' && tagName !== 'area') {
      return '';
    }
    const href = element.href;
    if (typeof href === 'string') {
      return href;
    }
    // SVG <a> exposes an SVGAnimatedString.
    if (href && typeof href.baseVal === 'string') {
      try {
        return new URL(href.baseVal, document.baseURI).href;
      } catch (error) {
        return '';
      }
    }
    return '';
  }

  // The link under the press, also inside open shadow roots.
  function findPreviewTarget(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    for (const element of path) {
      if (element === window || element === document) {
        break;
      }
      const href = readAnchorHref(element);
      if (!href) {
        const shownUrl = isClickable(element) ? readShownUrl(element) : '';
        if (shownUrl) {
          return shownUrl;
        }
        continue;
      }
      if (element.hasAttribute('download') || element.isContentEditable) {
        return '';
      }
      if (isPreviewableHref(href)) {
        return href;
      }
      // A link that runs script (href="#", "javascript:") but shows an
      // address opens that address.
      return readShownUrl(element);
    }
    return findPostLink(path);
  }

  // Many sites show an address in a post or comment as text that opens on a
  // click through script (often window.open, which a held Shift turns into
  // a new window). Such text is taken as the link when it is clickable and
  // is nothing but the address; plain text keeps Shift+click for selecting.
  function isClickable(element) {
    if (!element || element.nodeType !== 1 || element.isContentEditable) {
      return false;
    }
    if (element.getAttribute('role') === 'link' || element.hasAttribute('onclick')) {
      return true;
    }
    try {
      return getComputedStyle(element).cursor === 'pointer';
    } catch (error) {
      return false;
    }
  }

  // With its scheme or www., so a clickable file name (README.md) is not
  // taken for an address.
  const SHOWN_URL_PATTERN = /^(https?:\/\/|www\.)([a-z0-9-]+\.)+[a-z][a-z0-9-]+(:\d+)?([/?#]\S*)?$/i;
  function readShownUrl(element) {
    const text = String(element.textContent || '').trim();
    if (!text || text.length > 2048 || !SHOWN_URL_PATTERN.test(text)) {
      return '';
    }
    try {
      const href = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).href;
      return isPreviewableHref(href) ? href : '';
    } catch (error) {
      return '';
    }
  }

  // X draws a post as an <article> that opens on a click anywhere in it,
  // with no link around it; its timestamp is the post's own link. A press
  // on the post's buttons (reply, like, its menu), a field or a video stays
  // theirs, and the post a page is about has nothing to preview.
  const POST_HOST_PATTERN = /(^|\.)(x|twitter)\.com$/i;
  const POST_CONTROL_SELECTOR = 'button, [role="button"], input, textarea, select, video, [contenteditable="true"]';
  function findPostLink(path) {
    if (!POST_HOST_PATTERN.test(location.hostname)) {
      return '';
    }
    for (const element of path) {
      if (!element || element.nodeType !== 1 || typeof element.matches !== 'function') {
        continue;
      }
      if (element.matches(POST_CONTROL_SELECTOR)) {
        return '';
      }
      if (!element.matches('article[data-testid="tweet"]')) {
        continue;
      }
      const time = element.querySelector('a[href*="/status/"] time');
      const href = time ? readAnchorHref(time.closest('a')) : '';
      if (!href || !isPreviewableHref(href) || new URL(href).pathname === location.pathname) {
        return '';
      }
      return href;
    }
    return '';
  }

  function isPreviewableHref(href) {
    let url;
    try {
      url = new URL(href);
    } catch (error) {
      return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    // A jump within this document has nothing to preview.
    const here = new URL(location.href);
    return !(url.hash && url.origin === here.origin &&
      url.pathname === here.pathname && url.search === here.search);
  }

  // Once the preview takes a press, the page sees none of it. Sites open
  // modified clicks themselves (window.open on Shift or Cmd, often on
  // mouseup or pointerup), and preventing only the default left those
  // handlers opening a tab next to the preview. These listeners are the
  // window's first capture listeners (the script runs at document start), so
  // stopping the events here keeps them from every page listener; a page
  // that saw the press start would also wait for an end it never gets.
  // A tab open before the extension was reloaded or updated gets this script
  // late, after the page's own listeners, and a page that opens links
  // through script then sees the press first and navigates under the
  // preview. Navigations the page starts within a moment of a press the
  // preview took are cancelled; going back or forward and reloading stay.
  const NAVIGATION_GUARD_MS = 1500;

  // In an ordinary frame a press prepares a preview and the click opens it.
  // Inside the preview it opens the link in the preview itself, where Back
  // returns; Chrome would open a new window for it.
  const PREVIEW_HANDLERS = Object.freeze({
    navigatesHere: false,
    prepare(href) {
      send({ action: 'linkPreviewPrepare', url: href });
    },
    open(href, event) {
      send({
        action: 'linkPreviewOpen',
        url: href,
        origin: { x: event.clientX, y: event.clientY }
      });
    }
  });
  const IN_PREVIEW_HANDLERS = Object.freeze({
    navigatesHere: true,
    prepare() {},
    open(href) {
      location.assign(toPreviewFrameUrl(href));
    }
  });

  function setupTrigger(handlers) {
    let pressedHref = '';
    let guardUntil = 0;
    const navigation = window.navigation && typeof window.navigation.addEventListener === 'function'
      ? window.navigation
      : null;
    if (navigation) {
      listen(navigation, 'navigate', (event) => {
        if (Date.now() < guardUntil && event.cancelable &&
            event.navigationType !== 'traverse' && event.navigationType !== 'reload') {
          event.preventDefault();
        }
      });
    }
    const claim = (event) => {
      guardUntil = Date.now() + NAVIGATION_GUARD_MS;
      event.stopImmediatePropagation();
    };
    const isClaimedPress = (event) => {
      const href = isPreviewGesture(event) ? findPreviewTarget(event) : '';
      return Boolean(href) && href === pressedHref;
    };
    listen(window, 'pointerdown', (event) => {
      pressedHref = isPreviewGesture(event) ? findPreviewTarget(event) : '';
      if (pressedHref) {
        claim(event);
      }
    }, true);
    listen(window, 'mousedown', (event) => {
      const href = isPreviewGesture(event) ? findPreviewTarget(event) : '';
      if (!href) {
        pressedHref = '';
        return;
      }
      pressedHref = href;
      claim(event);
      // Shift+mousedown would extend the text selection to the link.
      event.preventDefault();
      handlers.prepare(href);
    }, true);
    ['pointerup', 'mouseup'].forEach((type) => {
      listen(window, type, (event) => {
        if (isClaimedPress(event)) {
          claim(event);
        }
      }, true);
    });
    // Preventing the click also stops Chrome's Shift+click new window.
    listen(window, 'click', (event) => {
      const wasPressed = isClaimedPress(event);
      const href = pressedHref;
      pressedHref = '';
      if (!wasPressed) {
        return;
      }
      claim(event);
      event.preventDefault();
      if (handlers.navigatesHere) {
        // The guard holds back the page's navigations, not this one.
        guardUntil = 0;
      }
      handlers.open(href, event);
    }, true);
  }

  function postToPreviewSurface(message) {
    try {
      window.parent.postMessage(Object.assign({ source: PREVIEW_MESSAGE_SOURCE }, message), '*');
    } catch (error) {
      // The parent may be gone while this frame unloads.
    }
  }

  // Scrolling that runs past the previewed page's edge would otherwise chain
  // to the page under the preview, which scrolls out of sight behind its
  // screenshot and is found moved when the preview closes.
  //
  // The page's own scrollbar (the root's, or the body's on pages that scroll
  // it, as X does while it loads) is replaced by one drawn here, the same on
  // every site and every system setting: a thin thumb on a clear track that
  // stops short of the window's rounded corners, which would otherwise cut
  // off the ends of a full-height bar. The standard properties go back to
  // auto, as Chromium ignores the scrollbar parts while either is set;
  // browsers without the parts get a thin standard bar.
  const CORNER_CLEARANCE_PX = 16;
  const SCROLLBAR_THUMB = 'rgba(128, 128, 128, 0.45)';
  function stylePreviewedPage() {
    const style = document.createElement('style');
    style.textContent = [
      ':root {',
      '  overscroll-behavior: contain !important;',
      '}',
      '@supports not selector(::-webkit-scrollbar) {',
      '  :root, body {',
      '    scrollbar-width: thin !important;',
      `    scrollbar-color: ${SCROLLBAR_THUMB} transparent !important;`,
      '  }',
      '}',
      '@supports selector(::-webkit-scrollbar) {',
      '  :root, body {',
      '    scrollbar-width: auto !important;',
      '    scrollbar-color: auto !important;',
      '  }',
      '  :root::-webkit-scrollbar, body::-webkit-scrollbar {',
      '    width: 12px !important;',
      '    height: 12px !important;',
      '    background: transparent !important;',
      '  }',
      '  :root::-webkit-scrollbar-track, body::-webkit-scrollbar-track {',
      '    background: transparent !important;',
      `    margin: ${CORNER_CLEARANCE_PX}px !important;`,
      '  }',
      '  :root::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb {',
      '    min-height: 32px !important;',
      '    min-width: 32px !important;',
      '    border: 3px solid transparent !important;',
      '    border-radius: 999px !important;',
      `    background: ${SCROLLBAR_THUMB} padding-box !important;`,
      '  }',
      '  :root::-webkit-scrollbar-thumb:hover, body::-webkit-scrollbar-thumb:hover {',
      '    background-color: rgba(128, 128, 128, 0.65) !important;',
      '  }',
      '  :root::-webkit-scrollbar-corner, body::-webkit-scrollbar-corner {',
      '    background: transparent !important;',
      '  }',
      '}'
    ].join('\n');
    (document.head || document.documentElement).append(style);
  }

  // The preview window paints itself in the page's own background color.
  // Its corners clip the frame and the window's color shows in their
  // antialiased edge, and through the scrollbar's clear track; a white
  // window around a dark page left a light seam in both. The color is taken
  // once the page has loaded and held still for a moment, and again whenever
  // it settles on another: pages paint a placeholder color while loading (X
  // starts black), and following each one flashed the window's edge.
  function readDarkQuery() {
    return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  }

  function readPageBackground() {
    for (const element of [document.documentElement, document.body]) {
      if (!element) {
        continue;
      }
      const color = getComputedStyle(element).backgroundColor;
      const match = /^rgba?\(([^)]+)\)$/.exec(color || '');
      const parts = match ? match[1].split(/[\s,/]+/).filter(Boolean) : [];
      if (parts.length >= 3 && (parts.length < 4 || Number(parts[3]) >= 1)) {
        return color;
      }
    }
    // Nothing painted: the canvas color, dark where the page asks for it.
    const scheme = getComputedStyle(document.documentElement).colorScheme || '';
    const darkQuery = readDarkQuery();
    const prefersDark = Boolean(darkQuery && darkQuery.matches);
    const dark = /\bdark\b/.test(scheme) && (prefersDark || !/\blight\b/.test(scheme));
    return dark ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)';
  }

  const BACKGROUND_SETTLE_MS = 250;
  function followPageBackground() {
    let reported = '';
    let loaded = document.readyState === 'complete';
    let timer = 0;
    const report = () => {
      timer = 0;
      const color = readPageBackground();
      if (color !== reported) {
        reported = color;
        postToPreviewSurface({ type: 'background', color });
      }
    };
    // Also keeps pages that touch their root's attributes on every scroll
    // cheap: the style is read once a burst is over.
    const schedule = () => {
      if (!loaded) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(report, BACKGROUND_SETTLE_MS);
    };
    const observer = new MutationObserver(schedule);
    const observe = () => {
      observer.observe(document.documentElement, { attributes: true });
      if (document.body) {
        observer.observe(document.body, { attributes: true });
      }
    };
    observe();
    cleanups.push(() => {
      observer.disconnect();
      clearTimeout(timer);
    });
    listen(document, 'DOMContentLoaded', observe);
    listen(window, 'load', () => {
      loaded = true;
      schedule();
    });
    const darkQuery = readDarkQuery();
    if (darkQuery) {
      listen(darkQuery, 'change', schedule);
    }
    schedule();
  }

  function setupPreviewFrame() {
    if (document.documentElement) {
      stylePreviewedPage();
      followPageBackground();
    }
    // canGoBack is the frame's own history, never the tab's: the preview's
    // Back goes through the Navigation API, which cannot step out of the
    // frame, where history.back() from its first page would take the page
    // under the preview back instead.
    const navigation = window.navigation && typeof window.navigation.addEventListener === 'function'
      ? window.navigation
      : null;
    const reportLocation = () => {
      postToPreviewSurface({
        type: 'alive',
        url: location.href,
        canGoBack: Boolean(navigation && navigation.canGoBack)
      });
    };
    reportLocation();
    if (navigation) {
      listen(navigation, 'navigatesuccess', reportLocation);
      listen(navigation, 'currententrychange', reportLocation);
      // The window shows the page loading again when it leaves for another
      // document (a link, Back, Shift+click); the frame's load event ends it,
      // or navigatesuccess when the page handles the navigation itself.
      listen(navigation, 'navigate', (event) => {
        if (!event.downloadRequest && !(event.destination && event.destination.sameDocument)) {
          postToPreviewSurface({ type: 'loading' });
        }
      });
      listen(navigation, 'navigatesuccess', () => postToPreviewSurface({ type: 'loaded' }));
    }
    listen(window, 'message', (event) => {
      const data = event.data;
      if (event.source !== window.parent || !data || data.source !== PREVIEW_SURFACE_SOURCE) {
        return;
      }
      if (data.type === 'back' && navigation && navigation.canGoBack) {
        const result = navigation.back();
        // A traversal the page cancels rejects both; nothing is left to do.
        [result && result.committed, result && result.finished].forEach((promise) => {
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {});
          }
        });
      } else if (data.type === 'reload') {
        location.reload();
      }
    });
    // Escape closes the preview even where the previewed page claims the key
    // for itself (many prevent it, or stop it, on every press); only an open
    // modal of the page keeps it. Watching in the capture phase and deciding
    // once the event has gone through the page sees presses the page stops
    // and knows whether it took them.
    listen(window, 'keydown', (event) => {
      if (event.key !== 'Escape' || !event.isTrusted) {
        return;
      }
      setTimeout(() => {
        if (!(event.defaultPrevented && hasOpenModal())) {
          postToPreviewSurface({ type: 'escape' });
        }
      }, 0);
    }, true);
  }

  function hasOpenModal() {
    const modals = document.querySelectorAll('dialog[open], [aria-modal="true"]');
    return Array.from(modals).some((modal) => modal.getClientRects().length > 0);
  }

  if (isPreviewFrame()) {
    setupPreviewFrame();
    setupTrigger(IN_PREVIEW_HANDLERS);
  } else {
    followEnabledSetting();
    setupTrigger(PREVIEW_HANDLERS);
  }

  window[RUNTIME_KEY] = {
    cleanup() {
      cleanups.splice(0).forEach((cleanup) => cleanup());
    }
  };
})();
