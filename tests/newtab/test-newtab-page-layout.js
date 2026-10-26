const assert = require('assert');
const { JSDOM } = require('jsdom');
const settings = require('../../src/domain/settings/index.ts');
const { parsePageCss } = require('../helpers/css-rules');
const { createNewtabPage } = require('../helpers/newtab-page');
const { createOptionsPage } = require('../helpers/options-page');
const { readPageSource } = require('../helpers/page-source');

// New Tab's page-level layout as the browser runs it: grid columns by
// viewport, resizing without reloading recent sites, the entrance sequence,
// and the bookmark grid settings.

const BOOKMARK_GRID_ID = '_x_extension_newtab_bookmarks_grid_2024_unique_';
const RECENT_GRID_ID = '_x_extension_newtab_recent_sites_grid_2024_unique_';
const SEARCH_ROOT_ID = '_x_extension_newtab_root_2024_unique_';
const MOTION_KEY = '_x_extension_motion_effects_enabled_2026_unique_';

const HISTORY = Array.from({ length: 20 }, (_, index) => ({
  url: `https://site${index}.example/`,
  title: `Site ${index}`,
  lastVisitTime: Date.now() - index * 1000,
  visitCount: 3
}));

async function openPage(options) {
  const config = options || {};
  const historySearches = [];
  const page = await createNewtabPage({
    sync: Object.assign({
      [settings.recentCount.key]: 8,
      [settings.recentMode.key]: 'latest'
    }, config.sync || {}),
    history: HISTORY,
    bookmarks: [{ title: 'A', url: 'https://a.example/' }],
    setup(window) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: config.width || 1600 });
      const search = window.chrome.history.search;
      window.chrome.history.search = (query, callback) => {
        historySearches.push(query);
        return search(query, callback);
      };
      if (typeof config.setup === 'function') {
        config.setup(window);
      }
    }
  });
  await page.settle(400);
  page.historySearches = historySearches;
  page.columns = () => [
    page.document.getElementById(BOOKMARK_GRID_ID).style.getPropertyValue('--x-nt-bookmark-columns'),
    page.document.getElementById(RECENT_GRID_ID).style.getPropertyValue('--x-nt-recent-columns')
  ];
  return page;
}

async function testGridColumnsFollowTheViewport() {
  const wide = await openPage({ width: 1600 });
  assert.strictEqual(wide.columns()[0], '6', 'the bookmark grid should default to six columns');
  wide.close();

  const phone = await openPage({ width: 375 });
  assert.deepStrictEqual(phone.columns(), ['2', '2'], 'phones should show bookmarks and recent sites in two columns');
  assert.ok(phone.document.body.classList.contains('x-nt-mobile-flow'), 'and switch to the mobile flow');

  // Widening the window changes the columns from the loaded recent sites
  // instead of reloading them, which could flash after the resize.
  const loads = phone.historySearches.length;
  phone.window.innerWidth = 1600;
  phone.window.dispatchEvent(new phone.window.Event('resize'));
  await phone.settle(600);
  assert.deepStrictEqual(phone.columns(), ['6', '5'], 'a wide window should show more columns');
  assert.strictEqual(phone.historySearches.length, loads, 'resizing should not reload recent sites');
  assert.strictEqual(phone.document.querySelectorAll('.x-nt-recent-card').length, 10,
    'the loaded recent sites should fill the wider grid');
  phone.close();
}

// Wide mode lets recent sites grow to six columns.
async function testWideModeWidensRecentSites() {
  const columnsIn = async (mode) => {
    const page = await openPage({ width: 1800, sync: { [settings.newtabWidthMode.key]: mode } });
    const columns = page.columns()[1];
    page.close();
    return columns;
  };
  assert.deepStrictEqual([await columnsIn('standard'), await columnsIn('wide')], ['4', '6'],
    'recent sites should use four columns in standard mode and six in wide mode');
}

async function testEntranceSequence() {
  // The entrance lasts 260ms, so whether it is still running when a test gets
  // the page depends on how fast the machine is. Instead the page is watched
  // from the start: the moment the entrance starts, the test records the
  // state and presses a key.
  let started = null;
  let afterKey = null;
  const moving = await openPage({
    sync: { [MOTION_KEY]: true },
    setup(window) {
      new window.MutationObserver(() => {
        const body = window.document.body;
        if (started || body.getAttribute('data-nt-enter') !== 'run') {
          return;
        }
        const searchRoot = window.document.getElementById(SEARCH_ROOT_ID);
        const entrance = () => [body.getAttribute('data-nt-enter'), searchRoot.getAttribute('data-lumno-search-entry')];
        started = { ready: body.getAttribute('data-nt-ready'), entrance: entrance() };
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        afterKey = entrance();
      }).observe(window.document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-nt-enter'] });
    }
  });
  await moving.waitFor(() => started, 'the entrance should start');
  assert.strictEqual(started.ready, '1', 'the page should be shown once its first layout is ready');
  assert.deepStrictEqual(started.entrance, ['run', 'run'], 'the entrance should run on the page and its shared search entry');
  assert.deepStrictEqual(afterKey, ['done', 'done'], 'a key press should end the entrance at once');
  moving.close();

  const still = await openPage({ sync: { [MOTION_KEY]: false } });
  await still.waitFor(() => still.document.body.getAttribute('data-nt-ready') === '1', 'the page should be shown');
  assert.strictEqual(still.document.body.getAttribute('data-nt-enter'), 'done', 'with motion off there is no entrance');
  still.close();
}

function testSearchSurfaceUsesTheSharedEntry() {
  const document = new JSDOM(readPageSource('newtab.html')).window.document;
  assert.ok(document.getElementById(SEARCH_ROOT_ID).classList.contains('x-lumno-search-entry'),
    'the new-tab search surface should opt into the shared entry motion');
}

// Bookmark rows step 0–8 and columns 4–8; other values fall back.
async function testBookmarkGridSettings() {
  assert.strictEqual(settings.bookmarkColumns.parse(undefined), 6);
  assert.deepStrictEqual([3, 4, 8, 9, 5.5].map(settings.bookmarkColumns.parse), [6, 4, 8, 6, 6]);
  assert.deepStrictEqual([0, 4, 32, 36, 6].map(settings.bookmarkCount.parse), [0, 4, 32, 8, 8]);

  const onboarding = parsePageCss('src/onboarding/onboarding.html');
  assert.ok(onboarding.entries.some((entry) => entry.style.getPropertyValue('--x-nt-bookmark-columns') === '6'),
    'onboarding should preview the six-column grid');
  assert.ok(parsePageCss('newtab.html').entries.some((entry) => /var\(--x-nt-bookmark-columns,\s*6\)/.test(entry.style.cssText)),
    'New Tab should fall back to six columns before its script runs');

  const options = await createOptionsPage({});
  await options.settle(300);
  const doc = options.document;
  ['rows', 'columns'].forEach((kind) => {
    const row = doc.getElementById(`_x_extension_bookmark_${kind}_setting_row_2026_unique_`);
    assert.ok(row, `Settings should have a bookmark ${kind} row`);
    const parts = [row.querySelector('._x_extension_info_button_2026_unique_'), doc.getElementById(`_x_extension_bookmark_${kind}_control_2026_unique_`)];
    assert.ok(parts.every((part) => part && row.contains(part)), `the ${kind} row should hold its info and control`);
  });
  assert.strictEqual(doc.getElementById('_x_extension_bookmark_count_select_2024_unique_'), null, 'the old count select is gone');
  const slider = (id) => options.document.getElementById(id);
  const range = (input) => input && [input.min, input.max, input.step];
  assert.deepStrictEqual(range(slider('_x_extension_bookmark_rows_slider_2026_unique_')), ['0', '8', '1']);
  assert.deepStrictEqual(range(slider('_x_extension_bookmark_columns_slider_2026_unique_')), ['4', '8', '1']);
  options.close();
}

(async () => {
  await testGridColumnsFollowTheViewport();
  await testWideModeWidensRecentSites();
  await testEntranceSequence();
  testSearchSurfaceUsesTheSharedEntry();
  await testBookmarkGridSettings();
  console.log('newtab page layout tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
