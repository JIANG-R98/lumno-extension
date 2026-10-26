import { getFaviconUrlHostCandidate } from './host-policy';
import { createPageFaviconCandidates, createShortcutFaviconCandidates } from './page-candidates';
import { createFaviconSourcePolicy, getCanonicalFaviconPage, getFaviconResolverDependencies } from './source-policy';
import { createFaviconSourceUrls } from './source-urls';
import type { FaviconPlanCandidate, FaviconPlanState, FaviconProxyCheckKind, FaviconResolverOptions, FaviconSourcePolicy, FaviconSourceUrls } from './types';
import { isBrowserInternalPageUrl, isSafeVirtualFaviconRequestUrl } from './url-kinds';

// Lower runs first: local and data: icons, then an opted-in remote primary,
// then virtual browser-cache requests, then remote proxies.
function getFaviconCandidateSourcePriority(candidate: FaviconPlanCandidate, allowRemotePrimary: boolean): number {
  if (!/^https?:\/\//i.test(candidate.url) && !isSafeVirtualFaviconRequestUrl(candidate.url)) {
    return candidate.url.startsWith('data:') ? 1 : 0;
  }
  if (allowRemotePrimary && candidate.kind === 'primary') {
    return 1;
  }
  return isSafeVirtualFaviconRequestUrl(candidate.url) ? 2 : 3;
}

function createFaviconCandidatePlanBuilder(
  policy: Readonly<FaviconSourcePolicy>,
  sources: Readonly<FaviconSourceUrls>
): (state?: FaviconPlanState | null) => FaviconPlanCandidate[] {
  // Every source the plan may use, most specific first. A full-page
  // resolution is more specific than host-scoped browser and persisted
  // caches, which may legitimately collapse sibling URLs.
  function listPlanCandidates(input: FaviconPlanState, pageUrl: string): FaviconPlanCandidate[] {
    const browserUrl = String(input.browserUrl || '').trim() ||
      (pageUrl && isBrowserInternalPageUrl(pageUrl) ? sources.getChromeFaviconUrl(pageUrl) : '');
    const persistedCandidates: FaviconPlanCandidate[] = input.skipPersisted === true
      ? []
      : [
        { kind: 'persisted-data', url: input.persistedDataUrl || '' },
        { kind: 'persisted-url', url: input.persistedUrl || '' }
      ];
    return [
      { kind: 'page-specific', url: input.pageSpecificUrl || '' },
      ...persistedCandidates,
      { kind: 'primary', url: input.primaryUrl || input.fallbackUrl || '' },
      { kind: 'extension', url: input.extensionFavicon || input.extensionUrl || sources.getExtensionFaviconUrl(pageUrl) },
      { kind: 'browser', url: browserUrl },
      { kind: 'gstatic', url: input.gstaticFavicon || input.gstaticUrl || sources.getGstaticFaviconUrl(pageUrl) }
    ];
  }

  return function buildFaviconCandidatePlan(state?: FaviconPlanState | null): FaviconPlanCandidate[] {
    const input = state || {};
    const pageUrl = getCanonicalFaviconPage(input.pageUrl || input.url || '');
    const allowRemotePrimary = input.allowRemoteImage === true;
    const rawCandidates = listPlanCandidates(input, pageUrl);
    const seen = new Set<string>();
    const candidates = rawCandidates.filter((candidate) => {
      const safeUrl = policy.getSafeFaviconCandidateUrl(candidate.url, pageUrl, candidate.kind,
        { allowRemoteImage: allowRemotePrimary && candidate.kind === 'primary' });
      const isLiveShortcutSource = input.sourceProfile === 'shortcut' && /^https?:\/\//i.test(pageUrl) &&
        (/^https?:\/\//i.test(safeUrl) || isSafeVirtualFaviconRequestUrl(safeUrl));
      if (!safeUrl || isLiveShortcutSource || seen.has(safeUrl)) {
        return false;
      }
      seen.add(safeUrl);
      candidate.url = safeUrl;
      return true;
    });
    return candidates.sort((left, right) =>
      getFaviconCandidateSourcePriority(left, allowRemotePrimary) -
      getFaviconCandidateSourcePriority(right, allowRemotePrimary));
  };
}

function getFaviconProxyCheckKind(candidate: Partial<FaviconPlanCandidate> | null | undefined): FaviconProxyCheckKind {
  if (!candidate || !candidate.url) {
    return '';
  }
  if (candidate.kind === 'extension') {
    return 'extension';
  }
  if (candidate.kind === 'gstatic') {
    return 'gstatic';
  }
  if (candidate.kind !== 'primary' && candidate.kind !== 'page-specific' && candidate.kind !== 'persisted-url') {
    return '';
  }
  const url = String(candidate.url || '').trim();
  if (/^chrome-extension:\/\/[^/]+\/_favicon\//i.test(url)) {
    return 'extension';
  }
  if (/^https:\/\/[^/]*gstatic\.(?:com|cn)\/favicon/i.test(url)) {
    return 'gstatic';
  }
  return '';
}

function createFaviconUrlResolver(options?: FaviconResolverOptions | null) {
  const deps = getFaviconResolverDependencies(options);
  const policy = createFaviconSourcePolicy(deps);
  const sources = createFaviconSourceUrls(deps, policy.getSafeFaviconCandidateUrl);
  const pageCandidates = createPageFaviconCandidates(deps, policy, sources);
  const shortcutCandidates = createShortcutFaviconCandidates(
    policy,
    sources,
    pageCandidates.getPageFaviconCandidateUrl
  );

  return Object.freeze({
    buildFaviconCandidatePlan: createFaviconCandidatePlanBuilder(policy, sources),
    getBrowserPageFaviconUrl: sources.getBrowserPageFaviconUrl,
    getChromeFaviconUrl: sources.getChromeFaviconUrl,
    getExtensionFaviconUrl: sources.getExtensionFaviconUrl,
    getFaviconProxyCheckKind,
    getFaviconUrlHostCandidate,
    getGstaticFaviconUrl: sources.getGstaticFaviconUrl,
    getPageFaviconCandidateUrl: pageCandidates.getPageFaviconCandidateUrl,
    getPageFaviconRenderCandidates: pageCandidates.getPageFaviconRenderCandidates,
    getProviderFaviconUrl: pageCandidates.getProviderFaviconUrl,
    getShortcutFaviconCandidateUrl: shortcutCandidates.getShortcutFaviconCandidateUrl,
    getShortcutFaviconFetchUrl: shortcutCandidates.getShortcutFaviconFetchUrl,
    getShortcutFaviconFetchCandidates: shortcutCandidates.getShortcutFaviconFetchCandidates,
    getSafeFaviconCandidateUrl: policy.getSafeFaviconCandidateUrl,
    resolveFaviconSource: pageCandidates.resolveFaviconSource,
    isBlockedFaviconPageUrl: policy.isBlockedFaviconPageUrl,
    isBlockedFaviconUrl: policy.isBlockedFaviconUrl,
    isBrowserInternalPageUrl
  });
}

type FaviconUrlResolver = ReturnType<typeof createFaviconUrlResolver>;

export {
  createFaviconCandidatePlanBuilder,
  createFaviconUrlResolver,
  getFaviconCandidateSourcePriority,
  getFaviconProxyCheckKind
};
export type {
  FaviconUrlResolver
};
