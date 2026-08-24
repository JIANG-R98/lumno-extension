const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const folderIcon = require('../src/newtab/bookmark-folder-icon.js');

const repoRoot = path.resolve(__dirname, '..');
const newtabHtml = fs.readFileSync(path.join(repoRoot, 'newtab.html'), 'utf8');
const newtabJs = fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.js'), 'utf8');

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
