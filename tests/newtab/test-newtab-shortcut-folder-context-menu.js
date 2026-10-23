const assert = require('assert');
const { createNewtabPage } = require('../helpers/newtab-page');

// A folder shortcut's icon opens while its context menu is open, and closes
// again however the menu is dismissed. The icon animation itself is covered
// by react-src/newtab/shortcuts.test.tsx.

const MENU = '#_x_extension_newtab_shortcut_context_menu_2026_unique__menu';

async function run() {
  const page = await createNewtabPage({
    shortcuts: [
      { type: 'folder', folderId: '10', title: 'Docs' },
      { type: 'folder', folderId: '20', title: 'Tools' },
      { url: 'https://site.example/', title: 'Site' }
    ],
    bookmarks: [
      { id: '10', title: 'Docs', children: [{ id: '11', title: 'A', url: 'https://a.example/' }] },
      { id: '20', title: 'Tools', children: [{ id: '21', title: 'B', url: 'https://b.example/' }] }
    ]
  });
  await page.settle(400);
  const tile = (title) => page.document.querySelector(`.x-nt-shortcut-tile[aria-label="Open ${title}"]`);
  const state = (title) => [tile(title).hasAttribute('data-shortcut-context-menu-open'), tile(title).hasAttribute('data-shortcut-folder-open')];
  const openMenu = async (title) => {
    tile(title).dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20, button: 2 }));
    await page.settle(120);
  };
  const menu = () => page.document.querySelector(MENU);

  await openMenu('Docs');
  assert.deepStrictEqual(state('Docs'), [true, true], 'a folder under its context menu should open its icon');
  assert.deepStrictEqual(state('Tools'), [false, false], 'other folders should stay as they are');

  await openMenu('Tools');
  assert.deepStrictEqual(state('Docs'), [false, false], 'moving the menu to another folder should release the first');
  assert.deepStrictEqual(state('Tools'), [true, true]);

  await openMenu('Site');
  assert.deepStrictEqual(state('Tools'), [false, false]);
  assert.deepStrictEqual(state('Site'), [true, false], 'a website shortcut has no folder icon to open');

  const dismissals = [
    ['a click outside', () => page.trusted(page.document.body, 'pointerdown', { bubbles: true, clientX: 600, clientY: 600 })],
    ['Escape', () => page.trusted(page.document.body, 'keydown', { key: 'Escape', bubbles: true, cancelable: true })],
    ['focus moving away', () => page.trusted(page.input(), 'focusin', { bubbles: true })]
  ];
  for (const [how, dismiss] of dismissals) {
    await openMenu('Docs');
    page.trusted(menu().querySelector('[role="menuitem"]'), 'pointerdown', { bubbles: true });
    page.trusted(menu().querySelector('[role="menuitem"]'), 'focusin', { bubbles: true });
    await page.settle(40);
    assert.deepStrictEqual(state('Docs'), [true, true], `using the menu should keep the folder open (before ${how})`);
    dismiss();
    await page.settle(120);
    assert.deepStrictEqual(state('Docs'), [false, false], `${how} should close the menu and its folder icon`);
  }
  page.close();
}

run().then(() => {
  console.log('shortcut folder context menu tests passed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
