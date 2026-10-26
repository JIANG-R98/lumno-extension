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
  recoveryTimer: number | null;
  // No automatic entering before this time.
  suppressEnterUntil: number;
  // Retries left while the tab stays hidden.
  hiddenRetryBudget: number;
  shouldResumeInlinePlayback: boolean;
  wasPlayingBeforeHide: boolean;
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

// The page clip picker marks its Picture-in-Picture session in the content registry.
function isDocumentPiPActive(): boolean {
  return isDocumentPipActiveState();
}

// Resolves with the response, or with { ok: false, reason } on any
// failure. With timeout ({ ms, minMs }) it also resolves on timeout.
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
// Asks the page bridge (pip-page-bridge.ts), running in the page's own
// world, to exit PiP.
// The background asks this tab to give up PiP when another tab takes it.
// Retries entering PiP while the tab stays hidden: once after the
// suppression window or the retry delay, then again while
// state.hiddenRetryBudget lasts.
// Records, as the tab hides, whether inline playback should resume later.
// The auto Picture-in-Picture operations both site scripts share, over the
// session state the site script keeps. The core owns its own state: the
// deferred enter timer, the background's grant of the one picture-in-picture
// across tabs, and the listeners it bound.
class AutoPipCore {
  readonly state: AutoPipState;
  private readonly window: Window & typeof globalThis;
  private readonly document: Document;
  private readonly navigator: Navigator;
  private readonly chrome: typeof globalThis.chrome;
  private readonly settingsStore: SettingsStore;
  private readonly config: AutoPipCoreConfig;
  private readonly hooks: AutoPipHooks;
  private enterRetryTimer: number | null = null;
  // The background's grant of the one picture-in-picture across tabs.
  private ownerToken = '';
  private runtimeMessageHandlerBound = false;
  private mediaSessionHandlerBound = false;
  private pageBridgeRequestSeq = 0;

  constructor(options: AutoPipCoreOptions) {
    this.state = options.state;
    this.window = options.window;
    this.document = options.document;
    this.navigator = options.navigator;
    this.chrome = options.chrome;
    this.settingsStore = options.settingsStore;
    this.config = options.config;
    this.hooks = options.hooks;
  }

  hasOwnership(): boolean {
    return Boolean(this.ownerToken);
  }

  isDocumentPiPActive(): boolean {
    return isDocumentPiPActive();
  }

  getRectArea(video: Element | null | undefined): number {
    return getRectArea(video);
  }

  setAutoPipEnabled(value: unknown): void {
    this.state.autoPipEnabled = LumnoSettings.autoPipEnabled.parse(value);
  }


  sendRuntimeMessage<A extends BackgroundAction>(message: BackgroundRequest<A>,
    timeout?: { ms: number; minMs: number }
  ): Promise<BackgroundReply<A> | OkReply> {
    return new Promise((resolve) => {
      if (!this.chrome || !this.chrome.runtime || typeof this.chrome.runtime.sendMessage !== 'function') {
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
          this.window.clearTimeout(timer);
        }
        resolve(result);
      };
      if (timeout) {
        timer = this.window.setTimeout(() => {
          finish({ ok: false, reason: 'timeout' });
        }, Math.max(timeout.minMs, Number(timeout.ms)));
      }
      try {
        LumnoMessaging.sendBackgroundMessage(this.chrome.runtime, message, (response) => {
          if (this.chrome.runtime && this.chrome.runtime.lastError) {
            finish({ ok: false, reason: this.chrome.runtime.lastError.message || 'runtime-lastError' });
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


  async requestPiPOwnership(kind: string): Promise<{ ok: boolean; granted: boolean; reason?: string }> {
    const response = await this.sendRuntimeMessage({ action: 'pipRequestOwnership', kind: kind });
    if (response.ok && 'granted' in response && response.granted && response.token) {
      this.ownerToken = String(response.token);
      return { ok: true, granted: true };
    }
    return {
      ok: false,
      granted: false,
      reason: response && response.reason ? String(response.reason) : 'ownership-denied'
    };
  }


  async releasePiPOwnership(): Promise<unknown> {
    const token = typeof this.ownerToken === 'string' ? this.ownerToken : '';
    this.ownerToken = '';
    if (!token) {
      return { ok: true, released: false, reason: 'no-owner-token' };
    }
    return this.sendRuntimeMessage({ action: 'pipReleaseOwnership', token: token });
  }


  clearEnterRetryTimer(): void {
    if (!this.enterRetryTimer) {
      return;
    }
    this.window.clearTimeout(this.enterRetryTimer);
    this.enterRetryTimer = null;
  }


  clearRecoveryTimer(): void {
    if (!this.state.recoveryTimer) {
      return;
    }
    this.window.clearTimeout(this.state.recoveryTimer);
    this.state.recoveryTimer = null;
  }


  clearPlaybackRecoveryState(): void {
    this.state.shouldResumeInlinePlayback = false;
    this.state.wasPlayingBeforeHide = false;
    this.state.hiddenRetryBudget = 0;
    this.clearEnterRetryTimer();
    this.clearRecoveryTimer();
  }


  syncAutoPipEnabledSetting(): void {
    void this.settingsStore.include(LumnoSettings.autoPipEnabled)
      .then(() => this.setAutoPipEnabled(this.settingsStore.get(LumnoSettings.autoPipEnabled)));
    this.settingsStore.subscribe(LumnoSettings.autoPipEnabled, () => {
      this.setAutoPipEnabled(this.settingsStore.get(LumnoSettings.autoPipEnabled));
      if (!this.state.autoPipEnabled) {
        this.clearPlaybackRecoveryState();
      }
      if (!this.state.autoPipEnabled && (this.state.managedPiP || this.document.pictureInPictureElement)) {
        // maybeExitPiP handles its own failures, so a rejection here is a bug.
        this.maybeExitPiP().catch(warnUnexpected('leaving PiP after auto PiP was turned off'));
      }
    });
  }


  canEnterPiP(): boolean {
    return typeof this.document !== 'undefined' && this.document.pictureInPictureEnabled === true;
  }


  canExitPiP(): boolean {
    return typeof this.document !== 'undefined' && typeof this.document.exitPictureInPicture === 'function';
  }


  isProbablyHiddenByStyles(element: Element | null | undefined): boolean {
    if (!element || !(element instanceof this.window.Element)) {
      return true;
    }
    const style = this.window.getComputedStyle(element);
    return style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity || 1) === 0;
  }


  pickPrimaryVideo(): HTMLVideoElement | null {
    const videos = Array.from(this.document.querySelectorAll('video'));
    if (!videos.length) {
      return null;
    }
    let best: HTMLVideoElement | null = null;
    let bestScore = -1;
    for (const video of videos) {
      if (!this.hooks.isVideoCandidate(video)) {
        continue;
      }
      const score = this.hooks.scoreVideo(video);
      if (score !== null && score > bestScore) {
        bestScore = score;
        best = video;
      }
    }
    return best || videos[0] || null;
  }


  syncActiveVideo(preferred?: HTMLVideoElement | null): HTMLVideoElement | null {
    this.state.activeVideo = preferred && this.hooks.isVideoCandidate(preferred)
      ? preferred
      : this.pickPrimaryVideo();
    return this.state.activeVideo;
  }


  pauseAllManagedMedia(): void {
    Array.from(this.document.querySelectorAll('video, audio')).forEach((node) => {
      if (!(node instanceof this.window.HTMLMediaElement) || node.paused || node.ended) {
        return;
      }
      try {
        node.pause();
      } catch (_error) {
        // Ignore pause failures from site-specific players.
      }
    });
  }


  requestPageBridgeExitPiP(timeoutMs: number): Promise<PageBridgeExitResult> {
    return new Promise((resolve) => {
      if (typeof this.window.CustomEvent !== 'function') {
        resolve({ ok: false, reason: 'no-custom-event' });
        return;
      }
      const requestId = ++this.pageBridgeRequestSeq;
      let done = false;
      let timer = 0;
      const finish = (result: PageBridgeExitResult): void => {
        if (done) {
          return;
        }
        done = true;
        this.window.removeEventListener(PIP_PAGE_BRIDGE_RESPONSE_EVENT, onResponse, true);
        if (timer) {
          this.window.clearTimeout(timer);
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
      this.window.addEventListener(PIP_PAGE_BRIDGE_RESPONSE_EVENT, onResponse, true);
      timer = this.window.setTimeout(() => {
        finish({ ok: false, reason: 'timeout' });
      }, Math.max(120, Number(timeoutMs || PAGE_BRIDGE_EXIT_TIMEOUT_MS)));
      const request: PipPageBridgeRequest = { requestId };
      this.window.dispatchEvent(new this.window.CustomEvent(PIP_PAGE_BRIDGE_REQUEST_EVENT, { detail: request }));
    });
  }


  async maybeExitPiP(): Promise<boolean> {
    if (!this.canExitPiP() || this.state.enteringPiP || this.state.exitingPiP) {
      return false;
    }
    if (!this.state.managedPiP && !this.document.pictureInPictureElement) {
      await this.releasePiPOwnership();
      return true;
    }
    this.state.exitingPiP = true;
    this.state.suppressEnterUntil = Date.now() + this.config.enterSuppressAfterExitMs;
    try {
      await this.sendRuntimeMessage(
        { action: this.config.mainWorldExitAction },
        { ms: MAIN_WORLD_EXIT_TIMEOUT_MS, minMs: 160 }
      );
      if (this.document.pictureInPictureElement) {
        await this.requestPageBridgeExitPiP(PAGE_BRIDGE_EXIT_TIMEOUT_MS);
      }
      if (this.hooks.afterExitAttempt) {
        this.hooks.afterExitAttempt();
      }
      if (!this.document.pictureInPictureElement) {
        return true;
      }
      await this.document.exitPictureInPicture();
      return !this.document.pictureInPictureElement;
    } catch (_error) {
      // exitPictureInPicture rejects when PiP already ended on its own.
      return false;
    } finally {
      this.state.exitingPiP = false;
      this.state.managedPiP = false;
      if (this.hooks.afterExitAttempt) {
        this.hooks.afterExitAttempt();
      }
      await this.releasePiPOwnership();
    }
  }


  async forceSurrenderPiP(reason: string): Promise<OkReply> {
    const isHidden = this.document.visibilityState === 'hidden';
    if (isHidden) {
      this.clearPlaybackRecoveryState();
    }
    this.state.suppressEnterUntil = Date.now() + this.config.enterSuppressAfterVisibleMs;
    try {
      await this.maybeExitPiP();
    } catch (_error) {
      // Best effort only.
    }
    if (isHidden) {
      this.pauseAllManagedMedia();
    }
    this.state.managedPiP = false;
    await this.releasePiPOwnership();
    return { ok: true, reason: reason || 'surrendered' };
  }


  bindRuntimeMessageListener(): void {
    if (this.runtimeMessageHandlerBound) {
      return;
    }
    if (!this.chrome || !this.chrome.runtime || !this.chrome.runtime.onMessage ||
        typeof this.chrome.runtime.onMessage.addListener !== 'function') {
      return;
    }
    this.chrome.runtime.onMessage.addListener((
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (reply: PageReply<'lumno:pip-force-surrender'>) => void
    ) => {
      if (!isRecord(message) || message.action !== 'lumno:pip-force-surrender') {
        return;
      }
      this.forceSurrenderPiP(message.reason ? String(message.reason) : '')
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
    this.runtimeMessageHandlerBound = true;
  }


  bindMediaSessionAutoPiP(): void {
    if (this.mediaSessionHandlerBound) {
      return;
    }
    if (!this.navigator.mediaSession || typeof this.navigator.mediaSession.setActionHandler !== 'function') {
      return;
    }
    try {
      // A newer action than the DOM types know.
      Reflect.apply(this.navigator.mediaSession.setActionHandler, this.navigator.mediaSession, [
        'enterpictureinpicture',
        async () => {
          await this.hooks.maybeEnterPiP('media_session_action');
        }
      ]);
      this.mediaSessionHandlerBound = true;
    } catch (_error) {
      // Older browser versions may not support this action type.
    }
  }


  scheduleDeferredEnterPiP(reason?: string): void {
    if (!this.state.autoPipEnabled) {
      return;
    }
    this.clearEnterRetryTimer();
    if (this.document.visibilityState !== 'hidden') {
      return;
    }
    const now = Date.now();
    const suppressUntil = Number(this.state.suppressEnterUntil || 0);
    const baseDelay = this.hooks.getHiddenRetryDelayMs
      ? this.hooks.getHiddenRetryDelayMs()
      : MIN_DEFERRED_ENTER_DELAY_MS;
    const delay = suppressUntil > now
      ? (suppressUntil - now + MIN_DEFERRED_ENTER_DELAY_MS)
      : baseDelay;
    this.enterRetryTimer = this.window.setTimeout(async () => {
      this.enterRetryTimer = null;
      if (this.document.visibilityState !== 'hidden') {
        return;
      }
      const entered = await this.hooks.maybeEnterPiP(reason || 'deferred_hidden_retry');
      if (entered || this.document.visibilityState !== 'hidden' || this.enterRetryTimer) {
        return;
      }
      if (Number(this.state.hiddenRetryBudget || 0) <= 0) {
        return;
      }
      this.state.hiddenRetryBudget = Math.max(0, Number(this.state.hiddenRetryBudget || 0) - 1);
      this.scheduleDeferredEnterPiP(`${reason || 'deferred_hidden_retry'}_loop`);
    }, Math.max(MIN_DEFERRED_ENTER_DELAY_MS, delay));
  }


  capturePlaybackStateOnHide(): void {
    const video = this.syncActiveVideo(this.state.lastManagedVideo || this.state.activeVideo);
    const shouldTrackRecovery = this.state.autoPipEnabled || this.state.managedPiP ||
      Boolean(this.document.pictureInPictureElement);
    this.state.wasPlayingBeforeHide = Boolean(video && isVideoPlaying(video) && !video.ended);
    this.state.shouldResumeInlinePlayback = Boolean(
      shouldTrackRecovery &&
      (this.state.wasPlayingBeforeHide || this.state.managedPiP || this.document.pictureInPictureElement)
    );
  }


  onLeavePictureInPicture(): void {
    this.state.managedPiP = false;
    if (this.document.visibilityState === 'visible') {
      this.hooks.scheduleVisibleRecovery();
    }
  }


  handlePageReturn(): void {
    if (this.hooks.onPageReturn) {
      this.hooks.onPageReturn();
    }
    this.state.suppressEnterUntil = Date.now() + this.config.enterSuppressAfterVisibleMs;
    this.clearEnterRetryTimer();
    this.hooks.scheduleVisibleRecovery();
  }


  bindPageReturnListeners(): void {
    this.window.addEventListener('focus', (() => this.handlePageReturn()), true);
    this.window.addEventListener('pageshow', (() => this.handlePageReturn()), true);
  }
}

function createAutoPipCore(options: AutoPipCoreOptions): AutoPipCore {
  return new AutoPipCore(options);
}



export type { AutoPipCore, AutoPipCoreConfig, AutoPipCoreOptions, AutoPipHooks, AutoPipState };
export {
  isVideoPlaying,
  warnUnexpected,
  createAutoPipCore
};
