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
// A site with a service worker answers the frame from the worker, and the
// worker's own request belongs to no tab (tab id -1), so the tab's rule never
// sees it. While any preview is open, such requests lose X-Frame-Options
// alone: a worker may cache what it fetched and later serve it to the site's
// own tabs, where a removed CSP would stay removed. A page a worker builds
// from its cache keeps its headers and is still refused (X's posts load
// through another address for that; see link-preview-frame-url.js).
const WORKER_RULE_ID = 2147483647;
const NO_TAB_ID = -1;
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

function buildWorkerHeaderRule() {
  return {
    id: WORKER_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }]
    },
    condition: {
      tabIds: [NO_TAB_ID],
      resourceTypes: ['sub_frame', 'xmlhttprequest', 'other']
    }
  };
}

function createLinkPreviewService(options) {
  const config = options || {};
  const chromeApi = config.chromeApi;
  const now = typeof config.now === 'function' ? config.now : () => Date.now();
  const setTimer = config.setTimeout || setTimeout;
  const clearTimer = config.clearTimeout || clearTimeout;
  // tabId -> { token, url, capture, ready, state, expiryTimer }, where state
  // is "prepared" (pressed), "opening" (clicked, show not yet answered) or
  // "open" (the surface shows it).
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
      update.removeRuleIds.push(WORKER_RULE_ID);
      update.addRules = [buildFrameHeaderRule(tabId), buildWorkerHeaderRule()];
    } else if (sessions.size === 0) {
      // The last preview is gone; the workers' requests keep their headers.
      update.removeRuleIds.push(WORKER_RULE_ID);
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
      if (sessions.get(tabId) === session && session.state === 'prepared') {
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
    if (existing && existing.url === url && existing.state === 'prepared') {
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
    // The surface gets the screenshot as soon as both are ready, to decode
    // it while the button is still down; "show" then carries none.
    const screenshotDelivered = Promise.all([ready, capture]).then(([surfaceReady, screenshot]) => (
      surfaceReady && screenshot
        ? sendToSurface(tabId, { action: 'lumnoLinkPreviewScreenshot', token, screenshot }).then(Boolean)
        : false
    ));
    const session = { token, url, capture, ready, screenshotDelivered, state: 'prepared', expiryTimer: null };
    sessions.set(tabId, session);
    scheduleExpiry(tabId, session);
    return session;
  }

  async function open(tab, url, origin) {
    const session = prepare(tab, url);
    if (!session) {
      return { ok: false, reason: 'not-previewable' };
    }
    session.state = 'opening';
    clearTimer(session.expiryTimer);
    const [ready, screenshot, screenshotDelivered] = await Promise.all([
      session.ready,
      session.capture,
      session.screenshotDelivered
    ]);
    if (sessions.get(tab.id) !== session) {
      return { ok: false, reason: 'superseded' };
    }
    if (!ready) {
      // Nothing reached the page (the page refuses scripts, or it went
      // away): the link can still open in a tab.
      discard(tab.id, session.token);
      return { ok: false, reason: 'surface-unavailable' };
    }
    const shown = await sendToSurface(tab.id, {
      action: 'lumnoLinkPreviewShow',
      token: session.token,
      url,
      screenshot: screenshotDelivered ? '' : screenshot,
      origin: origin || null
    });
    if (!shown) {
      // The surface was asked to show and may be on screen; it moves the
      // link to a tab itself when it cannot show it, so nothing opens here.
      discard(tab.id, session.token);
      return { ok: false, reason: 'show-failed' };
    }
    if (sessions.get(tab.id) === session) {
      session.state = 'open';
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
  // may have taken it away without a close. Asking it settles that: no
  // answer (no surface) or another preview's token drops the rule.
  function verifyOpenPreview(tabId) {
    return sendToSurface(tabId, { action: 'lumnoLinkPreviewPing' }).then((response) => {
      const surfaceToken = response && typeof response.token === 'string' ? response.token : '';
      const session = sessions.get(tabId);
      if (!surfaceToken || (session && session.token !== surfaceToken)) {
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
  // so the check runs again when it finishes ("complete"). Only an open
  // preview is checked: the preview's own frame loading can report the tab
  // as loading while the press is still on its way to the surface.
  function handleTabUpdated(tabId, changeInfo) {
    if (!changeInfo || (changeInfo.status !== 'loading' && changeInfo.status !== 'complete')) {
      return Promise.resolve(false);
    }
    const session = sessions.get(tabId);
    if (!session || session.state !== 'open') {
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
      .filter((rule) => rule && rule.id !== WORKER_RULE_ID && rule.condition && Array.isArray(rule.condition.tabIds))
      .map((rule) => verifyOpenPreview(rule.condition.tabIds[0])));
    // The workers' rule outlives no preview.
    const left = await callback((done) => dnr.getSessionRules(done));
    if (Array.isArray(left) && left.length === 1 && left[0].id === WORKER_RULE_ID) {
      await callback((done) => dnr.updateSessionRules({ removeRuleIds: [WORKER_RULE_ID] }, done));
    }
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
        if (result.reason === 'surface-unavailable') {
          // The page has no preview to show it in: open the link in a tab,
          // as the click would have without the preview.
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
  WORKER_RULE_ID,
  PREPARED_TTL_MS,
  isPreviewableUrl,
  buildFrameHeaderRule,
  buildWorkerHeaderRule,
  createLinkPreviewService
};
