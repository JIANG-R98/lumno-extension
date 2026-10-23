const assert = require('assert');
const { createNewtabPage } = require('../helpers/newtab-page');

// Removing a New Tab shortcut can be undone (⌘Z) and redone (⇧⌘Z), in the
// same history as bookmark moves (see test-newtab-bookmark-move-matrix.js).

const SHORTCUTS = [
  { url: 'https://one.example/', title: 'One' },
  { type: 'folder', folderId: '42', title: 'Folder' },
  { url: 'https://two.example/', title: 'Two' }
];
const BOOKMARKS = [{ id: '42', title: 'Folder', children: [{ id: '43', title: 'X', url: 'https://x.example/' }] }];

async function openNewtab() {
  const page = await createNewtabPage({ shortcuts: SHORTCUTS, bookmarks: BOOKMARKS });
  await page.settle(400);
  const tiles = () => Array.from(page.document.querySelectorAll('.x-nt-shortcut-tile:not(.x-nt-shortcut-tile--add)'));
  const toast = () => page.document.getElementById('_x_extension_toast_2024_unique_').textContent;
  return {
    page,
    toast,
    titles: () => tiles().map((tile) => tile.getAttribute('aria-label').replace(/^Open /, '')),
    async remove(title) {
      const tile = tiles().find((item) => item.getAttribute('aria-label') === `Open ${title}`);
      tile.dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20, button: 2 }));
      await page.settle(150);
      const option = page.document.querySelector('#_x_extension_newtab_shortcut_context_menu_2026_unique__menu [role="menuitem"][data-value="remove"]');
      option.dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      option.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      await page.settle(200);
    },
    async undo() {
      page.trusted(page.document.body, 'keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true });
      await page.settle(200);
    },
    async redo() {
      page.trusted(page.document.body, 'keydown', { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true, bubbles: true, cancelable: true });
      await page.settle(200);
    },
    // Makes saving fail in both storage areas (sync falls back to local), or
    // work again.
    failWrites(fail) {
      [page.storage.sync, page.storage.local].forEach((area) => {
        if (fail) {
          area.__set = area.__set || area.set;
          area.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
        } else if (area.__set) {
          area.set = area.__set;
        }
      });
    }
  };
}

async function testUndoAndRedo() {
  const newtab = await openNewtab();
  await newtab.remove('One');
  assert.deepStrictEqual(newtab.titles(), ['Folder', 'Two']);
  assert.match(newtab.toast(), /⌘Z/, 'the removal Toast should say how to undo');
  await newtab.undo();
  assert.deepStrictEqual(newtab.titles(), ['One', 'Folder', 'Two'], 'undo should put the shortcut back where it was');
  assert.match(newtab.toast(), /⇧⌘Z/, 'the restore Toast should say how to redo');
  await newtab.redo();
  assert.deepStrictEqual(newtab.titles(), ['Folder', 'Two']);
  await newtab.undo();
  assert.deepStrictEqual(newtab.titles(), ['One', 'Folder', 'Two']);

  await newtab.remove('Folder');
  await newtab.undo();
  assert.deepStrictEqual(newtab.titles(), ['One', 'Folder', 'Two']);
  const bookmarkChanges = newtab.page.bookmarks.calls.filter((call) => ['create', 'move', 'update', 'remove'].includes(call.name));
  assert.deepStrictEqual(bookmarkChanges, [], 'removing and restoring a folder shortcut must not touch its bookmarks');

  await newtab.remove('One');
  await newtab.remove('Two');
  await newtab.undo();
  assert.deepStrictEqual(newtab.titles(), ['Folder', 'Two'], 'undo should go back one removal at a time');
  await newtab.undo();
  assert.deepStrictEqual(newtab.titles(), ['One', 'Folder', 'Two']);
  await newtab.remove('Folder');
  await newtab.redo();
  assert.deepStrictEqual(newtab.titles(), ['One', 'Two'], 'a new removal should clear what could be redone');
  newtab.page.close();
}

async function testFailedSaves() {
  const newtab = await openNewtab();
  newtab.failWrites(true);
  await newtab.remove('One');
  assert.deepStrictEqual(newtab.titles(), ['One', 'Folder', 'Two'], 'a removal that cannot be saved should not happen');
  await newtab.undo();
  assert.deepStrictEqual(newtab.titles(), ['One', 'Folder', 'Two'], 'and should leave nothing to undo');

  newtab.failWrites(false);
  await newtab.remove('One');
  newtab.failWrites(true);
  await newtab.undo();
  assert.deepStrictEqual(newtab.titles(), ['Folder', 'Two'], 'an undo that cannot be saved should not happen');
  newtab.failWrites(false);
  await newtab.undo();
  assert.deepStrictEqual(newtab.titles(), ['One', 'Folder', 'Two'], 'but stay available to try again');
  newtab.page.close();
}

(async () => {
  await testUndoAndRedo();
  await testFailedSaves();
  console.log('Shortcut deletion undo/redo, original order, folders, failures and history order passed.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
