// Automatic picture-in-picture on YouTube: enters it when the tab hides
// with a video playing, and on return undoes YouTube's own PiP and mini
// player leftovers until the video plays inline again.
import { getContextSettingsStore } from '../platform/settings-store';
import * as CORE from './auto-pip-core';
import type { AutoPipState } from './auto-pip-core';
import { claimContentScript } from '../platform/content-registry';
import { ENTER_SUPPRESS_AFTER_EXIT_MS, ENTER_SUPPRESS_AFTER_VISIBLE_MS, HARD_RECOVERY_ATTEMPT, VISIBLE_RECOVERY_FAST_ATTEMPTS, VISIBLE_RECOVERY_FAST_DELAY_MS, VISIBLE_RECOVERY_MAX_ATTEMPTS, VISIBLE_RECOVERY_SLOW_DELAY_MS, VISIBLE_RECOVERY_UI_DEFER_MS } from './youtube-auto-pip-context';
import type { YouTubePipContext } from './youtube-auto-pip-context';
import { clickButton, forceReloadToReturnInlinePlayback, forceRestoreYouTubeInlineContainer, forceUnminimizeViaPlayerApi, getYouTubePiPToggleButtonIfPressed, isVideoCandidate, looksLikeYouTubeGhostPiP, markUiRecoverySuppressed, maybeHardRecoverByReload, scoreVideo, shouldDeferVisibleRecoveryForUi, tryExitYouTubePipLikeModes, trySoftResetPlayerRender } from './youtube-auto-pip-player';

// Whether auto PiP may try to enter now: enabled, nothing else in PiP, the
// tab hidden, and not in the pause after leaving ('retry' then).
function getEnterGate(ctx: YouTubePipContext): 'enter' | 'skip' | 'retry' {
  const { state, core } = ctx;
  if (!state.autoPipEnabled || core.isDocumentPiPActive()) {
    return 'skip';
  }
  if (!core.canEnterPiP() || !core.canExitPiP() || state.enteringPiP || state.exitingPiP) {
    return 'skip';
  }
  if (Date.now() < Number(state.suppressEnterUntil || 0)) {
    return 'retry';
  }
  return document.visibilityState === "hidden" ? 'enter' : 'skip';
}

async function maybeEnterPiP(ctx: YouTubePipContext, reason: string): Promise<boolean> {
  const gate = getEnterGate(ctx);
  if (gate === 'retry') {
    ctx.core.scheduleDeferredEnterPiP(`${reason || "enter"}_suppressed_retry`);
    return false;
  }
  if (gate === 'skip') {
    return false;
  }
  if (document.pictureInPictureElement) {
    return true;
  }

  const activeVideo = ctx.core.syncActiveVideo();
  if (!activeVideo || !CORE.isVideoPlaying(activeVideo)) {
    return false;
  }

  const ownershipResult = await ctx.core.requestPiPOwnership("video");
  if (!ownershipResult.granted) {
    ctx.core.clearPlaybackRecoveryState();
    return false;
  }

  ctx.state.enteringPiP = true;
  try {
    await activeVideo.requestPictureInPicture();
    ctx.state.managedPiP = true;
    ctx.state.lastManagedVideo = activeVideo;
    ctx.core.clearEnterRetryTimer();
    return true;
  } catch (_error) {
    // Best effort: hidden-tab requests can fail without user activation.
    return false;
  } finally {
    ctx.state.enteringPiP = false;
    if (!ctx.state.managedPiP) {
      await ctx.core.releasePiPOwnership();
    }
  }
}

function recoverInlinePlaybackIfNeeded(ctx: YouTubePipContext, attemptIndex: number): void {
  if (document.visibilityState !== "visible") {
    return;
  }
  if (!ctx.state.shouldResumeInlinePlayback) {
    return;
  }

  if (document.pictureInPictureElement) {
    return;
  }

  const video = ctx.core.syncActiveVideo(ctx.state.lastManagedVideo || ctx.state.activeVideo);
  forceUnminimizeViaPlayerApi();
  const pressedPipButton = getYouTubePiPToggleButtonIfPressed();
  const shouldTryYTReset = Boolean(pressedPipButton) || looksLikeYouTubeGhostPiP(ctx, video);

  if (shouldTryYTReset) {
    if (pressedPipButton) {
      clickButton(pressedPipButton);
    }
    tryExitYouTubePipLikeModes(ctx, video);
    forceUnminimizeViaPlayerApi();
    forceRestoreYouTubeInlineContainer();
    trySoftResetPlayerRender(video);
    window.dispatchEvent(new Event("resize"));
  }

  if (video && video.paused && !video.ended) {
    video.play().catch(() => {
      // Ignore autoplay/activation errors on recovery.
    });
  }

  if (attemptIndex >= HARD_RECOVERY_ATTEMPT) {
    maybeHardRecoverByReload(ctx, video);
  }
}

function scheduleVisibleRecovery(ctx: YouTubePipContext): void {
  ctx.core.clearRecoveryTimer();
  if (!ctx.state.shouldResumeInlinePlayback &&
      !ctx.state.managedPiP &&
      !document.pictureInPictureElement) {
    return;
  }

  let attempts = 0;
  const run = async (): Promise<void> => {
    if (shouldDeferVisibleRecoveryForUi(ctx)) {
      ctx.state.recoveryTimer = window.setTimeout(() => {
        run();
      }, VISIBLE_RECOVERY_UI_DEFER_MS);
      return;
    }
    attempts += 1;
    await ctx.core.maybeExitPiP();
    recoverInlinePlaybackIfNeeded(ctx, attempts);

    if (document.visibilityState !== "visible") {
      ctx.core.clearRecoveryTimer();
      return;
    }

    const stillInPiP = Boolean(document.pictureInPictureElement);
    const video = ctx.core.syncActiveVideo(ctx.state.lastManagedVideo || ctx.state.activeVideo);
    const stillGhost = looksLikeYouTubeGhostPiP(ctx, video);
    if ((stillInPiP || stillGhost) && attempts < VISIBLE_RECOVERY_MAX_ATTEMPTS) {
      const delay = attempts < VISIBLE_RECOVERY_FAST_ATTEMPTS
        ? VISIBLE_RECOVERY_FAST_DELAY_MS
        : VISIBLE_RECOVERY_SLOW_DELAY_MS;
      ctx.state.recoveryTimer = window.setTimeout(() => {
        run();
      }, delay);
      return;
    }
    if (stillInPiP || stillGhost) {
      forceReloadToReturnInlinePlayback(ctx);
    }
    ctx.core.clearRecoveryTimer();
  };

  run();
}

function handleVisibilityChange(ctx: YouTubePipContext): void {
  if (document.visibilityState === "hidden") {
    ctx.core.capturePlaybackStateOnHide();
    ctx.core.clearRecoveryTimer();
    ctx.core.scheduleDeferredEnterPiP("visibility_hidden_retry");
    maybeEnterPiP(ctx, "visibility_hidden");
    return;
  }
  if (document.visibilityState === "visible") {
    ctx.core.clearEnterRetryTimer();
    ctx.state.suppressEnterUntil = Date.now() + ENTER_SUPPRESS_AFTER_VISIBLE_MS;
    scheduleVisibleRecovery(ctx);
  }
}

function onVideoEvent(ctx: YouTubePipContext, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLVideoElement)) {
    return;
  }
  ctx.core.syncActiveVideo(target);
  if (event.type === "pause" || event.type === "ended") {
    ctx.state.shouldResumeInlinePlayback = false;
    ctx.state.wasPlayingBeforeHide = false;
  }

  if (event.type === "play" || event.type === "playing") {
    ctx.state.wasPlayingBeforeHide = true;
    if (document.visibilityState === "hidden") {
      ctx.state.shouldResumeInlinePlayback = true;
    }
  }

  if (event.type === "play" && document.visibilityState === "hidden") {
    maybeEnterPiP(ctx, "video_play_hidden");
    return;
  }

  if (event.type === "ended" &&
      target === document.pictureInPictureElement &&
      ctx.state.managedPiP) {
    ctx.core.maybeExitPiP();
  }
}

function onEnterPictureInPicture(ctx: YouTubePipContext, event: Event): void {
  if (ctx.state.enteringPiP) {
    ctx.state.managedPiP = true;
    return;
  }
  const target = event.target;
  ctx.state.managedPiP = Boolean(target && target === ctx.state.activeVideo);
}

function init(ctx: YouTubePipContext): void {
  if (!ctx.core.canExitPiP()) {
    return;
  }
  try {
    const url = new URL(location.href);
    if (url.searchParams.has("lumno_pip_recover")) {
      url.searchParams.delete("lumno_pip_recover");
      history.replaceState(history.state, "", url.toString());
    }
  } catch (_error) {
    // Ignore URL cleanup errors.
  }
  ctx.core.syncActiveVideo();
  ctx.core.bindMediaSessionAutoPiP();
  ctx.core.bindRuntimeMessageListener();

  document.addEventListener("visibilitychange", (() => handleVisibilityChange(ctx)), true);
  document.addEventListener("play", ((event: Event) => onVideoEvent(ctx, event)), true);
  document.addEventListener("playing", ((event: Event) => onVideoEvent(ctx, event)), true);
  document.addEventListener("pause", ((event: Event) => onVideoEvent(ctx, event)), true);
  document.addEventListener("ended", ((event: Event) => onVideoEvent(ctx, event)), true);
  document.addEventListener("enterpictureinpicture", ((event: Event) => onEnterPictureInPicture(ctx, event)), true);
  document.addEventListener("leavepictureinpicture", ctx.core.onLeavePictureInPicture, true);
  document.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    if (target.closest(".ytp-settings-button, .ytp-panel-menu, .ytp-settings-menu")) {
      markUiRecoverySuppressed(ctx, 1200);
    }
  }, true);
  ctx.core.bindPageReturnListeners();
}

function startYouTubeAutoPip(): void {
  if (!claimContentScript('youtube-auto-pip')) {
    return;
  }

  if (window.top !== window.self) {
    return;
  }

  if (!/(^|\.)youtube\.com$/.test(String(location.hostname || "").toLowerCase())) {
    return;
  }
  const state: AutoPipState & { uiRecoverySuppressUntil: number } = {
    autoPipEnabled: false,
    activeVideo: null,
    enteringPiP: false,
    exitingPiP: false,
    managedPiP: false,
    mediaSessionHandlerBound: false,
    lastManagedVideo: null,
    recoveryTimer: null,
    enterRetryTimer: null,
    hiddenRetryBudget: 0,
    suppressEnterUntil: 0,
    uiRecoverySuppressUntil: 0,
    shouldResumeInlinePlayback: false,
    wasPlayingBeforeHide: false,
    ownerToken: "",
    runtimeMessageHandlerBound: false
  };
  const core = CORE.createAutoPipCore({
    state,
    window,
    document,
    navigator,
    chrome,
    settingsStore: getContextSettingsStore(chrome),
    config: {
      mainWorldExitAction: "ytForceExitPiPInMainWorld",
      enterSuppressAfterExitMs: ENTER_SUPPRESS_AFTER_EXIT_MS,
      enterSuppressAfterVisibleMs: ENTER_SUPPRESS_AFTER_VISIBLE_MS
    },
    hooks: {
      maybeEnterPiP: (reason: string) => maybeEnterPiP(ctx, reason),
      scheduleVisibleRecovery: () => scheduleVisibleRecovery(ctx),
      isVideoCandidate: (video: HTMLVideoElement) => isVideoCandidate(video),
      scoreVideo: (video: HTMLVideoElement) => scoreVideo(ctx, video),
      afterExitAttempt: forceUnminimizeViaPlayerApi
    }
  });
  const ctx: YouTubePipContext = {
    state,
    core
  };

  ctx.core.syncAutoPipEnabledSetting();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", (() => init(ctx)), { once: true });
    return;
  }
  init(ctx);
}

startYouTubeAutoPip();
