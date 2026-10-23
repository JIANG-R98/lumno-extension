// Placing the mode menu: its offset below results, fitting it in the
// viewport, and the frames that reveal and conceal it.
function createModeMenuLayout(deps) {
  const {
    setStyle,
    modeMenu,
    useImportantStyles,
    container,
    win,
    doc,
    DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET,
    config,
    menuSurface
  } = deps;

  // The controller state object shared with search-input-mode.js and the other modules.
  const inputModeState = deps.inputModeState;

  let modeMenuRevealFrame = 0;
  let modeMenuRevealFrameKind = '';

  function setModeMenuResultOffset(offset) {
    const numericOffset = Number(offset);
    const nextOffset = Number.isFinite(numericOffset)
      ? Math.max(0, numericOffset)
      : 0;
    setStyle(
      modeMenu,
      '--x-lumno-search-mode-menu-result-offset',
      `${nextOffset}px`,
      useImportantStyles
    );
  }

  function fitModeMenuWithinViewport(options) {
    const fitOptions = options || {};
    const viewportMaxHeightProperty =
      '--x-lumno-search-mode-menu-viewport-max-height';
    if (inputModeState.destroyed || modeMenu.hidden || !inputModeState.modeMenuOpen) {
      modeMenu.style.removeProperty(viewportMaxHeightProperty);
      return null;
    }
    const containerRect = container.getBoundingClientRect();
    const containerLayoutHeight = Math.max(
      0,
      Number(container.offsetHeight) || Number(containerRect.height) || 0
    );
    const renderedContainerHeight = Math.max(
      0,
      Number(containerRect.height) || containerLayoutHeight
    );
    const scaleY = containerLayoutHeight > 0
      ? renderedContainerHeight / containerLayoutHeight
      : 1;
    if (!Number.isFinite(scaleY) || scaleY <= 0) {
      return null;
    }
    const visualViewport = win && win.visualViewport;
    const configuredViewportBottom = Number(fitOptions.viewportBottom);
    const viewportBottom = Number.isFinite(configuredViewportBottom)
      ? configuredViewportBottom
      : (visualViewport && Number.isFinite(Number(visualViewport.height))
        ? Math.max(0, Number(visualViewport.offsetTop) || 0) +
          Math.max(0, Number(visualViewport.height) || 0)
        : Math.max(
          0,
          Number(win && win.innerHeight) ||
            Number(doc && doc.documentElement && doc.documentElement.clientHeight) ||
            0
        ));
    const configuredBottomInset = Number(fitOptions.bottomInset);
    const bottomInset = Number.isFinite(configuredBottomInset)
      ? Math.max(0, configuredBottomInset)
      : DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET;
    const menuGap = Math.max(
      0,
      (Number(modeMenu.offsetTop) || containerLayoutHeight) -
        containerLayoutHeight
    );
    const availableLayoutHeight = Math.max(
      0,
      ((viewportBottom - bottomInset - Number(containerRect.bottom || 0)) /
        scaleY) - menuGap
    );
    setStyle(
      modeMenu,
      viewportMaxHeightProperty,
      `${Math.floor(availableLayoutHeight)}px`,
      useImportantStyles
    );
    const menuLayoutHeight = Math.max(
      0,
      Number(modeMenu.offsetHeight) ||
        (Number(modeMenu.getBoundingClientRect().height) || 0) / scaleY
    );
    return Math.max(
      0,
      Math.floor(availableLayoutHeight - menuLayoutHeight)
    );
  }

  function notifyModeMenuLayoutChange() {
    if (typeof config.onModeMenuLayoutChange === 'function') {
      config.onModeMenuLayoutChange({
        menuElement: modeMenu,
        open: Boolean(inputModeState.modeMenuOpen && !modeMenu.hidden)
      });
    }
  }

  function requestModeMenuFrame(callback) {
    if (win && typeof win.requestAnimationFrame === 'function') {
      return win.requestAnimationFrame(callback);
    }
    if (win && typeof win.setTimeout === 'function') {
      return win.setTimeout(callback, 0);
    }
    callback();
    return 0;
  }

  function cancelModeMenuRevealFrame() {
    if (!modeMenuRevealFrame || !win) {
      modeMenuRevealFrame = 0;
      modeMenuRevealFrameKind = '';
      return;
    }
    if (modeMenuRevealFrameKind === 'animation' &&
        typeof win.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(modeMenuRevealFrame);
    } else if (modeMenuRevealFrameKind === 'timeout' &&
        typeof win.clearTimeout === 'function') {
      win.clearTimeout(modeMenuRevealFrame);
    }
    modeMenuRevealFrame = 0;
    modeMenuRevealFrameKind = '';
  }

  function requestModeMenuRevealFrame(callback) {
    cancelModeMenuRevealFrame();
    let completedSynchronously = false;
    const frame = requestModeMenuFrame(() => {
      completedSynchronously = true;
      modeMenuRevealFrame = 0;
      modeMenuRevealFrameKind = '';
      callback();
    });
    if (!completedSynchronously) {
      modeMenuRevealFrame = frame;
      modeMenuRevealFrameKind = win &&
        typeof win.requestAnimationFrame === 'function'
        ? 'animation'
        : 'timeout';
    }
    return frame;
  }

  function isModeMenuVisible() {
    return Boolean(!inputModeState.destroyed && inputModeState.modeMenuOpen && !modeMenu.hidden);
  }

  function revealModeMenuSurface() {
    const guardedFrame = (callback) => requestModeMenuRevealFrame(() => {
      if (inputModeState.modeMenuOpen && !modeMenu.hidden) {
        callback();
      }
    });
    if (typeof menuSurface.open === 'function') {
      menuSurface.open(modeMenu, { requestAnimationFrame: guardedFrame });
      return;
    }
    modeMenu.setAttribute('data-open', 'false');
    guardedFrame(() => modeMenu.setAttribute('data-open', 'true'));
  }

  function concealModeMenuSurface() {
    if (typeof menuSurface.close === 'function') {
      menuSurface.close(modeMenu);
      return;
    }
    modeMenu.setAttribute('data-open', 'false');
  }

  return {
    setModeMenuResultOffset,
    fitModeMenuWithinViewport,
    notifyModeMenuLayoutChange,
    cancelModeMenuRevealFrame,
    isModeMenuVisible,
    revealModeMenuSurface,
    concealModeMenuSurface
  };
}

export { createModeMenuLayout };
