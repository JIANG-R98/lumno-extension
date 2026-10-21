const assert = require('assert');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss } = require('../helpers/css-rules');
const { createOverlayPage, bundledSiteSearchProviders } = require('../helpers/overlay-runtime-harness');

// The first tagged site-search result moves into place while the scope menu
// is open beneath it, once, and releases its animation state afterwards.

const ENTER_ANIMATION = '_x_ov_scope_result_enter_2026_unique_';

async function run() {
  const page = await createOverlayPage({ stylesheetsLoad: true });
  const root = await page.open({ siteSearchProviders: bundledSiteSearchProviders() });
  const results = root.querySelector('.x-ov-suggestions-container');
  root.querySelector('[data-search-scope-action="true"]').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await page.waitFor(() => root.querySelector('[data-mode-id="provider:yt"]'), 'the scope menu should open');
  assert.strictEqual(results.getAttribute('data-scope-result-enter'), null);
  await page.type('cats');
  await page.waitFor(() => page.suggestions().some((row) => (row._xSuggestion || {}).type === 'siteSearch'), 'the tagged result should render');
  assert.strictEqual(results.getAttribute('data-scope-result-enter'), 'run', 'the first tagged result should move in under the open menu');

  const otherEnd = new page.window.Event('animationend', { bubbles: true });
  Object.defineProperty(otherEnd, 'animationName', { value: 'something-else' });
  results.dispatchEvent(otherEnd);
  assert.strictEqual(results.getAttribute('data-scope-result-enter'), 'run', 'another animation ending should not count');
  const end = new page.window.Event('animationend', { bubbles: true });
  Object.defineProperty(end, 'animationName', { value: ENTER_ANIMATION });
  results.dispatchEvent(end);
  assert.strictEqual(results.getAttribute('data-scope-result-enter'), 'done', 'the motion should release its state once finished');

  page.press('Escape');
  await page.settle(30);
  await page.type('dogs');
  await page.settle(80);
  assert.notStrictEqual(results.getAttribute('data-scope-result-enter'), 'run', 'without the menu open there is no motion');
  page.close();

  const css = parseCss(readStylesheet('src/overlay/suggestions-view.css'));
  const running = css.entries.find((entry) => entry.conditions.length === 0 &&
    entry.selectors.some((selector) => selector.includes('[data-scope-result-enter="run"]')) && entry.style.getPropertyValue('animation'));
  assert.ok(running, 'the running state should play the entrance');
  assert.match(running.style.getPropertyValue('animation'), new RegExp(`${ENTER_ANIMATION} 180ms ease-in-out both`),
    'the tagged result should reuse the lower panel timing');
  const frames = css.keyframes(ENTER_ANIMATION);
  assert.match(frames['0%'].getPropertyValue('transform'), /translateY\(8px\)/);
  assert.match(frames['100%'].getPropertyValue('transform'), /translateY\(0\)/);
  const reduced = css.entries.find((entry) => entry.conditions.some((condition) => /prefers-reduced-motion/.test(condition)) &&
    entry.selectors.some((selector) => selector.includes('[data-scope-result-enter="run"]')));
  assert.deepStrictEqual(reduced && [reduced.style.getPropertyValue('animation'), reduced.style.getPropertyValue('transform')], ['none', 'none'],
    'the motion should respect reduced motion');
}

run().then(() => {
  console.log('overlay scope result motion tests passed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
