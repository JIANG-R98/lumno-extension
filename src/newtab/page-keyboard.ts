// @ts-nocheck
// Page-wide keys: Tab into site search, Escape through the dismiss stack,
// and the modifier keys suggestion actions follow.
function createPageKeyboard(deps) {
  const {
    handleSearchTabKey,
    dismissStack,
    finishShortcutDrag,
    finishBookmarkDrag,
    isEditableElement,
    performBookmarkMoveHistoryAction,
    syncSuggestionActionModifiersFromEvent,
    SUGGESTION_NAVIGATION,
    suggestionItems,
    numberShortcutOptions,
    setSuggestionActionModifiersActive
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  pageState.handleTabKey = handleSearchTabKey;

  // Escape cancels a drag before it closes any open layer.
  dismissStack.register('drag', {
    priority: 1,
    isOpen: () => Boolean(pageState.shortcutDragState || pageState.bookmarkDragState || pageState.recentCardDragRuntime.hasRecentCardDragSession()),
    close: () => {
      finishShortcutDrag(null, { cancel: true });
      finishBookmarkDrag(null, { canceled: true });
      pageState.recentCardDragRuntime.finishRecentCardDrag(null, { cancel: true });
    }
  });

  document.addEventListener('keydown', function(event) {
    if (pageState.folderColorPicker && pageState.folderColorPicker.isOpen()) return;
    if (!event || event.defaultPrevented || event.altKey || isEditableElement(event.target)) {
      return;
    }
    const hasCommandModifier = event.metaKey || event.ctrlKey;
    if (!hasCommandModifier) {
      return;
    }
    const key = String(event.key || '').toLowerCase();
    const wantsUndo = key === 'z' && !event.shiftKey;
    const wantsRedo = (key === 'z' && event.shiftKey) ||
      (key === 'y' && event.ctrlKey && !event.metaKey);
    const direction = wantsUndo ? 'undo' : wantsRedo ? 'redo' : '';
    if (!direction || !performBookmarkMoveHistoryAction(direction)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener('keydown', function(event) {
    if (pageState.folderColorPicker && pageState.folderColorPicker.isOpen()) return;
    syncSuggestionActionModifiersFromEvent(event);
    if (SUGGESTION_NAVIGATION.handleNumberShortcutKeyEvent(
      event,
      suggestionItems,
      pageState.suggestionsContainer,
      numberShortcutOptions
    )) {
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    if (document.activeElement !== pageState.inputParts.input) {
      return;
    }
    if (pageState.handleTabKey) {
      pageState.handleTabKey(event);
    }
  }, true);
  document.addEventListener('keyup', function(event) {
    syncSuggestionActionModifiersFromEvent(event);
    SUGGESTION_NAVIGATION.handleNumberShortcutKeyEvent(
      event,
      suggestionItems,
      pageState.suggestionsContainer,
      numberShortcutOptions
    );
  }, true);
  window.addEventListener('blur', function() {
    setSuggestionActionModifiersActive(false, false, false);
    SUGGESTION_NAVIGATION.cancelNumberShortcuts(pageState.suggestionsContainer);
  });

  return {};
}

export { createPageKeyboard };
