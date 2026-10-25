// A press on the page background focuses the search input.

// The fields of a pointer or mouse event the handler reads.
type BackgroundPointerEvent = Pick<Event, 'type' | 'target' | 'defaultPrevented' | 'preventDefault'>;

interface BackgroundFocusOptions {
  // The elements a press on counts as a press on the background.
  getBackgroundTargets(): readonly (EventTarget | null)[];
  // Focuses the input; false when it could not.
  focusSearch(): boolean | void;
  getSearchValue?(): string;
  dismissSearchResults?(): void;
}

function shouldFocusSearchFromPointer(
  event: BackgroundPointerEvent | null | undefined,
  backgroundTargets: readonly (EventTarget | null)[] | null | undefined
): boolean {
  if (!event || event.defaultPrevented || !event.target || !backgroundTargets) {
    return false;
  }
  return backgroundTargets.some((target) => Boolean(target) && event.target === target);
}

// Handles pointerdown and the mousedown after it; true when the press was
// taken for the search input.
function createBackgroundFocusHandler(options: BackgroundFocusOptions): (event: BackgroundPointerEvent) => boolean {
  const config = options;
  let focusedFromTarget: EventTarget | null = null;
  return function handleBackgroundPointerFocus(event: BackgroundPointerEvent): boolean {
    // The mousedown that follows a focusing pointerdown would blur the input
    // again (its default action on a non-focusable background), leaving no caret.
    if (event.type === 'mousedown') {
      const keepFocus = Boolean(focusedFromTarget) && event.target === focusedFromTarget;
      focusedFromTarget = null;
      if (keepFocus) {
        event.preventDefault();
      }
      return keepFocus;
    }
    focusedFromTarget = null;
    if (!shouldFocusSearchFromPointer(event, config.getBackgroundTargets())) {
      return false;
    }
    const searchValue = typeof config.getSearchValue === 'function'
      ? String(config.getSearchValue() || '')
      : '';
    if (searchValue) {
      if (typeof config.dismissSearchResults === 'function') {
        config.dismissSearchResults();
      }
      return true;
    }
    if (config.focusSearch() !== false) {
      focusedFromTarget = event.target;
    }
    return true;
  };
}

export { createBackgroundFocusHandler, shouldFocusSearchFromPointer };
export type { BackgroundFocusOptions, BackgroundPointerEvent };
