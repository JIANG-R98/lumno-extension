// Daily wallpapers: the Bing catalog and curated categories, the picks
// kept per day, refreshing them when a day has passed, and picking a Bing
// or curated photo.
function createDailyWallpapers(deps) {
  const {
    renderWallpaperPanelState,
    remoteClient,
    NEWTAB_WALLPAPER_MODES,
    getEffectiveWallpaperIdForMode,
    REMOTE_CONTENT,
    getResolvedWallpaperMode,
    applyResolvedNewtabWallpaper,
    document,
    window,
    getWallpaperSelectionIdForUi,
    writeStorageValue,
    storageArea,
    NEWTAB_DAILY_WALLPAPER_PICKS_STORAGE_KEY,
    showToast,
    t,
    getWallpaperTileSelectionId,
    formatMessage,
    playWallpaperEnterMotion,
    getWallpaperPanelRefs,
    NEWTAB_CURATED_MIX_EXCLUDED_STORAGE_KEY,
    persistNewtabWallpaper,
    getWallpaperById,
    NEWTAB_WALLPAPER_DEFAULT_ID,
    getWallpaperEditMode,
    beginToast
  } = deps;

  // The runtime state object shared with wallpaper.ts and the other modules.
  const wallpaperState = deps.wallpaperState;

  let bingCatalogSeq = 0;
  // Three full rows; the refresh button pages through the category.
  const CURATED_TILE_LIMIT = 9;
  let curatedPage = 0;
  let dailyWallpaperCheckedDay = '';
  let hasWallpaperPageShownListeners = false;

  function formatBingDate(date) {
    return /^\d{8}$/.test(String(date || ''))
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : '';
  }

  // Bing credits read "Place (© Photographer)"; show them as "Place · © Photographer".
  function formatBingCopyright(copyright) {
    const text = String(copyright || '').trim();
    const match = /^(.*?)\s*[(（]\s*(©[^()（）]*)[)）]\s*$/.exec(text);
    return match ? [match[1], match[2].trim()].filter(Boolean).join(' · ') : text;
  }

  function getBingWallpaperLabel(item) {
    return item ? [item.name, formatBingDate(item.date)].filter(Boolean).join(' · ') : '';
  }

  async function loadBingCatalog(refresh) {
    if (!wallpaperState.wallpaperViewController) return;
    const seq = ++bingCatalogSeq;
    wallpaperState.bingLoading = true;
    wallpaperState.bingStatus = 'loading';
    renderWallpaperPanelState();
    try {
      const items = await remoteClient.getCatalog(Boolean(refresh));
      if (seq !== bingCatalogSeq) return;
      wallpaperState.bingItems = items;
      wallpaperState.bingStatus = '';
      if (NEWTAB_WALLPAPER_MODES.some((mode) => getEffectiveWallpaperIdForMode(mode) === REMOTE_CONTENT.BING_DAILY_ID)) {
        await remoteClient.ensureWallpaper(REMOTE_CONTENT.BING_DAILY_ID).catch(() => {
          // The list loaded; if the daily photo still fails, the current wallpaper simply stays.
        });
        if (seq !== bingCatalogSeq) return;
        if (getEffectiveWallpaperIdForMode(getResolvedWallpaperMode()) === REMOTE_CONTENT.BING_DAILY_ID) {
          applyResolvedNewtabWallpaper();
        }
      }
    } catch (_error) {
      if (seq !== bingCatalogSeq) return;
      wallpaperState.bingStatus = 'error';
    } finally {
      if (seq === bingCatalogSeq) {
        wallpaperState.bingLoading = false;
        renderWallpaperPanelState();
      }
    }
  }

  // A New Tab can stay open past midnight; pick up the new daily photo when it is shown again.
  function refreshDailyWallpapersIfStale() {
    if (!wallpaperState.hasStoredWallpaperStateLoaded || document.visibilityState === 'hidden') return;
    const day = REMOTE_CONTENT.localDay(Date.now());
    if (day === dailyWallpaperCheckedDay) return;
    const dailyIds = NEWTAB_WALLPAPER_MODES.map((mode) => getEffectiveWallpaperIdForMode(mode))
      .filter((id) => REMOTE_CONTENT.isDailyWallpaperId(id));
    if (!dailyIds.length) return;
    dailyWallpaperCheckedDay = day;
    // Curated picks follow the date alone, so the new one is ready without a request.
    if (dailyIds.some((id) => id !== REMOTE_CONTENT.BING_DAILY_ID)) {
      applyResolvedNewtabWallpaper();
      renderWallpaperPanelState();
    }
    if (!dailyIds.includes(REMOTE_CONTENT.BING_DAILY_ID)) return;
    remoteClient.ensureWallpaper(REMOTE_CONTENT.BING_DAILY_ID).then(() => {
      if (getEffectiveWallpaperIdForMode(getResolvedWallpaperMode()) === REMOTE_CONTENT.BING_DAILY_ID) {
        applyResolvedNewtabWallpaper();
      }
      renderWallpaperPanelState();
    }).catch(() => {
      // Offline at midnight: yesterday's photo stays until the next check.
    });
  }

  // A background tab can miss the effect redraw for a photo that changed while it was hidden.
  function syncWallpaperEffectSource() {
    if (document.visibilityState === 'hidden' || !wallpaperState.wallpaperEffects ||
        typeof wallpaperState.wallpaperEffects.isSourceStale !== 'function' || !wallpaperState.wallpaperEffects.isSourceStale()) {
      return;
    }
    wallpaperState.wallpaperEffects.refresh({ immediate: true });
  }

  function handleWallpaperPageShown() {
    refreshDailyWallpapersIfStale();
    syncWallpaperEffectSource();
  }

  // Bound once the stored wallpaper loads, so a tab that never opens the panel still rolls over.
  function bindWallpaperPageShownListeners() {
    if (hasWallpaperPageShownListeners) return;
    hasWallpaperPageShownListeners = true;
    dailyWallpaperCheckedDay = REMOTE_CONTENT.localDay(Date.now());
    if (window && typeof window.addEventListener === 'function') {
      window.addEventListener('focus', handleWallpaperPageShown, { passive: true });
    }
    if (document && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', handleWallpaperPageShown, { passive: true });
    }
  }

  function normalizeDailyWallpaperPicks(value) {
    const picks = {};
    const source = value && typeof value === 'object' && value.picks && typeof value.picks === 'object'
      ? value.picks
      : {};
    Object.keys(source).forEach((dailyId) => {
      const pickId = String(source[dailyId] || '');
      if (REMOTE_CONTENT.isDailyWallpaperId(dailyId) && !REMOTE_CONTENT.isDailyWallpaperId(pickId) &&
          REMOTE_CONTENT.getWallpaperProvider(pickId) === REMOTE_CONTENT.getWallpaperProvider(dailyId)) {
        picks[dailyId] = pickId;
      }
    });
    return { day: value && typeof value.day === 'string' ? value.day : '', picks };
  }

  function getDailyWallpaperPick(dailyId) {
    if (!REMOTE_CONTENT.isDailyWallpaperId(dailyId) ||
        wallpaperState.dailyWallpaperPicks.day !== REMOTE_CONTENT.localDay(Date.now())) {
      return '';
    }
    return wallpaperState.dailyWallpaperPicks.picks[dailyId] || '';
  }

  function getActiveDailyWallpaperId(provider) {
    const id = getWallpaperSelectionIdForUi();
    return REMOTE_CONTENT.isDailyWallpaperId(id) && REMOTE_CONTENT.getWallpaperProvider(id) === provider ? id : '';
  }

  // Choosing today's own photo, or restoring it, simply drops the pick.
  function setDailyWallpaperPick(dailyId, pickId) {
    const today = REMOTE_CONTENT.localDay(Date.now());
    const picks = wallpaperState.dailyWallpaperPicks.day === today ? Object.assign({}, wallpaperState.dailyWallpaperPicks.picks) : {};
    const scheduled = remoteClient.getWallpaper(dailyId);
    if (!pickId || scheduled && scheduled.dailyId === pickId) delete picks[dailyId];
    else picks[dailyId] = pickId;
    wallpaperState.dailyWallpaperPicks = { day: today, picks };
    writeStorageValue(storageArea, NEWTAB_DAILY_WALLPAPER_PICKS_STORAGE_KEY,
      Object.keys(picks).length ? wallpaperState.dailyWallpaperPicks : '', () => {
        showToast(t('newtab_wallpaper_save_error', 'Failed to save wallpaper'), true);
      });
    applyResolvedNewtabWallpaper();
    renderWallpaperPanelState();
  }

  function clearDailyWallpaperPick(dailyId) {
    if (getDailyWallpaperPick(dailyId)) setDailyWallpaperPick(dailyId, '');
  }

  function getCuratedTileItems() {
    const items = REMOTE_CONTENT.getCuratedWallpapers(wallpaperState.curatedCategory);
    if (!items.length) return [];
    // Wrap around the end of the category so every page fills both rows.
    const start = (curatedPage * CURATED_TILE_LIMIT) % items.length;
    return Array.from({ length: Math.min(CURATED_TILE_LIMIT, items.length) },
      (_, index) => items[(start + index) % items.length]);
  }

  // Pages keep a fixed order, so choosing a photo never reshuffles the grid; instead the list
  // opens on the page that holds the chosen or daily photo.
  function showCuratedPageOfSelection() {
    const selectedId = getWallpaperTileSelectionId(getWallpaperSelectionIdForUi());
    const index = REMOTE_CONTENT.getCuratedWallpapers(wallpaperState.curatedCategory).findIndex((item) => item.id === selectedId);
    curatedPage = index >= 0 ? Math.floor(index / CURATED_TILE_LIMIT) : 0;
  }

  // Paintings are named by title, photos by photographer.
  function getCuratedPhotoLabel(item) {
    if (item && item.title) return item.title;
    return item && item.name && item.name !== 'Picsum'
      ? formatMessage('newtab_curated_photo_by', 'Photo by {name}', { name: item.name })
      : '';
  }

  function getCuratedPhotoMeta(item) {
    if (item && item.title) {
      return [item.name, t('newtab_curated_art_meta', 'The Cleveland Museum of Art')].filter(Boolean).join(' · ');
    }
    return t('newtab_curated_source_meta', 'Unsplash · via Lorem Picsum');
  }

  function getCuratedCategoryLabel(category) {
    const fallbacks = { random: 'Mix', nature: 'Nature', water: 'Water', city: 'City', minimal: 'Minimal', art: 'Art' };
    return t(`newtab_curated_category_${category}`, fallbacks[category] || category);
  }

  function isCuratedDailyWallpaperActive() {
    const selectedId = getWallpaperSelectionIdForUi();
    return REMOTE_CONTENT.isDailyWallpaperId(selectedId) &&
      REMOTE_CONTENT.getWallpaperProvider(selectedId) === 'curated';
  }

  function selectCuratedCategory(category) {
    if (!REMOTE_CONTENT.CURATED_CATEGORIES.includes(category) || category === wallpaperState.curatedCategory) return;
    wallpaperState.curatedCategory = category;
    showCuratedPageOfSelection();
    renderWallpaperPanelState();
    playWallpaperEnterMotion(getWallpaperPanelRefs().curatedItemsHost, 'enter');
  }
  function setCuratedMixCategory(category, included) {
    const excluded = REMOTE_CONTENT.CURATED_CATEGORIES
      .filter((value) => value !== REMOTE_CONTENT.RANDOM_CATEGORY &&
        !REMOTE_CONTENT.getRandomMixCategories().includes(value));
    const next = included ? excluded.filter((value) => value !== category) : excluded.concat(category);
    const normalized = REMOTE_CONTENT.normalizeRandomMixExcluded(next);
    if (normalized.length !== next.length || normalized.join() === excluded.join()) return;
    REMOTE_CONTENT.setRandomMixExcluded(normalized);
    writeStorageValue(storageArea, NEWTAB_CURATED_MIX_EXCLUDED_STORAGE_KEY, normalized.length ? normalized : '', () => {
      showToast(t('newtab_wallpaper_save_error', 'Failed to save wallpaper'), true);
    });
    showCuratedPageOfSelection();
    // The random daily photo may now come from another category.
    applyResolvedNewtabWallpaper();
    renderWallpaperPanelState();
    playWallpaperEnterMotion(getWallpaperPanelRefs().curatedItemsHost, 'enter');
  }
  function showMoreCuratedWallpapers() {
    curatedPage += 1;
    renderWallpaperPanelState();
    playWallpaperEnterMotion(getWallpaperPanelRefs().curatedItemsHost, 'enter');
  }
  function setCuratedDailyWallpaper(enabled) {
    if (enabled) {
      const dailyId = REMOTE_CONTENT.curatedDailyId(wallpaperState.curatedCategory);
      clearDailyWallpaperPick(dailyId);
      persistNewtabWallpaper(dailyId);
      showCuratedPageOfSelection();
    } else {
      // Keep the photo on screen, picked or not, as turning off the Bing daily wallpaper does.
      const daily = getWallpaperById(getWallpaperSelectionIdForUi());
      persistNewtabWallpaper(daily && daily.dailyId || NEWTAB_WALLPAPER_DEFAULT_ID);
    }
    renderWallpaperPanelState();
  }

  async function selectBingWallpaper(id, options) {
    if (wallpaperState.bingSelecting) return;
    // A tile chosen while the daily photo is on replaces it for today only.
    const dailyId = options && options.asDailyPick ? getActiveDailyWallpaperId('bing') : '';
    const seq = ++wallpaperState.bingSelectionSeq;
    const mode = getWallpaperEditMode();
    const sameForModes = wallpaperState.currentWallpaperPrefs.sameForModes;
    wallpaperState.bingSelecting = true;
    renderWallpaperPanelState();
    // The new wallpaper is its own success signal, so only a failure leaves a message.
    const toastTask = beginToast(t('newtab_bing_saving', 'Saving wallpaper…'));
    try {
      await remoteClient.ensureWallpaper(id);
      toastTask.done();
      if (seq !== wallpaperState.bingSelectionSeq || mode !== getWallpaperEditMode() ||
          sameForModes !== wallpaperState.currentWallpaperPrefs.sameForModes) return;
      if (dailyId) setDailyWallpaperPick(dailyId, id);
      else persistNewtabWallpaper(id);
    } catch (_error) {
      toastTask.fail(seq === wallpaperState.bingSelectionSeq
        ? t('newtab_bing_save_error', 'Could not save wallpaper. Please try again.')
        : '');
    } finally {
      wallpaperState.bingSelecting = false;
      renderWallpaperPanelState();
    }
  }

  return {
    formatBingCopyright,
    getBingWallpaperLabel,
    loadBingCatalog,
    bindWallpaperPageShownListeners,
    normalizeDailyWallpaperPicks,
    getDailyWallpaperPick,
    getActiveDailyWallpaperId,
    setDailyWallpaperPick,
    clearDailyWallpaperPick,
    getCuratedTileItems,
    showCuratedPageOfSelection,
    getCuratedPhotoLabel,
    getCuratedPhotoMeta,
    getCuratedCategoryLabel,
    isCuratedDailyWallpaperActive,
    selectCuratedCategory,
    setCuratedMixCategory,
    showMoreCuratedWallpapers,
    setCuratedDailyWallpaper,
    selectBingWallpaper
  };
}

export { createDailyWallpapers };
