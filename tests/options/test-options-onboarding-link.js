const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { parsePageCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');
const { readPageSource } = require('../helpers/page-source');

const repoRoot = path.join(__dirname, '..', '..');
const optionsDocument = new JSDOM(readPageSource('src/options/options.html')).window.document;
const optionsCss = parsePageCss('src/options/options.html');
const onboardingContent = require('../../src/onboarding/onboarding-content.ts');

const buttonId = '_x_extension_open_onboarding_page_2026_unique_';
const labelKey = 'settings_onboarding_tutorial_action';
const versionButtonId = '_x_extension_settings_version_2024_unique_';
const versionButtonClass = '_x_extension_settings_version_badge_2024_unique_';
const versionTooltipKey = 'settings_version_tooltip';

function rule(selector) {
  const found = optionsCss.rule(selector);
  assert.ok(found, `${selector} should exist in options CSS`);
  return found;
}

assert.ok(onboardingContent.getOnboardingBlueprint('en').slides.some((slide) => slide.actions.ghost &&
  slide.actions.ghost.icon === 'ri-external-link-line'),
'onboarding should keep the reference ghost action icon used by the options tutorial link');

// The guide is a card of its own, beside the Help Center's.
const cardClass = '_x_extension_feedback_support_help_card_2026_unique_';

const version = optionsDocument.getElementById(versionButtonId);
assert.ok(version && version.tagName === 'BUTTON' && version.type === 'button' && version.classList.contains(versionButtonClass),
  'options version label should be a clickable button');
assert.deepStrictEqual([version.getAttribute('data-tooltip'), version.getAttribute('data-i18n-tooltip')], ['查看更新日志', versionTooltipKey]);
assert.strictEqual(rule(`.${versionButtonClass}`).get('cursor'), 'pointer', 'options version button should advertise clickability');
assert.strictEqual(rule(`.${versionButtonClass}:hover`).get('background'), 'rgba(255, 255, 255, 0.56)',
  'options version button should show a visible light-mode background on hover');
assert.strictEqual(rule(`body[data-theme="dark"] .${versionButtonClass}:hover`).get('background'), 'rgba(255, 255, 255, 0.12)',
  'options version button should show a visible dark-mode background on hover');

['en', 'ja', 'zh_CN', 'zh_TW'].forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales', locale, 'messages.json'), 'utf8'));
  assert.ok(messages[labelKey] && messages[labelKey].message, `${locale} should localize the onboarding tutorial label`);
  assert.ok(messages[versionTooltipKey] && messages[versionTooltipKey].message, `${locale} should localize the version changelog tooltip`);
});

// Both buttons ask the background page to open their page.
(async () => {
  const page = await createOptionsPage({});
  await page.settle(200);
  const button = page.byId(buttonId);
  assert.ok(button && button.tagName === 'BUTTON' && button.classList.contains(cardClass),
    'the onboarding tutorial should be a card like the Help Center');
  assert.ok(button.previousElementSibling && button.previousElementSibling.querySelector('[data-feedback-support="help-center"]'),
    'the onboarding tutorial should sit just after the Help Center card');
  assert.strictEqual(button.textContent, '新手引导');
  assert.ok(button.querySelector('i.ri-compass-3-line') && !button.querySelector('i.ri-external-link-line'),
    'with its own icon and no external-link mark');
  await page.click(button);
  assert.ok(page.messages.some((message) => message.action === 'openOnboardingPage'),
    'clicking the tutorial action should ask the background page to open onboarding');
  await page.click(page.byId(versionButtonId));
  const release = page.messages.find((message) => message.action === 'openReleasePage');
  assert.ok(release && release.reason === 'options-version' && release.disposition,
    'clicking the version button should ask the background page to open the official release page');
  page.close();
  console.log('options onboarding link tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
