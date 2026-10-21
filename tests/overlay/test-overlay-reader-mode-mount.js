const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const overlaySource = fs.readFileSync(
  path.join(__dirname, '../../src/overlay/search-panel.js'),
  'utf8'
);
const mountExpressionMatch = overlaySource.match(
  /const overlayMountParent = ([\s\S]*?);\n\s*overlayMountParent\.appendChild\(overlayHost\);/
);

assert.ok(
  mountExpressionMatch,
  'the overlay mount-parent expression should remain discoverable'
);

const resolveMountParent = new Function(
  'document',
  `return ${mountExpressionMatch[1]};`
);
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { document } = dom.window;

document.body.className = 'simpread-hidden';
document.body.style.display = 'none';

const readerModeParent = resolveMountParent(document);
assert.strictEqual(
  readerModeParent,
  document.documentElement,
  'reader mode should mount the overlay outside a hidden body'
);

const overlayHost = document.createElement('div');
readerModeParent.appendChild(overlayHost);
assert.strictEqual(
  overlayHost.parentElement,
  document.documentElement,
  'the overlay host should be a direct child of the visible document root'
);
assert.strictEqual(
  document.body.contains(overlayHost),
  false,
  'the hidden reader-mode body must not contain the overlay host'
);

const fullscreenElement = document.createElement('section');
document.documentElement.appendChild(fullscreenElement);
Object.defineProperty(document, 'fullscreenElement', {
  configurable: true,
  value: fullscreenElement
});
assert.strictEqual(
  resolveMountParent(document),
  fullscreenElement,
  'fullscreen mode should keep the overlay inside the fullscreen subtree'
);

console.log('overlay reader-mode mount tests passed');
