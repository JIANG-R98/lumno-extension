'use strict';

// The New Tab page (newtab.html) as the browser loads it: the preload
// bundles, the React islands entry and the page bundle, run in JSDOM against a
// fake chrome API with storage, packaged files, top sites, history and a
// recording runtime. Tests interact with the page's real controls.

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { bundleScript } = require('./module-script');
const { recordAllListeners } = require('./trusted-events');
const { EXTENSION_ORIGIN, createArea, createEvent, reactEntryScript } = require('./options-page');
const { createFakeBookmarks, shortcutsStorage } = require('./newtab-fixtures');

const repoRoot = path.resolve(__dirname, '..', '..');
const INPUT_ID = '_x_extension_newtab_search_input_2024_unique_';

const DEFAULT_SYNC = {
  _x_extension_language_2024_unique_: 'en',
  _x_extension_motion_effects_enabled_2026_unique_: false
};

// options:
//   sync, local, session  initial storage (sync is merged over DEFAULT_SYNC)
//   shortcuts      the user's shortcuts (inputs for the shortcuts store:
//                  { url, title } or { type: 'folder', folderId, title })
//   bookmarks      the bookmark bar's children (see newtab-fixtures.js)
//   topSites       chrome.topSites.get answer
//   history        chrome.history.search answer
//   respond        (message) => response for chrome.runtime.sendMessage;
//                  return undefined for the default answers
//   platform       navigator.platform ('MacIntel' by default)
//   userAgent      navigator.userAgent
//   darkSystem     whether prefers-color-scheme: dark matches
//   search         the page URL's query, e.g. '?focus=1'
//   setup          (window) => void, run before the page scripts
async function createNewtabPage(options) {
  const config = options || {};
  const errors = [];
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.map(String).join(' ')));
  if (process.env.LUMNO_TEST_CONSOLE) {
    virtualConsole.forwardTo(console, { jsdomErrors: 'none' });
  }
  const html = fs.readFileSync(path.join(repoRoot, 'newtab.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: `${EXTENSION_ORIGIN}/newtab.html${config.search || ''}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  Object.defineProperty(window.navigator, 'platform', { configurable: true, value: config.platform || 'MacIntel' });
  if (config.userAgent) {
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: config.userAgent });
  }
  const storageChanged = createEvent();
  const shortcutValues = Array.isArray(config.shortcuts) ? await shortcutsStorage(config.shortcuts) : {};
  const sync = createArea(window, 'sync', Object.assign({}, DEFAULT_SYNC, shortcutValues, config.sync || {}), storageChanged);
  const local = createArea(window, 'local', config.local, storageChanged);
  const session = createArea(window, 'session', config.session, storageChanged);
  const messages = [];
  const created = [];
  const updated = [];
  const searches = [];
  const runtimeMessages = createEvent();
  const historyVisited = createEvent();
  const later = (callback, value) => window.setTimeout(() => callback && callback(value), 0);
  const answer = (callback, value) => {
    if (typeof callback === 'function') {
      later(callback, value);
      return undefined;
    }
    return Promise.resolve(value);
  };
  window.chrome = {
    runtime: {
      id: 'lumno-test',
      lastError: null,
      getURL: (resource) => `${EXTENSION_ORIGIN}/${String(resource || '').replace(/^\//, '')}`,
      getManifest: () => JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8')),
      onMessage: runtimeMessages,
      sendMessage(message, callback) {
        messages.push(JSON.parse(JSON.stringify(message)));
        let response = typeof config.respond === 'function' ? config.respond(message) : undefined;
        if (response === undefined) {
          if (message && message.action === 'getSearchSuggestions') {
            response = { suggestions: [] };
          } else if (message && message.action === 'getSearchEngineSuggestions') {
            response = { suggestions: message.localSuggestions || [], hasRemoteSuggestions: false };
          } else if (message && message.action === 'getTabs') {
            response = { tabs: [] };
          } else {
            response = { ok: true };
          }
        }
        const promise = Promise.resolve(response);
        promise.then((value) => later(callback, value));
        return typeof callback === 'function' ? undefined : promise;
      },
      connect() {
        return { name: '', postMessage() {}, disconnect() {}, onMessage: createEvent(), onDisconnect: createEvent() };
      },
      openOptionsPage() {}
    },
    storage: { sync, local, session, onChanged: storageChanged },
    i18n: { getUILanguage: () => 'en', getMessage: () => '' },
    tabs: {
      create(properties, callback) {
        created.push(JSON.parse(JSON.stringify(properties)));
        return answer(callback, Object.assign({ id: 100 + created.length }, properties));
      },
      update(id, properties, callback) {
        updated.push({ id, properties: JSON.parse(JSON.stringify(properties)) });
        return answer(callback, Object.assign({ id }, properties));
      },
      getCurrent(callback) {
        return answer(callback, { id: 42, windowId: 1 });
      },
      query(_info, callback) {
        return answer(callback, []);
      }
    },
    topSites: {
      get(callback) {
        return answer(callback, config.topSites || []);
      }
    },
    history: {
      search(_query, callback) {
        return answer(callback, config.history || []);
      },
      onVisited: historyVisited
    },
    search: {
      query(info, callback) {
        searches.push(JSON.parse(JSON.stringify(info)));
        return answer(callback, undefined);
      }
    },
    bookmarks: createFakeBookmarks(window, config.bookmarks || []),
    permissions: {
      contains(_permissions, callback) {
        return answer(callback, true);
      },
      request(_permissions, callback) {
        return answer(callback, true);
      }
    }
  };
  window.fetch = async (url) => {
    const parsed = new URL(String(url), window.location.href);
    if (parsed.protocol !== 'chrome-extension:') {
      throw new Error(`network disabled: ${url}`);
    }
    const file = path.join(repoRoot, decodeURIComponent(parsed.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    }
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  };
  const mediaListeners = new Set();
  window.matchMedia = (media) => ({
    matches: Boolean(config.darkSystem) && /prefers-color-scheme:\s*dark/.test(media),
    media,
    addEventListener(_type, listener) { mediaListeners.add(listener); },
    removeEventListener(_type, listener) { mediaListeners.delete(listener); },
    addListener(listener) { mediaListeners.add(listener); },
    removeListener(listener) { mediaListeners.delete(listener); }
  });
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.HTMLElement.prototype.scrollIntoView = function() {};
  if (!window.Element.prototype.animate) {
    window.Element.prototype.animate = function() {
      return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null, addEventListener() {} };
    };
  }
  if (typeof config.setup === 'function') {
    config.setup(window);
  }
  const dispatchTrusted = recordAllListeners(window);
  const run = (source, file) => window.eval(`${source}\n//# sourceURL=${file}`);
  const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms === undefined ? 30 : ms));
  run(bundleScript('newtab-preload'), 'build/newtab-preload.js');
  run(bundleScript('wallpaper-effect-preload'), 'build/wallpaper-effect-preload.js');
  window.LumnoNewtabReactBootstrap = { reactReady: false };
  run(reactEntryScript('src/react/newtab-islands.js'), 'src/react/newtab-islands.js');
  // The bootstrap adds the page bundle once the React entry has loaded.
  await settle(50);
  run(bundleScript('newtab'), 'build/newtab.js');
  await settle(120);

  const waitFor = async (condition, message, timeoutMs) => {
    const deadline = Date.now() + (timeoutMs || 2000);
    while (Date.now() < deadline) {
      const value = condition();
      if (value) return value;
      await settle(10);
    }
    throw new Error(`${message || 'condition not met'}${errors.length ? `\npage errors: ${errors.join('\n')}` : ''}`);
  };

  const page = {
    window,
    document: window.document,
    errors,
    consoleErrors,
    messages,
    created,
    updated,
    searches,
    storage: { sync, local, session },
    bookmarks: window.chrome.bookmarks,
    storageChanged,
    runtimeMessages,
    historyVisited,
    mediaListeners,
    settle,
    waitFor,
    byId: (id) => window.document.getElementById(id),
    input: () => window.document.getElementById(INPUT_ID),
    async type(query) {
      const input = page.input();
      input.focus();
      input.value = query;
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      await settle(60);
    },
    // A trusted key press on the focused element (the search input by
    // default), delivered along its path to every listener.
    press(key, init) {
      const target = (init && init.target) || window.document.activeElement || page.input();
      return dispatchTrusted(target, 'keydown', Object.assign({ key, bubbles: true, cancelable: true }, init || {}));
    },
    keyup(key, init) {
      const target = (init && init.target) || window.document.activeElement || page.input();
      return dispatchTrusted(target, 'keyup', Object.assign({ key, bubbles: true, cancelable: true }, init || {}));
    },
    trusted(target, type, init) {
      return dispatchTrusted(target, type, init);
    },
    // A pointer moving onto `element`: the pointer and mouse events a browser
    // fires for it.
    async hover(element) {
      element.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }));
      element.dispatchEvent(new window.MouseEvent('pointerenter'));
      element.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
      element.dispatchEvent(new window.MouseEvent('mouseenter'));
      await settle();
    },
    async click(element) {
      element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await settle();
    },
    // A storage change made elsewhere (another device, another page).
    changeStorage(areaName, key, newValue) {
      const area = page.storage[areaName];
      const oldValue = area.data[key];
      area.data[key] = newValue;
      storageChanged.dispatch({ [key]: { oldValue, newValue } }, areaName);
    },
    close() {
      window.close();
    }
  };
  return page;
}

module.exports = { INPUT_ID, createNewtabPage };
