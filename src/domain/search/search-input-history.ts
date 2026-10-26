import type { StoredValuePort } from '../storage-port';

type HistoryDirection = 'previous' | 'next' | '';

interface HistoryMove {
  handled: boolean;
  value: string;
}

interface SearchInputHistoryOptions {
  // Where the history is kept (the searchInputHistory setting).
  storage?: StoredValuePort | null;
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

// Moving through the entries with Alt+Up and Alt+Down: the position, and
// what was typed before the first step back.
class HistoryNavigation {
  entries: string[] = [];
  private cursor = 0;
  private draft = '';
  private readonly maxEntries: number;

  constructor(maxEntries: number) {
    this.maxEntries = maxEntries;
  }

  reset(): void {
    this.cursor = this.entries.length;
    this.draft = '';
  }

  replace(value: unknown): void {
    this.entries = normalizeEntries(value, this.maxEntries);
    this.reset();
  }

  // Adds the entry as the newest; returns it, or '' for nothing to add.
  add(value: unknown): string {
    const entry = normalizeEntry(value);
    if (!entry) {
      return '';
    }
    const next = this.entries.filter((item) => item !== entry);
    next.push(entry);
    this.entries = next.slice(-this.maxEntries);
    this.reset();
    return entry;
  }

  move(direction: HistoryDirection, currentValue: unknown): HistoryMove {
    const current = String(currentValue || '');
    if (this.entries.length === 0 || !direction) {
      return { handled: false, value: current };
    }
    return direction === 'previous' ? this.back(current) : this.forward(current);
  }

  private back(current: string): HistoryMove {
    if (this.cursor >= this.entries.length) {
      this.cursor = this.entries.length;
      this.draft = current;
    }
    this.cursor = Math.max(0, this.cursor - 1);
    return { handled: true, value: this.entries[this.cursor] };
  }

  private forward(current: string): HistoryMove {
    if (this.cursor >= this.entries.length) {
      return { handled: false, value: current };
    }
    if (this.cursor < this.entries.length - 1) {
      this.cursor += 1;
      return { handled: true, value: this.entries[this.cursor] };
    }
    this.cursor = this.entries.length;
    return { handled: true, value: this.draft };
  }
}

// The history of searches typed into a search box, kept in storage. Entries
// recorded before storage is read join what it holds once it is.
class SearchInputHistory {
  private readonly navigation: HistoryNavigation;
  private readonly storage: StoredValuePort | null;
  private hydrated = false;
  private destroyed = false;
  private loadPromise: Promise<string[]> | null = null;
  private pendingRecords: string[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(storage: StoredValuePort | null, maxEntries: number) {
    this.navigation = new HistoryNavigation(maxEntries);
    this.storage = storage;
    if (storage) {
      this.unsubscribe = storage.subscribe((value) => {
        if (this.destroyed) {
          return;
        }
        this.navigation.replace(value);
        this.hydrated = true;
      });
    }
    void this.load();
  }

  getEntries(): string[] {
    return this.navigation.entries.slice();
  }

  load(): Promise<string[]> {
    if (!this.loadPromise) {
      const read = this.storage ? this.storage.read().catch(() => []) : Promise.resolve([]);
      this.loadPromise = read.then((result) => this.hydrate(result));
    }
    return this.loadPromise;
  }

  record(value: unknown): boolean {
    const entry = normalizeEntry(value);
    if (!entry) {
      return false;
    }
    if (!this.hydrated) {
      this.pendingRecords.push(entry);
    }
    this.navigation.add(entry);
    if (this.hydrated) {
      this.persist();
    } else {
      void this.load();
    }
    return true;
  }

  move(direction: HistoryDirection, currentValue: unknown): HistoryMove {
    return this.navigation.move(direction, currentValue);
  }

  resetNavigation(): void {
    this.navigation.reset();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private hydrate(result: unknown): string[] {
    if (this.destroyed) {
      return this.getEntries();
    }
    const queued = this.pendingRecords.slice();
    this.pendingRecords = [];
    this.navigation.replace(result);
    queued.forEach((value) => this.navigation.add(value));
    this.hydrated = true;
    if (queued.length > 0) {
      this.persist();
    }
    return this.getEntries();
  }

  private persist(): void {
    if (!this.storage || this.destroyed) {
      return;
    }
    // Input history is best-effort and must never block search.
    this.storage.write(this.getEntries()).catch(() => {});
  }
}

function createSearchInputHistoryController(options?: SearchInputHistoryOptions): SearchInputHistory {
  const config: SearchInputHistoryOptions = options && typeof options === 'object' ? options : {};
  const maxEntries = Number.isFinite(Number(config.maxEntries))
    ? Math.max(1, Math.round(Number(config.maxEntries)))
    : DEFAULT_MAX_ENTRIES;
  return new SearchInputHistory(config.storage || null, maxEntries);
}

export {
  DEFAULT_MAX_ENTRIES,
  createSearchInputHistoryController,
  getShortcutDirection,
  normalizeEntries
};
export type { HistoryDirection, HistoryMove, SearchInputHistory, SearchInputHistoryOptions };
