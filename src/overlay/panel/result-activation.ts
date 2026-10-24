// Opening a result: the modifier keys that pick the current, a new or a
// background tab, and switching to an open tab instead.
import * as NAVIGATION_DISPOSITION from '../../domain/navigation-disposition';
import * as LumnoMessaging from '../../platform/messaging';

function createResultActivation(deps) {
  const {
    ensureOverlaySuggestionsView,
    SUGGESTION_ACTION_MODEL,
    removeOverlay,
    recordSearchSuggestionSelectionFromSuggestion
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  let openInCurrentTabModifierActive = false;
  let openSwitchInNewTabModifierActive = false;
  let openInBackgroundTabModifierActive = false;

  function setSuggestionActionModifiersActive(openInCurrentTabActive, openSwitchInNewTabActive, openInBackgroundTabActive) {
    const nextOpenInCurrentTabActive = Boolean(openInCurrentTabActive);
    const nextOpenSwitchInNewTabActive = Boolean(openSwitchInNewTabActive);
    const nextOpenInBackgroundTabActive = Boolean(openInBackgroundTabActive);
    if (openInCurrentTabModifierActive === nextOpenInCurrentTabActive &&
        openSwitchInNewTabModifierActive === nextOpenSwitchInNewTabActive &&
        openInBackgroundTabModifierActive === nextOpenInBackgroundTabActive) {
      return;
    }
    openInCurrentTabModifierActive = nextOpenInCurrentTabActive;
    openSwitchInNewTabModifierActive = nextOpenSwitchInNewTabActive;
    openInBackgroundTabModifierActive = nextOpenInBackgroundTabActive;
    const reactView = ensureOverlaySuggestionsView();
    reactView.setOpenInCurrentTabModifierActive(
      nextOpenInCurrentTabActive
    );
    reactView.setOpenSwitchInNewTabModifierActive(
      nextOpenSwitchInNewTabActive
    );
    reactView.setOpenInBackgroundTabModifierActive(
      nextOpenInBackgroundTabActive
    );
  }

  function syncSuggestionActionModifiersFromEvent(event) {
    setSuggestionActionModifiersActive(
      Boolean(event && event.altKey),
      Boolean(event && event.shiftKey),
      Boolean(event && (event.metaKey || event.ctrlKey) && !overlayState.numberShortcutInstantEnabled)
    );
  }

  function shouldUseCurrentTabForOpenNewTabAction(suggestion, event, item) {
    if (!event || !event.altKey) {
      return false;
    }
    const action = item && item._xVisitButtonAction ? item._xVisitButtonAction : '';
    return SUGGESTION_ACTION_MODEL.shouldOpenNewTabActionInCurrentTab(suggestion, {
      action,
      openInCurrentTab: true
    });
  }

  function shouldUseNewTabForSwitchAction(suggestion, event, item) {
    if (!event || !event.shiftKey) {
      return false;
    }
    const action = item && item._xVisitButtonAction ? item._xVisitButtonAction : 'switch';
    return SUGGESTION_ACTION_MODEL.shouldOpenSwitchActionInNewTab(suggestion, {
      action,
      openSwitchInNewTab: true
    });
  }

  function shouldOpenSearchResultInBackgroundTab(event) {
    const config = {
      openInBackgroundTab: Boolean(event && (
        ((event.metaKey || event.ctrlKey) && !overlayState.numberShortcutInstantEnabled) ||
        NAVIGATION_DISPOSITION.isMiddleClick(event)
      )),
      openInCurrentTab: Boolean(event && event.altKey)
    };
    return SUGGESTION_ACTION_MODEL.getSearchResultOpenDisposition(config) === 'backgroundTab';
  }

  function finishOverlayResultActivation(event, canOpenInBackground) {
    if (canOpenInBackground !== false &&
        shouldOpenSearchResultInBackgroundTab(event)) {
      overlayState.searchInput.focus({ preventScroll: true });
      return false;
    }
    removeOverlay(overlayState.overlay);
    return true;
  }

  function getOpenDisposition(event, fallback) {
    if (overlayState.numberShortcutInstantEnabled) {
      return (NAVIGATION_DISPOSITION.isMiddleClick(event) || Boolean(event && (event.metaKey || event.ctrlKey) && !overlayState.numberShortcutInstantEnabled))
        ? 'backgroundTab'
        : (fallback || 'newTab');
    }
    return NAVIGATION_DISPOSITION.getDisposition(event, fallback);
  }

  function getSearchResultNewTabDisposition(event) {
    return shouldOpenSearchResultInBackgroundTab(event) ? 'backgroundTab' : 'newTab';
  }

  function getSearchResultCreateDisposition(suggestion, event, item) {
    if (shouldUseCurrentTabForOpenNewTabAction(suggestion, event, item)) {
      return 'currentTab';
    }
    return getSearchResultNewTabDisposition(event);
  }

  function openMatchedTabSuggestion(suggestion, event, item, query) {
    if (suggestion && suggestion.url &&
        (shouldUseNewTabForSwitchAction(suggestion, event, item) ||
          shouldOpenSearchResultInBackgroundTab(event))) {
      recordSearchSuggestionSelectionFromSuggestion(suggestion, query, 'overlay');
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
        action: 'createTab',
        url: suggestion.url,
        disposition: getSearchResultNewTabDisposition(event)
      });
      return;
    }
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
      action: 'switchToTab',
      tabId: suggestion._xMatchedTabId
    });
  }

  return {
    setSuggestionActionModifiersActive,
    syncSuggestionActionModifiersFromEvent,
    shouldOpenSearchResultInBackgroundTab,
    finishOverlayResultActivation,
    getOpenDisposition,
    getSearchResultNewTabDisposition,
    getSearchResultCreateDisposition,
    openMatchedTabSuggestion
  };
}

export { createResultActivation };
