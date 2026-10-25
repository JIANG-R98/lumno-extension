// Opening a result: the modifier keys that pick the current, a new or a
// background tab, and switching to an open tab instead.
import * as NAVIGATION_DISPOSITION from '../../domain/navigation-disposition';
import type { Disposition } from '../../domain/navigation-disposition';
import type * as SuggestionActionModel from '../../domain/search/suggestion-action-model';
import type { DisplayedSuggestion } from '../../domain/search/suggestion-action-model';
import * as LumnoMessaging from '../../platform/messaging';
import type { SuggestionsViewController } from '../../shared/react/search/suggestion-list/types';

// The keys and button of the click or key press that opens a result.
interface ActivationEvent {
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  button?: number;
}

// The rendered row a result was opened from.
interface ActivatedItem {
  _xVisitButtonAction?: string;
}

interface ResultActivationState {
  overlay: HTMLElement | null;
  searchInput: HTMLInputElement | null;
  // Number keys open results at once, so Cmd and Ctrl keep their own use.
  numberShortcutInstantEnabled: boolean;
}

interface ResultActivationDeps {
  ensureOverlaySuggestionsView(): Pick<SuggestionsViewController,
    'setOpenInCurrentTabModifierActive' | 'setOpenSwitchInNewTabModifierActive' | 'setOpenInBackgroundTabModifierActive'>;
  SUGGESTION_ACTION_MODEL: Pick<typeof SuggestionActionModel,
    'shouldOpenNewTabActionInCurrentTab' | 'shouldOpenSwitchActionInNewTab' | 'getSearchResultOpenDisposition'>;
  removeOverlay(overlay: HTMLElement | null): void;
  recordSearchSuggestionSelectionFromSuggestion(suggestion: DisplayedSuggestion, query: string, surface: string): void;
  overlayState: ResultActivationState;
}

function createResultActivation(deps: ResultActivationDeps) {
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

  // Tells the list which modifier keys are held, so its buttons say what a
  // click would do.
  function setSuggestionActionModifiersActive(
    openInCurrentTabActive: boolean,
    openSwitchInNewTabActive: boolean,
    openInBackgroundTabActive: boolean
  ): void {
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

  function syncSuggestionActionModifiersFromEvent(event: ActivationEvent | null): void {
    setSuggestionActionModifiersActive(
      Boolean(event && event.altKey),
      Boolean(event && event.shiftKey),
      Boolean(event && (event.metaKey || event.ctrlKey) && !overlayState.numberShortcutInstantEnabled)
    );
  }

  function shouldUseCurrentTabForOpenNewTabAction(
    suggestion: DisplayedSuggestion,
    event: ActivationEvent | null,
    item: ActivatedItem | null
  ): boolean {
    if (!event || !event.altKey) {
      return false;
    }
    const action = item && item._xVisitButtonAction ? item._xVisitButtonAction : '';
    return SUGGESTION_ACTION_MODEL.shouldOpenNewTabActionInCurrentTab(suggestion, {
      action,
      openInCurrentTab: true
    });
  }

  function shouldUseNewTabForSwitchAction(
    suggestion: DisplayedSuggestion,
    event: ActivationEvent | null,
    item: ActivatedItem | null
  ): boolean {
    if (!event || !event.shiftKey) {
      return false;
    }
    const action = item && item._xVisitButtonAction ? item._xVisitButtonAction : 'switch';
    return SUGGESTION_ACTION_MODEL.shouldOpenSwitchActionInNewTab(suggestion, {
      action,
      openSwitchInNewTab: true
    });
  }

  function shouldOpenSearchResultInBackgroundTab(event: ActivationEvent | null): boolean {
    const config = {
      openInBackgroundTab: Boolean(event && (
        ((event.metaKey || event.ctrlKey) && !overlayState.numberShortcutInstantEnabled) ||
        NAVIGATION_DISPOSITION.isMiddleClick(event)
      )),
      openInCurrentTab: Boolean(event && event.altKey)
    };
    return SUGGESTION_ACTION_MODEL.getSearchResultOpenDisposition(config) === 'backgroundTab';
  }

  // Closes the panel after a result opened, unless it opened in the
  // background; true when the panel closed.
  function finishOverlayResultActivation(event: ActivationEvent | null, canOpenInBackground: boolean): boolean {
    if (canOpenInBackground !== false &&
        shouldOpenSearchResultInBackgroundTab(event)) {
      if (overlayState.searchInput) {
        overlayState.searchInput.focus({ preventScroll: true });
      }
      return false;
    }
    removeOverlay(overlayState.overlay);
    return true;
  }

  function getOpenDisposition(event: ActivationEvent | null, fallback?: Disposition): Disposition {
    if (overlayState.numberShortcutInstantEnabled) {
      return (NAVIGATION_DISPOSITION.isMiddleClick(event) || Boolean(event && (event.metaKey || event.ctrlKey) && !overlayState.numberShortcutInstantEnabled))
        ? 'backgroundTab'
        : (fallback || 'newTab');
    }
    return NAVIGATION_DISPOSITION.getDisposition(event, fallback);
  }

  function getSearchResultNewTabDisposition(event: ActivationEvent | null): 'backgroundTab' | 'newTab' {
    return shouldOpenSearchResultInBackgroundTab(event) ? 'backgroundTab' : 'newTab';
  }

  function getSearchResultCreateDisposition(
    suggestion: DisplayedSuggestion,
    event: ActivationEvent | null,
    item: ActivatedItem | null
  ): Disposition {
    if (shouldUseCurrentTabForOpenNewTabAction(suggestion, event, item)) {
      return 'currentTab';
    }
    return getSearchResultNewTabDisposition(event);
  }

  // Switches to the tab a result is open in, or opens the result in a new
  // tab when the keys held ask for one.
  function openMatchedTabSuggestion(
    suggestion: DisplayedSuggestion,
    event: ActivationEvent | null,
    item: ActivatedItem | null,
    query: string
  ): void {
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
    if (typeof suggestion._xMatchedTabId !== 'number') {
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
export type { ActivationEvent, ResultActivationDeps, ResultActivationState };
