// Moving through the mode menu: its buttons, focus between the search
// field and items, scrolling, rows and arrow-key directions, and selecting.
import type { ModeMenuItem } from './types';
import { queryHtmlElements } from '../../dom-lookup';

// The controller state search-input-mode.ts shares with its modules.
interface ModeMenuNavigationState {
  destroyed: boolean;
  modeMenuOpen: boolean;
  modeMenuContent: HTMLElement;
  modeMenuFilterQuery: string;
}

interface ModeMenuNavigationConfig {
  // May return a promise; focus moves once it settles.
  onModeMenuSelect?(item: ModeMenuItem): unknown;
}

interface ModeMenuNavigationDeps {
  modeMenu: HTMLElement;
  doc: Document;
  input: HTMLInputElement;
  DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT: number;
  DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT: number;
  win: Partial<Pick<Window, 'matchMedia'>>;
  normalizeModeMenuSearchText: (value: unknown) => string;
  config: ModeMenuNavigationConfig;
  refreshModeMenu: (selectedModeId?: string) => void;
  inputModeState: ModeMenuNavigationState;
}

// Where a menu button sits, for moving by rows and columns.
interface ButtonLayout {
  bottom: number;
  centerX: number;
  centerY: number;
  height: number;
  index: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface ButtonRow {
  averageHeight: number;
  centerY: number;
  items: ButtonLayout[];
}

interface ModeMenuSelectOptions {
  // Where focus goes after selecting: the input, or the item in the panel.
  focusAfterSelect?: 'input' | 'panel';
}

function isNode(value: EventTarget | null | undefined): value is Node {
  return value !== null && value !== undefined && 'nodeType' in value && typeof value.nodeType === 'number';
}

// A document (nodeType 9) or a shadow root (nodeType 11) has an active element.
function isDocumentOrShadowRoot(node: Node): node is Node & DocumentOrShadowRoot {
  return node.nodeType === 9 || node.nodeType === 11;
}

function createModeMenuNavigation(deps: ModeMenuNavigationDeps) {
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

  function getAllModeMenuButtons(): HTMLElement[] {
    return Array.from(queryHtmlElements(modeMenu, '[role="menuitemradio"]'));
  }

  function getModeMenuButtons(): HTMLElement[] {
    return getAllModeMenuButtons().filter((button) => !button.hidden);
  }

  // The focused element of the menu's root: its shadow root, or the document.
  function getModeMenuActiveElement(): Element | null {
    const rootNode = modeMenu.getRootNode();
    return isDocumentOrShadowRoot(rootNode) && rootNode.activeElement
      ? rootNode.activeElement
      : doc.activeElement;
  }

  function setModeMenuSearchActive(active: boolean): void {
    modeMenu.setAttribute('data-search-active', active ? 'true' : 'false');
  }

  function focusModeMenuSearch(): boolean {
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

  function focusModeInput(): boolean {
    if (inputModeState.destroyed) {
      return false;
    }
    setModeMenuSearchActive(false);
    input.focus({ preventScroll: true });
    return true;
  }

  // Whether a key event belongs to the open menu: focus or the target is in it.
  function shouldHandleModeMenuKeyEvent(event: { target?: EventTarget | null } | null | undefined): boolean {
    if (inputModeState.destroyed || !inputModeState.modeMenuOpen || modeMenu.hidden) {
      return false;
    }
    const activeElement = getModeMenuActiveElement();
    const eventTarget = event ? event.target : null;
    return Boolean(
      activeElement === modeMenu || modeMenu.contains(activeElement) ||
      eventTarget === modeMenu || (isNode(eventTarget) && modeMenu.contains(eventTarget))
    );
  }

  function scrollModeMenuButtonIntoView(button: HTMLElement, scrollOptions?: { smooth?: boolean }): void {
    if (!inputModeState.modeMenuContent) {
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

  function focusModeMenuButton(index: number, focusOptions?: { smoothScroll?: boolean }): boolean {
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

  function focusFirstModeMenuFilterResult(): boolean {
    const hasFilterQuery = Boolean(
      normalizeModeMenuSearchText(inputModeState.modeMenuFilterQuery)
    );
    if (hasFilterQuery && focusModeMenuButton(0)) {
      return true;
    }
    return focusModeMenuSearch();
  }

  function getModeMenuButtonLayout(button: HTMLElement, index: number): ButtonLayout {
    const rect = button.getBoundingClientRect();
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

  // The buttons grouped into rows by their vertical centers; null before layout.
  function getModeMenuButtonRows(buttons: HTMLElement[]): ButtonRow[] | null {
    const layouts = buttons.map(getModeMenuButtonLayout);
    const hasMeasuredLayout = layouts.some((layout) => (
      layout.width > 0 && layout.height > 0
    ));
    if (!hasMeasuredLayout) {
      return null;
    }
    const rows: ButtonRow[] = [];
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

  // The button an arrow key moves to: along the row, or to the nearest
  // button of the next row.
  function getModeMenuDirectionalIndex(buttons: HTMLElement[], currentIndex: number, key: string): number {
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
    let closest: ButtonLayout | null = null;
    for (const candidate of targetRow.items) {
      if (!closest || Math.abs(candidate.centerX - currentItem.centerX) < Math.abs(closest.centerX - currentItem.centerX)) {
        closest = candidate;
      }
    }
    return closest ? closest.index : currentIndex;
  }

  function syncModeMenuSelection(modeId: string): boolean {
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

  function selectModeMenuItem(item: ModeMenuItem, selectionOptions?: ModeMenuSelectOptions | null): void {
    const selectOptions: ModeMenuSelectOptions = selectionOptions || {};
    const focusAfterSelect = selectOptions.focusAfterSelect === 'panel'
      ? 'panel'
      : 'input';
    let result: unknown = null;
    if (typeof config.onModeMenuSelect === 'function') {
      result = config.onModeMenuSelect(item);
    }
    const syncSelectedMode = (): void => {
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
    if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
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

type ModeMenuNavigationApi = ReturnType<typeof createModeMenuNavigation>;

export { createModeMenuNavigation };
export type {
  ModeMenuNavigationApi,
  ModeMenuNavigationConfig,
  ModeMenuNavigationDeps,
  ModeMenuNavigationState,
  ModeMenuSelectOptions
};
