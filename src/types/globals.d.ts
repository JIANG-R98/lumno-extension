// Values scripts hand each other on globalThis.
import type { FeatureHintViewApi, TooltipViewApi } from './view-apis';
import type { ShortcutRule } from '../domain/messages';
import type * as SearchSourceOrder from '../domain/search/search-source-order';
import type { createOverlayShellApi } from '../overlay/react/shell';
import type { createSearchInputApi } from '../shared/react/search-input';
import type { ThemeVariant } from '../shared/favicon/favicon-theme';
import type { createBlacklistTabApi } from '../options/react/blacklist-tab';
import type { createSettingsControlsApi } from '../options/react/settings-controls';
import type { createSettingsNavigationApi } from '../options/react/settings-navigation';
import type { createShortcutsTabApi } from '../options/react/shortcuts-tab';
import type { createToastApi } from '../shared/react/toast';
import type { createAccountTabApi } from '../options/react/account-tab';
import type { createPopupApi } from '../popup/react/popup-view';
import type { createOnboardingPageApi } from '../onboarding/react/onboarding-page';
import type { createBookmarksViewApi } from '../newtab/react/bookmarks';
import type { createSegmentedIndicatorApi } from '../shared/react/segmented-indicator';
import type { createDockApi } from '../newtab/react/dock';
import type { createFeedbackControlApi } from '../newtab/react/feedback';
import type { createRecentSitesViewApi } from '../newtab/react/recent-sites';
import type { createSelectMenuApi } from '../newtab/react/select-menu';
import type { createShortcutDialogApi } from '../newtab/react/shortcut-dialog-lazy';
import type { createRecentHistoryDialogApi } from '../newtab/react/recent-history-dialog-lazy';
import type { createFolderColorPickerApi } from '../newtab/react/folder-color-picker-lazy';
import type { createShortcutsViewApi } from '../newtab/react/shortcuts';
import type { createSuggestionsViewApi } from '../shared/react/search/suggestions';
import type { createTopContentApi } from '../newtab/react/wordmark';
import type { createPageStructureApi } from '../newtab/react/page-structure';
import type { createBookmarksTopbarApi } from '../newtab/react/bookmarks-topbar';
import type { createLiquidSurfaces } from '../newtab/react/liquid-glass';
import type { createPageNoticeApi } from '../newtab/react/page-notice';
import type { createBookmarkCascadeViewApi } from '../newtab/react/bookmark-cascade-view';
import type { createWallpaperViewApi } from '../newtab/react/wallpaper-view';
import type { createQuoteLineViewApi } from '../newtab/react/quote-line';
import type { WallpaperEffectPreloadRuntime, WallpaperPreloadState } from '../newtab/wallpaper/wallpaper-preload-types';
import type { StorageReadPrefetch } from '../platform/settings-storage';
import type { HeldViewTransition } from '../newtab/focus-resume';

declare global {
  // The EyeDropper API, which Chromium has and TypeScript's DOM library
  // does not describe yet.
  interface EyeDropperResult {
    sRGBHex: string;
  }
  interface EyeDropperInstance {
    open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
  }
  interface Window {
    EyeDropper?: new () => EyeDropperInstance;
  }
  // Uint8Array.fromBase64, which newer browsers have and TypeScript's
  // library does not describe yet.
  interface Uint8ArrayConstructor {
    fromBase64?(base64: string): Uint8Array<ArrayBuffer>;
  }
  // What a page's preload scripts hand to the page's own scripts; read and
  // written only through src/platform/boot-handoff.ts.
  interface LumnoBootHandoff {
    // The last New Tab's locale messages, fetched by
    // src/newtab/newtab-storage-prefetch.ts before the page's scripts load.
    localePrefetch?: { locale: string; messages: Promise<unknown> };
    // Whether motion effects are on, as first read by src/shared/motion-preload.ts.
    motionPreferenceReady?: Promise<boolean>;
    // Set by src/newtab/wallpaper/wallpaper-preload.ts when it painted a
    // wallpaper, and by wallpaper-effect-preload.ts when it started the effect.
    wallpaperPreload?: WallpaperPreloadState;
    wallpaperEffectPreload?: WallpaperEffectPreloadRuntime;
    // Storage reads a preload started, by the storage area they read
    // (src/platform/settings-storage.ts).
    storageReadPrefetches?: WeakMap<object, StorageReadPrefetch>;
    // The view transition a focus-resume reload holds until the page has
    // rebuilt its search (src/newtab/focus-resume.ts).
    focusResumeTransition?: HeldViewTransition | null;
  }
  var __lumnoBoot: LumnoBootHandoff | undefined;
  // What the extension's scripts in a page's isolated world share; read and
  // written only through src/platform/content-registry.ts, and read by the
  // worker's injected functions.
  interface LumnoContentRegistry {
    // The classic content scripts that already run in this world.
    claimed: Record<string, true>;
    // Whether the search overlay is open; absent until the overlay loads.
    overlayOpen?: boolean;
    // Whether the page clip picker has the page in its PiP window.
    documentPipActive?: boolean;
  }
  var __lumnoContent: LumnoContentRegistry | undefined;
  // Set by the React islands entry of each page that has React.
  var LumnoTooltipView: TooltipViewApi | undefined;
  var LumnoFeatureHintView: FeatureHintViewApi | undefined;
  // assets/data/shortcut-rules.json, once a search surface loaded it.
  var _x_extension_shortcut_rules_2024_unique_: ShortcutRule[] | undefined;
  var _x_extension_shortcut_rules_promise_2024_unique_: Promise<ShortcutRule[]> | undefined;
  // Site themes and favicon data the overlay resolved, kept across openings
  // in the same page; the new tab page keeps the theme caches the same way.
  var _x_extension_theme_color_cache_2024_unique_: Map<string, ThemeVariant> | undefined;
  var _x_extension_theme_host_cache_2024_unique_: Map<string, ThemeVariant> | undefined;
  var _x_extension_overlay_favicon_data_cache_2026_unique_: Map<string, string> | undefined;
  var _x_extension_overlay_favicon_data_pending_2026_unique_: Map<string, Promise<string | null>> | undefined;
  var _x_extension_overlay_icon_preload_cache_2026_unique_: Map<string, HTMLImageElement> | undefined;
  // Undo and redo of mode menu moves, kept across openings of the overlay.
  var __lumnoSearchSourceOrderHistory2026: ReturnType<typeof SearchSourceOrder.createHistory> | undefined;
  // Set by the React islands entry of the overlay and of the new tab page.
  var _x_extension_createSearchInput_2024_unique_: ReturnType<typeof createSearchInputApi>['createSearchInput'] | undefined;
  // Set by the overlay's React islands entry.
  var LumnoOverlayShell: ReturnType<typeof createOverlayShellApi> | undefined;
  var LumnoOverlaySuggestionsView: ReturnType<typeof createSuggestionsViewApi> | undefined;
  // Set by the popup's React islands entry.
  var LumnoPopupReact: ReturnType<typeof createPopupApi> | undefined;
  // Set by the options page's React islands entry.
  var LumnoOptionsShortcutsTab: ReturnType<typeof createShortcutsTabApi> | undefined;
  var LumnoOptionsBlacklistTab: ReturnType<typeof createBlacklistTabApi> | undefined;
  var LumnoOptionsSettingsControls: ReturnType<typeof createSettingsControlsApi> | undefined;
  var LumnoOptionsSettingsNavigation: ReturnType<typeof createSettingsNavigationApi> | undefined;
  var LumnoOptionsToast: ReturnType<typeof createToastApi> | undefined;
  var LumnoOptionsAccountTab: ReturnType<typeof createAccountTabApi> | undefined;
  // Set by the onboarding page's React islands entry.
  var LumnoOnboardingPage: ReturnType<typeof createOnboardingPageApi> | undefined;
  // Set by the New Tab's React islands entry.
  var LumnoNewtabBookmarksView: ReturnType<typeof createBookmarksViewApi> | undefined;
  var LumnoNewtabFeedbackControl: ReturnType<typeof createFeedbackControlApi> | undefined;
  var LumnoNewtabDock: ReturnType<typeof createDockApi> | undefined;
  var LumnoNewtabShortcutDialog: ReturnType<typeof createShortcutDialogApi> | undefined;
  var LumnoNewtabRecentHistoryDialog: ReturnType<typeof createRecentHistoryDialogApi> | undefined;
  var LumnoNewtabFolderColorPicker: ReturnType<typeof createFolderColorPickerApi> | undefined;
  var LumnoNewtabShortcutsView: ReturnType<typeof createShortcutsViewApi> | undefined;
  var LumnoNewtabRecentSitesView: ReturnType<typeof createRecentSitesViewApi> | undefined;
  var LumnoNewtabSelectMenu: ReturnType<typeof createSelectMenuApi> | undefined;
  var LumnoNewtabSuggestionsView: ReturnType<typeof createSuggestionsViewApi> | undefined;
  var LumnoNewtabToast: ReturnType<typeof createToastApi> | undefined;
  var LumnoNewtabTopContent: ReturnType<typeof createTopContentApi> | undefined;
  var LumnoNewtabWordmark: ReturnType<typeof createTopContentApi> | undefined;
  var LumnoNewtabPageStructure: ReturnType<typeof createPageStructureApi> | undefined;
  var LumnoNewtabBookmarksTopbar: ReturnType<typeof createBookmarksTopbarApi> | undefined;
  var LumnoNewtabLiquidSurfaces: { create: typeof createLiquidSurfaces } | undefined;
  var LumnoNewtabPageNotice: ReturnType<typeof createPageNoticeApi> | undefined;
  var LumnoNewtabBookmarkCascadeView: ReturnType<typeof createBookmarkCascadeViewApi> | undefined;
  var LumnoNewtabWallpaperView: ReturnType<typeof createWallpaperViewApi> | undefined;
  var LumnoNewtabQuoteLine: ReturnType<typeof createQuoteLineViewApi> | undefined;
  var LumnoSearchInputUI: ReturnType<typeof createSearchInputApi> | undefined;
  var LumnoSegmentedIndicator: ReturnType<typeof createSegmentedIndicatorApi> | undefined;
}

