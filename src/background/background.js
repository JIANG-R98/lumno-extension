// Classic service-worker imports run in dependency order. A missing file is a
// packaging error, so let it fail loudly instead of starting half-initialized.
importScripts(
  chrome.runtime.getURL('src/shared/blacklist-utils.js'),
  chrome.runtime.getURL('src/shared/url-guards.js'),
  chrome.runtime.getURL('src/shared/favicon/favicon-utils.js'),
  chrome.runtime.getURL('src/shared/favicon/shortcut-favicon.js'),
  chrome.runtime.getURL('src/shared/shortcut-key-matcher.js'),
  chrome.runtime.getURL('src/shared/favicon/favicon-cache.js'),
  chrome.runtime.getURL('src/newtab/theme/favicon-theme.js'),
  chrome.runtime.getURL('src/shared/extension-routes.js'),
  chrome.runtime.getURL('src/background/command-target-policy.js'),
  chrome.runtime.getURL('src/shared/settings.js'),
  chrome.runtime.getURL('src/shared/bookmark-folder-reference.js'),
  chrome.runtime.getURL('src/newtab/shortcuts/shortcuts-store.js'),
  chrome.runtime.getURL('src/shared/site-display-name.js'),
  chrome.runtime.getURL('src/background/page-shortcut-menu.js'),
  chrome.runtime.getURL('src/newtab/wallpaper/wallpaper-local-store.js'),
  chrome.runtime.getURL('src/shared/webdav-contract.js'),
  chrome.runtime.getURL('src/background/webdav-client.js'),
  chrome.runtime.getURL('src/background/webdav-sync.js'),
  chrome.runtime.getURL('src/shared/update-notice.js'),
  // Folds traditional characters to simplified ones for local search matching.
  chrome.runtime.getURL('src/shared/search/search-han-variants.js'),
  chrome.runtime.getURL('src/shared/search/search-utils.js'),
  chrome.runtime.getURL('src/shared/selection-intent.js'),
  chrome.runtime.getURL('src/shared/search/site-search-store.js'),
  chrome.runtime.getURL('src/shared/community-links.js'),
  chrome.runtime.getURL('src/shared/search/help-center-search.js'),
  chrome.runtime.getURL('src/shared/search/aggregate-search-store.js'),
  chrome.runtime.getURL('src/background/ai-provider-submit.js'),
  chrome.runtime.getURL('src/background/aggregate-search.js'),
  chrome.runtime.getURL('src/background/extension-pages.js'),
  chrome.runtime.getURL('src/background/tab-groups.js'),
  chrome.runtime.getURL('src/background/search-result-tabs.js'),
  chrome.runtime.getURL('src/background/bookmark-tab-groups.js'),
  chrome.runtime.getURL('src/background/selection-target.js'),
  chrome.runtime.getURL('src/background/selection-quick-action-provider.js'),
  chrome.runtime.getURL('src/background/selection-script-registration.js'),
  chrome.runtime.getURL('src/background/message-router.js'),
  chrome.runtime.getURL('src/background/newtab-fallback.js'),
  chrome.runtime.getURL('src/shared/browser-profile.js'),
  chrome.runtime.getURL('src/background/shortcut-rules.js'),
  chrome.runtime.getURL('src/background/pip-ownership.js'),
  chrome.runtime.getURL('src/background/pip-main-world.js'),
  chrome.runtime.getURL('src/background/recent-tab-switcher.js'),
  chrome.runtime.getURL('src/shared/progress-match.js'),
  chrome.runtime.getURL('src/shared/progress-history.js'),
  chrome.runtime.getURL('src/background/progress-tracker.js'),
  chrome.runtime.getURL('src/newtab/recent/recent-sites-store.js'),
  chrome.runtime.getURL('src/background/popup-recent-pin.js'),
  chrome.runtime.getURL('src/background/overlay-loading-lifecycle.js'),
  chrome.runtime.getURL('src/background/dev-extension-startup.js'),
  // Background services split out of this file. They share its global scope
  // and only define functions and their own state while loading.
  chrome.runtime.getURL('src/background/tab-switcher-service.js'),
  chrome.runtime.getURL('src/background/pinned-tab-recovery.js'),
  chrome.runtime.getURL('src/background/favicon-service.js'),
  chrome.runtime.getURL('src/background/search-suggestions-service.js'),
  chrome.runtime.getURL('src/background/browser-urls-service.js'),
  chrome.runtime.getURL('src/background/tab-switch-stats-service.js'),
  chrome.runtime.getURL('src/background/overlay-loading-service.js'),
  chrome.runtime.getURL('src/background/overlay-open-service.js'),
  chrome.runtime.getURL('src/background/command-service.js'),
  chrome.runtime.getURL('src/background/pip-service.js'),
  chrome.runtime.getURL('src/background/selection-quick-actions-service.js'),
  chrome.runtime.getURL('src/background/site-search-service.js'),
  chrome.runtime.getURL('src/background/message-handlers-service.js')
);
// pinyin-pro (~320 KB) only matters when a Han-character title is matched
// against a pinyin query, or a Han query against site addresses, so the
// worker loads it on first use instead of on every wake (see getPinyinPro).
// A service worker may only importScripts() a
// file after installation if it imported that file while installing, hence
// the install hook. Firefox's build lists this path in background.scripts.
const PINYIN_PRO_SCRIPT_PATH = 'assets/vendor/pinyin-pro.js';
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('install', () => {
    importScripts(chrome.runtime.getURL(PINYIN_PRO_SCRIPT_PATH));
  });
}
// Development-only; the store package strips this import.
importScripts(chrome.runtime.getURL('src/background/codex-debug-bridge.js'));

const BACKGROUND_PAGES = globalThis.LumnoBackgroundPages;
const getExtensionDetailsUrl = BACKGROUND_PAGES.getExtensionDetailsUrl;
const openExtensionOptionsPage = BACKGROUND_PAGES.openExtensionOptionsPage;
const openOnboardingPage = BACKGROUND_PAGES.openOnboardingPage;
const shouldOpenOnboardingForUpdate = BACKGROUND_PAGES.shouldOpenOnboardingForUpdate;
const openReleasePage = BACKGROUND_PAGES.openReleasePage;
const openBookmarkManagerPage = BACKGROUND_PAGES.openBookmarkManagerPage;
const openExtensionShortcutsPage = BACKGROUND_PAGES.openExtensionShortcutsPage;
const openSiteSearchOptionsPage = BACKGROUND_PAGES.openSiteSearchOptionsPage;
const BACKGROUND_MESSAGE_ROUTER = globalThis.LumnoBackgroundMessageRouter;
const BOOKMARK_TAB_GROUPS = globalThis.LumnoBookmarkTabGroups;
const EXTENSION_ROUTES = globalThis.LumnoExtensionRoutes;
const UPDATE_NOTICE = globalThis.LumnoUpdateNotice;
const SETTINGS = globalThis.LumnoSettings;
const COMMAND_TARGET_POLICY = globalThis.LumnoCommandTargetPolicy;
const FAVICON_UTILS = globalThis.LumnoFaviconUtils;
const FAVICON_CACHE = globalThis.LumnoFaviconCache;
const SHORTCUT_FAVICON = globalThis.LumnoShortcutFavicon;
const SHORTCUT_KEY_MATCHER = globalThis.LumnoShortcutKeyMatcher;
const NEWTAB_FAVICON_THEME = globalThis.LumnoNewtabFaviconTheme;
const BACKGROUND_NEWTAB_FALLBACK = globalThis.LumnoBackgroundNewtabFallback;
const BROWSER_PROFILE = globalThis.LumnoBrowserProfile;
const BACKGROUND_TAB_GROUPS = globalThis.LumnoBackgroundTabGroups;
const SEARCH_RESULT_TABS = globalThis.LumnoSearchResultTabs;
const isLocalFileLikeTargetUrl = BACKGROUND_NEWTAB_FALLBACK.isLocalFileLikeTargetUrl;
const checkFileSchemeAccess = BACKGROUND_NEWTAB_FALLBACK.checkFileSchemeAccess;
const openBrowserNewtabFallback = BACKGROUND_NEWTAB_FALLBACK.openBrowserNewtabFallback;
const openNewtabFallback = BACKGROUND_NEWTAB_FALLBACK.openNewtabFallback;
const openNewtabFallbackForUrl = BACKGROUND_NEWTAB_FALLBACK.openNewtabFallbackForUrl;
const swapNewtabForFocus = BACKGROUND_NEWTAB_FALLBACK.swapNewtabForFocus;
const BACKGROUND_SHORTCUT_RULES = globalThis.LumnoShortcutRules;
const DEV_EXTENSION_STARTUP = globalThis.LumnoDevExtensionStartup;
const CODEX_DEBUG_BRIDGE = globalThis.LumnoCodexDebugBackground;
const codexDebugBridge = CODEX_DEBUG_BRIDGE.create({ chromeApi: chrome });
const shortcutRules = BACKGROUND_SHORTCUT_RULES.create({
  chromeApi: chrome,
  fetchImpl: fetch,
  navigatorLike: navigator
});
const loadShortcutRules = shortcutRules.loadShortcutRules;
const getShortcutUrl = shortcutRules.getShortcutUrl;

const HOTKEY_DEBUG_ENABLED = false;
function logHotkeyDebug(stage, payload) {
  if (!HOTKEY_DEBUG_ENABLED) {
    return;
  }
  try {
    const detail = payload && typeof payload === 'object' ? payload : {};
    console.log(`[Lumno][hotkey] ${stage}`, detail);
  } catch (e) {
    // Ignore logging errors.
  }
}

// Callback for chrome.* calls whose failure is routine for a background that
// talks to arbitrary tabs and storage: a tab or frame that closed or navigated
// ("No tab with id", "Frame was removed"), a restricted page, or a best-effort
// cleanup. Reading lastError keeps Chrome from logging it as unchecked.
function ignoreExpectedChromeError() {
  void (chrome && chrome.runtime && chrome.runtime.lastError);
}

// Rejection handler for work that is not expected to fail (storage writes,
// startup restores). Failures stay non-fatal but leave a trace with context.
function warnBackgroundFailure(context) {
  return (error) => {
    console.warn(`[Lumno] ${context}`, error);
  };
}

const providerStorageRuntime = globalThis.LumnoSettings.createProviderStorageRuntime(chrome);
const storageArea = providerStorageRuntime
  ? providerStorageRuntime.area
  : ((chrome && chrome.storage && chrome.storage.sync)
      ? chrome.storage.sync
      : (chrome && chrome.storage ? chrome.storage.local : null));
const localStorageArea = (chrome && chrome.storage && chrome.storage.local)
  ? chrome.storage.local
  : storageArea;
const storageAreaName = providerStorageRuntime ? providerStorageRuntime.name : (storageArea
  ? (storageArea === (chrome && chrome.storage ? chrome.storage.sync : null) ? 'sync' : 'local')
  : null);
function isPrimaryStorageAreaName(areaName) {
  return providerStorageRuntime
    ? providerStorageRuntime.isActiveAreaName(areaName)
    : Boolean(storageAreaName) && areaName === storageAreaName;
}
const THEME_STORAGE_KEY = '_x_extension_theme_mode_2024_unique_';
const LANGUAGE_STORAGE_KEY = '_x_extension_language_2024_unique_';
const LANGUAGE_MESSAGES_STORAGE_KEY = '_x_extension_language_messages_2024_unique_';
const RECENT_MODE_STORAGE_KEY = '_x_extension_recent_mode_2024_unique_';
const RECENT_COUNT_STORAGE_KEY = '_x_extension_recent_count_2024_unique_';
const NEWTAB_WIDTH_MODE_STORAGE_KEY = '_x_extension_newtab_width_mode_2026_unique_';
const NEWTAB_SEARCH_WIDTH_STORAGE_KEY = '_x_extension_newtab_search_width_2026_unique_';
const NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY = (
  globalThis.LumnoSettings.NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY
) || '_x_extension_newtab_wordmark_visible_2026_unique_';
const NEWTAB_THEME_MODE_STORAGE_KEY = '_x_extension_newtab_theme_mode_2026_unique_';
const NEWTAB_THEME_SCOPE_STORAGE_KEY = '_x_extension_newtab_theme_scope_2026_unique_';
const NEWTAB_ZEN_MODE_STORAGE_KEY = '_x_extension_newtab_zen_mode_2026_unique_';
const NEWTAB_WALLPAPER_STORAGE_KEY = '_x_extension_newtab_wallpaper_2026_unique_';
const NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY = '_x_extension_newtab_wallpaper_overlay_2026_unique_';
const NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY = '_x_extension_newtab_wallpaper_effect_2026_unique_';
const NEWTAB_FAVICON_STORAGE_KEY = '_x_extension_newtab_favicon_2026_unique_';
const OVERLAY_SIZE_MODE_STORAGE_KEY = '_x_extension_overlay_size_mode_2026_unique_';
const OVERLAY_ENTER_ANIMATION_STORAGE_KEY = '_x_extension_overlay_enter_animation_2026_unique_';
const BOOKMARK_COUNT_STORAGE_KEY = '_x_extension_bookmark_count_2024_unique_';
const BOOKMARK_COLUMNS_STORAGE_KEY = '_x_extension_bookmark_columns_2024_unique_';
const BOOKMARK_VIEW_MODE_STORAGE_KEY = '_x_extension_bookmark_view_mode_2026_unique_';
const BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY = '_x_extension_bookmark_folder_icons_visible_2026_unique_';
const BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS = Array.isArray(globalThis.LumnoSettings.BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS)
  ? globalThis.LumnoSettings.BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS
  : [];
const PINNED_RECENT_SITES_STORAGE_KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';
const PROGRESS_TRACKING_ENABLED_STORAGE_KEY = globalThis.LumnoSettings.PROGRESS_TRACKING_ENABLED_STORAGE_KEY;
// Labs: tracked pinned cards follow the episode or chapter the person is on.
let progressTrackingEnabled = false;
const progressTracker = globalThis.LumnoProgressTracker.createProgressTracker({
  chromeApi: chrome,
  progressMatch: globalThis.LumnoProgressMatch,
  progressHistory: globalThis.LumnoProgressHistory,
  getPinnedArea: () => storageArea,
  historyArea: localStorageArea,
  pinnedKey: PINNED_RECENT_SITES_STORAGE_KEY,
  isEnabled: () => progressTrackingEnabled
});
progressTracker.attach();
if (storageArea) {
  storageArea.get([PROGRESS_TRACKING_ENABLED_STORAGE_KEY], (result) => {
    progressTrackingEnabled = globalThis.LumnoSettings.normalizeProgressTrackingEnabled(
      result && result[PROGRESS_TRACKING_ENABLED_STORAGE_KEY]
    );
  });
}
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!isPrimaryStorageAreaName(areaName) || !changes[PROGRESS_TRACKING_ENABLED_STORAGE_KEY]) return;
  progressTrackingEnabled = globalThis.LumnoSettings.normalizeProgressTrackingEnabled(
    changes[PROGRESS_TRACKING_ENABLED_STORAGE_KEY].newValue
  );
});
const HIDDEN_RECENT_SITES_STORAGE_KEY = '_x_extension_newtab_hidden_recent_sites_2026_unique_';
const NEWTAB_SHORTCUTS_STORAGE_KEY = '_x_extension_newtab_shortcuts_2026_unique_';
const RESTRICTED_ACTION_STORAGE_KEY = '_x_extension_restricted_action_2024_unique_';
const RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY = '_x_extension_restricted_action_auto_browser_setting_done_2026_unique_';
const OVERLAY_TAB_PRIORITY_STORAGE_KEY = '_x_extension_overlay_tab_priority_2024_unique_';
const TAB_RANK_SCORE_DEBUG_STORAGE_KEY = '_x_extension_tab_rank_score_debug_2026_unique_';
const AUTO_PIP_ENABLED_STORAGE_KEY = '_x_extension_auto_pip_enabled_2026_unique_';
const TAB_SWITCHER_ENABLED_STORAGE_KEY = '_x_extension_tab_switcher_enabled_2026_unique_';
const DOCUMENT_PIP_ENABLED_STORAGE_KEY = '_x_extension_document_pip_enabled_2026_unique_';
const PINNED_TAB_RECOVERY_ENABLED_STORAGE_KEY = '_x_extension_pinned_tab_recovery_enabled_2026_unique_';
const SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY = '_x_extension_selection_quick_actions_enabled_2026_unique_';
const SELECTION_QUICK_ACTIONS_PROVIDER_STORAGE_KEY = '_x_extension_selection_quick_actions_provider_2026_unique_';
const SELECTION_QUICK_ACTIONS_GROUP_ENABLED_STORAGE_KEY = '_x_extension_selection_quick_actions_group_enabled_2026_unique_';
const FALLBACK_SHORTCUT_STORAGE_KEY = '_x_extension_fallback_hotkey_2024_unique_';
const SEARCH_RESULT_PRIORITY_STORAGE_KEY = '_x_extension_search_result_priority_2026_unique_';
const SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY = '_x_extension_search_result_source_types_2026_unique_';
const SEARCH_SELECTION_STATS_STORAGE_KEY = '_x_extension_search_selection_stats_2026_unique_';
const FAVICON_VISIT_DIRTY_STORAGE_KEY = '_x_extension_favicon_visit_dirty_2026_unique_';
const PINNED_TAB_SNAPSHOT_STORAGE_KEY = '_x_extension_pinned_tab_snapshot_2026_unique_';
const REMOVED_AI_SYNC_STORAGE_KEYS = [
  '_x_extension_ai_search_mode_2026_unique_',
  '_x_extension_ai_provider_2026_unique_',
  '_x_extension_ai_entitlement_cache_2026_unique_'
];
const REMOVED_AI_LOCAL_STORAGE_KEYS = [
  '_x_extension_ai_api_key_2026_unique_'
];
const SHOW_SEARCH_COMMAND_NAME = 'show-search';
const SHOW_SEARCH_PREFILL_COMMAND_NAME = 'show-search-prefill';
const SHOW_SEARCH_PREFILL_V_COMMAND_NAME = 'show-search-prefill-v';
const SHOW_TAB_SWITCHER_COMMAND_NAME = 'show-tab-switcher';
const BROWSER_NEWTAB_PROVIDER_DETECTION_MS = 6000;
const TAB_SWITCHER_THUMBNAIL_STORAGE_KEY = '_x_extension_tab_switcher_state_2026_unique_';
// Service-worker lifetime: everything below is lost when the worker suspends
// and is re-created on the next wake. Each group says how it survives that;
// the service scripts in the first importScripts block document their own.
//
// Settings mirrors, re-read from storage on every wake (see the storageArea.get
// below). Until that read lands they hold defaults, so event paths that act on
// them wait for backgroundSettingsReady (see whenBackgroundSettingsReady).
let restrictedActionCache = 'default';
let restrictedActionAutoBrowserSettingDoneCache = false;
let documentPipEnabledCache = false;
let resolveDocumentPipEnabledReady = () => {};
// A service worker woken by the toolbar button or a clip command handles that
// event before its stored settings arrive, so web clip waits for the real value.
const documentPipEnabledReady = new Promise((resolve) => {
  resolveDocumentPipEnabledReady = resolve;
});
let tabSwitcherEnabledCache = true;
let backgroundSettingsLoaded = false;
let resolveBackgroundSettingsReady = () => {};
const backgroundSettingsReady = new Promise((resolve) => {
  resolveBackgroundSettingsReady = resolve;
});
const browserNewtabProviderCandidateTabIds = new Map();
function cleanupRemovedAiStorageKeys() {
  if (!chrome || !chrome.storage) {
    return;
  }
  const syncArea = chrome.storage.sync;
  const localArea = chrome.storage.local;
  if (syncArea && typeof syncArea.remove === 'function') {
    syncArea.remove(REMOVED_AI_SYNC_STORAGE_KEYS, ignoreExpectedChromeError);
  }
  if (localArea && typeof localArea.remove === 'function') {
    localArea.remove(REMOVED_AI_LOCAL_STORAGE_KEYS, ignoreExpectedChromeError);
  }
}

const OVERLAY_FONT_LOCAL_STORAGE_KEYS = Array.isArray(globalThis.LumnoSettings.OVERLAY_FONT_LOCAL_STORAGE_KEYS)
  ? globalThis.LumnoSettings.OVERLAY_FONT_LOCAL_STORAGE_KEYS
  : [];

// Development builds before the fonts became device-only kept them in
// Chrome Sync; those copies would otherwise reach every signed-in device.
function cleanupLocalOnlyOverlayFontSyncStorage() {
  if (!chrome || !chrome.storage || !chrome.storage.sync ||
      typeof chrome.storage.sync.remove !== 'function' ||
      OVERLAY_FONT_LOCAL_STORAGE_KEYS.length === 0) {
    return;
  }
  chrome.storage.sync.remove(OVERLAY_FONT_LOCAL_STORAGE_KEYS, ignoreExpectedChromeError);
}

function cleanupLocalOnlyBookmarkTopbarSyncStorage() {
  if (!chrome || !chrome.storage || !chrome.storage.sync ||
      typeof chrome.storage.sync.remove !== 'function' ||
      BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS.length === 0) {
    return;
  }
  chrome.storage.sync.remove(BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS, ignoreExpectedChromeError);
}

if (storageArea) {
  storageArea.get([
    RESTRICTED_ACTION_STORAGE_KEY,
    RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY,
    DOCUMENT_PIP_ENABLED_STORAGE_KEY,
    TAB_SWITCHER_ENABLED_STORAGE_KEY,
    PINNED_TAB_RECOVERY_ENABLED_STORAGE_KEY
  ], (storedResult) => {
    const result = storedResult || {};
    const stored = result[RESTRICTED_ACTION_STORAGE_KEY];
    const normalized = stored === 'none' ? 'none' : 'default';
    if (normalized !== stored) {
      storageArea.set({ [RESTRICTED_ACTION_STORAGE_KEY]: normalized });
    }
    restrictedActionCache = normalized;
    restrictedActionAutoBrowserSettingDoneCache = result[RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY] === true;
    const documentPipStored = result[DOCUMENT_PIP_ENABLED_STORAGE_KEY];
    const normalizedDocumentPip = documentPipStored === true;
    if (documentPipStored !== normalizedDocumentPip) {
      storageArea.set({ [DOCUMENT_PIP_ENABLED_STORAGE_KEY]: normalizedDocumentPip });
    }
    documentPipEnabledCache = normalizedDocumentPip;
    resolveDocumentPipEnabledReady();
    const tabSwitcherStored = result[TAB_SWITCHER_ENABLED_STORAGE_KEY];
    const normalizedTabSwitcher = SETTINGS.normalizeTabSwitcherEnabled(tabSwitcherStored);
    if (tabSwitcherStored !== normalizedTabSwitcher) {
      storageArea.set({ [TAB_SWITCHER_ENABLED_STORAGE_KEY]: normalizedTabSwitcher });
    }
    applyTabSwitcherEnabledSetting(normalizedTabSwitcher);
    const pinnedTabRecoveryStored = result[PINNED_TAB_RECOVERY_ENABLED_STORAGE_KEY];
    applyPinnedTabRecoverySetting(pinnedTabRecoveryStored);
    markBackgroundSettingsLoaded();
  });
} else {
  resolveDocumentPipEnabledReady();
  markBackgroundSettingsLoaded();
}

function markBackgroundSettingsLoaded() {
  backgroundSettingsLoaded = true;
  resolveBackgroundSettingsReady();
}

// A worker woken by a command, a tab event or a page hotkey runs that handler
// before its stored settings arrive. Run the callback now when they are known,
// otherwise as soon as they are, so a disabled feature stays disabled.
function whenBackgroundSettingsReady(callback) {
  if (backgroundSettingsLoaded) {
    callback();
    return;
  }
  backgroundSettingsReady.then(callback);
}

function migrateStorageIfNeeded(keys) {
  if (!storageArea || !chrome || !chrome.storage || !chrome.storage.local) {
    return;
  }
  if (isPrimaryStorageAreaName('local')) {
    return;
  }
  SETTINGS.migrateLocalSettingsToSync(chrome.storage.local, storageArea, keys);
}

loadFirefoxBrandIcon();

function publishExtensionUpdateNotice(details) {
  const version = UPDATE_NOTICE.getCurrentVersionTag(chrome);
  UPDATE_NOTICE.publishUpdateNotice({
    chromeApi: chrome,
    fetchImpl: typeof fetch === 'function' ? fetch : null,
    version,
    previousVersion: details && details.previousVersion ? details.previousVersion : '',
    reason: 'update'
  }).catch(warnBackgroundFailure('Failed to publish the extension update notice.'));
}

chrome.commands.onCommand.addListener(function(command) {
  if (
    command !== SHOW_SEARCH_COMMAND_NAME &&
    command !== SHOW_SEARCH_PREFILL_COMMAND_NAME &&
    command !== SHOW_SEARCH_PREFILL_V_COMMAND_NAME &&
    command !== SHOW_TAB_SWITCHER_COMMAND_NAME
  ) {
    return;
  }
  const commandObservedAt = Date.now();
  const source = command === SHOW_SEARCH_COMMAND_NAME
    ? 'commands'
    : (command === SHOW_SEARCH_PREFILL_COMMAND_NAME
      ? 'commands-prefill'
      : (command === SHOW_SEARCH_PREFILL_V_COMMAND_NAME ? 'commands-copy-url' : 'commands-tab-switcher'));
  logHotkeyDebug('received', { command: command, source: source });
  chrome.tabs.query({active: true, currentWindow: true}, function(activeTabs) {
    if (command === SHOW_SEARCH_PREFILL_V_COMMAND_NAME) {
      triggerCopyCurrentUrlForTab(activeTabs[0], source);
      return;
    }
    if (command === SHOW_TAB_SWITCHER_COMMAND_NAME) {
      triggerTabSwitcherForTab(activeTabs[0], source, commandObservedAt);
      return;
    }
    triggerShowSearchForTab(activeTabs[0], source);
  });
});

if (chrome && chrome.runtime && chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener(registerTabSwitcherExtensionPagePortConnection);
}

codexDebugBridge.attach();

chrome.tabs.onCreated.addListener((tab) => {
  rememberBrowserNewtabProviderCandidate(tab);
  maybeAutoSelectRestrictedBrowserSetting(tab, 'created');
  const recentContext = getRecentPageHotkeyContext(tab && typeof tab.windowId === 'number' ? tab.windowId : null);
  if (!recentContext || !tab || typeof tab.id !== 'number') {
    schedulePersistPinnedTabSnapshot();
    return;
  }
  setTimeout(() => {
    recoverFromPageHotkeyNewtab(tab.id, recentContext.windowId);
  }, 120);
  schedulePersistPinnedTabSnapshot();
});

// A development build in August 2026 restricted chrome.storage.local to
// trusted contexts. Chrome keeps an area's access level after the code that
// set it is gone, so content scripts in those profiles still cannot read local
// storage, and the overlay waited out every settings-mode retry (about two
// seconds) before it showed; a second shortcut press closed it unseen. Put
// the default back whenever the extension is installed or updated.
function restoreLocalStorageContentScriptAccess() {
  const localArea = chrome && chrome.storage ? chrome.storage.local : null;
  if (!localArea || typeof localArea.setAccessLevel !== 'function') {
    return;
  }
  try {
    const pending = localArea.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
    if (pending && typeof pending.catch === 'function') {
      pending.catch(warnBackgroundFailure('Failed to restore content script access to local storage.'));
    }
  } catch (error) {
    warnBackgroundFailure('Failed to restore content script access to local storage.')(error);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  restoreLocalStorageContentScriptAccess();
  // Static manifest content scripts only apply to future document loads. A
  // development-extension reload keeps existing tabs alive, so install the
  // shortcut observer there now instead of waiting for the next shortcut.
  prepareShortcutKeyObserversInOpenTabs();
  if (!details) {
    schedulePersistPinnedTabSnapshot();
    return;
  }
  const reason = String(details.reason || '');
  if (reason === 'install') {
    openOnboardingPage({ reason: 'install' });
    schedulePersistPinnedTabSnapshot();
    return;
  }
  if (reason === 'update') {
    const isSameVersionReload = DEV_EXTENSION_STARTUP.isSameVersionReload(details, chrome.runtime.getManifest().version);
    if (!isSameVersionReload) {
      if (typeof shouldOpenOnboardingForUpdate === 'function' && shouldOpenOnboardingForUpdate(details)) {
        openOnboardingPage({ reason: 'update' });
      }
      publishExtensionUpdateNotice(details);
    }
  }
  if (reason === 'update' || reason === 'chrome_update') {
    restorePinnedTabsFromSnapshotOnStartup().catch(warnBackgroundFailure('Failed to restore pinned tabs.')).finally(() => {
      schedulePersistPinnedTabSnapshot({ skipEmptyWhenNoNormalWindows: true });
    });
    return;
  }
  schedulePersistPinnedTabSnapshot({ skipEmptyWhenNoNormalWindows: true });
});

function restoreBackgroundStateOnStartup() {
  return restorePinnedTabsFromSnapshotOnStartup().catch(warnBackgroundFailure('Failed to restore pinned tabs.')).finally(() => {
    schedulePersistPinnedTabSnapshot({ skipEmptyWhenNoNormalWindows: true });
  });
}

if (chrome && chrome.runtime && chrome.runtime.onStartup) {
  // Tabs restored at browser startup load with the manifest content scripts,
  // and each tab switcher command prepares its own tab, so startup does not
  // sweep the open tabs.
  chrome.runtime.onStartup.addListener(() => {
    restoreBackgroundStateOnStartup();
  });
}
// Both loaders settle even when storage is unreadable; the catch only keeps
// an unforeseen rejection from surfacing as unhandled during startup.
ensureTabSwitchStatsLoaded().catch(() => {});
ensureTabSwitcherStateLoaded().catch(() => {});
// Chrome keeps a worker alive for its short debounce timers, but Firefox's
// event page can be unloaded with one pending; write it out first.
if (chrome && chrome.runtime && chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    flushPendingPinnedTabSnapshot();
    flushPendingTabSwitcherState();
  });
}
cleanupRemovedAiStorageKeys();
cleanupLocalOnlyBookmarkTopbarSyncStorage();
cleanupLocalOnlyOverlayFontSyncStorage();

if (chrome && chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    if (!activeInfo || typeof activeInfo.tabId !== 'number') {
      return;
    }
    recordTabSwitchEvent(activeInfo.tabId);
    if (chrome.tabs && typeof chrome.tabs.get === 'function') {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          return;
        }
        ensureTabSwitcherStateLoaded().catch(() => {}).finally(() => {
          recordRecentSwitcherTab(tab);
          scheduleSwitcherThumbnailCapture(tab, 'activated');
        });
      });
    }
  });
}

if (chrome && chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (typeof windowId !== 'number' ||
        windowId === chrome.windows.WINDOW_ID_NONE ||
        !chrome.tabs ||
        typeof chrome.tabs.query !== 'function') {
      return;
    }
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      const tab = Array.isArray(tabs) && tabs.length > 0 ? tabs[0] : null;
      if (!tab || typeof tab.id !== 'number') {
        return;
      }
      ensureTabSwitcherStateLoaded().catch(() => {}).finally(() => {
        recordRecentSwitcherTab(tab);
        scheduleSwitcherThumbnailCapture(tab, 'window-focus');
      });
    });
  });
}

if (chrome && chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    const overlayOpening = overlayOpeningByTabId.get(tabId);
    if (overlayOpening) {
      finishOverlayOpening(overlayOpening);
    }
    clearOverlayNavigationState(tabId);
    clearOverlayLoadingRecord(tabId);
    clearTabSwitchStat(tabId);
    removeRecentSwitcherTab(tabId);
    pipOwnership.clearGlobalPipOwnerForTabId(tabId);
    Array.from(tabSwitcherHostTabIdByWindowId.entries()).forEach(([windowId, hostTabId]) => {
      if (hostTabId === tabId) {
        tabSwitcherHostTabIdByWindowId.delete(windowId);
      }
    });
    if (removeInfo && removeInfo.isWindowClosing) {
      return;
    }
    schedulePersistPinnedTabSnapshot();
  });
}

if (chrome && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo) {
      return;
    }
    if (changeInfo.status === 'loading') {
      rememberOverlayTopFrameNavigation({
        tabId,
        frameId: 0,
        url: typeof changeInfo.url === 'string'
          ? changeInfo.url
          : (tab && typeof tab.pendingUrl === 'string' ? tab.pendingUrl : '')
      });
      markOverlayLoadingRecordUnstable(tabId);
    } else if (typeof changeInfo.url === 'string') {
      updateOverlayTopFrameNavigation({
        tabId,
        frameId: 0,
        url: changeInfo.url
      });
    }
    recoverOverlayAfterLoadingUpdate(tabId, changeInfo, tab);
    if (changeInfo.status === 'complete') {
      clearOverlayNavigationState(tabId);
    }
    if (typeof changeInfo.url === 'string' || changeInfo.status === 'complete') {
      const providerTab = Object.assign({}, tab || {}, {
        id: typeof tabId === 'number' ? tabId : (tab && tab.id),
        status: changeInfo.status || (tab && tab.status)
      });
      if (typeof changeInfo.url === 'string') {
        providerTab.url = changeInfo.url;
      }
      maybeAutoSelectRestrictedBrowserSetting(
        providerTab,
        changeInfo.status === 'complete' ? 'updated-complete' : 'updated'
      );
    }
    if (typeof changeInfo.url === 'string') {
      // URL changed means the tab semantic target changed; reset historical switch stats.
      clearTabSwitchStat(tabId);
      pipOwnership.clearGlobalPipOwnerForTabId(tabId);
      clearSwitcherThumbnailPriority(tabId);
      updateRecentSwitcherTab(tab);
    }
    if (tab && tab.active === true && (typeof changeInfo.title === 'string' || typeof changeInfo.favIconUrl === 'string')) {
      updateRecentSwitcherTab(tab);
    }
    if (tab && tab.active === true && changeInfo.status === 'complete') {
      recordRecentSwitcherTab(tab);
      scheduleSwitcherThumbnailCapture(tab, 'updated-complete');
    }
    if (changeInfo.pinned !== undefined || typeof changeInfo.url === 'string' || changeInfo.status === 'complete') {
      schedulePersistPinnedTabSnapshot();
    }
    if (typeof changeInfo.favIconUrl === 'string' && changeInfo.favIconUrl) {
      const completedUrl = typeof changeInfo.url === 'string'
        ? changeInfo.url
        : (tab && typeof tab.url === 'string' ? tab.url : '');
      markFaviconDirtyForUrl(completedUrl);
    } else if (changeInfo.status === 'complete' && !(tab && tab.favIconUrl)) {
      const completedUrl = typeof changeInfo.url === 'string'
        ? changeInfo.url
        : (tab && typeof tab.url === 'string' ? tab.url : '');
      markFaviconDirtyForUrl(completedUrl);
    }
  });
}

if (chrome && chrome.tabs && chrome.tabs.onMoved) {
  chrome.tabs.onMoved.addListener(() => {
    schedulePersistPinnedTabSnapshot();
  });
}

if (chrome && chrome.windows && chrome.windows.onCreated) {
  chrome.windows.onCreated.addListener((windowInfo) => {
    if (windowInfo && windowInfo.incognito === true) {
      return;
    }
    if (windowInfo && windowInfo.type && windowInfo.type !== 'normal') {
      return;
    }
    restorePinnedTabsFromSnapshotOnStartup().catch(warnBackgroundFailure('Failed to restore pinned tabs.')).finally(() => {
      schedulePersistPinnedTabSnapshot({ skipEmptyWhenNoNormalWindows: true });
    });
  });
}

if (chrome && chrome.windows && chrome.windows.onRemoved) {
  chrome.windows.onRemoved.addListener((windowId) => {
    tabSwitcherHostTabIdByWindowId.delete(windowId);
    schedulePersistPinnedTabSnapshot({ skipEmptyWhenNoNormalWindows: true });
  });
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    const finish = (tab, error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      if (error) {
        reject(error);
        return;
      }
      resolve(tab || null);
    };
    const handleUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (changeInfo && changeInfo.status === 'complete') {
        finish(tab || null);
      }
    };
    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        finish(null, new Error(chrome.runtime.lastError.message || 'tab-unavailable'));
        return;
      }
      if (tab && tab.status === 'complete') {
        finish(tab);
      }
    });
    timeoutId = setTimeout(() => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          finish(null, new Error(chrome.runtime.lastError.message || 'tab-unavailable'));
          return;
        }
        finish(tab || null);
      });
    }, Math.max(1000, Number(timeoutMs) || 15000));
  });
}

const selectionScriptRegistration = globalThis.LumnoSelectionScriptRegistration
  .createSelectionScriptRegistration({ chromeApi: chrome });
loadSelectionQuickActionsEnabled().then((enabled) => selectionScriptRegistration.sync(enabled));
chrome.storage.onChanged.addListener((changes, areaName) => {
  const storageModeChanged = areaName === 'local' && Boolean(changes[SETTINGS.LOCAL_PRIMARY_STORAGE_KEY]);
  if (!storageModeChanged &&
      !(isPrimaryStorageAreaName(areaName) && changes[SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY])) {
    return;
  }
  loadSelectionQuickActionsEnabled().then((enabled) => {
    selectionScriptRegistration.sync(enabled, { injectOpenTabs: enabled });
  });
});

const shortcutFolderSyncController = providerStorageRuntime &&
  chrome.bookmarks && typeof chrome.bookmarks.getTree === 'function'
  ? globalThis.LumnoBookmarkFolderReference.createSyncController({ chrome, provider: providerStorageRuntime,
    onError: (error) => console.warn('[Lumno] Could not refresh folder shortcuts.', error) }) : null;
if (shortcutFolderSyncController) shortcutFolderSyncController.start();
const webDavSyncController = typeof indexedDB !== 'undefined'
  ? globalThis.LumnoWebDavSync.createController({ chrome }) : null;
if (webDavSyncController) webDavSyncController.start();

function handleWebDavMessage(request, sender, sendResponse) {
  // Content scripts and externally connected extensions cannot use stored
  // credentials, configure endpoints, or request arbitrary remote resources.
  if (!globalThis.LumnoWebDavSync.isTrustedSender(chrome, sender)) {
    sendResponse({ ok: false, error: 'forbidden' });
    return;
  }
  if (!webDavSyncController) {
    sendResponse({ ok: false, error: 'private-storage-unavailable' });
    return;
  }
  webDavSyncController.handle(request).then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.code || 'sync-failed',
      diagnostic: globalThis.LumnoWebDavClient.diagnostic(error.diagnostic) }));
  return true;
}

// The page context menu item that adds the page to the New Tab shortcuts.
const pageShortcutMenuController = providerStorageRuntime && chrome.contextMenus
  ? globalThis.LumnoPageShortcutMenu.createController({ chrome, provider: providerStorageRuntime,
    loadLocaleMessages, themeStorageKey: THEME_STORAGE_KEY }) : null;
if (pageShortcutMenuController) pageShortcutMenuController.start();

// The popup's pin among the New Tab's recent sites; episodes and chapters
// start tracked while progress tracking (Labs) is on.
const popupRecentPin = globalThis.LumnoPopupRecentPin.createController({
  store: globalThis.LumnoNewtabRecentSitesStore,
  key: PINNED_RECENT_SITES_STORAGE_KEY,
  storeOptions: {
    normalizeHost,
    getCanonicalPageUrlForFavicon: FAVICON_UTILS.getCanonicalPageUrlForFavicon,
    maxPinned: 3
  },
  getArea: () => storageArea,
  ready: () => (providerStorageRuntime ? providerStorageRuntime.ready : Promise.resolve()),
  probeSeries: (url) => (progressTrackingEnabled ? progressTracker.probeSeries(url) : Promise.resolve(false)),
  createProgressId: globalThis.LumnoProgressHistory.createProgressId
});

// One action -> handler registry for runtime messages. Each feature area
// above owns its handlers; adding an action is one entry in its area's map,
// and the router rejects an action registered twice.
const backgroundMessageRouter = BACKGROUND_MESSAGE_ROUTER.createRouter(
  { webdav: handleWebDavMessage },
  TAB_MESSAGE_HANDLERS,
  SHORTCUT_MESSAGE_HANDLERS,
  PIP_MESSAGE_HANDLERS,
  SEARCH_MESSAGE_HANDLERS,
  SITE_SEARCH_MESSAGE_HANDLERS,
  SELECTION_QUICK_ACTION_MESSAGE_HANDLERS,
  LOCALE_AND_PERMISSION_MESSAGE_HANDLERS,
  EXTENSION_PAGE_MESSAGE_HANDLERS,
  POPUP_MESSAGE_HANDLERS,
  FAVICON_MESSAGE_HANDLERS
);

// Actions the in-page surfaces (content scripts, the injected overlay, tab
// switcher, selection toolbar and picture-in-picture helpers) send. Those run
// inside web pages; every other action is accepted from extension pages only.
const WEB_PAGE_MESSAGE_ACTIONS = Object.freeze([
  'switchToTab', 'closeTabFromTabSwitcher', 'notifyOverlayClosed', 'notifyTopFrameDocumentStarted',
  'updateOverlayLoadingSession', 'getTabsForOverlay', 'closeOtherTabsForOverlay',
  'getShowSearchShortcut', 'copyCurrentPageUrl', 'triggerShowSearchFromPageHotkey',
  'notifyTabSwitcherShortcutModifierReleased', 'getShortcutRules',
  'pipRequestOwnership', 'pipReleaseOwnership', 'openDocumentPipPicker', 'siteTryEnterPiPInMainWorld',
  'iqiyiTryEnterPiPInMainWorld', 'iqiyiSetupAutoPiPInMainWorld', 'forceExitPiPInMainWorld',
  'ytForceExitPiPInMainWorld',
  'searchOrNavigate', 'getSearchSuggestions', 'getSearchEngineSuggestions',
  'recordSearchSuggestionSelection', 'deleteHistoryUrl',
  'getSiteSearchProviders', 'getHelpCenterSearchResults', 'runSiteSearchProviderQuery',
  'runAggregateSearchQuery', 'runSelectionQuickAction',
  'getLocaleMessages', 'openOptionsPage', 'openReleasePage', 'createTab', 'openNewTab',
  'getFaviconData'
]);

const backgroundMessageSenderPolicy = BACKGROUND_MESSAGE_ROUTER.createSenderPolicy({
  extensionBaseUrl: chrome.runtime.getURL(''),
  pageActions: WEB_PAGE_MESSAGE_ACTIONS,
  pageArgumentGuards: {
    // Typed, bookmarked and history targets stay openable; script, inline data
    // documents and other extensions' pages do not.
    createTab: (request) => globalThis.LumnoUrlGuards.canOpenUrlFromWebPageContext(
      request.url,
      chrome.runtime.getURL('')
    ),
    runSiteSearchProviderQuery: (request) => {
      const entryUrl = getSiteSearchProviderEntryUrl(request.provider, request.query);
      return /^https?:\/\//i.test(entryUrl);
    }
  }
});

function dispatchBackgroundMessage(request, sender, sendResponse) {
  return BACKGROUND_MESSAGE_ROUTER.dispatch(
    backgroundMessageRouter,
    request,
    sender,
    sendResponse,
    backgroundMessageSenderPolicy
  );
}

// Listen for extension runtime messages.
chrome.runtime.onMessage.addListener(dispatchBackgroundMessage);

const SITE_SEARCH_STORAGE_KEY = '_x_extension_site_search_custom_2024_unique_';
const SITE_SEARCH_DISABLED_STORAGE_KEY = '_x_extension_site_search_disabled_2024_unique_';
const AGGREGATE_SEARCH_STORE = globalThis.LumnoAggregateSearchStore;
const AGGREGATE_SEARCH = globalThis.LumnoBackgroundAggregateSearch;
const AGGREGATE_SEARCH_STORAGE_KEY = AGGREGATE_SEARCH_STORE.STORAGE_KEY ||
  '_x_extension_aggregate_searches_2026_unique_';
const AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY =
  SETTINGS.AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY ||
  '_x_extension_aggregate_search_auto_group_enabled_2026_unique_';
const SEARCH_BLACKLIST_STORAGE_KEY = '_x_extension_search_blacklist_2026_unique_';
const FAVICON_REQUEST_BLACKLIST_STORAGE_KEY = '_x_extension_favicon_request_blacklist_2026_unique_';
const FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY = '_x_extension_favicon_enhanced_fetch_enabled_2026_unique_';
const OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY = '_x_extension_overlay_open_tabs_default_visible_2026_unique_';
const BLACKLIST_UTILS = globalThis.LumnoBlacklistUtils;
const SEARCH_UTILS = globalThis.LumnoSearchUtils;
const COMMUNITY_LINKS = globalThis.LumnoCommunityLinks;
const HELP_CENTER_SEARCH = globalThis.LumnoHelpCenterSearch;
const AI_PROVIDER_SUBMIT = globalThis.LumnoAiProviderSubmit;
const SELECTION_INTENT = globalThis.LumnoSelectionIntent;
const SELECTION_TARGET = globalThis.LumnoSelectionTarget;
const SELECTION_QUICK_ACTION_PROVIDER = globalThis.LumnoSelectionQuickActionProvider;
const DEFAULT_SEARCH_ENGINE_STORAGE_KEY = '_x_extension_default_search_engine_2024_unique_';
const CHROME_SYNC_STORAGE_KEYS = Array.isArray(globalThis.LumnoSettings.CHROME_SYNC_STORAGE_KEYS)
  ? globalThis.LumnoSettings.CHROME_SYNC_STORAGE_KEYS
  : [];
if (providerStorageRuntime) {
  providerStorageRuntime.ready.then(() => {
    migrateStorageIfNeeded(CHROME_SYNC_STORAGE_KEYS);
  });
} else {
  migrateStorageIfNeeded(CHROME_SYNC_STORAGE_KEYS);
}
if (chrome && chrome.storage && chrome.storage.sync &&
    typeof chrome.storage.sync.remove === 'function') {
  chrome.storage.sync.remove(LANGUAGE_MESSAGES_STORAGE_KEY, ignoreExpectedChromeError);
}
const SITE_SEARCH_ICON_STORAGE_KEY = SHORTCUT_FAVICON.SITE_SEARCH_STORAGE_KEY ||
  '_x_extension_site_search_icon_cache_canonical_2026_unique_';

const SITE_SEARCH_ICON_CACHE_OPTIONS = SHORTCUT_FAVICON.SITE_SEARCH_CACHE_OPTIONS || Object.freeze({
  cacheTtlMs: 1000 * 60 * 60 * 24 * 180,
  cacheMaxEntries: 40,
  maxDataUrlLength: 192 * 1024
});
const SITE_SEARCH_PINNED_ICON_KEYS = new Set(Object.keys(
  SHORTCUT_FAVICON.SITE_SEARCH_PINNED_ICON_ASSETS || {}
));
const logBackgroundFaviconDecision = FAVICON_UTILS.createFaviconDecisionLogger({ surface: 'background' });

getBackgroundFaviconCacheRuntime();

function normalizeHost(hostname) {
  if (!hostname) {
    return '';
  }
  const lower = String(hostname).toLowerCase();
  const stripped = lower.replace(/^www\./i, '');
  if (stripped === 'my.feishu.cn') {
    return 'feishu.cn';
  }
  return stripped;
}

defaultSearchEngineStateReady = loadDefaultSearchEngineState();

if (chrome && chrome.tabs) {
  chrome.tabs.onCreated.addListener((tab) => {
    if (!pendingSearchAt || !tab || typeof tab.id !== 'number') {
      return;
    }
    if (pendingSearchTabId !== null && tab.id !== pendingSearchTabId) {
      return;
    }
    if (Date.now() - pendingSearchAt > 5000) {
      pendingSearchAt = 0;
      pendingSearchTabId = null;
      pendingSearchGroupContext = null;
      return;
    }
    pendingSearchTabId = tab.id;
    moveTabToSourceGroupContext(tab, pendingSearchGroupContext, () => {});
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo || !changeInfo.url) {
      return;
    }
    if (!pendingSearchAt || (Date.now() - pendingSearchAt > 10000)) {
      pendingSearchAt = 0;
      pendingSearchTabId = null;
      pendingSearchGroupContext = null;
      return;
    }
    if (pendingSearchTabId !== null && tabId !== pendingSearchTabId) {
      return;
    }
    const updated = updateDefaultSearchEngineFromUrl(changeInfo.url);
    if (updated) {
      pendingSearchTabId = null;
      pendingSearchAt = 0;
      pendingSearchGroupContext = null;
    }
  });
}

removeLegacySiteSearchIconCaches();
warmSiteSearchProviderIcons();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!isPrimaryStorageAreaName(areaName)) {
    return;
  }
  if (changes[RESTRICTED_ACTION_STORAGE_KEY]) {
    const next = changes[RESTRICTED_ACTION_STORAGE_KEY].newValue;
    restrictedActionCache = next === 'none' ? 'none' : 'default';
    if (typeof next !== 'undefined' && next !== restrictedActionCache && storageArea) {
      storageArea.set({ [RESTRICTED_ACTION_STORAGE_KEY]: restrictedActionCache });
    }
  }
  if (changes[RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY]) {
    const next = changes[RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY].newValue;
    restrictedActionAutoBrowserSettingDoneCache = next === true;
  }
  if (changes[DOCUMENT_PIP_ENABLED_STORAGE_KEY]) {
    const next = changes[DOCUMENT_PIP_ENABLED_STORAGE_KEY].newValue;
    const normalized = next === true;
    documentPipEnabledCache = normalized;
    resolveDocumentPipEnabledReady();
    if (typeof next !== 'undefined' && next !== normalized && storageArea) {
      storageArea.set({ [DOCUMENT_PIP_ENABLED_STORAGE_KEY]: normalized });
    }
  }
  if (changes[TAB_SWITCHER_ENABLED_STORAGE_KEY]) {
    const next = changes[TAB_SWITCHER_ENABLED_STORAGE_KEY].newValue;
    const normalized = SETTINGS.normalizeTabSwitcherEnabled(next);
    applyTabSwitcherEnabledSetting(normalized);
    if (typeof next !== 'undefined' && next !== normalized && storageArea) {
      storageArea.set({ [TAB_SWITCHER_ENABLED_STORAGE_KEY]: normalized });
    }
  }
  if (changes[PINNED_TAB_RECOVERY_ENABLED_STORAGE_KEY]) {
    const next = changes[PINNED_TAB_RECOVERY_ENABLED_STORAGE_KEY].newValue;
    const normalized = applyPinnedTabRecoverySetting(next);
    if (normalized) {
      schedulePersistPinnedTabSnapshot();
    }
  }
  if (changes[SITE_SEARCH_STORAGE_KEY] || changes[SITE_SEARCH_DISABLED_STORAGE_KEY]) {
    invalidateSiteSearchProviderCache();
    warmSiteSearchProviderIcons();
  }
  if (changes[SEARCH_BLACKLIST_STORAGE_KEY]) {
    searchBlacklistCache = null;
    searchBlacklistPromise = null;
  }
  if (changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY]) {
    faviconRequestBlacklistCache = null;
    faviconRequestBlacklistPromise = null;
    invalidateShortcutFaviconPolicyCache();
  }
  if (changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY]) {
    faviconEnhancedFetchEnabledCache = null;
    faviconEnhancedFetchEnabledPromise = null;
    invalidateShortcutFaviconPolicyCache();
  }
  if (changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY]) {
    searchResultSourceTypesCache = null;
    searchResultSourceTypesPromise = null;
  }
  if (changes[SETTINGS.SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY]) {
    setSearchFuzzyPinyinEnabled(SETTINGS.normalizeSearchFuzzyPinyinEnabled(
      changes[SETTINGS.SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY].newValue
    ));
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[SEARCH_SELECTION_STATS_STORAGE_KEY]) {
    return;
  }
  searchSelectionStatsCache = normalizeSearchSelectionStats(
    changes[SEARCH_SELECTION_STATS_STORAGE_KEY].newValue
  );
  searchSelectionStatsPromise = null;
});
