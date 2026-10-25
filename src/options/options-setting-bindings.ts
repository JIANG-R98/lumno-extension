// Routes chrome.storage.onChanged events to the handlers each settings
// section registers next to its own render code. A handler watches one key
// or several; with several it runs once per event when any of them changed.
// Handlers run in registration order. By default they only see events from
// the provider's primary area; `area: 'local'` watches chrome.storage.local.
import type { StorageAreaLike, StorageChanges } from '../domain/storage-port';

type StorageChangeHandler = (changes: StorageChanges, areaName: string) => void;

interface RegistryEntryOptions {
  // 'primary' (the default) or an area name such as 'local'.
  area?: string;
}

interface RegistryEntry {
  area: string;
  handler: StorageChangeHandler;
  keys: string[];
}

interface StorageChangeRegistryOptions {
  isPrimaryAreaName?(areaName: string): boolean;
}

type StorageChangeRegistry = ReturnType<typeof createStorageChangeRegistry>;

function createStorageChangeRegistry(options?: StorageChangeRegistryOptions) {
  const isPrimaryAreaName = options && options.isPrimaryAreaName
    ? options.isPrimaryAreaName
    : () => false;
  const entries: RegistryEntry[] = [];

  // Without keys there is nothing to watch, and the handler never runs.
  function on(
    keys: string | readonly string[] | undefined,
    handler: StorageChangeHandler,
    entryOptions?: RegistryEntryOptions
  ): void {
    const list = (typeof keys === 'string' ? [keys] : Array.from(keys || [])).filter(Boolean);
    if (!list.length) {
      return;
    }
    entries.push({
      area: (entryOptions && entryOptions.area) || 'primary',
      handler,
      keys: list
    });
  }

  function dispatch(changes: StorageChanges | null | undefined, areaName: string): void {
    if (!changes || typeof changes !== 'object') {
      return;
    }
    const isPrimary = isPrimaryAreaName(areaName);
    entries.forEach((entry) => {
      const watchesArea = entry.area === 'primary' ? isPrimary : entry.area === areaName;
      if (watchesArea && entry.keys.some((key) => changes[key])) {
        entry.handler(changes, areaName);
      }
    });
  }

  return Object.freeze({ dispatch, on });
}

// Binds one stored setting to the page: reads it once at startup, applies the
// normalized value, follows later storage changes, and writes the normalized
// value back when the stored one was missing or invalid.
//
// Spec fields:
//   key              storage key
//   normalize(raw)   stored value -> value the page shows
//   normalizeChange  normalizer for storage changes, when it differs
//   apply(value)     renders the value
//   load             false to skip the startup read (a section reads it
//                    together with related keys)
//   repairOnLoad     false to never write back after the startup read
//   repairOnChange   false to never write back after a storage change
//   refreshSelects   true to refresh the custom selects after applying
//
// A binder made with `area: 'local'` reads, writes and follows
// chrome.storage.local (device-only settings) instead of the primary area.
// `writeRepairs(values, stored)` replaces the write-back after the startup
// read (Options passes SETTINGS.writeSettingRepairs, which leaves a missing
// value alone while this device's local copy migrates in).
interface SettingBinderOptions {
  storageArea: StorageAreaLike | null;
  registry: Pick<StorageChangeRegistry, 'on'>;
  area?: string;
  refreshCustomSelects?(): void;
  writeRepairs?(values: Record<string, unknown>, stored: Record<string, unknown>): void;
}

interface SettingSpec<V> {
  key: string;
  normalize(raw: unknown): V;
  normalizeChange?(raw: unknown): V;
  apply(value: V, raw: unknown): void;
  load?: boolean;
  repairOnLoad?: boolean;
  repairOnChange?: boolean;
  refreshSelects?: boolean;
}

function createSettingBinder(config: SettingBinderOptions) {
  const storageArea = config.storageArea || null;
  const registry = config.registry;
  const registryOptions = config.area ? { area: config.area } : undefined;
  const refreshCustomSelects = config.refreshCustomSelects || (() => {});

  function write(values: Record<string, unknown>): void {
    if (storageArea) {
      storageArea.set(values);
    }
  }
  const writeRepairs = config.writeRepairs || ((values: Record<string, unknown>) => write(values));

  function bindSetting<V>(spec: SettingSpec<V>): void {
    const key = spec.key;
    const normalizeChange = spec.normalizeChange || spec.normalize;
    const sync = (raw: unknown, normalize: (raw: unknown) => V, repair: boolean, startup: boolean): void => {
      const value = normalize(raw);
      spec.apply(value, raw);
      if (repair && raw !== value) {
        if (startup) {
          writeRepairs({ [key]: value }, { [key]: raw });
        } else {
          write({ [key]: value });
        }
      }
      if (spec.refreshSelects) {
        refreshCustomSelects();
      }
    };
    if (spec.load !== false && storageArea) {
      storageArea.get([key], (result) => {
        sync(result ? result[key] : undefined, spec.normalize, spec.repairOnLoad !== false, true);
      });
    }
    registry.on(key, (changes) => {
      sync(changes[key].newValue, normalizeChange, spec.repairOnChange !== false, false);
    }, registryOptions);
  }

  return Object.freeze({ bindSetting });
}

export { createSettingBinder, createStorageChangeRegistry };
export type {
  RegistryEntryOptions,
  SettingBinderOptions,
  SettingSpec,
  StorageChangeHandler,
  StorageChangeRegistry,
  StorageChangeRegistryOptions
};
