// Registers the picture-in-picture page bridge (content/pip-page-bridge.ts)
// as a main-world content script on the sites the automatic
// picture-in-picture scripts cover, so it is in the page before they ask it
// to leave picture-in-picture. Those sites come from the manifest's own
// content script entries; a build without them (Firefox) registers nothing.
import { createContentScriptRegistration } from './content-script-registration';
import type { ContentScriptRegistration, RegistrationChromeApi } from './content-script-registration';

const SCRIPT_ID = 'lumno-pip-page-bridge';
const SCRIPT_FILES: readonly string[] = Object.freeze(['build/pip-page-bridge.js']);
const AUTO_PIP_SCRIPT_FILES: readonly string[] = Object.freeze([
  'build/site-auto-pip.js',
  'build/youtube-auto-pip.js'
]);

// The match patterns of the manifest entries that load an automatic
// picture-in-picture script, without duplicates, in manifest order.
function readAutoPipMatches(manifest: chrome.runtime.Manifest | null | undefined): string[] {
  const entries = manifest && Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  const matches: string[] = [];
  entries.forEach((entry) => {
    const files = Array.isArray(entry.js) ? entry.js : [];
    if (!files.some((file) => AUTO_PIP_SCRIPT_FILES.includes(file))) {
      return;
    }
    (Array.isArray(entry.matches) ? entry.matches : []).forEach((pattern) => {
      if (!matches.includes(pattern)) {
        matches.push(pattern);
      }
    });
  });
  return matches;
}

function createPipPageBridgeRegistration(options: {
  chromeApi?: RegistrationChromeApi | null;
  manifest: chrome.runtime.Manifest | null | undefined;
}): Readonly<ContentScriptRegistration> & { readonly matches: readonly string[] } {
  const matches = readAutoPipMatches(options.manifest);
  const registration = createContentScriptRegistration({
    chromeApi: options.chromeApi,
    spec: {
      id: SCRIPT_ID,
      files: SCRIPT_FILES,
      matches,
      runAt: 'document_start',
      allFrames: false,
      world: 'MAIN'
    }
  });
  return Object.freeze({
    matches,
    // With no sites to cover, any registration left behind is removed.
    sync: (enabled: unknown) => registration.sync(Boolean(enabled) && matches.length > 0)
  });
}

export { SCRIPT_ID, SCRIPT_FILES, readAutoPipMatches, createPipPageBridgeRegistration };
