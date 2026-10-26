// Picture-in-Picture: which tab owns the active video PiP window, the Web Clip
// (Document PiP) picker, and the messages the page-world PiP helpers send.
//
// A module of the service worker; background.ts imports it before its own code
// runs. It uses other services' bindings only when its functions run, never
// while this file loads, because the services import one another.

import * as LumnoPipMainWorld from '../shared/pip-main-world';
import * as LumnoPipOwnership from './pip-ownership';
import { openExtensionOptionsPage } from './extension-pages';
import { documentPipEnabledReady, isDocumentPipEnabled, logHotkeyDebug } from './worker-context';
import { getResolvedTabUrl, isRestrictedUrl } from './browser-urls-service';
import type { HandlersFor, MessageSender, RejectionReply } from './message-router';
import type { PipMainWorldReply } from '../domain/messages';
import { createInjectedAppRun } from '../platform/injection';
import type { PipPickerCommand } from '../domain/injected-commands';

// The page-world helpers a content script asks the background to run.
type PipMainWorldMethod =
  | 'siteTryEnterPiPInMainWorld'
  | 'iqiyiTryEnterPiPInMainWorld'
  | 'iqiyiSetupAutoPiPInMainWorld'
  | 'forceExitPiPInMainWorld'
  | 'youtubeForceExitPiPInMainWorld';

// What the Web Clip picker does when asked: open or close, or explain that
// a video's picture-in-picture is in the way.
type PickerMode = 'toggle' | 'conflict-toast';

interface VideoPipDetection {
  checked: number;
  foundTabId: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// A page-world helper's result, which comes from the page: only fields of
// the expected types are kept.
function readPipMainWorldReply(value: unknown): PipMainWorldReply {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return { ok: false, reason: 'no-result' };
  }
  const reply: PipMainWorldReply = { ok: value.ok };
  if (typeof value.reason === 'string') reply.reason = value.reason;
  if (typeof value.before === 'boolean') reply.before = value.before;
  if (typeof value.after === 'boolean') reply.after = value.after;
  if (typeof value.attempted === 'boolean') reply.attempted = value.attempted;
  if (typeof value.attemptedExit === 'boolean') reply.attemptedExit = value.attemptedExit;
  if (typeof value.used === 'string') reply.used = value.used;
  if (typeof value.unminimized === 'boolean') reply.unminimized = value.unminimized;
  if (typeof value.bound === 'boolean') reply.bound = value.bound;
  if (typeof value.preparedVideos === 'number') reply.preparedVideos = value.preparedVideos;
  if (typeof value.error === 'string') reply.error = value.error;
  return reply;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : String(error || fallback);
}

export const pipOwnership = LumnoPipOwnership.create({
  chromeApi: chrome,
  getResolvedTabUrl: getResolvedTabUrl
});

const pipMainWorld = LumnoPipMainWorld.create({
  chromeApi: chrome
});

// A frozen tab (tab freezing, Memory Saver) never runs an injected script, so
// asking it would wait forever and web clip would never open. A tab playing
// picture-in-picture is never frozen or discarded, so those are skipped, and
// tabs that still do not answer in time count as having none.
const VIDEO_PIP_DETECT_TIMEOUT_MS = 400;

function detectAnyActiveVideoPiP(callback: (active: boolean, detail: VideoPipDetection) => void): void {
  chrome.tabs.query({}, (tabs) => {
    const tabList = Array.isArray(tabs) ? tabs : [];
    const candidates = tabList.filter((tab): tab is chrome.tabs.Tab & { id: number } => {
      if (!tab || typeof tab.id !== 'number' || tab.discarded === true || tab.frozen === true) {
        return false;
      }
      const tabUrl = getResolvedTabUrl(tab);
      if (isRestrictedUrl(tabUrl)) {
        return false;
      }
      return true;
    });
    if (!candidates.length) {
      callback(false, { checked: 0, foundTabId: null });
      return;
    }
    let pending = candidates.length;
    let finished = false;
    let checked = 0;
    const timeoutId = setTimeout(() => done(false, null), VIDEO_PIP_DETECT_TIMEOUT_MS);
    const done = (active: boolean, tabId: number | null): void => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeoutId);
      callback(Boolean(active), {
        checked: checked,
        foundTabId: typeof tabId === 'number' ? tabId : null
      });
    };
    candidates.forEach((tab) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          const pipElement = document.pictureInPictureElement;
          return {
            hasPiP: Boolean(pipElement),
            isVideoPiP: Boolean(pipElement && pipElement.tagName === 'VIDEO')
          };
        }
      }, (results) => {
        checked += 1;
        pending -= 1;
        if (finished) {
          return;
        }
        if (!chrome.runtime.lastError) {
          const payload = Array.isArray(results) && results[0] ? results[0].result : null;
          if (payload && payload.hasPiP && payload.isVideoPiP) {
            done(true, tab.id);
            return;
          }
        }
        if (pending <= 0) {
          done(false, null);
        }
      });
    });
  });
}

function openDocumentPipSettings(): void {
  openExtensionOptionsPage({ hash: 'labs:document-pip' });
}

// Opens the Web Clip picker on the tab; resolves whether Web Clip is on.
export function openDocumentPipPickerOnTab(activeTab: chrome.tabs.Tab | null | undefined, source: string): Promise<boolean> {
  return documentPipEnabledReady.then(() => {
    openDocumentPipPickerOnReadyTab(activeTab, source);
    return isDocumentPipEnabled();
  });
}

function openDocumentPipPickerOnReadyTab(activeTab: chrome.tabs.Tab | null | undefined, source: string): void {
  if (!isDocumentPipEnabled()) {
    logHotkeyDebug('document-pip-disabled', { source: source || '' });
    openDocumentPipSettings();
    return;
  }
  const activeTabId = activeTab && activeTab.id;
  if (!activeTab || typeof activeTabId !== 'number') {
    logHotkeyDebug('document-pip-no-active-tab', { source: source || '' });
    openExtensionOptionsPage();
    return;
  }
  const activeUrl = getResolvedTabUrl(activeTab);
  const restricted = isRestrictedUrl(activeUrl);
  logHotkeyDebug('document-pip-active-tab', {
    tabId: activeTab.id,
    url: activeUrl,
    restricted: restricted,
    source: source || ''
  });
  if (restricted) {
    logHotkeyDebug('document-pip-restricted-url', {
      tabId: activeTab.id,
      url: activeUrl,
      source: source || ''
    });
    openExtensionOptionsPage();
    return;
  }
  const injectAndInvoke = (invokeMode: PickerMode): void => {
    const command: PipPickerCommand = invokeMode === 'conflict-toast' ? { type: 'conflict-toast' } : { type: 'toggle' };
    chrome.scripting.executeScript(createInjectedAppRun(
      chrome.runtime,
      { tabId: activeTabId },
      ['pip-picker'],
      command
    ), (results) => {
      if (chrome.runtime.lastError) {
        logHotkeyDebug('document-pip-inject-failed', {
          step: 'pip-picker',
          tabId: activeTab.id,
          error: chrome.runtime.lastError.message || 'unknown',
          source: source || '',
          mode: invokeMode || 'toggle'
        });
        openExtensionOptionsPage();
        return;
      }
      const result = Array.isArray(results) && results[0] ? results[0].result : null;
      logHotkeyDebug('document-pip-toggle', {
        tabId: activeTab.id,
        source: source || '',
        mode: invokeMode || 'toggle',
        result: result && typeof result === 'object' ? result : {}
      });
    });
  };

  detectAnyActiveVideoPiP((hasActiveVideoPiP, detail) => {
    if (hasActiveVideoPiP) {
      logHotkeyDebug('document-pip-blocked-by-active-video-pip', {
        tabId: activeTab.id,
        source: source || '',
        checkedTabs: detail && typeof detail.checked === 'number' ? detail.checked : 0,
        pipTabId: detail && typeof detail.foundTabId === 'number' ? detail.foundTabId : null
      });
      injectAndInvoke('conflict-toast');
      return;
    }
    injectAndInvoke('toggle');
  });
}

function sendPipMainWorldResponse(
  methodName: PipMainWorldMethod,
  sender: MessageSender,
  sendResponse: (reply: PipMainWorldReply | RejectionReply) => void
): void {
  const run = pipMainWorld[methodName];
  if (typeof run !== 'function') {
    sendResponse({ ok: false, reason: 'pip-main-world-unavailable' });
    return;
  }
  run.call(pipMainWorld, sender)
    .then((result: unknown) => {
      sendResponse(readPipMainWorldReply(result));
    })
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        reason: getErrorMessage(error, 'pip-main-world-failed')
      });
    });
}

// Picture-in-picture ownership and main-world helpers.
type PipAction = 'pipRequestOwnership' | 'pipReleaseOwnership' | 'openDocumentPipPicker' | 'siteTryEnterPiPInMainWorld'
  | 'iqiyiTryEnterPiPInMainWorld' | 'iqiyiSetupAutoPiPInMainWorld' | 'forceExitPiPInMainWorld' | 'ytForceExitPiPInMainWorld';

export const PIP_MESSAGE_HANDLERS: HandlersFor<PipAction> = Object.freeze({
  pipRequestOwnership(request, sender, sendResponse) {
    pipOwnership.requestGlobalPipOwnership(sender, request && request.kind ? String(request.kind) : '')
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          granted: false,
          reason: getErrorMessage(error, 'ownership-request-failed')
        });
      });
    return true;
  },
  pipReleaseOwnership(request, sender, sendResponse) {
    pipOwnership.releaseGlobalPipOwnership(sender, request && request.token ? String(request.token) : '')
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          released: false,
          reason: getErrorMessage(error, 'ownership-release-failed')
        });
      });
    return true;
  },
  openDocumentPipPicker(request, sender, sendResponse) {
    const senderTab = sender && sender.tab ? sender.tab : null;
    if (!senderTab || typeof senderTab.id !== 'number') {
      sendResponse({ ok: false, reason: 'no-sender-tab' });
      return;
    }
    openDocumentPipPickerOnTab(senderTab, 'search-command').then((enabled) => {
      sendResponse({
        ok: enabled === true,
        enabled: enabled === true
      });
    });
    return true;
  },
  siteTryEnterPiPInMainWorld(request, sender, sendResponse) {
    sendPipMainWorldResponse('siteTryEnterPiPInMainWorld', sender, sendResponse);
    return true;
  },
  iqiyiTryEnterPiPInMainWorld(request, sender, sendResponse) {
    sendPipMainWorldResponse('iqiyiTryEnterPiPInMainWorld', sender, sendResponse);
    return true;
  },
  iqiyiSetupAutoPiPInMainWorld(request, sender, sendResponse) {
    sendPipMainWorldResponse('iqiyiSetupAutoPiPInMainWorld', sender, sendResponse);
    return true;
  },
  forceExitPiPInMainWorld(request, sender, sendResponse) {
    sendPipMainWorldResponse('forceExitPiPInMainWorld', sender, sendResponse);
    return true;
  },
  ytForceExitPiPInMainWorld(request, sender, sendResponse) {
    sendPipMainWorldResponse('youtubeForceExitPiPInMainWorld', sender, sendResponse);
    return true;
  }
});
