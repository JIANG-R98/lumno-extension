// Searches the help center's own index (lumno.kubai.design/<locale>/help/search-index.json)
// and synonym list (search-synonyms.json). The help center's search box and the extension's
// "Lumno 帮助中心" site search both run this file, so both list the same pages; keep it in
// step with lumno-extension src/domain/search/help-center-search.ts. lumno-web checks it against
// src/content/guides/search/eval/<locale>.json after every build (scripts/help-search-eval.mjs).
// The extension's copy adds buildFeedbackSuggestions and createSuggestionSource at the end.
type LineKind = 'text' | 'heading' | 'bullet' | 'row';

// A block of a page's text (see parseLines).
interface HelpIndexLine {
  kind: LineKind | 'step';
  start: number;
  end: number;
  marker: string;
  cells: string[] | null;
  header: boolean;
}

interface HelpIndexSection {
  id: string;
  title: string;
  aliases: string[];
  lowerTitle: string;
  lowerAliases: string[];
  // Where the section's body sits in the page text, once located.
  body?: { start: number; end: number } | null;
}

// An index page, prepared for matching.
interface HelpIndexDoc {
  title: string;
  href: string;
  text: string;
  lines: HelpIndexLine[];
  aliases: string[];
  sections: HelpIndexSection[];
  lower: { title: string; text: string; aliases: string[]; all: string };
}

interface SynonymMember {
  word: string;
  groupIndex: number;
  memberIndex: number;
  // English words match only on their own; null for CJK words.
  pattern: RegExp | null;
}

interface HelpSynonyms {
  groups: string[][];
  members: SynonymMember[];
}

// A block of the passage a result's hover card shows.
type HelpContextBlock =
  | { kind: 'row'; cells: string[]; header?: true }
  | { kind: 'heading' | 'text' | 'bullet' | 'step'; text: string; marker?: string };

interface HelpSearchResult {
  title: string;
  detail: string;
  context: HelpContextBlock[];
  url: string;
  recommended?: true;
}

interface HelpSearchOptions {
  // Prefixed to the index's relative links.
  origin?: string;
  limit?: number;
  // A prepared synonym list or the raw groups.
  synonyms?: unknown;
}

// Where one spelling of a word was found on a page.
interface WordHit {
  score: number;
  section: HelpIndexSection | null;
  variant: string;
}

interface RankedPage {
  doc: HelpIndexDoc;
  score: number;
  order: number;
  section: HelpIndexSection | null;
  detail: string;
  context: HelpContextBlock[];
  recommended?: true;
}

interface QueryPlan {
  words: string[];
  // Per word, every spelling to try.
  terms: string[][];
  rewrites: string[];
}

interface FeedbackLinks {
  wechatQr?: string;
  githubIssue?: string;
  x?: string;
}

interface FeedbackConfig {
  links?: FeedbackLinks;
  // 'wechat' where the WeChat group is the community channel.
  channel?: string;
  t?: (key: string, fallback: string) => string;
}

interface HelpFeedbackSuggestion {
  type: 'helpFeedback';
  feedbackKey: string;
  title: string;
  url: string;
}

interface HelpArticleSuggestion {
  type: 'helpArticle';
  title: string;
  detail: string;
  url: string;
  context: HelpContextBlock[];
  favicon: string;
  recommended: boolean;
}

// The worker's reply to getHelpCenterSearchResults.
interface HelpSearchResponse {
  items?: Array<Partial<HelpSearchResult> | null>;
  // Set when the index could not load.
  reason?: string;
}

interface SuggestionSourceOptions {
  sendMessage?: (message: { action: 'getHelpCenterSearchResults'; query: string; locale: string },
    callback: (response?: HelpSearchResponse) => void) => unknown;
  onUpdate?: (query: unknown) => void;
}

const RESULT_LIMIT = 6;
const RECOMMENDED_LIMIT = 3;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function toStrings(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value : [];
  return items.filter((item): item is string => typeof item === 'string' && Boolean(item));
}

type RawIndexDoc = Record<string, unknown> & { title: string; href: string };
type RawIndexSection = Record<string, unknown> & { id: string; title: string };

function isRawIndexDoc(value: unknown): value is RawIndexDoc {
  return isRecord(value) && typeof value.title === 'string' && typeof value.href === 'string';
}

function isRawIndexSection(value: unknown): value is RawIndexSection {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string';
}

// Index docs: { title, href, text, aliases?, sections: [{ id, title, aliases? }] }. Aliases are
// how people phrase a page or a section; they match like a heading but are never shown. text has
// a line per block of the page (see parseLines); matching reads it as one run, tabs and line
// breaks turned to spaces so every offset stays the same.
// The fetched index is untrusted input; entries without a title and link are dropped.
function normalizeIndex(payload: unknown): HelpIndexDoc[] {
  const docs: unknown[] = Array.isArray(payload) ? payload : [];
  return docs
    .filter(isRawIndexDoc)
    .map((doc): HelpIndexDoc => {
      const source = typeof doc.text === 'string' ? doc.text : '';
      const text = source.replace(/[\t\n]/g, ' ');
      const aliases = toStrings(doc.aliases);
      const rawSections: unknown[] = Array.isArray(doc.sections) ? doc.sections : [];
      const sections: HelpIndexSection[] = rawSections
        .filter(isRawIndexSection)
        .map((section): HelpIndexSection => {
          const sectionAliases = toStrings(section.aliases);
          return {
            id: section.id,
            title: section.title,
            aliases: sectionAliases,
            lowerTitle: section.title.toLowerCase(),
            lowerAliases: sectionAliases.map((alias) => alias.toLowerCase())
          };
        });
      const lowerTitle = doc.title.toLowerCase();
      const lowerText = text.toLowerCase();
      const lowerAliases = aliases.map((alias) => alias.toLowerCase());
      const lower = {
        title: lowerTitle,
        text: lowerText,
        aliases: lowerAliases,
        all: [lowerTitle, ...lowerAliases, ...sections.flatMap((s) => [s.lowerTitle, ...s.lowerAliases]), lowerText].join('\n')
      };
      const lines = parseLines(source);
      locateSections(lower.text, lines, sections);
      return { title: doc.title, href: doc.href, text, lines, aliases, sections, lower };
    });
}

// The page's blocks, as the help center writes them into text: a line each, led by one tab for a
// heading, two for a bullet and three for a table row (its cells split by tabs); a numbered step
// keeps its "1. ". start and end are offsets into text, past the leading tabs.
const LINE_KINDS: readonly LineKind[] = ['text', 'heading', 'bullet', 'row'];

function parseLines(source: string): HelpIndexLine[] {
  const lines: HelpIndexLine[] = [];
  let offset = 0;
  let previous = '';
  source.split('\n').forEach((raw) => {
    const tabs = Math.min((raw.match(/^\t*/) || [''])[0].length, 3);
    const content = raw.slice(tabs);
    const start = offset + tabs;
    const kind = LINE_KINDS[tabs];
    offset += raw.length + 1;
    if (!content.trim()) {
      previous = '';
      return;
    }
    const step = kind === 'text' ? content.match(/^(\d+)\.\s+/) : null;
    lines.push({
      kind: step ? 'step' : kind,
      start: step ? start + step[0].length : start,
      end: start + content.length,
      marker: step ? `${step[1]}.` : '',
      cells: kind === 'row' ? content.split('\t') : null,
      // A table's first row is its header.
      header: kind === 'row' && previous !== 'row'
    });
    previous = kind;
  });
  return lines;
}

// Where each section's body sits in the page text: from the end of its heading line (which may
// number it, as the privacy policy does) to the next section's heading line. A section whose
// heading isn't in the text gets none.
function locateSections(lowerText: string, lines: HelpIndexLine[], sections: HelpIndexSection[]): void {
  let from = 0;
  const found = sections.map((section) => {
    const line = section.lowerTitle
      ? lines.find((item) => item.kind === 'heading' && item.start >= from && lowerText.slice(item.start, item.end).trim().endsWith(section.lowerTitle))
      : null;
    if (line) {
      from = line.end;
    }
    return line || null;
  });
  sections.forEach((section, i) => {
    const line = found[i];
    const next = found.slice(i + 1).find(Boolean);
    section.body = line ? { start: line.end, end: next ? next.start : lowerText.length } : null;
  });
}

// Synonym groups: string[][], each a set of words that mean the same thing to the reader.
function normalizeSynonyms(payload: unknown): HelpSynonyms {
  const groups = (Array.isArray(payload) ? payload : [])
    .map((group: unknown) => [...new Set(toStrings(group).map((word) => word.toLowerCase().trim()).filter(Boolean))])
    .filter((group) => group.length > 1);
  // An English word only counts on its own, plural or not ("pin" not in "pinyin"); CJK words anywhere.
  const members = groups
    .flatMap((group, groupIndex) => group.map((word, memberIndex): SynonymMember => ({
      word,
      groupIndex,
      memberIndex,
      pattern: /^[a-z]/.test(word) || /[a-z]$/.test(word)
        ? new RegExp(`(?<![a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?(?![a-z])`, 'g')
        : null
    })))
    .sort((a, b) => b.word.length - a.word.length);
  return { groups, members };
}

const preparedIndexes = new WeakMap<unknown[], HelpIndexDoc[]>();
const preparedSynonyms = new WeakMap<unknown[], HelpSynonyms>();
const vocabularies = new WeakMap<HelpIndexDoc[], string[]>();
const EMPTY_SYNONYMS = normalizeSynonyms([]);

// normalizeIndex gives every doc its lowercased forms, so an index whose
// docs all carry them was prepared, here or in another extension page.
function isPreparedIndex(index: readonly unknown[]): index is HelpIndexDoc[] {
  return index.every((doc) => isRecord(doc) && Boolean(doc.lower));
}

// A raw index, or one normalizeIndex already prepared.
function prepareIndex(index: unknown): HelpIndexDoc[] {
  if (!Array.isArray(index)) {
    return [];
  }
  if (isPreparedIndex(index)) {
    return index;
  }
  let prepared = preparedIndexes.get(index);
  if (!prepared) {
    prepared = normalizeIndex(index);
    preparedIndexes.set(index, prepared);
  }
  return prepared;
}

function isPreparedSynonyms(value: unknown): value is HelpSynonyms {
  return typeof value === 'object' && value !== null &&
    'groups' in value && Array.isArray(value.groups) &&
    'members' in value && Array.isArray(value.members);
}

// A prepared synonym list, or the raw groups.
function prepareSynonyms(synonyms: unknown): HelpSynonyms {
  if (isPreparedSynonyms(synonyms)) {
    return synonyms;
  }
  if (!Array.isArray(synonyms)) {
    return EMPTY_SYNONYMS;
  }
  let prepared = preparedSynonyms.get(synonyms);
  if (!prepared) {
    prepared = normalizeSynonyms(synonyms);
    preparedSynonyms.set(synonyms, prepared);
  }
  return prepared;
}

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

// Only the start is trimmed here; the row's own ellipsis cuts the end at whatever width it has.
const SNIPPET_LEAD = 24;
const SNIPPET_LENGTH = 240;

function snippet(text: string, term: string): string {
  const at = text.toLowerCase().indexOf(term);
  const start = at < 0 ? 0 : Math.max(0, at - SNIPPET_LEAD);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + SNIPPET_LENGTH).replace(/\s+/g, ' ')}`;
}

// The passage a result's hover card shows, as blocks laid out like the page: the heading it sits
// under, then from the first block that mentions a query word (or the section's first block) on,
// within a budget where CJK characters count double so every language fills about the same space.
// Each block is { kind: 'heading' | 'text' | 'bullet' | 'step' | 'row', text, marker?, cells?, header? }.
const CONTEXT_BUDGET = 300;
const CONTEXT_LEAD = 40;
const SENTENCE_END = /[。！？!?.；;：:]/;

function widthOf(value: string): number {
  let width = 0;
  for (const char of value) {
    width += /[぀-ヿ㐀-鿿豈-﫿가-힯＀-￯]/.test(char) ? 2 : 1;
  }
  return width;
}

// Up to budget wide, closing on a whole sentence when one ends in the second half.
function clip(value: string, budget: number): string {
  if (widthOf(value) <= budget) {
    return value;
  }
  let cut = 0;
  let width = 0;
  for (const char of value) {
    width += widthOf(char);
    if (width > budget) {
      break;
    }
    cut += char.length;
  }
  const head = value.slice(0, cut);
  const sentence = Math.max(...[...head.matchAll(/[。！？!?.；;]/g)].map((match) => (match.index ?? 0) + 1), 0);
  return sentence && widthOf(head.slice(0, sentence)) >= budget / 2 ? head.slice(0, sentence) : `${head.trimEnd()}…`;
}

function blockOf(doc: HelpIndexDoc, line: HelpIndexLine, from: number): HelpContextBlock {
  if (line.kind === 'row') {
    const cells = (line.cells || []).map((cell) => cell.trim());
    return line.header ? { kind: 'row', cells, header: true } : { kind: 'row', cells };
  }
  const value = doc.text.slice(from, line.end).trim();
  const block: HelpContextBlock = { kind: line.kind, text: from > line.start ? `…${value}` : value };
  if (line.marker) {
    block.marker = line.marker;
  }
  return block;
}

function blockWidth(block: HelpContextBlock): number {
  return block.kind === 'row' ? widthOf(block.cells.join('  ')) : widthOf(block.text) + 4;
}

function passage(doc: HelpIndexDoc, section: HelpIndexSection | null, words: string[]): HelpContextBlock[] {
  const lines = doc.lines || [];
  const sectionBody = section && section.body;
  const range = sectionBody || { start: 0, end: doc.text.length };
  const body = doc.lower.text.slice(range.start, range.end);
  const hits = words.filter(Boolean).map((word) => body.indexOf(word)).filter((at) => at >= 0);
  const hit = hits.length ? range.start + Math.min(...hits) : range.start;
  const at = lines.findIndex((line) => line.end > hit);
  if (at < 0 || lines[at].start >= range.end) {
    return [];
  }
  const blocks: HelpContextBlock[] = [];
  // The section's own heading, or the nearest one above the match.
  let heading = sectionBody ? lines.findIndex((line) => line.end === range.start) : -1;
  if (heading < 0) {
    for (let i = at; i >= 0 && heading < 0; i -= 1) {
      heading = lines[i].kind === 'heading' ? i : -1;
    }
  }
  if (heading >= 0 && heading !== at) {
    blocks.push(blockOf(doc, lines[heading], lines[heading].start));
  }
  // A table row brings the table's header row along.
  if (lines[at].kind === 'row' && !lines[at].header) {
    let first = at;
    while (first > 0 && !lines[first].header) {
      first -= 1;
    }
    blocks.push(blockOf(doc, lines[first], lines[first].start));
  }
  // A long block starts at the sentence holding the match, or a little before it.
  let from = lines[at].start;
  if (lines[at].kind !== 'row' && hit - from > CONTEXT_LEAD) {
    from = hit;
    while (from > lines[at].start && hit - from < CONTEXT_LEAD && !SENTENCE_END.test(doc.text[from - 1])) {
      from -= 1;
    }
  }
  let budget = CONTEXT_BUDGET - blocks.reduce((sum, block) => sum + blockWidth(block), 0);
  for (let i = at; i < lines.length && lines[i].start < range.end && budget > 20; i += 1) {
    if (i > at && lines[i].kind === 'heading' && !sectionBody) {
      break;
    }
    const block = blockOf(doc, lines[i], i === at ? from : lines[i].start);
    const width = blockWidth(block);
    if (width > budget && i > at && (block.kind === 'row' || budget < 60)) {
      break;
    }
    if (width > budget && block.kind !== 'row') {
      block.text = clip(block.text, budget - 4);
    }
    blocks.push(block);
    budget -= width;
  }
  // A heading with nothing under it says nothing.
  while (blocks.length && blocks[blocks.length - 1].kind === 'heading') {
    blocks.pop();
  }
  return blocks;
}

// Where one spelling of a word appears: the title, a heading, a section's aliases, the page's
// aliases, then the body.
function locate(doc: HelpIndexDoc, variant: string): WordHit | null {
  const heading = doc.sections.find((section) => contains(section.lowerTitle, variant));
  if (contains(doc.lower.title, variant)) {
    return { score: 10, section: heading || null, variant };
  }
  if (heading) {
    return { score: 4, section: heading, variant };
  }
  const aliased = doc.sections.find((section) => section.lowerAliases.some((alias) => contains(alias, variant)));
  if (aliased) {
    return { score: 3, section: aliased, variant };
  }
  if (doc.lower.aliases.some((alias) => contains(alias, variant))) {
    return { score: 2, section: null, variant };
  }
  if (contains(doc.lower.text, variant)) {
    return { score: 1, section: null, variant };
  }
  return null;
}

// A heading or alias that holds every word of a longer query is the question being asked.
function phraseBonus(doc: HelpIndexDoc, terms: string[][]): number {
  if (terms.length < 2) {
    return 0;
  }
  const fields = [doc.lower.title, ...doc.lower.aliases, ...doc.sections.flatMap((section) => [section.lowerTitle, ...section.lowerAliases])];
  return fields.some((field) => terms.every((variants) => fieldHas(field, variants))) ? 4 : 0;
}

// Short English words only count on their own ("ai" not in "email", "pc" not in "npc").
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

function fieldHas(text: string, variants: string[]): boolean {
  return variants.some((variant) => contains(text, variant));
}

function sectionHas(section: HelpIndexSection, variants: string[]): boolean {
  return fieldHas(section.lowerTitle, variants) || section.lowerAliases.some((alias) => fieldHas(alias, variants));
}

// The section to open: the one whose heading or aliases hold the most of the query's words,
// rarer words counting for more (支持 Safari 吗 → the Safari section, not 支持情况).
function bestSection(
  doc: HelpIndexDoc,
  terms: string[][],
  weights: number[],
  fallback: HelpIndexSection | null
): HelpIndexSection | null {
  let best = fallback;
  let bestScore = 0;
  let bestLength = 0;
  doc.sections.forEach((section) => {
    let value = 0;
    let length = 0;
    terms.forEach((variants, i) => {
      if (sectionHas(section, variants)) {
        value += weights[i];
        length += variants[0].length;
      }
    });
    // Ties go to the section that holds the longer words (Safari over 支持).
    if (value > bestScore + 1e-9 || (value > 0 && Math.abs(value - bestScore) < 1e-9 && length > bestLength)) {
      best = section;
      bestScore = value;
      bestLength = length;
    }
  });
  return best;
}

// Every word must match somewhere; a title hit outranks a heading, which outranks the body.
function matchExactly(docs: HelpIndexDoc[], terms: string[][]): RankedPage[] {
  const weights = terms.map((variants) => {
    const count = docs.reduce((sum, doc) => sum + doc.sections.filter((section) => sectionHas(section, variants)).length, 0);
    return 1 / (1 + count);
  });
  return docs
    .map((doc, order): RankedPage | null => {
      let score = 0;
      let section: HelpIndexSection | null = null;
      let firstVariant = '';
      for (const variants of terms) {
        let best: WordHit | null = null;
        for (const variant of variants) {
          const hit = locate(doc, variant);
          if (hit && (!best || hit.score > best.score)) {
            best = hit;
          }
        }
        if (!best) {
          return null;
        }
        score += best.score;
        if (best.section && !section) {
          section = best.section;
        }
        firstVariant = firstVariant || best.variant;
      }
      // Every spelling counts here, so a title hit on one (pinn) still opens the section another names (pin).
      section = bestSection(doc, terms, weights, section);
      score += phraseBonus(doc, terms);
      return {
        doc,
        score,
        order,
        section,
        detail: section ? section.title : snippet(doc.text, firstVariant),
        context: passage(doc, section, terms.flat())
      };
    })
    .filter((page): page is RankedPage => Boolean(page))
    .sort((a, b) => b.score - a.score || a.order - b.order);
}

// The pieces a loose match compares: pairs of characters for CJK text, which has no spaces
// between words, and whole words for the rest.
function unitsOf(text: string): string[] {
  const units = new Set<string>();
  (text.match(CJK_RUN) || []).forEach((run) => {
    if (run.length === 1) {
      units.add(run);
      return;
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      units.add(run.slice(i, i + 2));
    }
  });
  text.replace(CJK_RUN, ' ').split(/[^\p{L}\p{N}']+/u).forEach((word) => {
    if (word.length >= 2 && !LATIN_STOP_WORDS.has(word)) {
      units.add(word);
    }
  });
  return [...units];
}

function getQueryUnits(query: unknown, synonyms: unknown): string[] {
  const prepared = prepareSynonyms(synonyms);
  return unitsOf(planQuery(query, prepared, []).rewrites[0] || '');
}

function coverage(text: string, units: string[]): number {
  return units.filter((unit) => text.includes(unit)).length / units.length;
}

// The longest stretch of the query's CJK text found as typed (快捷键老是失灵 → 快捷键 in 修改快捷键).
function longestSharedRun(text: string, runs: string[]): number {
  let longest = 0;
  runs.forEach((run) => {
    for (let start = 0; start < run.length; start += 1) {
      for (let end = run.length; end - start > longest; end -= 1) {
        if (text.includes(run.slice(start, end))) {
          longest = end - start;
          break;
        }
      }
    }
  });
  return longest;
}

// How well a title, heading or alias answers the query: the share of its pieces it contains,
// or, for a long question, a phrase of three or more characters taken from it.
function headingMatch(text: string, units: string[], runs: string[]): number {
  const value = coverage(text, units);
  return longestSharedRun(text, runs) >= 3 ? Math.max(value, 0.4) + 0.1 : value;
}

function recommendFor(docs: HelpIndexDoc[], rewrite: string, excludedDocs: Set<HelpIndexDoc>): RankedPage[] {
  const units = unitsOf(rewrite);
  if (!units.length) {
    return [];
  }
  const runs = rewrite.match(CJK_RUN) || [];
  return docs
    .map((doc, order): RankedPage | null => {
      if (excludedDocs.has(doc)) {
        return null;
      }
      let headingCoverage = headingMatch(doc.lower.title, units, runs);
      let section: HelpIndexSection | null = null;
      doc.lower.aliases.forEach((alias) => {
        headingCoverage = Math.max(headingCoverage, headingMatch(alias, units, runs) * 0.9);
      });
      for (const item of doc.sections) {
        const value = Math.max(
          headingMatch(item.lowerTitle, units, runs) * 0.9,
          ...item.lowerAliases.map((alias) => headingMatch(alias, units, runs) * 0.85)
        );
        if (value > headingCoverage) {
          headingCoverage = value;
          section = item;
        }
      }
      const bodyCoverage = coverage(doc.lower.text, units);
      if (headingCoverage < 0.4 && !(units.length > 1 && bodyCoverage === 1)) {
        return null;
      }
      return {
        doc,
        order,
        section,
        score: headingCoverage + bodyCoverage * 0.25,
        detail: section ? section.title : snippet(doc.text, units[0]),
        context: passage(doc, section, units),
        recommended: true
      };
    })
    .filter((page): page is RankedPage => Boolean(page));
}

// When the words don't all appear, the pages whose title, a heading or an alias share most of
// the query's pieces (under any of its synonyms) are still worth reading; the body only breaks ties.
function recommend(docs: HelpIndexDoc[], rewrites: string[], excludedDocs: Set<HelpIndexDoc>): RankedPage[] {
  const best = new Map<HelpIndexDoc, RankedPage>();
  rewrites.forEach((rewrite) => {
    recommendFor(docs, rewrite, excludedDocs).forEach((item) => {
      const current = best.get(item.doc);
      if (!current || item.score > current.score) {
        best.set(item.doc, item);
      }
    });
  });
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, RECOMMENDED_LIMIT);
}

function toUrl(origin: string, href: string): string {
  return /^https?:\/\//i.test(href) ? href : `${origin}${href}`;
}

// Exact matches first; when they leave room, the closest pages follow as recommended reading.
function searchIndex(index: unknown, query: unknown, options?: HelpSearchOptions | null): HelpSearchResult[] {
  const settings: HelpSearchOptions = options && typeof options === 'object' ? options : {};
  const origin = String(settings.origin || '');
  const limit = Number.isFinite(Number(settings.limit)) ? Number(settings.limit) : RESULT_LIMIT;
  const docs = prepareIndex(index);
  if (!String(query || '').trim() || !docs.length) {
    return [];
  }
  const plan = planQuery(query, prepareSynonyms(settings.synonyms), docs);
  const exact = matchExactly(docs, plan.terms).slice(0, limit);
  const recommended = exact.length < limit
    ? recommend(docs, plan.rewrites, new Set(exact.map((item) => item.doc))).slice(0, limit - exact.length)
    : [];
  return [...exact, ...recommended].map((item) => {
    const result: HelpSearchResult = {
      title: item.doc.title,
      detail: item.detail,
      context: item.context,
      url: toUrl(origin, item.section ? `${item.doc.href}#${item.section.id}` : item.doc.href)
    };
    if (item.recommended) {
      result.recommended = true;
    }
    return result;
  });
}

// When nothing in the help center matches, the ways to ask instead: the WeChat group where
// that is the community channel, a GitHub issue and the author on X (no store rating here).
function buildFeedbackSuggestions(feedback: FeedbackConfig | null | undefined): HelpFeedbackSuggestion[] {
  const config = feedback && typeof feedback === 'object' ? feedback : null;
  if (!config) {
    return [];
  }
  const links: FeedbackLinks = config.links && typeof config.links === 'object' ? config.links : {};
  const t = typeof config.t === 'function' ? config.t : (_key: string, fallback: string) => fallback;
  const rows: Array<[string, string, string] | null> = [
    config.channel === 'wechat' && links.wechatQr
      ? ['community', links.wechatQr, t('settings_feedback_support_wechat_action', '加入反馈群')]
      : null,
    links.githubIssue
      ? ['github-issue', links.githubIssue, t('settings_feedback_support_github_issue_action', '创建 Issue')]
      : null,
    links.x
      ? ['contact-author', links.x, t('settings_feedback_support_contact_author_action', '联系作者')]
      : null
  ];
  return rows.filter((row): row is [string, string, string] => Boolean(row)).map(([feedbackKey, url, title]): HelpFeedbackSuggestion => ({
    type: 'helpFeedback',
    feedbackKey,
    title: String(title || ''),
    url: String(url)
  }));
}

function createSuggestionSource(options?: SuggestionSourceOptions | null) {
  const config: SuggestionSourceOptions = options && typeof options === 'object' ? options : {};
  const sendMessage = typeof config.sendMessage === 'function' ? config.sendMessage : () => false;
  const onUpdate = typeof config.onUpdate === 'function' ? config.onUpdate : () => {};
  let current: { key: string; items: Array<Partial<HelpSearchResult> | null>; failed?: boolean } = { key: '', items: [] };
  let pendingKey = '';

  // feedback ({ links, channel, t }) fills the list with ways to ask when nothing matched.
  function getSuggestions(
    query: unknown,
    locale: unknown,
    favicon: unknown,
    feedback?: FeedbackConfig | null
  ): Array<HelpArticleSuggestion | HelpFeedbackSuggestion> {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      return [];
    }
    const key = `${String(locale || '')}\n${trimmed}`;
    if (current.key !== key && pendingKey !== key) {
      pendingKey = key;
      const sent = sendMessage({
        action: 'getHelpCenterSearchResults',
        query: trimmed,
        locale: String(locale || '')
      }, (response?: HelpSearchResponse) => {
        if (pendingKey !== key) {
          return;
        }
        pendingKey = '';
        current = {
          key,
          items: response && Array.isArray(response.items) ? response.items : [],
          // An index that could not load says nothing about the help center's content.
          failed: !response || Boolean(response.reason)
        };
        onUpdate(query);
      });
      if (!sent) {
        pendingKey = '';
        current = { key, items: [], failed: true };
      }
    }
    if (current.key === key && !current.failed && current.items.length === 0) {
      return buildFeedbackSuggestions(feedback);
    }
    return current.items.map((item): HelpArticleSuggestion => {
      const context = item && item.context;
      return {
        type: 'helpArticle',
        title: String(item && item.title || ''),
        detail: String(item && item.detail || ''),
        url: String(item && item.url || ''),
        // The passage around the match, as blocks, for the row's hover card.
        context: Array.isArray(context) ? context : [],
        favicon: String(favicon || ''),
        recommended: Boolean(item && item.recommended)
      };
    }).filter((item) => item.title && item.url);
  }

  return Object.freeze({ getSuggestions });
}

export {
  RESULT_LIMIT,
  normalizeIndex,
  normalizeSynonyms,
  getExactTerms,
  getQueryUnits,
  searchIndex,
  buildFeedbackSuggestions,
  createSuggestionSource
};
export type {
  HelpArticleSuggestion,
  HelpContextBlock,
  HelpFeedbackSuggestion,
  HelpIndexDoc,
  HelpSearchResult,
  HelpSynonyms
};
