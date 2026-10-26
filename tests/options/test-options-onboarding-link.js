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
const buttonClass = '_x_extension_onboarding_guide_button_2026_unique_';
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

const ghost = rule(`._x_extension_shortcut_submit_2024_unique_.${buttonClass}`);
assert.deepStrictEqual(
  ['margin-left', '--settings-button-min-height', '--settings-button-padding', '--settings-button-bg', '--settings-button-shadow', 'white-space']
    .map((name) => ghost.get(name)),
  ['auto', '28px', '0 10px', 'transparent', 'none', 'nowrap'],
  'tutorial action should stay compact and ghost-styled'
);
assert.strictEqual(ghost.get('--settings-button-hover-bg'), 'rgba(15, 23, 42, 0.045)', 'tutorial ghost action should only gain a background on hover');
const dark = rule(`body[data-theme="dark"] .${buttonClass}`);
assert.deepStrictEqual(
  ['--settings-button-color', '--settings-button-bg', '--settings-button-shadow', '--settings-button-hover-bg', '--settings-button-hover-color']
    .map((name) => dark.get(name)),
  ['var(--panel-subtext)', 'transparent', 'none', 'color-mix(in srgb, var(--control-hover-bg) 72%, transparent)', 'var(--panel-text)'],
  'dark tutorial ghost action should use dark tokens and expose its hover as variant tokens'
);
assert.strictEqual(optionsCss.rule(`body[data-theme="dark"] .${buttonClass}:hover`), null,
  'dark tutorial ghost action should not need a separate hover selector');

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
  assert.ok(button && button.tagName === 'BUTTON' && button.classList.contains(buttonClass),
    'general settings header should expose a compact onboarding tutorial ghost action');
  assert.strictEqual(button.querySelector('span').textContent, '新手引导');
  assert.ok(button.querySelector('i.ri-icon.ri-external-link-line'), 'with the onboarding ghost icon');
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
