// Values scripts hand each other on globalThis.

// The React tooltip view (src/shared/react/tooltip-view.tsx) as pages and
// injected surfaces reach it on globalThis.LumnoTooltipView.
interface LumnoTooltipElementOptions {
  className?: string;
  documentObj?: Document;
  id?: string;
  kind?: string;
  positionMode?: string;
}

interface LumnoCursorTagModel {
  keyText: string;
  label: string;
  windowsLogo?: boolean;
}

interface LumnoBrowserAvatarTooltipModel {
  browsers?: Array<{ id?: string; name?: string; src?: string }>;
  browserNameSeparator?: string;
  browserAvatarSuffix?: string;
}

interface LumnoTooltipViewApi {
  readonly implementation: string;
  createTooltipElement(options?: LumnoTooltipElementOptions): HTMLElement | null;
  destroyTooltipElement(element: HTMLElement | null): void;
  renderTooltipText(element: HTMLElement, text: string): HTMLElement;
  renderCursorTag(element: HTMLElement, model: LumnoCursorTagModel): HTMLElement;
  renderBrowserAvatarTooltip(element: HTMLElement, model: LumnoBrowserAvatarTooltipModel): HTMLElement;
}

declare global {
  // The traditional-to-simplified Han table as pairs of characters, set by
  // src/shared/search/search-han-variants.js once a page or the worker loads it.
  var LumnoSearchHanVariants: string | undefined;
  // Whether motion effects are on, as first read by src/shared/motion-preload.ts.
  var LumnoMotionPreferenceReady: Promise<boolean> | undefined;
  // Set by the React islands entry of each page that has React.
  var LumnoTooltipView: LumnoTooltipViewApi | undefined;
}

export type { LumnoBrowserAvatarTooltipModel, LumnoCursorTagModel, LumnoTooltipElementOptions, LumnoTooltipViewApi };

