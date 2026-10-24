// One picture-in-picture at a time across tabs: the frame that holds it is
// recorded in session storage, and a new request asks the holder to give
// it up first.
import * as LumnoMessaging from '../platform/messaging';
import type { MessageTabs } from '../platform/messaging';
import type { OkReply, PipKind, PipOwner, PipOwnershipReply, PipReleaseReply } from '../domain/messages';
import type { StorageAreaLike } from '../domain/storage-port';

interface PipOwnershipChromeApi {
  storage?: { session?: StorageAreaLike; local?: StorageAreaLike };
  tabs?: MessageTabs;
  runtime?: { lastError?: { message?: string } | null };
}

interface PipOwnershipOptions {
  chromeApi?: PipOwnershipChromeApi | null;
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

const GLOBAL_PIP_OWNER_STORAGE_KEY = '_x_lumno_global_pip_owner_2026_';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function create(options?: PipOwnershipOptions | null): Readonly<PipOwnership> {
  const settings = options && typeof options === 'object' ? options : {};
  const chromeApi: PipOwnershipChromeApi | null = settings.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
  const getResolvedTabUrl = typeof settings.getResolvedTabUrl === 'function'
    ? settings.getResolvedTabUrl
    : (tab: chrome.tabs.Tab) => (tab && typeof tab.url === 'string' ? tab.url : '');
  let globalPipOwnerCache: PipOwner | null = null;
  let globalPipOwnerCacheLoaded = false;

  function getSessionStorageArea(): StorageAreaLike | null {
    if (!chromeApi || !chromeApi.storage) {
      return null;
    }
    return chromeApi.storage.session || chromeApi.storage.local || null;
  }

  function normalizePipOwnerRecord(value: unknown): PipOwner | null {
    if (!isRecord(value)) {
      return null;
    }
    const kind: PipKind | '' = value.kind === 'document' ? 'document' : (value.kind === 'video' ? 'video' : '');
    const tabId = Number(value.tabId);
    if (!kind || !Number.isInteger(tabId) || tabId < 0) {
      return null;
    }
    const frameId = Number.isInteger(Number(value.frameId)) ? Number(value.frameId) : 0;
    const token = typeof value.token === 'string' && value.token
      ? value.token
      : '';
    if (!token) {
      return null;
    }
    return {
      kind: kind,
      tabId: tabId,
      frameId: frameId,
      token: token,
      url: typeof value.url === 'string' ? value.url : '',
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now()
    };
  }

  function getGlobalPipOwnerRecord(): Promise<PipOwner | null> {
    if (globalPipOwnerCacheLoaded) {
      return Promise.resolve(globalPipOwnerCache);
    }
    const storageArea = getSessionStorageArea();
    if (!storageArea) {
      globalPipOwnerCacheLoaded = true;
      globalPipOwnerCache = null;
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      storageArea.get([GLOBAL_PIP_OWNER_STORAGE_KEY], (result) => {
        const normalized = normalizePipOwnerRecord(
          result ? result[GLOBAL_PIP_OWNER_STORAGE_KEY] : null
        );
        globalPipOwnerCacheLoaded = true;
        globalPipOwnerCache = normalized;
        resolve(normalized);
      });
    });
  }

  function setGlobalPipOwnerRecord(record: PipOwner): Promise<PipOwner | null> {
    const normalized = normalizePipOwnerRecord(record);
    globalPipOwnerCacheLoaded = true;
    globalPipOwnerCache = normalized;
    const storageArea = getSessionStorageArea();
    if (!storageArea) {
      return Promise.resolve(normalized);
    }
    return new Promise((resolve) => {
      storageArea.set({ [GLOBAL_PIP_OWNER_STORAGE_KEY]: normalized }, () => {
        resolve(normalized);
      });
    });
  }

  function clearGlobalPipOwnerRecord(expectedToken?: string): Promise<boolean> {
    const shouldClear = !expectedToken ||
      !globalPipOwnerCache ||
      globalPipOwnerCache.token === expectedToken;
    if (!shouldClear) {
      return Promise.resolve(false);
    }
    globalPipOwnerCacheLoaded = true;
    globalPipOwnerCache = null;
    const storageArea = getSessionStorageArea();
    const remove = storageArea && storageArea.remove;
    if (!storageArea || typeof remove !== 'function') {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      remove.call(storageArea, GLOBAL_PIP_OWNER_STORAGE_KEY, () => {
        resolve(true);
      });
    });
  }

  function createGlobalPipOwnerToken(): string {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `pip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getPipSenderContext(sender: chrome.runtime.MessageSender | null | undefined): PipSenderContext | null {
    const senderTab = sender && sender.tab ? sender.tab : null;
    const tabId = senderTab && typeof senderTab.id === 'number' ? senderTab.id : null;
    if (!senderTab || typeof tabId !== 'number') {
      return null;
    }
    return {
      tabId: tabId,
      frameId: sender && typeof sender.frameId === 'number' ? sender.frameId : 0,
      url: getResolvedTabUrl(senderTab)
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
  function requestSurrender(tabId: number, requestedKind: PipKind, ownerKind: PipKind): Promise<OkReply> {
    return new Promise((resolve) => {
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

  async function forceSurrenderGlobalPipOwner(owner: PipOwner | null, requestedKind: PipKind): Promise<OkReply & { cleared?: boolean }> {
    if (!owner) {
      return { ok: true, cleared: false };
    }
    const result = await requestSurrender(owner.tabId, requestedKind, owner.kind);
    if (result && result.ok) {
      await clearGlobalPipOwnerRecord(owner.token);
      return { ok: true, cleared: true };
    }
    const errorReason = String(result && result.reason ? result.reason : '');
    const isStaleOwner = errorReason.includes('Receiving end does not exist') ||
      errorReason.includes('No tab with id') ||
      errorReason.includes('message port closed');
    if (isStaleOwner) {
      await clearGlobalPipOwnerRecord(owner.token);
      return { ok: true, cleared: true };
    }
    return {
      ok: false,
      reason: result && result.reason ? result.reason : 'surrender-failed'
    };
  }

  async function requestGlobalPipOwnership(sender: chrome.runtime.MessageSender | null | undefined, kind: unknown): Promise<PipOwnershipReply> {
    const context = getPipSenderContext(sender);
    if (!context) {
      return { ok: false, granted: false, reason: 'no-tab' };
    }
    if (kind !== 'video' && kind !== 'document') {
      return { ok: false, granted: false, reason: 'invalid-kind' };
    }

    const currentOwner = await getGlobalPipOwnerRecord();
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
      const surrenderResult = await forceSurrenderGlobalPipOwner(currentOwner, kind);
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
    await setGlobalPipOwnerRecord(nextOwner);
    return {
      ok: true,
      granted: true,
      token: nextOwner.token,
      owner: nextOwner
    };
  }

  async function releaseGlobalPipOwnership(sender: chrome.runtime.MessageSender | null | undefined, token: unknown): Promise<PipReleaseReply> {
    const context = getPipSenderContext(sender);
    if (!context) {
      return { ok: false, released: false, reason: 'no-tab' };
    }
    const currentOwner = await getGlobalPipOwnerRecord();
    if (!currentOwner) {
      return { ok: true, released: true, reason: 'no-owner' };
    }
    const matchesToken = typeof token === 'string' && token && currentOwner.token === token;
    const matchesSender = currentOwner.tabId === context.tabId &&
      currentOwner.frameId === context.frameId;
    if (!matchesToken && !matchesSender) {
      return { ok: true, released: false, reason: 'owner-mismatch' };
    }
    await clearGlobalPipOwnerRecord(currentOwner.token);
    return { ok: true, released: true };
  }

  function clearGlobalPipOwnerForTabId(tabId: unknown): void {
    if (typeof tabId !== 'number') {
      return;
    }
    getGlobalPipOwnerRecord().then((owner) => {
      if (!owner || owner.tabId !== tabId) {
        return;
      }
      clearGlobalPipOwnerRecord(owner.token).catch(() => {});
    }).catch(() => {});
  }

  return Object.freeze({
    clearGlobalPipOwnerForTabId,
    releaseGlobalPipOwnership,
    requestGlobalPipOwnership
  });
}

export { create };
export type { PipOwnership, PipOwnershipChromeApi, PipOwnershipOptions };
