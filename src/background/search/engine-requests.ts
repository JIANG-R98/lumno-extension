// Suggestions from the default search engine: fetching them with a timeout,
// and the requests a prefetch starts and the query that follows consumes.
import * as SEARCH_UTILS from '../../domain/search/search-utils';
import type { MessageSender } from '../message-router';
import { getSuggestionSource } from '../../domain/search/suggestion-parsers';
import type { SuggestionResponseKind } from '../../domain/search/suggestion-parsers';
import type { EngineSuggestionRequest } from './types';
import { defaultSearchEngineStateReady, getDefaultSearchEngineId } from './default-engine';

function getSearchEngineSuggestionRequestKey(request: { context?: unknown } | null | undefined, sender: MessageSender | null | undefined): string {
  const senderTabId = sender && sender.tab && typeof sender.tab.id === 'number'
    ? sender.tab.id
    : 'extension';
  const senderFrameId = sender && typeof sender.frameId === 'number' ? sender.frameId : 0;
  const context = request && request.context ? String(request.context) : 'unknown';
  return `${senderTabId}:${senderFrameId}:${context}`;
}

const SEARCH_ENGINE_SUGGEST_TIMEOUT_MS = 900;

const SEARCH_ENGINE_SUGGEST_PREFETCH_DELAY_MS = 120;

const SEARCH_ENGINE_SUGGEST_PREFETCH_RETENTION_MS = 1500;

const searchEngineSuggestionRequests = new Map<string, EngineSuggestionRequest>();

// What a suggestion service answered, as JSON or as text; null or '' when
// it did not answer.
async function fetchSuggestionResponse(url: string, kind: SuggestionResponseKind, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    ...(signal ? { signal } : {})
  });
  if (!response || !response.ok) {
    return kind === 'json' ? null : '';
  }
  return kind === 'json' ? response.json() : response.text();
}

async function fetchSearchSuggestionsForEngine(query: string, options?: { signal?: AbortSignal } | null): Promise<unknown[]> {
  const source = getSuggestionSource(getDefaultSearchEngineId());
  // A URL, host or path (the prefilled current page among them) stays local.
  if (!query || !source || SEARCH_UTILS.isUrlLikeSearchQuery(query)) {
    return [];
  }
  try {
    const signal = options && options.signal ? options.signal : undefined;
    return source.read(await fetchSuggestionResponse(source.url(query), source.kind, signal));
  } catch (_error) {
    return [];
  }
}

async function fetchSearchEngineSuggestionsWithTimeout(query: string, externalSignal: AbortSignal | null | undefined): Promise<unknown[]> {
  if (externalSignal && externalSignal.aborted) {
    return [];
  }
  const requestController = new AbortController();
  const forwardExternalAbort = () => requestController.abort();
  if (externalSignal) {
    externalSignal.addEventListener('abort', forwardExternalAbort, { once: true });
  }
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<unknown[]>((resolve) => {
      timeoutId = setTimeout(() => {
        requestController.abort();
        resolve([]);
      }, SEARCH_ENGINE_SUGGEST_TIMEOUT_MS);
    });
    return await Promise.race([
      fetchSearchSuggestionsForEngine(query, { signal: requestController.signal }).catch(() => []),
      timeoutPromise
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    if (externalSignal) {
      externalSignal.removeEventListener('abort', forwardExternalAbort);
    }
  }
}

function shouldPrefetchSearchEngineSuggestions(
  request: { context?: unknown; sourceTypes?: unknown } | null | undefined,
  query: unknown
): boolean {
  const context = request && request.context ? String(request.context) : '';
  const normalizedQuery = String(query || '').trim();
  const sourceTypes = request ? request.sourceTypes : undefined;
  const isScopedLocalSearch = Array.isArray(sourceTypes) && sourceTypes.length > 0;
  return (context === 'newtab' || context === 'overlay') &&
    Boolean(normalizedQuery) &&
    !normalizedQuery.startsWith('/') &&
    !SEARCH_UTILS.isUrlLikeSearchQuery(normalizedQuery) &&
    !isScopedLocalSearch;
}

function clearSearchEngineSuggestionRequestTimers(record: EngineSuggestionRequest | null | undefined): void {
  if (!record) {
    return;
  }
  if (record.startTimer !== null) {
    clearTimeout(record.startTimer);
    record.startTimer = null;
  }
  if (record.releaseTimer !== null) {
    clearTimeout(record.releaseTimer);
    record.releaseTimer = null;
  }
}

function releaseSearchEngineSuggestionRequest(requestKey: string, record: EngineSuggestionRequest | null | undefined): void {
  if (!record || searchEngineSuggestionRequests.get(requestKey) !== record) {
    return;
  }
  clearSearchEngineSuggestionRequestTimers(record);
  searchEngineSuggestionRequests.delete(requestKey);
}

function abortSearchEngineSuggestionRequest(requestKey: string): void {
  const record = searchEngineSuggestionRequests.get(requestKey);
  if (!record) {
    return;
  }
  clearSearchEngineSuggestionRequestTimers(record);
  if (record.controller && !record.controller.signal.aborted) {
    record.controller.abort();
  }
  if (searchEngineSuggestionRequests.get(requestKey) === record) {
    searchEngineSuggestionRequests.delete(requestKey);
  }
}

function startSearchEngineSuggestionRequest(record: EngineSuggestionRequest | null | undefined): Promise<unknown[]> {
  if (!record) {
    return Promise.resolve([]);
  }
  if (record.promise) {
    return record.promise;
  }
  if (record.startTimer !== null) {
    clearTimeout(record.startTimer);
    record.startTimer = null;
  }
  const promise = Promise.resolve(defaultSearchEngineStateReady)
    .then((): unknown[] | Promise<unknown[]> => {
      if (record.controller.signal.aborted) {
        return [];
      }
      return fetchSearchEngineSuggestionsWithTimeout(record.query, record.controller.signal);
    })
    .catch((): unknown[] => []);
  record.promise = promise;
  void promise.then(() => {
    if (record.consumed ||
        searchEngineSuggestionRequests.get(record.requestKey) !== record ||
        record.releaseTimer !== null) {
      return;
    }
    record.releaseTimer = setTimeout(() => {
      releaseSearchEngineSuggestionRequest(record.requestKey, record);
    }, SEARCH_ENGINE_SUGGEST_PREFETCH_RETENTION_MS);
  });
  return promise;
}

function getOrCreateSearchEngineSuggestionRequest(
  requestKey: string,
  query: unknown,
  options?: { consume?: boolean; startImmediately?: boolean; delayMs?: number } | null
): EngineSuggestionRequest | null {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    abortSearchEngineSuggestionRequest(requestKey);
    return null;
  }
  const settings = options && typeof options === 'object' ? options : {};
  const existing = searchEngineSuggestionRequests.get(requestKey);
  if (existing && existing.query === normalizedQuery && !existing.controller.signal.aborted) {
    if (settings.consume === true) {
      existing.consumed = true;
      if (existing.releaseTimer !== null) {
        clearTimeout(existing.releaseTimer);
        existing.releaseTimer = null;
      }
    }
    if (settings.startImmediately === true) {
      void startSearchEngineSuggestionRequest(existing);
    }
    return existing;
  }
  if (existing) {
    abortSearchEngineSuggestionRequest(requestKey);
  }
  const record: EngineSuggestionRequest = {
    requestKey,
    query: normalizedQuery,
    controller: new AbortController(),
    startTimer: null,
    releaseTimer: null,
    promise: null,
    consumed: settings.consume === true
  };
  searchEngineSuggestionRequests.set(requestKey, record);
  const delayMs = Math.max(0, Number(settings.delayMs) || 0);
  if (delayMs > 0 && settings.startImmediately !== true) {
    record.startTimer = setTimeout(() => {
      record.startTimer = null;
      void startSearchEngineSuggestionRequest(record);
    }, delayMs);
  } else {
    void startSearchEngineSuggestionRequest(record);
  }
  return record;
}

function scheduleSearchEngineSuggestionPrefetch(requestKey: string, query: unknown): EngineSuggestionRequest | null {
  return getOrCreateSearchEngineSuggestionRequest(requestKey, query, {
    delayMs: SEARCH_ENGINE_SUGGEST_PREFETCH_DELAY_MS
  });
}

function consumeSearchEngineSuggestionRequest(requestKey: string, query: unknown): EngineSuggestionRequest | null {
  return getOrCreateSearchEngineSuggestionRequest(requestKey, query, {
    consume: true,
    startImmediately: true
  });
}


export {
  abortSearchEngineSuggestionRequest,
  consumeSearchEngineSuggestionRequest,
  fetchSearchEngineSuggestionsWithTimeout,
  getSearchEngineSuggestionRequestKey,
  releaseSearchEngineSuggestionRequest,
  scheduleSearchEngineSuggestionPrefetch,
  searchEngineSuggestionRequests,
  shouldPrefetchSearchEngineSuggestions,
  startSearchEngineSuggestionRequest
};
