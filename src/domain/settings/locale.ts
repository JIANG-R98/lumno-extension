// The UI language: the languages Lumno ships, and the stored choice.
import { defineSetting } from './define';
import { custom } from './schema';

interface UiLocale {
  // The _locales folder.
  id: string;
  htmlLang: string;
  // The language in its own words.
  name: string;
  machineTranslated: boolean;
}

// The UI languages, in the language picker's order. `id` is the _locales
// folder (a Chrome locale code), `name` is the language in its own words.
// `machineTranslated` marks copy that no native speaker has reviewed yet.
const UI_LOCALE_ENTRIES: ReadonlyArray<readonly [string, string, boolean?]> = [
  ['zh_CN', '简体中文'],
  ['zh_TW', '繁體中文'],
  ['ja', '日本語'],
  ['en', 'English'],
  ['ko', '한국어', true],
  ['de', 'Deutsch', true],
  ['es', 'Español', true],
  ['fr', 'Français', true],
  ['pt_BR', 'Português (Brasil)', true],
  ['ru', 'Русский', true]
];
const UI_LOCALES: readonly UiLocale[] = Object.freeze(UI_LOCALE_ENTRIES.map(([id, name, machineTranslated]) => Object.freeze({
  id,
  htmlLang: id.replace('_', '-'),
  name,
  machineTranslated: Boolean(machineTranslated)
})));
const UI_LOCALES_BY_ID: ReadonlyMap<string, UiLocale> = new Map(UI_LOCALES.map((entry) => [entry.id, entry]));

// The _locales folder for a browser or stored language tag, or '' when
// Lumno has no copy in that language.
function resolveSupportedLocale(locale: unknown): string {
  const lower = String(locale || '').trim().toLowerCase().replace(/_/g, '-');
  if (!lower) {
    return '';
  }
  if (lower.startsWith('zh')) {
    if (lower.includes('tw') || lower.includes('hk') || lower.includes('mo') || lower.includes('hant')) {
      return 'zh_TW';
    }
    return 'zh_CN';
  }
  const language = lower.split('-')[0];
  // Portuguese from any region reads the Brazilian copy.
  if (language === 'pt') {
    return 'pt_BR';
  }
  return UI_LOCALES_BY_ID.has(language) ? language : '';
}

function normalizeLocale(locale: unknown): string {
  return resolveSupportedLocale(locale) || 'en';
}

function getUiLocale(locale: unknown): UiLocale {
  const id = normalizeLocale(locale);
  const entry = UI_LOCALES_BY_ID.get(id);
  // normalizeLocale only returns ids of UI_LOCALES.
  if (!entry) {
    throw new Error(`Unknown UI locale: ${id}`);
  }
  return entry;
}

function localeToHtmlLang(locale: unknown): string {
  return getUiLocale(locale).htmlLang;
}

function isMachineTranslatedLocale(locale: unknown): boolean {
  return getUiLocale(locale).machineTranslated;
}

// 'system' follows the browser's language; otherwise the chosen language's
// HTML tag (zh-CN, en, ...).
const language = defineSetting({
  key: '_x_extension_language_2024_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: custom((value) => {
    const locale = resolveSupportedLocale(value);
    return locale ? localeToHtmlLang(locale) : 'system';
  })
});

export {
  UI_LOCALES,
  isMachineTranslatedLocale,
  language,
  localeToHtmlLang,
  normalizeLocale,
  resolveSupportedLocale
};
export type { UiLocale };
