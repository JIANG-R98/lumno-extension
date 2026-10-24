// The worker's reply to runAggregateSearchQuery.
interface AggregateSearchResponse {
  ok?: boolean;
  reason?: string;
  failedCount?: number;
  interactiveFailedCount?: number;
  warnings?: unknown[];
  activationDeferred?: boolean;
  activationDelayMs?: number;
}

interface FeedbackDescriptor {
  fallback: string;
  isError: boolean;
  messageKey: string;
}

type MaybeResponse = AggregateSearchResponse | null | undefined;

// The part of the extension API the controller sends its request through.
interface RuntimePort {
  runtime?: {
    sendMessage?: (message: object, callback: (response?: AggregateSearchResponse) => void) => void;
    lastError?: unknown;
  };
}

interface RequestControllerOptions {
  chromeApi?: RuntimePort | null;
  onFeedback?: (descriptor: FeedbackDescriptor, response: MaybeResponse, runtimeError: unknown) => void;
}

interface AggregateSearchRequest {
  aggregateId?: string;
  query?: string;
  disposition?: string;
}

interface RequestCallbacks {
  onDuplicate?: (response: AggregateSearchResponse) => void;
  onFailure?: (response: MaybeResponse, runtimeError: unknown) => void;
  onSuccess?: (response: AggregateSearchResponse) => void;
}

interface RequestRun {
  duplicate: boolean;
  started: boolean;
  key?: string;
}

const PARTIAL_FEEDBACK_DELAY_MS = 2300;
const RESULT_FAILURE_WARNING_CODES = new Set([
  'partial-tab-create-failure',
  'interactive-submit-failed'
]);

function hasPartialFailure(response: MaybeResponse): boolean {
  return Boolean(response && response.ok === true && (
    Number(response.failedCount) > 0 ||
    Number(response.interactiveFailedCount) > 0 ||
    (Array.isArray(response.warnings) && response.warnings.some(
      (warning) => RESULT_FAILURE_WARNING_CODES.has(String(warning || ''))
    ))
  ));
}

function hasAncillaryWarning(response: MaybeResponse): boolean {
  return Boolean(
    response &&
    response.ok === true &&
    !hasPartialFailure(response) &&
    Array.isArray(response.warnings) &&
    response.warnings.length > 0
  );
}

function hasSuccessFeedback(response: MaybeResponse): boolean {
  return hasPartialFailure(response) || hasAncillaryWarning(response);
}

function getSuccessFeedbackDelayMs(response: MaybeResponse): number {
  const activationDelayMs = response && response.activationDeferred === true
    ? Math.max(0, Number(response.activationDelayMs) || 0)
    : 0;
  if (activationDelayMs > 0) {
    return activationDelayMs;
  }
  return hasSuccessFeedback(response) ? PARTIAL_FEEDBACK_DELAY_MS : 0;
}

function getResponseDescriptor(response: MaybeResponse, runtimeError?: unknown): FeedbackDescriptor {
  const reason = String(response && response.reason ? response.reason : '');
  if (reason === 'aggregate-search-sources-unavailable' ||
      reason === 'aggregate-search-not-found') {
    return {
      fallback: 'This aggregate search contains removed or disabled sources. Update it in Settings.',
      isError: true,
      messageKey: 'aggregate_search_sources_unavailable_error'
    };
  }
  if (reason === 'aggregate-search-request-in-progress') {
    return {
      fallback: 'This aggregate search is already running.',
      isError: false,
      messageKey: 'aggregate_search_in_progress'
    };
  }
  if (!runtimeError && hasPartialFailure(response)) {
    return {
      fallback: 'Some aggregate search results could not be opened.',
      isError: true,
      messageKey: 'aggregate_search_partial_failure'
    };
  }
  if (!runtimeError && hasAncillaryWarning(response)) {
    return {
      fallback: 'Search results opened, but tab grouping, naming, or focus could not be completed.',
      isError: false,
      messageKey: 'aggregate_search_degraded_success'
    };
  }
  return {
    fallback: 'Operation failed. Please try again.',
    isError: true,
    messageKey: 'toast_error'
  };
}

function createAggregateSearchRequestController(rawOptions?: RequestControllerOptions) {
  const options: RequestControllerOptions = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const chromeApi = options.chromeApi || null;
  const onFeedback = typeof options.onFeedback === 'function'
    ? options.onFeedback
    : () => {};
  const pending = new Set<string>();

  function notify(response: MaybeResponse, runtimeError: unknown) {
    onFeedback(getResponseDescriptor(response, runtimeError), response || null, runtimeError || null);
  }

  function run(rawRequest?: AggregateSearchRequest | null, callbacks?: RequestCallbacks | null): RequestRun {
    const request: AggregateSearchRequest = rawRequest && typeof rawRequest === 'object' ? rawRequest : {};
    const aggregateId = String(request.aggregateId || '').trim();
    const query = String(request.query || '').trim();
    const disposition = String(request.disposition || 'currentTab');
    const handlers: RequestCallbacks = callbacks && typeof callbacks === 'object' ? callbacks : {};
    const runtime = chromeApi && chromeApi.runtime;
    const sendMessage = runtime && runtime.sendMessage;
    if (!aggregateId || !query || !runtime || typeof sendMessage !== 'function') {
      notify(null, new Error('aggregate-search-runtime-unavailable'));
      return { duplicate: false, started: false };
    }
    const requestKey = [aggregateId, query, disposition].join('\n');
    if (pending.has(requestKey)) {
      const duplicateResponse: AggregateSearchResponse = {
        ok: false,
        reason: 'aggregate-search-request-in-progress'
      };
      notify(duplicateResponse, null);
      if (typeof handlers.onDuplicate === 'function') {
        handlers.onDuplicate(duplicateResponse);
      }
      return { duplicate: true, key: requestKey, started: false };
    }

    pending.add(requestKey);
    const finish = (response?: AggregateSearchResponse) => {
      pending.delete(requestKey);
      const runtimeError = runtime.lastError ? runtime.lastError : null;
      if (runtimeError || !response || response.ok !== true) {
        notify(response, runtimeError);
        if (typeof handlers.onFailure === 'function') {
          handlers.onFailure(response || null, runtimeError);
        }
        return;
      }
      if (hasSuccessFeedback(response)) {
        notify(response, null);
      }
      if (typeof handlers.onSuccess === 'function') {
        handlers.onSuccess(response);
      }
    };

    try {
      sendMessage.call(runtime, {
        action: 'runAggregateSearchQuery',
        aggregateId,
        query,
        disposition
      }, finish);
    } catch (error) {
      pending.delete(requestKey);
      notify(null, error);
      if (typeof handlers.onFailure === 'function') {
        handlers.onFailure(null, error);
      }
      return { duplicate: false, key: requestKey, started: false };
    }
    return { duplicate: false, key: requestKey, started: true };
  }

  return Object.freeze({
    isPending(key: unknown) {
      return pending.has(String(key || ''));
    },
    run
  });
}

export {
  PARTIAL_FEEDBACK_DELAY_MS,
  createAggregateSearchRequestController,
  getSuccessFeedbackDelayMs,
  getResponseDescriptor,
  hasAncillaryWarning,
  hasSuccessFeedback,
  hasPartialFailure
};
export type { AggregateSearchResponse, FeedbackDescriptor };
