// The overlay's per-tab navigation state and loading records, kept in
// session storage so a suspended worker can resume them.
import * as OVERLAY_LOADING_LIFECYCLE from './overlay-loading-lifecycle';
import { logHotkeyDebug, workerSettings } from './worker-context';
import { overlayLoadingRecord, overlayNavigationState } from '../domain/settings/features';
import { canOpenOverlayOnUrl } from './browser-urls-service';
import type { OpenOverlayOptions, TargetTab, TrackedLoadingRecord } from './overlay-types';
import type {
  NavigationDetails,
  OverlaySessionState,
  TopFrameNavigationState
} from './overlay-loading-lifecycle';

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

const OVERLAY_NAVIGATION_STATE_TTL_MS = Number(
  OVERLAY_LOADING_LIFECYCLE.DEFAULT_NAVIGATION_STATE_TTL_MS
) || (5 * 60 * 1000);
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
const overlayNavigationStateByTabId = new Map<number, TopFrameNavigationState>();
const overlayLoadingRecordsByTabId = new Map<number, TrackedLoadingRecord>();



function setOverlayNavigationState(state: TopFrameNavigationState): void {
  if (!state || typeof state.tabId !== 'number') {
    return;
  }
  overlayNavigationStateByTabId.set(state.tabId, state);
  // The in-memory state still covers the current service-worker lifetime.
  void workerSettings.writeMembers(overlayNavigationState, new Map([[String(state.tabId), state]])).catch(() => {});
}

function clearOverlayNavigationState(tabId: unknown): void {
  if (typeof tabId !== 'number') {
    return;
  }
  overlayNavigationStateByTabId.delete(tabId);
  void workerSettings.removeMembers(overlayNavigationState, [tabId]).catch(() => {});
}

function getOverlayNavigationState(tabId: unknown, callback?: (state: TopFrameNavigationState | null) => void): void {
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
  workerSettings.readMembers(overlayNavigationState, [tabId]).then((members) => {
      const storedValue = members.get(String(tabId));
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
    }, () => done(null));
}

function rememberOverlayTopFrameNavigation(details: NavigationDetails | null | undefined): void {
  const state = OVERLAY_LOADING_LIFECYCLE.createTopFrameNavigationState(details, Date.now());
  if (state) {
    setOverlayNavigationState(state);
  }
}

function updateOverlayTopFrameNavigation(details: NavigationDetails | null | undefined): void {
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


type LoadingSession = TrackedLoadingRecord['session'];

function readSession(record: TrackedLoadingRecord | null): LoadingSession | null {
  return record && record.session && typeof record.session === 'object' ? record.session : null;
}

// The newer of two sessions by revision, then by update time; the
// incoming one wins a tie.
function newerSession(current: LoadingSession | null, incoming: LoadingSession | null): LoadingSession | null {
  if (!current || !incoming) {
    return current || incoming;
  }
  const currentRevision = Number(current.revision || 0);
  const incomingRevision = Number(incoming.revision || 0);
  if (currentRevision !== incomingRevision) {
    return currentRevision > incomingRevision ? current : incoming;
  }
  return Number(current.updatedAt || 0) > Number(incoming.updatedAt || 0) ? current : incoming;
}

type StabilityFields = Pick<TrackedLoadingRecord, 'stableCompletionToken' | 'stableCompletionStartedAt' | 'stableCompletionUrl'>;

function readStability(record: TrackedLoadingRecord): Required<StabilityFields> {
  return {
    stableCompletionToken: Math.max(0, Number(record.stableCompletionToken) || 0),
    stableCompletionStartedAt: Number(record.stableCompletionStartedAt) || 0,
    stableCompletionUrl: String(record.stableCompletionUrl || '')
  };
}

// A stability check already counted for the tab is kept over an older one.
function laterStability(current: TrackedLoadingRecord | null, incoming: TrackedLoadingRecord): Required<StabilityFields> {
  const incomingStability = readStability(incoming);
  if (!current) {
    return incomingStability;
  }
  const currentStability = readStability(current);
  return currentStability.stableCompletionToken >= incomingStability.stableCompletionToken ? currentStability : incomingStability;
}

function setOverlayLoadingRecord(record: TrackedLoadingRecord): void {
  if (!record || typeof record.tabId !== 'number') {
    return;
  }
  const currentRecord = overlayLoadingRecordsByTabId.get(record.tabId) || null;
  const nextRecord: TrackedLoadingRecord = {
    ...record,
    session: newerSession(readSession(currentRecord), readSession(record)),
    ...laterStability(currentRecord, record)
  };
  overlayLoadingRecordsByTabId.set(record.tabId, nextRecord);
  // The in-memory record still covers ordinary loading lifetimes.
  void workerSettings.writeMembers(overlayLoadingRecord, new Map([[String(record.tabId), nextRecord]])).catch(() => {});
}

function clearOverlayLoadingRecord(tabId: unknown): void {
  if (typeof tabId !== 'number') {
    return;
  }
  overlayLoadingRecordsByTabId.delete(tabId);
  overlayLoadingRecoveryInFlightByTabId.delete(tabId);
  overlayLoadingPendingUpdateByTabId.delete(tabId);
  void workerSettings.removeMembers(overlayLoadingRecord, [tabId]).catch(() => {});
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
  workerSettings.readMembers(overlayLoadingRecord, [tabId]).then((members) => {
      const storedValue = members.get(String(tabId));
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
    }, () => done(null));
}

function rememberOverlayLoadingRecord(
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

function getPendingOverlayNavigationUrl(tab: TargetTab | null | undefined): string {
  return OVERLAY_LOADING_LIFECYCLE.getPendingInjectableUrl(
    tab,
    canOpenOverlayOnUrl
  );
}

function shouldDeferRestrictedOverlayNavigation(tab: TargetTab | null | undefined): boolean {
  return OVERLAY_LOADING_LIFECYCLE.shouldDeferRestrictedLoadingTab(
    tab,
    canOpenOverlayOnUrl
  );
}

function rememberOverlayPendingNavigationIntent(
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

export {
  OVERLAY_LOADING_PRE_COMPLETE_RETRY_MAX_ATTEMPTS,
  OVERLAY_LOADING_PRE_COMPLETE_RETRY_MS,
  OVERLAY_LOADING_RECORD_TTL_MS,
  OVERLAY_LOADING_RECOVERY_MAX_ATTEMPTS,
  OVERLAY_LOADING_RECOVERY_RETRY_MS,
  OVERLAY_LOADING_STABLE_COMPLETE_MS,
  OVERLAY_NAVIGATION_STATE_TTL_MS,
  clearOverlayLoadingRecord,
  clearOverlayNavigationState,
  getOverlayLoadingRecord,
  getOverlayNavigationState,
  getPendingOverlayNavigationUrl,
  isRecord,
  overlayLoadingPendingUpdateByTabId,
  overlayLoadingRecordsByTabId,
  overlayLoadingRecoveryInFlightByTabId,
  overlayNavigationStateByTabId,
  readStoredLoadingRecord,
  readStoredNavigationState,
  readStoredSession,
  rememberOverlayLoadingRecord,
  rememberOverlayPendingNavigationIntent,
  rememberOverlayTopFrameNavigation,
  setOverlayLoadingRecord,
  setOverlayNavigationState,
  shouldDeferRestrictedOverlayNavigation,
  updateOverlayTopFrameNavigation
};
export type {
  LoadingChangeInfo,
  PendingLoadingUpdate
};
