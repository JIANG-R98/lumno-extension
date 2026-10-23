const assert = require('assert');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

// The injected overlay's side of opening fast and surviving page loads:
// what it reads and asks for on first open, how it restores a draft carried
// over from the previous Document, and how it keeps the open-tab list.

const OPEN_FLAG = '_x_extension_search_overlay_open_2026_unique_';
const OPEN_TABS_VISIBLE_KEY = '_x_extension_overlay_open_tabs_default_visible_2026_unique_';
const FIRST_OPEN_KEYS = [
  '_x_extension_language_2024_unique_',
  '_x_extension_theme_mode_2024_unique_',
  '_x_extension_overlay_size_mode_2026_unique_',
  '_x_extension_overlay_enter_animation_2026_unique_',
  '_x_extension_motion_effects_enabled_2026_unique_',
  OPEN_TABS_VISIBLE_KEY
];

const TABS = [
  { id: 1, title: 'Alpha docs', url: 'https://alpha.example.test/', favIconUrl: '' },
  { id: 2, title: 'Beta mail', url: 'https://beta.example.test/', favIconUrl: '' },
  { id: 3, title: 'Gamma notes', url: 'https://gamma.example.test/', favIconUrl: '' }
];

function tabRequests(page) {
  return page.messages.filter((message) => message.action === 'getTabsForOverlay');
}

async function testFirstOpenReadsPreferencesOnceAndAsksForTabsOnce() {
  const page = await createOverlayPage({
    settings: { [OPEN_TABS_VISIBLE_KEY]: true },
    respond(message) {
      return message.action === 'getTabsForOverlay' ? { tabs: TABS } : undefined;
    }
  });
  const readsBefore = page.storageReads.length;
  const root = await page.open();
  await page.settle(80);
  const firstOpenRead = page.storageReads.slice(readsBefore).find((keys) => keys.includes(FIRST_OPEN_KEYS[0]));
  assert.ok(firstOpenRead, 'the first open should read its preferences');
  FIRST_OPEN_KEYS.forEach((key) => {
    assert.ok(firstOpenRead.includes(key), `${key} should be read in the same storage read as the others`);
  });
  await page.waitFor(() => root.textContent.includes('Alpha docs'), 'the open tabs should render');
  assert.strictEqual(tabRequests(page).length, 1, 'the first open should ask for the open tabs once');
  assert.strictEqual(page.window[OPEN_FLAG], true);

  page.toggle({ ensureOpen: true });
  await page.settle();
  assert.ok(page.host(), 'reopening with ensureOpen should keep the overlay open, not toggle it closed');
  assert.strictEqual(page.window[OPEN_FLAG], true);

  page.press('Escape');
  await page.waitFor(() => page.host() === null, 'Escape should close the overlay after its exit animation');
  assert.strictEqual(page.window[OPEN_FLAG], false, 'closing should clear the open flag the worker reads back');
  assert.ok(page.messages.some((message) => message.action === 'notifyOverlayClosed'),
    'a deliberate close should tell the worker, so a page load does not bring the overlay back');
  page.close();
}

async function testInputShowsBeforeTabsAnswer() {
  const page = await createOverlayPage({
    settings: { [OPEN_TABS_VISIBLE_KEY]: true },
    respond(message) {
      return message.action === 'getTabsForOverlay' ? new Promise(() => {}) : undefined;
    }
  });
  await page.open();
  assert.strictEqual(page.root().activeElement, page.input(), 'the input should be ready while the tab list is still on its way');
  page.close();
}

async function testCallerSnapshotIsNotShownBeforeFreshTabs() {
  let answerTabs;
  const page = await createOverlayPage({
    settings: { [OPEN_TABS_VISIBLE_KEY]: true },
    respond(message) {
      if (message.action === 'getTabsForOverlay') {
        return new Promise((resolve) => {
          answerTabs = () => resolve({ tabs: TABS });
        });
      }
      return undefined;
    }
  });
  page.window._x_extension_toggleSearchOverlay_2026_unique_([{ id: 9, title: 'Stale snapshot tab', url: 'https://stale.example.test/' }], {
    currentTabId: 1,
    currentTabUrl: page.window.location.href
  });
  await page.waitFor(() => page.root() && page.root().activeElement === page.input(), 'the overlay should open');
  await page.settle(40);
  assert.ok(!page.root().textContent.includes('Stale snapshot tab'), 'a snapshot from the caller should not flash before the fresh list');
  answerTabs();
  await page.waitFor(() => page.root().textContent.includes('Alpha docs'), 'the fresh tab list should render');
  page.close();
}

async function testRestoredDraftAndItsUpdates() {
  const page = await createOverlayPage();
  const root = await page.open({
    loadingSessionTracked: true,
    loadingSession: { inputValue: 'draft text', selectionStart: 2, selectionEnd: 5, selectionDirection: 'backward', focused: true, revision: 3 }
  });
  const input = page.input();
  assert.strictEqual(input.value, 'draft text', 'the draft typed before the page load should be back');
  assert.deepStrictEqual([input.selectionStart, input.selectionEnd, input.selectionDirection], [2, 5, 'backward'],
    'the selection should be restored exactly');
  assert.ok(root);

  const before = page.messages.length;
  input.value = 'draft text more';
  input.setSelectionRange(15, 15);
  input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  await page.settle(80);
  const update = page.messages.slice(before).find((message) => message.action === 'updateOverlayLoadingSession');
  assert.ok(update, 'typing while the page loads should save the draft with the worker');
  assert.deepStrictEqual(
    { inputValue: update.session.inputValue, selectionStart: update.session.selectionStart, selectionEnd: update.session.selectionEnd, focused: update.session.focused },
    { inputValue: 'draft text more', selectionStart: 15, selectionEnd: 15, focused: true }
  );
  page.close();

  const untracked = await createOverlayPage();
  await untracked.open();
  await untracked.type('hello');
  assert.ok(!untracked.messages.some((message) => message.action === 'updateOverlayLoadingSession'),
    'an overlay on a loaded page should not report its draft');
  untracked.close();
}

async function testOpenTabModeFiltersTheCachedList() {
  const answers = [];
  const page = await createOverlayPage({
    respond(message) {
      if (message.action === 'getTabsForOverlay') {
        return new Promise((resolve) => answers.push(resolve));
      }
      return undefined;
    }
  });
  const root = await page.open();
  await page.type('/tabs');
  page.press('Enter');
  await page.settle(30);
  assert.strictEqual(tabRequests(page).length, 1, 'entering open-tab mode should ask for the tabs once');
  answers.shift()({ tabs: TABS });
  await page.waitFor(() => root.textContent.includes('Gamma notes'), 'the open tabs should render');

  await page.type('al');
  await page.type('alp');
  await page.type('alph');
  assert.strictEqual(tabRequests(page).length, 1, 'typing in open-tab mode should filter the list it has, not ask again');
  await page.waitFor(() => root.textContent.includes('Alpha docs') && !root.textContent.includes('Gamma notes'),
    'the list should narrow to the matching tab');
  page.close();
}

(async () => {
  await testFirstOpenReadsPreferencesOnceAndAsksForTabsOnce();
  await testInputShowsBeforeTabsAnswer();
  await testCallerSnapshotIsNotShownBeforeFreshTabs();
  await testRestoredDraftAndItsUpdates();
  await testOpenTabModeFiltersTheCachedList();
  console.log('overlay open session tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
