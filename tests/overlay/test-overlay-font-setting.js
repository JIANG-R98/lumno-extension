const assert = require('assert');
const fs = require('fs');
const { readPageSource } = require('../helpers/page-source');

const optionsHtml = readPageSource('src/options/options.html');
const optionsSource = fs.readFileSync('src/options/options.js', 'utf8');
const overlayRuntimeSource = fs.readFileSync('src/overlay/runtime.js', 'utf8');
const overlaySource = fs.readFileSync('src/overlay/search-panel.js', 'utf8');
const suggestionsCss = fs.readFileSync('src/overlay/suggestions-view.css', 'utf8');
const searchInputCss = fs.readFileSync('src/shared/search-input.css', 'utf8');
const searchInputModeSource = fs.readFileSync('src/shared/search-input-mode.js', 'utf8');
const shellSource = fs.readFileSync('react-src/overlay/shell.tsx', 'utf8');
const tokensCss = fs.readFileSync('src/shared/tokens.css', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const firefoxBuild = fs.readFileSync('scripts/build/build-firefox.js', 'utf8');
const settings = require('../../src/shared/settings.js');

// --- Options row -----------------------------------------------------------
const animationRowIndex = optionsHtml.indexOf('data-i18n="settings_overlay_enter_animation_title"');
const fontRowIndex = optionsHtml.indexOf('data-i18n="settings_overlay_font_title"');
const adaptationRowIndex = optionsHtml.indexOf('data-i18n="settings_overlay_page_theme_adaptation_title"');
assert(animationRowIndex >= 0, 'overlay animation row should exist');
assert(fontRowIndex > animationRowIndex, 'the font row should follow the opening animation row');
assert(
  adaptationRowIndex > fontRowIndex,
  'webpage theme adaptation stays the final overlay appearance setting'
);
assert.match(
  optionsHtml,
  /id="_x_extension_overlay_font_select_2026_unique_"[^>]*>[\s\S]*?data-i18n="settings_overlay_font_default"/,
  'the font select should offer the bundled default first'
);
assert.match(
  optionsHtml,
  /data-select="_x_extension_overlay_font_select_2026_unique_" data-select-searchable="true"/,
  'the font menu should be searchable; installed font lists run to hundreds of entries'
);
assert.match(
  optionsHtml,
  /id="_x_extension_overlay_font_row_2026_unique_"[^>]*data-browser-unsupported="firefox"/,
  'Firefox cannot list fonts and should show the row disabled with the reason'
);

// --- Installed font enumeration -------------------------------------------
assert.match(
  optionsSource,
  /fontSettings\.getFontList\(\)/,
  'the picker should read installed fonts from chrome.fontSettings'
);
assert.match(
  optionsSource,
  /typeof fontSettings\.getFontList !== 'function'[\s\S]*?Promise\.resolve\(\[\]\)/,
  'a browser without the font list API should keep working with the default option'
);
assert.match(
  optionsSource,
  /option\.setAttribute\('data-font-family', family\)/,
  'font options should carry their family so the menu can preview each face'
);
assert.match(
  optionsSource,
  /select\.textContent = ''[\s\S]*?refreshOptionsSelectItems\(select\)/,
  'fonts that arrive after registration should rebuild the select snapshot'
);
assert.match(
  optionsSource,
  /\[overlayFontSelect, OVERLAY_FONT_FAMILY_STORAGE_KEY[\s\S]*?localStorageArea\.set\(\{ \[key\]: family, \[OVERLAY_FONT_LABELS_STORAGE_KEY\]: currentOverlayFontLabels \}\)/,
  'choosing a font should keep its family and display name on this device'
);
assert.match(
  optionsSource,
  /SETTINGS\.normalizeOverlayFontLabels\([\s\S]*?\[family\]: chosenOption\.textContent[\s\S]*?\[currentOverlayFontFamily, currentOverlayFontFallback\]/,
  'the stored names should cover just the two chosen families'
);
assert.match(
  optionsSource,
  /key: OVERLAY_FONT_LABELS_STORAGE_KEY,[\s\S]*?repairOnLoad: false/,
  'stored display names should relabel a family kept before the list loads, without a write-back'
);
assert.match(
  optionsSource,
  /function ensureOverlayFontOption\(select, family\)[\s\S]*?data-font-unlisted[\s\S]*?getOverlayFontLabel\(family\)/,
  'a family not in the list should show its stored display name'
);
['OVERLAY_FONT_FAMILY_STORAGE_KEY', 'OVERLAY_FONT_FALLBACK_STORAGE_KEY', 'OVERLAY_FONT_LABELS_STORAGE_KEY'].forEach((key) => {
  assert.match(
    optionsSource,
    new RegExp(`localSettingBinder\\.bindSetting\\(\\{\\s*key: ${key},`),
    `${key} should be read and followed in chrome.storage.local`
  );
});
assert.match(
  optionsSource,
  /const localSettingBinder = SETTING_BINDINGS\.createSettingBinder\(\{\s*area: 'local',\s*storageArea: localStorageArea,/,
  'device-only settings need a binder on chrome.storage.local'
);

// --- Missing font ------------------------------------------------------------
// A chosen face this device does not have: the row names it in the error color
// with one button that puts the default back.
['_x_extension_overlay_font_missing_2026_unique_', '_x_extension_overlay_font_fallback_missing_2026_unique_']
  .forEach((id) => {
    assert.match(
      optionsHtml,
      new RegExp(`id="${id}" class="_x_extension_overlay_font_missing_2026_unique_" role="status" hidden>[\\s\\S]*?_x_extension_overlay_font_reset_2026_unique_`),
      `${id} should start hidden with its reset button`
    );
  });
assert.match(
  fs.readFileSync('src/options/options.css', 'utf8'),
  /\._x_extension_overlay_font_missing_2026_unique_ \{[^}]*color: var\(--duplicate-badge-text\);/,
  'the missing-font notice should use the error color'
);
assert.match(
  optionsSource,
  /installedOverlayFontFamilies && family && !installedOverlayFontFamilies\.has\(family\)/,
  'only a chosen family absent from a list actually read counts as missing'
);
assert.match(
  optionsSource,
  /installedOverlayFontFamilies = families\.length \? new Set\(families\) : null;/,
  'a failed or empty font list must not flag every font as missing'
);
assert.match(
  optionsSource,
  /formatTemplate\(getMessage\(messageKey, ''\), \{ font: getOverlayFontLabel\(family\) \}\)/,
  'the notice should name the missing font by its display name'
);
assert.match(
  optionsSource,
  /button\.addEventListener\('click', \(\) => \{\s*select\.value = '';\s*select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\);/,
  'one click should clear the choice through the same path as the menu'
);
assert.match(
  optionsSource,
  /function applyI18n\(\) \{[\s\S]{0,200}renderOverlayFontMissingNotices\(\);/,
  'a language change should re-render the notice text'
);

assert.match(
  optionsSource,
  /getInstalledFontFamilies\(\)\.then\(\(fonts\) => \{[\s\S]*?populateOverlayFontOptions\(overlayFontSelect[\s\S]*?renderOverlayFontMissingNotices\(\);/,
  'the options page should list installed fonts on load, then check the chosen ones'
);

// --- Fallback family -------------------------------------------------------
assert.match(
  optionsHtml,
  /id="_x_extension_overlay_font_fallback_row_2026_unique_"[\s\S]*?data-i18n="settings_overlay_font_fallback_title"/,
  'a second row should take the fallback family'
);
assert.match(
  optionsHtml,
  /id="_x_extension_overlay_font_fallback_select_2026_unique_"[\s\S]*?data-i18n="settings_overlay_font_fallback_none"/,
  'the fallback row should be optional'
);
assert.match(
  optionsHtml,
  /data-select="_x_extension_overlay_font_fallback_select_2026_unique_" data-select-searchable="true"/,
  'the fallback menu should be searchable like the primary one'
);
assert.match(
  optionsSource,
  /populateOverlayFontOptions\(\s*overlayFontFallbackSelect,\s*currentOverlayFontFallback,\s*'settings_overlay_font_fallback_none'/,
  'the fallback select should receive the installed fonts with its own default label'
);
assert.match(
  optionsSource,
  /key: OVERLAY_FONT_FALLBACK_STORAGE_KEY,[\s\S]*?normalize: SETTINGS\.normalizeOverlayFontFamily/,
  'the fallback row should follow storage changes through the setting binder'
);
assert.strictEqual(
  settings.OVERLAY_FONT_FALLBACK_STORAGE_KEY,
  '_x_extension_overlay_font_fallback_2026_unique_'
);
assert.match(
  overlayRuntimeSource,
  /overlayFontFallback:\s*'_x_extension_overlay_font_fallback_2026_unique_'/,
  'the overlay runtime should expose the fallback storage key'
);

// --- Manifest / Firefox packaging -----------------------------------------
// Chrome refuses fontSettings in optional_permissions ("Only permissions
// specified in the manifest may be requested"), so it is a plain permission;
// it carries no install warning, so updating does not disable the extension.
assert(
  manifest.permissions.includes('fontSettings'),
  'reading the installed font list needs the fontSettings permission'
);
assert(
  !(manifest.optional_permissions || []).includes('fontSettings'),
  'Chrome cannot request fontSettings at runtime'
);
assert.match(
  firefoxBuild,
  /permission !== 'fontSettings'/,
  'the Firefox package must drop the Chrome-only fontSettings permission'
);

// --- Shared contract -------------------------------------------------------
assert.strictEqual(
  settings.OVERLAY_FONT_FAMILY_STORAGE_KEY,
  '_x_extension_overlay_font_family_2026_unique_'
);
// The fonts are this computer's installed faces, so they stay on the device:
// out of Chrome Sync, and so out of WebDAV and exports, which follow its list.
settings.OVERLAY_FONT_LOCAL_STORAGE_KEYS.forEach((key) => {
  assert(!settings.CHROME_SYNC_STORAGE_KEYS.includes(key), `${key} must not reach Chrome Sync`);
});
assert.match(
  overlayRuntimeSource,
  /overlayFontFamily:\s*'_x_extension_overlay_font_family_2026_unique_'/,
  'the overlay runtime should expose the font storage key'
);
const webdavContract = require('../../src/shared/webdav-contract.js');
settings.OVERLAY_FONT_LOCAL_STORAGE_KEYS.forEach((key) => {
  assert(!webdavContract.KNOWN_KEYS.includes(key), `${key} must not reach WebDAV`);
});
assert.deepStrictEqual(
  webdavContract.selectPreferences({
    [settings.OVERLAY_FONT_FAMILY_STORAGE_KEY]: 'PingFang SC',
    [settings.OVERLAY_SIZE_MODE_STORAGE_KEY]: 'large'
  }),
  { [settings.OVERLAY_SIZE_MODE_STORAGE_KEY]: 'large' },
  'a WebDAV state that still carries a font (an earlier build wrote one) must not apply it'
);
const contractSource = fs.readFileSync('src/shared/webdav-contract.js', 'utf8');
assert.doesNotMatch(contractSource, /OVERLAY_FONT/, 'the WebDAV contract should not list the device-local fonts');
assert.doesNotMatch(
  fs.readFileSync('src/options/webdav-options.js', 'utf8'),
  /overlay_font/,
  'WebDAV conflicts never involve the device-local fonts'
);
assert.match(
  fs.readFileSync('src/background/background.js', 'utf8'),
  /function cleanupLocalOnlyOverlayFontSyncStorage\(\)[\s\S]*?chrome\.storage\.sync\.remove\(OVERLAY_FONT_LOCAL_STORAGE_KEYS[\s\S]*?\ncleanupLocalOnlyOverlayFontSyncStorage\(\);/,
  'copies development builds left in Chrome Sync should be cleared'
);

// --- Overlay runtime -------------------------------------------------------
assert.match(
  overlaySource,
  /const initialOverlayFontFamilyReady = overlayRuntime\.getStorageValues\(\s*localStorageArea,\s*\[OVERLAY_FONT_FAMILY_STORAGE_KEY, OVERLAY_FONT_FALLBACK_STORAGE_KEY\]/,
  'the first open should read the fonts from chrome.storage.local'
);
assert.doesNotMatch(
  overlaySource.slice(
    overlaySource.indexOf('const initialOverlaySettingsReady'),
    overlaySource.indexOf('const initialOverlaySettingsReady') + 800
  ),
  /OVERLAY_FONT/,
  'the synced preference read should not include the device-local fonts'
);
assert.match(
  overlaySource,
  /storageChangeListeners\.add\(\(changes, areaName\) => \{\s*if \(areaName !== 'local'\) \{\s*return;\s*\}\s*let changed = false;\s*if \(changes\[OVERLAY_FONT_FAMILY_STORAGE_KEY\]\)/,
  'the overlay should follow font changes in chrome.storage.local only'
);
assert.match(
  overlaySource,
  /changes\[OVERLAY_FONT_FAMILY_STORAGE_KEY\][\s\S]*?changes\[OVERLAY_FONT_FALLBACK_STORAGE_KEY\][\s\S]*?applyOverlayFontFamily\(overlay\)/,
  'changing either font should re-apply the variable without reloading the page'
);
assert.match(
  overlaySource,
  /function applyOverlayFontFamily\(target\)[\s\S]*?SETTINGS\.getOverlayFontFamilyCssValue\(overlayFontFamily, overlayFontFallback\)/,
  'the overlay should apply the chosen family through the shared CSS value helper'
);
assert.match(
  overlaySource,
  /applyOverlayThemeVariables\(target, mode\)[\s\S]*?applyOverlayFontFamily\(target\);[\s\S]*?\n    \}/,
  're-applying the theme should keep the chosen font'
);

// --- Style surfaces --------------------------------------------------------
// One --lumno-font-sans token carries the text stack: tokens.css defines it
// for extension pages, and the overlay panel defines the same value in its
// closed shadow root, where tokens.css never arrives. Rules keep only a
// generic literal fallback.
const tokenStack = (tokensCss.match(/--lumno-font-sans:\s*([^;]+);/) || [])[1];
const shellStack = (shellSource.match(
  /:where\(#_x_extension_overlay_2024_unique_\) \{\s*--lumno-font-sans:\s*([^;]+);/
) || [])[1];
assert.strictEqual(tokenStack, settings.OVERLAY_FONT_DEFAULT_STACK, 'tokens.css should hold the bundled stack');
assert.strictEqual(shellStack, settings.OVERLAY_FONT_DEFAULT_STACK, 'the overlay panel should define the same stack');
assert.strictEqual(
  (suggestionsCss.match(/var\(--lumno-font-sans, sans-serif\)/g) || []).length,
  13,
  'every suggestion text rule should follow the chosen font'
);
assert.match(
  suggestionsCss,
  /font:\s*600 11px\/1 var\(--lumno-font-sans, sans-serif\)/,
  'the suggestion source tag shorthand should follow the chosen font'
);
assert.doesNotMatch(
  suggestionsCss + searchInputCss,
  /'Lumno Open Sans'|"Lumno Open Sans"/,
  'no overlay text rule should repeat the bundled stack'
);
assert.match(
  suggestionsCss,
  /\[class\^="ri-"\], \[class\*=" ri-"\] \{\s*font-family: "lumno-remixicon", "remixicon" !important;/,
  'icon glyphs must keep their own font'
);
assert.strictEqual(
  (searchInputCss.match(/var\(--lumno-font-sans, sans-serif\)/g) || []).length,
  9,
  'the search input field, mode menu and hints should follow the chosen font'
);
assert.match(
  searchInputModeSource,
  /const INPUT_FONT_STACK = 'var\(--lumno-font-sans, sans-serif\)'/,
  'inline-styled input parts should follow the chosen font too'
);
assert.match(
  shellSource,
  /font-family: var\(--lumno-font-sans, sans-serif\) !important;/,
  'the panel\'s own !important declaration must resolve the token'
);
assert.match(
  shellSource,
  /font: 500 16px\/1\.3 var\(--lumno-font-sans, sans-serif\)/,
  'the first-frame input fallback should use the token'
);
assert.match(
  overlaySource,
  /const OVERLAY_FONT_FAMILY_CSS_VAR = SETTINGS\.OVERLAY_FONT_FAMILY_CSS_VAR \|\| '--lumno-font-sans'/,
  'the overlay should re-point the shared token at the chosen font'
);

// --- Locales ---------------------------------------------------------------
// The titles say the fonts are this computer's own; the description says
// they are not synced.
const expected = {
  en: ['Local font', 'Default', 'Search fonts', 'No matching fonts', 'Local fallback font', 'None'],
  ja: ['ローカルフォント', 'デフォルト', 'フォントを検索', '一致するフォントがありません', 'ローカルフォールバックフォント', 'なし'],
  zh_CN: ['本地字体', '默认', '搜索字体', '没有匹配的字体', '本地回退字体', '无'],
  zh_TW: ['本機字型', '預設', '搜尋字型', '沒有符合的字型', '本機後備字型', '無']
};
const notSynced = { en: /not synced/, ja: /同期されません/, zh_CN: /不会同步/, zh_TW: /不會同步/ };
Object.entries(expected).forEach(([locale, messages]) => {
  const data = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
  assert.strictEqual(data.settings_overlay_font_title.message, messages[0]);
  assert.strictEqual(data.settings_overlay_font_default.message, messages[1]);
  assert.strictEqual(data.settings_overlay_font_search_placeholder.message, messages[2]);
  assert.strictEqual(data.settings_overlay_font_no_results.message, messages[3]);
  assert.strictEqual(data.settings_overlay_font_fallback_title.message, messages[4]);
  assert.strictEqual(data.settings_overlay_font_fallback_none.message, messages[5]);
  assert.ok(data.settings_overlay_font_fallback_desc.message);
  assert.ok(data.settings_overlay_font_unsupported_tooltip.message);
  assert.match(data.settings_overlay_font_desc.message, notSynced[locale]);
  ['settings_overlay_font_missing', 'settings_overlay_font_fallback_missing'].forEach((key) => {
    assert.match(data[key].message, /\{font\}/, `${locale}.${key} should name the missing font`);
  });
  assert.ok(data.settings_overlay_font_missing_reset.message);
  assert.ok(data.settings_overlay_font_fallback_missing_reset.message);
});

console.log('overlay font setting tests passed');
