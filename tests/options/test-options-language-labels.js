const assert = require('assert');
const fs = require('fs');
const path = require('path');
const settings = require('../../src/shared/settings.js');
const { createOptionsPage } = require('../helpers/options-page');

const repoRoot = path.join(__dirname, '..', '..');
const localeNames = ['en', 'ja', 'zh_CN', 'zh_TW'];
const nativeLanguageLabels = {
  language_zh_cn: '简体中文',
  language_zh_tw: '繁體中文',
  language_ja: '日本語',
  language_en: 'English'
};
const readMessages = (locale) => JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales', locale, 'messages.json'), 'utf8'));

localeNames.forEach((locale) => {
  const messages = readMessages(locale);
  Object.entries(nativeLanguageLabels).forEach(([key, expected]) => {
    assert.strictEqual(
      messages[key] && messages[key].message,
      expected,
      `${locale} should keep ${key} as its native language label`
    );
  });
});

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
  await testSourceLabelsFollowTheLanguage();
  console.log('options language label tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
