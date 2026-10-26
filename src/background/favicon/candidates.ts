// Favicon candidate URLs for a page, within what the host policy and the
// request blacklist allow.
import '../browser-urls-service';
import * as FAVICON_CACHE from '../../platform/favicon-cache';
import { faviconEnhancedFetchEnabled } from '../../domain/settings';
import { areBackgroundSettingsLoaded, warnBackgroundFailure, workerSettings } from '../worker-context';
import type { FaviconCacheRuntime } from '../../platform/favicon-cache';
import * as FaviconDecisionLog from '../../domain/favicon/decision-log';
import * as FaviconHostPolicy from '../../domain/favicon/host-policy';
import * as FaviconResolver from '../../domain/favicon/resolver';
import type { FaviconUrlResolver } from '../../domain/favicon/resolver';
import type * as FaviconTypes from '../../domain/favicon/types';
import * as FaviconUrlKinds from '../../domain/favicon/url-kinds';

import { isUrlBlockedByFaviconRequestBlacklist, loadFaviconEnhancedFetchEnabled, loadFaviconRequestBlacklistItems } from './request-policy';
import type { FaviconTargetPolicy, ScoredCandidate } from './types';

const logBackgroundFaviconDecision = FaviconDecisionLog.createFaviconDecisionLogger({ surface: 'background' });


const FAVICON_PROXY_SIZE = 128;

let backgroundFaviconUrlResolver: FaviconUrlResolver | null = null;


let backgroundFaviconCacheRuntime: FaviconCacheRuntime | null = null;


function logBlockedLocalFavicon(url: unknown, candidateKind?: string, reason?: string, pageUrl?: unknown): boolean | void {
  return logBackgroundFaviconDecision(url, reason || 'local-rule', {
    pageUrl: String(pageUrl || url || ''),
    candidateKind: candidateKind || 'unknown'
  });
}

function getBackgroundFaviconCacheRuntime(): FaviconCacheRuntime {
  if (!backgroundFaviconCacheRuntime) {
    backgroundFaviconCacheRuntime = FAVICON_CACHE.createFaviconCache({
      storageArea: (chrome && chrome.storage && chrome.storage.local) ? chrome.storage.local : null,
      windowObj: globalThis,
      normalizeFaviconHost,
      isBlockedLocalFaviconUrl,
      isChromeMonogramFaviconUrl: FaviconUrlKinds.isChromeMonogramFaviconUrl
    });
    if (backgroundFaviconCacheRuntime &&
        typeof backgroundFaviconCacheRuntime.ensureCachesReady === 'function') {
      backgroundFaviconCacheRuntime.ensureCachesReady()
        .catch(warnBackgroundFailure('Failed to load the favicon caches.'));
    }
  }
  return backgroundFaviconCacheRuntime;
}

// Enhanced fetching stays off until the stored choice is known.
function isFaviconEnhancedFetchKnownEnabled(): boolean {
  return areBackgroundSettingsLoaded() && workerSettings.get(faviconEnhancedFetchEnabled);
}

function getBackgroundFaviconUrlResolver(): FaviconUrlResolver {
  if (!backgroundFaviconUrlResolver) {
    backgroundFaviconUrlResolver = FaviconResolver.createFaviconUrlResolver({
      chromeApi: chrome,
      size: FAVICON_PROXY_SIZE,
      shouldBlockFaviconForHost,
      shouldAvoidDirectFaviconForHost,
      isEnhancedFaviconFetchEnabled: (pageUrl) => (
        isFaviconEnhancedFetchKnownEnabled() &&
        !isUrlBlockedByFaviconRequestBlacklist(pageUrl)
      ),
      getStrictFaviconReason: (pageUrl) => {
        if (isUrlBlockedByFaviconRequestBlacklist(pageUrl)) {
          return 'exclusion';
        }
        if (!isFaviconEnhancedFetchKnownEnabled()) {
          return 'global-off';
        }
        return '';
      },
      logFaviconDecision: logBackgroundFaviconDecision
    });
  }
  return backgroundFaviconUrlResolver;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function getExtensionFaviconUrl(pageUrl: unknown): string {
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.getExtensionFaviconUrl(pageUrl) : '';
}

function isBrowserInternalPageUrl(url: unknown): boolean {
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.isBrowserInternalPageUrl(url) : false;
}

function getGstaticFaviconUrl(pageUrl: unknown): string {
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.getGstaticFaviconUrl(pageUrl) : '';
}

function getPageFaviconCandidateUrl(pageUrl: unknown): string {
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.getPageFaviconCandidateUrl(pageUrl) : '';
}

function getHostFaviconUrl(hostname: unknown): string {
  const normalized = normalizeFaviconHost(hostname);
  if (!normalized) {
    return '';
  }
  if (normalized === 'lumno.kubai.design') {
    return (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function')
      ? chrome.runtime.getURL('assets/images/lumno.png')
      : 'https://lumno.kubai.design/favicon.png';
  }
  return getGstaticFaviconUrl(`https://${normalized}/`);
}

function isFaviconProxyUrl(url: unknown): boolean {
  return FaviconUrlKinds.isFaviconProxyUrl(url);
}

function getFaviconFallbackHost(rawInput: unknown): string {
  const withoutScheme = String(rawInput || '').replace(/^https?:\/\//i, '');
  const authority = withoutScheme.split(/[/?#]/)[0] || '';
  if (!authority) {
    return '';
  }
  if (authority.startsWith('[')) {
    const endBracket = authority.indexOf(']');
    if (endBracket > 1) {
      return authority.slice(1, endBracket).toLowerCase();
    }
    return '';
  }
  if (authority.includes('::') && !authority.includes('.')) {
    return authority.toLowerCase();
  }
  return (authority.split(':')[0] || '').toLowerCase();
}

function shouldBlockFaviconForHost(hostname: unknown): boolean {
  return FaviconHostPolicy.shouldBlockFaviconForHost(hostname);
}

function shouldAvoidDirectFaviconForHost(hostname: unknown): boolean {
  return FaviconHostPolicy.shouldAvoidDirectFaviconForHost(hostname);
}

function isAllowedFaviconProxyRequestUrl(url: unknown): boolean {
  return FaviconHostPolicy.isAllowedFaviconProxyRequestUrl(url);
}

function isFaviconRequestBlockedByBlacklist(url: unknown): boolean {
  return !isAllowedFaviconProxyRequestUrl(url) && isUrlBlockedByFaviconRequestBlacklist(url);
}

function isBlockedLocalFaviconUrl(url: unknown): boolean {
  const blockedByLocalRules = FaviconHostPolicy.isBlockedLocalFaviconUrl(url);
  return blockedByLocalRules || isFaviconRequestBlockedByBlacklist(url);
}

function getFaviconHostPolicy(hostname: unknown): FaviconTypes.FaviconHostPolicy {
  return FaviconHostPolicy.getFaviconHostPolicy(hostname, {
    shouldBlockFaviconForHost,
    shouldAvoidDirectFaviconForHost
  });
}

function getFaviconTargetPolicy(targetUrl: unknown, hostOverride: unknown): FaviconTargetPolicy {
  const inputUrl = String(targetUrl || '').trim();
  if (!inputUrl) {
    return { ok: false, inputUrl: '', parsed: null };
  }
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch (_error) {
    return { ok: false, inputUrl, parsed: null };
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return { ok: false, inputUrl, parsed };
  }
  const hosts = [parsed.hostname, hostOverride].filter(Boolean);
  const policies = hosts.map((host) => getFaviconHostPolicy(host));
  const hardBlocked = policies.some((policy) => policy.hardBlocked);
  const avoidDirect = policies.some((policy) => policy.avoidDirect);
  const requestBlacklisted = isUrlBlockedByFaviconRequestBlacklist(inputUrl);
  return {
    ok: true,
    inputUrl,
    parsed,
    normalizedHost: normalizeFaviconHost(hostOverride || parsed.hostname),
    hardBlocked,
    avoidDirect,
    requestBlacklisted,
    directFetchBlocked: requestBlacklisted || hardBlocked || avoidDirect
  };
}

function normalizeFaviconHost(hostname: unknown): string {
  return FaviconUrlKinds.normalizeFaviconHost(hostname);
}


function buildFaviconFallbackCandidates(
  pageUrl: string,
  hostOverride: unknown,
  options?: { allowThirdPartyFetch?: boolean; targetPolicy?: FaviconTargetPolicy } | null
): ScoredCandidate[] {
  const candidates: ScoredCandidate[] = [];
  const inputUrl = String(pageUrl || '').trim();
  const settings = options && typeof options === 'object' ? options : {};
  const targetPolicy = settings.targetPolicy || getFaviconTargetPolicy(inputUrl, hostOverride);
  if (targetPolicy.ok && targetPolicy.hardBlocked) {
    return [];
  }
  if (inputUrl) {
    candidates.push({ url: getExtensionFaviconUrl(inputUrl), score: 30 });
    if (settings.allowThirdPartyFetch === true) {
      candidates.push({ url: getGstaticFaviconUrl(inputUrl), score: 20 });
    }
  }
  return candidates.filter((item) => item && item.url);
}

function dedupeAndSortFaviconCandidates(candidates: readonly ScoredCandidate[]): string[] {
  const byUrl = new Map<string, ScoredCandidate>();
  candidates.forEach((item) => {
    if (!item || !item.url) {
      return;
    }
    const key = String(item.url);
    const current = byUrl.get(key);
    if (!current || Number(item.score || 0) > Number(current.score || 0)) {
      byUrl.set(key, { url: key, score: Number(item.score || 0) });
    }
  });
  return Array.from(byUrl.values())
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url);
}

function resolveFaviconCandidates(targetUrl: unknown, hostOverride: unknown, fallbackUrl?: unknown): Promise<string[]> {
  const inputUrl = String(targetUrl || '').trim();
  if (!inputUrl) {
    return Promise.resolve([]);
  }
  return Promise.all([
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled()
  ]).then(([, enhancedFetchEnabled]) => {
    const targetPolicy = getFaviconTargetPolicy(inputUrl, hostOverride);
    if (!targetPolicy.ok) {
      return [];
    }
    if (targetPolicy.hardBlocked) {
      logBlockedLocalFavicon(inputUrl, 'resolveFaviconCandidates');
      return [];
    }
    const strictReason = targetPolicy.requestBlacklisted
      ? 'exclusion'
      : (!enhancedFetchEnabled ? 'global-off' : '');
    if (strictReason) {
      if (fallbackUrl) {
        logBlockedLocalFavicon(fallbackUrl, 'direct', strictReason, inputUrl);
      }
      if (targetPolicy.requestBlacklisted) {
        logBlockedLocalFavicon(getGstaticFaviconUrl(inputUrl), 'third-party-proxy', strictReason, inputUrl);
      }
    }
    return dedupeAndSortFaviconCandidates(buildFaviconFallbackCandidates(inputUrl, hostOverride, {
      allowThirdPartyFetch: !targetPolicy.requestBlacklisted,
      targetPolicy
    }));
  });
}

export {
  FAVICON_PROXY_SIZE,
  arrayBufferToBase64,
  backgroundFaviconCacheRuntime,
  backgroundFaviconUrlResolver,
  buildFaviconFallbackCandidates,
  dedupeAndSortFaviconCandidates,
  getBackgroundFaviconCacheRuntime,
  getBackgroundFaviconUrlResolver,
  getExtensionFaviconUrl,
  getFaviconFallbackHost,
  getFaviconHostPolicy,
  getFaviconTargetPolicy,
  getGstaticFaviconUrl,
  getHostFaviconUrl,
  getPageFaviconCandidateUrl,
  isAllowedFaviconProxyRequestUrl,
  isBlockedLocalFaviconUrl,
  isBrowserInternalPageUrl,
  isFaviconEnhancedFetchKnownEnabled,
  isFaviconProxyUrl,
  isFaviconRequestBlockedByBlacklist,
  logBackgroundFaviconDecision,
  logBlockedLocalFavicon,
  normalizeFaviconHost,
  resolveFaviconCandidates,
  shouldAvoidDirectFaviconForHost,
  shouldBlockFaviconForHost
};
