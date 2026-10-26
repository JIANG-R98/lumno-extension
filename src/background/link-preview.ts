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
//
// Shift held over a link prepares it earlier still, without the screenshot:
// the page may change before the press, and Chrome takes only two captures
// a second. The press that follows reuses the preparation and adds the
// screenshot.
import * as LumnoMessaging from '../platform/messaging';
import { toPreviewFrameUrl } from '../domain/link-preview-frame-url';
import type { HandlersFor, MessageSender } from './message-router';
import type {
  LinkPreviewOrigin,
  LinkPreviewRetry,
  OkReply,
  PageAction,
  PageReply,
  PageRequest
} from '../domain/messages';
import type { StorageItems } from '../domain/storage-port';

type Rule = chrome.declarativeNetRequest.Rule;
type HeaderInfo = chrome.declarativeNetRequest.HeaderInfo;
type RuleCondition = chrome.declarativeNetRequest.RuleCondition;
type UpdateRuleOptions = chrome.declarativeNetRequest.UpdateRuleOptions;

type LinkPreviewAction =
  | 'linkPreviewPrepare'
  | 'linkPreviewOpen'
  | 'linkPreviewCancel'
  | 'linkPreviewClose'
  | 'linkPreviewOpenInTab'
  | 'linkPreviewFrameBind'
  | 'linkPreviewFrameNavigating'
  | 'linkPreviewFrameCommitted'
  | 'linkPreviewFrameRefused';
type SurfaceAction = Extract<PageAction, `lumnoLinkPreview${string}`>;

// "prepared" (pressed), "opening" (clicked, show not yet answered) or "open"
// (the surface shows it).
type SessionState = 'prepared' | 'opening' | 'open';

// A timer from the injected timer functions; only they read it.
type TimerHandle = unknown;

interface PreviewSession {
  token: string;
  url: string;
  // The address the frame loads the link through.
  frameUrl: string;
  // Handed to the surface's frame, which passes it back to bind itself.
  frameSecret: string;
  // The preview frame, once bound; only that frame speaks for the preview.
  frameId: number | null;
  // The link's domains and those of the address the frame loads it through.
  linkDomains: string[];
  // The site of the page the frame shows now.
  committedDomain: string;
  // Where the frame's loading page was redirected to.
  redirectDomains: string[];
  redirectRequestId: string;
  // Allowed for the next try of a refused page.
  retryDomains: string[];
  retries: number;
  // Where the frame last went, tried again after a refusal.
  lastFrameUrl: string;
  // The screenshot of the page behind the preview, or '' without one; null
  // until a press asks for it.
  capture: Promise<string> | null;
  // Whether the surface is injected and loading the page.
  ready: Promise<boolean> | null;
  screenshotDelivered: Promise<boolean> | null;
  state: SessionState;
  expiryTimer: TimerHandle | null;
}

// What an open preview keeps in session storage across a suspended worker.
type SavedSession = Pick<PreviewSession,
  'token' | 'url' | 'frameUrl' | 'frameSecret' | 'frameId' | 'linkDomains' | 'committedDomain' |
  'redirectDomains' | 'retryDomains' | 'retries' | 'lastFrameUrl'>;

// The fields of a webRequest redirect the service reads.
type FrameRedirect = Pick<chrome.webRequest.OnBeforeRedirectDetails,
  'type' | 'tabId' | 'frameId' | 'requestId' | 'url' | 'redirectUrl'>;

interface PrepareOptions {
  // False for Shift held over the link: no screenshot yet.
  capture?: boolean;
}

interface FrameSession {
  tabId: number;
  session: PreviewSession;
}

interface LinkPreviewServiceOptions {
  chromeApi?: typeof chrome | null;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout?: (timer: TimerHandle) => void;
  fetch?: typeof fetch;
}

interface LinkPreviewService {
  prepare(tab: chrome.tabs.Tab | null | undefined, url: unknown, prepareOptions?: PrepareOptions): PreviewSession | null;
  open(tab: chrome.tabs.Tab | null | undefined, url: unknown, origin: LinkPreviewOrigin | null): Promise<OkReply>;
  cancel(tabId: number): Promise<boolean>;
  discard(tabId: number, token: string): Promise<boolean>;
  openInTab(tab: chrome.tabs.Tab | null | undefined, url: unknown): Promise<boolean>;
  bindFrame(sender: MessageSender | null | undefined, secret: unknown): Promise<boolean>;
  noteFrameNavigation(sender: MessageSender | null | undefined, url: unknown): Promise<boolean>;
  noteFrameCommitted(sender: MessageSender | null | undefined): Promise<boolean>;
  retryRefusedFrame(tabId: number, token: string): Promise<LinkPreviewRetry>;
  handleFrameRedirect(details: FrameRedirect | null | undefined): Promise<boolean>;
  handleTabRemoved(tabId: number): Promise<boolean>;
  handleTabUpdated(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo | null | undefined): Promise<boolean>;
  reconcileRules(): Promise<void>;
  attach(): void;
  messageHandlers: HandlersFor<LinkPreviewAction>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// The surface draws through the overlay bundle's React, injected first.
const UI_FILES = Object.freeze(['build/overlay-islands.js', 'build/link-preview.js']);
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
const FRAME_BLOCKING_HEADERS: readonly string[] = Object.freeze(['x-frame-options', 'content-security-policy']);
const FRAME_ANCESTORS_CSP: Readonly<HeaderInfo> = Object.freeze({ header: 'content-security-policy', values: ['*frame-ancestors*'] });
// Chrome settles a rule with no response header condition when the request
// starts, and one with such a condition when the response arrives. The
// X-Frame-Options rule matches on its own header so that a domain allowed
// while the request is underway (see handleFrameRedirect) still counts.
const FRAME_OPTIONS_HEADER: Readonly<HeaderInfo> = Object.freeze({ header: 'x-frame-options' });
// A site with a service worker answers the frame from the worker, and the
// worker's own request belongs to no tab (tab id -1), so the tab's rule never
// sees it. While previews are open, such requests to the previewed sites'
// domains lose X-Frame-Options alone: a worker may cache what it fetched and
// later serve it to the site's own tabs, where a removed CSP would stay
// removed. A page a worker builds from its cache keeps its headers and is
// still refused (X's posts load through another address for that; see
// link-preview-frame-url.ts).
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
function createFrameSecret(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_value, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  }
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function isPreviewableUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 8192 && PREVIEWABLE_URL_PATTERN.test(url);
}

// The domain a rule names for an address: its host without "www.", which
// declarativeNetRequest also matches on every subdomain.
function readUrlDomain(url: unknown): string {
  if (!isPreviewableUrl(url)) {
    return '';
  }
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || hostname.includes(':') || hostname.includes('[')) {
      return '';
    }
    return hostname.replace(/^www\./, '');
  } catch (_error) {
    return '';
  }
}

// A preview's domains: the link's (and the address the frame loads it
// through), the page the frame shows now, those the frame's loading page was
// redirected to, and those a refused page was allowed for its next try.
function sessionDomains(session: PreviewSession): string[] {
  const domains = new Set(session.linkDomains);
  if (session.committedDomain) {
    domains.add(session.committedDomain);
  }
  session.redirectDomains.forEach((domain) => domains.add(domain));
  session.retryDomains.forEach((domain) => domains.add(domain));
  return Array.from(domains).sort();
}

// The same address apart from its fragment, which never reaches the network.
function isSameAddress(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = '';
    right.hash = '';
    return left.href === right.href;
  } catch (_error) {
    return false;
  }
}

function readDomainList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((domain): domain is string => typeof domain === 'string' && domain !== '')
    : [];
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
  domains: readonly string[],
  headers: readonly string[],
  responseHeaders?: HeaderInfo[]
): Rule {
  const condition: RuleCondition = { tabIds: [tabId], requestDomains: domains.slice(), resourceTypes: ['sub_frame'] };
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
function buildFrameHeaderRules(
  tabId: number,
  ids: readonly number[],
  domains: readonly string[],
  matchHeaders = true
): Rule[] {
  if (!matchHeaders) {
    return [buildRemoveHeadersRule(ids[0], tabId, domains, FRAME_BLOCKING_HEADERS)];
  }
  return [
    buildRemoveHeadersRule(ids[0], tabId, domains, ['x-frame-options'], [FRAME_OPTIONS_HEADER]),
    buildRemoveHeadersRule(ids[1], tabId, domains, ['content-security-policy'], [FRAME_ANCESTORS_CSP])
  ];
}

function buildWorkerHeaderRule(domains: readonly string[]): Rule {
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
  const fetchUrl = typeof config.fetch === 'function'
    ? config.fetch
    : (typeof fetch === 'function' ? fetch : null);
  const sessions = new Map<number, PreviewSession>();
  let tokenCounter = 0;
  // Cleared once Chrome refuses a rule that matches on a response header.
  let headerMatching = true;
  // Rule updates read the rules in place first, so they run one at a time.
  let ruleQueue: Promise<unknown> = Promise.resolve(false);
  // Settles once the previews a suspended worker left are read back.
  let restored: Promise<void> = Promise.resolve();
  // The redirect listener, there only while a preview is.
  let redirectListener: ((details: chrome.webRequest.OnBeforeRedirectDetails) => void) | null = null;

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

  function getSessionStorage(): chrome.storage.StorageArea | null {
    const area = chromeApi && chromeApi.storage && chromeApi.storage.session;
    return area && typeof area.get === 'function' && typeof area.set === 'function' ? area : null;
  }

  function createSession(token: string, url: string): PreviewSession {
    const frameUrl = toPreviewFrameUrl(url);
    return {
      token,
      url,
      frameUrl,
      frameSecret: createFrameSecret(),
      frameId: null,
      linkDomains: Array.from(new Set([readUrlDomain(url), readUrlDomain(frameUrl)].filter(Boolean))),
      committedDomain: '',
      redirectDomains: [],
      redirectRequestId: '',
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
  function persistSessions(): void {
    const area = getSessionStorage();
    if (!area) {
      return;
    }
    const saved: Record<string, SavedSession> = {};
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
        redirectDomains: session.redirectDomains,
        retryDomains: session.retryDomains,
        retries: session.retries,
        lastFrameUrl: session.lastFrameUrl
      };
    });
    void callback<void>((done) => area.set({ [SESSIONS_STORAGE_KEY]: saved }, done));
  }

  async function restoreSessions(): Promise<void> {
    const area = getSessionStorage();
    if (!area) {
      return;
    }
    const result = await callback<StorageItems>((done) => area.get([SESSIONS_STORAGE_KEY], done));
    const saved = isRecord(result) ? result[SESSIONS_STORAGE_KEY] : null;
    if (!isRecord(saved)) {
      return;
    }
    Object.keys(saved).forEach((key) => {
      const tabId = Number(key);
      const entry = saved[key];
      if (!Number.isInteger(tabId) || sessions.has(tabId) || !isRecord(entry) || !isPreviewableUrl(entry.url)) {
        return;
      }
      const session = createSession(String(entry.token || ''), entry.url);
      if (typeof entry.frameSecret === 'string' && entry.frameSecret) {
        session.frameSecret = entry.frameSecret;
      }
      session.frameId = typeof entry.frameId === 'number' && Number.isInteger(entry.frameId) ? entry.frameId : null;
      session.committedDomain = typeof entry.committedDomain === 'string' ? entry.committedDomain : '';
      session.redirectDomains = readDomainList(entry.redirectDomains);
      session.retryDomains = readDomainList(entry.retryDomains);
      session.retries = Number(entry.retries) || 0;
      session.lastFrameUrl = isPreviewableUrl(entry.lastFrameUrl) ? entry.lastFrameUrl : session.frameUrl;
      session.state = 'open';
      sessions.set(tabId, session);
    });
  }

  // Brings the tab's rules, and the workers' rule, in line with the tab's
  // preview as it stands when the update runs.
  function syncRules(tabId: number): Promise<boolean> {
    watchRedirects();
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

  async function updateFrameHeaderRules(dnr: typeof chrome.declarativeNetRequest, tabId: number): Promise<boolean> {
    const current = typeof dnr.getSessionRules === 'function' ? await readRules(dnr) : null;
    const rules = current || [];
    const apply = (): Promise<boolean> => {
      const session = sessions.get(tabId);
      const domains = session ? sessionDomains(session) : [];
      const workerDomains = new Set<string>();
      sessions.forEach((entry) => sessionDomains(entry).forEach((domain) => workerDomains.add(domain)));
      const addRules: Rule[] = domains.length
        ? buildFrameHeaderRules(tabId, allocateRuleIds(rules, 2), domains, headerMatching)
        : [];
      if (workerDomains.size) {
        addRules.push(buildWorkerHeaderRule(Array.from(workerDomains).sort()));
      }
      const update: UpdateRuleOptions = { removeRuleIds: findTabRuleIds(rules, tabId).concat(WORKER_RULE_ID), addRules };
      return callback<void>((done) => dnr.updateSessionRules(update, done)).then(Boolean);
    };
    const applied = await apply();
    if (!applied && headerMatching && sessions.has(tabId)) {
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
        void discard(tabId, session.token);
      }
    }, PREPARED_TTL_MS);
  }

  // A press prepares with the screenshot; Shift held over the link prepares
  // without it (capture: false).
  function prepare(
    tab: chrome.tabs.Tab | null | undefined,
    url: unknown,
    prepareOptions?: PrepareOptions
  ): PreviewSession | null {
    const tabId = tab && tab.id;
    if (!tab || typeof tabId !== 'number' || !isPreviewableUrl(url)) {
      return null;
    }
    const capture = !prepareOptions || prepareOptions.capture !== false;
    const existing = sessions.get(tabId);
    if (existing && existing.url === url && existing.state === 'prepared') {
      if (capture && !existing.capture) {
        existing.capture = captureTab(tab);
        deliverScreenshot(tabId, existing);
      }
      scheduleExpiry(tabId, existing);
      return existing;
    }
    if (existing) {
      stopExpiry(existing);
    }
    tokenCounter += 1;
    const token = `${now().toString(36)}-${tokenCounter}`;
    const session = createSession(token, url);
    sessions.set(tabId, session);
    // The screenshot goes first: the surface's hidden frame stays out of it
    // either way, but the capture is the slowest step.
    if (capture) {
      session.capture = captureTab(tab);
    }
    session.ready = Promise.all([syncRules(tabId), injectSurface(tabId)])
      .then(([, injected]) => {
        if (!injected) {
          return false;
        }
        return sendToSurface<'lumnoLinkPreviewPrewarm'>(tabId, {
          action: 'lumnoLinkPreviewPrewarm',
          token,
          url,
          frameSecret: session.frameSecret
        }).then(Boolean);
      });
    if (session.capture) {
      deliverScreenshot(tabId, session);
    }
    scheduleExpiry(tabId, session);
    return session;
  }

  // The surface gets the screenshot as soon as both are ready, to decode it
  // while the button is still down; "show" then carries none.
  function deliverScreenshot(tabId: number, session: PreviewSession): void {
    const token = session.token;
    session.screenshotDelivered = Promise.all([session.ready, session.capture]).then(([surfaceReady, screenshot]) => (
      surfaceReady && screenshot && sessions.get(tabId) === session
        ? sendToSurface<'lumnoLinkPreviewScreenshot'>(tabId, { action: 'lumnoLinkPreviewScreenshot', token, screenshot })
          .then(Boolean)
        : false
    ));
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
      frameSecret: session.frameSecret,
      screenshot: screenshotDelivered ? '' : (screenshot || ''),
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
      persistSessions();
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
    return syncRules(tabId);
  }

  // A press released away from the link: the click that would open the
  // preview never comes, so its rule and hidden window go now.
  function cancel(tabId: number): Promise<boolean> {
    const session = sessions.get(tabId);
    if (!session || session.state !== 'prepared') {
      return Promise.resolve(false);
    }
    void sendToSurface<'lumnoLinkPreviewDiscard'>(tabId, { action: 'lumnoLinkPreviewDiscard', token: session.token });
    return discard(tabId, session.token);
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

  function getSenderTabId(sender: MessageSender | null | undefined): number | null {
    const tabId = sender && sender.tab ? sender.tab.id : undefined;
    return typeof tabId === 'number' ? tabId : null;
  }

  // The preview's session, when the sender is the preview frame itself.
  async function findFrameSession(sender: MessageSender | null | undefined): Promise<FrameSession | null> {
    await restored;
    const tabId = getSenderTabId(sender);
    const session = tabId !== null ? sessions.get(tabId) : undefined;
    if (tabId === null || !sender || !session || session.frameId === null || sender.frameId !== session.frameId) {
      return null;
    }
    return { tabId, session };
  }

  // The surface's frame passes on the secret the surface gave it: the frame
  // that sent it is the preview frame from now on. It binds once, and a page
  // in the frame that passed the secret to a frame of its own comes second.
  async function bindFrame(sender: MessageSender | null | undefined, secret: unknown): Promise<boolean> {
    await restored;
    const tabId = getSenderTabId(sender);
    const session = tabId !== null ? sessions.get(tabId) : undefined;
    const frameId = sender ? sender.frameId : undefined;
    if (!session || typeof secret !== 'string' || secret !== session.frameSecret ||
        typeof frameId !== 'number' || !Number.isInteger(frameId) || frameId <= 0) {
      return false;
    }
    if (session.frameId === null) {
      session.frameId = frameId;
      persistSessions();
    }
    if (session.frameId !== frameId) {
      return false;
    }
    await noteFrameCommitted(sender);
    return true;
  }

  // The preview frame is about to leave for another address: kept so a
  // refusal there can be tried again. Nothing is allowed yet.
  async function noteFrameNavigation(sender: MessageSender | null | undefined, url: unknown): Promise<boolean> {
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
  async function noteFrameCommitted(sender: MessageSender | null | undefined): Promise<boolean> {
    const found = await findFrameSession(sender);
    if (!found) {
      return false;
    }
    const { tabId, session } = found;
    const before = sessionDomains(session).join(' ');
    session.committedDomain = readUrlDomain(sender && sender.url);
    session.redirectDomains = [];
    session.redirectRequestId = '';
    session.retryDomains = [];
    if (sessionDomains(session).join(' ') === before) {
      return false;
    }
    return syncRules(tabId);
  }

  // Where an address ends up after its redirects. The body is not read.
  async function resolveFinalUrl(url: string): Promise<string> {
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
    } catch (_error) {
      return '';
    } finally {
      if (timer !== null) {
        clearTimer(timer);
      }
      if (controller) {
        controller.abort();
      }
    }
  }

  // The surface found the frame showing Chrome's error page. If the address
  // the frame went to, or where it redirects, is a domain the preview does
  // not cover yet, that domain is allowed and the frame tries once more.
  async function retryRefusedFrame(tabId: number, token: string): Promise<LinkPreviewRetry> {
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
    // A domain allowed on a redirect may have come too late for the load it
    // was meant for, so it still counts as untried here.
    const covered = new Set(session.linkDomains.concat(session.committedDomain, session.retryDomains));
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

  // The preview frame's loading page is redirected: the domain it goes to is
  // allowed at once, while the browser asks for the next address, so a link
  // that passes through another site (a search engine's result, a short
  // link) loads in one go instead of being refused and tried again. The
  // request is the preview frame's once it is bound; before that, the first
  // load is the one that asked for the preview's own address, followed
  // through its redirects.
  function handleFrameRedirect(details: FrameRedirect | null | undefined): Promise<boolean> {
    if (!details || details.type !== 'sub_frame' || !Number.isInteger(details.frameId) || details.frameId <= 0) {
      return Promise.resolve(false);
    }
    const tabId = details.tabId;
    const session = sessions.get(tabId);
    if (!session) {
      return Promise.resolve(false);
    }
    const ownFrame = session.frameId !== null
      ? details.frameId === session.frameId
      : (Boolean(session.redirectRequestId) && details.requestId === session.redirectRequestId) ||
        isSameAddress(details.url, session.lastFrameUrl || session.frameUrl);
    if (!ownFrame) {
      return Promise.resolve(false);
    }
    session.redirectRequestId = String(details.requestId || '');
    const domain = readUrlDomain(details.redirectUrl);
    if (!domain || sessionDomains(session).includes(domain)) {
      return Promise.resolve(false);
    }
    session.redirectDomains = session.redirectDomains.concat(domain);
    return syncRules(tabId);
  }

  function watchRedirects(): void {
    const event = chromeApi && chromeApi.webRequest && chromeApi.webRequest.onBeforeRedirect;
    if (!event || typeof event.addListener !== 'function') {
      return;
    }
    if (sessions.size && !redirectListener) {
      const listener = (details: chrome.webRequest.OnBeforeRedirectDetails): void => {
        void handleFrameRedirect(details);
      };
      redirectListener = listener;
      event.addListener(listener, { urls: ['http://*/*', 'https://*/*'], types: ['sub_frame'] });
    } else if (!sessions.size && redirectListener) {
      event.removeListener(redirectListener);
      redirectListener = null;
    }
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
    return syncRules(tabId);
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
    await restored;
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
    sessions.forEach((_session, tabId) => tabIds.add(tabId));
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
    restored = restoreSessions().catch(() => {}).then(watchRedirects);
    ruleQueue = restored;
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
      prepare(sender && sender.tab, request.url, { capture: request.hover !== true });
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
    linkPreviewCancel(_request, sender, sendResponse) {
      const tabId = getSenderTabId(sender);
      if (tabId !== null) {
        void cancel(tabId);
      }
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewClose(request, sender, sendResponse) {
      const tabId = getSenderTabId(sender);
      if (tabId !== null) {
        void restored.then(() => discard(tabId, String(request.token || '')));
      }
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewOpenInTab(request, sender, sendResponse) {
      void openInTab(sender && sender.tab, request.url).then((opened) => {
        sendResponse({ ok: opened });
      });
      return true;
    },
    linkPreviewFrameBind(request, sender, sendResponse) {
      void bindFrame(sender, request.secret).then((bound) => sendResponse({ ok: bound }));
      return true;
    },
    linkPreviewFrameNavigating(request, sender, sendResponse) {
      void noteFrameNavigation(sender, request.url).then((noted) => sendResponse({ ok: noted }));
      return true;
    },
    linkPreviewFrameCommitted(_request, sender, sendResponse) {
      void noteFrameCommitted(sender).then(() => sendResponse({ ok: true }));
      return true;
    },
    linkPreviewFrameRefused(request, sender, sendResponse) {
      const tabId = getSenderTabId(sender);
      if (tabId === null || !sender || sender.frameId !== 0) {
        sendResponse({ retry: false });
        return false;
      }
      void retryRefusedFrame(tabId, String(request.token || '')).then(sendResponse);
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
    handleFrameRedirect,
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
