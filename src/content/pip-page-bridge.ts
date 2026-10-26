// Runs in the page's own JavaScript world on the sites the automatic
// picture-in-picture scripts cover. When the isolated-world script asks, it
// leaves picture-in-picture and takes YouTube's player out of its mini
// player, which only the page's own player object can do. The background
// registers it as a main-world content script, so it runs once per page.
import {
  PIP_PAGE_BRIDGE_REQUEST_EVENT,
  PIP_PAGE_BRIDGE_RESPONSE_EVENT,
  readPipPageBridgeRequest
} from '../domain/pip-page-bridge';
import type { PipPageBridgeResponse } from '../domain/pip-page-bridge';

// YouTube's player object: #movie_player itself, or what <ytd-player> hands out.
function getPlayer(): object | null {
  const moviePlayer = document.getElementById('movie_player');
  if (moviePlayer) {
    return moviePlayer;
  }
  const ytdPlayer = document.querySelector('ytd-player');
  const getPlayerMethod: unknown = ytdPlayer ? Reflect.get(ytdPlayer, 'getPlayer') : null;
  if (!ytdPlayer || typeof getPlayerMethod !== 'function') {
    return null;
  }
  try {
    const player: unknown = Reflect.apply(getPlayerMethod, ytdPlayer, []);
    return player && typeof player === 'object' ? player : null;
  } catch (_error) {
    return null;
  }
}

function callPlayerMethod(player: object, name: string, args: unknown[]): boolean {
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
}

// The mini player's setter takes different arguments across player versions,
// so every known form is tried.
function forceUnminimize(): boolean {
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
}

// A rejection's name (DOMExceptions are not Errors in every engine), or the
// value itself as text.
function describeError(error: unknown): string {
  const name: unknown = error && typeof error === 'object' ? Reflect.get(error, 'name') : null;
  return typeof name === 'string' && name ? name : String(error);
}

async function handleForceExitRequest(requestId: number): Promise<void> {
  const before = Boolean(document.pictureInPictureElement);
  let attempted = false;
  let error = '';
  try {
    if (before && typeof document.exitPictureInPicture === 'function') {
      attempted = true;
      await document.exitPictureInPicture();
    }
  } catch (exitError) {
    error = describeError(exitError);
  }
  forceUnminimize();
  const response: PipPageBridgeResponse = {
    requestId,
    attempted,
    before,
    after: Boolean(document.pictureInPictureElement),
    error
  };
  window.dispatchEvent(new CustomEvent(PIP_PAGE_BRIDGE_RESPONSE_EVENT, { detail: response }));
}

window.addEventListener(PIP_PAGE_BRIDGE_REQUEST_EVENT, (event) => {
  const detail: unknown = 'detail' in event ? event.detail : null;
  void handleForceExitRequest(readPipPageBridgeRequest(detail).requestId);
}, false);
