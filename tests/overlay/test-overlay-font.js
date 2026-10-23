const assert = require('assert');
const fs = require('fs');
const path = require('path');
const settings = require('../../src/shared/settings.js');
const webdavContract = require('../../src/shared/webdav-contract.js');
const { toFirefoxManifest } = require('../../scripts/build/firefox-manifest.js');
const { parseCss } = require('../helpers/css-rules');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');
const { loadBackground, wait } = require('../helpers/background-harness');

// The font chosen in Settings, as the overlay applies it, and what keeps the
// choice on this device. The Settings rows are covered by
// tests/options/test-options-overlay-font.js.

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
const FAMILY_KEY = settings.OVERLAY_FONT_FAMILY_STORAGE_KEY;
const FALLBACK_KEY = settings.OVERLAY_FONT_FALLBACK_STORAGE_KEY;
const FONT_VAR = '--lumno-font-sans';

async function testOverlayAppliesTheDeviceFont() {
  const page = await createOverlayPage({ localSettings: { [FAMILY_KEY]: 'Inter', [FALLBACK_KEY]: 'Georgia' } });
  const root = await page.open();
  const overlay = root.getElementById('_x_extension_overlay_2024_unique_');
  assert.strictEqual(overlay.style.getPropertyValue(FONT_VAR), settings.getOverlayFontFamilyCssValue('Inter', 'Georgia'),
    'the overlay should point the shared font token at the chosen family and fallback');
  const fontRead = page.storageReads.find((keys) => keys.includes(FAMILY_KEY));
  assert.strictEqual(fontRead.area, 'local', 'the fonts should be read from this device\'s storage');
  assert.ok(fontRead.includes(FALLBACK_KEY));
  const preferenceRead = page.storageReads.find((keys) => keys.includes('_x_extension_language_2024_unique_'));
  assert.ok(!preferenceRead.some((key) => key.includes('overlay_font')), 'the synced preference read should not carry the fonts');

  page.changeSetting(FAMILY_KEY, 'Menlo', 'local');
  await page.settle();
  assert.strictEqual(overlay.style.getPropertyValue(FONT_VAR), settings.getOverlayFontFamilyCssValue('Menlo', 'Georgia'),
    'a font change should apply to the open overlay');
  page.changeSetting(FAMILY_KEY, 'Arial', 'sync');
  await page.settle();
  assert.strictEqual(overlay.style.getPropertyValue(FONT_VAR), settings.getOverlayFontFamilyCssValue('Menlo', 'Georgia'),
    'a font in browser sync should be ignored');
  page.changeSetting('_x_extension_theme_mode_2024_unique_', 'dark', 'sync');
  await page.settle();
  assert.strictEqual(overlay.style.getPropertyValue(FONT_VAR), settings.getOverlayFontFamilyCssValue('Menlo', 'Georgia'),
    'changing the theme should keep the chosen font');

  const inlineFonts = Array.from(root.querySelectorAll('[style]')).map((element) => element.style.fontFamily).filter(Boolean);
  assert.ok(inlineFonts.length > 0 && inlineFonts.every((value) => value.includes(`var(${FONT_VAR}`)),
    'input parts styled inline should follow the token too');
  const panelStyles = parseCss(Array.from(root.querySelectorAll('style')).map((style) => style.textContent).join('\n'));
  assert.strictEqual(panelStyles.rule(':where(#_x_extension_overlay_2024_unique_)').get(FONT_VAR), settings.OVERLAY_FONT_DEFAULT_STACK,
    'the panel should define the bundled stack in its shadow root, where tokens.css never arrives');
  page.close();
}

function testStylesheetsUseTheToken() {
  assert.strictEqual(parseCss(read('src/shared/tokens.css')).rule(':root').get(FONT_VAR), settings.OVERLAY_FONT_DEFAULT_STACK,
    'tokens.css should hold the bundled stack');
  // Each text rule either names the token or inherits it; none repeats the stack.
  ['src/overlay/suggestions-view.css', 'src/shared/search/search-input.css'].forEach((file) => {
    const css = parseCss(read(file));
    const fontRules = css.entries.filter((entry) => entry.style.getPropertyValue('font-family') || entry.style.getPropertyValue('font'));
    assert.ok(fontRules.length > 0);
    fontRules.forEach((entry) => {
      const value = entry.style.getPropertyValue('font-family') || entry.style.getPropertyValue('font');
      if (value === 'inherit') {
        return;
      }
      if (/remixicon/.test(value)) {
        assert.ok(entry.selectors.some((selector) => selector.includes('ri-')), 'only icon glyphs should keep their own font');
        return;
      }
      assert.match(value, /var\(--lumno-font-sans, sans-serif\)/, `${file} ${entry.selectors.join(', ')} should follow the chosen font`);
    });
  });
}

async function testFontsStayOnTheDevice() {
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(manifest.permissions.includes('fontSettings'), 'reading the installed font list needs the fontSettings permission');
  assert.ok(!(manifest.optional_permissions || []).includes('fontSettings'), 'Chrome cannot request fontSettings at runtime');
  const firefox = toFirefoxManifest(manifest, { lazyBackgroundDeps: ['assets/vendor/pinyin-pro.js'], importShim: 'build/firefox-import-shim.js' });
  assert.ok(!firefox.permissions.includes('fontSettings'), 'the Firefox package should drop the Chrome-only permission');

  settings.OVERLAY_FONT_LOCAL_STORAGE_KEYS.forEach((key) => {
    assert.ok(!settings.CHROME_SYNC_STORAGE_KEYS.includes(key), `${key} must not reach browser sync`);
    assert.ok(!webdavContract.KNOWN_KEYS.includes(key), `${key} must not reach WebDAV`);
  });
  assert.deepStrictEqual(
    webdavContract.selectPreferences({ [FAMILY_KEY]: 'PingFang SC', [settings.OVERLAY_SIZE_MODE_STORAGE_KEY]: 'large' }),
    { [settings.OVERLAY_SIZE_MODE_STORAGE_KEY]: 'large' },
    'a WebDAV state that still carries a font (an earlier build wrote one) must not apply it'
  );

  const worker = loadBackground({ sync: { [FAMILY_KEY]: 'Inter', [FALLBACK_KEY]: 'Georgia', _x_extension_language_2024_unique_: 'en' } });
  await wait(50);
  assert.ok(!(FAMILY_KEY in worker.storage.sync.data) && !(FALLBACK_KEY in worker.storage.sync.data),
    'copies an earlier build left in browser sync should be removed');
  assert.strictEqual(worker.storage.sync.data._x_extension_language_2024_unique_, 'en');
}

function testLocales() {
  const expected = {
    en: ['Local font', 'Default', 'Search fonts', 'No matching fonts', 'Local fallback font', 'None'],
    ja: ['ローカルフォント', 'デフォルト', 'フォントを検索', '一致するフォントがありません', 'ローカルフォールバックフォント', 'なし'],
    zh_CN: ['本地字体', '默认', '搜索字体', '没有匹配的字体', '本地回退字体', '无'],
    zh_TW: ['本機字型', '預設', '搜尋字型', '沒有符合的字型', '本機後備字型', '無']
  };
  const notSynced = { en: /not synced/, ja: /同期されません/, zh_CN: /不会同步/, zh_TW: /不會同步/ };
  Object.entries(expected).forEach(([locale, labels]) => {
    const data = JSON.parse(read(`_locales/${locale}/messages.json`));
    assert.deepStrictEqual([
      data.settings_overlay_font_title.message,
      data.settings_overlay_font_default.message,
      data.settings_overlay_font_search_placeholder.message,
      data.settings_overlay_font_no_results.message,
      data.settings_overlay_font_fallback_title.message,
      data.settings_overlay_font_fallback_none.message
    ], labels);
    assert.ok(data.settings_overlay_font_fallback_desc.message);
    assert.ok(data.settings_overlay_font_unsupported_tooltip.message);
    assert.match(data.settings_overlay_font_desc.message, notSynced[locale], `${locale} should say the fonts are not synced`);
    ['settings_overlay_font_missing', 'settings_overlay_font_fallback_missing'].forEach((key) => {
      assert.match(data[key].message, /\{font\}/, `${locale}.${key} should name the missing font`);
    });
    assert.ok(data.settings_overlay_font_missing_reset.message);
    assert.ok(data.settings_overlay_font_fallback_missing_reset.message);
  });
}

(async () => {
  await testOverlayAppliesTheDeviceFont();
  testStylesheetsUseTheToken();
  await testFontsStayOnTheDevice();
  testLocales();
  console.log('overlay font tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
