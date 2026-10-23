// The search input's mode controller: site search and local scope
// prefixes, the tab hint for site search, the placeholder and caret color
// per mode, and the cached provider icons the prefixes show.
import * as SEARCH_INPUT_MODE from '../../shared/search/search-input-mode.js';

function createSearchModeController(deps) {
  const {
    storageArea,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    OVERLAY_TAB_PRIORITY_STORAGE_KEY,
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
    normalizeSearchResultPriority,
    normalizeEnabledSearchResultSourceTypes,
    normalizeSearchResultDisplayLimit,
    normalizeOverlayTabPriorityMode,
    SETTINGS,
    renderSuggestions,
    searchInput,
    SEARCH_CLEAR_BUTTON_INSET,
    getThemeForMode,
    defaultTheme,
    defaultAccentColor,
    parseCssColor,
    rgbToCss,
    isNewtabDarkMode,
    getProviderIcon,
    getPageFaviconUrlResolver,
    getProviderFaviconPageUrl,
    getProviderThemeHost,
    getThemeForProvider,
    getSiteSearchPrefixText,
    getSiteSearchDisplayName,
    isAiSiteSearchProvider,
    attachInputModeFaviconData,
    attachInputModeProviderIcon,
    formatMessage,
    bookmarkCursorTooltipController,
    getSearchModeMenuItems,
    selectSearchModeMenuItem,
    reorderSearchModeMenu,
    moveSearchModeMenuGroup,
    stepSearchModeMenuHistory,
    showToast,
    t,
    hideToast,
    setSearchScopeIconEnabled,
    syncSearchModeMenuResultOffset,
    loadSiteSearchIconCache,
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function setSiteSearchTabHint(provider) {
    if (pageState.inputModeController) {
      pageState.inputModeController.setTabHintVisible(true, provider);
    }
  }

  function clearSiteSearchTabHint() {
    if (pageState.inputModeController) {
      pageState.inputModeController.setTabHintVisible(false);
    }
  }

  if (storageArea) {
    storageArea.get([
      SEARCH_RESULT_PRIORITY_STORAGE_KEY,
      SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
      SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
      OVERLAY_TAB_PRIORITY_STORAGE_KEY,
      NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY
    ], (result) => {
      const raw = result ? result[SEARCH_RESULT_PRIORITY_STORAGE_KEY] : null;
      const nextMode = normalizeSearchResultPriority(raw);
      pageState.searchResultPriorityMode = nextMode;
      pageState.enabledSearchResultSourceTypes = normalizeEnabledSearchResultSourceTypes(
        result ? result[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY] : null
      );
      const rawDisplayLimit = result ? result[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY] : null;
      pageState.searchResultDisplayLimit = normalizeSearchResultDisplayLimit(rawDisplayLimit);
      pageState.openTabQuickSwitchEnabled = normalizeOverlayTabPriorityMode(
        result ? result[OVERLAY_TAB_PRIORITY_STORAGE_KEY] : null
      );
      pageState.newtabOpenInNewTab = SETTINGS.normalizeNewtabOpenInNewTab(
        result ? result[NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY] : null
      );
      if (raw !== nextMode) {
        storageArea.set({ [SEARCH_RESULT_PRIORITY_STORAGE_KEY]: nextMode });
      }
      if (rawDisplayLimit !== pageState.searchResultDisplayLimit) {
        storageArea.set({ [SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY]: pageState.searchResultDisplayLimit });
      }
      if (pageState.latestQuery) {
        renderSuggestions(pageState.lastSuggestionResponse, pageState.latestQuery);
      }
    });
  }
  const defaultPlaceholder = searchInput.placeholder;
  const defaultCaretColor = searchInput.style.caretColor || '#7DB7FF';
  const inputModePrefixTransition = 'opacity 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease';
  pageState.inputModeController = SEARCH_INPUT_MODE.createInputModeController(pageState.inputParts, {
    surface: 'newtab',
    useImportantStyles: false,
    prefixTransition: inputModePrefixTransition,
    defaultPlaceholder,
    defaultCaretColor,
    modeBadgeElement: pageState.modeBadge,
    rightReserveBase: 100,
    rightAnchorOffset: 88,
    getExtraRightInset: () => (pageState.inputParts.syncClearAction() ? SEARCH_CLEAR_BUTTON_INSET : 0),
    baseInputPaddingLeft: 44,
    getThemeForMode,
    defaultTheme,
    defaultAccentColor,
    parseCssColor,
    rgbToCss,
    isDarkMode: isNewtabDarkMode,
    getProviderIcon,
    resolveProviderIconUrl: (provider, iconUrl) => getPageFaviconUrlResolver().getProviderFaviconUrl(
      getProviderFaviconPageUrl(provider), iconUrl
    ),
    getProviderThemeHost,
    getThemeForProvider,
    getSiteSearchPrefixText,
    getSiteSearchDisplayName,
    isAiSiteSearchProvider,
    attachFaviconData: attachInputModeFaviconData,
    attachProviderIcon: attachInputModeProviderIcon,
    preferDirectProviderIcons: true,
    formatMessage,
    modeMenuCursorTooltipController: bookmarkCursorTooltipController,
    getModeMenuItems: getSearchModeMenuItems,
    onModeMenuSelect: selectSearchModeMenuItem,
    onModeMenuReorder: reorderSearchModeMenu,
    onModeMenuGroupMove: moveSearchModeMenuGroup,
    onModeMenuHistory: stepSearchModeMenuHistory,
    onModeTagRemovalConfirmation: () => {
      showToast(t(
        'search_scope_remove_confirmation',
        'Press Backspace again to remove the scope.'
      ));
    },
    onModeTagRemovalConfirmationReset: hideToast,
    onModeTagActiveChange: (active) => {
      setSearchScopeIconEnabled(!active);
    },
    onModeMenuLayoutChange: syncSearchModeMenuResultOffset,
    isTabHintSuppressed: () => Boolean(pageState.siteSearchState || pageState.localSearchScopeState)
  });
  syncSearchModeMenuResultOffset();
  if (typeof window.ResizeObserver === 'function') {
    const searchModeMenuResultResizeObserver = new window.ResizeObserver(
      syncSearchModeMenuResultOffset
    );
    searchModeMenuResultResizeObserver.observe(pageState.suggestionsContainer);
  }
  loadSiteSearchIconCache().then(() => {
    if (!pageState.siteSearchState || !pageState.inputModeController) {
      return;
    }
    const activeProvider = pageState.siteSearchState;
    setSiteSearchPrefix(activeProvider, defaultTheme);
    getThemeForProvider(activeProvider).then((theme) => {
      if (pageState.siteSearchState === activeProvider) {
        setSiteSearchPrefix(activeProvider, theme);
      }
    }).catch(() => {});
  });

  function updateSiteSearchPrefixLayout() {
    if (pageState.inputModeController) {
      pageState.inputModeController.updateLayout();
    }
  }

  function setSiteSearchPrefix(provider, theme, options) {
    if (pageState.inputModeController) {
      pageState.inputModeController.setProviderPrefix(provider, theme, options);
    }
  }

  function clearSiteSearchPrefix() {
    if (pageState.inputModeController) {
      pageState.inputModeController.clearProviderPrefix();
    }
  }

  return {
    setSiteSearchTabHint,
    clearSiteSearchTabHint,
    updateSiteSearchPrefixLayout,
    setSiteSearchPrefix,
    clearSiteSearchPrefix
  };
}

export { createSearchModeController };
