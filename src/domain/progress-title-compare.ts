// Reading a page title for the work it names and the episode it is, and
import type { ProgressDirection } from './progress-match';
// comparing two titles.

interface TitleReading {
  // Lowercase; '' when the title names no work.
  workName: string;
  // NaN when the title marks no episode.
  episode: number;
  hasMarker: boolean;
}

interface TitleComparison {
  sameWork: boolean;
  differentWork: boolean;
  direction: ProgressDirection;
}

const CJK_NUMERAL = '零〇一二两三四五六七八九十百千';
const EPISODE_MARKER_PATTERNS: readonly RegExp[] = [
  new RegExp(`第\\s*([0-9${CJK_NUMERAL}]+)\\s*[集话話章节節回卷部季期篇幕页頁]`, 'g'),
  /\b(?:ep|episode|chapter|ch|vol|part|p)\.?\s*(\d+)\b/gi,
  /[（(【[]\s*(\d+)\s*[)）】\]]/g
];
const TITLE_SEPARATOR_PATTERN = /\s*[|｜_–—·]\s*|\s+-\s+/;
const MIN_LATIN_WORK_NAME = 4;
const MIN_CJK_WORK_NAME = 2;

const CJK_DIGITS: ReadonlyMap<string, number> = new Map([
  ['零', 0], ['〇', 0], ['一', 1], ['二', 2], ['两', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6], ['七', 7], ['八', 8], ['九', 9]
]);
const CJK_UNITS: ReadonlyMap<string, number> = new Map([['十', 10], ['百', 100], ['千', 1000]]);

function parseCjkNumber(text: string): number {
  let total = 0;
  let current = 0;
  for (const char of text) {
    const digit = CJK_DIGITS.get(char);
    const unit = CJK_UNITS.get(char);
    if (digit !== undefined) {
      current = digit;
    } else if (unit !== undefined) {
      total += (current || 1) * unit;
      current = 0;
    } else {
      return NaN;
    }
  }
  return total + current;
}

function parseEpisodeNumber(text: string): number {
  return /^\d+$/.test(text) ? Number(text) : parseCjkNumber(text);
}

function normalizeTitle(title: unknown): string {
  return String(title || '').replace(/\s+/g, ' ').trim();
}

// Splits a page title into the work name and the episode number it names.
// The work name is what precedes the first episode marker; when the marker
// leads the title ("第2集 副标题 - 剧名 - 站点"), it is the part after the
// episode's own part, leaving out a trailing site name.
function readTitle(title: unknown): TitleReading {
  const text = normalizeTitle(title);
  let markerIndex = -1;
  let episode = NaN;
  for (const pattern of EPISODE_MARKER_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && (markerIndex < 0 || match.index < markerIndex)) {
      markerIndex = match.index;
      episode = parseEpisodeNumber(match[1]);
    }
  }
  let head = markerIndex >= 0
    ? text.slice(0, markerIndex)
    : text.split(TITLE_SEPARATOR_PATTERN)[0];
  if (markerIndex >= 0 && !head.replace(/[\s|｜_–—·:：\-【[（(]+/g, '')) {
    const parts = text.split(TITLE_SEPARATOR_PATTERN).filter(Boolean);
    const rest = parts.slice(1, parts.length >= 3 ? -1 : undefined);
    head = rest[0] || '';
  }
  const workName = head.replace(/[\s|｜_–—·:：\-【[（(]+$/, '').trim().toLowerCase();
  return { workName, episode, hasMarker: markerIndex >= 0 };
}

function isMeaningfulWorkName(name: string): boolean {
  const cjk = (name.match(/[\u3400-\u9fff]/g) || []).length;
  return cjk >= MIN_CJK_WORK_NAME || name.replace(/[^a-z0-9]/gi, '').length >= MIN_LATIN_WORK_NAME;
}

// Titles agree when both name the same work and one marks an episode;
// identical generic titles prove nothing. They disagree when both name a
// work and the names differ.
function compareTitles(beforeTitle: unknown, afterTitle: unknown): TitleComparison {
  const before = readTitle(beforeTitle);
  const after = readTitle(afterTitle);
  const differentText = normalizeTitle(beforeTitle) !== normalizeTitle(afterTitle);
  const bothNamed = isMeaningfulWorkName(before.workName) && isMeaningfulWorkName(after.workName);
  const sameWork = Boolean(
    bothNamed && before.workName === after.workName &&
    (before.hasMarker || after.hasMarker) && differentText
  );
  const differentWork = Boolean(bothNamed && differentText && before.workName !== after.workName);
  let direction: ProgressDirection = 'unknown';
  if (sameWork && Number.isFinite(before.episode) && Number.isFinite(after.episode) &&
      before.episode !== after.episode) {
    direction = after.episode > before.episode ? 'forward' : 'backward';
  }
  return { sameWork, differentWork, direction };
}

export {
  CJK_DIGITS,
  CJK_NUMERAL,
  CJK_UNITS,
  EPISODE_MARKER_PATTERNS,
  MIN_CJK_WORK_NAME,
  MIN_LATIN_WORK_NAME,
  TITLE_SEPARATOR_PATTERN,
  compareTitles,
  isMeaningfulWorkName,
  normalizeTitle,
  parseCjkNumber,
  parseEpisodeNumber,
  readTitle
};
export type {
  TitleComparison,
  TitleReading
};
