const assert = require('assert');
const fs = require('fs');
const path = require('path');
const settings = require('../../src/shared/settings.ts');
const { createOptionsPage } = require('../helpers/options-page');

const repoRoot = path.join(__dirname, '..', '..');
const readMessages = (locale) => JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales', locale, 'messages.json'), 'utf8'));

// Every UI language is listed in its own words, whatever language the page is in.
async function testLanguagePickerListsEveryLocaleInItsOwnName() {
  const page = await createOptionsPage({ sync: { [settings.LANGUAGE_STORAGE_KEY]: 'ja' } });
  await page.settle(200);
  const options = Array.from(page.byId('_x_extension_language_select_2024_unique_').options)
    .map((option) => [option.value, option.textContent]);
  assert.deepStrictEqual(
    options.slice(1),
    settings.UI_LOCALES.map((locale) => [locale.htmlLang, locale.name]),
    'the picker should list each language by its own name'
  );
  assert.strictEqual(options[0][0], 'system');
  page.close();
}

// The React-owned search-result source labels follow the active language,
// from the first render on.
async function testSourceLabelsFollowTheLanguage() {
  const KEYS = ['search_tag_top_site', 'search_tag_bookmark', 'search_tag_history'];
  const expected = (locale) => KEYS.map((key) => readMessages(locale)[key].message);
  const page = await createOptionsPage({ sync: { [settings.LANGUAGE_STORAGE_KEY]: 'en' } });
  await page.settle(200);
  const labels = () => Array.from(page.byId('_x_extension_search_result_source_types_2026_unique_').querySelectorAll('label'))
    .map((label) => label.textContent.trim());
  assert.deepStrictEqual(labels(), expected('en'), 'the first render should use the active language');
  page.changeStorage('sync', settings.LANGUAGE_STORAGE_KEY, 'ja');
  await page.settle(300);
  assert.deepStrictEqual(labels(), expected('ja'), 'switching language should relabel the sources');
  page.close();
}

(async () => {
  await testLanguagePickerListsEveryLocaleInItsOwnName();
  await testSourceLabelsFollowTheLanguage();
  console.log('options language label tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
