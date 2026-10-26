// The device-only caches of link wallpapers and curated photo tiles, in
// IndexedDB.
import { getDefaultWindow, getOption, isRecord } from './wallpaper-records';
import type { WallpaperWindow } from './wallpaper-records';

// The caches hold whatever the pages stored; readers check each record.
interface WallpaperImageCache {
  readByIds(ids: unknown): Promise<unknown[]>;
  write(record: { id: string }): Promise<void>;
  remove(id: IDBValidKey): Promise<void>;
  keys(): Promise<IDBValidKey[]>;
}

interface WallpaperThumbnailCache {
  readByIds(ids: unknown): Promise<unknown[]>;
  write(record: { id: string; url: string; dataUrl: string }): Promise<void>;
}

interface CacheOptions {
  windowObj?: WallpaperWindow | null;
}

interface ThumbnailCacheOptions extends CacheOptions {
  limit?: number;
  now?: () => number;
}

// A task's result, read once its transaction completes.
interface TaskResult<T> {
  value?: T;
}


// Downscaled copies of link wallpapers and online photos (Bing, curated photos and museum prints)
// live in their own database: only their IDs and links sync. The cache stays device-local, and
// WebDAV, which uploads the custom wallpaper library, never reads or writes it, because:
// - each device rebuilds a copy from the synced ID and encodes it to different bytes, so uploads
//   would add one asset per device, and daily photos would pile up on the server;
// - applying a WebDAV snapshot replaces the library database wholesale, which must not drop copies;
// - the page prunes copies no mode shows, which must not delete synced media.
// A sync that ever ships these images should seed this cache through write(), keyed by photo ID
// with its source URL, rather than adding them to the library.
const IMAGE_CACHE_DB_NAME = 'lumno-newtab-wallpaper-cache';
const IMAGE_CACHE_STORE_NAME = 'images';

function createWallpaperImageCache(options?: CacheOptions | null): WallpaperImageCache {
  const windowObj = getOption(options, 'windowObj', getDefaultWindow());
  function run<T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => TaskResult<T>): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!windowObj || !windowObj.indexedDB) {
        reject(new Error('IndexedDB is not available.'));
        return;
      }
      const request = windowObj.indexedDB.open(IMAGE_CACHE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(IMAGE_CACHE_STORE_NAME)) {
          request.result.createObjectStore(IMAGE_CACHE_STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error || new Error('Failed to open wallpaper image cache.'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(IMAGE_CACHE_STORE_NAME, mode);
        const result = task(transaction.objectStore(IMAGE_CACHE_STORE_NAME));
        transaction.oncomplete = () => { db.close(); resolve(result.value); };
        transaction.onerror = transaction.onabort = () => {
          db.close();
          reject(transaction.error || new Error('Failed to use wallpaper image cache.'));
        };
      };
    });
  }
  return {
    readByIds(ids) {
      const idList: unknown[] = Array.isArray(ids) ? ids : [];
      const keys = idList.filter((key): key is string | number => (typeof key === 'string' || typeof key === 'number') && Boolean(key));
      if (!keys.length) return Promise.resolve([]);
      return run('readonly', (store) => {
        const records: unknown[] = [];
        keys.forEach((key) => {
          const request = store.get(key);
          request.onsuccess = () => { if (request.result) records.push(request.result); };
        });
        return { value: records };
      }).then((records) => records || []);
    },
    write(record) {
      return run<void>('readwrite', (store) => { store.put(record); return {}; });
    },
    remove(id) {
      return run<void>('readwrite', (store) => { store.delete(id); return {}; });
    },
    keys() {
      return run('readonly', (store) => {
        const result: TaskResult<IDBValidKey[]> = { value: [] };
        const request = store.getAllKeys();
        request.onsuccess = () => { result.value = request.result || []; };
        return result;
      }).then((keys) => keys || []);
    }
  };
}

// Tiles of the curated photos the panel has shown, so reopening it paints them without asking
// Picsum again (each tile there costs a redirect that the HTTP cache keeps for only a day). Like
// the image cache it stays on this device: sync and WebDAV never read it. It keeps the tiles seen
// most recently and drops the rest.
const THUMBNAIL_CACHE_DB_NAME = 'lumno-newtab-wallpaper-thumbs';
const THUMBNAIL_CACHE_STORE_NAME = 'thumbs';
const THUMBNAIL_CACHE_LIMIT = 60;
// A tile shown again moves to the front at most this often, so reopening the panel rarely writes.
const THUMBNAIL_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

function createWallpaperThumbnailCache(options?: ThumbnailCacheOptions | null): WallpaperThumbnailCache {
  const windowObj = getOption(options, 'windowObj', getDefaultWindow());
  const limit = getOption(options, 'limit', THUMBNAIL_CACHE_LIMIT) ?? THUMBNAIL_CACHE_LIMIT;
  const now = getOption(options, 'now', Date.now) || Date.now;
  function run<T>(task: (store: IDBObjectStore) => TaskResult<T>): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!windowObj || !windowObj.indexedDB) {
        reject(new Error('IndexedDB is not available.'));
        return;
      }
      const request = windowObj.indexedDB.open(THUMBNAIL_CACHE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(THUMBNAIL_CACHE_STORE_NAME)) {
          request.result.createObjectStore(THUMBNAIL_CACHE_STORE_NAME, { keyPath: 'id' })
            .createIndex('usedAt', 'usedAt');
        }
      };
      request.onerror = () => reject(request.error || new Error('Failed to open wallpaper thumbnail cache.'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(THUMBNAIL_CACHE_STORE_NAME, 'readwrite');
        const result = task(transaction.objectStore(THUMBNAIL_CACHE_STORE_NAME));
        transaction.oncomplete = () => { db.close(); resolve(result.value); };
        transaction.onerror = transaction.onabort = () => {
          db.close();
          reject(transaction.error || new Error('Failed to use wallpaper thumbnail cache.'));
        };
      };
    });
  }
  return {
    // Records are { id, url, dataUrl, usedAt }.
    readByIds(ids) {
      const idList: unknown[] = Array.isArray(ids) ? ids : [];
      const keys = idList.filter((key): key is string | number => (typeof key === 'string' || typeof key === 'number') && Boolean(key));
      if (!keys.length) return Promise.resolve([]);
      return run((store) => {
        const records: unknown[] = [];
        const time = now();
        keys.forEach((key) => {
          const request = store.get(key);
          request.onsuccess = () => {
            const record: unknown = request.result;
            if (!isRecord(record)) return;
            records.push(record);
            if (!(time - Number(record.usedAt) < THUMBNAIL_TOUCH_INTERVAL_MS)) store.put({ ...record, usedAt: time });
          };
        });
        return { value: records };
      }).then((records) => records || []);
    },
    write(record) {
      return run<void>((store) => {
        store.put({ ...record, usedAt: now() });
        const count = store.count();
        count.onsuccess = () => {
          let extra = count.result - limit;
          if (extra <= 0) return;
          const cursor = store.index('usedAt').openCursor();
          cursor.onsuccess = () => {
            if (!cursor.result || extra <= 0) return;
            cursor.result.delete();
            extra -= 1;
            cursor.result.continue();
          };
        };
        return {};
      });
    }
  };
}

export {
  createWallpaperImageCache,
  createWallpaperThumbnailCache
};
export type {
  WallpaperImageCache,
  WallpaperThumbnailCache
};
