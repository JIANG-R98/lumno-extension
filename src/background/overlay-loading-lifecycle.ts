// While a tab loads a new page under the open overlay, the background keeps
// a record of the overlay's input and decides from what the new page reports
// whether to restore the overlay there, keep waiting, or let the record go.
import type { OverlayLoadingSession } from '../domain/messages';

// A webNavigation event's fields.
interface NavigationDetails {
  tabId?: number;
  frameId?: number;
  url?: string;
}

// A top frame navigation the tab has not reported yet (tab.pendingUrl lags).
interface TopFrameNavigationState {
  tabId: number;
  url: string;
  startedAt: number;
  updatedAt: number;
}

// The fields of a tab the decisions read.
interface LoadingTabLike {
  id?: number;
  status?: string;
  url?: string;
  pendingUrl?: string;
}

interface OverlaySessionState extends OverlayLoadingSession {
  // Counts updates, so an older one never wins.
  revision: number;
  updatedAt: number;
}

interface OverlayLoadingRecord {
  tabId: number;
  // What opened the overlay (a command, the page hotkey, ...).
  source: string;
  // The document the overlay runs in, once known.
  documentId: string;
  session: OverlaySessionState | null;
  createdAt: number;
  updatedAt: number;
}

type LifecycleAction = 'none' | 'keep' | 'clear' | 'restore';

interface LifecycleDecision {
  action: LifecycleAction;
  record: OverlayLoadingRecord | null;
  reason: string;
}

// One frame's result of chrome.scripting.executeScript.
interface InjectionResult {
  frameId?: number;
  documentId?: string;
  result?: unknown;
}

interface ExpiryOptions {
  now?: number;
  ttlMs?: number;
}

interface RecoveryOptions extends ExpiryOptions {
  // The tab finished loading, and has stayed so long enough to trust it.
  complete?: boolean;
  stable?: boolean;
}

const DEFAULT_RECORD_TTL_MS = 5 * 60 * 1000;
const DEFAULT_NAVIGATION_STATE_TTL_MS = 5 * 60 * 1000;
const MAX_INPUT_VALUE_LENGTH = 64 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function createTopFrameNavigationState(details: NavigationDetails | null | undefined, now?: number): TopFrameNavigationState | null {
  const input = details && typeof details === 'object' ? details : {};
  if (typeof input.tabId !== 'number' || input.tabId < 0 || input.frameId !== 0) {
    return null;
  }
  const createdAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return {
    tabId: input.tabId,
    url: typeof input.url === 'string' ? input.url.trim() : '',
    startedAt: createdAt,
    updatedAt: createdAt
  };
}

function updateTopFrameNavigationState(
  record: TopFrameNavigationState | null | undefined,
  details: NavigationDetails | null | undefined,
  now?: number
): TopFrameNavigationState | null {
  const input = details && typeof details === 'object' ? details : {};
  if (!record || typeof record.tabId !== 'number' || input.frameId !== 0 ||
      (typeof input.tabId === 'number' && input.tabId !== record.tabId)) {
    return null;
  }
  const updatedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const nextUrl = typeof input.url === 'string' && input.url.trim()
    ? input.url.trim()
    : String(record.url || '');
  return {
    ...record,
    url: nextUrl,
    updatedAt
  };
}

function isNavigationStateExpired(state: TopFrameNavigationState | null | undefined, now?: number, ttlMs?: number): boolean {
  if (!state || typeof state.tabId !== 'number') {
    return true;
  }
  const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const maxAge = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
    ? Number(ttlMs)
    : DEFAULT_NAVIGATION_STATE_TTL_MS;
  return currentTime - Number(state.updatedAt || state.startedAt || 0) > maxAge;
}

// The tab as loading its pending page when the navigation is known but
// the tab does not show it yet.
function applyTopFrameNavigationState<T extends LoadingTabLike>(
  tab: T,
  state: TopFrameNavigationState | null | undefined,
  options?: ExpiryOptions | null
): T {
  if (!tab || typeof tab.id !== 'number' || !state || state.tabId !== tab.id) {
    return tab;
  }
  const settings = options && typeof options === 'object' ? options : {};
  if (isNavigationStateExpired(state, settings.now, settings.ttlMs)) {
    return tab;
  }
  const reportedPendingUrl = typeof tab.pendingUrl === 'string'
    ? tab.pendingUrl.trim()
    : '';
  return {
    ...tab,
    status: 'loading',
    pendingUrl: reportedPendingUrl || String(state.url || '')
  };
}

function isLoadingTab(tab: LoadingTabLike | null | undefined): tab is LoadingTabLike & { id: number } {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  return tab.status === 'loading' || Boolean(
    typeof tab.pendingUrl === 'string' && tab.pendingUrl.trim()
  );
}

function getPendingInjectableUrl(tab: LoadingTabLike | null | undefined, canInjectUrl: ((url: string) => boolean) | null | undefined): string {
  if (!isLoadingTab(tab) || typeof canInjectUrl !== 'function') {
    return '';
  }
  const currentUrl = typeof tab.url === 'string' ? tab.url.trim() : '';
  const pendingUrl = typeof tab.pendingUrl === 'string' ? tab.pendingUrl.trim() : '';
  if (!pendingUrl || canInjectUrl(currentUrl) || !canInjectUrl(pendingUrl)) {
    return '';
  }
  return pendingUrl;
}

function shouldDeferRestrictedLoadingTab(tab: LoadingTabLike | null | undefined, canInjectUrl: ((url: string) => boolean) | null | undefined): boolean {
  if (!isLoadingTab(tab) || typeof canInjectUrl !== 'function') {
    return false;
  }
  const currentUrl = typeof tab.url === 'string' ? tab.url.trim() : '';
  if (canInjectUrl(currentUrl)) {
    return false;
  }
  const pendingUrl = typeof tab.pendingUrl === 'string' ? tab.pendingUrl.trim() : '';
  return !pendingUrl || canInjectUrl(pendingUrl);
}

function createRecord(tab: LoadingTabLike | null | undefined, source: unknown, now?: number): OverlayLoadingRecord | null {
  if (!isLoadingTab(tab)) {
    return null;
  }
  const createdAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return {
    tabId: tab.id,
    source: String(source || ''),
    documentId: '',
    session: null,
    createdAt,
    updatedAt: createdAt
  };
}

function clampSelectionOffset(value: unknown, inputLength: number, fallback: number): number {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
  return Math.max(0, Math.min(inputLength, resolved));
}

// The overlay's input as the page last reported it; missing fields keep
// their previous values.
type SessionSelection = Pick<OverlaySessionState, 'selectionStart' | 'selectionEnd' | 'selectionDirection'>;

// The selection the overlay reported, kept within the text; offsets it left
// out stay where they were.
function readSelection(
  input: Record<string, unknown>,
  previous: OverlaySessionState | null,
  inputLength: number
): SessionSelection {
  const previousStart = previous && Number.isFinite(Number(previous.selectionStart))
    ? Number(previous.selectionStart)
    : inputLength;
  const selectionStart = clampSelectionOffset(
    input.selectionStart,
    inputLength,
    Math.min(previousStart, inputLength)
  );
  const previousEnd = previous && Number.isFinite(Number(previous.selectionEnd))
    ? Number(previous.selectionEnd)
    : selectionStart;
  const selectionEnd = Math.max(selectionStart, clampSelectionOffset(
    input.selectionEnd,
    inputLength,
    Math.min(previousEnd, inputLength)
  ));
  const selectionDirection = input.selectionDirection === 'backward' || input.selectionDirection === 'forward'
    ? input.selectionDirection
    : 'none';
  return { selectionStart, selectionEnd, selectionDirection };
}

function normalizeSessionState(value: unknown, previousSession: OverlaySessionState | null | undefined, now?: number): OverlaySessionState {
  const input = isRecord(value) ? value : {};
  const previous = previousSession && typeof previousSession === 'object'
    ? previousSession
    : null;
  const rawInputValue = typeof input.inputValue === 'string'
    ? input.inputValue
    : (previous && typeof previous.inputValue === 'string' ? previous.inputValue : '');
  const inputValue = rawInputValue.slice(0, MAX_INPUT_VALUE_LENGTH);
  const inputLength = inputValue.length;
  const { selectionStart, selectionEnd, selectionDirection } = readSelection(input, previous, inputLength);
  const updatedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return {
    inputValue,
    selectionStart,
    selectionEnd,
    selectionDirection,
    focused: input.focused !== false,
    revision: Math.max(0, Number(previous && previous.revision) || 0) + 1,
    updatedAt
  };
}

function applySessionUpdate(
  record: OverlayLoadingRecord | null | undefined,
  value: unknown,
  options?: { documentId?: string; now?: number } | null
): LifecycleDecision {
  if (!record) {
    return { action: 'none', record: null, reason: 'not-tracked' };
  }
  const settings = options && typeof options === 'object' ? options : {};
  const senderDocumentId = typeof settings.documentId === 'string'
    ? settings.documentId
    : '';
  const trackedDocumentId = String(record.documentId || '');
  if (senderDocumentId && trackedDocumentId && senderDocumentId !== trackedDocumentId) {
    return { action: 'keep', record, reason: 'stale-document' };
  }
  const updatedAt = Number.isFinite(Number(settings.now))
    ? Number(settings.now)
    : Date.now();
  return {
    action: 'keep',
    record: {
      ...record,
      documentId: trackedDocumentId || senderDocumentId,
      session: normalizeSessionState(value, record.session, updatedAt),
      updatedAt
    },
    reason: 'session-updated'
  };
}

function getMainFrameResult(results: readonly (InjectionResult | null | undefined)[] | null | undefined): InjectionResult | null {
  const list = (Array.isArray(results) ? results : []).filter((item): item is InjectionResult => Boolean(item));
  return list.find((item) => item.frameId === 0) || list[0] || null;
}

function withResultDocument(record: OverlayLoadingRecord | null, result: InjectionResult | null, now?: number): OverlayLoadingRecord | null {
  if (!record) {
    return null;
  }
  const nextDocumentId = result && typeof result.documentId === 'string'
    ? result.documentId
    : '';
  const updatedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return {
    ...record,
    documentId: nextDocumentId || record.documentId || '',
    updatedAt
  };
}

// What opening the overlay in the loading tab reported.
function applyInvocationResult(
  record: OverlayLoadingRecord | null | undefined,
  results: readonly (InjectionResult | null | undefined)[] | null | undefined,
  now?: number
): LifecycleDecision {
  if (!record) {
    return { action: 'none', record: null, reason: 'not-tracked' };
  }
  const mainResult = getMainFrameResult(results);
  const payload = mainResult && isRecord(mainResult.result) ? mainResult.result : null;
  if (!payload || payload.ok !== true) {
    return { action: 'keep', record, reason: 'invocation-unconfirmed' };
  }
  if (payload.overlayOpen !== true) {
    return { action: 'clear', record: null, reason: 'overlay-closed' };
  }
  return {
    action: 'keep',
    record: withResultDocument(record, mainResult, now),
    reason: 'overlay-open'
  };
}

function isExpired(record: OverlayLoadingRecord | null | undefined, now?: number, ttlMs?: number): boolean {
  if (!record) {
    return true;
  }
  const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const maxAge = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
    ? Number(ttlMs)
    : DEFAULT_RECORD_TTL_MS;
  return currentTime - Number(record.createdAt || 0) > maxAge;
}

// What to do with a record once the tab's page reports in: restore the
// overlay, keep waiting, or let the record go.
// The overlay is still there: keep tracking until the page has settled.
function decideConnected(nextRecord: OverlayLoadingRecord | null, settings: RecoveryOptions): LifecycleDecision {
  if (settings.complete === true && settings.stable === true) {
    return { action: 'clear', record: null, reason: 'stable-complete-and-connected' };
  }
  return {
    action: 'keep',
    record: nextRecord,
    reason: settings.complete === true ? 'complete-awaiting-stability' : 'connected'
  };
}

function hasDocumentChanged(record: OverlayLoadingRecord, mainResult: InjectionResult): boolean {
  const previousDocumentId = String(record.documentId || '');
  const currentDocumentId = String(mainResult.documentId || '');
  return Boolean(previousDocumentId && currentDocumentId) && previousDocumentId !== currentDocumentId;
}

function decideRecovery(
  record: OverlayLoadingRecord | null | undefined,
  results: readonly (InjectionResult | null | undefined)[] | null | undefined,
  options?: RecoveryOptions | null
): LifecycleDecision {
  const settings = options && typeof options === 'object' ? options : {};
  const now = Number.isFinite(Number(settings.now)) ? Number(settings.now) : Date.now();
  if (!record) {
    return { action: 'none', record: null, reason: 'not-tracked' };
  }
  if (isExpired(record, now, settings.ttlMs)) {
    return { action: 'clear', record: null, reason: 'expired' };
  }
  const mainResult = getMainFrameResult(results);
  const payload = mainResult && isRecord(mainResult.result) ? mainResult.result : null;
  if (!mainResult || !payload) {
    return { action: 'restore', record, reason: 'probe-unavailable' };
  }
  const nextRecord = withResultDocument(record, mainResult, now);
  if (payload.overlayConnected === true) {
    return decideConnected(nextRecord, settings);
  }
  const documentChanged = hasDocumentChanged(record, mainResult);
  if (payload.runtimeReady === true && payload.overlayOpenState === 'closed' && !documentChanged) {
    return { action: 'clear', record: null, reason: 'closed-in-same-document' };
  }
  return {
    action: 'restore',
    record: nextRecord,
    reason: documentChanged ? 'document-changed' : 'overlay-host-lost'
  };
}

export {
  DEFAULT_NAVIGATION_STATE_TTL_MS,
  DEFAULT_RECORD_TTL_MS,
  applyTopFrameNavigationState,
  applyInvocationResult,
  applySessionUpdate,
  createTopFrameNavigationState,
  createRecord,
  decideRecovery,
  getMainFrameResult,
  getPendingInjectableUrl,
  isExpired,
  isLoadingTab,
  isNavigationStateExpired,
  normalizeSessionState,
  shouldDeferRestrictedLoadingTab,
  updateTopFrameNavigationState
};
export type {
  InjectionResult,
  LifecycleAction,
  LifecycleDecision,
  LoadingTabLike,
  NavigationDetails,
  OverlayLoadingRecord,
  OverlaySessionState,
  RecoveryOptions,
  TopFrameNavigationState
};
