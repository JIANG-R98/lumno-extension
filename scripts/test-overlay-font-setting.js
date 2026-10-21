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
  /\[overlayFontSelect, OVERLAY_FONT_FAMILY_STORAGE_KEY[\s\S]*?storageArea\.set\(\{ \[key\]: family \}\)/,
  'choosing a font should persist its family'
);
assert.match(
  optionsSource,
  /key: OVERLAY_FONT_FAMILY_STORAGE_KEY,[\s\S]*?normalize: SETTINGS\.normalizeOverlayFontFamily/,
  'the font row should follow storage changes through the setting binder'
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
assert(
  manifest.permissions.includes('fontSettings'),
  'reading the installed font list needs the fontSettings permission'
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
// The overlay is a closed shadow root, so every text rule carries the variable
// with the bundled stack as its literal fallback.
assert.strictEqual(
  (suggestionsCss.match(/font-family:\s*var\(--x-ov-font-family,/g) || []).length,
  12,
  'every suggestion text rule should follow the chosen font'
);
assert.match(
  suggestionsCss,
  /font:\s*600 11px\/1 var\(--x-ov-font-family,/,
  'the suggestion source tag shorthand should follow the chosen font'
);
assert.doesNotMatch(
  suggestionsCss,
  /font-family:\s*'Lumno Open Sans'/,
  'no suggestion rule should hard-code the bundled family ahead of the variable'
);
assert.match(
  suggestionsCss,
  /\[class\^="ri-"\], \[class\*=" ri-"\] \{\s*font-family: "lumno-remixicon", "remixicon" !important;/,
  'icon glyphs must keep their own font'
);
assert.strictEqual(
  (searchInputCss.match(/var\(--x-ov-font-family,/g) || []).length,
  9,
  'the search input field, mode menu and hints should follow the chosen font'
);
assert.match(
  searchInputModeSource,
  /const INPUT_FONT_STACK = "var\(--x-ov-font-family,/,
  'inline-styled input parts should follow the chosen font too'
);
assert.match(
  shellSource,
  /font-family: var\(--x-ov-font-family,[\s\S]*?!important;/,
  'the panel\'s own !important declaration must resolve the variable'
);
assert.match(
  shellSource,
  /font: 500 16px\/1\.3 var\(--x-ov-font-family,/,
  'the first-frame input fallback should use the variable'
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
