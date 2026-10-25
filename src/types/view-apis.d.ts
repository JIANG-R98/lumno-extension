// The React views that pages and injected scripts reach on globalThis (see
// globals.d.ts): the tooltip view (src/shared/react/tooltip-view.tsx) and
// the feature hint view (src/shared/react/feature-hint-view.tsx).

export interface TooltipElementOptions {
  className?: string;
  documentObj?: Document;
  id?: string;
  kind?: string;
  positionMode?: string;
}

export interface CursorTagModel {
  keyText: string;
  label: string;
  windowsLogo?: boolean;
}

export interface BrowserAvatar {
  id?: string;
  name?: string;
  src?: string;
}

export interface BrowserAvatarTooltipModel {
  browsers?: BrowserAvatar[];
  browserNameSeparator?: string;
  browserAvatarSuffix?: string;
}

export interface TooltipViewApi {
  readonly implementation: string;
  createTooltipElement(options?: TooltipElementOptions): HTMLElement | null;
  destroyTooltipElement(element: HTMLElement | null): void;
  renderTooltipText(element: HTMLElement, text: string): HTMLElement;
  renderCursorTag(element: HTMLElement, model: CursorTagModel): HTMLElement;
  renderBrowserAvatarTooltip(element: HTMLElement, model: BrowserAvatarTooltipModel): HTMLElement;
}

export interface FeatureHintViewModel {
  actions?: Array<{
    iconHtml?: string;
    id: string;
    variant?: 'primary' | 'secondary';
  }>;
  alignMode: string;
  arrowAlign: string;
  arrowSide: string;
  badgeIconHtml?: string;
  badgeIconImageSrc?: string;
  badgeIconText?: string;
  badgeWordmarkDarkImageSrc?: string;
  badgeWordmarkImageSrc?: string;
  className?: string;
  dismissStorage: string;
  elementId: string;
  hasLink: boolean;
  hintId: string;
  inlineActions?: boolean;
  placement?: string;
  roundedArrowTip: boolean;
  surface?: string;
  textId: string;
  version?: string;
  widthMode: string;
}

export interface FeatureHintViewLabels {
  actions?: Record<string, string>;
  badge: string;
  close: string;
  connector?: string;
  link?: string;
  text: string;
  trailing?: string;
}

export interface FeatureHintViewOptions {
  documentObj?: Document;
  labels: FeatureHintViewLabels;
  model: FeatureHintViewModel;
  onActionClick?(actionId: string, event: MouseEvent): void;
  onDismiss?(): void;
  onLinkClick?(event: MouseEvent): void;
}

export interface FeatureHintViewController {
  actionButtons: HTMLButtonElement[];
  arrowTip: HTMLSpanElement | null;
  badge: HTMLSpanElement;
  closeButton: HTMLButtonElement;
  destroy(): void;
  element: HTMLSpanElement;
  linkButton: HTMLButtonElement | null;
  text: HTMLSpanElement;
  updateLabels(labels: FeatureHintViewLabels): void;
}

export interface FeatureHintViewApi {
  readonly implementation: string;
  createFeatureHintView(options: FeatureHintViewOptions): FeatureHintViewController | null;
}
