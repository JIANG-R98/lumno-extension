// Fetching the help center's search index and synonym list for a language
// (domain/search/help-center-search.ts parses and searches them). One cached
// copy per language; a failed load is forgotten so the next query retries.
import { normalizeIndex } from '../domain/search/help-center-search';
import type { HelpIndexDoc } from '../domain/search/help-center-search';

// The parts of a Response the loader reads.
interface IndexResponse {
  ok?: boolean;
  json?: () => unknown;
}

interface IndexLoaderOptions<T> {
  fetchImpl?: (url: string, init?: { signal: AbortSignal }) => IndexResponse | Promise<IndexResponse>;
  // Turns the response into what is cached (normalizeSynonyms for search-synonyms.json).
  parse?: (payload: unknown) => T;
  // The clock, for tests.
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

interface IndexLoader<T> {
  // Without a fetch, every load gives an empty list.
  load(url: unknown): Promise<T | never[]>;
}

const INDEX_CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;

// Parses the help center index unless given another parse.
function createIndexLoader(options?: (IndexLoaderOptions<HelpIndexDoc[]> & { parse?: undefined }) | null): IndexLoader<HelpIndexDoc[]>;
function createIndexLoader<T>(options: IndexLoaderOptions<T> & { parse: (payload: unknown) => T }): IndexLoader<T>;
function createIndexLoader(options?: IndexLoaderOptions<unknown> | null): IndexLoader<unknown> {
  const config: IndexLoaderOptions<unknown> = options && typeof options === 'object' ? options : {};
  const fetchImpl = config.fetchImpl;
  const parse = typeof config.parse === 'function' ? config.parse : normalizeIndex;
  const now = typeof config.now === 'function' ? config.now : () => Date.now();
  const ttlMs = Number.isFinite(Number(config.ttlMs)) ? Number(config.ttlMs) : INDEX_CACHE_TTL_MS;
  const timeoutMs = Number.isFinite(Number(config.timeoutMs)) ? Number(config.timeoutMs) : FETCH_TIMEOUT_MS;
  const cache = new Map<string, { loadedAt: number; promise: Promise<unknown> }>();

  function load(url: unknown): Promise<unknown> {
    const key = String(url || '');
    const cached = cache.get(key);
    if (cached && now() - cached.loadedAt < ttlMs) {
      return cached.promise;
    }
    if (typeof fetchImpl !== 'function' || !key) {
      return Promise.resolve([]);
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : 0;
    const promise: Promise<unknown> = Promise.resolve(fetchImpl(key, controller ? { signal: controller.signal } : undefined))
      .then((response) => {
        if (!response || !response.ok || typeof response.json !== 'function') {
          throw new Error('help center index unavailable');
        }
        return response.json();
      })
      .then(parse)
      .catch((error: unknown) => {
        const entry = cache.get(key);
        if (entry && entry.promise === promise) {
          cache.delete(key);
        }
        throw error;
      })
      .finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
    cache.set(key, { loadedAt: now(), promise });
    return promise;
  }

  return Object.freeze({ load });
}

export { INDEX_CACHE_TTL_MS, createIndexLoader };
export type { IndexLoader, IndexLoaderOptions, IndexResponse };
