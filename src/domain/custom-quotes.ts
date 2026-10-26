import { customQuotes } from './settings/newtab-quote';
const KEY = customQuotes.key;
const MAX_BYTES = 1024 * 1024;
const MAX_QUOTES = 1000;

interface Quote {
  text: string;
  author: string;
}

// A user's quote collection as it is stored.
interface QuoteLibrary {
  version: 1;
  filename: string;
  revision: number;
  quotes: Quote[];
}

// Which quote a day shows, kept so the same one stays up all day.
interface QuotePick {
  day: string;
  revision: number;
  index: number;
}

// The parts of a picked File the reader uses.
interface QuoteFile {
  name: string;
  size: number;
  text(): Promise<string>;
}

const clean = (value: unknown): string => String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
function parseQuotes(content: unknown, format: 'md' | 'txt' = 'md'): Quote[] {
  const text = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('too-large');
  const quotes: Quote[] = []; let fence: { char: string; length: number } | null = null;
  const markdown = format !== 'txt';
  text.split('\n').forEach(line => {
    if (markdown) {
      const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        return;
      }
      if (marker) { fence = { char: marker[1][0], length: marker[1].length }; return; }
      if (/^\s*(#{1,6}\s|[-*_]{3,}\s*$|<!--)/.test(line)) return;
    }
    const quote = markdown
      ? clean(line.replace(/^\s*(?:>\s*)+/, '').replace(/^\s*(?:[-+*]|\d+[.)])\s+/, ''))
      : line.trim();
    if (!quote) return;
    if (quote.length > 500 || quotes.length >= MAX_QUOTES) throw new Error('limit');
    quotes.push({ text: quote, author: '' });
  });
  if (!quotes.length) throw new Error('empty');
  return quotes;
}
// Retain the previous helper for callers; all new imports use line-based parsing.
const parseMarkdown = (content: unknown): Quote[] => parseQuotes(content, 'md');
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
// A stored collection, read as untrusted; null when it holds no usable quote.
function normalizeLibrary(value: unknown): QuoteLibrary | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.quotes)) return null;
  const stored: readonly unknown[] = value.quotes;
  if (!stored.length || stored.length > MAX_QUOTES) return null;
  const quotes: Quote[] = stored.flatMap((item): Quote[] => {
    if (!isRecord(item) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 500) return [];
    return [{ text: item.text.trim(), author: String(item.author || '').slice(0, 120) }];
  });
  return quotes.length ? { version: 1, filename: String(value.filename || '').slice(0, 128), revision: Number(value.revision) || 0, quotes } : null;
}
// `random` (defaults to Math.random) is injectable so tests stay deterministic.
// A stored pick, read as untrusted; null when it is not one.
function readQuotePick(value: unknown): QuotePick | null {
  if (!value || typeof value !== 'object' || !('day' in value) || !('revision' in value) || !('index' in value)) {
    return null;
  }
  const { day, revision, index } = value;
  return typeof day === 'string' && typeof revision === 'number' && typeof index === 'number'
    ? { day, revision, index }
    : null;
}
function select(library: QuoteLibrary, date: Date, pick?: QuotePick | null, reroll?: boolean, random?: () => number) {
  const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let hash = 0; for (const char of `${day}|${library.filename}|${library.revision}`) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  const existing = pick && pick.day === day && pick.revision === library.revision && Number.isInteger(pick.index) && pick.index >= 0 && pick.index < library.quotes.length;
  let index = existing && pick ? pick.index : hash % library.quotes.length;
  // A reroll picks another quote at random, never the one on screen.
  if (reroll && library.quotes.length > 1) {
    const draw = typeof random === 'function' ? random : Math.random;
    const offset = 1 + Math.floor(draw() * (library.quotes.length - 1));
    index = (index + Math.min(offset, library.quotes.length - 1)) % library.quotes.length;
  }
  return { quote: { ...library.quotes[index], source: library.filename, url: '' }, pick: { day, revision: library.revision, index } };
}
// Reads a picked .txt / .md / .markdown file into a collection record, or
// throws ('type', 'too-large', 'empty', 'limit'). New Tab and Options share it.
async function readLibraryFile(file: QuoteFile | null | undefined, now?: number): Promise<QuoteLibrary> {
  const name = String(file && file.name || '');
  if (!/\.(txt|md|markdown)$/i.test(name)) throw new Error('type');
  if (!file || !file.size || file.size > MAX_BYTES) throw new Error('too-large');
  const text = await file.text();
  const quotes = parseQuotes(text, /\.txt$/i.test(name) ? 'txt' : 'md');
  return { version: 1, filename: name.slice(0, 128), revision: Number(now) || Date.now(), quotes };
}

export {
  KEY,
  MAX_BYTES,
  MAX_QUOTES,
  parseQuotes,
  parseMarkdown,
  normalizeLibrary,
  readLibraryFile,
  readQuotePick,
  select
};
export type { Quote, QuoteFile, QuoteLibrary, QuotePick };
