// One picture-in-picture at a time across tabs: the frame that holds it is
// recorded in session storage, and a new request asks the holder to give
// it up first.
import * as LumnoMessaging from '../platform/messaging';
import type { MessageTabs } from '../platform/messaging';
import type { OkReply, PipKind, PipOwner, PipOwnershipReply, PipReleaseReply } from '../domain/messages';
import type { SettingsStore } from '../platform/settings-store';
import { globalPipOwner } from '../domain/settings/features';

interface PipOwnershipChromeApi {
  tabs?: MessageTabs;
  runtime?: { lastError?: { message?: string } | null };
}

interface PipOwnershipOptions {
  chromeApi?: PipOwnershipChromeApi | null;
  // The settings the owner record lives in.
  settingsStore: SettingsStore;
  // The tab's URL, also while a navigation is pending.
  getResolvedTabUrl?: (tab: chrome.tabs.Tab) => string;
}

interface PipSenderContext {
  tabId: number;
  frameId: number;
  url: string;
}

interface PipOwnership {
  clearGlobalPipOwnerForTabId(tabId: unknown): void;
  releaseGlobalPipOwnership(sender: chrome.runtime.MessageSender | null | undefined, token: unknown): Promise<PipReleaseReply>;
  requestGlobalPipOwnership(sender: chrome.runtime.MessageSender | null | undefined, kind: unknown): Promise<PipOwnershipReply>;
}

interface PipOwnershipContext {
  readonly settings: PipOwnershipOptions;
  readonly settingsStore: SettingsStore;
  readonly chromeApi: PipOwnershipChromeApi | null;
  readonly getResolvedTabUrl: (tab: chrome.tabs.Tab) => string;
}

function getGlobalPipOwnerRecord(ctx: PipOwnershipContext): Promise<PipOwner | null> {
  return ctx.settingsStore.ready.then(() => ctx.settingsStore.get(globalPipOwner));
}

function setGlobalPipOwnerRecord(ctx: PipOwnershipContext, record: PipOwner): Promise<PipOwner | null> {
  const normalized = globalPipOwner.parse(record);
  return ctx.settingsStore.set(globalPipOwner, normalized).then(() => normalized, () => normalized);
}

function clearGlobalPipOwnerRecord(ctx: PipOwnershipContext, expectedToken?: string): Promise<boolean> {
  const current = ctx.settingsStore.get(globalPipOwner);
  if (expectedToken && current && current.token !== expectedToken) {
    return Promise.resolve(false);
  }
  return ctx.settingsStore.remove(globalPipOwner).then(() => true, () => true);
}

function createGlobalPipOwnerToken(): string {
  if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPipSenderContext(ctx: PipOwnershipContext, sender: chrome.runtime.MessageSender | null | undefined): PipSenderContext | null {
  const senderTab = sender && sender.tab ? sender.tab : null;
  const tabId = senderTab && typeof senderTab.id === 'number' ? senderTab.id : null;
  if (!senderTab || typeof tabId !== 'number') {
    return null;
  }
  return {
    tabId: tabId,
    frameId: sender && typeof sender.frameId === 'number' ? sender.frameId : 0,
    url: ctx.getResolvedTabUrl(senderTab)
  };
}

function isSameGlobalPipOwner(owner: PipOwner | null, context: PipSenderContext | null, kind: PipKind): boolean {
  if (!owner || !context) {
    return false;
  }
  return owner.kind === kind &&
    owner.tabId === context.tabId &&
    owner.frameId === context.frameId;
}

// Asks the holder's frame to close its picture-in-picture.
function requestSurrender(ctx: PipOwnershipContext, tabId: number, requestedKind: PipKind, ownerKind: PipKind): Promise<OkReply> {
  return new Promise((resolve) => {
    const chromeApi = ctx.chromeApi;
    const tabs = chromeApi && chromeApi.tabs;
    if (!chromeApi || !tabs || typeof tabs.sendMessage !== 'function') {
      resolve({ ok: false, reason: 'tabs-sendMessage-unavailable' });
      return;
    }
    try {
      LumnoMessaging.sendTabMessage(tabs, tabId, {
        action: 'lumno:pip-force-surrender',
        reason: requestedKind === 'document' ? 'document-owner-takeover' : 'video-owner-takeover',
        ownerKind
      }, (response) => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          resolve({
            ok: false,
            reason: chromeApi.runtime.lastError.message || 'sendMessage-failed'
          });
          return;
        }
        resolve(response && typeof response === 'object'
          ? response
          : { ok: false, reason: 'empty-response' });
      });
    } catch (error) {
      resolve({ ok: false, reason: String(error) });
    }
  });
}

async function forceSurrenderGlobalPipOwner(ctx: PipOwnershipContext, owner: PipOwner | null, requestedKind: PipKind): Promise<OkReply & { cleared?: boolean }> {
  if (!owner) {
    return { ok: true, cleared: false };
  }
  const result = await requestSurrender(ctx, owner.tabId, requestedKind, owner.kind);
  if (result && result.ok) {
    await clearGlobalPipOwnerRecord(ctx, owner.token);
    return { ok: true, cleared: true };
  }
  const errorReason = String(result && result.reason ? result.reason : '');
  const isStaleOwner = errorReason.includes('Receiving end does not exist') ||
    errorReason.includes('No tab with id') ||
    errorReason.includes('message port closed');
  if (isStaleOwner) {
    await clearGlobalPipOwnerRecord(ctx, owner.token);
    return { ok: true, cleared: true };
  }
  return {
    ok: false,
    reason: result && result.reason ? result.reason : 'surrender-failed'
  };
}

async function requestGlobalPipOwnership(ctx: PipOwnershipContext, sender: chrome.runtime.MessageSender | null | undefined, kind: unknown): Promise<PipOwnershipReply> {
  const context = getPipSenderContext(ctx, sender);
  if (!context) {
    return { ok: false, granted: false, reason: 'no-tab' };
  }
  if (kind !== 'video' && kind !== 'document') {
    return { ok: false, granted: false, reason: 'invalid-kind' };
  }

  const currentOwner = await getGlobalPipOwnerRecord(ctx);
  if (currentOwner && isSameGlobalPipOwner(currentOwner, context, kind)) {
    return {
      ok: true,
      granted: true,
      token: currentOwner.token,
      owner: currentOwner
    };
  }

  if (currentOwner) {
    if (currentOwner.kind === 'document' && kind === 'video') {
      return {
        ok: false,
        granted: false,
        reason: 'document-owner-active',
        owner: currentOwner
      };
    }
    const surrenderResult = await forceSurrenderGlobalPipOwner(ctx, currentOwner, kind);
    if (!surrenderResult.ok) {
      return {
        ok: false,
        granted: false,
        reason: surrenderResult.reason || 'owner-busy',
        owner: currentOwner
      };
    }
  }

  const nextOwner: PipOwner = {
    kind: kind,
    tabId: context.tabId,
    frameId: context.frameId,
    token: createGlobalPipOwnerToken(),
    url: context.url,
    updatedAt: Date.now()
  };
  await setGlobalPipOwnerRecord(ctx, nextOwner);
  return {
    ok: true,
    granted: true,
    token: nextOwner.token,
    owner: nextOwner
  };
}

async function releaseGlobalPipOwnership(ctx: PipOwnershipContext, sender: chrome.runtime.MessageSender | null | undefined, token: unknown): Promise<PipReleaseReply> {
  const context = getPipSenderContext(ctx, sender);
  if (!context) {
    return { ok: false, released: false, reason: 'no-tab' };
  }
  const currentOwner = await getGlobalPipOwnerRecord(ctx);
  if (!currentOwner) {
    return { ok: true, released: true, reason: 'no-owner' };
  }
  const matchesToken = typeof token === 'string' && token && currentOwner.token === token;
  const matchesSender = currentOwner.tabId === context.tabId &&
    currentOwner.frameId === context.frameId;
  if (!matchesToken && !matchesSender) {
    return { ok: true, released: false, reason: 'owner-mismatch' };
  }
  await clearGlobalPipOwnerRecord(ctx, currentOwner.token);
  return { ok: true, released: true };
}

function clearGlobalPipOwnerForTabId(ctx: PipOwnershipContext, tabId: unknown): void {
  if (typeof tabId !== 'number') {
    return;
  }
  getGlobalPipOwnerRecord(ctx).then((owner) => {
    if (!owner || owner.tabId !== tabId) {
      return;
    }
    clearGlobalPipOwnerRecord(ctx, owner.token).catch(() => {});
  }).catch(() => {});
}

function create(options: PipOwnershipOptions): Readonly<PipOwnership> {
  const settings = options;
  const settingsStore = options.settingsStore;
  const chromeApi: PipOwnershipChromeApi | null = settings.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
  const getResolvedTabUrl = typeof settings.getResolvedTabUrl === 'function'
    ? settings.getResolvedTabUrl
    : (tab: chrome.tabs.Tab) => (tab && typeof tab.url === 'string' ? tab.url : '');
  const ctx: PipOwnershipContext = {
    settings,
    settingsStore,
    chromeApi,
    getResolvedTabUrl
  };

  return Object.freeze({
    clearGlobalPipOwnerForTabId: (tabId: unknown) => clearGlobalPipOwnerForTabId(ctx, tabId),
    releaseGlobalPipOwnership: (sender: chrome.runtime.MessageSender | null | undefined, token: unknown) => releaseGlobalPipOwnership(ctx, sender, token),
    requestGlobalPipOwnership: (sender: chrome.runtime.MessageSender | null | undefined, kind: unknown) => requestGlobalPipOwnership(ctx, sender, kind)
  });
}

export { create };
export type { PipOwnership, PipOwnershipChromeApi, PipOwnershipOptions };
