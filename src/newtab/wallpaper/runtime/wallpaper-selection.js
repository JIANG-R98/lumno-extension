(function(root) {
  // Choosing a wallpaper: loading custom wallpapers, applying the stored
  // or picked wallpaper once it is ready, and saving the choice and whether
  // wallpapers are on, per mode.
  function createWallpaperSelection(deps) {
    const {
      getWallpaperById,
      waitForWallpaperImageReady,
      getWallpaperImageUrl,
      readCachedWallpaperImages,
      readCustomWallpaperRecords,
      renderWallpaperPanelState,
      cacheListedLinkWallpapers,
      normalizeCustomWallpaperRecord,
      normalizeNewtabWallpaperId,
      normalizeWallpaperMode,
      NEWTAB_WALLPAPER_MODES,
      getResolvedWallpaperMode,
      writeWallpaperPreloadCache,
      applyWallpaperVisualState,
      refreshWallpaperAdaptiveSampler,
      scheduleWallpaperVisualRefresh,
      finalizeInitialWallpaper,
      getDisplayedWallpaperImageUrl,
      createWallpaperTransitionLayer,
      releaseWallpaperTransitionLayer,
      getEffectiveWallpaperIdForMode,
      cacheShownWallpaperImages,
      resolveSyncedWallpaperValue,
      resolveLocalWallpaperOverride,
      applyLocalWallpaperMigrations,
      setWallpaperPrefs,
      bindWallpaperPageShownListeners,
      synchronizeWallpaperEffectPrefsWithWallpaperModes,
      applyWallpaperEffectForResolvedMode,
      syncWallpaperSourceTabToEditMode,
      writeSyncedWallpaperValue,
      getWallpaperStorageRawIds,
      isOnlineWallpaperId,
      writeLocalWallpaperValue,
      buildLocalWallpaperStorageValue,
      storageArea,
      NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
      getWallpaperEffectStorageValue,
      readStorageValue,
      NEWTAB_WALLPAPER_STORAGE_KEY,
      localWallpaperStorageArea,
      NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY,
      NEWTAB_ONLINE_WALLPAPER_STORAGE_KEY,
      NEWTAB_LINK_WALLPAPERS_STORAGE_KEY,
      NEWTAB_DAILY_WALLPAPER_PICKS_STORAGE_KEY,
      NEWTAB_CURATED_MIX_EXCLUDED_STORAGE_KEY,
      normalizeDailyWallpaperPicks,
      REMOTE_CONTENT,
      mergeOnlineWallpaperValue,
      setLinkWallpapers,
      isLinkWallpaperId,
      takePreloadedCustomWallpaper,
      getStoredCustomWallpaperIds,
      hasLoadedStoredCustomWallpaper,
      readCustomWallpaperRecordsByIds,
      warnWallpaperStoreFailure,
      getDailyWallpaperPick,
      remoteClient,
      getCachedWallpaperImage,
      dailyWallpaperStandIns,
      window,
      PRELOAD_STORAGE_KEY,
      NEWTAB_WALLPAPER_DEFAULT_ID,
      getWritableWallpaperPrefs,
      getWritableLocalWallpaperOverrides,
      writeCurrentWallpaperPrefs,
      isCustomWallpaperId,
      NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE,
      getWallpaperEffectPrefsForEditMode,
      getWallpaperModePreferenceOrder,
      hasAnyWallpaperEnabled,
      getFirstEnabledWallpaperIdForModes,
      getCopyableWallpaperLocalOverrideForId,
      setSharedWallpaperEffectPrefs,
      getWallpaperEditMode,
      getWallpaperEffectPrefsForMode,
      getWallpaperLocalOverrideForMode
    } = deps;

    // The runtime state object shared with wallpaper.js and the other modules.
    const wallpaperState = deps.wallpaperState;

    let hasWallpaperBootstrapStarted = false;
    let customWallpaperCatalogPromise = null;
    let lastActiveWallpaperId = '';
    let lastActiveWallpaperIdsByMode = {
      light: '',
      dark: ''
    };
    function primeWallpaperImage(id) {
      const wallpaper = getWallpaperById(id);
      return waitForWallpaperImageReady(wallpaper ? getWallpaperImageUrl(wallpaper) : '');
    }
    function loadCustomWallpapers() {
      if (wallpaperState.customWallpaperCatalogLoaded) {
        return Promise.resolve(wallpaperState.customWallpapers);
      }
      if (customWallpaperCatalogPromise) {
        return customWallpaperCatalogPromise;
      }
      const linkImagesTask = readCachedWallpaperImages(wallpaperState.linkWallpapers.map((item) => item.id));
      customWallpaperCatalogPromise = readCustomWallpaperRecords().then((records) => {
        const showRecords = () => {
          wallpaperState.customWallpapers = records;
          wallpaperState.customWallpaperCatalogLoaded = true;
          renderWallpaperPanelState();
          return records;
        };
        // Wait for cached link images so the tiles do not load full images from the links first.
        return wallpaperState.linkWallpapers.length ? linkImagesTask.then(showRecords) : showRecords();
      }).catch(() => {
        renderWallpaperPanelState();
        return wallpaperState.customWallpapers;
      }).finally(() => {
        customWallpaperCatalogPromise = null;
        cacheListedLinkWallpapers();
      });
      return customWallpaperCatalogPromise;
    }

    function refreshCustomWallpapers() {
      wallpaperState.customWallpaperCatalogLoaded = false;
      return loadCustomWallpapers();
    }

    function mergeCustomWallpaperRecords(records) {
      const recordsById = new Map();
      wallpaperState.customWallpapers.forEach((record) => {
        if (record && record.id) {
          recordsById.set(record.id, record);
        }
      });
      (Array.isArray(records) ? records : []).forEach((record) => {
        const normalized = normalizeCustomWallpaperRecord(record);
        if (normalized) {
          recordsById.set(normalized.id, normalized);
        }
      });
      wallpaperState.customWallpapers = Array.from(recordsById.values()).sort((a, b) => a.updatedAt - b.updatedAt);
      return wallpaperState.customWallpapers;
    }

    function rememberActiveWallpaperId(mode, id) {
      const nextId = normalizeNewtabWallpaperId(id);
      if (!nextId) {
        return;
      }
      const normalizedMode = normalizeWallpaperMode(mode);
      lastActiveWallpaperId = nextId;
      lastActiveWallpaperIdsByMode[normalizedMode] = nextId;
      if (wallpaperState.currentWallpaperPrefs && wallpaperState.currentWallpaperPrefs.sameForModes) {
        NEWTAB_WALLPAPER_MODES.forEach((item) => {
          lastActiveWallpaperIdsByMode[item] = nextId;
        });
      }
    }

    function applyNewtabWallpaper(value, options) {
      const config = options || {};
      const mode = normalizeWallpaperMode(config.mode || getResolvedWallpaperMode());
      const nextId = normalizeNewtabWallpaperId(value);
      const wallpaper = getWallpaperById(nextId);
      const imageUrl = wallpaper ? getWallpaperImageUrl(wallpaper) : '';
      const isInitialWallpaperApply = !wallpaperState.initialWallpaperApplied;
      const visualSeq = ++wallpaperState.wallpaperVisualSeq;
      wallpaperState.currentWallpaperId = wallpaper ? wallpaper.id : '';
      if (wallpaperState.currentWallpaperId) {
        rememberActiveWallpaperId(mode, wallpaperState.currentWallpaperId);
      }
      writeWallpaperPreloadCache();
      renderWallpaperPanelState();
      if (isInitialWallpaperApply) {
        applyWallpaperVisualState(wallpaper);
        refreshWallpaperAdaptiveSampler();
        scheduleWallpaperVisualRefresh(visualSeq);
        finalizeInitialWallpaper();
        if (wallpaperState.appliedWallpaperVisualUrl !== imageUrl) {
          showWallpaperWhenReady(wallpaper, imageUrl, visualSeq);
        }
        return;
      }
      finalizeInitialWallpaper();
      showWallpaperWhenReady(wallpaper, imageUrl, visualSeq);
    }

    // Keeps the current wallpaper until the next one has loaded, or until its fallback is ready.
    function showWallpaperWhenReady(wallpaper, imageUrl, visualSeq) {
      waitForWallpaperImageReady(imageUrl).then(() => {
        return waitForWallpaperImageReady(wallpaper ? getDisplayedWallpaperImageUrl(wallpaper) : '');
      }).then(() => {
        if (visualSeq !== wallpaperState.wallpaperVisualSeq) {
          return;
        }
        const displayedUrl = wallpaper ? getDisplayedWallpaperImageUrl(wallpaper) : '';
        const shouldAnimateVisualChange = displayedUrl !== wallpaperState.appliedWallpaperVisualUrl ||
          Boolean(wallpaper) !== wallpaperState.appliedWallpaperVisualActive;
        const transitionLayer = shouldAnimateVisualChange ? createWallpaperTransitionLayer() : null;
        applyWallpaperVisualState(wallpaper);
        releaseWallpaperTransitionLayer(transitionLayer);
        scheduleWallpaperVisualRefresh(visualSeq);
      });
    }

    function applyResolvedNewtabWallpaper(options) {
      const mode = getResolvedWallpaperMode();
      applyNewtabWallpaper(getEffectiveWallpaperIdForMode(mode), Object.assign({}, options || {}, { mode }));
      if (wallpaperState.hasStoredWallpaperStateLoaded) cacheShownWallpaperImages();
    }

    function applyStoredWallpaperState(syncedValue, localValue) {
      const syncedResolution = resolveSyncedWallpaperValue(syncedValue.value, syncedValue.hasValue);
      const localResolution = resolveLocalWallpaperOverride(localValue.value, localValue.hasValue);
      const migrated = applyLocalWallpaperMigrations(
        localResolution.overrides,
        syncedResolution.localMigrations
      );
      setWallpaperPrefs(syncedResolution.prefs, migrated.overrides);
      wallpaperState.hasStoredWallpaperStateLoaded = true;
      bindWallpaperPageShownListeners();
      wallpaperState.activeWallpaperMode = wallpaperState.currentWallpaperPrefs.sameForModes
        ? getResolvedWallpaperMode()
        : normalizeWallpaperMode(wallpaperState.activeWallpaperMode);
      const didSyncWallpaperEffects = synchronizeWallpaperEffectPrefsWithWallpaperModes();
      applyWallpaperEffectForResolvedMode();
      applyResolvedNewtabWallpaper();
      syncWallpaperSourceTabToEditMode();
      renderWallpaperPanelState();
      if (syncedResolution.sanitizedValue !== null) {
        writeSyncedWallpaperValue(syncedResolution.sanitizedValue);
      } else if (!syncedValue.fromOnlineKey && getWallpaperStorageRawIds(syncedValue.value).some(isOnlineWallpaperId)) {
        // Move online picks saved under the shared key before older versions can clear them.
        writeSyncedWallpaperValue(syncedValue.value);
      }
      if (localResolution.shouldClear || migrated.changed) {
        writeLocalWallpaperValue(buildLocalWallpaperStorageValue(
          wallpaperState.currentLocalWallpaperOverrides,
          wallpaperState.currentWallpaperPrefs.sameForModes
        ));
      }
      if (didSyncWallpaperEffects && storageArea) {
        storageArea.set({
          [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: getWallpaperEffectStorageValue()
        });
      }
    }

    function loadStoredWallpaperState(options) {
      const config = options || {};
      const changeSeq = wallpaperState.wallpaperStorageChangeSeq;
      return Promise.all([
        readStorageValue(storageArea, NEWTAB_WALLPAPER_STORAGE_KEY),
        readStorageValue(localWallpaperStorageArea, NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY),
        readStorageValue(storageArea, NEWTAB_ONLINE_WALLPAPER_STORAGE_KEY),
        readStorageValue(storageArea, NEWTAB_LINK_WALLPAPERS_STORAGE_KEY),
        readStorageValue(storageArea, NEWTAB_DAILY_WALLPAPER_PICKS_STORAGE_KEY),
        readStorageValue(storageArea, NEWTAB_CURATED_MIX_EXCLUDED_STORAGE_KEY)
      ]).then((stored) => {
        wallpaperState.dailyWallpaperPicks = normalizeDailyWallpaperPicks(stored[4].value);
        // Before any photo resolves: the random daily photo and the mix's pages follow it.
        REMOTE_CONTENT.setRandomMixExcluded(stored[5].value);
        const results = [mergeOnlineWallpaperValue(stored[0], stored[2]), stored[1]];
        const linksChanged = setLinkWallpapers(stored[3].value);
        const linkIds = getWallpaperStorageRawIds(results[0].value).filter(isLinkWallpaperId);
        const customWallpaperPromise = takePreloadedCustomWallpaper().then(() => {
          const customWallpaperIds = getStoredCustomWallpaperIds(results)
            .filter((id) => !hasLoadedStoredCustomWallpaper(id));
          return customWallpaperIds.length > 0
            ? readCustomWallpaperRecordsByIds(customWallpaperIds).then((records) => {
              mergeCustomWallpaperRecords(records);
            })
            : null;
        }).catch(warnWallpaperStoreFailure('Could not read local wallpapers; showing the default.'));
        const remoteIds = getWallpaperStorageRawIds(results[0].value)
          .map((id) => normalizeNewtabWallpaperId(id))
          .filter((id) => REMOTE_CONTENT.wallpaperFromId(id));
        // Picks are dated Bing photos or bundled ones; restore them like any chosen photo.
        const pickIds = remoteIds.map(getDailyWallpaperPick).filter(Boolean);
        const preloadedDailyCopies = readPreloadedDailyWallpaperCopies();
        // Read cached copies only once photos are restored: the daily Bing photo resolves from storage.
        const cachedImagesTask = Promise.all(remoteIds.concat(pickIds).map((id) => remoteClient.restoreWallpaper(id)))
          .then(() => readCachedWallpaperImages(linkIds.concat(remoteIds.map((id) => getWallpaperById(id))
            .filter((item) => item && item.cacheImage).map((item) => item.dailyId || item.id))
            .concat(Array.from(preloadedDailyCopies.values()).map((image) => image.id))))
          .then(() => preloadedDailyCopies.forEach((image, slotId) => {
            const copy = getCachedWallpaperImage(image.id, image.url);
            if (copy && !dailyWallpaperStandIns.has(slotId)) dailyWallpaperStandIns.set(slotId, copy);
          }));
        return Promise.all([customWallpaperPromise, cachedImagesTask]).then(() => {
          if (changeSeq !== wallpaperState.wallpaperStorageChangeSeq ||
              typeof config.shouldApply === 'function' && !config.shouldApply()) {
            return false;
          }
          applyStoredWallpaperState(results[0], results[1]);
          cacheShownWallpaperImages();
          if (linksChanged && wallpaperState.customWallpaperCatalogLoaded) {
            renderWallpaperPanelState();
            cacheListedLinkWallpapers();
          }
          remoteClient.setPinnedIds(remoteIds);
          if (remoteIds.includes(REMOTE_CONTENT.BING_DAILY_ID)) {
            remoteClient.ensureWallpaper(REMOTE_CONTENT.BING_DAILY_ID).then(() => {
              if (getEffectiveWallpaperIdForMode(getResolvedWallpaperMode()) === REMOTE_CONTENT.BING_DAILY_ID) {
                applyResolvedNewtabWallpaper();
              }
              renderWallpaperPanelState();
            }).catch(() => {
              // Offline or Bing is down: the built-in stand-in stays until the next visit.
            });
          }
          return true;
        });
      });
    }

    // The copy the preload painted for each daily slot (see wallpaper-preload.js), which stands in
    // until the slot's photo of the day has its own copy, so the first frame and the runtime agree.
    function readPreloadedDailyWallpaperCopies() {
      const copies = new Map();
      try {
        const data = JSON.parse(window.localStorage.getItem(PRELOAD_STORAGE_KEY) || 'null');
        const today = REMOTE_CONTENT.localDay(Date.now());
        NEWTAB_WALLPAPER_MODES.forEach((mode) => {
          const entry = data && data.wallpapers && data.wallpapers[mode];
          if (!entry || !REMOTE_CONTENT.isDailyWallpaperId(entry.id)) return;
          const image = entry.next && entry.next.day === today ? entry.next.cachedImage : entry.cachedImage;
          if (image && typeof image.id === 'string' && typeof image.url === 'string') copies.set(entry.id, image);
        });
      } catch (_error) {
        // Only a head start; a slot without a stand-in shows its photo once cached.
      }
      return copies;
    }

    function bootstrapInitialWallpaper() {
      if (hasWallpaperBootstrapStarted) {
        return wallpaperState.initialWallpaperReadyPromise;
      }
      hasWallpaperBootstrapStarted = true;
      loadStoredWallpaperState();
      return wallpaperState.initialWallpaperReadyPromise;
    }

    function normalizeWallpaperRestoreId(mode) {
      const normalizedMode = normalizeWallpaperMode(mode);
      return normalizeNewtabWallpaperId(lastActiveWallpaperIdsByMode[normalizedMode]) ||
        normalizeNewtabWallpaperId(lastActiveWallpaperId) ||
        NEWTAB_WALLPAPER_DEFAULT_ID;
    }

    function persistWallpaperEnabled(enabled) {
      wallpaperState.bingSelectionSeq += 1;
      wallpaperState.wallpaperStorageChangeSeq += 1;
      const prefs = getWritableWallpaperPrefs();
      const overrides = getWritableLocalWallpaperOverrides();
      if (enabled) {
        NEWTAB_WALLPAPER_MODES.forEach((mode) => {
          if (getEffectiveWallpaperIdForMode(mode)) {
            return;
          }
          overrides[mode] = null;
          prefs[mode] = normalizeWallpaperRestoreId(mode);
        });
        if (prefs.sameForModes) {
          const sharedId = prefs.light || prefs.dark || normalizeWallpaperRestoreId(getResolvedWallpaperMode());
          prefs.light = sharedId;
          prefs.dark = sharedId;
          overrides.dark = overrides.light;
        }
        setWallpaperPrefs(prefs, overrides);
        applyResolvedNewtabWallpaper();
        syncWallpaperSourceTabToEditMode();
        renderWallpaperPanelState();
        writeCurrentWallpaperPrefs({ showError: true });
        return;
      }
      NEWTAB_WALLPAPER_MODES.forEach((mode) => {
        const activeId = getEffectiveWallpaperIdForMode(mode);
        if (activeId) {
          rememberActiveWallpaperId(mode, activeId);
        }
        if (activeId && isCustomWallpaperId(activeId)) {
          overrides[mode] = NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE;
          return;
        }
        overrides[mode] = null;
        prefs[mode] = '';
      });
      if (prefs.sameForModes) {
        prefs.dark = prefs.light;
        overrides.dark = overrides.light;
      }
      setWallpaperPrefs(prefs, overrides);
      applyResolvedNewtabWallpaper();
      syncWallpaperSourceTabToEditMode();
      renderWallpaperPanelState();
      writeCurrentWallpaperPrefs({ showError: true });
    }

    function persistWallpaperModeConsistency(sameForModes) {
      const nextSameForModes = sameForModes !== false;
      const prefs = getWritableWallpaperPrefs();
      const overrides = getWritableLocalWallpaperOverrides();
      if (prefs.sameForModes === nextSameForModes) {
        renderWallpaperPanelState();
        return;
      }
      if (!nextSameForModes) {
        const sharedEffectPrefs = getWallpaperEffectPrefsForEditMode();
        const modeOrder = getWallpaperModePreferenceOrder();
        const sharedId = hasAnyWallpaperEnabled()
          ? getFirstEnabledWallpaperIdForModes(modeOrder)
          : '';
        const sharedOverride = getCopyableWallpaperLocalOverrideForId(modeOrder, sharedId);
        prefs.sameForModes = false;
        prefs.light = sharedOverride
          ? (prefs.light || NEWTAB_WALLPAPER_DEFAULT_ID)
          : sharedId;
        prefs.dark = prefs.light;
        if (sharedOverride) {
          overrides.light = sharedOverride;
          overrides.dark = sharedOverride;
        } else {
          overrides.light = null;
          overrides.dark = null;
        }
        wallpaperState.activeWallpaperMode = getResolvedWallpaperMode();
        setSharedWallpaperEffectPrefs(sharedEffectPrefs);
      } else {
        const sharedMode = getWallpaperEditMode();
        const sharedEffectPrefs = getWallpaperEffectPrefsForMode(sharedMode);
        const sharedId = getEffectiveWallpaperIdForMode(sharedMode);
        const sharedOverride = getWallpaperLocalOverrideForMode(sharedMode);
        prefs.sameForModes = true;
        prefs.light = sharedOverride && isCustomWallpaperId(sharedOverride)
          ? (prefs[sharedMode] || NEWTAB_WALLPAPER_DEFAULT_ID)
          : sharedId;
        prefs.dark = prefs.light;
        overrides.light = sharedOverride || null;
        overrides.dark = overrides.light;
        wallpaperState.activeWallpaperMode = getResolvedWallpaperMode();
        setSharedWallpaperEffectPrefs(sharedEffectPrefs);
      }
      setWallpaperPrefs(prefs, overrides);
      applyWallpaperEffectForResolvedMode();
      applyResolvedNewtabWallpaper();
      syncWallpaperSourceTabToEditMode();
      renderWallpaperPanelState();
      writeCurrentWallpaperPrefs({ showError: true });
      if (storageArea) {
        storageArea.set({
          [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: getWallpaperEffectStorageValue()
        });
      }
    }

    function persistNewtabWallpaper(id) {
      wallpaperState.bingSelectionSeq += 1;
      wallpaperState.wallpaperStorageChangeSeq += 1;
      const nextId = normalizeNewtabWallpaperId(id);
      const prefs = getWritableWallpaperPrefs();
      const overrides = getWritableLocalWallpaperOverrides();
      const targetModes = prefs.sameForModes
        ? NEWTAB_WALLPAPER_MODES.slice()
        : [getWallpaperEditMode()];
      targetModes.forEach((mode) => {
        if (nextId && isCustomWallpaperId(nextId)) {
          overrides[mode] = nextId;
          rememberActiveWallpaperId(mode, nextId);
          return;
        }
        overrides[mode] = null;
        prefs[mode] = nextId;
        if (nextId) {
          rememberActiveWallpaperId(mode, nextId);
        }
      });
      if (prefs.sameForModes) {
        prefs.dark = prefs.light;
        overrides.dark = overrides.light;
      }
      setWallpaperPrefs(prefs, overrides);
      remoteClient.setPinnedIds([prefs.light, prefs.dark]);
      applyResolvedNewtabWallpaper();
      renderWallpaperPanelState();
      if (nextId && isCustomWallpaperId(nextId)) {
        writeLocalWallpaperValue(
          buildLocalWallpaperStorageValue(wallpaperState.currentLocalWallpaperOverrides, wallpaperState.currentWallpaperPrefs.sameForModes),
          { showError: true }
        );
        return;
      }
      writeCurrentWallpaperPrefs({ showError: true });
    }

    return {
      primeWallpaperImage,
      loadCustomWallpapers,
      refreshCustomWallpapers,
      mergeCustomWallpaperRecords,
      applyResolvedNewtabWallpaper,
      loadStoredWallpaperState,
      bootstrapInitialWallpaper,
      persistWallpaperEnabled,
      persistWallpaperModeConsistency,
      persistNewtabWallpaper
    };
  }

  root.LumnoWallpaperRuntimeWallpaperSelection = { createWallpaperSelection };
})(globalThis);
