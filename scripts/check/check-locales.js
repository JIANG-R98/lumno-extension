// Every UI language has the whole English copy: the same message keys, the
// same {tokens} and line breaks, and (for AI-translated languages) the
// onboarding copy. The store name and summary stay within the store limits.
// Pass locales (`node scripts/check/check-locales.js de fr`) to check only those.
const fs = require('fs');
const path = require('path');
const files = require('../i18n/locale-files');

// Chrome Web Store limits for the manifest name and description.
const MESSAGE_LENGTH_LIMITS = Object.freeze({ ext_name: 75, ext_description: 132 });

const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);
const problems = [];
const onlyLocales = process.argv.slice(2);

function report(locale, message) {
  problems.push(`${locale}: ${message}`);
}

function sameList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

// Missing, extra, empty and mismatched strings in one locale's copy.
function compareCopy(locale, label, source, translated) {
  Object.keys(source).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(translated, key)) {
      report(locale, `${label} is missing ${key}`);
      return;
    }
    const sourceText = source[key];
    const text = translated[key];
    if (typeof text !== 'string' || !text.trim()) {
      report(locale, `${label} ${key} is empty`);
      return;
    }
    if (!sameList(files.getTemplateTokens(text), files.getTemplateTokens(sourceText))) {
      report(locale, `${label} ${key} has tokens ${files.getTemplateTokens(text).join(' ') || '(none)'}` +
        `, English has ${files.getTemplateTokens(sourceText).join(' ') || '(none)'}`);
    }
    if (files.countLineBreaks(text) !== files.countLineBreaks(sourceText)) {
      report(locale, `${label} ${key} has ${files.countLineBreaks(text)} line breaks, English has ${files.countLineBreaks(sourceText)}`);
    }
    if (text.includes(REPLACEMENT_CHARACTER)) {
      report(locale, `${label} ${key} contains a replacement character (broken encoding)`);
    }
    // chrome.i18n reads $ as the start of a placeholder.
    if (text.includes('$') && !sourceText.includes('$')) {
      report(locale, `${label} ${key} contains "$"`);
    }
  });
  Object.keys(translated).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      report(locale, `${label} has ${key}, which English does not`);
    }
  });
}

function flattenMessages(messages) {
  return Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, value && value.message]));
}

async function main() {
  const localeDirs = fs.readdirSync(path.join(files.REPO_ROOT, '_locales'))
    .filter((name) => fs.existsSync(files.messagesPath(name)));
  localeDirs.filter((name) => !onlyLocales.length && !files.UI_LOCALE_IDS.includes(name))
    .forEach((name) => report(name, 'has a _locales folder but is not in UI_LOCALES (src/shared/settings.js)'));

  const sourceMessages = flattenMessages(files.readMessages(files.SOURCE_LOCALE));
  const onboardingSource = await files.readOnboardingSource();
  const onboardingDir = path.dirname(files.onboardingPath(files.SOURCE_LOCALE));
  const onboardingFiles = fs.existsSync(onboardingDir)
    ? fs.readdirSync(onboardingDir).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5))
    : [];
  onboardingFiles.filter((name) => !onlyLocales.length && !files.MACHINE_TRANSLATED_LOCALE_IDS.includes(name))
    .forEach((name) => report(name, 'has an onboarding locale file but its onboarding copy is written in onboarding-content.js'));

  onlyLocales.filter((locale) => !files.UI_LOCALE_IDS.includes(locale))
    .forEach((locale) => report(locale, 'is not in UI_LOCALES (src/shared/settings.js)'));
  const locales = onlyLocales.length
    ? files.UI_LOCALE_IDS.filter((locale) => onlyLocales.includes(locale))
    : files.UI_LOCALE_IDS;
  locales.forEach((locale) => {
    const messages = files.readMessages(locale);
    if (!messages) {
      report(locale, `has no ${path.relative(files.REPO_ROOT, files.messagesPath(locale))}`);
      return;
    }
    const flat = flattenMessages(messages);
    if (locale !== files.SOURCE_LOCALE) {
      compareCopy(locale, 'messages.json', sourceMessages, flat);
    }
    Object.entries(MESSAGE_LENGTH_LIMITS).forEach(([key, limit]) => {
      const length = Array.from(String(flat[key] || '')).length;
      if (length > limit) {
        report(locale, `${key} is ${length} characters; the store allows ${limit}`);
      }
    });
    if (files.MACHINE_TRANSLATED_LOCALE_IDS.includes(locale)) {
      const onboarding = files.readOnboarding(locale);
      if (!onboarding) {
        report(locale, `has no ${path.relative(files.REPO_ROOT, files.onboardingPath(locale))}`);
        return;
      }
      compareCopy(locale, 'onboarding', onboardingSource, onboarding);
    }
  });

  if (problems.length > 0) {
    console.error(`Locale check found ${problems.length} problem(s):`);
    problems.slice(0, 200).forEach((problem) => console.error(`  ${problem}`));
    if (problems.length > 200) {
      console.error(`  … and ${problems.length - 200} more`);
    }
    process.exit(1);
  }
  console.log(`Locale check passed: ${locales.length} languages, ${Object.keys(sourceMessages).length} messages each.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
