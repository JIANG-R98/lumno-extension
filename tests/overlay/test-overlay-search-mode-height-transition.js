const assert = require('assert');
const { createOverlayPage, bundledSiteSearchProviders } = require('../helpers/overlay-runtime-harness');

// How the real overlay replaces its results while the user types or changes
// scope: which rows show before the remote suggestions arrive, that rows stay
// up until their replacement renders, and that late answers for an earlier
// query or scope are dropped.

const PRIORITY_KEY = '_x_extension_search_result_priority_2026_unique_';
const LOCAL = { type: 'history', title: 'Local cats page', url: 'https://pets.example.test/cats' };
const REMOTE = { type: 'googleSuggest', title: 'cats remote', url: '' };

function rowTypes(page) {
  return page.suggestions().map((row) => (row._xSuggestion || {}).type);
}

// Records every row list the overlay showed, so a test can tell whether rows
// were cleared before their replacement arrived.
function watchRows(page, root) {
  const seen = [];
  const observer = new page.window.MutationObserver(() => seen.push(rowTypes(page)));
  observer.observe(root, { childList: true, subtree: true });
  return seen;
}

function createMixPage(priority) {
  const remote = [];
  return createOverlayPage({
    stylesheetsLoad: true,
    settings: { [PRIORITY_KEY]: priority },
    respond(message) {
      if (message.action === 'getSearchSuggestions') return { suggestions: [LOCAL] };
      if (message.action === 'getSearchEngineSuggestions') {
        return new Promise((resolve) => remote.push(() => resolve({
          suggestions: (message.localSuggestions || []).concat([REMOTE]),
          hasRemoteSuggestions: true
        })));
      }
      if (message.action === 'getTabsForOverlay') {
        return new Promise((resolve) => remote.push(() => resolve({ tabs: [{ id: 5, title: 'Late tab', url: 'https://late.example.test/' }] })));
      }
      return undefined;
    }
  }).then((page) => Object.assign(page, { answerRemote: () => remote.splice(0).forEach((answer) => answer()) }));
}

async function testSearchFirstShowsTheExactSearchUntilTheFinalMix() {
  const page = await createMixPage('search');
  const root = await page.open();
  const seen = watchRows(page, root);
  await page.type('cats');
  await page.settle(150);
  assert.deepStrictEqual(rowTypes(page), ['newtab'], 'search-first should show only the exact search action before the remote mix');
  page.answerRemote();
  await page.waitFor(() => rowTypes(page).includes('googleSuggest'), 'the final mix should render');
  assert.deepStrictEqual(rowTypes(page), ['newtab', 'googleSuggest', 'history']);
  assert.ok(!seen.some((types) => types.length === 0), 'rows should never be cleared while typing');
  page.close();
}

async function testAutocompleteFirstDoesNotReshuffleAfterSettling() {
  const page = await createMixPage('autocomplete');
  const root = await page.open();
  await page.type('cats');
  await page.settle(150);
  assert.deepStrictEqual(rowTypes(page), ['history', 'newtab'], 'local results should show without waiting for the network');
  page.answerRemote();
  await page.settle(150);
  assert.deepStrictEqual(rowTypes(page), ['history', 'newtab'], 'a late remote answer should not reshuffle rows the user is reading');
  assert.ok(root);
  page.close();
}

async function testDirectUrlPreviewShowsAtOnce() {
  // Only the first query is answered: the address must not wait for results.
  const page = await createOverlayPage({
    respond(message) {
      if (message.action === 'getSearchSuggestions') {
        return message.query === 'cats' ? { suggestions: [LOCAL] } : new Promise(() => {});
      }
      return undefined;
    }
  });
  await page.open();
  await page.type('cats');
  await page.waitFor(() => rowTypes(page).includes('history'), 'results should show');
  await page.type('example.com');
  assert.strictEqual(rowTypes(page)[0], 'directUrl', 'with results showing, a typed address should be offered without waiting for results');
  page.close();
}

async function testScopeChangesKeepRowsAndDropLateAnswers() {
  const page = await createMixPage('autocomplete');
  const root = await page.open({ siteSearchProviders: bundledSiteSearchProviders() });
  await page.type('cats');
  await page.settle(150);
  const seen = watchRows(page, root);
  root.querySelector('[data-search-scope-action="true"]').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await page.waitFor(() => root.querySelector('[data-mode-id="provider:yt"]'), 'the scope menu should open');
  assert.ok(rowTypes(page).length > 0, 'opening the scope menu should keep the results');
  root.querySelector('[data-mode-id="provider:yt"]').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await page.settle(200);
  assert.strictEqual(page.input().value, 'cats', 'the query should carry over to the chosen scope');
  assert.ok(!seen.some((types) => types.length === 0), 'rows should stay up until the chosen scope renders its own');
  page.close();

  const tabs = await createMixPage('autocomplete');
  const tabsRoot = await tabs.open({ siteSearchProviders: bundledSiteSearchProviders() });
  await tabs.type('/tabs');
  tabs.press('Enter');
  await tabs.settle(80);
  // Backspace on the empty input removes the open-tab tag (a second press confirms).
  tabs.press('Backspace');
  await tabs.settle(60);
  tabs.press('Backspace');
  await tabs.settle(60);
  tabs.answerRemote();
  await tabs.settle(150);
  assert.ok(!tabsRoot.textContent.includes('Late tab'),
    'an open-tab answer that arrives after leaving open-tab mode should not replace the results');
  tabs.close();
}

(async () => {
  await testSearchFirstShowsTheExactSearchUntilTheFinalMix();
  await testAutocompleteFirstDoesNotReshuffleAfterSettling();
  await testDirectUrlPreviewShowsAtOnce();
  await testScopeChangesKeepRowsAndDropLateAnswers();
  console.log('overlay instant result height tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
