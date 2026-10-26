// What the New Tab and overlay favicons share: loading an icon into an
// <img> with its reveal motion, optical centering, the data URL cache the
// background fills, preloading, and the fallback icon beside an image.
import type { MessageRuntime } from '../../platform/messaging';
import { isHtmlElement } from '../dom-guards';
import * as BoundedCache from '../../domain/bounded-cache';
import { FaviconDataStore } from './favicon-data-store';
import { applyFaviconOpticalAlignment, applyFaviconOpticalShift, setFaviconLoadState } from './favicon-pixels';
import type { FaviconImage } from './favicon-pixels';
import { FaviconReveal } from './favicon-reveal';
import type { FaviconRevealHooks } from './favicon-reveal';
import { PlaceholderDetector } from './placeholder-detector';

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

// What the surface tells the warming of icons.
interface WarmHooks {
  getHostFromUrl(url: string): string;
  shouldBlockFaviconForHost(host: string): boolean;
  isBlockedUrl(url: string): boolean;
  preloadThemeFromFavicon(url: string, dataUrl: string, hostOverride?: string): void;
  getThemeFaviconUrl(hostKey: string, item: FaviconWarmItem): string;
  hasThemeForHost(hostKey: string): boolean;
}

function noop(): void {}
// The global timers with the DOM's numeric ids.
const globalTimers: Pick<Window, 'setTimeout'> = globalThis;
// Results whose icon is not a site's own.
const UNWARMED_TYPES = new Set(['browserPage', 'directUrl', 'newtab', 'googleSuggest']);

function readLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function orNull<F extends (...args: never[]) => unknown>(value: F | undefined): F | null {
  return typeof value === 'function' ? value : null;
}

function pick<F extends (...args: never[]) => unknown>(value: F | undefined, fallback: F): F {
  return typeof value === 'function' ? value : fallback;
}

// The page's next frame, or a 16ms timer without one.
function createFrameRequest(win: FaviconViewWindow): (callback: () => void) => void {
  const windowRequestFrame = win.requestAnimationFrame;
  const windowSetTimeout = win.setTimeout;
  return (callback) => {
    if (typeof windowRequestFrame === 'function') {
      Reflect.apply(windowRequestFrame, win, [callback]);
    } else if (typeof windowSetTimeout === 'function') {
      Reflect.apply(windowSetTimeout, win, [callback, 16]);
    } else {
      globalTimers.setTimeout(callback, 16);
    }
  };
}

function readRevealHooks(config: FaviconViewCoreOptions, win: FaviconViewWindow): FaviconRevealHooks {
  return {
    showResolvedFavicon: pick(config.showResolvedFavicon, noop),
    showPendingFallbackIcon: pick(config.showPendingFallbackIcon, noop),
    getPersistCacheKey: pick(config.getPersistCacheKey, () => ''),
    setPersistedFaviconUrl: pick(config.setPersistedFaviconUrl, noop),
    setPersistedFaviconData: pick(config.setPersistedFaviconData, noop),
    shouldPersistFaviconUrl: pick(config.shouldPersistFaviconUrl, () => true),
    isBlockedUrl: pick(config.isBlockedLocalFaviconUrl, () => false),
    requestFrame: createFrameRequest(win)
  };
}

function readWarmHooks(config: FaviconViewCoreOptions): WarmHooks {
  return {
    getHostFromUrl: pick(config.getHostFromUrl, () => ''),
    shouldBlockFaviconForHost: pick(config.shouldBlockFaviconForHost, () => false),
    isBlockedUrl: pick(config.isBlockedLocalFaviconUrl, () => false),
    preloadThemeFromFavicon: pick(config.preloadThemeFromFavicon, noop),
    getThemeFaviconUrl: pick(config.getThemeFaviconUrl, () => ''),
    hasThemeForHost: pick(config.hasThemeForHost, () => false)
  };
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

// Starts loading icons ahead of the results that show them, and their data
// URLs with the site themes read from them.
class IconWarmer {
  private readonly hooks: WarmHooks;
  private readonly data: FaviconDataStore;
  private readonly createImage: () => HTMLImageElement | null;
  private readonly preloaded: Map<string, HTMLImageElement>;
  private readonly maxEntries: number;

  constructor(hooks: WarmHooks, data: FaviconDataStore, createImage: () => HTMLImageElement | null,
    preloaded: Map<string, HTMLImageElement>, maxEntries: number) {
    this.hooks = hooks;
    this.data = data;
    this.createImage = createImage;
    this.preloaded = preloaded;
    this.maxEntries = maxEntries;
  }

  readonly preload = (url: string): void => {
    const { hooks } = this;
    if (!url || url.startsWith('data:') || this.preloaded.has(url) || hooks.isBlockedUrl(url)) {
      return;
    }
    const host = hooks.getHostFromUrl(url);
    if (host && hooks.shouldBlockFaviconForHost(host)) {
      return;
    }
    const img = this.createImage();
    if (!img) {
      return;
    }
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    BoundedCache.setBoundedCacheEntry(this.preloaded, url, img, this.maxEntries);
  };

  // Starts loading the icons (and the theme icons) of results about to show.
  readonly warm = (list: ReadonlyArray<FaviconWarmItem | null | undefined> | null | undefined): void => {
    if (!Array.isArray(list)) {
      return;
    }
    list.forEach((item: FaviconWarmItem | null | undefined) => {
      if (item) {
        this.warmItem(item);
      }
    });
  };

  private warmItem(item: FaviconWarmItem): void {
    const { hooks } = this;
    const hostKey = item.url ? hooks.getHostFromUrl(item.url) : '';
    const favicon = item.favicon;
    if (favicon && !UNWARMED_TYPES.has(String(item.type))) {
      this.preload(favicon);
      this.warmTheme(favicon, hostKey);
    }
    if (hostKey && !hooks.hasThemeForHost(hostKey)) {
      const themeIcon = hooks.getThemeFaviconUrl(hostKey, item);
      if (themeIcon) {
        this.warmTheme(themeIcon, hostKey);
      }
    }
  }

  private warmTheme(iconUrl: string, hostKey: string): void {
    void this.data.request(iconUrl).then((dataUrl) => {
      if (dataUrl) {
        this.hooks.preloadThemeFromFavicon(iconUrl, dataUrl, hostKey);
      }
    });
  }
}

function createFaviconViewCore(options?: FaviconViewCoreOptions | null) {
  const config: FaviconViewCoreOptions = options || {};
  const doc = config.document || globalThis.document || null;
  const win: FaviconViewWindow = config.windowObj || globalThis;
  const chromeApi = config.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
  const ImageCtor = win.Image || globalThis.Image || null;
  const createImage = (): HTMLImageElement | null => {
    if (typeof ImageCtor === 'function') {
      return new ImageCtor();
    }
    return doc ? doc.createElement('img') : null;
  };
  const warmHooks = readWarmHooks(config);
  const data = new FaviconDataStore({
    runtime: chromeApi && chromeApi.runtime ? chromeApi.runtime : null,
    request: orNull(config.requestFaviconData),
    isBlockedUrl: warmHooks.isBlockedUrl,
    cache: config.faviconDataCache || new Map(),
    pending: config.faviconDataPending || new Map(),
    maxEntries: readLimit(config.faviconDataCacheMaxEntries, 256)
  });
  const reveal = new FaviconReveal(doc, readRevealHooks(config, win), Boolean(config.ignoreLastWorkingWhenFallback));
  const placeholders = new PlaceholderDetector(doc, createImage, readLimit(config.placeholderProbeCacheMaxEntries, 32),
    orNull(config.detectDefaultExtensionFavicon));
  const warmer = new IconWarmer(warmHooks, data, createImage, config.iconPreloadCache || new Map(),
    readLimit(config.iconPreloadCacheMaxEntries, 192));

  // Swaps the image to the icon's cached data URL once the background has it.
  function attachFaviconData(img: FaviconImage | null | undefined, url: string, hostOverride?: string, pageUrl?: string): void {
    if (!img || !url) {
      return;
    }
    const sourceUrl = String(url || '').trim();
    const show = (dataUrl: string): void => {
      reveal.setSrc(img, dataUrl, { sourceUrl });
      warmHooks.preloadThemeFromFavicon(url, dataUrl, hostOverride);
    };
    const cached = data.get(url);
    if (cached) {
      if (isCurrentFaviconSource(img, sourceUrl)) {
        show(cached);
      }
      return;
    }
    void data.request(url, pageUrl).then((dataUrl) => {
      if (dataUrl && isCurrentFaviconSource(img, sourceUrl)) {
        show(dataUrl);
      }
    });
  }

  return Object.freeze({
    createImage,
    setFallbackNodeVisible,
    setFaviconLoadState,
    applyFaviconOpticalShift: (img: FaviconImage | null | undefined) => applyFaviconOpticalShift(doc, img),
    applyFaviconOpticalAlignment: (img: FaviconImage | null | undefined) => applyFaviconOpticalAlignment(doc, img),
    cacheFaviconData: data.put,
    requestFaviconData: data.request,
    setFaviconSrcWithAnimation: reveal.setSrc,
    canReuseCurrentFavicon: reveal.canReuse,
    getLastWorkingFaviconSrc: reveal.getLastWorkingSrc,
    restoreWorkingFaviconOrFallback: reveal.restoreWorkingOrFallback,
    attachFaviconData,
    preloadIcon: warmer.preload,
    warmIconCache: warmer.warm,
    dedupeFaviconCandidateUrls,
    detectDefaultExtensionFavicon: placeholders.detect
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
  FaviconViewCore,
  FaviconViewCoreOptions,
  FaviconViewWindow,
  FaviconWarmItem
};
export { createFaviconViewCore, createFallbackIconPresenter, setFallbackNodeVisible };
