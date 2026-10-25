const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss, parsePageCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');

// Info buttons look the same on every page, and every info affordance in
// Settings is the shared InfoButton.

const onboardingCss = parsePageCss('src/onboarding/onboarding.html');
const infoButtonCss = parseCss(readStylesheet('src/shared/ui/info-button.css'));
const INFO = '._x_extension_info_button_2026_unique_';

function rule(css, selector) {
  const found = css.rule(selector);
  assert.ok(found, `missing CSS rule for ${selector}`);
  return found;
}

const onboardingButton = rule(onboardingCss, '.interaction-info-button');
const sharedButton = rule(infoButtonCss, INFO);
[[onboardingButton, 'onboarding info button'], [sharedButton, 'options shared info button']].forEach(([button, label]) => {
  assert.deepStrictEqual([button.get('width'), button.get('height'), button.get('border-radius')], ['20px', '20px', '999px'],
    `${label} should be a 20px circular hit area`);
});
assert.strictEqual(onboardingButton.get('color'), sharedButton.get('color'), 'onboarding and Settings info buttons should share one color');
assert.strictEqual(rule(onboardingCss, '.interaction-info-button:hover').get('background'), rule(infoButtonCss, `${INFO}:hover`).get('background'),
  'and one hover background');
['src/options/options.html', 'newtab.html'].forEach((file) => {
  assert.ok(new JSDOM(fs.readFileSync(file, 'utf8')).window.document.querySelector('link[href="../shared/ui/info-button.css"]'),
    `${file} should load the same info styles`);
});

// On the page: the static hosts are mounted with the shared button, and
// the React lists and forms use it for their own hints.
(async () => {
  const page = await createOptionsPage({});
  await page.settle(400);
  [
    '_x_extension_restricted_action_info_2026_unique_',
    '_x_extension_bookmark_rows_info_2026_unique_',
    '_x_extension_bookmark_columns_info_2026_unique_'
  ].forEach((id) => {
    const host = page.byId(id);
    assert.ok(host && host.querySelector(INFO), `${id} should be mounted with the shared info button`);
  });
  [
    ['_x_extension_blacklist_form_2026_unique_', 'the search exclusion form'],
    ['_x_extension_favicon_blacklist_form_2026_unique_', 'the icon exclusion form'],
    ['_x_extension_site_search_builtin_list_2024_unique_', 'the site search list'],
    ['_x_extension_overlay_page_theme_adaptation_row_2026_unique_', 'the webpage theme adaptation row']
  ].forEach(([id, label]) => {
    assert.ok(page.byId(id).querySelector(INFO), `${label} should reuse the shared InfoButton`);
  });
  page.close();
  console.log('info affordance consistency tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
