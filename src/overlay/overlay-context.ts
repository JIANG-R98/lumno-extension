// What the worker opens the search overlay with: the window's tabs and the
// open context (see OverlayOpenContext). They arrive through executeScript,
// so the page reads them as untrusted.
import type { OverlayLoadingSession, OverlayTab } from '../domain/messages';
import { readSiteSearchProvider } from '../domain/search/site-search-provider-reader';
import type { SiteSearchProvider } from '../domain/search/types';

interface OverlayOpenOptions {
  // The page's zoom, which the overlay undoes to keep its size; 1 when unknown.
  tabZoomFactor: number;
  prefillQuery: string;
  prioritizeCurrentPageMatch: boolean;
  currentTabId: number | null;
  currentTabUrl: string;
  // When the user asked for the overlay, for the entry motion's budget.
  openedAt: number;
  documentPipEnabled: boolean;
  siteSearchProviders: SiteSearchProvider[];
  // Open even when an overlay is already showing, instead of toggling it.
  ensureOpen: boolean;
  loadingSessionTracked: boolean;
  // The input to put back after the page loaded under the overlay.
  loadingSession: OverlayLoadingSession | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readNumber(value: unknown): number {
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
}

function readLoadingSession(value: unknown): OverlayLoadingSession | null {
  if (!isRecord(value) || typeof value.inputValue !== 'string') {
    return null;
  }
  const inputValue = value.inputValue;
  const inputLength = inputValue.length;
  const rawStart = readNumber(value.selectionStart);
  const selectionStart = Number.isFinite(rawStart)
    ? Math.max(0, Math.min(inputLength, Math.trunc(rawStart)))
    : inputLength;
  const rawEnd = readNumber(value.selectionEnd);
  const selectionEnd = Number.isFinite(rawEnd)
    ? Math.max(selectionStart, Math.min(inputLength, Math.trunc(rawEnd)))
    : selectionStart;
  return {
    inputValue,
    selectionStart,
    selectionEnd,
    selectionDirection: value.selectionDirection === 'backward' || value.selectionDirection === 'forward'
      ? value.selectionDirection
      : 'none',
    focused: value.focused !== false
  };
}

// An openedAt in the future or over a minute old is not trusted; now is
// used instead.
function readOpenedAt(value: unknown, now: number): number {
  const openedAt = readNumber(value);
  return Number.isFinite(openedAt) && openedAt <= now + 1000 && openedAt >= now - 60 * 1000
    ? openedAt
    : now;
}

function readOverlayOpenOptions(value: unknown, now: number): OverlayOpenOptions {
  const context = isRecord(value) ? value : {};
  const tabZoomFactor = readNumber(context.tabZoomFactor);
  const currentTabId = readNumber(context.currentTabId);
  const siteSearchProviders = Array.isArray(context.siteSearchProviders)
    ? context.siteSearchProviders.map(readSiteSearchProvider)
      .filter((provider): provider is SiteSearchProvider => provider !== null)
    : [];
  return {
    tabZoomFactor: Number.isFinite(tabZoomFactor) && tabZoomFactor > 0 ? tabZoomFactor : 1,
    prefillQuery: typeof context.prefillQuery === 'string' ? context.prefillQuery.trim() : '',
    prioritizeCurrentPageMatch: Boolean(context.prioritizeCurrentPageMatch),
    currentTabId: Number.isFinite(currentTabId) ? currentTabId : null,
    currentTabUrl: typeof context.currentTabUrl === 'string' ? context.currentTabUrl.trim() : '',
    openedAt: readOpenedAt(context.openedAt, now),
    documentPipEnabled: Boolean(context.documentPipEnabled),
    siteSearchProviders,
    ensureOpen: context.ensureOpen === true,
    loadingSessionTracked: context.loadingSessionTracked === true,
    loadingSession: readLoadingSession(context.loadingSession)
  };
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readOverlayTab(value: unknown): OverlayTab | null {
  if (!isRecord(value) || typeof value.id !== 'number') {
    return null;
  }
  return {
    id: value.id,
    title: readText(value.title),
    url: readText(value.url).trim(),
    favIconUrl: readText(value.favIconUrl),
    _xTabRankScore: readCount(value._xTabRankScore),
    _xTabSwitchCount30m: readCount(value._xTabSwitchCount30m),
    _xTabSwitchCount24h: readCount(value._xTabSwitchCount24h),
    _xTabDebugEventTotal: readCount(value._xTabDebugEventTotal),
    _xTabLastAccessedRaw: readCount(value._xTabLastAccessedRaw),
    _xTabSortAt: readCount(value._xTabSortAt),
    _xTabRankHighFreq: value._xTabRankHighFreq === true,
    _xTabRankHint: readText(value._xTabRankHint),
    _xTabFetchSeq: readCount(value._xTabFetchSeq)
  };
}

function readOverlayTabs(value: unknown): OverlayTab[] {
  return Array.isArray(value)
    ? value.map(readOverlayTab).filter((tab): tab is OverlayTab => tab !== null)
    : [];
}

export { readOverlayOpenOptions, readOverlayTabs };
export type { OverlayOpenOptions };
