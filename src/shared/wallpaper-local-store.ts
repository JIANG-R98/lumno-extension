// The custom wallpaper library in IndexedDB: uploads, kept as WebP with a
// thumbnail and a small sample copy.
import { buildRecordFromFile, buildTileThumbnail } from './wallpaper-image';
import { CUSTOM_WALLPAPER_ID, CUSTOM_WALLPAPER_ID_PREFIX } from './wallpaper-records';
import { getDefaultWindow, getOption, isRecord } from './wallpaper-records';
import type {
  WallpaperLocalStore,
  WallpaperPage,
  WallpaperRecord,
  WallpaperRecordInput,
  WallpaperStoreOptions
} from './wallpaper-records';

const DB_NAME = 'lumno-newtab-wallpaper';
const DB_VERSION = 1;
const STORE_NAME = 'wallpapers';
const LEGACY_RECORD_KEY = 'custom';

const LEGACY_GENERIC_NAMES = [
  'Custom wallpaper',
  '\u81ea\u5b9a\u4e49\u58c1\u7eb8'
];

function isCustomWallpaperId(id: unknown): boolean {
  return String(id || '').startsWith(CUSTOM_WALLPAPER_ID_PREFIX);
}

function isGenericCustomWallpaperName(name: unknown): boolean {
  const normalized = String(name || '').trim();
  if (!normalized) {
    return true;
  }
  return LEGACY_GENERIC_NAMES.indexOf(normalized) !== -1;
}

interface WallpaperLocalStoreContext extends WallpaperPage {
  readonly options: WallpaperStoreOptions | null | undefined;
}

function notifyChange(ctx: WallpaperLocalStoreContext): void {
  if (ctx.options && typeof ctx.options.onChange === 'function') {
    ctx.options.onChange();
  } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    void chrome.storage.local.set({
      _x_extension_asset_revision_2026_unique_: `${Date.now()}-${Math.random()}`
    });
  }
}

// A record's id; the single upload saved before the library had ids gets
// one of its own.
function readRecordId(record: Record<string, unknown>): { id: string; isLegacyRecord: boolean } {
  const rawId = String(record.id || record.key || '').trim();
  const isLegacyRecord = rawId === CUSTOM_WALLPAPER_ID || String(record.key || '') === LEGACY_RECORD_KEY;
  const id = isCustomWallpaperId(rawId)
    ? rawId
    : `${CUSTOM_WALLPAPER_ID_PREFIX}${isLegacyRecord ? 'legacy' : Date.now()}`;
  return { id, isLegacyRecord };
}

function normalizeRecord(record: unknown): WallpaperRecord | null {
  if (!isRecord(record)) {
    return null;
  }
  const imageDataUrl = String(record.imageDataUrl || '');
  const thumbnailDataUrl = String(record.thumbnailDataUrl || imageDataUrl);
  if (!imageDataUrl || !thumbnailDataUrl) {
    return null;
  }
  // Uploads saved before small copies existed have none; their effects sample the thumbnail.
  const sampleDataUrl = typeof record.sampleDataUrl === 'string' && record.sampleDataUrl.startsWith('data:image/')
    ? record.sampleDataUrl
    : '';
  const { id, isLegacyRecord } = readRecordId(record);
  const storedName = String(record.name || '').trim();
  return {
    id,
    key: String(record.key || id),
    name: isLegacyRecord && isGenericCustomWallpaperName(storedName) ? '' : storedName,
    imageDataUrl,
    thumbnailDataUrl,
    sampleDataUrl,
    width: Math.max(0, Number(record.width) || 0),
    height: Math.max(0, Number(record.height) || 0),
    updatedAt: Number(record.updatedAt) || Date.now()
  };
}

function openDb(ctx: WallpaperLocalStoreContext): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!ctx.windowObj || !ctx.windowObj.indexedDB) {
      reject(new Error('IndexedDB is not available.'));
      return;
    }
    const request = ctx.windowObj.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onerror = () => {
      reject(request.error || new Error('Failed to open wallpaper database.'));
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function sortByUpdate(records: readonly unknown[]): WallpaperRecord[] {
  return records
    .map(((record: unknown) => normalizeRecord(record)))
    .filter((record): record is WallpaperRecord => record !== null)
    .sort((a, b) => a.updatedAt - b.updatedAt);
}

function readAll(ctx: WallpaperLocalStoreContext): Promise<WallpaperRecord[]> {
  return openDb(ctx).then((db) => {
    return new Promise<WallpaperRecord[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = typeof store.getAll === 'function' ? store.getAll() : null;
      if (!request) {
        reject(new Error('Wallpaper database does not support getAll.'));
        return;
      }
      request.onerror = () => {
        reject(request.error || new Error('Failed to read wallpapers.'));
      };
      request.onsuccess = () => {
        const records: unknown[] = Array.isArray(request.result) ? request.result : [];
        resolve(sortByUpdate(records));
      };
      transaction.oncomplete = () => {
        db.close();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Failed to read wallpapers.'));
      };
    });
  });
}

function readByIds(ctx: WallpaperLocalStoreContext, ids: unknown): Promise<WallpaperRecord[]> {
  const recordKeys: string[] = [];
  const addRecordKey = (key: string): void => {
    const normalizedKey = String(key || '').trim();
    if (normalizedKey && !recordKeys.includes(normalizedKey)) {
      recordKeys.push(normalizedKey);
    }
  };
  const idList: unknown[] = Array.isArray(ids) ? ids : [];
  idList.forEach((value) => {
    const id = String(value || '').trim();
    if (id === CUSTOM_WALLPAPER_ID) {
      addRecordKey(LEGACY_RECORD_KEY);
      return;
    }
    if (!isCustomWallpaperId(id)) {
      return;
    }
    addRecordKey(id);
    if (id === `${CUSTOM_WALLPAPER_ID_PREFIX}legacy`) {
      addRecordKey(LEGACY_RECORD_KEY);
    }
  });
  if (recordKeys.length === 0) {
    return Promise.resolve([]);
  }
  return openDb(ctx).then((db) => {
    return new Promise<WallpaperRecord[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      if (typeof store.get !== 'function') {
        db.close();
        reject(new Error('Wallpaper database does not support targeted reads.'));
        return;
      }
      const records: unknown[] = [];
      let failed = false;
      const fail = (error: unknown): void => {
        if (failed) {
          return;
        }
        failed = true;
        reject(error);
      };
      recordKeys.forEach((key) => {
        const request = store.get(key);
        request.onerror = () => {
          fail(request.error || new Error('Failed to read wallpaper.'));
        };
        request.onsuccess = () => {
          if (request.result) {
            records.push(request.result);
          }
        };
      });
      transaction.oncomplete = () => {
        db.close();
        if (failed) {
          return;
        }
        const normalizedById = new Map<string, WallpaperRecord>();
        sortByUpdate(records).forEach((record) => {
          normalizedById.set(record.id, record);
        });
        resolve(Array.from(normalizedById.values()).sort((a, b) => a.updatedAt - b.updatedAt));
      };
      transaction.onerror = () => {
        db.close();
        fail(transaction.error || new Error('Failed to read wallpapers.'));
      };
    });
  });
}

function write(ctx: WallpaperLocalStoreContext, record: WallpaperRecordInput): Promise<void> {
  return openDb(ctx).then((db) => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(Object.assign({}, record, { key: record.key || record.id }));
      transaction.oncomplete = () => {
        db.close();
        notifyChange(ctx);
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Failed to save wallpaper.'));
      };
    });
  });
}

function remove(ctx: WallpaperLocalStoreContext, record: { key?: string } | null | undefined): Promise<void> {
  return openDb(ctx).then((db) => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(record && record.key ? record.key : '');
      transaction.oncomplete = () => {
        db.close();
        notifyChange(ctx);
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Failed to delete wallpaper.'));
      };
    });
  });
}

// Apply a downloaded library in one IndexedDB transaction. The caller
// validates media before replacing the catalog and publishes its revision.
function replaceAll(ctx: WallpaperLocalStoreContext, records: readonly WallpaperRecordInput[]): Promise<void> {
  return openDb(ctx).then((db) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    records.forEach((record) => store.put(Object.assign({}, record, { key: record.id })));
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error('Failed to restore wallpapers.'));
    };
  }));
}


function createWallpaperLocalStore(options?: WallpaperStoreOptions | null): WallpaperLocalStore {
  const documentObj = getOption(options, 'documentObj', typeof document !== 'undefined' ? document : null);
  const windowObj = getOption(options, 'windowObj', getDefaultWindow());
  const ctx: WallpaperLocalStoreContext = {
    documentObj,
    windowObj,
    options
  };

  return {
    buildRecordFromFile: (file: File | null | undefined) => buildRecordFromFile(ctx, file),
    buildTileThumbnail: (blob: Blob) => buildTileThumbnail(ctx, blob),
    isCustomWallpaperId,
    normalizeRecord: (record: unknown) => normalizeRecord(record),
    readAll: () => readAll(ctx),
    readByIds: (ids: unknown) => readByIds(ctx, ids),
    remove: (record: { key?: string } | null | undefined) => remove(ctx, record),
    replaceAll: (records: readonly WallpaperRecordInput[]) => replaceAll(ctx, records),
    write: (record: WallpaperRecordInput) => write(ctx, record)
  };
}

export { createWallpaperLocalStore };
