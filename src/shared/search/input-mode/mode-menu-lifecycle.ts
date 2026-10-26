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
import { readMenuKeyAction } from './mode-menu-keys';
import type { MenuKeyAction } from './mode-menu-keys';

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

interface ModeMenuLifecycleContext {
  readonly config: ModeMenuLifecycleDeps['config'];
  readonly refreshModeMenuLanguage: ModeMenuLifecycleDeps['refreshModeMenuLanguage'];
  readonly resetModeMenuDoubleTab: ModeMenuLifecycleDeps['resetModeMenuDoubleTab'];
  readonly resetModeTagRemovalConfirmation: ModeMenuLifecycleDeps['resetModeTagRemovalConfirmation'];
  readonly setModeMenuItems: ModeMenuLifecycleDeps['setModeMenuItems'];
  readonly renderModeMenuView: ModeMenuLifecycleDeps['renderModeMenuView'];
  readonly clearModeMenuProviderThemes: ModeMenuLifecycleDeps['clearModeMenuProviderThemes'];
  readonly modeMenu: ModeMenuLifecycleDeps['modeMenu'];
  readonly input: ModeMenuLifecycleDeps['input'];
  readonly syncInputPlaceholder: ModeMenuLifecycleDeps['syncInputPlaceholder'];
  readonly updateModeMenuFooterAlignment: ModeMenuLifecycleDeps['updateModeMenuFooterAlignment'];
  readonly revealModeMenuSurface: ModeMenuLifecycleDeps['revealModeMenuSurface'];
  readonly container: ModeMenuLifecycleDeps['container'];
  readonly siteSearchPrefix: ModeMenuLifecycleDeps['siteSearchPrefix'];
  readonly updateModeTag: ModeMenuLifecycleDeps['updateModeTag'];
  readonly setInputModePrefixMenuOpen: ModeMenuLifecycleDeps['setInputModePrefixMenuOpen'];
  readonly notifyModeMenuLayoutChange: ModeMenuLifecycleDeps['notifyModeMenuLayoutChange'];
  readonly focusModeInput: ModeMenuLifecycleDeps['focusModeInput'];
  readonly focusModeMenuSearch: ModeMenuLifecycleDeps['focusModeMenuSearch'];
  readonly focusModeMenuButton: ModeMenuLifecycleDeps['focusModeMenuButton'];
  readonly requestModeMenuPinyinRuntime: ModeMenuLifecycleDeps['requestModeMenuPinyinRuntime'];
  readonly getModeMenuButtons: ModeMenuLifecycleDeps['getModeMenuButtons'];
  readonly cancelModeMenuRevealFrame: ModeMenuLifecycleDeps['cancelModeMenuRevealFrame'];
  readonly modeMenuCursorTooltipController: ModeMenuLifecycleDeps['modeMenuCursorTooltipController'];
  readonly setModeMenuSearchActive: ModeMenuLifecycleDeps['setModeMenuSearchActive'];
  readonly concealModeMenuSurface: ModeMenuLifecycleDeps['concealModeMenuSurface'];
  readonly getModeMenuActiveElement: ModeMenuLifecycleDeps['getModeMenuActiveElement'];
  readonly applyModeMenuFilter: ModeMenuLifecycleDeps['applyModeMenuFilter'];
  readonly focusFirstModeMenuFilterResult: ModeMenuLifecycleDeps['focusFirstModeMenuFilterResult'];
  readonly getModeMenuDirectionalIndex: ModeMenuLifecycleDeps['getModeMenuDirectionalIndex'];
  readonly selectModeMenuItem: ModeMenuLifecycleDeps['selectModeMenuItem'];
  readonly handleModeMenuTabFocusToggle: ModeMenuLifecycleDeps['handleModeMenuTabFocusToggle'];
  readonly shouldHandleModeMenuKeyEvent: ModeMenuLifecycleDeps['shouldHandleModeMenuKeyEvent'];
  readonly inputModeState: ModeMenuLifecycleDeps['inputModeState'];
}

function setModeMenuBusy(ctx: ModeMenuLifecycleContext, busy: boolean): void {
  if (ctx.inputModeState.modeMenuBusy !== busy) {
    ctx.inputModeState.modeMenuBusy = busy;
    ctx.renderModeMenuView();
  }
}

function openModeMenu(ctx: ModeMenuLifecycleContext, focusTarget?: ModeMenuFocusTarget): boolean | Promise<boolean> {
  if (ctx.inputModeState.destroyed || typeof ctx.config.getModeMenuItems !== 'function') {
    return false;
  }
  ctx.refreshModeMenuLanguage();
  ctx.resetModeMenuDoubleTab();
  ctx.resetModeTagRemovalConfirmation();
  const requestId = ++ctx.inputModeState.modeMenuRequestId;
  ctx.inputModeState.modeMenuPending = true;
  const finishOpen = (items: ModeMenuItemList): boolean => {
    if (ctx.inputModeState.destroyed || requestId !== ctx.inputModeState.modeMenuRequestId) {
      return false;
    }
    ctx.inputModeState.modeMenuPending = false;
    ctx.inputModeState.modeMenuBusy = false;
    ctx.inputModeState.modeMenuFilterQuery = '';
    ctx.inputModeState.modeMenuFocusId = '';
    if (ctx.modeMenuCursorTooltipController) {
      ctx.modeMenuCursorTooltipController.hide();
    }
    ctx.clearModeMenuProviderThemes();
    const normalizedItems = ctx.setModeMenuItems(items);
    if (normalizedItems.length === 0) {
      ctx.renderModeMenuView();
      return false;
    }
    ctx.inputModeState.modeMenuOpen = true;
    ctx.inputModeState.modeMenuHasQuery = Boolean(String(ctx.input.value || '').trim());
    ctx.renderModeMenuView();
    ctx.syncInputPlaceholder();
    ctx.updateModeMenuFooterAlignment();
    ctx.revealModeMenuSurface();
    ctx.container.setAttribute('data-mode-menu-open', 'true');
    ctx.updateModeTag({ expanded: true });
    ctx.setInputModePrefixMenuOpen(true);
    ctx.notifyModeMenuLayoutChange();
    const activeIndex = normalizedItems.findIndex((item) => item.active);
    const targetIndex = focusTarget === 'last'
      ? normalizedItems.length - 1
      : (activeIndex >= 0 ? activeIndex : 0);
    if (focusTarget === 'input') {
      ctx.focusModeInput();
    } else if (focusTarget === 'none') {
      ctx.focusModeMenuSearch();
    } else {
      ctx.focusModeMenuButton(targetIndex);
    }
    return true;
  };
  const items = ctx.config.getModeMenuItems();
  ctx.requestModeMenuPinyinRuntime();
  if (isPromiseLike(items) || isPromiseLike(ctx.inputModeState.modeMenuPinyinRuntimeReady)) {
    setModeMenuBusy(ctx, true);
    return Promise.all([
      Promise.resolve(items),
      Promise.resolve(ctx.inputModeState.modeMenuPinyinRuntimeReady)
    ]).then(([resolvedItems]) => {
      if (requestId !== ctx.inputModeState.modeMenuRequestId) {
        return false;
      }
      return finishOpen(resolvedItems);
    }, () => {
      if (requestId === ctx.inputModeState.modeMenuRequestId) {
        ctx.inputModeState.modeMenuPending = false;
        setModeMenuBusy(ctx, false);
      }
      return false;
    });
  }
  return finishOpen(items);
}

// Draws the items again, keeping focus on the same mode where it can.
function refreshModeMenu(ctx: ModeMenuLifecycleContext, preferredModeId?: string): boolean | Promise<boolean> {
  if (ctx.inputModeState.destroyed || !ctx.inputModeState.modeMenuOpen ||
      typeof ctx.config.getModeMenuItems !== 'function') {
    return false;
  }
  const activeElement = ctx.getModeMenuActiveElement();
  const focusedButton = activeElement &&
    activeElement.getAttribute('role') === 'menuitemradio' &&
    hasDataset(activeElement)
    ? activeElement
    : null;
  const focusedModeId = preferredModeId
    ? String(preferredModeId)
    : (focusedButton ? String(focusedButton.dataset.modeId || '') : '');
  const requestId = ++ctx.inputModeState.modeMenuRequestId;
  ctx.inputModeState.modeMenuPending = true;
  const finishRefresh = (items: ModeMenuItemList): boolean => {
    if (ctx.inputModeState.destroyed || requestId !== ctx.inputModeState.modeMenuRequestId || !ctx.inputModeState.modeMenuOpen) {
      return false;
    }
    ctx.inputModeState.modeMenuPending = false;
    ctx.inputModeState.modeMenuBusy = false;
    if (ctx.modeMenuCursorTooltipController) {
      ctx.modeMenuCursorTooltipController.hide();
    }
    const normalizedItems = ctx.setModeMenuItems(items);
    ctx.inputModeState.modeMenuHasQuery = Boolean(String(ctx.input.value || '').trim());
    ctx.renderModeMenuView();
    if (normalizedItems.length === 0) {
      closeModeMenu(ctx, false);
      return false;
    }
    ctx.updateModeMenuFooterAlignment();
    ctx.notifyModeMenuLayoutChange();
    if (focusedModeId) {
      const buttons = ctx.getModeMenuButtons();
      const nextFocusedIndex = buttons.findIndex((button) => (
        String(button.dataset.modeId || '') === focusedModeId
      ));
      if (nextFocusedIndex >= 0) {
        ctx.focusModeMenuButton(nextFocusedIndex);
      }
    }
    return true;
  };
  const items = ctx.config.getModeMenuItems();
  if (isPromiseLike(items)) {
    setModeMenuBusy(ctx, true);
    return Promise.resolve(items).then(finishRefresh, () => {
      if (requestId === ctx.inputModeState.modeMenuRequestId) {
        ctx.inputModeState.modeMenuPending = false;
        setModeMenuBusy(ctx, false);
      }
      return false;
    });
  }
  return finishRefresh(items);
}

function closeModeMenu(ctx: ModeMenuLifecycleContext, restoreFocus?: boolean): boolean {
  if (!ctx.inputModeState.modeMenuOpen && !ctx.inputModeState.modeMenuPending) {
    return false;
  }
  ctx.inputModeState.modeMenuRequestId += 1;
  ctx.inputModeState.modeMenuPending = false;
  ctx.resetModeMenuDoubleTab();
  ctx.resetModeTagRemovalConfirmation();
  ctx.cancelModeMenuRevealFrame();
  if (ctx.modeMenuCursorTooltipController) {
    ctx.modeMenuCursorTooltipController.hide();
  }
  ctx.inputModeState.modeMenuOpen = false;
  ctx.inputModeState.modeMenuBusy = false;
  ctx.inputModeState.modeMenuFilterQuery = '';
  ctx.inputModeState.modeMenuFocusId = '';
  ctx.inputModeState.modeMenuSearchActive = false;
  ctx.concealModeMenuSurface();
  ctx.syncInputPlaceholder();
  ctx.container.removeAttribute('data-mode-menu-open');
  ctx.updateModeTag({ expanded: false });
  ctx.setInputModePrefixMenuOpen(false);
  ctx.notifyModeMenuLayoutChange();
  if (restoreFocus) {
    ctx.siteSearchPrefix.focus({ preventScroll: true });
  }
  return true;
}

function handlePrefixClick(ctx: ModeMenuLifecycleContext, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  if (ctx.inputModeState.modeMenuOpen || ctx.inputModeState.modeMenuPending) {
    closeModeMenu(ctx, true);
  } else {
    openModeMenu(ctx, 'none');
  }
}

function handlePrefixKeydown(ctx: ModeMenuLifecycleContext, event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    openModeMenu(ctx, event.key === 'ArrowUp' ? 'last' : 'active');
  } else if (event.key === 'Escape' && ctx.inputModeState.modeMenuOpen) {
    event.preventDefault();
    closeModeMenu(ctx, true);
  }
}

function stopModeMenuKeyEvent(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

// Keys while the menu has focus: arrows, Home, End, Enter, Escape, Tab,
// and letters, digits and spaces typed into the filter.
const MENU_KEY_ACTIONS: Record<MenuKeyAction, (
  ctx: ModeMenuLifecycleContext,
  event: KeyboardEvent,
  buttons: HTMLElement[],
  currentIndex: number
) => void> = {
  escape(ctx) {
    if (ctx.inputModeState.modeMenuFilterQuery) {
      ctx.applyModeMenuFilter('');
      ctx.focusModeMenuSearch();
    } else {
      closeModeMenu(ctx, true);
    }
  },
  erase(ctx) {
    const queryCharacters = Array.from(ctx.inputModeState.modeMenuFilterQuery);
    queryCharacters.pop();
    ctx.applyModeMenuFilter(queryCharacters.join(''));
    ctx.focusFirstModeMenuFilterResult();
  },
  move(ctx, event, buttons, currentIndex) {
    const nextIndex = ctx.getModeMenuDirectionalIndex(buttons, currentIndex, event.key);
    ctx.focusModeMenuButton(nextIndex, { smoothScroll: true });
  },
  edge(ctx, event, buttons) {
    ctx.focusModeMenuButton(event.key === 'Home' ? 0 : buttons.length - 1);
  },
  select(ctx, _event, buttons, currentIndex) {
    const modeId = buttons[currentIndex].dataset.modeId || '';
    const entry = ctx.inputModeState.modeMenuEntries.find((candidate) => String(candidate.item.id) === modeId);
    if (entry) {
      ctx.selectModeMenuItem(entry.item, {
        focusAfterSelect: 'panel'
      });
    }
  },
  filter(ctx, event) {
    ctx.applyModeMenuFilter(ctx.inputModeState.modeMenuFilterQuery + event.key);
    ctx.focusFirstModeMenuFilterResult();
  }
};

function handleMenuKeydown(ctx: ModeMenuLifecycleContext, event: KeyboardEvent): boolean {
  if (event.key === 'Tab') {
    return ctx.handleModeMenuTabFocusToggle(event);
  }
  const buttons = ctx.getModeMenuButtons();
  const activeElement = ctx.getModeMenuActiveElement();
  const currentIndex = buttons.findIndex((button) => button === activeElement);
  const action = readMenuKeyAction(event, currentIndex);
  if (!action) {
    return false;
  }
  stopModeMenuKeyEvent(event);
  MENU_KEY_ACTIONS[action](ctx, event, buttons, currentIndex);
  return true;
}

function handleModeMenuKeyEvent(ctx: ModeMenuLifecycleContext, event: KeyboardEvent): boolean {
  if (!ctx.shouldHandleModeMenuKeyEvent(event)) {
    return false;
  }
  return handleMenuKeydown(ctx, event);
}

function handleModeMenuPointerDown(ctx: ModeMenuLifecycleContext, event: PointerEvent): void {
  if (!ctx.inputModeState.modeMenuOpen) {
    return;
  }
  ctx.setModeMenuSearchActive(true);
  const target = event.target;
  const button = isElement(target) ? target.closest('[role="menuitemradio"]') : null;
  // Native pointer focus can scroll the panel's ancestors before click
  // returns focus to the input. All menu focus is managed with preventScroll.
  event.preventDefault();
  if (button) {
    return;
  }
  ctx.focusModeMenuSearch();
}

// A press outside the input and its menu closes the menu. In a closed
// shadow root the press reaches the document as the host's.
function handleDocumentPointerDown(ctx: ModeMenuLifecycleContext, event: Event): void {
  const eventPath = event.composedPath();
  const containerRoot = ctx.container.getRootNode();
  const containerRootHost = isShadowRoot(containerRoot) ? containerRoot.host : null;
  const isInsideModeContainer = (isNode(event.target) && ctx.container.contains(event.target)) ||
    eventPath.includes(ctx.container) ||
    eventPath.includes(ctx.modeMenu) ||
    eventPath.includes(ctx.siteSearchPrefix) ||
    Boolean(containerRootHost && event.currentTarget !== containerRoot && (
      event.target === containerRootHost ||
      eventPath.includes(containerRootHost)
    ));
  if (!ctx.inputModeState.modeMenuOpen || isInsideModeContainer) {
    return;
  }
  closeModeMenu(ctx, false);
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
  const ctx: ModeMenuLifecycleContext = {
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
    shouldHandleModeMenuKeyEvent,
    inputModeState
  };

  return {
    openModeMenu: (focusTarget?: ModeMenuFocusTarget) => openModeMenu(ctx, focusTarget),
    refreshModeMenu: (preferredModeId?: string) => refreshModeMenu(ctx, preferredModeId),
    closeModeMenu: (restoreFocus?: boolean) => closeModeMenu(ctx, restoreFocus),
    handlePrefixClick: (event: MouseEvent) => handlePrefixClick(ctx, event),
    handlePrefixKeydown: (event: KeyboardEvent) => handlePrefixKeydown(ctx, event),
    handleMenuKeydown: (event: KeyboardEvent) => handleMenuKeydown(ctx, event),
    handleModeMenuKeyEvent: (event: KeyboardEvent) => handleModeMenuKeyEvent(ctx, event),
    handleModeMenuPointerDown: (event: PointerEvent) => handleModeMenuPointerDown(ctx, event),
    handleDocumentPointerDown: (event: Event) => handleDocumentPointerDown(ctx, event)
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
