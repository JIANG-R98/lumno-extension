(function() {
  const root = document.getElementById('_x_extension_newtab_root_2024_unique_');
  const createSearchInput = window._x_extension_createSearchInput_2024_unique_;
  if (!root || typeof createSearchInput !== 'function') {
    return;
  }
  if (document.body) {
    document.body.removeAttribute('data-nt-ready');
  }
  const newtabStartupProfiler = globalThis.__lumnoCodexDebugStartupProfilerV1 || null;
  function markNewtabStartupMilestone(name) {
    if (newtabStartupProfiler &&
        typeof newtabStartupProfiler.markMilestone === 'function') {
      newtabStartupProfiler.markMilestone(name);
    }
  }
  function observeNewtabStartupTask(name, task) {
    if (newtabStartupProfiler &&
        typeof newtabStartupProfiler.observeTask === 'function') {
      newtabStartupProfiler.observeTask(name, task);
    }
    return task;
  }
  markNewtabStartupMilestone('script-start');

  const settingsRuntimeApi = globalThis.LumnoSettings;
  const providerStorageRuntime = settingsRuntimeApi.createProviderStorageRuntime(chrome);
  const rawStorageArea = providerStorageRuntime
    ? providerStorageRuntime.area
    : ((chrome && chrome.storage && chrome.storage.sync)
        ? chrome.storage.sync
        : (chrome && chrome.storage ? chrome.storage.local : null));
  const startupStorageReadBatch = rawStorageArea
    ? settingsRuntimeApi.createStorageReadBatch(rawStorageArea)
    : null;
  const storageArea = startupStorageReadBatch
    ? startupStorageReadBatch.area
    : rawStorageArea;
  if (startupStorageReadBatch) {
    startupStorageReadBatch.ready.then((metrics) => {
      if (!document.documentElement) {
        return;
      }
      document.documentElement.setAttribute(
        'data-lumno-newtab-bootstrap-storage-reads',
        String(Number(metrics && metrics.underlyingReadCount) || 0)
      );
      document.documentElement.setAttribute(
        'data-lumno-newtab-bootstrap-storage-requests',
        String(Number(metrics && metrics.requestCount) || 0)
      );
      document.documentElement.setAttribute(
        'data-lumno-newtab-bootstrap-storage-keys',
        metrics && metrics.keyCount === null
          ? 'all'
          : String(Number(metrics && metrics.keyCount) || 0)
      );
    });
  }
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
  function addStorageChangeListener(listener) {
    return SETTINGS.addStorageChangeListener(chrome, listener);
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
  function getNewtabVisualViewportInsets() {
    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return { top: 0, bottom: 0 };
    }
    const top = Number.isFinite(Number(visualViewport.offsetTop))
      ? Math.max(0, Number(visualViewport.offsetTop))
      : 0;
    const viewportHeight = Number.isFinite(Number(visualViewport.height))
      ? Math.max(0, Number(visualViewport.height))
      : Math.max(0, Number(window.innerHeight) || 0);
    const layoutHeight = Math.max(0, Number(window.innerHeight) || viewportHeight);
    const bottom = Math.max(0, layoutHeight - top - viewportHeight);
    return { top, bottom };
  }
  function syncNewtabVisualViewportInsets() {
    if (!document.documentElement || !document.documentElement.style) {
      return;
    }
    const insets = getNewtabVisualViewportInsets();
    document.documentElement.style.setProperty(
      '--x-nt-visual-viewport-top-inset',
      `${Math.round(insets.top)}px`
    );
    document.documentElement.style.setProperty(
      '--x-nt-visual-viewport-bottom-inset',
      `${Math.round(insets.bottom)}px`
    );
  }
  syncNewtabVisualViewportInsets();
  window.addEventListener('resize', syncNewtabVisualViewportInsets, { passive: true });
  if (window.visualViewport &&
      typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener(
      'resize',
      syncNewtabVisualViewportInsets,
      { passive: true }
    );
    window.visualViewport.addEventListener(
      'scroll',
      syncNewtabVisualViewportInsets,
      { passive: true }
    );
  }

  const SETTINGS = settingsRuntimeApi;
  const BROWSER_PROFILE = globalThis.LumnoBrowserProfile;
  const SHORTCUT_KEY_MATCHER = globalThis.LumnoShortcutKeyMatcher;
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
  const NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY =
    SETTINGS.NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY ||
    '_x_extension_newtab_time_seconds_visible_2026_unique_';
  const NEWTAB_ZEN_MODE_STORAGE_KEY = '_x_extension_newtab_zen_mode_2026_unique_';
  const NEWTAB_THEME_MODE_STORAGE_KEY = '_x_extension_newtab_theme_mode_2026_unique_';
  const NEWTAB_THEME_SCOPE_STORAGE_KEY = '_x_extension_newtab_theme_scope_2026_unique_';
  const NEWTAB_WALLPAPER_STORAGE_KEY = '_x_extension_newtab_wallpaper_2026_unique_';
  const NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY = '_x_extension_newtab_local_wallpaper_2026_unique_';
  const NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY = '_x_extension_newtab_wallpaper_overlay_2026_unique_';
  const NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY = '_x_extension_newtab_wallpaper_effect_2026_unique_';
  const NEWTAB_FAVICON_STORAGE_KEY = '_x_extension_newtab_favicon_2026_unique_';
  const LUMNO_CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/lumno-%E8%81%9A%E7%84%A6%E6%90%9C%E7%B4%A2%E6%96%B0%E6%A0%87%E7%AD%BE%E9%A1%B5/nggfkkbmogmadfoikakkfegkoilfcfao?utm_source=item-share-cb';
  const LUMNO_FEEDBACK_QR_REFRESH_TIMEOUT_MS = 5000;
  const BOOKMARK_COUNT_STORAGE_KEY = '_x_extension_bookmark_count_2024_unique_';
  const BOOKMARK_COLUMNS_STORAGE_KEY = '_x_extension_bookmark_columns_2024_unique_';
  const BOOKMARK_VIEW_MODE_STORAGE_KEY = '_x_extension_bookmark_view_mode_2026_unique_';
  const BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY =
    '_x_extension_bookmark_topbar_surface_color_2026_unique_';
  const BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY =
    '_x_extension_bookmark_topbar_surface_color_light_2026_unique_';
  const BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY =
    '_x_extension_bookmark_topbar_surface_color_dark_2026_unique_';
  const BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY =
    '_x_extension_bookmark_topbar_surface_mode_2026_unique_';
  const BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY = '_x_extension_bookmark_folder_icons_visible_2026_unique_';
  const BOOKMARK_CASCADE_DEBUG_STORAGE_KEY = '_x_extension_bookmark_cascade_debug_2026_unique_';
  const BOOKMARK_TOPBAR_PICK_COLOR_ACTION = 'pick-bookmark-topbar-color';
  const BOOKMARK_TOPBAR_RESET_COLOR_ACTION = 'reset-bookmark-topbar-color';
  const BOOKMARK_TOPBAR_SURFACE_MODE_ACTION = 'set-bookmark-topbar-surface-mode';
  const NEWTAB_FLOATING_TOP_GAP_PX = 12;
  const BOOKMARK_CASCADE_TOPBAR_GAP_PX = 4;
  // Flip this to true when inspecting bookmark cascade hover intent and safe-triangle timing.
  const BOOKMARK_CASCADE_DEBUG_UI_ENABLED = false;
  const DEFAULT_SEARCH_ENGINE_STORAGE_KEY = '_x_extension_default_search_engine_2024_unique_';
  const SEARCH_RESULT_PRIORITY_STORAGE_KEY = '_x_extension_search_result_priority_2026_unique_';
  const OVERLAY_TAB_PRIORITY_STORAGE_KEY = '_x_extension_overlay_tab_priority_2024_unique_';
  const SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY = '_x_extension_search_result_source_types_2026_unique_';
  const SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY = SETTINGS.SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY ||
    '_x_extension_search_result_display_limit_2026_unique_';
  const SEARCH_BLACKLIST_STORAGE_KEY = '_x_extension_search_blacklist_2026_unique_';
  const FAVICON_REQUEST_BLACKLIST_STORAGE_KEY = '_x_extension_favicon_request_blacklist_2026_unique_';
  const FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY = '_x_extension_favicon_enhanced_fetch_enabled_2026_unique_';
  const BLACKLIST_UTILS = globalThis.LumnoBlacklistUtils;
  const EXTENSION_ROUTES = globalThis.LumnoExtensionRoutes;
  const NAVIGATION_DISPOSITION = globalThis.LumnoNavigationDisposition;
  const SEARCH_UTILS = globalThis.LumnoSearchUtils;
  const AGGREGATE_SEARCH_STORE = globalThis.LumnoAggregateSearchStore;
  const AGGREGATE_SEARCH_SURFACE = globalThis.LumnoAggregateSearchSurface;
  const SITE_DISPLAY_NAME = globalThis.LumnoSiteDisplayName;
  const SITE_SEARCH_STORE = globalThis.LumnoSiteSearchStore;
  const SUGGESTION_ACTION_MODEL = globalThis.LumnoSuggestionActionModel;
  const SUGGESTION_NAVIGATION = globalThis.LumnoSuggestionNavigation;
  const SEARCH_INPUT_HISTORY = globalThis.LumnoSearchInputHistory;
  const SEARCH_INPUT_MODE = globalThis.LumnoSearchInputMode;
  const FEATURE_HINTS = globalThis.LumnoFeatureHints;
  const UPDATE_NOTICE = globalThis.LumnoUpdateNotice;
  const ENGAGEMENT_NOTICE = globalThis.LumnoEngagementNotice;
  const COMMUNITY_LINKS = globalThis.LumnoCommunityLinks;
  const LUMNO_FEEDBACK_LINKS_FALLBACK = COMMUNITY_LINKS.FALLBACK_LINKS;
  const FAVICON_UTILS = globalThis.LumnoFaviconUtils;
  const NEWTAB_FAVICON_CACHE = globalThis.LumnoFaviconCache;
  const SHORTCUT_FAVICON = globalThis.LumnoShortcutFavicon;
  const NEWTAB_FAVICON_THEME = globalThis.LumnoNewtabFaviconTheme;
  const NEWTAB_FAVICON_VIEW = globalThis.LumnoNewtabFaviconView;
  const NEWTAB_RECENT_STORE = globalThis.LumnoNewtabRecentSitesStore;
  const NEWTAB_BOOKMARKS_STORE = globalThis.LumnoNewtabBookmarksStore;
  const NEWTAB_BOOKMARKS_RUNTIME = globalThis.LumnoNewtabBookmarksRuntime;
  const NEWTAB_BOOKMARKS_TOPBAR = globalThis.LumnoNewtabBookmarksTopbar;
  const BOOKMARK_TOPBAR_HEIGHT_PX = Math.max(
    0,
    Number(NEWTAB_BOOKMARKS_TOPBAR.HEIGHT_PX) || 36
  );
  const NEWTAB_BOOKMARK_MOVE_HISTORY = globalThis.LumnoNewtabBookmarkMoveHistory;
  const NEWTAB_BOOKMARK_DRAG = globalThis.LumnoNewtabBookmarkDrag;
  const NEWTAB_CROSS_SURFACE_DRAG = globalThis.LumnoNewtabCrossSurfaceDrag;
  const NEWTAB_BOOKMARK_FOLDER_ICON = globalThis.LumnoNewtabBookmarkFolderIcon;
  const NEWTAB_PAGE_NOTICE = globalThis.LumnoNewtabPageNotice;
  const NEWTAB_TOAST = globalThis.LumnoNewtabToast;
  const NEWTAB_LAYOUT = globalThis.LumnoNewtabLayout;
  const NEWTAB_DOCK = globalThis.LumnoNewtabDock;
  const NEWTAB_DIRECT_NAVIGATION_SETTLE = globalThis.LumnoNewtabDirectNavigationSettle;
  const NEWTAB_BACKGROUND_SEARCH_FOCUS = globalThis.LumnoNewtabBackgroundSearchFocus;
  const NEWTAB_RECENT_VIEW = globalThis.LumnoNewtabRecentSitesView;
  const NEWTAB_BOOKMARKS_VIEW = globalThis.LumnoNewtabBookmarksView;
  const NEWTAB_BOOKMARK_CASCADE_POSITION = globalThis.LumnoNewtabBookmarkCascadePosition;
  const NEWTAB_BOOKMARK_CASCADE_MENU = globalThis.LumnoNewtabBookmarkCascadeMenu;
  const NEWTAB_SUGGESTIONS_VIEW = globalThis.LumnoNewtabSuggestionsView;
  const NEWTAB_SHORTCUTS_STORE = globalThis.LumnoNewtabShortcutsStore;
  const FOLDER_REFERENCES = globalThis.LumnoBookmarkFolderReference;
  const NEWTAB_SHORTCUT_ICON_STORE = globalThis.LumnoNewtabShortcutIconStore;
  const NEWTAB_SHORTCUT_DIALOG = globalThis.LumnoNewtabShortcutDialog;
  const NEWTAB_SHORTCUTS_VIEW = globalThis.LumnoNewtabShortcutsView;
  const NEWTAB_WALLPAPER = globalThis.LumnoNewtabWallpaper;
  const NEWTAB_WALLPAPER_VIEW = globalThis.LumnoNewtabWallpaperView;
  const NEWTAB_FEEDBACK_CONTROL = globalThis.LumnoNewtabFeedbackControl;
  const NEWTAB_SELECT_MENU = globalThis.LumnoNewtabSelectMenu;
  const NEWTAB_TOP_CONTENT = globalThis.LumnoNewtabTopContent;
  const NEWTAB_PAGE_STRUCTURE = globalThis.LumnoNewtabPageStructure;
  const NEWTAB_BOOKMARK_CASCADE_VIEW =
    globalThis.LumnoNewtabBookmarkCascadeView;
  const NEWTAB_BOOKMARK_BREADCRUMB =
    globalThis.LumnoNewtabBookmarkBreadcrumb;
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
  const shortcutFolderRuntime = FOLDER_REFERENCES.createRuntime({ chrome });
  shortcutFolderRuntime.ready.catch((error) => {
    console.warn('[Lumno] Could not load shortcut folder bindings.', error);
  });
  const TAB_RANK_SCORE_DEBUG_STORAGE_KEY = '_x_extension_tab_rank_score_debug_2026_unique_';
  const NEWTAB_OPEN_TAB_SUGGESTION_LIMIT = 8;
  const FAVICON_CACHE_BOOT_WAIT_MS = 120;
  const RESTORE_SEARCH_LAYOUT_LOCK_MS = 900;
  const PINNED_RECENT_SITES_STORAGE_KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';
  const HIDDEN_RECENT_SITES_STORAGE_KEY = '_x_extension_newtab_hidden_recent_sites_2026_unique_';
  const NEWTAB_SHORTCUTS_STORAGE_KEY = '_x_extension_newtab_shortcuts_2026_unique_';
  const NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY =
    '_x_extension_newtab_shortcuts_local_overflow_2026_unique_';
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
    : 80;
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
  const MAX_NEWTAB_SHORTCUTS = 60;
  const NEWTAB_SHORTCUTS_CRITICAL_SYNC_RESERVE_BYTES = 64 * 1024;
  const NEWTAB_SHORTCUTS_STORAGE_KEYS = NEWTAB_SHORTCUTS_STORE.getShortcutStorageKeys({
    key: NEWTAB_SHORTCUTS_STORAGE_KEY,
    maxShortcuts: MAX_NEWTAB_SHORTCUTS
  });
  const SHORTCUT_DRAG_START_THRESHOLD_PX = 10;
  const SHORTCUT_REORDER_ANIMATION_MS = 180;
  const SHORTCUT_DROP_ANIMATION_MS = 210;
  const SHORTCUT_REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const BOOKMARK_DRAG_START_THRESHOLD_PX = 10;
  const BOOKMARK_REORDER_ANIMATION_MS = 180;
  const BOOKMARK_DROP_ANIMATION_MS = 210;
  const BOOKMARK_REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const BOOKMARK_DRAG_CLICK_SUPPRESS_MS = 420;
  const BOOKMARK_DRAG_PAGE_SWITCH_DELAY_MS = 640;
  const BOOKMARK_DRAG_FOLDER_SWITCH_DELAY_MS = 640;
  const NEWTAB_EXTERNAL_CHANGE_DEBOUNCE_MS = 120;
  const NEWTAB_RESIZE_DENSITY_SETTLE_MS = 140;
  const NEWTAB_INITIAL_VIEWPORT_SETTLE_MS = 32;
  const NEWTAB_ENTRY_ANIMATION_TOTAL_MS = 460;
  const pageSearchParams = new URLSearchParams(window.location.search || '');
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  let mediaListenerAttached = false;
  let globalThemeMode = 'system';
  let newtabThemeMode = 'global';
  let newtabThemeScope = 'global';
  let currentThemeMode = 'system';
  let initialThemeApplied = false;
  let hasThemeBootstrapStarted = false;
  let resolveInitialThemeReady = null;
  const initialThemeReadyPromise = new Promise((resolve) => {
    resolveInitialThemeReady = resolve;
  });
  let initialLanguageApplied = false;
  let hasLanguageBootstrapStarted = false;
  let languageApplyRequestId = 0;
  let resolveInitialLanguageReady = null;
  const initialLanguageReadyPromise = new Promise((resolve) => {
    resolveInitialLanguageReady = resolve;
  });
  let resolveInitialBookmarkViewModeReady = null;
  const initialBookmarkViewModeReadyPromise = new Promise((resolve) => {
    resolveInitialBookmarkViewModeReady = resolve;
    if (!storageArea) {
      resolve();
    }
  });
  let modeBadge = null;
  let siteSearchTabHint = null;
  let inputModeController = null;
  let inputParts = null;
  const recentCards = [];
  const bookmarkCards = [];
  const bookmarkCardElementCache = new Map();
  const suggestionItems = [];
  let selectedIndex = -1;
  let currentSuggestions = [];
  let lastSuggestionResponse = [];
  let latestQuery = '';
  let latestRawQuery = '';
  let siteSearchTriggerState = null;
  let localSearchScopeTriggerState = null;
  let lastRenderedQuery = '';
  let lastRenderedActionContextKey = '';
  let suggestionsView = null;
  let recentSourceItems = [];
  let pinnedRecentSites = [];
  let hiddenRecentSites = [];
  let initialPinnedRecentSitesReadyTask = Promise.resolve([]);
  let initialHiddenRecentSitesReadyTask = Promise.resolve([]);
  let searchBlacklistItems = [];
  let currentMessages = null;
  let currentLanguageMode = 'system';
  let currentResolvedLocale = null;
  let defaultPlaceholderText = 'Search or enter URL...';
  let toastElement = null;
  let toastController = null;
  let layoutController = null;
  let faviconViewRuntime = null;
  let searchEntryRestoreLayoutLockUntil = 0;
  let newtabResizeLayoutLocked = false;
  let newtabReadyRequested = false;
  let newtabReadySettleTimer = 0;
  let newtabReadyViewportRevision = 0;
  let newtabEntryAnimationTimer = 0;
  let resolveNewtabEntryAnimationReady = null;
  const newtabEntryAnimationReadyPromise = new Promise((resolve) => {
    resolveNewtabEntryAnimationReady = resolve;
  });
  let searchEntryLastVisibleViewportWidth = Math.max(0, window.innerWidth || 0);
  let searchEntryLastVisibleViewportHeight = Math.max(0, window.innerHeight || 0);
  let currentRecentMode = 'most';
  let currentRecentCount = 4;
  let currentBookmarkCount = 8;
  let currentBookmarkColumns = 6;
  let currentBookmarkViewMode = 'folder';
  let bookmarkViewModeRevision = 0;
  let bookmarkTopbarSurfaceMode = 'adaptive';
  let bookmarkTopbarSurfaceModeRevision = 0;
  let currentBookmarkTopbarSurfaceColor = '';
  const bookmarkTopbarSurfaceColors = {
    light: '',
    dark: ''
  };
  const bookmarkTopbarSurfaceColorRevisions = {
    light: 0,
    dark: 0
  };
  let bookmarkFolderIconsVisible = true;
  let tabRankScoreDebugEnabled = false;
  let searchLayer = null;
  let topContentContainer = null;
  let topContentController = null;
  let wordmarkImageEl = null;
  let wordmarkSolidEl = null;
  const topContentLayoutAnimations = new Set();
  const recentResizeLayoutAnimations = new Set();
  let wordmarkEntryTransitionTimer = 0;
  let wallpaperControl = null;
  let wallpaperRuntime = null;
  let quoteRuntime = null;
  let feedbackControl = null;
  let feedbackReactController = null;
  let feedbackButton = null;
  let feedbackRefreshResultTooltipTimer = 0;
  let feedbackLinks = LUMNO_FEEDBACK_LINKS_FALLBACK;
  let feedbackLinksLoaded = false;
  let updateNoticeController = null;
  let engagementNoticeController = null;
  let pageNoticeController = null;
  let newtabTopContentMode = 'brand';
  let newtabTimeFontWeight = NEWTAB_TIME_FONT_WEIGHT_DEFAULT;
  let newtabTimeSecondsVisible = false;
  let newtabInputAutoFocusEnabled = false;
  let newtabFeedbackButtonVisible = true;
  let newtabAppearanceButtonVisible = true;
  let numberShortcutInstantEnabled = false;
  let macosCtrlSuggestionNavigationEnabled = false;
  let simpleModeEnabled = false;
  let zenModeEnabled = false;
  let bookmarkCurrentPage = 0;
  let bookmarkAllItems = [];
  let bookmarkCurrentFolderId = '1';
  let bookmarkRootFolderId = '1';
  let bookmarkFolderPath = [];
  let bookmarkRootTotalCount = 0;
  let bookmarkRootVisibleCount = 0;
  let bookmarkTitleWrap = null;
  let bookmarkHeading = null;
  let bookmarkModeMenu = null;
  let bookmarkGrid = null;
  let bookmarkCascadeRuntime = null;
  let bookmarkTopbarRuntime = null;
  let recentHeader = null;
  let recentHeading = null;
  let recentModeMenu = null;
  let recentGrid = null;
  let bookmarkBreadcrumb = null;
  let bookmarkBreadcrumbController = null;
  let bookmarkPagerPrevButton = null;
  let bookmarkPagerNextButton = null;
  let bookmarkOpenManagerButton = null;
  let bookmarkPageAnimating = false;
  let bookmarkDragState = null;
  const bookmarkMoveHistory = NEWTAB_BOOKMARK_MOVE_HISTORY.createBookmarkMoveHistory({ maxEntries: 30 });
  let bookmarkMoveHistoryBusy = false;
  let bookmarkContextMenu = null;
  let bookmarkContextMenuTarget = null;
  let recentContextMenu = null;
  let recentContextMenuTarget = null;
  let bookmarkPendingLayoutAnimation = null;
  let bookmarkWheelLastAt = 0;
  let recentMouseInsideSection = false;
  let recentMouseLeftAt = 0;
  let recentSitesView = null;
  let bookmarksView = null;
  let shortcutsView = null;
  let shortcutSection = null;
  let shortcutGrid = null;
  let addShortcutButton = null;
  let shortcutDialogController = null;
  let shortcutDialogLoadPromise = null;
  let shortcutDialogOpenRevision = 0;
  let shortcutContextMenu = null;
  let shortcutContextMenuTarget = null;
  let newtabShortcuts = [];
  let newtabShortcutIcons = {};
  let newtabShortcutFavicons = {};
  let newtabShortcutsVisible = true;
  let newtabShortcutAddVisible = true;
  let newtabShortcutDockMagnificationEnabled = true;
  let newtabShortcutColumns = NEWTAB_SHORTCUT_COLUMNS_DEFAULT;
  let newtabShortcutSize = NEWTAB_SHORTCUT_SIZE_DEFAULT;
  let newtabShortcutGap = NEWTAB_SHORTCUT_GAP_DEFAULT;
  let shortcutStorageReloadTimer = null;
  let shortcutPersistenceInFlightCount = 0;
  let shortcutDockPointerFrame = 0;
  let shortcutDockPendingTile = null;
  let shortcutDockPendingPointerX = Number.NaN;
  let shortcutDragState = null;
  const shortcutTiles = [];
  const SHORTCUT_DIALOG_MODE_EDIT = NEWTAB_SHORTCUT_DIALOG.MODE_EDIT || 'edit';
  const SHORTCUT_DIALOG_ITEM_BOOKMARK = 'bookmark';
  const SHORTCUT_DIALOG_ITEM_FOLDER = 'folder';
  const NEWTAB_CONTEXT_MENU_OPEN_VALUE = 'open-in-new-tab';
  const SHORTCUT_CONTEXT_MENU_EDIT_VALUE = 'edit';
  const SHORTCUT_CONTEXT_MENU_REMOVE_VALUE = 'remove';
  const SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE = 'hide-add';
  const FOLDER_COLOR_CONTEXT_MENU_VALUE = 'folder-color';
  const folderColorApi = globalThis.LumnoNewtabFolderColorPicker;
  const FOLDER_COLORS_STORAGE_KEY = folderColorApi.FOLDER_COLORS_STORAGE_KEY;
  const FOLDER_COLOR_PRESETS_STORAGE_KEY = '_x_extension_bookmark_folder_color_presets_2026_unique_';
  let folderColors = {};

  const defaultSiteSearchProviders = SEARCH_UTILS.getDefaultSiteSearchProviders();
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

  const NEWTAB_SITE_THEME_RESOLVER = globalThis.LumnoNewtabSiteThemeResolver;
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
    applyRecentCardTheme,
    bookmarkCards,
    applyBookmarkCardTheme,
    shortcutTiles,
    applyShortcutTileTheme,
    suggestionItems,
    setSiteSearchPrefix,
    updateSelection,
    setPersistedSiteThemeEntry,
    getPersistedSiteThemeEntry,
    getPageFaviconUrlResolver,
    getBrandAccentForUrl,
    extractAverageColor,
    getProviderIcon,
    isHostFaviconVisitDirty,
    stableHashCode,
    getThemeSourceForSuggestion,
    areFaviconRenderCachesReady,
    pageState: {
      get siteSearchState() {
        return siteSearchState;
      },
      get faviconDataCache() {
        return faviconDataCache;
      },
      get requestFaviconData() {
        return requestFaviconData;
      },
      get faviconCacheRuntime() {
        return faviconCacheRuntime;
      }
    }
  });

  const NEWTAB_URL_POLICY = globalThis.LumnoNewtabUrlPolicy;
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
    getPageFaviconUrlResolver,
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
    pageState: {
      get searchBlacklistItems() {
        return searchBlacklistItems;
      },
      set searchBlacklistItems(value) {
        searchBlacklistItems = value;
      },
      get faviconRequestBlacklistItems() {
        return faviconRequestBlacklistItems;
      },
      set faviconRequestBlacklistItems(value) {
        faviconRequestBlacklistItems = value;
      },
      get faviconEnhancedFetchEnabled() {
        return faviconEnhancedFetchEnabled;
      },
      set faviconEnhancedFetchEnabled(value) {
        faviconEnhancedFetchEnabled = value;
      },
      get searchResultDisplayLimit() {
        return searchResultDisplayLimit;
      }
    }
  });

  const NEWTAB_RECENT_SITES_CONTROLLER = globalThis.LumnoNewtabRecentSitesController;
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
    updateRecentPinButton
  } = NEWTAB_RECENT_SITES_CONTROLLER.createRecentSitesController({
    NEWTAB_CONTEXT_MENU_OPEN_VALUE,
    t,
    showToast,
    openExternalNewTabUrl,
    closeShortcutContextMenu,
    closeBookmarkContextMenu,
    canDismissRecentCard,
    hideCursorTooltip,
    hideTopActionTooltip,
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
    renderRecentSites,
    PINNED_RECENT_SITES_STORAGE_KEY,
    pageState: {
      get recentContextMenu() {
        return recentContextMenu;
      },
      set recentContextMenu(value) {
        recentContextMenu = value;
      },
      get recentContextMenuSelectController() {
        return recentContextMenuSelectController;
      },
      get recentContextMenuTarget() {
        return recentContextMenuTarget;
      },
      set recentContextMenuTarget(value) {
        recentContextMenuTarget = value;
      },
      get hiddenRecentSites() {
        return hiddenRecentSites;
      },
      set hiddenRecentSites(value) {
        hiddenRecentSites = value;
      },
      get pinnedRecentSites() {
        return pinnedRecentSites;
      },
      set pinnedRecentSites(value) {
        pinnedRecentSites = value;
      },
      get recentRenderSignature() {
        return recentRenderSignature;
      },
      set recentRenderSignature(value) {
        recentRenderSignature = value;
      },
      get recentSourceItems() {
        return recentSourceItems;
      }
    }
  });

  let folderColorPreview = null;
  let folderColorPicker = null;

  function getFolderColor(folderId) {
    return folderColorPreview && folderColorPreview.folderId === String(folderId)
      ? folderColorPreview.color
      : folderColors[String(folderId)] || folderColorApi.DEFAULT_FOLDER_COLOR;
  }

  function applySavedFolderColor(icon) {
    if (!icon) return;
    const svg = icon.querySelector('svg[data-folder-color-id]');
    const folderId = svg && svg.getAttribute('data-folder-color-id');
    if (folderId) NEWTAB_BOOKMARK_FOLDER_ICON.applyFolderColor(icon, getFolderColor(folderId));
  }

  function refreshFolderColors() {
    document.querySelectorAll('svg[data-folder-color-id]').forEach((svg) => {
      applySavedFolderColor(svg.parentElement);
    });
  }

  function readFolderColors() {
    return new Promise((resolve, reject) => {
      if (!localStorageArea) { resolve({}); return; }
      localStorageArea.get(FOLDER_COLORS_STORAGE_KEY, (data) => {
        const error = chrome.runtime && chrome.runtime.lastError;
        if (error) { reject(new Error(error.message)); return; }
        resolve(folderColorApi.normalizeFolderColorMap(data && data[FOLDER_COLORS_STORAGE_KEY]));
      });
    });
  }

  function loadFolderColors() {
    return readFolderColors().then((colors) => {
      folderColors = colors;
      refreshFolderColors();
    }).catch(() => {});
  }

  async function saveFolderColor(folderId, color) {
    const next = await readFolderColors();
    if (color) next[folderId] = color;
    else delete next[folderId];
    await new Promise((resolve, reject) => {
      if (!localStorageArea) { reject(new Error('Storage unavailable')); return; }
      localStorageArea.set({ [FOLDER_COLORS_STORAGE_KEY]: next }, () => {
        const error = chrome.runtime && chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
    folderColors = next;
  }

  async function openFolderColorPicker(folderId, title, sourceElement) {
    closeBookmarkCascadeMenu();
    closeShortcutDialog();
    hideCursorTooltip();
    if (!folderColorPicker) {
      try {
        folderColorPicker = await folderColorApi.createFolderColorPicker({
          documentObj: document, t,
          getFolderSvg: getFigmaFolderSvg,
          initFolderIcon: NEWTAB_BOOKMARK_FOLDER_ICON.initFolderPathMorph,
          animateFolderIcon: playFolderPathMorph,
          applyFolderColor: NEWTAB_BOOKMARK_FOLDER_ICON.applyFolderColor,
          bindTooltip: bindShortcutDialogTooltip,
          hideTooltip: hideShortcutDialogTooltip,
          readSavedColors: () => new Promise((resolve, reject) => {
            if (!localStorageArea) { reject(new Error('Storage unavailable')); return; }
            localStorageArea.get(FOLDER_COLOR_PRESETS_STORAGE_KEY, (data) => {
              const error = chrome.runtime && chrome.runtime.lastError;
              if (error) { reject(new Error(error.message)); return; }
              resolve(data && data[FOLDER_COLOR_PRESETS_STORAGE_KEY]);
            });
          }),
          saveSavedColors: (colors) => new Promise((resolve, reject) => {
            if (!localStorageArea) { reject(new Error('Storage unavailable')); return; }
            localStorageArea.set({ [FOLDER_COLOR_PRESETS_STORAGE_KEY]: colors }, () => {
              const error = chrome.runtime && chrome.runtime.lastError;
              if (error) reject(new Error(error.message));
              else resolve();
            });
          }),
          onPreview: (id, color) => {
            folderColorPreview = { folderId: id, color };
            refreshFolderColors();
          },
          onSubmit: saveFolderColor,
          onClose: () => { folderColorPreview = null; refreshFolderColors(); }
        });
      } catch {
        showToast(t('folder_color_save_failed', 'Could not save the folder color. Try again.'), true);
        return;
      }
    }
    folderColorPicker.open({ folderId: String(folderId), title, color: getFolderColor(folderId), sourceElement });
  }
  const shortcutIconStore = NEWTAB_SHORTCUT_ICON_STORE.createShortcutIconStore({
    documentObj: document,
    windowObj: window,
    storageArea: localStorageArea,
    storageKey: NEWTAB_SHORTCUT_ICONS_STORAGE_KEY
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
  let siteSearchIconCache = {};
  let siteSearchIconCacheLoaded = false;
  let siteSearchIconCacheLoadPromise = null;
  let siteSearchIconCacheRevision = 0;

  function loadSiteSearchIconCache() {
    if (siteSearchIconCacheLoaded) {
      return Promise.resolve(siteSearchIconCache);
    }
    if (siteSearchIconCacheLoadPromise) {
      return siteSearchIconCacheLoadPromise;
    }
    const loadRevision = siteSearchIconCacheRevision;
    siteSearchIconCacheLoadPromise = siteSearchIconStore.readAll().then((cache) => {
      if (siteSearchIconCacheRevision === loadRevision) {
        siteSearchIconCache = cache && typeof cache === 'object' ? cache : {};
      }
      siteSearchIconCacheLoaded = true;
      return siteSearchIconCache;
    }).catch(() => {
      if (siteSearchIconCacheRevision === loadRevision) {
        siteSearchIconCache = {};
      }
      siteSearchIconCacheLoaded = true;
      return siteSearchIconCache;
    });
    return siteSearchIconCacheLoadPromise;
  }

  loadSiteSearchIconCache();
  const shortcutFaviconPending = new Map();
  let shortcutFaviconPolicyRevision = 0;
  const shortcutFaviconRequestQueue = [];
  const SHORTCUT_FAVICON_MAX_CONCURRENT_REQUESTS = 3;
  let shortcutFaviconActiveRequestCount = 0;
  let shortcutFaviconCacheWriteTimer = null;
  let shortcutFaviconPendingCacheEntries = {};
  const sectionModeSelectController =
    NEWTAB_SELECT_MENU.createController({
      documentObj: document,
      windowObj: window,
      onBeforeOpen: hideTopActionTooltip,
      getViewportTopInset: getNewtabViewportTopPaddingPx
    });
  const shortcutContextMenuSelectController =
    NEWTAB_SELECT_MENU.createController({
      documentObj: document,
      windowObj: window,
      onBeforeOpen: () => {
        hideShortcutTooltip();
        hideTopActionTooltip();
      },
      getViewportTopInset: getNewtabViewportTopPaddingPx
    });
  const bookmarkContextMenuSelectController =
    NEWTAB_SELECT_MENU.createController({
      documentObj: document,
      windowObj: window,
      onBeforeOpen: () => {
        hideCursorTooltip();
        hideTopActionTooltip();
      },
      getViewportTopInset: getNewtabViewportTopPaddingPx
    });
  const recentContextMenuSelectController =
    NEWTAB_SELECT_MENU.createController({
      documentObj: document,
      windowObj: window,
      onBeforeOpen: () => {
        hideCursorTooltip();
        hideTopActionTooltip();
      },
      getViewportTopInset: getNewtabViewportTopPaddingPx
    });
  const BOOKMARK_WHEEL_SWITCH_COOLDOWN_MS = 220;
  const BOOKMARK_HOVER_DELAY_FROM_RECENT_MS = 56;
  const BOOKMARK_HOVER_RECENT_TRANSFER_WINDOW_MS = 220;
  const SECTION_MODE_MENU_MIN_WIDTH_PX = 168;
  const SECTION_MODE_MENU_MAX_WIDTH_PX = 240;
  const SECTION_MODE_MENU_PORTAL_Z_INDEX = 10020;
  const SECTION_MODE_MENU_PORTAL_OFFSET_PX = 8;
  const SHORTCUT_CONTEXT_MENU_MIN_WIDTH_PX = 124;
  const SHORTCUT_CONTEXT_MENU_MAX_WIDTH_PX = 180;
  const SHORTCUT_CONTEXT_MENU_PORTAL_Z_INDEX = 10040;
  const SHORTCUT_CONTEXT_MENU_PORTAL_OFFSET_PX = -6;
  const BOOKMARK_CONTEXT_MENU_EDIT_VALUE = 'edit';
  const BOOKMARK_CONTEXT_MENU_REMOVE_VALUE = 'remove';
  const BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE = 'open-in-new-tab-group';
  const BOOKMARK_CONTEXT_MENU_MIN_WIDTH_PX = 124;
  const BOOKMARK_CONTEXT_MENU_MAX_WIDTH_PX = 240;
  const BOOKMARK_CONTEXT_MENU_PORTAL_Z_INDEX = 10060;
  const BOOKMARK_CONTEXT_MENU_PORTAL_OFFSET_PX = -6;
  const SEARCH_LAYOUT_MIN_TOP_PX = 28;
  const SEARCH_LAYOUT_MIN_BOTTOM_PX = 20;
  const SEARCH_LAYOUT_UPSHIFT_RATIO = 0.06;
  const SEARCH_LAYOUT_UPSHIFT_MIN_PX = 24;
  const SEARCH_LAYOUT_UPSHIFT_MAX_PX = 80;
  const SEARCH_LAYOUT_CONTENT_SECTIONS_EXTRA_UPSHIFT_PX = 20;
  const SEARCH_LAYOUT_EMPTY_SECTIONS_EXTRA_UPSHIFT_PX = 96;
  const SEARCH_LAYOUT_NARROW_VIEWPORT_MIN_WIDTH_PX = 520;
  const SEARCH_LAYOUT_NARROW_VIEWPORT_MAX_WIDTH_PX = 1440;
  const SEARCH_LAYOUT_NARROW_TOP_INSET_PX = 16;
  const SEARCH_LAYOUT_NARROW_TOP_INSET_TRANSITION_PX = 64;
  const SEARCH_LAYOUT_SHORT_VIEWPORT_MAX_HEIGHT_PX = 680;
  const SEARCH_LAYOUT_SHORT_MIN_TOP_PX = 44;
  const WORDMARK_ENTRY_ANIMATION_NAME = '_x_nt_wordmark_enter_2026_unique_';
  const WORDMARK_ENTRY_ANIMATION_TOTAL_MS = 380;
  const WORDMARK_WALLPAPER_COVER_DARK_OPACITY = '0.32';
  const WORDMARK_WALLPAPER_COVER_LIGHT_OPACITY = '0.32';
  const WORDMARK_WALLPAPER_SOLID_OPACITY = '0.6';
  const TOP_CONTENT_LAYOUT_TRANSITION_MS = 260;
  const TOP_CONTENT_LAYOUT_TRANSITION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const BOOKMARK_CARD_TARGET_WIDTH_PX = 154;
  const BOOKMARK_GRID_GAP_PX = 12;
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
      searchMaxWidth: 720,
      contentMaxWidth: 1040,
      recentMaxColumns: 4
    },
    wide: {
      searchMaxWidth: 920,
      contentMaxWidth: RECENT_WIDE_CONTENT_MAX_WIDTH_PX,
      recentMaxColumns: RECENT_WIDE_MAX_COLUMNS
    }
  };
  const NEWTAB_SEARCH_WIDTH_CONFIG = {
    min: 640,
    max: 1040,
    fallback: 920,
    snapPoints: [640, 720, 920, 1040],
    snapThreshold: 14
  };
  let currentNewtabWidthMode = 'wide';
  let currentNewtabSearchWidth = null;
  let currentRecentGridColumns = 4;
  toastElement = document.getElementById('_x_extension_toast_2024_unique_');
  toastController = NEWTAB_TOAST.createToastController(toastElement, { windowObj: window });
  markNewtabStartupMilestone('core-runtimes-created');

  function normalizeRecentCount(value) {
    return NEWTAB_RECENT_STORE.normalizeRecentCount(value);
  }

  function normalizeRecentMode(value, fallback) {
    if (value === 'latest' || value === 'most') {
      return value;
    }
    return fallback === 'latest' || fallback === 'most' ? fallback : 'latest';
  }

  function normalizeBookmarkViewMode(value) {
    return value === 'list' || value === 'top' ? value : 'folder';
  }

  function shouldRepairBookmarkViewModeStorageValue(rawValue, normalizedValue) {
    return typeof rawValue !== 'undefined' && rawValue !== normalizedValue;
  }

  function persistBookmarkViewMode(value) {
    const mode = normalizeBookmarkViewMode(value);
    if (!storageArea || typeof storageArea.set !== 'function') {
      return false;
    }
    storageArea.set({ [BOOKMARK_VIEW_MODE_STORAGE_KEY]: mode });
    return true;
  }

  function settleInitialBookmarkViewModeReady() {
    if (typeof resolveInitialBookmarkViewModeReady !== 'function') {
      return;
    }
    resolveInitialBookmarkViewModeReady();
    resolveInitialBookmarkViewModeReady = null;
  }

  function applyInitialBookmarkViewModeValue(rawValue, source, expectedRevision) {
    try {
      const mode = normalizeBookmarkViewMode(rawValue);
      const applyResult = applyBookmarkViewMode(mode, {
        expectedRevision,
        ensureLoaded: true
      });
      if (!applyResult.applied) {
        return;
      }
      if (shouldRepairBookmarkViewModeStorageValue(rawValue, mode) ||
          (source === 'local-fallback' && typeof rawValue !== 'undefined')) {
        persistBookmarkViewMode(mode);
      }
    } finally {
      settleInitialBookmarkViewModeReady();
    }
  }

  function loadInitialBookmarkViewMode() {
    if (!storageArea || typeof storageArea.get !== 'function') {
      settleInitialBookmarkViewModeReady();
      return;
    }
    const expectedRevision = bookmarkViewModeRevision;
    const readLocalFallback = () => {
      if (!localStorageArea || isPrimaryStorageAreaName('local') ||
          typeof localStorageArea.get !== 'function') {
        applyInitialBookmarkViewModeValue(undefined, 'primary', expectedRevision);
        return;
      }
      try {
        localStorageArea.get([BOOKMARK_VIEW_MODE_STORAGE_KEY], (localResult) => {
          const localValue = localResult
            ? localResult[BOOKMARK_VIEW_MODE_STORAGE_KEY]
            : undefined;
          applyInitialBookmarkViewModeValue(
            localValue,
            'local-fallback',
            expectedRevision
          );
        });
      } catch (_error) {
        applyInitialBookmarkViewModeValue(undefined, 'primary', expectedRevision);
      }
    };
    try {
      storageArea.get([BOOKMARK_VIEW_MODE_STORAGE_KEY], (result) => {
        const stored = result ? result[BOOKMARK_VIEW_MODE_STORAGE_KEY] : undefined;
        if (typeof stored === 'undefined' && !isPrimaryStorageAreaName('local')) {
          readLocalFallback();
          return;
        }
        applyInitialBookmarkViewModeValue(stored, 'primary', expectedRevision);
      });
    } catch (_error) {
      readLocalFallback();
    }
  }

  function normalizeBookmarkTopbarSurfaceColor(value) {
    return NEWTAB_BOOKMARKS_TOPBAR.normalizeSurfaceColor(value);
  }

  function isBookmarkTopbarSurfaceMode(value) {
    return value === 'adaptive' ||
      value === 'clear' ||
      value === 'transparent' ||
      value === 'custom';
  }

  function normalizeBookmarkTopbarSurfaceMode(value) {
    return NEWTAB_BOOKMARKS_TOPBAR.normalizeSurfaceMode(value, 'adaptive');
  }

  function getEffectiveBookmarkTopbarSurfaceMode() {
    return bookmarkTopbarSurfaceMode === 'custom' && !currentBookmarkTopbarSurfaceColor
      ? 'adaptive'
      : bookmarkTopbarSurfaceMode;
  }

  function persistBookmarkTopbarSurfaceMode(value) {
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.set !== 'function') {
      return false;
    }
    bookmarkTopbarSurfaceStorageArea.set({
      [BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY]: normalizeBookmarkTopbarSurfaceMode(value)
    });
    return true;
  }

  function syncBookmarkTopbarSurfaceAppearance(options) {
    const config = options && typeof options === 'object' ? options : {};
    const effectiveMode = getEffectiveBookmarkTopbarSurfaceMode();
    if (bookmarkTopbarRuntime) {
      if (typeof bookmarkTopbarRuntime.setSurfaceMode === 'function') {
        bookmarkTopbarRuntime.setSurfaceMode(effectiveMode);
      }
      if (typeof bookmarkTopbarRuntime.setSurfaceColor === 'function') {
        bookmarkTopbarRuntime.setSurfaceColor(
          effectiveMode === 'custom' ? currentBookmarkTopbarSurfaceColor : ''
        );
      }
    }
    if (config.updateMenu !== false) {
      updateBookmarkModeMenu();
    }
    if (config.scheduleTone !== false) {
      scheduleWallpaperAdaptiveToneUpdate();
    }
    return effectiveMode;
  }

  function applyBookmarkTopbarSurfaceMode(value, options) {
    const config = options && typeof options === 'object' ? options : {};
    if (Object.prototype.hasOwnProperty.call(config, 'expectedRevision') &&
        config.expectedRevision !== bookmarkTopbarSurfaceModeRevision) {
      return bookmarkTopbarSurfaceMode;
    }
    const nextMode = normalizeBookmarkTopbarSurfaceMode(value);
    if (nextMode !== bookmarkTopbarSurfaceMode || config.persist === true) {
      bookmarkTopbarSurfaceModeRevision += 1;
    }
    bookmarkTopbarSurfaceMode = nextMode;
    syncBookmarkTopbarSurfaceAppearance({
      updateMenu: config.updateMenu !== false,
      scheduleTone: config.scheduleTone !== false
    });
    if (config.persist === true) {
      persistBookmarkTopbarSurfaceMode(nextMode);
    }
    return nextMode;
  }

  function loadInitialBookmarkTopbarSurfaceMode() {
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.get !== 'function') {
      return;
    }
    const expectedRevision = bookmarkTopbarSurfaceModeRevision;
    initialThemeReadyPromise.then(() => {
      const currentThemeColorKey = getBookmarkTopbarSurfaceColorStorageKey(
        getCurrentBookmarkTopbarResolvedTheme()
      );
      bookmarkTopbarSurfaceStorageArea.get([
        BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY,
        currentThemeColorKey,
        BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY
      ], (result) => {
        if (bookmarkTopbarSurfaceModeRevision !== expectedRevision) {
          return;
        }
        const rawMode = result && result[BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY];
        const storedColor = normalizeBookmarkTopbarSurfaceColor(
          result && (result[currentThemeColorKey] ||
            result[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY])
        );
        applyBookmarkTopbarSurfaceMode(
          isBookmarkTopbarSurfaceMode(rawMode)
            ? rawMode
            : (storedColor ? 'custom' : 'adaptive'),
          {
            expectedRevision,
            persist: !isBookmarkTopbarSurfaceMode(rawMode),
            updateMenu: true,
            scheduleTone: true
          }
        );
      });
    });
  }

  function normalizeBookmarkTopbarResolvedTheme(value) {
    return value === 'dark' ? 'dark' : 'light';
  }

  function getCurrentBookmarkTopbarResolvedTheme() {
    return normalizeBookmarkTopbarResolvedTheme(
      document.body ? document.body.getAttribute('data-theme') : 'light'
    );
  }

  function getBookmarkTopbarSurfaceColorStorageKey(resolvedTheme) {
    return normalizeBookmarkTopbarResolvedTheme(resolvedTheme) === 'dark'
      ? BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY
      : BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY;
  }

  function persistBookmarkTopbarSurfaceColor(value, resolvedTheme) {
    const theme = normalizeBookmarkTopbarResolvedTheme(
      resolvedTheme || getCurrentBookmarkTopbarResolvedTheme()
    );
    const color = normalizeBookmarkTopbarSurfaceColor(value);
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.set !== 'function') {
      return false;
    }
    bookmarkTopbarSurfaceStorageArea.set({
      [getBookmarkTopbarSurfaceColorStorageKey(theme)]: color
    });
    return true;
  }

  function applyBookmarkTopbarSurfaceColor(value, options) {
    const config = options && typeof options === 'object' ? options : {};
    const theme = normalizeBookmarkTopbarResolvedTheme(
      config.resolvedTheme || getCurrentBookmarkTopbarResolvedTheme()
    );
    if (Object.prototype.hasOwnProperty.call(config, 'expectedRevision') &&
        config.expectedRevision !== bookmarkTopbarSurfaceColorRevisions[theme]) {
      return bookmarkTopbarSurfaceColors[theme];
    }
    const color = normalizeBookmarkTopbarSurfaceColor(value);
    if (color !== bookmarkTopbarSurfaceColors[theme]) {
      bookmarkTopbarSurfaceColorRevisions[theme] += 1;
    }
    bookmarkTopbarSurfaceColors[theme] = color;
    if (theme === getCurrentBookmarkTopbarResolvedTheme()) {
      currentBookmarkTopbarSurfaceColor = color;
      syncBookmarkTopbarSurfaceAppearance({
        updateMenu: config.updateMenu !== false,
        scheduleTone: false
      });
    }
    if (config.persist === true) {
      persistBookmarkTopbarSurfaceColor(color, theme);
    }
    return color;
  }

  function syncBookmarkTopbarSurfaceColorForTheme(resolvedTheme, options) {
    const theme = normalizeBookmarkTopbarResolvedTheme(resolvedTheme);
    return applyBookmarkTopbarSurfaceColor(bookmarkTopbarSurfaceColors[theme], {
      resolvedTheme: theme,
      updateMenu: !options || options.updateMenu !== false
    });
  }

  function removeLegacyBookmarkTopbarSurfaceColor() {
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.remove !== 'function') {
      return false;
    }
    bookmarkTopbarSurfaceStorageArea.remove(BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY);
    return true;
  }

  function migrateLegacyBookmarkTopbarSurfaceColor(value) {
    const color = normalizeBookmarkTopbarSurfaceColor(value);
    if (!color) {
      removeLegacyBookmarkTopbarSurfaceColor();
      return;
    }
    const theme = getCurrentBookmarkTopbarResolvedTheme();
    const storageKey = getBookmarkTopbarSurfaceColorStorageKey(theme);
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.get !== 'function') {
      applyBookmarkTopbarSurfaceColor(color, {
        resolvedTheme: theme,
        persist: true
      });
      removeLegacyBookmarkTopbarSurfaceColor();
      return;
    }
    bookmarkTopbarSurfaceStorageArea.get([storageKey], (result) => {
      if (!result || typeof result[storageKey] === 'undefined') {
        applyBookmarkTopbarSurfaceColor(color, {
          resolvedTheme: theme,
          persist: true
        });
      }
      removeLegacyBookmarkTopbarSurfaceColor();
    });
  }

  function getBookmarkTopbarSurfaceColorStorageKeys() {
    return [
      BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY
    ];
  }

  function getBookmarkTopbarSurfaceCleanupKeys() {
    return [
      BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY,
      ...getBookmarkTopbarSurfaceColorStorageKeys()
    ];
  }

  function applyInitialBookmarkTopbarSurfaceColors(result, readRevisions) {
    [
      {
        key: BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY,
        resolvedTheme: 'light'
      },
      {
        key: BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY,
        resolvedTheme: 'dark'
      }
    ].forEach((entry) => {
      if (bookmarkTopbarSurfaceColorRevisions[entry.resolvedTheme] !==
          readRevisions[entry.resolvedTheme]) {
        return;
      }
      const rawColor = result ? result[entry.key] : undefined;
      const color = applyBookmarkTopbarSurfaceColor(rawColor, {
        resolvedTheme: entry.resolvedTheme,
        updateMenu: true
      });
      if (rawColor && rawColor !== color) {
        persistBookmarkTopbarSurfaceColor(color, entry.resolvedTheme);
      }
    });
  }

  function loadInitialBookmarkTopbarSurfaceColors() {
    const localArea = bookmarkTopbarSurfaceStorageArea;
    if (!localArea || typeof localArea.get !== 'function') {
      return;
    }
    const colorKeys = getBookmarkTopbarSurfaceColorStorageKeys();
    const cleanupKeys = getBookmarkTopbarSurfaceCleanupKeys();
    const syncArea = chrome && chrome.storage ? chrome.storage.sync : null;
    initialThemeReadyPromise.then(() => {
      localArea.get(colorKeys, (localResult) => {
        const resolvedLocalResult = Object.assign({}, localResult || {});
        const localUpdates = {};
        const hasLocalLegacyColor = Object.prototype.hasOwnProperty.call(
          resolvedLocalResult,
          BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY
        );
        const localLegacyColor = resolvedLocalResult[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY];
        const currentThemeKey = getBookmarkTopbarSurfaceColorStorageKey(
          getCurrentBookmarkTopbarResolvedTheme()
        );
        if (typeof localLegacyColor !== 'undefined' &&
            typeof resolvedLocalResult[currentThemeKey] === 'undefined') {
          resolvedLocalResult[currentThemeKey] = localLegacyColor;
          localUpdates[currentThemeKey] = localLegacyColor;
        }
        delete resolvedLocalResult[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY];
        const readRevisions = {
          light: bookmarkTopbarSurfaceColorRevisions.light,
          dark: bookmarkTopbarSurfaceColorRevisions.dark
        };
        const finishLocalMigration = () => {
          if (hasLocalLegacyColor && typeof localArea.remove === 'function') {
            localArea.remove(BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY);
          }
          applyInitialBookmarkTopbarSurfaceColors(resolvedLocalResult, readRevisions);
        };
        if (Object.keys(localUpdates).length > 0 && typeof localArea.set === 'function') {
          localArea.set(localUpdates, finishLocalMigration);
          return;
        }
        finishLocalMigration();
      });
      if (syncArea && syncArea !== localArea && typeof syncArea.remove === 'function') {
        syncArea.remove(cleanupKeys, () => {
          void (chrome.runtime && chrome.runtime.lastError);
        });
      }
    });
  }

  function handleBookmarkTopbarSurfaceColorStorageChanges(changes, areaName) {
    if (areaName !== 'local') {
      return false;
    }
    let handled = false;
    if (changes[BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY]) {
      handled = true;
      applyBookmarkTopbarSurfaceMode(
        changes[BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY].newValue,
        { updateMenu: true, scheduleTone: true }
      );
    }
    [
      {
        key: BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY,
        resolvedTheme: 'light'
      },
      {
        key: BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY,
        resolvedTheme: 'dark'
      }
    ].forEach((entry) => {
      if (!changes[entry.key]) {
        return;
      }
      handled = true;
      const rawColor = changes[entry.key].newValue;
      const color = applyBookmarkTopbarSurfaceColor(rawColor, {
        resolvedTheme: entry.resolvedTheme,
        updateMenu: true
      });
      if (rawColor && rawColor !== color) {
        persistBookmarkTopbarSurfaceColor(color, entry.resolvedTheme);
      }
    });
    if (changes[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY] &&
        typeof changes[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY].newValue !== 'undefined') {
      handled = true;
      initialThemeReadyPromise.then(() => {
        migrateLegacyBookmarkTopbarSurfaceColor(
          changes[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY].newValue
        );
      });
    }
    return handled;
  }

  function pickBookmarkTopbarSurfaceColor() {
    if (!window || typeof window.EyeDropper !== 'function') {
      showToast(t(
        'bookmark_topbar_color_unsupported',
        'Screen color picking is not supported in this browser'
      ), true);
      return Promise.resolve(false);
    }
    let request;
    try {
      request = new window.EyeDropper().open();
    } catch (error) {
      showToast(t('bookmark_topbar_color_failed', 'Could not pick a color. Try again.'), true);
      return Promise.resolve(false);
    }
    return request.then((result) => {
      const color = normalizeBookmarkTopbarSurfaceColor(result && result.sRGBHex);
      if (!color) {
        showToast(t('bookmark_topbar_color_failed', 'Could not pick a color. Try again.'), true);
        return false;
      }
      applyBookmarkTopbarSurfaceColor(color, { persist: true, updateMenu: false });
      applyBookmarkTopbarSurfaceMode('custom', { persist: true });
      showToast(t('bookmark_topbar_color_picked', 'Color picked'));
      return true;
    }).catch((error) => {
      if (error && error.name === 'AbortError') {
        return false;
      }
      showToast(t('bookmark_topbar_color_failed', 'Could not pick a color. Try again.'), true);
      return false;
    });
  }

  function resetBookmarkTopbarSurfaceColor() {
    applyBookmarkTopbarSurfaceColor('', { persist: true, updateMenu: false });
    applyBookmarkTopbarSurfaceMode('adaptive', { persist: true });
    showToast(t('bookmark_topbar_color_reset_done', 'Automatic colors restored'));
  }

  function handleBookmarkModeMenuAction(action) {
    if (action === BOOKMARK_TOPBAR_PICK_COLOR_ACTION) {
      pickBookmarkTopbarSurfaceColor();
      return;
    }
    if (action === BOOKMARK_TOPBAR_RESET_COLOR_ACTION) {
      resetBookmarkTopbarSurfaceColor();
      return;
    }
    const surfaceModePrefix = `${BOOKMARK_TOPBAR_SURFACE_MODE_ACTION}:`;
    if (String(action || '').startsWith(surfaceModePrefix)) {
      const nextMode = String(action).slice(surfaceModePrefix.length);
      if (nextMode === 'adaptive' ||
          nextMode === 'clear' ||
          nextMode === 'transparent') {
        applyBookmarkTopbarSurfaceMode(nextMode, { persist: true });
      }
    }
  }

  function normalizeNewtabWidthMode(value) {
    return SETTINGS.normalizeNewtabWidthMode(value);
  }

  function normalizeNewtabSearchWidth(value, options) {
    return SETTINGS.normalizeNewtabSearchWidth(value, Object.assign({}, NEWTAB_SEARCH_WIDTH_CONFIG, options || {}));
  }

  function normalizeNewtabTopContentMode(value) {
    return SETTINGS.normalizeNewtabTopContentMode(value);
  }

  function normalizeNewtabTimeSecondsVisible(value) {
    return SETTINGS.normalizeNewtabTimeSecondsVisible(value);
  }

  function normalizeNewtabTimeFontWeight(value) {
    return SETTINGS.normalizeNewtabTimeFontWeight(value);
  }

  function normalizeNewtabShortcutsVisible(value) {
    return SETTINGS.normalizeNewtabShortcutsVisible(value);
  }

  function normalizeNewtabShortcutAddVisible(value) {
    return SETTINGS.normalizeNewtabShortcutAddVisible(value);
  }

  function normalizeNewtabShortcutDockMagnificationEnabled(value) {
    return SETTINGS.normalizeNewtabShortcutDockMagnificationEnabled(value);
  }

  function normalizeNewtabShortcutColumns(value) {
    return SETTINGS.normalizeNewtabShortcutColumns(value, {
      min: NEWTAB_SHORTCUT_COLUMNS_MIN,
      max: NEWTAB_SHORTCUT_COLUMNS_MAX,
      fallback: NEWTAB_SHORTCUT_COLUMNS_DEFAULT
    });
  }

  function normalizeNewtabShortcutSize(value) {
    return SETTINGS.normalizeNewtabShortcutSize(value, {
      min: NEWTAB_SHORTCUT_SIZE_MIN,
      max: NEWTAB_SHORTCUT_SIZE_MAX,
      fallback: NEWTAB_SHORTCUT_SIZE_DEFAULT
    });
  }

  function normalizeNewtabShortcutGap(value) {
    return SETTINGS.normalizeNewtabShortcutGap(value, {
      min: NEWTAB_SHORTCUT_GAP_MIN,
      max: NEWTAB_SHORTCUT_GAP_MAX,
      fallback: NEWTAB_SHORTCUT_GAP_DEFAULT
    });
  }

  function inferNewtabShortcutColumnsFromWidth(value) {
    return SETTINGS.inferNewtabShortcutColumnsFromWidth(value, {
      widthMin: NEWTAB_SHORTCUT_WIDTH_MIN,
      widthMax: NEWTAB_SHORTCUT_WIDTH_MAX,
      columnsMin: NEWTAB_SHORTCUT_COLUMNS_MIN,
      columnsMax: NEWTAB_SHORTCUT_COLUMNS_MAX
    });
  }

  function normalizeNewtabInputAutoFocusEnabled(value) {
    return SETTINGS.normalizeNewtabInputAutoFocusEnabled(value);
  }

  function normalizeNewtabFeedbackButtonVisible(value) {
    return SETTINGS.normalizeNewtabFeedbackButtonVisible(value);
  }

  function normalizeNewtabAppearanceButtonVisible(value) {
    return SETTINGS.normalizeNewtabAppearanceButtonVisible(value);
  }

  function updateNewtabInputAutoFocusUi() {
    if (wallpaperRuntime && typeof wallpaperRuntime.updateInputAutoFocusUi === 'function') {
      wallpaperRuntime.updateInputAutoFocusUi();
    }
  }

  function setNewtabInputAutoFocusEnabled(enabled) {
    const nextValue = normalizeNewtabInputAutoFocusEnabled(enabled);
    newtabInputAutoFocusEnabled = nextValue;
    updateNewtabInputAutoFocusUi();
    if (storageArea) {
      storageArea.set({ [NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function updateNewtabShortcutPreferencesUi() {
    if (wallpaperRuntime && typeof wallpaperRuntime.updateShortcutsUi === 'function') {
      wallpaperRuntime.updateShortcutsUi();
    }
  }

  function setNewtabShortcutsVisible(enabled, options) {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutsVisible(enabled);
    newtabShortcutsVisible = nextValue;
    applyNewtabShortcutsVisibility();
    updateNewtabShortcutPreferencesUi();
    updateBookmarkSectionPosition({ preserveSearchEntryLayout: true });
    if (config.persist && storageArea) {
      storageArea.set({ [NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutAddVisible(enabled, options) {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutAddVisible(enabled);
    newtabShortcutAddVisible = nextValue;
    renderShortcuts();
    updateNewtabShortcutPreferencesUi();
    if (config.persist && storageArea) {
      storageArea.set({ [NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutDockMagnificationEnabled(enabled, options) {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutDockMagnificationEnabled(enabled);
    newtabShortcutDockMagnificationEnabled = nextValue;
    applyNewtabShortcutDockMagnification();
    updateNewtabShortcutPreferencesUi();
    scheduleWallpaperAdaptiveToneUpdate();
    if (config.persist && storageArea) {
      storageArea.set({ [NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutColumns(value, options) {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutColumns(value);
    newtabShortcutColumns = nextValue;
    applyNewtabShortcutColumns();
    updateNewtabShortcutPreferencesUi();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    if (config.persist && storageArea) {
      storageArea.set({ [NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutSize(value, options) {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutSize(value);
    newtabShortcutSize = nextValue;
    applyNewtabShortcutLayoutPreferences();
    updateNewtabShortcutPreferencesUi();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    if (config.persist && storageArea) {
      storageArea.set({ [NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutGap(value, options) {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutGap(value);
    newtabShortcutGap = nextValue;
    applyNewtabShortcutLayoutPreferences();
    updateNewtabShortcutPreferencesUi();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    if (config.persist && storageArea) {
      storageArea.set({ [NEWTAB_SHORTCUT_GAP_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function loadNewtabInputAutoFocusEnabled() {
    if (!storageArea) {
      newtabInputAutoFocusEnabled = false;
      return Promise.resolve(newtabInputAutoFocusEnabled);
    }
    return new Promise((resolve) => {
      storageArea.get([NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY], (result) => {
        const rawValue = result && result[NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY];
        newtabInputAutoFocusEnabled = normalizeNewtabInputAutoFocusEnabled(rawValue);
        updateNewtabInputAutoFocusUi();
        resolve(newtabInputAutoFocusEnabled);
      });
    });
  }

  const initialNewtabInputAutoFocusReadyTask = loadNewtabInputAutoFocusEnabled();

  function loadNumberShortcutInstantEnabled() {
    if (!storageArea) {
      numberShortcutInstantEnabled = false;
      return Promise.resolve(numberShortcutInstantEnabled);
    }
    return new Promise((resolve) => {
      storageArea.get([NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY], (result) => {
        const rawValue = result && result[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY];
        numberShortcutInstantEnabled = normalizeNumberShortcutInstantEnabled(rawValue);
        resolve(numberShortcutInstantEnabled);
      });
    });
  }

  const initialNumberShortcutInstantReadyTask = loadNumberShortcutInstantEnabled();

  function normalizeSimpleModeEnabled(value) {
    return SETTINGS.normalizeSimpleModeEnabled(value);
  }

  function loadSimpleModeEnabled() {
    if (!storageArea) {
      simpleModeEnabled = false;
      return Promise.resolve(simpleModeEnabled);
    }
    return new Promise((resolve) => {
      storageArea.get([SIMPLE_MODE_ENABLED_STORAGE_KEY], (result) => {
        const rawValue = result && result[SIMPLE_MODE_ENABLED_STORAGE_KEY];
        simpleModeEnabled = normalizeSimpleModeEnabled(rawValue);
        resolve(simpleModeEnabled);
      });
    });
  }

  loadSimpleModeEnabled();

  function normalizeMacosCtrlSuggestionNavigationEnabled(value) {
    return SETTINGS.normalizeMacosCtrlSuggestionNavigationEnabled(value);
  }

  function loadMacosCtrlSuggestionNavigationEnabled() {
    if (!storageArea) {
      macosCtrlSuggestionNavigationEnabled = false;
      return Promise.resolve(macosCtrlSuggestionNavigationEnabled);
    }
    return new Promise((resolve) => {
      storageArea.get([MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY], (result) => {
        const rawValue = result && result[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY];
        macosCtrlSuggestionNavigationEnabled =
          normalizeMacosCtrlSuggestionNavigationEnabled(rawValue);
        resolve(macosCtrlSuggestionNavigationEnabled);
      });
    });
  }

  loadMacosCtrlSuggestionNavigationEnabled();

  function normalizeNumberShortcutInstantEnabled(value) {
    return SETTINGS.normalizeNumberShortcutInstantEnabled(value);
  }

  function normalizeBookmarkFolderIconsVisible(value) {
    return SETTINGS.normalizeBookmarkFolderIconsVisible(value);
  }

  function normalizeZenModeEnabled(value) {
    return value === true;
  }

  function normalizeSearchResultPriority(value) {
    return SETTINGS.normalizeSearchResultPriority(value);
  }

  function normalizeOverlayTabPriorityMode(value) {
    return SETTINGS.normalizeOverlayTabPriorityMode(value);
  }

  function normalizeBookmarkCount(value) {
    return SETTINGS.normalizeBookmarkCount(value);
  }

  function getBookmarkLimit() {
    const normalized = normalizeBookmarkCount(currentBookmarkCount);
    if (normalized <= 0) {
      return 8;
    }
    const rows = Math.max(1, Math.round(normalized / 4));
    // Use the actual rendered column count so "show N rows" remains accurate on responsive layouts.
    const columns = Math.max(1, getBookmarkGridColumnCount());
    return rows * columns;
  }

  function normalizeBookmarkColumns(value) {
    return SETTINGS.normalizeBookmarkColumns(value);
  }

  function normalizeTabRankScoreDebugMode(value) {
    return SETTINGS.normalizeTabRankScoreDebugMode(value);
  }

  function normalizeBookmarkCascadeDebugMode(value) {
    return value === true;
  }

  function getTopContentMotionElements() {
    return [
      topContentContainer,
      root,
      shortcutSection,
      bookmarkSection,
      recentSection,
      updateNoticeController && updateNoticeController.element,
      engagementNoticeController && engagementNoticeController.element
    ].filter((element, index, elements) => (
      element &&
      element.isConnected &&
      typeof element.getBoundingClientRect === 'function' &&
      elements.indexOf(element) === index
    ));
  }

  function captureTopContentLayout() {
    const positions = new Map();
    getTopContentMotionElements().forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top) ||
          (rect.width <= 0 && rect.height <= 0)) {
        return;
      }
      positions.set(element, { left: rect.left, top: rect.top });
    });
    return positions;
  }

  function captureRecentCardLayout() {
    const positions = new Map();
    recentCards.forEach((card) => {
      if (!card || !card.isConnected || typeof card.getBoundingClientRect !== 'function') {
        return;
      }
      const rect = card.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top) ||
          (rect.width <= 0 && rect.height <= 0)) {
        return;
      }
      positions.set(card, { left: rect.left, top: rect.top });
    });
    return positions;
  }

  function cancelTopContentLayoutAnimations() {
    topContentLayoutAnimations.forEach((animation) => animation.cancel());
    topContentLayoutAnimations.clear();
  }

  function cancelRecentResizeLayoutAnimations() {
    recentResizeLayoutAnimations.forEach((animation) => animation.cancel());
    recentResizeLayoutAnimations.clear();
  }

  function prefersSystemReducedMotion() {
    return Boolean(
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function shouldSkipNewtabEntryMotion() {
    const motionEffectsEnabled = !document.documentElement ||
      document.documentElement.getAttribute('data-lumno-motion-effects') !== 'off';
    return SETTINGS.shouldSkipEntryMotion(window, motionEffectsEnabled);
  }

  function shouldAnimateNewtabLayoutShift() {
    const body = document.body;
    return Boolean(
      body &&
      body.getAttribute('data-nt-ready') === '1' &&
      body.getAttribute('data-nt-enter') !== 'run' &&
      body.getAttribute('data-nt-suggestions-open') !== 'true' &&
      !prefersSystemReducedMotion()
    );
  }

  function animateLayoutShift(fromPositions, animations) {
    if (!fromPositions || fromPositions.size === 0) {
      return;
    }
    fromPositions.forEach((fromPosition, element) => {
      if (!element || !element.isConnected || typeof element.animate !== 'function') {
        return;
      }
      const rect = element.getBoundingClientRect();
      const deltaX = fromPosition.left - rect.left;
      const deltaY = fromPosition.top - rect.top;
      if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) ||
          (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5)) {
        return;
      }
      const animation = element.animate(
        [
          { translate: `${deltaX}px ${deltaY}px` },
          { translate: '0 0' }
        ],
        {
          duration: TOP_CONTENT_LAYOUT_TRANSITION_MS,
          easing: TOP_CONTENT_LAYOUT_TRANSITION_EASING,
          fill: 'both'
        }
      );
      animations.add(animation);
      animation.oncancel = () => {
        animations.delete(animation);
      };
      animation.onfinish = () => {
        animations.delete(animation);
        animation.cancel();
      };
    });
  }

  function animateTopContentLayout(fromPositions) {
    animateLayoutShift(fromPositions, topContentLayoutAnimations);
  }

  function animateRecentResizeLayout(fromPositions) {
    animateLayoutShift(fromPositions, recentResizeLayoutAnimations);
  }

  function applyNewtabTopContentVisibility(options) {
    if (!topContentContainer) {
      return;
    }
    const transitionOptions = options || {};
    const body = document.body;
    const nextVisible = Boolean(newtabTopContentMode !== 'off' && !zenModeEnabled);
    const wasVisible = topContentContainer.getAttribute('data-visible') !== 'false';
    const stateChanged = wasVisible !== nextVisible;
    const layoutChanged = stateChanged || Boolean(transitionOptions.contentChanged);
    const suggestionsOpen = Boolean(
      body && body.getAttribute('data-nt-suggestions-open') === 'true'
    );
    const shouldAnimate = Boolean(
      body &&
      body.getAttribute('data-nt-ready') === '1' &&
      layoutChanged &&
      !suggestionsOpen &&
      !prefersSystemReducedMotion()
    );
    const fromLayout = shouldAnimate
      ? (transitionOptions.fromLayout || captureTopContentLayout())
      : null;
    cancelTopContentLayoutAnimations();
    topContentContainer.setAttribute('data-visible', nextVisible ? 'true' : 'false');
    topContentContainer.style.setProperty('display', 'flex');
    topContentContainer.style.setProperty('transition', 'none');
    if (nextVisible) {
      topContentContainer.style.removeProperty('height');
    } else {
      topContentContainer.style.setProperty('height', '0px');
    }
    topContentContainer.style.setProperty('max-height', nextVisible ? '74px' : '0');
    topContentContainer.style.setProperty('margin-bottom', nextVisible ? '28px' : '0');
    topContentContainer.style.setProperty('opacity', nextVisible ? '1' : '0');
    topContentContainer.style.removeProperty('transform');
    topContentContainer.style.setProperty('pointer-events', nextVisible ? 'auto' : 'none');
    topContentContainer.inert = !nextVisible;
    if (nextVisible) {
      topContentContainer.removeAttribute('aria-hidden');
    } else {
      topContentContainer.setAttribute('aria-hidden', 'true');
    }
    if (stateChanged && !nextVisible) {
      finishWordmarkEntryAnimation();
    } else if (stateChanged && shouldAnimate && nextVisible) {
      restartWordmarkEntryAnimation();
    }
    updateSearchEntryLayout();
    updateSuggestionsFloatingLayout();
    if (shouldAnimate) {
      animateTopContentLayout(fromLayout);
    }
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function finishWordmarkEntryAnimation() {
    if (wordmarkEntryTransitionTimer) {
      window.clearTimeout(wordmarkEntryTransitionTimer);
      wordmarkEntryTransitionTimer = 0;
    }
    if (topContentContainer) {
      topContentContainer.setAttribute('data-enter', 'done');
    }
  }

  function restartWordmarkEntryAnimation() {
    if (!topContentContainer) {
      return;
    }
    if (prefersSystemReducedMotion()) {
      finishWordmarkEntryAnimation();
      return;
    }
    const wordmarkContent = topContentContainer.querySelector('.x-nt-wordmark-content');
    if (wordmarkEntryTransitionTimer) {
      window.clearTimeout(wordmarkEntryTransitionTimer);
      wordmarkEntryTransitionTimer = 0;
    }
    topContentContainer.setAttribute('data-enter', 'done');
    if (wordmarkContent) {
      void wordmarkContent.offsetWidth;
    }
    topContentContainer.setAttribute('data-enter', 'run');
    wordmarkEntryTransitionTimer = window.setTimeout(
      finishWordmarkEntryAnimation,
      WORDMARK_ENTRY_ANIMATION_TOTAL_MS
    );
  }

  function getWordmarkSolidFill(wallpaperActive, wallpaperInk, theme) {
    if (wallpaperActive) {
      return wallpaperInk === 'dark'
        ? 'var(--x-nt-wallpaper-wordmark-ink, rgb(238 240 242))'
        : 'var(--x-nt-wallpaper-wordmark-ink, rgb(78 84 94))';
    }
    return theme === 'dark' ? 'rgb(248 250 252)' : 'rgb(31 41 55)';
  }

  function applyWordmarkSolidFill(fill) {
    if (!topContentContainer) {
      return;
    }
    topContentContainer.style.setProperty('--x-nt-wordmark-solid-fill', fill);
  }

  function applyWordmarkSolidLayerVisible(visible) {
    if (!wordmarkSolidEl) {
      return;
    }
    wordmarkSolidEl.style.setProperty(
      'opacity',
      visible ? WORDMARK_WALLPAPER_SOLID_OPACITY : '0'
    );
  }

  function applyWordmarkThemeAppearance(resolvedTheme) {
    const theme = resolvedTheme || (document.body ? document.body.getAttribute('data-theme') : 'light');
    const wallpaperActive = document.body &&
      document.body.getAttribute('data-wallpaper-active') === 'true';
    const wallpaperInk = topContentContainer
      ? topContentContainer.getAttribute('data-wallpaper-ink')
      : '';
    applyWordmarkSolidFill(getWordmarkSolidFill(wallpaperActive, wallpaperInk, theme));
    if (!wordmarkImageEl) {
      return;
    }
    const lightSrc = '../../assets/images/lumno-wordmark.svg';
    const darkSrc = '../../assets/images/lumno-wordmark-dark.svg';
    if (wallpaperActive) {
      const wallpaperOverlayCover = topContentContainer &&
        topContentContainer.getAttribute('data-wallpaper-overlay-cover') === 'true';
      if (wallpaperOverlayCover) {
        applyWordmarkSolidLayerVisible(false);
        const themeSrc = theme === 'dark' ? darkSrc : lightSrc;
        if (wordmarkImageEl.getAttribute('src') !== themeSrc) {
          wordmarkImageEl.setAttribute('src', themeSrc);
        }
        applyWordmarkSolidFill(getWordmarkSolidFill(false, '', theme));
        wordmarkImageEl.style.setProperty(
          'opacity',
          theme === 'dark'
            ? WORDMARK_WALLPAPER_COVER_DARK_OPACITY
            : WORDMARK_WALLPAPER_COVER_LIGHT_OPACITY
        );
        return;
      }
      const wallpaperSrc = wallpaperInk === 'dark' ? lightSrc : darkSrc;
      if (wordmarkImageEl.getAttribute('src') !== wallpaperSrc) {
        wordmarkImageEl.setAttribute('src', wallpaperSrc);
      }
      applyWordmarkSolidFill(getWordmarkSolidFill(true, wallpaperInk, theme));
      applyWordmarkSolidLayerVisible(true);
      wordmarkImageEl.style.setProperty('opacity', '0');
      return;
    }
    applyWordmarkSolidLayerVisible(false);
    if (theme === 'dark') {
      if (wordmarkImageEl.getAttribute('src') !== darkSrc) {
        wordmarkImageEl.setAttribute('src', darkSrc);
      }
      applyWordmarkSolidFill(getWordmarkSolidFill(false, '', theme));
      wordmarkImageEl.style.setProperty('opacity', '0.9');
      return;
    }
    if (wordmarkImageEl.getAttribute('src') !== lightSrc) {
      wordmarkImageEl.setAttribute('src', lightSrc);
    }
    applyWordmarkSolidFill(getWordmarkSolidFill(false, '', theme));
    wordmarkImageEl.style.setProperty('opacity', '0.82');
  }

  function renderNewtabTopContent(animateEntry) {
    if (!topContentController) {
      return;
    }
    topContentController.render({
      animateEntry: Boolean(animateEntry),
      ariaLabel: 'Lumno Chrome Web Store',
      fontWeight: newtabTimeFontWeight,
      imageSrc: '../../assets/images/lumno-wordmark.svg',
      locale: document.documentElement ? document.documentElement.lang : undefined,
      mode: newtabTopContentMode === 'time' ? 'time' : 'brand',
      showSeconds: newtabTimeSecondsVisible
    });
    wordmarkImageEl = topContentController.getImage();
    wordmarkSolidEl = topContentController.getSolid();
    applyWordmarkThemeAppearance();
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function setNewtabTopContentMode(value) {
    const nextMode = normalizeNewtabTopContentMode(value);
    const contentChanged = nextMode !== newtabTopContentMode;
    if (!contentChanged) {
      return;
    }
    const fromLayout = captureTopContentLayout();
    newtabTopContentMode = nextMode;
    if (nextMode !== 'off') {
      renderNewtabTopContent(false);
    }
    applyNewtabTopContentVisibility({ contentChanged, fromLayout });
  }

  function updateNewtabTimeSecondsVisibleUi() {
    if (wallpaperRuntime && typeof wallpaperRuntime.updateTimeSecondsVisibleUi === 'function') {
      wallpaperRuntime.updateTimeSecondsVisibleUi();
    }
  }

  function updateNewtabTimeFontWeightUi() {
    if (wallpaperRuntime && typeof wallpaperRuntime.updateTimeFontWeightUi === 'function') {
      wallpaperRuntime.updateTimeFontWeightUi();
    }
  }

  function setNewtabTimeFontWeight(value) {
    const nextValue = normalizeNewtabTimeFontWeight(value);
    const changed = nextValue !== newtabTimeFontWeight;
    newtabTimeFontWeight = nextValue;
    if (changed && newtabTopContentMode === 'time') {
      renderNewtabTopContent(false);
    }
    updateNewtabTimeFontWeightUi();
    return nextValue;
  }

  function setNewtabTimeSecondsVisible(value) {
    const nextValue = normalizeNewtabTimeSecondsVisible(value);
    const changed = nextValue !== newtabTimeSecondsVisible;
    newtabTimeSecondsVisible = nextValue;
    if (changed && newtabTopContentMode === 'time') {
      renderNewtabTopContent(false);
    }
    updateNewtabTimeSecondsVisibleUi();
    return nextValue;
  }

  function formatTabRankDebugText(tab) {
    const scoreRaw = Number(tab && tab._xTabRankScore);
    const score = Number.isFinite(scoreRaw) ? scoreRaw.toFixed(2) : '0.00';
    const count30mRaw = Number(tab && tab._xTabSwitchCount30m);
    const count24hRaw = Number(tab && tab._xTabSwitchCount24h);
    const debugTotalRaw = Number(tab && tab._xTabDebugEventTotal);
    const lastAccessedRaw = Number(tab && tab._xTabLastAccessedRaw);
    const sortAtRaw = Number(tab && tab._xTabSortAt);
    const fetchSeqRaw = Number(tab && tab._xTabFetchSeq);
    const count30m = Number.isFinite(count30mRaw) ? Math.max(0, Math.round(count30mRaw)) : 0;
    const count24h = Number.isFinite(count24hRaw) ? Math.max(0, Math.round(count24hRaw)) : 0;
    const debugTotal = Number.isFinite(debugTotalRaw) ? Math.max(0, Math.round(debugTotalRaw)) : 0;
    const lastAccessedSec = Number.isFinite(lastAccessedRaw) && lastAccessedRaw > 0 ? Math.round(lastAccessedRaw / 1000) : 0;
    const sortAtSec = Number.isFinite(sortAtRaw) && sortAtRaw > 0 ? Math.round(sortAtRaw / 1000) : 0;
    const fetchSeq = Number.isFinite(fetchSeqRaw) ? Math.max(0, Math.round(fetchSeqRaw)) : 0;
    return `score ${score} · 30m ${count30m} · 24h ${count24h} · ev ${debugTotal} · la ${lastAccessedSec} · s ${sortAtSec} · fs ${fetchSeq} · build 20260308-1`;
  }

  function getBookmarkGridColumnCount() {
    const config = getNewtabWidthModeConfig();
    const maxColumns = Math.max(2, normalizeBookmarkColumns(currentBookmarkColumns));
    return NEWTAB_LAYOUT.getAdaptiveGridColumnCount({
      viewportWidth: window.innerWidth,
      mobileBreakpointPx: NEWTAB_MOBILE_FLOW_BREAKPOINT_PX,
      mobileColumns: 2,
      compactBreakpointPx: 860,
      compactColumns: 2,
      contentMaxWidth: Number(config.contentMaxWidth || 1040),
      targetColumnWidth: BOOKMARK_CARD_TARGET_WIDTH_PX,
      gap: BOOKMARK_GRID_GAP_PX,
      minColumns: 2,
      maxColumns
    });
  }

  function getNewtabWidthModeBaseConfig() {
    return NEWTAB_WIDTH_MODE_CONFIGS[normalizeNewtabWidthMode(currentNewtabWidthMode)] || NEWTAB_WIDTH_MODE_CONFIGS.wide;
  }

  function getEffectiveNewtabSearchWidth() {
    const customWidth = normalizeNewtabSearchWidth(currentNewtabSearchWidth, { allowNull: true });
    return customWidth || getNewtabWidthModeBaseConfig().searchMaxWidth || NEWTAB_SEARCH_WIDTH_CONFIG.fallback;
  }

  function getNewtabWidthModeConfig() {
    return Object.assign({}, getNewtabWidthModeBaseConfig(), {
      searchMaxWidth: getEffectiveNewtabSearchWidth()
    });
  }

  function getRecentGridColumnCount() {
    const config = getNewtabWidthModeConfig();
    const maxColumns = Math.max(4, Number(config.recentMaxColumns || 4));
    return NEWTAB_LAYOUT.getAdaptiveGridColumnCount({
      viewportWidth: window.innerWidth,
      mobileBreakpointPx: NEWTAB_MOBILE_FLOW_BREAKPOINT_PX,
      mobileColumns: 1,
      compactBreakpointPx: 860,
      compactColumns: 2,
      contentMaxWidth: Number(config.contentMaxWidth || 1040),
      targetColumnWidth: RECENT_CARD_TARGET_WIDTH_PX,
      gap: RECENT_GRID_GAP_PX,
      minColumns: 4,
      maxColumns
    });
  }

  function clearPageNoticeQueryParam() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('notice')) {
        return;
      }
      url.searchParams.delete('notice');
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      // Ignore URL rewrite failures.
    }
  }

  function dismissPageNoticeBanner() {
    if (pageNoticeController && typeof pageNoticeController.dismiss === 'function') {
      pageNoticeController.dismiss();
      return;
    }
    clearPageNoticeQueryParam();
  }

  function openExtensionDetailsPage(detailsUrl) {
    if (chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      chrome.runtime.sendMessage({ action: 'openExtensionDetailsPage' }, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          if (detailsUrl) {
            window.open(detailsUrl, '_blank');
          }
          return;
        }
        if (!response || response.ok !== true) {
          const fallbackUrl = response && response.url ? response.url : detailsUrl;
          if (fallbackUrl) {
            window.open(fallbackUrl, '_blank');
          }
        }
      });
      return;
    }
    if (detailsUrl) {
      window.open(detailsUrl, '_blank');
    }
  }

  function showFileAccessNotice(detailsUrl) {
    pageNoticeController = NEWTAB_PAGE_NOTICE.renderPageNotice({
      params: pageSearchParams,
      chromeApi: chrome,
      document,
      windowObj: window,
      bottomDock,
      messages: {
        t,
        getRiSvg,
        detailsUrl
      },
      onClose: () => {
        pageNoticeController = null;
        clearPageNoticeQueryParam();
      },
      openExtensionDetailsPage
    });
  }

  function maybeShowFileAccessNotice() {
    const notice = String(pageSearchParams.get('notice') || '').trim();
    if (notice !== 'file-access') {
      return;
    }
    if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      clearPageNoticeQueryParam();
      return;
    }
    chrome.runtime.sendMessage({ action: 'getFileSchemeAccessStatus' }, (response) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        clearPageNoticeQueryParam();
        return;
      }
      if (!response || response.supported === false || response.allowed === true) {
        clearPageNoticeQueryParam();
        return;
      }
      showFileAccessNotice(response.detailsUrl || '');
    });
  }

  function getRecentLimit() {
    const normalized = normalizeRecentCount(currentRecentCount);
    if (normalized <= 0) {
      return 0;
    }
    const rows = Math.max(1, Math.round(normalized / 4));
    return rows * Math.max(1, getRecentGridColumnCount());
  }

  function getRecentSourceLimit() {
    const normalized = normalizeRecentCount(currentRecentCount);
    if (normalized <= 0) {
      return 0;
    }
    const rows = Math.max(1, Math.round(normalized / 4));
    const config = getNewtabWidthModeConfig();
    const maxColumns = Math.max(4, Number(config.recentMaxColumns || 4));
    return rows * maxColumns;
  }

  function applyBookmarkGridColumns() {
    if (!bookmarkGrid) {
      return false;
    }
    const previousColumns = Number.parseInt(bookmarkGrid.style.getPropertyValue('--x-nt-bookmark-columns'), 10);
    const columns = Math.max(1, getBookmarkGridColumnCount());
    bookmarkGrid.style.setProperty('--x-nt-bookmark-columns', String(columns));
    return previousColumns !== columns;
  }

  function keepBookmarkPageAnchorAfterLimitChange(previousLimit) {
    const prev = Math.max(1, Number.parseInt(previousLimit, 10) || 1);
    const next = Math.max(1, getBookmarkLimit());
    const firstVisibleIndex = Math.max(0, bookmarkCurrentPage * prev);
    bookmarkCurrentPage = Math.floor(firstVisibleIndex / next);
  }

  function applyRecentGridColumns() {
    if (!recentGrid) {
      return false;
    }
    const columns = getRecentGridColumnCount();
    const changed = currentRecentGridColumns !== columns;
    currentRecentGridColumns = columns;
    recentGrid.style.setProperty('--x-nt-recent-columns', String(columns));
    return changed;
  }

  function applyNewtabWidthMode() {
    if (layoutController && typeof layoutController.applyWidthMode === 'function') {
      layoutController.applyWidthMode(getNewtabWidthModeConfig());
    }
  }

  function updateNewtabSearchWidthLayout() {
    applyNewtabWidthMode();
    updateSuggestionsFloatingLayout();
    updateBookmarkSectionPosition();
  }

  function setNewtabSearchWidth(value, options) {
    const config = options || {};
    const nextWidth = normalizeNewtabSearchWidth(value, { allowNull: Boolean(config.allowNull) });
    const changed = currentNewtabSearchWidth !== nextWidth;
    currentNewtabSearchWidth = nextWidth;
    updateNewtabSearchWidthLayout();
    if (wallpaperRuntime && typeof wallpaperRuntime.updateSearchWidthUi === 'function') {
      wallpaperRuntime.updateSearchWidthUi();
    }
    if (config.persist && storageArea && nextWidth !== null) {
      storageArea.set({ [NEWTAB_SEARCH_WIDTH_STORAGE_KEY]: nextWidth });
    }
    return changed;
  }

  // 使用本地打包字体，避免外链字体依赖。
  let defaultSearchEngineState = {
    id: '',
    name: '',
    host: '',
    updatedAt: 0
  };

  const SEARCH_ENGINE_DEFS = [
    {
      id: 'google',
      name: 'Google',
      hostMatches: ['google.'],
      searchUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
    },
    {
      id: 'kagi',
      name: 'Kagi',
      hostMatches: ['kagi.com'],
      searchUrl: (query) => `https://kagi.com/search?q=${encodeURIComponent(query)}`
    },
    {
      id: 'bing',
      name: 'Bing',
      hostMatches: ['bing.com'],
      searchUrl: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`
    },
    {
      id: 'baidu',
      name: '百度',
      hostMatches: ['baidu.com'],
      searchUrl: (query) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
    },
    {
      id: 'duckduckgo',
      name: 'DuckDuckGo',
      hostMatches: ['duckduckgo.com'],
      searchUrl: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
    },
    {
      id: 'yahoo',
      name: 'Yahoo',
      hostMatches: ['search.yahoo.com'],
      searchUrl: (query) => `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`
    },
    {
      id: 'yandex',
      name: 'Yandex',
      hostMatches: ['yandex.com'],
      searchUrl: (query) => `https://yandex.com/search/?text=${encodeURIComponent(query)}`
    },
    {
      id: 'sogou',
      name: '搜狗',
      hostMatches: ['sogou.com'],
      searchUrl: (query) => `https://www.sogou.com/web?query=${encodeURIComponent(query)}`
    },
    {
      id: 'shenma',
      name: '神马',
      hostMatches: ['sm.cn'],
      searchUrl: (query) => `https://m.sm.cn/s?q=${encodeURIComponent(query)}`
    }
  ];

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

  function normalizeLocale(locale) {
    return SETTINGS.normalizeLocale(locale);
  }

  function localeToHtmlLang(locale) {
    return SETTINGS.localeToHtmlLang(locale);
  }

  function applyDocumentLanguage(locale) {
    if (!document.documentElement) {
      return;
    }
    document.documentElement.lang = localeToHtmlLang(locale);
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
    chrome.storage.local.get(keys, (localResult) => {
      const hasLocal = keys.some((key) => typeof localResult[key] !== 'undefined');
      if (!hasLocal) {
        return;
      }
      storageArea.get(keys, (syncResult) => {
        const missingSyncValues = {};
        keys.forEach((key) => {
          if (typeof localResult[key] !== 'undefined' && typeof syncResult[key] === 'undefined') {
            missingSyncValues[key] = localResult[key];
          }
        });
        const missingKeys = Object.keys(missingSyncValues);
        if (missingKeys.length === 0) {
          return;
        }
        storageArea.get(missingKeys, (latestSyncResult) => {
          const stillMissingSyncValues = {};
          missingKeys.forEach((key) => {
            if (typeof latestSyncResult[key] === 'undefined') {
              stillMissingSyncValues[key] = missingSyncValues[key];
            }
          });
          if (Object.keys(stillMissingSyncValues).length > 0) {
            storageArea.set(stillMissingSyncValues);
          }
        });
      });
    });
  }

  function getSystemLocale() {
    if (chrome && chrome.i18n && chrome.i18n.getUILanguage) {
      return normalizeLocale(chrome.i18n.getUILanguage());
    }
    return normalizeLocale(navigator.language || 'en');
  }

  function sanitizeDisplayText(text) {
    const raw = String(text || '');
    const withoutSpecial = raw.replace(/[\u0000-\u001F\u007F-\u009F\uFEFF\uFFF9-\uFFFD]|\p{Co}/gu, '');
    return withoutSpecial.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  }

  function loadLocaleMessages(locale) {
    const normalized = normalizeLocale(locale);
    const localePath = getExtensionResourceUrl(`_locales/${normalized}/messages.json`);
    return fetch(localePath, { cache: 'no-store' })
      .then((response) => response.json())
      .catch(() => ({}));
  }

  function t(key, fallback) {
    if (currentMessages && currentMessages[key] && currentMessages[key].message) {
      return currentMessages[key].message;
    }
    if (chrome && chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key);
      if (message) {
        return message;
      }
    }
    return fallback || '';
  }

  function finishNewtabEntryAnimation() {
    if (newtabEntryAnimationTimer) {
      window.clearTimeout(newtabEntryAnimationTimer);
      newtabEntryAnimationTimer = 0;
    }
    if (document.body && document.body.getAttribute('data-nt-enter') === 'run') {
      document.body.setAttribute('data-nt-enter', 'done');
      root.setAttribute('data-lumno-search-entry', 'done');
      if (resolveNewtabEntryAnimationReady) {
        resolveNewtabEntryAnimationReady();
        resolveNewtabEntryAnimationReady = null;
      }
    }
  }

  function startNewtabEntryAnimation() {
    if (!document.body) {
      return;
    }
    if (newtabEntryAnimationTimer) {
      window.clearTimeout(newtabEntryAnimationTimer);
      newtabEntryAnimationTimer = 0;
    }
    const reduceMotion = shouldSkipNewtabEntryMotion();
    const entryState = reduceMotion ? 'done' : 'run';
    document.body.setAttribute('data-nt-enter', entryState);
    root.setAttribute('data-lumno-search-entry', entryState);
    if (reduceMotion) {
      if (resolveNewtabEntryAnimationReady) {
        resolveNewtabEntryAnimationReady();
        resolveNewtabEntryAnimationReady = null;
      }
      return;
    }
    newtabEntryAnimationTimer = window.setTimeout(
      finishNewtabEntryAnimation,
      NEWTAB_ENTRY_ANIMATION_TOTAL_MS
    );
  }

  function revealNewtabWithoutEntryMotion() {
    if (!document.body) {
      return;
    }
    if (newtabReadySettleTimer) {
      window.clearTimeout(newtabReadySettleTimer);
      newtabReadySettleTimer = 0;
    }
    updateBookmarkSectionPosition({ releaseDockDensityLock: true });
    document.body.setAttribute('data-nt-enter', 'done');
    root.setAttribute('data-lumno-search-entry', 'done');
    finishWordmarkEntryAnimation();
    markNewtabStartupMilestone('ready-visible');
    document.body.setAttribute('data-nt-ready', '1');
    if (resolveNewtabEntryAnimationReady) {
      resolveNewtabEntryAnimationReady();
      resolveNewtabEntryAnimationReady = null;
    }
    rememberSearchEntryViewport();
  }

  function scheduleNewtabReadyAfterViewportSettle() {
    if (!newtabReadyRequested ||
        !document.body ||
        document.body.getAttribute('data-nt-ready') === '1') {
      return;
    }
    if (shouldSkipNewtabEntryMotion()) {
      revealNewtabWithoutEntryMotion();
      return;
    }
    if (newtabReadySettleTimer) {
      window.clearTimeout(newtabReadySettleTimer);
    }
    const viewport = getSearchEntryViewportSnapshot();
    const viewportRevision = newtabReadyViewportRevision;
    newtabReadySettleTimer = window.setTimeout(() => {
      newtabReadySettleTimer = 0;
      if (newtabResizeLayoutLocked ||
          viewportRevision !== newtabReadyViewportRevision ||
          hasSearchEntryViewportChanged(viewport)) {
        scheduleNewtabReadyAfterViewportSettle();
        return;
      }
      updateBookmarkSectionPosition({ releaseDockDensityLock: true });
      requestAnimationFrame(() => {
        if (newtabResizeLayoutLocked ||
            viewportRevision !== newtabReadyViewportRevision ||
            hasSearchEntryViewportChanged(viewport)) {
          scheduleNewtabReadyAfterViewportSettle();
          return;
        }
        markNewtabStartupMilestone('ready-visible');
        document.body.setAttribute('data-nt-ready', '1');
        startNewtabEntryAnimation();
        rememberSearchEntryViewport();
      });
    }, NEWTAB_INITIAL_VIEWPORT_SETTLE_MS);
  }

  function markNewtabReady() {
    if (!document.body) {
      return;
    }
    markNewtabStartupMilestone('ready-requested');
    newtabReadyRequested = true;
    scheduleNewtabReadyAfterViewportSettle();
  }

  function formatMessage(key, fallback, params) {
    let text = t(key, fallback);
    if (!params) {
      return text;
    }
    Object.keys(params).forEach((token) => {
      const value = params[token];
      text = text.replace(new RegExp(`\\{${token}\\}`, 'g'), value);
    });
    return text;
  }

  function getRiSvg(id, sizeClass, extraClass) {
    const size = sizeClass || 'ri-size-16';
    const extra = extraClass ? ` ${extraClass}` : '';
    return `<i class="ri-icon ${size}${extra} ${id}" aria-hidden="true"></i>`;
  }

  function normalizeFeedbackHttpsUrl(value) {
    return COMMUNITY_LINKS.normalizeHttpsUrl(value);
  }

  function loadFeedbackLinks(options) {
    const force = Boolean(options && options.force);
    if (!force && feedbackLinksLoaded) {
      return Promise.resolve(feedbackLinks);
    }
    return COMMUNITY_LINKS.load({ force })
      .then((links) => {
        feedbackLinks = links || LUMNO_FEEDBACK_LINKS_FALLBACK;
        feedbackLinksLoaded = true;
        return feedbackLinks;
      });
  }

  function getFeedbackWebLocale() {
    const locale = currentResolvedLocale ||
      (currentLanguageMode === 'system' ? getSystemLocale() : normalizeLocale(currentLanguageMode));
    if (locale === 'zh_CN') {
      return 'zh-CN';
    }
    if (locale === 'zh_TW') {
      return 'zh-TW';
    }
    if (locale === 'ja') {
      return 'ja';
    }
    return 'en';
  }

  function getFeedbackCommunityChannel(links) {
    return COMMUNITY_LINKS.getCommunityChannel(links, getFeedbackWebLocale());
  }

  function clearFeedbackRefreshResultTooltipTimer() {
    if (!feedbackRefreshResultTooltipTimer) {
      return;
    }
    window.clearTimeout(feedbackRefreshResultTooltipTimer);
    feedbackRefreshResultTooltipTimer = 0;
  }

  function buildFreshFeedbackQrUrl(value) {
    return COMMUNITY_LINKS.buildFreshQrUrl(value);
  }

  function preloadFeedbackQrImage(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(false);
        return;
      }
      const preloader = new Image();
      let settled = false;
      const finish = (loaded) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        preloader.onload = null;
        preloader.onerror = null;
        resolve(loaded);
      };
      const timeoutId = window.setTimeout(() => {
        finish(false);
      }, LUMNO_FEEDBACK_QR_REFRESH_TIMEOUT_MS);
      preloader.onload = () => {
        finish(true);
      };
      preloader.onerror = () => {
        finish(false);
      };
      preloader.src = url;
    });
  }

  function buildFeedbackReactModel() {
    const links = feedbackLinks || LUMNO_FEEDBACK_LINKS_FALLBACK;
    const channel = getFeedbackCommunityChannel(links);
    return {
      buttonLabel: t('newtab_feedback_button_aria', 'Send feedback'),
      channel,
      chromeReviewLabel: t('newtab_feedback_chrome_review_label', 'Chrome rating'),
      chromeReviewTooltip: t(
        'newtab_feedback_chrome_review_tooltip',
        'Rate on Chrome Web Store'
      ),
      chromeReviewUrl: links.chromeReview || LUMNO_FEEDBACK_LINKS_FALLBACK.chromeReview,
      closeTooltip: t('newtab_feedback_wechat_close_tooltip', 'Close'),
      communityLabel: channel === 'wechat'
        ? t('newtab_feedback_wechat_label', 'WeChat')
        : t('newtab_feedback_discord_label', 'Discord'),
      communityTooltip: channel === 'wechat'
        ? t('newtab_feedback_wechat_tooltip', 'Joining WeChat group')
        : t('newtab_feedback_discord_tooltip', 'Joining Discord'),
      discordUrl: links.discord || LUMNO_FEEDBACK_LINKS_FALLBACK.discord,
      githubIssueLabel: t('newtab_feedback_github_issue_label', 'GitHub Issue'),
      githubIssueTooltip: t(
        'newtab_feedback_github_issue_tooltip',
        'Opening a GitHub Issue'
      ),
      githubIssueUrl: links.githubIssue || LUMNO_FEEDBACK_LINKS_FALLBACK.githubIssue,
      menuAriaLabel: t('newtab_feedback_menu_aria', 'Feedback channels'),
      panelTitle: channel === 'wechat'
        ? t('newtab_feedback_wechat_panel_title', 'Bug reports & feature requests')
        : t('newtab_feedback_discord_label', 'Discord'),
      qrAlt: t('newtab_feedback_wechat_qr_alt', 'Lumno WeChat group QR code'),
      qrUrl: links.wechatQr || LUMNO_FEEDBACK_LINKS_FALLBACK.wechatQr,
      refreshTooltip: t('newtab_feedback_wechat_refresh_tooltip', 'Refresh QR code'),
      xLabel: t('newtab_feedback_x_label', 'X'),
      xTooltip: t('newtab_feedback_x_tooltip', 'Contacting on X'),
      xUrl: links.x || LUMNO_FEEDBACK_LINKS_FALLBACK.x
    };
  }

  function syncFeedbackReactElementReferences() {
    if (!feedbackControl) {
      return;
    }
    feedbackButton = feedbackControl.querySelector('.x-nt-feedback-button');
  }

  function renderFeedbackControlWithReact() {
    if (!feedbackReactController ||
        typeof feedbackReactController.render !== 'function') {
      return false;
    }
    feedbackReactController.render(buildFeedbackReactModel());
    syncFeedbackReactElementReferences();
    return true;
  }

  function updateFeedbackContactUi() {
    renderFeedbackControlWithReact();
  }

  function openFeedbackExternalUrl(url, disposition) {
    const safeUrl = normalizeFeedbackHttpsUrl(url);
    if (!safeUrl) {
      return false;
    }
    return openExternalNewTabUrl(safeUrl, disposition || 'newTab');
  }

  function updateFeedbackLanguageStrings() {
    renderFeedbackControlWithReact();
  }

  function isFeedbackPopoverOpen() {
    return feedbackReactController.isOpen();
  }

  function closeFeedbackPopover(options) {
    setFeedbackPopoverOpen(false, options);
  }

  function setFeedbackPopoverOpen(open, options) {
    if (!open) {
      clearFeedbackRefreshResultTooltipTimer();
      hideTopActionTooltip();
    }
    if (open) {
      feedbackReactController.setOpen(true);
    } else {
      feedbackReactController.close(options);
    }
  }

  function createFeedbackControls() {
    feedbackControl = document.createElement('div');
    feedbackReactController =
      NEWTAB_FEEDBACK_CONTROL.createFeedbackControlController(
        feedbackControl,
        {
          onHideTooltip() {
            clearFeedbackRefreshResultTooltipTimer();
            hideTopActionTooltip();
          },
          onOpen() {
            return loadFeedbackLinks({ force: true }).then(() => {
              renderFeedbackControlWithReact();
            });
          },
          onOpenExternal(url, disposition) {
            openFeedbackExternalUrl(url, disposition);
          },
          async onRefreshQr() {
            try {
              const links = await loadFeedbackLinks({ force: true });
              feedbackLinks = links || feedbackLinks;
              const channel = getFeedbackCommunityChannel(feedbackLinks);
              if (channel !== 'wechat') {
                renderFeedbackControlWithReact();
                return {};
              }
              const refreshedUrl = buildFreshFeedbackQrUrl(
                feedbackLinks.wechatQr ||
                  LUMNO_FEEDBACK_LINKS_FALLBACK.wechatQr
              );
              const loaded = await preloadFeedbackQrImage(refreshedUrl);
              return loaded
                ? {
                    message: t(
                      'newtab_feedback_wechat_refresh_success',
                      'Latest QR code loaded'
                    ),
                    qrUrl: refreshedUrl
                  }
                : {
                    message: t(
                      'newtab_feedback_wechat_refresh_error',
                      'Could not refresh. Try again.'
                    )
                  };
            } catch (error) {
              return {
                message: t(
                  'newtab_feedback_wechat_refresh_error',
                  'Could not refresh. Try again.'
                )
              };
            }
          },
          onShowTooltip(target, label) {
            showTopActionTooltip(target, label, {
              checkActive: false,
              placement: 'top'
            });
          }
        }
      );
    renderFeedbackControlWithReact();
  }

  function createWallpaperAdaptiveToneTargets() {
    const bookmarkPager = bookmarkPagerPrevButton && bookmarkPagerPrevButton.parentElement
      ? bookmarkPagerPrevButton.parentElement
      : null;
    const shortcutToneTargets = shortcutTiles.map((tile) => ({
      element: tile,
      sampleElement: getShortcutDockIcon(tile) || tile,
      minWidth: 42,
      minHeight: 42,
      iconButton: true,
      forcedIconBackground: 'shortcut-fallback'
    }));
    if (addShortcutButton) {
      shortcutToneTargets.push({
        element: addShortcutButton,
        sampleElement: getShortcutDockIcon(addShortcutButton) || addShortcutButton,
        minWidth: 42,
        minHeight: 42,
        iconButton: true,
        forcedIconBackground: 'shortcut-add'
      });
    }
    return [
      {
        element: bookmarkTopbarRuntime && bookmarkTopbarRuntime.element,
        sampleElement: bookmarkTopbarRuntime && bookmarkTopbarRuntime.element,
        minWidth: 280,
        minHeight: 64,
        surface: 'topbar',
        preferOverlayPolarity: getEffectiveBookmarkTopbarSurfaceMode() === 'adaptive',
        disabled: !isBookmarkTopbarMode() ||
          getEffectiveBookmarkTopbarSurfaceMode() === 'custom'
      },
      {
        element: topContentContainer,
        sampleElement: topContentController && typeof topContentController.getContent === 'function'
          ? (topContentController.getContent() || topContentContainer)
          : (wordmarkImageEl || topContentContainer),
        minWidth: 220,
        minHeight: 72
      },
      {
        element: quoteRuntime && quoteRuntime.element,
        sampleElement: quoteRuntime && quoteRuntime.element,
        minWidth: 240,
        minHeight: 32
      },
      {
        element: bookmarkTitleWrap,
        sampleElement: bookmarkTitleWrap,
        minWidth: 112,
        minHeight: 44
      },
      // The display-mode trigger is appended to bookmarkPager in the regular
      // section layout. Keep it on the pager's shared tone target so one
      // visual toolbar does not split into independently sampled colors.
      {
        element: bookmarkPager,
        sampleElement: bookmarkPager,
        minWidth: 92,
        minHeight: 42,
        iconButton: true
      },
      {
        element: recentHeader,
        sampleElement: recentHeader,
        minWidth: 112,
        minHeight: 44
      },
      {
        element: recentModeMenu && recentModeMenu.control,
        sampleElement: recentModeMenu && (recentModeMenu.trigger || recentModeMenu.control),
        minWidth: 42,
        minHeight: 42,
        iconButton: true
      },
      {
        element: feedbackButton,
        sampleElement: feedbackButton,
        minWidth: 42,
        minHeight: 42,
        iconButton: true
      },
      {
        element: BOOKMARK_CASCADE_DEBUG_UI_ENABLED && bookmarkCascadeRuntime && bookmarkCascadeRuntime.getDebugButton(),
        sampleElement: BOOKMARK_CASCADE_DEBUG_UI_ENABLED && bookmarkCascadeRuntime && bookmarkCascadeRuntime.getDebugButton(),
        minWidth: 42,
        minHeight: 42,
        iconButton: true
      }
    ].concat(shortcutToneTargets);
  }

  quoteRuntime = globalThis.LumnoNewtabQuotes.createRuntime({
    documentObj: document, windowObj: window, chromeObj: chrome,
    storageArea, localStorageArea, t, showToast,
    getSearchRoot: () => root,
    getShortcutSection: () => shortcutSection,
    isPreferenceArea: (areaName) => providerStorageRuntime
      ? providerStorageRuntime.isActiveAreaName(areaName) : areaName === 'sync',
    onLayout: () => window.requestAnimationFrame(() => {
      updateBookmarkSectionPosition();
      scheduleWallpaperAdaptiveToneUpdate();
    })
  });
  wallpaperRuntime = NEWTAB_WALLPAPER.createWallpaperRuntime({
    documentObj: document,
    windowObj: window,
    chromeObj: chrome,
    extensionRoutes: EXTENSION_ROUTES,
    storageArea,
    localWallpaperStorageArea: localStorageArea,
    getQuoteRuntime: () => quoteRuntime,
    storageKeys: {
      wallpaper: NEWTAB_WALLPAPER_STORAGE_KEY,
      localWallpaper: NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY,
      overlay: NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY,
      effect: NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
      topContentMode: NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
      timeFontWeight: NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
      timeSecondsVisible: NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
      favicon: NEWTAB_FAVICON_STORAGE_KEY
    },
    searchWidthConfig: NEWTAB_SEARCH_WIDTH_CONFIG,
    t,
    formatMessage,
    getThemeMode: getSelectedThemeMode,
    getEffectiveThemeMode: getScopedThemeMode,
    getThemeScope,
    setThemeMode,
    setThemeScope,
    getRiSvg,
    showToast,
    showTopActionTooltip,
    hideTopActionTooltip,
    applyWordmarkThemeAppearance,
    getTopContentMode: () => newtabTopContentMode,
    setTopContentMode: (value) => {
      setNewtabTopContentMode(value);
    },
    getTimeFontWeight: () => newtabTimeFontWeight,
    setTimeFontWeight: setNewtabTimeFontWeight,
    getTimeSecondsVisible: () => newtabTimeSecondsVisible,
    setTimeSecondsVisible: setNewtabTimeSecondsVisible,
    getSearchWidth: getEffectiveNewtabSearchWidth,
    setSearchWidth: (value, options) => {
      setNewtabSearchWidth(value, options);
    },
    shortcutColumnsConfig: {
      min: NEWTAB_SHORTCUT_COLUMNS_MIN,
      max: NEWTAB_SHORTCUT_COLUMNS_MAX,
      fallback: NEWTAB_SHORTCUT_COLUMNS_DEFAULT
    },
    shortcutSizeConfig: {
      min: NEWTAB_SHORTCUT_SIZE_MIN,
      max: NEWTAB_SHORTCUT_SIZE_MAX,
      fallback: NEWTAB_SHORTCUT_SIZE_DEFAULT
    },
    shortcutGapConfig: {
      min: NEWTAB_SHORTCUT_GAP_MIN,
      max: NEWTAB_SHORTCUT_GAP_MAX,
      fallback: NEWTAB_SHORTCUT_GAP_DEFAULT
    },
    getShortcutsVisible: () => newtabShortcutsVisible,
    setShortcutsVisible: setNewtabShortcutsVisible,
    getShortcutAddVisible: () => newtabShortcutAddVisible,
    setShortcutAddVisible: setNewtabShortcutAddVisible,
    getShortcutDockMagnificationEnabled: () => newtabShortcutDockMagnificationEnabled,
    setShortcutDockMagnificationEnabled: setNewtabShortcutDockMagnificationEnabled,
    getShortcutColumns: () => newtabShortcutColumns,
    setShortcutColumns: setNewtabShortcutColumns,
    getShortcutSize: () => newtabShortcutSize,
    setShortcutSize: setNewtabShortcutSize,
    getShortcutGap: () => newtabShortcutGap,
    setShortcutGap: setNewtabShortcutGap,
    featureHints: FEATURE_HINTS,
    inputAutoFocusReady: initialNewtabInputAutoFocusReadyTask,
    inputAutoFocusVisibilityGate: newtabEntryAnimationReadyPromise,
    getInputAutoFocusEnabled: () => newtabInputAutoFocusEnabled,
    setInputAutoFocusEnabled: setNewtabInputAutoFocusEnabled,
    getInputAutoFocusHintAnchor: () => inputParts && inputParts.container,
    getAdaptiveToneTargets: createWallpaperAdaptiveToneTargets,
    view: NEWTAB_WALLPAPER_VIEW
  });

  function updateWallpaperLanguageStrings() {
    if (wallpaperRuntime) {
      wallpaperRuntime.updateLanguageStrings();
    }
  }

  function updateWallpaperAppearanceSelectionUi() {
    if (wallpaperRuntime) {
      wallpaperRuntime.updateAppearanceSelectionUi();
    }
  }

  function bootstrapInitialWallpaper() {
    if (!wallpaperRuntime) {
      return Promise.resolve();
    }
    return bootstrapInitialThemeMode().then(() => wallpaperRuntime.bootstrapInitialWallpaper());
  }

  function bootstrapInitialWallpaperOverlay() {
    return wallpaperRuntime ? wallpaperRuntime.bootstrapInitialWallpaperOverlay() : Promise.resolve();
  }

  function bootstrapInitialWallpaperEffect() {
    return wallpaperRuntime ? wallpaperRuntime.bootstrapInitialWallpaperEffect() : Promise.resolve();
  }

  function waitForInitialWallpaperEffectVisual() {
    return wallpaperRuntime && typeof wallpaperRuntime.waitForInitialWallpaperEffectVisual === 'function'
      ? wallpaperRuntime.waitForInitialWallpaperEffectVisual()
      : Promise.resolve();
  }

  function markInitialWallpaperVisualReady() {
    if (document.body) {
      document.body.setAttribute('data-nt-wallpaper-ready', '1');
    }
  }

  function bootstrapInitialNewtabFavicon() {
    return wallpaperRuntime && typeof wallpaperRuntime.bootstrapInitialNewtabFavicon === 'function'
      ? wallpaperRuntime.bootstrapInitialNewtabFavicon()
      : Promise.resolve();
  }

  function createWallpaperControls() {
    if (!wallpaperRuntime) {
      return;
    }
    wallpaperRuntime.createControls();
    wallpaperControl = wallpaperRuntime.getControlElement();
  }

  function isWallpaperPanelOpen() {
    return wallpaperRuntime ? wallpaperRuntime.isPanelOpen() : false;
  }

  function closeWallpaperPanel(options) {
    if (wallpaperRuntime) {
      wallpaperRuntime.closePanel(options);
    }
  }

  function scheduleWallpaperAdaptiveToneUpdate() {
    if (wallpaperRuntime) {
      wallpaperRuntime.scheduleAdaptiveToneUpdate();
    }
  }

  function getSearchEngineById(id) {
    if (!id) {
      return null;
    }
    return SEARCH_ENGINE_DEFS.find((engine) => engine.id === id) || null;
  }

  function buildDefaultSearchUrl(query) {
    const engine = getSearchEngineById(defaultSearchEngineState.id);
    if (engine && typeof engine.searchUrl === 'function') {
      return engine.searchUrl(query);
    }
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function getDefaultSearchEngineThemeUrl() {
    const engine = getSearchEngineById(defaultSearchEngineState.id);
    if (engine && typeof engine.searchUrl === 'function') {
      return engine.searchUrl('test');
    }
    return 'https://www.google.com';
  }

  function getDefaultSearchEngineFaviconUrl() {
    return getPageFaviconCandidateUrl(getDefaultSearchEngineThemeUrl());
  }

  function getSearchActionLabel() {
    return t('action_search', '搜索');
  }

  function loadDefaultSearchEngineState() {
    if (!storageArea) {
      return;
    }
    storageArea.get([DEFAULT_SEARCH_ENGINE_STORAGE_KEY], (result) => {
      const stored = result ? result[DEFAULT_SEARCH_ENGINE_STORAGE_KEY] : null;
      if (stored && stored.id &&
          (!SEARCH_UTILS.isRetiredSearchEngineState(stored))) {
        defaultSearchEngineState = stored;
      }
    });
  }

  function updateRecentHeading() {
    if (!recentHeading) {
      return;
    }
    const key = currentRecentMode === 'most' ? 'recent_heading_most' : 'recent_heading_latest';
    const fallback = currentRecentMode === 'most' ? 'Most visited' : 'Recent visits';
    recentHeading.textContent = t(key, fallback);
  }

  function updateRecentModeMenu() {
    if (recentModeMenu && typeof recentModeMenu.update === 'function') {
      recentModeMenu.update();
    }
  }

  function setRecentMode(nextMode) {
    const mode = normalizeRecentMode(nextMode, 'latest');
    if (currentRecentMode === mode) {
      updateRecentModeMenu();
      return;
    }
    currentRecentMode = mode;
    updateRecentHeading();
    updateRecentModeMenu();
    if (storageArea) {
      storageArea.set({ [RECENT_MODE_STORAGE_KEY]: mode });
    }
    markRecentDataDirty();
    loadRecentSites({ force: true });
  }

  function canDismissRecentCard() {
    return true;
  }

  function updateBookmarkHeading() {
    if (!bookmarkHeading) {
      return;
    }
    bookmarkHeading.textContent = t('bookmarks_heading', '书签');
  }

  function isBookmarkTopbarMode() {
    return currentBookmarkViewMode === 'top';
  }

  function getNewtabTopOccupiedInsetPx() {
    const visualViewportTopInset = getNewtabVisualViewportInsets().top;
    const bookmarkTopbarInset = document.body &&
      document.body.getAttribute('data-nt-top-occupied') === 'true'
      ? BOOKMARK_TOPBAR_HEIGHT_PX
      : 0;
    return visualViewportTopInset + bookmarkTopbarInset;
  }

  function getNewtabViewportTopPaddingPx() {
    return getNewtabTopOccupiedInsetPx() + Math.min(8, NEWTAB_FLOATING_TOP_GAP_PX);
  }

  function getBookmarkCascadeViewportTopPaddingPx() {
    const occupiedTopInset = getNewtabTopOccupiedInsetPx();
    return occupiedTopInset > 0
      ? occupiedTopInset + BOOKMARK_CASCADE_TOPBAR_GAP_PX
      : 8;
  }

  function setNewtabTopOccupied(occupied) {
    if (!document.body) {
      return;
    }
    const nextValue = occupied === true ? 'true' : 'false';
    if (document.body.getAttribute('data-nt-top-occupied') === nextValue) {
      return;
    }
    document.body.setAttribute('data-nt-top-occupied', nextValue);
    updateSearchEntryLayout();
    if (bookmarkCascadeRuntime &&
        typeof bookmarkCascadeRuntime.positionLevels === 'function' &&
        bookmarkCascadeRuntime.isOpen()) {
      bookmarkCascadeRuntime.positionLevels();
    }
  }

  function syncBookmarkSurfaceMode() {
    if (!bookmarkTopbarRuntime) {
      return;
    }
    if (isBookmarkTopbarMode()) {
      bookmarkTopbarRuntime.activate();
      setContentSectionVisible(bookmarkSection, false);
      bookmarkTopbarRuntime.setVisible(
        bookmarkCards.length > 0 && currentBookmarkCount > 0
      );
    } else {
      bookmarkTopbarRuntime.deactivate();
      setContentSectionVisible(
        bookmarkSection,
        bookmarkCards.length > 0 && currentBookmarkCount > 0
      );
    }
  }

  function setBookmarkSurfaceVisible(visible) {
    const nextVisible = visible === true;
    if (isBookmarkTopbarMode()) {
      setContentSectionVisible(bookmarkSection, false);
      if (bookmarkTopbarRuntime) {
        bookmarkTopbarRuntime.setVisible(nextVisible && !zenModeEnabled);
      }
      return;
    }
    if (bookmarkTopbarRuntime) {
      bookmarkTopbarRuntime.setVisible(false);
    }
    setContentSectionVisible(bookmarkSection, nextVisible);
  }

  function updateBookmarkModeMenu() {
    if (bookmarkModeMenu && typeof bookmarkModeMenu.update === 'function') {
      bookmarkModeMenu.update();
    }
    if (bookmarkGrid) {
      bookmarkGrid.setAttribute('data-view-mode', currentBookmarkViewMode);
    }
    if (document.body) {
      document.body.setAttribute('data-bookmark-view-mode', currentBookmarkViewMode);
    }
    syncBookmarkSurfaceMode();
  }

  function applyBookmarkViewMode(nextMode, options) {
    const config = options && typeof options === 'object' ? options : {};
    if (Object.prototype.hasOwnProperty.call(config, 'expectedRevision') &&
        config.expectedRevision !== bookmarkViewModeRevision) {
      return {
        applied: false,
        changed: false,
        mode: currentBookmarkViewMode,
        revision: bookmarkViewModeRevision
      };
    }
    const mode = normalizeBookmarkViewMode(nextMode);
    const changed = currentBookmarkViewMode !== mode;
    if (!changed) {
      updateBookmarkModeMenu();
      if (config.ensureLoaded === true && !bookmarkLoadedOnce) {
        bookmarkCurrentPage = 0;
        bookmarkRenderSignature = '';
        markBookmarkDataDirty();
        loadBookmarks(config.force === true ? { force: true } : undefined);
      }
      return {
        applied: true,
        changed: false,
        mode,
        revision: bookmarkViewModeRevision
      };
    }
    closeBookmarkCascadeMenu();
    currentBookmarkViewMode = mode;
    bookmarkViewModeRevision += 1;
    if (mode === 'top') {
      bookmarkCurrentFolderId = bookmarkRootFolderId;
    }
    bookmarkCurrentPage = 0;
    bookmarkRenderSignature = '';
    updateBookmarkModeMenu();
    if (config.persist === true) {
      persistBookmarkViewMode(mode);
    }
    markBookmarkDataDirty();
    loadBookmarks(config.force === true ? { force: true } : undefined);
    return {
      applied: true,
      changed: true,
      mode,
      revision: bookmarkViewModeRevision
    };
  }

  function setBookmarkViewMode(nextMode) {
    return applyBookmarkViewMode(nextMode, {
      persist: true,
      force: true
    });
  }

  function navigateBookmarkFolder(targetId) {
    const id = String(targetId || '').trim();
    if (!id) {
      return;
    }
    closeBookmarkCascadeMenu();
    bookmarkCurrentFolderId = id;
    bookmarkCurrentPage = 0;
    bookmarkRenderSignature = '';
    loadBookmarks({ force: true });
  }

  function updateBookmarkHeadingRootLinkState(isNested) {
    if (!bookmarkHeading) {
      return;
    }
    const nested = !!isNested;
    const rootLabel = t('bookmarks_heading', '书签');
    bookmarkHeading.setAttribute('data-bookmark-drop-folder-id', String(bookmarkRootFolderId || '1'));
    bookmarkHeading.setAttribute('data-bookmark-drop-folder-title', rootLabel);
    bookmarkHeading.classList.toggle('x-nt-bookmarks-heading--link', nested);
    bookmarkHeading._xCanNavigateRoot = nested;
    if (nested) {
      bookmarkHeading.setAttribute('role', 'button');
      bookmarkHeading.setAttribute('tabindex', '0');
      bookmarkHeading.setAttribute('aria-label', rootLabel);
      bookmarkHeading.title = rootLabel;
    } else {
      bookmarkHeading.removeAttribute('role');
      bookmarkHeading.removeAttribute('tabindex');
      bookmarkHeading.removeAttribute('aria-label');
      bookmarkHeading.removeAttribute('data-bookmark-drop-target');
      bookmarkHeading.title = '';
    }
  }

  function updateBookmarkPagerLabels() {
    if (bookmarkPagerPrevButton) {
      const prevLabel = t('bookmarks_page_prev', '上一页');
      bookmarkPagerPrevButton.setAttribute('aria-label', prevLabel);
      bookmarkPagerPrevButton.setAttribute('data-tooltip', prevLabel);
      bookmarkPagerPrevButton.removeAttribute('title');
    }
    if (bookmarkPagerNextButton) {
      const nextLabel = t('bookmarks_page_next', '下一页');
      bookmarkPagerNextButton.setAttribute('aria-label', nextLabel);
      bookmarkPagerNextButton.setAttribute('data-tooltip', nextLabel);
      bookmarkPagerNextButton.removeAttribute('title');
    }
    if (bookmarkOpenManagerButton) {
      const managerLabel = t('bookmarks_open_manager', '打开书签管理页');
      bookmarkOpenManagerButton.setAttribute('aria-label', managerLabel);
      bookmarkOpenManagerButton.setAttribute('data-tooltip', managerLabel);
      bookmarkOpenManagerButton.removeAttribute('title');
    }
  }

  function bindBookmarkPagerTooltip(button, getLabel) {
    if (!button || typeof getLabel !== 'function') {
      return;
    }
    const showTooltip = () => {
      const label = String(getLabel() || '').trim();
      if (!label) {
        return;
      }
      const inTopbar = Boolean(
        bookmarkTopbarRuntime &&
        bookmarkTopbarRuntime.element &&
        bookmarkTopbarRuntime.element.contains(button)
      );
      showTopActionTooltip(button, label, { placement: inTopbar ? 'bottom' : 'top' });
    };
    button.addEventListener('pointerenter', showTooltip);
    button.addEventListener('pointerleave', hideTopActionTooltip);
    button.addEventListener('focus', showTooltip);
    button.addEventListener('blur', hideTopActionTooltip);
  }

  function updateBookmarkBreadcrumb() {
    if (!bookmarkBreadcrumbController) {
      return;
    }
    const path = Array.isArray(bookmarkFolderPath) ? bookmarkFolderPath : [];
    if (path.length <= 1) {
      bookmarkBreadcrumbController.render({ items: [] });
      updateBookmarkHeadingRootLinkState(false);
      return;
    }
    updateBookmarkHeadingRootLinkState(true);
    bookmarkBreadcrumbController.render({
      items: path.slice(1).map((crumb) => {
      const title = String(crumb && crumb.title ? crumb.title : '').trim() || t('bookmarks_heading', '书签');
        return {
          id: String(crumb && crumb.id ? crumb.id : ''),
          title
        };
      })
    });
  }

  function applyLanguageStrings() {
    document.title = t('newtab_page_title', 'New Tab');
    if (topContentController && newtabTopContentMode === 'time') {
      renderNewtabTopContent(false);
    }
    updateRecentHeading();
    updateBookmarkHeading();
    updateBookmarkPagerLabels();
    if (bookmarkTopbarRuntime) {
      bookmarkTopbarRuntime.updateLanguage(t('bookmark_view_mode_top', 'Top bookmarks bar'));
    }
    updateBookmarkBreadcrumb();
    updateRecentModeMenu();
    updateBookmarkModeMenu();
    updateWallpaperLanguageStrings();
    if (quoteRuntime) quoteRuntime.updateLanguage();
    updateWallpaperAppearanceSelectionUi();
    updateFeedbackLanguageStrings();
    updateShortcutLanguageStrings();
    if (inputModeController &&
        typeof inputModeController.refreshModeMenuLanguage === 'function') {
      inputModeController.refreshModeMenuLanguage();
    }
    if (updateNoticeController &&
        typeof updateNoticeController.updateLanguage === 'function') {
      updateNoticeController.updateLanguage();
    }
    if (engagementNoticeController &&
        typeof engagementNoticeController.updateLanguage === 'function') {
      engagementNoticeController.updateLanguage();
    }
    if (inputParts && inputParts.input) {
      defaultPlaceholderText = t('search_placeholder', defaultPlaceholderText);
      if (!siteSearchState && !localSearchScopeState) {
        inputParts.input.placeholder = defaultPlaceholderText;
      }
      if (localSearchScopeState) {
        setLocalSearchScopePrefix(localSearchScopeState);
      }
    }
    updateModeBadge(inputParts && inputParts.input ? inputParts.input.value : '');
    recentCards.forEach((card) => {
      if (!card || !card._xActionText || !card._xTitleText) {
        return;
      }
      card._xActionText.textContent = t('action_go_current_tab', '前往');
      card.setAttribute('aria-label', formatMessage('open_prefix', '打开 {title}', {
        title: card._xTitleText
      }));
    });
    bookmarkCards.forEach((card) => {
      if (!card || !card._xTitleText) {
        return;
      }
      card.setAttribute('aria-label', formatMessage('open_prefix', '打开 {title}', {
        title: card._xTitleText
      }));
    });
    if (latestQuery && latestQuery.trim()) {
      renderSuggestions(lastSuggestionResponse, latestQuery);
    }
  }

  function applyLanguageMode(mode) {
    const requestId = ++languageApplyRequestId;
    currentLanguageMode = mode || 'system';
    const targetLocale = currentLanguageMode === 'system' ? getSystemLocale() : normalizeLocale(currentLanguageMode);
    currentResolvedLocale = targetLocale;
    applyDocumentLanguage(targetLocale);
    const finalizeLanguageInit = () => {
      if (initialLanguageApplied) {
        return;
      }
      initialLanguageApplied = true;
      if (typeof resolveInitialLanguageReady === 'function') {
        resolveInitialLanguageReady();
      }
    };
    const applyResolvedMessages = (messages) => {
      if (requestId !== languageApplyRequestId) {
        return;
      }
      currentMessages = messages || {};
      applyLanguageStrings();
      forceReloadRecentSitesForI18n();
      finalizeLanguageInit();
    };
    loadLocaleMessages(targetLocale).then(applyResolvedMessages);
  }

  function refreshShortcutTileThemes() {
    shortcutTiles.forEach((tile) => {
      if (!tile) {
        return;
      }
      applyShortcutTileTheme(tile, tile._xTheme, tile._xHost || '');
    });
  }

  function refreshFallbackIcons() {
    if (faviconViewRuntime && typeof faviconViewRuntime.refreshFallbackIcons === 'function') {
      faviconViewRuntime.refreshFallbackIcons();
    }
  }

  function refreshThemeAwareFavicons() {
    if (faviconViewRuntime && typeof faviconViewRuntime.refreshThemeAwareFavicons === 'function') {
      faviconViewRuntime.refreshThemeAwareFavicons();
    }
  }

  function scheduleThemeAwareFaviconRescue() {
    if (faviconViewRuntime && typeof faviconViewRuntime.scheduleThemeAwareFaviconRescue === 'function') {
      faviconViewRuntime.scheduleThemeAwareFaviconRescue();
    }
  }

  function applyThemeMode(mode, options) {
    const previousThemeMode = currentThemeMode;
    currentThemeMode = normalizeThemeMode(mode);
    const mediaMatchesOverride = options && typeof options.mediaMatches === 'boolean'
      ? options.mediaMatches
      : null;
    const previousResolved = document.body ? document.body.getAttribute('data-theme') : '';
    const resolved = resolveTheme(mode, mediaMatchesOverride);
    document.body.setAttribute('data-theme', resolved);
    syncBookmarkTopbarSurfaceColorForTheme(resolved);
    if (document.documentElement) {
      document.documentElement.removeAttribute('data-wallpaper-preload-theme');
      document.documentElement.style.colorScheme = resolved;
    }
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', resolved === 'dark' ? '#111111' : '#ffffff');
    }
    applyWordmarkThemeAppearance(resolved);
    const didResolvedThemeChange = previousResolved !== resolved;
    suggestionItems.forEach((item) => {
      if (item && item._xTheme) {
        applyThemeVariables(item, item._xTheme);
      }
    });
    recentCards.forEach((card) => {
      if (!card) {
        return;
      }
      applyRecentCardTheme(card, card._xTheme, card._xHost || '');
    });
    bookmarkCards.forEach((card) => {
      if (!card) {
        return;
      }
      // 文件夹卡片通常没有 host/theme，也需要在主题切换时重算阴影与变量。
      applyBookmarkCardTheme(card, card._xTheme, card._xHost || '');
    });
    refreshShortcutTileThemes();
    applyLanguageStrings();
    updateSelection();
    updateModeBadge(inputParts && inputParts.input ? inputParts.input.value : '');
    refreshFallbackIcons();
    if (didResolvedThemeChange) {
      refreshThemeAwareFavicons();
      scheduleThemeAwareFaviconRescue();
    }
    if ((didResolvedThemeChange || previousThemeMode !== currentThemeMode) &&
        wallpaperRuntime && typeof wallpaperRuntime.handleThemeModeChange === 'function') {
      wallpaperRuntime.handleThemeModeChange();
    }
    if (!initialThemeApplied) {
      initialThemeApplied = true;
      if (typeof resolveInitialThemeReady === 'function') {
        resolveInitialThemeReady();
      }
    }
    if (mode === 'system' && !mediaListenerAttached) {
      mediaListenerAttached = addMediaQueryChangeListener(mediaQuery, handleMediaChange);
    }
    if (mode !== 'system' && mediaListenerAttached) {
      removeMediaQueryChangeListener(mediaQuery, handleMediaChange);
      mediaListenerAttached = false;
    }
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function normalizeThemeMode(value) {
    if (value === 'light' || value === 'dark') {
      return value;
    }
    return 'system';
  }

  function normalizeNewtabThemeMode(value) {
    if (value === 'light' || value === 'dark') {
      return value;
    }
    return 'global';
  }

  function normalizeNewtabThemeScope(value) {
    return value === 'home' ? 'home' : 'global';
  }

  function isNewtabThemeFollowingGlobal() {
    return newtabThemeMode === 'global';
  }

  function getScopedThemeMode() {
    return isNewtabThemeFollowingGlobal() ? globalThemeMode : newtabThemeMode;
  }

  function getSelectedThemeMode() {
    if (newtabThemeScope !== 'home') {
      return globalThemeMode;
    }
    return isNewtabThemeFollowingGlobal() ? 'system' : newtabThemeMode;
  }

  function applyScopedThemeMode(options) {
    applyThemeMode(getScopedThemeMode(), options);
  }

  function bootstrapInitialThemeMode() {
    if (hasThemeBootstrapStarted) {
      return initialThemeReadyPromise;
    }
    hasThemeBootstrapStarted = true;
    if (!storageArea) {
      globalThemeMode = 'system';
      newtabThemeMode = 'global';
      newtabThemeScope = 'global';
      applyScopedThemeMode();
      return initialThemeReadyPromise;
    }
    storageArea.get([
      THEME_STORAGE_KEY,
      NEWTAB_THEME_MODE_STORAGE_KEY,
      NEWTAB_THEME_SCOPE_STORAGE_KEY
    ], (result) => {
      globalThemeMode = normalizeThemeMode(result ? result[THEME_STORAGE_KEY] : 'system');
      newtabThemeMode = normalizeNewtabThemeMode(result ? result[NEWTAB_THEME_MODE_STORAGE_KEY] : 'global');
      newtabThemeScope = normalizeNewtabThemeScope(result ? result[NEWTAB_THEME_SCOPE_STORAGE_KEY] : 'global');
      applyScopedThemeMode();
    });
    return initialThemeReadyPromise;
  }

  function bootstrapInitialLanguageMode() {
    if (hasLanguageBootstrapStarted) {
      return initialLanguageReadyPromise;
    }
    hasLanguageBootstrapStarted = true;
    if (!storageArea) {
      applyLanguageMode('system');
      return initialLanguageReadyPromise;
    }
    storageArea.get([LANGUAGE_STORAGE_KEY], (result) => {
      applyLanguageMode(result[LANGUAGE_STORAGE_KEY] || 'system');
    });
    return initialLanguageReadyPromise;
  }

  function handleMediaChange(event) {
    if (currentThemeMode !== 'system') {
      return;
    }
    // 仅更新 data-theme 会遗漏依赖 JS 混色的卡片；系统主题切换时需完整重算。
    const mediaMatches = event && typeof event.matches === 'boolean'
      ? event.matches
      : mediaQuery.matches;
    applyThemeMode('system', { mediaMatches });
  }

  function syncSystemThemeMode() {
    if (currentThemeMode !== 'system') {
      return;
    }
    const resolved = resolveTheme('system');
    if (!document.body || document.body.getAttribute('data-theme') === resolved) {
      return;
    }
    applyThemeMode('system', { mediaMatches: mediaQuery.matches });
  }

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
  observeNewtabStartupTask('wallpaper-overlay', initialWallpaperOverlayReadyTask);
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
  observeNewtabStartupTask('wallpaper-visual', initialWallpaperVisualReadyTask);
  const initialAppearanceReadyTask = Promise.all([
    initialWallpaperVisualReadyTask,
    bootstrapInitialNewtabFavicon()
  ]).catch((error) => {
    console.warn('[Lumno] Initial new tab appearance setup failed.', error);
  });
  observeNewtabStartupTask('appearance', initialAppearanceReadyTask);
  markNewtabStartupMilestone('appearance-bootstrap-scheduled');

  addStorageChangeListener((changes, areaName) => {
    if (areaName === 'local' && changes[FOLDER_REFERENCES.BINDINGS_KEY]) {
      shortcutFolderRuntime.accept(changes[FOLDER_REFERENCES.BINDINGS_KEY].newValue);
      if (!isShortcutDragActive()) renderShortcuts();
    }
    if (areaName === 'local' && changes[FOLDER_COLORS_STORAGE_KEY]) {
      folderColors = folderColorApi.normalizeFolderColorMap(changes[FOLDER_COLORS_STORAGE_KEY].newValue);
      refreshFolderColors();
    }
    if (areaName === 'local' && changes[NEWTAB_SHORTCUT_ICONS_STORAGE_KEY]) {
      newtabShortcutIcons = NEWTAB_SHORTCUT_ICON_STORE.normalizeIconMap(
        changes[NEWTAB_SHORTCUT_ICONS_STORAGE_KEY].newValue
      );
      renderShortcuts();
    }
    if (areaName === 'local' && changes[NEWTAB_SHORTCUT_FAVICON_CACHE_STORAGE_KEY]) {
      newtabShortcutFavicons = SHORTCUT_FAVICON.normalizeCacheMap({
        ...(changes[NEWTAB_SHORTCUT_FAVICON_CACHE_STORAGE_KEY].newValue || {}),
        ...shortcutFaviconPendingCacheEntries
      });
      renderShortcuts();
    }
    if (areaName === 'local' && changes[SITE_SEARCH_ICON_CACHE_STORAGE_KEY]) {
      siteSearchIconCache = SHORTCUT_FAVICON.normalizeCacheMap(
        changes[SITE_SEARCH_ICON_CACHE_STORAGE_KEY].newValue,
        Date.now(),
        siteSearchIconCacheOptions
      );
      siteSearchIconCacheLoaded = true;
      siteSearchIconCacheRevision += 1;
      siteSearchIconCacheLoadPromise = Promise.resolve(siteSearchIconCache);
      if (siteSearchState && inputModeController) {
        const activeProvider = siteSearchState;
        setSiteSearchPrefix(activeProvider, defaultTheme);
        getThemeForProvider(activeProvider).then((theme) => {
          if (siteSearchState === activeProvider) {
            setSiteSearchPrefix(activeProvider, theme);
          }
        }).catch(() => {});
      }
      if (inputModeController && typeof inputModeController.refreshModeMenu === 'function') {
        inputModeController.refreshModeMenu();
      }
      if (latestQuery) {
        requestSuggestions(latestQuery, { immediate: true });
      }
    }
    if (areaName === 'local' &&
        changes[NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY] &&
        isShortcutSyncStorageActive() &&
        shortcutPersistenceInFlightCount === 0) {
      scheduleShortcutStorageReload();
    }
    handleBookmarkTopbarSurfaceColorStorageChanges(changes, areaName);
    const isPrimaryArea = isPrimaryStorageAreaName(areaName);
    if (!isPrimaryArea) {
      if (recentSitesStorageAreaName &&
          isPrimaryStorageAreaName(areaName) &&
          changes[PINNED_RECENT_SITES_STORAGE_KEY]) {
        pinnedRecentSites = normalizePinnedRecentSites(changes[PINNED_RECENT_SITES_STORAGE_KEY].newValue);
        recentRenderSignature = '';
        renderRecentSites(recentSourceItems);
      }
      if (recentSitesStorageAreaName &&
          isPrimaryStorageAreaName(areaName) &&
          changes[HIDDEN_RECENT_SITES_STORAGE_KEY]) {
        hiddenRecentSites = normalizeHiddenRecentSites(changes[HIDDEN_RECENT_SITES_STORAGE_KEY].newValue);
        recentRenderSignature = '';
        renderRecentSites(recentSourceItems);
      }
      if (areaName === 'local' &&
          (changes[NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY] || changes[settingsRuntimeApi.ASSET_REVISION_STORAGE_KEY] ||
            (changes[globalThis.LumnoNewtabRemoteContent.BING_DAILY_CACHE_KEY])) &&
          wallpaperRuntime) {
        wallpaperRuntime.handleStorageChange(changes);
      }
      return;
    }
    if (changes[THEME_STORAGE_KEY]) {
      globalThemeMode = normalizeThemeMode(changes[THEME_STORAGE_KEY].newValue);
      if (isNewtabThemeFollowingGlobal()) {
        applyScopedThemeMode();
      } else {
        updateWallpaperAppearanceSelectionUi();
        updateModeCommandSuggestions();
      }
    }
    if (changes[NEWTAB_THEME_MODE_STORAGE_KEY]) {
      newtabThemeMode = normalizeNewtabThemeMode(changes[NEWTAB_THEME_MODE_STORAGE_KEY].newValue);
      applyScopedThemeMode();
    }
    if (changes[NEWTAB_THEME_SCOPE_STORAGE_KEY]) {
      newtabThemeScope = normalizeNewtabThemeScope(changes[NEWTAB_THEME_SCOPE_STORAGE_KEY].newValue);
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    }
    if (wallpaperRuntime) {
      wallpaperRuntime.handleStorageChange(changes);
    }
    if (changes[LANGUAGE_STORAGE_KEY]) {
      applyLanguageMode(changes[LANGUAGE_STORAGE_KEY].newValue || 'system');
    }
    if (changes[NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY]) {
      const rawValue = changes[NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY].newValue;
      newtabInputAutoFocusEnabled = normalizeNewtabInputAutoFocusEnabled(rawValue);
      updateNewtabInputAutoFocusUi();
    }
    if (changes[RECENT_COUNT_STORAGE_KEY]) {
      const nextCount = normalizeRecentCount(changes[RECENT_COUNT_STORAGE_KEY].newValue);
      currentRecentCount = nextCount;
      markRecentDataDirty();
      loadRecentSites({ force: true });
    }
    if (changes[NEWTAB_WIDTH_MODE_STORAGE_KEY]) {
      const previousBookmarkLimit = getBookmarkLimit();
      const rawMode = changes[NEWTAB_WIDTH_MODE_STORAGE_KEY].newValue;
      const nextMode = normalizeNewtabWidthMode(rawMode);
      currentNewtabWidthMode = nextMode;
      if (storageArea && rawMode !== nextMode) {
        storageArea.set({ [NEWTAB_WIDTH_MODE_STORAGE_KEY]: nextMode });
      }
      applyNewtabWidthMode();
      if (wallpaperRuntime && typeof wallpaperRuntime.updateSearchWidthUi === 'function') {
        wallpaperRuntime.updateSearchWidthUi();
      }
      const recentColumnsChanged = applyRecentGridColumns();
      const bookmarkColumnsChanged = applyBookmarkGridColumns();
      if (recentColumnsChanged) {
        markRecentDataDirty();
        loadRecentSites({ force: true });
      }
      if (bookmarkColumnsChanged) {
        keepBookmarkPageAnchorAfterLimitChange(previousBookmarkLimit);
        renderCurrentBookmarkPage();
      }
      updateBookmarkGridHeightLock();
      updateBookmarkSectionPosition();
    }
    if (changes[NEWTAB_SEARCH_WIDTH_STORAGE_KEY]) {
      const rawWidth = changes[NEWTAB_SEARCH_WIDTH_STORAGE_KEY].newValue;
      currentNewtabSearchWidth = normalizeNewtabSearchWidth(rawWidth, { allowNull: true });
      updateNewtabSearchWidthLayout();
      if (wallpaperRuntime && typeof wallpaperRuntime.updateSearchWidthUi === 'function') {
        wallpaperRuntime.updateSearchWidthUi();
      }
    }
    if (changes[NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]) {
      const raw = changes[NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY].newValue;
      const nextValue = normalizeNewtabTopContentMode(raw);
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: nextValue });
      }
      setNewtabTopContentMode(nextValue);
    }
    if (changes[NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]) {
      const raw = changes[NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY].newValue;
      const nextValue = normalizeNewtabTimeFontWeight(raw);
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: nextValue });
      }
      setNewtabTimeFontWeight(nextValue);
    }
    if (changes[NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY]) {
      const raw = changes[NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY].newValue;
      const nextValue = normalizeNewtabTimeSecondsVisible(raw);
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY]: nextValue });
      }
      setNewtabTimeSecondsVisible(nextValue);
    }
    if (changes[NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY]) {
      const raw = changes[NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY].newValue;
      newtabFeedbackButtonVisible = normalizeNewtabFeedbackButtonVisible(raw);
      if (storageArea && raw !== newtabFeedbackButtonVisible) {
        storageArea.set({
          [NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY]: newtabFeedbackButtonVisible
        });
      }
      applyNewtabActionButtonVisibility();
    }
    if (changes[NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY]) {
      const raw = changes[NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY].newValue;
      newtabAppearanceButtonVisible = normalizeNewtabAppearanceButtonVisible(raw);
      if (storageArea && raw !== newtabAppearanceButtonVisible) {
        storageArea.set({
          [NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY]: newtabAppearanceButtonVisible
        });
      }
      applyNewtabActionButtonVisibility();
    }
    if (changes[NEWTAB_ZEN_MODE_STORAGE_KEY]) {
      zenModeEnabled = normalizeZenModeEnabled(changes[NEWTAB_ZEN_MODE_STORAGE_KEY].newValue);
      applyZenMode();
      updateZenCommandSuggestions();
    }
    if (changes[NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]) {
      const raw = changes[NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY].newValue;
      const nextValue = normalizeNewtabShortcutsVisible(raw);
      newtabShortcutsVisible = nextValue;
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]: nextValue });
      }
      applyNewtabShortcutsVisibility();
      updateNewtabShortcutPreferencesUi();
    }
    if (changes[NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]) {
      const raw = changes[NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY].newValue;
      const nextValue = normalizeNewtabShortcutAddVisible(raw);
      newtabShortcutAddVisible = nextValue;
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]: nextValue });
      }
      renderShortcuts();
      updateNewtabShortcutPreferencesUi();
    }
    if (changes[NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]) {
      const raw = changes[NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY].newValue;
      const nextValue = normalizeNewtabShortcutDockMagnificationEnabled(raw);
      newtabShortcutDockMagnificationEnabled = nextValue;
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]: nextValue });
      }
      applyNewtabShortcutDockMagnification();
      updateNewtabShortcutPreferencesUi();
    }
    if (changes[NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY]) {
      const raw = changes[NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY].newValue;
      const nextValue = normalizeNewtabShortcutColumns(raw);
      newtabShortcutColumns = nextValue;
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY]: nextValue });
      }
      applyNewtabShortcutColumns();
      updateBookmarkSectionPosition({
        preserveSearchEntryLayout: true,
        stabilizeDockDensity: true
      });
      updateNewtabShortcutPreferencesUi();
    }
    if (changes[NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]) {
      const raw = changes[NEWTAB_SHORTCUT_SIZE_STORAGE_KEY].newValue;
      const nextValue = normalizeNewtabShortcutSize(raw);
      newtabShortcutSize = nextValue;
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]: nextValue });
      }
      applyNewtabShortcutLayoutPreferences();
      updateBookmarkSectionPosition({
        preserveSearchEntryLayout: true,
        stabilizeDockDensity: true
      });
      updateNewtabShortcutPreferencesUi();
    }
    if (changes[NEWTAB_SHORTCUT_GAP_STORAGE_KEY]) {
      const raw = changes[NEWTAB_SHORTCUT_GAP_STORAGE_KEY].newValue;
      const nextValue = normalizeNewtabShortcutGap(raw);
      newtabShortcutGap = nextValue;
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [NEWTAB_SHORTCUT_GAP_STORAGE_KEY]: nextValue });
      }
      applyNewtabShortcutLayoutPreferences();
      updateBookmarkSectionPosition({
        preserveSearchEntryLayout: true,
        stabilizeDockDensity: true
      });
      updateNewtabShortcutPreferencesUi();
    }
    if (changes[RECENT_MODE_STORAGE_KEY]) {
      const nextMode = normalizeRecentMode(changes[RECENT_MODE_STORAGE_KEY].newValue, 'latest');
      if (currentRecentMode === nextMode) {
        updateRecentModeMenu();
      } else {
        currentRecentMode = nextMode;
        updateRecentHeading();
        updateRecentModeMenu();
        markRecentDataDirty();
        loadRecentSites({ force: true });
      }
    }
    if (changes[BOOKMARK_VIEW_MODE_STORAGE_KEY]) {
      const rawMode = changes[BOOKMARK_VIEW_MODE_STORAGE_KEY].newValue;
      const nextMode = normalizeBookmarkViewMode(rawMode);
      if (shouldRepairBookmarkViewModeStorageValue(rawMode, nextMode)) {
        persistBookmarkViewMode(nextMode);
      }
      applyBookmarkViewMode(nextMode, { force: true });
    }
    if (changes[BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY]) {
      const raw = changes[BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY].newValue;
      const nextValue = normalizeBookmarkFolderIconsVisible(raw);
      bookmarkFolderIconsVisible = nextValue;
      if (storageArea && raw !== nextValue) {
        storageArea.set({ [BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY]: nextValue });
      }
      if (bookmarksView && typeof bookmarksView.setFolderIconsVisible === 'function') {
        bookmarksView.setFolderIconsVisible(nextValue);
      }
    }
    if (changes[BOOKMARK_COUNT_STORAGE_KEY]) {
      const raw = changes[BOOKMARK_COUNT_STORAGE_KEY].newValue;
      const nextCount = normalizeBookmarkCount(raw);
      currentBookmarkCount = nextCount;
      if (storageArea && raw !== nextCount) {
        storageArea.set({ [BOOKMARK_COUNT_STORAGE_KEY]: nextCount });
      }
      bookmarkCurrentPage = 0;
      markBookmarkDataDirty();
      loadBookmarks({ force: true });
    }
    if (changes[BOOKMARK_COLUMNS_STORAGE_KEY]) {
      const previousLimit = getBookmarkLimit();
      const raw = changes[BOOKMARK_COLUMNS_STORAGE_KEY].newValue;
      const nextColumns = normalizeBookmarkColumns(raw);
      currentBookmarkColumns = nextColumns;
      if (storageArea && raw !== nextColumns) {
        storageArea.set({ [BOOKMARK_COLUMNS_STORAGE_KEY]: nextColumns });
      }
      keepBookmarkPageAnchorAfterLimitChange(previousLimit);
      applyBookmarkGridColumns();
      renderCurrentBookmarkPage();
      updateBookmarkGridHeightLock();
      updateBookmarkSectionPosition();
    }
    if (changes[TAB_RANK_SCORE_DEBUG_STORAGE_KEY]) {
      tabRankScoreDebugEnabled = normalizeTabRankScoreDebugMode(changes[TAB_RANK_SCORE_DEBUG_STORAGE_KEY].newValue);
      if (!latestQuery || !latestQuery.trim()) {
        requestTabsAndRender();
      }
    }
    if (BOOKMARK_CASCADE_DEBUG_UI_ENABLED && changes[BOOKMARK_CASCADE_DEBUG_STORAGE_KEY]) {
      setBookmarkCascadeDebugEnabled(changes[BOOKMARK_CASCADE_DEBUG_STORAGE_KEY].newValue, {
        persist: false
      });
    }
    if (changes[PINNED_RECENT_SITES_STORAGE_KEY]) {
      pinnedRecentSites = normalizePinnedRecentSites(changes[PINNED_RECENT_SITES_STORAGE_KEY].newValue);
      recentRenderSignature = '';
      renderRecentSites(recentSourceItems);
    }
    if (changes[HIDDEN_RECENT_SITES_STORAGE_KEY]) {
      hiddenRecentSites = normalizeHiddenRecentSites(changes[HIDDEN_RECENT_SITES_STORAGE_KEY].newValue);
      recentRenderSignature = '';
      renderRecentSites(recentSourceItems);
    }
    if (shortcutPersistenceInFlightCount === 0 &&
        NEWTAB_SHORTCUTS_STORAGE_KEYS.some((key) => changes[key])) {
      scheduleShortcutStorageReload();
    }
  });

  if (chrome && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message) {
        return;
      }
      if (message.action === 'lumno:wallpapers-updated') {
        if (wallpaperRuntime && typeof wallpaperRuntime.refreshCustomWallpapers === 'function') {
          wallpaperRuntime.refreshCustomWallpapers();
        }
        return;
      }
      if (message.action !== 'lumno:newtab-refresh-sections') return;
      const section = message.section || 'all';
      if (section === 'recent' || section === 'all') {
        markRecentDataDirty();
        loadRecentSites({ force: true });
      }
      if (section === 'bookmarks' || section === 'all') {
        markBookmarkDataDirty();
        loadBookmarks({ force: true });
      }
    });
  }

  if (storageArea) {
    bootstrapInitialLanguageMode();
    initialPinnedRecentSitesReadyTask = readPinnedRecentSites().then((items) => {
      pinnedRecentSites = items;
      if (recentSourceItems.length > 0) {
        recentRenderSignature = '';
        renderRecentSites(recentSourceItems);
      }
      return items;
    }).catch(() => {
      pinnedRecentSites = [];
      return pinnedRecentSites;
    });
    initialHiddenRecentSitesReadyTask = readHiddenRecentSites().then((items) => {
      hiddenRecentSites = items;
      if (recentSourceItems.length > 0) {
        recentRenderSignature = '';
        renderRecentSites(recentSourceItems);
      }
      return items;
    }).catch(() => {
      hiddenRecentSites = [];
      return hiddenRecentSites;
    });

    storageArea.get([RECENT_COUNT_STORAGE_KEY], (result) => {
      const stored = result[RECENT_COUNT_STORAGE_KEY];
      const count = normalizeRecentCount(stored);
      const changed = currentRecentCount !== count;
      currentRecentCount = count;
      if (stored !== count) {
        storageArea.set({ [RECENT_COUNT_STORAGE_KEY]: count });
      }
      if (changed || !recentLoadedOnce) {
        markRecentDataDirty();
        loadRecentSites();
      }
    });
    storageArea.get([NEWTAB_WIDTH_MODE_STORAGE_KEY, NEWTAB_SEARCH_WIDTH_STORAGE_KEY], (result) => {
      const previousBookmarkLimit = getBookmarkLimit();
      const stored = result[NEWTAB_WIDTH_MODE_STORAGE_KEY];
      const mode = normalizeNewtabWidthMode(stored);
      const changed = currentNewtabWidthMode !== mode;
      currentNewtabWidthMode = mode;
      currentNewtabSearchWidth = normalizeNewtabSearchWidth(result[NEWTAB_SEARCH_WIDTH_STORAGE_KEY], {
        allowNull: true
      });
      if (stored !== mode) {
        storageArea.set({ [NEWTAB_WIDTH_MODE_STORAGE_KEY]: mode });
      }
      applyNewtabWidthMode();
      if (wallpaperRuntime && typeof wallpaperRuntime.updateSearchWidthUi === 'function') {
        wallpaperRuntime.updateSearchWidthUi();
      }
      const recentColumnsChanged = applyRecentGridColumns();
      const bookmarkColumnsChanged = applyBookmarkGridColumns();
      if (changed || recentColumnsChanged) {
        markRecentDataDirty();
        loadRecentSites({ force: true });
      }
      if (bookmarkColumnsChanged && bookmarkLoadedOnce) {
        keepBookmarkPageAnchorAfterLimitChange(previousBookmarkLimit);
        renderCurrentBookmarkPage();
      }
      updateBookmarkGridHeightLock();
      updateBookmarkSectionPosition();
    });
    storageArea.get([
      NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
      NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
      NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY
    ], (result) => {
      const raw = result[NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY];
      const nextValue = normalizeNewtabTopContentMode(raw);
      const rawFontWeight = result[NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY];
      const nextFontWeight = normalizeNewtabTimeFontWeight(rawFontWeight);
      const rawSecondsVisible = result[NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY];
      const nextSecondsVisible = normalizeNewtabTimeSecondsVisible(rawSecondsVisible);
      if (raw !== nextValue) {
        storageArea.set({ [NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: nextValue });
      }
      if (rawFontWeight !== nextFontWeight) {
        storageArea.set({ [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: nextFontWeight });
      }
      if (rawSecondsVisible !== nextSecondsVisible) {
        storageArea.set({ [NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY]: nextSecondsVisible });
      }
      setNewtabTimeFontWeight(nextFontWeight);
      setNewtabTimeSecondsVisible(nextSecondsVisible);
      setNewtabTopContentMode(nextValue);
      if (wallpaperRuntime && typeof wallpaperRuntime.updateTopContentModeUi === 'function') {
        wallpaperRuntime.updateTopContentModeUi();
      }
    });
    storageArea.get([RECENT_MODE_STORAGE_KEY], (result) => {
      const stored = result[RECENT_MODE_STORAGE_KEY];
      const hasStored = stored === 'latest' || stored === 'most';
      const mode = normalizeRecentMode(stored, 'most');
      const changed = currentRecentMode !== mode;
      currentRecentMode = mode;
      updateRecentHeading();
      updateRecentModeMenu();
      if (!hasStored) {
        storageArea.set({ [RECENT_MODE_STORAGE_KEY]: mode });
      }
      if (changed || !recentLoadedOnce) {
        markRecentDataDirty();
        loadRecentSites();
      }
    });
    loadInitialBookmarkViewMode();
    loadInitialBookmarkTopbarSurfaceColors();
    loadInitialBookmarkTopbarSurfaceMode();
    storageArea.get([BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY], (result) => {
      const raw = result[BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY];
      const nextValue = normalizeBookmarkFolderIconsVisible(raw);
      bookmarkFolderIconsVisible = nextValue;
      if (raw !== nextValue) {
        storageArea.set({ [BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY]: nextValue });
      }
      if (bookmarksView && typeof bookmarksView.setFolderIconsVisible === 'function') {
        bookmarksView.setFolderIconsVisible(nextValue);
      }
    });
    storageArea.get([BOOKMARK_COUNT_STORAGE_KEY], (result) => {
      const stored = result[BOOKMARK_COUNT_STORAGE_KEY];
      const count = normalizeBookmarkCount(stored);
      const changed = currentBookmarkCount !== count;
      currentBookmarkCount = count;
      if (stored !== count) {
        storageArea.set({ [BOOKMARK_COUNT_STORAGE_KEY]: count });
      }
      if (changed || !bookmarkLoadedOnce) {
        markBookmarkDataDirty();
        loadBookmarks();
      }
    });
    storageArea.get([BOOKMARK_COLUMNS_STORAGE_KEY], (result) => {
      const stored = result[BOOKMARK_COLUMNS_STORAGE_KEY];
      const columns = normalizeBookmarkColumns(stored);
      currentBookmarkColumns = columns;
      if (stored !== columns) {
        storageArea.set({ [BOOKMARK_COLUMNS_STORAGE_KEY]: columns });
      }
      applyBookmarkGridColumns();
      updateBookmarkGridHeightLock();
      updateBookmarkSectionPosition();
    });
    storageArea.get([TAB_RANK_SCORE_DEBUG_STORAGE_KEY], (result) => {
      const raw = result[TAB_RANK_SCORE_DEBUG_STORAGE_KEY];
      const next = normalizeTabRankScoreDebugMode(raw);
      tabRankScoreDebugEnabled = next;
      if (raw !== next) {
        storageArea.set({ [TAB_RANK_SCORE_DEBUG_STORAGE_KEY]: next });
      }
    });
    if (BOOKMARK_CASCADE_DEBUG_UI_ENABLED) {
      storageArea.get([BOOKMARK_CASCADE_DEBUG_STORAGE_KEY], (result) => {
        const raw = result[BOOKMARK_CASCADE_DEBUG_STORAGE_KEY];
        const next = normalizeBookmarkCascadeDebugMode(raw);
        setBookmarkCascadeDebugEnabled(next, { persist: false });
        if (raw !== next) {
          storageArea.set({ [BOOKMARK_CASCADE_DEBUG_STORAGE_KEY]: next });
        }
      });
    }
  }

  function getThemeModeLabel(mode) {
    if (mode === 'dark') {
      return t('theme_label_dark', '深色');
    }
    if (mode === 'light') {
      return t('theme_label_light', '浅色');
    }
    return t('theme_label_system', '跟随系统');
  }

  const commandDefinitions = [
    {
      type: 'commandNewTab',
      primary: '/new',
      aliases: ['/n', '/newtab', '/nt']
    },
    {
      type: 'commandSettings',
      primary: '/settings',
      aliases: ['/set', '/settings', '/s']
    },
    {
      type: 'modeSwitch',
      primary: '/mode',
      aliases: []
    },
    {
      type: 'zenSwitch',
      primary: '/zen',
      aliases: []
    }
  ];

  function getCommandMatches(rawInput) {
    const input = String(rawInput || '').trim().toLowerCase();
    if (!input.startsWith('/')) {
      return [];
    }
    const matches = [];
    for (let i = 0; i < commandDefinitions.length; i += 1) {
      const command = commandDefinitions[i];
      const tokens = [command.primary].concat(command.aliases || []);
      for (let j = 0; j < tokens.length; j += 1) {
        const token = String(tokens[j] || '').trim().toLowerCase();
        if (token.startsWith(input)) {
          matches.push(command);
          break;
        }
      }
    }
    return matches;
  }

  function getCommandMatch(rawInput) {
    const matches = getCommandMatches(rawInput);
    return matches.length > 0
      ? {
          command: matches[0],
          completion: matches[0].primary
        }
      : null;
  }

  function buildCommandSuggestion(command) {
    if (command.type === 'modeSwitch') {
      return {
        ...buildModeSuggestion(),
        commandText: command.primary,
        commandAliases: command.aliases || []
      };
    }
    if (command.type === 'zenSwitch') {
      return {
        ...buildZenSuggestion(),
        commandText: command.primary,
        commandAliases: command.aliases || []
      };
    }
    let titleText = '';
    if (command.type === 'commandSettings') {
      titleText = formatMessage('command_settings', '打开设置', {
        name: 'Lumno'
      });
    } else {
      titleText = t('command_newtab', '新建标签页');
    }
    return {
      type: command.type,
      title: titleText,
      url: '',
      commandText: command.primary,
      commandAliases: command.aliases || []
    };
  }

  function updateModeBadge(rawValue) {
    if (!modeBadge) {
      return;
    }
    const zenCommandActive = isZenCommand(rawValue || '');
    const shouldShow = isModeCommand(rawValue || '') || zenCommandActive;
    if (!shouldShow) {
      modeBadge.setAttribute('data-visible', 'false');
      updateInputRightPadding();
      return;
    }
    modeBadge.textContent = zenCommandActive
      ? t(
        zenModeEnabled ? 'zen_badge_on' : 'zen_badge_off',
        zenModeEnabled ? 'Zen：已开启' : 'Zen：已关闭'
      )
      : formatMessage('mode_badge', '模式：{mode}', {
        mode: getThemeModeLabel(currentThemeMode)
      });
    modeBadge.setAttribute('data-visible', 'true');
    updateInputRightPadding();
  }

  function getNextThemeMode(mode) {
    const order = ['system', 'light', 'dark'];
    const index = order.indexOf(mode);
    if (index === -1) {
      return 'light';
    }
    return order[(index + 1) % order.length];
  }

  function isModeCommand(input) {
    const raw = String(input || '').trim().toLowerCase();
    return raw === '/mode' || raw.startsWith('/mode ');
  }

  function isZenCommand(input) {
    const raw = String(input || '').trim().toLowerCase();
    return raw === '/zen' || raw.startsWith('/zen ');
  }

  function isSlashCommandInput(input) {
    const raw = String(input || '').trim();
    return raw.startsWith('/');
  }

  function buildModeSuggestion() {
    const nextMode = getNextThemeMode(currentThemeMode);
    return {
      type: 'modeSwitch',
      title: formatMessage('mode_switch_title', `Lumno：切换到${getThemeModeLabel(nextMode)}模式`, {
        name: 'Lumno',
        mode: getThemeModeLabel(nextMode)
      }),
      url: '',
      favicon: getExtensionResourceUrl('assets/images/lumno.png'),
      commandText: '/mode',
      commandAliases: [],
      nextMode: nextMode
    };
  }

  function buildZenSuggestion() {
    return {
      type: 'zenSwitch',
      title: zenModeEnabled
        ? formatMessage('zen_disable_title', '{name}：退出 Zen 模式', { name: 'Lumno' })
        : formatMessage('zen_enable_title', '{name}：进入 Zen 模式', { name: 'Lumno' }),
      url: '',
      favicon: getExtensionResourceUrl('assets/images/lumno.png'),
      commandText: '/zen',
      commandAliases: [],
      nextEnabled: !zenModeEnabled
    };
  }

  function updateModeCommandSuggestions() {
    if (isModeCommand(inputParts && inputParts.input ? inputParts.input.value : '')) {
      renderSuggestions([], (inputParts.input.value || '').trim());
    }
  }

  function updateZenCommandSuggestions() {
    if (isZenCommand(inputParts && inputParts.input ? inputParts.input.value : '')) {
      renderSuggestions([], (inputParts.input.value || '').trim());
    }
  }

  function syncSectionZenVisibility(section) {
    if (!section) {
      return;
    }
    let configuredVisible = section.getAttribute('data-content-visible');
    if (configuredVisible !== 'true' && configuredVisible !== 'false') {
      configuredVisible = section.getAttribute('data-visible') === 'true' ? 'true' : 'false';
      section.setAttribute('data-content-visible', configuredVisible);
    }
    section.setAttribute(
      'data-visible',
      configuredVisible === 'true' && !zenModeEnabled ? 'true' : 'false'
    );
  }

  function applyZenMode() {
    if (document.body) {
      document.body.setAttribute('data-zen-mode', zenModeEnabled ? 'true' : 'false');
    }
    applyNewtabTopContentVisibility();
    applyNewtabShortcutsVisibility();
    syncSectionZenVisibility(bookmarkSection);
    syncSectionZenVisibility(recentSection);
    if (bookmarkTopbarRuntime && isBookmarkTopbarMode()) {
      bookmarkTopbarRuntime.setVisible(
        !zenModeEnabled && bookmarkCards.length > 0 && currentBookmarkCount > 0
      );
    }
    if (zenModeEnabled) {
      closeBookmarkCascadeMenu();
      closeShortcutContextMenu();
      closeRecentContextMenu();
      closeShortcutDialog();
      closeWallpaperPanel();
      closeFeedbackPopover();
      hideTopActionTooltip();
      hideShortcutTooltip();
      hideCursorTooltip();
    }
    updateBookmarkSectionPosition();
    updateSearchEntryLayout();
    scheduleWallpaperAdaptiveToneUpdate();
    updateModeBadge(inputParts && inputParts.input ? inputParts.input.value : '');
  }

  function setZenModeEnabled(enabled) {
    const nextEnabled = normalizeZenModeEnabled(enabled);
    zenModeEnabled = nextEnabled;
    if (!storageArea) {
      applyZenMode();
      updateZenCommandSuggestions();
      return;
    }
    storageArea.set({ [NEWTAB_ZEN_MODE_STORAGE_KEY]: nextEnabled }, () => {
      applyZenMode();
      updateZenCommandSuggestions();
    });
  }

  function loadZenMode() {
    if (!storageArea) {
      zenModeEnabled = false;
      applyZenMode();
      return Promise.resolve(zenModeEnabled);
    }
    return new Promise((resolve) => {
      storageArea.get([NEWTAB_ZEN_MODE_STORAGE_KEY], (result) => {
        zenModeEnabled = normalizeZenModeEnabled(result && result[NEWTAB_ZEN_MODE_STORAGE_KEY]);
        applyZenMode();
        resolve(zenModeEnabled);
      });
    });
  }

  function getThemeScope() {
    return newtabThemeScope;
  }

  function getGlobalThemeStorageUpdate(mode) {
    return SETTINGS.createGlobalThemeModeStorageUpdate(mode);
  }

  function setGlobalThemeMode(mode) {
    const updates = getGlobalThemeStorageUpdate(mode);
    globalThemeMode = updates[THEME_STORAGE_KEY];
    if (!storageArea) {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    storageArea.set(updates, () => {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  function setThemeMode(mode) {
    const nextMode = normalizeThemeMode(mode);
    const isEditingNewtabTheme = newtabThemeScope === 'home';
    const targetKey = isEditingNewtabTheme
      ? NEWTAB_THEME_MODE_STORAGE_KEY
      : THEME_STORAGE_KEY;
    const nextStoredMode = isEditingNewtabTheme && nextMode === 'system'
      ? 'global'
      : nextMode;
    if (!isEditingNewtabTheme) {
      setGlobalThemeMode(nextMode);
      return;
    }
    newtabThemeMode = normalizeNewtabThemeMode(nextStoredMode);
    if (!storageArea) {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    storageArea.set({ [targetKey]: nextStoredMode }, () => {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  function setVisibleThemeMode(mode) {
    const nextMode = normalizeThemeMode(mode);
    if (isNewtabThemeFollowingGlobal()) {
      setGlobalThemeMode(nextMode);
      return;
    }
    const nextStoredMode = nextMode === 'system' ? 'global' : nextMode;
    newtabThemeMode = normalizeNewtabThemeMode(nextStoredMode);
    if (!storageArea) {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    storageArea.set({ [NEWTAB_THEME_MODE_STORAGE_KEY]: nextStoredMode }, () => {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  function setThemeScope(scope) {
    const nextScope = normalizeNewtabThemeScope(scope);
    const updates = { [NEWTAB_THEME_SCOPE_STORAGE_KEY]: nextScope };
    newtabThemeScope = nextScope;
    if (!storageArea) {
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    storageArea.set(updates, () => {
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  let lastDeletionAt = 0;
  let fallbackShortcutRaw = '';
  let fallbackShortcutSpec = null;
  let fallbackShortcutRefreshAt = 0;
  let autocompleteState = null;
  let inlineSearchState = null;
  const imeKeyGuard = LumnoImeKeyGuard.createImeKeyGuard();
  const searchInputHistoryController =
    SEARCH_INPUT_HISTORY.createSearchInputHistoryController({
      storageArea: localStorageArea,
      storageChanges: chrome && chrome.storage ? chrome.storage.onChanged : null,
      storageAreaName: 'local'
    });
  let isApplyingSearchInputHistory = false;
  function isImeCompositionEvent(event) {
    return imeKeyGuard.shouldIgnoreKeydown(event);
  }
  let siteSearchState = null;
  let localSearchScopeState = null;
  let remoteSuggestionDebounceTimer = null;
  let tabs = [];
  let currentNewtabTabId = null;
  let siteSearchProvidersCache = null;
  let siteSearchProvidersLoadPromise = null;
  let siteSearchProvidersLoadVersion = 0;
  let aggregateSearchesCache = null;
  let aggregateSearchesLoadPromise = null;
  let aggregateSearchesLoadVersion = 0;
  let aggregateSearchRequestController = null;
  let pendingProviderReload = false;
  let suggestionRequestSeq = 0;
  let searchSuggestionsDismissed = false;
  let suggestionRequestWatchdogTimer = null;
  let searchResultPriorityMode = 'autocomplete';
  let enabledSearchResultSourceTypes = ['topSite', 'bookmark', 'history'];
  let searchResultDisplayLimit = 10;
  let openTabQuickSwitchEnabled = true;
  let searchInputRef = null;
  let faviconRequestBlacklistItems = [];
  let faviconEnhancedFetchEnabled = false;
  loadDefaultSearchEngineState();
  if (chrome && chrome.storage && chrome.storage.onChanged) {
    addStorageChangeListener((changes, areaName) => {
      if (!isPrimaryStorageAreaName(areaName)) {
        return;
      }
      if (changes[DEFAULT_SEARCH_ENGINE_STORAGE_KEY]) {
        const nextValue = changes[DEFAULT_SEARCH_ENGINE_STORAGE_KEY].newValue;
        if (nextValue && nextValue.id &&
            (!SEARCH_UTILS.isRetiredSearchEngineState(nextValue))) {
          defaultSearchEngineState = nextValue;
        }
      }
      if (changes[SEARCH_RESULT_PRIORITY_STORAGE_KEY]) {
        searchResultPriorityMode = normalizeSearchResultPriority(changes[SEARCH_RESULT_PRIORITY_STORAGE_KEY].newValue);
      }
      if (changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY]) {
        enabledSearchResultSourceTypes = normalizeEnabledSearchResultSourceTypes(
          changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY].newValue
        );
        if (localSearchScopeState &&
            !enabledSearchResultSourceTypes.includes(localSearchScopeState.sourceType)) {
          clearLocalSearchScope();
        }
      }
      if (changes[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY]) {
        searchResultDisplayLimit = normalizeSearchResultDisplayLimit(
          changes[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY].newValue
        );
        if (latestQuery) {
          renderSuggestions(lastSuggestionResponse, latestQuery);
        }
      }
      if (changes[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY]) {
        numberShortcutInstantEnabled = normalizeNumberShortcutInstantEnabled(
          changes[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY].newValue
        );
        SUGGESTION_NAVIGATION.cancelNumberShortcuts(suggestionsContainer);
      }
      if (changes[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY]) {
        macosCtrlSuggestionNavigationEnabled = normalizeMacosCtrlSuggestionNavigationEnabled(
          changes[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY].newValue
        );
      }
      if (changes[SIMPLE_MODE_ENABLED_STORAGE_KEY]) {
        simpleModeEnabled = normalizeSimpleModeEnabled(
          changes[SIMPLE_MODE_ENABLED_STORAGE_KEY].newValue
        );
        if (latestQuery) {
          renderSuggestions(lastSuggestionResponse, latestQuery);
        }
      }
      if (changes[OVERLAY_TAB_PRIORITY_STORAGE_KEY]) {
        openTabQuickSwitchEnabled = normalizeOverlayTabPriorityMode(changes[OVERLAY_TAB_PRIORITY_STORAGE_KEY].newValue);
        if (latestQuery) {
          requestSuggestions(latestQuery, { immediate: true });
        }
      }
      if (changes[SEARCH_BLACKLIST_STORAGE_KEY]) {
        searchBlacklistItems = normalizeSearchBlacklistItems(changes[SEARCH_BLACKLIST_STORAGE_KEY].newValue);
        markRecentDataDirty();
        scheduleRecentReloadIfVisible();
      }
      if (changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY]) {
        faviconRequestBlacklistItems = normalizeFaviconRequestBlacklistItems(changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY].newValue);
        markRecentDataDirty();
        scheduleRecentReloadIfVisible();
        scheduleBookmarkReloadIfVisible();
        if (typeof refreshThemeAwareFavicons === 'function') {
          refreshThemeAwareFavicons();
        }
      }
      if (changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY]) {
        faviconEnhancedFetchEnabled = normalizeFaviconEnhancedFetchEnabled(
          changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY].newValue
        );
        markRecentDataDirty();
        scheduleRecentReloadIfVisible();
        scheduleBookmarkReloadIfVisible();
        if (typeof refreshThemeAwareFavicons === 'function') {
          refreshThemeAwareFavicons();
        }
      }
      if (changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY] || changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY]) {
        shortcutFaviconPolicyRevision += 1;
        renderShortcuts();
        if (inputModeController) {
          if (siteSearchState) {
            setSiteSearchPrefix(siteSearchState, getImmediateThemeForSuggestion({ provider: siteSearchState }), { animate: false });
          }
          inputModeController.refreshModeMenu();
        }
      }
      if (latestQuery && latestQuery.trim() && (
        changes[DEFAULT_SEARCH_ENGINE_STORAGE_KEY] ||
        changes[SEARCH_RESULT_PRIORITY_STORAGE_KEY] ||
        changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY] ||
        changes[SEARCH_BLACKLIST_STORAGE_KEY] ||
        changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY] ||
        changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY]
      )) {
        requestSuggestions(latestQuery, { immediate: true });
      }
    });
  }
  const SITE_SEARCH_STORAGE_KEY = '_x_extension_site_search_custom_2024_unique_';
  const SITE_SEARCH_DISABLED_STORAGE_KEY = '_x_extension_site_search_disabled_2024_unique_';
  const AGGREGATE_SEARCH_STORAGE_KEY = SETTINGS.AGGREGATE_SEARCH_STORAGE_KEY ||
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
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
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
    AGGREGATE_SEARCH_STORAGE_KEY,
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
  let handleTabKey = null;

  const faviconDataCache = new Map();
  const faviconDataPending = new Map();
  const faviconCacheRuntime = NEWTAB_FAVICON_CACHE.createFaviconCache({
    storageArea: (chrome && chrome.storage && chrome.storage.local) ? chrome.storage.local : null,
    windowObj: window,
    normalizeFaviconHost,
    isBlockedLocalFaviconUrl,
    isChromeMonogramFaviconUrl,
    faviconCacheBootWaitMs: FAVICON_CACHE_BOOT_WAIT_MS
  });

  function isFaviconPersistLoaded() {
    return faviconCacheRuntime.isFaviconPersistLoaded();
  }

  function isFaviconDataPersistLoaded() {
    return faviconCacheRuntime.isFaviconDataPersistLoaded();
  }

  function isSiteThemePersistLoaded() {
    return faviconCacheRuntime.isSiteThemePersistLoaded();
  }

  function waitForFaviconCachesOrTimeout(maxWaitMs) {
    return faviconCacheRuntime.waitForCachesOrTimeout(maxWaitMs);
  }

  function areFaviconRenderCachesReady() {
    return isFaviconPersistLoaded() && isFaviconDataPersistLoaded() && isSiteThemePersistLoaded();
  }

  function waitForFaviconRenderCaches(maxWaitMs) {
    if (areFaviconRenderCachesReady()) {
      return Promise.resolve();
    }
    return waitForFaviconCachesOrTimeout(maxWaitMs);
  }

  function isHostFaviconVisitDirty(hostname) {
    return faviconCacheRuntime.isHostVisitDirty(hostname);
  }

  function setPersistedFaviconUrl(cacheKey, url) {
    faviconCacheRuntime.setPersistedUrl(cacheKey, url);
  }

  function getPersistedFaviconEntry(cacheKey) {
    return faviconCacheRuntime.getPersistedEntry(cacheKey);
  }

  function getPersistedFaviconDataEntry(cacheKey) {
    return faviconCacheRuntime.getPersistedDataEntry(cacheKey);
  }

  function setPersistedFaviconData(cacheKey, dataUrl) {
    faviconCacheRuntime.setPersistedData(cacheKey, dataUrl);
  }

  function getPersistedSiteThemeEntry(hostKey) {
    return faviconCacheRuntime.getPersistedThemeEntry(hostKey);
  }

  function setPersistedSiteThemeEntry(hostKey, theme) {
    if (!theme || !isPersistableTheme(theme)) {
      return false;
    }
    const accentRgb = normalizeAccentRgb(theme.accentRgb || parseCssColor(theme.accent));
    if (!accentRgb) {
      return false;
    }
    return faviconCacheRuntime.setPersistedThemeEntry(hostKey, {
      accentRgb,
      source: getThemeSource(theme),
      neutral: isLowConfidenceTheme(theme) || theme._xThemeNeutral === true,
      confidence: normalizeThemeConfidence(theme._xThemeConfidence, accentRgb)
    });
  }

  const logNewtabFaviconDecision = FAVICON_UTILS.createFaviconDecisionLogger({ surface: 'newtab' });
  faviconViewRuntime = NEWTAB_FAVICON_VIEW.createFaviconViewRuntime({
    document,
    windowObj: window,
    chromeApi: chrome,
    getRiSvg,
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    isOwnExtensionUrl,
    isBlockedLocalFaviconUrl,
    shouldBlockFaviconForHost,
    shouldAvoidDirectFaviconForHost,
    isEnhancedFaviconFetchEnabled: isNewtabEnhancedFaviconFetchEnabled,
    getStrictFaviconReason: getNewtabStrictFaviconReason,
    logFaviconDecision: logNewtabFaviconDecision,
    getHostFromUrl,
    isFaviconProxyUrl,
    isChromeMonogramFaviconUrl,
    getPersistedFaviconEntry,
    getPersistedFaviconDataEntry,
    setPersistedFaviconUrl,
    setPersistedFaviconData,
    preloadThemeFromFavicon,
    faviconDataCache,
    faviconDataPending,
    hasThemeForHost: (hostKey) => Boolean(hostKey && themeHostCache.has(hostKey))
  });
  const applyFaviconOpticalShift = faviconViewRuntime.applyFaviconOpticalShift;
  const applyFaviconOpticalAlignment = faviconViewRuntime.applyFaviconOpticalAlignment;
  const reportMissingIcon = faviconViewRuntime.reportMissingIcon;
  const applyFallbackIcon = faviconViewRuntime.applyFallbackIcon;
  const requestFaviconData = faviconViewRuntime.requestFaviconData;
  const setFaviconSrcWithAnimation = faviconViewRuntime.setFaviconSrcWithAnimation;
  const attachFaviconData = faviconViewRuntime.attachFaviconData;
  const preloadIcon = faviconViewRuntime.preloadIcon;
  const warmIconCache = faviconViewRuntime.warmIconCache;
  const attachFaviconWithFallbacks = faviconViewRuntime.attachFaviconWithFallbacks;
  const rescueThemeAwareFallbackFavicons = faviconViewRuntime.rescueThemeAwareFallbackFavicons;

  function isAllowedFaviconProxyRequestUrl(url) {
    return FAVICON_UTILS.isAllowedFaviconProxyRequestUrl(url);
  }

  function isBlockedLocalFaviconUrl(url) {
    const blockedByLocalRules = FAVICON_UTILS.isBlockedLocalFaviconUrl(url);
    return blockedByLocalRules ||
      (!isAllowedFaviconProxyRequestUrl(url) && isUrlBlockedByFaviconRequestBlacklist(url));
  }

  function isChromeMonogramFaviconUrl(url) {
    return FAVICON_UTILS.isChromeMonogramFaviconUrl(url);
  }

  function preloadThemeFromFavicon(url, dataUrl, hostOverride) {
    const cachedTheme = themeColorCache.get(url);
    if (!url || (cachedTheme && !cachedTheme._xIsDefault)) {
      return;
    }
    const hostKey = normalizeHost(hostOverride || getHostFromUrl(url));
    const useHostCache = hostKey && (Boolean(hostOverride) || !isFaviconProxyUrl(url));
    const cachedHostTheme = useHostCache ? themeHostCache.get(hostKey) : null;
    if (
      cachedHostTheme &&
      getThemeSourcePriority(getThemeSource(cachedHostTheme), cachedHostTheme) > getThemeSourcePriority('favicon')
    ) {
      return;
    }
    if (!dataUrl) {
      return;
    }
    const image = new Image();
    image.onload = function() {
      const avg = extractAverageColor(image);
      if (!avg) {
        return;
      }
      const theme = buildThemeFromAccent(avg, 'favicon');
      themeColorCache.set(url, theme);
      if (useHostCache) {
        setResolvedThemeForHost(hostKey, theme, { iconUrl: url });
      }
    };
    image.onerror = function() {};
    image.src = dataUrl;
  }

  const FAVICON_PROXY_SIZE = 128;
  let pageFaviconUrlResolver = null;

  function getPageFaviconUrlResolver() {
    if (!pageFaviconUrlResolver) {
      pageFaviconUrlResolver = FAVICON_UTILS.createFaviconUrlResolver({
        chromeApi: chrome,
        size: FAVICON_PROXY_SIZE,
        shouldBlockFaviconForHost,
        shouldAvoidDirectFaviconForHost,
        isEnhancedFaviconFetchEnabled: isNewtabEnhancedFaviconFetchEnabled,
        getStrictFaviconReason: getNewtabStrictFaviconReason,
        logFaviconDecision: logNewtabFaviconDecision
      });
    }
    return pageFaviconUrlResolver;
  }

  function getThemeSourceForSuggestion(suggestion) {
    if (suggestion && suggestion.type === 'shortcut') {
      return getShortcutFaviconCandidateUrl(suggestion.url) || getShortcutFaviconDataUrl(suggestion.url);
    }
    if (suggestion && suggestion.provider) {
      const resolver = getPageFaviconUrlResolver();
      return resolver ? resolver.resolveFaviconSource(
        getProviderIcon(suggestion.provider), getProviderFaviconPageUrl(suggestion.provider)
      ) : '';
    }
    const resolver = getPageFaviconUrlResolver();
    return resolver
      ? resolver.resolveFaviconSource(suggestion && suggestion.favicon, suggestion && suggestion.url)
      : '';
  }

  function navigateToUrl(url) {
    if (!url) {
      return;
    }
    if (chrome.tabs && chrome.tabs.getCurrent) {
      chrome.tabs.getCurrent(function(tab) {
        if (chrome.runtime.lastError) {
          window.location.href = url;
          return;
        }
        if (tab && tab.id) {
          chrome.tabs.update(tab.id, { url: url });
        } else {
          window.location.href = url;
        }
      });
    } else {
      window.location.href = url;
    }
  }

  function isMiddleClick(event) {
    return NAVIGATION_DISPOSITION.isMiddleClick(event);
  }

  function isBackgroundOpenEvent(event) {
    if (numberShortcutInstantEnabled) {
      return isMiddleClick(event);
    }
    return NAVIGATION_DISPOSITION.isBackgroundOpenEvent(event);
  }

  function getOpenDisposition(event, fallback) {
    if (typeof event === 'string') {
      return event === 'backgroundTab' ? 'backgroundTab' : (fallback || event || 'newTab');
    }
    return NAVIGATION_DISPOSITION.getDisposition(event, fallback);
  }

  function openExternalNewTabUrl(url, eventOrDisposition) {
    if (!url) {
      return false;
    }
    const disposition = typeof eventOrDisposition === 'string'
      ? eventOrDisposition
      : getOpenDisposition(eventOrDisposition, 'newTab');
    if (chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      chrome.runtime.sendMessage({
        action: 'createTab',
        url,
        disposition
      });
      return true;
    }
    if (chrome && chrome.tabs && typeof chrome.tabs.create === 'function') {
      chrome.tabs.create({ url, active: disposition !== 'backgroundTab' });
      return true;
    }
    window.open(url, '_blank', 'noopener');
    return true;
  }

  function openUrlFromNewtabCard(url, options) {
    if (!url) {
      return;
    }
    const config = options && typeof options === 'object' ? options : {};
    if (config.openInBackgroundTab &&
        chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      chrome.runtime.sendMessage({
        action: 'createTab',
        url: url,
        disposition: 'backgroundTab'
      });
      return;
    }
    navigateToUrl(url);
  }

  function openShortcutUrl(shortcut, event) {
    if (shortcut && shortcut.type === 'folder') {
      const tile = getShortcutTileById(shortcut.id);
      bookmarksRuntime.ensureReady(false).then((ready) => {
        const node = ready && bookmarksRuntime.getNode(getShortcutFolderId(shortcut));
        if (!node || node.url) {
          showToast(t('newtab_shortcuts_folder_missing', 'This bookmark folder is no longer available.'), true);
          return;
        }
        openBookmarkCascadeMenu({ ...node, type: 'folder' }, tile);
      });
      return;
    }
    if (!shortcut || !shortcut.url) {
      return;
    }
    openUrlFromNewtabCard(shortcut.url, {
      openInBackgroundTab: isBackgroundOpenEvent(event)
    });
  }

  function recordSearchSuggestionSelection(suggestion, rawQuery) {
    if (!suggestion || suggestion.forceSearch || suggestion.provider || !suggestion.url ||
        !chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      return;
    }
    const query = String(rawQuery || latestRawQuery || (inputParts && inputParts.input ? inputParts.input.value : '') || '').trim();
    if (!query) {
      return;
    }
    chrome.runtime.sendMessage({
      action: 'recordSearchSuggestionSelection',
      query,
      url: suggestion.url,
      title: suggestion.title || '',
      type: suggestion.type || 'history',
      source: 'newtab'
    }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        // Best-effort ranking signal.
      }
    });
  }

  function openBookmarkFolder(nodeId) {
    const id = String(nodeId || '').trim();
    if (!id) {
      return;
    }
    navigateBookmarkFolder(id);
  }

  function markCurrentTabForSearchTracking() {
    if (!chrome || !chrome.tabs || !chrome.tabs.getCurrent || !chrome.runtime || !chrome.runtime.sendMessage) {
      return;
    }
    chrome.tabs.getCurrent((tab) => {
      if (tab && typeof tab.id === 'number') {
        chrome.runtime.sendMessage({ action: 'trackSearchTab', tabId: tab.id });
      }
    });
  }

  function runBrowserSearch(query, disposition, onFail) {
    if (chrome && chrome.search && typeof chrome.search.query === 'function') {
      try {
        chrome.search.query({ text: query, disposition: disposition || 'CURRENT_TAB' }, () => {
          if (chrome.runtime && chrome.runtime.lastError && typeof onFail === 'function') {
            onFail();
          }
        });
        return true;
      } catch (e) {
        if (typeof onFail === 'function') {
          onFail();
        }
        return false;
      }
    }
    return false;
  }

  function navigateToQuery(query, forceSearch) {
    const directUrl = !forceSearch ? getDirectNavigationUrl(query) : '';
    let targetUrl = query;
    if (directUrl) {
      navigateToUrl(directUrl);
      return;
    }
    markCurrentTabForSearchTracking();
    const attempted = runBrowserSearch(query, 'CURRENT_TAB', () => {
      const fallbackUrl = buildDefaultSearchUrl(query);
      navigateToUrl(fallbackUrl);
    });
    if (attempted) {
      return;
    }
    targetUrl = buildDefaultSearchUrl(query);
    navigateToUrl(targetUrl);
  }

  const pageStructureRuntime = NEWTAB_PAGE_STRUCTURE.createPageStructure({
    documentObj: document,
    getRiSvg
  });
  const suggestionsContainer = pageStructureRuntime.suggestions.container;
  suggestionsContainer.addEventListener('wheel', function(event) {
    SUGGESTION_NAVIGATION.preventNumberShortcutWheel(event, suggestionsContainer);
  }, { passive: false });
  document.addEventListener('pointerdown', function() {
    SUGGESTION_NAVIGATION.cancelNumberShortcuts(suggestionsContainer);
  }, true);
  const suggestionsSurface = pageStructureRuntime.suggestions.surface;
  const suggestionsOutline = pageStructureRuntime.suggestions.outline;
  const bookmarkSection = pageStructureRuntime.bookmark.section;
  const recentSection = pageStructureRuntime.recent.section;
  searchLayer = pageStructureRuntime.searchLayer;
  const topActionTooltipController = globalThis.LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_top_action_tooltip_2026_unique_',
    appendTo: document.body,
    maxWidth: 420
  });
  const shortcutTooltipController = globalThis.LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_shortcut_tooltip_2026_unique_',
    className: 'x-nt-shortcut-tooltip',
    appendTo: document.body,
    maxWidth: 360
  });
  const shortcutDialogTooltipController = globalThis.LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_shortcut_dialog_tooltip_2026_unique_',
    className: 'x-nt-shortcut-dialog-tooltip',
    appendTo: document.body,
    maxWidth: 320
  });
  const bookmarkCascadeCopyTooltipController = globalThis.LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_bookmark_cascade_copy_tooltip_2026_unique_',
    className: 'x-nt-bookmark-cascade-copy-tooltip',
    appendTo: document.body,
    maxWidth: 200
  });
  const bookmarkCursorTooltipController = globalThis.LumnoCursorTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_bookmark_cursor_tooltip_2026_unique_',
    className: 'x-nt-bookmark-cursor-tooltip',
    appendTo: document.body,
    maxWidth: 460,
    offsetX: 14,
    offsetY: 16
  });
  const searchInputCursorTooltipController = globalThis.LumnoCursorTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_search_input_cursor_tooltip_2026_unique_',
    appendTo: document.body,
    maxWidth: 520,
    offsetX: 14,
    offsetY: 16
  });
  markNewtabStartupMilestone('page-structure-created');

  function showTopActionTooltip(button, text, options) {
    if (!button || !text) {
      return;
    }
    const tooltipOptions = options && typeof options === 'object' ? options : {};
    const placement = tooltipOptions.placement === 'left' || tooltipOptions.placement === 'left-above'
      ? tooltipOptions.placement
      : 'top';
    topActionTooltipController.show(button, text, Object.assign({}, tooltipOptions, {
      placement,
      maxWidth: 420
    }));
  }

  function hideTopActionTooltip() {
    topActionTooltipController.hide();
  }

  function bindSearchInputCursorTooltip(button, getText) {
    if (!button) {
      return null;
    }
    return searchInputCursorTooltipController.bind(button, getText, {
      maxWidth: 420,
      deferHideVisibility: true,
      preserveVisibleOnTargetSwitch: true,
      handoffRoot: inputParts && inputParts.container
        ? inputParts.container
        : null
    });
  }

  function hideSearchInputCursorTooltip() {
    searchInputCursorTooltipController.hide();
  }

  function bindShortcutTooltip(target, getText, options) {
    if (!target) {
      return null;
    }
    const tooltipOptions = options && typeof options === 'object' ? options : {};
    const resolveText = typeof getText === 'function'
      ? getText
      : () => (typeof target.getAttribute === 'function' ? target.getAttribute('data-tooltip') : '');
    return shortcutTooltipController.bind(target, (tooltipTarget) => {
      if (isShortcutTooltipSuppressed()) {
        return '';
      }
      const tooltip = shortcutTooltipController.element;
      if (tooltip && tooltipTarget.classList.contains('x-nt-shortcut-tile--folder')) {
        tooltip.setAttribute('data-shortcut-origin-label',
          t('newtab_shortcuts_from_bookmarks', '(from bookmarks bar)'));
      } else if (tooltip) {
        tooltip.removeAttribute('data-shortcut-origin-label');
      }
      return resolveText(tooltipTarget);
    }, Object.assign({
      placement: 'bottom',
      maxWidth: 360,
      spacing: () => (newtabShortcutDockMagnificationEnabled ? -6 : -2),
      showOnFocus: false
    }, tooltipOptions));
  }

  function isShortcutTooltipSuppressed() {
    return Boolean(
      isShortcutDragActive() ||
      isBookmarkDragActive() ||
      (shortcutGrid && shortcutGrid.getAttribute('data-shortcut-dragging') === 'true') ||
      isShortcutContextMenuOpen()
    );
  }

  function hideShortcutTooltip() {
    shortcutTooltipController.hide();
  }

  function bindShortcutDialogTooltip(target, getText, options) {
    if (!target) {
      return null;
    }
    return shortcutDialogTooltipController.bind(target, getText, Object.assign({
      placement: 'top',
      maxWidth: 320
    }, options || {}));
  }

  function hideShortcutDialogTooltip() {
    shortcutDialogTooltipController.hide();
  }

  function bindCursorTooltip(target, getText, options) {
    if (!target) {
      return null;
    }
    const tooltipOptions = options && typeof options === 'object' ? options : {};
    const originalShouldShow = typeof tooltipOptions.shouldShow === 'function'
      ? tooltipOptions.shouldShow
      : null;
    return bookmarkCursorTooltipController.bind(target, getText, Object.assign({
      maxWidth: 460
    }, tooltipOptions, {
      shouldShow: (tooltipTarget, inputEvent) => {
        if (isBookmarkCursorTooltipSuppressed(tooltipTarget)) {
          return false;
        }
        return originalShouldShow ? originalShouldShow(tooltipTarget, inputEvent) !== false : true;
      }
    }));
  }

  function isBookmarkCursorTooltipSuppressed(target) {
    return shouldSuppressBookmarkHover(target);
  }

  function hideCursorTooltip() {
    bookmarkCursorTooltipController.hide();
  }

  function getSectionModeSelectOptions(config) {
    const rawOptions = config && typeof config.getOptions === 'function'
      ? config.getOptions()
      : (config && config.options);
    const options = Array.isArray(rawOptions) ? rawOptions : [];
    return options.map((item) => {
      const value = String(item && item.value !== undefined ? item.value : '');
      const option = {
        value,
        label: t(item && item.labelKey, (item && item.fallback) || value)
      };
      if (item && item.action) {
        option.action = String(item.action);
      }
      if (item && item.iconClass) {
        option.iconClass = String(item.iconClass);
      }
      if (item && item.dividerBefore) {
        option.dividerBefore = true;
      }
      if (item && item.radio) {
        option.radio = true;
        option.checked = item.checked === true;
      }
      if (item && item.uncheckedIconClass) {
        option.uncheckedIconClass = String(item.uncheckedIconClass);
      }
      return option;
    });
  }

  function getBookmarkViewModeOptions() {
    const effectiveSurfaceMode = getEffectiveBookmarkTopbarSurfaceMode();
    const options = [
      {
        value: 'folder',
        labelKey: 'bookmark_view_mode_folder',
        fallback: 'Multi-layer folder view'
      },
      {
        value: 'list',
        labelKey: 'bookmark_view_mode_list',
        fallback: 'Multi-level list view'
      },
      {
        value: 'top',
        labelKey: 'bookmark_view_mode_top',
        fallback: 'Top bookmarks bar'
      }
    ];
    if (!isBookmarkTopbarMode()) {
      return options;
    }
    options.push({
      value: '__bookmark_topbar_surface_adaptive__',
      action: `${BOOKMARK_TOPBAR_SURFACE_MODE_ACTION}:adaptive`,
      labelKey: 'bookmark_topbar_surface_adaptive',
      fallback: 'Adaptive mist',
      radio: true,
      checked: effectiveSurfaceMode === 'adaptive',
      dividerBefore: true
    });
    options.push({
      value: '__bookmark_topbar_surface_clear__',
      action: `${BOOKMARK_TOPBAR_SURFACE_MODE_ACTION}:clear`,
      labelKey: 'bookmark_topbar_surface_clear',
      fallback: 'Clear glass',
      radio: true,
      checked: effectiveSurfaceMode === 'clear'
    });
    options.push({
      value: '__bookmark_topbar_surface_transparent__',
      action: `${BOOKMARK_TOPBAR_SURFACE_MODE_ACTION}:transparent`,
      labelKey: 'bookmark_topbar_surface_transparent',
      fallback: 'Transparent',
      radio: true,
      checked: effectiveSurfaceMode === 'transparent'
    });
    options.push({
      value: '__pick_bookmark_topbar_color__',
      action: BOOKMARK_TOPBAR_PICK_COLOR_ACTION,
      labelKey: 'bookmark_topbar_surface_custom',
      fallback: 'Custom color',
      radio: true,
      uncheckedIconClass: 'ri-dropper-line',
      checked: effectiveSurfaceMode === 'custom'
    });
    return options;
  }

  function createSectionModeSelect(config) {
    if (!sectionModeSelectController || typeof sectionModeSelectController.createSelect !== 'function') {
      return null;
    }
    const currentValue = typeof config.getValue === 'function' ? config.getValue() : '';
    const title = t(config.menuTitleKey, config.menuTitleFallback || 'Display mode');
    const created = sectionModeSelectController.createSelect({
      id: config.id,
      selectId: config.id ? `${config.id}_select` : '',
      className: 'x-nt-section-mode-select',
      iconOnly: true,
      triggerIconClass: 'ri-more-line',
      menuClassName: 'x-nt-section-mode-portal',
      menuAlign: 'left',
      menuWidth: 'content',
      menuMinWidth: SECTION_MODE_MENU_MIN_WIDTH_PX,
      menuMaxWidth: SECTION_MODE_MENU_MAX_WIDTH_PX,
      menuPortal: true,
      menuPortalZIndex: SECTION_MODE_MENU_PORTAL_Z_INDEX,
      menuPortalOffset: SECTION_MODE_MENU_PORTAL_OFFSET_PX,
      menuTitle: title,
      value: currentValue,
      ariaLabel: title,
      tooltip: title,
      onAction: typeof config.onAction === 'function'
        ? ({ action }) => config.onAction(action)
        : null,
      options: getSectionModeSelectOptions(config)
    });
    const control = created.wrapper;
    const select = created.select;
    const trigger = created.trigger;
    if (!control || !select || !trigger) {
      return null;
    }
    const api = {
      control,
      select,
      trigger,
      update: () => {
        const nextTitle = t(config.menuTitleKey, config.menuTitleFallback || 'Display mode');
        const nextValue = typeof config.getValue === 'function' ? config.getValue() : '';
        if (typeof sectionModeSelectController.setMenuTitle === 'function') {
          sectionModeSelectController.setMenuTitle(control, nextTitle);
        }
        sectionModeSelectController.setOptions(control, getSectionModeSelectOptions(config), nextValue);
        trigger.setAttribute('aria-label', nextTitle);
        trigger.setAttribute('data-tooltip', nextTitle);
      }
    };
    select.addEventListener('change', () => {
      const nextMode = String(select.value || '');
      if (typeof config.onChange === 'function') {
        config.onChange(nextMode);
      }
    });
    const showButtonTooltip = () => {
      if (sectionModeSelectController.isOpen(control)) {
        return;
      }
      const placement = trigger.closest &&
        trigger.closest('.x-nt-bookmarks-topbar')
        ? 'bottom'
        : 'top';
      showTopActionTooltip(
        trigger,
        trigger.getAttribute('data-tooltip') || t('display_mode_title', 'Display mode'),
        { placement }
      );
    };
    trigger.addEventListener('mouseenter', showButtonTooltip);
    trigger.addEventListener('mouseleave', hideTopActionTooltip);
    trigger.addEventListener('focus', showButtonTooltip);
    trigger.addEventListener('blur', hideTopActionTooltip);
    api.update();
    return api;
  }

  function setContentSectionVisible(section, visible) {
    if (!section) {
      return;
    }
    section.setAttribute('data-content-visible', visible ? 'true' : 'false');
    section.setAttribute('data-visible', visible && !zenModeEnabled ? 'true' : 'false');
    if (section === recentSection && (!visible || zenModeEnabled)) {
      closeRecentContextMenu();
    }
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function isContentSectionVisible(section) {
    return Boolean(section && section.getAttribute('data-visible') === 'true');
  }

  function applyNewtabShortcutLayoutPreferences() {
    if (!document.documentElement || !document.documentElement.style) {
      return;
    }
    const rootStyle = document.documentElement.style;
    const size = normalizeNewtabShortcutSize(newtabShortcutSize);
    const gap = normalizeNewtabShortcutGap(newtabShortcutGap);
    rootStyle.setProperty('--x-nt-shortcut-user-tile-size', `${size}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-icon-size', `${size * 0.75}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-icon-radius', `${size * 0.25}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-favicon-size', `${size * 0.4375}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-tile-padding', `${size * 0.125}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-column-gap', `${gap}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-row-gap', `${gap + 6}px`);
    applyNewtabShortcutColumns();
  }

  function applyNewtabShortcutColumns() {
    if (!document.documentElement || !document.documentElement.style) {
      return;
    }
    document.documentElement.style.setProperty(
      '--x-nt-shortcut-columns',
      String(newtabShortcutColumns)
    );
    if (!shortcutGrid || typeof window.getComputedStyle !== 'function') {
      return;
    }
    const gridStyle = window.getComputedStyle(shortcutGrid);
    const tileSize = Number.parseFloat(
      gridStyle.getPropertyValue('--x-nt-shortcut-tile-size')
    );
    const columnGap = Number.parseFloat(gridStyle.columnGap);
    const paddingLeft = Number.parseFloat(gridStyle.paddingLeft);
    const paddingRight = Number.parseFloat(gridStyle.paddingRight);
    if (![tileSize, columnGap, paddingLeft, paddingRight].every(Number.isFinite)) {
      return;
    }
    const targetWidth =
      (tileSize * newtabShortcutColumns) +
      (columnGap * Math.max(0, newtabShortcutColumns - 1)) +
      paddingLeft +
      paddingRight;
    document.documentElement.style.setProperty(
      '--x-nt-shortcuts-target-width',
      `${Math.round(targetWidth)}px`
    );
  }

  function applyNewtabShortcutsVisibility() {
    if (!shortcutSection) {
      return;
    }
    const hasVisibleContent = getVisibleShortcuts().length > 0 ||
      (newtabShortcutAddVisible && newtabShortcuts.length < MAX_NEWTAB_SHORTCUTS);
    setContentSectionVisible(
      shortcutSection,
      Boolean(newtabShortcutsVisible && hasVisibleContent)
    );
    if (!newtabShortcutsVisible || !hasVisibleContent || zenModeEnabled) {
      resetShortcutDockHover();
      closeShortcutContextMenu();
      closeShortcutDialog();
    }
  }

  function getShortcutFolderId(shortcut) {
    if (!shortcut || shortcut.type !== 'folder') return '';
    if (!shortcut.folderRef) return String(shortcut.folderId || '');
    const node = shortcutFolderRuntime.getNode(shortcut, bookmarksRuntime.getNodeMap());
    return node ? String(node.id) : '';
  }

  function getVisibleShortcuts() {
    return shortcutFolderRuntime.visibleItems(newtabShortcuts, bookmarksRuntime.getNodeMap());
  }

  function refreshShortcutFolderReferences() {
    if (bookmarkMoveHistoryBusy) return Promise.resolve(false);
    const original = newtabShortcuts;
    return Promise.all([shortcutFolderRuntime.ready, bookmarksRuntime.ensureReady(false)]).then(([, ready]) => {
      if (!ready || bookmarkMoveHistoryBusy || isShortcutDragActive() || newtabShortcuts !== original) return false;
      const next = shortcutFolderRuntime.reconcile(original, bookmarksRuntime.getNodeMap());
      return shortcutFolderRuntime.flush().then(() => {
        if (newtabShortcuts !== original || bookmarkMoveHistoryBusy || isShortcutDragActive()) return false;
        if (JSON.stringify(next) !== JSON.stringify(original)) return persistShortcuts(next);
        renderShortcuts();
        return true;
      });
    }).catch((error) => {
      console.warn('[Lumno] Could not update shortcut folder references.', error);
      return false;
    });
  }

  function getShortcutStoreOptions(extraOptions) {
    return {
      key: NEWTAB_SHORTCUTS_STORAGE_KEY,
      maxShortcuts: MAX_NEWTAB_SHORTCUTS,
      normalizeHost,
      sanitizeDisplayText,
      ...(extraOptions || {})
    };
  }

  function isShortcutSyncStorageActive() {
    return Boolean(
      (providerStorageRuntime ? providerStorageRuntime.getActiveAreaName() : storageAreaName) === 'sync' &&
      chrome && chrome.storage && chrome.storage.sync
    );
  }

  function getShortcutOverflowStorageArea() {
    return isShortcutSyncStorageActive() && chrome.storage.local
      ? chrome.storage.local
      : null;
  }

  function getShortcutStorageLastError() {
    return chrome && chrome.runtime && chrome.runtime.lastError
      ? chrome.runtime.lastError
      : null;
  }

  function getStorageBytesInUse(area, keys) {
    return new Promise((resolve, reject) => {
      if (!area || typeof area.getBytesInUse !== 'function') {
        reject(new Error('Storage byte usage is unavailable'));
        return;
      }
      try {
        const maybePromise = area.getBytesInUse(keys, (bytesInUse) => {
          const runtimeError = getShortcutStorageLastError();
          if (runtimeError) {
            reject(new Error(runtimeError.message || 'Could not read sync byte usage'));
            return;
          }
          resolve(Math.max(0, Number(bytesInUse) || 0));
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then((bytesInUse) => {
            resolve(Math.max(0, Number(bytesInUse) || 0));
          }).catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  function getShortcutSyncByteBudget() {
    const defaultBudget = Number(
      NEWTAB_SHORTCUTS_STORE.DEFAULT_SHORTCUTS_SYNC_TOTAL_BUDGET_BYTES
    ) || (3 * 7680);
    if (!isShortcutSyncStorageActive()) {
      return Promise.resolve(Number.MAX_SAFE_INTEGER);
    }
    const syncArea = chrome.storage.sync;
    const totalQuotaBytes = Math.max(
      0,
      Number(syncArea.QUOTA_BYTES) || (100 * 1024)
    );
    return Promise.all([
      getStorageBytesInUse(syncArea, null),
      getStorageBytesInUse(syncArea, NEWTAB_SHORTCUTS_STORAGE_KEYS)
    ]).then(([totalBytes, shortcutBytes]) => {
      const nonShortcutBytes = Math.max(0, totalBytes - shortcutBytes);
      const protectedBudget = Math.max(
        0,
        totalQuotaBytes - NEWTAB_SHORTCUTS_CRITICAL_SYNC_RESERVE_BYTES - nonShortcutBytes
      );
      return Math.min(defaultBudget, protectedBudget);
    }).catch(() => 0);
  }

  function normalizeShortcutLocalState(value) {
    if (Array.isArray(value)) {
      return {
        authoritative: false,
        items: NEWTAB_SHORTCUTS_STORE.normalizeShortcuts(
          value,
          getShortcutStoreOptions()
        )
      };
    }
    const source = value && typeof value === 'object' ? value : {};
    return {
      authoritative: source.authoritative === true,
      items: NEWTAB_SHORTCUTS_STORE.normalizeShortcuts(
        source.items,
        getShortcutStoreOptions()
      )
    };
  }

  function readShortcutLocalState() {
    const overflowArea = getShortcutOverflowStorageArea();
    if (!overflowArea || typeof overflowArea.get !== 'function') {
      return Promise.resolve(normalizeShortcutLocalState(null));
    }
    return new Promise((resolve) => {
      try {
        overflowArea.get([NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY], (result) => {
          if (getShortcutStorageLastError()) {
            resolve(normalizeShortcutLocalState(null));
            return;
          }
          resolve(normalizeShortcutLocalState(
            result && result[NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY]
          ));
        });
      } catch (error) {
        resolve(normalizeShortcutLocalState(null));
      }
    });
  }

  function writeShortcutLocalState(items, authoritative) {
    const overflowArea = getShortcutOverflowStorageArea();
    if (!overflowArea || typeof overflowArea.set !== 'function') {
      return Promise.resolve();
    }
    const localState = {
      version: 1,
      authoritative: authoritative === true,
      items: NEWTAB_SHORTCUTS_STORE.normalizeShortcuts(
        items,
        getShortcutStoreOptions()
      ),
      updatedAt: Date.now()
    };
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = overflowArea.set({
          [NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY]: localState
        }, () => {
          const runtimeError = getShortcutStorageLastError();
          if (runtimeError) {
            reject(new Error(runtimeError.message || 'Could not save local shortcuts'));
            return;
          }
          resolve();
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve).catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  function scheduleShortcutStorageReload() {
    if (shortcutStorageReloadTimer !== null) {
      window.clearTimeout(shortcutStorageReloadTimer);
    }
    shortcutStorageReloadTimer = window.setTimeout(() => {
      shortcutStorageReloadTimer = null;
      loadShortcuts().then(() => {
        pruneShortcutFavicons(newtabShortcuts);
        const prunedIcons = getNextShortcutIconMap(newtabShortcuts);
        if (!areShortcutIconMapsEqual(newtabShortcutIcons, prunedIcons)) {
          newtabShortcutIcons = prunedIcons;
          shortcutIconStore.writeAll(prunedIcons).catch(() => {});
        }
        renderShortcuts();
      });
    }, 32);
  }

  function getShortcutIconDataUrl(shortcutId) {
    const id = String(shortcutId || '').trim();
    return id && newtabShortcutIcons[id] ? newtabShortcutIcons[id] : '';
  }

  function getShortcutFaviconDataUrl(pageUrl) {
    const normalizedPageUrl = SHORTCUT_FAVICON.normalizePageUrl(pageUrl);
    const shortcut = newtabShortcuts.find((item) => SHORTCUT_FAVICON.normalizePageUrl(item && item.url) === normalizedPageUrl);
    const source = shortcut && shortcut.iconSource;
    if (source === 'builtin') return '';
    const entry = normalizedPageUrl && newtabShortcutFavicons[normalizedPageUrl];
    if (entry && ['service', 'favicon-is', 'cache'].includes(source)) {
      const savedSource = SHORTCUT_FAVICON.getCachedIconSource(entry);
      if (source !== savedSource) return '';
    }
    return SHORTCUT_FAVICON.getCachedIconDataUrl(newtabShortcutFavicons, pageUrl);
  }

  function getShortcutFaviconCandidateUrl(pageUrl) {
    // A saved snapshot, including an explicit refresh, takes precedence over bundled defaults.
    if (getShortcutFaviconDataUrl(pageUrl)) {
      return '';
    }
    const normalizedPageUrl = SHORTCUT_FAVICON.normalizePageUrl(pageUrl);
    const shortcut = newtabShortcuts.find((item) => SHORTCUT_FAVICON.normalizePageUrl(item && item.url) === normalizedPageUrl);
    if (normalizedPageUrl && (!shortcut || shortcut.iconSource !== 'builtin')) return '';
    const resolver = getPageFaviconUrlResolver();
    return resolver ? resolver.getShortcutFaviconCandidateUrl(
      pageUrl, getShortcutDialogBuiltinIconUrl(pageUrl)
    ) : '';
  }

  function saveShortcutFaviconSnapshot(pageUrl, dataUrl, sourceUrl, replaceExisting) {
    const normalizedDataUrl = SHORTCUT_FAVICON.normalizeDataUrl(dataUrl);
    if (!normalizedDataUrl || !newtabShortcuts.some((item) =>
        SHORTCUT_FAVICON.normalizePageUrl(item && item.url) === pageUrl)) {
      return '';
    }
    const savedDataUrl = getShortcutFaviconDataUrl(pageUrl);
    if (savedDataUrl && replaceExisting !== true) {
      return savedDataUrl;
    }
    newtabShortcutFavicons = SHORTCUT_FAVICON.setCachedIcon(
      newtabShortcutFavicons, pageUrl, normalizedDataUrl, sourceUrl
    );
    scheduleShortcutFaviconCacheWrite(pageUrl);
    return normalizedDataUrl;
  }

  function areShortcutFaviconEntriesEqual(left, right) {
    return Boolean(left && right &&
      left.dataUrl === right.dataUrl &&
      left.sourceUrl === right.sourceUrl &&
      left.updatedAt === right.updatedAt);
  }

  function getShortcutDialogOnlineIconUrl(url) {
    const pageUrl = NEWTAB_SHORTCUTS_STORE.normalizeShortcutUrl(url);
    return pageUrl ? getShortcutFaviconDataUrl(pageUrl) || getShortcutFaviconCandidateUrl(pageUrl) : '';
  }

  function getShortcutDialogBuiltinIconUrl(url) {
    const pageUrl = NEWTAB_SHORTCUTS_STORE.normalizeShortcutUrl(url);
    const assetPath = SHORTCUT_FAVICON.getBundledShortcutIconAssetPath(
      pageUrl, SEARCH_UTILS.getDefaultSiteSearchProviders()
    );
    return assetPath ? getExtensionResourceUrl(assetPath) : '';
  }

  function getShortcutDialogOnlineIconSource(url) {
    const pageUrl = SHORTCUT_FAVICON.normalizePageUrl(
      NEWTAB_SHORTCUTS_STORE.normalizeShortcutUrl(url)
    );
    const shortcut = newtabShortcuts.find((item) => SHORTCUT_FAVICON.normalizePageUrl(item && item.url) === pageUrl);
    if (shortcut && ['service', 'favicon-is', 'cache', 'builtin'].includes(shortcut.iconSource)) {
      return shortcut.iconSource;
    }
    const entry = pageUrl && newtabShortcutFavicons[pageUrl];
    if (entry && SHORTCUT_FAVICON.isCachedIconForPage(entry, pageUrl)) {
      return SHORTCUT_FAVICON.getCachedIconSource(entry);
    }
    return 'cache';
  }

  function isShortcutDialogIconSourceAvailable(source, url) {
    const pageUrl = NEWTAB_SHORTCUTS_STORE.normalizeShortcutUrl(url);
    if (!pageUrl) return source === 'cache';
    const normalizedPageUrl = SHORTCUT_FAVICON.normalizePageUrl(pageUrl);
    const resolver = getPageFaviconUrlResolver();
    return normalizedPageUrl
      ? Boolean(resolver && resolver.getShortcutFaviconFetchCandidates(normalizedPageUrl, source).length)
      : source === 'cache';
  }

  function refreshShortcutDialogOnlineIcon(url, iconSource) {
    const pageUrl = NEWTAB_SHORTCUTS_STORE.normalizeShortcutUrl(url);
    const normalizedPageUrl = SHORTCUT_FAVICON.normalizePageUrl(pageUrl);
    if (!normalizedPageUrl) {
      if (iconSource === 'service' || iconSource === 'favicon-is') return Promise.resolve(null);
      // Internal browser pages can only use their browser-provided icon.
      const browserIcon = pageUrl ? getShortcutFaviconCandidateUrl(pageUrl) : '';
      return Promise.resolve(browserIcon ? { dataUrl: browserIcon, pageUrl } : null);
    }
    const resolver = getPageFaviconUrlResolver();
    if (!resolver || resolver.getShortcutFaviconFetchCandidates(normalizedPageUrl, iconSource).length === 0) {
      return Promise.resolve(null);
    }
    const policyRevision = shortcutFaviconPolicyRevision;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const timeoutId = window.setTimeout(() => finish(null), 8000);
      const sent = sendRuntimeMessage({
        action: 'getShortcutFaviconData',
        pageUrl: normalizedPageUrl,
        refresh: true,
        ...(['service', 'favicon-is', 'cache'].includes(iconSource) ? { iconSource } : {})
      }, (response) => {
        window.clearTimeout(timeoutId);
        const dataUrl = SHORTCUT_FAVICON.normalizeDataUrl(response && response.data);
        finish(dataUrl && policyRevision === shortcutFaviconPolicyRevision
          ? { dataUrl, pageUrl: normalizedPageUrl, sourceUrl: String(response.sourceUrl || '') }
          : null);
      });
      if (!sent) {
        window.clearTimeout(timeoutId);
        finish(null);
      }
    });
  }

  function scheduleShortcutFaviconCacheWrite(pageUrl) {
    const cacheKey = SHORTCUT_FAVICON.normalizePageUrl(pageUrl);
    const cacheEntry = cacheKey ? newtabShortcutFavicons[cacheKey] : null;
    if (cacheKey && cacheEntry) {
      shortcutFaviconPendingCacheEntries[cacheKey] = cacheEntry;
    }
    if (shortcutFaviconCacheWriteTimer !== null) {
      window.clearTimeout(shortcutFaviconCacheWriteTimer);
    }
    shortcutFaviconCacheWriteTimer = window.setTimeout(() => {
      shortcutFaviconCacheWriteTimer = null;
      const pendingEntries = { ...shortcutFaviconPendingCacheEntries };
      if (Object.keys(pendingEntries).length === 0) {
        return;
      }
      shortcutFaviconStore.mergeAll(pendingEntries).then((savedEntries) => {
        Object.keys(pendingEntries).forEach((key) => {
          if (areShortcutFaviconEntriesEqual(shortcutFaviconPendingCacheEntries[key], pendingEntries[key])) {
            delete shortcutFaviconPendingCacheEntries[key];
          }
        });
        newtabShortcutFavicons = SHORTCUT_FAVICON.normalizeCacheMap({
          ...savedEntries,
          ...shortcutFaviconPendingCacheEntries
        });
      }).catch(() => {});
    }, 120);
  }

  function drainShortcutFaviconRequestQueue() {
    while (shortcutFaviconActiveRequestCount < SHORTCUT_FAVICON_MAX_CONCURRENT_REQUESTS &&
        shortcutFaviconRequestQueue.length > 0) {
      const task = shortcutFaviconRequestQueue.shift();
      shortcutFaviconActiveRequestCount += 1;
      Promise.resolve().then(task.run).then(task.resolve, () => task.resolve('')).finally(() => {
        shortcutFaviconActiveRequestCount = Math.max(0, shortcutFaviconActiveRequestCount - 1);
        drainShortcutFaviconRequestQueue();
      });
    }
  }

  function enqueueShortcutFaviconRequest(run) {
    return new Promise((resolve) => {
      shortcutFaviconRequestQueue.push({ run, resolve });
      drainShortcutFaviconRequestQueue();
    });
  }

  function resolveShortcutFaviconDataUrl(pageUrl) {
    const normalizedPageUrl = SHORTCUT_FAVICON.normalizePageUrl(pageUrl);
    if (!normalizedPageUrl) {
      return Promise.resolve('');
    }
    const shortcut = newtabShortcuts.find((item) => SHORTCUT_FAVICON.normalizePageUrl(item && item.url) === normalizedPageUrl);
    const iconSource = shortcut && shortcut.iconSource;
    if (iconSource === 'builtin') return Promise.resolve('');
    const cachedDataUrl = getShortcutFaviconDataUrl(normalizedPageUrl);
    if (cachedDataUrl) {
      return Promise.resolve(cachedDataUrl);
    }
    const policyRevision = shortcutFaviconPolicyRevision;
    const requestKey = `${normalizedPageUrl}::${policyRevision}::${iconSource || 'auto'}`;
    if (shortcutFaviconPending.has(requestKey)) {
      return shortcutFaviconPending.get(requestKey);
    }
    const promise = enqueueShortcutFaviconRequest(async () => {
      await faviconCacheRuntime.ensureCachesReady();
      const shortcutStillExists = newtabShortcuts.some((item) =>
        SHORTCUT_FAVICON.normalizePageUrl(item && item.url) === normalizedPageUrl);
      if (!shortcutStillExists || policyRevision !== shortcutFaviconPolicyRevision) {
        return '';
      }
      const savedDataUrl = getShortcutFaviconDataUrl(normalizedPageUrl);
      if (savedDataUrl) {
        return savedDataUrl;
      }
      const cacheKey = FAVICON_UTILS.getFaviconPersistCacheKey(normalizedPageUrl);
      const existingEntry = getPersistedFaviconDataEntry(cacheKey);
      if (!iconSource && SHORTCUT_FAVICON.isCachedIconForPage(existingEntry, normalizedPageUrl) &&
          SHORTCUT_FAVICON.normalizeDataUrl(existingEntry.dataUrl)) {
        return saveShortcutFaviconSnapshot(normalizedPageUrl, existingEntry.dataUrl, existingEntry.sourceUrl || '');
      }
      const resolver = getPageFaviconUrlResolver();
      if (!resolver || resolver.getShortcutFaviconFetchCandidates(normalizedPageUrl, iconSource).length === 0) {
        return '';
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = (dataUrl) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(dataUrl || '');
        };
        const timeoutId = window.setTimeout(() => finish(''), 8000);
        const sent = sendRuntimeMessage({
          action: 'getShortcutFaviconData',
          pageUrl: normalizedPageUrl,
          ...(['service', 'favicon-is', 'cache'].includes(iconSource) ? { iconSource } : {})
        }, (response) => {
          window.clearTimeout(timeoutId);
          if (settled) {
            return;
          }
          const currentShortcut = newtabShortcuts.find((item) =>
            SHORTCUT_FAVICON.normalizePageUrl(item && item.url) === normalizedPageUrl);
          if (!currentShortcut || currentShortcut.iconSource !== iconSource ||
              policyRevision !== shortcutFaviconPolicyRevision) {
            finish('');
            return;
          }
          finish(saveShortcutFaviconSnapshot(normalizedPageUrl,
            response && response.data, response && response.sourceUrl));
        });
        if (!sent) {
          window.clearTimeout(timeoutId);
          finish('');
        }
      });
    }).finally(() => {
      shortcutFaviconPending.delete(requestKey);
    });
    shortcutFaviconPending.set(requestKey, promise);
    return promise;
  }

  function getShortcutTitle(shortcut) {
    if (shortcut && shortcut.type === 'folder') {
      const node = bookmarksRuntime.getNode(getShortcutFolderId(shortcut));
      return sanitizeDisplayText((node && node.title) || shortcut.title || '') ||
        t('newtab_shortcuts_open_folder', 'Open folder');
    }
    return sanitizeDisplayText(shortcut && shortcut.title ? shortcut.title : '') ||
      sanitizeDisplayText(shortcut && shortcut.host ? shortcut.host : '') ||
      sanitizeDisplayText(shortcut && shortcut.url ? shortcut.url : '') ||
      t('newtab_shortcuts_add', 'Add shortcut');
  }

  function setShortcutError(message) {
    if (shortcutDialogController) {
      shortcutDialogController.setError(message);
    }
  }

  function setShortcutIconError(message) {
    if (shortcutDialogController && typeof shortcutDialogController.setIconError === 'function') {
      shortcutDialogController.setIconError(message);
    }
  }

  function updateShortcutDialogLanguageStrings() {
    if (shortcutDialogController) {
      shortcutDialogController.updateLanguage();
    }
  }

  function getShortcutContextMenuOptions(target) {
    if (target && target.kind === 'add') {
      return [
        {
          value: SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE,
          label: t('newtab_shortcuts_hide_add', 'Hide')
        }
      ];
    }
    const shortcut = target && getShortcutById(target.shortcutId);
    if (shortcut && shortcut.type === 'folder') {
      return [
        { action: NEWTAB_CONTEXT_MENU_OPEN_VALUE, value: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
          label: t('newtab_shortcuts_open_folder', 'Open folder') },
        { action: SHORTCUT_CONTEXT_MENU_EDIT_VALUE, value: SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
          label: t('folder_rename', 'Rename'), dividerBefore: true },
        { action: FOLDER_COLOR_CONTEXT_MENU_VALUE, value: FOLDER_COLOR_CONTEXT_MENU_VALUE,
          label: t('folder_color_change', 'Change color') },
        { action: SHORTCUT_CONTEXT_MENU_REMOVE_VALUE, value: SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
          label: t('shortcuts_remove', 'Remove') }
      ];
    }
    return [
      {
        action: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
        value: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
        label: t('newtab_open_in_new_tab', 'Open in new tab')
      },
      {
        action: SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
        value: SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
        label: t('shortcuts_edit', 'Edit'),
        dividerBefore: true
      },
      {
        action: SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
        value: SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
        label: t('shortcuts_remove', 'Remove')
      }
    ];
  }

  function updateShortcutContextMenuLanguageStrings() {
    if (!shortcutContextMenu || !shortcutContextMenuSelectController) {
      return;
    }
    const label = t('newtab_shortcuts_context_menu_label', 'Shortcut actions');
    if (shortcutContextMenu.trigger) {
      shortcutContextMenu.trigger.setAttribute('aria-label', label);
    }
    if (typeof shortcutContextMenuSelectController.setOptions === 'function') {
      shortcutContextMenuSelectController.setOptions(
        shortcutContextMenu.control,
        getShortcutContextMenuOptions(shortcutContextMenuTarget),
        shortcutContextMenuTarget && shortcutContextMenuTarget.kind === 'add'
          ? SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE
          : NEWTAB_CONTEXT_MENU_OPEN_VALUE
      );
    }
  }

  function updateBookmarkContextMenuLanguageStrings() {
    if (!bookmarkContextMenu || !bookmarkContextMenuSelectController) {
      return;
    }
    if (bookmarkContextMenu.trigger) {
      bookmarkContextMenu.trigger.setAttribute(
        'aria-label',
        t('bookmarks_context_menu_label', 'Bookmark actions')
      );
    }
    if (typeof bookmarkContextMenuSelectController.setOptions === 'function') {
      bookmarkContextMenuSelectController.setOptions(
        bookmarkContextMenu.control,
        getBookmarkContextMenuOptions(bookmarkContextMenuTarget),
        bookmarkContextMenuTarget && bookmarkContextMenuTarget.isFolder
          ? BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE
          : bookmarkContextMenuTarget
            ? NEWTAB_CONTEXT_MENU_OPEN_VALUE
            : BOOKMARK_CONTEXT_MENU_EDIT_VALUE
      );
    }
  }

  function updateRecentContextMenuLanguageStrings() {
    if (!recentContextMenu || !recentContextMenuSelectController) {
      return;
    }
    if (recentContextMenu.trigger) {
      recentContextMenu.trigger.setAttribute(
        'aria-label',
        t('recent_context_menu_label', 'Recent site actions')
      );
    }
    if (typeof recentContextMenuSelectController.setOptions === 'function') {
      recentContextMenuSelectController.setOptions(
        recentContextMenu.control,
        getRecentContextMenuOptions(recentContextMenuTarget),
        NEWTAB_CONTEXT_MENU_OPEN_VALUE
      );
    }
  }

  function updateShortcutLanguageStrings() {
    if (shortcutSection) {
      shortcutSection.setAttribute('aria-label', t('newtab_shortcuts_section_label', 'Shortcuts'));
    }
    if (addShortcutButton) {
      const addLabel = t('newtab_shortcuts_add', 'Add shortcut');
      addShortcutButton.setAttribute('aria-label', addLabel);
      addShortcutButton.setAttribute('data-tooltip', addLabel);
    }
    updateShortcutDialogLanguageStrings();
    if (shortcutGrid) {
      Array.from(shortcutGrid.querySelectorAll('.x-nt-shortcut-tile[data-shortcut-url]')).forEach((tile) => {
        const title = tile.getAttribute('data-shortcut-title') || '';
        tile.setAttribute('aria-label', formatMessage('open_prefix', '打开 {title}', { title }));
      });
    }
    updateShortcutContextMenuLanguageStrings();
    updateBookmarkContextMenuLanguageStrings();
    updateRecentContextMenuLanguageStrings();
  }

  function closeShortcutDialog(options) {
    shortcutDialogOpenRevision += 1;
    if (shortcutDialogController) {
      shortcutDialogController.close({
        ...(options || {}),
        force: true
      });
    }
  }

  async function openShortcutDialog(options) {
    const revision = ++shortcutDialogOpenRevision;
    try {
      if (!shortcutDialogController) {
        if (!shortcutDialogLoadPromise) {
          shortcutDialogLoadPromise = Promise.resolve(createShortcutDialogComponent()).then((controller) => {
            if (!controller) throw new Error('Shortcut dialog unavailable');
            shortcutDialogController = controller;
            controller.mount(document.body);
          }).finally(() => { shortcutDialogLoadPromise = null; });
        }
        await shortcutDialogLoadPromise;
      }
      if (revision === shortcutDialogOpenRevision) shortcutDialogController.open(options);
    } catch (error) {
      console.warn('[Lumno] Failed to load shortcut dialog', error);
      if (revision === shortcutDialogOpenRevision) showToast(t('toast_error', 'Operation failed. Please try again.'), true);
    }
  }

  function getShortcutTileFromNode(node) {
    if (!shortcutGrid || !node) {
      return null;
    }
    const tile = typeof node.closest === 'function'
      ? node.closest('.x-nt-shortcut-tile')
      : null;
    return tile && shortcutGrid.contains(tile) ? tile : null;
  }

  function getShortcutDockPointerX(event) {
    const value = Number(event && event.clientX);
    return Number.isFinite(value) ? value : null;
  }

  function getShortcutDockIcon(tile) {
    return tile && typeof tile.querySelector === 'function'
      ? tile.querySelector('.x-nt-shortcut-icon')
      : null;
  }

  function resetShortcutDockTile(tile) {
    if (!tile) {
      return;
    }
    tile.removeAttribute('data-dock-distance');
    tile.removeAttribute('data-dock-side');
    const icon = getShortcutDockIcon(tile);
    if (!icon || !icon.style || typeof icon.style.removeProperty !== 'function') {
      return;
    }
    icon.style.removeProperty('--x-nt-shortcut-dock-scale');
    icon.style.removeProperty('--x-nt-shortcut-dock-shift-x');
    icon.style.removeProperty('--x-nt-shortcut-dock-rise');
  }

  function clearShortcutDockMagnificationState() {
    if (!shortcutGrid) {
      return;
    }
    shortcutGrid.removeAttribute('data-dock-active');
    Array.from(shortcutGrid.querySelectorAll('.x-nt-shortcut-tile')).forEach((tile) => {
      resetShortcutDockTile(tile);
    });
  }

  function applyNewtabShortcutDockMagnification() {
    if (!shortcutGrid) {
      return;
    }
    shortcutGrid.setAttribute(
      'data-dock-magnification',
      newtabShortcutDockMagnificationEnabled ? 'true' : 'false'
    );
    if (!newtabShortcutDockMagnificationEnabled) {
      clearShortcutDockMagnificationState();
    }
  }

  function getShortcutDockInfluence(pointerX, icon) {
    if (!icon || typeof icon.getBoundingClientRect !== 'function' || !Number.isFinite(pointerX)) {
      return null;
    }
    const rect = icon.getBoundingClientRect();
    const iconWidth = Math.max(1, rect.width || rect.height || 48);
    const centerX = rect.left + ((rect.width || iconWidth) / 2);
    const distancePx = Math.abs(pointerX - centerX);
    const influenceRadius = Math.max(144, iconWidth * 4);
    const raw = Math.max(0, 1 - (distancePx / influenceRadius));
    const eased = raw * raw * (3 - (2 * raw));
    return {
      eased,
      side: centerX < pointerX ? 'before' : centerX > pointerX ? 'after' : 'active'
    };
  }

  function applyShortcutDockPointerStyles(tile, pointerX, offset, measurement) {
    const prepared = measurement && typeof measurement === 'object' ? measurement : null;
    const icon = prepared ? prepared.icon : getShortcutDockIcon(tile);
    const influence = prepared ? prepared.influence : getShortcutDockInfluence(pointerX, icon);
    if (!icon || !influence || !icon.style || typeof icon.style.setProperty !== 'function') {
      return;
    }
    const eased = Math.max(0, Math.min(1, influence.eased));
    if (eased <= 0.015) {
      icon.style.removeProperty('--x-nt-shortcut-dock-scale');
      icon.style.removeProperty('--x-nt-shortcut-dock-shift-x');
      icon.style.removeProperty('--x-nt-shortcut-dock-rise');
      return;
    }
    const numericOffset = Number(offset);
    const sideMultiplier = numericOffset < 0 ? -1 : numericOffset > 0 ? 1 : 0;
    const distanceFalloff = sideMultiplier === 0
      ? 0
      : 1 / Math.max(1, Math.abs(numericOffset));
    const landingTaper = Math.max(0, 1 - eased);
    const shiftPx = sideMultiplier * 16 * eased * landingTaper * distanceFalloff;
    icon.style.setProperty('--x-nt-shortcut-dock-scale', (1 + (0.28 * eased)).toFixed(3));
    icon.style.setProperty('--x-nt-shortcut-dock-shift-x', `${Math.round(shiftPx)}px`);
    icon.style.setProperty('--x-nt-shortcut-dock-rise', `${Math.round(-6 * eased)}px`);
  }

  function cancelShortcutDockPointerFrame() {
    if (shortcutDockPointerFrame) {
      window.cancelAnimationFrame(shortcutDockPointerFrame);
      shortcutDockPointerFrame = 0;
    }
    shortcutDockPendingTile = null;
    shortcutDockPendingPointerX = Number.NaN;
  }

  function scheduleShortcutDockPointerStyles(tile, pointerX) {
    shortcutDockPendingTile = tile || null;
    shortcutDockPendingPointerX = Number(pointerX);
    if (shortcutDockPointerFrame) {
      return;
    }
    shortcutDockPointerFrame = window.requestAnimationFrame(() => {
      shortcutDockPointerFrame = 0;
      const pendingTile = shortcutDockPendingTile;
      const pendingPointerX = shortcutDockPendingPointerX;
      shortcutDockPendingTile = null;
      shortcutDockPendingPointerX = Number.NaN;
      if (!pendingTile || !pendingTile.isConnected ||
          isShortcutDragActive() || isBookmarkDragActive()) {
        return;
      }
      setShortcutDockHover(pendingTile, pendingPointerX);
    });
  }

  function resetShortcutDockHover() {
    cancelShortcutDockPointerFrame();
    if (!shortcutGrid) {
      return;
    }
    if (isShortcutContextMenuOpen() && shortcutContextMenuTarget) {
      const activeTile = shortcutContextMenuTarget.tile;
      if (activeTile) {
        applyShortcutContextMenuDockHover(activeTile);
        return;
      }
    }
    clearShortcutDockMagnificationState();
    clearShortcutContextMenuTileActive();
  }

  function setShortcutDockHover(activeTile, pointerX) {
    if (!shortcutGrid || !activeTile) {
      return;
    }
    if (!newtabShortcutDockMagnificationEnabled) {
      clearShortcutDockMagnificationState();
      return;
    }
    const tiles = Array.from(shortcutGrid.querySelectorAll('.x-nt-shortcut-tile'));
    const activeIndex = tiles.indexOf(activeTile);
    if (activeIndex < 0) {
      resetShortcutDockHover();
      return;
    }
    const pointerMeasurements = Number.isFinite(pointerX)
      ? tiles.map((tile, index) => {
        const offset = index - activeIndex;
        if (Math.abs(offset) > 2) {
          return null;
        }
        const icon = getShortcutDockIcon(tile);
        return {
          icon,
          influence: getShortcutDockInfluence(pointerX, icon)
        };
      })
      : [];
    shortcutGrid.setAttribute('data-dock-active', 'true');
    tiles.forEach((tile, index) => {
      const offset = index - activeIndex;
      const distance = Math.abs(offset);
      if (distance > 2) {
        resetShortcutDockTile(tile);
        return;
      }
      tile.setAttribute('data-dock-distance', String(distance));
      tile.setAttribute('data-dock-side', offset < 0 ? 'before' : offset > 0 ? 'after' : 'active');
      if (Number.isFinite(pointerX)) {
        applyShortcutDockPointerStyles(tile, pointerX, offset, pointerMeasurements[index]);
      }
    });
  }

  function handleShortcutDockPointerOver(event) {
    if (isShortcutDragActive() || isBookmarkDragActive()) {
      return;
    }
    const tile = getShortcutTileFromNode(event.target);
    if (tile) {
      scheduleShortcutDockPointerStyles(tile, getShortcutDockPointerX(event));
    }
  }

  function handleShortcutDockPointerMove(event) {
    if (isShortcutDragActive() || isBookmarkDragActive()) {
      return;
    }
    const tile = getShortcutTileFromNode(event.target);
    if (tile) {
      scheduleShortcutDockPointerStyles(tile, getShortcutDockPointerX(event));
    }
  }

  function getShortcutTileId(tile) {
    return tile && typeof tile.getAttribute === 'function'
      ? tile.getAttribute('data-shortcut-id') || ''
      : '';
  }

  function refreshShortcutTileCacheFromDom() {
    if (!shortcutGrid) {
      return;
    }
    shortcutTiles.length = 0;
    Array.from(shortcutGrid.querySelectorAll('.x-nt-shortcut-tile[data-shortcut-id]')).forEach((tile) => {
      shortcutTiles.push(tile);
    });
  }

  function getShortcutReorderTiles() {
    return shortcutGrid
      ? Array.from(shortcutGrid.querySelectorAll('.x-nt-shortcut-tile[data-shortcut-id]'))
      : [];
  }

  function getShortcutById(shortcutId) {
    const id = String(shortcutId || '');
    if (!id) {
      return null;
    }
    return newtabShortcuts.find((item) => item && item.id === id) || null;
  }

  function getShortcutTileById(shortcutId) {
    const id = String(shortcutId || '');
    if (!id) {
      return null;
    }
    return getShortcutReorderTiles().find((tile) => getShortcutTileId(tile) === id) || null;
  }

  function isShortcutContextMenuOpen() {
    return Boolean(
      shortcutContextMenu &&
      shortcutContextMenuSelectController &&
      shortcutContextMenuSelectController.isOpen(shortcutContextMenu.control)
    );
  }

  function isShortcutContextMenuNode(node) {
    if (!node || !shortcutContextMenu) {
      return false;
    }
    const { control, menu } = shortcutContextMenu;
    return Boolean(
      (control && (node === control || (typeof control.contains === 'function' && control.contains(node)))) ||
      (menu && (node === menu || (typeof menu.contains === 'function' && menu.contains(node))))
    );
  }

  function clearShortcutContextMenuTileActive() {
    const tiles = shortcutGrid
      ? Array.from(shortcutGrid.querySelectorAll('.x-nt-shortcut-tile'))
      : [];
    tiles.forEach((tile) => {
      if (!tile.hasAttribute('data-shortcut-context-menu-open')) {
        return;
      }
      tile.removeAttribute('data-shortcut-context-menu-open');
      if (typeof tile._xSetBookmarkMenuVisualActive === 'function') {
        tile._xSetBookmarkMenuVisualActive(false);
      }
    });
  }

  function setShortcutContextMenuTileActive(target) {
    clearShortcutContextMenuTileActive();
    const tile = target && target.tile;
    if (tile) {
      tile.setAttribute('data-shortcut-context-menu-open', 'true');
      if (typeof tile._xSetBookmarkMenuVisualActive === 'function') {
        tile._xSetBookmarkMenuVisualActive(true);
      }
    }
  }

  function getShortcutContextMenuAnchorElement(tile) {
    return getShortcutDockIcon(tile) || tile;
  }

  function getShortcutContextMenuAnchorX(tile) {
    const anchor = getShortcutContextMenuAnchorElement(tile);
    if (!anchor || typeof anchor.getBoundingClientRect !== 'function') {
      return null;
    }
    const rect = anchor.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    return Number.isFinite(centerX) ? centerX : null;
  }

  function applyShortcutContextMenuDockHover(tile) {
    if (!tile) {
      return;
    }
    setShortcutDockHover(tile, getShortcutContextMenuAnchorX(tile));
    tile.setAttribute('data-shortcut-context-menu-open', 'true');
  }

  function syncShortcutDockHoverFromPoint(clientX, clientY) {
    const pointerX = Number(clientX);
    const pointerY = Number(clientY);
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY) ||
        typeof document.elementFromPoint !== 'function') {
      resetShortcutDockHover();
      return;
    }
    const tile = getShortcutTileFromNode(document.elementFromPoint(pointerX, pointerY));
    if (tile) {
      setShortcutDockHover(tile, pointerX);
      return;
    }
    resetShortcutDockHover();
  }

  function closeShortcutContextMenu(options) {
    const closeOptions = options && typeof options === 'object' ? options : {};
    if (!shortcutContextMenu || !shortcutContextMenuSelectController) {
      shortcutContextMenuTarget = null;
      clearShortcutContextMenuTileActive();
      return;
    }
    const wasOpen = isShortcutContextMenuOpen() || Boolean(shortcutContextMenuTarget);
    shortcutContextMenuSelectController.setOpen(shortcutContextMenu.control, false);
    shortcutContextMenuTarget = null;
    clearShortcutContextMenuTileActive();
    if (!wasOpen) {
      return;
    }
    if (closeOptions.syncHoverFromPointer) {
      syncShortcutDockHoverFromPoint(closeOptions.clientX, closeOptions.clientY);
      return;
    }
    resetShortcutDockHover();
  }

  function getShortcutContextMenuPoint(tile) {
    const anchor = getShortcutContextMenuAnchorElement(tile);
    if (anchor && typeof anchor.getBoundingClientRect === 'function') {
      const rect = anchor.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.bottom)
      };
    }
    return { x: 0, y: 0 };
  }

  function setShortcutContextMenuPosition(tile) {
    if (!shortcutContextMenu || !shortcutContextMenu.control) {
      return;
    }
    const point = getShortcutContextMenuPoint(tile);
    shortcutContextMenu.control.style.left = `${Math.round(point.x)}px`;
    shortcutContextMenu.control.style.top = `${Math.round(point.y)}px`;
  }

  function handleShortcutContextMenuAction(actionValue) {
    const action = String(actionValue || '');
    const target = shortcutContextMenuTarget;
    const targetId = target && target.kind === 'shortcut'
      ? String(target.shortcutId || '')
      : '';
    const shortcut = getShortcutById(targetId);
    const sourceElement = target && target.tile;
    closeShortcutContextMenu();
    if (!target || !action) {
      return;
    }
    if (target.kind === 'add' && action === SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE) {
      hideShortcutAddFromContextMenu(sourceElement);
      return;
    }
    if (!shortcut) {
      return;
    }
    if (action === FOLDER_COLOR_CONTEXT_MENU_VALUE && shortcut.type === 'folder') {
      openFolderColorPicker(getShortcutFolderId(shortcut), shortcut.title, sourceElement);
      return;
    }
    if (action === SHORTCUT_CONTEXT_MENU_EDIT_VALUE) {
      openShortcutEditor(shortcut, sourceElement);
      return;
    }
    if (action === NEWTAB_CONTEXT_MENU_OPEN_VALUE) {
      if (shortcut.type === 'folder') {
        openShortcutUrl(shortcut);
        return;
      }
      openExternalNewTabUrl(shortcut.url, 'newTab');
      return;
    }
    if (action === SHORTCUT_CONTEXT_MENU_REMOVE_VALUE) {
      removeShortcutById(targetId);
    }
  }

  function handleShortcutContextMenuActionClick(event) {
    const target = event && event.target;
    const option = target && typeof target.closest === 'function'
      ? target.closest('._x_extension_select_option_2024_unique_')
      : null;
    if (!option || !shortcutContextMenu || !shortcutContextMenu.menu ||
        !shortcutContextMenu.menu.contains(option)) {
      return;
    }
    event.stopPropagation();
    handleShortcutContextMenuAction(option.getAttribute('data-value'));
  }

  function handleShortcutContextMenuDocumentPointerDown(event) {
    if (!isShortcutContextMenuOpen() || isShortcutContextMenuNode(event.target)) {
      return;
    }
    closeShortcutContextMenu({
      syncHoverFromPointer: true,
      clientX: event.clientX,
      clientY: event.clientY
    });
  }

  function handleShortcutContextMenuDocumentKeyDown(event) {
    if (event && event.key === 'Escape' &&
        (shortcutContextMenuTarget || isShortcutContextMenuOpen())) {
      closeShortcutContextMenu();
    }
  }

  function handleShortcutContextMenuDocumentFocusIn(event) {
    if (shortcutContextMenuTarget && !isShortcutContextMenuNode(event.target)) {
      closeShortcutContextMenu();
    }
  }

  function createShortcutContextMenu() {
    if (!shortcutContextMenuSelectController ||
        typeof shortcutContextMenuSelectController.createSelect !== 'function') {
      return null;
    }
    const created = shortcutContextMenuSelectController.createSelect({
      id: '_x_extension_newtab_shortcut_context_menu_2026_unique_',
      selectId: '_x_extension_newtab_shortcut_context_menu_select_2026_unique_',
      className: 'x-nt-shortcut-context-menu',
      iconOnly: true,
      triggerIconClass: 'ri-more-line',
      menuClassName: 'x-nt-shortcut-context-menu-portal',
      menuAlign: 'middle',
      menuWidth: 'content',
      menuMinWidth: SHORTCUT_CONTEXT_MENU_MIN_WIDTH_PX,
      menuMaxWidth: SHORTCUT_CONTEXT_MENU_MAX_WIDTH_PX,
      menuPortal: true,
      menuPortalZIndex: SHORTCUT_CONTEXT_MENU_PORTAL_Z_INDEX,
      menuPortalOffset: SHORTCUT_CONTEXT_MENU_PORTAL_OFFSET_PX,
      value: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
      ariaLabel: t('newtab_shortcuts_context_menu_label', 'Shortcut actions'),
      options: getShortcutContextMenuOptions(),
      onAction(payload) {
        handleShortcutContextMenuAction(payload && payload.action);
      }
    });
    const control = created.wrapper;
    const select = created.select;
    const trigger = created.trigger;
    const menu = created.menu;
    if (!control || !select || !trigger || !menu) {
      return null;
    }
    trigger.tabIndex = -1;
    const stopContextMenuEvent = (event) => {
      event.stopPropagation();
    };
    [control, trigger, menu].forEach((element) => {
      element.addEventListener('pointerdown', stopContextMenuEvent);
      element.addEventListener('click', stopContextMenuEvent);
      element.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    menu.addEventListener('click', handleShortcutContextMenuActionClick);
    document.addEventListener('pointerdown', handleShortcutContextMenuDocumentPointerDown, true);
    document.addEventListener('keydown', handleShortcutContextMenuDocumentKeyDown, true);
    document.addEventListener('focusin', handleShortcutContextMenuDocumentFocusIn, true);
    (document.body || shortcutSection || document.documentElement).appendChild(control);
    return {
      control,
      select,
      trigger,
      menu
    };
  }

  function openShortcutContextMenu(target) {
    const tile = target && target.tile;
    const shortcutId = target && target.kind === 'shortcut'
      ? String(target.shortcutId || '')
      : '';
    if (!tile || (target.kind === 'shortcut' && !shortcutId)) {
      return;
    }
    if (!shortcutContextMenu) {
      shortcutContextMenu = createShortcutContextMenu();
    }
    if (!shortcutContextMenu || !shortcutContextMenuSelectController) {
      return;
    }
    closeRecentContextMenu();
    hideShortcutTooltip();
    resetShortcutDockHover();
    shortcutContextMenuTarget = target;
    setShortcutContextMenuTileActive(target);
    applyShortcutContextMenuDockHover(tile);
    setShortcutContextMenuPosition(tile);
    const defaultValue = target.kind === 'add'
      ? SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE
      : NEWTAB_CONTEXT_MENU_OPEN_VALUE;
    if (typeof shortcutContextMenuSelectController.setOptions === 'function') {
      shortcutContextMenuSelectController.setOptions(
        shortcutContextMenu.control,
        getShortcutContextMenuOptions(target),
        defaultValue
      );
    }
    shortcutContextMenu.select.value = defaultValue;
    shortcutContextMenuSelectController.sync(shortcutContextMenu.control);
    shortcutContextMenuSelectController.setOpen(shortcutContextMenu.control, true);
  }

  function handleShortcutContextMenu(event) {
    const tile = getShortcutTileFromNode(event.currentTarget || event.target);
    if (!tile || !getShortcutTileId(tile)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openShortcutContextMenu({
      kind: 'shortcut',
      shortcutId: getShortcutTileId(tile),
      tile
    });
  }

  function openShortcutAddContextMenu(sourceElement) {
    const tile = sourceElement || addShortcutButton;
    if (!tile || tile.hidden) {
      return;
    }
    openShortcutContextMenu({
      kind: 'add',
      tile
    });
  }

  function getBookmarkFolderOpenCount(target) {
    if (!target || !target.isFolder) {
      return 0;
    }
    const node = bookmarksRuntime.getNode(target.bookmarkId);
    return NEWTAB_BOOKMARKS_STORE.collectFolderBookmarkUrls(node).length;
  }

  function getBookmarkContextMenuOptions(target) {
    const options = [];
    if (target && target.isFolder) {
      options.push({
        action: BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE,
        value: BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE,
        label: t('bookmarks_open_in_new_tab_group', 'Open in new tab group'),
        disabled: getBookmarkFolderOpenCount(target) <= 0
      });
    } else if (target && !target.isFolder) {
      options.push({
        action: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
        value: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
        label: t('newtab_open_in_new_tab', 'Open in new tab')
      });
    }
    if (target && target.isFolder) {
      options.push({
        action: FOLDER_COLOR_CONTEXT_MENU_VALUE,
        value: FOLDER_COLOR_CONTEXT_MENU_VALUE,
        label: t('folder_color_change', 'Change color'),
        dividerBefore: true
      });
    }
    options.push(
      {
        action: BOOKMARK_CONTEXT_MENU_EDIT_VALUE,
        value: BOOKMARK_CONTEXT_MENU_EDIT_VALUE,
        label: target && target.isFolder
          ? t('folder_rename', 'Rename')
          : t('bookmarks_edit', 'Edit'),
        dividerBefore: options.length > 0 && !(target && target.isFolder)
      },
      {
        action: BOOKMARK_CONTEXT_MENU_REMOVE_VALUE,
        value: BOOKMARK_CONTEXT_MENU_REMOVE_VALUE,
        label: t('bookmarks_delete', 'Delete')
      }
    );
    return options;
  }

  function isBookmarkContextMenuOpen() {
    return Boolean(
      bookmarkContextMenu &&
      bookmarkContextMenuSelectController &&
      bookmarkContextMenuSelectController.isOpen(bookmarkContextMenu.control)
    );
  }

  function isBookmarkContextMenuNode(node) {
    if (!node || !bookmarkContextMenu) {
      return false;
    }
    const { control, menu } = bookmarkContextMenu;
    return Boolean(
      (control && (node === control || (typeof control.contains === 'function' && control.contains(node)))) ||
      (menu && (node === menu || (typeof menu.contains === 'function' && menu.contains(node))))
    );
  }

  function clearBookmarkContextMenuTargetVisual() {
    const element = bookmarkContextMenuTarget && bookmarkContextMenuTarget.element;
    if (element && typeof element.removeAttribute === 'function') {
      element.removeAttribute('data-bookmark-context-menu-open');
    }
  }

  function closeBookmarkContextMenu() {
    clearBookmarkContextMenuTargetVisual();
    if (bookmarkContextMenu && bookmarkContextMenuSelectController) {
      bookmarkContextMenuSelectController.setOpen(bookmarkContextMenu.control, false);
    }
    bookmarkContextMenuTarget = null;
  }

  function getBookmarkContextMenuPoint(target, event) {
    const clientX = Number(event && event.clientX);
    const clientY = Number(event && event.clientY);
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      return { x: clientX, y: clientY };
    }
    const element = target && target.element;
    if (element && typeof element.getBoundingClientRect === 'function') {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + (rect.width / 2),
        y: rect.bottom
      };
    }
    return { x: 0, y: 0 };
  }

  function setBookmarkContextMenuPosition(target, event) {
    if (!bookmarkContextMenu || !bookmarkContextMenu.control) {
      return;
    }
    const point = getBookmarkContextMenuPoint(target, event);
    bookmarkContextMenu.control.style.left = `${Math.round(point.x)}px`;
    bookmarkContextMenu.control.style.top = `${Math.round(point.y)}px`;
  }

  function handleBookmarkContextMenuAction(actionValue) {
    const action = String(actionValue || '');
    const target = bookmarkContextMenuTarget;
    closeBookmarkContextMenu();
    if (!target || !action) {
      return;
    }
    if (action === FOLDER_COLOR_CONTEXT_MENU_VALUE && target.isFolder) {
      openFolderColorPicker(target.bookmarkId, target.title, target.element);
      return;
    }
    if (action === NEWTAB_CONTEXT_MENU_OPEN_VALUE) {
      openExternalNewTabUrl(target.url, 'newTab');
      return;
    }
    if (action === BOOKMARK_CONTEXT_MENU_EDIT_VALUE) {
      openBookmarkEditor(target);
      return;
    }
    if (action === BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE) {
      openBookmarkFolderTabGroupConfirmation(target);
      return;
    }
    if (action === BOOKMARK_CONTEXT_MENU_REMOVE_VALUE) {
      deleteBookmarkFromContextTarget(target);
    }
  }

  function handleBookmarkContextMenuActionClick(event) {
    const target = event && event.target;
    const option = target && typeof target.closest === 'function'
      ? target.closest('._x_extension_select_option_2024_unique_')
      : null;
    if (!option || option.getAttribute('aria-disabled') === 'true' ||
        !bookmarkContextMenu || !bookmarkContextMenu.menu ||
        !bookmarkContextMenu.menu.contains(option)) {
      return;
    }
    event.stopPropagation();
    handleBookmarkContextMenuAction(option.getAttribute('data-value'));
  }

  function handleBookmarkContextMenuDocumentPointerDown(event) {
    if (!isBookmarkContextMenuOpen() || isBookmarkContextMenuNode(event.target)) {
      return;
    }
    closeBookmarkContextMenu();
  }

  function createBookmarkContextMenu() {
    if (!bookmarkContextMenuSelectController ||
        typeof bookmarkContextMenuSelectController.createSelect !== 'function') {
      return null;
    }
    const created = bookmarkContextMenuSelectController.createSelect({
      id: '_x_extension_newtab_bookmark_context_menu_2026_unique_',
      selectId: '_x_extension_newtab_bookmark_context_menu_select_2026_unique_',
      className: 'x-nt-shortcut-context-menu x-nt-bookmark-context-menu',
      iconOnly: true,
      triggerIconClass: 'ri-more-line',
      menuClassName: 'x-nt-shortcut-context-menu-portal x-nt-bookmark-context-menu-portal',
      menuAlign: 'middle',
      menuWidth: 'content',
      menuMinWidth: BOOKMARK_CONTEXT_MENU_MIN_WIDTH_PX,
      menuMaxWidth: BOOKMARK_CONTEXT_MENU_MAX_WIDTH_PX,
      menuPortal: true,
      menuPortalZIndex: BOOKMARK_CONTEXT_MENU_PORTAL_Z_INDEX,
      menuPortalOffset: BOOKMARK_CONTEXT_MENU_PORTAL_OFFSET_PX,
      value: BOOKMARK_CONTEXT_MENU_EDIT_VALUE,
      ariaLabel: t('bookmarks_context_menu_label', 'Bookmark actions'),
      options: getBookmarkContextMenuOptions(),
      onAction(payload) {
        handleBookmarkContextMenuAction(payload && payload.action);
      }
    });
    const control = created.wrapper;
    const select = created.select;
    const trigger = created.trigger;
    const menu = created.menu;
    if (!control || !select || !trigger || !menu) {
      return null;
    }
    trigger.tabIndex = -1;
    const stopContextMenuEvent = (event) => {
      event.stopPropagation();
    };
    [control, trigger, menu].forEach((element) => {
      element.addEventListener('pointerdown', stopContextMenuEvent);
      element.addEventListener('click', stopContextMenuEvent);
      element.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    menu.addEventListener('click', handleBookmarkContextMenuActionClick);
    document.addEventListener('pointerdown', handleBookmarkContextMenuDocumentPointerDown, true);
    (document.body || document.documentElement).appendChild(control);
    return { control, select, trigger, menu };
  }

  function openBookmarkContextMenu(target, event) {
    if (!target || !target.bookmarkId) {
      return;
    }
    if (!bookmarkContextMenu) {
      bookmarkContextMenu = createBookmarkContextMenu();
    }
    if (!bookmarkContextMenu || !bookmarkContextMenuSelectController) {
      return;
    }
    closeShortcutContextMenu();
    closeRecentContextMenu();
    closeBookmarkContextMenu();
    bookmarkContextMenuTarget = target;
    if (target.element && typeof target.element.setAttribute === 'function') {
      target.element.setAttribute('data-bookmark-context-menu-open', 'true');
    }
    setBookmarkContextMenuPosition(target, event);
    if (typeof bookmarkContextMenuSelectController.setOptions === 'function') {
      bookmarkContextMenuSelectController.setOptions(
        bookmarkContextMenu.control,
        getBookmarkContextMenuOptions(target),
        target.isFolder
          ? BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE
          : NEWTAB_CONTEXT_MENU_OPEN_VALUE
      );
    }
    bookmarkContextMenuSelectController.setOpen(bookmarkContextMenu.control, true);
  }

  function handleBookmarkItemContextMenu(payload) {
    const event = payload && payload.event;
    const item = payload && payload.item;
    const element = payload && payload.element;
    if (!event || !item || !element || !item.id || bookmarkDragState) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    hideCursorTooltip();
    openBookmarkContextMenu({
      bookmarkId: String(item.id),
      title: String(item.title || ''),
      url: item.type === 'folder' ? '' : String(item.url || ''),
      parentId: String(item.parentId || payload.parentFolderId || ''),
      index: Number.isFinite(Number(item.index)) ? Number(item.index) : 0,
      isFolder: item.type === 'folder',
      sourceKind: payload.sourceKind === 'cascade' ? 'cascade' : 'card',
      element
    }, event);
  }

  function requestBookmarkFolderTabGroup(folderId, title) {
    return new Promise((resolve) => {
      if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        resolve({ ok: false, reason: 'runtime-unavailable' });
        return;
      }
      chrome.runtime.sendMessage({
        action: 'openBookmarkFolderInNewTabGroup',
        folderId,
        title
      }, (response) => {
        const error = chrome.runtime && chrome.runtime.lastError
          ? chrome.runtime.lastError.message || 'runtime-error'
          : '';
        resolve(error ? { ok: false, reason: error } : (response || { ok: false }));
      });
    });
  }

  function openBookmarkFolderTabGroupConfirmation(target) {
    if (!target || !target.isFolder || !target.bookmarkId) {
      return;
    }
    const node = bookmarksRuntime.getNode(target.bookmarkId);
    const count = NEWTAB_BOOKMARKS_STORE.collectFolderBookmarkUrls(node).length;
    if (count <= 0) {
      return;
    }
    const folderTitle = String((node && node.title) || target.title || '').trim() ||
      t('bookmarks_untitled_folder', 'Untitled folder');
    openShortcutDialog({
      sourceElement: target.element,
      confirmationTitle: formatMessage(
        'bookmarks_open_group_confirm_title',
        'Open {count} tabs?',
        { count }
      ),
      confirmationDescription: formatMessage(
        'bookmarks_open_group_confirm_description',
        'All bookmarks in “{folder}” and its subfolders will open in one tab group.',
        { folder: folderTitle }
      ),
      confirmLabel: t('bookmarks_open_group_confirm_button', 'Open'),
      async onConfirm() {
        const response = await requestBookmarkFolderTabGroup(
          String(target.bookmarkId),
          folderTitle
        );
        const openedCount = Math.max(0, Number(response && response.openedCount) || 0);
        const failedCount = Math.max(0, Number(response && response.failedCount) || 0);
        if (openedCount > 0 && failedCount > 0) {
          showToast(formatMessage(
            'bookmarks_open_group_partial_failed',
            'Opened {openedCount} tabs; {failedCount} could not be opened.',
            { openedCount, failedCount }
          ), true);
        } else if (!response || response.ok !== true) {
          showToast(t(
            'bookmarks_open_group_failed',
            'Could not open the bookmark folder'
          ), true);
        }
        return true;
      }
    });
  }

  function handleShortcutNativeDragStart(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
  }

  function openShortcutEditor(shortcut, sourceElement) {
    if (!shortcut) {
      return;
    }
    if (shortcut.type === 'folder') {
      openBookmarkEditor({ bookmarkId: getShortcutFolderId(shortcut), isFolder: true,
        title: getShortcutTitle(shortcut), element: sourceElement });
      return;
    }
    openShortcutDialog({
      mode: SHORTCUT_DIALOG_MODE_EDIT,
      shortcut: {
        ...shortcut,
        iconDataUrl: getShortcutIconDataUrl(shortcut.id)
      },
      sourceElement
    });
  }

  function openBookmarkEditor(target) {
    if (!target || !target.bookmarkId) {
      return;
    }
    const node = bookmarksRuntime.getNode(target.bookmarkId);
    const isFolder = Boolean(target.isFolder);
    openShortcutDialog({
      mode: SHORTCUT_DIALOG_MODE_EDIT,
      itemType: isFolder ? SHORTCUT_DIALOG_ITEM_FOLDER : SHORTCUT_DIALOG_ITEM_BOOKMARK,
      shortcut: {
        id: String(target.bookmarkId),
        title: String((node && node.title) || target.title || ''),
        url: isFolder ? '' : String((node && node.url) || target.url || '')
      },
      sourceElement: target.element
    });
  }

  function getShortcutTileRectMap() {
    const rects = new Map();
    getShortcutReorderTiles().forEach((tile) => {
      if (tile && typeof tile.getBoundingClientRect === 'function') {
        rects.set(tile, tile.getBoundingClientRect());
      }
    });
    return rects;
  }

  function getShortcutTileLayoutRect(tile) {
    if (!tile || !shortcutGrid || typeof tile.offsetLeft !== 'number' ||
        typeof tile.offsetTop !== 'number') {
      return null;
    }
    const offsetParent = tile.offsetParent && typeof tile.offsetParent.getBoundingClientRect === 'function'
      ? tile.offsetParent
      : shortcutGrid;
    const parentRect = typeof offsetParent.getBoundingClientRect === 'function'
      ? offsetParent.getBoundingClientRect()
      : { left: 0, top: 0 };
    const width = Number(tile.offsetWidth) || 0;
    const height = Number(tile.offsetHeight) || 0;
    const left = parentRect.left + tile.offsetLeft;
    const top = parentRect.top + tile.offsetTop;
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      centerX: left + (width / 2),
      centerY: top + (height / 2)
    };
  }

  function clearShortcutTileLayoutAnimation(tile) {
    if (!tile || !tile.style) {
      return;
    }
    if (tile._xShortcutLayoutAnimationTimer) {
      window.clearTimeout(tile._xShortcutLayoutAnimationTimer);
      tile._xShortcutLayoutAnimationTimer = 0;
    }
    tile.style.removeProperty('transition');
    if (tile.getAttribute && tile.getAttribute('data-shortcut-dragging') !== 'true' &&
        tile.getAttribute('data-shortcut-dropping') !== 'true') {
      tile.style.removeProperty('transform');
    }
  }

  function animateShortcutLayoutShift(beforeRects, draggedTile) {
    if (!beforeRects || !shortcutGrid) {
      return;
    }
    getShortcutReorderTiles().forEach((tile) => {
      if (!tile || tile === draggedTile || !tile.style || typeof tile.getBoundingClientRect !== 'function') {
        return;
      }
      const before = beforeRects.get(tile);
      if (!before) {
        return;
      }
      clearShortcutTileLayoutAnimation(tile);
      const after = tile.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        return;
      }
      tile.style.transition = 'none';
      tile.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      void tile.offsetWidth;
      window.requestAnimationFrame(() => {
        if (!tile.isConnected) {
          return;
        }
        tile.style.transition = `transform ${SHORTCUT_REORDER_ANIMATION_MS}ms ${SHORTCUT_REORDER_EASING}`;
        tile.style.transform = 'translate3d(0, 0, 0)';
        tile._xShortcutLayoutAnimationTimer = window.setTimeout(() => {
          tile._xShortcutLayoutAnimationTimer = 0;
          clearShortcutTileLayoutAnimation(tile);
        }, SHORTCUT_REORDER_ANIMATION_MS + 80);
      });
    });
  }

  function setShortcutDragTileTransform(state, pointerX, pointerY) {
    if (!state || !state.tile || !state.tile.style ||
        typeof state.tile.getBoundingClientRect !== 'function') {
      return;
    }
    const rect = state.tile.getBoundingClientRect();
    const currentX = Number(state.translateX) || 0;
    const currentY = Number(state.translateY) || 0;
    const baseLeft = rect.left - currentX;
    const baseTop = rect.top - currentY;
    const nextX = pointerX - state.grabOffsetX - baseLeft;
    const nextY = pointerY - state.grabOffsetY - baseTop;
    state.translateX = nextX;
    state.translateY = nextY;
    state.tile.style.transition = 'none';
    state.tile.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
  }

  function settleShortcutDragTile(tile) {
    if (!tile || !tile.style) {
      return;
    }
    tile.setAttribute('data-shortcut-dropping', 'true');
    tile.style.pointerEvents = '';
    tile.style.transition = `transform ${SHORTCUT_DROP_ANIMATION_MS}ms ${SHORTCUT_REORDER_EASING}`;
    tile.style.transform = 'translate3d(0, 0, 0)';
    if (tile._xShortcutDropTimer) {
      window.clearTimeout(tile._xShortcutDropTimer);
    }
    tile._xShortcutDropTimer = window.setTimeout(() => {
      tile._xShortcutDropTimer = 0;
      tile.removeAttribute('data-shortcut-dragging');
      tile.removeAttribute('data-shortcut-dropping');
      tile.style.removeProperty('transition');
      tile.style.removeProperty('transform');
      tile.style.removeProperty('will-change');
      tile.style.pointerEvents = '';
    }, SHORTCUT_DROP_ANIMATION_MS + 90);
  }

  function getShortcutTileInsertionIndex(tile) {
    if (!tile) {
      return -1;
    }
    return getShortcutReorderTiles().indexOf(tile);
  }

  function getShortcutInsertionSlotAt(pointerX, pointerY, excludedTile) {
    const layoutItems = getShortcutReorderTiles()
      .filter((tile) => tile && tile !== excludedTile)
      .map((tile) => ({
        tile,
        rect: getShortcutTileLayoutRect(tile)
      }))
      .filter((item) => item.rect && item.rect.width > 0 && item.rect.height > 0);
    const slot = NEWTAB_CROSS_SURFACE_DRAG.getRowInsertionSlot(layoutItems, pointerX, pointerY);
    return {
      index: slot.index,
      markerPosition: slot.markerPosition,
      anchorRect: slot.anchorIndex >= 0 ? layoutItems[slot.anchorIndex].rect : null
    };
  }

  function getShortcutDragInsertionIndex(pointerX, pointerY) {
    if (!shortcutGrid || !shortcutDragState || !Number.isFinite(pointerX) ||
        !Number.isFinite(pointerY)) {
      return -1;
    }
    return getShortcutInsertionSlotAt(pointerX, pointerY, shortcutDragState.tile).index;
  }

  function moveShortcutTileElement(tile, targetIndex) {
    if (!shortcutGrid || !tile || tile.parentNode !== shortcutGrid ||
        !Number.isFinite(targetIndex)) {
      return false;
    }
    const currentIndex = getShortcutTileInsertionIndex(tile);
    const remainingTiles = getShortcutReorderTiles().filter((item) => item !== tile);
    const boundedIndex = Math.max(0, Math.min(remainingTiles.length, targetIndex));
    if (currentIndex === boundedIndex) {
      return false;
    }
    shortcutGrid.insertBefore(
      tile,
      remainingTiles[boundedIndex] || addShortcutButton || null
    );
    refreshShortcutTileCacheFromDom();
    return true;
  }

  function moveShortcutItem(shortcutId, targetIndex) {
    if (!shortcutId || !Number.isFinite(targetIndex)) {
      return false;
    }
    const currentIndex = newtabShortcuts.findIndex((item) => item && item.id === shortcutId);
    if (currentIndex < 0) {
      return false;
    }
    const tiles = getShortcutReorderTiles();
    const visibleIds = tiles.filter((tile) => getShortcutTileId(tile) !== shortcutId).map(getShortcutTileId);
    const visibleTargetIndex = Math.max(0, Math.min(visibleIds.length, Math.floor(targetIndex)));
    if (tiles.findIndex((tile) => getShortcutTileId(tile) === shortcutId) === visibleTargetIndex) {
      return false;
    }
    const nextShortcuts = newtabShortcuts.slice();
    const shortcutItem = nextShortcuts.splice(currentIndex, 1)[0];
    const anchorId = visibleIds[visibleTargetIndex];
    const anchorIndex = anchorId ? nextShortcuts.findIndex((item) => item.id === anchorId) : nextShortcuts.length;
    const boundedIndex = Math.max(0, anchorIndex);
    if (currentIndex === boundedIndex) {
      return false;
    }
    nextShortcuts.splice(boundedIndex, 0, shortcutItem);
    newtabShortcuts = nextShortcuts;
    return true;
  }

  function restoreShortcutDragOrder(state) {
    const originalOrder = state.originalShortcuts.map((item) => item.id);
    const restored = NEWTAB_CROSS_SURFACE_DRAG.planShortcutReorder({
      shortcuts: newtabShortcuts, order: originalOrder
    });
    if (restored) newtabShortcuts = restored;
    // React has not committed the manually moved DOM order during the drag.
    let visibleIndex = 0;
    newtabShortcuts.forEach((shortcut) => {
      const tile = getShortcutTileById(shortcut.id);
      if (tile) moveShortcutTileElement(tile, visibleIndex++);
    });
    renderShortcuts();
    resetShortcutDockHover();
  }

  function persistShortcutOrder(state) {
    const record = state && NEWTAB_BOOKMARK_MOVE_HISTORY.createShortcutReorderRecord({
      fromOrder: state.originalShortcuts.map((item) => item.id),
      toOrder: newtabShortcuts.map((item) => item.id)
    });
    if (state && !record) return Promise.resolve(newtabShortcuts);
    if (state) bookmarkMoveHistoryBusy = true;
    return persistShortcuts(newtabShortcuts, '', undefined, { render: false })
      .then((saved) => {
        if (saved && record) bookmarkMoveHistory.push(record);
        if (!saved && state) restoreShortcutDragOrder(state);
        return newtabShortcuts;
      }).finally(() => {
        if (state) bookmarkMoveHistoryBusy = false;
      });
  }

  function startShortcutDrag(event, tile) {
    if (!shortcutGrid || !tile || !shortcutDragState || shortcutDragState.tile !== tile) {
      return;
    }
    shortcutDragState.isDragging = true;
    hideCursorTooltip();
    closeBookmarkCascadeMenu();
    if (document.body) {
      document.body.setAttribute('data-drag-source', 'shortcut');
    }
    hideShortcutTooltip();
    resetShortcutDockHover();
    if (isEmptyBookmarkRootHidden()) {
      renderCurrentBookmarkPage();
    }
    shortcutGrid.setAttribute('data-shortcut-dragging', 'true');
    tile.setAttribute('data-shortcut-dragging', 'true');
    tile.setAttribute('aria-grabbed', 'true');
    tile.style.pointerEvents = 'none';
    tile.style.willChange = 'transform';
    setShortcutDragTileTransform(shortcutDragState, Number(event.clientX), Number(event.clientY));
    if (typeof tile.setPointerCapture === 'function') {
      try {
        tile.setPointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture can fail if the browser already canceled the pointer.
      }
    }
  }

  function cancelShortcutDragMoveFrame(state) {
    if (!state || !state.moveFrameId) {
      return;
    }
    window.cancelAnimationFrame(state.moveFrameId);
    state.moveFrameId = 0;
  }

  function applyShortcutDragMove(state, pointerX, pointerY) {
    if (!state || state !== shortcutDragState || !state.isDragging ||
        !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
      return;
    }
    setShortcutDragTileTransform(state, pointerX, pointerY);
    document.body.removeAttribute('data-drag-blocked');
    const topbarPoint = isBookmarkTopbarMode() &&
      !isBookmarkCascadeSurfaceAtPoint(pointerX, pointerY)
      ? getExternalBookmarkSurfacePoint(pointerX, pointerY) : null;
    if (topbarPoint && bookmarkTopbarRuntime.autoScroll(topbarPoint.x, topbarPoint.y)) {
      scheduleShortcutDragMove(state, pointerX, pointerY);
    }
    if (updateShortcutDragBookmarkTarget(state, pointerX, pointerY)) {
      return;
    }
    if (!isPointOverShortcutDropSurface(pointerX, pointerY)) {
      return;
    }
    const targetIndex = getShortcutDragInsertionIndex(pointerX, pointerY);
    if (targetIndex < 0 || targetIndex === getShortcutTileInsertionIndex(state.tile)) {
      return;
    }
    const beforeRects = getShortcutTileRectMap();
    if (moveShortcutItem(state.shortcutId, targetIndex) &&
        moveShortcutTileElement(state.tile, targetIndex)) {
      animateShortcutLayoutShift(beforeRects, state.tile);
      setShortcutDragTileTransform(state, pointerX, pointerY);
      state.hasReordered = true;
    }
  }

  function flushShortcutDragMove(state) {
    if (!state) {
      return;
    }
    cancelShortcutDragMoveFrame(state);
    applyShortcutDragMove(
      state,
      Number(state.pendingPointerX),
      Number(state.pendingPointerY)
    );
    cancelShortcutDragMoveFrame(state);
  }

  function scheduleShortcutDragMove(state, pointerX, pointerY) {
    if (!state) {
      return;
    }
    state.pendingPointerX = pointerX;
    state.pendingPointerY = pointerY;
    if (state.moveFrameId) {
      return;
    }
    state.moveFrameId = window.requestAnimationFrame(() => {
      state.moveFrameId = 0;
      applyShortcutDragMove(
        state,
        Number(state.pendingPointerX),
        Number(state.pendingPointerY)
      );
    });
  }

  function suppressCanceledDragClick(element, flagName, pointerId) {
    if (element._xDragCancelClickCleanup) {
      element._xDragCancelClickCleanup();
    }
    element[flagName] = true;
    const cleanup = () => {
      document.removeEventListener('pointerup', onRelease, true);
      document.removeEventListener('pointercancel', onRelease, true);
      document.removeEventListener('pointerdown', onNextPress, true);
      delete element._xDragCancelClickCleanup;
    };
    const onRelease = (releaseEvent) => {
      if (releaseEvent.pointerId !== pointerId) {
        return;
      }
      cleanup();
      // A canceled drag can still generate a click when the held mouse is
      // released later. Keep suppression through that click's event turn.
      window.setTimeout(() => { element[flagName] = false; }, 0);
    };
    const onNextPress = () => {
      cleanup();
      element[flagName] = false;
    };
    element._xDragCancelClickCleanup = cleanup;
    document.addEventListener('pointerup', onRelease, true);
    document.addEventListener('pointercancel', onRelease, true);
    document.addEventListener('pointerdown', onNextPress, true);
  }

  function finishShortcutDrag(event, options) {
    if (!shortcutDragState) {
      return;
    }
    if (event && shortcutDragState.pointerId !== event.pointerId) {
      return;
    }
    const state = shortcutDragState;
    detachShortcutDragDocumentListeners();
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      state.pendingPointerX = event.clientX;
      state.pendingPointerY = event.clientY;
    }
    if (state.isDragging) {
      flushShortcutDragMove(state);
    }
    const bookmarkDropTarget = state.isDragging && !(options && options.cancel)
      ? state.dropTarget
      : null;
    clearBookmarkDragPageSwitch(state);
    clearBookmarkDragFolderSwitch(state);
    clearDragDropTarget(state);
    shortcutDragState = null;
    document.body.removeAttribute('data-drag-blocked');
    closeBookmarkCascadeMenu();
    if (document.body) {
      document.body.removeAttribute('data-drag-source');
    }
    const tile = state.tile;
    if (shortcutGrid) {
      shortcutGrid.removeAttribute('data-shortcut-dragging');
    }
    if (tile) {
      tile.removeAttribute('aria-grabbed');
      if (typeof tile.releasePointerCapture === 'function') {
        try {
          tile.releasePointerCapture(state.pointerId);
        } catch (error) {
          // Ignore stale pointer capture releases.
        }
      }
      if (state.isDragging && !bookmarkDropTarget) {
        settleShortcutDragTile(tile);
      } else if (!state.isDragging) {
        tile.removeAttribute('data-shortcut-dragging');
        tile.removeAttribute('data-shortcut-dropping');
        tile.style.pointerEvents = '';
      }
      if (state.isDragging) {
        tile._xShortcutSuppressClick = true;
        if (event) {
          window.setTimeout(() => {
            tile._xShortcutSuppressClick = false;
          }, 0);
        } else {
          suppressCanceledDragClick(tile, '_xShortcutSuppressClick', state.pointerId);
        }
      }
    }
    if (bookmarkDropTarget) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      moveShortcutToBookmarks(state, bookmarkDropTarget);
      return;
    }
    if (options && options.cancel && state.hasReordered) {
      restoreShortcutDragOrder(state);
      return;
    }
    if (state.isDragging &&
        bookmarkGrid &&
        bookmarkGrid.getAttribute('data-bookmark-empty-drop-surface') === 'true') {
      renderCurrentBookmarkPage();
    }
    if (state.isDragging && state.hasReordered) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      persistShortcutOrder(state).then(() => {
        renderShortcuts();
        scheduleWallpaperAdaptiveToneUpdate();
      });
      return;
    }
    if (options && options.cancel) {
      resetShortcutDockHover();
    }
  }

  // Reordering re-inserts the captured tile, which drops pointer capture, and
  // the shortcut section ignores pointer events while a drag is lifted above
  // the bookmarks, so the session listens on the document like bookmark drags.
  function attachShortcutDragDocumentListeners() {
    document.addEventListener('pointermove', handleShortcutDragPointerMove, true);
    document.addEventListener('pointerup', handleShortcutDragPointerUp, true);
    document.addEventListener('pointercancel', handleShortcutDragPointerCancel, true);
  }

  function detachShortcutDragDocumentListeners() {
    document.removeEventListener('pointermove', handleShortcutDragPointerMove, true);
    document.removeEventListener('pointerup', handleShortcutDragPointerUp, true);
    document.removeEventListener('pointercancel', handleShortcutDragPointerCancel, true);
  }

  function isShortcutDragActive() {
    return Boolean(shortcutDragState && shortcutDragState.isDragging);
  }

  function isBookmarkSurfaceDragStateActive(state) {
    return Boolean(state && state.isDragging && (state === bookmarkDragState || state === shortcutDragState));
  }

  function updateShortcutDragBookmarkTarget(state, pointerX, pointerY) {
    if (state.folderSwitchPendingId) {
      return true;
    }
    const direction = getBookmarkDragPageSwitchDirection(pointerX, pointerY);
    if (direction) {
      clearDragDropTarget(state);
      clearBookmarkDragFolderSwitch(state);
      scheduleBookmarkDragPageSwitch(state, direction);
      return true;
    }
    clearBookmarkDragPageSwitch(state);
    const overBookmarks = Boolean(getExternalBookmarkSurfacePoint(pointerX, pointerY));
    const overCascade = isBookmarkCascadeSurfaceAtPoint(pointerX, pointerY);
    const dockFolder = getShortcutFolderDropTargetAt(state, pointerX, pointerY);
    const target = overCascade || overBookmarks || dockFolder
      ? getExternalBookmarkDropTarget(pointerX, pointerY, state) || dockFolder
      : null;
    if (target && target.kind === 'blocked') {
      document.body.setAttribute('data-drag-blocked', 'true');
      clearDragDropTarget(state);
      clearBookmarkDragFolderSwitch(state);
      return true;
    }
    if (target) {
      setDragDropTarget(state, target);
      scheduleBookmarkDragFolderSwitch(state, target);
    } else {
      clearDragDropTarget(state);
      clearBookmarkDragFolderSwitch(state);
    }
    return overBookmarks || overCascade || Boolean(dockFolder);
  }

  function moveShortcutToBookmarks(state, target) {
    const shortcut = getShortcutById(state.shortcutId);
    const restoreShortcut = () => {
      settleShortcutDragTile(state.tile);
      if (state.hasReordered) {
        persistShortcutOrder().then(() => {
          renderShortcuts();
          scheduleWallpaperAdaptiveToneUpdate();
        });
      }
      return false;
    };
    if (!shortcut || bookmarkMoveHistoryBusy) {
      return Promise.resolve(restoreShortcut());
    }
    if (!isValidExternalBookmarkDropTarget(state, target)) {
      return Promise.resolve(restoreShortcut());
    }
    const isFolder = shortcut.type === 'folder';
    const node = isFolder ? bookmarksRuntime.getNode(getShortcutFolderId(shortcut)) : null;
    if (isFolder && !node) {
      return Promise.resolve(restoreShortcut());
    }
    const from = node ? { parentId: node.parentId, index: node.index } : null;
    const to = isFolder && String(node.parentId) === String(target.folderId) && target.kind !== 'insertion'
      ? from
      : {
        parentId: String(target.folderId),
        index: NEWTAB_BOOKMARK_MOVE_HISTORY.normalizeMoveDestinationIndex({
          sourceParentId: from && from.parentId,
          sourceIndex: from && from.index,
          targetParentId: target.folderId,
          targetIndex: target.kind === 'insertion'
            ? target.index : bookmarksRuntime.getFolderItems(target.folderId).length
        })
      };
    const originalShortcuts = state.originalShortcuts || newtabShortcuts;
    const record = NEWTAB_BOOKMARK_MOVE_HISTORY.createTransferRecord({
      bookmarkId: node && node.id,
      snapshot: { title: isFolder ? node.title : shortcut.title, url: isFolder ? '' : shortcut.url },
      from,
      to,
      beforeShortcut: {
        snapshot: shortcut,
        index: originalShortcuts.findIndex((item) => item.id === shortcut.id),
        iconDataUrl: newtabShortcutIcons[shortcut.id]
      }
    });
    if (!record) return Promise.resolve(restoreShortcut());
    bookmarkMoveHistoryBusy = true;
    queueBookmarkLayoutAnimation('');
    return applyBookmarkShortcutTransfer(record, false).then((moved) => {
      if (!moved) return restoreShortcut();
      bookmarkMoveHistory.push({
        ...record,
        bookmarkId: record.runtime.currentBookmarkId,
        to: record.runtime.location || record.to
      });
      if (isFolder) {
        showToast(t('newtab_shortcuts_moved_to_bookmarks', 'Moved to bookmarks'));
      }
      return true;
    }).finally(() => {
      bookmarkMoveHistoryBusy = false;
      if (newtabShortcuts.some((item) => item.type === 'folder')) return refreshShortcutFolderReferences();
    });
  }

  function handleShortcutDragPointerDown(event) {
    if (bookmarkMoveHistoryBusy || isShortcutContextMenuNode(event.target)) {
      return;
    }
    const tile = getShortcutTileFromNode(event.target);
    const shortcutId = getShortcutTileId(tile);
    if (!tile || !shortcutId || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    closeShortcutContextMenu();
    shortcutDragState = {
      pointerId: event.pointerId,
      tile,
      shortcutId,
      originalShortcuts: newtabShortcuts.slice(),
      bookmarkId: getShortcutFolderId(getShortcutById(shortcutId)),
      pageSwitchTimerId: 0,
      folderSwitchTimerId: 0,
      folderSwitchPendingId: '',
      startX: Number(event.clientX),
      startY: Number(event.clientY),
      grabOffsetX: 0,
      grabOffsetY: 0,
      translateX: 0,
      translateY: 0,
      pendingPointerX: Number(event.clientX),
      pendingPointerY: Number(event.clientY),
      moveFrameId: 0,
      dropTarget: null,
      isDragging: false,
      hasReordered: false
    };
    if (typeof tile.getBoundingClientRect === 'function') {
      const rect = tile.getBoundingClientRect();
      shortcutDragState.grabOffsetX = Number(event.clientX) - rect.left;
      shortcutDragState.grabOffsetY = Number(event.clientY) - rect.top;
    }
    attachShortcutDragDocumentListeners();
    if (typeof tile.setPointerCapture === 'function') {
      try {
        tile.setPointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture can fail if the browser already canceled the pointer.
      }
    }
  }

  function handleShortcutDragPointerMove(event) {
    if (!shortcutDragState || shortcutDragState.pointerId !== event.pointerId) {
      return;
    }
    const pointerX = Number(event.clientX);
    const pointerY = Number(event.clientY);
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
      return;
    }
    const dx = pointerX - shortcutDragState.startX;
    const dy = pointerY - shortcutDragState.startY;
    if (!shortcutDragState.isDragging &&
        Math.hypot(dx, dy) < SHORTCUT_DRAG_START_THRESHOLD_PX) {
      return;
    }
    if (!shortcutDragState.isDragging) {
      startShortcutDrag(event, shortcutDragState.tile);
    }
    if (!shortcutDragState.isDragging) {
      return;
    }
    event.preventDefault();
    scheduleShortcutDragMove(shortcutDragState, pointerX, pointerY);
  }

  function handleShortcutDragPointerUp(event) {
    finishShortcutDrag(event);
  }

  function handleShortcutDragPointerCancel(event) {
    finishShortcutDrag(event, { cancel: true });
  }

  function renderShortcuts() {
    if (!shortcutGrid || !shortcutsView) {
      return;
    }
    hideShortcutTooltip();
    closeShortcutContextMenu();
    newtabShortcuts = NEWTAB_SHORTCUTS_STORE.normalizeShortcuts(newtabShortcuts, getShortcutStoreOptions());
    const items = getVisibleShortcuts();
    shortcutsView.render(items);
    shortcutFolderRuntime.flush().catch(() => {});
    syncOpenBookmarkCascadeAnchorVisual();
    addShortcutButton = shortcutsView.getAddButton();
    if (shortcutSection) {
      shortcutSection.setAttribute('data-count', String(items.length));
    }
    applyNewtabShortcutsVisibility();
    updateShortcutLanguageStrings();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: Boolean(
        document.body && document.body.getAttribute('data-nt-ready') === '1'
      )
    });
  }

  function loadShortcuts() {
    if (!storageArea) {
      newtabShortcuts = NEWTAB_SHORTCUTS_STORE.getDefaultShortcuts(getShortcutStoreOptions());
      return Promise.resolve(newtabShortcuts);
    }
    return Promise.all([
      NEWTAB_SHORTCUTS_STORE.loadShortcuts(storageArea, getShortcutStoreOptions()),
      readShortcutLocalState()
    ]).then(([syncedItems, localState]) => {
      if (localState && localState.authoritative === true) {
        newtabShortcuts = localState.items;
      } else {
        newtabShortcuts = NEWTAB_SHORTCUTS_STORE.mergeShortcutLists(
          syncedItems,
          localState && localState.items,
          getShortcutStoreOptions()
        );
      }
      if (newtabShortcuts.some((shortcut) => shortcut.type === 'folder')) {
        return refreshShortcutFolderReferences().then(() => newtabShortcuts);
      }
      return newtabShortcuts;
    });
  }

  function loadShortcutIcons() {
    return shortcutIconStore.readAll()
      .then((icons) => {
        newtabShortcutIcons = NEWTAB_SHORTCUT_ICON_STORE.normalizeIconMap(icons);
        return newtabShortcutIcons;
      })
      .catch(() => {
        newtabShortcutIcons = {};
        return newtabShortcutIcons;
      });
  }

  function loadShortcutFavicons() {
    return shortcutFaviconStore.readAll()
      .then((cacheMap) => {
        newtabShortcutFavicons = SHORTCUT_FAVICON.normalizeCacheMap(cacheMap);
        return newtabShortcutFavicons;
      })
      .catch(() => {
        newtabShortcutFavicons = {};
        return newtabShortcutFavicons;
      });
  }

  function pruneShortcutFavicons(shortcuts, persist) {
    const shortcutUrls = (Array.isArray(shortcuts) ? shortcuts : []).map((item) => item && item.url);
    const nextFavicons = SHORTCUT_FAVICON.retainCachedIcons(
      newtabShortcutFavicons,
      shortcutUrls
    );
    const changed = JSON.stringify(newtabShortcutFavicons) !== JSON.stringify(nextFavicons);
    newtabShortcutFavicons = nextFavicons;
    shortcutFaviconPendingCacheEntries = SHORTCUT_FAVICON.retainCachedIcons(
      shortcutFaviconPendingCacheEntries,
      shortcutUrls
    );
    if (changed && persist !== false) {
      shortcutFaviconStore.retainAll(shortcutUrls).catch(() => {});
    }
    return changed;
  }

  function loadNewtabShortcutPreferences() {
    if (!storageArea) {
      newtabShortcutsVisible = true;
      newtabShortcutAddVisible = true;
      newtabShortcutDockMagnificationEnabled = true;
      newtabShortcutColumns = NEWTAB_SHORTCUT_COLUMNS_DEFAULT;
      newtabShortcutSize = NEWTAB_SHORTCUT_SIZE_DEFAULT;
      newtabShortcutGap = NEWTAB_SHORTCUT_GAP_DEFAULT;
      applyNewtabShortcutLayoutPreferences();
      applyNewtabShortcutsVisibility();
      applyNewtabShortcutDockMagnification();
      updateNewtabShortcutPreferencesUi();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      storageArea.get([
        NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
        NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
        NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
        NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
        NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
        NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
        NEWTAB_SHORTCUT_GAP_STORAGE_KEY
      ], (result) => {
        const stored = result || {};
        const rawVisible = stored[NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY];
        const rawAddVisible = stored[NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY];
        const rawMagnification =
          stored[NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY];
        const rawWidth = stored[NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY];
        const rawColumns = stored[NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY];
        const rawSize = stored[NEWTAB_SHORTCUT_SIZE_STORAGE_KEY];
        const rawGap = stored[NEWTAB_SHORTCUT_GAP_STORAGE_KEY];
        newtabShortcutsVisible = normalizeNewtabShortcutsVisible(rawVisible);
        newtabShortcutAddVisible = normalizeNewtabShortcutAddVisible(rawAddVisible);
        newtabShortcutDockMagnificationEnabled =
          normalizeNewtabShortcutDockMagnificationEnabled(rawMagnification);
        newtabShortcutColumns = rawColumns === undefined
          ? inferNewtabShortcutColumnsFromWidth(rawWidth)
          : normalizeNewtabShortcutColumns(rawColumns);
        newtabShortcutSize = normalizeNewtabShortcutSize(rawSize);
        newtabShortcutGap = normalizeNewtabShortcutGap(rawGap);
        const repairs = {};
        if (rawVisible !== newtabShortcutsVisible) {
          repairs[NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY] = newtabShortcutsVisible;
        }
        if (rawAddVisible !== newtabShortcutAddVisible) {
          repairs[NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY] = newtabShortcutAddVisible;
        }
        if (rawMagnification !== newtabShortcutDockMagnificationEnabled) {
          repairs[NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY] =
            newtabShortcutDockMagnificationEnabled;
        }
        if (rawColumns !== newtabShortcutColumns) {
          repairs[NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY] = newtabShortcutColumns;
        }
        if (rawSize !== newtabShortcutSize) {
          repairs[NEWTAB_SHORTCUT_SIZE_STORAGE_KEY] = newtabShortcutSize;
        }
        if (rawGap !== newtabShortcutGap) {
          repairs[NEWTAB_SHORTCUT_GAP_STORAGE_KEY] = newtabShortcutGap;
        }
        if (Object.keys(repairs).length > 0) {
          storageArea.set(repairs);
        }
        applyNewtabShortcutLayoutPreferences();
        applyNewtabShortcutsVisibility();
        applyNewtabShortcutDockMagnification();
        updateNewtabShortcutPreferencesUi();
        resolve();
      });
    });
  }

  function loadVisibleShortcuts() {
    return Promise.all([loadShortcuts(), loadShortcutIcons(), loadShortcutFavicons(), loadFolderColors()]).then(() => {
      const prunedIcons = getNextShortcutIconMap(newtabShortcuts);
      const shouldPrune = !areShortcutIconMapsEqual(newtabShortcutIcons, prunedIcons);
      const shouldPruneFavicons = pruneShortcutFavicons(newtabShortcuts, false);
      newtabShortcutIcons = prunedIcons;
      renderShortcuts();
      if (shouldPrune) {
        shortcutIconStore.writeAll(prunedIcons).catch(() => {});
      }
      if (shouldPruneFavicons) {
        const shortcutUrls = newtabShortcuts.map((item) => item && item.url);
        shortcutFaviconStore.retainAll(shortcutUrls).catch(() => {});
      }
      return newtabShortcuts;
    });
  }

  function getNextShortcutIconMap(shortcuts, iconChange) {
    const validIds = new Set(
      (Array.isArray(shortcuts) ? shortcuts : [])
        .map((item) => String(item && item.id ? item.id : '').trim())
        .filter(Boolean)
    );
    const nextIcons = {};
    Object.keys(newtabShortcutIcons).forEach((shortcutId) => {
      if (validIds.has(shortcutId)) {
        nextIcons[shortcutId] = newtabShortcutIcons[shortcutId];
      }
    });
    const change = iconChange && typeof iconChange === 'object' ? iconChange : {};
    const shortcutId = String(change.shortcutId || '').trim();
    if (shortcutId && validIds.has(shortcutId)) {
      if (change.action === 'remove') {
        delete nextIcons[shortcutId];
      } else if (change.action === 'replace') {
        const dataUrl = NEWTAB_SHORTCUT_ICON_STORE.normalizeIconDataUrl(change.dataUrl);
        if (dataUrl) {
          nextIcons[shortcutId] = dataUrl;
        }
      }
    }
    return NEWTAB_SHORTCUT_ICON_STORE.normalizeIconMap(nextIcons);
  }

  function areShortcutIconMapsEqual(leftValue, rightValue) {
    const left = NEWTAB_SHORTCUT_ICON_STORE.normalizeIconMap(leftValue);
    const right = NEWTAB_SHORTCUT_ICON_STORE.normalizeIconMap(rightValue);
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
  }

  function persistShortcuts(nextShortcuts, toastMessage, iconChange, persistOptions) {
    const options = getShortcutStoreOptions();
    const settings = persistOptions && typeof persistOptions === 'object'
      ? persistOptions
      : {};
    const normalized = NEWTAB_SHORTCUTS_STORE.normalizeShortcuts(nextShortcuts, options);
    const previousIcons = newtabShortcutIcons;
    const nextIcons = getNextShortcutIconMap(normalized, iconChange);
    const iconsChanged = !areShortcutIconMapsEqual(previousIcons, nextIcons);
    let didWriteIcons = false;
    let didStartItemPersistence = false;
    const syncBudgetReady = getShortcutSyncByteBudget();
    const iconsReady = iconsChanged
      ? shortcutIconStore.writeAll(nextIcons).then((savedIcons) => {
        didWriteIcons = true;
        return savedIcons;
      })
      : Promise.resolve(nextIcons);
    const persistItems = () => {
      didStartItemPersistence = true;
      shortcutPersistenceInFlightCount += 1;
      const finishTrackedPersistence = (operation) => Promise.resolve(operation).finally(() => {
        shortcutPersistenceInFlightCount = Math.max(0, shortcutPersistenceInFlightCount - 1);
      });
      if (!storageArea) {
        return finishTrackedPersistence(Promise.resolve({
          items: normalized,
          localOnlyIds: [],
          syncLimited: false
        }));
      }
      if (!isShortcutSyncStorageActive()) {
        return finishTrackedPersistence(NEWTAB_SHORTCUTS_STORE.saveShortcuts(storageArea, normalized, {
          ...options,
          maxItemBytes: Number.MAX_SAFE_INTEGER,
          maxTotalBytes: Number.MAX_SAFE_INTEGER
        }).then((items) => ({
          items,
          localOnlyIds: [],
          syncLimited: false
        })));
      }
      return finishTrackedPersistence(syncBudgetReady.then((maxTotalBytes) => {
        const plan = NEWTAB_SHORTCUTS_STORE.createShortcutStoragePlan(normalized, {
          ...options,
          maxTotalBytes
        });
        const overflowIds = plan.overflowItems.map((item) => String(item && item.id || ''));
        return writeShortcutLocalState(plan.overflowItems, false)
          .then(() => NEWTAB_SHORTCUTS_STORE.saveShortcutStoragePlan(
            storageArea,
            plan,
            {
              ...options,
              getLastError: getShortcutStorageLastError
            }
          ))
          .then(() => ({
            items: normalized,
            localOnlyIds: overflowIds,
            syncLimited: overflowIds.length > 0
          }))
          .catch((syncError) => {
            return writeShortcutLocalState(normalized, true).then(() => ({
              items: normalized,
              localOnlyIds: normalized.map((item) => String(item && item.id || '')),
              syncError,
              syncLimited: true
            }));
          });
      }));
    };
    return iconsReady
      .then((savedIcons) => {
        newtabShortcutIcons = savedIcons;
        return persistItems();
      })
      .then((result) => {
        const items = result && Array.isArray(result.items) ? result.items : normalized;
        newtabShortcuts = items;
        pruneShortcutFavicons(newtabShortcuts);
        if (settings.render !== false) {
          renderShortcuts();
        }
        const overflowShortcutId = String(settings.syncOverflowShortcutId || '');
        const shouldWarnAboutSyncLimit = Boolean(
          result && result.syncLimited === true && overflowShortcutId &&
          Array.isArray(result.localOnlyIds) &&
          result.localOnlyIds.includes(overflowShortcutId)
        );
        if (shouldWarnAboutSyncLimit) {
          showToast(t(
            'newtab_shortcuts_sync_limit_reached',
            'Shortcuts have reached the sync limit. New items will not sync.'
          ), false, { duration: 3600 });
        } else if (toastMessage) {
          showToast(toastMessage);
        }
        return true;
      })
      .catch(async (error) => {
        if (didWriteIcons) {
          try {
            await shortcutIconStore.writeAll(previousIcons);
          } catch (rollbackError) {
            console.warn('[Lumno] Failed to roll back shortcut icons', rollbackError);
          }
        }
        newtabShortcutIcons = previousIcons;
        renderShortcuts();
        if (didStartItemPersistence) {
          console.warn('[Lumno] Failed to save shortcuts', error);
          showToast(t('toast_error', 'Operation failed. Please try again.'), true);
        } else {
          setShortcutIconError(t(
            'newtab_shortcuts_icon_storage_error',
            'The local icon could not be saved. Try another image.'
          ));
        }
        return false;
      });
  }

  function saveNewShortcutFromDialog(title, url, iconState) {
    const options = getShortcutStoreOptions();
    const nextShortcut = NEWTAB_SHORTCUTS_STORE.createShortcutRecord({ title, url,
      iconSource: iconState && iconState.source }, options);
    if (!nextShortcut) {
      setShortcutError(t('newtab_shortcuts_invalid_url', 'Enter a valid http, https, or browser internal URL.'));
      return Promise.resolve(false);
    }
    const withoutDuplicate = newtabShortcuts.filter((item) => item && item.url !== nextShortcut.url);
    if (withoutDuplicate.length >= MAX_NEWTAB_SHORTCUTS) {
      setShortcutError(formatMessage(
        'newtab_shortcuts_limit_reached',
        'You can add up to {count} shortcuts.',
        { count: MAX_NEWTAB_SHORTCUTS }
      ));
      return Promise.resolve(false);
    }
    const nextShortcuts = withoutDuplicate.concat(nextShortcut);
    return persistShortcuts(
      nextShortcuts,
      t('newtab_shortcuts_added', 'Shortcut added'),
      {
        shortcutId: nextShortcut.id,
        action: iconState && iconState.action,
        dataUrl: iconState && iconState.dataUrl
      },
      {
        syncOverflowShortcutId: nextShortcut.id
      }
    );
  }

  function saveEditedShortcutFromDialog(title, url, shortcutId, iconState) {
    const currentShortcut = getShortcutById(shortcutId);
    if (!currentShortcut) {
      setShortcutError(t('newtab_shortcuts_invalid_url', 'Enter a valid http, https, or browser internal URL.'));
      return Promise.resolve(false);
    }
    const options = getShortcutStoreOptions();
    const nextShortcut = NEWTAB_SHORTCUTS_STORE.createShortcutRecord({ title, url,
      iconSource: iconState && iconState.source || currentShortcut.iconSource }, options);
    if (!nextShortcut) {
      setShortcutError(t('newtab_shortcuts_invalid_url', 'Enter a valid http, https, or browser internal URL.'));
      return Promise.resolve(false);
    }
    nextShortcut.id = currentShortcut.id;
    nextShortcut.createdAt = currentShortcut.createdAt;
    nextShortcut.updatedAt = Date.now();
    const nextShortcuts = [];
    newtabShortcuts.forEach((item) => {
      if (!item) {
        return;
      }
      if (item.id === currentShortcut.id) {
        nextShortcuts.push(nextShortcut);
        return;
      }
      if (item.url === nextShortcut.url) {
        return;
      }
      nextShortcuts.push(item);
    });
    return persistShortcuts(
      nextShortcuts,
      t('newtab_shortcuts_edited', 'Shortcut updated'),
      {
        shortcutId: nextShortcut.id,
        action: iconState && iconState.action,
        dataUrl: iconState && iconState.dataUrl
      }
    );
  }

  function saveShortcutFromDialog(title, url, dialogState) {
    const iconState = {
      action: dialogState && dialogState.iconAction,
      dataUrl: dialogState && dialogState.iconDataUrl,
      source: dialogState && dialogState.iconSource
    };
    if (dialogState && dialogState.mode === SHORTCUT_DIALOG_MODE_EDIT) {
      return saveEditedShortcutFromDialog(title, url, dialogState.shortcutId, iconState);
    }
    return saveNewShortcutFromDialog(title, url, iconState);
  }

  function saveBookmarkFromDialog(title, url, dialogState) {
    const itemId = String(
      (dialogState && (dialogState.itemId || dialogState.shortcutId)) || ''
    );
    const itemType = String((dialogState && dialogState.itemType) || '');
    const isFolder = itemType === SHORTCUT_DIALOG_ITEM_FOLDER;
    const nextUrl = String(url || '').trim();
    if (!itemId || (!isFolder && !nextUrl)) {
      setShortcutError(t('bookmarks_invalid_url', 'Enter a valid URL.'));
      return Promise.resolve(false);
    }
    const changes = {
      title: String(title || '').trim()
    };
    if (!isFolder) {
      changes.url = nextUrl;
    }
    const keepCascadeOpen = Boolean(
      bookmarkCascadeRuntime &&
      typeof bookmarkCascadeRuntime.isOpen === 'function' &&
      bookmarkCascadeRuntime.isOpen()
    );
    return bookmarksRuntime.runControlledMutation(() => {
      return bookmarksRuntime.update(itemId, changes);
    }).then(() => {
      markBookmarkTreeDirty({ preserveCascadeOpen: keepCascadeOpen });
      loadBookmarks({ force: true });
      if (keepCascadeOpen) {
        refreshOpenBookmarkCascadeMenu();
      }
      showToast(t(
        isFolder ? 'bookmarks_folder_updated' : 'bookmarks_updated',
        isFolder ? 'Folder updated' : 'Bookmark updated'
      ));
      return true;
    }).catch((error) => {
      console.warn('[Lumno] Failed to update bookmark', error);
      setShortcutError(t('bookmarks_update_failed', 'Could not update bookmark.'));
      return false;
    });
  }

  function removeShortcutById(shortcutId) {
    const id = String(shortcutId || '');
    if (!id || bookmarkMoveHistoryBusy) {
      return Promise.resolve(false);
    }
    const index = newtabShortcuts.findIndex((item) => item && item.id === id);
    if (index < 0) {
      return Promise.resolve(false);
    }
    const record = NEWTAB_BOOKMARK_MOVE_HISTORY.createShortcutDeleteRecord({
      snapshot: newtabShortcuts[index], index,
      iconDataUrl: newtabShortcutIcons[id]
    });
    bookmarkMoveHistoryBusy = true;
    return persistShortcuts(newtabShortcuts.filter((item) => item && item.id !== id)).then((saved) => {
      if (saved) {
        bookmarkMoveHistory.push(record);
        showToast(formatMessage(
          'newtab_shortcuts_removed_undo',
          'Shortcut removed · {shortcut} to undo',
          { shortcut: getBookmarkUndoShortcutLabel() }
        ));
      }
      return saved;
    }).finally(() => { bookmarkMoveHistoryBusy = false; });
  }

  function hideShortcutAddFromContextMenu(sourceElement) {
    if (!newtabShortcutAddVisible) {
      return;
    }
    newtabShortcutAddVisible = false;
    const addButton = sourceElement || addShortcutButton;
    if (addButton) {
      addButton.hidden = true;
    }
    hideShortcutTooltip();
    resetShortcutDockHover();
    applyNewtabShortcutsVisibility();
    updateBookmarkSectionPosition({ preserveSearchEntryLayout: true });
    scheduleWallpaperAdaptiveToneUpdate();
    if (storageArea) {
      storageArea.set({ [NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]: false });
    }
    showToast(t(
      'newtab_shortcuts_add_hidden',
      '“+” hidden. Re-enable it in Settings → Appearance → Shortcuts → Show “+”.'
    ));
  }

  function createShortcutsSection() {
    shortcutSection = pageStructureRuntime.shortcut.section;
    shortcutSection.setAttribute('aria-label', t('newtab_shortcuts_section_label', 'Shortcuts'));

    shortcutGrid = pageStructureRuntime.shortcut.grid;
    applyNewtabShortcutDockMagnification();

    shortcutsView = NEWTAB_SHORTCUTS_VIEW.createShortcutsView({
      grid: shortcutGrid,
      tiles: shortcutTiles,
      maxShortcuts: MAX_NEWTAB_SHORTCUTS,
      getFolderIconSvg: getFigmaFolderSvg,
      initFolderIcon: initFolderPathMorph,
      animateFolderIcon: playFolderPathMorph,
      getShortcutTitle,
      getHostFromUrl,
      getShortcutIconDataUrl,
      getShortcutFaviconDataUrl,
      resolveShortcutFaviconDataUrl,
      getShortcutFaviconPolicyRevision: () => shortcutFaviconPolicyRevision,
      getShortcutFaviconCandidateUrl,
      getImmediateThemeForSuggestion,
      applyShortcutTileTheme,
      queueThemeForTarget,
      attachFaviconWithFallbacks,
      bindTooltip: bindShortcutTooltip,
      hideTooltip: hideShortcutTooltip,
      formatOpenLabel: (title) => formatMessage('open_prefix', '打开 {title}', { title }),
      isMiddleClick,
      openShortcut: openShortcutUrl,
      onContextMenu: handleShortcutContextMenu,
      onNativeDragStart: handleShortcutNativeDragStart,
      getAddLabel: () => t('newtab_shortcuts_add', 'Add shortcut'),
      getAddIconSvg: () => getRiSvg('ri-add-line', 'ri-size-28'),
      getAddVisible: () => newtabShortcutAddVisible && newtabShortcuts.length < MAX_NEWTAB_SHORTCUTS,
      onAdd: (sourceElement) => {
        hideShortcutTooltip();
        openShortcutDialog({ sourceElement });
      },
      onAddContextMenu: openShortcutAddContextMenu
    });
    shortcutsView.render([]);
    addShortcutButton = shortcutsView.getAddButton();
    shortcutGrid.addEventListener('pointerdown', handleShortcutDragPointerDown);
    shortcutGrid.addEventListener('pointerover', handleShortcutDockPointerOver);
    shortcutGrid.addEventListener('pointermove', handleShortcutDockPointerMove);
    shortcutGrid.addEventListener('pointerleave', resetShortcutDockHover);
    updateShortcutLanguageStrings();
  }

  function createShortcutDialogComponent() {
    return NEWTAB_SHORTCUT_DIALOG.createShortcutDialog({
      documentObj: document,
      windowObj: window,
      t,
      getRiSvg,
      bindTooltip: bindShortcutDialogTooltip,
      hideTooltip: hideShortcutDialogTooltip,
      prepareIconFile: shortcutIconStore.prepareFile,
      getOnlineIconUrl: getShortcutDialogOnlineIconUrl,
      getOnlineIconSource: getShortcutDialogOnlineIconSource,
      getBuiltinIconUrl: getShortcutDialogBuiltinIconUrl,
      isIconSourceAvailable: isShortcutDialogIconSourceAvailable,
      refreshOnlineIcon: refreshShortcutDialogOnlineIcon,
      onSubmit(payload) {
        if (payload.itemType === SHORTCUT_DIALOG_ITEM_BOOKMARK ||
            payload.itemType === SHORTCUT_DIALOG_ITEM_FOLDER) {
          return saveBookmarkFromDialog(payload.title, payload.url, {
            itemType: payload.itemType,
            itemId: payload.itemId,
            shortcutId: payload.shortcutId
          });
        }
        return saveShortcutFromDialog(payload.title, payload.url, {
          mode: payload.mode,
          shortcutId: payload.shortcutId,
          iconAction: payload.iconAction,
          iconDataUrl: payload.iconDataUrl,
          iconSource: payload.iconSource
        }).then((saved) => {
          const onlineIcon = payload.onlineIcon;
          const pageUrl = SHORTCUT_FAVICON.normalizePageUrl(
            NEWTAB_SHORTCUTS_STORE.normalizeShortcutUrl(payload.url)
          );
          if (saved && onlineIcon && pageUrl && pageUrl === onlineIcon.pageUrl) {
            saveShortcutFaviconSnapshot(pageUrl, onlineIcon.dataUrl, onlineIcon.sourceUrl, true);
            renderShortcuts();
          }
          return saved;
        });
      }
    });
  }

  createShortcutsSection();
  markNewtabStartupMilestone('shortcut-surface-created');

  setContentSectionVisible(bookmarkSection, false);
  const bookmarkHeader = pageStructureRuntime.bookmark.header;
  bookmarkTitleWrap = pageStructureRuntime.bookmark.titleWrap;
  bookmarkHeading = pageStructureRuntime.bookmark.heading;
  updateBookmarkHeading();
  bookmarkBreadcrumb = pageStructureRuntime.bookmark.breadcrumb;
  bookmarkBreadcrumbController =
    NEWTAB_BOOKMARK_BREADCRUMB.createBookmarkBreadcrumbController(
      bookmarkBreadcrumb,
      { onNavigate: navigateBookmarkFolder }
    );
  bookmarkBreadcrumbController.render({ items: [] });
  bookmarkModeMenu = createSectionModeSelect({
    id: '_x_extension_newtab_bookmark_mode_2026_unique_',
    menuTitleKey: 'display_mode_title',
    menuTitleFallback: 'Display mode',
    getValue: () => currentBookmarkViewMode,
    onChange: setBookmarkViewMode,
    onAction: handleBookmarkModeMenuAction,
    getOptions: getBookmarkViewModeOptions
  });
  const bookmarkPager = pageStructureRuntime.bookmark.pager;
  bookmarkPagerPrevButton = pageStructureRuntime.bookmark.previousButton;
  bookmarkPagerNextButton = pageStructureRuntime.bookmark.nextButton;
  bookmarkOpenManagerButton = pageStructureRuntime.bookmark.managerButton;
  bindBookmarkPagerTooltip(
    bookmarkPagerPrevButton,
    () => bookmarkPagerPrevButton.getAttribute('data-tooltip') || t('bookmarks_page_prev', '上一页')
  );
  bindBookmarkPagerTooltip(
    bookmarkPagerNextButton,
    () => bookmarkPagerNextButton.getAttribute('data-tooltip') || t('bookmarks_page_next', '下一页')
  );
  bindBookmarkPagerTooltip(
    bookmarkOpenManagerButton,
    () => bookmarkOpenManagerButton.getAttribute('data-tooltip') || t('bookmarks_open_manager', '打开书签管理页')
  );
  if (bookmarkModeMenu) {
    bookmarkPager.appendChild(bookmarkModeMenu.control);
  }
  bookmarkHeading.addEventListener('click', () => {
    if (!bookmarkHeading._xCanNavigateRoot) {
      return;
    }
    navigateBookmarkFolder(bookmarkRootFolderId);
  });
  bookmarkHeading.addEventListener('keydown', (event) => {
    if (!bookmarkHeading._xCanNavigateRoot) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    navigateBookmarkFolder(bookmarkRootFolderId);
  });
  updateBookmarkPagerLabels();
  updateBookmarkBreadcrumb();
  bookmarkGrid = pageStructureRuntime.bookmark.grid;
  bookmarkGrid.setAttribute('data-view-mode', currentBookmarkViewMode);
  bookmarkGrid.addEventListener('pointerdown', handleBookmarkDragPointerDown, true);
  applyBookmarkGridColumns();
  bookmarksView = NEWTAB_BOOKMARKS_VIEW.createBookmarksView({
    documentObj: document,
    windowObj: window,
    grid: bookmarkGrid,
    cards: bookmarkCards,
    cardElementCache: bookmarkCardElementCache,
    folderIconsVisible: bookmarkFolderIconsVisible,
    t,
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
    applyCardTheme: applyBookmarkCardTheme,
    shouldDelayHoverFromRecent: shouldDelayBookmarkHoverFromRecent,
    hoverDelayFromRecentMs: BOOKMARK_HOVER_DELAY_FROM_RECENT_MS,
    shouldSuppressHover: shouldSuppressBookmarkHover,
    bindCursorTooltip,
    hideCursorTooltip,
    openFolder: openBookmarkFolder,
    openFolderMenu: openBookmarkCascadeMenu,
    copyUrl: copyBookmarkUrl,
    onItemContextMenu: handleBookmarkItemContextMenu,
    navigateToUrl,
    openUrl: openUrlFromNewtabCard
  });
  bookmarkCascadeRuntime = NEWTAB_BOOKMARK_CASCADE_MENU.createBookmarkCascadeMenuRuntime({
    documentObj: document,
    windowObj: window,
    storageArea,
    debugStorageKey: BOOKMARK_CASCADE_DEBUG_STORAGE_KEY,
    positionUtils: NEWTAB_BOOKMARK_CASCADE_POSITION,
    menuSurface: globalThis.LumnoMenuSurface,
    t,
    sanitizeDisplayText,
    getHostFromUrl,
    getSiteDisplayName,
    getUrlDisplay,
    getRiSvg,
    getFigmaFolderSvg,
    initFolderPathMorph,
    playFolderPathMorph,
    attachFaviconWithFallbacks,
    isLocalNetworkHost,
    getChromeFaviconUrl,
    getBrowserPageFaviconUrl,
    ensureReady: (forceReload) => bookmarksRuntime.ensureReady(forceReload),
    getItems: (folderId) => {
      return bookmarksRuntime.getFolderItems(folderId);
    },
    navigateToUrl,
    openUrl: openUrlFromNewtabCard,
    shouldSuppressHover: shouldSuppressBookmarkHover,
    bindCursorTooltip,
    hideCursorTooltip,
    copyUrl: copyBookmarkUrl,
    copyTooltipController: bookmarkCascadeCopyTooltipController,
    showTopActionTooltip,
    hideTopActionTooltip,
    onItemPointerDown: handleBookmarkCascadeItemPointerDown,
    onItemContextMenu: handleBookmarkItemContextMenu,
    shouldKeepOpenForExternalNode: isBookmarkContextMenuNode,
    getViewportTopPadding: getBookmarkCascadeViewportTopPaddingPx,
    view: NEWTAB_BOOKMARK_CASCADE_VIEW
  });
  bookmarkTopbarRuntime = NEWTAB_BOOKMARKS_TOPBAR.createBookmarksTopbar({
    documentObj: document,
    windowObj: window,
    grid: bookmarkGrid,
    modeControl: bookmarkModeMenu ? bookmarkModeMenu.control : null,
    managerButton: bookmarkOpenManagerButton,
    ariaLabel: t('bookmark_view_mode_top', 'Top bookmarks bar'),
    onVisibilityChange: setNewtabTopOccupied
  });
  syncBookmarkTopbarSurfaceAppearance({ updateMenu: false, scheduleTone: false });
  syncBookmarkSurfaceMode();
  let bookmarkRenderSignature = '';
  let sectionDataRevision = 0;
  let bookmarkLoadToken = 0;
  let bookmarkDataDirty = true;
  let bookmarkLoadedOnce = false;

  setContentSectionVisible(recentSection, false);
  recentSection.addEventListener('pointerenter', (event) => {
    if (!event || event.pointerType !== 'mouse') {
      return;
    }
    recentMouseInsideSection = true;
    recentMouseLeftAt = 0;
  });
  recentSection.addEventListener('pointerleave', (event) => {
    if (!event || event.pointerType !== 'mouse') {
      return;
    }
    recentMouseInsideSection = false;
    recentMouseLeftAt = Date.now();
    hideTopActionTooltip();
  });
  recentSection.addEventListener('pointercancel', () => {
    recentMouseInsideSection = false;
    hideTopActionTooltip();
  });
  recentHeader = pageStructureRuntime.recent.header;
  recentHeading = pageStructureRuntime.recent.heading;
  updateRecentHeading();
  recentModeMenu = createSectionModeSelect({
    id: '_x_extension_newtab_recent_mode_2026_unique_',
    menuTitleKey: 'display_mode_title',
    menuTitleFallback: 'Display mode',
    getValue: () => currentRecentMode,
    onChange: (nextMode) => {
      setRecentMode(nextMode);
    },
    options: [
      {
        value: 'latest',
        labelKey: 'recent_mode_latest',
        fallback: 'Recent'
      },
      {
        value: 'most',
        labelKey: 'recent_mode_most',
        fallback: 'Most visited'
      }
    ]
  });
  recentGrid = pageStructureRuntime.recent.grid;
  applyRecentGridColumns();
  recentSitesView = NEWTAB_RECENT_VIEW.createRecentSitesView({
    documentObj: document,
    windowObj: window,
    grid: recentGrid,
    cards: recentCards,
    t,
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
    applyCardTheme: applyRecentCardTheme,
    getCurrentRecentCount: () => getRecentLimit(),
    isPinned: isRecentSitePinned,
    getPinnedCount: () => pinnedRecentSites.length,
    getMaxPinnedCount: () => MAX_PINNED_RECENT_SITES,
    updatePinButton: updateRecentPinButton,
    showToast,
    showTopActionTooltip,
    hideTopActionTooltip,
    navigateToUrl,
    bindCursorTooltip,
    hideCursorTooltip,
    openUrl: openUrlFromNewtabCard,
    togglePinned: togglePinnedRecentSite,
    onItemContextMenu: handleRecentCardContextMenu
  });
  if (recentModeMenu) {
    recentHeader.appendChild(recentModeMenu.control);
  }
  let recentRenderSignature = '';
  let recentLoadToken = 0;
  let recentDataDirty = true;
  let recentLoadedOnce = false;
  const bottomDockRuntime = NEWTAB_DOCK.createBottomDockRuntime({
    documentObj: document,
    windowObj: window,
    layoutRuntime: NEWTAB_LAYOUT,
    root,
    searchLayer: () => searchLayer,
    inputParts: () => inputParts,
    topContentContainer: () => topContentContainer,
    shortcutSection: () => shortcutSection,
    quoteSection: () => quoteRuntime && quoteRuntime.element,
    bookmarkSection,
    recentSection,
    suggestionsContainer,
    suggestionsSurface,
    suggestionsOutline,
    getTopInsetPx: getNewtabTopOccupiedInsetPx,
    constants: {
      minTopPx: SEARCH_LAYOUT_MIN_TOP_PX,
      minBottomPx: SEARCH_LAYOUT_MIN_BOTTOM_PX,
      upshiftRatio: SEARCH_LAYOUT_UPSHIFT_RATIO,
      upshiftMinPx: SEARCH_LAYOUT_UPSHIFT_MIN_PX,
      upshiftMaxPx: SEARCH_LAYOUT_UPSHIFT_MAX_PX,
      contentSectionsExtraUpshiftPx: SEARCH_LAYOUT_CONTENT_SECTIONS_EXTRA_UPSHIFT_PX,
      emptySectionsExtraUpshiftPx: SEARCH_LAYOUT_EMPTY_SECTIONS_EXTRA_UPSHIFT_PX,
      narrowViewportMinWidthPx: SEARCH_LAYOUT_NARROW_VIEWPORT_MIN_WIDTH_PX,
      narrowViewportMaxWidthPx: SEARCH_LAYOUT_NARROW_VIEWPORT_MAX_WIDTH_PX,
      narrowTopInsetPx: SEARCH_LAYOUT_NARROW_TOP_INSET_PX,
      narrowTopInsetTransitionPx: SEARCH_LAYOUT_NARROW_TOP_INSET_TRANSITION_PX,
      shortViewportMaxHeightPx: SEARCH_LAYOUT_SHORT_VIEWPORT_MAX_HEIGHT_PX,
      shortMinTopPx: SEARCH_LAYOUT_SHORT_MIN_TOP_PX,
      mobileFlowBreakpointPx: NEWTAB_MOBILE_FLOW_BREAKPOINT_PX
    }
  });
  const bottomDock = bottomDockRuntime.element;
  layoutController = bottomDockRuntime.layoutController;
  applyNewtabWidthMode();
  markNewtabStartupMilestone('dock-runtime-created');

  bookmarkPagerPrevButton.addEventListener('click', () => {
    if (bookmarkCurrentPage <= 0) {
      return;
    }
    switchBookmarkPage(bookmarkCurrentPage - 1);
  });
  bookmarkPagerNextButton.addEventListener('click', () => {
    const pageCount = getBookmarkPageCount();
    if (bookmarkCurrentPage >= (pageCount - 1)) {
      return;
    }
    switchBookmarkPage(bookmarkCurrentPage + 1);
  });
  bookmarkOpenManagerButton.addEventListener('click', () => {
    if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
      return;
    }
    chrome.runtime.sendMessage({ action: 'openBookmarkManager' });
  });
  bookmarkSection.addEventListener('wheel', (event) => {
    if (!event) {
      return;
    }
    if (!isContentSectionVisible(bookmarkSection)) {
      return;
    }
    const pageCount = getBookmarkPageCount();
    if (pageCount <= 1) {
      return;
    }
    const deltaY = Number(event.deltaY) || 0;
    if (Math.abs(deltaY) < 6) {
      return;
    }
    event.preventDefault();
    if (bookmarkPageAnimating) {
      return;
    }
    const now = Date.now();
    if ((now - bookmarkWheelLastAt) < BOOKMARK_WHEEL_SWITCH_COOLDOWN_MS) {
      return;
    }
    let targetPage = bookmarkCurrentPage;
    if (deltaY > 0 && bookmarkCurrentPage < (pageCount - 1)) {
      targetPage = bookmarkCurrentPage + 1;
    } else if (deltaY < 0 && bookmarkCurrentPage > 0) {
      targetPage = bookmarkCurrentPage - 1;
    }
    if (targetPage === bookmarkCurrentPage) {
      return;
    }
    bookmarkWheelLastAt = now;
    switchBookmarkPage(targetPage);
  }, { passive: false });

  function getBookmarkPageCount() {
    if (isBookmarkTopbarMode()) {
      return 1;
    }
    const total = Array.isArray(bookmarkAllItems) ? bookmarkAllItems.length : 0;
    return Math.max(1, Math.ceil(total / getBookmarkLimit()));
  }

  function getBookmarkPageItems() {
    if (!Array.isArray(bookmarkAllItems) || bookmarkAllItems.length === 0) {
      return [];
    }
    if (isBookmarkTopbarMode()) {
      bookmarkCurrentPage = 0;
      return bookmarkAllItems.slice();
    }
    const pageCount = getBookmarkPageCount();
    bookmarkCurrentPage = Math.min(Math.max(0, bookmarkCurrentPage), pageCount - 1);
    return NEWTAB_BOOKMARKS_STORE.getBookmarkPageItems(
      bookmarkAllItems,
      bookmarkCurrentPage,
      getBookmarkLimit()
    );
  }

  function setBookmarkPagerButtonAvailability(button, available) {
    if (!button) {
      return;
    }
    const enabled = Boolean(available);
    button.removeAttribute('disabled');
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.tabIndex = enabled ? 0 : -1;
    if (!enabled && document.activeElement === button) {
      button.blur();
      hideTopActionTooltip();
    }
  }

  function updateBookmarkPagerState() {
    if (!bookmarkPagerPrevButton || !bookmarkPagerNextButton) {
      return;
    }
    const pageCount = getBookmarkPageCount();
    const atStart = bookmarkCurrentPage <= 0;
    const atEnd = bookmarkCurrentPage >= (pageCount - 1);
    setBookmarkPagerButtonAvailability(bookmarkPagerPrevButton, !atStart);
    setBookmarkPagerButtonAvailability(bookmarkPagerNextButton, !atEnd);
  }

  function updateBookmarkGridHeightLock() {
    if (!bookmarkGrid) {
      return;
    }
    if (bookmarkGrid.getAttribute('data-bookmark-empty-drop-surface') === 'true') {
      bookmarkGrid.style.setProperty(
        'min-height',
        `${isBookmarkTopbarMode() ? 44 : 64}px`
      );
      return;
    }
    if (isBookmarkTopbarMode()) {
      bookmarkGrid.style.removeProperty('min-height');
      return;
    }
    const total = Array.isArray(bookmarkAllItems) ? bookmarkAllItems.length : 0;
    const cols = getBookmarkGridColumnCount();
    const firstCard = bookmarkGrid.querySelector('.x-nt-bookmark-card');
    const cardHeight = firstCard ? firstCard.getBoundingClientRect().height : 51;
    const gridStyle = window.getComputedStyle(bookmarkGrid);
    const rowGap = Number.parseFloat(gridStyle.rowGap) || 16;
    const isAtRoot = String(bookmarkCurrentFolderId || '') === String(bookmarkRootFolderId || '1');
    const pageLimit = getBookmarkLimit();
    let targetItemCount = 0;

    if (isAtRoot) {
      if (total <= pageLimit) {
        bookmarkGrid.style.removeProperty('min-height');
        return;
      }
      targetItemCount = pageLimit;
    } else {
      if (bookmarkRootTotalCount > pageLimit) {
        targetItemCount = pageLimit;
      } else {
        targetItemCount = Math.max(0, bookmarkRootVisibleCount);
      }
      if (targetItemCount <= 0) {
        if (total <= pageLimit) {
          bookmarkGrid.style.removeProperty('min-height');
          return;
        }
        targetItemCount = pageLimit;
      }
    }

    const rowsPerPage = Math.max(1, Math.ceil(targetItemCount / cols));
    const minHeight = (rowsPerPage * cardHeight) + ((rowsPerPage - 1) * rowGap);
    bookmarkGrid.style.setProperty('min-height', `${Math.ceil(minHeight)}px`);
  }

  function renderCurrentBookmarkPage() {
    renderBookmarks(getBookmarkPageItems());
    updateBookmarkPagerState();
  }

  function switchBookmarkPageDuringDrag(nextPage) {
    const pageCount = getBookmarkPageCount();
    const targetPage = Math.min(Math.max(0, Number(nextPage) || 0), pageCount - 1);
    if (targetPage === bookmarkCurrentPage || bookmarkPageAnimating) {
      return false;
    }
    bookmarkCurrentPage = targetPage;
    renderCurrentBookmarkPage();
    updateBookmarkSectionPosition();
    return true;
  }

  function switchBookmarkPage(nextPage) {
    const pageCount = getBookmarkPageCount();
    const targetPage = Math.min(Math.max(0, Number(nextPage) || 0), pageCount - 1);
    if (targetPage === bookmarkCurrentPage) {
      return;
    }
    if (bookmarkPageAnimating) {
      return;
    }
    if (!bookmarkGrid) {
      bookmarkCurrentPage = targetPage;
      renderCurrentBookmarkPage();
      updateBookmarkSectionPosition();
      return;
    }
    const direction = targetPage > bookmarkCurrentPage ? 1 : -1;
    const offsetPx = 34;
    const durationMs = 220;
    const fadeDurationMs = 150;
    const colStaggerMs = 24;
    const rowStaggerMs = 10;
    const randomJitterRangeMs = 6;
    const handoffOverlapMs = 70;
    const cols = getBookmarkGridColumnCount();
    const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
    bookmarkPageAnimating = true;
    const getCards = () => Array.from(bookmarkGrid.children || []);
    const getDelayByIndex = (card, index, pageSeed) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const seedText = `${pageSeed || 0}|${index}|${card && card._xTitleText ? card._xTitleText : ''}`;
      const seed = Math.abs(stableHashCode(seedText));
      const jitter = (seed % (randomJitterRangeMs * 2 + 1)) - randomJitterRangeMs;
      return Math.max(0, (col * colStaggerMs) + (row * rowStaggerMs) + jitter);
    };

    const cleanupCards = (cards) => {
      cards.forEach((card) => {
        card.style.removeProperty('transition');
        card.style.removeProperty('transform');
        card.style.removeProperty('opacity');
        card.style.removeProperty('will-change');
      });
    };

    const cleanup = (cards) => {
      cleanupCards(cards);
      bookmarkPageAnimating = false;
    };

    const enterNextPage = () => {
      bookmarkCurrentPage = targetPage;
      renderCurrentBookmarkPage();
      updateBookmarkSectionPosition();
      const nextCards = getCards();
      if (nextCards.length === 0) {
        cleanup(nextCards);
        return;
      }
      nextCards.forEach((card, index) => {
        card.style.setProperty('will-change', 'transform, opacity');
        card.style.setProperty('transition', 'none');
        card.style.setProperty('opacity', '0');
        card.style.setProperty('transform', `translateX(${direction * offsetPx}px)`);
      });
      void bookmarkGrid.offsetHeight;
      let maxInDelay = 0;
      nextCards.forEach((card, index) => {
        const delay = getDelayByIndex(card, index, targetPage);
        if (delay > maxInDelay) {
          maxInDelay = delay;
        }
        card.style.setProperty(
          'transition',
          `transform ${durationMs}ms ${easing} ${delay}ms, opacity ${fadeDurationMs}ms ${easing} ${delay}ms`
        );
        card.style.setProperty('opacity', '1');
        card.style.setProperty('transform', 'translateX(0)');
      });
      const inTotalMs = durationMs + maxInDelay;
      window.setTimeout(() => cleanup(nextCards), inTotalMs + 20);
    };

    const currentCards = getCards();
    if (currentCards.length === 0) {
      enterNextPage();
      return;
    }
    let maxOutDelay = 0;
    currentCards.forEach((card, index) => {
      const delay = getDelayByIndex(card, index, bookmarkCurrentPage);
      if (delay > maxOutDelay) {
        maxOutDelay = delay;
      }
      card.style.setProperty('will-change', 'transform, opacity');
      card.style.setProperty(
        'transition',
        `transform ${durationMs}ms ${easing} ${delay}ms, opacity ${fadeDurationMs}ms ${easing} ${delay}ms`
      );
      card.style.setProperty('opacity', '0');
      card.style.setProperty('transform', `translateX(${direction * -offsetPx}px)`);
    });
    const outTotalMs = durationMs + maxOutDelay;
    const handoffDelayMs = Math.max(0, outTotalMs - handoffOverlapMs);
    window.setTimeout(() => {
      cleanupCards(currentCards);
      enterNextPage();
    }, handoffDelayMs);
  }

  function getCurrentSearchEntryPaddingTop() {
    if (!document.body || !document.body.style) {
      return null;
    }
    const value = Number.parseFloat(document.body.style.getPropertyValue('padding-top'));
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  function getSearchEntryViewportSnapshot() {
    return {
      width: Math.max(0, Math.round(window.innerWidth || 0)),
      height: Math.max(0, Math.round(window.innerHeight || 0))
    };
  }

  function hasSearchEntryViewportChanged(referenceViewport) {
    const currentViewport = getSearchEntryViewportSnapshot();
    const reference = referenceViewport || {};
    return Math.abs(currentViewport.width - (Number(reference.width) || 0)) > 1 ||
      Math.abs(currentViewport.height - (Number(reference.height) || 0)) > 1;
  }

  function rememberSearchEntryViewport() {
    const viewport = getSearchEntryViewportSnapshot();
    searchEntryLastVisibleViewportWidth = viewport.width;
    searchEntryLastVisibleViewportHeight = viewport.height;
  }

  function hasSearchEntryViewportChangedSinceLastVisible() {
    const viewport = getSearchEntryViewportSnapshot();
    return Math.abs(viewport.width - searchEntryLastVisibleViewportWidth) > 1 ||
      Math.abs(viewport.height - searchEntryLastVisibleViewportHeight) > 1;
  }

  function beginSearchEntryRestoreLayoutLock() {
    if (!document.body ||
        document.body.getAttribute('data-nt-ready') !== '1' ||
        hasSearchEntryViewportChangedSinceLastVisible() ||
        getCurrentSearchEntryPaddingTop() === null) {
      return;
    }
    searchEntryRestoreLayoutLockUntil = Date.now() + RESTORE_SEARCH_LAYOUT_LOCK_MS;
  }

  function shouldPreserveSearchEntryLayout() {
    if (!searchEntryRestoreLayoutLockUntil || Date.now() > searchEntryRestoreLayoutLockUntil) {
      searchEntryRestoreLayoutLockUntil = 0;
      return false;
    }
    if (getCurrentSearchEntryPaddingTop() === null) {
      searchEntryRestoreLayoutLockUntil = 0;
      return false;
    }
    return true;
  }

  function updateBookmarkSectionPosition(options) {
    const layoutOptions = options || {};
    if (layoutController && typeof layoutController.updateBottomDockLayout === 'function') {
      layoutController.updateBottomDockLayout({
        preserveSearchEntryLayout: Boolean(layoutOptions.preserveSearchEntryLayout) ||
          newtabResizeLayoutLocked ||
          shouldPreserveSearchEntryLayout(),
        stabilizeDockDensity: Boolean(layoutOptions.stabilizeDockDensity),
        releaseDockDensityLock: Boolean(layoutOptions.releaseDockDensityLock),
        onRecentHidden: () => {
          recentMouseInsideSection = false;
          recentMouseLeftAt = 0;
        }
      });
    }
    rememberSearchEntryViewport();
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function updateSearchEntryLayout(options) {
    if (layoutController && typeof layoutController.updateSearchEntryLayout === 'function') {
      layoutController.updateSearchEntryLayout(options);
    }
  }

  function getBookmarkCardFromNode(node) {
    return node && typeof node.closest === 'function'
      ? node.closest('.x-nt-bookmark-card')
      : null;
  }

  function getBookmarkCardId(card) {
    return card && typeof card.getAttribute === 'function'
      ? card.getAttribute('data-bookmark-id') || ''
      : '';
  }

  function getBookmarkCardParentId(card) {
    return card && typeof card.getAttribute === 'function'
      ? card.getAttribute('data-bookmark-parent-id') || ''
      : '';
  }

  function getBookmarkReorderCards() {
    return bookmarkGrid
      ? Array.from(bookmarkGrid.querySelectorAll('.x-nt-bookmark-card[data-bookmark-draggable="true"]'))
      : [];
  }

  function getBookmarkCardInsertionIndex(card) {
    if (!card) {
      return -1;
    }
    return getBookmarkReorderCards().indexOf(card);
  }

  function getBookmarkCardAllIndex(bookmarkId) {
    const id = String(bookmarkId || '');
    return id
      ? bookmarkAllItems.findIndex((item) => item && String(item.id || '') === id)
      : -1;
  }

  function getBookmarkPageStartIndex() {
    if (isBookmarkTopbarMode()) {
      return 0;
    }
    return Math.max(0, bookmarkCurrentPage * getBookmarkLimit());
  }

  function getBookmarkCardLayoutRect(card) {
    if (!card || !bookmarkGrid || typeof card.getBoundingClientRect !== 'function') {
      return null;
    }
    const rect = card.getBoundingClientRect();
    const left = Number(rect && rect.left);
    const top = Number(rect && rect.top);
    const width = Number(rect && rect.width);
    const height = Number(rect && rect.height);
    if (!Number.isFinite(left) || !Number.isFinite(top) ||
        !Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      centerX: left + (width / 2),
      centerY: top + (height / 2)
    };
  }

  function clearBookmarkCardLayoutAnimation(card) {
    if (!card || !card.style) {
      return;
    }
    if (card._xBookmarkLayoutAnimationTimer) {
      window.clearTimeout(card._xBookmarkLayoutAnimationTimer);
      card._xBookmarkLayoutAnimationTimer = 0;
    }
    card.style.removeProperty('transition');
    card.style.removeProperty('will-change');
    if (card.getAttribute && card.getAttribute('data-bookmark-dragging') !== 'true' &&
        card.getAttribute('data-bookmark-dropping') !== 'true') {
      card.style.removeProperty('transform');
    }
  }

  function getBookmarkCachedRectMap(state) {
    const rects = new Map();
    const layoutItems = Array.isArray(state && state.layoutItems) ? state.layoutItems : [];
    layoutItems.forEach((item) => {
      if (item && item.card && item.rect) {
        rects.set(item.card, item.rect);
      }
    });
    return rects;
  }

  function animateBookmarkLayoutShift(beforeRects, draggedCard) {
    if (!beforeRects || !bookmarkGrid) {
      return;
    }
    const cardsToAnimate = getBookmarkReorderCards().filter((card) =>
      card && card !== draggedCard && card.style && beforeRects.has(card)
    );
    cardsToAnimate.forEach(clearBookmarkCardLayoutAnimation);
    const shifts = [];
    cardsToAnimate.forEach((card) => {
      const before = beforeRects.get(card);
      const after = getBookmarkCardLayoutRect(card);
      if (!before || !after) {
        return;
      }
      const delta = NEWTAB_BOOKMARK_DRAG.getLayoutShiftDelta(before, after, {
        horizontalOnly: isBookmarkTopbarMode()
      });
      if (!delta) {
        return;
      }
      const { dx, dy } = delta;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        return;
      }
      shifts.push({ card, dx, dy });
    });
    shifts.forEach(({ card, dx, dy }) => {
      card.style.transition = 'none';
      card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    });
    window.requestAnimationFrame(() => {
      shifts.forEach(({ card }) => {
        if (!card.isConnected) {
          return;
        }
        card.style.transition = `transform ${BOOKMARK_REORDER_ANIMATION_MS}ms ${BOOKMARK_REORDER_EASING}`;
        card.style.transform = 'translate3d(0, 0, 0)';
        card._xBookmarkLayoutAnimationTimer = window.setTimeout(() => {
          card._xBookmarkLayoutAnimationTimer = 0;
          clearBookmarkCardLayoutAnimation(card);
        }, BOOKMARK_REORDER_ANIMATION_MS + 80);
      });
    });
  }

  function getBookmarkLayoutRectMapById() {
    const rects = new Map();
    getBookmarkReorderCards().forEach((card) => {
      const bookmarkId = getBookmarkCardId(card);
      const rect = getBookmarkCardLayoutRect(card);
      if (bookmarkId && rect) {
        rects.set(bookmarkId, rect);
      }
    });
    return rects;
  }

  function normalizeBookmarkAnimationRect(rect) {
    if (!rect) {
      return null;
    }
    const left = Number(rect.left);
    const top = Number(rect.top);
    const width = Number(rect.width);
    const height = Number(rect.height);
    if (!Number.isFinite(left) || !Number.isFinite(top) ||
        !Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }
    return {
      left,
      top,
      right: Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width,
      bottom: Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height,
      width,
      height
    };
  }

  function getBookmarkDragVisualRect(state) {
    const visualElement = getBookmarkDragVisualElement(state);
    return visualElement && typeof visualElement.getBoundingClientRect === 'function'
      ? normalizeBookmarkAnimationRect(visualElement.getBoundingClientRect())
      : null;
  }

  function queueBookmarkLayoutAnimation(excludedBookmarkId, animationOptions) {
    const options = animationOptions && typeof animationOptions === 'object'
      ? animationOptions
      : {};
    const rects = getBookmarkLayoutRectMapById();
    const draggedRect = normalizeBookmarkAnimationRect(options.draggedRect);
    bookmarkPendingLayoutAnimation = rects.size > 0 || draggedRect
      ? {
        folderId: String(bookmarkCurrentFolderId || ''),
        page: bookmarkCurrentPage,
        excludedBookmarkId: String(excludedBookmarkId || ''),
        draggedBookmarkId: String(options.draggedBookmarkId || ''),
        draggedRect,
        rects
      }
      : null;
  }

  function playPendingBookmarkLayoutAnimation() {
    const pending = bookmarkPendingLayoutAnimation;
    bookmarkPendingLayoutAnimation = null;
    if (!pending || !bookmarkGrid ||
        pending.folderId !== String(bookmarkCurrentFolderId || '') ||
        pending.page !== bookmarkCurrentPage) {
      return false;
    }
    const shifts = [];
    getBookmarkReorderCards().forEach((card) => {
      const bookmarkId = getBookmarkCardId(card);
      const isDraggedCard = Boolean(
        bookmarkId &&
        bookmarkId === pending.draggedBookmarkId &&
        pending.draggedRect
      );
      if (!bookmarkId ||
          (bookmarkId === pending.excludedBookmarkId && !isDraggedCard) ||
          (!isDraggedCard && !pending.rects.has(bookmarkId))) {
        return;
      }
      clearBookmarkCardLayoutAnimation(card);
      const before = isDraggedCard
        ? pending.draggedRect
        : pending.rects.get(bookmarkId);
      const after = getBookmarkCardLayoutRect(card);
      if (!before || !after) {
        return;
      }
      const delta = NEWTAB_BOOKMARK_DRAG.getLayoutShiftDelta(before, after, {
        horizontalOnly: isBookmarkTopbarMode()
      });
      if (!delta) {
        return;
      }
      const { dx, dy } = delta;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        return;
      }
      shifts.push({ card, dx, dy });
    });
    if (shifts.length === 0) {
      return false;
    }
    shifts.forEach(({ card, dx, dy }) => {
      card.style.transition = 'none';
      card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      card.style.willChange = 'transform';
    });
    void bookmarkGrid.offsetHeight;
    window.requestAnimationFrame(() => {
      shifts.forEach(({ card }) => {
        if (!card.isConnected) {
          return;
        }
        card.style.transition = `transform ${BOOKMARK_REORDER_ANIMATION_MS}ms ${BOOKMARK_REORDER_EASING}`;
        card.style.transform = 'translate3d(0, 0, 0)';
        card._xBookmarkLayoutAnimationTimer = window.setTimeout(() => {
          card._xBookmarkLayoutAnimationTimer = 0;
          clearBookmarkCardLayoutAnimation(card);
        }, BOOKMARK_REORDER_ANIMATION_MS + 80);
      });
    });
    return true;
  }

  function updateBookmarkDragLayoutCache(state) {
    if (!state || !state.card) {
      return;
    }
    const draggedCard = state.card;
    state.layoutItems = getBookmarkReorderCards()
      .filter((card) => card && card !== draggedCard)
      .map((card) => ({
        card,
        rect: getBookmarkCardLayoutRect(card)
      }))
      .filter((item) => item.rect && item.rect.width > 0 && item.rect.height > 0);
    const draggedLayoutRect = getBookmarkCardLayoutRect(draggedCard);
    if (draggedLayoutRect && !state.dragPreviewElement) {
      state.baseLeft = draggedLayoutRect.left;
      state.baseTop = draggedLayoutRect.top;
    }
  }

  function cancelBookmarkDragMoveFrame(state) {
    if (!state || !state.moveFrameId) {
      return;
    }
    window.cancelAnimationFrame(state.moveFrameId);
    state.moveFrameId = 0;
  }

  function getBookmarkDragVisualElement(state) {
    return NEWTAB_BOOKMARK_DRAG.getVisualElement(state);
  }

  function createBookmarkCascadeDragPreview(state) {
    return NEWTAB_BOOKMARK_DRAG.createPreview(state, {
      documentObj: document,
      renderClosedFolderIcon: ({ bookmarkId, folderIcon }) => {
        folderIcon.innerHTML = getFigmaFolderSvg(`${bookmarkId}-drag-preview`, bookmarkId);
        initFolderPathMorph(folderIcon);
        setFolderPathMorphState(folderIcon, false);
      }
    });
  }

  function removeBookmarkCascadeDragPreview(state) {
    NEWTAB_BOOKMARK_DRAG.removePreview(state);
  }

  function setBookmarkDragCardTransform(state, pointerX, pointerY) {
    NEWTAB_BOOKMARK_DRAG.updateVisualPosition(state, pointerX, pointerY, {
      windowObj: window
    });
  }

  function settleBookmarkDragCard(card) {
    if (!card || !card.style) {
      return;
    }
    card.setAttribute('data-bookmark-dropping', 'true');
    card.style.pointerEvents = '';
    card.style.transition = `transform ${BOOKMARK_DROP_ANIMATION_MS}ms ${BOOKMARK_REORDER_EASING}`;
    card.style.transform = 'translate3d(0, 0, 0)';
    if (card._xBookmarkDropTimer) {
      window.clearTimeout(card._xBookmarkDropTimer);
    }
    card._xBookmarkDropTimer = window.setTimeout(() => {
      card._xBookmarkDropTimer = 0;
      card.removeAttribute('data-bookmark-dragging');
      card.removeAttribute('data-bookmark-dropping');
      card.style.removeProperty('transition');
      card.style.removeProperty('transform');
      card.style.removeProperty('will-change');
      card.style.pointerEvents = '';
    }, BOOKMARK_DROP_ANIMATION_MS + 90);
  }

  function isPointInsideBookmarkElement(element, pointerX, pointerY) {
    return NEWTAB_BOOKMARK_DRAG.isPointInsideElement(element, pointerX, pointerY);
  }

  function getBookmarkGridInsertionDropTarget(state, pointerX, pointerY) {
    if (!bookmarkGrid || !state || !Number.isFinite(pointerX) ||
        !Number.isFinite(pointerY)) {
      return null;
    }
    const computedStyle = typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(bookmarkGrid)
      : null;
    const pageStartIndex = getBookmarkPageStartIndex();
    const pageEndIndex = pageStartIndex + getBookmarkLimit();
    const originalIndex = Number(state.originalIndex);
    const isCrossPageDrag = !isBookmarkTopbarMode() &&
      state.sourceKind === 'card' &&
      String(state.parentId || '') === String(bookmarkCurrentFolderId || '') &&
      Number.isFinite(originalIndex) &&
      (originalIndex < pageStartIndex || originalIndex >= pageEndIndex);
    return NEWTAB_BOOKMARK_DRAG.getGridInsertionTarget({
      columnGap: computedStyle ? computedStyle.columnGap : '',
      folderId: bookmarkCurrentFolderId,
      gridElement: bookmarkGrid,
      isCrossPageDrag,
      layoutItems: state && state.layoutItems,
      markerVerticalInsetPx: isBookmarkTopbarMode() ? 3 : 8,
      pageStartIndex,
      pointerX,
      pointerY
    });
  }

  function getBookmarkDropSurfaceElement() {
    if (!bookmarkGrid || currentBookmarkCount <= 0) {
      return null;
    }
    if (isBookmarkTopbarMode()) {
      return bookmarkTopbarRuntime && bookmarkTopbarRuntime.isVisible()
        ? bookmarkTopbarRuntime.element
        : null;
    }
    return isContentSectionVisible(bookmarkSection) ? bookmarkSection : null;
  }

  function isEmptyBookmarkRootHidden() {
    return Boolean(
      currentBookmarkCount > 0 &&
      bookmarkLoadedOnce &&
      !getBookmarkDropSurfaceElement() &&
      String(bookmarkCurrentFolderId || '') === String(bookmarkRootFolderId || '1') &&
      bookmarkAllItems.length === 0
    );
  }

  function getExternalBookmarkSurfacePoint(pointerX, pointerY) {
    const surface = getBookmarkDropSurfaceElement();
    if (!surface) {
      return null;
    }
    if (isBookmarkTopbarMode()) {
      return NEWTAB_BOOKMARK_DRAG.getTopbarDropPoint({
        surfaceElement: surface,
        viewportElement: bookmarkTopbarRuntime.viewport,
        pointerX,
        pointerY
      });
    }
    return NEWTAB_BOOKMARK_DRAG.isPointInsideElement(surface, pointerX, pointerY)
      ? { x: pointerX, y: pointerY } : null;
  }

  // Foreign items share the bookmark edge insertion zones. A folder's center
  // accepts its contents; ordinary cards snap to the nearest row boundary.
  function isValidExternalBookmarkDropTarget(state, target) {
    const nodeMap = bookmarksRuntime.getNodeMap();
    if (!target || !NEWTAB_CROSS_SURFACE_DRAG.isBookmarkFolderDropTarget(target.folderId, nodeMap)) {
      return false;
    }
    const destination = nodeMap.get(String(target.folderId));
    if (destination.unmodifiable) {
      return false;
    }
    if (target.kind === 'return') {
      const source = state && nodeMap.get(String(state.bookmarkId || ''));
      if (!source || source.url || !state.shortcutId ||
          String(target.bookmarkId) !== String(source.id) ||
          String(target.folderId) !== String(source.parentId)) {
        return false;
      }
    }
    return !state || !state.bookmarkId || !NEWTAB_BOOKMARK_MOVE_HISTORY.isFolderInsideBookmark(
      nodeMap, state.bookmarkId, target.folderId
    );
  }

  function resolveExternalBookmarkDropTarget(state, target) {
    const shortcut = state && state.shortcutId ? getShortcutById(state.shortcutId) : null;
    if (shortcut && shortcut.type === 'folder' && target &&
        (target.kind === 'card' || target.kind === 'cascade') &&
        String(target.folderId) === String(getShortcutFolderId(shortcut))) {
      const source = bookmarksRuntime.getNodeMap().get(String(getShortcutFolderId(shortcut)));
      if (source && !source.url) {
        // Returning the alias to its original bookmark removes the shortcut
        // without trying to move the real folder into itself.
        target = { ...target, kind: 'return', bookmarkId: source.id, folderId: source.parentId };
      }
    }
    return isValidExternalBookmarkDropTarget(state, target)
      ? target : { kind: 'blocked', surface: target && target.surface || 'folder' };
  }

  function getShortcutFolderDropTargetAt(state, pointerX, pointerY) {
    if (!isPointOverShortcutDropSurface(pointerX, pointerY)) {
      return null;
    }
    const tile = getShortcutReorderTiles().find((candidate) => {
      if (!candidate.hasAttribute('data-bookmark-drop-folder-id') || candidate === state.tile) {
        return false;
      }
      const rect = getShortcutTileLayoutRect(candidate);
      return rect && pointerX >= rect.left + rect.width * 0.25 &&
        pointerX <= rect.right - rect.width * 0.25 && pointerY >= rect.top && pointerY <= rect.bottom;
    });
    if (!tile) {
      return null;
    }
    const target = { kind: 'shortcut-folder', surface: 'folder', element: tile,
      folderId: tile.getAttribute('data-bookmark-drop-folder-id'),
      title: tile.getAttribute('data-shortcut-title') || '' };
    const valid = state === shortcutDragState
      ? isValidExternalBookmarkDropTarget(state, target)
      : isValidBookmarkFolderDropTarget(state, target);
    return valid ? target : { kind: 'blocked', surface: 'folder' };
  }

  function getExternalBookmarkDropTarget(pointerX, pointerY, state) {
    if (bookmarkCascadeRuntime && bookmarkCascadeRuntime.isOpen()) {
      const cascadeTarget = bookmarkCascadeRuntime.updateDragPointer({ clientX: pointerX, clientY: pointerY });
      if (cascadeTarget) {
        return resolveExternalBookmarkDropTarget(state, cascadeTarget);
      }
      if (isBookmarkCascadeSurfaceAtPoint(pointerX, pointerY)) {
        return null;
      }
    }
    const surfacePoint = getExternalBookmarkSurfacePoint(pointerX, pointerY);
    const folderTarget = getBookmarkElementDropTarget(
      surfacePoint ? surfacePoint.x : pointerX,
      surfacePoint ? surfacePoint.y : pointerY
    );
    if (folderTarget && folderTarget.kind !== 'card') {
      return resolveExternalBookmarkDropTarget(state, folderTarget);
    }
    if (!surfacePoint) {
      return folderTarget ? resolveExternalBookmarkDropTarget(state, folderTarget) : null;
    }
    const computedStyle = typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(bookmarkGrid)
      : null;
    const insertionTarget = NEWTAB_BOOKMARK_DRAG.getGridInsertionTarget({
      columnGap: computedStyle ? computedStyle.columnGap : '',
      folderId: bookmarkCurrentFolderId,
      gridElement: bookmarkGrid,
      // Keep the shared narrow edge zones over folders so their centers can
      // still accept contents. Other points may snap anywhere in the row.
      hitZonePx: folderTarget ? undefined : bookmarkGrid.getBoundingClientRect().width,
      layoutItems: getBookmarkReorderCards()
        .map((card) => ({
          card,
          rect: getBookmarkCardLayoutRect(card)
        }))
        .filter((item) => item.rect && item.rect.width > 0 && item.rect.height > 0),
      markerVerticalInsetPx: isBookmarkTopbarMode() ? 3 : 8,
      pageStartIndex: getBookmarkPageStartIndex(),
      pointerX: surfacePoint.x,
      pointerY: surfacePoint.y
    });
    if (insertionTarget) {
      return resolveExternalBookmarkDropTarget(state, insertionTarget);
    }
    return folderTarget ? resolveExternalBookmarkDropTarget(state, folderTarget) : null;
  }

  function isPointOverShortcutDropSurface(pointerX, pointerY) {
    return Boolean(
      shortcutGrid &&
      isContentSectionVisible(shortcutSection) &&
      !isBookmarkCascadeSurfaceAtPoint(pointerX, pointerY) &&
      NEWTAB_BOOKMARK_DRAG.isPointInsideElement(shortcutGrid, pointerX, pointerY)
    );
  }

  function getBookmarkDragShortcutDropTarget(state, pointerX, pointerY) {
    if (!state) {
      return null;
    }
    const node = bookmarksRuntime.getNodeMap().get(String(state.bookmarkId || ''));
    const record = node
      ? NEWTAB_SHORTCUTS_STORE.createShortcutRecord(
        state.isFolder
          ? { type: 'folder', folderId: node.id, title: node.title }
          : { title: node.title, url: node.url },
        getShortcutStoreOptions()
      )
      : null;
    const slot = getShortcutInsertionSlotAt(pointerX, pointerY, null);
    const canMove = Boolean(NEWTAB_CROSS_SURFACE_DRAG.planBookmarkToShortcut({
      shortcuts: newtabShortcuts,
      record,
      index: slot.index,
      getFolderId: getShortcutFolderId,
      maxShortcuts: MAX_NEWTAB_SHORTCUTS
    }));
    const anchorRect = slot.anchorRect || getShortcutTileLayoutRect(addShortcutButton);
    if (!canMove || !anchorRect || anchorRect.width <= 0) {
      document.body.setAttribute('data-drag-blocked', 'true');
      return null;
    }
    const gridRect = shortcutGrid.getBoundingClientRect();
    const columnGap = Number.parseFloat(window.getComputedStyle(shortcutGrid).columnGap) || 0;
    const markerX = slot.markerPosition === 'after'
      ? anchorRect.right + (columnGap / 2)
      : anchorRect.left - (columnGap / 2);
    const markerVerticalInsetPx = 8;
    return {
      kind: 'insertion',
      surface: 'shortcuts',
      index: slot.index < getShortcutReorderTiles().length
        ? newtabShortcuts.findIndex((item) => item.id === getShortcutTileId(getShortcutReorderTiles()[slot.index]))
        : newtabShortcuts.length,
      record,
      element: null,
      markerElement: shortcutGrid,
      markerPosition: slot.markerPosition,
      markerOffsetPx: markerX - gridRect.left,
      markerTopPx: anchorRect.top - gridRect.top + markerVerticalInsetPx,
      markerHeightPx: anchorRect.height - (markerVerticalInsetPx * 2)
    };
  }

  function moveBookmarkToShortcuts(state, target) {
    if (bookmarkMoveHistoryBusy) return Promise.resolve(false);
    const node = bookmarksRuntime.getNode(state.bookmarkId);
    if (!node) return Promise.resolve(false);
    const plan = NEWTAB_CROSS_SURFACE_DRAG.planBookmarkToShortcut({
      shortcuts: newtabShortcuts,
      record: target.record,
      index: target.index,
      getFolderId: getShortcutFolderId,
      maxShortcuts: MAX_NEWTAB_SHORTCUTS
    });
    if (!plan) {
      return Promise.resolve(false);
    }
    const existingIndex = newtabShortcuts.findIndex((item) => item.id === plan.shortcutId);
    const beforeShortcut = existingIndex >= 0 ? {
      snapshot: newtabShortcuts[existingIndex],
      index: existingIndex,
      iconDataUrl: newtabShortcutIcons[plan.shortcutId]
    } : null;
    if (target.record.type === 'folder') {
      const index = plan.shortcuts.findIndex((item) => item.id === plan.shortcutId);
      const original = plan.shortcuts[index];
      const folderId = String(target.record.folderId || getShortcutFolderId(original));
      const folderRef = FOLDER_REFERENCES.describe(folderId, bookmarksRuntime.getNodeMap());
      if (!folderRef) return Promise.resolve(false);
      const id = original.folderRef ? original.id : FOLDER_REFERENCES.createEntryId();
      const { folderId: _localId, ...entry } = original;
      plan.shortcuts[index] = { ...entry, id, folderRef };
      plan.shortcutId = id;
    }
    const afterIndex = plan.shortcuts.findIndex((item) => item.id === plan.shortcutId);
    const isFolder = target.record.type === 'folder';
    const from = { parentId: node.parentId, index: node.index };
    const record = NEWTAB_BOOKMARK_MOVE_HISTORY.createTransferRecord({
      bookmarkId: node.id,
      snapshot: { title: node.title, url: node.url },
      from,
      to: isFolder ? from : null,
      beforeShortcut,
      afterShortcut: {
        snapshot: plan.shortcuts[afterIndex],
        index: afterIndex,
        iconDataUrl: beforeShortcut && beforeShortcut.iconDataUrl
      }
    });
    if (!record) return Promise.resolve(false);
    bookmarkMoveHistoryBusy = true;
    queueBookmarkLayoutAnimation(state.bookmarkId);
    return applyBookmarkShortcutTransfer(record, false).then((saved) => {
      if (!saved) return false;
      bookmarkMoveHistory.push(record);
      if (isFolder) {
        showToast(t('newtab_shortcuts_folder_added', 'Folder added to shortcuts'));
      }
      return true;
    }).finally(() => {
      bookmarkMoveHistoryBusy = false;
      if (newtabShortcuts.some((item) => item.type === 'folder')) return refreshShortcutFolderReferences();
    });
  }

  async function applyBookmarkShortcutTransfer(record, isUndo) {
    const from = isUndo ? record.to : record.from;
    const to = isUndo ? record.from : record.to;
    const sourceShortcut = isUndo ? record.afterShortcut : record.beforeShortcut;
    const destinationShortcut = isUndo ? record.beforeShortcut : record.afterShortcut;
    const planShortcuts = (source, destination) => NEWTAB_CROSS_SURFACE_DRAG.planTransferShortcuts({
      shortcuts: newtabShortcuts, source, destination, maxShortcuts: MAX_NEWTAB_SHORTCUTS
    });
    const persistShortcutState = async (items, destination) => {
      if (destination && destination.snapshot.type === 'folder') {
        shortcutFolderRuntime.bind(destination.snapshot.id, record.bookmarkId);
        await shortcutFolderRuntime.flush();
      }
      const iconChange = destination && destination.iconDataUrl
        ? { shortcutId: destination.snapshot.id, action: 'replace', dataUrl: destination.iconDataUrl }
        : undefined;
      return persistShortcuts(items, '', iconChange, {
        syncOverflowShortcutId: destination && destination.snapshot.id
      });
    };
    let rollbackBookmark = null;
    let shortcutsSaved = false;
    const keepCascadeOpen = Boolean(bookmarkCascadeRuntime && bookmarkCascadeRuntime.isOpen());
    try {
      if (!planShortcuts(sourceShortcut, destinationShortcut)) {
        throw new Error('Shortcut transfer conflicts with the current shortcuts.');
      }
      return await bookmarksRuntime.runControlledMutation(async () => {
        await bookmarksRuntime.ensureReady(false);
        const bookmarkId = bookmarkMoveHistory.resolveBookmarkId(record.bookmarkId || record.runtime.currentBookmarkId);
        const node = from ? bookmarksRuntime.getNode(bookmarkId) : null;
        if (from && (!node || Boolean(node.url) !== Boolean(record.snapshot.url))) {
          throw new Error('The transferred bookmark is unavailable.');
        }
        let movedNode = node;
        if (to && !from) {
          movedNode = await bookmarksRuntime.create({
            parentId: to.parentId, index: to.index,
            title: record.snapshot.title, url: record.snapshot.url
          });
          if (!movedNode || !movedNode.id) throw new Error('The restored bookmark id is unavailable.');
          rollbackBookmark = () => bookmarksRuntime.remove(movedNode.id);
        } else if (to && (from.parentId !== to.parentId || from.index !== to.index)) {
          const originalLocation = { parentId: String(node.parentId), index: Number(node.index) || 0 };
          movedNode = await bookmarksRuntime.move(bookmarkId, {
            parentId: to.parentId,
            index: NEWTAB_BOOKMARK_MOVE_HISTORY.getMoveApiDestinationIndex({
              sourceParentId: node.parentId, sourceIndex: node.index,
              targetParentId: to.parentId, targetIndex: to.index
            })
          });
          rollbackBookmark = () => bookmarksRuntime.move(bookmarkId, {
            parentId: originalLocation.parentId,
            index: NEWTAB_BOOKMARK_MOVE_HISTORY.getMoveApiDestinationIndex({
              sourceParentId: movedNode.parentId, sourceIndex: movedNode.index,
              targetParentId: originalLocation.parentId, targetIndex: originalLocation.index
            })
          });
        }
        const nextShortcuts = planShortcuts(sourceShortcut, destinationShortcut);
        if (!nextShortcuts) throw new Error('Shortcuts changed during the transfer.');
        if (!await persistShortcutState(nextShortcuts, destinationShortcut)) {
          if (rollbackBookmark) {
            await rollbackBookmark();
            rollbackBookmark = null;
          }
          return false;
        }
        shortcutsSaved = true;
        // Save the destination before removing the source. Folder aliases keep
        // the original tree, including every nested bookmark id.
        if (!to) await bookmarksRuntime.remove(bookmarkId);
        if (movedNode && to) {
          bookmarkMoveHistory.remapBookmarkId(record.bookmarkId, movedNode.id);
          record.runtime.currentBookmarkId = String(movedNode.id);
          record.runtime.location = { parentId: String(movedNode.parentId), index: Number(movedNode.index) || 0 };
        }
        return true;
      });
    } catch (error) {
      // Keep failures out of history and restore any completed destination write.
      try {
        await bookmarksRuntime.runControlledMutation(async () => {
          if (rollbackBookmark) await rollbackBookmark();
          if (shortcutsSaved) {
            const originalShortcuts = planShortcuts(destinationShortcut, sourceShortcut);
            if (!originalShortcuts || !await persistShortcutState(originalShortcuts, sourceShortcut)) {
              throw new Error('Could not roll back shortcut transfer.');
            }
          }
        });
      } catch (rollbackError) {
        console.warn('[Lumno] Failed to roll back bookmark shortcut transfer', rollbackError);
      }
      bookmarkPendingLayoutAnimation = null;
      console.warn('[Lumno] Failed to transfer bookmark and shortcut', error);
      showToast(t('bookmarks_move_failed', 'Could not move bookmark'), true);
      return false;
    } finally {
      markBookmarkTreeDirty({ preserveCascadeOpen: keepCascadeOpen });
      loadBookmarks({ force: true });
      if (keepCascadeOpen) refreshOpenBookmarkCascadeMenu();
    }
  }

  function isInsertLineDropTarget(target) {
    return Boolean(
      target &&
      target.kind === 'insertion' &&
      (target.surface === 'grid' || target.surface === 'shortcuts')
    );
  }

  function clearDropTargetMarker(marker) {
    marker.removeAttribute('data-bookmark-insert-position');
    marker.removeAttribute('data-insert-line-position');
    marker.style.removeProperty('--x-nt-insert-line-left');
    marker.style.removeProperty('--x-nt-insert-line-top');
    marker.style.removeProperty('--x-nt-insert-line-height');
    marker.removeAttribute('data-insert-line-motion');
  }

  function clearDragDropTarget(state) {
    if (!state) {
      return;
    }
    if (state.dropTarget && state.dropTarget.element) {
      state.dropTarget.element.removeAttribute('data-bookmark-drop-target');
    }
    if (state.dropTarget && state.dropTarget.markerElement) {
      clearDropTargetMarker(state.dropTarget.markerElement);
    }
    if (bookmarkCascadeRuntime && typeof bookmarkCascadeRuntime.clearDragTarget === 'function') {
      bookmarkCascadeRuntime.clearDragTarget();
    }
    state.dropTarget = null;
  }

  function restoreBookmarkDragPreview(state) {
    if (!state || !state.hasReordered || !Array.isArray(state.originalAllItems)) {
      return;
    }
    bookmarkAllItems = state.originalAllItems.slice();
    const cardsById = new Map(getBookmarkReorderCards().map((card) => [getBookmarkCardId(card), card]));
    (state.originalPageCardIds || []).forEach((bookmarkId) => {
      const card = cardsById.get(bookmarkId);
      if (card && card.parentNode === bookmarkGrid) {
        bookmarkGrid.appendChild(card);
      }
    });
    state.pageIndex = state.originalPageIndex;
    state.hasReordered = false;
    updateBookmarkDragLayoutCache(state);
  }

  function isValidBookmarkFolderDropTarget(state, target) {
    return Boolean(
      state &&
      target &&
      NEWTAB_BOOKMARK_MOVE_HISTORY.canMoveBookmarkToFolder({
        bookmarkId: state.bookmarkId,
        sourceParentId: state.parentId,
        targetFolderId: target.folderId,
        nodeMap: bookmarksRuntime.getNodeMap()
      })
    );
  }

  function isValidBookmarkInsertionDropTarget(state, target) {
    return Boolean(
      state &&
      target &&
      target.kind === 'insertion' &&
      NEWTAB_BOOKMARK_MOVE_HISTORY.canMoveBookmarkToLocation({
        bookmarkId: state.bookmarkId,
        sourceParentId: state.parentId,
        sourceIndex: state.originalIndex,
        targetParentId: target.folderId,
        targetIndex: target.index,
        nodeMap: bookmarksRuntime.getNodeMap()
      })
    );
  }

  function getBookmarkElementDropTarget(pointerX, pointerY) {
    if (!document || typeof document.elementFromPoint !== 'function') {
      return null;
    }
    const element = document.elementFromPoint(pointerX, pointerY);
    if (!element || typeof element.closest !== 'function') {
      return null;
    }
    const breadcrumbTarget = element.closest('[data-bookmark-drop-folder-id]');
    if (breadcrumbTarget && !breadcrumbTarget.classList.contains('x-nt-bookmark-card')) {
      return {
        folderId: breadcrumbTarget.getAttribute('data-bookmark-drop-folder-id') || '',
        title: breadcrumbTarget.getAttribute('data-bookmark-drop-folder-title') || '',
        element: breadcrumbTarget,
        kind: breadcrumbTarget.classList.contains('x-nt-shortcut-tile') ? 'shortcut-folder' : 'breadcrumb'
      };
    }
    const folderCard = element.closest('.x-nt-bookmark-card--folder[data-bookmark-id]');
    if (!folderCard) {
      return null;
    }
    const item = folderCard._xBookmarkItem || null;
    return {
      folderId: getBookmarkCardId(folderCard),
      title: String((item && item.title) || folderCard._xTitleText || ''),
      element: folderCard,
      kind: 'card'
    };
  }

  function isBookmarkCascadeSurfaceAtPoint(pointerX, pointerY) {
    if (!document || typeof document.elementFromPoint !== 'function') {
      return false;
    }
    const element = document.elementFromPoint(pointerX, pointerY);
    return Boolean(
      element &&
      typeof element.closest === 'function' &&
      element.closest('.x-nt-bookmark-cascade-menu')
    );
  }

  function getBookmarkCrossLevelDropTarget(state, pointerX, pointerY) {
    let target = null;
    let cascadeBlocked = false;
    if (bookmarkCascadeRuntime && typeof bookmarkCascadeRuntime.updateDragPointer === 'function') {
      target = bookmarkCascadeRuntime.updateDragPointer({
        clientX: pointerX,
        clientY: pointerY
      });
    }
    if (target && target.kind === 'blocked') {
      cascadeBlocked = true;
    } else if (target) {
      const isValidCascadeTarget = target.kind === 'insertion'
        ? isValidBookmarkInsertionDropTarget(state, target)
        : isValidBookmarkFolderDropTarget(state, target);
      if (!isValidCascadeTarget) {
        if (bookmarkCascadeRuntime && typeof bookmarkCascadeRuntime.clearDragTarget === 'function') {
          bookmarkCascadeRuntime.clearDragTarget();
        }
        return null;
      }
      return target;
    }

    target = getBookmarkElementDropTarget(pointerX, pointerY);
    if (cascadeBlocked && isBookmarkCascadeSurfaceAtPoint(pointerX, pointerY)) {
      return null;
    }

    const insertionTarget = getBookmarkGridInsertionDropTarget(state, pointerX, pointerY);
    if (insertionTarget) {
      return isValidBookmarkInsertionDropTarget(state, insertionTarget)
        ? insertionTarget
        : null;
    }
    if (!target) {
      return null;
    }
    if (!isValidBookmarkFolderDropTarget(state, target)) {
      if (target.element) {
        target.element.removeAttribute('data-bookmark-drop-target');
      }
      return null;
    }
    return target;
  }

  function setDragDropTarget(state, target) {
    const previousTarget = state && state.dropTarget ? state.dropTarget : null;
    const previousElement = previousTarget ? previousTarget.element : null;
    const previousMarker = previousTarget ? previousTarget.markerElement : null;
    // An insertion anchor locates the line; it is not a highlighted folder target.
    const nextElement = target && target.kind !== 'insertion' ? target.element : null;
    const nextMarker = target ? target.markerElement : null;
    const isNextInsertLine = isInsertLineDropTarget(target);
    const nextMarkerAttribute = isNextInsertLine
      ? 'data-insert-line-position'
      : 'data-bookmark-insert-position';
    const previousInsertMotion = previousMarker
      ? previousMarker.getAttribute('data-insert-line-motion')
      : null;
    const isNewInsertLineTarget = Boolean(
      isNextInsertLine &&
      (
        !isInsertLineDropTarget(previousTarget) ||
        previousTarget.surface !== target.surface ||
        previousTarget.markerElement !== nextMarker ||
        previousTarget.markerPosition !== target.markerPosition ||
        Number(previousTarget.markerOffsetPx) !== Number(target.markerOffsetPx)
      )
    );
    if (previousElement && previousElement !== nextElement) {
      previousElement.removeAttribute('data-bookmark-drop-target');
    }
    if (previousMarker &&
        (previousMarker !== nextMarker ||
          previousMarker.getAttribute(nextMarkerAttribute) !==
            String((target && target.markerPosition) || ''))) {
      clearDropTargetMarker(previousMarker);
    }
    if (!state) {
      return;
    }
    state.dropTarget = target || null;
    if (nextElement) {
      nextElement.setAttribute('data-bookmark-drop-target', 'true');
    }
    if (!nextMarker || target.kind !== 'insertion') {
      return;
    }
    nextMarker.setAttribute(nextMarkerAttribute, target.markerPosition);
    if (!isNextInsertLine) {
      return;
    }
    nextMarker.style.setProperty(
      '--x-nt-insert-line-left',
      `${Number(target.markerOffsetPx) || 0}px`
    );
    nextMarker.style.setProperty(
      '--x-nt-insert-line-top',
      `${Number(target.markerTopPx) || 0}px`
    );
    nextMarker.style.setProperty(
      '--x-nt-insert-line-height',
      `${Math.max(2, Number(target.markerHeightPx) || 0)}px`
    );
    if (isNewInsertLineTarget) {
      nextMarker.setAttribute(
        'data-insert-line-motion',
        previousInsertMotion === 'a' ? 'b' : 'a'
      );
    }
  }

  function getBookmarkDragPageSwitchDirection(pointerX, pointerY) {
    if (bookmarkCurrentPage > 0 &&
        bookmarkPagerPrevButton &&
        bookmarkPagerPrevButton.getAttribute('aria-disabled') !== 'true' &&
        isPointInsideBookmarkElement(bookmarkPagerPrevButton, pointerX, pointerY)) {
      return -1;
    }
    const pageCount = getBookmarkPageCount();
    if (bookmarkCurrentPage < (pageCount - 1) &&
        bookmarkPagerNextButton &&
        bookmarkPagerNextButton.getAttribute('aria-disabled') !== 'true' &&
        isPointInsideBookmarkElement(bookmarkPagerNextButton, pointerX, pointerY)) {
      return 1;
    }
    return 0;
  }

  function clearBookmarkDragPageSwitch(state) {
    if (!state) {
      return;
    }
    if (state.pageSwitchTimerId) {
      window.clearTimeout(state.pageSwitchTimerId);
      state.pageSwitchTimerId = 0;
    }
    if (state.pageSwitchButton) {
      state.pageSwitchButton.removeAttribute('data-bookmark-drag-page-target');
    }
    state.pageSwitchButton = null;
    state.pageSwitchDirection = 0;
  }

  function clearBookmarkDragFolderSwitch(state) {
    if (!state) {
      return;
    }
    if (state.folderSwitchTimerId) {
      window.clearTimeout(state.folderSwitchTimerId);
      state.folderSwitchTimerId = 0;
    }
    if (state.folderSwitchElement) {
      state.folderSwitchElement.removeAttribute(
        'data-bookmark-drag-folder-target'
      );
    }
    state.folderSwitchElement = null;
    state.folderSwitchTargetId = '';
  }

  function scheduleBookmarkDragFolderSwitch(state, dropTarget) {
    const getSwitchTarget = (target) => target && (target.kind === 'card' || target.kind === 'shortcut-folder')
      ? { folderId: String(target.folderId), element: target.element }
      : NEWTAB_BOOKMARK_DRAG.getFolderSwitchTarget(bookmarkCurrentFolderId, target);
    const switchTarget = getSwitchTarget(dropTarget);
    if (!state || !switchTarget || !isBookmarkSurfaceDragStateActive(state) ||
        !state.isDragging) {
      clearBookmarkDragFolderSwitch(state);
      return false;
    }
    if (state.folderSwitchTargetId !== switchTarget.folderId ||
        state.folderSwitchElement !== switchTarget.element) {
      clearBookmarkDragFolderSwitch(state);
      state.folderSwitchTargetId = switchTarget.folderId;
      state.folderSwitchElement = switchTarget.element;
      if (state.folderSwitchElement) {
        state.folderSwitchElement.setAttribute(
          'data-bookmark-drag-folder-target',
          'true'
        );
      }
    }
    if (state.folderSwitchTimerId) {
      return true;
    }
    state.folderSwitchTimerId = window.setTimeout(() => {
      state.folderSwitchTimerId = 0;
      if (!isBookmarkSurfaceDragStateActive(state) || !state.isDragging) {
        clearBookmarkDragFolderSwitch(state);
        return;
      }
      const activeTarget = getSwitchTarget(state.dropTarget);
      if (!activeTarget ||
          activeTarget.folderId !== state.folderSwitchTargetId) {
        clearBookmarkDragFolderSwitch(state);
        return;
      }
      const targetFolderId = activeTarget.folderId;
      clearBookmarkDragFolderSwitch(state);
      if (state.dropTarget.kind === 'shortcut-folder' ||
          (state.dropTarget.kind === 'card' && (isBookmarkTopbarMode() || currentBookmarkViewMode === 'list'))) {
        openBookmarkCascadeMenu({ id: targetFolderId, title: state.dropTarget.title, type: 'folder' },
          activeTarget.element, { dragMode: true, shouldOpen: () => isBookmarkSurfaceDragStateActive(state) });
        return;
      }
      clearDragDropTarget(state);
      if (state === bookmarkDragState) {
        restoreBookmarkDragPreview(state);
        setBookmarkDragCardTransform(state, Number(state.pendingPointerX), Number(state.pendingPointerY));
      }
      state.folderSwitchPendingId = targetFolderId;
      navigateBookmarkFolder(targetFolderId);
    }, BOOKMARK_DRAG_FOLDER_SWITCH_DELAY_MS);
    return true;
  }

  function scheduleBookmarkDragPageSwitch(state, direction) {
    const normalizedDirection = direction < 0 ? -1 : direction > 0 ? 1 : 0;
    if (!state || !normalizedDirection || !isBookmarkSurfaceDragStateActive(state) || !state.isDragging) {
      clearBookmarkDragPageSwitch(state);
      return;
    }
    const button = normalizedDirection < 0
      ? bookmarkPagerPrevButton
      : bookmarkPagerNextButton;
    if (!button) {
      clearBookmarkDragPageSwitch(state);
      return;
    }
    if (state.pageSwitchDirection !== normalizedDirection ||
        state.pageSwitchButton !== button) {
      clearBookmarkDragPageSwitch(state);
      state.pageSwitchDirection = normalizedDirection;
      state.pageSwitchButton = button;
      button.setAttribute('data-bookmark-drag-page-target', 'true');
    }
    if (state.pageSwitchTimerId) {
      return;
    }
    state.pageSwitchTimerId = window.setTimeout(() => {
      state.pageSwitchTimerId = 0;
      if (!isBookmarkSurfaceDragStateActive(state) || !state.isDragging) {
        clearBookmarkDragPageSwitch(state);
        return;
      }
      const pointerX = Number(state.pendingPointerX);
      const pointerY = Number(state.pendingPointerY);
      if (getBookmarkDragPageSwitchDirection(pointerX, pointerY) !== normalizedDirection) {
        clearBookmarkDragPageSwitch(state);
        return;
      }
      clearDragDropTarget(state);
      clearBookmarkDragFolderSwitch(state);
      if (state === bookmarkDragState) {
        restoreBookmarkDragPreview(state);
      }
      if (!switchBookmarkPageDuringDrag(bookmarkCurrentPage + normalizedDirection)) {
        clearBookmarkDragPageSwitch(state);
        return;
      }
      if (state === bookmarkDragState) {
        updateBookmarkDragLayoutCache(state);
        setBookmarkDragCardTransform(state, pointerX, pointerY);
      } else {
        setShortcutDragTileTransform(state, pointerX, pointerY);
      }
      const nextDirection = getBookmarkDragPageSwitchDirection(pointerX, pointerY);
      if (nextDirection === normalizedDirection) {
        scheduleBookmarkDragPageSwitch(state, normalizedDirection);
      } else {
        clearBookmarkDragPageSwitch(state);
      }
    }, BOOKMARK_DRAG_PAGE_SWITCH_DELAY_MS);
  }

  function processBookmarkDragMove(state) {
    if (!state || bookmarkDragState !== state || !state.isDragging) {
      return;
    }
    state.moveFrameId = 0;
    document.body.removeAttribute('data-drag-blocked');
    const pointerX = Number(state.pendingPointerX);
    const pointerY = Number(state.pendingPointerY);
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
      return;
    }
    if (state.folderSwitchPendingId) {
      clearBookmarkDragPageSwitch(state);
      clearDragDropTarget(state);
      setBookmarkDragCardTransform(state, pointerX, pointerY);
      return;
    }
    const topbarScrollDelta = bookmarkTopbarRuntime &&
      bookmarkTopbarRuntime.isActive() &&
      bookmarkTopbarRuntime.isVisible()
      ? bookmarkTopbarRuntime.autoScroll(pointerX, pointerY)
      : 0;
    if (topbarScrollDelta) {
      updateBookmarkDragLayoutCache(state);
      scheduleBookmarkDragMove(state, pointerX, pointerY);
    }
    setBookmarkDragCardTransform(state, pointerX, pointerY);
    const pageSwitchDirection = getBookmarkDragPageSwitchDirection(pointerX, pointerY);
    if (pageSwitchDirection) {
      clearBookmarkDragFolderSwitch(state);
      clearDragDropTarget(state);
      restoreBookmarkDragPreview(state);
      setBookmarkDragCardTransform(state, pointerX, pointerY);
      scheduleBookmarkDragPageSwitch(state, pageSwitchDirection);
      return;
    }
    clearBookmarkDragPageSwitch(state);
    if (isPointOverShortcutDropSurface(pointerX, pointerY)) {
      clearBookmarkDragFolderSwitch(state);
      restoreBookmarkDragPreview(state);
      setBookmarkDragCardTransform(state, pointerX, pointerY);
      const folderTarget = getShortcutFolderDropTargetAt(state, pointerX, pointerY);
      if (folderTarget && folderTarget.kind === 'blocked') {
        document.body.setAttribute('data-drag-blocked', 'true');
        clearDragDropTarget(state);
        return;
      }
      const shortcutTarget = folderTarget || getBookmarkDragShortcutDropTarget(state, pointerX, pointerY);
      if (shortcutTarget) {
        setDragDropTarget(state, shortcutTarget);
        if (folderTarget) {
          scheduleBookmarkDragFolderSwitch(state, folderTarget);
        }
      } else {
        clearDragDropTarget(state);
      }
      return;
    }
    const crossLevelTarget = getBookmarkCrossLevelDropTarget(state, pointerX, pointerY);
    if (crossLevelTarget) {
      scheduleBookmarkDragFolderSwitch(state, crossLevelTarget);
      restoreBookmarkDragPreview(state);
      setBookmarkDragCardTransform(state, pointerX, pointerY);
      setDragDropTarget(state, crossLevelTarget);
      return;
    }
    clearBookmarkDragFolderSwitch(state);
    clearDragDropTarget(state);
    restoreBookmarkDragPreview(state);
    setBookmarkDragCardTransform(state, pointerX, pointerY);
  }

  function scheduleBookmarkDragMove(state, pointerX, pointerY) {
    if (!state || !state.isDragging) {
      return;
    }
    state.pendingPointerX = pointerX;
    state.pendingPointerY = pointerY;
    if (state.moveFrameId) {
      return;
    }
    state.moveFrameId = window.requestAnimationFrame(() => {
      processBookmarkDragMove(state);
    });
  }

  function moveBookmarkCardElement(card, targetIndex) {
    if (!bookmarkGrid || !card || card.parentNode !== bookmarkGrid ||
        !Number.isFinite(targetIndex)) {
      return false;
    }
    const currentIndex = getBookmarkCardInsertionIndex(card);
    const remainingCards = getBookmarkReorderCards().filter((item) => item !== card);
    const boundedIndex = Math.max(0, Math.min(remainingCards.length, targetIndex));
    if (currentIndex === boundedIndex) {
      return false;
    }
    bookmarkGrid.insertBefore(card, remainingCards[boundedIndex] || null);
    return true;
  }

  function moveBookmarkItemInMemory(bookmarkId, targetAllIndex) {
    const currentIndex = getBookmarkCardAllIndex(bookmarkId);
    if (currentIndex < 0 || !Number.isFinite(targetAllIndex)) {
      return false;
    }
    const nextItems = bookmarkAllItems.slice();
    const movedItem = nextItems.splice(currentIndex, 1)[0];
    const boundedIndex = Math.max(0, Math.min(nextItems.length, targetAllIndex));
    if (currentIndex === boundedIndex) {
      return false;
    }
    nextItems.splice(boundedIndex, 0, movedItem);
    bookmarkAllItems = nextItems;
    return true;
  }

  function getBookmarkMoveDestination(bookmarkId) {
    const movedIndex = getBookmarkCardAllIndex(bookmarkId);
    if (movedIndex < 0) {
      return null;
    }
    const movedItem = bookmarkAllItems[movedIndex];
    const parentId = String((movedItem && movedItem.parentId) || bookmarkCurrentFolderId || '');
    if (!parentId) {
      return null;
    }
    const afterItem = bookmarkAllItems.slice(movedIndex + 1).find((item) =>
      item && String(item.parentId || parentId) === parentId && Number.isFinite(Number(item.index))
    );
    let destinationIndex = 0;
    if (afterItem) {
      destinationIndex = Number(afterItem.index);
    } else {
      const beforeItems = bookmarkAllItems.slice(0, movedIndex).reverse();
      const beforeItem = beforeItems.find((item) =>
        item && String(item.parentId || parentId) === parentId && Number.isFinite(Number(item.index))
      );
      destinationIndex = beforeItem ? Number(beforeItem.index) + 1 : 0;
    }
    return {
      parentId,
      index: Math.max(0, Math.round(destinationIndex))
    };
  }

  function getBookmarkDeleteRecord(target) {
    if (!target || !target.bookmarkId) {
      return null;
    }
    const node = bookmarksRuntime.getNode(target.bookmarkId);
    if (!node) {
      return null;
    }
    return NEWTAB_BOOKMARK_MOVE_HISTORY.createDeleteRecord({
      bookmarkId: String(node.id || target.bookmarkId),
      title: String(node.title || target.title || ''),
      parentId: String(node.parentId || target.parentId || ''),
      index: Number.isFinite(Number(node.index)) ? Number(node.index) : target.index,
      snapshot: node
    });
  }

  function deleteBookmarkFromContextTarget(target) {
    if (!target || !target.bookmarkId || bookmarkMoveHistoryBusy) {
      return false;
    }
    bookmarkMoveHistoryBusy = true;
    const keepCascadeOpen = Boolean(
      target.sourceKind === 'cascade' &&
      bookmarkCascadeRuntime &&
      typeof bookmarkCascadeRuntime.isOpen === 'function' &&
      bookmarkCascadeRuntime.isOpen()
    );
    bookmarksRuntime.runControlledMutation(() => {
      return bookmarksRuntime.ensureReady(false).then(() => {
        const record = getBookmarkDeleteRecord(target);
        if (!record) {
          throw new Error('Bookmark snapshot is unavailable.');
        }
        queueBookmarkLayoutAnimation(record.bookmarkId);
        return bookmarksRuntime.remove(record.bookmarkId, {
          recursive: !record.snapshot.url
        }).then(() => {
          bookmarkMoveHistory.push(record);
          markBookmarkTreeDirty({ preserveCascadeOpen: keepCascadeOpen });
          loadBookmarks({ force: true });
          if (keepCascadeOpen) {
            refreshOpenBookmarkCascadeMenu();
          }
          return true;
        });
      });
    }).catch((error) => {
      bookmarkPendingLayoutAnimation = null;
      console.warn('[Lumno] Failed to delete bookmark', error);
      showToast(t('bookmarks_delete_failed', 'Could not delete bookmark'), true);
    }).finally(() => {
      bookmarkMoveHistoryBusy = false;
    });
    return true;
  }

  function getBookmarkMoveRecord(state, destination, movedNode) {
    if (!state || !destination) {
      return null;
    }
    return NEWTAB_BOOKMARK_MOVE_HISTORY.createMoveRecord({
      bookmarkId: state.bookmarkId,
      title: state.itemTitle,
      from: {
        parentId: state.parentId,
        index: state.originalIndex
      },
      to: {
        parentId: String((movedNode && movedNode.parentId) || destination.parentId || ''),
        index: Number.isFinite(Number(movedNode && movedNode.index))
          ? Number(movedNode.index)
          : destination.index
      }
    });
  }

  function getBookmarkUndoShortcutLabel() {
    const isMac = /Mac|iPhone|iPad|iPod/i.test(String(navigator.platform || navigator.userAgent || ''));
    return isMac ? '⌘Z' : 'Ctrl+Z';
  }

  function getBookmarkRedoShortcutLabel() {
    const isMac = /Mac|iPhone|iPad|iPod/i.test(String(navigator.platform || navigator.userAgent || ''));
    return isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z';
  }

  function refreshOpenBookmarkCascadeMenu(refreshOptions) {
    if (!bookmarkCascadeRuntime ||
        typeof bookmarkCascadeRuntime.isOpen !== 'function' ||
        !bookmarkCascadeRuntime.isOpen() ||
        typeof bookmarkCascadeRuntime.refresh !== 'function') {
      return Promise.resolve(false);
    }
    return Promise.resolve(bookmarkCascadeRuntime.refresh(refreshOptions)).catch((error) => {
      console.warn('[Lumno] Failed to refresh bookmark cascade after move', error);
      return false;
    });
  }

  function syncOpenBookmarkCascadeAnchorVisual() {
    if (!bookmarkCascadeRuntime ||
        typeof bookmarkCascadeRuntime.isOpen !== 'function' ||
        !bookmarkCascadeRuntime.isOpen() ||
        typeof bookmarkCascadeRuntime.getRootFolderId !== 'function' ||
        typeof bookmarkCascadeRuntime.rebindAnchor !== 'function') {
      return false;
    }
    const rootFolderId = String(bookmarkCascadeRuntime.getRootFolderId() || '');
    if (!rootFolderId) {
      return false;
    }
    const shortcutAnchor = getShortcutReorderTiles().find((tile) =>
      tile.getAttribute('data-bookmark-id') === rootFolderId
    );
    const currentShortcutAnchor = shortcutAnchor && shortcutAnchor.getAttribute('aria-expanded') === 'true';
    const nextAnchor = (currentShortcutAnchor && shortcutAnchor) || getBookmarkReorderCards().find((card) =>
      getBookmarkCardId(card) === rootFolderId
    ) || shortcutAnchor;
    return nextAnchor
      ? bookmarkCascadeRuntime.rebindAnchor(nextAnchor, { instant: true })
      : false;
  }

  function finishPersistedBookmarkMove(state, destination, movedNode) {
    const record = getBookmarkMoveRecord(state, destination, movedNode);
    if (record) {
      bookmarkMoveHistory.push(record);
    }
    const keepCascadeOpen = Boolean(state && state.keepCascadeOpenAfterDrop);
    markBookmarkTreeDirty({ preserveCascadeOpen: keepCascadeOpen });
    loadBookmarks({ force: true });
    if (keepCascadeOpen) {
      refreshOpenBookmarkCascadeMenu({
        draggedBookmarkId: String((state && state.bookmarkId) || ''),
        draggedRect: state && state.draggedVisualRect
      });
    }
    return true;
  }

  function persistBookmarkDragOrder(state) {
    if (!state || !state.bookmarkId) {
      return Promise.resolve(false);
    }
    const destination = getBookmarkMoveDestination(state.bookmarkId);
    if (!destination) {
      return Promise.resolve(false);
    }
    return bookmarksRuntime.runControlledMutation(() => {
      return bookmarksRuntime.move(state.bookmarkId, destination).then((movedNode) => {
        return finishPersistedBookmarkMove(state, destination, movedNode);
      });
    }).catch((error) => {
      console.warn('[Lumno] Failed to reorder bookmark', error);
      markBookmarkTreeDirty();
      loadBookmarks({ force: true });
      showToast(t('bookmarks_move_failed', 'Could not move bookmark'), true);
      return false;
    });
  }

  function persistBookmarkCrossLevelMove(state, target) {
    if (!state || !target || !target.folderId) {
      return Promise.resolve(false);
    }
    const targetFolderId = String(target.folderId);
    const targetItems = bookmarksRuntime.getFolderItems(targetFolderId);
    const rawTargetIndex = target.kind === 'insertion' && Number.isFinite(Number(target.index))
      ? Number(target.index)
      : targetItems.length;
    const shouldPreserveTargetPageSlot = target.kind === 'insertion' &&
      target.surface === 'grid' &&
      target.preservePageSlot === true &&
      String(state.parentId || '') === targetFolderId &&
      Number(state.originalIndex) < rawTargetIndex;
    const destinationIndex = shouldPreserveTargetPageSlot
      ? NEWTAB_BOOKMARK_MOVE_HISTORY.getMoveApiDestinationIndex({
        sourceParentId: state.parentId,
        sourceIndex: state.originalIndex,
        targetParentId: targetFolderId,
        targetIndex: rawTargetIndex
      })
      : rawTargetIndex;
    const destination = {
      parentId: targetFolderId,
      index: destinationIndex
    };
    return bookmarksRuntime.runControlledMutation(() => {
      return bookmarksRuntime.move(state.bookmarkId, destination).then((movedNode) => {
        return finishPersistedBookmarkMove(state, destination, movedNode);
      });
    }).catch((error) => {
      console.warn('[Lumno] Failed to move bookmark across folders', error);
      markBookmarkTreeDirty();
      loadBookmarks({ force: true });
      showToast(t('bookmarks_move_failed', 'Could not move bookmark'), true);
      return false;
    });
  }

  function performBookmarkMoveHistoryAction(direction) {
    if (bookmarkMoveHistoryBusy) {
      return false;
    }
    const isUndo = direction === 'undo';
    const record = isUndo ? bookmarkMoveHistory.peekUndo() : bookmarkMoveHistory.peekRedo();
    if (!record) {
      return false;
    }
    bookmarkMoveHistoryBusy = true;
    if (record.kind === 'shortcut-reorder') {
      const next = NEWTAB_CROSS_SURFACE_DRAG.planShortcutReorder({
        shortcuts: newtabShortcuts,
        sourceOrder: isUndo ? record.toOrder : record.fromOrder,
        order: isUndo ? record.fromOrder : record.toOrder
      });
      if (!next) {
        bookmarkMoveHistoryBusy = false;
        showToast(t('toast_error', 'Operation failed. Please try again.'), true);
        return true;
      }
      persistShortcuts(next, '').then((saved) => {
        if (!saved) return;
        if (isUndo) bookmarkMoveHistory.commitUndo();
        else bookmarkMoveHistory.commitRedo();
        scheduleWallpaperAdaptiveToneUpdate();
      }).finally(() => { bookmarkMoveHistoryBusy = false; });
      return true;
    }
    if (record.kind === 'transfer') {
      queueBookmarkLayoutAnimation('');
      applyBookmarkShortcutTransfer(record, isUndo).then((saved) => {
        if (!saved) return;
        if (isUndo) bookmarkMoveHistory.commitUndo();
        else bookmarkMoveHistory.commitRedo();
        if (!record.snapshot.url) {
          showToast(formatMessage(
            isUndo ? 'bookmarks_move_undone' : 'bookmarks_move_redone',
            isUndo ? 'Move undone · {shortcut} to redo' : 'Move restored · {shortcut} to undo',
            { shortcut: isUndo ? getBookmarkRedoShortcutLabel() : getBookmarkUndoShortcutLabel() }
          ));
        }
      }).finally(() => {
        bookmarkMoveHistoryBusy = false;
        if (newtabShortcuts.some((item) => item.type === 'folder')) return refreshShortcutFolderReferences();
      });
      return true;
    }
    if (record.kind === 'shortcut-delete') {
      const snapshot = record.snapshot;
      const exists = newtabShortcuts.some((item) => item.id === snapshot.id ||
        (snapshot.type === 'folder'
          ? !snapshot.folderRef && !item.folderRef && item.type === 'folder' && item.folderId === snapshot.folderId
          : item.url === snapshot.url));
      if (isUndo && (exists || newtabShortcuts.length >= MAX_NEWTAB_SHORTCUTS)) {
        bookmarkMoveHistoryBusy = false;
        showToast(t('toast_error', 'Operation failed. Please try again.'), true);
        return true;
      }
      const next = newtabShortcuts.slice();
      if (isUndo) {
        next.splice(Math.min(record.index, next.length), 0, snapshot);
      } else {
        const index = next.findIndex((item) => item.id === snapshot.id);
        if (index >= 0) next.splice(index, 1);
      }
      const iconChange = isUndo && record.iconDataUrl
        ? { shortcutId: snapshot.id, action: 'replace', dataUrl: record.iconDataUrl }
        : undefined;
      persistShortcuts(next, '', iconChange).then((saved) => {
        if (!saved) return;
        if (isUndo) bookmarkMoveHistory.commitUndo();
        else bookmarkMoveHistory.commitRedo();
        showToast(formatMessage(
          isUndo ? 'newtab_shortcuts_remove_undone' : 'newtab_shortcuts_remove_redone',
          isUndo ? 'Shortcut restored · {shortcut} to redo' : 'Shortcut removed · {shortcut} to undo',
          { shortcut: isUndo ? getBookmarkRedoShortcutLabel() : getBookmarkUndoShortcutLabel() }
        ));
      }).finally(() => { bookmarkMoveHistoryBusy = false; });
      return true;
    }
    const keepCascadeOpen = Boolean(
      bookmarkCascadeRuntime &&
      typeof bookmarkCascadeRuntime.isOpen === 'function' &&
      bookmarkCascadeRuntime.isOpen()
    );
    if (record.kind === 'delete') {
      queueBookmarkLayoutAnimation(
        isUndo
          ? ''
          : String((record.runtime && record.runtime.currentBookmarkId) || record.bookmarkId || '')
      );
      const deleteAction = bookmarksRuntime.runControlledMutation(() => {
        return isUndo
          ? bookmarksRuntime.restore(record.snapshot, {
            parentId: record.parentId,
            index: record.index
          }).then((node) => {
            bookmarkMoveHistory.remapBookmarkId(record.bookmarkId, node && node.id);
            if (record.runtime) {
              record.runtime.currentBookmarkId = String((node && node.id) || '');
            }
          })
          : bookmarksRuntime.remove(
            bookmarkMoveHistory.resolveBookmarkId(record.bookmarkId || (record.runtime && record.runtime.currentBookmarkId)),
            { recursive: !record.snapshot.url }
          ).then(() => {
            if (record.runtime) {
              record.runtime.currentBookmarkId = '';
            }
          });
      });
      deleteAction.then(() => {
        if (isUndo) {
          bookmarkMoveHistory.commitUndo();
          showToast(formatMessage(
            'bookmarks_delete_undone',
            'Deletion undone · {shortcut} to delete again',
            { shortcut: getBookmarkRedoShortcutLabel() }
          ));
        } else {
          bookmarkMoveHistory.commitRedo();
          showToast(formatMessage(
            'bookmarks_delete_redone',
            'Deletion restored · {shortcut} to undo',
            { shortcut: getBookmarkUndoShortcutLabel() }
          ));
        }
        markBookmarkTreeDirty({ preserveCascadeOpen: keepCascadeOpen });
        loadBookmarks({ force: true });
        if (keepCascadeOpen) {
          refreshOpenBookmarkCascadeMenu();
        }
      }).catch((error) => {
        bookmarkPendingLayoutAnimation = null;
        console.warn('[Lumno] Failed to restore bookmark deletion history', error);
        showToast(t('bookmarks_delete_failed', 'Could not delete bookmark'), true);
      }).finally(() => {
        bookmarkMoveHistoryBusy = false;
      });
      return true;
    }
    const source = isUndo ? record.to : record.from;
    const target = isUndo ? record.from : record.to;
    const destination = {
      parentId: target.parentId,
      index: NEWTAB_BOOKMARK_MOVE_HISTORY.getMoveApiDestinationIndex({
        sourceParentId: source.parentId,
        sourceIndex: source.index,
        targetParentId: target.parentId,
        targetIndex: target.index
      })
    };
    bookmarksRuntime.runControlledMutation(() => {
      return bookmarksRuntime.move(bookmarkMoveHistory.resolveBookmarkId(record.bookmarkId), destination);
    }).then(() => {
      if (isUndo) {
        bookmarkMoveHistory.commitUndo();
        showToast(formatMessage(
          'bookmarks_move_undone',
          'Move undone · {shortcut} to redo',
          { shortcut: getBookmarkRedoShortcutLabel() }
        ));
      } else {
        bookmarkMoveHistory.commitRedo();
        showToast(formatMessage(
          'bookmarks_move_redone',
          'Move restored · {shortcut} to undo',
          { shortcut: getBookmarkUndoShortcutLabel() }
        ));
      }
      markBookmarkTreeDirty({ preserveCascadeOpen: keepCascadeOpen });
      loadBookmarks({ force: true });
      if (keepCascadeOpen) {
        refreshOpenBookmarkCascadeMenu();
      }
    }).catch((error) => {
      bookmarkPendingLayoutAnimation = null;
      console.warn('[Lumno] Failed to restore bookmark move history', error);
      showToast(t('bookmarks_move_failed', 'Could not move bookmark'), true);
    }).finally(() => {
      bookmarkMoveHistoryBusy = false;
    });
    return true;
  }

  function isBookmarkDragActive() {
    return Boolean(
      (bookmarkDragState && bookmarkDragState.isDragging) ||
      (bookmarkGrid && bookmarkGrid.getAttribute('data-bookmark-dragging') === 'true')
    );
  }

  function isBookmarkReorderInteractionActive() {
    return Boolean(bookmarkDragState || isBookmarkDragActive());
  }

  function shouldSuppressBookmarkHover(target) {
    return Boolean(
      target &&
      (isBookmarkReorderInteractionActive() || isShortcutDragActive()) &&
      (
        (target.classList &&
          typeof target.classList.contains === 'function' &&
          target.classList.contains('x-nt-bookmark-card')) ||
        (typeof target.closest === 'function' &&
          target.closest('.x-nt-bookmark-card, .x-nt-bookmark-cascade-item'))
      )
    );
  }

  function startBookmarkDrag(event, card) {
    if (!bookmarkGrid || !card || !bookmarkDragState || bookmarkDragState.card !== card) {
      return;
    }
    bookmarkDragState.isDragging = true;
    if (document.body) {
      document.body.setAttribute('data-drag-source', 'bookmark');
    }
    hideCursorTooltip();
    const activeElement = document.activeElement;
    if (activeElement &&
        isEditableElement(activeElement) &&
        typeof activeElement.blur === 'function') {
      activeElement.blur();
    }
    if (bookmarkDragState.sourceKind === 'cascade') {
      if (bookmarkCascadeRuntime && typeof bookmarkCascadeRuntime.setDragMode === 'function') {
        bookmarkCascadeRuntime.setDragMode(true);
      }
    } else {
      closeBookmarkCascadeMenu();
    }
    if (bookmarkDragState.sourceKind !== 'cascade') {
      bookmarkGrid.setAttribute('data-bookmark-dragging', 'true');
    }
    card.setAttribute('data-bookmark-dragging', 'true');
    card.setAttribute('aria-grabbed', 'true');
    if (typeof card._xDeactivateBookmarkHoverVisual === 'function') {
      card._xDeactivateBookmarkHoverVisual();
    }
    card.style.pointerEvents = 'none';
    updateBookmarkDragLayoutCache(bookmarkDragState);
    createBookmarkCascadeDragPreview(bookmarkDragState);
    setBookmarkDragCardTransform(bookmarkDragState, Number(event.clientX), Number(event.clientY));
    if (typeof card.setPointerCapture === 'function') {
      try {
        card.setPointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture can fail if the browser already canceled the pointer.
      }
    }
  }

  function clearBookmarkDragCardVisual(card) {
    if (!card || !card.style) {
      return;
    }
    if (card._xBookmarkDropTimer) {
      window.clearTimeout(card._xBookmarkDropTimer);
      card._xBookmarkDropTimer = 0;
    }
    card.removeAttribute('data-bookmark-dragging');
    card.removeAttribute('data-bookmark-dropping');
    card.removeAttribute('aria-grabbed');
    card.style.removeProperty('transition');
    card.style.removeProperty('transform');
    card.style.removeProperty('will-change');
    card.style.pointerEvents = '';
  }

  function clearBookmarkDragSourceVisual(state) {
    if (!state) {
      return;
    }
    removeBookmarkCascadeDragPreview(state);
    clearBookmarkDragCardVisual(state.card);
  }

  function attachBookmarkDragDocumentListeners() {
    document.addEventListener('pointermove', handleBookmarkDragPointerMove, true);
    document.addEventListener('pointerup', handleBookmarkDragPointerUp, true);
    document.addEventListener('pointercancel', handleBookmarkDragPointerCancel, true);
    document.addEventListener('selectstart', handleBookmarkDragSelectStart, true);
  }

  function detachBookmarkDragDocumentListeners() {
    document.removeEventListener('pointermove', handleBookmarkDragPointerMove, true);
    document.removeEventListener('pointerup', handleBookmarkDragPointerUp, true);
    document.removeEventListener('pointercancel', handleBookmarkDragPointerCancel, true);
    document.removeEventListener('selectstart', handleBookmarkDragSelectStart, true);
  }

  function handleBookmarkDragSelectStart(event) {
    if (!bookmarkDragState || !event || typeof event.preventDefault !== 'function') {
      return;
    }
    event.preventDefault();
  }

  function finishBookmarkDrag(event, finishOptions) {
    if (!bookmarkDragState) {
      return;
    }
    if (event && bookmarkDragState.pointerId !== event.pointerId) {
      return;
    }
    if (document.body) {
      document.body.removeAttribute('data-drag-source');
      document.body.removeAttribute('data-drag-blocked');
    }
    const state = bookmarkDragState;
    detachBookmarkDragDocumentListeners();
    if (state.isDragging && state.moveFrameId) {
      cancelBookmarkDragMoveFrame(state);
      processBookmarkDragMove(state);
    }
    clearBookmarkDragPageSwitch(state);
    clearBookmarkDragFolderSwitch(state);
    const canceled = Boolean(finishOptions && finishOptions.canceled);
    const dropTarget = canceled ? null : state.dropTarget;
    state.draggedVisualRect = state.isDragging && dropTarget
      ? getBookmarkDragVisualRect(state)
      : null;
    clearDragDropTarget(state);
    const shouldKeepCascadeOpen =
      NEWTAB_BOOKMARK_DRAG.shouldKeepCascadeOpenAfterDrop(
        state.sourceKind,
        dropTarget
    );
    state.keepCascadeOpenAfterDrop = Boolean(dropTarget && shouldKeepCascadeOpen);
    if (state.isDragging) {
      if (shouldKeepCascadeOpen && bookmarkCascadeRuntime &&
          typeof bookmarkCascadeRuntime.setDragMode === 'function') {
        bookmarkCascadeRuntime.setDragMode(false);
      } else {
        closeBookmarkCascadeMenu();
      }
    }
    if (canceled) {
      restoreBookmarkDragPreview(state);
    }
    bookmarkDragState = null;
    document.body.removeAttribute('data-drag-blocked');
    state.folderSwitchPendingId = '';
    const card = state.card;
    if (bookmarkGrid) {
      bookmarkGrid.removeAttribute('data-bookmark-dragging');
    }
    if (card) {
      card.removeAttribute('aria-grabbed');
      if (typeof card.releasePointerCapture === 'function') {
        try {
          card.releasePointerCapture(state.pointerId);
        } catch (error) {
          // Ignore stale pointer capture releases.
        }
      }
      if (state.isDragging && dropTarget) {
        clearBookmarkDragSourceVisual(state);
      } else if (state.isDragging && state.sourceKind === 'cascade') {
        clearBookmarkDragSourceVisual(state);
      } else if (state.isDragging && state.dragPreviewElement) {
        clearBookmarkDragSourceVisual(state);
      } else if (state.isDragging) {
        settleBookmarkDragCard(card);
      } else {
        removeBookmarkCascadeDragPreview(state);
        card.removeAttribute('data-bookmark-dragging');
        card.removeAttribute('data-bookmark-dropping');
        card.style.pointerEvents = '';
      }
      if (state.isDragging) {
        card._xBookmarkSuppressClick = true;
        if (card._xBookmarkSuppressClickTimer) {
          window.clearTimeout(card._xBookmarkSuppressClickTimer);
        }
        if (event) {
          card._xBookmarkSuppressClickTimer = window.setTimeout(() => {
            card._xBookmarkSuppressClickTimer = 0;
            card._xBookmarkSuppressClick = false;
          }, BOOKMARK_DRAG_CLICK_SUPPRESS_MS);
        } else {
          card._xBookmarkSuppressClickTimer = 0;
          suppressCanceledDragClick(card, '_xBookmarkSuppressClick', state.pointerId);
        }
      }
    }
    if (state.isDragging && dropTarget && dropTarget.surface === 'shortcuts') {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      moveBookmarkToShortcuts(state, dropTarget);
    } else if (state.isDragging && dropTarget) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      queueBookmarkLayoutAnimation(state.bookmarkId, {
        draggedBookmarkId: state.bookmarkId,
        draggedRect: state.draggedVisualRect
      });
      persistBookmarkCrossLevelMove(state, dropTarget);
    } else if (!canceled && state.isDragging && state.hasReordered) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      queueBookmarkLayoutAnimation(state.bookmarkId, {
        draggedBookmarkId: state.bookmarkId,
        draggedRect: state.draggedVisualRect
      });
      persistBookmarkDragOrder(state);
    } else if (
      state.isDragging &&
      bookmarkGrid &&
      bookmarkGrid.getAttribute('data-bookmark-empty-drop-surface') ===
        'true'
    ) {
      renderCurrentBookmarkPage();
    }
  }

  function beginBookmarkDragPointerTracking(event, card, bookmarkItem, sourceKind) {
    if (!event || !card || bookmarkDragState || bookmarkMoveHistoryBusy) {
      return false;
    }
    const bookmarkId = getBookmarkCardId(card);
    const parentId = getBookmarkCardParentId(card);
    if (!card || !bookmarkId || !parentId ||
        card.getAttribute('data-bookmark-draggable') !== 'true' ||
        (event.pointerType === 'mouse' && event.button !== 0)) {
      return false;
    }
    hideCursorTooltip();
    closeBookmarkContextMenu();
    const isOpenCascadeAnchor = Boolean(
      sourceKind !== 'cascade' &&
      bookmarkCascadeRuntime &&
      typeof bookmarkCascadeRuntime.isOpen === 'function' &&
      bookmarkCascadeRuntime.isOpen() &&
      card.getAttribute('aria-expanded') === 'true'
    );
    if (sourceKind !== 'cascade' && !isOpenCascadeAnchor) {
      closeBookmarkCascadeMenu();
    }
    const pageIndex = sourceKind === 'cascade' ? -1 : getBookmarkCardInsertionIndex(card);
    bookmarkDragState = NEWTAB_BOOKMARK_DRAG.createSession({
      allItems: bookmarkAllItems,
      bookmarkItem,
      card,
      event,
      bookmarkId,
      parentId,
      pageIndex,
      pageCardIds: getBookmarkReorderCards().map(getBookmarkCardId),
      sourceKind
    });
    attachBookmarkDragDocumentListeners();
    const rect = sourceKind === 'cascade' && typeof card.getBoundingClientRect === 'function'
      ? card.getBoundingClientRect()
      : getBookmarkCardLayoutRect(card) ||
      (typeof card.getBoundingClientRect === 'function' ? card.getBoundingClientRect() : null);
    if (rect) {
      bookmarkDragState.grabOffsetX = Number(event.clientX) - rect.left;
      bookmarkDragState.grabOffsetY = Number(event.clientY) - rect.top;
      bookmarkDragState.baseLeft = rect.left;
      bookmarkDragState.baseTop = rect.top;
    }
    if (typeof card._xDeactivateBookmarkHoverVisual === 'function') {
      card._xDeactivateBookmarkHoverVisual();
    }
    return true;
  }

  function handleBookmarkDragPointerDown(event) {
    if (bookmarkPageAnimating || bookmarkDragState) {
      return;
    }
    if (event.target && typeof event.target.closest === 'function' &&
        event.target.closest('.x-nt-bookmark-copy-action')) {
      return;
    }
    const card = getBookmarkCardFromNode(event.target);
    beginBookmarkDragPointerTracking(event, card, card && card._xBookmarkItem, 'card');
  }

  function handleBookmarkCascadeItemPointerDown(payload) {
    const event = payload && payload.event;
    const element = payload && payload.element;
    const item = payload && payload.item;
    if (bookmarkPageAnimating || bookmarkDragState || !event || !element || !item) {
      return;
    }
    beginBookmarkDragPointerTracking(event, element, item, 'cascade');
  }

  function handleBookmarkDragPointerMove(event) {
    if (!bookmarkDragState || bookmarkDragState.pointerId !== event.pointerId) {
      return;
    }
    const pointerX = Number(event.clientX);
    const pointerY = Number(event.clientY);
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
      return;
    }
    const dx = pointerX - bookmarkDragState.startX;
    const dy = pointerY - bookmarkDragState.startY;
    if (!bookmarkDragState.isDragging &&
        Math.hypot(dx, dy) < BOOKMARK_DRAG_START_THRESHOLD_PX) {
      return;
    }
    if (!bookmarkDragState.isDragging) {
      startBookmarkDrag(event, bookmarkDragState.card);
    }
    if (!bookmarkDragState.isDragging) {
      return;
    }
    event.preventDefault();
    scheduleBookmarkDragMove(bookmarkDragState, pointerX, pointerY);
  }

  function handleBookmarkDragPointerUp(event) {
    finishBookmarkDrag(event);
  }

  function handleBookmarkDragPointerCancel(event) {
    finishBookmarkDrag(event, { canceled: true });
  }

  function renderBookmarks(items) {
    const normalizedItems = Array.isArray(items) ? items : [];
    const isAtRoot = String(bookmarkCurrentFolderId || '') === String(bookmarkRootFolderId || '1');
    const keepEmptyRootVisibleForDrag = Boolean(
      isAtRoot &&
      normalizedItems.length === 0 &&
      ((bookmarkDragState && bookmarkDragState.isDragging) || isShortcutDragActive())
    );
    if (bookmarkGrid) {
      if (keepEmptyRootVisibleForDrag) {
        bookmarkGrid.setAttribute('data-bookmark-empty-drop-surface', 'true');
      } else {
        bookmarkGrid.removeAttribute('data-bookmark-empty-drop-surface');
      }
    }
    const renderResult = bookmarksView.render(normalizedItems, {
      signature: bookmarkRenderSignature,
      folderId: bookmarkCurrentFolderId,
      rootFolderId: bookmarkRootFolderId,
      viewMode: currentBookmarkViewMode,
      menuMode: currentBookmarkViewMode === 'list' || isBookmarkTopbarMode()
    });
    if (shortcutDragState && shortcutDragState.isDragging &&
        shortcutDragState.folderSwitchPendingId === String(bookmarkCurrentFolderId || '')) {
      shortcutDragState.folderSwitchPendingId = '';
      scheduleShortcutDragMove(shortcutDragState, shortcutDragState.pendingPointerX, shortcutDragState.pendingPointerY);
    }
    if (bookmarkDragState &&
        bookmarkDragState.isDragging &&
        bookmarkDragState.folderSwitchPendingId ===
          String(bookmarkCurrentFolderId || '')) {
      const activeDragState = bookmarkDragState;
      activeDragState.folderSwitchPendingId = '';
      updateBookmarkDragLayoutCache(activeDragState);
      setBookmarkDragCardTransform(
        activeDragState,
        Number(activeDragState.pendingPointerX),
        Number(activeDragState.pendingPointerY)
      );
      scheduleBookmarkDragMove(
        activeDragState,
        Number(activeDragState.pendingPointerX),
        Number(activeDragState.pendingPointerY)
      );
    }
    syncOpenBookmarkCascadeAnchorVisual();
    if (!renderResult.changed) {
      if (normalizedItems.length === 0) {
        setBookmarkSurfaceVisible(!isAtRoot || keepEmptyRootVisibleForDrag);
        updateBookmarkGridHeightLock();
        updateBookmarkSectionPosition();
      } else {
        setBookmarkSurfaceVisible(true);
        updateBookmarkGridHeightLock();
        updateBookmarkSectionPosition();
      }
      updateBookmarkPagerState();
      return;
    }
    bookmarkRenderSignature = renderResult.signature;
    if (normalizedItems.length === 0) {
      setBookmarkSurfaceVisible(!isAtRoot || keepEmptyRootVisibleForDrag);
      updateBookmarkGridHeightLock();
      updateBookmarkSectionPosition();
      updateBookmarkPagerState();
      return;
    }
    setBookmarkSurfaceVisible(true);
    updateBookmarkPagerState();
    updateBookmarkGridHeightLock();
    updateBookmarkSectionPosition();
  }

  function renderRecentSites(items) {
    const sourceItems = Array.isArray(items) ? items : [];
    const resolvedHiddenUrls = new Set();
    sourceItems.forEach((item) => {
      const normalizedItem = normalizeRecentSiteRecord(item);
      if (!normalizedItem) {
        return;
      }
      const key = getRecentSiteUrlKey(normalizedItem);
      if (!key) {
        return;
      }
      const hiddenEntry = hiddenRecentSites.find((entry) => entry && entry.url === key);
      if (!hiddenEntry) {
        return;
      }
      if ((Number(normalizedItem.lastVisitTime) || 0) > (Number(hiddenEntry.lastVisitTime) || 0)) {
        resolvedHiddenUrls.add(key);
      }
    });
    if (resolvedHiddenUrls.size > 0) {
      writeHiddenRecentSites(
        hiddenRecentSites.filter((entry) => entry && !resolvedHiddenUrls.has(entry.url))
      );
    }
    const normalizedSourceItems = sourceItems
      .filter((item) => {
        const url = item && item.url ? String(item.url) : '';
        return !shouldExcludeFromRecentSites(url) && !isRecentSiteHidden(item);
      });
    recentSourceItems = normalizedSourceItems.slice();
    const mergedItems = mergeRecentSitesWithPinned(normalizedSourceItems, getRecentLimit());
    const renderResult = recentSitesView.render(mergedItems, {
      signature: recentRenderSignature
    });
    if (!renderResult.changed) {
      if (mergedItems.length === 0) {
        setContentSectionVisible(recentSection, false);
      } else {
        setContentSectionVisible(recentSection, true);
      }
      updateBookmarkSectionPosition();
      return;
    }
    recentRenderSignature = renderResult.signature;
    if (mergedItems.length === 0) {
      setContentSectionVisible(recentSection, false);
      updateBookmarkSectionPosition();
      return;
    }
    setContentSectionVisible(recentSection, true);
    updateBookmarkSectionPosition();
  }

  function markBookmarkDataDirty() {
    bookmarkDataDirty = true;
  }

  function markBookmarkTreeDirty(options) {
    const preserveCascadeOpen = Boolean(options && options.preserveCascadeOpen);
    bookmarkDataDirty = true;
    if (!options || options.skipRuntimeInvalidate !== true) {
      bookmarksRuntime.invalidate();
    }
    if (!preserveCascadeOpen) {
      closeBookmarkCascadeMenu();
    }
  }

  function markRecentDataDirty() {
    recentDataDirty = true;
  }

  function loadBookmarks(options) {
    const config = options || {};
    const requestedSectionDataRevision = Number.isFinite(Number(config.sectionDataRevision))
      ? Number(config.sectionDataRevision)
      : sectionDataRevision;
    if (!initialThemeApplied) {
      return bootstrapInitialThemeMode().then(() => loadBookmarks({
        ...config,
        sectionDataRevision: requestedSectionDataRevision
      }));
    }
    const forceReload = Boolean(config.force);
    const skipFaviconWait = Boolean(config.skipFaviconWait);
    if (!skipFaviconWait && !areFaviconRenderCachesReady()) {
      const waitMs = forceReload ? Math.min(80, FAVICON_CACHE_BOOT_WAIT_MS) : FAVICON_CACHE_BOOT_WAIT_MS;
      return waitForFaviconRenderCaches(waitMs).then(() => (
        loadBookmarks({
          ...config,
          force: forceReload,
          skipFaviconWait: true,
          sectionDataRevision: requestedSectionDataRevision
        })
      ));
    }
    if (!forceReload && !bookmarkDataDirty && bookmarkLoadedOnce) {
      updateBookmarkSectionPosition();
      return Promise.resolve();
    }
    const requestToken = ++bookmarkLoadToken;
    if (!currentBookmarkCount || currentBookmarkCount <= 0) {
      closeBookmarkCascadeMenu();
      bookmarkAllItems = [];
      bookmarkRootTotalCount = 0;
      bookmarkRootVisibleCount = 0;
      bookmarkCurrentPage = 0;
      bookmarkRenderSignature = '';
      bookmarksView.clear();
      setBookmarkSurfaceVisible(false);
      bookmarkDataDirty = false;
      bookmarkLoadedOnce = true;
      updateBookmarkSectionPosition();
      return Promise.resolve();
    }
    return getTopBookmarks(0, bookmarkCurrentFolderId).then((items) => {
      if (requestToken !== bookmarkLoadToken ||
          requestedSectionDataRevision !== sectionDataRevision) {
        return;
      }
      if (!currentBookmarkCount || currentBookmarkCount <= 0) {
        closeBookmarkCascadeMenu();
        bookmarkAllItems = [];
        bookmarkRootTotalCount = 0;
        bookmarkRootVisibleCount = 0;
        bookmarkCurrentPage = 0;
        bookmarkRenderSignature = '';
        bookmarksView.clear();
        setBookmarkSurfaceVisible(false);
        bookmarkDataDirty = false;
        bookmarkLoadedOnce = true;
        updateBookmarkSectionPosition();
        return;
      }
      bookmarkAllItems = Array.isArray(items) ? items : [];
      const isAtRoot = String(bookmarkCurrentFolderId || '') === String(bookmarkRootFolderId || '1');
      if (isAtRoot) {
        bookmarkRootTotalCount = bookmarkAllItems.length;
        bookmarkRootVisibleCount = Math.min(getBookmarkLimit(), bookmarkAllItems.length);
      }
      const pageCount = getBookmarkPageCount();
      if (bookmarkCurrentPage > (pageCount - 1)) {
        bookmarkCurrentPage = pageCount - 1;
      }
      if (bookmarkCurrentPage < 0) {
        bookmarkCurrentPage = 0;
      }
      updateBookmarkBreadcrumb();
      renderCurrentBookmarkPage();
      playPendingBookmarkLayoutAnimation();
      if (!isShortcutDragActive() && newtabShortcuts.some((shortcut) => shortcut.type === 'folder')) {
        renderShortcuts();
      }
      bookmarkDataDirty = false;
      bookmarkLoadedOnce = true;
    });
  }

  function loadRecentSites(options) {
    const config = options || {};
    const requestedSectionDataRevision = Number.isFinite(Number(config.sectionDataRevision))
      ? Number(config.sectionDataRevision)
      : sectionDataRevision;
    if (!initialThemeApplied) {
      return bootstrapInitialThemeMode().then(() => loadRecentSites({
        ...config,
        sectionDataRevision: requestedSectionDataRevision
      }));
    }
    const forceReload = Boolean(config.force);
    const skipFaviconWait = Boolean(config.skipFaviconWait);
    if (!skipFaviconWait && !areFaviconRenderCachesReady()) {
      const waitMs = forceReload ? Math.min(80, FAVICON_CACHE_BOOT_WAIT_MS) : FAVICON_CACHE_BOOT_WAIT_MS;
      return waitForFaviconRenderCaches(waitMs).then(() => (
        loadRecentSites({
          ...config,
          force: forceReload,
          skipFaviconWait: true,
          sectionDataRevision: requestedSectionDataRevision
        })
      ));
    }
    if (!forceReload && !recentDataDirty && recentLoadedOnce) {
      updateBookmarkSectionPosition();
      return Promise.resolve();
    }
    const requestToken = ++recentLoadToken;
    const recentSourceLimit = getRecentSourceLimit();
    if (!recentSourceLimit || recentSourceLimit <= 0) {
      recentRenderSignature = '';
      recentSourceItems = [];
      recentSitesView.clear();
      setContentSectionVisible(recentSection, false);
      recentDataDirty = false;
      recentLoadedOnce = true;
      updateBookmarkSectionPosition();
      return Promise.resolve();
    }
    return getRecentSites(recentSourceLimit + MAX_PINNED_RECENT_SITES, currentRecentMode).then((items) => {
      if (requestToken !== recentLoadToken ||
          requestedSectionDataRevision !== sectionDataRevision) {
        return;
      }
      const normalizedItems = Array.isArray(items) ? items : [];
      renderRecentSites(normalizedItems);
      recentDataDirty = false;
      recentLoadedOnce = true;
    });
  }

  function handleRecentVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      return;
    }
    const shouldReloadRecent = recentDataDirty || !recentLoadedOnce;
    const shouldReloadBookmarks = bookmarkDataDirty || !bookmarkLoadedOnce;
    if (shouldReloadRecent || shouldReloadBookmarks) {
      beginSearchEntryRestoreLayoutLock();
    }
    if (shouldReloadRecent) {
      loadRecentSites();
    }
    if (shouldReloadBookmarks) {
      loadBookmarks();
    }
  }

  function forceReloadRecentSitesForI18n() {
    recentRenderSignature = '';
    bookmarkRenderSignature = '';
    markRecentDataDirty();
    markBookmarkDataDirty();
    loadRecentSites();
    loadBookmarks();
  }

  function hideToast() {
    if (toastController && typeof toastController.hide === 'function') {
      toastController.hide();
    }
  }

  function showToast(message, isError, options) {
    if (toastController && typeof toastController.show === 'function') {
      toastController.show(message, Object.assign({}, options, {
        error: Boolean(isError)
      }));
    }
  }

  const numberShortcutOptions = {
    onHoldStart: function() {
      showToast(t(
        'search_number_jump_release_hint',
        'Release to show numbers'
      ), false, { duration: 0 });
    },
    onHoldEnd: hideToast,
    instantActive: () => numberShortcutInstantEnabled
  };

  function fallbackCopyText(text) {
    if (!document || !document.body || typeof document.execCommand !== 'function') {
      return false;
    }
    const activeElement = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = String(text || '');
    textarea.setAttribute('readonly', '');
    textarea.style.setProperty('position', 'fixed');
    textarea.style.setProperty('left', '-9999px');
    textarea.style.setProperty('top', '0');
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    textarea.remove();
    if (activeElement && typeof activeElement.focus === 'function') {
      activeElement.focus({ preventScroll: true });
    }
    return copied;
  }

  function copyTextToClipboard(text) {
    const value = String(text || '');
    const clipboard = window.navigator && window.navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      return Promise.resolve(clipboard.writeText(value)).catch((error) => {
        if (fallbackCopyText(value)) {
          return true;
        }
        throw error;
      });
    }
    return fallbackCopyText(value)
      ? Promise.resolve(true)
      : Promise.reject(new Error('clipboard-write-failed'));
  }

  function copyBookmarkUrl(url) {
    const value = String(url || '').trim();
    if (!value) {
      showToast(t('bookmarks_copy_url_failed', 'Could not copy link'), true);
      return Promise.resolve(false);
    }
    return copyTextToClipboard(value).then(() => {
      showToast(t('bookmarks_copy_url_success', 'Bookmark link copied'));
      return true;
    }).catch(() => {
      showToast(t('bookmarks_copy_url_failed', 'Could not copy link'), true);
      return false;
    });
  }

  function copySearchResultUrl(url) {
    const value = String(url || '').trim();
    if (!value) {
      showToast(t('search_copy_url_failed', 'Could not copy result link'), true);
      return Promise.resolve(false);
    }
    return copyTextToClipboard(value).then(() => {
      showToast(t('search_copy_url_success', 'Result link copied'));
      return true;
    }).catch(() => {
      showToast(t('search_copy_url_failed', 'Could not copy result link'), true);
      return false;
    });
  }

  function getSearchModeMenuResultOffset() {
    if (!suggestionsContainer ||
        suggestionsContainer.getAttribute('data-visible') !== 'true') {
      return 0;
    }
    const layoutHeight = Math.max(
      0,
      Number(suggestionsContainer.offsetHeight) || 0
    );
    if (layoutHeight > 0) {
      return layoutHeight;
    }
    const rect = suggestionsContainer.getBoundingClientRect();
    return Math.max(0, Number(rect && rect.height) || 0);
  }

  function syncSearchModeMenuResultOffset() {
    if (!inputModeController ||
        typeof inputModeController.setModeMenuResultOffset !== 'function') {
      return;
    }
    const fitMaxHeightProperty =
      '--x-nt-suggestions-menu-fit-max-height';
    const resultHeightLimit =
      typeof inputModeController.fitModeMenuWithinViewport === 'function'
        ? inputModeController.fitModeMenuWithinViewport({ bottomInset: 24 })
        : null;
    if (Number.isFinite(resultHeightLimit)) {
      suggestionsContainer.style.setProperty(
        fitMaxHeightProperty,
        `${resultHeightLimit}px`
      );
    } else {
      suggestionsContainer.style.removeProperty(fitMaxHeightProperty);
    }
    inputModeController.setModeMenuResultOffset(
      getSearchModeMenuResultOffset()
    );
  }

  function setSuggestionsVisible(visible) {
    if (layoutController && typeof layoutController.setSuggestionsVisible === 'function') {
      layoutController.setSuggestionsVisible(visible);
    }
    syncSearchModeMenuResultOffset();
  }

  function updateSuggestionsFloatingLayout() {
    if (layoutController && typeof layoutController.updateSuggestionsFloatingLayout === 'function') {
      layoutController.updateSuggestionsFloatingLayout();
    }
  }

  function getRecentSites(limit, mode) {
    const safeLimit = Math.max(0, Number(limit) || 0);
    const viewMode = mode === 'most' ? 'most' : 'latest';
    if (safeLimit <= 0) {
      return Promise.resolve([]);
    }

    const mergeSources = (sources, mergeMode) => NEWTAB_RECENT_STORE.mergeRecentSiteSources({
      ...getRecentStoreOptions(),
      ...(sources || {}),
      mode: mergeMode || viewMode,
      limit: safeLimit,
      candidateLimit: safeLimit,
      pinned: [],
      hidden: []
    });

    const readOpenTabs = () => new Promise((resolve) => {
      if (!chrome.tabs || !chrome.tabs.query) {
        resolve([]);
        return;
      }
      chrome.tabs.query({}, (tabs) => {
        resolve(chrome.runtime.lastError || !Array.isArray(tabs) ? [] : tabs);
      });
    });

    const readTopSites = () => new Promise((resolve) => {
      if (!chrome.topSites || !chrome.topSites.get) {
        resolve(null);
        return;
      }
      chrome.topSites.get((items) => {
        resolve(chrome.runtime.lastError || !Array.isArray(items) ? null : items);
      });
    });

    const readHistoryItems = () => new Promise((resolve) => {
      if (!chrome.history || !chrome.history.search) {
        resolve(null);
        return;
      }
      chrome.history.search({
        text: '',
        maxResults: 60,
        startTime: Date.now() - 1000 * 60 * 60 * 24 * 30
      }, (items) => {
        resolve(chrome.runtime.lastError || !Array.isArray(items) ? null : items);
      });
    });

    const mergeWithTabsIfNeeded = (sources, mergeMode) => {
      const withoutTabs = mergeSources(sources, mergeMode);
      return readOpenTabs().then((tabs) => {
        const shouldMergeTabs = withoutTabs.length < safeLimit ||
          (Array.isArray(tabs) && tabs.some((tab) => isBrowserPageRecentUrl(tab && tab.url)));
        if (!shouldMergeTabs) {
          return withoutTabs;
        }
        return mergeSources({
          ...(sources || {}),
          tabs
        }, mergeMode);
      });
    };

    const loadLatestRecentSites = () => readHistoryItems().then((historyItems) => {
      if (!Array.isArray(historyItems)) {
        return [];
      }
      const historyOnly = mergeSources({ historyItems }, 'latest');
      if (historyOnly.length >= safeLimit) {
        return mergeWithTabsIfNeeded({ historyItems }, 'latest');
      }
      return readTopSites().then((topSites) => mergeWithTabsIfNeeded({
        historyItems,
        topSites: Array.isArray(topSites) ? topSites : []
      }, 'latest'));
    });

    if (viewMode === 'most') {
      return readTopSites().then((topSites) => {
        const topSiteItems = Array.isArray(topSites) ? topSites : [];
        const topOnly = mergeSources({ topSites: topSiteItems }, 'most');
        if (topOnly.length === 0) {
          return loadLatestRecentSites();
        }
        if (topOnly.length >= safeLimit) {
          return mergeWithTabsIfNeeded({ topSites: topSiteItems }, 'most');
        }
        return mergeWithTabsIfNeeded({ topSites: topSiteItems }, 'most');
      });
    }

    return loadLatestRecentSites();
  }

  // Kick off favicon cache warmup early; theme tint work flushes when storage is ready.
  faviconCacheRuntime.ensureCachesReady().then(() => {
    scheduleThemeResolutionFlush(0);
    refreshThemeAwareFavicons();
    scheduleThemeAwareFaviconRescue();
  });

  function openBookmarkCascadeMenu(item, anchorElement, options) {
    if (bookmarkCascadeRuntime) {
      bookmarkCascadeRuntime.open(item, anchorElement, {
        ...options,
        toggle: !options || options.dragMode !== true
      });
    }
  }

  function closeBookmarkCascadeMenu() {
    if (bookmarkCascadeRuntime) {
      bookmarkCascadeRuntime.close();
    }
  }

  function positionBookmarkCascadeLevels() {
    if (bookmarkCascadeRuntime) {
      bookmarkCascadeRuntime.positionLevels();
    }
  }

  function setBookmarkCascadeDebugEnabled(enabled, options) {
    if (bookmarkCascadeRuntime) {
      bookmarkCascadeRuntime.setDebugEnabled(enabled, options);
    }
  }

  function getTopBookmarks(limit, folderId) {
    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 0;
    return bookmarksRuntime.readFolder(
      folderId || bookmarkCurrentFolderId || bookmarkRootFolderId,
      {
        limit: safeLimit,
        rootTitle: t('bookmarks_heading', '书签')
      }
    ).then((result) => {
      bookmarkRootFolderId = String(result.rootFolderId || '1');
      bookmarkCurrentFolderId = String(result.folderId || bookmarkRootFolderId);
      bookmarkFolderPath = Array.isArray(result.path)
        ? result.path
        : [{ id: bookmarkRootFolderId, title: t('bookmarks_heading', '书签') }];
      return Array.isArray(result.items) ? result.items : [];
    });
  }

  function getSiteDisplayName(hostname, title) {
    return SITE_DISPLAY_NAME.getSiteDisplayName(
      hostname,
      title,
      SITE_DISPLAY_NAME_OPTIONS
    );
  }

  function getRecentCardColors(theme, host) {
    const fallbackTheme = theme || buildFallbackThemeForHost(host) || defaultTheme;
    const resolvedTheme = getThemeForMode(fallbackTheme);
    const accentRgb = resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent) || defaultAccentColor;
    const isDark = document.body && document.body.getAttribute('data-theme') === 'dark';
    const accentEmphasis = mixColor(accentRgb, [0, 0, 0], isDark ? 0.1 : 0.18);
    const baseTarget = isDark ? [22, 22, 22] : [255, 255, 255];
    const base = mixColor(accentRgb, baseTarget, isDark ? 0.72 : 0.82);
    const border = mixColor(base, isDark ? [255, 255, 255] : [0, 0, 0], isDark ? 0.12 : 0.1);
    const innerTint = mixColor(accentRgb, [255, 255, 255], 0.82);
    return {
      base: rgbToCss(base),
      border: rgbToCss(border),
      innerTint: rgbToCssParts(innerTint),
      accent: rgbToCss(accentEmphasis),
      accentSoft: rgbToCssAlpha(accentRgb, isDark ? 0.14 : 0.12),
      accentBorder: rgbToCssAlpha(accentRgb, isDark ? 0.24 : 0.18)
    };
  }

  function applyRecentCardTheme(card, theme, host) {
    if (!card) {
      return;
    }
    const colors = getRecentCardColors(theme, host);
    card.style.setProperty('--x-nt-recent-card-color', colors.base);
    card.style.setProperty('--x-nt-recent-card-border-color', colors.border);
    card.style.setProperty('--x-nt-recent-inner-tint-rgb', colors.innerTint);
    card.style.setProperty('--x-nt-recent-accent-color', colors.accent);
    card.style.setProperty('--x-nt-recent-accent-soft', colors.accentSoft);
    card.style.setProperty('--x-nt-recent-accent-border', colors.accentBorder);
  }

  function getBookmarkCardColors(theme, host) {
    const fallbackTheme = theme || buildFallbackThemeForHost(host) || defaultTheme;
    const resolvedTheme = getThemeForMode(fallbackTheme);
    const accentRgb = resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent) || defaultAccentColor;
    const isDark = document.body && document.body.getAttribute('data-theme') === 'dark';
    const baseTarget = isDark ? [24, 24, 24] : [255, 255, 255];
    const base = mixColor(accentRgb, baseTarget, isDark ? 0.9 : 0.94);
    const border = mixColor(base, isDark ? [255, 255, 255] : [0, 0, 0], isDark ? 0.12 : 0.07);
    const icon = mixColor(accentRgb, baseTarget, isDark ? 0.92 : 0.96);
    const hover = mixColor(accentRgb, baseTarget, isDark ? 0.84 : 0.9);
    const shadow = isDark
      ? mixColor(accentRgb, [18, 26, 40], 0.62)
      : mixColor(accentRgb, [138, 146, 160], 0.46);
    return {
      base: rgbToCss(base),
      hover: rgbToCssAlpha(hover, isDark ? 0.78 : 0.86),
      border: rgbToCss(border),
      iconBg: rgbToCss(icon),
      shadowRgb: rgbToCssParts(shadow)
    };
  }

  function applyBookmarkCardTheme(card, theme, host) {
    if (!card) {
      return;
    }
    if (card._xNoThemeTint) {
      card.style.removeProperty('--x-nt-bookmark-card-color');
      card.style.removeProperty('--x-nt-bookmark-card-hover-color');
      card.style.removeProperty('--x-nt-bookmark-card-border-color');
      card.style.removeProperty('--x-nt-bookmark-icon-color');
      const isDark = document.body && document.body.getAttribute('data-theme') === 'dark';
      card.style.setProperty('--x-nt-bookmark-shadow-rgb', isDark ? '52, 96, 180' : '86, 138, 220');
      return;
    }
    const colors = getBookmarkCardColors(theme, host);
    card.style.setProperty('--x-nt-bookmark-card-color', colors.base);
    card.style.setProperty('--x-nt-bookmark-card-hover-color', colors.hover);
    card.style.setProperty('--x-nt-bookmark-card-border-color', colors.border);
    card.style.setProperty('--x-nt-bookmark-icon-color', colors.iconBg);
    card.style.setProperty('--x-nt-bookmark-shadow-rgb', colors.shadowRgb);
  }

  function getShortcutIconColors(theme, host) {
    const fallbackTheme = theme || buildFallbackThemeForHost(host) || defaultTheme;
    const resolvedTheme = getThemeForMode(fallbackTheme);
    const accentRgb = normalizeAccentRgb(resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent)) || defaultAccentColor;
    const isDark = document.body && document.body.getAttribute('data-theme') === 'dark';
    const baseTarget = isDark ? [22, 22, 22] : [255, 255, 255];
    const iconBgRgb = mixColor(accentRgb, baseTarget, isDark ? 0.72 : 0.82);
    return {
      iconBg: rgbToCss(iconBgRgb),
      iconColor: getReadableTextColor(iconBgRgb)
    };
  }

  function isShortcutThemeDefaultForWallpaper(theme) {
    if (theme && theme._xIsCustomShortcutIcon) {
      return false;
    }
    const source = getThemeSource(theme);
    if (!theme || theme._xIsDefault || source === 'fallback') {
      return true;
    }
    if (source === 'favicon') {
      const accentRgb = normalizeAccentRgb(theme.accentRgb || parseCssColor(theme.accent));
      return theme._xThemeNeutral === true ||
        normalizeThemeConfidence(theme._xThemeConfidence, accentRgb) === 'neutral';
    }
    return isLowConfidenceTheme(theme);
  }

  function applyShortcutTileTheme(tile, theme, host) {
    if (!tile) {
      return;
    }
    const fallbackTheme = theme || buildFallbackThemeForHost(host) || defaultTheme;
    const isDefaultTheme = isShortcutThemeDefaultForWallpaper(fallbackTheme);
    const colors = getShortcutIconColors(theme, host);
    tile.setAttribute('data-shortcut-theme-default', isDefaultTheme ? 'true' : 'false');
    tile.setAttribute('data-shortcut-theme-source', getThemeSource(fallbackTheme));
    tile.style.removeProperty('--x-nt-shortcut-wallpaper-icon-bg');
    tile.style.removeProperty('--x-nt-shortcut-wallpaper-icon-color');
    tile.style.setProperty('--x-nt-shortcut-icon-bg', colors.iconBg);
    tile.style.setProperty('--x-nt-shortcut-icon-color', colors.iconColor);
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function shouldDelayBookmarkHoverFromRecent(pointerType) {
    if (pointerType && pointerType !== 'mouse') {
      return false;
    }
    if (recentMouseInsideSection) {
      return true;
    }
    if (!recentMouseLeftAt) {
      return false;
    }
    return (Date.now() - recentMouseLeftAt) <= BOOKMARK_HOVER_RECENT_TRANSFER_WINDOW_MS;
  }

  function getAutocompleteCandidate(allSuggestions, rawQuery) {
    if (!Array.isArray(allSuggestions) || !rawQuery) {
      return null;
    }
    const rawLower = rawQuery.toLowerCase();
    const passes = [true, false];
    for (let passIndex = 0; passIndex < passes.length; passIndex += 1) {
      const skipGoogleSuggest = passes[passIndex];
      for (let i = 0; i < allSuggestions.length; i += 1) {
        const suggestion = allSuggestions[i];
        if (!suggestion || suggestion.type === 'newtab') {
          continue;
        }
        if (skipGoogleSuggest && suggestion.type === 'googleSuggest') {
          continue;
        }
        if (suggestion.commandText) {
          const commandText = String(suggestion.commandText).toLowerCase();
          if (commandText.startsWith(rawLower)) {
            return {
              completion: suggestion.commandText,
              url: '',
              title: suggestion.title || '',
              type: 'command'
            };
          }
          const aliases = Array.isArray(suggestion.commandAliases) ? suggestion.commandAliases : [];
          for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
            const alias = String(aliases[aliasIndex] || '').toLowerCase();
            if (alias && alias.startsWith(rawLower)) {
              return {
                completion: aliases[aliasIndex],
                url: '',
                title: suggestion.title || '',
                type: 'command'
              };
            }
          }
        }
        const urlText = getUrlDisplay(suggestion.url);
        if (urlText && urlText.toLowerCase().startsWith(rawLower)) {
          return {
            completion: urlText,
            url: suggestion.url || '',
            title: suggestion.title || '',
            type: 'url'
          };
        }
        const titleText = suggestion.title || '';
        if (titleText && titleText.toLowerCase().startsWith(rawLower)) {
          return {
            completion: titleText,
            url: suggestion.url || '',
            title: suggestion.title || '',
            type: 'title'
          };
        }
      }
    }
    return null;
  }

  function getDomainPrefixCandidate(allSuggestions, rawQuery) {
    if (!Array.isArray(allSuggestions) || !rawQuery) {
      return null;
    }
    const rawLower = rawQuery.toLowerCase();
    for (let i = 0; i < allSuggestions.length; i += 1) {
      const suggestion = allSuggestions[i];
      if (!suggestion || suggestion.type === 'newtab') {
        continue;
      }
      const urlText = getUrlDisplay(suggestion.url);
      if (!urlText) {
        continue;
      }
      const host = urlText.split('/')[0] || '';
      if (host.toLowerCase().startsWith(rawLower)) {
        return {
          completion: urlText,
          url: suggestion.url || '',
          title: suggestion.title || '',
          type: 'url'
        };
      }
    }
    return null;
  }

  function getAutocompleteCandidateFromSuggestion(suggestion, rawQuery) {
    if (!suggestion || !rawQuery || suggestion.type === 'newtab') {
      return null;
    }
    const rawLower = rawQuery.toLowerCase();
    if (suggestion.commandText) {
      const commandText = String(suggestion.commandText).toLowerCase();
      if (commandText.startsWith(rawLower)) {
        return {
          completion: suggestion.commandText,
          url: '',
          title: suggestion.title || '',
          type: 'command'
        };
      }
      const aliases = Array.isArray(suggestion.commandAliases) ? suggestion.commandAliases : [];
      for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
        const alias = String(aliases[aliasIndex] || '');
        if (alias.toLowerCase().startsWith(rawLower)) {
          return {
            completion: alias,
            url: '',
            title: suggestion.title || '',
            type: 'command'
          };
        }
      }
    }
    const urlText = getUrlDisplay(suggestion.url);
    if (urlText) {
      const host = urlText.split('/')[0] || '';
      if (host.toLowerCase().startsWith(rawLower) || urlText.toLowerCase().startsWith(rawLower)) {
        return {
          completion: urlText,
          url: suggestion.url || '',
          title: suggestion.title || '',
          type: 'url'
        };
      }
    }
    const titleText = suggestion.title || '';
    if (titleText && titleText.toLowerCase().startsWith(rawLower)) {
      return {
        completion: titleText,
        url: suggestion.url || '',
        title: suggestion.title || '',
        type: 'title'
      };
    }
    return null;
  }

  function clearAutocomplete() {
    autocompleteState = null;
  }

  function restoreUserAuthoredSearchInput() {
    if (!autocompleteState || !autocompleteState.completion) {
      return false;
    }
    const rawQuery = typeof autocompleteState.rawQuery === 'string'
      ? autocompleteState.rawQuery
      : String(latestRawQuery || '');
    if (inputParts && inputParts.input && inputParts.input.value !== rawQuery) {
      inputParts.input.value = rawQuery;
      inputParts.input.setSelectionRange(rawQuery.length, rawQuery.length);
    }
    latestRawQuery = rawQuery;
    latestQuery = rawQuery.trim();
    clearAutocomplete();
    return true;
  }

  function dismissAutocompletePreviewOnNonTabKey(event) {
    if (!event || event.key === 'Tab') {
      return false;
    }
    const isModifierOnly = event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta';
    if (isModifierOnly) {
      return false;
    }
    return restoreUserAuthoredSearchInput();
  }

  function applyAutocomplete(allSuggestions, primarySuggestion, primaryHighlightReason) {
    const rawQuery = latestRawQuery;
    const trimmedQuery = rawQuery.trim();
    if (searchResultPriorityMode === 'search') {
      if (inputParts && inputParts.input && inputParts.input.value !== rawQuery) {
        inputParts.input.value = rawQuery;
        inputParts.input.setSelectionRange(rawQuery.length, rawQuery.length);
      }
      clearAutocomplete();
      return;
    }
    if (Date.now() - lastDeletionAt < 250) {
      clearAutocomplete();
      return;
    }
    if (siteSearchState) {
      clearAutocomplete();
      return;
    }
    if (!isEnglishQuery(trimmedQuery) || !rawQuery) {
      clearAutocomplete();
      return;
    }
    if (!allSuggestions || !Array.isArray(allSuggestions)) {
      clearAutocomplete();
      return;
    }
    if (inputParts.input.selectionStart !== inputParts.input.value.length ||
        inputParts.input.selectionEnd !== inputParts.input.value.length) {
      return;
    }
    const shouldForcePrimaryAlignment = Boolean(
      primarySuggestion &&
      primaryHighlightReason &&
      primaryHighlightReason !== 'autocomplete' &&
      primaryHighlightReason !== 'default'
    );
    let candidate = null;
    if (primarySuggestion) {
      candidate = getAutocompleteCandidateFromSuggestion(primarySuggestion, rawQuery);
    }
    if (!candidate && shouldForcePrimaryAlignment) {
      clearAutocomplete();
      return;
    }
    if (!candidate) {
      const autocompleteSuggestions = getKeywordSearchSuggestionState(allSuggestions).autocompleteSuggestions;
      candidate = getDomainPrefixCandidate(autocompleteSuggestions, rawQuery) ||
        getAutocompleteCandidate(autocompleteSuggestions, rawQuery);
    }
    if (!candidate || !candidate.completion) {
      clearAutocomplete();
      return;
    }
    if (candidate.type === 'title') {
      clearAutocomplete();
      return;
    }
    if (candidate.completion.length <= rawQuery.length) {
      clearAutocomplete();
      return;
    }
    if (!candidate.completion.toLowerCase().startsWith(rawQuery.toLowerCase())) {
      clearAutocomplete();
      return;
    }
    const displayText = candidate.completion;
    inputParts.input.value = displayText;
    inputParts.input.setSelectionRange(rawQuery.length, displayText.length);
    autocompleteState = {
      completion: candidate.completion,
      displayText: displayText,
      url: candidate.url || '',
      rawQuery: rawQuery,
      title: candidate.title || '',
      type: candidate.type || ''
    };
  }

  function buildSearchUrl(template, query) {
    if (!template) {
      return '';
    }
    return template.replace(/\{query\}/g, encodeURIComponent(query));
  }

  function isAiSiteSearchProvider(provider) {
    return SEARCH_UTILS.isAiSiteSearchProvider(provider);
  }

  function isSearchEngineSiteSearchProvider(provider) {
    return SEARCH_UTILS.isSearchEngineSiteSearchProvider(provider);
  }

  function isAggregateSearchProvider(provider) {
    return AGGREGATE_SEARCH_STORE.isAggregateSearchProvider(provider);
  }

  function isInteractiveSiteSearchProvider(provider) {
    return SEARCH_UTILS.isInteractiveSiteSearchProvider(provider);
  }

  function getAggregateSearchRequestController() {
    if (aggregateSearchRequestController) {
      return aggregateSearchRequestController;
    }
    aggregateSearchRequestController = AGGREGATE_SEARCH_SURFACE.createAggregateSearchRequestController({
      chromeApi: chrome,
      onFeedback(descriptor) {
        showToast(t(descriptor.messageKey, descriptor.fallback), descriptor.isError);
      }
    });
    return aggregateSearchRequestController;
  }

  function runSiteSearchProviderQuery(provider, query, disposition) {
    const trimmedQuery = String(query || '').trim();
    if (!provider || !trimmedQuery) {
      return false;
    }
    if (isAggregateSearchProvider(provider) && provider.aggregateId) {
      const normalizedDisposition = disposition || 'currentTab';
      const controller = getAggregateSearchRequestController();
      if (!controller) {
        showToast(t('toast_error', 'Operation failed. Please try again.'), true);
        return true;
      }
      controller.run({
        aggregateId: String(provider.aggregateId),
        disposition: normalizedDisposition,
        query: trimmedQuery
      });
      return true;
    }
    if (isInteractiveSiteSearchProvider(provider)) {
      chrome.runtime.sendMessage({
        action: 'runSiteSearchProviderQuery',
        provider: provider,
        query: trimmedQuery,
        disposition: disposition || 'currentTab'
      });
      return true;
    }
    const siteUrl = buildSearchUrl(provider.template, trimmedQuery);
    if (!siteUrl) {
      return false;
    }
    if (disposition === 'backgroundTab') {
      chrome.runtime.sendMessage({
        action: 'createTab',
        url: siteUrl,
        disposition: 'backgroundTab'
      });
      return true;
    }
    navigateToUrl(siteUrl);
    return true;
  }

  function getProviderFaviconPageUrl(provider) {
    return SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider);
  }

  function getProviderIcon(provider) {
    const resolver = getPageFaviconUrlResolver();
    if (!resolver) {
      return '';
    }
    const iconUrl = SHORTCUT_FAVICON.getSiteSearchProviderIcon(
      siteSearchIconCacheLoaded ? siteSearchIconCache : {}, provider, Date.now(), {
        ...siteSearchIconCacheOptions,
        resolveAssetUrl: getExtensionResourceUrl
      }
    );
    return resolver.getProviderFaviconUrl(getProviderFaviconPageUrl(provider), iconUrl);
  }

  function getProviderIconAttachPageUrl(provider, iconUrl, iconHost) {
    const providerPageUrl = getProviderFaviconPageUrl(provider);
    if (providerPageUrl) {
      return providerPageUrl;
    }
    const canonicalIconPageUrl = getCanonicalPageUrlForFavicon(iconUrl);
    if (canonicalIconPageUrl && canonicalIconPageUrl !== iconUrl) {
      return canonicalIconPageUrl;
    }
    const host = String(iconHost || '').trim();
    return host ? `https://${host}/` : '';
  }

  function attachInputModeProviderIcon(icon, context) {
    const iconUrl = context && context.iconUrl ? String(context.iconUrl).trim() : '';
    if (!icon || !iconUrl || iconUrl.startsWith('data:')) {
      return false;
    }
    const iconHost = context && context.iconHost ? String(context.iconHost).trim() : '';
    const pageUrl = getProviderIconAttachPageUrl(
      context && context.provider ? context.provider : null,
      iconUrl,
      iconHost
    );
    if (!pageUrl) {
      return false;
    }
    const hostKey = iconHost || getHostFromUrl(pageUrl);
    const candidates = getPageFaviconRenderCandidates(pageUrl, iconUrl, { allowRemoteImage: true }) || {};
    const primaryUrl = isFaviconProxyUrl(iconUrl)
      ? (candidates.primaryUrl || iconUrl)
      : iconUrl;
    attachFaviconWithFallbacks(icon, pageUrl, hostKey, {
      primaryUrl,
      allowRemoteImage: true,
      browserUrl: candidates.browserUrl || '',
      onUnavailable: context && context.onIconUnavailable
    });
    return true;
  }

  const attachInputModeFaviconData =
    SHORTCUT_FAVICON.createSiteSearchProviderIconHydrator(attachFaviconData);

  function beginSiteSearchProviderLoad(loader, options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (settings.invalidate === true) {
      siteSearchProvidersLoadVersion += 1;
      siteSearchProvidersLoadPromise = null;
    }
    const loadVersion = siteSearchProvidersLoadVersion;
    let loadTask = null;
    loadTask = Promise.resolve().then(() => loader()).then((items) => {
      const normalizedItems = Array.isArray(items) ? items : [];
      if (loadVersion === siteSearchProvidersLoadVersion &&
          siteSearchProvidersLoadPromise === loadTask) {
        siteSearchProvidersCache = normalizedItems;
        return normalizedItems;
      }
      return siteSearchProvidersCache || [];
    }).catch(() => {
      if (loadVersion === siteSearchProvidersLoadVersion &&
          siteSearchProvidersLoadPromise === loadTask) {
        siteSearchProvidersCache = null;
      }
      return siteSearchProvidersCache || [];
    }).finally(() => {
      if (siteSearchProvidersLoadPromise === loadTask) {
        siteSearchProvidersLoadPromise = null;
      }
    });
    siteSearchProvidersLoadPromise = loadTask;
    return {
      promise: loadTask,
      version: loadVersion
    };
  }

  function getSiteSearchProviders() {
    if (siteSearchProvidersLoadPromise) {
      return siteSearchProvidersLoadPromise;
    }
    if (siteSearchProvidersCache) {
      return Promise.resolve(siteSearchProvidersCache);
    }
    return beginSiteSearchProviderLoad(() => SITE_SEARCH_STORE.loadSiteSearchProviders({
      chromeApi: chrome,
      storageArea,
      storageKeys: {
        custom: SITE_SEARCH_STORAGE_KEY,
        disabled: SITE_SEARCH_DISABLED_STORAGE_KEY
      },
      defaultProviders: defaultSiteSearchProviders,
      mergeCustomProviders: SEARCH_UTILS.mergeCustomProviders,
      getResourceUrl: getExtensionResourceUrl
    })).promise;
  }

  function reloadSiteSearchProvidersFromStorage() {
    return beginSiteSearchProviderLoad(() => {
      const keys = [SITE_SEARCH_STORAGE_KEY, SITE_SEARCH_DISABLED_STORAGE_KEY];
      const readTask = SITE_SEARCH_STORE.getStorageValues(storageArea, keys);
      return readTask.then((result) => {
        const customItems = Array.isArray(result[SITE_SEARCH_STORAGE_KEY])
          ? result[SITE_SEARCH_STORAGE_KEY]
          : [];
        const disabledKeys = Array.isArray(result[SITE_SEARCH_DISABLED_STORAGE_KEY])
          ? result[SITE_SEARCH_DISABLED_STORAGE_KEY]
          : [];
        return SITE_SEARCH_STORE.mergeStoredProviders(
          defaultSiteSearchProviders,
          customItems,
          disabledKeys,
          SEARCH_UTILS.mergeCustomProviders
        );
      });
    }, { invalidate: true });
  }

  function getAggregateSearches() {
    if (aggregateSearchesCache) {
      return Promise.resolve(aggregateSearchesCache);
    }
    if (aggregateSearchesLoadPromise) {
      return aggregateSearchesLoadPromise;
    }
    const loadVersion = aggregateSearchesLoadVersion;
    const loadTask = AGGREGATE_SEARCH_STORE.loadAggregateSearches(
      storageArea,
      AGGREGATE_SEARCH_STORAGE_KEY,
      chrome
    ).then((items) => {
      if (loadVersion === aggregateSearchesLoadVersion) {
        aggregateSearchesCache = items;
        return items;
      }
      return aggregateSearchesCache || [];
    }).catch(() => {
      if (loadVersion === aggregateSearchesLoadVersion) {
        aggregateSearchesCache = null;
        return [];
      }
      return aggregateSearchesCache || [];
    }).finally(() => {
      if (aggregateSearchesLoadPromise === loadTask) {
        aggregateSearchesLoadPromise = null;
      }
    });
    aggregateSearchesLoadPromise = loadTask;
    return loadTask;
  }

  function createAggregateSearchScopeProvider(definition) {
    return AGGREGATE_SEARCH_STORE.createScopeProvider(definition);
  }

  function getSiteSearchDisplayName(provider) {
    if (!provider) {
      return t('site_search_default', '站内');
    }
    const mapping = SEARCH_UTILS.getSiteSearchProviderDisplayNameMessage(provider);
    if (mapping) {
      return t(mapping.messageKey, mapping.fallback);
    }
    return provider.name || provider.key || t('site_search_default', '站内');
  }

  function getSiteSearchActionTitle(provider, query) {
    const site = getSiteSearchDisplayName(provider);
    const queryText = String(query || '').trim();
    if (isAggregateSearchProvider(provider)) {
      return queryText
        ? formatMessage('aggregate_search_action_query', '使用{name}搜索“{query}”', {
            name: site,
            query: queryText
          })
        : formatMessage('aggregate_search_action', '使用{name}搜索', { name: site });
    }
    if (isAiSiteSearchProvider(provider)) {
      return queryText
        ? formatMessage('ask_ai_provider_query', '向 {site} 提问 "{query}"', { site, query: queryText })
        : formatMessage('ask_ai_provider', '向 {site} 提问', { site });
    }
    return queryText
      ? formatMessage('search_in_site_query', '在 {site} 中搜索 "{query}"', { site, query: queryText })
      : formatMessage('search_in_site', '在 {site} 中搜索', { site });
  }

  function getSiteSearchPrefixText(provider) {
    if (isAiSiteSearchProvider(provider)) {
      return getSiteSearchDisplayName(provider);
    }
    return getSiteSearchDisplayName(provider) || formatMessage('search_in_site', '在 {site} 中搜索', {
      site: provider && provider.name ? provider.name : ''
    });
  }

  function findProviderForSuggestionMatch(suggestion, providers) {
    return SEARCH_UTILS.findProviderForSiteSearchSuggestion(suggestion, providers);
  }

  function getInlineSiteSearchCandidate(input, providers) {
    return SEARCH_UTILS.getInlineSiteSearchCandidate(input, providers);
  }

  function promoteStrongNavigationMatch(list, rawQuery) {
    return SEARCH_UTILS.promoteStrongNavigationMatch(list, rawQuery, {
      getDirectNavigationUrl,
      getUrlDisplay
    });
  }

  function getKeywordSearchSuggestionState(list) {
    return SEARCH_UTILS.getKeywordSearchSuggestionState(list);
  }

  function matchesTopSitePrefix(suggestion, input) {
    if (!suggestion || !(suggestion.type === 'topSite' || suggestion.isTopSite)) {
      return false;
    }
    const query = String(input || '').trim().toLowerCase();
    if (!query) {
      return false;
    }
    const titleText = String(suggestion.title || '').toLowerCase();
    if (titleText.startsWith(query)) {
      return true;
    }
    const urlText = getUrlDisplay(suggestion.url || '');
    if (!urlText) {
      return false;
    }
    const host = urlText.split('/')[0] || '';
    return host.toLowerCase().startsWith(query);
  }

  function getTopSiteMatchCandidate(list, input) {
    if (!Array.isArray(list)) {
      return null;
    }
    const query = String(input || '').trim();
    if (!query || /\s/.test(query)) {
      return null;
    }
    let fallback = null;
    for (let i = 0; i < list.length; i += 1) {
      const suggestion = list[i];
      if (!suggestion || !(suggestion.type === 'topSite' || suggestion.isTopSite)) {
        continue;
      }
      const urlText = getUrlDisplay(suggestion.url || '');
      const host = urlText ? (urlText.split('/')[0] || '') : '';
      if (host && host.toLowerCase().startsWith(query.toLowerCase())) {
        return suggestion;
      }
      if (!fallback && matchesTopSitePrefix(suggestion, query)) {
        fallback = suggestion;
      }
    }
    return fallback;
  }

  function promoteTopSiteMatch(list, queryText) {
    const match = getTopSiteMatchCandidate(list, queryText);
    if (!match) {
      return null;
    }
    const matchIndex = list.indexOf(match);
    const firstResultIndex = Array.isArray(list)
      ? list.findIndex((item) => item && item.type !== 'newtab')
      : -1;
    if (matchIndex !== firstResultIndex) {
      return null;
    }
    if (matchIndex > 0) {
      const [picked] = list.splice(matchIndex, 1);
      list.unshift(picked);
      return picked;
    }
    if (matchIndex === 0) {
      return list[0];
    }
    return null;
  }

  function getProviderHost(provider) {
    return SEARCH_UTILS.getSiteSearchProviderHost(provider);
  }

  function getSiteSearchTriggerCandidate(input, providers, topSiteMatch) {
    return SEARCH_UTILS.getSiteSearchTriggerCandidate(input, providers, topSiteMatch, {
      matchesTopSitePrefix
    });
  }

  function normalizeEnabledSearchResultSourceTypes(value) {
    return SETTINGS.normalizeSearchResultSourceTypes(value);
  }

  function normalizeSearchResultDisplayLimit(value) {
    return SETTINGS.normalizeSearchResultDisplayLimit(value);
  }

  function getLocalSearchScopeCandidate(input, rules) {
    const scope = SEARCH_UTILS.findLocalSearchScope(input, rules);
    if (!scope || !enabledSearchResultSourceTypes.includes(scope.sourceType)) {
      return null;
    }
    return scope;
  }

  function getLocalSearchScopeLabel(scope) {
    const sourceType = scope && scope.sourceType ? scope.sourceType : '';
    if (sourceType === 'bookmark') {
      return t('search_tag_bookmark', '书签');
    }
    if (sourceType === 'history') {
      return t('search_tag_history', '历史');
    }
    if (sourceType === 'topSite') {
      return t('search_tag_top_site', '常用');
    }
    return '';
  }

  function getLocalSearchScopeIconClass(sourceType) {
    if (sourceType === 'bookmark') {
      return 'ri-bookmark-3-line';
    }
    if (sourceType === 'history') {
      return 'ri-history-line';
    }
    return 'ri-star-line';
  }

  function getSearchModeProviderId(provider) {
    return `provider:${provider && (provider.key || provider.name) ? (provider.key || provider.name) : ''}`;
  }

  function getDefaultSearchModeProvider(providers) {
    return SEARCH_UTILS.getSearchEngineSiteSearchProvider(
      defaultSearchEngineState,
      providers
    );
  }

  function getSearchModeProviders() {
    const providers = (siteSearchProvidersCache && siteSearchProvidersCache.length > 0)
      ? siteSearchProvidersCache
      : defaultSiteSearchProviders;
    const defaultProvider = getDefaultSearchModeProvider(providers);
    if (!defaultProvider || providers.some((provider) => (
      getSearchModeProviderId(provider) === getSearchModeProviderId(defaultProvider)
    ))) {
      return providers;
    }
    return [defaultProvider].concat(providers);
  }

  function isAggregateSearchDefinitionAvailable(definition, providers) {
    return AGGREGATE_SEARCH_STORE.isAggregateSearchAvailable(
      definition,
      Array.isArray(providers) ? providers : getSearchModeProviders()
    );
  }

  function getSearchTriggerProviders(providers, definitions) {
    const sourceProviders = Array.isArray(providers) ? providers : [];
    const availableDefinitions = (Array.isArray(definitions) ? definitions : [])
      .filter((definition) => isAggregateSearchDefinitionAvailable(
        definition,
        sourceProviders
      ));
    return AGGREGATE_SEARCH_STORE.mergeTriggerProviders(
      sourceProviders,
      availableDefinitions
    );
  }

  function buildSearchModeMenuItems() {
    const engineGroup = t('search_scope_group_engines', '搜索引擎');
    const localGroup = t('search_scope_group_local', '浏览器内容');
    const aiGroup = t('search_scope_group_ai', 'AI 搜索');
    const siteGroup = t('search_scope_group_sites', '站内搜索');
    const aggregateGroup = t('search_scope_group_aggregates', '聚合搜索');
    const items = [];
    const providers = getSearchModeProviders();
    (aggregateSearchesCache || []).forEach((definition) => {
      if (!isAggregateSearchDefinitionAvailable(definition, providers)) {
        return;
      }
      const provider = createAggregateSearchScopeProvider(definition);
      if (!provider) {
        return;
      }
      items.push({
        id: `aggregate:${definition.id}`,
        kind: 'aggregate',
        aggregate: definition,
        provider,
        label: definition.name,
        group: aggregateGroup,
        iconClass: 'ri-stack-line',
        searchTerms: [definition.name].concat(definition.sourceRefs || []),
        active: Boolean(
          isAggregateSearchProvider(siteSearchState) &&
          String(siteSearchState.aggregateId || '') === String(definition.id || '')
        )
      });
    });
    providers
      .filter((provider) => isSearchEngineSiteSearchProvider(provider))
      .concat(providers.filter((provider) => (
        !isSearchEngineSiteSearchProvider(provider) && !isAiSiteSearchProvider(provider)
      )))
      .concat(providers.filter((provider) => isAiSiteSearchProvider(provider)))
      .forEach((provider) => {
        const isAi = isAiSiteSearchProvider(provider);
        const isSearchEngine = isSearchEngineSiteSearchProvider(provider);
        items.push({
          id: getSearchModeProviderId(provider),
          kind: 'provider',
          provider,
          label: getSiteSearchDisplayName(provider),
          group: isSearchEngine ? engineGroup : (isAi ? aiGroup : siteGroup),
          iconUrl: getProviderIcon(provider),
          iconClass: isAi ? 'ri-search-ai-line' : 'ri-global-line',
          isAi,
          active: Boolean(siteSearchState && getSearchModeProviderId(siteSearchState) === getSearchModeProviderId(provider))
        });
      });
    ['topSite', 'bookmark', 'history'].forEach((sourceType) => {
      if (!enabledSearchResultSourceTypes.includes(sourceType)) {
        return;
      }
      items.push({
        id: `local:${sourceType}`,
        kind: 'local',
        sourceType,
        label: getLocalSearchScopeLabel({ sourceType }),
        searchTerms: sourceType === 'topSite'
          ? ['top sites', 'frequent sites', 'favorites']
          : (sourceType === 'bookmark'
            ? ['bookmark', 'bookmarks']
            : ['history', 'browsing history']),
        group: localGroup,
        iconClass: getLocalSearchScopeIconClass(sourceType),
        menuIconName: sourceType === 'topSite' ? 'star' : sourceType,
        active: Boolean(localSearchScopeState && localSearchScopeState.sourceType === sourceType)
      });
    });
    return items;
  }

  function getSearchModeMenuItems() {
    return Promise.all([
      loadSiteSearchIconCache(),
      getSiteSearchProviders(),
      getAggregateSearches()
    ]).then(buildSearchModeMenuItems);
  }

  function openSearchModeMenuFromDoubleTab() {
    const expectedInputValue = String(inputParts.input.value || '');
    const activateDefaultProvider = (providers) => {
      if (!inputModeController || siteSearchState || localSearchScopeState ||
          String(inputParts.input.value || '') !== expectedInputValue) {
        return false;
      }
      const provider = getDefaultSearchModeProvider(providers);
      if (!provider) {
        return false;
      }
      if (expectedInputValue.trim()) {
        activateSiteSearch(provider, {
          preserveResults: shouldPreserveSearchModeResults(expectedInputValue)
        });
        restoreSearchModeQuery(expectedInputValue);
      } else {
        activateSiteSearch(provider);
      }
      inputModeController.openModeMenu('none');
      return true;
    };
    if (siteSearchProvidersCache) {
      return activateDefaultProvider(siteSearchProvidersCache);
    }
    return getSiteSearchProviders().then(
      activateDefaultProvider,
      () => activateDefaultProvider(defaultSiteSearchProviders)
    );
  }

  function restoreSearchModeQuery(rawQuery) {
    const value = String(rawQuery || '');
    inputParts.input.value = value;
    latestRawQuery = value;
    latestQuery = value.trim();
    inputParts.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function shouldPreserveSearchModeResults(rawQuery) {
    return Boolean(String(rawQuery || '').trim());
  }

  function selectSearchModeMenuItem(item) {
    if (!item || !item.kind) {
      return;
    }
    const rawQuery = inputParts.input.value || '';
    const preserveResults = shouldPreserveSearchModeResults(rawQuery);
    if (item.kind === 'local') {
      activateLocalSearchScope(
        { sourceType: item.sourceType },
        { preserveResults }
      );
      restoreSearchModeQuery(rawQuery);
      return;
    }
    if (item.kind === 'aggregate' && item.provider) {
      activateSiteSearch(item.provider, { preserveResults });
      restoreSearchModeQuery(rawQuery);
      return;
    }
    if (item.kind === 'provider' && item.provider) {
      activateSiteSearch(item.provider, { preserveResults });
      restoreSearchModeQuery(rawQuery);
    }
  }

  function getLocalSearchScopeTabHintProvider(scope) {
    const source = getLocalSearchScopeLabel(scope);
    return {
      name: source,
      tabHintLabel: formatMessage(
        'local_search_tab_hint',
        '仅搜索{source}',
        { source }
      )
    };
  }

  function setLocalSearchScopePrefix(scope) {
    if (!inputModeController || !scope) {
      return;
    }
    inputModeController.setPrefixText(
      getLocalSearchScopeLabel(scope),
      defaultTheme,
      {
        animate: true,
        iconClass: getLocalSearchScopeIconClass(scope.sourceType),
        menuIconName: scope.sourceType === 'topSite' ? 'star' : scope.sourceType,
        modeId: `local:${scope.sourceType}`
      }
    );
  }

  function activateLocalSearchScope(scope, activationOptions) {
    if (!scope || !enabledSearchResultSourceTypes.includes(scope.sourceType)) {
      return false;
    }
    const options = activationOptions && typeof activationOptions === 'object'
      ? activationOptions
      : {};
    suggestionRequestSeq += 1;
    localSearchScopeState = scope;
    localSearchScopeTriggerState = null;
    siteSearchState = null;
    siteSearchTriggerState = null;
    inlineSearchState = null;
    inputParts.input.value = '';
    latestRawQuery = '';
    latestQuery = '';
    clearAutocomplete();
    setLocalSearchScopePrefix(scope);
    if (options.preserveResults !== true) {
      clearSearchSuggestions();
    }
    return true;
  }

  function clearLocalSearchScope() {
    if (!localSearchScopeState) {
      return false;
    }
    suggestionRequestSeq += 1;
    localSearchScopeState = null;
    localSearchScopeTriggerState = null;
    inlineSearchState = null;
    clearSiteSearchPrefix();
    clearAutocomplete();
    return true;
  }

  function activateSiteSearch(provider, activationOptions) {
    if (!provider) {
      return;
    }
    const options = activationOptions && typeof activationOptions === 'object'
      ? activationOptions
      : {};
    localSearchScopeState = null;
    localSearchScopeTriggerState = null;
    siteSearchState = provider;
    inlineSearchState = null;
    inputParts.input.value = '';
    latestRawQuery = '';
    latestQuery = '';
    clearAutocomplete();
    setSiteSearchPrefix(provider, defaultTheme, {
      animate: options.animatePrefix !== false
    });
    getThemeForProvider(provider).then((theme) => {
      if (siteSearchState === provider) {
        setSiteSearchPrefix(provider, theme);
      }
    });
    if (options.preserveResults !== true) {
      clearSearchSuggestions();
    }
  }

  function clearSiteSearch() {
    if (!siteSearchState) {
      return;
    }
    siteSearchState = null;
    inlineSearchState = null;
    clearSiteSearchPrefix();
    clearAutocomplete();
  }

  function getBrowserPageSuggestionTitle(browserProfile, targetUrl) {
    const browserName = browserProfile && browserProfile.name ? browserProfile.name : '';
    if (browserName) {
      return formatMessage('open_browser_url', '打开 {browser}：{url}', {
        browser: browserName,
        url: targetUrl
      });
    }
    return formatMessage('open_url', '打开 {url}', { url: targetUrl });
  }

  function getShortcutRules() {
    if (window._x_extension_shortcut_rules_2024_unique_) {
      return Promise.resolve(window._x_extension_shortcut_rules_2024_unique_);
    }
    if (window._x_extension_shortcut_rules_promise_2024_unique_) {
      return window._x_extension_shortcut_rules_promise_2024_unique_;
    }
    const rulesUrl = getExtensionResourceUrl('assets/data/shortcut-rules.json');
    const rulesPromise = fetch(rulesUrl)
      .then((response) => response.json())
      .then((data) => {
        const items = data && Array.isArray(data.items) ? data.items : [];
        window._x_extension_shortcut_rules_2024_unique_ = items;
        return items;
      })
      .catch(() => new Promise((resolve) => {
        if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
          window._x_extension_shortcut_rules_2024_unique_ = [];
          resolve([]);
          return;
        }
        chrome.runtime.sendMessage({ action: 'getShortcutRules' }, (response) => {
          const items = response && Array.isArray(response.items) ? response.items : [];
          window._x_extension_shortcut_rules_2024_unique_ = items;
          resolve(items);
        });
      }));
    window._x_extension_shortcut_rules_promise_2024_unique_ = rulesPromise;
    return rulesPromise;
  }

  function buildKeywordSuggestions(input, rules) {
    const queryLower = input.toLowerCase();
    const browserProfile = BROWSER_PROFILE.getBrowserInternalProfile(navigator);
    const scheme = browserProfile.scheme;
    const matches = [];
    rules.forEach((rule) => {
      if (!rule || !Array.isArray(rule.keys)) {
        return;
      }
      const isMatch = rule.keys.some((key) => queryLower.startsWith(key));
      if (!isMatch) {
        return;
      }
      if (rule.type === 'browserPage' && rule.path) {
        const targetUrl = `${scheme}${rule.path}`;
        matches.push({
          type: 'browserPage',
          title: getBrowserPageSuggestionTitle(browserProfile, targetUrl),
          url: targetUrl,
          favicon: getPageFaviconCandidateUrl(targetUrl) ||
            'https://img.icons8.com/?size=100&id=1LqgD1Q7n2fy&format=png&color=000000'
        });
      } else if (rule.type === 'url' && rule.url) {
        matches.push({
          type: 'browserPage',
          title: formatMessage('open_url', '打开 {url}', { url: rule.url }),
          url: rule.url,
          favicon: getPageFaviconCandidateUrl(rule.url) ||
            'https://img.icons8.com/?size=100&id=1LqgD1Q7n2fy&format=png&color=000000'
        });
      }
    });
    return matches;
  }

  function getDirectUrlSuggestion(input) {
    const targetUrl = getDirectNavigationUrl(input);
    if (!targetUrl) {
      return null;
    }
    const suggestion = {
      type: 'directUrl',
      title: formatMessage('open_url', '打开 {url}', { url: targetUrl }),
      url: targetUrl,
      favicon: getPageFaviconCandidateUrl(targetUrl)
    };
    const matchedTab = getMatchedOpenTabForSuggestion(suggestion);
    if (!matchedTab) {
      return suggestion;
    }
    return {
      ...suggestion,
      title: String(matchedTab.title || '').trim() || suggestion.title,
      favicon: String(matchedTab.favIconUrl || '').trim() || suggestion.favicon,
      _xMatchedTabId: matchedTab.id
    };
  }

  function getDirectNavigationUrl(input) {
    return SEARCH_UTILS.getDirectNavigationUrl(input);
  }

  function normalizeTabMatchUrl(url) {
    return SEARCH_UTILS.buildTabMatchUrl(url);
  }

  function getMatchedOpenTabForSuggestion(suggestion) {
    if (!suggestion || !suggestion.url || !Array.isArray(tabs) || tabs.length === 0) {
      return null;
    }
    const target = normalizeTabMatchUrl(suggestion.url);
    if (!target) {
      return null;
    }
    for (let i = 0; i < tabs.length; i += 1) {
      const tab = tabs[i];
      if (!tab || typeof tab.id !== 'number' || !tab.url) {
        continue;
      }
      const current = normalizeTabMatchUrl(tab.url);
      if (current && current === target) {
        return tab;
      }
    }
    return null;
  }

  function getMatchedOpenTabIdForSuggestion(suggestion) {
    const matchedTab = getMatchedOpenTabForSuggestion(suggestion);
    return matchedTab ? matchedTab.id : null;
  }

  function shouldSwitchMatchedTabSuggestion(suggestion) {
    if (!suggestion || typeof suggestion._xMatchedTabId !== 'number') {
      return false;
    }
    if (!openTabQuickSwitchEnabled) {
      return false;
    }
    return true;
  }

  function shouldUseNewTabForSwitchAction(suggestion, event, item) {
    if (!event || !event.shiftKey) {
      return false;
    }
    const action = item && item._xVisitButtonAction ? item._xVisitButtonAction : 'switch';
    return SUGGESTION_ACTION_MODEL.shouldOpenSwitchActionInNewTab(suggestion, {
      action,
      openSwitchInNewTab: true
    });
  }

  function shouldOpenSearchResultInBackgroundTab(event) {
    const config = {
      openInBackgroundTab: isBackgroundOpenEvent(event),
      openInCurrentTab: Boolean(event && event.altKey)
    };
    return SUGGESTION_ACTION_MODEL.getSearchResultOpenDisposition(config) === 'backgroundTab';
  }

  function getSearchResultNewTabDisposition(event) {
    return shouldOpenSearchResultInBackgroundTab(event) ? 'backgroundTab' : 'newTab';
  }

  function openSearchResultUrl(suggestion, query, event) {
    if (!suggestion || !suggestion.url) {
      return false;
    }
    recordSearchSuggestionSelection(suggestion, query);
    if (shouldOpenSearchResultInBackgroundTab(event)) {
      chrome.runtime.sendMessage({
        action: 'createTab',
        url: suggestion.url,
        disposition: 'backgroundTab'
      });
      return true;
    }
    navigateToUrl(suggestion.url);
    return true;
  }

  function openMatchedTabSuggestion(suggestion, event, item, query) {
    if (shouldUseNewTabForSwitchAction(suggestion, event, item) ||
        shouldOpenSearchResultInBackgroundTab(event)) {
      recordSearchSuggestionSelection(suggestion, query);
      chrome.runtime.sendMessage({
        action: 'createTab',
        url: suggestion.url,
        disposition: getSearchResultNewTabDisposition(event)
      });
      return;
    }
    chrome.runtime.sendMessage({
      action: 'switchToTab',
      tabId: suggestion._xMatchedTabId
    });
  }

  function refreshTabsForSearchContext(callback) {
    if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      if (typeof callback === 'function') {
        callback(false);
      }
      return;
    }
    const request = { action: 'getTabsForOverlay' };
    if (typeof currentNewtabTabId === 'number') {
      request.currentTabId = currentNewtabTabId;
    }
    let settled = false;
    let timeout = null;
    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      if (typeof callback === 'function') {
        callback(ok);
      }
    };
    timeout = setTimeout(() => finish(false), 240);
    chrome.runtime.sendMessage(request, (response) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        finish(false);
        return;
      }
      tabs = response && Array.isArray(response.tabs) ? response.tabs : [];
      currentNewtabTabId = response && typeof response.currentTabId === 'number'
        ? response.currentTabId
        : null;
      finish(true);
    });
  }

  // Warm the tab snapshot before the first URL input so a matched page can render
  // with its final title and switch action on the first visible frame.
  refreshTabsForSearchContext(() => {});

  function resolveQuickNavigation(query) {
    const directUrlSuggestion = getDirectUrlSuggestion(query);
    if (directUrlSuggestion) {
      return Promise.resolve(directUrlSuggestion.url);
    }
    return getShortcutRules().then((rules) => {
      const keywordSuggestions = buildKeywordSuggestions(query, rules);
      if (keywordSuggestions.length > 0) {
        return keywordSuggestions[0].url;
      }
      return null;
    });
  }

  suggestionsView = NEWTAB_SUGGESTIONS_VIEW.createSuggestionsView({
    document,
    container: suggestionsContainer,
    items: suggestionItems,
    t,
    formatMessage,
    getRiSvg,
    sanitizeDisplayText,
    formatTabRankDebugText,
    isTabRankScoreDebugEnabled: () => tabRankScoreDebugEnabled,
    shouldBlockFaviconForHost,
    isLocalNetworkHost,
    getHostFromUrl,
    getUrlDisplay,
    isSimpleModeEnabled: () => simpleModeEnabled,
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
    onSetSelectedIndex: (nextIndex) => {
      selectedIndex = nextIndex;
    },
    getSelectedIndex: () => selectedIndex,
    onSwitchToTab: (tab, event) => {
      if (shouldOpenSearchResultInBackgroundTab(event) && tab && tab.url) {
        chrome.runtime.sendMessage({
          action: 'createTab',
          url: tab.url,
          disposition: 'backgroundTab'
        });
        return;
      }
      chrome.runtime.sendMessage({
        action: 'switchToTab',
        tabId: tab.id
      });
    },
    onActivateSuggestion: activateRenderedSuggestion,
    onDeleteHistory: deleteRenderedHistorySuggestion,
    onCopyUrl: copySearchResultUrl,
    showTopActionTooltip,
    hideTopActionTooltip,
    bindCursorTooltip,
    getSearchActionLabel,
    getSiteSearchDisplayName,
    isAiSiteSearchProvider,
    getDefaultSearchEngineThemeUrl,
    getBrandAccentForUrl,
    buildThemeFromAccent,
    actionModel: SUGGESTION_ACTION_MODEL,
    shouldSwitchMatchedTabSuggestion,
    defaultTheme,
    urlHighlightTheme,
    openTabSuggestionLimit: NEWTAB_OPEN_TAB_SUGGESTION_LIMIT
  });
  let openInCurrentTabModifierActive = false;
  let openSwitchInNewTabModifierActive = false;
  let openInBackgroundTabModifierActive = false;

  function setSuggestionActionModifiersActive(openInCurrentTabActive, openSwitchInNewTabActive, openInBackgroundTabActive) {
    const nextOpenInCurrentTabActive = Boolean(openInCurrentTabActive);
    const nextOpenSwitchInNewTabActive = Boolean(openSwitchInNewTabActive);
    const nextOpenInBackgroundTabActive = Boolean(openInBackgroundTabActive);
    if (openInCurrentTabModifierActive === nextOpenInCurrentTabActive &&
        openSwitchInNewTabModifierActive === nextOpenSwitchInNewTabActive &&
        openInBackgroundTabModifierActive === nextOpenInBackgroundTabActive) {
      return;
    }
    openInCurrentTabModifierActive = nextOpenInCurrentTabActive;
    openSwitchInNewTabModifierActive = nextOpenSwitchInNewTabActive;
    openInBackgroundTabModifierActive = nextOpenInBackgroundTabActive;
    if (suggestionsView && typeof suggestionsView.setOpenInCurrentTabModifierActive === 'function') {
      suggestionsView.setOpenInCurrentTabModifierActive(nextOpenInCurrentTabActive);
    }
    if (suggestionsView && typeof suggestionsView.setOpenSwitchInNewTabModifierActive === 'function') {
      suggestionsView.setOpenSwitchInNewTabModifierActive(nextOpenSwitchInNewTabActive);
    }
    if (suggestionsView && typeof suggestionsView.setOpenInBackgroundTabModifierActive === 'function') {
      suggestionsView.setOpenInBackgroundTabModifierActive(nextOpenInBackgroundTabActive);
    }
  }

  function syncSuggestionActionModifiersFromEvent(event) {
    setSuggestionActionModifiersActive(
      Boolean(event && event.altKey),
      Boolean(event && event.shiftKey),
      Boolean(event && (event.metaKey || event.ctrlKey) && !numberShortcutInstantEnabled)
    );
  }

  function getAutoHighlightIndex() {
    return suggestionsView.getAutoHighlightIndex();
  }

  function getSuggestionUpdateKind(options) {
    return SUGGESTION_ACTION_MODEL.getSuggestionUpdateKind({
      ...(options || {}),
      includeDebugReasons: Boolean(tabRankScoreDebugEnabled)
    });
  }

  function getSuggestionActionContextKey(options) {
    return SUGGESTION_ACTION_MODEL.getActionContextKey(options);
  }

  function updateSelection() {
    if (!suggestionsView) {
      return;
    }
    suggestionsView.updateSelection(selectedIndex);
  }

  function activateRenderedSuggestion(suggestion, query, event, index, item) {
    if (suggestion.type === 'commandNewTab') {
      chrome.runtime.sendMessage({ action: 'openNewTab' });
      return;
    }
    if (suggestion.type === 'commandSettings') {
      chrome.runtime.sendMessage({ action: 'openOptionsPage' });
      return;
    }
    if (suggestion.type === 'siteSearchPrompt' && suggestion.provider) {
      activateSiteSearch(suggestion.provider);
      focusSearchInputPreservingScroll();
      return;
    }
    if (suggestion.type === 'modeSwitch') {
      setVisibleThemeMode(suggestion.nextMode);
      focusSearchInputPreservingScroll();
      return;
    }
    if (suggestion.type === 'zenSwitch') {
      setZenModeEnabled(suggestion.nextEnabled);
      focusSearchInputPreservingScroll();
      return;
    }
    if (Number.isInteger(index) && shouldSwitchMatchedTabSuggestion(suggestion, index)) {
      openMatchedTabSuggestion(suggestion, event, item, query);
      return;
    }
    if (suggestion.provider && suggestion.searchQuery) {
      runSiteSearchProviderQuery(
        suggestion.provider,
        suggestion.searchQuery,
        shouldOpenSearchResultInBackgroundTab(event) ? 'backgroundTab' : 'currentTab'
      );
      return;
    }
    if (shouldOpenSearchResultInBackgroundTab(event) && suggestion.url) {
      openSearchResultUrl(suggestion, query, event);
      return;
    }
    if (suggestion.forceSearch && suggestion.searchQuery) {
      navigateToQuery(suggestion.searchQuery, true);
      return;
    }
    openSearchResultUrl(suggestion, query, event);
  }

  function deleteRenderedHistorySuggestion(suggestion) {
    chrome.runtime.sendMessage({
      action: 'deleteHistoryUrl',
      url: suggestion.url
    }, function(response) {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      if (!response || response.ok !== true) {
        return;
      }
      const refreshQuery = latestQuery || (inputParts && inputParts.input ? String(inputParts.input.value || '').trim() : '');
      if (!refreshQuery) {
        clearSearchSuggestions();
        return;
      }
      requestSuggestions(refreshQuery, { immediate: true });
    });
  }

  function scrollSelectedSuggestionIntoView(direction, didWrap) {
    if (!suggestionsContainer || selectedIndex < 0) {
      return;
    }
    const item = suggestionItems[selectedIndex];
    SUGGESTION_NAVIGATION.scrollItemIntoView(suggestionsContainer, item, {
      direction,
      didWrap,
      inset: 8
    });
  }

  function renderTabSuggestions(tabList) {
    currentSuggestions = [];
    lastRenderedQuery = '';
    lastRenderedActionContextKey = '';
    suggestionsView.renderTabs(tabList);
  }

  function requestTabsAndRender() {
    tabs = [];
    clearSearchSuggestions();
  }

  function refreshTabsIfIdle() {
    if (!latestQuery || !latestQuery.trim()) {
      refreshTabsForSearchContext(() => {});
      clearSearchSuggestions();
    }
  }

  function clearSearchSuggestions() {
    directNavigationSettleController.cancel();
    inlineSearchState = null;
    siteSearchTriggerState = null;
    localSearchScopeTriggerState = null;
    clearSiteSearchTabHint();
    suggestionsView.clear();
    currentSuggestions = [];
    lastSuggestionResponse = [];
    selectedIndex = -1;
    lastRenderedQuery = '';
    lastRenderedActionContextKey = '';
  }

  function dismissSearchSuggestionsFromBackground() {
    restoreUserAuthoredSearchInput();
    searchSuggestionsDismissed = true;
    suggestionRequestSeq += 1;
    if (remoteSuggestionDebounceTimer) {
      clearTimeout(remoteSuggestionDebounceTimer);
      remoteSuggestionDebounceTimer = null;
    }
    if (suggestionRequestWatchdogTimer) {
      clearTimeout(suggestionRequestWatchdogTimer);
      suggestionRequestWatchdogTimer = null;
    }
    clearSearchSuggestions();
  }

  function restoreDismissedSearchSuggestions() {
    if (!searchSuggestionsDismissed || !inputParts || !inputParts.input) {
      return false;
    }
    const rawValue = String(inputParts.input.value || '');
    const query = rawValue.trim();
    searchSuggestionsDismissed = false;
    if (!query) {
      return false;
    }
    latestRawQuery = rawValue;
    latestQuery = query;
    if (!localSearchScopeState && isSlashCommandInput(query)) {
      renderSuggestions([], query);
      return true;
    }
    requestSuggestions(query, { immediate: true });
    return true;
  }

  function renderSuggestions(suggestions, query) {
    if (searchSuggestionsDismissed) {
      return;
    }
    if (!query) {
      clearSearchSuggestions();
      return;
    }
    lastSuggestionResponse = Array.isArray(suggestions) ? suggestions : [];

    getShortcutRules().then((rules) => {
      if (searchSuggestionsDismissed || query !== latestQuery) {
        return;
      }
      const rawTagInput = (latestRawQuery || inputParts.input.value || '').trim();
      const localSearchQueryModeActive = Boolean(localSearchScopeState && String(query || '').trim());
      const slashCommandModeActive = !localSearchQueryModeActive && isSlashCommandInput(rawTagInput);
      const siteSearchQueryModeActive = !localSearchQueryModeActive &&
        !slashCommandModeActive &&
        Boolean(siteSearchState && String(query || '').trim());
      const modeCommandActive = slashCommandModeActive && !siteSearchQueryModeActive && isModeCommand(rawTagInput);
      const zenCommandActive = slashCommandModeActive && !siteSearchQueryModeActive && isZenCommand(rawTagInput);
      const toggleCommandActive = modeCommandActive || zenCommandActive;
      if (modeCommandActive) {
        if (storageArea) {
          storageArea.get([
            THEME_STORAGE_KEY,
            NEWTAB_THEME_MODE_STORAGE_KEY,
            NEWTAB_THEME_SCOPE_STORAGE_KEY
          ], (result) => {
            globalThemeMode = normalizeThemeMode(result ? result[THEME_STORAGE_KEY] : 'system');
            newtabThemeMode = normalizeNewtabThemeMode(result ? result[NEWTAB_THEME_MODE_STORAGE_KEY] : 'global');
            newtabThemeScope = normalizeNewtabThemeScope(result ? result[NEWTAB_THEME_SCOPE_STORAGE_KEY] : 'global');
            const storedMode = getScopedThemeMode();
            if (storedMode !== currentThemeMode && query === latestQuery) {
              applyThemeMode(storedMode);
              renderSuggestions([], query);
            }
          });
        }
      }
      const commandMatches = (slashCommandModeActive && !toggleCommandActive && !siteSearchQueryModeActive)
        ? getCommandMatches(rawTagInput)
        : [];
      const hasCommand = commandMatches.length > 0;
      const preSuggestions = [];
      if (modeCommandActive) {
        preSuggestions.push(buildModeSuggestion());
      } else if (zenCommandActive) {
        preSuggestions.push(buildZenSuggestion());
      } else if (slashCommandModeActive && !siteSearchQueryModeActive) {
        commandMatches.forEach((command) => {
          preSuggestions.push(buildCommandSuggestion(command));
        });
      } else if (!siteSearchQueryModeActive && !localSearchQueryModeActive) {
        const directUrlSuggestion = getDirectUrlSuggestion(query);
        if (directUrlSuggestion) {
          preSuggestions.push(directUrlSuggestion);
        }
        const keywordSuggestions = buildKeywordSuggestions(query, rules);
        preSuggestions.push(...keywordSuggestions);
      }

      const siteProvidersForTags = (siteSearchProvidersCache && siteSearchProvidersCache.length > 0)
        ? siteSearchProvidersCache
        : defaultSiteSearchProviders;
      const providersForTags = getSearchTriggerProviders(
        siteProvidersForTags,
        aggregateSearchesCache
      );
      if (!siteSearchProvidersCache && !pendingProviderReload) {
        pendingProviderReload = true;
        getSiteSearchProviders().then((items) => {
          pendingProviderReload = false;
          if (query !== latestQuery) {
            return;
          }
          renderSuggestions(lastSuggestionResponse, query);
        });
      }
      const inlineCandidate = (!localSearchQueryModeActive && !slashCommandModeActive &&
          !siteSearchQueryModeActive && !toggleCommandActive && !hasCommand)
        ? getInlineSiteSearchCandidate(rawTagInput, providersForTags)
        : null;
      let inlineSuggestion = null;
      if (inlineCandidate) {
        const inlineUrl = buildSearchUrl(inlineCandidate.provider.template, inlineCandidate.query);
        if (inlineUrl) {
          inlineSuggestion = {
            type: 'inlineSiteSearch',
            title: getSiteSearchActionTitle(inlineCandidate.provider),
            url: inlineUrl,
            favicon: getProviderIcon(inlineCandidate.provider),
            provider: inlineCandidate.provider,
            searchQuery: inlineCandidate.query
          };
        }
      }

      const newTabSuggestion = (localSearchQueryModeActive || slashCommandModeActive ||
          toggleCommandActive || siteSearchQueryModeActive)
        ? null
        : {
          type: 'newtab',
          title: simpleModeEnabled
            ? query
            : formatMessage('search_query', '搜索 "{query}"', {
                query: query
              }),
          url: buildDefaultSearchUrl(query),
          favicon: getDefaultSearchEngineFaviconUrl(),
          searchQuery: query,
          forceSearch: true
        };
      const siteSearchSuggestion = siteSearchQueryModeActive
        ? (() => {
            const aggregateSearch = isAggregateSearchProvider(siteSearchState);
            const siteUrl = aggregateSearch
              ? ''
              : buildSearchUrl(siteSearchState.template, query);
            if (!aggregateSearch && !siteUrl) {
              return null;
            }
            return {
              type: 'siteSearch',
              title: getSiteSearchActionTitle(siteSearchState, query),
              url: siteUrl,
              favicon: aggregateSearch ? '' : getProviderIcon(siteSearchState),
              provider: siteSearchState,
              searchQuery: query
            };
          })()
        : null;

      const defaultSuggestions = [
        ...preSuggestions,
        newTabSuggestion,
        ...suggestions
      ].filter(Boolean);
      let groupedDefaultSuggestions = defaultSuggestions;
      if (searchResultPriorityMode !== 'search') {
        groupedDefaultSuggestions = SEARCH_UTILS.groupSearchSuggestionsByKind(defaultSuggestions, {
          searchFirst: false
        });
      }

      let allSuggestions = localSearchQueryModeActive
        ? suggestions.filter((item) => (
          item &&
          localSearchScopeState &&
          item.type === localSearchScopeState.sourceType
        ))
        : (slashCommandModeActive ? [...preSuggestions] : (siteSearchQueryModeActive
          ? (siteSearchSuggestion ? [siteSearchSuggestion] : [])
          : (toggleCommandActive ? [...preSuggestions] : groupedDefaultSuggestions)));
      allSuggestions.forEach((item) => {
        if (!item || !item.url) {
          return;
        }
        const matchedTabId = getMatchedOpenTabIdForSuggestion(item);
        if (typeof matchedTabId === 'number') {
          item._xMatchedTabId = matchedTabId;
          return;
        }
        if (Object.prototype.hasOwnProperty.call(item, '_xMatchedTabId')) {
          delete item._xMatchedTabId;
        }
      });
      allSuggestions = filterBlacklistedSuggestions(allSuggestions, query);
      const hasDirectUrlSuggestion = preSuggestions.some((suggestion) => (
        suggestion && suggestion.type === 'directUrl'
      ));
      if (searchResultPriorityMode === 'search' &&
          !localSearchQueryModeActive &&
          !slashCommandModeActive &&
          !toggleCommandActive &&
          !siteSearchQueryModeActive &&
          !hasDirectUrlSuggestion) {
        allSuggestions = SEARCH_UTILS.composeSearchFirstSuggestionSlate(allSuggestions, {
          limit: searchResultDisplayLimit
        });
      }

      const keywordSuggestionState = getKeywordSearchSuggestionState(allSuggestions);
      const onlyKeywordSuggestions = keywordSuggestionState.onlyKeywordSuggestions;

      let autocompleteCandidate = null;
      let primaryHighlightIndex = -1;
      let primaryHighlightReason = 'none';
      let strongNavigationMatch = null;
      let topSiteMatch = null;
      let mergedProvider = null;
      let primarySuggestion = null;
      const inlineEnabled = Boolean(inlineSuggestion);
      let siteSearchTrigger = null;
      const preferAutocompleteFirst = searchResultPriorityMode !== 'search';
      if (!localSearchQueryModeActive && !slashCommandModeActive && !toggleCommandActive && !hasCommand) {
        if (!siteSearchState && !inlineEnabled && preferAutocompleteFirst) {
          strongNavigationMatch = promoteStrongNavigationMatch(allSuggestions, latestRawQuery.trim());
          if (strongNavigationMatch) {
            primaryHighlightIndex = 0;
            primaryHighlightReason = 'navigation';
          }
          topSiteMatch = promoteTopSiteMatch(allSuggestions, latestRawQuery.trim());
        }
        siteSearchTrigger = (!siteSearchState && !inlineEnabled)
          ? getSiteSearchTriggerCandidate(rawTagInput, providersForTags, topSiteMatch)
          : null;
        if (!siteSearchState && !inlineEnabled && !strongNavigationMatch && preferAutocompleteFirst && !onlyKeywordSuggestions) {
          autocompleteCandidate = getAutocompleteCandidate(keywordSuggestionState.autocompleteSuggestions, latestRawQuery);
          if (autocompleteCandidate) {
            const candidateIndex = allSuggestions.findIndex((suggestion) => {
              if (!suggestion || suggestion.type === 'newtab') {
                return false;
              }
              if (autocompleteCandidate.url && suggestion.url === autocompleteCandidate.url) {
                return true;
              }
              const suggestionUrlText = getUrlDisplay(suggestion.url);
              if (suggestionUrlText && suggestionUrlText.toLowerCase() === autocompleteCandidate.completion.toLowerCase()) {
                return true;
              }
              if (suggestion.title && suggestion.title.toLowerCase().startsWith(autocompleteCandidate.completion.toLowerCase())) {
                return true;
              }
              return false;
            });
            if (candidateIndex >= 0 && candidateIndex !== 0) {
              const [candidateSuggestion] = allSuggestions.splice(candidateIndex, 1);
              allSuggestions.unshift(candidateSuggestion);
            }
            primaryHighlightIndex = 0;
            primaryHighlightReason = 'autocomplete';
          }
        }
        if (inlineSuggestion) {
          allSuggestions.unshift(inlineSuggestion);
          allSuggestions = filterBlacklistedSuggestions(allSuggestions, query);
          primaryHighlightIndex = 0;
          primaryHighlightReason = 'inline';
        } else if (!strongNavigationMatch && topSiteMatch && preferAutocompleteFirst) {
          primaryHighlightIndex = 0;
          primaryHighlightReason = 'topSite';
        }
        if (preferAutocompleteFirst &&
            !siteSearchState && query && !onlyKeywordSuggestions && openTabQuickSwitchEnabled) {
          const openTabMatch = SEARCH_UTILS.findSearchOpenTabMatchIndex(allSuggestions, {
            rawQuery: latestRawQuery.trim(),
            primaryHighlightIndex,
            currentTabId: currentNewtabTabId,
            openTabQuickSwitchEnabled,
            getDirectNavigationUrl
          });
          if (openTabMatch.index >= 0) {
            if (openTabMatch.index > 0) {
              const [openTabMatchSuggestion] = allSuggestions.splice(openTabMatch.index, 1);
              allSuggestions.unshift(openTabMatchSuggestion);
            }
            primaryHighlightIndex = 0;
            primaryHighlightReason = openTabMatch.reason || 'openTab';
          }
        }
        if (preferAutocompleteFirst) {
          allSuggestions = SEARCH_UTILS.pinExactSearchActionSecond(allSuggestions);
        }
        if (query && primaryHighlightIndex < 0 && allSuggestions.length > 0) {
          primaryHighlightIndex = 0;
          primaryHighlightReason = 'default';
        }
        if (primaryHighlightIndex >= 0) {
          primarySuggestion = allSuggestions[primaryHighlightIndex] || null;
          mergedProvider = findProviderForSuggestionMatch(primarySuggestion, providersForTags);
        }
        if (onlyKeywordSuggestions) {
          clearAutocomplete();
        } else {
          applyAutocomplete(allSuggestions, primarySuggestion, primaryHighlightReason);
        }
        const inlineAutoHighlight = Boolean(inlineSuggestion && primaryHighlightIndex === 0);
        inlineSearchState = inlineSuggestion
          ? {
              url: inlineSuggestion.url,
              provider: inlineSuggestion.provider,
              query: inlineSuggestion.searchQuery || '',
              rawInput: rawTagInput,
              isAuto: inlineAutoHighlight
            }
          : null;
        const resolvedProvider = siteSearchTrigger;
        const resolvedLocalScope = !resolvedProvider
          ? getLocalSearchScopeCandidate(rawTagInput, rules)
          : null;
        siteSearchTriggerState = resolvedProvider
          ? { provider: resolvedProvider, rawInput: rawTagInput }
          : null;
        localSearchScopeTriggerState = resolvedLocalScope
          ? { scope: resolvedLocalScope, rawInput: rawTagInput }
          : null;
        if (siteSearchTriggerState) {
          setSiteSearchTabHint(resolvedProvider);
        } else if (localSearchScopeTriggerState) {
          setSiteSearchTabHint(getLocalSearchScopeTabHintProvider(resolvedLocalScope));
        } else {
          clearSiteSearchTabHint();
        }
      } else if (localSearchQueryModeActive) {
        clearAutocomplete();
        inlineSearchState = null;
        siteSearchTriggerState = null;
        localSearchScopeTriggerState = null;
        clearSiteSearchTabHint();
        if (allSuggestions.length > 0) {
          primaryHighlightIndex = 0;
          primaryHighlightReason = 'localScope';
          primarySuggestion = allSuggestions[0];
        }
      } else if (modeCommandActive) {
        clearAutocomplete();
        inlineSearchState = null;
        siteSearchTriggerState = null;
        localSearchScopeTriggerState = null;
        clearSiteSearchTabHint();
        primaryHighlightIndex = 0;
        primaryHighlightReason = 'modeSwitch';
      } else if (zenCommandActive) {
        clearAutocomplete();
        inlineSearchState = null;
        siteSearchTriggerState = null;
        localSearchScopeTriggerState = null;
        clearSiteSearchTabHint();
        primaryHighlightIndex = 0;
        primaryHighlightReason = 'zenSwitch';
      } else if (slashCommandModeActive) {
        clearAutocomplete();
        inlineSearchState = null;
        siteSearchTriggerState = null;
        localSearchScopeTriggerState = null;
        clearSiteSearchTabHint();
        primaryHighlightIndex = 0;
        primaryHighlightReason = 'command';
      }
      if (hasCommand) {
        applyAutocomplete(allSuggestions, primarySuggestion, primaryHighlightReason);
      }
      allSuggestions = limitSuggestionsForDisplay(allSuggestions, {
        uncapped: slashCommandModeActive
      });
      const emptyMessage = slashCommandModeActive && allSuggestions.length === 0
        ? t('slash_command_empty', '无匹配命令')
        : (localSearchQueryModeActive && allSuggestions.length === 0
          ? t('overlay_empty_result', '无匹配结果')
          : '');

      const actionContextKey = getSuggestionActionContextKey({
        primaryHighlightIndex,
        primaryHighlightReason,
        onlyKeywordSuggestions,
        primarySuggestion,
        mergedProvider,
        emptyMessage
      });
      const updateKind = getSuggestionUpdateKind({
        query,
        lastRenderedQuery,
        actionContextKey,
        lastRenderedActionContextKey,
        currentSuggestions,
        allSuggestions
      });
      const canAppend = updateKind === 'append';
      const startIndex = canAppend ? currentSuggestions.length : 0;

      currentSuggestions = allSuggestions;
      lastRenderedQuery = query;
      lastRenderedActionContextKey = actionContextKey;
      if (updateKind !== 'highlight') {
        warmIconCache(allSuggestions.filter((item) => (
          item && item.type !== 'directUrl'
        )));
      }
      suggestionsView.render({
        suggestions: allSuggestions,
        query,
        updateKind,
        canAppend,
        startIndex,
        primaryHighlightIndex,
        primarySuggestion,
        primaryHighlightReason,
        onlyKeywordSuggestions,
        mergedProvider,
        emptyMessage
      });
      if (updateKind !== 'highlight') {
        updateSelection();
        setSuggestionsVisible(true);
      }
    });
  }

  function renderPendingSuggestions(query, options) {
    renderSuggestions(lastSuggestionResponse, query, options);
  }

  const DIRECT_NAVIGATION_SETTLE_DELAY_MS = 120;
  const directNavigationSettleController =
    NEWTAB_DIRECT_NAVIGATION_SETTLE.createDirectNavigationSettleController({
      delayMs: DIRECT_NAVIGATION_SETTLE_DELAY_MS,
      onSettle: ({ query, requestSeq }) => {
        if (requestSeq !== suggestionRequestSeq || query !== latestQuery) {
          return;
        }
        renderPendingSuggestions(query);
      }
    });

  function requestSuggestions(query, options) {
    latestQuery = query;
    const requestLocalSearchScope = localSearchScopeState;
    if (!requestLocalSearchScope && isSlashCommandInput(query)) {
      renderSuggestions([], query);
      return;
    }
    const immediate = options && options.immediate;
    const deferInitialDirectNavigationRender = Boolean(
      options && options.deferInitialDirectNavigationRender
    );
    const retryCount = options && Number(options.retryCount) > 0 ? Number(options.retryCount) : 0;
    const requestStartedAt = Date.now();
    const requestQuery = latestQuery;
    const requestSeq = ++suggestionRequestSeq;
    const requestSearchFirst = searchResultPriorityMode === 'search';
    const showExactSearchPendingState = requestSearchFirst &&
      !requestLocalSearchScope &&
      !siteSearchState &&
      !getDirectUrlSuggestion(requestQuery);
    directNavigationSettleController.cancel();
    if (deferInitialDirectNavigationRender) {
      directNavigationSettleController.schedule({
        query: requestQuery,
        requestSeq
      });
    }
    if (remoteSuggestionDebounceTimer) {
      clearTimeout(remoteSuggestionDebounceTimer);
      remoteSuggestionDebounceTimer = null;
    }
    if (suggestionRequestWatchdogTimer) {
      clearTimeout(suggestionRequestWatchdogTimer);
      suggestionRequestWatchdogTimer = null;
    }
    if (showExactSearchPendingState) {
      renderSuggestions([], requestQuery);
    }
    suggestionRequestWatchdogTimer = setTimeout(function() {
      if (requestSeq !== suggestionRequestSeq || requestQuery !== latestQuery) {
        return;
      }
      if (retryCount < 1) {
        requestSuggestions(requestQuery, { immediate: true, retryCount: retryCount + 1 });
        return;
      }
      renderPendingSuggestions(requestQuery);
    }, immediate ? 1200 : 1300);
    const localRequestSent = sendRuntimeMessage({
      action: 'getSearchSuggestions',
      query: requestQuery,
      context: 'newtab',
      sourceTypes: requestLocalSearchScope ? [requestLocalSearchScope.sourceType] : undefined,
      includeOpenTabs: requestLocalSearchScope ? false : undefined
    }, function(response) {
      if (suggestionRequestWatchdogTimer) {
        clearTimeout(suggestionRequestWatchdogTimer);
        suggestionRequestWatchdogTimer = null;
      }
      if (requestSeq !== suggestionRequestSeq || requestQuery !== latestQuery) {
        return;
      }
      directNavigationSettleController.cancel();
      if (chrome.runtime && chrome.runtime.lastError) {
        renderPendingSuggestions(requestQuery);
        return;
      }
      const localSuggestions = response && Array.isArray(response.suggestions) ? response.suggestions : [];
      if (requestLocalSearchScope) {
        renderSuggestions(localSuggestions, requestQuery);
        return;
      }
      if (!showExactSearchPendingState) {
        renderSuggestions(localSuggestions, requestQuery);
      }
      refreshTabsForSearchContext(() => {});
      const remoteDelay = (requestSearchFirst || immediate)
        ? 0
        : Math.max(0, 120 - (Date.now() - requestStartedAt));
      remoteSuggestionDebounceTimer = setTimeout(function() {
        remoteSuggestionDebounceTimer = null;
        if (requestSeq !== suggestionRequestSeq || requestQuery !== latestQuery) {
          return;
        }
        const remoteRequestSent = sendRuntimeMessage({
          action: 'getSearchEngineSuggestions',
          query: requestQuery,
          context: 'newtab',
          localSuggestions: localSuggestions,
          searchFirst: requestSearchFirst
        }, function(remoteResponse) {
          if (requestSeq !== suggestionRequestSeq || requestQuery !== latestQuery) {
            return;
          }
          if (chrome.runtime && chrome.runtime.lastError) {
            renderSuggestions(localSuggestions, requestQuery);
            return;
          }
          if (!remoteResponse ||
              remoteResponse.aborted === true ||
              remoteResponse.hasRemoteSuggestions !== true ||
              !Array.isArray(remoteResponse.suggestions)) {
            renderSuggestions(localSuggestions, requestQuery);
            return;
          }
          renderSuggestions(remoteResponse.suggestions, requestQuery);
        });
        if (!remoteRequestSent) {
          renderSuggestions(localSuggestions, requestQuery);
        }
      }, remoteDelay);
    });
    if (!localRequestSent) {
      if (suggestionRequestWatchdogTimer) {
        clearTimeout(suggestionRequestWatchdogTimer);
        suggestionRequestWatchdogTimer = null;
      }
      if (requestSeq === suggestionRequestSeq && requestQuery === latestQuery) {
        directNavigationSettleController.cancel();
        renderPendingSuggestions(requestQuery);
      }
    }
  }

  function shouldRemoveSearchModeTagOnBackspace(event) {
    if (!inputModeController ||
        typeof inputModeController.shouldRemoveModeTagOnBackspace !== 'function') {
      return true;
    }
    const shouldRemove = inputModeController.shouldRemoveModeTagOnBackspace(event);
    if (!shouldRemove && event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    return shouldRemove;
  }

  inputParts = createSearchInput({
    useImportantStyles: false,
    useInlineBaseStyles: false,
    containerId: '_x_extension_newtab_input_container_2024_unique_',
    inputId: '_x_extension_newtab_search_input_2024_unique_',
    iconId: '_x_extension_newtab_search_icon_2024_unique_',
    placeholder: t('search_placeholder', defaultPlaceholderText),
    modeBadge: {
      id: '_x_extension_newtab_mode_badge_2024_unique_',
      className: 'x-lumno-search-input-mode__badge',
      surface: 'newtab',
      visible: false
    },
    containerStyleOverrides: {
      'border-radius': '24px',
      'background': 'transparent',
      'border': 'none',
      'box-shadow': 'none',
      'min-width': '100%',
      'min-height': '44px',
      'height': '44px',
      'position': 'relative',
      'z-index': '2',
      'overflow': 'visible'
    },
    inputStyleOverrides: {
      'border-bottom': 'none',
      'color': 'var(--x-nt-text, #111827)',
      'caret-color': 'var(--x-nt-link, #2563EB)',
      'padding': '8px 64px 8px 44px',
      'min-height': '44px',
      'height': '44px',
      'line-height': '24px'
    },
    iconStyleOverrides: {
      'color': 'var(--x-nt-subtext, #6B7280)',
      'left': '7px'
    },
    rightIconStyleOverrides: {
      '--x-ext-input-right-icon-inset': '7px',
      '--x-ext-input-icon-hover-bg': 'var(--x-nt-settings-action-hover-bg, rgba(148, 163, 184, 0.16))',
      '--x-ext-input-icon-hover': 'var(--x-nt-settings-action-hover-color, #4B5563)',
      cursor: 'pointer'
    },
    onInput: function(event) {
      searchSuggestionsDismissed = false;
      if (!isApplyingSearchInputHistory) {
        searchInputHistoryController.resetNavigation();
      }
      const rawValue = event.target.value;
      const query = rawValue.trim();
      updateModeBadge(rawValue);
      const inputType = event && event.inputType;
      const isPaste = inputType === 'insertFromPaste';
      const isDelete = inputType && inputType.startsWith('delete');
      if (isDelete) {
        lastDeletionAt = Date.now();
      }
      if (imeKeyGuard.isComposing()) {
        latestQuery = query;
        latestRawQuery = rawValue;
        return;
      }
      if (!query) {
        latestQuery = '';
        latestRawQuery = '';
        clearAutocomplete();
        if (remoteSuggestionDebounceTimer) {
          clearTimeout(remoteSuggestionDebounceTimer);
          remoteSuggestionDebounceTimer = null;
        }
        if (suggestionRequestWatchdogTimer) {
          clearTimeout(suggestionRequestWatchdogTimer);
          suggestionRequestWatchdogTimer = null;
        }
        clearSearchSuggestions();
        return;
      }
      latestRawQuery = rawValue;
      clearAutocomplete();
      if (!localSearchScopeState && isSlashCommandInput(query)) {
        latestQuery = query;
        renderSuggestions([], query);
        return;
      }
      const directUrlSuggestion = getDirectUrlSuggestion(query);
      const hasCachedOpenTabMatch = Boolean(
        directUrlSuggestion &&
        typeof directUrlSuggestion._xMatchedTabId === 'number'
      );
      if (isPaste || directUrlSuggestion) {
        latestQuery = query;
        if (!directUrlSuggestion || hasCachedOpenTabMatch) {
          renderPendingSuggestions(query);
        }
        requestSuggestions(query, {
          immediate: true,
          deferInitialDirectNavigationRender: Boolean(
            directUrlSuggestion && !hasCachedOpenTabMatch
          )
        });
        return;
      }
      requestSuggestions(query);
    },
    onKeyDown: function(event) {
      syncSuggestionActionModifiersFromEvent(event);
      dismissAutocompletePreviewOnNonTabKey(event);
      const suggestionNavigationKey =
        SUGGESTION_NAVIGATION.getSuggestionNavigationKey(event, {
          macosCtrlEnabled: macosCtrlSuggestionNavigationEnabled,
          navigatorLike: typeof navigator === 'object' && navigator ? navigator : null
        });
      if (event.key !== 'Backspace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        latestRawQuery = inputParts.input.value;
        latestQuery = inputParts.input.value.trim();
      }
      if (event.key === 'Escape' && siteSearchState) {
        event.preventDefault();
        clearSiteSearch();
        return;
      }
      if (event.key === 'Escape' && localSearchScopeState) {
        event.preventDefault();
        clearLocalSearchScope();
        const fallbackQuery = inputParts.input.value.trim();
        if (fallbackQuery) {
          requestSuggestions(fallbackQuery, { immediate: true });
        } else {
          clearSearchSuggestions();
        }
        return;
      }
      if (event.key === 'Backspace' && siteSearchState && !inputParts.input.value) {
        if (!shouldRemoveSearchModeTagOnBackspace(event)) {
          return;
        }
        clearSiteSearch();
        return;
      }
      if (event.key === 'Backspace' && localSearchScopeState && !inputParts.input.value) {
        if (!shouldRemoveSearchModeTagOnBackspace(event)) {
          return;
        }
        clearLocalSearchScope();
        clearSearchSuggestions();
        return;
      }
      if (isImeCompositionEvent(event)) {
        return;
      }
      const inputHistoryDirection =
        SEARCH_INPUT_HISTORY.getShortcutDirection(event);
      if (inputHistoryDirection) {
        event.preventDefault();
        event.stopPropagation();
        const result = searchInputHistoryController.move(
          inputHistoryDirection,
          inputParts.input.value
        );
        if (result.handled) {
          isApplyingSearchInputHistory = true;
          try {
            inputParts.input.value = result.value;
            inputParts.input.setSelectionRange(result.value.length, result.value.length);
            inputParts.input.dispatchEvent(new Event('input', { bubbles: true }));
          } finally {
            isApplyingSearchInputHistory = false;
          }
        }
        return;
      }
      if (suggestionNavigationKey) {
        if (suggestionItems.length === 0) {
          return;
        }
        event.preventDefault();
        let didWrap = false;
        if (suggestionNavigationKey === 'ArrowDown') {
          if (selectedIndex === -1) {
            const autoIndex = getAutoHighlightIndex();
            selectedIndex = autoIndex >= 0
              ? (autoIndex + 1) % suggestionItems.length
              : 0;
            didWrap = autoIndex >= 0 && selectedIndex === 0;
          } else {
            const previousIndex = selectedIndex;
            selectedIndex = (selectedIndex + 1) % suggestionItems.length;
            didWrap = previousIndex === suggestionItems.length - 1 && selectedIndex === 0;
          }
        } else {
          if (selectedIndex === 0) {
            selectedIndex = suggestionItems.length - 1;
            didWrap = true;
          } else if (selectedIndex === -1) {
            const autoIndex = getAutoHighlightIndex();
            if (autoIndex > 0) {
              selectedIndex = autoIndex - 1;
            } else if (autoIndex === 0) {
              selectedIndex = suggestionItems.length - 1;
              didWrap = true;
            } else {
              selectedIndex = suggestionItems.length - 1;
              didWrap = true;
            }
          } else {
            selectedIndex = selectedIndex - 1;
          }
        }
        updateSelection();
        scrollSelectedSuggestionIntoView(
          suggestionNavigationKey === 'ArrowDown' ? 'down' : 'up',
          didWrap
        );
        return;
      }
      if (event.key === 'Tab' && handleTabKey) {
        handleTabKey(event);
        return;
      }
      if (event.key !== 'Enter') {
        return;
      }
      const query = event.target.value.trim();
      if (!query) {
        return;
      }
      searchInputHistoryController.record(query);
      const commandMatch = localSearchScopeState ? null : getCommandMatch(query);
      if (commandMatch && selectedIndex === -1) {
        if (commandMatch.command.type === 'commandNewTab') {
          chrome.runtime.sendMessage({ action: 'openNewTab' });
          return;
        }
        if (commandMatch.command.type === 'commandSettings') {
          chrome.runtime.sendMessage({ action: 'openOptionsPage' });
          return;
        }
      }
      if (!localSearchScopeState && isModeCommand(query)) {
        setVisibleThemeMode(getNextThemeMode(currentThemeMode));
        return;
      }
      if (!localSearchScopeState && isZenCommand(query)) {
        setZenModeEnabled(!zenModeEnabled);
        return;
      }
      const executeSuggestion = (selectedSuggestion, event, activeSuggestionIndex) => {
        if (!selectedSuggestion) {
          return false;
        }
        const activeItem = Number.isInteger(activeSuggestionIndex)
          ? suggestionItems[activeSuggestionIndex]
          : null;
        if (selectedSuggestion.type === 'modeSwitch') {
          setVisibleThemeMode(selectedSuggestion.nextMode);
          return true;
        }
        if (selectedSuggestion.type === 'zenSwitch') {
          setZenModeEnabled(selectedSuggestion.nextEnabled);
          return true;
        }
        if (selectedSuggestion.type === 'commandNewTab') {
          chrome.runtime.sendMessage({ action: 'openNewTab' });
          return true;
        }
        if (selectedSuggestion.type === 'commandSettings') {
          chrome.runtime.sendMessage({ action: 'openOptionsPage' });
          return true;
        }
        if (selectedSuggestion.type === 'siteSearchPrompt' && selectedSuggestion.provider) {
          activateSiteSearch(selectedSuggestion.provider);
          focusSearchInputPreservingScroll();
          return true;
        }
        if (selectedSuggestion.provider && selectedSuggestion.searchQuery) {
          return runSiteSearchProviderQuery(
            selectedSuggestion.provider,
            selectedSuggestion.searchQuery,
            shouldOpenSearchResultInBackgroundTab(event) ? 'backgroundTab' : 'currentTab'
          );
        }
        if (shouldSwitchMatchedTabSuggestion(selectedSuggestion, activeSuggestionIndex)) {
          openMatchedTabSuggestion(selectedSuggestion, event, activeItem, query);
          return true;
        }
        if (shouldOpenSearchResultInBackgroundTab(event) && selectedSuggestion.url) {
          return openSearchResultUrl(selectedSuggestion, query, event);
        }
        if (selectedSuggestion.forceSearch && selectedSuggestion.searchQuery) {
          navigateToQuery(selectedSuggestion.searchQuery, true);
          return true;
        }
        if (selectedSuggestion.url) {
          return openSearchResultUrl(selectedSuggestion, query, event);
        }
        return false;
      };
      if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) {
        if (executeSuggestion(currentSuggestions[selectedIndex], event, selectedIndex)) {
          return;
        }
      } else {
        const autoIndex = getAutoHighlightIndex();
        if (autoIndex >= 0 && currentSuggestions[autoIndex]) {
          if (executeSuggestion(currentSuggestions[autoIndex], event, autoIndex)) {
            return;
          }
        }
      }
      if (!localSearchScopeState && isSlashCommandInput(query)) {
        renderSuggestions([], query);
        return;
      }
      if (localSearchScopeState) {
        return;
      }
      if (siteSearchState) {
        if (runSiteSearchProviderQuery(
          siteSearchState,
          query,
          shouldOpenSearchResultInBackgroundTab(event) ? 'backgroundTab' : 'currentTab'
        )) {
          return;
        }
      }
      const currentRawInput = (latestRawQuery || inputParts.input.value || '').trim();
      if (inlineSearchState && inlineSearchState.isAuto &&
          inlineSearchState.rawInput === currentRawInput) {
        if (inlineSearchState.provider && inlineSearchState.query) {
          if (runSiteSearchProviderQuery(
            inlineSearchState.provider,
            inlineSearchState.query,
            shouldOpenSearchResultInBackgroundTab(event) ? 'backgroundTab' : 'currentTab'
          )) {
            return;
          }
        } else if (inlineSearchState.url) {
          openSearchResultUrl({
            url: inlineSearchState.url,
            title: inlineSearchState.url,
            type: 'inlineSiteSearch'
          }, query, event);
          return;
        }
      }
      if (autocompleteState && autocompleteState.url) {
        openSearchResultUrl({
          url: autocompleteState.url,
          title: autocompleteState.title || '',
          type: 'autocomplete'
        }, query, event);
        return;
      }
      resolveQuickNavigation(query).then((targetUrl) => {
        const backgroundOpen = shouldOpenSearchResultInBackgroundTab(event);
        if (targetUrl) {
          openSearchResultUrl({
            url: targetUrl,
            title: query,
            type: 'quickNavigation'
          }, query, event);
          return;
        }
        if (backgroundOpen) {
          chrome.runtime.sendMessage({
            action: 'searchOrNavigate',
            query: query,
            disposition: 'backgroundTab'
          });
          return;
        }
        navigateToQuery(query);
      });
    }
  });
  markNewtabStartupMilestone('search-input-created');

  function isEditableElement(el) {
    if (!el) {
      return false;
    }
    const tagName = el.tagName ? el.tagName.toLowerCase() : '';
    if (tagName === 'input' || tagName === 'textarea') {
      return true;
    }
    return Boolean(el.isContentEditable);
  }

  function refreshFallbackShortcut(force) {
    const now = Date.now();
    if (!force && (now - fallbackShortcutRefreshAt) < 15000) {
      return;
    }
    fallbackShortcutRefreshAt = now;
    try {
      chrome.runtime.sendMessage({ action: 'getShowSearchShortcut' }, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          return;
        }
        const nextShortcut = response && typeof response.shortcut === 'string'
          ? response.shortcut
          : '';
        if (nextShortcut === fallbackShortcutRaw) {
          return;
        }
        fallbackShortcutRaw = nextShortcut;
        fallbackShortcutSpec = SHORTCUT_KEY_MATCHER.parseShortcut(nextShortcut);
      });
    } catch (e) {
      // Ignore runtime bridge failures.
    }
  }

  function focusSearchInputPreservingScroll() {
    if (!inputParts || !inputParts.input) {
      return false;
    }
    try {
      inputParts.input.focus({ preventScroll: true });
    } catch (error) {
      inputParts.input.focus();
    }
    return document.activeElement === inputParts.input;
  }

  function tryFocusSearchInput(force) {
    if (!inputParts || !inputParts.input) {
      return false;
    }
    if (document.activeElement === inputParts.input) {
      return true;
    }
    if (!force) {
      const activeElement = document.activeElement;
      const hasMeaningfulActiveElement = Boolean(activeElement) &&
        activeElement !== document.body &&
        activeElement !== document.documentElement;
      if (hasMeaningfulActiveElement) {
        return false;
      }
    }
    return focusSearchInputPreservingScroll();
  }

  function activateNewtabShortcutFocus() {
    if (!tryFocusSearchInput(true)) {
      return false;
    }
    try {
      inputParts.input.select();
    } catch (e) {
      // Ignore selection failures.
    }
    return true;
  }

  if (chrome && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.action !== 'lumno:newtab-focus-input') {
        return;
      }
      if (document.visibilityState !== 'visible') {
        return;
      }
      const focused = activateNewtabShortcutFocus();
      sendResponse({ ok: focused });
      return;
    });
  }

  function scheduleAutoFocusRecovery() {
    const hasExplicitFocusHint = window.location.search.includes('focus=1') ||
      window.location.hash.includes('focus');
    let forceInitialFocusPending = hasExplicitFocusHint;

    const clearExplicitFocusQuery = () => {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('focus') !== '1') {
          return;
        }
        url.searchParams.delete('focus');
        window.history.replaceState(window.history.state, '', url.toString());
      } catch (_error) {
        // Keep focus recovery independent from address cleanup failures.
      }
    };

    const retryDelays = [0, 60, 140, 280, 520, 900, 1400];
    const attemptFocusIfVisible = () => {
      if (!newtabInputAutoFocusEnabled) {
        return;
      }
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (!document.hasFocus()) {
        return;
      }
      const focused = tryFocusSearchInput(forceInitialFocusPending);
      if (focused) {
        const consumedExplicitFocusHint = forceInitialFocusPending;
        forceInitialFocusPending = false;
        if (consumedExplicitFocusHint) {
          clearExplicitFocusQuery();
        }
      }
    };

    retryDelays.forEach((delay) => {
      setTimeout(attemptFocusIfVisible, delay);
    });

    if (document.body &&
        document.body.getAttribute('data-nt-ready') !== '1' &&
        typeof window.MutationObserver === 'function') {
      const readyObserver = new window.MutationObserver(() => {
        if (document.body.getAttribute('data-nt-ready') !== '1') {
          return;
        }
        readyObserver.disconnect();
        setTimeout(attemptFocusIfVisible, 0);
      });
      readyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-nt-ready']
      });
    }

    window.addEventListener('focus', () => {
      setTimeout(attemptFocusIfVisible, 0);
      setTimeout(refreshTabsIfIdle, 0);
    }, true);
    window.addEventListener('pageshow', () => {
      attemptFocusIfVisible();
      refreshTabsIfIdle();
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        setTimeout(attemptFocusIfVisible, 0);
        setTimeout(refreshTabsIfIdle, 0);
      }
    }, true);
  }

  initialNewtabInputAutoFocusReadyTask.then(() => {
    scheduleAutoFocusRecovery();
  });
  refreshFallbackShortcut(true);

  function handleGlobalTypingFocus(event) {
    if (folderColorPicker && folderColorPicker.isOpen()) return;
    if (!event || event.defaultPrevented) {
      return;
    }
    refreshFallbackShortcut(false);
    if (fallbackShortcutSpec &&
        SHORTCUT_KEY_MATCHER.eventMatchesShortcut(event, fallbackShortcutSpec)) {
      event.preventDefault();
      event.stopPropagation();
      activateNewtabShortcutFocus();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (inputModeController &&
        typeof inputModeController.shouldHandleModeMenuKeyEvent === 'function' &&
        inputModeController.shouldHandleModeMenuKeyEvent(event)) {
      return;
    }
    const activeElement = document.activeElement;
    if (searchScopeIcon && activeElement === searchScopeIcon) {
      return;
    }
    if (activeElement === inputParts.input || isEditableElement(activeElement)) {
      return;
    }
    if (isImeCompositionEvent(event)) {
      focusSearchInputPreservingScroll();
      return;
    }
    const key = event.key || '';
    if (!key || key === 'Tab' || key === 'Escape' || key.startsWith('Arrow')) {
      return;
    }
    focusSearchInputPreservingScroll();
    const currentValue = inputParts.input.value || '';
    if (key === 'Backspace') {
      if (currentValue) {
        inputParts.input.value = currentValue.slice(0, -1);
        inputParts.input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      event.preventDefault();
      return;
    }
    if (key.length === 1) {
      inputParts.input.value = currentValue + key;
      inputParts.input.setSelectionRange(inputParts.input.value.length, inputParts.input.value.length);
      inputParts.input.dispatchEvent(new Event('input', { bubbles: true }));
      event.preventDefault();
    }
  }

  const handleBackgroundPointerFocus = NEWTAB_BACKGROUND_SEARCH_FOCUS.createBackgroundFocusHandler({
    getBackgroundTargets: () => [document.body, root, searchLayer],
    getSearchValue: () => inputParts.input.value,
    dismissSearchResults: dismissSearchSuggestionsFromBackground,
    focusSearch: focusSearchInputPreservingScroll
  });

  window.addEventListener('keydown', finishNewtabEntryAnimation, true);
  window.addEventListener('pointerdown', finishNewtabEntryAnimation, true);
  window.addEventListener('keydown', handleGlobalTypingFocus, true);
  window.addEventListener('focus', () => refreshFallbackShortcut(true), true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshFallbackShortcut(false);
    }
  }, true);
  window.addEventListener('pointerdown', handleBackgroundPointerFocus, true);
  modeBadge = inputParts.modeBadge;
  const searchInput = inputParts.input;
  searchInput.addEventListener('focus', restoreDismissedSearchSuggestions);
  searchInputRef = searchInput;
  const searchScopeIcon = inputParts.icon;
  const rightIcon = inputParts.rightIcon;
  const searchScopeTooltipText = () => t(
    'shortcut_reference_search_open_scope_menu_title',
    '打开搜索范围面板'
  );
  function setSearchScopeIconVisualState(active) {
    if (!searchScopeIcon) {
      return;
    }
    const enabled = searchScopeIcon.getAttribute('aria-disabled') !== 'true';
    searchScopeIcon.dataset.hoverActive = active && enabled ? 'true' : 'false';
  }
  function setSearchScopeIconEnabled(enabled) {
    if (!searchScopeIcon) {
      return;
    }
    const nextEnabled = enabled !== false;
    searchScopeIcon.setAttribute('aria-disabled', nextEnabled ? 'false' : 'true');
    searchScopeIcon.setAttribute('tabindex', nextEnabled ? '0' : '-1');
    searchScopeIcon.setAttribute('aria-label', searchScopeTooltipText());
    if (nextEnabled) {
      searchScopeIcon.setAttribute('data-tooltip', searchScopeTooltipText());
      return;
    }
    searchScopeIcon.removeAttribute('data-tooltip');
    hideSearchInputCursorTooltip();
    setSearchScopeIconVisualState(false);
    if (typeof searchScopeIcon.blur === 'function') {
      searchScopeIcon.blur();
    }
  }
  function activateSearchScopeIcon(event) {
    if (!searchScopeIcon || searchScopeIcon.getAttribute('aria-disabled') === 'true') {
      return;
    }
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    hideSearchInputCursorTooltip();
    setSearchScopeIconVisualState(false);
    if (inputModeController &&
        typeof inputModeController.resetModeMenuDoubleTab === 'function') {
      inputModeController.resetModeMenuDoubleTab();
    }
    openSearchModeMenuFromDoubleTab();
    if (searchScopeIcon && typeof searchScopeIcon.blur === 'function') {
      searchScopeIcon.blur();
    }
  }
  if (searchScopeIcon) {
    searchScopeIcon.dataset.searchScopeAction = 'true';
    searchScopeIcon.setAttribute('role', 'button');
    setSearchScopeIconEnabled(true);
    setSearchScopeIconVisualState(false);
    searchScopeIcon.addEventListener('mouseenter', () => {
      setSearchScopeIconVisualState(true);
    });
    searchScopeIcon.addEventListener('focus', () => {
      setSearchScopeIconVisualState(true);
    });
    ['mouseleave', 'blur', 'pointerup', 'pointercancel'].forEach((type) => {
      searchScopeIcon.addEventListener(type, () => {
        setSearchScopeIconVisualState(false);
      });
    });
    searchScopeIcon.addEventListener('click', activateSearchScopeIcon);
    searchScopeIcon.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      activateSearchScopeIcon(event);
    });
    bindSearchInputCursorTooltip(searchScopeIcon, searchScopeTooltipText);
  }
  function openWordmarkUrl(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    openExternalNewTabUrl(LUMNO_CHROME_WEB_STORE_URL, event);
  }
  const shouldAnimateWordmarkEntry = !shouldSkipNewtabEntryMotion();
  topContentContainer = document.createElement('div');
  topContentController = NEWTAB_TOP_CONTENT.createTopContentController(
    topContentContainer,
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
  function updateNoticeClaimsSessionSlot() {
    return Boolean(
      updateNoticeController &&
      typeof updateNoticeController.hasSessionSlot === 'function' &&
      updateNoticeController.hasSessionSlot()
    );
  }
  updateNoticeController = UPDATE_NOTICE.createUpdateNotice({
    documentObj: document,
    featureHints: FEATURE_HINTS,
    chromeApi: chrome,
    surface: 'newtab',
    t,
    getRiSvg,
    onSessionSlotClaimed() {
      if (engagementNoticeController &&
          typeof engagementNoticeController.suppressForSession === 'function') {
        engagementNoticeController.suppressForSession();
      }
    },
    onDetailsClick(_notice, event) {
      chrome.runtime.sendMessage({
        action: 'openReleasePage',
        reason: 'notice',
        disposition: getOpenDisposition(event, 'newTab')
      });
    }
  });
  function createNewtabEngagementNoticeController() {
    return ENGAGEMENT_NOTICE.createEngagementNotice({
      documentObj: document,
      featureHints: FEATURE_HINTS,
      chromeApi: chrome,
      surface: 'newtab',
      locale: getFeedbackWebLocale(),
      t,
      getRiSvg,
      exposureGate: updateNoticeController && updateNoticeController.ready,
      canShow() {
        const updateNoticeVisible = Boolean(
          updateNoticeController &&
          updateNoticeController.element &&
          updateNoticeController.element.getAttribute('data-visible') === 'true'
        );
        return !updateNoticeVisible &&
          !updateNoticeClaimsSessionSlot() &&
          document.visibilityState === 'visible' &&
          !String(inputParts.input.value || '').trim() &&
          document.body.getAttribute('data-nt-suggestions-open') !== 'true' &&
          !isFeedbackPopoverOpen();
      },
      onReview(event) {
        const links = feedbackLinks || LUMNO_FEEDBACK_LINKS_FALLBACK;
        openFeedbackExternalUrl(
          links.chromeReview || LUMNO_FEEDBACK_LINKS_FALLBACK.chromeReview,
          getOpenDisposition(event, 'newTab')
        );
      },
      onCommunity(event) {
        const disposition = getOpenDisposition(event, 'newTab');
        const communityUrlPromise = ENGAGEMENT_NOTICE.loadCommunityUrl({
          force: true,
          locale: getFeedbackWebLocale()
        });
        communityUrlPromise.then((url) => {
          openFeedbackExternalUrl(url, disposition);
        });
      }
    });
  }
  inputParts.input.addEventListener('input', function() {
    if (!String(inputParts.input.value || '').trim() ||
        !engagementNoticeController ||
        typeof engagementNoticeController.recordMeaningfulUse !== 'function') {
      return;
    }
    engagementNoticeController.recordMeaningfulUse();
  });

  if (rightIcon) {
    const settingsTooltipText = () => formatMessage(
      'command_settings',
      '打开设置',
      { name: 'Lumno' }
    );
    rightIcon.setAttribute('aria-label', settingsTooltipText());
    rightIcon.setAttribute('data-tooltip', settingsTooltipText());
    bindSearchInputCursorTooltip(rightIcon, settingsTooltipText);
    rightIcon.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      hideSearchInputCursorTooltip();
      const runtime = typeof chrome !== 'undefined' && chrome && chrome.runtime
        ? chrome.runtime
        : null;
      if (runtime && typeof runtime.openOptionsPage === 'function') {
        runtime.openOptionsPage();
        return;
      }
      const optionsUrl = runtime &&
          typeof runtime.getURL === 'function'
        ? EXTENSION_ROUTES.buildOptionsUrl(chrome)
        : getExtensionResourceUrl('src/options/options.html');
      window.open(optionsUrl, '_blank');
    });
  }

  function updateInputRightPadding() {
    if (inputModeController) {
      inputModeController.updateLayout();
    }
  }

  function setNewtabActionControlVisibility(element, visible) {
    if (!element) {
      return;
    }
    const nextVisible = visible !== false;
    element.hidden = !nextVisible;
    element.style.setProperty('display', nextVisible ? '' : 'none');
    element.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
    element.inert = !nextVisible;
    if (nextVisible) {
      element.removeAttribute('inert');
    } else {
      element.setAttribute('inert', '');
    }
  }

  function applyNewtabActionButtonVisibility() {
    if (!newtabFeedbackButtonVisible && feedbackReactController) {
      closeFeedbackPopover();
    }
    if (!newtabAppearanceButtonVisible && wallpaperRuntime) {
      closeWallpaperPanel();
    }
    setNewtabActionControlVisibility(feedbackControl, newtabFeedbackButtonVisible);
    setNewtabActionControlVisibility(wallpaperControl, newtabAppearanceButtonVisible);
  }

  function loadNewtabActionButtonVisibility() {
    if (!storageArea) {
      newtabFeedbackButtonVisible = true;
      newtabAppearanceButtonVisible = true;
      applyNewtabActionButtonVisibility();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      storageArea.get([
        NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
        NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY
      ], (result) => {
        const stored = result || {};
        const rawFeedback = stored[NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY];
        const rawAppearance = stored[NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY];
        newtabFeedbackButtonVisible = normalizeNewtabFeedbackButtonVisible(rawFeedback);
        newtabAppearanceButtonVisible = normalizeNewtabAppearanceButtonVisible(rawAppearance);
        const repairs = {};
        if (rawFeedback !== newtabFeedbackButtonVisible) {
          repairs[NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY] = newtabFeedbackButtonVisible;
        }
        if (rawAppearance !== newtabAppearanceButtonVisible) {
          repairs[NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY] = newtabAppearanceButtonVisible;
        }
        applyNewtabActionButtonVisibility();
        if (Object.keys(repairs).length > 0) {
          storageArea.set(repairs);
        }
        resolve();
      });
    });
  }

  function setSiteSearchTabHint(provider) {
    if (inputModeController) {
      inputModeController.setTabHintVisible(true, provider);
    }
  }

  function clearSiteSearchTabHint() {
    if (inputModeController) {
      inputModeController.setTabHintVisible(false);
    }
  }

  if (storageArea) {
    storageArea.get([
      SEARCH_RESULT_PRIORITY_STORAGE_KEY,
      SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
      SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
      OVERLAY_TAB_PRIORITY_STORAGE_KEY
    ], (result) => {
      const raw = result ? result[SEARCH_RESULT_PRIORITY_STORAGE_KEY] : null;
      const nextMode = normalizeSearchResultPriority(raw);
      searchResultPriorityMode = nextMode;
      enabledSearchResultSourceTypes = normalizeEnabledSearchResultSourceTypes(
        result ? result[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY] : null
      );
      const rawDisplayLimit = result ? result[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY] : null;
      searchResultDisplayLimit = normalizeSearchResultDisplayLimit(rawDisplayLimit);
      openTabQuickSwitchEnabled = normalizeOverlayTabPriorityMode(
        result ? result[OVERLAY_TAB_PRIORITY_STORAGE_KEY] : null
      );
      if (raw !== nextMode) {
        storageArea.set({ [SEARCH_RESULT_PRIORITY_STORAGE_KEY]: nextMode });
      }
      if (rawDisplayLimit !== searchResultDisplayLimit) {
        storageArea.set({ [SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY]: searchResultDisplayLimit });
      }
      if (latestQuery) {
        renderSuggestions(lastSuggestionResponse, latestQuery);
      }
    });
  }
  const defaultPlaceholder = searchInput.placeholder;
  const defaultCaretColor = searchInput.style.caretColor || '#7DB7FF';
  const inputModePrefixTransition = 'opacity 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease';
  inputModeController = SEARCH_INPUT_MODE.createInputModeController(inputParts, {
    surface: 'newtab',
    useImportantStyles: false,
    prefixTransition: inputModePrefixTransition,
    defaultPlaceholder,
    defaultCaretColor,
    modeBadgeElement: modeBadge,
    rightReserveBase: 64,
    rightAnchorOffset: 52,
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
    onModeTagRemovalConfirmation: () => {
      showToast(t(
        'search_scope_remove_confirmation',
        'Press Backspace again to remove the scope'
      ));
    },
    onModeTagRemovalConfirmationReset: hideToast,
    onModeTagActiveChange: (active) => {
      setSearchScopeIconEnabled(!active);
    },
    onModeMenuLayoutChange: syncSearchModeMenuResultOffset,
    isTabHintSuppressed: () => Boolean(siteSearchState || localSearchScopeState)
  });
  syncSearchModeMenuResultOffset();
  if (typeof window.ResizeObserver === 'function') {
    const searchModeMenuResultResizeObserver = new window.ResizeObserver(
      syncSearchModeMenuResultOffset
    );
    searchModeMenuResultResizeObserver.observe(suggestionsContainer);
  }
  siteSearchTabHint = inputModeController.tabHintElement;
  loadSiteSearchIconCache().then(() => {
    if (!siteSearchState || !inputModeController) {
      return;
    }
    const activeProvider = siteSearchState;
    setSiteSearchPrefix(activeProvider, defaultTheme);
    getThemeForProvider(activeProvider).then((theme) => {
      if (siteSearchState === activeProvider) {
        setSiteSearchPrefix(activeProvider, theme);
      }
    }).catch(() => {});
  });
  markNewtabStartupMilestone('search-controller-created');

  function updateSiteSearchPrefixLayout() {
    if (inputModeController) {
      inputModeController.updateLayout();
    }
  }

  function setSiteSearchPrefix(provider, theme, options) {
    if (inputModeController) {
      inputModeController.setProviderPrefix(provider, theme, options);
    }
  }

  function clearSiteSearchPrefix() {
    if (inputModeController) {
      inputModeController.clearProviderPrefix();
    }
  }

  let newtabResizeFrame = 0;
  let newtabResizeSettleTimer = 0;
  function handleNewtabResize() {
    newtabResizeFrame = 0;
    const previousBookmarkLimit = getBookmarkLimit();
    applyNewtabWidthMode();
    applyNewtabShortcutColumns();
    const recentLayoutBefore = recentLoadedOnce && shouldAnimateNewtabLayoutShift()
      ? captureRecentCardLayout()
      : null;
    const recentColumnsChanged = applyRecentGridColumns();
    const bookmarkColumnsChanged = applyBookmarkGridColumns();
    updateSiteSearchPrefixLayout();
    if (bookmarkColumnsChanged && bookmarkLoadedOnce) {
      keepBookmarkPageAnchorAfterLimitChange(previousBookmarkLimit);
      renderCurrentBookmarkPage();
    }
    updateBookmarkGridHeightLock();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    positionBookmarkCascadeLevels();
    updateSuggestionsFloatingLayout();
    if (recentColumnsChanged && recentLoadedOnce) {
      cancelRecentResizeLayoutAnimations();
      renderRecentSites(recentSourceItems);
      animateRecentResizeLayout(recentLayoutBefore);
    }
  }

  window.addEventListener('resize', () => {
    newtabReadyViewportRevision += 1;
    newtabResizeLayoutLocked = true;
    if (newtabResizeSettleTimer) {
      window.clearTimeout(newtabResizeSettleTimer);
    }
    newtabResizeSettleTimer = window.setTimeout(() => {
      newtabResizeSettleTimer = 0;
      const fromLayout = shouldAnimateNewtabLayoutShift()
        ? captureTopContentLayout()
        : null;
      cancelTopContentLayoutAnimations();
      newtabResizeLayoutLocked = false;
      updateBookmarkSectionPosition({ releaseDockDensityLock: true });
      animateTopContentLayout(fromLayout);
    }, NEWTAB_RESIZE_DENSITY_SETTLE_MS);
    if (newtabReadyRequested &&
        document.body &&
        document.body.getAttribute('data-nt-ready') !== '1') {
      scheduleNewtabReadyAfterViewportSettle();
    }
    if (newtabResizeFrame) {
      return;
    }
    newtabResizeFrame = window.requestAnimationFrame(handleNewtabResize);
  }, { passive: true });

  handleTabKey = function(event) {
    if (!event || event.defaultPrevented) {
      return false;
    }
    if (inputModeController &&
        typeof inputModeController.handleModeMenuTabFocusToggle === 'function' &&
        inputModeController.handleModeMenuTabFocusToggle(event)) {
      return true;
    }
    if (inputModeController &&
        typeof inputModeController.shouldOpenModeMenuForActiveModeOnTab === 'function' &&
        inputModeController.shouldOpenModeMenuForActiveModeOnTab(event)) {
      inputModeController.openModeMenu('none');
      return true;
    }
    if (siteSearchState || localSearchScopeState) {
      return false;
    }
    const rawValue = inputParts.input.value;
    const rawTrigger = latestRawQuery || rawValue;
    const triggerInput = (rawTrigger || rawValue).trim();
    if (!triggerInput && inputModeController &&
        typeof inputModeController.shouldOpenModeMenuOnDoubleTab === 'function') {
      const shouldOpenModeMenu = inputModeController.shouldOpenModeMenuOnDoubleTab(event);
      if (shouldOpenModeMenu) {
        openSearchModeMenuFromDoubleTab();
      }
      return Boolean(event.defaultPrevented);
    }
    if (siteSearchTriggerState &&
        siteSearchTriggerState.rawInput === triggerInput &&
        siteSearchTriggerState.provider) {
      event.preventDefault();
      activateSiteSearch(siteSearchTriggerState.provider);
      return true;
    }
    if (localSearchScopeTriggerState &&
        localSearchScopeTriggerState.rawInput === triggerInput &&
        localSearchScopeTriggerState.scope) {
      event.preventDefault();
      return activateLocalSearchScope(localSearchScopeTriggerState.scope);
    }
    if (triggerInput) {
      event.preventDefault();
      const siteProviders = (siteSearchProvidersCache && siteSearchProvidersCache.length > 0)
        ? siteSearchProvidersCache
        : defaultSiteSearchProviders;
      const providers = getSearchTriggerProviders(
        siteProviders,
        aggregateSearchesCache
      );
      const topSiteMatch = getTopSiteMatchCandidate(currentSuggestions, triggerInput);
      const directProvider = getSiteSearchTriggerCandidate(triggerInput, providers, topSiteMatch);
      if (directProvider) {
        activateSiteSearch(directProvider);
        return true;
      }
      const cachedRules = window._x_extension_shortcut_rules_2024_unique_;
      const directLocalScope = getLocalSearchScopeCandidate(triggerInput, cachedRules);
      if (siteSearchProvidersCache && directLocalScope) {
        activateLocalSearchScope(directLocalScope);
        return true;
      }
      Promise.all([
        getSiteSearchProviders(),
        getAggregateSearches(),
        getShortcutRules()
      ]).then(([items, definitions, rules]) => {
        if (siteSearchState || localSearchScopeState ||
            String(inputParts.input.value || '').trim() !== triggerInput) {
          return;
        }
        const asyncTopSiteMatch = getTopSiteMatchCandidate(currentSuggestions, triggerInput);
        const asyncProvider = getSiteSearchTriggerCandidate(
          triggerInput,
          getSearchTriggerProviders(items, definitions),
          asyncTopSiteMatch
        );
        if (asyncProvider) {
          activateSiteSearch(asyncProvider);
          return;
        }
        const asyncLocalScope = getLocalSearchScopeCandidate(triggerInput, rules);
        if (asyncLocalScope) {
          activateLocalSearchScope(asyncLocalScope);
          return;
        }
        if (autocompleteState && autocompleteState.completion) {
          inputParts.input.value = autocompleteState.completion;
          inputParts.input.setSelectionRange(autocompleteState.completion.length, autocompleteState.completion.length);
          latestRawQuery = autocompleteState.completion;
          latestQuery = autocompleteState.completion.trim();
          autocompleteState = null;
          inputParts.input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      return true;
    }
    if (autocompleteState && autocompleteState.completion) {
      event.preventDefault();
      inputParts.input.value = autocompleteState.completion;
      inputParts.input.setSelectionRange(autocompleteState.completion.length, autocompleteState.completion.length);
      latestRawQuery = autocompleteState.completion;
      latestQuery = autocompleteState.completion.trim();
      autocompleteState = null;
      inputParts.input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  };

  document.addEventListener('keydown', function(event) {
    if (folderColorPicker && folderColorPicker.isOpen()) return;
    if (event && event.key === 'Escape' && (shortcutDragState || bookmarkDragState)) {
      finishShortcutDrag(null, { cancel: true });
      finishBookmarkDrag(null, { canceled: true });
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!event || event.defaultPrevented || event.altKey || isEditableElement(event.target)) {
      return;
    }
    const hasCommandModifier = event.metaKey || event.ctrlKey;
    if (!hasCommandModifier) {
      return;
    }
    const key = String(event.key || '').toLowerCase();
    const wantsUndo = key === 'z' && !event.shiftKey;
    const wantsRedo = (key === 'z' && event.shiftKey) ||
      (key === 'y' && event.ctrlKey && !event.metaKey);
    const direction = wantsUndo ? 'undo' : wantsRedo ? 'redo' : '';
    if (!direction || !performBookmarkMoveHistoryAction(direction)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('keydown', function(event) {
    if (folderColorPicker && folderColorPicker.isOpen()) return;
    syncSuggestionActionModifiersFromEvent(event);
    if (SUGGESTION_NAVIGATION.handleNumberShortcutKeyEvent(
      event,
      suggestionItems,
      suggestionsContainer,
      numberShortcutOptions
    )) {
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    if (document.activeElement !== inputParts.input) {
      return;
    }
    if (handleTabKey) {
      handleTabKey(event);
    }
  }, true);
  document.addEventListener('keyup', function(event) {
    syncSuggestionActionModifiersFromEvent(event);
    SUGGESTION_NAVIGATION.handleNumberShortcutKeyEvent(
      event,
      suggestionItems,
      suggestionsContainer,
      numberShortcutOptions
    );
  }, true);
  window.addEventListener('blur', function() {
    setSuggestionActionModifiersActive(false, false, false);
    SUGGESTION_NAVIGATION.cancelNumberShortcuts(suggestionsContainer);
  });

  getSiteSearchProviders();
  getAggregateSearches().then(() => {
    if (inputModeController && typeof inputModeController.refreshModeMenu === 'function') {
      inputModeController.refreshModeMenu();
    }
    if (latestQuery) {
      requestSuggestions(latestQuery, { immediate: true });
    }
  });

  addStorageChangeListener((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !(
      changes[SITE_SEARCH_STORAGE_KEY] ||
      changes[SITE_SEARCH_DISABLED_STORAGE_KEY] ||
      changes[AGGREGATE_SEARCH_STORAGE_KEY]
    )) {
      return;
    }
    if (changes[AGGREGATE_SEARCH_STORAGE_KEY]) {
      aggregateSearchesLoadVersion += 1;
      aggregateSearchesLoadPromise = null;
      aggregateSearchesCache = AGGREGATE_SEARCH_STORE.normalizeAggregateSearches(
        changes[AGGREGATE_SEARCH_STORAGE_KEY].newValue
      );
      if (isAggregateSearchProvider(siteSearchState)) {
        const currentId = String(siteSearchState.aggregateId || '');
        const updatedDefinition = aggregateSearchesCache.find(
          (item) => String(item && item.id ? item.id : '') === currentId
        );
        const updatedProvider = isAggregateSearchDefinitionAvailable(
          updatedDefinition,
          getSearchModeProviders()
        )
          ? createAggregateSearchScopeProvider(updatedDefinition)
          : null;
        if (updatedProvider) {
          siteSearchState = updatedProvider;
          setSiteSearchPrefix(updatedProvider, defaultTheme, { animate: false });
        } else {
          clearSiteSearch();
        }
      }
      if (inputModeController && typeof inputModeController.refreshModeMenu === 'function') {
        inputModeController.refreshModeMenu();
      }
      if (latestQuery) {
        requestSuggestions(latestQuery, { immediate: true });
      }
    }
    if (!changes[SITE_SEARCH_STORAGE_KEY] && !changes[SITE_SEARCH_DISABLED_STORAGE_KEY]) {
      return;
    }
    if (!storageArea) {
      return;
    }
    const providerReload = reloadSiteSearchProvidersFromStorage();
    providerReload.promise.then(() => {
      if (providerReload.version !== siteSearchProvidersLoadVersion) {
        return;
      }
      if (isAggregateSearchProvider(siteSearchState)) {
        const activeDefinition = (aggregateSearchesCache || []).find((item) => (
          String(item && item.id ? item.id : '') === String(siteSearchState.aggregateId || '')
        ));
        if (!isAggregateSearchDefinitionAvailable(activeDefinition, siteSearchProvidersCache)) {
          clearSiteSearch();
        }
      }
      if (inputModeController && typeof inputModeController.refreshModeMenu === 'function') {
        inputModeController.refreshModeMenu();
      }
      if (latestQuery) {
        requestSuggestions(latestQuery, { immediate: true });
      }
    });
  });

  inputParts.input.addEventListener('compositionstart', function(event) {
    suggestionRequestSeq += 1;
    directNavigationSettleController.cancel();
    if (remoteSuggestionDebounceTimer) {
      clearTimeout(remoteSuggestionDebounceTimer);
      remoteSuggestionDebounceTimer = null;
    }
    if (suggestionRequestWatchdogTimer) {
      clearTimeout(suggestionRequestWatchdogTimer);
      suggestionRequestWatchdogTimer = null;
    }
    imeKeyGuard.markCompositionStart(event);
    clearAutocomplete();
  });

  inputParts.input.addEventListener('compositionend', function(event) {
    imeKeyGuard.markCompositionEnd(event);
    const rawValue = event.target.value;
    const query = rawValue.trim();
    latestQuery = query;
    latestRawQuery = rawValue;
    clearAutocomplete();
    if (!query) {
      if (remoteSuggestionDebounceTimer) {
        clearTimeout(remoteSuggestionDebounceTimer);
        remoteSuggestionDebounceTimer = null;
      }
      clearSearchSuggestions();
      return;
    }
    const directUrlSuggestion = getDirectUrlSuggestion(query);
    if (directUrlSuggestion) {
      const hasCachedOpenTabMatch =
        typeof directUrlSuggestion._xMatchedTabId === 'number';
      if (hasCachedOpenTabMatch) {
        renderPendingSuggestions(query);
      }
      requestSuggestions(query, {
        immediate: true,
        deferInitialDirectNavigationRender: !hasCachedOpenTabMatch
      });
      return;
    }
    requestSuggestions(query);
  });

  if (BOOKMARK_CASCADE_DEBUG_UI_ENABLED && bookmarkCascadeRuntime) {
    bookmarkCascadeRuntime.createDebugControls();
  }
  createWallpaperControls();
  createFeedbackControls();
  markNewtabStartupMilestone('auxiliary-controls-created');
  document.addEventListener('pointerdown', function(event) {
    if (!isFeedbackPopoverOpen()) {
      return;
    }
    const target = event && event.target ? event.target : null;
    if (feedbackControl && (target === feedbackControl || feedbackControl.contains(target))) {
      return;
    }
    closeFeedbackPopover();
  }, true);
  document.addEventListener('keydown', function(event) {
    if (!event || event.key !== 'Escape' || !isFeedbackPopoverOpen()) {
      return;
    }
    event.preventDefault();
    closeFeedbackPopover({ restoreFocus: true });
  }, true);
  document.addEventListener('pointerdown', function(event) {
    if (!isWallpaperPanelOpen()) {
      return;
    }
    const target = event && event.target ? event.target : null;
    if (wallpaperRuntime && wallpaperRuntime.containsTarget(target)) {
      return;
    }
    closeWallpaperPanel();
  }, true);
  document.addEventListener('keydown', function(event) {
    if (!event || event.key !== 'Escape' || !isWallpaperPanelOpen()) {
      return;
    }
    event.preventDefault();
    closeWallpaperPanel({ restoreFocus: true });
  }, true);

  document.body.insertBefore(topContentContainer, root);
  searchLayer.appendChild(inputParts.container);
  root.appendChild(searchLayer);
  const newtabUpdateNoticeAnchor = root.nextSibling;
  if (shortcutSection) {
    document.body.insertBefore(shortcutSection, newtabUpdateNoticeAnchor);
  }
  if (updateNoticeController && updateNoticeController.element) {
    document.body.insertBefore(updateNoticeController.element, newtabUpdateNoticeAnchor);
    if (typeof updateNoticeController.recordExposure === 'function') {
      updateNoticeController.recordExposure();
    }
  }
  document.body.insertBefore(suggestionsSurface, newtabUpdateNoticeAnchor);
  document.body.insertBefore(suggestionsOutline, newtabUpdateNoticeAnchor);
  document.body.insertBefore(suggestionsContainer, newtabUpdateNoticeAnchor);
  // 等首轮语言解析完成后再创建，避免默认文案在新标签页首帧短暂闪现。
  Promise.all([
    initialLanguageReadyPromise,
    updateNoticeController && updateNoticeController.ready
      ? updateNoticeController.ready
      : Promise.resolve(false)
  ]).then(() => {
    if (engagementNoticeController) {
      return;
    }
    engagementNoticeController = createNewtabEngagementNoticeController();
    if (!engagementNoticeController || !engagementNoticeController.element) {
      return;
    }
    const engagementNoticeAnchor = suggestionsSurface.parentNode === document.body
      ? suggestionsSurface
      : newtabUpdateNoticeAnchor;
    document.body.insertBefore(engagementNoticeController.element, engagementNoticeAnchor);
    if (String(inputParts.input.value || '').trim() &&
        typeof engagementNoticeController.recordMeaningfulUse === 'function') {
      engagementNoticeController.recordMeaningfulUse();
    }
  });
  if (bookmarkTopbarRuntime) {
    bookmarkTopbarRuntime.mount(document.body);
  }
  bottomDockRuntime.mount(document.body);
  if (quoteRuntime) quoteRuntime.mount();
  if (wallpaperControl) {
    document.body.appendChild(wallpaperControl);
  }
  if (feedbackControl) {
    document.body.appendChild(feedbackControl);
  }
  if (shortcutDialogController) {
    shortcutDialogController.mount(document.body);
  }
  if (BOOKMARK_CASCADE_DEBUG_UI_ENABLED && bookmarkCascadeRuntime && bookmarkCascadeRuntime.getDebugControl()) {
    document.body.appendChild(bookmarkCascadeRuntime.getDebugControl());
  }
  markNewtabStartupMilestone('dom-mounted');

  let recentExternalChangeTimer = 0;
  let bookmarkExternalChangeTimer = 0;
  function scheduleRecentReloadIfVisible() {
    if (document.visibilityState !== 'visible') {
      return;
    }
    if (recentExternalChangeTimer) {
      window.clearTimeout(recentExternalChangeTimer);
    }
    recentExternalChangeTimer = window.setTimeout(() => {
      recentExternalChangeTimer = 0;
      if (document.visibilityState === 'visible') {
        loadRecentSites({ force: true });
      }
    }, NEWTAB_EXTERNAL_CHANGE_DEBOUNCE_MS);
  }

  function scheduleBookmarkReloadIfVisible() {
    if (document.visibilityState !== 'visible') {
      return;
    }
    if (bookmarkExternalChangeTimer) {
      window.clearTimeout(bookmarkExternalChangeTimer);
    }
    bookmarkExternalChangeTimer = window.setTimeout(() => {
      bookmarkExternalChangeTimer = 0;
      if (document.visibilityState === 'visible') {
        loadBookmarks({ force: true });
      }
    }, NEWTAB_EXTERNAL_CHANGE_DEBOUNCE_MS);
  }

  function bindRecentAndBookmarkChangeListeners() {
    if (chrome.history && chrome.history.onVisited && chrome.history.onVisited.addListener) {
      chrome.history.onVisited.addListener(() => {
        markRecentDataDirty();
        scheduleRecentReloadIfVisible();
      });
    }
    bookmarksRuntime.subscribe((change) => {
      // Folder entries remain useful even when the bookmarks section is hidden.
      if (newtabShortcuts.some((shortcut) => shortcut.type === 'folder')) {
        refreshShortcutFolderReferences();
      }
      const cascadeOpen = Boolean(
        bookmarkCascadeRuntime &&
        typeof bookmarkCascadeRuntime.isOpen === 'function' &&
        bookmarkCascadeRuntime.isOpen()
      );
      if (change.isControlled) {
        markBookmarkTreeDirty({
          preserveCascadeOpen: cascadeOpen,
          skipRuntimeInvalidate: true
        });
        return;
      }
      if (change.invalidatesHistory) {
        bookmarkMoveHistory.clear();
      }
      const shouldRefreshOpenCascade = change.shouldRefreshCascade && cascadeOpen;
      markBookmarkTreeDirty({
        preserveCascadeOpen: shouldRefreshOpenCascade,
        skipRuntimeInvalidate: true
      });
      scheduleBookmarkReloadIfVisible();
      if (shouldRefreshOpenCascade) {
        refreshOpenBookmarkCascadeMenu();
      }
    });
  }

  bindRecentAndBookmarkChangeListeners();
  window.addEventListener('blur', () => {
    finishShortcutDrag(null, { cancel: true });
    finishBookmarkDrag(null, { canceled: true });
  });
  window.addEventListener('visibilitychange', handleRecentVisibilityChange);
  window.addEventListener('resize', scheduleWallpaperAdaptiveToneUpdate, { passive: true });
  window.addEventListener('scroll', () => {
    scheduleWallpaperAdaptiveToneUpdate();
    positionBookmarkCascadeLevels();
  }, { passive: true });
  bottomDockRuntime.onScroll(scheduleWallpaperAdaptiveToneUpdate, { passive: true });
  const actionButtonVisibilityReadyPromise = loadNewtabActionButtonVisibility();
  observeNewtabStartupTask('action-button-visibility', actionButtonVisibilityReadyPromise);
  const shortcutPreferencesReadyPromise = loadNewtabShortcutPreferences();
  observeNewtabStartupTask('shortcut-preferences', shortcutPreferencesReadyPromise);
  const shortcutsReadyPromise = shortcutPreferencesReadyPromise.then(loadVisibleShortcuts);
  observeNewtabStartupTask('visible-shortcuts', shortcutsReadyPromise);
  const initialShortcutsReadyTask = shortcutsReadyPromise.catch((error) => {
    console.warn('[Lumno] Deferred shortcut loading failed.', error);
    return [];
  });
  const sectionPolicyReadyPromise = Promise.all([
    loadSearchBlacklistItems(),
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled()
  ]);
  observeNewtabStartupTask('section-policy', sectionPolicyReadyPromise);
  const initialLanguageReadyTask = bootstrapInitialLanguageMode();
  observeNewtabStartupTask('language', initialLanguageReadyTask);
  const initialMotionPreferenceReadyTask = globalThis.LumnoMotionPreferenceReady;
  const initialLayoutStorageReadyTask = startupStorageReadBatch
    ? startupStorageReadBatch.ready
    : Promise.resolve(true);
  const initialFontsReadyTask = document.fonts && document.fonts.ready &&
    typeof document.fonts.ready.then === 'function'
      ? document.fonts.ready.catch(() => true)
      : Promise.resolve(true);
  observeNewtabStartupTask('fonts', initialFontsReadyTask);
  const initialVisualReadyPromise = Promise.all([
    initialAppearanceReadyTask,
    initialBookmarkViewModeReadyPromise,
    loadZenMode(),
    actionButtonVisibilityReadyPromise,
    initialMotionPreferenceReadyTask,
    initialLanguageReadyTask,
    sectionPolicyReadyPromise,
    initialShortcutsReadyTask,
    initialPinnedRecentSitesReadyTask,
    initialHiddenRecentSitesReadyTask,
    initialLayoutStorageReadyTask,
    initialFontsReadyTask
  ]).catch((error) => {
    console.warn('[Lumno] Initial new tab layout setup failed.', error);
  }).then(() => {
    // Run one authoritative data pass after every layout-affecting preference
    // has settled. This keeps cached/default geometry from becoming visible and
    // then moving the entire entry when bookmarks or history arrive.
    sectionDataRevision += 1;
    const initialSectionDataRevision = sectionDataRevision;
    const recentSitesReadyTask = loadRecentSites({
      force: true,
      sectionDataRevision: initialSectionDataRevision
    });
    const bookmarksReadyTask = loadBookmarks({
      force: true,
      sectionDataRevision: initialSectionDataRevision
    });
    observeNewtabStartupTask('recent-sites', recentSitesReadyTask);
    observeNewtabStartupTask('bookmarks', bookmarksReadyTask);
    return Promise.all([recentSitesReadyTask, bookmarksReadyTask]);
  }).catch((error) => {
    console.warn('[Lumno] Initial new tab content setup failed.', error);
  }).then(() => {
    maybeShowFileAccessNotice();
    markNewtabReady();
  });
  observeNewtabStartupTask('visual-ready', initialVisualReadyPromise);
  updateBookmarkSectionPosition();
  markNewtabStartupMilestone('script-end');

})();
