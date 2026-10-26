// Site theme colors resolved for a page.
import type { SiteThemeColor } from '../../domain/messages';
import type { ThemeRgb } from '../../domain/favicon/types';

import { getFaviconTargetPolicy, logBlockedLocalFavicon } from './candidates';
import { loadFaviconEnhancedFetchEnabled, loadFaviconRequestBlacklistItems } from './request-policy';

// Theme colors by host, origin and theme ("host::origin::auto").
const siteThemeColorCache = new Map<string, SiteThemeColor>();

const siteThemeColorPending = new Map<string, Promise<SiteThemeColor | null>>();


const BACKGROUND_SITE_THEME_CACHE_MAX_ENTRIES = 512;


function normalizeThemeAccentRgb(value: unknown): ThemeRgb | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const channels: unknown[] = value;
  const [red, green, blue] = channels.map((channel) => Math.round(Number(channel)));
  return [red, green, blue].every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)
    ? [red, green, blue]
    : null;
}

// Pages are never fetched for their theme color, so this only records why.
function resolveSiteThemeColor(targetUrl: unknown, hostOverride: unknown, _preferredTheme?: unknown): Promise<SiteThemeColor | null> {
  const inputUrl = String(targetUrl || '').trim();
  if (!inputUrl) {
    return Promise.resolve(null);
  }
  return Promise.all([
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled()
  ]).then(([, enhancedFetchEnabled]) => {
    const targetPolicy = getFaviconTargetPolicy(inputUrl, hostOverride);
    if (!targetPolicy.ok) {
      return null;
    }
    logBlockedLocalFavicon(
      inputUrl,
      'theme-page',
      !enhancedFetchEnabled
        ? 'global-off'
        : (targetPolicy.requestBlacklisted ? 'exclusion' : 'direct-network-disabled'),
      inputUrl
    );
    return null;
  });
}

export {
  BACKGROUND_SITE_THEME_CACHE_MAX_ENTRIES,
  normalizeThemeAccentRgb,
  resolveSiteThemeColor,
  siteThemeColorCache,
  siteThemeColorPending
};
