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
  const DEFAULT_UPDATE_TITLE = 'Update the Tracked Card to This Page';
  const DEFAULT_ADD_TITLE = 'Pin and Track This Page';
  const DEFAULT_LIMIT_TITLE = 'Pin and Track This Page (3-Pin Limit Reached)';
  const DEFAULT_CURRENT_TITLE = 'This Page Is Already the Tracked Link';
  const DEFAULT_ALREADY_TRACKED_TITLE = 'This Page Is Already Pinned and Tracked';

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
      info && info.pageUrl,
      tab && tab.url,
      tab && tab.pendingUrl
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
      return {
        changed: false,
        reason: 'invalid-url',
        items: Array.isArray(items) ? items.slice() : []
      };
    }
    const storeOptions = config.storeOptions && typeof config.storeOptions === 'object'
      ? config.storeOptions
      : {};
    const normalizedItems = recentStore.normalizePinnedRecentSites(items, storeOptions);
    const currentHost = recentStore.getRecentSiteHostKey({ url: normalizedUrl }, storeOptions);
    const sourceUrl = getHttpUrl(config.sourceUrl);
    const targetIndex = sourceUrl
      ? normalizedItems.findIndex((item) =>
        item.trackingEnabled === true && getHttpUrl(item.url) === sourceUrl
      )
      : -1;
    if (!currentHost) {
      return { changed: false, reason: 'invalid-url', items: normalizedItems };
    }
    if (targetIndex < 0) {
      const reason = sourceUrl
        ? 'source-not-found'
        : 'no-tracked-target';
      return { changed: false, reason, items: normalizedItems };
    }
    if (normalizedItems[targetIndex].url === normalizedUrl) {
      return { changed: false, reason: 'same-url', items: normalizedItems };
    }
    const now = typeof config.now === 'function' ? config.now() : Date.now();
    const currentTitle = String(config.currentTitle || '').replace(/\s+/g, ' ').trim();
    const nextItems = normalizedItems.slice();
    const previousItem = normalizedItems[targetIndex];
    const updateHistory = [{
      title: previousItem.title,
      url: previousItem.url,
      host: previousItem.host,
      siteName: previousItem.siteName,
      lastVisitTime: previousItem.lastVisitTime,
      visitCount: previousItem.visitCount,
      updatedAt: Math.max(0, Number(now) || 0)
    }].concat(Array.isArray(previousItem.updateHistory) ? previousItem.updateHistory : []);
    nextItems[targetIndex] = {
      ...previousItem,
      title: currentTitle || previousItem.title,
      url: normalizedUrl,
      host: currentHost,
      lastVisitTime: Math.max(0, Number(now) || 0),
      updatePending: true,
      updateHistory
    };
    return {
      changed: true,
      reason: 'updated',
      index: targetIndex,
      previousItem,
      items: recentStore.normalizePinnedRecentSites(nextItems, storeOptions)
    };
  }

  function addPinnedTrackedCurrent(items, currentUrl, options) {
    const config = options && typeof options === 'object' ? options : {};
    const recentStore = config.recentStore || {};
    const normalizedUrl = getHttpUrl(currentUrl);
    if (!normalizedUrl ||
        typeof recentStore.normalizePinnedRecentSites !== 'function' ||
        typeof recentStore.getRecentSiteHostKey !== 'function') {
      return {
        changed: false,
        reason: 'invalid-url',
        items: Array.isArray(items) ? items.slice() : []
      };
    }
    const storeOptions = config.storeOptions && typeof config.storeOptions === 'object'
      ? config.storeOptions
      : {};
    const normalizedItems = recentStore.normalizePinnedRecentSites(items, storeOptions);
    const currentHost = recentStore.getRecentSiteHostKey({ url: normalizedUrl }, storeOptions);
    if (!currentHost) {
      return { changed: false, reason: 'invalid-url', items: normalizedItems };
    }
    const exactIndex = normalizedItems.findIndex((item) => getHttpUrl(item.url) === normalizedUrl);
    if (exactIndex >= 0 && normalizedItems[exactIndex].trackingEnabled === true) {
      return {
        changed: false,
        reason: 'already-tracked',
        index: exactIndex,
        items: normalizedItems
      };
    }
    const maxPinned = Number.isFinite(Number(storeOptions.maxPinned))
      ? Math.max(0, Number(storeOptions.maxPinned))
      : Number(recentStore.DEFAULT_MAX_PINNED) || 3;
    if (exactIndex < 0 && normalizedItems.length >= maxPinned) {
      return { changed: false, reason: 'pin-limit', items: normalizedItems };
    }
    const now = typeof config.now === 'function' ? config.now() : Date.now();
    const currentTitle = String(config.currentTitle || '').replace(/\s+/g, ' ').trim();
    if (exactIndex >= 0) {
      const nextItems = normalizedItems.slice();
      nextItems[exactIndex] = {
        ...nextItems[exactIndex],
        title: currentTitle || nextItems[exactIndex].title,
        lastVisitTime: Math.max(0, Number(now) || 0),
        trackingEnabled: true
      };
      return {
        changed: true,
        reason: 'tracking-enabled',
        index: exactIndex,
        items: recentStore.normalizePinnedRecentSites(nextItems, storeOptions)
      };
    }
    const nextItems = recentStore.normalizePinnedRecentSites([{
      title: currentTitle || currentHost,
      url: normalizedUrl,
      host: currentHost,
      lastVisitTime: Math.max(0, Number(now) || 0),
      pinnedAt: Math.max(0, Number(now) || 0),
      trackingEnabled: true,
      updatePending: false
    }].concat(normalizedItems), storeOptions);
    return {
      changed: true,
      reason: 'added',
      index: 0,
      items: nextItems
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
    const tabs = chromeApi && chromeApi.tabs ? chromeApi.tabs : null;
    const storageChanges = chromeApi && chromeApi.storage ? chromeApi.storage.onChanged : null;
    const recentStore = config.recentStore || {};
    const storage = config.storage || null;
    const storageKey = String(config.storageKey || DEFAULT_STORAGE_KEY);
    const trackingSourceByTabId = new Map();
    let cachedItems = [];
    let itemsLoaded = false;
    let attached = false;

    function rememberTrackingSource(tabId, url) {
      const normalizedTabId = Number(tabId);
      const normalizedUrl = getHttpUrl(url);
      if (!Number.isInteger(normalizedTabId) || normalizedTabId < 0 || !normalizedUrl) {
        return false;
      }
      trackingSourceByTabId.set(normalizedTabId, normalizedUrl);
      return true;
    }

    function remapTrackingSourcesFromPinnedChange(change) {
      const oldItems = recentStore.normalizePinnedRecentSites(
        change && change.oldValue,
        config.storeOptions || {}
      );
      const newItems = recentStore.normalizePinnedRecentSites(
        change && change.newValue,
        config.storeOptions || {}
      );
      oldItems.forEach((oldItem, oldIndex) => {
        if (!oldItem) return;
        const nextItem = (oldItem.pinnedAt
          ? newItems.find((item) =>
            item && item.trackingEnabled === true && item.pinnedAt === oldItem.pinnedAt
          )
          : newItems[oldIndex] && newItems[oldIndex].trackingEnabled === true
            ? newItems[oldIndex]
            : null);
        const oldUrl = getHttpUrl(oldItem.url);
        const nextUrl = getHttpUrl(nextItem && nextItem.url);
        if (!oldUrl || !nextUrl || oldUrl === nextUrl) return;
        trackingSourceByTabId.forEach((sourceUrl, tabId) => {
          if (sourceUrl !== oldUrl) return;
          trackingSourceByTabId.set(tabId, nextUrl);
        });
      });
    }

    function getTitle(key, fallback) {
      const localized = chromeApi && chromeApi.i18n &&
        typeof chromeApi.i18n.getMessage === 'function'
        ? chromeApi.i18n.getMessage(key)
        : '';
      return String(localized || fallback);
    }

    function getUpdateTitle() {
      return getTitle('recent_replace_pinned_url_with_current', DEFAULT_UPDATE_TITLE);
    }

    function getAddTitle() {
      return getTitle('recent_pin_and_track_current_page', DEFAULT_ADD_TITLE);
    }

    function getLimitTitle() {
      return getTitle('recent_pin_and_track_current_page_limit', DEFAULT_LIMIT_TITLE);
    }

    function getCurrentTitle() {
      return getTitle('recent_tracked_page_is_current', DEFAULT_CURRENT_TITLE);
    }

    function getAlreadyTrackedTitle() {
      return getTitle('recent_current_page_already_pinned_tracked', DEFAULT_ALREADY_TRACKED_TITLE);
    }

    function loadItems() {
      return storageGet(storage, storageKey, runtime).then((result) => {
        if (!result) throw new Error('Unable to load pinned recent sites.');
        cachedItems = Array.isArray(result[storageKey]) ? result[storageKey] : [];
        itemsLoaded = true;
        return cachedItems;
      });
    }

    function getReplacement(items, tab, info) {
      if (!tab || tab.incognito === true) {
        return {
          changed: false,
          reason: 'unavailable-tab',
          items: Array.isArray(items) ? items.slice() : []
        };
      }
      return replacePinnedUrlWithCurrent(items, getTabUrl(tab, info), {
        recentStore,
        storeOptions: config.storeOptions,
        now: config.now,
        currentTitle: tab && tab.title,
        sourceUrl: tab && trackingSourceByTabId.get(Number(tab.id))
      });
    }

    function getAddition(items, tab, info) {
      if (!tab || tab.incognito === true) {
        return {
          changed: false,
          reason: 'unavailable-tab',
          items: Array.isArray(items) ? items.slice() : []
        };
      }
      return addPinnedTrackedCurrent(items, getTabUrl(tab, info), {
        recentStore,
        storeOptions: config.storeOptions,
        now: config.now,
        currentTitle: tab && tab.title
      });
    }

    function getAction(items, tab, info) {
      const replacement = getReplacement(items, tab, info);
      if (replacement.changed ||
          (replacement.reason !== 'no-tracked-target' && replacement.reason !== 'source-not-found')) {
        return { kind: 'update', result: replacement };
      }
      return { kind: 'add', result: getAddition(items, tab, info) };
    }

    function updateMenuState(state) {
      return new Promise((resolve) => {
        if (!menus || typeof menus.update !== 'function') {
          resolve(false);
          return;
        }
        menus.update(MENU_ID, state, () => {
          resolve(!getRuntimeError(runtime));
        });
      });
    }

    function refreshMenuForTab(tab) {
      const action = itemsLoaded ? getAction(cachedItems, tab, null) : null;
      const reason = action && action.result ? action.result.reason : '';
      let title = getAddTitle();
      if (action && action.kind === 'update') {
        title = reason === 'same-url' ? getCurrentTitle() : getUpdateTitle();
      } else if (reason === 'pin-limit') {
        title = getLimitTitle();
      } else if (reason === 'already-tracked') {
        title = getAlreadyTrackedTitle();
      }
      const enabled = Boolean(action && action.result && action.result.changed);
      return updateMenuState({ title, enabled }).then(() => enabled);
    }

    function refreshMenuForActiveTab() {
      return new Promise((resolve) => {
        if (!tabs || typeof tabs.query !== 'function') {
          resolve(false);
          return;
        }
        tabs.query({ active: true, lastFocusedWindow: true }, (activeTabs) => {
          if (getRuntimeError(runtime)) {
            resolve(false);
            return;
          }
          const activeTab = Array.isArray(activeTabs) ? activeTabs[0] : null;
          Promise.resolve(refreshMenuForTab(activeTab)).then(resolve);
        });
      });
    }

    function notifyFeedback(tab, result) {
      const tabId = Number(tab && tab.id);
      if (!Number.isInteger(tabId) || !tabs || typeof tabs.sendMessage !== 'function') return;
      tabs.sendMessage(tabId, {
        action: 'showPinnedRecentUpdateFeedback',
        ok: Boolean(result && result.changed),
        reason: String(result && result.reason || 'save-failed')
      }, () => {
        if (runtime) void runtime.lastError;
      });
    }

    function requestUpdatePreview(tab, replacement) {
      return new Promise((resolve) => {
        const tabId = Number(tab && tab.id);
        const nextItem = replacement && replacement.items && replacement.items[replacement.index];
        if (!Number.isInteger(tabId) || !tabs || typeof tabs.sendMessage !== 'function' ||
            !replacement || !replacement.previousItem || !nextItem) {
          resolve(false);
          return;
        }
        tabs.sendMessage(tabId, {
          action: 'showPinnedRecentUpdatePreview',
          previous: {
            title: replacement.previousItem.title,
            url: replacement.previousItem.url
          },
          current: {
            title: nextItem.title,
            url: nextItem.url
          }
        }, (response) => {
          resolve(Boolean(!getRuntimeError(runtime) && response && response.confirmed === true));
        });
      });
    }

    function replaceForTab(tab, info) {
      return loadItems().then((items) => {
        const replacement = getReplacement(items, tab, info);
        if (!replacement.changed) return replacement;
        return storageSet(storage, { [storageKey]: replacement.items }, runtime).then((saved) => {
          if (saved && Number.isInteger(Number(tab && tab.id))) {
            const previousSource = trackingSourceByTabId.get(Number(tab.id));
            const replacementItem = replacement.items[replacement.index];
            const nextSource = getHttpUrl(replacementItem && replacementItem.url);
            if (nextSource) {
              trackingSourceByTabId.forEach((value, tabId) => {
                if (tabId === Number(tab.id) || (previousSource && value === previousSource)) {
                  trackingSourceByTabId.set(tabId, nextSource);
                }
              });
            }
          }
          if (saved) cachedItems = replacement.items;
          return {
            ...replacement,
            changed: Boolean(saved),
            reason: saved ? 'updated' : 'save-failed'
          };
        });
      });
    }

    function addForTab(tab, info) {
      return loadItems().then((items) => {
        const addition = getAddition(items, tab, info);
        if (!addition.changed) return addition;
        return storageSet(storage, { [storageKey]: addition.items }, runtime).then((saved) => {
          if (saved) {
            cachedItems = addition.items;
            const tabId = Number(tab && tab.id);
            const addedItem = addition.items[addition.index];
            if (Number.isInteger(tabId) && addedItem && addedItem.url) {
              rememberTrackingSource(tabId, addedItem.url);
            }
          }
          return {
            ...addition,
            changed: Boolean(saved),
            reason: saved ? addition.reason : 'save-failed'
          };
        });
      });
    }

    function applyForTab(tab, info) {
      return loadItems().then((items) => getAction(items, tab, info)).then((action) => {
        if (action.kind === 'update') return replaceForTab(tab, info);
        return addForTab(tab, info);
      });
    }

    function confirmAndApplyForTab(tab, info) {
      return loadItems().then((items) => getAction(items, tab, info)).then((action) => {
        if (action.kind !== 'update' || !action.result.changed) {
          return applyForTab(tab, info);
        }
        return requestUpdatePreview(tab, action.result).then((confirmed) => {
          if (!confirmed) {
            return { ...action.result, changed: false, reason: 'cancelled' };
          }
          return applyForTab(tab, info);
        });
      });
    }

    function createMenu() {
      if (!menus || typeof menus.create !== 'function') return;
      const properties = {
        title: getAddTitle(),
        contexts: ['all'],
        documentUrlPatterns: ['http://*/*', 'https://*/*'],
        enabled: false
      };
      menus.create({ id: MENU_ID, ...properties }, () => {
        if (chromeApi && chromeApi.runtime) void chromeApi.runtime.lastError;
        if (typeof menus.update !== 'function') return;
        menus.update(MENU_ID, properties, () => {
          if (chromeApi && chromeApi.runtime) void chromeApi.runtime.lastError;
        });
      });
    }

    function attach() {
      if (attached || !menus) return false;
      attached = true;
      createMenu();
      if (menus.onClicked && typeof menus.onClicked.addListener === 'function') {
        menus.onClicked.addListener((info, tab) => {
          if (!info || info.menuItemId !== MENU_ID) return;
          return confirmAndApplyForTab(tab, info).then((result) => {
            if (!result || result.reason !== 'cancelled') notifyFeedback(tab, result);
            void refreshMenuForTab(tab);
            return result;
          }).catch(() => {
            notifyFeedback(tab, { changed: false, reason: 'save-failed' });
          });
        });
      }
      if (runtime && runtime.onMessage && typeof runtime.onMessage.addListener === 'function') {
        runtime.onMessage.addListener((message, sender) => {
          if (!message || message.action !== 'rememberPinnedRecentTrackingTarget') return;
          if (rememberTrackingSource(sender && sender.tab && sender.tab.id, message.url)) {
            void refreshMenuForTab(sender && sender.tab);
          }
        });
      }
      if (tabs && tabs.onCreated && typeof tabs.onCreated.addListener === 'function') {
        tabs.onCreated.addListener((tab) => {
          const openerTabId = Number(tab && tab.openerTabId);
          if (!Number.isInteger(openerTabId)) return;
          const sourceUrl = trackingSourceByTabId.get(openerTabId);
          if (sourceUrl) {
            rememberTrackingSource(tab && tab.id, sourceUrl);
            if (tab && tab.active) void refreshMenuForActiveTab();
          }
        });
      }
      if (tabs && tabs.onActivated && typeof tabs.onActivated.addListener === 'function') {
        tabs.onActivated.addListener(() => {
          void refreshMenuForActiveTab();
        });
      }
      if (tabs && tabs.onUpdated && typeof tabs.onUpdated.addListener === 'function') {
        tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
          if (!tab || !tab.active || (!changeInfo.url && !changeInfo.status && !changeInfo.title)) return;
          void refreshMenuForActiveTab();
        });
      }
      if (tabs && tabs.onRemoved && typeof tabs.onRemoved.addListener === 'function') {
        tabs.onRemoved.addListener((tabId) => {
          trackingSourceByTabId.delete(Number(tabId));
        });
      }
      if (storageChanges && typeof storageChanges.addListener === 'function') {
        storageChanges.addListener((changes) => {
          if (!changes || !changes[storageKey]) return;
          remapTrackingSourcesFromPinnedChange(changes[storageKey]);
          void loadItems().then(refreshMenuForActiveTab).catch(() => {});
        });
      }
      void loadItems().then(refreshMenuForActiveTab).catch(() => {});
      return true;
    }

    return Object.freeze({
      attach,
      replaceForTab,
      addForTab,
      applyForTab,
      confirmAndApplyForTab
    });
  }

  return Object.freeze({
    DEFAULT_STORAGE_KEY,
    MENU_ID,
    createPinnedRecentContextMenuController,
    addPinnedTrackedCurrent,
    getHttpUrl,
    replacePinnedUrlWithCurrent
  });
});
