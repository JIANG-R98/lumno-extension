// Enters picture-in-picture on iQIYI through the site's player objects,
// whose own controls know the playing stream, and falls back to the main
// video element.
//
// Runs in the page's main world, sent there on its own by
// chrome.scripting.executeScript: it uses nothing outside its own body, so
// its helpers are declared inside it.
import type { PipEnterResult, PlayerMethodCandidate } from './results';

async function iqiyiTryEnterPiPInMainWorld(): Promise<PipEnterResult> {
  const result: PipEnterResult = {
    ok: true,
    before: Boolean(document.pictureInPictureElement),
    after: Boolean(document.pictureInPictureElement),
    attempted: false,
    used: '',
    error: ''
  };

  const isObject = (value: unknown): value is object => Boolean(value) && typeof value === 'object';
  // Reads obj.a.b... through the page's objects; undefined where a step is missing.
  const readPath = (source: unknown, path: string[]): unknown => {
    let current = source;
    for (const key of path) {
      if (!isObject(current)) {
        return undefined;
      }
      current = Reflect.get(current, key);
    }
    return current;
  };

  const callMethod = async (obj: unknown, candidates: PlayerMethodCandidate[]): Promise<boolean> => {
    if (!isObject(obj)) {
      return false;
    }
    for (const { name, args } of candidates) {
      const method: unknown = Reflect.get(obj, name);
      if (typeof method !== 'function') {
        continue;
      }
      try {
        const output: unknown = Reflect.apply(method, obj, args);
        if (isObject(output) && 'then' in output && typeof output.then === 'function') {
          await output;
        }
        result.attempted = true;
        result.used = `method:${name}${args.length ? '(args)' : ''}`;
        if (document.pictureInPictureElement) {
          return true;
        }
      } catch (_error) {
        // Try next candidate.
      }
    }
    return false;
  };

  const trySetPiPProperty = (obj: unknown): boolean => {
    if (!isObject(obj) || !('pictureInPicture' in obj)) {
      return false;
    }
    try {
      if (!Reflect.set(obj, 'pictureInPicture', true)) {
        return false;
      }
      result.attempted = true;
      result.used = 'property:pictureInPicture';
      return Boolean(document.pictureInPictureElement);
    } catch (_error) {
      return false;
    }
  };

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

  const roots: object[] = [];
  const rootSet = new WeakSet<object>();
  const pushRoot = (obj: unknown): void => {
    if (!isObject(obj) || rootSet.has(obj)) {
      return;
    }
    rootSet.add(obj);
    roots.push(obj);
  };
  const pushPlayers = (players: unknown): void => {
    if (isObject(players)) {
      Object.values(players).forEach(pushRoot);
    }
  };
  // Calls obj[name]() when it is a method; undefined otherwise.
  const callIfMethod = (obj: unknown, name: string, args: unknown[] = []): unknown => {
    const method = readPath(obj, [name]);
    return isObject(obj) && typeof method === 'function' ? Reflect.apply(method, obj, args) : undefined;
  };

  const wonder = readPath(window, ['webPlay', 'wonder']);
  try {
    pushRoot(callIfMethod(wonder, 'getPlayer'));
  } catch (_error) {}
  try {
    pushRoot(callIfMethod(wonder, 'getPCBridge'));
  } catch (_error) {}
  try {
    pushPlayers(readPath(wonder, ['_manager', '_players']));
  } catch (_error) {}

  const collectManagerPlayers = (manager: unknown): void => {
    if (!isObject(manager)) {
      return;
    }
    pushRoot(manager);
    pushPlayers(readPath(manager, ['_players']));
    ['mainContent', 'root', 'player', '5fcma2g3wzdcvv2smpk4d3h3vq'].forEach((id) => {
      try {
        pushRoot(callIfMethod(manager, 'getPlayerById', [id]));
      } catch (_error) {}
    });
  };

  const collectLoaderPlayers = async (timeoutMs: number): Promise<void> => {
    const loader = readPath(window, ['QiyiPlayerLoader']);
    const ready = readPath(loader, ['ready']);
    if (!isObject(loader) || typeof ready !== 'function') {
      return;
    }
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) {
          return;
        }
        done = true;
        resolve();
      };
      const timer = setTimeout(finish, Math.max(120, Number(timeoutMs || 260)));
      try {
        Reflect.apply(ready, loader, [(manager: unknown) => {
          try {
            collectManagerPlayers(manager);
          } catch (_error) {
            // Ignore manager traversal errors.
          } finally {
            clearTimeout(timer);
            finish();
          }
        }]);
      } catch (_error) {
        clearTimeout(timer);
        finish();
      }
    });
  };

  await collectLoaderPlayers(280);
  if (!roots.length) {
    await collectLoaderPlayers(360);
  }

  const methodCandidates: PlayerMethodCandidate[] = [
    { name: 'openPictureInPicture', args: [] },
    { name: 'toggleBrowserPicInPic', args: [] },
    { name: 'togglePictureInPicture', args: [] },
    { name: 'togglePip', args: [] },
    { name: 'enterPictureInPicture', args: [] },
    { name: 'setSmallWindowMode', args: [true] }
  ];

  const nestedKeys = [
    '_playBack',
    'playBack',
    '_player',
    'player',
    '_playProxy',
    'videoInfo',
    '_videoInfo'
  ];

  // Tries the object's methods, then its property; whether
  // picture-in-picture is up now.
  const tryPlayer = async (player: object): Promise<boolean> => {
    await callMethod(player, methodCandidates);
    if (document.pictureInPictureElement) {
      return true;
    }
    trySetPiPProperty(player);
    return Boolean(document.pictureInPictureElement);
  };

  // Tries the root, then the parts of it that hold the playback.
  const tryRoot = async (root: object): Promise<void> => {
    if (await tryPlayer(root)) {
      return;
    }
    for (const key of nestedKeys) {
      const nested: unknown = Reflect.get(root, key);
      if (isObject(nested) && await tryPlayer(nested)) {
        return;
      }
    }
  };

  const tryPrimaryVideo = async (): Promise<void> => {
    const video = getPrimaryVideo();
    if (!video || typeof video.requestPictureInPicture !== 'function') {
      return;
    }
    try {
      if (video.disablePictureInPicture) {
        video.disablePictureInPicture = false;
      }
      if (video.hasAttribute('disablepictureinpicture')) {
        video.removeAttribute('disablepictureinpicture');
      }
      result.attempted = true;
      result.used = 'video.requestPictureInPicture';
      await video.requestPictureInPicture();
    } catch (error) {
      result.error = error instanceof Error && error.name ? error.name : String(error);
    }
  };

  for (const root of roots) {
    if (document.pictureInPictureElement) {
      break;
    }
    await tryRoot(root);
  }

  if (!document.pictureInPictureElement) {
    await tryPrimaryVideo();
  }

  result.after = Boolean(document.pictureInPictureElement);
  return result;
}

export { iqiyiTryEnterPiPInMainWorld };
