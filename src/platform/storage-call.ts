// One call to an area that answers like chrome.storage: through the
// callback, or through the promise it returns when it has no callback.
import type { StorageChromeApi } from './settings-storage';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && 'then' in value && typeof value.then === 'function';
}

// Runs the call `start` makes with `done` as its callback, and settles with
// its result, or with the error Chrome leaves in runtime.lastError.
function callStorage(
  chromeApi: StorageChromeApi | null | undefined,
  start: (done: (result?: unknown) => void) => unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (result?: unknown): void => {
      if (settled) return;
      settled = true;
      const error = chromeApi && chromeApi.runtime && chromeApi.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(result);
    };
    try {
      const request = start(done);
      if (isThenable(request)) request.then(done, reject);
    } catch (error) { reject(error); }
  });
}

export { callStorage, isRecord, isThenable };
