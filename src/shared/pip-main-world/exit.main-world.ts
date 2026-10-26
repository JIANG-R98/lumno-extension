// Leaves picture-in-picture, and on YouTube brings the player back from its
// mini player as well.
//
// Runs in the page's main world, sent there on its own by
// chrome.scripting.executeScript: it uses nothing outside its own body, so
// its helpers are declared inside it.
import type { PipExitResult, YoutubePipExitResult } from './results';

async function forceExitPiPInMainWorld(): Promise<PipExitResult> {
  const result: PipExitResult = {
    ok: true,
    before: Boolean(document.pictureInPictureElement),
    after: Boolean(document.pictureInPictureElement),
    attemptedExit: false,
    error: ''
  };
  try {
    if (document.pictureInPictureElement && typeof document.exitPictureInPicture === 'function') {
      result.attemptedExit = true;
      await document.exitPictureInPicture();
    }
  } catch (error) {
    result.error = error instanceof Error && error.name ? error.name : String(error);
  }
  result.after = Boolean(document.pictureInPictureElement);
  return result;
}

async function youtubeForceExitPiPInMainWorld(): Promise<YoutubePipExitResult> {
  const result: YoutubePipExitResult = {
    ok: true,
    before: Boolean(document.pictureInPictureElement),
    after: Boolean(document.pictureInPictureElement),
    attemptedExit: false,
    unminimized: false,
    error: ''
  };

  // The YouTube player object: #movie_player, or the one <ytd-player> holds.
  const getPlayer = (): object | null => {
    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer) {
      return moviePlayer;
    }
    const ytdPlayer = document.querySelector('ytd-player');
    const getPlayerMethod: unknown = ytdPlayer ? Reflect.get(ytdPlayer, 'getPlayer') : null;
    if (ytdPlayer && typeof getPlayerMethod === 'function') {
      try {
        const player: unknown = Reflect.apply(getPlayerMethod, ytdPlayer, []);
        return player && typeof player === 'object' ? player : null;
      } catch (_error) {
        return null;
      }
    }
    return null;
  };

  const callPlayerMethod = (player: object, name: string, args: unknown[]): boolean => {
    const method: unknown = Reflect.get(player, name);
    if (typeof method !== 'function') {
      return false;
    }
    try {
      Reflect.apply(method, player, args);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const forceUnminimize = (): boolean => {
    const player = getPlayer();
    if (!player) {
      return false;
    }
    let changed = false;
    changed = callPlayerMethod(player, 'setMinimized', [false]) || changed;
    changed = callPlayerMethod(player, 'setMinimized', [0]) || changed;
    changed = callPlayerMethod(player, 'setMinimized', [null]) || changed;
    changed = callPlayerMethod(player, 'setMinimized', []) || changed;
    return changed;
  };

  result.unminimized = forceUnminimize();
  try {
    if (document.pictureInPictureElement && typeof document.exitPictureInPicture === 'function') {
      result.attemptedExit = true;
      await document.exitPictureInPicture();
    }
  } catch (error) {
    result.error = error instanceof Error && error.name ? error.name : String(error);
  }
  result.unminimized = forceUnminimize() || result.unminimized;
  result.after = Boolean(document.pictureInPictureElement);
  return result;
}

export { forceExitPiPInMainWorld, youtubeForceExitPiPInMainWorld };
