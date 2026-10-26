// The snippet and context passage shown under a result.
import type { HelpContextBlock, HelpIndexDoc, HelpIndexLine, HelpIndexSection } from './types';

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

interface PassageRange {
  start: number;
  end: number;
}

// The heading above the match: the section's own heading, or the nearest
// one above the matched line; -1 when there is none.
function headingAbove(lines: HelpIndexLine[], at: number, range: PassageRange, inSection: boolean): number {
  if (inSection) {
    const own = lines.findIndex((line) => line.end === range.start);
    if (own >= 0) {
      return own;
    }
  }
  for (let i = at; i >= 0; i -= 1) {
    if (lines[i].kind === 'heading') {
      return i;
    }
  }
  return -1;
}

// The header row of the table a row belongs to.
function tableHeaderOf(lines: HelpIndexLine[], at: number): number {
  let first = at;
  while (first > 0 && !lines[first].header) {
    first -= 1;
  }
  return first;
}

// A long block starts at the sentence holding the match, or a little before it.
function startOfMatch(doc: HelpIndexDoc, line: HelpIndexLine, hit: number): number {
  if (line.kind === 'row' || hit - line.start <= CONTEXT_LEAD) {
    return line.start;
  }
  let from = hit;
  while (from > line.start && hit - from < CONTEXT_LEAD && !SENTENCE_END.test(doc.text[from - 1])) {
    from -= 1;
  }
  return from;
}

// Adds the matched line and the lines after it while they fit the budget.
function addFollowingBlocks(
  doc: HelpIndexDoc,
  blocks: HelpContextBlock[],
  at: number,
  from: number,
  range: PassageRange,
  inSection: boolean
): void {
  const lines = doc.lines || [];
  let budget = CONTEXT_BUDGET - blocks.reduce((sum, block) => sum + blockWidth(block), 0);
  for (let i = at; i < lines.length && lines[i].start < range.end && budget > 20; i += 1) {
    if (i > at && lines[i].kind === 'heading' && !inSection) {
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
}

function passage(doc: HelpIndexDoc, section: HelpIndexSection | null, words: string[]): HelpContextBlock[] {
  const lines = doc.lines || [];
  const sectionBody = section && section.body;
  const inSection = Boolean(sectionBody);
  const range = sectionBody || { start: 0, end: doc.text.length };
  const body = doc.lower.text.slice(range.start, range.end);
  const hits = words.filter(Boolean).map((word) => body.indexOf(word)).filter((at) => at >= 0);
  const hit = hits.length ? range.start + Math.min(...hits) : range.start;
  const at = lines.findIndex((line) => line.end > hit);
  if (at < 0 || lines[at].start >= range.end) {
    return [];
  }
  const blocks: HelpContextBlock[] = [];
  const heading = headingAbove(lines, at, range, inSection);
  if (heading >= 0 && heading !== at) {
    blocks.push(blockOf(doc, lines[heading], lines[heading].start));
  }
  // A table row brings the table's header row along.
  if (lines[at].kind === 'row' && !lines[at].header) {
    const header = tableHeaderOf(lines, at);
    blocks.push(blockOf(doc, lines[header], lines[header].start));
  }
  addFollowingBlocks(doc, blocks, at, startOfMatch(doc, lines[at], hit), range, inSection);
  // A heading with nothing under it says nothing.
  while (blocks.length && blocks[blocks.length - 1].kind === 'heading') {
    blocks.pop();
  }
  return blocks;
}

export {
  CONTEXT_BUDGET,
  CONTEXT_LEAD,
  SENTENCE_END,
  SNIPPET_LEAD,
  SNIPPET_LENGTH,
  blockOf,
  blockWidth,
  clip,
  passage,
  snippet,
  widthOf
};
