// @ts-nocheck
// Appearance panel motion: resizing the panel between tabs, switching
// source tabs and edit modes, opening and closing it, and the appearance
// scope change animation.
function createPanelMotion(deps) {
  const {
    window,
    normalizeWallpaperSourceTab,
    renderWallpaperPanelState,
    WALLPAPER_SOURCE_TABS,
    loadCustomWallpapers,
    loadBingCatalog,
    getWallpaperSelectionIdForUi,
    getWallpaperById,
    REMOTE_CONTENT,
    showCuratedPageOfSelection,
    getWallpaperSourceTabForId,
    normalizeWallpaperMode,
    document,
    t,
    getThemeScope,
    getWallpaperAppearanceOptionButtons,
    getWallpaperAppearanceOptionMotionElement,
    getWallpaperPanelRefs,
    afterNextPaint,
    setThemeScope,
    getWallpaperAppearanceModeLabels
  } = deps;

  // The runtime state object shared with wallpaper.ts and the other modules.
  const wallpaperState = deps.wallpaperState;

  const WALLPAPER_PANEL_RESIZE_DURATION_MS = 260;
  const WALLPAPER_PANEL_RESIZE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  let wallpaperPanelResizing = false;
  let wallpaperPanelResizeTimer = null;
  let wallpaperPanelResizeCleanup = null;
  let wallpaperAppearanceAnimationTimers = [];
  let lastSyncedWallpaperSourceId = null;

  function cleanupWallpaperPanelResize() {
    if (wallpaperPanelResizeTimer !== null) {
      window.clearTimeout(wallpaperPanelResizeTimer);
      wallpaperPanelResizeTimer = null;
    }
    if (typeof wallpaperPanelResizeCleanup === 'function') {
      wallpaperPanelResizeCleanup();
      wallpaperPanelResizeCleanup = null;
    }
  }

  function measureWallpaperPanelOpenHeight() {
    if (!wallpaperState.wallpaperPanel) {
      return 0;
    }
    const previousHeight = wallpaperState.wallpaperPanel.style.height;
    const previousTransition = wallpaperState.wallpaperPanel.style.transition;
    wallpaperState.wallpaperPanel.style.transition = 'none';
    wallpaperState.wallpaperPanel.style.height = 'auto';
    const height = wallpaperState.wallpaperPanel.getBoundingClientRect().height;
    wallpaperState.wallpaperPanel.style.height = previousHeight;
    wallpaperState.wallpaperPanel.style.transition = previousTransition;
    return height;
  }

  function animateWallpaperPanelResize(mutate) {
    if (typeof mutate !== 'function') {
      return;
    }
    // A resize already in progress measures its own end height after this change.
    if (wallpaperPanelResizing) {
      mutate();
      return;
    }
    const canAnimate = wallpaperState.wallpaperPanel &&
      isWallpaperPanelOpen() &&
      !shouldReduceMotion();
    if (!canAnimate) {
      mutate();
      return;
    }

    cleanupWallpaperPanelResize();
    const startHeight = wallpaperState.wallpaperPanel.getBoundingClientRect().height;
    const previousHeight = wallpaperState.wallpaperPanel.style.height;
    const previousOverflow = wallpaperState.wallpaperPanel.style.overflow;
    const previousTransition = wallpaperState.wallpaperPanel.style.transition;
    const previousWillChange = wallpaperState.wallpaperPanel.style.willChange;

    wallpaperState.wallpaperPanel.style.height = `${startHeight}px`;
    wallpaperState.wallpaperPanel.style.overflow = 'hidden';
    wallpaperState.wallpaperPanel.style.willChange = 'height, transform, opacity, filter';
    wallpaperPanelResizing = true;
    try {
      mutate();
    } finally {
      wallpaperPanelResizing = false;
    }
    const endHeight = measureWallpaperPanelOpenHeight();

    const restorePanel = () => {
      wallpaperState.wallpaperPanel.style.height = previousHeight;
      wallpaperState.wallpaperPanel.style.overflow = previousOverflow;
      wallpaperState.wallpaperPanel.style.transition = previousTransition;
      wallpaperState.wallpaperPanel.style.willChange = previousWillChange;
      wallpaperState.wallpaperPanel.removeEventListener('transitionend', handleTransitionEnd);
      if (wallpaperPanelResizeTimer !== null) {
        window.clearTimeout(wallpaperPanelResizeTimer);
        wallpaperPanelResizeTimer = null;
      }
      wallpaperPanelResizeCleanup = null;
    };
    function handleTransitionEnd(event) {
      if (event && event.target === wallpaperState.wallpaperPanel && event.propertyName === 'height') {
        restorePanel();
      }
    }

    if (Math.abs(endHeight - startHeight) < 1) {
      restorePanel();
      return;
    }

    wallpaperPanelResizeCleanup = restorePanel;
    wallpaperState.wallpaperPanel.style.height = `${startHeight}px`;
    wallpaperState.wallpaperPanel.style.transition = `height ${WALLPAPER_PANEL_RESIZE_DURATION_MS}ms ${WALLPAPER_PANEL_RESIZE_EASING}`;
    void wallpaperState.wallpaperPanel.offsetHeight;
    wallpaperState.wallpaperPanel.addEventListener('transitionend', handleTransitionEnd);
    requestAnimationFrame(() => {
      if (!wallpaperPanelResizeCleanup) {
        return;
      }
      wallpaperState.wallpaperPanel.style.height = `${endHeight}px`;
    });
    wallpaperPanelResizeTimer = window.setTimeout(restorePanel, WALLPAPER_PANEL_RESIZE_DURATION_MS + 80);
  }

  function setWallpaperActiveTab(tab) {
    const nextTab = normalizeWallpaperSourceTab(tab);
    const previousTab = wallpaperState.activeWallpaperTab;
    if (previousTab !== nextTab) {
      wallpaperState.activeWallpaperTab = nextTab;
      if (nextTab === 'curated') showCuratedCategoryOfSelection();
      renderWallpaperPanelState();
      playWallpaperEnterMotion(
        getWallpaperGridForTab(nextTab),
        WALLPAPER_SOURCE_TABS.indexOf(nextTab) < WALLPAPER_SOURCE_TABS.indexOf(previousTab) ? 'enter-prev' : 'enter-next'
      );
    } else {
      renderWallpaperPanelState();
    }
    if (nextTab === 'local' && isWallpaperPanelOpen()) {
      loadCustomWallpapers();
    }
    if (nextTab === 'bing' && previousTab !== nextTab && isWallpaperPanelOpen()) loadBingCatalog();
  }
  function showCuratedCategoryOfSelection() {
    const selectedId = getWallpaperSelectionIdForUi();
    const selected = getWallpaperById(selectedId);
    // A daily choice keeps its own category, which may be the random mix.
    const category = selected && selected.provider === 'curated'
      ? (REMOTE_CONTENT.isDailyWallpaperId(selectedId) ? REMOTE_CONTENT.wallpaperFromId(selectedId).category : selected.category)
      : '';
    if (!category) {
      return;
    }
    wallpaperState.curatedCategory = category;
    showCuratedPageOfSelection();
  }
  // Follow the selection only when it moves, so storage reloads (deleting a
  // local wallpaper, syncs, theme changes) keep the tab the user is browsing.
  function syncWallpaperSourceTabToEditMode(options) {
    const selectedId = getWallpaperSelectionIdForUi();
    const force = Boolean(options && options.force);
    if (!force && selectedId === lastSyncedWallpaperSourceId) {
      return;
    }
    lastSyncedWallpaperSourceId = selectedId;
    if (selectedId) {
      setWallpaperActiveTab(getWallpaperSourceTabForId(selectedId));
    }
  }

  function setWallpaperActiveMode(mode) {
    wallpaperState.bingSelectionSeq += 1;
    const nextMode = normalizeWallpaperMode(mode);
    if (wallpaperState.activeWallpaperMode === nextMode) {
      renderWallpaperPanelState();
      return;
    }
    wallpaperState.activeWallpaperMode = nextMode;
    syncWallpaperSourceTabToEditMode({ force: true });
    renderWallpaperPanelState();
    playWallpaperEnterMotion(getWallpaperGridForTab(wallpaperState.activeWallpaperTab), 'enter');
  }

  function isWallpaperPanelOpen() {
    return wallpaperState.wallpaperPanelOpen;
  }
  function setWallpaperPanelOpenState(open) {
    if (!document.body) {
      return;
    }
    if (open) {
      document.body.setAttribute('data-wallpaper-panel-open', 'true');
      return;
    }
    document.body.removeAttribute('data-wallpaper-panel-open');
  }

  function getWallpaperAppearanceModeLabel(mode) {
    if (mode === 'light') {
      return t('settings_theme_light', 'Light');
    }
    if (mode === 'dark') {
      return t('settings_theme_dark', 'Dark');
    }
    if (getThemeScope() === 'home') {
      return t('newtab_theme_follow_global', 'Follow "Global"');
    }
    return t('settings_theme_system', 'Follow system');
  }

  function clearWallpaperAppearanceScopeAnimation() {
    wallpaperAppearanceAnimationTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    wallpaperAppearanceAnimationTimers = [];
    wallpaperState.heldAppearanceModeLabels = null;
    wallpaperState.pendingThemeScope = null;
    getWallpaperAppearanceOptionButtons().forEach((button) => {
      const motionElement = getWallpaperAppearanceOptionMotionElement(button);
      if (!motionElement) {
        return;
      }
      motionElement.style.removeProperty('transition');
      motionElement.style.removeProperty('transform');
      motionElement.style.removeProperty('opacity');
      motionElement.style.removeProperty('will-change');
    });
    const options = getWallpaperPanelRefs().appearanceOptions;
    if (options) {
      options.removeAttribute('data-scope-animating');
    }
  }
  function shouldReduceMotion() {
    return Boolean(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function playWallpaperEnterMotion(element, state) {
    if (!element) {
      return;
    }
    const nextState = state || 'enter';
    if (shouldReduceMotion()) {
      element.removeAttribute('data-motion');
      return;
    }
    element.setAttribute('data-motion', nextState);
    afterNextPaint(window, () => {
      if (element.getAttribute('data-motion') === nextState) {
        element.removeAttribute('data-motion');
      }
    });
  }
  function getWallpaperGridForTab(tab) {
    const refs = getWallpaperPanelRefs();
    if (tab === 'bing') return refs.bingPanel;
    if (tab === 'curated') return refs.curatedPanel;
    return tab === 'local' ? refs.localGrid : refs.builtInGrid;
  }
  function getAppearanceScopeDirection(scope) {
    return scope === 'home' ? 1 : -1;
  }

  function getAppearanceOptionDelay(index, count, direction) {
    const visualIndex = direction > 0 ? (count - 1 - index) : index;
    return Math.max(0, visualIndex * 20);
  }

  function animateWallpaperAppearanceScopeChange(previousScope, nextScope) {
    const targetScope = nextScope === 'home' ? 'home' : 'global';
    const sourceScope = previousScope === 'home' ? 'home' : 'global';
    const buttons = getWallpaperAppearanceOptionButtons();
    clearWallpaperAppearanceScopeAnimation();
    if (!buttons.length || sourceScope === targetScope || shouldReduceMotion()) {
      setThemeScope(targetScope);
      renderWallpaperPanelState();
      return;
    }
    const direction = getAppearanceScopeDirection(targetScope);
    const offsetPx = 24;
    const durationMs = 220;
    const fadeDurationMs = 140;
    const handoffOverlapMs = 70;
    const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const options = getWallpaperPanelRefs().appearanceOptions;
    // The tabs move to the new scope at once; the options keep their labels until they swap.
    wallpaperState.heldAppearanceModeLabels = getWallpaperAppearanceModeLabels();
    wallpaperState.pendingThemeScope = targetScope;
    if (options) {
      options.setAttribute('data-scope-animating', 'true');
    }
    renderWallpaperPanelState();

    let maxOutDelay = 0;
    buttons.forEach((button, index) => {
      const motionElement = getWallpaperAppearanceOptionMotionElement(button);
      if (!motionElement) {
        return;
      }
      const delay = getAppearanceOptionDelay(index, buttons.length, direction);
      maxOutDelay = Math.max(maxOutDelay, delay);
      motionElement.style.setProperty('will-change', 'transform, opacity');
      motionElement.style.setProperty(
        'transition',
        `transform ${durationMs}ms ${easing} ${delay}ms, opacity ${fadeDurationMs}ms ${easing} ${delay}ms`
      );
      motionElement.style.setProperty('opacity', '0');
      motionElement.style.setProperty('transform', `translate3d(${direction * -offsetPx}px, 0, 0)`);
    });

    const handoffDelayMs = Math.max(0, durationMs + maxOutDelay - handoffOverlapMs);
    const handoffTimer = window.setTimeout(() => {
      wallpaperAppearanceAnimationTimers = wallpaperAppearanceAnimationTimers.filter((timerId) => timerId !== handoffTimer);
      setThemeScope(targetScope);
      wallpaperState.pendingThemeScope = null;
      wallpaperState.heldAppearanceModeLabels = null;
      renderWallpaperPanelState();
      buttons.forEach((button) => {
        const motionElement = getWallpaperAppearanceOptionMotionElement(button);
        if (!motionElement) {
          return;
        }
        motionElement.style.setProperty('transition', 'none');
        motionElement.style.setProperty('opacity', '0');
        motionElement.style.setProperty('transform', `translate3d(${direction * offsetPx}px, 0, 0)`);
      });
      if (options) {
        void options.offsetHeight;
      }
      let maxInDelay = 0;
      buttons.forEach((button, index) => {
        const motionElement = getWallpaperAppearanceOptionMotionElement(button);
        if (!motionElement) {
          return;
        }
        const delay = getAppearanceOptionDelay(index, buttons.length, direction);
        maxInDelay = Math.max(maxInDelay, delay);
        motionElement.style.setProperty(
          'transition',
          `transform ${durationMs}ms ${easing} ${delay}ms, opacity ${fadeDurationMs}ms ${easing} ${delay}ms`
        );
        motionElement.style.setProperty('opacity', '1');
        motionElement.style.setProperty('transform', 'translate3d(0, 0, 0)');
      });
      const cleanupTimer = window.setTimeout(() => {
        wallpaperAppearanceAnimationTimers = wallpaperAppearanceAnimationTimers.filter((timerId) => timerId !== cleanupTimer);
        clearWallpaperAppearanceScopeAnimation();
        renderWallpaperPanelState();
      }, durationMs + maxInDelay + 24);
      wallpaperAppearanceAnimationTimers.push(cleanupTimer);
    }, handoffDelayMs);
    wallpaperAppearanceAnimationTimers.push(handoffTimer);
  }

  return {
    animateWallpaperPanelResize,
    setWallpaperActiveTab,
    syncWallpaperSourceTabToEditMode,
    setWallpaperActiveMode,
    isWallpaperPanelOpen,
    setWallpaperPanelOpenState,
    getWallpaperAppearanceModeLabel,
    shouldReduceMotion,
    playWallpaperEnterMotion,
    animateWallpaperAppearanceScopeChange
  };
}

export { createPanelMotion };
