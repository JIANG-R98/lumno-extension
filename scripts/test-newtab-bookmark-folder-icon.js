const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const folderIcon = require('../src/newtab/bookmark-folder-icon.js');
const { readPageSource } = require('./helpers/page-source');

const repoRoot = path.resolve(__dirname, '..');
const newtabHtml = readPageSource('newtab.html');
const newtabJs = fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.js'), 'utf8');
assert.deepStrictEqual(folderIcon.normalizeFolderColorMap(JSON.parse('{"1":"#aabbcc", "2":"#FF0000", "3":"bad-value", "__proto__":"#ffffff", "invalid id":"#ffffff"}')), { '1': '#AABBCC', '2': '#FF0000' });

const firstSvg = folderIcon.getFigmaFolderSvg('folder one');
const secondSvg = folderIcon.getFigmaFolderSvg('folder/two');
assert.ok(firstSvg.includes('x-nt-folder-filter-lower-base-folder_one'));
assert.ok(secondSvg.includes('x-nt-folder-filter-lower-base-folder_two'));
assert.ok(!firstSvg.includes('folder one'), 'SVG ids should sanitize caller-provided suffixes');
assert.strictEqual(
  folderIcon.FOLDER_PATH_MORPH_DURATION_MS,
  460,
  'the shared component should expose its animation duration contract'
);

const dom = new JSDOM('<!doctype html><body><span id="folder"></span></body>');
const iconElement = dom.window.document.getElementById('folder');
iconElement.innerHTML = firstSvg;
folderIcon.initFolderPathMorph(iconElement);
assert.ok(Array.isArray(iconElement._xFolderMorphParts));
assert.ok(iconElement._xFolderMorphParts.length >= 6);
assert.strictEqual(iconElement._xFolderMorphState, 'base');

folderIcon.playFolderPathMorph(iconElement, true, { instant: true });
assert.strictEqual(iconElement._xFolderMorphState, 'hover');
const upperBody = iconElement._xFolderMorphParts.find((part) => part.partName === 'upper-body');
assert.ok(upperBody);
assert.strictEqual(upperBody.pathEl.getAttribute('d'), upperBody.hoverD);

folderIcon.setFolderPathMorphState(iconElement, false);
assert.strictEqual(iconElement._xFolderMorphState, 'base');
assert.strictEqual(upperBody.pathEl.getAttribute('d'), upperBody.baseD);

folderIcon.applyFolderColor(iconElement, '#EF4444');
const originalPath = upperBody.pathEl;
assert.strictEqual(iconElement.querySelector('svg').getAttribute('data-folder-color'), '#EF4444');
assert.strictEqual(iconElement.querySelector('[data-folder-part="upper-outline"]').getAttribute('stroke'), '#EF4444');
const closedStops = Array.from(iconElement.querySelectorAll('[data-folder-gradient-morph="upper-main"] stop')).map((stop) => stop.getAttribute('stop-color'));
assert.ok(closedStops.every((color) => color !== '#CCDFFF'), 'all gradient stops should use the selected palette');
folderIcon.playFolderPathMorph(iconElement, true, { instant: true });
assert.strictEqual(upperBody.pathEl, originalPath, 'recoloring must retain animated path nodes');
assert.notDeepStrictEqual(Array.from(iconElement.querySelectorAll('[data-folder-gradient-morph="upper-main"] stop')).map((stop) => stop.getAttribute('stop-color')), closedStops, 'expanded folders should keep their shaded gradient animation');
folderIcon.applyFolderColor(iconElement, '#22C55E');
assert.strictEqual(iconElement._xFolderMorphState, 'hover', 'recoloring an open folder must preserve its expanded shape');
folderIcon.setFolderPathMorphState(iconElement, false);
folderIcon.applyFolderColor(iconElement, null);
assert.deepStrictEqual(Array.from(iconElement.querySelectorAll('[data-folder-gradient-morph="upper-main"] stop')).map((stop) => stop.getAttribute('stop-color')), ['#CCDFFF', '#B2CEFF', '#89B5FF', '#97BEFF'], 'reset must exactly restore the original blue palette');

iconElement.innerHTML = folderIcon.getFigmaFolderSvg('after-reorder', '123');
folderIcon.initFolderPathMorph(iconElement);
folderIcon.applyFolderColor(iconElement, '#EF4444');
folderIcon.playFolderPathMorph(iconElement, true, { instant: true });
assert.strictEqual(iconElement._xFolderMorphParts.find((part) => part.partName === 'upper-body').pathEl, iconElement.querySelector('[data-folder-part="upper-body"]'), 'reordered folders must animate the current SVG');
assert.strictEqual(iconElement.querySelector('svg').getAttribute('data-folder-color-id'), '123');

const scriptPath = 'bookmark-folder-icon.js';
assert.ok(newtabHtml.includes(`<script src="${scriptPath}"></script>`));
assert.ok(
  newtabHtml.indexOf(`<script src="${scriptPath}"></script>`) <
    newtabHtml.indexOf('data-page-entry="../newtab/newtab.js"'),
  'the folder icon component should load before the newtab runtime'
);
assert.ok(
  newtabJs.includes('const NEWTAB_BOOKMARK_FOLDER_ICON =') &&
    newtabJs.includes('NEWTAB_BOOKMARK_FOLDER_ICON.getFigmaFolderSvg') &&
    !newtabJs.includes('function getFigmaFolderSvg(idSuffix)'),
  'newtab should consume the component instead of retaining an embedded implementation'
);

console.log('newtab bookmark folder icon tests passed');
