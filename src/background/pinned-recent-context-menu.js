(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoPinnedRecentContextMenu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const MENU_ID = '_x_extension_replace_pinned_url_with_current_2026_unique_';
  const DEFAULT_STORAGE_KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';
  const DEFAULT_TITLE = 'Replace Pinned URL with Current';

  function getHttpUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') ||
          url.username || url.password) {
        return '';
      }
      return url.toString();
    } catch (error) {
      return '';
    }
  }

  function getTabUrl(tab, info) {
    const candidates = [
      tab && tab.url,
      tab && tab.pendingUrl,
      info && info.pageUrl
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      const url = getHttpUrl(candidates[index]);
      if (url) return url;
    }
    return '';
  }

  function replacePinnedUrlWithCurrent(items, currentUrl, options) {
    const config = options && typeof options === 'object' ? options : {};
    const recentStore = config.recentStore || {};
    const normalizedUrl = getHttpUrl(currentUrl);
    if (!normalizedUrl ||
        typeof recentStore.normalizePinnedRecentSites !== 'function' ||
        typeof recentStore.getRecentSiteHostKey !== 'function') {
      return { changed: false, items: Array.isArray(items) ? items.slice() : [] };
    }
    const storeOptions = config.storeOptions && typeof config.storeOptions === 'object'
      ? config.storeOptions
      : {};
    const normalizedItems = recentStore.normalizePinnedRecentSites(items, storeOptions);
    const currentHost = recentStore.getRecentSiteHostKey({ url: normalizedUrl }, storeOptions);
    const targetIndex = normalizedItems.findIndex((item) =>
      item.trackingEnabled === true &&
      recentStore.getRecentSiteHostKey(item, storeOptions) === currentHost
    );
    if (!currentHost || targetIndex < 0 || normalizedItems[targetIndex].url === normalizedUrl) {
      return { changed: false, items: normalizedItems };
    }
    const now = typeof config.now === 'function' ? config.now() : Date.now();
    const nextItems = normalizedItems.slice();
    nextItems[targetIndex] = {
      ...nextItems[targetIndex],
      url: normalizedUrl,
      host: currentHost,
      lastVisitTime: Math.max(0, Number(now) || 0)
    };
    return {
      changed: true,
      index: targetIndex,
      items: recentStore.normalizePinnedRecentSites(nextItems, storeOptions)
    };
  }

  function getRuntimeError(runtime) {
    return runtime && runtime.lastError ? runtime.lastError : null;
  }

  function storageGet(storage, key, runtime) {
    return new Promise((resolve) => {
      if (!storage || typeof storage.get !== 'function') {
        resolve({});
        return;
      }
      storage.get([key], (result) => {
        resolve(getRuntimeError(runtime) ? null : (result || {}));
      });
    });
  }

  function storageSet(storage, value, runtime) {
    return new Promise((resolve) => {
      if (!storage || typeof storage.set !== 'function') {
        resolve(false);
        return;
      }
      storage.set(value, () => resolve(!getRuntimeError(runtime)));
    });
  }

  function createPinnedRecentContextMenuController(options) {
    const config = options && typeof options === 'object' ? options : {};
    const chromeApi = config.chromeApi || null;
    const menus = chromeApi && chromeApi.contextMenus ? chromeApi.contextMenus : null;
    const runtime = chromeApi && chromeApi.runtime ? chromeApi.runtime : null;
    const recentStore = config.recentStore || {};
    const storage = config.storage || null;
    const storageKey = String(config.storageKey || DEFAULT_STORAGE_KEY);
    let attached = false;

    function getTitle() {
      const localized = chromeApi && chromeApi.i18n &&
        typeof chromeApi.i18n.getMessage === 'function'
        ? chromeApi.i18n.getMessage('recent_replace_pinned_url_with_current')
        : '';
      return String(localized || DEFAULT_TITLE);
    }

    function loadItems() {
      return storageGet(storage, storageKey, runtime).then((result) => {
        if (!result) throw new Error('Unable to load pinned recent sites.');
        return Array.isArray(result[storageKey]) ? result[storageKey] : [];
      });
    }

    function getReplacement(items, tab, info) {
      if (!tab || tab.incognito === true) {
        return { changed: false, items: Array.isArray(items) ? items.slice() : [] };
      }
      return replacePinnedUrlWithCurrent(items, getTabUrl(tab, info), {
        recentStore,
        storeOptions: config.storeOptions,
        now: config.now
      });
    }

    function refreshForTab(tab, info) {
      return loadItems().then((items) => {
        const enabled = getReplacement(items, tab, info).changed;
        return new Promise((resolve) => {
          if (!menus || typeof menus.update !== 'function') {
            resolve(enabled);
            return;
          }
          menus.update(MENU_ID, { enabled }, () => {
            const updated = !getRuntimeError(runtime);
            if (updated && typeof menus.refresh === 'function') menus.refresh();
            resolve(updated && enabled);
          });
        });
      });
    }

    function replaceForTab(tab, info) {
      return loadItems().then((items) => {
        const replacement = getReplacement(items, tab, info);
        if (!replacement.changed) return replacement;
        return storageSet(storage, { [storageKey]: replacement.items }, runtime).then((saved) => ({
          ...replacement,
          changed: Boolean(saved)
        }));
      });
    }

    function createMenu() {
      if (!menus || typeof menus.create !== 'function') return;
      menus.create({
        id: MENU_ID,
        title: getTitle(),
        contexts: ['all'],
        documentUrlPatterns: ['http://*/*', 'https://*/*'],
        enabled: false
      }, () => {
        if (chromeApi && chromeApi.runtime) void chromeApi.runtime.lastError;
      });
    }

    function attach() {
      if (attached || !menus) return false;
      attached = true;
      createMenu();
      if (menus.onShown && typeof menus.onShown.addListener === 'function') {
        menus.onShown.addListener((info, tab) => {
          refreshForTab(tab, info).catch(() => {});
        });
      }
      if (menus.onClicked && typeof menus.onClicked.addListener === 'function') {
        menus.onClicked.addListener((info, tab) => {
          if (!info || info.menuItemId !== MENU_ID) return;
          replaceForTab(tab, info).catch(() => {});
        });
      }
      return true;
    }

    return Object.freeze({ attach, refreshForTab, replaceForTab });
  }

  return Object.freeze({
    DEFAULT_STORAGE_KEY,
    MENU_ID,
    createPinnedRecentContextMenuController,
    getHttpUrl,
    replacePinnedUrlWithCurrent
  });
});
