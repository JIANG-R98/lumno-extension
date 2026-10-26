// Keeps the search overlay alive across page loads: the retries that reopen
// the overlay once a navigating tab settles.
import * as OVERLAY_LOADING_LIFECYCLE from './overlay-loading-lifecycle';
import { logHotkeyDebug } from './worker-context';
import { canOpenOverlayOnUrl, getResolvedTabUrl } from './browser-urls-service';
import { OVERLAY_HOST_ID } from '../domain/injected-commands';
import type { OverlayOpener, TargetTab, TrackedLoadingRecord } from './overlay-types';
import type { IncomingRequest, MessageSender, RejectionReply } from './message-router';
import type { BackgroundReply } from '../domain/messages';
import { OVERLAY_LOADING_PRE_COMPLETE_RETRY_MAX_ATTEMPTS, OVERLAY_LOADING_PRE_COMPLETE_RETRY_MS, OVERLAY_LOADING_RECORD_TTL_MS, OVERLAY_LOADING_RECOVERY_MAX_ATTEMPTS, OVERLAY_LOADING_RECOVERY_RETRY_MS, OVERLAY_LOADING_STABLE_COMPLETE_MS, clearOverlayLoadingRecord, getOverlayLoadingRecord, overlayLoadingPendingUpdateByTabId, overlayLoadingRecordsByTabId, overlayLoadingRecoveryInFlightByTabId, setOverlayLoadingRecord } from './overlay-loading-records';
import type { LoadingChangeInfo } from './overlay-loading-records';

// Reopens the overlay on a tab. Opening the overlay is what schedules the
// retries here, so the opener registers itself (setOverlayReopener) rather
// than this module importing it.
let reopenOverlay: OverlayOpener = () => {};

function setOverlayReopener(open: OverlayOpener): void {
  reopenOverlay = open;
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

function finishOverlayLoadingOpenAttempt(tabId: number): void {
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

function markOverlayLoadingRecordUnstable(tabId: unknown, callback?: (record: TrackedLoadingRecord | null) => void): void {
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

function updateOverlayLoadingRecordFromInvocation(
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

function updateOverlayLoadingSessionFromMessage(
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

function scheduleOverlayLoadingPreCompleteRetry(tab: TargetTab | null | undefined, record: TrackedLoadingRecord | null | undefined): void {
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
  reopenOverlay(tab, [], record.source, {
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

// The page went somewhere the overlay cannot open. The record goes, and an
// overlay asked for while the tab was still leaving its page opens once it
// has loaded; a pending move back to an openable page keeps the record.
function settleOnRestrictedUrl(
  tabId: number,
  record: TrackedLoadingRecord,
  resolvedTab: TargetTab & { id: number },
  isComplete: boolean
): void {
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
      reopenOverlay(settledTab, [], record.source, {
        skipDuplicateGuard: true
      });
    }, 0);
  }
}

// The overlay is still up: wait for the page to settle before letting go.
function keepTracking(
  tabId: number,
  resolvedTab: TargetTab & { id: number },
  record: TrackedLoadingRecord,
  flags: { isComplete: boolean; isStableComplete: boolean }
): void {
  const hasPendingLoadingUpdate = overlayLoadingPendingUpdateByTabId.has(tabId);
  finishOverlayLoadingOpenAttempt(tabId);
  if (flags.isComplete && !flags.isStableComplete && !hasPendingLoadingUpdate) {
    scheduleOverlayLoadingStableCompletion(resolvedTab, record);
  }
}

// Acts on what the probe found in the tab: clears, keeps or restores the
// overlay.
function applyRecoveryProbe(
  tabId: number,
  record: TrackedLoadingRecord,
  resolvedTab: TargetTab & { id: number },
  results: Parameters<Parameters<typeof probeOverlayLoadingState>[1]>[0],
  flags: { isComplete: boolean; isStableComplete: boolean }
): void {
  const { isComplete, isStableComplete } = flags;
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
    keepTracking(tabId, resolvedTab, outcome.record || record, flags);
    return;
  }
  restoreOverlayAfterLoadingDocumentChange(
    resolvedTab,
    outcome.record || record,
    isComplete
  );
}

function recoverOverlayAfterLoadingUpdate(
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
      settleOnRestrictedUrl(tabId, record, resolvedTab, isComplete);
      return;
    }
    overlayLoadingRecoveryInFlightByTabId.add(tabId);
    probeOverlayLoadingState(tabId, (results) => {
      applyRecoveryProbe(tabId, record, resolvedTab, results, { isComplete, isStableComplete });

    });
  });
}

function recoverOverlayAfterTopFrameDocumentStart(
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

export {
  setOverlayReopener,
  finishOverlayLoadingOpenAttempt,
  markOverlayLoadingRecordUnstable,
  probeOverlayLoadingState,
  queueOverlayLoadingUpdate,
  recoverOverlayAfterLoadingUpdate,
  recoverOverlayAfterTopFrameDocumentStart,
  restoreOverlayAfterLoadingDocumentChange,
  scheduleOverlayLoadingPreCompleteRetry,
  scheduleOverlayLoadingRecoveryRetry,
  scheduleOverlayLoadingStableCompletion,
  updateOverlayLoadingRecordFromInvocation,
  updateOverlayLoadingSessionFromMessage
};
