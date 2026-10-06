const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Punctuation rules for UI copy:
// - Labels, titles, buttons, placeholders and aria labels never end with a period.
// - A line that already contains more than one sentence ends with a period
//   (or a colon / ellipsis when it leads into what follows).
// - zh_CN and zh_TW agree on whether each line ends with a period.
// - Ellipses use "…", and English copy never uses full-width punctuation.

const LOCALES = ['zh_CN', 'zh_TW', 'en', 'ja'];
const messages = {};
LOCALES.forEach((locale) => {
  messages[locale] = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '_locales', locale, 'messages.json'),
    'utf8'
  ));
});

const FRAGMENT_KEY_PATTERN = /_(title|label|placeholder|aria|button)$/;
const SENTENCE_END_PATTERN = /[。.？?！!:：…]$/;
// Lead-ins that are completed by surrounding UI (links, buttons) rather than by the copy itself.
const SENTENCE_LEAD_IN_KEYS = new Set(['engagement_notice_text']);
const failures = [];

function lines(text) {
  return String(text || '').split('\n').map((line) => line.trimEnd());
}

function endsWithPeriod(line) {
  return /[。.]$/.test(line) && !/(\.\.\.|…)$/.test(line);
}

function hasInnerSentenceBreak(locale, line) {
  if (/^\d+\.\s?/.test(line)) {
    return false;
  }
  const body = line.slice(0, -1);
  if (locale === 'en') {
    return /[.?!]\s+[A-Z“"]/.test(body.replace(/\b(e\.g|i\.e)\./g, ''));
  }
  return /[。？！]/.test(body);
}

Object.keys(messages.zh_CN).forEach((key) => {
  LOCALES.forEach((locale) => {
    const entry = messages[locale][key];
    if (!entry) {
      return;
    }
    const text = String(entry.message || '');
    const where = `${locale}.${key}`;
    if (/\.\.\.$/.test(text)) {
      failures.push(`${where} should end with "…" instead of "...": ${JSON.stringify(text)}`);
    }
    if (locale === 'en' && /[。，：；（）！？]/.test(text)) {
      failures.push(`${where} contains full-width punctuation: ${JSON.stringify(text)}`);
    }
    if (FRAGMENT_KEY_PATTERN.test(key) && !text.includes('\n') && !hasInnerSentenceBreak(locale, text) &&
        endsWithPeriod(text)) {
      failures.push(`${where} is a fragment and should not end with a period: ${JSON.stringify(text)}`);
    }
    lines(text).forEach((line) => {
      if (line && !SENTENCE_LEAD_IN_KEYS.has(key) && hasInnerSentenceBreak(locale, line) &&
          !SENTENCE_END_PATTERN.test(line)) {
        failures.push(`${where} has several sentences and should end with a period: ${JSON.stringify(line)}`);
      }
    });
  });

  const zhCN = lines(messages.zh_CN[key] && messages.zh_CN[key].message);
  const zhTW = lines(messages.zh_TW[key] && messages.zh_TW[key].message);
  if (zhCN.length === zhTW.length) {
    zhCN.forEach((line, index) => {
      if (endsWithPeriod(line) !== endsWithPeriod(zhTW[index])) {
        failures.push(`zh_CN/zh_TW disagree on the trailing period for ${key}: ` +
          `${JSON.stringify(line)} vs ${JSON.stringify(zhTW[index])}`);
      }
    });
  }
});

assert.deepStrictEqual(failures, [], `\n${failures.join('\n')}`);

console.log('i18n punctuation tests passed');
