// Preview sessions per tab: preparing, opening and closing them, with the
// header rules and redirects that follow each one.
import { toPreviewFrameUrl } from '../../domain/link-preview-frame-url';
import type { LinkPreviewOrigin, OkReply } from '../../domain/messages';
import { linkPreviewSessions } from '../../domain/settings/features';
import { callback, captureTab, getDnr, injectSurface, readRules, sendToSurface } from './chrome-calls';
import { PREPARED_TTL_MS, WORKER_RULE_ID } from './constants';
import { allocateRuleIds, buildFrameHeaderRules, buildWorkerHeaderRule, createFrameSecret, findTabRuleIds, isPreviewableUrl, isRecord, isSameAddress, readDomainList, readUrlDomain, sessionDomains } from './frame-rules';
import type { FrameRedirect, LinkPreviewContext, PrepareOptions, PreviewSession, Rule, SavedSession, UpdateRuleOptions } from './types';

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
function persistSessions(ctx: LinkPreviewContext): void {
  if (!ctx.settingsStore) {
    return;
  }
  const saved: Record<string, SavedSession> = {};
  ctx.sessions.forEach((session, tabId) => {
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
  void ctx.settingsStore.set(linkPreviewSessions, saved).catch(() => {});
}

async function restoreSessions(ctx: LinkPreviewContext): Promise<void> {
  if (!ctx.settingsStore) {
    return;
  }
  await ctx.settingsStore.ready;
  const saved = ctx.settingsStore.getStored(linkPreviewSessions);
  if (!isRecord(saved)) {
    return;
  }
  Object.keys(saved).forEach((key) => {
    const tabId = Number(key);
    const entry = saved[key];
    if (!Number.isInteger(tabId) || ctx.sessions.has(tabId) || !isRecord(entry) || !isPreviewableUrl(entry.url)) {
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
    ctx.sessions.set(tabId, session);
  });
}

// Brings the tab's rules, and the workers' rule, in line with the tab's
// preview as it stands when the update runs.
function syncRules(ctx: LinkPreviewContext, tabId: number): Promise<boolean> {
  watchRedirects(ctx);
  const dnr = getDnr(ctx);
  if (!dnr) {
    return Promise.resolve(false);
  }
  const run = ctx.ruleQueue.then(() => updateFrameHeaderRules(ctx, dnr, tabId));
  ctx.ruleQueue = run.catch(() => false);
  return run.then((applied) => {
    persistSessions(ctx);
    return applied;
  });
}

async function updateFrameHeaderRules(ctx: LinkPreviewContext, dnr: typeof chrome.declarativeNetRequest, tabId: number): Promise<boolean> {
  const current = typeof dnr.getSessionRules === 'function' ? await readRules(ctx, dnr) : null;
  const rules = current || [];
  const apply = (): Promise<boolean> => {
    const session = ctx.sessions.get(tabId);
    const domains = session ? sessionDomains(session) : [];
    const workerDomains = new Set<string>();
    ctx.sessions.forEach((entry) => sessionDomains(entry).forEach((domain) => workerDomains.add(domain)));
    const addRules: Rule[] = domains.length
      ? buildFrameHeaderRules(tabId, allocateRuleIds(rules, 2), domains, ctx.headerMatching)
      : [];
    if (workerDomains.size) {
      addRules.push(buildWorkerHeaderRule(Array.from(workerDomains).sort()));
    }
    const update: UpdateRuleOptions = { removeRuleIds: findTabRuleIds(rules, tabId).concat(WORKER_RULE_ID), addRules };
    return callback<void>(ctx, (done) => dnr.updateSessionRules(update, done)).then(Boolean);
  };
  const applied = await apply();
  if (!applied && ctx.headerMatching && ctx.sessions.has(tabId)) {
    ctx.headerMatching = false;
    return apply();
  }
  return applied;
}


function stopExpiry(ctx: LinkPreviewContext, session: PreviewSession): void {
  if (session.expiryTimer !== null) {
    ctx.clearTimer(session.expiryTimer);
    session.expiryTimer = null;
  }
}

function scheduleExpiry(ctx: LinkPreviewContext, tabId: number, session: PreviewSession): void {
  stopExpiry(ctx, session);
  session.expiryTimer = ctx.setTimer(() => {
    if (ctx.sessions.get(tabId) === session && session.state === 'prepared') {
      void discard(ctx, tabId, session.token);
    }
  }, PREPARED_TTL_MS);
}

// A press prepares with the screenshot; Shift held over the link prepares
// without it (capture: false).
function prepare(
  ctx: LinkPreviewContext,
  tab: chrome.tabs.Tab | null | undefined,
  url: unknown,
  prepareOptions?: PrepareOptions
): PreviewSession | null {
  const tabId = tab && tab.id;
  if (!tab || typeof tabId !== 'number' || !isPreviewableUrl(url)) {
    return null;
  }
  const capture = !prepareOptions || prepareOptions.capture !== false;
  const existing = ctx.sessions.get(tabId);
  if (existing && existing.url === url && existing.state === 'prepared') {
    if (capture && !existing.capture) {
      existing.capture = captureTab(ctx, tab);
      deliverScreenshot(ctx, tabId, existing);
    }
    scheduleExpiry(ctx, tabId, existing);
    return existing;
  }
  if (existing) {
    stopExpiry(ctx, existing);
  }
  ctx.tokenCounter += 1;
  const token = `${ctx.now().toString(36)}-${ctx.tokenCounter}`;
  const session = createSession(token, url);
  ctx.sessions.set(tabId, session);
  // The screenshot goes first: the surface's hidden frame stays out of it
  // either way, but the capture is the slowest step.
  if (capture) {
    session.capture = captureTab(ctx, tab);
  }
  session.ready = Promise.all([syncRules(ctx, tabId), injectSurface(ctx, tabId)])
    .then(([, injected]) => {
      if (!injected) {
        return false;
      }
      return sendToSurface<'lumnoLinkPreviewPrewarm'>(ctx, tabId, {
        action: 'lumnoLinkPreviewPrewarm',
        token,
        url,
        frameSecret: session.frameSecret
      }).then(Boolean);
    });
  if (session.capture) {
    deliverScreenshot(ctx, tabId, session);
  }
  scheduleExpiry(ctx, tabId, session);
  return session;
}

// The surface gets the screenshot as soon as both are ready, to decode it
// while the button is still down; "show" then carries none.
function deliverScreenshot(ctx: LinkPreviewContext, tabId: number, session: PreviewSession): void {
  const token = session.token;
  session.screenshotDelivered = Promise.all([session.ready, session.capture]).then(([surfaceReady, screenshot]) => (
    surfaceReady && screenshot && ctx.sessions.get(tabId) === session
      ? sendToSurface<'lumnoLinkPreviewScreenshot'>(ctx, tabId, { action: 'lumnoLinkPreviewScreenshot', token, screenshot })
        .then(Boolean)
      : false
  ));
}

async function open(
  ctx: LinkPreviewContext,
  tab: chrome.tabs.Tab | null | undefined,
  url: unknown,
  origin: LinkPreviewOrigin | null
): Promise<OkReply> {
  const session = prepare(ctx, tab, url);
  const tabId = tab && tab.id;
  if (!session || typeof tabId !== 'number') {
    return { ok: false, reason: 'not-previewable' };
  }
  session.state = 'opening';
  stopExpiry(ctx, session);
  const [ready, screenshot, screenshotDelivered] = await Promise.all([
    session.ready,
    session.capture,
    session.screenshotDelivered
  ]);
  if (ctx.sessions.get(tabId) !== session) {
    return { ok: false, reason: 'superseded' };
  }
  if (!ready) {
    // Nothing reached the page (the page refuses scripts, or it went
    // away): the link can still open in a tab.
    void discard(ctx, tabId, session.token);
    return { ok: false, reason: 'surface-unavailable' };
  }
  const shown = await sendToSurface<'lumnoLinkPreviewShow'>(ctx, tabId, {
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
    void discard(ctx, tabId, session.token);
    return { ok: false, reason: 'show-failed' };
  }
  if (ctx.sessions.get(tabId) === session) {
    session.state = 'open';
    persistSessions(ctx);
  }
  return { ok: true };
}

// Drops the tab's preview. A token that no longer names the tab's
// preview is a late close from one already replaced; it is ignored. With
// no session known (the worker slept while the preview was open), the
// rule is removed anyway.
function discard(ctx: LinkPreviewContext, tabId: number, token: string): Promise<boolean> {
  const session = ctx.sessions.get(tabId);
  if (session && token && session.token !== token) {
    return Promise.resolve(false);
  }
  if (session) {
    stopExpiry(ctx, session);
    ctx.sessions.delete(tabId);
  }
  return syncRules(ctx, tabId);
}

// A press released away from the link: the click that would open the
// preview never comes, so its rule and hidden window go now.
function cancel(ctx: LinkPreviewContext, tabId: number): Promise<boolean> {
  const session = ctx.sessions.get(tabId);
  if (!session || session.state !== 'prepared') {
    return Promise.resolve(false);
  }
  void sendToSurface<'lumnoLinkPreviewDiscard'>(ctx, tabId, { action: 'lumnoLinkPreviewDiscard', token: session.token });
  return discard(ctx, tabId, session.token);
}

function openInTab(ctx: LinkPreviewContext, tab: chrome.tabs.Tab | null | undefined, url: unknown): Promise<boolean> {
  const tabs = ctx.chromeApi && ctx.chromeApi.tabs;
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
  return callback<chrome.tabs.Tab>(ctx, (done) => tabs.create(properties, done)).then(Boolean);
}


// The preview frame's loading page is redirected: the domain it goes to is
// allowed at once, while the browser asks for the next address, so a link
// that passes through another site (a search engine's result, a short
// link) loads in one go instead of being refused and tried again. The
// request is the preview frame's once it is bound; before that, the first
// load is the one that asked for the preview's own address, followed
// through its redirects.
function handleFrameRedirect(ctx: LinkPreviewContext, details: FrameRedirect | null | undefined): Promise<boolean> {
  if (!details || details.type !== 'sub_frame' || !Number.isInteger(details.frameId) || details.frameId <= 0) {
    return Promise.resolve(false);
  }
  const tabId = details.tabId;
  const session = ctx.sessions.get(tabId);
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
  return syncRules(ctx, tabId);
}

function watchRedirects(ctx: LinkPreviewContext): void {
  const event = ctx.chromeApi && ctx.chromeApi.webRequest && ctx.chromeApi.webRequest.onBeforeRedirect;
  if (!event || typeof event.addListener !== 'function') {
    return;
  }
  if (ctx.sessions.size && !ctx.redirectListener) {
    const listener = (details: chrome.webRequest.OnBeforeRedirectDetails): void => {
      void handleFrameRedirect(ctx, details);
    };
    ctx.redirectListener = listener;
    event.addListener(listener, { urls: ['http://*/*', 'https://*/*'], types: ['sub_frame'] });
  } else if (!ctx.sessions.size && ctx.redirectListener) {
    event.removeListener(ctx.redirectListener);
    ctx.redirectListener = null;
  }
}

export {
  cancel,
  createSession,
  deliverScreenshot,
  discard,
  handleFrameRedirect,
  open,
  openInTab,
  persistSessions,
  prepare,
  restoreSessions,
  scheduleExpiry,
  stopExpiry,
  syncRules,
  updateFrameHeaderRules,
  watchRedirects
};
