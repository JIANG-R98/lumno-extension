// The host elements the toolbar and its toast live in, kept apart from the
// page's styles.
import { HOST_ISOLATION_STYLES } from './constants';
import { state } from './state';

function clearTimers(): void {
  if (state.showTimer) {
    window.clearTimeout(state.showTimer);
    state.showTimer = null;
  }
  if (state.dismissTimer) {
    window.clearTimeout(state.dismissTimer);
    state.dismissTimer = null;
  }
  clearSelectionActionHideTimer();
  if (state.selectionChangeTimer) {
    window.clearTimeout(state.selectionChangeTimer);
    state.selectionChangeTimer = null;
  }
}

function clearSelectionActionHideTimer(): void {
  if (!state.selectionActionHideTimer) {
    return;
  }
  window.clearTimeout(state.selectionActionHideTimer);
  state.selectionActionHideTimer = null;
}

function applyHostIsolationStyles(host: HTMLElement): void {
  Object.entries(HOST_ISOLATION_STYLES).forEach(([property, value]) => {
    host.style.setProperty(property, value, 'important');
  });
}

function setHostHidden(host: HTMLElement, hidden: boolean): void {
  applyHostIsolationStyles(host);
  host.hidden = hidden;
  host.style.setProperty('display', hidden ? 'none' : 'block', 'important');
}

function setHostPosition(host: HTMLElement, left: number, top: number): void {
  state.hostHorizontalAnchor = 'left';
  host.style.setProperty('left', `${Math.round(left)}px`, 'important');
  host.style.setProperty('right', 'auto', 'important');
  host.style.setProperty('top', `${Math.round(top)}px`, 'important');
}

function setHostRightPosition(host: HTMLElement, right: number, top: number): void {
  state.hostHorizontalAnchor = 'right';
  host.style.setProperty('left', 'auto', 'important');
  host.style.setProperty('right', `${Math.round(right)}px`, 'important');
  host.style.setProperty('top', `${Math.round(top)}px`, 'important');
}

function setHostColorScheme(host: HTMLElement, value: string): void {
  host.style.setProperty('color-scheme', value, 'important');
}

function applyNoTranslate<T extends Element>(element: T): T {
  element.setAttribute('translate', 'no');
  element.setAttribute('lang', 'zxx');
  element.setAttribute('notranslate', '');
  element.setAttribute('data-no-translate', 'true');
  element.classList.add('notranslate');
  return element;
}

function applyNoTranslateDeep<T extends Element>(root: T): T {
  applyNoTranslate(root);
  root.querySelectorAll('*').forEach((element) => applyNoTranslate(element));
  return root;
}

export {
  applyNoTranslate,
  applyNoTranslateDeep,
  applyHostIsolationStyles,
  clearSelectionActionHideTimer,
  clearTimers,
  setHostColorScheme,
  setHostHidden,
  setHostPosition,
  setHostRightPosition
};
