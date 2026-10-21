const assert = require('assert');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

// Commands and keyword shortcuts typed into the real overlay.

const DOCUMENT_PIP_KEY = '_x_extension_document_pip_enabled_2026_unique_';
const EDGE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/149.0 Safari/537.36 Edg/149.0';

function suggestionsOf(page) {
  return page.suggestions().map((row) => row._xSuggestion || {});
}

async function testKeywordShortcutsPointAtTheCurrentBrowser() {
  for (const [userAgent, scheme] of [[EDGE_USER_AGENT, 'edge://'], [undefined, 'chrome://']]) {
    const page = await createOverlayPage({ userAgent });
    await page.open();
    await page.type('扩展程序');
    await page.waitFor(() => suggestionsOf(page).some((item) => item.type === 'browserPage'),
      'the extensions keyword should offer the browser page');
    const browserPage = suggestionsOf(page).find((item) => item.type === 'browserPage');
    assert.strictEqual(browserPage.url, `${scheme}extensions/`, `the keyword should open ${scheme}extensions/ in this browser`);
    page.close();
  }
}

async function testClipCommandFollowsTheWebClipSetting() {
  const setup = (window) => {
    window.documentPictureInPicture = { requestWindow() {} };
  };
  const off = await createOverlayPage({ setup, settings: { [DOCUMENT_PIP_KEY]: false } });
  await off.open({ documentPipEnabled: false });
  await off.type('/clip');
  assert.ok(!suggestionsOf(off).some((item) => item.type === 'commandDocumentPip'),
    'with web clip off, /clip should not offer the clip command');
  off.changeSetting(DOCUMENT_PIP_KEY, true);
  await off.type('/cli');
  await off.type('/clip');
  await off.waitFor(() => suggestionsOf(off).some((item) => item.type === 'commandDocumentPip'),
    'turning web clip on in Settings should show the command in an open overlay');
  off.close();

  const on = await createOverlayPage({ setup, settings: { [DOCUMENT_PIP_KEY]: true } });
  await on.open({ documentPipEnabled: true });
  await on.type('/clip');
  await on.waitFor(() => suggestionsOf(on).some((item) => item.type === 'commandDocumentPip'), 'the clip command should show');
  const before = on.messages.length;
  on.press('Enter');
  await on.settle(30);
  assert.ok(on.messages.slice(before).some((message) => message.action === 'openDocumentPipPicker'),
    'choosing the clip command should ask the background for the picker');
  assert.strictEqual(on.host(), null, 'the overlay should close to let the user pick');
  on.close();

  const unsupported = await createOverlayPage({ settings: { [DOCUMENT_PIP_KEY]: true } });
  await unsupported.open({ documentPipEnabled: true });
  await unsupported.type('/clip');
  assert.ok(!suggestionsOf(unsupported).some((item) => item.type === 'commandDocumentPip'),
    'a browser without Document Picture-in-Picture should not offer the command even when the setting syncs on');
  unsupported.close();
}

(async () => {
  await testKeywordShortcutsPointAtTheCurrentBrowser();
  await testClipCommandFollowsTheWebClipSetting();
  console.log('overlay command tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
