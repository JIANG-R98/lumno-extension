// @ts-nocheck
// Change handlers for the page's selects, segmented controls and toggles,
// and the buttons that open the browser's shortcut page or onboarding.
function createControlEvents(deps) {
  const {
    languageSelect,
    applyLanguageMode,
    newtabWidthSelect,
    handleNewtabWidthSelection,
    newtabWidthTabButtons,
    overlaySizeTabButtons,
    handleOverlaySizeSelection,
    overlayEnterAnimationTabButtons,
    handleOverlayEnterAnimationSelection,
    searchResultPrioritySelect,
    handleSearchResultPrioritySelection,
    newtabTimeFontSelect,
    SETTINGS,
    renderNewtabTimeFontWeightControl,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    refreshCustomSelects,
    overlayFontSelect,
    OVERLAY_FONT_FAMILY_STORAGE_KEY,
    overlayFontFallbackSelect,
    OVERLAY_FONT_FALLBACK_STORAGE_KEY,
    localStorageArea,
    OVERLAY_FONT_LABELS_STORAGE_KEY,
    newtabGlassStyleSelect,
    syncNewtabGlassThemeVisibility,
    searchResultTabPositionSelect,
    SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
    searchResultPriorityTabButtons,
    searchResultSourceTypeInputs,
    persistSearchResultSourceTypes,
    collectCheckedSearchResultSourceTypes,
    recentModeSelect,
    handleRecentModeSelection,
    recentModeTabButtons,
    newtabOpenInNewTabToggles,
    setOptionsToggleState,
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
    restrictedActionSelect,
    handleRestrictedActionSelection,
    restrictedActionTabButtons,
    showToast,
    getMessage,
    openShortcutsPageButton,
    openOnboardingPageButton
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  if (languageSelect) {
    languageSelect.addEventListener('change', () => {
      const next = languageSelect.value || 'system';
      applyLanguageMode(next, { persist: true });
    });
  }

  if (newtabWidthSelect) {
    newtabWidthSelect.addEventListener('change', () => {
      handleNewtabWidthSelection(newtabWidthSelect.value);
    });
  }
  if (newtabWidthTabButtons.length > 0) {
    newtabWidthTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleNewtabWidthSelection(button.getAttribute('data-newtab-width'));
      });
    });
  }
  if (overlaySizeTabButtons.length > 0) {
    overlaySizeTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleOverlaySizeSelection(button.getAttribute('data-overlay-size'));
      });
    });
  }
  if (overlayEnterAnimationTabButtons.length > 0) {
    overlayEnterAnimationTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleOverlayEnterAnimationSelection(button.getAttribute('data-overlay-enter-animation'));
      });
    });
  }
  if (searchResultPrioritySelect) {
    searchResultPrioritySelect.addEventListener('change', () => {
      handleSearchResultPrioritySelection(searchResultPrioritySelect.value);
    });
  }
  if (newtabTimeFontSelect) {
    // Each face opens at its own default weight, as in New Tab's panel.
    newtabTimeFontSelect.addEventListener('change', () => {
      const font = SETTINGS.normalizeNewtabTimeFont(newtabTimeFontSelect.value);
      const weight = SETTINGS.getNewtabTimeFont(font).defaultWeight;
      newtabTimeFontSelect.value = font;
      optionsState.currentNewtabTimeFont = font;
      renderNewtabTimeFontWeightControl(weight);
      if (optionsState.storageArea) {
        optionsState.storageArea.set({
          [SETTINGS.NEWTAB_TIME_FONT_STORAGE_KEY]: font,
          [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: weight
        });
      }
      refreshCustomSelects();
    });
  }
  // Both font rows persist a family, with its display name beside it, and
  // rebuild their menu list afterwards.
  [
    [overlayFontSelect, OVERLAY_FONT_FAMILY_STORAGE_KEY, (family) => { optionsState.currentOverlayFontFamily = family; }],
    [overlayFontFallbackSelect, OVERLAY_FONT_FALLBACK_STORAGE_KEY,
      (family) => { optionsState.currentOverlayFontFallback = family; }]
  ].forEach(([select, key, remember]) => {
    if (!select) {
      return;
    }
    select.addEventListener('change', () => {
      const family = SETTINGS.normalizeOverlayFontFamily(select.value);
      const chosenOption = select.selectedOptions && select.selectedOptions[0];
      select.value = family;
      remember(family);
      optionsState.currentOverlayFontLabels = SETTINGS.normalizeOverlayFontLabels(
        family && chosenOption
          ? { ...optionsState.currentOverlayFontLabels, [family]: chosenOption.textContent || family }
          : optionsState.currentOverlayFontLabels,
        [optionsState.currentOverlayFontFamily, optionsState.currentOverlayFontFallback]
      );
      if (localStorageArea) {
        localStorageArea.set({ [key]: family, [OVERLAY_FONT_LABELS_STORAGE_KEY]: optionsState.currentOverlayFontLabels });
      }
      optionsState.refreshOptionsSelectItems(select);
      optionsState.renderOverlayFontMissingNotices();
    });
  });
  if (newtabGlassStyleSelect) {
    newtabGlassStyleSelect.addEventListener('change', () => {
      const style = SETTINGS.normalizeNewtabGlassStyle(newtabGlassStyleSelect.value);
      newtabGlassStyleSelect.value = style;
      optionsState.currentNewtabGlassStyle = style;
      syncNewtabGlassThemeVisibility();
      if (optionsState.storageArea) {
        optionsState.storageArea.set({ [SETTINGS.NEWTAB_GLASS_STYLE_STORAGE_KEY]: style });
      }
      refreshCustomSelects();
    });
  }
  if (searchResultTabPositionSelect) {
    searchResultTabPositionSelect.addEventListener('change', () => {
      const position = SETTINGS.normalizeSearchResultTabPosition(searchResultTabPositionSelect.value);
      searchResultTabPositionSelect.value = position;
      if (optionsState.storageArea) {
        optionsState.storageArea.set({ [SEARCH_RESULT_TAB_POSITION_STORAGE_KEY]: position });
      }
      refreshCustomSelects();
    });
  }
  if (searchResultPriorityTabButtons.length > 0) {
    searchResultPriorityTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleSearchResultPrioritySelection(button.getAttribute('data-search-result-priority'));
      });
    });
  }
  if (searchResultSourceTypeInputs.length > 0) {
    searchResultSourceTypeInputs.forEach((input) => {
      input.addEventListener('change', () => {
        persistSearchResultSourceTypes(collectCheckedSearchResultSourceTypes());
      });
    });
  }
  if (recentModeSelect) {
    recentModeSelect.addEventListener('change', () => {
      handleRecentModeSelection(recentModeSelect.value);
    });
  }
  if (recentModeTabButtons.length > 0) {
    recentModeTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleRecentModeSelection(button.getAttribute('data-recent-mode'));
      });
    });
  }
  function setNewtabOpenInNewTabState(value) {
    const normalized = SETTINGS.normalizeNewtabOpenInNewTab(value);
    newtabOpenInNewTabToggles.forEach((input) => {
      setOptionsToggleState(input, normalized[input.getAttribute('data-newtab-open-in-new-tab-surface')]);
    });
  }
  newtabOpenInNewTabToggles.forEach((input) => {
    input.addEventListener('change', () => {
      const next = {};
      newtabOpenInNewTabToggles.forEach((item) => {
        next[item.getAttribute('data-newtab-open-in-new-tab-surface')] = Boolean(item.checked);
      });
      const normalized = SETTINGS.normalizeNewtabOpenInNewTab(next);
      setNewtabOpenInNewTabState(normalized);
      if (!optionsState.storageArea) {
        return;
      }
      optionsState.storageArea.set({ [NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY]: normalized });
    });
  });

  if (restrictedActionSelect) {
    restrictedActionSelect.addEventListener('change', () => {
      handleRestrictedActionSelection(restrictedActionSelect.value);
    });
  }
  if (restrictedActionTabButtons.length > 0) {
    restrictedActionTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleRestrictedActionSelection(button.getAttribute('data-restricted-action'));
      });
    });
  }

  function openExtensionShortcutsPage() {
    chrome.runtime.sendMessage({ action: 'openExtensionShortcutsPage' }, (response) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        return;
      }
      if (!response || response.ok === false) {
        showToast(getMessage('toast_error', '操作失败，请重试。'), true);
      }
    });
  }
  if (openShortcutsPageButton) {
    openShortcutsPageButton.addEventListener('click', openExtensionShortcutsPage);
  }
  if (openOnboardingPageButton) {
    openOnboardingPageButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openOnboardingPage' }, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
          return;
        }
        if (!response || response.ok === false) {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        }
      });
    });
  }

  return {
    setNewtabOpenInNewTabState
  };
}

export { createControlEvents };
