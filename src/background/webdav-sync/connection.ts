// One WebDAV connection's parts: what it works with (the browser, its
// stores, its timings), and the state it keeps, each with its owner: the
// job queue that runs one sync at a time, the count of local edits that
// tells a captured state is stale, the schedule of the next round, and the
// writes it expects to see echoed back.
import * as LumnoNewtabWallpaperLocalStore from '../../shared/wallpaper-local-store';
import * as LumnoSettings from '../../domain/settings';
import { ICONS_KEY, LOCAL_PREFERENCE_KEYS, OVERFLOW_KEY, canonical } from '../../domain/webdav/state-base';
import { RETRY_AFTER_MAX_MS } from '../webdav-client/errors';
import type { WebDavClientOptions } from '../webdav-client/types';
import * as ProviderStorage from '../../platform/provider-storage';
import type * as SettingsStorage from '../../platform/settings-storage';
import { ALARM_NAME, KEEP_ALIVE_INTERVAL_MS } from './constants';
import { createPrivateStore, createProbeCache } from './private-store';
import { ignoreRejection, unrefTimer } from './records';
import type { ConnectionControllerOptions, PrivateStore, ProbeCache, SyncWallpaperStore, WithLocalWrite } from './types';

// What a connection works with; it never changes.
interface ConnectionPorts {
  chrome: typeof chrome;
  crypto: Crypto;
  privateStore: PrivateStore;
  wallpaperStore: SyncWallpaperStore;
  runtime: SettingsStorage.ProviderStorageRuntime;
  localArea: chrome.storage.StorageArea;
  // Chrome's own sync area, mirrored as a fallback; absent in some browsers.
  syncArea: chrome.storage.SyncStorageArea | undefined;
  statusKey: string;
  alarmName: string;
  // Serializes local writes across the connections of one device.
  withLocalWrite: WithLocalWrite;
  probeCache: ProbeCache;
  logger: { warn(message: string, detail?: unknown): void } | Console;
  clientOptions: WebDavClientOptions | undefined;
  // Whether a local apply of any connection is still unrecovered.
  hasPendingApply: (() => Promise<boolean>) | undefined;
  // Run by the manager, which starts rounds and owns recovery.
  managed: boolean;
  // The storage keys whose changes start a round.
  watchedKeys: string[];
}

// The waits and the clock a connection uses; tests pass shorter ones.
interface ConnectionTimings {
  keepAliveIntervalMs: number;
  contentionDelays: number[];
  throttleDelays: number[];
  // The longest wait a throttled round can save: the client's Retry-After
  // cap or the last delay with its jitter.
  throttleMaxMs: number;
  clock: () => number;
  storageRetryDelayMs: number;
}

// When the next round runs, and how the connection got here.
interface RoundSchedule {
  started: boolean;
  stopped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  // The timer holds the keep-alive while it waits.
  timerKeepsAlive: boolean;
  // Rounds in a row that found the server's lock taken.
  contention: number;
}

// Counts edits made on this device by anything but this connection; a
// state captured before the latest one is stale.
interface LocalEdits {
  generation: number;
}

// Runs one job at a time, in order. Firefox unloads an idle event page even
// while its requests are pending, which strands the shared write lock
// mid-sync until someone deletes it by hand. An extension API call resets
// the idle timer in Firefox and Chrome, so one ticks while jobs run.
class ConnectionJobs {
  private chain: Promise<unknown> = Promise.resolve();
  private active = 0;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly runtime: typeof chrome.runtime | undefined;
  private readonly intervalMs: number;

  constructor(runtime: typeof chrome.runtime | undefined, intervalMs: number) {
    this.runtime = runtime;
    this.intervalMs = intervalMs;
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    this.holdKeepAlive();
    const job = this.chain.then(fn);
    this.chain = job.catch(() => {});
    const release = (): void => this.releaseKeepAlive();
    job.then(release, release);
    return job;
  }

  holdKeepAlive(): void {
    this.active += 1;
    const runtime = this.runtime;
    if (this.keepAliveTimer || !runtime || typeof runtime.getPlatformInfo !== 'function') {
      return;
    }
    this.keepAliveTimer = setInterval(() => {
      try {
        ignoreRejection(runtime.getPlatformInfo());
      } catch (_cause) {
        // A failed tick only loses this keep-alive beat.
      }
    }, this.intervalMs);
  }

  releaseKeepAlive(): void {
    this.active = Math.max(0, this.active - 1);
    if (!this.active && this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}

function ownWriteKey(areaName: string, key: string): string {
  return `${areaName}\n${key}`;
}

// The values an apply writes, so their change events are not taken for new
// local edits that would start another full round. Expectations left
// unmatched expire shortly after the apply.
class OwnWrites {
  private readonly expected = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  // Keeps the expectations until the next expire().
  hold(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  expect(areaName: string, key: string, value: unknown): void {
    this.expected.set(ownWriteKey(areaName, key), canonical(value));
  }

  // Events may arrive after the write's callback; nothing written means
  // nothing to wait for.
  expire(wrote: boolean): void {
    this.hold();
    if (!wrote) {
      this.expected.clear();
      return;
    }
    this.timer = setTimeout(() => {
      this.expected.clear();
      this.timer = null;
    }, 2000);
    unrefTimer(this.timer);
  }

  // Whether the change is the value an apply wrote; each expectation
  // answers once.
  take(areaName: string, key: string, change: { newValue?: unknown }): boolean {
    const id = ownWriteKey(areaName, key);
    if (!this.expected.has(id)) {
      return false;
    }
    const expected = this.expected.get(id) === canonical(change.newValue);
    this.expected.delete(id);
    return expected;
  }
}

interface ConnectionListeners {
  storageChanged(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void;
  alarm(alarm: chrome.alarms.Alarm): void;
}

interface Connection {
  readonly ports: ConnectionPorts;
  readonly timings: ConnectionTimings;
  readonly jobs: ConnectionJobs;
  readonly edits: LocalEdits;
  readonly schedule: RoundSchedule;
  readonly ownWrites: OwnWrites;
}

function readTimings(opts: ConnectionControllerOptions): ConnectionTimings {
  const throttleDelays = opts.throttleDelays || [5, 15, 30, 60].map((minutes) => minutes * 60 * 1000);
  return {
    keepAliveIntervalMs: opts.keepAliveIntervalMs || KEEP_ALIVE_INTERVAL_MS,
    contentionDelays: opts.contentionDelays || [3000, 10000, 30000],
    throttleDelays,
    throttleMaxMs: Math.max(RETRY_AFTER_MAX_MS, ...throttleDelays.map((delay) => delay * 1.1)),
    clock: opts.now || Date.now,
    storageRetryDelayMs: opts.storageRetryDelayMs ?? 2500
  };
}

function readPorts(opts: ConnectionControllerOptions): ConnectionPorts {
  const chromeApi = opts.chrome || chrome;
  return {
    chrome: chromeApi,
    crypto: opts.crypto || globalThis.crypto,
    privateStore: opts.privateStore || createPrivateStore(globalThis.indexedDB),
    wallpaperStore: opts.wallpaperStore || LumnoNewtabWallpaperLocalStore.createWallpaperLocalStore({
      windowObj: globalThis, onChange() {}
    }),
    runtime: ProviderStorage.createProviderStorageRuntime(chromeApi),
    localArea: chromeApi.storage.local,
    syncArea: chromeApi.storage.sync,
    statusKey: opts.statusKey || LumnoSettings.webdavStatus.key,
    alarmName: opts.alarmName || ALARM_NAME,
    withLocalWrite: opts.withLocalWrite || ((fn) => Promise.resolve(fn())),
    probeCache: opts.probeCache || createProbeCache(),
    logger: opts.logger || globalThis.console,
    clientOptions: opts.clientOptions,
    hasPendingApply: opts.hasPendingApply,
    managed: Boolean(opts.managed),
    watchedKeys: [...LumnoSettings.BROWSER_SYNC_KEYS, ICONS_KEY, ...LOCAL_PREFERENCE_KEYS, OVERFLOW_KEY, LumnoSettings.assetRevision.key]
  };
}

function createConnection(opts: ConnectionControllerOptions): Connection {
  const ports = readPorts(opts);
  const timings = readTimings(opts);
  return {
    ports,
    timings,
    jobs: new ConnectionJobs(ports.chrome.runtime, timings.keepAliveIntervalMs),
    edits: { generation: 0 },
    schedule: { started: false, stopped: false, timer: null, timerKeepsAlive: false, contention: 0 },
    ownWrites: new OwnWrites()
  };
}

export type { Connection, ConnectionListeners, ConnectionPorts, ConnectionTimings, LocalEdits, RoundSchedule };
export { createConnection };
