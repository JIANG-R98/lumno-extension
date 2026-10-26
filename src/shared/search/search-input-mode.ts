// The search box's mode: the tag at the input's start that says where a
// search goes (a site, an AI, bookmarks, history), its Tab hint, and the
// mode menu (the search scope panel). The parts live in search/input-mode/;
// this file builds them around one shared state.
import * as LumnoCursorTooltip from '../ui/cursor-tooltip';
import type { ModeTagHandlers } from '../react/search/mode-tag';
import { EMPTY_MODE_TAG } from './input-mode/mode-tag-model';
import type { ModeTagModel, TabHintModel } from './input-mode/mode-tag-model';
import { getDocument, getWindow, readControllerOptions, setStyle } from './input-mode/controller-setup';
import type { ControllerOptions } from './input-mode/controller-setup';
import type {
  InputModeConfig,
  InputModeParts,
  InputModeState,
  InputModeWindow,
  ModeMenuTooltipController
} from './input-mode/controller-types';
import { wireInputModeModules } from './input-mode/controller-wiring';
import type { InputModeEnv, InputModeModules } from './input-mode/controller-wiring';
import { createPinyinRuntime, requestPinyinRuntime } from './input-mode/pinyin-runtime';

function createInputModeState(): InputModeState {
  return {
    destroyed: false,
    modeMenuOpen: false,
    modeMenuRevealed: false,
    modeMenuBusy: false,
    modeMenuSearchActive: false,
    modeMenuHasQuery: false,
    modeMenuFocusId: '',
    modeMenuPending: false,
    modeMenuRequestId: 0,
    modeMenuFilterQuery: '',
    modeMenuEntries: [],
    modeTagActive: false,
    modeMenuPinyinRuntimeReady: undefined,
    inputModePrefixAnimation: null,
    inputModePrefixAnimationFrame: null,
    inputModePrefixAnimationTimer: 0,
    inputModePrefixCurrentAnimation: null,
    inputModePrefixPendingText: '',
    modeTag: EMPTY_MODE_TAG,
    tabHint: { visible: false, label: '', title: '' }
  };
}

// Where the tag sits and how it moves are the controller's: these start
// its place and rest motion, and the Tab hint's distance from the right.
function placeModeTag(parts: InputModeParts, options: ControllerOptions): void {
  setStyle(parts.modePrefix, 'left', '50px');
  setStyle(parts.modePrefix, 'transform', 'translateY(-50%)');
  setStyle(parts.modePrefix, 'opacity', '1');
  setStyle(parts.modePrefix, 'transition', options.prefixTransition);
  setStyle(parts.modePrefix, 'will-change', 'auto');
  setStyle(parts.modeTabHint, 'right', `${options.rightAnchorOffset}px`);
}

// The surface's cursor tooltip for cut-off menu labels, or one the menu
// makes and owns.
function createModeMenuTooltip(
  config: InputModeConfig,
  parts: InputModeParts,
  doc: Document,
  win: InputModeWindow
): { controller: ModeMenuTooltipController | null; owned: ReturnType<typeof LumnoCursorTooltip.createController> | null } {
  const provided = config.modeMenuCursorTooltipController || config.modeMenuTooltipController || null;
  if (provided) {
    return { controller: provided, owned: null };
  }
  const owned = LumnoCursorTooltip.createController({
    documentObj: doc,
    windowObj: win,
    appendTo: doc.body,
    id: `${parts.modePrefix.id}-label-cursor-tooltip`,
    maxWidth: 320,
    offsetX: 14,
    offsetY: 16
  });
  return { controller: owned, owned };
}

function syncInputPlaceholder(env: InputModeEnv): void {
  const { input, inputModeState, formatMessage } = env;
  if (inputModeState.modeMenuOpen) {
    input.placeholder = formatMessage('search_scope_panel_placeholder', 'Search specific site content…');
    return;
  }
  input.placeholder = env.parts.modePrefix.style.getPropertyValue('display') !== 'none'
    ? formatMessage(
      'search_scope_active_placeholder',
      'Search within this scope; press Tab again to open the scope panel…'
    )
    : env.getDefaultPlaceholder();
}

function createModeTagHandlers(env: InputModeEnv, late: () => InputModeModules): ModeTagHandlers {
  return {
    onClick: (event) => late().handlePrefixClick(event),
    onKeyDown: (event) => late().handlePrefixKeydown(event),
    onIconError: () => late().handleModeTagIconError(),
    attachIconData(image, iconUrl, iconHost) {
      if (env.attachFaviconData) {
        env.attachFaviconData(image, iconUrl, iconHost);
      }
    }
  };
}

function createInputModeEnv(
  config: InputModeConfig,
  parts: InputModeParts,
  doc: Document,
  late: () => InputModeModules
): InputModeEnv {
  const win = getWindow(config);
  const options = readControllerOptions(config, parts.input);
  const inputModeState = createInputModeState();
  const pinyinRuntime = createPinyinRuntime(config.pinyinApi);
  const tooltip = createModeMenuTooltip(config, parts, doc, win);
  let modeTagHandlers: ModeTagHandlers | null = null;
  const env: InputModeEnv = {
    ...options,
    config,
    parts,
    doc,
    win,
    input: parts.input,
    container: parts.container,
    inputModeState,
    modeMenuCursorTooltipController: tooltip.controller,
    ownedModeMenuCursorTooltipController: tooltip.owned,
    updateModeTag(patch: Partial<ModeTagModel>) {
      inputModeState.modeTag = { ...inputModeState.modeTag, ...patch };
      modeTagHandlers = modeTagHandlers || createModeTagHandlers(env, late);
      parts.modeTagView.render(inputModeState.modeTag, modeTagHandlers);
    },
    updateTabHint(patch: Partial<TabHintModel>) {
      inputModeState.tabHint = { ...inputModeState.tabHint, ...patch };
      parts.tabHintView.render(inputModeState.tabHint);
    },
    syncInputPlaceholder: () => syncInputPlaceholder(env),
    requestModeMenuPinyinRuntime: () => requestPinyinRuntime(
      pinyinRuntime,
      inputModeState,
      () => late().refreshModeMenuSearchIndexes()
    ),
    getModeMenuPinyinApi: () => pinyinRuntime.api
  };
  return env;
}

// The input's own listeners: typing and keys reset the pending double Tab
// and tag removal, and a press elsewhere closes the menu.
interface ModeListeners {
  input(): void;
  keydown(event: KeyboardEvent): void;
  blur(): void;
  focus(): void;
  resize(): void;
  pointerRoot: Node;
  resizeObserver: ResizeObserver | null;
}

function createModeListeners(env: InputModeEnv, m: InputModeModules): ModeListeners {
  return {
    input() {
      env.requestModeMenuPinyinRuntime();
      m.resetModeMenuDoubleTab();
      m.resetModeTagRemovalConfirmation();
      m.syncModeMenuQueryLift();
    },
    keydown(event: KeyboardEvent) {
      if (event && event.key !== 'Tab') {
        m.resetModeMenuDoubleTab();
      }
      if (event && event.key !== 'Backspace' &&
          !event.metaKey && !event.ctrlKey && !event.altKey) {
        m.resetModeTagRemovalConfirmation();
      }
    },
    blur: () => m.resetModeMenuDoubleTab(),
    focus: () => m.setModeMenuSearchActive(false),
    resize: () => m.updateLayout(),
    pointerRoot: env.container.getRootNode(),
    resizeObserver: null
  };
}

function observeModeLayout(env: InputModeEnv, m: InputModeModules): ResizeObserver | null {
  const win = env.win;
  if (!win || typeof win.ResizeObserver !== 'function') {
    return null;
  }
  const observer = new win.ResizeObserver(m.updateLayout);
  observer.observe(env.parts.modePrefix);
  observer.observe(env.parts.modeTabHint);
  observer.observe(env.parts.modeMenuContent);
  const badgeElement = m.getModeBadgeElement();
  if (badgeElement) {
    observer.observe(badgeElement);
  }
  return observer;
}

function addModeListeners(env: InputModeEnv, m: InputModeModules, listeners: ModeListeners): void {
  const { input, container, doc } = env;
  input.addEventListener('input', listeners.input);
  input.addEventListener('keydown', listeners.keydown);
  input.addEventListener('blur', listeners.blur);
  input.addEventListener('focus', listeners.focus);
  if (typeof env.config.onModeMenuHistory === 'function') {
    container.addEventListener('keydown', m.handleModeMenuHistoryKeydown, true);
  }
  doc.addEventListener('pointerdown', m.handleDocumentPointerDown, true);
  if (listeners.pointerRoot !== doc) {
    listeners.pointerRoot.addEventListener('pointerdown', m.handleDocumentPointerDown, true);
  }
  listeners.resizeObserver = observeModeLayout(env, m);
  env.win.addEventListener('resize', listeners.resize);
}

function removeModeListeners(env: InputModeEnv, m: InputModeModules, listeners: ModeListeners): void {
  const { input, doc } = env;
  env.container.removeEventListener('keydown', m.handleModeMenuHistoryKeydown, true);
  env.win.removeEventListener('resize', listeners.resize);
  if (listeners.resizeObserver) {
    listeners.resizeObserver.disconnect();
    listeners.resizeObserver = null;
  }
  input.removeEventListener('input', listeners.input);
  input.removeEventListener('keydown', listeners.keydown);
  input.removeEventListener('blur', listeners.blur);
  input.removeEventListener('focus', listeners.focus);
  doc.removeEventListener('pointerdown', m.handleDocumentPointerDown, true);
  if (listeners.pointerRoot !== doc) {
    listeners.pointerRoot.removeEventListener('pointerdown', m.handleDocumentPointerDown, true);
  }
}

function destroyInputMode(env: InputModeEnv, m: InputModeModules, listeners: ModeListeners): void {
  const state = env.inputModeState;
  state.destroyed = true;
  state.modeMenuRequestId += 1;
  state.modeMenuPending = false;
  m.cancelModeMenuRevealFrame();
  m.resetModeMenuDoubleTab();
  m.resetModeTagRemovalConfirmation();
  m.cancelInputModePrefixAnimation();
  m.cancelInputModePrefixIconAnimation();
  removeModeListeners(env, m, listeners);
  m.clearProviderPrefix();
  m.setTabHintVisible(false);
  if (env.ownedModeMenuCursorTooltipController) {
    env.ownedModeMenuCursorTooltipController.destroy();
  } else if (env.modeMenuCursorTooltipController) {
    env.modeMenuCursorTooltipController.hide();
  }
}

function createInputModeController(parts: InputModeParts, options?: InputModeConfig | null) {
  const config: InputModeConfig = options || {};
  const doc = getDocument(config);
  if (!doc || !parts || !parts.container || !parts.input) {
    throw new Error('createInputModeController requires input parts');
  }
  let modules: InputModeModules | null = null;
  const env = createInputModeEnv(config, parts, doc, () => {
    if (!modules) {
      throw new Error('The input mode modules are still being built.');
    }
    return modules;
  });
  placeModeTag(parts, env);
  const m = wireInputModeModules(env);
  modules = m;
  const listeners = createModeListeners(env, m);
  addModeListeners(env, m, listeners);
  m.renderModeMenuView();

  return Object.freeze({
    prefixElement: parts.modePrefix,
    tabHintElement: parts.modeTabHint,
    setProviderPrefix: m.setProviderPrefix,
    setPrefixText: m.setPrefixText,
    clearProviderPrefix: m.clearProviderPrefix,
    closeModeMenu: m.closeModeMenu,
    fitModeMenuWithinViewport: m.fitModeMenuWithinViewport,
    isModeMenuVisible: m.isModeMenuVisible,
    menuElement: parts.modeMenu,
    getModeMenuFilterQuery: () => env.inputModeState.modeMenuFilterQuery,
    hasActiveModeTag: () => env.inputModeState.modeTagActive,
    openModeMenu: m.openModeMenu,
    refreshModeMenuLanguage: m.refreshModeMenuLanguage,
    refreshModeMenu: m.refreshModeMenu,
    resetModeMenuDoubleTab: m.resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation: m.resetModeTagRemovalConfirmation,
    setModeMenuResultOffset: m.setModeMenuResultOffset,
    setTabHintVisible: m.setTabHintVisible,
    shouldCompleteModeMenuDoubleTab: m.shouldCompleteModeMenuDoubleTab,
    handleModeMenuTabFocusToggle: m.handleModeMenuTabFocusToggle,
    handleModeMenuKeyEvent: m.handleModeMenuKeyEvent,
    shouldHandleModeMenuKeyEvent: m.shouldHandleModeMenuKeyEvent,
    shouldOpenModeMenuForActiveModeOnTab: m.shouldOpenModeMenuForActiveModeOnTab,
    shouldOpenModeMenuOnDoubleTab: m.shouldOpenModeMenuOnDoubleTab,
    shouldRemoveModeTagOnBackspace: m.shouldRemoveModeTagOnBackspace,
    updateLayout: m.updateLayout,
    destroy: () => destroyInputMode(env, m, listeners)
  });
}

type InputModeController = ReturnType<typeof createInputModeController>;

export { createInputModeController };
export type { InputModeController };
