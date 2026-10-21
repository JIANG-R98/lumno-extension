'use strict';

// The Settings page (src/options/options.html) as the browser loads it: the
// preload bundle, the React islands entry and the options page bundle, run in
// JSDOM against a fake chrome API with storage, packaged files and a
// recording runtime. Tests interact with the page's real controls.

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { JSDOM, VirtualConsole } = require('jsdom');
const { bundleScript } = require('./module-script');
const { trackListeners } = require('./trusted-events');

const repoRoot = path.resolve(__dirname, '..', '..');
const EXTENSION_ORIGIN = 'chrome-extension://lumno-test';
const reactEntryCache = new Map();

// The React islands entry is an ES module importing its sibling chunks; the
// page loads it with import(). Bundled into one classic script it can run in
// JSDOM.
function reactEntryScript(file) {
  if (!reactEntryCache.has(file)) {
    const result = esbuild.buildSync({
      absWorkingDir: repoRoot,
      entryPoints: [path.join(repoRoot, file)],
      bundle: true,
      format: 'iife',
      target: ['chrome110'],
      write: false,
      logLevel: 'silent'
    });
    reactEntryCache.set(file, result.outputFiles[0].text);
  }
  return reactEntryCache.get(file);
}

function createEvent() {
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

function createArea(window, name, initial, changed) {
  const data = Object.assign({}, initial || {});
  const writes = [];
  const reads = [];
  return {
    data,
    writes,
    reads,
    get(keys, callback) {
      reads.push(keys);
      const list = keys === null || keys === undefined
        ? Object.keys(data)
        : (typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys)));
      const result = {};
      list.forEach((key) => {
        if (Object.hasOwn(data, key)) {
          result[key] = JSON.parse(JSON.stringify(data[key]));
        } else if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
          result[key] = keys[key];
        }
      });
      const promise = new Promise((resolve) => window.setTimeout(() => {
        if (typeof callback === 'function') callback(result);
        resolve(result);
      }, 0));
      return typeof callback === 'function' ? undefined : promise;
    },
    set(items, callback) {
      const copy = JSON.parse(JSON.stringify(items || {}));
      writes.push(copy);
      const changes = {};
      Object.keys(copy).forEach((key) => {
        changes[key] = { oldValue: data[key], newValue: copy[key] };
        data[key] = copy[key];
      });
      const promise = new Promise((resolve) => window.setTimeout(() => {
        changed.dispatch(changes, name);
        if (typeof callback === 'function') callback();
        resolve();
      }, 0));
      return typeof callback === 'function' ? undefined : promise;
    },
    remove(keys, callback) {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      list.forEach((key) => {
        if (Object.hasOwn(data, key)) {
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
      });
      window.setTimeout(() => {
        if (Object.keys(changes).length) changed.dispatch(changes, name);
        if (typeof callback === 'function') callback();
      }, 0);
    },
    getBytesInUse(_keys, callback) {
      window.setTimeout(() => callback && callback(0), 0);
    }
  };
}

// options:
//   sync, local     initial storage
//   fonts           chrome.fontSettings.getFontList answer (null: no API)
//   commands        chrome.commands.getAll answer
//   platform        navigator.platform ('MacIntel' by default)
//   userAgent       navigator.userAgent
//   respond         (message) => response for chrome.runtime.sendMessage
//   hash            the page URL hash
//   setup           (window) => void, run before the page scripts
async function createOptionsPage(options) {
  const config = options || {};
  const errors = [];
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.map(String).join(' ')));
  const html = fs.readFileSync(path.join(repoRoot, 'src/options/options.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: `${EXTENSION_ORIGIN}/src/options/options.html${config.hash ? `#${config.hash}` : ''}`,
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
  const sync = createArea(window, 'sync', config.sync, storageChanged);
  const local = createArea(window, 'local', config.local, storageChanged);
  const session = createArea(window, 'session', config.session, storageChanged);
  const messages = [];
  const created = [];
  const runtimeMessages = createEvent();
  window.chrome = {
    runtime: {
      id: 'lumno-test',
      lastError: null,
      getURL: (resource) => `${EXTENSION_ORIGIN}/${String(resource || '').replace(/^\//, '')}`,
      getManifest: () => JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8')),
      getPlatformInfo: (callback) => window.setTimeout(() => callback({ os: /Mac/.test(config.platform || 'MacIntel') ? 'mac' : 'win' }), 0),
      onMessage: runtimeMessages,
      sendMessage(message, callback) {
        messages.push(JSON.parse(JSON.stringify(message)));
        const response = typeof config.respond === 'function' ? config.respond(message) : undefined;
        const promise = Promise.resolve(response === undefined ? { ok: true } : response);
        promise.then((value) => window.setTimeout(() => callback && callback(value), 0));
        return typeof callback === 'function' ? undefined : promise;
      },
      connect() {
        return { name: '', postMessage() {}, disconnect() {}, onMessage: createEvent(), onDisconnect: createEvent() };
      },
      openOptionsPage() {}
    },
    storage: { sync, local, session, onChanged: storageChanged },
    i18n: {
      getUILanguage: () => config.uiLanguage || 'zh-CN',
      getMessage: () => ''
    },
    commands: {
      getAll(callback) {
        window.setTimeout(() => callback(config.commands || [
          { name: 'show-search', shortcut: '⌘K' },
          { name: 'show-tab-switcher', shortcut: '⌥Q' }
        ]), 0);
      }
    },
    tabs: {
      create(properties, callback) {
        created.push(JSON.parse(JSON.stringify(properties)));
        window.setTimeout(() => callback && callback(Object.assign({ id: 100 + created.length }, properties)), 0);
      },
      getCurrent(callback) {
        window.setTimeout(() => callback({ id: 42, windowId: 1 }), 0);
      },
      query(_info, callback) {
        window.setTimeout(() => callback([]), 0);
      },
      update(_id, _props, callback) {
        window.setTimeout(() => callback && callback(), 0);
      }
    },
    bookmarks: {
      getTree(callback) {
        window.setTimeout(() => callback([{ id: '0', title: '', children: [] }]), 0);
      }
    },
    permissions: {
      contains(_permissions, callback) {
        window.setTimeout(() => callback(true), 0);
      },
      request(_permissions, callback) {
        window.setTimeout(() => callback(true), 0);
      }
    }
  };
  if (config.fonts !== null) {
    window.chrome.fontSettings = {
      getFontList(callback) {
        const fonts = (config.fonts || []).map((family) => (typeof family === 'string'
          ? { fontId: family, displayName: family }
          : family));
        const promise = Promise.resolve(fonts);
        if (typeof callback === 'function') {
          window.setTimeout(() => callback(fonts), 0);
          return undefined;
        }
        return promise;
      }
    };
  }
  window.fetch = async (url) => {
    const parsed = new URL(String(url), window.location.href);
    if (parsed.protocol !== 'chrome-extension:') {
      throw new Error(`network disabled: ${url}`);
    }
    const file = path.join(repoRoot, decodeURIComponent(parsed.pathname));
    if (!fs.existsSync(file)) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    }
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  };
  window.matchMedia = (media) => ({ matches: false, media, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
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
  window.Element.prototype.animate = function() {
    return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null, addEventListener() {} };
  };
  if (typeof config.setup === 'function') {
    config.setup(window);
  }
  const keys = trackListeners(window);
  const run = (source, file) => window.eval(`${source}\n//# sourceURL=${file}`);
  run(bundleScript('options-preload'), 'build/options-preload.js');
  window.LumnoOptionsReactBootstrap = { reactReady: false };
  run(reactEntryScript('src/react/options-islands.js'), 'src/react/options-islands.js');
  const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms === undefined ? 30 : ms));
  // The page bundle is a script the bootstrap adds once the React entry has
  // loaded, so React has rendered the islands by the time it runs.
  await settle(50);
  run(bundleScript('options'), 'build/options.js');
  await settle(80);

  const page = {
    window,
    document: window.document,
    errors,
    consoleErrors,
    messages,
    created,
    storage: { sync, local, session },
    storageChanged,
    runtimeMessages,
    keys,
    settle,
    byId: (id) => window.document.getElementById(id),
    // Sets a control's value and fires the events a user change fires.
    async choose(element, value) {
      if (element.type === 'checkbox') {
        element.checked = Boolean(value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
      await settle();
    },
    async click(element) {
      element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await settle();
    },
    // A Settings dropdown is a React island over a hidden <select>: opens its
    // menu and clicks the option with `value`, as a user does.
    async pick(selectId, value) {
      const trigger = window.document.querySelector(`[aria-controls="${selectId}_control_listbox"]`);
      if (!trigger) throw new Error(`no dropdown for ${selectId}`);
      await page.click(trigger);
      const option = window.document.querySelector(`#${selectId}_control_menu [role="option"][data-value="${value}"]`);
      if (!option) throw new Error(`${selectId} has no option ${value}`);
      option.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      await page.click(option);
    },
    // The values a dropdown's menu offers, with their labels.
    menuOptions(selectId) {
      return Array.from(window.document.querySelectorAll(`#${selectId}_control_menu [role="option"]`))
        .map((option) => ({ value: option.getAttribute('data-value'), label: option.textContent }));
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

module.exports = { EXTENSION_ORIGIN, createOptionsPage, reactEntryScript };
