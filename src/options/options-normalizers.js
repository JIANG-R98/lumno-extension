(function(root) {
  // Normalizing stored values for the controls: counts, columns, width and
  // size modes, clock and shortcut settings, result priority, limit and
  // source types.
  function createNormalizers(deps) {
    const {
      SETTINGS,
      bookmarkColumnsSettingRow,
      animateOptionsPanelHeight,
      setConditionalSettingsElementVisibility,
      bookmarkFolderIconsVisibleRow,
      NEWTAB_SHORTCUT_COLUMNS_MIN,
      NEWTAB_SHORTCUT_COLUMNS_MAX,
      NEWTAB_SHORTCUT_COLUMNS_DEFAULT,
      NEWTAB_SHORTCUT_SIZE_MIN,
      NEWTAB_SHORTCUT_SIZE_MAX,
      NEWTAB_SHORTCUT_SIZE_DEFAULT,
      NEWTAB_SHORTCUT_GAP_MIN,
      NEWTAB_SHORTCUT_GAP_MAX,
      NEWTAB_SHORTCUT_GAP_DEFAULT,
      NEWTAB_SHORTCUT_WIDTH_MIN,
      NEWTAB_SHORTCUT_WIDTH_MAX,
      searchResultSourceTypeInputs,
      renderSearchResultSourceTypeControl,
      SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY
    } = deps;

    // The page state object shared with options.js and the other modules.
    const optionsState = deps.optionsState;

    function normalizeBookmarkCount(value) {
      return SETTINGS.normalizeBookmarkCount(value);
    }

    function normalizeRecentCount(value) {
      const parsed = Number.parseInt(value, 10);
      if (parsed === 0 || parsed === 4 || parsed === 8) {
        return parsed;
      }
      return 4;
    }

    function normalizeBookmarkColumns(value) {
      return SETTINGS.normalizeBookmarkColumns(value);
    }

    function normalizeNewtabWidthMode(value) {
      return SETTINGS.normalizeNewtabWidthMode(value);
    }

    function normalizeOverlaySizeMode(value) {
      return SETTINGS.normalizeOverlaySizeMode(value);
    }

    function normalizeOverlayEnterAnimation(value) {
      return SETTINGS.normalizeOverlayEnterAnimation(value);
    }

    function updateBookmarkColumnsSettingVisibility(countValue) {
      if (!bookmarkColumnsSettingRow) {
        return;
      }
      const parsed = Number.parseInt(countValue, 10);
      const shouldHide = Number.isFinite(parsed) ? parsed <= 0 : false;
      animateOptionsPanelHeight(() => {
        const columnsChanged = setConditionalSettingsElementVisibility(bookmarkColumnsSettingRow, !shouldHide);
        const folderIconsChanged = setConditionalSettingsElementVisibility(bookmarkFolderIconsVisibleRow, !shouldHide);
        return columnsChanged || folderIconsChanged;
      });
    }

    function normalizeNewtabTopContentMode(value) {
      return SETTINGS.normalizeNewtabTopContentMode(value);
    }

    function normalizeNewtabTimeFontWeight(value) {
      return SETTINGS.normalizeNewtabTimeFontWeight(value);
    }

    function normalizeNewtabShortcutsVisible(value) {
      return SETTINGS.normalizeNewtabShortcutsVisible(value);
    }

    function normalizeNewtabShortcutAddVisible(value) {
      return SETTINGS.normalizeNewtabShortcutAddVisible(value);
    }

    function normalizeNewtabShortcutDockMagnificationEnabled(value) {
      return SETTINGS.normalizeNewtabShortcutDockMagnificationEnabled(value);
    }

    function normalizeNewtabShortcutColumns(value) {
      return SETTINGS.normalizeNewtabShortcutColumns(value, {
        min: NEWTAB_SHORTCUT_COLUMNS_MIN,
        max: NEWTAB_SHORTCUT_COLUMNS_MAX,
        fallback: NEWTAB_SHORTCUT_COLUMNS_DEFAULT
      });
    }

    function normalizeNewtabShortcutSize(value) {
      return SETTINGS.normalizeNewtabShortcutSize(value, {
        min: NEWTAB_SHORTCUT_SIZE_MIN,
        max: NEWTAB_SHORTCUT_SIZE_MAX,
        fallback: NEWTAB_SHORTCUT_SIZE_DEFAULT
      });
    }

    function normalizeNewtabShortcutGap(value) {
      return SETTINGS.normalizeNewtabShortcutGap(value, {
        min: NEWTAB_SHORTCUT_GAP_MIN,
        max: NEWTAB_SHORTCUT_GAP_MAX,
        fallback: NEWTAB_SHORTCUT_GAP_DEFAULT
      });
    }

    function inferNewtabShortcutColumnsFromWidth(value) {
      return SETTINGS.inferNewtabShortcutColumnsFromWidth(value, {
        widthMin: NEWTAB_SHORTCUT_WIDTH_MIN,
        widthMax: NEWTAB_SHORTCUT_WIDTH_MAX,
        columnsMin: NEWTAB_SHORTCUT_COLUMNS_MIN,
        columnsMax: NEWTAB_SHORTCUT_COLUMNS_MAX
      });
    }

    function normalizeAggregateSearchAutoGroupEnabled(value) {
      return SETTINGS.normalizeAggregateSearchAutoGroupEnabled(value);
    }

    function normalizeSearchResultPriority(value) {
      return SETTINGS.normalizeSearchResultPriority(value);
    }

    function normalizeSearchResultDisplayLimit(value) {
      return SETTINGS.normalizeSearchResultDisplayLimit(value);
    }

    function normalizeSearchResultSourceTypes(value) {
      return SETTINGS.normalizeSearchResultSourceTypes(value);
    }

    function collectCheckedSearchResultSourceTypes() {
      const checked = [];
      searchResultSourceTypeInputs.forEach((input) => {
        if (!input || !input.checked) {
          return;
        }
        checked.push(input.getAttribute('data-search-result-source-type'));
      });
      return checked.filter(Boolean);
    }

    function setSearchResultSourceTypeState(value) {
      const normalized = normalizeSearchResultSourceTypes(value);
      const selected = new Set(normalized);
      searchResultSourceTypeInputs.forEach((input) => {
        const type = input.getAttribute('data-search-result-source-type');
        input.checked = selected.has(type);
      });
      renderSearchResultSourceTypeControl(normalized);
    }

    function persistSearchResultSourceTypes(value) {
      const normalized = normalizeSearchResultSourceTypes(value);
      setSearchResultSourceTypeState(normalized);
      if (!optionsState.storageArea) {
        return;
      }
      optionsState.storageArea.set({ [SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY]: normalized });
    }

    return {
      normalizeBookmarkCount,
      normalizeRecentCount,
      normalizeBookmarkColumns,
      normalizeNewtabWidthMode,
      normalizeOverlaySizeMode,
      normalizeOverlayEnterAnimation,
      updateBookmarkColumnsSettingVisibility,
      normalizeNewtabTopContentMode,
      normalizeNewtabTimeFontWeight,
      normalizeNewtabShortcutsVisible,
      normalizeNewtabShortcutAddVisible,
      normalizeNewtabShortcutDockMagnificationEnabled,
      normalizeNewtabShortcutColumns,
      normalizeNewtabShortcutSize,
      normalizeNewtabShortcutGap,
      inferNewtabShortcutColumnsFromWidth,
      normalizeAggregateSearchAutoGroupEnabled,
      normalizeSearchResultPriority,
      normalizeSearchResultDisplayLimit,
      normalizeSearchResultSourceTypes,
      collectCheckedSearchResultSourceTypes,
      setSearchResultSourceTypeState,
      persistSearchResultSourceTypes
    };
  }

  root.LumnoOptionsPageNormalizers = { createNormalizers };
})(globalThis);
