// One stored setting a React settings section draws: its current value,
// kept in step with storage through the setting binder, and saved when the
// reader changes it.
import type { Setting } from '../domain/settings/define';
import type { SettingsStore } from '../platform/settings-store';
import type { SettingSpec } from './options-setting-bindings';

interface SectionSettingSpec<V> {
  setting: Setting<V>;
  // See createSettingBinder.
  refreshSelects?: boolean;
}

interface SectionSettingBinder {
  bindSetting<V>(spec: SettingSpec<V>): void;
}

// The page's settings store, as the sections use it.
type SectionSettingStorage = Pick<SettingsStore, 'include' | 'get' | 'getStored' | 'isRead' | 'set' | 'setMany' | 'remove'>;

interface SectionSetting<V> {
  readonly setting: Setting<V>;
  readonly storageKey: string;
  get(): V;
  bind(binder: SectionSettingBinder): void;
  // The reader's own change: shown at once and saved.
  change(next: V): void;
  // Shown at once; the caller saves it together with other settings.
  show(next: V): void;
}

// Until storage answers, the value is the setting's default.
function createSectionSetting<V>(
  spec: SectionSettingSpec<V>,
  storage: SectionSettingStorage | null,
  onChange: () => void
): SectionSetting<V> {
  const setting = spec.setting;
  let value = setting.default;
  return {
    setting,
    storageKey: setting.key,
    get: () => value,
    bind(binder) {
      binder.bindSetting({
        setting,
        apply(next) {
          value = next;
          onChange();
        },
        refreshSelects: spec.refreshSelects
      });
    },
    change(next) {
      value = next;
      onChange();
      if (storage) {
        void storage.set(setting, next).catch(() => {});
      }
    },
    show(next) {
      value = next;
      onChange();
    }
  };
}

export { createSectionSetting };
export type { SectionSetting, SectionSettingBinder, SectionSettingSpec, SectionSettingStorage };
