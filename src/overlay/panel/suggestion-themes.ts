import type * as FaviconUtils from '../../domain/favicon/favicon-utils';
import type { FaviconUrlResolver, ThemeRgb } from '../../domain/favicon/favicon-utils';
import type * as ShortcutFavicon from '../../domain/favicon/shortcut-favicon';
import type * as SearchUtils from '../../domain/search/search-utils';
import type { SiteSearchProvider } from '../../domain/search/types';
import type { ThemeVariant } from '../../shared/favicon/favicon-theme';

interface SuggestionThemesState {
  defaultTheme: ThemeVariant;
  isBlockedLocalFaviconUrl(url: string): boolean;
  // A favicon service's image as a data: URL, or '' when there is none.
  requestFaviconData(url: string): Promise<string>;
}

interface SuggestionThemesDeps {
  FAVICON_UTILS: Pick<typeof FaviconUtils, 'setBoundedCacheEntry' | 'isFaviconProxyUrl' | 'isChromeMonogramFaviconUrl'>;
  SEARCH_UTILS: Pick<typeof SearchUtils, 'normalizeHostIdentity' | 'getSiteSearchProviderHost'>;
  SHORTCUT_FAVICON: Pick<typeof ShortcutFavicon, 'getSiteSearchProviderPageUrl'>;
  // Themes by icon address and by host, kept across panel sessions.
  themeColorCache: Map<string, ThemeVariant>;
  themeHostCache: Map<string, ThemeVariant>;
  // Favicon images already fetched, as data: URLs by address.
  faviconDataCache: Map<string, string>;
  getOverlayFaviconUrlResolver(): FaviconUrlResolver | null;
  buildTheme(rgb: unknown): ThemeVariant;
  defaultAccentColor: ThemeRgb;
  shouldBlockOverlayFaviconForHost(hostname: string): boolean;
  getProviderIcon(provider: SiteSearchProvider): string;
  getThemeForMode(theme: ThemeVariant): ThemeVariant;
  overlayState: SuggestionThemesState;
}

// What a row's theme depends on.
interface ThemedSuggestion {
  type?: string;
  url?: string;
  favicon?: string;
  provider?: SiteSearchProvider | null;
}

// Accent colors for suggestions: brand accents, favicon sources and
// their average color, and the theme each suggestion row and mark uses.
function createSuggestionThemes(deps: SuggestionThemesDeps) {
  const {
    FAVICON_UTILS,
    themeColorCache,
    themeHostCache,
    getOverlayFaviconUrlResolver,
    SEARCH_UTILS,
    buildTheme,
    defaultAccentColor,
    shouldBlockOverlayFaviconForHost,
    faviconDataCache,
    SHORTCUT_FAVICON,
    getProviderIcon,
    getThemeForMode
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  const OVERLAY_THEME_COLOR_CACHE_MAX_ENTRIES = 384;
  const OVERLAY_THEME_HOST_CACHE_MAX_ENTRIES = 256;
  function cacheOverlayThemeColor(key: string, value: ThemeVariant): ThemeVariant {
    return FAVICON_UTILS.setBoundedCacheEntry(
      themeColorCache,
      key,
      value,
      OVERLAY_THEME_COLOR_CACHE_MAX_ENTRIES
    );
  }
  function cacheOverlayThemeHost(key: string, value: ThemeVariant): ThemeVariant {
    return FAVICON_UTILS.setBoundedCacheEntry(
      themeHostCache,
      key,
      value,
      OVERLAY_THEME_HOST_CACHE_MAX_ENTRIES
    );
  }
  const brandAccentMap: Record<string, number[]> = {
    'github.com': [36, 41, 46],
    'docs.github.com': [36, 41, 46],
    'douban.com': [0, 181, 29],
    'zhihu.com': [23, 127, 255],
    'bilibili.com': [0, 174, 236],
    'youtube.com': [255, 0, 0],
    'youtu.be': [255, 0, 0],
    'google.com': [66, 133, 244],
    'chatgpt.com': [16, 163, 127],
    'gemini.google.com': [66, 133, 244],
    'doubao.com': [79, 70, 229],
    'qianwen.com': [37, 99, 235],
    'yuanbao.tencent.com': [0, 82, 217],
    'chat.minimax.io': [24, 119, 242],
    'chat.deepseek.com': [74, 107, 255],
    'kimi.com': [77, 92, 255],
    'copilot.com': [34, 83, 206],
    'copilot.microsoft.com': [34, 83, 206],
    'grok.com': [17, 24, 39],
    'chat.qwen.ai': [99, 54, 231],
    'aistudio.google.com': [66, 133, 244],
    'bing.com': [0, 120, 215],
    'baidu.com': [41, 98, 255],
    'taobao.com': [255, 80, 0],
    'tmall.com': [226, 35, 26],
    'juejin.cn': [30, 128, 255],
    'reddit.com': [255, 69, 0],
    'wikipedia.org': [64, 64, 64],
    'zh.wikipedia.org': [64, 64, 64],
    'x.com': [17, 24, 39],
    'twitter.com': [29, 161, 242]
  };

  function getExtensionFaviconUrl(pageUrl: string): string {
    const resolver = getOverlayFaviconUrlResolver();
    return resolver ? resolver.getExtensionFaviconUrl(pageUrl) : '';
  }

  function getGstaticFaviconUrl(pageUrl: string): string {
    const resolver = getOverlayFaviconUrlResolver();
    return resolver
      ? resolver.getSafeFaviconCandidateUrl(resolver.getGstaticFaviconUrl(pageUrl))
      : '';
  }

  function getChromeFaviconUrl(pageUrl: string): string {
    const resolver = getOverlayFaviconUrlResolver();
    return resolver ? resolver.getChromeFaviconUrl(pageUrl) : '';
  }

  function getPageFaviconCandidateUrl(pageUrl: string): string {
    const resolver = getOverlayFaviconUrlResolver();
    return resolver ? resolver.getPageFaviconCandidateUrl(pageUrl) : '';
  }

  function getBrandAccentForHost(hostname: string): number[] | null {
    const host = String(hostname || '').toLowerCase();
    if (!host) {
      return null;
    }
    if (brandAccentMap[host]) {
      return brandAccentMap[host];
    }
    const entry = Object.keys(brandAccentMap).find((key) => host === key || host.endsWith(`.${key}`));
    return entry ? brandAccentMap[entry] : null;
  }

  function getBrandAccentForUrl(url: string): number[] | null {
    if (!url) {
      return null;
    }
    try {
      const hostname = SEARCH_UTILS.normalizeHostIdentity(new URL(url).hostname);
      return getBrandAccentForHost(hostname);
    } catch (_error) {
      return null;
    }
  }

  // The default accent, marked as standing in for a site's own color.
  function buildFallbackThemeForHost(hostname: string): ThemeVariant {
    const theme = buildTheme(defaultAccentColor);
    theme._xIsDefault = true;
    theme._xIsBrand = false;
    theme._xThemeSource = 'fallback';
    theme._xIsFallback = true;
    return theme;
  }

  function getHostFromUrl(url: string): string {
    if (!url) {
      return '';
    }
    try {
      return SEARCH_UTILS.normalizeHostIdentity(new URL(url).hostname);
    } catch (_error) {
      return '';
    }
  }

  // The average of an icon's opaque, not nearly white pixels.
  function extractAverageColor(image: HTMLImageElement): number[] | null {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }
    try {
      context.drawImage(image, 0, 0, size, size);
      const data = context.getImageData(0, 0, size, size).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 32) {
          continue;
        }
        const red = data[i];
        const green = data[i + 1];
        const blue = data[i + 2];
        const brightness = (red + green + blue) / 3;
        if (brightness > 245) {
          continue;
        }
        r += red;
        g += green;
        b += blue;
        count += 1;
      }
      if (!count) {
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 32) {
            continue;
          }
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count += 1;
        }
      }
      if (!count) {
        return null;
      }
      return [
        Math.round(r / count),
        Math.round(g / count),
        Math.round(b / count)
      ];
    } catch (_error) {
      return null;
    }
  }

  function isFaviconProxyUrl(url: string): boolean {
    return FAVICON_UTILS.isFaviconProxyUrl(url);
  }

  function isChromeMonogramFaviconUrl(url: string): boolean {
    return FAVICON_UTILS.isChromeMonogramFaviconUrl(url);
  }

  // The theme of an icon: from the caches, a brand accent, or the icon's
  // average color once it loads.
  function getThemeFromUrl(sourceUrl: string, hostOverride?: string): Promise<ThemeVariant> {
    const resolver = getOverlayFaviconUrlResolver();
    const url = resolver ? resolver.getSafeFaviconCandidateUrl(sourceUrl, '', 'theme') : '';
    if (!url) {
      return Promise.resolve(overlayState.defaultTheme);
    }
    const hostKey = hostOverride || getHostFromUrl(url);
    if (overlayState.isBlockedLocalFaviconUrl(url) || (hostKey && shouldBlockOverlayFaviconForHost(hostKey))) {
      const fallbackTheme = buildFallbackThemeForHost(hostKey);
      return Promise.resolve(fallbackTheme || overlayState.defaultTheme);
    }
    const isProxy = isFaviconProxyUrl(url);
    const useHostCache = Boolean(hostKey) && (!isProxy || Boolean(hostOverride));
    const cachedHostTheme = useHostCache ? themeHostCache.get(hostKey) : undefined;
    if (cachedHostTheme) {
      return Promise.resolve(cachedHostTheme);
    }
    const cachedUrlTheme = themeColorCache.get(url);
    if (cachedUrlTheme) {
      return Promise.resolve(cachedUrlTheme);
    }
    const brandAccent = (isProxy && hostOverride) ? null : getBrandAccentForUrl(url);
    if (brandAccent) {
      const brandTheme = buildTheme(brandAccent);
      brandTheme._xIsBrand = true;
      cacheOverlayThemeColor(url, brandTheme);
      if (useHostCache) {
        cacheOverlayThemeHost(hostKey, brandTheme);
      }
      return Promise.resolve(brandTheme);
    }
    const cachedFaviconData = faviconDataCache.get(url);
    if (cachedFaviconData) {
      return new Promise<ThemeVariant>((resolve) => {
        const image = new Image();
        image.onload = function() {
          const avg = extractAverageColor(image);
          if (!avg) {
            cacheOverlayThemeColor(url, overlayState.defaultTheme);
            resolve(overlayState.defaultTheme);
            return;
          }
          const theme = buildTheme(avg);
          theme._xIsBrand = true;
          cacheOverlayThemeColor(url, theme);
          if (useHostCache) {
            cacheOverlayThemeHost(hostKey, theme);
          }
          resolve(theme);
        };
        image.onerror = function() {
          cacheOverlayThemeColor(url, overlayState.defaultTheme);
          resolve(overlayState.defaultTheme);
        };
        image.src = cachedFaviconData;
      });
    }
    if (isProxy) {
      return overlayState.requestFaviconData(url).then((dataUrl) => {
        if (!dataUrl) {
          cacheOverlayThemeColor(url, overlayState.defaultTheme);
          return overlayState.defaultTheme;
        }
        return new Promise<ThemeVariant>((resolve) => {
          const image = new Image();
          image.onload = function() {
            const avg = extractAverageColor(image);
            if (!avg) {
              cacheOverlayThemeColor(url, overlayState.defaultTheme);
              resolve(overlayState.defaultTheme);
              return;
            }
            const theme = buildTheme(avg);
            theme._xIsBrand = true;
            cacheOverlayThemeColor(url, theme);
            if (useHostCache) {
              cacheOverlayThemeHost(hostKey, theme);
            }
            resolve(theme);
          };
          image.onerror = function() {
            cacheOverlayThemeColor(url, overlayState.defaultTheme);
            resolve(overlayState.defaultTheme);
          };
          image.src = dataUrl;
        });
      });
    }
    return new Promise<ThemeVariant>((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = function() {
        const avg = extractAverageColor(image);
        if (!avg) {
          cacheOverlayThemeColor(url, overlayState.defaultTheme);
          resolve(overlayState.defaultTheme);
          return;
        }
        const theme = buildTheme(avg);
        theme._xIsBrand = true;
        cacheOverlayThemeColor(url, theme);
        if (useHostCache) {
          cacheOverlayThemeHost(hostKey, theme);
        }
        resolve(theme);
      };
      image.onerror = function() {
        cacheOverlayThemeColor(url, overlayState.defaultTheme);
        resolve(overlayState.defaultTheme);
      };
      image.src = url;
    });
  }

  function getProviderThemeHost(provider: SiteSearchProvider): string {
    return SEARCH_UTILS.normalizeHostIdentity(SEARCH_UTILS.getSiteSearchProviderHost(provider));
  }

  function buildAndCacheBrandThemeForHost(hostKey: string, iconUrl: string): ThemeVariant | null {
    const normalizedHost = SEARCH_UTILS.normalizeHostIdentity(hostKey);
    if (!normalizedHost) {
      return null;
    }
    const brandAccent = getBrandAccentForHost(normalizedHost);
    if (!brandAccent) {
      return null;
    }
    const brandTheme = buildTheme(brandAccent);
    brandTheme._xIsBrand = true;
    cacheOverlayThemeHost(normalizedHost, brandTheme);
    if (iconUrl) {
      cacheOverlayThemeColor(iconUrl, brandTheme);
    }
    return brandTheme;
  }

  function getThemeForProvider(provider: SiteSearchProvider): Promise<ThemeVariant> {
    const hostKey = getProviderThemeHost(provider);
    const providerPageUrl = SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider);
    const resolver = getOverlayFaviconUrlResolver();
    const iconUrl = resolver ? resolver.resolveFaviconSource(getProviderIcon(provider), providerPageUrl) : '';
    const cachedHostTheme = hostKey ? themeHostCache.get(hostKey) : undefined;
    if (cachedHostTheme) {
      return Promise.resolve(cachedHostTheme);
    }
    const cachedIconTheme = iconUrl ? themeColorCache.get(iconUrl) : undefined;
    if (cachedIconTheme) {
      return Promise.resolve(cachedIconTheme);
    }
    const brandTheme = buildAndCacheBrandThemeForHost(hostKey, iconUrl);
    if (brandTheme) {
      return Promise.resolve(brandTheme);
    }
    return getThemeFromUrl(iconUrl, hostKey);
  }

  // Search actions and commands keep the neutral theme.
  function shouldUseBrandTheme(suggestion: ThemedSuggestion | null): suggestion is ThemedSuggestion {
    if (!suggestion) {
      return false;
    }
    const neutralTypes = ['googleSuggest', 'newtab', 'modeSwitch', 'zenSwitch', 'webAppearanceSwitch', 'chatgpt', 'perplexity', 'commandNewTab', 'commandSettings', 'commandOpenTabs', 'commandCopyUrl', 'commandDocumentPip'];
    if (neutralTypes.includes(suggestion.type || '')) {
      return false;
    }
    return true;
  }

  function getThemeForSuggestion(suggestion: ThemedSuggestion | null): Promise<ThemeVariant> {
    if (!shouldUseBrandTheme(suggestion)) {
      return Promise.resolve(overlayState.defaultTheme);
    }
    if (suggestion && suggestion.provider) {
      return getThemeForProvider(suggestion.provider);
    }
    if (suggestion && suggestion.url) {
      const brandAccent = getBrandAccentForUrl(suggestion.url);
      if (brandAccent) {
        const brandTheme = buildTheme(brandAccent);
        brandTheme._xIsBrand = true;
        return Promise.resolve(brandTheme);
      }
    }
    const hostKey = suggestion && suggestion.url ? getHostFromUrl(suggestion.url) : '';
    if (hostKey && shouldBlockOverlayFaviconForHost(hostKey)) {
      const fallbackTheme = buildFallbackThemeForHost(hostKey);
      return Promise.resolve(fallbackTheme || overlayState.defaultTheme);
    }

    return getThemeFromUrl(getThemeSourceForSuggestion(suggestion), hostKey);
  }

  // The theme known now, without loading any icon; null when none is.
  function getImmediateThemeForSuggestion(suggestion: ThemedSuggestion | null): ThemeVariant | null {
    if (!shouldUseBrandTheme(suggestion)) {
      return overlayState.defaultTheme;
    }
    if (suggestion && suggestion.provider) {
      const hostKey = getProviderThemeHost(suggestion.provider);
      const iconUrl = getProviderIcon(suggestion.provider);
      const cachedHostTheme = hostKey ? themeHostCache.get(hostKey) : undefined;
      if (cachedHostTheme) {
        return cachedHostTheme;
      }
      const cachedIconTheme = iconUrl ? themeColorCache.get(iconUrl) : undefined;
      if (cachedIconTheme) {
        return cachedIconTheme;
      }
      const brandTheme = buildAndCacheBrandThemeForHost(hostKey, iconUrl);
      if (brandTheme) {
        return brandTheme;
      }
      const fallbackTheme = buildFallbackThemeForHost(hostKey);
      if (fallbackTheme) {
        return fallbackTheme;
      }
    }
    if (suggestion && suggestion.url) {
      const hostKey = getHostFromUrl(suggestion.url);
      const cachedHostTheme = hostKey ? themeHostCache.get(hostKey) : undefined;
      if (cachedHostTheme) {
        return cachedHostTheme;
      }
      const cachedUrlTheme = themeColorCache.get(suggestion.url);
      if (cachedUrlTheme) {
        return cachedUrlTheme;
      }
      const brandAccent = getBrandAccentForUrl(suggestion.url);
      if (brandAccent) {
        const brandTheme = buildTheme(brandAccent);
        brandTheme._xIsBrand = true;
        return brandTheme;
      }
      const fallbackTheme = buildFallbackThemeForHost(hostKey);
      if (fallbackTheme) {
        return fallbackTheme;
      }
    }
    return null;
  }

  function applyThemeVariables(target: HTMLElement | null, theme: ThemeVariant | null): void {
    if (!target || !theme) {
      return;
    }
    const resolvedTheme = getThemeForMode(theme);
    target.style.setProperty('--x-ext-mark-bg', resolvedTheme.markBg);
    target.style.setProperty('--x-ext-mark-text', resolvedTheme.markText);
    target.style.setProperty('--x-ext-tag-bg', resolvedTheme.tagBg);
    target.style.setProperty('--x-ext-tag-text', resolvedTheme.tagText);
    target.style.setProperty('--x-ext-tag-border', resolvedTheme.tagBorder);
    target.style.setProperty('--x-ext-key-bg', resolvedTheme.keyBg);
    target.style.setProperty('--x-ext-key-text', resolvedTheme.keyText);
    target.style.setProperty('--x-ext-key-border', resolvedTheme.keyBorder);
    target.style.setProperty('--x-ext-icon-color', resolvedTheme.accent);
  }

  function applyMarkVariables(target: HTMLElement | null, theme: ThemeVariant | null, active: boolean): void {
    if (!target || !theme) {
      return;
    }
    const resolvedTheme = getThemeForMode(theme);
    const markBg = active
      ? resolvedTheme.activeMarkBg || resolvedTheme.markBg
      : resolvedTheme.markBg;
    const markText = active
      ? resolvedTheme.activeMarkText || resolvedTheme.markText
      : resolvedTheme.markText;
    target.style.setProperty('--x-ext-mark-bg', markBg);
    target.style.setProperty('--x-ext-mark-text', markText);
  }

  // Works out an icon's theme ahead of time from its fetched image.
  function preloadThemeFromFavicon(url: string, dataUrl: string, hostOverride?: string): void {
    if (!url || themeColorCache.has(url)) {
      return;
    }
    const hostKey = hostOverride || getHostFromUrl(url);
    const useHostCache = Boolean(hostKey) && (Boolean(hostOverride) || !isFaviconProxyUrl(url));
    if (useHostCache && themeHostCache.has(hostKey)) {
      return;
    }
    if (!dataUrl) {
      return;
    }
    const image = new Image();
    image.onload = function() {
      const avg = extractAverageColor(image);
      if (!avg) {
        return;
      }
      const theme = buildTheme(avg);
      theme._xIsBrand = true;
      cacheOverlayThemeColor(url, theme);
      if (useHostCache) {
        cacheOverlayThemeHost(hostKey, theme);
      }
    };
    image.onerror = function() {};
    image.src = dataUrl;
  }

  function getThemeSourceForSuggestion(suggestion: ThemedSuggestion): string {
    if (suggestion && suggestion.provider) {
      const resolver = getOverlayFaviconUrlResolver();
      return resolver ? resolver.resolveFaviconSource(
        getProviderIcon(suggestion.provider), SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(suggestion.provider)
      ) : '';
    }
    const resolver = getOverlayFaviconUrlResolver();
    return resolver
      ? resolver.resolveFaviconSource(suggestion.favicon, suggestion.url)
      : '';
  }

  return {
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    getPageFaviconCandidateUrl,
    getBrandAccentForUrl,
    getHostFromUrl,
    isFaviconProxyUrl,
    isChromeMonogramFaviconUrl,
    getProviderThemeHost,
    getThemeForProvider,
    getThemeForSuggestion,
    getImmediateThemeForSuggestion,
    applyThemeVariables,
    applyMarkVariables,
    preloadThemeFromFavicon
  };
}

export { createSuggestionThemes };
export type { SuggestionThemesDeps, SuggestionThemesState, ThemedSuggestion };
