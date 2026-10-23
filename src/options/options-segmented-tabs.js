// The segmented controls: their state for each setting and what
// selecting a segment saves.
function createSegmentedTabs(deps) {
  const {
    getMessage,
    recentModeTabButtons,
    normalizeOverlaySizeMode,
    overlaySizeTabButtons,
    normalizeOverlayEnterAnimation,
    normalizeNewtabWidthMode,
    newtabWidthTabButtons,
    normalizeNewtabTopContentMode,
    SETTINGS,
    animateOptionsPanelHeight,
    setConditionalSettingsElementVisibility,
    newtabGlassThemeRow,
    newtabTimeFontRow,
    newtabTimeFontWeightRow,
    newtabTimeFontSizeRow,
    newtabTimeOpacityRow,
    newtabTimeInkRow,
    newtabTimeSecondsRow,
    newtabTime12HourRow,
    recentModeTabsWrap,
    restrictedActionTabButtons,
    RESTRICTED_ACTION_STORAGE_KEY,
    RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY,
    normalizeSearchResultPriority,
    searchResultPriorityTabButtons,
    newtabWidthSelect,
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    notifyNewtabSectionsRefresh,
    OVERLAY_SIZE_MODE_STORAGE_KEY,
    OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
    searchResultPrioritySelect,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    recentModeSelect,
    RECENT_MODE_STORAGE_KEY,
    restrictedActionSelect
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function renderSegmentedControlState(
    controller,
    model
  ) {
    controller.render(model);
  }

  function setRecentModeTabState(mode) {
    const nextMode = mode === 'most' ? 'most' : 'latest';
    optionsState.currentRecentMode = nextMode;
    renderSegmentedControlState(
      optionsState.recentModeTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-recent-mode',
        items: [
          {
            value: 'latest',
            labelKey: 'recent_mode_latest',
            label: getMessage('recent_mode_latest', '最近访问')
          },
          {
            value: 'most',
            labelKey: 'recent_mode_most',
            label: getMessage('recent_mode_most', '最常访问')
          }
        ],
        select: {
          id: '_x_extension_recent_mode_select_2024_unique_'
        }
      },
      recentModeTabButtons,
      'data-recent-mode',
      (value) => value === 'most' ? 'most' : 'latest'
    );
  }

  function setOverlaySizeTabState(mode) {
    const nextMode = normalizeOverlaySizeMode(mode);
    optionsState.currentOverlaySizeMode = nextMode;
    renderSegmentedControlState(
      optionsState.overlaySizeTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-overlay-size',
        items: [
          {
            value: 'compact',
            labelKey: 'overlay_size_compact',
            label: getMessage('overlay_size_compact', '小')
          },
          {
            value: 'standard',
            labelKey: 'overlay_size_standard',
            label: getMessage('overlay_size_standard', '标准')
          },
          {
            value: 'large',
            labelKey: 'overlay_size_large',
            label: getMessage('overlay_size_large', '大')
          }
        ]
      },
      overlaySizeTabButtons,
      'data-overlay-size',
      normalizeOverlaySizeMode
    );
  }

  function setOverlayEnterAnimationTabState(mode) {
    const nextMode = normalizeOverlayEnterAnimation(mode);
    optionsState.currentOverlayEnterAnimation = nextMode;
    renderSegmentedControlState(
      optionsState.overlayEnterAnimationTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-overlay-enter-animation',
        items: [
          {
            value: 'elastic',
            labelKey: 'overlay_enter_animation_elastic',
            label: getMessage('overlay_enter_animation_elastic', '弹性')
          },
          {
            value: 'fade',
            labelKey: 'overlay_enter_animation_fade',
            label: getMessage('overlay_enter_animation_fade', '淡入')
          }
        ]
      }
    );
  }

  function setNewtabWidthTabState(mode) {
    const nextMode = normalizeNewtabWidthMode(mode);
    optionsState.currentNewtabWidthMode = nextMode;
    renderSegmentedControlState(
      optionsState.newtabWidthTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-newtab-width',
        items: [
          {
            value: 'standard',
            labelKey: 'newtab_width_standard',
            label: getMessage('newtab_width_standard', '标准')
          },
          {
            value: 'wide',
            labelKey: 'newtab_width_wide',
            label: getMessage('newtab_width_wide', '宽屏（推荐）')
          }
        ],
        select: {
          id: '_x_extension_newtab_width_select_2026_unique_'
        }
      },
      newtabWidthTabButtons,
      'data-newtab-width',
      normalizeNewtabWidthMode
    );
  }

  function setNewtabTopContentTabState(mode) {
    const nextMode = normalizeNewtabTopContentMode(mode);
    optionsState.currentNewtabTopContentMode = nextMode;
    renderSegmentedControlState(
      optionsState.newtabTopContentTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-newtab-top-content',
        items: [
          {
            value: 'brand',
            labelKey: 'newtab_top_content_brand',
            label: getMessage('newtab_top_content_brand', '品牌标识')
          },
          {
            value: 'time',
            labelKey: 'newtab_top_content_time',
            label: getMessage('newtab_top_content_time', '时间')
          },
          {
            value: 'off',
            labelKey: 'newtab_top_content_off',
            label: getMessage('newtab_top_content_off', '隐藏')
          }
        ]
      }
    );
    syncNewtabTimeSecondsVisibility();
  }

  function setNewtabTimeInkTabState(ink) {
    optionsState.currentNewtabTimeInk = SETTINGS.normalizeNewtabTimeInk(ink);
    renderSegmentedControlState(
      optionsState.newtabTimeInkTabsController,
      {
        activeValue: optionsState.currentNewtabTimeInk,
        dataAttribute: 'data-newtab-time-ink',
        items: [
          { value: 'auto', labelKey: 'newtab_time_ink_auto', label: getMessage('newtab_time_ink_auto', '自动') },
          { value: 'light', labelKey: 'newtab_time_ink_light', label: getMessage('newtab_time_ink_light', '浅色') },
          { value: 'dark', labelKey: 'newtab_time_ink_dark', label: getMessage('newtab_time_ink_dark', '深色') }
        ]
      }
    );
  }

  function setNewtabGlassThemeTabState(theme) {
    optionsState.currentNewtabGlassTheme = SETTINGS.normalizeNewtabGlassTheme(theme);
    renderSegmentedControlState(
      optionsState.newtabGlassThemeTabsController,
      {
        activeValue: optionsState.currentNewtabGlassTheme,
        dataAttribute: 'data-newtab-glass-theme',
        items: [
          { value: 'follow', labelKey: 'settings_newtab_glass_theme_follow', label: getMessage('settings_newtab_glass_theme_follow', '自动') },
          { value: 'light', labelKey: 'settings_newtab_glass_theme_light', label: getMessage('settings_newtab_glass_theme_light', '浅色') },
          { value: 'dark', labelKey: 'settings_newtab_glass_theme_dark', label: getMessage('settings_newtab_glass_theme_dark', '深色') }
        ]
      }
    );
  }

  // The material's light/dark choice only matters while a glass material is on.
  function syncNewtabGlassThemeVisibility() {
    animateOptionsPanelHeight(() => setConditionalSettingsElementVisibility(
      newtabGlassThemeRow,
      optionsState.currentNewtabGlassStyle !== 'none'
    ));
  }

  function syncNewtabTimeSecondsVisibility() {
    const visible = optionsState.currentNewtabTopContentMode === 'time';
    animateOptionsPanelHeight(() => {
      let changed = false;
      [
        newtabTimeFontRow,
        newtabTimeFontWeightRow,
        newtabTimeFontSizeRow,
        newtabTimeOpacityRow,
        newtabTimeInkRow,
        newtabTimeSecondsRow,
        newtabTime12HourRow
      ].forEach((row) => {
        changed = setConditionalSettingsElementVisibility(row, visible) || changed;
      });
      return changed;
    });
  }

  function updateRecentModeTabsVisibility(countValue) {
    if (!recentModeTabsWrap) {
      return;
    }
    const parsed = Number.parseInt(countValue, 10);
    const shouldHide = Number.isFinite(parsed) ? parsed <= 0 : false;
    animateOptionsPanelHeight(() =>
      setConditionalSettingsElementVisibility(recentModeTabsWrap, !shouldHide, 'flex')
    );
    if (!shouldHide) {
      requestAnimationFrame(() => {
      });
    }
  }

  function setRestrictedActionTabState(action) {
    const nextAction = action === 'none' ? 'none' : 'default';
    optionsState.currentRestrictedAction = nextAction;
    renderSegmentedControlState(
      optionsState.restrictedActionTabsController,
      {
        activeValue: nextAction,
        dataAttribute: 'data-restricted-action',
        items: [
          {
            value: 'default',
            labelKey: 'restricted_action_default',
            label: getMessage('restricted_action_default', '前往 Lumno 新标签页')
          },
          {
            value: 'none',
            labelKey: 'restricted_action_none',
            label: getMessage('restricted_action_none', '遵循浏览器设置')
          }
        ],
        select: {
          id: '_x_extension_restricted_action_select_2024_unique_'
        }
      },
      restrictedActionTabButtons,
      'data-restricted-action',
      (value) => value === 'none' ? 'none' : 'default'
    );
  }

  function createRestrictedActionStorageUpdate(action) {
    return {
      [RESTRICTED_ACTION_STORAGE_KEY]: action === 'none' ? 'none' : 'default',
      [RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY]: true
    };
  }

  function setSearchResultPriorityTabState(priority) {
    const nextPriority = normalizeSearchResultPriority(priority);
    optionsState.currentSearchResultPriority = nextPriority;
    renderSegmentedControlState(
      optionsState.searchResultPriorityTabsController,
      {
        activeValue: nextPriority,
        dataAttribute: 'data-search-result-priority',
        items: [
          {
            value: 'autocomplete',
            labelKey: 'search_result_priority_autocomplete',
            label: getMessage('search_result_priority_autocomplete', '补全优先')
          },
          {
            value: 'search',
            labelKey: 'search_result_priority_search',
            label: getMessage('search_result_priority_search', '搜索优先')
          }
        ],
        select: {
          id: '_x_extension_search_result_priority_select_2026_unique_'
        }
      },
      searchResultPriorityTabButtons,
      'data-search-result-priority',
      normalizeSearchResultPriority
    );
  }

  function handleNewtabWidthSelection(value) {
    const nextMode = normalizeNewtabWidthMode(value);
    setNewtabWidthTabState(nextMode);
    if (newtabWidthSelect) {
      newtabWidthSelect.value = nextMode;
    }
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set({ [NEWTAB_WIDTH_MODE_STORAGE_KEY]: nextMode });
    notifyNewtabSectionsRefresh('all');
  }

  function handleOverlaySizeSelection(value) {
    const nextMode = normalizeOverlaySizeMode(value);
    setOverlaySizeTabState(nextMode);
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set({ [OVERLAY_SIZE_MODE_STORAGE_KEY]: nextMode });
  }

  function handleOverlayEnterAnimationSelection(value) {
    const nextMode = normalizeOverlayEnterAnimation(value);
    setOverlayEnterAnimationTabState(nextMode);
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set({ [OVERLAY_ENTER_ANIMATION_STORAGE_KEY]: nextMode });
  }

  function handleSearchResultPrioritySelection(value) {
    const nextPriority = normalizeSearchResultPriority(value);
    setSearchResultPriorityTabState(nextPriority);
    if (searchResultPrioritySelect) {
      searchResultPrioritySelect.value = nextPriority;
    }
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set({ [SEARCH_RESULT_PRIORITY_STORAGE_KEY]: nextPriority });
  }

  function handleNewtabTopContentSelection(value) {
    const nextMode = normalizeNewtabTopContentMode(value);
    setNewtabTopContentTabState(nextMode);
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set({ [NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: nextMode });
  }

  function handleNewtabGlassThemeSelection(value) {
    const nextTheme = SETTINGS.normalizeNewtabGlassTheme(value);
    setNewtabGlassThemeTabState(nextTheme);
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set({ [SETTINGS.NEWTAB_GLASS_THEME_STORAGE_KEY]: nextTheme });
  }

  function handleNewtabTimeInkSelection(value) {
    const nextInk = SETTINGS.normalizeNewtabTimeInk(value);
    setNewtabTimeInkTabState(nextInk);
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set({ [SETTINGS.NEWTAB_TIME_INK_STORAGE_KEY]: nextInk });
  }

  function handleRecentModeSelection(value) {
    const nextMode = value === 'most' ? 'most' : 'latest';
    setRecentModeTabState(nextMode);
    if (recentModeSelect) {
      recentModeSelect.value = nextMode;
    }
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set({ [RECENT_MODE_STORAGE_KEY]: nextMode });
    notifyNewtabSectionsRefresh('recent');
  }

  function handleRestrictedActionSelection(value) {
    const nextAction = value === 'none' ? 'none' : 'default';
    setRestrictedActionTabState(nextAction);
    if (restrictedActionSelect) {
      restrictedActionSelect.value = nextAction;
    }
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set(createRestrictedActionStorageUpdate(nextAction));
  }

  return {
    setRecentModeTabState,
    setOverlaySizeTabState,
    setOverlayEnterAnimationTabState,
    setNewtabWidthTabState,
    setNewtabTopContentTabState,
    setNewtabTimeInkTabState,
    setNewtabGlassThemeTabState,
    syncNewtabGlassThemeVisibility,
    updateRecentModeTabsVisibility,
    setRestrictedActionTabState,
    setSearchResultPriorityTabState,
    handleNewtabWidthSelection,
    handleOverlaySizeSelection,
    handleOverlayEnterAnimationSelection,
    handleSearchResultPrioritySelection,
    handleNewtabTopContentSelection,
    handleNewtabGlassThemeSelection,
    handleNewtabTimeInkSelection,
    handleRecentModeSelection,
    handleRestrictedActionSelection
  };
}

export { createSegmentedTabs };
