const assert = require('assert');

const shortcutsStore = require('../src/newtab/shortcuts-store.js');

function createMemoryStorage(initialData) {
  const data = { ...(initialData || {}) };
  return {
    get(keys, callback) {
      const result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        result[key] = data[key];
      });
      callback(result);
    },
    set(value, callback) {
      Object.assign(data, value || {});
      if (callback) {
        callback();
      }
    },
    data
  };
}

function testCreatesShortcutFromLooseUrl() {
  const shortcut = shortcutsStore.createShortcutRecord({
    title: ' Lumno ',
    url: 'lumno.kubai.design'
  }, {
    now: 42,
    sanitizeDisplayText: (value) => String(value || '').trim()
  });

  assert.deepStrictEqual(
    {
      id: shortcut.id,
      title: shortcut.title,
      url: shortcut.url,
      host: shortcut.host,
      createdAt: shortcut.createdAt,
      updatedAt: shortcut.updatedAt
    },
    {
      id: 'shortcut-42-3q8b1x',
      title: 'Lumno',
      url: 'https://lumno.kubai.design/',
      host: 'lumno.kubai.design',
      createdAt: 42,
      updatedAt: 42
    }
  );
}

function testFallsBackToHostForEmptyTitle() {
  const shortcut = shortcutsStore.createShortcutRecord({
    title: '',
    url: 'https://www.example.com/tools?q=1'
  }, {
    now: 7,
    normalizeHost: (host) => String(host || '').replace(/^www\./, '')
  });

  assert.strictEqual(shortcut.title, 'example.com');
  assert.strictEqual(shortcut.host, 'example.com');
}

function testCreatesBrowserInternalShortcuts() {
  const shortcut = shortcutsStore.createShortcutRecord({
    title: 'Inspect devices',
    url: ' chrome://inspect/#devices '
  }, { now: 42 });

  assert.strictEqual(shortcut.title, 'Inspect devices');
  assert.strictEqual(shortcut.url, 'chrome://inspect/#devices');
  assert.strictEqual(shortcut.host, 'inspect');
  assert.strictEqual(shortcut.createdAt, 42);
  assert.strictEqual(shortcut.updatedAt, 42);

  ['chrome', 'edge', 'brave', 'vivaldi', 'opera'].forEach((scheme) => {
    assert.strictEqual(
      shortcutsStore.normalizeShortcutUrl(`${scheme.toUpperCase()}://SETTINGS`),
      `${scheme}://settings/`
    );
    assert.strictEqual(
      shortcutsStore.normalizeShortcutUrl(`${scheme}://settings/content?search=camera#permissions`),
      `${scheme}://settings/content?search=camera#permissions`
    );
  });
  assert.strictEqual(
    shortcutsStore.createShortcutRecord({ url: 'chrome://extensions/' }).title,
    'extensions'
  );
}

function testRejectsUnsafeOrMissingUrls() {
  [
    '',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///tmp/example.html',
    'chrome-extension://example/options.html',
    'custom://settings/',
    'chrome://',
    'chrome:settings',
    'chrome:///settings',
    'chrome://user@settings/',
    'chrome://user:password@settings/',
    'chrome://settings:80/'
  ].forEach((url) => {
    assert.strictEqual(
      shortcutsStore.createShortcutRecord({ title: 'Bad', url }),
      null,
      `${url} should not be accepted as a shortcut URL`
    );
  });
}

async function testBrowserInternalShortcutsSurviveStorageAndEditing() {
  const key = '_test_internal_shortcuts';
  const storage = createMemoryStorage();
  const saved = await shortcutsStore.saveShortcuts(storage, [
    { id: 'inspect', title: 'Inspect', url: 'chrome://inspect/#devices' },
    { id: 'settings', title: 'Settings', url: 'chrome://settings' },
    { id: 'duplicate', title: 'Duplicate', url: 'CHROME://SETTINGS/' },
    { id: 'example', title: 'Example', url: 'https://example.com/' }
  ], { key, now: 10 });
  const loaded = await shortcutsStore.loadShortcuts(storage, { key, now: 20 });

  assert.deepStrictEqual(loaded, saved);
  assert.deepStrictEqual(loaded.map((item) => item.id), ['inspect', 'settings', 'example']);
  assert.strictEqual(loaded[0].url, 'chrome://inspect/#devices');
  assert.strictEqual(loaded[1].url, 'chrome://settings/');

  const edited = loaded.map((item) => item.id === 'inspect'
    ? { ...item, title: 'Network', url: 'chrome://net-export/' }
    : item);
  await shortcutsStore.saveShortcuts(storage, edited, { key, now: 30 });
  const reloaded = await shortcutsStore.loadShortcuts(storage, { key, now: 40 });
  assert.strictEqual(reloaded[0].id, 'inspect');
  assert.strictEqual(reloaded[0].title, 'Network');
  assert.strictEqual(reloaded[0].url, 'chrome://net-export/');
  assert.strictEqual(reloaded[0].createdAt, 10);
}

function testNormalizesAndDeduplicatesShortcuts() {
  const shortcuts = shortcutsStore.normalizeShortcuts([
    { id: 'one', title: 'One', url: 'https://one.example/' },
    { id: 'dupe', title: 'Duplicate', url: 'one.example' },
    { id: 'bad', title: 'Bad', url: 'javascript:alert(1)' },
    { id: 'two', title: 'Two', url: 'https://two.example/' }
  ], {
    maxShortcuts: 8
  });

  assert.deepStrictEqual(
    shortcuts.map((shortcut) => shortcut.title),
    ['One', 'Two']
  );
}

function createShortcutInputs(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `shortcut-${index + 1}`,
    title: `Shortcut ${index + 1}`,
    url: `https://shortcut-${index + 1}.example/`
  }));
}

function testDefaultCapacityAllowsSixtyShortcuts() {
  const shortcuts = shortcutsStore.normalizeShortcuts(
    createShortcutInputs(61)
  );

  assert.strictEqual(shortcutsStore.DEFAULT_MAX_SHORTCUTS, 60);
  assert.strictEqual(
    shortcuts.length,
    60,
    'the default capacity should retain sixty shortcuts and discard overflow'
  );
  assert.strictEqual(shortcuts[0].id, 'shortcut-1');
  assert.strictEqual(shortcuts[59].id, 'shortcut-60');
}

function testDefaultShortcutsContainLumno() {
  const shortcuts = shortcutsStore.getDefaultShortcuts({
    now: 123
  });

  assert.deepStrictEqual(
    shortcuts.map((shortcut) => ({
      title: shortcut.title,
      url: shortcut.url,
      host: shortcut.host,
      createdAt: shortcut.createdAt,
      updatedAt: shortcut.updatedAt
    })),
    [
      {
        title: 'Lumno',
        url: 'https://lumno.kubai.design/',
        host: 'lumno.kubai.design',
        createdAt: 123,
        updatedAt: 123
      }
    ],
    'missing shortcut storage should default to the Lumno shortcut'
  );
}

async function testLoadsDefaultShortcutsOnlyWhenStorageKeyIsMissing() {
  const key = '_test_shortcuts_default';
  const storage = createMemoryStorage();
  const missingKeyShortcuts = await shortcutsStore.loadShortcuts(storage, {
    key,
    now: 456
  });

  assert.deepStrictEqual(
    missingKeyShortcuts.map((shortcut) => shortcut.title),
    ['Lumno'],
    'first run should seed the visible shortcuts with Lumno'
  );

  storage.data[key] = [];
  const explicitEmptyShortcuts = await shortcutsStore.loadShortcuts(storage, {
    key,
    now: 789
  });

  assert.deepStrictEqual(
    explicitEmptyShortcuts,
    [],
    'an explicitly saved empty shortcut list should stay empty'
  );
}

async function testSaveShortcutDoesNotEvictOldestAtMaximumLimit() {
  const key = '_test_shortcuts';
  const storage = createMemoryStorage({
    [key]: [
      { id: 'one', title: 'One', url: 'https://one.example/' },
      { id: 'two', title: 'Two', url: 'https://two.example/' }
    ]
  });

  const saved = await shortcutsStore.saveShortcut(storage, {
    title: 'Three',
    url: 'three.example'
  }, {
    key,
    maxShortcuts: 2,
    now: 99
  });

  assert.deepStrictEqual(
    saved.map((shortcut) => shortcut.title),
    ['One', 'Two'],
    'a full shortcut store should preserve existing shortcuts instead of silently evicting the oldest'
  );
  assert.deepStrictEqual(storage.data[key], saved);
}

async function testSaveShortcutsPreservesExplicitOrder() {
  const key = '_test_shortcuts_order';
  const storage = createMemoryStorage();
  const saved = await shortcutsStore.saveShortcuts(storage, [
    { id: 'three', title: 'Three', url: 'https://three.example/' },
    { id: 'one', title: 'One', url: 'https://one.example/' },
    { id: 'two', title: 'Two', url: 'https://two.example/' }
  ], {
    key,
    maxShortcuts: 8
  });

  assert.deepStrictEqual(
    saved.map((shortcut) => shortcut.id),
    ['three', 'one', 'two'],
    'bulk saving shortcuts should preserve the caller-provided order'
  );
  assert.deepStrictEqual(storage.data[key], saved);
}

async function testDefaultStorageSplitsSixtyShortcutsIntoQuotaSafeChunks() {
  const key = '_test_shortcuts_chunked';
  const storage = createMemoryStorage();
  const options = {
    key,
    maxShortcuts: 60,
    now: 123
  };
  const inputs = createShortcutInputs(60);
  const saved = await shortcutsStore.saveShortcuts(storage, inputs, options);
  const keys = shortcutsStore.getShortcutStorageKeys(options);

  assert.deepStrictEqual(
    keys,
    [key, `${key}_chunk_2`, `${key}_chunk_3`],
    'sixty shortcuts should use three storage items'
  );
  keys.forEach((chunkKey) => {
    assert.strictEqual(storage.data[chunkKey].length, 20);
    assert(
      shortcutsStore.getShortcutStorageItemByteSize(chunkKey, storage.data[chunkKey]) <=
        shortcutsStore.DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES,
      'each representative shortcut chunk should stay below the Chrome Sync per-item quota'
    );
  });

  const loaded = await shortcutsStore.loadShortcuts(storage, options);
  assert.deepStrictEqual(
    loaded.map((shortcut) => shortcut.id),
    saved.map((shortcut) => shortcut.id),
    'chunked shortcut storage should preserve all sixty shortcuts in order'
  );

  await shortcutsStore.saveShortcuts(storage, inputs.slice(0, 5), options);
  assert.deepStrictEqual(storage.data[keys[1]], []);
  assert.deepStrictEqual(storage.data[keys[2]], []);
  const reduced = await shortcutsStore.loadShortcuts(storage, options);
  assert.strictEqual(reduced.length, 5, 'saving fewer shortcuts should clear stale chunks');
}

function testByteAwarePlanMovesOversizedTailToLocalOverflow() {
  const inputs = Array.from({ length: 60 }, (_, index) => ({
    id: `long-shortcut-${index + 1}`,
    title: `Long shortcut ${index + 1} ${'标题'.repeat(16)}`,
    url: `https://long-${index + 1}.example/path?query=${'x'.repeat(300)}`
  }));
  const plan = shortcutsStore.createShortcutStoragePlan(inputs, {
    maxShortcuts: 60,
    now: 123
  });

  assert(plan.syncedItems.length > 0, 'a long shortcut set should still sync a safe prefix');
  assert(plan.overflowItems.length > 0, 'items beyond the protected byte budget should remain local');
  assert.strictEqual(
    plan.syncedItems.length + plan.overflowItems.length,
    60,
    'quota planning must preserve every shortcut across sync and local storage'
  );
  Object.entries(plan.payload).forEach(([key, value]) => {
    assert(
      shortcutsStore.getShortcutStorageItemByteSize(key, value) <=
        shortcutsStore.DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES,
      `${key} should stay inside the protected per-item byte budget`
    );
  });
  assert(
    plan.totalBytes <= shortcutsStore.DEFAULT_SHORTCUTS_SYNC_TOTAL_BUDGET_BYTES,
    'shortcut sync data should remain inside its dedicated total budget'
  );
  assert.deepStrictEqual(
    shortcutsStore.mergeShortcutLists(plan.syncedItems, plan.overflowItems)
      .map((item) => item.id),
    inputs.map((item) => item.id),
    'loading the synced prefix with local overflow should restore the original order'
  );
}

async function testQuotaOverflowAndStorageFailuresAreObservable() {
  const oversized = [{
    id: 'oversized',
    title: 'Oversized',
    url: `https://oversized.example/path?query=${'x'.repeat(9000)}`
  }];
  await assert.rejects(
    shortcutsStore.saveShortcuts(createMemoryStorage(), oversized),
    (error) => error && error.code === 'SHORTCUT_SYNC_QUOTA_EXCEEDED',
    'callers without a local overflow layer should receive a quota error'
  );

  const writeError = { message: 'QUOTA_BYTES quota exceeded' };
  await assert.rejects(
    shortcutsStore.saveShortcuts({
      set(_value, callback) {
        callback();
      }
    }, createShortcutInputs(1), {
      getLastError: () => writeError
    }),
    (error) => error &&
      error.code === 'SHORTCUT_STORAGE_WRITE_FAILED' &&
      error.message === writeError.message,
    'Chrome callback errors must reject instead of reporting a false save success'
  );
}

async function testFolderReferencesSurviveStorageAndDeduplicateIndependentlyFromUrls() {
  const folder = shortcutsStore.createShortcutRecord({ type: 'folder', folderId: '42', title: 'Design' }, { now: 9 });
  assert.strictEqual(folder.url, undefined);
  assert.strictEqual(folder.id, 'shortcut-folder-42');
  assert.strictEqual(shortcutsStore.normalizeShortcutItem({ type: 'folder', folderId: '0' }), null);
  const storage = createMemoryStorage();
  await shortcutsStore.saveShortcuts(storage, [folder,
    { type: 'folder', folderId: '42', title: 'Duplicate' },
    { type: 'folder', folderId: '43', title: 'Other folder' },
    { url: 'https://example.com/', title: 'Site' }
  ]);
  const loaded = await shortcutsStore.loadShortcuts(storage);
  assert.strictEqual(loaded.length, 3);
  assert.strictEqual(loaded[0].folderId, '42');
  assert.strictEqual(loaded[1].folderId, '43');
  assert.strictEqual(loaded[2].url, 'https://example.com/');
}

async function run() {
  const sourceStorage = createMemoryStorage();
  await shortcutsStore.saveShortcuts(sourceStorage, [
    { url: 'https://service.example/', iconSource: 'service' },
    { url: 'https://favicon-is.example/', iconSource: 'favicon-is' },
    { url: 'https://cache.example/', iconSource: 'cache' },
    { url: 'https://custom.example/', iconSource: 'custom' },
    { url: 'https://github.com/', iconSource: 'builtin' },
    { url: 'https://legacy.example/' },
    { url: 'https://invalid.example/', iconSource: 'unapproved' }
  ]);
  const sourceRecords = await shortcutsStore.loadShortcuts(sourceStorage);
  assert.deepStrictEqual(sourceRecords.map((item) => item.iconSource),
    ['service', 'favicon-is', 'cache', 'custom', 'builtin', undefined, undefined],
    'source preferences must survive storage without rewriting legacy or invalid sources');
  await testFolderReferencesSurviveStorageAndDeduplicateIndependentlyFromUrls();
  testCreatesShortcutFromLooseUrl();
  testFallsBackToHostForEmptyTitle();
  testCreatesBrowserInternalShortcuts();
  testRejectsUnsafeOrMissingUrls();
  await testBrowserInternalShortcutsSurviveStorageAndEditing();
  testNormalizesAndDeduplicatesShortcuts();
  testDefaultCapacityAllowsSixtyShortcuts();
  testDefaultShortcutsContainLumno();
  await testLoadsDefaultShortcutsOnlyWhenStorageKeyIsMissing();
  await testSaveShortcutDoesNotEvictOldestAtMaximumLimit();
  await testSaveShortcutsPreservesExplicitOrder();
  await testDefaultStorageSplitsSixtyShortcutsIntoQuotaSafeChunks();
  testByteAwarePlanMovesOversizedTailToLocalOverflow();
  await testQuotaOverflowAndStorageFailuresAreObservable();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
