const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const localeNames = ['en', 'ja', 'zh_CN', 'zh_TW'];
const nativeLanguageLabels = {
  language_zh_cn: '简体中文',
  language_zh_tw: '繁體中文',
  language_ja: '日本語',
  language_en: 'English'
};
const optionsSource = fs.readFileSync(
  path.join(repoRoot, 'src', 'options', 'options.js'),
  'utf8'
);

localeNames.forEach((locale) => {
  const messagesPath = path.join(repoRoot, '_locales', locale, 'messages.json');
  const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));

  Object.entries(nativeLanguageLabels).forEach(([key, expected]) => {
    assert.strictEqual(
      messages[key] && messages[key].message,
      expected,
      `${locale} should keep ${key} as its native language label`
    );
  });
});

assert.match(
  optionsSource,
  /labelFallback:\s*text\s*\?\s*text\.textContent\s*:\s*''[\s\S]*label:\s*getMessage\(item\.labelKey,\s*item\.labelFallback\)/,
  'React-owned search-result source labels should be derived from the active locale on every adapter render'
);
assert.ok(
  optionsSource.indexOf('let currentMessages = null;') <
    optionsSource.indexOf(
      'if (searchResultSourceTypeController) {\n    renderSearchResultSourceTypeControl('
    ),
  'locale state should be initialized before the search-result source controller first renders'
);

console.log('options language label tests passed');
