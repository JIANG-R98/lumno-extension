(function() {
  const PRELOAD_STORAGE_KEY = '_x_extension_newtab_wallpaper_preload_2026_unique_';
  const PRELOAD_STORAGE_VERSION = 4;
  const WALLPAPER_EFFECT_STORAGE_KEY = '_x_extension_newtab_wallpaper_effect_2026_unique_';
  const FAVICON_STORAGE_KEY = '_x_extension_newtab_favicon_2026_unique_';
  const FAVICON_PRELOAD_STORAGE_KEY = '_x_extension_newtab_favicon_preload_2026_unique_';
  const providerStorageRuntime = globalThis.LumnoSettings.createProviderStorageRuntime(window.chrome);
  // Only bundled files paint on the first frame. Online photos and links paint from this device's
  // IndexedDB copy as soon as it is read, so a slow or failing network never holds the tab's spinner
  // or blanks the page; uploads paint from the local wallpaper library the same way.
  const WALLPAPER_PATH_PATTERN = /^(?:assets\/wallpapers|output\/imagegen)\/[-.\w]+\.webp$/;
  // Shared with createWallpaperImageCache in wallpaper-local-store.js.
  const IMAGE_CACHE_DB_NAME = 'lumno-newtab-wallpaper-cache';
  const IMAGE_CACHE_STORE_NAME = 'images';
  // Shared with createWallpaperLocalStore in wallpaper-local-store.js.
  const CUSTOM_WALLPAPER_DB_NAME = 'lumno-newtab-wallpaper';
  const CUSTOM_WALLPAPER_STORE_NAME = 'wallpapers';
  const CUSTOM_WALLPAPER_ID_PATTERN = /^custom-wallpaper-[-\w]+$/;
  // Longer data URLs reach CSS as blob URLs, as in wallpaper.js (WALLPAPER_CSS_INLINE_URL_MAX_LENGTH):
  // every style recalculation re-reads the whole custom property, which a megabyte makes slow.
  const CSS_INLINE_URL_MAX_LENGTH = 32 * 1024;
  // Chrome drops a CSS custom property longer than this (MAX_CSS_URL_LENGTH in wallpaper-local-store.js).
  const CSS_CUSTOM_PROPERTY_MAX_LENGTH = 2 * 1024 * 1024;
  const FAVICON_OPTIONS = {
    default: {
      file: 'assets/images/lumno.png',
      type: 'image/png',
      sizes: ''
    },
    alternate: {
      file: 'assets/images/lumno-newtab-favicon.svg',
      type: 'image/svg+xml',
      sizes: 'any'
    }
  };

  function normalizeWallpaperMode(value) {
    return value === 'dark' ? 'dark' : 'light';
  }

  function resolveCachedWallpaperMode(data) {
    const themeMode = data && typeof data.themeMode === 'string' ? data.themeMode : '';
    if (themeMode === 'dark' || themeMode === 'light') {
      return themeMode;
    }
    if (themeMode === 'system') {
      try {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      } catch (e) {
        return normalizeWallpaperMode(data && data.mode);
      }
    }
    return normalizeWallpaperMode(data && data.mode);
  }

  function normalizeEffectPrefs(value, inheritedVersion) {
    const effects = globalThis.LumnoNewtabWallpaperEffects;
    return effects.normalizePrefs(value, inheritedVersion);
  }

  function getEffectPrefsForMode(value, mode) {
    const effects = globalThis.LumnoNewtabWallpaperEffects;
    return effects.normalizeStoragePrefs(value)[mode];
  }

  function readStoredEffectPrefs(mode, cachedPrefs) {
    if (cachedPrefs) {
      return Promise.resolve(cachedPrefs);
    }
    const storage = providerStorageRuntime
      ? providerStorageRuntime.area
      : (window.chrome && window.chrome.storage &&
        (window.chrome.storage.sync || window.chrome.storage.local));
    if (!storage || typeof storage.get !== 'function') {
      return Promise.resolve(normalizeEffectPrefs(null));
    }
    return new Promise((resolve) => {
      try {
        storage.get([WALLPAPER_EFFECT_STORAGE_KEY], (result) => {
          resolve(getEffectPrefsForMode(
            result && result[WALLPAPER_EFFECT_STORAGE_KEY],
            mode
          ) || normalizeEffectPrefs(null));
        });
      } catch (_error) {
        resolve(normalizeEffectPrefs(null));
      }
    });
  }

  function readCachedWallpaper() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem(PRELOAD_STORAGE_KEY) : '';
      if (!raw) {
        return null;
      }
      const data = JSON.parse(raw);
      if (!data ||
          Number(data.version) !== PRELOAD_STORAGE_VERSION ||
          !data.wallpapers ||
          !data.overlayStops) {
        return null;
      }
      const mode = resolveCachedWallpaperMode(data);
      const entry = data.wallpapers[mode];
      const path = entry && typeof entry.path === 'string' ? entry.path.trim() : '';
      const overlayStops = normalizeCachedOverlayStops(data.overlayStops);
      if (!overlayStops) {
        return null;
      }
      return {
        mode,
        id: entry && typeof entry.id === 'string' ? entry.id : '',
        path: WALLPAPER_PATH_PATTERN.test(path) ? path : '',
        cachedImage: normalizeCachedImage(entry && entry.cachedImage),
        customImage: normalizeCustomImage(entry && entry.customImage),
        luminance: normalizeLuminance(entry && entry.luminance),
        overlayStops,
        effectPrefs: getEffectPrefsForMode(data.wallpaperEffects, mode)
      };
    } catch (e) {
      return null;
    }
  }

  function normalizeCachedImage(value) {
    const id = value && typeof value.id === 'string' ? value.id : '';
    const url = value && typeof value.url === 'string' ? value.url : '';
    return id && url ? { id, url } : null;
  }

  function normalizeCustomImage(value) {
    const id = value && typeof value.id === 'string' ? value.id : '';
    const key = value && typeof value.key === 'string' && value.key ? value.key : id;
    return CUSTOM_WALLPAPER_ID_PATTERN.test(id) && key ? { id, key } : null;
  }

  // The wallpaper's average luminance (0–1), which the blur effect's frost blends by.
  function normalizeLuminance(value) {
    const luminance = typeof value === 'number' ? value : NaN;
    return Number.isFinite(luminance) && luminance >= 0 && luminance <= 1 ? luminance : null;
  }

  // Reads one record from an IndexedDB store wallpaper.js keeps, and only one holding an image.
  function readStoredImageRecord(dbName, storeName, key, isExpectedRecord) {
    return new Promise((resolve) => {
      let request = null;
      try {
        request = window.indexedDB ? window.indexedDB.open(dbName, 1) : null;
      } catch (e) {
        request = null;
      }
      if (!request) {
        resolve(null);
        return;
      }
      // wallpaper.js creates the database; an empty one has nothing to paint.
      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        const finish = (record) => {
          db.close();
          resolve(record &&
            isExpectedRecord(record) &&
            typeof record.imageDataUrl === 'string' &&
            record.imageDataUrl.startsWith('data:image/') ? record : null);
        };
        try {
          const read = db.transaction(storeName, 'readonly')
            .objectStore(storeName)
            .get(key);
          read.onsuccess = () => finish(read.result);
          read.onerror = () => finish(null);
        } catch (e) {
          finish(null);
        }
      };
    });
  }

  // The copy wallpaper.js saved, and only when it is still the copy of the same image.
  function readCachedImage(cachedImage) {
    return readStoredImageRecord(IMAGE_CACHE_DB_NAME, IMAGE_CACHE_STORE_NAME, cachedImage.id,
      (record) => record.url === cachedImage.url);
  }

  // The upload itself, from the local wallpaper library. Uploads never reuse an ID, so the record
  // under that key is always the image the entry named.
  function readCustomImage(customImage) {
    return readStoredImageRecord(CUSTOM_WALLPAPER_DB_NAME, CUSTOM_WALLPAPER_STORE_NAME, customImage.key,
      () => true);
  }

  // wallpaper.js adopts the blob URL (cssObjectUrl) instead of making its own, so the background
  // never swaps to a second, still undecoded copy of the same image.
  function getCssSafeImageUrl(dataUrl) {
    if (dataUrl.length <= CSS_INLINE_URL_MAX_LENGTH ||
        !window.URL || typeof window.URL.createObjectURL !== 'function') {
      return { url: dataUrl, objectUrl: null };
    }
    try {
      const comma = dataUrl.indexOf(',');
      const meta = dataUrl.slice(5, comma);
      if (!/;base64$/i.test(meta)) {
        return { url: dataUrl, objectUrl: null };
      }
      const payload = dataUrl.slice(comma + 1);
      let bytes;
      if (typeof Uint8Array.fromBase64 === 'function') {
        bytes = Uint8Array.fromBase64(payload);
      } else {
        const binary = window.atob(payload);
        bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
      }
      const url = window.URL.createObjectURL(new window.Blob([bytes], { type: meta.replace(/;base64$/i, '') }));
      return { url, objectUrl: { source: dataUrl, url } };
    } catch (e) {
      // Past Chrome's custom-property limit the data URL would not paint at all; wallpaper.js tries again.
      return {
        url: getCssUrlValue(dataUrl).length <= CSS_CUSTOM_PROPERTY_MAX_LENGTH ? dataUrl : '',
        objectUrl: null
      };
    }
  }

  function normalizeCachedOverlayStops(value) {
    const result = {};
    const modes = ['light', 'dark'];
    const positions = ['top', 'mid', 'bottom'];
    for (const mode of modes) {
      const entry = value && value[mode];
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      result[mode] = {};
      for (const position of positions) {
        const stop = Number(entry[position]);
        if (!Number.isFinite(stop) || stop < 0 || stop > 100) {
          return null;
        }
        result[mode][position] = stop;
      }
    }
    return result;
  }

  function getRuntimeUrl(path) {
    if (window.chrome && window.chrome.runtime && typeof window.chrome.runtime.getURL === 'function') {
      return window.chrome.runtime.getURL(path);
    }
    return `../../${path}`;
  }

  function normalizeFaviconId(value) {
    const id = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(FAVICON_OPTIONS, id) ? id : '';
  }

  function readCachedFaviconId() {
    try {
      return normalizeFaviconId(window.localStorage ?
        window.localStorage.getItem(FAVICON_PRELOAD_STORAGE_KEY) :
        '');
    } catch (e) {
      return '';
    }
  }

  function cacheFaviconId(id) {
    const normalized = normalizeFaviconId(id);
    if (!normalized) {
      return;
    }
    try {
      if (window.localStorage) {
        window.localStorage.setItem(FAVICON_PRELOAD_STORAGE_KEY, normalized);
      }
    } catch (e) {
      // Ignore private-mode or quota failures; the runtime still applies the favicon later.
    }
  }

  function getFaviconLink() {
    if (!document.head) {
      return null;
    }
    const existing = Array.from(document.head.children || []).find((child) => {
      return child &&
        String(child.tagName || '').toUpperCase() === 'LINK' &&
        child.getAttribute &&
        child.getAttribute('data-lumno-newtab-favicon') === 'true';
    });
    if (existing) {
      return existing;
    }
    const link = document.createElement('link');
    link.setAttribute('data-lumno-newtab-favicon', 'true');
    document.head.appendChild(link);
    return link;
  }

  function applyFaviconId(id) {
    const normalized = normalizeFaviconId(id);
    const item = normalized ? FAVICON_OPTIONS[normalized] : null;
    const link = item ? getFaviconLink() : null;
    if (!link) {
      return false;
    }
    link.setAttribute('rel', 'icon');
    link.setAttribute('type', item.type);
    link.setAttribute('href', getRuntimeUrl(item.file));
    link.setAttribute('data-newtab-favicon-id', normalized);
    if (item.sizes) {
      link.setAttribute('sizes', item.sizes);
    } else {
      link.removeAttribute('sizes');
    }
    return true;
  }

  function applyStoredFaviconWhenAvailable() {
    const cachedId = readCachedFaviconId();
    if (cachedId) {
      applyFaviconId(cachedId);
    }
    try {
      const storage = providerStorageRuntime
        ? providerStorageRuntime.area
        : (window.chrome && window.chrome.storage && window.chrome.storage.sync);
      if (!storage || typeof storage.get !== 'function') {
        return;
      }
      storage.get([FAVICON_STORAGE_KEY], (result) => {
        const nextId = normalizeFaviconId(result && result[FAVICON_STORAGE_KEY]);
        if (!nextId) {
          return;
        }
        cacheFaviconId(nextId);
        applyFaviconId(nextId);
      });
    } catch (e) {
      // Best-effort only; wallpaper.js applies the definitive favicon after boot.
    }
  }

  function getCssUrlValue(url) {
    const safe = String(url || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '')
      .replace(/\r/g, '');
    return safe ? `url("${safe}")` : 'none';
  }

  function markBodyActive() {
    const shouldMarkActive = () => {
      return document.documentElement &&
        document.documentElement.getAttribute('data-wallpaper-active') === 'true';
    };
    if (document.body) {
      if (shouldMarkActive()) {
        document.body.setAttribute('data-wallpaper-active', 'true');
      }
      return;
    }
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body && shouldMarkActive()) {
        document.body.setAttribute('data-wallpaper-active', 'true');
      }
    }, { once: true });
  }

  applyStoredFaviconWhenAvailable();

  const cachedWallpaper = readCachedWallpaper();
  if (!cachedWallpaper) {
    return;
  }
  const root = document.documentElement;
  if (root) {
    root.setAttribute('data-wallpaper-preload-theme', cachedWallpaper.mode);
    ['light', 'dark'].forEach((mode) => {
      ['top', 'mid', 'bottom'].forEach((position) => {
        root.style.setProperty(
          `--x-nt-wallpaper-overlay-${mode}-${position}`,
          `${cachedWallpaper.overlayStops[mode][position]}%`
        );
      });
    });
  }

  function createPreloadState(fields) {
    return Object.assign({
      effectPrefsReady: readStoredEffectPrefs(cachedWallpaper.mode, cachedWallpaper.effectPrefs),
      // The URL of the image this page preloaded, once known; the luminance belongs to it. Unlike
      // imageUrl, wallpaper.js never changes it.
      initialImageUrl: '',
      luminance: cachedWallpaper.luminance,
      // Resolves once that image has loaded and decoded: the page stays hidden until then, so the
      // wallpaper appears whole, never part-drawn.
      imageDecoded: null,
      mode: cachedWallpaper.mode
    }, fields);
  }
  // Decodes the wallpaper while the page loads; wallpaper.js samples its tones from this image
  // (decodedImage) instead of loading and decoding the same file again.
  function decodeWallpaperImage(url, sourceUrl) {
    if (typeof window.Image !== 'function') {
      return null;
    }
    const ready = new Promise((resolve) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.onload = () => {
        const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
        decoded.then(() => resolve(image), () => resolve(image));
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
    return { url: sourceUrl || url, ready };
  }

  function applyWallpaperImage(url) {
    if (root) {
      root.style.setProperty('--x-nt-wallpaper-image', getCssUrlValue(url));
      root.style.setProperty('--x-nt-wallpaper-size', 'cover');
      root.style.setProperty('--x-nt-wallpaper-position', 'center center');
      root.setAttribute('data-wallpaper-active', 'true');
    }
    markBodyActive();
  }

  if (cachedWallpaper.path) {
    const url = getRuntimeUrl(cachedWallpaper.path);
    const decodedImage = decodeWallpaperImage(url);
    globalThis.LumnoNewtabWallpaperPreload = createPreloadState({
      imageUrl: url,
      initialImageUrl: url,
      decodedImage,
      imageDecoded: decodedImage ? decodedImage.ready : null,
      wallpaper: {
        id: cachedWallpaper.path,
        path: cachedWallpaper.path
      }
    });
    applyWallpaperImage(url);
    if (document.head) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      link.fetchPriority = 'high';
      document.head.appendChild(link);
    }
    return;
  }
  const customImage = cachedWallpaper.customImage;
  if (!cachedWallpaper.cachedImage && !customImage) {
    return;
  }
  // wallpaper.js sets runtimeApplied once it paints, and reuses cachedImageRecord instead of reading
  // the same copy or upload again.
  const preloadState = createPreloadState({
    imageUrl: '',
    imageReady: null,
    cachedImageRecord: null,
    customImageId: customImage ? customImage.id : '',
    cssObjectUrl: null,
    decodedImage: null,
    runtimeApplied: false,
    wallpaper: {
      id: customImage ? customImage.id : cachedWallpaper.id || cachedWallpaper.cachedImage.id
    }
  });
  const recordRead = customImage
    ? readCustomImage(customImage)
    : readCachedImage(cachedWallpaper.cachedImage);
  preloadState.imageReady = recordRead.then((record) => {
    preloadState.cachedImageRecord = record;
    if (!record || preloadState.runtimeApplied) {
      return '';
    }
    const cssImage = getCssSafeImageUrl(record.imageDataUrl);
    if (!cssImage.url) {
      return '';
    }
    preloadState.imageUrl = record.imageDataUrl;
    preloadState.initialImageUrl = record.imageDataUrl;
    preloadState.cssObjectUrl = cssImage.objectUrl;
    preloadState.decodedImage = decodeWallpaperImage(cssImage.url, record.imageDataUrl);
    preloadState.imageDecoded = preloadState.decodedImage ? preloadState.decodedImage.ready : null;
    applyWallpaperImage(cssImage.url);
    return record.imageDataUrl;
  });
  globalThis.LumnoNewtabWallpaperPreload = preloadState;
})();
