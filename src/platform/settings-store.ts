// The settings a runtime context uses, read once per storage area, kept in
// step with storage through one storage.onChanged listener, and written back
// through their schemas. Each context (the worker, a page, a content script)
// creates one store for the settings it needs.
import type { Setting, SettingArea, SettingFamily } from '../domain/settings/define';
import { localPrimary } from '../domain/settings/sync-state';
import type { StorageAreaLike, StorageChanges, StorageItems } from '../domain/storage-port';
import { createProviderStorageRuntime, writeStorageValues } from './settings-storage';
import type { StorageAreaFacade, StorageChromeApi } from './settings-storage';
import { callStorage, isRecord } from './storage-call';

type StoreArea = Exclude<SettingArea, 'page' | 'tab'>;

// The window storage page and tab values live in.
interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SettingsStoreWindow {
  localStorage?: WebStorageLike | null;
  sessionStorage?: WebStorageLike | null;
}

interface SettingsStoreChromeApi extends StorageChromeApi {
  storage?: StorageChromeApi['storage'] & { session?: StorageAreaLike };
}

interface SettingsStoreOptions {
  chromeApi: SettingsStoreChromeApi | null | undefined;
  settings: readonly Setting<unknown>[];
  windowObj?: SettingsStoreWindow | null;
  // Values a preload already read, by area, so the store does not read them
  // again.
  initial?: Partial<Record<StoreArea, StorageItems>>;
}

type SettingsListener = (setting: Setting<unknown>) => void;

interface SettingsStore {
  // Settles once every area has been read; get() answers defaults before.
  readonly ready: Promise<void>;
  get<T>(setting: Setting<T>): T;
  // What storage holds, before the schema reads it; undefined when nothing is
  // stored.
  getStored(setting: Setting<unknown>): unknown;
  set<T>(setting: Setting<T>, value: T): Promise<void>;
  // Writes several values, one storage call per area.
  setMany(entries: ReadonlyArray<readonly [Setting<unknown>, unknown]>): Promise<void>;
  remove(settings: Setting<unknown> | readonly Setting<unknown>[]): Promise<void>;
  // Calls `listener` whenever one of `settings` changes, here or in storage.
  subscribe(settings: Setting<unknown> | readonly Setting<unknown>[], listener: SettingsListener): () => void;
  // Members of a family are read from storage on request (they are not
  // kept), written and removed by id.
  readMembers(family: SettingFamily<unknown>, ids: readonly (string | number)[]): Promise<Map<string, unknown>>;
  writeMembers(family: SettingFamily<unknown>, values: ReadonlyMap<string, unknown>): Promise<void>;
  removeMembers(family: SettingFamily<unknown>, ids: readonly (string | number)[]): Promise<void>;
  destroy(): void;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isRecord(a) && !isRecord(b)) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_error) {
    return false;
  }
}

function toList(list: Setting<unknown> | readonly Setting<unknown>[]): readonly Setting<unknown>[] {
  return isSettingList(list) ? list : [list];
}

function isSettingList(value: Setting<unknown> | readonly Setting<unknown>[]): value is readonly Setting<unknown>[] {
  return Array.isArray(value);
}

function readWebStorage(storage: WebStorageLike | null | undefined, key: string): unknown {
  try {
    const value = storage ? storage.getItem(key) : null;
    return value === null ? undefined : value;
  } catch (_error) {
    // Blocked or unavailable storage reads as nothing stored.
    return undefined;
  }
}

function writeWebStorage(storage: WebStorageLike | null | undefined, key: string, value: unknown): void {
  try {
    if (!storage) return;
    if (value === undefined) storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch (_error) {
    // A copy that cannot be kept only costs the next page its fast path.
  }
}

function createSettingsStore(options: SettingsStoreOptions): SettingsStore {
  const chromeApi = options.chromeApi || null;
  const storage = chromeApi && chromeApi.storage ? chromeApi.storage : null;
  const windowObj = options.windowObj || null;
  const settings = Array.from(new Set(options.settings));
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const stored = new Map<string, unknown>();
  const parsed = new Map<string, unknown>();
  const listeners = new Map<string, Set<SettingsListener>>();
  const usesPreferences = settings.some((setting) => setting.area === 'preferences');
  const provider = usesPreferences ? createProviderStorageRuntime(chromeApi) : null;
  let destroyed = false;

  function areaFor(area: StoreArea): StorageAreaLike | StorageAreaFacade | null {
    if (!storage) return null;
    if (area === 'preferences') return provider ? provider.area : null;
    if (area === 'browserSync') return storage.sync || null;
    if (area === 'session') return storage.session || storage.local || null;
    return storage.local || null;
  }

  function webStorageFor(setting: Setting<unknown>): WebStorageLike | null {
    if (!windowObj) return null;
    return (setting.area === 'tab' ? windowObj.sessionStorage : windowObj.localStorage) || null;
  }

  function isStoreArea(area: SettingArea): area is StoreArea {
    return area !== 'page' && area !== 'tab';
  }

  // Whether a change in `areaName` reaches settings of `area`.
  function areaMatches(area: StoreArea, areaName: string): boolean {
    if (area === 'preferences') return Boolean(provider && provider.isActiveAreaName(areaName));
    if (area === 'browserSync') return areaName === 'sync';
    if (area === 'session') return areaName === (storage && storage.session ? 'session' : 'local');
    return areaName === 'local';
  }

  function notify(setting: Setting<unknown>): void {
    const set = listeners.get(setting.key);
    if (!set) return;
    Array.from(set).forEach((listener) => {
      try {
        listener(setting);
      } catch (error) {
        // One part of the context failing to apply a change must not keep
        // the rest from seeing it.
        console.error('[Lumno] Setting listener failed.', error);
      }
    });
  }

  // Takes a stored value; tells listeners when what the setting reads as
  // changed.
  function accept(setting: Setting<unknown>, value: unknown): void {
    const hadParsed = parsed.has(setting.key);
    const before = hadParsed ? parsed.get(setting.key) : setting.default;
    if (value === undefined) stored.delete(setting.key);
    else stored.set(setting.key, value);
    const next = setting.parse(value);
    parsed.set(setting.key, next);
    if (!sameValue(before, next)) notify(setting);
  }

  async function readArea(area: StoreArea, list: readonly Setting<unknown>[]): Promise<void> {
    const initial = options.initial && options.initial[area];
    if (initial) {
      list.forEach((setting) => accept(setting, initial[setting.key]));
      return;
    }
    const target = areaFor(area);
    if (!target) return;
    if (area === 'preferences' && provider) await provider.ready;
    let items: unknown;
    try {
      items = await callStorage(chromeApi, (done) => target.get(list.map((setting) => setting.key), done));
    } catch (_error) {
      // An area that cannot be read leaves its settings at their defaults.
      return;
    }
    const values = isRecord(items) ? items : {};
    if (!destroyed) list.forEach((setting) => accept(setting, values[setting.key]));
  }

  function groupByArea(list: readonly Setting<unknown>[]): Map<StoreArea, Setting<unknown>[]> {
    const groups = new Map<StoreArea, Setting<unknown>[]>();
    list.forEach((setting) => {
      if (!isStoreArea(setting.area)) return;
      const group = groups.get(setting.area) || [];
      group.push(setting);
      groups.set(setting.area, group);
    });
    return groups;
  }

  settings.filter((setting) => !isStoreArea(setting.area)).forEach((setting) => {
    accept(setting, readWebStorage(webStorageFor(setting), setting.key));
  });
  const ready = Promise.all(Array.from(groupByArea(settings), ([area, list]) => readArea(area, list)))
    .then(() => undefined);

  function onStorageChanged(changes: StorageChanges, areaName: string): void {
    if (destroyed || !changes) return;
    if (provider && areaName === 'local' && Object.hasOwn(changes, localPrimary.key)) {
      // The user moved settings between browser sync and this device: every
      // preference now reads from the other area.
      void provider.ready.then(() => readArea('preferences', settings.filter((setting) => setting.area === 'preferences')));
    }
    Object.keys(changes).forEach((key) => {
      const setting = byKey.get(key);
      if (!setting || !isStoreArea(setting.area) || !areaMatches(setting.area, areaName)) return;
      accept(setting, changes[key].newValue);
    });
  }

  const onChanged = storage && storage.onChanged;
  if (onChanged && typeof onChanged.addListener === 'function') {
    onChanged.addListener(onStorageChanged);
  }

  function get<T>(setting: Setting<T>): T {
    return setting.parse(stored.get(setting.key));
  }

  async function setMany(entries: ReadonlyArray<readonly [Setting<unknown>, unknown]>): Promise<void> {
    const writes = new Map<StoreArea, StorageItems>();
    entries.forEach(([setting, value]) => {
      const next = setting.parse(value);
      if (!isStoreArea(setting.area)) {
        writeWebStorage(webStorageFor(setting), setting.key, next);
        accept(setting, next);
        return;
      }
      const items = writes.get(setting.area) || {};
      items[setting.key] = next;
      writes.set(setting.area, items);
      accept(setting, next);
    });
    await Promise.all(Array.from(writes, async ([area, items]) => {
      if (area === 'preferences' && provider) await provider.ready;
      await writeStorageValues(areaFor(area), chromeApi, items);
    }));
  }

  async function remove(list: Setting<unknown> | readonly Setting<unknown>[]): Promise<void> {
    const targets = toList(list);
    const removals = new Map<StoreArea, string[]>();
    targets.forEach((setting) => {
      if (!isStoreArea(setting.area)) {
        writeWebStorage(webStorageFor(setting), setting.key, undefined);
      } else {
        const keys = removals.get(setting.area) || [];
        keys.push(setting.key);
        removals.set(setting.area, keys);
      }
      accept(setting, undefined);
    });
    await Promise.all(Array.from(removals, async ([area, keys]) => {
      if (area === 'preferences' && provider) await provider.ready;
      const target = areaFor(area);
      if (target && typeof target.remove === 'function') {
        await callStorage(chromeApi, (done) => target.remove ? target.remove(keys, () => done()) : done());
      }
    }));
  }

  function subscribe(list: Setting<unknown> | readonly Setting<unknown>[], listener: SettingsListener): () => void {
    const targets = toList(list);
    targets.forEach((setting) => {
      if (!byKey.has(setting.key)) {
        throw new Error(`${setting.key} is not one of this store's settings.`);
      }
      const set = listeners.get(setting.key) || new Set<SettingsListener>();
      set.add(listener);
      listeners.set(setting.key, set);
    });
    return () => targets.forEach((setting) => {
      const set = listeners.get(setting.key);
      if (set) set.delete(listener);
    });
  }

  function familyArea(family: SettingFamily<unknown>): StorageAreaLike | StorageAreaFacade | null {
    return isStoreArea(family.area) ? areaFor(family.area) : null;
  }

  async function readMembers(family: SettingFamily<unknown>, ids: readonly (string | number)[]): Promise<Map<string, unknown>> {
    const members = new Map<string, unknown>();
    const target = familyArea(family);
    if (!target || !ids.length) return members;
    if (family.area === 'preferences' && provider) await provider.ready;
    const keys = ids.map((id) => family.keyFor(id));
    const items = await callStorage(chromeApi, (done) => target.get(keys, done));
    const values = isRecord(items) ? items : {};
    ids.forEach((id) => {
      const value = values[family.keyFor(id)];
      if (value !== undefined) members.set(String(id), value);
    });
    return members;
  }

  async function writeMembers(family: SettingFamily<unknown>, values: ReadonlyMap<string, unknown>): Promise<void> {
    const target = familyArea(family);
    if (!target || !values.size) return;
    if (family.area === 'preferences' && provider) await provider.ready;
    const items: StorageItems = {};
    values.forEach((value, id) => {
      items[family.keyFor(id)] = family.parse(value);
    });
    await writeStorageValues(target, chromeApi, items);
  }

  async function removeMembers(family: SettingFamily<unknown>, ids: readonly (string | number)[]): Promise<void> {
    const target = familyArea(family);
    if (!target || !ids.length || typeof target.remove !== 'function') return;
    if (family.area === 'preferences' && provider) await provider.ready;
    const keys = ids.map((id) => family.keyFor(id));
    await callStorage(chromeApi, (done) => target.remove ? target.remove(keys, () => done()) : done());
  }

  return Object.freeze({
    ready,
    get,
    getStored: (setting: Setting<unknown>) => stored.get(setting.key),
    set: <T>(setting: Setting<T>, value: T) => setMany([[setting, value]]),
    setMany,
    remove,
    subscribe,
    readMembers,
    writeMembers,
    removeMembers,
    destroy() {
      destroyed = true;
      listeners.clear();
      if (onChanged && typeof onChanged.removeListener === 'function') {
        onChanged.removeListener(onStorageChanged);
      }
    }
  });
}

// A value worked out from a setting's stored value (rules from a list, an
// index from a map), worked out again only when the stored value changes.
function deriveFromSetting<T>(store: SettingsStore, setting: Setting<unknown>, derive: (stored: unknown) => T): () => T {
  let cache: { source: unknown; value: T } | null = null;
  return () => {
    const stored = store.getStored(setting);
    if (!cache || cache.source !== stored) {
      cache = { source: stored, value: derive(stored) };
    }
    return cache.value;
  };
}

export { createSettingsStore, deriveFromSetting };
export type { SettingsListener, SettingsStore, SettingsStoreChromeApi, SettingsStoreOptions, SettingsStoreWindow, WebStorageLike };
