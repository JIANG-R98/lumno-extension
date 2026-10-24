// Binding shortcut folders to this device's bookmark folders: the local
// binding store a New Tab page reads and writes, and the background
// controller that keeps the stored portable references current.
import {
  BINDINGS_KEY,
  buildNodeMap,
  describe,
  isTreeRootId,
  normalizeBindings,
  resolveReference
} from '../domain/bookmark-folder-reference';
import type {
  BookmarkNode,
  BookmarkNodeMap,
  FolderBindings,
  FolderShortcutLike,
  PortableFolderShortcut
} from '../domain/bookmark-folder-reference';
import { LOCAL_PRIMARY_STORAGE_KEY } from '../domain/settings';
import * as LumnoNewtabShortcutsStore from '../domain/shortcuts-store';
import type {
  StorageAreaLike,
  StorageChangeEventLike,
  StorageItems,
  StorageKeys
} from '../domain/storage-port';
import { createProviderStorageRuntime } from './settings-storage';
import { persistShortcutState } from './shortcut-storage';
import { callStorage, isRecord } from './storage-call';
import type { ProviderStorageRuntime, StorageChromeApi } from './settings-storage';

// An area that reads like chrome.storage: through the callback, or through
// the promise it returns.
interface StorageReader {
  get(keys: StorageKeys, callback: (items: unknown) => void): unknown;
}

interface StorageWriter {
  set(items: StorageItems, callback: () => void): unknown;
}

type BookmarkEventName = 'onCreated' | 'onRemoved' | 'onChanged' | 'onMoved' | 'onChildrenReordered' | 'onImportEnded';

const BOOKMARK_EVENT_NAMES: readonly BookmarkEventName[] =
  ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded'];

interface BookmarkEventLike {
  addListener(listener: () => void): void;
}

// chrome.bookmarks; Firefox lacks some of the events.
interface BookmarksApiLike extends Partial<Record<BookmarkEventName, BookmarkEventLike>> {
  getTree(callback: (tree: BookmarkNode[]) => void): void;
}

// The parts of the extension API the background controller uses.
interface FolderSyncChromeApi extends StorageChromeApi {
  storage: {
    local: StorageAreaLike;
    sync: StorageAreaLike & { QUOTA_BYTES?: number };
    onChanged: StorageChangeEventLike;
  };
  bookmarks: BookmarksApiLike;
}

interface FolderBindingRuntimeOptions {
  chrome?: StorageChromeApi | null;
}

interface FolderBindingRuntime {
  // Settles once this device's bindings are loaded.
  ready: Promise<void>;
  // Takes the bindings another page stored, keeping this page's unsaved ones.
  accept(value: unknown): void;
  bind(id: string, folderId: string | number): void;
  // Stores the bindings made since the last flush.
  flush(): Promise<void>;
  getNode<T extends FolderShortcutLike>(item: T | null | undefined, nodeMap: BookmarkNodeMap): BookmarkNode | null;
  // Gives folder entries a current portable reference.
  reconcile<T extends FolderShortcutLike>(items: T[], nodeMap: BookmarkNodeMap): Array<T | PortableFolderShortcut<T>>;
  // The entries to show: folders this device can open, with their local ID.
  visibleItems<T extends FolderShortcutLike>(items: T[], nodeMap: BookmarkNodeMap): T[];
}

interface FolderSyncControllerOptions {
  chrome: FolderSyncChromeApi;
  provider?: ProviderStorageRuntime | null;
  onError?: (error: unknown) => void;
}

interface FolderSyncController {
  start(): void;
  refresh(): Promise<void>;
}

// Node's timers keep a test process alive unless unreferenced.
function unrefTimer(handle: unknown): void {
  if (isRecord(handle) && 'unref' in handle && typeof handle.unref === 'function') handle.unref();
}

async function readItems(
  chromeApi: StorageChromeApi | null | undefined,
  area: StorageReader,
  keys: StorageKeys
): Promise<StorageItems> {
  const result = await callStorage(chromeApi, (done) => area.get(keys, done));
  return isRecord(result) ? result : {};
}

function createRuntime(options?: FolderBindingRuntimeOptions | null): FolderBindingRuntime {
  const chromeApi: StorageChromeApi | undefined = (options && options.chrome) || globalThis.chrome;
  const area = chromeApi && chromeApi.storage ? chromeApi.storage.local : undefined;
  let bindings: FolderBindings = {};
  let loaded = false;
  let pending: FolderBindings = {};
  let chain: Promise<void> = Promise.resolve();
  function requireArea(): StorageAreaLike {
    if (!area) throw new Error('Folder binding storage is unavailable');
    return area;
  }
  async function readBindings(): Promise<FolderBindings> {
    const values = await readItems(chromeApi, requireArea(), [BINDINGS_KEY]);
    return normalizeBindings(values[BINDINGS_KEY]);
  }
  async function writeBindings(value: FolderBindings): Promise<void> {
    const writer: StorageWriter = requireArea();
    await callStorage(chromeApi, (done) => writer.set({ [BINDINGS_KEY]: value }, done));
  }
  const ready = readBindings().then((stored) => {
    bindings = stored;
    loaded = true;
  });
  function accept(value: unknown): void {
    bindings = { ...normalizeBindings(value), ...pending };
  }
  function bind(id: string, folderId: string | number): void {
    const next = { folderId: String(folderId) };
    if (!id || !next.folderId || isTreeRootId(next.folderId)) return;
    if (Object.hasOwn(bindings, id) && bindings[id].folderId === next.folderId) return;
    bindings = { ...bindings, [id]: next };
    pending = { ...pending, [id]: next };
  }
  function flush(): Promise<void> {
    const operation = chain.catch(() => {}).then(async () => {
      await ready;
      if (!Object.keys(pending).length) return;
      const changes = pending;
      pending = {};
      try {
        const merged = normalizeBindings({ ...await readBindings(), ...changes });
        await writeBindings(merged);
        bindings = { ...merged, ...pending };
      } catch (error) { pending = { ...changes, ...pending }; throw error; }
    });
    chain = operation;
    return operation;
  }
  function getNode<T extends FolderShortcutLike>(item: T | null | undefined, nodeMap: BookmarkNodeMap): BookmarkNode | null {
    if (!loaded || !item || item.type !== 'folder') return null;
    const binding = Object.hasOwn(bindings, item.id) ? bindings[item.id] : null;
    if (binding) {
      const node = nodeMap.get(binding.folderId);
      // Never reattach a deleted binding to a newly created same-name folder.
      return node && !node.url ? node : null;
    }
    if (!item.folderRef) return null;
    const node = resolveReference(item.folderRef, nodeMap);
    if (node) bind(item.id, node.id);
    return node;
  }
  function findLegacyFolder<T extends FolderShortcutLike>(item: T, nodeMap: BookmarkNodeMap): BookmarkNode | null {
    // Legacy sync IDs have no provenance. Migrate only a unique title,
    // rather than trusting a possibly unrelated matching numeric ID.
    const candidates = [...nodeMap.values()].filter((candidate) => !candidate.url &&
      !isTreeRootId(candidate.id) && item.title && candidate.title === item.title);
    return candidates.length === 1 && String(candidates[0].id) === item.folderId ? candidates[0] : null;
  }
  function reconcile<T extends FolderShortcutLike>(items: T[], nodeMap: BookmarkNodeMap): Array<T | PortableFolderShortcut<T>> {
    if (!loaded) return items;
    return items.map((item): T | PortableFolderShortcut<T> => {
      if (!item || item.type !== 'folder') return item;
      let node = getNode(item, nodeMap);
      if (!item.folderRef && !node) {
        node = findLegacyFolder(item, nodeMap);
        if (node) bind(item.id, node.id);
      }
      const ref = node && describe(node.id, nodeMap);
      if (!node || !ref || (item.folderRef && JSON.stringify(item.folderRef) === JSON.stringify(ref))) return item;
      const { folderId: _localId, ...portable } = item;
      return { ...portable, folderRef: ref, title: String(node.title || '') };
    });
  }
  function visibleItems<T extends FolderShortcutLike>(items: T[], nodeMap: BookmarkNodeMap): T[] {
    return items.flatMap((item) => {
      if (item.type !== 'folder') return [item];
      const node = getNode(item, nodeMap);
      return node ? [{ ...item, folderId: String(node.id) }] : [];
    });
  }
  return { ready, accept, bind, flush, getNode, reconcile, visibleItems };
}

// Keep portable locators current even when the originating new-tab is closed.
function createSyncController(options: FolderSyncControllerOptions): FolderSyncController {
  const chromeApi = options.chrome;
  const store = LumnoNewtabShortcutsStore;
  const provider = options.provider || createProviderStorageRuntime(chromeApi);
  const runtime = createRuntime({ chrome: chromeApi });
  const overflowKey = store.SHORTCUTS_LOCAL_OVERFLOW_KEY;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  function reportError(error: unknown): void {
    if (options.onError) options.onError(error);
  }
  function readBookmarkTree(): Promise<BookmarkNode[]> {
    return new Promise((resolve, reject) => {
      chromeApi.bookmarks.getTree((tree) => {
        const error = chromeApi.runtime && chromeApi.runtime.lastError;
        if (error || !Array.isArray(tree) || !tree.length) reject(new Error('Bookmarks are unavailable'));
        else resolve(tree);
      });
    });
  }
  async function update(): Promise<void> {
    await Promise.all([provider.ready, runtime.ready]);
    const generation = revision;
    const sync = provider.getActiveAreaName() === 'sync';
    const values = await readItems(chromeApi, provider.area, store.SHORTCUT_STORAGE_KEYS.slice());
    const local = sync ? await readItems(chromeApi, chromeApi.storage.local, [overflowKey]) : {};
    const state = store.readShortcutState(values, local[overflowKey]);
    // A save from another device is still arriving; its next part reruns this.
    if (state.torn || !state.items.some((item) => item.type === 'folder')) return;
    const next = runtime.reconcile(state.items, buildNodeMap(await readBookmarkTree()));
    await runtime.flush();
    if (generation !== revision || JSON.stringify(next) === JSON.stringify(state.items)) return;
    const nextState = { groups: state.groups, items: next, migratedAt: state.migratedAt };
    // A New Tab page may have saved the shortcuts since they were read (a
    // site dragged out of a folder, whose bookmark it then removes). Writing
    // this older list over that save would lose the site, so a changed list
    // is read again instead.
    const unchanged = async (): Promise<boolean> => {
      const latest = await readItems(chromeApi, provider.area, store.SHORTCUT_STORAGE_KEYS.slice());
      const latestLocal = sync ? await readItems(chromeApi, chromeApi.storage.local, [overflowKey]) : {};
      return JSON.stringify(latest) === JSON.stringify(values) &&
        JSON.stringify(latestLocal[overflowKey]) === JSON.stringify(local[overflowKey]);
    };
    if (!sync) {
      if (generation !== revision) return;
      if (!await unchanged()) { schedule(); return; }
      await persistShortcutState(provider.area, nextState);
      return;
    }
    const allSync = await readItems(chromeApi, chromeApi.storage.sync, null);
    if (generation !== revision) return;
    if (!await unchanged()) { schedule(); return; }
    const usage = store.measureShortcutSyncUsage(allSync);
    await persistShortcutState(chromeApi.storage.sync, nextState, {
      overflowArea: chromeApi.storage.local,
      maxTotalBytes: store.getShortcutSyncBudget({ ...usage, quotaBytes: chromeApi.storage.sync.QUOTA_BYTES }),
      legacyKeysPresent: usage.legacyBytes > 0,
      getLastError: () => chromeApi.runtime && chromeApi.runtime.lastError
    });
  }
  function refresh(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    const job = chain.catch(() => {}).then(update);
    chain = job;
    return job;
  }
  function schedule(): void {
    revision += 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      refresh().catch(reportError);
    }, 120);
    unrefTimer(timer);
  }
  function start(): void {
    for (const name of BOOKMARK_EVENT_NAMES) {
      const event = chromeApi.bookmarks[name];
      if (event) event.addListener(schedule);
    }
    chromeApi.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[BINDINGS_KEY]) {
        runtime.accept(changes[BINDINGS_KEY].newValue);
        schedule();
      } else if (changes[LOCAL_PRIMARY_STORAGE_KEY] || changes[overflowKey] ||
          (provider.isActiveAreaName(area) && store.SHORTCUT_STORAGE_KEYS.some((key) => changes[key]))) schedule();
    });
    refresh().catch(reportError);
  }
  return { start, refresh };
}

export { createRuntime, createSyncController };
export type {
  FolderBindingRuntime,
  FolderBindingRuntimeOptions,
  FolderSyncChromeApi,
  FolderSyncController,
  FolderSyncControllerOptions
};
