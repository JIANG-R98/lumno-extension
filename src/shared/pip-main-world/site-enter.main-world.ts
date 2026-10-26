// Enters picture-in-picture on the page's best video: the playing one, then
// the one in the site's own player (Douyin, iQIYI, bilibili), then the
// largest.
//
// Runs in the page's main world, sent there on its own by
// chrome.scripting.executeScript: it uses nothing outside its own body, so
// its helpers are declared inside it.
import type { PipEnterResult } from './results';

async function siteTryEnterPiPInMainWorld(): Promise<PipEnterResult> {
  const result: PipEnterResult = {
    ok: true,
    before: Boolean(document.pictureInPictureElement),
    after: Boolean(document.pictureInPictureElement),
    attempted: false,
    used: '',
    error: ''
  };

  const selectors = [
    '.xgplayer video',
    '.xgplayer-video-wrap video',
    '.xg-video-container video',
    '.iqp-player-videolayer video',
    '.iqp-player video',
    '.bpx-player-video-wrap video',
    '#player video',
    'video'
  ];

  const host = String(location.hostname || '').toLowerCase();
  const isDouyinHost = host.endsWith('.douyin.com') || host === 'douyin.com';
  const isIqiyiHost = host.endsWith('.iqiyi.com') || host === 'iqiyi.com' || host.includes('.iqiyi.');
  const isBilibiliHost = host.endsWith('.bilibili.com') || host === 'bilibili.com';

  // The page's videos, the site's player selectors first.
  const collectVideos = (): HTMLVideoElement[] => {
    const videos: HTMLVideoElement[] = [];
    const seen = new WeakSet<HTMLVideoElement>();
    const pushVideo = (video: Element): void => {
      if (video instanceof HTMLVideoElement && video.isConnected && !seen.has(video)) {
        seen.add(video);
        videos.push(video);
      }
    };
    for (const selector of selectors) {
      Array.from(document.querySelectorAll(selector)).forEach(pushVideo);
    }
    Array.from(document.querySelectorAll('video')).forEach(pushVideo);
    return videos;
  };

  const getArea = (video: HTMLVideoElement): number => {
    const rect = video.getBoundingClientRect();
    const width = Math.max(0, Number(rect.width || 0));
    const height = Math.max(0, Number(rect.height || 0));
    return width * height;
  };

  // Whether the video sits in the site's own player.
  const hasBoost = (video: HTMLVideoElement): boolean => {
    if (isDouyinHost) {
      return Boolean(video.closest('.xgplayer, .xgplayer-video-wrap, .xg-video-container'));
    }
    if (isIqiyiHost) {
      return Boolean(video.closest('.iqp-player, .iqp-player-videolayer, #flashbox, #player'));
    }
    if (isBilibiliHost) {
      return Boolean(video.closest('.bpx-player-video-wrap, .bilibili-player-video-wrap, #bilibili-player, #player'));
    }
    return false;
  };

  // Playing first, then the site's player, then resolution and size;
  // negative for a video with nothing to show.
  const scoreVideo = (video: HTMLVideoElement): number => {
    if (!video.isConnected) {
      return -1;
    }
    const area = getArea(video);
    const resolution = Math.max(
      0,
      Number(video.videoWidth || 0) * Number(video.videoHeight || 0)
    );
    const hasFrame = resolution > 0 || Number(video.readyState || 0) >= 1;
    if (!hasFrame) {
      return -1;
    }
    const playingBoost = (!video.paused && !video.ended && Number(video.readyState || 0) >= 2)
      ? 1_000_000_000
      : 0;
    const profileBoost = hasBoost(video) ? 180_000_000 : 0;
    const resolutionBoost = Math.min(80_000_000, Math.floor(resolution / 24));
    return playingBoost + profileBoost + resolutionBoost + area;
  };

  // Lifts what keeps the video out of picture-in-picture.
  const unlockVideo = (video: HTMLVideoElement): void => {
    try {
      // Chrome's automatic picture-in-picture; not in the standard DOM types.
      Reflect.set(video, 'autoPictureInPicture', true);
    } catch (_error) {}
    try {
      if (video.disablePictureInPicture) {
        video.disablePictureInPicture = false;
      }
    } catch (_error) {}
    try {
      if (video.hasAttribute('disablepictureinpicture')) {
        video.removeAttribute('disablepictureinpicture');
      }
    } catch (_error) {}
  };

  // Asks for picture-in-picture on one video; whether it is up now.
  const tryVideo = async (video: HTMLVideoElement): Promise<boolean> => {
    unlockVideo(video);
    if (isIqiyiHost && video.paused && !video.ended) {
      try {
        await video.play();
      } catch (_error) {}
    }
    if (typeof video.requestPictureInPicture !== 'function') {
      return false;
    }
    try {
      result.attempted = true;
      result.used = 'video.requestPictureInPicture';
      await video.requestPictureInPicture();
      return Boolean(document.pictureInPictureElement);
    } catch (error) {
      result.error = error instanceof Error && error.name ? error.name : String(error);
      return false;
    }
  };

  const candidateVideos = collectVideos();
  candidateVideos.sort((a, b) => scoreVideo(b) - scoreVideo(a));
  for (const video of candidateVideos) {
    if (document.pictureInPictureElement) {
      break;
    }
    if (scoreVideo(video) >= 0 && await tryVideo(video)) {
      break;
    }
  }

  result.after = Boolean(document.pictureInPictureElement);
  return result;
}

export { siteTryEnterPiPInMainWorld };
