const assert = require('assert');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss } = require('../helpers/css-rules');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

// Scrolling over the real overlay must not scroll the page behind it, while
// a result list that can scroll keeps scrolling.

function wheel(page, target) {
  const event = new page.window.WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(event);
  return event;
}

async function run() {
  const page = await createOverlayPage({
    respond(message) {
      if (message.action === 'getSearchSuggestions') {
        return { suggestions: Array.from({ length: 8 }, (_value, index) => ({ type: 'history', title: `Result ${index}`, url: `https://r${index}.test/` })) };
      }
      return undefined;
    }
  });
  const root = await page.open();
  const pageWheels = [];
  page.document.addEventListener('wheel', () => pageWheels.push('document'));
  const overlay = root.getElementById('_x_extension_overlay_2024_unique_');

  const overInput = wheel(page, page.input());
  assert.strictEqual(overInput.defaultPrevented, true, 'a wheel over the overlay should not scroll the page');
  assert.deepStrictEqual(pageWheels, [], 'the page should not hear a wheel over the overlay');

  await page.type('result');
  await page.waitFor(() => page.suggestions().length > 3, 'results should render');
  const list = root.querySelector('.x-ov-suggestions-container');
  // JSDOM neither loads the overlay's stylesheet nor lays out: give the list
  // the overflow and sizes a real one has once its rows overflow.
  list.style.overflowY = 'auto';
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 900 });
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
  list.scrollTop = 100;
  const overList = wheel(page, page.suggestions()[2]);
  assert.strictEqual(overList.defaultPrevented, false, 'a result list with room to scroll should scroll natively');
  assert.deepStrictEqual(pageWheels, [], 'its wheel should still stay out of the page');

  list.scrollTop = 600;
  assert.strictEqual(wheel(page, page.suggestions()[2]).defaultPrevented, true,
    'at the end of the list the wheel should stop instead of chaining to the page');
  assert.ok(overlay);

  page.press('Escape');
  await page.settle(30);
  const afterClose = wheel(page, page.document.body);
  assert.strictEqual(afterClose.defaultPrevented, false, 'once closed, the overlay should leave page scrolling alone');
  page.close();

  const css = parseCss(readStylesheet('src/overlay/suggestions-view.css'));
  assert.ok(css.entries.some((entry) => entry.selectors.some((selector) => selector.endsWith('.x-ov-suggestions-container')) &&
    entry.style.getPropertyValue('overscroll-behavior') === 'contain'),
  'the result list should contain scroll chaining');
}

run().then(() => {
  console.log('overlay wheel isolation tests passed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
