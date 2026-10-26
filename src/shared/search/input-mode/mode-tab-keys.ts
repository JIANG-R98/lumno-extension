// Tab and Backspace on the mode: confirming tag removal, the double Tab
// that opens the menu, and when Tab toggles focus or opens it.

// The parts of a keydown event these keys read.
interface ModeKeyEvent {
  key?: string;
  defaultPrevented?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  preventDefault?: () => void;
}

// The window whose timers time the double Tab and the removal confirmation.
interface TimerWindow {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number): void;
}

interface ModeTabKeysConfig {
  modeMenuDoubleTabDuration?: number;
  modeTagRemovalConfirmationDuration?: number;
  onModeTagRemovalConfirmation?: (details: { duration: number }) => void;
  onModeTagRemovalConfirmationReset?: () => void;
}

// The controller state search-input-mode.ts shares with its modules.
interface ModeTabKeysState {
  destroyed: boolean;
  modeMenuOpen: boolean;
  modeMenuPending: boolean;
}

interface ModeTabKeysDeps {
  win: TimerWindow | null | undefined;
  config: ModeTabKeysConfig;
  input: HTMLInputElement;
  siteSearchPrefix: HTMLElement;
  modeMenu: HTMLElement;
  DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION: number;
  DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION: number;
  getModeMenuActiveElement: () => Element | null;
  focusModeInput: () => void;
  focusModeMenuSearch: () => void;
  inputModeState: ModeTabKeysState;
}

interface ModeTabKeysContext {
  readonly win: ModeTabKeysDeps['win'];
  readonly config: ModeTabKeysDeps['config'];
  readonly input: ModeTabKeysDeps['input'];
  readonly siteSearchPrefix: ModeTabKeysDeps['siteSearchPrefix'];
  readonly DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION: ModeTabKeysDeps['DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION'];
  readonly getModeMenuActiveElement: ModeTabKeysDeps['getModeMenuActiveElement'];
  readonly modeMenu: ModeTabKeysDeps['modeMenu'];
  readonly focusModeInput: ModeTabKeysDeps['focusModeInput'];
  readonly focusModeMenuSearch: ModeTabKeysDeps['focusModeMenuSearch'];
  readonly DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION: ModeTabKeysDeps['DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION'];
  readonly inputModeState: ModeTabKeysDeps['inputModeState'];
  modeMenuDoubleTabPending: boolean;
  modeMenuDoubleTabTimer: number;
  modeTagRemovalConfirmationPending: boolean;
  modeTagRemovalConfirmationTimer: number;
}

function resetModeTagRemovalConfirmation(ctx: ModeTabKeysContext): boolean {
  const wasPending = ctx.modeTagRemovalConfirmationPending;
  if (ctx.modeTagRemovalConfirmationTimer && ctx.win &&
      typeof ctx.win.clearTimeout === 'function') {
    ctx.win.clearTimeout(ctx.modeTagRemovalConfirmationTimer);
  }
  ctx.modeTagRemovalConfirmationTimer = 0;
  ctx.modeTagRemovalConfirmationPending = false;
  if (wasPending &&
      typeof ctx.config.onModeTagRemovalConfirmationReset === 'function') {
    ctx.config.onModeTagRemovalConfirmationReset();
  }
  return wasPending;
}

function resetModeMenuDoubleTab(ctx: ModeTabKeysContext): boolean {
  const wasPending = ctx.modeMenuDoubleTabPending;
  if (ctx.modeMenuDoubleTabTimer && ctx.win &&
      typeof ctx.win.clearTimeout === 'function') {
    ctx.win.clearTimeout(ctx.modeMenuDoubleTabTimer);
  }
  ctx.modeMenuDoubleTabTimer = 0;
  ctx.modeMenuDoubleTabPending = false;
  return wasPending;
}

function hasModifier(event: ModeKeyEvent): boolean {
  return Boolean(event.shiftKey || event.metaKey || event.ctrlKey || event.altKey);
}

function isPlainTab(event: ModeKeyEvent | null | undefined): event is ModeKeyEvent {
  return Boolean(event) && event?.key === 'Tab' && !event.defaultPrevented;
}

function preventKeyDefault(event: ModeKeyEvent): void {
  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
}

// Whether the double Tab cannot open the menu: a modifier is held, the
// input has text, or the menu is already open or opening.
function blocksDoubleTab(ctx: ModeTabKeysContext, event: ModeKeyEvent): boolean {
  return hasModifier(event) || String(ctx.input.value || '') !== '' ||
    ctx.inputModeState.modeMenuOpen || ctx.inputModeState.modeMenuPending;
}

// The first Tab of a double Tab waits for the second this long.
function armModeMenuDoubleTab(ctx: ModeTabKeysContext): void {
  ctx.modeMenuDoubleTabPending = true;
  const configuredDuration = Number(ctx.config.modeMenuDoubleTabDuration);
  const duration = Number.isFinite(configuredDuration)
    ? Math.max(0, configuredDuration)
    : ctx.DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION;
  if (ctx.win && typeof ctx.win.setTimeout === 'function' && duration > 0) {
    ctx.modeMenuDoubleTabTimer = ctx.win.setTimeout(() => {
      ctx.modeMenuDoubleTabTimer = 0;
      resetModeMenuDoubleTab(ctx);
    }, duration);
  }
}

function shouldOpenModeMenuOnDoubleTab(ctx: ModeTabKeysContext, event: ModeKeyEvent | null | undefined): boolean {
  if (ctx.inputModeState.destroyed || !isPlainTab(event)) {
    return false;
  }
  const hasModeTag = Boolean(String(ctx.siteSearchPrefix.getAttribute('data-mode-id') || ''));
  if (blocksDoubleTab(ctx, event) || hasModeTag) {
    resetModeMenuDoubleTab(ctx);
    return false;
  }
  if (event.repeat) {
    if (ctx.modeMenuDoubleTabPending) {
      preventKeyDefault(event);
    }
    return false;
  }
  preventKeyDefault(event);
  if (ctx.modeMenuDoubleTabPending) {
    resetModeMenuDoubleTab(ctx);
    return true;
  }
  armModeMenuDoubleTab(ctx);
  return false;
}

function shouldCompleteModeMenuDoubleTab(ctx: ModeTabKeysContext, event: ModeKeyEvent | null | undefined): boolean {
  if (ctx.inputModeState.destroyed || !ctx.modeMenuDoubleTabPending || !isPlainTab(event)) {
    return false;
  }
  if (blocksDoubleTab(ctx, event)) {
    resetModeMenuDoubleTab(ctx);
    return false;
  }
  preventKeyDefault(event);
  if (event.repeat) {
    return false;
  }
  resetModeMenuDoubleTab(ctx);
  return true;
}

function handleModeMenuTabFocusToggle(ctx: ModeTabKeysContext, event: ModeKeyEvent | null | undefined): boolean {
  if (ctx.inputModeState.destroyed || !event || event.key !== 'Tab' || event.defaultPrevented ||
      (!ctx.inputModeState.modeMenuOpen && !ctx.inputModeState.modeMenuPending)) {
    return false;
  }
  const hasModifier = Boolean(
    event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
  );
  if (hasModifier) {
    return false;
  }
  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  resetModeMenuDoubleTab(ctx);
  const activeElement = ctx.getModeMenuActiveElement();
  const focusIsInModeMenu = activeElement === ctx.modeMenu ||
    ctx.modeMenu.contains(activeElement);
  if (focusIsInModeMenu) {
    ctx.focusModeInput();
  } else {
    ctx.focusModeMenuSearch();
  }
  return true;
}

function shouldOpenModeMenuForActiveModeOnTab(ctx: ModeTabKeysContext, event: ModeKeyEvent | null | undefined): boolean {
  if (ctx.inputModeState.destroyed || !event || event.key !== 'Tab' || event.defaultPrevented) {
    return false;
  }
  const hasModifier = Boolean(
    event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
  );
  const hasModeTag = Boolean(
    String(ctx.siteSearchPrefix.getAttribute('data-mode-id') || '')
  );
  if (hasModifier || event.repeat ||
      ctx.inputModeState.modeMenuOpen || ctx.inputModeState.modeMenuPending) {
    resetModeMenuDoubleTab(ctx);
    return false;
  }
  if (!hasModeTag) {
    return false;
  }
  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  resetModeMenuDoubleTab(ctx);
  return true;
}

function shouldRemoveModeTagOnBackspace(ctx: ModeTabKeysContext, event?: ModeKeyEvent | null): boolean {
  if (ctx.inputModeState.destroyed || String(ctx.input.value || '') !== '') {
    resetModeTagRemovalConfirmation(ctx);
    return false;
  }
  if (!ctx.inputModeState.modeMenuOpen) {
    resetModeTagRemovalConfirmation(ctx);
    return true;
  }
  if (event && event.repeat) {
    return false;
  }
  if (ctx.modeTagRemovalConfirmationPending) {
    resetModeTagRemovalConfirmation(ctx);
    return true;
  }
  ctx.modeTagRemovalConfirmationPending = true;
  const configuredDuration = Number(
    ctx.config.modeTagRemovalConfirmationDuration
  );
  const duration = Number.isFinite(configuredDuration)
    ? Math.max(0, configuredDuration)
    : ctx.DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION;
  if (ctx.win && typeof ctx.win.setTimeout === 'function' && duration > 0) {
    ctx.modeTagRemovalConfirmationTimer = ctx.win.setTimeout(() => {
      ctx.modeTagRemovalConfirmationTimer = 0;
      resetModeTagRemovalConfirmation(ctx);
    }, duration);
  }
  if (typeof ctx.config.onModeTagRemovalConfirmation === 'function') {
    ctx.config.onModeTagRemovalConfirmation({ duration });
  }
  return false;
}

function createModeTabKeys(deps: ModeTabKeysDeps) {
  const {
    win,
    config,
    input,
    siteSearchPrefix,
    DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION,
    getModeMenuActiveElement,
    modeMenu,
    focusModeInput,
    focusModeMenuSearch,
    DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;
  const ctx: ModeTabKeysContext = {
    win,
    config,
    input,
    siteSearchPrefix,
    DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION,
    getModeMenuActiveElement,
    modeMenu,
    focusModeInput,
    focusModeMenuSearch,
    DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION,
    inputModeState,
    modeMenuDoubleTabPending: false,
    modeMenuDoubleTabTimer: 0,
    modeTagRemovalConfirmationPending: false,
    modeTagRemovalConfirmationTimer: 0
  };

  return {
    resetModeTagRemovalConfirmation: () => resetModeTagRemovalConfirmation(ctx),
    resetModeMenuDoubleTab: () => resetModeMenuDoubleTab(ctx),
    shouldOpenModeMenuOnDoubleTab: (event: ModeKeyEvent | null | undefined) => shouldOpenModeMenuOnDoubleTab(ctx, event),
    shouldCompleteModeMenuDoubleTab: (event: ModeKeyEvent | null | undefined) => shouldCompleteModeMenuDoubleTab(ctx, event),
    handleModeMenuTabFocusToggle: (event: ModeKeyEvent | null | undefined) => handleModeMenuTabFocusToggle(ctx, event),
    shouldOpenModeMenuForActiveModeOnTab: (event: ModeKeyEvent | null | undefined) => shouldOpenModeMenuForActiveModeOnTab(ctx, event),
    shouldRemoveModeTagOnBackspace: (event?: ModeKeyEvent | null) => shouldRemoveModeTagOnBackspace(ctx, event)
  };
}

type ModeTabKeysApi = ReturnType<typeof createModeTabKeys>;

export { createModeTabKeys };
export type { ModeKeyEvent, ModeTabKeysApi, ModeTabKeysConfig, ModeTabKeysDeps, ModeTabKeysState };
