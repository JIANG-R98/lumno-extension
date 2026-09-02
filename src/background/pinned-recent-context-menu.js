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
  const TRACKING_SESSION_STORAGE_KEY = '_x_extension_pinned_recent_tracking_tabs_2026_unique_';
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
    const sourceCardId = typeof recentStore.normalizePinnedRecentCardId === 'function'
      ? recentStore.normalizePinnedRecentCardId(config.sourceCardId)
      : String(config.sourceCardId || '').trim();
    const sourceUrl = getHttpUrl(config.sourceUrl);
    const targetIndex = sourceCardId
      ? normalizedItems.findIndex((item) =>
        item.trackingEnabled === true && item.cardId === sourceCardId
      )
      : (sourceUrl
        ? normalizedItems.findIndex((item) =>
          item.trackingEnabled === true && getHttpUrl(item.url) === sourceUrl
        )
        : -1);
    if (!currentHost) {
      return { changed: false, reason: 'invalid-url', items: normalizedItems };
    }
    if (targetIndex < 0) {
      const reason = sourceCardId || sourceUrl
        ? 'source-not-found'
        : 'no-tracked-target';
      return { changed: false, reason, items: normalizedItems };
    }
    if (recentStore.getRecentSiteHostKey(normalizedItems[targetIndex], storeOptions) !== currentHost) {
      return { changed: false, reason: 'host-mismatch', items: normalizedItems };
    }
    if (normalizedItems[targetIndex].url === normalizedUrl) {
      return { changed: false, reason: 'same-url', items: normalizedItems };
    }
    const conflictingIndex = normalizedItems.findIndex((item, index) =>
      index !== targetIndex && getHttpUrl(item && item.url) === normalizedUrl
    );
    if (conflictingIndex >= 0) {
      return { changed: false, reason: 'url-conflict', items: normalizedItems };
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
    const sessionStorage = config.sessionStorage || (
      chromeApi && chromeApi.storage ? chromeApi.storage.session : null
    );
    const durableStorage = config.durableStorage || (
      chromeApi && chromeApi.storage ? chromeApi.storage.local : null
    );
    const recentStore = config.recentStore || {};
    const storage = config.storage || null;
    const storageKey = String(config.storageKey || DEFAULT_STORAGE_KEY);
    const registryApi = config.trackingRegistryApi || globalThis.LumnoPinnedRecentTrackingRegistry || {};
    const trackingRegistry = config.trackingRegistry || (
      typeof registryApi.createPinnedRecentTrackingRegistry === 'function'
        ? registryApi.createPinnedRecentTrackingRegistry({
          runtime,
          sessionStorage,
          durableStorage,
          recentStore,
          storeOptions: config.storeOptions,
          now: config.now
        })
        : null
    );
    let cachedItems = [];
    let itemsLoaded = false;
    let attached = false;
    let trackingReady = Promise.resolve();
    const pendingTrackingOpeners = new Map();

    function normalizeTrackingCardId(cardId) {
      return typeof recentStore.normalizePinnedRecentCardId === 'function'
        ? recentStore.normalizePinnedRecentCardId(cardId)
        : String(cardId || '').trim();
    }

    function notifyTrackingActivityChanged() {
      if (!runtime || typeof runtime.sendMessage !== 'function') return;
      runtime.sendMessage({ action: 'pinnedRecentTrackingActivityChanged' }, () => {
        if (runtime) void runtime.lastError;
      });
    }

    function rememberTrackingSource(tab, cardId, url) {
      const targetTab = tab && typeof tab === 'object' ? tab : { id: tab };
      let normalizedCardId = normalizeTrackingCardId(cardId);
      const normalizedUrl = getHttpUrl(url);
      if (!normalizedCardId && normalizedUrl) {
        const matchedItem = cachedItems.find((item) =>
          item && item.trackingEnabled === true && getHttpUrl(item.url) === normalizedUrl
        );
        normalizedCardId = String(matchedItem && matchedItem.cardId || '');
      }
      if (!Number.isInteger(Number(targetTab.id)) || Number(targetTab.id) < 0 ||
          !normalizedCardId || !trackingRegistry) {
        return Promise.resolve(false);
      }
      return trackingReady.then(() => trackingRegistry.bindTab(
        targetTab,
        normalizedCardId,
        cachedItems,
        normalizedUrl
      )).then((result) => {
        const remembered = Boolean(result && result.cardId);
        if (remembered) notifyTrackingActivityChanged();
        return remembered;
      });
    }

    function inheritTrackingTab(openerTabId, tab) {
      return trackingReady.then(() => {
        return trackingRegistry.inheritTab(openerTabId, tab, cachedItems).then((result) => {
          if (result && result.cardId) {
            notifyTrackingActivityChanged();
            if (tab && tab.active) void refreshMenuForActiveTab();
          }
          return result;
        });
      });
    }

    function pruneTrackingSessionsFromPinnedChange(change) {
      const newItems = recentStore.normalizePinnedRecentSites(
        change && change.newValue,
        config.storeOptions || {}
      );
      if (!trackingRegistry) return Promise.resolve(false);
      return trackingReady.then(() => trackingRegistry.prune(newItems)).then((result) => {
        notifyTrackingActivityChanged();
        return result;
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
        sourceCardId: tab && trackingRegistry
          ? trackingRegistry.getCardId(Number(tab.id))
          : ''
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

    function createToolbarState(items, tab) {
      const tabId = Number(tab && tab.id);
      const pageUrl = getTabUrl(tab, null);
      const replacement = getReplacement(items, tab, null);
      const normalizedItems = Array.isArray(replacement.items) ? replacement.items : [];
      const cardId = Number.isInteger(tabId) && trackingRegistry
        ? normalizeTrackingCardId(trackingRegistry.getCardId(tabId))
        : '';
      const linkedCard = cardId
        ? (replacement.changed && replacement.previousItem &&
            replacement.previousItem.cardId === cardId
          ? replacement.previousItem
          : normalizedItems.find((item) => item && item.cardId === cardId) || null)
        : null;
      const reason = String(replacement && replacement.reason || 'unavailable-tab');
      let status = 'not-linked';
      if (!tab || tab.incognito === true || !pageUrl || reason === 'invalid-url' ||
          reason === 'unavailable-tab') {
        status = 'unsupported';
      } else if (replacement.changed) {
        status = 'update-available';
      } else if (reason === 'same-url') {
        status = 'up-to-date';
      } else if (reason === 'host-mismatch' || reason === 'url-conflict') {
        status = 'blocked';
      }
      const history = linkedCard && Array.isArray(linkedCard.updateHistory)
        ? linkedCard.updateHistory
        : [];
      return {
        ok: true,
        status,
        reason,
        page: {
          tabId: Number.isInteger(tabId) ? tabId : null,
          title: String(tab && tab.title || ''),
          url: pageUrl,
          faviconUrl: String(tab && tab.favIconUrl || '')
        },
        linkedCard: linkedCard ? {
          cardId: linkedCard.cardId,
          title: linkedCard.title,
          url: linkedCard.url,
          siteName: linkedCard.siteName || linkedCard.host || ''
        } : null,
        canUpdate: Boolean(replacement.changed),
        updateGuard: replacement.changed && linkedCard ? {
          cardId: linkedCard.cardId,
          sourceUrl: linkedCard.url,
          pageUrl
        } : null,
        undo: {
          available: history.length > 0,
          expectedUrl: linkedCard ? linkedCard.url : '',
          previous: history[0] ? { title: history[0].title, url: history[0].url } : null
        }
      };
    }

    function getToolbarStateForTab(tab) {
      return trackingReady.then(loadItems).then((items) => createToolbarState(items, tab))
        .catch(() => ({
          ok: false,
          status: 'error',
          reason: 'load-failed',
          page: null,
          linkedCard: null,
          canUpdate: false,
          updateGuard: null,
          undo: { available: false, expectedUrl: '', previous: null }
        }));
    }

    function updateForTab(tab, guard) {
      return trackingReady.then(loadItems).then((items) => {
        const expected = guard && typeof guard === 'object' ? guard : null;
        const currentPageUrl = getTabUrl(tab, null);
        const currentCardId = trackingRegistry
          ? normalizeTrackingCardId(trackingRegistry.getCardId(Number(tab && tab.id)))
          : '';
        if (expected && getHttpUrl(expected.pageUrl) !== currentPageUrl) {
          return { ok: false, changed: false, reason: 'stale-page' };
        }
        if (expected && normalizeTrackingCardId(expected.cardId) !== currentCardId) {
          return { ok: false, changed: false, reason: 'stale-binding' };
        }
        const normalizedItems = recentStore.normalizePinnedRecentSites(items, config.storeOptions || {});
        const linkedCard = normalizedItems.find((item) => item && item.cardId === currentCardId);
        if (expected && (!linkedCard || getHttpUrl(linkedCard.url) !== getHttpUrl(expected.sourceUrl))) {
          return { ok: false, changed: false, reason: 'source-changed' };
        }
        const replacement = getReplacement(normalizedItems, tab, null);
        if (!replacement.changed) {
          return { ok: false, ...replacement, items: undefined };
        }
        return storageSet(storage, { [storageKey]: replacement.items }, runtime).then((saved) => {
          if (!saved) return { ok: false, changed: false, reason: 'save-failed' };
          cachedItems = replacement.items;
          const currentItem = replacement.items[replacement.index] || null;
          return {
            ok: true,
            changed: true,
            reason: 'updated',
            cardId: String(currentItem && currentItem.cardId || ''),
            previous: replacement.previousItem ? {
              title: replacement.previousItem.title,
              url: replacement.previousItem.url
            } : null,
            current: currentItem ? { title: currentItem.title, url: currentItem.url } : null,
            undo: {
              available: true,
              expectedUrl: String(currentItem && currentItem.url || '')
            }
          };
        });
      }).catch(() => ({ ok: false, changed: false, reason: 'save-failed' }));
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

    function refreshMenuForTab(tab, info, options) {
      const refreshOptions = options && typeof options === 'object' ? options : {};
      const itemsPromise = refreshOptions.reload === true || !itemsLoaded
        ? loadItems()
        : Promise.resolve(cachedItems);
      return trackingReady.then(() => itemsPromise).then((items) => {
        const action = getAction(items, tab, info || null);
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
      });
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
        reason: String(result && result.reason || 'save-failed'),
        cardId: String(result && result.cardId || ''),
        previous: result && result.previousItem ? {
          title: result.previousItem.title,
          url: result.previousItem.url
        } : null,
        current: result && result.currentItem ? {
          title: result.currentItem.title,
          url: result.currentItem.url
        } : null
      }, () => {
        if (runtime) void runtime.lastError;
      });
    }

    function replaceForTab(tab, info) {
      return loadItems().then((items) => {
        const replacement = getReplacement(items, tab, info);
        if (!replacement.changed) return replacement;
        return storageSet(storage, { [storageKey]: replacement.items }, runtime).then((saved) => {
          if (saved) cachedItems = replacement.items;
          return {
            ...replacement,
            changed: Boolean(saved),
            reason: saved ? 'updated' : 'save-failed',
            cardId: String(replacement.items[replacement.index] &&
              replacement.items[replacement.index].cardId || ''),
            currentItem: replacement.items[replacement.index] || null
          };
        });
      });
    }

    function addForTab(tab, info) {
      return loadItems().then((items) => {
        const addition = getAddition(items, tab, info);
        if (!addition.changed) return addition;
        return storageSet(storage, { [storageKey]: addition.items }, runtime).then(async (saved) => {
          if (saved) {
            cachedItems = addition.items;
            const tabId = Number(tab && tab.id);
            const addedItem = addition.items[addition.index];
            if (Number.isInteger(tabId) && addedItem && addedItem.url) {
              await rememberTrackingSource(tab, addedItem.cardId, addedItem.url);
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

    function bindTrackingTab(tab, cardId, url) {
      const itemsTask = itemsLoaded ? Promise.resolve(cachedItems) : loadItems();
      return itemsTask.then(() => rememberTrackingSource(tab, cardId, url));
    }

    function syncTrackingDocument(tab, token, options) {
      if (!trackingRegistry) return Promise.resolve({ status: 'ignored' });
      const syncOptions = options && typeof options === 'object' ? options : {};
      const itemsTask = itemsLoaded ? Promise.resolve(cachedItems) : loadItems();
      return Promise.all([trackingReady, itemsTask]).then(() =>
        trackingRegistry.syncDocument(tab, token, cachedItems)
      ).then((result) => {
        if (result && result.cardId) notifyTrackingActivityChanged();
        if (!result || !result.cardId || !tab || tab.active !== true ||
            syncOptions.refreshMenu === false) {
          return result;
        }
        return refreshMenuForTab(tab).then(() => {
          if (menus && typeof menus.refresh === 'function') menus.refresh();
          return result;
        });
      });
    }

    function undoTrackingUpdate(cardId, expectedUrl) {
      const normalizedCardId = normalizeTrackingCardId(cardId);
      const normalizedExpectedUrl = getHttpUrl(expectedUrl);
      return loadItems().then((items) => {
        const normalizedItems = recentStore.normalizePinnedRecentSites(
          items,
          config.storeOptions || {}
        );
        const currentItem = normalizedItems.find((item) =>
          item && item.cardId === normalizedCardId
        );
        if (!currentItem || !normalizedCardId) {
          return { ok: false, reason: 'source-not-found' };
        }
        if (!normalizedExpectedUrl || getHttpUrl(currentItem.url) !== normalizedExpectedUrl) {
          return { ok: false, reason: 'source-changed' };
        }
        if (!Array.isArray(currentItem.updateHistory) || !currentItem.updateHistory.length ||
            typeof recentStore.undoPinnedRecentSiteUpdate !== 'function') {
          return { ok: false, reason: 'source-not-found' };
        }
        const undoResult = recentStore.undoPinnedRecentSiteUpdate(
          normalizedItems,
          currentItem.url,
          { ...(config.storeOptions || {}), cardId: normalizedCardId }
        );
        if (!undoResult || !undoResult.changed) {
          return { ok: false, reason: String(undoResult && undoResult.reason || 'save-failed') };
        }
        const restoredItem = undoResult.items.find((item) => item && item.cardId === normalizedCardId);
        return storageSet(storage, { [storageKey]: undoResult.items }, runtime).then((saved) => {
          if (!saved) return { ok: false, reason: 'save-failed' };
          cachedItems = undoResult.items;
          return {
            ok: true,
            reason: 'undone',
            cardId: normalizedCardId,
            previous: { title: currentItem.title, url: currentItem.url },
            current: { title: restoredItem && restoredItem.title, url: restoredItem && restoredItem.url }
          };
        });
      });
    }

    function getTrackingActivity() {
      if (!trackingRegistry) return Promise.resolve({});
      return trackingReady.then(() => trackingRegistry.getActiveCounts());
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
      trackingReady = loadItems().then((items) => (
        trackingRegistry ? trackingRegistry.initialize(items) : false
      )).catch(() => false);
      createMenu();
      if (menus.onShown && typeof menus.onShown.addListener === 'function') {
        menus.onShown.addListener((info, tab) => {
          return refreshMenuForTab(tab, info, { reload: true }).then((enabled) => {
            if (typeof menus.refresh === 'function') menus.refresh();
            return enabled;
          }).catch(() => false);
        });
      }
      if (menus.onClicked && typeof menus.onClicked.addListener === 'function') {
        menus.onClicked.addListener((info, tab) => {
          if (!info || info.menuItemId !== MENU_ID) return;
          return applyForTab(tab, info).then((result) => {
            notifyFeedback(tab, result);
            void refreshMenuForTab(tab);
            return result;
          }).catch(() => {
            notifyFeedback(tab, { changed: false, reason: 'save-failed' });
          });
        });
      }
      if (tabs && tabs.onCreated && typeof tabs.onCreated.addListener === 'function') {
        tabs.onCreated.addListener((tab) => {
          const openerTabId = Number(tab && tab.openerTabId);
          if (!Number.isInteger(openerTabId) || !trackingRegistry) return;
          const tabId = Number(tab && tab.id);
          const targetUrl = String(tab && (tab.pendingUrl || tab.url) || '');
          if (getHttpUrl(targetUrl)) return inheritTrackingTab(openerTabId, tab);
          if (Number.isInteger(tabId) && tabId >= 0 && (!targetUrl || targetUrl === 'about:blank')) {
            pendingTrackingOpeners.set(tabId, openerTabId);
          }
        });
      }
      if (tabs && tabs.onActivated && typeof tabs.onActivated.addListener === 'function') {
        tabs.onActivated.addListener(() => {
          return refreshMenuForActiveTab();
        });
      }
      if (tabs && tabs.onUpdated && typeof tabs.onUpdated.addListener === 'function') {
        tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
          const pendingOpenerTabId = pendingTrackingOpeners.get(Number(tabId));
          if (Number.isInteger(pendingOpenerTabId)) {
            const targetUrl = String(changeInfo && changeInfo.url ||
              tab && (tab.pendingUrl || tab.url) || '');
            if (getHttpUrl(targetUrl)) {
              pendingTrackingOpeners.delete(Number(tabId));
              void inheritTrackingTab(pendingOpenerTabId, { ...tab, id: Number(tabId), url: targetUrl });
            } else if (targetUrl && targetUrl !== 'about:blank') {
              pendingTrackingOpeners.delete(Number(tabId));
            }
          }
          const updateTrackingUrl = Boolean(
            changeInfo && changeInfo.url && trackingRegistry &&
            trackingRegistry.getCardId(Number(tabId))
          );
          const trackingTask = updateTrackingUrl
            ? syncTrackingDocument({ ...tab, id: Number(tabId), url: changeInfo.url }, '', {
              refreshMenu: false
            })
            : Promise.resolve(null);
          if (!tab || !tab.active || (!changeInfo.url && !changeInfo.status && !changeInfo.title)) {
            return trackingTask;
          }
          return trackingTask.then(() => {
            if (!changeInfo.url) return refreshMenuForActiveTab();
            const updatedTab = { ...tab, id: Number(tabId), url: changeInfo.url };
            return refreshMenuForTab(updatedTab).then((enabled) => {
              if (menus && typeof menus.refresh === 'function') menus.refresh();
              return enabled;
            });
          });
        });
      }
      if (tabs && tabs.onRemoved && typeof tabs.onRemoved.addListener === 'function') {
        tabs.onRemoved.addListener((tabId, removeInfo) => {
          pendingTrackingOpeners.delete(Number(tabId));
          if (!trackingRegistry) return;
          return trackingReady.then(() => trackingRegistry.releaseTab(tabId, {
            revokeToken: !(removeInfo && removeInfo.isWindowClosing === true)
          })).then((changed) => {
            if (changed) notifyTrackingActivityChanged();
            return changed;
          });
        });
      }
      if (tabs && tabs.onReplaced && typeof tabs.onReplaced.addListener === 'function') {
        tabs.onReplaced.addListener((addedTabId, removedTabId) => {
          const pendingOpenerTabId = pendingTrackingOpeners.get(Number(removedTabId));
          if (Number.isInteger(pendingOpenerTabId)) {
            pendingTrackingOpeners.delete(Number(removedTabId));
            if (Number.isInteger(Number(addedTabId)) && Number(addedTabId) >= 0) {
              pendingTrackingOpeners.set(Number(addedTabId), pendingOpenerTabId);
            }
          }
          if (!trackingRegistry || typeof trackingRegistry.replaceTab !== 'function') return;
          return trackingReady.then(() => trackingRegistry.replaceTab(
            removedTabId,
            addedTabId
          )).then((changed) => {
            if (changed) notifyTrackingActivityChanged();
            return changed;
          });
        });
      }
      if (storageChanges && typeof storageChanges.addListener === 'function') {
        storageChanges.addListener((changes) => {
          if (!changes || !changes[storageKey]) return;
          return pruneTrackingSessionsFromPinnedChange(changes[storageKey])
            .then(loadItems)
            .then(refreshMenuForActiveTab)
            .catch(() => {});
        });
      }
      void trackingReady.then(refreshMenuForActiveTab).catch(() => {});
      return true;
    }

    return Object.freeze({
      attach,
      replaceForTab,
      addForTab,
      applyForTab,
      getToolbarStateForTab,
      updateForTab,
      undoTrackingUpdate,
      bindTrackingTab,
      syncTrackingDocument,
      getTrackingActivity
    });
  }

  return Object.freeze({
    DEFAULT_STORAGE_KEY,
    MENU_ID,
    TRACKING_SESSION_STORAGE_KEY,
    createPinnedRecentContextMenuController,
    addPinnedTrackedCurrent,
    getHttpUrl,
    replacePinnedUrlWithCurrent
  });
});
