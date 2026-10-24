const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { readPageSource } = require('../helpers/page-source');
const { readBackgroundSource } = require('../helpers/background-source');
const { createNewtabPage } = require('../helpers/newtab-page');
const { getBundleFiles, getPageScripts } = require('../helpers/runtime-scripts');

// The motion effects setting turns off the New Tab and overlay entrances.
// (The overlay's is covered by tests/overlay/test-overlay-entry-motion.js;
// New Tab's sequence by tests/newtab/test-newtab-page-layout.js.)

const MOTION_KEY = '_x_extension_motion_effects_enabled_2026_unique_';
const tabSwitcherSource = fs.readFileSync('src/overlay/tab-switcher.ts', 'utf8');
const backgroundSource = readBackgroundSource();
const selectionActionsSource = fs.readFileSync('src/content/selection-quick-actions.ts', 'utf8');

const optionsDocument = new JSDOM(readPageSource('src/options/options.html')).window.document;
const appearance = optionsDocument.querySelector('[data-content="appearance"]');
const themeRow = appearance.querySelector('#_x_extension_theme_mode_row_2026_unique_');
const motionTitle = appearance.querySelector('[data-i18n="settings_motion_effects_title"]');
const newtabSection = appearance.querySelector('[data-i18n="settings_newtab_section_title"]');
assert.ok(themeRow, 'appearance should keep the global theme setting');
assert.ok((themeRow.compareDocumentPosition(motionTitle) & 4) && (motionTitle.compareDocumentPosition(newtabSection) & 4),
  'motion effects should appear in Appearance between theme and New Tab settings');
const tooltip = appearance.querySelector('[data-i18n-tooltip="settings_motion_effects_desc"]');
assert.strictEqual(tooltip && tooltip.getAttribute('data-tooltip'), '如遇卡顿，或倾向于更利落的唤起方式，可关闭',
  'the simplified Chinese fallback should keep the requested guidance in the title tooltip');
assert.strictEqual(optionsDocument.getElementById('_x_extension_motion_effects_toggle_2026_unique_').checked, true,
  'motion effects should default to enabled in markup');

assert(getBundleFiles('newtab-preload').includes('src/shared/motion-preload.ts'),
  'New Tab should preload the synchronized entry-motion preference before it is revealed');
['src/options/options.html', 'src/onboarding/onboarding.html'].forEach((page) => {
  assert(!getPageScripts(page).includes('src/shared/motion-preload.ts'),
    'Options and Onboarding should not apply the New Tab entry-motion preference');
});

// New Tab's preload marks the saved preference before the page shows and
// follows synchronized changes; without motion the page installs every
// final entry state before it reveals itself.
async function testNewTab() {
  const order = [];
  const page = await createNewtabPage({
    sync: { [MOTION_KEY]: false },
    setup(window) {
      new window.MutationObserver((records) => records.forEach((record) => {
        const value = record.target.getAttribute(record.attributeName);
        order.push(`${record.attributeName}=${value}`);
      })).observe(window.document.body, { attributes: true, attributeFilter: ['data-nt-enter', 'data-nt-ready'] });
    }
  });
  await page.settle(400);
  const root = page.document.documentElement;
  assert.strictEqual(root.getAttribute('data-lumno-motion-effects'), 'off', 'the New Tab preload should resolve the saved entry preference');
  assert.ok(order.indexOf('data-nt-enter=done') >= 0 && order.indexOf('data-nt-enter=done') < order.indexOf('data-nt-ready=1') &&
    !order.includes('data-nt-enter=run'), `motion-free New Tabs should install the final entry state before revealing the page: ${order}`);
  assert.strictEqual(page.document.getElementById('_x_extension_newtab_root_2024_unique_').getAttribute('data-lumno-search-entry'), 'done');
  page.changeStorage('sync', MOTION_KEY, true);
  await page.settle(100);
  assert.strictEqual(root.getAttribute('data-lumno-motion-effects'), 'on', 'and react to synchronized changes');
  page.close();
}

[
  ['background', backgroundSource],
  ['Alt+Q tab switcher', tabSwitcherSource],
  ['selection quick actions', selectionActionsSource]
].forEach(([surface, source]) => {
  assert(
    !source.includes('_x_extension_motion_effects_enabled_2026_unique_'),
    `${surface} should not read the New Tab/Overlay entry-motion setting`
  );
});

const expectedCopy = {
  en: ['Motion effects', 'Turn this off if performance stutters or you prefer a snappier opening experience'],
  ja: ['アニメーション効果', '動作が重い場合や、より素早く表示したい場合はオフにできます'],
  zh_CN: ['动态效果', '如遇卡顿，或倾向于更利落的唤起方式，可关闭'],
  zh_TW: ['動態效果', '若畫面不順暢，或偏好更俐落的叫出方式，可關閉']
};
Object.entries(expectedCopy).forEach(([locale, [title, description]]) => {
  const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
  assert.strictEqual(messages.settings_motion_effects_title.message, title);
  assert.strictEqual(messages.settings_motion_effects_desc.message, description);
});

testNewTab().then(() => {
  console.log('motion effects setting tests passed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
