// Focus in the open mode menu: the panel itself (where typing filters it),
// its tiles with roving Tab focus and scrolling into view, or the input.
import { queryHtmlElements } from '../../../dom-lookup';
import type { ModeMenuDrawing } from './drawing';
import type { ModeMenuState } from './state';

interface ModeMenuFocusParts {
  menu: HTMLElement;
  content: HTMLElement;
  input: HTMLInputElement;
  doc: Document;
  win: Partial<Pick<Window, 'matchMedia'>>;
}

// Space kept above and below a focused tile when it scrolls into view,
// leaving room for its group title and the footer.
const SCROLL_TOP_CONTEXT = 44;
const SCROLL_BOTTOM_CONTEXT = 16;

function isNode(value: EventTarget | null | undefined): value is Node {
  return value !== null && value !== undefined && 'nodeType' in value && typeof value.nodeType === 'number';
}

// A document (nodeType 9) or a shadow root (nodeType 11) has an active element.
function isDocumentOrShadowRoot(node: Node): node is Node & DocumentOrShadowRoot {
  return node.nodeType === 9 || node.nodeType === 11;
}

function prefersReducedMotion(win: ModeMenuFocusParts['win']): boolean {
  return typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollIntoContent(parts: ModeMenuFocusParts, button: HTMLElement, smoothRequested: boolean): void {
  const content = parts.content;
  const buttonRect = button.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const topBoundary = contentRect.top + SCROLL_TOP_CONTEXT;
  const bottomBoundary = contentRect.bottom - SCROLL_BOTTOM_CONTEXT;
  let scrollDelta = 0;
  if (buttonRect.top < topBoundary) {
    scrollDelta = buttonRect.top - topBoundary;
  } else if (buttonRect.bottom > bottomBoundary) {
    scrollDelta = buttonRect.bottom - bottomBoundary;
  }
  if (scrollDelta === 0) {
    return;
  }
  const targetScrollTop = Math.max(0, (Number(content.scrollTop) || 0) + scrollDelta);
  if (smoothRequested && !prefersReducedMotion(parts.win) && typeof content.scrollTo === 'function') {
    content.scrollTo({ behavior: 'smooth', top: targetScrollTop });
  } else {
    content.scrollTop = targetScrollTop;
  }
}

class ModeMenuFocus {
  private readonly parts: ModeMenuFocusParts;
  private readonly state: ModeMenuState;
  private readonly drawing: ModeMenuDrawing;

  constructor(parts: ModeMenuFocusParts, state: ModeMenuState, drawing: ModeMenuDrawing) {
    this.parts = parts;
    this.state = state;
    this.drawing = drawing;
  }

  // The tiles the filter leaves shown, in order.
  buttons(): HTMLElement[] {
    return Array.from(queryHtmlElements(this.parts.menu, '[role="menuitemradio"]')).filter((button) => !button.hidden);
  }

  // The focused element of the menu's root: its shadow root, or the document.
  activeElement(): Element | null {
    const rootNode = this.parts.menu.getRootNode();
    return isDocumentOrShadowRoot(rootNode) && rootNode.activeElement
      ? rootNode.activeElement
      : this.parts.doc.activeElement;
  }

  hasFocusInMenu(): boolean {
    const activeElement = this.activeElement();
    return activeElement === this.parts.menu || this.parts.menu.contains(activeElement);
  }

  // Whether a key event belongs to the open menu: focus or the target is in it.
  ownsKeyEvent(event: { target?: EventTarget | null } | null | undefined): boolean {
    if (this.state.destroyed || !this.state.open) {
      return false;
    }
    const menu = this.parts.menu;
    const eventTarget = event ? event.target : null;
    return this.hasFocusInMenu() || eventTarget === menu || (isNode(eventTarget) && menu.contains(eventTarget));
  }

  setSearchActive(active: boolean): void {
    if (this.state.searchActive !== active) {
      this.state.searchActive = active;
      this.drawing.draw();
    }
  }

  // Focuses the panel itself, where typing filters it.
  focusSearch(): boolean {
    if (this.state.destroyed || !this.state.open) {
      return false;
    }
    this.state.focusId = '';
    this.state.searchActive = true;
    this.drawing.draw();
    this.parts.menu.focus({ preventScroll: true });
    return true;
  }

  focusInput(): boolean {
    if (this.state.destroyed) {
      return false;
    }
    this.setSearchActive(false);
    this.parts.input.focus({ preventScroll: true });
    return true;
  }

  // Focuses the shown tile at the index, wrapping around.
  focusButton(index: number, focusOptions?: { smoothScroll?: boolean }): boolean {
    const buttons = this.buttons();
    if (buttons.length === 0) {
      return false;
    }
    const button = buttons[((index % buttons.length) + buttons.length) % buttons.length];
    this.state.focusId = button.dataset.modeId || '';
    this.state.searchActive = true;
    this.drawing.draw();
    button.focus({ preventScroll: true });
    scrollIntoContent(this.parts, button, Boolean(focusOptions && focusOptions.smoothScroll));
    return true;
  }

  // Focuses the tile of the mode; false when it is not shown.
  focusMode(modeId: string): boolean {
    const index = this.buttons().findIndex((button) => String(button.dataset.modeId || '') === modeId);
    return index >= 0 && this.focusButton(index);
  }

  // The first match while the filter narrows the tiles, else the panel.
  focusFirstFilterResult(): boolean {
    if (this.drawing.isFiltered() && this.focusButton(0)) {
      return true;
    }
    return this.focusSearch();
  }
}

export type { ModeMenuFocusParts };
export { ModeMenuFocus };
