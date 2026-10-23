const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  EMPTY_STATE_ART_NAMES,
  EMPTY_STATE_ART_CSS,
  createEmptyStateArt,
  getEmptyStateArtMarkup
} = require('../../src/shared/ui/empty-state-art.js');

const { window } = new JSDOM('<!doctype html><body></body>');
const { document } = window;

function run() {
  ['blockedPage', 'noResults', 'noCommands', 'noTabs', 'emptyFolder', 'emptyList', 'loadFailed', 'nothing']
    .forEach((name) => assert.ok(EMPTY_STATE_ART_NAMES.includes(name), `${name} should be in the set`));

  EMPTY_STATE_ART_NAMES.forEach((name) => {
    const element = createEmptyStateArt(document, name);
    assert.equal(element.namespaceURI, 'http://www.w3.org/2000/svg', `${name} should be an SVG element`);
    assert.equal(element.getAttribute('class'), `lumno-empty-art lumno-empty-art--${name}`);
    assert.equal(element.getAttribute('aria-hidden'), 'true', `${name} should be decorative without a label`);
    assert.equal(element.getAttribute('width'), '120');
    assert.ok(element.childNodes.length > 2, `${name} should draw something`);
    // No raster images, links or requests: the art must work in any page.
    assert.equal(element.querySelector('image, use, a, foreignObject'), null, `${name} should stay self-contained`);

    // The markup builds the same drawing as the element.
    const holder = document.createElement('div');
    holder.innerHTML = getEmptyStateArtMarkup(name);
    holder.firstChild.removeAttribute('xmlns');
    assert.equal(holder.innerHTML, element.outerHTML, `${name} markup and element should match`);
  });

  const labeled = createEmptyStateArt(document, 'blockedPage', { size: 96, label: 'Blocked <page>' });
  assert.equal(labeled.getAttribute('role'), 'img');
  assert.equal(labeled.getAttribute('aria-label'), 'Blocked <page>');
  assert.equal(labeled.getAttribute('aria-hidden'), null);
  assert.equal(labeled.getAttribute('height'), '96');
  assert.ok(getEmptyStateArtMarkup('blockedPage', { label: 'a "b" <c>' }).includes('aria-label="a &quot;b&quot; &lt;c>"'));

  assert.throws(() => createEmptyStateArt(document, 'toString'), /Unknown empty-state art/);
  assert.throws(() => getEmptyStateArtMarkup('missing'), /Unknown empty-state art/);

  // The accent is the one colored layer and can be re-pointed per surface.
  assert.match(EMPTY_STATE_ART_CSS, /\.lumno-empty-art__accent \{ fill: var\(--lumno-art-accent/);
  assert.equal(
    getEmptyStateArtMarkup('blockedPage').match(/fill="#4d7dcb"/g).length,
    1,
    'blockedPage should have a single accent'
  );
}

run();
console.log('Empty-state art tests passed.');
