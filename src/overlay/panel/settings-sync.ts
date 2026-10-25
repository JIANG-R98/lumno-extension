import type { BlacklistRule } from '../../domain/blacklist-utils';
import { readSearchEngineState } from '../../domain/search/search-engine-state-reader';
import type { OverlayTab } from '../../domain/messages';
import type * as SearchUtils from '../../domain/search/search-utils';
import type { LocalSearchScope, SearchEngineState, SearchSourceType } from '../../domain/search/types';
import type * as Settings from '../../domain/settings';
import { normalizeThemeMode } from '../../domain/settings';
import type { OverlayEnterAnimation, OverlaySizeMode, SearchResultPriority, ThemeMode } from '../../domain/settings';
import type { StorageAreaFacade } from '../../platform/settings-storage';
import type * as SuggestionNavigation from '../../shared/search/suggestion-navigation';
import type * as OverlayRuntime from '../runtime';
import type { ReadableStorageArea } from '../runtime';
import type { StorageChangeListeners } from './types';

type StoredValues = Record<string, unknown>;

// Row is a suggestion row, Provider a site search provider and Theme a
// suggestion theme; this module only passes them along.
interface SettingsSyncState<Row, Provider> {
  storageArea: StorageAreaFacade | null;
  storageChangeListeners: StorageChangeListeners;
  overlay: HTMLElement | null;
  suggestionsContainer: HTMLElement | null;
  overlayViewportSizeSync: { apply(overlayElement: HTMLElement | null): void };
  overlayNoticeLayer: { sync(overlayElement: HTMLElement | null): void };
  inputModeController: { refreshModeMenu(): void } | null;
  latestOverlayQuery: string;
  // The rows of the last answer, to rebuild the list when a setting changes.
  lastSuggestionResponse: Row[];
  tabs: OverlayTab[];
  openTabsSearchModeActive: boolean;
  siteSearchState: Provider | null;
  localSearchScopeState: LocalSearchScope | null;
  overlayThemeMode: ThemeMode;
  overlayPageThemeAdaptationEnabled: boolean;
  overlaySearchEngineState: SearchEngineState | null;
  overlaySearchEngineStateReady: Promise<SearchEngineState | null>;
  overlaySearchResultPriorityMode: SearchResultPriority;
  enabledSearchResultSourceTypes: SearchSourceType[];
  overlaySearchBlacklistItems: BlacklistRule[];
  overlaySearchResultDisplayLimit: number;
  numberShortcutInstantEnabled: boolean;
  macosCtrlSuggestionNavigationEnabled: boolean;
  simpleModeEnabled: boolean;
  overlayEnterAnimation: OverlayEnterAnimation;
  motionEffectsEnabled: boolean;
  faviconEnhancedFetchEnabled: boolean;
  initialFaviconEnhancedFetchReady: Promise<void>;
  overlayFaviconRequestBlacklistItems: BlacklistRule[];
  overlayOpenTabsDefaultVisible: boolean;
  overlayOpenTabsDefaultVisibleLoaded: boolean;
  initialOverlayOpenTabsDefaultVisibleReady: Promise<void>;
  documentPipEnabled: boolean;
  overlayTabQuickSwitchEnabled: boolean;
  overlaySizeMode: OverlaySizeMode;
  overlayCustomWidth: number | null;
  overlayFontFamily: string;
  overlayFontFallback: string;
  overlayTabScoreDebugEnabled: boolean;
}

interface SettingsSyncDeps<Row, Provider, Theme> {
  SEARCH_BLACKLIST_STORAGE_KEY: string;
  THEME_STORAGE_KEY: string;
  OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY: string;
  LANGUAGE_STORAGE_KEY: string;
  DEFAULT_SEARCH_ENGINE_STORAGE_KEY: string;
  SEARCH_RESULT_PRIORITY_STORAGE_KEY: string;
  SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY: string;
  SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY: string;
  NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY: string;
  MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY: string;
  SIMPLE_MODE_ENABLED_STORAGE_KEY: string;
  FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY: string;
  FAVICON_REQUEST_BLACKLIST_STORAGE_KEY: string;
  OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY: string;
  DOCUMENT_PIP_ENABLED_STORAGE_KEY: string;
  OVERLAY_TAB_PRIORITY_STORAGE_KEY: string;
  OVERLAY_SIZE_MODE_STORAGE_KEY: string;
  OVERLAY_WIDTH_STORAGE_KEY: string;
  OVERLAY_ENTER_ANIMATION_STORAGE_KEY: string;
  MOTION_EFFECTS_ENABLED_STORAGE_KEY: string;
  OVERLAY_FONT_FAMILY_STORAGE_KEY: string;
  OVERLAY_FONT_FALLBACK_STORAGE_KEY: string;
  TAB_RANK_SCORE_DEBUG_STORAGE_KEY: string;
  SETTINGS: Pick<typeof Settings,
    'normalizeFaviconEnhancedFetchEnabled' | 'normalizeSearchResultPriority' |
    'normalizeSearchResultSourceTypes' | 'normalizeNumberShortcutInstantEnabled' |
    'normalizeMacosCtrlSuggestionNavigationEnabled' | 'normalizeSimpleModeEnabled' |
    'normalizeOverlayOpenTabsDefaultVisible' | 'normalizeOverlayTabPriorityMode' |
    'normalizeOverlaySizeMode' | 'normalizeOverlayWidth' | 'normalizeOverlayFontFamily' | 'normalizeTabRankScoreDebugMode' |
    'normalizeOverlayEnterAnimation' | 'normalizeMotionEffectsEnabled'>;
  SEARCH_UTILS: Pick<typeof SearchUtils, 'isRetiredSearchEngineState'>;
  SUGGESTION_NAVIGATION: Pick<typeof SuggestionNavigation, 'cancelNumberShortcuts'>;
  normalizeOverlaySearchBlacklistItems(items: unknown): BlacklistRule[];
  normalizeOverlayFaviconRequestBlacklistItems(items: unknown): BlacklistRule[];
  normalizeOverlayPageThemeAdaptationEnabled(value: unknown): boolean;
  normalizeSearchResultDisplayLimit(value: unknown): number;
  isPrimaryStorageAreaName(areaName: string): boolean;
  updateSearchSuggestions(rows: Row[], query: string, options?: { forceFullRerender?: boolean }): void;
  requestOverlaySearchSuggestions(query: string): void;
  applyOverlayTheme(mode: ThemeMode): void;
  applyLanguageMode(mode: unknown): void;
  applyOverlayFontFamily(): void;
  loadOverlaySearchEngineState(onReload: () => void): Promise<SearchEngineState | null>;
  clearLocalSearchScope(): void;
  shouldShowOpenTabsForEmptyQuery(): boolean;
  renderTabSuggestions(tabs: OverlayTab[]): void;
  filterTabsForOverlay(tabs: OverlayTab[], query: string): OverlayTab[];
  requestTabsAndRender(query?: string): void;
  clearDefaultOpenTabsSuggestions(): void;
  refreshOverlayFaviconsForPolicyChange(): void;
  setSiteSearchPrefix(provider: Provider, theme: Theme, options: { animate: boolean }): void;
  getImmediateThemeForSuggestion(suggestion: { provider: Provider }): Theme;
  // The settings read once when the panel opened.
  initialOverlaySettingsReady: Promise<StoredValues>;
  documentPipSupported: boolean;
  overlayRuntime: Pick<typeof OverlayRuntime, 'getStorageValues'>;
  // chrome.storage.local, or the provider area where there is none.
  localStorageArea: ReadableStorageArea | null;
  overlayState: SettingsSyncState<Row, Provider>;
}

// Overlay settings that can change while it is open: one storage
// listener per setting, and the reads that load them for this session.
function createSettingsSync<Row, Provider, Theme>(deps: SettingsSyncDeps<Row, Provider, Theme>) {
  const {
    SEARCH_BLACKLIST_STORAGE_KEY,
    normalizeOverlaySearchBlacklistItems,
    SETTINGS,
    updateSearchSuggestions,
    isPrimaryStorageAreaName,
    THEME_STORAGE_KEY,
    OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY,
    normalizeOverlayPageThemeAdaptationEnabled,
    applyOverlayTheme,
    LANGUAGE_STORAGE_KEY,
    applyLanguageMode,
    loadOverlaySearchEngineState,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_UTILS,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    clearLocalSearchScope,
    requestOverlaySearchSuggestions,
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    normalizeSearchResultDisplayLimit,
    shouldShowOpenTabsForEmptyQuery,
    renderTabSuggestions,
    filterTabsForOverlay,
    NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
    SUGGESTION_NAVIGATION,
    MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
    SIMPLE_MODE_ENABLED_STORAGE_KEY,
    initialOverlaySettingsReady,
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
    normalizeOverlayFaviconRequestBlacklistItems,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    refreshOverlayFaviconsForPolicyChange,
    setSiteSearchPrefix,
    getImmediateThemeForSuggestion,
    OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
    requestTabsAndRender,
    clearDefaultOpenTabsSuggestions,
    DOCUMENT_PIP_ENABLED_STORAGE_KEY,
    documentPipSupported,
    OVERLAY_TAB_PRIORITY_STORAGE_KEY,
    OVERLAY_SIZE_MODE_STORAGE_KEY,
    OVERLAY_WIDTH_STORAGE_KEY,
    OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
    MOTION_EFFECTS_ENABLED_STORAGE_KEY,
    overlayRuntime,
    localStorageArea,
    OVERLAY_FONT_FAMILY_STORAGE_KEY,
    OVERLAY_FONT_FALLBACK_STORAGE_KEY,
    applyOverlayFontFamily,
    TAB_RANK_SCORE_DEBUG_STORAGE_KEY
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  function loadOverlaySearchBlacklistItems(onReload: () => void): void {
    if (!overlayState.storageArea) {
      overlayState.overlaySearchBlacklistItems = [];
      return;
    }
    void overlayState.storageArea.get([SEARCH_BLACKLIST_STORAGE_KEY], (result) => {
      overlayState.overlaySearchBlacklistItems = normalizeOverlaySearchBlacklistItems(
        result ? result[SEARCH_BLACKLIST_STORAGE_KEY] : null
      );
      if (typeof onReload === 'function') {
        onReload();
      }
    });
  }

  function normalizeFaviconEnhancedFetchEnabled(value: unknown): boolean {
    return SETTINGS.normalizeFaviconEnhancedFetchEnabled(value);
  }

  function applyOverlaySizeForPageZoom(overlayElement: HTMLElement | null): void {
    overlayState.overlayViewportSizeSync.apply(overlayElement);
    overlayState.overlayNoticeLayer.sync(overlayElement);
  }

  function refreshOverlaySuggestionsFromLastResponse(): void {
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || (
      !changes[THEME_STORAGE_KEY] &&
      !changes[OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY]
    )) {
      return;
    }
    const adaptationChange = changes[OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY];
    if (adaptationChange) {
      overlayState.overlayPageThemeAdaptationEnabled = normalizeOverlayPageThemeAdaptationEnabled(
        adaptationChange.newValue
      );
    }
    const themeChange = changes[THEME_STORAGE_KEY];
    const nextMode = themeChange
      ? normalizeThemeMode(themeChange.newValue)
      : overlayState.overlayThemeMode;
    applyOverlayTheme(nextMode);
  });

  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName)) {
      return;
    }
    const languageChange = changes[LANGUAGE_STORAGE_KEY];
    if (languageChange) {
      applyLanguageMode(languageChange.newValue || 'system');
    }
  });

  overlayState.overlaySearchEngineStateReady = loadOverlaySearchEngineState(
    refreshOverlaySuggestionsFromLastResponse
  );
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const engineChange = changes[DEFAULT_SEARCH_ENGINE_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !engineChange) {
      return;
    }
    const nextValue = readSearchEngineState(engineChange.newValue);
    if (nextValue && nextValue.id &&
        (!SEARCH_UTILS.isRetiredSearchEngineState(nextValue))) {
      overlayState.overlaySearchEngineState = nextValue;
      if (overlayState.latestOverlayQuery) {
        updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
      }
    }
  });
  if (overlayState.storageArea) {
    void overlayState.storageArea.get([
      SEARCH_RESULT_PRIORITY_STORAGE_KEY,
      SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY
    ], (result) => {
      overlayState.overlaySearchResultPriorityMode = SETTINGS.normalizeSearchResultPriority(
        result ? result[SEARCH_RESULT_PRIORITY_STORAGE_KEY] : undefined
      );
      overlayState.enabledSearchResultSourceTypes = SETTINGS.normalizeSearchResultSourceTypes(
        result ? result[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY] : undefined
      );
    });
  }
  loadOverlaySearchBlacklistItems(refreshOverlaySuggestionsFromLastResponse);
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const priorityChange = changes[SEARCH_RESULT_PRIORITY_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !priorityChange) {
      return;
    }
    overlayState.overlaySearchResultPriorityMode = SETTINGS.normalizeSearchResultPriority(priorityChange.newValue);
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const sourceTypesChange = changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !sourceTypesChange) {
      return;
    }
    overlayState.enabledSearchResultSourceTypes = SETTINGS.normalizeSearchResultSourceTypes(
      sourceTypesChange.newValue
    );
    const scope = overlayState.localSearchScopeState;
    if (scope && !overlayState.enabledSearchResultSourceTypes.some((type) => type === scope.sourceType)) {
      clearLocalSearchScope();
    }
    if (overlayState.latestOverlayQuery) {
      requestOverlaySearchSuggestions(overlayState.latestOverlayQuery);
    }
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const displayLimitChange = changes[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !displayLimitChange) {
      return;
    }
    overlayState.overlaySearchResultDisplayLimit = normalizeSearchResultDisplayLimit(
      displayLimitChange.newValue
    );
    if (overlayState.openTabsSearchModeActive || (!overlayState.latestOverlayQuery && shouldShowOpenTabsForEmptyQuery())) {
      renderTabSuggestions(filterTabsForOverlay(overlayState.tabs, overlayState.latestOverlayQuery));
      return;
    }
    refreshOverlaySuggestionsFromLastResponse();
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const numberShortcutChange = changes[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !numberShortcutChange) {
      return;
    }
    const rawValue = numberShortcutChange.newValue;
    overlayState.numberShortcutInstantEnabled = SETTINGS.normalizeNumberShortcutInstantEnabled(rawValue);
    SUGGESTION_NAVIGATION.cancelNumberShortcuts(overlayState.suggestionsContainer);
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const ctrlNavigationChange = changes[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !ctrlNavigationChange) {
      return;
    }
    const rawValue = ctrlNavigationChange.newValue;
    overlayState.macosCtrlSuggestionNavigationEnabled =
      SETTINGS.normalizeMacosCtrlSuggestionNavigationEnabled(rawValue);
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const simpleModeChange = changes[SIMPLE_MODE_ENABLED_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !simpleModeChange) {
      return;
    }
    const rawValue = simpleModeChange.newValue;
    overlayState.simpleModeEnabled = SETTINGS.normalizeSimpleModeEnabled(rawValue);
    if (overlayState.openTabsSearchModeActive || (!overlayState.latestOverlayQuery && shouldShowOpenTabsForEmptyQuery())) {
      renderTabSuggestions(filterTabsForOverlay(overlayState.tabs, overlayState.latestOverlayQuery));
      return;
    }
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery, {
        forceFullRerender: true
      });
    }
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const blacklistChange = changes[SEARCH_BLACKLIST_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !blacklistChange) {
      return;
    }
    overlayState.overlaySearchBlacklistItems = normalizeOverlaySearchBlacklistItems(
      blacklistChange.newValue
    );
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  });
  if (overlayState.storageArea) {
    overlayState.initialFaviconEnhancedFetchReady = initialOverlaySettingsReady.then((result) => {
      overlayState.faviconEnhancedFetchEnabled = normalizeFaviconEnhancedFetchEnabled(
        result ? result[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY] : true
      );
      overlayState.overlayFaviconRequestBlacklistItems = normalizeOverlayFaviconRequestBlacklistItems(
        result ? result[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY] : null
      );
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const enhancedFetchChange = changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY];
    const requestBlacklistChange = changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || (!enhancedFetchChange && !requestBlacklistChange)) {
      return;
    }
    if (enhancedFetchChange) {
      overlayState.faviconEnhancedFetchEnabled = normalizeFaviconEnhancedFetchEnabled(
        enhancedFetchChange.newValue
      );
    }
    if (requestBlacklistChange) {
      overlayState.overlayFaviconRequestBlacklistItems = normalizeOverlayFaviconRequestBlacklistItems(
        requestBlacklistChange.newValue
      );
    }
    refreshOverlayFaviconsForPolicyChange();
    if (overlayState.inputModeController) {
      const provider = overlayState.siteSearchState;
      if (provider) {
        setSiteSearchPrefix(provider, getImmediateThemeForSuggestion({ provider }), { animate: false });
      }
      overlayState.inputModeController.refreshModeMenu();
    }
  });
  if (overlayState.storageArea) {
    overlayState.initialOverlayOpenTabsDefaultVisibleReady = initialOverlaySettingsReady.then((result) => {
      const rawValue = result ? result[OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY] : undefined;
      const normalized = SETTINGS.normalizeOverlayOpenTabsDefaultVisible(rawValue);
      overlayState.overlayOpenTabsDefaultVisible = normalized;
      overlayState.overlayOpenTabsDefaultVisibleLoaded = true;
      if (rawValue !== normalized && overlayState.storageArea) {
        void overlayState.storageArea.set({ [OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY]: normalized });
      }
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const openTabsChange = changes[OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !openTabsChange) {
      return;
    }
    const rawValue = openTabsChange.newValue;
    const normalized = SETTINGS.normalizeOverlayOpenTabsDefaultVisible(rawValue);
    overlayState.overlayOpenTabsDefaultVisible = normalized;
    overlayState.overlayOpenTabsDefaultVisibleLoaded = true;
    if (rawValue !== normalized && overlayState.storageArea) {
      void overlayState.storageArea.set({ [OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY]: normalized });
    }
    if (overlayState.latestOverlayQuery || overlayState.openTabsSearchModeActive) {
      return;
    }
    if (normalized) {
      requestTabsAndRender('');
    } else {
      clearDefaultOpenTabsSuggestions();
    }
  });
  if (overlayState.storageArea) {
    void overlayState.storageArea.get([DOCUMENT_PIP_ENABLED_STORAGE_KEY], (result) => {
      overlayState.documentPipEnabled = documentPipSupported && result !== undefined &&
        result[DOCUMENT_PIP_ENABLED_STORAGE_KEY] === true;
      if (overlayState.latestOverlayQuery) {
        updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
      }
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const documentPipChange = changes[DOCUMENT_PIP_ENABLED_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !documentPipChange) {
      return;
    }
    overlayState.documentPipEnabled = documentPipSupported && documentPipChange.newValue === true;
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  });

  if (overlayState.storageArea) {
    void overlayState.storageArea.get([OVERLAY_TAB_PRIORITY_STORAGE_KEY], (result) => {
      overlayState.overlayTabQuickSwitchEnabled = SETTINGS.normalizeOverlayTabPriorityMode(
        result ? result[OVERLAY_TAB_PRIORITY_STORAGE_KEY] : undefined
      );
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const tabPriorityChange = changes[OVERLAY_TAB_PRIORITY_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !tabPriorityChange) {
      return;
    }
    overlayState.overlayTabQuickSwitchEnabled = SETTINGS.normalizeOverlayTabPriorityMode(tabPriorityChange.newValue);
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  });
  const initialOverlayThemeReady = initialOverlaySettingsReady.then((result): ThemeMode => {
    if (!overlayState.storageArea) {
      applyOverlayTheme('system');
      return 'system';
    }
    const initialThemeMode = normalizeThemeMode(result[THEME_STORAGE_KEY]);
    const rawAdaptationEnabled = result[OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY];
    overlayState.overlayPageThemeAdaptationEnabled = normalizeOverlayPageThemeAdaptationEnabled(rawAdaptationEnabled);
    if (rawAdaptationEnabled !== overlayState.overlayPageThemeAdaptationEnabled) {
      void overlayState.storageArea.set({
        [OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY]: overlayState.overlayPageThemeAdaptationEnabled
      });
    }
    applyOverlayTheme(initialThemeMode);
    return initialThemeMode;
  });
  const initialOverlayEnterAnimationReady = initialOverlaySettingsReady.then((result) => {
    overlayState.overlayEnterAnimation = SETTINGS.normalizeOverlayEnterAnimation(result[OVERLAY_ENTER_ANIMATION_STORAGE_KEY]);
    return overlayState.overlayEnterAnimation;
  });
  const initialMotionEffectsReady = initialOverlaySettingsReady.then((result) => {
    overlayState.motionEffectsEnabled = SETTINGS.normalizeMotionEffectsEnabled(result[MOTION_EFFECTS_ENABLED_STORAGE_KEY]);
    return overlayState.motionEffectsEnabled;
  });
  const initialSimpleModeReady = initialOverlaySettingsReady.then((result) => {
    overlayState.simpleModeEnabled = SETTINGS.normalizeSimpleModeEnabled(result[SIMPLE_MODE_ENABLED_STORAGE_KEY]);
    return overlayState.simpleModeEnabled;
  });
  // A stored limit out of range is written back in range.
  const initialSearchResultDisplayLimitReady = initialOverlaySettingsReady.then((result) => {
    const rawValue = result[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY];
    overlayState.overlaySearchResultDisplayLimit = normalizeSearchResultDisplayLimit(rawValue);
    if (overlayState.storageArea && rawValue !== overlayState.overlaySearchResultDisplayLimit) {
      void overlayState.storageArea.set({
        [SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY]: overlayState.overlaySearchResultDisplayLimit
      });
    }
    return overlayState.overlaySearchResultDisplayLimit;
  });
  const initialNumberShortcutInstantReady = initialOverlaySettingsReady.then((result) => {
    overlayState.numberShortcutInstantEnabled = SETTINGS.normalizeNumberShortcutInstantEnabled(
      result[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY]
    );
    return overlayState.numberShortcutInstantEnabled;
  });
  const initialMacosCtrlSuggestionNavigationReady = initialOverlaySettingsReady.then((result) => {
    overlayState.macosCtrlSuggestionNavigationEnabled = SETTINGS.normalizeMacosCtrlSuggestionNavigationEnabled(
      result[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY]
    );
    return overlayState.macosCtrlSuggestionNavigationEnabled;
  });
  const initialOverlaySizeReady = initialOverlaySettingsReady.then((result) => {
    overlayState.overlaySizeMode = SETTINGS.normalizeOverlaySizeMode(result[OVERLAY_SIZE_MODE_STORAGE_KEY]);
    overlayState.overlayCustomWidth = SETTINGS.normalizeOverlayWidth(result[OVERLAY_WIDTH_STORAGE_KEY]);
    applyOverlaySizeForPageZoom(overlayState.overlay);
    return overlayState.overlaySizeMode;
  });
  // The fonts are this device's own choice (installed faces), so they are
  // read from chrome.storage.local whichever area holds synced settings.
  const initialOverlayFontFamilyReady = overlayRuntime.getStorageValues(
    localStorageArea,
    [OVERLAY_FONT_FAMILY_STORAGE_KEY, OVERLAY_FONT_FALLBACK_STORAGE_KEY]
  ).then((result) => {
    overlayState.overlayFontFamily = SETTINGS.normalizeOverlayFontFamily(result[OVERLAY_FONT_FAMILY_STORAGE_KEY]);
    overlayState.overlayFontFallback = SETTINGS.normalizeOverlayFontFamily(result[OVERLAY_FONT_FALLBACK_STORAGE_KEY]);
    applyOverlayFontFamily();
    return overlayState.overlayFontFamily;
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    let changed = false;
    const fontFamilyChange = changes[OVERLAY_FONT_FAMILY_STORAGE_KEY];
    const fontFallbackChange = changes[OVERLAY_FONT_FALLBACK_STORAGE_KEY];
    if (fontFamilyChange) {
      overlayState.overlayFontFamily = SETTINGS.normalizeOverlayFontFamily(fontFamilyChange.newValue);
      changed = true;
    }
    if (fontFallbackChange) {
      overlayState.overlayFontFallback = SETTINGS.normalizeOverlayFontFamily(fontFallbackChange.newValue);
      changed = true;
    }
    if (changed) {
      applyOverlayFontFamily();
    }
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const sizeModeChange = changes[OVERLAY_SIZE_MODE_STORAGE_KEY];
    const widthChange = changes[OVERLAY_WIDTH_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || (!sizeModeChange && !widthChange)) {
      return;
    }
    if (sizeModeChange) {
      overlayState.overlaySizeMode = SETTINGS.normalizeOverlaySizeMode(sizeModeChange.newValue);
    }
    if (widthChange) {
      overlayState.overlayCustomWidth = SETTINGS.normalizeOverlayWidth(widthChange.newValue);
    }
    applyOverlaySizeForPageZoom(overlayState.overlay);
  });
  if (overlayState.storageArea) {
    void overlayState.storageArea.get([TAB_RANK_SCORE_DEBUG_STORAGE_KEY], (result) => {
      overlayState.overlayTabScoreDebugEnabled = SETTINGS.normalizeTabRankScoreDebugMode(
        result ? result[TAB_RANK_SCORE_DEBUG_STORAGE_KEY] : undefined
      );
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    const scoreDebugChange = changes[TAB_RANK_SCORE_DEBUG_STORAGE_KEY];
    if (!isPrimaryStorageAreaName(areaName) || !scoreDebugChange) {
      return;
    }
    overlayState.overlayTabScoreDebugEnabled = SETTINGS.normalizeTabRankScoreDebugMode(scoreDebugChange.newValue);
    if (!overlayState.latestOverlayQuery || !overlayState.latestOverlayQuery.trim()) {
      requestTabsAndRender();
    }
  });

  return {
    initialOverlayThemeReady,
    initialOverlayEnterAnimationReady,
    initialMotionEffectsReady,
    initialSimpleModeReady,
    initialSearchResultDisplayLimitReady,
    initialNumberShortcutInstantReady,
    initialMacosCtrlSuggestionNavigationReady,
    initialOverlaySizeReady,
    initialOverlayFontFamilyReady
  };
}

export { createSettingsSync };
export type { SettingsSyncDeps, SettingsSyncState };
