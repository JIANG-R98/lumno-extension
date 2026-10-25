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
import * as OPTIONS_AGGREGATE_SEARCH_LIST from './options-aggregate-search-list';
import * as AGGREGATE_SEARCH from './options-aggregate-search';
import * as OPTIONS_BLACKLIST_SECTION from './options-blacklist-section';
import * as LumnoOptionsBlacklist from './options-blacklist';
import * as OPTIONS_CONTROL_EVENTS from './options-control-events';
import * as LumnoOptionsFallbackShortcut from './options-fallback-shortcut';
import * as LumnoOptionsFeedbackSupportSection from './options-feedback-support';
import * as OPTIONS_FORMS from './options-forms';
import * as OPTIONS_GENERAL_FEATURES_SECTION from './options-general-features-section';
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
import * as SHORTCUT_KEYS from './options-shortcut-keys';
import * as OPTIONS_SHORTCUT_REFERENCE from './options-shortcut-reference';
import * as OPTIONS_SHORTCUTS_SECTION from './options-shortcuts-section';
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
import { getHtmlElement, getHtmlTag, queryHtmlElement, queryHtmlElements, queryHtmlTags } from '../shared/dom-lookup';
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
  const appearanceContent = queryHtmlElement(document, '._x_extension_settings_content_2024_unique_[data-content="appearance"]');
  const themePicker = appearanceContent
    ? queryHtmlElement(appearanceContent, '._x_extension_theme_picker_2024_unique_')
    : null;
  const themeButtons = themePicker ? queryHtmlElements(themePicker, '._x_extension_theme_option_2024_unique_') : [];
  const tabButtons = queryHtmlElements(document, '._x_extension_settings_tab_button_2024_unique_');
  const tabContents = queryHtmlElements(document, '._x_extension_settings_content_2024_unique_');
  const tabsContainer = getHtmlElement(document, '_x_extension_settings_tabs_2024_unique_');
  const settingsVersion = getHtmlElement(document, '_x_extension_settings_version_2024_unique_');
  const languageSelect = getHtmlTag(document, '_x_extension_language_select_2024_unique_', 'select');
  const languageMachineNote = getHtmlElement(document, '_x_extension_language_machine_note_2026_unique_');
  const recentModeSelect = getHtmlTag(document, '_x_extension_recent_mode_select_2024_unique_', 'select');
  const recentModeTabButtons = queryHtmlElements(document, 'button[data-recent-mode]');
  const recentModeTabsWrap = getHtmlElement(document, '_x_extension_recent_mode_tabs_wrap_2024_unique_');
  const recentCountControlHost = getHtmlElement(document, '_x_extension_recent_count_control_2026_unique_');
  const newtabWidthSelect = getHtmlTag(document, '_x_extension_newtab_width_select_2026_unique_', 'select');
  const newtabWidthTabsWrap = getHtmlElement(document, '_x_extension_newtab_width_tabs_wrap_2026_unique_');
  const newtabWidthTabButtons = queryHtmlElements(document, 'button[data-newtab-width]');
  const overlaySizeTabButtons = queryHtmlElements(document, 'button[data-overlay-size]');
  const overlaySizeTabsWrap = getHtmlElement(document, '_x_extension_overlay_size_tabs_wrap_2026_unique_');
  const overlayEnterAnimationTabButtons = queryHtmlElements(document, 'button[data-overlay-enter-animation]');
  const overlayEnterAnimationTabsWrap = getHtmlElement(document, '_x_extension_overlay_enter_animation_tabs_wrap_2026_unique_');
  const overlayFontRow = getHtmlElement(document, '_x_extension_overlay_font_row_2026_unique_');
  const overlayFontSelect = getHtmlTag(document, '_x_extension_overlay_font_select_2026_unique_', 'select');
  const overlayFontFallbackRow = getHtmlElement(document, '_x_extension_overlay_font_fallback_row_2026_unique_');
  const overlayFontFallbackSelect = getHtmlTag(document, '_x_extension_overlay_font_fallback_select_2026_unique_', 'select');
  const overlayFontMissing = getHtmlElement(document, '_x_extension_overlay_font_missing_2026_unique_');
  const overlayFontFallbackMissing = getHtmlElement(document, '_x_extension_overlay_font_fallback_missing_2026_unique_');
  const bookmarkRowsControlHost = getHtmlElement(document, '_x_extension_bookmark_rows_control_2026_unique_');
  const bookmarkColumnsSettingRow = getHtmlElement(document, '_x_extension_bookmark_columns_setting_row_2026_unique_');
  const bookmarkColumnsControlHost = getHtmlElement(document, '_x_extension_bookmark_columns_control_2026_unique_');
  const searchResultDisplayLimitControlHost = getHtmlElement(document, '_x_extension_search_result_display_limit_control_2026_unique_');
  const overlayWidthControlHost = getHtmlElement(document, '_x_extension_overlay_width_control_2026_unique_');
  const bookmarkFolderIconsVisibleRow = getHtmlElement(document, '_x_extension_bookmark_folder_icons_visible_row_2026_unique_');
  const newtabTopContentTabsWrap = getHtmlElement(document, '_x_extension_newtab_top_content_tabs_wrap_2026_unique_');
  const newtabTimeFontRow = getHtmlElement(document, '_x_extension_newtab_time_font_row_2026_unique_');
  const newtabTimeFontSelect = getHtmlTag(document, '_x_extension_newtab_time_font_select_2026_unique_', 'select');
  const newtabTimeFontWeightRow = getHtmlElement(document, '_x_extension_newtab_time_font_weight_row_2026_unique_');
  const newtabTimeFontWeightControlHost = getHtmlElement(document, '_x_extension_newtab_time_font_weight_control_2026_unique_');
  const newtabTimeFontSizeRow = getHtmlElement(document, '_x_extension_newtab_time_font_size_row_2026_unique_');
  const newtabTimeFontSizeControlHost = getHtmlElement(document, '_x_extension_newtab_time_font_size_control_2026_unique_');
  const newtabTimeOpacityRow = getHtmlElement(document, '_x_extension_newtab_time_opacity_row_2026_unique_');
  const newtabTimeOpacityControlHost = getHtmlElement(document, '_x_extension_newtab_time_opacity_control_2026_unique_');
  const newtabTimeInkRow = getHtmlElement(document, '_x_extension_newtab_time_ink_row_2026_unique_');
  const newtabTimeInkTabsWrap = getHtmlElement(document, '_x_extension_newtab_time_ink_tabs_wrap_2026_unique_');
  const newtabTimeSecondsRow = getHtmlElement(document, '_x_extension_newtab_time_seconds_row_2026_unique_');
  const newtabTime12HourRow = getHtmlElement(document, '_x_extension_newtab_time_12_hour_row_2026_unique_');
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
  const restrictedActionSelect = getHtmlTag(document, '_x_extension_restricted_action_select_2024_unique_', 'select');
  const searchResultPrioritySelect = getHtmlTag(document, '_x_extension_search_result_priority_select_2026_unique_', 'select');
  const searchResultTabPositionSelect = getHtmlTag(document, '_x_extension_search_result_tab_position_select_2026_unique_', 'select');
  const newtabGlassStyleSelect = getHtmlTag(document, '_x_extension_newtab_glass_style_select_2026_unique_', 'select');
  const newtabGlassThemeRow = getHtmlElement(document, '_x_extension_newtab_glass_theme_row_2026_unique_');
  const newtabGlassThemeTabsWrap = getHtmlElement(document, '_x_extension_newtab_glass_theme_tabs_wrap_2026_unique_');
  const searchResultSourceTypeGroupHost = getHtmlElement(document, '_x_extension_search_result_source_types_2026_unique_');
  const searchResultSourceTypeResetButton = getHtmlElement(document, '_x_extension_search_result_source_types_reset_2026_unique_');
  const searchResultSourceTypeInputs = queryHtmlTags(document, 'input[data-search-result-source-type]', 'input');
  const overlayPageThemeAdaptationRow = getHtmlElement(document, '_x_extension_overlay_page_theme_adaptation_row_2026_unique_');
  const overlayPageThemeAdaptationInfoHost = getHtmlElement(document, '_x_extension_overlay_page_theme_adaptation_info_2026_unique_');
  const restrictedActionInfoHost = getHtmlElement(document, '_x_extension_restricted_action_info_2026_unique_');
  const bookmarkRowsInfoHost = getHtmlElement(document, '_x_extension_bookmark_rows_info_2026_unique_');
  const bookmarkColumnsInfoHost = getHtmlElement(document, '_x_extension_bookmark_columns_info_2026_unique_');
  const newtabOpenInNewTabToggles = queryHtmlTags(document, 'input[data-newtab-open-in-new-tab-surface]', 'input');
  const fallbackShortcutInput = getHtmlTag(document, '_x_extension_shortcuts_input_2024_unique_', 'input');
  const fallbackShortcutTokens = getHtmlElement(document, '_x_extension_shortcuts_tokens_2024_unique_');
  const fallbackShortcutWrap = queryHtmlElement(document, '._x_extension_shortcuts_hotkey_wrap_2024_unique_');
  const restrictedActionSelectWrap = getHtmlElement(document, '_x_extension_restricted_action_tabs_wrap_2024_unique_');
  const restrictedActionTabButtons = queryHtmlElements(document, 'button[data-restricted-action]');
  const searchResultPriorityTabsWrap = getHtmlElement(document, '_x_extension_search_result_priority_tabs_wrap_2026_unique_');
  const searchResultPriorityTabButtons = queryHtmlElements(document, 'button[data-search-result-priority]');
  const clearShortcutButton = getHtmlElement(document, '_x_extension_clear_shortcut_2024_unique_');
  const resetShortcutButton = getHtmlElement(document, '_x_extension_reset_shortcut_2024_unique_');
  const shortcutsStatus = getHtmlElement(document, '_x_extension_shortcuts_status_2024_unique_');
  const shortcutReferenceList = getHtmlElement(document, '_x_extension_shortcut_reference_list_2026_unique_');
  const openOnboardingPageButton = getHtmlElement(document, '_x_extension_open_onboarding_page_2026_unique_');
  const feedbackSupportHost = getHtmlElement(document, '_x_extension_feedback_support_2026_unique_');
  const translationHelpHost = getHtmlElement(document, '_x_extension_translation_help_2026_unique_');
  const openShortcutsPageButton = getHtmlElement(document, '_x_extension_open_shortcuts_page_2026_unique_');
  const toastElement = getHtmlElement(document, '_x_extension_toast_2024_unique_');
  if (!panel || !optionsRoot || themeButtons.length === 0 || tabButtons.length === 0) {
    return;
  }
  // The React views, set by the options islands bundle that loads first.
  const optionsBlacklistTabApi = globalThis.LumnoOptionsBlacklistTab;
  const optionsAccountTabApi = globalThis.LumnoOptionsAccountTab;
  const optionsShortcutsTabApi = globalThis.LumnoOptionsShortcutsTab;
  const optionsFeedbackSupportApi = globalThis.LumnoOptionsFeedbackSupport;
  const optionsTranslationHelpApi = globalThis.LumnoOptionsTranslationHelp;
  const optionsInfoButtonApi = globalThis.LumnoOptionsInfoButton;
  const optionsToastApi = globalThis.LumnoOptionsToast;
  const optionsSegmentedControlApi = globalThis.LumnoOptionsSegmentedControl;
  const optionsSettingsControlsApi = globalThis.LumnoOptionsSettingsControls;
  const optionsSettingsNavigationApi = globalThis.LumnoOptionsSettingsNavigation;
  const optionsShortcutReferenceApi = globalThis.LumnoOptionsShortcutReference;
  const optionsShortcutHotkeyApi = globalThis.LumnoOptionsShortcutHotkey;
  const optionsThemePickerApi = globalThis.LumnoOptionsThemePicker;
  if (!optionsAccountTabApi || !optionsBlacklistTabApi || !optionsShortcutsTabApi || !optionsFeedbackSupportApi ||
      !optionsTranslationHelpApi || !optionsInfoButtonApi || !optionsSegmentedControlApi ||
      !optionsSettingsControlsApi || !optionsSettingsNavigationApi ||
      !optionsShortcutReferenceApi || !optionsShortcutHotkeyApi || !optionsThemePickerApi) {
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
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    OVERLAY_SIZE_MODE_STORAGE_KEY,
    OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
    OVERLAY_FONT_FAMILY_STORAGE_KEY,
    OVERLAY_FONT_FALLBACK_STORAGE_KEY,
    OVERLAY_FONT_LABELS_STORAGE_KEY,
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
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    NEWTAB_TIME_FONT_WEIGHT_DEFAULT,
    RESTRICTED_ACTION_STORAGE_KEY,
    RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    FALLBACK_SHORTCUT_STORAGE_KEY,
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    AGGREGATE_SEARCH_STORAGE_KEY,
    SYNC_META_STORAGE_KEY,
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY
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
        renderSearchResultSourceTypeControl(collectCheckedSearchResultSourceTypes());
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
    refreshOptionsSelectItems,
    renderOptionsSelectControl,
    setOptionsSelectState,
    getInstalledFontFamilies,
    renderOverlayFontMissingNotices,
    ensureOverlayFontOption,
    populateOverlayFontOptions
  } = OPTIONS_SELECT_CONTROLS.createSelectControls({
    tabsRow,
    getMessage: (key, fallback) => getMessage(key, fallback),
    overlayFontMissing,
    overlayFontFallbackMissing,
    formatTemplate: (text, params) => formatTemplate(text, params),
    optionsState
  });

  const {
    showTooltipFor,
    initTooltips,
    refreshCustomSelects,
    syncFallbackShortcutWrapWidth,
    updateFallbackShortcutWrapWidthForContent,
    showToast,
    beginToast
  } = OPTIONS_TOOLTIPS.createTooltips({
    renderSettingsForms: (...args) => renderSettingsForms(...args),
    fallbackShortcutWrap,
    restrictedActionSelectWrap,
    fallbackShortcutTokens,
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
    syncFallbackShortcutWrapWidth,
    updateFallbackShortcutWrapWidthForContent,
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
    renderOverlayFontMissingNotices: (...args) => renderOverlayFontMissingNotices(...args),
    formatTemplate: (...args) => formatTemplate(...args),
    formatShortcutForDisplay: (...args) => formatShortcutForDisplay(...args),
    fallbackShortcutInput,
    fallbackShortcutTokens,
    SETTINGS,
    LANGUAGE_STORAGE_KEY,
    localStorageArea,
    languageSelect,
    languageMachineNote,
    setOptionsSelectState: (...args) => setOptionsSelectState(...args),
    renderOptionsInfoButtons,
    renderFeedbackSupport,
    renderTranslationHelp,
    refreshCustomSelects,
    refreshSyncStatus,
    renderShortcutReferenceList: (...args) => renderShortcutReferenceList(...args),
    setNewtabWidthTabState: (...args) => setNewtabWidthTabState(...args),
    setOverlaySizeTabState: (...args) => setOverlaySizeTabState(...args),
    setOverlayEnterAnimationTabState: (...args) => setOverlayEnterAnimationTabState(...args),
    setSearchResultPriorityTabState: (...args) => setSearchResultPriorityTabState(...args),
    setRecentModeTabState: (...args) => setRecentModeTabState(...args),
    setRestrictedActionTabState: (...args) => setRestrictedActionTabState(...args),
    setNewtabTopContentTabState: (...args) => setNewtabTopContentTabState(...args),
    renderNewtabTimeFontWeightControl: (...args) => renderNewtabTimeFontWeightControl(...args),
    renderNewtabTimeFontSizeControl: (...args) => renderNewtabTimeFontSizeControl(...args),
    renderNewtabTimeOpacityControl: (...args) => renderNewtabTimeOpacityControl(...args),
    setNewtabTimeInkTabState: (...args) => setNewtabTimeInkTabState(...args),
    setNewtabGlassThemeTabState: (...args) => setNewtabGlassThemeTabState(...args),
    renderNewtabShortcutColumnsControl: (...args) => renderNewtabShortcutColumnsControl(...args),
    renderNewtabShortcutSizeControl: (...args) => renderNewtabShortcutSizeControl(...args),
    renderNewtabShortcutGapControl: (...args) => renderNewtabShortcutGapControl(...args),
    syncNewtabShortcutSubcontrolAvailability: (...args) => syncNewtabShortcutSubcontrolAvailability(...args),
    renderRecentCountControl: (...args) => renderRecentCountControl(...args),
    renderBookmarkRowsControl: (...args) => renderBookmarkRowsControl(...args),
    renderBookmarkColumnsControl: (...args) => renderBookmarkColumnsControl(...args),
    renderSearchResultDisplayLimitControl: (...args) => renderSearchResultDisplayLimitControl(...args),
    renderOverlayWidthControl: (...args) => renderOverlayWidthControl(...args),
    renderSettingsNavigation,
    renderTabSections: () => {
      generalFeaturesSection.render();
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
  const feedbackSupportSection = LumnoOptionsFeedbackSupportSection.createFeedbackSupportSection({
    communityLinks: COMMUNITY_LINKS,
    controller: optionsFeedbackSupportApi.createFeedbackSupportController(feedbackSupportHost),
    exportDiagnostics: () => diagnosticsExport.exportReport().then(
      () => showToast(getMessage('settings_diagnostics_export_done', '已导出诊断信息'), false),
      (error) => {
        console.warn('[Lumno] Could not export diagnostics.', error);
        showToast(getMessage('settings_diagnostics_export_failed', '诊断信息导出失败'), true);
      }
    ),
    licensesLink: getHtmlTag(document, '_x_extension_open_licenses_2026_unique_', 'a'),
    getLocale: () => (optionsState.currentLanguageMode === 'system' ? getSystemLocale() : normalizeLocale(optionsState.currentLanguageMode)),
    getMessage,
    helpIconUrl: chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL('assets/images/site-search/glyph-lm.png')
      : '../../assets/images/site-search/glyph-lm.png',
    isHelpCenterSearchEnabled: () => optionsState.helpCenterSearchEnabled === true
  });
  const translationHelpSection = LumnoOptionsTranslationHelpSection.createTranslationHelpSection({
    controller: optionsTranslationHelpApi.createTranslationHelpController(translationHelpHost),
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
  const restrictedActionInfoController = createOptionsInfoButtonController(restrictedActionInfoHost);
  const bookmarkRowsInfoController = createOptionsInfoButtonController(bookmarkRowsInfoHost);
  const bookmarkColumnsInfoController = createOptionsInfoButtonController(bookmarkColumnsInfoHost);
  const overlayPageThemeAdaptationInfoController = createOptionsInfoButtonController(
    overlayPageThemeAdaptationInfoHost
  );
  const shortcutReferenceController =
    optionsShortcutReferenceApi.createShortcutReferenceController(shortcutReferenceList);
  const shortcutHotkeyController =
    optionsShortcutHotkeyApi.createShortcutHotkeyController(
      fallbackShortcutTokens,
      { onContentReady: updateFallbackShortcutWrapWidthForContent }
    );
  const themePickerController =
    optionsThemePickerApi.createThemePickerController(themePicker, {
      onSelect(mode, button) {
        playThemeOptionClickEffect(button);
        setThemeMode(mode);
      }
    });
  function createOptionsSegmentedControlController(host: HTMLElement | null, kind: string, onSelect: (value: string) => void) {
    return segmentedControlApi.createSegmentedControlController(host, {
      kind,
      onSelect
    });
  }

  const {
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
  } = OPTIONS_SEGMENTED_TABS.createSegmentedTabs({
    getMessage,
    normalizeOverlaySizeMode: (...args) => normalizeOverlaySizeMode(...args),
    normalizeOverlayEnterAnimation: (...args) => normalizeOverlayEnterAnimation(...args),
    normalizeNewtabWidthMode: (...args) => normalizeNewtabWidthMode(...args),
    normalizeNewtabTopContentMode: (...args) => normalizeNewtabTopContentMode(...args),
    SETTINGS,
    animateOptionsPanelHeight,
    setConditionalSettingsElementVisibility: (...args) => setConditionalSettingsElementVisibility(...args),
    newtabGlassThemeRow,
    newtabTimeFontRow,
    newtabTimeFontWeightRow,
    newtabTimeFontSizeRow,
    newtabTimeOpacityRow,
    newtabTimeInkRow,
    newtabTimeSecondsRow,
    newtabTime12HourRow,
    recentModeTabsWrap,
    RESTRICTED_ACTION_STORAGE_KEY,
    RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY,
    normalizeSearchResultPriority: (...args) => normalizeSearchResultPriority(...args),
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
    restrictedActionSelect,
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
    normalizeSearchResultPriority,
    normalizeSearchResultDisplayLimit,
    normalizeSearchResultSourceTypes,
    collectCheckedSearchResultSourceTypes,
    setSearchResultSourceTypeState,
    persistSearchResultSourceTypes
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
    NEWTAB_SHORTCUT_WIDTH_MAX,
    searchResultSourceTypeInputs,
    renderSearchResultSourceTypeControl: (...args) => renderSearchResultSourceTypeControl(...args),
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    optionsState
  });

  optionsState.newtabWidthTabsController = createOptionsSegmentedControlController(
    newtabWidthTabsWrap,
    'newtab-width',
    handleNewtabWidthSelection
  );
  optionsState.overlaySizeTabsController = createOptionsSegmentedControlController(
    overlaySizeTabsWrap,
    'overlay-size',
    handleOverlaySizeSelection
  );
  optionsState.overlayEnterAnimationTabsController = createOptionsSegmentedControlController(
    overlayEnterAnimationTabsWrap,
    'overlay-enter-animation',
    handleOverlayEnterAnimationSelection
  );
  optionsState.restrictedActionTabsController = createOptionsSegmentedControlController(
    restrictedActionSelectWrap,
    'restricted-action',
    handleRestrictedActionSelection
  );
  optionsState.searchResultPriorityTabsController = createOptionsSegmentedControlController(
    searchResultPriorityTabsWrap,
    'search-result-priority',
    handleSearchResultPrioritySelection
  );
  optionsState.newtabTopContentTabsController = createOptionsSegmentedControlController(
    newtabTopContentTabsWrap,
    'newtab-top-content',
    handleNewtabTopContentSelection
  );
  optionsState.newtabTimeInkTabsController = createOptionsSegmentedControlController(
    newtabTimeInkTabsWrap,
    'newtab-time-ink',
    handleNewtabTimeInkSelection
  );
  optionsState.newtabGlassThemeTabsController = createOptionsSegmentedControlController(
    newtabGlassThemeTabsWrap,
    'newtab-glass-theme',
    handleNewtabGlassThemeSelection
  );

  // Drawn before the switches below are set up, which mark the rows this
  // browser cannot honor.
  const generalFeaturesSection = OPTIONS_GENERAL_FEATURES_SECTION.createGeneralFeaturesSection({
    host: getHtmlElement(document, '_x_extension_general_features_section_2026_unique_'),
    optionsSettingsControlsApi,
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
    toggleSettingControls,
    searchResultSourceTypeItems,
    searchResultSourceTypeController,
    renderSearchResultSourceTypeControl
  } = OPTIONS_TOGGLE_CONTROLS.createToggleControls({
    optionsSettingsControlsApi,
    SETTINGS,
    syncNewtabShortcutSubcontrolAvailability: (...args) => syncNewtabShortcutSubcontrolAvailability(...args),
    newtabOpenInNewTabToggles,
    getMessage,
    searchResultSourceTypeInputs,
    searchResultSourceTypeGroupHost,
    searchResultSourceTypeResetButton,
    renderedSearchSourceKeys,
    normalizeSearchResultSourceTypes,
    persistSearchResultSourceTypes,
    optionsState
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
  optionsState.searchSourceOrderController.attachLocalDrag(searchResultSourceTypeGroupHost);
  storageChanges.on(SEARCH_SOURCE_ORDER_STORAGE_KEY, (changes) => {
    optionsState.searchSourceOrderController.accept(changes[SEARCH_SOURCE_ORDER_STORAGE_KEY].newValue);
  });
  optionsState.searchSourceOrderController.load();

  if (searchResultSourceTypeController) {
    renderSearchResultSourceTypeControl(
      searchResultSourceTypeItems.filter((item) => item.checked).map((item) => item.value)
    );
  }

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
    if (restrictedActionInfoController) {
      restrictedActionInfoController.render({
        tooltip: getMessage(
          'settings_restricted_tooltip',
          '受限页（如 chrome://、扩展商店、部分 file:// 页面）无法开启聚焦搜索；按下快捷键将按此处规则处理。'
        ),
        tooltipKey: 'settings_restricted_tooltip'
      });
    }
    if (overlayPageThemeAdaptationInfoController) {
      overlayPageThemeAdaptationInfoController.render({
        tooltip: getMessage(
          'settings_overlay_page_theme_adaptation_tooltip',
          '仅在“深浅色模式”=“跟随系统”时显示，关闭后将不再基于网页主题色变更深浅模式。'
        ),
        tooltipKey: 'settings_overlay_page_theme_adaptation_tooltip'
      });
    }
  }
  renderOptionsInfoButtons();

  function createPersistentId(prefix: string): string {
    const safePrefix = String(prefix || 'item').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'item';
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `${safePrefix}-${globalThis.crypto.randomUUID()}`;
    }
    return `${safePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  // Face names are proper names, so the list comes straight from settings.
  if (newtabTimeFontSelect) {
    SETTINGS.NEWTAB_TIME_FONTS.forEach((font) => {
      const option = document.createElement('option');
      option.value = font.id;
      option.textContent = font.label;
      newtabTimeFontSelect.appendChild(option);
    });
    newtabTimeFontSelect.value = optionsState.currentNewtabTimeFont;
  }
  // Each language is listed in its own words, so the names are not translated.
  if (languageSelect) {
    SETTINGS.UI_LOCALES.forEach((locale) => {
      const option = document.createElement('option');
      option.value = locale.htmlLang;
      option.lang = locale.htmlLang;
      option.textContent = locale.name;
      languageSelect.appendChild(option);
    });
  }
  const selectKinds: Array<[HTMLSelectElement | null, string]> = [
    [languageSelect, 'language'],
    [searchResultTabPositionSelect, 'search-result-tab-position'],
    [newtabGlassStyleSelect, 'newtab-glass-style'],
    [newtabTimeFontSelect, 'newtab-time-font']
  ];
  selectKinds.forEach(([select, kind]) => {
    const record = registerOptionsSelectControl(select, kind);
    if (record) {
      renderOptionsSelectControl(record.select);
    }
  });
  const fontNotices: Array<[HTMLElement | null, HTMLSelectElement | null]> = [
    [overlayFontMissing, overlayFontSelect],
    [overlayFontFallbackMissing, overlayFontFallbackSelect]
  ];
  fontNotices
    .forEach(([notice, select]) => {
      const button = notice && notice.querySelector('._x_extension_overlay_font_reset_2026_unique_');
      if (!button || !select) {
        return;
      }
      button.addEventListener('click', () => {
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  [overlayFontSelect, overlayFontFallbackSelect].forEach((select) => {
    const record = registerOptionsSelectControl(select, 'overlay-font');
    if (record) {
      renderOptionsSelectControl(record.select);
    }
  });
  getInstalledFontFamilies().then((fonts) => {
    const families = fonts
      .map((font) => (font && typeof font.fontId === 'string' ? font.fontId.trim() : ''))
      .filter(Boolean);
    // An empty list means the read failed, not that no font is installed.
    optionsState.installedOverlayFontFamilies = families.length ? new Set(families) : null;
    populateOverlayFontOptions(overlayFontSelect, optionsState.currentOverlayFontFamily, 'settings_overlay_font_default', fonts);
    populateOverlayFontOptions(
      overlayFontFallbackSelect,
      optionsState.currentOverlayFontFallback,
      'settings_overlay_font_fallback_none',
      fonts
    );
    renderOverlayFontMissingNotices();
  });
  // Firefox cannot list fonts; keep the rows visible but inert.
  const fontRows: Array<[HTMLElement | null, HTMLSelectElement | null]> = [
    [overlayFontRow, overlayFontSelect],
    [overlayFontFallbackRow, overlayFontFallbackSelect]
  ];
  fontRows
    .forEach(([row, select]) => {
      if (row && select && row.getAttribute('data-unsupported') === 'true') {
        select.disabled = true;
        renderOptionsSelectControl(select);
      }
    });

  const {
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
    renderSearchResultDisplayLimitControl,
    renderOverlayWidthControl
  } = OPTIONS_SLIDER_CONTROLS.createSliderControls({
    optionsSettingsControlsApi,
    newtabTimeFontWeightControlHost,
    normalizeNewtabTimeFontWeight,
    storageArea: optionsState.storageArea,
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
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    overlayWidthControlHost,
    optionsState
  });

  renderNewtabTimeFontWeightControl(NEWTAB_TIME_FONT_WEIGHT_DEFAULT);
  renderNewtabTimeFontSizeControl(SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT);
  renderNewtabTimeOpacityControl(SETTINGS.NEWTAB_TIME_OPACITY_DEFAULT);
  renderNewtabShortcutColumnsControl(NEWTAB_SHORTCUT_COLUMNS_DEFAULT, false);
  renderNewtabShortcutSizeControl(NEWTAB_SHORTCUT_SIZE_DEFAULT, false);
  renderNewtabShortcutGapControl(NEWTAB_SHORTCUT_GAP_DEFAULT, false);
  syncNewtabShortcutSubcontrolAvailability();
  renderRecentCountControl(4);
  renderBookmarkRowsControl(8);
  renderBookmarkColumnsControl(6);
  renderSearchResultDisplayLimitControl(10);
  renderOverlayWidthControl(null);

  function renderFeedbackSupport() {
    feedbackSupportSection.render();
  }

  renderFeedbackSupport();
  feedbackSupportSection.loadLinks();

  function renderTranslationHelp() {
    translationHelpSection.render();
  }

  renderTranslationHelp();

  setNewtabWidthTabState(optionsState.currentNewtabWidthMode);
  setOverlaySizeTabState(optionsState.currentOverlaySizeMode);
  setOverlayEnterAnimationTabState(optionsState.currentOverlayEnterAnimation);
  setSearchResultPriorityTabState(optionsState.currentSearchResultPriority);
  setRecentModeTabState(optionsState.currentRecentMode);
  setRestrictedActionTabState(optionsState.currentRestrictedAction);
  setNewtabTopContentTabState(optionsState.currentNewtabTopContentMode);
  setNewtabTimeInkTabState(optionsState.currentNewtabTimeInk);
  setNewtabGlassThemeTabState(optionsState.currentNewtabGlassTheme);

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
    shortcutReferenceList,
    shortcutReferenceController,
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

  optionsState.fallbackShortcutSection = LumnoOptionsFallbackShortcut.createFallbackShortcutSection({
    chromeApi: chrome,
    documentObj: document,
    elements: {
      clearShortcutButton,
      fallbackShortcutInput,
      fallbackShortcutWrap,
      resetShortcutButton,
      shortcutsStatus
    },
    formatShortcutForDisplay,
    getMessage,
    isMacPlatform: optionsState.isMacPlatform,
    settings: SETTINGS,
    shortcutHotkeyController,
    shortcutKeys: SHORTCUT_KEYS,
    showToast,
    storageArea: optionsState.storageArea,
    windowObj: window
  });
  function loadCurrentShortcut(): void {
    if (optionsState.fallbackShortcutSection) {
      optionsState.fallbackShortcutSection.loadCurrentShortcut();
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
    const visible = nextMode === 'system';
    if (!overlayPageThemeAdaptationRow) {
      document.documentElement.setAttribute('data-options-theme-mode', nextMode);
      return;
    }
    animateOptionsPanelHeight(() => {
      document.documentElement.setAttribute('data-options-theme-mode', nextMode);
      return setConditionalSettingsElementVisibility(overlayPageThemeAdaptationRow, visible);
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
    picker: themePickerController,
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

  themeButtons.forEach((button) => {
    button.addEventListener('click', function() {
      playThemeOptionClickEffect(button);
      setThemeMode(button.getAttribute('data-mode'));
    });
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

  const {
    setNewtabOpenInNewTabState
  } = OPTIONS_CONTROL_EVENTS.createControlEvents({
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
    openOnboardingPageButton,
    refreshOptionsSelectItems,
    renderOverlayFontMissingNotices,
    optionsState
  });

  optionsState.fallbackShortcutSection.bindControls();

  loadCurrentShortcut();
  renderShortcutReferenceList();
  requestAnimationFrame(syncFallbackShortcutWrapWidth);
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

  generalFeaturesSection.bindSettings(settingBinder);
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
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    normalizeSearchResultSourceTypes,
    setSearchResultSourceTypeState,
    storageChanges,
    settingBinder,
    RECENT_COUNT_STORAGE_KEY,
    normalizeRecentCount,
    renderRecentCountControl,
    updateRecentModeTabsVisibility,
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    normalizeNewtabWidthMode,
    newtabWidthSelect,
    setNewtabWidthTabState,
    OVERLAY_SIZE_MODE_STORAGE_KEY,
    normalizeOverlaySizeMode,
    setOverlaySizeTabState,
    OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
    normalizeOverlayEnterAnimation,
    setOverlayEnterAnimationTabState,
    localSettingBinder,
    OVERLAY_FONT_FAMILY_STORAGE_KEY,
    SETTINGS,
    overlayFontSelect,
    OVERLAY_FONT_LABELS_STORAGE_KEY,
    overlayFontFallbackSelect,
    OVERLAY_FONT_FALLBACK_STORAGE_KEY,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    normalizeSearchResultPriority,
    searchResultPrioritySelect,
    setSearchResultPriorityTabState,
    newtabGlassStyleSelect,
    syncNewtabGlassThemeVisibility,
    setNewtabGlassThemeTabState,
    getMessage,
    showToast,
    createOptionsSegmentedControlController,
    optionsSettingsControlsApi,
    registerOptionsToggleControl,
    setConditionalSettingsElementVisibility,
    animateOptionsPanelHeight,
    SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
    searchResultTabPositionSelect,
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    normalizeSearchResultDisplayLimit,
    renderSearchResultDisplayLimitControl,
    renderOverlayWidthControl,
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
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    normalizeNewtabTopContentMode,
    setNewtabTopContentTabState,
    newtabTimeFontSelect,
    renderNewtabTimeFontWeightControl,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    normalizeNewtabTimeFontWeight,
    renderNewtabTimeFontSizeControl,
    renderNewtabTimeOpacityControl,
    setNewtabTimeInkTabState,
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
    setNewtabOpenInNewTabState,
    TOGGLE_SETTINGS,
    toggleSettingControls,
    RESTRICTED_ACTION_STORAGE_KEY,
    restrictedActionSelect,
    setRestrictedActionTabState,
    ensureOverlayFontOption,
    refreshOptionsSelectItems,
    renderOverlayFontMissingNotices,
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
