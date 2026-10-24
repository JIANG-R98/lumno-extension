// @ts-nocheck
const THEME_STORAGE_KEY = '_x_extension_theme_mode_2024_unique_';
// Retained for safely migrating older WebDAV installations. New connections
// keep Chrome Sync as the preferences source and add WebDAV alongside it.
const LOCAL_PRIMARY_STORAGE_KEY = '_x_extension_local_primary_2026_unique_';
const WEBDAV_STATUS_STORAGE_KEY = '_x_extension_webdav_status_2026_unique_';
// Server address, directory and username of each WebDAV connection, in
// chrome.storage.sync so another device can offer to fill them in. The app
// password never goes here. Kept out of CHROME_SYNC_STORAGE_KEYS: it is not
// a preference and never travels through WebDAV or settings export.
const WEBDAV_CONNECTIONS_SYNC_STORAGE_KEY = '_x_extension_webdav_connections_2026_unique_';
// Synced connections this device chose not to add, kept on this device only.
const WEBDAV_DISMISSED_CONNECTIONS_STORAGE_KEY = '_x_extension_webdav_dismissed_connections_2026_unique_';
const ASSET_REVISION_STORAGE_KEY = '_x_extension_asset_revision_2026_unique_';
const NEWTAB_THEME_MODE_STORAGE_KEY = '_x_extension_newtab_theme_mode_2026_unique_';
const NEWTAB_THEME_SCOPE_STORAGE_KEY = '_x_extension_newtab_theme_scope_2026_unique_';
const NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY = '_x_extension_newtab_shortcuts_visible_2026_unique_';
const NEWTAB_SHORTCUTS_CHUNK_2_STORAGE_KEY = '_x_extension_newtab_shortcuts_chunk_2_2026_unique_';
const NEWTAB_SHORTCUTS_CHUNK_3_STORAGE_KEY = '_x_extension_newtab_shortcuts_chunk_3_2026_unique_';
// Grouped shortcut state; the three keys above hold the older flat list.
const NEWTAB_SHORTCUTS_V2_STORAGE_KEYS = Object.freeze([
  '_x_extension_newtab_shortcuts_v2_2026_unique_',
  '_x_extension_newtab_shortcuts_v2_chunk_2_2026_unique_',
  '_x_extension_newtab_shortcuts_v2_chunk_3_2026_unique_'
]);
const NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY = '_x_extension_newtab_shortcut_add_visible_2026_unique_';
const NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY = '_x_extension_newtab_shortcut_dock_magnification_enabled_2026_unique_';
const NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY = '_x_extension_newtab_feedback_button_visible_2026_unique_';
const NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY = '_x_extension_newtab_appearance_button_visible_2026_unique_';
const NEWTAB_GLASS_STYLE_STORAGE_KEY = '_x_extension_newtab_glass_style_2026_unique_';
// 'none' keeps the original New Tab surfaces; the others swap in a glass material.
const NEWTAB_GLASS_STYLES = Object.freeze(['none', 'frosted', 'liquid']);
// Light or dark under a glass material: 'follow' takes the New Tab's own theme (where the light
// theme still turns plates dark over a dark wallpaper); 'light' and 'dark' hold the page there.
const NEWTAB_GLASS_THEME_STORAGE_KEY = '_x_extension_newtab_glass_theme_2026_unique_';
const NEWTAB_GLASS_THEMES = Object.freeze(['follow', 'light', 'dark']);
const NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY = '_x_extension_newtab_shortcut_width_2026_unique_';
const NEWTAB_SHORTCUT_WIDTH_MIN = 360;
const NEWTAB_SHORTCUT_WIDTH_MAX = 1440;
const NEWTAB_SHORTCUT_WIDTH_DEFAULT = 920;
const NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY =
  '_x_extension_newtab_shortcut_columns_2026_unique_';
const NEWTAB_SHORTCUT_COLUMNS_MIN = 4;
const NEWTAB_SHORTCUT_COLUMNS_MAX = 16;
const NEWTAB_SHORTCUT_COLUMNS_DEFAULT = 10;
const NEWTAB_SHORTCUT_SIZE_STORAGE_KEY =
  '_x_extension_newtab_shortcut_size_2026_unique_';
const NEWTAB_SHORTCUT_SIZE_MIN = 48;
const NEWTAB_SHORTCUT_SIZE_MAX = 112;
const NEWTAB_SHORTCUT_SIZE_DEFAULT = 64;
const NEWTAB_SHORTCUT_GAP_STORAGE_KEY =
  '_x_extension_newtab_shortcut_gap_2026_unique_';
const NEWTAB_SHORTCUT_GAP_MIN = 0;
const NEWTAB_SHORTCUT_GAP_MAX = 24;
const NEWTAB_SHORTCUT_GAP_DEFAULT = 4;
const NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY = '_x_extension_newtab_input_auto_focus_enabled_2026_unique_';
// localStorage keys: the New Tab's startup read, auto-focus choice and locale from its last load,
// so the next load can act on them before its scripts finish loading.
const NEWTAB_STARTUP_STORAGE_KEYS_CACHE_KEY = '_x_extension_newtab_startup_storage_keys_2026_unique_';
const NEWTAB_INPUT_AUTO_FOCUS_CACHE_KEY = '_x_extension_newtab_input_auto_focus_cache_2026_unique_';
const NEWTAB_LOCALE_CACHE_KEY = '_x_extension_newtab_locale_cache_2026_unique_';
const NEWTAB_QUOTE_PREFS_STORAGE_KEY = '_x_extension_newtab_quote_prefs_2026_unique_';
// Online wallpaper picks live apart from the shared wallpaper key, which older versions sanitize.
const NEWTAB_ONLINE_WALLPAPER_STORAGE_KEY = '_x_extension_newtab_online_wallpaper_2026_unique_';
// Wallpapers added from a link sync as their URLs; each device caches the image itself.
const NEWTAB_LINK_WALLPAPERS_STORAGE_KEY = '_x_extension_newtab_link_wallpapers_2026_unique_';
// A photo picked while a daily wallpaper is on replaces it until the local date changes.
const NEWTAB_DAILY_WALLPAPER_PICKS_STORAGE_KEY = '_x_extension_newtab_daily_wallpaper_picks_2026_unique_';
// Curated categories left out of the random mix; empty keeps every category in.
const NEWTAB_CURATED_MIX_EXCLUDED_STORAGE_KEY = '_x_extension_newtab_curated_mix_excluded_2026_unique_';
const NEWTAB_QUOTE_FONT_SIZE_MIN = 12;
const NEWTAB_QUOTE_FONT_SIZE_MAX = 24;
const NEWTAB_QUOTE_FONT_SIZE_DEFAULT = 15;
const NEWTAB_QUOTE_FONT_DEFAULT = 'wenkai';
// The bundled faces are subsets declared in assets/fonts/<face>/<face>.css
// (scripts/build/subset-quote-font.py); the sans face only names system fonts.
// Glyphs a face lacks fall back along its own stack.
const NEWTAB_QUOTE_SERIF_FALLBACK = '"Songti SC", "Songti TC", "STSong", "SimSun", "NSimSun", ' +
  '"Noto Serif CJK SC", "Source Han Serif SC", Georgia, "Times New Roman", serif';
const NEWTAB_QUOTE_FONTS = Object.freeze([
  Object.freeze({
    id: 'wenkai',
    labelKey: 'newtab_quote_font_wenkai',
    label: 'LXGW WenKai',
    family: `"LXGW WenKai", ${NEWTAB_QUOTE_SERIF_FALLBACK}`
  }),
  Object.freeze({
    id: 'xiaowei',
    labelKey: 'newtab_quote_font_xiaowei',
    label: 'ZCOOL XiaoWei',
    family: `"Lumno Quote XiaoWei", ${NEWTAB_QUOTE_SERIF_FALLBACK}`
  }),
  Object.freeze({
    id: 'sans',
    labelKey: 'newtab_quote_font_sans',
    label: 'Sans-serif',
    family: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", ' +
      '"Source Han Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  })
]);
const BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY = '_x_extension_bookmark_folder_icons_visible_2026_unique_';
// Folder colors are keyed by bookmark path, not the device-only bookmark id.
const BOOKMARK_FOLDER_COLOR_REFS_STORAGE_KEY = '_x_extension_bookmark_folder_color_refs_2026_unique_';
const BOOKMARK_FOLDER_COLOR_PRESETS_STORAGE_KEY = '_x_extension_bookmark_folder_color_presets_2026_unique_';
const UPDATE_NOTICE_ENABLED_STORAGE_KEY = '_x_extension_update_notice_enabled_2026_unique_';
const MOTION_EFFECTS_ENABLED_STORAGE_KEY = '_x_extension_motion_effects_enabled_2026_unique_';
const SIMPLE_MODE_ENABLED_STORAGE_KEY = '_x_extension_simple_mode_enabled_2026_unique_';
const NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY = '_x_extension_number_shortcut_instant_enabled_2026_unique_';
const MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY =
  '_x_extension_macos_ctrl_suggestion_navigation_enabled_2026_unique_';
const FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY = '_x_extension_favicon_enhanced_fetch_enabled_2026_unique_';
const SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY = '_x_extension_search_result_display_limit_2026_unique_';
const SEARCH_RESULT_TAB_POSITION_STORAGE_KEY = '_x_extension_search_result_tab_position_2026_unique_';
const SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY = '_x_extension_search_fuzzy_pinyin_enabled_2026_unique_';
const OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY = '_x_extension_overlay_open_tabs_default_visible_2026_unique_';
const OVERLAY_ENTER_ANIMATION_STORAGE_KEY = '_x_extension_overlay_enter_animation_2026_unique_';
const OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY = '_x_extension_overlay_page_theme_adaptation_enabled_2026_unique_';
const SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY = '_x_extension_selection_quick_actions_enabled_2026_unique_';
const SELECTION_QUICK_ACTIONS_PROVIDER_STORAGE_KEY = '_x_extension_selection_quick_actions_provider_2026_unique_';
const SELECTION_QUICK_ACTIONS_GROUP_ENABLED_STORAGE_KEY = '_x_extension_selection_quick_actions_group_enabled_2026_unique_';
const AGGREGATE_SEARCH_STORAGE_KEY = '_x_extension_aggregate_searches_2026_unique_';
const AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY =
  '_x_extension_aggregate_search_auto_group_enabled_2026_unique_';
// One flat record holds the reader's custom order for every Search sources
// list plus the search scope group order. Only short keys are stored, so the
// record stays well inside the 8 KB Chrome Sync item budget.
const SEARCH_SOURCE_ORDER_STORAGE_KEY = '_x_extension_search_source_order_2026_unique_';
const PROGRESS_TRACKING_ENABLED_STORAGE_KEY = '_x_extension_progress_tracking_enabled_2026_unique_';
// Which New Tab surfaces open a plain click in a new foreground tab instead of the New Tab itself.
const NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY = '_x_extension_newtab_open_in_new_tab_2026_unique_';
const NEWTAB_OPEN_IN_NEW_TAB_SURFACES = Object.freeze(['search', 'shortcuts', 'bookmarks', 'recentSites']);
// Bookmark bar material is chosen against the wallpaper. Browser sync
// carries no custom wallpapers, so these values never enter Chrome Sync.
const BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS = Object.freeze([
  '_x_extension_bookmark_topbar_surface_mode_2026_unique_',
  '_x_extension_bookmark_topbar_surface_color_light_2026_unique_',
  '_x_extension_bookmark_topbar_surface_color_dark_2026_unique_',
  '_x_extension_bookmark_topbar_surface_color_2026_unique_'
]);
// WebDAV carries them together with the wallpapers. The legacy single color
// is migrated into the light and dark colors on each device.
const BOOKMARK_TOPBAR_WEBDAV_STORAGE_KEYS = Object.freeze(BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS.slice(0, 3));
const LANGUAGE_STORAGE_KEY = '_x_extension_language_2024_unique_';
const RECENT_MODE_STORAGE_KEY = '_x_extension_recent_mode_2024_unique_';
const RECENT_COUNT_STORAGE_KEY = '_x_extension_recent_count_2024_unique_';
const NEWTAB_WIDTH_MODE_STORAGE_KEY = '_x_extension_newtab_width_mode_2026_unique_';
const NEWTAB_SEARCH_WIDTH_STORAGE_KEY = '_x_extension_newtab_search_width_2026_unique_';
const NEWTAB_ZEN_MODE_STORAGE_KEY = '_x_extension_newtab_zen_mode_2026_unique_';
const NEWTAB_WALLPAPER_STORAGE_KEY = '_x_extension_newtab_wallpaper_2026_unique_';
const NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY = '_x_extension_newtab_wallpaper_overlay_2026_unique_';
const NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY = '_x_extension_newtab_wallpaper_effect_2026_unique_';
const NEWTAB_FAVICON_STORAGE_KEY = '_x_extension_newtab_favicon_2026_unique_';
const OVERLAY_SIZE_MODE_STORAGE_KEY = '_x_extension_overlay_size_mode_2026_unique_';
// An installed family name, or the empty string for the bundled Lumno stack.
// A missing face falls back to the bundled stack.
const OVERLAY_FONT_FAMILY_STORAGE_KEY = '_x_extension_overlay_font_family_2026_unique_';
// Second family in the stack, used for glyphs the first one lacks (an
// English face leaves the Chinese text to this one).
const OVERLAY_FONT_FALLBACK_STORAGE_KEY = '_x_extension_overlay_font_fallback_2026_unique_';
// Display names of the two chosen families ({ family: name }), so a face
// uninstalled later is still named by its localized name ("PingFang SC" is
// only the family name).
const OVERLAY_FONT_LABELS_STORAGE_KEY = '_x_extension_overlay_font_labels_2026_unique_';
// The fonts are this computer's installed faces, so the choice stays on the
// device: always chrome.storage.local, never Chrome Sync, WebDAV or an
// export. Another device has its own fonts and its own choice.
const OVERLAY_FONT_LOCAL_STORAGE_KEYS = Object.freeze([
  OVERLAY_FONT_FAMILY_STORAGE_KEY,
  OVERLAY_FONT_FALLBACK_STORAGE_KEY,
  OVERLAY_FONT_LABELS_STORAGE_KEY
]);
// The shared text stack token (tokens.css). The overlay's closed shadow root
// defines it on the panel and re-points it at the chosen families, so every
// text rule follows without a rule the search-panel script would inject.
const OVERLAY_FONT_FAMILY_CSS_VAR = '--lumno-font-sans';
const BOOKMARK_COUNT_STORAGE_KEY = '_x_extension_bookmark_count_2024_unique_';
const BOOKMARK_COLUMNS_STORAGE_KEY = '_x_extension_bookmark_columns_2024_unique_';
const BOOKMARK_VIEW_MODE_STORAGE_KEY = '_x_extension_bookmark_view_mode_2026_unique_';
const PINNED_RECENT_SITES_STORAGE_KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';
const HIDDEN_RECENT_SITES_STORAGE_KEY = '_x_extension_newtab_hidden_recent_sites_2026_unique_';
const NEWTAB_SHORTCUTS_STORAGE_KEY = '_x_extension_newtab_shortcuts_2026_unique_';
const AUTO_PIP_ENABLED_STORAGE_KEY = '_x_extension_auto_pip_enabled_2026_unique_';
const TAB_SWITCHER_ENABLED_STORAGE_KEY = '_x_extension_tab_switcher_enabled_2026_unique_';
const DOCUMENT_PIP_ENABLED_STORAGE_KEY = '_x_extension_document_pip_enabled_2026_unique_';
const PINNED_TAB_RECOVERY_ENABLED_STORAGE_KEY = '_x_extension_pinned_tab_recovery_enabled_2026_unique_';
const LINK_PREVIEW_ENABLED_STORAGE_KEY = '_x_extension_link_preview_enabled_2026_unique_';
const OVERLAY_TAB_PRIORITY_STORAGE_KEY = '_x_extension_overlay_tab_priority_2024_unique_';
const RESTRICTED_ACTION_STORAGE_KEY = '_x_extension_restricted_action_2024_unique_';
const SEARCH_RESULT_PRIORITY_STORAGE_KEY = '_x_extension_search_result_priority_2026_unique_';
const SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY = '_x_extension_search_result_source_types_2026_unique_';
const FALLBACK_SHORTCUT_STORAGE_KEY = '_x_extension_fallback_hotkey_2024_unique_';
const SITE_SEARCH_STORAGE_KEY = '_x_extension_site_search_custom_2024_unique_';
const SITE_SEARCH_DISABLED_STORAGE_KEY = '_x_extension_site_search_disabled_2024_unique_';
const SEARCH_BLACKLIST_STORAGE_KEY = '_x_extension_search_blacklist_2026_unique_';
const FAVICON_REQUEST_BLACKLIST_STORAGE_KEY = '_x_extension_favicon_request_blacklist_2026_unique_';
const DEFAULT_SEARCH_ENGINE_STORAGE_KEY = '_x_extension_default_search_engine_2024_unique_';
// When and how settings last synced (manual sync or an import); written to the primary area.
const SYNC_META_STORAGE_KEY = '_x_extension_sync_meta_2024_unique_';
const RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY = '_x_extension_restricted_action_auto_browser_setting_done_2026_unique_';
// localStorage: the Options page theme from its last load, applied before its scripts load.
const OPTIONS_THEME_PRELOAD_STORAGE_KEY = '_x_extension_options_theme_preload_2026_unique_';
const SELECTION_QUICK_ACTIONS_PROVIDER_KEYS = Object.freeze([
  'gpt',
  'gm',
  'dbai',
  'qw',
  'yb',
  'mx',
  'ds',
  'kimi',
  'cp',
  'grok',
  'qwen',
  'ais'
]);
// Keep the original key value so existing installations migrate from boolean to mode in place.
const NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY = '_x_extension_newtab_wordmark_visible_2026_unique_';
const NEWTAB_TOP_CONTENT_BRAND = 'brand';
const NEWTAB_TOP_CONTENT_TIME = 'time';
const NEWTAB_TOP_CONTENT_OFF = 'off';
const NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY =
  '_x_extension_newtab_time_font_weight_2026_unique_';
const NEWTAB_TIME_FONT_WEIGHT_MIN = 300;
const NEWTAB_TIME_FONT_WEIGHT_MAX = 800;
const NEWTAB_TIME_FONT_WEIGHT_DEFAULT = 320;
// The clock's size at full window width, in px; narrower windows scale it
// down in proportion.
const NEWTAB_TIME_FONT_SIZE_STORAGE_KEY = '_x_extension_newtab_time_font_size_2026_unique_';
const NEWTAB_TIME_FONT_SIZE_MIN = 32;
const NEWTAB_TIME_FONT_SIZE_MAX = 96;
const NEWTAB_TIME_FONT_SIZE_DEFAULT = 54;
// The clock's opacity, in percent.
const NEWTAB_TIME_OPACITY_STORAGE_KEY = '_x_extension_newtab_time_opacity_2026_unique_';
const NEWTAB_TIME_OPACITY_MIN = 20;
const NEWTAB_TIME_OPACITY_MAX = 100;
const NEWTAB_TIME_OPACITY_DEFAULT = 100;
// The clock's ink: 'auto' follows the wallpaper or theme behind it; 'light'
// and 'dark' hold it there.
const NEWTAB_TIME_INK_STORAGE_KEY = '_x_extension_newtab_time_ink_2026_unique_';
const NEWTAB_TIME_INKS = Object.freeze(['auto', 'light', 'dark']);
const NEWTAB_TIME_INK_DEFAULT = 'auto';
const NEWTAB_TIME_FONT_STORAGE_KEY = '_x_extension_newtab_time_font_2026_unique_';
const NEWTAB_TIME_FONT_DEFAULT = 'open-sans';
// The stored weight stays within 300-800; each face clamps it to the range
// it draws well. The "Lumno Clock" faces are digit-only subsets declared in
// assets/fonts/clock/clock-fonts.css (scripts/build/subset-clock-fonts.py), so
// their weight ranges must match the ones built there. tracking is the
// letter spacing in em at the face's lightest and heaviest weight: light
// strokes leave room to set digits tighter, heavy ones need air. null keeps
// Open Sans's stepped weight-based tracking.
const NEWTAB_TIME_FONTS = Object.freeze([
  Object.freeze({
    id: 'open-sans',
    label: 'Open Sans',
    family: '"Open Sans", sans-serif',
    stretch: '86%',
    minWeight: 300,
    maxWeight: 800,
    defaultWeight: 320,
    tracking: null,
    colonGap: 0.055,
    colonShift: -0.035
  }),
  Object.freeze({
    id: 'geist',
    label: 'Geist',
    family: '"Lumno Clock Geist", "Open Sans", sans-serif',
    stretch: '',
    minWeight: 300,
    maxWeight: 800,
    defaultWeight: 320,
    tracking: [-0.045, -0.02],
    colonGap: 0.04,
    colonShift: -0.06
  }),
  Object.freeze({
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: '"Lumno Clock JetBrains Mono", "Open Sans", monospace',
    stretch: '',
    minWeight: 300,
    maxWeight: 800,
    defaultWeight: 320,
    tracking: [-0.06, -0.035],
    colonGap: -0.06,
    colonShift: -0.02
  }),
  Object.freeze({
    id: 'bricolage-grotesque',
    label: 'Bricolage Grotesque',
    family: '"Lumno Clock Bricolage Grotesque", "Open Sans", sans-serif',
    stretch: '',
    minWeight: 300,
    maxWeight: 800,
    defaultWeight: 320,
    tracking: [-0.045, -0.015],
    colonGap: 0.1,
    colonShift: -0.06
  }),
  Object.freeze({
    id: 'unbounded',
    label: 'Unbounded',
    family: '"Lumno Clock Unbounded", "Open Sans", sans-serif',
    stretch: '',
    minWeight: 300,
    maxWeight: 800,
    defaultWeight: 320,
    tracking: [-0.05, -0.02],
    colonGap: 0.05,
    colonShift: -0.04
  }),
  // Solid round dots; past 550 the dots run into each other.
  Object.freeze({
    id: 'bitcount',
    label: 'Bitcount',
    family: '"Lumno Clock Bitcount", "Open Sans", monospace',
    stretch: '',
    minWeight: 300,
    maxWeight: 550,
    defaultWeight: 480,
    tracking: [-0.03, 0],
    colonGap: -0.08,
    colonShift: -0.09
  })
]);
const NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY =
  '_x_extension_newtab_time_seconds_visible_2026_unique_';
// Off keeps the 24-hour clock; on draws 1-12 with the locale's AM/PM.
const NEWTAB_TIME_12_HOUR_STORAGE_KEY = '_x_extension_newtab_time_12_hour_2026_unique_';
// User-controlled preferences that are safe to store in chrome.storage.sync.
// Keep generated caches, device state, and custom wallpaper media out of this list.
const CHROME_SYNC_STORAGE_KEYS = Object.freeze([
  THEME_STORAGE_KEY,
  LANGUAGE_STORAGE_KEY,
  RECENT_MODE_STORAGE_KEY,
  RECENT_COUNT_STORAGE_KEY,
  NEWTAB_WIDTH_MODE_STORAGE_KEY,
  NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
  NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
  NEWTAB_QUOTE_PREFS_STORAGE_KEY,
  NEWTAB_THEME_MODE_STORAGE_KEY,
  NEWTAB_THEME_SCOPE_STORAGE_KEY,
  NEWTAB_ZEN_MODE_STORAGE_KEY,
  NEWTAB_WALLPAPER_STORAGE_KEY,
  NEWTAB_ONLINE_WALLPAPER_STORAGE_KEY,
  NEWTAB_LINK_WALLPAPERS_STORAGE_KEY,
  NEWTAB_DAILY_WALLPAPER_PICKS_STORAGE_KEY,
  NEWTAB_CURATED_MIX_EXCLUDED_STORAGE_KEY,
  NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY,
  NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
  NEWTAB_FAVICON_STORAGE_KEY,
  OVERLAY_SIZE_MODE_STORAGE_KEY,
  OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
  OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY,
  BOOKMARK_COUNT_STORAGE_KEY,
  BOOKMARK_COLUMNS_STORAGE_KEY,
  BOOKMARK_VIEW_MODE_STORAGE_KEY,
  BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
  BOOKMARK_FOLDER_COLOR_REFS_STORAGE_KEY,
  BOOKMARK_FOLDER_COLOR_PRESETS_STORAGE_KEY,
  PINNED_RECENT_SITES_STORAGE_KEY,
  HIDDEN_RECENT_SITES_STORAGE_KEY,
  NEWTAB_SHORTCUTS_STORAGE_KEY,
  NEWTAB_SHORTCUTS_CHUNK_2_STORAGE_KEY,
  NEWTAB_SHORTCUTS_CHUNK_3_STORAGE_KEY,
  ...NEWTAB_SHORTCUTS_V2_STORAGE_KEYS,
  NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
  NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
  NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
  NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
  NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
  NEWTAB_GLASS_STYLE_STORAGE_KEY,
  NEWTAB_GLASS_THEME_STORAGE_KEY,
  NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
  NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
  NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
  NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
  UPDATE_NOTICE_ENABLED_STORAGE_KEY,
  MOTION_EFFECTS_ENABLED_STORAGE_KEY,
  SIMPLE_MODE_ENABLED_STORAGE_KEY,
  NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
  MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
  AUTO_PIP_ENABLED_STORAGE_KEY,
  TAB_SWITCHER_ENABLED_STORAGE_KEY,
  DOCUMENT_PIP_ENABLED_STORAGE_KEY,
  PINNED_TAB_RECOVERY_ENABLED_STORAGE_KEY,
  LINK_PREVIEW_ENABLED_STORAGE_KEY,
  SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY,
  SELECTION_QUICK_ACTIONS_PROVIDER_STORAGE_KEY,
  SELECTION_QUICK_ACTIONS_GROUP_ENABLED_STORAGE_KEY,
  OVERLAY_TAB_PRIORITY_STORAGE_KEY,
  NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
  NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
  NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
  NEWTAB_TIME_OPACITY_STORAGE_KEY,
  NEWTAB_TIME_INK_STORAGE_KEY,
  NEWTAB_TIME_FONT_STORAGE_KEY,
  NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
  NEWTAB_TIME_12_HOUR_STORAGE_KEY,
  RESTRICTED_ACTION_STORAGE_KEY,
  SEARCH_RESULT_PRIORITY_STORAGE_KEY,
  SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
  SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
  SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
  SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY,
  OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
  FALLBACK_SHORTCUT_STORAGE_KEY,
  SITE_SEARCH_STORAGE_KEY,
  SITE_SEARCH_DISABLED_STORAGE_KEY,
  AGGREGATE_SEARCH_STORAGE_KEY,
  AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY,
  SEARCH_SOURCE_ORDER_STORAGE_KEY,
  PROGRESS_TRACKING_ENABLED_STORAGE_KEY,
  NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
  SEARCH_BLACKLIST_STORAGE_KEY,
  FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
  FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
  DEFAULT_SEARCH_ENGINE_STORAGE_KEY
]);


// The UI languages, in the language picker's order. `id` is the _locales
// folder (a Chrome locale code), `name` is the language in its own words.
// Right-to-left languages are left out until the styles handle them.
// `machineTranslated` marks copy that no native speaker has reviewed yet.
const UI_LOCALES = Object.freeze([
  ['zh_CN', '简体中文'],
  ['zh_TW', '繁體中文'],
  ['ja', '日本語'],
  ['en', 'English'],
  ['ko', '한국어', true],
  ['id', 'Bahasa Indonesia', true],
  ['ms', 'Bahasa Melayu', true],
  ['ca', 'Català', true],
  ['cs', 'Čeština', true],
  ['da', 'Dansk', true],
  ['de', 'Deutsch', true],
  ['et', 'Eesti', true],
  ['es', 'Español', true],
  ['fil', 'Filipino', true],
  ['fr', 'Français', true],
  ['hr', 'Hrvatski', true],
  ['it', 'Italiano', true],
  ['sw', 'Kiswahili', true],
  ['lv', 'Latviešu', true],
  ['lt', 'Lietuvių', true],
  ['hu', 'Magyar', true],
  ['nl', 'Nederlands', true],
  ['no', 'Norsk', true],
  ['pl', 'Polski', true],
  ['pt_BR', 'Português (Brasil)', true],
  ['pt_PT', 'Português (Portugal)', true],
  ['ro', 'Română', true],
  ['sk', 'Slovenčina', true],
  ['sl', 'Slovenščina', true],
  ['fi', 'Suomi', true],
  ['sv', 'Svenska', true],
  ['vi', 'Tiếng Việt', true],
  ['tr', 'Türkçe', true],
  ['el', 'Ελληνικά', true],
  ['bg', 'Български', true],
  ['ru', 'Русский', true],
  ['sr', 'Српски', true],
  ['uk', 'Українська', true],
  ['am', 'አማርኛ', true],
  ['hi', 'हिन्दी', true],
  ['mr', 'मराठी', true],
  ['bn', 'বাংলা', true],
  ['gu', 'ગુજરાતી', true],
  ['ta', 'தமிழ்', true],
  ['te', 'తెలుగు', true],
  ['kn', 'ಕನ್ನಡ', true],
  ['ml', 'മലയാളം', true],
  ['th', 'ไทย', true]
].map(([id, name, machineTranslated]) => Object.freeze({
  id,
  htmlLang: id.replace('_', '-'),
  name,
  machineTranslated: Boolean(machineTranslated)
})));
const UI_LOCALES_BY_ID = new Map(UI_LOCALES.map((entry) => [entry.id, entry]));
// Language subtags browsers report under another name than the _locales folder.
const LOCALE_SUBTAG_ALIASES = Object.freeze({ nb: 'no', nn: 'no', tl: 'fil', in: 'id' });

// The _locales folder for a browser or stored language tag, or '' when
// Lumno has no copy in that language.
function resolveSupportedLocale(locale) {
  const lower = String(locale || '').trim().toLowerCase().replace(/_/g, '-');
  if (!lower) {
    return '';
  }
  if (lower.startsWith('zh')) {
    if (lower.includes('tw') || lower.includes('hk') || lower.includes('mo') || lower.includes('hant')) {
      return 'zh_TW';
    }
    return 'zh_CN';
  }
  const [language, ...rest] = lower.split('-');
  if (language === 'pt') {
    return rest.includes('pt') ? 'pt_PT' : 'pt_BR';
  }
  const id = LOCALE_SUBTAG_ALIASES[language] || language;
  return UI_LOCALES_BY_ID.has(id) ? id : '';
}

function normalizeLocale(locale) {
  return resolveSupportedLocale(locale) || 'en';
}

function localeToHtmlLang(locale) {
  return UI_LOCALES_BY_ID.get(normalizeLocale(locale)).htmlLang;
}

function isMachineTranslatedLocale(locale) {
  return UI_LOCALES_BY_ID.get(normalizeLocale(locale)).machineTranslated;
}

function normalizeNewtabWidthMode(value) {
  return value === 'standard' ? 'standard' : 'wide';
}

function normalizeNewtabSearchWidth(value, options) {
  const config = options || {};
  const allowNull = Boolean(config.allowNull);
  const min = Number.isFinite(Number(config.min)) ? Number(config.min) : 640;
  const max = Number.isFinite(Number(config.max)) ? Number(config.max) : 1040;
  const fallback = Number.isFinite(Number(config.fallback)) ? Number(config.fallback) : 920;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return allowNull ? null : fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeNewtabTopContentMode(value) {
  if (value === NEWTAB_TOP_CONTENT_TIME) {
    return NEWTAB_TOP_CONTENT_TIME;
  }
  if (value === NEWTAB_TOP_CONTENT_OFF || value === false) {
    return NEWTAB_TOP_CONTENT_OFF;
  }
  return NEWTAB_TOP_CONTENT_BRAND;
}

function normalizeNewtabQuotePrefs(value) {
  const source = value && typeof value === 'object' ? value : {};
  const size = typeof source.fontSize === 'number' ||
    (typeof source.fontSize === 'string' && source.fontSize.trim())
    ? Number(source.fontSize) : NaN;
  return {
    // Off until the user turns it on; a saved position alone never enables it.
    enabled: source.enabled === true,
    // 'search' predates the input-box placement and still means "below shortcuts".
    position: ['top', 'input', 'bottom'].includes(source.position) ? source.position : 'search',
    category: source.category === 'poetry' ? 'poetry' : 'literature',
    // 'custom' reads the reader's imported collection on this device.
    provider: source.provider === 'custom' ? 'custom' : 'hitokoto',
    font: NEWTAB_QUOTE_FONTS.some((font) => font.id === source.font) ? source.font : NEWTAB_QUOTE_FONT_DEFAULT,
    fontSize: Number.isFinite(size)
      ? Math.min(NEWTAB_QUOTE_FONT_SIZE_MAX, Math.max(NEWTAB_QUOTE_FONT_SIZE_MIN, Math.round(size)))
      : NEWTAB_QUOTE_FONT_SIZE_DEFAULT
  };
}

function normalizeNewtabWordmarkVisible(value) {
  return normalizeNewtabTopContentMode(value) !== NEWTAB_TOP_CONTENT_OFF;
}

function normalizeNewtabTimeSecondsVisible(value) {
  return value === true;
}

function normalizeNewtabTime12Hour(value) {
  return value === true;
}

function normalizeNewtabTimeFontWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return NEWTAB_TIME_FONT_WEIGHT_DEFAULT;
  }
  return Math.min(
    NEWTAB_TIME_FONT_WEIGHT_MAX,
    Math.max(NEWTAB_TIME_FONT_WEIGHT_MIN, Math.round(number))
  );
}

function normalizeNewtabTimeFontSize(value) {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number)) {
    return NEWTAB_TIME_FONT_SIZE_DEFAULT;
  }
  return Math.min(
    NEWTAB_TIME_FONT_SIZE_MAX,
    Math.max(NEWTAB_TIME_FONT_SIZE_MIN, Math.round(number))
  );
}

function normalizeNewtabTimeOpacity(value) {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number)) {
    return NEWTAB_TIME_OPACITY_DEFAULT;
  }
  return Math.min(
    NEWTAB_TIME_OPACITY_MAX,
    Math.max(NEWTAB_TIME_OPACITY_MIN, Math.round(number))
  );
}

function normalizeNewtabTimeInk(value) {
  return NEWTAB_TIME_INKS.includes(value) ? value : NEWTAB_TIME_INK_DEFAULT;
}

function getNewtabTimeFont(value) {
  return NEWTAB_TIME_FONTS.find((font) => font.id === value) ||
    NEWTAB_TIME_FONTS.find((font) => font.id === NEWTAB_TIME_FONT_DEFAULT);
}

function normalizeNewtabTimeFont(value) {
  return getNewtabTimeFont(value).id;
}

// Letter spacing in em for a face at a weight, or null for Open Sans's own
// stepped tracking.
function getNewtabTimeFontTracking(fontId, weight) {
  const font = getNewtabTimeFont(fontId);
  if (!Array.isArray(font.tracking)) {
    return null;
  }
  const resolvedWeight = resolveNewtabTimeFontWeight(font.id, weight);
  const span = font.maxWeight - font.minWeight;
  const amount = span > 0 ? (resolvedWeight - font.minWeight) / span : 0;
  const [light, heavy] = font.tracking;
  return Math.round((light + ((heavy - light) * amount)) * 1000) / 1000;
}

// The weight a face actually draws with: the stored weight, held to the
// range that face supports.
function resolveNewtabTimeFontWeight(fontId, weight) {
  const font = getNewtabTimeFont(fontId);
  return Math.min(
    font.maxWeight,
    Math.max(font.minWeight, normalizeNewtabTimeFontWeight(weight))
  );
}

function normalizeNewtabShortcutsVisible(value) {
  return value !== false;
}

function normalizeNewtabShortcutAddVisible(value) {
  return value !== false;
}

function normalizeNewtabShortcutDockMagnificationEnabled(value) {
  return value !== false;
}

function normalizeNewtabFeedbackButtonVisible(value) {
  return value !== false;
}

function normalizeNewtabAppearanceButtonVisible(value) {
  return value !== false;
}

function normalizeNewtabGlassStyle(value) {
  return NEWTAB_GLASS_STYLES.includes(value) ? value : 'none';
}

function normalizeNewtabGlassTheme(value) {
  return NEWTAB_GLASS_THEMES.includes(value) ? value : 'follow';
}

// The theme a glass material holds the New Tab in, or '' when the page keeps its own theme.
function getNewtabGlassThemeOverride(style, theme) {
  const glassTheme = normalizeNewtabGlassTheme(theme);
  return normalizeNewtabGlassStyle(style) !== 'none' && glassTheme !== 'follow' ? glassTheme : '';
}

function normalizeNewtabShortcutWidth(value, options) {
  const config = options || {};
  const min = Number.isFinite(Number(config.min)) ? Number(config.min) : NEWTAB_SHORTCUT_WIDTH_MIN;
  const max = Number.isFinite(Number(config.max)) ? Number(config.max) : NEWTAB_SHORTCUT_WIDTH_MAX;
  const fallback = Number.isFinite(Number(config.fallback))
    ? Number(config.fallback)
    : NEWTAB_SHORTCUT_WIDTH_DEFAULT;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Math.min(max, Math.max(min, Math.round(fallback)));
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeNewtabShortcutColumns(value, options) {
  const config = options || {};
  const min = Number.isFinite(Number(config.min))
    ? Number(config.min)
    : NEWTAB_SHORTCUT_COLUMNS_MIN;
  const max = Number.isFinite(Number(config.max))
    ? Number(config.max)
    : NEWTAB_SHORTCUT_COLUMNS_MAX;
  const fallback = Number.isFinite(Number(config.fallback))
    ? Number(config.fallback)
    : NEWTAB_SHORTCUT_COLUMNS_DEFAULT;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Math.min(max, Math.max(min, Math.round(fallback)));
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeNewtabShortcutSize(value, options) {
  const config = options || {};
  const min = Number.isFinite(Number(config.min))
    ? Number(config.min)
    : NEWTAB_SHORTCUT_SIZE_MIN;
  const max = Number.isFinite(Number(config.max))
    ? Number(config.max)
    : NEWTAB_SHORTCUT_SIZE_MAX;
  const fallback = Number.isFinite(Number(config.fallback))
    ? Number(config.fallback)
    : NEWTAB_SHORTCUT_SIZE_DEFAULT;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Math.min(max, Math.max(min, Math.round(fallback)));
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeNewtabShortcutGap(value, options) {
  const config = options || {};
  const min = Number.isFinite(Number(config.min))
    ? Number(config.min)
    : NEWTAB_SHORTCUT_GAP_MIN;
  const max = Number.isFinite(Number(config.max))
    ? Number(config.max)
    : NEWTAB_SHORTCUT_GAP_MAX;
  const fallback = Number.isFinite(Number(config.fallback))
    ? Number(config.fallback)
    : NEWTAB_SHORTCUT_GAP_DEFAULT;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Math.min(max, Math.max(min, Math.round(fallback)));
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function inferNewtabShortcutColumnsFromWidth(value, options) {
  const config = options || {};
  const widthMin = Number.isFinite(Number(config.widthMin))
    ? Number(config.widthMin)
    : NEWTAB_SHORTCUT_WIDTH_MIN;
  const widthMax = Number.isFinite(Number(config.widthMax))
    ? Number(config.widthMax)
    : NEWTAB_SHORTCUT_WIDTH_MAX;
  const columnsMin = Number.isFinite(Number(config.columnsMin))
    ? Number(config.columnsMin)
    : NEWTAB_SHORTCUT_COLUMNS_MIN;
  const columnsMax = Number.isFinite(Number(config.columnsMax))
    ? Number(config.columnsMax)
    : NEWTAB_SHORTCUT_COLUMNS_MAX;
  const width = normalizeNewtabShortcutWidth(value, {
    min: widthMin,
    max: widthMax,
    fallback: NEWTAB_SHORTCUT_WIDTH_DEFAULT
  });
  const range = Math.max(1, widthMax - widthMin);
  const ratio = (width - widthMin) / range;
  return normalizeNewtabShortcutColumns(
    columnsMin + ratio * (columnsMax - columnsMin),
    {
      min: columnsMin,
      max: columnsMax,
      fallback: NEWTAB_SHORTCUT_COLUMNS_DEFAULT
    }
  );
}

function normalizeNewtabInputAutoFocusEnabled(value) {
  return value === true;
}


function normalizeNewtabOpenInNewTab(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  NEWTAB_OPEN_IN_NEW_TAB_SURFACES.forEach((surface) => {
    normalized[surface] = source[surface] === true;
  });
  return normalized;
}

function normalizeBookmarkFolderIconsVisible(value) {
  return value !== false;
}

function normalizeBookmarkCount(value) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 32 && parsed % 4 === 0) {
    return parsed;
  }
  return 8;
}

function normalizeBookmarkColumns(value) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 4 && parsed <= 8) {
    return parsed;
  }
  return 6;
}

function normalizeUpdateNoticeEnabled(value) {
  return value !== false;
}

function normalizeMotionEffectsEnabled(value) {
  return value !== false;
}

function normalizeSimpleModeEnabled(value) {
  return value === true;
}

function normalizeNumberShortcutInstantEnabled(value) {
  return value === true;
}

function normalizeSearchFuzzyPinyinEnabled(value) {
  return value === true;
}

function normalizeMacosCtrlSuggestionNavigationEnabled(value) {
  return value === true;
}


function normalizeFaviconEnhancedFetchEnabled(value) {
  return value !== false;
}

function normalizeOverlayOpenTabsDefaultVisible(value) {
  return value !== false;
}

function normalizeOverlayPageThemeAdaptationEnabled(value) {
  return value !== false;
}

function normalizeOverlaySizeMode(value) {
  if (value === 'compact' || value === 'large') {
    return value;
  }
  return 'standard';
}

function normalizeOverlayEnterAnimation(value) {
  return value === 'fade' ? 'fade' : 'elastic';
}

// The bundled stack the overlay draws with when no family is chosen. The
// same value as --lumno-font-sans in tokens.css and on the overlay panel
// (src/overlay/react/shell.tsx); chosen families go in front of it.
const OVERLAY_FONT_DEFAULT_STACK = "'Lumno Open Sans', 'Open Sans', -apple-system, " +
  "BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// A family name arrives from storage or from the picker, so anything that
// is not a plausible CSS family name is dropped.
// Quotes and backslashes would end the quoted family early; control
// characters and braces would break out of the declaration.
function normalizeOverlayFontFamily(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const family = value.trim();
  if (!family || family.length > 120 || /["\\{}\u0000-\u001f\u007f]/.test(family)) {
    return '';
  }
  return family;
}

// Only plausible names survive. Given the chosen families, the map keeps
// just theirs; read without them, it keeps at most the two a writer stored.
function normalizeOverlayFontLabels(value, families) {
  const labels = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return labels;
  }
  (Array.isArray(families) ? families : Object.keys(value).slice(0, 2)).forEach((family) => {
    const key = normalizeOverlayFontFamily(family);
    const label = key && Object.prototype.hasOwnProperty.call(value, key) &&
      typeof value[key] === 'string'
      ? value[key].trim()
      : '';
    if (label && label.length <= 120 && !/[\u0000-\u001f\u007f]/.test(label)) {
      labels[key] = label;
    }
  });
  return labels;
}

// What the overlay writes into OVERLAY_FONT_FAMILY_CSS_VAR: the chosen
// families in order, then the bundled stack so missing faces and glyphs
// still resolve. An empty value clears the property, which restores the CSS
// fallbacks exactly.
function getOverlayFontFamilyCssValue(value, fallbackValue) {
  const families = [normalizeOverlayFontFamily(value), normalizeOverlayFontFamily(fallbackValue)]
    .filter(Boolean);
  if (families.length === 0) {
    return '';
  }
  return `${families.map((family) => `"${family}"`).join(', ')}, ${OVERLAY_FONT_DEFAULT_STACK}`;
}

function normalizeOverlayTabPriorityMode(value) {
  if (value === 'switchTabFirst') {
    return true;
  }
  if (value === 'newtabFirst') {
    return false;
  }
  if (value === false) {
    return false;
  }
  return true;
}

function normalizeSearchResultPriority(value) {
  return value === 'search' ? 'search' : 'autocomplete';
}

function normalizeSearchResultTabPosition(value) {
  return value === 'afterCurrent' || value === 'beforeCurrent' ? value : 'end';
}

function normalizeSearchResultDisplayLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 5 && parsed <= 10 ? parsed : 10;
}

const SEARCH_RESULT_SOURCE_TYPES = Object.freeze(['topSite', 'bookmark', 'history']);

function normalizeSearchResultSourceType(value) {
  const raw = String(value || '').trim();
  if (raw === 'topSite' || raw === 'topSites' || raw === 'frequent' || raw === 'common') {
    return 'topSite';
  }
  if (raw === 'bookmark' || raw === 'bookmarks') {
    return 'bookmark';
  }
  if (raw === 'history') {
    return 'history';
  }
  return '';
}

function normalizeSearchResultSourceTypes(value) {
  const rawItems = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[\s,]+/) : []);
  const selected = [];
  rawItems.forEach((item) => {
    const type = normalizeSearchResultSourceType(item);
    if (!type || selected.includes(type)) {
      return;
    }
    selected.push(type);
  });
  return selected.length > 0 ? selected : SEARCH_RESULT_SOURCE_TYPES.slice();
}

function normalizeTabRankScoreDebugMode(value) {
  return value === true;
}

function normalizeTabSwitcherEnabled(value) {
  return value !== false;
}

function normalizeLinkPreviewEnabled(value) {
  return value !== false;
}

function normalizeSelectionQuickActionsEnabled(value) {
  return value === true;
}

function normalizeSelectionQuickActionsProvider(value) {
  const key = String(value || '').trim().toLowerCase();
  return SELECTION_QUICK_ACTIONS_PROVIDER_KEYS.includes(key) ? key : 'gpt';
}

function normalizeSelectionQuickActionsGroupEnabled(value) {
  return value === true;
}

function normalizeAggregateSearchAutoGroupEnabled(value) {
  return value !== false;
}

// Pinning an episode or chapter tracks it unless the person turns this off.
function normalizeProgressTrackingEnabled(value) {
  return value !== false;
}

function normalizeThemePreference(value) {
  if (value === 'dark') {
    return 'dark';
  }
  if (value === 'light') {
    return 'light';
  }
  return '';
}

function normalizeThemeMode(value) {
  if (value === 'dark' || value === 'light') {
    return value;
  }
  return 'system';
}

function createGlobalThemeModeStorageUpdate(mode) {
  return {
    [THEME_STORAGE_KEY]: normalizeThemeMode(mode)
  };
}


export {
  LOCAL_PRIMARY_STORAGE_KEY,
  WEBDAV_STATUS_STORAGE_KEY,
  WEBDAV_CONNECTIONS_SYNC_STORAGE_KEY,
  WEBDAV_DISMISSED_CONNECTIONS_STORAGE_KEY,
  ASSET_REVISION_STORAGE_KEY,
  THEME_STORAGE_KEY,
  LANGUAGE_STORAGE_KEY,
  RECENT_MODE_STORAGE_KEY,
  RECENT_COUNT_STORAGE_KEY,
  NEWTAB_WIDTH_MODE_STORAGE_KEY,
  NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
  NEWTAB_ZEN_MODE_STORAGE_KEY,
  NEWTAB_WALLPAPER_STORAGE_KEY,
  NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY,
  NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
  NEWTAB_FAVICON_STORAGE_KEY,
  OVERLAY_SIZE_MODE_STORAGE_KEY,
  OVERLAY_FONT_FAMILY_STORAGE_KEY,
  OVERLAY_FONT_FALLBACK_STORAGE_KEY,
  OVERLAY_FONT_LABELS_STORAGE_KEY,
  OVERLAY_FONT_LOCAL_STORAGE_KEYS,
  OVERLAY_FONT_FAMILY_CSS_VAR,
  OVERLAY_FONT_DEFAULT_STACK,
  BOOKMARK_COUNT_STORAGE_KEY,
  BOOKMARK_COLUMNS_STORAGE_KEY,
  BOOKMARK_VIEW_MODE_STORAGE_KEY,
  PINNED_RECENT_SITES_STORAGE_KEY,
  HIDDEN_RECENT_SITES_STORAGE_KEY,
  NEWTAB_SHORTCUTS_STORAGE_KEY,
  AUTO_PIP_ENABLED_STORAGE_KEY,
  TAB_SWITCHER_ENABLED_STORAGE_KEY,
  DOCUMENT_PIP_ENABLED_STORAGE_KEY,
  PINNED_TAB_RECOVERY_ENABLED_STORAGE_KEY,
  LINK_PREVIEW_ENABLED_STORAGE_KEY,
  OVERLAY_TAB_PRIORITY_STORAGE_KEY,
  RESTRICTED_ACTION_STORAGE_KEY,
  SEARCH_RESULT_PRIORITY_STORAGE_KEY,
  SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
  FALLBACK_SHORTCUT_STORAGE_KEY,
  SITE_SEARCH_STORAGE_KEY,
  SITE_SEARCH_DISABLED_STORAGE_KEY,
  SEARCH_BLACKLIST_STORAGE_KEY,
  FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
  DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
  SYNC_META_STORAGE_KEY,
  RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY,
  OPTIONS_THEME_PRELOAD_STORAGE_KEY,
  NEWTAB_THEME_MODE_STORAGE_KEY,
  NEWTAB_THEME_SCOPE_STORAGE_KEY,
  NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
  NEWTAB_SHORTCUTS_CHUNK_2_STORAGE_KEY,
  NEWTAB_SHORTCUTS_CHUNK_3_STORAGE_KEY,
  NEWTAB_SHORTCUTS_V2_STORAGE_KEYS,
  NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
  NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
  NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
  NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
  NEWTAB_GLASS_STYLE_STORAGE_KEY,
  NEWTAB_GLASS_STYLES,
  NEWTAB_GLASS_THEME_STORAGE_KEY,
  NEWTAB_GLASS_THEMES,
  NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
  NEWTAB_SHORTCUT_WIDTH_MIN,
  NEWTAB_SHORTCUT_WIDTH_MAX,
  NEWTAB_SHORTCUT_WIDTH_DEFAULT,
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
  NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
  NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
  NEWTAB_OPEN_IN_NEW_TAB_SURFACES,
  NEWTAB_STARTUP_STORAGE_KEYS_CACHE_KEY,
  NEWTAB_INPUT_AUTO_FOCUS_CACHE_KEY,
  NEWTAB_LOCALE_CACHE_KEY,
  NEWTAB_QUOTE_PREFS_STORAGE_KEY,
  NEWTAB_ONLINE_WALLPAPER_STORAGE_KEY,
  NEWTAB_LINK_WALLPAPERS_STORAGE_KEY,
  NEWTAB_DAILY_WALLPAPER_PICKS_STORAGE_KEY,
  NEWTAB_CURATED_MIX_EXCLUDED_STORAGE_KEY,
  NEWTAB_QUOTE_FONT_SIZE_MIN,
  NEWTAB_QUOTE_FONT_SIZE_MAX,
  NEWTAB_QUOTE_FONT_SIZE_DEFAULT,
  NEWTAB_QUOTE_FONT_DEFAULT,
  NEWTAB_QUOTE_FONTS,
  BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
  BOOKMARK_FOLDER_COLOR_REFS_STORAGE_KEY,
  BOOKMARK_FOLDER_COLOR_PRESETS_STORAGE_KEY,
  UPDATE_NOTICE_ENABLED_STORAGE_KEY,
  MOTION_EFFECTS_ENABLED_STORAGE_KEY,
  SIMPLE_MODE_ENABLED_STORAGE_KEY,
  NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
  MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
  FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
  SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
  SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
  SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY,
  OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
  OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
  OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY,
  SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY,
  SELECTION_QUICK_ACTIONS_PROVIDER_STORAGE_KEY,
  SELECTION_QUICK_ACTIONS_GROUP_ENABLED_STORAGE_KEY,
  AGGREGATE_SEARCH_STORAGE_KEY,
  AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY,
  SEARCH_SOURCE_ORDER_STORAGE_KEY,
  PROGRESS_TRACKING_ENABLED_STORAGE_KEY,
  BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS,
  BOOKMARK_TOPBAR_WEBDAV_STORAGE_KEYS,
  CHROME_SYNC_STORAGE_KEYS,
  SELECTION_QUICK_ACTIONS_PROVIDER_KEYS,
  NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
  NEWTAB_TOP_CONTENT_BRAND,
  NEWTAB_TOP_CONTENT_TIME,
  NEWTAB_TOP_CONTENT_OFF,
  NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
  NEWTAB_TIME_FONT_WEIGHT_MIN,
  NEWTAB_TIME_FONT_WEIGHT_MAX,
  NEWTAB_TIME_FONT_WEIGHT_DEFAULT,
  NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
  NEWTAB_TIME_FONT_SIZE_MIN,
  NEWTAB_TIME_FONT_SIZE_MAX,
  NEWTAB_TIME_FONT_SIZE_DEFAULT,
  NEWTAB_TIME_OPACITY_STORAGE_KEY,
  NEWTAB_TIME_OPACITY_MIN,
  NEWTAB_TIME_OPACITY_MAX,
  NEWTAB_TIME_OPACITY_DEFAULT,
  NEWTAB_TIME_INK_STORAGE_KEY,
  NEWTAB_TIME_INKS,
  NEWTAB_TIME_INK_DEFAULT,
  NEWTAB_TIME_FONT_STORAGE_KEY,
  NEWTAB_TIME_FONT_DEFAULT,
  NEWTAB_TIME_FONTS,
  NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
  NEWTAB_TIME_12_HOUR_STORAGE_KEY,
  UI_LOCALES,
  resolveSupportedLocale,
  normalizeLocale,
  localeToHtmlLang,
  isMachineTranslatedLocale,
  normalizeNewtabWidthMode,
  normalizeNewtabSearchWidth,
  normalizeNewtabTopContentMode,
  normalizeNewtabQuotePrefs,
  normalizeNewtabWordmarkVisible,
  normalizeNewtabTimeFontWeight,
  normalizeNewtabTimeFontSize,
  normalizeNewtabTimeOpacity,
  normalizeNewtabTimeInk,
  getNewtabTimeFont,
  normalizeNewtabTimeFont,
  resolveNewtabTimeFontWeight,
  getNewtabTimeFontTracking,
  normalizeNewtabTimeSecondsVisible,
  normalizeNewtabTime12Hour,
  normalizeNewtabShortcutsVisible,
  normalizeNewtabShortcutAddVisible,
  normalizeNewtabShortcutDockMagnificationEnabled,
  normalizeNewtabFeedbackButtonVisible,
  normalizeNewtabAppearanceButtonVisible,
  normalizeNewtabGlassStyle,
  normalizeNewtabGlassTheme,
  getNewtabGlassThemeOverride,
  normalizeNewtabShortcutWidth,
  normalizeNewtabShortcutColumns,
  normalizeNewtabShortcutSize,
  normalizeNewtabShortcutGap,
  inferNewtabShortcutColumnsFromWidth,
  normalizeNewtabInputAutoFocusEnabled,
  normalizeNewtabOpenInNewTab,
  normalizeBookmarkCount,
  normalizeBookmarkColumns,
  normalizeBookmarkFolderIconsVisible,
  normalizeUpdateNoticeEnabled,
  normalizeMotionEffectsEnabled,
  normalizeSimpleModeEnabled,
  normalizeNumberShortcutInstantEnabled,
  normalizeSearchFuzzyPinyinEnabled,
  normalizeMacosCtrlSuggestionNavigationEnabled,
  normalizeFaviconEnhancedFetchEnabled,
  normalizeOverlayOpenTabsDefaultVisible,
  normalizeOverlayPageThemeAdaptationEnabled,
  normalizeOverlaySizeMode,
  normalizeOverlayEnterAnimation,
  normalizeOverlayFontFamily,
  normalizeOverlayFontLabels,
  getOverlayFontFamilyCssValue,
  normalizeOverlayTabPriorityMode,
  normalizeSearchResultPriority,
  normalizeSearchResultTabPosition,
  normalizeSearchResultDisplayLimit,
  normalizeSearchResultSourceTypes,
  normalizeTabRankScoreDebugMode,
  normalizeTabSwitcherEnabled,
  normalizeLinkPreviewEnabled,
  normalizeSelectionQuickActionsEnabled,
  normalizeSelectionQuickActionsProvider,
  normalizeSelectionQuickActionsGroupEnabled,
  normalizeAggregateSearchAutoGroupEnabled,
  normalizeProgressTrackingEnabled,
  normalizeThemePreference,
  normalizeThemeMode,
  createGlobalThemeModeStorageUpdate
};
