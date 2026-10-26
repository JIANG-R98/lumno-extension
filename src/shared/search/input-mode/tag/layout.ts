// Where the mode tag sits in the input: the left padding that makes room
// for it, and the right padding that keeps the typed text clear of the Tab
// hint and the surface's badge.
import { isElementVisible, setStyle } from '../page';
import type { ControllerOptions } from '../mode-options';

interface ModeTagLayoutParts {
  tag: HTMLElement;
  tabHint: HTMLElement;
  input: HTMLInputElement;
  win: Pick<Window, 'getComputedStyle'> & Partial<Pick<Window, 'matchMedia'>>;
  // The surface's own badge on the input's right (e.g. a keyboard hint).
  getModeBadgeElement?(): HTMLElement | null | undefined;
  modeBadgeElement?: HTMLElement | null;
}

type ModeTagLayoutOptions = Pick<ControllerOptions,
  'setInputStyle' | 'getExtraRightInset' | 'rightAnchorOffset' | 'rightReserveBase' | 'prefixGap' | 'configuredBaseInputPaddingLeft'>;

class ModeTagLayout {
  private readonly parts: ModeTagLayoutParts;
  private readonly options: ModeTagLayoutOptions;
  // The input's own left padding, read once.
  private baseInputPaddingLeft: number | null = null;

  constructor(parts: ModeTagLayoutParts, options: ModeTagLayoutOptions) {
    this.parts = parts;
    this.options = options;
  }

  shouldReduceMotion(): boolean {
    const win = this.parts.win;
    return Boolean(win && typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  badgeElement(): HTMLElement | null {
    const parts = this.parts;
    return (typeof parts.getModeBadgeElement === 'function' ? parts.getModeBadgeElement() : parts.modeBadgeElement) || null;
  }

  // The input's left padding: its own, or past the tag while one shows.
  updatePrefixLayout(): void {
    const { tag, input } = this.parts;
    const basePadding = this.readBaseInputPaddingLeft();
    setStyle(tag, 'left', `${basePadding}px`);
    if (!isElementVisible(tag)) {
      this.options.setInputStyle(input, 'padding-left', `${basePadding}px`);
      return;
    }
    const tagWidth = Math.ceil(tag.offsetWidth || tag.getBoundingClientRect().width || 0);
    this.options.setInputStyle(input, 'padding-left', `${Math.max(basePadding + tagWidth + this.options.prefixGap, basePadding)}px`);
  }

  updateRightPadding(): void {
    const { tabHint, input } = this.parts;
    const getExtraRightInset = this.options.getExtraRightInset;
    const extraInset = getExtraRightInset ? getExtraRightInset() : 0;
    const anchorOffset = this.options.rightAnchorOffset + extraInset;
    let totalReserve = this.options.rightReserveBase + extraInset;
    const badgeElement = this.badgeElement();
    if (getExtraRightInset) {
      setStyle(tabHint, 'right', `${anchorOffset}px`);
      if (badgeElement) {
        setStyle(badgeElement, 'right', `${anchorOffset}px`);
      }
    }
    if (badgeElement && isElementVisible(badgeElement)) {
      totalReserve = Math.max(totalReserve, anchorOffset + Math.ceil(badgeElement.getBoundingClientRect().width || 0) + 12);
    }
    if (isElementVisible(tabHint)) {
      totalReserve = Math.max(totalReserve, anchorOffset + Math.ceil(tabHint.getBoundingClientRect().width || 0) + 12);
    }
    this.options.setInputStyle(input, 'padding-right', `${totalReserve}px`);
  }

  private readBaseInputPaddingLeft(): number {
    if (this.baseInputPaddingLeft === null) {
      const computed = parseFloat(this.parts.win.getComputedStyle(this.parts.input).paddingLeft);
      this.baseInputPaddingLeft = Number.isFinite(computed) && computed > 0
        ? computed
        : (this.options.configuredBaseInputPaddingLeft || 50);
    }
    return this.baseInputPaddingLeft;
  }
}

export type { ModeTagLayoutOptions, ModeTagLayoutParts };
export { ModeTagLayout };
