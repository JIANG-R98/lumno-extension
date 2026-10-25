const assert = require('assert');
const rules = require('../../src/newtab/bookmarks/bookmark-drag-rules.ts');

// The rules a bookmark drag follows apart from the page.

// Animation boxes.
assert.strictEqual(rules.normalizeAnimationRect(null), null);
assert.strictEqual(rules.normalizeAnimationRect({ left: 1, top: 2, width: NaN, height: 4 }), null);
assert.deepStrictEqual(rules.normalizeAnimationRect({ left: 10, top: 20, width: 30, height: 40 }),
  { left: 10, top: 20, right: 40, bottom: 60, width: 30, height: 40 }, 'right and bottom follow from the size');
assert.deepStrictEqual(rules.normalizeAnimationRect({ left: 10, top: 20, width: 30, height: 40, right: 41, bottom: 61 }),
  { left: 10, top: 20, right: 41, bottom: 61, width: 30, height: 40 }, 'given edges are kept');

// Where a reordered bookmark lands. The items are in the order the grid shows them.
const item = (id, parentId, index) => ({ id, parentId, index, title: id, url: '', host: '', themeUrl: '', type: 'bookmark' });
const items = [item('a', '1', 0), item('moved', '1', 4), item('b', '1', 1), item('c', '1', 2)];
assert.deepStrictEqual(rules.getMoveDestination(items, 'moved', '1'), { parentId: '1', index: 1 },
  'it takes the slot of the bookmark after it');
assert.deepStrictEqual(rules.getMoveDestination([item('a', '1', 0), item('b', '1', 1), item('moved', '1', 0)], 'moved', '1'),
  { parentId: '1', index: 2 }, 'at the end it goes after the bookmark before it');
assert.deepStrictEqual(rules.getMoveDestination([item('moved', '1', 3)], 'moved', '1'), { parentId: '1', index: 0 },
  'alone it goes first');
assert.deepStrictEqual(
  rules.getMoveDestination([item('moved', '7', 3), item('other', '8', 5), item('next', '7', 2)], 'moved', '1'),
  { parentId: '7', index: 2 }, 'bookmarks of other folders are skipped');
assert.deepStrictEqual(rules.getMoveDestination([item('moved', '', 0), item('b', '', 4)], 'moved', '9'),
  { parentId: '9', index: 4 }, 'items without a parent belong to the folder shown');
assert.strictEqual(rules.getMoveDestination(items, 'missing', '1'), null);
assert.strictEqual(rules.getMoveDestination([item('moved', '', 0)], 'moved', ''), null, 'no folder, no destination');

// Drops from other surfaces.
const nodeMap = new Map([
  ['0', { id: '0', title: '', children: [] }],
  ['1', { id: '1', parentId: '0', title: 'Bar', children: [] }],
  ['managed', { id: 'managed', parentId: '0', title: 'Managed', unmodifiable: 'managed', children: [] }],
  ['folder', { id: 'folder', parentId: '1', title: 'Folder', children: [] }],
  ['inner', { id: 'inner', parentId: 'folder', title: 'Inner', children: [] }],
  ['site', { id: 'site', parentId: '1', title: 'Site', url: 'https://example.com/' }]
]);
const card = (folderId) => ({ kind: 'card', surface: 'grid', folderId, element: null, markerElement: null, title: '' });
assert.strictEqual(rules.isExternalBookmarkDropAllowed(null, card('1'), nodeMap), true);
assert.strictEqual(rules.isExternalBookmarkDropAllowed(null, null, nodeMap), false);
assert.strictEqual(rules.isExternalBookmarkDropAllowed(null, { kind: 'blocked', surface: 'folder' }, nodeMap), false);
assert.strictEqual(rules.isExternalBookmarkDropAllowed(null, card('managed'), nodeMap), false, 'a managed folder takes no drops');
assert.strictEqual(rules.isExternalBookmarkDropAllowed(null, card('site'), nodeMap), false, 'a site is no folder');
assert.strictEqual(rules.isExternalBookmarkDropAllowed({ bookmarkId: 'folder' }, card('inner'), nodeMap), false,
  'a folder never drops inside itself');
assert.strictEqual(rules.isExternalBookmarkDropAllowed({ bookmarkId: 'folder' }, card('1'), nodeMap), true);
const back = { kind: 'return', surface: 'grid', bookmarkId: 'folder', folderId: '1', element: null, markerElement: null, title: '' };
assert.strictEqual(rules.isExternalBookmarkDropAllowed({ bookmarkId: 'folder', shortcutId: 's1' }, back, nodeMap), true,
  'a folder shortcut returns to the folder its bookmark sits in');
assert.strictEqual(rules.isExternalBookmarkDropAllowed({ bookmarkId: 'folder' }, back, nodeMap), false,
  'only a shortcut can return');
assert.strictEqual(rules.isExternalBookmarkDropAllowed({ bookmarkId: 'folder', shortcutId: 's1' }, { ...back, folderId: '0' }, nodeMap), false,
  'and only to where the folder is');

// Undo keys and the macOS right-click.
const mac = { platform: 'MacIntel' };
const windows = { platform: 'Win32' };
assert.deepStrictEqual(rules.getUndoShortcutLabels(mac), { undo: '⌘Z', redo: '⇧⌘Z' });
assert.deepStrictEqual(rules.getUndoShortcutLabels(windows), { undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z' });
assert.deepStrictEqual(rules.getUndoShortcutLabels({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' }), { undo: '⌘Z', redo: '⇧⌘Z' });
assert.strictEqual(rules.isMacContextClick({ ctrlKey: true }, mac), true);
assert.strictEqual(rules.isMacContextClick({ ctrlKey: false }, mac), false);
assert.strictEqual(rules.isMacContextClick({ ctrlKey: true }, windows), false, 'elsewhere Control-click is a click');

console.log('bookmark drag rules tests passed');
