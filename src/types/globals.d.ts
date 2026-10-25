// Values scripts hand each other on globalThis.
import type { FeatureHintViewApi, TooltipViewApi } from './view-apis';
import type { AutoPipBlacklist, DocumentPipPickerApi, PageShortcutToastApi } from './content-apis';
import type { ShortcutRule } from '../domain/messages';
import type * as SearchSourceOrder from '../domain/search/search-source-order';
import type { SuggestionsViewController, SuggestionsViewOptions } from '../shared/react/search/suggestion-list/types';
import type { TabSwitcherViewController, TabSwitcherViewOptions } from '../shared/react/tab-switcher';
import type { TabSwitcherReply } from '../overlay/tab-switcher-host';

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
  // Undo and redo of mode menu moves, kept across openings of the overlay.
  var __lumnoSearchSourceOrderHistory2026: ReturnType<typeof SearchSourceOrder.createHistory> | undefined;
  // Set by the overlay's React islands entry.
  var LumnoOverlaySuggestionsView: {
    createSuggestionsView(options?: SuggestionsViewOptions): SuggestionsViewController;
  } | undefined;
  var LumnoOverlayTabSwitcherView: {
    createTabSwitcherView(options?: TabSwitcherViewOptions): TabSwitcherViewController;
  } | undefined;
  // Opens the tab switcher with the context the worker sends, read as
  // untrusted; set by src/overlay/tab-switcher.ts.
  var _x_extension_toggleTabSwitcher_2026_unique_: ((context: unknown) => TabSwitcherReply) | undefined;
}

