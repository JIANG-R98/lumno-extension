// Turning a query into terms: synonyms, fillers, stems and typo fixes.
import { prepareSynonyms, vocabularies } from './index-build';
import type { HelpIndexDoc, HelpSynonyms, QueryPlan } from './types';

const VARIANT_LIMIT = 48;
const REWRITE_LIMIT = 24;

// Words that phrase a question rather than name a topic; removing them leaves what the
// person is asking about (怎么改快捷键 → 改快捷键, "how do I change the shortcut" → change shortcut).
const QUERY_FILLERS = [
  '有什么用', '有啥用', '是干什么的', '干什么', '做什么', '是什么',
  '怎么样', '怎么办', '怎么', '怎样', '如何', '为什么', '为啥', '什么', '是否', '请问', '一下', '可以', '能不能',
  '有什麼用', '是做什麼的', '做什麼', '是什麼',
  '怎麼樣', '怎麼辦', '怎麼', '為什麼', '什麼', '請問',
  'って何', 'とは', 'どうやって', 'どうすれば', 'どうして', 'なぜ', 'したい', 'ですか', 'ますか',
  '吗', '嗎', '呢', '吧', '啊', '的', '了'
];
const LATIN_STOP_WORDS = new Set([
  'a', 'an', 'the', 'how', 'do', 'does', 'did', 'can', 'could', 'i', 'my', 'me', 'to', 'is', 'are', 'was',
  'what', 'why', 'where', 'when', 'which', 'it', 'its', 'in', 'on', 'of', 'for', 'with', 'and', 'or', 'not',
  "don't", "doesn't", "can't", 'be', 'you', 'your', 'this', 'that', 'there', 'way', 'get', 'use', 'using'
]);
const CJK_RUN = /[぀-ヿ㐀-鿿豈-﫿가-힯]+/g;
const LATIN_WORD = /^[a-z][a-z'-]*$/;
// A synonym the query contains is marked as \u0001<group>.<member>\u0002 so that filler words
// can't break it up (我的最爱 keeps its 的) and so it can be swapped for the group's other words.
const MARK = /\u0001(\d+)\.(\d+)\u0002/;
const MARK_SPLIT = /(\u0001\d+\.\d+\u0002)/;


function markSynonyms(text: string, synonyms: HelpSynonyms): string {
  let marked = text;
  synonyms.members.forEach(({ word, groupIndex, memberIndex, pattern }) => {
    if (!marked.includes(word)) {
      return;
    }
    const mark = `\u0001${groupIndex}.${memberIndex}\u0002`;
    marked = pattern ? marked.replace(pattern, mark) : marked.split(word).join(mark);
  });
  return marked;
}

// The word the person typed first, then the rest of its group.
function groupOptions(synonyms: HelpSynonyms, mark: string): string[] {
  const [, groupIndex, memberIndex] = mark.match(MARK) || ['', '0', '0'];
  const group = synonyms.groups[Number(groupIndex)];
  const typed = group[Number(memberIndex)];
  return [typed, ...group.filter((word) => word !== typed)];
}

function unmark(text: string, synonyms: HelpSynonyms): string {
  return text.split(MARK_SPLIT).map((part) => (MARK.test(part) ? groupOptions(synonyms, part)[0] : part)).join('');
}

// Every spelling of a marked word: each synonym swapped in, the typed one first.
function expandMarked(term: string, synonyms: HelpSynonyms): string[] {
  let variants = [''];
  term.split(MARK_SPLIT).filter(Boolean).forEach((part) => {
    const options = MARK.test(part) ? groupOptions(synonyms, part) : [part];
    const next: string[] = [];
    variants.forEach((variant) => {
      options.forEach((option) => {
        if (next.length < VARIANT_LIMIT) {
          next.push(variant + option);
        }
      });
    });
    variants = next;
  });
  return variants;
}

// The query once as typed, then once for each synonym swapped in on its own.
function rewritesOf(text: string, synonyms: HelpSynonyms): string[] {
  const parts = text.split(MARK_SPLIT);
  const typed = parts.map((part) => (MARK.test(part) ? groupOptions(synonyms, part)[0] : part));
  const rewrites = [typed.join('')];
  parts.forEach((part, at) => {
    if (!MARK.test(part)) {
      return;
    }
    groupOptions(synonyms, part).slice(1).forEach((option) => {
      if (rewrites.length < REWRITE_LIMIT) {
        rewrites.push(typed.map((value, i) => (i === at ? option : value)).join(''));
      }
    });
  });
  return [...new Set(rewrites)];
}

function stripFillers(text: string): string {
  let value = text;
  QUERY_FILLERS.forEach((filler) => {
    value = value.split(filler).join(' ');
  });
  return value;
}

// English endings: shortcuts → shortcut, syncing → sync, pinned → pin, changing → change.
function latinStems(word: string): string[] {
  if (!LATIN_WORD.test(word) || word.length < 4) {
    return [];
  }
  const stems: string[] = [];
  const undouble = (stem: string) => (/([b-df-hj-np-tv-z])\1$/.test(stem) ? [stem, stem.slice(0, -1)] : [stem]);
  if (word.endsWith('ies')) stems.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es')) stems.push(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) stems.push(word.slice(0, -1));
  if (word.endsWith('ing')) stems.push(...undouble(word.slice(0, -3)), `${word.slice(0, -3)}e`);
  if (word.endsWith('ed')) stems.push(...undouble(word.slice(0, -2)), word.slice(0, -1));
  return stems.filter((stem) => stem.length >= 3);
}

function vocabularyOf(docs: HelpIndexDoc[]): string[] {
  let vocabulary = vocabularies.get(docs);
  if (!vocabulary) {
    const words = new Set<string>();
    docs.forEach((doc) => {
      (doc.lower.all.match(/[a-z][a-z'-]{3,}/g) || []).forEach((word) => words.add(word));
    });
    vocabulary = [...words];
    vocabularies.set(docs, vocabulary);
  }
  return vocabulary;
}

// Optimal string alignment distance, giving up once it passes max.
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) {
    return false;
  }
  let before: number[] | null = null;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2] + 1);
      }
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) {
      return false;
    }
    before = previous;
    previous = current;
  }
  return previous[b.length] <= max;
}

// A misspelt English word the pages never use (shorcut, wallpapper) borrows the closest words they do.
function typoFixes(word: string, docs: HelpIndexDoc[]): string[] {
  if (!LATIN_WORD.test(word) || word.length < 5) {
    return [];
  }
  const max = word.length >= 9 ? 2 : 1;
  return vocabularyOf(docs).filter((candidate) => withinEdits(word, candidate, max)).slice(0, 5);
}

function termVariants(term: string, synonyms: HelpSynonyms, docs: HelpIndexDoc[]): string[] {
  const spelled = expandMarked(term, synonyms);
  const variants = [...spelled];
  spelled.forEach((variant) => variants.push(...latinStems(variant)));
  if (!MARK.test(term) && !variants.some((variant) => docs.some((doc) => contains(doc.lower.all, variant)))) {
    variants.push(...typoFixes(term, docs));
  }
  return [...new Set(variants)];
}

// CJK has no spaces, so a word made of known synonyms and pieces of two or more characters is
// taken as separate words (设置深色模式 → 设置 + 深色模式); a lone character stays attached (改快捷键).
function splitAtSynonyms(word: string): string[] {
  const pieces = word.split(MARK_SPLIT).filter(Boolean);
  const cjkPiece = (piece: string) => piece.length >= 2 && piece.replace(CJK_RUN, '') === '';
  return pieces.length > 1 && pieces.every((piece) => MARK.test(piece) || cjkPiece(piece)) ? pieces : [word];
}

// Key names as the pages write them: ⌘T and cmd+t become "⌘ t" and "cmd t".
function normalizeKeys(text: string): string {
  return text.replace(/\s*\+\s*/g, ' ').replace(/([⌘⌥⇧⌃↩])\s*/g, ' $1 ');
}

// What the query asks about: its words (each with every spelling to try) and its rewrites.
function planQuery(query: unknown, synonyms: HelpSynonyms, docs: HelpIndexDoc[]): QueryPlan {
  const lower = normalizeKeys(String(query || '').toLowerCase()).trim();
  const marked = markSynonyms(lower, synonyms);
  const stripped = stripFillers(marked);
  let words = stripped.split(/\s+/).flatMap(splitAtSynonyms).filter((word) => word && !LATIN_STOP_WORDS.has(word));
  if (!words.length) {
    words = marked.split(/\s+/).filter(Boolean);
  }
  return {
    words: words.map((word) => unmark(word, synonyms)),
    terms: words.map((word) => termVariants(word, synonyms, docs)),
    rewrites: rewritesOf(stripped.trim() ? stripped : marked, synonyms)
  };
}

function getExactTerms(query: unknown, synonyms: unknown): string[] {
  return planQuery(query, prepareSynonyms(synonyms), []).words;
}

const shortWordPatterns = new Map<string, RegExp>();
function contains(text: string, variant: string): boolean {
  if (variant.length > 3 || !LATIN_WORD.test(variant)) {
    return text.includes(variant);
  }
  let pattern = shortWordPatterns.get(variant);
  if (!pattern) {
    pattern = new RegExp(`(?<![a-z])${variant}(?![a-z])`);
    shortWordPatterns.set(variant, pattern);
  }
  return text.includes(variant) && pattern.test(text);
}

export {
  CJK_RUN,
  LATIN_STOP_WORDS,
  LATIN_WORD,
  MARK,
  MARK_SPLIT,
  QUERY_FILLERS,
  REWRITE_LIMIT,
  VARIANT_LIMIT,
  contains,
  expandMarked,
  getExactTerms,
  groupOptions,
  latinStems,
  markSynonyms,
  normalizeKeys,
  planQuery,
  rewritesOf,
  splitAtSynonyms,
  stripFillers,
  termVariants,
  typoFixes,
  unmark,
  vocabularyOf,
  withinEdits
};
