// A setting's value in a React view, kept current by the context's settings
// store (platform/settings-store.ts).
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Setting } from '../../domain/settings/define';
import type { SettingsStore } from '../../platform/settings-store';

export function useSetting<T>(store: SettingsStore, setting: Setting<T>): T {
  const subscribe = useCallback((onChange: () => void) => store.subscribe(setting, onChange), [store, setting]);
  // The stored value keeps its identity until storage changes, so it is a
  // stable snapshot; the schema reads it once per change.
  const stored = useSyncExternalStore(subscribe, () => store.getStored(setting));
  return useMemo(() => setting.parse(stored), [setting, stored]);
}
