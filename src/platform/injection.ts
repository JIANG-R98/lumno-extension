// Runs the scripts the worker injects into web pages (domain/injected-commands.ts).
// Each one is an ES module: the worker imports it in the page and calls its
// run() with a command, and the browser keeps one instance of each module per
// page, so a second injection reaches the instance the first one loaded.
import { INJECTED_APP_PATHS } from '../domain/injected-commands';
import type { InjectedAppName } from '../domain/injected-commands';

interface RuntimeUrlApi {
  getURL(path: string): string;
}

// Runs in the page's isolated world, serialized on its own, so it uses
// nothing outside its body: imports every URL, then calls the last module's
// run() with the command. The others load alongside it for their effects,
// so a small one (the icon font preload) starts before a large one parses.
function loadInjectedApps(urls: string[], command: unknown): Promise<unknown> {
  return Promise.all(urls.map((url): Promise<unknown> => import(url))).then((modules) => {
    const app = modules[modules.length - 1];
    const run: unknown = app && typeof app === 'object' ? Reflect.get(app, 'run') : null;
    return typeof run === 'function' ? Reflect.apply(run, app, [command]) : { ok: false, reason: 'app-missing' };
  });
}

// The executeScript details that load `apps` in the tab (the last one runs
// the command) and resolve with what its run() returns.
function createInjectedAppRun(
  runtime: RuntimeUrlApi,
  target: chrome.scripting.InjectionTarget,
  apps: readonly InjectedAppName[],
  command: unknown,
  options?: { injectImmediately?: boolean } | null
): chrome.scripting.ScriptInjection<[string[], unknown], Promise<unknown>> {
  return {
    target,
    injectImmediately: Boolean(options && options.injectImmediately),
    func: loadInjectedApps,
    args: [apps.map((app) => runtime.getURL(INJECTED_APP_PATHS[app])), command]
  };
}

export { createInjectedAppRun, loadInjectedApps };
export type { RuntimeUrlApi };
