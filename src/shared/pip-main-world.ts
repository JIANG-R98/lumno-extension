// Picture-in-picture helpers that run in the page's own JavaScript world,
// where the site's player objects live: entering picture-in-picture on
// Douyin, iQIYI, bilibili and other players, preparing iQIYI for automatic
// picture-in-picture, and leaving it (YouTube's mini player included).
//
// Each *InMainWorld function is sent to the page on its own by
// chrome.scripting.executeScript, so it must not use anything outside its
// own body.

// The extension API this module calls, from chrome or a test double.
interface PipMainWorldChromeApi {
  scripting?: typeof chrome.scripting;
  runtime?: { lastError?: chrome.runtime.LastError };
}

// What a main-world function returned, or why it could not run.
type MainWorldPayload = Record<string, unknown>;

interface PipEnterResult {
  ok: boolean;
  before: boolean;
  after: boolean;
  attempted: boolean;
  used: string;
  error: string;
}

interface PipAutoSetupResult {
  ok: boolean;
  bound: boolean;
  preparedVideos: number;
  error: string;
}

interface PipExitResult {
  ok: boolean;
  before: boolean;
  after: boolean;
  attemptedExit: boolean;
  error: string;
}

interface YoutubePipExitResult extends PipExitResult {
  unminimized: boolean;
}

// A player method to try, with its arguments.
interface PlayerMethodCandidate {
  name: string;
  args: unknown[];
}

type MainWorldFunction = () => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getSenderFrameTarget(
  sender: Pick<chrome.runtime.MessageSender, 'tab' | 'frameId'> | null | undefined
): { tabId: number; frameId: number } | null {
  const senderTab = sender && sender.tab ? sender.tab : null;
  const tabId = senderTab && typeof senderTab.id === 'number' ? senderTab.id : null;
  if (typeof tabId !== 'number') {
    return null;
  }
  return {
    tabId: tabId,
    frameId: sender && typeof sender.frameId === 'number' ? sender.frameId : 0
  };
}

function normalizeExecuteScriptPayload(results: unknown): MainWorldPayload {
  const first: unknown = Array.isArray(results) && results.length > 0 ? results[0] : null;
  return isRecord(first) && isRecord(first.result) ? first.result : { ok: false, reason: 'no-result' };
}

// Runs `func` in the main world of the frame that sent the message.
function executeMainWorld(
  chromeApi: PipMainWorldChromeApi | null | undefined,
  sender: Pick<chrome.runtime.MessageSender, 'tab' | 'frameId'> | null | undefined,
  func: MainWorldFunction
): Promise<MainWorldPayload> {
  const target = getSenderFrameTarget(sender);
  if (!target) {
    return Promise.resolve({ ok: false, reason: 'no-tab' });
  }
  const scripting = chromeApi ? chromeApi.scripting : null;
  if (!chromeApi || !scripting || typeof scripting.executeScript !== 'function') {
    return Promise.resolve({ ok: false, reason: 'executeScript-unavailable' });
  }
  return new Promise((resolve) => {
    scripting.executeScript({
      target: { tabId: target.tabId, frameIds: [target.frameId] },
      world: 'MAIN',
      func: func
    }, (results) => {
      if (chromeApi.runtime && chromeApi.runtime.lastError) {
        resolve({
          ok: false,
          reason: chromeApi.runtime.lastError.message || 'executeScript-failed'
        });
        return;
      }
      resolve(normalizeExecuteScriptPayload(results));
    });
  });
}

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
  const candidateVideos: HTMLVideoElement[] = [];
  const seen = new WeakSet<HTMLVideoElement>();
  const pushVideo = (video: Element): void => {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }
    if (!video.isConnected || seen.has(video)) {
      return;
    }
    seen.add(video);
    candidateVideos.push(video);
  };

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    for (const node of nodes) {
      pushVideo(node);
    }
  }
  Array.from(document.querySelectorAll('video')).forEach((node) => {
    pushVideo(node);
  });

  const getArea = (video: HTMLVideoElement): number => {
    const rect = video.getBoundingClientRect();
    const width = Math.max(0, Number(rect.width || 0));
    const height = Math.max(0, Number(rect.height || 0));
    return width * height;
  };

  const hasBoost = (video: HTMLVideoElement): boolean => {
    if (isDouyinHost) {
      return Boolean(video.closest('.xgplayer, .xgplayer-video-wrap, .xg-video-container'));
    }
    if (host.endsWith('.iqiyi.com') || host === 'iqiyi.com' || host.includes('.iqiyi.')) {
      return Boolean(video.closest('.iqp-player, .iqp-player-videolayer, #flashbox, #player'));
    }
    if (host.endsWith('.bilibili.com') || host === 'bilibili.com') {
      return Boolean(video.closest('.bpx-player-video-wrap, .bilibili-player-video-wrap, #bilibili-player, #player'));
    }
    return false;
  };

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

  candidateVideos.sort((a, b) => scoreVideo(b) - scoreVideo(a));

  for (const video of candidateVideos) {
    if (document.pictureInPictureElement) {
      break;
    }
    if (scoreVideo(video) < 0) {
      continue;
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
    if (isIqiyiHost && video.paused && !video.ended) {
      try {
        await video.play();
      } catch (_error) {}
    }
    if (typeof video.requestPictureInPicture !== 'function') {
      continue;
    }
    try {
      result.attempted = true;
      result.used = 'video.requestPictureInPicture';
      await video.requestPictureInPicture();
      if (document.pictureInPictureElement) {
        break;
      }
    } catch (error) {
      result.error = error instanceof Error && error.name ? error.name : String(error);
    }
  }

  result.after = Boolean(document.pictureInPictureElement);
  return result;
}

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
            if (isObject(manager)) {
              pushRoot(manager);
              pushPlayers(readPath(manager, ['_players']));
              ['mainContent', 'root', 'player', '5fcma2g3wzdcvv2smpk4d3h3vq'].forEach((id) => {
                try {
                  pushRoot(callIfMethod(manager, 'getPlayerById', [id]));
                } catch (_error) {}
              });
            }
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

  for (const root of roots) {
    if (document.pictureInPictureElement) {
      break;
    }
    await callMethod(root, methodCandidates);
    if (document.pictureInPictureElement) {
      break;
    }
    trySetPiPProperty(root);
    if (document.pictureInPictureElement) {
      break;
    }
    for (const key of nestedKeys) {
      const nested: unknown = Reflect.get(root, key);
      if (!isObject(nested)) {
        continue;
      }
      await callMethod(nested, methodCandidates);
      if (document.pictureInPictureElement) {
        break;
      }
      trySetPiPProperty(nested);
      if (document.pictureInPictureElement) {
        break;
      }
    }
  }

  if (!document.pictureInPictureElement) {
    const video = getPrimaryVideo();
    if (video && typeof video.requestPictureInPicture === 'function') {
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
    }
  }

  result.after = Boolean(document.pictureInPictureElement);
  return result;
}

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

type PipSender = Pick<chrome.runtime.MessageSender, 'tab' | 'frameId'> | null | undefined;

interface PipMainWorld {
  siteTryEnterPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
  iqiyiTryEnterPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
  iqiyiSetupAutoPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
  forceExitPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
  youtubeForceExitPiPInMainWorld(sender: PipSender): Promise<MainWorldPayload>;
}

function create(options?: { chromeApi?: PipMainWorldChromeApi | null } | null): PipMainWorld {
  const settings = options || {};
  const chromeApi: PipMainWorldChromeApi | null = settings.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);

  return {
    siteTryEnterPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, siteTryEnterPiPInMainWorld);
    },
    iqiyiTryEnterPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, iqiyiTryEnterPiPInMainWorld);
    },
    iqiyiSetupAutoPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, iqiyiSetupAutoPiPInMainWorld);
    },
    forceExitPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, forceExitPiPInMainWorld);
    },
    youtubeForceExitPiPInMainWorld(sender) {
      return executeMainWorld(chromeApi, sender, youtubeForceExitPiPInMainWorld);
    }
  };
}

export type {
  MainWorldPayload,
  PipAutoSetupResult,
  PipEnterResult,
  PipExitResult,
  PipMainWorld,
  PipMainWorldChromeApi,
  PipSender,
  YoutubePipExitResult
};
export {
  create,
  executeMainWorld,
  siteTryEnterPiPInMainWorld,
  iqiyiTryEnterPiPInMainWorld,
  iqiyiSetupAutoPiPInMainWorld,
  forceExitPiPInMainWorld,
  youtubeForceExitPiPInMainWorld
};
