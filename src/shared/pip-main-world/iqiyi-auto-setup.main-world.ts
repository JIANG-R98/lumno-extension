// Prepares iQIYI for the browser's automatic picture-in-picture: its videos
// may enter it, and the media session's enter and leave actions reach the
// main video. Runs once per page; the page's window keeps the marks that
// say so, since the function has no module scope that outlives one call.
//
// Runs in the page's main world, sent there on its own by
// chrome.scripting.executeScript: it uses nothing outside its own body, so
// its helpers are declared inside it.
import type { PipAutoSetupResult } from './results';

function iqiyiSetupAutoPiPInMainWorld(): PipAutoSetupResult {
  const result: PipAutoSetupResult = {
    ok: true,
    bound: false,
    preparedVideos: 0,
    error: ''
  };
  try {
    if (Reflect.get(window, '__lumnoIqiyiAutoPipSetupDone2026')) {
      result.bound = true;
      return result;
    }

    const getPrimaryVideo = (): HTMLVideoElement | null => {
      const selectors = [
        '.iqp-player-videolayer video',
        '.iqp-player video',
        '#flashbox video',
        '#player video',
        'video'
      ];
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          if (!(node instanceof HTMLVideoElement)) {
            continue;
          }
          if (node.matches('.player_outer_video video') || node.getAttribute('outer') === '1') {
            continue;
          }
          return node;
        }
      }
      return null;
    };

    const prepareVideo = (video: Element): boolean => {
      if (!(video instanceof HTMLVideoElement)) {
        return false;
      }
      if (video.matches('.player_outer_video video') || video.getAttribute('outer') === '1') {
        return false;
      }
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
      return true;
    };

    const prepareExistingVideos = (): number => {
      let count = 0;
      const list = Array.from(document.querySelectorAll('video'));
      for (const video of list) {
        if (prepareVideo(video)) {
          count += 1;
        }
      }
      return count;
    };

    // The prototype's setActionHandler, in case the page replaced its own.
    const mediaSession = ('mediaSession' in navigator) ? navigator.mediaSession : null;
    const proto: unknown = mediaSession ? Object.getPrototypeOf(mediaSession) : null;
    const nativeSetActionHandler: unknown = proto && typeof proto === 'object'
      ? Reflect.get(proto, 'setActionHandler')
      : null;

    if (mediaSession && typeof nativeSetActionHandler === 'function') {
      Reflect.apply(nativeSetActionHandler, mediaSession, ['enterpictureinpicture', async () => {
        const video = getPrimaryVideo();
        if (!video || typeof video.requestPictureInPicture !== 'function') {
          return;
        }
        try {
          prepareVideo(video);
          if (!video.paused || document.visibilityState === 'hidden') {
            await video.requestPictureInPicture();
          }
        } catch (_error) {}
      }]);
      Reflect.apply(nativeSetActionHandler, mediaSession, ['leavepictureinpicture', async () => {
        try {
          if (document.pictureInPictureElement && typeof document.exitPictureInPicture === 'function') {
            await document.exitPictureInPicture();
          }
        } catch (_error) {}
      }]);
      result.bound = true;
    }

    result.preparedVideos = prepareExistingVideos();

    if (!Reflect.get(window, '__lumnoIqiyiAutoPipObserver2026')) {
      const observer = new MutationObserver(() => {
        prepareExistingVideos();
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
      });
      Reflect.set(window, '__lumnoIqiyiAutoPipObserver2026', observer);
    }

    Reflect.set(window, '__lumnoIqiyiAutoPipSetupDone2026', true);
    return result;
  } catch (error) {
    result.ok = false;
    result.error = error instanceof Error && error.message ? error.message : String(error);
    return result;
  }
}

export { iqiyiSetupAutoPiPInMainWorld };
