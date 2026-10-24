const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const settings = require('../../src/shared/settings.ts');
const { parseCss, parsePageCss } = require('../helpers/css-rules');
const { readPageSource } = require('../helpers/page-source');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');

const optionsDocument = new JSDOM(readPageSource('src/options/options.html')).window.document;
const appearance = optionsDocument.querySelector('[data-content="appearance"]');
const motionTitle = appearance.querySelector('[data-i18n="settings_motion_effects_title"]');
const simpleTitle = appearance.querySelector('[data-i18n="settings_simple_mode_title"]');
const newtabSection = appearance.querySelector('[data-i18n="settings_newtab_section_title"]');
assert.ok((motionTitle.compareDocumentPosition(simpleTitle) & 4) && (simpleTitle.compareDocumentPosition(newtabSection) & 4),
  'simple mode should appear directly in the global Appearance group below motion effects');
assert.strictEqual(appearance.querySelector('[data-i18n="settings_simple_mode_desc"]').textContent, '移除更多提示元素，使搜索框更简洁',
  'the Simplified Chinese fallback should use the requested description');
assert.strictEqual(optionsDocument.getElementById('_x_extension_simple_mode_toggle_2026_unique_').checked, false,
  'simple mode should default to off in markup');

assert.strictEqual(settings.SIMPLE_MODE_ENABLED_STORAGE_KEY, '_x_extension_simple_mode_enabled_2026_unique_');
assert.strictEqual(settings.normalizeSimpleModeEnabled(undefined), false);
assert.strictEqual(settings.normalizeSimpleModeEnabled(false), false);
assert.strictEqual(settings.normalizeSimpleModeEnabled(true), true);

// The URL line takes the room the title leaves on both surfaces.
[
  [parsePageCss('newtab.html'), '.x-nt-suggestion-url-line'],
  [parseCss(fs.readFileSync('src/overlay/suggestions-view.css', 'utf8')), '.x-ov-suggestion-url-line']
].forEach(([css, selector]) => {
  const rule = css.entries.find((entry) => entry.selectors.some((text) => text.endsWith(selector)) && entry.style.getPropertyValue('flex'));
  assert.ok(rule, `missing ${selector}`);
  assert.deepStrictEqual([rule.style.getPropertyValue('flex'), parseFloat(rule.style.getPropertyValue('min-width')), rule.style.getPropertyValue('max-width')],
    ['0 1000 auto', 0, ''], `${selector} should use the room the title leaves`);
});

// Both surfaces render results with the live preference: resolved before the
// first results show, and followed when it changes. (What simple mode
// removes from a row is covered by react-src/search/suggestions.test.tsx.)
async function testSurface(name) {
  const stored = { [settings.SIMPLE_MODE_ENABLED_STORAGE_KEY]: true };
  const surface = await openSearchSurface(name, name === 'overlay' ? { settings: stored } : { sync: stored });
  await surface.settle(150);
  await surface.type('cats');
  await surface.settle(200);
  const rows = () => surface.suggestions();
  assert.ok(rows().length > 0 && rows().every((row) => row.getAttribute('data-simple-mode') === 'true'),
    `${name}: simple mode should apply from the first results`);
  if (name === 'newtab') {
    assert.strictEqual(rows()[0].querySelector('.x-nt-suggestion-title, [class*="suggestion-title"]').textContent.trim(), 'cats',
      'New Tab should show the plain query as the search row in simple mode');
  }
  if (name === 'overlay') {
    surface.page.changeSetting(settings.SIMPLE_MODE_ENABLED_STORAGE_KEY, false);
  } else {
    surface.page.changeStorage('sync', settings.SIMPLE_MODE_ENABLED_STORAGE_KEY, false);
  }
  await surface.settle(100);
  await surface.type('cats!');
  await surface.settle(200);
  assert.ok(rows().length > 0 && rows().every((row) => row.getAttribute('data-simple-mode') === 'false'),
    `${name}: turning simple mode off should show the decorated rows again`);
  surface.close();
}

const expectedCopy = {
  en: ['Minimal mode', 'Remove more decorative elements for a cleaner search box'],
  ja: ['シンプルモード', '装飾要素を減らし、検索ボックスをすっきり表示します'],
  zh_CN: ['简洁模式', '移除更多提示元素，使搜索框更简洁'],
  zh_TW: ['簡潔模式', '移除更多裝飾元素，讓搜尋框更整潔']
};
Object.entries(expectedCopy).forEach(([locale, [title, description]]) => {
  const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
  assert.strictEqual(messages.settings_simple_mode_title.message, title);
  assert.strictEqual(messages.settings_simple_mode_desc.message, description);
});

(async () => {
  for (const name of SURFACES) await testSurface(name);
  console.log('simple mode setting tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
