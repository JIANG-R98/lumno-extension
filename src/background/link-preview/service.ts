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
import type { HandlersFor, MessageSender } from '../message-router';
import type { LinkPreviewOrigin } from '../../domain/messages';
import { callback, getDnr, readRules, sendToSurface } from './chrome-calls';
import { WORKER_RULE_ID } from './constants';
import { isRecord } from './frame-rules';
import { bindFrame, getSenderTabId, noteFrameCommitted, noteFrameNavigation, retryRefusedFrame } from './frames';
import { cancel, discard, handleFrameRedirect, open, openInTab, prepare, restoreSessions, stopExpiry, syncRules, watchRedirects } from './sessions';
import type { FrameRedirect, LinkPreviewAction, LinkPreviewContext, LinkPreviewService, LinkPreviewServiceOptions, PrepareOptions, PreviewSession, TimerHandle } from './types';

// The surface lives in the tab's top document, so a navigation of the tab
// may have taken it away without a close. Asking it settles that: no
// answer (no surface) or another preview's token drops the rule.
function verifyOpenPreview(ctx: LinkPreviewContext, tabId: number): Promise<boolean> {
  return sendToSurface<'lumnoLinkPreviewPing'>(ctx, tabId, { action: 'lumnoLinkPreviewPing' }).then((response) => {
    const surfaceToken = response && typeof response.token === 'string' ? response.token : '';
    const session = ctx.sessions.get(tabId);
    if (!surfaceToken || (session && session.token !== surfaceToken)) {
      return discard(ctx, tabId, '');
    }
    return false;
  });
}

function handleTabRemoved(ctx: LinkPreviewContext, tabId: number): Promise<boolean> {
  const session = ctx.sessions.get(tabId);
  if (session) {
    stopExpiry(ctx, session);
    ctx.sessions.delete(tabId);
  }
  return syncRules(ctx, tabId);
}

// A navigation starts ("loading") while the old document still answers,
// so the check runs again when it finishes ("complete"). Only an open
// preview is checked: the preview's own frame loading can report the tab
// as loading while the press is still on its way to the surface.
function handleTabUpdated(ctx: LinkPreviewContext, tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo | null | undefined): Promise<boolean> {
  if (!changeInfo || (changeInfo.status !== 'loading' && changeInfo.status !== 'complete')) {
    return Promise.resolve(false);
  }
  const session = ctx.sessions.get(tabId);
  if (!session || session.state !== 'open') {
    return Promise.resolve(false);
  }
  return verifyOpenPreview(ctx, tabId);
}

// Rules left by a worker that stopped while previews were open: keep the
// ones whose preview is still on screen.
async function reconcileRules(ctx: LinkPreviewContext): Promise<void> {
  await ctx.restored;
  const dnr = getDnr(ctx);
  if (!dnr || typeof dnr.getSessionRules !== 'function') {
    return;
  }
  const rules = await readRules(ctx, dnr);
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
  ctx.sessions.forEach((_session, tabId) => tabIds.add(tabId));
  await Promise.all(Array.from(tabIds, (tabId) => verifyOpenPreview(ctx, tabId)));
  // The workers' rule outlives no preview.
  const left = await readRules(ctx, dnr);
  if (left && left.length === 1 && left[0].id === WORKER_RULE_ID) {
    await callback<void>(ctx, (done) => dnr.updateSessionRules({ removeRuleIds: [WORKER_RULE_ID] }, done));
  }
}

function attach(ctx: LinkPreviewContext): void {
  const tabs = ctx.chromeApi && ctx.chromeApi.tabs;
  if (tabs && tabs.onRemoved && typeof tabs.onRemoved.addListener === 'function') {
    tabs.onRemoved.addListener((tabId) => {
      if (ctx.sessions.has(tabId)) {
        void handleTabRemoved(ctx, tabId);
      }
    });
  }
  if (tabs && tabs.onUpdated && typeof tabs.onUpdated.addListener === 'function') {
    tabs.onUpdated.addListener((tabId, changeInfo) => {
      void handleTabUpdated(ctx, tabId, changeInfo);
    });
  }
  ctx.restored = restoreSessions(ctx).catch(() => {}).then((() => watchRedirects(ctx)));
  ctx.ruleQueue = ctx.restored;
  void reconcileRules(ctx);
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

function createMessageHandlers(ctx: LinkPreviewContext): HandlersFor<LinkPreviewAction> {
  return Object.freeze({
    linkPreviewPrepare(request, sender, sendResponse) {
      prepare(ctx, sender && sender.tab, request.url, { capture: request.hover !== true });
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewOpen(request, sender, sendResponse) {
      const tab = sender && sender.tab;
      void open(ctx, tab, request.url, readOrigin(request.origin, sender)).then((result) => {
        if (result.reason === 'surface-unavailable') {
          // The page has no preview to show it in: open the link in a tab,
          // as the click would have without the preview.
          void openInTab(ctx, tab, request.url);
        }
        sendResponse(result);
      });
      return true;
    },
    linkPreviewCancel(_request, sender, sendResponse) {
      const tabId = getSenderTabId(sender);
      if (tabId !== null) {
        void cancel(ctx, tabId);
      }
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewClose(request, sender, sendResponse) {
      const tabId = getSenderTabId(sender);
      if (tabId !== null) {
        void ctx.restored.then(() => discard(ctx, tabId, String(request.token || '')));
      }
      sendResponse({ ok: true });
      return false;
    },
    linkPreviewOpenInTab(request, sender, sendResponse) {
      void openInTab(ctx, sender && sender.tab, request.url).then((opened) => {
        sendResponse({ ok: opened });
      });
      return true;
    },
    linkPreviewFrameBind(request, sender, sendResponse) {
      void bindFrame(ctx, sender, request.secret).then((bound) => sendResponse({ ok: bound }));
      return true;
    },
    linkPreviewFrameNavigating(request, sender, sendResponse) {
      void noteFrameNavigation(ctx, sender, request.url).then((noted) => sendResponse({ ok: noted }));
      return true;
    },
    linkPreviewFrameCommitted(_request, sender, sendResponse) {
      void noteFrameCommitted(ctx, sender).then(() => sendResponse({ ok: true }));
      return true;
    },
    linkPreviewFrameRefused(request, sender, sendResponse) {
      const tabId = getSenderTabId(sender);
      if (tabId === null || !sender || sender.frameId !== 0) {
        sendResponse({ retry: false });
        return false;
      }
      void retryRefusedFrame(ctx, tabId, String(request.token || '')).then(sendResponse);
      return true;
    }
  });
}

function createLinkPreviewService(options?: LinkPreviewServiceOptions | null): Readonly<LinkPreviewService> {
  const config = options || {};
  const chromeApi = config.chromeApi || null;
  const settingsStore = config.settingsStore || null;
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
  const ctx: LinkPreviewContext = {
    config,
    chromeApi,
    settingsStore,
    now,
    setTimer,
    clearTimer,
    fetchUrl,
    sessions,
    tokenCounter: 0,
    headerMatching: true,
    ruleQueue: Promise.resolve(false),
    restored: Promise.resolve(),
    redirectListener: null
  };

  return Object.freeze({
    prepare: (tab: chrome.tabs.Tab | null | undefined, url: unknown, prepareOptions?: PrepareOptions) => prepare(ctx, tab, url, prepareOptions),
    open: (tab: chrome.tabs.Tab | null | undefined, url: unknown, origin: LinkPreviewOrigin | null) => open(ctx, tab, url, origin),
    cancel: (tabId: number) => cancel(ctx, tabId),
    discard: (tabId: number, token: string) => discard(ctx, tabId, token),
    openInTab: (tab: chrome.tabs.Tab | null | undefined, url: unknown) => openInTab(ctx, tab, url),
    bindFrame: (sender: MessageSender | null | undefined, secret: unknown) => bindFrame(ctx, sender, secret),
    noteFrameNavigation: (sender: MessageSender | null | undefined, url: unknown) => noteFrameNavigation(ctx, sender, url),
    noteFrameCommitted: (sender: MessageSender | null | undefined) => noteFrameCommitted(ctx, sender),
    retryRefusedFrame: (tabId: number, token: string) => retryRefusedFrame(ctx, tabId, token),
    handleFrameRedirect: (details: FrameRedirect | null | undefined) => handleFrameRedirect(ctx, details),
    handleTabRemoved: (tabId: number) => handleTabRemoved(ctx, tabId),
    handleTabUpdated: (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo | null | undefined) => handleTabUpdated(ctx, tabId, changeInfo),
    reconcileRules: () => reconcileRules(ctx),
    attach: () => attach(ctx),
    messageHandlers: createMessageHandlers(ctx)
  });
}

export {
  attach,
  createLinkPreviewService,
  createMessageHandlers,
  handleTabRemoved,
  handleTabUpdated,
  readOrigin,
  reconcileRules,
  verifyOpenPreview
};
