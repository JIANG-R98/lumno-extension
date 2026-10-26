// Reading and preparing the help center index and synonym list.
import type { HelpIndexDoc, HelpIndexLine, HelpIndexSection, HelpSynonyms, LineKind, RawIndexDoc, RawIndexSection, SynonymMember } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function toStrings(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value : [];
  return items.filter((item): item is string => typeof item === 'string' && Boolean(item));
}


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

export {
  EMPTY_SYNONYMS,
  LINE_KINDS,
  isPreparedIndex,
  isPreparedSynonyms,
  isRawIndexDoc,
  isRawIndexSection,
  isRecord,
  locateSections,
  normalizeIndex,
  normalizeSynonyms,
  parseLines,
  prepareIndex,
  prepareSynonyms,
  preparedIndexes,
  preparedSynonyms,
  toStrings,
  vocabularies
};
