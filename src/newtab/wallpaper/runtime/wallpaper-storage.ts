// @ts-nocheck
// Wallpaper prefs in storage: synced and local values per mode, the
// overrides kept on one device, the preload cache the next page reads before
// the runtime starts, and the custom wallpaper records.
function createWallpaperStorage(deps) {
  const {
    chrome,
    REMOTE_CONTENT,
    isLinkWallpaperId,
    NEWTAB_WALLPAPER_DEFAULT_ID,
    NEWTAB_WALLPAPER_MODES,
    storageArea,
    NEWTAB_WALLPAPER_STORAGE_KEY,
    NEWTAB_ONLINE_WALLPAPER_STORAGE_KEY,
    showToast,
    t,
    localWallpaperStorageArea,
    NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY,
    normalizeWallpaperMode,
    NEWTAB_WALLPAPER_MODE_DARK,
    NEWTAB_WALLPAPER_MODE_LIGHT,
    NEWTAB_CUSTOM_WALLPAPER_ID,
    isCustomWallpaperId,
    getCustomWallpaperById,
    cloneWallpaperPrefs,
    NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
    cloneLocalWallpaperOverrides,
    normalizeNewtabWallpaperId,
    getDefaultLocalWallpaperOverrides,
    NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE,
    getDefaultWallpaperPrefs,
    document,
    getWallpaperById,
    WALLPAPER_SOURCE_TABS,
    getCachedWallpaperImage,
    getShownWallpaperCopy,
    getUpcomingDailyWallpaper,
    getNextLocalDayTimestamp,
    getWallpaperRuntimePath,
    remoteClient,
    window,
    PRELOAD_STORAGE_KEY,
    getDisplayedWallpaperImageUrl,
    getWallpaperImageUrl,
    getWallpaperSample,
    WALLPAPER_EFFECTS,
    NEWTAB_WALLPAPER_OVERLAY_STOPS,
    getWallpaperOverlayStopPercent,
    PRELOAD_STORAGE_VERSION,
    getEffectiveThemeMode,
    getWallpaperEffectStorageValue,
    localWallpaperStore
  } = deps;

  // The runtime state object shared with wallpaper.ts and the other modules.
  const wallpaperState = deps.wallpaperState;

  function getRawWallpaperId(value) {
    return value && typeof value === 'object' && value.id ? value.id : value;
  }

  function hasStorageValue(result, key) {
    return Boolean(result && Object.prototype.hasOwnProperty.call(result, key));
  }

  function readStorageValue(area, key) {
    return new Promise((resolve) => {
      if (!area || !key || typeof area.get !== 'function') {
        resolve({ hasValue: false, value: undefined });
        return;
      }
      area.get([key], (result) => {
        resolve({
          hasValue: hasStorageValue(result, key),
          value: result ? result[key] : undefined
        });
      });
    });
  }

  function writeStorageValue(area, key, value, onError) {
    if (!area || !key || typeof area.set !== 'function') {
      return;
    }
    area.set({ [key]: value }, () => {
      if (chrome.runtime && chrome.runtime.lastError && typeof onError === 'function') {
        onError();
      }
    });
  }

  function isOnlineWallpaperId(value) {
    const id = String(getRawWallpaperId(value) || '').trim();
    return Boolean(REMOTE_CONTENT.wallpaperFromId(id)) || isLinkWallpaperId(id);
  }

  // Versions without online wallpapers clear IDs they do not recognize, and that clear syncs to every device.
  // Online picks therefore live in their own key, leaving a built-in stand-in under the shared key.
  function buildSharedSyncedWallpaperValue(value) {
    if (!value || typeof value !== 'object') {
      return isOnlineWallpaperId(value) ? NEWTAB_WALLPAPER_DEFAULT_ID : value;
    }
    const shared = Object.assign({}, value);
    NEWTAB_WALLPAPER_MODES.forEach((mode) => {
      if (isOnlineWallpaperId(shared[mode])) {
        shared[mode] = NEWTAB_WALLPAPER_DEFAULT_ID;
      }
    });
    return shared;
  }

  // The online pick only counts while the shared key still holds its stand-in; any other value
  // means an older version changed the wallpaper since, and that newer choice wins.
  function mergeOnlineWallpaperValue(synced, online) {
    const entry = online && online.hasValue ? online.value : null;
    if (!entry || typeof entry !== 'object' || !synced.hasValue ||
        !getWallpaperStorageRawIds(entry.value).some(isOnlineWallpaperId) ||
        getComparableSyncedWallpaperStorageValue(entry.shared) !==
          getComparableSyncedWallpaperStorageValue(synced.value)) {
      return synced;
    }
    return { hasValue: true, value: entry.value, fromOnlineKey: true };
  }

  function writeSyncedWallpaperValue(value, options) {
    if (!storageArea || typeof storageArea.set !== 'function') {
      return;
    }
    const hasOnlineWallpaper = getWallpaperStorageRawIds(value).some(isOnlineWallpaperId);
    const shared = hasOnlineWallpaper ? buildSharedSyncedWallpaperValue(value) : value;
    storageArea.set({
      [NEWTAB_WALLPAPER_STORAGE_KEY]: shared,
      [NEWTAB_ONLINE_WALLPAPER_STORAGE_KEY]: hasOnlineWallpaper ? { value, shared } : ''
    }, () => {
      if (chrome.runtime && chrome.runtime.lastError && options && options.showError) {
        showToast(t('newtab_wallpaper_save_error', 'Failed to save wallpaper'), true);
      }
    });
  }

  function writeLocalWallpaperValue(value, options) {
    writeStorageValue(localWallpaperStorageArea, NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY, value, () => {
      if (options && options.showError) {
        showToast(t('newtab_wallpaper_save_error', 'Failed to save wallpaper'), true);
      }
    });
  }

  function getWallpaperStorageModeValue(value, mode, fallback) {
    if (!value || typeof value !== 'object') {
      return fallback;
    }
    const normalizedMode = normalizeWallpaperMode(mode);
    if (Object.prototype.hasOwnProperty.call(value, normalizedMode)) {
      return value[normalizedMode];
    }
    if (normalizedMode === NEWTAB_WALLPAPER_MODE_DARK &&
        Object.prototype.hasOwnProperty.call(value, NEWTAB_WALLPAPER_MODE_LIGHT)) {
      return value[NEWTAB_WALLPAPER_MODE_LIGHT];
    }
    if (Object.prototype.hasOwnProperty.call(value, 'id')) {
      return value.id;
    }
    return fallback;
  }

  function getWallpaperStorageRawIds(value) {
    if (!value || typeof value !== 'object') {
      return [String(getRawWallpaperId(value) || '').trim()].filter(Boolean);
    }
    return NEWTAB_WALLPAPER_MODES
      .map((mode) => String(getRawWallpaperId(getWallpaperStorageModeValue(value, mode, '')) || '').trim())
      .filter(Boolean);
  }

  function shouldWaitForCustomWallpapers(value) {
    return getWallpaperStorageRawIds(value).some((id) => {
      return id === NEWTAB_CUSTOM_WALLPAPER_ID || isCustomWallpaperId(id);
    });
  }

  function getStoredCustomWallpaperIds(storedValues) {
    const ids = [];
    (Array.isArray(storedValues) ? storedValues : []).forEach((storedValue) => {
      if (!storedValue || !storedValue.hasValue) {
        return;
      }
      getWallpaperStorageRawIds(storedValue.value).forEach((id) => {
        if ((id === NEWTAB_CUSTOM_WALLPAPER_ID || isCustomWallpaperId(id)) && !ids.includes(id)) {
          ids.push(id);
        }
      });
    });
    return ids;
  }

  function hasLoadedStoredCustomWallpaper(id) {
    if (id === NEWTAB_CUSTOM_WALLPAPER_ID) {
      return wallpaperState.customWallpapers.length > 0;
    }
    return Boolean(getCustomWallpaperById(id));
  }

  function getComparableSyncedWallpaperStorageValue(value) {
    if (!value || typeof value !== 'object') {
      return String(getRawWallpaperId(value) || '');
    }
    return JSON.stringify({
      version: Number(value.version) || 0,
      sameForModes: value.sameForModes !== false,
      light: String(getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_LIGHT, '') || ''),
      dark: String(getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_DARK, '') || '')
    });
  }

  function buildSyncedWallpaperStorageValue(prefs) {
    const normalized = cloneWallpaperPrefs(prefs);
    if (normalized.sameForModes && normalized.light === normalized.dark) {
      return normalized.light;
    }
    return {
      version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
      sameForModes: normalized.sameForModes,
      light: normalized.light,
      dark: normalized.dark
    };
  }

  function getComparableLocalWallpaperStorageValue(value) {
    if (!value || typeof value !== 'object') {
      return String(getRawWallpaperId(value) || '');
    }
    return JSON.stringify({
      version: Number(value.version) || 0,
      light: String(getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_LIGHT, '') || ''),
      dark: String(getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_DARK, '') || '')
    });
  }

  function buildLocalWallpaperStorageValue(overrides, sameForModes) {
    const normalized = cloneLocalWallpaperOverrides(overrides);
    if (sameForModes && (normalized.light || null) === (normalized.dark || null)) {
      return normalized.light || '';
    }
    if (!normalized.light && !normalized.dark) {
      return '';
    }
    return {
      version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
      light: normalized.light || '',
      dark: normalized.dark || ''
    };
  }

  function resolveSyncedWallpaperModeValue(raw, hasRaw) {
    const value = hasRaw ? raw : NEWTAB_WALLPAPER_DEFAULT_ID;
    if (shouldWaitForCustomWallpapers(value)) {
      const nextCustomId = normalizeNewtabWallpaperId(value);
      if (nextCustomId && isCustomWallpaperId(nextCustomId)) {
        return {
          id: NEWTAB_WALLPAPER_DEFAULT_ID,
          localMigrationId: nextCustomId,
          sanitized: true
        };
      }
      return {
        id: NEWTAB_WALLPAPER_DEFAULT_ID,
        localMigrationId: '',
        sanitized: true
      };
    }
    const nextId = normalizeNewtabWallpaperId(value);
    // An ID this version does not recognize may come from a newer install sharing sync storage.
    // Show the default here, but never write it back, or that install's wallpaper turns off.
    if (!nextId && String(getRawWallpaperId(value) || '').trim()) {
      return {
        id: NEWTAB_WALLPAPER_DEFAULT_ID,
        localMigrationId: '',
        sanitized: false,
        unrecognized: true
      };
    }
    return {
      id: nextId,
      localMigrationId: '',
      sanitized: !hasRaw || (value && value !== nextId)
    };
  }

  function resolveSyncedWallpaperValue(value, hasValue) {
    const isObjectValue = Boolean(value && typeof value === 'object');
    const sameForModes = isObjectValue ? value.sameForModes !== false : true;
    const rawLight = isObjectValue
      ? getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_LIGHT, hasValue ? value : NEWTAB_WALLPAPER_DEFAULT_ID)
      : (hasValue ? value : NEWTAB_WALLPAPER_DEFAULT_ID);
    const lightResolution = resolveSyncedWallpaperModeValue(rawLight, hasValue || isObjectValue);
    const rawDark = sameForModes
      ? rawLight
      : getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_DARK, rawLight);
    const darkResolution = sameForModes
      ? lightResolution
      : resolveSyncedWallpaperModeValue(rawDark, true);
    const prefs = {
      version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
      sameForModes,
      light: lightResolution.id,
      dark: sameForModes ? lightResolution.id : darkResolution.id
    };
    const localMigrations = getDefaultLocalWallpaperOverrides();
    if (lightResolution.localMigrationId) {
      localMigrations.light = lightResolution.localMigrationId;
    }
    if (sameForModes) {
      localMigrations.dark = localMigrations.light;
    } else if (darkResolution.localMigrationId) {
      localMigrations.dark = darkResolution.localMigrationId;
    }
    const sanitizedValue = buildSyncedWallpaperStorageValue(prefs);
    const hasUnrecognizedId = lightResolution.unrecognized || (!sameForModes && darkResolution.unrecognized);
    const shouldSanitize = !hasUnrecognizedId && (!hasValue ||
      lightResolution.sanitized ||
      (!sameForModes && darkResolution.sanitized) ||
      (isObjectValue && (
        Number(value.version) !== NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION ||
        getComparableSyncedWallpaperStorageValue(value) !== getComparableSyncedWallpaperStorageValue(sanitizedValue)
      )));
    return {
      prefs,
      sanitizedValue: shouldSanitize ? sanitizedValue : null,
      localMigrations
    };
  }

  function resolveLocalWallpaperModeValue(raw, hasRaw) {
    if (!hasRaw) {
      return { override: null, shouldClear: false };
    }
    const rawId = String(getRawWallpaperId(raw) || '').trim();
    if (!rawId) {
      return { override: null, shouldClear: false };
    }
    if (rawId === NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE) {
      return { override: NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE, shouldClear: false };
    }
    const nextId = normalizeNewtabWallpaperId(raw);
    if (nextId && isCustomWallpaperId(nextId)) {
      return { override: nextId, shouldClear: false };
    }
    return { override: null, shouldClear: true };
  }

  function resolveLocalWallpaperOverride(value, hasValue) {
    const overrides = getDefaultLocalWallpaperOverrides();
    if (!hasValue) {
      return { overrides, shouldClear: false };
    }
    if (!value || typeof value !== 'object') {
      const resolution = resolveLocalWallpaperModeValue(value, true);
      overrides.light = resolution.override;
      overrides.dark = resolution.override;
      return {
        overrides,
        shouldClear: resolution.shouldClear
      };
    }
    const lightResolution = resolveLocalWallpaperModeValue(
      getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_LIGHT, ''),
      true
    );
    const darkResolution = resolveLocalWallpaperModeValue(
      getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_DARK, ''),
      true
    );
    overrides.light = lightResolution.override;
    overrides.dark = darkResolution.override;
    const normalizedValue = buildLocalWallpaperStorageValue(overrides, false);
    return {
      overrides,
      shouldClear: lightResolution.shouldClear ||
      darkResolution.shouldClear ||
        getComparableLocalWallpaperStorageValue(value) !== getComparableLocalWallpaperStorageValue(normalizedValue)
    };
  }

  function getWallpaperLocalOverrideForMode(mode) {
    const normalizedMode = normalizeWallpaperMode(mode);
    const overrides = wallpaperState.currentLocalWallpaperOverrides || getDefaultLocalWallpaperOverrides();
    return overrides[normalizedMode] || null;
  }

  function getSyncedWallpaperIdForMode(mode) {
    const normalizedMode = normalizeWallpaperMode(mode);
    const prefs = wallpaperState.currentWallpaperPrefs || getDefaultWallpaperPrefs();
    const id = prefs.sameForModes ? prefs.light : prefs[normalizedMode];
    return normalizeNewtabWallpaperId(id) || '';
  }

  function getEffectiveWallpaperIdForMode(mode) {
    const override = getWallpaperLocalOverrideForMode(mode);
    if (override === NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE) {
      return '';
    }
    if (override && isCustomWallpaperId(override)) {
      return normalizeNewtabWallpaperId(override) || '';
    }
    return getSyncedWallpaperIdForMode(mode);
  }

  function getResolvedWallpaperMode() {
    return document.body && document.body.getAttribute('data-theme') === 'dark'
      ? NEWTAB_WALLPAPER_MODE_DARK
      : NEWTAB_WALLPAPER_MODE_LIGHT;
  }

  function getWallpaperEditMode() {
    if (wallpaperState.currentWallpaperPrefs && wallpaperState.currentWallpaperPrefs.sameForModes) {
      return getResolvedWallpaperMode();
    }
    return normalizeWallpaperMode(wallpaperState.activeWallpaperMode);
  }

  // Daily mode highlights the photo it currently resolves to.
  function getWallpaperTileSelectionId(id) {
    if (!REMOTE_CONTENT.isDailyWallpaperId(id)) return id;
    const daily = getWallpaperById(id);
    return daily && daily.dailyId || id;
  }

  function getWallpaperSelectionIdForUi() {
    return getEffectiveWallpaperIdForMode(getWallpaperEditMode());
  }

  function hasAnyWallpaperEnabled() {
    return NEWTAB_WALLPAPER_MODES.some((mode) => Boolean(getEffectiveWallpaperIdForMode(mode)));
  }

  function normalizeWallpaperSourceTab(tab) {
    return WALLPAPER_SOURCE_TABS.includes(tab) ? tab : 'built-in';
  }

  function getWallpaperSourceTabForId(id) {
    const provider = REMOTE_CONTENT.getWallpaperProvider(id);
    if (provider) return normalizeWallpaperSourceTab(provider);
    return isCustomWallpaperId(id) || isLinkWallpaperId(id) ? 'local' : 'built-in';
  }

  function getWallpaperModeLabel(mode) {
    const normalizedMode = normalizeWallpaperMode(mode);
    return normalizedMode === NEWTAB_WALLPAPER_MODE_DARK
      ? t('settings_theme_dark', 'Dark')
      : t('settings_theme_light', 'Light');
  }

  function getWallpaperModePreferenceOrder() {
    const modes = [];
    const addMode = (mode) => {
      const normalizedMode = normalizeWallpaperMode(mode);
      if (!modes.includes(normalizedMode)) {
        modes.push(normalizedMode);
      }
    };
    addMode(getResolvedWallpaperMode());
    addMode(getWallpaperEditMode());
    NEWTAB_WALLPAPER_MODES.forEach(addMode);
    return modes;
  }

  function getFirstEnabledWallpaperIdForModes(modes) {
    for (let i = 0; i < modes.length; i += 1) {
      const id = getEffectiveWallpaperIdForMode(modes[i]);
      if (id) {
        return id;
      }
    }
    return '';
  }

  function getCopyableWallpaperLocalOverrideForId(modes, id) {
    const normalizedId = normalizeNewtabWallpaperId(id);
    if (!normalizedId || !isCustomWallpaperId(normalizedId)) {
      return null;
    }
    for (let i = 0; i < modes.length; i += 1) {
      const override = getWallpaperLocalOverrideForMode(modes[i]);
      if (override &&
          override !== NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE &&
          isCustomWallpaperId(override) &&
          normalizeNewtabWallpaperId(override) === normalizedId) {
        return override;
      }
    }
    return null;
  }

  function setWallpaperPrefs(nextPrefs, nextOverrides) {
    wallpaperState.currentWallpaperPrefs = cloneWallpaperPrefs(nextPrefs);
    wallpaperState.currentLocalWallpaperOverrides = cloneLocalWallpaperOverrides(nextOverrides);
    if (wallpaperState.currentWallpaperPrefs.sameForModes) {
      wallpaperState.activeWallpaperMode = getResolvedWallpaperMode();
    } else {
      wallpaperState.activeWallpaperMode = normalizeWallpaperMode(wallpaperState.activeWallpaperMode);
    }
  }

  function getWritableWallpaperPrefs() {
    return cloneWallpaperPrefs(wallpaperState.currentWallpaperPrefs);
  }

  function getWritableLocalWallpaperOverrides() {
    return cloneLocalWallpaperOverrides(wallpaperState.currentLocalWallpaperOverrides);
  }

  function applyLocalWallpaperMigrations(overrides, migrations) {
    const nextOverrides = cloneLocalWallpaperOverrides(overrides);
    let changed = false;
    NEWTAB_WALLPAPER_MODES.forEach((mode) => {
      const migrationId = migrations && migrations[mode] ? migrations[mode] : '';
      if (!migrationId) {
        return;
      }
      nextOverrides[mode] = migrationId;
      changed = true;
    });
    return { overrides: nextOverrides, changed };
  }

  function writeCurrentWallpaperPrefs(options) {
    const config = options || {};
    writeSyncedWallpaperValue(buildSyncedWallpaperStorageValue(wallpaperState.currentWallpaperPrefs), config);
    writeLocalWallpaperValue(
      buildLocalWallpaperStorageValue(wallpaperState.currentLocalWallpaperOverrides, wallpaperState.currentWallpaperPrefs.sameForModes),
      config
    );
  }

  function getWallpaperPreloadEntryForMode(mode) {
    const wallpaper = getWallpaperById(getEffectiveWallpaperIdForMode(mode));
    const entry = getWallpaperPreloadImageEntry(wallpaper);
    const luminanceKey = getWallpaperLuminanceKey(wallpaper);
    const luminance = wallpaperState.wallpaperLuminances.get(luminanceKey);
    if (!entry || !isWallpaperLuminance(luminance)) {
      return entry;
    }
    return Object.assign(entry, { luminance, luminanceKey });
  }

  function getWallpaperPreloadImageEntry(wallpaper) {
    // Online photos and links cannot paint on the first frame, but the preload reads this device's
    // IndexedDB copy while the page is still parsing.
    if (wallpaper && isLinkWallpaperId(wallpaper.id)) {
      return getCachedWallpaperImage(wallpaper.id, wallpaper.url)
        ? { id: wallpaper.id, cachedImage: { id: wallpaper.id, url: wallpaper.url } }
        : null;
    }
    if (wallpaper && REMOTE_CONTENT.wallpaperFromId(wallpaper.id)) {
      const copy = getShownWallpaperCopy(wallpaper);
      // Tomorrow's copy, once cached, lets the first tab after midnight open on the new photo.
      const upcoming = getUpcomingDailyWallpaper(wallpaper.id);
      const next = upcoming && getCachedWallpaperImage(upcoming.id, upcoming.imageUrl);
      if (!copy && !next) return null;
      const entry = { id: wallpaper.id };
      if (copy) entry.cachedImage = { id: copy.id, url: copy.url };
      if (next) {
        entry.next = { day: REMOTE_CONTENT.localDay(getNextLocalDayTimestamp(Date.now())),
          cachedImage: { id: next.id, url: next.url } };
      }
      return entry;
    }
    // An upload lives only in this device's IndexedDB; the preload reads it there by its record key.
    if (wallpaper && isCustomWallpaperId(wallpaper.id)) {
      const key = String(wallpaper.key || wallpaper.id);
      return { id: wallpaper.id, customImage: key === wallpaper.id ? { id: wallpaper.id } : { id: wallpaper.id, key } };
    }
    const path = wallpaper ? getWallpaperRuntimePath(wallpaper) : '';
    if (!path) {
      return null;
    }
    // The full image's size, by which the preload places samples taken from its small copy.
    const sample = getWallpaperSample(wallpaper);
    return sample && sample.width
      ? { id: wallpaper.id, path, width: sample.width, height: sample.height }
      : { id: wallpaper.id, path };
  }

  // A daily photo keeps its catalog id while the image changes, so its luminance follows the photo
  // on screen, which is the previous copy until the new photo's is cached.
  function getWallpaperLuminanceKey(wallpaper) {
    if (!wallpaper) {
      return '';
    }
    if (!REMOTE_CONTENT.wallpaperFromId(wallpaper.id)) {
      return wallpaper.id;
    }
    const copy = remoteClient ? getShownWallpaperCopy(wallpaper) : null;
    return copy ? copy.id : wallpaper.dailyId || wallpaper.id;
  }

  function readWallpaperPreloadLuminances() {
    const luminances = new Map();
    try {
      const data = JSON.parse(window.localStorage.getItem(PRELOAD_STORAGE_KEY) || 'null');
      NEWTAB_WALLPAPER_MODES.forEach((mode) => {
        const entry = data && data.wallpapers && data.wallpapers[mode];
        if (entry && typeof entry.luminanceKey === 'string' && entry.luminanceKey &&
            isWallpaperLuminance(entry.luminance)) {
          luminances.set(entry.luminanceKey, entry.luminance);
        }
      });
    } catch (_error) {
      // Only a head start; the next sample measures it again.
    }
    return luminances;
  }

  function isWallpaperLuminance(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  }

  // Measured from the adaptive-tone sample, which already holds the shown image at a few hundred pixels.
  function rememberWallpaperLuminance(sampler) {
    const wallpaper = getWallpaperById(wallpaperState.currentWallpaperId);
    const key = getWallpaperLuminanceKey(wallpaper);
    const displayedUrl = getDisplayedWallpaperImageUrl(wallpaper);
    // A failed network photo shows the bundled default instead, whose luminance is not the photo's.
    if (!key || !sampler || !sampler.imageData || sampler.url !== displayedUrl ||
        displayedUrl !== getWallpaperImageUrl(wallpaper) ||
        wallpaperState.wallpaperLuminances.has(key) || typeof WALLPAPER_EFFECTS.analyzeImageData !== 'function') {
      return;
    }
    const luminance = WALLPAPER_EFFECTS.analyzeImageData(sampler.imageData).averageLuminance;
    if (!isWallpaperLuminance(luminance)) {
      return;
    }
    wallpaperState.wallpaperLuminances.set(key, Math.round(luminance * 1000) / 1000);
    // Previews in the wallpaper panel sample too; keep only the wallpapers a New Tab can open with.
    const shownKeys = NEWTAB_WALLPAPER_MODES.map((mode) => {
      return getWallpaperLuminanceKey(getWallpaperById(getEffectiveWallpaperIdForMode(mode)));
    });
    Array.from(wallpaperState.wallpaperLuminances.keys()).forEach((cachedKey) => {
      if (!shownKeys.includes(cachedKey)) {
        wallpaperState.wallpaperLuminances.delete(cachedKey);
      }
    });
    if (shownKeys.includes(key)) {
      writeWallpaperPreloadCache();
    }
  }

  function getWallpaperPreloadOverlayStops() {
    const result = {};
    NEWTAB_WALLPAPER_MODES.forEach((mode) => {
      const stops = NEWTAB_WALLPAPER_OVERLAY_STOPS[mode];
      const opacity = wallpaperState.currentWallpaperOverlayOpacity[mode];
      result[mode] = {
        top: Number(getWallpaperOverlayStopPercent(stops.top, opacity).toFixed(1)),
        mid: Number(getWallpaperOverlayStopPercent(stops.mid, opacity).toFixed(1)),
        bottom: Number(getWallpaperOverlayStopPercent(stops.bottom, opacity).toFixed(1))
      };
    });
    return result;
  }

  function writeWallpaperPreloadCache() {
    try {
      if (!window.localStorage) {
        return;
      }
      const wallpapers = {
        light: getWallpaperPreloadEntryForMode(NEWTAB_WALLPAPER_MODE_LIGHT),
        dark: getWallpaperPreloadEntryForMode(NEWTAB_WALLPAPER_MODE_DARK)
      };
      window.localStorage.setItem(PRELOAD_STORAGE_KEY, JSON.stringify({
        version: PRELOAD_STORAGE_VERSION,
        mode: getResolvedWallpaperMode(),
        themeMode: getEffectiveThemeMode(),
        wallpapers,
        overlayStops: getWallpaperPreloadOverlayStops(),
        wallpaperEffects: getWallpaperEffectStorageValue(),
        updatedAt: Date.now()
      }));
    } catch (e) {
      // localStorage may be unavailable in constrained contexts; storage is only a fast-path cache.
    }
  }

  function normalizeCustomWallpaperRecord(record) {
    return localWallpaperStore.normalizeRecord(record);
  }

  function readCustomWallpaperRecords() {
    return localWallpaperStore.readAll();
  }

  function readCustomWallpaperRecordsByIds(ids) {
    return localWallpaperStore.readByIds(ids);
  }

  function writeCustomWallpaperRecord(record) {
    return localWallpaperStore.write(record);
  }

  function deleteCustomWallpaperRecord(record) {
    return localWallpaperStore.remove(record);
  }

  function buildCustomWallpaperRecordFromFile(file) {
    return localWallpaperStore.buildRecordFromFile(file);
  }

  return {
    readStorageValue,
    writeStorageValue,
    isOnlineWallpaperId,
    mergeOnlineWallpaperValue,
    writeSyncedWallpaperValue,
    writeLocalWallpaperValue,
    getWallpaperStorageRawIds,
    getStoredCustomWallpaperIds,
    hasLoadedStoredCustomWallpaper,
    buildLocalWallpaperStorageValue,
    resolveSyncedWallpaperValue,
    resolveLocalWallpaperOverride,
    getWallpaperLocalOverrideForMode,
    getEffectiveWallpaperIdForMode,
    getResolvedWallpaperMode,
    getWallpaperEditMode,
    getWallpaperTileSelectionId,
    getWallpaperSelectionIdForUi,
    hasAnyWallpaperEnabled,
    normalizeWallpaperSourceTab,
    getWallpaperSourceTabForId,
    getWallpaperModeLabel,
    getWallpaperModePreferenceOrder,
    getFirstEnabledWallpaperIdForModes,
    getCopyableWallpaperLocalOverrideForId,
    setWallpaperPrefs,
    getWritableWallpaperPrefs,
    getWritableLocalWallpaperOverrides,
    applyLocalWallpaperMigrations,
    writeCurrentWallpaperPrefs,
    readWallpaperPreloadLuminances,
    rememberWallpaperLuminance,
    writeWallpaperPreloadCache,
    normalizeCustomWallpaperRecord,
    readCustomWallpaperRecords,
    readCustomWallpaperRecordsByIds,
    writeCustomWallpaperRecord,
    deleteCustomWallpaperRecord,
    buildCustomWallpaperRecordFromFile
  };
}

export { createWallpaperStorage };
