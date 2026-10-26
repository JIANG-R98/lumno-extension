// Binding shortcut folders to this device's bookmark folders: the local
// binding store a New Tab page reads and writes, and the background
// controller that keeps the stored portable references current.
import { buildNodeMap, describe, isTreeRootId, normalizeBindings, resolveReference } from '../domain/bookmark-folder-reference';
import type {
  BookmarkNode,
  FolderBindings,
  FolderShortcutLike
} from '../domain/bookmark-folder-reference';
import { isShortcutFolder } from '../domain/shortcuts-store';
import type { PortableShortcutFolder, ShortcutItem, VisibleShortcutItem } from '../domain/shortcuts-store';
import {
  NEWTAB_SHORTCUT_LIST_SETTINGS,
  newtabShortcutsLocalOverflow,
  shortcutFolderBindings
} from '../domain/settings/newtab-shortcuts';
import type { ProviderStorageRuntime } from './settings-storage';
import type { SettingsStore } from './settings-store';
import { createShortcutListStorage } from './shortcut-list-storage';
import type { ShortcutListChromeApi } from './shortcut-list-storage';
import { isRecord } from './storage-call';

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
interface FolderSyncChromeApi extends ShortcutListChromeApi {
  bookmarks: BookmarksApiLike;
}

interface FolderBindingRuntimeOptions {
  // The settings this device's bindings are read from and saved to.
  settingsStore: SettingsStore;
}

interface FolderBindingRuntime {
  // Settles once this device's bindings are loaded.
  ready: Promise<void>;
  // Takes the bindings another page stored, keeping this page's unsaved ones.
  accept(value: unknown): void;
  bind(id: string, folderId: string | number): void;
  // Stores the bindings made since the last flush.
  flush(): Promise<void>;
  getNode<T extends FolderShortcutLike>(item: T | null | undefined, nodeMap: ReadonlyMap<string, BookmarkNode>): BookmarkNode | null;
  // Gives folder entries a current portable reference.
  reconcile<T extends ShortcutItem>(items: readonly T[], nodeMap: ReadonlyMap<string, BookmarkNode>): Array<T | PortableShortcutFolder>;
  // The entries to show: folders this device can open, with their local ID.
  visibleItems(items: readonly ShortcutItem[], nodeMap: ReadonlyMap<string, BookmarkNode>): VisibleShortcutItem[];
}

interface FolderSyncControllerOptions {
  chrome: FolderSyncChromeApi;
  provider: ProviderStorageRuntime;
  // Holds the bindings and the stored shortcut list.
  settingsStore: SettingsStore;
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


function createRuntime(options: FolderBindingRuntimeOptions): FolderBindingRuntime {
  const settingsStore = options.settingsStore;
  let bindings: FolderBindings = {};
  let loaded = false;
  let pending: FolderBindings = {};
  let chain: Promise<void> = Promise.resolve();
  async function readBindings(): Promise<FolderBindings> {
    await settingsStore.ready;
    return normalizeBindings(settingsStore.getStored(shortcutFolderBindings));
  }
  function writeBindings(value: FolderBindings): Promise<void> {
    return settingsStore.set(shortcutFolderBindings, value);
  }
  const ready = readBindings().then((stored) => {
    bindings = stored;
    loaded = true;
  });
  function accept(value: unknown): void {
    bindings = { ...normalizeBindings(value), ...pending };
  }
  // Bindings another page stored arrive here too.
  settingsStore.subscribe(shortcutFolderBindings, () => accept(settingsStore.getStored(shortcutFolderBindings)));
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
  function getNode<T extends FolderShortcutLike>(item: T | null | undefined, nodeMap: ReadonlyMap<string, BookmarkNode>): BookmarkNode | null {
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
  function findLegacyFolder<T extends FolderShortcutLike>(item: T, nodeMap: ReadonlyMap<string, BookmarkNode>): BookmarkNode | null {
    // Legacy sync IDs have no provenance. Migrate only a unique title,
    // rather than trusting a possibly unrelated matching numeric ID.
    const candidates = [...nodeMap.values()].filter((candidate) => !candidate.url &&
      !isTreeRootId(candidate.id) && item.title && candidate.title === item.title);
    return candidates.length === 1 && String(candidates[0].id) === item.folderId ? candidates[0] : null;
  }
  function reconcile<T extends ShortcutItem>(items: readonly T[], nodeMap: ReadonlyMap<string, BookmarkNode>): Array<T | PortableShortcutFolder> {
    if (!loaded) return items.slice();
    return items.map((item): T | PortableShortcutFolder => {
      if (!isShortcutFolder(item)) return item;
      let node = getNode(item, nodeMap);
      if (!item.folderRef && !node) {
        node = findLegacyFolder(item, nodeMap);
        if (node) bind(item.id, node.id);
      }
      const ref = node && describe(node.id, nodeMap);
      if (!node || !ref || (item.folderRef && JSON.stringify(item.folderRef) === JSON.stringify(ref))) return item;
      return {
        id: item.id,
        ...(item.groupId === undefined ? {} : { groupId: item.groupId }),
        type: 'folder',
        title: String(node.title || ''),
        folderRef: ref
      };
    });
  }
  function visibleItems(items: readonly ShortcutItem[], nodeMap: ReadonlyMap<string, BookmarkNode>): VisibleShortcutItem[] {
    return items.flatMap((item): VisibleShortcutItem[] => {
      if (!isShortcutFolder(item)) return [item];
      const node = getNode(item, nodeMap);
      return node ? [{ ...item, folderId: String(node.id) }] : [];
    });
  }
  return { ready, accept, bind, flush, getNode, reconcile, visibleItems };
}

// Keep portable locators current even when the originating new-tab is closed.
function createSyncController(options: FolderSyncControllerOptions): FolderSyncController {
  const chromeApi = options.chrome;
  const provider = options.provider;
  const settingsStore = options.settingsStore;
  const runtime = createRuntime({ settingsStore });
  const shortcutList = createShortcutListStorage({ chromeApi, provider });
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
    await runtime.ready;
    const generation = revision;
    const read = await shortcutList.read();
    const state = read.state;
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
    if (!shortcutList.isSameRead(read, await shortcutList.read())) { schedule(); return; }
    if (generation !== revision) return;
    await shortcutList.write(nextState);
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
    settingsStore.subscribe([shortcutFolderBindings, newtabShortcutsLocalOverflow, ...NEWTAB_SHORTCUT_LIST_SETTINGS], schedule);
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
