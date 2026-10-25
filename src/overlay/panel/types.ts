// Types the overlay's panel modules share. Each module declares the slice of
// the panel state and the dependencies it uses; search-panel.ts passes one
// state object that has them all.

// Looks up a UI string in the panel's language, or the fallback.
type Translate = (key: string, fallback: string) => string;

// Translate with {name} placeholders filled in from values.
type FormatMessage = (key: string, fallback: string, values?: Record<string, string>) => string;

import type { LocalSearchScope } from '../../domain/search/types';
import type { DisplayedSuggestion } from '../../domain/search/suggestion-action-model';
import type { InputModeProvider } from '../../shared/search/input-mode/types';

// A row of the overlay's result list, as the panel modules read it.
interface OverlaySuggestion extends DisplayedSuggestion {
  provider?: InputModeProvider | null;
  commandAliases?: string[];
  // Which help or feedback link a help row opens ('community' for the QR).
  feedbackKey?: string;
}

// A site search or address the typed text runs on Enter without a mode,
// worked out while the results render.
interface InlineSearchState {
  // Chosen for the user rather than picked by them.
  isAuto?: boolean;
  rawInput: string;
  provider?: InputModeProvider | null;
  query?: string;
  url?: string;
}

// A typed trigger that would switch to a site search on Tab.
interface SiteSearchTrigger<Provider> {
  provider: Provider;
  rawInput: string;
}

// A typed trigger that would narrow search to one local source on Tab.
interface LocalSearchScopeTrigger {
  scope: LocalSearchScope;
  rawInput: string;
}

// A change from chrome.storage.onChanged; the values are whatever is stored.
interface StorageChangeRecord {
  newValue?: unknown;
  oldValue?: unknown;
}

type StorageChangeListener = (changes: Record<string, StorageChangeRecord>, areaName: string) => void;

// The panel's storage listeners, removed together when it closes.
interface StorageChangeListeners {
  add(listener: StorageChangeListener): unknown;
  clear(): void;
}

export type {
  FormatMessage,
  InlineSearchState,
  LocalSearchScopeTrigger,
  OverlaySuggestion,
  SiteSearchTrigger,
  StorageChangeListener,
  StorageChangeListeners,
  StorageChangeRecord,
  Translate
};
