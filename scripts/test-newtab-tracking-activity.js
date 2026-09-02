const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const newtabJs = fs.readFileSync(path.join(root, 'src/newtab/newtab.js'), 'utf8');
const backgroundJs = fs.readFileSync(path.join(root, 'src/background/background.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'newtab.html'), 'utf8');

assert.ok(
  newtabJs.includes("action: 'getPinnedRecentTrackingActivity'") &&
    newtabJs.includes("message.action === 'pinnedRecentTrackingActivityChanged'") &&
    newtabJs.includes('activeTabCount: item && item.cardId'),
  'New Tab should query, invalidate, and render tracking activity by cardId'
);
assert.ok(
  newtabJs.includes("button.classList.toggle('x-nt-recent-track--live', liveCount > 0)") &&
    newtabJs.includes('button.dataset.activeTabCount = String(liveCount)'),
  'tracking action should expose a distinct live-tab state'
);
assert.ok(
    newtabJs.includes("trackingCardId: String(config.trackingCardId || '')") &&
    backgroundJs.includes("case 'rememberPinnedRecentTrackingTarget':") &&
    backgroundJs.includes("case 'syncPinnedRecentTrackingToken':") &&
    backgroundJs.includes("case 'getPinnedRecentTrackingActivity':") &&
    backgroundJs.includes('pinnedRecentContextMenuController.bindTrackingTab(tab, trackingCardId, targetUrl)'),
  'background card opens should bind only the created tab'
);
const extensionPagesRoute = backgroundJs.match(
  /extensionPages:\s*\{\s*actions:\s*\[([\s\S]*?)\],\s*handler:\s*handleExtensionPageMessage/
);
assert.ok(extensionPagesRoute, 'extension page message route should remain discoverable');
[
  'rememberPinnedRecentTrackingTarget',
  'syncPinnedRecentTrackingToken',
  'getPinnedRecentTrackingActivity'
].forEach((action) => {
  assert.ok(
    extensionPagesRoute[1].includes(`'${action}'`),
    `${action} should be routed to the extension page handler`
  );
});
assert.ok(
  html.includes('.x-nt-recent-track.x-nt-recent-track--live::after'),
  'live tracking state should have a stable visual marker'
);

console.log('newtab tracking activity tests passed');
