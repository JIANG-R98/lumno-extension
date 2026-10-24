const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const settings = require('../../src/shared/settings.ts');
const selectionScriptRegistration = require('../../src/background/selection-script-registration.ts');
const selectionTarget = require('../../src/background/selection-target.ts');
const selectionActionIcons = require('../../src/shared/selection-action-icons.ts');
const { getToggleSettings } = require('../../src/options/options-toggle-settings.ts');
const { getBundleFiles, getManifestContentScripts } = require('../helpers/runtime-scripts');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss } = require('../helpers/css-rules');

// What the selection toolbar needs from the manifest, its bundle, the Labs
// settings markup and the locales. Its behavior is covered by
// test-selection-quick-actions-dom.js, test-selection-quick-actions-listeners.js
// and tests/background/test-background-selection-quick-actions.js.

const repoRoot = path.resolve(__dirname, '..', '..');
const localeNames = ['en', 'ja', 'zh_CN', 'zh_TW'];
const readMessages = (locale) => JSON.parse(fs.readFileSync(path.join(repoRoot, `_locales/${locale}/messages.json`), 'utf8'));
const ENABLED_KEY = '_x_extension_selection_quick_actions_enabled_2026_unique_';
const PROVIDER_KEY = '_x_extension_selection_quick_actions_provider_2026_unique_';
const GROUP_KEY = '_x_extension_selection_quick_actions_group_enabled_2026_unique_';

assert(
  !getManifestContentScripts().some((files) => files.includes('src/content/selection-quick-actions.ts')),
  'the default-off selection toolbar should not load into every page from the manifest'
);
assert.deepStrictEqual(Array.from(selectionScriptRegistration.SCRIPT_FILES), ['build/selection-quick-actions.js']);
assert.strictEqual(selectionScriptRegistration.RUN_AT, 'document_idle');
assert.deepStrictEqual(
  getBundleFiles('selection-quick-actions').sort(),
  ['src/content/selection-quick-actions.ts', 'src/shared/selection-action-icons.ts', 'src/shared/selection-intent.ts', 'src/shared/settings.ts', 'src/shared/ui/toast.ts'],
  'the toolbar bundle should carry provider-aware settings, the selection classifier and the shared Toast, and nothing else'
);
assert.strictEqual(selectionTarget.DEFAULT_GROUP_TITLE, 'AI Search',
  'the selection group name should fall back to English, not a Chinese-only name');
assert.deepStrictEqual(Object.keys(selectionActionIcons), ['remix'], 'the action icons should come from Remix only');

const mark = new JSDOM(fs.readFileSync(path.join(repoRoot, 'assets/images/lumno-selection-mark.svg'), 'utf8'), { contentType: 'image/svg+xml' }).window.document;
assert.strictEqual(mark.documentElement.getAttribute('shape-rendering'), 'geometricPrecision');
assert.strictEqual(mark.querySelectorAll('path').length, 2, 'the selection mark should be the two-layer vector Lumno mark');

const optionsDocument = new JSDOM(fs.readFileSync(path.join(repoRoot, 'src/options/options.html'), 'utf8')).window.document;
const toggle = optionsDocument.getElementById('_x_extension_selection_quick_actions_toggle_2026_unique_');
assert(toggle, 'Labs should render the selection quick actions toggle');
assert.strictEqual(toggle.hasAttribute('checked'), false, 'the selection toolbar should be off by default');
const groupToggle = optionsDocument.getElementById('_x_extension_selection_quick_actions_group_toggle_2026_unique_');
assert(groupToggle, 'Labs should render the optional selection group toggle');
assert.strictEqual(groupToggle.hasAttribute('checked'), false, 'selection grouping should be off by default');
assert(optionsDocument.getElementById('_x_extension_selection_quick_actions_provider_select_2026_unique_'),
  'Labs should render the preferred provider dropdown');
assert.ok(optionsDocument.querySelectorAll('[data-icon-path^="assets/images/site-search/tile-"]').length >= 8,
  'the provider dropdown should pair each provider with a bundled icon');
assert.strictEqual(optionsDocument.querySelector('[data-i18n="settings_selection_quick_actions_group_title"]').textContent, '在后台查询',
  'grouping should be described as a background query rather than tab creation');
assert.strictEqual(
  optionsDocument.querySelector('[data-i18n-tooltip="settings_selection_quick_actions_group_desc"]').getAttribute('data-tooltip'),
  '所有 AI 网页皆归入「AI 查询」标签组'
);
const toggleKeys = getToggleSettings(settings).map((entry) => entry.key);
[ENABLED_KEY, PROVIDER_KEY, GROUP_KEY].forEach((key) => {
  assert(toggleKeys.includes(key), `Settings should save ${key}`);
});

const optionsStyles = parseCss(readStylesheet('src/options/options.css'));
assert.strictEqual(
  optionsStyles.rule('._x_extension_theme_indicator_2024_unique_[data-ready="false"] ~ ._x_extension_theme_option_2024_unique_[data-active="true"]').get('background'),
  'var(--inline-tab-active-bg)',
  'segmented controls should show the active option before their indicator can be measured'
);
assert.strictEqual(parseCss(fs.readFileSync(path.join(repoRoot, 'src/shared/ui/custom-select.css'), 'utf8'))
  .rule('._x_extension_select_trigger_2024_unique_').get('gap'), '8px',
'the selected provider icon and label should use the same 8px gap as menu options');

localeNames.forEach((locale) => {
  const messages = readMessages(locale);
  [
    'settings_selection_quick_actions_title',
    'settings_selection_quick_actions_desc',
    'settings_selection_quick_actions_provider_title',
    'settings_selection_quick_actions_group_title',
    'settings_selection_quick_actions_group_desc',
    'selection_quick_actions_group_name',
    'selection_quick_action_ask',
    'selection_quick_action_translate',
    'selection_quick_action_explain',
    'selection_quick_action_summarize',
    'selection_quick_action_search',
    'selection_quick_action_calculate'
  ].forEach((key) => {
    assert(messages[key] && String(messages[key].message || '').trim(), `${locale} should localize ${key}`);
  });
});
const zhCnMessages = readMessages('zh_CN');
assert.strictEqual(zhCnMessages.settings_selection_quick_actions_group_title.message, '在后台查询');

const expectedGroupCopy = {
  en: ['AI Search', 'Collect all AI pages in the “AI Search” tab group'],
  ja: ['AI 検索', 'すべての AI ページを「AI 検索」タブグループにまとめます'],
  zh_CN: ['AI 查询', '所有 AI 网页皆归入「AI 查询」标签组'],
  zh_TW: ['AI 查詢', '所有 AI 網頁皆歸入「AI 查詢」分頁群組']
};
const expectedTaskLabels = {
  en: ['Answer', 'Translate', 'Explain', 'Summarize', 'Research', 'Calculate'],
  ja: ['回答', '翻訳', '説明', '要約', '調査', '計算'],
  zh_CN: ['解答', '翻译', '解释', '总结', '调研', '计算'],
  zh_TW: ['解答', '翻譯', '解釋', '總結', '研究', '計算']
};
localeNames.forEach((locale) => {
  const messages = readMessages(locale);
  assert.deepStrictEqual(
    [messages.selection_quick_actions_group_name.message, messages.settings_selection_quick_actions_group_desc.message],
    expectedGroupCopy[locale],
    `${locale} should use one localized AI group name in both runtime and settings copy`
  );
  assert.deepStrictEqual(
    ['ask', 'translate', 'explain', 'summarize', 'search', 'calculate'].map((intent) => messages[`selection_quick_action_${intent}`].message),
    expectedTaskLabels[locale],
    `${locale} should describe every toolbar item as a user task`
  );
});

console.log('selection quick actions wiring tests passed');
