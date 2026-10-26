// Picture-in-picture helpers that run in the page's own JavaScript world,
// where the site's player objects live: entering picture-in-picture on
// Douyin, iQIYI, bilibili and other players, preparing iQIYI for automatic
// picture-in-picture, and leaving it (YouTube's mini player included). Each
// helper is its own *.main-world.ts module; this one sends them to the
// frame that asked.
import { forceExitPiPInMainWorld, youtubeForceExitPiPInMainWorld } from './exit.main-world';
import { iqiyiTryEnterPiPInMainWorld } from './iqiyi-enter.main-world';
import { iqiyiSetupAutoPiPInMainWorld } from './iqiyi-auto-setup.main-world';
import { siteTryEnterPiPInMainWorld } from './site-enter.main-world';

// The extension API this module calls, from chrome or a test double.
interface PipMainWorldChromeApi {
  scripting?: typeof chrome.scripting;
  runtime?: { lastError?: chrome.runtime.LastError };
}

// What a main-world function returned, or why it could not run.
type MainWorldPayload = Record<string, unknown>;

type MainWorldFunction = () => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getSenderFrameTarget(
  sender: Pick<chrome.runtime.MessageSender, 'tab' | 'frameId'> | null | undefined
): { tabId: number; frameId: number } | null {
  const senderTab = sender && sender.tab ? sender.tab : null;
  const tabId = senderTab && typeof senderTab.id === 'number' ? senderTab.id : null;
  if (typeof tabId !== 'number') {
    return null;
  }
  return {
    tabId: tabId,
    frameId: sender && typeof sender.frameId === 'number' ? sender.frameId : 0
  };
}

function normalizeExecuteScriptPayload(results: unknown): MainWorldPayload {
  const first: unknown = Array.isArray(results) && results.length > 0 ? results[0] : null;
  return isRecord(first) && isRecord(first.result) ? first.result : { ok: false, reason: 'no-result' };
}

// Runs `func` in the main world of the frame that sent the message.
function executeMainWorld(
  chromeApi: PipMainWorldChromeApi | null | undefined,
  sender: Pick<chrome.runtime.MessageSender, 'tab' | 'frameId'> | null | undefined,
  func: MainWorldFunction
): Promise<MainWorldPayload> {
  const target = getSenderFrameTarget(sender);
  if (!target) {
    return Promise.resolve({ ok: false, reason: 'no-tab' });
  }
  const scripting = chromeApi ? chromeApi.scripting : null;
  if (!chromeApi || !scripting || typeof scripting.executeScript !== 'function') {
    return Promise.resolve({ ok: false, reason: 'executeScript-unavailable' });
  }
  return new Promise((resolve) => {
    scripting.executeScript({
      target: { tabId: target.tabId, frameIds: [target.frameId] },
      world: 'MAIN',
      func: func
    }, (results) => {
      if (chromeApi.runtime && chromeApi.runtime.lastError) {
        resolve({
          ok: false,
          reason: chromeApi.runtime.lastError.message || 'executeScript-failed'
        });
        return;
      }
      resolve(normalizeExecuteScriptPayload(results));
    });
  });
}

type PipSender = Pick<chrome.runtime.MessageSender, 'tab' | 'frameId'> | null | undefined;

interface PipMainWorld {
  siteTryEnterPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
  iqiyiTryEnterPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
  iqiyiSetupAutoPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
  forceExitPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
  youtubeForceExitPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
}

function create(options?: { chromeApi?: PipMainWorldChromeApi | null } | null): PipMainWorld {
  const settings = options || {};
  const chromeApi: PipMainWorldChromeApi | null = settings.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);

  return {
    siteTryEnterPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, siteTryEnterPiPInMainWorld);
    },
    iqiyiTryEnterPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, iqiyiTryEnterPiPInMainWorld);
    },
    iqiyiSetupAutoPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, iqiyiSetupAutoPiPInMainWorld);
    },
    forceExitPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, forceExitPiPInMainWorld);
    },
    youtubeForceExitPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, youtubeForceExitPiPInMainWorld);
    }
  };
}

export type { MainWorldPayload, PipMainWorld, PipMainWorldChromeApi, PipSender };
export { create, executeMainWorld };
