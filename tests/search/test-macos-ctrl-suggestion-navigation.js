const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { createOptionsPage } = require('../helpers/options-page');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');

// A Labs experiment lets Ctrl+N / Ctrl+P move through results on macOS, as in
// Emacs-style text fields. The key mapping itself is unit-tested in
// test-search-result-number-shortcuts.js.

const KEY = '_x_extension_macos_ctrl_suggestion_navigation_enabled_2026_unique_';
const TOGGLE = '_x_extension_macos_ctrl_suggestion_navigation_toggle_2026_unique_';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const RESULTS = Array.from({ length: 3 }, (_, index) => ({ type: 'history', title: `Result ${index}`, url: `https://r${index}.test/` }));

async function testSurfacesFollowTheExperiment(name) {
  for (const enabled of [true, false]) {
    const values = { [KEY]: enabled };
    const surface = await openSearchSurface(name, Object.assign(
      { userAgent: MAC_UA, respond: (message) => (message.action === 'getSearchSuggestions' ? { suggestions: RESULTS } : undefined) },
      name === 'overlay' ? { settings: values } : { sync: values, platform: 'MacIntel' }
    ));
    await surface.type('result');
    await surface.settle(150);
    assert.strictEqual(surface.selectedIndex(), 0);
    surface.press('n', { code: 'KeyN', ctrlKey: true });
    await surface.settle(40);
    assert.strictEqual(surface.selectedIndex(), enabled ? 1 : 0, `${name}: Ctrl+N should ${enabled ? '' : 'not '}move down with the experiment ${enabled ? 'on' : 'off'}`);
    assert.strictEqual(surface.input().value, 'result', `${name}: Ctrl+N should not type into the query`);
    if (enabled) {
      surface.press('p', { code: 'KeyP', ctrlKey: true });
      await surface.settle(40);
      assert.strictEqual(surface.selectedIndex(), 0, `${name}: Ctrl+P should move back up`);
    }
    surface.press('ArrowDown');
    await surface.settle(40);
    assert.strictEqual(surface.selectedIndex(), 1, `${name}: arrow keys work either way`);
    surface.close();
  }
}

async function testSettingsLabsToggle() {
  const doc = new JSDOM(fs.readFileSync('src/options/options.html', 'utf8')).window.document;
  const toggle = doc.getElementById(TOGGLE);
  assert.ok(toggle && toggle.closest('[data-content="labs"]'), 'the opt-in control should live in Labs');
  assert.strictEqual(toggle.checked, false, 'the experiment should start off');

  const page = await createOptionsPage();
  const control = page.byId(TOGGLE);
  assert.strictEqual(control.checked, false);
  await page.choose(control, true);
  await page.settle(60);
  assert.ok(page.storage.sync.writes.some((write) => write[KEY] === true), 'turning it on should save the preference');
  page.close();
}

function testCreditsAndCopy() {
  assert.match(fs.readFileSync('README.md', 'utf8'), /wanghanzhen[\s\S]*?pull\/38/,
    'Credits should retain the original contributor and PR attribution');
  ['en', 'ja', 'zh_CN', 'zh_TW'].forEach((locale) => {
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    assert.ok(messages.settings_macos_ctrl_suggestion_navigation_title?.message, `${locale} title`);
    assert.ok(messages.settings_macos_ctrl_suggestion_navigation_desc?.message, `${locale} description`);
  });
}

(async () => {
  for (const name of SURFACES) {
    await testSurfacesFollowTheExperiment(name);
  }
  await testSettingsLabsToggle();
  testCreditsAndCopy();
  console.log('macOS Ctrl suggestion navigation experiment tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
