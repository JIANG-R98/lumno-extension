// The tab each source opens with, and the result of a run.
import type { AggregateSearchOpenOptions, AggregateSearchResult, ProviderPlan } from './types';

function createResult(overrides: Partial<AggregateSearchResult>): AggregateSearchResult {
  return {
    ok: false,
    requestedCount: 0,
    openedCount: 0,
    failedCount: 0,
    unavailableSourceCount: 0,
    grouped: false,
    groupId: null,
    groupTitleApplied: false,
    activatedTabId: null,
    activationDeferred: false,
    activationDelayMs: 0,
    interactiveRequestedCount: 0,
    interactiveSucceededCount: 0,
    interactiveFailedCount: 0,
    reason: '',
    warnings: [],
    ...overrides
  };
}

function isSafeSearchUrl(value: unknown): boolean {
  const raw = String(value || '').trim();
  if (!raw) {
    return false;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (_error) {
    return false;
  }
}

function buildProviderPlans(options: AggregateSearchOpenOptions, query: string): ProviderPlan[] {
  const providers = Array.isArray(options.providers) ? options.providers : [];
  const getEntryUrl = typeof options.getEntryUrl === 'function'
    ? options.getEntryUrl
    : () => '';
  const isInteractiveProvider = typeof options.isInteractiveProvider === 'function'
    ? options.isInteractiveProvider
    : () => false;
  return providers.map((provider) => {
    let url = '';
    try {
      url = String(getEntryUrl(provider, query) || '').trim();
    } catch (_error) {
      url = '';
    }
    if (!isSafeSearchUrl(url)) {
      url = '';
    }
    return {
      provider,
      url,
      interactive: Boolean(isInteractiveProvider(provider))
    };
  });
}

export {
  buildProviderPlans,
  createResult,
  isSafeSearchUrl
};
