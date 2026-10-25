// Types the overlay's panel modules share. Each module declares the slice of
// the panel state and the dependencies it uses; search-panel.ts passes one
// state object that has them all.

// Looks up a UI string in the panel's language, or the fallback.
type Translate = (key: string, fallback: string) => string;

// Translate with {name} placeholders filled in from values.
type FormatMessage = (key: string, fallback: string, values?: Record<string, string>) => string;

// A change from chrome.storage.onChanged; the values are whatever is stored.
interface StorageChangeRecord {
  newValue?: unknown;
  oldValue?: unknown;
}

type StorageChangeListener = (changes: Record<string, StorageChangeRecord>, areaName: string) => void;

// The panel's storage listeners, removed together when it closes.
interface StorageChangeListeners {
  add(listener: StorageChangeListener): unknown;
}

export type { FormatMessage, StorageChangeListener, StorageChangeListeners, StorageChangeRecord, Translate };
