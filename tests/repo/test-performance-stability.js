const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const settings = require('../../src/domain/settings/index.ts');
const { parseCss, parsePageCss } = require('../helpers/css-rules');
const { createNewtabPage } = require('../helpers/newtab-page');
const { createOptionsPage } = require('../helpers/options-page');
const { openSearchSurface } = require('../helpers/search-surfaces');

// Work the pages coalesce or avoid: one resize listener in Settings, one
// reload for a burst of external changes, motion without paint-heavy
// filters, and markup that reserves image space. (The segmented indicator's
// measurement is in src/shared/react/segmented-indicator.test.ts.)

const repoRoot = path.resolve(__dirname, '..', '..');

async function testOptionsResize() {
  let resizeListeners = 0;
  const page = await createOptionsPage({
    setup(window) {
      const add = window.addEventListener.bind(window);
      window.addEventListener = (type, ...rest) => {
        if (type === 'resize') resizeListeners += 1;
        return add(type, ...rest);
      };
    }
  });
  await page.settle(300);
  assert.strictEqual(resizeListeners, 1, 'options should use one coordinated resize listener');
  page.close();
}

async function testNewTab() {
  const historySearches = [];
  const keyframes = [];
  const page = await createNewtabPage({
    darkSystem: true,
    sync: {
      [settings.recentCount.key]: 8,
      [settings.recentMode.key]: 'latest',
      _x_extension_motion_effects_enabled_2026_unique_: true
    },
    history: [{ url: 'https://a.example/', title: 'A', lastVisitTime: Date.now(), visitCount: 2 }],
    bookmarks: Array.from({ length: 30 }, (_, index) => ({ id: `b${index}`, title: `B${index}`, url: `https://b${index}.example/` })),
    setup(window) {
      const search = window.chrome.history.search;
      window.chrome.history.search = (query, callback) => {
        historySearches.push(query);
        return search(query, callback);
      };
      const animate = window.Element.prototype.animate;
      window.Element.prototype.animate = function(frames, timing) {
        keyframes.push(JSON.stringify(frames));
        return animate ? animate.call(this, frames, timing) : { finished: Promise.resolve(), cancel() {}, addEventListener() {} };
      };
    }
  });
  await page.settle(500);
  assert.strictEqual(page.document.documentElement.style.colorScheme, 'dark', 'new tab should synchronize native controls with the resolved theme');

  const loads = historySearches.length;
  for (let index = 0; index < 5; index += 1) page.historyVisited.dispatch({ url: `https://visit-${index}.example/` });
  await page.settle(400);
  assert.strictEqual(historySearches.length - loads, 1, 'recent-site external changes should be debounced');

  keyframes.length = 0;
  page.click(page.document.querySelector('.x-nt-bookmarks-pager-btn[aria-label="Next page"]'));
  await page.settle(300);
  assert.ok(keyframes.length > 0, 'bookmark paging should animate');
  assert.ok(keyframes.every((frames) => !/filter|blur\(/.test(frames)),
    'bookmark paging should animate compositor-friendly transform and opacity only');
  page.close();
}

// With the extension runtime gone for remote suggestions, New Tab still
// shows the local results it has.
async function testSuggestionsWithoutRemoteRuntime() {
  const surface = await openSearchSurface('newtab', {
    respond: (message) => (message.action === 'getSearchSuggestions'
      ? { suggestions: [{ type: 'history', url: 'https://local.example/', title: 'Local result' }] }
      : undefined),
    setup(window) {
      const send = window.chrome.runtime.sendMessage;
      window.chrome.runtime.sendMessage = (message, callback) => {
        if (message && message.action === 'getSearchEngineSuggestions') throw new Error('Extension context invalidated.');
        return send(message, callback);
      };
    }
  });
  await surface.settle(150);
  await surface.type('local');
  await surface.settle(300);
  assert.ok(surface.suggestions().some((row) => row.textContent.includes('Local result')),
    'new tab suggestions should keep local results when the extension runtime is unavailable');
  surface.close();
}

function testStyles() {
  const overlayCss = parseCss(fs.readFileSync(path.join(repoRoot, 'src/overlay/suggestions-view.css'), 'utf8'));
  const row = overlayCss.rule(':is(#_x_extension_overlay_2024_unique_, #_x_extension_onboarding_overlay_demo_2026_unique_) .x-ov-suggestion-item');
  assert.ok(row && row.get('content-visibility') === 'auto' && row.has('contain-intrinsic-block-size'),
    'off-screen overlay result rows should skip unnecessary layout and paint work');
  assert.ok(!overlayCss.entries.some((entry) => entry.selectors.some((selector) => /data-favicon-load-state="(?:priming|loaded)"\]/.test(selector)) &&
    /blur/.test(entry.style.getPropertyValue('filter'))), 'favicon entry motion should not animate paint-heavy blur filters');

  const optionsCss = parsePageCss('src/options/options.html');
  assert.ok(optionsCss.rule('._x_extension_toggle_2024_unique_ input:focus-visible').has('outline'),
    'custom settings toggles should retain a visible keyboard focus indicator');
  assert.strictEqual(optionsCss.rule('#_x_extension_settings_tabs_2024_unique_').get('overflow-x'), 'auto');
  assert.strictEqual(optionsCss.rule('._x_extension_settings_tab_button_2024_unique_').get('white-space'), 'nowrap',
    'settings tabs should scroll horizontally instead of wrapping labels at every width');

  const panel = parsePageCss('newtab.html').entries.filter((entry) => entry.selectors.includes('.x-nt-wallpaper-panel'));
  assert.ok(panel.length > 0 && panel.every((entry) => !entry.style.getPropertyValue('filter') &&
    !/filter/.test(entry.style.getPropertyValue('will-change'))),
  'wallpaper panel entry should avoid animating a full-surface blur filter');
}

function testMarkup() {
  ['newtab.html', 'src/options/options.html', 'src/onboarding/onboarding.html'].forEach((relativePath) => {
    const doc = new JSDOM(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')).window.document;
    assert.ok(doc.querySelector('meta[name="theme-color"]'), `${relativePath} should define a theme color`);
    doc.querySelectorAll('img').forEach((image) => {
      assert.ok(image.hasAttribute('width') && image.hasAttribute('height'), `${relativePath} image should define its size: ${image.outerHTML}`);
    });
  });
}

(async () => {
  testStyles();
  testMarkup();
  await testOptionsResize();
  await testNewTab();
  await testSuggestionsWithoutRemoteRuntime();
  console.log('performance and style stability tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
