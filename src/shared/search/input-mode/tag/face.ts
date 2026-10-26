// The mode tag's face: its identity, text and icon, and the icon swap,
// where a copy of the previous icon fades out while the new one pops in.
// The view draws the content from the tag's model; the swap's motion runs
// here on the drawn icons.
import { getModeLineIconPaths } from '../line-icons';
import { isElementVisible, setStyle } from '../page';
import type { ControllerOptions } from '../mode-options';
import type { ModeTagGhost, ModeTagIcon } from '../mode-tag-model';
import type { PrefixContentOptions } from '../types';
import type { ModeTagDrawing } from './drawing';
import type { ModeTagLayout } from './layout';

interface ModeTagFaceParts {
  tag: HTMLElement;
  lineIcon: SVGElement;
  iconFrame: HTMLElement;
  glyph: HTMLElement;
  // The "current" label shown beside the tag while the menu is open.
  current: HTMLElement;
  win: Partial<Pick<Window, 'getComputedStyle'>> | null | undefined;
}

// Where the "current" label sits and how wide it is.
interface ModeTagCurrentBox {
  marginLeft: number;
  width: number;
}

type PrefixIcon = SVGElement | HTMLElement;

const ICON_POP_DURATION = 180;
const ICON_POP_EASING = 'linear';
const ICON_EXIT_DURATION = 100;
const ICON_EXIT_EASING = 'cubic-bezier(0.4, 0, 1, 1)';
const ICON_POP_KEYFRAMES: Keyframe[] = [
  { opacity: 0.45, offset: 0, transform: 'scale(0.84)' },
  { easing: 'cubic-bezier(0.16, 1, 0.3, 1)', opacity: 1, offset: 0.62, transform: 'scale(1.05)' },
  { easing: 'cubic-bezier(0.22, 1, 0.36, 1)', opacity: 1, offset: 0.84, transform: 'scale(0.99)' },
  { opacity: 1, offset: 1, transform: 'scale(1)' }
];

function isAnimatable(element: Element | null): element is Element & ElementCSSInlineStyle & Animatable {
  return Boolean(element && 'style' in element && 'animate' in element && typeof element.animate === 'function');
}

function getScopeLabel(formatMessage: ControllerOptions['formatMessage'], prefixText: string): string {
  return formatMessage('search_scope_switcher_label', '搜索范围：{scope}。选择即可切换。', { scope: prefixText });
}

function settleIcon(icon: ElementCSSInlineStyle): void {
  setStyle(icon, 'opacity', '1');
  setStyle(icon, 'filter', 'none');
  setStyle(icon, 'transform', 'none');
  setStyle(icon, 'will-change', 'auto');
}

class ModeTagFace {
  private readonly parts: ModeTagFaceParts;
  private readonly drawing: ModeTagDrawing;
  private readonly layout: ModeTagLayout;
  private readonly options: Pick<ControllerOptions, 'formatMessage' | 'resolveProviderIconUrl'>;
  private iconAnimation: Animation | null = null;
  private iconAnimationElement: PrefixIcon | null = null;
  private outgoingIconAnimation: Animation | null = null;
  private ghostCount = 0;

  constructor(
    parts: ModeTagFaceParts,
    drawing: ModeTagDrawing,
    layout: ModeTagLayout,
    options: Pick<ControllerOptions, 'formatMessage' | 'resolveProviderIconUrl'>
  ) {
    this.parts = parts;
    this.drawing = drawing;
    this.layout = layout;
    this.options = options;
  }

  setIdentity(prefixText: string, contentOptions?: PrefixContentOptions | null): void {
    this.drawing.update({
      modeId: contentOptions && contentOptions.modeId ? String(contentOptions.modeId) : '',
      ariaLabel: getScopeLabel(this.options.formatMessage, prefixText)
    });
  }

  cancelIconAnimation(): void {
    const incomingAnimation = this.iconAnimation;
    const incomingElement = this.iconAnimationElement;
    const outgoingAnimation = this.outgoingIconAnimation;
    this.iconAnimation = null;
    this.iconAnimationElement = null;
    this.outgoingIconAnimation = null;
    if (incomingAnimation && typeof incomingAnimation.cancel === 'function') {
      incomingAnimation.cancel();
    }
    if (outgoingAnimation && typeof outgoingAnimation.cancel === 'function') {
      outgoingAnimation.cancel();
    }
    if (incomingElement) {
      settleIcon(incomingElement);
    }
    this.removeGhost();
  }

  // How wide the tag would be with this text.
  measureWidthForText(prefixText: string): number {
    const previousText = this.drawing.model.text;
    this.drawing.update({ text: String(prefixText || '') });
    const width = Number(this.parts.tag.getBoundingClientRect().width) || 0;
    this.drawing.update({ text: previousText });
    return width;
  }

  setContent(prefixText: string, contentOptions?: PrefixContentOptions | null): void {
    const options: PrefixContentOptions = contentOptions || {};
    const preserveIconAnimation = Boolean(options.preserveIconAnimation);
    let ghost: ModeTagGhost | null = null;
    if (!preserveIconAnimation) {
      this.cancelIconAnimation();
      ghost = this.createGhost(Boolean(options.animateOutgoingIcon));
    }
    this.drawing.update({
      text: prefixText,
      icon: this.readIcon(options),
      iconFailed: false,
      currentText: this.options.formatMessage('search_scope_current', '当前'),
      modeId: options.modeId ? String(options.modeId) : '',
      ariaLabel: getScopeLabel(this.options.formatMessage, prefixText),
      ...(preserveIconAnimation ? {} : { ghost })
    });
    if (!preserveIconAnimation) {
      this.playIconSwap(Boolean(options.animateIcon), ghost);
    }
  }

  // The site icon failed: the glyph shows in its place.
  handleIconError(): void {
    const { icon, iconFailed } = this.drawing.model;
    if (!icon || iconFailed || !icon.iconUrl || getModeLineIconPaths(icon.lineIcon)) {
      return;
    }
    this.drawing.update({ iconFailed: true });
    this.layout.updatePrefixLayout();
  }

  renderedWidth(): number {
    const tag = this.parts.tag;
    return isElementVisible(tag) ? Math.max(0, Number(tag.getBoundingClientRect().width) || 0) : 0;
  }

  currentBox(): ModeTagCurrentBox {
    const { tag, current, win } = this.parts;
    if (!isElementVisible(tag)) {
      return { marginLeft: 0, width: 0 };
    }
    const width = Math.max(0, Number(current.getBoundingClientRect().width) || 0);
    const computedStyle = win && typeof win.getComputedStyle === 'function' ? win.getComputedStyle(current) : null;
    return { marginLeft: computedStyle ? Number.parseFloat(computedStyle.marginLeft) || 0 : 0, width };
  }

  // The icon a mode tag shows: a line icon from the menu, the site's icon,
  // or the search glyph.
  private readIcon(options: PrefixContentOptions): ModeTagIcon {
    const lineIconName = options.menuIconName ? String(options.menuIconName).trim() : '';
    return {
      lineIcon: getModeLineIconPaths(lineIconName) ? lineIconName : '',
      glyphName: options.iconName || (options.isAi ? 'ri-search-ai-line' : 'ri-search-line'),
      iconUrl: String(this.options.resolveProviderIconUrl(options.provider, options.iconUrl || '') || '').trim(),
      iconHost: options.iconHost ? String(options.iconHost).trim() : ''
    };
  }

  private activeIcon(): PrefixIcon | undefined {
    const { lineIcon, iconFrame, glyph } = this.parts;
    return [lineIcon, iconFrame, glyph].find((element) => isElementVisible(element));
  }

  // Drops the fading copy; only the given one when a key is passed.
  private removeGhost(key?: number): void {
    const ghost = this.drawing.model.ghost;
    if (ghost && (key === undefined || ghost.key === key)) {
      this.drawing.update({ ghost: null });
    }
  }

  // A copy of the shown icon over it, to fade out while the new one pops in.
  private createGhost(animateIcon: boolean): ModeTagGhost | null {
    const icon = this.drawing.model.icon;
    const activeIcon = animateIcon && icon && !this.layout.shouldReduceMotion() ? this.activeIcon() : undefined;
    if (!icon || !activeIcon) {
      return null;
    }
    const prefixRect = this.parts.tag.getBoundingClientRect();
    const iconRect = activeIcon.getBoundingClientRect();
    const layoutWidth = 'offsetWidth' in activeIcon ? Number(activeIcon.offsetWidth) : 0;
    const layoutHeight = 'offsetHeight' in activeIcon ? Number(activeIcon.offsetHeight) : 0;
    const iconLeft = Number(iconRect.left) - Number(prefixRect.left);
    const iconTop = Number(iconRect.top) - Number(prefixRect.top);
    this.ghostCount += 1;
    return {
      key: this.ghostCount,
      icon,
      showImage: activeIcon === this.parts.iconFrame,
      left: Number.isFinite(iconLeft) ? iconLeft : 0,
      top: Number.isFinite(iconTop) ? iconTop : 0,
      width: Number(iconRect.width) || layoutWidth || 16,
      height: Number(iconRect.height) || layoutHeight || 16
    };
  }

  private playIconSwap(animateIcon: boolean, ghost: ModeTagGhost | null): void {
    const activeIcon = this.activeIcon();
    if (!activeIcon) {
      this.removeGhost();
      return;
    }
    settleIcon(activeIcon);
    setStyle(activeIcon, 'transform-origin', 'center');
    if (!animateIcon || this.layout.shouldReduceMotion() || !isAnimatable(activeIcon)) {
      this.removeGhost();
      return;
    }
    this.playIconPop(activeIcon);
    this.playGhostExit(ghost);
  }

  private playIconPop(activeIcon: PrefixIcon & Animatable): void {
    const animation = activeIcon.animate(ICON_POP_KEYFRAMES, { duration: ICON_POP_DURATION, easing: ICON_POP_EASING });
    this.iconAnimation = animation;
    this.iconAnimationElement = activeIcon;
    setStyle(activeIcon, 'will-change', 'opacity, transform');
    animation.onfinish = () => {
      if (this.iconAnimation !== animation) {
        return;
      }
      this.iconAnimation = null;
      this.iconAnimationElement = null;
      settleIcon(activeIcon);
    };
    animation.oncancel = () => {
      if (this.iconAnimation === animation) {
        this.iconAnimation = null;
        this.iconAnimationElement = null;
      }
    };
  }

  private playGhostExit(ghost: ModeTagGhost | null): void {
    const outgoingIcon = ghost ? this.parts.tag.querySelector('[data-search-input-mode-icon-ghost]') : null;
    if (!ghost || !isAnimatable(outgoingIcon)) {
      this.removeGhost();
      return;
    }
    outgoingIcon.style.setProperty('opacity', '1');
    outgoingIcon.style.setProperty('transform', 'none');
    outgoingIcon.style.setProperty('will-change', 'opacity, transform');
    const outgoingAnimation = outgoingIcon.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.84)' }
    ], { duration: ICON_EXIT_DURATION, easing: ICON_EXIT_EASING });
    this.outgoingIconAnimation = outgoingAnimation;
    const removeOutgoingIcon = (): void => {
      if (this.outgoingIconAnimation === outgoingAnimation) {
        this.outgoingIconAnimation = null;
      }
      this.removeGhost(ghost.key);
    };
    outgoingAnimation.onfinish = removeOutgoingIcon;
    outgoingAnimation.oncancel = removeOutgoingIcon;
  }
}

export type { ModeTagFaceParts, ModeTagCurrentBox };
export { ModeTagFace };
