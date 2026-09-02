const assert = require('assert');
const { JSDOM } = require('jsdom');
const feedback = require('../src/content/pinned-recent-update-feedback.js');

const dom = new JSDOM('<!doctype html><html><body><button id="origin">Open</button></body></html>', {
  pretendToBeVisual: true,
  url: 'https://example.com/'
});
const listeners = [];
const undoRequests = [];
let undoResponse = {
  ok: true,
  reason: 'undone',
  previous: { title: 'New episode', url: 'https://example.com/new' },
  current: { title: 'Old episode', url: 'https://example.com/old' }
};
const chromeApi = {
  i18n: { getMessage: () => '' },
  runtime: {
    lastError: null,
    getURL(pathname) { return `chrome-extension://test${pathname}`; },
    onMessage: { addListener(listener) { listeners.push(listener); } },
    sendMessage(message, callback) {
      undoRequests.push(message);
      callback(undoResponse);
    }
  }
};

async function run() {
  dom.window.document.getElementById('origin').focus();
  feedback.attach({
    windowObj: dom.window,
    chromeApi,
    previewTimings: { instant: true },
    undoFadeDelay: 10
  });
  assert.strictEqual(listeners.length, 1);

  listeners[0]({
    action: feedback.ACTION,
    ok: true,
    reason: 'updated',
    cardId: 'card-1',
    previous: { title: 'Old episode', url: 'https://example.com/old' },
    current: { title: 'New episode', url: 'https://example.com/new' }
  });
  const host = dom.window.document.getElementById(feedback.HOST_ID);
  const surface = host.shadowRoot.querySelector('.surface');
  assert.strictEqual(surface.dataset.phase, 'success');
  assert.strictEqual(surface.dataset.visualVariant, 'homepage-card');
  assert.strictEqual(surface.dataset.celebrate, 'true');
  assert.strictEqual(surface.querySelector('.incoming-title').textContent, 'New episode');
  assert.strictEqual(surface.querySelector('.incoming-status').textContent, 'Updated');
  assert.strictEqual(surface.querySelector('.primary').textContent, 'Undo current update');
  assert.strictEqual(surface.querySelector('.secondary').textContent, 'Close');
  assert.ok(
    surface.querySelector('.incoming-inner > .incoming-status-badges > .incoming-status'),
    'the updated badge should use the same top-right slot as the New Tab card'
  );
  assert.match(
    surface.querySelector('.incoming-favicon').src,
    /_favicon\/\?pageUrl=https%3A%2F%2Fexample\.com%2Fnew&size=32$/,
    'the formal card should use Chrome favicon rendering instead of a generated letter tile'
  );
  assert.strictEqual(surface.querySelector('.incoming-icon').getAttribute('aria-hidden'), 'true');

  undoResponse = { ok: false, reason: 'source-changed' };
  surface.querySelector('.primary').click();
  assert.strictEqual(surface.dataset.phase, 'error');
  assert.strictEqual(surface.dataset.celebrate, 'false');
  assert.strictEqual(surface.querySelector('h2').textContent, 'Could not update the tracked card');

  listeners[0]({
    action: feedback.ACTION,
    ok: true,
    reason: 'updated',
    cardId: 'card-1',
    previous: { title: 'Old episode', url: 'https://example.com/old' },
    current: { title: 'New episode', url: 'https://example.com/new' }
  });
  undoResponse = {
    ok: true,
    reason: 'undone',
    previous: { title: 'New episode', url: 'https://example.com/new' },
    current: { title: 'Old episode', url: 'https://example.com/old' }
  };
  surface.querySelector('.primary').click();
  assert.strictEqual(undoRequests.length, 2);
  assert.deepStrictEqual(undoRequests[1], {
    action: feedback.UNDO_ACTION,
    cardId: 'card-1',
    expectedUrl: 'https://example.com/new'
  });
  assert.strictEqual(surface.dataset.phase, 'undone');
  assert.strictEqual(surface.querySelector('.undo-toast').hidden, false);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 15));
  assert.strictEqual(surface.hidden, true);
  assert.strictEqual(dom.window.document.activeElement.id, 'origin');

  dom.window.close();

  const cancelDom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://example.com/'
  });
  const cancelController = feedback.createFeedbackController({
    windowObj: cancelDom.window,
    chromeApi: { i18n: { getMessage: () => '' } },
    previewTimings: { breathe: 1000, enter: 10, commit: 10, exit: 10 }
  });
  const cancelled = cancelController.showPreview({
    previous: { title: 'Old', url: 'https://example.com/old' },
    current: { title: 'New', url: 'https://example.com/new' }
  });
  cancelController.close();
  assert.strictEqual(await cancelled, false, 'closing during animation must release the background request');
  cancelDom.window.close();
  console.log('pinned recent update feedback tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
