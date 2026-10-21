(function(root) {
  // The page's sliders: clock weight, size and opacity, shortcut columns,
  // size and gap, bookmark rows and columns, recent count and the result
  // display limit, each with its React control.
  function createSliderControls(deps) {
    const {
      optionsSettingsControlsApi,
      newtabTimeFontWeightControlHost,
      normalizeNewtabTimeFontWeight,
      storageArea,
      NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
      SETTINGS,
      getMessage,
      newtabTimeFontSizeControlHost,
      newtabTimeOpacityControlHost,
      newtabShortcutColumnsControlHost,
      normalizeNewtabShortcutColumns,
      NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
      NEWTAB_SHORTCUT_COLUMNS_MIN,
      NEWTAB_SHORTCUT_COLUMNS_MAX,
      newtabShortcutSizeControlHost,
      normalizeNewtabShortcutSize,
      NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
      NEWTAB_SHORTCUT_SIZE_DEFAULT,
      NEWTAB_SHORTCUT_SIZE_MIN,
      NEWTAB_SHORTCUT_SIZE_MAX,
      newtabShortcutGapControlHost,
      normalizeNewtabShortcutGap,
      NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
      NEWTAB_SHORTCUT_GAP_DEFAULT,
      NEWTAB_SHORTCUT_GAP_MIN,
      NEWTAB_SHORTCUT_GAP_MAX,
      newtabShortcutsToggle,
      newtabShortcutAddToggle,
      newtabShortcutDockMagnificationToggle,
      setOptionsToggleState,
      newtabShortcutAddRow,
      newtabShortcutDockMagnificationRow,
      newtabShortcutColumnsRow,
      newtabShortcutSizeRow,
      newtabShortcutGapRow,
      bookmarkRowsControlHost,
      normalizeBookmarkCount,
      updateBookmarkColumnsSettingVisibility,
      BOOKMARK_COUNT_STORAGE_KEY,
      notifyNewtabSectionsRefresh,
      recentCountControlHost,
      normalizeRecentCount,
      updateRecentModeTabsVisibility,
      RECENT_COUNT_STORAGE_KEY,
      bookmarkColumnsControlHost,
      normalizeBookmarkColumns,
      BOOKMARK_COLUMNS_STORAGE_KEY,
      searchResultDisplayLimitControlHost,
      normalizeSearchResultDisplayLimit,
      SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY
    } = deps;

    // The page state object shared with options.js and the other modules.
    const optionsState = deps.optionsState;

    const newtabTimeFontWeightController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        newtabTimeFontWeightControlHost,
        {
          kind: 'newtab-time-font-weight',
          onInput(value) {
            const nextWeight = normalizeNewtabTimeFontWeight(value);
            optionsState.currentNewtabTimeFontWeight = nextWeight;
            if (storageArea) {
              storageArea.set({ [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: nextWeight });
            }
          }
        }
      );
    function renderNewtabTimeFontWeightControl(value) {
      if (!newtabTimeFontWeightController) {
        return;
      }
      optionsState.currentNewtabTimeFontWeight = normalizeNewtabTimeFontWeight(value);
      // The slider spans the range the chosen face draws well.
      const timeFont = SETTINGS.getNewtabTimeFont(optionsState.currentNewtabTimeFont);
      newtabTimeFontWeightController.render({
        ariaLabel: getMessage('newtab_time_font_weight_title', 'Time font weight'),
        defaultValue: timeFont.defaultWeight,
        id: '_x_extension_newtab_time_font_weight_slider_2026_unique_',
        min: timeFont.minWeight,
        max: timeFont.maxWeight,
        resetAriaLabel: getMessage(
          'newtab_time_font_weight_reset',
          'Reset time font weight'
        ),
        resetButtonId: '_x_extension_newtab_time_font_weight_reset_2026_unique_',
        step: 1,
        ticks: [
          { align: 'start', label: String(timeFont.minWeight) },
          { label: String(Math.round((timeFont.minWeight + timeFont.maxWeight) / 2)) },
          { align: 'end', label: String(timeFont.maxWeight) }
        ],
        value: SETTINGS.resolveNewtabTimeFontWeight(timeFont.id, optionsState.currentNewtabTimeFontWeight)
      });
    }
    const newtabTimeFontSizeController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        newtabTimeFontSizeControlHost,
        {
          kind: 'newtab-time-font-size',
          onInput(value) {
            optionsState.currentNewtabTimeFontSize = SETTINGS.normalizeNewtabTimeFontSize(value);
            if (storageArea) {
              storageArea.set({ [SETTINGS.NEWTAB_TIME_FONT_SIZE_STORAGE_KEY]: optionsState.currentNewtabTimeFontSize });
            }
          }
        }
      );
    function renderNewtabTimeFontSizeControl(value) {
      if (!newtabTimeFontSizeController) {
        return;
      }
      optionsState.currentNewtabTimeFontSize = SETTINGS.normalizeNewtabTimeFontSize(value);
      const min = SETTINGS.NEWTAB_TIME_FONT_SIZE_MIN;
      const max = SETTINGS.NEWTAB_TIME_FONT_SIZE_MAX;
      const defaultValue = SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT;
      newtabTimeFontSizeController.render({
        ariaLabel: getMessage('newtab_time_font_size_title', 'Time size'),
        defaultValue,
        id: '_x_extension_newtab_time_font_size_slider_2026_unique_',
        min,
        max,
        resetAriaLabel: getMessage('newtab_time_font_size_reset', 'Reset time size'),
        resetButtonId: '_x_extension_newtab_time_font_size_reset_2026_unique_',
        step: 1,
        ticks: [
          { align: 'start', label: String(min) },
          { label: String(defaultValue), percent: ((defaultValue - min) / (max - min)) * 100 },
          { align: 'end', label: String(max) }
        ],
        value: optionsState.currentNewtabTimeFontSize,
        valueSuffix: ' px'
      });
    }
    const newtabTimeOpacityController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        newtabTimeOpacityControlHost,
        {
          kind: 'newtab-time-opacity',
          onInput(value) {
            optionsState.currentNewtabTimeOpacity = SETTINGS.normalizeNewtabTimeOpacity(value);
            if (storageArea) {
              storageArea.set({ [SETTINGS.NEWTAB_TIME_OPACITY_STORAGE_KEY]: optionsState.currentNewtabTimeOpacity });
            }
          }
        }
      );
    function renderNewtabTimeOpacityControl(value) {
      if (!newtabTimeOpacityController) {
        return;
      }
      optionsState.currentNewtabTimeOpacity = SETTINGS.normalizeNewtabTimeOpacity(value);
      const min = SETTINGS.NEWTAB_TIME_OPACITY_MIN;
      const max = SETTINGS.NEWTAB_TIME_OPACITY_MAX;
      newtabTimeOpacityController.render({
        ariaLabel: getMessage('newtab_time_opacity_title', 'Time opacity'),
        defaultValue: SETTINGS.NEWTAB_TIME_OPACITY_DEFAULT,
        id: '_x_extension_newtab_time_opacity_slider_2026_unique_',
        min,
        max,
        resetAriaLabel: getMessage('newtab_time_opacity_reset', 'Reset time opacity'),
        resetButtonId: '_x_extension_newtab_time_opacity_reset_2026_unique_',
        step: 1,
        ticks: [
          { align: 'start', label: `${min}%` },
          { label: `${Math.round((min + max) / 2)}%` },
          { align: 'end', label: `${max}%` }
        ],
        value: optionsState.currentNewtabTimeOpacity,
        valueSuffix: '%'
      });
    }
    const newtabShortcutColumnsController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        newtabShortcutColumnsControlHost,
        {
          kind: 'newtab-shortcut-columns',
          onInput(value) {
            const nextColumns = normalizeNewtabShortcutColumns(value);
            optionsState.currentNewtabShortcutColumns = nextColumns;
            if (storageArea) {
              storageArea.set({ [NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY]: nextColumns });
            }
          }
        }
      );
    function renderNewtabShortcutColumnsControl(value, disabled) {
      if (!newtabShortcutColumnsController) {
        return;
      }
      optionsState.currentNewtabShortcutColumns = normalizeNewtabShortcutColumns(value);
      newtabShortcutColumnsController.render({
        ariaLabel: getMessage(
          'settings_newtab_shortcut_columns_title',
          'Shortcuts per row'
        ),
        disabled: Boolean(disabled),
        id: '_x_extension_newtab_shortcut_columns_slider_2026_unique_',
        min: NEWTAB_SHORTCUT_COLUMNS_MIN,
        max: NEWTAB_SHORTCUT_COLUMNS_MAX,
        step: 1,
        ticks: [
          { align: 'start', label: '4', percent: 0 },
          { label: '8', percent: 100 / 3 },
          { label: '12', percent: 200 / 3 },
          { align: 'end', label: '16', percent: 100 }
        ],
        value: optionsState.currentNewtabShortcutColumns
      });
    }
    const newtabShortcutSizeController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        newtabShortcutSizeControlHost,
        {
          kind: 'newtab-shortcut-size',
          onInput(value) {
            const nextSize = normalizeNewtabShortcutSize(value);
            optionsState.currentNewtabShortcutSize = nextSize;
            if (storageArea) {
              storageArea.set({ [NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]: nextSize });
            }
          }
        }
      );
    function renderNewtabShortcutSizeControl(value, disabled) {
      if (!newtabShortcutSizeController) {
        return;
      }
      optionsState.currentNewtabShortcutSize = normalizeNewtabShortcutSize(value);
      const label = getMessage('settings_newtab_shortcut_size_title', 'Shortcut size');
      newtabShortcutSizeController.render({
        ariaLabel: label,
        defaultValue: NEWTAB_SHORTCUT_SIZE_DEFAULT,
        disabled: Boolean(disabled),
        id: '_x_extension_newtab_shortcut_size_slider_2026_unique_',
        min: NEWTAB_SHORTCUT_SIZE_MIN,
        max: NEWTAB_SHORTCUT_SIZE_MAX,
        resetAriaLabel: getMessage(
          'settings_newtab_shortcut_size_reset',
          'Reset shortcut size'
        ),
        resetButtonId: '_x_extension_newtab_shortcut_size_reset_2026_unique_',
        step: 1,
        ticks: [
          { align: 'start', label: String(NEWTAB_SHORTCUT_SIZE_MIN), percent: 0 },
          {
            label: String(NEWTAB_SHORTCUT_SIZE_DEFAULT),
            percent: ((NEWTAB_SHORTCUT_SIZE_DEFAULT - NEWTAB_SHORTCUT_SIZE_MIN) /
              (NEWTAB_SHORTCUT_SIZE_MAX - NEWTAB_SHORTCUT_SIZE_MIN)) * 100
          },
          { align: 'end', label: String(NEWTAB_SHORTCUT_SIZE_MAX), percent: 100 }
        ],
        value: optionsState.currentNewtabShortcutSize,
        valueSuffix: ' px'
      });
    }
    const newtabShortcutGapController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        newtabShortcutGapControlHost,
        {
          kind: 'newtab-shortcut-gap',
          onInput(value) {
            const nextGap = normalizeNewtabShortcutGap(value);
            optionsState.currentNewtabShortcutGap = nextGap;
            if (storageArea) {
              storageArea.set({ [NEWTAB_SHORTCUT_GAP_STORAGE_KEY]: nextGap });
            }
          }
        }
      );
    function renderNewtabShortcutGapControl(value, disabled) {
      if (!newtabShortcutGapController) {
        return;
      }
      optionsState.currentNewtabShortcutGap = normalizeNewtabShortcutGap(value);
      const label = getMessage('settings_newtab_shortcut_gap_title', 'Shortcut spacing');
      newtabShortcutGapController.render({
        ariaLabel: label,
        defaultValue: NEWTAB_SHORTCUT_GAP_DEFAULT,
        disabled: Boolean(disabled),
        id: '_x_extension_newtab_shortcut_gap_slider_2026_unique_',
        min: NEWTAB_SHORTCUT_GAP_MIN,
        max: NEWTAB_SHORTCUT_GAP_MAX,
        resetAriaLabel: getMessage(
          'settings_newtab_shortcut_gap_reset',
          'Reset shortcut spacing'
        ),
        resetButtonId: '_x_extension_newtab_shortcut_gap_reset_2026_unique_',
        step: 1,
        ticks: [
          { align: 'start', label: '0', percent: 0 },
          { label: '8', percent: 100 / 3 },
          { label: '16', percent: 200 / 3 },
          { align: 'end', label: '24', percent: 100 }
        ],
        value: optionsState.currentNewtabShortcutGap,
        valueSuffix: ' px'
      });
    }
    function syncNewtabShortcutSubcontrolAvailability() {
      const disabled = Boolean(newtabShortcutsToggle && !newtabShortcutsToggle.checked);
      [newtabShortcutAddToggle, newtabShortcutDockMagnificationToggle].forEach((toggle) => {
        if (toggle) {
          setOptionsToggleState(toggle, toggle.checked, disabled);
        }
      });
      [
        newtabShortcutAddRow,
        newtabShortcutDockMagnificationRow,
        newtabShortcutColumnsRow,
        newtabShortcutSizeRow,
        newtabShortcutGapRow
      ]
        .forEach((row) => {
          if (!row) {
            return;
          }
          row.setAttribute('data-disabled', disabled ? 'true' : 'false');
          row.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        });
      renderNewtabShortcutColumnsControl(optionsState.currentNewtabShortcutColumns, disabled);
      renderNewtabShortcutSizeControl(optionsState.currentNewtabShortcutSize, disabled);
      renderNewtabShortcutGapControl(optionsState.currentNewtabShortcutGap, disabled);
    }
    const bookmarkRowsController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        bookmarkRowsControlHost,
        {
          kind: 'bookmark-rows',
          onInput(value) {
            const nextCount = normalizeBookmarkCount(Number(value) * 4);
            optionsState.currentBookmarkCount = nextCount;
            updateBookmarkColumnsSettingVisibility(nextCount);
            if (!storageArea) {
              return;
            }
            storageArea.set({ [BOOKMARK_COUNT_STORAGE_KEY]: nextCount });
            notifyNewtabSectionsRefresh('bookmarks');
          }
        }
      );
    function renderBookmarkRowsControl(value) {
      if (!bookmarkRowsController) {
        return;
      }
      optionsState.currentBookmarkCount = normalizeBookmarkCount(value);
      bookmarkRowsController.render({
        ariaLabel: getMessage('settings_bookmarks_title', 'Bookmark rows'),
        id: '_x_extension_bookmark_rows_slider_2026_unique_',
        min: 0,
        max: 8,
        step: 1,
        ticks: [
          { align: 'start', label: '0' },
          { label: '4' },
          { align: 'end', label: '8' }
        ],
        value: optionsState.currentBookmarkCount / 4
      });
    }
    const recentCountController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        recentCountControlHost,
        {
          kind: 'recent-count',
          onInput(value) {
            const nextCount = normalizeRecentCount(Math.round(Number(value)) * 4);
            optionsState.currentRecentCount = nextCount;
            updateRecentModeTabsVisibility(nextCount);
            if (!storageArea) {
              return;
            }
            storageArea.set({ [RECENT_COUNT_STORAGE_KEY]: nextCount });
            notifyNewtabSectionsRefresh('recent');
          }
        }
      );
    function renderRecentCountControl(value) {
      if (!recentCountController) {
        return;
      }
      optionsState.currentRecentCount = normalizeRecentCount(value);
      recentCountController.render({
        ariaLabel: getMessage('settings_recent_sites_title', 'Recent site cards'),
        id: '_x_extension_recent_count_slider_2026_unique_',
        min: 0,
        max: 2,
        step: 1,
        ticks: [
          { align: 'start', label: '0' },
          { label: '1' },
          { align: 'end', label: '2' }
        ],
        value: optionsState.currentRecentCount / 4
      });
    }
    const bookmarkColumnsController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        bookmarkColumnsControlHost,
        {
          kind: 'bookmark-columns',
          onInput(value) {
            const nextColumns = normalizeBookmarkColumns(value);
            if (!storageArea) {
              return;
            }
            storageArea.set({ [BOOKMARK_COLUMNS_STORAGE_KEY]: nextColumns });
            notifyNewtabSectionsRefresh('bookmarks');
          }
        }
      );
    function renderBookmarkColumnsControl(value) {
      if (!bookmarkColumnsController) {
        return;
      }
      optionsState.currentBookmarkColumns = normalizeBookmarkColumns(value);
      bookmarkColumnsController.render({
        ariaLabel: getMessage('settings_bookmark_columns_title', 'Bookmarks per row'),
        id: '_x_extension_bookmark_columns_slider_2026_unique_',
        min: 4,
        max: 8,
        step: 1,
        ticks: [
          { align: 'start', label: '4' },
          { label: '6' },
          { align: 'end', label: '8' }
        ],
        value: optionsState.currentBookmarkColumns
      });
    }
    const searchResultDisplayLimitController =
      optionsSettingsControlsApi.createRangeSliderControlController(
        searchResultDisplayLimitControlHost,
        {
          kind: 'search-result-display-limit',
          onInput(value) {
            const nextLimit = normalizeSearchResultDisplayLimit(value);
            optionsState.currentSearchResultDisplayLimit = nextLimit;
            if (storageArea) {
              storageArea.set({ [SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY]: nextLimit });
            }
          }
        }
      );
    function renderSearchResultDisplayLimitControl(value) {
      if (!searchResultDisplayLimitController) {
        return;
      }
      optionsState.currentSearchResultDisplayLimit = normalizeSearchResultDisplayLimit(value);
      searchResultDisplayLimitController.render({
        ariaLabel: getMessage('settings_search_result_display_limit_title', 'Maximum Visible Results'),
        id: '_x_extension_search_result_display_limit_slider_2026_unique_',
        min: 5,
        max: 10,
        step: 1,
        ticks: [
          { align: 'start', label: '5' },
          { align: 'end', label: '10' }
        ],
        value: optionsState.currentSearchResultDisplayLimit
      });
    }

    return {
      renderNewtabTimeFontWeightControl,
      renderNewtabTimeFontSizeControl,
      renderNewtabTimeOpacityControl,
      renderNewtabShortcutColumnsControl,
      renderNewtabShortcutSizeControl,
      renderNewtabShortcutGapControl,
      syncNewtabShortcutSubcontrolAvailability,
      renderBookmarkRowsControl,
      renderRecentCountControl,
      renderBookmarkColumnsControl,
      renderSearchResultDisplayLimitControl
    };
  }

  root.LumnoOptionsPageSliderControls = { createSliderControls };
})(globalThis);
