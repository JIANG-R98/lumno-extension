// One stored setting a React settings section draws: its current value,
// kept in step with storage through the setting binder, and saved when the
// reader changes it.
import type { StorageItems } from '../domain/storage-port';
import type { SettingSpec } from './options-setting-bindings';

interface SectionSettingSpec<V> {
  storageKey: string;
  normalize(raw: unknown): V;
  // See createSettingBinder.
  refreshSelects?: boolean;
  repairOnLoad?: boolean;
  repairOnChange?: boolean;
}

interface SectionSettingBinder {
  bindSetting<V>(spec: SettingSpec<V>): void;
}

interface SectionSettingStorage {
  set(items: StorageItems): unknown;
}

interface SectionSetting<V> {
  readonly storageKey: string;
  get(): V;
  bind(binder: SectionSettingBinder): void;
  // The reader's own change: shown at once and saved.
  change(next: V): void;
}

// Until storage answers, the value is what the normalizer makes of nothing.
function createSectionSetting<V>(
  spec: SectionSettingSpec<V>,
  storageArea: SectionSettingStorage | null,
  onChange: () => void
): SectionSetting<V> {
  let value = spec.normalize(undefined);
  return {
    storageKey: spec.storageKey,
    get: () => value,
    bind(binder) {
      binder.bindSetting({
        key: spec.storageKey,
        normalize: spec.normalize,
        apply(next) {
          value = next;
          onChange();
        },
        refreshSelects: spec.refreshSelects,
        repairOnLoad: spec.repairOnLoad,
        repairOnChange: spec.repairOnChange
      });
    },
    change(next) {
      value = next;
      onChange();
      if (storageArea) {
        storageArea.set({ [spec.storageKey]: next });
      }
    }
  };
}

export { createSectionSetting };
export type { SectionSetting, SectionSettingBinder, SectionSettingSpec, SectionSettingStorage };
