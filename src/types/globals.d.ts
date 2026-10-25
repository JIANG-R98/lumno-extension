// Values scripts hand each other on globalThis.
import type { FeatureHintViewApi, TooltipViewApi } from './view-apis';
import type { AutoPipBlacklist, DocumentPipPickerApi, PageShortcutToastApi } from './content-apis';

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
}

