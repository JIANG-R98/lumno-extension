// The custom wallpaper library in IndexedDB (uploads, kept as WebP with a
// thumbnail and a small sample copy), and the device-only caches of link
// wallpapers and curated photo tiles.
import { getSamplerSize } from '../domain/wallpaper-sampler-size';

// What the store uses of the page's window; the service worker passes its
// global scope, which has no Image.
interface WallpaperWindow {
  indexedDB?: IDBFactory;
  FileReader?: typeof FileReader;
  Image?: typeof Image;
}

interface WallpaperStoreOptions {
  documentObj?: Document | null;
  windowObj?: WallpaperWindow | null;
  // Called after a write; by default the asset revision tells other pages.
  onChange?: () => void;
}

// A custom wallpaper as the library keeps it.
interface WallpaperRecord {
  id: string;
  key: string;
  name: string;
  imageDataUrl: string;
  thumbnailDataUrl: string;
  // The copy the effects sample; '' for uploads saved before it existed.
  sampleDataUrl: string;
  width: number;
  height: number;
  updatedAt: number;
}

// A wallpaper to store: the key defaults to the id, and a missing sample
// copy is left out.
interface WallpaperRecordInput {
  id: string;
  key?: string;
  name: string;
  imageDataUrl: string;
  thumbnailDataUrl: string;
  sampleDataUrl?: string;
  width: number;
  height: number;
  updatedAt: number;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderedImage {
  dataUrl: string;
  width: number;
  height: number;
  byteSize: number;
  quality: number;
}

interface WallpaperLocalStore {
  buildRecordFromFile(file: File | null | undefined): Promise<WallpaperRecordInput>;
  buildTileThumbnail(blob: Blob): Promise<string>;
  isCustomWallpaperId(id: unknown): boolean;
  normalizeRecord(record: unknown): WallpaperRecord | null;
  readAll(): Promise<WallpaperRecord[]>;
  readByIds(ids: unknown): Promise<WallpaperRecord[]>;
  remove(record: { key?: string } | null | undefined): Promise<void>;
  replaceAll(records: readonly WallpaperRecordInput[]): Promise<void>;
  write(record: WallpaperRecordInput): Promise<void>;
}

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

const CUSTOM_WALLPAPER_ID = 'custom-upload';
const CUSTOM_WALLPAPER_ID_PREFIX = 'custom-wallpaper-';
const DB_NAME = 'lumno-newtab-wallpaper';
const DB_VERSION = 1;
const STORE_NAME = 'wallpapers';
const LEGACY_RECORD_KEY = 'custom';
const OUTPUT_RATIO = 16 / 9;
const MAX_OUTPUT_WIDTH = 2560;
const THUMBNAIL_WIDTH = 480;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_DIMENSION = 8192;
const MAX_SOURCE_PIXELS = 40 * 1000 * 1000;
// Chrome drops a CSS custom property whose value is longer than this, and the page shows a
// wallpaper through var(--x-nt-wallpaper-image), so a stored data URL must stay under it.
const MAX_CSS_URL_LENGTH = 2 * 1024 * 1024;
const WEBP_DATA_URL_PREFIX = 'data:image/webp;base64,';
// Largest WebP whose base64 data URL, wrapped in the CSS url() function, still fits: about 1.5 MB.
const MAX_WALLPAPER_BYTES =
  Math.floor((MAX_CSS_URL_LENGTH - WEBP_DATA_URL_PREFIX.length - 'url("")'.length) / 4) * 3;
const MAX_THUMBNAIL_BYTES = 160 * 1024;
// Panel tiles are about 117×66 CSS pixels; 320 wide stays sharp on 2x screens.
const TILE_THUMBNAIL_WIDTH = 320;
const MAX_TILE_THUMBNAIL_BYTES = 32 * 1024;
const WEBP_QUALITIES = Object.freeze([0.88, 0.82, 0.76, 0.7, 0.64, 0.58]);
const ACCEPTED_SOURCE_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp'
]);
const LEGACY_GENERIC_NAMES = [
  'Custom wallpaper',
  '\u81ea\u5b9a\u4e49\u58c1\u7eb8'
];

// An option given, even as undefined, wins over the fallback.
function getOption<T, K extends keyof T>(options: T | null | undefined, key: K, fallback: T[K]): T[K] {
  if (options && Object.prototype.hasOwnProperty.call(options, key)) {
    return options[key];
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

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

function getDefaultWindow(): WallpaperWindow {
  return typeof window !== 'undefined' && window ? window : globalThis;
}

function createWallpaperLocalStore(options?: WallpaperStoreOptions | null): WallpaperLocalStore {
  const documentObj = getOption(options, 'documentObj', typeof document !== 'undefined' ? document : null);
  const windowObj = getOption(options, 'windowObj', getDefaultWindow());
  function notifyChange(): void {
    if (options && typeof options.onChange === 'function') {
      options.onChange();
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      void chrome.storage.local.set({
        _x_extension_asset_revision_2026_unique_: `${Date.now()}-${Math.random()}`
      });
    }
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
    const rawId = String(record.id || record.key || '').trim();
    const isLegacyRecord = rawId === CUSTOM_WALLPAPER_ID ||
      String(record.key || '') === LEGACY_RECORD_KEY;
    const id = isCustomWallpaperId(rawId)
      ? rawId
      : `${CUSTOM_WALLPAPER_ID_PREFIX}${isLegacyRecord ? 'legacy' : Date.now()}`;
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

  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!windowObj || !windowObj.indexedDB) {
        reject(new Error('IndexedDB is not available.'));
        return;
      }
      const request = windowObj.indexedDB.open(DB_NAME, DB_VERSION);
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
      .map(normalizeRecord)
      .filter((record): record is WallpaperRecord => record !== null)
      .sort((a, b) => a.updatedAt - b.updatedAt);
  }

  function readAll(): Promise<WallpaperRecord[]> {
    return openDb().then((db) => {
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

  function readByIds(ids: unknown): Promise<WallpaperRecord[]> {
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
    return openDb().then((db) => {
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

  function write(record: WallpaperRecordInput): Promise<void> {
    return openDb().then((db) => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(Object.assign({}, record, { key: record.key || record.id }));
        transaction.oncomplete = () => {
          db.close();
          notifyChange();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error('Failed to save wallpaper.'));
        };
      });
    });
  }

  function remove(record: { key?: string } | null | undefined): Promise<void> {
    return openDb().then((db) => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(record && record.key ? record.key : '');
        transaction.oncomplete = () => {
          db.close();
          notifyChange();
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
  function replaceAll(records: readonly WallpaperRecordInput[]): Promise<void> {
    return openDb().then((db) => new Promise<void>((resolve, reject) => {
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

  function readFileAsDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const Reader = windowObj && windowObj.FileReader ? windowObj.FileReader : globalThis.FileReader;
      if (typeof Reader !== 'function') {
        reject(new Error('FileReader is not available.'));
        return;
      }
      const reader = new Reader();
      reader.onerror = () => {
        reject(reader.error || new Error('Failed to read image.'));
      };
      reader.onload = () => {
        resolve(String(reader.result || ''));
      };
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const ImageConstructor = windowObj && windowObj.Image ? windowObj.Image : globalThis.Image;
      if (typeof ImageConstructor !== 'function') {
        reject(new Error('Image decoder is not available.'));
        return;
      }
      const image = new ImageConstructor();
      image.onload = () => {
        resolve(image);
      };
      image.onerror = () => {
        reject(new Error('Failed to load image.'));
      };
      image.src = dataUrl;
    });
  }

  function getCenteredCrop(width: number, height: number): CropRect {
    const sourceWidth = Math.max(1, Number(width) || 1);
    const sourceHeight = Math.max(1, Number(height) || 1);
    const sourceRatio = sourceWidth / sourceHeight;
    if (sourceRatio > OUTPUT_RATIO) {
      const cropWidth = Math.round(sourceHeight * OUTPUT_RATIO);
      return {
        x: Math.round((sourceWidth - cropWidth) / 2),
        y: 0,
        width: cropWidth,
        height: sourceHeight
      };
    }
    const cropHeight = Math.round(sourceWidth / OUTPUT_RATIO);
    return {
      x: 0,
      y: Math.round((sourceHeight - cropHeight) / 2),
      width: sourceWidth,
      height: cropHeight
    };
  }

  function getDataUrlByteLength(dataUrl: string): number {
    const match = /^data:[^;,]+;base64,([a-zA-Z0-9+/]*={0,2})$/.exec(String(dataUrl || ''));
    if (!match) {
      return 0;
    }
    const encoded = match[1];
    const padding = encoded.endsWith('==') ? 2 : (encoded.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
  }

  function createCanvas(): HTMLCanvasElement {
    if (!documentObj) {
      throw new Error('Canvas is not available.');
    }
    return documentObj.createElement('canvas');
  }

  function renderCroppedDataUrl(image: HTMLImageElement, crop: CropRect, targetWidth: number, maxBytes: number): RenderedImage {
    const canvas = createCanvas();
    const initialWidth = Math.max(1, Math.round(targetWidth));
    const minimumWidth = Math.min(initialWidth, initialWidth > THUMBNAIL_WIDTH ? 1280 : 320);
    const widths: number[] = [];
    let width = initialWidth;
    while (width >= minimumWidth) {
      if (!widths.includes(width)) widths.push(width);
      if (width === minimumWidth) break;
      width = Math.max(minimumWidth, Math.floor(width * 0.82));
    }

    for (const candidateWidth of widths) {
      const height = Math.max(1, Math.round(candidateWidth / OUTPUT_RATIO));
      canvas.width = candidateWidth;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas is not available.');
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        candidateWidth,
        height
      );
      for (const quality of WEBP_QUALITIES) {
        const dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl || !dataUrl.startsWith(WEBP_DATA_URL_PREFIX)) {
          throw new Error('WebP encoding is not available.');
        }
        const byteSize = getDataUrlByteLength(dataUrl);
        if (byteSize > 0 && byteSize <= maxBytes) {
          return { dataUrl, width: candidateWidth, height, byteSize, quality };
        }
      }
    }
    throw new Error('Compressed wallpaper exceeds the upload limit.');
  }

  // The small copy the effects sample (getWallpaperSample in wallpaper-sources.ts): the stored
  // wallpaper decoded and drawn at the sampler's size the way the sampler draws it, then saved
  // losslessly, so sampling it reads the pixels sampling the full wallpaper would. Lossy WebP keeps
  // colour at half resolution and loses the fine colour specks of painted or dotted images. '' when
  // the wallpaper is no larger than the sampler or the browser cannot make the copy.
  function renderSampleDataUrl(dataUrl: string, width: number, height: number): Promise<string> {
    const size = getSamplerSize(width, height);
    if (size.width >= width && size.height >= height) {
      return Promise.resolve('');
    }
    return loadImageFromDataUrl(dataUrl).then((image) => {
      const canvas = createCanvas();
      canvas.width = size.width;
      canvas.height = size.height;
      // Read-optimised like the sampler's canvas, so Chrome filters the downscale the same way.
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return '';
      }
      context.drawImage(image, 0, 0, size.width, size.height);
      const sampleDataUrl = canvas.toDataURL('image/webp', 1);
      return sampleDataUrl.startsWith(WEBP_DATA_URL_PREFIX) ? sampleDataUrl : '';
    }).catch(() => '');
  }

  function buildRecordFromFile(file: File | null | undefined): Promise<WallpaperRecordInput> {
    if (!file || !ACCEPTED_SOURCE_MIME_TYPES.includes(String(file.type || '').toLowerCase())) {
      return Promise.reject(new Error('Invalid image file.'));
    }
    const sourceBytes = Number(file.size);
    if (!Number.isFinite(sourceBytes) || sourceBytes <= 0 || sourceBytes > MAX_SOURCE_BYTES) {
      return Promise.reject(new Error('Wallpaper source file is too large.'));
    }
    return readFileAsDataUrl(file).then((dataUrl) => {
      return loadImageFromDataUrl(dataUrl);
    }).then((image) => {
      const sourceWidth = Math.max(1, Number(image.naturalWidth || image.width) || 1);
      const sourceHeight = Math.max(1, Number(image.naturalHeight || image.height) || 1);
      if (sourceWidth > MAX_SOURCE_DIMENSION || sourceHeight > MAX_SOURCE_DIMENSION ||
          sourceWidth * sourceHeight > MAX_SOURCE_PIXELS) {
        throw new Error('Wallpaper source dimensions are too large.');
      }
      const crop = getCenteredCrop(sourceWidth, sourceHeight);
      const outputWidth = Math.min(MAX_OUTPUT_WIDTH, Math.max(1, crop.width));
      const wallpaper = renderCroppedDataUrl(image, crop, outputWidth, MAX_WALLPAPER_BYTES);
      const thumbnail = renderCroppedDataUrl(image, crop, THUMBNAIL_WIDTH, MAX_THUMBNAIL_BYTES);
      return renderSampleDataUrl(wallpaper.dataUrl, wallpaper.width, wallpaper.height).then((sampleDataUrl): WallpaperRecordInput => ({
        id: `${CUSTOM_WALLPAPER_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name
          ? String(file.name).replace(/\.[^.]+$/, '')
          : '',
        imageDataUrl: wallpaper.dataUrl,
        thumbnailDataUrl: thumbnail.dataUrl,
        sampleDataUrl,
        width: wallpaper.width,
        height: wallpaper.height,
        updatedAt: Date.now()
      }));
    });
  }

  // A small WebP of a panel tile's photo, cropped to the tile's 16:9 like the wallpaper itself.
  function buildTileThumbnail(blob: Blob): Promise<string> {
    return readFileAsDataUrl(blob).then(loadImageFromDataUrl).then((image) => {
      const crop = getCenteredCrop(image.naturalWidth || image.width, image.naturalHeight || image.height);
      return renderCroppedDataUrl(image, crop, Math.min(TILE_THUMBNAIL_WIDTH, crop.width),
        MAX_TILE_THUMBNAIL_BYTES).dataUrl;
    });
  }

  return {
    buildRecordFromFile,
    buildTileThumbnail,
    isCustomWallpaperId,
    normalizeRecord,
    readAll,
    readByIds,
    remove,
    replaceAll,
    write
  };
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

export type {
  WallpaperImageCache,
  WallpaperLocalStore,
  WallpaperRecord,
  WallpaperRecordInput,
  WallpaperStoreOptions,
  WallpaperThumbnailCache,
  WallpaperWindow
};
export {
  CUSTOM_WALLPAPER_ID,
  CUSTOM_WALLPAPER_ID_PREFIX,
  MAX_SOURCE_BYTES,
  MAX_CSS_URL_LENGTH,
  MAX_SOURCE_DIMENSION,
  MAX_SOURCE_PIXELS,
  MAX_WALLPAPER_BYTES,
  MAX_THUMBNAIL_BYTES,
  ACCEPTED_SOURCE_MIME_TYPES,
  createWallpaperImageCache,
  createWallpaperLocalStore,
  createWallpaperThumbnailCache
};
