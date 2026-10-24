// @ts-nocheck
// Opening, refreshing and closing the mode menu, and the prefix, menu and
// document pointer and key handlers around it.
function createModeMenuLifecycle(deps) {
  const {
    config,
    refreshModeMenuLanguage,
    resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation,
    renderModeMenu,
    syncModeMenuQueryLift,
    modeMenu,
    syncInputPlaceholder,
    updateModeMenuFooterAlignment,
    revealModeMenuSurface,
    container,
    siteSearchPrefix,
    setStyle,
    useImportantStyles,
    setInputModePrefixMenuOpen,
    notifyModeMenuLayoutChange,
    focusModeInput,
    focusModeMenuSearch,
    focusModeMenuButton,
    requestModeMenuPinyinRuntime,
    doc,
    getModeMenuButtons,
    cancelModeMenuRevealFrame,
    modeMenuCursorTooltipController,
    setModeMenuSearchActive,
    concealModeMenuSurface,
    getModeMenuActiveElement,
    applyModeMenuFilter,
    focusFirstModeMenuFilterResult,
    getModeMenuDirectionalIndex,
    selectModeMenuItem,
    handleModeMenuTabFocusToggle,
    shouldHandleModeMenuKeyEvent
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  function openModeMenu(focusTarget) {
    if (inputModeState.destroyed || typeof config.getModeMenuItems !== 'function') {
      return false;
    }
    refreshModeMenuLanguage();
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    const requestId = ++inputModeState.modeMenuRequestId;
    inputModeState.modeMenuPending = true;
    const finishOpen = (items) => {
      if (inputModeState.destroyed || requestId !== inputModeState.modeMenuRequestId) {
        return false;
      }
      inputModeState.modeMenuPending = false;
      inputModeState.modeMenuFilterQuery = '';
      const normalizedItems = renderModeMenu(items);
      if (normalizedItems.length === 0) {
        return false;
      }
      inputModeState.modeMenuOpen = true;
      syncModeMenuQueryLift();
      modeMenu.hidden = false;
      syncInputPlaceholder();
      updateModeMenuFooterAlignment();
      revealModeMenuSurface();
      container.setAttribute('data-mode-menu-open', 'true');
      siteSearchPrefix.setAttribute('aria-expanded', 'true');
      setStyle(siteSearchPrefix, 'z-index', '41', useImportantStyles);
      setInputModePrefixMenuOpen(true);
      notifyModeMenuLayoutChange();
      const activeIndex = normalizedItems.findIndex((item) => item.active);
      const targetIndex = focusTarget === 'last'
        ? normalizedItems.length - 1
        : (activeIndex >= 0 ? activeIndex : 0);
      if (focusTarget === 'input') {
        focusModeInput();
      } else if (focusTarget === 'none') {
        focusModeMenuSearch();
      } else {
        focusModeMenuButton(targetIndex);
      }
      return true;
    };
    const items = config.getModeMenuItems();
    requestModeMenuPinyinRuntime();
    if ((items && typeof items.then === 'function') ||
        (inputModeState.modeMenuPinyinRuntimeReady &&
          typeof inputModeState.modeMenuPinyinRuntimeReady.then === 'function')) {
      modeMenu.setAttribute('aria-busy', 'true');
      return Promise.all([
        Promise.resolve(items),
        Promise.resolve(inputModeState.modeMenuPinyinRuntimeReady)
      ]).then(([resolvedItems]) => {
        if (requestId !== inputModeState.modeMenuRequestId) {
          return false;
        }
        modeMenu.removeAttribute('aria-busy');
        return finishOpen(resolvedItems);
      }, () => {
        if (requestId === inputModeState.modeMenuRequestId) {
          inputModeState.modeMenuPending = false;
          modeMenu.removeAttribute('aria-busy');
        }
        return false;
      });
    }
    return finishOpen(items);
  }

  function refreshModeMenu(preferredModeId) {
    if (inputModeState.destroyed || !inputModeState.modeMenuOpen || modeMenu.hidden ||
        typeof config.getModeMenuItems !== 'function') {
      return false;
    }
    const focusRoot = typeof modeMenu.getRootNode === 'function'
      ? modeMenu.getRootNode()
      : doc;
    const activeElement = focusRoot && focusRoot.activeElement
      ? focusRoot.activeElement
      : doc.activeElement;
    const focusedButton = activeElement &&
      typeof activeElement.getAttribute === 'function' &&
      activeElement.getAttribute('role') === 'menuitemradio'
      ? activeElement
      : null;
    const focusedModeId = preferredModeId
      ? String(preferredModeId)
      : (focusedButton ? String(focusedButton.dataset.modeId || '') : '');
    const requestId = ++inputModeState.modeMenuRequestId;
    inputModeState.modeMenuPending = true;
    const finishRefresh = (items) => {
      if (inputModeState.destroyed || requestId !== inputModeState.modeMenuRequestId || !inputModeState.modeMenuOpen || modeMenu.hidden) {
        return false;
      }
      inputModeState.modeMenuPending = false;
      modeMenu.removeAttribute('aria-busy');
      const normalizedItems = renderModeMenu(items);
      syncModeMenuQueryLift();
      if (normalizedItems.length === 0) {
        closeModeMenu(false);
        return false;
      }
      updateModeMenuFooterAlignment();
      notifyModeMenuLayoutChange();
      if (focusedModeId) {
        const buttons = getModeMenuButtons();
        const nextFocusedIndex = buttons.findIndex((button) => (
          String(button.dataset.modeId || '') === focusedModeId
        ));
        if (nextFocusedIndex >= 0) {
          focusModeMenuButton(nextFocusedIndex);
        }
      }
      return true;
    };
    const items = config.getModeMenuItems();
    if (items && typeof items.then === 'function') {
      modeMenu.setAttribute('aria-busy', 'true');
      return items.then(finishRefresh, () => {
        if (requestId === inputModeState.modeMenuRequestId) {
          inputModeState.modeMenuPending = false;
          modeMenu.removeAttribute('aria-busy');
        }
        return false;
      });
    }
    return finishRefresh(items);
  }

  function closeModeMenu(restoreFocus) {
    if (!inputModeState.modeMenuOpen && !inputModeState.modeMenuPending && modeMenu.hidden) {
      return false;
    }
    inputModeState.modeMenuRequestId += 1;
    inputModeState.modeMenuPending = false;
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    modeMenu.removeAttribute('aria-busy');
    cancelModeMenuRevealFrame();
    if (modeMenuCursorTooltipController &&
        typeof modeMenuCursorTooltipController.hide === 'function') {
      modeMenuCursorTooltipController.hide();
    }
    inputModeState.modeMenuOpen = false;
    inputModeState.modeMenuFilterQuery = '';
    setModeMenuSearchActive(false);
    concealModeMenuSurface();
    modeMenu.hidden = true;
    syncInputPlaceholder();
    container.removeAttribute('data-mode-menu-open');
    siteSearchPrefix.setAttribute('aria-expanded', 'false');
    setStyle(siteSearchPrefix, 'z-index', '1', useImportantStyles);
    setInputModePrefixMenuOpen(false);
    notifyModeMenuLayoutChange();
    if (restoreFocus && typeof siteSearchPrefix.focus === 'function') {
      siteSearchPrefix.focus({ preventScroll: true });
    }
    return true;
  }

  function handlePrefixClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (inputModeState.modeMenuOpen || inputModeState.modeMenuPending) {
      closeModeMenu(true);
    } else {
      openModeMenu('none');
    }
  }

  function handlePrefixKeydown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openModeMenu(event.key === 'ArrowUp' ? 'last' : 'active');
    } else if (event.key === 'Escape' && inputModeState.modeMenuOpen) {
      event.preventDefault();
      closeModeMenu(true);
    }
  }

  function stopModeMenuKeyEvent(event) {
    event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    } else {
      event.stopPropagation();
    }
  }

  function handleMenuKeydown(event) {
    const buttons = getModeMenuButtons();
    const currentIndex = buttons.indexOf(getModeMenuActiveElement());
    if (event.key === 'Escape') {
      stopModeMenuKeyEvent(event);
      if (inputModeState.modeMenuFilterQuery) {
        applyModeMenuFilter('');
        focusModeMenuSearch();
      } else {
        closeModeMenu(true);
      }
      return true;
    } else if (event.key === 'Backspace' && !event.metaKey &&
        !event.ctrlKey && !event.altKey) {
      stopModeMenuKeyEvent(event);
      const queryCharacters = Array.from(inputModeState.modeMenuFilterQuery);
      queryCharacters.pop();
      applyModeMenuFilter(queryCharacters.join(''));
      focusFirstModeMenuFilterResult();
      return true;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      stopModeMenuKeyEvent(event);
      const nextIndex = getModeMenuDirectionalIndex(
        buttons,
        currentIndex,
        event.key
      );
      focusModeMenuButton(nextIndex, { smoothScroll: true });
      return true;
    } else if (event.key === 'Home' || event.key === 'End') {
      stopModeMenuKeyEvent(event);
      focusModeMenuButton(event.key === 'Home' ? 0 : buttons.length - 1);
      return true;
    } else if ((event.key === 'Enter' || event.key === ' ') && currentIndex >= 0) {
      stopModeMenuKeyEvent(event);
      const entry = inputModeState.renderedModeMenuEntries.find((candidate) => (
        candidate.button === buttons[currentIndex]
      ));
      if (entry) {
        selectModeMenuItem(entry.item, {
          focusAfterSelect: 'panel'
        });
      }
      return true;
    } else if (event.key === 'Tab') {
      return handleModeMenuTabFocusToggle(event);
    } else if (!event.isComposing && !event.repeat &&
        !event.metaKey && !event.ctrlKey && !event.altKey &&
        typeof event.key === 'string' && event.key.length === 1 &&
        /^[\p{L}\p{N}\s]$/u.test(event.key)) {
      stopModeMenuKeyEvent(event);
      applyModeMenuFilter(inputModeState.modeMenuFilterQuery + event.key);
      focusFirstModeMenuFilterResult();
      return true;
    }
    return false;
  }

  function handleModeMenuKeyEvent(event) {
    if (!shouldHandleModeMenuKeyEvent(event)) {
      return false;
    }
    return handleMenuKeydown(event);
  }

  function handleModeMenuPointerDown(event) {
    if (!inputModeState.modeMenuOpen || modeMenu.hidden) {
      return;
    }
    setModeMenuSearchActive(true);
    const target = event && event.target;
    const button = target && typeof target.closest === 'function'
      ? target.closest('[role="menuitemradio"]')
      : null;
    // Native pointer focus can scroll the panel's ancestors before click
    // returns focus to the input. All menu focus is managed with preventScroll.
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (button) {
      return;
    }
    focusModeMenuSearch();
  }

  function handleDocumentPointerDown(event) {
    const eventPath = event && typeof event.composedPath === 'function'
      ? event.composedPath()
      : [];
    const containerRoot = typeof container.getRootNode === 'function'
      ? container.getRootNode()
      : null;
    const containerRootHost = containerRoot && containerRoot.host
      ? containerRoot.host
      : null;
    const isInsideModeContainer = container.contains(event.target) ||
      eventPath.includes(container) ||
      eventPath.includes(modeMenu) ||
      eventPath.includes(siteSearchPrefix) ||
      Boolean(containerRootHost && event.currentTarget !== containerRoot && (
        event.target === containerRootHost ||
        eventPath.includes(containerRootHost)
      ));
    if (!inputModeState.modeMenuOpen || isInsideModeContainer) {
      return;
    }
    closeModeMenu(false);
  }

  return {
    openModeMenu,
    refreshModeMenu,
    closeModeMenu,
    handlePrefixClick,
    handlePrefixKeydown,
    handleMenuKeydown,
    handleModeMenuKeyEvent,
    handleModeMenuPointerDown,
    handleDocumentPointerDown
  };
}

export { createModeMenuLifecycle };
