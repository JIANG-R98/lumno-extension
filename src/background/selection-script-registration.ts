// The selection toolbar is off by default, so its scripts are registered as
// a content script only while it is on instead of loading into every page
// from the manifest. Turning it on also injects it into pages already open,
// which the manifest entry used to cover; turning it off leaves running
// copies to hide themselves through their own storage listener.
// A registered content script, as chrome.scripting describes it.
interface RegisteredScript {
  id: string;
  matches?: string[];
  js?: string[];
  runAt?: string;
  allFrames?: boolean;
  persistAcrossSessions?: boolean;
}

// The callback-style chrome.scripting methods the registration uses.
interface ScriptingApi {
  getRegisteredContentScripts(filter: { ids: string[] }, callback: (scripts: RegisteredScript[]) => void): void;
  registerContentScripts(scripts: RegisteredScript[], callback: () => void): void;
  updateContentScripts(scripts: RegisteredScript[], callback: () => void): void;
  unregisterContentScripts(filter: { ids: string[] }, callback: () => void): void;
  executeScript(injection: { target: { tabId: number }; files: string[] }, callback: () => void): void;
}

interface RegistrationChromeApi {
  scripting?: Partial<ScriptingApi>;
  tabs?: { query?(queryInfo: Record<never, never>, callback: (tabs: chrome.tabs.Tab[]) => void): void };
  runtime?: { lastError?: { message?: string } | null };
}

interface SelectionScriptRegistration {
  // Registers or removes the script; resolves whether it is registered.
  sync(enabled: unknown, syncOptions?: { injectOpenTabs?: boolean } | null): Promise<boolean>;
}

const SCRIPT_ID = 'lumno-selection-quick-actions';
const SCRIPT_FILES: readonly string[] = Object.freeze(['build/selection-quick-actions.js']);
const RUN_AT = 'document_idle';
const INJECTABLE_URL_PATTERN = /^(https?|file):/i;

function createSelectionScriptRegistration(options?: { chromeApi?: RegistrationChromeApi | null } | null): Readonly<SelectionScriptRegistration> {
  const config = options || {};
  const chromeApi = config.chromeApi;
  const scripting = chromeApi && chromeApi.scripting;
  let queue: Promise<boolean> = Promise.resolve(false);

  function readLastError(): { message?: string } | null | undefined {
    return chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
  }

  // Runs one scripting call; resolves with its result (true when it has
  // none), or null when it failed or the API is missing.
  function call<R>(start: ((done: (result?: R) => void) => void) | null): Promise<R | true | null> {
    return new Promise((resolve) => {
      if (!start) {
        resolve(null);
        return;
      }
      try {
        start((result) => {
          resolve(readLastError() ? null : (result === undefined ? true : result));
        });
      } catch (_error) {
        resolve(null);
      }
    });
  }

  function isCurrent(registered: RegisteredScript | null | undefined): boolean {
    if (!registered) {
      return false;
    }
    return Array.isArray(registered.js) &&
      registered.js.join('\n') === SCRIPT_FILES.join('\n') &&
      registered.runAt === RUN_AT &&
      registered.allFrames !== true;
  }

  function queryOpenTabs(): Promise<chrome.tabs.Tab[]> {
    return new Promise((resolve) => {
      const tabsApi = chromeApi && chromeApi.tabs;
      if (!tabsApi || typeof tabsApi.query !== 'function') {
        resolve([]);
        return;
      }
      tabsApi.query({}, (tabs) => {
        resolve(!readLastError() && Array.isArray(tabs) ? tabs : []);
      });
    });
  }

  async function injectIntoOpenTabs(): Promise<void> {
    const tabs = await queryOpenTabs();
    const execute = scripting && scripting.executeScript;
    await Promise.all(tabs.map((tab) => {
      const tabId = tab && tab.id;
      if (typeof tabId !== 'number' || !INJECTABLE_URL_PATTERN.test(String(tab.url || ''))) {
        return null;
      }
      return call<void>(execute && scripting
        ? (done) => execute.call(scripting, { target: { tabId }, files: SCRIPT_FILES.slice() }, done)
        : null);
    }));
  }

  async function apply(enabled: boolean, applyOptions: { injectOpenTabs?: boolean }): Promise<boolean> {
    const getRegistered = scripting && scripting.getRegisteredContentScripts;
    const registeredList = await call<RegisteredScript[]>(getRegistered && scripting
      ? (done) => getRegistered.call(scripting, { ids: [SCRIPT_ID] }, done)
      : null);
    const registered = Array.isArray(registeredList) ? registeredList[0] : null;
    if (!enabled) {
      const unregister = scripting && scripting.unregisterContentScripts;
      if (registered) {
        await call<void>(unregister && scripting ? (done) => unregister.call(scripting, { ids: [SCRIPT_ID] }, done) : null);
      }
      return false;
    }
    const script: RegisteredScript = {
      id: SCRIPT_ID,
      matches: ['<all_urls>'],
      js: SCRIPT_FILES.slice(),
      runAt: RUN_AT,
      allFrames: false,
      persistAcrossSessions: true
    };
    const register = scripting && scripting.registerContentScripts;
    const update = scripting && scripting.updateContentScripts;
    if (!registered) {
      await call<void>(register && scripting ? (done) => register.call(scripting, [script], done) : null);
    } else if (!isCurrent(registered)) {
      await call<void>(update && scripting ? (done) => update.call(scripting, [script], done) : null);
    }
    if (applyOptions && applyOptions.injectOpenTabs) {
      await injectIntoOpenTabs();
    }
    return true;
  }

  function sync(enabled: unknown, syncOptions?: { injectOpenTabs?: boolean } | null): Promise<boolean> {
    queue = queue.then(() => apply(Boolean(enabled), syncOptions || {})).catch(() => false);
    return queue;
  }

  return Object.freeze({ sync });
}

export { SCRIPT_ID, SCRIPT_FILES, RUN_AT, createSelectionScriptRegistration };
export type { RegistrationChromeApi, SelectionScriptRegistration };
