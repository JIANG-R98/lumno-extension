const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const settings = require('../../src/domain/settings.ts');
const { parsePageCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');
const { readPageSource } = require('../helpers/page-source');
const { getPageScripts } = require('../helpers/runtime-scripts');

const repoRoot = path.resolve(__dirname, '..', '..');
const HOST_ID = '_x_extension_feedback_support_2026_unique_';
const locales = ['zh_CN', 'zh_TW', 'ja', 'en'];
const ACTION_KEYS = [
  'settings_feedback_support_wechat_action',
  'settings_feedback_support_review_action',
  'settings_feedback_support_github_issue_action',
  'settings_feedback_support_licenses_action',
  'settings_feedback_support_contact_author_action'
];
const readMessages = (locale) => JSON.parse(fs.readFileSync(path.join(repoRoot, `_locales/${locale}/messages.json`), 'utf8'));

function testMarkupAndStyles() {
  const doc = new JSDOM(readPageSource('src/options/options.html')).window.document;
  const host = doc.getElementById(HOST_ID);
  const globalSettings = doc.querySelector('[data-i18n="settings_global_section_title"]');
  assert.ok(host, 'general settings should include the feedback support React host');
  assert.ok(host.compareDocumentPosition(globalSettings) & 4, 'feedback support should appear above global settings');
  const css = parsePageCss('src/options/options.html');
  const links = css.rule('._x_extension_feedback_support_links_2026_unique_');
  assert.deepStrictEqual(links && ['display', 'grid-auto-flow', 'grid-auto-columns'].map((name) => links.get(name)), ['grid', 'column', 'minmax(0, 1fr)'],
    'feedback channels should sit in one row of equal-width tiles');
  const link = css.rule('._x_extension_feedback_support_link_2026_unique_');
  assert.strictEqual(link && link.get('background'), 'var(--feedback-support-link-bg)', 'feedback channels should keep their filled tile surface');
  assert.ok(getPageScripts('src/options/options.html').includes('src/domain/community-links.ts'),
    'Options should load the shared remote community links runtime');
}

function testCopy() {
  locales.forEach((locale) => {
    const messages = readMessages(locale);
    assert.ok(messages.settings_feedback_support_section_title && messages.settings_feedback_support_section_title.message,
      `${locale} should localize the feedback support heading`);
    ACTION_KEYS.forEach((key) => {
      assert.ok(messages[key] && messages[key].message, `${locale} should provide ${key}`);
    });
    assert.ok(messages.settings_help_center_desc_with_ask.message.includes('{ask}'),
      `${locale} should place the ask-in-the-search-box words inside the Help Center description`);
  });
  assert.deepStrictEqual(ACTION_KEYS.map((key) => readMessages('zh_CN')[key].message), ['加入反馈群', '为 Lumno 评分', '创建 Issue', '开源许可', '联系作者'],
    'Simplified Chinese feedback links should use the requested copy');
}

async function openPage(language, disabledSiteSearch) {
  const page = await createOptionsPage({
    sync: { [settings.LANGUAGE_STORAGE_KEY]: language, [settings.SITE_SEARCH_DISABLED_STORAGE_KEY]: disabledSiteSearch || [] }
  });
  await page.settle(400);
  page.channels = () => Array.from(page.byId(HOST_ID).querySelectorAll('._x_extension_feedback_support_link_2026_unique_'));
  page.helpCenter = () => {
    const host = page.byId(HOST_ID);
    if (host.querySelector('[data-feedback-support="help-center-ask"]')) return 'ask';
    if (host.querySelector('[data-feedback-support="help-center"]')) return 'link';
    return null;
  };
  return page;
}

// Feedback channels are external links with an icon, a label and an
// external-link mark. The community channel is the WeChat group (a QR
// dialog) on Chinese pages and X elsewhere.
async function testChannels() {
  const zh = await openPage('zh-CN');
  const en = await openPage('en');
  [zh, en].forEach((page) => {
    const external = page.channels().filter((link) => link.tagName === 'A');
    assert.ok(external.length >= 3, 'the feedback channels should render');
    external.forEach((link) => {
      const icons = Array.from(link.querySelectorAll('i')).map((icon) => icon.className);
      assert.ok(link.getAttribute('href') && link.target === '_blank', 'feedback entries should render as direct external links');
      assert.ok(icons.length === 2 && icons[1].includes('ri-external-link-line') && link.querySelector('span[data-i18n]').textContent,
        'every feedback entry should keep its channel icon, label and external-link mark');
    });
  });
  const community = (page) => page.byId(HOST_ID).querySelector('[data-feedback-support="community"]');
  const zhCommunity = community(zh);
  assert.ok(zhCommunity && zhCommunity.getAttribute('aria-haspopup') === 'dialog' && zhCommunity.querySelector('.ri-wechat-line'),
    'Chinese Options should offer the WeChat group');
  assert.ok(!en.byId(HOST_ID).querySelector('.ri-wechat-line') &&
    en.channels().some((link) => /^https:\/\/x\.com\//.test(link.getAttribute('href') || '')),
  'English Options should offer X instead of WeChat');
  [zh, en].forEach((page) => {
    const licenses = page.byId('_x_extension_open_licenses_2026_unique_');
    assert.ok(licenses && licenses.getAttribute('href') === 'https://github.com/kubai087/lumno-extension/blob/main/THIRD_PARTY_NOTICES.md',
      'the open-source licenses link should open the third-party notices on GitHub');
    assert.ok(!page.byId(HOST_ID).contains(licenses) &&
      licenses.nextElementSibling === page.byId('_x_extension_open_onboarding_page_2026_unique_') &&
      licenses.target === '_blank' && licenses.rel.includes('noopener'),
    'the licenses link should sit just left of the onboarding guide in the Global settings header');
  });
  zh.close();
  en.close();
}

// "Ask in the search box" follows the Help Center site search (lm): with
// lm off the row links to the Help Center instead, and it follows changes.
async function testHelpCenterAskFollowsTheSiteSearch() {
  const on = await openPage('en');
  assert.strictEqual(on.helpCenter(), 'ask', 'with lm on, the Help Center row should offer asking in the search box');
  on.changeStorage('sync', settings.SITE_SEARCH_DISABLED_STORAGE_KEY, ['lm']);
  await on.settle(300);
  assert.strictEqual(on.helpCenter(), 'link', 'turning lm off should re-render the feedback section');
  on.close();

  const off = await openPage('en', ['lm']);
  assert.strictEqual(off.helpCenter(), 'link', 'with lm off, the row should link to the Help Center');
  off.changeStorage('sync', settings.SITE_SEARCH_DISABLED_STORAGE_KEY, []);
  await off.settle(300);
  assert.strictEqual(off.helpCenter(), 'ask', 'turning lm back on should bring back the ask demo');
  off.close();
}

(async () => {
  testMarkupAndStyles();
  testCopy();
  await testChannels();
  await testHelpCenterAskFollowsTheSiteSearch();
  console.log('options feedback support tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
