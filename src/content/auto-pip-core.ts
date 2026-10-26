// Shared auto Picture-in-Picture logic for src/content/site-auto-pip.ts and
// src/content/youtube-auto-pip.ts, loaded after settings.ts by both of their
// content_scripts entries. Nothing here touches the page until a content
// script calls createAutoPipCore.
import * as LumnoSettings from '../domain/settings/features';
import {
  PIP_PAGE_BRIDGE_REQUEST_EVENT,
  PIP_PAGE_BRIDGE_RESPONSE_EVENT,
  readPipPageBridgeResponse
} from '../domain/pip-page-bridge';
import type { PipPageBridgeRequest } from '../domain/pip-page-bridge';
import { isDocumentPipActiveState } from '../platform/content-registry';
import type { BackgroundAction, BackgroundReply, BackgroundRequest, OkReply, PageReply } from '../domain/messages';
import * as LumnoMessaging from '../platform/messaging';
import type { SettingsStore } from '../platform/settings-store';

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
  // Holds the auto Picture-in-Picture switch.
  settingsStore: SettingsStore;
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

const MAIN_WORLD_EXIT_TIMEOUT_MS = 760;
const PAGE_BRIDGE_EXIT_TIMEOUT_MS = 520;
const MIN_DEFERRED_ENTER_DELAY_MS = 40;

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

interface AutoPipCoreContext {
  readonly state: AutoPipState;
  readonly window: Window & typeof globalThis;
  readonly document: Document;
  readonly navigator: Navigator;
  readonly chrome: typeof globalThis.chrome;
  readonly settingsStore: SettingsStore;
  readonly config: AutoPipCoreConfig;
  readonly hooks: AutoPipHooks;
  pageBridgeRequestSeq: number;
}

function setAutoPipEnabled(ctx: AutoPipCoreContext, value: unknown): void {
  ctx.state.autoPipEnabled = LumnoSettings.autoPipEnabled.parse(value);
}

// The page clip picker marks its Picture-in-Picture session in the content registry.
function isDocumentPiPActive(): boolean {
  return isDocumentPipActiveState();
}

// Resolves with the response, or with { ok: false, reason } on any
// failure. With timeout ({ ms, minMs }) it also resolves on timeout.
function sendRuntimeMessage<A extends BackgroundAction>(
  ctx: AutoPipCoreContext,
  message: BackgroundRequest<A>,
  timeout?: { ms: number; minMs: number }
): Promise<BackgroundReply<A> | OkReply> {
  return new Promise((resolve) => {
    if (!ctx.chrome || !ctx.chrome.runtime || typeof ctx.chrome.runtime.sendMessage !== 'function') {
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
        ctx.window.clearTimeout(timer);
      }
      resolve(result);
    };
    if (timeout) {
      timer = ctx.window.setTimeout(() => {
        finish({ ok: false, reason: 'timeout' });
      }, Math.max(timeout.minMs, Number(timeout.ms)));
    }
    try {
      LumnoMessaging.sendBackgroundMessage(ctx.chrome.runtime, message, (response) => {
        if (ctx.chrome.runtime && ctx.chrome.runtime.lastError) {
          finish({ ok: false, reason: ctx.chrome.runtime.lastError.message || 'runtime-lastError' });
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

async function requestPiPOwnership(ctx: AutoPipCoreContext, kind: string): Promise<{ ok: boolean; granted: boolean; reason?: string }> {
  const response = await sendRuntimeMessage(ctx, { action: 'pipRequestOwnership', kind: kind });
  if (response.ok && 'granted' in response && response.granted && response.token) {
    ctx.state.ownerToken = String(response.token);
    return { ok: true, granted: true };
  }
  return {
    ok: false,
    granted: false,
    reason: response && response.reason ? String(response.reason) : 'ownership-denied'
  };
}

async function releasePiPOwnership(ctx: AutoPipCoreContext): Promise<unknown> {
  const token = typeof ctx.state.ownerToken === 'string' ? ctx.state.ownerToken : '';
  ctx.state.ownerToken = '';
  if (!token) {
    return { ok: true, released: false, reason: 'no-owner-token' };
  }
  return sendRuntimeMessage(ctx, { action: 'pipReleaseOwnership', token: token });
}

function clearEnterRetryTimer(ctx: AutoPipCoreContext): void {
  if (!ctx.state.enterRetryTimer) {
    return;
  }
  ctx.window.clearTimeout(ctx.state.enterRetryTimer);
  ctx.state.enterRetryTimer = null;
}

function clearRecoveryTimer(ctx: AutoPipCoreContext): void {
  if (!ctx.state.recoveryTimer) {
    return;
  }
  ctx.window.clearTimeout(ctx.state.recoveryTimer);
  ctx.state.recoveryTimer = null;
}

function clearPlaybackRecoveryState(ctx: AutoPipCoreContext): void {
  ctx.state.shouldResumeInlinePlayback = false;
  ctx.state.wasPlayingBeforeHide = false;
  ctx.state.hiddenRetryBudget = 0;
  clearEnterRetryTimer(ctx);
  clearRecoveryTimer(ctx);
}

function syncAutoPipEnabledSetting(ctx: AutoPipCoreContext): void {
  void ctx.settingsStore.include(LumnoSettings.autoPipEnabled)
    .then(() => setAutoPipEnabled(ctx, ctx.settingsStore.get(LumnoSettings.autoPipEnabled)));
  ctx.settingsStore.subscribe(LumnoSettings.autoPipEnabled, () => {
    setAutoPipEnabled(ctx, ctx.settingsStore.get(LumnoSettings.autoPipEnabled));
    if (!ctx.state.autoPipEnabled) {
      clearPlaybackRecoveryState(ctx);
    }
    if (!ctx.state.autoPipEnabled && (ctx.state.managedPiP || ctx.document.pictureInPictureElement)) {
      // maybeExitPiP handles its own failures, so a rejection here is a bug.
      maybeExitPiP(ctx).catch(warnUnexpected('leaving PiP after auto PiP was turned off'));
    }
  });
}

function canEnterPiP(ctx: AutoPipCoreContext): boolean {
  return typeof ctx.document !== 'undefined' && ctx.document.pictureInPictureEnabled === true;
}

function canExitPiP(ctx: AutoPipCoreContext): boolean {
  return typeof ctx.document !== 'undefined' && typeof ctx.document.exitPictureInPicture === 'function';
}

function isProbablyHiddenByStyles(ctx: AutoPipCoreContext, element: Element | null | undefined): boolean {
  if (!element || !(element instanceof ctx.window.Element)) {
    return true;
  }
  const style = ctx.window.getComputedStyle(element);
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
function pickPrimaryVideo(ctx: AutoPipCoreContext): HTMLVideoElement | null {
  const videos = Array.from(ctx.document.querySelectorAll('video'));
  if (!videos.length) {
    return null;
  }
  let best: HTMLVideoElement | null = null;
  let bestScore = -1;
  for (const video of videos) {
    if (!ctx.hooks.isVideoCandidate(video)) {
      continue;
    }
    const score = ctx.hooks.scoreVideo(video);
    if (score !== null && score > bestScore) {
      bestScore = score;
      best = video;
    }
  }
  return best || videos[0] || null;
}

function syncActiveVideo(ctx: AutoPipCoreContext, preferred?: HTMLVideoElement | null): HTMLVideoElement | null {
  ctx.state.activeVideo = preferred && ctx.hooks.isVideoCandidate(preferred)
    ? preferred
    : pickPrimaryVideo(ctx);
  return ctx.state.activeVideo;
}

function pauseAllManagedMedia(ctx: AutoPipCoreContext): void {
  Array.from(ctx.document.querySelectorAll('video, audio')).forEach((node) => {
    if (!(node instanceof ctx.window.HTMLMediaElement) || node.paused || node.ended) {
      return;
    }
    try {
      node.pause();
    } catch (_error) {
      // Ignore pause failures from site-specific players.
    }
  });
}

// Asks the page bridge (pip-page-bridge.ts), running in the page's own
// world, to exit PiP.
function requestPageBridgeExitPiP(ctx: AutoPipCoreContext, timeoutMs: number): Promise<PageBridgeExitResult> {
  return new Promise((resolve) => {
    if (typeof ctx.window.CustomEvent !== 'function') {
      resolve({ ok: false, reason: 'no-custom-event' });
      return;
    }
    const requestId = ++ctx.pageBridgeRequestSeq;
    let done = false;
    let timer = 0;
    const finish = (result: PageBridgeExitResult): void => {
      if (done) {
        return;
      }
      done = true;
      ctx.window.removeEventListener(PIP_PAGE_BRIDGE_RESPONSE_EVENT, onResponse, true);
      if (timer) {
        ctx.window.clearTimeout(timer);
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
    ctx.window.addEventListener(PIP_PAGE_BRIDGE_RESPONSE_EVENT, onResponse, true);
    timer = ctx.window.setTimeout(() => {
      finish({ ok: false, reason: 'timeout' });
    }, Math.max(120, Number(timeoutMs || PAGE_BRIDGE_EXIT_TIMEOUT_MS)));
    const request: PipPageBridgeRequest = { requestId };
    ctx.window.dispatchEvent(new ctx.window.CustomEvent(PIP_PAGE_BRIDGE_REQUEST_EVENT, { detail: request }));
  });
}

async function maybeExitPiP(ctx: AutoPipCoreContext): Promise<boolean> {
  if (!canExitPiP(ctx) || ctx.state.enteringPiP || ctx.state.exitingPiP) {
    return false;
  }
  if (!ctx.state.managedPiP && !ctx.document.pictureInPictureElement) {
    await releasePiPOwnership(ctx);
    return true;
  }
  ctx.state.exitingPiP = true;
  ctx.state.suppressEnterUntil = Date.now() + ctx.config.enterSuppressAfterExitMs;
  try {
    await sendRuntimeMessage(ctx, 
      { action: ctx.config.mainWorldExitAction },
      { ms: MAIN_WORLD_EXIT_TIMEOUT_MS, minMs: 160 }
    );
    if (ctx.document.pictureInPictureElement) {
      await requestPageBridgeExitPiP(ctx, PAGE_BRIDGE_EXIT_TIMEOUT_MS);
    }
    if (ctx.hooks.afterExitAttempt) {
      ctx.hooks.afterExitAttempt();
    }
    if (!ctx.document.pictureInPictureElement) {
      return true;
    }
    await ctx.document.exitPictureInPicture();
    return !ctx.document.pictureInPictureElement;
  } catch (_error) {
    // exitPictureInPicture rejects when PiP already ended on its own.
    return false;
  } finally {
    ctx.state.exitingPiP = false;
    ctx.state.managedPiP = false;
    if (ctx.hooks.afterExitAttempt) {
      ctx.hooks.afterExitAttempt();
    }
    await releasePiPOwnership(ctx);
  }
}

async function forceSurrenderPiP(ctx: AutoPipCoreContext, reason: string): Promise<OkReply> {
  const isHidden = ctx.document.visibilityState === 'hidden';
  if (isHidden) {
    clearPlaybackRecoveryState(ctx);
  }
  ctx.state.suppressEnterUntil = Date.now() + ctx.config.enterSuppressAfterVisibleMs;
  try {
    await maybeExitPiP(ctx);
  } catch (_error) {
    // Best effort only.
  }
  if (isHidden) {
    pauseAllManagedMedia(ctx);
  }
  ctx.state.managedPiP = false;
  await releasePiPOwnership(ctx);
  return { ok: true, reason: reason || 'surrendered' };
}

// The background asks this tab to give up PiP when another tab takes it.
function bindRuntimeMessageListener(ctx: AutoPipCoreContext): void {
  if (ctx.state.runtimeMessageHandlerBound) {
    return;
  }
  if (!ctx.chrome || !ctx.chrome.runtime || !ctx.chrome.runtime.onMessage ||
      typeof ctx.chrome.runtime.onMessage.addListener !== 'function') {
    return;
  }
  ctx.chrome.runtime.onMessage.addListener((
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (reply: PageReply<'lumno:pip-force-surrender'>) => void
  ) => {
    if (!isRecord(message) || message.action !== 'lumno:pip-force-surrender') {
      return;
    }
    forceSurrenderPiP(ctx, message.reason ? String(message.reason) : '')
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
  ctx.state.runtimeMessageHandlerBound = true;
}

function bindMediaSessionAutoPiP(ctx: AutoPipCoreContext): void {
  if (ctx.state.mediaSessionHandlerBound) {
    return;
  }
  if (!ctx.navigator.mediaSession || typeof ctx.navigator.mediaSession.setActionHandler !== 'function') {
    return;
  }
  try {
    // A newer action than the DOM types know.
    Reflect.apply(ctx.navigator.mediaSession.setActionHandler, ctx.navigator.mediaSession, [
      'enterpictureinpicture',
      async () => {
        await ctx.hooks.maybeEnterPiP('media_session_action');
      }
    ]);
    ctx.state.mediaSessionHandlerBound = true;
  } catch (_error) {
    // Older browser versions may not support this action type.
  }
}

// Retries entering PiP while the tab stays hidden: once after the
// suppression window or the retry delay, then again while
// state.hiddenRetryBudget lasts.
function scheduleDeferredEnterPiP(ctx: AutoPipCoreContext, reason?: string): void {
  if (!ctx.state.autoPipEnabled) {
    return;
  }
  clearEnterRetryTimer(ctx);
  if (ctx.document.visibilityState !== 'hidden') {
    return;
  }
  const now = Date.now();
  const suppressUntil = Number(ctx.state.suppressEnterUntil || 0);
  const baseDelay = ctx.hooks.getHiddenRetryDelayMs
    ? ctx.hooks.getHiddenRetryDelayMs()
    : MIN_DEFERRED_ENTER_DELAY_MS;
  const delay = suppressUntil > now
    ? (suppressUntil - now + MIN_DEFERRED_ENTER_DELAY_MS)
    : baseDelay;
  ctx.state.enterRetryTimer = ctx.window.setTimeout(async () => {
    ctx.state.enterRetryTimer = null;
    if (ctx.document.visibilityState !== 'hidden') {
      return;
    }
    const entered = await ctx.hooks.maybeEnterPiP(reason || 'deferred_hidden_retry');
    if (entered || ctx.document.visibilityState !== 'hidden' || ctx.state.enterRetryTimer) {
      return;
    }
    if (Number(ctx.state.hiddenRetryBudget || 0) <= 0) {
      return;
    }
    ctx.state.hiddenRetryBudget = Math.max(0, Number(ctx.state.hiddenRetryBudget || 0) - 1);
    scheduleDeferredEnterPiP(ctx, `${reason || 'deferred_hidden_retry'}_loop`);
  }, Math.max(MIN_DEFERRED_ENTER_DELAY_MS, delay));
}

// Records, as the tab hides, whether inline playback should resume later.
function capturePlaybackStateOnHide(ctx: AutoPipCoreContext): void {
  const video = syncActiveVideo(ctx, ctx.state.lastManagedVideo || ctx.state.activeVideo);
  const shouldTrackRecovery = ctx.state.autoPipEnabled || ctx.state.managedPiP ||
    Boolean(ctx.document.pictureInPictureElement);
  ctx.state.wasPlayingBeforeHide = Boolean(video && isVideoPlaying(video) && !video.ended);
  ctx.state.shouldResumeInlinePlayback = Boolean(
    shouldTrackRecovery &&
    (ctx.state.wasPlayingBeforeHide || ctx.state.managedPiP || ctx.document.pictureInPictureElement)
  );
}

function onLeavePictureInPicture(ctx: AutoPipCoreContext): void {
  ctx.state.managedPiP = false;
  if (ctx.document.visibilityState === 'visible') {
    ctx.hooks.scheduleVisibleRecovery();
  }
}

function handlePageReturn(ctx: AutoPipCoreContext): void {
  if (ctx.hooks.onPageReturn) {
    ctx.hooks.onPageReturn();
  }
  ctx.state.suppressEnterUntil = Date.now() + ctx.config.enterSuppressAfterVisibleMs;
  clearEnterRetryTimer(ctx);
  ctx.hooks.scheduleVisibleRecovery();
}

function bindPageReturnListeners(ctx: AutoPipCoreContext): void {
  ctx.window.addEventListener('focus', (() => handlePageReturn(ctx)), true);
  ctx.window.addEventListener('pageshow', (() => handlePageReturn(ctx)), true);
}

function createAutoPipCore(options: AutoPipCoreOptions) {
  const { state, window, document, navigator, chrome, settingsStore, config, hooks } = options;
  const ctx: AutoPipCoreContext = {
    state,
    window,
    document,
    navigator,
    chrome,
    settingsStore,
    config,
    hooks,
    pageBridgeRequestSeq: 0
  };

  return Object.freeze({
    setAutoPipEnabled: (value: unknown) => setAutoPipEnabled(ctx, value),
    isDocumentPiPActive: () => isDocumentPiPActive(),
    sendRuntimeMessage: <A extends BackgroundAction>(message: BackgroundRequest<A>, timeout?: { ms: number; minMs: number }) =>
      sendRuntimeMessage(ctx, message, timeout),
    requestPiPOwnership: (kind: string) => requestPiPOwnership(ctx, kind),
    releasePiPOwnership: () => releasePiPOwnership(ctx),
    clearEnterRetryTimer: () => clearEnterRetryTimer(ctx),
    clearRecoveryTimer: () => clearRecoveryTimer(ctx),
    clearPlaybackRecoveryState: () => clearPlaybackRecoveryState(ctx),
    syncAutoPipEnabledSetting: () => syncAutoPipEnabledSetting(ctx),
    canEnterPiP: () => canEnterPiP(ctx),
    canExitPiP: () => canExitPiP(ctx),
    isProbablyHiddenByStyles: (element: Element | null | undefined) => isProbablyHiddenByStyles(ctx, element),
    getRectArea: (video: Element | null | undefined) => getRectArea(video),
    pickPrimaryVideo: () => pickPrimaryVideo(ctx),
    syncActiveVideo: (preferred?: HTMLVideoElement | null) => syncActiveVideo(ctx, preferred),
    maybeExitPiP: () => maybeExitPiP(ctx),
    bindRuntimeMessageListener: () => bindRuntimeMessageListener(ctx),
    bindMediaSessionAutoPiP: () => bindMediaSessionAutoPiP(ctx),
    scheduleDeferredEnterPiP: (reason?: string) => scheduleDeferredEnterPiP(ctx, reason),
    capturePlaybackStateOnHide: () => capturePlaybackStateOnHide(ctx),
    onLeavePictureInPicture: () => onLeavePictureInPicture(ctx),
    bindPageReturnListeners: () => bindPageReturnListeners(ctx)
  });
}

type AutoPipCore = ReturnType<typeof createAutoPipCore>;

export type { AutoPipCore, AutoPipCoreConfig, AutoPipCoreOptions, AutoPipHooks, AutoPipState };
export {
  isVideoPlaying,
  warnUnexpected,
  createAutoPipCore
};
