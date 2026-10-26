import type { BlacklistRule } from '../../domain/blacklist-utils';
import { readSearchEngineState } from '../../domain/search/search-engine-state-reader';
import type { OverlayTab } from '../../domain/messages';
import type { LocalSearchScope, SearchEngineState, SearchSourceType } from '../../domain/search/types';
import { motionEffectsEnabled, simpleModeEnabled, themeMode } from '../../domain/settings/appearance';
import type { ThemeMode } from '../../domain/settings/appearance';
import { documentPipEnabled } from '../../domain/settings/features';
import { language } from '../../domain/settings/locale';
import {
  overlayEnterAnimation,
  overlayFontFallback,
  overlayFontFamily,
  overlayOpenInCurrentTab,
  overlayOpenTabsDefaultVisible,
  overlayPageThemeAdaptationEnabled,
  overlaySizeMode,
  overlayTabPriority,
  overlayWidth
} from '../../domain/settings/overlay-panel';
import type { OverlayEnterAnimation, OverlaySizeMode } from '../../domain/settings/overlay-panel';
import {
  defaultSearchEngine,
  faviconEnhancedFetchEnabled,
  faviconRequestBlacklist,
  macosCtrlSuggestionNavigationEnabled,
  numberShortcutInstantEnabled,
  searchBlacklist,
  searchResultDisplayLimit,
  searchResultPriority,
  searchResultSourceTypes,
  tabRankScoreDebug
} from '../../domain/settings/search';
import type { SearchResultPriority } from '../../domain/settings/search';
import type * as SuggestionNavigation from '../../shared/search/suggestion-navigation';
import type { OverlaySettings } from '../overlay-settings';
import * as SearchSiteSearchProviders from '../../domain/search/utils/site-search-providers';

// Row is a suggestion row, Provider a site search provider and Theme a
// suggestion theme; this module only passes them along.
interface SettingsSyncState<Row, Provider> {
  settings: OverlaySettings;
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
  // Results open in this tab rather than a new one.
  overlayOpenInCurrentTab: boolean;
  documentPipEnabled: boolean;
  overlayTabQuickSwitchEnabled: boolean;
  overlaySizeMode: OverlaySizeMode;
  overlayCustomWidth: number | null;
  overlayFontFamily: string;
  overlayFontFallback: string;
  overlayTabScoreDebugEnabled: boolean;
}

interface SettingsSyncDeps<Row, Provider, Theme> {
  SUGGESTION_NAVIGATION: Pick<typeof SuggestionNavigation, 'cancelNumberShortcuts'>;
  normalizeOverlaySearchBlacklistItems(items: unknown): BlacklistRule[];
  normalizeOverlayFaviconRequestBlacklistItems(items: unknown): BlacklistRule[];
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
  documentPipSupported: boolean;
  overlayState: SettingsSyncState<Row, Provider>;
}

// Overlay settings that can change while it is open: what each one sets in
// the panel when the session's settings are read, and again on every
// change until the panel closes.
function createSettingsSync<Row, Provider, Theme>(deps: SettingsSyncDeps<Row, Provider, Theme>) {
  const {
    normalizeOverlaySearchBlacklistItems,
    normalizeOverlayFaviconRequestBlacklistItems,
    updateSearchSuggestions,
    applyOverlayTheme,
    applyLanguageMode,
    loadOverlaySearchEngineState,
    clearLocalSearchScope,
    requestOverlaySearchSuggestions,
    shouldShowOpenTabsForEmptyQuery,
    renderTabSuggestions,
    filterTabsForOverlay,
    SUGGESTION_NAVIGATION,
    refreshOverlayFaviconsForPolicyChange,
    setSiteSearchPrefix,
    getImmediateThemeForSuggestion,
    requestTabsAndRender,
    clearDefaultOpenTabsSuggestions,
    documentPipSupported,
    applyOverlayFontFamily
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;
  const settings = overlayState.settings;
  const loaded = settings.loaded;

  function applyOverlaySizeForPageZoom(overlayElement: HTMLElement | null): void {
    overlayState.overlayViewportSizeSync.apply(overlayElement);
    overlayState.overlayNoticeLayer.sync(overlayElement);
  }

  function refreshOverlaySuggestionsFromLastResponse(): void {
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  }

  function showsOpenTabs(): boolean {
    return overlayState.openTabsSearchModeActive ||
      (!overlayState.latestOverlayQuery && shouldShowOpenTabsForEmptyQuery());
  }

  function readTheme(): void {
    overlayState.overlayPageThemeAdaptationEnabled = settings.get(overlayPageThemeAdaptationEnabled);
  }
  settings.follow([themeMode, overlayPageThemeAdaptationEnabled], () => {
    readTheme();
    applyOverlayTheme(settings.get(themeMode));
  });

  settings.follow(language, () => applyLanguageMode(settings.get(language)));

  overlayState.overlaySearchEngineStateReady = loadOverlaySearchEngineState(
    refreshOverlaySuggestionsFromLastResponse
  );
  settings.follow(defaultSearchEngine, () => {
    const nextValue = readSearchEngineState(settings.get(defaultSearchEngine));
    if (nextValue && nextValue.id && !SearchSiteSearchProviders.isRetiredSearchEngineState(nextValue)) {
      overlayState.overlaySearchEngineState = nextValue;
      refreshOverlaySuggestionsFromLastResponse();
    }
  });

  function readSearchResults(): void {
    overlayState.overlaySearchResultPriorityMode = settings.get(searchResultPriority);
    overlayState.enabledSearchResultSourceTypes = settings.get(searchResultSourceTypes);
    overlayState.overlaySearchBlacklistItems = normalizeOverlaySearchBlacklistItems(settings.get(searchBlacklist));
  }
  void loaded.then(() => {
    readSearchResults();
    refreshOverlaySuggestionsFromLastResponse();
  });
  settings.follow([searchResultPriority, searchBlacklist], () => {
    readSearchResults();
    refreshOverlaySuggestionsFromLastResponse();
  });
  settings.follow(searchResultSourceTypes, () => {
    readSearchResults();
    const scope = overlayState.localSearchScopeState;
    if (scope && !overlayState.enabledSearchResultSourceTypes.some((type) => type === scope.sourceType)) {
      clearLocalSearchScope();
    }
    if (overlayState.latestOverlayQuery) {
      requestOverlaySearchSuggestions(overlayState.latestOverlayQuery);
    }
  });
  settings.follow(searchResultDisplayLimit, () => {
    overlayState.overlaySearchResultDisplayLimit = settings.get(searchResultDisplayLimit);
    if (showsOpenTabs()) {
      renderTabSuggestions(filterTabsForOverlay(overlayState.tabs, overlayState.latestOverlayQuery));
      return;
    }
    refreshOverlaySuggestionsFromLastResponse();
  });
  settings.follow(numberShortcutInstantEnabled, () => {
    overlayState.numberShortcutInstantEnabled = settings.get(numberShortcutInstantEnabled);
    SUGGESTION_NAVIGATION.cancelNumberShortcuts(overlayState.suggestionsContainer);
  });
  settings.follow(macosCtrlSuggestionNavigationEnabled, () => {
    overlayState.macosCtrlSuggestionNavigationEnabled = settings.get(macosCtrlSuggestionNavigationEnabled);
  });
  settings.follow(simpleModeEnabled, () => {
    overlayState.simpleModeEnabled = settings.get(simpleModeEnabled);
    if (showsOpenTabs()) {
      renderTabSuggestions(filterTabsForOverlay(overlayState.tabs, overlayState.latestOverlayQuery));
      return;
    }
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery, {
        forceFullRerender: true
      });
    }
  });

  function readFaviconPolicy(): void {
    overlayState.faviconEnhancedFetchEnabled = settings.get(faviconEnhancedFetchEnabled);
    overlayState.overlayFaviconRequestBlacklistItems = normalizeOverlayFaviconRequestBlacklistItems(
      settings.get(faviconRequestBlacklist)
    );
  }
  overlayState.initialFaviconEnhancedFetchReady = loaded.then(readFaviconPolicy);
  settings.follow([faviconEnhancedFetchEnabled, faviconRequestBlacklist], () => {
    readFaviconPolicy();
    refreshOverlayFaviconsForPolicyChange();
    if (overlayState.inputModeController) {
      const provider = overlayState.siteSearchState;
      if (provider) {
        setSiteSearchPrefix(provider, getImmediateThemeForSuggestion({ provider }), { animate: false });
      }
      overlayState.inputModeController.refreshModeMenu();
    }
  });

  function readOpenTabsDefaultVisible(): void {
    overlayState.overlayOpenTabsDefaultVisible = settings.get(overlayOpenTabsDefaultVisible);
    overlayState.overlayOpenTabsDefaultVisibleLoaded = true;
  }
  overlayState.initialOverlayOpenTabsDefaultVisibleReady = loaded.then(readOpenTabsDefaultVisible);
  settings.follow(overlayOpenTabsDefaultVisible, () => {
    readOpenTabsDefaultVisible();
    if (overlayState.latestOverlayQuery || overlayState.openTabsSearchModeActive) {
      return;
    }
    if (overlayState.overlayOpenTabsDefaultVisible) {
      requestTabsAndRender('');
    } else {
      clearDefaultOpenTabsSuggestions();
    }
  });

  function readOpenInCurrentTab(): void {
    overlayState.overlayOpenInCurrentTab = settings.get(overlayOpenInCurrentTab);
  }
  void loaded.then(readOpenInCurrentTab);
  settings.follow(overlayOpenInCurrentTab, readOpenInCurrentTab);

  function readDocumentPip(): void {
    overlayState.documentPipEnabled = documentPipSupported && settings.get(documentPipEnabled);
  }
  void loaded.then(() => {
    readDocumentPip();
    refreshOverlaySuggestionsFromLastResponse();
  });
  settings.follow(documentPipEnabled, () => {
    readDocumentPip();
    refreshOverlaySuggestionsFromLastResponse();
  });

  void loaded.then(() => {
    overlayState.overlayTabQuickSwitchEnabled = settings.get(overlayTabPriority);
  });
  settings.follow(overlayTabPriority, () => {
    overlayState.overlayTabQuickSwitchEnabled = settings.get(overlayTabPriority);
    refreshOverlaySuggestionsFromLastResponse();
  });

  const initialOverlayThemeReady = loaded.then((): ThemeMode => {
    readTheme();
    const initialThemeMode = settings.get(themeMode);
    applyOverlayTheme(initialThemeMode);
    return initialThemeMode;
  });
  const initialOverlayEnterAnimationReady = loaded.then(() => {
    overlayState.overlayEnterAnimation = settings.get(overlayEnterAnimation);
    return overlayState.overlayEnterAnimation;
  });
  const initialMotionEffectsReady = loaded.then(() => {
    overlayState.motionEffectsEnabled = settings.get(motionEffectsEnabled);
    return overlayState.motionEffectsEnabled;
  });
  const initialSimpleModeReady = loaded.then(() => {
    overlayState.simpleModeEnabled = settings.get(simpleModeEnabled);
    return overlayState.simpleModeEnabled;
  });
  const initialSearchResultDisplayLimitReady = loaded.then(() => {
    overlayState.overlaySearchResultDisplayLimit = settings.get(searchResultDisplayLimit);
    return overlayState.overlaySearchResultDisplayLimit;
  });
  const initialNumberShortcutInstantReady = loaded.then(() => {
    overlayState.numberShortcutInstantEnabled = settings.get(numberShortcutInstantEnabled);
    return overlayState.numberShortcutInstantEnabled;
  });
  const initialMacosCtrlSuggestionNavigationReady = loaded.then(() => {
    overlayState.macosCtrlSuggestionNavigationEnabled = settings.get(macosCtrlSuggestionNavigationEnabled);
    return overlayState.macosCtrlSuggestionNavigationEnabled;
  });

  function readOverlaySize(): void {
    overlayState.overlaySizeMode = settings.get(overlaySizeMode);
    overlayState.overlayCustomWidth = settings.get(overlayWidth);
    applyOverlaySizeForPageZoom(overlayState.overlay);
  }
  const initialOverlaySizeReady = loaded.then(() => {
    readOverlaySize();
    return overlayState.overlaySizeMode;
  });
  settings.follow([overlaySizeMode, overlayWidth], readOverlaySize);

  // The fonts are this device's own choice (installed faces).
  function readOverlayFonts(): void {
    overlayState.overlayFontFamily = settings.get(overlayFontFamily);
    overlayState.overlayFontFallback = settings.get(overlayFontFallback);
    applyOverlayFontFamily();
  }
  const initialOverlayFontFamilyReady = loaded.then(() => {
    readOverlayFonts();
    return overlayState.overlayFontFamily;
  });
  settings.follow([overlayFontFamily, overlayFontFallback], readOverlayFonts);

  void loaded.then(() => {
    overlayState.overlayTabScoreDebugEnabled = settings.get(tabRankScoreDebug);
  });
  settings.follow(tabRankScoreDebug, () => {
    overlayState.overlayTabScoreDebugEnabled = settings.get(tabRankScoreDebug);
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
