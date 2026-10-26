// Puts an icon into a favicon <img>: the reveal motion the first time an
// image shows an icon, the attributes that remember what it shows, and the
// way back to the last icon that worked after a candidate fails.
import {
  applyFaviconOpticalShift,
  ensureFaviconStartsLoading,
  setFaviconIntrinsicSize,
  setFaviconLoadState
} from './favicon-pixels';
import type { FaviconImage } from './favicon-pixels';

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

// What the surface does around a reveal.
interface FaviconRevealHooks {
  showResolvedFavicon(img: FaviconImage): void;
  showPendingFallbackIcon(img: FaviconImage): void;
  // The key the surface remembers an image's icon under; none when empty.
  getPersistCacheKey(img: FaviconImage): string;
  setPersistedFaviconUrl(key: string, url: string): void;
  setPersistedFaviconData(key: string, dataUrl: string): void;
  shouldPersistFaviconUrl(url: string, img: FaviconImage): boolean;
  isBlockedUrl(url: string): boolean;
  requestFrame(callback: () => void): void;
}

// One load of an icon into an image.
interface RevealLoad {
  img: FaviconImage;
  token: number;
  nextSrc: string;
  sourceUrl: string;
  persist: boolean;
  deferResolve: boolean;
  animate: boolean;
}

// Whether the image stands in for its icon: the fallback or the placeholder.
function isStandingIn(img: FaviconImage): boolean {
  return img.getAttribute('data-fallback-icon') === 'true' || img.getAttribute('data-favicon-placeholder') === 'true';
}

class FaviconReveal {
  private readonly doc: Document | null;
  private readonly hooks: FaviconRevealHooks;
  // A failed load does not fall back to the icon behind a fallback node.
  private readonly ignoreLastWorkingWhenFallback: boolean;

  constructor(doc: Document | null, hooks: FaviconRevealHooks, ignoreLastWorkingWhenFallback: boolean) {
    this.doc = doc;
    this.hooks = hooks;
    this.ignoreLastWorkingWhenFallback = ignoreLastWorkingWhenFallback;
  }

  // Loads the icon into the image, revealing it the first time; false when
  // the image already shows it or the URL is blocked.
  readonly setSrc = (img: FaviconImage | null | undefined, nextSrc: string, options?: FaviconSrcOptions | null): boolean => {
    if (!img || !nextSrc || this.hooks.isBlockedUrl(nextSrc)) {
      return false;
    }
    setFaviconIntrinsicSize(img);
    const deferResolve = Boolean(options && options.deferResolve);
    const standingIn = isStandingIn(img);
    const currentSrc = img.getAttribute('data-favicon-current-src') || '';
    if (currentSrc === nextSrc && this.keepsCurrent(img, standingIn, deferResolve)) {
      return false;
    }
    this.startLoad(img, nextSrc, options, standingIn && currentSrc !== nextSrc);
    return true;
  };

  readonly canReuse = (img: FaviconImage | null | undefined, nextSrc: string): boolean => {
    if (!img || !nextSrc) {
      return false;
    }
    const currentSrc = img.getAttribute('data-favicon-current-src') || img.src || '';
    if (currentSrc !== nextSrc || isStandingIn(img)) {
      return false;
    }
    if ((img.getAttribute('data-favicon-current-src') || '') === nextSrc) {
      return true;
    }
    return Boolean(img.complete && img.naturalWidth > 0);
  };

  readonly getLastWorkingSrc = (img: FaviconImage | null | undefined): string => {
    if (!img) {
      return '';
    }
    if (this.ignoreLastWorkingWhenFallback && img.getAttribute('data-fallback-icon') === 'true') {
      return '';
    }
    const resolved = img.getAttribute('data-favicon-current-src') || '';
    if (resolved) {
      return resolved;
    }
    return img.complete && img.naturalWidth > 0 ? img.src || '' : '';
  };

  // After a failed candidate: back to the icon that worked, or the fallback.
  readonly restoreWorkingOrFallback = (
    img: FaviconImage,
    previousSrc: string | null | undefined,
    options?: FaviconRestoreOptions | null
  ): boolean => {
    const fallbackSrc = String(previousSrc || '').trim();
    if (fallbackSrc && this.restoreWorking(img, fallbackSrc)) {
      return true;
    }
    const restore: FaviconRestoreOptions = options || {};
    if (typeof restore.hideFallbackNode === 'function') {
      restore.hideFallbackNode(img);
    }
    if (typeof restore.onFailed === 'function') {
      restore.onFailed();
    } else if (typeof restore.applyFallbackIcon === 'function') {
      restore.applyFallbackIcon(img);
    }
    return false;
  };

  // Loads the icon; `restartable` when the image stood in for an icon, so
  // the same source loads again.
  private startLoad(img: FaviconImage, nextSrc: string, options: FaviconSrcOptions | null | undefined, restartable: boolean): void {
    const renderedSrc = String(img.getAttribute('src') || img.src || '');
    const restartSameSource = restartable && renderedSrc === nextSrc;
    const animate = img.getAttribute('data-favicon-has-appeared') !== 'true';
    if (animate || isStandingIn(img)) {
      ensureFaviconStartsLoading(img);
      this.hooks.showPendingFallbackIcon(img);
    }
    img._xFaviconLoadToken = (img._xFaviconLoadToken || 0) + 1;
    const load: RevealLoad = {
      img,
      token: img._xFaviconLoadToken,
      nextSrc,
      sourceUrl: String((options && options.sourceUrl) || '').trim(),
      persist: !(options && options.persist === false),
      deferResolve: Boolean(options && options.deferResolve),
      animate
    };
    img.addEventListener('load', () => this.finish(load), { once: true });
    if (restartSameSource) {
      img.removeAttribute('src');
    }
    img.src = nextSrc;
    if (img.complete && img.naturalWidth > 0) {
      this.finish(load);
    }
  }

  // Whether the image already shows its icon; shows it when it stood in
  // for an icon that has loaded meanwhile.
  private keepsCurrent(img: FaviconImage, standingIn: boolean, deferResolve: boolean): boolean {
    if (standingIn && img.complete && img.naturalWidth > 0) {
      if (!deferResolve) {
        this.hooks.showResolvedFavicon(img);
      }
      return true;
    }
    return !standingIn;
  }

  private restoreWorking(img: FaviconImage, fallbackSrc: string): boolean {
    const applied = this.setSrc(img, fallbackSrc);
    if (applied) {
      return true;
    }
    if (!this.canReuse(img, fallbackSrc)) {
      return false;
    }
    // The failed candidate can still be the rendered src while the working
    // icon is only remembered, and its interrupted reveal can leave the
    // blurred priming state behind. Restore both.
    if (String(img.getAttribute('src') || '') !== fallbackSrc) {
      img.src = fallbackSrc;
    }
    if (img.getAttribute('data-favicon-load-state') === 'priming') {
      setFaviconLoadState(img, 'loaded');
    }
    this.hooks.showResolvedFavicon(img);
    return true;
  }

  private finish(load: RevealLoad): void {
    const { img, token, nextSrc } = load;
    if (token !== img._xFaviconLoadToken) {
      return;
    }
    if (!load.deferResolve) {
      this.hooks.showResolvedFavicon(img);
    }
    img.setAttribute('data-favicon-current-src', nextSrc);
    if (nextSrc.startsWith('data:') && load.sourceUrl) {
      img.setAttribute('data-favicon-data-source', load.sourceUrl);
    } else {
      img.removeAttribute('data-favicon-data-source');
    }
    img.setAttribute('data-favicon-has-appeared', 'true');
    applyFaviconOpticalShift(this.doc, img);
    if (load.persist) {
      this.persist(img, nextSrc);
    }
    if (load.deferResolve || !load.animate) {
      setFaviconLoadState(img, '');
      img.style.setProperty('filter', 'none');
      img.style.setProperty('opacity', '1');
      img.style.setProperty('transition', 'none');
      return;
    }
    setFaviconLoadState(img, 'priming');
    this.hooks.requestFrame(() => {
      if (token === img._xFaviconLoadToken) {
        setFaviconLoadState(img, 'loaded');
      }
    });
  }

  private persist(img: FaviconImage, src: string): void {
    const key = this.hooks.getPersistCacheKey(img);
    if (!key) {
      return;
    }
    if (src.startsWith('data:')) {
      this.hooks.setPersistedFaviconData(key, src);
    } else if (this.hooks.shouldPersistFaviconUrl(src, img)) {
      this.hooks.setPersistedFaviconUrl(key, src);
    }
  }
}

export type { FaviconRestoreOptions, FaviconRevealHooks, FaviconSrcOptions };
export { FaviconReveal };
