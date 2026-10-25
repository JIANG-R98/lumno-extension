// Keyboard movement through search suggestions: arrow keys (and, in Labs,
// Ctrl+N / Ctrl+P on macOS), keeping the selected row in view, and the
// number shortcuts that open row N after holding (or tapping) the primary
// modifier.
import type { NavigatorLike } from '../../domain/shortcut-display';

type PrimaryModifier = 'meta' | 'ctrl';

// The keys and modifiers of a key event, or a test double.
interface NavigationKeyEvent {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

interface NumberShortcutKeyEvent extends NavigationKeyEvent {
  type?: string;
  repeat?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

interface SuggestionNavigationOptions {
  // Ctrl+N / Ctrl+P move through the list on macOS.
  macosCtrlEnabled?: boolean;
  platform?: string;
  navigatorLike?: NavigatorLike | null;
}

interface ViewportHeightOptions {
  visibleRowLimit?: number;
  itemCount?: number;
  rowHeight?: number;
  rowGap?: number;
  paddingTop?: number;
  paddingBottom?: number;
}

interface ScrollIntoViewOptions {
  direction?: 'up' | 'down' | string;
  // Space kept between the row and the list's edge.
  inset?: number;
  // The selection wrapped around the list's end.
  didWrap?: boolean;
}

// The suggestions list, which carries the number shortcut attributes.
type NumberShortcutContainer = Pick<Element, 'getAttribute' | 'setAttribute' | 'removeAttribute'>;

// A suggestion row a number opens.
interface NumberShortcutItem {
  click?(): void;
}

interface NumberShortcutOptions {
  primaryModifier?: string;
  navigatorLike?: NavigatorLike | null;
  // How long the modifier is held before the numbers show.
  holdDurationMs?: number;
  // How long the numbers stay when nothing is pressed.
  timeoutMs?: number;
  // The numbers show while the modifier is down and hide on its release.
  instantActive?: boolean | (() => boolean);
  onHoldStart?(): void;
  onHoldEnd?(): void;
}

interface NumberShortcutState {
  phase: 'holding' | 'armed' | 'active';
  primaryModifier: PrimaryModifier;
  options: NumberShortcutOptions;
  holdTimer: number;
  activeTimer: number;
}

const NUMBER_SHORTCUT_HOLD_DURATION_MS = 400;
const NUMBER_SHORTCUT_TIMEOUT_MS = 2000;
const numberShortcutStates = new WeakMap<NumberShortcutContainer, NumberShortcutState>();
// The global timers with the DOM's numeric ids.
const timers: Pick<Window, 'setTimeout' | 'clearTimeout'> = globalThis;

function getPlatformFamily(navigatorLike: NavigatorLike | null | undefined): 'mac' | 'windows' | 'other' {
  const source: NavigatorLike = navigatorLike || {};
  const candidates = [
    source.userAgentData && source.userAgentData.platform,
    source.platform,
    source.userAgent
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim().toLowerCase();
    if (!value) {
      continue;
    }
    if (/(mac|iphone|ipad|ipod)/.test(value)) {
      return 'mac';
    }
    if (/win/.test(value)) {
      return 'windows';
    }
    if (/(linux|android|cros)/.test(value)) {
      return 'other';
    }
  }
  return 'other';
}

// Suggested by @wanghanzhen in https://github.com/kubai087/lumno-extension/pull/38.
// This stays opt-in while the macOS input convention is evaluated in Labs.
function getSuggestionNavigationKey(
  event: NavigationKeyEvent | null | undefined,
  options?: SuggestionNavigationOptions | null
): 'ArrowDown' | 'ArrowUp' | '' {
  const key = String(event && event.key || '');
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    return key;
  }
  const config: SuggestionNavigationOptions = options || {};
  if (!event || config.macosCtrlEnabled !== true) {
    return '';
  }
  const platform = config.platform
    ? String(config.platform).trim().toLowerCase()
    : getPlatformFamily(config.navigatorLike);
  if (!platform.includes('mac') ||
      !event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return '';
  }
  const normalizedKey = key.trim().toLowerCase();
  const code = String(event.code || '').trim();
  if (normalizedKey === 'n' || code === 'KeyN') {
    return 'ArrowDown';
  }
  if (normalizedKey === 'p' || code === 'KeyP') {
    return 'ArrowUp';
  }
  return '';
}

// The height that shows `visibleRowLimit` rows, with a peek of the next
// gap when more rows follow.
function getVisibleRowsViewportHeight(options?: ViewportHeightOptions | null): number {
  const config: ViewportHeightOptions = options || {};
  const visibleRowLimit = Math.max(0, Math.floor(Number(config.visibleRowLimit) || 0));
  const itemCount = Math.max(0, Math.floor(Number(config.itemCount) || 0));
  const rowHeight = Math.max(0, Number(config.rowHeight) || 0);
  const rowGap = Math.max(0, Number(config.rowGap) || 0);
  const paddingTop = Math.max(0, Number(config.paddingTop) || 0);
  const paddingBottom = Math.max(0, Number(config.paddingBottom) || 0);
  const visibleRowCount = Math.min(visibleRowLimit, itemCount);
  if (visibleRowCount <= 0 || rowHeight <= 0) {
    return 0;
  }
  const hasOverflow = itemCount > visibleRowCount;
  const visibleGapCount = hasOverflow
    ? visibleRowCount
    : Math.max(0, visibleRowCount - 1);
  return paddingTop + paddingBottom +
    (visibleRowCount * rowHeight) +
    (visibleGapCount * rowGap);
}

function scrollItemIntoView(
  container: Pick<Element, 'getBoundingClientRect' | 'scrollTop' | 'scrollHeight'> | null | undefined,
  item: Pick<Element, 'getBoundingClientRect' | 'isConnected'> | null | undefined,
  options?: ScrollIntoViewOptions | null
): void {
  if (!container || !item || !item.isConnected) {
    return;
  }
  const config: ScrollIntoViewOptions = options || {};
  const direction = config.direction === 'down' ? 'down' : 'up';
  const inset = Number.isFinite(Number(config.inset)) ? Number(config.inset) : 8;

  if (config.didWrap) {
    container.scrollTop = direction === 'down'
      ? 0
      : container.scrollHeight;
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (itemRect.top < containerRect.top + inset) {
    container.scrollTop -= (containerRect.top + inset) - itemRect.top;
  } else if (itemRect.bottom > containerRect.bottom - inset) {
    container.scrollTop += itemRect.bottom - (containerRect.bottom - inset);
  }
}

function getNumberShortcutTimeoutMs(options: NumberShortcutOptions | null | undefined): number {
  const configured = Number(options && options.timeoutMs);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : NUMBER_SHORTCUT_TIMEOUT_MS;
}

function getNumberShortcutHoldDurationMs(options: NumberShortcutOptions | null | undefined): number {
  const configured = Number(options && options.holdDurationMs);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : NUMBER_SHORTCUT_HOLD_DURATION_MS;
}

function isNumberShortcutInstantActive(options: NumberShortcutOptions | null | undefined): boolean {
  const value = options && options.instantActive;
  return typeof value === 'function'
    ? Boolean(value())
    : Boolean(value);
}

function getPrimaryModifier(options: NumberShortcutOptions | null | undefined): PrimaryModifier {
  const configured = String(options && options.primaryModifier || '').toLowerCase();
  if (configured === 'meta' || configured === 'ctrl') {
    return configured;
  }
  const navigatorLike: NavigatorLike | null = options && options.navigatorLike
    ? options.navigatorLike
    : (typeof navigator !== 'undefined' ? navigator : null);
  const platform = [
    navigatorLike && navigatorLike.userAgentData
      ? navigatorLike.userAgentData.platform
      : '',
    navigatorLike ? navigatorLike.platform : '',
    navigatorLike ? navigatorLike.userAgent : ''
  ].filter(Boolean).join(' ');
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? 'meta' : 'ctrl';
}

function isPrimaryModifierKey(event: NavigationKeyEvent, primaryModifier: PrimaryModifier): boolean {
  const key = String(event && event.key || '');
  const code = String(event && event.code || '');
  return primaryModifier === 'meta'
    ? key === 'Meta' || code.indexOf('Meta') === 0
    : key === 'Control' || code.indexOf('Control') === 0;
}

function hasOnlyPrimaryModifier(event: NavigationKeyEvent, primaryModifier: PrimaryModifier): boolean {
  if (!event || event.altKey || event.shiftKey) {
    return false;
  }
  return primaryModifier === 'meta'
    ? Boolean(event.metaKey && !event.ctrlKey)
    : Boolean(event.ctrlKey && !event.metaKey);
}

function clearStateTimers(state: NumberShortcutState): void {
  if (state.holdTimer) {
    timers.clearTimeout(state.holdTimer);
    state.holdTimer = 0;
  }
  if (state.activeTimer) {
    timers.clearTimeout(state.activeTimer);
    state.activeTimer = 0;
  }
}

function invokeStateCallback(state: NumberShortcutState, name: 'onHoldStart' | 'onHoldEnd'): void {
  const callback = state.options[name];
  if (typeof callback === 'function') {
    callback();
  }
}

function removeNumberShortcutAttributes(container: NumberShortcutContainer | null | undefined): void {
  if (!container) {
    return;
  }
  container.removeAttribute('data-number-shortcuts-active');
  container.removeAttribute('data-number-shortcuts-scroll-locked');
}

function clearNumberShortcutState(
  container: NumberShortcutContainer | null | undefined,
  options?: { notifyHoldEnd?: boolean }
): void {
  if (!container) {
    return;
  }
  const config = options || {};
  const state = numberShortcutStates.get(container);
  if (state) {
    clearStateTimers(state);
    if (state.phase === 'armed' && config.notifyHoldEnd !== false) {
      invokeStateCallback(state, 'onHoldEnd');
    }
    numberShortcutStates.delete(container);
  }
  removeNumberShortcutAttributes(container);
}

function enterNumberShortcutsActive(
  container: NumberShortcutContainer | null | undefined,
  options?: NumberShortcutOptions | null,
  existingState?: NumberShortcutState
): void {
  if (!container) {
    return;
  }
  const state: NumberShortcutState = existingState || {
    phase: 'active',
    primaryModifier: getPrimaryModifier(options),
    options: options || {},
    holdTimer: 0,
    activeTimer: 0
  };
  clearStateTimers(state);
  state.phase = 'active';
  state.options = options || state.options || {};
  container.setAttribute('data-number-shortcuts-scroll-locked', 'true');
  container.setAttribute('data-number-shortcuts-active', 'true');
  // In instant mode the numbers stay until the user acts (digit / any other
  // key / Escape / blur), so no auto-dismiss timer is scheduled.
  if (!isNumberShortcutInstantActive(state.options)) {
    state.activeTimer = timers.setTimeout(function() {
      if (numberShortcutStates.get(container) !== state) {
        return;
      }
      numberShortcutStates.delete(container);
      removeNumberShortcutAttributes(container);
    }, getNumberShortcutTimeoutMs(state.options));
  }
  numberShortcutStates.set(container, state);
}

function setNumberShortcutsActive(
  container: NumberShortcutContainer | null | undefined,
  active: boolean,
  options?: NumberShortcutOptions | null
): void {
  if (!container) {
    return;
  }
  if (active) {
    clearNumberShortcutState(container);
    enterNumberShortcutsActive(container, options);
    return;
  }
  clearNumberShortcutState(container);
}

function cancelNumberShortcuts(container: NumberShortcutContainer | null | undefined): void {
  setNumberShortcutsActive(container, false);
}

function isNumberShortcutsActive(container: NumberShortcutContainer | null | undefined): boolean {
  return Boolean(
    container &&
    container.getAttribute('data-number-shortcuts-active') === 'true'
  );
}

function consumeNumberShortcutEvent(event: NumberShortcutKeyEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function beginNumberShortcutHold(
  container: NumberShortcutContainer,
  options: NumberShortcutOptions | null | undefined,
  primaryModifier: PrimaryModifier
): void {
  const state: NumberShortcutState = {
    phase: 'holding',
    primaryModifier,
    options: options || {},
    holdTimer: 0,
    activeTimer: 0
  };
  state.holdTimer = timers.setTimeout(function() {
    if (numberShortcutStates.get(container) !== state || state.phase !== 'holding') {
      return;
    }
    state.holdTimer = 0;
    state.phase = 'armed';
    container.setAttribute('data-number-shortcuts-scroll-locked', 'true');
    invokeStateCallback(state, 'onHoldStart');
  }, getNumberShortcutHoldDurationMs(options));
  numberShortcutStates.set(container, state);
}

// Handles a key event for the number shortcuts; true when it opened a row
// or closed the numbers and was consumed.
function handleNumberShortcutKeyEvent(
  event: NumberShortcutKeyEvent | null | undefined,
  items: ReadonlyArray<NumberShortcutItem | null | undefined> | null | undefined,
  container: NumberShortcutContainer | null | undefined,
  options?: NumberShortcutOptions | null
): boolean {
  const rows: ReadonlyArray<NumberShortcutItem | null | undefined> = Array.isArray(items) ? items : [];
  if (!event || !container) {
    return false;
  }
  const eventType = String(event.type || 'keydown');
  const configuredPrimaryModifier = getPrimaryModifier(options);
  let state = numberShortcutStates.get(container);
  const primaryModifier = state ? state.primaryModifier : configuredPrimaryModifier;
  const isPrimaryKey = isPrimaryModifierKey(event, primaryModifier);

  if (eventType === 'keyup') {
    if (!state || !isPrimaryKey) {
      return false;
    }
    if (state.phase === 'holding') {
      clearNumberShortcutState(container, { notifyHoldEnd: false });
      return false;
    }
    if (state.phase === 'active' && isNumberShortcutInstantActive(state.options)) {
      // Instant mode: releasing the primary modifier dismisses the numbers.
      clearNumberShortcutState(container);
      return false;
    }
    if (state.phase !== 'armed') {
      return false;
    }
    if (rows.length === 0) {
      clearNumberShortcutState(container);
      return false;
    }
    invokeStateCallback(state, 'onHoldEnd');
    enterNumberShortcutsActive(container, state.options, state);
    consumeNumberShortcutEvent(event);
    return true;
  }

  if (eventType !== 'keydown') {
    return false;
  }

  if (isPrimaryKey && hasOnlyPrimaryModifier(event, primaryModifier)) {
    if (rows.length === 0) {
      clearNumberShortcutState(container);
      return false;
    }
    if (state && (state.phase === 'holding' || state.phase === 'armed' || state.phase === 'active')) {
      return false;
    }
    clearNumberShortcutState(container);
    if (!event.repeat) {
      if (isNumberShortcutInstantActive(options)) {
        enterNumberShortcutsActive(container, options);
      } else {
        beginNumberShortcutHold(container, options, primaryModifier);
      }
    }
    return false;
  }

  state = numberShortcutStates.get(container);
  if (state && (state.phase === 'holding' || state.phase === 'armed')) {
    clearNumberShortcutState(container);
    return false;
  }
  if (!state || state.phase !== 'active' || !isNumberShortcutsActive(container)) {
    return false;
  }
  const key = String(event.key || '');
  if (key === 'Escape') {
    cancelNumberShortcuts(container);
    consumeNumberShortcutEvent(event);
    return true;
  }
  // In instant mode the digit is pressed while the primary modifier is still
  // held, so the modifier keys are allowed there; otherwise digits must be plain.
  const instantActive = isNumberShortcutInstantActive(state.options);
  const plainNumber = /^[0-9]$/.test(key) && (instantActive
    ? !event.altKey && !event.shiftKey
    : !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey);
  if (!plainNumber) {
    cancelNumberShortcuts(container);
    return false;
  }
  const item = rows[Number(key)];
  cancelNumberShortcuts(container);
  consumeNumberShortcutEvent(event);
  if (!event.repeat && item && typeof item.click === 'function') {
    item.click();
  }
  return true;
}

function preventNumberShortcutWheel(
  event: Pick<Event, 'preventDefault'> | null | undefined,
  container: NumberShortcutContainer | null | undefined
): boolean {
  if (!event || !container ||
      container.getAttribute('data-number-shortcuts-scroll-locked') !== 'true') {
    return false;
  }
  event.preventDefault();
  return true;
}

export type {
  NavigationKeyEvent,
  NumberShortcutContainer,
  NumberShortcutItem,
  NumberShortcutKeyEvent,
  NumberShortcutOptions,
  ScrollIntoViewOptions,
  SuggestionNavigationOptions,
  ViewportHeightOptions
};
export {
  getSuggestionNavigationKey,
  getVisibleRowsViewportHeight,
  scrollItemIntoView,
  handleNumberShortcutKeyEvent,
  setNumberShortcutsActive,
  cancelNumberShortcuts,
  preventNumberShortcutWheel
};
