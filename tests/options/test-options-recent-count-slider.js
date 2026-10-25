const assert = require('assert');
const settings = require('../../src/domain/settings.ts');
const { createOptionsPage } = require('../helpers/options-page');

// Recent site cards are set in rows (0–2) and stored as cards (rows × 4).

const CONTROL_ID = '_x_extension_recent_count_control_2026_unique_';
const SLIDER_ID = '_x_extension_recent_count_slider_2026_unique_';
const MODE_TABS_ID = '_x_extension_recent_mode_tabs_wrap_2024_unique_';

async function testSliderUsesRows() {
  const page = await createOptionsPage({ sync: { [settings.RECENT_COUNT_STORAGE_KEY]: 8 } });
  await page.settle(200);
  const control = page.byId(CONTROL_ID);
  assert.ok(control && control.contains(page.byId(SLIDER_ID)), 'recent site cards should mount the shared range slider control');
  assert.ok(control.compareDocumentPosition(page.byId(MODE_TABS_ID)) & 4, 'the recent card slider should appear before the mode tabs');
  const slider = page.byId(SLIDER_ID);
  assert.deepStrictEqual([slider.min, slider.max, slider.step], ['0', '2', '1'], 'recent site cards should use a 0-2 row slider');
  assert.strictEqual(slider.value, '2', 'stored recent card counts should render as row values on the slider');

  const setValue = Object.getOwnPropertyDescriptor(page.window.HTMLInputElement.prototype, 'value').set;
  setValue.call(slider, '1');
  slider.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  slider.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  await page.settle(200);
  assert.strictEqual(page.storage.sync.data[settings.RECENT_COUNT_STORAGE_KEY], 4,
    'recent slider values should keep the rows-times-four storage format');

  const tabs = Array.from(page.byId(MODE_TABS_ID).querySelectorAll('[data-recent-mode]'));
  assert.ok(tabs.length >= 2 && tabs.every((tab) => tab.textContent.trim() && !tab.querySelector('i, svg')),
    'recent mode tabs should keep text labels without icons');
  page.close();
}

(async () => {
  await testSliderUsesRows();
  console.log('Options recent-site count slider tests passed.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
