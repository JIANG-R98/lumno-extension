// Messages from the preview frame: binding it to its session, following its
// navigation and retrying a page that refused it.
import type { MessageSender } from '../message-router';
import type { LinkPreviewRetry } from '../../domain/messages';
import { MAX_REFUSED_RETRIES, RESOLVE_TIMEOUT_MS } from './constants';
import { isPreviewableUrl, readUrlDomain, sessionDomains } from './frame-rules';
import { syncRules } from './sessions';
import type { FrameSession } from './types';
import type { LinkPreview } from './preview-state';

function getSenderTabId(sender: MessageSender | null | undefined): number | null {
  const tabId = sender && sender.tab ? sender.tab.id : undefined;
  return typeof tabId === 'number' ? tabId : null;
}

// The preview's session, when the sender is the preview frame itself.
async function findFrameSession(preview: LinkPreview, sender: MessageSender | null | undefined): Promise<FrameSession | null> {
  await preview.sessions.restored;
  const tabId = getSenderTabId(sender);
  const session = tabId !== null ? preview.sessions.get(tabId) : undefined;
  if (tabId === null || !sender || !session || session.frameId === null || sender.frameId !== session.frameId) {
    return null;
  }
  return { tabId, session };
}

// The surface's frame passes on the secret the surface gave it: the frame
// that sent it is the preview frame from now on. It binds once, and a page
// in the frame that passed the secret to a frame of its own comes second.
async function bindFrame(preview: LinkPreview, sender: MessageSender | null | undefined, secret: unknown): Promise<boolean> {
  await preview.sessions.restored;
  const tabId = getSenderTabId(sender);
  const session = tabId !== null ? preview.sessions.get(tabId) : undefined;
  const frameId = sender ? sender.frameId : undefined;
  if (!session || typeof secret !== 'string' || secret !== session.frameSecret ||
      typeof frameId !== 'number' || !Number.isInteger(frameId) || frameId <= 0) {
    return false;
  }
  if (session.frameId === null) {
    session.frameId = frameId;
    preview.sessions.persist();
  }
  if (session.frameId !== frameId) {
    return false;
  }
  await noteFrameCommitted(preview, sender);
  return true;
}

// The preview frame is about to leave for another address: kept so a
// refusal there can be tried again. Nothing is allowed yet.
async function noteFrameNavigation(preview: LinkPreview, sender: MessageSender | null | undefined, url: unknown): Promise<boolean> {
  const found = await findFrameSession(preview, sender);
  if (found && isPreviewableUrl(url)) {
    found.session.lastFrameUrl = url;
    preview.sessions.persist();
  }
  return Boolean(found);
}

// A page loaded in the preview frame (the browser names its address). The
// preview now shows that page's site: domains allowed for an earlier
// page or try go, so a page the preview went back to cannot frame them.
async function noteFrameCommitted(preview: LinkPreview, sender: MessageSender | null | undefined): Promise<boolean> {
  const found = await findFrameSession(preview, sender);
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
  return syncRules(preview, tabId);
}

// Where an address ends up after its redirects. The body is not read.
async function resolveFinalUrl(preview: LinkPreview, url: string): Promise<string> {
  if (!preview.ports.fetchUrl) {
    return '';
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? preview.ports.setTimer(() => controller.abort(), RESOLVE_TIMEOUT_MS) : null;
  try {
    const response = await preview.ports.fetchUrl(url, {
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
      preview.ports.clearTimer(timer);
    }
    if (controller) {
      controller.abort();
    }
  }
}

// The surface found the frame showing Chrome's error page. If the address
// the frame went to, or where it redirects, is a domain the preview does
// not cover yet, that domain is allowed and the frame tries once more.
async function retryRefusedFrame(preview: LinkPreview, tabId: number, token: string): Promise<LinkPreviewRetry> {
  await preview.sessions.restored;
  const session = preview.sessions.get(tabId);
  if (!session || session.token !== token || session.retries >= MAX_REFUSED_RETRIES) {
    return { retry: false };
  }
  const target = session.lastFrameUrl || session.frameUrl;
  const finalUrl = await resolveFinalUrl(preview, target);
  if (preview.sessions.get(tabId) !== session) {
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
  const applied = await syncRules(preview, tabId);
  return applied && preview.sessions.get(tabId) === session ? { retry: true, url: target } : { retry: false };
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
