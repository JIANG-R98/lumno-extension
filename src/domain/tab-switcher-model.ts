// The recent-tab switcher's rules apart from the browser: which tab it opens
// on, how a page answers the worker's requests, how its thumbnails are kept,
// and the site whose colors a tab's card takes.
import { normalizeFaviconHost } from './favicon/favicon-utils';
import type { TabSwitcherItem, TabSwitcherThumbnailStatus } from './messages';

// 1 moves to older tabs, -1 back toward newer ones.
type SwitcherOffset = 1 | -1;

// Whether the page holds an open switcher, as it reported.
interface OpenSwitcherState {
  ok: boolean;
  open: boolean;
}

// What decides whether a stored thumbnail needs writing again.
interface ThumbnailPersistFields {
  updatedAt?: unknown;
  capturedAt?: unknown;
  status?: unknown;
  url?: unknown;
  reason?: unknown;
  dataUrl?: unknown;
}

// Each tab's thumbnail is its own session storage entry under this prefix.
const TAB_SWITCHER_THUMBNAIL_KEY_PREFIX = '_x_extension_tab_switcher_thumbnail_2026_unique_:';

// Second-level domains under which a registrable domain takes three labels.
const MULTIPART_SUFFIXES: ReadonlySet<string> = new Set([
  'co.uk', 'com.au', 'com.br', 'com.cn', 'com.hk', 'com.sg',
  'co.jp', 'co.kr', 'co.nz', 'com.tw', 'org.uk', 'net.au'
]);

// Hosts of one site that are themed as its main domain.
const SHARED_THEME_HOSTS: ReadonlyMap<string, string> = new Map([
  ['app.dodopayments.com', 'dodopayments.com'],
  ['customer.dodopayments.com', 'dodopayments.com'],
  ['checkout.dodopayments.com', 'dodopayments.com']
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// The entry selected when the switcher opens. Forward it is the tab used
// before the current one; reverse, the oldest, wrapping back from the
// current tab.
function getDefaultSwitcherSelectedIndex(
  items: readonly TabSwitcherItem[],
  currentTabId: number | undefined,
  offset: SwitcherOffset
): number {
  if (items.length <= 1 || typeof currentTabId !== 'number') {
    return 0;
  }
  const currentIndex = items.findIndex((item) => item.id === currentTabId);
  if (offset < 0) {
    return currentIndex >= 0 ? (currentIndex - 1 + items.length) % items.length : items.length - 1;
  }
  if (currentIndex === 0) {
    return 1;
  }
  return currentIndex > 0 ? currentIndex : 0;
}

function readTabSwitcherThumbnailStatus(value: unknown): TabSwitcherThumbnailStatus {
  return value === 'ok' || value === 'pending' || value === 'missing' || value === 'stale' ||
    value === 'failed' || value === 'restricted' ? value : '';
}

function getFailedOpenTabSwitcherState(): OpenSwitcherState {
  return { ok: false, open: false };
}

// A page's reply to a message: true when it did what was asked, null when
// the reply says nothing usable.
function normalizeTabSwitcherHostOkResponse(response: unknown): boolean | null {
  return isRecord(response) && response.ok === true ? true : null;
}

// Whether the release committed the switch.
function normalizeTabSwitcherCommitResponse(response: unknown): boolean | null {
  if (!isRecord(response) || response.ok !== true || typeof response.committed !== 'boolean') {
    return null;
  }
  return response.committed;
}

function normalizeOpenTabSwitcherStateResponse(response: unknown): OpenSwitcherState | null {
  if (!isRecord(response) || response.ok !== true || typeof response.open !== 'boolean') {
    return null;
  }
  return { ok: true, open: response.open };
}

// The results of the page script in each frame, as the page produced them.
function readScriptResults(results: unknown): Record<string, unknown>[] {
  const items: unknown[] = Array.isArray(results) ? results : [];
  return items.flatMap((item) => (isRecord(item) && isRecord(item.result) ? [item.result] : []));
}

function normalizeTabSwitcherHostOkScriptResults(results: unknown): boolean | null {
  return readScriptResults(results).some((result) => result.ok === true) ? true : null;
}

function normalizeTabSwitcherCommitScriptResults(results: unknown): boolean | null {
  const result = readScriptResults(results).find((item) => item.ok === true && typeof item.committed === 'boolean');
  return result ? result.committed === true : null;
}

function normalizeOpenTabSwitcherStateScriptResults(results: unknown): OpenSwitcherState | null {
  const result = readScriptResults(results).find((item) => item.ok === true && typeof item.open === 'boolean');
  return result ? { ok: true, open: result.open === true } : null;
}

function getTabSwitcherThumbnailStorageKey(tabId: unknown): string {
  return `${TAB_SWITCHER_THUMBNAIL_KEY_PREFIX}${tabId}`;
}

function getThumbnailPersistSignature(entry: ThumbnailPersistFields): string {
  return [
    entry.updatedAt,
    entry.capturedAt,
    entry.status,
    entry.url,
    entry.reason,
    typeof entry.dataUrl === 'string' ? entry.dataUrl.length : 0
  ].join('|');
}

function getTabSwitcherHeadSignature(head: { stack?: unknown; thumbnailTabIds?: unknown }): string {
  return JSON.stringify([head.stack, head.thumbnailTabIds]);
}

// Whether a tab's thumbnail should be taken again: none, an old or failed
// one, or an "ok" with no image. Restricted pages and captures underway wait.
function isSwitcherThumbnailRefreshNeeded(state: { status?: unknown; dataUrl?: unknown } | null | undefined): boolean {
  const status = String(state && state.status ? state.status : '').trim().toLowerCase();
  if (status === 'restricted' || status === 'pending') {
    return false;
  }
  if (status === 'missing' || status === 'stale' || status === 'failed') {
    return true;
  }
  if (status === 'ok') {
    return !(state && typeof state.dataUrl === 'string' && state.dataUrl.startsWith('data:image/'));
  }
  return !status;
}

// A capture the browser refuses for the page is "restricted" (the card
// shows its icon); anything else "failed" and may be tried again.
function getSwitcherThumbnailStatusForFailureReason(reason: string): 'restricted' | 'failed' {
  const text = String(reason || '').toLowerCase();
  const restrictedMarks = [
    'restricted', 'permission', 'not allowed', 'not permitted', 'cannot access',
    'chrome://', 'web store', 'unsupported-protocol', 'untracked-tab'
  ];
  return restrictedMarks.some((mark) => text.includes(mark)) ? 'restricted' : 'failed';
}

// The site a host belongs to: the registrable domain, or the host itself
// for local and IP addresses.
function getSwitcherRegistrableThemeHost(host: unknown): string {
  const normalizedHost = normalizeFaviconHost(host);
  if (!normalizedHost ||
      normalizedHost === 'localhost' ||
      normalizedHost.endsWith('.localhost') ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalizedHost) ||
      normalizedHost.includes(':')) {
    return normalizedHost;
  }
  const labels = normalizedHost.split('.').filter(Boolean);
  if (labels.length <= 2) {
    return normalizedHost;
  }
  const suffix = labels.slice(-2).join('.');
  const tailLength = MULTIPART_SUFFIXES.has(suffix) && labels.length >= 3 ? 3 : 2;
  return labels.slice(-tailLength).join('.');
}

// The hosts whose saved colors a tab's card may take, the site's first.
function getSwitcherThemeHostCandidates(host: unknown): string[] {
  const normalizedHost = normalizeFaviconHost(host);
  const candidates: string[] = [];
  const addCandidate = (candidate: unknown): void => {
    const normalized = normalizeFaviconHost(candidate);
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };
  addCandidate(getSwitcherRegistrableThemeHost(normalizedHost));
  addCandidate(SHARED_THEME_HOSTS.get(normalizedHost));
  addCandidate(normalizedHost);
  return candidates;
}

export {
  TAB_SWITCHER_THUMBNAIL_KEY_PREFIX,
  getDefaultSwitcherSelectedIndex,
  getFailedOpenTabSwitcherState,
  getSwitcherRegistrableThemeHost,
  getSwitcherThemeHostCandidates,
  getSwitcherThumbnailStatusForFailureReason,
  getTabSwitcherHeadSignature,
  getTabSwitcherThumbnailStorageKey,
  getThumbnailPersistSignature,
  isSwitcherThumbnailRefreshNeeded,
  normalizeOpenTabSwitcherStateResponse,
  normalizeOpenTabSwitcherStateScriptResults,
  normalizeTabSwitcherCommitResponse,
  normalizeTabSwitcherCommitScriptResults,
  normalizeTabSwitcherHostOkResponse,
  normalizeTabSwitcherHostOkScriptResults,
  readScriptResults,
  readTabSwitcherThumbnailStatus
};
export type { OpenSwitcherState, SwitcherOffset, ThumbnailPersistFields };
