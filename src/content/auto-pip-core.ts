// Shared auto Picture-in-Picture logic for src/content/site-auto-pip.ts and
// src/content/youtube-auto-pip.ts, loaded after settings.ts by both of their
// content_scripts entries. Nothing here touches the page until a content
// script calls createAutoPipCore.
import * as LumnoSettings from '../domain/settings';
import {
  PIP_PAGE_BRIDGE_REQUEST_EVENT,
  PIP_PAGE_BRIDGE_RESPONSE_EVENT,
  readPipPageBridgeResponse
} from '../domain/pip-page-bridge';
import type { PipPageBridgeRequest } from '../domain/pip-page-bridge';
import type { BackgroundAction, BackgroundReply, BackgroundRequest, OkReply, PageReply } from '../domain/messages';
import * as LumnoMessaging from '../platform/messaging';
import type * as LumnoSettingsStorage from '../platform/settings-storage';

// What the two auto PiP scripts track; each adds fields of its own.
interface AutoPipState {
  autoPipEnabled: boolean;
  activeVideo: HTMLVideoElement | null;
  lastManagedVideo: HTMLVideoElement | null;
  enteringPiP: boolean;
  exitingPiP: boolean;
  // Lumno put the page into picture-in-picture.
  managedPiP: boolean;
  enterRetryTimer: number | null;
  recoveryTimer: number | null;
  // No automatic entering before this time.
  suppressEnterUntil: number;
  mediaSessionHandlerBound: boolean;
  // Retries left while the tab stays hidden.
  hiddenRetryBudget: number;
  shouldResumeInlinePlayback: boolean;
  wasPlayingBeforeHide: boolean;
  // The background's grant of the one picture-in-picture across tabs.
  ownerToken: string;
  runtimeMessageHandlerBound: boolean;
}

interface AutoPipCoreConfig {
  // The background action that leaves PiP from the page's own world.
  mainWorldExitAction: 'forceExitPiPInMainWorld' | 'ytForceExitPiPInMainWorld';
  enterSuppressAfterExitMs: number;
  enterSuppressAfterVisibleMs: number;
}

// The parts each site does differently.
interface AutoPipHooks {
  maybeEnterPiP(reason: string): Promise<boolean>;
  scheduleVisibleRecovery(): void;
  isVideoCandidate(video: HTMLVideoElement): boolean;
  // A higher score wins; null skips the video.
  scoreVideo(video: HTMLVideoElement): number | null;
  getHiddenRetryDelayMs?(): number;
  afterExitAttempt?(): void;
  onPageReturn?(): void;
}

interface AutoPipCoreOptions {
  state: AutoPipState;
  // The page's window, with its constructors.
  window: Window & typeof globalThis;
  document: Document;
  navigator: Navigator;
  chrome: typeof chrome;
  providerStorage: ReturnType<typeof LumnoSettingsStorage.getProviderStorage>;
  config: AutoPipCoreConfig;
  hooks: AutoPipHooks;
}

interface PageBridgeExitResult extends OkReply {
  attempted?: boolean;
  before?: boolean;
  after?: boolean;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

const AUTO_PIP_ENABLED_STORAGE_KEY = LumnoSettings.AUTO_PIP_ENABLED_STORAGE_KEY;
const DOCUMENT_PIP_ACTIVE_FLAG = '__lumno_document_pip_active_2026__';
const MAIN_WORLD_EXIT_TIMEOUT_MS = 760;
const PAGE_BRIDGE_EXIT_TIMEOUT_MS = 520;
const MIN_DEFERRED_ENTER_DELAY_MS = 40;

function normalizeAutoPipEnabled(value: unknown): boolean {
  return value !== false;
}

function isVideoPlaying(video: HTMLMediaElement | null | undefined): boolean {
  if (!video) {
    return false;
  }
  return !video.paused && !video.ended && Number(video.readyState || 0) >= 2;
}

function warnUnexpected(context: string): (error: unknown) => void {
  return (error) => {
    console.warn(`[Lumno] auto PiP: ${context} failed`, error);
  };
}

function createAutoPipCore(options: AutoPipCoreOptions) {
  const { state, window, document, navigator, chrome, providerStorage, config, hooks } = options;

  function setAutoPipEnabled(value: unknown): void {
    state.autoPipEnabled = normalizeAutoPipEnabled(value);
  }

  // The document picture-in-picture picker sets this flag on the page's window.
  function isDocumentPiPActive(): boolean {
    return Reflect.get(window, DOCUMENT_PIP_ACTIVE_FLAG) === true;
  }

  // Resolves with the response, or with { ok: false, reason } on any
  // failure. With timeout ({ ms, minMs }) it also resolves on timeout.
  function sendRuntimeMessage<A extends BackgroundAction>(
    message: BackgroundRequest<A>,
    timeout?: { ms: number; minMs: number }
  ): Promise<BackgroundReply<A> | OkReply> {
    return new Promise((resolve) => {
      if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        resolve({ ok: false, reason: 'no-runtime-sendMessage' });
        return;
      }
      let done = false;
      let timer: number | null = null;
      const finish = (result: BackgroundReply<A> | OkReply): void => {
        if (done) {
          return;
        }
        done = true;
        if (timer) {
          window.clearTimeout(timer);
        }
        resolve(result);
      };
      if (timeout) {
        timer = window.setTimeout(() => {
          finish({ ok: false, reason: 'timeout' });
        }, Math.max(timeout.minMs, Number(timeout.ms)));
      }
      try {
        LumnoMessaging.sendBackgroundMessage(chrome.runtime, message, (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            finish({ ok: false, reason: chrome.runtime.lastError.message || 'runtime-lastError' });
            return;
          }
          finish(response && typeof response === 'object'
            ? response
            : { ok: false, reason: 'empty-response' });
        });
      } catch (error) {
        finish({ ok: false, reason: String(error) });
      }
    });
  }

  async function requestPiPOwnership(kind: string): Promise<{ ok: boolean; granted: boolean; reason?: string }> {
    const response = await sendRuntimeMessage({ action: 'pipRequestOwnership', kind: kind });
    if (response.ok && 'granted' in response && response.granted && response.token) {
      state.ownerToken = String(response.token);
      return { ok: true, granted: true };
    }
    return {
      ok: false,
      granted: false,
      reason: response && response.reason ? String(response.reason) : 'ownership-denied'
    };
  }

  async function releasePiPOwnership(): Promise<unknown> {
    const token = typeof state.ownerToken === 'string' ? state.ownerToken : '';
    state.ownerToken = '';
    if (!token) {
      return { ok: true, released: false, reason: 'no-owner-token' };
    }
    return sendRuntimeMessage({ action: 'pipReleaseOwnership', token: token });
  }

  function clearEnterRetryTimer(): void {
    if (!state.enterRetryTimer) {
      return;
    }
    window.clearTimeout(state.enterRetryTimer);
    state.enterRetryTimer = null;
  }

  function clearRecoveryTimer(): void {
    if (!state.recoveryTimer) {
      return;
    }
    window.clearTimeout(state.recoveryTimer);
    state.recoveryTimer = null;
  }

  function clearPlaybackRecoveryState(): void {
    state.shouldResumeInlinePlayback = false;
    state.wasPlayingBeforeHide = false;
    state.hiddenRetryBudget = 0;
    clearEnterRetryTimer();
    clearRecoveryTimer();
  }

  function syncAutoPipEnabledSetting(): void {
    if (!chrome || !chrome.storage) {
      return;
    }
    const storageArea = providerStorage.area;
    storageArea.get([AUTO_PIP_ENABLED_STORAGE_KEY], (result) => {
      const rawValue = result ? result[AUTO_PIP_ENABLED_STORAGE_KEY] : undefined;
      const normalized = normalizeAutoPipEnabled(rawValue);
      setAutoPipEnabled(normalized);
      if (rawValue !== normalized) {
        storageArea.set({ [AUTO_PIP_ENABLED_STORAGE_KEY]: normalized });
      }
    });
    if (!chrome.storage.onChanged || typeof chrome.storage.onChanged.addListener !== 'function') {
      return;
    }
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (!providerStorage.runtime.isActiveAreaName(areaName)) {
        return;
      }
      if (!changes || !changes[AUTO_PIP_ENABLED_STORAGE_KEY]) {
        return;
      }
      setAutoPipEnabled(changes[AUTO_PIP_ENABLED_STORAGE_KEY].newValue);
      if (!state.autoPipEnabled) {
        clearPlaybackRecoveryState();
      }
      if (!state.autoPipEnabled && (state.managedPiP || document.pictureInPictureElement)) {
        // maybeExitPiP handles its own failures, so a rejection here is a bug.
        maybeExitPiP().catch(warnUnexpected('leaving PiP after auto PiP was turned off'));
      }
    });
  }

  function canEnterPiP(): boolean {
    return typeof document !== 'undefined' && document.pictureInPictureEnabled === true;
  }

  function canExitPiP(): boolean {
    return typeof document !== 'undefined' && typeof document.exitPictureInPicture === 'function';
  }

  function isProbablyHiddenByStyles(element: Element | null | undefined): boolean {
    if (!element || !(element instanceof window.Element)) {
      return true;
    }
    const style = window.getComputedStyle(element);
    return style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity || 1) === 0;
  }

  function getRectArea(video: Element | null | undefined): number {
    if (!video) {
      return 0;
    }
    const rect = video.getBoundingClientRect();
    const width = Math.max(0, Number(rect.width || 0));
    const height = Math.max(0, Number(rect.height || 0));
    return width * height;
  }

  // The highest hooks.scoreVideo score among candidates wins; a null score
  // skips the video. Falls back to the first video on the page.
  function pickPrimaryVideo(): HTMLVideoElement | null {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) {
      return null;
    }
    let best: HTMLVideoElement | null = null;
    let bestScore = -1;
    for (const video of videos) {
      if (!hooks.isVideoCandidate(video)) {
        continue;
      }
      const score = hooks.scoreVideo(video);
      if (score !== null && score > bestScore) {
        bestScore = score;
        best = video;
      }
    }
    return best || videos[0] || null;
  }

  function syncActiveVideo(preferred?: HTMLVideoElement | null): HTMLVideoElement | null {
    state.activeVideo = preferred && hooks.isVideoCandidate(preferred)
      ? preferred
      : pickPrimaryVideo();
    return state.activeVideo;
  }

  function pauseAllManagedMedia(): void {
    Array.from(document.querySelectorAll('video, audio')).forEach((node) => {
      if (!(node instanceof window.HTMLMediaElement) || node.paused || node.ended) {
        return;
      }
      try {
        node.pause();
      } catch (_error) {
        // Ignore pause failures from site-specific players.
      }
    });
  }

  let pageBridgeRequestSeq = 0;

  // Asks the page bridge (pip-page-bridge.ts), running in the page's own
  // world, to exit PiP.
  function requestPageBridgeExitPiP(timeoutMs: number): Promise<PageBridgeExitResult> {
    return new Promise((resolve) => {
      if (typeof window.CustomEvent !== 'function') {
        resolve({ ok: false, reason: 'no-custom-event' });
        return;
      }
      const requestId = ++pageBridgeRequestSeq;
      let done = false;
      let timer = 0;
      const finish = (result: PageBridgeExitResult): void => {
        if (done) {
          return;
        }
        done = true;
        window.removeEventListener(PIP_PAGE_BRIDGE_RESPONSE_EVENT, onResponse, true);
        if (timer) {
          window.clearTimeout(timer);
        }
        resolve(result);
      };
      // The page's answer, as plain data on a CustomEvent from the page's world.
      const onResponse = (event: Event): void => {
        const response = readPipPageBridgeResponse('detail' in event ? event.detail : null);
        if (!response || response.requestId !== requestId) {
          return;
        }
        finish({
          ok: true,
          attempted: response.attempted,
          before: response.before,
          after: response.after,
          error: response.error
        });
      };
      window.addEventListener(PIP_PAGE_BRIDGE_RESPONSE_EVENT, onResponse, true);
      timer = window.setTimeout(() => {
        finish({ ok: false, reason: 'timeout' });
      }, Math.max(120, Number(timeoutMs || PAGE_BRIDGE_EXIT_TIMEOUT_MS)));
      const request: PipPageBridgeRequest = { requestId };
      window.dispatchEvent(new window.CustomEvent(PIP_PAGE_BRIDGE_REQUEST_EVENT, { detail: request }));
    });
  }

  async function maybeExitPiP(): Promise<boolean> {
    if (!canExitPiP() || state.enteringPiP || state.exitingPiP) {
      return false;
    }
    if (!state.managedPiP && !document.pictureInPictureElement) {
      await releasePiPOwnership();
      return true;
    }
    state.exitingPiP = true;
    state.suppressEnterUntil = Date.now() + config.enterSuppressAfterExitMs;
    try {
      await sendRuntimeMessage(
        { action: config.mainWorldExitAction },
        { ms: MAIN_WORLD_EXIT_TIMEOUT_MS, minMs: 160 }
      );
      if (document.pictureInPictureElement) {
        await requestPageBridgeExitPiP(PAGE_BRIDGE_EXIT_TIMEOUT_MS);
      }
      if (hooks.afterExitAttempt) {
        hooks.afterExitAttempt();
      }
      if (!document.pictureInPictureElement) {
        return true;
      }
      await document.exitPictureInPicture();
      return !document.pictureInPictureElement;
    } catch (_error) {
      // exitPictureInPicture rejects when PiP already ended on its own.
      return false;
    } finally {
      state.exitingPiP = false;
      state.managedPiP = false;
      if (hooks.afterExitAttempt) {
        hooks.afterExitAttempt();
      }
      await releasePiPOwnership();
    }
  }

  async function forceSurrenderPiP(reason: string): Promise<OkReply> {
    const isHidden = document.visibilityState === 'hidden';
    if (isHidden) {
      clearPlaybackRecoveryState();
    }
    state.suppressEnterUntil = Date.now() + config.enterSuppressAfterVisibleMs;
    try {
      await maybeExitPiP();
    } catch (_error) {
      // Best effort only.
    }
    if (isHidden) {
      pauseAllManagedMedia();
    }
    state.managedPiP = false;
    await releasePiPOwnership();
    return { ok: true, reason: reason || 'surrendered' };
  }

  // The background asks this tab to give up PiP when another tab takes it.
  function bindRuntimeMessageListener(): void {
    if (state.runtimeMessageHandlerBound) {
      return;
    }
    if (!chrome || !chrome.runtime || !chrome.runtime.onMessage ||
        typeof chrome.runtime.onMessage.addListener !== 'function') {
      return;
    }
    chrome.runtime.onMessage.addListener((
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (reply: PageReply<'lumno:pip-force-surrender'>) => void
    ) => {
      if (!isRecord(message) || message.action !== 'lumno:pip-force-surrender') {
        return;
      }
      forceSurrenderPiP(message.reason ? String(message.reason) : '')
        .then((result) => {
          sendResponse(result);
        })
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            reason: error instanceof Error && error.message ? error.message : String(error || 'surrender-failed')
          });
        });
      return true;
    });
    state.runtimeMessageHandlerBound = true;
  }

  function bindMediaSessionAutoPiP(): void {
    if (state.mediaSessionHandlerBound) {
      return;
    }
    if (!navigator.mediaSession || typeof navigator.mediaSession.setActionHandler !== 'function') {
      return;
    }
    try {
      // A newer action than the DOM types know.
      Reflect.apply(navigator.mediaSession.setActionHandler, navigator.mediaSession, [
        'enterpictureinpicture',
        async () => {
          await hooks.maybeEnterPiP('media_session_action');
        }
      ]);
      state.mediaSessionHandlerBound = true;
    } catch (_error) {
      // Older browser versions may not support this action type.
    }
  }

  // Retries entering PiP while the tab stays hidden: once after the
  // suppression window or the retry delay, then again while
  // state.hiddenRetryBudget lasts.
  function scheduleDeferredEnterPiP(reason?: string): void {
    if (!state.autoPipEnabled) {
      return;
    }
    clearEnterRetryTimer();
    if (document.visibilityState !== 'hidden') {
      return;
    }
    const now = Date.now();
    const suppressUntil = Number(state.suppressEnterUntil || 0);
    const baseDelay = hooks.getHiddenRetryDelayMs
      ? hooks.getHiddenRetryDelayMs()
      : MIN_DEFERRED_ENTER_DELAY_MS;
    const delay = suppressUntil > now
      ? (suppressUntil - now + MIN_DEFERRED_ENTER_DELAY_MS)
      : baseDelay;
    state.enterRetryTimer = window.setTimeout(async () => {
      state.enterRetryTimer = null;
      if (document.visibilityState !== 'hidden') {
        return;
      }
      const entered = await hooks.maybeEnterPiP(reason || 'deferred_hidden_retry');
      if (entered || document.visibilityState !== 'hidden' || state.enterRetryTimer) {
        return;
      }
      if (Number(state.hiddenRetryBudget || 0) <= 0) {
        return;
      }
      state.hiddenRetryBudget = Math.max(0, Number(state.hiddenRetryBudget || 0) - 1);
      scheduleDeferredEnterPiP(`${reason || 'deferred_hidden_retry'}_loop`);
    }, Math.max(MIN_DEFERRED_ENTER_DELAY_MS, delay));
  }

  // Records, as the tab hides, whether inline playback should resume later.
  function capturePlaybackStateOnHide(): void {
    const video = syncActiveVideo(state.lastManagedVideo || state.activeVideo);
    const shouldTrackRecovery = state.autoPipEnabled || state.managedPiP ||
      Boolean(document.pictureInPictureElement);
    state.wasPlayingBeforeHide = Boolean(video && isVideoPlaying(video) && !video.ended);
    state.shouldResumeInlinePlayback = Boolean(
      shouldTrackRecovery &&
      (state.wasPlayingBeforeHide || state.managedPiP || document.pictureInPictureElement)
    );
  }

  function onLeavePictureInPicture(): void {
    state.managedPiP = false;
    if (document.visibilityState === 'visible') {
      hooks.scheduleVisibleRecovery();
    }
  }

  function handlePageReturn(): void {
    if (hooks.onPageReturn) {
      hooks.onPageReturn();
    }
    state.suppressEnterUntil = Date.now() + config.enterSuppressAfterVisibleMs;
    clearEnterRetryTimer();
    hooks.scheduleVisibleRecovery();
  }

  function bindPageReturnListeners(): void {
    window.addEventListener('focus', handlePageReturn, true);
    window.addEventListener('pageshow', handlePageReturn, true);
  }

  return Object.freeze({
    setAutoPipEnabled,
    isDocumentPiPActive,
    sendRuntimeMessage,
    requestPiPOwnership,
    releasePiPOwnership,
    clearEnterRetryTimer,
    clearRecoveryTimer,
    clearPlaybackRecoveryState,
    syncAutoPipEnabledSetting,
    canEnterPiP,
    canExitPiP,
    isProbablyHiddenByStyles,
    getRectArea,
    pickPrimaryVideo,
    syncActiveVideo,
    maybeExitPiP,
    bindRuntimeMessageListener,
    bindMediaSessionAutoPiP,
    scheduleDeferredEnterPiP,
    capturePlaybackStateOnHide,
    onLeavePictureInPicture,
    bindPageReturnListeners
  });
}

type AutoPipCore = ReturnType<typeof createAutoPipCore>;

export type { AutoPipCore, AutoPipCoreConfig, AutoPipCoreOptions, AutoPipHooks, AutoPipState };
export {
  AUTO_PIP_ENABLED_STORAGE_KEY,
  normalizeAutoPipEnabled,
  isVideoPlaying,
  warnUnexpected,
  createAutoPipCore
};
