// Reading and writing the UI copy files: _locales/<locale>/messages.json
// and the translated onboarding copy in src/onboarding/locales/<locale>.json.
const fs = require('fs');
const path = require('path');
require('../node/register-typescript');
const settings = require('../../src/domain/settings/index.ts');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SOURCE_LOCALE = 'en';
// zh_CN is the language Lumno is written in; translators read it beside the English.
const REFERENCE_LOCALE = 'zh_CN';
const UI_LOCALE_IDS = settings.UI_LOCALES.map((entry) => entry.id);
const MACHINE_TRANSLATED_LOCALE_IDS = settings.UI_LOCALES
  .filter((entry) => entry.machineTranslated)
  .map((entry) => entry.id);
// Characters that vanish in an editor are written as \u escapes.
const INVISIBLE_CHARACTERS_RE = /[\u00A0\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\uFEFF]/g;

function messagesPath(locale) {
  return path.join(REPO_ROOT, '_locales', locale, 'messages.json');
}

function onboardingPath(locale) {
  return path.join(REPO_ROOT, 'src', 'onboarding', 'locales', `${locale}.json`);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`.replace(
    INVISIBLE_CHARACTERS_RE,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function readMessages(locale) {
  return readJson(messagesPath(locale), null);
}

function writeMessages(locale, messages) {
  writeJson(messagesPath(locale), messages);
}

function readOnboarding(locale) {
  return readJson(onboardingPath(locale), null);
}

function writeOnboarding(locale, translations) {
  writeJson(onboardingPath(locale), translations);
}

// The English onboarding strings every translated onboarding file follows,
// or the same strings in another locale written in onboarding-content.ts.
async function readOnboardingSource(locale = SOURCE_LOCALE) {
  const content = await import('../../src/onboarding/onboarding-content.ts');
  return content.getOnboardingTranslationSource(locale);
}

// The {name} tokens a string fills in at runtime.
function getTemplateTokens(value) {
  return (String(value).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();
}

function countLineBreaks(value) {
  return (String(value).match(/\n/g) || []).length;
}

module.exports = {
  REPO_ROOT,
  SOURCE_LOCALE,
  REFERENCE_LOCALE,
  UI_LOCALE_IDS,
  MACHINE_TRANSLATED_LOCALE_IDS,
  messagesPath,
  onboardingPath,
  readMessages,
  writeMessages,
  readOnboarding,
  writeOnboarding,
  readOnboardingSource,
  getTemplateTokens,
  countLineBreaks
};
