const assert = require('assert');
const model = require('../../src/domain/tab-switcher-model.ts');

// The recent-tab switcher's rules apart from the browser.

const items = [10, 11, 12, 13].map((id) => ({ id }));
// Forward opens on the tab used before the current one.
assert.strictEqual(model.getDefaultSwitcherSelectedIndex(items, 10, 1), 1, 'from the newest tab, the one before it');
assert.strictEqual(model.getDefaultSwitcherSelectedIndex(items, 12, 1), 2, 'a current tab further down stays selected');
assert.strictEqual(model.getDefaultSwitcherSelectedIndex(items, 99, 1), 0, 'an unknown current tab selects the first');
// Reverse opens on the oldest, wrapping back from the current tab.
assert.strictEqual(model.getDefaultSwitcherSelectedIndex(items, 10, -1), 3);
assert.strictEqual(model.getDefaultSwitcherSelectedIndex(items, 12, -1), 1);
assert.strictEqual(model.getDefaultSwitcherSelectedIndex(items, 99, -1), 3);
assert.strictEqual(model.getDefaultSwitcherSelectedIndex([{ id: 10 }], 10, 1), 0, 'one tab is the only choice');
assert.strictEqual(model.getDefaultSwitcherSelectedIndex(items, undefined, 1), 0);

// Replies from the page.
assert.strictEqual(model.normalizeTabSwitcherHostOkResponse({ ok: true }), true);
assert.strictEqual(model.normalizeTabSwitcherHostOkResponse({ ok: 'yes' }), null);
assert.strictEqual(model.normalizeTabSwitcherCommitResponse({ ok: true, committed: false }), false);
assert.strictEqual(model.normalizeTabSwitcherCommitResponse({ ok: true }), null);
assert.deepStrictEqual(model.normalizeOpenTabSwitcherStateResponse({ ok: true, open: true }), { ok: true, open: true });
assert.strictEqual(model.normalizeOpenTabSwitcherStateResponse({ ok: false, open: true }), null);
assert.deepStrictEqual(model.getFailedOpenTabSwitcherState(), { ok: false, open: false });
const frames = [{ result: { ok: false } }, { result: null }, 'junk', { result: { ok: true, open: false, committed: true } }];
assert.deepStrictEqual(model.readScriptResults(frames), [{ ok: false }, { ok: true, open: false, committed: true }]);
assert.strictEqual(model.normalizeTabSwitcherHostOkScriptResults(frames), true, 'any frame that did it counts');
assert.strictEqual(model.normalizeTabSwitcherHostOkScriptResults([{ result: { ok: false } }]), null);
assert.strictEqual(model.normalizeTabSwitcherCommitScriptResults(frames), true);
assert.deepStrictEqual(model.normalizeOpenTabSwitcherStateScriptResults(frames), { ok: true, open: false });
assert.strictEqual(model.normalizeOpenTabSwitcherStateScriptResults(null), null);

// Thumbnails.
assert.strictEqual(model.readTabSwitcherThumbnailStatus('stale'), 'stale');
assert.strictEqual(model.readTabSwitcherThumbnailStatus('weird'), '');
assert.strictEqual(model.getTabSwitcherThumbnailStorageKey(7), `${model.TAB_SWITCHER_THUMBNAIL_KEY_PREFIX}7`);
assert.strictEqual(
  model.getThumbnailPersistSignature({ updatedAt: 2, capturedAt: 1, status: 'ok', url: 'https://a/', reason: 'r', dataUrl: 'data:abc' }),
  '2|1|ok|https://a/|r|8', 'the signature counts the image, not its bytes');
assert.strictEqual(model.getTabSwitcherHeadSignature({ stack: [1, 2], thumbnailTabIds: [2] }), '[[1,2],[2]]');
[
  [null, true],
  [{ status: 'restricted' }, false],
  [{ status: 'pending' }, false],
  [{ status: 'stale' }, true],
  [{ status: 'failed' }, true],
  [{ status: 'ok', dataUrl: 'data:image/jpeg;base64,AA' }, false],
  [{ status: 'ok', dataUrl: '' }, true]
].forEach(([state, expected]) => {
  assert.strictEqual(model.isSwitcherThumbnailRefreshNeeded(state), expected, JSON.stringify(state));
});
assert.strictEqual(model.getSwitcherThumbnailStatusForFailureReason('Cannot access contents of the page'), 'restricted');
assert.strictEqual(model.getSwitcherThumbnailStatusForFailureReason('untracked-tab'), 'restricted');
assert.strictEqual(model.getSwitcherThumbnailStatusForFailureReason('timeout'), 'failed');

// Theme hosts.
assert.strictEqual(model.getSwitcherRegistrableThemeHost('docs.github.com'), 'github.com');
assert.strictEqual(model.getSwitcherRegistrableThemeHost('www.bbc.co.uk'), 'bbc.co.uk');
assert.strictEqual(model.getSwitcherRegistrableThemeHost('192.168.1.10'), '192.168.1.10');
assert.strictEqual(model.getSwitcherRegistrableThemeHost('dev.app.localhost'), 'dev.app.localhost');
assert.deepStrictEqual(model.getSwitcherThemeHostCandidates('gist.github.com'), ['github.com', 'gist.github.com']);
assert.deepStrictEqual(model.getSwitcherThemeHostCandidates('app.dodopayments.com'), ['dodopayments.com', 'app.dodopayments.com']);
assert.deepStrictEqual(model.getSwitcherThemeHostCandidates('github.com'), ['github.com']);

console.log('tab switcher model tests passed');
