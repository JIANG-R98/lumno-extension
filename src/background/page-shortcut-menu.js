(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoPageShortcutMenu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  // The page context menu item that adds the page it was opened on to the
  // New Tab shortcuts, saved the same way the New Tab saves one: browser sync
  // first, this device's overflow record for whatever does not fit.
  const MENU_ITEM_ID = 'lumno-add-page-shortcut';
  // Shortcuts hold http and https pages; browser pages never show the menu.
  const DOCUMENT_URL_PATTERNS = Object.freeze(['http://*/*', 'https://*/*']);
  const TOAST_FILES = Object.freeze(['src/shared/toast.js', 'src/content/page-shortcut-toast.js']);
  const MENU_TITLE_FALLBACK = 'Add to Lumno New Tab';

  function createController(options) {
    const opts = options || {};
    const chromeApi = opts.chrome || root.chrome;
    const settings = opts.settings || root.LumnoSettings;
    const store = opts.shortcuts || root.LumnoNewtabShortcutsStore;
    const siteDisplayName = opts.siteDisplayName || root.LumnoSiteDisplayName;
    const provider = opts.provider || settings.createProviderStorageRuntime(chromeApi);
    const loadLocaleMessages = typeof opts.loadLocaleMessages === 'function'
      ? opts.loadLocaleMessages
      : () => Promise.resolve({});
    const themeStorageKey = String(opts.themeStorageKey || '');
    const overflowKey = store.SHORTCUTS_LOCAL_OVERFLOW_KEY;
    let chain = Promise.resolve();

    function getLastError() {
      return chromeApi.runtime && chromeApi.runtime.lastError ? chromeApi.runtime.lastError : null;
    }

    function storage(area, method, value) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const done = (result) => {
          if (settled) return;
          settled = true;
          const error = getLastError();
          if (error) reject(new Error(error.message)); else resolve(result || {});
        };
        try {
          const request = area[method](value, done);
          if (request && request.then) request.then(done, reject);
        } catch (error) { reject(error); }
      });
    }

    async function readProviderValue(key) {
      await provider.ready;
      const values = await storage(provider.area, 'get', [key]).catch(() => ({}));
      return values[key];
    }

    async function getMessages() {
      const mode = await readProviderValue(settings.LANGUAGE_STORAGE_KEY);
      const uiLanguage = chromeApi.i18n && typeof chromeApi.i18n.getUILanguage === 'function'
        ? chromeApi.i18n.getUILanguage()
        : 'en';
      const locale = settings.normalizeLocale(!mode || mode === 'system' ? uiLanguage : mode);
      const messages = await loadLocaleMessages(locale);
      return messages && typeof messages === 'object' ? messages : {};
    }

    function translate(messages, key, fallback, params) {
      const entry = messages[key];
      let text = entry && entry.message ? String(entry.message) : fallback;
      Object.keys(params || {}).forEach((token) => {
        text = text.split(`{${token}}`).join(String(params[token]));
      });
      return text;
    }

    // Context menu items outlive the worker, so this updates the item and
    // creates it only when it is missing.
    async function syncMenu() {
      const menus = chromeApi.contextMenus;
      if (!menus) return;
      const messages = await getMessages().catch(() => ({}));
      const properties = {
        title: translate(messages, 'context_menu_add_page_shortcut', MENU_TITLE_FALLBACK),
        contexts: ['page'],
        documentUrlPatterns: DOCUMENT_URL_PATTERNS.slice()
      };
      await new Promise((resolve) => {
        menus.update(MENU_ITEM_ID, properties, () => {
          if (!getLastError()) {
            resolve();
            return;
          }
          menus.create({ id: MENU_ITEM_ID, ...properties }, () => {
            const error = getLastError();
            if (error) console.warn('[Lumno] Could not create the page shortcut menu item.', error.message);
            resolve();
          });
        });
      });
    }

    function getShortcutTitle(url, pageTitle, messages) {
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch (error) {
        host = '';
      }
      const name = siteDisplayName && typeof siteDisplayName.getSiteDisplayName === 'function'
        ? siteDisplayName.getSiteDisplayName(host, pageTitle, {
          getBrandName(brandHost, fallback) {
            if (brandHost === 'mp.weixin.qq.com') return translate(messages, 'site_brand_wechat_official', fallback);
            if (brandHost === 'weibo.com') return translate(messages, 'site_search_name_weibo', fallback);
            return fallback;
          }
        })
        : '';
      return name || pageTitle || host;
    }

    async function isWebDavSyncEnabled() {
      const key = settings.WEBDAV_STATUS_STORAGE_KEY;
      if (!key || !chromeApi.storage.local) return false;
      const values = await storage(chromeApi.storage.local, 'get', [key]).catch(() => ({}));
      return Boolean(values[key] && values[key].enabled === true);
    }

    // Adds the page to the end of the last group, as the New Tab does for a
    // site added from its context menus.
    async function addPage(page, messages) {
      await provider.ready;
      const sync = provider.getActiveAreaName() === 'sync';
      const values = await storage(provider.area, 'get', store.SHORTCUT_STORAGE_KEYS.slice());
      const local = sync ? await storage(chromeApi.storage.local, 'get', [overflowKey]) : {};
      const state = store.readShortcutState(values, local[overflowKey]);
      const shortcut = store.createShortcutRecord({
        title: getShortcutTitle(page.url, page.title, messages),
        url: page.url
      });
      if (!shortcut) return { status: 'invalid' };
      if (state.items.some((item) => item && item.url === shortcut.url)) return { status: 'exists' };
      if (state.items.length >= store.DEFAULT_MAX_SHORTCUTS) return { status: 'limit' };
      const groupId = state.groups.length ? state.groups[state.groups.length - 1].id : '';
      const nextState = {
        groups: state.groups,
        items: state.items.concat(groupId ? { ...shortcut, groupId } : shortcut),
        migratedAt: state.migratedAt
      };
      if (!sync) {
        await store.persistShortcutState(provider.area, nextState);
        return { status: 'added', localOnly: false };
      }
      const usage = store.measureShortcutSyncUsage(await storage(chromeApi.storage.sync, 'get', null));
      const result = await store.persistShortcutState(chromeApi.storage.sync, nextState, {
        overflowArea: chromeApi.storage.local,
        maxTotalBytes: store.getShortcutSyncBudget({ ...usage, quotaBytes: chromeApi.storage.sync.QUOTA_BYTES }),
        legacyKeysPresent: usage.legacyBytes > 0,
        getLastError
      });
      return { status: 'added', localOnly: result.localOnlyIds.includes(shortcut.id) };
    }

    async function describeResult(result, messages) {
      if (result.status === 'exists') {
        return { message: translate(messages, 'newtab_shortcuts_already_added', 'Already in shortcuts') };
      }
      if (result.status === 'limit') {
        return {
          message: translate(messages, 'newtab_shortcuts_limit_reached', 'You can add up to {count} shortcuts.', {
            count: store.DEFAULT_MAX_SHORTCUTS
          }),
          error: true
        };
      }
      if (result.status !== 'added') {
        return { message: translate(messages, 'toast_error', 'Action failed. Try again.'), error: true };
      }
      // With WebDAV on, a shortcut past the browser's sync space still
      // reaches other devices, so there is nothing to warn about.
      if (result.localOnly && !(await isWebDavSyncEnabled())) {
        return {
          message: translate(
            messages,
            'newtab_shortcuts_sync_limit_reached',
            'Shortcuts exceed the browser’s sync space, so new ones stay on this device. Turn on WebDAV in Settings to sync them too.'
          ),
          duration: 5200
        };
      }
      return { message: translate(messages, 'page_shortcut_added', 'Added to Lumno New Tab') };
    }

    // A page that does not take scripts (a store page, a PDF viewer) still
    // gets the shortcut; it just shows no confirmation.
    async function showToast(tabId, toast) {
      if (!chromeApi.scripting || typeof tabId !== 'number') return;
      const themeMode = themeStorageKey ? await readProviderValue(themeStorageKey) : '';
      try {
        await chromeApi.scripting.executeScript({ target: { tabId }, files: TOAST_FILES.slice() });
        await chromeApi.scripting.executeScript({
          target: { tabId },
          func: (message, toastOptions) => {
            const toastApi = window.__lumnoPageShortcutToast2026;
            return Boolean(toastApi && toastApi.show(message, toastOptions));
          },
          args: [toast.message, { error: toast.error === true, duration: toast.duration, themeMode: themeMode || 'system' }]
        });
      } catch (error) {
        // Nothing to report: the shortcut is saved either way.
      }
    }

    function handleClick(info, tab) {
      if (!info || info.menuItemId !== MENU_ITEM_ID) return Promise.resolve(null);
      const page = {
        url: String(info.pageUrl || (tab && tab.url) || ''),
        title: String((tab && tab.title) || '')
      };
      const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
      // One click at a time, so two quick adds both land.
      const job = chain.catch(() => {}).then(async () => {
        const messages = await getMessages().catch(() => ({}));
        const result = await addPage(page, messages).catch((error) => {
          console.warn('[Lumno] Could not add the page to shortcuts.', error);
          return { status: 'failed' };
        });
        await showToast(tabId, await describeResult(result, messages));
        return result;
      });
      chain = job;
      return job;
    }

    function start() {
      if (!chromeApi.contextMenus) return;
      chromeApi.contextMenus.onClicked.addListener((info, tab) => {
        handleClick(info, tab);
      });
      chromeApi.storage.onChanged.addListener((changes, area) => {
        if (changes[settings.LOCAL_PRIMARY_STORAGE_KEY] ||
            (provider.isActiveAreaName(area) && changes[settings.LANGUAGE_STORAGE_KEY])) {
          syncMenu().catch(() => {});
        }
      });
      syncMenu().catch(() => {});
    }

    return { start, syncMenu, handleClick };
  }

  return Object.freeze({ MENU_ITEM_ID, DOCUMENT_URL_PATTERNS, createController });
});
