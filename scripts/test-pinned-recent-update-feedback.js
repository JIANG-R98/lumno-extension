const assert = require('assert');
const { JSDOM } = require('jsdom');
const feedback = require('../src/content/pinned-recent-update-feedback.js');

const dom = new JSDOM('<!doctype html><html><body><button id="origin">Open</button></body></html>', {
  pretendToBeVisual: true,
  url: 'https://example.com/'
});
const listeners = [];
const undoRequests = [];
const chromeApi = {
  i18n: { getMessage: () => '' },
  runtime: {
    lastError: null,
    onMessage: { addListener(listener) { listeners.push(listener); } },
    sendMessage(message, callback) {
      undoRequests.push(message);
      callback({
        ok: true,
        reason: 'undone',
        previous: { title: 'New episode', url: 'https://example.com/new' },
        current: { title: 'Old episode', url: 'https://example.com/old' }
      });
    }
  }
};

async function tick() {
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
}

async function run() {
  dom.window.document.getElementById('origin').focus();
  feedback.attach({ windowObj: dom.window, chromeApi, previewTimings: { instant: true } });
  assert.strictEqual(listeners.length, 1);

  let previewResponse = null;
  assert.strictEqual(listeners[0]({
    action: feedback.PREVIEW_ACTION,
    cardId: 'card-1',
    previous: { title: 'Old episode', url: 'https://example.com/old' },
    current: { title: 'New episode', url: 'https://example.com/new' }
  }, null, (response) => { previewResponse = response; }), true);
  await tick();
  const host = dom.window.document.getElementById(feedback.HOST_ID);
  const surface = host.shadowRoot.querySelector('.surface');
  assert.deepStrictEqual(previewResponse, { ready: true });
  assert.strictEqual(surface.hidden, false);
  assert.strictEqual(surface.dataset.phase, 'saving');
  assert.strictEqual(surface.querySelector('.old-title').textContent, 'Old episode');
  assert.strictEqual(surface.querySelector('.new-title').textContent, 'New episode');

  listeners[0]({
    action: feedback.ACTION,
    ok: true,
    reason: 'updated',
    cardId: 'card-1',
    previous: { title: 'Old episode', url: 'https://example.com/old' },
    current: { title: 'New episode', url: 'https://example.com/new' }
  });
  assert.strictEqual(surface.dataset.phase, 'success');
  assert.strictEqual(surface.querySelector('.primary').textContent, 'Undo');
  assert.strictEqual(surface.querySelector('.secondary').textContent, 'Close');

  surface.querySelector('.primary').click();
  assert.strictEqual(surface.dataset.phase, 'undo-confirm');
  assert.strictEqual(undoRequests.length, 0, 'undo must not save before the reverse change is confirmed');
  assert.strictEqual(surface.querySelector('.old-title').textContent, 'New episode');
  assert.strictEqual(surface.querySelector('.new-title').textContent, 'Old episode');
  surface.querySelector('.primary').click();
  assert.strictEqual(undoRequests.length, 1);
  assert.deepStrictEqual(undoRequests[0], {
    action: feedback.UNDO_ACTION,
    cardId: 'card-1',
    expectedUrl: 'https://example.com/new'
  });
  assert.strictEqual(surface.dataset.phase, 'undone');

  surface.querySelector('.secondary').click();
  await tick();
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
