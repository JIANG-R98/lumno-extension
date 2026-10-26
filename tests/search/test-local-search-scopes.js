const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss } = require('../helpers/css-rules');
const { bundledSiteSearchProviders } = require('../helpers/overlay-runtime-harness');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');

// The scope panel both search surfaces share: what it lists, how it filters
// and hands focus around, and what a browser-content scope (top sites,
// bookmarks, history) asks the background for.

const repoRoot = path.resolve(__dirname, '..', '..');
const ITEM = '.x-lumno-search-input-mode__menu-item';

function languageOption(name, language) {
  return name === 'overlay'
    ? { settings: { _x_extension_language_2024_unique_: language } }
    : { sync: { _x_extension_language_2024_unique_: language } };
}

// The panel's cards under each group title, in order.
function menuGroups(surface) {
  const content = surface.root.querySelector('.x-lumno-search-input-mode__menu-content');
  const groups = [];
  Array.from(content.querySelectorAll(`.x-lumno-search-input-mode__menu-group, ${ITEM}`)).forEach((element) => {
    if (element.classList.contains('x-lumno-search-input-mode__menu-group')) {
      groups.push({ title: element.textContent.trim(), items: [] });
    } else if (groups.length) {
      groups[groups.length - 1].items.push(element.getAttribute('data-mode-id'));
    }
  });
  return groups;
}

function visibleItems(surface) {
  return Array.from(surface.root.querySelectorAll(ITEM)).filter((item) => !item.hidden).map((item) => item.getAttribute('data-mode-id'));
}

async function typeIntoPanel(surface, text) {
  for (const key of text) {
    surface.press(key, { target: surface.root.activeElement });
    await surface.settle(5);
  }
  await surface.settle(40);
}

async function testPanelGroupsEveryScope(name) {
  const surface = await openSearchSurface(name);
  await surface.openScopeMenu();
  const groups = menuGroups(surface);
  assert.deepStrictEqual(groups.map((group) => group.title), ['Search engines', 'Site search', 'AI search', 'Browser content'],
    `${name}: the panel should group search engines, site search, AI search, then browser content`);
  const [engines, sites, ai, browserContent] = groups.map((group) => group.items);
  const providers = bundledSiteSearchProviders();
  assert.deepStrictEqual(engines.concat(sites, ai).sort(), providers.map((provider) => `provider:${provider.key}`).sort(),
    `${name}: every provider should be listed once`);
  assert.deepStrictEqual(engines, providers.filter((provider) => provider.category === 'searchEngine').map((provider) => `provider:${provider.key}`),
    `${name}: search engines should come first, in their configured order`);
  ['provider:gpt', 'provider:ds', 'provider:pplx'].forEach((id) => assert.ok(ai.includes(id), `${name}: ${id} is an AI search`));
  ['provider:yt', 'provider:gh'].forEach((id) => assert.ok(sites.includes(id), `${name}: ${id} is a site search`));
  const local = ['local:topSite', 'local:bookmark', 'local:history'];
  assert.deepStrictEqual(browserContent, name === 'overlay' ? ['openTabs'].concat(local) : local,
    `${name}: browser content should list ${name === 'overlay' ? 'open tabs, ' : ''}top sites, bookmarks and history`);
  surface.close();
}

async function testPanelFiltersAsYouType(name) {
  const surface = await openSearchSurface(name, languageOption(name, 'zh_CN'));
  await surface.settle(100);
  await surface.openScopeMenu();
  assert.ok(surface.root.activeElement.classList.contains('x-lumno-search-input-mode__menu'),
    `${name}: an open panel should own the keyboard`);
  await typeIntoPanel(surface, 'history');
  assert.strictEqual(surface.input().value, '', `${name}: typing into the panel should not reach the search input`);
  assert.deepStrictEqual(visibleItems(surface), ['local:history'],
    `${name}: a localized browser-content scope should still match its English name`);
  const focused = surface.root.activeElement;
  assert.strictEqual(focused.getAttribute('data-mode-id'), 'local:history', `${name}: the first match should take focus`);
  assert.strictEqual(focused.querySelector('.x-lumno-search-input-mode__menu-match').textContent, '历史',
    `${name}: the matched title should be highlighted`);
  assert.match(focused.getAttribute('aria-label') || focused.textContent, /历史/, `${name}: the card should keep its accessible name`);

  surface.press('Enter', { target: focused });
  await surface.settle(60);
  assert.strictEqual(surface.scopeLabel(), '历史', `${name}: Enter should switch to the focused scope`);
  assert.ok(surface.scopeMenuOpen() && surface.root.activeElement.getAttribute('data-mode-id') === 'local:history',
    `${name}: a keyboard choice should keep the panel and its focus`);
  const checked = Array.from(surface.root.querySelectorAll(`${ITEM}[aria-checked="true"]`)).map((item) => item.getAttribute('data-mode-id'));
  assert.deepStrictEqual(Array.from(checked), ['local:history'], `${name}: only the chosen scope should be checked, hidden cards included`);
  surface.close();
}

async function testTabMovesFocusBetweenPanelAndInput(name) {
  const surface = await openSearchSurface(name);
  await surface.openScopeMenu();
  const menu = surface.root.querySelector('.x-lumno-search-input-mode__menu');
  surface.press('Tab', { target: surface.root.activeElement });
  await surface.settle(40);
  assert.strictEqual(surface.root.activeElement, surface.input(), `${name}: Tab in the panel should hand focus to the input`);
  assert.ok(surface.scopeMenuOpen(), `${name}: and keep the panel open`);
  assert.strictEqual(surface.input().placeholder, 'Search specific site content…', `${name}: the open panel has its own placeholder`);
  surface.press('Tab', { target: surface.root.activeElement });
  await surface.settle(40);
  assert.strictEqual(surface.root.activeElement, menu, `${name}: Tab again should return focus to the panel`);

  surface.root.querySelector(`${ITEM}[data-mode-id="provider:yt"]`)
    .dispatchEvent(new surface.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await surface.settle(60);
  assert.strictEqual(surface.scopeLabel(), 'YouTube');
  assert.strictEqual(surface.root.activeElement, surface.input(), `${name}: a clicked scope should send focus to the input`);
  surface.close();
}

async function testBrowserContentScopeSearchesOnlyThatSource(name) {
  const surface = await openSearchSurface(name, {
    respond(message) {
      return message.action === 'getSearchSuggestions' ? { suggestions: [] } : undefined;
    }
  });
  await surface.type('history');
  const hint = surface.root.querySelector('.x-lumno-search-input-mode__tab-hint');
  assert.strictEqual(hint.textContent.trim(), 'TabOnly search History', `${name}: typing a source name should offer its scope`);
  surface.press('Tab');
  await surface.settle(80);
  assert.strictEqual(surface.scopeLabel(), 'History', `${name}: Tab should switch to the History scope`);
  assert.strictEqual(surface.input().value, '', `${name}: the trigger word should be consumed`);
  assert.strictEqual(surface.input().placeholder, 'Search within this scope; press Tab again to open the scope panel…',
    `${name}: an active scope with the panel closed has its own placeholder`);

  const before = surface.page.messages.length;
  await surface.type('cats');
  await surface.settle(120);
  const sent = surface.page.messages.slice(before);
  const request = sent.find((message) => message.action === 'getSearchSuggestions');
  assert.ok(request, `${name}: a scoped query should still search`);
  assert.deepStrictEqual(JSON.parse(JSON.stringify([request.sourceTypes, request.includeOpenTabs])), [['history'], false],
    `${name}: the History scope should ask for history only, without open tabs`);
  assert.ok(!sent.some((message) => message.action === 'getSearchEngineSuggestions'),
    `${name}: a browser-content scope should not ask the search engine`);
  const empty = surface.root.querySelector(name === 'overlay' ? '.x-ov-empty-state' : '.x-nt-empty-state');
  assert.ok(empty && empty.textContent.trim() === 'No matching results', `${name}: no result should say so`);

  const afterQuery = surface.page.messages.length;
  surface.press('Enter');
  await surface.settle(80);
  assert.strictEqual(surface.page.messages.length, afterQuery, `${name}: Enter on no result should not fall back to a web search`);
  if (name === 'newtab') {
    assert.deepStrictEqual([surface.page.created.length, surface.page.searches.length, surface.page.updated.length], [0, 0, 0]);
  }
  surface.close();
}

function testStylesheet() {
  const css = parseCss(readStylesheet('src/shared/search/search-input.css'));
  ['newtab', 'overlay'].forEach((surface) => {
    const menu = css.rule(`.x-lumno-search-input-mode__menu[data-surface="${surface}"]`);
    assert.strictEqual(menu && menu.get('backdrop-filter'), 'none', `the ${surface} scope panel should be opaque, not blurred`);
    const content = css.rule(`.x-lumno-search-input-mode__menu[data-surface="${surface}"] .x-lumno-search-input-mode__menu-content`);
    assert.ok(content && content.get('overflow-y') === 'scroll' && content.get('scrollbar-gutter') === 'stable',
      `the ${surface} scope panel should scroll without its cards shifting`);
  });
  assert.strictEqual(css.rule('.x-lumno-search-input-mode__menu-favicon-mask > [hidden]').get('display'), 'none',
    'a loaded provider favicon should hide its fallback glyph');
  const hover = css.rule('.x-lumno-search-input-mode__menu-item:hover:not([aria-checked="true"]):not(:focus-visible)');
  assert.ok(hover && hover.get('border-color') === 'transparent', 'hover should not override the keyboard focus border');
  assert.match(css.rule('.x-lumno-search-input-mode__menu-item:focus-visible').get('border-color'), /--x-lumno-search-mode-item-focus-ring/,
    'keyboard focus should use the provider-tinted focus ring');

  const overlayResults = parseCss(readStylesheet('src/overlay/suggestions-view.css')).entries
    .filter((entry) => /--x-ov-suggestions-menu-fit-max-height/.test(entry.style.getPropertyValue('max-height')));
  assert.ok(overlayResults.length > 0, 'overlay results should shrink to leave room for the scope panel');
}

function testPackaging() {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
  assert.ok(manifest.web_accessible_resources.some((entry) => entry.resources.includes('build/pinyin.js')),
    'the pinyin runtime the injected panel loads on demand should be web-accessible');
  [
    ['en', 'Only search {source}'],
    ['zh_CN', '仅搜索{source}'],
    ['zh_TW', '僅搜尋{source}'],
    ['ja', '{source}のみ検索']
  ].forEach(([locale, expected]) => {
    const messages = JSON.parse(fs.readFileSync(path.join(repoRoot, `_locales/${locale}/messages.json`), 'utf8'));
    assert.strictEqual(messages.local_search_tab_hint.message, expected, `${locale} should localize the browser-content Tab hint`);
  });
}

(async () => {
  for (const name of SURFACES) {
    await testPanelGroupsEveryScope(name);
    await testPanelFiltersAsYouType(name);
    await testTabMovesFocusBetweenPanelAndInput(name);
    await testBrowserContentScopeSearchesOnlyThatSource(name);
  }
  testStylesheet();
  testPackaging();
  console.log('local search scope tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
