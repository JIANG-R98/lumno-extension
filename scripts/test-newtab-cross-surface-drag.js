const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const newtabJs = fs.readFileSync(path.join(repoRoot, 'src', 'newtab', 'newtab.js'), 'utf8');
const newtabHtml = fs.readFileSync(path.join(repoRoot, 'newtab.html'), 'utf8');
const {
  getRowInsertionSlot,
  isBookmarkFolderDropTarget,
  planBookmarkToShortcut
} = require(path.join(repoRoot, 'src', 'newtab', 'cross-surface-drag.js'));

function getFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} function should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  assert.fail(`${name} function body should end`);
  return '';
}

function assertOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex >= 0, `${message}: missing ${first}`);
  assert.ok(secondIndex >= 0, `${message}: missing ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

function rect(left, top, width = 60, height = 60) {
  return {
    rect: {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      centerX: left + (width / 2),
      centerY: top + (height / 2)
    }
  };
}

// Two rows: three tiles on top, two below.
const tiles = [
  rect(0, 0), rect(70, 0), rect(140, 0),
  rect(0, 80), rect(70, 80)
];

assert.deepStrictEqual(
  getRowInsertionSlot([], 10, 10),
  { index: 0, anchorIndex: -1, markerPosition: 'before' },
  'an empty grid should insert at the first slot'
);
assert.deepStrictEqual(
  getRowInsertionSlot(tiles, 5, 30),
  { index: 0, anchorIndex: 0, markerPosition: 'before' },
  'the left half of the first tile should insert before it'
);
assert.deepStrictEqual(
  getRowInsertionSlot(tiles, 110, 30),
  { index: 2, anchorIndex: 2, markerPosition: 'before' },
  'a point between row tiles should insert before the next tile'
);
assert.deepStrictEqual(
  getRowInsertionSlot(tiles, 400, 30),
  { index: 3, anchorIndex: 2, markerPosition: 'after' },
  'the end of a wrapped row should insert after its last tile, not before the next row'
);
assert.deepStrictEqual(
  getRowInsertionSlot(tiles, 400, 500),
  { index: 5, anchorIndex: 4, markerPosition: 'after' },
  'points below the grid should snap to the nearest (last) row'
);
assert.deepStrictEqual(
  getRowInsertionSlot(tiles, 50, 70),
  { index: 1, anchorIndex: 1, markerPosition: 'before' },
  'row gaps should resolve to the nearest row without a dead zone'
);

const nodeMap = new Map([
  ['0', { id: '0' }],
  ['1', { id: '1', parentId: '0' }],
  ['work', { id: 'work', parentId: '1' }],
  ['link', { id: 'link', parentId: '1', url: 'https://example.com/' }]
]);
assert.strictEqual(isBookmarkFolderDropTarget('1', nodeMap), true, 'the bookmarks bar accepts drops');
assert.strictEqual(isBookmarkFolderDropTarget('work', nodeMap), true, 'nested folders accept drops');
assert.strictEqual(isBookmarkFolderDropTarget('0', nodeMap), false, 'the tree root never accepts drops');
assert.strictEqual(isBookmarkFolderDropTarget('link', nodeMap), false, 'URL bookmarks are not folders');
assert.strictEqual(isBookmarkFolderDropTarget('missing', nodeMap), false, 'unknown folders are rejected');
assert.strictEqual(isBookmarkFolderDropTarget('', nodeMap), false, 'empty folder ids are rejected');

const shortcuts = ['a', 'b', 'c', 'd'].map((id) => ({ id, url: `https://${id}.test/` }));
const record = { id: 'new', url: 'https://new.test/' };
assert.deepStrictEqual(
  planBookmarkToShortcut({ shortcuts, record, index: 1, maxShortcuts: 60 }).shortcuts.map((item) => item.id),
  ['a', 'new', 'b', 'c', 'd'],
  'a new bookmark URL should be inserted at the drop index'
);
assert.strictEqual(
  planBookmarkToShortcut({ shortcuts, record, index: 1, maxShortcuts: 60 }).shortcutId,
  'new',
  'the plan should report the inserted shortcut id for sync-limit warnings'
);
assert.strictEqual(
  planBookmarkToShortcut({ shortcuts, record, index: 1, maxShortcuts: 4 }),
  null,
  'a full shortcut list should reject new URLs'
);
assert.deepStrictEqual(
  planBookmarkToShortcut({
    shortcuts,
    record: { id: 'dup', url: 'https://a.test/' },
    index: 3,
    maxShortcuts: 4
  }).shortcuts.map((item) => item.id),
  ['b', 'c', 'a', 'd'],
  'an existing URL should move its shortcut forward instead of duplicating it, even when full'
);
assert.deepStrictEqual(
  planBookmarkToShortcut({
    shortcuts,
    record: { id: 'dup', url: 'https://d.test/' },
    index: 0,
    maxShortcuts: 60
  }).shortcuts.map((item) => item.id),
  ['d', 'a', 'b', 'c'],
  'an existing URL should move its shortcut backward to the drop index'
);
assert.strictEqual(
  planBookmarkToShortcut({ shortcuts, record: null, index: 0, maxShortcuts: 60 }),
  null,
  'bookmarks without a shortcut-compatible URL should be rejected'
);

// The shared insertion-line primitive renders both grid surfaces and keeps
// cascade rows on their own attribute.
{
  function createFakeElement() {
    const attributes = new Map();
    const styles = new Map();
    return {
      attributes,
      styles,
      getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
      setAttribute: (name, value) => attributes.set(name, String(value)),
      removeAttribute: (name) => attributes.delete(name),
      style: {
        setProperty: (name, value) => styles.set(name, value),
        removeProperty: (name) => styles.delete(name)
      }
    };
  }
  const factory = new Function(
    'bookmarkCascadeRuntime',
    `${getFunctionSource(newtabJs, 'isInsertLineDropTarget')}
    ${getFunctionSource(newtabJs, 'clearDropTargetMarker')}
    ${getFunctionSource(newtabJs, 'clearDragDropTarget')}
    ${getFunctionSource(newtabJs, 'setDragDropTarget')}
    return { clearDragDropTarget, setDragDropTarget };`
  );
  const { clearDragDropTarget, setDragDropTarget } = factory(null);
  const shortcutGrid = createFakeElement();
  const cascadeRow = createFakeElement();
  const state = { dropTarget: null };
  setDragDropTarget(state, {
    kind: 'insertion',
    surface: 'shortcuts',
    index: 2,
    markerElement: shortcutGrid,
    markerPosition: 'before',
    markerOffsetPx: 132,
    markerTopPx: 18,
    markerHeightPx: 48
  });
  assert.strictEqual(shortcutGrid.getAttribute('data-insert-line-position'), 'before');
  assert.strictEqual(shortcutGrid.styles.get('--x-nt-insert-line-left'), '132px');
  assert.strictEqual(shortcutGrid.styles.get('--x-nt-insert-line-height'), '48px');
  assert.strictEqual(shortcutGrid.getAttribute('data-insert-line-motion'), 'a');
  assert.strictEqual(
    shortcutGrid.getAttribute('data-bookmark-insert-position'),
    null,
    'grid surfaces should not use the cascade row attribute'
  );
  setDragDropTarget(state, {
    kind: 'insertion',
    surface: 'shortcuts',
    index: 3,
    markerElement: shortcutGrid,
    markerPosition: 'before',
    markerOffsetPx: 196,
    markerTopPx: 18,
    markerHeightPx: 48
  });
  assert.strictEqual(
    shortcutGrid.getAttribute('data-insert-line-motion'),
    'b',
    'moving to a new boundary should restart the line motion'
  );
  setDragDropTarget(state, {
    kind: 'insertion',
    surface: 'cascade',
    markerElement: cascadeRow,
    markerPosition: 'after'
  });
  assert.strictEqual(cascadeRow.getAttribute('data-bookmark-insert-position'), 'after');
  assert.strictEqual(shortcutGrid.attributes.size, 0, 'leaving a surface should clear its line attributes');
  assert.strictEqual(shortcutGrid.styles.size, 0, 'leaving a surface should clear its line variables');
  clearDragDropTarget(state);
  assert.strictEqual(cascadeRow.attributes.size, 0);
  assert.strictEqual(state.dropTarget, null);
}

// Wiring contracts.
assertOrder(
  newtabHtml,
  '<script src="bookmark-drag.js"></script>',
  '<script src="cross-surface-drag.js"></script>',
  'the cross-surface helpers should load with the other drag helpers'
);
assertOrder(
  newtabHtml,
  '<script src="cross-surface-drag.js"></script>',
  'data-page-entry="../newtab/newtab.js"',
  'the cross-surface helpers should load before the page runtime'
);
assert.ok(
  newtabJs.includes("typeof NEWTAB_CROSS_SURFACE_DRAG.planBookmarkToShortcut !== 'function'"),
  'the page runtime should require the cross-surface helpers'
);

const applyShortcutDragMoveSource = getFunctionSource(newtabJs, 'applyShortcutDragMove');
assertOrder(
  applyShortcutDragMoveSource,
  'if (updateShortcutDragBookmarkTarget(state, pointerX, pointerY)) {',
  'getShortcutDragInsertionIndex(pointerX, pointerY)',
  'hovering the bookmarks surface should pause shortcut reordering'
);
assert.ok(
  getFunctionSource(newtabJs, 'getShortcutDragInsertionIndex')
    .includes('getShortcutInsertionSlotAt(pointerX, pointerY, shortcutDragState.tile).index'),
  'shortcut reordering and bookmark drops should share one slot calculation'
);

const updateShortcutDragBookmarkTargetSource = getFunctionSource(
  newtabJs,
  'updateShortcutDragBookmarkTarget'
);
assertOrder(
  updateShortcutDragBookmarkTargetSource,
  'getBookmarkDropSurfaceElement()',
  'getExternalBookmarkDropTarget(pointerX, pointerY)',
  'shortcut drags should only target bookmarks inside the visible bookmarks surface'
);
const externalTargetSource = getFunctionSource(newtabJs, 'getExternalBookmarkDropTarget');
assertOrder(
  externalTargetSource,
  'getBookmarkElementDropTarget(pointerX, pointerY)',
  'NEWTAB_BOOKMARK_DRAG.getGridInsertionTarget(',
  'folders should win over grid gaps for external drops'
);
assert.ok(
  externalTargetSource.includes('hitZonePx: bookmarkGrid.getBoundingClientRect().width') &&
    !externalTargetSource.includes('getBookmarkCrossLevelDropTarget'),
  'external drops should snap anywhere in a row and skip bookmark-only validators'
);
assert.ok(
  getFunctionSource(newtabJs, 'getBookmarkDropSurfaceElement').includes('currentBookmarkCount <= 0') &&
    getFunctionSource(newtabJs, 'isEmptyBookmarkRootHidden').includes('bookmarkAllItems.length === 0') &&
    getFunctionSource(newtabJs, 'renderBookmarks').includes('isShortcutDragActive()'),
  'an empty bookmarks bar should stay droppable during shortcut drags without reviving disabled bookmarks'
);

const finishShortcutDragSource = getFunctionSource(newtabJs, 'finishShortcutDrag');
assert.ok(
  finishShortcutDragSource.includes('!(options && options.cancel)'),
  'canceled shortcut drags should never convert'
);
assertOrder(
  finishShortcutDragSource,
  'moveShortcutToBookmarks(state, bookmarkDropTarget);',
  'persistShortcutOrder()',
  'dropping a shortcut on bookmarks should branch before persisting the shortcut order'
);
const moveShortcutToBookmarksSource = getFunctionSource(newtabJs, 'moveShortcutToBookmarks');
assertOrder(
  moveShortcutToBookmarksSource,
  'bookmarksRuntime.create(details)',
  'persistShortcuts(',
  'the bookmark should exist before the shortcut is removed'
);
assert.ok(
  moveShortcutToBookmarksSource.includes("if (target.kind === 'insertion') {") &&
    moveShortcutToBookmarksSource.includes('settleShortcutDragTile(state.tile);') &&
    !moveShortcutToBookmarksSource.includes('bookmarkMoveHistory'),
  'shortcut-to-bookmark moves should settle the tile back on failure and stay out of undo history'
);

const processBookmarkDragMoveSource = getFunctionSource(newtabJs, 'processBookmarkDragMove');
assertOrder(
  processBookmarkDragMoveSource,
  'isPointOverShortcutDropSurface(pointerX, pointerY)',
  'getBookmarkCrossLevelDropTarget(state, pointerX, pointerY)',
  'the shortcut grid should be checked before bookmark targets'
);
assert.ok(
  getFunctionSource(newtabJs, 'isPointOverShortcutDropSurface')
    .includes('!isBookmarkCascadeSurfaceAtPoint(pointerX, pointerY)'),
  'an open cascade menu above the shortcuts should keep its own drop targets'
);
const shortcutDropTargetSource = getFunctionSource(newtabJs, 'getBookmarkDragShortcutDropTarget');
assert.ok(
  shortcutDropTargetSource.includes('state.isFolder') &&
    shortcutDropTargetSource.includes('maxShortcuts: MAX_NEWTAB_SHORTCUTS') &&
    shortcutDropTargetSource.includes("surface: 'shortcuts'"),
  'folders and over-limit URLs should never target the shortcut grid'
);
const finishBookmarkDragSource = getFunctionSource(newtabJs, 'finishBookmarkDrag');
assertOrder(
  finishBookmarkDragSource,
  "dropTarget.surface === 'shortcuts'",
  'persistBookmarkCrossLevelMove(state, dropTarget);',
  'dropping a bookmark on shortcuts should branch before bookmark moves'
);
const moveBookmarkToShortcutsSource = getFunctionSource(newtabJs, 'moveBookmarkToShortcuts');
assertOrder(
  moveBookmarkToShortcutsSource,
  'persistShortcuts(',
  'bookmarksRuntime.remove(state.bookmarkId)',
  'the shortcut should be saved before the bookmark is deleted'
);
assert.ok(
  moveBookmarkToShortcutsSource.includes('if (!saved) {') &&
    !moveBookmarkToShortcutsSource.includes('bookmarkMoveHistory'),
  'a failed shortcut save should keep the bookmark and conversions stay out of undo history'
);

assert.ok(
  getFunctionSource(newtabJs, 'handleShortcutDockPointerMove')
    .includes('isShortcutDragActive() || isBookmarkDragActive()') &&
    getFunctionSource(newtabJs, 'shouldSuppressBookmarkHover').includes('isShortcutDragActive()'),
  'dock magnification and bookmark hover should pause during either drag'
);
assert.ok(
  getFunctionSource(newtabJs, 'startShortcutDrag')
    .includes("document.body.setAttribute('data-drag-source', 'shortcut');") &&
    finishShortcutDragSource.includes("document.body.removeAttribute('data-drag-source');"),
  'shortcut drags should use the shared page-wide drag source attribute'
);

assert.ok(
  /\n\s*\[data-insert-line-position\]::after\s*\{[^}]*position:\s*absolute;[^}]*left:\s*calc\(var\(--x-nt-insert-line-left/s
    .test(newtabHtml),
  'both grids should share one attribute-driven insertion line'
);
assert.ok(
  /\.x-nt-shortcuts-grid\s*\{[^}]*position:\s*relative;/s.test(newtabHtml),
  'the shortcut grid should position its insertion line'
);
assert.ok(
  /body\[data-drag-source="shortcut"\] \.x-nt-shortcuts-section\s*\{[^}]*z-index:\s*10001;[^}]*pointer-events:\s*none;/s
    .test(newtabHtml),
  'a dragged shortcut should paint above the bottom dock and bookmarks bar without blocking hit tests'
);

['en', 'ja', 'zh_CN', 'zh_TW'].forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(
    path.join(repoRoot, '_locales', locale, 'messages.json'),
    'utf8'
  ));
  [
    'newtab_shortcuts_moved_to_bookmarks',
    'newtab_shortcuts_move_to_bookmarks_failed',
    'bookmarks_moved_to_shortcuts'
  ].forEach((key) => {
    assert.ok(
      messages[key] && messages[key].message,
      `${locale} should translate ${key}`
    );
  });
});

console.log('New tab cross-surface drag tests passed.');
