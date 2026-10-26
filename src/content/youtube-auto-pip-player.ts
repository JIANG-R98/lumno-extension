// YouTube's player: its PiP and mini player buttons, its player API, and
// the ways out of the PiP and mini player modes it leaves behind.
import * as CORE from './auto-pip-core';
import { youtubePipRecoveryReloadAt } from '../domain/settings/page-cache';
import { RECOVERY_RELOAD_GUARD_MS } from './youtube-auto-pip-context';
import type { YouTubePipContext } from './youtube-auto-pip-context';

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
function scoreVideo(ctx: YouTubePipContext, video: HTMLVideoElement): number {
  const playingBoost = CORE.isVideoPlaying(video) ? 1000000000 : 0;
  return playingBoost + ctx.core.getRectArea(video);
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

function isInlineVideoVisible(ctx: YouTubePipContext, video: HTMLVideoElement | null): boolean {
  if (!video || !video.isConnected) {
    return false;
  }
  if (ctx.core.isProbablyHiddenByStyles(video)) {
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

function markUiRecoverySuppressed(ctx: YouTubePipContext, ms: number): void {
  const duration = Math.max(0, Number(ms || 0));
  if (!duration) {
    return;
  }
  ctx.state.uiRecoverySuppressUntil = Math.max(
    Number(ctx.state.uiRecoverySuppressUntil || 0),
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

function shouldDeferVisibleRecoveryForUi(ctx: YouTubePipContext): boolean {
  const suppressUntil = Number(ctx.state.uiRecoverySuppressUntil || 0);
  if (Date.now() < suppressUntil) {
    return true;
  }
  if (isSettingsMenuExpanded()) {
    markUiRecoverySuppressed(ctx, 380);
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

function tryExitYouTubeViaPlayerApi(ctx: YouTubePipContext, video: HTMLVideoElement | null): boolean {
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

  if (video && CORE.isVideoPlaying(video) && !isInlineVideoVisible(ctx, video)) {
    const paused = callPlayerMethod(player, "pauseVideo", []);
    const played = callPlayerMethod(player, "playVideo", []);
    changed = paused.called || played.called || changed;
  }

  return changed;
}

function looksLikeYouTubeGhostPiP(ctx: YouTubePipContext, video: HTMLVideoElement | null): boolean {
  if (document.pictureInPictureElement) {
    return true;
  }
  if (hasYouTubeMiniPlayerState()) {
    return true;
  }
  if (isPressedButton(getYouTubePiPButton()) || isPressedButton(getYouTubeMiniPlayerButton())) {
    return true;
  }
  if (video && CORE.isVideoPlaying(video) && !isInlineVideoVisible(ctx, video)) {
    return true;
  }
  return false;
}

function tryExitYouTubePipLikeModes(ctx: YouTubePipContext, video: HTMLVideoElement | null): boolean {
  const ghostState = looksLikeYouTubeGhostPiP(ctx, video);
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
  changed = tryExitYouTubeViaPlayerApi(ctx, video) || changed;
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

function maybeHardRecoverByReload(ctx: YouTubePipContext, video: HTMLVideoElement | null): void {
  if (document.visibilityState !== "visible") {
    return;
  }
  if (!video || !CORE.isVideoPlaying(video) || isInlineVideoVisible(ctx, video) || document.pictureInPictureElement) {
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

function forceReloadToReturnInlinePlayback(ctx: YouTubePipContext): boolean {
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
    const fallbackVideo = ctx.core.syncActiveVideo(ctx.state.lastManagedVideo || ctx.state.activeVideo);
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

export {
  callPlayerMethod,
  clickButton,
  forceReloadToReturnInlinePlayback,
  forceRestoreYouTubeInlineContainer,
  forceUnminimizeViaPlayerApi,
  getFirstHTMLElement,
  getYouTubeMiniPlayerButton,
  getYouTubePiPButton,
  getYouTubePiPToggleButtonIfPressed,
  getYouTubePlayerApi,
  hasYouTubeMiniPlayerState,
  isElementVisible,
  isInlineVideoVisible,
  isPressedButton,
  isSettingsMenuExpanded,
  isVideoCandidate,
  looksLikeYouTubeGhostPiP,
  markRecoveryReloadNow,
  markUiRecoverySuppressed,
  maybeHardRecoverByReload,
  scoreVideo,
  shouldAllowRecoveryReload,
  shouldDeferVisibleRecoveryForUi,
  tryExitYouTubePipLikeModes,
  tryExitYouTubeViaPlayerApi,
  trySoftResetPlayerRender
};
