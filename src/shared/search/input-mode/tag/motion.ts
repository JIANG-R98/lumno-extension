// The mode tag's motion: entering, resizing to a new name, the rest state
// it settles into, and the "current" label that slides out beside it while
// the menu is open.
import { isElementVisible, setStyle } from '../page';
import { MODE_TAG_ITEM_GAP_PX } from '../mode-tag-model';
import type { ModeTagFace, ModeTagCurrentBox } from './face';
import type { ModeTagDrawing } from './drawing';
import type { ModeTagLayout } from './layout';

interface ModeTagMotionParts {
  tag: HTMLElement;
  current: HTMLElement;
  win: Pick<Window, 'requestAnimationFrame' | 'setTimeout'> & Partial<Pick<Window, 'cancelAnimationFrame' | 'clearTimeout'>>;
  // The tag's transition at rest.
  transition: string;
}

interface ModeTagResizeOptions {
  // Each gets the animation revision it ran under.
  onStart?(revision: number): void;
  onFinish?(revision: number): void;
  preservePendingText?: boolean;
}

const RESIZE_DURATION = 140;
const RESIZE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const ENTER_DURATION = 180;
const ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const AT_REST_TRANSFORM = 'translateY(-50%) translateX(0) scaleX(1)';

class ModeTagMotion {
  // The text a resize is on its way to.
  pendingText = '';
  private readonly parts: ModeTagMotionParts;
  private readonly drawing: ModeTagDrawing;
  private readonly layout: ModeTagLayout;
  private readonly face: ModeTagFace;
  private tagAnimation: Animation | null = null;
  private currentAnimation: Animation | null = null;
  // The frame and timer of a resize where the Web Animations API is missing.
  private resizeFrame: number | null = null;
  private resizeTimer = 0;
  // Bumped by every cancel, so a late callback of an earlier motion does nothing.
  private revision = 0;

  constructor(parts: ModeTagMotionParts, drawing: ModeTagDrawing, layout: ModeTagLayout, face: ModeTagFace) {
    this.parts = parts;
    this.drawing = drawing;
    this.layout = layout;
    this.face = face;
  }

  isAnimating(): boolean {
    return Boolean(this.tagAnimation || this.currentAnimation || this.resizeFrame !== null || this.resizeTimer);
  }

  cancel(cancelOptions?: { preservePendingText?: boolean }): void {
    const win = this.parts.win;
    this.revision += 1;
    if (!cancelOptions || cancelOptions.preservePendingText !== true) {
      this.pendingText = '';
    }
    this.cancelCurrentAnimation();
    if (this.tagAnimation) {
      const animation = this.tagAnimation;
      this.tagAnimation = null;
      animation.cancel();
    }
    if (this.resizeFrame !== null && win && typeof win.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
    if (this.resizeTimer && win && typeof win.clearTimeout === 'function') {
      win.clearTimeout(this.resizeTimer);
      this.resizeTimer = 0;
    }
    this.parts.tag.style.removeProperty('width');
  }

  setRestState(restOptions?: { transition?: boolean }): void {
    this.cancel();
    const tag = this.parts.tag;
    setStyle(tag, 'opacity', '1');
    setStyle(tag, 'transform', AT_REST_TRANSFORM);
    setStyle(tag, 'transition', !restOptions || restOptions.transition !== false ? this.parts.transition : 'none');
    setStyle(tag, 'will-change', 'auto');
  }

  playEnter(): void {
    this.cancel();
    const revision = this.revision;
    const tag = this.parts.tag;
    tag.style.setProperty('opacity', '1');
    tag.style.setProperty('transform', AT_REST_TRANSFORM);
    setStyle(tag, 'transition', this.parts.transition);
    if (this.layout.shouldReduceMotion() || typeof tag.animate !== 'function') {
      setStyle(tag, 'will-change', 'auto');
      return;
    }
    const animation = tag.animate([
      { opacity: 0.4, transform: 'translateY(-50%) translateX(-4px) scaleX(0.92)' },
      { opacity: 1, transform: AT_REST_TRANSFORM }
    ], { duration: ENTER_DURATION, easing: ENTER_EASING });
    this.tagAnimation = animation;
    setStyle(tag, 'will-change', 'opacity, transform');
    animation.onfinish = () => {
      if (this.tagAnimation !== animation || revision !== this.revision) {
        return;
      }
      this.tagAnimation = null;
      this.restoreAnimatedState();
    };
    animation.oncancel = () => {
      if (this.tagAnimation === animation) {
        this.tagAnimation = null;
      }
    };
  }

  playResize(fromWidth: number, toWidth: number, resizeOptions?: ModeTagResizeOptions | null): void {
    const options: ModeTagResizeOptions = resizeOptions || {};
    this.cancel({ preservePendingText: options.preservePendingText === true });
    const revision = this.revision;
    const startWidth = Math.max(0, Number(fromWidth) || 0);
    const endWidth = Math.max(0, Number(toWidth) || 0);
    if (typeof options.onStart === 'function') {
      options.onStart(revision);
    }
    const finish = (): void => {
      if (typeof options.onFinish === 'function') {
        options.onFinish(revision);
      }
      if (revision === this.revision) {
        this.restoreAnimatedState();
      }
    };
    if (this.layout.shouldReduceMotion() || startWidth <= 0 || endWidth <= 0 || Math.abs(startWidth - endWidth) < 1) {
      finish();
      return;
    }
    setStyle(this.parts.tag, 'will-change', 'width');
    if (typeof this.parts.tag.animate === 'function') {
      this.animateWidth(startWidth, endWidth, finish);
    } else {
      this.transitionWidth(startWidth, endWidth, revision, finish);
    }
  }

  // Lays the "current" label out with the menu's state after a change cut
  // its motion short.
  settleMenuState(): void {
    this.drawing.update({ currentMeasuring: false, currentVisible: this.drawing.model.menuOpen });
    this.clearCurrentAnimatedStyles();
  }

  // Reveals the "current" label beside the tag while the menu is open.
  setMenuOpen(open: boolean): void {
    const nextOpen = Boolean(open);
    if (this.drawing.model.menuOpen === nextOpen) {
      if (!nextOpen) {
        this.drawing.update({ currentVisible: false });
      }
      return;
    }
    const shouldAnimate = isElementVisible(this.parts.tag);
    const previousBox = shouldAnimate ? this.face.currentBox() : { marginLeft: 0, width: 0 };
    if (shouldAnimate) {
      this.cancel();
    }
    this.drawing.update({ menuOpen: nextOpen, currentMeasuring: nextOpen });
    const nextBox: ModeTagCurrentBox = nextOpen
      ? this.face.currentBox()
      : { marginLeft: -MODE_TAG_ITEM_GAP_PX, width: 0 };
    this.drawing.update({ currentMeasuring: false });
    if (!shouldAnimate) {
      this.drawing.update({ currentVisible: nextOpen });
      this.layout.updatePrefixLayout();
      return;
    }
    if (nextOpen && previousBox.width < 0.5) {
      previousBox.marginLeft = -MODE_TAG_ITEM_GAP_PX;
    }
    this.playCurrentResize(previousBox, nextBox);
  }

  private animateWidth(startWidth: number, endWidth: number, finish: () => void): void {
    const tag = this.parts.tag;
    const animation = tag.animate([{ width: `${startWidth}px` }, { width: `${endWidth}px` }], {
      duration: RESIZE_DURATION,
      easing: RESIZE_EASING
    });
    this.tagAnimation = animation;
    animation.onfinish = () => {
      if (this.tagAnimation !== animation) {
        return;
      }
      this.tagAnimation = null;
      setStyle(tag, 'width', `${endWidth}px`);
      finish();
    };
    animation.oncancel = () => {
      if (this.tagAnimation === animation) {
        this.tagAnimation = null;
      }
    };
  }

  // Without the Web Animations API the width moves by a CSS transition.
  private transitionWidth(startWidth: number, endWidth: number, revision: number, finish: () => void): void {
    const { tag, win, transition } = this.parts;
    setStyle(tag, 'transition', transition);
    setStyle(tag, 'width', `${startWidth}px`);
    this.resizeFrame = win.requestAnimationFrame(() => {
      this.resizeFrame = null;
      setStyle(tag, 'transition', `width ${RESIZE_DURATION}ms ${RESIZE_EASING}, ${transition}`);
      setStyle(tag, 'width', `${endWidth}px`);
      this.resizeTimer = win.setTimeout(() => {
        this.resizeTimer = 0;
        if (revision === this.revision) {
          finish();
        }
      }, RESIZE_DURATION + 10);
    });
  }

  private restoreAnimatedState(): void {
    const tag = this.parts.tag;
    tag.style.removeProperty('width');
    setStyle(tag, 'opacity', '1');
    setStyle(tag, 'transform', AT_REST_TRANSFORM);
    setStyle(tag, 'transition', this.parts.transition);
    setStyle(tag, 'will-change', 'auto');
  }

  private clearCurrentAnimatedStyles(): void {
    const current = this.parts.current;
    current.style.removeProperty('width');
    current.style.removeProperty('margin-left');
    setStyle(current, 'will-change', 'auto');
  }

  private cancelCurrentAnimation(): void {
    const animation = this.currentAnimation;
    this.currentAnimation = null;
    if (animation) {
      animation.cancel();
    }
    this.clearCurrentAnimatedStyles();
  }

  private finishCurrentResize(hide: boolean): void {
    if (hide) {
      this.drawing.update({ currentVisible: false });
    }
    this.clearCurrentAnimatedStyles();
    this.layout.updatePrefixLayout();
  }

  private playCurrentResize(fromBox: ModeTagCurrentBox, toBox: ModeTagCurrentBox): void {
    this.cancelCurrentAnimation();
    const revision = this.revision;
    const current = this.parts.current;
    const startWidth = Math.max(0, Number(fromBox.width) || 0);
    const endWidth = Math.max(0, Number(toBox.width) || 0);
    const startMarginLeft = Number(fromBox.marginLeft) || 0;
    const endMarginLeft = Number(toBox.marginLeft) || 0;
    const hideOnFinish = endWidth < 0.5;
    this.drawing.update({ currentVisible: true });
    current.style.setProperty('width', `${endWidth}px`);
    current.style.setProperty('margin-left', `${endMarginLeft}px`);
    const unchanged = Math.abs(startWidth - endWidth) < 0.5 && Math.abs(startMarginLeft - endMarginLeft) < 0.5;
    if (this.layout.shouldReduceMotion() || typeof current.animate !== 'function' || unchanged) {
      this.finishCurrentResize(hideOnFinish);
      return;
    }
    const animation = current.animate([
      { marginLeft: `${startMarginLeft}px`, width: `${startWidth}px` },
      { marginLeft: `${endMarginLeft}px`, width: `${endWidth}px` }
    ], { duration: RESIZE_DURATION, easing: RESIZE_EASING });
    this.currentAnimation = animation;
    setStyle(current, 'will-change', 'width');
    animation.onfinish = () => {
      if (this.currentAnimation === animation && revision === this.revision) {
        this.currentAnimation = null;
        this.finishCurrentResize(hideOnFinish);
      }
    };
    animation.oncancel = () => {
      if (this.currentAnimation === animation) {
        this.currentAnimation = null;
      }
    };
  }
}

export type { ModeTagMotionParts, ModeTagResizeOptions };
export { ModeTagMotion };
