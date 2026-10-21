const assert = require('assert');
const { createOptionsPage } = require('../helpers/options-page');

// Copy and links on the Settings page that depend on the platform and on how
// the user clicks.

async function testVersionBadgeOpensTheReleasePage() {
  const page = await createOptionsPage();
  const badge = page.byId('_x_extension_settings_version_2024_unique_');
  const releaseRequests = () => page.messages.filter((message) => message.action === 'openReleasePage');
  const press = (type, init) => {
    badge.dispatchEvent(new page.window.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true }, init)));
  };
  press('click', { button: 0 });
  press('click', { button: 0, metaKey: true });
  press('auxclick', { button: 1 });
  press('auxclick', { button: 2 });
  await page.settle();
  assert.deepStrictEqual(releaseRequests().map((message) => [message.reason, message.disposition]), [
    ['options-version', 'newTab'],
    ['options-version', 'backgroundTab'],
    ['options-version', 'backgroundTab']
  ], 'a click should open the release page in a new tab, a modified or middle click behind it, a right click not at all');
  page.close();
}

async function testTabSwitcherShortcutFollowsThePlatform() {
  const description = (page) => page.document.querySelector('[data-i18n="settings_tab_switcher_desc"]').textContent;
  const mac = await createOptionsPage({ platform: 'MacIntel' });
  assert.match(description(mac), /⌥Q/, 'on macOS the default shortcut should read ⌥Q');
  mac.close();
  const windows = await createOptionsPage({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/149.0' });
  assert.match(description(windows), /Alt\+Q/, 'elsewhere it should read Alt+Q');
  assert.doesNotMatch(description(windows), /\{shortcut\}/);
  windows.close();
}

(async () => {
  await testVersionBadgeOpensTheReleasePage();
  await testTabSwitcherShortcutFollowsThePlatform();
  console.log('options page link tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
