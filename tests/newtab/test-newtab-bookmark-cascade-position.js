const assert = require('assert');
const path = require('path');

const {
  placeRootCascadeMenu,
  placeCascadeSubmenu,
  getTranslateNeutralRect
} = require(path.join('..', '..', 'src', 'newtab', 'bookmarks', 'bookmark-cascade-position.js'));

const viewport = { width: 760, height: 520 };
const spacing = 8;

{
  assert.strictEqual(
    typeof getTranslateNeutralRect,
    'function',
    'cascade positioning should expose a helper that neutralizes visual hover translate'
  );

  const restingAnchorRect = { left: 32, right: 212, top: 42, bottom: 93, width: 180, height: 51 };
  const hoveredAnchorRect = { left: 32, right: 212, top: 39.5, bottom: 90.5, width: 180, height: 51 };
  const restingPlacement = placeRootCascadeMenu({
    anchorRect: restingAnchorRect,
    menuRect: { width: 210, height: 180 },
    viewport,
    spacing
  });
  const hoverNeutralPlacement = placeRootCascadeMenu({
    anchorRect: getTranslateNeutralRect(hoveredAnchorRect, 'matrix(1, 0, 0, 1, 0, -2.5)'),
    menuRect: { width: 210, height: 180 },
    viewport,
    spacing
  });

  assert.deepStrictEqual(
    hoverNeutralPlacement,
    restingPlacement,
    'root menu placement should stay stable when a bookmark folder hover lift is removed'
  );
}

{
  const result = placeRootCascadeMenu({
    anchorRect: { left: 620, right: 740, top: 420, bottom: 470, width: 120, height: 50 },
    menuRect: { width: 210, height: 180 },
    viewport,
    spacing
  });

  assert.deepStrictEqual(
    result,
    { left: 530, top: 232, horizontal: 'right', vertical: 'above' },
    'root menu should flip above and right-align to the anchor when bottom/right space is tight'
  );
}

{
  const result = placeRootCascadeMenu({
    anchorRect: { left: 280, right: 460, top: 300, bottom: 350, width: 180, height: 50 },
    menuRect: { width: 210, height: 300 },
    viewport,
    spacing,
    viewportTopPadding: 48
  });

  assert.strictEqual(
    result.top,
    48,
    'root menus should stay below an occupied top surface'
  );
}

{
  const result = placeRootCascadeMenu({
    anchorRect: { left: 194, right: 333, top: 4, bottom: 32, width: 139, height: 28 },
    menuRect: { width: 258, height: 246 },
    viewport,
    spacing,
    viewportTopPadding: 40
  });

  assert.strictEqual(
    result.top,
    40,
    'topbar folder menus should keep a compact 4px gap below the occupied top surface'
  );
}

{
  const result = placeRootCascadeMenu({
    anchorRect: { left: 32, right: 212, top: 42, bottom: 92, width: 180, height: 50 },
    menuRect: { width: 210, height: 180 },
    viewport,
    spacing
  });

  assert.deepStrictEqual(
    result,
    { left: 32, top: 100, horizontal: 'left', vertical: 'below' },
    'root menu should open below and left-align when there is enough room'
  );
}

{
  const result = placeRootCascadeMenu({
    anchorRect: { left: 280, right: 460, top: 300, bottom: 350, width: 180, height: 50 },
    menuRect: { width: 210, height: 300 },
    viewport,
    spacing
  });

  assert.deepStrictEqual(
    result,
    { left: 280, top: 8, horizontal: 'left', vertical: 'above' },
    'root menu should choose the side with more viewport space when neither side fully fits'
  );
}

{
  const result = placeCascadeSubmenu({
    parentLevelRect: { left: 550, right: 760, top: 180, bottom: 430, width: 210, height: 250 },
    triggerRect: { left: 558, right: 752, top: 360, bottom: 392, width: 194, height: 32 },
    menuRect: { width: 210, height: 170 },
    viewport,
    spacing
  });

  assert.deepStrictEqual(
    result,
    { left: 332, top: 342, side: 'left' },
    'submenu should flip left of the current level and clamp vertically without moving earlier levels'
  );
}

{
  const result = placeCascadeSubmenu({
    parentLevelRect: { left: 332, right: 542, top: 342, bottom: 512, width: 210, height: 170 },
    triggerRect: { left: 340, right: 534, top: 456, bottom: 488, width: 194, height: 32 },
    menuRect: { width: 210, height: 170 },
    viewport: { width: 780, height: 520 },
    spacing
  });

  assert.deepStrictEqual(
    result,
    { left: 550, top: 342, side: 'right' },
    'nested submenu should be able to alternate back to the right when that side has room'
  );
}

{
  const result = placeCascadeSubmenu({
    parentLevelRect: { left: 44, right: 254, top: 180, bottom: 298, width: 210, height: 118 },
    triggerRect: { left: 52, right: 246, top: 220, bottom: 252, width: 194, height: 32 },
    menuRect: { width: 210, height: 82 },
    viewport,
    spacing: -8
  });

  assert.deepStrictEqual(
    result,
    { left: 246, top: 220, side: 'right' },
    'submenu should preserve negative spacing so later levels overlap previous levels slightly'
  );
}

{
  const result = placeCascadeSubmenu({
    parentLevelRect: { left: 280, right: 490, top: 170, bottom: 420, width: 210, height: 250 },
    triggerRect: { left: 288, right: 482, top: 240, bottom: 272, width: 194, height: 32 },
    menuRect: { width: 620, height: 180 },
    viewport,
    spacing
  });

  assert.strictEqual(result.left, 8, 'oversized submenu should be clamped inside the viewport');
  assert.strictEqual(result.side, 'left', 'oversized submenu should still pick the side with more room');
}

{
  const result = placeCascadeSubmenu({
    parentLevelRect: { left: 40, right: 250, top: 48, bottom: 250, width: 210, height: 202 },
    triggerRect: { left: 48, right: 242, top: 20, bottom: 52, width: 194, height: 32 },
    menuRect: { width: 210, height: 120 },
    viewport,
    spacing,
    viewportTopPadding: 48
  });

  assert.strictEqual(
    result.top,
    48,
    'submenus should clamp below an occupied top surface'
  );
}

console.log('newtab bookmark cascade position tests passed');
