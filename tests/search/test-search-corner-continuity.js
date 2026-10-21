const assert = require('assert');
const { JSDOM } = require('jsdom');
const { readPageSource } = require('../helpers/page-source');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss } = require('../helpers/css-rules');
const { openSearchSurface } = require('../helpers/search-surfaces');

// The search shells are rounded rectangles with continuous (superellipse)
// corners, and the radii nest: each inner surface's radius is the outer one
// minus the space between them. Read from the stylesheets as the browser
// parses them, and from the live overlay where its styles are inline.

function pageCss(relativePath) {
  const doc = new JSDOM(readPageSource(relativePath)).window.document;
  return parseCss(Array.from(doc.querySelectorAll('style')).map((style) => style.textContent).join('\n'));
}

// Each selector's corner-shape, as its last declaring rule (in any @supports
// block) leaves it, with " !important" when it has that priority.
function cornerShapes(css) {
  const shapes = new Map();
  css.entries.forEach((entry) => {
    const value = entry.style.getPropertyValue('corner-shape');
    if (!value) return;
    const priority = entry.style.getPropertyPriority('corner-shape');
    entry.selectors.forEach((selector) => shapes.set(selector, priority ? `${value} !${priority}` : value));
  });
  return shapes;
}

// A custom property's value where it is first declared.
function token(css, name) {
  const entry = css.entries.find((item) => item.style.getPropertyValue(name));
  assert.ok(entry, `missing ${name}`);
  return entry.style.getPropertyValue(name).replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

function px(css, name) {
  const match = token(css, name).match(/^(\d+)px$/);
  assert.ok(match, `${name} should be a pixel length`);
  return Number(match[1]);
}

const CONTINUOUS = 'superellipse(1.25)';

function testNewTab() {
  const css = pageCss('newtab.html');
  const outer = px(css, '--x-nt-search-shell-radius');
  const resting = px(css, '--x-nt-search-resting-radius');
  const border = px(css, '--x-nt-search-shell-border-width');
  const padding = px(css, '--x-nt-search-shell-padding');
  const inset = px(css, '--x-nt-search-results-padding-inline');
  // New Tab matches the overlay: a rounded rectangle, not a capsule.
  assert.equal(outer, 26);
  assert.equal(resting, outer);
  assert.ok(outer < 56 / 2);
  assert.equal(outer - border - padding, 21);
  assert.equal(outer - border - padding - inset, 13);
  assert.equal(token(css, '--x-nt-search-content-radius'), 'calc(var(--x-nt-search-shell-radius) - var(--x-nt-search-content-inset))');
  assert.equal(token(css, '--x-nt-search-result-radius'), 'calc(var(--x-nt-search-content-radius) - var(--x-nt-search-results-padding-inline))');
  assert.equal(token(css, '--x-nt-search-resting-content-radius'), 'calc(var(--x-nt-search-resting-radius) - var(--x-nt-search-content-inset))');
  assert.equal(css.rule('body[data-nt-suggestions-open="true"] #_x_extension_newtab_search_layer_2024_unique_').get('border-radius'),
    'var(--x-nt-search-resting-content-radius, 21px) var(--x-nt-search-resting-content-radius, 21px) 0 0',
    'the open search layer keeps its top corners and joins the panel below');
  ['#_x_extension_newtab_suggestions_surface_2026_unique_', '#_x_extension_newtab_suggestions_outline_2026_unique_'].forEach((selector) => {
    assert.equal(css.rule(selector).get('border-radius'),
      'var(--x-nt-search-resting-radius, 26px) var(--x-nt-search-resting-radius, 26px) var(--x-nt-search-shell-radius, 26px) var(--x-nt-search-shell-radius, 26px)',
      `${selector} should follow the shell's corners`);
  });
  assert.equal(css.rule('.x-nt-suggestion-item').get('border-radius'), 'var(--x-nt-search-result-radius, 13px)');
  const shapes = cornerShapes(css);
  [
    '#_x_extension_newtab_root_2024_unique_',
    '#_x_extension_newtab_search_layer_2024_unique_',
    '#_x_extension_newtab_suggestions_surface_2026_unique_',
    '#_x_extension_newtab_suggestions_outline_2026_unique_',
    '#_x_extension_newtab_suggestions_container_2024_unique_',
    '.x-nt-suggestion-item'
  ].forEach((selector) => assert.equal(shapes.get(selector), CONTINUOUS, `${selector} should have continuous corners`));
  assert.equal(shapes.get('.x-nt-suggestion-visit-button'), 'round', 'capsule buttons stay round');
}

async function testOverlay() {
  const css = parseCss(readStylesheet('src/overlay/suggestions-view.css'));
  const border = px(css, '--x-ov-panel-border-width');
  const inset = px(css, '--x-ov-results-inset');
  assert.equal(token(css, '--x-ov-content-radius'), 'calc(var(--x-ov-panel-radius, 26px) - var(--x-ov-panel-border-width))');
  assert.equal(token(css, '--x-ov-result-radius'), 'calc(var(--x-ov-content-radius) - var(--x-ov-results-inset))');
  const scope = ':is(#_x_extension_overlay_2024_unique_, #_x_extension_onboarding_overlay_demo_2026_unique_)';
  assert.equal(css.rule(`${scope} .x-ov-suggestion-item`).get('border-radius'), 'var(--x-ov-result-radius, 13px)');
  const shapes = cornerShapes(css);
  ['.x-ov-suggestions-container', '.x-ov-close-other-tabs', '.x-ov-suggestion-item', '.x-ov-action-tag'].forEach((part) => {
    assert.equal(shapes.get(`${scope} ${part}`), CONTINUOUS, `${part} should have continuous corners`);
  });
  assert.equal(shapes.get(`${scope} .x-ov-suggestion-visit-button`), 'round');

  const surface = await openSearchSurface('overlay');
  const panel = surface.root.getElementById('_x_extension_overlay_2024_unique_');
  const radius = Number(panel.style.getPropertyValue('border-radius').match(/(\d+)px\)$/)[1]);
  // The single-row overlay (a 56px input inside its border) must read as a
  // rounded rectangle, not a capsule, with the same radius as New Tab.
  assert.equal(radius, 26);
  assert.ok(radius < (56 + border * 2) / 2 - 2);
  assert.equal(radius - border, 25);
  assert.equal(radius - border - inset, 13);
  const input = surface.root.getElementById('_x_extension_input_container_2024_unique_');
  assert.match(input.style.getPropertyValue('border-radius'), /^var\(--x-ov-content-radius, 25px\)/, 'the input follows the panel corners');
  // Its base styles reset with `all: unset`, so the shape has to travel inline.
  assert.equal(input.style.getPropertyValue('corner-shape'), CONTINUOUS, 'the overlay input should keep continuous corners');
  surface.close();
}

function testSharedInput() {
  const css = parseCss(readStylesheet('src/shared/search/search-input.css'));
  assert.ok(css.entries.some((entry) => entry.style.getPropertyValue('border-radius').replace(/\s+/g, ' ') === 'var(--x-ext-search-input-corners, 28px 28px 0 0)'),
    'the shared input takes its corners from the surface');
  const shapes = cornerShapes(css);
  assert.equal(shapes.get('.x-lumno-search-input'), undefined, 'the input keeps its own shape');
  assert.equal(shapes.get('.x-lumno-search-input__container'), undefined);
  assert.equal(shapes.get('.x-lumno-search-input__right-icon'), `${CONTINUOUS} !important`);
  assert.equal(shapes.get('.x-lumno-search-input__icon[data-search-scope-action="true"]'), `${CONTINUOUS} !important`);
  assert.equal(shapes.get('.x-lumno-search-input-mode__menu'), CONTINUOUS);
  // Mode menu parts reset with `all: unset !important`, so their shape must
  // come last and match that priority.
  const last = css.entries[css.entries.length - 1];
  assert.deepStrictEqual([last.selectors, last.style.getPropertyValue('corner-shape'), last.style.getPropertyPriority('corner-shape')],
    [['.x-lumno-search-input-mode__menu-item', '.x-lumno-search-input-mode__menu-footer-key'], CONTINUOUS, 'important']);
}

function testOnboardingMirrors() {
  const css = pageCss('src/onboarding/onboarding.html');
  const viewport = css.rule('.newtab-preview-viewport');
  assert.equal(viewport.get('--x-nt-search-shell-radius'), '26px');
  assert.match(viewport.get('--x-nt-search-content-radius'), /^calc\(/);
  assert.match(viewport.get('--x-nt-search-result-radius'), /^calc\(/);
  const shapes = cornerShapes(css);
  [
    '.lumno-overlay-panel',
    '.site-search-demo-card',
    '.newtab-preview-viewport #_x_extension_newtab_root_2024_unique_',
    '.site-search-demo-result',
    '.newtab-preview-viewport #_x_extension_newtab_suggestions_surface_2026_unique_'
  ].forEach((selector) => assert.equal(shapes.get(selector), CONTINUOUS, `${selector} should mirror the real surfaces`));
}

(async () => {
  testNewTab();
  await testOverlay();
  testSharedInput();
  testOnboardingMirrors();
  console.log('Search corner continuity checks passed.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
