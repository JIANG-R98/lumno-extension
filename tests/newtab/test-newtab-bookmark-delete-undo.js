const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parsePageCss } = require('../helpers/css-rules');
const { createNewtabPage } = require('../helpers/newtab-page');

// Deleting bookmarks from New Tab's bookmark menus, with undo (⌘Z) and redo
// (⇧⌘Z), and opening a folder as a tab group. The history records are
// unit-tested first; the rest runs on the page.

const repoRoot = path.resolve(__dirname, '..', '..');
const {
  cloneBookmarkSnapshot,
  createBookmarkMoveHistory,
  createDeleteRecord
} = require(path.join(repoRoot, 'src', 'newtab', 'bookmarks', 'bookmark-move-history.js'));

const sourceTree = {
  id: 'folder-a',
  parentId: '1',
  index: 3,
  title: 'Folder A',
  children: [
    {
      id: 'link-a',
      title: 'Link A',
      url: 'https://example.com/a'
    },
    {
      id: 'folder-b',
      title: 'Folder B',
      children: [
        {
          id: 'link-b',
          title: 'Link B',
          url: 'https://example.com/b'
        }
      ]
    }
  ]
};
const snapshot = cloneBookmarkSnapshot(sourceTree);
assert.deepStrictEqual(snapshot, {
  title: 'Folder A',
  url: '',
  children: [
    {
      title: 'Link A',
      url: 'https://example.com/a',
      children: []
    },
    {
      title: 'Folder B',
      url: '',
      children: [
        {
          title: 'Link B',
          url: 'https://example.com/b',
          children: []
        }
      ]
    }
  ]
});
assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.children));

const deleteRecord = createDeleteRecord({
  bookmarkId: sourceTree.id,
  title: sourceTree.title,
  parentId: sourceTree.parentId,
  index: sourceTree.index,
  snapshot: sourceTree
});
assert.strictEqual(deleteRecord.kind, 'delete');
assert.strictEqual(deleteRecord.parentId, '1');
assert.strictEqual(deleteRecord.index, 3);
assert.strictEqual(deleteRecord.runtime.currentBookmarkId, '');

const history = createBookmarkMoveHistory({ maxEntries: 4 });
assert.strictEqual(history.push(deleteRecord), true);
const storedRecord = history.peekUndo();
assert.strictEqual(storedRecord.kind, 'delete');
storedRecord.runtime.currentBookmarkId = 'restored-folder-a';
assert.strictEqual(history.commitUndo().runtime.currentBookmarkId, 'restored-folder-a');
assert.strictEqual(history.peekRedo().runtime.currentBookmarkId, 'restored-folder-a');


const MENU = '#_x_extension_newtab_bookmark_context_menu_2026_unique__menu';

async function openDocs() {
  const page = await createNewtabPage({
    shortcuts: [{ type: 'folder', folderId: '10', title: 'Docs' }],
    bookmarks: [{ id: '10', title: 'Docs', children: [
      { id: '11', title: 'Link A', url: 'https://example.com/a' },
      { id: '12', title: 'Folder B', children: [
        { id: '13', title: 'Link B', url: 'https://example.com/b' },
        { id: '15', title: 'Deep', children: [{ id: '16', title: 'Link C', url: 'https://example.com/c' }] }
      ] },
      { id: '14', title: 'Empty', children: [] }
    ] }]
  });
  await page.settle(400);
  const click = (element) => element.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  const items = () => Array.from(page.document.querySelectorAll('.x-nt-bookmark-cascade-level[data-level="0"] .x-nt-bookmark-cascade-item'));
  const ensureOpen = async () => {
    if (!items().length) {
      click(page.document.querySelector('.x-nt-shortcut-tile--folder'));
      await page.settle(200);
    }
  };
  const toast = () => page.document.getElementById('_x_extension_toast_2024_unique_').textContent;
  const tree = () => page.bookmarks.find('10').children.map(function describe(node) {
    return node.url ? node.title : { [node.title]: (node.children || []).map(describe) };
  });
  return {
    page,
    toast,
    tree,
    titles: () => items().map((item) => item.textContent.trim()),
    item: (title) => items().find((item) => item.textContent.trim() === title),
    async menu(title) {
      await ensureOpen();
      this.item(title).dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20, button: 2 }));
      await page.settle(150);
      return Array.from(page.document.querySelectorAll(`${MENU} [role="menuitem"]`))
        .map((option) => [option.getAttribute('data-value'), option.getAttribute('aria-disabled') === 'true']);
    },
    async choose(value) {
      const option = page.document.querySelector(`${MENU} [data-value="${value}"]`);
      option.dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      click(option);
      await page.settle(250);
    },
    async key(init) {
      page.trusted(page.document.body, 'keydown', Object.assign({ bubbles: true, cancelable: true }, init));
      await page.settle(300);
    }
  };
}

async function testMenus() {
  const docs = await openDocs();
  const link = await docs.menu('Link A');
  assert.strictEqual(link[0][0], 'open-in-new-tab', 'a website starts with Open in new tab');
  assert.strictEqual(link[link.length - 1][0], 'remove', 'and ends with Delete');
  await docs.key({ key: 'Escape' });
  const folder = await docs.menu('Folder B');
  assert.deepStrictEqual(folder.map(([value]) => value), ['open-in-new-tab-group', 'add-shortcut', 'folder-color', 'edit', 'remove']);
  assert.strictEqual(docs.item('Folder B').getAttribute('data-bookmark-context-menu-open'), 'true', 'the item stays marked while its menu is open');
  assert.ok(docs.page.document.querySelector('.x-nt-bookmark-cascade-level[data-open="true"]'), 'and the folder menu stays open behind it');
  await docs.key({ key: 'Escape' });
  const empty = await docs.menu('Empty');
  assert.deepStrictEqual(empty[0], ['open-in-new-tab-group', true], 'an empty folder keeps the action, unavailable');

  await docs.key({ key: 'Escape' });
  await docs.menu('Folder B');
  await docs.choose('open-in-new-tab-group');
  const confirmation = docs.page.document.body.textContent;
  assert.match(confirmation, /Open 2 tabs\?/, 'opening a folder as a group should confirm how many tabs, subfolders included');
  const confirmButton = Array.from(docs.page.document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Open');
  confirmButton.dispatchEvent(new docs.page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await docs.page.settle(150);
  assert.ok(docs.page.messages.some((message) => message.action === 'openBookmarkFolderInNewTabGroup'), 'the background should open the group');
  docs.page.close();
}

async function testDeleteUndoRedo() {
  const docs = await openDocs();
  const original = docs.tree();
  await docs.menu('Folder B');
  await docs.choose('remove');
  assert.deepStrictEqual(docs.titles(), ['Link A', 'Empty'], 'Delete should take the folder off the menu');
  assert.deepStrictEqual(docs.tree(), ['Link A', { Empty: [] }], 'and out of the bookmarks, with everything inside it');
  assert.strictEqual(docs.toast(), '', 'deleting needs no announcement');

  await docs.key({ key: 'z', code: 'KeyZ', metaKey: true });
  assert.deepStrictEqual(docs.tree(), original, 'undo should restore the whole folder where it was');
  assert.deepStrictEqual(docs.titles(), ['Link A', 'Folder B', 'Empty']);
  assert.match(docs.toast(), /Deletion undone · ⇧⌘Z/, 'and say how to redo');

  await docs.key({ key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true });
  assert.deepStrictEqual(docs.tree(), ['Link A', { Empty: [] }], 'redo should delete it again');
  assert.ok(docs.toast().length > 0);
  docs.page.close();
}

function testStyles() {
  assert.ok(parsePageCss('newtab.html').selectors().some((selector) => selector.includes('[data-bookmark-context-menu-open="true"]')),
    'the item under an open menu should stay visibly active');
}

['en', 'zh_CN', 'zh_TW', 'ja'].forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(
    path.join(repoRoot, '_locales', locale, 'messages.json'),
    'utf8'
  ));
  [
    'bookmarks_delete',
    'newtab_open_in_new_tab',
    'bookmarks_open_in_new_tab_group',
    'bookmarks_open_group_confirm_title',
    'bookmarks_open_group_confirm_description',
    'bookmarks_open_group_confirm_button',
    'bookmarks_open_group_partial_failed',
    'bookmarks_open_group_failed',
    'bookmarks_context_menu_label',
    'bookmarks_delete_undone',
    'bookmarks_delete_redone',
    'bookmarks_delete_failed'
  ].forEach((key) => {
    assert.ok(messages[key] && messages[key].message, `${locale} should include ${key}`);
  });
});


(async () => {
  await testMenus();
  await testDeleteUndoRedo();
  testStyles();
  console.log('New tab bookmark delete and undo tests passed.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
