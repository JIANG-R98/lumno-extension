const assert = require('assert');
const { JSDOM } = require('jsdom');
const { HOST_ID } = require('../../src/shared/ui/community-qr-dialog.js');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');
const { moduleScript } = require('../helpers/module-script');


const dom = new JSDOM(
  '<html style="overflow-y: scroll"><body><button id="trigger">Join</button></body></html>',
  { url: 'https://lumno.test/', pretendToBeVisual: true, runScripts: 'outside-only' }
);
const { window } = dom;
window.eval(moduleScript('src/shared/ui/community-qr-dialog.js', 'LumnoCommunityQrDialog'));
const dialog = window.LumnoCommunityQrDialog;
const { document } = window;
const trigger = document.getElementById('trigger');
trigger.focus();

const controller = dialog.open({
  imageUrl: 'https://lumno.kubai.design/qrcode.webp',
  title: 'Bug 反馈 & 新功能提需',
  alt: 'Lumno 微信群二维码',
  closeLabel: '关闭',
  theme: 'dark',
  returnFocus: trigger
});
const host = document.getElementById(dialog.HOST_ID);
assert.ok(host && controller, 'opening shows the dialog over the page');
assert.strictEqual(host.getAttribute('data-theme'), 'dark', 'the dialog follows the surface theme');
const shadow = host.shadowRoot;
assert.strictEqual(shadow.querySelector('img').getAttribute('src'), 'https://lumno.kubai.design/qrcode.webp');
assert.strictEqual(shadow.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
assert.strictEqual(shadow.activeElement, shadow.querySelector('.close'), 'focus moves into the dialog');
assert.strictEqual(document.documentElement.style.overflowY, 'scroll', 'the page keeps its scrollbar');
assert.strictEqual(document.body.getAttribute('style'), null, 'the page body is left untouched');

const wheel = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
shadow.querySelector('.backdrop').dispatchEvent(wheel);
assert.ok(wheel.defaultPrevented, 'the page behind cannot scroll while the dialog is open');

let pageSawEscape = false;
document.addEventListener('keydown', () => {
  pageSawEscape = true;
});
shadow.querySelector('.close').dispatchEvent(new window.KeyboardEvent('keydown', {
  key: 'Escape',
  bubbles: true,
  composed: true,
  cancelable: true
}));
assert.strictEqual(dialog.isOpen(), false, 'Escape closes the dialog');
assert.strictEqual(pageSawEscape, false, 'Escape does not reach the page or the search box behind');
assert.strictEqual(document.activeElement, trigger, 'focus returns to where it was');

dialog.open({ imageUrl: 'https://lumno.kubai.design/a.webp' });
dialog.open({ imageUrl: 'https://lumno.kubai.design/b.webp' });
assert.strictEqual(dialog.isOpen(), true);
dialog.close();
assert.strictEqual(dialog.open({ imageUrl: '' }), null, 'nothing opens without a QR image');

// Joining the WeChat group never opens the QR image in a new tab.
const { getInjectedScripts, getPageScripts, runsBefore } = require('../helpers/runtime-scripts');
assert.ok(
  runsBefore(getInjectedScripts('overlay'), 'src/shared/community-links.js', 'src/shared/ui/community-qr-dialog.js'),
  'the overlay loads the dialog'
);
assert.ok(getPageScripts('newtab.html').includes('src/shared/ui/community-qr-dialog.js'), 'the new tab loads the dialog');

// The Help Center search offers the WeChat group when nothing matched; by
// click or by Enter it opens the dialog on both surfaces. (The New Tab
// engagement prompt's group action is in test-engagement-notice.js.)
async function testHelpSearchOpensTheDialog(name, how) {
  const stored = { _x_extension_language_2024_unique_: 'zh-CN' };
  const surface = await openSearchSurface(name, Object.assign(
    name === 'overlay' ? { settings: stored } : { sync: stored, local: stored },
    { respond: (message) => (message.action === 'getHelpCenterSearchResults' ? { items: [] } : undefined) }
  ));
  await surface.settle(150);
  await surface.type('lm');
  surface.press('Tab');
  await surface.settle(200);
  await surface.type('zzz');
  await surface.settle(400);
  const rows = surface.suggestions();
  const community = rows.findIndex((row) => row.textContent.includes('加入反馈群'));
  assert.ok(community > 0, `${name}: an unmatched help search should offer the WeChat group`);
  if (how === 'click') {
    rows[community].dispatchEvent(new surface.page.window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));
  } else {
    for (let index = surface.selectedIndex(); index < community; index += 1) {
      surface.press('ArrowDown');
      await surface.settle(20);
    }
    assert.strictEqual(surface.selectedIndex(), community);
    surface.press('Enter');
  }
  await surface.settle(200);
  const pageDocument = surface.page.document || surface.page.window.document;
  const sent = surface.page.messages || surface.page.sentMessages || [];
  assert.ok(pageDocument.getElementById(HOST_ID), `${name}: ${how} should open the QR dialog`);
  assert.ok(!sent.some((message) => message.action === 'createTab'), `${name}: without opening the QR image in a tab`);
  surface.close();
}

window.close();

(async () => {
  for (const name of SURFACES) {
    await testHelpSearchOpensTheDialog(name, 'click');
    await testHelpSearchOpensTheDialog(name, 'Enter');
  }
  console.log('Community QR dialog tests passed.');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
