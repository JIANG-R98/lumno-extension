// What the New Tab and overlay favicons share: loading an icon into an
// <img> with its reveal motion, optical centering, the data URL cache the
// background fills, preloading, and the fallback icon beside an image.
import * as LumnoMessaging from '../../platform/messaging';
import type { MessageRuntime } from '../../platform/messaging';
import { isHtmlElement } from '../dom-guards';
import * as BoundedCache from '../../domain/bounded-cache';

// A favicon <img>; the load token tells a finished load whether a newer
// one started since. The surfaces read it too.
type FaviconImage = HTMLImageElement & { _xFaviconLoadToken?: number };

// The page window, or a stand-in with the members used here.
type FaviconViewWindow = Partial<Pick<Window, 'requestAnimationFrame' | 'setTimeout'>> & {
  Image?: typeof Image;
};

// A result or suggestion whose icon is warmed.
interface FaviconWarmItem {
  type?: string;
  favicon?: string;
  url?: string;
}

interface FaviconViewCoreOptions {
  document?: Document | null;
  windowObj?: FaviconViewWindow | null;
  chromeApi?: { runtime?: MessageRuntime } | null;
  // Replaces asking the background for an icon's data URL.
  requestFaviconData?(url: string, pageUrl?: string): Promise<string | null> | string | null;
  getHostFromUrl?(url: string): string;
  shouldBlockFaviconForHost?(host: string): boolean;
  isBlockedLocalFaviconUrl?(url: string): boolean;
  showResolvedFavicon?(img: FaviconImage): void;
  showPendingFallbackIcon?(img: FaviconImage): void;
  // The key the surface remembers an image's icon under; none when empty.
  getPersistCacheKey?(img: FaviconImage): string;
  setPersistedFaviconUrl?(key: string, url: string): void;
  setPersistedFaviconData?(key: string, dataUrl: string): void;
  shouldPersistFaviconUrl?(url: string, img: FaviconImage): boolean;
  preloadThemeFromFavicon?(url: string, dataUrl: string, hostOverride?: string): void;
  getThemeFaviconUrl?(hostKey: string, item: FaviconWarmItem): string;
  hasThemeForHost?(hostKey: string): boolean;
  // Whether the image is the browser's blank stand-in for a missing icon.
  detectDefaultExtensionFavicon?(img: HTMLImageElement, faviconUrl: string): unknown;
  faviconDataCache?: Map<string, string>;
  faviconDataPending?: Map<string, Promise<string | null>>;
  iconPreloadCache?: Map<string, HTMLImageElement>;
  // A failed load does not fall back to the icon behind a fallback node.
  ignoreLastWorkingWhenFallback?: boolean;
  faviconDataCacheMaxEntries?: number;
  iconPreloadCacheMaxEntries?: number;
  placeholderProbeCacheMaxEntries?: number;
}

interface FaviconSrcOptions {
  // false keeps the icon out of the surface's remembered icons.
  persist?: boolean;
  // Leave showing the image to the caller.
  deferResolve?: boolean;
  // The icon URL a data URL was made from.
  sourceUrl?: string;
}

interface FaviconRestoreOptions {
  hideFallbackNode?(img: FaviconImage): void;
  onFailed?(): void;
  applyFallbackIcon?(img: FaviconImage): void;
}

function noop(): void {}
const FAVICON_INTRINSIC_SIZE = 128;
// The global timers with the DOM's numeric ids.
const globalTimers: Pick<Window, 'setTimeout'> = globalThis;

function readLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function createFaviconViewCore(options?: FaviconViewCoreOptions | null) {
  const config: FaviconViewCoreOptions = options || {};
  const doc = config.document || globalThis.document || null;
  const win: FaviconViewWindow = config.windowObj || globalThis;
  const chromeApi = config.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
  const ImageCtor = win.Image || globalThis.Image || null;
  const customRequestFaviconData = typeof config.requestFaviconData === 'function'
    ? config.requestFaviconData
    : null;
  const windowRequestFrame = win.requestAnimationFrame;
  const windowSetTimeout = win.setTimeout;
  const requestFrame = (callback: () => void): void => {
    if (typeof windowRequestFrame === 'function') {
      Reflect.apply(windowRequestFrame, win, [callback]);
    } else if (typeof windowSetTimeout === 'function') {
      Reflect.apply(windowSetTimeout, win, [callback, 16]);
    } else {
      globalTimers.setTimeout(callback, 16);
    }
  };
  const getHostFromUrl = typeof config.getHostFromUrl === 'function' ? config.getHostFromUrl : (() => '');
  const shouldBlockFaviconForHost = typeof config.shouldBlockFaviconForHost === 'function'
    ? config.shouldBlockFaviconForHost
    : (() => false);
  const isBlockedLocalFaviconUrl = typeof config.isBlockedLocalFaviconUrl === 'function'
    ? config.isBlockedLocalFaviconUrl
    : (() => false);
  const showResolvedFavicon = typeof config.showResolvedFavicon === 'function' ? config.showResolvedFavicon : noop;
  const showPendingFallbackIcon = typeof config.showPendingFallbackIcon === 'function' ? config.showPendingFallbackIcon : noop;
  const getPersistCacheKey = typeof config.getPersistCacheKey === 'function' ? config.getPersistCacheKey : (() => '');
  const setPersistedFaviconUrl = typeof config.setPersistedFaviconUrl === 'function' ? config.setPersistedFaviconUrl : noop;
  const setPersistedFaviconData = typeof config.setPersistedFaviconData === 'function' ? config.setPersistedFaviconData : noop;
  const shouldPersistFaviconUrl = typeof config.shouldPersistFaviconUrl === 'function'
    ? config.shouldPersistFaviconUrl
    : (() => true);
  const preloadThemeFromFavicon = typeof config.preloadThemeFromFavicon === 'function' ? config.preloadThemeFromFavicon : noop;
  const getThemeFaviconUrl = typeof config.getThemeFaviconUrl === 'function' ? config.getThemeFaviconUrl : (() => '');
  const hasThemeForHost = typeof config.hasThemeForHost === 'function' ? config.hasThemeForHost : (() => false);
  const customDetectDefaultExtensionFavicon = typeof config.detectDefaultExtensionFavicon === 'function'
    ? config.detectDefaultExtensionFavicon
    : null;
  const faviconDataCache: Map<string, string> = config.faviconDataCache || new Map();
  const faviconDataPending: Map<string, Promise<string | null>> = config.faviconDataPending || new Map();
  const iconPreloadCache: Map<string, HTMLImageElement> = config.iconPreloadCache || new Map();
  const extensionFaviconPlaceholderProbeCache = new Map<string, Promise<string>>();
  const ignoreLastWorkingWhenFallback = Boolean(config.ignoreLastWorkingWhenFallback);
  const faviconDataCacheMaxEntries = readLimit(config.faviconDataCacheMaxEntries, 256);
  const iconPreloadCacheMaxEntries = readLimit(config.iconPreloadCacheMaxEntries, 192);
  const placeholderProbeCacheMaxEntries = readLimit(config.placeholderProbeCacheMaxEntries, 32);
  function cacheFaviconData(url: string, dataUrl: string): string {
    return BoundedCache.setBoundedCacheEntry(
      faviconDataCache,
      url,
      dataUrl,
      faviconDataCacheMaxEntries
    );
  }

  function createImage(): HTMLImageElement | null {
    if (typeof ImageCtor === 'function') {
      return new ImageCtor();
    }
    return doc ? doc.createElement('img') : null;
  }

  function setFaviconIntrinsicSize(img: FaviconImage | null | undefined): void {
    if (!img) {
      return;
    }
    img.setAttribute('width', String(FAVICON_INTRINSIC_SIZE));
    img.setAttribute('height', String(FAVICON_INTRINSIC_SIZE));
  }

  // The browser's favicon URL for a page that has no icon, to learn what its
  // blank stand-in looks like.
  function buildExtensionFaviconPlaceholderProbeUrl(faviconUrl: string): string {
    try {
      const parsed = new URL(String(faviconUrl || ''));
      if (parsed.protocol !== 'chrome-extension:' || !parsed.pathname.startsWith('/_favicon/')) {
        return '';
      }
      parsed.searchParams.set('pageUrl', 'https://lumno.invalid/__favicon_placeholder_probe__');
      return parsed.toString();
    } catch (_error) {
      return '';
    }
  }

  // A hash of the image drawn at 16 x 16; empty when it cannot be read.
  function getCanvasImageSignature(image: HTMLImageElement | null | undefined): string {
    if (!image || !doc) {
      return '';
    }
    try {
      const canvas = doc.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return '';
      }
      context.clearRect(0, 0, 16, 16);
      context.drawImage(image, 0, 0, 16, 16);
      const data = context.getImageData(0, 0, 16, 16).data;
      let hash = 2166136261;
      for (let i = 0; i < data.length; i += 1) {
        hash ^= data[i];
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return `${hash}:${data.length}`;
    } catch (_error) {
      return '';
    }
  }

  function loadImageSignature(url: string): Promise<string> {
    return new Promise((resolve) => {
      const probe = createImage();
      if (!probe) {
        resolve('');
        return;
      }
      probe.onload = () => resolve(getCanvasImageSignature(probe));
      probe.onerror = () => resolve('');
      probe.src = url;
    });
  }

  function getExtensionPlaceholderSignature(faviconUrl: string): Promise<string> {
    const probeUrl = buildExtensionFaviconPlaceholderProbeUrl(faviconUrl);
    if (!probeUrl) {
      return Promise.resolve('');
    }
    const cached = extensionFaviconPlaceholderProbeCache.get(probeUrl);
    if (cached) {
      return cached;
    }
    return BoundedCache.setBoundedCacheEntry(
      extensionFaviconPlaceholderProbeCache,
      probeUrl,
      loadImageSignature(probeUrl),
      placeholderProbeCacheMaxEntries
    );
  }

  function detectDefaultExtensionFavicon(img: HTMLImageElement, faviconUrl: string): Promise<boolean> {
    if (customDetectDefaultExtensionFavicon) {
      return Promise.resolve(customDetectDefaultExtensionFavicon(img, faviconUrl))
        .then(Boolean)
        .catch(() => false);
    }
    const currentSignature = getCanvasImageSignature(img);
    if (!currentSignature) {
      return Promise.resolve(false);
    }
    return getExtensionPlaceholderSignature(faviconUrl)
      .then((placeholderSignature) => Boolean(placeholderSignature && placeholderSignature === currentSignature))
      .catch(() => false);
  }

  function setFaviconLoadState(img: FaviconImage | null | undefined, state: '' | 'priming' | 'loaded'): void {
    if (!img) {
      return;
    }
    if (state) {
      img.setAttribute('data-favicon-load-state', state);
    } else {
      img.removeAttribute('data-favicon-load-state');
    }
  }

  // Shifts the icon by up to 2px so its visual weight sits in the middle.
  function applyFaviconOpticalShift(img: FaviconImage | null | undefined): void {
    if (!img || !doc) {
      return;
    }
    const targetSize = 16;
    const visualCenter = (targetSize - 1) / 2;
    try {
      if (!(img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)) {
        img.style.setProperty('transform', 'none');
        return;
      }
      const canvas = doc.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        img.style.setProperty('transform', 'none');
        return;
      }
      context.clearRect(0, 0, targetSize, targetSize);
      context.drawImage(img, 0, 0, targetSize, targetSize);
      const data = context.getImageData(0, 0, targetSize, targetSize).data;
      let sumAlpha = 0;
      let weightedX = 0;
      let weightedY = 0;
      for (let y = 0; y < targetSize; y += 1) {
        for (let x = 0; x < targetSize; x += 1) {
          const alpha = data[(y * targetSize + x) * 4 + 3];
          if (alpha < 18) {
            continue;
          }
          sumAlpha += alpha;
          weightedX += x * alpha;
          weightedY += y * alpha;
        }
      }
      if (sumAlpha <= 0) {
        img.style.setProperty('transform', 'none');
        return;
      }
      const contentCenterX = weightedX / sumAlpha;
      const contentCenterY = weightedY / sumAlpha;
      const clamp = (value: number): number => Math.max(-2, Math.min(2, value));
      let offsetX = clamp(visualCenter - contentCenterX);
      let offsetY = clamp(visualCenter - contentCenterY);
      if (Math.abs(offsetX) < 0.4) {
        offsetX = 0;
      }
      if (Math.abs(offsetY) < 0.4) {
        offsetY = 0;
      }
      img.style.setProperty('transform', `translate(${offsetX}px, ${offsetY}px)`);
    } catch (_error) {
      img.style.setProperty('transform', 'none');
    }
  }

  function applyFaviconOpticalAlignment(img: FaviconImage | null | undefined): void {
    if (!img) {
      return;
    }
    setFaviconIntrinsicSize(img);
    img.style.setProperty('object-fit', 'contain');
    img.style.setProperty('object-position', 'center center');
    applyFaviconOpticalShift(img);
  }

  function ensureFaviconStartsLoading(img: FaviconImage): void {
    try {
      const loadingValue = String(img.getAttribute('loading') || img.loading || '').toLowerCase();
      if (loadingValue === 'lazy') {
        img.loading = 'eager';
        img.setAttribute('loading', 'eager');
      }
    } catch (_error) {
      // Ignore unsupported loading mutations on non-browser test doubles.
    }
  }

  // The icon as a data URL, cached; null when it cannot be had.
  function requestFaviconData(url: string, pageUrl?: string): Promise<string | null> {
    if (!url || url.startsWith('data:') || isBlockedLocalFaviconUrl(url)) {
      return Promise.resolve(null);
    }
    if (customRequestFaviconData) {
      return Promise.resolve(customRequestFaviconData(url, pageUrl)).catch(() => null);
    }
    const cached = faviconDataCache.get(url);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    const pending = faviconDataPending.get(url);
    if (pending) {
      return pending;
    }
    const promise = new Promise<string | null>((resolve) => {
      const runtime = chromeApi ? chromeApi.runtime : null;
      if (!runtime || typeof runtime.sendMessage !== 'function') {
        faviconDataPending.delete(url);
        resolve(null);
        return;
      }
      LumnoMessaging.sendBackgroundMessage(runtime, { action: 'getFaviconData', url: url, pageUrl: pageUrl || '' }, (response) => {
        const dataUrl = response && 'data' in response && typeof response.data === 'string' ? response.data : '';
        if (dataUrl) {
          cacheFaviconData(url, dataUrl);
        }
        faviconDataPending.delete(url);
        resolve(dataUrl || null);
      });
    });
    faviconDataPending.set(url, promise);
    return promise;
  }

  // Whether the image still shows (or is loading) this icon.
  function isCurrentFaviconSource(img: FaviconImage, sourceUrl: string): boolean {
    const expected = String(sourceUrl || '').trim();
    if (!img || !expected || !img.isConnected) {
      return false;
    }
    const resolvedSrc = String(img.getAttribute('data-favicon-current-src') || '').trim();
    const renderedSrc = String(img.getAttribute('src') || img.src || '').trim();
    const dataSource = String(img.getAttribute('data-favicon-data-source') || '').trim();
    return resolvedSrc === expected || renderedSrc === expected || dataSource === expected;
  }

  // Loads the icon into the image, revealing it the first time; false when
  // the image already shows it or the URL is blocked.
  function setFaviconSrcWithAnimation(
    img: FaviconImage | null | undefined,
    nextSrc: string,
    optionsArg?: FaviconSrcOptions | null
  ): boolean {
    if (!img || !nextSrc || isBlockedLocalFaviconUrl(nextSrc)) {
      return false;
    }
    setFaviconIntrinsicSize(img);
    const shouldPersist = !(optionsArg && optionsArg.persist === false);
    const shouldDeferResolve = Boolean(optionsArg && optionsArg.deferResolve);
    const sourceUrl = String((optionsArg && optionsArg.sourceUrl) || '').trim();
    const currentSrc = img.getAttribute('data-favicon-current-src') || '';
    const isFallbackVisible = img.getAttribute('data-fallback-icon') === 'true';
    const isPlaceholderVisible = img.getAttribute('data-favicon-placeholder') === 'true';
    const currentRenderedSrc = String(img.getAttribute('src') || img.src || '');
    const shouldRestartSameSource = (isFallbackVisible || isPlaceholderVisible) &&
      currentRenderedSrc === nextSrc &&
      currentSrc !== nextSrc;
    if (currentSrc === nextSrc) {
      if ((isFallbackVisible || isPlaceholderVisible) && img.complete && img.naturalWidth > 0) {
        if (!shouldDeferResolve) {
          showResolvedFavicon(img);
        }
        return false;
      }
      if (!isFallbackVisible && !isPlaceholderVisible) {
        return false;
      }
    }
    const hasAppeared = img.getAttribute('data-favicon-has-appeared') === 'true';
    const shouldAnimate = !hasAppeared;
    if (shouldAnimate || isFallbackVisible || isPlaceholderVisible) {
      ensureFaviconStartsLoading(img);
      showPendingFallbackIcon(img);
    }
    img._xFaviconLoadToken = (img._xFaviconLoadToken || 0) + 1;
    const token = img._xFaviconLoadToken;
    const finalize = (): void => {
      if (token !== img._xFaviconLoadToken) {
        return;
      }
      if (!shouldDeferResolve) {
        showResolvedFavicon(img);
      }
      img.setAttribute('data-favicon-current-src', nextSrc);
      if (nextSrc.startsWith('data:') && sourceUrl) {
        img.setAttribute('data-favicon-data-source', sourceUrl);
      } else {
        img.removeAttribute('data-favicon-data-source');
      }
      img.setAttribute('data-favicon-has-appeared', 'true');
      applyFaviconOpticalShift(img);
      const persistKey = getPersistCacheKey(img);
      if (shouldPersist && persistKey) {
        if (nextSrc.startsWith('data:')) {
          setPersistedFaviconData(persistKey, nextSrc);
        } else if (shouldPersistFaviconUrl(nextSrc, img)) {
          setPersistedFaviconUrl(persistKey, nextSrc);
        }
      }
      if (shouldDeferResolve || !shouldAnimate) {
        setFaviconLoadState(img, '');
        img.style.setProperty('filter', 'none');
        img.style.setProperty('opacity', '1');
        img.style.setProperty('transition', 'none');
        return;
      }
      setFaviconLoadState(img, 'priming');
      requestFrame(() => {
        if (token !== img._xFaviconLoadToken) {
          return;
        }
        setFaviconLoadState(img, 'loaded');
      });
    };
    img.addEventListener('load', finalize, { once: true });
    if (shouldRestartSameSource) {
      img.removeAttribute('src');
    }
    img.src = nextSrc;
    if (img.complete && img.naturalWidth > 0) {
      finalize();
    }
    return true;
  }

  function canReuseCurrentFavicon(img: FaviconImage | null | undefined, nextSrc: string): boolean {
    if (!img || !nextSrc) {
      return false;
    }
    const currentSrc = img.getAttribute('data-favicon-current-src') || img.src || '';
    if (currentSrc !== nextSrc) {
      return false;
    }
    const isFallback = img.getAttribute('data-fallback-icon') === 'true';
    const isPlaceholder = img.getAttribute('data-favicon-placeholder') === 'true';
    if (isFallback || isPlaceholder) {
      return false;
    }
    const currentResolved = img.getAttribute('data-favicon-current-src') || '';
    if (currentResolved === nextSrc) {
      return true;
    }
    return Boolean(img.complete && img.naturalWidth > 0);
  }

  function getLastWorkingFaviconSrc(img: FaviconImage | null | undefined): string {
    if (!img) {
      return '';
    }
    if (ignoreLastWorkingWhenFallback && img.getAttribute('data-fallback-icon') === 'true') {
      return '';
    }
    const resolved = img.getAttribute('data-favicon-current-src') || '';
    if (resolved) {
      return resolved;
    }
    if (img.complete && img.naturalWidth > 0) {
      return img.src || '';
    }
    return '';
  }

  // After a failed candidate: back to the icon that worked, or the fallback.
  function restoreWorkingFaviconOrFallback(
    img: FaviconImage,
    previousSrc: string | null | undefined,
    restoreOptions?: FaviconRestoreOptions | null
  ): boolean {
    const fallbackSrc = String(previousSrc || '').trim();
    const optionsForRestore: FaviconRestoreOptions = restoreOptions || {};
    if (fallbackSrc) {
      const applied = setFaviconSrcWithAnimation(img, fallbackSrc);
      if (applied || canReuseCurrentFavicon(img, fallbackSrc)) {
        if (!applied) {
          // The failed candidate can still be the rendered src while the
          // working icon is only remembered, and its interrupted reveal can
          // leave the blurred priming state behind. Restore both.
          if (String(img.getAttribute('src') || '') !== fallbackSrc) {
            img.src = fallbackSrc;
          }
          if (img.getAttribute('data-favicon-load-state') === 'priming') {
            setFaviconLoadState(img, 'loaded');
          }
          showResolvedFavicon(img);
        }
        return true;
      }
    }
    if (typeof optionsForRestore.hideFallbackNode === 'function') {
      optionsForRestore.hideFallbackNode(img);
    }
    if (typeof optionsForRestore.onFailed === 'function') {
      optionsForRestore.onFailed();
    } else if (typeof optionsForRestore.applyFallbackIcon === 'function') {
      optionsForRestore.applyFallbackIcon(img);
    }
    return false;
  }

  // Swaps the image to the icon's cached data URL once the background has it.
  function attachFaviconData(
    img: FaviconImage | null | undefined,
    url: string,
    hostOverride?: string,
    pageUrl?: string
  ): void {
    if (!img || !url) {
      return;
    }
    const target = img;
    const sourceUrl = String(url || '').trim();
    const cached = faviconDataCache.get(url);
    if (cached) {
      if (!isCurrentFaviconSource(target, sourceUrl)) {
        return;
      }
      setFaviconSrcWithAnimation(img, cached, { sourceUrl });
      preloadThemeFromFavicon(url, cached, hostOverride);
      return;
    }
    requestFaviconData(url, pageUrl).then((dataUrl) => {
      if (!dataUrl || !isCurrentFaviconSource(target, sourceUrl)) {
        return;
      }
      setFaviconSrcWithAnimation(target, dataUrl, { sourceUrl });
      preloadThemeFromFavicon(url, dataUrl, hostOverride);
    });
  }

  function preloadIcon(url: string): void {
    if (!url || url.startsWith('data:') || iconPreloadCache.has(url) || isBlockedLocalFaviconUrl(url)) {
      return;
    }
    const host = getHostFromUrl(url);
    if (host && shouldBlockFaviconForHost(host)) {
      return;
    }
    const img = createImage();
    if (!img) {
      return;
    }
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    BoundedCache.setBoundedCacheEntry(iconPreloadCache, url, img, iconPreloadCacheMaxEntries);
  }

  // Starts loading the icons (and the theme icons) of results about to show.
  function warmIconCache(list: ReadonlyArray<FaviconWarmItem | null | undefined> | null | undefined): void {
    if (!Array.isArray(list)) {
      return;
    }
    list.forEach((item: FaviconWarmItem | null | undefined) => {
      if (!item) {
        return;
      }
      const skipType = item.type === 'browserPage' ||
        item.type === 'directUrl' ||
        item.type === 'newtab' ||
        item.type === 'googleSuggest';
      const favicon = item.favicon;
      if (favicon && !skipType) {
        preloadIcon(favicon);
        const hostKey = item.url ? getHostFromUrl(item.url) : '';
        requestFaviconData(favicon).then((dataUrl) => {
          if (dataUrl) {
            preloadThemeFromFavicon(favicon, dataUrl, hostKey);
          }
        });
      }
      const hostKeyForTheme = item && item.url ? getHostFromUrl(item.url) : '';
      if (hostKeyForTheme && !hasThemeForHost(hostKeyForTheme)) {
        const themeIcon = getThemeFaviconUrl(hostKeyForTheme, item);
        if (themeIcon) {
          requestFaviconData(themeIcon).then((dataUrl) => {
            if (dataUrl) {
              preloadThemeFromFavicon(themeIcon, dataUrl, hostKeyForTheme);
            }
          });
        }
      }
    });
  }

  function dedupeFaviconCandidateUrls(urls: ReadonlyArray<string | null | undefined> | null | undefined): string[] {
    const unique: string[] = [];
    const seen = new Set<string>();
    (urls || []).forEach((item) => {
      const value = String(item || '').trim();
      if (!value || seen.has(value)) {
        return;
      }
      seen.add(value);
      unique.push(value);
    });
    return unique;
  }

  return Object.freeze({
    createImage,
    setFallbackNodeVisible,
    setFaviconLoadState,
    applyFaviconOpticalShift,
    applyFaviconOpticalAlignment,
    cacheFaviconData,
    requestFaviconData,
    setFaviconSrcWithAnimation,
    canReuseCurrentFavicon,
    getLastWorkingFaviconSrc,
    restoreWorkingFaviconOrFallback,
    attachFaviconData,
    preloadIcon,
    warmIconCache,
    dedupeFaviconCandidateUrls,
    detectDefaultExtensionFavicon
  });
}

function setFallbackNodeVisible(node: Element | null | undefined, visible: boolean): void {
  if (!node) {
    return;
  }
  node.setAttribute('data-visible', visible ? 'true' : 'false');
}

// Keeps the fallback icon node a view draws beside each favicon <img> in step
// with the image's resolved, pending and failed states. Surfaces differ only
// in where their views put the node and how they show or hide the image.
interface FallbackIconPresenterOptions {
  fallbackClassName: string;
  // The sibling of the image where its view draws the node.
  getFallbackSibling(img: FaviconImage): Element | null;
  // Sizes a node before it shows, e.g. to the image it stands in for.
  styleFallbackNode?(img: FaviconImage, node: HTMLElement): void;
  setImageVisible(img: FaviconImage, visible: boolean): void;
  clearCandidateTimer(img: FaviconImage): void;
  setTimer(callback: () => void, delay: number): unknown;
}

function createFallbackIconPresenter(options: FallbackIconPresenterOptions) {
  const {
    fallbackClassName,
    getFallbackSibling,
    setImageVisible,
    clearCandidateTimer,
    setTimer
  } = options;
  const styleFallbackNode = options.styleFallbackNode || noop;

  function findFallbackIconNode(img: FaviconImage | null | undefined): HTMLElement | null {
    const sibling = img ? getFallbackSibling(img) : null;
    return isHtmlElement(sibling) && sibling.classList.contains(fallbackClassName) ? sibling : null;
  }

  function setFallbackIconVisible(img: FaviconImage | null | undefined, visible: boolean): void {
    const node = findFallbackIconNode(img);
    if (node && img && visible) {
      styleFallbackNode(img, node);
    }
    setFallbackNodeVisible(node, visible);
  }

  function hideFallbackIconNode(img: FaviconImage | null | undefined): void {
    setFallbackIconVisible(img, false);
  }

  function showResolvedFavicon(img: FaviconImage | null | undefined): void {
    if (!img) {
      return;
    }
    clearCandidateTimer(img);
    setFallbackIconVisible(img, false);
    img.removeAttribute('data-fallback-icon');
    img.removeAttribute('data-favicon-placeholder');
    setImageVisible(img, true);
  }

  // The image may not be in its view yet, so look for the node once more on
  // the next task while the image still waits on the same state.
  function revealFallbackNode(img: FaviconImage, stateAttribute: string, clearedAttribute: string): void {
    img.removeAttribute(clearedAttribute);
    img.setAttribute(stateAttribute, 'true');
    setImageVisible(img, false);
    if (findFallbackIconNode(img)) {
      setFallbackIconVisible(img, true);
      return;
    }
    setTimer(() => {
      if (!img.isConnected || img.getAttribute(stateAttribute) !== 'true') {
        return;
      }
      setFallbackIconVisible(img, true);
    }, 0);
  }

  function showPendingFallbackIcon(img: FaviconImage | null | undefined): void {
    if (!img) {
      return;
    }
    revealFallbackNode(img, 'data-favicon-placeholder', 'data-fallback-icon');
  }

  function applyFallbackIcon(img: FaviconImage | null | undefined): void {
    if (!img) {
      return;
    }
    clearCandidateTimer(img);
    revealFallbackNode(img, 'data-fallback-icon', 'data-favicon-placeholder');
  }

  return Object.freeze({
    findFallbackIconNode,
    setFallbackIconVisible,
    hideFallbackIconNode,
    showResolvedFavicon,
    showPendingFallbackIcon,
    applyFallbackIcon
  });
}

type FaviconViewCore = ReturnType<typeof createFaviconViewCore>;
type FallbackIconPresenter = ReturnType<typeof createFallbackIconPresenter>;

export type {
  FallbackIconPresenter,
  FallbackIconPresenterOptions,
  FaviconImage,
  FaviconRestoreOptions,
  FaviconSrcOptions,
  FaviconViewCore,
  FaviconViewCoreOptions,
  FaviconViewWindow,
  FaviconWarmItem
};
export { createFaviconViewCore, createFallbackIconPresenter, setFallbackNodeVisible };
