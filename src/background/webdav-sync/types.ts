// The shapes the WebDAV sync modules share.
import * as LumnoNewtabShortcutsStore from '../../domain/shortcuts-store';
import * as LumnoSettings from '../../domain/settings';
import * as LumnoSettingsStorage from '../../platform/settings-storage';
import * as LumnoWebDavContract from '../../domain/webdav-contract';
import type { WebDavClientApi } from '../webdav-client/api';
import type { GroupedShortcutItem } from '../../domain/shortcuts-store';
import type { StorageItems } from '../../domain/storage-port';
import type { ChromeBackupPlan, ConflictDescription, WebDavState } from '../../domain/webdav-contract';
import type { WebDavRequest } from '../../domain/messages';
import type { WallpaperRecord, WallpaperRecordInput } from '../../shared/wallpaper-local-store';
import type { ConnectionCapabilities, WebDavClientOptions, WebDavConnection, WebDavDiagnostic } from '../webdav-client/types';

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
  client?: WebDavClientApi;
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


interface ConnectionContext {
  readonly opts: ConnectionControllerOptions;
  readonly chromeApi: typeof chrome;
  readonly settings: typeof LumnoSettings;
  readonly contract: typeof LumnoWebDavContract;
  readonly shortcuts: typeof LumnoNewtabShortcutsStore;
  readonly clientApi: WebDavClientApi;
  readonly cryptoApi: Crypto;
  readonly privateStore: PrivateStore;
  readonly wallpaperStore: SyncWallpaperStore;
  readonly localPrefsArea: chrome.storage.StorageArea;
  readonly chromeFallbackArea: chrome.storage.SyncStorageArea | undefined;
  readonly runtime: LumnoSettingsStorage.ProviderStorageRuntime;
  readonly statusKey: string;
  readonly alarmName: string;
  readonly withLocalWrite: WithLocalWrite;
  readonly probeCache: ProbeCache;
  readonly keepAliveIntervalMs: number;
  chain: Promise<unknown>;
  activeJobs: number;
  keepAliveTimer: ReturnType<typeof setInterval> | null;
  generation: number;
  timer: ReturnType<typeof setTimeout> | null;
  started: boolean;
  stopped: boolean;
  readonly contentionDelays: number[];
  contention: number;
  readonly throttleDelays: number[];
  readonly THROTTLE_MAX_MS: number;
  readonly clock: () => number;
  readonly logger: { warn(message: string, detail?: unknown): void; } | Console;
  readonly watchedKeys: string[];
  readonly storageRetryDelayMs: number;
  readonly ownWrites: Map<string, string>;
  ownWritesTimer: ReturnType<typeof setTimeout> | null;
  timerKeepsAlive: boolean;
  // The chrome event listeners, kept so stop() removes the ones start() added.
  readonly listeners: {
    storageChanged(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void;
    alarm(alarm: chrome.alarms.Alarm): void;
  };
}


interface ManagerContext {
  readonly opts: ConnectionControllerOptions;
  readonly chromeApi: typeof chrome;
  readonly settings: typeof LumnoSettings;
  readonly cryptoApi: Crypto;
  readonly store: PrivateStore;
  readonly wallpaperStore: SyncWallpaperStore;
  readonly workers: Map<string, Readonly<ConnectionController>>;
  readonly probeCache: ProbeCache;
  readonly recordKeys: string[];
  ids: string[];
  registryChain: Promise<unknown>;
  hintChain: Promise<unknown>;
  localChain: Promise<unknown>;
  started: boolean;
  readonly clientApi: WebDavClientApi;
  ready: Promise<void>;
}

export type {
  Captured,
  ChromePreparation,
  ConnectionContext,
  ConnectionController,
  ConnectionControllerOptions,
  ConnectionHint,
  ConnectionStatus,
  DecodedImage,
  HandleResult,
  ImageCheck,
  ManagerContext,
  ManagerStatus,
  MirrorResult,
  PrivateStore,
  ProbeCache,
  ProbeCapabilities,
  RemoteState,
  Session,
  StatusUpdate,
  StorageCall,
  StorageMethod,
  StoredConnection,
  SyncResult,
  SyncWallpaperStore,
  WebDavSyncManager,
  WithLocalWrite
};
