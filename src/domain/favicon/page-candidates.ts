import { getFaviconIsUrl } from './candidate-urls';
import { getCanonicalFaviconPage, isOtherExtensionPageUrl } from './source-policy';
import type { FaviconResolverDependencies, FaviconSourcePolicy, FaviconSourceUrls, PageFaviconCandidateOptions, PageFaviconCandidates, PageFaviconRenderCandidates, ShortcutFaviconCandidates, ShortcutFetchCandidate } from './types';
import { isBrowserInternalPageUrl, isFaviconProxyUrl, isSafeVirtualFaviconRequestUrl } from './url-kinds';

// Picks what a page's favicon renders as: an explicit icon, the browser's
// cached icon, or a proxy fallback.
function createPageFaviconCandidates(
  deps: Readonly<FaviconResolverDependencies>,
  policy: Readonly<FaviconSourcePolicy>,
  sources: Readonly<FaviconSourceUrls>
): Readonly<PageFaviconCandidates> {
  const { getSafeFaviconCandidateUrl } = policy;
  const isOtherExtensionPage = (pageUrl: string): boolean => isOtherExtensionPageUrl(pageUrl, deps.ownExtensionRuntime.id);

  function getPageFaviconCandidateUrl(pageUrl: unknown, candidateOptions?: PageFaviconCandidateOptions | null): string {
    const candidateConfig = candidateOptions || {};
    const page = getCanonicalFaviconPage(pageUrl);
    if (!page) {
      return '';
    }
    const ownExtensionFavicon = sources.getOwnExtensionFaviconUrl(page);
    if (ownExtensionFavicon) {
      return getSafeFaviconCandidateUrl(ownExtensionFavicon, page, 'lumno-asset');
    }
    if (isOtherExtensionPage(page)) {
      return '';
    }
    if (isBrowserInternalPageUrl(page)) {
      return getSafeFaviconCandidateUrl(sources.getBrowserPageFaviconUrl(page), page, 'browser-cache') ||
        getSafeFaviconCandidateUrl(sources.getChromeFaviconUrl(page), page, 'browser-favicon');
    }
    if (/^https?:\/\//i.test(page)) {
      return getSafeFaviconCandidateUrl(sources.getExtensionFaviconUrl(page), page, 'browser-cache') ||
        (candidateConfig.includeChromeForHttp
          ? getSafeFaviconCandidateUrl(sources.getChromeFaviconUrl(page), page, 'browser-favicon')
          : '') ||
        getSafeFaviconCandidateUrl(sources.getGstaticFaviconUrl(page), page, 'third-party-proxy');
    }
    return candidateConfig.includeChromeForNonHttp === false
      ? ''
      : getSafeFaviconCandidateUrl(sources.getChromeFaviconUrl(page), page, 'browser-favicon');
  }

  function getDistinctFallbackUrl(url: string, primaryUrl: string): string {
    const safeUrl = getSafeFaviconCandidateUrl(url);
    return safeUrl && safeUrl !== primaryUrl ? safeUrl : '';
  }

  // A local or custom icon the page set, then the page's own favicon.
  function webPagePrimaryUrl(page: string, explicitFavicon: string, candidateConfig: PageFaviconCandidateOptions): string {
    const localOrCustomIcon = explicitFavicon &&
      (!/^https?:\/\//i.test(explicitFavicon) || candidateConfig.allowRemoteImage === true)
      ? explicitFavicon : '';
    return localOrCustomIcon || getPageFaviconCandidateUrl(page) || explicitFavicon || '';
  }

  function usesChromeFallback(page: string, candidateConfig: PageFaviconCandidateOptions): boolean {
    return candidateConfig.includeChromeFallback === true ||
      (!/^https?:\/\//i.test(page) && candidateConfig.includeChromeForNonHttp !== false);
  }

  function getPageFaviconRenderCandidates(
    pageUrl: unknown,
    explicitUrl?: unknown,
    candidateOptions?: PageFaviconCandidateOptions | null
  ): PageFaviconRenderCandidates {
    const candidateConfig = candidateOptions || {};
    const page = getCanonicalFaviconPage(pageUrl);
    const explicitFavicon = getSafeFaviconCandidateUrl(explicitUrl, page, 'explicit', candidateConfig);
    if (!page) {
      return {
        primaryUrl: explicitFavicon,
        browserUrl: ''
      };
    }

    if (isOtherExtensionPage(page)) {
      return { primaryUrl: '', browserUrl: '' };
    }
    const ownExtensionFavicon = sources.getOwnExtensionFaviconUrl(page);
    if (ownExtensionFavicon) {
      return {
        primaryUrl: getSafeFaviconCandidateUrl(ownExtensionFavicon, page, 'lumno-asset'),
        browserUrl: ''
      };
    }
    const browserPageFavicon = getSafeFaviconCandidateUrl(sources.getBrowserPageFaviconUrl(page), page, 'browser-cache');
    const chromeFavicon = getSafeFaviconCandidateUrl(sources.getChromeFaviconUrl(page), page, 'browser-favicon');
    const isInternalPage = isBrowserInternalPageUrl(page);
    const primaryUrl = isInternalPage
      ? (browserPageFavicon || explicitFavicon || chromeFavicon || '')
      : webPagePrimaryUrl(page, explicitFavicon, candidateConfig);
    const shouldUseChromeFallback = isInternalPage || usesChromeFallback(page, candidateConfig);

    return {
      primaryUrl,
      browserUrl: shouldUseChromeFallback ? getDistinctFallbackUrl(chromeFavicon, primaryUrl) : ''
    };
  }

  // Automatic sources (including tab.favIconUrl and persisted URLs) never
  // load a website image directly. Only an explicitly configured image may
  // opt in, and it still follows the enhanced-fetch and host policies.
  function resolveFaviconSource(value: unknown, pageUrl: unknown, sourceOptions?: PageFaviconCandidateOptions | null): string {
    return getPageFaviconRenderCandidates(pageUrl, value, sourceOptions).primaryUrl;
  }

  function getProviderFaviconUrl(pageUrl: unknown, iconUrl: unknown): string {
    return resolveFaviconSource(iconUrl, pageUrl, { allowRemoteImage: !isFaviconProxyUrl(iconUrl) });
  }

  return Object.freeze({
    getPageFaviconCandidateUrl,
    getPageFaviconRenderCandidates,
    resolveFaviconSource,
    getProviderFaviconUrl
  });
}

function isShortcutFetchCandidateForIconSource(candidate: ShortcutFetchCandidate, iconSource: unknown): boolean {
  if (iconSource === 'service') {
    return candidate.kind === 'proxy';
  }
  if (iconSource === 'cache') {
    return candidate.kind === 'browser-cache';
  }
  return true;
}

// Shortcut tiles keep only local icons and fetch site icons through the
// browser cache or a proxy instead of loading them directly.
function createShortcutFaviconCandidates(
  policy: Readonly<FaviconSourcePolicy>,
  sources: Readonly<FaviconSourceUrls>,
  getPageFaviconCandidateUrl: PageFaviconCandidates['getPageFaviconCandidateUrl']
): Readonly<ShortcutFaviconCandidates> {
  const { getSafeFaviconCandidateUrl } = policy;

  function getShortcutFaviconCandidateUrl(pageUrl: unknown, localIconUrl?: unknown): string {
    const page = getCanonicalFaviconPage(pageUrl);
    if (!/^https?:\/\//i.test(page)) {
      return getPageFaviconCandidateUrl(page);
    }
    const localIcon = getSafeFaviconCandidateUrl(localIconUrl, page, 'shortcut-local');
    return localIcon && !/^https?:\/\//i.test(localIcon) && !isSafeVirtualFaviconRequestUrl(localIcon)
      ? localIcon : '';
  }

  function getShortcutFaviconFetchUrl(pageUrl: unknown): string {
    const page = getCanonicalFaviconPage(pageUrl);
    try {
      const parsed = new URL(page);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      parsed.hash = '';
      return getSafeFaviconCandidateUrl(sources.getGstaticFaviconUrl(parsed.href), page, 'shortcut-proxy');
    } catch (e) {
      return '';
    }
  }

  function getShortcutFaviconFetchCandidates(pageUrl: unknown, iconSource?: unknown): ShortcutFetchCandidate[] {
    const page = getCanonicalFaviconPage(pageUrl);
    if (!/^https?:\/\//i.test(page) || policy.isBlockedFaviconPageUrl(page)) {
      return [];
    }
    if (iconSource === 'favicon-is') {
      const url = getSafeFaviconCandidateUrl(getFaviconIsUrl(page), page, 'shortcut-favicon-is', { allowDomainProxy: true });
      return url ? [{ kind: 'favicon-is', url, placeholderUrl: getFaviconIsUrl('https://lumno.invalid/') }] : [];
    }
    const placeholderPage = 'https://lumno.invalid/__favicon_placeholder_probe__';
    const candidates: ShortcutFetchCandidate[] = [
      {
        kind: 'browser-cache',
        url: getSafeFaviconCandidateUrl(
          sources.getExtensionFaviconUrl(page, { browserCacheRequest: true }),
          page,
          'shortcut-browser-snapshot'
        ),
        placeholderUrl: sources.getExtensionFaviconUrl(placeholderPage)
      },
      {
        kind: 'proxy',
        url: getShortcutFaviconFetchUrl(page),
        placeholderUrl: sources.getGstaticFaviconUrl('https://lumno.invalid/')
      }
    ];
    return candidates.filter((candidate) => candidate.url && isShortcutFetchCandidateForIconSource(candidate, iconSource));
  }

  return Object.freeze({
    getShortcutFaviconCandidateUrl,
    getShortcutFaviconFetchUrl,
    getShortcutFaviconFetchCandidates
  });
}

export {
  createPageFaviconCandidates,
  createShortcutFaviconCandidates,
  isShortcutFetchCandidateForIconSource
};
