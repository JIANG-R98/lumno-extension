// Binds stored settings to the Options page through its settings store: a
// bound setting is applied once read and again whenever it changes, here or
// on another page.
import type { Setting } from '../domain/settings/define';
import type { SettingsStore } from '../platform/settings-store';

interface SettingBinderOptions {
  store: Pick<SettingsStore, 'include' | 'get' | 'subscribe'>;
  refreshCustomSelects?(): void;
}

interface SettingSpec<V> {
  setting: Setting<V>;
  apply(value: V): void;
  // Refresh the custom selects after applying.
  refreshSelects?: boolean;
}

interface SettingBinder {
  bindSetting<V>(spec: SettingSpec<V>): void;
  // Runs `handler` whenever one of `settings` changes.
  onChange(settings: Setting<unknown> | readonly Setting<unknown>[], handler: () => void): void;
  // Settles once every setting bound so far has been read and applied.
  whenBound(): Promise<void>;
}

function createSettingBinder(config: SettingBinderOptions): SettingBinder {
  const store = config.store;
  const refreshCustomSelects = config.refreshCustomSelects || (() => {});
  const applied: Promise<void>[] = [];

  function bindSetting<V>(spec: SettingSpec<V>): void {
    const apply = (): void => {
      spec.apply(store.get(spec.setting));
      if (spec.refreshSelects) {
        refreshCustomSelects();
      }
    };
    applied.push(store.include(spec.setting).then(apply));
    store.subscribe(spec.setting, apply);
  }

  function onChange(settings: Setting<unknown> | readonly Setting<unknown>[], handler: () => void): void {
    store.subscribe(settings, () => handler());
  }

  function whenBound(): Promise<void> {
    return Promise.all(applied).then(() => undefined);
  }

  return Object.freeze({ bindSetting, onChange, whenBound });
}

export { createSettingBinder };
export type { SettingBinder, SettingBinderOptions, SettingSpec };
