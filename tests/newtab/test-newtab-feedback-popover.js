const assert = require('assert');
const fs = require('fs');
const path = require('path');
const communityLinks = require('../../src/shared/community-links.js');
const { parsePageCss } = require('../helpers/css-rules');
const { createNewtabPage } = require('../helpers/newtab-page');
const { getPageScripts } = require('../helpers/runtime-scripts');

// The New Tab feedback button: a popover of feedback channels that can open
// a WeChat group panel with a QR code the user can refresh. Its look is read
// from the stylesheets; the rest runs on the page.

const repoRoot = path.resolve(__dirname, '..', '..');
const zhCnMessages = JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales/zh_CN/messages.json'), 'utf8'));
const zhTwMessages = JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales/zh_TW/messages.json'), 'utf8'));
const enMessages = JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales/en/messages.json'), 'utf8'));
const jaMessages = JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales/ja/messages.json'), 'utf8'));

function getMessage(messages, key) {
  const item = messages[key];
  assert.ok(item && typeof item.message === 'string', `${key} should be localized`);
  return item.message;
}

function testStyles() {
  const css = parsePageCss('newtab.html');
  const popover = css.rule('.x-nt-feedback-popover');
  assert.match(popover.get('transition'), /opacity 170ms ease, transform 360ms cubic-bezier\(0\.2, 1\.45, 0\.35, 1\)/,
    'the popover should open like the menu surfaces');
  assert.match(popover.get('transition'), /width 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\), height 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
    'and resize without a bounce');
  // Four 34px icons, three 6px gaps and 8px side padding, with room above and below.
  assert.deepStrictEqual([popover.get('width'), popover.get('height'), popover.get('padding')], ['170px', '54px', '10px 8px']);
  assert.deepStrictEqual([popover.get('contain'), popover.get('overflow')], ['layout', 'visible'],
    'the collapsed row should let icon rings and shadows paint outside it');
  assert.strictEqual(css.rule('.x-nt-feedback-popover', /corner-shape/).get('corner-shape'), 'superellipse(1.25)');
  assert.strictEqual(css.rule('.x-nt-feedback-control[data-detail-open="true"] .x-nt-feedback-popover').get('overflow'), 'hidden',
    'the QR panel should clip');
  assert.strictEqual(css.rule('.x-nt-feedback-control[data-detail-open="true"] .x-nt-feedback-menu').get('visibility'), 'hidden',
    'the QR panel should replace the icon row');
  const action = css.rule('.x-nt-feedback-action');
  assert.deepStrictEqual([action.get('position'), action.get('overflow'), action.get('background'), action.get('border')],
    ['relative', 'visible', 'transparent', '0'], 'the action circle should paint outside its 34px hit target');
  const circle = css.rule('.x-nt-feedback-action::before');
  assert.strictEqual(circle.get('inset'), '-1px', 'the circle is drawn outward by a pseudo-element');
  assert.ok(circle.get('background'));
  const community = css.rule('.x-nt-feedback-action-community::before').get('box-shadow');
  assert.match(community, /^0 0 0 1px #12161f,/, 'the community ring should sit outside the circle face');
  assert.match(community, /inset 0 1px 0 rgba\(255, 255, 255, 0\.18\), inset 0 1px 3px rgba\(255, 255, 255, 0\.1\), inset 0 -1px 0 rgba\(0, 0, 0, 0\.22\)/,
    'with the primary buttons\' sheen');
  assert.ok(css.rule('.x-nt-feedback-detail-actions'), 'the panel\'s icon actions should sit at the right of its header');
  const detailAction = css.rule('.x-nt-feedback-detail-action');
  assert.deepStrictEqual([detailAction.get('width'), detailAction.get('background')], ['28px', 'transparent']);
  assert.strictEqual(css.rule('.x-nt-feedback-detail-title').get('font-size'), '14px', 'the panel title should be larger than the labels');
}

// New Tab in Chinese, where the WeChat group is offered, with the community
// links request and the QR image loads under the test's control.
async function openFeedback(options) {
  const config = options || {};
  const fetched = [];
  const page = await createNewtabPage({
    sync: { _x_extension_language_2024_unique_: 'zh_CN' },
    fetch: async (url) => {
      fetched.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    },
    setup(window) {
      const Image = window.Image;
      window.Image = function QrImage() {
        const image = new Image();
        Object.defineProperty(image, 'src', {
          get: () => image.getAttribute('src'),
          set(value) {
            image.setAttribute('src', value);
            window.setTimeout(() => (config.qrFails ? image.onerror : image.onload) && (config.qrFails ? image.onerror() : image.onload()), 5);
          }
        });
        return image;
      };
    }
  });
  await page.settle(300);
  const control = page.document.querySelector('.x-nt-feedback-control');
  return { page, control, fetched };
}

async function testPopover() {
  const { page, control } = await openFeedback();
  const button = control.querySelector('.x-nt-feedback-button');
  await page.click(button);
  await page.settle(200);
  const actions = Array.from(control.querySelectorAll('.x-nt-feedback-action'));
  const icons = actions.map((action) => action.querySelector('.ri-icon').className.match(/ri-[a-z-]+-(?:line|fill)/)[0]);
  assert.ok(icons.includes('ri-star-line'), 'the store review action should use a rating star');
  const review = actions[icons.indexOf('ri-star-line')];
  assert.strictEqual(review.getAttribute('aria-label'), getMessage(zhCnMessages, 'newtab_feedback_chrome_review_tooltip'));
  const wechat = actions[icons.indexOf('ri-wechat-fill')];
  await page.click(wechat);
  await page.settle(200);
  assert.strictEqual(control.getAttribute('data-detail-open'), 'true', 'the WeChat action should open its panel');
  const detail = control.querySelector('.x-nt-feedback-detail');
  assert.strictEqual(detail.querySelector('.x-nt-feedback-detail-title').textContent, 'Bug 反馈 & 新功能提需');
  const headerIcons = Array.from(detail.querySelectorAll('.x-nt-feedback-detail-actions button')).map((item) => [item.getAttribute('aria-label'), item.querySelector('.ri-icon').className.match(/ri-(refresh|close)-line/)[0]]);
  assert.deepStrictEqual(headerIcons, [['刷新二维码', 'ri-refresh-line'], ['关闭', 'ri-close-line']], 'refresh then close, each labelled');
  const qr = detail.querySelector('.x-nt-feedback-qr-image');
  assert.deepStrictEqual([qr.getAttribute('width'), qr.getAttribute('height')], ['1080', '1596'], 'the QR image should reserve its size before loading');

  await page.click(detail.querySelector('.x-nt-feedback-detail-close'));
  await page.settle(100);
  assert.strictEqual(button.getAttribute('aria-expanded'), 'false', 'close should close the popover');
  assert.strictEqual(page.document.activeElement, button, 'and give focus back to the feedback button');
  page.close();
}

async function testRefresh(qrFails) {
  const { page, control, fetched } = await openFeedback({ qrFails });
  await page.click(control.querySelector('.x-nt-feedback-button'));
  await page.settle(150);
  await page.click(control.querySelector('.x-nt-feedback-action-community'));
  await page.settle(150);
  const before = fetched.length;
  await page.click(control.querySelector('.x-nt-feedback-detail-refresh'));
  await page.settle(300);
  assert.ok(fetched.slice(before).includes(communityLinks.COMMUNITY_LINKS_URL), 'refresh should ask for the community links again');
  const [expected, other] = ['newtab_feedback_wechat_refresh_error', 'newtab_feedback_wechat_refresh_success']
    .map((key) => getMessage(zhCnMessages, key));
  const text = page.document.body.textContent;
  assert.ok(text.includes(qrFails ? expected : other) && !text.includes(qrFails ? other : expected),
    qrFails ? 'a QR image that cannot load should say the refresh failed' : 'a fresh QR image should say it was loaded');
  page.close();
}

function testPackaging() {
  assert.ok(getPageScripts('newtab.html').includes('src/shared/community-links.js'), 'New Tab should load the shared community links');
  assert.strictEqual(getMessage(zhCnMessages, 'newtab_feedback_wechat_panel_title'), 'Bug 反馈 & 新功能提需');
  assert.strictEqual(getMessage(zhTwMessages, 'newtab_feedback_wechat_panel_title'), '問題回報與功能建議');
}

assert.deepStrictEqual(
  [
    getMessage(zhTwMessages, 'newtab_feedback_wechat_label'),
    getMessage(zhTwMessages, 'newtab_feedback_wechat_tooltip'),
    getMessage(zhTwMessages, 'newtab_feedback_wechat_qr_title'),
    getMessage(zhTwMessages, 'newtab_feedback_wechat_qr_alt')
  ],
  [
    '微信群組',
    '加入 Lumno 微信群組',
    '微信群組 QR Code',
    'Lumno 微信群組 QR Code'
  ],
  'zh-TW should use clear, consistent WeChat group copy throughout the feedback UI'
);
assert.strictEqual(
  getMessage(enMessages, 'newtab_feedback_wechat_panel_title'),
  'Bug reports & feature requests',
  'en should label the expanded wechat panel clearly'
);
assert.strictEqual(
  getMessage(jaMessages, 'newtab_feedback_wechat_panel_title'),
  '不具合・要望',
  'ja should label the expanded wechat panel clearly'
);

[
  [
    zhCnMessages,
    {
      refresh: '刷新二维码',
      success: '已拉取最新二维码',
      error: '刷新失败，请稍后重试。',
      close: '关闭'
    },
    'zh-CN'
  ],
  [
    zhTwMessages,
    {
      refresh: '重新載入 QR Code',
      success: '已載入最新 QR Code',
      error: '無法更新 QR Code，請稍後再試。',
      close: '關閉'
    },
    'zh-TW'
  ],
  [
    enMessages,
    {
      refresh: 'Refresh QR code',
      success: 'Latest QR code loaded',
      error: "Couldn't refresh. Try again.",
      close: 'Close'
    },
    'en'
  ],
  [
    jaMessages,
    {
      refresh: 'QRコードを更新',
      success: '最新のQRコードを取得しました',
      error: '更新できませんでした。もう一度お試しください。',
      close: '閉じる'
    },
    'ja'
  ]
].forEach(([messages, expected, locale]) => {
  assert.strictEqual(
    getMessage(messages, 'newtab_feedback_wechat_refresh_tooltip'),
    expected.refresh,
    `${locale} should label the QR refresh icon`
  );
  assert.strictEqual(
    getMessage(messages, 'newtab_feedback_wechat_refresh_success'),
    expected.success,
    `${locale} should confirm a successful QR refresh`
  );
  assert.strictEqual(
    getMessage(messages, 'newtab_feedback_wechat_refresh_error'),
    expected.error,
    `${locale} should explain a failed QR refresh`
  );
  assert.strictEqual(
    getMessage(messages, 'newtab_feedback_wechat_close_tooltip'),
    expected.close,
    `${locale} should label the feedback close icon`
  );
});

[
  [zhCnMessages, 'zh-CN', '商店评分', '去扩展商店为 Lumno 评分'],
  [zhTwMessages, 'zh-TW', '商店評分', '到擴充功能商店為 Lumno 評分'],
  [enMessages, 'en', 'Store rating', 'Rate Lumno in the extension store'],
  [jaMessages, 'ja', 'ストアで評価', '拡張機能ストアで Lumno を評価する']
].forEach(([messages, locale, label, tooltip]) => {
  assert.strictEqual(
    getMessage(messages, 'newtab_feedback_chrome_review_label'),
    label,
    `${locale} should label the review action without naming one store`
  );
  assert.strictEqual(
    getMessage(messages, 'newtab_feedback_chrome_review_tooltip'),
    tooltip,
    `${locale} should explain the review action without naming one store`
  );
});

(async () => {
  testStyles();
  testPackaging();
  await testPopover();
  await testRefresh(false);
  await testRefresh(true);
  console.log('newtab feedback popover tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
