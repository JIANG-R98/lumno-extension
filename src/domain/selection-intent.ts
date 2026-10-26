// What a selection on a page is for (ask, translate, explain, summarize,
import { getScriptStats, getSymbolRatio, getTextStructureStats, isCodeLike, isEmailLike, isErrorLike, isGenericUiText, isLanguageMismatch, isMeaningfulTermLike, isNumericLike, isQuestionLike, isSearchLike, isUrlLike, normalizeLocale } from './selection-text-features';
import type { ScriptStats, SelectionContext } from './selection-text-features';
// search or calculate), and the prompt each action sends.

const ACTIONS = Object.freeze([
  'ask',
  'translate',
  'explain',
  'summarize',
  'search',
  'calculate'
] as const);

type SelectionAction = typeof ACTIONS[number];

type PromptLocale = 'zh' | 'zh_TW' | 'ja' | 'en';

const MAX_SELECTION_LENGTH = 2400;
const MIN_SELECTION_LENGTH = 2;

function normalizeText(value: unknown): string {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function rankScores(scores: Record<SelectionAction, number>) {
  return ACTIONS
    .map((action) => ({ action, score: Math.min(1, Math.max(0, Number(scores[action]) || 0)) }))
    .sort((left, right) => right.score - left.score);
}

type TextStructureStats = ReturnType<typeof getTextStructureStats>;

// What a selection looks like: its shape and the kinds of text it reads as.
interface SelectionFeatures {
  length: number;
  lineCount: number;
  wordCount: number;
  sentenceCount: number;
  textStructure: TextStructureStats;
  scriptStats: ScriptStats;
  symbolRatio: number;
  urlLike: boolean;
  emailLike: boolean;
  codeLike: boolean;
  errorLike: boolean;
  questionLike: boolean;
  numericLike: boolean;
  genericUiLike: boolean;
  languageMismatch: boolean;
  substantialProseLike: boolean;
  shortTermLike: boolean;
  meaningfulTermLike: boolean;
  searchLike: boolean;
}

type KindFeatures = Pick<SelectionFeatures, 'codeLike' | 'errorLike' | 'questionLike' | 'numericLike' | 'genericUiLike'>;

// Prose worth summarizing: several developed sentences, or one long one,
// and nothing that reads as code, an error, a question or a number.
function isSubstantialProse(textStructure: TextStructureStats, kinds: KindFeatures): boolean {
  const sentenceCount = textStructure.sentenceCount;
  const developedMultiSentenceProse = sentenceCount >= 2 &&
    textStructure.lexicalUnitCount >= 16 &&
    textStructure.averageSentenceUnits >= 6;
  const sustainedSingleSentenceProse = sentenceCount === 1 && textStructure.lexicalUnitCount >= 28;
  return textStructure.contentCharacterRatio >= 0.7 &&
    textStructure.uniqueLexicalUnitCount >= 8 &&
    (developedMultiSentenceProse || sustainedSingleSentenceProse) &&
    !kinds.codeLike && !kinds.errorLike && !kinds.questionLike && !kinds.numericLike && !kinds.genericUiLike;
}

// A short term on one line, not a sentence or a plain clause.
function isShortTerm(text: string, shape: { length: number; lineCount: number; wordCount: number; symbolRatio: number }, genericUiLike: boolean): boolean {
  const plainClauseLike = /^(?:这是|这个|这些|那是|那个|那些|我们|你们|他们|我在|你在|他在|她在|它在|これは|それは|あれは)/.test(text);
  return shape.length >= MIN_SELECTION_LENGTH &&
    shape.length <= 48 &&
    shape.lineCount === 1 &&
    shape.wordCount <= 6 &&
    !/[.!?。！？]\s*$/.test(text) &&
    !plainClauseLike &&
    !genericUiLike &&
    shape.symbolRatio < 0.3;
}

function readSelectionFeatures(text: string, settings: SelectionContext): SelectionFeatures {
  const length = text.length;
  const lineCount = text ? text.split('\n').length : 0;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const textStructure = getTextStructureStats(text, settings.pageLanguage || settings.uiLanguage);
  const scriptStats = getScriptStats(text);
  const symbolRatio = getSymbolRatio(text);
  const codeLike = isCodeLike(text, settings);
  const kinds: KindFeatures = {
    codeLike,
    errorLike: isErrorLike(text, { ...settings, codeLike }),
    questionLike: isQuestionLike(text),
    numericLike: isNumericLike(text),
    genericUiLike: isGenericUiText(text)
  };
  const shortTermLike = isShortTerm(text, { length, lineCount, wordCount, symbolRatio }, kinds.genericUiLike);
  return {
    ...kinds,
    length,
    lineCount,
    wordCount,
    sentenceCount: textStructure.sentenceCount,
    textStructure,
    scriptStats,
    symbolRatio,
    urlLike: isUrlLike(text),
    emailLike: isEmailLike(text),
    languageMismatch: isLanguageMismatch(text, settings, scriptStats, codeLike),
    substantialProseLike: isSubstantialProse(textStructure, kinds),
    shortTermLike,
    meaningfulTermLike: shortTermLike && isMeaningfulTermLike(text, { genericUiLike: kinds.genericUiLike }),
    searchLike: isSearchLike(text, shortTermLike)
  };
}

function isSuppressedSelection(text: string, features: SelectionFeatures, settings: SelectionContext): boolean {
  return !text ||
    features.length < MIN_SELECTION_LENGTH ||
    features.length > MAX_SELECTION_LENGTH ||
    features.urlLike ||
    features.emailLike ||
    settings.sensitive === true;
}

// Questions, foreign text, errors and code.
function scoreIntentKinds(features: SelectionFeatures, scores: Record<SelectionAction, number>): void {
  const { questionLike, languageMismatch, numericLike, genericUiLike, errorLike, codeLike } = features;
  if (questionLike) {
    scores.ask = 0.9;
    scores.search = 0.2;
  }
  if (languageMismatch && !numericLike && !genericUiLike) {
    scores.translate = 0.82;
    scores.explain = Math.max(scores.explain, 0.18);
  }
  if (errorLike && (codeLike || !questionLike)) {
    scores.explain = 0.96;
    scores.search = Math.max(scores.search, 0.52);
  } else if (codeLike) {
    scores.explain = 0.84;
    scores.ask = Math.max(scores.ask, 0.2);
  }
}

// Prose, numbers, search terms and other text.
function scoreContentKinds(features: SelectionFeatures, scores: Record<SelectionAction, number>): void {
  const { substantialProseLike, numericLike, searchLike, questionLike, errorLike, meaningfulTermLike, languageMismatch } = features;
  if (substantialProseLike) {
    scores.summarize = 0.9;
  }
  if (numericLike) {
    scores.calculate = 0.96;
    scores.ask = Math.max(scores.ask, 0.16);
  }
  if (searchLike && !numericLike && !questionLike && !errorLike) {
    scores.search = 0.88;
    scores.explain = Math.max(scores.explain, 0.24);
  } else if (meaningfulTermLike && !numericLike && !questionLike && !languageMismatch && !errorLike) {
    scores.explain = 0.5;
    scores.search = 0.46;
  }
  if (!substantialProseLike && !features.shortTermLike && features.length >= 20) {
    scores.ask = Math.max(scores.ask, 0.3);
  }
}

function scoreSelection(features: SelectionFeatures, suppressed: boolean): Record<SelectionAction, number> {
  const scores: Record<SelectionAction, number> = {
    ask: 0,
    translate: 0,
    explain: 0,
    summarize: 0,
    search: 0,
    calculate: 0
  };
  if (!suppressed) {
    scoreIntentKinds(features, scores);
    scoreContentKinds(features, scores);
  }
  return scores;
}

// The toolbar offers itself for text with a clear intent, a meaningful
// term or prose, but not for interface labels.
function isTriggerable(features: SelectionFeatures, suppressed: boolean): boolean {
  const explicitIntentLike = features.questionLike ||
    (features.languageMismatch && !features.numericLike && !features.genericUiLike) ||
    (features.errorLike && (features.codeLike || !features.questionLike)) ||
    features.codeLike ||
    features.numericLike ||
    features.searchLike;
  return !suppressed && !features.genericUiLike &&
    (explicitIntentLike || features.meaningfulTermLike || features.substantialProseLike);
}

function classifySelection(value: unknown, options?: SelectionContext) {
  const text = normalizeText(value);
  const settings: SelectionContext = options && typeof options === 'object' ? options : {};
  const features = readSelectionFeatures(text, settings);
  const suppressed = isSuppressedSelection(text, features, settings);
  const scores = scoreSelection(features, suppressed);
  const ranked = rankScores(scores);
  const top = ranked[0];
  const second = ranked[1];
  const margin = top.score - second.score;
  const confidence = suppressed || top.score < 0.42
    ? 'low'
    : (top.score >= 0.72 && margin >= 0.16 ? 'high' : 'medium');
  const { length: _length, ...reported } = features;

  return Object.freeze({
    action: top.action,
    confidence,
    margin,
    score: top.score,
    scores: Object.freeze({ ...scores }),
    suppressed,
    text,
    features: Object.freeze(reported),
    triggerable: isTriggerable(features, suppressed)
  });
}

function buildPrompt(action: SelectionAction, value: unknown, locale: unknown): string {
  const text = normalizeText(value);
  const rawLocale = String(locale || '').replace(/_/g, '-').toLowerCase();
  const targetLocale: PromptLocale = rawLocale.startsWith('zh-tw') ||
    rawLocale.startsWith('zh-hk') ||
    rawLocale.includes('hant')
    ? 'zh_TW'
    : normalizeLocale(locale);
  if (!text || action === 'ask') {
    return text;
  }
  const templates: Record<PromptLocale, Record<Exclude<SelectionAction, 'ask'>, string>> = {
    zh: {
      translate: '请将下面内容翻译成简体中文，只输出自然准确的译文：',
      explain: '请结合上下文解释下面内容；如果是代码或报错，请说明原因和解决方向：',
      summarize: '请用简洁的要点总结下面内容：',
      search: '请查找并解释下面这个主题，给出可靠的信息来源：',
      calculate: '请计算或换算下面的内容，并简要说明结果：'
    },
    zh_TW: {
      translate: '請將下面內容翻譯成繁體中文，只輸出自然準確的譯文：',
      explain: '請結合上下文解釋下面內容；如果是程式碼或錯誤，請說明原因和解決方向：',
      summarize: '請用簡潔的重點總結下面內容：',
      search: '請查找並解釋下面這個主題，提供可靠的資訊來源：',
      calculate: '請計算或換算下面的內容，並簡要說明結果：'
    },
    ja: {
      translate: '次の内容を自然で正確な日本語に翻訳し、訳文だけを出力してください：',
      explain: '次の内容を文脈に沿って説明してください。コードやエラーの場合は、原因と解決の方向性も示してください：',
      summarize: '次の内容を簡潔な箇条書きで要約してください：',
      search: '次のテーマを調べて説明し、信頼できる情報源を示してください：',
      calculate: '次の内容を計算または換算し、結果を簡潔に説明してください：'
    },
    en: {
      translate: 'Translate the following into natural, accurate English. Output only the translation:',
      explain: 'Explain the following in context. If it is code or an error, include the likely cause and direction for a fix:',
      summarize: 'Summarize the following as concise key points:',
      search: 'Research and explain the following topic, citing reliable sources:',
      calculate: 'Calculate or convert the following and briefly explain the result:'
    }
  };
  // Other UI languages share the English prompt and ask for a reply in theirs.
  const languageName = targetLocale === 'en' ? getEnglishLanguageName(rawLocale) : '';
  let prefix = (templates[targetLocale] || templates.en)[action] || templates[targetLocale].explain;
  if (languageName) {
    prefix = action === 'translate'
      ? `Translate the following into natural, accurate ${languageName}. Output only the translation:`
      : `${prefix.replace(/:$/, '')}. Reply in ${languageName}:`;
  }
  return `${prefix}\n\n${text}`;
}

// "German" for "de", "Brazilian Portuguese" for "pt-br"; '' for English or
// a tag Intl does not know.
function getEnglishLanguageName(locale: string): string {
  if (!locale || locale === 'en' || locale.startsWith('en-')) {
    return '';
  }
  try {
    return new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(locale) || '';
  } catch (_error) {
    return '';
  }
}

export {
  ACTIONS,
  MAX_SELECTION_LENGTH,
  MIN_SELECTION_LENGTH,
  buildPrompt,
  classifySelection,
  getEnglishLanguageName,
  isShortTerm,
  isSubstantialProse,
  isSuppressedSelection,
  isTriggerable,
  normalizeText,
  rankScores,
  readSelectionFeatures,
  scoreContentKinds,
  scoreIntentKinds,
  scoreSelection
};
export type {
  KindFeatures,
  PromptLocale,
  SelectionAction,
  SelectionFeatures,
  TextStructureStats
};
