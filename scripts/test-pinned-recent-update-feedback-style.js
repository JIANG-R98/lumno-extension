'use strict';

const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const feedback = require('../src/content/pinned-recent-update-feedback.js');

const source = fs.readFileSync('src/content/pinned-recent-update-feedback.js', 'utf8');

assert.match(source, /width:\s*min\(720px,\s*calc\(100vw - 24px\)\)/);
assert.match(source, /backdrop-filter:\s*blur\(56px\) saturate\(210%\)/);
assert.match(source, /--home-card-width:\s*min\(251px,/);
assert.match(source, /\.card-stage \{[^}]*width:\s*min\(var\(--home-card-width\),\s*100%\)/s);
assert.match(source, /x-lumno-action-button--secondary cancel/);
assert.match(source, /x-lumno-action-button--primary confirm/);
assert.match(source, /max-height:\s*calc\(100dvh - 24px\)/);
assert.match(source, /overflow-y:\s*auto/);
assert.match(source, /@media \(max-width:\s*640px\)/);
assert.doesNotMatch(source, /width:\s*min\(340px,\s*100%\)/);

async function runInteractionChecks() {
  const dom = new JSDOM('<!doctype html><button id="origin">Open</button>', {
    pretendToBeVisual: true,
    url: 'https://example.com/'
  });
  const origin = dom.window.document.getElementById('origin');
  origin.focus();
  const controller = feedback.createFeedbackController({
    windowObj: dom.window,
    documentObj: dom.window.document,
    chromeApi: { i18n: { getMessage: () => '' } },
    previewTimings: { instant: true }
  });
  const resultTask = controller.showPreview({
    previous: { title: 'Old', url: 'https://example.com/old' },
    current: { title: 'New', url: 'https://example.com/new' }
  });
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  const host = dom.window.document.getElementById(feedback.HOST_ID);
  const cancel = host.shadowRoot.querySelector('.cancel');
  const confirm = host.shadowRoot.querySelector('.confirm');
  assert.strictEqual(host.shadowRoot.activeElement, confirm);

  cancel.focus();
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    bubbles: true,
    cancelable: true
  }));
  assert.strictEqual(host.shadowRoot.activeElement, confirm);
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true
  }));
  assert.strictEqual(host.shadowRoot.activeElement, cancel);

  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true
  }));
  assert.strictEqual(await resultTask, false);
  assert.strictEqual(dom.window.document.activeElement, origin);

  const committedTask = controller.showPreview({
    previous: { title: 'Old', url: 'https://example.com/old' },
    current: { title: 'New', url: 'https://example.com/new' }
  });
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  host.shadowRoot.querySelector('.confirm').click();
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true
  }));
  assert.strictEqual(await committedTask, true);
}

runInteractionChecks().then(() => {
  console.log('pinned recent update feedback style tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
