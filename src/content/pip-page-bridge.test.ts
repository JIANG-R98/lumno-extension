import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PIP_PAGE_BRIDGE_REQUEST_EVENT,
  PIP_PAGE_BRIDGE_RESPONSE_EVENT,
  readPipPageBridgeResponse
} from '../domain/pip-page-bridge';
import type { PipPageBridgeResponse } from '../domain/pip-page-bridge';

function setPictureInPictureElement(element: Element | null): void {
  Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: element });
}

// Sends a request the way the isolated-world script does and resolves with
// the bridge's answer.
function requestExit(requestId: number): Promise<PipPageBridgeResponse | null> {
  return new Promise((resolve) => {
    window.addEventListener(PIP_PAGE_BRIDGE_RESPONSE_EVENT, (event) => {
      resolve(readPipPageBridgeResponse('detail' in event ? event.detail : null));
    }, { once: true });
    window.dispatchEvent(new CustomEvent(PIP_PAGE_BRIDGE_REQUEST_EVENT, { detail: { requestId } }));
  });
}

describe('pip page bridge', () => {
  beforeAll(async () => {
    await import('./pip-page-bridge');
  });

  afterEach(() => {
    setPictureInPictureElement(null);
    Reflect.deleteProperty(document, 'exitPictureInPicture');
    document.body.replaceChildren();
  });

  it('leaves picture-in-picture and answers with the request id', async () => {
    const video = document.createElement('video');
    setPictureInPictureElement(video);
    const exit = vi.fn(() => {
      setPictureInPictureElement(null);
      return Promise.resolve();
    });
    Object.defineProperty(document, 'exitPictureInPicture', { configurable: true, value: exit });

    const response = await requestExit(7);

    expect(exit).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ requestId: 7, attempted: true, before: true, after: false, error: '' });
  });

  it('does not try to leave when nothing is in picture-in-picture', async () => {
    const exit = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'exitPictureInPicture', { configurable: true, value: exit });

    const response = await requestExit(8);

    expect(exit).not.toHaveBeenCalled();
    expect(response).toEqual({ requestId: 8, attempted: false, before: false, after: false, error: '' });
  });

  it('reports the error name when leaving fails', async () => {
    setPictureInPictureElement(document.createElement('video'));
    Object.defineProperty(document, 'exitPictureInPicture', {
      configurable: true,
      value: () => Promise.reject(new DOMException('no', 'InvalidStateError'))
    });

    const response = await requestExit(9);

    expect(response).toMatchObject({ requestId: 9, attempted: true, before: true, after: true, error: 'InvalidStateError' });
  });

  it("takes YouTube's player out of its mini player with every known argument form", async () => {
    const player = document.createElement('div');
    player.id = 'movie_player';
    const setMinimized = vi.fn();
    Object.defineProperty(player, 'setMinimized', { value: setMinimized });
    document.body.append(player);

    await requestExit(10);

    expect(setMinimized.mock.calls).toEqual([[false], [0], [null], []]);
  });

  it('reads the player <ytd-player> hands out when #movie_player is missing', async () => {
    const ytdPlayer = document.createElement('ytd-player');
    const setMinimized = vi.fn();
    Object.defineProperty(ytdPlayer, 'getPlayer', { value: () => ({ setMinimized }) });
    document.body.append(ytdPlayer);

    await requestExit(11);

    expect(setMinimized).toHaveBeenCalledTimes(4);
  });
});
