import { describe, expect, it, vi } from 'vitest';
import { defineSetting } from '../domain/settings/define';
import { oneOf } from '../domain/settings/schema';
import { createSettingsStore } from '../platform/settings-store';
import type { StorageChangeListener, StorageItems, StorageKeys } from '../domain/storage-port';
import { createSettingBinder } from './options-setting-bindings';

const mode = defineSetting({ key: 'test_mode', area: 'preferences', schema: oneOf(['light', 'dark'] as const, 'light') });

function createStore(sync: StorageItems) {
  const listeners: StorageChangeListener[] = [];
  const chromeApi = {
    runtime: { lastError: null },
    storage: {
      sync: {
        get(keys: StorageKeys, callback?: (items: StorageItems | undefined) => void) {
          const list = Array.isArray(keys) ? keys : [];
          callback?.(Object.fromEntries(list.filter((key) => key in sync).map((key) => [key, sync[key]])));
        },
        set(items: StorageItems, callback?: () => void) {
          Object.assign(sync, items);
          callback?.();
        }
      },
      onChanged: { addListener: (listener: StorageChangeListener) => { listeners.push(listener); }, removeListener() {} }
    }
  };
  return { store: createSettingsStore({ chromeApi, settings: [] }), listeners };
}

describe('Options setting binder', () => {
  it('applies a bound setting as read, then every change, refreshing the selects', async () => {
    const { store, listeners } = createStore({ test_mode: 'dark' });
    const refreshCustomSelects = vi.fn();
    const binder = createSettingBinder({ store, refreshCustomSelects });
    const applied: string[] = [];
    binder.bindSetting({ setting: mode, apply: (value) => applied.push(value), refreshSelects: true });
    await binder.whenBound();
    expect(applied).toEqual(['dark']);
    listeners.forEach((listener) => listener({ test_mode: { newValue: 'purple' } }, 'sync'));
    expect(applied).toEqual(['dark', 'light']);
    expect(refreshCustomSelects).toHaveBeenCalledTimes(2);
  });

  it('runs a change handler for any of its settings', () => {
    const { store, listeners } = createStore({});
    const binder = createSettingBinder({ store });
    const handler = vi.fn();
    binder.onChange([mode], handler);
    listeners.forEach((listener) => listener({ test_mode: { newValue: 'dark' } }, 'sync'));
    listeners.forEach((listener) => listener({ other: { newValue: 1 } }, 'sync'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
