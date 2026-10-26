// The custom wallpaper records the library keeps, and the store's shape.

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


// The page a store or an image step works in.
interface WallpaperPage {
  readonly documentObj: Document | null | undefined;
  readonly windowObj: WallpaperWindow | null | undefined;
}

const CUSTOM_WALLPAPER_ID = 'custom-upload';
const CUSTOM_WALLPAPER_ID_PREFIX = 'custom-wallpaper-';

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

function getDefaultWindow(): WallpaperWindow {
  return typeof window !== 'undefined' && window ? window : globalThis;
}

export {
  CUSTOM_WALLPAPER_ID,
  CUSTOM_WALLPAPER_ID_PREFIX,
  getDefaultWindow,
  getOption,
  isRecord
};
export type {
  WallpaperLocalStore,
  WallpaperPage,
  WallpaperRecord,
  WallpaperRecordInput,
  WallpaperStoreOptions,
  WallpaperWindow
};
