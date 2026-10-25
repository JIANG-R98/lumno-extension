// The New Tab page's fixed configuration: the values its menus hand back,
// layout sizes, the glass plates that sample the wallpaper, and the settings
// it moves into browser sync.
import * as LumnoSettings from '../domain/settings';
import { SHORTCUT_STORAGE_KEYS } from '../domain/shortcuts-store';
import { CONTENT_MAX_WIDTH_PX, STANDARD_SEARCH_MAX_WIDTH_PX, getGridContentWidthForColumns } from './layout';

// What a site's own name is shown as, given its brand host.
type Translate = (key: string, fallback: string) => string;

interface SiteDisplayNameOptions {
  getBrandName(brandHost: string, fallback: string): string;
}

// How wide the page lays out in each width mode.
interface NewtabWidthModeConfig {
  searchMaxWidth: number;
  contentMaxWidth: number;
  recentMaxColumns: number;
}

// Context menu items, by the value the menu reports when one is chosen.
const NEWTAB_CONTEXT_MENU_OPEN_VALUE = 'open-in-new-tab';
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
const BOOKMARK_TOPBAR_PICK_COLOR_ACTION = 'pick-bookmark-topbar-color';
const BOOKMARK_TOPBAR_SURFACE_MODE_ACTION = 'set-bookmark-topbar-surface-mode';
const BOOKMARK_TOPBAR_LAYOUT_ACTION = 'set-bookmark-topbar-layout';

// What the shortcut dialog edits besides a site.
const SHORTCUT_DIALOG_ITEM_BOOKMARK = 'bookmark';
const SHORTCUT_DIALOG_ITEM_FOLDER = 'folder';

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

// How long a favicon waits for the icon caches on the first render.
const FAVICON_CACHE_BOOT_WAIT_MS = 120;
const MAX_PINNED_RECENT_SITES = 3;

const WORDMARK_ENTRY_ANIMATION_NAME = '_x_nt_wordmark_enter_2026_unique_';
const RECENT_CARD_TARGET_WIDTH_PX = 248;
const RECENT_GRID_GAP_PX = 12;
// Narrower than this, the page flows as one column, as on a phone.
const NEWTAB_MOBILE_FLOW_BREAKPOINT_PX = 640;
const RECENT_WIDE_MAX_COLUMNS = 6;
const NEWTAB_WIDTH_MODE_CONFIGS: Readonly<Record<LumnoSettings.NewtabWidthMode, Readonly<NewtabWidthModeConfig>>> =
  Object.freeze({
    standard: Object.freeze({
      searchMaxWidth: STANDARD_SEARCH_MAX_WIDTH_PX,
      contentMaxWidth: CONTENT_MAX_WIDTH_PX,
      recentMaxColumns: 4
    }),
    wide: Object.freeze({
      searchMaxWidth: 920,
      contentMaxWidth: getGridContentWidthForColumns(RECENT_WIDE_MAX_COLUMNS, RECENT_CARD_TARGET_WIDTH_PX, RECENT_GRID_GAP_PX),
      recentMaxColumns: RECENT_WIDE_MAX_COLUMNS
    })
  });

// Preferences an older version kept in local storage, moved into browser
// sync when that is where settings live.
const SYNCED_PAGE_STORAGE_KEYS: readonly string[] = Object.freeze([
  LumnoSettings.THEME_STORAGE_KEY,
  LumnoSettings.LANGUAGE_STORAGE_KEY,
  LumnoSettings.RECENT_MODE_STORAGE_KEY,
  LumnoSettings.RECENT_COUNT_STORAGE_KEY,
  LumnoSettings.NEWTAB_WIDTH_MODE_STORAGE_KEY,
  LumnoSettings.NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
  LumnoSettings.NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
  LumnoSettings.NEWTAB_QUOTE_PREFS_STORAGE_KEY,
  LumnoSettings.NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
  LumnoSettings.NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
  LumnoSettings.NEWTAB_GLASS_STYLE_STORAGE_KEY,
  LumnoSettings.NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
  LumnoSettings.NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
  LumnoSettings.NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
  LumnoSettings.NEWTAB_TIME_OPACITY_STORAGE_KEY,
  LumnoSettings.NEWTAB_TIME_INK_STORAGE_KEY,
  LumnoSettings.NEWTAB_TIME_FONT_STORAGE_KEY,
  LumnoSettings.NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
  LumnoSettings.NEWTAB_TIME_12_HOUR_STORAGE_KEY,
  LumnoSettings.NEWTAB_THEME_MODE_STORAGE_KEY,
  LumnoSettings.NEWTAB_THEME_SCOPE_STORAGE_KEY,
  LumnoSettings.NEWTAB_ZEN_MODE_STORAGE_KEY,
  LumnoSettings.NEWTAB_WALLPAPER_STORAGE_KEY,
  LumnoSettings.NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY,
  LumnoSettings.NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
  LumnoSettings.NEWTAB_FAVICON_STORAGE_KEY,
  LumnoSettings.BOOKMARK_COUNT_STORAGE_KEY,
  LumnoSettings.BOOKMARK_COLUMNS_STORAGE_KEY,
  LumnoSettings.BOOKMARK_VIEW_MODE_STORAGE_KEY,
  LumnoSettings.BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
  LumnoSettings.BOOKMARK_CASCADE_DEBUG_STORAGE_KEY,
  LumnoSettings.TAB_RANK_SCORE_DEBUG_STORAGE_KEY,
  LumnoSettings.DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
  LumnoSettings.SEARCH_RESULT_PRIORITY_STORAGE_KEY,
  LumnoSettings.SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
  LumnoSettings.SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
  LumnoSettings.SITE_SEARCH_STORAGE_KEY,
  LumnoSettings.SITE_SEARCH_DISABLED_STORAGE_KEY,
  LumnoSettings.AGGREGATE_SEARCH_STORAGE_KEY,
  LumnoSettings.SEARCH_BLACKLIST_STORAGE_KEY,
  LumnoSettings.FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
  LumnoSettings.FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
  LumnoSettings.PINNED_RECENT_SITES_STORAGE_KEY,
  LumnoSettings.HIDDEN_RECENT_SITES_STORAGE_KEY,
  ...SHORTCUT_STORAGE_KEYS,
  LumnoSettings.NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
  LumnoSettings.NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
  LumnoSettings.NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
  LumnoSettings.NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
  LumnoSettings.NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
  LumnoSettings.NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
  LumnoSettings.NEWTAB_SHORTCUT_GAP_STORAGE_KEY
]);

// Sites whose brand reads better under its local name than its host.
function createSiteDisplayNameOptions(t: Translate): Readonly<SiteDisplayNameOptions> {
  return Object.freeze({
    getBrandName(brandHost: string, fallback: string): string {
      if (brandHost === 'mp.weixin.qq.com') {
        return t('site_brand_wechat_official', '微信公众号');
      }
      if (brandHost === 'weibo.com') {
        return t('site_search_name_weibo', '微博');
      }
      return fallback;
    }
  });
}

export {
  BOOKMARK_CONTEXT_MENU_EDIT_VALUE,
  BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE,
  BOOKMARK_TOPBAR_LAYOUT_ACTION,
  BOOKMARK_TOPBAR_PICK_COLOR_ACTION,
  BOOKMARK_TOPBAR_SURFACE_MODE_ACTION,
  FAVICON_CACHE_BOOT_WAIT_MS,
  FOLDER_COLOR_CONTEXT_MENU_VALUE,
  MAX_PINNED_RECENT_SITES,
  NEWTAB_CONTEXT_MENU_OPEN_VALUE,
  NEWTAB_GLASS_ADAPTIVE_SELECTOR,
  NEWTAB_MOBILE_FLOW_BREAKPOINT_PX,
  NEWTAB_WIDTH_MODE_CONFIGS,
  RECENT_CARD_TARGET_WIDTH_PX,
  RECENT_GRID_GAP_PX,
  RECENT_WIDE_MAX_COLUMNS,
  SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
  SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE,
  SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
  SHORTCUT_DIALOG_ITEM_BOOKMARK,
  SHORTCUT_DIALOG_ITEM_FOLDER,
  SHORTCUT_GROUP_MENU_VALUES,
  SYNCED_PAGE_STORAGE_KEYS,
  WORDMARK_ENTRY_ANIMATION_NAME,
  createSiteDisplayNameOptions
};
export type { NewtabWidthModeConfig, SiteDisplayNameOptions };
