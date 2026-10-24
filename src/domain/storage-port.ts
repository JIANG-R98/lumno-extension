// The storage the domain modules are handed: chrome.storage.local or .sync,
// or a test double with the same shape. Both callback and promise styles of
// the extension API are accepted.

type StorageItems = Record<string, unknown>;

type StorageKeys = string | string[] | StorageItems | null;

interface StorageAreaLike {
  get(keys: StorageKeys, callback?: (items: StorageItems) => void): Promise<StorageItems> | void;
  set(items: StorageItems, callback?: () => void): Promise<void> | void;
  remove?(keys: string | string[], callback?: () => void): Promise<void> | void;
  clear?(callback?: () => void): Promise<void> | void;
}

type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;

type StorageChangeListener = (changes: StorageChanges, areaName: string) => void;

// chrome.storage.onChanged.
interface StorageChangeEventLike {
  addListener(listener: StorageChangeListener): void;
  removeListener(listener: StorageChangeListener): void;
}

export type {
  StorageAreaLike,
  StorageChangeEventLike,
  StorageChangeListener,
  StorageChanges,
  StorageItems,
  StorageKeys
};
