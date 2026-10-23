const assert = require('assert');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

// Reader extensions such as SimpRead hide the page body and mount their
// reading surface under <html>; the overlay must stay visible there, and
// inside the fullscreen element when one is showing.

async function testReaderModeMountsOutsideTheHiddenBody() {
  const page = await createOverlayPage({
    html: '<!doctype html><html><head></head><body class="simpread-hidden" style="display: none"><p>Article</p></body></html>'
  });
  await page.open();
  const host = page.host();
  assert.strictEqual(host.parentNode, page.document.documentElement,
    'reader mode should mount the overlay outside a hidden body');
  assert.strictEqual(page.document.body.contains(host), false,
    'the hidden reader-mode body must not contain the overlay host');
  page.close();
}

async function testFullscreenKeepsTheOverlayInsideTheFullscreenElement() {
  let fullscreen = null;
  const page = await createOverlayPage({
    setup(window) {
      fullscreen = window.document.createElement('section');
      window.document.body.appendChild(fullscreen);
      Object.defineProperty(window.document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
    }
  });
  await page.open();
  assert.strictEqual(page.host().parentNode, fullscreen,
    'fullscreen mode should keep the overlay inside the fullscreen subtree');
  page.close();
}

(async () => {
  await testReaderModeMountsOutsideTheHiddenBody();
  await testFullscreenKeepsTheOverlayInsideTheFullscreenElement();
  console.log('overlay reader-mode mount tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
