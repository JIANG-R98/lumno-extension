const assert = require('assert');
const communityLinks = require('../../src/domain/community-links');
const feedback = require('../../src/options/options-feedback-support');

const getMessage = (key, fallback) => `${key}|${fallback}`;
const links = Object.assign({}, communityLinks.FALLBACK_LINKS, {
  wechatQr: 'https://example.com/qr.png',
  githubIssue: 'https://github.com/example/issues/new',
  x: 'https://x.com/example',
  licenses: 'https://example.com/notices'
});

assert.strictEqual(feedback.getFeedbackSupportWebLocale('zh_CN'), 'zh-CN');
assert.strictEqual(feedback.getFeedbackSupportWebLocale('zh_TW'), 'zh-TW');
assert.strictEqual(feedback.getFeedbackSupportWebLocale('ja'), 'ja');
assert.strictEqual(feedback.getFeedbackSupportWebLocale('de'), 'en');

function model(webLocale, helpCenterSearchEnabled) {
  return feedback.buildFeedbackSupportModel({
    communityLinks, getMessage, helpIconUrl: 'icon.png', helpCenterSearchEnabled, links, webLocale
  });
}

// Chinese readers get the WeChat group first, with its QR popover.
{
  const zh = model('zh-CN', true);
  assert.deepStrictEqual(zh.items.map((item) => item.key), ['community', 'chrome-review', 'github-issue', 'contact-author']);
  assert.strictEqual(zh.items[0].href, links.wechatQr);
  assert.strictEqual(zh.items[0].qr.imageUrl, links.wechatQr);
  assert.strictEqual(zh.help.href, communityLinks.getHelpUrl('zh-CN'));
  assert.strictEqual(zh.help.ask.iconUrl, 'icon.png');
  assert.strictEqual(model('zh-TW', true).items[0].key, 'community');
}

// Elsewhere contacting the author on X is the community entry.
{
  const en = model('en', false);
  assert.deepStrictEqual(en.items.map((item) => item.key), ['chrome-review', 'github-issue', 'contact-author']);
  assert.strictEqual(en.help.ask, null, 'the ask demo hides while the lm site search is off');
  assert.strictEqual(model('ja', null).help.ask, null, 'and until the providers have loaded');
}

// "Rate Lumno" opens the review page of the store this copy came from.
{
  const reviewHref = () => model('en', false).items.find((item) => item.key === 'chrome-review').href;
  const previousChrome = globalThis.chrome;
  try {
    globalThis.chrome = { runtime: { id: 'nggfkkbmogmadfoikakkfegkoilfcfao' } };
    assert.strictEqual(reviewHref(), links.chromeReview);
    globalThis.chrome = { runtime: { id: 'lumno@kubai087' } };
    assert.strictEqual(reviewHref(), 'https://addons.mozilla.org/firefox/addon/lumno-command-bar-new-tab/reviews/');
  } finally {
    globalThis.chrome = previousChrome;
  }
}

// The section renders the bundled links at once and the remote ones once loaded,
// and keeps the licenses link in the Global settings header on the same URL.
(async () => {
  const rendered = [];
  const licensesLink = { href: '' };
  let resolveLoad;
  const section = feedback.createFeedbackSupportSection({
    communityLinks: Object.assign({}, communityLinks, {
      load: () => new Promise((resolve) => { resolveLoad = resolve; })
    }),
    controller: { render: (value) => rendered.push(value) },
    getLocale: () => 'zh_CN',
    getMessage,
    helpIconUrl: 'icon.png',
    isHelpCenterSearchEnabled: () => true,
    licensesLink
  });
  section.render();
  assert.strictEqual(rendered[0].items[0].href, communityLinks.FALLBACK_LINKS.wechatQr);
  assert.strictEqual(licensesLink.href, 'https://github.com/kubai087/lumno-extension/blob/main/THIRD_PARTY_NOTICES.md',
    'the licenses link should open the third-party notices on GitHub');
  const loading = section.loadLinks();
  resolveLoad(links);
  await loading;
  assert.strictEqual(rendered[1].items[0].href, links.wechatQr);
  assert.strictEqual(licensesLink.href, links.licenses);
  feedback.createFeedbackSupportSection({
    communityLinks, controller: null, getLocale: () => 'en', getMessage, isHelpCenterSearchEnabled: () => false
  }).render();
  console.log('Options feedback support section tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
