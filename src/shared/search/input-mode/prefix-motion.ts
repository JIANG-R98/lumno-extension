// Mode tag motion: the current label reveal, entering, resizing, and the
// rest state and menu-open state it settles into.
import type { ModeTagModel } from './mode-tag-model';
import type { IsElementVisible, SetStyle } from './types';
import type { PrefixCurrentVisualState } from './prefix-content';

// The controller state search-input-mode.ts shares with its modules.
interface PrefixMotionState {
  modeMenuOpen: boolean;
  inputModePrefixAnimation: Animation | null;
  inputModePrefixCurrentAnimation: Animation | null;
  // The frame and timer of a resize where the Web Animations API is missing.
  inputModePrefixAnimationFrame: number | null;
  inputModePrefixAnimationTimer: number;
  // The text a resize is on its way to.
  inputModePrefixPendingText: string;
  modeTag: ModeTagModel;
}

interface PrefixMotionDeps {
  siteSearchPrefixCurrent: HTMLElement;
  setStyle: SetStyle;
  shouldReduceInputModeMotion: () => boolean;
  updatePrefixLayout: () => void;
  DEFAULT_PREFIX_RESIZE_DURATION: number;
  DEFAULT_PREFIX_RESIZE_EASING: string;
  win: Pick<Window, 'requestAnimationFrame' | 'setTimeout'> & Partial<Pick<Window, 'cancelAnimationFrame' | 'clearTimeout'>>;
  siteSearchPrefix: HTMLElement;
  prefixTransition: string;
  DEFAULT_PREFIX_ENTER_DURATION: number;
  DEFAULT_PREFIX_ENTER_EASING: string;
  isElementVisible: IsElementVisible;
  getInputModePrefixCurrentVisualState: () => PrefixCurrentVisualState;
  DEFAULT_PREFIX_ITEM_GAP_PX: number;
  updateModeTag: (patch: Partial<ModeTagModel>) => void;
  inputModeState: PrefixMotionState;
}

interface PrefixResizeOptions {
  // Each gets the animation revision it ran under.
  onStart?(revision: number): void;
  onFinish?(revision: number): void;
  preservePendingText?: boolean;
}

interface PrefixMotionContext {
  readonly siteSearchPrefixCurrent: PrefixMotionDeps['siteSearchPrefixCurrent'];
  readonly setStyle: PrefixMotionDeps['setStyle'];
  readonly shouldReduceInputModeMotion: PrefixMotionDeps['shouldReduceInputModeMotion'];
  readonly updatePrefixLayout: PrefixMotionDeps['updatePrefixLayout'];
  readonly DEFAULT_PREFIX_RESIZE_DURATION: PrefixMotionDeps['DEFAULT_PREFIX_RESIZE_DURATION'];
  readonly DEFAULT_PREFIX_RESIZE_EASING: PrefixMotionDeps['DEFAULT_PREFIX_RESIZE_EASING'];
  readonly win: PrefixMotionDeps['win'];
  readonly siteSearchPrefix: PrefixMotionDeps['siteSearchPrefix'];
  readonly prefixTransition: PrefixMotionDeps['prefixTransition'];
  readonly DEFAULT_PREFIX_ENTER_DURATION: PrefixMotionDeps['DEFAULT_PREFIX_ENTER_DURATION'];
  readonly DEFAULT_PREFIX_ENTER_EASING: PrefixMotionDeps['DEFAULT_PREFIX_ENTER_EASING'];
  readonly isElementVisible: PrefixMotionDeps['isElementVisible'];
  readonly getInputModePrefixCurrentVisualState: PrefixMotionDeps['getInputModePrefixCurrentVisualState'];
  readonly DEFAULT_PREFIX_ITEM_GAP_PX: PrefixMotionDeps['DEFAULT_PREFIX_ITEM_GAP_PX'];
  readonly updateModeTag: PrefixMotionDeps['updateModeTag'];
  readonly inputModeState: PrefixMotionDeps['inputModeState'];
  inputModePrefixAnimationRevision: number;
}

function clearInputModePrefixCurrentAnimatedStyles(ctx: PrefixMotionContext): void {
  ctx.siteSearchPrefixCurrent.style.removeProperty('width');
  ctx.siteSearchPrefixCurrent.style.removeProperty('margin-left');
  ctx.setStyle(ctx.siteSearchPrefixCurrent, 'will-change', 'auto');
}

function cancelInputModePrefixCurrentAnimation(ctx: PrefixMotionContext): void {
  const animation = ctx.inputModeState.inputModePrefixCurrentAnimation;
  ctx.inputModeState.inputModePrefixCurrentAnimation = null;
  if (animation) {
    animation.cancel();
  }
  clearInputModePrefixCurrentAnimatedStyles(ctx);
}

function playInputModePrefixCurrentResizeAnimation(
  ctx: PrefixMotionContext,
  fromState: PrefixCurrentVisualState,
  toState: PrefixCurrentVisualState
): void {
  cancelInputModePrefixCurrentAnimation(ctx);
  const animationRevision = ctx.inputModePrefixAnimationRevision;
  const startWidth = Math.max(0, Number(fromState && fromState.width) || 0);
  const endWidth = Math.max(0, Number(toState && toState.width) || 0);
  const startMarginLeft = Number(fromState && fromState.marginLeft) || 0;
  const endMarginLeft = Number(toState && toState.marginLeft) || 0;
  const shouldHideOnFinish = endWidth < 0.5;
  setInputModePrefixCurrentVisible(ctx, true);
  ctx.siteSearchPrefixCurrent.style.setProperty('width', `${endWidth}px`);
  ctx.siteSearchPrefixCurrent.style.setProperty('margin-left', `${endMarginLeft}px`);
  if (ctx.shouldReduceInputModeMotion() ||
      typeof ctx.siteSearchPrefixCurrent.animate !== 'function' ||
      (Math.abs(startWidth - endWidth) < 0.5 &&
        Math.abs(startMarginLeft - endMarginLeft) < 0.5)) {
    if (shouldHideOnFinish) {
      setInputModePrefixCurrentVisible(ctx, false);
    }
    clearInputModePrefixCurrentAnimatedStyles(ctx);
    ctx.updatePrefixLayout();
    return;
  }
  const animation = ctx.siteSearchPrefixCurrent.animate([
    {
      marginLeft: `${startMarginLeft}px`,
      width: `${startWidth}px`
    },
    {
      marginLeft: `${endMarginLeft}px`,
      width: `${endWidth}px`
    }
  ], {
    duration: ctx.DEFAULT_PREFIX_RESIZE_DURATION,
    easing: ctx.DEFAULT_PREFIX_RESIZE_EASING
  });
  ctx.inputModeState.inputModePrefixCurrentAnimation = animation;
  ctx.setStyle(ctx.siteSearchPrefixCurrent, 'will-change', 'width');
  const finish = (): void => {
    if (ctx.inputModeState.inputModePrefixCurrentAnimation !== animation ||
        animationRevision !== ctx.inputModePrefixAnimationRevision) {
      return;
    }
    ctx.inputModeState.inputModePrefixCurrentAnimation = null;
    if (shouldHideOnFinish) {
      setInputModePrefixCurrentVisible(ctx, false);
    }
    clearInputModePrefixCurrentAnimatedStyles(ctx);
    ctx.updatePrefixLayout();
  };
  animation.onfinish = finish;
  animation.oncancel = () => {
    if (ctx.inputModeState.inputModePrefixCurrentAnimation === animation) {
      ctx.inputModeState.inputModePrefixCurrentAnimation = null;
    }
  };
}

function cancelInputModePrefixAnimation(ctx: PrefixMotionContext, cancelOptions?: { preservePendingText?: boolean }): void {
  ctx.inputModePrefixAnimationRevision += 1;
  if (!cancelOptions || cancelOptions.preservePendingText !== true) {
    ctx.inputModeState.inputModePrefixPendingText = '';
  }
  cancelInputModePrefixCurrentAnimation(ctx);
  if (ctx.inputModeState.inputModePrefixAnimation) {
    const animation = ctx.inputModeState.inputModePrefixAnimation;
    ctx.inputModeState.inputModePrefixAnimation = null;
    animation.cancel();
  }
  if (ctx.inputModeState.inputModePrefixAnimationFrame !== null && ctx.win && typeof ctx.win.cancelAnimationFrame === 'function') {
    ctx.win.cancelAnimationFrame(ctx.inputModeState.inputModePrefixAnimationFrame);
    ctx.inputModeState.inputModePrefixAnimationFrame = null;
  }
  if (ctx.inputModeState.inputModePrefixAnimationTimer && ctx.win && typeof ctx.win.clearTimeout === 'function') {
    ctx.win.clearTimeout(ctx.inputModeState.inputModePrefixAnimationTimer);
    ctx.inputModeState.inputModePrefixAnimationTimer = 0;
  }
  ctx.siteSearchPrefix.style.removeProperty('width');
}

function restoreInputModePrefixAnimatedState(ctx: PrefixMotionContext): void {
  ctx.siteSearchPrefix.style.removeProperty('width');
  ctx.setStyle(ctx.siteSearchPrefix, 'opacity', '1');
  ctx.setStyle(ctx.siteSearchPrefix, 'transform', 'translateY(-50%) translateX(0) scaleX(1)');
  ctx.setStyle(ctx.siteSearchPrefix, 'transition', ctx.prefixTransition);
  ctx.setStyle(ctx.siteSearchPrefix, 'will-change', 'auto');
}

function setInputModePrefixRestState(ctx: PrefixMotionContext, restOptions?: { transition?: boolean }): void {
  cancelInputModePrefixAnimation(ctx);
  const transitionEnabled = !restOptions || restOptions.transition !== false;
  ctx.setStyle(ctx.siteSearchPrefix, 'opacity', '1');
  ctx.setStyle(ctx.siteSearchPrefix, 'transform', 'translateY(-50%) translateX(0) scaleX(1)');
  ctx.setStyle(ctx.siteSearchPrefix, 'transition', transitionEnabled ? ctx.prefixTransition : 'none');
  ctx.setStyle(ctx.siteSearchPrefix, 'will-change', 'auto');
}

function playInputModePrefixEnterAnimation(ctx: PrefixMotionContext): void {
  cancelInputModePrefixAnimation(ctx);
  const animationRevision = ctx.inputModePrefixAnimationRevision;
  ctx.siteSearchPrefix.style.setProperty('opacity', '1');
  ctx.siteSearchPrefix.style.setProperty(
    'transform',
    'translateY(-50%) translateX(0) scaleX(1)'
  );
  ctx.setStyle(ctx.siteSearchPrefix, 'transition', ctx.prefixTransition);
  if (ctx.shouldReduceInputModeMotion() || typeof ctx.siteSearchPrefix.animate !== 'function') {
    ctx.setStyle(ctx.siteSearchPrefix, 'will-change', 'auto');
    return;
  }
  const animation = ctx.siteSearchPrefix.animate([
    {
      opacity: 0.4,
      transform: 'translateY(-50%) translateX(-4px) scaleX(0.92)'
    },
    {
      opacity: 1,
      transform: 'translateY(-50%) translateX(0) scaleX(1)'
    }
  ], {
    duration: ctx.DEFAULT_PREFIX_ENTER_DURATION,
    easing: ctx.DEFAULT_PREFIX_ENTER_EASING
  });
  ctx.inputModeState.inputModePrefixAnimation = animation;
  ctx.setStyle(ctx.siteSearchPrefix, 'will-change', 'opacity, transform');
  animation.onfinish = () => {
    if (ctx.inputModeState.inputModePrefixAnimation !== animation ||
        animationRevision !== ctx.inputModePrefixAnimationRevision) {
      return;
    }
    ctx.inputModeState.inputModePrefixAnimation = null;
    restoreInputModePrefixAnimatedState(ctx);
  };
  animation.oncancel = () => {
    if (ctx.inputModeState.inputModePrefixAnimation === animation) {
      ctx.inputModeState.inputModePrefixAnimation = null;
    }
  };
}

function playInputModePrefixResizeAnimation(
  ctx: PrefixMotionContext,
  fromWidth: number,
  toWidth: number,
  resizeOptions?: PrefixResizeOptions | null
): void {
  const options: PrefixResizeOptions = resizeOptions || {};
  const onStart = typeof options.onStart === 'function'
    ? options.onStart
    : null;
  const onFinish = typeof options.onFinish === 'function'
    ? options.onFinish
    : null;
  cancelInputModePrefixAnimation(ctx, {
    preservePendingText: options.preservePendingText === true
  });
  const animationRevision = ctx.inputModePrefixAnimationRevision;
  const startWidth = Math.max(0, Number(fromWidth) || 0);
  const endWidth = Math.max(0, Number(toWidth) || 0);
  if (onStart) {
    onStart(animationRevision);
  }
  if (ctx.shouldReduceInputModeMotion() || startWidth <= 0 || endWidth <= 0 ||
      Math.abs(startWidth - endWidth) < 1) {
    if (onFinish) {
      onFinish(animationRevision);
    }
    if (animationRevision === ctx.inputModePrefixAnimationRevision) {
      restoreInputModePrefixAnimatedState(ctx);
    }
    return;
  }
  const keyframes = [
    { width: `${startWidth}px` },
    { width: `${endWidth}px` }
  ];
  ctx.setStyle(ctx.siteSearchPrefix, 'will-change', 'width');
  if (typeof ctx.siteSearchPrefix.animate === 'function') {
    const animation = ctx.siteSearchPrefix.animate(keyframes, {
      duration: ctx.DEFAULT_PREFIX_RESIZE_DURATION,
      easing: ctx.DEFAULT_PREFIX_RESIZE_EASING
    });
    ctx.inputModeState.inputModePrefixAnimation = animation;
    animation.onfinish = () => {
      if (ctx.inputModeState.inputModePrefixAnimation !== animation) {
        return;
      }
      ctx.inputModeState.inputModePrefixAnimation = null;
      ctx.setStyle(ctx.siteSearchPrefix, 'width', `${endWidth}px`);
      if (onFinish) {
        onFinish(animationRevision);
      }
      if (animationRevision !== ctx.inputModePrefixAnimationRevision) {
        return;
      }
      restoreInputModePrefixAnimatedState(ctx);
    };
    animation.oncancel = () => {
      if (ctx.inputModeState.inputModePrefixAnimation === animation) {
        ctx.inputModeState.inputModePrefixAnimation = null;
      }
    };
    return;
  }
  ctx.setStyle(ctx.siteSearchPrefix, 'transition', ctx.prefixTransition);
  ctx.setStyle(ctx.siteSearchPrefix, 'width', `${startWidth}px`);
  ctx.inputModeState.inputModePrefixAnimationFrame = ctx.win.requestAnimationFrame(() => {
    ctx.inputModeState.inputModePrefixAnimationFrame = null;
    ctx.setStyle(
      ctx.siteSearchPrefix,
      'transition',
      `width ${ctx.DEFAULT_PREFIX_RESIZE_DURATION}ms ${ctx.DEFAULT_PREFIX_RESIZE_EASING}, ${ctx.prefixTransition}`
    );
    ctx.setStyle(ctx.siteSearchPrefix, 'width', `${endWidth}px`);
    ctx.inputModeState.inputModePrefixAnimationTimer = ctx.win.setTimeout(() => {
      ctx.inputModeState.inputModePrefixAnimationTimer = 0;
      if (animationRevision !== ctx.inputModePrefixAnimationRevision) {
        return;
      }
      if (onFinish) {
        onFinish(animationRevision);
      }
      if (animationRevision !== ctx.inputModePrefixAnimationRevision) {
        return;
      }
      restoreInputModePrefixAnimatedState(ctx);
    }, ctx.DEFAULT_PREFIX_RESIZE_DURATION + 10);
  });
}

function setInputModePrefixCurrentVisible(ctx: PrefixMotionContext, visible: boolean): void {
  ctx.updateModeTag({ currentVisible: Boolean(visible) });
}

// Lays the "current" label out, hidden or not, so it can be measured.
function setInputModePrefixCurrentMeasuring(ctx: PrefixMotionContext, measuring: boolean): void {
  ctx.updateModeTag({ currentMeasuring: Boolean(measuring) });
}

function settleInputModePrefixMenuVisualState(ctx: PrefixMotionContext): void {
  const currentVisible = ctx.inputModeState.modeMenuOpen;
  setInputModePrefixCurrentMeasuring(ctx, false);
  setInputModePrefixCurrentVisible(ctx, currentVisible);
  clearInputModePrefixCurrentAnimatedStyles(ctx);
}

// Reveals the "current" label beside the prefix while the menu is open.
function setInputModePrefixMenuOpen(ctx: PrefixMotionContext, open: boolean): void {
  const nextOpen = Boolean(open);
  const wasOpen = ctx.inputModeState.modeTag.menuOpen;
  if (wasOpen === nextOpen) {
    if (!nextOpen) {
      setInputModePrefixCurrentVisible(ctx, false);
    }
    return;
  }
  const shouldAnimate = ctx.isElementVisible(ctx.siteSearchPrefix);
  const previousCurrentState = shouldAnimate
    ? ctx.getInputModePrefixCurrentVisualState()
    : { marginLeft: 0, width: 0 };
  if (shouldAnimate) {
    cancelInputModePrefixAnimation(ctx);
  }
  ctx.updateModeTag({ menuOpen: nextOpen });
  setInputModePrefixCurrentMeasuring(ctx, nextOpen);
  const nextCurrentState: PrefixCurrentVisualState = nextOpen
    ? ctx.getInputModePrefixCurrentVisualState()
    : {
      marginLeft: -ctx.DEFAULT_PREFIX_ITEM_GAP_PX,
      width: 0
    };
  setInputModePrefixCurrentMeasuring(ctx, false);
  if (shouldAnimate) {
    if (nextOpen && previousCurrentState.width < 0.5) {
      previousCurrentState.marginLeft = -ctx.DEFAULT_PREFIX_ITEM_GAP_PX;
    }
    playInputModePrefixCurrentResizeAnimation(ctx, 
      previousCurrentState,
      nextCurrentState
    );
  } else if (nextOpen) {
    setInputModePrefixCurrentVisible(ctx, true);
    ctx.updatePrefixLayout();
  } else {
    setInputModePrefixCurrentVisible(ctx, false);
    ctx.updatePrefixLayout();
  }
}

function createPrefixMotion(deps: PrefixMotionDeps) {
  const {
    siteSearchPrefixCurrent,
    setStyle,
    shouldReduceInputModeMotion,
    updatePrefixLayout,
    DEFAULT_PREFIX_RESIZE_DURATION,
    DEFAULT_PREFIX_RESIZE_EASING,
    win,
    siteSearchPrefix,
    prefixTransition,
    DEFAULT_PREFIX_ENTER_DURATION,
    DEFAULT_PREFIX_ENTER_EASING,
    isElementVisible,
    getInputModePrefixCurrentVisualState,
    DEFAULT_PREFIX_ITEM_GAP_PX,
    updateModeTag
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;
  const ctx: PrefixMotionContext = {
    siteSearchPrefixCurrent,
    setStyle,
    shouldReduceInputModeMotion,
    updatePrefixLayout,
    DEFAULT_PREFIX_RESIZE_DURATION,
    DEFAULT_PREFIX_RESIZE_EASING,
    win,
    siteSearchPrefix,
    prefixTransition,
    DEFAULT_PREFIX_ENTER_DURATION,
    DEFAULT_PREFIX_ENTER_EASING,
    isElementVisible,
    getInputModePrefixCurrentVisualState,
    DEFAULT_PREFIX_ITEM_GAP_PX,
    updateModeTag,
    inputModeState,
    inputModePrefixAnimationRevision: 0
  };

  return {
    cancelInputModePrefixAnimation: (cancelOptions?: { preservePendingText?: boolean }) => cancelInputModePrefixAnimation(ctx, cancelOptions),
    setInputModePrefixRestState: (restOptions?: { transition?: boolean }) => setInputModePrefixRestState(ctx, restOptions),
    playInputModePrefixEnterAnimation: () => playInputModePrefixEnterAnimation(ctx),
    playInputModePrefixResizeAnimation: (fromWidth: number, toWidth: number, resizeOptions?: PrefixResizeOptions | null) => playInputModePrefixResizeAnimation(ctx, fromWidth, toWidth, resizeOptions),
    settleInputModePrefixMenuVisualState: () => settleInputModePrefixMenuVisualState(ctx),
    setInputModePrefixMenuOpen: (open: boolean) => setInputModePrefixMenuOpen(ctx, open)
  };
}

type PrefixMotionApi = ReturnType<typeof createPrefixMotion>;

export { createPrefixMotion };
export type { PrefixMotionApi, PrefixMotionDeps, PrefixMotionState, PrefixResizeOptions };
