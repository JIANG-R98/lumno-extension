// Decides whether a page is a later episode, chapter or page of the work a
import { CJK_NUMERAL, compareTitles, normalizeTitle, readTitle } from './progress-title-compare';
import type { ProgressDirection } from './progress-title-compare';
import { SERIES_PATH_WORDS, UNRELATED_PATH_WORDS, compareUrls, getPathSegments, getQueryEntries, getSiteKey, hasPathWord, isDigits, parseUrl } from './progress-url-compare';
import type { UrlComparison } from './progress-url-compare';
// tracked card points to. It never guesses: when neither the URL nor the
// title proves the two pages belong to the same work, the answer is no.

interface ProgressPage {
  url: string;
  title?: string;
}

// What a page says about itself: its next and previous links, the series
// it names, and its episode number.
interface ProgressPageHints {
  nextUrls?: string[];
  prevUrls?: string[];
  seriesName?: string;
  episode?: number;
}

// How the person got to the visited page and what the pages say.
interface ProgressCompareContext {
  // Reached from the card's page.
  fromCurrent?: boolean;
  // The history transition ("link", "typed", ...).
  transition?: string;
  currentHints?: ProgressPageHints;
  candidateHints?: ProgressPageHints;
  currentEpisode?: number;
}

type ProgressConfidence = 'high' | 'medium' | 'none';

interface ProgressFactor {
  signal: string;
  points: number;
}

interface ProgressComparison {
  match: boolean;
  confidence: ProgressConfidence;
  // The strongest signal, or why the pages do not match.
  reason: string;
  direction: ProgressDirection;
  score: number;
  factors: readonly ProgressFactor[];
}

interface SeriesPageHints {
  // The page has episode or chapter navigation.
  episodeNavigation?: boolean;
  seriesName?: string;
}

function listHas(list: readonly unknown[] | null | undefined, url: unknown): boolean {
  const target = getComparableUrl(url);
  return Boolean(target) && Array.isArray(list) &&
    list.some((entry) => getComparableUrl(entry) === target);
}

function normalizeSeriesName(value: unknown): string {
  return normalizeTitle(value).toLowerCase();
}

// Points each signal contributes; a page continues the card's work at
// MEDIUM_SCORE, and HIGH_SCORE outranks title-only matches on other cards.
const SCORE = Object.freeze({
  anchoredNumber: 3,
  looseNumber: 1,
  bigJump: -2,
  sameTitle: 2,
  differentTitle: -3,
  navigatedFromCard: 2,
  typedOrBookmarked: -1,
  seriesPathWord: 1,
  unrelatedPathWord: -2,
  pageLink: 5,
  sameSeriesMeta: 3,
  differentSeriesMeta: -3
});
const HIGH_SCORE = 4;
const MEDIUM_SCORE = 3;
const MAX_FORWARD_STEP = 20;
const NAVIGATION_TRANSITIONS: ReadonlySet<string> = new Set(['link', 'form_submit', 'reload', 'auto_subframe', 'manual_subframe']);

function result(
  match: boolean,
  confidence: ProgressConfidence,
  reason: string,
  direction?: ProgressDirection,
  score?: number,
  factors?: readonly ProgressFactor[]
): ProgressComparison {
  return Object.freeze({
    match,
    confidence,
    reason,
    direction: direction || 'unknown',
    score: typeof score === 'number' && Number.isFinite(score) ? score : 0,
    factors: Object.freeze((factors || []).slice())
  });
}

// Compares the page a tracked card points to (current) with a page the
// person is on (candidate).
type AddFactor = (signal: string, points: number) => void;

// What the pages say about each other: a next or previous link between them
// settles it, whatever the URLs look like.
function pageLinkDirection(
  currentUrl: string,
  candidateUrl: string,
  currentHints: ProgressPageHints,
  candidateHints: ProgressPageHints
): ProgressDirection {
  if (listHas(currentHints.nextUrls, candidateUrl) || listHas(candidateHints.prevUrls, currentUrl)) {
    return 'forward';
  }
  if (listHas(currentHints.prevUrls, candidateUrl) || listHas(candidateHints.nextUrls, currentUrl)) {
    return 'backward';
  }
  return 'unknown';
}

// The number that changed in the URL, and the direction it points.
function addUrlNumberFactors(urlComparison: UrlComparison, add: AddFactor): ProgressDirection {
  if (urlComparison.kind !== 'numeric') {
    return 'unknown';
  }
  add(urlComparison.anchored ? 'url-pattern' : 'url-number',
    urlComparison.anchored ? SCORE.anchoredNumber : SCORE.looseNumber);
  const { from, to } = urlComparison.firstChange;
  if (to > from && urlComparison.step > MAX_FORWARD_STEP) add('big-jump', SCORE.bigJump);
  return to > from ? 'forward' : 'backward';
}

function addSeriesFactors(
  currentTitle: string | undefined,
  currentHints: ProgressPageHints,
  candidateHints: ProgressPageHints,
  add: AddFactor
): void {
  const currentSeries = normalizeSeriesName(currentHints.seriesName);
  const candidateSeries = normalizeSeriesName(candidateHints.seriesName);
  if (currentSeries && candidateSeries) {
    add(currentSeries === candidateSeries ? 'series-meta' : 'series-meta-mismatch',
      currentSeries === candidateSeries ? SCORE.sameSeriesMeta : SCORE.differentSeriesMeta);
  } else if (candidateSeries && readTitle(currentTitle).workName === candidateSeries) {
    add('series-meta', SCORE.sameTitle);
  }
}

function episodeDirection(ctx: ProgressCompareContext, candidateHints: ProgressPageHints): ProgressDirection {
  const currentEpisode = Number(ctx.currentEpisode);
  const candidateEpisode = Number(candidateHints.episode);
  if (Number.isFinite(currentEpisode) && Number.isFinite(candidateEpisode) &&
      currentEpisode !== candidateEpisode && currentEpisode > 0 && candidateEpisode > 0) {
    return candidateEpisode > currentEpisode ? 'forward' : 'backward';
  }
  return 'unknown';
}

// How the person got to the page, and what its path says it is.
function addVisitFactors(ctx: ProgressCompareContext, after: URL, add: AddFactor): void {
  const transition = String(ctx.transition || '');
  if (ctx.fromCurrent === true && (!transition || NAVIGATION_TRANSITIONS.has(transition))) {
    add('navigated-from-card', SCORE.navigatedFromCard);
  } else if (transition && !NAVIGATION_TRANSITIONS.has(transition)) {
    add('typed-or-bookmarked', SCORE.typedOrBookmarked);
  }
  if (hasPathWord(after, UNRELATED_PATH_WORDS)) {
    add('unrelated-path', SCORE.unrelatedPathWord);
  } else if (hasPathWord(after, SERIES_PATH_WORDS)) {
    add('series-path', SCORE.seriesPathWord);
  }
}

function addTitleFactors(titles: ReturnType<typeof compareTitles>, add: AddFactor): void {
  if (titles.sameWork) add('title-match', SCORE.sameTitle);
  if (titles.differentWork) add('title-mismatch', SCORE.differentTitle);
}

// Both URLs parsed, on one site; otherwise the result that rejects them.
function parseSameSitePages(currentUrl: string, candidateUrl: string): { before: URL; after: URL } | { rejected: ProgressComparison } {
  const before = parseUrl(currentUrl);
  const after = parseUrl(candidateUrl);
  if (!before || !after) return { rejected: result(false, 'none', 'invalid-url') };
  if (getSiteKey(before) !== getSiteKey(after)) return { rejected: result(false, 'none', 'site-mismatch') };
  return { before, after };
}

function firstKnownDirection(directions: readonly ProgressDirection[]): ProgressDirection {
  return directions.find((direction) => direction !== 'unknown') || 'unknown';
}

function concludeComparison(factors: ProgressFactor[], direction: ProgressDirection): ProgressComparison {
  const score = factors.reduce((total, factor) => total + factor.points, 0);
  if (score < MEDIUM_SCORE) return result(false, 'none', 'insufficient', 'unknown', score, factors);
  const strongest = factors.reduce((best, factor) => (factor.points > best.points ? factor : best));
  return result(true, score >= HIGH_SCORE ? 'high' : 'medium', strongest.signal, direction, score, factors);
}

function compareProgressPages(
  current: ProgressPage | null | undefined,
  candidate: ProgressPage | null | undefined,
  context?: ProgressCompareContext | null
): ProgressComparison {
  const ctx = context && typeof context === 'object' ? context : {};
  const currentUrl = current ? current.url : '';
  const candidateUrl = candidate ? candidate.url : '';
  const pages = parseSameSitePages(currentUrl, candidateUrl);
  if ('rejected' in pages) return pages.rejected;
  const { before, after } = pages;

  const factors: ProgressFactor[] = [];
  const add: AddFactor = (signal, points) => {
    factors.push({ signal, points });
  };
  const currentHints = ctx.currentHints || {};
  const candidateHints = ctx.candidateHints || {};
  const linkDirection = pageLinkDirection(currentUrl, candidateUrl, currentHints, candidateHints);
  if (linkDirection !== 'unknown') add('page-link', SCORE.pageLink);

  const urlComparison = compareUrls(before, after);
  if (urlComparison.kind === 'same') return result(false, 'none', 'same-page');
  if (urlComparison.kind === 'structure-mismatch' && linkDirection === 'unknown') {
    return result(false, 'none', 'structure-mismatch');
  }
  const urlDirection = addUrlNumberFactors(urlComparison, add);

  const titles = compareTitles(current && current.title, candidate && candidate.title);
  addTitleFactors(titles, add);
  addSeriesFactors(current ? current.title : undefined, currentHints, candidateHints, add);
  addVisitFactors(ctx, after, add);
  // Direction: page links, then the URL's numbers, then episode metadata,
  // then the titles.
  const direction = firstKnownDirection([linkDirection, urlDirection, episodeDirection(ctx, candidateHints), titles.direction]);
  return concludeComparison(factors, direction);
}

// Automatic updates move forward only, so rewatching an earlier episode
// never rewinds the card.
function shouldAdvance(comparison: Pick<ProgressComparison, 'match' | 'direction'> | null | undefined): boolean {
  return Boolean(comparison && comparison.match && comparison.direction !== 'backward');
}

// Pinning a page that looks like part of a series (an episode, chapter or
// page of a longer work) starts tracking it. Generic numbered pages such
// as issues, threads or products must not qualify: tracking would then
// wander to their neighbours.
const SERIES_TITLE_PATTERNS: readonly RegExp[] = [
  // 第12集 / 第十二话 / 第3章 / 第2季 / 第5話 / 第1巻 / 第4课
  new RegExp(`第\\s*[0-9${CJK_NUMERAL}]+\\s*[集话話章节節回卷巻册冊部季期篇幕页頁课課讲講]`),
  // 12集 / 12话 / 12話 / 12화
  /\d+\s*[集话話화]/,
  // EP12 / Ep.12 / Episode 12 / S01E02 / Season 2
  /\b(?:ep|episode|season)\.?\s*\d+\b/i,
  /\bs\d{1,2}\s*e\d{1,3}\b/i,
  // Chapter 12 / Ch. 12 / Chap 12 / Vol. 3 / Volume 3 / Part 2 / Lesson 4 / P2
  /\b(?:chapter|chap|ch|vol|volume|part|lesson)\.?\s*\d+\b/i,
  /(?:^|[\s【[(（|｜_-])p\s?\d+\b/i,
  // 最终话 / 最終回 / 大结局 / 完结篇 / 番外 / 上集 / 下篇
  /最终话|最終話|最終回|大结局|完结篇|番外|[上中下]集|[上中下]篇/
];
// Query parameters that name an episode, chapter or part.
const SERIES_QUERY_KEYS: ReadonlySet<string> = new Set([
  'p', 'ep', 'episode', 'episode_id', 'episodeid', 'eid', 'e',
  'chapter', 'chapter_id', 'chapterid', 'chap', 'cid',
  'part', 'vol', 'volume', 'season'
]);
const SERIES_PATH_PATTERNS: readonly RegExp[] = [
  // ep123 / episode-4 / chapter_12 / ch5 / vol-2 / part3 / season-2 / s01e02
  /^(?:ep|episode|chapter|chap|ch|vol|volume|part|season|s\d{1,2}e)[-_]?\d+/i,
  // 55357-1-2.html (play pages: work-source-episode)
  /^\d+(?:[-_]\d+){2,}(?:\.[a-z]+)?$/i,
  // 72035_2.html (the second page of a chapter)
  /^\d{3,}_\d+\.html?$/i
];

function hasSeriesTitle(title: unknown): boolean {
  const text = normalizeTitle(title);
  return Boolean(text) && SERIES_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasSeriesUrl(value: unknown): boolean {
  const url = parseUrl(value);
  if (!url || hasPathWord(url, UNRELATED_PATH_WORDS)) return false;
  for (const { key, value: paramValue } of getQueryEntries(url)) {
    if (SERIES_QUERY_KEYS.has(key) && isDigits(paramValue)) return true;
  }
  const segments = getPathSegments(url);
  if (segments.some((segment) => SERIES_PATH_PATTERNS.some((pattern) => pattern.test(segment)))) {
    return true;
  }
  // /novel/2013/72035.html: a chapter file under a numeric work id.
  const last = segments[segments.length - 1] || '';
  const parent = segments[segments.length - 2] || '';
  return /^\d{3,}\.html?$/i.test(last) && /^\d{3,}$/.test(parent);
}

// Whether a page reads as one part of a longer work, from its title, its
// URL, or what the page itself says (episode navigation or metadata).
function looksLikeSeriesPage(page: ProgressPage | null | undefined, hints?: SeriesPageHints | null): boolean {
  if (!page || !parseUrl(page.url)) return false;
  if (hints && (hints.episodeNavigation === true || normalizeSeriesName(hints.seriesName))) return true;
  return hasSeriesTitle(page.title) || hasSeriesUrl(page.url);
}

// The key progress history is stored under; one tracked card per site.
function getProgressSiteKey(value: unknown): string {
  const url = parseUrl(value);
  return url ? getSiteKey(url) : '';
}

// A URL in the form links and history use for the same page: no anchor
// hash, no trailing slash, no sharing or tracking parameters.
function getComparableUrl(value: unknown): string {
  const url = parseUrl(value);
  if (!url) return '';
  const route = /^#!?\//.test(url.hash) ? url.hash : '';
  const query = getQueryEntries(url)
    .map(({ key, value: paramValue }) => `${key}=${paramValue}`)
    .sort()
    .join('&');
  const path = url.pathname.replace(/\/+$/, '');
  return `${getSiteKey(url)}${path}${query ? `?${query}` : ''}${route}`;
}

export {
  HIGH_SCORE,
  MAX_FORWARD_STEP,
  MEDIUM_SCORE,
  NAVIGATION_TRANSITIONS,
  SCORE,
  SERIES_PATH_PATTERNS,
  SERIES_QUERY_KEYS,
  SERIES_TITLE_PATTERNS,
  addSeriesFactors,
  addTitleFactors,
  addUrlNumberFactors,
  addVisitFactors,
  compareProgressPages,
  concludeComparison,
  episodeDirection,
  firstKnownDirection,
  getComparableUrl,
  getProgressSiteKey,
  hasSeriesTitle,
  hasSeriesUrl,
  listHas,
  looksLikeSeriesPage,
  normalizeSeriesName,
  pageLinkDirection,
  parseSameSitePages,
  result,
  shouldAdvance
};
export type {
  AddFactor,
  ProgressCompareContext,
  ProgressComparison,
  ProgressConfidence,
  ProgressFactor,
  ProgressPage,
  ProgressPageHints,
  SeriesPageHints
};
