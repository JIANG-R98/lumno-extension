const assert = require('assert');
const settings = require('../../src/domain/settings/index.ts');
const { createNewtabPage, INPUT_ID } = require('../helpers/newtab-page');
const { createOptionsPage } = require('../helpers/options-page');

// Whether New Tab puts the cursor in its search box when it opens. Off by
// default, so the browser's address bar keeps focus.

const KEY = settings.newtabInputAutoFocusEnabled.key;

async function testSettingsMarkup() {
  const page = await createOptionsPage();
  const doc = page.document;
  const topContent = doc.getElementById('_x_extension_newtab_top_content_tabs_wrap_2026_unique_');
  const autoFocus = doc.getElementById('_x_extension_newtab_input_auto_focus_toggle_2026_unique_');
  assert.ok(topContent && autoFocus && (topContent.compareDocumentPosition(autoFocus) & 4),
    'input auto-focus should sit below the New Tab top-content setting');
  const toggle = doc.getElementById('_x_extension_newtab_input_auto_focus_toggle_2026_unique_');
  assert.deepStrictEqual([toggle.type, toggle.checked, toggle.getAttribute('data-i18n-aria-label')], ['checkbox', false, 'newtab_input_auto_focus_title'],
    'the switch should be labelled and start off');
  assert.ok(doc.getElementById('_x_extension_newtab_shortcuts_toggle_2026_unique_'),
    'Settings should keep a second entry for the shared New Tab shortcuts switch');
  assert.strictEqual(KEY, '_x_extension_newtab_input_auto_focus_enabled_2026_unique_');
  assert.ok(settings.BROWSER_SYNC_KEYS.includes(KEY), 'the preference should sync');
  page.close();
}

// Chrome keeps the address bar focused on a fresh New Tab, so with auto-focus
// on the page reloads itself at ?focus=1, which may take focus.
async function testNewTabFollowsTheSetting() {
  // The tab is in the foreground (JSDOM reports no focus by default).
  const foreground = (window) => {
    window.document.hasFocus = () => true;
  };
  const off = await createNewtabPage({ sync: { [KEY]: false }, setup: foreground });
  await off.settle(250);
  assert.notStrictEqual(off.document.activeElement && off.document.activeElement.id, INPUT_ID, 'with auto-focus off, the search box should not take focus');
  assert.strictEqual(off.document.documentElement.getAttribute('data-nt-focus-route-pending'), null, 'and the page should show itself in place');
  off.close();

  const on = await createNewtabPage({ sync: { [KEY]: true } });
  await on.settle(250);
  assert.strictEqual(on.document.documentElement.getAttribute('data-nt-focus-route-pending'), 'true',
    'with auto-focus on, the page should stay hidden while it moves to its focus route');
  assert.ok(on.errors.some((message) => /navigation/i.test(message)), 'it should navigate to the focus route');
  on.close();

  const focusRoute = await createNewtabPage({
    sync: { [KEY]: true },
    search: '?focus=1',
    setup: foreground
  });
  await focusRoute.settle(250);
  assert.strictEqual(focusRoute.document.activeElement && focusRoute.document.activeElement.id, INPUT_ID,
    'on the focus route, the search box should take focus');
  focusRoute.close();
}

// The search shortcut opens ?focus=1 even with auto-focus off. That load
// focuses the box once, drops the hint from the address without navigating,
// and later window focus does not pull the cursor back.
async function testTheFocusHintIsUsedOnce() {
  const foreground = (window) => {
    window.document.hasFocus = () => true;
  };
  const refocus = async (page) => {
    page.document.getElementById(INPUT_ID).blur();
    page.window.dispatchEvent(new page.window.Event('focus'));
    page.document.dispatchEvent(new page.window.Event('visibilitychange'));
    await page.settle(80);
    return page.document.activeElement && page.document.activeElement.id === INPUT_ID;
  };

  // JSDOM cannot rewrite a chrome-extension: address, so record it.
  const addresses = [];
  const off = await createNewtabPage({
    search: '?focus=1&q=x',
    setup(window) {
      foreground(window);
      window.history.replaceState = (_state, _title, url) => addresses.push(String(url));
    }
  });
  await off.settle(250);
  assert.strictEqual(off.document.activeElement && off.document.activeElement.id, INPUT_ID,
    'the focus hint should focus the search box even with auto-focus off');
  assert.deepStrictEqual(addresses.map((url) => new URL(url).search), ['?q=x'],
    'the used hint should leave the address once, keeping the rest of the query');
  assert.ok(!off.errors.some((message) => /navigation/i.test(message)), 'without a second navigation');
  assert.strictEqual(await refocus(off), false, 'returning to the tab should not force focus back with auto-focus off');
  assert.ok(!off.storage.sync.writes.some((write) => Object.hasOwn(write, KEY)),
    'loading a missing auto-focus preference should not save the default over existing users');
  off.close();

  const on = await createNewtabPage({ sync: { [KEY]: true }, search: '?focus=1', setup: foreground });
  await on.settle(250);
  assert.strictEqual(await refocus(on), true, 'with auto-focus on, returning to the tab focuses the search box again');
  on.close();
}

(async () => {
  await testSettingsMarkup();
  await testNewTabFollowsTheSetting();
  await testTheFocusHintIsUsedOnce();
  console.log('newtab input auto-focus setting tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
