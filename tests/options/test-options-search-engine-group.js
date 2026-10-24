const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const SHORTCUT_FAVICON = require('../../src/shared/favicon/shortcut-favicon.ts');
const { createOptionsPage } = require('../helpers/options-page');
const { readPageSource } = require('../helpers/page-source');

// Built-in search engines get their own group in Settings, after the custom
// entry, site search and AI search. (New Tab and the overlay group them the
// same way; see tests/search/test-local-search-scopes.js.)

const repoRoot = path.resolve(__dirname, '..', '..');
const ENGINE_LIST_ID = '_x_extension_search_engine_builtin_list_2026_unique_';
const builtins = JSON.parse(fs.readFileSync(path.join(repoRoot, 'assets/data/site-search.json'), 'utf8')).items;

function testMarkup() {
  const doc = new JSDOM(readPageSource('src/options/options.html')).window.document;
  const engineGroup = doc.getElementById('_x_extension_search_engine_group_2026_unique_');
  const customGroup = doc.querySelector('[data-i18n="shortcuts_group_custom"]');
  const siteGroup = Array.from(doc.querySelectorAll('[data-i18n="search_scope_group_sites"]'))
    .find((node) => customGroup.compareDocumentPosition(node) & 4);
  const aiGroup = doc.getElementById('_x_extension_site_search_ai_group_2026_unique_');
  const before = (first, second) => Boolean(first && second && (first.compareDocumentPosition(second) & 4));
  assert.ok(engineGroup, 'Options should render a dedicated search-engine group');
  assert.ok(before(customGroup, siteGroup) && before(siteGroup, aiGroup) && before(aiGroup, engineGroup),
    'Options should place the unified custom entry first and built-in search engines last');
  assert.ok(doc.getElementById(ENGINE_LIST_ID).classList.contains('_x_extension_shortcut_list_2024_unique_'),
    'Options should expose a dedicated list host for built-in search engines');
  assert.deepStrictEqual(Array.from(doc.querySelectorAll('[data-site-search-category]')).map((node) => node.getAttribute('data-site-search-category')).slice(0, 1), ['site']);
  assert.ok(doc.querySelector('[data-site-search-category="searchEngine"]'), 'the unified custom form should let users choose its search panel group');
  const tabs = doc.querySelector('._x_extension_site_search_category_tabs_2026_unique_, [class*="_x_extension_site_search_category_tabs_2026_unique_"]');
  assert.ok(tabs && tabs.getAttribute('role') === 'group', 'the custom provider group selector should be a button group');
  assert.deepStrictEqual(Array.from(tabs.querySelectorAll('[aria-pressed]')).map((button) => button.getAttribute('aria-pressed')).slice(0, 2), ['true', 'false']);
}

async function testEnginesListOnTheirOwn() {
  const page = await createOptionsPage({ sync: { _x_extension_language_2024_unique_: 'en' } });
  await page.settle(500);
  const cards = Array.from(page.byId(ENGINE_LIST_ID).querySelectorAll('[data-provider-id]'));
  const engines = builtins.filter((item) => item.category === 'searchEngine');
  assert.deepStrictEqual(cards.map((card) => card.getAttribute('data-key')).sort(), engines.map((item) => item.key).sort(),
    'the engine group should list the built-in search engines and nothing else');
  cards.forEach((card) => {
    const key = card.getAttribute('data-key');
    const badges = Array.from(card.querySelectorAll('._x_extension_shortcut_badge_2024_unique_')).map((badge) => badge.textContent);
    assert.ok(badges.includes('Built-in'), `${key} should carry the built-in badge`);
    const engine = engines.find((item) => item.key === key);
    assert.strictEqual(card.querySelector('img').getAttribute('src'),
      `chrome-extension://lumno-test/${SHORTCUT_FAVICON.getSiteSearchPinnedIconAssetPath(engine)}`,
      `${key} should use the same bundled tile as the search-scope panel`);
  });
  const siteCards = Array.from(page.byId('_x_extension_site_search_builtin_list_2024_unique_').querySelectorAll('[data-provider-id]'));
  assert.ok(siteCards.length > 0 && siteCards.every((card) => card.getAttribute('data-provider-category') !== 'searchEngine'),
    'site search should not repeat the engines');
  page.close();
}

['en', 'ja', 'zh_CN', 'zh_TW'].forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(path.join(repoRoot, `_locales/${locale}/messages.json`), 'utf8'));
  ['search_scope_group_engines', 'shortcuts_empty_engines', 'shortcuts_label_display_group'].forEach((key) => {
    assert.ok(messages[key] && messages[key].message, `${locale} should localize ${key}`);
  });
});

(async () => {
  testMarkup();
  await testEnginesListOnTheirOwn();
  console.log('options search-engine group tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
