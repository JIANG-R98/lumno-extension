// Automatic picture-in-picture on YouTube: enters it when the tab hides
// with a video playing, and on return undoes YouTube's own PiP and mini
// player leftovers until the video plays inline again.
import * as LumnoSettingsStorage from '../platform/settings-storage';
import * as CORE from './auto-pip-core';
import type { AutoPipState } from './auto-pip-core';
import { claimContentScript } from '../platform/content-registry';
import { youtubePipRecoveryReloadAt } from '../domain/settings/page-cache';

(function () {
  if (!claimContentScript('youtube-auto-pip')) {
    return;
  }

  if (window.top !== window.self) {
    return;
  }

  const host = String(location.hostname || "").toLowerCase();
  if (!host || !/(^|\.)youtube\.com$/.test(host)) {
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
  const RECOVERY_RELOAD_GUARD_MS = 15000;
  const ENTER_SUPPRESS_AFTER_EXIT_MS = 1200;
  const ENTER_SUPPRESS_AFTER_VISIBLE_MS = 1400;
  // After the tab is shown again, keep undoing PiP and mini-player leftovers:
  // quickly at first, then more slowly; reload as a last resort.
  const VISIBLE_RECOVERY_MAX_ATTEMPTS = 10;
  const VISIBLE_RECOVERY_FAST_ATTEMPTS = 3;
  const VISIBLE_RECOVERY_FAST_DELAY_MS = 120;
  const VISIBLE_RECOVERY_SLOW_DELAY_MS = 320;
  const VISIBLE_RECOVERY_UI_DEFER_MS = 160;
  const HARD_RECOVERY_ATTEMPT = 8;

  const isVideoPlaying = CORE.isVideoPlaying;
  const core = CORE.createAutoPipCore({
    state,
    window,
    document,
    navigator,
    chrome,
    providerStorage: LumnoSettingsStorage.getProviderStorage(chrome),
    config: {
      mainWorldExitAction: "ytForceExitPiPInMainWorld",
      enterSuppressAfterExitMs: ENTER_SUPPRESS_AFTER_EXIT_MS,
      enterSuppressAfterVisibleMs: ENTER_SUPPRESS_AFTER_VISIBLE_MS
    },
    hooks: {
      maybeEnterPiP,
      scheduleVisibleRecovery,
      isVideoCandidate,
      scoreVideo,
      afterExitAttempt: forceUnminimizeViaPlayerApi
    }
  });
  const syncActiveVideo = core.syncActiveVideo;
  const clearEnterRetryTimer = core.clearEnterRetryTimer;
  const clearRecoveryTimer = core.clearRecoveryTimer;
  const maybeExitPiP = core.maybeExitPiP;

  core.syncAutoPipEnabledSetting();

  function shouldAllowRecoveryReload(): boolean {
    try {
      const raw = sessionStorage.getItem(youtubePipRecoveryReloadAt.key);
      const lastAt = Number(raw || 0);
      if (!lastAt) {
        return true;
      }
      return (Date.now() - lastAt) > RECOVERY_RELOAD_GUARD_MS;
    } catch (_error) {
      return true;
    }
  }

  function markRecoveryReloadNow(): void {
    try {
      sessionStorage.setItem(youtubePipRecoveryReloadAt.key, String(Date.now()));
    } catch (_error) {
      // Ignore storage write failures.
    }
  }

  function isVideoCandidate(video: HTMLVideoElement): boolean {
    return Boolean(video) &&
      !video.disablePictureInPicture &&
      Number(video.videoWidth || 0) > 0 &&
      Number(video.videoHeight || 0) > 0;
  }

  // A playing video always wins; otherwise the largest one does.
  function scoreVideo(video: HTMLVideoElement): number {
    const playingBoost = isVideoPlaying(video) ? 1000000000 : 0;
    return playingBoost + core.getRectArea(video);
  }

  function getFirstHTMLElement(selectors: string[]): HTMLElement | null {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node instanceof HTMLElement) {
        return node;
      }
    }
    return null;
  }

  function getYouTubePiPButton(): HTMLElement | null {
    return getFirstHTMLElement([
      ".ytp-pip-button",
      ".ytp-right-controls .ytp-button.ytp-pip-button"
    ]);
  }

  function getYouTubeMiniPlayerButton(): HTMLElement | null {
    return getFirstHTMLElement([
      ".ytp-miniplayer-button",
      ".ytp-right-controls .ytp-button.ytp-miniplayer-button"
    ]);
  }

  function isPressedButton(button: Element | null): boolean {
    if (!button) {
      return false;
    }
    const ariaPressed = button.getAttribute("aria-pressed");
    if (ariaPressed === "true") {
      return true;
    }
    if (button.classList.contains("ytp-button-active") || button.classList.contains("ytp-active")) {
      return true;
    }
    return false;
  }

  function clickButton(button: Element | null): boolean {
    if (!button) {
      return false;
    }
    try {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function getYouTubePiPToggleButtonIfPressed(): HTMLElement | null {
    const pipButton = getYouTubePiPButton();
    if (isPressedButton(pipButton)) {
      return pipButton;
    }
    const miniplayerButton = getYouTubeMiniPlayerButton();
    if (isPressedButton(miniplayerButton)) {
      return miniplayerButton;
    }
    return null;
  }

  function isInlineVideoVisible(video: HTMLVideoElement | null): boolean {
    if (!video || !video.isConnected) {
      return false;
    }
    if (core.isProbablyHiddenByStyles(video)) {
      return false;
    }
    const rect = video.getBoundingClientRect();
    return Number(rect.width || 0) >= 160 && Number(rect.height || 0) >= 90;
  }

  function isElementVisible(element: Element | null): boolean {
    if (!element || !(element instanceof Element) || !element.isConnected) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0;
  }

  function markUiRecoverySuppressed(ms: number): void {
    const duration = Math.max(0, Number(ms || 0));
    if (!duration) {
      return;
    }
    state.uiRecoverySuppressUntil = Math.max(
      Number(state.uiRecoverySuppressUntil || 0),
      Date.now() + duration
    );
  }

  function isSettingsMenuExpanded(): boolean {
    const settingsButton = document.querySelector(".ytp-settings-button");
    if (settingsButton instanceof Element && settingsButton.getAttribute("aria-expanded") === "true") {
      return true;
    }
    const visibleMenu = document.querySelector(".ytp-settings-menu, .ytp-panel-menu");
    return isElementVisible(visibleMenu);
  }

  function shouldDeferVisibleRecoveryForUi(): boolean {
    const suppressUntil = Number(state.uiRecoverySuppressUntil || 0);
    if (Date.now() < suppressUntil) {
      return true;
    }
    if (isSettingsMenuExpanded()) {
      markUiRecoverySuppressed(380);
      return true;
    }
    return false;
  }

  function hasYouTubeMiniPlayerState(): boolean {
    return Boolean(
      document.querySelector(
        "ytd-app[miniplayer-active_], ytd-app[miniplayer-is-active], ytd-app[miniplayer-active]"
      )
    );
  }

  function forceRestoreYouTubeInlineContainer(): void {
    const app = document.querySelector("ytd-app");
    if (app && app instanceof Element) {
      app.removeAttribute("miniplayer-active_");
      app.removeAttribute("miniplayer-is-active");
      app.removeAttribute("miniplayer-active");
    }

    document.querySelectorAll("ytd-watch-flexy[hidden], #player[hidden], #movie_player[hidden]").forEach((node) => {
      if (node instanceof HTMLElement) {
        node.hidden = false;
      }
      if (node instanceof Element) {
        node.removeAttribute("hidden");
      }
    });

    document.querySelectorAll(".ytp-player-minimized").forEach((node) => {
      if (node instanceof Element) {
        node.classList.remove("ytp-player-minimized");
      }
    });
    document.body.classList.remove("ytp-player-minimized");
    document.documentElement.classList.remove("ytp-player-minimized");
  }

  // YouTube's player object: #movie_player, or the one <ytd-player> holds.
  // Its methods belong to the page and are reached by name.
  function getYouTubePlayerApi(): object | null {
    const moviePlayer = document.getElementById("movie_player");
    if (moviePlayer) {
      return moviePlayer;
    }
    const ytdPlayer = document.querySelector("ytd-player");
    const getPlayer: unknown = ytdPlayer ? Reflect.get(ytdPlayer, "getPlayer") : null;
    if (ytdPlayer && typeof getPlayer === "function") {
      try {
        const player: unknown = Reflect.apply(getPlayer, ytdPlayer, []);
        if (player && typeof player === "object") {
          return player;
        }
      } catch (_error) {
        // Ignore API retrieval errors.
      }
    }
    return null;
  }

  function callPlayerMethod(player: object, methodName: string, args: unknown[]): { called: boolean; value: unknown } {
    const method: unknown = Reflect.get(player, methodName);
    if (typeof method !== "function") {
      return { called: false, value: undefined };
    }
    try {
      return { called: true, value: Reflect.apply(method, player, args) };
    } catch (_error) {
      return { called: false, value: undefined };
    }
  }

  function forceUnminimizeViaPlayerApi(): boolean {
    const player = getYouTubePlayerApi();
    if (!player) {
      return false;
    }
    let changed = false;
    const candidates: unknown[][] = [
      [false],
      [0],
      [null],
      []
    ];
    for (const args of candidates) {
      const result = callPlayerMethod(player, "setMinimized", args);
      changed = result.called || changed;
    }
    return changed;
  }

  function tryExitYouTubeViaPlayerApi(video: HTMLVideoElement | null): boolean {
    const player = getYouTubePlayerApi();
    if (!player) {
      return false;
    }

    let changed = false;
    changed = forceUnminimizeViaPlayerApi() || changed;
    const miniActive = callPlayerMethod(player, "isMiniplayerActive", []).value;
    if (miniActive === true) {
      const toggled = callPlayerMethod(player, "toggleMiniplayer", []);
      changed = toggled.called || changed;
    }

    const exitCandidates: Array<[name: string, args: unknown[]]> = [
      ["exitPictureInPicture", []],
      ["togglePictureInPicture", []],
      ["togglePip", []],
      ["setPictureInPicture", [false]]
    ];
    for (const [name, args] of exitCandidates) {
      const result = callPlayerMethod(player, name, args);
      changed = result.called || changed;
    }

    if (video && isVideoPlaying(video) && !isInlineVideoVisible(video)) {
      const paused = callPlayerMethod(player, "pauseVideo", []);
      const played = callPlayerMethod(player, "playVideo", []);
      changed = paused.called || played.called || changed;
    }

    return changed;
  }

  function looksLikeYouTubeGhostPiP(video: HTMLVideoElement | null): boolean {
    if (document.pictureInPictureElement) {
      return true;
    }
    if (hasYouTubeMiniPlayerState()) {
      return true;
    }
    if (isPressedButton(getYouTubePiPButton()) || isPressedButton(getYouTubeMiniPlayerButton())) {
      return true;
    }
    if (video && isVideoPlaying(video) && !isInlineVideoVisible(video)) {
      return true;
    }
    return false;
  }

  function tryExitYouTubePipLikeModes(video: HTMLVideoElement | null): boolean {
    const ghostState = looksLikeYouTubeGhostPiP(video);
    if (!ghostState) {
      return false;
    }
    let changed = false;
    const pipButton = getYouTubePiPButton();
    const miniButton = getYouTubeMiniPlayerButton();
    if (pipButton && isPressedButton(pipButton)) {
      changed = clickButton(pipButton) || changed;
    }
    if (miniButton && (isPressedButton(miniButton) || hasYouTubeMiniPlayerState())) {
      changed = clickButton(miniButton) || changed;
    }
    changed = tryExitYouTubeViaPlayerApi(video) || changed;
    return changed;
  }

  function trySoftResetPlayerRender(video: HTMLVideoElement | null): void {
    if (!video) {
      return;
    }
    try {
      // Nudges Chromium compositor to repaint when YouTube leaves stale mini-player state.
      video.style.transform = "translateZ(0)";
      requestAnimationFrame(() => {
        video.style.transform = "";
      });
    } catch (_error) {
      // Ignore style mutation errors.
    }
  }

  function maybeHardRecoverByReload(video: HTMLVideoElement | null): void {
    if (document.visibilityState !== "visible") {
      return;
    }
    if (!video || !isVideoPlaying(video) || isInlineVideoVisible(video) || document.pictureInPictureElement) {
      return;
    }
    const url = new URL(location.href);
    const seconds = Math.max(0, Math.floor(Number(video.currentTime || 0)));
    if (seconds > 0) {
      url.searchParams.set("t", String(seconds));
    }
    url.searchParams.set("autoplay", "1");
    location.replace(url.toString());
  }

  function forceReloadToReturnInlinePlayback(): boolean {
    if (document.visibilityState !== "visible") {
      return false;
    }
    if (!shouldAllowRecoveryReload()) {
      return false;
    }

    let seconds = 0;
    const pipElement = document.pictureInPictureElement;
    if (pipElement && pipElement instanceof HTMLVideoElement) {
      seconds = Math.max(0, Math.floor(Number(pipElement.currentTime || 0)));
    }

    if (!seconds) {
      const fallbackVideo = syncActiveVideo(state.lastManagedVideo || state.activeVideo);
      if (fallbackVideo) {
        seconds = Math.max(0, Math.floor(Number(fallbackVideo.currentTime || 0)));
      }
    }

    const url = new URL(location.href);
    if (seconds > 0) {
      url.searchParams.set("t", String(seconds));
    }
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("lumno_pip_recover", "1");
    markRecoveryReloadNow();
    location.replace(url.toString());
    return true;
  }

  async function maybeEnterPiP(reason: string): Promise<boolean> {
    if (!state.autoPipEnabled) {
      return false;
    }
    if (core.isDocumentPiPActive()) {
      return false;
    }
    if (!core.canEnterPiP() || !core.canExitPiP() || state.enteringPiP || state.exitingPiP) {
      return false;
    }
    if (Date.now() < Number(state.suppressEnterUntil || 0)) {
      core.scheduleDeferredEnterPiP(`${reason || "enter"}_suppressed_retry`);
      return false;
    }
    if (document.visibilityState !== "hidden") {
      return false;
    }
    if (document.pictureInPictureElement) {
      return true;
    }

    const activeVideo = syncActiveVideo();
    if (!activeVideo || !isVideoPlaying(activeVideo)) {
      return false;
    }

    const ownershipResult = await core.requestPiPOwnership("video");
    if (!ownershipResult.granted) {
      core.clearPlaybackRecoveryState();
      return false;
    }

    state.enteringPiP = true;
    try {
      await activeVideo.requestPictureInPicture();
      state.managedPiP = true;
      state.lastManagedVideo = activeVideo;
      clearEnterRetryTimer();
      return true;
    } catch (_error) {
      // Best effort: hidden-tab requests can fail without user activation.
      return false;
    } finally {
      state.enteringPiP = false;
      if (!state.managedPiP) {
        await core.releasePiPOwnership();
      }
    }
  }

  function recoverInlinePlaybackIfNeeded(attemptIndex: number): void {
    if (document.visibilityState !== "visible") {
      return;
    }
    if (!state.shouldResumeInlinePlayback) {
      return;
    }

    if (document.pictureInPictureElement) {
      return;
    }

    const video = syncActiveVideo(state.lastManagedVideo || state.activeVideo);
    forceUnminimizeViaPlayerApi();
    const pressedPipButton = getYouTubePiPToggleButtonIfPressed();
    const shouldTryYTReset = Boolean(pressedPipButton) || looksLikeYouTubeGhostPiP(video);

    if (shouldTryYTReset) {
      if (pressedPipButton) {
        clickButton(pressedPipButton);
      }
      tryExitYouTubePipLikeModes(video);
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
      maybeHardRecoverByReload(video);
    }
  }

  function scheduleVisibleRecovery(): void {
    clearRecoveryTimer();
    if (!state.shouldResumeInlinePlayback &&
        !state.managedPiP &&
        !document.pictureInPictureElement) {
      return;
    }

    let attempts = 0;
    const run = async (): Promise<void> => {
      if (shouldDeferVisibleRecoveryForUi()) {
        state.recoveryTimer = window.setTimeout(() => {
          run();
        }, VISIBLE_RECOVERY_UI_DEFER_MS);
        return;
      }
      attempts += 1;
      await maybeExitPiP();
      recoverInlinePlaybackIfNeeded(attempts);

      if (document.visibilityState !== "visible") {
        clearRecoveryTimer();
        return;
      }

      const stillInPiP = Boolean(document.pictureInPictureElement);
      const video = syncActiveVideo(state.lastManagedVideo || state.activeVideo);
      const stillGhost = looksLikeYouTubeGhostPiP(video);
      if ((stillInPiP || stillGhost) && attempts < VISIBLE_RECOVERY_MAX_ATTEMPTS) {
        const delay = attempts < VISIBLE_RECOVERY_FAST_ATTEMPTS
          ? VISIBLE_RECOVERY_FAST_DELAY_MS
          : VISIBLE_RECOVERY_SLOW_DELAY_MS;
        state.recoveryTimer = window.setTimeout(() => {
          run();
        }, delay);
        return;
      }
      if (stillInPiP || stillGhost) {
        forceReloadToReturnInlinePlayback();
      }
      clearRecoveryTimer();
    };

    run();
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
      core.capturePlaybackStateOnHide();
      clearRecoveryTimer();
      core.scheduleDeferredEnterPiP("visibility_hidden_retry");
      maybeEnterPiP("visibility_hidden");
      return;
    }
    if (document.visibilityState === "visible") {
      clearEnterRetryTimer();
      state.suppressEnterUntil = Date.now() + ENTER_SUPPRESS_AFTER_VISIBLE_MS;
      scheduleVisibleRecovery();
    }
  }

  function onVideoEvent(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLVideoElement)) {
      return;
    }
    syncActiveVideo(target);
    if (event.type === "pause" || event.type === "ended") {
      state.shouldResumeInlinePlayback = false;
      state.wasPlayingBeforeHide = false;
    }

    if (event.type === "play" || event.type === "playing") {
      state.wasPlayingBeforeHide = true;
      if (document.visibilityState === "hidden") {
        state.shouldResumeInlinePlayback = true;
      }
    }

    if (event.type === "play" && document.visibilityState === "hidden") {
      maybeEnterPiP("video_play_hidden");
      return;
    }

    if (event.type === "ended" &&
        target === document.pictureInPictureElement &&
        state.managedPiP) {
      maybeExitPiP();
    }
  }

  function onEnterPictureInPicture(event: Event): void {
    if (state.enteringPiP) {
      state.managedPiP = true;
      return;
    }
    const target = event.target;
    state.managedPiP = Boolean(target && target === state.activeVideo);
  }

  function init(): void {
    if (!core.canExitPiP()) {
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
    syncActiveVideo();
    core.bindMediaSessionAutoPiP();
    core.bindRuntimeMessageListener();

    document.addEventListener("visibilitychange", handleVisibilityChange, true);
    document.addEventListener("play", onVideoEvent, true);
    document.addEventListener("playing", onVideoEvent, true);
    document.addEventListener("pause", onVideoEvent, true);
    document.addEventListener("ended", onVideoEvent, true);
    document.addEventListener("enterpictureinpicture", onEnterPictureInPicture, true);
    document.addEventListener("leavepictureinpicture", core.onLeavePictureInPicture, true);
    document.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }
      if (target.closest(".ytp-settings-button, .ytp-panel-menu, .ytp-settings-menu")) {
        markUiRecoverySuppressed(1200);
      }
    }, true);
    core.bindPageReturnListeners();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
    return;
  }
  init();
})();
