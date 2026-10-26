// Sets <html data-lumno-motion-effects="on|off"> from the stored setting
// before the page draws, keeps it current, and hands the first value to the
// page script through the boot handoff (motionPreferenceReady).
import { createSettingsStore } from '../platform/settings-store';
import { motionEffectsEnabled } from '../domain/settings/appearance';
import { publishBootValue } from '../platform/boot-handoff';

(function() {
  const root = document.documentElement;
  const settingsStore = createSettingsStore({ chromeApi: chrome, settings: [motionEffectsEnabled] });

  function applyMotionEffectsPreference(): boolean {
    const enabled = settingsStore.get(motionEffectsEnabled);
    root.setAttribute('data-lumno-motion-effects', enabled ? 'on' : 'off');
    return enabled;
  }

  publishBootValue('motionPreferenceReady', settingsStore.ready.then(applyMotionEffectsPreference));
  settingsStore.subscribe(motionEffectsEnabled, applyMotionEffectsPreference);
})();
