const assert = require('assert');
const fs = require('fs');
const settings = require('../../src/domain/settings/index.ts');
const { createOptionsPage } = require('../helpers/options-page');
const { loadBackground, wait } = require('../helpers/background-harness');

// The overlay opening animation setting: its Settings control, its storage
// and the copy. What each choice plays is covered by test-overlay-entry-motion.js.

const KEY = '_x_extension_overlay_enter_animation_2026_unique_';

async function testChoosingFadeIsSaved() {
  const page = await createOptionsPage();
  const size = page.byId('_x_extension_overlay_size_tabs_wrap_2026_unique_');
  const animation = page.byId('_x_extension_overlay_enter_animation_tabs_wrap_2026_unique_');
  assert.ok(size && animation && (size.compareDocumentPosition(animation) & 4),
    'the opening animation row should follow the overlay size setting');
  const options = Array.from(page.document.querySelectorAll('[data-overlay-enter-animation]'));
  assert.deepStrictEqual(options.map((button) => [button.getAttribute('data-overlay-enter-animation'), button.getAttribute('data-active')]),
    [['elastic', 'true'], ['fade', 'false']], 'spring should be selected by default, with fade available');
  // The segmented control is a React island: read its buttons afresh.
  const pressed = (value) => page.document.querySelector(`[data-overlay-enter-animation="${value}"]`).getAttribute('aria-checked');
  assert.strictEqual(page.byId('_x_extension_overlay_enter_animation_tabs_wrap_2026_unique_').getAttribute('role'), 'radiogroup',
    'the choice should be announced as one radio group');
  await page.click(page.document.querySelector('[data-overlay-enter-animation="fade"]'));
  await page.settle(100);
  assert.ok(page.storage.sync.writes.some((write) => write[KEY] === 'fade'), 'choosing fade should save it to browser sync');
  assert.deepStrictEqual([pressed('elastic'), pressed('fade')], ['false', 'true']);
  page.changeStorage('sync', KEY, 'elastic');
  await page.settle(100);
  assert.deepStrictEqual([pressed('elastic'), pressed('fade')], ['true', 'false'], 'a choice made on another device should show here');
  page.close();
}

async function testStorage() {
  assert.deepStrictEqual([undefined, 'bogus', 'fade', 'elastic'].map(settings.overlayEnterAnimation.parse),
    ['elastic', 'elastic', 'fade', 'elastic'], 'missing and invalid values should mean spring');
  assert.ok(settings.BROWSER_SYNC_KEYS.includes(KEY));
  const worker = loadBackground({ local: { [KEY]: 'fade' } });
  await wait(80);
  assert.strictEqual(worker.storage.sync.data[KEY], 'fade', 'a choice an earlier version kept locally should move into browser sync');
}

function testCopy() {
  const expected = {
    en: ['Opening animation', 'Spring', 'Fade'],
    ja: ['表示時のアニメーション', 'スプリング', 'フェード'],
    zh_CN: ['进入动画', '弹性', '淡入'],
    zh_TW: ['進入動畫', '彈性', '淡入']
  };
  Object.entries(expected).forEach(([locale, labels]) => {
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    assert.deepStrictEqual([
      messages.settings_overlay_enter_animation_title.message,
      messages.overlay_enter_animation_elastic.message,
      messages.overlay_enter_animation_fade.message
    ], labels);
  });
}

(async () => {
  await testChoosingFadeIsSaved();
  await testStorage();
  testCopy();
  console.log('overlay entry animation setting tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
