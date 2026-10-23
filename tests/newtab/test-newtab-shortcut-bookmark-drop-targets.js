const assert = require('assert');
const { createNewtabPage } = require('../helpers/newtab-page');

// Dragging a New Tab shortcut onto the bookmarks (the grid, the list or the
// bookmarks bar) places it where it lands: between two bookmarks inserts it
// there, the middle of a folder files it inside, and its own folder just
// removes the shortcut. JSDOM does no layout, so the test gives the shortcut
// and the bookmarks their boxes (fake-layout.js); the drag itself runs
// through New Tab's real pointer handling.

const MODE_KEY = '_x_extension_bookmark_view_mode_2026_unique_';
const SOURCES = {
  website: { url: 'https://source.example/', title: 'Source website' },
  folder: { type: 'folder', folderId: '30', title: 'Source folder' }
};
const GEOMETRY = {
  folder: { left: 100, top: 100, width: 188, height: 51, gap: 12 },
  list: { left: 100, top: 100, width: 188, height: 51, gap: 12 },
  top: { left: 100, top: 4, width: 100, height: 28, gap: 2 }
};

function bar(options) {
  const websites = options && options.websites;
  const items = (options && options.empty ? [] : ['first', 'second', 'third']).map((title, index) => (websites
    ? { id: String(21 + index), title, url: `https://${title}.example/` }
    : { id: String(21 + index), title, children: [] }));
  return items;
}

async function openNewtab(mode, sourceType, options) {
  const config = options || {};
  const barItems = bar(config);
  if (config.firstFolderChildren) {
    barItems[0].children = config.firstFolderChildren;
  }
  if (config.sourceAsCard) {
    barItems[0] = { id: '30', title: 'Source folder', children: [{ id: '31', title: 'Inner', children: [] }] };
  }
  const page = await createNewtabPage({
    layout: true,
    sync: { [MODE_KEY]: mode },
    shortcuts: [SOURCES[sourceType]],
    bookmarks: barItems,
    // A folder shortcut's own folder lives elsewhere unless the case puts it on the bar.
    otherBookmarks: config.sourceAsCard ? [] : [{ id: '30', title: 'Source folder', children: [] }]
  });
  const doc = page.document;
  const geometry = GEOMETRY[mode];
  // Each drop is undone before the next one, and on a busy machine a drop, its
  // undo and the renders after them can each take longer than a fixed wait.
  // So the test waits for the page itself: for the drop to land before
  // undoing it, and for the bookmarks and the shortcut to be back before the
  // next drop.
  const shortcutTiles = () => doc.querySelectorAll('.x-nt-shortcut-tile:not(.x-nt-shortcut-tile--add)').length;
  const bookmarkCards = () => doc.querySelectorAll('#_x_extension_newtab_bookmarks_grid_2024_unique_ .x-nt-bookmark-card').length;
  const restored = () => bookmarkCards() === barItems.length && shortcutTiles() === 1;
  const waitUntilStill = async () => {
    const snapshot = () => [shortcutTiles(), bookmarkCards(), page.bookmarks.calls.length].join();
    let last = snapshot();
    let stillSince = Date.now();
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && Date.now() - stillSince < 120) {
      await page.settle(20);
      const current = snapshot();
      if (current !== last) {
        last = current;
        stillSince = Date.now();
      }
    }
  };
  await page.waitFor(restored, `${mode}/${sourceType}: New Tab should show the bookmarks and the shortcut`);
  await waitUntilStill();
  const layoutPage = () => {
    const grid = doc.getElementById('_x_extension_newtab_bookmarks_grid_2024_unique_');
    const cards = Array.from(grid.querySelectorAll('.x-nt-bookmark-card'));
    const width = Math.max(1, cards.length) * (geometry.width + geometry.gap) - geometry.gap;
    if (mode === 'top') {
      page.layout.place(doc.getElementById('_x_extension_newtab_bookmarks_topbar_2026_unique_'), { left: 0, top: 0, width: 900, height: 36 });
      page.layout.place(doc.getElementById('_x_extension_newtab_bookmarks_topbar_viewport_2026_unique_'), { left: 100, top: 4, width: 700, height: 28 });
      page.layout.place(doc.getElementById('_x_extension_newtab_bookmarks_topbar_items_2026_unique_'), { left: 100, top: 4, width: 700, height: 28 });
    } else {
      page.layout.place(doc.getElementById('_x_extension_newtab_bookmarks_2024_unique_'), { left: 80, top: 80, width: 700, height: 100 });
    }
    page.layout.place(grid, { left: geometry.left, top: geometry.top, width, height: geometry.height });
    const boxes = page.layout.row(cards, geometry);
    const tile = doc.querySelector('.x-nt-shortcut-tile:not(.x-nt-shortcut-tile--add)');
    if (tile) {
      page.layout.place(tile.parentElement, { left: 300, top: 400, width: 400, height: 80 });
      page.layout.place(tile, { left: 300, top: 400, width: 64, height: 64 });
    }
    return { boxes, tile, y: geometry.top + geometry.height / 2 };
  };
  return {
    page,
    layoutPage,
    // Drags the shortcut to (x, y) and reports what changed, then undoes it.
    async dropAt(x, y) {
      const { tile } = layoutPage();
      assert.ok(tile, `${mode}/${sourceType} ${JSON.stringify(config)}: the shortcut should be back before dropping at ${x},${y}`);
      const before = page.bookmarks.calls.length;
      await page.drag(tile, [[320, 300], [x, y]]);
      await waitUntilStill();
      const changes = page.bookmarks.calls.slice(before).filter((call) => ['create', 'move'].includes(call.name));
      const shortcutsLeft = shortcutTiles();
      page.trusted(doc.body, 'keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true });
      await page.waitFor(restored, `${mode}/${sourceType}: undoing the drop at ${x},${y} should restore the page`);
      await waitUntilStill();
      page.bookmarks.calls.length = 0;
      return { changes: changes.map((call) => call.args[call.name === 'move' ? 1 : 0]), moved: changes.map((call) => call.name), shortcutsLeft };
    }
  };
}

function expectedPlacement(sourceType, parentId, index) {
  return sourceType === 'folder'
    ? { moved: ['move'], changes: [{ parentId, index }] }
    : { moved: ['create'], changes: [{ parentId, index, title: 'Source website', url: 'https://source.example/' }] };
}

async function testInsertions(mode, sourceType, options) {
  const newtab = await openNewtab(mode, sourceType, options);
  const { boxes, y } = newtab.layoutPage();
  const [first, second, last] = [boxes[0], boxes[1], boxes[2]];
  const name = `${mode}/${sourceType}${options && options.websites ? '/websites' : ''}`;
  for (const x of [first.right - 2, (first.right + second.left) / 2, second.left + 2]) {
    const result = await newtab.dropAt(x, y);
    const expected = expectedPlacement(sourceType, '1', 1);
    assert.deepStrictEqual([result.moved, result.changes.map((change) => ({ ...change, title: change.title, url: change.url }))],
      [expected.moved, expected.changes.map((change) => ({ ...change, title: change.title, url: change.url }))],
      `${name}: x=${x} between two bookmarks should insert the shortcut there`);
    assert.strictEqual(result.shortcutsLeft, 0, `${name}: the shortcut moves out of the shortcuts`);
  }
  for (const [x, index] of [[first.left + 2, 0], [last.right - 2, 3]]) {
    const result = await newtab.dropAt(x, y);
    assert.deepStrictEqual(result.changes.map((change) => change.index), [index], `${name}: the outer edges insert at the ends`);
  }
  if (!(options && options.websites)) {
    const result = await newtab.dropAt(first.left + first.width / 2, y);
    assert.deepStrictEqual(result.changes.map((change) => change.parentId), ['21'],
      `${name}: the middle of a folder files the shortcut inside it`);
  }
  if (mode === 'top') {
    const result = await newtab.dropAt(850, y);
    assert.deepStrictEqual(result.changes, [], 'the bar\'s own controls are not a drop target');
    const below = await newtab.dropAt((first.right + second.left) / 2, 40);
    assert.deepStrictEqual(below.changes.map((change) => change.index), [1], 'just below the bar still drops into the gap');
  }
  newtab.page.close();
}

async function testEmptyBar(mode, sourceType) {
  const newtab = await openNewtab(mode, sourceType, { empty: true });
  const result = await newtab.dropAt(150, mode === 'top' ? 18 : 125);
  assert.deepStrictEqual(result.changes.map((change) => [change.parentId, change.index]), [['1', 0]], `${mode}: an empty bar takes the shortcut first`);
  newtab.page.close();
}

async function testOwnFolder(mode) {
  const newtab = await openNewtab(mode, 'folder', { sourceAsCard: true });
  const { boxes, y } = newtab.layoutPage();
  const result = await newtab.dropAt(boxes[0].left + boxes[0].width / 2, y);
  assert.deepStrictEqual(result.changes, [], `${mode}: dropping a folder shortcut on its own folder does not move the folder`);
  assert.strictEqual(result.shortcutsLeft, 0, 'it just removes the shortcut');
  newtab.page.close();
}

async function testCascade(sourceType) {
  // Holding a dragged shortcut over a folder on the bookmarks bar opens the
  // folder's menu, whose rows take the shortcut too.
  const newtab = await openNewtab('top', sourceType, {
    firstFolderChildren: [0, 1, 2].map((index) => ({ id: String(41 + index), title: `row-${index}`, children: [] }))
  });
  const { page } = newtab;
  const { boxes, tile } = newtab.layoutPage();
  const folder = [boxes[0].left + boxes[0].width / 2, boxes[0].top + boxes[0].height / 2];
  await page.drag(tile, [[320, 300], folder], { release: false });
  await page.waitFor(() => page.document.querySelector('.x-nt-bookmark-cascade-level'), 'holding over a folder should open its menu', 3000);
  const level = page.document.querySelector('.x-nt-bookmark-cascade-level');
  const rows = Array.from(level.querySelectorAll('.x-nt-bookmark-cascade-item'));
  assert.strictEqual(rows.length, 3, 'the menu should list the folder\'s three subfolders');
  page.layout.place(page.document.querySelector('.x-nt-bookmark-cascade-menu'), { left: 100, top: 40, width: 230, height: 120 });
  page.layout.place(level, { left: 100, top: 40, width: 230, height: 120 });
  // Rows stack 36px apart; each item measures by its row.
  const rowBoxes = rows.map((item, index) => {
    const box = { left: 108, top: 48 + index * 36, width: 214, height: 32 };
    page.layout.place(item.closest('.x-nt-bookmark-cascade-row') || item, box);
    page.layout.place(item, box);
    return item.getBoundingClientRect();
  });
  const gap = [215, (rowBoxes[0].bottom + rowBoxes[1].top) / 2];
  const before = page.bookmarks.calls.length;
  page.pointer('pointermove', gap[0], gap[1]);
  await page.settle(60);
  page.pointer('pointermove', gap[0], gap[1]);
  await page.settle(60);
  page.pointer('pointerup', gap[0], gap[1]);
  await page.settle(250);
  const changes = page.bookmarks.calls.slice(before).filter((call) => ['create', 'move'].includes(call.name))
    .map((call) => call.args[call.name === 'move' ? 1 : 0]);
  assert.deepStrictEqual(changes.map((change) => [change.parentId, change.index]), [['21', 1]], `${sourceType}: the gap between two menu rows inserts there`);
  newtab.page.close();
}

(async () => {
  let checked = 0;
  for (const mode of ['folder', 'list', 'top']) {
    for (const sourceType of ['website', 'folder']) {
      await testInsertions(mode, sourceType);
      await testInsertions(mode, sourceType, { websites: true });
      await testEmptyBar(mode, sourceType);
      checked += 3;
    }
    await testOwnFolder(mode);
    checked += 1;
  }
  for (const sourceType of ['website', 'folder']) {
    await testCascade(sourceType);
    checked += 1;
  }
  console.log(`shortcut-to-bookmark drop targets passed: ${checked} scenarios across folder, list, top and cascade views`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
