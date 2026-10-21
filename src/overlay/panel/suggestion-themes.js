(function(root) {
  // Accent colors for suggestions: brand accents, favicon sources and
  // their average color, and the theme each suggestion row and mark uses.
  function createSuggestionThemes(deps) {
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

    // The panel state object shared with search-panel.js and the other modules.
    const overlayState = deps.overlayState;

    const OVERLAY_THEME_COLOR_CACHE_MAX_ENTRIES = 384;
    const OVERLAY_THEME_HOST_CACHE_MAX_ENTRIES = 256;
    function cacheOverlayThemeColor(key, value) {
      return FAVICON_UTILS.setBoundedCacheEntry(
        themeColorCache,
        key,
        value,
        OVERLAY_THEME_COLOR_CACHE_MAX_ENTRIES
      );
    }
    function cacheOverlayThemeHost(key, value) {
      return FAVICON_UTILS.setBoundedCacheEntry(
        themeHostCache,
        key,
        value,
        OVERLAY_THEME_HOST_CACHE_MAX_ENTRIES
      );
    }
    const brandAccentMap = {
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

    function getExtensionFaviconUrl(pageUrl) {
      const resolver = getOverlayFaviconUrlResolver();
      return resolver ? resolver.getExtensionFaviconUrl(pageUrl) : '';
    }

    function getGstaticFaviconUrl(pageUrl) {
      const resolver = getOverlayFaviconUrlResolver();
      return resolver
        ? resolver.getSafeFaviconCandidateUrl(resolver.getGstaticFaviconUrl(pageUrl))
        : '';
    }

    function getChromeFaviconUrl(pageUrl) {
      const resolver = getOverlayFaviconUrlResolver();
      return resolver ? resolver.getChromeFaviconUrl(pageUrl) : '';
    }

    function getPageFaviconCandidateUrl(pageUrl) {
      const resolver = getOverlayFaviconUrlResolver();
      return resolver ? resolver.getPageFaviconCandidateUrl(pageUrl) : '';
    }

    function getBrandAccentForHost(hostname) {
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

    function getBrandAccentForUrl(url) {
      if (!url) {
        return null;
      }
      try {
        const hostname = SEARCH_UTILS.normalizeHostIdentity(new URL(url).hostname);
        return getBrandAccentForHost(hostname);
      } catch (e) {
        return null;
      }
    }

    function buildFallbackThemeForHost(hostname) {
      const theme = buildTheme(defaultAccentColor);
      theme._xIsDefault = true;
      theme._xIsBrand = false;
      theme._xThemeSource = 'fallback';
      theme._xIsFallback = true;
      return theme;
    }

    function getHostFromUrl(url) {
      if (!url) {
        return '';
      }
      try {
        return SEARCH_UTILS.normalizeHostIdentity(new URL(url).hostname);
      } catch (e) {
        return '';
      }
    }

    function extractAverageColor(image) {
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
      } catch (e) {
        return null;
      }
    }

    function isFaviconProxyUrl(url) {
      return FAVICON_UTILS.isFaviconProxyUrl(url);
    }

    function isChromeMonogramFaviconUrl(url) {
      return FAVICON_UTILS.isChromeMonogramFaviconUrl(url);
    }

    function getThemeFromUrl(url, hostOverride) {
      const resolver = getOverlayFaviconUrlResolver();
      url = resolver ? resolver.getSafeFaviconCandidateUrl(url, '', 'theme') : '';
      if (!url) {
        return Promise.resolve(overlayState.defaultTheme);
      }
      const hostKey = hostOverride || getHostFromUrl(url);
      if (overlayState.isBlockedLocalFaviconUrl(url) || (hostKey && shouldBlockOverlayFaviconForHost(hostKey))) {
        const fallbackTheme = buildFallbackThemeForHost(hostKey);
        return Promise.resolve(fallbackTheme || overlayState.defaultTheme);
      }
      const isProxy = isFaviconProxyUrl(url);
      const useHostCache = hostKey && (!isProxy || Boolean(hostOverride));
      if (useHostCache && themeHostCache.has(hostKey)) {
        return Promise.resolve(themeHostCache.get(hostKey));
      }
      if (themeColorCache.has(url)) {
        return Promise.resolve(themeColorCache.get(url));
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
        return new Promise((resolve) => {
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
          return new Promise((resolve) => {
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
      return new Promise((resolve) => {
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

    function getProviderThemeHost(provider) {
      return SEARCH_UTILS.normalizeHostIdentity(SEARCH_UTILS.getSiteSearchProviderHost(provider));
    }

    function buildAndCacheBrandThemeForHost(hostKey, iconUrl) {
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

    function getThemeForProvider(provider) {
      const hostKey = getProviderThemeHost(provider);
      const providerPageUrl = SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider);
      const resolver = getOverlayFaviconUrlResolver();
      const iconUrl = resolver ? resolver.resolveFaviconSource(getProviderIcon(provider), providerPageUrl) : '';
      if (hostKey && themeHostCache.has(hostKey)) {
        return Promise.resolve(themeHostCache.get(hostKey));
      }
      if (iconUrl && themeColorCache.has(iconUrl)) {
        return Promise.resolve(themeColorCache.get(iconUrl));
      }
      const brandTheme = buildAndCacheBrandThemeForHost(hostKey, iconUrl);
      if (brandTheme) {
        return Promise.resolve(brandTheme);
      }
      return getThemeFromUrl(iconUrl, hostKey);
    }

    function shouldUseBrandTheme(suggestion) {
      if (!suggestion) {
        return false;
      }
      const neutralTypes = ['googleSuggest', 'newtab', 'modeSwitch', 'zenSwitch', 'chatgpt', 'perplexity', 'commandNewTab', 'commandSettings', 'commandOpenTabs', 'commandCopyUrl', 'commandDocumentPip'];
      if (neutralTypes.includes(suggestion.type)) {
        return false;
      }
      return true;
    }

    function getThemeForSuggestion(suggestion) {
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

    function getImmediateThemeForSuggestion(suggestion) {
      if (!shouldUseBrandTheme(suggestion)) {
        return overlayState.defaultTheme;
      }
      if (suggestion && suggestion.provider) {
        const hostKey = getProviderThemeHost(suggestion.provider);
        const iconUrl = getProviderIcon(suggestion.provider);
        if (hostKey && themeHostCache.has(hostKey)) {
          return themeHostCache.get(hostKey);
        }
        if (iconUrl && themeColorCache.has(iconUrl)) {
          return themeColorCache.get(iconUrl);
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
        if (hostKey && themeHostCache.has(hostKey)) {
          return themeHostCache.get(hostKey);
        }
        if (themeColorCache.has(suggestion.url)) {
          return themeColorCache.get(suggestion.url);
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

    function applyThemeVariables(target, theme) {
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

    function applyMarkVariables(target, theme, active) {
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

    function preloadThemeFromFavicon(url, dataUrl, hostOverride) {
      if (!url || themeColorCache.has(url)) {
        return;
      }
      const hostKey = hostOverride || getHostFromUrl(url);
      const useHostCache = hostKey && (Boolean(hostOverride) || !isFaviconProxyUrl(url));
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

    function getThemeSourceForSuggestion(suggestion) {
      if (suggestion && suggestion.provider) {
        const resolver = getOverlayFaviconUrlResolver();
        return resolver ? resolver.resolveFaviconSource(
          getProviderIcon(suggestion.provider), SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(suggestion.provider)
        ) : '';
      }
      const resolver = getOverlayFaviconUrlResolver();
      return resolver
        ? resolver.resolveFaviconSource(suggestion && suggestion.favicon, suggestion && suggestion.url)
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

  root.LumnoOverlayPanelSuggestionThemes = { createSuggestionThemes };
})(globalThis);
