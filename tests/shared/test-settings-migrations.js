const assert = require('assert');
const migrations = { ...require('../../src/domain/settings/migrations.ts'), ...require('../../src/domain/settings/removed.ts'), settingsSchemaVersion: require('../../src/domain/settings/sync-state.ts').settingsSchemaVersion };
const settings = require('../../src/domain/settings/index.ts');
const { runSettingsMigrations } = require('../../src/platform/settings-migration.ts');

const VERSION_KEY = migrations.settingsSchemaVersion.key;

// What devices that ran older versions hold, in the shapes those versions
// wrote. Preferences every version shares stay next to the leftovers so a
// test can tell the two apart.
const SHARED_SYNC_PREFERENCES = Object.freeze({
  [settings.themeMode.key]: 'dark',
  [settings.language.key]: 'zh_CN',
  [settings.bookmarkViewMode.key]: 'top'
});

// 0.9.3-0.9.45 cached the loaded messages.json of the UI language.
const LANGUAGE_MESSAGES_CACHE = Object.freeze({
  locale: 'zh_CN',
  messages: { newtab_search_placeholder: { message: '搜索或输入网址' } }
});

// The AI search of early 2026: mode and provider in sync, a cached
// entitlement, and the user's own API key on the device.
const AI_SEARCH_SYNC = Object.freeze({
  _x_extension_ai_search_mode_2026_unique_: true,
  _x_extension_ai_provider_2026_unique_: 'openai',
  _x_extension_ai_entitlement_cache_2026_unique_: { plan: 'byok', status: 'active', updatedAt: 1773158400000 }
});
const AI_SEARCH_LOCAL = Object.freeze({
  _x_extension_ai_api_key_2026_unique_: 'sk-test-0000000000000000'
});

// 0.9.20 synced one bookmark bar color; 0.9.21 split it per theme.
const BOOKMARK_TOPBAR_SYNC = Object.freeze({
  _x_extension_bookmark_topbar_surface_color_2026_unique_: '#2f6feb',
  _x_extension_bookmark_topbar_surface_color_light_2026_unique_: '#f4f1ea',
  _x_extension_bookmark_topbar_surface_color_dark_2026_unique_: '#1f2329'
});

// Development builds before the fonts became device-only.
const OVERLAY_FONT_SYNC = Object.freeze({
  [settings.overlayFontFamily.key]: 'PingFang SC',
  [settings.overlayFontFallback.key]: '',
  [settings.overlayFontLabels.key]: { 'PingFang SC': '苹方-简' }
});

const LEGACY_ICON_CACHES = Object.freeze(Object.fromEntries(
  migrations.LEGACY_SITE_SEARCH_ICON_KEYS.map((key) => [key, { google: { dataUrl: 'data:image/png;base64,AAAA', updatedAt: 1769817600000 } }])
));

function createArea(initial, failures) {
  const area = {
    values: { ...initial },
    writes: [],
    get(keys, callback) {
      const list = keys === null ? Object.keys(area.values) : [].concat(keys);
      const result = {};
      list.forEach((key) => {
        if (Object.hasOwn(area.values, key)) result[key] = area.values[key];
      });
      setTimeout(() => callback(result), 0);
    },
    set(items, callback) {
      area.writes.push(['set', Object.keys(items)]);
      setTimeout(() => {
        if (failures && failures.set) {
          failures.chrome.runtime.lastError = { message: failures.set };
        } else {
          Object.assign(area.values, items);
        }
        if (callback) callback();
        if (failures) failures.chrome.runtime.lastError = null;
      }, 0);
    },
    remove(keys, callback) {
      area.writes.push(['remove', [].concat(keys)]);
      setTimeout(() => {
        if (failures && failures.remove) {
          failures.chrome.runtime.lastError = { message: failures.remove };
        } else {
          [].concat(keys).forEach((key) => { delete area.values[key]; });
        }
        if (callback) callback();
        if (failures) failures.chrome.runtime.lastError = null;
      }, 0);
    }
  };
  return area;
}

function createChrome({ sync, local, syncFailures, withoutSync } = {}) {
  const chrome = { runtime: { lastError: null }, storage: {} };
  chrome.storage.local = createArea(local || {});
  if (!withoutSync) {
    chrome.storage.sync = createArea(sync || {}, syncFailures ? { ...syncFailures, chrome } : null);
  }
  return chrome;
}

function testMigrationList() {
  const versions = migrations.SETTINGS_MIGRATIONS.map((migration) => migration.version);
  assert.deepStrictEqual(versions, versions.map((_, index) => index + 1),
    'migrations are numbered 1, 2, 3... in order, so every device runs each one exactly once');
  assert.strictEqual(migrations.SETTINGS_SCHEMA_VERSION, versions[versions.length - 1]);
  migrations.SETTINGS_MIGRATIONS.forEach((migration) => {
    assert.ok(migration.summary.length > 0, `migration ${migration.version} says why it exists`);
  });
}

// A migration must never delete a preference the current version syncs.
function testRemovalsSpareLivePreferences() {
  const plan = migrations.planSettingsMigrations(0, { sync: {}, local: {} });
  const live = new Set(settings.BROWSER_SYNC_KEYS);
  plan.patch.sync.remove.forEach((key) => {
    assert.ok(!live.has(key), `${key} is a live synced preference and must not be removed from sync`);
  });
  assert.ok(!plan.patch.local.remove.includes(VERSION_KEY));
}

function testPlanFromAnOldDevice() {
  const plan = migrations.planSettingsMigrations(undefined, {
    sync: { ...SHARED_SYNC_PREFERENCES, ...AI_SEARCH_SYNC, ...BOOKMARK_TOPBAR_SYNC, ...OVERLAY_FONT_SYNC },
    local: { _x_extension_language_messages_2024_unique_: LANGUAGE_MESSAGES_CACHE, ...AI_SEARCH_LOCAL, ...LEGACY_ICON_CACHES }
  });
  assert.strictEqual(plan.version, migrations.SETTINGS_SCHEMA_VERSION);
  assert.deepStrictEqual(plan.patch.sync.set, {});
  assert.deepStrictEqual(plan.patch.local.set, {});
  assert.deepStrictEqual(new Set(plan.patch.sync.remove), new Set([
    migrations.LANGUAGE_MESSAGES_KEY,
    ...migrations.REMOVED_AI_SYNC_KEYS,
    ...settings.BOOKMARK_TOPBAR_SURFACE_KEYS,
    ...settings.OVERLAY_FONT_KEYS
  ]));
  assert.deepStrictEqual(new Set(plan.patch.local.remove), new Set([
    migrations.LANGUAGE_MESSAGES_KEY,
    ...migrations.REMOVED_AI_LOCAL_KEYS,
    ...migrations.LEGACY_SITE_SEARCH_ICON_KEYS
  ]));
  assert.ok(Object.keys(SHARED_SYNC_PREFERENCES).every((key) => !plan.patch.sync.remove.includes(key)),
    'preferences every version shares are left alone');

  const partial = migrations.planSettingsMigrations(3, { sync: {}, local: {} });
  assert.strictEqual(partial.version, migrations.SETTINGS_SCHEMA_VERSION);
  assert.deepStrictEqual(partial.patch.local.remove, [], 'a device at version 3 skips the local cleanups it ran');
  assert.deepStrictEqual(migrations.planSettingsMigrations(migrations.SETTINGS_SCHEMA_VERSION, { sync: {}, local: {} }).patch,
    { sync: { set: {}, remove: [] }, local: { set: {}, remove: [] } });
  assert.strictEqual(migrations.planSettingsMigrations(99, { sync: {}, local: {} }).version, 99,
    'a device that ran a newer version keeps its version when an older one starts');
  assert.strictEqual(migrations.settingsSchemaVersion.parse('3'), 0);
  assert.strictEqual(migrations.settingsSchemaVersion.parse(2.5), 0);
}

// Each migration sees the data as the ones before it left it, and the
// combined patch has the effect of running them one after another.
function testMigrationsChain() {
  const chain = [
    {
      version: 1,
      summary: 'rename',
      reads: { sync: ['old'], local: [] },
      migrate: (snapshot) => ({
        sync: { set: { renamed: snapshot.sync.old }, remove: ['old'] },
        local: { set: { scratch: 1 }, remove: [] }
      })
    },
    {
      version: 2,
      summary: 'convert',
      reads: { sync: ['renamed'], local: ['scratch'] },
      migrate: (snapshot) => ({
        sync: { set: { converted: `${snapshot.sync.renamed}!` }, remove: [] },
        local: { set: {}, remove: ['scratch'] }
      })
    }
  ];
  assert.deepStrictEqual(migrations.getSettingsMigrationReads(chain), { sync: ['old', 'renamed'], local: ['scratch'] });
  const snapshot = { sync: { old: 'value', kept: true }, local: {} };
  const plan = migrations.planSettingsMigrations(0, snapshot, chain);
  assert.strictEqual(plan.version, 2);
  assert.deepStrictEqual(plan.patch, {
    sync: { set: { renamed: 'value', converted: 'value!' }, remove: ['old'] },
    local: { set: {}, remove: ['scratch'] }
  });
  assert.deepStrictEqual(migrations.applySettingsPatch(snapshot, plan.patch),
    { sync: { kept: true, renamed: 'value', converted: 'value!' }, local: {} });
  assert.deepStrictEqual(snapshot, { sync: { old: 'value', kept: true }, local: {} }, 'planning never changes its input');
  assert.strictEqual(migrations.planSettingsMigrations(1, snapshot, chain).patch.sync.set.converted, 'undefined!',
    'a device past version 1 runs only what follows it');
}

async function testRunOnAnOldDevice() {
  const chrome = createChrome({
    sync: { ...SHARED_SYNC_PREFERENCES, ...AI_SEARCH_SYNC, ...BOOKMARK_TOPBAR_SYNC, ...OVERLAY_FONT_SYNC },
    local: { _x_extension_language_messages_2024_unique_: LANGUAGE_MESSAGES_CACHE, ...AI_SEARCH_LOCAL, ...LEGACY_ICON_CACHES,
      [settings.overlayFontFamily.key]: 'PingFang SC' }
  });
  assert.strictEqual(await runSettingsMigrations(chrome), migrations.SETTINGS_SCHEMA_VERSION);
  assert.deepStrictEqual(chrome.storage.sync.values, SHARED_SYNC_PREFERENCES);
  assert.deepStrictEqual(chrome.storage.local.values, {
    [settings.overlayFontFamily.key]: 'PingFang SC',
    [VERSION_KEY]: migrations.SETTINGS_SCHEMA_VERSION
  }, 'the device keeps its own font choice; the sync copy is what goes');

  chrome.storage.sync.writes.length = 0;
  chrome.storage.local.writes.length = 0;
  assert.strictEqual(await runSettingsMigrations(chrome), migrations.SETTINGS_SCHEMA_VERSION);
  assert.deepStrictEqual([chrome.storage.sync.writes, chrome.storage.local.writes], [[], []],
    'a migrated device writes nothing on its next start');
}

async function testRunFromAPartialVersion() {
  const chrome = createChrome({
    sync: { ...AI_SEARCH_SYNC, ...BOOKMARK_TOPBAR_SYNC },
    local: { ...AI_SEARCH_LOCAL, [VERSION_KEY]: 3 }
  });
  await runSettingsMigrations(chrome);
  assert.deepStrictEqual(Object.keys(chrome.storage.sync.values).sort(), Object.keys(AI_SEARCH_SYNC).sort(),
    'migrations 1-3 already ran on this device and are not repeated');
  assert.strictEqual(chrome.storage.local.values[VERSION_KEY], migrations.SETTINGS_SCHEMA_VERSION);
}

async function testFailedWriteKeepsTheVersion() {
  const chrome = createChrome({
    sync: { ...AI_SEARCH_SYNC },
    syncFailures: { remove: 'QUOTA_BYTES_PER_HOUR quota exceeded' }
  });
  await assert.rejects(runSettingsMigrations(chrome), /QUOTA_BYTES_PER_HOUR/);
  assert.ok(!Object.hasOwn(chrome.storage.local.values, VERSION_KEY),
    'the version is recorded only after every change is written, so the next start retries');
}

async function testRunWithoutBrowserSync() {
  const chrome = createChrome({ withoutSync: true, local: { ...AI_SEARCH_LOCAL } });
  assert.strictEqual(await runSettingsMigrations(chrome), migrations.SETTINGS_SCHEMA_VERSION);
  assert.deepStrictEqual(chrome.storage.local.values, { [VERSION_KEY]: migrations.SETTINGS_SCHEMA_VERSION });
  assert.strictEqual(await runSettingsMigrations({ runtime: {} }), 0, 'no storage, nothing to migrate');
}

(async () => {
  testMigrationList();
  testRemovalsSpareLivePreferences();
  testPlanFromAnOldDevice();
  testMigrationsChain();
  await testRunOnAnOldDevice();
  await testRunFromAPartialVersion();
  await testFailedWriteKeepsTheVersion();
  await testRunWithoutBrowserSync();
  console.log('settings migrations tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
