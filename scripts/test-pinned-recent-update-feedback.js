const assert = require('assert');
const { JSDOM } = require('jsdom');
const feedback = require('../src/content/pinned-recent-update-feedback.js');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.com/'
});
const listeners = [];
const messages = {
  recent_update_feedback_success: 'Tracked card link updated',
  recent_update_feedback_not_tracked: 'No tracked card can be updated from this page'
};
const chromeApi = {
  i18n: {
    getMessage(key) {
      return messages[key] || '';
    }
  },
  runtime: {
    onMessage: {
      addListener(listener) {
        listeners.push(listener);
      }
    }
  }
};

async function run() {
  feedback.attach({
    windowObj: dom.window,
    chromeApi,
    previewTimings: { instant: true }
  });
  assert.strictEqual(listeners.length, 1);

  listeners[0]({
    action: feedback.ACTION,
    ok: true,
    reason: 'updated'
  });
  const host = dom.window.document.getElementById(feedback.HOST_ID);
  assert.ok(host && host.shadowRoot);
  const surface = host.shadowRoot.querySelector('.feedback');
  assert.strictEqual(surface.dataset.kind, 'success');
  assert.strictEqual(surface.dataset.show, 'true');
  assert.ok(surface.querySelector('.glow'));
  assert.strictEqual(surface.querySelector('.glow').getAttribute('aria-hidden'), 'true');
  assert.strictEqual(surface.querySelector('.message').textContent, messages.recent_update_feedback_success);

  listeners[0]({
    action: feedback.ACTION,
    ok: false,
    reason: 'no-tracked-target'
  });
  assert.strictEqual(surface.dataset.kind, 'error');
  assert.strictEqual(surface.querySelector('.message').textContent, messages.recent_update_feedback_not_tracked);

  let previewResponse = null;
  const asyncResponse = listeners[0]({
    action: feedback.PREVIEW_ACTION,
    previous: { title: 'Old episode', url: 'https://example.com/old' },
    current: { title: 'New episode', url: 'https://example.com/new' }
  }, null, (response) => {
    previewResponse = response;
  });
  assert.strictEqual(asyncResponse, true);
  const preview = host.shadowRoot.querySelector('.preview');
  assert.strictEqual(preview.hidden, false);
  assert.strictEqual(preview.dataset.state, 'active');
  assert.strictEqual(preview.dataset.phase, 'compare');
  assert.strictEqual(preview.querySelector('.old-title').textContent, 'Old episode');
  assert.strictEqual(preview.querySelector('.new-title').textContent, 'New episode');
  assert.strictEqual(preview.querySelector('.card-site').textContent, 'example.com');
  assert.strictEqual(preview.querySelector('.card-title').textContent, 'New episode');
  assert.ok(preview.querySelector('.home-card'));
  const previewStyles = host.shadowRoot.querySelector('style').textContent;
  assert.ok(previewStyles.includes('.preview[data-state="entering"]'));
  assert.ok(previewStyles.includes('.preview[data-state="leaving"]'));
  assert.ok(previewStyles.includes('.preview[data-phase="committing"]'));
  assert.ok(previewStyles.includes('.preview[data-phase="complete"]'));
  preview.querySelector('.confirm').click();
  await Promise.resolve();
  assert.deepStrictEqual(previewResponse, { confirmed: true });
  assert.strictEqual(preview.hidden, true);

  previewResponse = null;
  listeners[0]({
    action: feedback.PREVIEW_ACTION,
    previous: { title: 'Old', url: 'https://example.com/old' },
    current: { title: 'New', url: 'https://example.com/new' }
  }, null, (response) => {
    previewResponse = response;
  });
  preview.querySelector('.cancel').click();
  await Promise.resolve();
  assert.deepStrictEqual(previewResponse, { confirmed: false });

  dom.window.close();
  console.log('pinned recent update feedback tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
