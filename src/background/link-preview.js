import { toPreviewFrameUrl } from '../shared/link-preview-frame-url.js';

// Shift+click on a link opens it in a small window over the page instead of
// a new browser window. The page's content script reports the press here;
// this service captures the visible tab for the receding background, lets
// the preview embed the site it shows even where the site refuses framing,
// and injects the preview surface into the top frame.
//
// A press arrives twice: on mousedown ("prepare") and on click ("open").
// Preparing starts the screenshot, the header rule and the injection while
// the button is still down, and asks the surface to start loading the page
// in a hidden frame, so the window opens on click with the page underway. A
// press released anywhere but the link ("cancel") drops all of that.
const UI_FILES = Object.freeze(['build/link-preview.js']);
// X-Frame-Options and CSP frame-ancestors are the two ways a page refuses to
// be framed (a page that sends both is judged by frame-ancestors). While a
// tab's preview is open, its subframes from the previewed site lose
// X-Frame-Options, and lose their CSP only where it has frame-ancestors:
// declarativeNetRequest drops a whole header, never part of one, and the
// rest of a CSP (the limits on script and style that guard against injected
// script) is worth keeping. Chrome before 128 cannot match on a response
// header; there the CSP always goes.
//
// The rules reach the previewed site's domains only (see sessionDomains), so
// the page under the preview, or a page shown in it, cannot use the
// preview to frame any other site that refuses framing.
const FRAME_BLOCKING_HEADERS = Object.freeze(['x-frame-options', 'content-security-policy']);
const FRAME_ANCESTORS_CSP = Object.freeze({ header: 'content-security-policy', values: ['*frame-ancestors*'] });
// A site with a service worker answers the frame from the worker, and the
// worker's own request belongs to no tab (tab id -1), so the tab's rule never
// sees it. While previews are open, such requests to the previewed sites'
// domains lose X-Frame-Options alone: a worker may cache what it fetched and
// later serve it to the site's own tabs, where a removed CSP would stay
// removed. A page a worker builds from its cache keeps its headers and is
// still refused (X's posts load through another address for that; see
// link-preview-frame-url.js).
const WORKER_RULE_ID = 1;
const NO_TAB_ID = -1;
// A press the page kept for itself (it handled the click) never opens; its
// rule and screenshot are dropped after this long.
const PREPARED_TTL_MS = 4000;
const CAPTURE_JPEG_QUALITY = 82;
const PREVIEWABLE_URL_PATTERN = /^https?:\/\//i;
// A refused page in the preview is tried again with the domains of the
// address it went to (and of where that address redirects) allowed; a
// preview gets this many such tries.
const MAX_REFUSED_RETRIES = 6;
const RESOLVE_TIMEOUT_MS = 5000;
// Open previews outlive a suspended worker in session storage, so a woken
// worker still knows the preview's frame and domains.
const SESSIONS_STORAGE_KEY = '_x_extension_link_preview_sessions_2026_unique_';

// A secret the surface hands to its own frame (see bindFrame); the page under
// the preview never sees it.
function createFrameSecret() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((value, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  }
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function isPreviewableUrl(url) {
  return typeof url === 'string' && url.length <= 8192 && PREVIEWABLE_URL_PATTERN.test(url);
}

// The domain a rule names for an address: its host without "www.", which
// declarativeNetRequest also matches on every subdomain.
function readUrlDomain(url) {
  if (!isPreviewableUrl(url)) {
    return '';
  }
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || hostname.includes(':') || hostname.includes('[')) {
      return '';
    }
    return hostname.replace(/^www\./, '');
  } catch (error) {
    return '';
  }
}

// A preview's domains: the link's (and the address the frame loads it
// through), the page the frame shows now, and those a refused page was
// allowed for its next try.
function sessionDomains(session) {
  const domains = new Set(session.linkDomains);
  if (session.committedDomain) {
    domains.add(session.committedDomain);
  }
  session.retryDomains.forEach((domain) => domains.add(domain));
  return Array.from(domains).sort();
}

// Session rules accept a tab condition and outlive a suspended worker, which
// finds a tab's rules again by the tab in their condition. Their ids are
// handed out from the ones free: tab ids run past a billion, so an id made
// from one could leave the 32-bit range rules allow.
function findTabRuleIds(rules, tabId) {
  return rules
    .filter((rule) => rule.id !== WORKER_RULE_ID && rule.condition && Array.isArray(rule.condition.tabIds) &&
      rule.condition.tabIds.includes(tabId))
    .map((rule) => rule.id);
}

function allocateRuleIds(rules, count) {
  const used = new Set(rules.map((rule) => rule.id).concat(WORKER_RULE_ID));
  const ids = [];
  for (let id = 1; ids.length < count; id += 1) {
    if (!used.has(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function buildRemoveHeadersRule(id, tabId, domains, headers, responseHeaders) {
  const condition = { tabIds: [tabId], requestDomains: domains.slice(), resourceTypes: ['sub_frame'] };
  if (responseHeaders) {
    condition.responseHeaders = responseHeaders;
  }
  return {
    id,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: headers.map((header) => ({ header, operation: 'remove' }))
    },
    condition
  };
}

// With matchHeaders false (Chrome before 128), one rule drops both headers.
function buildFrameHeaderRules(tabId, ids, domains, matchHeaders = true) {
  if (!matchHeaders) {
    return [buildRemoveHeadersRule(ids[0], tabId, domains, FRAME_BLOCKING_HEADERS)];
  }
  return [
    buildRemoveHeadersRule(ids[0], tabId, domains, ['x-frame-options']),
    buildRemoveHeadersRule(ids[1], tabId, domains, ['content-security-policy'], [FRAME_ANCESTORS_CSP])
  ];
}

function buildWorkerHeaderRule(domains) {
  return {
    id: WORKER_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }]
    },
    condition: {
      tabIds: [NO_TAB_ID],
      requestDomains: domains.slice(),
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
  const fetchUrl = typeof config.fetch === 'function'
    ? config.fetch
    : (typeof fetch === 'function' ? fetch : null);
  // tabId -> { token, url, frameUrl, frameSecret, frameId, linkDomains,
  // committedDomain, retryDomains, retries, lastFrameUrl, capture, ready,
  // state, expiryTimer }, where state is "prepared" (pressed), "opening"
  // (clicked, show not yet answered) or "open" (the surface shows it).
  // frameId is the preview frame's, bound once through frameSecret; only
  // that frame speaks for the preview.
  const sessions = new Map();
  let tokenCounter = 0;
  // Cleared once Chrome refuses a rule that matches on a response header.
  let headerMatching = true;
  // Rule updates read the rules in place first, so they run one at a time.
  let ruleQueue = Promise.resolve();
  // Settles once the previews a suspended worker left are read back.
  let restored = Promise.resolve();

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

  function getSessionStorage() {
    const area = chromeApi && chromeApi.storage && chromeApi.storage.session;
    return area && typeof area.get === 'function' && typeof area.set === 'function' ? area : null;
  }

  function createSession(token, url) {
    const frameUrl = toPreviewFrameUrl(url);
    return {
      token,
      url,
      frameUrl,
      frameSecret: createFrameSecret(),
      frameId: null,
      linkDomains: Array.from(new Set([readUrlDomain(url), readUrlDomain(frameUrl)].filter(Boolean))),
      committedDomain: '',
      retryDomains: [],
      retries: 0,
      lastFrameUrl: frameUrl,
      capture: null,
      ready: null,
      screenshotDelivered: null,
      state: 'prepared',
      expiryTimer: null
    };
  }

  // Only open previews are kept: a press dies with the worker anyway.
  function persistSessions() {
    const area = getSessionStorage();
    if (!area) {
      return;
    }
    const saved = {};
    sessions.forEach((session, tabId) => {
      if (session.state !== 'open') {
        return;
      }
      saved[tabId] = {
        token: session.token,
        url: session.url,
        frameUrl: session.frameUrl,
        frameSecret: session.frameSecret,
        frameId: session.frameId,
        linkDomains: session.linkDomains,
        committedDomain: session.committedDomain,
        retryDomains: session.retryDomains,
        retries: session.retries,
        lastFrameUrl: session.lastFrameUrl
      };
    });
    callback((done) => area.set({ [SESSIONS_STORAGE_KEY]: saved }, done));
  }

  async function restoreSessions() {
    const area = getSessionStorage();
    if (!area) {
      return;
    }
    const result = await callback((done) => area.get([SESSIONS_STORAGE_KEY], done));
    const saved = result && typeof result === 'object' ? result[SESSIONS_STORAGE_KEY] : null;
    if (!saved || typeof saved !== 'object') {
      return;
    }
    Object.keys(saved).forEach((key) => {
      const tabId = Number(key);
      const entry = saved[key];
      if (!Number.isInteger(tabId) || sessions.has(tabId) || !entry || !isPreviewableUrl(entry.url)) {
        return;
      }
      const session = createSession(String(entry.token || ''), entry.url);
      if (typeof entry.frameSecret === 'string' && entry.frameSecret) {
        session.frameSecret = entry.frameSecret;
      }
      session.frameId = Number.isInteger(entry.frameId) ? entry.frameId : null;
      session.committedDomain = typeof entry.committedDomain === 'string' ? entry.committedDomain : '';
      session.retryDomains = Array.isArray(entry.retryDomains)
        ? entry.retryDomains.filter((domain) => typeof domain === 'string' && domain)
        : [];
      session.retries = Number(entry.retries) || 0;
      session.lastFrameUrl = isPreviewableUrl(entry.lastFrameUrl) ? entry.lastFrameUrl : session.frameUrl;
      session.state = 'open';
      sessions.set(tabId, session);
    });
  }

  // Brings the tab's rules, and the workers' rule, in line with the tab's
  // preview as it stands when the update runs.
  function syncRules(tabId) {
    const dnr = getDnr();
    if (!dnr) {
      return Promise.resolve(false);
    }
    const run = ruleQueue.then(() => updateFrameHeaderRules(dnr, tabId));
    ruleQueue = run.catch(() => false);
    return run.then((applied) => {
      persistSessions();
      return applied;
    });
  }

  async function updateFrameHeaderRules(dnr, tabId) {
    const current = typeof dnr.getSessionRules === 'function'
      ? await callback((done) => dnr.getSessionRules(done))
      : null;
    const rules = Array.isArray(current) ? current : [];
    const apply = () => {
      const session = sessions.get(tabId);
      const domains = session ? sessionDomains(session) : [];
      const workerDomains = new Set();
      sessions.forEach((entry) => sessionDomains(entry).forEach((domain) => workerDomains.add(domain)));
      const update = { removeRuleIds: findTabRuleIds(rules, tabId).concat(WORKER_RULE_ID), addRules: [] };
      if (domains.length) {
        update.addRules = buildFrameHeaderRules(tabId, allocateRuleIds(rules, 2), domains, headerMatching);
      }
      if (workerDomains.size) {
        update.addRules.push(buildWorkerHeaderRule(Array.from(workerDomains).sort()));
      }
      return callback((done) => dnr.updateSessionRules(update, done)).then(Boolean);
    };
    const applied = await apply();
    if (!applied && headerMatching && sessions.has(tabId)) {
      headerMatching = false;
      return apply();
    }
    return applied;
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
    const session = createSession(token, url);
    sessions.set(tabId, session);
    // The screenshot goes first: the surface's hidden frame stays out of it
    // either way, but the capture is the slowest step.
    session.capture = captureTab(tab);
    session.ready = Promise.all([syncRules(tabId), injectSurface(tabId)])
      .then(([, injected]) => {
        if (!injected) {
          return false;
        }
        return sendToSurface(tabId, {
          action: 'lumnoLinkPreviewPrewarm',
          token,
          url,
          frameSecret: session.frameSecret
        }).then(Boolean);
      });
    // The surface gets the screenshot as soon as both are ready, to decode
    // it while the button is still down; "show" then carries none.
    session.screenshotDelivered = Promise.all([session.ready, session.capture]).then(([surfaceReady, screenshot]) => (
      surfaceReady && screenshot
        ? sendToSurface(tabId, { action: 'lumnoLinkPreviewScreenshot', token, screenshot }).then(Boolean)
        : false
    ));
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
      frameSecret: session.frameSecret,
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
      persistSessions();
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
    return syncRules(tabId);
  }

  // A press released away from the link: the click that would open the
  // preview never comes, so its rule and hidden window go now.
  function cancel(tabId) {
    const session = sessions.get(tabId);
    if (!session || session.state !== 'prepared') {
      return Promise.resolve(false);
    }
    sendToSurface(tabId, { action: 'lumnoLinkPreviewDiscard', token: session.token });
    return discard(tabId, session.token);
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

  // The preview's session, when the sender is the preview frame itself.
  async function findFrameSession(sender) {
    await restored;
    const tabId = sender && sender.tab && sender.tab.id;
    const session = typeof tabId === 'number' ? sessions.get(tabId) : null;
    if (!session || session.frameId === null || sender.frameId !== session.frameId) {
      return null;
    }
    return { tabId, session };
  }

  // The surface's frame passes on the secret the surface gave it: the frame
  // that sent it is the preview frame from now on. It binds once, and a page
  // in the frame that passed the secret to a frame of its own comes second.
  async function bindFrame(sender, secret) {
    await restored;
    const tabId = sender && sender.tab && sender.tab.id;
    const session = typeof tabId === 'number' ? sessions.get(tabId) : null;
    if (!session || typeof secret !== 'string' || secret !== session.frameSecret ||
        !Number.isInteger(sender.frameId) || sender.frameId <= 0) {
      return false;
    }
    if (session.frameId === null) {
      session.frameId = sender.frameId;
      persistSessions();
    }
    if (session.frameId !== sender.frameId) {
      return false;
    }
    await noteFrameCommitted(sender);
    return true;
  }

  // The preview frame is about to leave for another address: kept so a
  // refusal there can be tried again. Nothing is allowed yet.
  async function noteFrameNavigation(sender, url) {
    const found = await findFrameSession(sender);
    if (found && isPreviewableUrl(url)) {
      found.session.lastFrameUrl = url;
      persistSessions();
    }
    return Boolean(found);
  }

  // A page loaded in the preview frame (the browser names its address). The
  // preview now shows that page's site: domains allowed for an earlier
  // page or try go, so a page the preview went back to cannot frame them.
  async function noteFrameCommitted(sender) {
    const found = await findFrameSession(sender);
    if (!found) {
      return false;
    }
    const { tabId, session } = found;
    const before = sessionDomains(session).join(' ');
    session.committedDomain = readUrlDomain(sender.url);
    session.retryDomains = [];
    if (sessionDomains(session).join(' ') === before) {
      return false;
    }
    return syncRules(tabId);
  }

  // Where an address ends up after its redirects. The body is not read.
  async function resolveFinalUrl(url) {
    if (!fetchUrl) {
      return '';
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimer(() => controller.abort(), RESOLVE_TIMEOUT_MS) : null;
    try {
      const response = await fetchUrl(url, {
        credentials: 'include',
        redirect: 'follow',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      return response && typeof response.url === 'string' ? response.url : '';
    } catch (error) {
      return '';
    } finally {
      clearTimer(timer);
      if (controller) {
        controller.abort();
      }
    }
  }

  // The surface found the frame showing Chrome's error page. If the address
  // the frame went to, or where it redirects, is a domain the preview does
  // not cover yet, that domain is allowed and the frame tries once more.
  async function retryRefusedFrame(tabId, token) {
    await restored;
    const session = sessions.get(tabId);
    if (!session || session.token !== token || session.retries >= MAX_REFUSED_RETRIES) {
      return { retry: false };
    }
    const target = session.lastFrameUrl || session.frameUrl;
    const finalUrl = await resolveFinalUrl(target);
    if (sessions.get(tabId) !== session) {
      return { retry: false };
    }
    const covered = new Set(sessionDomains(session));
    const added = [readUrlDomain(target), readUrlDomain(finalUrl)]
      .filter((domain) => domain && !covered.has(domain));
    if (!added.length) {
      return { retry: false };
    }
    session.retries += 1;
    session.retryDomains = Array.from(new Set(session.retryDomains.concat(added)));
    const applied = await syncRules(tabId);
    return applied && sessions.get(tabId) === session ? { retry: true, url: target } : { retry: false };
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
    return syncRules(tabId);
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
    await restored;
    const dnr = getDnr();
    if (!dnr || typeof dnr.getSessionRules !== 'function') {
      return;
    }
    const rules = await callback((done) => dnr.getSessionRules(done));
    if (!Array.isArray(rules)) {
      return;
    }
    const tabIds = new Set(rules
      .filter((rule) => rule && rule.id !== WORKER_RULE_ID && rule.condition && Array.isArray(rule.condition.tabIds))
      .map((rule) => rule.condition.tabIds[0]));
    sessions.forEach((session, tabId) => tabIds.add(tabId));
    await Promise.all(Array.from(tabIds, (tabId) => verifyOpenPreview(tabId)));
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
    restored = restoreSessions().catch(() => {});
    ruleQueue = restored;
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
    linkPreviewCancel(request, sender, sendResponse) {
      const tab = sender && sender.tab;
      if (tab && typeof tab.id === 'number') {
        cancel(tab.id);
      }
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewClose(request, sender, sendResponse) {
      const tab = sender && sender.tab;
      if (tab && typeof tab.id === 'number') {
        restored.then(() => discard(tab.id, String(request.token || '')));
      }
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewOpenInTab(request, sender, sendResponse) {
      openInTab(sender && sender.tab, request.url).then((opened) => {
        sendResponse({ ok: opened });
      });
      return true;
    },
    linkPreviewFrameBind(request, sender, sendResponse) {
      bindFrame(sender, request.secret).then((bound) => sendResponse({ ok: bound }));
      return true;
    },
    linkPreviewFrameNavigating(request, sender, sendResponse) {
      noteFrameNavigation(sender, request.url).then((noted) => sendResponse({ ok: noted }));
      return true;
    },
    linkPreviewFrameCommitted(request, sender, sendResponse) {
      noteFrameCommitted(sender).then(() => sendResponse({ ok: true }));
      return true;
    },
    linkPreviewFrameRefused(request, sender, sendResponse) {
      const tab = sender && sender.tab;
      if (!tab || typeof tab.id !== 'number' || sender.frameId !== 0) {
        sendResponse({ retry: false });
        return false;
      }
      retryRefusedFrame(tab.id, String(request.token || '')).then(sendResponse);
      return true;
    }
  });

  return Object.freeze({
    prepare,
    open,
    cancel,
    discard,
    openInTab,
    bindFrame,
    noteFrameNavigation,
    noteFrameCommitted,
    retryRefusedFrame,
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
  MAX_REFUSED_RETRIES,
  isPreviewableUrl,
  readUrlDomain,
  buildFrameHeaderRules,
  buildWorkerHeaderRule,
  createLinkPreviewService
};
