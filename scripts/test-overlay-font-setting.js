const assert = require('assert');
const fs = require('fs');
const { readPageSource } = require('./helpers/page-source');

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
const firefoxBuild = fs.readFileSync('scripts/build-firefox.js', 'utf8');
const settings = require('../src/shared/settings.js');

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
  /\[overlayFontSelect, OVERLAY_FONT_FAMILY_STORAGE_KEY[\s\S]*?storageArea\.set\(\{ \[key\]: family, \[OVERLAY_FONT_LABELS_STORAGE_KEY\]: currentOverlayFontLabels \}\)/,
  'choosing a font should persist its family with its display name'
);
assert.match(
  optionsSource,
  /SETTINGS\.normalizeOverlayFontLabels\([\s\S]*?\[family\]: chosenOption\.textContent[\s\S]*?\[currentOverlayFontFamily, currentOverlayFontFallback\]/,
  'the stored names should cover just the two chosen families'
);
assert.match(
  optionsSource,
  /key: OVERLAY_FONT_LABELS_STORAGE_KEY,[\s\S]*?repairOnLoad: false/,
  'synced display names should relabel a family kept before the list loads, without a write-back'
);
assert.match(
  optionsSource,
  /function ensureOverlayFontOption\(select, family\)[\s\S]*?data-font-unlisted[\s\S]*?getOverlayFontLabel\(family\)/,
  'a family not in the list should show its synced display name'
);

assert.match(
  optionsSource,
  /getInstalledFontFamilies\(\)\.then\(\(fonts\) => \{\s*populateOverlayFontOptions\(overlayFontSelect/,
  'the options page should list installed fonts on load'
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
assert(
  settings.CHROME_SYNC_STORAGE_KEYS.includes(settings.OVERLAY_FONT_FALLBACK_STORAGE_KEY),
  'the fallback should follow the reader through Chrome Sync and WebDAV'
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
assert(
  settings.CHROME_SYNC_STORAGE_KEYS.includes(settings.OVERLAY_FONT_FAMILY_STORAGE_KEY),
  'the font choice should follow the reader through Chrome Sync and WebDAV'
);
assert.match(
  overlayRuntimeSource,
  /overlayFontFamily:\s*'_x_extension_overlay_font_family_2026_unique_'/,
  'the overlay runtime should expose the font storage key'
);
require('../src/shared/webdav-contract.js');
const contractSource = fs.readFileSync('src/shared/webdav-contract.js', 'utf8');
assert.match(
  contractSource,
  /KEYS_UNKNOWN_TO_LEGACY_WRITERS[\s\S]*?settings\.OVERLAY_FONT_FAMILY_STORAGE_KEY/,
  'legacy WebDAV states must not clobber the font choice'
);
const webdavOptionsSource = fs.readFileSync('src/options/webdav-options.js', 'utf8');
assert.match(
  webdavOptionsSource,
  /\['overlay_font_family', 'settings_overlay_font_title'\]/,
  'WebDAV conflicts should name the font setting'
);
assert.match(
  contractSource,
  /KEYS_UNKNOWN_TO_LEGACY_WRITERS[\s\S]*?settings\.OVERLAY_FONT_FALLBACK_STORAGE_KEY/,
  'legacy WebDAV states must not clobber the fallback'
);
assert.match(
  webdavOptionsSource,
  /\['overlay_font_fallback', 'settings_overlay_font_fallback_title'\]/,
  'WebDAV conflicts should name the fallback setting'
);
assert.match(
  contractSource,
  /KEYS_UNKNOWN_TO_LEGACY_WRITERS[\s\S]*?settings\.OVERLAY_FONT_LABELS_STORAGE_KEY/,
  'legacy WebDAV states must not clobber the display names'
);
assert.match(
  webdavOptionsSource,
  /\['overlay_font_labels', 'settings_overlay_font_title'\]/,
  'WebDAV conflicts should name the display names after the font setting'
);

// --- Overlay runtime -------------------------------------------------------
assert.match(
  overlaySource,
  /const initialOverlaySettingsReady = overlayRuntime\.getStorageValues\([\s\S]*?OVERLAY_FONT_FAMILY_STORAGE_KEY[\s\S]*?\)\.catch/,
  'the first open should read the font with the other overlay preferences'
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
const expected = {
  en: ['Font', 'Default', 'Search fonts', 'No matching fonts', 'Fallback font', 'None'],
  ja: ['フォント', 'デフォルト', 'フォントを検索', '一致するフォントがありません', 'フォールバックフォント', 'なし'],
  zh_CN: ['字体', '默认', '搜索字体', '没有匹配的字体', '回退字体', '无'],
  zh_TW: ['字型', '預設', '搜尋字型', '沒有符合的字型', '後備字型', '無']
};
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
});

console.log('overlay font setting tests passed');
