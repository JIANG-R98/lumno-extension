const assert = require('assert');
const fs = require('fs');

delete globalThis.LumnoSuggestionsHeightLayout;
require('../src/shared/suggestions-height-layout.js');

const runtime = globalThis.LumnoSuggestionsHeightLayout;
const newtabHtml = fs.readFileSync('newtab.html', 'utf8');
const newtabLayoutSource = fs.readFileSync('src/newtab/layout.js', 'utf8');
const overlaySource = fs.readFileSync('src/overlay/search-panel.js', 'utf8');
const backgroundSource = fs.readFileSync('src/background/background.js', 'utf8');

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

const helperScriptIndex = newtabHtml.indexOf(
  '<script src="../shared/suggestions-height-layout.js"></script>'
);
assert.ok(
  helperScriptIndex >= 0 &&
    helperScriptIndex < newtabHtml.indexOf('<script src="layout.js"></script>') &&
    helperScriptIndex < newtabHtml.indexOf('data-page-entry="../newtab/newtab.js"'),
  'New Tab should load the shared height policy before its layout and page runtimes'
);
assert.ok(
  backgroundSource.indexOf("'src/shared/suggestions-height-layout.js'") >= 0 &&
    backgroundSource.indexOf("'src/shared/suggestions-height-layout.js'") <
      backgroundSource.indexOf("'src/overlay/search-panel.js'"),
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
