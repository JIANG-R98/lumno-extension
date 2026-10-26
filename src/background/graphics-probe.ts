// Checks whether the browser draws with the GPU and stores the answer, so New
// Tab and the overlay can suggest graphics acceleration when it does not. The
// answer only changes when the browser restarts (the setting needs one) or
// the extension is installed or updated, so those are when it runs; the
// notice also asks for a fresh check before it shows.
import * as LumnoBrowserProfile from '../platform/browser-profile';
import { getGraphicsSettingsUrl as getSettingsUrlFor, probeGraphicsRendering } from '../platform/graphics-acceleration';
import { graphicsProbe } from '../domain/settings/features';
import type { GraphicsRendering } from '../domain/settings/features';
import { workerSettings } from './worker-context';

export function refreshGraphicsProbe(): Promise<GraphicsRendering> {
  // Firefox has no settings page an extension may open for this.
  if (LumnoBrowserProfile.isFirefoxExtensionRuntime(chrome) || typeof OffscreenCanvas !== 'function') {
    return Promise.resolve('unknown');
  }
  const gpu = typeof navigator !== 'undefined' ? Reflect.get(navigator, 'gpu') : null;
  return probeGraphicsRendering(() => new OffscreenCanvas(1, 1), gpu).then((rendering) => {
    // The probe runs again at the next browser start when this fails.
    workerSettings.set(graphicsProbe, { rendering, checkedAt: Date.now() }).catch(() => {});
    return rendering;
  });
}

export function getGraphicsSettingsUrl(): string {
  const profile = LumnoBrowserProfile.getBrowserInternalProfile(typeof navigator !== 'undefined' ? navigator : null);
  return getSettingsUrlFor(profile.scheme);
}
