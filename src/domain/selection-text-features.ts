// Reading a selection's text: scripts, symbols, structure, and whether it
// reads as a question, code, an error, a number or a search term.

// What the page knows about the selection besides its text.
interface SelectionContext {
  pageLanguage?: string;
  uiLanguage?: string;
  insideCode?: boolean;
  codeLike?: boolean;
  genericUiLike?: boolean;
  sensitive?: boolean;
}

type ScriptStats = ReturnType<typeof getScriptStats>;

const LOW_INTENT_ENGLISH_TERMS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here', 'hers', 'him',
  'his', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'more', 'my',
  'no', 'not', 'of', 'on', 'or', 'our', 'ours', 'she', 'so', 'that', 'the',
  'their', 'theirs', 'them', 'there', 'these', 'they', 'this', 'those', 'to',
  'too', 'up', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'who', 'why', 'with', 'you', 'your', 'yours'
]);
const LOW_INTENT_CJK_TERMS = new Set([
  '这个', '那个', '这些', '那些', '这里', '那里', '我们', '你们', '他们',
  '可以', '需要', '已经', '现在', '更多', '其他', '内容', '资料',
  'これ', 'それ', 'あれ', 'ここ', 'そこ', 'こちら', 'もっと'
]);

function countMatches(text: unknown, pattern: RegExp): number {
  const matches = String(text || '').match(pattern);
  return matches ? matches.length : 0;
}

function getScriptStats(text: unknown) {
  const source = String(text || '');
  const latin = countMatches(source, /[A-Za-z\u00C0-\u024F]/g);
  const han = countMatches(source, /[\u3400-\u4DBF\u4E00-\u9FFF]/g);
  const kana = countMatches(source, /[\u3040-\u30FF\u31F0-\u31FF]/g);
  const hangul = countMatches(source, /[\uAC00-\uD7AF]/g);
  const letters = latin + han + kana + hangul;
  return Object.freeze({
    latin,
    han,
    kana,
    hangul,
    letters,
    latinRatio: letters > 0 ? latin / letters : 0,
    cjkRatio: letters > 0 ? (han + kana + hangul) / letters : 0
  });
}

function getSymbolRatio(text: string) {
  const compact = String(text || '').replace(/\s/g, '');
  if (!compact) {
    return 0;
  }
  const symbols = countMatches(compact, /[^A-Za-z0-9\u00C0-\u024F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g);
  return symbols / compact.length;
}

function isQuestionLike(text: string) {
  const source = String(text || '').trim();
  return /[?？]\s*$/.test(source) ||
    /^(?:how|why|what|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/i.test(source) ||
    /^(?:为什么|为何|怎么|如何|什么|何时|哪里|谁|是否|能否|可否|有没有)/.test(source) ||
    /^(?:なぜ|どうして|どのように|何|いつ|どこ|誰)/.test(source);
}

function isUrlLike(text: string) {
  return /^(?:https?:\/\/|www\.)\S+$/i.test(String(text || '').trim());
}

function isEmailLike(text: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(text || '').trim());
}

function isErrorLike(text: string, options?: SelectionContext) {
  const source = String(text || '');
  const settings = options && typeof options === 'object' ? options : {};
  const structuredError = /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|Exception|Traceback|Caused by|Unhandled|ERR_[A-Z_]+|HTTP\s*[45]\d\d)\b/i.test(source) ||
    /(?:^|\n)\s*at\s+[\w$.<>]+\s*\([^\n]+:\d+(?::\d+)?\)/.test(source);
  const naturalFailure = /\b(?:cannot|failed|failure|denied|undefined|null pointer|not found|timed? out)\b/i.test(source) ||
    /(?:错误|异常|失败|无法|未定义|拒绝访问|超时)/.test(source);
  return structuredError || (naturalFailure && (settings.insideCode === true || settings.codeLike === true));
}

function isCodeLike(text: string, options?: SelectionContext) {
  const source = String(text || '');
  const settings = options && typeof options === 'object' ? options : {};
  if (settings.insideCode === true) {
    return true;
  }
  const codeKeyword = /\b(?:const|let|var|function|class|import|export|return|async|await|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|def|lambda|public|private|interface|package)\b/.test(source);
  const structuredLine = /(?:^|\n)\s{2,}\S/.test(source) || /[{}()[\];]|=>|===|!==|::/.test(source);
  return (codeKeyword && structuredLine) ||
    (source.includes('\n') && getSymbolRatio(source) >= 0.24);
}

function isNumericLike(text: string) {
  const source = String(text || '').trim();
  if (!/\d/.test(source) || source.length > 80) {
    return false;
  }
  const hasUnitOrCurrency = /(?:[$€£¥￥]\s*\d|\d\s*(?:%|°[CF]|km|cm|mm|kg|g|lb|oz|mph|km\/h|ms|s|min|h|GB|MB|TB|USD|CNY|RMB|EUR|JPY)\b)/i.test(source);
  const hasConversion = /\d\s*(?:to|in|转|换算成)\s*\w+/i.test(source);
  const hasArithmetic = /[+\-*/.^%=]/.test(source) && /^[\d\s()+\-*/.^%=]+$/.test(source);
  return hasUnitOrCurrency || hasConversion || hasArithmetic;
}

function isGenericUiText(text: string) {
  const source = String(text || '').trim();
  const lower = source.toLowerCase();
  if (LOW_INTENT_ENGLISH_TERMS.has(lower) || LOW_INTENT_CJK_TERMS.has(source)) {
    return true;
  }
  return /^(?:(?:click|tap|press)\s+(?:here|this|below)|(?:learn|read|see|show|view)\s+more|(?:next|previous|back|home)(?:\s+page)?|(?:sign|log)\s+(?:in|out|up))$/i.test(source) ||
    /^(?:continue|cancel|submit|save|close)$/i.test(source) ||
    /^welcome\s+(?:to|back)\b.+/i.test(source) ||
    /^(?:(?:点击|点按|轻触)(?:这里|此处|下方)?|(?:了解|查看|阅读)更多|下一步|上一步|返回|首页|继续|取消|提交|保存|关闭|登录|注册)$/.test(source) ||
    /^欢迎(?:访问|来到).+/.test(source) ||
    /^(?:(?:ここ|こちら)を(?:クリック|タップ)|続きを読む|次へ|前へ|戻る|続ける|キャンセル|保存|閉じる)$/.test(source);
}

function isMeaningfulTermLike(text: string, options?: SelectionContext) {
  const source = String(text || '').trim();
  const settings = options && typeof options === 'object' ? options : {};
  if (!source || settings.genericUiLike === true) {
    return false;
  }
  const latinTokens = source.match(/[A-Za-z\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F+.#'’-]*/g) || [];
  const cjkCount = countMatches(source, /[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g);
  if (latinTokens.length === 1 && latinTokens[0].length === source.length) {
    const token = latinTokens[0];
    const lower = token.toLowerCase();
    return !LOW_INTENT_ENGLISH_TERMS.has(lower) && (
      /^[A-Z][A-Z0-9+.#-]+$/.test(token) ||
      token.length >= 3
    );
  }
  if (latinTokens.length >= 2) {
    return latinTokens.some((token) => (
      token.length >= 3 && !LOW_INTENT_ENGLISH_TERMS.has(token.toLowerCase())
    ));
  }
  return cjkCount >= 2 && cjkCount >= source.replace(/\s/g, '').length * 0.72;
}

function isSearchLike(text: string, shortTermLike: boolean) {
  if (!shortTermLike) {
    return false;
  }
  const source = String(text || '');
  return /\b(?:latest|news|price|pricing|review|reviews|release|releases|documentation|docs|official|website|status|version|download|update|updates)\b/i.test(source) ||
    /(?:最新|新闻|资讯|价格|定价|评测|测评|发布|官网|文档|版本|下载|更新)/.test(source) ||
    /(?:最新|ニュース|価格|料金|レビュー|リリース|公式|ドキュメント|バージョン|更新)/.test(source);
}

function getFallbackSentenceCount(text: string) {
  const source = String(text || '').trim();
  if (!source) {
    return 0;
  }
  const terminalCount = countMatches(source, /[。！？]/g) +
    countMatches(source, /[.!?](?:\s|$)/g);
  const trailingClause = terminalCount > 0 && !/[.!?。！？]\s*$/.test(source) ? 1 : 0;
  return Math.max(1, terminalCount + trailingClause);
}

function getSegmentationLocale(value: unknown): string | undefined {
  const locale = String(value || '').replace(/_/g, '-').trim();
  if (!locale || typeof Intl !== 'object' || typeof Intl.getCanonicalLocales !== 'function') {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch (_error) {
    return undefined;
  }
}

function getTextStructureStats(text: string, locale: unknown) {
  const source = String(text || '');
  const sentenceSource = source.replace(/\n+/g, ' ');
  const segmentationLocale = getSegmentationLocale(locale);
  let lexicalUnits: string[] = [];
  let sentenceCount = 0;

  if (typeof Intl === 'object' && typeof Intl.Segmenter === 'function') {
    try {
      lexicalUnits = Array.from(
        new Intl.Segmenter(segmentationLocale, { granularity: 'word' }).segment(source)
      )
        .filter((segment) => segment.isWordLike === true)
        .map((segment) => segment.segment.toLowerCase());
      sentenceCount = Array.from(
        new Intl.Segmenter(segmentationLocale, { granularity: 'sentence' }).segment(sentenceSource)
      ).filter((segment) => segment.segment.trim()).length;
    } catch (_error) {
      lexicalUnits = [];
    }
  }

  if (!lexicalUnits.length && source) {
    lexicalUnits = source.match(/[A-Za-z\u00C0-\u024F0-9]+|[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g) || [];
    lexicalUnits = lexicalUnits.map((unit) => unit.toLowerCase());
  }
  if (sentenceCount === 0) {
    sentenceCount = getFallbackSentenceCount(sentenceSource);
  }

  const compactCharacters = Array.from(source).filter((character) => !/\s/u.test(character));
  const contentCharacterCount = compactCharacters.filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
  const lexicalUnitCount = lexicalUnits.length;
  const uniqueLexicalUnitCount = new Set(lexicalUnits).size;
  return Object.freeze({
    averageSentenceUnits: lexicalUnitCount / Math.max(1, sentenceCount),
    contentCharacterRatio: compactCharacters.length > 0
      ? contentCharacterCount / compactCharacters.length
      : 0,
    lexicalDiversity: lexicalUnitCount > 0 ? uniqueLexicalUnitCount / lexicalUnitCount : 0,
    lexicalUnitCount,
    sentenceCount,
    uniqueLexicalUnitCount
  });
}

function isLanguageMismatch(text: string, options: SelectionContext, scriptStats: ScriptStats, codeLike: boolean) {
  if (codeLike || !scriptStats || scriptStats.letters < 2) {
    return false;
  }
  const settings = options && typeof options === 'object' ? options : {};
  const locale = normalizeLocale(settings.uiLanguage || settings.pageLanguage);
  const wordCount = String(text || '').split(/\s+/).filter(Boolean).length;
  const singleLatinWord = /^[A-Za-z\u00C0-\u024F'-]+$/.test(text);
  const lowerSingleLatinWord = singleLatinWord && text === text.toLowerCase() && text.length >= 6;
  if (locale === 'en') {
    return scriptStats.cjkRatio >= 0.72;
  }
  if (scriptStats.latinRatio < 0.76) {
    return false;
  }
  return wordCount >= 2 || lowerSingleLatinWord;
}

function normalizeLocale(value: unknown): 'zh' | 'ja' | 'en' {
  const locale = String(value || '').replace(/_/g, '-').toLowerCase();
  if (locale.startsWith('zh')) {
    return 'zh';
  }
  if (locale.startsWith('ja')) {
    return 'ja';
  }
  return 'en';
}

export {
  LOW_INTENT_CJK_TERMS,
  LOW_INTENT_ENGLISH_TERMS,
  countMatches,
  getFallbackSentenceCount,
  getScriptStats,
  getSegmentationLocale,
  getSymbolRatio,
  getTextStructureStats,
  isCodeLike,
  isEmailLike,
  isErrorLike,
  isGenericUiText,
  isLanguageMismatch,
  isMeaningfulTermLike,
  isNumericLike,
  isQuestionLike,
  isSearchLike,
  isUrlLike,
  normalizeLocale
};
export type {
  ScriptStats,
  SelectionContext
};
