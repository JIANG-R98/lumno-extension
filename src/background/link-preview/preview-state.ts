// What the link preview service works with, and the state it keeps, each
// part with its owner: the preview of each tab (kept across worker restarts
// while open), the header rules that let the previewed site be framed,
// and the redirect listener that follows a preview's frame.
import { toPreviewFrameUrl } from '../../domain/link-preview-frame-url';
import { linkPreviewSessions } from '../../domain/settings/features';
import type { SettingsStore } from '../../platform/settings-store';
import { WORKER_RULE_ID } from './constants';
import {
  allocateRuleIds,
  buildFrameHeaderRules,
  buildWorkerHeaderRule,
  createFrameSecret,
  findTabRuleIds,
  isPreviewableUrl,
  isRecord,
  readDomainList,
  readUrlDomain,
  sessionDomains
} from './frame-rules';
import type { PreviewSession, Rule, SavedSession, TimerHandle, UpdateRuleOptions } from './types';

interface LinkPreviewPorts {
  chromeApi: typeof chrome | null;
  // Where open previews are kept while the worker sleeps.
  settingsStore: SettingsStore | null;
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer: (timer: TimerHandle) => void;
  fetchUrl: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null;
}

// Runs an extension call that answers through a callback; resolves with
// what it passed back, true for a call that passes nothing, or null when it
// failed.
type CallbackRunner = <T>(fn: (done: (result?: T) => void) => void) => Promise<T | true | null>;

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

function toSavedSession(session: PreviewSession): SavedSession {
  return {
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
}

function readSavedSession(entry: Record<string, unknown> & { url: string }): PreviewSession {
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
  return session;
}

// The preview of each tab, from the press that prepares it until it closes.
class PreviewSessions {
  // Settles once the previews kept from before the worker slept are back.
  restored: Promise<void> = Promise.resolve();
  private readonly byTab = new Map<number, PreviewSession>();
  private tokenCounter = 0;
  private readonly settingsStore: SettingsStore | null;

  constructor(settingsStore: SettingsStore | null) {
    this.settingsStore = settingsStore;
  }

  get size(): number {
    return this.byTab.size;
  }

  get(tabId: number): PreviewSession | undefined {
    return this.byTab.get(tabId);
  }

  has(tabId: number): boolean {
    return this.byTab.has(tabId);
  }

  set(tabId: number, session: PreviewSession): void {
    this.byTab.set(tabId, session);
  }

  delete(tabId: number): void {
    this.byTab.delete(tabId);
  }

  forEach(fn: (session: PreviewSession, tabId: number) => void): void {
    this.byTab.forEach(fn);
  }

  nextToken(now: number): string {
    this.tokenCounter += 1;
    return `${now.toString(36)}-${this.tokenCounter}`;
  }

  // Only open previews are kept: a press dies with the worker anyway.
  persist(): void {
    if (!this.settingsStore) {
      return;
    }
    const saved: Record<string, SavedSession> = {};
    this.byTab.forEach((session, tabId) => {
      if (session.state === 'open') {
        saved[tabId] = toSavedSession(session);
      }
    });
    void this.settingsStore.set(linkPreviewSessions, saved).catch(() => {});
  }

  async restore(): Promise<void> {
    const store = this.settingsStore;
    if (!store) {
      return;
    }
    await store.ready;
    const saved = store.getStored(linkPreviewSessions);
    if (!isRecord(saved)) {
      return;
    }
    Object.keys(saved).forEach((key) => {
      const tabId = Number(key);
      const entry = saved[key];
      if (Number.isInteger(tabId) && !this.byTab.has(tabId) && isRecord(entry) && isPreviewableUrl(entry.url)) {
        this.byTab.set(tabId, readSavedSession({ ...entry, url: entry.url }));
      }
    });
  }
}

// The session rules that let each tab's preview frame its site, updated
// one at a time. Header matching narrows a rule to responses that refuse
// framing; a browser without it gets rules without it.
class FrameHeaderRules {
  private headerMatching = true;
  private queue: Promise<unknown> = Promise.resolve(false);
  private readonly sessions: PreviewSessions;
  private readonly call: CallbackRunner;

  constructor(sessions: PreviewSessions, call: CallbackRunner) {
    this.sessions = sessions;
    this.call = call;
  }

  // Later updates wait for this first.
  waitFor(ready: Promise<unknown>): void {
    this.queue = ready;
  }

  // Brings the tab's rules, and the workers' rule, in line with the tab's
  // preview as it stands when the update runs.
  sync(dnr: typeof chrome.declarativeNetRequest, tabId: number): Promise<boolean> {
    const run = this.queue.then(() => this.update(dnr, tabId));
    this.queue = run.catch(() => false);
    return run;
  }

  private async update(dnr: typeof chrome.declarativeNetRequest, tabId: number): Promise<boolean> {
    const current = typeof dnr.getSessionRules === 'function'
      ? await this.call<Rule[]>((done) => dnr.getSessionRules(done)).then((rules) => (Array.isArray(rules) ? rules : null))
      : null;
    const rules = current || [];
    const applied = await this.apply(dnr, rules, tabId);
    if (!applied && this.headerMatching && this.sessions.has(tabId)) {
      this.headerMatching = false;
      return this.apply(dnr, rules, tabId);
    }
    return applied;
  }

  private apply(dnr: typeof chrome.declarativeNetRequest, rules: Rule[], tabId: number): Promise<boolean> {
    const session = this.sessions.get(tabId);
    const domains = session ? sessionDomains(session) : [];
    const workerDomains = new Set<string>();
    this.sessions.forEach((entry) => sessionDomains(entry).forEach((domain) => workerDomains.add(domain)));
    const addRules: Rule[] = domains.length
      ? buildFrameHeaderRules(tabId, allocateRuleIds(rules, 2), domains, this.headerMatching)
      : [];
    if (workerDomains.size) {
      addRules.push(buildWorkerHeaderRule(Array.from(workerDomains).sort()));
    }
    const update: UpdateRuleOptions = { removeRuleIds: findTabRuleIds(rules, tabId).concat(WORKER_RULE_ID), addRules };
    return this.call<void>((done) => dnr.updateSessionRules(update, done)).then(Boolean);
  }
}

// Follows the redirects of preview frames while any preview is up.
class RedirectWatch {
  private listener: ((details: chrome.webRequest.OnBeforeRedirectDetails) => void) | null = null;
  private readonly chromeApi: typeof chrome | null;
  private readonly onRedirect: (details: chrome.webRequest.OnBeforeRedirectDetails) => void;

  constructor(chromeApi: typeof chrome | null, onRedirect: (details: chrome.webRequest.OnBeforeRedirectDetails) => void) {
    this.chromeApi = chromeApi;
    this.onRedirect = onRedirect;
  }

  update(active: boolean): void {
    const event = this.chromeApi && this.chromeApi.webRequest && this.chromeApi.webRequest.onBeforeRedirect;
    if (!event || typeof event.addListener !== 'function') {
      return;
    }
    if (active && !this.listener) {
      const listener = (details: chrome.webRequest.OnBeforeRedirectDetails): void => this.onRedirect(details);
      this.listener = listener;
      event.addListener(listener, { urls: ['http://*/*', 'https://*/*'], types: ['sub_frame'] });
    } else if (!active && this.listener) {
      event.removeListener(this.listener);
      this.listener = null;
    }
  }
}

interface LinkPreview {
  readonly ports: LinkPreviewPorts;
  readonly sessions: PreviewSessions;
  readonly rules: FrameHeaderRules;
  readonly redirects: RedirectWatch;
}

export type { CallbackRunner, LinkPreview, LinkPreviewPorts };
export { FrameHeaderRules, PreviewSessions, RedirectWatch, createSession };
