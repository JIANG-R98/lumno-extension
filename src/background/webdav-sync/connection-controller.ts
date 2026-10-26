// One WebDAV connection: captures this device's preferences, shortcuts and
// wallpapers, merges them with the server's copy against the last state
// both shared, publishes the result under the server's write lock and
// applies it locally.
import * as LumnoNewtabWallpaperLocalStore from '../../shared/wallpaper-local-store';
import * as LumnoSettings from '../../domain/settings';
import { WEBDAV_CLIENT_API } from '../webdav-client/api';
import { handle } from './connection-requests';
import type { WebDavRequest } from '../../domain/messages';
import { capture } from './capture';
import { pause, status } from './connect';
import { ALARM_NAME, KEEP_ALIVE_INTERVAL_MS } from './constants';
import { mirrorChrome } from './local-apply';
import { createPrivateStore, createProbeCache } from './private-store';
import { exclusive, fail, report, session } from './runtime';
import { backgroundRound, onStorageChanged, schedule } from './sync-round';
import type {
  ConnectionContext,
  ConnectionController,
  ConnectionControllerOptions,
  SyncWallpaperStore,
  WithLocalWrite
} from './types';
import { SHORTCUTS_STORE_API } from '../../domain/shortcuts/api';
import { WEBDAV_CONTRACT_API } from '../../domain/webdav/api';
import * as ProviderStorage from '../../platform/provider-storage';

function onAlarm(ctx: ConnectionContext, alarm: chrome.alarms.Alarm): void {
  if (!ctx.stopped && alarm.name === ctx.alarmName) void backgroundRound(ctx, false);
}

function start(ctx: ConnectionContext): void {
  if (ctx.started || ctx.stopped) return;
  ctx.started = true;
  ctx.chromeApi.storage.onChanged.addListener(ctx.listeners.storageChanged);
  if (ctx.chromeApi.alarms && ctx.chromeApi.alarms.onAlarm) ctx.chromeApi.alarms.onAlarm.addListener(ctx.listeners.alarm);
  if (ctx.opts.managed) return;
  ctx.runtime.ready.then(async () => {
    const { config } = await session(ctx);
    if ((config && config.enabled) || ctx.runtime.isActiveAreaName('local') || await ctx.privateStore.get('pendingApply')) {
      if (config && config.enabled) schedule(ctx);
      await backgroundRound(ctx, true);
    }
  }).catch((cause: unknown) => report(ctx, 'Could not start WebDAV sync.', cause));
}

function stop(ctx: ConnectionContext): Promise<void> {
  return exclusive(ctx, async () => {
    await pause(ctx);
    ctx.stopped = true;
    if (ctx.chromeApi.storage.onChanged.removeListener) ctx.chromeApi.storage.onChanged.removeListener(ctx.listeners.storageChanged);
    if (ctx.chromeApi.alarms && ctx.chromeApi.alarms.onAlarm.removeListener) ctx.chromeApi.alarms.onAlarm.removeListener(ctx.listeners.alarm);
  });
}


type ConnectionTimings = Pick<ConnectionContext, 'keepAliveIntervalMs' | 'contentionDelays' | 'throttleDelays' |
  'THROTTLE_MAX_MS' | 'clock' | 'storageRetryDelayMs'>;

// The waits and the clock a connection uses; tests pass shorter ones.
function connectionTimings(opts: ConnectionControllerOptions, clientApi: ConnectionContext['clientApi']): ConnectionTimings {
  const keepAliveIntervalMs = opts.keepAliveIntervalMs || KEEP_ALIVE_INTERVAL_MS;
  const contentionDelays = opts.contentionDelays || [3000, 10000, 30000];
  const throttleDelays = opts.throttleDelays || [5, 15, 30, 60].map((minutes) => minutes * 60 * 1000);
  // The longest wait throttled() can save: the client's Retry-After cap or
  // the last delay with its jitter.
  const THROTTLE_MAX_MS = Math.max(clientApi.RETRY_AFTER_MAX_MS, ...throttleDelays.map((delay) => delay * 1.1));
  const clock = opts.now || Date.now;
  const storageRetryDelayMs = opts.storageRetryDelayMs ?? 2500;
  return { keepAliveIntervalMs, contentionDelays, throttleDelays, THROTTLE_MAX_MS, clock, storageRetryDelayMs };
}

function createConnectionController(options?: ConnectionControllerOptions | null): Readonly<ConnectionController> {
  const opts = options || {};
  const chromeApi = opts.chrome || chrome;
  const settings = opts.settings || LumnoSettings;
  const contract = opts.contract || WEBDAV_CONTRACT_API;
  const shortcuts = opts.shortcuts || SHORTCUTS_STORE_API;
  const clientApi = opts.client || WEBDAV_CLIENT_API;
  const cryptoApi = opts.crypto || globalThis.crypto;
  const privateStore = opts.privateStore || createPrivateStore(globalThis.indexedDB);
  const wallpaperStore: SyncWallpaperStore = opts.wallpaperStore || LumnoNewtabWallpaperLocalStore.createWallpaperLocalStore({
    windowObj: globalThis, onChange() {}
  });
  const localPrefsArea: chrome.storage.StorageArea = chromeApi.storage.local;
  const chromeFallbackArea: chrome.storage.SyncStorageArea | undefined = chromeApi.storage.sync;
  const runtime = ProviderStorage.createProviderStorageRuntime(chromeApi);
  const statusKey = opts.statusKey || settings.webdavStatus.key;
  const alarmName = opts.alarmName || ALARM_NAME;
  const withLocalWrite: WithLocalWrite = opts.withLocalWrite || ((fn) => Promise.resolve(fn()));
  const probeCache = opts.probeCache || createProbeCache();
  const logger = opts.logger || globalThis.console;
  const watchedKeys = [...settings.BROWSER_SYNC_KEYS, contract.ICONS_KEY, ...contract.LOCAL_PREFERENCE_KEYS,
    contract.OVERFLOW_KEY, settings.assetRevision.key];
  // The values apply() writes, so their change events are not taken for new
  // local edits that would start another full round. Expectations left
  // unmatched expire shortly after the apply.
  const ownWrites = new Map<string, string>();
  const ctx: ConnectionContext = {
    opts,
    chromeApi,
    settings,
    contract,
    shortcuts,
    clientApi,
    cryptoApi,
    privateStore,
    wallpaperStore,
    localPrefsArea,
    chromeFallbackArea,
    runtime,
    statusKey,
    alarmName,
    withLocalWrite,
    probeCache,
    ...connectionTimings(opts, clientApi),
    chain: Promise.resolve(),
    activeJobs: 0,
    keepAliveTimer: null,
    generation: 0,
    timer: null,
    started: false,
    stopped: false,
    contention: 0,
    logger,
    watchedKeys,
    ownWrites,
    ownWritesTimer: null,
    timerKeepsAlive: false,
    listeners: {
      storageChanged: (changes, areaName) => onStorageChanged(ctx, changes, areaName),
      alarm: (alarm) => onAlarm(ctx, alarm)
    }
  };
  return Object.freeze({
    start: () => start(ctx),
    stop: () => stop(ctx),
    status: () => status(ctx),
    capture: (recovering?: boolean) => capture(ctx, recovering),
    mirrorChrome: () => mirrorChrome(ctx),
    handle: (request: WebDavRequest) => exclusive(ctx, () => { if (ctx.stopped) fail(ctx, 'connection-missing'); return handle(ctx, request); }) });
}

export {
  createConnectionController,
  onAlarm,
  start,
  stop
};
