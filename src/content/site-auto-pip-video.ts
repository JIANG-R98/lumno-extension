// Finding the site's real player: visibility, audibility, the profile's
// selectors, and the main-world setup some sites need.
import * as CORE from './auto-pip-core';

import { DEFAULT_HIDDEN_RETRY_DELAY_MS, DEFAULT_HIDDEN_RETRY_LIMIT, DOUYIN_MODAL_RECOVERY_RELOAD_GUARD_MS, MAIN_WORLD_SETUP_TIMEOUT_MS, MIN_VISIBLE_AREA, MIN_VISIBLE_HEIGHT, MIN_VISIBLE_WIDTH } from './site-auto-pip-context';
import type { SitePipContext } from './site-auto-pip-context';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}


function isJingxuanModalUrl(ctx: SitePipContext): boolean {
  if (!ctx.matchedProfile || !ctx.matchedProfile.reloadsJingxuanModal) {
    return false;
  }
  try {
    const url = new URL(location.href);
    return url.pathname === "/jingxuan" && url.searchParams.has("modal_id");
  } catch (_error) {
    return false;
  }
}

function requestMainWorldSetup(ctx: SitePipContext): Promise<unknown> {
  if (!ctx.mainWorldEnter || !ctx.mainWorldEnter.setupAction) {
    return Promise.resolve({ ok: false, reason: "no-main-world-setup" });
  }
  return ctx.core.sendRuntimeMessage(
    { action: ctx.mainWorldEnter.setupAction },
    { ms: MAIN_WORLD_SETUP_TIMEOUT_MS, minMs: 200 }
  );
}

function getHiddenRetryLimit(ctx: SitePipContext): number {
  const value = Number(ctx.matchedProfile && ctx.matchedProfile.hiddenRetryLimit);
  if (Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return DEFAULT_HIDDEN_RETRY_LIMIT;
}

function getHiddenRetryDelayMs(ctx: SitePipContext): number {
  const value = Number(ctx.matchedProfile && ctx.matchedProfile.hiddenRetryDelayMs);
  if (Number.isFinite(value) && value >= 40) {
    return Math.floor(value);
  }
  return DEFAULT_HIDDEN_RETRY_DELAY_MS;
}

// The part of the video inside the viewport.
function getVisibleArea(video: Element | null): number {
  if (!video) {
    return 0;
  }
  const rect = video.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  if (vw <= 0 || vh <= 0) {
    return 0;
  }
  const left = Math.max(0, Math.min(vw, rect.left));
  const right = Math.max(0, Math.min(vw, rect.right));
  const top = Math.max(0, Math.min(vh, rect.top));
  const bottom = Math.max(0, Math.min(vh, rect.bottom));
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return width * height;
}

function isVideoVisibleEnough(ctx: SitePipContext, video: HTMLVideoElement | null): boolean {
  if (!video || !video.isConnected || ctx.core.isProbablyHiddenByStyles(video)) {
    return false;
  }
  const rect = video.getBoundingClientRect();
  const width = Number(rect.width || 0);
  const height = Number(rect.height || 0);
  if (width < MIN_VISIBLE_WIDTH || height < MIN_VISIBLE_HEIGHT) {
    return false;
  }
  const profileMinArea = ctx.matchedProfile ? Number(ctx.matchedProfile.minVisibleArea) : 0;
  const minArea = profileMinArea > 0 ? profileMinArea : MIN_VISIBLE_AREA;
  return getVisibleArea(video) >= minArea;
}

function hasAnyPlayingMedia(): boolean {
  const mediaNodes = Array.from(document.querySelectorAll("video, audio"));
  return mediaNodes.some((node) => {
    return node instanceof HTMLMediaElement &&
      !node.paused &&
      !node.ended &&
      Number(node.readyState || 0) >= 2;
  });
}

function shouldRecoverJingxuanModalByReload(ctx: SitePipContext): boolean {
  if (!isJingxuanModalUrl(ctx)) {
    return false;
  }
  const activeVideo = ctx.core.syncActiveVideo(ctx.state.lastManagedVideo || ctx.state.activeVideo);
  if (activeVideo && activeVideo.isConnected && isVideoVisibleEnough(ctx, activeVideo)) {
    return false;
  }
  return hasAnyPlayingMedia() || ctx.state.shouldResumeInlinePlayback;
}

function reloadJingxuanModalIfNeeded(ctx: SitePipContext): boolean {
  if (!shouldRecoverJingxuanModalByReload(ctx)) {
    return false;
  }
  const now = Date.now();
  if ((now - Number(ctx.state.douyinModalReloadAt || 0)) < DOUYIN_MODAL_RECOVERY_RELOAD_GUARD_MS) {
    return false;
  }
  ctx.state.douyinModalReloadAt = now;
  location.replace(location.href);
  return true;
}

function isLikelyAudible(video: HTMLVideoElement | null): boolean {
  if (!video) {
    return false;
  }
  if (video.muted || Number(video.volume || 0) === 0) {
    return false;
  }
  // AudioTrackList is missing from some browsers and from the DOM types.
  const audioTracks: unknown = Reflect.get(video, "audioTracks");
  const trackCount = isRecord(audioTracks) && typeof audioTracks.length === "number" ? audioTracks.length : 0;
  if (isRecord(audioTracks) && trackCount > 0) {
    for (let i = 0; i < trackCount; i += 1) {
      const track: unknown = Reflect.get(audioTracks, i);
      if (isRecord(track) && track.enabled !== false) {
        return true;
      }
    }
    return false;
  }
  return true;
}

function isRejectedByProfile(ctx: SitePipContext, video: HTMLVideoElement | null): boolean {
  if (!video || ctx.profileRejectSelectors.length === 0) {
    return false;
  }
  for (const selector of ctx.profileRejectSelectors) {
    try {
      if (video.matches(selector)) {
        return true;
      }
    } catch (_error) {
      // Ignore invalid selector and continue.
    }
    try {
      const node = document.querySelector(selector);
      if (!node) {
        continue;
      }
      if (node === video) {
        return true;
      }
      if (node.contains(video)) {
        return true;
      }
    } catch (_error) {
      // Ignore invalid selector and continue.
    }
  }
  return false;
}

function isVideoCandidate(ctx: SitePipContext, video: HTMLVideoElement | null): boolean {
  if (isRejectedByProfile(ctx, video)) {
    return false;
  }
  const allowDisablePiP = Boolean(ctx.matchedProfile && ctx.matchedProfile.allowDisablePiP);
  return video instanceof HTMLVideoElement &&
    video.isConnected &&
    (allowDisablePiP || !video.disablePictureInPicture) &&
    Number(video.videoWidth || 0) > 0 &&
    Number(video.videoHeight || 0) > 0;
}

function hasProfileBoost(ctx: SitePipContext, video: HTMLVideoElement | null): boolean {
  if (!video || ctx.profileSelectors.length === 0) {
    return false;
  }
  for (const selector of ctx.profileSelectors) {
    try {
      const node = document.querySelector(selector);
      if (!node) {
        continue;
      }
      if (node === video) {
        return true;
      }
      if (node.contains(video)) {
        return true;
      }
    } catch (_error) {
      // Ignore invalid selector and continue.
    }
  }
  return false;
}

// Playing beats audible beats profile-matched beats recently used; the
// on-screen area breaks ties. Videos with no area are skipped.
function scoreVideo(ctx: SitePipContext, video: HTMLVideoElement): number | null {
  const visibleArea = getVisibleArea(video);
  const area = Math.max(visibleArea, ctx.core.getRectArea(video));
  if (area <= 0) {
    return null;
  }
  const playingBoost = CORE.isVideoPlaying(video) ? 1_000_000_000 : 0;
  const audibleBoost = isLikelyAudible(video) ? 250_000_000 : 0;
  const profileBoost = hasProfileBoost(ctx, video) ? 180_000_000 : 0;
  const lastManagedBoost = video === ctx.state.lastManagedVideo ? 20_000_000 : 0;
  const activeBoost = video === ctx.state.activeVideo ? 10_000_000 : 0;
  return playingBoost + audibleBoost + profileBoost + lastManagedBoost + activeBoost + area;
}

function markPlaybackIntentFromActiveVideo(ctx: SitePipContext): boolean {
  const activeVideo = ctx.core.syncActiveVideo(ctx.state.lastManagedVideo || ctx.state.activeVideo);
  if (CORE.isVideoPlaying(activeVideo)) {
    ctx.state.hadUserGesture = true;
    ctx.state.wasPlayingBeforeHide = true;
    return true;
  }
  return false;
}

export {
  getHiddenRetryDelayMs,
  getHiddenRetryLimit,
  getVisibleArea,
  hasAnyPlayingMedia,
  hasProfileBoost,
  isJingxuanModalUrl,
  isLikelyAudible,
  isRecord,
  isRejectedByProfile,
  isVideoCandidate,
  isVideoVisibleEnough,
  markPlaybackIntentFromActiveVideo,
  reloadJingxuanModalIfNeeded,
  requestMainWorldSetup,
  scoreVideo,
  shouldRecoverJingxuanModalByReload
};
