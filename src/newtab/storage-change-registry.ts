// One storage listener for the New Tab page. Each part of the page
// registers the keys it owns; a change runs the handlers whose keys it
// carries, in the order they were registered.
//
// `area` says which storage area a handler listens to: 'primary' (the
// area settings live in, sync or local; the default), 'local', 'any', or
// a predicate on the area name.
import type { StorageChanges } from '../domain/storage-port';

type StorageAreaMatch = 'primary' | 'local' | 'any' | ((areaName: string) => boolean);

// Returns whether it acted on the change; the registry does not read it.
type StorageChangeHandler = (changes: StorageChanges, areaName: string) => unknown;

interface StorageChangeHandlerOptions {
  area?: StorageAreaMatch;
}

interface RegisteredHandler {
  // null runs for every change.
  keys: string[] | null;
  handler: StorageChangeHandler;
  area: StorageAreaMatch;
}

function createStorageChangeRegistry(options?: { isPrimaryArea?: (areaName: string) => boolean }) {
  const opts = options || {};
  const isPrimaryArea = typeof opts.isPrimaryArea === 'function'
    ? opts.isPrimaryArea
    : (areaName: string) => areaName === 'sync';
  const handlers: RegisteredHandler[] = [];

  function matchesArea(area: StorageAreaMatch, areaName: string): boolean {
    if (typeof area === 'function') return Boolean(area(areaName));
    if (area === 'any') return true;
    if (area === 'local') return areaName === 'local';
    return isPrimaryArea(areaName);
  }

  function register(keys: string[] | null, handler: StorageChangeHandler, registerOptions?: StorageChangeHandlerOptions): void {
    if (typeof handler !== 'function') {
      return;
    }
    handlers.push({
      keys,
      handler,
      area: registerOptions && registerOptions.area ? registerOptions.area : 'primary'
    });
  }

  // `handler(changes, areaName)` runs when the change carries any of `keys`.
  function on(keys: string | readonly string[], handler: StorageChangeHandler, registerOptions?: StorageChangeHandlerOptions): void {
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean).map(String);
    if (list.length) {
      register(list, handler, registerOptions);
    }
  }

  // `handler(changes, areaName)` runs for every change in its area.
  function onAny(handler: StorageChangeHandler, registerOptions?: StorageChangeHandlerOptions): void {
    register(null, handler, registerOptions);
  }

  function dispatch(changes: StorageChanges | null | undefined, areaName: string): void {
    if (!changes) {
      return;
    }
    handlers.forEach((entry) => {
      if (!matchesArea(entry.area, areaName)) {
        return;
      }
      if (entry.keys && !entry.keys.some((key) => Object.hasOwn(changes, key))) {
        return;
      }
      try {
        entry.handler(changes, areaName);
      } catch (error) {
        // One part of the page failing to apply a change must not keep the
        // rest from seeing it.
        console.error('[Lumno] Storage change handler failed.', error);
      }
    });
  }

  return { on, onAny, dispatch };
}

type StorageChangeRegistry = ReturnType<typeof createStorageChangeRegistry>;

export { createStorageChangeRegistry };
export type { StorageChangeHandler, StorageChangeHandlerOptions, StorageChangeRegistry };
