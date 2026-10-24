// @ts-nocheck
// What the appearance panel's controls do: the action table the React view
// calls, slider value inputs, and the wallpaper sources feature hint.
function createPanelActions(deps) {
  const {
    getWallpaperEffectPrefsForEditMode,
    CRT_PARAMETER_PHYSICAL_MAX,
    getCrtParameterPercent,
    getWallpaperStyleSliderValue,
    persistWallpaperEffectPrefs,
    getCrtParameterPhysicalValue,
    getWallpaperById,
    REMOTE_CONTENT,
    clearDailyWallpaperPick,
    selectBingWallpaper,
    persistNewtabWallpaper,
    NEWTAB_WALLPAPER_DEFAULT_ID,
    showTopActionTooltip,
    hideTopActionTooltip,
    isWallpaperPanelOpen,
    getWallpaperButtonLabel,
    animateWallpaperAppearanceScopeChange,
    getThemeScope,
    setThemeMode,
    persistSearchWidthFromSlider,
    setInputAutoFocusEnabled,
    renderWallpaperPanelState,
    setGlassStyle,
    setGlassTheme,
    persistTopContentMode,
    persistTimeFontWeight,
    SETTINGS,
    persistTimeFontSizeFromSlider,
    persistTimeOpacityFromSlider,
    persistTimeInk,
    persistTimeFont,
    persistTimeSecondsVisible,
    persistTime12Hour,
    setShortcutsVisible,
    setShortcutAddVisible,
    setShortcutDockMagnificationEnabled,
    persistShortcutColumnsFromSlider,
    persistShortcutSizeFromSlider,
    persistShortcutGapFromSlider,
    getShortcutLayoutDefault,
    shortcutSizeConfig,
    shortcutGapConfig,
    persistWallpaperEnabled,
    persistWallpaperModeConsistency,
    setWallpaperActiveMode,
    setWallpaperActiveTab,
    primeWallpaperImage,
    deleteCustomWallpaper,
    importCustomWallpaperFile,
    isLocalWallpaperLibraryFull,
    showLocalWallpaperLimitToast,
    setCustomWallpaperUrlFormOpen,
    openOnlineWallpaperMenu,
    submitCustomWallpaperUrl,
    getWallpaperSelectionIdForUi,
    loadBingCatalog,
    isWallpaperTileSelected,
    setCuratedDailyWallpaper,
    selectCuratedCategory,
    setCuratedMixCategory,
    showMoreCuratedWallpapers,
    getActiveDailyWallpaperId,
    setDailyWallpaperPick,
    getResolvedWallpaperOverlayMode,
    persistWallpaperOverlayOpacity,
    getWallpaperOverlayOpacityForCurrentMode,
    persistNewtabFavicon,
    getWallpaperPanelRefs,
    options,
    document,
    featureHints,
    window,
    chrome,
    featureHintVisibilityGate,
    t,
    getRiSvg,
    syncWallpaperSourceTabToEditMode,
    setWallpaperPanelOpenState,
    loadCustomWallpapers,
    closeWallpaperPanel
  } = deps;

  // The runtime state object shared with wallpaper.ts and the other modules.
  const wallpaperState = deps.wallpaperState;

  let wallpaperPanelRendered = false;

  function setWallpaperEffectParameter(sliderKey, value, change) {
    const currentPrefs = getWallpaperEffectPrefsForEditMode();
    const key = sliderKey === 'strength'
      ? (currentPrefs.type === 'crt' ? 'crtStrength' : 'strength')
      : sliderKey === 'size'
        ? (currentPrefs.type === 'blocks' ? 'blockSize' : 'size')
        : sliderKey;
    const isCrtParameter = currentPrefs.type === 'crt' && CRT_PARAMETER_PHYSICAL_MAX[key];
    const fallbackValue = isCrtParameter
      ? getCrtParameterPercent(key, currentPrefs[key])
      : currentPrefs[key];
    const sliderValue = getWallpaperStyleSliderValue(value, fallbackValue, change, sliderKey === 'strength');
    persistWallpaperEffectPrefs({
      [key]: isCrtParameter ? getCrtParameterPhysicalValue(key, sliderValue) : sliderValue
    });
  }

  function setBingDailyWallpaper(enabled) {
    const daily = getWallpaperById(REMOTE_CONTENT.BING_DAILY_ID);
    if (enabled) {
      clearDailyWallpaperPick(REMOTE_CONTENT.BING_DAILY_ID);
      selectBingWallpaper(REMOTE_CONTENT.BING_DAILY_ID);
    } else if (daily && daily.dailyId) {
      selectBingWallpaper(daily.dailyId);
    } else {
      // An unresolved daily photo shows the built-in default, so keep that one.
      persistNewtabWallpaper(NEWTAB_WALLPAPER_DEFAULT_ID);
    }
  }

  function createWallpaperPanelActions() {
    return Object.freeze({
      togglePanel: toggleWallpaperPanel,
      showTooltip: (anchor, text) => showTopActionTooltip(anchor, text),
      hideTooltip: () => hideTopActionTooltip(),
      showButtonTooltip(anchor) {
        if (isWallpaperPanelOpen()) {
          hideTopActionTooltip();
          return;
        }
        showTopActionTooltip(anchor, getWallpaperButtonLabel(), { placement: 'top' });
      },
      selectThemeScope: (scope) => animateWallpaperAppearanceScopeChange(getThemeScope(), scope),
      selectThemeMode: (mode) => setThemeMode(mode),
      setSearchWidth: (value, change) => persistSearchWidthFromSlider(value, change),
      setInputAutoFocus(enabled) {
        setInputAutoFocusEnabled(enabled);
        renderWallpaperPanelState();
      },
      setGlassStyle(value) {
        setGlassStyle(value);
        renderWallpaperPanelState();
      },
      selectGlassTheme(value) {
        setGlassTheme(value);
        renderWallpaperPanelState();
      },
      selectTopContent: (mode) => persistTopContentMode(mode),
      setTimeFontWeight: (value) => persistTimeFontWeight(value),
      resetTimeFontWeight: () => persistTimeFontWeight(SETTINGS.getNewtabTimeFont(wallpaperState.currentTimeFont).defaultWeight),
      setTimeFontSize: (value, change) => persistTimeFontSizeFromSlider(value, change),
      resetTimeFontSize: () => persistTimeFontSizeFromSlider(SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT, { final: true }),
      setTimeOpacity: (value, change) => persistTimeOpacityFromSlider(value, change),
      resetTimeOpacity: () => persistTimeOpacityFromSlider(SETTINGS.NEWTAB_TIME_OPACITY_DEFAULT, { final: true }),
      selectTimeInk: (value) => persistTimeInk(value),
      setTimeFont: (value) => persistTimeFont(value),
      setTimeSecondsVisible: (visible) => persistTimeSecondsVisible(visible),
      setTime12Hour: (enabled) => persistTime12Hour(enabled),
      setShortcutsVisible(visible) {
        setShortcutsVisible(visible, { persist: true });
        renderWallpaperPanelState();
      },
      setShortcutAddVisible(visible) {
        setShortcutAddVisible(visible, { persist: true });
        renderWallpaperPanelState();
      },
      setShortcutDockMagnification(enabled) {
        setShortcutDockMagnificationEnabled(enabled, { persist: true });
        renderWallpaperPanelState();
      },
      setShortcutColumns: (value, change) => persistShortcutColumnsFromSlider(value, change),
      setShortcutSize: (value, change) => persistShortcutSizeFromSlider(value, change),
      setShortcutGap: (value, change) => persistShortcutGapFromSlider(value, change),
      resetShortcutSize: () => persistShortcutSizeFromSlider(
        getShortcutLayoutDefault(shortcutSizeConfig, 48, 112, 64),
        { final: true }
      ),
      resetShortcutGap: () => persistShortcutGapFromSlider(
        getShortcutLayoutDefault(shortcutGapConfig, 0, 24, 4),
        { final: true }
      ),
      setWallpaperEnabled: (enabled) => persistWallpaperEnabled(enabled),
      setModeSync: (enabled) => persistWallpaperModeConsistency(enabled),
      selectWallpaperMode: (mode) => setWallpaperActiveMode(mode),
      selectSourceTab: (tab) => setWallpaperActiveTab(tab),
      selectWallpaper: (id) => persistNewtabWallpaper(id),
      primeWallpaper: (id) => primeWallpaperImage(id),
      deleteWallpaper: (id) => deleteCustomWallpaper(id),
      importWallpaperFile: (file) => importCustomWallpaperFile(file),
      toggleUrlForm() {
        if (wallpaperState.customWallpaperImporting) {
          return;
        }
        if (!wallpaperState.customWallpaperUrlFormOpen && isLocalWallpaperLibraryFull()) {
          showLocalWallpaperLimitToast();
          return;
        }
        setCustomWallpaperUrlFormOpen(!wallpaperState.customWallpaperUrlFormOpen);
      },
      openOnlineWallpaperMenu: (id, element, point) => openOnlineWallpaperMenu(id, element, point),
      showLocalWallpaperLimit: () => showLocalWallpaperLimitToast(),
      submitWallpaperUrl(url) {
        if (!wallpaperState.customWallpaperImporting) {
          submitCustomWallpaperUrl(url);
        }
      },
      clearUrlInvalid() {
        wallpaperState.customWallpaperUrlInvalid = false;
        renderWallpaperPanelState();
      },
      setBingDaily: setBingDailyWallpaper,
      restoreDailyWallpaper() {
        const dailyId = getWallpaperSelectionIdForUi();
        if (REMOTE_CONTENT.isDailyWallpaperId(dailyId)) {
          clearDailyWallpaperPick(dailyId);
        }
      },
      refreshBing: () => loadBingCatalog(true),
      selectBingWallpaper(id) {
        // The highlighted tile is already applied; re-clicking it should not leave daily mode.
        if (!isWallpaperTileSelected(id)) {
          selectBingWallpaper(id, { asDailyPick: true });
        }
      },
      setCuratedDaily: (enabled) => setCuratedDailyWallpaper(enabled),
      selectCuratedCategory: (category) => selectCuratedCategory(category),
      setCuratedMixCategory: (category, included) => setCuratedMixCategory(category, included),
      showMoreCurated: () => showMoreCuratedWallpapers(),
      selectCuratedWallpaper(id) {
        if (isWallpaperTileSelected(id)) {
          return;
        }
        const daily = getActiveDailyWallpaperId('curated');
        if (daily) setDailyWallpaperPick(daily, id);
        else persistNewtabWallpaper(id);
      },
      setOverlay(value, change) {
        const mode = getResolvedWallpaperOverlayMode();
        persistWallpaperOverlayOpacity(mode, getWallpaperStyleSliderValue(
          value,
          getWallpaperOverlayOpacityForCurrentMode(),
          change,
          true
        ));
      },
      selectEffect: (type) => persistWallpaperEffectPrefs({ type }),
      selectInkTone: (tone) => persistWallpaperEffectPrefs({ inkTone: tone }),
      setEffectParameter: setWallpaperEffectParameter,
      selectFavicon: (id) => persistNewtabFavicon(id)
    });
  }

  // The bookmark, site card and quote sections belong to their own runtimes; they
  // bind to the panel's elements the first time it opens.
  function bindWallpaperPanelSectionRuntimes() {
    if (wallpaperPanelRendered) {
      return;
    }
    wallpaperPanelRendered = true;
    const refs = getWallpaperPanelRefs();
    const quoteRuntime = options.getQuoteRuntime && options.getQuoteRuntime();
    if (quoteRuntime) quoteRuntime.bindSettings(refs, wallpaperState.wallpaperViewController);
    const sectionSettings = options.getSectionPanelSettings && options.getSectionPanelSettings();
    if (sectionSettings) {
      sectionSettings.bindSettings(refs, wallpaperState.wallpaperViewController, {
        bindSliderValueInput: bindPanelSliderValueInput,
        syncSliderValueInput: syncPanelSliderValueInput
      });
    }
  }

  // Number boxes beside the section runtimes' plain range inputs: typed values
  // commit on blur or Enter, clamped and stepped like the slider.
  function getPanelSliderValueInput(slider) {
    const row = slider && typeof slider.closest === 'function'
      ? slider.closest('.x-nt-range-slider-row')
      : null;
    return row ? row.querySelector('._x_extension_range_slider_value_input_2026_unique_') : null;
  }

  function syncPanelSliderValueInput(slider) {
    const valueInput = getPanelSliderValueInput(slider);
    if (!valueInput) {
      return;
    }
    valueInput.min = slider.min;
    valueInput.max = slider.max;
    valueInput.step = slider.step;
    valueInput.value = slider.value;
    valueInput.disabled = Boolean(slider.disabled);
    const label = String(slider.getAttribute('aria-label') || '').trim();
    if (label) {
      valueInput.setAttribute('aria-label', label);
    }
  }

  function commitPanelSliderValueInput(slider, valueInput) {
    const draft = String(valueInput.value || '').trim();
    const number = Number(draft);
    if (!draft || !Number.isFinite(number)) {
      syncPanelSliderValueInput(slider);
      return;
    }
    const min = Number(slider.min);
    const max = Number(slider.max);
    const step = Number(slider.step);
    const bounded = Math.min(
      Number.isFinite(max) ? max : number,
      Math.max(Number.isFinite(min) ? min : number, number)
    );
    slider.value = String(Number.isFinite(step) && step > 0 && Number.isFinite(min)
      ? min + Math.round((bounded - min) / step) * step
      : bounded);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    syncPanelSliderValueInput(slider);
  }

  function bindPanelSliderValueInput(slider) {
    const valueInput = getPanelSliderValueInput(slider);
    if (!slider || !valueInput || valueInput.dataset.sliderValueInputBound === 'true') {
      return;
    }
    valueInput.dataset.sliderValueInputBound = 'true';
    slider.addEventListener('input', () => syncPanelSliderValueInput(slider));
    slider.addEventListener('change', () => syncPanelSliderValueInput(slider));
    valueInput.addEventListener('input', () => {
      const number = Number(valueInput.value);
      const min = Number(slider.min);
      const max = Number(slider.max);
      if (!Number.isFinite(number)) {
        return;
      }
      if (Number.isFinite(min) && number < min) {
        valueInput.value = String(min);
      } else if (Number.isFinite(max) && number > max) {
        valueInput.value = String(max);
      }
    });
    valueInput.addEventListener('blur', () => commitPanelSliderValueInput(slider, valueInput));
    valueInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        valueInput.blur();
      }
    });
    syncPanelSliderValueInput(slider);
  }

  function isFocusRoutePending() {
    return Boolean(
      document.documentElement &&
      document.documentElement.getAttribute('data-nt-focus-route-pending') === 'true'
    );
  }

  // Points at the appearance button until the panel is opened once.
  function createWallpaperSourcesFeatureHint() {
    if (wallpaperState.wallpaperSourcesHintController ||
        isFocusRoutePending() ||
        !wallpaperState.wallpaperControl ||
        !featureHints ||
        typeof featureHints.createFeatureHint !== 'function') {
      return wallpaperState.wallpaperSourcesHintController;
    }
    const controller = featureHints.createFeatureHint({
      documentObj: document,
      windowObj: window,
      chromeApi: chrome,
      definition: 'newtab-wallpaper-sources',
      visibilityGate: featureHintVisibilityGate,
      t,
      getRiSvg
    });
    if (!controller || !controller.element) {
      return null;
    }
    wallpaperState.wallpaperSourcesHintController = controller;
    wallpaperState.wallpaperControl.appendChild(controller.element);
    return controller;
  }

  function dismissWallpaperSourcesFeatureHint() {
    if (wallpaperState.wallpaperSourcesHintController &&
        typeof wallpaperState.wallpaperSourcesHintController.dismiss === 'function') {
      wallpaperState.wallpaperSourcesHintController.dismiss();
    }
  }

  function openWallpaperPanel() {
    if (!wallpaperState.wallpaperPanel || !wallpaperState.wallpaperButton) {
      return;
    }
    if (!wallpaperPanelRendered) {
      bindWallpaperPanelSectionRuntimes();
      // The first open shows the source the current wallpaper comes from.
      syncWallpaperSourceTabToEditMode({ force: true });
    }
    dismissWallpaperSourcesFeatureHint();
    wallpaperState.wallpaperPanelOpen = true;
    renderWallpaperPanelState();
    setWallpaperPanelOpenState(true);
    if (wallpaperState.activeWallpaperTab === 'local') {
      loadCustomWallpapers();
    }
    if (wallpaperState.activeWallpaperTab === 'bing') loadBingCatalog();
  }
  function toggleWallpaperPanel() {
    if (isWallpaperPanelOpen()) {
      closeWallpaperPanel();
      return;
    }
    openWallpaperPanel();
  }

  return {
    createWallpaperPanelActions,
    createWallpaperSourcesFeatureHint
  };
}

export { createPanelActions };
