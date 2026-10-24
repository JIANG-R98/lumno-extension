const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  EMPTY_STATE_ART_CSS,
  EMPTY_STATE_ART_NAMES,
  createEmptyStateArt,
  ensureEmptyStateArtStyles,
  followEmptyStateArtTheme,
  getEmptyStateArtMarkup,
  resolveEmptyStateArtTheme
} = require('../../src/shared/ui/empty-state-art.ts');

const { window } = new JSDOM('<!doctype html><head></head><body></body>');
const { document } = window;

function testDrawings() {
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
    // No raster images, links or requests, and no text of its own: the
    // words around it stay the only text in an empty state.
    assert.equal(element.querySelector('image, use, a, foreignObject, style, text'), null, `${name} should stay self-contained`);
    assert.equal(element.textContent, '', `${name} should add no text`);
    // Without the stylesheet it still draws, in the light palette.
    element.querySelectorAll('[class^="p-"]').forEach((node) => {
      assert.ok(node.hasAttribute('fill') || node.hasAttribute('stroke') || node.hasAttribute('stop-color') || node.hasAttribute('flood-color'),
        `${name}: ${node.getAttribute('class')} should carry its light colors`);
    });
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
  assert.notEqual(createEmptyStateArt(document, 'noResults').id, createEmptyStateArt(document, 'noResults').id);

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

function testStylesheet() {
  assert.ok(EMPTY_STATE_ART_CSS.includes('.lumno-empty-art[data-theme="dark"]'), 'the stylesheet should carry the dark palette');
  assert.ok(EMPTY_STATE_ART_CSS.includes('var(--lumno-art-accent, #3462ad)'), 'the accent should be re-pointable');

  const detached = createEmptyStateArt(document, 'noResults');
  assert.equal(ensureEmptyStateArtStyles(detached), false, 'a detached illustration has nowhere to put styles');

  document.body.append(createEmptyStateArt(document, 'noResults'), createEmptyStateArt(document, 'emptyFolder'));
  document.body.querySelectorAll('svg').forEach((svg) => assert.equal(ensureEmptyStateArtStyles(svg), true));
  assert.equal(document.head.querySelectorAll('style[data-lumno-empty-art-style]').length, 1, 'a document gets the stylesheet once');

  const host = document.createElement('div');
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const inShadow = createEmptyStateArt(document, 'blockedPage');
  shadow.appendChild(inShadow);
  ensureEmptyStateArtStyles(inShadow);
  ensureEmptyStateArtStyles(inShadow);
  assert.equal(shadow.querySelectorAll('style[data-lumno-empty-art-style]').length, 1, 'a shadow root gets its own copy once');
}

async function testTheme() {
  document.body.innerHTML = `
    <div data-theme="dark"><span id="dark"></span>
      <div data-glass-ink-theme="dark" data-theme="light"><span id="glass"></span></div>
      <div data-wallpaper-ink="dark"><span id="ink"></span></div>
    </div>
    <span id="none"></span>`;
  const byId = (id) => document.getElementById(id);
  assert.equal(resolveEmptyStateArtTheme(byId('dark')), 'dark');
  assert.equal(resolveEmptyStateArtTheme(byId('glass')), 'dark', 'a glass panel inked for a dark wallpaper takes the dark art');
  assert.equal(resolveEmptyStateArtTheme(byId('ink')), 'dark', 'wallpaper ink counts only while a wallpaper is on');
  assert.equal(resolveEmptyStateArtTheme(byId('none')), 'auto');
  document.body.setAttribute('data-wallpaper-active', 'true');
  assert.equal(resolveEmptyStateArtTheme(byId('ink')), 'light', 'dark ink means a light wallpaper, so light art');

  const svg = createEmptyStateArt(document, 'emptyFolder');
  byId('ink').appendChild(svg);
  const stop = followEmptyStateArtTheme(svg);
  assert.equal(svg.getAttribute('data-theme'), 'light');
  byId('ink').parentElement.setAttribute('data-wallpaper-ink', 'light');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(svg.getAttribute('data-theme'), 'dark', 'a new wallpaper ink should restyle the art');
  stop();
  byId('ink').parentElement.setAttribute('data-wallpaper-ink', 'dark');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(svg.getAttribute('data-theme'), 'dark', 'a stopped follower should leave the art alone');
}

(async () => {
  testDrawings();
  testStylesheet();
  await testTheme();
  console.log('Empty-state art tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
