const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const settings = require('../../src/domain/settings.ts');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss, parsePageCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');
const { createNewtabPage } = require('../helpers/newtab-page');

// How many shortcuts a New Tab row holds, and their size and spacing: the
// settings, their Settings sliders, and the layout New Tab derives from them.

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
assert.strictEqual(settings.NEWTAB_SHORTCUT_SIZE_MAX, 112);
assert.strictEqual(settings.NEWTAB_SHORTCUT_SIZE_DEFAULT, 64);
assert.strictEqual(settings.NEWTAB_SHORTCUT_GAP_MIN, 0);
assert.strictEqual(settings.NEWTAB_SHORTCUT_GAP_MAX, 24);
assert.strictEqual(settings.NEWTAB_SHORTCUT_GAP_DEFAULT, 4);


const COLUMNS = settings.NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY;
const WIDTH = settings.NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY;
const SIZE = settings.NEWTAB_SHORTCUT_SIZE_STORAGE_KEY;

function layout(page) {
  const style = page.document.documentElement.style;
  const px = (name) => Number.parseFloat(style.getPropertyValue(name));
  return {
    columns: style.getPropertyValue('--x-nt-shortcut-columns'),
    tile: px('--x-nt-shortcut-user-tile-size'),
    icon: px('--x-nt-shortcut-user-icon-size'),
    favicon: px('--x-nt-shortcut-user-favicon-size')
  };
}

async function testColumnsOnNewTab() {
  for (const [sync, columns, why] of [
    [{}, '10', 'a fresh install shows ten per row'],
    [{ [WIDTH]: 1440 }, '16', 'an old pixel width should seed the column count once'],
    [{ [WIDTH]: 1440, [COLUMNS]: 6 }, '6', 'a stored column count wins over the old width']
  ]) {
    const page = await createNewtabPage({ sync });
    await page.settle(300);
    assert.strictEqual(layout(page).columns, columns, why);
    if (columns === '6') {
      page.changeStorage('sync', COLUMNS, 12);
      await page.settle(80);
      assert.strictEqual(layout(page).columns, '12', 'a column change in Settings should apply at once');
    }
    page.close();
  }
}

// Fractional or odd-margin icon sizes snap unevenly on 1x screens and push the
// favicon off center inside its rounded square while the size slider moves.
async function testIconSizesStayCentered() {
  const page = await createNewtabPage();
  await page.settle(300);
  assert.deepStrictEqual(layout(page), { columns: '10', tile: 64, icon: 48, favicon: 28 }, 'the default tile keeps its 48px icon and 28px favicon');
  for (let size = settings.NEWTAB_SHORTCUT_SIZE_MIN; size <= settings.NEWTAB_SHORTCUT_SIZE_MAX; size++) {
    page.changeStorage('sync', SIZE, size);
    await page.settle(5);
    const { tile, icon, favicon } = layout(page);
    assert.strictEqual(tile, size);
    assert.ok(Number.isInteger(icon) && Number.isInteger(favicon), `size ${size} should use whole pixels`);
    assert.strictEqual((size - icon) % 2, 0, `size ${size} should leave an even margin around the icon`);
    assert.strictEqual((icon - favicon) % 2, 0, `size ${size} should leave an even margin around the favicon`);
    assert.ok(Math.abs(icon - size * 0.75) <= 1, `size ${size} icon should stay within 1px of its ratio`);
    assert.ok(Math.abs(favicon - size * 0.4375) <= 1, `size ${size} favicon should stay within 1px of its ratio`);
  }
  page.close();
}

async function testSettings() {
  const doc = new JSDOM(fs.readFileSync('src/options/options.html', 'utf8')).window.document;
  const row = doc.getElementById('_x_extension_newtab_shortcut_columns_setting_row_2026_unique_');
  assert.ok(row && row.querySelector('[data-i18n="settings_newtab_shortcut_columns_title"]') &&
    row.querySelector('#_x_extension_newtab_shortcut_columns_control_2026_unique_'), 'Settings should host the per-row slider');
  const [columns, size, gap] = ['columns', 'size', 'gap'].map((name) => doc.querySelector(`[data-i18n="settings_newtab_shortcut_${name}_title"]`));
  assert.ok((columns.compareDocumentPosition(size) & 4) && (size.compareDocumentPosition(gap) & 4), 'size and spacing should follow shortcuts-per-row');

  const page = await createOptionsPage({ sync: { [COLUMNS]: 8 } });
  await page.settle(80);
  const slider = page.byId('_x_extension_newtab_shortcut_columns_slider_2026_unique_');
  assert.deepStrictEqual([slider.min, slider.max, slider.step, slider.value], ['4', '16', '1', '8'], 'the slider should offer 4 to 16 per row');
  const valueInput = page.byId('_x_extension_newtab_shortcut_columns_control_2026_unique_').querySelector('input:not([type="range"])');
  assert.ok(valueInput && valueInput.classList.contains('_x_extension_shortcut_input_2024_unique_'), 'the typed value should use the shared input');
  Object.getOwnPropertyDescriptor(page.window.HTMLInputElement.prototype, 'value').set.call(valueInput, '13');
  valueInput.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  valueInput.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  valueInput.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  valueInput.dispatchEvent(new page.window.FocusEvent('blur'));
  await page.settle(120);
  slider.value = '12';
  slider.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  slider.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  await page.settle(120);
  const saved = page.storage.sync.writes.filter((write) => Object.hasOwn(write, COLUMNS)).map((write) => write[COLUMNS]);
  assert.ok(saved.includes(13) && saved.includes(12), `typed and slid column counts should be saved: ${saved}`);
  page.close();
}

function testStyles() {
  const newtab = parsePageCss('newtab.html');
  assert.ok(newtab.entries.some((entry) => entry.style.getPropertyValue('--x-nt-shortcut-columns') === '10'), 'ten per row by default');
  assert.strictEqual(newtab.rule('.x-nt-shortcuts-section').get('width'), 'min(90vw, var(--x-nt-shortcuts-target-width, 692px))');
  const grid = newtab.rule('.x-nt-shortcuts-grid');
  assert.deepStrictEqual([grid.get('display'), grid.get('flex-wrap'), grid.get('justify-content')], ['flex', 'wrap', 'center'],
    'partial rows should center inside the per-row width');
  const tokens = newtab.entries.find((entry) => entry.style.getPropertyValue('--x-nt-shortcut-tile-size'));
  assert.deepStrictEqual([tokens.style.getPropertyValue('--x-nt-shortcut-tile-size'), tokens.style.getPropertyValue('--x-nt-shortcuts-grid-row-gap')]
    .map((value) => value.trim()), ['var(--x-nt-shortcut-user-tile-size)', 'var(--x-nt-shortcut-user-row-gap)'],
  'the default geometry should flow through the user-controlled variables');
  for (const density of ['compact', 'tiny']) {
    const rule = newtab.rule(`body[data-nt-bottom-dock-density="${density}"]`);
    assert.ok(rule, `${density} dock density rule should exist`);
    rule.names().forEach((name) => assert.doesNotMatch(name, /--x-nt-shortcut-(tile|icon|favicon)-size|--x-nt-shortcut-tile-padding|--x-nt-shortcuts-grid-(row|column)-gap/,
      `${density} dock density should keep the size and spacing chosen in Settings`));
    assert.match(rule.get('--x-nt-shortcuts-grid-padding'), /^\d+px 8px \d+px$/, `${density} dock density should keep the horizontal padding`);
  }
  newtab.entries.filter((entry) => entry.conditions.some((condition) => /max-height/.test(condition))).forEach((entry) => {
    assert.doesNotMatch(entry.style.getPropertyValue('--x-nt-shortcut-tile-size'), /^min\(/, 'short windows should not cap the chosen size');
  });
  assert.ok(!newtab.selectors().some((selector) => /\.x-nt-overlay-slider::-webkit-slider-(thumb|runnable-track)|\.x-nt-overlay-tick/.test(selector)),
    'New Tab should theme the shared slider rather than redraw it');

  const slider = parseCss(readStylesheet('src/shared/ui/range-slider.css'));
  assert.strictEqual(slider.rule('.x-range-slider-reset:disabled').get('visibility'), 'hidden', 'a reset with nothing to reset should disappear');
  assert.strictEqual(slider.rule('.x-range-slider-field').get('align-items'), 'center', 'label, track and value share one row');
  assert.strictEqual(slider.rule('.x-range-slider-input::-webkit-slider-thumb').get('margin-top'),
    'calc((var(--x-range-slider-track-height) - var(--x-range-slider-thumb-size)) / 2)', 'the thumb should stay centered on the track');
  const reset = slider.entries.find((entry) => entry.selectors.some((selector) => selector.includes('_x_extension_range_slider_reset_button_2026_unique_')) &&
    entry.style.getPropertyValue('padding'));
  assert.deepStrictEqual(reset && [reset.style.getPropertyValue('padding'), reset.style.getPropertyValue('border-radius')], ['4px', '8px'],
    'New Tab should have the compact icon button fallback');
  const options = parsePageCss('src/options/options.html');
  assert.ok(!options.selectors().some((selector) => /_x_extension_range_slider_value_input_2026_unique_:(hover|focus|focus-visible|disabled)/.test(selector)),
    'the slider value input should not get a second Settings appearance');
  const input = parseCss(readStylesheet('src/newtab/shortcuts/shortcut-dialog.css')).rule('._x_extension_shortcut_input_2024_unique_');
  assert.deepStrictEqual([input.get('border'), input.get('background')], ['1px solid var(--tab-border)', 'var(--control-bg)'],
    'New Tab slider values should use the existing input appearance');
}

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


(async () => {
  await testColumnsOnNewTab();
  await testIconSizesStayCentered();
  await testSettings();
  testStyles();
  console.log('New Tab shortcut column setting tests passed.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
