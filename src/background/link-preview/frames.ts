// Messages from the preview frame: binding it to its session, following its
// navigation and retrying a page that refused it.
import type { MessageSender } from '../message-router';
import type { LinkPreviewRetry } from '../../domain/messages';
import { MAX_REFUSED_RETRIES, RESOLVE_TIMEOUT_MS } from './constants';
import { isPreviewableUrl, readUrlDomain, sessionDomains } from './frame-rules';
import { persistSessions, syncRules } from './sessions';
import type { FrameSession, LinkPreviewContext } from './types';

function getSenderTabId(sender: MessageSender | null | undefined): number | null {
  const tabId = sender && sender.tab ? sender.tab.id : undefined;
  return typeof tabId === 'number' ? tabId : null;
}

// The preview's session, when the sender is the preview frame itself.
async function findFrameSession(ctx: LinkPreviewContext, sender: MessageSender | null | undefined): Promise<FrameSession | null> {
  await ctx.restored;
  const tabId = getSenderTabId(sender);
  const session = tabId !== null ? ctx.sessions.get(tabId) : undefined;
  if (tabId === null || !sender || !session || session.frameId === null || sender.frameId !== session.frameId) {
    return null;
  }
  return { tabId, session };
}

// The surface's frame passes on the secret the surface gave it: the frame
// that sent it is the preview frame from now on. It binds once, and a page
// in the frame that passed the secret to a frame of its own comes second.
async function bindFrame(ctx: LinkPreviewContext, sender: MessageSender | null | undefined, secret: unknown): Promise<boolean> {
  await ctx.restored;
  const tabId = getSenderTabId(sender);
  const session = tabId !== null ? ctx.sessions.get(tabId) : undefined;
  const frameId = sender ? sender.frameId : undefined;
  if (!session || typeof secret !== 'string' || secret !== session.frameSecret ||
      typeof frameId !== 'number' || !Number.isInteger(frameId) || frameId <= 0) {
    return false;
  }
  if (session.frameId === null) {
    session.frameId = frameId;
    persistSessions(ctx);
  }
  if (session.frameId !== frameId) {
    return false;
  }
  await noteFrameCommitted(ctx, sender);
  return true;
}

// The preview frame is about to leave for another address: kept so a
// refusal there can be tried again. Nothing is allowed yet.
async function noteFrameNavigation(ctx: LinkPreviewContext, sender: MessageSender | null | undefined, url: unknown): Promise<boolean> {
  const found = await findFrameSession(ctx, sender);
  if (found && isPreviewableUrl(url)) {
    found.session.lastFrameUrl = url;
    persistSessions(ctx);
  }
  return Boolean(found);
}

// A page loaded in the preview frame (the browser names its address). The
// preview now shows that page's site: domains allowed for an earlier
// page or try go, so a page the preview went back to cannot frame them.
async function noteFrameCommitted(ctx: LinkPreviewContext, sender: MessageSender | null | undefined): Promise<boolean> {
  const found = await findFrameSession(ctx, sender);
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
  return syncRules(ctx, tabId);
}

// Where an address ends up after its redirects. The body is not read.
async function resolveFinalUrl(ctx: LinkPreviewContext, url: string): Promise<string> {
  if (!ctx.fetchUrl) {
    return '';
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? ctx.setTimer(() => controller.abort(), RESOLVE_TIMEOUT_MS) : null;
  try {
    const response = await ctx.fetchUrl(url, {
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
      ctx.clearTimer(timer);
    }
    if (controller) {
      controller.abort();
    }
  }
}

// The surface found the frame showing Chrome's error page. If the address
// the frame went to, or where it redirects, is a domain the preview does
// not cover yet, that domain is allowed and the frame tries once more.
async function retryRefusedFrame(ctx: LinkPreviewContext, tabId: number, token: string): Promise<LinkPreviewRetry> {
  await ctx.restored;
  const session = ctx.sessions.get(tabId);
  if (!session || session.token !== token || session.retries >= MAX_REFUSED_RETRIES) {
    return { retry: false };
  }
  const target = session.lastFrameUrl || session.frameUrl;
  const finalUrl = await resolveFinalUrl(ctx, target);
  if (ctx.sessions.get(tabId) !== session) {
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
  const applied = await syncRules(ctx, tabId);
  return applied && ctx.sessions.get(tabId) === session ? { retry: true, url: target } : { retry: false };
}

export {
  bindFrame,
  findFrameSession,
  getSenderTabId,
  noteFrameCommitted,
  noteFrameNavigation,
  resolveFinalUrl,
  retryRefusedFrame
};
