const assert = require('assert');
const fs = require('fs');
const path = require('path');
const settings = require('../../src/shared/settings.js');
const { parsePageCss } = require('../helpers/css-rules');
const { openSearchSurface } = require('../helpers/search-surfaces');

// /zen hides everything on New Tab but the search box, without changing what
// each section is set to show, and is remembered for the next New Tab.

const repoRoot = path.resolve(__dirname, '..', '..');
const ZEN = settings.NEWTAB_ZEN_MODE_STORAGE_KEY;
const SECTIONS = '[data-content-visible]';

function sections(page) {
  return Array.from(page.document.querySelectorAll(SECTIONS)).map((section) => ({
    configured: section.getAttribute('data-content-visible'),
    visible: section.getAttribute('data-visible')
  }));
}

async function testToggle(how, activate) {
  const surface = await openSearchSurface('newtab');
  const before = sections(surface.page);
  assert.ok(before.some((section) => section.visible === 'true'), 'New Tab should start with a visible section');
  await surface.type('/zen');
  await surface.settle(100);
  const [row] = surface.suggestions();
  assert.deepStrictEqual(row && [row._xSuggestion.type, row._xSuggestion.nextEnabled], ['zenSwitch', true], '/zen should offer to turn Zen on');
  await activate(surface, row);
  await surface.settle(100);
  const page = surface.page;
  assert.strictEqual(page.document.body.getAttribute('data-zen-mode'), 'true', `${how} on /zen should turn Zen on`);
  assert.deepStrictEqual(sections(page), before.map((section) => ({ configured: section.configured, visible: 'false' })),
    'Zen should hide every section while keeping its configuration');
  assert.ok(page.storage.sync.writes.some((write) => write[ZEN] === true), 'Zen should be remembered');

  await surface.type('/zen');
  await surface.settle(100);
  assert.strictEqual(surface.suggestions()[0]._xSuggestion.nextEnabled, false, '/zen should now offer to turn Zen off');
  surface.press('Enter');
  await surface.settle(100);
  assert.strictEqual(page.document.body.getAttribute('data-zen-mode'), 'false');
  assert.deepStrictEqual(sections(page), before, 'turning Zen off should bring the sections back as they were');
  surface.close();
}

async function testRestoredBeforeTheFirstFrame() {
  let zenWhenReady = null;
  const surface = await openSearchSurface('newtab', {
    sync: { [ZEN]: true },
    setup(window) {
      new window.MutationObserver(() => {
        if (zenWhenReady === null && window.document.body.getAttribute('data-nt-ready') === '1') {
          zenWhenReady = window.document.body.getAttribute('data-zen-mode');
        }
      }).observe(window.document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-nt-ready'] });
    }
  });
  await surface.settle(200);
  assert.strictEqual(zenWhenReady, 'true', 'a remembered Zen mode should apply before New Tab first shows');
  surface.close();
}

function testStylesAndCopy() {
  const css = parsePageCss('newtab.html');
  ['.x-nt-wallpaper-control', '.x-nt-feedback-control'].forEach((control) => {
    assert.ok(css.entries.some((entry) => entry.selectors.includes(`body[data-zen-mode="true"] ${control}`)),
      `Zen mode should hide ${control}`);
  });
  ['en', 'zh_CN', 'zh_TW', 'ja'].forEach((locale) => {
    const messages = JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales', locale, 'messages.json'), 'utf8'));
    ['zen_badge_on', 'zen_badge_off', 'zen_enable_title', 'zen_disable_title'].forEach((key) => {
      assert.ok(messages[key] && messages[key].message, `${locale} should define ${key}`);
    });
  });
}

(async () => {
  await testToggle('Enter', (surface) => surface.press('Enter'));
  await testToggle('a click', (surface, row) => row.dispatchEvent(new surface.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
  await testRestoredBeforeTheFirstFrame();
  testStylesAndCopy();
  console.log('newtab zen command tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
