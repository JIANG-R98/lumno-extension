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

interface RegistrationContext {
  readonly chromeApi: RegistrationChromeApi | null | undefined;
  readonly spec: ContentScriptSpec;
  readonly scripting: Partial<ScriptingApi> | null | undefined;
  queue: Promise<boolean>;
}

function readLastError(ctx: RegistrationContext): { message?: string } | null | undefined {
  return ctx.chromeApi && ctx.chromeApi.runtime ? ctx.chromeApi.runtime.lastError : null;
}

// Runs one scripting call; resolves with its result (true when it has
// none), or null when it failed or the API is missing.
function call<R>(ctx: RegistrationContext, start: ((done: (result?: R) => void) => void) | null): Promise<R | true | null> {
  return new Promise((resolve) => {
    if (!start) {
      resolve(null);
      return;
    }
    try {
      start((result) => {
        resolve(readLastError(ctx) ? null : (result === undefined ? true : result));
      });
    } catch (_error) {
      resolve(null);
    }
  });
}

function isCurrent(ctx: RegistrationContext, registered: RegisteredScript | null | undefined): boolean {
  if (!registered) {
    return false;
  }
  return sameList(registered.js, ctx.spec.files) &&
    (registered.matches === undefined || sameList(registered.matches, ctx.spec.matches)) &&
    registered.runAt === ctx.spec.runAt &&
    (registered.allFrames === true) === ctx.spec.allFrames &&
    (registered.world || 'ISOLATED') === (ctx.spec.world || 'ISOLATED');
}

function toRegisteredScript(ctx: RegistrationContext): RegisteredScript {
  const script: RegisteredScript = {
    id: ctx.spec.id,
    matches: ctx.spec.matches.slice(),
    js: ctx.spec.files.slice(),
    runAt: ctx.spec.runAt,
    allFrames: ctx.spec.allFrames,
    persistAcrossSessions: true
  };
  if (ctx.spec.world) {
    script.world = ctx.spec.world;
  }
  return script;
}

function queryOpenTabs(ctx: RegistrationContext): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => {
    const tabsApi = ctx.chromeApi && ctx.chromeApi.tabs;
    if (!tabsApi || typeof tabsApi.query !== 'function') {
      resolve([]);
      return;
    }
    tabsApi.query({}, (tabs) => {
      resolve(!readLastError(ctx) && Array.isArray(tabs) ? tabs : []);
    });
  });
}

async function injectIntoOpenTabs(ctx: RegistrationContext): Promise<void> {
  const pattern = ctx.spec.injectableUrlPattern;
  if (!pattern) {
    return;
  }
  const tabs = await queryOpenTabs(ctx);
  const execute = ctx.scripting && ctx.scripting.executeScript;
  await Promise.all(tabs.map((tab) => {
    const tabId = tab && tab.id;
    if (typeof tabId !== 'number' || !pattern.test(String(tab.url || ''))) {
      return null;
    }
    return call<void>(ctx, execute && ctx.scripting
      ? (done) => execute.call(ctx.scripting, { target: { tabId }, files: ctx.spec.files.slice() }, done)
      : null);
  }));
}

async function readRegistered(ctx: RegistrationContext): Promise<RegisteredScript | null> {
  const { scripting } = ctx;
  const getRegistered = scripting && scripting.getRegisteredContentScripts;
  const registeredList = await call<RegisteredScript[]>(ctx, getRegistered && scripting
    ? (done) => getRegistered.call(scripting, { ids: [ctx.spec.id] }, done)
    : null);
  return Array.isArray(registeredList) ? registeredList[0] : null;
}

async function unregister(ctx: RegistrationContext): Promise<void> {
  const { scripting } = ctx;
  const unregisterScripts = scripting && scripting.unregisterContentScripts;
  await call<void>(ctx, unregisterScripts && scripting
    ? (done) => unregisterScripts.call(scripting, { ids: [ctx.spec.id] }, done)
    : null);
}

// Registers the script, or updates a registration that no longer matches it.
async function registerCurrent(ctx: RegistrationContext, registered: RegisteredScript | null): Promise<void> {
  const { scripting } = ctx;
  const script = toRegisteredScript(ctx);
  if (!registered) {
    const register = scripting && scripting.registerContentScripts;
    await call<void>(ctx, register && scripting ? (done) => register.call(scripting, [script], done) : null);
  } else if (!isCurrent(ctx, registered)) {
    const update = scripting && scripting.updateContentScripts;
    await call<void>(ctx, update && scripting ? (done) => update.call(scripting, [script], done) : null);
  }
}

async function apply(ctx: RegistrationContext, enabled: boolean, applyOptions: { injectOpenTabs?: boolean }): Promise<boolean> {
  const registered = await readRegistered(ctx);
  if (!enabled) {
    if (registered) {
      await unregister(ctx);
    }
    return false;
  }
  await registerCurrent(ctx, registered);
  if (applyOptions && applyOptions.injectOpenTabs) {
    await injectIntoOpenTabs(ctx);
  }
  return true;
}

function sync(ctx: RegistrationContext, enabled: unknown, syncOptions?: { injectOpenTabs?: boolean } | null): Promise<boolean> {
  ctx.queue = ctx.queue.then(() => apply(ctx, Boolean(enabled), syncOptions || {})).catch(() => false);
  return ctx.queue;
}

function createContentScriptRegistration(options: {
  chromeApi?: RegistrationChromeApi | null;
  spec: ContentScriptSpec;
}): Readonly<ContentScriptRegistration> {
  const chromeApi = options.chromeApi;
  const spec = options.spec;
  const scripting = chromeApi && chromeApi.scripting;
  const ctx: RegistrationContext = {
    chromeApi,
    spec,
    scripting,
    queue: Promise.resolve(false)
  };

  return Object.freeze({ sync: (enabled: unknown, syncOptions?: { injectOpenTabs?: boolean } | null) => sync(ctx, enabled, syncOptions) });
}

export { createContentScriptRegistration };
export type { ContentScriptRegistration, ContentScriptSpec, RegisteredScript, RegistrationChromeApi };
