(function(root) {
  // Binds every setting control to its storage key: the one-time loads and
  // the setting binder entries for each section, including the daily quote.
  function createSettingBinds(deps) {
    const {
      LANGUAGE_STORAGE_KEY,
      normalizeLanguageMode,
      localStorageArea,
      applyLanguageMode,
      getActivePrimaryAreaName,
      NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
      NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
      NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
      NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
      NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
      NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
      NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
      normalizeNewtabShortcutsVisible,
      normalizeNewtabShortcutAddVisible,
      normalizeNewtabShortcutDockMagnificationEnabled,
      inferNewtabShortcutColumnsFromWidth,
      normalizeNewtabShortcutColumns,
      normalizeNewtabShortcutSize,
      normalizeNewtabShortcutGap,
      setOptionsToggleState,
      newtabShortcutsToggle,
      newtabShortcutAddToggle,
      newtabShortcutDockMagnificationToggle,
      renderNewtabShortcutColumnsControl,
      renderNewtabShortcutSizeControl,
      renderNewtabShortcutGapControl,
      syncNewtabShortcutSubcontrolAvailability,
      AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY,
      AGGREGATE_SEARCH_STORAGE_KEY,
      deriveLegacyAggregateSearchAutoGroupEnabled,
      normalizeAggregateSearchAutoGroupEnabled,
      aggregateSearchAutoGroupToggle,
      refreshCustomSelects,
      SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
      normalizeSearchResultSourceTypes,
      setSearchResultSourceTypeState,
      storageChanges,
      settingBinder,
      RECENT_COUNT_STORAGE_KEY,
      normalizeRecentCount,
      renderRecentCountControl,
      updateRecentModeTabsVisibility,
      NEWTAB_WIDTH_MODE_STORAGE_KEY,
      normalizeNewtabWidthMode,
      newtabWidthSelect,
      setNewtabWidthTabState,
      OVERLAY_SIZE_MODE_STORAGE_KEY,
      normalizeOverlaySizeMode,
      setOverlaySizeTabState,
      OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
      normalizeOverlayEnterAnimation,
      setOverlayEnterAnimationTabState,
      localSettingBinder,
      OVERLAY_FONT_FAMILY_STORAGE_KEY,
      SETTINGS,
      overlayFontSelect,
      OVERLAY_FONT_LABELS_STORAGE_KEY,
      overlayFontFallbackSelect,
      OVERLAY_FONT_FALLBACK_STORAGE_KEY,
      SEARCH_RESULT_PRIORITY_STORAGE_KEY,
      normalizeSearchResultPriority,
      searchResultPrioritySelect,
      setSearchResultPriorityTabState,
      newtabGlassStyleSelect,
      syncNewtabGlassThemeVisibility,
      setNewtabGlassThemeTabState,
      getMessage,
      showToast,
      createOptionsSegmentedControlController,
      optionsSettingsControlsApi,
      registerOptionsToggleControl,
      setConditionalSettingsElementVisibility,
      animateOptionsPanelHeight,
      SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
      searchResultTabPositionSelect,
      SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
      normalizeSearchResultDisplayLimit,
      renderSearchResultDisplayLimitControl,
      RECENT_MODE_STORAGE_KEY,
      recentModeSelect,
      setRecentModeTabState,
      BOOKMARK_COUNT_STORAGE_KEY,
      normalizeBookmarkCount,
      renderBookmarkRowsControl,
      updateBookmarkColumnsSettingVisibility,
      BOOKMARK_COLUMNS_STORAGE_KEY,
      normalizeBookmarkColumns,
      renderBookmarkColumnsControl,
      NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
      normalizeNewtabTopContentMode,
      setNewtabTopContentTabState,
      newtabTimeFontSelect,
      renderNewtabTimeFontWeightControl,
      NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
      normalizeNewtabTimeFontWeight,
      renderNewtabTimeFontSizeControl,
      renderNewtabTimeOpacityControl,
      setNewtabTimeInkTabState,
      NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
      setNewtabOpenInNewTabState,
      TOGGLE_SETTINGS,
      toggleSettingControls,
      RESTRICTED_ACTION_STORAGE_KEY,
      restrictedActionSelect,
      setRestrictedActionTabState
    } = deps;

    // The page state object shared with options.js and the other modules.
    const optionsState = deps.optionsState;

    // Keeps a copy of the language in chrome.storage.local and moves a value
    // found only there into the primary area. With nothing stored yet the page
    // shows the system language without writing it, so a choice another page is
    // still saving is not overwritten; the language change handler applies that
    // choice once it lands.
    function loadLanguageSetting() {
      if (!optionsState.storageArea) {
        return;
      }
      optionsState.storageArea.get([LANGUAGE_STORAGE_KEY], (result) => {
        if (Object.prototype.hasOwnProperty.call(result, LANGUAGE_STORAGE_KEY)) {
          const storedRaw = result[LANGUAGE_STORAGE_KEY];
          const stored = normalizeLanguageMode(storedRaw);
          if (storedRaw !== stored) {
            optionsState.storageArea.set({ [LANGUAGE_STORAGE_KEY]: stored });
          }
          if (localStorageArea) {
            localStorageArea.set({ [LANGUAGE_STORAGE_KEY]: stored });
          }
          applyLanguageMode(stored);
          return;
        }
        if (getActivePrimaryAreaName() !== 'sync' || !localStorageArea) {
          applyLanguageMode('system');
          return;
        }
        localStorageArea.get([LANGUAGE_STORAGE_KEY], (localResult) => {
          if (!Object.prototype.hasOwnProperty.call(localResult, LANGUAGE_STORAGE_KEY)) {
            applyLanguageMode('system');
            return;
          }
          const localMode = normalizeLanguageMode(localResult[LANGUAGE_STORAGE_KEY]);
          localStorageArea.set({ [LANGUAGE_STORAGE_KEY]: localMode });
          optionsState.storageArea.set({ [LANGUAGE_STORAGE_KEY]: localMode });
          applyLanguageMode(localMode);
        });
      });
    }

    // The New Tab shortcut switches and sliders are read together because the
    // column count falls back to one inferred from the older width setting.
    function loadNewtabShortcutSettings() {
      if (!optionsState.storageArea) {
        return;
      }
      optionsState.storageArea.get([
        NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
        NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
        NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
        NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
        NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
        NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
        NEWTAB_SHORTCUT_GAP_STORAGE_KEY
      ], (result) => {
        const rawColumns = result[NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY];
        const values = {
          [NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]:
            normalizeNewtabShortcutsVisible(result[NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]),
          [NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]:
            normalizeNewtabShortcutAddVisible(result[NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]),
          [NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]:
            normalizeNewtabShortcutDockMagnificationEnabled(
              result[NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]
            ),
          [NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY]: rawColumns === undefined
            ? inferNewtabShortcutColumnsFromWidth(result[NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY])
            : normalizeNewtabShortcutColumns(rawColumns),
          [NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]:
            normalizeNewtabShortcutSize(result[NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]),
          [NEWTAB_SHORTCUT_GAP_STORAGE_KEY]:
            normalizeNewtabShortcutGap(result[NEWTAB_SHORTCUT_GAP_STORAGE_KEY])
        };
        setOptionsToggleState(newtabShortcutsToggle, values[NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]);
        setOptionsToggleState(newtabShortcutAddToggle, values[NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]);
        setOptionsToggleState(
          newtabShortcutDockMagnificationToggle,
          values[NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]
        );
        renderNewtabShortcutColumnsControl(values[NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY]);
        renderNewtabShortcutSizeControl(values[NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]);
        renderNewtabShortcutGapControl(values[NEWTAB_SHORTCUT_GAP_STORAGE_KEY]);
        syncNewtabShortcutSubcontrolAvailability();
        const repairs = {};
        Object.keys(values).forEach((key) => {
          if (result[key] !== values[key]) {
            repairs[key] = values[key];
          }
        });
        if (Object.keys(repairs).length > 0) {
          optionsState.storageArea.set(repairs);
        }
      });
    }

    // Older installs have aggregate searches but no auto-group choice; it is
    // derived from those searches the first time.
    function loadAggregateSearchAutoGroupSetting() {
      if (!optionsState.storageArea) {
        return;
      }
      optionsState.storageArea.get([
        AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY,
        AGGREGATE_SEARCH_STORAGE_KEY
      ], (result) => {
        const rawValue = result[AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY];
        const stored = typeof rawValue === 'undefined'
          ? deriveLegacyAggregateSearchAutoGroupEnabled(result[AGGREGATE_SEARCH_STORAGE_KEY])
          : normalizeAggregateSearchAutoGroupEnabled(rawValue);
        setOptionsToggleState(aggregateSearchAutoGroupToggle, stored);
        if (rawValue !== stored) {
          optionsState.storageArea.set({ [AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY]: stored });
        }
        refreshCustomSelects();
      });
    }

    function loadSearchResultSourceTypes() {
      if (!optionsState.storageArea) {
        return;
      }
      optionsState.storageArea.get([SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY], (result) => {
        const stored = result[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY];
        const sourceTypes = normalizeSearchResultSourceTypes(stored);
        setSearchResultSourceTypeState(sourceTypes);
        if (!Array.isArray(stored) || JSON.stringify(stored) !== JSON.stringify(sourceTypes)) {
          optionsState.storageArea.set({ [SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY]: sourceTypes });
        }
      });
    }
    storageChanges.on(SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY, (changes) => {
      setSearchResultSourceTypeState(changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY].newValue);
    });

    loadLanguageSetting();
    settingBinder.bindSetting({
      key: RECENT_COUNT_STORAGE_KEY,
      normalize: normalizeRecentCount,
      apply(count) {
        renderRecentCountControl(count);
        updateRecentModeTabsVisibility(count);
      },
      repairOnChange: false,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: NEWTAB_WIDTH_MODE_STORAGE_KEY,
      normalize: normalizeNewtabWidthMode,
      apply(mode) {
        if (newtabWidthSelect) {
          newtabWidthSelect.value = mode;
        }
        setNewtabWidthTabState(mode);
      },
      repairOnChange: false,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: OVERLAY_SIZE_MODE_STORAGE_KEY,
      normalize: normalizeOverlaySizeMode,
      apply: setOverlaySizeTabState,
      repairOnChange: false,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
      normalize: normalizeOverlayEnterAnimation,
      apply: setOverlayEnterAnimationTabState,
      repairOnChange: false
    });
    localSettingBinder.bindSetting({
      key: OVERLAY_FONT_FAMILY_STORAGE_KEY,
      normalize: SETTINGS.normalizeOverlayFontFamily,
      apply(family) {
        optionsState.currentOverlayFontFamily = family;
        if (!overlayFontSelect) {
          return;
        }
        optionsState.ensureOverlayFontOption(overlayFontSelect, family);
        overlayFontSelect.value = family;
        optionsState.refreshOptionsSelectItems(overlayFontSelect);
        optionsState.renderOverlayFontMissingNotices();
      },
      repairOnChange: false,
      refreshSelects: true
    });
    localSettingBinder.bindSetting({
      key: OVERLAY_FONT_LABELS_STORAGE_KEY,
      // Families may load after the names, so nothing is pruned on read.
      normalize: (value) => SETTINGS.normalizeOverlayFontLabels(value),
      apply(labels) {
        optionsState.currentOverlayFontLabels = labels;
        [[overlayFontSelect, optionsState.currentOverlayFontFamily], [overlayFontFallbackSelect, optionsState.currentOverlayFontFallback]]
          .forEach(([select, family]) => {
            if (select && family) {
              optionsState.ensureOverlayFontOption(select, family);
              optionsState.refreshOptionsSelectItems(select);
            }
          });
        optionsState.renderOverlayFontMissingNotices();
      },
      repairOnLoad: false,
      repairOnChange: false,
      refreshSelects: true
    });
    localSettingBinder.bindSetting({
      key: OVERLAY_FONT_FALLBACK_STORAGE_KEY,
      normalize: SETTINGS.normalizeOverlayFontFamily,
      apply(family) {
        optionsState.currentOverlayFontFallback = family;
        if (!overlayFontFallbackSelect) {
          return;
        }
        optionsState.ensureOverlayFontOption(overlayFontFallbackSelect, family);
        overlayFontFallbackSelect.value = family;
        optionsState.refreshOptionsSelectItems(overlayFontFallbackSelect);
        optionsState.renderOverlayFontMissingNotices();
      },
      repairOnChange: false,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: SEARCH_RESULT_PRIORITY_STORAGE_KEY,
      normalize: normalizeSearchResultPriority,
      apply(priority) {
        if (searchResultPrioritySelect) {
          searchResultPrioritySelect.value = priority;
        }
        setSearchResultPriorityTabState(priority);
      },
      repairOnChange: false,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: SETTINGS.NEWTAB_GLASS_STYLE_STORAGE_KEY,
      normalize: SETTINGS.normalizeNewtabGlassStyle,
      apply(style) {
        if (newtabGlassStyleSelect) {
          newtabGlassStyleSelect.value = style;
        }
        optionsState.currentNewtabGlassStyle = style;
        syncNewtabGlassThemeVisibility();
      },
      repairOnLoad: false,
      repairOnChange: false,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: SETTINGS.NEWTAB_GLASS_THEME_STORAGE_KEY,
      normalize: SETTINGS.normalizeNewtabGlassTheme,
      apply: setNewtabGlassThemeTabState,
      repairOnLoad: false,
      repairOnChange: false
    });
    // The daily quote mirrors the quote section of New Tab's appearance panel.
    const CUSTOM_QUOTES = globalThis.LumnoCustomQuotes;
    optionsState.dailyQuoteSettings = globalThis.LumnoOptionsDailyQuote.createDailyQuoteSettings({
      settings: SETTINGS,
      customQuotes: CUSTOM_QUOTES,
      getMessage,
      showToast: (message, isError) => showToast(message, isError),
      syncArea: optionsState.storageArea,
      localArea: localStorageArea,
      createSegmented: createOptionsSegmentedControlController,
      createRangeSlider: (host, controllerOptions) =>
        optionsSettingsControlsApi.createRangeSliderControlController(host, controllerOptions),
      registerToggle: registerOptionsToggleControl,
      setToggleState: setOptionsToggleState,
      registerSelect: (select, kind) => {
        const record = optionsState.registerOptionsSelectControl(select, kind);
        if (record) {
          optionsState.renderOptionsSelectControl(select);
        }
        return record;
      },
      setSelectState: optionsState.setOptionsSelectState,
      setRowVisible: setConditionalSettingsElementVisibility,
      animateHeight: animateOptionsPanelHeight
    });
    if (optionsState.dailyQuoteSettings) {
      settingBinder.bindSetting({
        key: SETTINGS.NEWTAB_QUOTE_PREFS_STORAGE_KEY,
        normalize: SETTINGS.normalizeNewtabQuotePrefs,
        apply: optionsState.dailyQuoteSettings.applyPrefs,
        repairOnLoad: false,
        repairOnChange: false,
        refreshSelects: true
      });
      storageChanges.on(CUSTOM_QUOTES.KEY, (changes) => {
        optionsState.dailyQuoteSettings.applyLibrary(changes[CUSTOM_QUOTES.KEY].newValue);
      }, { area: 'local' });
      optionsState.dailyQuoteSettings.load();
    }
    settingBinder.bindSetting({
      key: SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
      normalize: SETTINGS.normalizeSearchResultTabPosition,
      apply(position) {
        if (searchResultTabPositionSelect) {
          searchResultTabPositionSelect.value = position;
        }
      },
      repairOnLoad: false,
      repairOnChange: false,
      refreshSelects: true
    });
    loadSearchResultSourceTypes();
    settingBinder.bindSetting({
      key: SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
      normalize: normalizeSearchResultDisplayLimit,
      apply: renderSearchResultDisplayLimitControl
    });
    settingBinder.bindSetting({
      key: RECENT_MODE_STORAGE_KEY,
      // A missing or unknown mode starts as "most visited"; a later change to
      // anything but "most" shows "latest", as the switch only offers the two.
      normalize: (value) => (value === 'latest' || value === 'most' ? value : 'most'),
      normalizeChange: (value) => (value === 'most' ? 'most' : 'latest'),
      apply(mode) {
        if (recentModeSelect) {
          recentModeSelect.value = mode;
        }
        setRecentModeTabState(mode);
      },
      repairOnChange: false,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: BOOKMARK_COUNT_STORAGE_KEY,
      normalize: normalizeBookmarkCount,
      apply(count) {
        renderBookmarkRowsControl(count);
        updateBookmarkColumnsSettingVisibility(count);
      },
      repairOnChange: false
    });
    settingBinder.bindSetting({
      key: BOOKMARK_COLUMNS_STORAGE_KEY,
      normalize: normalizeBookmarkColumns,
      apply: renderBookmarkColumnsControl,
      repairOnChange: false,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
      normalize: normalizeNewtabTopContentMode,
      apply: setNewtabTopContentTabState,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: SETTINGS.NEWTAB_TIME_FONT_STORAGE_KEY,
      normalize: SETTINGS.normalizeNewtabTimeFont,
      apply(font) {
        optionsState.currentNewtabTimeFont = font;
        if (newtabTimeFontSelect) {
          newtabTimeFontSelect.value = font;
        }
        renderNewtabTimeFontWeightControl(optionsState.currentNewtabTimeFontWeight);
      },
      repairOnLoad: false,
      repairOnChange: false,
      refreshSelects: true
    });
    settingBinder.bindSetting({
      key: NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
      normalize: normalizeNewtabTimeFontWeight,
      apply: renderNewtabTimeFontWeightControl
    });
    // Unset stays unset, so opening Options does not write the defaults.
    settingBinder.bindSetting({
      key: SETTINGS.NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
      normalize: SETTINGS.normalizeNewtabTimeFontSize,
      apply: renderNewtabTimeFontSizeControl,
      repairOnLoad: false,
      repairOnChange: false
    });
    settingBinder.bindSetting({
      key: SETTINGS.NEWTAB_TIME_OPACITY_STORAGE_KEY,
      normalize: SETTINGS.normalizeNewtabTimeOpacity,
      apply: renderNewtabTimeOpacityControl,
      repairOnLoad: false,
      repairOnChange: false
    });
    settingBinder.bindSetting({
      key: SETTINGS.NEWTAB_TIME_INK_STORAGE_KEY,
      normalize: SETTINGS.normalizeNewtabTimeInk,
      apply: setNewtabTimeInkTabState,
      repairOnLoad: false,
      repairOnChange: false
    });
    [
      [NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY, normalizeNewtabShortcutColumns, renderNewtabShortcutColumnsControl],
      [NEWTAB_SHORTCUT_SIZE_STORAGE_KEY, normalizeNewtabShortcutSize, renderNewtabShortcutSizeControl],
      [NEWTAB_SHORTCUT_GAP_STORAGE_KEY, normalizeNewtabShortcutGap, renderNewtabShortcutGapControl]
    ].forEach(([key, normalize, render]) => {
      settingBinder.bindSetting({
        key,
        normalize,
        apply(value) {
          render(value, Boolean(newtabShortcutsToggle && !newtabShortcutsToggle.checked));
        },
        load: false
      });
    });
    loadNewtabShortcutSettings();
    settingBinder.bindSetting({
      key: NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
      normalize: SETTINGS.normalizeNewtabOpenInNewTab,
      apply: setNewtabOpenInNewTabState,
      repairOnLoad: false,
      repairOnChange: false
    });
    TOGGLE_SETTINGS.forEach((entry) => {
      const spec = Object.assign({}, entry, { input: toggleSettingControls.get(entry) });
      if (entry.control === 'select') {
        settingBinder.bindSelect(spec);
      } else {
        settingBinder.bindToggle(spec);
      }
    });
    loadAggregateSearchAutoGroupSetting();
    settingBinder.bindSetting({
      key: RESTRICTED_ACTION_STORAGE_KEY,
      // "lumno" is the old name of the default action.
      normalize: (value) => (value === 'none' ? 'none' : 'default'),
      apply(action) {
        if (restrictedActionSelect) {
          restrictedActionSelect.value = action;
        }
        setRestrictedActionTabState(action);
      },
      refreshSelects: true
    });

    return {};
  }

  root.LumnoOptionsPageSettingBinds = { createSettingBinds };
})(globalThis);
