const assert = require('assert');
const { parsePageCss } = require('../helpers/css-rules');
const { createNewtabPage } = require('../helpers/newtab-page');

// The bookmarks bar pager on New Tab: previous / next / bookmark manager
// buttons with the page's own tooltips (no native title), unavailable pages
// marked with aria-disabled so the buttons stay hoverable, and the display
// mode menu after them. The recent sites heading is its mode switch.

const BAR = Array.from({ length: 30 }, (_, index) => ({ id: String(100 + index), title: `Bookmark ${index}`, url: `https://b${index}.test/` }));

async function testPager() {
  const page = await createNewtabPage({ bookmarks: BAR });
  await page.settle(400);
  const pager = page.document.querySelector('.x-nt-bookmarks-pager');
  const [prev, next, manager, modeMenu] = Array.from(pager.children);
  assert.deepStrictEqual([prev, next, manager].map((button) => button.getAttribute('data-tooltip')),
    ['Previous page', 'Next page', 'Open bookmark manager'], 'each pager button should explain itself');
  [prev, next, manager].forEach((button) => {
    assert.strictEqual(button.hasAttribute('title'), false, 'without a native title that would show a second tooltip');
    assert.strictEqual(button.disabled, false, 'and stay hoverable rather than disabled');
  });
  assert.ok(modeMenu.classList.contains('_x_extension_select_wrap_2024_unique_'), 'the display mode menu should follow the manager button');
  assert.deepStrictEqual([prev.getAttribute('aria-disabled'), next.getAttribute('aria-disabled')], ['true', 'false'],
    'on the first page only Next is available');

  next.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await page.settle(200);
  assert.strictEqual(prev.getAttribute('aria-disabled'), 'false', 'after paging on, Previous becomes available');

  manager.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await page.settle(60);
  assert.ok(page.messages.some((message) => message.action === 'openBookmarkManager'), 'the manager button should open the bookmark manager');

  const heading = page.document.querySelector('.x-nt-recent-heading');
  assert.strictEqual(heading.hidden, true, 'the recent sites heading should give way to its mode switch');
  assert.ok(page.document.querySelector('.x-nt-recent-header-bar .x-nt-recent-mode-switch'));
  page.close();
}

function testStyles() {
  const css = parsePageCss('newtab.html');
  const selectors = css.selectors();
  assert.ok(selectors.includes('.x-nt-bookmarks-pager-btn:hover:not([aria-disabled="true"])'), 'hover styling should skip unavailable buttons');
  assert.ok(selectors.includes('.x-nt-bookmarks-pager-btn[aria-disabled="true"]'), 'unavailable buttons should look unavailable');
  assert.strictEqual(css.rule('.x-nt-bookmarks-topbar .x-nt-section-mode-select ._x_extension_select_trigger_2024_unique_ ._x_extension_select_icon_2024_unique_').get('color'), 'inherit',
    'the topbar menu icon should take the manager button colour in every state');
  assert.strictEqual(css.rule('body[data-wallpaper-active="true"] .x-nt-section-mode-select ._x_extension_select_trigger_2024_unique_ ._x_extension_select_icon_2024_unique_').get('color'), 'inherit',
    'over a wallpaper, mode menu icons should keep the sampled foreground colour');
  assert.strictEqual(css.rule('.x-nt-recent-mode-switch[data-expanded="false"] .x-nt-recent-mode-switch-option[aria-checked="false"]').get('width'), '0',
    'the collapsed recent mode switch should show only the current mode');
  const headerSwitch = css.rule('.x-nt-recent-header-bar .x-nt-recent-mode-switch');
  assert.notStrictEqual(headerSwitch && headerSwitch.get('margin-left'), 'auto', 'the recent mode switch should stay at the start of its row');
}

(async () => {
  await testPager();
  testStyles();
  console.log('newtab bookmark pager tooltip tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
