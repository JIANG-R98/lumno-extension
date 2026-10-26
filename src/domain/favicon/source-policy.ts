// Which icon sources a page may use, given the resolver's options and the
// extension it runs in.
import { getExtensionFaviconUrl, getFaviconResolverSize, getFaviconServiceSiteUrl, getOwnExtensionRuntimeInfo } from './candidate-urls';
import { getCanonicalPageUrlForFavicon, getFaviconPersistCacheKey, getPageUrlFromFaviconProxyUrl } from './canonical';
import { isFaviconSourceAllowedByEnhancedFetchPolicy } from './enhanced-fetch-policy';
import { getFaviconUrlPolicy, isBlockedLocalFaviconUrl, shouldAvoidDirectFaviconForHost, shouldBlockDirectFaviconHost, shouldBlockFaviconForHost } from './host-policy';
import type { FaviconResolverDependencies, FaviconResolverOptions, FaviconSourceOptions, FaviconSourcePolicy, RuntimeUrlGetter } from './types';
import { isBrowserExtensionProtocol, isChromeMonogramFaviconUrl, isFaviconIsUrl, isFaviconProxyUrl, isOriginScopedFaviconProxyUrl, isSafeVirtualFaviconRequestUrl } from './url-kinds';

// Reads the caller's hooks once; every resolver piece below shares this view.
function getFaviconResolverDependencies(options?: FaviconResolverOptions | null): Readonly<FaviconResolverDependencies> {
  const config = options || {};
  const runtime = config.chromeApi && config.chromeApi.runtime;
  const runtimeGetUrl = runtime && runtime.getURL;
  const getRuntimeUrl: RuntimeUrlGetter | null = config.getRuntimeUrl ||
    (runtime && runtimeGetUrl ? runtimeGetUrl.bind(runtime) : null);
  const isEnhancedFaviconFetchEnabled = config.isEnhancedFaviconFetchEnabled || (() => true);
  return Object.freeze({
    config,
    size: getFaviconResolverSize(config),
    getRuntimeUrl,
    ownExtensionRuntime: getOwnExtensionRuntimeInfo(config, getRuntimeUrl),
    hostPolicyOptions: Object.freeze({
      shouldBlockFaviconForHost: config.shouldBlockFaviconForHost || shouldBlockFaviconForHost,
      shouldAvoidDirectFaviconForHost: config.shouldAvoidDirectFaviconForHost || shouldAvoidDirectFaviconForHost
    }),
    isBlockedLocalFaviconUrl: config.isBlockedLocalFaviconUrl || isBlockedLocalFaviconUrl,
    customExtensionFaviconUrl: config.getExtensionFaviconUrl || null,
    customBrowserPageFaviconUrl: config.getBrowserPageFaviconUrl || null,
    customGstaticFaviconUrl: config.getGstaticFaviconUrl || null,
    customChromeFaviconUrl: config.getChromeFaviconUrl || null,
    isEnhancedFaviconFetchEnabled,
    getStrictFaviconReason: config.getStrictFaviconReason ||
      ((pageUrl: string) => isEnhancedFaviconFetchEnabled(pageUrl) === true ? '' : 'global-off'),
    logFaviconDecision: config.logFaviconDecision || (() => {})
  });
}

function getCanonicalFaviconPage(pageUrl: unknown): string {
  const raw = String(pageUrl || '').trim();
  if (!raw) {
    return '';
  }
  return getCanonicalPageUrlForFavicon(raw) || raw;
}

function isOwnExtensionPageUrl(pageUrl: unknown, ownExtensionId: string): boolean {
  if (!ownExtensionId) {
    return false;
  }
  try {
    const parsed = new URL(String(pageUrl || '').trim());
    return isBrowserExtensionProtocol(parsed.protocol) &&
      String(parsed.hostname || '') === String(ownExtensionId) &&
      !String(parsed.pathname || '').toLowerCase().startsWith('/_favicon/');
  } catch (e) {
    return false;
  }
}

function isOtherExtensionPageUrl(pageUrl: unknown, ownExtensionId: string): boolean {
  try {
    const parsed = new URL(String(pageUrl || '').trim());
    return isBrowserExtensionProtocol(parsed.protocol) &&
      (!ownExtensionId || String(parsed.hostname || '') !== String(ownExtensionId));
  } catch (e) {
    return false;
  }
}

// A proxy or virtual favicon request only belongs to the page it names.
// Favicon.is is an explicitly selected domain source, never an automatic
// replacement for the exact-page browser or Gstatic candidates.
function isFaviconRequestForOtherPage(
  url: string,
  targetPage: string,
  requestPage: string,
  sourceOptions: FaviconSourceOptions | null | undefined
): boolean {
  if (!/^https?:\/\//i.test(targetPage) ||
      !(isFaviconProxyUrl(url) || isSafeVirtualFaviconRequestUrl(url))) {
    return false;
  }
  const domainMatch = Boolean(sourceOptions && sourceOptions.allowDomainProxy === true &&
    isFaviconIsUrl(url) && requestPage &&
    new URL(requestPage).hostname === new URL(targetPage).hostname);
  const originMatch = Boolean(requestPage && isOriginScopedFaviconProxyUrl(url) &&
    getFaviconServiceSiteUrl(requestPage) === requestPage &&
    getFaviconServiceSiteUrl(targetPage) === requestPage);
  return !domainMatch && !originMatch &&
    (!requestPage || getFaviconPersistCacheKey(requestPage) !== getFaviconPersistCacheKey(targetPage));
}

// Normalize older Chrome sources as well as newly generated URLs.
function normalizeVirtualFaviconRequestUrl(parsed: URL, requestPage: string): string {
  parsed.searchParams.set('pageUrl', requestPage);
  parsed.searchParams.delete('url');
  parsed.searchParams.delete('domain_url');
  parsed.searchParams.set('fallbackToHost', '0');
  return parsed.toString();
}

// Enhanced-fetch, host and local-URL rules that every resolver candidate passes.
function createFaviconSourcePolicy(deps: Readonly<FaviconResolverDependencies>): Readonly<FaviconSourcePolicy> {
  const pageHostPolicyOptions = Object.freeze({
    shouldBlockFaviconForHost: deps.hostPolicyOptions.shouldBlockFaviconForHost,
    shouldAvoidDirectFaviconForHost: () => false
  });

  function isSourceAllowedByEnhancedFetchPolicy(url: string, pageUrl: string, sourceOptions: FaviconSourceOptions | null | undefined): boolean {
    const policyPageUrl = getCanonicalFaviconPage(pageUrl || url);
    return isFaviconSourceAllowedByEnhancedFetchPolicy(url, deps.isEnhancedFaviconFetchEnabled(policyPageUrl), {
      chromeApi: deps.config.chromeApi,
      ownExtensionId: deps.ownExtensionRuntime.id,
      allowThirdPartyFetch: deps.getStrictFaviconReason(policyPageUrl) !== 'exclusion',
      allowRemoteImage: Boolean(sourceOptions && sourceOptions.allowRemoteImage === true)
    });
  }

  function logBlockedFaviconUrl(url: string, reason: string, policyPageUrl: string, candidateKind: string | undefined): void {
    deps.logFaviconDecision(url, reason, {
      pageUrl: policyPageUrl,
      candidateKind
    });
  }

  function isBlockedFaviconPageUrl(pageUrl: unknown): boolean {
    return getFaviconUrlPolicy(pageUrl, pageHostPolicyOptions).hardBlocked;
  }

  function isBlockedFaviconUrl(url: unknown, pageUrl?: unknown, candidateKind?: string, sourceOptions?: FaviconSourceOptions | null): boolean {
    const raw = String(url || '').trim();
    if (!raw) {
      return false;
    }
    const policyPageUrl = getCanonicalFaviconPage(pageUrl || raw);
    if (!isSourceAllowedByEnhancedFetchPolicy(raw, policyPageUrl, sourceOptions)) {
      logBlockedFaviconUrl(raw, deps.getStrictFaviconReason(policyPageUrl) || 'unapproved-source',
        policyPageUrl, candidateKind);
      return true;
    }
    const policy = getFaviconUrlPolicy(raw, deps.hostPolicyOptions);
    if (policy.hardBlocked || policy.avoidDirect) {
      logBlockedFaviconUrl(raw, 'local-rule', policyPageUrl, candidateKind);
      return true;
    }
    const blocked = Boolean(deps.isBlockedLocalFaviconUrl(raw, policyPageUrl));
    if (blocked) {
      logBlockedFaviconUrl(raw, 'local-rule', policyPageUrl, candidateKind);
    }
    return blocked;
  }

  function getSafeFaviconCandidateUrl(value: unknown, pageUrl?: unknown, candidateKind?: string, sourceOptions?: FaviconSourceOptions | null): string {
    const raw = String(value || '').trim();
    if (isOtherExtensionPageUrl(pageUrl, deps.ownExtensionRuntime.id)) {
      return '';
    }
    if (!raw || isBlockedFaviconUrl(raw, pageUrl, candidateKind, sourceOptions)) {
      return '';
    }
    if (raw.startsWith('data:')) {
      return raw;
    }
    try {
      const parsed = new URL(raw);
      const targetPage = getCanonicalFaviconPage(pageUrl);
      const requestPage = getPageUrlFromFaviconProxyUrl(raw);
      if (isFaviconRequestForOtherPage(raw, targetPage, requestPage, sourceOptions)) {
        return '';
      }
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
          shouldBlockDirectFaviconHost(parsed.hostname, deps.hostPolicyOptions)) {
        return '';
      }
      if (isChromeMonogramFaviconUrl(raw) && requestPage) {
        return getSafeFaviconCandidateUrl(
          getExtensionFaviconUrl(requestPage, { getRuntimeUrl: deps.getRuntimeUrl, size: deps.size }),
          pageUrl,
          candidateKind,
          sourceOptions
        );
      }
      if (isSafeVirtualFaviconRequestUrl(raw) && requestPage) {
        return normalizeVirtualFaviconRequestUrl(parsed, requestPage);
      }
      return raw;
    } catch (e) {
      return '';
    }
  }

  return Object.freeze({
    isBlockedFaviconPageUrl,
    isBlockedFaviconUrl,
    getSafeFaviconCandidateUrl
  });
}

export {
  createFaviconSourcePolicy,
  getCanonicalFaviconPage,
  getFaviconResolverDependencies,
  isFaviconRequestForOtherPage,
  isOtherExtensionPageUrl,
  isOwnExtensionPageUrl,
  normalizeVirtualFaviconRequestUrl
};
