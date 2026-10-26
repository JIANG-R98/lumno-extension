// Modules the service worker loads on first use. A classic service worker can
// only load more code with importScripts(), which runs a classic script and
// returns nothing, so such a script hands its exports over through one
// registry on the worker's global object. This module is the only code that
// reads or writes that registry.

// What each lazily loaded script publishes.
interface WorkerLazyModules {
  // pinyin-pro's converter (background/pinyin-data.ts).
  pinyin: unknown;
}

type WorkerLazyModuleName = keyof WorkerLazyModules;

const REGISTRY_KEY = '__lumnoWorkerLazy';

function readRegistry(): Partial<Record<WorkerLazyModuleName, unknown>> {
  const registry: unknown = Reflect.get(globalThis, REGISTRY_KEY);
  if (registry && typeof registry === 'object') {
    return {
      pinyin: Reflect.get(registry, 'pinyin')
    };
  }
  return {};
}

// Called by a lazily loaded script with what it exports.
function publishWorkerLazyModule(name: WorkerLazyModuleName, value: unknown): void {
  const existing: unknown = Reflect.get(globalThis, REGISTRY_KEY);
  const registry: object = existing && typeof existing === 'object' ? existing : {};
  Reflect.set(registry, name, value);
  Reflect.set(globalThis, REGISTRY_KEY, registry);
}

// What a lazily loaded script published, or undefined before it ran. The
// value is unchecked: the caller narrows it.
function readWorkerLazyModule(name: WorkerLazyModuleName): unknown {
  return readRegistry()[name];
}

// Loads a lazily imported script once, then reads what it published.
// importScripts throws when the worker did not import the file while
// installing; the caller then works without it.
function loadWorkerLazyModule(
  name: WorkerLazyModuleName,
  scriptUrl: string,
  importScripts: ((...urls: string[]) => void) | null
): unknown {
  const published = readWorkerLazyModule(name);
  if (published !== undefined || !importScripts) {
    return published;
  }
  try {
    importScripts(scriptUrl);
  } catch (_error) {
    return undefined;
  }
  return readWorkerLazyModule(name);
}

export { loadWorkerLazyModule, publishWorkerLazyModule, readWorkerLazyModule };
export type { WorkerLazyModuleName };
