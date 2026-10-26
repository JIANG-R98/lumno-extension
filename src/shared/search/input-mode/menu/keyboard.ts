// What a key pressed in the open mode menu does: close it, edit its
// filter, move between items or choose one.
import { findModeMenuEntry } from './state';
import type { ModeMenuState } from './state';
import type { ModeMenuFocus } from './focus';
import { getDirectionalIndex } from './rows';
import type { ModeMenuItem } from '../types';

// The parts of a key event Tab handling reads.
interface TabKeyEvent {
  key?: string;
  defaultPrevented?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  preventDefault?(): void;
}

// The menu as its keys act on it.
interface MenuKeyTarget {
  readonly state: ModeMenuState;
  readonly focus: ModeMenuFocus;
  applyFilter(query: unknown): number;
  close(restoreFocus?: boolean): boolean;
  select(item: ModeMenuItem, selectionOptions?: { focusAfterSelect?: 'input' | 'panel' } | null): void;
}

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

// Tab with no modifier that nothing handled yet.
function isPlainTabKey<Event extends TabKeyEvent>(event: Event | null | undefined): event is Event {
  return Boolean(event) && event?.key === 'Tab' && !event.defaultPrevented &&
    !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
}

const MENU_KEY_ACTIONS: Record<MenuKeyAction, (
  menu: MenuKeyTarget,
  event: KeyboardEvent,
  buttons: HTMLElement[],
  currentIndex: number
) => void> = {
  escape(menu) {
    if (menu.state.filterQuery) {
      menu.applyFilter('');
      menu.focus.focusSearch();
    } else {
      menu.close(true);
    }
  },
  erase(menu) {
    const queryCharacters = Array.from(menu.state.filterQuery);
    queryCharacters.pop();
    menu.applyFilter(queryCharacters.join(''));
    menu.focus.focusFirstFilterResult();
  },
  move(menu, event, buttons, currentIndex) {
    menu.focus.focusButton(getDirectionalIndex(buttons, currentIndex, event.key), { smoothScroll: true });
  },
  edge(menu, event, buttons) {
    menu.focus.focusButton(event.key === 'Home' ? 0 : buttons.length - 1);
  },
  select(menu, _event, buttons, currentIndex) {
    const entry = findModeMenuEntry(menu.state.entries, buttons[currentIndex].dataset.modeId || '');
    if (entry) {
      menu.select(entry.item, { focusAfterSelect: 'panel' });
    }
  },
  filter(menu, event) {
    menu.applyFilter(menu.state.filterQuery + event.key);
    menu.focus.focusFirstFilterResult();
  }
};

// Handles a key pressed in the menu (other than Tab); true when it acted.
function handleModeMenuKeydown(menu: MenuKeyTarget, event: KeyboardEvent): boolean {
  const buttons = menu.focus.buttons();
  const activeElement = menu.focus.activeElement();
  const currentIndex = buttons.findIndex((button) => button === activeElement);
  const action = readMenuKeyAction(event, currentIndex);
  if (!action) {
    return false;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  MENU_KEY_ACTIONS[action](menu, event, buttons, currentIndex);
  return true;
}

export type { MenuKeyTarget, TabKeyEvent };
export { handleModeMenuKeydown, isPlainTabKey };
