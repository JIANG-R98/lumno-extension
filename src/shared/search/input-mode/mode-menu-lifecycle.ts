// Opening, refreshing and closing the mode menu, and the prefix, menu and
// document pointer and key handlers around it.
import type { CursorTooltipController } from '../../ui/cursor-tooltip';
import type { ModeTagModel } from './mode-tag-model';
import type { ModeMenuEntry, ModeMenuItem } from './types';
import type { ModeMenuLanguageApi } from './mode-menu-language';
import type { ModeMenuLayoutApi } from './mode-menu-layout';
import type { ModeMenuNavigationApi } from './mode-menu-navigation';
import type { ModeMenuRenderApi } from './mode-menu-render';
import type { ModeTabKeysApi } from './mode-tab-keys';
import type { PrefixMotionApi } from './prefix-motion';
import type { PrefixVisualApi } from './prefix-visual';

type ModeMenuItemList = ReadonlyArray<ModeMenuItem | null | undefined> | null | undefined;

interface ModeMenuLifecycleConfig {
  // The menu's items, now or once loaded.
  getModeMenuItems?(): ModeMenuItemList | PromiseLike<ModeMenuItemList>;
}

// The controller state search-input-mode.ts shares with its modules.
interface ModeMenuLifecycleState {
  destroyed: boolean;
  modeMenuOpen: boolean;
  modeMenuPending: boolean;
  // Counts open and refresh requests, so a late answer knows it is stale.
  modeMenuRequestId: number;
  modeMenuFilterQuery: string;
  modeMenuEntries: ModeMenuEntry[];
  modeMenuBusy: boolean;
  modeMenuHasQuery: boolean;
  modeMenuFocusId: string;
  modeMenuSearchActive: boolean;
  modeMenuPinyinRuntimeReady: PromiseLike<unknown> | null | undefined;
}

interface ModeMenuLifecycleDeps {
  config: ModeMenuLifecycleConfig;
  refreshModeMenuLanguage: ModeMenuLanguageApi['refreshModeMenuLanguage'];
  resetModeMenuDoubleTab: ModeTabKeysApi['resetModeMenuDoubleTab'];
  resetModeTagRemovalConfirmation: ModeTabKeysApi['resetModeTagRemovalConfirmation'];
  setModeMenuItems: ModeMenuRenderApi['setModeMenuItems'];
  renderModeMenuView: ModeMenuRenderApi['renderModeMenuView'];
  clearModeMenuProviderThemes: () => void;
  modeMenu: HTMLElement;
  input: HTMLInputElement;
  syncInputPlaceholder: () => void;
  updateModeMenuFooterAlignment: PrefixVisualApi['updateModeMenuFooterAlignment'];
  revealModeMenuSurface: ModeMenuLayoutApi['revealModeMenuSurface'];
  container: HTMLElement;
  siteSearchPrefix: HTMLElement;
  updateModeTag: (patch: Partial<ModeTagModel>) => void;
  setInputModePrefixMenuOpen: PrefixMotionApi['setInputModePrefixMenuOpen'];
  notifyModeMenuLayoutChange: () => void;
  focusModeInput: ModeMenuNavigationApi['focusModeInput'];
  focusModeMenuSearch: ModeMenuNavigationApi['focusModeMenuSearch'];
  focusModeMenuButton: ModeMenuNavigationApi['focusModeMenuButton'];
  requestModeMenuPinyinRuntime: () => unknown;
  getModeMenuButtons: ModeMenuNavigationApi['getModeMenuButtons'];
  cancelModeMenuRevealFrame: ModeMenuLayoutApi['cancelModeMenuRevealFrame'];
  modeMenuCursorTooltipController: Pick<CursorTooltipController, 'hide'> | null;
  setModeMenuSearchActive: ModeMenuNavigationApi['setModeMenuSearchActive'];
  concealModeMenuSurface: ModeMenuLayoutApi['concealModeMenuSurface'];
  getModeMenuActiveElement: ModeMenuNavigationApi['getModeMenuActiveElement'];
  applyModeMenuFilter: ModeMenuRenderApi['applyModeMenuFilter'];
  focusFirstModeMenuFilterResult: ModeMenuNavigationApi['focusFirstModeMenuFilterResult'];
  getModeMenuDirectionalIndex: ModeMenuNavigationApi['getModeMenuDirectionalIndex'];
  selectModeMenuItem: ModeMenuNavigationApi['selectModeMenuItem'];
  handleModeMenuTabFocusToggle: ModeTabKeysApi['handleModeMenuTabFocusToggle'];
  shouldHandleModeMenuKeyEvent: ModeMenuNavigationApi['shouldHandleModeMenuKeyEvent'];
  inputModeState: ModeMenuLifecycleState;
}

// Where focus goes once the menu opens: the last item, the active one, the
// input, or the menu itself.
type ModeMenuFocusTarget = 'last' | 'active' | 'input' | 'none';

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return Boolean(value) && typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

function isNode(value: EventTarget | null | undefined): value is Node {
  return value !== null && value !== undefined && 'nodeType' in value && typeof value.nodeType === 'number';
}

// nodeType 1 is an element, in whichever window the node belongs to.
function isElement(value: EventTarget | null | undefined): value is Element {
  return isNode(value) && value.nodeType === 1;
}

// nodeType 11 with a host is a shadow root.
function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && 'host' in node;
}

function hasDataset(element: Element): element is Element & HTMLOrSVGElement {
  return 'dataset' in element;
}

function createModeMenuLifecycle(deps: ModeMenuLifecycleDeps) {
  const {
    config,
    refreshModeMenuLanguage,
    resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation,
    setModeMenuItems,
    renderModeMenuView,
    clearModeMenuProviderThemes,
    modeMenu,
    input,
    syncInputPlaceholder,
    updateModeMenuFooterAlignment,
    revealModeMenuSurface,
    container,
    siteSearchPrefix,
    updateModeTag,
    setInputModePrefixMenuOpen,
    notifyModeMenuLayoutChange,
    focusModeInput,
    focusModeMenuSearch,
    focusModeMenuButton,
    requestModeMenuPinyinRuntime,
    getModeMenuButtons,
    cancelModeMenuRevealFrame,
    modeMenuCursorTooltipController,
    setModeMenuSearchActive,
    concealModeMenuSurface,
    getModeMenuActiveElement,
    applyModeMenuFilter,
    focusFirstModeMenuFilterResult,
    getModeMenuDirectionalIndex,
    selectModeMenuItem,
    handleModeMenuTabFocusToggle,
    shouldHandleModeMenuKeyEvent
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  function setModeMenuBusy(busy: boolean): void {
    if (inputModeState.modeMenuBusy !== busy) {
      inputModeState.modeMenuBusy = busy;
      renderModeMenuView();
    }
  }

  function openModeMenu(focusTarget?: ModeMenuFocusTarget): boolean | Promise<boolean> {
    if (inputModeState.destroyed || typeof config.getModeMenuItems !== 'function') {
      return false;
    }
    refreshModeMenuLanguage();
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    const requestId = ++inputModeState.modeMenuRequestId;
    inputModeState.modeMenuPending = true;
    const finishOpen = (items: ModeMenuItemList): boolean => {
      if (inputModeState.destroyed || requestId !== inputModeState.modeMenuRequestId) {
        return false;
      }
      inputModeState.modeMenuPending = false;
      inputModeState.modeMenuBusy = false;
      inputModeState.modeMenuFilterQuery = '';
      inputModeState.modeMenuFocusId = '';
      if (modeMenuCursorTooltipController) {
        modeMenuCursorTooltipController.hide();
      }
      clearModeMenuProviderThemes();
      const normalizedItems = setModeMenuItems(items);
      if (normalizedItems.length === 0) {
        renderModeMenuView();
        return false;
      }
      inputModeState.modeMenuOpen = true;
      inputModeState.modeMenuHasQuery = Boolean(String(input.value || '').trim());
      renderModeMenuView();
      syncInputPlaceholder();
      updateModeMenuFooterAlignment();
      revealModeMenuSurface();
      container.setAttribute('data-mode-menu-open', 'true');
      updateModeTag({ expanded: true });
      setInputModePrefixMenuOpen(true);
      notifyModeMenuLayoutChange();
      const activeIndex = normalizedItems.findIndex((item) => item.active);
      const targetIndex = focusTarget === 'last'
        ? normalizedItems.length - 1
        : (activeIndex >= 0 ? activeIndex : 0);
      if (focusTarget === 'input') {
        focusModeInput();
      } else if (focusTarget === 'none') {
        focusModeMenuSearch();
      } else {
        focusModeMenuButton(targetIndex);
      }
      return true;
    };
    const items = config.getModeMenuItems();
    requestModeMenuPinyinRuntime();
    if (isPromiseLike(items) || isPromiseLike(inputModeState.modeMenuPinyinRuntimeReady)) {
      setModeMenuBusy(true);
      return Promise.all([
        Promise.resolve(items),
        Promise.resolve(inputModeState.modeMenuPinyinRuntimeReady)
      ]).then(([resolvedItems]) => {
        if (requestId !== inputModeState.modeMenuRequestId) {
          return false;
        }
        return finishOpen(resolvedItems);
      }, () => {
        if (requestId === inputModeState.modeMenuRequestId) {
          inputModeState.modeMenuPending = false;
          setModeMenuBusy(false);
        }
        return false;
      });
    }
    return finishOpen(items);
  }

  // Draws the items again, keeping focus on the same mode where it can.
  function refreshModeMenu(preferredModeId?: string): boolean | Promise<boolean> {
    if (inputModeState.destroyed || !inputModeState.modeMenuOpen ||
        typeof config.getModeMenuItems !== 'function') {
      return false;
    }
    const activeElement = getModeMenuActiveElement();
    const focusedButton = activeElement &&
      activeElement.getAttribute('role') === 'menuitemradio' &&
      hasDataset(activeElement)
      ? activeElement
      : null;
    const focusedModeId = preferredModeId
      ? String(preferredModeId)
      : (focusedButton ? String(focusedButton.dataset.modeId || '') : '');
    const requestId = ++inputModeState.modeMenuRequestId;
    inputModeState.modeMenuPending = true;
    const finishRefresh = (items: ModeMenuItemList): boolean => {
      if (inputModeState.destroyed || requestId !== inputModeState.modeMenuRequestId || !inputModeState.modeMenuOpen) {
        return false;
      }
      inputModeState.modeMenuPending = false;
      inputModeState.modeMenuBusy = false;
      if (modeMenuCursorTooltipController) {
        modeMenuCursorTooltipController.hide();
      }
      const normalizedItems = setModeMenuItems(items);
      inputModeState.modeMenuHasQuery = Boolean(String(input.value || '').trim());
      renderModeMenuView();
      if (normalizedItems.length === 0) {
        closeModeMenu(false);
        return false;
      }
      updateModeMenuFooterAlignment();
      notifyModeMenuLayoutChange();
      if (focusedModeId) {
        const buttons = getModeMenuButtons();
        const nextFocusedIndex = buttons.findIndex((button) => (
          String(button.dataset.modeId || '') === focusedModeId
        ));
        if (nextFocusedIndex >= 0) {
          focusModeMenuButton(nextFocusedIndex);
        }
      }
      return true;
    };
    const items = config.getModeMenuItems();
    if (isPromiseLike(items)) {
      setModeMenuBusy(true);
      return Promise.resolve(items).then(finishRefresh, () => {
        if (requestId === inputModeState.modeMenuRequestId) {
          inputModeState.modeMenuPending = false;
          setModeMenuBusy(false);
        }
        return false;
      });
    }
    return finishRefresh(items);
  }

  function closeModeMenu(restoreFocus?: boolean): boolean {
    if (!inputModeState.modeMenuOpen && !inputModeState.modeMenuPending) {
      return false;
    }
    inputModeState.modeMenuRequestId += 1;
    inputModeState.modeMenuPending = false;
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    cancelModeMenuRevealFrame();
    if (modeMenuCursorTooltipController) {
      modeMenuCursorTooltipController.hide();
    }
    inputModeState.modeMenuOpen = false;
    inputModeState.modeMenuBusy = false;
    inputModeState.modeMenuFilterQuery = '';
    inputModeState.modeMenuFocusId = '';
    inputModeState.modeMenuSearchActive = false;
    concealModeMenuSurface();
    syncInputPlaceholder();
    container.removeAttribute('data-mode-menu-open');
    updateModeTag({ expanded: false });
    setInputModePrefixMenuOpen(false);
    notifyModeMenuLayoutChange();
    if (restoreFocus) {
      siteSearchPrefix.focus({ preventScroll: true });
    }
    return true;
  }

  function handlePrefixClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (inputModeState.modeMenuOpen || inputModeState.modeMenuPending) {
      closeModeMenu(true);
    } else {
      openModeMenu('none');
    }
  }

  function handlePrefixKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openModeMenu(event.key === 'ArrowUp' ? 'last' : 'active');
    } else if (event.key === 'Escape' && inputModeState.modeMenuOpen) {
      event.preventDefault();
      closeModeMenu(true);
    }
  }

  function stopModeMenuKeyEvent(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  // Keys while the menu has focus: arrows, Home, End, Enter, Escape, Tab,
  // and letters, digits and spaces typed into the filter.
  function handleMenuKeydown(event: KeyboardEvent): boolean {
    const buttons = getModeMenuButtons();
    const activeElement = getModeMenuActiveElement();
    const currentIndex = buttons.findIndex((button) => button === activeElement);
    if (event.key === 'Escape') {
      stopModeMenuKeyEvent(event);
      if (inputModeState.modeMenuFilterQuery) {
        applyModeMenuFilter('');
        focusModeMenuSearch();
      } else {
        closeModeMenu(true);
      }
      return true;
    } else if (event.key === 'Backspace' && !event.metaKey &&
        !event.ctrlKey && !event.altKey) {
      stopModeMenuKeyEvent(event);
      const queryCharacters = Array.from(inputModeState.modeMenuFilterQuery);
      queryCharacters.pop();
      applyModeMenuFilter(queryCharacters.join(''));
      focusFirstModeMenuFilterResult();
      return true;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      stopModeMenuKeyEvent(event);
      const nextIndex = getModeMenuDirectionalIndex(
        buttons,
        currentIndex,
        event.key
      );
      focusModeMenuButton(nextIndex, { smoothScroll: true });
      return true;
    } else if (event.key === 'Home' || event.key === 'End') {
      stopModeMenuKeyEvent(event);
      focusModeMenuButton(event.key === 'Home' ? 0 : buttons.length - 1);
      return true;
    } else if ((event.key === 'Enter' || event.key === ' ') && currentIndex >= 0) {
      stopModeMenuKeyEvent(event);
      const modeId = buttons[currentIndex].dataset.modeId || '';
      const entry = inputModeState.modeMenuEntries.find((candidate) => String(candidate.item.id) === modeId);
      if (entry) {
        selectModeMenuItem(entry.item, {
          focusAfterSelect: 'panel'
        });
      }
      return true;
    } else if (event.key === 'Tab') {
      return handleModeMenuTabFocusToggle(event);
    } else if (!event.isComposing && !event.repeat &&
        !event.metaKey && !event.ctrlKey && !event.altKey &&
        typeof event.key === 'string' && event.key.length === 1 &&
        /^[\p{L}\p{N}\s]$/u.test(event.key)) {
      stopModeMenuKeyEvent(event);
      applyModeMenuFilter(inputModeState.modeMenuFilterQuery + event.key);
      focusFirstModeMenuFilterResult();
      return true;
    }
    return false;
  }

  function handleModeMenuKeyEvent(event: KeyboardEvent): boolean {
    if (!shouldHandleModeMenuKeyEvent(event)) {
      return false;
    }
    return handleMenuKeydown(event);
  }

  function handleModeMenuPointerDown(event: PointerEvent): void {
    if (!inputModeState.modeMenuOpen) {
      return;
    }
    setModeMenuSearchActive(true);
    const target = event.target;
    const button = isElement(target) ? target.closest('[role="menuitemradio"]') : null;
    // Native pointer focus can scroll the panel's ancestors before click
    // returns focus to the input. All menu focus is managed with preventScroll.
    event.preventDefault();
    if (button) {
      return;
    }
    focusModeMenuSearch();
  }

  // A press outside the input and its menu closes the menu. In a closed
  // shadow root the press reaches the document as the host's.
  function handleDocumentPointerDown(event: Event): void {
    const eventPath = event.composedPath();
    const containerRoot = container.getRootNode();
    const containerRootHost = isShadowRoot(containerRoot) ? containerRoot.host : null;
    const isInsideModeContainer = (isNode(event.target) && container.contains(event.target)) ||
      eventPath.includes(container) ||
      eventPath.includes(modeMenu) ||
      eventPath.includes(siteSearchPrefix) ||
      Boolean(containerRootHost && event.currentTarget !== containerRoot && (
        event.target === containerRootHost ||
        eventPath.includes(containerRootHost)
      ));
    if (!inputModeState.modeMenuOpen || isInsideModeContainer) {
      return;
    }
    closeModeMenu(false);
  }

  return {
    openModeMenu,
    refreshModeMenu,
    closeModeMenu,
    handlePrefixClick,
    handlePrefixKeydown,
    handleMenuKeydown,
    handleModeMenuKeyEvent,
    handleModeMenuPointerDown,
    handleDocumentPointerDown
  };
}

type ModeMenuLifecycleApi = ReturnType<typeof createModeMenuLifecycle>;

export { createModeMenuLifecycle };
export type {
  ModeMenuFocusTarget,
  ModeMenuItemList,
  ModeMenuLifecycleApi,
  ModeMenuLifecycleConfig,
  ModeMenuLifecycleDeps,
  ModeMenuLifecycleState
};
