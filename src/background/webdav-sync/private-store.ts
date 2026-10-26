// The extension-origin IndexedDB store for credentials and baselines, and
// the cache of what each server supports.
import type { WebDavConnection } from '../webdav-client';
import { DB_NAME, PROBE_CACHE_MS } from './constants';
import type { PrivateStore, ProbeCache, ProbeCapabilities } from './types';

function createPrivateStore(indexedDB: IDBFactory): Required<PrivateStore> {
  async function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('entries');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('private-storage-unavailable'));
    });
  }
  async function operation(method: 'get' | 'put' | 'delete', key: string, value?: unknown): Promise<unknown> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('entries', method === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('entries');
      const request: IDBRequest = method === 'get' ? store.get(key) : method === 'delete' ? store.delete(key) : store.put(value, key);
      let result: unknown;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error('private-storage-unavailable')); };
    });
  }
  return { get: (key) => operation('get', key), put: (key, value) => operation('put', key, value),
    delete: (key) => operation('delete', key) };
}
// Capabilities from an explicit test are reused briefly by the following
// enable, so testing and then saving does not repeat the destructive probe.
function createProbeCache(now?: () => number): ProbeCache {
  const entries = new Map<string, { at: number; capabilities: ProbeCapabilities }>();
  const clock = now || Date.now;
  const keyOf = (revision: string, config: WebDavConnection): string => (
    [revision, config.endpoint, config.directory, config.username, config.password].join('\n')
  );
  return {
    get(revision, config) {
      const entry = entries.get(keyOf(revision, config));
      if (!entry || clock() - entry.at > PROBE_CACHE_MS) return null;
      return entry.capabilities;
    },
    set(revision, config, capabilities) {
      entries.set(keyOf(revision, config), { at: clock(), capabilities });
    }
  };
}

export {
  createPrivateStore,
  createProbeCache
};
