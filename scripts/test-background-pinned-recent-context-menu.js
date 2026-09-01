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
      listeners.forEach((listener) => listener(...args));
    }
  };
}

function createChromeApi() {
  const onClicked = createEvent();
  const onShown = createEvent();
  const calls = { create: [], refresh: 0, update: [] };
  return {
    calls,
    api: {
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
          return key === 'recent_replace_pinned_url_with_current'
            ? 'Replace Pinned URL with Current'
            : '';
        }
      },
      runtime: { lastError: null }
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
    { recentStore, now: () => 999 }
  );
  assert.strictEqual(replaced.changed, true);
  assert.strictEqual(replaced.items[0].url, 'https://www.bilibili.com/video/BV-new/?p=7');
  assert.strictEqual(replaced.items[0].title, 'Course');
  assert.strictEqual(replaced.items[0].siteName, 'Bilibili');
  assert.strictEqual(replaced.items[0].pinnedAt, 123);
  assert.strictEqual(replaced.items[0].trackingEnabled, true);
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

  const storage = createMemoryStorage({ [PINNED_KEY]: original });
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
    title: 'Replace Pinned URL with Current',
    contexts: ['all'],
    documentUrlPatterns: ['http://*/*', 'https://*/*'],
    enabled: false
  });

  await controller.refreshForTab({
    url: 'https://www.bilibili.com/video/BV-new/?p=7',
    incognito: false
  });
  assert.deepStrictEqual(chrome.calls.update.at(-1), {
    id: pinnedMenu.MENU_ID,
    changes: { enabled: true }
  });
  assert.strictEqual(chrome.calls.refresh, 1);

  const result = await controller.replaceForTab({
    url: 'https://www.bilibili.com/video/BV-new/?p=7',
    incognito: false
  });
  assert.strictEqual(result.changed, true);
  assert.strictEqual(storage.data[PINNED_KEY][0].url, 'https://www.bilibili.com/video/BV-new/?p=7');
  assert.strictEqual(storage.data[PINNED_KEY][0].pinnedAt, 123);

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
  const failedResult = await failedController.replaceForTab({
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
