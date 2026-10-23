'use strict';

// A web page with the tab switcher the background injects into it: the React
// overlay islands and the tab-switcher bundle, run in JSDOM with a fake chrome
// API. Window listeners are tracked so tests can press keys as trusted input,
// and the switcher's closed shadow root is kept so tests can read its cards.

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { bundleScript, moduleScript } = require('./module-script');
const { trackListeners } = require('./trusted-events');
const { trackPageTimers } = require('./page-timers');
const { parseCss } = require('./css-rules');

const repoRoot = path.resolve(__dirname, '..', '..');
const HOST_ID = '_x_extension_tab_switcher_host_2026_unique_';
const PANEL_ID = '_x_extension_tab_switcher_panel_2026_unique_';
const THEME_STORAGE_KEY = '_x_extension_theme_mode_2024_unique_';
const overlayIslandsSource = fs.readFileSync(path.join(repoRoot, 'src/react/overlay-islands.js'), 'utf8');

function createChromeEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      if (!listeners.includes(listener)) listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
    hasListener(listener) {
      return listeners.includes(listener);
    },
    dispatch(...args) {
      return listeners.slice().map((listener) => listener(...args));
    }
  };
}

// options:
//   url          page URL (default a web page)
//   html         page markup
//   storage      initial chrome.storage.sync values
//   darkSystem   whether prefers-color-scheme: dark matches
//   viewport     { width, height, scale, offsetLeft, offsetTop } for visualViewport
//   respond      (message) => response for chrome.runtime.sendMessage
//   bridge       also run the extension-page bridge (src/overlay/tab-switcher-page-bridge.js)
//   connect      chrome.runtime.connect implementation (for the bridge)
//   tabsGetCurrent  chrome.tabs.getCurrent implementation
function createTabSwitcherPage(options) {
  const config = options || {};
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM(config.html || '<!doctype html><html><head></head><body><p>Host page</p></body></html>', {
    url: config.url || 'https://page.example.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  const timers = trackPageTimers(window);
  const shadowRoots = new Map();
  const nativeAttachShadow = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function(init) {
    const root = nativeAttachShadow.call(this, init);
    shadowRoots.set(this, root);
    return root;
  };

  const sync = Object.assign({}, config.storage || {});
  const storageChanged = createChromeEvent();
  const storageArea = {
    get(keys, callback) {
      const list = typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys || sync));
      const values = {};
      list.forEach((key) => {
        if (Object.hasOwn(sync, key)) values[key] = sync[key];
      });
      window.setTimeout(() => callback && callback(values), 0);
      return Promise.resolve(values);
    },
    set(values, callback) {
      Object.assign(sync, values);
      if (callback) callback();
      return Promise.resolve();
    }
  };
  const messages = [];
  const runtimeMessages = createChromeEvent();
  window.chrome = {
    runtime: {
      id: 'lumno-test',
      lastError: null,
      getURL: (resource) => `chrome-extension://lumno-test/${resource}`,
      getManifest: () => ({ version: '1.0.0' }),
      onMessage: runtimeMessages,
      sendMessage(message, callback) {
        messages.push(message);
        const response = typeof config.respond === 'function' ? config.respond(message) : { ok: true };
        window.setTimeout(() => callback && callback(response), 0);
      },
      connect: config.connect
    },
    i18n: { getUILanguage: () => 'en', getMessage: () => '' },
    storage: { sync: storageArea, local: storageArea, onChanged: storageChanged },
    tabs: config.tabsGetCurrent ? { getCurrent: config.tabsGetCurrent } : undefined
  };

  const mediaListeners = new Set();
  const darkQuery = {
    matches: Boolean(config.darkSystem),
    media: '(prefers-color-scheme: dark)',
    addEventListener(type, listener) {
      mediaListeners.add(listener);
    },
    removeEventListener(type, listener) {
      mediaListeners.delete(listener);
    }
  };
  window.matchMedia = (media) => (/prefers-color-scheme:\s*dark/.test(media)
    ? darkQuery
    : { matches: false, media, addEventListener() {}, removeEventListener() {} });

  const viewportConfig = Object.assign({ width: 1024, height: 640, scale: 1, offsetLeft: 0, offsetTop: 0 }, config.viewport || {});
  const viewportTarget = new window.EventTarget();
  const visualViewport = Object.assign(viewportTarget, viewportConfig);
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: visualViewport });
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => visualViewport.width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => visualViewport.height });

  const keys = trackListeners(window);
  const documentEvents = trackListeners(window.document);

  const run = (source, file) => window.eval(`${source}\n//# sourceURL=${file}`);
  run(overlayIslandsSource, 'src/react/overlay-islands.js');
  run(bundleScript('tab-switcher'), 'build/tab-switcher.js');
  if (config.bridge) {
    run(moduleScript('src/overlay/tab-switcher-page-bridge.js'), 'src/overlay/tab-switcher-page-bridge.js');
  }

  const page = {
    window,
    document: window.document,
    errors,
    messages,
    storage: sync,
    storageChanged,
    runtimeMessages,
    mediaListeners,
    keys,
    documentEvents,
    visualViewport,
    setSystemDark(dark) {
      darkQuery.matches = Boolean(dark);
      mediaListeners.forEach((listener) => listener({ matches: darkQuery.matches }));
    },
    changeStorage(key, newValue, areaName) {
      sync[key] = newValue;
      storageChanged.dispatch({ [key]: { newValue } }, areaName || 'sync');
    },
    // Runs the injected runtime again, as the background does when it cannot
    // reuse the one already in the page.
    reinject() {
      run(bundleScript('tab-switcher'), 'build/tab-switcher.js');
    },
    open(context) {
      return window._x_extension_toggleTabSwitcher_2026_unique_(context);
    },
    // Sends a runtime message as the background would and returns the
    // synchronous response the page gave.
    message(request) {
      let response;
      runtimeMessages.dispatch(request, {}, (value) => {
        response = value;
      });
      return response;
    },
    host() {
      return window.document.getElementById(HOST_ID);
    },
    shadow() {
      const host = page.host();
      return host ? shadowRoots.get(host) || null : null;
    },
    panel() {
      const shadow = page.shadow();
      return shadow ? shadow.getElementById(PANEL_ID) : null;
    },
    cards() {
      const shadow = page.shadow();
      return shadow ? Array.from(shadow.querySelectorAll('.x-tab-switcher-card')) : [];
    },
    selectedIndex() {
      return page.cards().findIndex((card) => card.getAttribute('data-active') === 'true');
    },
    // The stylesheet the open switcher put in its shadow root, parsed (see
    // css-rules.js); `#panel` in a selector stands for the panel's id.
    styles() {
      const shadow = page.shadow();
      const style = shadow && shadow.querySelector('style');
      const css = parseCss(style ? style.textContent : '');
      const expand = (selector) => selector.replace(/#panel\b/g, `#${PANEL_ID}`);
      return {
        rule: (selector, condition) => css.rule(expand(selector), condition),
        selectors: () => css.selectors(),
        conditionsFor: (selector) => css.conditionsFor(expand(selector))
      };
    },
    press(key, init) {
      return keys.dispatch('keydown', Object.assign({ key }, init || {}));
    },
    release(key, init) {
      return keys.dispatch('keyup', Object.assign({ key }, init || {}));
    },
    settle(ms) {
      return timers.settle(ms || 10);
    },
    close() {
      window.close();
    }
  };
  return page;
}

function switcherTabs(count) {
  return Array.from({ length: count }, (_value, index) => ({
    id: index + 1,
    windowId: 1,
    title: `Tab ${index + 1}`,
    url: `https://site${index + 1}.example.test/`
  }));
}

module.exports = {
  HOST_ID,
  PANEL_ID,
  THEME_STORAGE_KEY,
  createTabSwitcherPage,
  switcherTabs
};
