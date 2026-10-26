// Sets <html data-lumno-motion-effects="on|off"> from the stored setting
// before the page draws, keeps it current, and hands the first value to the
// page script through the boot handoff (motionPreferenceReady).
import { getContextSettingsStore } from '../platform/settings-store';
import { motionEffectsEnabled } from '../domain/settings/appearance';
import { publishBootValue } from '../platform/boot-handoff';

(function() {
  const root = document.documentElement;
  const settingsStore = getContextSettingsStore(chrome);
  const loaded = settingsStore.include(motionEffectsEnabled);

  function applyMotionEffectsPreference(): boolean {
    const enabled = settingsStore.get(motionEffectsEnabled);
    root.setAttribute('data-lumno-motion-effects', enabled ? 'on' : 'off');
    return enabled;
  }

  publishBootValue('motionPreferenceReady', loaded.then(applyMotionEffectsPreference));
  settingsStore.subscribe(motionEffectsEnabled, applyMotionEffectsPreference);
})();
