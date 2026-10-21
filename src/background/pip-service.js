// Picture-in-Picture: which tab owns the active video PiP window, the Web Clip
// (Document PiP) picker, and the messages the page-world PiP helpers send.
//
// Loaded by background.js through its first importScripts block (the Firefox
// build lists that block as background.scripts). Like background.js this is a
// classic script sharing the worker's global scope. Its functions use
// background.js bindings (the Document PiP setting cache,
// openExtensionOptionsPage, ...) only when they run, never while this file
// loads, because background.js has not initialized its own top-level bindings
// yet at that point.

const pipOwnership = globalThis.LumnoPipOwnership.create({
  chromeApi: chrome,
  getResolvedTabUrl: getResolvedTabUrl
});

const pipMainWorld = globalThis.LumnoPipMainWorld.create({
  chromeApi: chrome
});

// A frozen tab (tab freezing, Memory Saver) never runs an injected script, so
// asking it would wait forever and web clip would never open. A tab playing
// picture-in-picture is never frozen or discarded, so those are skipped, and
// tabs that still do not answer in time count as having none.
const VIDEO_PIP_DETECT_TIMEOUT_MS = 400;

function detectAnyActiveVideoPiP(callback) {
  chrome.tabs.query({}, (tabs) => {
    const tabList = Array.isArray(tabs) ? tabs : [];
    const candidates = tabList.filter((tab) => {
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
    let timeoutId = null;
    const done = (active, tabId) => {
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
    timeoutId = setTimeout(() => done(false, null), VIDEO_PIP_DETECT_TIMEOUT_MS);
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

function openDocumentPipSettings() {
  openExtensionOptionsPage({ hash: 'labs:document-pip' });
}

function openDocumentPipPickerOnTab(activeTab, source) {
  return documentPipEnabledReady.then(() => {
    openDocumentPipPickerOnReadyTab(activeTab, source);
    return documentPipEnabledCache;
  });
}

function openDocumentPipPickerOnReadyTab(activeTab, source) {
  if (!documentPipEnabledCache) {
    logHotkeyDebug('document-pip-disabled', { source: source || '' });
    openDocumentPipSettings();
    return;
  }
  if (!activeTab || typeof activeTab.id !== 'number') {
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
  const injectAndInvoke = (invokeMode) => {
    chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: [
        'build/codex-debug-surface.js',
        'build/document-pip-picker.js'
      ]
    }, () => {
      if (chrome.runtime.lastError) {
        logHotkeyDebug('document-pip-inject-failed', {
          step: 'build/document-pip-picker.js',
          tabId: activeTab.id,
          error: chrome.runtime.lastError.message || 'unknown',
          source: source || ''
        });
        openExtensionOptionsPage();
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (mode) => {
          const controller = window.__lumnoDocumentPiPPicker2026;
          if (!controller || typeof controller.toggle !== 'function') {
            return { ok: false, reason: 'picker-missing' };
          }
          if (mode === 'conflict-toast') {
            if (typeof controller.notifyVideoPiPConflict === 'function') {
              return controller.notifyVideoPiPConflict();
            }
            return { ok: false, reason: 'picker-conflict-handler-missing' };
          }
          return controller.toggle();
        },
        args: [invokeMode]
      }, (results) => {
        if (chrome.runtime.lastError) {
          logHotkeyDebug('document-pip-toggle-failed', {
            step: 'toggle',
            tabId: activeTab.id,
            error: chrome.runtime.lastError.message || 'unknown',
            source: source || '',
            mode: invokeMode || 'toggle'
          });
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

function sendPipMainWorldResponse(methodName, sender, sendResponse) {
  if (typeof pipMainWorld[methodName] !== 'function') {
    sendResponse({ ok: false, reason: 'pip-main-world-unavailable' });
    return;
  }
  pipMainWorld[methodName](sender)
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        reason: error && error.message ? error.message : String(error || 'pip-main-world-failed')
      });
    });
}

// Picture-in-picture ownership and main-world helpers.
const PIP_MESSAGE_HANDLERS = Object.freeze({
  pipRequestOwnership(request, sender, sendResponse) {
    pipOwnership.requestGlobalPipOwnership(sender, request && request.kind ? String(request.kind) : '')
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          granted: false,
          reason: error && error.message ? error.message : String(error || 'ownership-request-failed')
        });
      });
    return true;
  },
  pipReleaseOwnership(request, sender, sendResponse) {
    pipOwnership.releaseGlobalPipOwnership(sender, request && request.token ? String(request.token) : '')
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          released: false,
          reason: error && error.message ? error.message : String(error || 'ownership-release-failed')
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
