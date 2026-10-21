const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readOverlayPanelSource } = require('../helpers/overlay-source');

const repoRoot = path.resolve(__dirname, '..', '..');
const overlayJs = readOverlayPanelSource();
const suggestionsCss = fs.readFileSync(path.join(repoRoot, 'src/overlay/suggestions-view.css'), 'utf8');

assert.match(
  overlayJs,
  /overlayWheelIsolationHandler = null;/,
  'overlay should keep a removable wheel isolation handler reference'
);

assert.match(
  overlayJs,
  /function findOverlayWheelScrollableElement\(event,\s*overlayElement\)[\s\S]*?composedPath/,
  'overlay should find scrollable descendants from the composed wheel event path'
);

assert.match(
  overlayJs,
  /function canScrollElementWithWheel\(element,\s*event\)[\s\S]*?scrollHeight[\s\S]*?clientHeight/,
  'overlay should allow native scrolling only when an internal scroll target can consume the wheel delta'
);

assert.match(
  overlayJs,
  /function createOverlayWheelIsolationHandler\(overlayElement\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?event\.preventDefault\(\)/,
  'overlay wheel handler should stop propagation and prevent default page scrolling at overlay boundaries'
);

assert.match(
  overlayJs,
  /overlay\.addEventListener\('wheel', overlayWheelIsolationHandler, \{ passive: false, capture: true \}\);/,
  'overlay should attach the wheel isolation handler as a non-passive capture listener'
);

assert.match(
  overlayJs,
  /overlayElement\.removeEventListener\('wheel', overlayWheelIsolationHandler, true\);/,
  'overlay cleanup should remove the wheel isolation handler'
);

assert.match(
  suggestionsCss,
  /overscroll-behavior:\s*contain;/,
  'overlay suggestions list should contain scroll chaining while preserving internal scrolling'
);

console.log('overlay wheel isolation tests passed');
