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

  let modeMenuDoubleTabPending = false;
  let modeMenuDoubleTabTimer = 0;
  let modeTagRemovalConfirmationPending = false;
  let modeTagRemovalConfirmationTimer = 0;

  function resetModeTagRemovalConfirmation(): boolean {
    const wasPending = modeTagRemovalConfirmationPending;
    if (modeTagRemovalConfirmationTimer && win &&
        typeof win.clearTimeout === 'function') {
      win.clearTimeout(modeTagRemovalConfirmationTimer);
    }
    modeTagRemovalConfirmationTimer = 0;
    modeTagRemovalConfirmationPending = false;
    if (wasPending &&
        typeof config.onModeTagRemovalConfirmationReset === 'function') {
      config.onModeTagRemovalConfirmationReset();
    }
    return wasPending;
  }

  function resetModeMenuDoubleTab(): boolean {
    const wasPending = modeMenuDoubleTabPending;
    if (modeMenuDoubleTabTimer && win &&
        typeof win.clearTimeout === 'function') {
      win.clearTimeout(modeMenuDoubleTabTimer);
    }
    modeMenuDoubleTabTimer = 0;
    modeMenuDoubleTabPending = false;
    return wasPending;
  }

  function shouldOpenModeMenuOnDoubleTab(event: ModeKeyEvent | null | undefined): boolean {
    if (inputModeState.destroyed || !event || event.key !== 'Tab' || event.defaultPrevented) {
      return false;
    }
    const hasModifier = Boolean(
      event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
    );
    const hasInput = String(input.value || '') !== '';
    const hasModeTag = Boolean(
      String(siteSearchPrefix.getAttribute('data-mode-id') || '')
    );
    if (hasModifier || hasInput || hasModeTag || inputModeState.modeMenuOpen || inputModeState.modeMenuPending) {
      resetModeMenuDoubleTab();
      return false;
    }
    if (event.repeat) {
      if (modeMenuDoubleTabPending && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      return false;
    }
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (modeMenuDoubleTabPending) {
      resetModeMenuDoubleTab();
      return true;
    }
    modeMenuDoubleTabPending = true;
    const configuredDuration = Number(config.modeMenuDoubleTabDuration);
    const duration = Number.isFinite(configuredDuration)
      ? Math.max(0, configuredDuration)
      : DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION;
    if (win && typeof win.setTimeout === 'function' && duration > 0) {
      modeMenuDoubleTabTimer = win.setTimeout(() => {
        modeMenuDoubleTabTimer = 0;
        resetModeMenuDoubleTab();
      }, duration);
    }
    return false;
  }

  function shouldCompleteModeMenuDoubleTab(event: ModeKeyEvent | null | undefined): boolean {
    if (inputModeState.destroyed || !modeMenuDoubleTabPending || !event ||
        event.key !== 'Tab' || event.defaultPrevented) {
      return false;
    }
    const hasModifier = Boolean(
      event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
    );
    const hasInput = String(input.value || '') !== '';
    if (hasModifier || hasInput || inputModeState.modeMenuOpen || inputModeState.modeMenuPending) {
      resetModeMenuDoubleTab();
      return false;
    }
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (event.repeat) {
      return false;
    }
    resetModeMenuDoubleTab();
    return true;
  }

  function handleModeMenuTabFocusToggle(event: ModeKeyEvent | null | undefined): boolean {
    if (inputModeState.destroyed || !event || event.key !== 'Tab' || event.defaultPrevented ||
        (!inputModeState.modeMenuOpen && !inputModeState.modeMenuPending)) {
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
    resetModeMenuDoubleTab();
    const activeElement = getModeMenuActiveElement();
    const focusIsInModeMenu = activeElement === modeMenu ||
      modeMenu.contains(activeElement);
    if (focusIsInModeMenu) {
      focusModeInput();
    } else {
      focusModeMenuSearch();
    }
    return true;
  }

  function shouldOpenModeMenuForActiveModeOnTab(event: ModeKeyEvent | null | undefined): boolean {
    if (inputModeState.destroyed || !event || event.key !== 'Tab' || event.defaultPrevented) {
      return false;
    }
    const hasModifier = Boolean(
      event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
    );
    const hasModeTag = Boolean(
      String(siteSearchPrefix.getAttribute('data-mode-id') || '')
    );
    if (hasModifier || event.repeat ||
        inputModeState.modeMenuOpen || inputModeState.modeMenuPending) {
      resetModeMenuDoubleTab();
      return false;
    }
    if (!hasModeTag) {
      return false;
    }
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    resetModeMenuDoubleTab();
    return true;
  }

  function shouldRemoveModeTagOnBackspace(event?: ModeKeyEvent | null): boolean {
    if (inputModeState.destroyed || String(input.value || '') !== '') {
      resetModeTagRemovalConfirmation();
      return false;
    }
    if (!inputModeState.modeMenuOpen || modeMenu.hidden) {
      resetModeTagRemovalConfirmation();
      return true;
    }
    if (event && event.repeat) {
      return false;
    }
    if (modeTagRemovalConfirmationPending) {
      resetModeTagRemovalConfirmation();
      return true;
    }
    modeTagRemovalConfirmationPending = true;
    const configuredDuration = Number(
      config.modeTagRemovalConfirmationDuration
    );
    const duration = Number.isFinite(configuredDuration)
      ? Math.max(0, configuredDuration)
      : DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION;
    if (win && typeof win.setTimeout === 'function' && duration > 0) {
      modeTagRemovalConfirmationTimer = win.setTimeout(() => {
        modeTagRemovalConfirmationTimer = 0;
        resetModeTagRemovalConfirmation();
      }, duration);
    }
    if (typeof config.onModeTagRemovalConfirmation === 'function') {
      config.onModeTagRemovalConfirmation({ duration });
    }
    return false;
  }

  return {
    resetModeTagRemovalConfirmation,
    resetModeMenuDoubleTab,
    shouldOpenModeMenuOnDoubleTab,
    shouldCompleteModeMenuDoubleTab,
    handleModeMenuTabFocusToggle,
    shouldOpenModeMenuForActiveModeOnTab,
    shouldRemoveModeTagOnBackspace
  };
}

type ModeTabKeysApi = ReturnType<typeof createModeTabKeys>;

export { createModeTabKeys };
export type { ModeKeyEvent, ModeTabKeysApi, ModeTabKeysConfig, ModeTabKeysDeps, ModeTabKeysState };
