const assert = require('assert');
const fs = require('fs');

const settings = require('../src/shared/settings.js');
const optionsHtml = fs.readFileSync('src/options/options.html', 'utf8');
const optionsSource = fs.readFileSync('src/options/options.js', 'utf8');
const newtabHtml = fs.readFileSync('newtab.html', 'utf8');
const newtabSource = fs.readFileSync('src/newtab/newtab.js', 'utf8');
const wallpaperSource = fs.readFileSync('src/newtab/wallpaper.js', 'utf8');
const shortcutDialogCss = fs.readFileSync('src/newtab/shortcut-dialog.css', 'utf8');
const wallpaperViewSource = fs.readFileSync(
  'react-src/newtab/wallpaper-view.tsx',
  'utf8'
);
const rangeSliderSource = fs.readFileSync(
  'react-src/shared/range-slider.tsx',
  'utf8'
);
const settingsControlsSource = fs.readFileSync(
  'react-src/options/settings-controls.tsx',
  'utf8'
);
const rangeSliderCss = fs.readFileSync('src/shared/range-slider.css', 'utf8');
const locales = ['en', 'ja', 'zh_CN', 'zh_TW'];

// Keep the old width key readable and exportable so existing sync/import data
// can seed the new discrete column setting once.
assert.strictEqual(
  settings.NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
  '_x_extension_newtab_shortcut_width_2026_unique_'
);
assert(settings.CHROME_SYNC_STORAGE_KEYS.includes(settings.NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY));
assert.strictEqual(settings.normalizeNewtabShortcutWidth(undefined), 920);

assert.strictEqual(
  settings.NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
  '_x_extension_newtab_shortcut_columns_2026_unique_'
);
assert(settings.CHROME_SYNC_STORAGE_KEYS.includes(settings.NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY));
assert.strictEqual(settings.NEWTAB_SHORTCUT_COLUMNS_MIN, 4);
assert.strictEqual(settings.NEWTAB_SHORTCUT_COLUMNS_MAX, 16);
assert.strictEqual(settings.NEWTAB_SHORTCUT_COLUMNS_DEFAULT, 10);
assert.strictEqual(settings.normalizeNewtabShortcutColumns(undefined), 10);
assert.strictEqual(settings.normalizeNewtabShortcutColumns(3), 4);
assert.strictEqual(settings.normalizeNewtabShortcutColumns(10.6), 11);
assert.strictEqual(settings.normalizeNewtabShortcutColumns(17), 16);
assert.strictEqual(settings.inferNewtabShortcutColumnsFromWidth(360), 4);
assert.strictEqual(settings.inferNewtabShortcutColumnsFromWidth(920), 10);
assert.strictEqual(settings.inferNewtabShortcutColumnsFromWidth(1440), 16);
assert.strictEqual(settings.NEWTAB_SHORTCUT_SIZE_MIN, 48);
assert.strictEqual(settings.NEWTAB_SHORTCUT_SIZE_MAX, 80);
assert.strictEqual(settings.NEWTAB_SHORTCUT_SIZE_DEFAULT, 64);
assert.strictEqual(settings.NEWTAB_SHORTCUT_GAP_MIN, 0);
assert.strictEqual(settings.NEWTAB_SHORTCUT_GAP_MAX, 24);
assert.strictEqual(settings.NEWTAB_SHORTCUT_GAP_DEFAULT, 4);

assert.match(
  wallpaperViewSource,
  /ref\('shortcutColumnsControl'\)[\s\S]*?ref\('shortcutColumnsSlider'\)[\s\S]*?ref\('shortcutColumnsSliderValueInput'\)/
);
assert.doesNotMatch(wallpaperViewSource, /shortcutWidthSlider/);
assert.match(
  wallpaperSource,
  /shortcutColumnsConfig[\s\S]*?getShortcutColumns[\s\S]*?setShortcutColumns/
);
assert.match(
  wallpaperSource,
  /wallpaperShortcutColumnsSlider\.addEventListener\('input'[\s\S]*?persistShortcutColumnsFromSlider[\s\S]*?bindWallpaperSliderValueInput\(wallpaperShortcutColumnsSlider\)/
);
assert.doesNotMatch(wallpaperSource, /snapShortcutColumns|wallpaperShortcutColumnsPointer/);
assert.match(
  newtabSource,
  /shortcutColumnsConfig:\s*\{[\s\S]*?min:\s*NEWTAB_SHORTCUT_COLUMNS_MIN,[\s\S]*?max:\s*NEWTAB_SHORTCUT_COLUMNS_MAX,[\s\S]*?fallback:\s*NEWTAB_SHORTCUT_COLUMNS_DEFAULT/
);
assert.match(newtabSource, /setShortcutColumns:\s*setNewtabShortcutColumns/);
assert.match(
  newtabSource,
  /rawColumns === undefined[\s\S]*?inferNewtabShortcutColumnsFromWidth\(rawWidth\)[\s\S]*?normalizeNewtabShortcutColumns\(rawColumns\)/,
  'New Tab should migrate legacy pixel width only when the new column setting is absent'
);

assert.match(
  optionsHtml,
  /id="_x_extension_newtab_shortcut_columns_setting_row_2026_unique_"[\s\S]*?data-i18n="settings_newtab_shortcut_columns_title"[\s\S]*?id="_x_extension_newtab_shortcut_columns_control_2026_unique_"/,
  'Options should expose the same per-row shortcut slider host'
);
assert.match(
  optionsHtml,
  /settings_newtab_shortcut_columns_title[\s\S]*?settings_newtab_shortcut_size_title[\s\S]*?settings_newtab_shortcut_gap_title/,
  'Options should place size and spacing directly below shortcuts-per-row'
);
assert.match(
  optionsSource,
  /kind:\s*'newtab-shortcut-columns'[\s\S]*?label:\s*'4',[\s\S]*?label:\s*'8',[\s\S]*?label:\s*'12',[\s\S]*?label:\s*'16'/,
  'Options should render an editable slider with 4-step ticks'
);
assert.doesNotMatch(optionsSource, /snapPoints|snapThreshold/);
assert.match(
  rangeSliderSource,
  /RANGE_SLIDER_VALUE_INPUT_CLASS_NAMES[\s\S]*?_x_extension_shortcut_input_2024_unique_[\s\S]*?_x_extension_range_slider_value_input_2026_unique_/,
  'The shared slider component should reuse the existing input component appearance'
);
assert.match(
  rangeSliderSource,
  /RangeSliderResetButton[\s\S]*?ri-reset-left-line[\s\S]*?resetButtonProps/,
  'The shared slider field should own the reset IconButton contract'
);
assert.match(
  rangeSliderSource,
  /RangeSliderResetButton[\s\S]*?_x_extension_shortcut_group_action_2024_unique_[\s\S]*?'ri-size-14'[\s\S]*?'ri-reset-left-line'/,
  'The reset control should reuse the existing compact shortcut IconButton appearance'
);
assert.match(
  rangeSliderSource,
  /\{resetButtonProps \? \([\s\S]*?<RangeSliderResetButton[\s\S]*?\) : null\}[\s\S]*?<RangeSliderValueInput/,
  'The shared reset IconButton should render directly to the value input left'
);
assert.match(
  rangeSliderCss,
  /_x_extension_range_slider_reset_button_2026_unique_[\s\S]*?padding:\s*4px;[\s\S]*?border-radius:\s*8px;/,
  'New Tab should provide the compact IconButton fallback appearance'
);
assert.doesNotMatch(
  optionsHtml,
  /_x_extension_range_slider_value_input_2026_unique_:(?:hover|focus|focus-visible|disabled)/,
  'The slider value input should not define a second Options interaction appearance'
);
assert.doesNotMatch(
  newtabHtml,
  /\.x-nt-range-slider-value-input/,
  'New Tab should not define a second slider value-input appearance'
);
assert.match(
  shortcutDialogCss,
  /\._x_extension_shortcut_input_2024_unique_\s*\{[\s\S]*?border:\s*1px solid var\(--tab-border\);[\s\S]*?background:\s*var\(--control-bg\);/,
  'New Tab slider values should use the existing input component appearance'
);
assert.doesNotMatch(settingsControlsSource, /snapPoints|snapThreshold|pointerActiveRef/);
assert.match(
  rangeSliderSource,
  /RANGE_SLIDER_VALUE_INPUT_STYLE[\s\S]*?height:\s*36,[\s\S]*?width:\s*56/,
  'The shared slider value-input component should own a fixed size'
);
assert.match(
  rangeSliderSource,
  /RangeSliderFieldProps[\s\S]*?max:[\s\S]*?<RangeSlider[\s\S]*?max=\{max\}[\s\S]*?<RangeSliderValueInput[\s\S]*?sliderMax=\{max\}/,
  'The shared slider value-input component should own the slider maximum contract'
);
assert.match(
  settingsControlsSource,
  /<RangeSliderField[\s\S]*?max=\{model\.max\}[\s\S]*?valueInputProps=/,
  'Every Options slider should render its value input from the shared field component'
);
assert.match(
  optionsSource,
  /onInput\(value\)[\s\S]*?normalizeNewtabShortcutColumns\(value\)[\s\S]*?NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY/,
  'Options should persist slider and typed column changes'
);
assert.match(
  wallpaperViewSource,
  /<RangeSliderField[\s\S]*?ref\('shortcutColumnsSlider'\)[\s\S]*?max=\{String\(shortcutColumnsMax\)\}[\s\S]*?ref\('shortcutColumnsSliderValueInput'\)/,
  'Appearance should reuse the shared fixed-size slider value input'
);

const shortcutSectionStart = newtabHtml.indexOf('.x-nt-shortcuts-section {');
const shortcutSectionEnd = newtabHtml.indexOf('\n      }', shortcutSectionStart);
const shortcutSectionCss = newtabHtml.slice(shortcutSectionStart, shortcutSectionEnd);
assert.match(newtabHtml, /--x-nt-shortcut-columns:\s*10;/);
assert.match(
  shortcutSectionCss,
  /width:\s*min\(90vw,\s*var\(--x-nt-shortcuts-target-width,\s*692px\)\);/
);
assert.doesNotMatch(shortcutSectionCss, /--x-nt-shortcut-width/);
assert.match(
  newtabHtml,
  /\.x-nt-shortcuts-grid\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?justify-content:\s*center;/,
  'Shortcut rows should center partial rows inside the configured per-row width'
);
assert.match(
  newtabHtml,
  /\.x-nt-range-slider-row\s*\{[\s\S]*?align-items:\s*center;/,
  'New Tab slider value inputs should align to the slider control center'
);
assert.match(
  newtabHtml,
  /\.x-nt-overlay-slider\s*\{[\s\S]*?top:\s*8px;/,
  'New Tab slider tracks should use the shared control vertical geometry'
);
assert.match(
  newtabHtml,
  /\.x-nt-overlay-tick::before\s*\{[\s\S]*?top:\s*19px;/,
  'New Tab slider ticks should stay aligned with the centered track'
);
assert.match(
  newtabSource,
  /function applyNewtabShortcutColumns\(\)[\s\S]*?--x-nt-shortcut-columns[\s\S]*?String\(newtabShortcutColumns\)[\s\S]*?--x-nt-shortcuts-target-width/
);
assert.match(
  newtabSource,
  /function applyNewtabShortcutLayoutPreferences\(\)[\s\S]*?--x-nt-shortcut-user-tile-size[\s\S]*?--x-nt-shortcut-user-column-gap[\s\S]*?--x-nt-shortcut-user-row-gap[\s\S]*?applyNewtabShortcutColumns\(\)/,
  'Size and spacing should update the shared responsive shortcut tokens'
);
assert.match(
  newtabHtml,
  /--x-nt-shortcut-tile-size:\s*var\(--x-nt-shortcut-user-tile-size\);[\s\S]*?--x-nt-shortcuts-grid-row-gap:\s*var\(--x-nt-shortcut-user-row-gap\);/,
  'Default shortcut geometry should flow through user-controlled variables'
);
assert.match(
  newtabHtml,
  /data-nt-bottom-dock-density="compact"[\s\S]*?--x-nt-shortcut-tile-size:\s*min\(var\(--x-nt-shortcut-user-tile-size\),\s*48px\);/,
  'Compact layout should retain its shortcut-size safety cap'
);
assert.match(
  newtabSource,
  /function handleNewtabResize\(\)[\s\S]*?applyNewtabShortcutColumns\(\)/,
  'Responsive tile tokens should recompute the selected shortcut width after viewport changes'
);
assert.match(
  newtabSource,
  /NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY\][\s\S]*?normalizeNewtabShortcutColumns\(raw\)/
);

locales.forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
  assert(
    messages.settings_newtab_shortcut_columns_title &&
      String(messages.settings_newtab_shortcut_columns_title.message || '').trim(),
    `${locale} should localize the shortcuts-per-row setting`
  );
  [
    'settings_newtab_shortcut_size_title',
    'settings_newtab_shortcut_gap_title',
    'settings_newtab_shortcut_size_reset',
    'settings_newtab_shortcut_gap_reset'
  ].forEach((key) => {
    assert(
      messages[key] && String(messages[key].message || '').trim(),
      `${locale} should localize ${key}`
    );
  });
});

console.log('New Tab shortcut column setting tests passed.');
