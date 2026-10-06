const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const folderIcon = require('../src/newtab/bookmark-folder-icon.js');
const { readPageSource } = require('./helpers/page-source');
const { readNewtabRuntimeSource } = require('./helpers/newtab-source');

const repoRoot = path.resolve(__dirname, '..');
const newtabHtml = readPageSource('newtab.html');
const newtabJs = readNewtabRuntimeSource();
assert.deepStrictEqual(folderIcon.normalizeFolderColorMap(JSON.parse('{"1":"#aabbcc", "2":"#FF0000", "3":"bad-value", "__proto__":"#ffffff", "invalid id":"#ffffff"}')), { '1': '#AABBCC', '2': '#FF0000' });

{
  // Two devices share folders through bookmark sync but not bookmark ids.
  const tree = (ids, options = {}) => {
    const work = { id: ids.work, parentId: '1', title: options.workTitle || 'Work', dateAdded: 1000, children: [
      { id: ids.dev, parentId: ids.work, title: 'Dev', dateAdded: 2000, children: [] }
    ] };
    const twins = [
      { id: ids.twinA, parentId: '1', title: 'Twin', dateAdded: 3000, children: [] },
      { id: ids.twinB, parentId: '1', title: 'Twin', dateAdded: 4000, children: [] }
    ];
    const bar = { id: '1', parentId: '0', title: 'Bookmarks bar', folderType: 'bookmarks-bar',
      children: options.moved ? twins : [work, ...twins] };
    const other = { id: '2', parentId: '0', title: 'Other', folderType: 'other',
      children: options.moved ? [{ ...work, parentId: '2' }] : [] };
    const top = { id: '0', title: '', children: [bar, other] };
    const map = new Map();
    const visit = (node) => { map.set(node.id, node); (node.children || []).forEach(visit); };
    visit(top);
    return map;
  };
  const deviceA = tree({ work: '10', dev: '11', twinA: '12', twinB: '13' });
  const deviceB = tree({ work: '90', dev: '91', twinA: '92', twinB: '93' });
  let refs = folderIcon.setFolderColorRef({}, '11', '#22c55e', deviceA);
  refs = folderIcon.setFolderColorRef(refs, '13', '#EF4444', deviceA);
  assert.deepStrictEqual(Object.values(refs), [{ color: '#22C55E', dateAdded: 2000 }, { color: '#EF4444', dateAdded: 4000 }]);
  assert(Object.keys(refs).every((ref) => /^[a-f0-9]{16}$/.test(ref)), 'synced keys never carry device bookmark ids');
  assert.deepStrictEqual(folderIcon.resolveFolderColors(refs, deviceB).colors, { '91': '#22C55E', '93': '#EF4444' },
    'another device resolves colors to its own ids, telling same-name siblings apart');
  assert.strictEqual(folderIcon.resolveFolderColors(refs, deviceB).changed, false);
  assert.strictEqual(folderIcon.setFolderColorRef(refs, 'missing', '#000000', deviceA), null);
  assert.deepStrictEqual(folderIcon.resolveFolderColors(folderIcon.setFolderColorRef(refs, '11', null, deviceA), deviceA).colors,
    { '13': '#EF4444' }, 'clearing a color removes the synced entry');

  const renamed = tree({ work: '90', dev: '91', twinA: '92', twinB: '93' }, { workTitle: 'Jobs', moved: true });
  const healed = folderIcon.resolveFolderColors(refs, renamed);
  assert.strictEqual(healed.changed, true, 'a renamed and moved folder is found again by its creation time');
  assert.deepStrictEqual(healed.colors, { '91': '#22C55E', '93': '#EF4444' });
  assert.deepStrictEqual(folderIcon.resolveFolderColors(healed.refs, renamed),
    { colors: healed.colors, refs: healed.refs, changed: false }, 'resolving again is stable, so it never loops writes');

  // Deleting the first of two same-name folders shifts the second into its path.
  const bothTwins = folderIcon.setFolderColorRef(refs, '12', '#8B5CF6', deviceA);
  const shifted = tree({ work: '90', dev: '91', twinA: '92', twinB: '93' });
  shifted.get('1').children = shifted.get('1').children.filter((node) => node.id !== '92');
  shifted.delete('92');
  const afterDelete = folderIcon.resolveFolderColors(bothTwins, shifted);
  assert.deepStrictEqual(afterDelete.colors, { '91': '#22C55E', '93': '#EF4444' },
    'the remaining twin keeps its own color instead of the deleted twin\'s');
  assert.strictEqual(Object.keys(afterDelete.refs).length, 2, 'the deleted twin\'s entry is dropped');

  // Without matching creation times the path still finds the folder.
  const undated = tree({ work: '90', dev: '91', twinA: '92', twinB: '93' });
  undated.forEach((node) => { node.dateAdded = 7; });
  const byPath = folderIcon.resolveFolderColors(refs, undated);
  assert.deepStrictEqual(byPath, { colors: { '91': '#22C55E', '93': '#EF4444' }, refs, changed: false });

  const legacy = folderIcon.importFolderColorMap({ '10': '#aabbcc', '11': '#000000', gone: '#FFFFFF' }, refs, deviceA);
  assert.deepStrictEqual(folderIcon.resolveFolderColors(legacy, deviceB).colors, { '90': '#AABBCC', '91': '#22C55E', '93': '#EF4444' },
    'legacy id-keyed colors migrate without replacing colors that already synced');

  const many = Object.fromEntries(Array.from({ length: folderIcon.MAX_FOLDER_COLOR_REFS + 5 }, (_, index) =>
    [index.toString(16).padStart(16, '0'), { color: '#123456', dateAdded: index + 1 }]));
  const capped = folderIcon.normalizeFolderColorRefs(many);
  assert.strictEqual(Object.keys(capped).length, folderIcon.MAX_FOLDER_COLOR_REFS, 'the newest entries are kept under the cap');
  assert(Buffer.byteLength(JSON.stringify(capped)) < 7680, 'a full map stays within the browser sync item quota');
  assert.deepStrictEqual(folderIcon.normalizeFolderColorRefs({ bad: { color: '#FFFFFF' }, ['a'.repeat(16)]: { color: 'nope' } }), {});
}

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
