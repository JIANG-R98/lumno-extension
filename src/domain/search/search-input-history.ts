import type { StorageAreaLike, StorageChangeEventLike, StorageChanges, StorageItems } from '../storage-port';
import { searchInputHistory } from '../settings/search';

type HistoryDirection = 'previous' | 'next' | '';

interface HistoryMove {
  handled: boolean;
  value: string;
}

interface SearchInputHistoryOptions {
  storageArea?: StorageAreaLike | null;
  storageChanges?: StorageChangeEventLike | null;
  storageAreaName?: string;
  storageKey?: string;
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 50;
const MAX_ENTRY_LENGTH = 4096;

function normalizeEntry(value: unknown): string {
  return String(value || '').trim().slice(0, MAX_ENTRY_LENGTH);
}

function normalizeEntries(value: unknown, maxEntries?: number): string[] {
  const limit = Number.isFinite(Number(maxEntries))
    ? Math.max(1, Math.round(Number(maxEntries)))
    : DEFAULT_MAX_ENTRIES;
  const unique: string[] = [];
  (Array.isArray(value) ? value : []).forEach((item: unknown) => {
    const entry = normalizeEntry(item);
    if (!entry) {
      return;
    }
    const existingIndex = unique.indexOf(entry);
    if (existingIndex >= 0) {
      unique.splice(existingIndex, 1);
    }
    unique.push(entry);
  });
  return unique.slice(-limit);
}

function getShortcutDirection(
  event: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; code?: string; key?: string } | null | undefined
): HistoryDirection {
  if (!event ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey) {
    return '';
  }
  const code = String(event.code || '');
  const key = String(event.key || '');
  if (code === 'ArrowUp' || key === 'ArrowUp') {
    return 'previous';
  }
  if (code === 'ArrowDown' || key === 'ArrowDown') {
    return 'next';
  }
  return '';
}

function createSearchInputHistoryController(options?: SearchInputHistoryOptions) {
  const config: SearchInputHistoryOptions = options && typeof options === 'object' ? options : {};
  const storageArea = config.storageArea || null;
  const storageChanges = config.storageChanges || null;
  const storageAreaName = config.storageAreaName || 'local';
  const storageKey = config.storageKey || searchInputHistory.key;
  const maxEntries = Number.isFinite(Number(config.maxEntries))
    ? Math.max(1, Math.round(Number(config.maxEntries)))
    : DEFAULT_MAX_ENTRIES;
  let entries: string[] = [];
  let cursor = 0;
  let draft = '';
  let hydrated = false;
  let destroyed = false;
  let loadPromise: Promise<string[]> | null = null;
  let pendingRecords: string[] = [];
  let storageChangeListener: ((changes: StorageChanges, areaName: string) => void) | null = null;

  function resetNavigation() {
    cursor = entries.length;
    draft = '';
  }

  function replaceEntries(value: unknown): string[] {
    entries = normalizeEntries(value, maxEntries);
    resetNavigation();
    return entries.slice();
  }

  function applyRecord(value: unknown): string {
    const entry = normalizeEntry(value);
    if (!entry) {
      return '';
    }
    const next = entries.filter((item) => item !== entry);
    next.push(entry);
    entries = next.slice(-maxEntries);
    resetNavigation();
    return entry;
  }

  function persist() {
    if (!storageArea || typeof storageArea.set !== 'function' || destroyed) {
      return;
    }
    try {
      storageArea.set({ [storageKey]: entries.slice() });
    } catch (_error) {
      // Input history is best-effort and must never block search.
    }
  }

  function readStorage(): Promise<StorageItems> {
    return new Promise((resolve) => {
      if (!storageArea || typeof storageArea.get !== 'function') {
        resolve({});
        return;
      }
      let settled = false;
      const finish = (result?: StorageItems) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result || {});
      };
      try {
        const maybePromise = storageArea.get([storageKey], finish);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish).catch(() => finish({}));
        }
      } catch (_error) {
        finish({});
      }
    });
  }

  function load(): Promise<string[]> {
    if (loadPromise) {
      return loadPromise;
    }
    loadPromise = readStorage().then((result) => {
      if (destroyed) {
        return entries.slice();
      }
      const queued = pendingRecords.slice();
      pendingRecords = [];
      replaceEntries(result ? result[storageKey] : []);
      queued.forEach(applyRecord);
      hydrated = true;
      if (queued.length > 0) {
        persist();
      }
      return entries.slice();
    });
    return loadPromise;
  }

  function record(value: unknown): boolean {
    const entry = normalizeEntry(value);
    if (!entry) {
      return false;
    }
    if (!hydrated) {
      pendingRecords.push(entry);
    }
    applyRecord(entry);
    if (hydrated) {
      persist();
    } else {
      load();
    }
    return true;
  }

  function move(direction: HistoryDirection, currentValue: unknown): HistoryMove {
    if (entries.length === 0) {
      return { handled: false, value: String(currentValue || '') };
    }
    if (direction === 'previous') {
      if (cursor >= entries.length) {
        cursor = entries.length;
        draft = String(currentValue || '');
      }
      cursor = Math.max(0, cursor - 1);
      return { handled: true, value: entries[cursor] };
    }
    if (direction === 'next') {
      if (cursor >= entries.length) {
        return { handled: false, value: String(currentValue || '') };
      }
      if (cursor < entries.length - 1) {
        cursor += 1;
        return { handled: true, value: entries[cursor] };
      }
      cursor = entries.length;
      return { handled: true, value: draft };
    }
    return { handled: false, value: String(currentValue || '') };
  }

  function handleStorageChange(changes: StorageChanges, areaName: string) {
    if (destroyed ||
        areaName !== storageAreaName ||
        !changes ||
        !Object.prototype.hasOwnProperty.call(changes, storageKey)) {
      return;
    }
    const change = changes[storageKey];
    replaceEntries(change ? change.newValue : []);
    hydrated = true;
  }

  if (storageChanges &&
      typeof storageChanges.addListener === 'function' &&
      typeof storageChanges.removeListener === 'function') {
    storageChangeListener = handleStorageChange;
    storageChanges.addListener(storageChangeListener);
  }

  load();

  return Object.freeze({
    destroy() {
      destroyed = true;
      if (storageChangeListener && storageChanges) {
        storageChanges.removeListener(storageChangeListener);
        storageChangeListener = null;
      }
    },
    getEntries() {
      return entries.slice();
    },
    load,
    move,
    record,
    resetNavigation
  });
}

export {
  DEFAULT_MAX_ENTRIES,
  createSearchInputHistoryController,
  getShortcutDirection,
  normalizeEntries
};
export type { HistoryDirection, HistoryMove, SearchInputHistoryOptions };
