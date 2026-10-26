import { LUMNO_EXTENSION_ICON_PATH, getBrowserPageFaviconUrl, getChromeFaviconUrl, getExtensionFaviconUrl, getGstaticFaviconUrl, getOwnExtensionAssetUrl } from './candidate-urls';
import { getCanonicalFaviconPage, isOwnExtensionPageUrl } from './source-policy';
import type { FaviconResolverDependencies, FaviconSourcePolicy, FaviconSourceUrls } from './types';
import { isBrowserInternalPageUrl } from './url-kinds';

// Per-source favicon URLs for a page, preferring caller overrides when they
// pass the source policy.
function createFaviconSourceUrls(
  deps: Readonly<FaviconResolverDependencies>,
  getSafeFaviconCandidateUrl: FaviconSourcePolicy['getSafeFaviconCandidateUrl']
): Readonly<FaviconSourceUrls> {
  const { getRuntimeUrl, size } = deps;

  function getResolverExtensionFaviconUrl(pageUrl: unknown, options?: { browserCacheRequest?: boolean } | null): string {
    const page = getCanonicalFaviconPage(pageUrl);
    if (!page || !/^https?:\/\//i.test(page)) {
      return '';
    }
    if (deps.customExtensionFaviconUrl) {
      const configured = getSafeFaviconCandidateUrl(deps.customExtensionFaviconUrl(page), page, 'browser-cache');
      if (configured) {
        return configured;
      }
    }
    return getExtensionFaviconUrl(page, {
      getRuntimeUrl,
      size,
      browserCacheRequest: Boolean(options && options.browserCacheRequest === true)
    });
  }

  function getResolverBrowserPageFaviconUrl(pageUrl: unknown): string {
    const page = getCanonicalFaviconPage(pageUrl);
    if (!isBrowserInternalPageUrl(page)) {
      return '';
    }
    if (deps.customBrowserPageFaviconUrl) {
      const configured = String(deps.customBrowserPageFaviconUrl(page) || '').trim();
      if (configured) {
        return configured;
      }
    }
    return getBrowserPageFaviconUrl(page, { getRuntimeUrl, size });
  }

  function getResolverGstaticFaviconUrl(pageUrl: unknown): string {
    const page = getCanonicalFaviconPage(pageUrl);
    if (!page || !/^https?:\/\//i.test(page)) {
      return '';
    }
    if (deps.customGstaticFaviconUrl) {
      const configured = getSafeFaviconCandidateUrl(deps.customGstaticFaviconUrl(page), page, 'third-party-proxy');
      if (configured) {
        return configured;
      }
    }
    return getGstaticFaviconUrl(page, { size });
  }

  function getResolverChromeFaviconUrl(pageUrl: unknown): string {
    const page = getCanonicalFaviconPage(pageUrl);
    if (!page) {
      return '';
    }
    if (/^https?:\/\//i.test(page)) {
      return getResolverExtensionFaviconUrl(page);
    }
    if (deps.customChromeFaviconUrl) {
      const configured = getSafeFaviconCandidateUrl(deps.customChromeFaviconUrl(page), page, 'browser-favicon');
      if (configured) {
        return configured;
      }
    }
    return getChromeFaviconUrl(page, { size });
  }

  function getResolverOwnExtensionFaviconUrl(pageUrl: unknown): string {
    if (!isOwnExtensionPageUrl(pageUrl, deps.ownExtensionRuntime.id)) {
      return '';
    }
    return getOwnExtensionAssetUrl(LUMNO_EXTENSION_ICON_PATH, deps.ownExtensionRuntime, { getRuntimeUrl });
  }

  return Object.freeze({
    getExtensionFaviconUrl: getResolverExtensionFaviconUrl,
    getBrowserPageFaviconUrl: getResolverBrowserPageFaviconUrl,
    getGstaticFaviconUrl: getResolverGstaticFaviconUrl,
    getChromeFaviconUrl: getResolverChromeFaviconUrl,
    getOwnExtensionFaviconUrl: getResolverOwnExtensionFaviconUrl
  });
}

export {
  createFaviconSourceUrls
};
