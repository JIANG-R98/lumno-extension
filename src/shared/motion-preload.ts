// Sets <html data-lumno-motion-effects="on|off"> from the stored setting
// before the page draws, keeps it current, and hands the first value to the
// page script through the boot handoff (motionPreferenceReady).
import * as LumnoSettingsStorage from '../platform/settings-storage';
import { motionEffectsEnabled } from '../domain/settings/appearance';
import { publishBootValue } from '../platform/boot-handoff';

(function() {
  const root = document.documentElement;
  const providerRuntime = LumnoSettingsStorage.createProviderStorageRuntime(chrome);
  const storageArea = providerRuntime.area;
  let resolveInitialPreference: ((enabled: boolean) => void) | null = null;
  const initialPreferenceReady = new Promise<boolean>((resolve) => {
    resolveInitialPreference = resolve;
  });

  publishBootValue('motionPreferenceReady', initialPreferenceReady);

  function applyMotionEffectsPreference(value: unknown): void {
    const enabled = motionEffectsEnabled.parse(value);
    root.setAttribute('data-lumno-motion-effects', enabled ? 'on' : 'off');
    if (resolveInitialPreference) {
      resolveInitialPreference(enabled);
      resolveInitialPreference = null;
    }
  }

  storageArea.get([motionEffectsEnabled.key], (result) => {
    const rawValue = result ? result[motionEffectsEnabled.key] : undefined;
    const enabled = motionEffectsEnabled.parse(rawValue);
    applyMotionEffectsPreference(enabled);
    if (rawValue !== enabled) {
      storageArea.set({ [motionEffectsEnabled.key]: enabled });
    }
  });

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (!providerRuntime.isActiveAreaName(areaName) || !changes[motionEffectsEnabled.key]) {
        return;
      }
      applyMotionEffectsPreference(changes[motionEffectsEnabled.key].newValue);
    });
  }
})();
