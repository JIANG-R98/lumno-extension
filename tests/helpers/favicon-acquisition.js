'use strict';

// Shortcut icon acquisition as the extension runs it: the background worker
// answering getShortcutFaviconData over a fake network, and a New Tab whose
// shortcut asks it for an icon, keeps a snapshot and edits it in the
// shortcut editor.

const settings = require('../../src/domain/settings/index.ts');
const faviconCache = require('../../src/domain/favicon/favicon-cache.ts');
const faviconUtils = require('../../src/domain/favicon/favicon-utils.ts');
const { loadBackground } = require('./background-harness');
const { createNewtabPage } = require('./newtab-page');
const { newtabShortcutFaviconCache } = require('../../src/domain/settings/newtab-shortcuts.ts');

const EXTENSION_ORIGIN = 'chrome-extension://lumno-test';

// A PNG header for a square image of `width`, told apart by `marker`.
function png(width, marker = 1) {
  const buffer = Buffer.alloc(25);
  buffer.set([137, 80, 78, 71, 13, 10, 26, 10]);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(width, 20);
  buffer[24] = marker;
  return buffer;
}

// The background worker over a network that answers the browser's favicon
// endpoint with `browserImage` and the icon services with `proxyImage`
// (per page with `pageImages`), or fails or hangs them (`proxyMode`).
// `enhanced: false` turns off enhanced fetching; `excluded` adds the page's
// host to the favicon request exclusions. `firefox` runs it as Firefox,
// with { tabs, topSites, images }.
function createAcquisition(options = {}) {
  const state = {
    browserImage: options.browserImage === undefined ? png(32, 2) : options.browserImage,
    proxyImage: options.proxyImage === undefined ? png(128, 3) : options.proxyImage,
    proxyMode: options.proxyMode || 'ok',
    pageImages: options.pageImages || {},
    calls: []
  };
  const placeholderImage = options.placeholderImage || png(16, 0);
  const firefox = options.firefox || null;
  const sync = { [settings.faviconEnhancedFetchEnabled.key]: options.enhanced !== false };
  if (options.excluded) {
    sync[settings.faviconRequestBlacklist.key] = [{ pattern: options.excluded === true ? 'chrome.com' : options.excluded, matchModes: ['suffix'] }];
  }
  const answer = (callback, value) => {
    if (typeof callback === 'function') {
      setTimeout(() => callback(value), 0);
      return undefined;
    }
    return Promise.resolve(value);
  };
  const worker = loadBackground({
    extensionUrls: true,
    sync,
    configureChrome(chromeApi) {
      if (!firefox) return;
      chromeApi.runtime.getURL = (resource) => `moz-extension://lumno-test/${String(resource || '').replace(/^\//, '')}`;
      chromeApi.tabs.query = (_info, callback) => answer(callback, firefox.tabs || []);
      chromeApi.topSites.get = (callback) => answer(callback, firefox.topSites || []);
    },
    fetch: async (url, requestOptions) => {
      const resource = String(url);
      if (resource.startsWith(`${EXTENSION_ORIGIN}/_locales/`) || resource.endsWith('.json')) {
        throw new Error('offline');
      }
      state.calls.push({ url: resource, options: requestOptions || {} });
      if (firefox) {
        const image = (firefox.images || {})[resource];
        return { ok: Boolean(image), url: resource, headers: { get: () => '' }, blob: async () => new Blob([image || ''], { type: 'image/png' }) };
      }
      const parsed = new URL(resource);
      const isBrowser = parsed.protocol === 'chrome-extension:';
      if (!isBrowser && state.proxyMode === 'timeout') {
        return new Promise((_resolve, reject) => {
          requestOptions.signal.addEventListener('abort', () => reject(new Error('proxy timeout')), { once: true });
        });
      }
      if (!isBrowser && state.proxyMode === 'error') throw new Error('proxy unavailable');
      const page = faviconUtils.getPageUrlFromFaviconProxyUrl(resource);
      const perPageImage = state.pageImages[page];
      const image = page.includes('lumno.invalid') ? placeholderImage : (perPageImage
        ? perPageImage[isBrowser ? 'browser' : 'proxy'] : (isBrowser ? state.browserImage : state.proxyImage));
      return { ok: Boolean(image), url: resource, headers: { get: () => '' }, blob: async () => new Blob([image || ''], { type: 'image/png' }) };
    }
  });
  return {
    state,
    worker,
    // The worker's answer to New Tab asking for `pageUrl`'s icon, or null.
    async fetchShortcutFaviconData(pageUrl, refresh, iconSource) {
      const request = { action: 'getShortcutFaviconData', pageUrl };
      if (refresh) request.refresh = true;
      if (iconSource) request.iconSource = iconSource;
      const response = await worker.sendMessage(request, undefined, 20000);
      return response && response.data ? response : null;
    }
  };
}

const SNAPSHOT_KEY = newtabShortcutFaviconCache.key;
const PERSISTED_DATA_KEY = faviconCache.DEFAULTS.faviconDataPersistStorageKey;

// A New Tab with one shortcut to `pageUrl` (stored with `iconSource`) that
// asks `acquisition` for its icon. `initialSnapshots` seeds the shortcut icon
// cache, `persistedEntries` the page favicon cache; `holdFaviconCache`
// keeps the page favicon cache read waiting until release() is called.
async function openFrontend(acquisition, pageUrl, options = {}) {
  let releaseCache = null;
  const shortcut = Object.assign({ url: pageUrl, title: 'Example' }, options.iconSource ? { iconSource: options.iconSource } : {});
  const local = {};
  if (options.initialSnapshots) local[SNAPSHOT_KEY] = options.initialSnapshots;
  if (options.persistedEntries) local[PERSISTED_DATA_KEY] = { version: 3, entries: options.persistedEntries };
  const page = await createNewtabPage({
    shortcuts: [shortcut],
    local,
    respond: (message) => (message.action === 'getShortcutFaviconData' ? acquisition.worker.sendMessage(message, undefined, 20000) : undefined),
    setup(window) {
      if (!options.holdFaviconCache) return;
      const area = window.chrome.storage.local;
      const get = area.get.bind(area);
      area.get = (keys, callback) => {
        const list = Array.isArray(keys) ? keys : [keys];
        if (!list.includes(PERSISTED_DATA_KEY)) return get(keys, callback);
        return new Promise((resolve) => {
          releaseCache = () => resolve(get(keys, callback));
        });
      };
    }
  });
  await page.settle(options.holdFaviconCache ? 200 : 900);
  const doc = page.document;
  const tile = () => doc.querySelector('.x-nt-shortcut-tile[aria-label="Open Example"]');
  const click = (element) => element.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  const dialog = () => doc.querySelector('.x-nt-shortcut-dialog-backdrop');
  const frontend = {
    page,
    release: async () => {
      if (releaseCache) releaseCache();
      await page.settle(900);
    },
    // The icon requests New Tab sent the worker.
    messages: () => page.messages.filter((message) => message.action === 'getShortcutFaviconData'),
    writes: () => page.storage.local.writes.filter((write) => Object.hasOwn(write, SNAPSHOT_KEY)).length,
    snapshots: () => page.storage.local.data[SNAPSHOT_KEY] || {},
    // The saved icon the tile shows (a data: URL), or ''.
    tileIcon() {
      const image = tile() && tile().querySelector('img');
      const src = image ? image.getAttribute('src') || '' : '';
      return src.startsWith('data:') ? src : '';
    },
    async removeShortcut(storage) {
      Object.entries(storage).forEach(([key, value]) => page.changeStorage('sync', key, value));
      await page.settle(100);
    },
    async openEditor() {
      tile().dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20, button: 2 }));
      await page.settle(150);
      const option = doc.querySelector('#_x_extension_newtab_shortcut_context_menu_2026_unique__menu [role="menuitem"][data-value="edit"]');
      option.dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      click(option);
      await page.settle(400);
    },
    // The editor's selected icon source.
    editorSource: () => dialog().querySelector('.x-nt-shortcut-icon-source-select select').value,
    editorSources: () => Array.from(dialog().querySelectorAll('.x-nt-shortcut-icon-source-select select option')).map((option) => option.value),
    // The icon the editor previews, or ''.
    editorIcon() {
      const image = dialog().querySelector('.x-nt-shortcut-icon-panel img');
      return image ? image.getAttribute('src') || '' : '';
    },
    async chooseSource(source) {
      const trigger = dialog().querySelector('.x-nt-shortcut-icon-source-select button');
      if (trigger.getAttribute('aria-expanded') !== 'true') click(trigger);
      await page.settle(50);
      const option = doc.querySelector(`#_x_extension_newtab_shortcut_dialog_2026_unique__icon_source_menu [role="option"][data-value="${source}"]`) ||
        doc.querySelector(`[role="option"][data-value="${source}"]`);
      option.dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      click(option);
      await page.settle(300);
    },
    async refresh() {
      click(dialog().querySelector('.x-nt-shortcut-icon-refresh'));
      await page.settle(900);
    },
    async setUrl(url) {
      const input = dialog().querySelector('input[inputmode="url"]');
      Object.getOwnPropertyDescriptor(page.window.HTMLInputElement.prototype, 'value').set.call(input, url);
      input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
      await page.settle(100);
    },
    // Saves the editor; with `failing`, the shortcut write fails.
    async save(failing) {
      [page.storage.sync, page.storage.local].forEach((area) => {
        if (failing) {
          area.__set = area.__set || area.set;
          area.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
        } else if (area.__set) {
          area.set = area.__set;
        }
      });
      dialog().querySelector('form').dispatchEvent(new page.window.Event('submit', { bubbles: true, cancelable: true }));
      await page.settle(500);
      return !dialog() || dialog().getAttribute('data-open') === 'false' || dialog().hidden;
    },
    editorOpen: () => Boolean(dialog()) && dialog().getAttribute('data-open') !== 'false' && !dialog().hidden,
    close: () => page.close()
  };
  return frontend;
}

module.exports = { EXTENSION_ORIGIN, createAcquisition, openFrontend, png };
