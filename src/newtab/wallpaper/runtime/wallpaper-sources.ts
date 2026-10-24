// @ts-nocheck
// Wallpaper identity: modes, ids and their prefs, built-in, custom, online
// and daily sources, and the files, URLs, thumbnails and names each resolves
// to.
function createWallpaperSources(deps) {
  const {
    NEWTAB_WALLPAPER_MODE_DARK,
    NEWTAB_WALLPAPER_MODE_LIGHT,
    NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
    NEWTAB_WALLPAPER_DEFAULT_ID,
    localWallpaperStore,
    isLinkWallpaperId,
    getLinkWallpaperById,
    REMOTE_CONTENT,
    getDailyWallpaperPick,
    remoteClient,
    NEWTAB_WALLPAPER_OPTIONS,
    NEWTAB_CUSTOM_WALLPAPER_ID,
    NEWTAB_WALLPAPER_THUMBNAIL_SUFFIX,
    NEWTAB_WALLPAPER_SAMPLE_SUFFIX,
    NEWTAB_WALLPAPER_SOURCE_SIZE,
    NEWTAB_WALLPAPER_EXTENSION_DIRECTORY,
    cachedWallpaperImages,
    dailyWallpaperStandIns,
    chrome,
    wallpaperNetworkImageStates,
    t
  } = deps;

  // The runtime state object shared with wallpaper.js and the other modules.
  const wallpaperState = deps.wallpaperState;

  const NEWTAB_WALLPAPER_DEFAULT_DIRECTORY = 'assets/wallpapers';

  function normalizeWallpaperMode(mode) {
    return mode === NEWTAB_WALLPAPER_MODE_DARK
      ? NEWTAB_WALLPAPER_MODE_DARK
      : NEWTAB_WALLPAPER_MODE_LIGHT;
  }

  function getDefaultWallpaperPrefs() {
    return {
      version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
      sameForModes: true,
      light: NEWTAB_WALLPAPER_DEFAULT_ID,
      dark: NEWTAB_WALLPAPER_DEFAULT_ID
    };
  }

  function getDefaultLocalWallpaperOverrides() {
    return {
      light: null,
      dark: null
    };
  }

  function cloneWallpaperPrefs(prefs) {
    const source = prefs && typeof prefs === 'object' ? prefs : getDefaultWallpaperPrefs();
    const lightId = normalizeNewtabWallpaperId(source.light) || '';
    const darkId = normalizeNewtabWallpaperId(source.dark) || lightId;
    const sameForModes = source.sameForModes !== false;
    return {
      version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
      sameForModes,
      light: lightId,
      dark: sameForModes ? lightId : darkId
    };
  }

  function cloneLocalWallpaperOverrides(overrides) {
    const source = overrides && typeof overrides === 'object' ? overrides : getDefaultLocalWallpaperOverrides();
    return {
      light: source.light || null,
      dark: source.dark || null
    };
  }

  function isCustomWallpaperId(id) {
    return localWallpaperStore.isCustomWallpaperId(id);
  }

  function getCustomWallpaperById(id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return null;
    }
    return wallpaperState.customWallpapers.find((item) => item && item.id === normalizedId) || null;
  }

  function getWallpaperById(id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return null;
    }
    if (isCustomWallpaperId(normalizedId)) {
      return getCustomWallpaperById(normalizedId);
    }
    if (isLinkWallpaperId(normalizedId)) {
      return getLinkWallpaperById(normalizedId);
    }
    if (REMOTE_CONTENT.wallpaperFromId(normalizedId)) {
      const pickId = getDailyWallpaperPick(normalizedId);
      const pick = pickId && remoteClient.getWallpaper(pickId);
      return pick
        ? Object.assign({}, pick, { id: normalizedId, daily: true, dailyId: pickId, picked: true })
        : remoteClient.getWallpaper(normalizedId);
    }
    return NEWTAB_WALLPAPER_OPTIONS.find((item) => item && item.id === normalizedId) || null;
  }

  function normalizeNewtabWallpaperId(value) {
    const raw = value && typeof value === 'object' && value.id
      ? value.id
      : value;
    const id = String(raw || '').trim();
    if (id === NEWTAB_CUSTOM_WALLPAPER_ID) {
      const firstCustomWallpaper = wallpaperState.customWallpapers[0];
      return firstCustomWallpaper ? firstCustomWallpaper.id : '';
    }
    // Move existing online selections to the daily Bing source without contacting the old provider.
    if (/^wallhaven-[a-z0-9]{6}$/.test(id) && remoteClient) return REMOTE_CONTENT.BING_DAILY_ID;
    if (getWallpaperById(id)) {
      return id;
    }
    const matchedByPath = NEWTAB_WALLPAPER_OPTIONS.find((item) => {
      const localPath = getWallpaperLocalPath(item);
      const runtimePath = getWallpaperRuntimePath(item);
      const legacyFile = getWallpaperLegacyFile(item);
      return id === localPath ||
        id === runtimePath ||
        id.endsWith(`/${item.file}`) ||
        (legacyFile && id.endsWith(`/${legacyFile}`));
    });
    return matchedByPath ? matchedByPath.id : '';
  }

  function getWallpaperLegacyFile(item) {
    const file = item && item.file ? item.file : '';
    return file.endsWith('.webp') ? file.replace(/\.webp$/, '.png') : '';
  }

  function getWallpaperThumbnailFile(item, suffix) {
    const file = item && item.file ? item.file : '';
    return file ? file.replace(/\.[^.]+$/, suffix || NEWTAB_WALLPAPER_THUMBNAIL_SUFFIX) : '';
  }

  function getWallpaperLocalPath(item) {
    if (!item || !item.file) {
      return '';
    }
    return `${NEWTAB_WALLPAPER_DEFAULT_DIRECTORY}/${item.file}`;
  }

  function getWallpaperRuntimePath(item, options) {
    if (item && isCustomWallpaperId(item.id)) {
      return '';
    }
    if (!item || !item.file) {
      return '';
    }
    let file = item.file;
    if (options && options.sample) {
      file = getWallpaperThumbnailFile(item, NEWTAB_WALLPAPER_SAMPLE_SUFFIX);
    } else if (options && options.thumbnail) {
      file = getWallpaperThumbnailFile(item);
    }
    return file ? `${NEWTAB_WALLPAPER_EXTENSION_DIRECTORY}/${file}` : '';
  }

  function getCachedWallpaperImage(photoId, url) {
    const image = cachedWallpaperImages.get(photoId);
    return image && image.url === url ? image : null;
  }

  // The cached copy an online photo shows: its own, or for a daily slot whose photo of the day has
  // no copy yet, the copy the slot showed before. A photo picked for today is the user's choice, so
  // it loads like any other instead of hiding behind the previous one.
  function getShownWallpaperCopy(item) {
    if (!item || !item.cacheImage) return null;
    const own = getCachedWallpaperImage(item.dailyId || item.id, item.imageUrl);
    const isSlot = REMOTE_CONTENT.isDailyWallpaperId(item.id) && !item.picked;
    if (own && isSlot) dailyWallpaperStandIns.set(item.id, own);
    return own || (isSlot && dailyWallpaperStandIns.get(item.id)) || null;
  }

  function getWallpaperImageUrl(item) {
    if (item && remoteClient && item.cacheImage) {
      const cached = getShownWallpaperCopy(item);
      return cached ? cached.imageDataUrl : item.thumbnailUrl;
    }
    if (item && remoteClient && REMOTE_CONTENT.wallpaperFromId(item.id)) {
      return item.imageUrl || getWallpaperImageUrl(getWallpaperById(NEWTAB_WALLPAPER_DEFAULT_ID));
    }
    if (item && isCustomWallpaperId(item.id)) {
      return item.imageDataUrl || '';
    }
    if (item && isLinkWallpaperId(item.id)) {
      return item.imageDataUrl || item.url;
    }
    const runtimePath = getWallpaperRuntimePath(item);
    if (!runtimePath) {
      return '';
    }
    if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return chrome.runtime.getURL(runtimePath);
    }
    return `../../${runtimePath}`;
  }

  function isNetworkWallpaperImageUrl(url) {
    return /^https?:/i.test(String(url || ''));
  }

  // A network image never paints straight from CSS: it would hold the tab's loading spinner, and
  // a failed download would leave the page blank. It shows once loaded after the page; if it fails
  // or stalls, the bundled default wallpaper stands in. Copies in IndexedDB and bundled files
  // show at once, and the fallback never depends on data that sync or pruning may remove.
  function getDisplayedWallpaperImageUrl(item) {
    const url = getWallpaperImageUrl(item);
    if (!isNetworkWallpaperImageUrl(url)) {
      return url;
    }
    const state = wallpaperNetworkImageStates.get(url);
    if (state === 'loaded') {
      return url;
    }
    return state === 'failed' ? getWallpaperImageUrl(getWallpaperById(NEWTAB_WALLPAPER_DEFAULT_ID)) : '';
  }

  // A small local copy of the image getDisplayedWallpaperImageUrl shows, cropped the same way (the
  // copy saved for sampling, else for an older upload or cached photo its thumbnail), as
  // { url, width, height }, or null when there is none. width and height are the full image's (0 when
  // unknown). Effects and adaptive tone sample a few hundred pixels across, so they read this copy
  // instead of decoding the full wallpaper, and place their samples by the full image's size.
  function getWallpaperSample(item) {
    const url = getDisplayedWallpaperImageUrl(item);
    if (!url || isNetworkWallpaperImageUrl(url)) {
      return null;
    }
    if (url !== getWallpaperImageUrl(item)) {
      // A network photo that failed shows the bundled default instead.
      return getWallpaperSample(getWallpaperById(NEWTAB_WALLPAPER_DEFAULT_ID));
    }
    if (item && remoteClient && item.cacheImage) {
      const cached = getShownWallpaperCopy(item);
      return cached && cached.imageDataUrl === url
        ? normalizeWallpaperSample({ url: cached.sampleDataUrl || cached.thumbnailDataUrl, width: cached.width, height: cached.height }, url)
        : null;
    }
    if (item && (isCustomWallpaperId(item.id) || isLinkWallpaperId(item.id))) {
      return item.imageDataUrl === url
        ? normalizeWallpaperSample({ url: item.sampleDataUrl || item.thumbnailDataUrl, width: item.width, height: item.height }, url)
        : null;
    }
    const runtimePath = getWallpaperRuntimePath(item, { sample: true });
    if (!runtimePath) {
      return null;
    }
    const sampleUrl = chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL(runtimePath)
      : `../../${runtimePath}`;
    return normalizeWallpaperSample(Object.assign({ url: sampleUrl }, NEWTAB_WALLPAPER_SOURCE_SIZE), url);
  }

  function normalizeWallpaperSample(sample, fullUrl) {
    const url = sample && typeof sample.url === 'string' ? sample.url : '';
    if (!url || url === fullUrl) {
      return null;
    }
    const width = Math.round(Number(sample.width));
    const height = Math.round(Number(sample.height));
    const known = width > 0 && height > 0;
    return { url, width: known ? width : 0, height: known ? height : 0 };
  }

  function getWallpaperThumbnailUrl(item) {
    if (item && remoteClient && REMOTE_CONTENT.wallpaperFromId(item.id)) {
      // A photo cached on this device shows in the panel without waiting on the network.
      const cached = item.cacheImage && getCachedWallpaperImage(item.dailyId || item.id, item.imageUrl);
      return cached && cached.thumbnailDataUrl || item.thumbnailUrl || getWallpaperImageUrl(item);
    }
    if (item && isCustomWallpaperId(item.id)) {
      return item.thumbnailDataUrl || item.imageDataUrl || '';
    }
    if (item && isLinkWallpaperId(item.id)) {
      return item.thumbnailDataUrl || item.url;
    }
    const runtimePath = getWallpaperRuntimePath(item, { thumbnail: true });
    if (!runtimePath) {
      return getWallpaperImageUrl(item);
    }
    if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return chrome.runtime.getURL(runtimePath);
    }
    return `../../${runtimePath}`;
  }

  function getWallpaperDisplayName(item) {
    if (!item) {
      return '';
    }
    if (item.nameKey) {
      return t(item.nameKey, item.fallbackName || item.id || '');
    }
    const storedName = String(item.name || '').trim();
    if (!storedName) {
      return t('newtab_wallpaper_custom_name', 'Local wallpaper');
    }
    return storedName;
  }

  return {
    normalizeWallpaperMode,
    getDefaultWallpaperPrefs,
    getDefaultLocalWallpaperOverrides,
    cloneWallpaperPrefs,
    cloneLocalWallpaperOverrides,
    isCustomWallpaperId,
    getCustomWallpaperById,
    getWallpaperById,
    normalizeNewtabWallpaperId,
    getWallpaperLocalPath,
    getWallpaperRuntimePath,
    getCachedWallpaperImage,
    getShownWallpaperCopy,
    getWallpaperImageUrl,
    isNetworkWallpaperImageUrl,
    getDisplayedWallpaperImageUrl,
    getWallpaperSample,
    getWallpaperThumbnailUrl,
    getWallpaperDisplayName
  };
}

export { createWallpaperSources };
