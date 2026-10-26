// Keeps one dynamically registered content script in step with whether it
// should run: registers it, updates a registration an older version left
// behind, or removes it. Optionally injects it into pages already open,
// which a registration only reaches on their next load.

// A registered content script, as chrome.scripting describes it.
interface RegisteredScript {
  id: string;
  matches?: string[];
  js?: string[];
  runAt?: string;
  allFrames?: boolean;
  world?: string;
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

// The script to keep registered.
interface ContentScriptSpec {
  id: string;
  files: readonly string[];
  matches: readonly string[];
  runAt: 'document_start' | 'document_end' | 'document_idle';
  allFrames: boolean;
  // Omitted for the isolated world, the default.
  world?: 'MAIN';
  // The open pages injectOpenTabs reaches.
  injectableUrlPattern?: RegExp;
}

interface ContentScriptRegistration {
  // Registers or removes the script; resolves whether it is registered.
  sync(enabled: unknown, syncOptions?: { injectOpenTabs?: boolean } | null): Promise<boolean>;
}

function sameList(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return Array.isArray(left) && left.join('\n') === right.join('\n');
}

function createContentScriptRegistration(options: {
  chromeApi?: RegistrationChromeApi | null;
  spec: ContentScriptSpec;
}): Readonly<ContentScriptRegistration> {
  const { chromeApi, spec } = options;
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
    return sameList(registered.js, spec.files) &&
      (registered.matches === undefined || sameList(registered.matches, spec.matches)) &&
      registered.runAt === spec.runAt &&
      (registered.allFrames === true) === spec.allFrames &&
      (registered.world || 'ISOLATED') === (spec.world || 'ISOLATED');
  }

  function toRegisteredScript(): RegisteredScript {
    const script: RegisteredScript = {
      id: spec.id,
      matches: spec.matches.slice(),
      js: spec.files.slice(),
      runAt: spec.runAt,
      allFrames: spec.allFrames,
      persistAcrossSessions: true
    };
    if (spec.world) {
      script.world = spec.world;
    }
    return script;
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
    const pattern = spec.injectableUrlPattern;
    if (!pattern) {
      return;
    }
    const tabs = await queryOpenTabs();
    const execute = scripting && scripting.executeScript;
    await Promise.all(tabs.map((tab) => {
      const tabId = tab && tab.id;
      if (typeof tabId !== 'number' || !pattern.test(String(tab.url || ''))) {
        return null;
      }
      return call<void>(execute && scripting
        ? (done) => execute.call(scripting, { target: { tabId }, files: spec.files.slice() }, done)
        : null);
    }));
  }

  async function apply(enabled: boolean, applyOptions: { injectOpenTabs?: boolean }): Promise<boolean> {
    const getRegistered = scripting && scripting.getRegisteredContentScripts;
    const registeredList = await call<RegisteredScript[]>(getRegistered && scripting
      ? (done) => getRegistered.call(scripting, { ids: [spec.id] }, done)
      : null);
    const registered = Array.isArray(registeredList) ? registeredList[0] : null;
    if (!enabled) {
      const unregister = scripting && scripting.unregisterContentScripts;
      if (registered) {
        await call<void>(unregister && scripting ? (done) => unregister.call(scripting, { ids: [spec.id] }, done) : null);
      }
      return false;
    }
    const script = toRegisteredScript();
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

export { createContentScriptRegistration };
export type { ContentScriptRegistration, ContentScriptSpec, RegisteredScript, RegistrationChromeApi };
