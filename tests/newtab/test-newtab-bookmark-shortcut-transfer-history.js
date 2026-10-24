const assert = require('assert');
const historyApi = require('../../src/newtab/bookmarks/bookmark-move-history');
const shortcutsStore = require('../../src/newtab/shortcuts/shortcuts-store.ts');
const { openDragPage } = require('../helpers/newtab-drag-page');

const FOLDER_ITEM_ICONS_KEY = '_x_extension_shortcut_folder_item_icons_2026_unique_';
const SHORTCUT_ICONS_KEY = '_x_extension_newtab_shortcut_icons_2026_unique_';

// Dragging between New Tab's bookmarks, shortcuts and recent sites, and the
// undo (⌘Z) / redo (⇧⌘Z) history those drags share. With a WebDAV backup
// covering the shortcuts, a bookmark dragged to the shortcuts moves there;
// without one it is copied. The drags run through New Tab's pointer handling
// on boxes from fake-layout.js.

const NOW = Date.now();
const SHORTCUTS = [{ url: 'https://one.example/', title: 'One' }, { url: 'https://two.example/', title: 'Two' }];
const BOOKMARKS = [
  { id: '20', title: 'Start', url: 'https://start.example/' },
  { id: 'link', title: 'Link', url: 'https://link.example/' },
  { id: 'folder', title: 'Folder', children: [{ id: 'child', title: 'Child', url: 'https://child.example/' }] }
];

function open(options) {
  return openDragPage(Object.assign({ shortcuts: SHORTCUTS, bookmarks: BOOKMARKS }, options || {}));
}

async function testBookmarkMovesToShortcuts() {
  const newtab = await open({ webdavBackup: true });
  await newtab.dragTo(newtab.card('link'), newtab.shortcutSlot(1));
  assert.deepStrictEqual(newtab.shortcuts(), ['One', 'Link', 'Two'], 'the bookmark should become a shortcut where it was dropped');
  assert.deepStrictEqual(newtab.bar(), ['Start', 'Folder'], 'and leave the bookmarks, since the backup keeps it');
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await newtab.undo();
    assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Two'], ['Start', 'Link', 'Folder']], 'undo should put the bookmark back where it was');
    await newtab.redo();
    assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Link', 'Two'], ['Start', 'Folder']]);
  }
  assert.strictEqual(newtab.toast(), '', 'moving a website, undoing and redoing are silent');
  newtab.close();
}

async function testBookmarkCopiesWithoutABackup() {
  const newtab = await open();
  await newtab.dragTo(newtab.card('link'), newtab.shortcutSlot(1));
  assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Link', 'Two'], ['Start', 'Link', 'Folder']],
    'without a backup the bookmark stays and a shortcut is added');
  assert.strictEqual(newtab.toast(), 'Shortcut added');
  assert.deepStrictEqual(newtab.changes(), [], 'the bookmarks are not touched');
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await newtab.undo();
    assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Two'], ['Start', 'Link', 'Folder']]);
    await newtab.redo();
    assert.deepStrictEqual(newtab.shortcuts(), ['One', 'Link', 'Two']);
  }
  assert.deepStrictEqual(newtab.changes(), [], 'nor by undo and redo');
  newtab.close();
}

async function testShortcutMovesToBookmarks() {
  const newtab = await open();
  await newtab.dragTo(newtab.tile('One'), newtab.bookmarkSlot(1));
  assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['Two'], ['Start', 'One', 'Link', 'Folder']],
    'a shortcut dropped among the bookmarks becomes one there');
  assert.strictEqual(newtab.toast(), '');
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await newtab.undo();
    assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Two'], ['Start', 'Link', 'Folder']], 'undo should bring the shortcut back');
    await newtab.redo();
    assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['Two'], ['Start', 'One', 'Link', 'Folder']]);
  }
  newtab.close();
}

async function testFoldersMoveWhole() {
  const newtab = await open();
  await newtab.dragTo(newtab.card('folder'), newtab.shortcutSlot(2));
  assert.deepStrictEqual(newtab.shortcuts(), ['One', 'Two', 'Folder'], 'a folder dragged to the shortcuts becomes a folder shortcut');
  assert.deepStrictEqual(newtab.bar(), ['Start', 'Link', 'Folder'], 'the folder itself stays among the bookmarks');
  assert.match(newtab.toast(), /Folder added to shortcuts/);
  assert.deepStrictEqual(newtab.changes(), []);
  await newtab.undo();
  assert.deepStrictEqual(newtab.shortcuts(), ['One', 'Two']);
  await newtab.redo();
  newtab.page.bookmarks.calls.length = 0;
  await newtab.dragTo(newtab.tile('Folder'), newtab.bookmarkSlot(0));
  assert.deepStrictEqual(newtab.bar(), ['Folder', 'Start', 'Link'], 'dragging the folder shortcut to the bookmarks moves the folder there');
  assert.deepStrictEqual(newtab.node('folder').children.map((node) => node.title), ['Child'], 'with what is inside it');
  assert.deepStrictEqual(newtab.changes(), ['move'], 'without recreating anything');
  await newtab.undo();
  assert.deepStrictEqual([newtab.bar(), newtab.shortcuts()], [['Start', 'Link', 'Folder'], ['One', 'Two', 'Folder']]);
  newtab.close();
}

// A site inside a shortcut folder is already one of the shortcuts: dragged
// to the shortcut row it moves out of the folder even without a backup, and
// keeps the icon it showed there, as a shortcut and again after undo. The
// folder shortcut here holds the bookmarks bar, whose sites the grid shows;
// a shortcut for the bar itself draws no tile.
async function testShortcutFolderSiteMovesWithItsIcon() {
  const icon = 'data:image/png;base64,iVBORw0KGgo=';
  const newtab = await open({
    shortcuts: [...SHORTCUTS, { type: 'folder', folderId: '1', title: 'Bar' }],
    local: { [FOLDER_ITEM_ICONS_KEY]: { link: { iconSource: 'custom', dataUrl: icon } } }
  });
  await newtab.dragTo(newtab.card('link'), newtab.shortcutSlot(1));
  assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Link', 'Two'], ['Start', 'Folder']],
    'the site leaves the shortcut folder for the row');
  const shortcut = (await shortcutsStore.loadShortcuts(newtab.page.storage.sync)).find((item) => item.title === 'Link');
  assert.strictEqual(shortcut.iconSource, 'custom', 'the shortcut keeps the icon source it had in the folder');
  const shortcutIcons = () => newtab.page.storage.local.data[SHORTCUT_ICONS_KEY] || {};
  const folderIcon = (title) => {
    const node = newtab.bar().includes(title) && newtab.page.bookmarks.find('1').children.find((item) => item.title === title);
    return node ? (newtab.page.storage.local.data[FOLDER_ITEM_ICONS_KEY] || {})[node.id] : undefined;
  };
  assert.strictEqual(shortcutIcons()[shortcut.id], icon, 'and its custom image');
  await newtab.undo();
  assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Two'], ['Start', 'Link', 'Folder']]);
  assert.deepStrictEqual(folderIcon('Link'), { iconSource: 'custom', dataUrl: icon },
    'undo puts the site back in the folder with its icon');
  await newtab.redo();
  assert.strictEqual(shortcutIcons()[shortcut.id], icon, 'redo gives the shortcut the image again');
  await newtab.dragTo(newtab.tile('Link'), newtab.bookmarkSlot(1));
  assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Two'], ['Start', 'Link', 'Folder']]);
  assert.deepStrictEqual(folderIcon('Link'), { iconSource: 'custom', dataUrl: icon },
    'a shortcut dragged into the bookmarks keeps its icon for the folder view');
  newtab.close();
}

// A shortcut's icon settings survive a trip into a shortcut folder and back:
// its plate and an online source whose image was never saved, which the
// folder's menu cannot show, ride along with the site.
async function testShortcutSettingsRoundTripThroughAFolder() {
  const newtab = await open({
    shortcuts: [{ url: 'https://one.example/', title: 'One', iconSource: 'service', iconPlate: 'on', iconPlateColor: '#FFE4A0' },
      { url: 'https://two.example/', title: 'Two' }, { type: 'folder', folderId: '1', title: 'Bar' }]
  });
  await newtab.dragTo(newtab.tile('One'), newtab.bookmarkSlot(1));
  assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['Two'], ['Start', 'One', 'Link', 'Folder']]);
  await newtab.dragTo(newtab.card(newtab.page.bookmarks.find('1').children[1].id), newtab.shortcutSlot(0));
  assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Two'], ['Start', 'Link', 'Folder']]);
  const one = (await shortcutsStore.loadShortcuts(newtab.page.storage.sync)).find((item) => item.title === 'One');
  assert.deepStrictEqual([one.iconSource, one.iconPlate, one.iconPlateColor], ['service', 'on', '#FFE4A0'],
    'the shortcut comes back with the icon source and plate it had');
  newtab.close();
}

async function testDuplicateWebsiteMovesTheExistingShortcut() {
  const newtab = await open({
    webdavBackup: true,
    bookmarks: [{ id: '20', title: 'Start', url: 'https://start.example/' }, { id: 'dup', title: 'One again', url: 'https://one.example/' }]
  });
  await newtab.dragTo(newtab.card('dup'), newtab.shortcutSlot(2));
  assert.deepStrictEqual(newtab.shortcuts(), ['Two', 'One'], 'a website that is already a shortcut moves that shortcut rather than adding another');
  await newtab.undo();
  assert.deepStrictEqual([newtab.shortcuts(), newtab.bar()], [['One', 'Two'], ['Start', 'One again']]);
  newtab.close();
}

async function testFailuresChangeNothing() {
  const created = await open();
  created.fail('create');
  await created.dragTo(created.tile('One'), created.bookmarkSlot(1));
  assert.deepStrictEqual([created.shortcuts(), created.bar()], [['One', 'Two'], ['Start', 'Link', 'Folder']],
    'a bookmark that cannot be created keeps the shortcut');
  await created.undo();
  assert.deepStrictEqual(created.shortcuts(), ['One', 'Two'], 'and leaves nothing to undo');
  created.close();

  const saved = await open({ webdavBackup: true });
  saved.failWrites(true);
  await saved.dragTo(saved.card('link'), saved.shortcutSlot(1));
  saved.failWrites(false);
  assert.deepStrictEqual([saved.shortcuts(), saved.bar()], [['One', 'Two'], ['Start', 'Link', 'Folder']],
    'shortcuts that cannot be saved keep the bookmark where it was');
  saved.close();

  const undoFails = await open();
  await undoFails.dragTo(undoFails.tile('One'), undoFails.bookmarkSlot(1));
  undoFails.fail('remove');
  await undoFails.undo();
  assert.deepStrictEqual([undoFails.shortcuts(), undoFails.bar()], [['Two'], ['Start', 'One', 'Link', 'Folder']],
    'an undo whose bookmark cannot be removed changes nothing');
  await undoFails.undo();
  assert.deepStrictEqual([undoFails.shortcuts(), undoFails.bar()], [['One', 'Two'], ['Start', 'Link', 'Folder']], 'and can be tried again');
  undoFails.close();
}

async function testSorting() {
  const newtab = await open();
  const writes = () => newtab.page.storage.sync.writes.length;
  await newtab.dragTo(newtab.tile('Two'), newtab.shortcutSlot(0));
  assert.deepStrictEqual(newtab.shortcuts(), ['Two', 'One'], 'dragging a shortcut sideways reorders it');
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await newtab.undo();
    assert.deepStrictEqual(newtab.shortcuts(), ['One', 'Two'], 'undo should restore the order');
    await newtab.redo();
    assert.deepStrictEqual(newtab.shortcuts(), ['Two', 'One']);
  }
  assert.strictEqual(newtab.toast(), '', 'sorting, undo and redo are silent');
  const before = writes();
  await newtab.page.drag(newtab.tile('One'), [[newtab.shortcutSlot(0)[0], 420], [newtab.shortcutSlot(2)[0] + 30, 432]]);
  await newtab.page.settle(200);
  assert.deepStrictEqual(newtab.shortcuts(), ['Two', 'One'], 'dragging back to where it started leaves the order');
  assert.strictEqual(writes(), before, 'and saves nothing');
  newtab.close();
}

async function testRecentSites() {
  const recent = [{ id: 'r', title: 'Recent', url: 'https://recent.example/', lastVisitTime: NOW, visitCount: 3 }];
  const toBookmarks = await open({ recent });
  await toBookmarks.dragTo(toBookmarks.recentCard('Recent'), toBookmarks.bookmarkSlot(0));
  assert.deepStrictEqual([toBookmarks.bar(), toBookmarks.shortcuts()], [['Recent', 'Start', 'Link', 'Folder'], ['One', 'Two']],
    'a recent site dropped on the bookmarks only bookmarks it');
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await toBookmarks.undo();
    assert.deepStrictEqual(toBookmarks.bar(), ['Start', 'Link', 'Folder']);
    await toBookmarks.redo();
    assert.deepStrictEqual(toBookmarks.bar(), ['Recent', 'Start', 'Link', 'Folder']);
  }
  toBookmarks.close();

  const toShortcuts = await open({ recent });
  await toShortcuts.dragTo(toShortcuts.recentCard('Recent'), toShortcuts.shortcutSlot(0));
  assert.deepStrictEqual(toShortcuts.shortcuts(), ['Recent', 'One', 'Two'], 'a recent site dropped on the shortcuts adds one');
  await toShortcuts.undo();
  assert.deepStrictEqual(toShortcuts.shortcuts(), ['One', 'Two'], 'undo takes it out again');
  toShortcuts.close();
}

function testBoundedIdHistory() {
  // Undo recreates bookmarks under new ids; the history maps the old ones,
  // and forgets them when the records that needed them are trimmed.
  const history = historyApi.createBookmarkMoveHistory({ maxEntries: 2 });
  for (let index = 0; index < 8; index += 1) {
    history.push(historyApi.createMoveRecord({ bookmarkId: `old-${index}`, from: { parentId: '1', index: 0 }, to: { parentId: '2', index: 0 } }));
    history.remapBookmarkId(`old-${index}`, `restored-${index}`);
    history.remapBookmarkId(`old-${index}`, `restored-again-${index}`);
  }
  assert.strictEqual(history.resolveBookmarkId('old-7'), 'restored-again-7');
  assert.strictEqual(history.resolveBookmarkId('old-6'), 'restored-again-6');
  assert.strictEqual(history.resolveBookmarkId('old-5'), 'old-5', 'trimmed history releases bookmark id mappings');
  history.clear();
  assert.strictEqual(history.resolveBookmarkId('old-7'), 'old-7');
}

(async () => {
  testBoundedIdHistory();
  await testBookmarkMovesToShortcuts();
  await testBookmarkCopiesWithoutABackup();
  await testShortcutMovesToBookmarks();
  await testFoldersMoveWhole();
  await testShortcutFolderSiteMovesWithItsIcon();
  await testShortcutSettingsRoundTripThroughAFolder();
  await testDuplicateWebsiteMovesTheExistingShortcut();
  await testFailuresChangeNothing();
  await testSorting();
  await testRecentSites();
  console.log('bookmark and shortcut transfer history passed: moves, copies, folders, duplicates, failures, sorting and recent sites');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
