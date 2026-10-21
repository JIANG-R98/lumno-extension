const assert = require('assert');
const fs = require('fs');
const { readOverlayPanelSource } = require('../helpers/overlay-source');
const { getInjectedScripts, getPageScripts, runsBefore } = require('../helpers/runtime-scripts');

delete LumnoSuggestionsHeightLayout;
const LumnoSuggestionsHeightLayout = require('../../src/shared/search/suggestions-height-layout.js');

const runtime = LumnoSuggestionsHeightLayout;
const newtabLayoutSource = fs.readFileSync('src/newtab/layout.js', 'utf8');
const overlaySource = readOverlayPanelSource();

assert.ok(
  runtime && typeof runtime.applyNaturalSuggestionsHeightLayout === 'function',
  'the shared suggestions height runtime should be available'
);

const attributes = new Map([
  ['data-height-clipped', 'true'],
  ['data-input-height-locked', 'true'],
  ['data-resizing', 'true']
]);
const styles = new Map([
  ['flex', { value: '0 0 auto', priority: 'important' }],
  ['height', { value: '580px', priority: 'important' }],
  ['overflow-y', { value: 'hidden', priority: 'important' }],
  ['padding-top', { value: '12px', priority: 'important' }],
  ['transition', { value: 'height 180ms ease-in-out', priority: 'important' }],
  ['will-change', { value: 'height', priority: 'important' }],
  ['max-height', { value: '420px', priority: '' }]
]);
const container = {
  removeAttribute(name) {
    attributes.delete(name);
  },
  style: {
    removeProperty(name) {
      styles.delete(name);
    },
    setProperty(name, value, priority) {
      styles.set(name, { value, priority: priority || '' });
    }
  }
};

assert.strictEqual(runtime.applyNaturalSuggestionsHeightLayout(container), true);
assert.strictEqual(attributes.size, 0, 'legacy height-state attributes should be cleared');
['flex', 'height', 'overflow-y', 'padding-top', 'will-change'].forEach((property) => {
  assert.strictEqual(styles.has(property), false, `${property} should not constrain natural height`);
});
assert.deepStrictEqual(
  styles.get('transition'),
  { value: 'none', priority: 'important' },
  'surface result height transitions should be explicitly disabled'
);
assert.deepStrictEqual(
  styles.get('max-height'),
  { value: '420px', priority: '' },
  'viewport and scope-menu safety caps should remain intact'
);
assert.strictEqual(runtime.applyNaturalSuggestionsHeightLayout(null), false);

assert.ok(
  runsBefore(getPageScripts('newtab.html'), 'src/shared/search/suggestions-height-layout.js', 'src/newtab/layout.js') &&
    runsBefore(getPageScripts('newtab.html'), 'src/shared/search/suggestions-height-layout.js', 'src/newtab/newtab.js'),
  'New Tab should load the shared height policy before its layout and page runtimes'
);
assert.ok(
  runsBefore(getInjectedScripts('overlay'), 'src/shared/search/suggestions-height-layout.js', 'src/overlay/search-panel.js'),
  'Overlay injection should load the shared height policy before the panel runtime'
);
[newtabLayoutSource, overlaySource].forEach((source, index) => {
  assert.match(
    source,
    /SUGGESTIONS_HEIGHT_LAYOUT\.applyNaturalSuggestionsHeightLayout\(/,
    `${index === 0 ? 'New Tab' : 'Overlay'} should use the shared height policy`
  );
});

console.log('shared suggestions natural-height layout tests passed');
