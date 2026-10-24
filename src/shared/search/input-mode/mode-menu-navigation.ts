// @ts-nocheck
// Moving through the mode menu: its buttons, focus between the search
// field and items, scrolling, rows and arrow-key directions, and selecting.
function createModeMenuNavigation(deps) {
  const {
    modeMenu,
    doc,
    input,
    DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT,
    DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT,
    win,
    normalizeModeMenuSearchText,
    config,
    refreshModeMenu
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  function getAllModeMenuButtons() {
    return Array.from(modeMenu.querySelectorAll('[role="menuitemradio"]'));
  }

  function getModeMenuButtons() {
    return getAllModeMenuButtons().filter((button) => !button.hidden);
  }

  function getModeMenuActiveElement() {
    const rootNode = typeof modeMenu.getRootNode === 'function'
      ? modeMenu.getRootNode()
      : doc;
    return rootNode && rootNode.activeElement
      ? rootNode.activeElement
      : doc.activeElement;
  }

  function setModeMenuSearchActive(active) {
    modeMenu.setAttribute('data-search-active', active ? 'true' : 'false');
  }

  function focusModeMenuSearch() {
    if (inputModeState.destroyed || !inputModeState.modeMenuOpen || modeMenu.hidden) {
      return false;
    }
    getModeMenuButtons().forEach((button) => {
      button.tabIndex = -1;
    });
    setModeMenuSearchActive(true);
    modeMenu.focus({ preventScroll: true });
    return true;
  }

  function focusModeInput() {
    if (inputModeState.destroyed || !input || typeof input.focus !== 'function') {
      return false;
    }
    setModeMenuSearchActive(false);
    input.focus({ preventScroll: true });
    return true;
  }

  function shouldHandleModeMenuKeyEvent(event) {
    if (inputModeState.destroyed || !inputModeState.modeMenuOpen || modeMenu.hidden) {
      return false;
    }
    const activeElement = getModeMenuActiveElement();
    const eventTarget = event && event.target;
    return Boolean(
      activeElement === modeMenu || modeMenu.contains(activeElement) ||
      eventTarget === modeMenu || modeMenu.contains(eventTarget)
    );
  }

  function scrollModeMenuButtonIntoView(button, scrollOptions) {
    if (!button || !inputModeState.modeMenuContent ||
        typeof button.getBoundingClientRect !== 'function' ||
        typeof inputModeState.modeMenuContent.getBoundingClientRect !== 'function') {
      return;
    }
    const buttonRect = button.getBoundingClientRect();
    const contentRect = inputModeState.modeMenuContent.getBoundingClientRect();
    const topBoundary = contentRect.top + DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT;
    const bottomBoundary = contentRect.bottom -
      DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT;
    let scrollDelta = 0;
    if (buttonRect.top < topBoundary) {
      scrollDelta = buttonRect.top - topBoundary;
    } else if (buttonRect.bottom > bottomBoundary) {
      scrollDelta = buttonRect.bottom - bottomBoundary;
    }
    if (scrollDelta === 0) {
      return;
    }
    const targetScrollTop = Math.max(
      0,
      (Number(inputModeState.modeMenuContent.scrollTop) || 0) + scrollDelta
    );
    const prefersReducedMotion = typeof win.matchMedia === 'function' &&
      win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shouldSmoothScroll = scrollOptions &&
      scrollOptions.smooth === true &&
      !prefersReducedMotion;
    if (shouldSmoothScroll && typeof inputModeState.modeMenuContent.scrollTo === 'function') {
      inputModeState.modeMenuContent.scrollTo({
        behavior: 'smooth',
        top: targetScrollTop
      });
    } else {
      inputModeState.modeMenuContent.scrollTop = targetScrollTop;
    }
  }

  function focusModeMenuButton(index, focusOptions) {
    const buttons = getModeMenuButtons();
    if (buttons.length === 0) {
      return false;
    }
    const normalizedIndex = ((index % buttons.length) + buttons.length) % buttons.length;
    buttons.forEach((button, buttonIndex) => {
      button.tabIndex = buttonIndex === normalizedIndex ? 0 : -1;
    });
    setModeMenuSearchActive(true);
    buttons[normalizedIndex].focus({ preventScroll: true });
    scrollModeMenuButtonIntoView(buttons[normalizedIndex], {
      smooth: Boolean(focusOptions && focusOptions.smoothScroll)
    });
    return true;
  }

  function focusFirstModeMenuFilterResult() {
    const hasFilterQuery = Boolean(
      normalizeModeMenuSearchText(inputModeState.modeMenuFilterQuery)
    );
    if (hasFilterQuery && focusModeMenuButton(0)) {
      return true;
    }
    return focusModeMenuSearch();
  }

  function getModeMenuButtonLayout(button, index) {
    const rect = button && typeof button.getBoundingClientRect === 'function'
      ? button.getBoundingClientRect()
      : null;
    const left = Number(rect && rect.left) || 0;
    const top = Number(rect && rect.top) || 0;
    const width = Number(rect && rect.width) || 0;
    const height = Number(rect && rect.height) || 0;
    return {
      bottom: Number(rect && rect.bottom) || top + height,
      centerX: left + (width / 2),
      centerY: top + (height / 2),
      height,
      index,
      left,
      right: Number(rect && rect.right) || left + width,
      top,
      width
    };
  }

  function getModeMenuButtonRows(buttons) {
    const layouts = buttons.map(getModeMenuButtonLayout);
    const hasMeasuredLayout = layouts.some((layout) => (
      layout.width > 0 && layout.height > 0
    ));
    if (!hasMeasuredLayout) {
      return null;
    }
    const rows = [];
    layouts.forEach((layout) => {
      let row = rows.find((candidate) => {
        const tolerance = Math.max(
          2,
          Math.min(candidate.averageHeight, layout.height) * 0.4
        );
        return Math.abs(candidate.centerY - layout.centerY) <= tolerance;
      });
      if (!row) {
        row = {
          averageHeight: layout.height,
          centerY: layout.centerY,
          items: []
        };
        rows.push(row);
      }
      row.items.push(layout);
      const itemCount = row.items.length;
      row.centerY = row.items.reduce((total, item) => total + item.centerY, 0) /
        itemCount;
      row.averageHeight = row.items.reduce((total, item) => total + item.height, 0) /
        itemCount;
    });
    rows.sort((left, right) => left.centerY - right.centerY);
    rows.forEach((row) => {
      row.items.sort((left, right) => left.centerX - right.centerX);
    });
    return rows;
  }

  function getModeMenuDirectionalIndex(buttons, currentIndex, key) {
    if (buttons.length === 0) {
      return -1;
    }
    const movesForward = key === 'ArrowDown' || key === 'ArrowRight';
    if (currentIndex < 0) {
      return movesForward ? 0 : buttons.length - 1;
    }
    const rows = getModeMenuButtonRows(buttons);
    if (!rows) {
      return ((currentIndex + (movesForward ? 1 : -1)) % buttons.length +
        buttons.length) % buttons.length;
    }
    const currentRowIndex = rows.findIndex((row) => (
      row.items.some((item) => item.index === currentIndex)
    ));
    if (currentRowIndex < 0) {
      return currentIndex;
    }
    const currentRow = rows[currentRowIndex];
    const currentItemIndex = currentRow.items.findIndex((item) => (
      item.index === currentIndex
    ));
    const currentItem = currentRow.items[currentItemIndex];
    if (!currentItem) {
      return currentIndex;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const horizontalOffset = key === 'ArrowRight' ? 1 : -1;
      const target = currentRow.items[currentItemIndex + horizontalOffset];
      return target ? target.index : currentIndex;
    }
    const verticalOffset = key === 'ArrowDown' ? 1 : -1;
    const targetRow = rows[currentRowIndex + verticalOffset];
    if (!targetRow) {
      return currentIndex;
    }
    return targetRow.items.reduce((closest, candidate) => {
      if (!closest) {
        return candidate;
      }
      const candidateDistance = Math.abs(candidate.centerX - currentItem.centerX);
      const closestDistance = Math.abs(closest.centerX - currentItem.centerX);
      return candidateDistance < closestDistance ? candidate : closest;
    }, null).index;
  }

  function syncModeMenuSelection(modeId) {
    const selectedModeId = String(modeId || '');
    let matched = false;
    getAllModeMenuButtons().forEach((button) => {
      const isSelected = Boolean(
        selectedModeId && String(button.dataset.modeId || '') === selectedModeId
      );
      button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      matched = matched || isSelected;
    });
    return matched;
  }

  function selectModeMenuItem(item, selectionOptions) {
    const selectOptions = selectionOptions || {};
    const focusAfterSelect = selectOptions.focusAfterSelect === 'panel'
      ? 'panel'
      : 'input';
    let result = null;
    if (typeof config.onModeMenuSelect === 'function') {
      result = config.onModeMenuSelect(item);
    }
    const syncSelectedMode = () => {
      if (!inputModeState.destroyed && inputModeState.modeMenuOpen && !modeMenu.hidden) {
        const selectedModeId = item && item.id ? String(item.id) : '';
        if (!syncModeMenuSelection(selectedModeId)) {
          refreshModeMenu(selectedModeId);
        }
        if (focusAfterSelect === 'panel') {
          const buttons = getModeMenuButtons();
          const selectedIndex = buttons.findIndex((button) => (
            String(button.dataset.modeId || '') === selectedModeId
          ));
          if (selectedIndex >= 0) {
            focusModeMenuButton(selectedIndex);
          } else {
            focusModeMenuSearch();
          }
        } else {
          focusModeInput();
        }
      }
    };
    if (result && typeof result.then === 'function') {
      Promise.resolve(result).then(syncSelectedMode, syncSelectedMode);
      return;
    }
    syncSelectedMode();
  }

  return {
    getModeMenuButtons,
    getModeMenuActiveElement,
    setModeMenuSearchActive,
    focusModeMenuSearch,
    focusModeInput,
    shouldHandleModeMenuKeyEvent,
    focusModeMenuButton,
    focusFirstModeMenuFilterResult,
    getModeMenuDirectionalIndex,
    selectModeMenuItem
  };
}

export { createModeMenuNavigation };
