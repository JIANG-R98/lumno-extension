const assert = require('assert');
const fs = require('fs');
const path = require('path');
const settings = require('../../src/domain/settings/index.ts');
const { getManifestContentScripts } = require('../helpers/runtime-scripts');

// What the tab switcher needs from the manifest, the locales and the Settings
// page markup. Its behavior is covered by test-tab-switcher-runtime.js,
// test-tab-switcher-page-bridge.js and
// tests/background/test-background-tab-switcher-command.js.

const repoRoot = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
const localeNames = ['en', 'ja', 'zh_CN', 'zh_TW'];
const localeMessages = Object.fromEntries(localeNames.map((locale) => [
  locale,
  JSON.parse(fs.readFileSync(path.join(repoRoot, `_locales/${locale}/messages.json`), 'utf8'))
]));

const contentScripts = getManifestContentScripts();
assert.ok(
  contentScripts.every((files) => !files.includes('src/shared/tab-switcher/tab-switcher.ts') && !files.includes('src/shared/tab-switcher/page-bridge.ts')),
  'web pages should not preload the switcher; the background injects it on the first command'
);
const observerEntry = manifest.content_scripts[contentScripts.findIndex((files) => files.includes('src/content/shortcut-key-observer.ts'))];
assert.ok(observerEntry, 'the shortcut release observer should be a manifest content script');
assert.deepStrictEqual(
  {
    js: observerEntry.js,
    run_at: observerEntry.run_at,
    all_frames: observerEntry.all_frames,
    match_about_blank: observerEntry.match_about_blank,
    match_origin_as_fallback: observerEntry.match_origin_as_fallback
  },
  {
    js: ['build/shortcut-key-observer.js'],
    run_at: 'document_start',
    all_frames: true,
    match_about_blank: true,
    match_origin_as_fallback: true
  },
  'the observer should run from document start in every frame the user can type in'
);
['management', 'activeTab'].forEach((permission) => {
  assert.ok(!(manifest.permissions || []).includes(permission), `the switcher should not need the ${permission} permission`);
});
assert.ok(manifest.commands && manifest.commands['show-tab-switcher'], 'the switcher should have its own browser command');

localeNames.forEach((locale) => {
  ['tab_switcher_title', 'tab_switcher_untitled', 'tab_switcher_favicon_alt', 'command_show_tab_switcher', 'settings_tab_switcher_title', 'settings_tab_switcher_desc']
    .forEach((key) => {
      const entry = localeMessages[locale][key];
      assert.ok(entry && String(entry.message || '').trim(), `${locale} should localize ${key}`);
    });
  assert.ok(!Object.hasOwn(localeMessages[locale], 'tab_switcher_current'), `${locale} should not keep the removed current-tab badge copy`);
  assert.match(localeMessages[locale].settings_tab_switcher_desc.message, /\{shortcut\}/,
    `${locale} should leave the shortcut to be filled in for the platform`);
});
assert.notStrictEqual(localeMessages.zh_CN.tab_switcher_title.message, localeMessages.en.tab_switcher_title.message);

assert.strictEqual(settings.tabSwitcherEnabled.key, '_x_extension_tab_switcher_enabled_2026_unique_');
assert.strictEqual(settings.tabSwitcherEnabled.parse(undefined), true, 'the tab switcher is on until turned off');
// The Settings row is covered by src/options/options-general-features-section.test.tsx.

console.log('tab switcher wiring tests passed');
