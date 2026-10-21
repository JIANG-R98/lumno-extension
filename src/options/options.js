import * as LumnoNewtabShortcutsStore from '../newtab/shortcuts/shortcuts-store.js';
import * as LumnoBlacklistUtils from '../shared/blacklist-utils.js';
import * as COMMUNITY_LINKS from '../shared/community-links.js';
import * as NAVIGATION_DISPOSITION from '../shared/navigation-disposition.js';
import * as AGGREGATE_SEARCH_STORE from '../shared/search/aggregate-search-store.js';
import * as SEARCH_UTILS from '../shared/search/search-utils.js';
import * as SETTINGS from '../shared/settings.js';
import * as LumnoShortcutDisplay from '../shared/shortcut-display.js';
import * as LumnoTooltip from '../shared/ui/tooltip.js';
import * as OPTIONS_AGGREGATE_SEARCH_LIST from './options-aggregate-search-list.js';
import * as AGGREGATE_SEARCH from './options-aggregate-search.js';
import * as OPTIONS_BLACKLIST_LISTS from './options-blacklist-lists.js';
import * as LumnoOptionsBlacklist from './options-blacklist.js';
import * as OPTIONS_CONTROL_EVENTS from './options-control-events.js';
import * as LumnoOptionsFallbackShortcut from './options-fallback-shortcut.js';
import * as LumnoOptionsFeedbackSupportSection from './options-feedback-support.js';
import * as OPTIONS_FORMS from './options-forms.js';
import * as OPTIONS_LANGUAGE from './options-language.js';
import * as OPTIONS_NAVIGATION from './options-navigation.js';
import * as OPTIONS_NORMALIZERS from './options-normalizers.js';
import * as PANEL_MOTION from './options-panel-motion.js';
import * as OPTIONS_POPCONFIRM from './options-popconfirm.js';
import * as LumnoOptionsSearchSourceOrder from './options-search-source-order.js';
import * as OPTIONS_SEGMENTED_TABS from './options-segmented-tabs.js';
import * as OPTIONS_SELECT_CONTROLS from './options-select-controls.js';
import * as SETTING_BINDINGS from './options-setting-bindings.js';
import * as OPTIONS_SETTING_BINDS from './options-setting-binds.js';
import * as SHORTCUT_KEYS from './options-shortcut-keys.js';
import * as OPTIONS_SHORTCUT_REFERENCE from './options-shortcut-reference.js';
import * as OPTIONS_SITE_SEARCH_EVENTS from './options-site-search-events.js';
import * as OPTIONS_SITE_SEARCH_FORM from './options-site-search-form.js';
import * as OPTIONS_SITE_SEARCH_LIST from './options-site-search-list.js';
import * as SITE_SEARCH from './options-site-search.js';
import * as OPTIONS_SLIDER_CONTROLS from './options-slider-controls.js';
import * as LumnoOptionsSyncSection from './options-sync-section.js';
import * as LumnoOptionsSyncTransfer from './options-sync-transfer.js';
import * as THEME from './options-theme.js';
import * as OPTIONS_TOGGLE_CONTROLS from './options-toggle-controls.js';
import * as OPTIONS_TOOLTIPS from './options-tooltips.js';
import * as LumnoWebDavOptions from './webdav-options.js';

(function() {
  // Page state shared with the parts of this page split out into
  // src/options/: each receives this one object as `optionsState` and reads
  // and writes the same properties this file does.
  const optionsState = {};
  const optionsRuntimeStartedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  optionsState.optionsStartupStorageBatchPending = false;
  optionsState.optionsStartupRefreshCoalescing = true;
  optionsState.optionsStartupRefreshDeferred = false;
  let optionsReadyMarked = false;

  function markOptionsPerformance(name) {
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

  const panel = document.getElementById('_x_extension_settings_panel_2024_unique_');
  const optionsRoot = document.getElementById('_x_extension_options_root_2024_unique_');
  const tabsRow = document.querySelector('._x_extension_settings_tabs_row_2024_unique_');
  const appearanceContent = document.querySelector('._x_extension_settings_content_2024_unique_[data-content="appearance"]');
  const themePicker = appearanceContent
    ? appearanceContent.querySelector('._x_extension_theme_picker_2024_unique_')
    : null;
  const themeButtons = themePicker ? Array.from(themePicker.querySelectorAll('._x_extension_theme_option_2024_unique_')) : [];
  const tabButtons = Array.from(document.querySelectorAll('._x_extension_settings_tab_button_2024_unique_'));
  const tabContents = Array.from(document.querySelectorAll('._x_extension_settings_content_2024_unique_'));
  const tabsContainer = document.getElementById('_x_extension_settings_tabs_2024_unique_');
  const settingsVersion = document.getElementById('_x_extension_settings_version_2024_unique_');
  const languageSelect = document.getElementById('_x_extension_language_select_2024_unique_');
  const recentModeSelect = document.getElementById('_x_extension_recent_mode_select_2024_unique_');
  const recentModeTabButtons = Array.from(document.querySelectorAll('button[data-recent-mode]'));
  const recentModeTabsWrap = document.getElementById('_x_extension_recent_mode_tabs_wrap_2024_unique_');
  const recentCountControlHost = document.getElementById('_x_extension_recent_count_control_2026_unique_');
  const newtabWidthSelect = document.getElementById('_x_extension_newtab_width_select_2026_unique_');
  const newtabWidthTabsWrap = document.getElementById('_x_extension_newtab_width_tabs_wrap_2026_unique_');
  const newtabWidthTabButtons = Array.from(document.querySelectorAll('button[data-newtab-width]'));
  const overlaySizeTabButtons = Array.from(document.querySelectorAll('button[data-overlay-size]'));
  const overlaySizeTabsWrap = document.getElementById('_x_extension_overlay_size_tabs_wrap_2026_unique_');
  const overlayEnterAnimationTabButtons = Array.from(document.querySelectorAll('button[data-overlay-enter-animation]'));
  const overlayEnterAnimationTabsWrap = document.getElementById('_x_extension_overlay_enter_animation_tabs_wrap_2026_unique_');
  const overlayFontRow = document.getElementById('_x_extension_overlay_font_row_2026_unique_');
  const overlayFontSelect = document.getElementById('_x_extension_overlay_font_select_2026_unique_');
  const overlayFontFallbackRow = document.getElementById('_x_extension_overlay_font_fallback_row_2026_unique_');
  const overlayFontFallbackSelect = document.getElementById(
    '_x_extension_overlay_font_fallback_select_2026_unique_'
  );
  const overlayFontMissing = document.getElementById('_x_extension_overlay_font_missing_2026_unique_');
  const overlayFontFallbackMissing = document.getElementById(
    '_x_extension_overlay_font_fallback_missing_2026_unique_'
  );
  const bookmarkRowsControlHost = document.getElementById('_x_extension_bookmark_rows_control_2026_unique_');
  const bookmarkColumnsSettingRow = document.getElementById('_x_extension_bookmark_columns_setting_row_2026_unique_');
  const bookmarkColumnsControlHost = document.getElementById('_x_extension_bookmark_columns_control_2026_unique_');
  const searchResultDisplayLimitControlHost = document.getElementById('_x_extension_search_result_display_limit_control_2026_unique_');
  const bookmarkFolderIconsVisibleRow = document.getElementById('_x_extension_bookmark_folder_icons_visible_row_2026_unique_');
  const aggregateSearchAutoGroupToggle = document.getElementById(
    '_x_extension_aggregate_search_auto_group_toggle_2026_unique_'
  );
  const selectionQuickActionsToggle = document.getElementById('_x_extension_selection_quick_actions_toggle_2026_unique_');
  const selectionQuickActionsProviderRow = document.getElementById('_x_extension_selection_quick_actions_provider_row_2026_unique_');
  const selectionQuickActionsProviderSelect = document.getElementById('_x_extension_selection_quick_actions_provider_select_2026_unique_');
  const selectionQuickActionsGroupRow = document.getElementById('_x_extension_selection_quick_actions_group_row_2026_unique_');
  const selectionQuickActionsGroupToggle = document.getElementById('_x_extension_selection_quick_actions_group_toggle_2026_unique_');
  const newtabTopContentTabsWrap = document.getElementById('_x_extension_newtab_top_content_tabs_wrap_2026_unique_');
  const newtabTimeFontRow = document.getElementById('_x_extension_newtab_time_font_row_2026_unique_');
  const newtabTimeFontSelect = document.getElementById('_x_extension_newtab_time_font_select_2026_unique_');
  const newtabTimeFontWeightRow = document.getElementById('_x_extension_newtab_time_font_weight_row_2026_unique_');
  const newtabTimeFontWeightControlHost = document.getElementById('_x_extension_newtab_time_font_weight_control_2026_unique_');
  const newtabTimeFontSizeRow = document.getElementById('_x_extension_newtab_time_font_size_row_2026_unique_');
  const newtabTimeFontSizeControlHost = document.getElementById('_x_extension_newtab_time_font_size_control_2026_unique_');
  const newtabTimeOpacityRow = document.getElementById('_x_extension_newtab_time_opacity_row_2026_unique_');
  const newtabTimeOpacityControlHost = document.getElementById('_x_extension_newtab_time_opacity_control_2026_unique_');
  const newtabTimeInkRow = document.getElementById('_x_extension_newtab_time_ink_row_2026_unique_');
  const newtabTimeInkTabsWrap = document.getElementById('_x_extension_newtab_time_ink_tabs_wrap_2026_unique_');
  const newtabTimeSecondsRow = document.getElementById('_x_extension_newtab_time_seconds_row_2026_unique_');
  const newtabTime12HourRow = document.getElementById('_x_extension_newtab_time_12_hour_row_2026_unique_');
  const newtabShortcutsToggle = document.getElementById('_x_extension_newtab_shortcuts_toggle_2026_unique_');
  const newtabShortcutAddRow = document.getElementById('_x_extension_newtab_shortcut_add_row_2026_unique_');
  const newtabShortcutAddToggle = document.getElementById('_x_extension_newtab_shortcut_add_toggle_2026_unique_');
  const newtabShortcutDockMagnificationRow = document.getElementById('_x_extension_newtab_shortcut_dock_magnification_row_2026_unique_');
  const newtabShortcutDockMagnificationToggle = document.getElementById('_x_extension_newtab_shortcut_dock_magnification_toggle_2026_unique_');
  const newtabShortcutColumnsRow = document.getElementById('_x_extension_newtab_shortcut_columns_setting_row_2026_unique_');
  const newtabShortcutColumnsControlHost = document.getElementById('_x_extension_newtab_shortcut_columns_control_2026_unique_');
  const newtabShortcutSizeRow = document.getElementById('_x_extension_newtab_shortcut_size_setting_row_2026_unique_');
  const newtabShortcutSizeControlHost = document.getElementById('_x_extension_newtab_shortcut_size_control_2026_unique_');
  const newtabShortcutGapRow = document.getElementById('_x_extension_newtab_shortcut_gap_setting_row_2026_unique_');
  const newtabShortcutGapControlHost = document.getElementById('_x_extension_newtab_shortcut_gap_control_2026_unique_');
  const restrictedActionSelect = document.getElementById('_x_extension_restricted_action_select_2024_unique_');
  const searchResultPrioritySelect = document.getElementById('_x_extension_search_result_priority_select_2026_unique_');
  const searchResultTabPositionSelect = document.getElementById('_x_extension_search_result_tab_position_select_2026_unique_');
  const newtabGlassStyleSelect = document.getElementById('_x_extension_newtab_glass_style_select_2026_unique_');
  const newtabGlassThemeRow = document.getElementById('_x_extension_newtab_glass_theme_row_2026_unique_');
  const newtabGlassThemeTabsWrap = document.getElementById('_x_extension_newtab_glass_theme_tabs_wrap_2026_unique_');
  const searchResultSourceTypeGroupHost = document.getElementById('_x_extension_search_result_source_types_2026_unique_');
  const searchResultSourceTypeInputs = Array.from(document.querySelectorAll('input[data-search-result-source-type]'));
  const overlayPageThemeAdaptationRow = document.getElementById('_x_extension_overlay_page_theme_adaptation_row_2026_unique_');
  const overlayPageThemeAdaptationInfoHost = document.getElementById('_x_extension_overlay_page_theme_adaptation_info_2026_unique_');
  const restrictedActionInfoHost = document.getElementById('_x_extension_restricted_action_info_2026_unique_');
  const bookmarkRowsInfoHost = document.getElementById('_x_extension_bookmark_rows_info_2026_unique_');
  const bookmarkColumnsInfoHost = document.getElementById('_x_extension_bookmark_columns_info_2026_unique_');
  const faviconBlacklistEditor = document.getElementById('_x_extension_favicon_blacklist_editor_2026_unique_');
  const faviconBlacklistList = document.getElementById('_x_extension_favicon_blacklist_list_2026_unique_');
  const faviconBlacklistForm = document.getElementById('_x_extension_favicon_blacklist_form_2026_unique_');
  const faviconBlacklistClearButton = document.getElementById('_x_extension_favicon_blacklist_clear_2026_unique_');
  const syncStatus = document.getElementById('_x_extension_sync_status_2024_unique_');
  const syncStatusText = document.getElementById('_x_extension_sync_status_text_2024_unique_');
  const syncNowButton = document.getElementById('_x_extension_sync_now_2024_unique_');
  const shortcutSyncSummary = document.getElementById('_x_extension_shortcut_sync_summary_2026_unique_');
  const syncExportButton = document.getElementById('_x_extension_sync_export_2024_unique_');
  const syncImportButton = document.getElementById('_x_extension_sync_import_2024_unique_');
  const syncImportInput = document.getElementById('_x_extension_sync_import_input_2024_unique_');
  const newtabOpenInNewTabToggles = Array.from(document.querySelectorAll('input[data-newtab-open-in-new-tab-surface]'));
  const fallbackShortcutInput = document.getElementById('_x_extension_shortcuts_input_2024_unique_');
  const fallbackShortcutTokens = document.getElementById('_x_extension_shortcuts_tokens_2024_unique_');
  const fallbackShortcutWrap = document.querySelector('._x_extension_shortcuts_hotkey_wrap_2024_unique_');
  const restrictedActionSelectWrap = document.getElementById('_x_extension_restricted_action_tabs_wrap_2024_unique_');
  const restrictedActionTabButtons = Array.from(document.querySelectorAll('button[data-restricted-action]'));
  const searchResultPriorityTabsWrap = document.getElementById('_x_extension_search_result_priority_tabs_wrap_2026_unique_');
  const searchResultPriorityTabButtons = Array.from(document.querySelectorAll('button[data-search-result-priority]'));
  const clearShortcutButton = document.getElementById('_x_extension_clear_shortcut_2024_unique_');
  const resetShortcutButton = document.getElementById('_x_extension_reset_shortcut_2024_unique_');
  const shortcutsStatus = document.getElementById('_x_extension_shortcuts_status_2024_unique_');
  const shortcutReferenceList = document.getElementById('_x_extension_shortcut_reference_list_2026_unique_');
  const openOnboardingPageButton = document.getElementById('_x_extension_open_onboarding_page_2026_unique_');
  const feedbackSupportHost = document.getElementById('_x_extension_feedback_support_2026_unique_');
  const openShortcutsPageButton = document.getElementById('_x_extension_open_shortcuts_page_2026_unique_');
  const siteSearchEngineBuiltinList = document.getElementById('_x_extension_search_engine_builtin_list_2026_unique_');
  const aggregateSearchList = document.getElementById('_x_extension_aggregate_search_list_2026_unique_');
  const aggregateSearchClearButton = document.getElementById('_x_extension_aggregate_search_clear_2026_unique_');
  const siteSearchCustomList = document.getElementById('_x_extension_site_search_custom_list_2024_unique_');
  const siteSearchBuiltinList = document.getElementById('_x_extension_site_search_builtin_list_2024_unique_');
  const siteSearchAiGroup = document.getElementById('_x_extension_site_search_ai_group_2026_unique_');
  const siteSearchAiBuiltinList = document.getElementById('_x_extension_site_search_ai_builtin_list_2026_unique_');
  const siteSearchKeyInput = document.getElementById('_x_extension_site_search_key_2024_unique_');
  const siteSearchNameInput = document.getElementById('_x_extension_site_search_name_2024_unique_');
  const siteSearchTemplateInput = document.getElementById('_x_extension_site_search_template_2024_unique_');
  const siteSearchInsertQueryButton = document.getElementById('_x_extension_site_search_insert_query_2026_unique_');
  const siteSearchAliasInput = document.getElementById('_x_extension_site_search_alias_2024_unique_');
  const siteSearchCategoryButtons = Array.from(document.querySelectorAll(
    'button[data-site-search-category]'
  ));
  const siteSearchForm = document.querySelector('._x_extension_settings_content_2024_unique_[data-content="shortcuts"] ._x_extension_shortcut_form_2024_unique_');
  const siteSearchFormTrigger = document.getElementById('_x_extension_site_search_expand_2024_unique_');
  const siteSearchAddButton = document.getElementById('_x_extension_site_search_add_2024_unique_');
  const siteSearchCancelButton = document.getElementById('_x_extension_site_search_cancel_2024_unique_');
  const siteSearchError = document.getElementById('_x_extension_site_search_error_2024_unique_');
  const builtinResetButton = document.getElementById('_x_extension_builtin_reset_2024_unique_');
  const customClearButton = document.getElementById('_x_extension_custom_clear_2024_unique_');
  const blacklistList = document.getElementById('_x_extension_blacklist_list_2026_unique_');
  const blacklistForm = document.getElementById('_x_extension_blacklist_form_2026_unique_');
  const blacklistClearButton = document.getElementById('_x_extension_blacklist_clear_2026_unique_');
  const toastElement = document.getElementById('_x_extension_toast_2024_unique_');
  const optionsBlacklistListApi = globalThis.LumnoOptionsBlacklistList;
  const optionsAggregateSearchListApi = globalThis.LumnoOptionsAggregateSearchList;
  const optionsFeedbackSupportApi = globalThis.LumnoOptionsFeedbackSupport;
  const optionsInfoButtonApi = globalThis.LumnoOptionsInfoButton;
  const optionsToastApi = globalThis.LumnoOptionsToast;
  const optionsSegmentedControlApi = globalThis.LumnoOptionsSegmentedControl;



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
    AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY,
    SEARCH_BLACKLIST_STORAGE_KEY,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    SYNC_META_STORAGE_KEY,
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY
  } = SETTINGS;
  // Device-only values (the language copy, the shortcut overflow, WebDAV
  // status) and the local-to-sync migration always use chrome.storage.local,
  // whichever area holds the synced settings.
  const localStorageArea = chrome && chrome.storage ? chrome.storage.local || null : null;
  // A closed popconfirm renders its aria-label once; applyI18n re-renders each
  // after a language change so the label follows the chosen language.
  const popconfirmLanguageRefreshers = new Set();


  const {
    showTooltipFor,
    initTooltips,
    refreshCustomSelects,
    syncFallbackShortcutWrapWidth,
    updateFallbackShortcutWrapWidthForContent,
    updateBuiltinResetTooltip,
    updateCustomClearTooltip,
    updateAggregateSearchClearTooltip,
    updateBlacklistClearTooltip,
    showToast,
    beginToast
  } = OPTIONS_TOOLTIPS.createTooltips({
    renderSettingsForms: (...args) => renderSettingsForms(...args),
    fallbackShortcutWrap,
    restrictedActionSelectWrap,
    fallbackShortcutTokens,
    builtinResetButton,
    getMessage: (...args) => getMessage(...args),
    customClearButton,
    aggregateSearchClearButton,
    blacklistClearButton,
    toastElement,
    optionsState
  });

  const SETTINGS_TAB_KEYS = Object.freeze([
    'general',
    'account',
    'appearance',
    'shortcuts',
    'blacklist',
    'labs'
  ]);



  const {
    normalizeSiteSearchTemplate,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    normalizeSiteSearchProvider,
    findSiteSearchKeyConflict,
    setSiteSearchError,
    setLegacySiteSearchDraftCategory,
    setSiteSearchFormExpanded,
    setEditingState,
    insertSiteSearchQueryToken,
    attachSaveButtonAnimation,
    suspendSiteSearchRefresh,
    resetSiteSearchForm
  } = OPTIONS_SITE_SEARCH_FORM.createSiteSearchForm({
    SEARCH_UTILS,
    siteSearchError,
    siteSearchCategoryButtons,
    siteSearchForm,
    siteSearchFormTrigger,
    siteSearchCancelButton,
    getMessage: (...args) => getMessage(...args),
    siteSearchKeyInput,
    siteSearchAddButton,
    siteSearchTemplateInput,
    siteSearchNameInput,
    siteSearchAliasInput,
    optionsState
  });
  // The keys each list shows right now, in order, for the move buttons.
  const renderedSearchSourceKeys = {};

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
    refreshSiteSearchProviders,
    handleSiteSearchListClick
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
    siteSearchEngineBuiltinList,
    siteSearchCustomList,
    siteSearchBuiltinList,
    syncClearButtonAvailability: (...args) => syncClearButtonAvailability(...args),
    customClearButton,
    siteSearchAiBuiltinList,
    initTooltips,
    scrollToOptionsTarget: (...args) => scrollToOptionsTarget(...args),
    normalizeSiteSearchProvider,
    SETTINGS,
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
    SETTINGS_TAB_KEYS,
    tabContents,
    syncFallbackShortcutWrapWidth,
    updateFallbackShortcutWrapWidthForContent,
    refreshSiteSearchProviders,
    tabsRow,
    siteSearchAiGroup,
    siteSearchAiBuiltinList,
    optionsState
  });

  const {
    closeActivePopconfirm,
    syncClearButtonAvailability,
    attachPopconfirm,
    removeSiteSearchItem
  } = OPTIONS_POPCONFIRM.createPopconfirm({
    getMessage: (...args) => getMessage(...args),
    popconfirmLanguageRefreshers,
    saveDisabledSiteSearchKeys,
    refreshSiteSearchProviders,
    resetSiteSearchForm,
    showToast,
    getSiteSearchBuiltinKey: (...args) => getSiteSearchBuiltinKey(...args),
    saveSiteSearchProviderState,
    optionsState
  });

  const {
    getMessage,
    normalizeLocale,
    getSystemLocale,
    normalizeLanguageMode,
    applyLanguageMode
  } = OPTIONS_LANGUAGE.createLanguage({
    renderOverlayFontMissingNotices: (...args) => optionsState.renderOverlayFontMissingNotices(...args),
    popconfirmLanguageRefreshers,
    formatTemplate: (...args) => formatTemplate(...args),
    formatShortcutForDisplay: (...args) => formatShortcutForDisplay(...args),
    fallbackShortcutInput,
    fallbackShortcutTokens,
    SETTINGS,
    LANGUAGE_STORAGE_KEY,
    localStorageArea,
    languageSelect,
    setOptionsSelectState: (...args) => optionsState.setOptionsSelectState(...args),
    renderOptionsInfoButtons,
    renderFeedbackSupport,
    refreshCustomSelects,
    setEditingState,
    updateBuiltinResetTooltip,
    updateCustomClearTooltip,
    updateAggregateSearchClearTooltip,
    updateBlacklistClearTooltip,
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
    renderSettingsNavigation,
    renderSiteSearchList,
    renderAggregateSearchList: (...args) => renderAggregateSearchList(...args),
    renderSearchBlacklistList: (...args) => renderSearchBlacklistList(...args),
    optionsState
  });

  const {
    formatTemplate,
    renderSettingsForms,
    handleReactSiteSearchFormSave,
    getSiteSearchErrorMessage,
    applySavedSiteSearchProviders,
    handleReactSearchBlacklistFormSave,
    handleReactFaviconBlacklistFormSave,
    resetBlacklistForm,
    resetFaviconBlacklistForm,
    setFaviconBlacklistEditorEnabled,
    getBlacklistMatchBadgeConfig,
    buildBlacklistRuleDraft,
    upsertBlacklistItems,
    persistBlacklistItems
  } = OPTIONS_FORMS.createForms({
    getMessage,
    suspendSiteSearchRefresh,
    createPersistentId,
    findSiteSearchKeyConflict,
    saveSiteSearchProviderState,
    refreshSiteSearchProviders,
    renderSiteSearchList,
    showToast,
    saveFaviconRequestBlacklistItems: (...args) => saveFaviconRequestBlacklistItems(...args),
    renderFaviconRequestBlacklistList: (...args) => renderFaviconRequestBlacklistList(...args),
    faviconBlacklistEditor,
    saveSearchBlacklistItems: (...args) => saveSearchBlacklistItems(...args),
    renderSearchBlacklistList: (...args) => renderSearchBlacklistList(...args),
    notifyNewtabSectionsRefresh,
    optionsState
  });

  ({ optionsSelectControlRecords: optionsState.optionsSelectControlRecords, registerOptionsSelectControl: optionsState.registerOptionsSelectControl, refreshOptionsSelectItems: optionsState.refreshOptionsSelectItems, renderOptionsSelectControl: optionsState.renderOptionsSelectControl, setOptionsSelectState: optionsState.setOptionsSelectState, getInstalledFontFamilies: optionsState.getInstalledFontFamilies, renderOverlayFontMissingNotices: optionsState.renderOverlayFontMissingNotices, ensureOverlayFontOption: optionsState.ensureOverlayFontOption, populateOverlayFontOptions: optionsState.populateOverlayFontOptions } = OPTIONS_SELECT_CONTROLS.createSelectControls({
    tabsRow,
    getMessage,
    overlayFontMissing,
    overlayFontFallbackMissing,
    formatTemplate,
    optionsState
  }));

  const optionsSettingsControlsApi = globalThis.LumnoOptionsSettingsControls;
  const optionsSettingsFormsApi = globalThis.LumnoOptionsSettingsForms;
  const optionsSettingsNavigationApi = globalThis.LumnoOptionsSettingsNavigation;
  const optionsShortcutReferenceApi = globalThis.LumnoOptionsShortcutReference;
  const optionsShortcutHotkeyApi = globalThis.LumnoOptionsShortcutHotkey;
  const optionsSiteSearchListApi = globalThis.LumnoOptionsSiteSearchList;
  const optionsThemePickerApi = globalThis.LumnoOptionsThemePicker;
  const shortcutDisplay = LumnoShortcutDisplay;
  optionsState.toastController = optionsToastApi.createToastController(toastElement, {
    windowObj: window,
    duration: 2200
  });
  const feedbackSupportSection = LumnoOptionsFeedbackSupportSection.createFeedbackSupportSection({
    communityLinks: COMMUNITY_LINKS,
    controller: optionsFeedbackSupportApi.createFeedbackSupportController(feedbackSupportHost),
    getLocale: () => (optionsState.currentLanguageMode === 'system' ? getSystemLocale() : normalizeLocale(optionsState.currentLanguageMode)),
    getMessage,
    helpIconUrl: chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL('assets/images/site-search/glyph-lm.png')
      : '../../assets/images/site-search/glyph-lm.png',
    isHelpCenterSearchEnabled: () => optionsState.helpCenterSearchEnabled
  });
  function createOptionsInfoButtonController(host) {
    return optionsInfoButtonApi.createInfoButtonController(host);
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
  function createOptionsSegmentedControlController(host, kind, onSelect) {
    return optionsSegmentedControlApi.createSegmentedControlController(host, {
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
    recentModeTabButtons,
    normalizeOverlaySizeMode: (...args) => normalizeOverlaySizeMode(...args),
    overlaySizeTabButtons,
    normalizeOverlayEnterAnimation: (...args) => normalizeOverlayEnterAnimation(...args),
    normalizeNewtabWidthMode: (...args) => normalizeNewtabWidthMode(...args),
    newtabWidthTabButtons,
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
    restrictedActionTabButtons,
    RESTRICTED_ACTION_STORAGE_KEY,
    RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY,
    normalizeSearchResultPriority: (...args) => normalizeSearchResultPriority(...args),
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
    normalizeAggregateSearchAutoGroupEnabled,
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

  const {
    registerOptionsToggleControl,
    setOptionsToggleState,
    syncSelectionQuickActionsProviderAvailability,
    TOGGLE_SETTINGS,
    toggleSettingControls,
    searchResultSourceTypeItems,
    searchResultSourceTypeController,
    renderSearchResultSourceTypeControl
  } = OPTIONS_TOGGLE_CONTROLS.createToggleControls({
    optionsSettingsControlsApi,
    selectionQuickActionsToggle,
    selectionQuickActionsProviderSelect,
    renderOptionsSelectControl: optionsState.renderOptionsSelectControl,
    selectionQuickActionsProviderRow,
    selectionQuickActionsGroupToggle,
    selectionQuickActionsGroupRow,
    SETTINGS,
    setFaviconBlacklistEditorEnabled,
    syncNewtabShortcutSubcontrolAvailability: (...args) => syncNewtabShortcutSubcontrolAvailability(...args),
    newtabOpenInNewTabToggles,
    getMessage,
    searchResultSourceTypeInputs,
    searchResultSourceTypeGroupHost,
    renderedSearchSourceKeys,
    normalizeSearchResultSourceTypes,
    optionsState
  });

  optionsState.settingsNavigationController = optionsSettingsNavigationApi.createSettingsNavigationController(tabsContainer, {
      onSelect: handleSettingsTabSelection
    });
  const searchBlacklistListController =
    optionsBlacklistListApi.createBlacklistListController(blacklistList, {
      kind: 'search',
      onRemove: (...args) => handleSearchBlacklistRemove(...args),
      onSave: (...args) => handleSearchBlacklistSave(...args)
    });
  const faviconBlacklistListController =
    optionsBlacklistListApi.createBlacklistListController(faviconBlacklistList, {
      kind: 'favicon',
      onRemove: (...args) => handleFaviconBlacklistRemove(...args)
    });
  // Each Search sources list orders on its own; the record keys them by list.
  const SITE_SEARCH_ORDER_LIST_BY_KIND = Object.freeze({
    custom: 'custom',
    'builtin-engine': 'engine',
    'builtin-search': 'site',
    'builtin-ai': 'ai'
  });
  function createSiteSearchListController(host, kind) {
    const listId = SITE_SEARCH_ORDER_LIST_BY_KIND[kind];
    return optionsSiteSearchListApi.createSiteSearchListController(host, {
      kind,
      onLocateDuplicate: locateBuiltinSiteSearchProvider,
      onMove: (fromIndex, toIndex) => optionsState.searchSourceOrderController.moveListItem(
        listId,
        renderedSearchSourceKeys[listId] || [],
        fromIndex,
        toIndex
      ),
      onRemove: removeSiteSearchItem,
      onSave: handleSiteSearchProviderSave
    });
  }
  optionsState.siteSearchCustomListController = createSiteSearchListController(
    siteSearchCustomList,
    'custom'
  );
  optionsState.siteSearchEngineBuiltinListController = createSiteSearchListController(
    siteSearchEngineBuiltinList,
    'builtin-engine'
  );
  optionsState.siteSearchBuiltinListController = createSiteSearchListController(
    siteSearchBuiltinList,
    'builtin-search'
  );
  optionsState.siteSearchAiBuiltinListController = createSiteSearchListController(
    siteSearchAiBuiltinList,
    'builtin-ai'
  );
  const aggregateSearchListController =
    optionsAggregateSearchListApi.createAggregateSearchListController(aggregateSearchList, {
      onMove: (fromIndex, toIndex) => optionsState.searchSourceOrderController.moveListItem(
        'aggregate',
        renderedSearchSourceKeys.aggregate || [],
        fromIndex,
        toIndex
      ),
      onRemove: (...args) => handleAggregateSearchRemove(...args),
      onSave: (...args) => handleAggregateSearchSave(...args)
    });
  optionsState.siteSearchFormController = optionsSettingsFormsApi.createSiteSearchFormController(siteSearchForm, {
      onSave: handleReactSiteSearchFormSave
    });
  optionsState.searchBlacklistFormController = optionsSettingsFormsApi.createBlacklistFormController(blacklistForm, {
      kind: 'search',
      onSave: handleReactSearchBlacklistFormSave
    });
  optionsState.faviconBlacklistFormController = optionsSettingsFormsApi.createBlacklistFormController(faviconBlacklistForm, {
      kind: 'favicon',
      onSave: handleReactFaviconBlacklistFormSave
    });

  // 使用系统字体，避免外链字体依赖。
  if (!panel || themeButtons.length === 0 || tabButtons.length === 0) {
    return;
  }
  optionsState.siteSearchModel = SITE_SEARCH.createSiteSearchModel({
    searchUtils: SEARCH_UTILS,
    aggregateSearchStore: AGGREGATE_SEARCH_STORE
  });
  const {
    getActiveBuiltinSiteSearchProviders,
    getSiteSearchBuiltinKey,
    normalizeAliases
  } = SITE_SEARCH;
  optionsState.enqueueSiteSearchProviderStorageOperation = SITE_SEARCH.createOperationQueue();
  const aggregateSearchModel = AGGREGATE_SEARCH.createAggregateSearchModel({
    aggregateSearchStore: AGGREGATE_SEARCH_STORE
  });
  const syncTransfer = LumnoOptionsSyncTransfer.createSyncTransfer({
    deriveLegacyAutoGroupEnabled: aggregateSearchModel.deriveLegacyAutoGroupEnabled,
    settings: SETTINGS
  });
  ({ runtime: optionsState.providerStorageRuntime, area: optionsState.rawStorageArea } = SETTINGS.getProviderStorage(chrome));
  const startupStorageReadBatch = SETTINGS.createStorageReadBatch(optionsState.rawStorageArea);
  optionsState.storageArea = startupStorageReadBatch.area;
  optionsState.optionsStartupStorageBatchPending = true;
  // Each section registers its storage change handlers here, next to the
  // code that renders it; one chrome.storage listener dispatches to them.
  const storageChanges = SETTING_BINDINGS.createStorageChangeRegistry({
    isPrimaryAreaName: isPrimaryStorageAreaName
  });
  const settingBinder = SETTING_BINDINGS.createSettingBinder({
    storageArea: optionsState.storageArea,
    registry: storageChanges,
    refreshCustomSelects,
    setToggleState: setOptionsToggleState,
    setSelectState: optionsState.setOptionsSelectState
  });
  // Device-only settings (the overlay's local fonts) stay in
  // chrome.storage.local whichever area holds the synced ones.
  const localSettingBinder = SETTING_BINDINGS.createSettingBinder({
    area: 'local',
    storageArea: localStorageArea,
    registry: storageChanges,
    refreshCustomSelects,
    setToggleState: setOptionsToggleState,
    setSelectState: optionsState.setOptionsSelectState
  });

  function finishOptionsStartupStorageBatch(metrics) {
    optionsState.optionsStartupStorageBatchPending = false;
    const root = document.documentElement;
    const values = metrics && typeof metrics === 'object' ? metrics : {};
    if (root) {
      root.setAttribute(
        'data-lumno-options-bootstrap-storage-reads',
        String(Number.isFinite(values.underlyingReadCount) ? values.underlyingReadCount : 0)
      );
      root.setAttribute(
        'data-lumno-options-bootstrap-storage-requests',
        String(Number.isFinite(values.requestCount) ? values.requestCount : 0)
      );
      root.setAttribute(
        'data-lumno-options-bootstrap-storage-keys',
        values.keyCount === null ? 'all' : String(Number.isFinite(values.keyCount) ? values.keyCount : 0)
      );
    }
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
  function isPrimaryStorageAreaName(areaName) {
    return optionsState.providerStorageRuntime.isActiveAreaName(areaName);
  }
  function addStorageChangeListener(listener) {
    return SETTINGS.addStorageChangeListener(chrome, listener);
  }

  optionsState.panelHeightAnimator = PANEL_MOTION.createPanelHeightAnimator({
    documentObj: document,
    panel,
    reserveHost: optionsRoot,
    windowObj: window
  });
  const { setConditionalSettingsElementVisibility } = PANEL_MOTION;
  function animateOptionsPanelHeight(mutateLayout) {
    return optionsState.panelHeightAnimator.animate(mutateLayout);
  }
  const SYNC_KEYS = SETTINGS.CHROME_SYNC_STORAGE_KEYS;
  const SEARCH_SOURCE_ORDER_STORAGE_KEY = SETTINGS.SEARCH_SOURCE_ORDER_STORAGE_KEY;
  optionsState.searchSourceOrderController = LumnoOptionsSearchSourceOrder.createSearchSourceOrderController({
      groupHost: document.getElementById('_x_extension_search_source_group_order_2026_unique_'),
      getMessage,
      showToast: (message, isError) => showToast(message, isError),
      read: () => SETTINGS.readStorageValue(optionsState.storageArea, chrome, SEARCH_SOURCE_ORDER_STORAGE_KEY),
      write: (value) => SETTINGS.writeStorageValue(
        optionsState.rawStorageArea,
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
    });
  optionsState.searchSourceOrderController.attachListDrag(siteSearchCustomList, 'custom', getSearchSourceRowKey);
  optionsState.searchSourceOrderController.attachListDrag(siteSearchEngineBuiltinList, 'engine', getSearchSourceRowKey);
  optionsState.searchSourceOrderController.attachListDrag(siteSearchBuiltinList, 'site', getSearchSourceRowKey);
  optionsState.searchSourceOrderController.attachListDrag(siteSearchAiBuiltinList, 'ai', getSearchSourceRowKey);
  optionsState.searchSourceOrderController.attachListDrag(
    aggregateSearchList,
    'aggregate',
    (row) => row.getAttribute('data-aggregate-id') || ''
  );
  optionsState.searchSourceOrderController.attachLocalDrag(searchResultSourceTypeGroupHost);
  storageChanges.on(SEARCH_SOURCE_ORDER_STORAGE_KEY, (changes) => {
    optionsState.searchSourceOrderController.accept(changes[SEARCH_SOURCE_ORDER_STORAGE_KEY].newValue);
  });
  optionsState.searchSourceOrderController.load();

  function getSearchSourceRowKey(row) {
    return String(row.getAttribute('data-key') || '').toLowerCase();
  }
  // Grouped shortcut state. Its three keys are one save and move together.
  optionsState.blacklistModel = LumnoOptionsBlacklist.createBlacklistModel({
    blacklistUtils: LumnoBlacklistUtils
  });
  ({ buildItemKey: optionsState.buildBlacklistItemKey, formatPatternForDisplay: optionsState.formatBlacklistPatternForDisplay, getInputConfig: optionsState.getBlacklistInputConfig, getPatternInputValue: optionsState.getBlacklistPatternInputValue, normalizeItems: optionsState.normalizeBlacklistItems, normalizeMatchModes: optionsState.normalizeBlacklistMatchModes } = optionsState.blacklistModel);
  optionsState.currentLanguageMode = 'system';
  optionsState.webDavSettingsController = LumnoWebDavOptions.createController({ chromeApi: chrome, getMessage,
      animateLayout: animateOptionsPanelHeight });
  if (searchResultSourceTypeController) {
    renderSearchResultSourceTypeControl(
      searchResultSourceTypeItems.filter((item) => item.checked).map((item) => item.value)
    );
  }
  const shortcutPlatform = shortcutDisplay.getNavigatorPlatform(typeof navigator !== 'undefined' ? navigator : null);
  optionsState.isMacPlatform = shortcutPlatform === 'mac';
  optionsState.defaultSiteSearchProviders = [];
  optionsState.customSiteSearchProviders = [];
  optionsState.customSiteSearchProviderIdsReady = true;
  optionsState.disabledSiteSearchKeys = new Set();
  // Whether the Help Center site search (lm) is on; unknown (null) until the providers load,
  // so the "ask in the search box" demo never shows for someone who turned it off.
  optionsState.helpCenterSearchEnabled = null;
  optionsState.siteSearchProvidersLoaded = false;
  optionsState.aggregateSearches = [];

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
    syncClearButtonAvailability,
    aggregateSearchClearButton,
    renderedSearchSourceKeys,
    getSearchSourceReorderCopy,
    AGGREGATE_SEARCH_STORAGE_KEY,
    getActivePrimaryAreaName,
    SETTINGS,
    AGGREGATE_SEARCH,
    showToast,
    createPersistentId,
    findSiteSearchKeyConflict,
    getSiteSearchErrorMessage,
    optionsState
  });

  optionsState.editingSiteSearchKey = null;
  optionsState.siteSearchDraftCategory = 'site';
  optionsState.activePopconfirm = null;
  optionsState.siteSearchFormExpanded = false;
  optionsState.siteSearchRefreshSuppressUntil = 0;
  let siteSearchRefreshTimer = null;
  optionsState.pendingOptionsScrollTarget = '';
  optionsState.searchBlacklistItems = [];
  optionsState.faviconRequestBlacklistItems = [];
  optionsState.tooltipController = LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_options_tooltip_2026_unique_',
    appendTo: document.body,
    maxWidth: 'min(360px, calc(100vw - 24px))'
  });
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
  optionsState.fallbackSiteSearchProviders = SEARCH_UTILS.getDefaultSiteSearchProviders();

  function createPersistentId(prefix) {
    const safePrefix = String(prefix || 'item').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'item';
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `${safePrefix}-${globalThis.crypto.randomUUID()}`;
    }
    return `${safePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  optionsState.currentRecentMode = 'most';
  optionsState.currentNewtabWidthMode = 'wide';
  optionsState.currentOverlaySizeMode = 'standard';
  optionsState.currentOverlayEnterAnimation = 'elastic';
  // Empty means the bundled Lumno Open Sans stack.
  optionsState.currentOverlayFontFamily = '';
  optionsState.currentOverlayFontFallback = '';
  // Display names of the chosen families, so a face uninstalled since is
  // still named in the missing-font notice.
  optionsState.currentOverlayFontLabels = {};
  // The installed families once the list is read. Null until then (and on
  // Firefox), so nothing is reported missing before it can be checked.
  optionsState.installedOverlayFontFamilies = null;
  optionsState.currentRestrictedAction = 'default';
  optionsState.currentSearchResultPriority = 'autocomplete';
  optionsState.currentSearchResultDisplayLimit = 10;
  optionsState.currentRecentCount = 4;
  optionsState.currentBookmarkCount = 8;
  optionsState.currentBookmarkColumns = 6;
  optionsState.currentNewtabTopContentMode = 'brand';
  optionsState.currentNewtabTimeFontWeight = NEWTAB_TIME_FONT_WEIGHT_DEFAULT;
  optionsState.currentNewtabTimeFontSize = SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT;
  optionsState.currentNewtabTimeOpacity = SETTINGS.NEWTAB_TIME_OPACITY_DEFAULT;
  optionsState.currentNewtabTimeInk = SETTINGS.NEWTAB_TIME_INK_DEFAULT;
  optionsState.currentNewtabGlassStyle = 'none';
  optionsState.currentNewtabGlassTheme = 'follow';
  optionsState.currentNewtabTimeFont = SETTINGS.NEWTAB_TIME_FONT_DEFAULT;
  // Set once the daily quote rows are wired; language refreshes may run earlier.
  optionsState.dailyQuoteSettings = null;
  optionsState.currentNewtabShortcutColumns = NEWTAB_SHORTCUT_COLUMNS_DEFAULT;
  optionsState.currentNewtabShortcutSize = NEWTAB_SHORTCUT_SIZE_DEFAULT;
  optionsState.currentNewtabShortcutGap = NEWTAB_SHORTCUT_GAP_DEFAULT;
  optionsState.currentActiveSettingsTab = 'general';
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
  [
    [languageSelect, 'language'],
    [searchResultTabPositionSelect, 'search-result-tab-position'],
    [newtabGlassStyleSelect, 'newtab-glass-style'],
    [newtabTimeFontSelect, 'newtab-time-font'],
    [selectionQuickActionsProviderSelect, 'selection-quick-actions-provider']
  ].forEach(([select, kind]) => {
    const record = optionsState.registerOptionsSelectControl(select, kind);
    if (record) {
      optionsState.renderOptionsSelectControl(select);
    }
  });
  [[overlayFontMissing, overlayFontSelect], [overlayFontFallbackMissing, overlayFontFallbackSelect]]
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
    if (optionsState.registerOptionsSelectControl(select, 'overlay-font')) {
      optionsState.renderOptionsSelectControl(select);
    }
  });
  optionsState.getInstalledFontFamilies().then((fonts) => {
    const families = fonts
      .map((font) => (font && typeof font.fontId === 'string' ? font.fontId.trim() : ''))
      .filter(Boolean);
    // An empty list means the read failed, not that no font is installed.
    optionsState.installedOverlayFontFamilies = families.length ? new Set(families) : null;
    optionsState.populateOverlayFontOptions(overlayFontSelect, optionsState.currentOverlayFontFamily, 'settings_overlay_font_default', fonts);
    optionsState.populateOverlayFontOptions(
      overlayFontFallbackSelect,
      optionsState.currentOverlayFontFallback,
      'settings_overlay_font_fallback_none',
      fonts
    );
    optionsState.renderOverlayFontMissingNotices();
  });
  // Firefox cannot list fonts; keep the rows visible but inert.
  [[overlayFontRow, overlayFontSelect], [overlayFontFallbackRow, overlayFontFallbackSelect]]
    .forEach(([row, select]) => {
      if (row && select && row.getAttribute('data-unsupported') === 'true') {
        select.disabled = true;
        optionsState.renderOptionsSelectControl(select);
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
    renderSearchResultDisplayLimitControl
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
  syncSelectionQuickActionsProviderAvailability();

  function renderFeedbackSupport() {
    feedbackSupportSection.render();
  }

  renderFeedbackSupport();
  feedbackSupportSection.loadLinks();

  setNewtabWidthTabState(optionsState.currentNewtabWidthMode);
  setOverlaySizeTabState(optionsState.currentOverlaySizeMode);
  setOverlayEnterAnimationTabState(optionsState.currentOverlayEnterAnimation);
  setSearchResultPriorityTabState(optionsState.currentSearchResultPriority);
  setRecentModeTabState(optionsState.currentRecentMode);
  setRestrictedActionTabState(optionsState.currentRestrictedAction);
  setNewtabTopContentTabState(optionsState.currentNewtabTopContentMode);
  setNewtabTimeInkTabState(optionsState.currentNewtabTimeInk);
  setNewtabGlassThemeTabState(optionsState.currentNewtabGlassTheme);

  function notifyNewtabSectionsRefresh(section) {
    if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      return;
    }
    try {
      chrome.runtime.sendMessage(
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

  const syncSection = LumnoOptionsSyncSection.createSyncSection({
    beginToast,
    chromeApi: chrome,
    documentObj: document,
    elements: {
      shortcutSyncSummary,
      syncExportButton,
      syncImportButton,
      syncImportInput,
      syncNowButton,
      syncStatus,
      syncStatusText
    },
    formatTemplate,
    getActivePrimaryAreaName,
    getMessage,
    localStorageArea,
    settings: SETTINGS,
    showToast,
    showTooltipFor,
    storageArea: optionsState.storageArea,
    syncTransfer
  });
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
  function loadCurrentShortcut() {
    optionsState.fallbackShortcutSection.loadCurrentShortcut();
  }
  storageChanges.on(FALLBACK_SHORTCUT_STORAGE_KEY, () => loadCurrentShortcut());

  if (settingsVersion && chrome?.runtime?.getManifest) {
    const manifest = chrome.runtime.getManifest();
    if (manifest?.version) {
      settingsVersion.textContent = `v${manifest.version}`;
    }
    function getOpenDisposition(event, fallback) {
      return NAVIGATION_DISPOSITION.getDisposition(event, fallback);
    }
    function openSettingsVersionRelease(event) {
      event.preventDefault();
      event.stopPropagation();
      if (!chrome?.runtime?.sendMessage) {
        return;
      }
      chrome.runtime.sendMessage({
        action: 'openReleasePage',
        reason: 'options-version',
        disposition: getOpenDisposition(event, 'newTab')
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

  function updateOverlayPageThemeAdaptationVisibility(mode) {
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

  function setThemeMode(mode) {
    optionsState.themeSection.setMode(mode);
  }

  function playThemeOptionClickEffect(button) {
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
    optionsState.themeSection.applyStorageChange(changes[THEME_STORAGE_KEY].newValue);
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
    const tabKey = routeState.tabKey;
    if (!tabKey) {
      return 'general';
    }
    return SETTINGS_TAB_KEYS.includes(tabKey) ? tabKey : 'general';
  }

  function getInitialOptionsTargetKey() {
    const routeState = getOptionsRouteState();
    return routeState.targetKey || '';
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', function() {
      handleSettingsTabSelection(button.getAttribute('data-tab'));
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
    syncSection.migrateStorageIfNeeded(SYNC_KEYS);
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

  syncSection.bindControls();

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
    AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY,
    AGGREGATE_SEARCH_STORAGE_KEY,
    deriveLegacyAggregateSearchAutoGroupEnabled,
    normalizeAggregateSearchAutoGroupEnabled,
    aggregateSearchAutoGroupToggle,
    refreshCustomSelects,
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
    optionsState
  });

  refreshCustomSelects();

  document.addEventListener('click', (event) => {
    if (!optionsState.activePopconfirm) {
      return;
    }
    const wrap = optionsState.activePopconfirm.closest('._x_extension_popconfirm_wrap_2024_unique_');
    if (wrap && wrap.contains(event.target)) {
      return;
    }
    closeActivePopconfirm();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !optionsState.activePopconfirm) {
      return;
    }
    const popconfirm = optionsState.activePopconfirm;
    const closePopconfirm = popconfirm._xOptionsClosePopconfirm;
    if (typeof closePopconfirm !== 'function') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closePopconfirm({ restoreFocus: true });
  });

  setSiteSearchFormExpanded(false);

  storageChanges.on(AGGREGATE_SEARCH_STORAGE_KEY, (changes) => {
    getAggregateSearchStateCoordinator().applyStorageChange(
      changes[AGGREGATE_SEARCH_STORAGE_KEY].newValue
    );
  });

  const {
    loadSearchBlacklistItems,
    saveSearchBlacklistItems,
    loadFaviconRequestBlacklistItems,
    saveFaviconRequestBlacklistItems,
    handleFaviconBlacklistRemove,
    handleSearchBlacklistRemove,
    handleSearchBlacklistSave,
    renderFaviconRequestBlacklistList,
    renderSearchBlacklistList
  } = OPTIONS_BLACKLIST_LISTS.createBlacklistLists({
    SEARCH_BLACKLIST_STORAGE_KEY,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    getMessage,
    getBlacklistMatchBadgeConfig,
    initTooltips,
    showToast,
    notifyNewtabSectionsRefresh,
    buildBlacklistRuleDraft,
    upsertBlacklistItems,
    persistBlacklistItems,
    faviconBlacklistList,
    syncClearButtonAvailability,
    faviconBlacklistClearButton,
    faviconBlacklistListController,
    blacklistList,
    blacklistClearButton,
    searchBlacklistListController,
    optionsState
  });

  storageChanges.on(SEARCH_BLACKLIST_STORAGE_KEY, (changes) => {
    optionsState.searchBlacklistItems = optionsState.normalizeBlacklistItems(changes[SEARCH_BLACKLIST_STORAGE_KEY].newValue);
    renderSearchBlacklistList();
  });
  storageChanges.on(FAVICON_REQUEST_BLACKLIST_STORAGE_KEY, (changes) => {
    optionsState.faviconRequestBlacklistItems = optionsState.normalizeBlacklistItems(
      changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY].newValue
    );
    renderFaviconRequestBlacklistList();
  });

  // A save on this page suspends refreshes briefly so its own write does not
  // re-render the list mid-edit; a change during that window refreshes after.
  storageChanges.on([SITE_SEARCH_STORAGE_KEY, SITE_SEARCH_DISABLED_STORAGE_KEY], () => {
    invalidateSiteSearchProviderRefresh();
    const now = Date.now();
    if (optionsState.siteSearchRefreshSuppressUntil && now < optionsState.siteSearchRefreshSuppressUntil) {
      if (siteSearchRefreshTimer) {
        clearTimeout(siteSearchRefreshTimer);
      }
      const delay = Math.max(optionsState.siteSearchRefreshSuppressUntil - now, 0) + 40;
      siteSearchRefreshTimer = setTimeout(() => {
        siteSearchRefreshTimer = null;
        refreshSiteSearchProviders();
      }, delay);
      return;
    }
    refreshSiteSearchProviders();
  });

  if (siteSearchEngineBuiltinList && siteSearchCustomList && siteSearchBuiltinList) {
    refreshSiteSearchProviders();
  }
  if (aggregateSearchList) {
    // Load failures are reported through onLoadError.
    refreshAggregateSearches().catch(() => {});
  }
  if (blacklistList) {
    loadSearchBlacklistItems().then((items) => {
      optionsState.searchBlacklistItems = items;
      renderSearchBlacklistList();
    });
  }
  if (faviconBlacklistList) {
    loadFaviconRequestBlacklistItems().then((items) => {
      optionsState.faviconRequestBlacklistItems = items;
      renderFaviconRequestBlacklistList();
    });
  }

  OPTIONS_SITE_SEARCH_EVENTS.createSiteSearchEvents({
    siteSearchCustomList,
    handleSiteSearchListClick,
    siteSearchEngineBuiltinList,
    siteSearchBuiltinList,
    siteSearchAiBuiltinList,
    siteSearchCancelButton,
    resetSiteSearchForm,
    siteSearchFormTrigger,
    setSiteSearchFormExpanded,
    siteSearchInsertQueryButton,
    insertSiteSearchQueryToken,
    siteSearchCategoryButtons,
    setLegacySiteSearchDraftCategory,
    siteSearchAddButton,
    attachSaveButtonAnimation,
    suspendSiteSearchRefresh,
    setSiteSearchError,
    siteSearchKeyInput,
    siteSearchNameInput,
    siteSearchTemplateInput,
    normalizeAliases,
    siteSearchAliasInput,
    getMessage,
    findSiteSearchKeyConflict,
    normalizeSiteSearchTemplate,
    getSiteSearchBuiltinKey,
    normalizeSiteSearchProvider,
    createPersistentId,
    saveSiteSearchProviderState,
    renderSiteSearchList,
    refreshSiteSearchProviders,
    showToast,
    builtinResetButton,
    attachPopconfirm,
    loadDefaultSiteSearchProviders,
    loadCustomSiteSearchProviders,
    renderAggregateSearchList,
    customClearButton,
    aggregateSearchClearButton,
    handleAggregateSearchClear,
    blacklistClearButton,
    saveSearchBlacklistItems,
    renderSearchBlacklistList,
    resetBlacklistForm,
    notifyNewtabSectionsRefresh,
    faviconBlacklistClearButton,
    saveFaviconRequestBlacklistItems,
    renderFaviconRequestBlacklistList,
    resetFaviconBlacklistForm,
    optionsState
  });

  addStorageChangeListener(storageChanges.dispatch);
})();
