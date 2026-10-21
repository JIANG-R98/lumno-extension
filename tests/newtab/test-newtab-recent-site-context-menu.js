const assert = require('assert');
const fs = require('fs');
const path = require('path');
const settings = require('../../src/shared/settings.js');
const { parsePageCss } = require('../helpers/css-rules');
const { createNewtabPage } = require('../helpers/newtab-page');

// Right-clicking a recent site on New Tab opens the shared context menu: open
// in a new tab, add to shortcuts, and (set apart) remove. Nothing changes
// until an item is chosen.

const repoRoot = path.resolve(__dirname, '..', '..');
const MENU = '#_x_extension_newtab_recent_context_menu_2026_unique__menu';
const NOW = Date.now();
const HISTORY = Array.from({ length: 4 }, (_, index) => ({
  id: String(index), title: `Site ${index}`, url: `https://site${index}.test/`, lastVisitTime: NOW - index * 1000, visitCount: 5
}));

async function openNewtab() {
  const page = await createNewtabPage({
    sync: { [settings.RECENT_COUNT_STORAGE_KEY]: 8, [settings.RECENT_MODE_STORAGE_KEY]: 'latest' },
    history: HISTORY
  });
  await page.settle(400);
  return page;
}

function cards(page) {
  return Array.from(page.document.querySelectorAll('#_x_extension_newtab_recent_sites_2024_unique_ .x-nt-recent-card'));
}

async function openMenu(page, card) {
  card.dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 2 }));
  await page.settle(80);
  return page.document.querySelector(MENU);
}

async function choose(page, value) {
  const option = page.document.querySelector(`${MENU} [role="menuitem"][data-value="${value}"]`);
  option.dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  option.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await page.settle(120);
}

function optionStates(menu) {
  return Array.from(menu.querySelectorAll('[role="menuitem"]')).map((option) => [option.getAttribute('data-value'), option.getAttribute('aria-disabled') === 'true']);
}

async function testMenu() {
  const page = await openNewtab();
  const [first] = cards(page);
  assert.strictEqual(first.getAttribute('aria-label'), 'Open Site 0');
  const menu = await openMenu(page, first);
  assert.strictEqual(menu && menu.getAttribute('data-open'), 'true', 'right-clicking a recent site should open its menu');
  assert.deepStrictEqual(optionStates(menu).map(([value]) => value), ['open-in-new-tab', 'add-shortcut', 'track-progress', 'remove'],
    'the menu should end with Remove');
  assert.strictEqual(first.getAttribute('data-recent-context-menu-open'), 'true', 'the card should stay marked while its menu is open');
  assert.strictEqual(cards(page).length, 4, 'opening the menu should not change anything');
  const hiddenWrites = () => page.storage.sync.writes.concat(page.storage.local.writes)
    .filter((write) => Object.hasOwn(write, settings.HIDDEN_RECENT_SITES_STORAGE_KEY));
  assert.strictEqual(hiddenWrites().length, 0);

  await choose(page, 'open-in-new-tab');
  const opened = page.created.concat(page.messages.filter((message) => message.action === 'createTab'));
  assert.ok(opened.some((item) => item.url === 'https://site0.test/'), 'Open in new tab should open the site');

  await openMenu(page, cards(page)[1]);
  await choose(page, 'remove');
  assert.deepStrictEqual(cards(page).map((card) => card.getAttribute('aria-label')), ['Open Site 0', 'Open Site 2', 'Open Site 3'],
    'Remove should take the site off the list');
  assert.strictEqual(hiddenWrites().length, 1, 'and remember it as hidden');
  page.close();
}

async function testAddToShortcuts() {
  const page = await openNewtab();
  await openMenu(page, cards(page)[0]);
  await choose(page, 'add-shortcut');
  assert.ok(page.storage.sync.writes.concat(page.storage.local.writes).some((write) => JSON.stringify(write).includes('site0.test')),
    'Add to shortcuts should save the site to the shortcuts');
  const menu = await openMenu(page, cards(page)[0]);
  assert.deepStrictEqual(optionStates(menu).find(([value]) => value === 'add-shortcut'), ['add-shortcut', true],
    'a site already in the shortcuts should not be offered again');
  page.close();
}

function testStylesAndCopy() {
  const css = parsePageCss('newtab.html');
  assert.ok(css.selectors().some((selector) => selector.includes('[data-recent-context-menu-open="true"]')),
    'the card under an open menu should stay visibly active');
  assert.ok(!css.selectors().some((selector) => selector.includes('.x-nt-recent-dismiss')), 'the old dismiss button should be gone');
  ['en', 'zh_CN', 'zh_TW', 'ja'].forEach((locale) => {
    const messages = JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales', locale, 'messages.json'), 'utf8'));
    ['newtab_open_in_new_tab', 'recent_context_menu_label', 'recent_add_to_shortcuts', 'newtab_shortcuts_already_added'].forEach((key) => {
      assert.ok(messages[key] && String(messages[key].message || '').trim(), `${locale} should localize ${key}`);
    });
  });
}

(async () => {
  await testMenu();
  await testAddToShortcuts();
  testStylesAndCopy();
  console.log('New Tab recent-site context-menu tests passed.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
