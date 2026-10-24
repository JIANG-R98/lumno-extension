// WebDAV sync: each connection captures this device's preferences,
// shortcuts and wallpapers, merges them with the server's copy against the
// last state both shared, publishes the result under the server's write
// lock and applies it locally. Credentials, baselines and the binary cache
// stay in extension-origin IndexedDB.
import * as LumnoNewtabShortcutsStore from '../domain/shortcuts-store';
import * as LumnoNewtabWallpaperLocalStore from '../shared/wallpaper-local-store';
import * as LumnoSettings from '../domain/settings';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import * as LumnoWebDavContract from '../domain/webdav-contract';
import * as LumnoWebDavClient from './webdav-client';
import type { GroupedShortcutItem } from '../domain/shortcuts-store';
import type { StorageItems } from '../domain/storage-port';
import type {
  ChromeBackupPlan,
  ConflictDescription,
  WebDavAsset,
  WebDavAssetMime,
  WebDavState
} from '../domain/webdav-contract';
import type { WebDavRequest } from '../domain/messages';
import type { WallpaperRecord, WallpaperRecordInput } from '../shared/wallpaper-local-store';
import type {
  ConnectionCapabilities,
  StaleLockMarker,
  WebDavClient,
  WebDavClientOptions,
  WebDavConnection,
  WebDavDiagnostic
} from './webdav-client';

type StorageMethod = 'get' | 'set' | 'remove';
type StorageCall =
  | { method: 'get'; keys: string[] | null }
  | { method: 'set'; items: StorageItems }
  | { method: 'remove'; keys: string[] };

// The records this module keeps in IndexedDB, by key.
interface PrivateStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<unknown>;
  delete?(key: string): Promise<unknown>;
}

interface SyncWallpaperStore {
  readAll(): Promise<WallpaperRecord[]>;
  replaceAll(records: readonly WallpaperRecordInput[]): Promise<void>;
}

// A saved connection: the checked form plus the client revision whose probe
// found its capabilities.
interface StoredConnection extends WebDavConnection {
  clientRevision?: string;
}

// A connection's address, as hints and the status card show it.
interface ConnectionHint {
  endpoint: string;
  directory: string;
  username: string;
}

// The credential and the last state both sides shared, kept as one record.
// The baseline is stored as written; the contract validates it on use.
interface Session {
  config: StoredConnection | null;
  base: unknown;
}

interface ProbeCapabilities {
  concurrency: WebDavConnection['concurrency'];
  lockStrategy: WebDavConnection['lockStrategy'];
}

interface ProbeCache {
  get(revision: string, config: WebDavConnection): ProbeCapabilities | null;
  set(revision: string, config: WebDavConnection, capabilities: ProbeCapabilities): void;
}

// This device's state at one moment, and what applying a state needs of it.
interface Captured {
  state: WebDavState;
  values: StorageItems;
  local: StorageItems;
  records: WallpaperRecord[];
  // Folders of this device's own bookmarks, which never sync.
  folders: GroupedShortcutItem[];
  shortcutOrder: string[];
  shortcutMigratedAt: number;
  generation: number;
}

interface RemoteState {
  state: WebDavState;
  etag: string;
}

interface ChromePreparation {
  payload: StorageItems;
  synced: StorageItems;
  remove: string[];
}

interface ImageCheck {
  width: number;
  height: number;
}

interface DecodedImage extends ImageCheck {
  bytes: Uint8Array<ArrayBuffer>;
}

// The status a connection's card shows, as kept in local storage.
interface StatusUpdate {
  state?: string;
  enabled?: boolean;
  error?: string | null;
  diagnostic?: WebDavDiagnostic | null;
  conflicts?: string[];
  lastSyncAt?: number | null;
  retryAt?: number | null;
  chromeBackup?: string;
  chromeSkipped?: number;
}

interface ConnectionStatus extends Record<string, unknown> {
  clientRevision: string;
  syncRevision: string;
  localPrimary: boolean;
  enabled: boolean;
  config: (ConnectionHint & { concurrency: string; hasPassword: true }) | null;
  hasMigrationBackup: boolean;
  needsRecovery: boolean;
}

type SyncResult =
  | { ok: true }
  | { paused: true }
  | { needsChoice: true }
  | { conflict: true }
  | { pending: true; retryAt?: number };

type HandleResult =
  | SyncResult
  | (SyncResult & { resumed: true })
  | { ok: true; unchanged: true }
  | ConnectionStatus
  | ConnectionCapabilities
  | { items: ConflictDescription[] };

type MirrorResult = ChromeBackupPlan | { complete: false; skipped: string[] };

interface ConnectionController {
  start(): void;
  stop(): Promise<void>;
  status(): Promise<ConnectionStatus>;
  capture(recovering?: boolean): Promise<Captured>;
  mirrorChrome(): Promise<MirrorResult>;
  handle(request: WebDavRequest): Promise<HandleResult>;
}

type WithLocalWrite = <T>(fn: () => T | Promise<T>) => Promise<T>;

interface ConnectionControllerOptions {
  chrome?: typeof chrome;
  settings?: typeof LumnoSettings;
  contract?: typeof LumnoWebDavContract;
  shortcuts?: typeof LumnoNewtabShortcutsStore;
  client?: typeof LumnoWebDavClient;
  crypto?: Crypto;
  privateStore?: PrivateStore;
  wallpaperStore?: SyncWallpaperStore;
  statusKey?: string;
  alarmName?: string;
  // Serializes local writes across the connections of one device.
  withLocalWrite?: WithLocalWrite;
  probeCache?: ProbeCache;
  keepAliveIntervalMs?: number;
  contentionDelays?: number[];
  throttleDelays?: number[];
  now?: () => number;
  logger?: { warn(message: string, detail?: unknown): void };
  storageRetryDelayMs?: number;
  // Whether a local apply of any connection is still unrecovered.
  hasPendingApply?: () => Promise<boolean>;
  clientOptions?: WebDavClientOptions;
  // Run by createController, which starts rounds and owns recovery.
  managed?: boolean;
}

interface ManagerStatus extends Record<string, unknown> {
  clientRevision: string;
  syncRevision: string;
  connections: Array<ConnectionStatus & { id: string }>;
  suggestions: ConnectionHint[];
}

interface WebDavSyncManager {
  start(): void;
  status(): Promise<ManagerStatus>;
  handle(request: WebDavRequest): Promise<HandleResult | ManagerStatus | (HandleResult & { id: string })>;
}

const DB_NAME = 'lumno-webdav-private';
const ALARM_NAME = 'lumno-webdav-sync';
const SYNC_REVISION = 'dav-multi-1';
const PROBE_CACHE_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Below the 30 s idle limit of Firefox event pages and Chrome service workers.
const KEEP_ALIVE_INTERVAL_MS = 20 * 1000;
const CHROME_SYNC_META_KEY = '_x_extension_sync_meta_2024_unique_';
// Synced connection hints stay far below chrome.storage.sync's 8 KB item quota.
const MAX_HINTS = 10;
const MAX_HINT_BYTES = 600;
// Server snapshots of replaced remote states kept per device and connection.
const SNAPSHOT_SLOTS = 10;
// Contract failures in this device's own data; capture reports them as
// local-<code> so the settings card never blames the remote copy.
const LOCAL_DATA_CODES = ['invalid-state', 'state-too-large', 'invalid-shortcuts', 'invalid-icon', 'invalid-wallpaper',
  'invalid-asset', 'asset-too-large'];
const CONNECTION_FIELDS = ['endpoint', 'directory', 'username', 'password'] as const;
const ACCOUNT_FIELDS = ['endpoint', 'directory', 'username'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// The code a failure carries: the client's, the contract's or a sync step's.
function errorCode(cause: unknown): string {
  return isRecord(cause) && typeof cause.code === 'string' ? cause.code : '';
}

// A failure the round already put on the connection's card.
function isRecorded(cause: unknown): boolean {
  return isRecord(cause) && cause.recorded === true;
}

function errorField(cause: unknown, key: string): unknown {
  return isRecord(cause) ? cause[key] : undefined;
}

// Node test timers keep the process alive unless unreferenced.
function unrefTimer(timer: unknown): void {
  if (isRecord(timer) && 'unref' in timer && typeof timer.unref === 'function') timer.unref();
}

function ignoreRejection(value: unknown): void {
  void Promise.resolve(value).catch(() => {});
}

function isArrayBufferBytes(value: unknown): value is Uint8Array<ArrayBuffer> {
  return value instanceof Uint8Array && value.buffer instanceof ArrayBuffer;
}

// A folder named by its portable reference syncs; one named by this
// device's bookmark id stays local.
function hasFolderRef(item: GroupedShortcutItem): boolean {
  return 'folderRef' in item && Boolean(item.folderRef);
}

function readStoredConnection(value: unknown): StoredConnection | null {
  if (!isRecord(value) || typeof value.endpoint !== 'string' || typeof value.directory !== 'string' ||
      typeof value.username !== 'string' || typeof value.password !== 'string') return null;
  const connection: StoredConnection = {
    endpoint: value.endpoint,
    directory: value.directory,
    username: value.username,
    password: value.password,
    enabled: value.enabled === true,
    concurrency: value.concurrency === 'collection-lock' ? 'collection-lock' : 'conditional',
    lockStrategy: value.lockStrategy === 'collection-create' ? 'collection-create' : 'collection-move'
  };
  if (typeof value.clientRevision === 'string') connection.clientRevision = value.clientRevision;
  return connection;
}

function readSession(value: unknown): Session {
  return isRecord(value)
    ? { config: readStoredConnection(value.config), base: value.base === undefined ? null : value.base }
    : { config: null, base: null };
}

function readStateVersion(base: unknown): number {
  return isRecord(base) && typeof base.version === 'number' && base.version ? base.version : 1;
}

function isTrustedSender(
  chromeApi: { runtime: { id: string; getURL(path: string): string } },
  sender: { id?: string; url?: string } | null | undefined
): boolean {
  const page = String(sender && sender.url || '').split(/[?#]/)[0];
  return Boolean(sender && sender.id === chromeApi.runtime.id && page === chromeApi.runtime.getURL('src/options/options.html'));
}
function createPrivateStore(indexedDB: IDBFactory): Required<PrivateStore> {
  async function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('entries');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('private-storage-unavailable'));
    });
  }
  async function operation(method: 'get' | 'put' | 'delete', key: string, value?: unknown): Promise<unknown> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('entries', method === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('entries');
      const request: IDBRequest = method === 'get' ? store.get(key) : method === 'delete' ? store.delete(key) : store.put(value, key);
      let result: unknown;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error('private-storage-unavailable')); };
    });
  }
  return { get: (key) => operation('get', key), put: (key, value) => operation('put', key, value),
    delete: (key) => operation('delete', key) };
}
// Capabilities from an explicit test are reused briefly by the following
// enable, so testing and then saving does not repeat the destructive probe.
function createProbeCache(now?: () => number): ProbeCache {
  const entries = new Map<string, { at: number; capabilities: ProbeCapabilities }>();
  const clock = now || Date.now;
  const keyOf = (revision: string, config: WebDavConnection): string => (
    [revision, config.endpoint, config.directory, config.username, config.password].join('\n')
  );
  return {
    get(revision, config) {
      const entry = entries.get(keyOf(revision, config));
      if (!entry || clock() - entry.at > PROBE_CACHE_MS) return null;
      return entry.capabilities;
    },
    set(revision, config, capabilities) {
      entries.set(keyOf(revision, config), { at: clock(), capabilities });
    }
  };
}
function createConnectionController(options?: ConnectionControllerOptions | null): Readonly<ConnectionController> {
  const opts = options || {};
  const chromeApi = opts.chrome || chrome;
  const settings = opts.settings || LumnoSettings;
  const contract = opts.contract || LumnoWebDavContract;
  const shortcuts = opts.shortcuts || LumnoNewtabShortcutsStore;
  const clientApi = opts.client || LumnoWebDavClient;
  const cryptoApi = opts.crypto || globalThis.crypto;
  const privateStore = opts.privateStore || createPrivateStore(globalThis.indexedDB);
  const wallpaperStore: SyncWallpaperStore = opts.wallpaperStore || LumnoNewtabWallpaperLocalStore.createWallpaperLocalStore({
    windowObj: globalThis, onChange() {}
  });
  const localPrefsArea: chrome.storage.StorageArea = chromeApi.storage.local;
  const chromeFallbackArea: chrome.storage.SyncStorageArea | undefined = chromeApi.storage.sync;
  const runtime = LumnoSettingsStorage.createProviderStorageRuntime(chromeApi);
  const statusKey = opts.statusKey || settings.WEBDAV_STATUS_STORAGE_KEY;
  const alarmName = opts.alarmName || ALARM_NAME;
  const withLocalWrite: WithLocalWrite = opts.withLocalWrite || ((fn) => Promise.resolve(fn()));
  const probeCache = opts.probeCache || createProbeCache();
  const keepAliveIntervalMs = opts.keepAliveIntervalMs || KEEP_ALIVE_INTERVAL_MS;
  let chain: Promise<unknown> = Promise.resolve();
  let activeJobs = 0;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let stopped = false;
  // Two browsers on one account, even on the same computer, routinely meet
  // at the write lock or commit between each other's read and write. Merge
  // again after a short, jittered wait before calling it a failure. A lock
  // that outlasts every retry is reported: an uncertain write may own it.
  const CONTENTION_CODES = ['remote-locked', 'remote-changed'];
  const contentionDelays = opts.contentionDelays || [3000, 10000, 30000];
  let contention = 0;
  // A server that rate limits this account (Nutstore's 503) or is briefly
  // unavailable is left alone for a while: polling it again every round only
  // prolongs the block. Background rounds wait until the saved time; the
  // user can still sync by hand. The waits grow while refusals continue.
  const THROTTLE_CODES = ['http-429', 'http-503'];
  const throttleDelays = opts.throttleDelays || [5, 15, 30, 60].map((minutes) => minutes * 60 * 1000);
  // The longest wait throttled() can save: the client's Retry-After cap or
  // the last delay with its jitter.
  const THROTTLE_MAX_MS = Math.max(clientApi.RETRY_AFTER_MAX_MS, ...throttleDelays.map((delay) => delay * 1.1));
  const clock = opts.now || Date.now;
  function fail(code: string): never { throw clientApi.error(code); }
  const logger = opts.logger || globalThis.console;
  function report(context: string, cause: unknown): void {
    try { logger.warn(`[Lumno] ${context}`, cause); } catch (_error) { /* Logging never fails a sync. */ }
  }
  const watchedKeys = [...settings.CHROME_SYNC_STORAGE_KEYS, contract.ICONS_KEY, ...contract.LOCAL_PREFERENCE_KEYS,
    contract.OVERFLOW_KEY, settings.ASSET_REVISION_STORAGE_KEY];
  const storageRetryDelayMs = opts.storageRetryDelayMs ?? 2500;
  // A write refused by the browser sync write quota is retried once, after
  // the quota has had time to refill.
  function runStorage(area: chrome.storage.StorageArea | null | undefined, call: StorageCall, retried = false): Promise<StorageItems | undefined> {
    return new Promise((resolve, reject) => {
      if (!area) { resolve(call.method === 'get' ? {} : undefined); return; }
      let finished = false;
      const done = (result: StorageItems | undefined, failure?: unknown): void => {
        if (finished) return;
        finished = true;
        const lastError = failure || (chromeApi.runtime && chromeApi.runtime.lastError);
        if (!lastError) { resolve(result); return; }
        if (call.method !== 'get' && !retried && LumnoSettingsStorage.isStorageRateLimitError(lastError)) {
          setTimeout(() => runStorage(area, call, true).then(resolve, reject), storageRetryDelayMs);
          return;
        }
        const message = isRecord(lastError) && lastError.message ? lastError.message : lastError;
        reject(Object.assign(clientApi.error('local-storage-failed'), { reason: String(message) }));
      };
      try {
        // Firefox answers with a promise as well as the callback.
        let pending: unknown;
        if (call.method === 'get') pending = area.get(call.keys, (result) => done(result));
        else if (call.method === 'set') pending = area.set(call.items, () => done(undefined));
        else pending = area.remove(call.keys, () => done(undefined));
        if (pending instanceof Promise) {
          pending.then((result: unknown) => done(isRecord(result) ? result : undefined))
            .catch((error: unknown) => done(undefined, error || new Error('storage-failed')));
        }
      } catch (error) { reject(error); }
    });
  }
  function storage(area: chrome.storage.StorageArea | null | undefined, method: 'get', keys: string[] | null): Promise<StorageItems>;
  function storage(area: chrome.storage.StorageArea | null | undefined, method: 'set', items: StorageItems): Promise<void>;
  function storage(area: chrome.storage.StorageArea | null | undefined, method: 'remove', keys: string[]): Promise<void>;
  function storage(
    area: chrome.storage.StorageArea | null | undefined,
    method: StorageMethod,
    value: string[] | StorageItems | null
  ): Promise<StorageItems | void> {
    if (method === 'get') {
      const keys = Array.isArray(value) ? value : null;
      return runStorage(area, { method, keys }).then((result) => result || {});
    }
    if (method === 'set') {
      return runStorage(area, { method, items: isRecord(value) && !Array.isArray(value) ? value : {} }).then(() => undefined);
    }
    return runStorage(area, { method, keys: Array.isArray(value) ? value : [] }).then(() => undefined);
  }
  async function setStatus(update: StatusUpdate): Promise<StorageItems> {
    const old = await storage(localPrefsArea, 'get', [statusKey]);
    const previous = old[statusKey];
    // A planned retry time belongs to the state that announced it.
    const status = { ...(isRecord(previous) ? previous : {}), ...('state' in update ? { retryAt: null } : {}), ...update };
    await storage(localPrefsArea, 'set', { [statusKey]: status });
    return status;
  }
  // Firefox unloads an idle event page even while its requests are pending
  // (verified: a 60 s fetch never resolves), which strands the shared write
  // lock mid-sync until someone deletes it by hand. An extension API call
  // resets the idle timer in Firefox and Chrome, so tick one while jobs run.
  function holdKeepAlive(): void {
    activeJobs += 1;
    if (keepAliveTimer || !chromeApi.runtime || typeof chromeApi.runtime.getPlatformInfo !== 'function') return;
    keepAliveTimer = setInterval(() => {
      try {
        ignoreRejection(chromeApi.runtime.getPlatformInfo());
      } catch (_cause) {
        // A failed tick only loses this keep-alive beat.
      }
    }, keepAliveIntervalMs);
  }
  function releaseKeepAlive(): void {
    activeJobs = Math.max(0, activeJobs - 1);
    if (!activeJobs && keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    holdKeepAlive();
    const job = chain.then(fn);
    chain = job.catch(() => {});
    job.then(releaseKeepAlive, releaseKeepAlive);
    return job;
  }
  async function session(): Promise<Session> { return readSession(await privateStore.get('session')); }
  async function saveConfig(config: StoredConnection): Promise<void> { await privateStore.put('session', { ...await session(), config }); }
  async function hash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  function decodeImage(dataUrl: unknown, mime: WebDavAssetMime, maximum: number): DecodedImage {
    const text = String(dataUrl);
    if (!text.startsWith(`data:${mime};base64,`)) fail('invalid-asset');
    let bytes: Uint8Array<ArrayBuffer>;
    try { bytes = Uint8Array.from(globalThis.atob(text.slice(text.indexOf(',') + 1)), (character) => character.charCodeAt(0)); }
    catch (_error) { fail('invalid-asset'); }
    if (!bytes.byteLength || bytes.byteLength > maximum) fail('asset-too-large');
    return { bytes, ...checkImage(bytes, mime) };
  }
  function checkImage(bytes: Uint8Array, mime: WebDavAssetMime): ImageCheck {
    const header = Array.from(bytes.slice(0, 12));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let width = 0;
    let height = 0;
    if (mime === 'image/png') {
      if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)) fail('invalid-asset');
      if (bytes.length < 33 || view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') fail('invalid-asset');
      width = view.getUint32(16);
      height = view.getUint32(20);
    } else {
      if (String.fromCharCode(...header.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...header.slice(8, 12)) !== 'WEBP' ||
          bytes.length < 30 || view.getUint32(4, true) + 8 !== bytes.length) fail('invalid-asset');
      const format = String.fromCharCode(...bytes.slice(12, 16));
      if (format === 'VP8X') {
        width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
        height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
        if (bytes[20] & 2) fail('invalid-asset'); // Uploaded wallpapers are still images.
      } else if (format === 'VP8L' && bytes[20] === 47) {
        const dimensions = view.getUint32(21, true);
        width = 1 + (dimensions & 16383);
        height = 1 + ((dimensions >>> 14) & 16383);
      } else if (format === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
        width = view.getUint16(26, true) & 16383;
        height = view.getUint16(28, true) & 16383;
      } else fail('invalid-asset');
    }
    if (!width || !height || width > 8192 || height > 8192 || width * height > 40000000) fail('invalid-asset');
    return { width, height };
  }
  function toDataUrl(bytes: Uint8Array, mime: WebDavAssetMime): string {
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
    return `data:${mime};base64,${globalThis.btoa(chunks.join(''))}`;
  }
  function pickLocalPreferences(values: StorageItems): StorageItems {
    return Object.fromEntries(contract.LOCAL_PREFERENCE_KEYS
      .filter((key) => Object.prototype.hasOwnProperty.call(values, key)).map((key) => [key, values[key]]));
  }
  function assetPath(hashValue: string, mime: WebDavAssetMime): string { return `assets/${hashValue}.${mime === 'image/png' ? 'png' : 'webp'}`; }
  function capture(recovering = false): Promise<Captured> {
    return withLocalWrite(async () => {
      if (!recovering && opts.hasPendingApply && await opts.hasPendingApply()) fail('interrupted-apply');
      return captureInternal();
    });
  }
  async function captureInternal(): Promise<Captured> {
    await runtime.ready;
    // Unknown mode means the settings could be read from the wrong area;
    // uploading that copy would replace the real ones on other devices.
    if (runtime.isModeKnown && !runtime.isModeKnown()) fail('local-storage-failed');
    const capturedGeneration = generation;
    const local = await storage(localPrefsArea, 'get', watchedKeys);
    const values = runtime.isActiveAreaName('local') ? local : await storage(chromeFallbackArea, 'get', [...settings.CHROME_SYNC_STORAGE_KEYS]);
    const shortcutState = contract.readShortcutState(values, runtime.isActiveAreaName('sync') ? local[contract.OVERFLOW_KEY] : null);
    // Another device's browser sync save has only partly arrived.
    if (shortcutState.torn) fail('local-changed');
    const list = shortcutState.items;
    const regular = list.filter((item) => item.type !== 'folder' || hasFolderRef(item));
    const ids = new Set(regular.map((item) => item.id));
    // The oldest format that holds this state, so older devices keep reading it.
    const baseVersion = readStateVersion((await session()).base);
    const version = baseVersion >= contract.GROUPED_STATE_VERSION || contract.needsGroupedState(shortcutState.groups, regular)
      ? contract.GROUPED_STATE_VERSION
      : regular.some((item) => item.type === 'folder') || baseVersion === 2 ? 2 : 1;
    const state: WebDavState = { version, data: contract.selectPreferences({ ...values, ...pickLocalPreferences(local) }),
      groups: shortcutState.groups, shortcuts: regular, icons: {}, wallpapers: [], assets: {}, keys: [...contract.KNOWN_KEYS] };
    // This device's own data failing the contract must not read as a bad
    // remote copy, so its codes carry a local- prefix.
    try {
      const { validated, records } = await collectMedia(state, local, ids);
      if (capturedGeneration !== generation) fail('local-changed');
      return { state: validated, values, local, records, folders: list.filter((item) => item.type === 'folder' && !hasFolderRef(item)),
        shortcutOrder: list.map((item) => item.id), shortcutMigratedAt: shortcutState.migratedAt || 0,
        generation: capturedGeneration };
    } catch (cause) {
      const code = errorCode(cause);
      if (LOCAL_DATA_CODES.includes(code)) fail(`local-${code}`);
      throw cause;
    }
  }
  async function collectMedia(
    state: WebDavState,
    local: StorageItems,
    ids: ReadonlySet<string>
  ): Promise<{ validated: WebDavState; records: WallpaperRecord[] }> {
    async function addAsset(dataUrl: unknown, mime: WebDavAssetMime, maximum: number): Promise<{ digest: string } & ImageCheck> {
      const { bytes, width, height } = decodeImage(dataUrl, mime, maximum);
      const digest = await hash(bytes);
      state.assets[digest] = { mime, size: bytes.byteLength };
      // Binary cache and credentials live in extension-origin IndexedDB,
      // never in content-script-accessible chrome.storage.local.
      if (!await privateStore.get(`asset:${digest}`)) await privateStore.put(`asset:${digest}`, bytes);
      return { digest, width, height };
    }
    const icons = local[contract.ICONS_KEY];
    for (const [id, dataUrl] of Object.entries(isRecord(icons) ? icons : {})) {
      if (ids.has(id)) state.icons[id] = (await addAsset(dataUrl, 'image/png', 96 * 1024)).digest;
    }
    const records = await wallpaperStore.readAll();
    for (const record of records) {
      // Wallpapers saved before dimensions were recorded read back as 0x0,
      // so the size comes from the image itself.
      const image = await addAsset(record.imageDataUrl, 'image/webp', contract.MAX_ASSET_BYTES);
      const thumbnail = await addAsset(record.thumbnailDataUrl, 'image/webp', 160 * 1024);
      state.wallpapers.push({ id: record.id, name: record.name, width: image.width, height: image.height,
        updatedAt: record.updatedAt, image: image.digest, thumbnail: thumbnail.digest });
    }
    return { validated: contract.validateState(state), records };
  }
  async function getAsset(digest: string, asset: WebDavAsset | undefined, client: WebDavClient | null): Promise<Uint8Array<ArrayBuffer>> {
    if (!asset) fail('asset-missing');
    const cached = await privateStore.get(`asset:${digest}`);
    let bytes: Uint8Array<ArrayBuffer>;
    if (isArrayBufferBytes(cached)) {
      bytes = cached;
    } else {
      if (!client) fail('asset-missing');
      const response = await client.request(assetPath(digest, asset.mime), 'GET', undefined, {}, asset.size);
      if (response.status !== 200) fail('asset-missing');
      bytes = response.bytes;
    }
    if (bytes.byteLength !== asset.size || await hash(bytes) !== digest) fail('asset-integrity');
    checkImage(bytes, asset.mime);
    await privateStore.put(`asset:${digest}`, bytes);
    return bytes;
  }
  async function uploadAssets(state: WebDavState, client: WebDavClient, knownAssets: Record<string, WebDavAsset> | null | undefined): Promise<void> {
    for (const [digest, asset] of Object.entries(state.assets)) {
      if (knownAssets && contract.equal(knownAssets[digest], asset)) continue;
      const bytes = await getAsset(digest, asset, client);
      const existing = await client.request(assetPath(digest, asset.mime), 'HEAD', undefined, {}, 65536);
      // Asset files are named by the SHA-256 of their content and only ever
      // written whole, so a file of the expected size needs no download.
      // Without a size, or with another one, its content is checked.
      if (existing.status === 200 && existing.size === asset.size) continue;
      if (existing.status === 200) {
        const downloaded = await client.request(assetPath(digest, asset.mime), 'GET', undefined, {}, asset.size);
        if (downloaded.status !== 200 || downloaded.bytes.byteLength !== asset.size || await hash(downloaded.bytes) !== digest) fail('asset-integrity');
        continue;
      }
      if (existing.status !== 404) fail('asset-missing');
      const written = await client.request(assetPath(digest, asset.mime), 'PUT', bytes,
        { 'If-None-Match': '*', 'Content-Type': asset.mime }, 65536);
      if (![200, 201, 204, 412].includes(written.status)) fail('write-failed');
      if (written.status === 412) {
        const raced = await client.request(assetPath(digest, asset.mime), 'GET', undefined, {}, asset.size);
        if (raced.status !== 200 || raced.bytes.byteLength !== asset.size || await hash(raced.bytes) !== digest) fail('asset-integrity');
      }
    }
  }
  // This device's local-only folder shortcuts go back where they were; the
  // rest of the list beyond the browser sync budget goes to the overflow record.
  function preferencePayload(state: WebDavState, captured: Captured, maxTotalBytes: number): StorageItems {
    const list = [...state.shortcuts];
    for (const folder of captured.folders) {
      const index = (captured.shortcutOrder || []).indexOf(folder.id);
      list.splice(index < 0 ? list.length : Math.min(index, list.length), 0, folder);
    }
    if (list.length > contract.MAX_SHORTCUTS) fail('shortcut-capacity');
    if (new Set(list.map((item) => item.id)).size !== list.length) fail('shortcut-id-conflict');
    const plan = shortcuts.createShortcutStoragePlan({ groups: state.groups, items: list,
      migratedAt: captured.shortcutMigratedAt }, { maxTotalBytes });
    return { ...state.data, ...plan.payload, [contract.OVERFLOW_KEY]: plan.overflowRecord };
  }
  async function prepareChrome(state: WebDavState, captured: Captured): Promise<ChromePreparation> {
    const existing = await storage(chromeFallbackArea || localPrefsArea, 'get', null);
    const maxTotalBytes = chromeFallbackArea ? shortcuts.getShortcutSyncBudget({
      ...shortcuts.measureShortcutSyncUsage(existing), quotaBytes: chromeFallbackArea.QUOTA_BYTES
    }) : Number.MAX_SAFE_INTEGER;
    const payload = preferencePayload(state, captured, maxTotalBytes);
    const synced: StorageItems = Object.fromEntries(settings.CHROME_SYNC_STORAGE_KEYS.filter((key) =>
      Object.prototype.hasOwnProperty.call(payload, key)).map((key) => [key, payload[key]]));
    // The legacy shortcut keys stay for devices that still read them.
    const remove = settings.CHROME_SYNC_STORAGE_KEYS.filter((key) => !shortcuts.LEGACY_SHORTCUTS_CHUNK_KEYS.includes(key) &&
      Object.prototype.hasOwnProperty.call(existing, key) && !Object.prototype.hasOwnProperty.call(synced, key));
    const projected: StorageItems = { ...existing, ...synced };
    remove.forEach((key) => delete projected[key]);
    const entries = Object.entries(projected);
    const size = (key: string, value: unknown): number => contract.byteLength(key) + contract.byteLength(JSON.stringify(value));
    if (chromeFallbackArea && (entries.length > (chromeFallbackArea.MAX_ITEMS || 512) ||
        entries.some(([key, value]) => size(key, value) > (chromeFallbackArea.QUOTA_BYTES_PER_ITEM || 8192)) ||
        entries.reduce((sum, [key, value]) => sum + size(key, value), 0) > (chromeFallbackArea.QUOTA_BYTES || 102400))) fail('chrome-capacity');
    return { payload, synced, remove };
  }
  // The values apply() writes, so their change events are not taken for new
  // local edits that would start another full round. Expectations left
  // unmatched expire shortly after the apply.
  const ownWrites = new Map<string, string>();
  let ownWritesTimer: ReturnType<typeof setTimeout> | null = null;
  const ownWriteKey = (areaName: string, key: string): string => `${areaName}\n${key}`;
  // Only values that really change fire an event; an expectation for an
  // unchanged one would swallow a later identical edit by the person.
  async function expectOwnWrites(area: chrome.storage.StorageArea, areaName: 'sync' | 'local', values: StorageItems): Promise<void> {
    if (ownWritesTimer) { clearTimeout(ownWritesTimer); ownWritesTimer = null; }
    const current = await storage(area, 'get', Object.keys(values));
    Object.entries(values).forEach(([key, value]) => {
      if (contract.canonical(value) !== contract.canonical(current[key])) ownWrites.set(ownWriteKey(areaName, key), contract.canonical(value));
    });
  }
  // Events may arrive after the write's callback; nothing written means
  // nothing to wait for.
  function expireOwnWrites(wrote: boolean): void {
    if (ownWritesTimer) clearTimeout(ownWritesTimer);
    ownWritesTimer = null;
    if (!wrote) { ownWrites.clear(); return; }
    ownWritesTimer = setTimeout(() => { ownWrites.clear(); ownWritesTimer = null; }, 2000);
    unrefTimer(ownWritesTimer);
  }
  function isOwnWrite(areaName: string, key: string, change: { newValue?: unknown }): boolean {
    const id = ownWriteKey(areaName, key);
    if (!ownWrites.has(id)) return false;
    const expected = ownWrites.get(id) === contract.canonical(change.newValue);
    ownWrites.delete(id);
    return expected;
  }
  async function apply(
    state: WebDavState,
    captured: Captured,
    client: WebDavClient | null,
    activate: boolean,
    nextSession: Session
  ): Promise<void> {
    const { payload, synced, remove } = await prepareChrome(state, captured);
    const icons: Record<string, unknown> = {};
    const folderIds = new Set(captured.folders.map((item) => item.id));
    const localIcons = captured.local[contract.ICONS_KEY];
    Object.entries(isRecord(localIcons) ? localIcons : {}).forEach(([id, data]) => { if (folderIds.has(id)) icons[id] = data; });
    for (const [id, digest] of Object.entries(state.icons)) icons[id] = toDataUrl(await getAsset(digest, state.assets[digest], client), 'image/png');
    const wallpapers: WallpaperRecordInput[] = [];
    for (const wallpaper of state.wallpapers) {
      const image = await getAsset(wallpaper.image, state.assets[wallpaper.image], client);
      const thumbnail = await getAsset(wallpaper.thumbnail, state.assets[wallpaper.thumbnail], client);
      wallpapers.push({ id: wallpaper.id, key: wallpaper.id, name: wallpaper.name, width: wallpaper.width,
        height: wallpaper.height, updatedAt: wallpaper.updatedAt, imageDataUrl: toDataUrl(image, 'image/webp'),
        thumbnailDataUrl: toDataUrl(thumbnail, 'image/webp') });
    }
    return withLocalWrite(async () => {
      if (captured.generation !== generation) fail('local-changed');
      const removed = contract.LOCAL_PREFERENCE_KEYS.filter((key) =>
        Object.prototype.hasOwnProperty.call(captured.local, key) && !Object.prototype.hasOwnProperty.call(state.data, key));
      const localValues: StorageItems = {
        ...pickLocalPreferences(payload),
        [contract.OVERFLOW_KEY]: payload[contract.OVERFLOW_KEY], [contract.ICONS_KEY]: icons,
        [settings.ASSET_REVISION_STORAGE_KEY]: cryptoApi.randomUUID(),
        ...(runtime.isActiveAreaName('local') && chromeFallbackArea ? { [settings.LOCAL_PRIMARY_STORAGE_KEY]: false } : {}) };
      let wrote = false;
      try {
        await expectOwnWrites(chromeFallbackArea || localPrefsArea, chromeFallbackArea ? 'sync' : 'local',
          { ...Object.fromEntries(remove.map((key) => [key, undefined])), ...synced });
        await expectOwnWrites(localPrefsArea, 'local', { ...Object.fromEntries(removed.map((key) => [key, undefined])), ...localValues });
        if (captured.generation !== generation) fail('local-changed');
        // Stage the complete operation before changing either local store. Chrome
        // may terminate the worker between the media transaction and preferences.
        await privateStore.put('pendingApply', { state, captured, activate, nextSession });
        await wallpaperStore.replaceAll(wallpapers);
        if (captured.generation !== generation) fail('local-changed');
        wrote = true;
        if (remove.length) await storage(chromeFallbackArea || localPrefsArea, 'remove', remove);
        await storage(chromeFallbackArea || localPrefsArea, 'set', synced);
        if (removed.length) await storage(localPrefsArea, 'remove', removed);
        await storage(localPrefsArea, 'set', localValues);
      } finally { expireOwnWrites(wrote); }
      // Credentials and the merge baseline belong to the same server and must
      // commit atomically; separate records could pair a new server with an old base.
      await privateStore.put('session', nextSession);
      await privateStore.put('pendingApply', null);
      await privateStore.put('recoveryBlocked', false);
    });
  }
  // A pending apply staged by an older version holds fields this one drops.
  function samePendingState(state: WebDavState, pendingState: unknown): boolean {
    try { return contract.equal(state, contract.validateState(pendingState)); } catch (_cause) { return false; }
  }
  async function recoverPendingApply(): Promise<void> {
    const pending = await privateStore.get('pendingApply');
    if (!isRecord(pending)) return;
    const nextSession = readSession(pending.nextSession);
    const captured = await capture(true);
    if (samePendingState(captured.state, pending.state) && (!chromeFallbackArea || runtime.isActiveAreaName('sync'))) {
      await privateStore.put('session', nextSession);
      await privateStore.put('recoveryBlocked', false);
      await setStatus({ state: nextSession.config && nextSession.config.enabled ? 'ready' : 'paused', error: null });
    } else {
      // Preserve edits made after the interruption. A partial application is
      // never uploaded automatically; its complete previous copy is recoverable.
      await privateStore.put('replacementBackup', { captured: pending.captured, savedAt: Date.now() });
      await privateStore.put('replacementBackupMeta', { savedAt: Date.now() });
      await privateStore.put('session', { config: nextSession.config ? { ...nextSession.config, enabled: false } : null, base: null });
      await privateStore.put('recoveryBlocked', true);
      await setStatus({ state: 'error', enabled: false, error: 'interrupted-apply' });
    }
    await privateStore.put('pendingApply', null);
  }
  function mirrorChrome(): Promise<MirrorResult> { return withLocalWrite(mirrorChromeInternal); }
  async function mirrorChromeInternal(): Promise<MirrorResult> {
    if (!chromeFallbackArea || !runtime.isActiveAreaName('local')) return { complete: false, skipped: [] };
    const values = await storage(localPrefsArea, 'get', [...settings.CHROME_SYNC_STORAGE_KEYS]);
    const existing = await storage(chromeFallbackArea, 'get', null);
    const plan = contract.planChromeBackup(values, existing, { quota: chromeFallbackArea.QUOTA_BYTES,
      itemQuota: chromeFallbackArea.QUOTA_BYTES_PER_ITEM, maxItems: chromeFallbackArea.MAX_ITEMS });
    // Only migrate an older local-primary installation when its full
    // preferences fit. Never replace Chrome with a partial WebDAV backup.
    // The card names the condition; it persists until the settings shrink.
    if (!plan.complete) {
      await setStatus({ chromeBackup: 'incomplete', chromeSkipped: plan.skipped.length });
      throw Object.assign(clientApi.error('chrome-capacity'), { recorded: true });
    }
    try {
      if (plan.remove.length) await storage(chromeFallbackArea, 'remove', plan.remove);
      if (Object.keys(plan.payload).length) await storage(chromeFallbackArea, 'set', plan.payload);
      await storage(localPrefsArea, 'set', { [settings.LOCAL_PRIMARY_STORAGE_KEY]: false });
      await setStatus({ chromeBackup: 'complete', chromeSkipped: 0 });
    } catch (cause) {
      report('Could not write the browser sync backup.', cause);
      await setStatus({ chromeBackup: 'failed' });
      throw Object.assign(clientApi.error('chrome-capacity'), { recorded: true });
    }
    return plan;
  }
  // The browser-sync backup of an older local-primary installation is a
  // standing condition of this device, not part of a WebDAV round: its
  // failure is recorded for the card and never stops the round itself.
  async function mirrorReporting(): Promise<void> {
    try { await mirrorChrome(); }
    catch (cause) { if (!isRecorded(cause)) report('Could not back up settings to browser sync.', cause); }
  }
  async function readRemote(client: WebDavClient): Promise<RemoteState | null> {
    const remote = await client.readState();
    return remote && { state: contract.validateState(remote.state), etag: remote.etag };
  }
  // A write lock this device took but could not release would hold every
  // device at remote-locked. It is retried once at once and otherwise
  // remembered, so the next round releases it before anything else.
  async function releaseOwnStaleLock(client: WebDavClient): Promise<void> {
    const marker = await privateStore.get('staleLock');
    if (!marker || typeof client.releaseStaleLock !== 'function') return;
    try { if (await client.releaseStaleLock(marker)) await privateStore.put('staleLock', null); }
    catch (cause) { report('Could not release a WebDAV write lock left by this device.', cause); }
  }
  async function rememberStaleLock(client: WebDavClient, marker: StaleLockMarker): Promise<void> {
    if (!marker.uncertain) {
      try { if (await client.releaseStaleLock(marker)) return; }
      catch (_cause) { /* Kept for the next round below. */ }
    }
    await privateStore.put('staleLock', marker);
  }
  async function writeState(client: WebDavClient, state: WebDavState, remote: RemoteState | null): Promise<{ state: unknown; etag: string }> {
    let written;
    try { written = await client.writeState(state, remote && remote.etag); }
    catch (cause) {
      if (clientApi.isWebDavError(cause) && cause.staleLock) await rememberStaleLock(client, cause.staleLock);
      throw cause;
    }
    if (written && written.staleLock) await rememberStaleLock(client, written.staleLock);
    return written;
  }
  async function publish(state: WebDavState, remote: RemoteState | null, client: WebDavClient, capturedGeneration: number): Promise<RemoteState> {
    if (capturedGeneration !== generation) fail('local-changed');
    await uploadAssets(state, client, remote && remote.state.assets);
    if (remote) await archiveSnapshot(remote.state, client);
    if (capturedGeneration !== generation) fail('local-changed');
    // The client already read the state back under the lock and compared it.
    const written = await writeState(client, state, remote);
    return { state: contract.validateState(written.state), etag: written.etag };
  }
  // Each device keeps its last SNAPSHOT_SLOTS copies of the server state it
  // replaced, overwriting the oldest, so snapshots never pile up. Older
  // clients' randomly named snapshots are left alone.
  async function archiveSnapshot(remoteState: WebDavState, client: WebDavClient): Promise<void> {
    const saved = await privateStore.get('snapshotRing');
    const ring = isRecord(saved) && typeof saved.device === 'string' && /^[-\w]{1,80}$/.test(saved.device) &&
      typeof saved.next === 'number' && Number.isInteger(saved.next)
      ? { device: saved.device, next: saved.next } : { device: cryptoApi.randomUUID(), next: 0 };
    const slot = ((ring.next % SNAPSHOT_SLOTS) + SNAPSHOT_SLOTS) % SNAPSHOT_SLOTS;
    const archived = await client.request(`snapshots/${ring.device}-${slot}.json`, 'PUT', JSON.stringify(remoteState),
      { 'Content-Type': 'application/json' });
    if (![200, 201, 204].includes(archived.status)) fail('write-failed');
    await privateStore.put('snapshotRing', { device: ring.device, next: (slot + 1) % SNAPSHOT_SLOTS });
  }
  // Answers to the first-join choice: keep one side, or merge wallpapers onto the server's copy.
  const INITIAL_DECISIONS: readonly unknown[] = ['local', 'remote', 'merge'];
  async function readConflict(): Promise<{ local: WebDavState; remote: WebDavState; keys: string[] } | null> {
    const conflict = await privateStore.get('conflict');
    if (!isRecord(conflict)) return null;
    try {
      const keys: unknown[] = Array.isArray(conflict.keys) ? conflict.keys : [];
      return { local: contract.validateState(conflict.local), remote: contract.validateState(conflict.remote),
        keys: keys.filter((key): key is string => typeof key === 'string') };
    } catch (_cause) { return null; }
  }
  async function syncInternal(decision?: string): Promise<SyncResult> {
    const { config, base } = await session();
    if (!config || !config.enabled) return { paused: true };
    await setStatus({ state: 'syncing', error: null });
    const client = await verifiedClient(config);
    await saveConfig(config);
    await releaseOwnStaleLock(client);
    const captured = await capture(INITIAL_DECISIONS.includes(decision));
    const remote = await readRemote(client);
    if (INITIAL_DECISIONS.includes(decision)) {
      await privateStore.put('replacementBackup', { captured, savedAt: Date.now() });
      await privateStore.put('replacementBackupMeta', { savedAt: Date.now() });
    }
    let target: WebDavState;
    if (decision === 'merge') {
      if (!remote) fail('remote-missing');
      target = contract.mergeInitialWallpapers(captured.state, remote.state);
    } else if (base && remote && (decision === 'local' || decision === 'remote')) target = contract.mergeStates(base, captured.state, remote.state, decision).state;
    else if (decision === 'local') target = captured.state;
    else if (decision === 'remote') {
      if (!remote) fail('remote-missing');
      target = contract.adoptRemote(captured.state, remote.state);
    } else if (!remote) {
      if (base) fail('remote-missing');
      target = captured.state;
    } else if (!base) {
      await setStatus({ state: 'choice', conflicts: [], error: null });
      return { needsChoice: true };
    } else {
      const merged = contract.mergeStates(base, captured.state, remote.state);
      if (merged.conflicts.length) {
        await privateStore.put('conflict', { local: captured.state, remote: remote.state, keys: merged.conflicts });
        await setStatus({ state: 'conflict', conflicts: merged.conflicts, error: null });
        return { conflict: true };
      }
      target = merged.state;
    }
    await prepareChrome(target, captured);
    if (!remote || !contract.sameContent(target, remote.state)) await publish(target, remote, client, captured.generation);
    if (!contract.equal(target, captured.state)) {
      // The server now holds target: the captured state plus what only the
      // server changed. Until target is applied here, the captured state is
      // what both sides share. As the baseline it survives an apply that
      // fails below: published edits of this device are not reported again
      // as conflicts, and the server's changes are not taken for reverts.
      await privateStore.put('session', { config, base: captured.state });
      await apply(target, captured, client, false, { config, base: target });
    } else {
      await privateStore.put('session', { config, base: target });
      if (captured.generation !== generation) fail('local-changed');
    }
    if (decision) await privateStore.put('recoveryBlocked', false);
    await privateStore.put('conflict', null);
    await mirrorReporting();
    await setStatus({ state: 'ready', error: null, diagnostic: null, conflicts: [], lastSyncAt: Date.now() });
    await sweepDaily(client);
    return { ok: true };
  }
  // Folders of abandoned lock attempts pile up on the server otherwise; a
  // daily sweep costs one listing. It never fails the sync that ran it.
  async function sweepDaily(client: WebDavClient): Promise<void> {
    if (typeof client.sweepAbandoned !== 'function' || clock() - (Number(await privateStore.get('sweptAt')) || 0) < SWEEP_INTERVAL_MS) return;
    await privateStore.put('sweptAt', clock());
    try { await client.sweepAbandoned(); }
    catch (cause) { report('Could not remove abandoned WebDAV lock folders.', cause); }
  }
  async function guardedSync(decision?: string): Promise<SyncResult> {
    try {
      await recoverPendingApply();
      const result = await syncInternal(decision);
      contention = 0;
      if (await privateStore.get('throttle')) await privateStore.put('throttle', null);
      return result;
    } catch (cause) {
      const code = errorCode(cause);
      if (!decision && THROTTLE_CODES.includes(code) && !stopped) return throttled(cause);
      // A first-join choice is retried by the user, who is still on the page.
      if (!decision && CONTENTION_CODES.includes(code) && contention < contentionDelays.length && !stopped) {
        const delay = contentionDelays[contention] * (0.75 + Math.random() * 0.5);
        contention += 1;
        await setStatus({ state: 'pending', error: null, diagnostic: null });
        queueSync(delay, { keepAlive: true });
        return { pending: true };
      }
      contention = 0;
      const diagnostic = clientApi.diagnostic(errorField(cause, 'diagnostic'));
      await setStatus({ state: code === 'local-changed' ? 'pending' : code === 'remote-missing' ? 'choice' : 'error',
        error: code || 'sync-failed', diagnostic });
      // Callers without a page to report to know the card already shows it.
      throw Object.assign(clientApi.error(code || 'sync-failed'), { diagnostic, recorded: true });
    }
  }
  async function throttled(cause: unknown): Promise<SyncResult> {
    contention = 0;
    const previous = await privateStore.get('throttle');
    const attempt = isRecord(previous) && typeof previous.attempt === 'number' && Number.isInteger(previous.attempt)
      ? Math.min(previous.attempt + 1, throttleDelays.length - 1) : 0;
    const delay = Math.max(throttleDelays[attempt] * (0.9 + Math.random() * 0.2), Number(errorField(cause, 'retryAfterMs')) || 0);
    const retryAt = clock() + delay;
    await privateStore.put('throttle', { until: retryAt, attempt });
    await setStatus({ state: 'pending', error: errorCode(cause), diagnostic: null, retryAt });
    // The alarm also resumes after the wait if this worker is unloaded first.
    queueSync(delay);
    return { pending: true, retryAt };
  }
  // Rounds nobody asked for skip the server while it is refusing requests.
  // A saved end further away than any wait means the device clock went back;
  // trusting it would suppress background sync for that long.
  async function throttledUntil(): Promise<number | null> {
    const saved = await privateStore.get('throttle');
    const until = isRecord(saved) ? Number(saved.until) : NaN;
    return until > clock() && until - clock() <= THROTTLE_MAX_MS ? until : null;
  }
  const sameAccount = (left: ConnectionHint, right: ConnectionHint): boolean => ACCOUNT_FIELDS.every((key) => left[key] === right[key]);
  const sameCredentials = (left: WebDavConnection, right: WebDavConnection): boolean => (
    CONNECTION_FIELDS.every((key) => left[key] === right[key])
  );
  async function connection(input: unknown): Promise<StoredConnection> {
    const { config: previous } = await session();
    const fields = isRecord(input) ? input : {};
    const candidate: StoredConnection = clientApi.normalizeConfig({ ...fields,
      password: fields.password || (previous && previous.password) || 'placeholder' });
    if (!fields.password && (!previous || candidate.endpoint !== previous.endpoint || candidate.username !== previous.username)) fail('missing-credentials');
    if (previous && previous.clientRevision === clientApi.REVISION && sameCredentials(candidate, previous)) {
      candidate.concurrency = previous.concurrency;
      candidate.lockStrategy = previous.lockStrategy;
      candidate.clientRevision = previous.clientRevision;
    }
    return candidate;
  }
  async function verifiedClient(config: StoredConnection): Promise<WebDavClient> {
    const client = clientApi.createClient(config, opts.clientOptions);
    if (config.clientRevision !== clientApi.REVISION) {
      const capabilities = probeCache.get(clientApi.REVISION, config) || await client.testConnection();
      config.concurrency = capabilities.concurrency;
      config.lockStrategy = capabilities.lockStrategy;
      config.clientRevision = clientApi.REVISION;
    }
    return client;
  }
  async function connect(input: unknown, decision?: string): Promise<SyncResult> {
    const config = await connection(input);
    const client = await verifiedClient(config);
    const { config: previous, base } = await session();
    if (previous && sameCredentials(config, previous)) {
      // Persist only capabilities belonging to this exact saved connection.
      // Repeated toggles and worker restarts don't rerun destructive probes.
      await saveConfig({ ...config, enabled: previous.enabled });
    }
    if (previous && sameAccount(config, previous)) await releaseOwnStaleLock(client);
    const remote = await readRemote(client);
    if (!decision && previous && config.endpoint === previous.endpoint && config.directory === previous.directory &&
        config.username === previous.username && base) {
      await saveConfig({ ...config, enabled: true });
      await setStatus({ enabled: true });
      schedule();
      return guardedSync();
    }
    if (remote && !INITIAL_DECISIONS.includes(decision)) {
      await setStatus({ state: 'choice', conflicts: [], error: null });
      return { needsChoice: true };
    }
    const captured = await capture(INITIAL_DECISIONS.includes(decision));
    await privateStore.put('migrationBackup', { captured, savedAt: Date.now() });
    await privateStore.put('migrationBackupMeta', { savedAt: Date.now() });
    const target = remote && decision === 'remote' ? contract.adoptRemote(captured.state, remote.state)
      : remote && decision === 'merge' ? contract.mergeInitialWallpapers(captured.state, remote.state)
        : captured.state;
    await prepareChrome(target, captured);
    if (!remote || decision === 'local' || !contract.sameContent(target, remote.state)) {
      await publish(target, remote, client, captured.generation);
    }
    if (opts.managed && contract.equal(target, captured.state) && runtime.isActiveAreaName('sync')) {
      if (captured.generation !== generation) fail('local-changed');
      await privateStore.put('session', { config: { ...config, enabled: true }, base: target });
      await privateStore.put('recoveryBlocked', false);
    } else await apply(target, captured, client, true, { config: { ...config, enabled: true }, base: target });
    await privateStore.put('conflict', null);
    // The server answered every request of a full join, so a later refusal
    // starts again from the shortest wait.
    await privateStore.put('throttle', null);
    await mirrorReporting();
    await setStatus({ state: 'ready', enabled: true, error: null, diagnostic: null, conflicts: [], lastSyncAt: Date.now() });
    schedule();
    return { ok: true };
  }
  // A failed enable keeps the connection paused but leaves its reason on the
  // card, instead of a transient message that disappears on refresh.
  async function connectReporting(input: unknown, decision?: string): Promise<SyncResult> {
    try { return await connect(input, decision); }
    catch (cause) {
      const code = errorCode(cause);
      const diagnostic = clientApi.diagnostic(errorField(cause, 'diagnostic'));
      if (code !== 'local-changed') await setStatus({ error: code || 'sync-failed', diagnostic }).catch(() => {});
      throw code ? Object.assign(clientApi.error(code), { diagnostic }) : cause;
    }
  }
  async function pause(): Promise<SyncResult> {
    const { config } = await session();
    if (config) await saveConfig({ ...config, enabled: false });
    await privateStore.put('throttle', null);
    await setStatus({ state: 'paused', enabled: false, error: null, diagnostic: null });
    if (timer) { clearTimeout(timer); timer = null; }
    if (chromeApi.alarms && typeof chromeApi.alarms.clear === 'function') await chromeApi.alarms.clear(alarmName);
    return { ok: true };
  }
  async function useBrowserSync(): Promise<SyncResult> {
    await runtime.ready;
    if (!runtime.isActiveAreaName('local')) return pause();
    const capturedGeneration = generation;
    const plan = await mirrorChrome();
    if (!plan.complete) fail('chrome-capacity');
    await pause();
    if (capturedGeneration !== generation) fail('local-changed');
    await storage(localPrefsArea, 'set', { [settings.LOCAL_PRIMARY_STORAGE_KEY]: false });
    await setStatus({ state: 'browser', chromeBackup: 'complete' });
    return { ok: true };
  }
  async function status(): Promise<ConnectionStatus> {
    await runtime.ready;
    const { config } = await session();
    const values = await storage(localPrefsArea, 'get', [statusKey]);
    const saved = values[statusKey];
    return { ...(isRecord(saved) ? saved : { state: 'browser' }),
      clientRevision: clientApi.REVISION,
      syncRevision: SYNC_REVISION,
      localPrimary: runtime.isActiveAreaName('local'), enabled: Boolean(config && config.enabled),
      config: config ? { endpoint: config.endpoint, directory: config.directory, username: config.username,
        concurrency: config.concurrency || 'conditional', hasPassword: true } : null,
      hasMigrationBackup: Boolean(await privateStore.get('replacementBackupMeta') || await privateStore.get('migrationBackupMeta')),
      needsRecovery: Boolean(await privateStore.get('recoveryBlocked')) };
  }
  function schedule(): void {
    if (!chromeApi.alarms || typeof chromeApi.alarms.create !== 'function') return;
    // Persistent recurring checks also recover an interrupted task even if
    // its last onChanged event never reached the short debounce timer.
    if (stopped) return;
    ignoreRejection(chromeApi.alarms.create(alarmName, { delayInMinutes: 1, periodInMinutes: 5 }));
  }
  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
      if (stopped) return;
      const changed = watchedKeys.filter((key) => changes[key]);
      // This controller's own apply: nothing new to capture or upload.
      if (changed.length && !changes[CHROME_SYNC_META_KEY] &&
          changed.filter((key) => !isOwnWrite(areaName, key, changes[key])).length === 0) return;
      if ((areaName === 'local' || (areaName === 'sync' && !runtime.isActiveAreaName('local'))) &&
          changed.length) generation += 1;
      if (!((areaName === 'sync' && !runtime.isActiveAreaName('local')) || areaName === 'local') ||
          !(watchedKeys.some((key) => changes[key]) || (areaName === 'sync' && changes[CHROME_SYNC_META_KEY]))) return;
      queueSync(1500);
  }
  let timerKeepsAlive = false;
  function queueSync(delay: number, queueOptions?: { keepAlive?: boolean }): void {
    if (timer) {
      clearTimeout(timer);
      if (timerKeepsAlive) releaseKeepAlive();
    }
    // A contention retry waits up to ~30 s, longer than Firefox keeps an
    // idle event page; without this the retry would be lost until the alarm.
    timerKeepsAlive = Boolean(queueOptions && queueOptions.keepAlive);
    if (timerKeepsAlive) holdKeepAlive();
    timer = setTimeout(() => {
      timer = null;
      void backgroundRound(false);
      // exclusive() took its own hold above, so the page stays alive throughout.
      if (timerKeepsAlive) {
        timerKeepsAlive = false;
        releaseKeepAlive();
      }
    }, delay);
    unrefTimer(timer);
  }
  // Timer, alarm and start-up rounds have no page waiting for them. The
  // round records its own outcome on the card; anything it could not record
  // is logged instead of disappearing.
  function backgroundRound(recover: boolean): Promise<void> {
    return exclusive(async () => {
      if (stopped) return;
      let recovered = true;
      if (recover) {
        try { await recoverPendingApply(); }
        catch (cause) { recovered = false; report('Could not recover an interrupted WebDAV apply.', cause); }
      }
      // A partially applied state must not reach browser sync either.
      if (recovered) await mirrorReporting();
      if (await throttledUntil()) return;
      await guardedSync();
    }).catch((cause: unknown) => { if (!cause || !isRecorded(cause)) report('WebDAV sync failed.', cause); });
  }
  function onAlarm(alarm: chrome.alarms.Alarm): void {
    if (!stopped && alarm.name === alarmName) void backgroundRound(false);
  }
  function start(): void {
    if (started || stopped) return;
    started = true;
    chromeApi.storage.onChanged.addListener(onStorageChanged);
    if (chromeApi.alarms && chromeApi.alarms.onAlarm) chromeApi.alarms.onAlarm.addListener(onAlarm);
    if (opts.managed) return;
    runtime.ready.then(async () => {
      const { config } = await session();
      if ((config && config.enabled) || runtime.isActiveAreaName('local') || await privateStore.get('pendingApply')) {
        if (config && config.enabled) schedule();
        await backgroundRound(true);
      }
    }).catch((cause: unknown) => report('Could not start WebDAV sync.', cause));
  }
  function stop(): Promise<void> {
    return exclusive(async () => {
      await pause();
      stopped = true;
      if (chromeApi.storage.onChanged.removeListener) chromeApi.storage.onChanged.removeListener(onStorageChanged);
      if (chromeApi.alarms && chromeApi.alarms.onAlarm.removeListener) chromeApi.alarms.onAlarm.removeListener(onAlarm);
    });
  }
  async function handle(request: WebDavRequest): Promise<HandleResult> {
    await runtime.ready;
    await recoverPendingApply();
    switch (request.operation) {
      case 'recover': return { ok: true };
      case 'schedule': schedule(); return { ok: true };
      case 'status': return status();
      case 'save': {
        const config = await connection(request.config);
        const previous = await session();
        const previousConfig = previous.config;
        // Saving an unchanged form must not interrupt a running connection.
        if (previousConfig && sameCredentials(previousConfig, config)) {
          return { ok: true, unchanged: true };
        }
        const wasEnabled = Boolean(previousConfig && previousConfig.enabled);
        const sameServer = Boolean(previousConfig && sameAccount(previousConfig, config));
        await privateStore.put('session', { config: { ...config, enabled: false }, base: sameServer ? previous.base : null });
        // A lock left on the old server is not this connection's any more.
        if (!sameServer) await privateStore.put('staleLock', null);
        await pause();
        await setStatus({ conflicts: [], ...(!sameServer ? { lastSyncAt: null } : {}) });
        if (wasEnabled && request.resume === true) return { ...await connectReporting((await session()).config), resumed: true };
        return { ok: true };
      }
      case 'test': {
        const config = await connection(request.config);
        const capabilities = await clientApi.createClient(config, opts.clientOptions).testConnection();
        probeCache.set(clientApi.REVISION, config, { concurrency: capabilities.concurrency, lockStrategy: capabilities.lockStrategy });
        return capabilities;
      }
      case 'enable': {
        const { config } = await session();
        if (!config) fail('missing-credentials');
        return connectReporting(config, request.decision);
      }
      case 'connect': return connectReporting(request.config, request.decision);
      case 'conflictDetails': {
        const conflict = await readConflict();
        const { base } = await session();
        if (!conflict || !base) return { items: [] };
        let validBase: WebDavState;
        try { validBase = contract.validateState(base); } catch (_cause) { return { items: [] }; }
        return { items: contract.describeConflict(validBase, conflict.local, conflict.remote, conflict.keys) };
      }
      case 'sync': return guardedSync(request.decision);
      case 'pause': return pause();
      case 'browser': return useBrowserSync();
      case 'restoreBackup': {
        const backup = await privateStore.get('replacementBackup') || await privateStore.get('migrationBackup');
        if (!isRecord(backup)) fail('backup-missing');
        const backupState = contract.validateState(isRecord(backup.captured) ? backup.captured.state : undefined);
        const captured = await capture(true);
        const { config, base } = await session();
        await apply(backupState, captured, config ? clientApi.createClient(config, opts.clientOptions) : null, true,
          { config: config ? { ...config, enabled: false } : null, base });
        await mirrorReporting();
        await setStatus({ state: 'paused', enabled: false, error: null });
        return { ok: true };
      }
      default: fail('unknown-operation');
    }
  }
  return Object.freeze({ start, stop, status, capture, mirrorChrome,
    handle: (request: WebDavRequest) => exclusive(() => { if (stopped) fail('connection-missing'); return handle(request); }) });
}
function createController(options?: ConnectionControllerOptions | null): Readonly<WebDavSyncManager> {
  const opts = options || {};
  const chromeApi = opts.chrome || chrome;
  const settings = opts.settings || LumnoSettings;
  const cryptoApi = opts.crypto || globalThis.crypto;
  const store = opts.privateStore || createPrivateStore(globalThis.indexedDB);
  const wallpaperStore: SyncWallpaperStore = opts.wallpaperStore ||
    LumnoNewtabWallpaperLocalStore.createWallpaperLocalStore({ windowObj: globalThis, onChange() {} });
  const workers = new Map<string, Readonly<ConnectionController>>();
  const probeCache = opts.probeCache || createProbeCache();
  const recordKeys = ['session', 'pendingApply', 'recoveryBlocked', 'conflict', 'replacementBackup', 'replacementBackupMeta', 'migrationBackup', 'migrationBackupMeta',
    'staleLock', 'snapshotRing', 'throttle', 'sweptAt'];
  let ids: string[] = [];
  let registryChain: Promise<unknown> = Promise.resolve();
  let hintChain: Promise<unknown> = Promise.resolve();
  let localChain: Promise<unknown> = Promise.resolve();
  let started = false;
  const clientApi = opts.client || LumnoWebDavClient;
  function fail(code: string): never { throw clientApi.error(code); }
  const keyFor = (id: string, key: string): string => id === 'default' || key.startsWith('asset:') ? key : `connection:${id}:${key}`;
  const statusKeyFor = (id: string): string => id === 'default' ? settings.WEBDAV_STATUS_STORAGE_KEY : `${settings.WEBDAV_STATUS_STORAGE_KEY}:${id}`;
  function serialRegistry<T>(fn: () => Promise<T>): Promise<T> {
    const job = registryChain.then(fn);
    registryChain = job.catch(() => {});
    return job;
  }
  function serialHints<T>(fn: () => Promise<T>): Promise<T> {
    const job = hintChain.then(fn);
    hintChain = job.catch(() => {});
    return job;
  }
  const withLocalWrite: WithLocalWrite = (fn) => {
    const job = localChain.then(fn);
    localChain = job.catch(() => {});
    return job;
  };
  function localStorage(method: 'get', keys: string[]): Promise<StorageItems>;
  function localStorage(method: 'set', items: StorageItems): Promise<void>;
  function localStorage(method: 'remove', keys: string[]): Promise<void>;
  function localStorage(method: StorageMethod, value: string[] | StorageItems): Promise<StorageItems | void> {
    const area = chromeApi.storage.local;
    return new Promise((resolve, reject) => {
      const done = (result?: StorageItems): void => {
        if (chromeApi.runtime.lastError) reject(new Error('local-storage-failed')); else resolve(result);
      };
      if (method === 'get') area.get(Array.isArray(value) ? value : [], (result) => done(result));
      else if (method === 'set') area.set(isRecord(value) && !Array.isArray(value) ? value : {}, () => done());
      else area.remove(Array.isArray(value) ? value : [], () => done());
    });
  }
  async function notifyRegistry(): Promise<void> {
    await localStorage('set', { [`${settings.WEBDAV_STATUS_STORAGE_KEY}:connections`]: cryptoApi.randomUUID() });
  }
  // Every device publishes the address, directory and username of its
  // connections through browser sync, so a new device only asks for the app
  // password. The password itself never leaves the device that holds it.
  const sameConnection = (left: ConnectionHint, right: ConnectionHint): boolean => ACCOUNT_FIELDS.every((key) => left[key] === right[key]);
  function connectionHints(value: unknown): ConnectionHint[] {
    const hints: ConnectionHint[] = [];
    const items: unknown[] = isRecord(value) && value.version === 1 && Array.isArray(value.items) ? value.items : [];
    for (const item of items) {
      let config: WebDavConnection;
      try { config = clientApi.normalizeConfig({ ...(isRecord(item) ? item : {}), password: 'placeholder' }); } catch (_error) { continue; }
      const hint = { endpoint: config.endpoint, directory: config.directory, username: config.username };
      if (JSON.stringify(hint).length <= MAX_HINT_BYTES && !hints.some((existing) => sameConnection(existing, hint))) hints.push(hint);
    }
    return hints.slice(-MAX_HINTS);
  }
  function syncStorage(method: 'get', keys: string[]): Promise<StorageItems>;
  function syncStorage(method: 'set', items: StorageItems): Promise<StorageItems>;
  function syncStorage(method: 'get' | 'set', value: string[] | StorageItems): Promise<StorageItems> {
    return new Promise((resolve, reject) => {
      const area: chrome.storage.SyncStorageArea | undefined = chromeApi.storage.sync;
      if (!area) { resolve({}); return; }
      const done = (result?: StorageItems): void => {
        if (chromeApi.runtime.lastError) reject(new Error('sync-storage-failed')); else resolve(result || {});
      };
      if (method === 'get') area.get(Array.isArray(value) ? value : [], (result) => done(result));
      else area.set(isRecord(value) && !Array.isArray(value) ? value : {}, () => done());
    });
  }
  // Hints are a convenience: failing to publish one never fails the
  // connection change that triggered it.
  function publishHints(removed: ReadonlyArray<ConnectionHint | null>, added: ReadonlyArray<ConnectionHint | null>): Promise<void> {
    return serialHints(async () => {
      const key = settings.WEBDAV_CONNECTIONS_SYNC_STORAGE_KEY;
      const current = connectionHints((await syncStorage('get', [key]))[key]);
      const next = connectionHints({ version: 1, items: [
        ...current.filter((item) => !removed.some((config) => config && sameConnection(config, item))),
        ...added.filter(Boolean)] });
      if (JSON.stringify(next) !== JSON.stringify(current)) await syncStorage('set', { [key]: { version: 1, items: next } });
    }).catch(() => {});
  }
  async function configOf(id: string): Promise<ConnectionHint | null> {
    const { config } = await worker(id).status();
    return config ? { endpoint: config.endpoint, directory: config.directory, username: config.username } : null;
  }
  function worker(id: string): Readonly<ConnectionController> {
    const known = workers.get(id);
    if (known) return known;
    const scopedStore: PrivateStore = { get: (key) => store.get(keyFor(id, key)), put: (key, value) => store.put(keyFor(id, key), value) };
    const controller = createConnectionController({ ...opts, chrome: chromeApi, settings, privateStore: scopedStore,
      wallpaperStore, probeCache, statusKey: statusKeyFor(id), alarmName: id === 'default' ? ALARM_NAME : `${ALARM_NAME}:${id}`,
      managed: true, withLocalWrite,
      // An unrecovered local write of any connection may have left a
      // partial state, so no connection uploads until its journal is
      // recovered (at start-up, before any sync). A connection that then
      // waits for its backup to be restored pauses only itself: the others
      // keep syncing the device's current settings instead of stopping
      // until someone restores.
      hasPendingApply: async () => {
        if (await store.get(keyFor(id, 'recoveryBlocked'))) return true;
        for (const connectionId of workers.keys()) if (await store.get(keyFor(connectionId, 'pendingApply'))) return true;
        return false;
      } });
    workers.set(id, controller);
    controller.start();
    return controller;
  }
  const ready = (async () => {
    const saved = await store.get('connections');
    if (Array.isArray(saved)) {
      const savedIds: unknown[] = saved;
      ids = [...new Set(savedIds.filter((id): id is string => typeof id === 'string' && /^(default|[\w-]{1,80})$/.test(id)))];
    } else {
      // Keep the existing credential, baseline and backups together in place.
      if (readSession(await store.get('session')).config) ids = ['default'];
      await store.put('connections', ids);
    }
    ids.forEach(worker);
    // Recover every interrupted local application before any server can upload.
    for (const id of ids) {
      await worker(id).handle({ operation: 'recover' });
      const current = await worker(id).status();
      if (!current.enabled && current.error === 'interrupted-apply' && current.hasMigrationBackup) await store.put(keyFor(id, 'recoveryBlocked'), true);
    }
    // Connections added before hints existed reach other devices too.
    await publishHints([], await Promise.all(ids.map(configOf)));
  })();
  // Two connections to the same account and directory would sync one remote
  // with two independent baselines and treat each other's writes as changes.
  async function assertUnique(input: unknown, exceptId?: string): Promise<void> {
    let candidate: WebDavConnection;
    const fields = isRecord(input) ? input : {};
    try { candidate = clientApi.normalizeConfig({ ...fields, password: fields.password || 'placeholder' }); }
    catch (_error) { return; }
    for (const id of ids) {
      if (id === exceptId) continue;
      const { config } = await worker(id).status();
      if (config && sameConnection(config, candidate)) fail('duplicate-connection');
    }
  }
  async function discard(id: string): Promise<void> {
    await worker(id).stop();
    workers.delete(id);
    for (const key of recordKeys) {
      if (store.delete) await store.delete(keyFor(id, key)); else await store.put(keyFor(id, key), null);
    }
    await localStorage('remove', [statusKeyFor(id)]);
  }
  async function hasLocalHistory(id: string): Promise<boolean> {
    for (const key of ['migrationBackup', 'pendingApply', 'recoveryBlocked']) if (await store.get(keyFor(id, key))) return true;
    return false;
  }
  async function status(): Promise<ManagerStatus> {
    await ready;
    const connections = (await Promise.all(ids.map(async (id) => ({ id, ...await worker(id).status() })))).filter((item) => item.config);
    return { ...(connections[0] || { state: 'browser', enabled: false, config: null }),
      clientRevision: clientApi.REVISION, syncRevision: SYNC_REVISION, connections, suggestions: await suggestions(connections) };
  }
  // Synced connections this device has neither added nor dismissed.
  async function suggestions(connections: ReadonlyArray<ConnectionStatus>): Promise<ConnectionHint[]> {
    const syncKey = settings.WEBDAV_CONNECTIONS_SYNC_STORAGE_KEY;
    const dismissedKey = settings.WEBDAV_DISMISSED_CONNECTIONS_STORAGE_KEY;
    let hints: ConnectionHint[] = [];
    let dismissed: ConnectionHint[] = [];
    try {
      hints = connectionHints((await syncStorage('get', [syncKey]))[syncKey]);
      dismissed = connectionHints((await localStorage('get', [dismissedKey]))[dismissedKey]);
    } catch (_error) { return []; }
    const known: ConnectionHint[] = [...connections.flatMap((item) => (item.config ? [item.config] : [])), ...dismissed];
    return hints.filter((hint) => !known.some((config) => sameConnection(config, hint)));
  }
  async function dismissSuggestion(input: unknown): Promise<SyncResult> {
    const key = settings.WEBDAV_DISMISSED_CONNECTIONS_STORAGE_KEY;
    const [hint] = connectionHints({ version: 1, items: [input] });
    if (!hint) fail('connection-missing');
    const current = connectionHints((await localStorage('get', [key]))[key]);
    await localStorage('set', { [key]: { version: 1, items: connectionHints({ version: 1, items: [...current, hint] }) } });
    return { ok: true };
  }
  function start(): void {
    if (started) return;
    started = true;
    // Another device withdrawing a connection this one still uses puts it
    // back at once, so a new device never misses it in the meantime.
    chromeApi.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync' || !changes[settings.WEBDAV_CONNECTIONS_SYNC_STORAGE_KEY]) return;
      ready.then(async () => publishHints([], await Promise.all(ids.map(configOf)))).catch(() => {});
    });
    ready.then(() => Promise.all(ids.map(async (id) => {
      const current = await worker(id).status();
      if (current.enabled) {
        await worker(id).handle({ operation: 'schedule' });
        await worker(id).handle({ operation: 'sync' });
      }
    }))).catch((cause: unknown) => {
      // A failed round is already on its card; only the rest is logged.
      if (!cause || !isRecorded(cause)) (opts.logger || globalThis.console).warn('[Lumno] Could not start WebDAV sync.', cause);
    });
  }
  async function handle(request: WebDavRequest): Promise<HandleResult | ManagerStatus | (HandleResult & { id: string })> {
    await ready;
    if (request.operation === 'status') return status();
    if (request.operation === 'dismissSuggestion') return dismissSuggestion(request.config);
    if (request.operation === 'add' || (request.operation === 'test' && !request.id)) {
      return serialRegistry(async () => {
        if (request.operation === 'add') await assertUnique(request.config);
        const id = cryptoApi.randomUUID();
        const controller = worker(id);
        let retained = false;
        const retain = async (): Promise<void> => {
          const nextIds = [...ids, id];
          await store.put('connections', nextIds);
          ids = nextIds;
          retained = true;
          await notifyRegistry();
        };
        try {
          let result = await controller.handle({ ...request, operation: request.operation === 'add' ? 'save' : 'test' });
          if (request.operation === 'add' && request.enable === true) {
            // The card appears only once the server is verified, so a typo
            // stays in the form instead of becoming a broken connection.
            try { result = await controller.handle({ operation: 'enable' }); }
            catch (cause) {
              if (await hasLocalHistory(id)) await retain();
              throw cause;
            }
          }
          if (request.operation === 'add') {
            await retain();
            await publishHints([], [await configOf(id)]);
          }
          return { ...result, id };
        } finally {
          if (!retained) await discard(id);
        }
      });
    }
    const id = request.id || (ids.length === 1 ? ids[0] : null);
    if (!id || !ids.includes(id)) fail('connection-missing');
    if (request.operation === 'save') {
      await assertUnique(request.config, id);
      const before = await configOf(id);
      const result = await worker(id).handle(request);
      await publishHints([before], [await configOf(id)]);
      return result;
    }
    if (request.operation === 'remove') {
      return serialRegistry(async () => {
        if (!ids.includes(id)) fail('connection-missing');
        await worker(id).handle({ operation: 'recover' });
        if (await store.get(keyFor(id, 'recoveryBlocked'))) fail('interrupted-apply');
        const removed = await configOf(id);
        await worker(id).stop();
        const nextIds = ids.filter((value) => value !== id);
        // Remove the index first: a restart cannot revive this connection.
        await store.put('connections', nextIds);
        ids = nextIds;
        await discard(id);
        await notifyRegistry();
        await publishHints([removed], []);
        return { ok: true };
      });
    }
    return worker(id).handle(request);
  }
  return Object.freeze({ start, status, handle });
}

export type {
  Captured,
  ConnectionController,
  ConnectionControllerOptions,
  ConnectionStatus,
  HandleResult,
  ManagerStatus,
  PrivateStore,
  WebDavSyncManager
};
export {
  createController,
  createConnectionController,
  createPrivateStore,
  createProbeCache,
  isTrustedSender,
  ALARM_NAME,
  SYNC_REVISION
};
