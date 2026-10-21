const assert = require('assert');
const { JSDOM } = require('jsdom');
const { readStylesheet } = require('../helpers/css-tokens');
const { readPageSource } = require('../helpers/page-source');
const { parseCss } = require('../helpers/css-rules');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');

// How the highlighted search result looks: a background, not an outline or
// shadow, with a white tile behind a dark-theme favicon; and on the live
// surfaces, the row state the styles key off.

function pageCss(relativePath) {
  const doc = new JSDOM(readPageSource(relativePath)).window.document;
  return parseCss(Array.from(doc.querySelectorAll('style')).map((style) => style.textContent).join('\n'));
}

// The merged declarations for a selector, wherever it is listed.
function rule(css, selector) {
  const found = css.rule(selector);
  assert.ok(found, `missing CSS rule: ${selector}`);
  return found;
}

function testStylesheets() {
  const newtab = pageCss('newtab.html');
  const overlay = parseCss(readStylesheet('src/overlay/suggestions-view.css'));
  const overlayScope = ':is(#_x_extension_overlay_2024_unique_, #_x_extension_onboarding_overlay_demo_2026_unique_)';
  const overlayDark = ':is(#_x_extension_overlay_2024_unique_[data-theme="dark"], #_x_extension_onboarding_overlay_demo_2026_unique_[data-theme="dark"])';

  const newtabActive = rule(newtab, '.x-nt-suggestion-item[data-row-state="active"]');
  assert.match(newtabActive.get('background'), /var\(--x-nt-suggestion-active-bg/, 'the highlighted New Tab row should take its background');
  ['border', 'border-color', 'box-shadow'].forEach((property) => {
    assert.strictEqual(newtabActive.has(property), false, `the highlighted New Tab row should not add ${property}`);
  });
  const newtabRow = rule(newtab, '.x-nt-suggestion-item');
  assert.strictEqual(newtabRow.get('border'), '1px solid transparent', 'New Tab rows should reserve their border space');
  assert.match(newtabRow.get('transition'), /^background-color (0\.2s|200ms) ease$/, 'New Tab rows should animate only the background');

  const overlayRow = rule(overlay, `${overlayScope} .x-ov-suggestion-item`);
  assert.match(overlayRow.get('background'), /var\(--x-ov-suggestion-row-bg/, 'overlay rows should take their background from the row token');
  assert.strictEqual(overlayRow.get('border'), '1px solid transparent');
  assert.strictEqual(overlayRow.has('box-shadow'), false, 'overlay rows should not have a shadow');
  assert.match(overlayRow.get('transition'), /^background-color (0\.2s|200ms) ease$/, 'overlay rows should animate only the background');

  const faviconTile = '.x-ov-suggestion-item[data-row-state="active"] .x-ov-suggestion-icon-slot[data-favicon="true"]';
  assert.strictEqual(rule(overlay, `${overlayDark} ${faviconTile}`).get('background-color'), '#FFFFFF',
    'a highlighted dark-theme overlay favicon should sit on a white tile');
  assert.strictEqual(rule(newtab, 'body[data-theme="dark"] .x-nt-suggestion-item[data-row-state="active"] .x-nt-suggestion-icon-slot[data-favicon="true"]').get('background-color'), '#FFFFFF',
    'a highlighted dark-theme New Tab favicon should sit on a white tile');
}

const FAVICON = 'data:image/png;base64,iVBORw0KGgo=';
const RESULTS = Array.from({ length: 3 }, (_, index) => ({
  type: 'history', title: `Result ${index}`, url: `https://r${index}.test/`, favicon: index === 0 ? FAVICON : ''
}));

async function testRowState(name) {
  const surface = await openSearchSurface(name, {
    respond(message) {
      if (message.action === 'getSearchSuggestions') return { suggestions: RESULTS };
      if (message.action === 'getSearchEngineSuggestions') {
        return new Promise((resolve) => setTimeout(() => resolve({
          suggestions: (message.localSuggestions || []).concat([{ type: 'googleSuggest', title: 'result x', url: 'https://www.google.com/search?q=x' }]),
          hasRemoteSuggestions: true
        }), 150));
      }
      return undefined;
    }
  });
  await surface.type('result');
  await surface.settle(300);
  const rows = surface.suggestions();
  const markBg = (row) => row.style.getPropertyValue('--x-ext-mark-bg');
  assert.deepStrictEqual(rows.map((row) => row.getAttribute('data-last')), rows.map((_row, index) => String(index === rows.length - 1)),
    `${name}: only the final row should be marked last, after every render`);
  assert.deepStrictEqual(rows.map((row) => row.getAttribute('data-row-state')), ['active'].concat(rows.slice(1).map(() => null)),
    `${name}: the highlighted row should say so`);
  assert.notStrictEqual(markBg(rows[0]), markBg(rows[1]), `${name}: matches should be emphasised more in the highlighted row`);
  assert.deepStrictEqual(rows.slice(0, 2).map((row) => row.querySelector('[data-favicon]').getAttribute('data-favicon')), ['true', 'false'],
    `${name}: icon slots should say whether they hold a favicon`);

  surface.press('ArrowDown');
  await surface.settle(40);
  assert.deepStrictEqual(rows.slice(0, 2).map((row) => row.getAttribute('data-row-state')), [null, 'active'],
    `${name}: moving the highlight should clear it from the previous row`);
  assert.strictEqual(markBg(rows[0]), markBg(rows[2]), `${name}: and return its matches to the plain emphasis`);
  surface.close();
}

(async () => {
  testStylesheets();
  for (const name of SURFACES) {
    await testRowState(name);
  }
  console.log('search result highlight surface tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
