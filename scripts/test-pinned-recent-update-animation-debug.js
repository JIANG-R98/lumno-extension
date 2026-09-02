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
    visualVariant: 'homepage-card',
    confirmBeforeSwap: true,
    directUndo: true,
    fadeAfterUndo: true,
    undoFadeDelay: 20,
    celebrateOnSuccess: true,
    updatedStatusText: '已更新',
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
  const sample = {
    cardId: 'card-1',
    previous: { title: 'Episode 7', url: 'https://example.com/p7' },
    current: { title: 'Episode 8', url: 'https://example.com/p8' }
  };
  controller.show({ action: feedback.ACTION, ok: true, reason: 'updated', ...sample });

  assert.strictEqual(controller.getPhase(), 'success');
  assert.strictEqual(mountTarget.firstElementChild.id, feedback.HOST_ID);
  const style = mountTarget.firstElementChild.shadowRoot.querySelector('style').textContent;
  const surface = mountTarget.firstElementChild.shadowRoot.querySelector('.surface');
  assert.strictEqual(surface.querySelector('.panel').getAttribute('aria-modal'), 'false');
  assert.strictEqual(surface.dataset.celebrate, 'true');
  assert.strictEqual(surface.querySelector('.incoming-title').textContent, 'Episode 8');
  assert.strictEqual(surface.querySelector('.incoming-status').textContent, '已更新');
  assert.strictEqual(surface.querySelectorAll('.confetti-piece').length, 24);
  assert.strictEqual(surface.querySelector('.secondary').hidden, false);
  assert.strictEqual(surface.querySelector('.primary').hidden, false);
  assert.match(style, /position:\s*absolute/);
  assert.strictEqual(surface.dataset.visualVariant, 'homepage-card');
  assert.match(style, /data-visual-variant="homepage-card"[^}]*background:\s*transparent/s);
  assert.match(style, /--home-card-width:\s*248px/);
  assert.match(style, /data-visual-variant="homepage-card"[^}]*\.panel[^}]*width:\s*248px/s);
  assert.match(style, /data-visual-variant="homepage-card"[^}]*\.change[^}]*left:\s*calc\(100% \+ 16px\)/s);
  assert.match(style, /data-visual-variant="homepage-card"[^}]*\.actions[^}]*justify-content:\s*center/s);
  assert.match(style, /data-celebrate="true"\]\[data-phase="success"\] \.card-stage[^}]*display:\s*none/s);
  assert.match(style, /data-celebrate="true"\]\[data-phase="success"\] \.change[^}]*position:\s*relative/s);
  assert.match(style, /data-visual-variant="homepage-card"[^}]*\.actions[^}]*margin-top:\s*28px/s);
  assert.match(style, /\.incoming-card::before[^}]*radial-gradient[^}]*filter:\s*blur\(12px\)/s);
  assert.doesNotMatch(style, /data-visual-variant="homepage-card"[^}]*\.glow\s*\{[^}]*inset:\s*calc/s);
  assert.match(style, /data-celebrate="true"\]\[data-phase="success"\] \.glow/);
  assert.match(style, /\.confetti-piece/);
  assert.match(style, /@keyframes confetti-burst/);
  assert.match(style, /confetti-burst var\(--lumno-flow-breathe/);
  assert.match(style, /35%\{opacity:1;transform:translate\(calc\(-50% \+ var\(--mx\)/);
  assert.match(style, /completion-pop var\(--lumno-flow-enter/);
  assert.match(style, /prefers-reduced-motion:reduce[^}]*\.undo-toast/s);
  assert.match(style, /data-phase="success"[^}]*\.change[^}]*display:\s*block/s);
  assert.match(style, /data-phase="success"[^}]*\.home-card[\s\S]*?opacity:\s*0/s);
  assert.match(style, /data-phase="success"[^}]*\.home-card[\s\S]*?animation:\s*none/s);
  assert.match(style, /\.card-footer,[^}]*\.incoming-footer\s*\{[^}]*width:\s*100%/s);
  assert.match(style, /x-lumno-action-button--warning/);
  assert.strictEqual(controller.advancePreview(), 'saving');
  assert.strictEqual(undoCount, 1);
  pendingUndo({
    ok: true,
    previous: { title: 'Episode 8', url: 'https://example.com/p8' },
    current: { title: 'Episode 7', url: 'https://example.com/p7' }
  });
  assert.strictEqual(controller.getPhase(), 'undone');
  const toast = surface.querySelector('.undo-toast');
  assert.strictEqual(toast.hidden, false);
  assert.match(toast.textContent, /undone/i);
  assert.strictEqual(
    surface.querySelector('.incoming-title').textContent,
    'Episode 8',
    'the simplified undo animation should fade the updated card without swapping its title'
  );
  await new Promise((resolve) => dom.window.setTimeout(resolve, 280));
  assert.strictEqual(controller.getPhase(), '', 'the restored card should fade out automatically');

  controller.show({ action: feedback.ACTION, ok: true, reason: 'updated', ...sample });
  controller.advancePreview();
  const staleUndo = pendingUndo;
  controller.show({
    action: feedback.ACTION,
    ok: true,
    reason: 'updated',
    cardId: 'card-2',
    previous: { title: 'Chapter 1', url: 'https://example.com/c1' },
    current: { title: 'Chapter 2', url: 'https://example.com/c2' }
  });
  staleUndo({
    ok: true,
    previous: sample.current,
    current: sample.previous
  });
  assert.strictEqual(controller.getPhase(), 'success');
  assert.strictEqual(surface.querySelector('.incoming-title').textContent, 'Chapter 2');

  const html = fs.readFileSync(path.join(
    __dirname,
    '..',
    'src',
    'debug',
    'pinned-recent-update-animation.html'
  ), 'utf8');
  assert.match(html, /data-action="replay"/);
  assert.match(html, /data-action="advance"/);
  assert.match(html, /data-stage="success"/);
  assert.doesNotMatch(html, /data-stage="ready"/);
  assert.doesNotMatch(html, /data-stage="undo-confirm"/);
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
