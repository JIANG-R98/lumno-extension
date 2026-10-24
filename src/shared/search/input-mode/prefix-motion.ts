// @ts-nocheck
// Mode prefix motion: the current label reveal, entering, resizing, and
// the rest state and menu-open state it settles into.
function createPrefixMotion(deps) {
  const {
    siteSearchPrefixCurrent,
    setStyle,
    useImportantStyles,
    shouldReduceInputModeMotion,
    updatePrefixLayout,
    DEFAULT_PREFIX_RESIZE_DURATION,
    DEFAULT_PREFIX_RESIZE_EASING,
    win,
    siteSearchPrefix,
    prefixTransition,
    DEFAULT_PREFIX_ENTER_DURATION,
    DEFAULT_PREFIX_ENTER_EASING,
    modeMenu,
    isElementVisible,
    getInputModePrefixCurrentVisualState,
    DEFAULT_PREFIX_ITEM_GAP_PX
  } = deps;

  // The controller state object shared with search-input-mode.js and the other modules.
  const inputModeState = deps.inputModeState;

  let inputModePrefixAnimationRevision = 0;

  function clearInputModePrefixCurrentAnimatedStyles() {
    if (siteSearchPrefixCurrent && siteSearchPrefixCurrent.style &&
        typeof siteSearchPrefixCurrent.style.removeProperty === 'function') {
      siteSearchPrefixCurrent.style.removeProperty('width');
      siteSearchPrefixCurrent.style.removeProperty('margin-left');
    }
    setStyle(siteSearchPrefixCurrent, 'will-change', 'auto', useImportantStyles);
  }

  function cancelInputModePrefixCurrentAnimation() {
    const animation = inputModeState.inputModePrefixCurrentAnimation;
    inputModeState.inputModePrefixCurrentAnimation = null;
    if (animation && typeof animation.cancel === 'function') {
      animation.cancel();
    }
    clearInputModePrefixCurrentAnimatedStyles();
  }

  function playInputModePrefixCurrentResizeAnimation(fromState, toState) {
    cancelInputModePrefixCurrentAnimation();
    const animationRevision = inputModePrefixAnimationRevision;
    const startWidth = Math.max(0, Number(fromState && fromState.width) || 0);
    const endWidth = Math.max(0, Number(toState && toState.width) || 0);
    const startMarginLeft = Number(fromState && fromState.marginLeft) || 0;
    const endMarginLeft = Number(toState && toState.marginLeft) || 0;
    const shouldHideOnFinish = endWidth < 0.5;
    setInputModePrefixCurrentVisible(true);
    siteSearchPrefixCurrent.style.setProperty('width', `${endWidth}px`);
    siteSearchPrefixCurrent.style.setProperty('margin-left', `${endMarginLeft}px`);
    if (shouldReduceInputModeMotion() ||
        typeof siteSearchPrefixCurrent.animate !== 'function' ||
        (Math.abs(startWidth - endWidth) < 0.5 &&
          Math.abs(startMarginLeft - endMarginLeft) < 0.5)) {
      if (shouldHideOnFinish) {
        setInputModePrefixCurrentVisible(false);
      }
      clearInputModePrefixCurrentAnimatedStyles();
      updatePrefixLayout();
      return;
    }
    const animation = siteSearchPrefixCurrent.animate([
      {
        marginLeft: `${startMarginLeft}px`,
        width: `${startWidth}px`
      },
      {
        marginLeft: `${endMarginLeft}px`,
        width: `${endWidth}px`
      }
    ], {
      duration: DEFAULT_PREFIX_RESIZE_DURATION,
      easing: DEFAULT_PREFIX_RESIZE_EASING
    });
    inputModeState.inputModePrefixCurrentAnimation = animation;
    setStyle(siteSearchPrefixCurrent, 'will-change', 'width', useImportantStyles);
    const finish = () => {
      if (inputModeState.inputModePrefixCurrentAnimation !== animation ||
          animationRevision !== inputModePrefixAnimationRevision) {
        return;
      }
      inputModeState.inputModePrefixCurrentAnimation = null;
      if (shouldHideOnFinish) {
        setInputModePrefixCurrentVisible(false);
      }
      clearInputModePrefixCurrentAnimatedStyles();
      updatePrefixLayout();
    };
    animation.onfinish = finish;
    animation.oncancel = () => {
      if (inputModeState.inputModePrefixCurrentAnimation === animation) {
        inputModeState.inputModePrefixCurrentAnimation = null;
      }
    };
  }

  function cancelInputModePrefixAnimation(cancelOptions) {
    inputModePrefixAnimationRevision += 1;
    if (!cancelOptions || cancelOptions.preservePendingText !== true) {
      inputModeState.inputModePrefixPendingText = '';
    }
    cancelInputModePrefixCurrentAnimation();
    if (inputModeState.inputModePrefixAnimation) {
      const animation = inputModeState.inputModePrefixAnimation;
      inputModeState.inputModePrefixAnimation = null;
      if (typeof animation.cancel === 'function') {
        animation.cancel();
      }
    }
    if (inputModeState.inputModePrefixAnimationFrame !== null && win && typeof win.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(inputModeState.inputModePrefixAnimationFrame);
      inputModeState.inputModePrefixAnimationFrame = null;
    }
    if (inputModeState.inputModePrefixAnimationTimer && win && typeof win.clearTimeout === 'function') {
      win.clearTimeout(inputModeState.inputModePrefixAnimationTimer);
      inputModeState.inputModePrefixAnimationTimer = 0;
    }
    if (siteSearchPrefix && siteSearchPrefix.style) {
      if (typeof siteSearchPrefix.style.removeProperty === 'function') {
        siteSearchPrefix.style.removeProperty('width');
      } else {
        siteSearchPrefix.style.width = '';
      }
    }
  }

  function restoreInputModePrefixAnimatedState() {
    if (siteSearchPrefix && siteSearchPrefix.style) {
      if (typeof siteSearchPrefix.style.removeProperty === 'function') {
        siteSearchPrefix.style.removeProperty('width');
      } else {
        siteSearchPrefix.style.width = '';
      }
    }
    setStyle(siteSearchPrefix, 'opacity', '1', useImportantStyles);
    setStyle(siteSearchPrefix, 'transform', 'translateY(-50%) translateX(0) scaleX(1)', useImportantStyles);
    setStyle(siteSearchPrefix, 'transition', prefixTransition, useImportantStyles);
    setStyle(siteSearchPrefix, 'will-change', 'auto', useImportantStyles);
  }

  function setInputModePrefixRestState(restOptions) {
    cancelInputModePrefixAnimation();
    const transitionEnabled = !restOptions || restOptions.transition !== false;
    setStyle(siteSearchPrefix, 'opacity', '1', useImportantStyles);
    setStyle(siteSearchPrefix, 'transform', 'translateY(-50%) translateX(0) scaleX(1)', useImportantStyles);
    setStyle(siteSearchPrefix, 'transition', transitionEnabled ? prefixTransition : 'none', useImportantStyles);
    setStyle(siteSearchPrefix, 'will-change', 'auto', useImportantStyles);
  }

  function playInputModePrefixEnterAnimation() {
    cancelInputModePrefixAnimation();
    const animationRevision = inputModePrefixAnimationRevision;
    siteSearchPrefix.style.setProperty('opacity', '1');
    siteSearchPrefix.style.setProperty(
      'transform',
      'translateY(-50%) translateX(0) scaleX(1)'
    );
    setStyle(siteSearchPrefix, 'transition', prefixTransition, useImportantStyles);
    if (shouldReduceInputModeMotion() || typeof siteSearchPrefix.animate !== 'function') {
      setStyle(siteSearchPrefix, 'will-change', 'auto', useImportantStyles);
      return;
    }
    const animation = siteSearchPrefix.animate([
      {
        opacity: 0.4,
        transform: 'translateY(-50%) translateX(-4px) scaleX(0.92)'
      },
      {
        opacity: 1,
        transform: 'translateY(-50%) translateX(0) scaleX(1)'
      }
    ], {
      duration: DEFAULT_PREFIX_ENTER_DURATION,
      easing: DEFAULT_PREFIX_ENTER_EASING
    });
    inputModeState.inputModePrefixAnimation = animation;
    setStyle(siteSearchPrefix, 'will-change', 'opacity, transform', useImportantStyles);
    animation.onfinish = () => {
      if (inputModeState.inputModePrefixAnimation !== animation ||
          animationRevision !== inputModePrefixAnimationRevision) {
        return;
      }
      inputModeState.inputModePrefixAnimation = null;
      restoreInputModePrefixAnimatedState();
    };
    animation.oncancel = () => {
      if (inputModeState.inputModePrefixAnimation === animation) {
        inputModeState.inputModePrefixAnimation = null;
      }
    };
  }

  function playInputModePrefixResizeAnimation(fromWidth, toWidth, resizeOptions) {
    const options = resizeOptions || {};
    const onStart = typeof options.onStart === 'function'
      ? options.onStart
      : null;
    const onFinish = typeof options.onFinish === 'function'
      ? options.onFinish
      : null;
    cancelInputModePrefixAnimation({
      preservePendingText: options.preservePendingText === true
    });
    const animationRevision = inputModePrefixAnimationRevision;
    const startWidth = Math.max(0, Number(fromWidth) || 0);
    const endWidth = Math.max(0, Number(toWidth) || 0);
    if (onStart) {
      onStart(animationRevision);
    }
    if (shouldReduceInputModeMotion() || startWidth <= 0 || endWidth <= 0 ||
        Math.abs(startWidth - endWidth) < 1) {
      if (onFinish) {
        onFinish(animationRevision);
      }
      if (animationRevision === inputModePrefixAnimationRevision) {
        restoreInputModePrefixAnimatedState();
      }
      return;
    }
    const keyframes = [
      { width: `${startWidth}px` },
      { width: `${endWidth}px` }
    ];
    setStyle(siteSearchPrefix, 'will-change', 'width', useImportantStyles);
    if (typeof siteSearchPrefix.animate === 'function') {
      const animation = siteSearchPrefix.animate(keyframes, {
        duration: DEFAULT_PREFIX_RESIZE_DURATION,
        easing: DEFAULT_PREFIX_RESIZE_EASING
      });
      inputModeState.inputModePrefixAnimation = animation;
      animation.onfinish = () => {
        if (inputModeState.inputModePrefixAnimation !== animation) {
          return;
        }
        inputModeState.inputModePrefixAnimation = null;
        setStyle(siteSearchPrefix, 'width', `${endWidth}px`, useImportantStyles);
        if (onFinish) {
          onFinish(animationRevision);
        }
        if (animationRevision !== inputModePrefixAnimationRevision) {
          return;
        }
        restoreInputModePrefixAnimatedState();
      };
      animation.oncancel = () => {
        if (inputModeState.inputModePrefixAnimation === animation) {
          inputModeState.inputModePrefixAnimation = null;
        }
      };
      return;
    }
    setStyle(siteSearchPrefix, 'transition', prefixTransition, useImportantStyles);
    setStyle(siteSearchPrefix, 'width', `${startWidth}px`, useImportantStyles);
    inputModeState.inputModePrefixAnimationFrame = win.requestAnimationFrame(() => {
      inputModeState.inputModePrefixAnimationFrame = null;
      setStyle(
        siteSearchPrefix,
        'transition',
        `width ${DEFAULT_PREFIX_RESIZE_DURATION}ms ${DEFAULT_PREFIX_RESIZE_EASING}, ${prefixTransition}`,
        useImportantStyles
      );
      setStyle(siteSearchPrefix, 'width', `${endWidth}px`, useImportantStyles);
      inputModeState.inputModePrefixAnimationTimer = win.setTimeout(() => {
        inputModeState.inputModePrefixAnimationTimer = 0;
        if (animationRevision !== inputModePrefixAnimationRevision) {
          return;
        }
        if (onFinish) {
          onFinish(animationRevision);
        }
        if (animationRevision !== inputModePrefixAnimationRevision) {
          return;
        }
        restoreInputModePrefixAnimatedState();
      }, DEFAULT_PREFIX_RESIZE_DURATION + 10);
    });
  }

  function setInputModePrefixCurrentVisible(visible) {
    const nextVisible = Boolean(visible);
    siteSearchPrefix.setAttribute(
      'data-current-visible',
      nextVisible ? 'true' : 'false'
    );
    const measuring = siteSearchPrefix.getAttribute(
      'data-current-measuring'
    ) === 'true';
    setStyle(
      siteSearchPrefixCurrent,
      'display',
      nextVisible || measuring ? 'inline-flex' : 'none',
      useImportantStyles
    );
  }

  function setInputModePrefixCurrentMeasuring(measuring) {
    const nextMeasuring = Boolean(measuring);
    siteSearchPrefix.setAttribute(
      'data-current-measuring',
      nextMeasuring ? 'true' : 'false'
    );
    const visible = siteSearchPrefix.getAttribute(
      'data-current-visible'
    ) === 'true';
    setStyle(
      siteSearchPrefixCurrent,
      'display',
      nextMeasuring || visible ? 'inline-flex' : 'none',
      useImportantStyles
    );
  }

  function settleInputModePrefixMenuVisualState() {
    const currentVisible = Boolean(inputModeState.modeMenuOpen && !modeMenu.hidden);
    setInputModePrefixCurrentMeasuring(false);
    setInputModePrefixCurrentVisible(currentVisible);
    clearInputModePrefixCurrentAnimatedStyles();
  }

  function setInputModePrefixMenuOpen(open) {
    const nextOpen = Boolean(open);
    const wasOpen = siteSearchPrefix.getAttribute('data-menu-open') === 'true';
    if (wasOpen === nextOpen) {
      if (!nextOpen) {
        setInputModePrefixCurrentVisible(false);
      }
      return;
    }
    const shouldAnimate = isElementVisible(siteSearchPrefix);
    const previousCurrentState = shouldAnimate
      ? getInputModePrefixCurrentVisualState()
      : { marginLeft: 0, width: 0 };
    if (shouldAnimate) {
      cancelInputModePrefixAnimation();
    }
    siteSearchPrefix.setAttribute('data-menu-open', nextOpen ? 'true' : 'false');
    setInputModePrefixCurrentMeasuring(nextOpen);
    const nextCurrentState = nextOpen
      ? getInputModePrefixCurrentVisualState()
      : {
        marginLeft: -DEFAULT_PREFIX_ITEM_GAP_PX,
        width: 0
      };
    setInputModePrefixCurrentMeasuring(false);
    if (shouldAnimate) {
      if (nextOpen && previousCurrentState.width < 0.5) {
        previousCurrentState.marginLeft = -DEFAULT_PREFIX_ITEM_GAP_PX;
      }
      playInputModePrefixCurrentResizeAnimation(
        previousCurrentState,
        nextCurrentState
      );
    } else if (nextOpen) {
      setInputModePrefixCurrentVisible(true);
      updatePrefixLayout();
    } else {
      setInputModePrefixCurrentVisible(false);
      updatePrefixLayout();
    }
  }

  return {
    cancelInputModePrefixAnimation,
    setInputModePrefixRestState,
    playInputModePrefixEnterAnimation,
    playInputModePrefixResizeAnimation,
    settleInputModePrefixMenuVisualState,
    setInputModePrefixMenuOpen
  };
}

export { createPrefixMotion };
