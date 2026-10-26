// The one state object options.ts shares with the modules split out of it:
// each module declares the slice it reads and writes, and this type is all
// of them together.
import type { SiteSearchProvider } from '../domain/search/types';
import type { SettingsStore } from '../platform/settings-store';
import type { ToastController } from '../shared/ui/toast-screen';
import type { TooltipController } from '../shared/ui/tooltip';
import type { AggregateSearchListState } from './options-aggregate-search-list';
import type { FormsState } from './options-forms';
import type { LanguageState } from './options-language';
import type { NavigationState } from './options-navigation';
import type { createPanelHeightAnimator } from './options-panel-motion';
import type { createSearchSourceOrderController } from './options-search-source-order';
import type { ShortcutReferenceState } from './options-shortcut-reference';
import type { createSiteSearchModel, EnqueueOperation } from './options-site-search';
import type { SiteSearchActionsState } from './options-site-search-actions';
import type { SiteSearchFormState } from './options-site-search-form';
import type { SiteSearchListState } from './options-site-search-list';
import type { TooltipsState } from './options-tooltips';
import type { ProviderStorageRuntime } from '../platform/settings-storage';

// What options.ts itself keeps beyond the modules' slices, and the full
// types of what the slices see only part of.
interface OptionsPageState {
  providerStorageRuntime: ProviderStorageRuntime;
  // The page's settings, read and followed through one store.
  settingsStore: SettingsStore;
  searchSourceOrderController: ReturnType<typeof createSearchSourceOrderController>;
  panelHeightAnimator: ReturnType<typeof createPanelHeightAnimator>;
  tooltipController: TooltipController;
}

type OptionsState =
  AggregateSearchListState &
  FormsState &
  LanguageState &
  NavigationState &
  ShortcutReferenceState &
  SiteSearchActionsState &
  SiteSearchFormState &
  SiteSearchListState &
  TooltipsState &
  OptionsPageState;

// What the state starts from: what the page made before it. Everything else
// starts empty or at its default.
interface OptionsStateParts {
  providerStorageRuntime: ProviderStorageRuntime;
  settingsStore: SettingsStore;
  siteSearchModel: ReturnType<typeof createSiteSearchModel>;
  enqueueSiteSearchProviderStorageOperation: EnqueueOperation;
  panelHeightAnimator: ReturnType<typeof createPanelHeightAnimator>;
  searchSourceOrderController: ReturnType<typeof createSearchSourceOrderController>;
  tooltipController: TooltipController;
  toastController: ToastController | null;
  isMacPlatform: boolean;
  fallbackSiteSearchProviders: SiteSearchProvider[];
}

function createOptionsState(parts: OptionsStateParts): OptionsState {
  return {
    // What the page made before the state.
    providerStorageRuntime: parts.providerStorageRuntime,
    settingsStore: parts.settingsStore,
    siteSearchModel: parts.siteSearchModel,
    enqueueSiteSearchProviderStorageOperation: parts.enqueueSiteSearchProviderStorageOperation,
    panelHeightAnimator: parts.panelHeightAnimator,
    searchSourceOrderController: parts.searchSourceOrderController,
    tooltipController: parts.tooltipController,
    toastController: parts.toastController,
    isMacPlatform: parts.isMacPlatform,
    fallbackSiteSearchProviders: parts.fallbackSiteSearchProviders,

    // Startup: select refreshes wait for the settings to be read.
    optionsStartupReadPending: true,
    optionsStartupRefreshCoalescing: true,
    optionsStartupRefreshDeferred: false,

    // Views made as the page mounts them.
    settingsNavigationController: null,
    siteSearchEngineBuiltinListController: null,
    siteSearchCustomListController: null,
    siteSearchBuiltinListController: null,
    siteSearchAiBuiltinListController: null,
    siteSearchFormController: null,
    themeSection: null,
    searchShortcutStatus: null,
    webDavSettingsController: null,

    // The page.
    currentLanguageMode: 'system',
    currentActiveSettingsTab: 'general',
    // A linked setting to scroll to once the lists have rendered.
    pendingOptionsScrollTarget: '',

    // Site searches and aggregate searches, empty until read.
    defaultSiteSearchProviders: [],
    customSiteSearchProviders: [],
    customSiteSearchProviderIdsReady: true,
    disabledSiteSearchKeys: new Set<string>(),
    // Whether the Help Center site search (lm) is on; unknown (null) until the providers load,
    // so the "ask in the search box" demo never shows for someone who turned it off.
    helpCenterSearchEnabled: null,
    siteSearchProvidersLoaded: false,
    aggregateSearches: [],
    siteSearchRefreshSuppressUntil: 0
  };
}

export { createOptionsState };
export type { OptionsPageState, OptionsState, OptionsStateParts };
