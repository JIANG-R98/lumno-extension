const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const settings = require('../../src/domain/settings/index.ts');
const settingsStorage = require('../../src/platform/settings-storage.ts');
const { loadBackground, wait } = require('../helpers/background-harness');
const { createNewtabPage } = require('../helpers/newtab-page');
const { createOptionsPage } = require('../helpers/options-page');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');
const { siteSearchIconCache } = require('../../src/domain/settings/search.ts');

const auditOutput = execFileSync(process.execPath, ['scripts/check/audit-i18n.js'], {
  encoding: 'utf8'
});
const candidateMatch = auditOutput.match(/i18n audit candidate count=(\d+)/);
assert(candidateMatch, 'i18n audit should print a candidate count');
assert.strictEqual(
  Number(candidateMatch[1]),
  0,
  `i18n audit should have no unreviewed candidates:\n${auditOutput}`
);

const localeNames = ['en', 'ja', 'zh_CN', 'zh_TW'];
const localeMessages = Object.fromEntries(localeNames.map((locale) => [
  locale,
  JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))
]));
const expectedBrowserSyncHints = {
  en: 'Lumno settings sync automatically through your current browser\'s built-in sync service. Sync works across devices signed in to the same browser account, but not across different browsers.',
  ja: 'Lumno の設定は、現在のブラウザの標準同期サービスで自動的に同期されます。同じブラウザアカウントでログインしている端末間のみ同期でき、異なるブラウザ間では同期できません。',
  zh_CN: 'Lumno 配置通过当前浏览器的内置同步服务自动同步，仅支持同一浏览器账号下的设备，不支持跨浏览器同步。',
  zh_TW: 'Lumno 設定會透過目前瀏覽器的內建同步服務自動同步；僅支援同一瀏覽器帳號下的裝置，不支援跨瀏覽器同步。'
};
const expectedBrowserSyncDescriptions = {
  en: 'Settings sync automatically through your current browser\'s built-in sync service',
  ja: '現在のブラウザの標準同期サービスで設定を自動的に同期します',
  zh_CN: '配置通过当前浏览器的内置同步服务自动同步',
  zh_TW: '設定會透過目前瀏覽器的內建同步服務自動同步'
};
const expectedBrowserSyncUnavailableHints = {
  en: 'Sync unavailable: check whether your current browser supports built-in sync and has it turned on.',
  ja: '同期できません。現在のブラウザが標準同期に対応し、同期が有効になっているか確認してください。',
  zh_CN: '同步不可用：请检查当前浏览器是否支持并已开启内置同步。',
  zh_TW: '同步無法使用：請檢查目前瀏覽器是否支援並已開啟內建同步。'
};
localeNames.forEach((locale) => {
  assert.strictEqual(
    String(localeMessages[locale].settings_sync_desc?.message || ''),
    expectedBrowserSyncDescriptions[locale],
    `${locale} browser sync description should refer to the current browser instead of Chrome`
  );
  assert.strictEqual(
    String(localeMessages[locale].sync_status_hint?.message || ''),
    expectedBrowserSyncHints[locale],
    `${locale} browser sync tooltip should explain same-browser support and the cross-browser boundary`
  );
  assert.strictEqual(
    String(localeMessages[locale].sync_status_unavailable_hint?.message || ''),
    expectedBrowserSyncUnavailableHints[locale],
    `${locale} unavailable sync tooltip should refer to the current browser instead of Chrome`
  );
});
const chromeSyncKeys = settings.BROWSER_SYNC_KEYS;
const TOPBAR_LOCAL_KEYS = settings.BOOKMARK_TOPBAR_SURFACE_KEYS;

// The Chrome Sync (and WebDAV and export) contract: what syncs, and what
// stays on this device.
[
  ['overlayEnterAnimation', '_x_extension_overlay_enter_animation_2026_unique_'],
  ['bookmarkViewMode', '_x_extension_bookmark_view_mode_2026_unique_'],
  ['bookmarkFolderIconsVisible', '_x_extension_bookmark_folder_icons_visible_2026_unique_'],
  ['newtabShortcutsLegacy', '_x_extension_newtab_shortcuts_2026_unique_'],
  ['newtabShortcutAddVisible', '_x_extension_newtab_shortcut_add_visible_2026_unique_'],
  ['newtabShortcutDockMagnificationEnabled', '_x_extension_newtab_shortcut_dock_magnification_enabled_2026_unique_']
].forEach(([name, key]) => {
  assert.strictEqual(settings[name].key, key, `shared settings should declare ${name}`);
  assert(chromeSyncKeys.includes(key), `${name} should be included in sync, export and import`);
});
[settings.siteSearchCustom.key, settings.bookmarkFolderColorRefs.key, settings.bookmarkFolderColorPresets.key].forEach((key) => {
  assert(chromeSyncKeys.includes(key), `${key} should be in the Chrome Sync and WebDAV contract`);
});
assert(!chromeSyncKeys.includes(siteSearchIconCache.key),
  'regenerable provider-icon cache data must stay out of sync/export/import settings');
TOPBAR_LOCAL_KEYS.forEach((key) => {
  assert(!chromeSyncKeys.includes(key), `options must not export or import local-only ${key}`);
});

// The labels React draws come from their locale messages.
localeNames.forEach((locale) => {
  assert(
    localeMessages[locale].settings_overlay_open_tabs_default_visible_title &&
      String(localeMessages[locale].settings_overlay_open_tabs_default_visible_title.message || '').trim(),
    `${locale} should localize the overlay open-tabs setting label`
  );
});
localeNames.forEach((locale) => {
  [
    'bookmark_topbar_surface_title',
    'bookmark_topbar_surface_adaptive',
    'bookmark_topbar_surface_clear',
    'bookmark_topbar_surface_transparent',
    'bookmark_topbar_surface_custom',
    'bookmark_topbar_color_pick',
    'bookmark_topbar_color_reset',
    'bookmark_topbar_color_picked',
    'bookmark_topbar_color_reset_done',
    'bookmark_topbar_color_unsupported',
    'bookmark_topbar_color_failed'
  ].forEach((key) => {
    assert(
      localeMessages[locale][key] &&
        String(localeMessages[locale][key].message || '').trim(),
      `${locale} should localize ${key}`
    );
  });
});
localeNames.forEach((locale) => {
  assert(
    localeMessages[locale].settings_bookmark_folder_icons_visible_title &&
      String(localeMessages[locale].settings_bookmark_folder_icons_visible_title.message || '').trim(),
    `${locale} should localize the bookmark folder icon setting label`
  );
});
localeNames.forEach((locale) => {
  [
    'settings_newtab_shortcut_add_title',
    'newtab_shortcuts_hide_add',
    'newtab_shortcuts_add_hidden'
  ].forEach((key) => {
    assert(
      localeMessages[locale][key] &&
        String(localeMessages[locale][key].message || '').trim(),
      `${locale} should localize ${key}`
    );
  });
});
localeNames.forEach((locale) => {
  const key = 'settings_newtab_shortcut_dock_magnification_title';
  assert(
    localeMessages[locale][key] &&
      String(localeMessages[locale][key].message || '').trim(),
    `${locale} should localize ${key}`
  );
});

// The worker moves this device's legacy local settings into Chrome Sync on
// startup, and drops what must not live there.
async function testBackgroundMigration() {
  const background = loadBackground({
    local: {
      [settings.overlayEnterAnimation.key]: 'fade',
      [settings.bookmarkViewMode.key]: 'top',
      [settings.bookmarkFolderIconsVisible.key]: false
    },
    sync: Object.assign({ _x_extension_language_messages_2024_unique_: { hello: 'world' } },
      Object.fromEntries(TOPBAR_LOCAL_KEYS.map((key) => [key, key.includes('mode') ? 'clear' : '#aabbcc'])))
  });
  await wait(100);
  const sync = background.storage.sync.data;
  assert.deepStrictEqual(
    [sync[settings.overlayEnterAnimation.key], sync[settings.bookmarkViewMode.key], sync[settings.bookmarkFolderIconsVisible.key]],
    ['fade', 'top', false], 'background startup should migrate the full Chrome Sync contract');
  assert(!Object.hasOwn(sync, '_x_extension_language_messages_2024_unique_'),
    'background startup should remove the obsolete oversized language cache from Chrome Sync');
  assert(TOPBAR_LOCAL_KEYS.every((key) => !Object.hasOwn(sync, key)),
    'background startup should purge local-only bookmark topbar values from Chrome Sync');
}

// A page that finds a setting missing writes its default only when this
// device has no local copy left to migrate; otherwise the default would win
// over the user's old choice.
async function testLegacyLocalChoicesSurvive() {
  const writes = [];
  const area = { set: (values) => writes.push(values) };
  const local = (data) => ({ storage: { local: { get: (keys, callback) => callback(Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]))) } } });
  settingsStorage.writeSettingRepairs(local({ a: 'old' }), area, { a: 'default', b: 'default', c: 'fixed' }, { c: 'broken' });
  assert.deepStrictEqual(writes, [{ c: 'fixed' }, { b: 'default' }],
    'invalid values are repaired at once, missing ones only without a local copy');

  const newtabKeys = [
    settings.newtabFeedbackButtonVisible.key,
    settings.newtabAppearanceButtonVisible.key,
    settings.bookmarkFolderIconsVisible.key,
    settings.recentCount.key
  ];
  const legacy = await createNewtabPage({ local: { [newtabKeys[0]]: false, [newtabKeys[1]]: false, [newtabKeys[2]]: false, [newtabKeys[3]]: 0 } });
  await legacy.settle(800);
  assert.deepStrictEqual(newtabKeys.map((key) => legacy.storage.sync.data[key]), [false, false, false, 0],
    'New Tab should move old local choices into sync instead of saving defaults over them');
  assert.ok(legacy.document.querySelector('.x-nt-feedback-control').hidden, 'and show them');
  legacy.close();
  const fresh = await createNewtabPage({});
  await fresh.settle(600);
  assert.deepStrictEqual(newtabKeys.map((key) => fresh.storage.sync.data[key]), [true, true, true, 4],
    'a device without old choices still saves the defaults');
  fresh.close();

  const options = await createOptionsPage({ local: { [settings.overlayEnterAnimation.key]: 'fade' } });
  await options.settle(500);
  assert.strictEqual(options.storage.sync.data[settings.overlayEnterAnimation.key], 'fade',
    'Settings should move an old local opening animation into sync instead of saving the default over it');
  assert.strictEqual(options.document.querySelector('[data-overlay-enter-animation="fade"]').getAttribute('aria-checked'), 'true');
  options.close();
}

async function testOptionsMigration() {
  const page = await createOptionsPage({ local: { [settings.bookmarkViewMode.key]: 'top' } });
  await page.settle(300);
  assert.strictEqual(page.storage.sync.data[settings.bookmarkViewMode.key], 'top',
    'options should migrate legacy local settings into sync storage');
  page.close();
}

async function testOverlayReadsAnimationAtStartup() {
  const page = await createOverlayPage({ stylesheetsLoad: true });
  await page.open({});
  await page.settle(100);
  assert(page.storageReads.some((keys) => keys.length > 1 && keys.includes(settings.overlayEnterAnimation.key)),
    'overlay runtime should read the synchronized opening-animation preference in its batched startup settings');
  page.close();
}

// The bookmark top bar's material stays on this device.
async function testTopbarMaterialIsLocal() {
  const [modeKey, lightKey, darkKey, legacyKey] = TOPBAR_LOCAL_KEYS;
  const page = await createNewtabPage({
    local: { [settings.bookmarkViewMode.key]: 'top', [modeKey]: 'custom', [lightKey]: '#112233' },
    sync: { [settings.bookmarkViewMode.key]: 'top', [modeKey]: 'adaptive', [lightKey]: '#aabbcc', [darkKey]: '#ddeeff', [legacyKey]: '#445566' },
    bookmarks: [{ id: 'u1', title: 'U', url: 'https://u.example/' }]
  });
  await page.settle(500);
  const topbar = page.document.querySelector('.x-nt-bookmarks-topbar');
  assert.strictEqual(topbar.getAttribute('data-surface-mode'), 'custom', 'material mode should load from current-device storage');
  assert.strictEqual(topbar.style.getPropertyValue('--x-nt-bookmarks-topbar-surface'), '#112233',
    'initial topbar appearance should use only current-device values');
  assert.deepStrictEqual(page.storage.local.writes.filter((write) => TOPBAR_LOCAL_KEYS.some((key) => Object.hasOwn(write, key))), [],
    'Sync values must never be imported into local topbar settings');
  page.changeStorage('sync', modeKey, 'transparent');
  await page.settle(100);
  assert.strictEqual(topbar.getAttribute('data-surface-mode'), 'custom', 'live bookmark topbar material updates should ignore Sync');
  page.changeStorage('local', modeKey, 'transparent');
  await page.settle(100);
  assert.strictEqual(topbar.getAttribute('data-surface-mode'), 'transparent', 'and follow this device');
  page.close();
}

// The bookmark view mode lives in Sync; an empty Sync recovers this
// device's last mode, unless WebDAV is the device's source.
async function testBookmarkViewMode() {
  const KEY = settings.bookmarkViewMode.key;
  const recovered = await createNewtabPage({ local: { [KEY]: 'top' } });
  await recovered.settle(400);
  assert.strictEqual(recovered.document.body.getAttribute('data-bookmark-view-mode'), 'top',
    'an empty sync mode should fall back to the last local mode before choosing a default');
  assert.strictEqual(recovered.storage.sync.data[KEY], 'top', 'a recovered local bookmark mode should be written back to sync storage');
  recovered.close();

  const webdav = await createNewtabPage({ local: { [settings.localPrimary.key]: true, [KEY]: 'top' } });
  await webdav.settle(400);
  assert.ok(!webdav.storage.sync.writes.some((write) => Object.hasOwn(write, KEY)),
    'a WebDAV device must not migrate its complete local source into Chrome');
  webdav.close();
}

// Folder colors from another device are applied without writing back, so
// two devices never bounce a renamed folder.
async function testFolderColorsFromAnotherDevice() {
  const KEY = settings.bookmarkFolderColorRefs.key;
  const page = await createNewtabPage({ bookmarks: [{ id: 'f1', title: 'Work', children: [{ id: 'u1', title: 'U', url: 'https://u.example/' }] }] });
  await page.settle(400);
  const before = page.storage.sync.writes.length;
  page.changeStorage('sync', KEY, { 'Bookmarks bar/Work': 'blue' });
  await page.settle(300);
  assert.ok(!page.storage.sync.writes.slice(before).some((write) => Object.hasOwn(write, KEY)),
    'a folder color map from another device is resolved without writing back');
  page.close();
}

// The appearance panel names its shortcut settings in the page language.
async function testShortcutSettingLabels() {
  const page = await createNewtabPage({ sync: { [settings.language.key]: 'en' } });
  await page.settle(300);
  page.click(page.document.querySelector('.x-nt-wallpaper-button'));
  await page.settle(400);
  const text = page.document.querySelector('.x-nt-wallpaper-panel').textContent;
  ['settings_newtab_shortcut_add_title', 'settings_newtab_shortcut_dock_magnification_title'].forEach((key) => {
    assert(text.includes(localeMessages.en[key].message), `the appearance panel should show ${key}`);
  });
  page.close();
}

(async () => {
  await testBackgroundMigration();
  await testOptionsMigration();
  await testLegacyLocalChoicesSurvive();
  await testOverlayReadsAnimationAtStartup();
  await testTopbarMaterialIsLocal();
  await testBookmarkViewMode();
  await testFolderColorsFromAnotherDevice();
  await testShortcutSettingLabels();
  console.log('i18n and sync audit tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
