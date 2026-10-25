import * as LumnoNewtabShortcutsStore from '../domain/shortcuts-store';
import * as LumnoBlacklistUtils from '../domain/blacklist-utils';
import * as COMMUNITY_LINKS from '../platform/community-links';
import * as NAVIGATION_DISPOSITION from '../domain/navigation-disposition';
import * as AGGREGATE_SEARCH_STORE from '../domain/search/aggregate-search-store';
import * as SEARCH_UTILS from '../domain/search/search-utils';
import * as SETTINGS from '../domain/settings';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import * as LumnoShortcutDisplay from '../domain/shortcut-display';
import * as LumnoTooltip from '../shared/ui/tooltip';
import * as OPTIONS_ACCOUNT_SECTION from './options-account-section';
import * as OPTIONS_APPEARANCE_GLOBAL_SECTION from './options-appearance-global-section';
import * as OPTIONS_APPEARANCE_NEWTAB_LOOK_SECTION from './options-appearance-newtab-look-section';
import * as OPTIONS_APPEARANCE_OVERLAY_SECTION from './options-appearance-overlay-section';
import { listInstalledFonts } from './options-installed-fonts';
import * as OPTIONS_AGGREGATE_SEARCH_LIST from './options-aggregate-search-list';
import * as AGGREGATE_SEARCH from './options-aggregate-search';
import * as OPTIONS_BLACKLIST_SECTION from './options-blacklist-section';
import * as LumnoOptionsBlacklist from './options-blacklist';
import * as OPTIONS_CONTROL_EVENTS from './options-control-events';
import * as LumnoOptionsFeedbackSupportSection from './options-feedback-support';
import * as OPTIONS_FORMS from './options-forms';
import * as OPTIONS_GENERAL_FEATURES_SECTION from './options-general-features-section';
import * as OPTIONS_GENERAL_GLOBAL_SECTION from './options-general-global-section';
import * as OPTIONS_GENERAL_NEWTAB_SECTION from './options-general-newtab-section';
import * as OPTIONS_GENERAL_SEARCH_SECTION from './options-general-search-section';
import * as OPTIONS_GENERAL_SHORTCUTS_SECTION from './options-general-shortcuts-section';
import * as OPTIONS_GENERAL_TAB from './options-general-tab';
import * as OPTIONS_LABS_SECTION from './options-labs-section';
import * as OPTIONS_LANGUAGE from './options-language';
import * as OPTIONS_NAVIGATION from './options-navigation';
import * as OPTIONS_NORMALIZERS from './options-normalizers';
import * as PANEL_MOTION from './options-panel-motion';
import * as LumnoOptionsSearchSourceOrder from './options-search-source-order';
import * as OPTIONS_SEGMENTED_TABS from './options-segmented-tabs';
import * as OPTIONS_SELECT_CONTROLS from './options-select-controls';
import * as SETTING_BINDINGS from './options-setting-bindings';
import * as OPTIONS_SETTING_BINDS from './options-setting-binds';
import * as OPTIONS_SHORTCUT_REFERENCE from './options-shortcut-reference';
import * as OPTIONS_SHORTCUTS_SECTION from './options-shortcuts-section';
import * as OPTIONS_SEARCH_SHORTCUT_STATUS from './options-search-shortcut-status';
import * as OPTIONS_SITE_SEARCH_ACTIONS from './options-site-search-actions';
import * as OPTIONS_SITE_SEARCH_FORM from './options-site-search-form';
import * as OPTIONS_SITE_SEARCH_LIST from './options-site-search-list';
import * as SITE_SEARCH from './options-site-search';
import * as OPTIONS_SLIDER_CONTROLS from './options-slider-controls';
import * as LumnoOptionsSyncTransfer from './options-sync-transfer';
import * as THEME from './options-theme';
import * as OPTIONS_TOGGLE_CONTROLS from './options-toggle-controls';
import * as OPTIONS_TOOLTIPS from './options-tooltips';
import * as LumnoOptionsTranslationHelpSection from './options-translation-help';
import * as LumnoOptionsDiagnostics from './options-diagnostics';
import * as LumnoBrowserProfile from '../platform/browser-profile';
import * as LumnoMessaging from '../platform/messaging';
import type { StorageChangeListener } from '../domain/storage-port';
import type { ReadBatchMetrics } from '../platform/settings-storage';
import { getHtmlElement, getHtmlTag, queryHtmlElement, queryHtmlElements } from '../shared/dom-lookup';
import type { LayoutMutation } from './options-panel-motion';
import * as OPTIONS_STATE from './options-state';

(function() {
  const optionsRuntimeStartedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  let optionsReadyMarked = false;

  function markOptionsPerformance(name: string): void {
    try {
      if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
        performance.mark(name);
      }
    } catch (e) {
      // Performance markers are diagnostics only.
    }
  }

  markOptionsPerformance('lumno-options-runtime-start');
  if (document.documentElement) {
    document.documentElement.setAttribute('data-lumno-options-runtime-started', 'true');
  }

  const panel = getHtmlElement(document, '_x_extension_settings_panel_2024_unique_');
  const optionsRoot = getHtmlElement(document, '_x_extension_options_root_2024_unique_');
  const tabsRow = queryHtmlElement(document, '._x_extension_settings_tabs_row_2024_unique_');
  const tabButtons = queryHtmlElements(document, '._x_extension_settings_tab_button_2024_unique_');
  const tabContents = queryHtmlElements(document, '._x_extension_settings_content_2024_unique_');
  const tabsContainer = getHtmlElement(document, '_x_extension_settings_tabs_2024_unique_');
  const settingsVersion = getHtmlElement(document, '_x_extension_settings_version_2024_unique_');
  const recentModeSelect = getHtmlTag(document, '_x_extension_recent_mode_select_2024_unique_', 'select');
  const recentModeTabButtons = queryHtmlElements(document, 'button[data-recent-mode]');
  const recentModeTabsWrap = getHtmlElement(document, '_x_extension_recent_mode_tabs_wrap_2024_unique_');
  const recentCountControlHost = getHtmlElement(document, '_x_extension_recent_count_control_2026_unique_');
  const bookmarkRowsControlHost = getHtmlElement(document, '_x_extension_bookmark_rows_control_2026_unique_');
  const bookmarkColumnsSettingRow = getHtmlElement(document, '_x_extension_bookmark_columns_setting_row_2026_unique_');
  const bookmarkColumnsControlHost = getHtmlElement(document, '_x_extension_bookmark_columns_control_2026_unique_');
  const bookmarkFolderIconsVisibleRow = getHtmlElement(document, '_x_extension_bookmark_folder_icons_visible_row_2026_unique_');
  const newtabShortcutsToggle = getHtmlTag(document, '_x_extension_newtab_shortcuts_toggle_2026_unique_', 'input');
  const newtabShortcutAddRow = getHtmlElement(document, '_x_extension_newtab_shortcut_add_row_2026_unique_');
  const newtabShortcutAddToggle = getHtmlTag(document, '_x_extension_newtab_shortcut_add_toggle_2026_unique_', 'input');
  const newtabShortcutDockMagnificationRow = getHtmlElement(document, '_x_extension_newtab_shortcut_dock_magnification_row_2026_unique_');
  const newtabShortcutDockMagnificationToggle = getHtmlTag(document, '_x_extension_newtab_shortcut_dock_magnification_toggle_2026_unique_', 'input');
  const newtabShortcutColumnsRow = getHtmlElement(document, '_x_extension_newtab_shortcut_columns_setting_row_2026_unique_');
  const newtabShortcutColumnsControlHost = getHtmlElement(document, '_x_extension_newtab_shortcut_columns_control_2026_unique_');
  const newtabShortcutSizeRow = getHtmlElement(document, '_x_extension_newtab_shortcut_size_setting_row_2026_unique_');
  const newtabShortcutSizeControlHost = getHtmlElement(document, '_x_extension_newtab_shortcut_size_control_2026_unique_');
  const newtabShortcutGapRow = getHtmlElement(document, '_x_extension_newtab_shortcut_gap_setting_row_2026_unique_');
  const newtabShortcutGapControlHost = getHtmlElement(document, '_x_extension_newtab_shortcut_gap_control_2026_unique_');
  const bookmarkRowsInfoHost = getHtmlElement(document, '_x_extension_bookmark_rows_info_2026_unique_');
  const bookmarkColumnsInfoHost = getHtmlElement(document, '_x_extension_bookmark_columns_info_2026_unique_');
  const toastElement = getHtmlElement(document, '_x_extension_toast_2024_unique_');
  if (!panel || !optionsRoot || tabButtons.length === 0) {
    return;
  }
  // The React views, set by the options islands bundle that loads first.
  const optionsBlacklistTabApi = globalThis.LumnoOptionsBlacklistTab;
  const optionsAccountTabApi = globalThis.LumnoOptionsAccountTab;
  const optionsShortcutsTabApi = globalThis.LumnoOptionsShortcutsTab;
  const optionsInfoButtonApi = globalThis.LumnoOptionsInfoButton;
  const optionsToastApi = globalThis.LumnoOptionsToast;
  const optionsSegmentedControlApi = globalThis.LumnoOptionsSegmentedControl;
  const optionsSettingsControlsApi = globalThis.LumnoOptionsSettingsControls;
  const optionsSettingsNavigationApi = globalThis.LumnoOptionsSettingsNavigation;
  if (!optionsAccountTabApi || !optionsBlacklistTabApi || !optionsShortcutsTabApi ||
      !optionsInfoButtonApi || !optionsSegmentedControlApi ||
      !optionsSettingsControlsApi || !optionsSettingsNavigationApi) {
    console.warn('Lumno: options views not available.');
    return;
  }
  // Narrowed here, for the functions below.
  const infoButtonApi = optionsInfoButtonApi;
  const segmentedControlApi = optionsSegmentedControlApi;



  const {
    THEME_STORAGE_KEY,
    LANGUAGE_STORAGE_KEY,
    RECENT_MODE_STORAGE_KEY,
    RECENT_COUNT_STORAGE_KEY,
    BOOKMARK_COUNT_STORAGE_KEY,
    BOOKMARK_COLUMNS_STORAGE_KEY,
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
    NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
    NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
    NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
    NEWTAB_SHORTCUT_WIDTH_MIN,
    NEWTAB_SHORTCUT_WIDTH_MAX,
    NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
    NEWTAB_SHORTCUT_COLUMNS_MIN,
    NEWTAB_SHORTCUT_COLUMNS_MAX,
    NEWTAB_SHORTCUT_COLUMNS_DEFAULT,
    NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
    NEWTAB_SHORTCUT_SIZE_MIN,
    NEWTAB_SHORTCUT_SIZE_MAX,
    NEWTAB_SHORTCUT_SIZE_DEFAULT,
    NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
    NEWTAB_SHORTCUT_GAP_MIN,
    NEWTAB_SHORTCUT_GAP_MAX,
    NEWTAB_SHORTCUT_GAP_DEFAULT,
    FALLBACK_SHORTCUT_STORAGE_KEY,
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    AGGREGATE_SEARCH_STORAGE_KEY,
    SYNC_META_STORAGE_KEY
  } = SETTINGS;
  // Device-only values (the language copy, the shortcut overflow, WebDAV
  // status) and the local-to-sync migration always use chrome.storage.local,
  // whichever area holds the synced settings.
  const localStorageArea = chrome && chrome.storage ? chrome.storage.local || null : null;

  // The provider area, and the read batch that serves the startup reads in one go.
  const { runtime: providerStorageRuntime, area: rawStorageArea } = LumnoSettingsStorage.getProviderStorage(chrome);
  const startupStorageReadBatch = LumnoSettingsStorage.createStorageReadBatch(rawStorageArea);
  if (!startupStorageReadBatch) {
    return;
  }
  const SYNC_KEYS = SETTINGS.CHROME_SYNC_STORAGE_KEYS;
  const SEARCH_SOURCE_ORDER_STORAGE_KEY = SETTINGS.SEARCH_SOURCE_ORDER_STORAGE_KEY;
  // Page state shared with the parts of this page split out into
  // src/options/: each receives this one object as `optionsState` and reads
  // and writes the same properties this file does.
  const optionsState = OPTIONS_STATE.createOptionsState({
    providerStorageRuntime,
    storageArea: startupStorageReadBatch.area,
    rawStorageArea,
    siteSearchModel: SITE_SEARCH.createSiteSearchModel({
      searchUtils: SEARCH_UTILS,
      aggregateSearchStore: AGGREGATE_SEARCH_STORE
    }),
    enqueueSiteSearchProviderStorageOperation: SITE_SEARCH.createOperationQueue(),
    panelHeightAnimator: PANEL_MOTION.createPanelHeightAnimator({
      documentObj: document,
      panel,
      reserveHost: optionsRoot,
      windowObj: window
    }),
    searchSourceOrderController: LumnoOptionsSearchSourceOrder.createSearchSourceOrderController({
      getMessage: (key, fallback) => getMessage(key, fallback),
      showToast: (message, isError) => showToast(message, isError),
      read: () => LumnoSettingsStorage.readStorageValue(startupStorageReadBatch.area, chrome, SEARCH_SOURCE_ORDER_STORAGE_KEY),
      write: (value) => LumnoSettingsStorage.writeStorageValue(
        rawStorageArea,
        chrome,
        SEARCH_SOURCE_ORDER_STORAGE_KEY,
        value
      ),
      onChange() {
        if (optionsState.siteSearchProvidersLoaded) {
          renderSiteSearchList();
        }
        renderAggregateSearchList();
        generalSearchSection.render();
      }
    }),
    tooltipController: LumnoTooltip.createController({
      documentObj: document,
      windowObj: window,
      id: '_x_extension_options_tooltip_2026_unique_',
      appendTo: document.body,
      maxWidth: 'min(360px, calc(100vw - 24px))'
    }),
    toastController: optionsToastApi
      ? optionsToastApi.createToastController(toastElement, {
        windowObj: window,
        duration: 2200
      })
      : null,
    isMacPlatform: LumnoShortcutDisplay.getNavigatorPlatform(navigator) === 'mac',
    fallbackSiteSearchProviders: SEARCH_UTILS.getDefaultSiteSearchProviders()
  });


  const {
    getMenuViewportTopInset,
    optionsSelectControlRecords,
    registerOptionsSelectControl,
    renderOptionsSelectControl,
    setOptionsSelectState
  } = OPTIONS_SELECT_CONTROLS.createSelectControls({
    tabsRow,
    getMessage: (key, fallback) => getMessage(key, fallback)
  });

  const {
    showTooltipFor,
    initTooltips,
    refreshCustomSelects,
    showToast,
    beginToast
  } = OPTIONS_TOOLTIPS.createTooltips({
    renderSettingsForms: (...args) => renderSettingsForms(...args),
    toastElement,
    optionsSelectControlRecords,
    renderOptionsSelectControl,
    optionsState
  });



  const {
    normalizeSiteSearchTemplate,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    normalizeSiteSearchProvider,
    findSiteSearchKeyConflict,
    suspendSiteSearchRefresh
  } = OPTIONS_SITE_SEARCH_FORM.createSiteSearchForm({
    SEARCH_UTILS,
    optionsState
  });
  // The keys each list shows right now, in order, for the move buttons.
  const renderedSearchSourceKeys: Record<string, string[]> = {};

  const {
    getLocalizedBuiltinProviderName,
    getSiteSearchItemIconUrl,
    getSearchSourceReorderCopy,
    locateBuiltinSiteSearchProvider,
    handleSiteSearchProviderSave,
    renderSiteSearchList,
    loadDefaultSiteSearchProviders,
    loadCustomSiteSearchProviders,
    saveDisabledSiteSearchKeys,
    saveSiteSearchProviderState,
    invalidateSiteSearchProviderRefresh,
    refreshSiteSearchProviders
  } = OPTIONS_SITE_SEARCH_LIST.createSiteSearchList({
    SEARCH_UTILS,
    getMessage: (...args) => getMessage(...args),
    normalizeSiteSearchTemplate,
    isSearchEngineSiteSearchProvider,
    isAiSiteSearchProvider,
    renderedSearchSourceKeys,
    suspendSiteSearchRefresh,
    createPersistentId,
    findSiteSearchKeyConflict,
    getSiteSearchErrorMessage: (...args) => getSiteSearchErrorMessage(...args),
    applySavedSiteSearchProviders: (...args) => applySavedSiteSearchProviders(...args),
    renderAggregateSearchList: (...args) => renderAggregateSearchList(...args),
    showToast,
    getActiveBuiltinSiteSearchProviders: (...args) => getActiveBuiltinSiteSearchProviders(...args),
    renderFeedbackSupport,
    initTooltips,
    scrollToOptionsTarget: (...args) => scrollToOptionsTarget(...args),
    normalizeSiteSearchProvider,
    SITE_SEARCH_STORAGE_KEY,
    getSiteSearchBuiltinKey: (...args) => getSiteSearchBuiltinKey(...args),
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    SITE_SEARCH,
    optionsState
  });

  const {
    renderSettingsNavigation,
    setActiveTab,
    handleSettingsTabSelection,
    updateTabsStickyVisualState,
    scheduleOptionsScrollRefresh,
    scheduleOptionsViewportLayoutRefresh,
    getOptionsRouteState,
    scrollToOptionsTarget
  } = OPTIONS_NAVIGATION.createNavigation({
    getMessage: (...args) => getMessage(...args),
    tabContents,
    refreshSiteSearchProviders,
    tabsRow,
    optionsState
  });

  const siteSearchActions = OPTIONS_SITE_SEARCH_ACTIONS.createSiteSearchActions({
    getMessage: (...args) => getMessage(...args),
    getSiteSearchBuiltinKey: (...args) => getSiteSearchBuiltinKey(...args),
    saveSiteSearchProviderState,
    saveDisabledSiteSearchKeys,
    refreshSiteSearchProviders,
    renderSiteSearchList,
    renderAggregateSearchList: () => renderAggregateSearchList(),
    showToast,
    loadDefaultSiteSearchProviders,
    loadCustomSiteSearchProviders,
    optionsState
  });

  const {
    getMessage,
    normalizeLocale,
    getSystemLocale,
    normalizeLanguageMode,
    applyLanguageMode,
    loadLocaleMessages
  } = OPTIONS_LANGUAGE.createLanguage({
    formatTemplate: (...args) => formatTemplate(...args),
    formatShortcutForDisplay: (...args) => formatShortcutForDisplay(...args),
    SETTINGS,
    LANGUAGE_STORAGE_KEY,
    localStorageArea,
    renderOptionsInfoButtons,
    renderFeedbackSupport,
    renderTranslationHelp,
    refreshCustomSelects,
    refreshSyncStatus,
    renderShortcutReferenceList: (...args) => renderShortcutReferenceList(...args),
    setRecentModeTabState: (...args) => setRecentModeTabState(...args),
    renderNewtabShortcutColumnsControl: (...args) => renderNewtabShortcutColumnsControl(...args),
    renderNewtabShortcutSizeControl: (...args) => renderNewtabShortcutSizeControl(...args),
    renderNewtabShortcutGapControl: (...args) => renderNewtabShortcutGapControl(...args),
    syncNewtabShortcutSubcontrolAvailability: (...args) => syncNewtabShortcutSubcontrolAvailability(...args),
    renderRecentCountControl: (...args) => renderRecentCountControl(...args),
    renderBookmarkRowsControl: (...args) => renderBookmarkRowsControl(...args),
    renderBookmarkColumnsControl: (...args) => renderBookmarkColumnsControl(...args),
    renderSettingsNavigation,
    onLanguageApplied: (mode, locale) => generalGlobalSection.setLanguage(mode, locale),
    renderTabSections: () => {
      generalGlobalSection.render();
      generalFeaturesSection.render();
      generalSearchSection.render();
      generalNewtabSection.render();
      generalShortcutsSection.render();
      appearanceGlobalSection.render();
      appearanceOverlaySection.render();
      appearanceNewtabLookSection.render();
      labsSection.render();
      blacklistSection.render();
    },
    renderSiteSearchList,
    renderAggregateSearchList: (...args) => renderAggregateSearchList(...args),
    optionsState
  });

  const {
    formatTemplate,
    renderSettingsForms,
    handleReactSiteSearchFormSave,
    getSiteSearchErrorMessage,
    applySavedSiteSearchProviders
  } = OPTIONS_FORMS.createForms({
    getMessage,
    suspendSiteSearchRefresh,
    createPersistentId,
    findSiteSearchKeyConflict,
    saveSiteSearchProviderState,
    refreshSiteSearchProviders,
    renderSiteSearchList,
    showToast,
    optionsState
  });

  const shortcutDisplay = LumnoShortcutDisplay;
  const diagnosticsExport = LumnoOptionsDiagnostics.createDiagnosticsExport({
    chromeApi: chrome,
    documentObj: document,
    getPrimaryAreaName: () => getActivePrimaryAreaName(),
    getSettingsArea: () => optionsState.storageArea,
    getVersion: () => chrome?.runtime?.getManifest?.()?.version || '',
    localArea: localStorageArea,
    navigatorObj: navigator,
    settingKeys: SETTINGS.CHROME_SYNC_STORAGE_KEYS
  });
  const generalTab = OPTIONS_GENERAL_TAB.createGeneralTab(optionsSettingsControlsApi.createGeneralTabController(
    queryHtmlElement(document, '._x_extension_settings_content_2024_unique_[data-content="general"]')
  ));
  const generalGlobalSection = OPTIONS_GENERAL_GLOBAL_SECTION.createGeneralGlobalSection({
    view: generalTab.global,
    storageArea: optionsState.storageArea,
    SETTINGS,
    runtime: chrome.runtime,
    getMessage,
    showToast,
    applyLanguage: (mode) => applyLanguageMode(mode, { persist: true }),
    getViewportTopInset: getMenuViewportTopInset
  });
  const feedbackSupportSection = LumnoOptionsFeedbackSupportSection.createFeedbackSupportSection({
    communityLinks: COMMUNITY_LINKS,
    controller: generalGlobalSection.feedback,
    exportDiagnostics: () => diagnosticsExport.exportReport().then(
      () => showToast(getMessage('settings_diagnostics_export_done', '已导出诊断信息'), false),
      (error) => {
        console.warn('[Lumno] Could not export diagnostics.', error);
        showToast(getMessage('settings_diagnostics_export_failed', '诊断信息导出失败'), true);
      }
    ),
    licensesLink: generalGlobalSection.licensesLink,
    getLocale: () => (optionsState.currentLanguageMode === 'system' ? getSystemLocale() : normalizeLocale(optionsState.currentLanguageMode)),
    getMessage,
    helpIconUrl: chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL('assets/images/site-search/glyph-lm.png')
      : '../../assets/images/site-search/glyph-lm.png',
    isHelpCenterSearchEnabled: () => optionsState.helpCenterSearchEnabled === true
  });
  const translationHelpSection = LumnoOptionsTranslationHelpSection.createTranslationHelpSection({
    controller: generalGlobalSection.translationHelp,
    documentObj: document,
    formatTemplate: (...args) => formatTemplate(...args),
    getIssueUrl: () => COMMUNITY_LINKS.getLinks().githubIssue,
    getLocale: () => (optionsState.currentLanguageMode === 'system' ? getSystemLocale() : normalizeLocale(optionsState.currentLanguageMode)),
    getMessage,
    loadLocaleMessages,
    uiLocales: SETTINGS.UI_LOCALES,
    version: chrome?.runtime?.getManifest?.()?.version || ''
  });
  function createOptionsInfoButtonController(host: HTMLElement | null) {
    return infoButtonApi.createInfoButtonController(host);
  }
  const bookmarkRowsInfoController = createOptionsInfoButtonController(bookmarkRowsInfoHost);
  const bookmarkColumnsInfoController = createOptionsInfoButtonController(bookmarkColumnsInfoHost);
  function createOptionsSegmentedControlController(host: HTMLElement | null, kind: string, onSelect: (value: string) => void) {
    return segmentedControlApi.createSegmentedControlController(host, {
      kind,
      onSelect
    });
  }

  const {
    setRecentModeTabState,
    updateRecentModeTabsVisibility,
    handleRecentModeSelection
  } = OPTIONS_SEGMENTED_TABS.createSegmentedTabs({
    getMessage,
    animateOptionsPanelHeight,
    setConditionalSettingsElementVisibility: (...args) => setConditionalSettingsElementVisibility(...args),
    recentModeTabsWrap,
    notifyNewtabSectionsRefresh,
    recentModeSelect,
    RECENT_MODE_STORAGE_KEY,
    optionsState
  });

  optionsState.recentModeTabsController = createOptionsSegmentedControlController(
    recentModeTabsWrap,
    'recent-mode',
    handleRecentModeSelection
  );

  const {
    normalizeBookmarkCount,
    normalizeRecentCount,
    normalizeBookmarkColumns,
    updateBookmarkColumnsSettingVisibility,
    normalizeNewtabShortcutsVisible,
    normalizeNewtabShortcutAddVisible,
    normalizeNewtabShortcutDockMagnificationEnabled,
    normalizeNewtabShortcutColumns,
    normalizeNewtabShortcutSize,
    normalizeNewtabShortcutGap,
    inferNewtabShortcutColumnsFromWidth
  } = OPTIONS_NORMALIZERS.createNormalizers({
    SETTINGS,
    bookmarkColumnsSettingRow,
    animateOptionsPanelHeight,
    setConditionalSettingsElementVisibility: (...args) => setConditionalSettingsElementVisibility(...args),
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
    NEWTAB_SHORTCUT_WIDTH_MAX
  });


  // Drawn before the switches below are set up, which mark the rows this
  // browser cannot honor.
  const generalFeaturesSection = OPTIONS_GENERAL_FEATURES_SECTION.createGeneralFeaturesSection({
    view: generalTab.features,
    storageArea: optionsState.storageArea,
    SETTINGS,
    getMessage,
    browserFamily: document.documentElement.getAttribute('data-browser-family') || '',
    getAssetUrl: (path) => chrome.runtime.getURL(path),
    getViewportTopInset: getMenuViewportTopInset,
    getTabSwitcherShortcut: () => LumnoShortcutDisplay.formatShortcutChord('Alt+Q', {
      platform: optionsState.isMacPlatform ? 'mac' : 'windows'
    }) || (optionsState.isMacPlatform ? '⌥Q' : 'Alt+Q')
  });
  const generalShortcutsSection = OPTIONS_GENERAL_SHORTCUTS_SECTION.createGeneralShortcutsSection({
    view: generalTab.shortcuts,
    storageArea: optionsState.storageArea,
    SETTINGS,
    runtime: chrome.runtime,
    getMessage,
    showToast
  });
  const generalNewtabSection = OPTIONS_GENERAL_NEWTAB_SECTION.createGeneralNewtabSection({
    view: generalTab.newtab,
    storageArea: optionsState.storageArea,
    SETTINGS,
    getMessage
  });
  const generalSearchSection = OPTIONS_GENERAL_SEARCH_SECTION.createGeneralSearchSection({
    view: generalTab.search,
    storageArea: optionsState.storageArea,
    SETTINGS,
    orderController: optionsState.searchSourceOrderController,
    getMessage,
    getViewportTopInset: getMenuViewportTopInset,
    hideTooltip: () => optionsState.tooltipController.hide()
  });
  const appearanceGlobalHost = getHtmlElement(document, '_x_extension_appearance_global_section_2026_unique_');
  const appearanceGlobalSection = OPTIONS_APPEARANCE_GLOBAL_SECTION.createAppearanceGlobalSection({
    view: (handlers) => optionsSettingsControlsApi.createAppearanceGlobalSectionController(appearanceGlobalHost, handlers),
    storageArea: optionsState.storageArea,
    SETTINGS,
    getMessage,
    onTheme(mode, button) {
      playThemeOptionClickEffect(button);
      setThemeMode(mode);
    }
  });
  const appearanceOverlayHost = getHtmlElement(document, '_x_extension_appearance_overlay_section_2026_unique_');
  const appearanceOverlaySection = OPTIONS_APPEARANCE_OVERLAY_SECTION.createAppearanceOverlaySection({
    view: (handlers) => optionsSettingsControlsApi.createAppearanceOverlaySectionController(appearanceOverlayHost, handlers),
    storageArea: optionsState.storageArea,
    localStorageArea,
    SETTINGS,
    getMessage,
    formatTemplate: (text, params) => formatTemplate(text, params),
    browserFamily: document.documentElement.getAttribute('data-browser-family') || '',
    listInstalledFonts,
    getViewportTopInset: getMenuViewportTopInset
  });
  const appearanceNewtabLookHost = getHtmlElement(document, '_x_extension_appearance_newtab_look_section_2026_unique_');
  const appearanceNewtabLookSection = OPTIONS_APPEARANCE_NEWTAB_LOOK_SECTION.createAppearanceNewtabLookSection({
    view: (handlers) => optionsSettingsControlsApi.createSettingsSectionController(appearanceNewtabLookHost, handlers),
    storageArea: optionsState.storageArea,
    SETTINGS,
    getMessage,
    notifyNewtabSectionsRefresh: (section) => notifyNewtabSectionsRefresh(section),
    getViewportTopInset: getMenuViewportTopInset
  });
  const labsSection = OPTIONS_LABS_SECTION.createLabsSection({
    host: queryHtmlElement(document, '._x_extension_settings_content_2024_unique_[data-content="labs"]'),
    optionsSettingsControlsApi,
    storageArea: optionsState.storageArea,
    SETTINGS,
    getMessage,
    browserFamily: document.documentElement.getAttribute('data-browser-family') || ''
  });
  const blacklistSection = OPTIONS_BLACKLIST_SECTION.createBlacklistSection({
    host: queryHtmlElement(document, '._x_extension_settings_content_2024_unique_[data-content="blacklist"]'),
    blacklistTabApi: optionsBlacklistTabApi,
    storageArea: optionsState.storageArea,
    SETTINGS,
    blacklistModel: LumnoOptionsBlacklist.createBlacklistModel({
      blacklistUtils: LumnoBlacklistUtils
    }),
    getMessage,
    showToast,
    notifyNewtabSectionsRefresh,
    initTooltips
  });

  const {
    registerOptionsToggleControl,
    setOptionsToggleState,
    TOGGLE_SETTINGS,
    toggleSettingControls
  } = OPTIONS_TOGGLE_CONTROLS.createToggleControls({
    optionsSettingsControlsApi,
    SETTINGS,
    syncNewtabShortcutSubcontrolAvailability: (...args) => syncNewtabShortcutSubcontrolAvailability(...args),
    getMessage
  });

  optionsState.settingsNavigationController = optionsSettingsNavigationApi.createSettingsNavigationController(tabsContainer, {
      onSelect: handleSettingsTabSelection
    });
  // Each Search sources list orders on its own; the record keys them by list.
  // The search source order list each site search list sorts by.
  function getSiteSearchListOptions(listId: 'custom' | 'site' | 'ai' | 'engine') {
    return {
      onLocateDuplicate: locateBuiltinSiteSearchProvider,
      onMove: (fromIndex: number, toIndex: number) => optionsState.searchSourceOrderController.moveListItem(
        listId,
        renderedSearchSourceKeys[listId] || [],
        fromIndex,
        toIndex
      ),
      onRemove: (key: string, isBuiltin: boolean) => siteSearchActions.removeSiteSearchItem(key, isBuiltin),
      onSave: handleSiteSearchProviderSave
    };
  }
  const shortcutsSection = OPTIONS_SHORTCUTS_SECTION.createShortcutsSection({
    host: queryHtmlElement(document, '._x_extension_settings_content_2024_unique_[data-content="shortcuts"]'),
    shortcutsTabApi: optionsShortcutsTabApi,
    getMessage,
    orderController: optionsState.searchSourceOrderController,
    storageArea: optionsState.storageArea,
    SETTINGS,
    deriveLegacyAutoGroupEnabled: (value) => deriveLegacyAggregateSearchAutoGroupEnabled(value),
    refreshCustomSelects,
    initTooltips,
    handlers: {
      custom: getSiteSearchListOptions('custom'),
      sites: getSiteSearchListOptions('site'),
      ai: getSiteSearchListOptions('ai'),
      engines: getSiteSearchListOptions('engine'),
      aggregate: {
        onMove: (fromIndex, toIndex) => optionsState.searchSourceOrderController.moveListItem(
          'aggregate',
          renderedSearchSourceKeys.aggregate || [],
          fromIndex,
          toIndex
        ),
        onRemove: (id) => handleAggregateSearchRemove(id),
        onSave: (id, draft) => handleAggregateSearchSave(id, draft)
      },
      onAddSiteSearch: handleReactSiteSearchFormSave,
      onClearCustom: () => siteSearchActions.clearCustomSiteSearches(),
      onClearAggregates: () => handleAggregateSearchClear(),
      onResetBuiltin: () => siteSearchActions.resetBuiltinSiteSearches()
    }
  });
  optionsState.siteSearchCustomListController = shortcutsSection.customList;
  optionsState.siteSearchEngineBuiltinListController = shortcutsSection.enginesList;
  optionsState.siteSearchBuiltinListController = shortcutsSection.sitesList;
  optionsState.siteSearchAiBuiltinListController = shortcutsSection.aiList;
  const aggregateSearchListController = shortcutsSection.aggregateList;
  optionsState.siteSearchFormController = shortcutsSection.form;

  const {
    getActiveBuiltinSiteSearchProviders,
    getSiteSearchBuiltinKey
  } = SITE_SEARCH;
  const aggregateSearchModel = AGGREGATE_SEARCH.createAggregateSearchModel({
    aggregateSearchStore: AGGREGATE_SEARCH_STORE
  });
  const syncTransfer = LumnoOptionsSyncTransfer.createSyncTransfer({
    deriveLegacyAutoGroupEnabled: aggregateSearchModel.deriveLegacyAutoGroupEnabled,
    settings: SETTINGS
  });
  // Each section registers its storage change handlers here, next to the
  // code that renders it; one chrome.storage listener dispatches to them.
  const storageChanges = SETTING_BINDINGS.createStorageChangeRegistry({
    isPrimaryAreaName: isPrimaryStorageAreaName
  });
  const settingBinder = SETTING_BINDINGS.createSettingBinder({
    storageArea: optionsState.storageArea,
    writeRepairs: (values, stored) => LumnoSettingsStorage.writeSettingRepairs(chrome, optionsState.storageArea, values, stored),
    registry: storageChanges,
    refreshCustomSelects,
    setToggleState: setOptionsToggleState
  });
  // Device-only settings (the overlay's local fonts) stay in
  // chrome.storage.local whichever area holds the synced ones.
  const localSettingBinder = SETTING_BINDINGS.createSettingBinder({
    area: 'local',
    storageArea: localStorageArea,
    registry: storageChanges,
    refreshCustomSelects,
    setToggleState: setOptionsToggleState
  });

  function finishOptionsStartupStorageBatch(metrics: ReadBatchMetrics): void {
    optionsState.optionsStartupStorageBatchPending = false;
    const root = document.documentElement;
    root.setAttribute('data-lumno-options-bootstrap-storage-reads', String(metrics.underlyingReadCount));
    root.setAttribute('data-lumno-options-bootstrap-storage-requests', String(metrics.requestCount));
    root.setAttribute(
      'data-lumno-options-bootstrap-storage-keys',
      metrics.keyCount === null ? 'all' : String(metrics.keyCount)
    );
    if (optionsState.optionsStartupRefreshDeferred) {
      optionsState.optionsStartupRefreshDeferred = false;
      refreshCustomSelects({ force: true });
    }
    const markOptionsReady = () => {
      if (optionsReadyMarked) {
        return;
      }
      optionsReadyMarked = true;
      optionsState.optionsStartupRefreshCoalescing = false;
      if (optionsState.optionsStartupRefreshDeferred) {
        optionsState.optionsStartupRefreshDeferred = false;
        refreshCustomSelects({ force: true });
      }
      const readyAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      if (root) {
        root.setAttribute('data-lumno-options-ready', 'true');
        root.setAttribute(
          'data-lumno-options-ready-ms',
          Math.max(0, readyAt - optionsRuntimeStartedAt).toFixed(2)
        );
        root.setAttribute(
          'data-lumno-options-ready-navigation-ms',
          Math.max(0, readyAt).toFixed(2)
        );
      }
      markOptionsPerformance('lumno-options-ready');
      try {
        if (typeof performance !== 'undefined' && typeof performance.measure === 'function') {
          performance.measure(
            'lumno-options-startup',
            'lumno-options-runtime-start',
            'lumno-options-ready'
          );
        }
      } catch (e) {
        // Performance measures are diagnostics only.
      }
    };
    // Ready means the startup values have been painted, so changes from here
    // on may animate: wait for the frame that paints them. A hidden page gets
    // no frames until it is shown and has nothing on screen to animate, so it
    // is ready as soon as the values are in.
    if (document.visibilityState === 'hidden' || typeof requestAnimationFrame !== 'function') {
      markOptionsReady();
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(markOptionsReady);
    });
  }

  startupStorageReadBatch.ready.then(finishOptionsStartupStorageBatch);

  function getActivePrimaryAreaName() {
    return optionsState.providerStorageRuntime.getActiveAreaName();
  }
  function isPrimaryStorageAreaName(areaName: string): boolean {
    return optionsState.providerStorageRuntime.isActiveAreaName(areaName);
  }
  function addStorageChangeListener(listener: StorageChangeListener) {
    return LumnoSettingsStorage.addStorageChangeListener(chrome, listener);
  }

  const { setConditionalSettingsElementVisibility } = PANEL_MOTION;
  function animateOptionsPanelHeight(mutateLayout: LayoutMutation): boolean {
    return optionsState.panelHeightAnimator.animate(mutateLayout);
  }
  storageChanges.on(SEARCH_SOURCE_ORDER_STORAGE_KEY, (changes) => {
    optionsState.searchSourceOrderController.accept(changes[SEARCH_SOURCE_ORDER_STORAGE_KEY].newValue);
  });
  optionsState.searchSourceOrderController.load();


  const {
    deriveLegacyAggregateSearchAutoGroupEnabled,
    renderAggregateSearchList,
    getAggregateSearchStateCoordinator,
    refreshAggregateSearches,
    handleAggregateSearchSave,
    handleAggregateSearchRemove,
    handleAggregateSearchClear
  } = OPTIONS_AGGREGATE_SEARCH_LIST.createAggregateSearchList({
    AGGREGATE_SEARCH_STORE,
    aggregateSearchModel,
    SEARCH_UTILS,
    isAiSiteSearchProvider,
    getMessage,
    isSearchEngineSiteSearchProvider,
    getSiteSearchItemIconUrl,
    getLocalizedBuiltinProviderName,
    formatTemplate,
    aggregateSearchListController,
    renderedSearchSourceKeys,
    getSearchSourceReorderCopy,
    AGGREGATE_SEARCH_STORAGE_KEY,
    getActivePrimaryAreaName,
    AGGREGATE_SEARCH,
    showToast,
    createPersistentId,
    findSiteSearchKeyConflict,
    getSiteSearchErrorMessage,
    optionsState
  });

  let siteSearchRefreshTimer: number | null = null;
  function renderOptionsInfoButtons() {
    const bookmarkTooltip = getMessage(
      'settings_bookmark_adaptive_count_tooltip',
      '该值为宽度充足时的最大数量，实际显示数量会根据可用空间自适应。'
    );
    [bookmarkRowsInfoController, bookmarkColumnsInfoController].forEach((controller) => {
      if (controller) {
        controller.render({
          tooltip: bookmarkTooltip,
          tooltipKey: 'settings_bookmark_adaptive_count_tooltip'
        });
      }
    });
  }
  renderOptionsInfoButtons();

  function createPersistentId(prefix: string): string {
    const safePrefix = String(prefix || 'item').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'item';
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `${safePrefix}-${globalThis.crypto.randomUUID()}`;
    }
    return `${safePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }


  const {
    renderNewtabShortcutColumnsControl,
    renderNewtabShortcutSizeControl,
    renderNewtabShortcutGapControl,
    syncNewtabShortcutSubcontrolAvailability,
    renderBookmarkRowsControl,
    renderRecentCountControl,
    renderBookmarkColumnsControl
  } = OPTIONS_SLIDER_CONTROLS.createSliderControls({
    optionsSettingsControlsApi,
    storageArea: optionsState.storageArea,
    getMessage,
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
    optionsState
  });

  renderNewtabShortcutColumnsControl(NEWTAB_SHORTCUT_COLUMNS_DEFAULT, false);
  renderNewtabShortcutSizeControl(NEWTAB_SHORTCUT_SIZE_DEFAULT, false);
  renderNewtabShortcutGapControl(NEWTAB_SHORTCUT_GAP_DEFAULT, false);
  syncNewtabShortcutSubcontrolAvailability();
  renderRecentCountControl(4);
  renderBookmarkRowsControl(8);
  renderBookmarkColumnsControl(6);

  function renderFeedbackSupport() {
    feedbackSupportSection.render();
  }

  renderFeedbackSupport();
  feedbackSupportSection.loadLinks();

  function renderTranslationHelp() {
    translationHelpSection.render();
  }

  renderTranslationHelp();

  setRecentModeTabState(optionsState.currentRecentMode);

  function notifyNewtabSectionsRefresh(section: string): void {
    if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      return;
    }
    try {
      LumnoMessaging.sendPageMessage(chrome.runtime, 
        { action: 'lumno:newtab-refresh-sections', section: section || 'all' },
        () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            return;
          }
        }
      );
    } catch (error) {
      // Ignore runtime messaging errors.
    }
  }

  const accountSection = OPTIONS_ACCOUNT_SECTION.createAccountSection({
    host: getHtmlElement(document, '_x_extension_account_settings_content_2026_unique_'),
    accountTabApi: optionsAccountTabApi,
    sync: {
      beginToast,
      browserName: LumnoBrowserProfile.getBrowserInternalProfile(navigator).name || 'Chrome',
      chromeApi: chrome,
      documentObj: document,
      formatTemplate,
      getActivePrimaryAreaName,
      getMessage,
      localStorageArea,
      settings: SETTINGS,
      showToast,
      storageArea: optionsState.storageArea,
      syncTransfer
    },
    webdav: { chromeApi: chrome, getMessage },
    showTooltipFor
  });
  const syncSection = accountSection.syncSection;
  optionsState.webDavSettingsController = accountSection.webDavController;
  function refreshSyncStatus() {
    syncSection.refreshSyncStatus();
  }
  storageChanges.on(SETTINGS.WEBDAV_STATUS_STORAGE_KEY, refreshSyncStatus, { area: 'local' });
  storageChanges.on(
    LumnoNewtabShortcutsStore && LumnoNewtabShortcutsStore.SHORTCUTS_LOCAL_OVERFLOW_KEY,
    () => syncSection.refreshShortcutSyncSummary(),
    { area: 'local' }
  );
  storageChanges.on([SYNC_META_STORAGE_KEY, ...SYNC_KEYS], refreshSyncStatus);

  storageChanges.on(LANGUAGE_STORAGE_KEY, (changes) => {
    applyLanguageMode(changes[LANGUAGE_STORAGE_KEY].newValue || 'system');
  });

  const {
    formatShortcutForDisplay,
    renderShortcutReferenceList
  } = OPTIONS_SHORTCUT_REFERENCE.createShortcutReference({
    shortcutDisplay,
    shortcutReferenceController: generalShortcutsSection.referenceList,
    getMessage,
    formatTemplate,
    getHelpUrl: (slug, anchor) => COMMUNITY_LINKS.getHelpUrl(
      optionsState.currentLanguageMode === 'system' ? getSystemLocale() : normalizeLocale(optionsState.currentLanguageMode),
      slug,
      anchor
    ),
    onTabSwitcherCtrlTabLinkChange: (link) => generalFeaturesSection.setCtrlTabLink(link),
    optionsState
  });

  optionsState.searchShortcutStatus = OPTIONS_SEARCH_SHORTCUT_STATUS.createSearchShortcutStatus({
    chromeApi: chrome,
    isMacPlatform: optionsState.isMacPlatform,
    formatShortcutForDisplay,
    getMessage,
    onChange: (label) => generalShortcutsSection.setStatus(label)
  });
  function loadCurrentShortcut(): void {
    if (optionsState.searchShortcutStatus) {
      optionsState.searchShortcutStatus.load();
    }
  }
  storageChanges.on(FALLBACK_SHORTCUT_STORAGE_KEY, () => loadCurrentShortcut());

  if (settingsVersion && chrome?.runtime?.getManifest) {
    const manifest = chrome.runtime.getManifest();
    if (manifest?.version) {
      settingsVersion.textContent = `v${manifest.version}`;
    }
    function openSettingsVersionRelease(event: MouseEvent): void {
      event.preventDefault();
      event.stopPropagation();
      if (!chrome?.runtime?.sendMessage) {
        return;
      }
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
        action: 'openReleasePage',
        reason: 'options-version',
        disposition: NAVIGATION_DISPOSITION.getDisposition(event, 'newTab')
      }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          return;
        }
      });
    }
    settingsVersion.addEventListener('click', openSettingsVersionRelease);
    settingsVersion.addEventListener('auxclick', (event) => {
      if (!event || Number(event.button) !== 1) {
        return;
      }
      openSettingsVersionRelease(event);
    });
  }

  function updateOverlayPageThemeAdaptationVisibility(mode: unknown): void {
    const nextMode = mode === 'dark' || mode === 'light' ? mode : 'system';
    animateOptionsPanelHeight(() => {
      document.documentElement.setAttribute('data-options-theme-mode', nextMode);
      return appearanceOverlaySection.showThemeMode(nextMode);
    });
  }

  function setThemeMode(mode: unknown): void {
    if (optionsState.themeSection) {
      optionsState.themeSection.setMode(mode);
    }
  }

  function playThemeOptionClickEffect(button: Element | null): void {
    THEME.playThemeOptionClickEffect(button, window);
  }

  optionsState.themeSection = THEME.createThemeSection({
    documentObj: document,
    getMessage,
    onModeShown: updateOverlayPageThemeAdaptationVisibility,
    panel,
    picker: appearanceGlobalSection.themePicker,
    settings: SETTINGS,
    storageArea: optionsState.storageArea,
    windowObj: window
  });
  optionsState.themeSection.init();
  storageChanges.on(THEME_STORAGE_KEY, (changes) => {
    if (optionsState.themeSection) {
      optionsState.themeSection.applyStorageChange(changes[THEME_STORAGE_KEY].newValue);
    }
  });


  if (!optionsState.storageArea) {
    applyLanguageMode('system');
  }
  initTooltips();

  function getInitialTabKey() {
    const routeState = getOptionsRouteState();
    return OPTIONS_NAVIGATION.normalizeSettingsTabKey(routeState.tabKey);
  }

  function getInitialOptionsTargetKey() {
    const routeState = getOptionsRouteState();
    return routeState.targetKey || '';
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', function() {
      handleSettingsTabSelection(button.getAttribute('data-tab') || '');
    });
  });

  const initialTab = getInitialTabKey();
  const initialOptionsTargetKey = getInitialOptionsTargetKey();
  optionsState.pendingOptionsScrollTarget = initialTab === 'shortcuts' ? initialOptionsTargetKey : '';
  setActiveTab(initialTab);
  if (initialTab === 'labs') {
    scrollToOptionsTarget(initialOptionsTargetKey, { behavior: 'auto', block: 'center', flash: true });
  }
  if (initialTab === 'shortcuts') {
    refreshSiteSearchProviders();
  }
  window.addEventListener('scroll', scheduleOptionsScrollRefresh, { passive: true });
  updateTabsStickyVisualState();
  window.addEventListener('resize', scheduleOptionsViewportLayoutRefresh, { passive: true });
  optionsState.providerStorageRuntime.ready.then(() => {
    syncSection.migrateStorageIfNeeded(SYNC_KEYS.slice());
    refreshSyncStatus();
  });

  OPTIONS_CONTROL_EVENTS.createControlEvents({
    recentModeSelect,
    handleRecentModeSelection,
    recentModeTabButtons
  });


  loadCurrentShortcut();
  renderShortcutReferenceList();
  window.addEventListener('focus', () => {
    loadCurrentShortcut();
    renderShortcutReferenceList();
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadCurrentShortcut();
      renderShortcutReferenceList();
    }
  }, true);

  generalGlobalSection.bindSettings(settingBinder);
  generalFeaturesSection.bindSettings(settingBinder);
  generalSearchSection.bindSettings(settingBinder);
  generalNewtabSection.bindSettings(settingBinder);
  generalShortcutsSection.bindSettings(settingBinder);
  appearanceGlobalSection.bindSettings(settingBinder);
  appearanceOverlaySection.bindSettings(settingBinder, localSettingBinder);
  appearanceNewtabLookSection.bindSettings(settingBinder);
  labsSection.bindSettings(settingBinder);
  blacklistSection.bindSettings(settingBinder);
  shortcutsSection.bindSettings(settingBinder);
  OPTIONS_SETTING_BINDS.createSettingBinds({
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
    storageChanges,
    settingBinder,
    RECENT_COUNT_STORAGE_KEY,
    normalizeRecentCount,
    renderRecentCountControl,
    updateRecentModeTabsVisibility,
    SETTINGS,
    getMessage,
    showToast,
    createOptionsSegmentedControlController,
    optionsSettingsControlsApi,
    registerOptionsToggleControl,
    setConditionalSettingsElementVisibility,
    animateOptionsPanelHeight,
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
    TOGGLE_SETTINGS,
    toggleSettingControls,
    registerOptionsSelectControl,
    renderOptionsSelectControl,
    setOptionsSelectState,
    optionsState
  });

  refreshCustomSelects();

  storageChanges.on(AGGREGATE_SEARCH_STORAGE_KEY, (changes) => {
    getAggregateSearchStateCoordinator().applyStorageChange(
      changes[AGGREGATE_SEARCH_STORAGE_KEY].newValue
    );
  });

  // A save on this page suspends refreshes briefly so its own write does not
  // re-render the list mid-edit; a change during that window refreshes after.
  storageChanges.on([SITE_SEARCH_STORAGE_KEY, SITE_SEARCH_DISABLED_STORAGE_KEY], () => {
    invalidateSiteSearchProviderRefresh();
    const now = Date.now();
    if (optionsState.siteSearchRefreshSuppressUntil && now < optionsState.siteSearchRefreshSuppressUntil) {
      if (siteSearchRefreshTimer) {
        window.clearTimeout(siteSearchRefreshTimer);
      }
      const delay = Math.max(optionsState.siteSearchRefreshSuppressUntil - now, 0) + 40;
      siteSearchRefreshTimer = window.setTimeout(() => {
        siteSearchRefreshTimer = null;
        refreshSiteSearchProviders();
      }, delay);
      return;
    }
    refreshSiteSearchProviders();
  });

  refreshSiteSearchProviders();
  // Load failures are reported through onLoadError.
  refreshAggregateSearches().catch(() => {});

  addStorageChangeListener(storageChanges.dispatch);
})();
