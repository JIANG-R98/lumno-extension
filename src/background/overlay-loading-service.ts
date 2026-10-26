// Keeps the search overlay alive across page loads: per-tab navigation state
// and loading records (in session storage, so a suspended worker can resume
// them), and the retries that reopen the overlay once a navigating tab settles.
//
// A module of the service worker; background.ts imports it before its own code
// runs. It uses other services' bindings only when its functions run, never
// while this file loads, because the services import one another.

import * as OVERLAY_LOADING_LIFECYCLE from './overlay-loading-lifecycle';
import { ignoreExpectedChromeError, logHotkeyDebug } from './worker-context';
import { canOpenOverlayOnUrl, getResolvedTabUrl } from './browser-urls-service';
import {
  OVERLAY_HOST_ID,
  openOverlayOnTab
} from './overlay-open-service';
import type { OpenOverlayOptions, TargetTab } from './overlay-open-service';
import type { NavigationDetails, OverlayLoadingRecord, OverlaySessionState, TopFrameNavigationState } from './overlay-loading-lifecycle';
import type { IncomingRequest, MessageSender, RejectionReply } from './message-router';
import type { BackgroundReply } from '../domain/messages';

// A loading record with the retry and stability bookkeeping this service
// adds to it.
interface TrackedLoadingRecord extends OverlayLoadingRecord {
  // Counts settled loads; a stability check only acts on its own count.
  stableCompletionToken?: number;
  stableCompletionStartedAt?: number;
  stableCompletionUrl?: string;
  recoveryAttempts?: number;
  preCompleteRetryUrl?: string;
  preCompleteRecoveryAttempts?: number;
  // The overlay was asked for while the tab was still leaving a page it
  // cannot open on.
  pendingNavigationDeferred?: boolean;
  pendingNavigationUrl?: string;
}

// A tab update the recovery acts on: the browser's, or one this service
// makes up after a settle delay or a document start.
interface LoadingChangeInfo {
  status?: string;
  url?: string;
  stable?: boolean;
  stableCompletionToken?: number;
  documentStarted?: boolean;
}

interface PendingLoadingUpdate {
  changeInfo: LoadingChangeInfo;
  tab: TargetTab | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readStoredSession(value: unknown): OverlaySessionState | null {
  if (!isRecord(value) || typeof value.inputValue !== 'string' || typeof value.selectionStart !== 'number' ||
      typeof value.selectionEnd !== 'number' || typeof value.focused !== 'boolean' ||
      typeof value.revision !== 'number' || typeof value.updatedAt !== 'number') {
    return null;
  }
  const direction = value.selectionDirection;
  return {
    inputValue: value.inputValue,
    selectionStart: value.selectionStart,
    selectionEnd: value.selectionEnd,
    selectionDirection: direction === 'forward' || direction === 'backward' ? direction : 'none',
    focused: value.focused,
    revision: value.revision,
    updatedAt: value.updatedAt
  };
}

// A record this service saved to session storage, rebuilt from its fields.
function readStoredLoadingRecord(value: unknown, tabId: number): TrackedLoadingRecord | null {
  if (!isRecord(value) || value.tabId !== tabId) {
    return null;
  }
  const record: TrackedLoadingRecord = {
    tabId,
    source: String(value.source || ''),
    documentId: typeof value.documentId === 'string' ? value.documentId : '',
    session: readStoredSession(value.session),
    createdAt: Number(value.createdAt) || 0,
    updatedAt: Number(value.updatedAt) || 0
  };
  if (typeof value.stableCompletionToken === 'number') record.stableCompletionToken = value.stableCompletionToken;
  if (typeof value.stableCompletionStartedAt === 'number') record.stableCompletionStartedAt = value.stableCompletionStartedAt;
  if (typeof value.stableCompletionUrl === 'string') record.stableCompletionUrl = value.stableCompletionUrl;
  if (typeof value.recoveryAttempts === 'number') record.recoveryAttempts = value.recoveryAttempts;
  if (typeof value.preCompleteRetryUrl === 'string') record.preCompleteRetryUrl = value.preCompleteRetryUrl;
  if (typeof value.preCompleteRecoveryAttempts === 'number') record.preCompleteRecoveryAttempts = value.preCompleteRecoveryAttempts;
  if (typeof value.pendingNavigationDeferred === 'boolean') record.pendingNavigationDeferred = value.pendingNavigationDeferred;
  if (typeof value.pendingNavigationUrl === 'string') record.pendingNavigationUrl = value.pendingNavigationUrl;
  return record;
}

function readStoredNavigationState(value: unknown, tabId: number): TopFrameNavigationState | null {
  if (!isRecord(value) || value.tabId !== tabId) {
    return null;
  }
  return {
    tabId,
    url: String(value.url || ''),
    startedAt: Number(value.startedAt) || 0,
    updatedAt: Number(value.updatedAt) || 0
  };
}

const OVERLAY_NAVIGATION_STATE_STORAGE_PREFIX =
  '_x_extension_overlay_navigation_state_2026_unique_:';
export const OVERLAY_NAVIGATION_STATE_TTL_MS = Number(
  OVERLAY_LOADING_LIFECYCLE.DEFAULT_NAVIGATION_STATE_TTL_MS
) || (5 * 60 * 1000);
const OVERLAY_LOADING_RECORD_STORAGE_PREFIX =
  '_x_extension_overlay_loading_record_2026_unique_:';
const OVERLAY_LOADING_RECORD_TTL_MS = Number(
  OVERLAY_LOADING_LIFECYCLE.DEFAULT_RECORD_TTL_MS
) || (5 * 60 * 1000);
const OVERLAY_LOADING_RECOVERY_MAX_ATTEMPTS = 3;
const OVERLAY_LOADING_RECOVERY_RETRY_MS = 120;
const OVERLAY_LOADING_PRE_COMPLETE_RETRY_MAX_ATTEMPTS = 3;
const OVERLAY_LOADING_PRE_COMPLETE_RETRY_MS = 120;
const OVERLAY_LOADING_STABLE_COMPLETE_MS = 1500;
const overlayLoadingRecoveryInFlightByTabId = new Set<number>();
const overlayLoadingPendingUpdateByTabId = new Map<number, PendingLoadingUpdate>();
// Write-through caches of chrome.storage.session records, re-read on a miss.
export const overlayNavigationStateByTabId = new Map<number, TopFrameNavigationState>();
export const overlayLoadingRecordsByTabId = new Map<number, TrackedLoadingRecord>();

function getOverlayLoadingRecordStorageArea(): chrome.storage.SessionStorageArea | null {
  return chrome && chrome.storage && chrome.storage.session &&
    typeof chrome.storage.session.get === 'function'
    ? chrome.storage.session
    : null;
}

function getOverlayNavigationStateStorageKey(tabId: number): string {
  return `${OVERLAY_NAVIGATION_STATE_STORAGE_PREFIX}${tabId}`;
}

function setOverlayNavigationState(state: TopFrameNavigationState): void {
  if (!state || typeof state.tabId !== 'number') {
    return;
  }
  overlayNavigationStateByTabId.set(state.tabId, state);
  const sessionArea = getOverlayLoadingRecordStorageArea();
  if (!sessionArea || typeof sessionArea.set !== 'function') {
    return;
  }
  try {
    sessionArea.set({
      [getOverlayNavigationStateStorageKey(state.tabId)]: state
    }, ignoreExpectedChromeError);
  } catch (_error) {
    // The in-memory state still covers the current service-worker lifetime.
  }
}

export function clearOverlayNavigationState(tabId: unknown): void {
  if (typeof tabId !== 'number') {
    return;
  }
  overlayNavigationStateByTabId.delete(tabId);
  const sessionArea = getOverlayLoadingRecordStorageArea();
  if (!sessionArea || typeof sessionArea.remove !== 'function') {
    return;
  }
  try {
    sessionArea.remove(getOverlayNavigationStateStorageKey(tabId), ignoreExpectedChromeError);
  } catch (_error) {
    // Ignore session-storage cleanup failures.
  }
}

export function getOverlayNavigationState(tabId: unknown, callback?: (state: TopFrameNavigationState | null) => void): void {
  const done = typeof callback === 'function' ? callback : () => {};
  if (typeof tabId !== 'number') {
    done(null);
    return;
  }
  const isExpired = (state: TopFrameNavigationState): boolean => OVERLAY_LOADING_LIFECYCLE.isNavigationStateExpired(
      state,
      Date.now(),
      OVERLAY_NAVIGATION_STATE_TTL_MS
    );
  const cached = overlayNavigationStateByTabId.get(tabId) || null;
  if (cached) {
    if (isExpired(cached)) {
      clearOverlayNavigationState(tabId);
      done(null);
      return;
    }
    done(cached);
    return;
  }
  const sessionArea = getOverlayLoadingRecordStorageArea();
  if (!sessionArea) {
    done(null);
    return;
  }
  const storageKey = getOverlayNavigationStateStorageKey(tabId);
  try {
    sessionArea.get(storageKey, (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        done(null);
        return;
      }
      const storedValue = result ? result[storageKey] : null;
      const stored = readStoredNavigationState(storedValue, tabId);
      if (!stored || isExpired(stored)) {
        if (isRecord(storedValue)) {
          clearOverlayNavigationState(tabId);
        }
        done(null);
        return;
      }
      overlayNavigationStateByTabId.set(tabId, stored);
      done(stored);
    });
  } catch (_error) {
    done(null);
  }
}

export function rememberOverlayTopFrameNavigation(details: NavigationDetails | null | undefined): void {
  const state = OVERLAY_LOADING_LIFECYCLE.createTopFrameNavigationState(details, Date.now());
  if (state) {
    setOverlayNavigationState(state);
  }
}

export function updateOverlayTopFrameNavigation(details: NavigationDetails | null | undefined): void {
  if (!details || typeof details.tabId !== 'number' || details.frameId !== 0) {
    return;
  }
  const navigationDetails = details;
  getOverlayNavigationState(details.tabId, (state) => {
    if (!state) {
      return;
    }
    const nextState = OVERLAY_LOADING_LIFECYCLE.updateTopFrameNavigationState(
      state,
      navigationDetails,
      Date.now()
    );
    if (nextState) {
      setOverlayNavigationState(nextState);
    }
  });
}

function getOverlayLoadingRecordStorageKey(tabId: number): string {
  return `${OVERLAY_LOADING_RECORD_STORAGE_PREFIX}${tabId}`;
}

function setOverlayLoadingRecord(record: TrackedLoadingRecord): void {
  if (!record || typeof record.tabId !== 'number') {
    return;
  }
  const currentRecord = overlayLoadingRecordsByTabId.get(record.tabId) || null;
  const currentSession = currentRecord && currentRecord.session &&
    typeof currentRecord.session === 'object'
    ? currentRecord.session
    : null;
  const incomingSession = record.session && typeof record.session === 'object'
    ? record.session
    : null;
  const shouldPreserveCurrentSession = Boolean(
    currentSession &&
    (!incomingSession ||
      Number(currentSession.revision || 0) > Number(incomingSession.revision || 0) ||
      (Number(currentSession.revision || 0) === Number(incomingSession.revision || 0) &&
        Number(currentSession.updatedAt || 0) > Number(incomingSession.updatedAt || 0)))
  );
  const currentStableCompletionToken = Math.max(
    0,
    Number(currentRecord && currentRecord.stableCompletionToken) || 0
  );
  const incomingStableCompletionToken = Math.max(
    0,
    Number(record.stableCompletionToken) || 0
  );
  const shouldPreserveCurrentStability = Boolean(
    currentRecord && currentStableCompletionToken >= incomingStableCompletionToken
  );
  const nextRecord: TrackedLoadingRecord = {
    ...record,
    session: shouldPreserveCurrentSession ? currentSession : incomingSession,
    stableCompletionToken: shouldPreserveCurrentStability
      ? currentStableCompletionToken
      : incomingStableCompletionToken,
    stableCompletionStartedAt: shouldPreserveCurrentStability && currentRecord
      ? Number(currentRecord.stableCompletionStartedAt) || 0
      : Number(record.stableCompletionStartedAt) || 0,
    stableCompletionUrl: shouldPreserveCurrentStability && currentRecord
      ? String(currentRecord.stableCompletionUrl || '')
      : String(record.stableCompletionUrl || '')
  };
  overlayLoadingRecordsByTabId.set(record.tabId, nextRecord);
  const sessionArea = getOverlayLoadingRecordStorageArea();
  if (!sessionArea || typeof sessionArea.set !== 'function') {
    return;
  }
  try {
    sessionArea.set({
      [getOverlayLoadingRecordStorageKey(record.tabId)]: nextRecord
    }, ignoreExpectedChromeError);
  } catch (_error) {
    // The in-memory record still covers ordinary loading lifetimes.
  }
}

export function clearOverlayLoadingRecord(tabId: unknown): void {
  if (typeof tabId !== 'number') {
    return;
  }
  overlayLoadingRecordsByTabId.delete(tabId);
  overlayLoadingRecoveryInFlightByTabId.delete(tabId);
  overlayLoadingPendingUpdateByTabId.delete(tabId);
  const sessionArea = getOverlayLoadingRecordStorageArea();
  if (!sessionArea || typeof sessionArea.remove !== 'function') {
    return;
  }
  try {
    sessionArea.remove(getOverlayLoadingRecordStorageKey(tabId), ignoreExpectedChromeError);
  } catch (_error) {
    // Ignore session-storage cleanup failures.
  }
}

function getOverlayLoadingRecord(tabId: unknown, callback?: (record: TrackedLoadingRecord | null) => void): void {
  const done = typeof callback === 'function' ? callback : () => {};
  if (typeof tabId !== 'number') {
    done(null);
    return;
  }
  const cached = overlayLoadingRecordsByTabId.get(tabId) || null;
  if (cached) {
    if (OVERLAY_LOADING_LIFECYCLE.isExpired(
          cached,
          Date.now(),
          OVERLAY_LOADING_RECORD_TTL_MS
        )) {
      clearOverlayLoadingRecord(tabId);
      done(null);
      return;
    }
    done(cached);
    return;
  }
  const sessionArea = getOverlayLoadingRecordStorageArea();
  if (!sessionArea) {
    done(null);
    return;
  }
  const storageKey = getOverlayLoadingRecordStorageKey(tabId);
  try {
    sessionArea.get(storageKey, (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        done(null);
        return;
      }
      const storedValue = result ? result[storageKey] : null;
      const stored = readStoredLoadingRecord(storedValue, tabId);
      if (!stored ||
          (OVERLAY_LOADING_LIFECYCLE.isExpired(
              stored,
              Date.now(),
              OVERLAY_LOADING_RECORD_TTL_MS
            ))) {
        if (isRecord(storedValue)) {
          clearOverlayLoadingRecord(tabId);
        }
        done(null);
        return;
      }
      overlayLoadingRecordsByTabId.set(tabId, stored);
      done(stored);
    });
  } catch (_error) {
    done(null);
  }
}

export function rememberOverlayLoadingRecord(
  activeTab: TargetTab & { id: number },
  source: string,
  options?: OpenOverlayOptions | null
): TrackedLoadingRecord | null {
  const settings: OpenOverlayOptions = options && typeof options === 'object' ? options : {};
  if (settings.loadingRecovery === true) {
    return settings.loadingRecord || overlayLoadingRecordsByTabId.get(activeTab.id) || null;
  }
  const record = OVERLAY_LOADING_LIFECYCLE.createRecord(activeTab, source, Date.now());
  if (!record) {
    clearOverlayLoadingRecord(activeTab.id);
    return null;
  }
  setOverlayLoadingRecord(record);
  overlayLoadingRecoveryInFlightByTabId.add(activeTab.id);
  return record;
}

export function getPendingOverlayNavigationUrl(tab: TargetTab | null | undefined): string {
  return OVERLAY_LOADING_LIFECYCLE.getPendingInjectableUrl(
    tab,
    canOpenOverlayOnUrl
  );
}

export function shouldDeferRestrictedOverlayNavigation(tab: TargetTab | null | undefined): boolean {
  return OVERLAY_LOADING_LIFECYCLE.shouldDeferRestrictedLoadingTab(
    tab,
    canOpenOverlayOnUrl
  );
}

export function rememberOverlayPendingNavigationIntent(
  activeTab: TargetTab | null | undefined,
  source: string,
  pendingUrl: unknown
): TrackedLoadingRecord | null {
  if (!activeTab || typeof activeTab.id !== 'number') {
    return null;
  }
  const record = OVERLAY_LOADING_LIFECYCLE.createRecord(activeTab, source, Date.now());
  if (!record) {
    return null;
  }
  const currentRecord = overlayLoadingRecordsByTabId.get(activeTab.id) || null;
  const nextRecord: TrackedLoadingRecord = {
    ...record,
    documentId: currentRecord && currentRecord.documentId
      ? currentRecord.documentId
      : record.documentId,
    session: currentRecord && currentRecord.session
      ? currentRecord.session
      : record.session,
    pendingNavigationDeferred: true,
    pendingNavigationUrl: typeof pendingUrl === 'string' ? pendingUrl : ''
  };
  setOverlayLoadingRecord(nextRecord);
  logHotkeyDebug('overlay-deferred-for-pending-navigation', {
    tabId: activeTab.id,
    currentUrl: typeof activeTab.url === 'string' ? activeTab.url : '',
    pendingUrl: typeof pendingUrl === 'string' ? pendingUrl : '',
    source: source || ''
  });
  return nextRecord;
}

function queueOverlayLoadingUpdate(tabId: number, changeInfo: LoadingChangeInfo | null | undefined, tab: TargetTab | null | undefined): void {
  const current = overlayLoadingPendingUpdateByTabId.get(tabId) || null;
  const incomingComplete = Boolean(changeInfo && changeInfo.status === 'complete');
  const incomingDocumentStarted = Boolean(changeInfo && changeInfo.documentStarted === true);
  const currentComplete = Boolean(current && current.changeInfo &&
    current.changeInfo.status === 'complete');
  if (currentComplete && !incomingComplete && !incomingDocumentStarted) {
    return;
  }
  overlayLoadingPendingUpdateByTabId.set(tabId, {
    changeInfo: { ...(changeInfo || {}) },
    tab: tab ? { ...tab } : null
  });
}

export function finishOverlayLoadingOpenAttempt(tabId: number): void {
  if (typeof tabId !== 'number' ||
      !overlayLoadingRecoveryInFlightByTabId.has(tabId)) {
    return;
  }
  overlayLoadingRecoveryInFlightByTabId.delete(tabId);
  const pendingUpdate = overlayLoadingPendingUpdateByTabId.get(tabId) || null;
  overlayLoadingPendingUpdateByTabId.delete(tabId);
  if (!pendingUpdate) {
    return;
  }
  setTimeout(() => {
    recoverOverlayAfterLoadingUpdate(
      tabId,
      pendingUpdate.changeInfo,
      pendingUpdate.tab
    );
  }, 0);
}

export function markOverlayLoadingRecordUnstable(tabId: unknown, callback?: (record: TrackedLoadingRecord | null) => void): void {
  const done = typeof callback === 'function' ? callback : () => {};
  getOverlayLoadingRecord(tabId, (record) => {
    if (!record) {
      done(null);
      return;
    }
    const nextRecord: TrackedLoadingRecord = {
      ...record,
      stableCompletionToken: Math.max(0, Number(record.stableCompletionToken) || 0) + 1,
      stableCompletionStartedAt: 0,
      stableCompletionUrl: '',
      updatedAt: Date.now()
    };
    setOverlayLoadingRecord(nextRecord);
    done(nextRecord);
  });
}

function scheduleOverlayLoadingStableCompletion(tab: TargetTab | null | undefined, record: TrackedLoadingRecord | null | undefined): void {
  if (!tab || typeof tab.id !== 'number' || !record) {
    return;
  }
  const tabId = tab.id;
  const currentRecord = overlayLoadingRecordsByTabId.get(tabId) || record;
  const stableCompletionToken = Math.max(
    0,
    Number(currentRecord.stableCompletionToken) || 0
  ) + 1;
  const stableCompletionUrl = getResolvedTabUrl(tab);
  const nextRecord: TrackedLoadingRecord = {
    ...currentRecord,
    stableCompletionToken,
    stableCompletionStartedAt: Date.now(),
    stableCompletionUrl,
    updatedAt: Date.now()
  };
  setOverlayLoadingRecord(nextRecord);
  setTimeout(() => {
    getOverlayLoadingRecord(tabId, (latestRecord) => {
      if (!latestRecord ||
          Number(latestRecord.stableCompletionToken) !== stableCompletionToken ||
          latestRecord.stableCompletionUrl !== stableCompletionUrl) {
        return;
      }
      const finalizeWithCurrentTab = (currentTab: TargetTab | null | undefined): void => {
        if (!currentTab || currentTab.status !== 'complete' ||
            getResolvedTabUrl(currentTab) !== stableCompletionUrl) {
          return;
        }
        recoverOverlayAfterLoadingUpdate(
          tabId,
          {
            status: 'complete',
            stable: true,
            stableCompletionToken
          },
          currentTab
        );
      };
      if (chrome.tabs && typeof chrome.tabs.get === 'function') {
        chrome.tabs.get(tabId, (currentTab) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            return;
          }
          finalizeWithCurrentTab(currentTab);
        });
        return;
      }
      finalizeWithCurrentTab(tab);
    });
  }, OVERLAY_LOADING_STABLE_COMPLETE_MS);
}

export function updateOverlayLoadingRecordFromInvocation(
  activeTab: TargetTab | null | undefined,
  results: Parameters<typeof OVERLAY_LOADING_LIFECYCLE.applyInvocationResult>[1]
): void {
  if (!activeTab || typeof activeTab.id !== 'number') {
    return;
  }
  const record = overlayLoadingRecordsByTabId.get(activeTab.id) || null;
  if (!record) {
    return;
  }
  const outcome = OVERLAY_LOADING_LIFECYCLE.applyInvocationResult(
    record,
    results,
    Date.now()
  );
  if (outcome.action === 'clear') {
    clearOverlayLoadingRecord(activeTab.id);
    return;
  }
  if (outcome.record) {
    setOverlayLoadingRecord(outcome.record);
  }
}

export function updateOverlayLoadingSessionFromMessage(
  request: IncomingRequest<'updateOverlayLoadingSession'>,
  sender: MessageSender,
  sendResponse: (reply: BackgroundReply<'updateOverlayLoadingSession'> | RejectionReply) => void
): void {
  const senderTab = sender && sender.tab ? sender.tab : null;
  if (!senderTab || typeof senderTab.id !== 'number' ||
      (typeof sender.frameId === 'number' && sender.frameId !== 0)) {
    sendResponse({ ok: false, tracked: false });
    return;
  }
  getOverlayLoadingRecord(senderTab.id, (record) => {
    if (!record) {
      sendResponse({ ok: true, tracked: false });
      return;
    }
    const outcome = OVERLAY_LOADING_LIFECYCLE.applySessionUpdate(
      record,
      request && request.session,
      {
        documentId: sender && typeof sender.documentId === 'string'
          ? sender.documentId
          : '',
        now: Date.now()
      }
    );
    if (!outcome.record) {
      sendResponse({ ok: true, tracked: false });
      return;
    }
    setOverlayLoadingRecord(outcome.record);
    sendResponse({
      ok: true,
      tracked: outcome.reason !== 'stale-document'
    });
  });
}

function probeOverlayLoadingState(
  tabId: number,
  callback: (results: Parameters<typeof OVERLAY_LOADING_LIFECYCLE.decideRecovery>[1]) => void
): void {
  chrome.scripting.executeScript({
    target: { tabId },
    injectImmediately: true,
    // Runs in the page on its own: reads the overlay's state from the content
    // registry (src/platform/content-registry.ts) without loading it.
    func: (hostId: string): unknown => {
      const registry: unknown = Reflect.get(globalThis, '__lumnoContent');
      const rawOpenState: unknown = registry && typeof registry === 'object'
        ? Reflect.get(registry, 'overlayOpen')
        : undefined;
      const host = document.getElementById(hostId);
      return {
        runtimeReady: typeof rawOpenState === 'boolean',
        overlayOpenState: rawOpenState === true
          ? 'open'
          : (rawOpenState === false ? 'closed' : 'unknown'),
        overlayConnected: Boolean(host && host.isConnected)
      };
    },
    args: [OVERLAY_HOST_ID]
  }, callback);
}

function scheduleOverlayLoadingRecoveryRetry(tab: TargetTab | null | undefined, record: TrackedLoadingRecord | null | undefined): void {
  if (!tab || typeof tab.id !== 'number' || !record) {
    return;
  }
  const tabId = tab.id;
  const recoveryAttempts = Math.max(0, Number(record.recoveryAttempts) || 0) + 1;
  if (recoveryAttempts > OVERLAY_LOADING_RECOVERY_MAX_ATTEMPTS) {
    clearOverlayLoadingRecord(tabId);
    return;
  }
  const nextRecord: TrackedLoadingRecord = {
    ...record,
    recoveryAttempts,
    updatedAt: Date.now()
  };
  setOverlayLoadingRecord(nextRecord);
  setTimeout(() => {
    recoverOverlayAfterLoadingUpdate(tabId, { status: 'complete' }, tab);
  }, OVERLAY_LOADING_RECOVERY_RETRY_MS * recoveryAttempts);
}

export function scheduleOverlayLoadingPreCompleteRetry(tab: TargetTab | null | undefined, record: TrackedLoadingRecord | null | undefined): void {
  if (!tab || typeof tab.id !== 'number' || !record) {
    return;
  }
  const tabId = tab.id;
  const committedUrl = getResolvedTabUrl(tab);
  if (!canOpenOverlayOnUrl(committedUrl)) {
    return;
  }
  const currentRecord = overlayLoadingRecordsByTabId.get(tabId) || record;
  const previousAttempts = currentRecord.preCompleteRetryUrl === committedUrl
    ? Math.max(0, Number(currentRecord.preCompleteRecoveryAttempts) || 0)
    : 0;
  const preCompleteRecoveryAttempts = previousAttempts + 1;
  if (preCompleteRecoveryAttempts > OVERLAY_LOADING_PRE_COMPLETE_RETRY_MAX_ATTEMPTS) {
    logHotkeyDebug('loading-pre-complete-retry-paused', {
      tabId,
      url: committedUrl,
      source: currentRecord.source || ''
    });
    return;
  }
  const nextRecord: TrackedLoadingRecord = {
    ...currentRecord,
    preCompleteRetryUrl: committedUrl,
    preCompleteRecoveryAttempts,
    updatedAt: Date.now()
  };
  setOverlayLoadingRecord(nextRecord);
  setTimeout(() => {
    getOverlayLoadingRecord(tabId, (latestRecord) => {
      if (!latestRecord || latestRecord.preCompleteRetryUrl !== committedUrl ||
          Number(latestRecord.preCompleteRecoveryAttempts) !== preCompleteRecoveryAttempts) {
        return;
      }
      const retryWithCurrentTab = (currentTab: TargetTab | null | undefined): void => {
        const stillTracked = overlayLoadingRecordsByTabId.get(tabId) || null;
        if (!stillTracked || stillTracked.preCompleteRetryUrl !== committedUrl ||
            Number(stillTracked.preCompleteRecoveryAttempts) !== preCompleteRecoveryAttempts) {
          return;
        }
        const retryTab: TargetTab = currentTab && typeof currentTab === 'object'
          ? currentTab
          : tab;
        const retryUrl = getResolvedTabUrl(retryTab);
        if (!canOpenOverlayOnUrl(retryUrl)) {
          return;
        }
        const retryChangeInfo: LoadingChangeInfo = retryTab.status === 'complete'
          ? { status: retryTab.status }
          : { url: retryUrl };
        recoverOverlayAfterLoadingUpdate(tabId, retryChangeInfo, retryTab);
      };
      if (chrome.tabs && typeof chrome.tabs.get === 'function') {
        chrome.tabs.get(tabId, (currentTab) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            return;
          }
          retryWithCurrentTab(currentTab);
        });
        return;
      }
      retryWithCurrentTab(tab);
    });
  }, OVERLAY_LOADING_PRE_COMPLETE_RETRY_MS * preCompleteRecoveryAttempts);
}

function restoreOverlayAfterLoadingDocumentChange(tab: TargetTab | null | undefined, record: TrackedLoadingRecord | null | undefined, complete: boolean): void {
  if (!tab || typeof tab.id !== 'number' || !record) {
    return;
  }
  const tabId = tab.id;
  openOverlayOnTab(tab, [], record.source, {
    loadingRecovery: true,
    loadingRecord: record,
    ensureOpen: true,
    skipDuplicateGuard: true,
    onComplete: (ok) => {
      if (complete === true) {
        if (ok) {
          const restoredRecord = overlayLoadingRecordsByTabId.get(tabId) || record;
          if (!overlayLoadingPendingUpdateByTabId.has(tabId)) {
            scheduleOverlayLoadingStableCompletion(tab, restoredRecord);
          }
        } else {
          scheduleOverlayLoadingRecoveryRetry(tab, record);
        }
        return;
      }
      if (!ok) {
        logHotkeyDebug('loading-recovery-failed', {
          tabId,
          source: record.source || ''
        });
        scheduleOverlayLoadingPreCompleteRetry(tab, record);
      }
    }
  });
}

export function recoverOverlayAfterLoadingUpdate(
  tabId: number,
  changeInfo: LoadingChangeInfo | null | undefined,
  tab: TargetTab | null | undefined
): void {
  const isComplete = Boolean(changeInfo && changeInfo.status === 'complete');
  const isStableComplete = Boolean(isComplete && changeInfo && changeInfo.stable === true);
  const isCommittedUrl = Boolean(changeInfo && typeof changeInfo.url === 'string');
  if (!isComplete && !isCommittedUrl) {
    return;
  }
  if (overlayLoadingRecoveryInFlightByTabId.has(tabId)) {
    queueOverlayLoadingUpdate(tabId, changeInfo, tab);
    return;
  }
  getOverlayLoadingRecord(tabId, (record) => {
    if (!record) {
      return;
    }
    if (isStableComplete && changeInfo &&
        Number(changeInfo.stableCompletionToken) !== Number(record.stableCompletionToken)) {
      return;
    }
    if (overlayLoadingRecoveryInFlightByTabId.has(tabId)) {
      queueOverlayLoadingUpdate(tabId, changeInfo, tab);
      return;
    }
    const resolvedTab: TargetTab & { id: number } = { ...(tab || {}), id: tabId };
    if (isCommittedUrl && changeInfo) {
      resolvedTab.url = changeInfo.url;
    }
    const resolvedUrl = getResolvedTabUrl(resolvedTab);
    if (!canOpenOverlayOnUrl(resolvedUrl)) {
      const trackedPendingUrl = typeof record.pendingNavigationUrl === 'string'
        ? record.pendingNavigationUrl
        : '';
      if (!isComplete && canOpenOverlayOnUrl(trackedPendingUrl)) {
        return;
      }
      const shouldReplayRestrictedIntent = isComplete &&
        record.pendingNavigationDeferred === true;
      clearOverlayLoadingRecord(tabId);
      if (shouldReplayRestrictedIntent) {
        const settledTab: TargetTab = {
          ...resolvedTab,
          status: 'complete',
          pendingUrl: ''
        };
        setTimeout(() => {
          openOverlayOnTab(settledTab, [], record.source, {
            skipDuplicateGuard: true
          });
        }, 0);
      }
      return;
    }
    overlayLoadingRecoveryInFlightByTabId.add(tabId);
    probeOverlayLoadingState(tabId, (results) => {
      const pendingDocumentStart = overlayLoadingPendingUpdateByTabId.get(tabId);
      if (pendingDocumentStart && pendingDocumentStart.changeInfo &&
          pendingDocumentStart.changeInfo.documentStarted === true) {
        finishOverlayLoadingOpenAttempt(tabId);
        return;
      }
      if (chrome.runtime && chrome.runtime.lastError) {
        if (isComplete) {
          restoreOverlayAfterLoadingDocumentChange(resolvedTab, record, true);
        } else {
          finishOverlayLoadingOpenAttempt(tabId);
          scheduleOverlayLoadingPreCompleteRetry(resolvedTab, record);
        }
        return;
      }
      const outcome = OVERLAY_LOADING_LIFECYCLE.decideRecovery(record, results, {
        complete: isComplete,
        stable: isStableComplete,
        now: Date.now(),
        ttlMs: OVERLAY_LOADING_RECORD_TTL_MS
      });
      if (outcome.action === 'clear' || outcome.action === 'none') {
        clearOverlayLoadingRecord(tabId);
        return;
      }
      if (outcome.record) {
        setOverlayLoadingRecord(outcome.record);
      }
      if (outcome.action === 'keep') {
        const hasPendingLoadingUpdate = overlayLoadingPendingUpdateByTabId.has(tabId);
        finishOverlayLoadingOpenAttempt(tabId);
        if (isComplete && !isStableComplete && !hasPendingLoadingUpdate) {
          scheduleOverlayLoadingStableCompletion(
            resolvedTab,
            outcome.record || record
          );
        }
        return;
      }
      restoreOverlayAfterLoadingDocumentChange(
        resolvedTab,
        outcome.record || record,
        isComplete
      );
    });
  });
}

export function recoverOverlayAfterTopFrameDocumentStart(
  request: IncomingRequest<'notifyTopFrameDocumentStarted'>,
  sender: MessageSender
): boolean {
  const senderTab = sender && sender.tab ? sender.tab : null;
  if (!senderTab || typeof senderTab.id !== 'number' ||
      (typeof sender.frameId === 'number' && sender.frameId !== 0)) {
    return false;
  }
  const requestedUrl = request && typeof request.documentUrl === 'string' ? request.documentUrl.trim() : '';
  const documentUrl = requestedUrl || getResolvedTabUrl(senderTab);
  const senderTabId = senderTab.id;
  const committedTab: TargetTab = {
    ...senderTab,
    status: 'loading',
    url: documentUrl
  };
  markOverlayLoadingRecordUnstable(senderTabId, () => {
    recoverOverlayAfterLoadingUpdate(
      senderTabId,
      { url: documentUrl, documentStarted: true },
      committedTab
    );
  });
  return true;
}

export type { LoadingChangeInfo, TrackedLoadingRecord };
