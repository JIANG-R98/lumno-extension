// Automatic picture-in-picture on video sites other than YouTube, with a
// player profile per site for finding the real player and for the sites
// that only enter PiP from the page's own world.
import { getContextSettingsStore } from '../platform/settings-store';
import * as CORE from './auto-pip-core';
import type { AutoPipState } from './auto-pip-core';
import { isAutoPipBlacklistedHost } from './auto-pip-blacklist';
import { claimContentScript } from '../platform/content-registry';
import { getMatchedProfile } from './site-auto-pip-profiles';

import { ENTER_SUPPRESS_AFTER_EXIT_MS, ENTER_SUPPRESS_AFTER_VISIBLE_MS, MAIN_WORLD_ENTER_TIMEOUT_MS, QUICK_REHIDE_BYPASS_MS, VISIBLE_RECOVERY_FAST_ATTEMPTS, VISIBLE_RECOVERY_FAST_DELAY_MS, VISIBLE_RECOVERY_MAX_ATTEMPTS, VISIBLE_RECOVERY_SLOW_DELAY_MS } from './site-auto-pip-context';
import type { SitePipContext } from './site-auto-pip-context';
import { getHiddenRetryDelayMs, getHiddenRetryLimit, isVideoCandidate, isVideoVisibleEnough, markPlaybackIntentFromActiveVideo, reloadJingxuanModalIfNeeded, requestMainWorldSetup, scoreVideo } from './site-auto-pip-video';

// Enters PiP, lifting the site's disablePictureInPicture for the request
// where the profile allows it.
async function requestVideoPictureInPicture(ctx: SitePipContext, video: HTMLVideoElement): Promise<boolean> {
  if (typeof video.requestPictureInPicture !== "function") {
    return false;
  }
  const allowDisablePiP = Boolean(ctx.matchedProfile && ctx.matchedProfile.allowDisablePiP);
  const hadDisableAttr = video.hasAttribute("disablepictureinpicture");
  const previousDisable = Boolean(video.disablePictureInPicture);
  if (allowDisablePiP && previousDisable) {
    try {
      video.disablePictureInPicture = false;
      if (hadDisableAttr) {
        video.removeAttribute("disablepictureinpicture");
      }
    } catch (_error) {
      // Ignore property/attribute write errors.
    }
  }
  try {
    await video.requestPictureInPicture();
    return true;
  } finally {
    if (allowDisablePiP && previousDisable) {
      try {
        video.disablePictureInPicture = previousDisable;
        if (hadDisableAttr) {
          video.setAttribute("disablepictureinpicture", "");
        }
      } catch (_error) {
        // Ignore restore errors.
      }
    }
  }
}

// Whether auto PiP may try to enter now: enabled, nothing else in PiP, the
// tab hidden, after a user gesture, and not in the pause after leaving.
// 'retry' when it was asked too soon and will try again.
function getEnterGate(ctx: SitePipContext, reason: string): 'enter' | 'skip' | 'retry' {
  const { state, core } = ctx;
  if (!state.autoPipEnabled || core.isDocumentPiPActive()) {
    return 'skip';
  }
  if (!core.canEnterPiP() || !core.canExitPiP() || state.enteringPiP || state.exitingPiP) {
    return 'skip';
  }
  const allowNoUserGesture = Boolean(ctx.matchedProfile && ctx.matchedProfile.allowNoUserGesture);
  if (!state.hadUserGesture && !allowNoUserGesture && reason !== "media_session_action") {
    return 'skip';
  }
  if (Date.now() < Number(state.suppressEnterUntil || 0)) {
    return 'retry';
  }
  return document.visibilityState === "hidden" ? 'enter' : 'skip';
}

// The playing video, or the last one auto PiP managed when it still qualifies.
function pickEnterVideo(ctx: SitePipContext): HTMLVideoElement | null {
  const activeVideo = ctx.core.syncActiveVideo();
  if ((!activeVideo || !CORE.isVideoPlaying(activeVideo)) && isVideoCandidate(ctx, ctx.state.lastManagedVideo)) {
    return ctx.core.syncActiveVideo(ctx.state.lastManagedVideo);
  }
  return activeVideo;
}

// PiP ownership across tabs, asked for once per attempt.
interface OwnershipClaim {
  granted: boolean;
  ensure(): Promise<boolean>;
}

function createOwnershipClaim(ctx: SitePipContext): OwnershipClaim {
  const claim: OwnershipClaim = {
    granted: false,
    async ensure() {
      if (claim.granted || ctx.state.ownerToken) {
        claim.granted = true;
        return true;
      }
      const ownershipResult = await ctx.core.requestPiPOwnership("video");
      if (!ownershipResult.granted) {
        ctx.core.clearPlaybackRecoveryState();
        return false;
      }
      claim.granted = true;
      return true;
    }
  };
  return claim;
}

function markManagedPiP(ctx: SitePipContext, video: Element | null): void {
  ctx.state.managedPiP = true;
  if (video instanceof HTMLVideoElement) {
    ctx.state.lastManagedVideo = video;
  }
  ctx.state.hiddenRetryBudget = 0;
  ctx.core.clearEnterRetryTimer();
}

// Sites whose player only enters PiP from the page's own world: true once
// it entered, false when it may not, null to try the video element next.
async function enterFromMainWorld(
  ctx: SitePipContext,
  mainWorldEnter: NonNullable<SitePipContext['mainWorldEnter']>,
  claim: OwnershipClaim
): Promise<boolean | null> {
  if (!(await claim.ensure())) {
    return false;
  }
  if (mainWorldEnter.setupAction) {
    await requestMainWorldSetup(ctx);
  }
  await ctx.core.sendRuntimeMessage(
    { action: mainWorldEnter.action },
    { ms: MAIN_WORLD_ENTER_TIMEOUT_MS, minMs: 160 }
  );
  // Read afresh: the page entered PiP while this function waited.
  const pipElement = getPictureInPictureElement();
  if (pipElement) {
    markManagedPiP(ctx, pipElement);
    return true;
  }
  return null;
}

// Enters PiP on the video element itself, if it is visible enough.
async function enterVideoElement(ctx: SitePipContext, activeVideo: HTMLVideoElement, claim: OwnershipClaim): Promise<boolean> {
  const allowEnterWhenHiddenVideo = Boolean(
    ctx.matchedProfile &&
    ctx.matchedProfile.allowEnterWhenHiddenVideo &&
    document.visibilityState === "hidden"
  );
  if (!allowEnterWhenHiddenVideo && !isVideoVisibleEnough(ctx, activeVideo)) {
    return false;
  }
  if (!(await claim.ensure())) {
    return false;
  }
  ctx.state.enteringPiP = true;
  try {
    const entered = await requestVideoPictureInPicture(ctx, activeVideo);
    if (!entered) {
      return false;
    }
    markManagedPiP(ctx, activeVideo);
    return true;
  } catch (_error) {
    return false;
  } finally {
    ctx.state.enteringPiP = false;
    if (!ctx.state.managedPiP && claim.granted) {
      await ctx.core.releasePiPOwnership();
    }
  }
}

async function maybeEnterPiP(ctx: SitePipContext, reason: string): Promise<boolean> {
  const gate = getEnterGate(ctx, reason);
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
  const activeVideo = pickEnterVideo(ctx);
  const claim = createOwnershipClaim(ctx);
  const { mainWorldEnter } = ctx;
  if (mainWorldEnter && mainWorldEnter.requiresPlaying && !CORE.isVideoPlaying(activeVideo)) {
    return false;
  }
  if (mainWorldEnter) {
    const entered = await enterFromMainWorld(ctx, mainWorldEnter, claim);
    if (entered !== null) {
      return entered;
    }
  }
  if (!activeVideo || !CORE.isVideoPlaying(activeVideo)) {
    return false;
  }
  return enterVideoElement(ctx, activeVideo, claim);
}

function recoverInlinePlaybackIfNeeded(ctx: SitePipContext): void {
  if (document.visibilityState !== "visible") {
    return;
  }
  if (!ctx.state.shouldResumeInlinePlayback) {
    return;
  }
  if (document.pictureInPictureElement) {
    return;
  }
  if (reloadJingxuanModalIfNeeded(ctx)) {
    return;
  }
  const video = ctx.core.syncActiveVideo(ctx.state.lastManagedVideo || ctx.state.activeVideo);
  if (video && video.paused && !video.ended) {
    video.play().catch(() => {
      // Expected when autoplay policy blocks playback or a pause interrupts it.
    });
  }
}

function scheduleVisibleRecovery(ctx: SitePipContext): void {
  ctx.core.clearRecoveryTimer();
  if (!ctx.state.shouldResumeInlinePlayback &&
      !ctx.state.managedPiP &&
      !document.pictureInPictureElement) {
    return;
  }
  if (!ctx.state.managedPiP && !document.pictureInPictureElement) {
    recoverInlinePlaybackIfNeeded(ctx);
    return;
  }

  let attempts = 0;
  const run = async (): Promise<void> => {
    attempts += 1;
    await ctx.core.maybeExitPiP();
    if (reloadJingxuanModalIfNeeded(ctx)) {
      ctx.core.clearRecoveryTimer();
      return;
    }
    recoverInlinePlaybackIfNeeded(ctx);
    if (document.visibilityState !== "visible") {
      ctx.core.clearRecoveryTimer();
      return;
    }
    if (document.pictureInPictureElement && attempts < VISIBLE_RECOVERY_MAX_ATTEMPTS) {
      ctx.state.recoveryTimer = window.setTimeout(
        run,
        attempts < VISIBLE_RECOVERY_FAST_ATTEMPTS
          ? VISIBLE_RECOVERY_FAST_DELAY_MS
          : VISIBLE_RECOVERY_SLOW_DELAY_MS
      );
      return;
    }
    ctx.core.clearRecoveryTimer();
  };
  run();
}

function handleVisibilityChange(ctx: SitePipContext): void {
  if (document.visibilityState === "hidden") {
    ctx.core.capturePlaybackStateOnHide();
    ctx.state.hiddenRetryBudget = getHiddenRetryLimit(ctx);
    if (ctx.mainWorldEnter && ctx.mainWorldEnter.setupAction) {
      // sendRuntimeMessage reports failures in its result instead of rejecting.
      requestMainWorldSetup(ctx).catch(CORE.warnUnexpected("main-world PiP setup"));
    }
    const now = Date.now();
    const visibleSuppressStart = Number(ctx.state.lastVisibleAt || 0);
    const isQuickRehide = visibleSuppressStart > 0 &&
      (now - visibleSuppressStart) <= QUICK_REHIDE_BYPASS_MS;
    if (isQuickRehide && Number(ctx.state.suppressEnterUntil || 0) > now) {
      ctx.state.suppressEnterUntil = 0;
    }
    ctx.core.clearRecoveryTimer();
    ctx.core.scheduleDeferredEnterPiP("visibility_hidden_retry");
    maybeEnterPiP(ctx, "visibility_hidden");
    return;
  }
  if (document.visibilityState === "visible") {
    markPlaybackIntentFromActiveVideo(ctx);
    ctx.state.hiddenRetryBudget = 0;
    ctx.state.lastVisibleAt = Date.now();
    ctx.core.clearEnterRetryTimer();
    ctx.state.suppressEnterUntil = Date.now() + ENTER_SUPPRESS_AFTER_VISIBLE_MS;
    scheduleVisibleRecovery(ctx);
  }
}

// Playback started: remember it, and enter PiP when the tab is hidden.
function onVideoPlay(ctx: SitePipContext): void {
  ctx.state.hadUserGesture = true;
  ctx.state.wasPlayingBeforeHide = true;
  if (document.visibilityState === "hidden") {
    ctx.state.shouldResumeInlinePlayback = true;
    maybeEnterPiP(ctx, "video_play_hidden");
  }
}

function onVideoEvent(ctx: SitePipContext, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLVideoElement)) {
    return;
  }
  ctx.core.syncActiveVideo(target);
  if (event.type === "play" || event.type === "playing") {
    onVideoPlay(ctx);
    return;
  }
  if (event.type === "pause" || event.type === "ended") {
    ctx.state.shouldResumeInlinePlayback = false;
    ctx.state.wasPlayingBeforeHide = false;
  }
  if (event.type === "ended" && target === document.pictureInPictureElement && ctx.state.managedPiP) {
    ctx.core.maybeExitPiP();
  }
}

function onEnterPictureInPicture(ctx: SitePipContext, event: Event): void {
  if (ctx.state.enteringPiP || document.visibilityState === "hidden") {
    ctx.state.managedPiP = true;
    return;
  }
  const target = event.target;
  ctx.state.managedPiP = Boolean(target && target === ctx.state.lastManagedVideo);
}

function getPictureInPictureElement(): Element | null {
  return document.pictureInPictureElement;
}

function markUserGesture(ctx: SitePipContext): void {
  ctx.state.hadUserGesture = true;
}

function init(ctx: SitePipContext): void {
  if (!ctx.core.canExitPiP()) {
    return;
  }
  if (ctx.mainWorldEnter && ctx.mainWorldEnter.setupAction) {
    // sendRuntimeMessage reports failures in its result instead of rejecting.
    requestMainWorldSetup(ctx).catch(CORE.warnUnexpected("main-world PiP setup"));
  }
  ctx.core.syncActiveVideo();
  markPlaybackIntentFromActiveVideo(ctx);
  ctx.core.bindMediaSessionAutoPiP();
  ctx.core.bindRuntimeMessageListener();

  document.addEventListener("pointerdown", (() => markUserGesture(ctx)), true);
  document.addEventListener("keydown", (() => markUserGesture(ctx)), true);
  document.addEventListener("touchstart", (() => markUserGesture(ctx)), true);
  document.addEventListener("visibilitychange", (() => handleVisibilityChange(ctx)), true);
  document.addEventListener("play", ((event: Event) => onVideoEvent(ctx, event)), true);
  document.addEventListener("playing", ((event: Event) => onVideoEvent(ctx, event)), true);
  document.addEventListener("pause", ((event: Event) => onVideoEvent(ctx, event)), true);
  document.addEventListener("ended", ((event: Event) => onVideoEvent(ctx, event)), true);
  document.addEventListener("loadedmetadata", ((event: Event) => onVideoEvent(ctx, event)), true);
  document.addEventListener("enterpictureinpicture", ((event: Event) => onEnterPictureInPicture(ctx, event)), true);
  document.addEventListener("leavepictureinpicture", ctx.core.onLeavePictureInPicture, true);
  ctx.core.bindPageReturnListeners();
}

function startSiteAutoPip(): void {
  if (!claimContentScript('site-auto-pip')) {
    return;
  }

  if (window.top !== window.self) {
    return;
  }

  const state: AutoPipState & { lastVisibleAt: number; hadUserGesture: boolean; douyinModalReloadAt: number } = {
    autoPipEnabled: false,
    activeVideo: null,
    lastManagedVideo: null,
    enteringPiP: false,
    exitingPiP: false,
    managedPiP: false,
    enterRetryTimer: null,
    recoveryTimer: null,
    suppressEnterUntil: 0,
    lastVisibleAt: 0,
    hadUserGesture: false,
    mediaSessionHandlerBound: false,
    hiddenRetryBudget: 0,
    shouldResumeInlinePlayback: false,
    wasPlayingBeforeHide: false,
    ownerToken: '',
    runtimeMessageHandlerBound: false,
    douyinModalReloadAt: 0
  };

  const host = String(location.hostname || "").toLowerCase();
  const core = CORE.createAutoPipCore({
    state,
    window,
    document,
    navigator,
    chrome,
    settingsStore: getContextSettingsStore(chrome),
    config: {
      mainWorldExitAction: "forceExitPiPInMainWorld",
      enterSuppressAfterExitMs: ENTER_SUPPRESS_AFTER_EXIT_MS,
      enterSuppressAfterVisibleMs: ENTER_SUPPRESS_AFTER_VISIBLE_MS
    },
    hooks: {
      maybeEnterPiP: (reason: string) => maybeEnterPiP(ctx, reason),
      scheduleVisibleRecovery: () => scheduleVisibleRecovery(ctx),
      isVideoCandidate: (video: HTMLVideoElement | null) => isVideoCandidate(ctx, video),
      scoreVideo: (video: HTMLVideoElement) => scoreVideo(ctx, video),
      getHiddenRetryDelayMs: () => getHiddenRetryDelayMs(ctx),
      onPageReturn: (() => markPlaybackIntentFromActiveVideo(ctx))
    }
  });

  const matchedProfile = getMatchedProfile(host);
  const profileSelectors = matchedProfile && Array.isArray(matchedProfile.selectors)
    ? matchedProfile.selectors
    : [];
  const profileRejectSelectors = matchedProfile && Array.isArray(matchedProfile.rejectSelectors)
    ? matchedProfile.rejectSelectors
    : [];
  const mainWorldEnter = matchedProfile && matchedProfile.mainWorldEnter
    ? matchedProfile.mainWorldEnter
    : null;
  const ctx: SitePipContext = {
    state,
    host,
    core,
    matchedProfile,
    profileSelectors,
    profileRejectSelectors,
    mainWorldEnter
  };

  ctx.core.syncAutoPipEnabledSetting();
  if (ctx.host && isAutoPipBlacklistedHost(ctx.host)) {
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", (() => init(ctx)), { once: true });
    return;
  }
  init(ctx);
}

startSiteAutoPip();
