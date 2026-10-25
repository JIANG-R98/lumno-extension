// The one state object options.ts shares with the modules split out of it:
// each module declares the slice it reads and writes, and this type is all
// of them together.
import * as SETTINGS from '../domain/settings';
import type { SiteSearchProvider } from '../domain/search/types';
import type { BatchedStorageArea, ProviderStorageRuntime, StorageAreaFacade } from '../platform/settings-storage';
import type { ToastController } from '../shared/react/toast';
import type { TooltipController } from '../shared/ui/tooltip';
import type { AggregateSearchListState } from './options-aggregate-search-list';
import type { createBlacklistModel } from './options-blacklist';
import type { BlacklistListsState } from './options-blacklist-lists';
import type { ControlEventsState } from './options-control-events';
import type { FormsState } from './options-forms';
import type { LanguageState } from './options-language';
import type { NavigationState } from './options-navigation';
import type { NormalizersState } from './options-normalizers';
import type { createPanelHeightAnimator } from './options-panel-motion';
import type { PopconfirmState } from './options-popconfirm';
import type { createSearchSourceOrderController } from './options-search-source-order';
import type { SegmentedTabsState } from './options-segmented-tabs';
import type { SelectControlsState } from './options-select-controls';
import type { SettingBindsState } from './options-setting-binds';
import type { ShortcutReferenceState } from './options-shortcut-reference';
import type { createSiteSearchModel, EnqueueOperation } from './options-site-search';
import type { SiteSearchEventsState } from './options-site-search-events';
import type { SiteSearchFormState } from './options-site-search-form';
import type { SiteSearchListState } from './options-site-search-list';
import type { SliderControlsState } from './options-slider-controls';
import type { ToggleControlsState } from './options-toggle-controls';
import type { TooltipsState } from './options-tooltips';

// What options.ts itself keeps beyond the modules' slices, and the full
// types of what the slices see only part of.
interface OptionsPageState {
  providerStorageRuntime: ProviderStorageRuntime;
  searchSourceOrderController: ReturnType<typeof createSearchSourceOrderController>;
  panelHeightAnimator: ReturnType<typeof createPanelHeightAnimator>;
  tooltipController: TooltipController;
}

type OptionsState =
  AggregateSearchListState &
  BlacklistListsState &
  ControlEventsState &
  FormsState &
  LanguageState &
  NavigationState &
  NormalizersState &
  PopconfirmState &
  SegmentedTabsState &
  SelectControlsState &
  SettingBindsState &
  ShortcutReferenceState &
  SiteSearchEventsState &
  SiteSearchFormState &
  SiteSearchListState &
  SliderControlsState &
  ToggleControlsState &
  TooltipsState &
  OptionsPageState;

// What the state starts from: what the page made before it. Everything else
// starts empty or at its default.
interface OptionsStateParts {
  providerStorageRuntime: ProviderStorageRuntime;
  // The provider area, behind the startup read batch.
  storageArea: BatchedStorageArea;
  // The provider area itself, for writes.
  rawStorageArea: StorageAreaFacade;
  siteSearchModel: ReturnType<typeof createSiteSearchModel>;
  blacklistModel: ReturnType<typeof createBlacklistModel>;
  enqueueSiteSearchProviderStorageOperation: EnqueueOperation;
  panelHeightAnimator: ReturnType<typeof createPanelHeightAnimator>;
  searchSourceOrderController: ReturnType<typeof createSearchSourceOrderController>;
  tooltipController: TooltipController;
  toastController: ToastController | null;
  isMacPlatform: boolean;
  fallbackSiteSearchProviders: SiteSearchProvider[];
}

function createOptionsState(parts: OptionsStateParts): OptionsState {
  const blacklistModel = parts.blacklistModel;
  return {
    // What the page made before the state.
    providerStorageRuntime: parts.providerStorageRuntime,
    storageArea: parts.storageArea,
    rawStorageArea: parts.rawStorageArea,
    siteSearchModel: parts.siteSearchModel,
    blacklistModel,
    buildBlacklistItemKey: blacklistModel.buildItemKey,
    formatBlacklistPatternForDisplay: blacklistModel.formatPatternForDisplay,
    getBlacklistInputConfig: blacklistModel.getInputConfig,
    getBlacklistPatternInputValue: blacklistModel.getPatternInputValue,
    normalizeBlacklistItems: blacklistModel.normalizeItems,
    normalizeBlacklistMatchModes: blacklistModel.normalizeMatchModes,
    enqueueSiteSearchProviderStorageOperation: parts.enqueueSiteSearchProviderStorageOperation,
    panelHeightAnimator: parts.panelHeightAnimator,
    searchSourceOrderController: parts.searchSourceOrderController,
    tooltipController: parts.tooltipController,
    toastController: parts.toastController,
    isMacPlatform: parts.isMacPlatform,
    fallbackSiteSearchProviders: parts.fallbackSiteSearchProviders,

    // Startup: storage reads are batched, and select refreshes wait for them.
    optionsStartupStorageBatchPending: true,
    optionsStartupRefreshCoalescing: true,
    optionsStartupRefreshDeferred: false,

    // Views made as the page mounts them.
    settingsNavigationController: null,
    recentModeTabsController: null,
    overlaySizeTabsController: null,
    overlayEnterAnimationTabsController: null,
    newtabWidthTabsController: null,
    newtabTopContentTabsController: null,
    newtabTimeInkTabsController: null,
    newtabGlassThemeTabsController: null,
    restrictedActionTabsController: null,
    searchResultPriorityTabsController: null,
    siteSearchEngineBuiltinListController: null,
    siteSearchCustomListController: null,
    siteSearchBuiltinListController: null,
    siteSearchAiBuiltinListController: null,
    siteSearchFormController: null,
    searchBlacklistFormController: null,
    faviconBlacklistFormController: null,
    themeSection: null,
    fallbackShortcutSection: null,
    webDavSettingsController: null,
    // Set once the daily quote rows are wired; language refreshes may run earlier.
    dailyQuoteSettings: null,

    // The page.
    currentLanguageMode: 'system',
    currentActiveSettingsTab: 'general',
    // A linked setting to scroll to once the lists have rendered.
    pendingOptionsScrollTarget: '',
    activePopconfirm: null,

    // Site searches, aggregate searches and blacklists, empty until read.
    defaultSiteSearchProviders: [],
    customSiteSearchProviders: [],
    customSiteSearchProviderIdsReady: true,
    disabledSiteSearchKeys: new Set<string>(),
    // Whether the Help Center site search (lm) is on; unknown (null) until the providers load,
    // so the "ask in the search box" demo never shows for someone who turned it off.
    helpCenterSearchEnabled: null,
    siteSearchProvidersLoaded: false,
    aggregateSearches: [],
    editingSiteSearchKey: null,
    siteSearchDraftCategory: 'site',
    siteSearchFormExpanded: false,
    siteSearchRefreshSuppressUntil: 0,
    searchBlacklistItems: [],
    faviconRequestBlacklistItems: [],

    // Settings, at their defaults until storage answers.
    currentRecentMode: 'most',
    currentNewtabWidthMode: 'wide',
    currentOverlaySizeMode: 'standard',
    currentOverlayWidth: null,
    currentOverlayEnterAnimation: 'elastic',
    // Empty means the bundled Lumno Open Sans stack.
    currentOverlayFontFamily: '',
    currentOverlayFontFallback: '',
    // Display names of the chosen families, so a face uninstalled since is
    // still named in the missing-font notice.
    currentOverlayFontLabels: {},
    // The installed families once the list is read. Null until then (and on
    // Firefox), so nothing is reported missing before it can be checked.
    installedOverlayFontFamilies: null,
    currentRestrictedAction: 'default',
    currentSearchResultPriority: 'autocomplete',
    currentSearchResultDisplayLimit: 10,
    currentRecentCount: 4,
    currentBookmarkCount: 8,
    currentBookmarkColumns: 6,
    currentNewtabTopContentMode: 'brand',
    currentNewtabTimeFontWeight: SETTINGS.NEWTAB_TIME_FONT_WEIGHT_DEFAULT,
    currentNewtabTimeFontSize: SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT,
    currentNewtabTimeOpacity: SETTINGS.NEWTAB_TIME_OPACITY_DEFAULT,
    currentNewtabTimeInk: SETTINGS.NEWTAB_TIME_INK_DEFAULT,
    currentNewtabGlassStyle: 'none',
    currentNewtabGlassTheme: 'follow',
    currentNewtabTimeFont: SETTINGS.NEWTAB_TIME_FONT_DEFAULT,
    currentNewtabShortcutColumns: SETTINGS.NEWTAB_SHORTCUT_COLUMNS_DEFAULT,
    currentNewtabShortcutSize: SETTINGS.NEWTAB_SHORTCUT_SIZE_DEFAULT,
    currentNewtabShortcutGap: SETTINGS.NEWTAB_SHORTCUT_GAP_DEFAULT
  };
}

export { createOptionsState };
export type { OptionsPageState, OptionsState, OptionsStateParts };
