const assert = require('assert');
const recentStore = require('../src/newtab/recent-sites-store.js');
const trackingRegistry = require('../src/background/pinned-recent-tracking-registry.js');
globalThis.LumnoPinnedRecentTrackingRegistry = trackingRegistry;
const pinnedMenu = require('../src/background/pinned-recent-context-menu.js');

const PINNED_KEY = recentStore.DEFAULT_PINNED_KEY;

function createMemoryStorage(initialData) {
  const data = { ...(initialData || {}) };
  return {
    data,
    get(keys, callback) {
      const result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        result[key] = data[key];
      });
      callback(result);
    },
    set(value, callback) {
      Object.assign(data, value || {});
      if (callback) callback();
    }
  };
}

function createFailingStorage(runtime, initialData) {
  const storage = createMemoryStorage(initialData);
  storage.set = (value, callback) => {
    runtime.lastError = { message: 'Write failed' };
    if (callback) callback();
    runtime.lastError = null;
  };
  return storage;
}

function createDeferredReadStorage(initialData) {
  const storage = createMemoryStorage(initialData);
  const immediateGet = storage.get.bind(storage);
  const pendingReads = [];
  storage.get = (keys, callback) => {
    pendingReads.push(() => immediateGet(keys, callback));
  };
  storage.releaseReads = () => {
    pendingReads.splice(0).forEach((read) => read());
  };
  return storage;
}

function createEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    emit(...args) {
      return Promise.all(listeners.map((listener) => listener(...args)));
    }
  };
}

function createChromeApi(options) {
  const config = options || {};
  const onClicked = createEvent();
  const onShown = createEvent();
  const onMessage = createEvent();
  const onCreated = createEvent();
  const onRemoved = createEvent();
  const onReplaced = createEvent();
  const onActivated = createEvent();
  const onUpdated = createEvent();
  const onStorageChanged = createEvent();
  const calls = {
    create: [],
    update: [],
    sendMessage: [],
    actionIcons: [],
    refresh: 0
  };
  const sessionStorage = config.sessionStorage || createMemoryStorage({});
  const localStorage = config.localStorage || createMemoryStorage({});
  let activeTab = {
    id: 90,
    active: true,
    url: 'https://untracked.example/'
  };
  return {
    calls,
    events: { onClicked, onShown, onMessage, onCreated, onRemoved, onReplaced, onActivated, onUpdated, onStorageChanged },
    sessionStorage,
    localStorage,
    setActiveTab(tab) {
      activeTab = tab;
    },
    api: {
      action: {
        setIcon(details, callback) {
          calls.actionIcons.push(details);
          if (callback) callback();
        }
      },
      contextMenus: {
        onClicked,
        onShown,
        create(details, callback) {
          calls.create.push(details);
          if (callback) callback();
        },
        update(id, changes, callback) {
          calls.update.push({ id, changes });
          if (callback) callback();
        },
        refresh() {
          calls.refresh += 1;
        }
      },
      i18n: {
        getMessage(key) {
          const values = {
            recent_replace_pinned_url_with_current: 'Update This Tracked Card to the Current Page',
            recent_pin_and_track_current_page: 'Pin and Track the Current Page',
            recent_pin_and_track_current_page_limit: 'Pin and Track the Current Page (3-Pin Limit Reached)',
            recent_tracked_page_is_current: 'This Page Is Already the Tracked Link',
            recent_current_page_already_pinned_tracked: 'This Page Is Already Pinned and Tracked'
          };
          return values[key] || '';
        }
      },
      runtime: { lastError: null, onMessage },
      tabs: {
        onCreated,
        onRemoved,
        onReplaced,
        onActivated,
        onUpdated,
        query(_queryInfo, callback) {
          callback([activeTab]);
        },
        sendMessage(tabId, message, callback) {
          calls.sendMessage.push({ tabId, message });
          if (callback) callback();
        }
      },
      storage: { onChanged: onStorageChanged, session: sessionStorage, local: localStorage }
    }
  };
}

async function run() {
  const original = [{
    title: 'Course',
    siteName: 'Bilibili',
    url: 'https://www.bilibili.com/video/BV-old/?p=1',
    host: 'bilibili.com',
    pinnedAt: 123,
    trackingEnabled: true,
    lastVisitTime: 100,
    visitCount: 8
  }, {
    title: 'Docs',
    url: 'https://docs.example/start',
    pinnedAt: 456
  }];
  const replaced = pinnedMenu.replacePinnedUrlWithCurrent(
    original,
    'https://www.bilibili.com/video/BV-new/?p=7',
    {
      recentStore,
      now: () => 999,
      currentTitle: '  New   Video Title  ',
      sourceUrl: original[0].url
    }
  );
  assert.strictEqual(replaced.changed, true);
  assert.strictEqual(replaced.items[0].url, 'https://www.bilibili.com/video/BV-new/?p=7');
  assert.strictEqual(replaced.items[0].title, 'New Video Title');
  assert.strictEqual(replaced.items[0].siteName, 'Bilibili');
  assert.strictEqual(replaced.items[0].pinnedAt, 123);
  assert.strictEqual(replaced.items[0].trackingEnabled, true);
  assert.ok(replaced.items[0].cardId);
  assert.strictEqual(replaced.items[0].updatePending, true);
  assert.strictEqual(replaced.items[0].updateHistory.length, 1);
  assert.strictEqual(replaced.items[0].updateHistory[0].url, original[0].url);
  assert.strictEqual(replaced.items[0].updateHistory[0].title, original[0].title);
  const replacementConflictItems = [original[0], {
    title: 'Other Bilibili',
    url: 'https://www.bilibili.com/video/BV-other/',
    pinnedAt: 124,
    trackingEnabled: true
  }];
  const replacementConflict = pinnedMenu.replacePinnedUrlWithCurrent(
    replacementConflictItems,
    replacementConflictItems[1].url,
    {
      recentStore,
      sourceCardId: recentStore.normalizePinnedRecentSites(replacementConflictItems)[0].cardId
    }
  );
  assert.strictEqual(replacementConflict.changed, false);
  assert.strictEqual(replacementConflict.reason, 'url-conflict');
  assert.strictEqual(replacementConflict.items.length, replacementConflictItems.length);
  let chainedItems = [original[0]];
  let chainedSource = original[0].url;
  for (let index = 0; index < 12; index += 1) {
    const chained = pinnedMenu.replacePinnedUrlWithCurrent(
      chainedItems,
      `https://www.bilibili.com/video/BV-history-${index}/`,
      { recentStore, sourceUrl: chainedSource, now: () => 1000 + index }
    );
    assert.strictEqual(chained.changed, true);
    chainedItems = chained.items;
    chainedSource = chained.items[0].url;
  }
  assert.strictEqual(chainedItems[0].updateHistory.length, 10);
  assert.strictEqual(chainedItems[0].updateHistory[0].url, 'https://www.bilibili.com/video/BV-history-10/');
  assert.strictEqual(replaced.items[0].lastVisitTime, 999);
  assert.strictEqual(replaced.items[1].url, 'https://docs.example/start');

  assert.strictEqual(
    pinnedMenu.replacePinnedUrlWithCurrent(
      [{ ...original[0], trackingEnabled: false }],
      'https://www.bilibili.com/video/BV-untracked/?p=2',
      { recentStore }
    ).changed,
    false,
    'an untracked pin should not be replaceable'
  );

  assert.strictEqual(
    pinnedMenu.replacePinnedUrlWithCurrent(original, 'https://other.example/', { recentStore }).changed,
    false
  );
  assert.strictEqual(
    pinnedMenu.replacePinnedUrlWithCurrent(original, 'chrome://settings/', { recentStore }).changed,
    false
  );
  assert.strictEqual(
    pinnedMenu.replacePinnedUrlWithCurrent(original, original[0].url, { recentStore }).changed,
    false
  );

  const ambiguous = [original[0], {
    title: 'Music',
    siteName: 'Bilibili',
    url: 'https://www.bilibili.com/video/BV-music/',
    host: 'bilibili.com',
    pinnedAt: 234,
    trackingEnabled: true
  }, original[1]];
  assert.strictEqual(
    pinnedMenu.replacePinnedUrlWithCurrent(
      ambiguous,
      'https://www.bilibili.com/video/BV-new/',
      { recentStore }
    ).changed,
    false,
    'ambiguous same-host tracking targets must not update the first card'
  );
  const sourceMatched = pinnedMenu.replacePinnedUrlWithCurrent(
    ambiguous,
    'https://www.bilibili.com/video/BV-new/',
    { recentStore, sourceUrl: original[0].url }
  );
  assert.strictEqual(sourceMatched.changed, true);
  assert.strictEqual(sourceMatched.index, 0);
  assert.strictEqual(sourceMatched.items[0].url, 'https://www.bilibili.com/video/BV-new/');
  assert.strictEqual(sourceMatched.items[1].url, ambiguous[1].url);
  const cardIdMatched = pinnedMenu.replacePinnedUrlWithCurrent(
    ambiguous,
    'https://www.bilibili.com/video/BV-card-id/',
    { recentStore, sourceCardId: sourceMatched.items[0].cardId }
  );
  assert.strictEqual(cardIdMatched.changed, true);
  assert.strictEqual(cardIdMatched.index, 0);
  assert.strictEqual(
    pinnedMenu.replacePinnedUrlWithCurrent(
      ambiguous,
      'https://other.example/watch/1',
      { recentStore, sourceCardId: sourceMatched.items[0].cardId }
    ).reason,
    'host-mismatch',
    'a persisted tab binding must not update its card after cross-site navigation'
  );

  const added = pinnedMenu.addPinnedTrackedCurrent(
    [original[1]],
    'https://new.example/watch/42',
    {
      recentStore,
      now: () => 777,
      currentTitle: '  Newly   Tracked Page  '
    }
  );
  assert.strictEqual(added.changed, true);
  assert.strictEqual(added.reason, 'added');
  assert.strictEqual(added.items[0].url, 'https://new.example/watch/42');
  assert.strictEqual(added.items[0].title, 'Newly Tracked Page');
  assert.strictEqual(added.items[0].pinnedAt, 777);
  assert.strictEqual(added.items[0].trackingEnabled, true);
  assert.strictEqual(added.items[0].updatePending, false);

  const trackingEnabled = pinnedMenu.addPinnedTrackedCurrent(
    [{ ...original[1], trackingEnabled: false }],
    original[1].url,
    { recentStore, now: () => 778, currentTitle: 'Updated Docs' }
  );
  assert.strictEqual(trackingEnabled.changed, true);
  assert.strictEqual(trackingEnabled.reason, 'tracking-enabled');
  assert.strictEqual(trackingEnabled.items.length, 1);
  assert.strictEqual(trackingEnabled.items[0].trackingEnabled, true);
  assert.strictEqual(trackingEnabled.items[0].title, 'Updated Docs');

  assert.strictEqual(
    pinnedMenu.addPinnedTrackedCurrent(
      [{ ...original[1], trackingEnabled: true }],
      original[1].url,
      { recentStore }
    ).reason,
    'already-tracked'
  );
  assert.strictEqual(
    pinnedMenu.addPinnedTrackedCurrent(ambiguous, 'https://fourth.example/', { recentStore }).reason,
    'pin-limit'
  );

  ['latest', 'most'].forEach((mode) => {
    const merged = recentStore.mergeRecentSiteSources({
      mode,
      limit: 4,
      pinned: added.items,
      historyItems: [],
      topSites: []
    });
    assert.strictEqual(merged[0].url, added.items[0].url);
    assert.strictEqual(merged[0]._xPinned, true);
  });

  const storage = createMemoryStorage({ [PINNED_KEY]: ambiguous });
  const chrome = createChromeApi();
  const controller = pinnedMenu.createPinnedRecentContextMenuController({
    chromeApi: chrome.api,
    recentStore,
    storage,
    storageKey: PINNED_KEY,
    now: () => 999
  });
  controller.attach();
  assert.deepStrictEqual(chrome.calls.create[0], {
    id: pinnedMenu.MENU_ID,
    title: 'Pin and Track the Current Page',
    contexts: ['all'],
    documentUrlPatterns: ['http://*/*', 'https://*/*'],
    enabled: false
  });
  assert.deepStrictEqual(chrome.calls.update[0], {
    id: pinnedMenu.MENU_ID,
    changes: {
      title: 'Pin and Track the Current Page',
      contexts: ['all'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
      enabled: false
    }
  });

  const linkedExisting = await controller.linkForTab({
    id: 10,
    url: original[0].url,
    title: 'Course · Episode 1'
  });
  assert.strictEqual(linkedExisting.ok, true);
  assert.strictEqual(linkedExisting.reason, 'linked');
  const linkedExistingState = await controller.getToolbarStateForTab({
    id: 10,
    url: original[0].url,
    title: 'Course · Episode 1'
  });
  assert.strictEqual(linkedExistingState.status, 'up-to-date');

  await controller.bindTrackingTab(
    { id: 11 },
    recentStore.normalizePinnedRecentSites(ambiguous)[0].cardId,
    original[0].url
  );
  const toolbarCurrentState = await controller.getToolbarStateForTab({
    id: 11,
    active: true,
    url: original[0].url,
    title: 'Course · Episode 1'
  });
  assert.strictEqual(toolbarCurrentState.status, 'up-to-date');
  assert.strictEqual(toolbarCurrentState.canUpdate, false);
  assert.strictEqual(toolbarCurrentState.linkedCard.url, original[0].url);
  assert.deepStrictEqual(chrome.calls.actionIcons.at(-1), {
    tabId: 11,
    path: {
      16: 'assets/images/lumno-tracked-16.png',
      32: 'assets/images/lumno-tracked-32.png'
    }
  });

  chrome.setActiveTab({ id: 90, active: true, url: 'https://untracked.example/' });
  await chrome.events.onActivated.emit({ tabId: 90 });
  assert.deepStrictEqual(chrome.calls.actionIcons.at(-1), {
    tabId: 90,
    path: {
      16: 'assets/images/lumno.png',
      32: 'assets/images/lumno.png'
    }
  });
  chrome.setActiveTab({
    id: 11,
    active: true,
    url: original[0].url,
    title: 'Course · Episode 1'
  });

  const toolbarUpdateState = await controller.getToolbarStateForTab({
    id: 11,
    active: true,
    url: 'https://www.bilibili.com/video/BV-spa/?p=2',
    title: 'Course · Episode 2'
  });
  assert.strictEqual(toolbarUpdateState.status, 'update-available');
  assert.strictEqual(toolbarUpdateState.canUpdate, true);
  assert.strictEqual(toolbarUpdateState.updateGuard.cardId, toolbarUpdateState.linkedCard.cardId);
  assert.strictEqual(toolbarUpdateState.updateGuard.sourceUrl, original[0].url);

  const stalePageUpdate = await controller.updateForTab({
    id: 11,
    url: 'https://www.bilibili.com/video/BV-spa/?p=3'
  }, toolbarUpdateState.updateGuard);
  assert.strictEqual(stalePageUpdate.reason, 'stale-page');
  const staleBindingUpdate = await controller.updateForTab({
    id: 11,
    url: toolbarUpdateState.updateGuard.pageUrl
  }, { ...toolbarUpdateState.updateGuard, cardId: 'missing-card' });
  assert.strictEqual(staleBindingUpdate.reason, 'stale-binding');
  const staleSourceUpdate = await controller.updateForTab({
    id: 11,
    url: toolbarUpdateState.updateGuard.pageUrl
  }, { ...toolbarUpdateState.updateGuard, sourceUrl: 'https://www.bilibili.com/video/BV-old/' });
  assert.strictEqual(staleSourceUpdate.reason, 'source-changed');

  const unboundItemCount = storage.data[PINNED_KEY].length;
  const unboundUpdate = await controller.updateForTab({
    id: 99,
    url: 'https://unbound.example/new',
    title: 'Unbound'
  });
  assert.strictEqual(unboundUpdate.ok, false);
  assert.strictEqual(unboundUpdate.reason, 'no-tracked-target');
  assert.strictEqual(storage.data[PINNED_KEY].length, unboundItemCount);

  const toolbarUpdate = await controller.updateForTab({
    id: 11,
    url: 'https://www.bilibili.com/video/BV-spa/?p=2',
    title: 'Course · Episode 2'
  }, toolbarUpdateState.updateGuard);
  assert.strictEqual(toolbarUpdate.ok, true);
  assert.strictEqual(toolbarUpdate.current.url, 'https://www.bilibili.com/video/BV-spa/?p=2');
  assert.strictEqual(storage.data[PINNED_KEY].length, unboundItemCount);
  const updatedToolbarState = await controller.getToolbarStateForTab({
    id: 11,
    url: toolbarUpdate.current.url,
    title: toolbarUpdate.current.title
  });
  assert.strictEqual(updatedToolbarState.status, 'up-to-date');
  assert.strictEqual(updatedToolbarState.undo.available, true);
  const toolbarUndo = await controller.undoTrackingUpdate(
    toolbarUpdate.cardId,
    toolbarUpdate.current.url
  );
  assert.strictEqual(toolbarUndo.ok, true);
  assert.strictEqual(storage.data[PINNED_KEY][0].url, original[0].url);
  chrome.setActiveTab({
    id: 11,
    active: true,
    url: original[0].url,
    title: 'Course · Episode 1'
  });
  await chrome.events.onShown.emit({ pageUrl: original[0].url }, {
    id: 11,
    active: true,
    url: original[0].url,
    title: 'Course · Episode 1'
  });
  assert.strictEqual(
    chrome.calls.update.at(-1).changes.title,
    'This Page Is Already the Tracked Link'
  );
  const refreshBeforeSpaUpdate = chrome.calls.refresh;
  await chrome.events.onUpdated.emit(11, {
    url: 'https://www.bilibili.com/video/BV-spa/?p=2'
  }, {
    id: 11,
    active: true,
    url: 'https://www.bilibili.com/video/BV-spa/?p=2',
    title: 'Course · Episode 2'
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    chrome.calls.update.at(-1).changes.title,
    'Update This Tracked Card to the Current Page',
    'an active SPA URL update should refresh the menu without switching tabs'
  );
  assert.strictEqual(chrome.calls.update.at(-1).changes.enabled, true);
  assert.ok(chrome.calls.refresh > refreshBeforeSpaUpdate);
  chrome.setActiveTab({
    id: 12,
    active: true,
    url: 'https://www.bilibili.com/video/BV-new/?p=7',
    title: 'Conan Collection · Episode 2'
  });
  await chrome.events.onCreated.emit({ id: 12, openerTabId: 11 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    chrome.sessionStorage.data[pinnedMenu.TRACKING_SESSION_STORAGE_KEY]['12'],
    undefined
  );
  await chrome.events.onUpdated.emit(12, {
    url: 'https://www.bilibili.com/video/BV-new/?p=7'
  }, {
    id: 12,
    active: true,
    url: 'https://www.bilibili.com/video/BV-new/?p=7'
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    chrome.sessionStorage.data[pinnedMenu.TRACKING_SESSION_STORAGE_KEY]['12'].cardId,
    recentStore.normalizePinnedRecentSites(ambiguous)[0].cardId
  );
  assert.strictEqual(chrome.calls.update.at(-1).changes.enabled, true);
  assert.strictEqual(
    chrome.calls.update.at(-1).changes.title,
    'Update This Tracked Card to the Current Page'
  );

  await chrome.events.onCreated.emit({
    id: 13,
    openerTabId: 11,
    url: 'chrome://extensions/'
  });
  await chrome.events.onUpdated.emit(13, { status: 'complete' }, {
    id: 13,
    url: 'chrome://extensions/'
  });
  await chrome.events.onCreated.emit({ id: 14, openerTabId: 11 });
  await chrome.events.onUpdated.emit(14, { url: 'https://example.com/' }, {
    id: 14,
    url: 'https://example.com/'
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    chrome.sessionStorage.data[pinnedMenu.TRACKING_SESSION_STORAGE_KEY]['13'],
    undefined
  );
  assert.strictEqual(
    chrome.sessionStorage.data[pinnedMenu.TRACKING_SESSION_STORAGE_KEY]['14'],
    undefined
  );

  await chrome.events.onCreated.emit({ id: 15, openerTabId: 11 });
  await chrome.events.onReplaced.emit(16, 15);
  await chrome.events.onUpdated.emit(16, {
    url: 'https://www.bilibili.com/video/BV-replaced-opener/'
  }, {
    id: 16,
    url: 'https://www.bilibili.com/video/BV-replaced-opener/'
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    chrome.sessionStorage.data[pinnedMenu.TRACKING_SESSION_STORAGE_KEY]['15'],
    undefined
  );
  assert.strictEqual(
    chrome.sessionStorage.data[pinnedMenu.TRACKING_SESSION_STORAGE_KEY]['16'].cardId,
    recentStore.normalizePinnedRecentSites(ambiguous)[0].cardId
  );

  const restartedChrome = createChromeApi({ sessionStorage: chrome.sessionStorage });
  const restartedController = pinnedMenu.createPinnedRecentContextMenuController({
    chromeApi: restartedChrome.api,
    recentStore,
    storage,
    storageKey: PINNED_KEY,
    now: () => 999
  });
  restartedController.attach();
  await new Promise((resolve) => setImmediate(resolve));
  await restartedChrome.events.onShown.emit({
    pageUrl: 'https://www.bilibili.com/video/BV-new/?p=7'
  }, {
    id: 12,
    active: true,
    url: 'https://untracked.example/stale-tab-url',
    title: 'Conan Collection · Episode 2'
  });
  assert.strictEqual(restartedChrome.calls.update.at(-1).changes.enabled, true);
  assert.strictEqual(restartedChrome.calls.refresh, 1);
  const syncedTracking = await restartedController.syncTrackingDocument({
    id: 12,
    url: 'https://www.bilibili.com/video/BV-new/?p=7'
  }, '');
  assert.strictEqual(syncedTracking.status, 'bound');
  assert.ok(trackingRegistry.normalizeTrackingToken(syncedTracking.token));

  const browserRestartChrome = createChromeApi({
    sessionStorage: createMemoryStorage({}),
    localStorage: restartedChrome.localStorage
  });
  const browserRestartController = pinnedMenu.createPinnedRecentContextMenuController({
    chromeApi: browserRestartChrome.api,
    recentStore,
    storage,
    storageKey: PINNED_KEY,
    now: () => 1000
  });
  browserRestartController.attach();
  await new Promise((resolve) => setImmediate(resolve));
  await browserRestartChrome.events.onShown.emit({
    pageUrl: 'https://www.bilibili.com/video/BV-new/?p=8'
  }, {
    id: 212,
    active: true,
    url: 'https://www.bilibili.com/video/BV-new/?p=8'
  });
  const refreshBeforeRestore = browserRestartChrome.calls.refresh;
  const browserRestored = await browserRestartController.syncTrackingDocument({
    id: 212,
    active: true,
    url: 'https://www.bilibili.com/video/BV-new/?p=8'
  }, syncedTracking.token);
  assert.strictEqual(browserRestored.status, 'restored');
  assert.strictEqual(
    browserRestored.cardId,
    recentStore.normalizePinnedRecentSites(ambiguous)[0].cardId
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    browserRestartChrome.calls.update.at(-1).changes.title,
    'Update This Tracked Card to the Current Page'
  );
  assert.ok(browserRestartChrome.calls.refresh > refreshBeforeRestore);
  assert.deepStrictEqual(await browserRestartController.getTrackingActivity(), {
    [recentStore.normalizePinnedRecentSites(ambiguous)[0].cardId]: 1
  });

  await browserRestartChrome.events.onUpdated.emit(212, {
    url: 'https://www.bilibili.com/video/BV-new/?p=9'
  }, {
    id: 212,
    active: true,
    url: 'https://www.bilibili.com/video/BV-new/?p=9'
  });
  await new Promise((resolve) => setImmediate(resolve));
  const spaRestartChrome = createChromeApi({
    sessionStorage: createMemoryStorage({}),
    localStorage: browserRestartChrome.localStorage
  });
  const spaRestartController = pinnedMenu.createPinnedRecentContextMenuController({
    chromeApi: spaRestartChrome.api,
    recentStore,
    storage,
    storageKey: PINNED_KEY,
    now: () => 1001
  });
  spaRestartController.attach();
  await new Promise((resolve) => setImmediate(resolve));
  const spaRestored = await spaRestartController.syncTrackingDocument({
    id: 313,
    active: true,
    url: 'https://www.bilibili.com/video/BV-new/?p=9'
  }, browserRestored.token);
  assert.strictEqual(spaRestored.status, 'restored');
  assert.strictEqual(spaRestored.cardId, browserRestored.cardId);

  await browserRestartChrome.events.onRemoved.emit(212, { isWindowClosing: false });
  assert.deepStrictEqual(await browserRestartController.getTrackingActivity(), {});
  assert.strictEqual(
    browserRestartChrome.localStorage.data[trackingRegistry.TRACKING_TOKEN_STORAGE_KEY][browserRestored.token],
    undefined
  );
  storage.data[PINNED_KEY] = ambiguous.map((item, index) =>
    index === 0 ? { ...item, trackingEnabled: false } : item
  );
  await restartedChrome.events.onShown.emit({
    pageUrl: 'https://www.bilibili.com/video/BV-new/?p=7'
  }, {
    id: 12,
    active: true,
    url: 'https://www.bilibili.com/video/BV-new/?p=7'
  });
  assert.strictEqual(restartedChrome.calls.update.at(-1).changes.enabled, false);
  assert.strictEqual(restartedChrome.calls.refresh, 2);
  storage.data[PINNED_KEY] = ambiguous;

  const normalizedAmbiguous = recentStore.normalizePinnedRecentSites(ambiguous);
  const deferredSessionStorage = createDeferredReadStorage({
    [pinnedMenu.TRACKING_SESSION_STORAGE_KEY]: {
      44: {
        cardId: normalizedAmbiguous[1].cardId,
        token: '',
        origin: new URL(normalizedAmbiguous[1].url).origin
      }
    }
  });
  const racingChrome = createChromeApi({ sessionStorage: deferredSessionStorage });
  const racingController = pinnedMenu.createPinnedRecentContextMenuController({
    chromeApi: racingChrome.api,
    recentStore,
    storage,
    storageKey: PINNED_KEY
  });
  racingController.attach();
  const racingRemember = racingController.bindTrackingTab(
    { id: 45 },
    normalizedAmbiguous[0].cardId,
    normalizedAmbiguous[0].url
  );
  await new Promise((resolve) => setImmediate(resolve));
  deferredSessionStorage.releaseReads();
  await racingRemember;
  assert.deepStrictEqual(
    deferredSessionStorage.data[pinnedMenu.TRACKING_SESSION_STORAGE_KEY],
    {
      44: {
        cardId: normalizedAmbiguous[1].cardId,
        token: '',
        origin: new URL(normalizedAmbiguous[1].url).origin
      },
      45: {
        cardId: normalizedAmbiguous[0].cardId,
        token: '',
        origin: new URL(normalizedAmbiguous[0].url).origin
      }
    }
  );

  await chrome.events.onClicked.emit({
    menuItemId: pinnedMenu.MENU_ID,
    pageUrl: 'https://www.bilibili.com/video/BV-new/?p=7'
  }, {
    id: 12,
    url: original[0].url,
    title: 'Conan Collection · Episode 2',
    incognito: false
  });
  assert.strictEqual(storage.data[PINNED_KEY][0].url, 'https://www.bilibili.com/video/BV-new/?p=7');
  assert.strictEqual(storage.data[PINNED_KEY][0].title, 'Conan Collection · Episode 2');
  assert.strictEqual(storage.data[PINNED_KEY][0].updatePending, true);
  assert.strictEqual(storage.data[PINNED_KEY][0].updateHistory[0].url, original[0].url);
  assert.strictEqual(storage.data[PINNED_KEY][0].pinnedAt, 123);
  assert.strictEqual(storage.data[PINNED_KEY][1].url, ambiguous[1].url);
  const previewCall = chrome.calls.sendMessage.find((call) =>
    call.message && call.message.action === 'showPinnedRecentUpdatePreview'
  );
  assert.strictEqual(previewCall, undefined, 'formal updates should save before showing completion feedback');
  assert.deepStrictEqual(chrome.calls.sendMessage.at(-1), {
    tabId: 12,
    message: {
      action: 'showPinnedRecentUpdateFeedback',
      ok: true,
      reason: 'updated',
      cardId: storage.data[PINNED_KEY][0].cardId,
      previous: { title: 'Course', url: original[0].url },
      current: {
        title: 'Conan Collection · Episode 2',
        url: 'https://www.bilibili.com/video/BV-new/?p=7'
      }
    }
  });
  const undoResult = await controller.undoTrackingUpdate(
    storage.data[PINNED_KEY][0].cardId,
    'https://www.bilibili.com/video/BV-new/?p=7'
  );
  assert.strictEqual(undoResult.ok, true);
  assert.strictEqual(storage.data[PINNED_KEY][0].url, original[0].url);
  const staleUndo = await controller.undoTrackingUpdate(
    storage.data[PINNED_KEY][0].cardId,
    'https://www.bilibili.com/video/BV-new/?p=7'
  );
  assert.strictEqual(staleUndo.ok, false);
  assert.strictEqual(staleUndo.reason, 'source-changed');

  chrome.setActiveTab({ id: 91, active: true, url: 'https://untracked.example/' });
  await chrome.events.onActivated.emit({ tabId: 91 });
  await Promise.resolve();
  assert.strictEqual(chrome.calls.update.at(-1).changes.enabled, false);
  assert.strictEqual(
    chrome.calls.update.at(-1).changes.title,
    'Pin and Track the Current Page (3-Pin Limit Reached)'
  );

  const addStorage = createMemoryStorage({ [PINNED_KEY]: [original[1]] });
  const addChrome = createChromeApi();
  const addController = pinnedMenu.createPinnedRecentContextMenuController({
    chromeApi: addChrome.api,
    recentStore,
    storage: addStorage,
    storageKey: PINNED_KEY,
    now: () => 1001
  });
  addController.attach();
  await new Promise((resolve) => setImmediate(resolve));
  await addChrome.events.onActivated.emit({ tabId: 90 });
  await Promise.resolve();
  assert.deepStrictEqual(addChrome.calls.update.at(-1).changes, {
    title: 'Pin and Track the Current Page',
    enabled: true
  });
  await addChrome.events.onClicked.emit({
    menuItemId: pinnedMenu.MENU_ID,
    pageUrl: 'https://untracked.example/'
  }, {
    id: 90,
    active: true,
    url: 'https://untracked.example/',
    title: 'Untracked Example',
    incognito: false
  });
  assert.strictEqual(addStorage.data[PINNED_KEY][0].url, 'https://untracked.example/');
  assert.strictEqual(addStorage.data[PINNED_KEY][0].trackingEnabled, true);
  assert.strictEqual(addStorage.data[PINNED_KEY][0].pinnedAt, 1001);
  assert.deepStrictEqual(addChrome.calls.sendMessage.at(-1), {
    tabId: 90,
    message: {
      action: 'showPinnedRecentUpdateFeedback',
      ok: true,
      reason: 'added',
      cardId: '',
      previous: null,
      current: null
    }
  });
  await Promise.resolve();
  assert.deepStrictEqual(addChrome.calls.update.at(-1).changes, {
    title: 'This Page Is Already the Tracked Link',
    enabled: false
  });

  const incognitoResult = await controller.replaceForTab({
    url: 'https://www.bilibili.com/video/BV-private/?p=2',
    incognito: true
  });
  assert.strictEqual(incognitoResult.changed, false);

  const failedStorage = createFailingStorage(chrome.api.runtime, { [PINNED_KEY]: original });
  const failedController = pinnedMenu.createPinnedRecentContextMenuController({
    chromeApi: chrome.api,
    recentStore,
    storage: failedStorage,
    storageKey: PINNED_KEY
  });
  failedController.attach();
  await failedController.bindTrackingTab(
    { id: 22 },
    recentStore.normalizePinnedRecentSites(original)[0].cardId,
    original[0].url
  );
  const failedResult = await failedController.replaceForTab({
    id: 22,
    url: 'https://www.bilibili.com/video/BV-failed/?p=9',
    incognito: false
  });
  assert.strictEqual(failedResult.changed, false);
  assert.strictEqual(failedStorage.data[PINNED_KEY][0].url, original[0].url);

  console.log('background pinned recent context menu tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
