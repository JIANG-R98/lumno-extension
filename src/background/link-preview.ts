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
import * as LumnoMessaging from '../platform/messaging';
import type { HandlersFor, MessageSender } from './message-router';
import type { LinkPreviewOrigin, OkReply, PageAction, PageReply, PageRequest } from '../domain/messages';

type Rule = chrome.declarativeNetRequest.Rule;
type HeaderInfo = chrome.declarativeNetRequest.HeaderInfo;
type RuleCondition = chrome.declarativeNetRequest.RuleCondition;
type UpdateRuleOptions = chrome.declarativeNetRequest.UpdateRuleOptions;

type LinkPreviewAction = 'linkPreviewPrepare' | 'linkPreviewOpen' | 'linkPreviewClose' | 'linkPreviewOpenInTab';
type SurfaceAction = Extract<PageAction, `lumnoLinkPreview${string}`>;

// "prepared" (pressed), "opening" (clicked, show not yet answered) or "open"
// (the surface shows it).
type SessionState = 'prepared' | 'opening' | 'open';

// A timer from the injected timer functions; only they read it.
type TimerHandle = unknown;

interface PreviewSession {
  token: string;
  url: string;
  // The screenshot of the page behind the preview, or '' without one.
  capture: Promise<string>;
  // Whether the surface is injected and loading the page.
  ready: Promise<boolean>;
  screenshotDelivered: Promise<boolean>;
  state: SessionState;
  expiryTimer: TimerHandle | null;
}

interface LinkPreviewServiceOptions {
  chromeApi?: typeof chrome | null;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout?: (timer: TimerHandle) => void;
}

interface LinkPreviewService {
  prepare(tab: chrome.tabs.Tab | null | undefined, url: unknown): PreviewSession | null;
  open(tab: chrome.tabs.Tab | null | undefined, url: unknown, origin: LinkPreviewOrigin | null): Promise<OkReply>;
  discard(tabId: number, token: string): Promise<boolean>;
  openInTab(tab: chrome.tabs.Tab | null | undefined, url: unknown): Promise<boolean>;
  handleTabRemoved(tabId: number): Promise<boolean>;
  handleTabUpdated(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo | null | undefined): Promise<boolean>;
  reconcileRules(): Promise<void>;
  attach(): void;
  messageHandlers: HandlersFor<LinkPreviewAction>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

const UI_FILES = Object.freeze(['build/link-preview.js']);
// X-Frame-Options and CSP frame-ancestors are the two ways a page refuses to
// be framed (a page that sends both is judged by frame-ancestors). While a
// tab's preview is open, its subframes lose X-Frame-Options, and lose their
// CSP only where it has frame-ancestors: declarativeNetRequest drops a whole
// header, never part of one, and the rest of a CSP (the limits on script and
// style that guard against injected script) is worth keeping. Chrome before
// 128 cannot match on a response header; there the CSP always goes.
const FRAME_BLOCKING_HEADERS: readonly string[] = Object.freeze(['x-frame-options', 'content-security-policy']);
const FRAME_ANCESTORS_CSP: Readonly<HeaderInfo> = Object.freeze({ header: 'content-security-policy', values: ['*frame-ancestors*'] });
// A site with a service worker answers the frame from the worker, and the
// worker's own request belongs to no tab (tab id -1), so the tab's rule never
// sees it. While any preview is open, such requests lose X-Frame-Options
// alone: a worker may cache what it fetched and later serve it to the site's
// own tabs, where a removed CSP would stay removed. A page a worker builds
// from its cache keeps its headers and is still refused (X's posts load
// through another address for that; see link-preview-frame-url.ts).
const WORKER_RULE_ID = 1;
const NO_TAB_ID = -1;
// A press the page kept for itself (it handled the click) never opens; its
// rule and screenshot are dropped after this long.
const PREPARED_TTL_MS = 4000;
const CAPTURE_JPEG_QUALITY = 82;
const PREVIEWABLE_URL_PATTERN = /^https?:\/\//i;

function isPreviewableUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 8192 && PREVIEWABLE_URL_PATTERN.test(url);
}

// Session rules accept a tab condition and outlive a suspended worker, which
// finds a tab's rules again by the tab in their condition. Their ids are
// handed out from the ones free: tab ids run past a billion, so an id made
// from one could leave the 32-bit range rules allow.
function findTabRuleIds(rules: readonly Rule[], tabId: number): number[] {
  return rules
    .filter((rule) => rule.id !== WORKER_RULE_ID && rule.condition && Array.isArray(rule.condition.tabIds) &&
      rule.condition.tabIds.includes(tabId))
    .map((rule) => rule.id);
}

function allocateRuleIds(rules: readonly Rule[], count: number): number[] {
  const used = new Set(rules.map((rule) => rule.id).concat(WORKER_RULE_ID));
  const ids: number[] = [];
  for (let id = 1; ids.length < count; id += 1) {
    if (!used.has(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function buildRemoveHeadersRule(
  id: number,
  tabId: number,
  headers: readonly string[],
  responseHeaders?: HeaderInfo[]
): Rule {
  const condition: RuleCondition = { tabIds: [tabId], resourceTypes: ['sub_frame'] };
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
function buildFrameHeaderRules(tabId: number, ids: readonly number[], matchHeaders = true): Rule[] {
  if (!matchHeaders) {
    return [buildRemoveHeadersRule(ids[0], tabId, FRAME_BLOCKING_HEADERS)];
  }
  return [
    buildRemoveHeadersRule(ids[0], tabId, ['x-frame-options']),
    buildRemoveHeadersRule(ids[1], tabId, ['content-security-policy'], [FRAME_ANCESTORS_CSP])
  ];
}

function buildWorkerHeaderRule(): Rule {
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

function createLinkPreviewService(options?: LinkPreviewServiceOptions | null): Readonly<LinkPreviewService> {
  const config = options || {};
  const chromeApi = config.chromeApi || null;
  const now = typeof config.now === 'function' ? config.now : () => Date.now();
  const setTimer = config.setTimeout || ((callback: () => void, delayMs: number): TimerHandle => setTimeout(callback, delayMs));
  const clearTimer = config.clearTimeout || ((timer: TimerHandle): void => {
    if (typeof timer === 'number') {
      clearTimeout(timer);
    }
  });
  const sessions = new Map<number, PreviewSession>();
  let tokenCounter = 0;
  // Cleared once Chrome refuses a rule that matches on a response header.
  let headerMatching = true;
  // Rule updates read the rules in place first, so they run one at a time.
  let ruleQueue: Promise<boolean> = Promise.resolve(false);

  function readLastError(): chrome.runtime.LastError | null | undefined {
    return chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
  }

  // Runs a callback-style extension call. Resolves with what it passed back,
  // true for a call that passes nothing, or null when it failed.
  function callback<T>(fn: (done: (result?: T) => void) => void): Promise<T | true | null> {
    return new Promise((resolve) => {
      try {
        fn((result) => {
          resolve(readLastError() ? null : (result === undefined ? true : result));
        });
      } catch (_error) {
        resolve(null);
      }
    });
  }

  function readRules(dnr: typeof chrome.declarativeNetRequest): Promise<Rule[] | null> {
    return callback<Rule[]>((done) => dnr.getSessionRules(done))
      .then((rules) => (Array.isArray(rules) ? rules : null));
  }

  function getDnr(): typeof chrome.declarativeNetRequest | null {
    const dnr = chromeApi && chromeApi.declarativeNetRequest;
    return dnr && typeof dnr.updateSessionRules === 'function' ? dnr : null;
  }

  function setFrameHeaderRule(tabId: number, enabled: boolean): Promise<boolean> {
    const dnr = getDnr();
    if (!dnr) {
      return Promise.resolve(false);
    }
    const run = ruleQueue.then(() => updateFrameHeaderRules(dnr, tabId, enabled));
    ruleQueue = run.catch(() => false);
    return run;
  }

  async function updateFrameHeaderRules(
    dnr: typeof chrome.declarativeNetRequest,
    tabId: number,
    enabled: boolean
  ): Promise<boolean> {
    const current = typeof dnr.getSessionRules === 'function' ? await readRules(dnr) : null;
    const rules = current || [];
    const apply = (): Promise<boolean> => {
      const removeRuleIds = findTabRuleIds(rules, tabId);
      const update: UpdateRuleOptions = { removeRuleIds };
      if (enabled) {
        removeRuleIds.push(WORKER_RULE_ID);
        const ids = allocateRuleIds(rules, 2);
        update.addRules = buildFrameHeaderRules(tabId, ids, headerMatching).concat(buildWorkerHeaderRule());
      } else if (sessions.size === 0) {
        // The last preview is gone; the workers' requests keep their headers.
        removeRuleIds.push(WORKER_RULE_ID);
      }
      return callback<void>((done) => dnr.updateSessionRules(update, done)).then(Boolean);
    };
    const applied = await apply();
    if (!applied && enabled && headerMatching) {
      headerMatching = false;
      return apply();
    }
    return applied;
  }

  function captureTab(tab: chrome.tabs.Tab): Promise<string> {
    const tabs = chromeApi && chromeApi.tabs;
    const windowId = tab.windowId;
    if (!tabs || typeof tabs.captureVisibleTab !== 'function' || typeof windowId !== 'number') {
      return Promise.resolve('');
    }
    return callback<string>((done) => tabs.captureVisibleTab(windowId, {
      format: 'jpeg',
      quality: CAPTURE_JPEG_QUALITY
    }, done)).then((dataUrl) => (typeof dataUrl === 'string' ? dataUrl : ''));
  }

  function injectSurface(tabId: number): Promise<boolean> {
    const scripting = chromeApi && chromeApi.scripting;
    if (!scripting || typeof scripting.executeScript !== 'function') {
      return Promise.resolve(false);
    }
    return callback<unknown>((done) => scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: UI_FILES.slice()
    }, done)).then(Boolean);
  }

  function sendToSurface<A extends SurfaceAction>(tabId: number, message: PageRequest<A>): Promise<PageReply<A> | null> {
    const tabs = chromeApi && chromeApi.tabs;
    if (!tabs || typeof tabs.sendMessage !== 'function') {
      return Promise.resolve(null);
    }
    // The surface's own answer: a frame without the surface answers nothing
    // (undefined), which must not read as success.
    return new Promise((resolve) => {
      try {
        LumnoMessaging.sendTabMessage<A>(tabs, tabId, message, (response) => {
          resolve(readLastError() || response === undefined ? null : response);
        }, { frameId: 0 });
      } catch (_error) {
        resolve(null);
      }
    });
  }

  function stopExpiry(session: PreviewSession): void {
    if (session.expiryTimer !== null) {
      clearTimer(session.expiryTimer);
      session.expiryTimer = null;
    }
  }

  function scheduleExpiry(tabId: number, session: PreviewSession): void {
    stopExpiry(session);
    session.expiryTimer = setTimer(() => {
      if (sessions.get(tabId) === session && session.state === 'prepared') {
        discard(tabId, session.token);
      }
    }, PREPARED_TTL_MS);
  }

  function prepare(tab: chrome.tabs.Tab | null | undefined, url: unknown): PreviewSession | null {
    const tabId = tab && tab.id;
    if (!tab || typeof tabId !== 'number' || !isPreviewableUrl(url)) {
      return null;
    }
    const existing = sessions.get(tabId);
    if (existing && existing.url === url && existing.state === 'prepared') {
      scheduleExpiry(tabId, existing);
      return existing;
    }
    if (existing) {
      stopExpiry(existing);
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
        return sendToSurface<'lumnoLinkPreviewPrewarm'>(tabId, { action: 'lumnoLinkPreviewPrewarm', token, url })
          .then(Boolean);
      });
    // The surface gets the screenshot as soon as both are ready, to decode
    // it while the button is still down; "show" then carries none.
    const screenshotDelivered = Promise.all([ready, capture]).then(([surfaceReady, screenshot]) => (
      surfaceReady && screenshot
        ? sendToSurface<'lumnoLinkPreviewScreenshot'>(tabId, { action: 'lumnoLinkPreviewScreenshot', token, screenshot })
          .then(Boolean)
        : false
    ));
    const session: PreviewSession = { token, url, capture, ready, screenshotDelivered, state: 'prepared', expiryTimer: null };
    sessions.set(tabId, session);
    scheduleExpiry(tabId, session);
    return session;
  }

  async function open(
    tab: chrome.tabs.Tab | null | undefined,
    url: unknown,
    origin: LinkPreviewOrigin | null
  ): Promise<OkReply> {
    const session = prepare(tab, url);
    const tabId = tab && tab.id;
    if (!session || typeof tabId !== 'number') {
      return { ok: false, reason: 'not-previewable' };
    }
    session.state = 'opening';
    stopExpiry(session);
    const [ready, screenshot, screenshotDelivered] = await Promise.all([
      session.ready,
      session.capture,
      session.screenshotDelivered
    ]);
    if (sessions.get(tabId) !== session) {
      return { ok: false, reason: 'superseded' };
    }
    if (!ready) {
      // Nothing reached the page (the page refuses scripts, or it went
      // away): the link can still open in a tab.
      void discard(tabId, session.token);
      return { ok: false, reason: 'surface-unavailable' };
    }
    const shown = await sendToSurface<'lumnoLinkPreviewShow'>(tabId, {
      action: 'lumnoLinkPreviewShow',
      token: session.token,
      url: session.url,
      screenshot: screenshotDelivered ? '' : screenshot,
      origin: origin || null
    });
    if (!shown) {
      // The surface was asked to show and may be on screen; it moves the
      // link to a tab itself when it cannot show it, so nothing opens here.
      void discard(tabId, session.token);
      return { ok: false, reason: 'show-failed' };
    }
    if (sessions.get(tabId) === session) {
      session.state = 'open';
    }
    return { ok: true };
  }

  // Drops the tab's preview. A token that no longer names the tab's
  // preview is a late close from one already replaced; it is ignored. With
  // no session known (the worker slept while the preview was open), the
  // rule is removed anyway.
  function discard(tabId: number, token: string): Promise<boolean> {
    const session = sessions.get(tabId);
    if (session && token && session.token !== token) {
      return Promise.resolve(false);
    }
    if (session) {
      stopExpiry(session);
      sessions.delete(tabId);
    }
    return setFrameHeaderRule(tabId, false);
  }

  function openInTab(tab: chrome.tabs.Tab | null | undefined, url: unknown): Promise<boolean> {
    const tabs = chromeApi && chromeApi.tabs;
    if (!tabs || typeof tabs.create !== 'function' || !isPreviewableUrl(url)) {
      return Promise.resolve(false);
    }
    const properties: chrome.tabs.CreateProperties = { url, active: true };
    if (tab && typeof tab.index === 'number') {
      properties.index = tab.index + 1;
    }
    if (tab && typeof tab.id === 'number') {
      properties.openerTabId = tab.id;
    }
    if (tab && typeof tab.windowId === 'number') {
      properties.windowId = tab.windowId;
    }
    return callback<chrome.tabs.Tab>((done) => tabs.create(properties, done)).then(Boolean);
  }

  // The surface lives in the tab's top document, so a navigation of the tab
  // may have taken it away without a close. Asking it settles that: no
  // answer (no surface) or another preview's token drops the rule.
  function verifyOpenPreview(tabId: number): Promise<boolean> {
    return sendToSurface<'lumnoLinkPreviewPing'>(tabId, { action: 'lumnoLinkPreviewPing' }).then((response) => {
      const surfaceToken = response && typeof response.token === 'string' ? response.token : '';
      const session = sessions.get(tabId);
      if (!surfaceToken || (session && session.token !== surfaceToken)) {
        return discard(tabId, '');
      }
      return false;
    });
  }

  function handleTabRemoved(tabId: number): Promise<boolean> {
    const session = sessions.get(tabId);
    if (session) {
      stopExpiry(session);
      sessions.delete(tabId);
    }
    return setFrameHeaderRule(tabId, false);
  }

  // A navigation starts ("loading") while the old document still answers,
  // so the check runs again when it finishes ("complete"). Only an open
  // preview is checked: the preview's own frame loading can report the tab
  // as loading while the press is still on its way to the surface.
  function handleTabUpdated(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo | null | undefined): Promise<boolean> {
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
  async function reconcileRules(): Promise<void> {
    const dnr = getDnr();
    if (!dnr || typeof dnr.getSessionRules !== 'function') {
      return;
    }
    const rules = await readRules(dnr);
    if (!rules) {
      return;
    }
    const tabIds = new Set<number>();
    rules.forEach((rule) => {
      const ruleTabIds = rule && rule.id !== WORKER_RULE_ID && rule.condition ? rule.condition.tabIds : undefined;
      if (Array.isArray(ruleTabIds) && typeof ruleTabIds[0] === 'number') {
        tabIds.add(ruleTabIds[0]);
      }
    });
    await Promise.all(Array.from(tabIds, (tabId) => verifyOpenPreview(tabId)));
    // The workers' rule outlives no preview.
    const left = await readRules(dnr);
    if (left && left.length === 1 && left[0].id === WORKER_RULE_ID) {
      await callback<void>((done) => dnr.updateSessionRules({ removeRuleIds: [WORKER_RULE_ID] }, done));
    }
  }

  function attach(): void {
    const tabs = chromeApi && chromeApi.tabs;
    if (tabs && tabs.onRemoved && typeof tabs.onRemoved.addListener === 'function') {
      tabs.onRemoved.addListener((tabId) => {
        if (sessions.has(tabId)) {
          void handleTabRemoved(tabId);
        }
      });
    }
    if (tabs && tabs.onUpdated && typeof tabs.onUpdated.addListener === 'function') {
      tabs.onUpdated.addListener((tabId, changeInfo) => {
        void handleTabUpdated(tabId, changeInfo);
      });
    }
    void reconcileRules();
  }

  function readOrigin(origin: unknown, sender: MessageSender): LinkPreviewOrigin | null {
    // Click coordinates only mean something in the top frame's viewport.
    if (!sender || sender.frameId !== 0 || !isRecord(origin)) {
      return null;
    }
    const x = Number(origin.x);
    const y = Number(origin.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  const messageHandlers: HandlersFor<LinkPreviewAction> = Object.freeze({
    linkPreviewPrepare(request, sender, sendResponse) {
      prepare(sender && sender.tab, request.url);
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewOpen(request, sender, sendResponse) {
      const tab = sender && sender.tab;
      void open(tab, request.url, readOrigin(request.origin, sender)).then((result) => {
        if (result.reason === 'surface-unavailable') {
          // The page has no preview to show it in: open the link in a tab,
          // as the click would have without the preview.
          void openInTab(tab, request.url);
        }
        sendResponse(result);
      });
      return true;
    },
    linkPreviewClose(request, sender, sendResponse) {
      const tab = sender && sender.tab;
      if (tab && typeof tab.id === 'number') {
        void discard(tab.id, String(request.token || ''));
      }
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewOpenInTab(request, sender, sendResponse) {
      void openInTab(sender && sender.tab, request.url).then((opened) => {
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
  buildFrameHeaderRules,
  buildWorkerHeaderRule,
  createLinkPreviewService
};
