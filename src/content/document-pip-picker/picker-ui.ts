// The picking overlay: its highlight and the element it points at.
import { getDefaultStackIndex, getElementFromPoint, getElementStack } from './candidates';
import { HIGHLIGHT_ID, PICKER_HIGHLIGHT_PADDING, PICKER_Z_INDEX, ROOT_ID } from './constants';
import { applyNoTranslate } from './locale';
import { state } from './state';
import { getPickerTheme } from './theme';
import type { VisualTheme } from './types';

// Returns the highlight box, adding the picker's layer when it is missing.
function ensurePickerUi(): HTMLDivElement {
  if (state.root && state.root.isConnected && state.highlight) {
    return state.highlight;
  }
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('aria-hidden', 'true');
  applyNoTranslate(root);
  root.style.cssText = [
    'position: fixed',
    'inset: 0',
    'pointer-events: none',
    `z-index: ${PICKER_Z_INDEX}`,
    'font-family: "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ].join(';');

  const highlight = document.createElement('div');
  highlight.id = HIGHLIGHT_ID;
  applyNoTranslate(highlight);
  highlight.style.cssText = [
    'position: fixed',
    'left: 0',
    'top: 0',
    'width: 0',
    'height: 0',
    'border: 3px dashed rgba(37, 99, 235, 0.72)',
    'border-radius: 10px',
    'background: rgba(37, 99, 235, 0.10)',
    'box-shadow: 0 0 0 1px rgba(255,255,255,0.55), 0 20px 60px rgba(15, 23, 42, 0.18)',
    'transform: translate3d(0, 0, 0)',
    'transition: width 80ms ease, height 80ms ease, transform 80ms ease, opacity 80ms ease',
    'opacity: 0'
  ].join(';');

  root.appendChild(highlight);
  document.documentElement.appendChild(root);

  state.root = root;
  state.highlight = highlight;
  return highlight;
}

function applyPickerTheme(resolvedTheme: VisualTheme): void {
  state.currentTheme = resolvedTheme;
  if (state.highlight) {
    state.highlight.style.borderColor = resolvedTheme.highlightBorder;
    state.highlight.style.borderStyle = 'dashed';
    state.highlight.style.background = resolvedTheme.highlightBackground;
    state.highlight.style.boxShadow = resolvedTheme.highlightShadow;
  }
  if (state.toastElement) {
    if (resolvedTheme.isDark) {
      state.toastElement.setAttribute('data-theme', 'dark');
    } else {
      state.toastElement.removeAttribute('data-theme');
    }
  }
}

function setHighlight(element: Element | null): void {
  const highlight = ensurePickerUi();
  applyPickerTheme(getPickerTheme(element));
  if (!element) {
    highlight.style.opacity = '0';
    return;
  }
  const rect = element.getBoundingClientRect();
  const viewportWidth = Math.max(1, Number(window.innerWidth || document.documentElement.clientWidth || 0));
  const viewportHeight = Math.max(1, Number(window.innerHeight || document.documentElement.clientHeight || 0));
  const left = Math.max(0, Math.round(rect.left) - PICKER_HIGHLIGHT_PADDING);
  const top = Math.max(0, Math.round(rect.top) - PICKER_HIGHLIGHT_PADDING);
  const right = Math.min(viewportWidth, Math.round(rect.right) + PICKER_HIGHLIGHT_PADDING);
  const bottom = Math.min(viewportHeight, Math.round(rect.bottom) + PICKER_HIGHLIGHT_PADDING);
  highlight.style.opacity = '1';
  highlight.style.width = `${Math.max(0, right - left)}px`;
  highlight.style.height = `${Math.max(0, bottom - top)}px`;
  highlight.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}


function selectTargetFromStack(index: number): void {
  const nextIndex = Math.max(0, Math.min(index, state.currentStack.length - 1));
  state.currentStackIndex = nextIndex;
  state.currentTarget = state.currentStack[nextIndex] || null;
  setHighlight(state.currentTarget);
}

function updateCurrentTargetFromPointer(event: MouseEvent): void {
  const element = getElementFromPoint(event);
  if (!element) {
    state.currentStack = [];
    state.currentStackIndex = 0;
    state.currentTarget = null;
    setHighlight(null);
    return;
  }
  const stack = getElementStack(element);
  if (!stack.length) {
    state.currentStack = [];
    state.currentStackIndex = 0;
    state.currentTarget = null;
    setHighlight(null);
    return;
  }
  const previous = state.currentTarget;
  state.currentStack = stack;
  let nextIndex = 0;
  if (previous) {
    const matchedIndex = stack.indexOf(previous);
    if (matchedIndex >= 0) {
      nextIndex = matchedIndex;
    } else {
      nextIndex = getDefaultStackIndex(stack);
    }
  } else {
    nextIndex = getDefaultStackIndex(stack);
  }
  selectTargetFromStack(nextIndex);
}

export {
  applyPickerTheme,
  ensurePickerUi,
  selectTargetFromStack,
  setHighlight,
  updateCurrentTargetFromPointer
};
