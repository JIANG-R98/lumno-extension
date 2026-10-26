// How a tab looks in the switcher: its icon (the browser's own logo for
// Firefox's about: pages) and its accent color.
import * as FAVICON_UTILS from '../../domain/favicon/favicon-utils';
import type { ThemeRgb } from '../../domain/favicon/favicon-utils';
import type { SiteThemeColor } from '../../domain/messages';
import { getSwitcherRegistrableThemeHost, getSwitcherThemeHostCandidates } from '../../domain/tab-switcher-model';
import * as BROWSER_PROFILE from '../../platform/browser-profile';
import * as NEWTAB_FAVICON_THEME from '../../shared/favicon/favicon-theme';
import { getResolvedTabUrl } from '../browser-urls-service';
import {
  BACKGROUND_SITE_THEME_CACHE_MAX_ENTRIES,
  getBackgroundFaviconCacheRuntime,
  getBackgroundFaviconUrlResolver,
  normalizeFaviconHost,
  normalizeThemeAccentRgb,
  resolveSiteThemeColor,
  shouldBlockFaviconForHost,
  siteThemeColorCache,
  siteThemeColorPending
} from '../favicon-service';
import type { SwitcherTab } from './types';

// Firefox gives its about: pages chrome:// icons that web pages cannot load,
// and those monochrome icons would vanish on a dark switcher anyway. The
// switcher shows the browser's own logo (Firefox, Zen, ...) for them instead,
// rasterized once into a data URL that any page can render.
let firefoxBrandIconDataUrl = '';

function loadFirefoxBrandIcon(): void {
  if (!BROWSER_PROFILE.isFirefoxExtensionRuntime() || typeof Image !== 'function' || typeof document === 'undefined') {
    return;
  }
  const image = new Image();
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      if (!context) {
        firefoxBrandIconDataUrl = '';
        return;
      }
      context.drawImage(image, 0, 0, 64, 64);
      firefoxBrandIconDataUrl = canvas.toDataURL('image/png');
    } catch (_error) {
      firefoxBrandIconDataUrl = '';
    }
  };
  image.src = 'chrome://branding/content/icon64.png';
}

function isFirefoxPrivilegedPageUrl(url: unknown): boolean {
  return /^about:/i.test(String(url || '')) && BROWSER_PROFILE.isFirefoxExtensionRuntime();
}

function buildSwitcherTabFavicon(tab: SwitcherTab, url: string): string {
  const resolved = String(url || getResolvedTabUrl(tab) || '').trim();
  if (firefoxBrandIconDataUrl && isFirefoxPrivilegedPageUrl(resolved) &&
      !/^(?:data:image\/|https?:)/i.test(String(tab && tab.favIconUrl || ''))) {
    return firefoxBrandIconDataUrl;
  }
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.resolveFaviconSource(tab && tab.favIconUrl, resolved) : '';
}

function getCachedSiteThemeColorForSwitcher(host: unknown, origin: unknown): SiteThemeColor | null {
  const normalizedHost = normalizeFaviconHost(host);
  const normalizedOrigin = String(origin || '').trim();
  if (!normalizedHost) {
    return null;
  }
  const candidateHosts = getSwitcherThemeHostCandidates(normalizedHost);
  for (const candidateHost of candidateHosts) {
    const exactKey = `${candidateHost}::${normalizedOrigin}::auto`;
    const exact = normalizedOrigin ? siteThemeColorCache.get(exactKey) : null;
    if (exact && normalizeThemeAccentRgb(exact.accentRgb)) {
      return exact;
    }
  }
  for (const [key, value] of siteThemeColorCache.entries()) {
    if (!value || !normalizeThemeAccentRgb(value.accentRgb)) {
      continue;
    }
    const cachedHost = normalizeFaviconHost(String(key || '').split('::')[0]);
    if (!cachedHost) {
      continue;
    }
    if (candidateHosts.some((candidateHost) =>
      cachedHost === candidateHost ||
        cachedHost.endsWith(`.${candidateHost}`)
    )) {
      return value;
    }
  }
  return null;
}

function getPersistedSiteThemeColorForSwitcher(host: unknown): SiteThemeColor | null {
  const runtime = getBackgroundFaviconCacheRuntime();
  if (!runtime || typeof runtime.getPersistedThemeEntry !== 'function') {
    return null;
  }
  const candidateHosts = getSwitcherThemeHostCandidates(host);
  for (const candidateHost of candidateHosts) {
    const entry = runtime.getPersistedThemeEntry(candidateHost);
    const accentRgb = normalizeThemeAccentRgb(entry && entry.accentRgb);
    if (entry && accentRgb) {
      return {
        accentRgb,
        source: entry.source || 'cache',
        neutral: entry.neutral === true,
        confidence: entry.confidence || FAVICON_UTILS.getThemeColorConfidence(accentRgb)
      };
    }
  }
  return null;
}

function persistSiteThemeColorForSwitcher(host: string, result: SiteThemeColor | null): boolean {
  const runtime = getBackgroundFaviconCacheRuntime();
  const accentRgb = normalizeThemeAccentRgb(result && result.accentRgb);
  if (!runtime ||
      typeof runtime.setPersistedThemeEntry !== 'function' ||
      !host ||
      !result ||
      !accentRgb) {
    return false;
  }
  return runtime.setPersistedThemeEntry(host, {
    accentRgb,
    source: result.source || 'meta',
    neutral: result.neutral === true,
    confidence: result.confidence || FAVICON_UTILS.getThemeColorConfidence(accentRgb)
  });
}

function getNewtabBrandAccentForSwitcher(host: unknown, url: string): ThemeRgb | null {
  const normalizedHost = normalizeFaviconHost(host);
  let accentRgb: ThemeRgb | null = null;
  if (normalizedHost) {
    accentRgb = NEWTAB_FAVICON_THEME.getBrandAccentForHost(normalizedHost);
  }
  if (!accentRgb) {
    accentRgb = NEWTAB_FAVICON_THEME.getBrandAccentForUrl(url);
  }
  return normalizeThemeAccentRgb(accentRgb);
}

function normalizeSwitcherAccentRgbForPayload(accentRgb: unknown): ThemeRgb | null {
  const rgb = normalizeThemeAccentRgb(accentRgb);
  if (!rgb) {
    return null;
  }
  if (FAVICON_UTILS.getThemeColorConfidence(rgb) === 'neutral') {
    return normalizeThemeAccentRgb(NEWTAB_FAVICON_THEME.defaultAccentColor) || [59, 130, 246];
  }
  return rgb;
}

function warmSwitcherTabThemeColor(host: unknown, url: string): void {
  const normalizedHost = normalizeFaviconHost(host);
  const resolved = String(url || '').trim();
  if (!normalizedHost || !resolved) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch (_error) {
    return;
  }
  if (!/^https?:$/i.test(parsed.protocol) ||
      shouldBlockFaviconForHost(parsed.hostname) ||
      shouldBlockFaviconForHost(normalizedHost)) {
    return;
  }
  const cacheKey = `${normalizedHost}::${parsed.origin}::auto`;
  if (siteThemeColorCache.has(cacheKey) || siteThemeColorPending.has(cacheKey)) {
    return;
  }
  if (switcherThemeColorWarmups.has(cacheKey)) {
    return;
  }
  switcherThemeColorWarmups.add(cacheKey);
  resolveSiteThemeColor(resolved, normalizedHost, '')
    .then((result) => {
      const accentRgb = normalizeThemeAccentRgb(result && result.accentRgb);
      const sharedHost = getSwitcherRegistrableThemeHost(normalizedHost);
      if (result && accentRgb && sharedHost && sharedHost !== normalizedHost) {
        const sharedKey = `${sharedHost}::${parsed.origin}::auto`;
        FAVICON_UTILS.setBoundedCacheEntry(
          siteThemeColorCache,
          sharedKey,
          result,
          BACKGROUND_SITE_THEME_CACHE_MAX_ENTRIES
        );
        persistSiteThemeColorForSwitcher(sharedHost, result);
      }
    })
    .catch(() => null)
    .finally(() => {
      switcherThemeColorWarmups.delete(cacheKey);
    });
}

function getSwitcherTabAccentRgb(tab: SwitcherTab, url: string): ThemeRgb | null {
  const resolved = String(url || getResolvedTabUrl(tab) || '').trim();
  if (!resolved) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch (_error) {
    return null;
  }
  if (!/^https?:$/i.test(parsed.protocol) || shouldBlockFaviconForHost(parsed.hostname)) {
    return null;
  }
  const host = normalizeFaviconHost(parsed.hostname);
  const brandAccent = getNewtabBrandAccentForSwitcher(host, resolved);
  warmSwitcherTabThemeColor(host, resolved);
  if (brandAccent) {
    return brandAccent;
  }
  const cached = getCachedSiteThemeColorForSwitcher(host, parsed.origin) ||
    getPersistedSiteThemeColorForSwitcher(host);
  return normalizeSwitcherAccentRgbForPayload(cached && cached.accentRgb);
}



// Theme color lookups already started for a host.
const switcherThemeColorWarmups = new Set<string>();

export { buildSwitcherTabFavicon, getSwitcherTabAccentRgb, isFirefoxPrivilegedPageUrl, loadFirefoxBrandIcon };
