// Icons chosen for websites inside shortcut folders. Bookmarks have no icon
// of their own, so these stay on this device, keyed by local bookmark id,
// and only show where the folder is opened from a shortcut.
import type { StorageAreaLike } from '../../domain/storage-port';
import { shortcutFolderItemIcons } from '../../domain/settings/newtab-shortcuts';

type FolderItemImageSource = 'service' | 'favicon-is' | 'cache' | 'custom';
type FolderItemShortcutSource = 'service' | 'favicon-is' | 'cache' | 'builtin';

interface FolderItemShortcutSettings {
  iconSource?: FolderItemShortcutSource;
  iconPlate?: 'on' | 'off';
  iconPlateColor?: string;
}

// A website's icon in a shortcut folder ('builtin' has no image of its
// own), and what it had as a shortcut; either part may be missing.
interface FolderItemIcon {
  iconSource?: FolderItemImageSource | 'builtin';
  dataUrl?: string;
  shortcut?: FolderItemShortcutSettings;
}

// The icons by local bookmark id.
type FolderItemIconMap = Record<string, FolderItemIcon>;

interface FolderItemIconStoreOptions {
  storageArea?: StorageAreaLike | null;
  storageKey?: string;
  chrome?: { runtime?: { lastError?: { message?: string } | null } };
}

const MAX_DATA_URL_LENGTH = 192 * 1024;
const DATA_URL_PATTERN = /^data:image\/(?:png|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon|jpeg|jpg|gif);base64,[a-z0-9+/=]+$/i;
const PLATE_COLOR_PATTERN = /^#[\dA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isImageSource(value: unknown): value is FolderItemImageSource {
  return value === 'service' || value === 'favicon-is' || value === 'cache' || value === 'custom';
}

function isShortcutSource(value: unknown): value is FolderItemShortcutSource {
  return value === 'service' || value === 'favicon-is' || value === 'cache' || value === 'builtin';
}

function isPlateMode(value: unknown): value is 'on' | 'off' {
  return value === 'on' || value === 'off';
}

// 'builtin' is resolved from the bookmark's URL when shown; every other
// source keeps the image it produced. The automatic default has no icon.
function normalizeIcon(value: unknown): Pick<FolderItemIcon, 'iconSource' | 'dataUrl'> | null {
  const iconSource = isRecord(value) ? value.iconSource : '';
  if (iconSource === 'builtin') {
    return { iconSource };
  }
  const dataUrl = String(isRecord(value) && value.dataUrl || '').trim();
  if (!isImageSource(iconSource) || dataUrl.length > MAX_DATA_URL_LENGTH || !DATA_URL_PATTERN.test(dataUrl)) {
    return null;
  }
  return { iconSource, dataUrl };
}

// What the site had as a shortcut that the folder's icon does not hold: its
// plate, and an online source whose image was not saved. The menu ignores
// it; the site gets it back when it is dragged out to the shortcuts again.
function normalizeShortcutSettings(value: unknown): FolderItemShortcutSettings | null {
  if (!isRecord(value)) return null;
  const iconSource = isShortcutSource(value.iconSource) ? value.iconSource : '';
  const iconPlate = isPlateMode(value.iconPlate) ? value.iconPlate : '';
  const color = typeof value.iconPlateColor === 'string' ? value.iconPlateColor.trim().toUpperCase() : '';
  const settings: FolderItemShortcutSettings = {
    ...(iconSource ? { iconSource } : {}),
    ...(iconPlate ? { iconPlate } : {}),
    ...(iconPlate !== 'off' && PLATE_COLOR_PATTERN.test(color) ? { iconPlateColor: color } : {})
  };
  return Object.keys(settings).length ? settings : null;
}

function normalizeEntry(value: unknown): FolderItemIcon | null {
  const icon = normalizeIcon(value);
  const shortcut = normalizeShortcutSettings(isRecord(value) ? value.shortcut : null);
  if (!icon && !shortcut) {
    return null;
  }
  return { ...(icon || {}), ...(shortcut ? { shortcut } : {}) };
}

function normalizeMap(value: unknown): FolderItemIconMap {
  const source = isRecord(value) && !Array.isArray(value) ? value : {};
  const normalized: FolderItemIconMap = {};
  Object.keys(source).forEach((rawId) => {
    const id = String(rawId || '').trim();
    const entry = id && id.length <= 128 ? normalizeEntry(source[rawId]) : null;
    if (entry) normalized[id] = entry;
  });
  return normalized;
}

function createStore(options?: FolderItemIconStoreOptions) {
  const opts = options || {};
  const storageArea = opts.storageArea || null;
  const storageKey = String(opts.storageKey || shortcutFolderItemIcons.key);
  const getLastError = () => {
    const chromeApi = opts.chrome || globalThis.chrome;
    return chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
  };
  let icons: FolderItemIconMap = {};
  let chain: Promise<unknown> = Promise.resolve();

  const ready = new Promise<void>((resolve) => {
    if (!storageArea || typeof storageArea.get !== 'function') {
      resolve();
      return;
    }
    storageArea.get([storageKey], (result) => {
      icons = getLastError() ? {} : normalizeMap(result && result[storageKey]);
      resolve();
    });
  });

  function write(next: FolderItemIconMap): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!storageArea || typeof storageArea.set !== 'function') {
        reject(new Error('Folder item icon storage is unavailable.'));
        return;
      }
      storageArea.set({ [storageKey]: next }, () => {
        const error = getLastError();
        if (error) reject(new Error(error.message)); else resolve();
      });
    });
  }

  function get(bookmarkId: unknown): FolderItemIcon | null {
    const id = String(bookmarkId || '');
    return id && icons[id] ? { ...icons[id] } : null;
  }

  // Applies { [bookmarkId]: entry | null } and drops icons whose bookmark
  // no longer exists (`exists` is optional).
  function update(
    changes: Readonly<Record<string, FolderItemIcon | null>> | null | undefined,
    exists?: (bookmarkId: string) => boolean
  ): Promise<FolderItemIconMap> {
    const updates = changes || {};
    const operation = chain.catch(() => {}).then(() => ready).then(() => {
      const next: FolderItemIconMap = { ...icons };
      Object.keys(updates).forEach((rawId) => {
        const id = String(rawId || '').trim();
        const entry = normalizeEntry(updates[rawId]);
        if (!id) return;
        if (entry) next[id] = entry; else delete next[id];
      });
      if (typeof exists === 'function') {
        Object.keys(next).forEach((id) => { if (!exists(id)) delete next[id]; });
      }
      const normalized = normalizeMap(next);
      if (JSON.stringify(normalized) === JSON.stringify(icons)) return icons;
      return write(normalized).then(() => {
        icons = normalized;
        return icons;
      });
    });
    chain = operation;
    return operation;
  }

  return { ready, get, update };
}

type FolderItemIconStore = ReturnType<typeof createStore>;

export { normalizeEntry, normalizeMap, createStore };
export type { FolderItemIcon, FolderItemIconMap, FolderItemIconStore, FolderItemShortcutSettings };
