const assert = require('assert');
const fs = require('fs');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');

// Backspace in an empty input removes the active search scope only when
// pressed twice: the first press explains itself in a Toast. The timing of
// the two presses is covered by react-src/shared/search-input-mode.test.ts.

async function testTwoPressesRemoveTheScope(name) {
  const surface = await openSearchSurface(name);
  await surface.chooseScope('provider:yt');
  assert.strictEqual(surface.scopeLabel(), 'YouTube', `${name}: the YouTube scope should be active`);

  surface.press('Backspace');
  await surface.settle(50);
  assert.strictEqual(surface.scopeLabel(), 'YouTube', `${name}: one Backspace should keep the scope`);
  assert.deepStrictEqual(surface.toast(), { shown: true, text: 'Press Backspace again to remove the scope.' },
    `${name}: the first Backspace should ask for a second one`);

  surface.press('Backspace', { repeat: true });
  await surface.settle(50);
  assert.strictEqual(surface.scopeLabel(), 'YouTube', `${name}: holding Backspace down should not count as a second press`);

  surface.press('Backspace');
  await surface.settle(50);
  assert.strictEqual(surface.scopeLabel(), '', `${name}: the second Backspace should remove the scope`);
  assert.strictEqual(surface.toast().shown, false, `${name}: removing the scope should dismiss the Toast`);
  surface.close();
}

async function testTypedTextIsDeletedFirst(name) {
  const surface = await openSearchSurface(name);
  await surface.chooseScope('provider:yt');
  await surface.type('c');
  surface.input().setSelectionRange(1, 1);
  surface.press('Backspace');
  await surface.settle(50);
  assert.strictEqual(surface.scopeLabel(), 'YouTube', `${name}: Backspace over typed text should not touch the scope`);
  assert.strictEqual(surface.toast().shown, false, `${name}: nor ask about it`);
  surface.close();
}

function testCopy() {
  const expected = {
    en: 'Press Backspace again to remove the scope.',
    ja: 'もう一度 Backspace を押すと検索範囲を解除します。',
    zh_CN: '再按一次退格键，移除搜索范围。',
    zh_TW: '再按一次退格鍵，移除搜尋範圍。'
  };
  Object.entries(expected).forEach(([locale, message]) => {
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    assert.strictEqual(messages.search_scope_remove_confirmation.message, message, `${locale} should localize the confirmation`);
  });
}

(async () => {
  for (const name of SURFACES) {
    await testTwoPressesRemoveTheScope(name);
    await testTypedTextIsDeletedFirst(name);
  }
  testCopy();
  console.log('search scope Backspace confirmation tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
