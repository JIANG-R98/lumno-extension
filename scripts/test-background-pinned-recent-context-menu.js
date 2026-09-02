const assert = require('assert');
const recentStore = require('../src/newtab/recent-sites-store.js');
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
  const onMessage = createEvent();
  const onCreated = createEvent();
  const onRemoved = createEvent();
  const onActivated = createEvent();
  const onUpdated = createEvent();
  const onStorageChanged = createEvent();
  const calls = { create: [], update: [], sendMessage: [] };
  let activeTab = {
    id: 90,
    active: true,
    url: 'https://untracked.example/'
  };
  return {
    calls,
    events: { onClicked, onMessage, onCreated, onRemoved, onActivated, onUpdated, onStorageChanged },
    setActiveTab(tab) {
      activeTab = tab;
    },
    api: {
      contextMenus: {
        onClicked,
        create(details, callback) {
          calls.create.push(details);
          if (callback) callback();
        },
        update(id, changes, callback) {
          calls.update.push({ id, changes });
          if (callback) callback();
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
        onActivated,
        onUpdated,
        query(_queryInfo, callback) {
          callback([activeTab]);
        },
        sendMessage(tabId, message, callback) {
          calls.sendMessage.push({ tabId, message });
          if (callback) callback(
            message && message.action === 'showPinnedRecentUpdatePreview'
              ? { confirmed: config.previewConfirmed !== false }
              : undefined
          );
        }
      },
      storage: { onChanged: onStorageChanged }
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
  assert.strictEqual(replaced.items[0].updatePending, true);
  assert.strictEqual(replaced.items[0].updateHistory.length, 1);
  assert.strictEqual(replaced.items[0].updateHistory[0].url, original[0].url);
  assert.strictEqual(replaced.items[0].updateHistory[0].title, original[0].title);
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

  await chrome.events.onMessage.emit({
    action: 'rememberPinnedRecentTrackingTarget',
    url: original[0].url
  }, {
    tab: { id: 11 }
  });
  chrome.setActiveTab({
    id: 12,
    active: true,
    url: 'https://www.bilibili.com/video/BV-new/?p=7',
    title: 'Conan Collection · Episode 2'
  });
  await chrome.events.onCreated.emit({ id: 12, openerTabId: 11 });
  await chrome.events.onUpdated.emit(12, {
    url: 'https://www.bilibili.com/video/BV-new/?p=7'
  }, {
    id: 12,
    active: true,
    url: 'https://www.bilibili.com/video/BV-new/?p=7'
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(chrome.calls.update.at(-1).changes.enabled, true);
  assert.strictEqual(
    chrome.calls.update.at(-1).changes.title,
    'Update This Tracked Card to the Current Page'
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
  assert.deepStrictEqual(previewCall, {
    tabId: 12,
    message: {
      action: 'showPinnedRecentUpdatePreview',
      previous: { title: 'Course', url: original[0].url },
      current: {
        title: 'Conan Collection · Episode 2',
        url: 'https://www.bilibili.com/video/BV-new/?p=7'
      }
    }
  });
  assert.deepStrictEqual(chrome.calls.sendMessage.at(-1), {
    tabId: 12,
    message: {
      action: 'showPinnedRecentUpdateFeedback',
      ok: true,
      reason: 'updated'
    }
  });

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
      reason: 'added'
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
  await chrome.events.onMessage.emit({
    action: 'rememberPinnedRecentTrackingTarget',
    url: original[0].url
  }, {
    tab: { id: 22 }
  });
  const failedResult = await failedController.replaceForTab({
    id: 22,
    url: 'https://www.bilibili.com/video/BV-failed/?p=9',
    incognito: false
  });
  assert.strictEqual(failedResult.changed, false);
  assert.strictEqual(failedStorage.data[PINNED_KEY][0].url, original[0].url);

  const cancelledStorage = createMemoryStorage({ [PINNED_KEY]: original });
  const cancelledChrome = createChromeApi({ previewConfirmed: false });
  const cancelledController = pinnedMenu.createPinnedRecentContextMenuController({
    chromeApi: cancelledChrome.api,
    recentStore,
    storage: cancelledStorage,
    storageKey: PINNED_KEY
  });
  cancelledController.attach();
  await new Promise((resolve) => setImmediate(resolve));
  await cancelledChrome.events.onMessage.emit({
    action: 'rememberPinnedRecentTrackingTarget',
    url: original[0].url
  }, {
    tab: { id: 33, url: original[0].url }
  });
  const cancelledResult = await cancelledController.confirmAndApplyForTab({
    id: 33,
    url: 'https://www.bilibili.com/video/BV-cancelled/',
    title: 'Cancelled update',
    incognito: false
  });
  assert.strictEqual(cancelledResult.changed, false);
  assert.strictEqual(cancelledResult.reason, 'cancelled');
  assert.strictEqual(cancelledStorage.data[PINNED_KEY][0].url, original[0].url);

  console.log('background pinned recent context menu tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
