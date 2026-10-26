// What a key pressed in the open mode menu does: close it, edit its
// filter, move between items or choose one.
type MenuKeyAction = 'escape' | 'erase' | 'move' | 'edge' | 'select' | 'filter';

const MENU_ARROW_KEYS = new Set(['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']);

function hasCommandModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

// A letter, digit or space typed straight into the menu's filter.
function isFilterKey(event: KeyboardEvent): boolean {
  return !event.isComposing && !event.repeat && !hasCommandModifier(event) &&
    typeof event.key === 'string' && event.key.length === 1 &&
    /^[\p{L}\p{N}\s]$/u.test(event.key);
}

function readMenuKeyAction(event: KeyboardEvent, currentIndex: number): MenuKeyAction | null {
  const key = event.key;
  if (key === 'Escape') {
    return 'escape';
  }
  if (key === 'Backspace') {
    return hasCommandModifier(event) ? null : 'erase';
  }
  if (MENU_ARROW_KEYS.has(key)) {
    return 'move';
  }
  if (key === 'Home' || key === 'End') {
    return 'edge';
  }
  if ((key === 'Enter' || key === ' ') && currentIndex >= 0) {
    return 'select';
  }
  return isFilterKey(event) ? 'filter' : null;
}

export type { MenuKeyAction };
export { readMenuKeyAction };
