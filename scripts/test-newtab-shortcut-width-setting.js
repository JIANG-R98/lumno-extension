const assert = require('assert');
const fs = require('fs');

const settings = require('../src/shared/settings.js');
const optionsHtml = fs.readFileSync('src/options/options.html', 'utf8');
const optionsSource = fs.readFileSync('src/options/options.js', 'utf8');
const newtabHtml = fs.readFileSync('newtab.html', 'utf8');
const newtabSource = fs.readFileSync('src/newtab/newtab.js', 'utf8');
const wallpaperSource = fs.readFileSync('src/newtab/wallpaper.js', 'utf8');
const wallpaperViewSource = fs.readFileSync(
  'react-src/newtab/wallpaper-view.tsx',
  'utf8'
);
const locales = ['en', 'ja', 'zh_CN', 'zh_TW'];

assert.strictEqual(
  settings.NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
  '_x_extension_newtab_shortcut_width_2026_unique_'
);
assert(settings.CHROME_SYNC_STORAGE_KEYS.includes(settings.NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY));
assert.strictEqual(settings.normalizeNewtabShortcutWidth(undefined), 920);
assert.strictEqual(settings.normalizeNewtabShortcutWidth(359), 360);
assert.strictEqual(settings.normalizeNewtabShortcutWidth(1441), 1440);

assert.match(
  wallpaperViewSource,
  /ref\('shortcutWidthControl'\)[\s\S]*?ref\('shortcutWidthSlider'\)[\s\S]*?max=\{String\(shortcutWidthMax\)\}[\s\S]*?min=\{String\(shortcutWidthMin\)\}[\s\S]*?step="1"/
);
assert.match(wallpaperViewSource, /data-value-suffix=" px"/);
assert.match(
  wallpaperViewSource,
  /shortcutWidthTicks[\s\S]*?label: String\(shortcutWidthMin\)[\s\S]*?label: String\(Math\.round\(\(shortcutWidthMin \+ shortcutWidthMax\) \/ 2\)\)[\s\S]*?label: String\(shortcutWidthMax\)/
);
assert.match(
  wallpaperSource,
  /function formatShortcutWidthValue\(value\)[\s\S]*?return `\$\{normalizeShortcutWidthValue\(value\)\} px`/
);
assert.match(
  wallpaperSource,
  /function persistShortcutWidthFromSlider\(value, options\)[\s\S]*?setShortcutWidth\(width, \{ persist: false \}\)[\s\S]*?setShortcutWidth\(width, \{ persist: true \}\)/
);
assert.match(
  newtabSource,
  /shortcutWidthConfig:\s*\{[\s\S]*?min:\s*NEWTAB_SHORTCUT_WIDTH_MIN,[\s\S]*?max:\s*NEWTAB_SHORTCUT_WIDTH_MAX,[\s\S]*?fallback:\s*NEWTAB_SHORTCUT_WIDTH_DEFAULT/
);
assert.match(
  newtabSource,
  /setShortcutWidth:\s*setNewtabShortcutWidth/
);
assert.match(
  optionsHtml,
  /id="_x_extension_newtab_shortcut_width_setting_row_2026_unique_"[\s\S]*?data-i18n="settings_newtab_shortcut_width_title"[\s\S]*?id="_x_extension_newtab_shortcut_width_control_2026_unique_"/,
  'Options should keep a shortcut width control alongside the New Tab appearance panel'
);
assert.match(
  optionsSource,
  /kind:\s*'newtab-shortcut-width'[\s\S]*?id:\s*'_x_extension_newtab_shortcut_width_slider_2026_unique_'[\s\S]*?min:\s*NEWTAB_SHORTCUT_WIDTH_MIN[\s\S]*?max:\s*NEWTAB_SHORTCUT_WIDTH_MAX[\s\S]*?valueSuffix:\s*' px'/,
  'Options should bind the shared shortcut width setting to its own slider'
);

const shortcutSectionStart = newtabHtml.indexOf('.x-nt-shortcuts-section {');
const shortcutSectionEnd = newtabHtml.indexOf('\n      }', shortcutSectionStart);
const shortcutSectionCss = newtabHtml.slice(shortcutSectionStart, shortcutSectionEnd);
assert.match(
  shortcutSectionCss,
  /width:\s*min\(90vw,\s*var\(--x-nt-shortcut-width,\s*920px\)\);/
);
assert.match(
  newtabHtml,
  /\.x-nt-shortcuts-section\s*\{[\s\S]*?max-width:\s*100%;/
);
assert.doesNotMatch(
  shortcutSectionCss,
  /var\(--x-nt-search-max-width/,
  'shortcut width should not inherit the search box max width'
);
assert.match(
  newtabSource,
  /function applyNewtabShortcutWidth\(\)[\s\S]*?--x-nt-shortcut-width[\s\S]*?\$\{newtabShortcutWidth\}px/
);
assert.match(
  newtabSource,
  /NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY\][\s\S]*?normalizeNewtabShortcutWidth\(raw\)/
);

locales.forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
  assert(
    messages.settings_newtab_shortcut_width_title &&
      String(messages.settings_newtab_shortcut_width_title.message || '').trim(),
    `${locale} should localize the shortcut width setting`
  );
});

console.log('New Tab shortcut width setting tests passed.');
