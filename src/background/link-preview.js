// Shift+click on a link opens it in a small window over the page instead of
// a new browser window. The page's content script reports the press here;
// this service captures the visible tab for the receding background, lets
// the tab embed pages that refuse framing, and injects the preview surface
// into the top frame.
//
// A press arrives twice: on mousedown ("prepare") and on click ("open").
// Preparing starts the screenshot, the header rule and the injection while
// the button is still down, and asks the surface to start loading the page
// in a hidden frame, so the window opens on click with the page underway.
const UI_FILES = Object.freeze(['build/link-preview.js']);
// X-Frame-Options and CSP frame-ancestors are the two ways a page refuses to
// be framed. declarativeNetRequest can only drop a whole header, so the CSP
// goes with frame-ancestors; the rule applies to subframes of the one tab and
// only while its preview is open.
const FRAME_BLOCKING_HEADERS = Object.freeze(['x-frame-options', 'content-security-policy']);
// A press the page kept for itself (it handled the click) never opens; its
// rule and screenshot are dropped after this long.
const PREPARED_TTL_MS = 4000;
const CAPTURE_JPEG_QUALITY = 82;
const PREVIEWABLE_URL_PATTERN = /^https?:\/\//i;

function isPreviewableUrl(url) {
  return typeof url === 'string' && url.length <= 8192 && PREVIEWABLE_URL_PATTERN.test(url);
}

// Session rules accept a tab condition and outlive a suspended worker; one
// rule per tab, keyed by the tab id, so a woken worker still finds it.
function getRuleIdForTab(tabId) {
  return tabId;
}

function buildFrameHeaderRule(tabId) {
  return {
    id: getRuleIdForTab(tabId),
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: FRAME_BLOCKING_HEADERS.map((header) => ({ header, operation: 'remove' }))
    },
    condition: {
      tabIds: [tabId],
      resourceTypes: ['sub_frame']
    }
  };
}

function createLinkPreviewService(options) {
  const config = options || {};
  const chromeApi = config.chromeApi;
  const now = typeof config.now === 'function' ? config.now : () => Date.now();
  const setTimer = config.setTimeout || setTimeout;
  const clearTimer = config.clearTimeout || clearTimeout;
  // tabId -> { token, url, capture, ready, shown, expiryTimer }
  const sessions = new Map();
  let tokenCounter = 0;

  function readLastError() {
    return chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
  }

  function callback(fn) {
    return new Promise((resolve) => {
      try {
        fn((result) => {
          resolve(readLastError() ? null : (result === undefined ? true : result));
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function getDnr() {
    const dnr = chromeApi && chromeApi.declarativeNetRequest;
    return dnr && typeof dnr.updateSessionRules === 'function' ? dnr : null;
  }

  function setFrameHeaderRule(tabId, enabled) {
    const dnr = getDnr();
    if (!dnr) {
      return Promise.resolve(false);
    }
    const update = { removeRuleIds: [getRuleIdForTab(tabId)] };
    if (enabled) {
      update.addRules = [buildFrameHeaderRule(tabId)];
    }
    return callback((done) => dnr.updateSessionRules(update, done)).then(Boolean);
  }

  function captureTab(tab) {
    const tabs = chromeApi && chromeApi.tabs;
    if (!tabs || typeof tabs.captureVisibleTab !== 'function' || typeof tab.windowId !== 'number') {
      return Promise.resolve('');
    }
    return callback((done) => tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: CAPTURE_JPEG_QUALITY
    }, done)).then((dataUrl) => (typeof dataUrl === 'string' ? dataUrl : ''));
  }

  function injectSurface(tabId) {
    const scripting = chromeApi && chromeApi.scripting;
    if (!scripting || typeof scripting.executeScript !== 'function') {
      return Promise.resolve(false);
    }
    return callback((done) => scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: UI_FILES.slice()
    }, done)).then(Boolean);
  }

  function sendToSurface(tabId, message) {
    const tabs = chromeApi && chromeApi.tabs;
    if (!tabs || typeof tabs.sendMessage !== 'function') {
      return Promise.resolve(null);
    }
    // The surface's own answer: a frame without the surface answers nothing
    // (undefined), which must not read as success.
    return new Promise((resolve) => {
      try {
        tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
          resolve(readLastError() || response === undefined ? null : response);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function scheduleExpiry(tabId, session) {
    clearTimer(session.expiryTimer);
    session.expiryTimer = setTimer(() => {
      if (sessions.get(tabId) === session && !session.shown) {
        discard(tabId, session.token);
      }
    }, PREPARED_TTL_MS);
  }

  function prepare(tab, url) {
    const tabId = tab && tab.id;
    if (typeof tabId !== 'number' || !isPreviewableUrl(url)) {
      return null;
    }
    const existing = sessions.get(tabId);
    if (existing && existing.url === url && !existing.shown) {
      scheduleExpiry(tabId, existing);
      return existing;
    }
    if (existing) {
      clearTimer(existing.expiryTimer);
    }
    tokenCounter += 1;
    const token = `${now().toString(36)}-${tokenCounter}`;
    // The screenshot goes first: the surface's hidden frame stays out of it
    // either way, but the capture is the slowest step.
    const capture = captureTab(tab);
    const ready = Promise.all([setFrameHeaderRule(tabId, true), injectSurface(tabId)])
      .then(([, injected]) => {
        if (!injected) {
          return false;
        }
        return sendToSurface(tabId, { action: 'lumnoLinkPreviewPrewarm', token, url }).then(Boolean);
      });
    const session = { token, url, capture, ready, shown: false, expiryTimer: null };
    sessions.set(tabId, session);
    scheduleExpiry(tabId, session);
    return session;
  }

  async function open(tab, url, origin) {
    const session = prepare(tab, url);
    if (!session) {
      return { ok: false, reason: 'not-previewable' };
    }
    session.shown = true;
    clearTimer(session.expiryTimer);
    const [ready, screenshot] = await Promise.all([session.ready, session.capture]);
    if (sessions.get(tab.id) !== session) {
      return { ok: false, reason: 'superseded' };
    }
    if (!ready) {
      discard(tab.id, session.token);
      return { ok: false, reason: 'surface-unavailable' };
    }
    const shown = await sendToSurface(tab.id, {
      action: 'lumnoLinkPreviewShow',
      token: session.token,
      url,
      screenshot,
      origin: origin || null
    });
    if (!shown) {
      discard(tab.id, session.token);
      return { ok: false, reason: 'surface-unavailable' };
    }
    return { ok: true };
  }

  // Drops the tab's preview. A token that no longer names the tab's
  // preview is a late close from one already replaced; it is ignored. With
  // no session known (the worker slept while the preview was open), the
  // rule is removed anyway.
  function discard(tabId, token) {
    const session = sessions.get(tabId);
    if (session && token && session.token !== token) {
      return Promise.resolve(false);
    }
    if (session) {
      clearTimer(session.expiryTimer);
      sessions.delete(tabId);
    }
    return setFrameHeaderRule(tabId, false);
  }

  function openInTab(tab, url) {
    const tabs = chromeApi && chromeApi.tabs;
    if (!tabs || typeof tabs.create !== 'function' || !isPreviewableUrl(url)) {
      return Promise.resolve(false);
    }
    const properties = { url, active: true };
    if (tab && typeof tab.index === 'number') {
      properties.index = tab.index + 1;
    }
    if (tab && typeof tab.id === 'number') {
      properties.openerTabId = tab.id;
    }
    if (tab && typeof tab.windowId === 'number') {
      properties.windowId = tab.windowId;
    }
    return callback((done) => tabs.create(properties, done)).then(Boolean);
  }

  // The surface lives in the tab's top document, so a navigation of the tab
  // may have taken it away without a close. Asking it settles that.
  function verifyOpenPreview(tabId) {
    return sendToSurface(tabId, { action: 'lumnoLinkPreviewPing' }).then((response) => {
      const openToken = response && typeof response.token === 'string' ? response.token : '';
      const session = sessions.get(tabId);
      if (!openToken || (session && session.shown && session.token !== openToken)) {
        return discard(tabId, '');
      }
      return false;
    });
  }

  function handleTabRemoved(tabId) {
    const session = sessions.get(tabId);
    if (session) {
      clearTimer(session.expiryTimer);
      sessions.delete(tabId);
    }
    return setFrameHeaderRule(tabId, false);
  }

  // A navigation starts ("loading") while the old document still answers,
  // so the check runs again when it finishes ("complete").
  function handleTabUpdated(tabId, changeInfo) {
    if (!changeInfo || (changeInfo.status !== 'loading' && changeInfo.status !== 'complete')) {
      return Promise.resolve(false);
    }
    const session = sessions.get(tabId);
    if (!session || !session.shown) {
      return Promise.resolve(false);
    }
    return verifyOpenPreview(tabId);
  }

  // Rules left by a worker that stopped while previews were open: keep the
  // ones whose preview is still on screen.
  async function reconcileRules() {
    const dnr = getDnr();
    if (!dnr || typeof dnr.getSessionRules !== 'function') {
      return;
    }
    const rules = await callback((done) => dnr.getSessionRules(done));
    if (!Array.isArray(rules)) {
      return;
    }
    await Promise.all(rules
      .filter((rule) => rule && rule.condition && Array.isArray(rule.condition.tabIds))
      .map((rule) => verifyOpenPreview(rule.condition.tabIds[0])));
  }

  function attach() {
    const tabs = chromeApi && chromeApi.tabs;
    if (tabs && tabs.onRemoved && typeof tabs.onRemoved.addListener === 'function') {
      tabs.onRemoved.addListener((tabId) => {
        if (sessions.has(tabId)) {
          handleTabRemoved(tabId);
        }
      });
    }
    if (tabs && tabs.onUpdated && typeof tabs.onUpdated.addListener === 'function') {
      tabs.onUpdated.addListener((tabId, changeInfo) => {
        handleTabUpdated(tabId, changeInfo);
      });
    }
    reconcileRules();
  }

  function readOrigin(request, sender) {
    // Click coordinates only mean something in the top frame's viewport.
    if (!sender || sender.frameId !== 0 || !request || !request.origin) {
      return null;
    }
    const x = Number(request.origin.x);
    const y = Number(request.origin.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  const messageHandlers = Object.freeze({
    linkPreviewPrepare(request, sender, sendResponse) {
      prepare(sender && sender.tab, request.url);
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewOpen(request, sender, sendResponse) {
      const tab = sender && sender.tab;
      open(tab, request.url, readOrigin(request, sender)).then((result) => {
        if (!result.ok) {
          // The page had no preview to show: open the link the way a
          // modified click without the preview would have.
          openInTab(tab, request.url);
        }
        sendResponse(result);
      });
      return true;
    },
    linkPreviewClose(request, sender, sendResponse) {
      const tab = sender && sender.tab;
      if (tab && typeof tab.id === 'number') {
        discard(tab.id, String(request.token || ''));
      }
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewOpenInTab(request, sender, sendResponse) {
      openInTab(sender && sender.tab, request.url).then((opened) => {
        sendResponse({ ok: opened });
      });
      return true;
    }
  });

  return Object.freeze({
    prepare,
    open,
    discard,
    openInTab,
    handleTabRemoved,
    handleTabUpdated,
    reconcileRules,
    attach,
    messageHandlers
  });
}

export {
  UI_FILES,
  FRAME_BLOCKING_HEADERS,
  PREPARED_TTL_MS,
  isPreviewableUrl,
  buildFrameHeaderRule,
  createLinkPreviewService
};
