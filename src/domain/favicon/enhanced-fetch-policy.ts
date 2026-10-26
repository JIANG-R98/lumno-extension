// Which favicon sources the enhanced-fetch setting allows.
import { LUMNO_EXTENSION_ICON_PATH } from './candidate-urls';
import type { EnhancedFetchPolicyOptions } from './types';
import { isBrowserExtensionProtocol, isChromeMonogramFaviconUrl, isFaviconProxyUrl } from './url-kinds';

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
    if (!isBrowserExtensionProtocol(parsed.protocol)) {
      // Approved public services do not connect to the target website from
      // the page. Site exclusions can still disable those requests.
      if (isFaviconProxyUrl(raw)) {
        return typeof enhancedFetchEnabled === 'boolean' &&
          (!options || options.allowThirdPartyFetch !== false);
      }
      return enhancedFetchEnabled === true &&
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        Boolean(options && options.allowRemoteImage === true);
    }
    const config = options || {};
    const runtime = config.chromeApi && config.chromeApi.runtime ? config.chromeApi.runtime : null;
    const ownExtensionId = String(config.ownExtensionId || (runtime && runtime.id) || '').trim();
    const isOwnExtensionUrl = Boolean(
      ownExtensionId &&
      isBrowserExtensionProtocol(parsed.protocol) &&
      String(parsed.hostname || '') === ownExtensionId
    );
    if (!isOwnExtensionUrl) {
      return false;
    }
    const pathname = String(parsed.pathname || '').toLowerCase();
    return pathname.startsWith('/_favicon/') ||
      pathname === `/${LUMNO_EXTENSION_ICON_PATH.toLowerCase()}` ||
      /^\/assets\/images\/site-search\/[^/]+\.(?:svg|png)$/.test(pathname);
  } catch (e) {
    return false;
  }
}

export {
  isFaviconSourceAllowedByEnhancedFetchPolicy
};
