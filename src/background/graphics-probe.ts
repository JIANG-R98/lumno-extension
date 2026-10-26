// Checks whether the browser draws with the GPU and stores the answer, so New
// Tab and the overlay can suggest graphics acceleration when it does not. The
// answer only changes when the browser restarts (the setting needs one) or
// the extension is installed or updated, so those are when it runs; the
// notice also asks for a fresh check before it shows.
//
// A module of the service worker; background.ts imports it before its own code
// runs.
import * as LumnoBrowserProfile from '../platform/browser-profile';
import * as GRAPHICS from '../platform/graphics-acceleration';
import type { GraphicsRendering } from '../platform/graphics-acceleration';

export function refreshGraphicsProbe(): Promise<GraphicsRendering> {
  // Firefox has no settings page an extension may open for this.
  if (LumnoBrowserProfile.isFirefoxExtensionRuntime(chrome) || typeof OffscreenCanvas !== 'function') {
    return Promise.resolve('unknown');
  }
  const gpu = typeof navigator !== 'undefined' ? Reflect.get(navigator, 'gpu') : null;
  return GRAPHICS.probeGraphicsRendering(() => new OffscreenCanvas(1, 1), gpu).then((rendering) => {
    GRAPHICS.setStoredGraphicsProbe(chrome, rendering);
    return rendering;
  });
}

export function getGraphicsSettingsUrl(): string {
  const profile = LumnoBrowserProfile.getBrowserInternalProfile(typeof navigator !== 'undefined' ? navigator : null);
  return GRAPHICS.getGraphicsSettingsUrl(profile.scheme);
}
