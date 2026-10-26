// Which favicon sources the enhanced-fetch setting allows.
import { LUMNO_EXTENSION_ICON_PATH } from './candidate-urls';
import type { EnhancedFetchPolicyOptions } from './types';
import { isBrowserExtensionProtocol, isChromeMonogramFaviconUrl, isFaviconProxyUrl } from './url-kinds';

// Approved public services do not connect to the target website from the
// page. Site exclusions can still disable those requests.
function isAllowedRemoteSource(
  parsed: URL,
  raw: string,
  enhancedFetchEnabled: unknown,
  options: EnhancedFetchPolicyOptions | null | undefined
): boolean {
  if (isFaviconProxyUrl(raw)) {
    return typeof enhancedFetchEnabled === 'boolean' && (!options || options.allowThirdPartyFetch !== false);
  }
  return enhancedFetchEnabled === true &&
    (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
    Boolean(options && options.allowRemoteImage === true);
}

// This extension's own favicon endpoint, icon and bundled site icons.
function isAllowedOwnExtensionUrl(parsed: URL, options: EnhancedFetchPolicyOptions | null | undefined): boolean {
  const config = options || {};
  const runtime = config.chromeApi && config.chromeApi.runtime ? config.chromeApi.runtime : null;
  const ownExtensionId = String(config.ownExtensionId || (runtime && runtime.id) || '').trim();
  if (!ownExtensionId || String(parsed.hostname || '') !== ownExtensionId) {
    return false;
  }
  const pathname = String(parsed.pathname || '').toLowerCase();
  return pathname.startsWith('/_favicon/') ||
    pathname === `/${LUMNO_EXTENSION_ICON_PATH.toLowerCase()}` ||
    /^\/assets\/images\/site-search\/[^/]+\.(?:svg|png)$/.test(pathname);
}

function isFaviconSourceAllowedByEnhancedFetchPolicy(
  url: unknown,
  enhancedFetchEnabled: unknown,
  options?: EnhancedFetchPolicyOptions | null
): boolean {
  const raw = String(url || '').trim();
  if (!raw) {
    return false;
  }
  if (raw.startsWith('data:image/') || isChromeMonogramFaviconUrl(raw)) {
    return true;
  }
  try {
    const parsed = new URL(raw);
    return isBrowserExtensionProtocol(parsed.protocol)
      ? isAllowedOwnExtensionUrl(parsed, options)
      : isAllowedRemoteSource(parsed, raw, enhancedFetchEnabled, options);
  } catch (e) {
    return false;
  }
}

export {
  isFaviconSourceAllowedByEnhancedFetchPolicy
};
