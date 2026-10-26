// The New Tab shortcut list in storage, read and written as one: browser
// sync's three items plus this device's overflow record when the user keeps
// settings in browser sync, or one area when they keep them on the device.
// Every context that changes the list (the New Tab, the page context menu,
// folder shortcuts following their bookmarks) saves it through here.
import { newtabShortcutsLocalOverflow } from '../domain/settings/newtab-shortcuts';
import type { StorageAreaLike, StorageItems } from '../domain/storage-port';
import { persistShortcutState } from './shortcut-storage';
import type { ShortcutPersistOptions, ShortcutPersistResult } from './shortcut-storage';
import { callStorage, isRecord } from './storage-call';
import { DEFAULT_SHORTCUTS_SYNC_RESERVE_BYTES, LEGACY_SHORTCUTS_CHUNK_KEYS, SHORTCUTS_SYNC_KEYS, SHORTCUT_STORAGE_KEYS } from '../domain/shortcuts/constants';
import { getShortcutSyncBudget, measureShortcutSyncUsage, readShortcutState } from '../domain/shortcuts/storage-plan';
import type { ShortcutNormalizeOptions, ShortcutStateRead } from '../domain/shortcuts/types';
import type { ProviderStorageRuntime, StorageChromeApi } from './settings-storage';

// What browser sync's area adds to chrome.storage: its quota and byte counts.
interface SyncAreaLike extends StorageAreaLike {
  QUOTA_BYTES?: number;
  getBytesInUse?(keys: string | string[] | null, callback: (bytes: number) => void): unknown;
}

interface ShortcutListChromeApi extends StorageChromeApi {
  storage?: StorageChromeApi['storage'] & { sync?: SyncAreaLike };
}

interface ShortcutListStorageOptions {
  chromeApi: ShortcutListChromeApi;
  provider: ProviderStorageRuntime;
  // Sync bytes kept free for the other settings.
  reserveBytes?: number;
  normalizeOptions?: ShortcutNormalizeOptions;
}

// The list as stored, with the raw values it was read from, so a caller can
// tell whether a later read changed.
interface ShortcutListRead {
  state: ShortcutStateRead;
  values: StorageItems;
  overflow: unknown;
}

// How much of browser sync the next save may use.
interface ShortcutSyncBudget {
  maxTotalBytes: number;
  legacyKeysPresent: boolean;
}

type ShortcutListWriteOptions = Omit<ShortcutPersistOptions, 'overflowArea' | 'maxTotalBytes' | 'legacyKeysPresent'>;

interface ShortcutListStorage {
  read(): Promise<ShortcutListRead>;
  getSyncBudget(): Promise<ShortcutSyncBudget>;
  write(state: unknown, options?: ShortcutListWriteOptions): Promise<ShortcutPersistResult>;
  // Whether two reads hold the same stored list.
  isSameRead(a: ShortcutListRead, b: ShortcutListRead): boolean;
}

function createShortcutListStorage(options: ShortcutListStorageOptions): ShortcutListStorage {
  const { chromeApi, provider } = options;
  const storage = chromeApi.storage || null;
  const localArea = storage && storage.local ? storage.local : null;
  const syncArea = storage && storage.sync ? storage.sync : null;
  const reserveBytes = options.reserveBytes === undefined ? DEFAULT_SHORTCUTS_SYNC_RESERVE_BYTES : options.reserveBytes;

  function getLastError() {
    return chromeApi.runtime ? chromeApi.runtime.lastError : null;
  }

  async function readArea(area: StorageAreaLike | null, keys: string[] | null): Promise<StorageItems> {
    if (!area) return {};
    const result = await callStorage(chromeApi, (done) => area.get(keys, done));
    return isRecord(result) ? result : {};
  }

  function isSyncActive(): boolean {
    return provider.getActiveAreaName() === 'sync';
  }

  async function read(): Promise<ShortcutListRead> {
    await provider.ready;
    const values = await readArea(provider.area, SHORTCUT_STORAGE_KEYS.slice());
    const overflow = isSyncActive()
      ? (await readArea(localArea, [newtabShortcutsLocalOverflow.key]))[newtabShortcutsLocalOverflow.key]
      : undefined;
    return { state: readShortcutState(values, overflow, options.normalizeOptions), values, overflow };
  }

  function bytesInUse(area: SyncAreaLike, keys: string[] | null): Promise<number> {
    return new Promise((resolve, reject) => {
      if (typeof area.getBytesInUse !== 'function') {
        reject(new Error('Storage byte usage is unavailable'));
        return;
      }
      area.getBytesInUse(keys, (bytes) => {
        const error = getLastError();
        if (error) reject(new Error(error.message || 'Could not read sync byte usage'));
        else resolve(Math.max(0, Number(bytes) || 0));
      });
    });
  }

  // Unknown usage leaves no sync budget, so the save keeps everything in the
  // local overflow record instead of risking the space other settings need.
  async function getSyncBudget(): Promise<ShortcutSyncBudget> {
    if (!isSyncActive() || !syncArea) {
      return { maxTotalBytes: Number.MAX_SAFE_INTEGER, legacyKeysPresent: false };
    }
    const area = syncArea;
    const quotaBytes = Number(area.QUOTA_BYTES) || (100 * 1024);
    try {
      const usage = typeof area.getBytesInUse === 'function'
        ? await Promise.all([
          bytesInUse(area, null),
          bytesInUse(area, SHORTCUTS_SYNC_KEYS.slice()),
          bytesInUse(area, LEGACY_SHORTCUTS_CHUNK_KEYS.slice())
        ]).then(([totalBytes, shortcutBytes, legacyBytes]) => ({ totalBytes, shortcutBytes, legacyBytes }))
        : measureShortcutSyncUsage(await readArea(area, null));
      return {
        maxTotalBytes: getShortcutSyncBudget({ ...usage, quotaBytes, reserveBytes }),
        legacyKeysPresent: usage.legacyBytes > 0
      };
    } catch (_error) {
      return { maxTotalBytes: 0, legacyKeysPresent: false };
    }
  }

  async function write(state: unknown, writeOptions?: ShortcutListWriteOptions): Promise<ShortcutPersistResult> {
    await provider.ready;
    if (!isSyncActive()) {
      return persistShortcutState(provider.area, state, { getLastError, ...writeOptions });
    }
    const budget = await getSyncBudget();
    return persistShortcutState(provider.area, state, {
      getLastError,
      ...writeOptions,
      overflowArea: localArea,
      maxTotalBytes: budget.maxTotalBytes,
      legacyKeysPresent: budget.legacyKeysPresent
    });
  }

  function isSameRead(a: ShortcutListRead, b: ShortcutListRead): boolean {
    return JSON.stringify(a.values) === JSON.stringify(b.values) &&
      JSON.stringify(a.overflow) === JSON.stringify(b.overflow);
  }

  return Object.freeze({ read, getSyncBudget, write, isSameRead });
}

export { createShortcutListStorage };
export type { ShortcutListChromeApi, ShortcutListRead, ShortcutListStorage, ShortcutListStorageOptions, ShortcutListWriteOptions, ShortcutSyncBudget };
