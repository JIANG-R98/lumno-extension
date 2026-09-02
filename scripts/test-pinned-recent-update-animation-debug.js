'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const feedback = require('../src/content/pinned-recent-update-feedback.js');

async function run() {
  const dom = new JSDOM('<!doctype html><div id="canvas"></div>', {
    pretendToBeVisual: true,
    url: 'chrome-extension://test/src/debug/pinned-recent-update-animation.html'
  });
  const mountTarget = dom.window.document.getElementById('canvas');
  let undoCount = 0;
  let pendingUndo = null;
  const controller = feedback.createFeedbackController({
    windowObj: dom.window,
    documentObj: dom.window.document,
    embedded: true,
    mountTarget,
    manualPlayback: true,
    chromeApi: {
      i18n: { getMessage: () => '' },
      runtime: {
        lastError: null,
        sendMessage(_message, callback) {
          undoCount += 1;
          pendingUndo = callback;
        }
      }
    }
  });
  controller.setPlaybackRate(2);
  let readyResult = null;
  controller.showPreview({
    cardId: 'card-1',
    previous: { title: 'Episode 7', url: 'https://example.com/p7' },
    current: { title: 'Episode 8', url: 'https://example.com/p8' }
  }).then((value) => { readyResult = value; });

  assert.strictEqual(controller.getPhase(), 'breathing');
  assert.strictEqual(mountTarget.firstElementChild.id, feedback.HOST_ID);
  const style = mountTarget.firstElementChild.shadowRoot.querySelector('style').textContent;
  assert.match(style, /position:\s*absolute/);
  assert.strictEqual(
    mountTarget.firstElementChild.style.getPropertyValue('--lumno-flow-breathe'),
    '525ms'
  );

  ['card-enter', 'old-out', 'new-in', 'saving'].forEach((phase) => {
    assert.strictEqual(controller.advancePreview(), phase);
    assert.strictEqual(controller.getPhase(), phase);
  });
  await Promise.resolve();
  assert.strictEqual(readyResult, true);
  assert.strictEqual(controller.advancePreview(), 'success');
  assert.strictEqual(controller.advancePreview(), 'undo-confirm');
  assert.strictEqual(undoCount, 0, 'undo should still require the confirmation stage');
  assert.strictEqual(controller.advancePreview(), 'saving');
  assert.strictEqual(undoCount, 1);
  pendingUndo({
    ok: true,
    previous: { title: 'Episode 8', url: 'https://example.com/p8' },
    current: { title: 'Episode 7', url: 'https://example.com/p7' }
  });
  assert.strictEqual(controller.getPhase(), 'undone');

  controller.showPreview({
    cardId: 'card-1',
    previous: { title: 'Episode 7', url: 'https://example.com/p7' },
    current: { title: 'Episode 8', url: 'https://example.com/p8' }
  });
  for (let index = 0; index < 7; index += 1) controller.advancePreview();
  const staleUndo = pendingUndo;
  controller.showPreview({
    cardId: 'card-2',
    previous: { title: 'Chapter 1', url: 'https://example.com/c1' },
    current: { title: 'Chapter 2', url: 'https://example.com/c2' }
  });
  staleUndo({
    ok: true,
    previous: { title: 'Episode 8', url: 'https://example.com/p8' },
    current: { title: 'Episode 7', url: 'https://example.com/p7' }
  });
  assert.strictEqual(controller.getPhase(), 'breathing',
    'a stale undo callback must not overwrite a newly reset preview');

  controller.showPreview({
    cardId: 'card-2',
    previous: { title: 'Chapter 1', url: 'https://example.com/c1' },
    current: { title: 'Chapter 2', url: 'https://example.com/c2' }
  }, { manual: false });
  assert.strictEqual(controller.advancePreview(), 'card-enter');
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
  assert.strictEqual(controller.getPhase(), 'card-enter',
    'taking a manual step must cancel the automatic replay timeline');

  const html = fs.readFileSync(path.join(
    __dirname,
    '..',
    'src',
    'debug',
    'pinned-recent-update-animation.html'
  ), 'utf8');
  assert.match(html, /data-action="replay"/);
  assert.match(html, /data-action="advance"/);
  assert.match(html, /data-stage="breathing"/);
  assert.match(html, /pinned-recent-update-feedback\.js/);

  const packageSource = fs.readFileSync(path.join(__dirname, 'package-store.js'), 'utf8');
  assert.match(packageSource, /src\/debug\/pinned-recent-update-animation\.html/);
  assert.match(packageSource, /src\/debug\/pinned-recent-update-animation\.js/);
  const openScript = fs.readFileSync(path.join(
    __dirname,
    'open-pinned-recent-update-animation-debug.js'
  ), 'utf8');
  assert.match(openScript, /chrome-extension:\/\/kkcjcneagmlhpeaafngjdlpcfjakejgb\/src\/debug\/pinned-recent-update-animation\.html/);

  dom.window.close();
  console.log('pinned recent update animation debug tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
