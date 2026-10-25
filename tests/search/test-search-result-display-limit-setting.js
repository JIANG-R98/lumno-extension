const assert = require('assert');
const fs = require('fs');
const settings = require('../../src/domain/settings.ts');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');
const suggestionNavigation = require('../../src/shared/search/suggestion-navigation.ts');

// How many results a search surface shows, set in Settings (5 to 10). Open
// tabs are the exception: the overlay lists them all in a scrolling viewport
// that many rows tall.

const LIMIT = settings.SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY;
assert.strictEqual(LIMIT, '_x_extension_search_result_display_limit_2026_unique_');
const RESULTS = Array.from({ length: 12 }, (_, index) => ({ type: 'history', title: `Result ${index}`, url: `https://r${index}.test/` }));
const TABS = Array.from({ length: 12 }, (_, index) => ({ id: 100 + index, windowId: 1, title: `Tab ${index}`, url: `https://t${index}.test/` }));

function stored(name, values) {
  return name === 'overlay' ? { settings: values } : { sync: values };
}

function changeStored(surface, key, value) {
  if (surface.name === 'overlay') {
    surface.page.changeSetting(key, value);
  } else {
    surface.page.changeStorage('sync', key, value);
  }
}

async function testSettingsSlider() {
  const page = await createOptionsPage({ sync: { [LIMIT]: 7 } });
  await page.settle(80);
  const [sources, limit, openTabs] = [
    '_x_extension_search_result_source_types_2026_unique_',
    '_x_extension_search_result_display_limit_setting_row_2026_unique_',
    '_x_extension_overlay_open_tabs_default_visible_toggle_2026_unique_'
  ].map((id) => page.byId(id));
  assert.ok((sources.compareDocumentPosition(limit) & 4) && (limit.compareDocumentPosition(openTabs) & 4),
    'the result limit should sit between result types and default open tabs');
  const css = parseCss(readStylesheet('src/options/options.css'));
  assert.ok(css.entries.some((entry) => entry.selectors.includes('#_x_extension_bookmark_rows_control_2026_unique_') &&
    entry.selectors.includes('#_x_extension_search_result_display_limit_control_2026_unique_')),
  'the result limit should share the bookmark-rows slider sizing');

  const slider = page.byId('_x_extension_search_result_display_limit_slider_2026_unique_');
  assert.deepStrictEqual([slider.type, slider.min, slider.max, slider.step, slider.value], ['range', '5', '10', '1', '7'],
    'Settings should offer whole numbers from 5 to 10, starting from the stored value');
  slider.value = '9';
  slider.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  slider.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  await page.settle(120);
  assert.ok(page.storage.sync.writes.some((write) => write[LIMIT] === 9), 'moving the slider should save the limit');
  page.close();
}

async function testSurfaceFollowsTheLimit(name) {
  const surface = await openSearchSurface(name, Object.assign({
    respond: (message) => (message.action === 'getSearchSuggestions' ? { suggestions: RESULTS } : undefined)
  }, stored(name, { [LIMIT]: 5 })));
  await surface.type('result');
  await surface.settle(150);
  assert.strictEqual(surface.suggestions().length, 5, `${name}: the results should stop at the limit`);
  changeStored(surface, LIMIT, 8);
  await surface.settle(150);
  assert.strictEqual(surface.suggestions().length, 8, `${name}: a new limit should apply to the results already showing`);
  surface.close();

  for (const [priority, searchFirst] of [['search', true], ['autocomplete', false]]) {
    const ordered = await openSearchSurface(name, Object.assign({
      respond: (message) => (message.action === 'getSearchSuggestions' ? { suggestions: RESULTS } : undefined)
    }, stored(name, { [LIMIT]: 6, _x_extension_search_result_priority_2026_unique_: priority })));
    await ordered.type('result');
    await ordered.settle(250);
    const request = ordered.page.messages.filter((message) => message.action === 'getSearchEngineSuggestions').pop();
    assert.ok(request && Boolean(request.searchFirst) === searchFirst,
      `${name}: ${priority} ordering should ${searchFirst ? '' : 'not '}ask for the larger search-first share of engine suggestions`);
    assert.ok(ordered.suggestions().length <= 6, `${name}: ${priority} ordering should respect the limit`);
    ordered.close();
  }
}

async function testOverlayOpenTabsShowEveryTab() {
  const surface = await openSearchSurface('overlay', {
    openContext: { tabs: TABS },
    settings: { [LIMIT]: 5, _x_extension_overlay_open_tabs_default_visible_2026_unique_: true },
    respond: (message) => (message.action === 'getTabsForOverlay' || message.action === 'getTabs' ? { tabs: TABS } : undefined)
  });
  await surface.settle(200);
  const container = surface.root.querySelector('#_x_extension_suggestions_container_2024_unique_');
  assert.strictEqual(surface.suggestions().length, 12, 'every open tab should be listed, not just the first few');
  assert.strictEqual(container.getAttribute('data-open-tabs-visible-row-limit'), '5', 'the list should scroll after five rows');
  surface.page.changeSetting(LIMIT, 7);
  await surface.settle(150);
  assert.strictEqual(container.getAttribute('data-open-tabs-visible-row-limit'), '7', 'a new limit should resize the open tabs viewport');
  await surface.type('Tab 11');
  await surface.settle(150);
  assert.ok(surface.suggestions().some((row) => /Tab 11/.test(row.textContent)), 'searching open tabs should look through all of them');
  surface.close();

  const few = await openSearchSurface('overlay', {
    openContext: { tabs: TABS.slice(0, 3) },
    settings: { [LIMIT]: 5, _x_extension_overlay_open_tabs_default_visible_2026_unique_: true },
    respond: (message) => (message.action === 'getTabsForOverlay' || message.action === 'getTabs' ? { tabs: TABS.slice(0, 3) } : undefined)
  });
  await few.settle(200);
  assert.strictEqual(few.root.querySelector('#_x_extension_suggestions_container_2024_unique_').getAttribute('data-open-tabs-visible-row-limit'), null,
    'a short open tabs list should keep its natural height');
  few.close();

  const css = parseCss(readStylesheet('src/overlay/suggestions-view.css'));
  const viewport = css.entries.filter((entry) => entry.selectors.some((selector) => selector.endsWith('.x-ov-suggestions-container[data-open-tabs-visible-row-limit]')));
  assert.ok(viewport.some((entry) => entry.style.getPropertyValue('scrollbar-gutter') === 'stable'),
    'the scrolling open tabs viewport should keep a stable scrollbar gutter');
  assert.ok(css.selectors().some((selector) => selector.endsWith('.x-ov-suggestions-container[data-open-tabs-visible-row-limit]::-webkit-scrollbar-thumb')),
    'Chromium should draw its scrollbar thumb');
}

assert.strictEqual(
  suggestionNavigation.getVisibleRowsViewportHeight({
    visibleRowLimit: 5,
    itemCount: 10,
    rowHeight: 52,
    rowGap: 4,
    paddingTop: 12,
    paddingBottom: 12
  }),
  304,
  'a scrollable viewport should include the gap after the last visible row'
);
assert.strictEqual(
  suggestionNavigation.getVisibleRowsViewportHeight({
    visibleRowLimit: 5,
    itemCount: 5,
    rowHeight: 52,
    rowGap: 4,
    paddingTop: 12,
    paddingBottom: 12
  }),
  300,
  'a complete five-row list should not reserve a trailing row gap'
);
assert.strictEqual(
  suggestionNavigation.getVisibleRowsViewportHeight({
    visibleRowLimit: 5,
    itemCount: 0,
    rowHeight: 52,
    rowGap: 4,
    paddingTop: 12,
    paddingBottom: 12
  }),
  0,
  'an empty list should not force a viewport height'
);

['en', 'ja', 'zh_CN', 'zh_TW'].forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
  assert(messages.settings_search_result_display_limit_title?.message,
    `${locale} should localize the result display limit label`);
});

(async () => {
  await testSettingsSlider();
  for (const name of SURFACES) {
    await testSurfaceFollowsTheLimit(name);
  }
  await testOverlayOpenTabsShowEveryTab();
  console.log('search result display limit setting tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
