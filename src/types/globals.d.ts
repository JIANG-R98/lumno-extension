// Values scripts hand each other on globalThis.
import type { FeatureHintViewApi, TooltipViewApi } from './view-apis';
import type { AutoPipBlacklist, DocumentPipPickerApi, PageShortcutToastApi } from './content-apis';
import type { ShortcutRule } from '../domain/messages';
import type * as SearchSourceOrder from '../domain/search/search-source-order';
import type { SuggestionsViewController, SuggestionsViewOptions } from '../shared/react/search/suggestion-list/types';
import type { TabSwitcherViewController, TabSwitcherViewOptions } from '../shared/react/tab-switcher';
import type { TabSwitcherReply } from '../overlay/tab-switcher-host';
import type { createOverlayShellApi } from '../overlay/react/shell';
import type { createSearchInputApi } from '../shared/react/search-input';
import type { ThemeVariant } from '../shared/favicon/favicon-theme';
import type { createAggregateSearchListApi } from '../options/react/aggregate-search-list';
import type { createBlacklistListApi } from '../options/react/blacklist-list';
import type { createFeedbackSupportApi } from '../options/react/feedback-support';
import type { createInfoButtonApi } from '../options/react/info-button';
import type { createPopconfirmApi } from '../options/react/popconfirm';
import type { createSegmentedControlApi } from '../options/react/segmented-control';
import type { createSelectControlApi } from '../options/react/select-control';
import type { createSettingsControlsApi } from '../options/react/settings-controls';
import type { createSettingsFormsApi } from '../options/react/settings-forms';
import type { createSettingsNavigationApi } from '../options/react/settings-navigation';
import type { createShortcutHotkeyApi } from '../options/react/shortcut-hotkey';
import type { createShortcutReferenceApi } from '../options/react/shortcut-reference';
import type { createSiteSearchListApi } from '../options/react/site-search-list';
import type { createThemePickerApi } from '../options/react/theme-picker';
import type { createToastApi } from '../shared/react/toast';
import type { createTranslationHelpApi } from '../options/react/translation-help';
import type { createWebDavListApi } from '../options/react/webdav-list';
import type { createPopupApi } from '../popup/react/popup-view';
import type { createActionButtonsApi } from '../onboarding/react/action-buttons';
import type { createBodyCopyApi } from '../onboarding/react/body-copy';
import type { createCopyHeadingApi } from '../onboarding/react/copy-heading';
import type { createCursorLayerApi } from '../onboarding/react/cursor-layer';
import type { createInteractionsApi } from '../onboarding/react/interactions';
import type { createPageStripApi } from '../onboarding/react/page-strip';
import type { createVisualSurfaceApi } from '../onboarding/react/visual-surface';

declare global {
  // The traditional-to-simplified Han table as pairs of characters, set by
  // src/shared/search/search-han-variants.js once a page or the worker loads it.
  var LumnoSearchHanVariants: string | undefined;
  // Whether motion effects are on, as first read by src/shared/motion-preload.ts.
  var LumnoMotionPreferenceReady: Promise<boolean> | undefined;
  // Set by the React islands entry of each page that has React.
  var LumnoTooltipView: TooltipViewApi | undefined;
  var LumnoFeatureHintView: FeatureHintViewApi | undefined;
  // Left by content scripts once they have run in a page.
  var __lumnoAutoPipBlacklist2026: AutoPipBlacklist | undefined;
  var __lumnoPageShortcutToast2026: Readonly<PageShortcutToastApi> | undefined;
  var __lumnoDocumentPiPPicker2026: Readonly<DocumentPipPickerApi> | undefined;
  // assets/data/shortcut-rules.json, once a search surface loaded it.
  var _x_extension_shortcut_rules_2024_unique_: ShortcutRule[] | undefined;
  var _x_extension_shortcut_rules_promise_2024_unique_: Promise<ShortcutRule[]> | undefined;
  // Whether this page's search overlay is open, for the next toggle.
  var _x_extension_search_overlay_open_2026_unique_: boolean | undefined;
  // The overlay script's build, which the worker compares before reusing it.
  var _x_extension_search_overlay_runtime_version_2026_unique_: string | undefined;
  // Opens or closes the search overlay with the window's tabs and the open
  // context the worker sends, both read as untrusted; set by
  // src/overlay/search-panel.ts.
  var _x_extension_toggleSearchOverlay_2026_unique_: ((tabs: unknown, context: unknown) => void) | undefined;
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
  var LumnoOverlaySuggestionsView: {
    createSuggestionsView(options?: SuggestionsViewOptions): SuggestionsViewController;
  } | undefined;
  var LumnoOverlayTabSwitcherView: {
    createTabSwitcherView(options?: TabSwitcherViewOptions): TabSwitcherViewController;
  } | undefined;
  // Set by the popup's React islands entry.
  var LumnoPopupReact: ReturnType<typeof createPopupApi> | undefined;
  // Set by the options page's React islands entry.
  var LumnoOptionsAggregateSearchList: ReturnType<typeof createAggregateSearchListApi> | undefined;
  var LumnoOptionsBlacklistList: ReturnType<typeof createBlacklistListApi> | undefined;
  var LumnoOptionsFeedbackSupport: ReturnType<typeof createFeedbackSupportApi> | undefined;
  var LumnoOptionsInfoButton: ReturnType<typeof createInfoButtonApi> | undefined;
  var LumnoOptionsPopconfirm: ReturnType<typeof createPopconfirmApi> | undefined;
  var LumnoOptionsSegmentedControl: ReturnType<typeof createSegmentedControlApi> | undefined;
  var LumnoOptionsSelectControl: ReturnType<typeof createSelectControlApi> | undefined;
  var LumnoOptionsSettingsControls: ReturnType<typeof createSettingsControlsApi> | undefined;
  var LumnoOptionsSettingsForms: ReturnType<typeof createSettingsFormsApi> | undefined;
  var LumnoOptionsSettingsNavigation: ReturnType<typeof createSettingsNavigationApi> | undefined;
  var LumnoOptionsShortcutHotkey: ReturnType<typeof createShortcutHotkeyApi> | undefined;
  var LumnoOptionsShortcutReference: ReturnType<typeof createShortcutReferenceApi> | undefined;
  var LumnoOptionsSiteSearchList: ReturnType<typeof createSiteSearchListApi> | undefined;
  var LumnoOptionsThemePicker: ReturnType<typeof createThemePickerApi> | undefined;
  var LumnoOptionsToast: ReturnType<typeof createToastApi> | undefined;
  var LumnoOptionsTranslationHelp: ReturnType<typeof createTranslationHelpApi> | undefined;
  var LumnoOptionsWebDavList: ReturnType<typeof createWebDavListApi> | undefined;
  // Set by the onboarding page's React islands entry.
  var LumnoOnboardingActions: ReturnType<typeof createActionButtonsApi> | undefined;
  var LumnoOnboardingBodyCopy: ReturnType<typeof createBodyCopyApi> | undefined;
  var LumnoOnboardingCopyHeading: ReturnType<typeof createCopyHeadingApi> | undefined;
  var LumnoOnboardingCursorLayer: ReturnType<typeof createCursorLayerApi> | undefined;
  var LumnoOnboardingInteractions: ReturnType<typeof createInteractionsApi> | undefined;
  var LumnoOnboardingPageStrip: ReturnType<typeof createPageStripApi> | undefined;
  var LumnoOnboardingVisualSurface: ReturnType<typeof createVisualSurfaceApi> | undefined;
  // Opens the tab switcher with the context the worker sends, read as
  // untrusted; set by src/overlay/tab-switcher.ts.
  var _x_extension_toggleTabSwitcher_2026_unique_: ((context: unknown) => TabSwitcherReply) | undefined;
}

