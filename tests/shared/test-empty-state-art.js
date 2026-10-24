const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  EMPTY_STATE_ART_NAMES,
  createEmptyStateArt,
  getEmptyStateArtMarkup
} = require('../../src/shared/ui/empty-state-art.js');

const { window } = new JSDOM('<!doctype html><body></body>');
const { document } = window;

function run() {
  ['blockedPage', 'noResults', 'noCommands', 'noTabs', 'emptyFolder', 'emptyList', 'loadFailed', 'nothing']
    .forEach((name) => assert.ok(EMPTY_STATE_ART_NAMES.includes(name), `${name} should be in the set`));

  EMPTY_STATE_ART_NAMES.forEach((name) => {
    const element = createEmptyStateArt(document, name, { id: 'art-test' });
    assert.equal(element.namespaceURI, 'http://www.w3.org/2000/svg', `${name} should be an SVG element`);
    assert.equal(element.getAttribute('class'), `lumno-empty-art lumno-empty-art--${name}`);
    assert.equal(element.getAttribute('aria-hidden'), 'true', `${name} should be decorative without a label`);
    assert.equal(element.getAttribute('data-theme'), 'auto');
    assert.equal(element.getAttribute('width'), '160');
    assert.equal(element.getAttribute('height'), '120');
    // No raster images, links or requests: the art must work in any page.
    assert.equal(element.querySelector('image, use, a, foreignObject'), null, `${name} should stay self-contained`);

    // Its pattern, shadows and colors are its own, scoped to its id.
    const style = element.querySelector('style').textContent;
    assert.ok(style.includes('#art-test[data-theme="dark"]'), `${name} should carry its dark palette`);
    assert.ok(!/[<&]/.test(style), `${name} style should be safe to inline as markup`);
    element.querySelectorAll('[filter], [fill^="url("]').forEach((node) => {
      const reference = (node.getAttribute('filter') || node.getAttribute('fill')).slice(5, -1);
      assert.ok(element.querySelector(`[id="${reference}"]`), `${name} should define ${reference} itself`);
    });

    // The markup builds the same drawing as the element.
    const holder = document.createElement('div');
    holder.innerHTML = getEmptyStateArtMarkup(name, { id: 'art-test' });
    holder.firstChild.removeAttribute('xmlns');
    assert.equal(holder.innerHTML, element.outerHTML, `${name} markup and element should match`);
  });

  // Two illustrations on one page never share ids.
  const first = createEmptyStateArt(document, 'noResults');
  const second = createEmptyStateArt(document, 'noResults');
  assert.notEqual(first.id, second.id);

  const labeled = createEmptyStateArt(document, 'blockedPage', { size: 200, theme: 'dark', label: 'Blocked <page>' });
  assert.equal(labeled.getAttribute('role'), 'img');
  assert.equal(labeled.getAttribute('aria-label'), 'Blocked <page>');
  assert.equal(labeled.getAttribute('aria-hidden'), null);
  assert.equal(labeled.getAttribute('data-theme'), 'dark');
  assert.equal(labeled.getAttribute('width'), '200');
  assert.equal(labeled.getAttribute('height'), '150');
  assert.ok(getEmptyStateArtMarkup('blockedPage', { label: 'a "b" <c>' }).includes('aria-label="a &quot;b&quot; &lt;c&gt;"'));
  assert.equal(createEmptyStateArt(document, 'nothing', { theme: 'sepia' }).getAttribute('data-theme'), 'auto');

  assert.throws(() => createEmptyStateArt(document, 'toString'), /Unknown empty-state art/);
  assert.throws(() => getEmptyStateArtMarkup('missing'), /Unknown empty-state art/);
}

run();
console.log('Empty-state art tests passed.');
