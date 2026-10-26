import { describe, expect, it, vi } from 'vitest';
import { defineSetting, defineSettingFamily } from '../domain/settings/define';
import { flag, oneOf, opaque } from '../domain/settings/schema';
import { localPrimary } from '../domain/settings/sync-state';
import type { StorageChangeListener, StorageItems } from '../domain/storage-port';
import { createSettingsStore, getContextSettingsStore } from './settings-store';
import type { SettingsStoreChromeApi } from './settings-store';

const theme = defineSetting({ key: 'test_theme', area: 'preferences', sync: 'browser', schema: oneOf(['light', 'dark', 'system'] as const, 'system') });
const device = defineSetting({ key: 'test_device', area: 'device', schema: flag(false) });
const session = defineSetting({ key: 'test_session', area: 'session', schema: opaque() });
const page = defineSetting({ key: 'test_page', area: 'page', schema: opaque() });

function createArea(name: string, listeners: StorageChangeListener[], initial: StorageItems = {}) {
  const items: StorageItems = { ...initial };
  const reads: string[][] = [];
  return {
    items,
    reads,
    get(keys: string | string[] | StorageItems | null, callback?: (result: StorageItems) => void) {
      const list = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(items));
      reads.push(list);
      const result = Object.fromEntries(list.filter((key) => key in items).map((key) => [key, items[key]]));
      if (callback) queueMicrotask(() => callback(result));
      return callback ? undefined : Promise.resolve(result);
    },
    set(values: StorageItems, callback?: () => void) {
      const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: items[key], newValue: value }]));
      Object.assign(items, values);
      queueMicrotask(() => {
        if (callback) callback();
        listeners.forEach((listener) => listener(changes, name));
      });
      return callback ? undefined : Promise.resolve();
    },
    remove(keys: string | string[], callback?: () => void) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => { delete items[key]; });
      queueMicrotask(() => { if (callback) callback(); });
      return callback ? undefined : Promise.resolve();
    }
  };
}

function createChrome(sync: StorageItems = {}, local: StorageItems = {}) {
  const listeners: StorageChangeListener[] = [];
  const chromeApi = {
    runtime: { lastError: null },
    storage: {
      sync: createArea('sync', listeners, sync),
      local: createArea('local', listeners, local),
      session: createArea('session', listeners),
      onChanged: {
        addListener: (listener: StorageChangeListener) => listeners.push(listener),
        removeListener: (listener: StorageChangeListener) => listeners.splice(listeners.indexOf(listener), 1)
      }
    }
  };
  const api: SettingsStoreChromeApi = chromeApi;
  return { api, chromeApi, listeners };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

describe('settings store', () => {
  it('reads each area once and answers defaults until then', async () => {
    const { api, chromeApi } = createChrome({ test_theme: 'dark' }, { test_device: true });
    const store = createSettingsStore({ chromeApi: api, settings: [theme, device, session] });
    expect(store.get(theme)).toBe('system');
    await store.ready;
    expect(store.get(theme)).toBe('dark');
    expect(store.get(device)).toBe(true);
    expect(chromeApi.storage.sync.reads).toEqual([['test_theme']]);
    // The local area also answers the settings storage mode first.
    expect(chromeApi.storage.local.reads.filter((keys) => keys.includes('test_device'))).toHaveLength(1);
  });

  it('reads a stored value of another shape through the schema', async () => {
    const { api } = createChrome({ test_theme: 'purple' });
    const store = createSettingsStore({ chromeApi: api, settings: [theme] });
    await store.ready;
    expect(store.get(theme)).toBe('system');
    expect(store.getStored(theme)).toBe('purple');
  });

  it('applies changes from the area each setting lives in, and only those', async () => {
    const { api, listeners } = createChrome();
    const store = createSettingsStore({ chromeApi: api, settings: [theme, device] });
    await store.ready;
    const seen = vi.fn();
    store.subscribe([theme, device], (setting) => seen(setting.key));
    listeners.forEach((listener) => listener({ test_theme: { newValue: 'light' } }, 'local'));
    expect(store.get(theme)).toBe('system');
    listeners.forEach((listener) => listener({ test_theme: { newValue: 'light' }, test_device: { newValue: true } }, 'sync'));
    expect(store.get(theme)).toBe('light');
    expect(store.get(device)).toBe(false);
    listeners.forEach((listener) => listener({ test_device: { newValue: true } }, 'local'));
    expect(store.get(device)).toBe(true);
    expect(seen.mock.calls).toEqual([['test_theme'], ['test_device']]);
  });

  it('follows preferences to this device when the user keeps settings here', async () => {
    const { api, chromeApi, listeners } = createChrome({ test_theme: 'dark' }, { test_theme: 'light' });
    const store = createSettingsStore({ chromeApi: api, settings: [theme] });
    await store.ready;
    expect(store.get(theme)).toBe('dark');
    chromeApi.storage.local.items[localPrimary.key] = true;
    listeners.forEach((listener) => listener({ [localPrimary.key]: { newValue: true } }, 'local'));
    await vi.waitFor(() => expect(store.get(theme)).toBe('light'));
    listeners.forEach((listener) => listener({ test_theme: { newValue: 'system' } }, 'sync'));
    expect(store.get(theme)).toBe('light');
  });

  it('writes through the schema and tells subscribers once', async () => {
    const { api, chromeApi } = createChrome();
    const store = createSettingsStore({ chromeApi: api, settings: [theme] });
    await store.ready;
    const seen = vi.fn();
    store.subscribe(theme, seen);
    await store.set(theme, 'dark');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeApi.storage.sync.items.test_theme).toBe('dark');
    expect(store.get(theme)).toBe('dark');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('keeps page values in window storage', () => {
    const localStorage = memoryStorage({ test_page: 'cached' });
    const store = createSettingsStore({ chromeApi: null, settings: [page], windowObj: { localStorage } });
    expect(store.get(page)).toBe('cached');
    void store.set(page, 'next');
    expect(localStorage.getItem('test_page')).toBe('next');
    void store.remove(page);
    expect(localStorage.getItem('test_page')).toBeNull();
  });

  it('follows changes of a setting it never read', async () => {
    const { api, chromeApi, listeners } = createChrome({}, { test_device: true });
    const store = createSettingsStore({ chromeApi: api, settings: [theme] });
    await store.ready;
    const seen = vi.fn();
    store.subscribe(device, seen);
    expect(store.get(device)).toBe(false);
    expect(chromeApi.storage.local.reads.some((keys) => keys.includes('test_device'))).toBe(false);
    listeners.forEach((listener) => listener({ test_device: { newValue: true } }, 'local'));
    expect(store.get(device)).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('stops listening once destroyed', async () => {
    const { api, listeners } = createChrome();
    const store = createSettingsStore({ chromeApi: api, settings: [theme] });
    await store.ready;
    const count = listeners.length;
    store.destroy();
    expect(listeners.length).toBe(count - 1);
  });

  it('reads settings a module adds later once, and shares one listener per context', async () => {
    const { api, chromeApi, listeners } = createChrome({ test_theme: 'dark' }, { test_device: true });
    const store = getContextSettingsStore(api);
    expect(getContextSettingsStore(api)).toBe(store);
    expect(listeners).toHaveLength(0);
    // Only a subscriber makes the shared store follow storage.
    const unsubscribe = store.subscribe([theme, device], () => {});
    const following = listeners.length;
    expect(following).toBeGreaterThan(0);
    await store.include(theme);
    await Promise.all([store.include([theme, device]), store.include(device)]);
    expect(store.get(theme)).toBe('dark');
    expect(store.get(device)).toBe(true);
    expect(chromeApi.storage.sync.reads).toEqual([['test_theme']]);
    expect(chromeApi.storage.local.reads.filter((keys) => keys.includes('test_device'))).toHaveLength(1);
    unsubscribe();
    expect(listeners).toHaveLength(following - 1);
    // Values nobody followed are read again.
    chromeApi.storage.sync.items.test_theme = 'light';
    await store.include(theme);
    expect(store.get(theme)).toBe('light');
  });

  it('reads the settings included in one task together', async () => {
    const { api, chromeApi } = createChrome({ test_theme: 'dark' });
    const other = defineSetting({ key: 'test_other', area: 'preferences', schema: opaque() });
    const store = createSettingsStore({ chromeApi: api, settings: [] });
    await Promise.all([store.include(theme), store.include(other)]);
    expect(chromeApi.storage.sync.reads).toEqual([['test_theme', 'test_other']]);
  });

  it('tells member listeners which member of a family changed', async () => {
    const { api, listeners } = createChrome();
    const family = defineSettingFamily({ prefix: 'test_member:', area: 'device', schema: opaque() });
    const store = createSettingsStore({ chromeApi: api, settings: [] });
    const seen = vi.fn();
    const unsubscribe = store.subscribeMembers(family, seen);
    listeners.forEach((listener) => listener({ 'test_member:a': { newValue: 1 }, other: { newValue: 2 } }, 'local'));
    listeners.forEach((listener) => listener({ 'test_member:b': { newValue: 1 } }, 'sync'));
    expect(seen.mock.calls).toEqual([['a']]);
    unsubscribe();
  });

  it('writes a preference it never read', async () => {
    const { api, chromeApi } = createChrome();
    const store = createSettingsStore({ chromeApi: api, settings: [] });
    await store.set(theme, 'dark');
    expect(chromeApi.storage.sync.items.test_theme).toBe('dark');
  });

  it('does not report a first read as a change', async () => {
    const { api } = createChrome({ test_theme: 'dark' });
    const store = createSettingsStore({ chromeApi: api, settings: [] });
    const seen = vi.fn();
    store.subscribe(theme, seen);
    await store.include(theme);
    expect(store.get(theme)).toBe('dark');
    expect(seen).not.toHaveBeenCalled();
  });
});
