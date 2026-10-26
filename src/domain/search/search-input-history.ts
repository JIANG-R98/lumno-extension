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

interface InputHistoryContext {
  readonly config: SearchInputHistoryOptions;
  readonly storage: StoredValuePort | null;
  readonly maxEntries: number;
  entries: string[];
  cursor: number;
  draft: string;
  hydrated: boolean;
  destroyed: boolean;
  loadPromise: Promise<string[]> | null;
  pendingRecords: string[];
  unsubscribe: (() => void) | null;
}

function resetNavigation(ctx: InputHistoryContext) {
  ctx.cursor = ctx.entries.length;
  ctx.draft = '';
}

function replaceEntries(ctx: InputHistoryContext, value: unknown): string[] {
  ctx.entries = normalizeEntries(value, ctx.maxEntries);
  resetNavigation(ctx);
  return ctx.entries.slice();
}

function applyRecord(ctx: InputHistoryContext, value: unknown): string {
  const entry = normalizeEntry(value);
  if (!entry) {
    return '';
  }
  const next = ctx.entries.filter((item) => item !== entry);
  next.push(entry);
  ctx.entries = next.slice(-ctx.maxEntries);
  resetNavigation(ctx);
  return entry;
}

function persist(ctx: InputHistoryContext) {
  if (!ctx.storage || ctx.destroyed) {
    return;
  }
  // Input history is best-effort and must never block search.
  ctx.storage.write(ctx.entries.slice()).catch(() => {});
}

function readStorage(ctx: InputHistoryContext): Promise<unknown> {
  return ctx.storage ? ctx.storage.read().catch(() => []) : Promise.resolve([]);
}

function load(ctx: InputHistoryContext): Promise<string[]> {
  if (ctx.loadPromise) {
    return ctx.loadPromise;
  }
  ctx.loadPromise = readStorage(ctx).then((result) => {
    if (ctx.destroyed) {
      return ctx.entries.slice();
    }
    const queued = ctx.pendingRecords.slice();
    ctx.pendingRecords = [];
    replaceEntries(ctx, result);
    queued.forEach(((value: unknown) => applyRecord(ctx, value)));
    ctx.hydrated = true;
    if (queued.length > 0) {
      persist(ctx);
    }
    return ctx.entries.slice();
  });
  return ctx.loadPromise;
}

function record(ctx: InputHistoryContext, value: unknown): boolean {
  const entry = normalizeEntry(value);
  if (!entry) {
    return false;
  }
  if (!ctx.hydrated) {
    ctx.pendingRecords.push(entry);
  }
  applyRecord(ctx, entry);
  if (ctx.hydrated) {
    persist(ctx);
  } else {
    load(ctx);
  }
  return true;
}

function move(ctx: InputHistoryContext, direction: HistoryDirection, currentValue: unknown): HistoryMove {
  if (ctx.entries.length === 0) {
    return { handled: false, value: String(currentValue || '') };
  }
  if (direction === 'previous') {
    if (ctx.cursor >= ctx.entries.length) {
      ctx.cursor = ctx.entries.length;
      ctx.draft = String(currentValue || '');
    }
    ctx.cursor = Math.max(0, ctx.cursor - 1);
    return { handled: true, value: ctx.entries[ctx.cursor] };
  }
  if (direction === 'next') {
    if (ctx.cursor >= ctx.entries.length) {
      return { handled: false, value: String(currentValue || '') };
    }
    if (ctx.cursor < ctx.entries.length - 1) {
      ctx.cursor += 1;
      return { handled: true, value: ctx.entries[ctx.cursor] };
    }
    ctx.cursor = ctx.entries.length;
    return { handled: true, value: ctx.draft };
  }
  return { handled: false, value: String(currentValue || '') };
}

function createSearchInputHistoryController(options?: SearchInputHistoryOptions) {
  const config: SearchInputHistoryOptions = options && typeof options === 'object' ? options : {};
  const storage = config.storage || null;
  const maxEntries = Number.isFinite(Number(config.maxEntries))
    ? Math.max(1, Math.round(Number(config.maxEntries)))
    : DEFAULT_MAX_ENTRIES;
  const ctx: InputHistoryContext = {
    config,
    storage,
    maxEntries,
    entries: [],
    cursor: 0,
    draft: '',
    hydrated: false,
    destroyed: false,
    loadPromise: null,
    pendingRecords: [],
    unsubscribe: null
  };

  if (ctx.storage) {
    ctx.unsubscribe = ctx.storage.subscribe((value) => {
      if (ctx.destroyed) {
        return;
      }
      replaceEntries(ctx, value);
      ctx.hydrated = true;
    });
  }

  load(ctx);

  return Object.freeze({
    destroy() {
      ctx.destroyed = true;
      if (ctx.unsubscribe) {
        ctx.unsubscribe();
        ctx.unsubscribe = null;
      }
    },
    getEntries() {
      return ctx.entries.slice();
    },
    load: () => load(ctx),
    move: (direction: HistoryDirection, currentValue: unknown) => move(ctx, direction, currentValue),
    record: (value: unknown) => record(ctx, value),
    resetNavigation: () => resetNavigation(ctx)
  });
}

export {
  DEFAULT_MAX_ENTRIES,
  createSearchInputHistoryController,
  getShortcutDirection,
  normalizeEntries
};
export type { HistoryDirection, HistoryMove, SearchInputHistoryOptions };
