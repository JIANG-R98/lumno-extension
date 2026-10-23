const assert = require('assert');
const settings = require('../../src/shared/settings.js');
const { createOptionsPage } = require('../helpers/options-page');
const { openSearchSurface } = require('../helpers/search-surfaces');

// Every surface writes the global theme the same way. (New Tab's /mode and
// appearance panel are in tests/newtab/test-newtab-mode-command.js.)

const THEME = settings.THEME_STORAGE_KEY;
const NEWTAB_THEME = settings.NEWTAB_THEME_MODE_STORAGE_KEY;
const themeWrites = (writes) => writes.filter((write) => Object.hasOwn(write, THEME) || Object.hasOwn(write, NEWTAB_THEME));

// Picking a theme in Settings saves it as the global theme.
async function testOptionsThemePicker() {
  const page = await createOptionsPage({ sync: { [THEME]: 'light' } });
  await page.settle(200);
  const before = page.storage.sync.writes.length;
  const dark = page.document.querySelector('._x_extension_theme_option_2024_unique_[data-mode="dark"]');
  assert.ok(dark, 'Settings should offer the dark theme');
  await page.click(dark);
  await page.settle(100);
  assert.deepStrictEqual(themeWrites(page.storage.sync.writes.slice(before)), [settings.createGlobalThemeModeStorageUpdate('dark')],
    'options should route theme selections through the shared global theme update');
  page.close();
}

// /mode in the overlay changes the global theme and shows it, leaving New
// Tab's own theme alone.
async function testOverlayModeCommand() {
  const surface = await openSearchSurface('overlay', { settings: { [THEME]: 'light', [NEWTAB_THEME]: 'light' } });
  await surface.settle(150);
  await surface.type('/mode');
  await surface.settle(150);
  const [row] = surface.suggestions();
  assert.ok(row, '/mode should offer the next theme');
  const before = surface.page.storageWrites.length;
  surface.press('Enter');
  await surface.settle(150);
  assert.deepStrictEqual(themeWrites(surface.page.storageWrites.slice(before)), [settings.createGlobalThemeModeStorageUpdate('dark')],
    'overlay /mode should write the global theme without clearing the New Tab override');
  const themed = surface.root.querySelector('[data-theme]');
  assert.strictEqual(themed && themed.getAttribute('data-theme'), 'dark', 'and apply it');
  surface.close();
}

(async () => {
  await testOptionsThemePicker();
  await testOverlayModeCommand();
  console.log('theme sync source tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
