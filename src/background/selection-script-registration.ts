// The selection toolbar is off by default, so its scripts are registered as
// a content script only while it is on instead of loading into every page
// from the manifest. Turning it on also injects it into pages already open,
// which the manifest entry used to cover; turning it off leaves running
// copies to hide themselves through their own storage listener.
import { createContentScriptRegistration } from './content-script-registration';
import type { ContentScriptRegistration, RegistrationChromeApi } from './content-script-registration';

const SCRIPT_ID = 'lumno-selection-quick-actions';
const SCRIPT_FILES: readonly string[] = Object.freeze(['build/selection-quick-actions.js']);
const RUN_AT = 'document_idle';

function createSelectionScriptRegistration(
  options?: { chromeApi?: RegistrationChromeApi | null } | null
): Readonly<ContentScriptRegistration> {
  return createContentScriptRegistration({
    chromeApi: options ? options.chromeApi : null,
    spec: {
      id: SCRIPT_ID,
      files: SCRIPT_FILES,
      matches: ['<all_urls>'],
      runAt: RUN_AT,
      allFrames: false,
      injectableUrlPattern: /^(https?|file):/i
    }
  });
}

export { SCRIPT_ID, SCRIPT_FILES, RUN_AT, createSelectionScriptRegistration };
export type { RegistrationChromeApi, ContentScriptRegistration as SelectionScriptRegistration };
