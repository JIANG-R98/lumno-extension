import * as BLACKLIST_UTILS from '../shared/blacklist-utils.js';
import * as FOLDER_REFERENCES from '../shared/bookmark-folder-reference.js';
import * as LumnoBrowserProfile from '../shared/browser-profile.js';
import * as LumnoCommunityLinks from '../shared/community-links.js';
import * as EXTENSION_ROUTES from '../shared/extension-routes.js';
import * as FAVICON_UTILS from '../shared/favicon/favicon-utils.js';
import * as SHORTCUT_FAVICON from '../shared/favicon/shortcut-favicon.js';
import * as NAVIGATION_DISPOSITION from '../shared/navigation-disposition.js';
import * as PROGRESS_HISTORY from '../shared/progress-history.js';
import * as PROGRESS_MATCH from '../shared/progress-match.js';
import * as AGGREGATE_SEARCH_STORE from '../shared/search/aggregate-search-store.js';
import * as AGGREGATE_SEARCH_SURFACE from '../shared/search/aggregate-search-surface.js';
import * as LumnoHelpCenterSearch from '../shared/search/help-center-search.js';
import * as LumnoImeKeyGuard from '../shared/search/ime-key-guard.js';
import * as SEARCH_INPUT_HISTORY from '../shared/search/search-input-history.js';
import * as SEARCH_UTILS from '../shared/search/search-utils.js';
import * as SITE_SEARCH_STORE from '../shared/search/site-search-store.js';
import * as SUGGESTION_ACTION_MODEL from '../shared/search/suggestion-action-model.js';
import * as SUGGESTION_NAVIGATION from '../shared/search/suggestion-navigation.js';
import * as SHORTCUT_KEY_MATCHER from '../shared/shortcut-key-matcher.js';
import * as SITE_DISPLAY_NAME from '../shared/site-display-name.js';
import * as FEATURE_HINTS from '../shared/ui/feature-hints.js';
import * as NEWTAB_APPEARANCE_MODES from './appearance-modes.js';
import * as NEWTAB_BOOKMARK_ACTIONS from './bookmarks/bookmark-actions.js';
import * as NEWTAB_BOOKMARK_CASCADE_ACTIONS from './bookmarks/bookmark-cascade-actions.js';
import * as NEWTAB_BOOKMARK_CONTEXT_MENU from './bookmarks/bookmark-context-menu.js';
import * as NEWTAB_BOOKMARK_DISPLAY_SETTINGS from './bookmarks/bookmark-display-settings.js';
import * as NEWTAB_BOOKMARK_DRAG_CONTROLLER from './bookmarks/bookmark-drag-controller.js';
import * as NEWTAB_BOOKMARK_DRAG from './bookmarks/bookmark-drag.js';
import * as NEWTAB_BOOKMARK_FOLDER_ICON from './bookmarks/bookmark-folder-icon.js';
import * as NEWTAB_BOOKMARK_MOVE_HISTORY from './bookmarks/bookmark-move-history.js';
import * as NEWTAB_BOOKMARK_PAGER from './bookmarks/bookmark-pager.js';
import * as NEWTAB_BOOKMARK_SECTION from './bookmarks/bookmark-section.js';
import * as NEWTAB_BOOKMARKS_RUNTIME from './bookmarks/bookmarks-runtime.js';
import * as NEWTAB_BOOKMARKS_STORE from './bookmarks/bookmarks-store.js';
import * as NEWTAB_FOLDER_COLORS from './bookmarks/folder-colors.js';
import * as LumnoNewtabFolderItemIcons from './bookmarks/folder-item-icons.js';
import * as NEWTAB_CLIPBOARD_ACTIONS from './clipboard-actions.js';
import * as NEWTAB_CROSS_SURFACE_DRAG from './cross-surface-drag.js';
import * as LumnoNewtabDismissStack from './dismiss-stack.js';
import * as NEWTAB_ENTRY_MOTION from './entry-motion.js';
import * as NEWTAB_FEEDBACK_CONTROL_RUNTIME from './feedback-control.js';
import * as NEWTAB_INPUT_FOCUS from './input-focus.js';
import * as NEWTAB_LAYOUT from './layout.js';
import * as NEWTAB_MODE_COMMANDS from './mode-commands.js';
import * as NEWTAB_PAGE_KEYBOARD from './page-keyboard.js';
import * as NEWTAB_PAGE_LANGUAGE from './page-language.js';
import * as NEWTAB_PAGE_LAYOUT from './page-layout.js';
import * as NEWTAB_PAGE_NAVIGATION from './page-navigation.js';
import * as NEWTAB_PAGE_NOTICES from './page-notices.js';
import * as NEWTAB_PAGE_PREFERENCES from './page-preferences.js';
import * as NEWTAB_PAGE_RESIZE from './page-resize.js';
import * as LumnoNewtabPageState from './page-state.js';
import * as NEWTAB_RECENT_CARD_DRAG from './recent/recent-card-drag.js';
import * as NEWTAB_RECENT_SECTION from './recent/recent-section.js';
import * as NEWTAB_RECENT_SITES_CONTROLLER from './recent/recent-sites-controller.js';
import * as NEWTAB_RECENT_STORE from './recent/recent-sites-store.js';
import * as NEWTAB_RECENT_SOURCES from './recent/recent-sources.js';
import * as NEWTAB_DEFAULT_SEARCH_ENGINE from './search/default-search-engine.js';
import * as NEWTAB_DIRECT_NAVIGATION_SETTLE from './search/direct-navigation-settle.js';
import * as NEWTAB_SEARCH_AUTOCOMPLETE from './search/search-autocomplete.js';
import * as NEWTAB_SEARCH_BOX_CONTROLS from './search/search-box-controls.js';
import * as NEWTAB_SEARCH_BOX from './search/search-box.js';
import * as NEWTAB_SEARCH_INPUT_COMPOSITION from './search/search-input-composition.js';
import * as NEWTAB_SEARCH_MODE_CONTROLLER from './search/search-mode-controller.js';
import * as NEWTAB_SEARCH_MODES from './search/search-modes.js';
import * as NEWTAB_SEARCH_NAVIGATION from './search/search-navigation.js';
import * as NEWTAB_SEARCH_SETTINGS_SYNC from './search/search-settings-sync.js';
import * as NEWTAB_SITE_SEARCH_PROVIDERS from './search/site-search-providers.js';
import * as NEWTAB_SITE_SEARCH_RUNTIME from './search/site-search-runtime.js';
import * as NEWTAB_SUGGESTIONS_CONTROLLER from './search/suggestions-controller.js';
import * as NEWTAB_SUGGESTIONS_LAYOUT from './search/suggestions-layout.js';
import * as NEWTAB_SECTION_HEADERS from './section-headers.js';
import * as NEWTAB_SECTION_LOADERS from './section-loaders.js';
import * as NEWTAB_SECTION_MODE_SELECT from './section-mode-select.js';
import * as LumnoNewtabSectionPanelSettings from './section-panel-settings.js';
import * as NEWTAB_SECTION_RELOAD from './section-reload.js';
import * as NEWTAB_SETTINGS_SYNC from './settings-sync.js';
import * as NEWTAB_BOTTOM_DOCK_RUNTIME from './shortcuts/bottom-dock-runtime.js';
import * as NEWTAB_SHORTCUT_CONTEXT_MENU from './shortcuts/shortcut-context-menu.js';
import * as NEWTAB_SHORTCUT_DOCK from './shortcuts/shortcut-dock.js';
import * as NEWTAB_SHORTCUT_DRAG from './shortcuts/shortcut-drag.js';
import * as NEWTAB_SHORTCUT_ICON_PLATE from './shortcuts/shortcut-icon-plate.js';
import * as NEWTAB_SHORTCUT_ICON_STORE from './shortcuts/shortcut-icon-store.js';
import * as NEWTAB_SHORTCUT_PAGE_ACTIONS from './shortcuts/shortcut-page-actions.js';
import * as NEWTAB_SHORTCUTS_CONTROLLER from './shortcuts/shortcuts-controller.js';
import * as NEWTAB_SHORTCUTS_STORE from './shortcuts/shortcuts-store.js';
import * as NEWTAB_STARTUP_PREFERENCES from './startup-preferences.js';
import * as NEWTAB_STARTUP_STORAGE from './startup-storage.js';
import * as NEWTAB_CARD_THEMES from './theme/card-themes.js';
import * as NEWTAB_FAVICON_THEME from './theme/favicon-theme.js';
import * as NEWTAB_GLASS_SURFACES from './theme/glass-surfaces.js';
import * as NEWTAB_PAGE_FAVICONS from './theme/page-favicons.js';
import * as NEWTAB_SITE_THEME_RESOLVER from './theme/site-theme-resolver.js';
import * as NEWTAB_TOOLTIP_BINDINGS from './tooltip-bindings.js';
import * as NEWTAB_TOOLTIP_CONTROLLERS from './tooltip-controllers.js';
import * as LumnoNewtabQuotes from './top-content/quotes.js';
import * as NEWTAB_TOP_CONTENT_RUNTIME from './top-content/top-content.js';
import * as NEWTAB_URL_POLICY from './url-policy.js';
import * as NEWTAB_VIEWPORT_INSETS from './viewport-insets.js';
import * as NEWTAB_WALLPAPER_PAGE from './wallpaper/wallpaper-page.js';

(function() {
  // Page state shared with the modules split out of this file: each module
  // receives this one object as `pageState` and reads and writes the same
  // properties this file does. page-state.js lists its initial values.
  const pageState = LumnoNewtabPageState.createPageState();
  const root = document.getElementById('_x_extension_newtab_root_2024_unique_');
  const createSearchInput = window._x_extension_createSearchInput_2024_unique_;
  if (!root || typeof createSearchInput !== 'function') {
    return;
  }
  if (document.body) {
    document.body.removeAttribute('data-nt-ready');
  }

  const {
    settingsRuntimeApi,
    providerStorageRuntime,
    rawStorageArea,
    startupStorageReadBatch,
    storageArea
  } = NEWTAB_STARTUP_STORAGE.createStartupStorage({

  });

  // Edge's topSites lists its own promoted sites instead of the user's, so Edge
  // ranks most-visited from history visit counts alone.
  const TOP_SITES_FOLLOW_HISTORY =
    LumnoBrowserProfile.getBrowserInternalScheme(navigator.userAgent) !== 'edge://';
  const startupRecentSourceReadsAt = Date.now();

  const NEWTAB_CONTEXT_MENU_OPEN_VALUE = 'open-in-new-tab';

  const {
    updateRecentContextMenuLanguageStrings,
    openRecentHistoryDialog,
    readRecentOpenTabs,
    readRecentTopSites,
    readRecentHistoryItems,
    releaseStartupRecentSourceReads,
    getRecentSites
  } = NEWTAB_RECENT_SOURCES.createRecentSources({
    t: (...args) => t(...args),
    getRecentContextMenuOptions: (...args) => getRecentContextMenuOptions(...args),
    NEWTAB_CONTEXT_MENU_OPEN_VALUE,
    restoreProgressVersion: (...args) => restoreProgressVersion(...args),
    showToast: (...args) => showToast(...args),
    TOP_SITES_FOLLOW_HISTORY,
    startupRecentSourceReadsAt,
    NEWTAB_RECENT_STORE,
    getRecentStoreOptions: (...args) => getRecentStoreOptions(...args),
    isBrowserPageRecentUrl: (...args) => isBrowserPageRecentUrl(...args),
    pageState
  });

  pageState.startupRecentSourceReads = {
    historyItems: readRecentHistoryItems(),
    topSites: readRecentTopSites(),
    tabs: readRecentOpenTabs()
  };

  const localStorageArea = (chrome && chrome.storage && chrome.storage.local)
    ? chrome.storage.local
    : storageArea;
  const bookmarkTopbarSurfaceStorageArea =
    (chrome && chrome.storage && chrome.storage.local)
      ? chrome.storage.local
      : null;
  const recentSitesStorageArea = storageArea || localStorageArea;
  const storageAreaName = providerStorageRuntime ? providerStorageRuntime.name : (rawStorageArea
    ? (rawStorageArea === (chrome && chrome.storage ? chrome.storage.sync : null) ? 'sync' : 'local')
    : null);
  const recentSitesStorageAreaName = storageAreaName || (recentSitesStorageArea ? 'local' : null);
  function isPrimaryStorageAreaName(areaName) {
    return providerStorageRuntime
      ? providerStorageRuntime.isActiveAreaName(areaName)
      : Boolean(storageAreaName) && areaName === storageAreaName;
  }
  function getExtensionResourceUrl(resourcePath) {
    const normalizedPath = String(resourcePath || '').replace(/^\/+/, '');
    if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return chrome.runtime.getURL(normalizedPath);
    }
    const baseUrl = document.baseURI || window.location.href;
    return new URL(`../../${normalizedPath}`, baseUrl).href;
  }
  function sendRuntimeMessage(message, callback) {
    if (typeof chrome === 'undefined' ||
        !chrome.runtime ||
        typeof chrome.runtime.sendMessage !== 'function') {
      return false;
    }
    try {
      chrome.runtime.sendMessage(message, callback);
      return true;
    } catch (_error) {
      return false;
    }
  }

  const {
    getNewtabVisualViewportInsets
  } = NEWTAB_VIEWPORT_INSETS.createViewportInsets({

  });

  const SETTINGS = settingsRuntimeApi;
  const BROWSER_PROFILE = LumnoBrowserProfile;
  const THEME_STORAGE_KEY = '_x_extension_theme_mode_2024_unique_';
  const LANGUAGE_STORAGE_KEY = '_x_extension_language_2024_unique_';
  const RECENT_MODE_STORAGE_KEY = '_x_extension_recent_mode_2024_unique_';
  const RECENT_COUNT_STORAGE_KEY = '_x_extension_recent_count_2024_unique_';
  const NEWTAB_WIDTH_MODE_STORAGE_KEY = '_x_extension_newtab_width_mode_2026_unique_';
  const NEWTAB_SEARCH_WIDTH_STORAGE_KEY = '_x_extension_newtab_search_width_2026_unique_';
  const NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY = SETTINGS.NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY ||
    '_x_extension_newtab_input_auto_focus_enabled_2026_unique_';
  const NEWTAB_QUOTE_PREFS_STORAGE_KEY = SETTINGS.NEWTAB_QUOTE_PREFS_STORAGE_KEY ||
    '_x_extension_newtab_quote_prefs_2026_unique_';
  const NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY = SETTINGS.NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY ||
    '_x_extension_newtab_feedback_button_visible_2026_unique_';
  const NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY = SETTINGS.NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY ||
    '_x_extension_newtab_appearance_button_visible_2026_unique_';
  const NEWTAB_GLASS_STYLE_STORAGE_KEY = SETTINGS.NEWTAB_GLASS_STYLE_STORAGE_KEY;
  const NEWTAB_GLASS_THEME_STORAGE_KEY = SETTINGS.NEWTAB_GLASS_THEME_STORAGE_KEY;
  // The plates that sit straight on the wallpaper; floating menus and panels keep a fixed dense tint.
  const NEWTAB_GLASS_ADAPTIVE_SELECTOR = [
    '#_x_extension_newtab_root_2024_unique_',
    '.x-nt-shortcut-icon',
    '.x-nt-bookmark-card:not(.x-nt-bookmarks-topbar .x-nt-bookmark-card):not(.x-nt-bookmark-card-drag-preview)' +
      ':not([data-bookmark-page-outgoing] .x-nt-bookmark-card)',
    '.x-nt-recent-card-visual',
    '.x-nt-wallpaper-button',
    '.x-nt-feedback-button',
    '.x-nt-bookmarks-pager-btn:not(.x-nt-bookmarks-topbar *)',
    '.x-nt-section-mode-select ._x_extension_select_trigger_2024_unique_:not(.x-nt-bookmarks-topbar *)',
    '.x-nt-bookmark-cascade-debug-button'
  ].join(',');
  const NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY = SETTINGS.NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY ||
    '_x_extension_newtab_open_in_new_tab_2026_unique_';
  const NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY = SETTINGS.NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY ||
    '_x_extension_number_shortcut_instant_enabled_2026_unique_';
  const MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY =
    SETTINGS.MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY ||
    '_x_extension_macos_ctrl_suggestion_navigation_enabled_2026_unique_';
  const SIMPLE_MODE_ENABLED_STORAGE_KEY = SETTINGS.SIMPLE_MODE_ENABLED_STORAGE_KEY ||
    '_x_extension_simple_mode_enabled_2026_unique_';
  const NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY = SETTINGS.NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY ||
    '_x_extension_newtab_wordmark_visible_2026_unique_';
  const NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY =
    SETTINGS.NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY ||
    '_x_extension_newtab_time_font_weight_2026_unique_';
  const NEWTAB_TIME_FONT_WEIGHT_DEFAULT = Number(SETTINGS.NEWTAB_TIME_FONT_WEIGHT_DEFAULT) || 320;
  const NEWTAB_TIME_FONT_SIZE_STORAGE_KEY = SETTINGS.NEWTAB_TIME_FONT_SIZE_STORAGE_KEY ||
    '_x_extension_newtab_time_font_size_2026_unique_';
  const NEWTAB_TIME_OPACITY_STORAGE_KEY = SETTINGS.NEWTAB_TIME_OPACITY_STORAGE_KEY ||
    '_x_extension_newtab_time_opacity_2026_unique_';
  const NEWTAB_TIME_INK_STORAGE_KEY = SETTINGS.NEWTAB_TIME_INK_STORAGE_KEY ||
    '_x_extension_newtab_time_ink_2026_unique_';
  const NEWTAB_TIME_FONT_STORAGE_KEY = SETTINGS.NEWTAB_TIME_FONT_STORAGE_KEY ||
    '_x_extension_newtab_time_font_2026_unique_';
  const NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY =
    SETTINGS.NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY ||
    '_x_extension_newtab_time_seconds_visible_2026_unique_';
  const NEWTAB_TIME_12_HOUR_STORAGE_KEY = SETTINGS.NEWTAB_TIME_12_HOUR_STORAGE_KEY ||
    '_x_extension_newtab_time_12_hour_2026_unique_';
  const NEWTAB_ZEN_MODE_STORAGE_KEY = '_x_extension_newtab_zen_mode_2026_unique_';
  const NEWTAB_THEME_MODE_STORAGE_KEY = '_x_extension_newtab_theme_mode_2026_unique_';
  const NEWTAB_THEME_SCOPE_STORAGE_KEY = '_x_extension_newtab_theme_scope_2026_unique_';
  const NEWTAB_WALLPAPER_STORAGE_KEY = '_x_extension_newtab_wallpaper_2026_unique_';
  const NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY = '_x_extension_newtab_local_wallpaper_2026_unique_';
  const NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY = '_x_extension_newtab_wallpaper_overlay_2026_unique_';
  const NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY = '_x_extension_newtab_wallpaper_effect_2026_unique_';
  const NEWTAB_FAVICON_STORAGE_KEY = '_x_extension_newtab_favicon_2026_unique_';
  const BOOKMARK_COUNT_STORAGE_KEY = '_x_extension_bookmark_count_2024_unique_';
  const BOOKMARK_COLUMNS_STORAGE_KEY = '_x_extension_bookmark_columns_2024_unique_';
  const BOOKMARK_VIEW_MODE_STORAGE_KEY = '_x_extension_bookmark_view_mode_2026_unique_';
  const BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY = '_x_extension_bookmark_folder_icons_visible_2026_unique_';
  const BOOKMARK_CASCADE_DEBUG_STORAGE_KEY = '_x_extension_bookmark_cascade_debug_2026_unique_';
  const BOOKMARK_TOPBAR_PICK_COLOR_ACTION = 'pick-bookmark-topbar-color';
  const BOOKMARK_TOPBAR_SURFACE_MODE_ACTION = 'set-bookmark-topbar-surface-mode';
  const BOOKMARK_TOPBAR_LAYOUT_ACTION = 'set-bookmark-topbar-layout';
  const DEFAULT_SEARCH_ENGINE_STORAGE_KEY = '_x_extension_default_search_engine_2024_unique_';
  const SEARCH_RESULT_PRIORITY_STORAGE_KEY = '_x_extension_search_result_priority_2026_unique_';
  const OVERLAY_TAB_PRIORITY_STORAGE_KEY = '_x_extension_overlay_tab_priority_2024_unique_';
  const SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY = '_x_extension_search_result_source_types_2026_unique_';
  const SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY = SETTINGS.SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY ||
    '_x_extension_search_result_display_limit_2026_unique_';
  const SEARCH_BLACKLIST_STORAGE_KEY = '_x_extension_search_blacklist_2026_unique_';
  const FAVICON_REQUEST_BLACKLIST_STORAGE_KEY = '_x_extension_favicon_request_blacklist_2026_unique_';
  const FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY = '_x_extension_favicon_enhanced_fetch_enabled_2026_unique_';
  const COMMUNITY_LINKS = LumnoCommunityLinks;
  const LUMNO_FEEDBACK_LINKS_FALLBACK = COMMUNITY_LINKS.FALLBACK_LINKS;
  const NEWTAB_BOOKMARKS_TOPBAR = globalThis.LumnoNewtabBookmarksTopbar;
  const BOOKMARK_TOPBAR_HEIGHT_PX = Math.max(
    0,
    Number(NEWTAB_BOOKMARKS_TOPBAR.HEIGHT_PX) || 36
  );
  // Escape closes only the top open layer (menus, popovers, panels, drags).
  // The folder color dialog handles its own Escape.
  const dismissStack = LumnoNewtabDismissStack.getDismissStack();
  dismissStack.setShouldIgnore(() => Boolean(pageState.folderColorPicker && pageState.folderColorPicker.isOpen()));
  const NEWTAB_TOAST = globalThis.LumnoNewtabToast;
  const NEWTAB_SHORTCUT_DIALOG = globalThis.LumnoNewtabShortcutDialog;
  const NEWTAB_SHORTCUTS_VIEW = globalThis.LumnoNewtabShortcutsView;
  const NEWTAB_FEEDBACK_CONTROL = globalThis.LumnoNewtabFeedbackControl;

  // Text set once at startup may be read before the chosen language loads;
  // controls register here to re-read it whenever the language is applied.
  const languageChangeListeners = [];

  const {
    onLanguageChange,
    normalizeLocale,
    applyDocumentLanguage,
    getSystemLocale,
    sanitizeDisplayText,
    loadLocaleMessages,
    t,
    formatMessage
  } = NEWTAB_PAGE_LANGUAGE.createPageLanguage({
    languageChangeListeners,
    SETTINGS,
    SEARCH_UTILS,
    getExtensionResourceUrl,
    pageState
  });

  const {
    getFeedbackWebLocale,
    openFeedbackExternalUrl,
    updateFeedbackLanguageStrings,
    isFeedbackPopoverOpen,
    closeFeedbackPopover,
    createFeedbackControls
  } = NEWTAB_FEEDBACK_CONTROL_RUNTIME.createFeedbackControlRuntime({
    COMMUNITY_LINKS,
    LUMNO_FEEDBACK_LINKS_FALLBACK,
    getSystemLocale,
    normalizeLocale,
    t,
    openExternalNewTabUrl: (...args) => openExternalNewTabUrl(...args),
    hideTopActionTooltip: (...args) => hideTopActionTooltip(...args),
    NEWTAB_FEEDBACK_CONTROL,
    showTopActionTooltip: (...args) => showTopActionTooltip(...args),
    pageState
  });

  const NEWTAB_SELECT_MENU = globalThis.LumnoNewtabSelectMenu;
  const NEWTAB_TOP_CONTENT = globalThis.LumnoNewtabTopContent;
  const NEWTAB_PAGE_STRUCTURE = globalThis.LumnoNewtabPageStructure;
  const SITE_DISPLAY_NAME_OPTIONS = Object.freeze({
    getBrandName(brandHost, fallback) {
      if (brandHost === 'mp.weixin.qq.com') {
        return t('site_brand_wechat_official', '微信公众号');
      }
      if (brandHost === 'weibo.com') {
        return t('site_search_name_weibo', '微博');
      }
      return fallback;
    }
  });
  const getFigmaFolderSvg = NEWTAB_BOOKMARK_FOLDER_ICON.getFigmaFolderSvg;
  function initFolderPathMorph(icon) {
    NEWTAB_BOOKMARK_FOLDER_ICON.initFolderPathMorph(icon);
    applySavedFolderColor(icon);
  }
  const playFolderPathMorph = NEWTAB_BOOKMARK_FOLDER_ICON.playFolderPathMorph;
  const setFolderPathMorphState = NEWTAB_BOOKMARK_FOLDER_ICON.setFolderPathMorphState;
  const normalizeHost = NEWTAB_FAVICON_THEME.normalizeHost;
  const bookmarksRuntime = NEWTAB_BOOKMARKS_RUNTIME.createBookmarksRuntime({
    chromeApi: typeof chrome !== 'undefined' ? chrome : null,
    store: NEWTAB_BOOKMARKS_STORE,
    normalizeHost
  });
  const SHORTCUT_CONTEXT_MENU_EDIT_VALUE = 'edit';
  const SHORTCUT_CONTEXT_MENU_REMOVE_VALUE = 'remove';
  const SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE = 'hide-add';
  const SHORTCUT_GROUP_MENU_VALUES = Object.freeze({
    addShortcut: 'shortcut-add',
    create: 'group-create',
    rename: 'group-rename',
    addSite: 'group-add-site',
    moveUp: 'group-move-up',
    moveDown: 'group-move-down',
    delete: 'group-delete',
    deleteWithSites: 'group-delete-sites'
  });
  const FOLDER_COLOR_CONTEXT_MENU_VALUE = 'folder-color';
  const BOOKMARK_CONTEXT_MENU_EDIT_VALUE = 'edit';
  const BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE = 'open-in-new-tab-group';


  const {
    hideToast,
    showToast,
    beginToast,
    copyBookmarkUrl,
    copySearchResultUrl
  } = NEWTAB_CLIPBOARD_ACTIONS.createClipboardActions({
    t,
    pageState
  });
  const MAX_NEWTAB_SHORTCUTS = NEWTAB_SHORTCUTS_STORE.DEFAULT_MAX_SHORTCUTS;
  const shortcutTiles = [];
  const SHORTCUT_DIALOG_MODE_EDIT = NEWTAB_SHORTCUT_DIALOG.MODE_EDIT || 'edit';
  const folderColorApi = globalThis.LumnoNewtabFolderColorPicker;
  const FOLDER_COLOR_PRESETS_STORAGE_KEY = SETTINGS.BOOKMARK_FOLDER_COLOR_PRESETS_STORAGE_KEY ||
    '_x_extension_bookmark_folder_color_presets_2026_unique_';

  const SHORTCUT_DIALOG_ITEM_BOOKMARK = 'bookmark';
  const SHORTCUT_DIALOG_ITEM_FOLDER = 'folder';

  const {
    updateBookmarkContextMenuLanguageStrings,
    openBookmarkFolderTabGroupConfirmation,
    openBookmarkEditor
  } = NEWTAB_BOOKMARK_ACTIONS.createBookmarkActions({
    t,
    getBookmarkContextMenuOptions: (...args) => getBookmarkContextMenuOptions(...args),
    BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE,
    NEWTAB_CONTEXT_MENU_OPEN_VALUE,
    BOOKMARK_CONTEXT_MENU_EDIT_VALUE,
    bookmarksRuntime,
    NEWTAB_BOOKMARKS_STORE,
    openShortcutDialog: (...args) => openShortcutDialog(...args),
    formatMessage,
    showToast,
    isShortcutFolderAnchor: (...args) => isShortcutFolderAnchor(...args),
    getFolderItemIcon: (...args) => getFolderItemIcon(...args),
    SHORTCUT_DIALOG_MODE_EDIT,
    SHORTCUT_DIALOG_ITEM_FOLDER,
    SHORTCUT_DIALOG_ITEM_BOOKMARK,
    getFolderItemIconUrl: (...args) => getFolderItemIconUrl(...args),
    getBrowserPageFaviconUrl: (...args) => getBrowserPageFaviconUrl(...args),
    pageState
  });

  const {
    pickShortcutIconPlateColor,
    getShortcutContextMenuOptions,
    updateShortcutLanguageStrings,
    closeShortcutDialog,
    openShortcutDialog,
    getShortcutTileFromNode,
    getShortcutTileId,
    refreshShortcutTileCacheFromDom,
    getShortcutReorderTiles,
    getShortcutById,
    getShortcutTileById,
    handleShortcutNativeDragStart,
    openShortcutEditor,
    isShortcutFolderAnchor
  } = NEWTAB_SHORTCUT_PAGE_ACTIONS.createShortcutPageActions({
    folderColorApi,
    t,
    bindShortcutDialogTooltip: (...args) => bindShortcutDialogTooltip(...args),
    hideShortcutDialogTooltip: (...args) => hideShortcutDialogTooltip(...args),
    folderColorStorage: (...args) => folderColorStorage(...args),
    storageArea,
    FOLDER_COLOR_PRESETS_STORAGE_KEY,
    SHORTCUT_GROUP_MENU_VALUES,
    getShortcutGroups: (...args) => getShortcutGroups(...args),
    NEWTAB_SHORTCUTS_STORE,
    SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE,
    MAX_NEWTAB_SHORTCUTS,
    NEWTAB_CONTEXT_MENU_OPEN_VALUE,
    BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE,
    NEWTAB_BOOKMARKS_STORE,
    bookmarksRuntime,
    getShortcutFolderId: (...args) => getShortcutFolderId(...args),
    SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
    FOLDER_COLOR_CONTEXT_MENU_VALUE,
    SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
    formatMessage,
    updateBookmarkContextMenuLanguageStrings,
    updateRecentContextMenuLanguageStrings,
    createShortcutDialogComponent: (...args) => createShortcutDialogComponent(...args),
    showToast,
    shortcutTiles,
    openBookmarkEditor,
    getShortcutTitle: (...args) => getShortcutTitle(...args),
    SHORTCUT_DIALOG_MODE_EDIT,
    getShortcutIconDataUrl: (...args) => getShortcutIconDataUrl(...args),
    pageState
  });

  const {
    getBookmarkContextMenuOptions,
    isBookmarkContextMenuNode,
    closeBookmarkContextMenu,
    handleBookmarkItemContextMenu
  } = NEWTAB_BOOKMARK_CONTEXT_MENU.createBookmarkContextMenu({
    bookmarksRuntime,
    NEWTAB_BOOKMARKS_STORE,
    BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE,
    t,
    NEWTAB_CONTEXT_MENU_OPEN_VALUE,
    FOLDER_COLOR_CONTEXT_MENU_VALUE,
    BOOKMARK_CONTEXT_MENU_EDIT_VALUE,
    openFolderColorPicker: (...args) => openFolderColorPicker(...args),
    openExternalNewTabUrl: (...args) => openExternalNewTabUrl(...args),
    openBookmarkEditor,
    openBookmarkFolderTabGroupConfirmation,
    deleteBookmarkFromContextTarget: (...args) => deleteBookmarkFromContextTarget(...args),
    hasShortcutForSite: (...args) => hasShortcutForSite(...args),
    addSiteToShortcuts: (...args) => addSiteToShortcuts(...args),
    hasShortcutForBookmarkFolder: (...args) => hasShortcutForBookmarkFolder(...args),
    addBookmarkFolderToShortcuts: (...args) => addBookmarkFolderToShortcuts(...args),
    closeShortcutContextMenu: (...args) => closeShortcutContextMenu(...args),
    closeRecentContextMenu: (...args) => closeRecentContextMenu(...args),
    hideCursorTooltip: (...args) => hideCursorTooltip(...args),
    pageState
  });

  const shortcutFolderRuntime = FOLDER_REFERENCES.createRuntime({ chrome });
  shortcutFolderRuntime.ready.catch((error) => {
    console.warn('[Lumno] Could not load shortcut folder bindings.', error);
  });
  const TAB_RANK_SCORE_DEBUG_STORAGE_KEY = '_x_extension_tab_rank_score_debug_2026_unique_';
  const FAVICON_CACHE_BOOT_WAIT_MS = 120;
  const PINNED_RECENT_SITES_STORAGE_KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';
  const HIDDEN_RECENT_SITES_STORAGE_KEY = '_x_extension_newtab_hidden_recent_sites_2026_unique_';
  const NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY = NEWTAB_SHORTCUTS_STORE.SHORTCUTS_LOCAL_OVERFLOW_KEY;
  const NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY = '_x_extension_newtab_shortcuts_visible_2026_unique_';
  const NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY = '_x_extension_newtab_shortcut_add_visible_2026_unique_';
  const NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY = '_x_extension_newtab_shortcut_dock_magnification_enabled_2026_unique_';
  const NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY = SETTINGS.NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY ||
    '_x_extension_newtab_shortcut_width_2026_unique_';
  const NEWTAB_SHORTCUT_WIDTH_MIN = Number.isFinite(Number(SETTINGS.NEWTAB_SHORTCUT_WIDTH_MIN))
    ? Number(SETTINGS.NEWTAB_SHORTCUT_WIDTH_MIN)
    : 360;
  const NEWTAB_SHORTCUT_WIDTH_MAX = Number.isFinite(Number(SETTINGS.NEWTAB_SHORTCUT_WIDTH_MAX))
    ? Number(SETTINGS.NEWTAB_SHORTCUT_WIDTH_MAX)
    : 1440;
  const NEWTAB_SHORTCUT_WIDTH_DEFAULT = Number.isFinite(Number(SETTINGS.NEWTAB_SHORTCUT_WIDTH_DEFAULT))
    ? Number(SETTINGS.NEWTAB_SHORTCUT_WIDTH_DEFAULT)
    : 920;
  const NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY = SETTINGS.NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY ||
    '_x_extension_newtab_shortcut_columns_2026_unique_';
  const NEWTAB_SHORTCUT_COLUMNS_MIN = Number.isFinite(Number(SETTINGS.NEWTAB_SHORTCUT_COLUMNS_MIN))
    ? Number(SETTINGS.NEWTAB_SHORTCUT_COLUMNS_MIN)
    : 4;
  const NEWTAB_SHORTCUT_COLUMNS_MAX = Number.isFinite(Number(SETTINGS.NEWTAB_SHORTCUT_COLUMNS_MAX))
    ? Number(SETTINGS.NEWTAB_SHORTCUT_COLUMNS_MAX)
    : 16;
  const NEWTAB_SHORTCUT_COLUMNS_DEFAULT = Number.isFinite(
    Number(SETTINGS.NEWTAB_SHORTCUT_COLUMNS_DEFAULT)
  )
    ? Number(SETTINGS.NEWTAB_SHORTCUT_COLUMNS_DEFAULT)
    : 10;
  const NEWTAB_SHORTCUT_SIZE_STORAGE_KEY = SETTINGS.NEWTAB_SHORTCUT_SIZE_STORAGE_KEY ||
    '_x_extension_newtab_shortcut_size_2026_unique_';
  const NEWTAB_SHORTCUT_SIZE_MIN = Number.isFinite(Number(SETTINGS.NEWTAB_SHORTCUT_SIZE_MIN))
    ? Number(SETTINGS.NEWTAB_SHORTCUT_SIZE_MIN)
    : 48;
  const NEWTAB_SHORTCUT_SIZE_MAX = Number.isFinite(Number(SETTINGS.NEWTAB_SHORTCUT_SIZE_MAX))
    ? Number(SETTINGS.NEWTAB_SHORTCUT_SIZE_MAX)
    : 112;
  const NEWTAB_SHORTCUT_SIZE_DEFAULT = Number.isFinite(
    Number(SETTINGS.NEWTAB_SHORTCUT_SIZE_DEFAULT)
  )
    ? Number(SETTINGS.NEWTAB_SHORTCUT_SIZE_DEFAULT)
    : 64;
  const NEWTAB_SHORTCUT_GAP_STORAGE_KEY = SETTINGS.NEWTAB_SHORTCUT_GAP_STORAGE_KEY ||
    '_x_extension_newtab_shortcut_gap_2026_unique_';
  const NEWTAB_SHORTCUT_GAP_MIN = Number.isFinite(Number(SETTINGS.NEWTAB_SHORTCUT_GAP_MIN))
    ? Number(SETTINGS.NEWTAB_SHORTCUT_GAP_MIN)
    : 0;
  const NEWTAB_SHORTCUT_GAP_MAX = Number.isFinite(Number(SETTINGS.NEWTAB_SHORTCUT_GAP_MAX))
    ? Number(SETTINGS.NEWTAB_SHORTCUT_GAP_MAX)
    : 24;
  const NEWTAB_SHORTCUT_GAP_DEFAULT = Number.isFinite(
    Number(SETTINGS.NEWTAB_SHORTCUT_GAP_DEFAULT)
  )
    ? Number(SETTINGS.NEWTAB_SHORTCUT_GAP_DEFAULT)
    : 4;
  const NEWTAB_SHORTCUT_ICONS_STORAGE_KEY =
    NEWTAB_SHORTCUT_ICON_STORE.DEFAULT_STORAGE_KEY ||
    '_x_extension_newtab_shortcut_icons_2026_unique_';
  const NEWTAB_SHORTCUT_FAVICON_CACHE_STORAGE_KEY =
    SHORTCUT_FAVICON.DEFAULT_STORAGE_KEY ||
    '_x_extension_newtab_shortcut_favicon_cache_2026_unique_';
  const SITE_SEARCH_ICON_CACHE_STORAGE_KEY =
    SHORTCUT_FAVICON.SITE_SEARCH_STORAGE_KEY ||
    '_x_extension_site_search_icon_cache_canonical_2026_unique_';
  const siteSearchIconCacheOptions = SHORTCUT_FAVICON.SITE_SEARCH_CACHE_OPTIONS || {
    cacheTtlMs: 1000 * 60 * 60 * 24 * 180,
    cacheMaxEntries: 40,
    maxDataUrlLength: 192 * 1024
  };
  const MAX_PINNED_RECENT_SITES = 3;
  const NEWTAB_SHORTCUTS_CRITICAL_SYNC_RESERVE_BYTES = NEWTAB_SHORTCUTS_STORE.DEFAULT_SHORTCUTS_SYNC_RESERVE_BYTES;
  const NEWTAB_SHORTCUTS_STORAGE_KEYS = NEWTAB_SHORTCUTS_STORE.SHORTCUT_STORAGE_KEYS;
  const pageSearchParams = new URLSearchParams(window.location.search || '');
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const initialThemeReadyPromise = new Promise((resolve) => {
    pageState.resolveInitialThemeReady = resolve;
  });

  const {
    bookmarkTopbarStorageKeys,
    normalizeBookmarkViewMode,
    shouldRepairBookmarkViewModeStorageValue,
    persistBookmarkViewMode,
    loadInitialBookmarkViewMode,
    getEffectiveBookmarkTopbarSurfaceMode,
    getBookmarkTopbarLayout,
    syncBookmarkTopbarSurfaceAppearance,
    loadInitialBookmarkTopbarSurfaceMode,
    syncBookmarkTopbarSurfaceColorForTheme,
    loadInitialBookmarkTopbarSurfaceColors,
    registerStorageChangeHandlers: registerBookmarkDisplayStorageChanges,
    handleBookmarkModeMenuAction
  } = NEWTAB_BOOKMARK_DISPLAY_SETTINGS.createBookmarkDisplaySettings({
    storageArea,
    BOOKMARK_VIEW_MODE_STORAGE_KEY,
    applyBookmarkViewMode: (...args) => applyBookmarkViewMode(...args),
    localStorageArea,
    isPrimaryStorageAreaName,
    NEWTAB_BOOKMARKS_TOPBAR,
    bookmarkTopbarSurfaceStorageArea,
    updateBookmarkModeMenu: (...args) => updateBookmarkModeMenu(...args),
    setNewtabTopLayout: (...args) => setNewtabTopLayout(...args),
    scheduleWallpaperAdaptiveToneUpdate: (...args) => scheduleWallpaperAdaptiveToneUpdate(...args),
    initialThemeReadyPromise,
    showToast,
    t,
    BOOKMARK_TOPBAR_PICK_COLOR_ACTION,
    BOOKMARK_TOPBAR_SURFACE_MODE_ACTION,
    BOOKMARK_TOPBAR_LAYOUT_ACTION,
    pageState
  });
  const initialLanguageReadyPromise = new Promise((resolve) => {
    pageState.resolveInitialLanguageReady = resolve;
  });
  pageState.resolveInitialBookmarkViewModeReady = null;
  const initialBookmarkViewModeReadyPromise = new Promise((resolve) => {
    pageState.resolveInitialBookmarkViewModeReady = resolve;
    if (!storageArea) {
      resolve();
    }
  });
  const recentCards = [];
  const bookmarkCards = [];
  const suggestionItems = [];
  // Progress tracking (Labs): the switch and the versions tracked cards left.
  pageState.progressTrackingEnabled = false;
  pageState.initialPinnedRecentSitesReadyTask = Promise.resolve([]);
  pageState.initialHiddenRecentSitesReadyTask = Promise.resolve([]);
  pageState.currentMessages = null;
  pageState.currentLanguageMode = 'system';
  pageState.currentResolvedLocale = null;
  let toastElement = null;
  pageState.toastController = null;
  const newtabEntryAnimationReadyPromise = new Promise((resolve) => {
    pageState.resolveNewtabEntryAnimationReady = resolve;
  });
  pageState.bookmarkViewModeRevision = 0;
  pageState.feedbackControl = null;
  pageState.feedbackReactController = null;
  pageState.feedbackButton = null;
  pageState.feedbackLinks = LUMNO_FEEDBACK_LINKS_FALLBACK;
  pageState.newtabTimeFontWeight = NEWTAB_TIME_FONT_WEIGHT_DEFAULT;
  pageState.newtabTimeFontSize = Number(SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT) || 54;
  pageState.newtabTimeOpacity = Number(SETTINGS.NEWTAB_TIME_OPACITY_DEFAULT) || 100;
  pageState.newtabTimeInk = SETTINGS.NEWTAB_TIME_INK_DEFAULT || 'auto';
  pageState.newtabTimeFont = SETTINGS.NEWTAB_TIME_FONT_DEFAULT || 'open-sans';
  pageState.bookmarkCascadeRuntime = null;
  pageState.bookmarkTopbarRuntime = null;
  pageState.bookmarkDragState = null;
  const bookmarkMoveHistory = NEWTAB_BOOKMARK_MOVE_HISTORY.createBookmarkMoveHistory({ maxEntries: 30 });
  pageState.bookmarkContextMenu = null;
  pageState.bookmarkContextMenuTarget = null;
  pageState.recentContextMenu = null;
  pageState.recentContextMenuTarget = null;
  pageState.shortcutSection = null;
  pageState.shortcutGrid = null;
  pageState.addShortcutButton = null;
  pageState.shortcutDialogController = null;
  pageState.recentHistoryDialogController = null;
  pageState.shortcutContextMenu = null;
  pageState.shortcutContextMenuTarget = null;
  pageState.newtabShortcuts = [];
  pageState.newtabShortcutColumns = NEWTAB_SHORTCUT_COLUMNS_DEFAULT;
  pageState.newtabShortcutSize = NEWTAB_SHORTCUT_SIZE_DEFAULT;
  pageState.newtabShortcutGap = NEWTAB_SHORTCUT_GAP_DEFAULT;

  const {
    isShortcutContextMenuOpen,
    isShortcutContextMenuNode,
    clearShortcutContextMenuTileActive,
    applyShortcutContextMenuDockHover,
    closeShortcutContextMenu,
    handleShortcutContextMenu,
    openShortcutAddContextMenu,
    openShortcutGroupMenu
  } = NEWTAB_SHORTCUT_CONTEXT_MENU.createShortcutContextMenu({
    getShortcutDockIcon: (...args) => getShortcutDockIcon(...args),
    setShortcutDockHover: (...args) => setShortcutDockHover(...args),
    resetShortcutDockHover: (...args) => resetShortcutDockHover(...args),
    getShortcutTileFromNode,
    getShortcutById,
    SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE,
    hideShortcutAddFromContextMenu: (...args) => hideShortcutAddFromContextMenu(...args),
    FOLDER_COLOR_CONTEXT_MENU_VALUE,
    openFolderColorPicker: (...args) => openFolderColorPicker(...args),
    getShortcutFolderId: (...args) => getShortcutFolderId(...args),
    SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
    openShortcutEditor,
    NEWTAB_CONTEXT_MENU_OPEN_VALUE,
    openShortcutUrl: (...args) => openShortcutUrl(...args),
    openExternalNewTabUrl: (...args) => openExternalNewTabUrl(...args),
    SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
    removeShortcutById: (...args) => removeShortcutById(...args),
    BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE,
    openBookmarkFolderTabGroupConfirmation,
    t,
    getShortcutContextMenuOptions,
    closeRecentContextMenu: (...args) => closeRecentContextMenu(...args),
    hideShortcutTooltip: (...args) => hideShortcutTooltip(...args),
    getShortcutTileId,
    SHORTCUT_GROUP_MENU_VALUES,
    openShortcutGroupDialog: (...args) => openShortcutGroupDialog(...args),
    openShortcutAddDialog: (...args) => openShortcutAddDialog(...args),
    moveShortcutGroup: (...args) => moveShortcutGroup(...args),
    deleteShortcutGroup: (...args) => deleteShortcutGroup(...args),
    confirmDeleteShortcutGroupWithSites: (...args) => confirmDeleteShortcutGroupWithSites(...args),
    pageState
  });

  const {
    getShortcutDockIcon,
    applyNewtabShortcutDockMagnification,
    resetShortcutDockHover,
    setShortcutDockHover,
    handleShortcutDockPointerOver,
    handleShortcutDockPointerMove,
    syncShortcutDockFolderMenu
  } = NEWTAB_SHORTCUT_DOCK.createShortcutDock({
    isShortcutDragActive: (...args) => isShortcutDragActive(...args),
    isBookmarkDragActive: () => isBookmarkDragActive() ||
      Boolean(pageState.recentCardDragRuntime && pageState.recentCardDragRuntime.isRecentCardDragActive()),
    isShortcutContextMenuOpen,
    applyShortcutContextMenuDockHover,
    clearShortcutContextMenuTileActive,
    getShortcutTileFromNode,
    pageState
  });

  pageState.shortcutDockPendingPointerX = Number.NaN;
  // Set once the recent-card drag runtime exists; earlier helpers ask it lazily.
  pageState.recentCardDragRuntime = null;
  const shortcutGroupHeaders = [];
  const LEGACY_FOLDER_COLORS_STORAGE_KEY = NEWTAB_BOOKMARK_FOLDER_ICON.FOLDER_COLORS_STORAGE_KEY;
  const FOLDER_COLOR_REFS_STORAGE_KEY = NEWTAB_BOOKMARK_FOLDER_ICON.FOLDER_COLOR_REFS_STORAGE_KEY;

  const defaultSiteSearchProviders = SEARCH_UTILS.getDefaultSiteSearchProviders();

  const SITE_SEARCH_STORAGE_KEY = '_x_extension_site_search_custom_2024_unique_';
  const SITE_SEARCH_DISABLED_STORAGE_KEY = '_x_extension_site_search_disabled_2024_unique_';

  const {
    buildSearchUrl,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    isAggregateSearchProvider,
    runSiteSearchProviderQuery,
    getProviderFaviconPageUrl,
    getProviderIcon,
    attachInputModeProviderIcon,
    getSiteSearchProviders,
    reloadSiteSearchProvidersFromStorage,
    getAggregateSearches,
    createAggregateSearchScopeProvider,
    getSiteSearchDisplayName,
    getSiteSearchActionTitle,
    getSiteSearchPrefixText,
    findProviderForSuggestionMatch,
    getInlineSiteSearchCandidate,
    promoteStrongNavigationMatch,
    getKeywordSearchSuggestionState,
    getTopSiteMatchCandidate,
    promoteTopSiteMatch,
    getProviderHost,
    getSiteSearchTriggerCandidate,
    normalizeEnabledSearchResultSourceTypes,
    normalizeSearchResultDisplayLimit,
    getLocalSearchScopeCandidate,
    getLocalSearchScopeLabel,
    getLocalSearchScopeIconClass,
    getSearchModeProviderId
  } = NEWTAB_SITE_SEARCH_PROVIDERS.createSiteSearchProviders({
    SEARCH_UTILS,
    AGGREGATE_SEARCH_STORE,
    AGGREGATE_SEARCH_SURFACE,
    showToast,
    t,
    navigateToUrl: (...args) => navigateToUrl(...args),
    SHORTCUT_FAVICON,
    getPageFaviconUrlResolver: (...args) => getPageFaviconUrlResolver(...args),
    siteSearchIconCacheOptions,
    getExtensionResourceUrl,
    getCanonicalPageUrlForFavicon: (...args) => getCanonicalPageUrlForFavicon(...args),
    getHostFromUrl: (...args) => getHostFromUrl(...args),
    getPageFaviconRenderCandidates: (...args) => getPageFaviconRenderCandidates(...args),
    isFaviconProxyUrl: (...args) => isFaviconProxyUrl(...args),
    attachFaviconWithFallbacks: (...args) => attachFaviconWithFallbacks(...args),
    SITE_SEARCH_STORE,
    storageArea,
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    defaultSiteSearchProviders,
    formatMessage,
    getDirectNavigationUrl: (...args) => getDirectNavigationUrl(...args),
    getUrlDisplay: (...args) => getUrlDisplay(...args),
    getHelpCenterLocale: (...args) => getHelpCenterLocale(...args),
    SETTINGS,
    pageState
  });

  const defaultAccentColor = NEWTAB_FAVICON_THEME.defaultAccentColor;
  const mixColor = NEWTAB_FAVICON_THEME.mixColor;
  const stableHashCode = NEWTAB_FAVICON_THEME.stableHashCode;
  const rgbToCss = NEWTAB_FAVICON_THEME.rgbToCss;
  const rgbToCssAlpha = NEWTAB_FAVICON_THEME.rgbToCssAlpha;
  const rgbToCssParts = NEWTAB_FAVICON_THEME.rgbToCssParts;
  const parseCssColor = NEWTAB_FAVICON_THEME.parseCssColor;
  const getReadableTextColor = NEWTAB_FAVICON_THEME.getReadableTextColor;
  const getBrandAccentForUrl = NEWTAB_FAVICON_THEME.getBrandAccentForUrl;
  const buildFallbackThemeForHost = NEWTAB_FAVICON_THEME.buildFallbackThemeForHost;
  const extractAverageColor = NEWTAB_FAVICON_THEME.extractAverageColor;
  const defaultTheme = NEWTAB_FAVICON_THEME.createDefaultTheme();
  const urlHighlightTheme = NEWTAB_FAVICON_THEME.createUrlHighlightTheme();

  const {
    normalizeFaviconHost,
    isFaviconProxyUrl,
    themeColorCache,
    themeHostCache,
    getHostFromUrl,
    getCanonicalPageUrlForFavicon,
    normalizeAccentRgb,
    normalizeThemeConfidence,
    getThemeSourcePriority,
    getThemeSource,
    buildThemeFromAccent,
    isLowConfidenceTheme,
    isPersistableTheme,
    getProviderThemeHost,
    getThemeHostForSuggestion,
    setResolvedThemeForHost,
    getThemeForProvider,
    getThemeForSuggestion,
    getImmediateThemeForSuggestion,
    shouldUseUrlFallbackThemeForSuggestion,
    scheduleThemeResolutionFlush,
    queueThemeForTarget,
    isNewtabDarkMode,
    getThemeForMode,
    getHoverColors,
    getNeutralHoverActionColors,
    applyThemeVariables,
    applyMarkVariables
  } = NEWTAB_SITE_THEME_RESOLVER.createSiteThemeResolver({
    NEWTAB_FAVICON_THEME,
    FAVICON_UTILS,
    getExtensionResourceUrl,
    normalizeHost,
    parseCssColor,
    defaultAccentColor,
    defaultTheme,
    getProviderHost,
    recentCards,
    applyRecentCardTheme: (...args) => applyRecentCardTheme(...args),
    bookmarkCards,
    applyBookmarkCardTheme: (...args) => applyBookmarkCardTheme(...args),
    shortcutTiles,
    applyShortcutTileTheme: (...args) => applyShortcutTileTheme(...args),
    suggestionItems,
    setSiteSearchPrefix: (...args) => setSiteSearchPrefix(...args),
    updateSelection: (...args) => updateSelection(...args),
    setPersistedSiteThemeEntry: (...args) => setPersistedSiteThemeEntry(...args),
    getPersistedSiteThemeEntry: (...args) => getPersistedSiteThemeEntry(...args),
    getPageFaviconUrlResolver: (...args) => getPageFaviconUrlResolver(...args),
    getBrandAccentForUrl,
    extractAverageColor,
    getProviderIcon,
    isHostFaviconVisitDirty: (...args) => isHostFaviconVisitDirty(...args),
    stableHashCode,
    getThemeSourceForSuggestion: (...args) => getThemeSourceForSuggestion(...args),
    areFaviconRenderCachesReady: (...args) => areFaviconRenderCachesReady(...args),
    pageState
  });

  // Firefox: index the browser's own cached icons, which stand in for the
  // missing _favicon endpoint (see createBrowserIconIndex).
  pageState.firefoxBrowserIcons = BROWSER_PROFILE.isFirefoxExtensionRuntime()
    ? FAVICON_UTILS.createBrowserIconIndex()
    : null;
  pageState.firefoxBrowserIconsReady = pageState.firefoxBrowserIcons
    ? pageState.firefoxBrowserIcons.load(chrome).catch(() => {})
    : Promise.resolve();
  const {
    isEnglishQuery,
    getUrlDisplay,
    isBrowserPageRecentUrl,
    isOwnExtensionUrl,
    getOwnExtensionPageDisplay,
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    getBrowserPageFaviconUrl,
    getPageFaviconCandidateUrl,
    getPageFaviconRenderCandidates,
    isLocalNetworkHost,
    shouldBlockFaviconForHost,
    shouldAvoidDirectFaviconForHost,
    normalizeSearchBlacklistItems,
    normalizeFaviconRequestBlacklistItems,
    normalizeFaviconEnhancedFetchEnabled,
    loadSearchBlacklistItems,
    isUrlBlockedByFaviconRequestBlacklist,
    getNewtabStrictFaviconReason,
    isNewtabEnhancedFaviconFetchEnabled,
    loadFaviconRequestBlacklistItems,
    loadFaviconEnhancedFetchEnabled,
    filterBlacklistedSuggestions,
    limitSuggestionsForDisplay,
    shouldExcludeFromRecentSites
  } = NEWTAB_URL_POLICY.createUrlPolicy({
    EXTENSION_ROUTES,
    t,
    getPageFaviconUrlResolver: (...args) => getPageFaviconUrlResolver(...args),
    normalizeFaviconHost,
    getExtensionResourceUrl,
    FAVICON_UTILS,
    BLACKLIST_UTILS,
    SETTINGS,
    storageArea,
    SEARCH_BLACKLIST_STORAGE_KEY,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
    SEARCH_UTILS,
    getBrowserIconUrl: pageState.firefoxBrowserIcons ? pageState.firefoxBrowserIcons.get : null,
    pageState
  });

  // A press made while a card context menu is open belongs to the menu:
  // choosing an item, or dismissing it. So do presses shortly after it, the
  // rest of a double-click or one through the fading menu. Cards ignore the
  // press and the click it ends in, so none opens the card underneath.
  const CONTEXT_MENU_CLICK_THROUGH_GUARD_MS = 500;
  const CONTEXT_MENU_PRESS_CLICK_MAX_MS = 1000;
  let contextMenuPressedAt = 0;
  let lastPressAt = 0;
  let lastPressBelongsToMenu = false;
  document.addEventListener('pointerdown', () => {
    const now = Date.now();
    lastPressAt = now;
    lastPressBelongsToMenu = now - contextMenuPressedAt < CONTEXT_MENU_CLICK_THROUGH_GUARD_MS;
    if (document.querySelector('.x-nt-shortcut-context-menu-portal[data-open="true"]')) {
      contextMenuPressedAt = now;
      lastPressBelongsToMenu = true;
    }
  }, true);

  function isCardActivationSuppressed() {
    return lastPressBelongsToMenu &&
      Date.now() - lastPressAt < CONTEXT_MENU_PRESS_CLICK_MAX_MS;
  }

  const {
    getRecentContextMenuOptions,
    closeRecentContextMenu,
    handleRecentCardContextMenu,
    getRecentStoreOptions,
    getRecentSiteUrlKey,
    normalizeHiddenRecentSites,
    readHiddenRecentSites,
    writeHiddenRecentSites,
    isRecentSiteHidden,
    normalizeRecentSiteRecord,
    normalizePinnedRecentSites,
    readPinnedRecentSites,
    isRecentSitePinned,
    mergeRecentSitesWithPinned,
    togglePinnedRecentSite,
    updateRecentPinButton,
    getRecentProgressState,
    toggleRecentProgressTracking,
    restoreProgressVersion
  } = NEWTAB_RECENT_SITES_CONTROLLER.createRecentSitesController({
    NEWTAB_CONTEXT_MENU_OPEN_VALUE,
    t,
    showToast,
    openExternalNewTabUrl: (...args) => openExternalNewTabUrl(...args),
    hasShortcutForSite: (...args) => hasShortcutForSite(...args),
    addSiteToShortcuts: (...args) => addSiteToShortcuts(...args),
    closeShortcutContextMenu,
    closeBookmarkContextMenu,
    canDismissRecentCard: (...args) => canDismissRecentCard(...args),
    hideCursorTooltip: (...args) => hideCursorTooltip(...args),
    hideTopActionTooltip: (...args) => hideTopActionTooltip(...args),
    normalizeHost,
    getHostFromUrl,
    getCanonicalPageUrlForFavicon,
    sanitizeDisplayText,
    getSiteDisplayName,
    shouldExcludeFromRecentSites,
    isBrowserPageRecentUrl,
    MAX_PINNED_RECENT_SITES,
    NEWTAB_RECENT_STORE,
    recentSitesStorageArea,
    HIDDEN_RECENT_SITES_STORAGE_KEY,
    renderRecentSites: (...args) => renderRecentSites(...args),
    PINNED_RECENT_SITES_STORAGE_KEY,
    progressMatch: PROGRESS_MATCH,
    progressHistory: PROGRESS_HISTORY,
    progressHistoryStorageArea: localStorageArea,
    openProgressHistory: (item) => openRecentHistoryDialog(item),
    pageState
  });


  const {
    openBookmarkCascadeMenu,
    closeBookmarkCascadeMenu,
    positionBookmarkCascadeLevels,
    getTopBookmarks
  } = NEWTAB_BOOKMARK_CASCADE_ACTIONS.createBookmarkCascadeActions({
    bookmarksRuntime,
    t,
    pageState
  });

  const {
    applySavedFolderColor,
    folderColorStorage,
    syncFolderColorsWithBookmarks,
    scheduleFolderColorSync,
    loadFolderColors,
    openFolderColorPicker
  } = NEWTAB_FOLDER_COLORS.createFolderColors({
    folderColorApi,
    NEWTAB_BOOKMARK_FOLDER_ICON,
    storageArea,
    FOLDER_COLOR_REFS_STORAGE_KEY,
    bookmarksRuntime,
    localStorageArea,
    LEGACY_FOLDER_COLORS_STORAGE_KEY,
    closeBookmarkCascadeMenu,
    closeShortcutDialog,
    hideCursorTooltip: (...args) => hideCursorTooltip(...args),
    t,
    getFigmaFolderSvg,
    playFolderPathMorph,
    bindShortcutDialogTooltip: (...args) => bindShortcutDialogTooltip(...args),
    hideShortcutDialogTooltip: (...args) => hideShortcutDialogTooltip(...args),
    FOLDER_COLOR_PRESETS_STORAGE_KEY,
    showToast,
    pageState
  });
  const shortcutIconStore = NEWTAB_SHORTCUT_ICON_STORE.createShortcutIconStore({
    documentObj: document,
    windowObj: window,
    storageArea: localStorageArea,
    storageKey: NEWTAB_SHORTCUT_ICONS_STORAGE_KEY
  });
  const folderItemIconStore = LumnoNewtabFolderItemIcons.createStore({
    storageArea: localStorageArea
  });
  const shortcutFaviconStore = SHORTCUT_FAVICON.createShortcutFaviconStore({
    chromeApi: typeof chrome !== 'undefined' ? chrome : null,
    storageArea: localStorageArea,
    storageKey: NEWTAB_SHORTCUT_FAVICON_CACHE_STORAGE_KEY,
    lockManager: window.navigator && window.navigator.locks
  });
  const siteSearchIconStore = SHORTCUT_FAVICON.createShortcutFaviconStore({
    chromeApi: typeof chrome !== 'undefined' ? chrome : null,
    storageArea: localStorageArea,
    storageKey: SITE_SEARCH_ICON_CACHE_STORAGE_KEY,
    ...siteSearchIconCacheOptions
  });
  pageState.siteSearchIconCache = {};
  pageState.siteSearchIconCacheLoaded = false;

  function loadSiteSearchIconCache() {
    if (pageState.siteSearchIconCacheLoaded) {
      return Promise.resolve(pageState.siteSearchIconCache);
    }
    if (pageState.siteSearchIconCacheLoadPromise) {
      return pageState.siteSearchIconCacheLoadPromise;
    }
    const loadRevision = pageState.siteSearchIconCacheRevision;
    pageState.siteSearchIconCacheLoadPromise = siteSearchIconStore.readAll().then((cache) => {
      if (pageState.siteSearchIconCacheRevision === loadRevision) {
        pageState.siteSearchIconCache = cache && typeof cache === 'object' ? cache : {};
      }
      pageState.siteSearchIconCacheLoaded = true;
      return pageState.siteSearchIconCache;
    }).catch(() => {
      if (pageState.siteSearchIconCacheRevision === loadRevision) {
        pageState.siteSearchIconCache = {};
      }
      pageState.siteSearchIconCacheLoaded = true;
      return pageState.siteSearchIconCache;
    });
    return pageState.siteSearchIconCacheLoadPromise;
  }

  loadSiteSearchIconCache();
  const sectionModeSelectController =
    NEWTAB_SELECT_MENU.createController({
      documentObj: document,
      windowObj: window,
      onBeforeOpen: (...args) => hideTopActionTooltip(...args),
      getViewportTopInset: (...args) => getNewtabViewportTopPaddingPx(...args)
    });
  pageState.shortcutContextMenuSelectController = NEWTAB_SELECT_MENU.createController({
      documentObj: document,
      windowObj: window,
      onBeforeOpen: () => {
        hideShortcutTooltip();
        hideTopActionTooltip();
      },
      getViewportTopInset: (...args) => getNewtabViewportTopPaddingPx(...args)
    });
  pageState.bookmarkContextMenuSelectController = NEWTAB_SELECT_MENU.createController({
      documentObj: document,
      windowObj: window,
      onBeforeOpen: () => {
        hideCursorTooltip();
        hideTopActionTooltip();
      },
      getViewportTopInset: (...args) => getNewtabViewportTopPaddingPx(...args)
    });
  pageState.recentContextMenuSelectController = NEWTAB_SELECT_MENU.createController({
      documentObj: document,
      windowObj: window,
      onBeforeOpen: () => {
        hideCursorTooltip();
        hideTopActionTooltip();
      },
      getViewportTopInset: (...args) => getNewtabViewportTopPaddingPx(...args)
    });

  const {
    applyRecentCardTheme,
    applyBookmarkCardTheme,
    applyShortcutTileTheme,
    shouldDelayBookmarkHoverFromRecent
  } = NEWTAB_CARD_THEMES.createCardThemes({
    buildFallbackThemeForHost,
    defaultTheme,
    getThemeForMode,
    parseCssColor,
    defaultAccentColor,
    mixColor,
    rgbToCss,
    rgbToCssParts,
    rgbToCssAlpha,
    normalizeAccentRgb,
    getReadableTextColor,
    getThemeSource,
    normalizeThemeConfidence,
    isLowConfidenceTheme,
    scheduleWallpaperAdaptiveToneUpdate: (...args) => scheduleWallpaperAdaptiveToneUpdate(...args),
    pageState
  });

  const {
    applyLanguageMode,
    refreshThemeAwareFavicons,
    scheduleThemeAwareFaviconRescue,
    applyThemeMode,
    normalizeThemeMode,
    normalizeNewtabThemeMode,
    normalizeNewtabThemeScope,
    isNewtabThemeFollowingGlobal,
    getScopedThemeMode,
    getSelectedThemeMode,
    applyScopedThemeMode,
    bootstrapInitialThemeMode,
    bootstrapInitialLanguageMode,
    syncSystemThemeMode
  } = NEWTAB_APPEARANCE_MODES.createAppearanceModes({
    t,
    notifyLanguageChange: () => languageChangeListeners.forEach((listener) => listener()),
    renderNewtabTopContent: (...args) => renderNewtabTopContent(...args),
    updateRecentHeading: (...args) => updateRecentHeading(...args),
    updateBookmarkHeading: (...args) => updateBookmarkHeading(...args),
    updateBookmarkPagerLabels: (...args) => updateBookmarkPagerLabels(...args),
    updateBookmarkBreadcrumb: (...args) => updateBookmarkBreadcrumb(...args),
    updateRecentModeMenu: (...args) => updateRecentModeMenu(...args),
    updateBookmarkModeMenu: (...args) => updateBookmarkModeMenu(...args),
    updateWallpaperLanguageStrings: (...args) => updateWallpaperLanguageStrings(...args),
    updateWallpaperAppearanceSelectionUi: (...args) => updateWallpaperAppearanceSelectionUi(...args),
    updateFeedbackLanguageStrings,
    updateShortcutLanguageStrings,
    setLocalSearchScopePrefix: (...args) => setLocalSearchScopePrefix(...args),
    updateModeBadge: (...args) => updateModeBadge(...args),
    recentCards,
    formatMessage,
    bookmarkCards,
    renderSuggestions: (...args) => renderSuggestions(...args),
    getSystemLocale,
    normalizeLocale,
    applyDocumentLanguage,
    forceReloadRecentSitesForI18n: (...args) => forceReloadRecentSitesForI18n(...args),
    loadLocaleMessages,
    shortcutTiles,
    applyShortcutTileTheme,
    resolveTheme,
    syncBookmarkTopbarSurfaceColorForTheme,
    applyWordmarkThemeAppearance: (...args) => applyWordmarkThemeAppearance(...args),
    suggestionItems,
    applyThemeVariables,
    applyRecentCardTheme,
    applyBookmarkCardTheme,
    updateSelection: (...args) => updateSelection(...args),
    addMediaQueryChangeListener,
    mediaQuery,
    removeMediaQueryChangeListener,
    scheduleWallpaperAdaptiveToneUpdate: (...args) => scheduleWallpaperAdaptiveToneUpdate(...args),
    initialThemeReadyPromise,
    storageArea,
    THEME_STORAGE_KEY,
    NEWTAB_THEME_MODE_STORAGE_KEY,
    NEWTAB_THEME_SCOPE_STORAGE_KEY,
    NEWTAB_GLASS_STYLE_STORAGE_KEY,
    NEWTAB_GLASS_THEME_STORAGE_KEY,
    getGlassThemeOverride: SETTINGS.getNewtabGlassThemeOverride,
    initialLanguageReadyPromise,
    LANGUAGE_STORAGE_KEY,
    pageState
  });
  const WORDMARK_ENTRY_ANIMATION_NAME = '_x_nt_wordmark_enter_2026_unique_';
  const RECENT_CARD_TARGET_WIDTH_PX = 248;
  const RECENT_GRID_GAP_PX = 12;
  const NEWTAB_MOBILE_FLOW_BREAKPOINT_PX = 640;
  const RECENT_WIDE_MAX_COLUMNS = 6;
  const RECENT_WIDE_CONTENT_MAX_WIDTH_PX = NEWTAB_LAYOUT.getGridContentWidthForColumns(
    RECENT_WIDE_MAX_COLUMNS,
    RECENT_CARD_TARGET_WIDTH_PX,
    RECENT_GRID_GAP_PX
  );
  const NEWTAB_WIDTH_MODE_CONFIGS = {
    standard: {
      searchMaxWidth: NEWTAB_LAYOUT.STANDARD_SEARCH_MAX_WIDTH_PX,
      contentMaxWidth: NEWTAB_LAYOUT.CONTENT_MAX_WIDTH_PX,
      recentMaxColumns: 4
    },
    wide: {
      searchMaxWidth: 920,
      contentMaxWidth: RECENT_WIDE_CONTENT_MAX_WIDTH_PX,
      recentMaxColumns: RECENT_WIDE_MAX_COLUMNS
    }
  };
  const NEWTAB_SEARCH_WIDTH_CONFIG = NEWTAB_LAYOUT.SEARCH_WIDTH_CONFIG;
  toastElement = document.getElementById('_x_extension_toast_2024_unique_');
  pageState.toastController = NEWTAB_TOAST.createToastController(toastElement, { windowObj: window });



  const {
    syncSearchModeMenuResultOffset,
    setSuggestionsVisible,
    updateSuggestionsFloatingLayout
  } = NEWTAB_SUGGESTIONS_LAYOUT.createSuggestionsLayout({
    pageState
  });

  const {
    normalizeRecentCount,
    normalizeRecentMode,
    getBookmarkGridColumnCount,
    getEffectiveNewtabSearchWidth,
    getRecentLimit,
    getRecentSourceLimit,
    applyBookmarkGridColumns,
    keepBookmarkPageAnchorAfterLimitChange,
    applyRecentGridColumns,
    applyNewtabWidthMode,
    updateNewtabSearchWidthLayout,
    setNewtabSearchWidth,
    setContentSectionVisible,
    isContentSectionVisible,
    applyNewtabShortcutLayoutPreferences,
    applyNewtabShortcutColumns,
    applyNewtabShortcutsVisibility,
    getSearchEntryViewportSnapshot,
    hasSearchEntryViewportChanged,
    rememberSearchEntryViewport,
    beginSearchEntryRestoreLayoutLock,
    updateBookmarkSectionPosition,
    updateSearchEntryLayout
  } = NEWTAB_PAGE_LAYOUT.createPageLayout({
    NEWTAB_RECENT_STORE,
    normalizeBookmarkColumns: (...args) => normalizeBookmarkColumns(...args),
    NEWTAB_LAYOUT,
    NEWTAB_MOBILE_FLOW_BREAKPOINT_PX,
    NEWTAB_WIDTH_MODE_CONFIGS,
    normalizeNewtabWidthMode: (...args) => normalizeNewtabWidthMode(...args),
    normalizeNewtabSearchWidth: (...args) => normalizeNewtabSearchWidth(...args),
    NEWTAB_SEARCH_WIDTH_CONFIG,
    RECENT_CARD_TARGET_WIDTH_PX,
    RECENT_GRID_GAP_PX,
    getBookmarkLimit: (...args) => getBookmarkLimit(...args),
    updateSuggestionsFloatingLayout,
    storageArea,
    NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
    closeRecentContextMenu,
    scheduleWallpaperAdaptiveToneUpdate: (...args) => scheduleWallpaperAdaptiveToneUpdate(...args),
    normalizeNewtabShortcutSize: (...args) => normalizeNewtabShortcutSize(...args),
    normalizeNewtabShortcutGap: (...args) => normalizeNewtabShortcutGap(...args),
    getVisibleShortcuts: (...args) => getVisibleShortcuts(...args),
    MAX_NEWTAB_SHORTCUTS,
    resetShortcutDockHover,
    closeShortcutContextMenu,
    closeShortcutDialog,
    pageState
  });

  const {
    normalizeNewtabWidthMode,
    normalizeNewtabSearchWidth,
    normalizeNewtabTopContentMode,
    normalizeNewtabTimeSecondsVisible,
    normalizeNewtabTimeFontWeight,
    normalizeNewtabTimeFont,
    normalizeNewtabShortcutsVisible,
    normalizeNewtabShortcutAddVisible,
    normalizeNewtabShortcutDockMagnificationEnabled,
    normalizeNewtabShortcutColumns,
    normalizeNewtabShortcutSize,
    normalizeNewtabShortcutGap,
    inferNewtabShortcutColumnsFromWidth,
    normalizeNewtabInputAutoFocusEnabled,
    normalizeNewtabFeedbackButtonVisible,
    normalizeNewtabAppearanceButtonVisible,
    updateNewtabInputAutoFocusUi,
    setNewtabInputAutoFocusEnabled,
    updateNewtabShortcutPreferencesUi,
    setNewtabShortcutsVisible,
    setNewtabShortcutAddVisible,
    setNewtabShortcutDockMagnificationEnabled,
    setNewtabShortcutColumns,
    setNewtabShortcutSize,
    setNewtabShortcutGap,
    initialNewtabInputAutoFocusReadyTask,
    normalizeSimpleModeEnabled,
    normalizeMacosCtrlSuggestionNavigationEnabled,
    normalizeNumberShortcutInstantEnabled,
    normalizeBookmarkFolderIconsVisible,
    normalizeZenModeEnabled,
    normalizeSearchResultPriority,
    normalizeOverlayTabPriorityMode,
    normalizeBookmarkCount,
    getBookmarkLimit,
    normalizeBookmarkColumns,
    normalizeTabRankScoreDebugMode
  } = NEWTAB_PAGE_PREFERENCES.createPagePreferences({
    SETTINGS,
    NEWTAB_SEARCH_WIDTH_CONFIG,
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
    storageArea,
    NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
    applyNewtabShortcutsVisibility,
    updateBookmarkSectionPosition,
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
    renderShortcuts: (...args) => renderShortcuts(...args),
    NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
    applyNewtabShortcutDockMagnification,
    scheduleWallpaperAdaptiveToneUpdate: (...args) => scheduleWallpaperAdaptiveToneUpdate(...args),
    NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
    applyNewtabShortcutColumns,
    NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
    applyNewtabShortcutLayoutPreferences,
    NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
    NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
    NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
    SIMPLE_MODE_ENABLED_STORAGE_KEY,
    MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
    getBookmarkGridColumnCount,
    pageState
  });

  const {
    buildDefaultSearchUrl,
    getDefaultSearchEngineThemeUrl,
    getDefaultSearchEngineFaviconUrl,
    getSearchActionLabel,
    loadDefaultSearchEngineState
  } = NEWTAB_DEFAULT_SEARCH_ENGINE.createDefaultSearchEngine({
    getPageFaviconCandidateUrl,
    t,
    storageArea,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_UTILS,
    pageState
  });

  function resolveTheme(mode, mediaMatchesOverride) {
    if (mode === 'dark') {
      return 'dark';
    }
    if (mode === 'light') {
      return 'light';
    }
    if (typeof mediaMatchesOverride === 'boolean') {
      return mediaMatchesOverride ? 'dark' : 'light';
    }
    return mediaQuery.matches ? 'dark' : 'light';
  }

  function addMediaQueryChangeListener(queryList, listener) {
    if (!queryList || typeof listener !== 'function') {
      return false;
    }
    if (typeof queryList.addEventListener === 'function') {
      queryList.addEventListener('change', listener);
      return true;
    }
    if (typeof queryList.addListener === 'function') {
      queryList.addListener(listener);
      return true;
    }
    return false;
  }

  function removeMediaQueryChangeListener(queryList, listener) {
    if (!queryList || typeof listener !== 'function') {
      return;
    }
    if (typeof queryList.removeEventListener === 'function') {
      queryList.removeEventListener('change', listener);
      return;
    }
    if (typeof queryList.removeListener === 'function') {
      queryList.removeListener(listener);
    }
  }

  function migrateStorageIfNeeded(keys, providerReady) {
    if (providerStorageRuntime && !providerReady) {
      providerStorageRuntime.ready.then(() => migrateStorageIfNeeded(keys, true));
      return;
    }
    if (!storageArea || !chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    if (isPrimaryStorageAreaName('local')) {
      return;
    }
    SETTINGS.migrateLocalSettingsToSync(chrome.storage.local, storageArea, keys);
  }

  function getRiSvg(id, sizeClass, extraClass) {
    const size = sizeClass || 'ri-size-16';
    const extra = extraClass ? ` ${extraClass}` : '';
    return `<i class="ri-icon ${size}${extra} ${id}" aria-hidden="true"></i>`;
  }

  pageState.quoteRuntime = LumnoNewtabQuotes.createRuntime({
    documentObj: document, windowObj: window, chromeObj: chrome,
    storageArea, localStorageArea, t, showToast,
    getLocale: () => pageState.currentResolvedLocale,
    getSearchRoot: () => root,
    getShortcutSection: () => pageState.shortcutSection,
    getTooltipController: () => topActionTooltipController,
    isPreferenceArea: (areaName) => providerStorageRuntime
      ? providerStorageRuntime.isActiveAreaName(areaName) : areaName === 'sync',
    onLayout: () => window.requestAnimationFrame(() => {
      updateBookmarkSectionPosition();
      scheduleWallpaperAdaptiveToneUpdate();
    })
  });
  pageState.sectionPanelSettings = LumnoNewtabSectionPanelSettings.createRuntime({
    windowObj: window,
    chromeObj: chrome,
    t,
    watchedKeys: [
      BOOKMARK_VIEW_MODE_STORAGE_KEY,
      BOOKMARK_COUNT_STORAGE_KEY,
      BOOKMARK_COLUMNS_STORAGE_KEY,
      BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
      RECENT_MODE_STORAGE_KEY,
      RECENT_COUNT_STORAGE_KEY,
      ...bookmarkTopbarStorageKeys
    ],
    getBookmarkViewMode: () => pageState.currentBookmarkViewMode,
    setBookmarkViewMode: (mode) => setBookmarkViewMode(mode),
    getBookmarkCount: () => pageState.currentBookmarkCount,
    setBookmarkCount: (value, options) => setSectionPreference(
      BOOKMARK_COUNT_STORAGE_KEY,
      normalizeBookmarkCount(value),
      applyBookmarkCountPreference,
      options
    ),
    getBookmarkColumns: () => pageState.currentBookmarkColumns,
    setBookmarkColumns: (value, options) => setSectionPreference(
      BOOKMARK_COLUMNS_STORAGE_KEY,
      normalizeBookmarkColumns(value),
      applyBookmarkColumnsPreference,
      options
    ),
    getBookmarkFolderIconsVisible: () => pageState.bookmarkFolderIconsVisible,
    setBookmarkFolderIconsVisible: (value, options) => setSectionPreference(
      BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
      normalizeBookmarkFolderIconsVisible(value),
      applyBookmarkFolderIconsVisiblePreference,
      options
    ),
    // The bar's shape and background go through the same actions as its own menu.
    getBookmarkTopbarLayout: () => getBookmarkTopbarLayout(),
    setBookmarkTopbarLayout: (layout) => handleBookmarkModeMenuAction(`${BOOKMARK_TOPBAR_LAYOUT_ACTION}:${layout}`),
    getBookmarkTopbarSurfaceMode: () => getEffectiveBookmarkTopbarSurfaceMode(),
    setBookmarkTopbarSurfaceMode: (mode) => handleBookmarkModeMenuAction(
      `${BOOKMARK_TOPBAR_SURFACE_MODE_ACTION}:${mode}`
    ),
    pickBookmarkTopbarSurfaceColor: () => handleBookmarkModeMenuAction(BOOKMARK_TOPBAR_PICK_COLOR_ACTION),
    getRecentMode: () => pageState.currentRecentMode,
    setRecentMode: (mode) => setRecentMode(mode),
    getRecentCount: () => pageState.currentRecentCount,
    setRecentCount: (value, options) => setSectionPreference(
      RECENT_COUNT_STORAGE_KEY,
      normalizeRecentCount(value),
      applyRecentCountPreference,
      options
    )
  });

  const {
    getFixedTimeInk,
    updateWallpaperLanguageStrings,
    updateWallpaperAppearanceSelectionUi,
    bootstrapInitialWallpaper,
    bootstrapInitialWallpaperOverlay,
    bootstrapInitialWallpaperEffect,
    waitForInitialWallpaperEffectVisual,
    waitForInitialWallpaperTone,
    markInitialWallpaperVisualReady,
    bootstrapInitialNewtabFavicon,
    createWallpaperControls,
    isWallpaperPanelOpen,
    closeWallpaperPanel,
    scheduleWallpaperAdaptiveToneUpdate
  } = NEWTAB_WALLPAPER_PAGE.createWallpaperPage({
    SETTINGS,
    shortcutTiles,
    getShortcutDockIcon,
    shortcutGroupHeaders,
    getEffectiveBookmarkTopbarSurfaceMode,
    isBookmarkTopbarMode: (...args) => isBookmarkTopbarMode(...args),
    root,
    NEWTAB_GLASS_ADAPTIVE_SELECTOR,
    EXTENSION_ROUTES,
    storageArea,
    localStorageArea,
    NEWTAB_WALLPAPER_STORAGE_KEY,
    NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY,
    NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY,
    NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
    NEWTAB_TIME_OPACITY_STORAGE_KEY,
    NEWTAB_TIME_INK_STORAGE_KEY,
    NEWTAB_TIME_FONT_STORAGE_KEY,
    NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
    NEWTAB_TIME_12_HOUR_STORAGE_KEY,
    NEWTAB_FAVICON_STORAGE_KEY,
    NEWTAB_SEARCH_WIDTH_CONFIG,
    t,
    formatMessage,
    getSelectedThemeMode,
    getScopedThemeMode,
    getThemeScope: (...args) => getThemeScope(...args),
    setThemeMode: (...args) => setThemeMode(...args),
    setThemeScope: (...args) => setThemeScope(...args),
    getRiSvg,
    showToast,
    beginToast,
    showTopActionTooltip: (...args) => showTopActionTooltip(...args),
    hideTopActionTooltip: (...args) => hideTopActionTooltip(...args),
    applyWordmarkThemeAppearance: (...args) => applyWordmarkThemeAppearance(...args),
    setNewtabTopContentMode: (...args) => setNewtabTopContentMode(...args),
    setNewtabTimeFontWeight: (...args) => setNewtabTimeFontWeight(...args),
    setNewtabTimeFontSize: (...args) => setNewtabTimeFontSize(...args),
    setNewtabTimeOpacity: (...args) => setNewtabTimeOpacity(...args),
    setNewtabTimeInk: (...args) => setNewtabTimeInk(...args),
    setNewtabTimeFont: (...args) => setNewtabTimeFont(...args),
    setNewtabTimeSecondsVisible: (...args) => setNewtabTimeSecondsVisible(...args),
    setNewtabTime12Hour: (...args) => setNewtabTime12Hour(...args),
    getEffectiveNewtabSearchWidth,
    setNewtabSearchWidth,
    NEWTAB_SHORTCUT_COLUMNS_MIN,
    NEWTAB_SHORTCUT_COLUMNS_MAX,
    NEWTAB_SHORTCUT_COLUMNS_DEFAULT,
    NEWTAB_SHORTCUT_SIZE_MIN,
    NEWTAB_SHORTCUT_SIZE_MAX,
    NEWTAB_SHORTCUT_SIZE_DEFAULT,
    NEWTAB_SHORTCUT_GAP_MIN,
    NEWTAB_SHORTCUT_GAP_MAX,
    NEWTAB_SHORTCUT_GAP_DEFAULT,
    setNewtabShortcutsVisible,
    setNewtabShortcutAddVisible,
    setNewtabShortcutDockMagnificationEnabled,
    setNewtabShortcutColumns,
    setNewtabShortcutSize,
    setNewtabShortcutGap,
    FEATURE_HINTS,
    newtabEntryAnimationReadyPromise,
    initialNewtabInputAutoFocusReadyTask,
    setNewtabInputAutoFocusEnabled,
    applyNewtabGlassStyle: (...args) => applyNewtabGlassStyle(...args),
    NEWTAB_GLASS_STYLE_STORAGE_KEY,
    applyNewtabGlassTheme: (...args) => applyNewtabGlassTheme(...args),
    NEWTAB_GLASS_THEME_STORAGE_KEY,
    bootstrapInitialThemeMode,
    pageState
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      rememberSearchEntryViewport();
      hideToast();
    }
    if (document.visibilityState !== 'visible') {
      return;
    }
    syncSystemThemeMode();
  });
  window.addEventListener('pageshow', () => {
    hideToast();
    syncSystemThemeMode();
  });
  window.addEventListener('focus', () => {
    hideToast();
    syncSystemThemeMode();
  });
  window.addEventListener('blur', hideToast);
  window.addEventListener('pagehide', hideToast);

  const initialWallpaperOverlayReadyTask = bootstrapInitialWallpaperOverlay();
  const initialWallpaperVisualReadyTask = Promise.all([
    bootstrapInitialThemeMode(),
    initialWallpaperOverlayReadyTask.then(() => bootstrapInitialWallpaper()),
    initialWallpaperOverlayReadyTask,
    bootstrapInitialWallpaperEffect()
  ]).then(() => waitForInitialWallpaperEffectVisual()).catch((error) => {
    console.warn('[Lumno] Initial new tab wallpaper setup failed.', error);
  }).then(() => {
    markInitialWallpaperVisualReady();
  });
  const initialAppearanceReadyTask = Promise.all([
    initialWallpaperVisualReadyTask,
    bootstrapInitialNewtabFavicon()
  ]).catch((error) => {
    console.warn('[Lumno] Initial new tab appearance setup failed.', error);
  });

  const {
    applyBookmarkCountPreference,
    applyBookmarkColumnsPreference,
    applyBookmarkFolderIconsVisiblePreference,
    applyRecentCountPreference,
    setSectionPreference,
    storageChanges
  } = NEWTAB_SETTINGS_SYNC.createSettingsSync({
    SETTINGS,
    normalizeBookmarkCount,
    markBookmarkDataDirty: (...args) => markBookmarkDataDirty(...args),
    loadBookmarks: (...args) => loadBookmarks(...args),
    normalizeBookmarkColumns,
    getBookmarkLimit,
    keepBookmarkPageAnchorAfterLimitChange,
    applyBookmarkGridColumns,
    renderCurrentBookmarkPage: (...args) => renderCurrentBookmarkPage(...args),
    updateBookmarkGridHeightLock: (...args) => updateBookmarkGridHeightLock(...args),
    updateBookmarkSectionPosition,
    normalizeBookmarkFolderIconsVisible,
    normalizeRecentCount,
    markRecentDataDirty: (...args) => markRecentDataDirty(...args),
    loadRecentSites: (...args) => loadRecentSites(...args),
    storageArea,
    isPrimaryStorageAreaName,
    FOLDER_REFERENCES,
    shortcutFolderRuntime,
    renderShortcuts: (...args) => renderShortcuts(...args),
    FOLDER_COLOR_REFS_STORAGE_KEY,
    NEWTAB_BOOKMARK_FOLDER_ICON,
    syncFolderColorsWithBookmarks,
    NEWTAB_SHORTCUT_ICONS_STORAGE_KEY,
    NEWTAB_SHORTCUT_ICON_STORE,
    NEWTAB_SHORTCUT_FAVICON_CACHE_STORAGE_KEY,
    SHORTCUT_FAVICON,
    SITE_SEARCH_ICON_CACHE_STORAGE_KEY,
    siteSearchIconCacheOptions,
    setSiteSearchPrefix: (...args) => setSiteSearchPrefix(...args),
    defaultTheme,
    getThemeForProvider,
    requestSuggestions: (...args) => requestSuggestions(...args),
    NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY,
    isShortcutSyncStorageActive: (...args) => isShortcutSyncStorageActive(...args),
    scheduleShortcutStorageReload: (...args) => scheduleShortcutStorageReload(...args),
    registerBookmarkDisplayStorageChanges,
    PROGRESS_HISTORY,
    NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY,
    settingsRuntimeApi,
    THEME_STORAGE_KEY,
    normalizeThemeMode,
    isNewtabThemeFollowingGlobal,
    applyScopedThemeMode,
    updateWallpaperAppearanceSelectionUi,
    updateModeCommandSuggestions: (...args) => updateModeCommandSuggestions(...args),
    NEWTAB_THEME_MODE_STORAGE_KEY,
    normalizeNewtabThemeMode,
    NEWTAB_THEME_SCOPE_STORAGE_KEY,
    normalizeNewtabThemeScope,
    updateWallpaperLanguageStrings,
    LANGUAGE_STORAGE_KEY,
    applyLanguageMode,
    NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
    normalizeNewtabInputAutoFocusEnabled,
    updateNewtabInputAutoFocusUi,
    RECENT_COUNT_STORAGE_KEY,
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    normalizeNewtabWidthMode,
    applyNewtabWidthMode,
    applyRecentGridColumns,
    NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
    normalizeNewtabSearchWidth,
    updateNewtabSearchWidthLayout,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    normalizeNewtabTopContentMode,
    setNewtabTopContentMode: (...args) => setNewtabTopContentMode(...args),
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    normalizeNewtabTimeFontWeight,
    setNewtabTimeFontWeight: (...args) => setNewtabTimeFontWeight(...args),
    NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
    setNewtabTimeFontSize: (...args) => setNewtabTimeFontSize(...args),
    NEWTAB_TIME_OPACITY_STORAGE_KEY,
    setNewtabTimeOpacity: (...args) => setNewtabTimeOpacity(...args),
    NEWTAB_TIME_INK_STORAGE_KEY,
    setNewtabTimeInk: (...args) => setNewtabTimeInk(...args),
    NEWTAB_TIME_FONT_STORAGE_KEY,
    normalizeNewtabTimeFont,
    setNewtabTimeFont: (...args) => setNewtabTimeFont(...args),
    NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
    normalizeNewtabTimeSecondsVisible,
    setNewtabTimeSecondsVisible: (...args) => setNewtabTimeSecondsVisible(...args),
    NEWTAB_TIME_12_HOUR_STORAGE_KEY,
    setNewtabTime12Hour: (...args) => setNewtabTime12Hour(...args),
    NEWTAB_GLASS_STYLE_STORAGE_KEY,
    applyNewtabGlassStyle: (...args) => applyNewtabGlassStyle(...args),
    NEWTAB_GLASS_THEME_STORAGE_KEY,
    applyNewtabGlassTheme: (...args) => applyNewtabGlassTheme(...args),
    NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
    normalizeNewtabFeedbackButtonVisible,
    applyNewtabActionButtonVisibility: (...args) => applyNewtabActionButtonVisibility(...args),
    NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
    normalizeNewtabAppearanceButtonVisible,
    NEWTAB_ZEN_MODE_STORAGE_KEY,
    normalizeZenModeEnabled,
    applyZenMode: (...args) => applyZenMode(...args),
    updateZenCommandSuggestions: (...args) => updateZenCommandSuggestions(...args),
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
    normalizeNewtabShortcutsVisible,
    applyNewtabShortcutsVisibility,
    updateNewtabShortcutPreferencesUi,
    NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
    normalizeNewtabShortcutAddVisible,
    NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
    normalizeNewtabShortcutDockMagnificationEnabled,
    applyNewtabShortcutDockMagnification,
    NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
    normalizeNewtabShortcutColumns,
    applyNewtabShortcutColumns,
    NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
    normalizeNewtabShortcutSize,
    applyNewtabShortcutLayoutPreferences,
    NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
    normalizeNewtabShortcutGap,
    RECENT_MODE_STORAGE_KEY,
    normalizeRecentMode,
    updateRecentModeMenu: (...args) => updateRecentModeMenu(...args),
    updateRecentHeading: (...args) => updateRecentHeading(...args),
    BOOKMARK_VIEW_MODE_STORAGE_KEY,
    normalizeBookmarkViewMode,
    shouldRepairBookmarkViewModeStorageValue,
    persistBookmarkViewMode,
    applyBookmarkViewMode: (...args) => applyBookmarkViewMode(...args),
    BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
    BOOKMARK_COUNT_STORAGE_KEY,
    BOOKMARK_COLUMNS_STORAGE_KEY,
    TAB_RANK_SCORE_DEBUG_STORAGE_KEY,
    normalizeTabRankScoreDebugMode,
    requestTabsAndRender: (...args) => requestTabsAndRender(...args),
    PINNED_RECENT_SITES_STORAGE_KEY,
    normalizePinnedRecentSites,
    renderRecentSites: (...args) => renderRecentSites(...args),
    HIDDEN_RECENT_SITES_STORAGE_KEY,
    normalizeHiddenRecentSites,
    NEWTAB_SHORTCUTS_STORAGE_KEYS,
    pageState
  });

  const {
    initialTimeFontReadyTask
  } = NEWTAB_STARTUP_PREFERENCES.createStartupPreferences({
    storageArea,
    bootstrapInitialLanguageMode,
    settingsRuntimeApi,
    renderRecentSites: (...args) => renderRecentSites(...args),
    localStorageArea,
    PROGRESS_HISTORY,
    readPinnedRecentSites,
    readHiddenRecentSites,
    RECENT_COUNT_STORAGE_KEY,
    normalizeRecentCount,
    markRecentDataDirty: (...args) => markRecentDataDirty(...args),
    loadRecentSites: (...args) => loadRecentSites(...args),
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
    getBookmarkLimit,
    normalizeNewtabWidthMode,
    normalizeNewtabSearchWidth,
    applyNewtabWidthMode,
    applyRecentGridColumns,
    applyBookmarkGridColumns,
    keepBookmarkPageAnchorAfterLimitChange,
    renderCurrentBookmarkPage: (...args) => renderCurrentBookmarkPage(...args),
    updateBookmarkGridHeightLock: (...args) => updateBookmarkGridHeightLock(...args),
    updateBookmarkSectionPosition,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
    NEWTAB_TIME_OPACITY_STORAGE_KEY,
    NEWTAB_TIME_INK_STORAGE_KEY,
    NEWTAB_TIME_FONT_STORAGE_KEY,
    NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
    NEWTAB_TIME_12_HOUR_STORAGE_KEY,
    normalizeNewtabTopContentMode,
    normalizeNewtabTimeFontWeight,
    normalizeNewtabTimeFont,
    normalizeNewtabTimeSecondsVisible,
    loadNewtabTimeFont: (...args) => loadNewtabTimeFont(...args),
    setNewtabTimeFontWeight: (...args) => setNewtabTimeFontWeight(...args),
    setNewtabTimeFontSize: (...args) => setNewtabTimeFontSize(...args),
    setNewtabTimeOpacity: (...args) => setNewtabTimeOpacity(...args),
    setNewtabTimeInk: (...args) => setNewtabTimeInk(...args),
    setNewtabTimeSecondsVisible: (...args) => setNewtabTimeSecondsVisible(...args),
    setNewtabTime12Hour: (...args) => setNewtabTime12Hour(...args),
    setNewtabTopContentMode: (...args) => setNewtabTopContentMode(...args),
    RECENT_MODE_STORAGE_KEY,
    normalizeRecentMode,
    updateRecentHeading: (...args) => updateRecentHeading(...args),
    updateRecentModeMenu: (...args) => updateRecentModeMenu(...args),
    loadInitialBookmarkViewMode,
    loadInitialBookmarkTopbarSurfaceColors,
    loadInitialBookmarkTopbarSurfaceMode,
    BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
    normalizeBookmarkFolderIconsVisible,
    BOOKMARK_COUNT_STORAGE_KEY,
    normalizeBookmarkCount,
    markBookmarkDataDirty: (...args) => markBookmarkDataDirty(...args),
    loadBookmarks: (...args) => loadBookmarks(...args),
    BOOKMARK_COLUMNS_STORAGE_KEY,
    normalizeBookmarkColumns,
    TAB_RANK_SCORE_DEBUG_STORAGE_KEY,
    normalizeTabRankScoreDebugMode,
    pageState
  });
  const imeKeyGuard = LumnoImeKeyGuard.createImeKeyGuard();
  const searchInputHistoryController =
    SEARCH_INPUT_HISTORY.createSearchInputHistoryController({
      storageArea: localStorageArea,
      storageChanges: chrome && chrome.storage ? chrome.storage.onChanged : null,
      storageAreaName: 'local'
    });
  function isImeCompositionEvent(event) {
    return imeKeyGuard.shouldIgnoreKeydown(event);
  }
  pageState.siteSearchState = null;
  pageState.localSearchScopeState = null;
  pageState.siteSearchProvidersCache = null;
  pageState.siteSearchProvidersLoadVersion = 0;
  pageState.aggregateSearchesCache = null;
  pageState.aggregateSearchesLoadPromise = null;
  pageState.aggregateSearchesLoadVersion = 0;
  pageState.enabledSearchResultSourceTypes = ['topSite', 'bookmark', 'history'];
  pageState.searchResultDisplayLimit = 10;
  pageState.newtabOpenInNewTab = SETTINGS.normalizeNewtabOpenInNewTab(null);
  pageState.faviconRequestBlacklistItems = [];
  pageState.faviconEnhancedFetchEnabled = false;

  NEWTAB_SEARCH_SETTINGS_SYNC.createSearchSettingsSync({
    loadDefaultSearchEngineState,
    storageChanges,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_UTILS,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    normalizeSearchResultPriority,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    normalizeEnabledSearchResultSourceTypes,
    clearLocalSearchScope: (...args) => clearLocalSearchScope(...args),
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    normalizeSearchResultDisplayLimit,
    renderSuggestions: (...args) => renderSuggestions(...args),
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
    SETTINGS,
    NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
    normalizeNumberShortcutInstantEnabled,
    SUGGESTION_NAVIGATION,
    MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
    normalizeMacosCtrlSuggestionNavigationEnabled,
    SIMPLE_MODE_ENABLED_STORAGE_KEY,
    normalizeSimpleModeEnabled,
    OVERLAY_TAB_PRIORITY_STORAGE_KEY,
    normalizeOverlayTabPriorityMode,
    requestSuggestions: (...args) => requestSuggestions(...args),
    SEARCH_BLACKLIST_STORAGE_KEY,
    normalizeSearchBlacklistItems,
    markRecentDataDirty: (...args) => markRecentDataDirty(...args),
    scheduleRecentReloadIfVisible: (...args) => scheduleRecentReloadIfVisible(...args),
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    normalizeFaviconRequestBlacklistItems,
    scheduleBookmarkReloadIfVisible: (...args) => scheduleBookmarkReloadIfVisible(...args),
    refreshThemeAwareFavicons,
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
    normalizeFaviconEnhancedFetchEnabled,
    renderShortcuts: (...args) => renderShortcuts(...args),
    setSiteSearchPrefix: (...args) => setSiteSearchPrefix(...args),
    getImmediateThemeForSuggestion,
    pageState
  });

  pageState.AGGREGATE_SEARCH_STORAGE_KEY = SETTINGS.AGGREGATE_SEARCH_STORAGE_KEY ||
    AGGREGATE_SEARCH_STORE.STORAGE_KEY ||
    '_x_extension_aggregate_searches_2026_unique_';
  migrateStorageIfNeeded([
    THEME_STORAGE_KEY,
    LANGUAGE_STORAGE_KEY,
    RECENT_MODE_STORAGE_KEY,
    RECENT_COUNT_STORAGE_KEY,
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
    NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
    NEWTAB_QUOTE_PREFS_STORAGE_KEY,
    NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
    NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
    NEWTAB_GLASS_STYLE_STORAGE_KEY,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
    NEWTAB_TIME_OPACITY_STORAGE_KEY,
    NEWTAB_TIME_INK_STORAGE_KEY,
    NEWTAB_TIME_FONT_STORAGE_KEY,
    NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
    NEWTAB_TIME_12_HOUR_STORAGE_KEY,
    NEWTAB_THEME_MODE_STORAGE_KEY,
    NEWTAB_THEME_SCOPE_STORAGE_KEY,
    NEWTAB_ZEN_MODE_STORAGE_KEY,
    NEWTAB_WALLPAPER_STORAGE_KEY,
    NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY,
    NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
    NEWTAB_FAVICON_STORAGE_KEY,
    BOOKMARK_COUNT_STORAGE_KEY,
    BOOKMARK_COLUMNS_STORAGE_KEY,
    BOOKMARK_VIEW_MODE_STORAGE_KEY,
    BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
    BOOKMARK_CASCADE_DEBUG_STORAGE_KEY,
    TAB_RANK_SCORE_DEBUG_STORAGE_KEY,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    pageState.AGGREGATE_SEARCH_STORAGE_KEY,
    SEARCH_BLACKLIST_STORAGE_KEY,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
    PINNED_RECENT_SITES_STORAGE_KEY,
    HIDDEN_RECENT_SITES_STORAGE_KEY,
    ...NEWTAB_SHORTCUTS_STORAGE_KEYS,
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
    NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
    NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
    NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
    NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
    NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
    NEWTAB_SHORTCUT_GAP_STORAGE_KEY
  ]);

  const {
    areFaviconRenderCachesReady,
    waitForFaviconRenderCaches,
    isHostFaviconVisitDirty,
    getPersistedFaviconDataEntry,
    getPersistedSiteThemeEntry,
    setPersistedSiteThemeEntry,
    applyFaviconOpticalShift,
    applyFaviconOpticalAlignment,
    reportMissingIcon,
    applyFallbackIcon,
    setFaviconSrcWithAnimation,
    attachFaviconData,
    preloadIcon,
    warmIconCache,
    attachFaviconWithFallbacks,
    getPageFaviconUrlResolver,
    getThemeSourceForSuggestion
  } = NEWTAB_PAGE_FAVICONS.createPageFavicons({
    normalizeFaviconHost,
    FAVICON_CACHE_BOOT_WAIT_MS,
    isPersistableTheme,
    normalizeAccentRgb,
    parseCssColor,
    getThemeSource,
    isLowConfidenceTheme,
    normalizeThemeConfidence,
    FAVICON_UTILS,
    getRiSvg,
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    isOwnExtensionUrl,
    shouldBlockFaviconForHost,
    shouldAvoidDirectFaviconForHost,
    isNewtabEnhancedFaviconFetchEnabled,
    getNewtabStrictFaviconReason,
    getHostFromUrl,
    isFaviconProxyUrl,
    themeHostCache,
    isUrlBlockedByFaviconRequestBlacklist,
    themeColorCache,
    normalizeHost,
    getThemeSourcePriority,
    extractAverageColor,
    buildThemeFromAccent,
    setResolvedThemeForHost,
    getShortcutFaviconCandidateUrl: (...args) => getShortcutFaviconCandidateUrl(...args),
    getShortcutFaviconDataUrl: (...args) => getShortcutFaviconDataUrl(...args),
    getProviderIcon,
    getProviderFaviconPageUrl,
    pageState
  });

  const {
    navigateToUrl,
    isMiddleClick,
    isBackgroundOpenEvent,
    getOpenDisposition,
    getSurfaceOpenDisposition,
    openExternalNewTabUrl,
    openUrlFromNewtabCard,
    openShortcutUrl,
    recordSearchSuggestionSelection,
    openBookmarkFolder,
    navigateToQuery
  } = NEWTAB_PAGE_NAVIGATION.createPageNavigation({
    NAVIGATION_DISPOSITION,
    getShortcutTileById,
    bookmarksRuntime,
    getShortcutFolderId: (...args) => getShortcutFolderId(...args),
    showToast,
    t,
    openBookmarkCascadeMenu,
    navigateBookmarkFolder: (...args) => navigateBookmarkFolder(...args),
    getDirectNavigationUrl: (...args) => getDirectNavigationUrl(...args),
    buildDefaultSearchUrl,
    pageState
  });

  const pageStructureRuntime = NEWTAB_PAGE_STRUCTURE.createPageStructure({
    documentObj: document,
    getRiSvg
  });
  pageState.suggestionsContainer = pageStructureRuntime.suggestions.container;
  pageState.suggestionsContainer.addEventListener('wheel', function(event) {
    SUGGESTION_NAVIGATION.preventNumberShortcutWheel(event, pageState.suggestionsContainer);
  }, { passive: false });
  document.addEventListener('pointerdown', function() {
    SUGGESTION_NAVIGATION.cancelNumberShortcuts(pageState.suggestionsContainer);
  }, true);
  const suggestionsSurface = pageStructureRuntime.suggestions.surface;
  const suggestionsOutline = pageStructureRuntime.suggestions.outline;
  const bookmarkSection = pageStructureRuntime.bookmark.section;
  pageState.recentSection = pageStructureRuntime.recent.section;

  const {
    captureRecentCardLayout,
    cancelRecentResizeLayoutAnimations,
    shouldSkipNewtabEntryMotion,
    shouldAnimateNewtabLayoutShift,
    animateRecentResizeLayout,
    applyNewtabTopContentVisibility,
    finishWordmarkEntryAnimation,
    applyWordmarkThemeAppearance,
    renderNewtabTopContent,
    setNewtabTopContentMode,
    setNewtabTimeFontWeight,
    setNewtabTimeFontSize,
    setNewtabTimeOpacity,
    setNewtabTimeInk,
    setNewtabTimeFont,
    loadNewtabTimeFont,
    setNewtabTimeSecondsVisible,
    setNewtabTime12Hour
  } = NEWTAB_TOP_CONTENT_RUNTIME.createTopContentRuntime({
    COMMUNITY_LINKS,
    recentCards,
    SETTINGS,
    updateSearchEntryLayout,
    updateSuggestionsFloatingLayout,
    scheduleWallpaperAdaptiveToneUpdate,
    normalizeNewtabTopContentMode,
    normalizeNewtabTimeFontWeight,
    normalizeNewtabTimeFont,
    normalizeNewtabTimeSecondsVisible,
    getFixedTimeInk,
    pageState
  });

  const {
    finishNewtabEntryAnimation,
    scheduleNewtabReadyAfterViewportSettle,
    markNewtabReady
  } = NEWTAB_ENTRY_MOTION.createEntryMotion({
    root,
    shouldSkipNewtabEntryMotion,
    updateBookmarkSectionPosition,
    finishWordmarkEntryAnimation,
    rememberSearchEntryViewport,
    getSearchEntryViewportSnapshot,
    hasSearchEntryViewportChanged,
    pageState
  });

  pageState.searchLayer = pageStructureRuntime.searchLayer;

  const {
    topActionTooltipController,
    shortcutTooltipController,
    shortcutDialogTooltipController,
    bookmarkCascadeCopyTooltipController,
    bookmarkCursorTooltipController,
    searchInputCursorTooltipController
  } = NEWTAB_TOOLTIP_CONTROLLERS.createTooltipControllers({

  });


  const {
    showTopActionTooltip,
    hideTopActionTooltip,
    bindSearchInputCursorTooltip,
    hideSearchInputCursorTooltip,
    bindShortcutTooltip,
    hideShortcutTooltip,
    bindShortcutDialogTooltip,
    hideShortcutDialogTooltip,
    bindCursorTooltip,
    hideCursorTooltip
  } = NEWTAB_TOOLTIP_BINDINGS.createTooltipBindings({
    topActionTooltipController,
    searchInputCursorTooltipController,
    shortcutTooltipController,
    t,
    isShortcutDragActive: (...args) => isShortcutDragActive(...args),
    isBookmarkDragActive: () => isBookmarkDragActive() ||
      Boolean(pageState.recentCardDragRuntime && pageState.recentCardDragRuntime.isRecentCardDragActive()),
    isShortcutContextMenuOpen,
    shortcutDialogTooltipController,
    bookmarkCursorTooltipController,
    shouldSuppressBookmarkHover: (...args) => shouldSuppressBookmarkHover(...args),
    pageState
  });

  const {
    updateRecentHeading,
    updateRecentModeMenu,
    setRecentMode,
    canDismissRecentCard,
    updateBookmarkHeading,
    isBookmarkTopbarMode,
    getNewtabTopOccupiedInsetPx,
    getNewtabViewportTopPaddingPx,
    getBookmarkCascadeViewportTopPaddingPx,
    setNewtabTopOccupied,
    setNewtabTopLayout,
    syncBookmarkSurfaceMode,
    setBookmarkSurfaceVisible,
    updateBookmarkModeMenu,
    applyBookmarkViewMode,
    setBookmarkViewMode,
    navigateBookmarkFolder,
    updateBookmarkPagerLabels,
    bindBookmarkPagerTooltip,
    updateBookmarkBreadcrumb
  } = NEWTAB_SECTION_HEADERS.createSectionHeaders({
    t,
    normalizeRecentMode,
    storageArea,
    RECENT_MODE_STORAGE_KEY,
    markRecentDataDirty: (...args) => markRecentDataDirty(...args),
    loadRecentSites: (...args) => loadRecentSites(...args),
    getNewtabVisualViewportInsets,
    BOOKMARK_TOPBAR_HEIGHT_PX,
    updateSearchEntryLayout,
    setContentSectionVisible,
    bookmarkSection,
    bookmarkCards,
    normalizeBookmarkViewMode,
    markBookmarkDataDirty: (...args) => markBookmarkDataDirty(...args),
    loadBookmarks: (...args) => loadBookmarks(...args),
    closeBookmarkCascadeMenu,
    persistBookmarkViewMode,
    showTopActionTooltip,
    hideTopActionTooltip,
    pageState
  });

  const {
    getBookmarkViewModeOptions,
    createSectionModeSelect
  } = NEWTAB_SECTION_MODE_SELECT.createSectionModeSelect({
    t,
    getEffectiveBookmarkTopbarSurfaceMode,
    isBookmarkTopbarMode,
    getBookmarkTopbarLayout,
    BOOKMARK_TOPBAR_LAYOUT_ACTION,
    BOOKMARK_TOPBAR_SURFACE_MODE_ACTION,
    BOOKMARK_TOPBAR_PICK_COLOR_ACTION,
    sectionModeSelectController,
    showTopActionTooltip,
    hideTopActionTooltip,
    pageState
  });

  const {
    getShortcutFolderId,
    getFolderItemIconUrl,
    getFolderItemIcon,
    getFolderItemIconForShortcut,
    updateFolderItemIcons,
    getVisibleShortcuts,
    refreshShortcutFolderReferences,
    getShortcutStoreOptions,
    isShortcutSyncStorageActive,
    scheduleShortcutStorageReload,
    getShortcutIconDataUrl,
    getShortcutFaviconDataUrl,
    getShortcutFaviconCandidateUrl,
    getShortcutTitle,
    renderShortcuts,
    flushDeferredShortcutRender,
    loadNewtabShortcutPreferences,
    loadVisibleShortcuts,
    persistShortcuts,
    removeShortcutById,
    hasShortcutForSite,
    addSiteToShortcuts,
    hideShortcutAddFromContextMenu,
    createShortcutsSection,
    createShortcutDialogComponent,
    getShortcutGroups,
    isWebDavBackingUpShortcuts,
    isShortcutGroupLayoutActive,
    fitShortcutGroupColumns,
    openShortcutAddDialog,
    openShortcutGroupDialog,
    moveShortcutGroup,
    moveShortcutGroupToIndex,
    deleteShortcutGroup,
    confirmDeleteShortcutGroupWithSites,
    applyShortcutGroupDeleteRecord
  } = NEWTAB_SHORTCUTS_CONTROLLER.createShortcutsController({
    shortcutFolderRuntime,
    bookmarksRuntime,
    isShortcutDragActive: (...args) => isShortcutDragActive(...args),
    moveShortcutByKeyboard: (...args) => moveShortcutByKeyboard(...args),
    MAX_NEWTAB_SHORTCUTS,
    normalizeHost,
    sanitizeDisplayText,
    providerStorageRuntime,
    storageAreaName,
    NEWTAB_SHORTCUTS_STORE,
    NEWTAB_SHORTCUTS_CRITICAL_SYNC_RESERVE_BYTES,
    NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY,
    shortcutIconStore,
    folderItemIconStore,
    SHORTCUT_FAVICON,
    getPageFaviconUrlResolver,
    SEARCH_UTILS,
    getExtensionResourceUrl,
    sendRuntimeMessage,
    shortcutFaviconStore,
    faviconCacheRuntime: pageState.faviconCacheRuntime,
    FAVICON_UTILS,
    getPersistedFaviconDataEntry,
    t,
    hideShortcutTooltip,
    closeShortcutContextMenu,
    syncOpenBookmarkCascadeAnchorVisual: (...args) => syncOpenBookmarkCascadeAnchorVisual(...args),
    applyNewtabShortcutsVisibility,
    updateShortcutLanguageStrings,
    updateBookmarkSectionPosition,
    storageArea,
    NEWTAB_SHORTCUT_ICON_STORE,
    NEWTAB_SHORTCUT_ICON_PLATE,
    pickShortcutIconPlateColor,
    NEWTAB_SHORTCUT_COLUMNS_DEFAULT,
    NEWTAB_SHORTCUT_SIZE_DEFAULT,
    NEWTAB_SHORTCUT_GAP_DEFAULT,
    applyNewtabShortcutLayoutPreferences,
    applyNewtabShortcutDockMagnification,
    updateNewtabShortcutPreferencesUi,
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
    loadFolderColors,
    showToast,
    formatMessage,
    getShortcutById,
    SHORTCUT_DIALOG_MODE_EDIT,
    SHORTCUT_DIALOG_ITEM_FOLDER,
    markBookmarkTreeDirty: (...args) => markBookmarkTreeDirty(...args),
    loadBookmarks: (...args) => loadBookmarks(...args),
    refreshOpenBookmarkCascadeMenu: (...args) => refreshOpenBookmarkCascadeMenu(...args),
    NEWTAB_BOOKMARK_MOVE_HISTORY,
    bookmarkMoveHistory,
    getBookmarkUndoShortcutLabel: (...args) => getBookmarkUndoShortcutLabel(...args),
    resetShortcutDockHover,
    scheduleWallpaperAdaptiveToneUpdate,
    pageStructureRuntime,
    NEWTAB_SHORTCUTS_VIEW,
    shortcutTiles,
    shortcutGroupHeaders,
    getFigmaFolderSvg,
    initFolderPathMorph,
    playFolderPathMorph,
    getHostFromUrl,
    getImmediateThemeForSuggestion,
    applyShortcutTileTheme,
    queueThemeForTarget,
    attachFaviconWithFallbacks,
    bindShortcutTooltip,
    isMiddleClick,
    openShortcutUrl,
    isCardActivationSuppressed,
    handleShortcutContextMenu,
    handleShortcutNativeDragStart,
    getRiSvg,
    openShortcutDialog,
    openShortcutAddContextMenu,
    handleShortcutDragPointerDown: (...args) => handleShortcutDragPointerDown(...args),
    handleShortcutDockPointerOver,
    handleShortcutDockPointerMove,
    syncShortcutDockFolderMenu,
    NEWTAB_SHORTCUT_DIALOG,
    bindShortcutDialogTooltip,
    hideShortcutDialogTooltip,
    SHORTCUT_DIALOG_ITEM_BOOKMARK,
    handleShortcutGroupMenu: openShortcutGroupMenu,
    WEBDAV_STATUS_STORAGE_KEY: SETTINGS.WEBDAV_STATUS_STORAGE_KEY,
    animateShortcutLayoutChange: (...args) => animateShortcutLayoutChange(...args),
    pageState
  });

  const {
    queueBookmarkLayoutAnimation,
    playPendingBookmarkLayoutAnimation,
    updateBookmarkDragLayoutCache,
    setBookmarkDragCardTransform,
    isEmptyBookmarkRootHidden,
    getExternalBookmarkSurfacePoint,
    isValidExternalBookmarkDropTarget,
    getShortcutFolderDropTargetAt,
    getShortcutInsertionDropTarget,
    getExternalBookmarkDropTarget,
    isPointOverShortcutDropSurface,
    applyBookmarkShortcutTransfer,
    applyShortcutStack,
    clearDragDropTarget,
    isBookmarkCascadeSurfaceAtPoint,
    setDragDropTarget,
    getBookmarkDragPageSwitchDirection,
    clearBookmarkDragPageSwitch,
    clearBookmarkDragFolderSwitch,
    scheduleBookmarkDragFolderSwitch,
    scheduleBookmarkDragPageSwitch,
    scheduleBookmarkDragMove,
    deleteBookmarkFromContextTarget,
    addBookmarkFolderToShortcuts,
    hasShortcutForBookmarkFolder,
    getBookmarkUndoShortcutLabel,
    refreshOpenBookmarkCascadeMenu,
    syncOpenBookmarkCascadeAnchorVisual,
    performBookmarkMoveHistoryAction,
    isBookmarkDragActive,
    shouldSuppressBookmarkHover,
    finishBookmarkDrag,
    handleBookmarkDragPointerDown,
    handleBookmarkCascadeItemPointerDown
  } = NEWTAB_BOOKMARK_DRAG_CONTROLLER.createBookmarkDragController({
    isBookmarkTopbarMode,
    getBookmarkLimit,
    NEWTAB_BOOKMARK_DRAG,
    getFigmaFolderSvg,
    initFolderPathMorph,
    setFolderPathMorphState,
    isContentSectionVisible,
    bookmarkSection,
    bookmarksRuntime,
    NEWTAB_CROSS_SURFACE_DRAG,
    NEWTAB_BOOKMARK_MOVE_HISTORY,
    getShortcutById,
    getShortcutFolderId,
    getShortcutReorderTiles,
    getShortcutTileLayoutRect: (...args) => getShortcutTileLayoutRect(...args),
    NEWTAB_SHORTCUTS_STORE,
    getShortcutStoreOptions,
    getShortcutInsertionSlotAt: (...args) => getShortcutInsertionSlotAt(...args),
    MAX_NEWTAB_SHORTCUTS,
    getShortcutTileId,
    FOLDER_REFERENCES,
    bookmarkMoveHistory,
    showToast,
    t,
    refreshShortcutFolderReferences,
    shortcutFolderRuntime,
    updateFolderItemIcons,
    persistShortcuts,
    markBookmarkTreeDirty: (...args) => markBookmarkTreeDirty(...args),
    loadBookmarks: (...args) => loadBookmarks(...args),
    getBookmarkPageCount: (...args) => getBookmarkPageCount(...args),
    // A recent card dragged over the bookmarks opens folders like the others.
    isBookmarkSurfaceDragStateActive: (state) => isBookmarkSurfaceDragStateActive(state) ||
      Boolean(pageState.recentCardDragRuntime && pageState.recentCardDragRuntime.isRecentCardDragState(state)),
    openBookmarkCascadeMenu,
    navigateBookmarkFolder,
    switchBookmarkPageDuringDrag: (...args) => switchBookmarkPageDuringDrag(...args),
    setShortcutDragTileTransform: (...args) => setShortcutDragTileTransform(...args),
    scheduleWallpaperAdaptiveToneUpdate,
    formatMessage,
    isShortcutDragActive: (...args) => isShortcutDragActive(...args),
    hideCursorTooltip,
    isEditableElement: (...args) => isEditableElement(...args),
    closeBookmarkCascadeMenu,
    renderCurrentBookmarkPage: (...args) => renderCurrentBookmarkPage(...args),
    applyShortcutGroupDeleteRecord,
    autoScrollShortcutArea: (...args) => autoScrollShortcutArea(...args),
    closeBookmarkContextMenu,
    getShortcutGroups: (...args) => getShortcutGroups(...args),
    isWebDavBackingUpShortcuts,
    pageState
  });

  createShortcutsSection();

  NEWTAB_BOOKMARK_SECTION.createBookmarkSection({
    setContentSectionVisible,
    bookmarkSection,
    pageStructureRuntime,
    updateBookmarkHeading,
    navigateBookmarkFolder,
    createSectionModeSelect,
    setBookmarkViewMode,
    handleBookmarkModeMenuAction,
    getBookmarkViewModeOptions,
    bindBookmarkPagerTooltip,
    t,
    updateBookmarkPagerLabels,
    updateBookmarkBreadcrumb,
    handleBookmarkDragPointerDown,
    applyBookmarkGridColumns,
    bookmarkCards,
    formatMessage,
    sanitizeDisplayText,
    getHostFromUrl,
    getSiteDisplayName,
    getUrlDisplay,
    getRiSvg,
    getFigmaFolderSvg,
    initFolderPathMorph,
    playFolderPathMorph,
    stableHashCode,
    normalizeHost,
    attachFaviconWithFallbacks,
    isLocalNetworkHost,
    getChromeFaviconUrl,
    getBrowserPageFaviconUrl,
    getImmediateThemeForSuggestion,
    queueThemeForTarget,
    applyBookmarkCardTheme,
    shouldDelayBookmarkHoverFromRecent,
    shouldSuppressBookmarkHover,
    bindCursorTooltip,
    hideCursorTooltip,
    openBookmarkFolder,
    openBookmarkCascadeMenu,
    copyBookmarkUrl,
    handleBookmarkItemContextMenu,
    isCardActivationSuppressed,
    navigateToUrl,
    openUrlFromNewtabCard,
    dismissStack,
    NEWTAB_CROSS_SURFACE_DRAG,
    isShortcutFolderAnchor,
    getFolderItemIconUrl,
    bookmarksRuntime,
    bookmarkCascadeCopyTooltipController,
    showTopActionTooltip,
    hideTopActionTooltip,
    handleBookmarkCascadeItemPointerDown,
    isBookmarkContextMenuNode,
    getBookmarkCascadeViewportTopPaddingPx,
    NEWTAB_BOOKMARKS_TOPBAR,
    setNewtabTopOccupied,
    syncBookmarkTopbarSurfaceAppearance,
    syncBookmarkSurfaceMode,
    pageState
  });

  NEWTAB_RECENT_SECTION.createRecentSection({
    setContentSectionVisible,
    hideTopActionTooltip,
    pageStructureRuntime,
    updateRecentHeading,
    t,
    setRecentMode,
    applyRecentGridColumns,
    recentCards,
    formatMessage,
    sanitizeDisplayText,
    getOwnExtensionPageDisplay,
    getHostFromUrl,
    getCanonicalPageUrlForFavicon,
    getSiteDisplayName,
    getUrlDisplay,
    getRiSvg,
    attachFaviconWithFallbacks,
    getBrowserPageFaviconUrl,
    getImmediateThemeForSuggestion,
    queueThemeForTarget,
    applyRecentCardTheme,
    getRecentLimit,
    isRecentSitePinned,
    MAX_PINNED_RECENT_SITES,
    updateRecentPinButton,
    showToast,
    showTopActionTooltip,
    navigateToUrl,
    bindCursorTooltip,
    hideCursorTooltip,
    openUrlFromNewtabCard,
    togglePinnedRecentSite,
    handleRecentCardContextMenu,
    isCardActivationSuppressed,
    getRecentProgressState,
    toggleRecentProgressTracking,
    pageState
  });

  const {
    bottomDockRuntime,
    bottomDock
  } = NEWTAB_BOTTOM_DOCK_RUNTIME.createBottomDockRuntime({
    NEWTAB_LAYOUT,
    root,
    bookmarkSection,
    suggestionsSurface,
    suggestionsOutline,
    getNewtabTopOccupiedInsetPx,
    NEWTAB_MOBILE_FLOW_BREAKPOINT_PX,
    shouldAnimateNewtabLayoutShift,
    applyNewtabWidthMode,
    pageState
  });

  pageState.bookmarkPagerPrevButton.addEventListener('click', () => {
    if (pageState.bookmarkCurrentPage <= 0) {
      return;
    }
    switchBookmarkPage(pageState.bookmarkCurrentPage - 1);
  });
  pageState.bookmarkPagerNextButton.addEventListener('click', () => {
    const pageCount = getBookmarkPageCount();
    if (pageState.bookmarkCurrentPage >= (pageCount - 1)) {
      return;
    }
    switchBookmarkPage(pageState.bookmarkCurrentPage + 1);
  });
  pageState.bookmarkOpenManagerButton.addEventListener('click', () => {
    if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
      return;
    }
    chrome.runtime.sendMessage({ action: 'openBookmarkManager' });
  });
  bookmarkSection.addEventListener('wheel', (event) => {
    if (!event || !isContentSectionVisible(bookmarkSection)) {
      return;
    }
    handleBookmarkWheel(event);
  }, { passive: false });

  const {
    getBookmarkPageCount,
    updateBookmarkPagerState,
    updateBookmarkGridHeightLock,
    renderCurrentBookmarkPage,
    switchBookmarkPageDuringDrag,
    switchBookmarkPage,
    handleBookmarkWheel
  } = NEWTAB_BOOKMARK_PAGER.createBookmarkPager({
    isBookmarkTopbarMode,
    getBookmarkLimit,
    NEWTAB_BOOKMARKS_STORE,
    hideTopActionTooltip,
    getBookmarkGridColumnCount,
    renderBookmarks: (...args) => renderBookmarks(...args),
    updateBookmarkSectionPosition,
    pageState
  });

  const {
    getShortcutTileLayoutRect,
    setShortcutDragTileTransform,
    getShortcutInsertionSlotAt,
    autoScrollShortcutArea,
    animateShortcutLayoutChange,
    scheduleShortcutDragMove,
    finishShortcutDrag,
    moveShortcutByKeyboard,
    isShortcutDragActive,
    isBookmarkSurfaceDragStateActive,
    handleShortcutDragPointerDown
  } = NEWTAB_SHORTCUT_DRAG.createShortcutDrag({
    getShortcutReorderTiles,
    NEWTAB_CROSS_SURFACE_DRAG,
    refreshShortcutTileCacheFromDom,
    getShortcutTileId,
    getShortcutTileById,
    renderShortcuts,
    flushDeferredShortcutRender,
    resetShortcutDockHover,
    NEWTAB_BOOKMARK_MOVE_HISTORY,
    persistShortcuts,
    bookmarkMoveHistory,
    hideCursorTooltip,
    closeBookmarkCascadeMenu,
    hideShortcutTooltip,
    isEmptyBookmarkRootHidden,
    renderCurrentBookmarkPage,
    isBookmarkTopbarMode,
    isBookmarkCascadeSurfaceAtPoint,
    getExternalBookmarkSurfacePoint,
    isPointOverShortcutDropSurface,
    clearBookmarkDragPageSwitch,
    clearBookmarkDragFolderSwitch,
    clearDragDropTarget,
    scheduleWallpaperAdaptiveToneUpdate,
    getBookmarkDragPageSwitchDirection,
    scheduleBookmarkDragPageSwitch,
    getShortcutFolderDropTargetAt,
    getExternalBookmarkDropTarget,
    setDragDropTarget,
    scheduleBookmarkDragFolderSwitch,
    getShortcutById,
    isValidExternalBookmarkDropTarget,
    bookmarksRuntime,
    getShortcutFolderId,
    queueBookmarkLayoutAnimation,
    applyBookmarkShortcutTransfer,
    applyShortcutStack,
    getFolderItemIconForShortcut,
    FOLDER_REFERENCES,
    showToast,
    hideToast,
    t,
    formatMessage,
    getBookmarkUndoShortcutLabel,
    refreshShortcutFolderReferences,
    isShortcutContextMenuNode,
    getShortcutTileFromNode,
    closeShortcutContextMenu,
    moveShortcutGroupToIndex,
    fitShortcutGroupColumns,
    pageState
  });

  pageState.recentCardDragRuntime = NEWTAB_RECENT_CARD_DRAG.createRecentCardDrag({
    NEWTAB_SHORTCUTS_STORE,
    NEWTAB_CROSS_SURFACE_DRAG,
    NEWTAB_BOOKMARK_MOVE_HISTORY,
    getShortcutStoreOptions,
    getShortcutFolderId,
    MAX_NEWTAB_SHORTCUTS,
    persistShortcuts,
    bookmarkMoveHistory,
    bookmarksRuntime,
    isBookmarkTopbarMode,
    isBookmarkCascadeSurfaceAtPoint,
    getExternalBookmarkSurfacePoint,
    getExternalBookmarkDropTarget,
    getShortcutFolderDropTargetAt,
    getShortcutInsertionDropTarget,
    isPointOverShortcutDropSurface,
    isValidExternalBookmarkDropTarget,
    autoScrollShortcutArea,
    setDragDropTarget,
    clearDragDropTarget,
    getBookmarkDragPageSwitchDirection,
    scheduleBookmarkDragPageSwitch,
    clearBookmarkDragPageSwitch,
    scheduleBookmarkDragFolderSwitch,
    clearBookmarkDragFolderSwitch,
    applyBookmarkShortcutTransfer,
    queueBookmarkLayoutAnimation,
    isEmptyBookmarkRootHidden,
    renderCurrentBookmarkPage,
    closeBookmarkCascadeMenu,
    closeRecentContextMenu,
    hideCursorTooltip,
    hideTopActionTooltip,
    resetShortcutDockHover,
    scheduleWallpaperAdaptiveToneUpdate,
    showToast,
    t,
    formatMessage,
    getRiSvg,
    pageState
  });

  const {
    renderBookmarks,
    renderRecentSites,
    markBookmarkDataDirty,
    markBookmarkTreeDirty,
    markRecentDataDirty,
    loadBookmarks,
    loadRecentSites,
    handleRecentVisibilityChange,
    forceReloadRecentSitesForI18n
  } = NEWTAB_SECTION_LOADERS.createSectionLoaders({
    isShortcutDragActive,
    isRecentCardDragActive: pageState.recentCardDragRuntime.isRecentCardDragActive,
    resumeRecentCardDragAfterFolderSwitch: pageState.recentCardDragRuntime.resumeRecentCardDragAfterFolderSwitch,
    isBookmarkTopbarMode,
    scheduleShortcutDragMove,
    updateBookmarkDragLayoutCache,
    setBookmarkDragCardTransform,
    scheduleBookmarkDragMove,
    syncOpenBookmarkCascadeAnchorVisual,
    setBookmarkSurfaceVisible,
    updateBookmarkGridHeightLock,
    updateBookmarkSectionPosition,
    updateBookmarkPagerState,
    normalizeRecentSiteRecord,
    getRecentSiteUrlKey,
    writeHiddenRecentSites,
    shouldExcludeFromRecentSites,
    isRecentSiteHidden,
    mergeRecentSitesWithPinned,
    getRecentLimit,
    setContentSectionVisible,
    recentSection: pageState.recentSection,
    bookmarksRuntime,
    closeBookmarkCascadeMenu,
    bootstrapInitialThemeMode,
    areFaviconRenderCachesReady,
    FAVICON_CACHE_BOOT_WAIT_MS,
    waitForFaviconRenderCaches,
    getTopBookmarks,
    getBookmarkLimit,
    getBookmarkPageCount,
    updateBookmarkBreadcrumb,
    renderCurrentBookmarkPage,
    playPendingBookmarkLayoutAnimation,
    renderShortcuts,
    getRecentSourceLimit,
    getRecentSites,
    MAX_PINNED_RECENT_SITES,
    beginSearchEntryRestoreLayoutLock,
    pageState
  });

  const numberShortcutOptions = {
    onHoldStart: function() {
      showToast(t(
        'search_number_jump_release_hint',
        'Release to show numbers'
      ), false, { duration: 0 });
    },
    onHoldEnd: hideToast,
    instantActive: () => pageState.numberShortcutInstantEnabled
  };

  // Kick off favicon cache warmup early; theme tint work flushes when storage is ready.
  pageState.faviconCacheRuntime.ensureCachesReady().then(() => {
    scheduleThemeResolutionFlush(0);
    refreshThemeAwareFavicons();
    scheduleThemeAwareFaviconRescue();
  });

  function getSiteDisplayName(hostname, title) {
    return SITE_DISPLAY_NAME.getSiteDisplayName(
      hostname,
      title,
      SITE_DISPLAY_NAME_OPTIONS
    );
  }

  const {
    getAutocompleteCandidate,
    clearAutocomplete,
    restoreUserAuthoredSearchInput,
    dismissAutocompletePreviewOnNonTabKey,
    applyAutocomplete
  } = NEWTAB_SEARCH_AUTOCOMPLETE.createSearchAutocomplete({
    getUrlDisplay,
    isEnglishQuery,
    getKeywordSearchSuggestionState,
    pageState
  });

  const attachInputModeFaviconData =
    SHORTCUT_FAVICON.createSiteSearchProviderIconHydrator(attachFaviconData);

  const {
    getSearchModeProviders,
    isAggregateSearchDefinitionAvailable,
    getSearchTriggerProviders,
    getSearchModeMenuItems,
    reorderSearchModeMenu,
    moveSearchModeMenuGroup,
    stepSearchModeMenuHistory,
    openSearchModeMenuFromDoubleTab,
    selectSearchModeMenuItem,
    restoreSearchModeQuery,
    getLocalSearchScopeTabHintProvider,
    setLocalSearchScopePrefix,
    activateLocalSearchScope,
    clearLocalSearchScope,
    activateSiteSearch,
    clearSiteSearch,
    handleSearchTabKey
  } = NEWTAB_SEARCH_MODES.createSearchModes({
    SEARCH_UTILS,
    defaultSiteSearchProviders,
    getSearchModeProviderId,
    AGGREGATE_SEARCH_STORE,
    t,
    createAggregateSearchScopeProvider,
    isAggregateSearchProvider,
    isSearchEngineSiteSearchProvider,
    isAiSiteSearchProvider,
    getSiteSearchDisplayName,
    getProviderIcon,
    getLocalSearchScopeLabel,
    getLocalSearchScopeIconClass,
    loadSiteSearchIconCache,
    getSiteSearchProviders,
    getAggregateSearches,
    formatMessage,
    defaultTheme,
    clearAutocomplete,
    clearSearchSuggestions: (...args) => clearSearchSuggestions(...args),
    clearSiteSearchPrefix: (...args) => clearSiteSearchPrefix(...args),
    setSiteSearchPrefix: (...args) => setSiteSearchPrefix(...args),
    getThemeForProvider,
    getTopSiteMatchCandidate,
    getSiteSearchTriggerCandidate,
    getLocalSearchScopeCandidate,
    getShortcutRules: (...args) => getShortcutRules(...args),
    readSearchSourceOrder: () => SETTINGS.readStorageValue(
      storageArea,
      chrome,
      SETTINGS.SEARCH_SOURCE_ORDER_STORAGE_KEY
    ),
    writeSearchSourceOrder: (value) => SETTINGS.writeStorageValue(
      storageArea,
      chrome,
      SETTINGS.SEARCH_SOURCE_ORDER_STORAGE_KEY,
      value
    ),
    pageState
  });

  const { getNextSuggestionIndex } = NEWTAB_SEARCH_NAVIGATION;
  const {
    getShortcutRules,
    buildKeywordSuggestions,
    getDirectUrlSuggestion,
    getDirectNavigationUrl,
    getMatchedOpenTabIdForSuggestion,
    shouldSwitchMatchedTabSuggestion,
    shouldOpenSearchResultInBackgroundTab,
    getSearchResultDisposition,
    openSearchResultUrl,
    openMatchedTabSuggestion,
    refreshTabsForSearchContext,
    resolveQuickNavigation,
    submitSearchQuery
  } = NEWTAB_SEARCH_NAVIGATION.createSearchNavigation({
    formatMessage,
    getExtensionResourceUrl,
    BROWSER_PROFILE,
    getPageFaviconCandidateUrl,
    SEARCH_UTILS,
    SUGGESTION_ACTION_MODEL,
    isBackgroundOpenEvent,
    getSurfaceOpenDisposition,
    recordSearchSuggestionSelection,
    navigateToUrl,
    suggestionItems,
    getAutoHighlightIndex: (...args) => getAutoHighlightIndex(...args),
    renderSuggestions: (...args) => renderSuggestions(...args),
    isSlashCommandInput: (...args) => isSlashCommandInput(...args),
    getCommandMatch: (...args) => getCommandMatch(...args),
    isModeCommand: (...args) => isModeCommand(...args),
    isZenCommand: (...args) => isZenCommand(...args),
    getNextThemeMode: (...args) => getNextThemeMode(...args),
    setVisibleThemeMode: (...args) => setVisibleThemeMode(...args),
    setZenModeEnabled: (...args) => setZenModeEnabled(...args),
    activateSiteSearch,
    focusSearchInputPreservingScroll: (...args) => focusSearchInputPreservingScroll(...args),
    openCommunityQrDialog: (...args) => openCommunityQrDialog(...args),
    runSiteSearchProviderQuery,
    navigateToQuery,
    pageState
  });

  const {
    setSuggestionActionModifiersActive,
    syncSuggestionActionModifiersFromEvent,
    getAutoHighlightIndex,
    updateSelection,
    activateRenderedSuggestion,
    deleteRenderedHistorySuggestion,
    scrollSelectedSuggestionIntoView,
    requestTabsAndRender,
    refreshTabsIfIdle,
    clearSearchSuggestions,
    dismissSearchSuggestionsFromBackground,
    restoreDismissedSearchSuggestions,
    renderSuggestions,
    renderPendingSuggestions,
    showSuggestionSnapshot,
    directNavigationSettleController,
    requestSuggestions
  } = NEWTAB_SUGGESTIONS_CONTROLLER.createSuggestionsController({
    SUGGESTION_ACTION_MODEL,
    activateSiteSearch,
    focusSearchInputPreservingScroll: (...args) => focusSearchInputPreservingScroll(...args),
    setVisibleThemeMode: (...args) => setVisibleThemeMode(...args),
    setZenModeEnabled: (...args) => setZenModeEnabled(...args),
    shouldSwitchMatchedTabSuggestion,
    openMatchedTabSuggestion,
    runSiteSearchProviderQuery,
    shouldOpenSearchResultInBackgroundTab,
    getSearchResultDisposition,
    openSearchResultUrl,
    navigateToQuery,
    suggestionsContainer: pageState.suggestionsContainer,
    suggestionItems,
    SUGGESTION_NAVIGATION,
    refreshTabsForSearchContext,
    clearSiteSearchTabHint: (...args) => clearSiteSearchTabHint(...args),
    restoreUserAuthoredSearchInput,
    isSlashCommandInput: (...args) => isSlashCommandInput(...args),
    getShortcutRules,
    isModeCommand: (...args) => isModeCommand(...args),
    isZenCommand: (...args) => isZenCommand(...args),
    storageArea,
    THEME_STORAGE_KEY,
    NEWTAB_THEME_MODE_STORAGE_KEY,
    NEWTAB_THEME_SCOPE_STORAGE_KEY,
    normalizeThemeMode,
    normalizeNewtabThemeMode,
    normalizeNewtabThemeScope,
    getScopedThemeMode,
    applyThemeMode,
    getCommandMatches: (...args) => getCommandMatches(...args),
    buildModeSuggestion: (...args) => buildModeSuggestion(...args),
    buildZenSuggestion: (...args) => buildZenSuggestion(...args),
    buildCommandSuggestion: (...args) => buildCommandSuggestion(...args),
    getDirectUrlSuggestion,
    buildKeywordSuggestions,
    defaultSiteSearchProviders,
    getSearchTriggerProviders,
    getSiteSearchProviders,
    getInlineSiteSearchCandidate,
    buildSearchUrl,
    getSiteSearchActionTitle,
    getProviderIcon,
    formatMessage,
    buildDefaultSearchUrl,
    getDefaultSearchEngineFaviconUrl,
    isAggregateSearchProvider,
    SEARCH_UTILS,
    getMatchedOpenTabIdForSuggestion,
    filterBlacklistedSuggestions,
    getKeywordSearchSuggestionState,
    promoteStrongNavigationMatch,
    promoteTopSiteMatch,
    getSiteSearchTriggerCandidate,
    getAutocompleteCandidate,
    getUrlDisplay,
    getDirectNavigationUrl,
    findProviderForSuggestionMatch,
    clearAutocomplete,
    applyAutocomplete,
    getLocalSearchScopeCandidate,
    setSiteSearchTabHint: (...args) => setSiteSearchTabHint(...args),
    getLocalSearchScopeTabHintProvider,
    limitSuggestionsForDisplay,
    t,
    warmIconCache,
    setSuggestionsVisible,
    NEWTAB_DIRECT_NAVIGATION_SETTLE,
    sendRuntimeMessage,
    HELP_CENTER_SEARCH: LumnoHelpCenterSearch || null,
    COMMUNITY_LINKS: LumnoCommunityLinks || null,
    openCommunityQrDialog: (...args) => openCommunityQrDialog(...args),
    getHelpCenterLocale: (...args) => getHelpCenterLocale(...args),
    pageState
  });

  const {
    isEditableElement,
    refreshFallbackShortcut,
    focusSearchInputPreservingScroll,
    handleGlobalTypingFocus
  } = NEWTAB_INPUT_FOCUS.createInputFocus({
    SHORTCUT_KEY_MATCHER,
    prepareFocusReload: () => Boolean(pageState.focusResume) && pageState.focusResume.prepareFocusReload(),
    refreshTabsIfIdle,
    initialNewtabInputAutoFocusReadyTask,
    isImeCompositionEvent,
    pageState
  });

  const {
    getCommandMatches,
    getCommandMatch,
    buildCommandSuggestion,
    updateModeBadge,
    getNextThemeMode,
    isModeCommand,
    isZenCommand,
    isSlashCommandInput,
    buildModeSuggestion,
    buildZenSuggestion,
    updateModeCommandSuggestions,
    updateZenCommandSuggestions,
    applyZenMode,
    setZenModeEnabled,
    loadZenMode,
    getThemeScope,
    setThemeMode,
    setVisibleThemeMode,
    setThemeScope
  } = NEWTAB_MODE_COMMANDS.createModeCommands({
    t,
    formatMessage,
    updateInputRightPadding: (...args) => updateInputRightPadding(...args),
    getExtensionResourceUrl,
    renderSuggestions,
    applyNewtabTopContentVisibility,
    applyNewtabShortcutsVisibility,
    bookmarkSection,
    recentSection: pageState.recentSection,
    isBookmarkTopbarMode,
    bookmarkCards,
    closeBookmarkCascadeMenu,
    closeShortcutContextMenu,
    closeRecentContextMenu,
    closeShortcutDialog,
    closeWallpaperPanel,
    closeFeedbackPopover,
    hideTopActionTooltip,
    hideShortcutTooltip,
    hideCursorTooltip,
    updateBookmarkSectionPosition,
    updateSearchEntryLayout,
    scheduleWallpaperAdaptiveToneUpdate,
    normalizeZenModeEnabled,
    storageArea,
    NEWTAB_ZEN_MODE_STORAGE_KEY,
    SETTINGS,
    THEME_STORAGE_KEY,
    applyScopedThemeMode,
    updateWallpaperLanguageStrings,
    normalizeThemeMode,
    NEWTAB_THEME_MODE_STORAGE_KEY,
    normalizeNewtabThemeMode,
    isNewtabThemeFollowingGlobal,
    normalizeNewtabThemeScope,
    NEWTAB_THEME_SCOPE_STORAGE_KEY,
    pageState
  });

  // Result labels follow where a plain click goes: 「前往」 in this tab, 「新开」 in a new one.
  const newtabSuggestionActionModel = Object.assign({}, SUGGESTION_ACTION_MODEL, {
    createSearchActionModel(input) {
      const openInNewTab = pageState.newtabOpenInNewTab.search === true;
      const model = SUGGESTION_ACTION_MODEL.createSearchActionModel({
        ...input,
        enterAction: openInNewTab ? 'openNewTab' : 'go'
      });
      return !openInNewTab && model.visitButtonAction === 'openNewTab'
        ? { ...model, visitButtonAction: 'go' }
        : model;
    }
  });

  const {
    searchInput,
    rightIcon,
    setSearchScopeIconEnabled
  } = NEWTAB_SEARCH_BOX.createSearchBox({
    suggestionItems,
    t,
    formatMessage,
    getRiSvg,
    sanitizeDisplayText,
    shouldBlockFaviconForHost,
    isLocalNetworkHost,
    getHostFromUrl,
    getUrlDisplay,
    getThemeHostForSuggestion,
    getImmediateThemeForSuggestion,
    getThemeForSuggestion,
    shouldUseUrlFallbackThemeForSuggestion,
    getThemeForMode,
    getHoverColors,
    getNeutralHoverActionColors,
    applyThemeVariables,
    applyMarkVariables,
    applyFaviconOpticalAlignment,
    applyFaviconOpticalShift,
    applyFallbackIcon,
    setFaviconSrcWithAnimation,
    attachFaviconWithFallbacks,
    reportMissingIcon,
    preloadIcon,
    getChromeFaviconUrl,
    getBrowserPageFaviconUrl,
    getPageFaviconRenderCandidates,
    setSuggestionsVisible,
    shouldOpenSearchResultInBackgroundTab,
    activateRenderedSuggestion,
    deleteRenderedHistorySuggestion,
    copySearchResultUrl,
    showTopActionTooltip,
    hideTopActionTooltip,
    bindCursorTooltip,
    getSearchActionLabel,
    getSiteSearchDisplayName,
    isAiSiteSearchProvider,
    getDefaultSearchEngineThemeUrl,
    getBrandAccentForUrl,
    buildThemeFromAccent,
    newtabSuggestionActionModel,
    shouldSwitchMatchedTabSuggestion,
    defaultTheme,
    urlHighlightTheme,
    createSearchInput,
    searchInputHistoryController,
    updateModeBadge,
    imeKeyGuard,
    clearAutocomplete,
    clearSearchSuggestions,
    isSlashCommandInput,
    renderSuggestions,
    getDirectUrlSuggestion,
    renderPendingSuggestions,
    requestSuggestions,
    syncSuggestionActionModifiersFromEvent,
    dismissAutocompletePreviewOnNonTabKey,
    SUGGESTION_NAVIGATION,
    clearSiteSearch,
    clearLocalSearchScope,
    isImeCompositionEvent,
    SEARCH_INPUT_HISTORY,
    getNextSuggestionIndex,
    getAutoHighlightIndex,
    updateSelection,
    scrollSelectedSuggestionIntoView,
    submitSearchQuery,
    root,
    dismissSearchSuggestionsFromBackground,
    focusSearchInputPreservingScroll,
    finishNewtabEntryAnimation,
    handleGlobalTypingFocus,
    refreshFallbackShortcut,
    restoreDismissedSearchSuggestions,
    hideSearchInputCursorTooltip,
    onLanguageChange,
    openSearchModeMenuFromDoubleTab,
    bindSearchInputCursorTooltip,
    pageState
  });

  function openWordmarkUrl(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    openExternalNewTabUrl(COMMUNITY_LINKS.getStoreListing().url, event);
  }
  const shouldAnimateWordmarkEntry = !shouldSkipNewtabEntryMotion();
  pageState.topContentContainer = document.createElement('div');
  pageState.topContentController = NEWTAB_TOP_CONTENT.createTopContentController(
    pageState.topContentContainer,
    {
      onActivate(disposition) {
        openWordmarkUrl(disposition);
      },
      onEntryAnimationComplete(animationName) {
        if (!animationName || animationName === WORDMARK_ENTRY_ANIMATION_NAME) {
          finishWordmarkEntryAnimation();
        }
      }
    }
  );
  renderNewtabTopContent(shouldAnimateWordmarkEntry);
  applyNewtabTopContentVisibility();

  const {
    maybeShowFileAccessNotice,
    createNewtabEngagementNoticeController,
    getHelpCenterLocale,
    openCommunityQrDialog,
    helpCenterAskHintSettled,
    dismissHelpCenterAskHint,
    dismissWebdavFeatureHint
  } = NEWTAB_PAGE_NOTICES.createPageNotices({
    pageSearchParams,
    bottomDock,
    t,
    getRiSvg,
    FEATURE_HINTS,
    getOpenDisposition,
    getFeedbackWebLocale,
    isFeedbackPopoverOpen,
    LUMNO_FEEDBACK_LINKS_FALLBACK,
    openFeedbackExternalUrl,
    COMMUNITY_LINKS,
    getSystemLocale,
    normalizeLocale,
    newtabEntryAnimationReadyPromise,
    activateSiteSearch,
    root,
    getSiteSearchProviders,
    SEARCH_UTILS,
    pageState
  });

  const {
    SEARCH_CLEAR_BUTTON_INSET,
    updateInputRightPadding,
    applyNewtabActionButtonVisibility,
    loadNewtabActionButtonVisibility
  } = NEWTAB_SEARCH_BOX_CONTROLS.createSearchBoxControls({
    SEARCH_UTILS,
    dismissHelpCenterAskHint,
    rightIcon,
    formatMessage,
    onLanguageChange,
    bindSearchInputCursorTooltip,
    hideSearchInputCursorTooltip,
    dismissWebdavFeatureHint,
    EXTENSION_ROUTES,
    getExtensionResourceUrl,
    FEATURE_HINTS,
    helpCenterAskHintSettled,
    t,
    getRiSvg,
    getOpenDisposition,
    searchInput,
    closeFeedbackPopover,
    closeWallpaperPanel,
    storageArea,
    NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
    NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
    normalizeNewtabFeedbackButtonVisible,
    normalizeNewtabAppearanceButtonVisible,
    pageState
  });

  const {
    applyNewtabGlassStyle,
    applyNewtabGlassTheme,
    loadNewtabGlassStyle
  } = NEWTAB_GLASS_SURFACES.createGlassSurfaces({
    scheduleWallpaperAdaptiveToneUpdate,
    SETTINGS,
    syncBookmarkTopbarSurfaceAppearance,
    updateWallpaperAppearanceSelectionUi,
    applyScopedThemeMode,
    storageArea,
    NEWTAB_GLASS_STYLE_STORAGE_KEY,
    NEWTAB_GLASS_THEME_STORAGE_KEY,
    pageState
  });

  const {
    setSiteSearchTabHint,
    clearSiteSearchTabHint,
    updateSiteSearchPrefixLayout,
    setSiteSearchPrefix,
    clearSiteSearchPrefix
  } = NEWTAB_SEARCH_MODE_CONTROLLER.createSearchModeController({
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
    pageState
  });

  NEWTAB_PAGE_RESIZE.createPageResize({
    getBookmarkLimit,
    applyNewtabWidthMode,
    applyNewtabShortcutColumns,
    shouldAnimateNewtabLayoutShift,
    captureRecentCardLayout,
    applyRecentGridColumns,
    applyBookmarkGridColumns,
    updateSiteSearchPrefixLayout,
    keepBookmarkPageAnchorAfterLimitChange,
    renderCurrentBookmarkPage,
    updateBookmarkGridHeightLock,
    updateBookmarkSectionPosition,
    positionBookmarkCascadeLevels,
    updateSuggestionsFloatingLayout,
    cancelRecentResizeLayoutAnimations,
    renderRecentSites,
    animateRecentResizeLayout,
    scheduleNewtabReadyAfterViewportSettle,
    pageState
  });

  NEWTAB_PAGE_KEYBOARD.createPageKeyboard({
    handleSearchTabKey,
    dismissStack,
    finishShortcutDrag,
    finishBookmarkDrag,
    isEditableElement,
    performBookmarkMoveHistoryAction,
    syncSuggestionActionModifiersFromEvent,
    SUGGESTION_NAVIGATION,
    suggestionItems,
    numberShortcutOptions,
    setSuggestionActionModifiersActive,
    pageState
  });

  NEWTAB_SITE_SEARCH_RUNTIME.createSiteSearchRuntime({
    getSiteSearchProviders,
    getAggregateSearches,
    isAggregateSearchProvider,
    getSearchModeProviderId,
    getSearchModeProviders,
    isAggregateSearchDefinitionAvailable,
    createAggregateSearchScopeProvider,
    activateSiteSearch,
    activateLocalSearchScope,
    restoreSearchModeQuery,
    showSuggestionSnapshot,
    focusSearchInputPreservingScroll,
    requestSuggestions,
    storageChanges,
    SETTINGS,
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    AGGREGATE_SEARCH_STORE,
    setSiteSearchPrefix,
    defaultTheme,
    clearSiteSearch,
    storageArea,
    reloadSiteSearchProvidersFromStorage,
    pageState
  });

  NEWTAB_SEARCH_INPUT_COMPOSITION.createSearchInputComposition({
    directNavigationSettleController,
    imeKeyGuard,
    clearAutocomplete,
    clearSearchSuggestions,
    getDirectUrlSuggestion,
    renderPendingSuggestions,
    requestSuggestions,
    pageState
  });

  createWallpaperControls();
  createFeedbackControls();
  document.addEventListener('pointerdown', function(event) {
    if (!isFeedbackPopoverOpen()) {
      return;
    }
    const target = event && event.target ? event.target : null;
    if (pageState.feedbackControl && (target === pageState.feedbackControl || pageState.feedbackControl.contains(target))) {
      return;
    }
    closeFeedbackPopover();
  }, true);
  document.addEventListener('pointerdown', function(event) {
    if (!isWallpaperPanelOpen()) {
      return;
    }
    const target = event && event.target ? event.target : null;
    if (pageState.wallpaperRuntime && pageState.wallpaperRuntime.containsTarget(target)) {
      return;
    }
    closeWallpaperPanel();
  }, true);
  dismissStack.register('wallpaper-panel', {
    isOpen: isWallpaperPanelOpen,
    close: () => {
      // Escape dismisses an open filter menu before it closes the whole panel.
      if (pageState.wallpaperRuntime.closeOpenMenu()) {
        return;
      }
      closeWallpaperPanel({ restoreFocus: true });
    }
  });

  document.body.insertBefore(pageState.topContentContainer, root);
  pageState.searchLayer.appendChild(pageState.inputParts.container);
  root.appendChild(pageState.searchLayer);
  const newtabUpdateNoticeAnchor = root.nextSibling;
  if (pageState.shortcutSection) {
    document.body.insertBefore(pageState.shortcutSection, newtabUpdateNoticeAnchor);
  }
  if (pageState.updateNoticeController && pageState.updateNoticeController.element) {
    document.body.insertBefore(pageState.updateNoticeController.element, newtabUpdateNoticeAnchor);
    if (typeof pageState.updateNoticeController.recordExposure === 'function') {
      pageState.updateNoticeController.recordExposure();
    }
  }
  document.body.insertBefore(suggestionsSurface, newtabUpdateNoticeAnchor);
  document.body.insertBefore(suggestionsOutline, newtabUpdateNoticeAnchor);
  document.body.insertBefore(pageState.suggestionsContainer, newtabUpdateNoticeAnchor);
  // 等首轮语言解析完成后再创建，避免默认文案在新标签页首帧短暂闪现。
  Promise.all([
    initialLanguageReadyPromise,
    pageState.updateNoticeController && pageState.updateNoticeController.ready
      ? pageState.updateNoticeController.ready
      : Promise.resolve(false)
  ]).then(() => {
    if (pageState.engagementNoticeController) {
      return;
    }
    pageState.engagementNoticeController = createNewtabEngagementNoticeController();
    if (!pageState.engagementNoticeController || !pageState.engagementNoticeController.element) {
      return;
    }
    const engagementNoticeAnchor = suggestionsSurface.parentNode === document.body
      ? suggestionsSurface
      : newtabUpdateNoticeAnchor;
    document.body.insertBefore(pageState.engagementNoticeController.element, engagementNoticeAnchor);
    if (String(pageState.inputParts.input.value || '').trim() &&
        typeof pageState.engagementNoticeController.recordMeaningfulUse === 'function') {
      pageState.engagementNoticeController.recordMeaningfulUse();
    }
  });
  if (pageState.bookmarkTopbarRuntime) {
    pageState.bookmarkTopbarRuntime.mount(document.body);
  }
  bottomDockRuntime.mount(document.body);
  const initialQuoteReadyTask = pageState.quoteRuntime
    ? pageState.quoteRuntime.mount().catch(() => true)
    : Promise.resolve(true);
  if (pageState.wallpaperControl) {
    document.body.appendChild(pageState.wallpaperControl);
  }
  if (pageState.feedbackControl) {
    document.body.appendChild(pageState.feedbackControl);
  }
  if (pageState.shortcutDialogController) {
    pageState.shortcutDialogController.mount(document.body);
  }

  const {
    scheduleRecentReloadIfVisible,
    scheduleBookmarkReloadIfVisible
  } = NEWTAB_SECTION_RELOAD.createSectionReload({
    loadRecentSites,
    loadBookmarks,
    releaseStartupRecentSourceReads,
    markRecentDataDirty,
    bookmarksRuntime,
    refreshShortcutFolderReferences,
    scheduleFolderColorSync,
    markBookmarkTreeDirty,
    bookmarkMoveHistory,
    refreshOpenBookmarkCascadeMenu,
    pageState
  });

  window.addEventListener('blur', () => {
    finishShortcutDrag(null, { cancel: true });
    finishBookmarkDrag(null, { canceled: true });
  });
  window.addEventListener('visibilitychange', handleRecentVisibilityChange);
  window.addEventListener('resize', scheduleWallpaperAdaptiveToneUpdate, { passive: true });
  // An open folder menu follows its anchor once per frame while the page
  // scrolls; scroll events run before that frame's animation callbacks, so
  // the menu never trails the page.
  let bookmarkCascadeScrollFrame = 0;
  window.addEventListener('scroll', () => {
    scheduleWallpaperAdaptiveToneUpdate();
    if (bookmarkCascadeScrollFrame || !pageState.bookmarkCascadeRuntime || !pageState.bookmarkCascadeRuntime.isOpen()) {
      return;
    }
    bookmarkCascadeScrollFrame = window.requestAnimationFrame(() => {
      bookmarkCascadeScrollFrame = 0;
      positionBookmarkCascadeLevels();
    });
  }, { passive: true });
  bottomDockRuntime.onScroll(scheduleWallpaperAdaptiveToneUpdate, { passive: true });
  const actionButtonVisibilityReadyPromise = loadNewtabActionButtonVisibility();
  const glassStyleReadyPromise = loadNewtabGlassStyle();
  const shortcutPreferencesReadyPromise = loadNewtabShortcutPreferences();
  const shortcutsReadyPromise = shortcutPreferencesReadyPromise.then(loadVisibleShortcuts);
  const initialShortcutsReadyTask = shortcutsReadyPromise.catch((error) => {
    console.warn('[Lumno] Deferred shortcut loading failed.', error);
    return [];
  });
  const sectionPolicyReadyPromise = Promise.all([
    loadSearchBlacklistItems(),
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled()
  ]);
  const initialLanguageReadyTask = bootstrapInitialLanguageMode();
  const initialMotionPreferenceReadyTask = globalThis.LumnoMotionPreferenceReady;
  const initialLayoutStorageReadyTask = startupStorageReadBatch
    ? startupStorageReadBatch.ready
    : Promise.resolve(true);
  const initialFontsReadyTask = document.fonts && document.fonts.ready &&
    typeof document.fonts.ready.then === 'function'
      ? document.fonts.ready.catch(() => true)
      : Promise.resolve(true);
  const initialVisualReadyPromise = Promise.all([
    initialAppearanceReadyTask,
    initialBookmarkViewModeReadyPromise,
    loadZenMode(),
    actionButtonVisibilityReadyPromise,
    glassStyleReadyPromise,
    initialMotionPreferenceReadyTask,
    initialLanguageReadyTask,
    sectionPolicyReadyPromise,
    initialShortcutsReadyTask,
    pageState.initialPinnedRecentSitesReadyTask,
    pageState.initialHiddenRecentSitesReadyTask,
    initialLayoutStorageReadyTask,
    initialFontsReadyTask,
    initialTimeFontReadyTask,
    initialQuoteReadyTask
  ]).catch((error) => {
    console.warn('[Lumno] Initial new tab layout setup failed.', error);
  }).then(() => {
    // Run one authoritative data pass after every layout-affecting preference
    // has settled. This keeps cached/default geometry from becoming visible and
    // then moving the entire entry when bookmarks or history arrive.
    pageState.sectionDataRevision += 1;
    const initialSectionDataRevision = pageState.sectionDataRevision;
    const recentSitesReadyTask = loadRecentSites({
      force: true,
      sectionDataRevision: initialSectionDataRevision
    });
    const bookmarksReadyTask = loadBookmarks({
      force: true,
      sectionDataRevision: initialSectionDataRevision
    });
    recentSitesReadyTask.then(releaseStartupRecentSourceReads, releaseStartupRecentSourceReads);
    return Promise.all([recentSitesReadyTask, bookmarksReadyTask]);
  }).catch((error) => {
    console.warn('[Lumno] Initial new tab content setup failed.', error);
  }).then(() => {
    // The wallpaper leads: content enters once its tones are on the controls.
    return waitForInitialWallpaperTone();
  }).then(() => {
    maybeShowFileAccessNotice();
    markNewtabReady();
  });
  updateBookmarkSectionPosition();

})();
