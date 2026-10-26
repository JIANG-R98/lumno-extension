// Builds the mode controller's modules around one shared state. A module
// gets the modules built before it directly, and reaches the rest through
// late(), which answers once every module is built.
import * as LumnoShortcutDisplay from '../../../domain/shortcut-display';
import type * as LumnoCursorTooltip from '../../ui/cursor-tooltip';
import { createModeMenuIcons } from './mode-menu-icons';
import type { ModeMenuIconsApi } from './mode-menu-icons';
import { createModeMenuLanguage } from './mode-menu-language';
import type { ModeMenuLanguageApi } from './mode-menu-language';
import { createModeMenuLayout } from './mode-menu-layout';
import type { ModeMenuLayoutApi } from './mode-menu-layout';
import { createModeMenuLifecycle } from './mode-menu-lifecycle';
import type { ModeMenuLifecycleApi } from './mode-menu-lifecycle';
import { createModeMenuNavigation } from './mode-menu-navigation';
import type { ModeMenuNavigationApi } from './mode-menu-navigation';
import { createModeMenuRender } from './mode-menu-render';
import type { ModeMenuRenderApi } from './mode-menu-render';
import { createModeMenuSearch } from './mode-menu-search';
import type { ModeMenuSearchApi } from './mode-menu-search';
import { createModeTabKeys } from './mode-tab-keys';
import type { ModeTabKeysApi } from './mode-tab-keys';
import { createPrefixContent } from './prefix-content';
import type { PrefixContentApi } from './prefix-content';
import { createPrefixMotion } from './prefix-motion';
import type { PrefixMotionApi } from './prefix-motion';
import { createPrefixText } from './prefix-text';
import type { PrefixTextApi } from './prefix-text';
import { createPrefixVisual } from './prefix-visual';
import type { PrefixVisualApi } from './prefix-visual';
import { getModeLineIconPaths } from './line-icons';
import { MODE_TAG_ITEM_GAP_PX } from './mode-tag-model';
import type { ModeTagModel, TabHintModel } from './mode-tag-model';
import { MODE_MENU_PINYIN_FALLBACKS } from './pinyin-runtime';
import type { PinyinApi } from './mode-menu-search';
import { getAccessibleThemeFocusRingRgb, getAccessibleThemeTextRgb, mixRgb } from './theme-colors';
import {
  DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION,
  DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT,
  DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT,
  DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET,
  DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION,
  DEFAULT_PREFIX_ENTER_DURATION,
  DEFAULT_PREFIX_ENTER_EASING,
  DEFAULT_PREFIX_ICON_EXIT_DURATION,
  DEFAULT_PREFIX_ICON_EXIT_EASING,
  DEFAULT_PREFIX_ICON_POP_DURATION,
  DEFAULT_PREFIX_ICON_POP_EASING,
  DEFAULT_PREFIX_RESIZE_DURATION,
  DEFAULT_PREFIX_RESIZE_EASING,
  isElementVisible,
  setStyle
} from './controller-setup';
import type { ControllerOptions } from './controller-setup';
import type {
  InputModeConfig,
  InputModeParts,
  InputModeState,
  InputModeWindow,
  ModeMenuTooltipController
} from './controller-types';

type InputModeModules = ModeMenuIconsApi &
  ModeMenuLanguageApi &
  ModeMenuLayoutApi &
  ModeMenuLifecycleApi &
  ModeMenuNavigationApi &
  ModeMenuRenderApi &
  ModeMenuSearchApi &
  ModeTabKeysApi &
  PrefixContentApi &
  PrefixMotionApi &
  PrefixTextApi &
  PrefixVisualApi;

// What every module is built from: the surface's options, its elements,
// the shared state, and the controller's own drawing and placeholder steps.
interface InputModeEnv extends ControllerOptions {
  config: InputModeConfig;
  parts: InputModeParts;
  doc: Document;
  win: InputModeWindow;
  input: HTMLInputElement;
  container: HTMLElement;
  inputModeState: InputModeState;
  modeMenuCursorTooltipController: ModeMenuTooltipController | null;
  // The tooltip the menu made itself, destroyed with it.
  ownedModeMenuCursorTooltipController: ReturnType<typeof LumnoCursorTooltip.createController> | null;
  updateModeTag(patch: Partial<ModeTagModel>): void;
  updateTabHint(patch: Partial<TabHintModel>): void;
  syncInputPlaceholder(): void;
  requestModeMenuPinyinRuntime(): PromiseLike<unknown> | null | undefined;
  getModeMenuPinyinApi(): PinyinApi | null;
}

function wireModeMenuSurface(env: InputModeEnv, late: () => InputModeModules): ModeMenuLayoutApi & ModeMenuRenderApi {
  const { parts, config, inputModeState } = env;
  const layout = createModeMenuLayout({
    setStyle,
    modeMenu: parts.modeMenu,
    container: env.container,
    win: env.win,
    doc: env.doc,
    DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET,
    config,
    renderModeMenuView: () => late().renderModeMenuView(),
    inputModeState
  });
  const render = createModeMenuRender({
    view: parts.modeMenuView,
    modeMenuContent: parts.modeMenuContent,
    canMoveModeMenuGroups: env.canMoveModeMenuGroups,
    canReorderModeMenu: env.canReorderModeMenu,
    config,
    buildModeMenuSearchIndex: (...args) => late().buildModeMenuSearchIndex(...args),
    normalizeModeMenuSearchText: (...args) => late().normalizeModeMenuSearchText(...args),
    getModeMenuItemMatch: (...args) => late().getModeMenuItemMatch(...args),
    bindModeMenuLabelTooltip: (...args) => late().bindModeMenuLabelTooltip(...args),
    getModeMenuTileIcon: (...args) => late().getModeMenuTileIcon(...args),
    getModeMenuTileColors: (...args) => late().getModeMenuTileColors(...args),
    requestModeMenuProviderThemes: (...args) => late().requestModeMenuProviderThemes(...args),
    getModeMenuLabels: (...args) => late().getModeMenuLabels(...args),
    selectModeMenuItem: (...args) => late().selectModeMenuItem(...args),
    handleMenuKeydown: (...args) => late().handleMenuKeydown(...args),
    handleModeMenuPointerDown: (...args) => late().handleModeMenuPointerDown(...args),
    attachFaviconData: env.attachFaviconData,
    updateModeMenuFooterAlignment: (...args) => late().updateModeMenuFooterAlignment(...args),
    notifyModeMenuLayoutChange: layout.notifyModeMenuLayoutChange,
    input: env.input,
    inputModeState
  });
  return { ...layout, ...render };
}

function wireModeMenuLifecycle(env: InputModeEnv, prev: ModeMenuLayoutApi & ModeMenuRenderApi, late: () => InputModeModules): ModeMenuLifecycleApi {
  const { parts } = env;
  const lifecycle = createModeMenuLifecycle({
    config: env.config,
    refreshModeMenuLanguage: (...args) => late().refreshModeMenuLanguage(...args),
    resetModeMenuDoubleTab: (...args) => late().resetModeMenuDoubleTab(...args),
    resetModeTagRemovalConfirmation: (...args) => late().resetModeTagRemovalConfirmation(...args),
    setModeMenuItems: prev.setModeMenuItems,
    renderModeMenuView: prev.renderModeMenuView,
    clearModeMenuProviderThemes: () => late().clearModeMenuProviderThemes(),
    modeMenu: parts.modeMenu,
    input: env.input,
    syncInputPlaceholder: env.syncInputPlaceholder,
    updateModeMenuFooterAlignment: (...args) => late().updateModeMenuFooterAlignment(...args),
    revealModeMenuSurface: prev.revealModeMenuSurface,
    container: env.container,
    siteSearchPrefix: parts.modePrefix,
    updateModeTag: env.updateModeTag,
    setInputModePrefixMenuOpen: (...args) => late().setInputModePrefixMenuOpen(...args),
    notifyModeMenuLayoutChange: prev.notifyModeMenuLayoutChange,
    focusModeInput: (...args) => late().focusModeInput(...args),
    focusModeMenuSearch: (...args) => late().focusModeMenuSearch(...args),
    focusModeMenuButton: (...args) => late().focusModeMenuButton(...args),
    requestModeMenuPinyinRuntime: env.requestModeMenuPinyinRuntime,
    getModeMenuButtons: (...args) => late().getModeMenuButtons(...args),
    cancelModeMenuRevealFrame: prev.cancelModeMenuRevealFrame,
    modeMenuCursorTooltipController: env.modeMenuCursorTooltipController,
    setModeMenuSearchActive: (...args) => late().setModeMenuSearchActive(...args),
    concealModeMenuSurface: prev.concealModeMenuSurface,
    getModeMenuActiveElement: (...args) => late().getModeMenuActiveElement(...args),
    applyModeMenuFilter: prev.applyModeMenuFilter,
    focusFirstModeMenuFilterResult: (...args) => late().focusFirstModeMenuFilterResult(...args),
    getModeMenuDirectionalIndex: (...args) => late().getModeMenuDirectionalIndex(...args),
    selectModeMenuItem: (...args) => late().selectModeMenuItem(...args),
    handleModeMenuTabFocusToggle: (...args) => late().handleModeMenuTabFocusToggle(...args),
    shouldHandleModeMenuKeyEvent: (...args) => late().shouldHandleModeMenuKeyEvent(...args),
    inputModeState: env.inputModeState
  });
  return { ...lifecycle };
}

function wireModeMenuKeys(env: InputModeEnv, prev: ModeMenuLifecycleApi & ModeMenuRenderApi, late: () => InputModeModules): ModeMenuNavigationApi & ModeTabKeysApi {
  const { parts, config, inputModeState } = env;
  const navigation = createModeMenuNavigation({
    modeMenu: parts.modeMenu,
    modeMenuContent: parts.modeMenuContent,
    doc: env.doc,
    input: env.input,
    DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT,
    DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT,
    win: env.win,
    normalizeModeMenuSearchText: (...args) => late().normalizeModeMenuSearchText(...args),
    config,
    refreshModeMenu: prev.refreshModeMenu,
    renderModeMenuView: prev.renderModeMenuView,
    setModeMenuSelection: prev.setModeMenuSelection,
    inputModeState
  });
  const tabKeys = createModeTabKeys({
    win: env.win,
    config,
    input: env.input,
    siteSearchPrefix: parts.modePrefix,
    DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION,
    getModeMenuActiveElement: navigation.getModeMenuActiveElement,
    modeMenu: parts.modeMenu,
    focusModeInput: navigation.focusModeInput,
    focusModeMenuSearch: navigation.focusModeMenuSearch,
    DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION,
    inputModeState
  });
  return { ...navigation, ...tabKeys };
}

function wirePrefixVisual(env: InputModeEnv, prev: ModeMenuLayoutApi, late: () => InputModeModules): PrefixVisualApi & ModeMenuIconsApi {
  const { parts } = env;
  const visual = createPrefixVisual({
    win: env.win,
    surface: env.surface,
    getModeMenuLineIconPaths: getModeLineIconPaths,
    isDarkMode: env.isDarkMode,
    getThemeForMode: env.getThemeForMode,
    defaultTheme: env.defaultTheme,
    parseCssColor: env.parseCssColor,
    defaultAccentColor: env.defaultAccentColor,
    mixRgb,
    getAccessibleThemeTextRgb,
    rgbToCss: env.rgbToCss,
    setStyle,
    container: env.container,
    siteSearchPrefix: parts.modePrefix,
    updateModeTag: env.updateModeTag,
    input: env.input,
    getExtraRightInset: env.getExtraRightInset,
    rightAnchorOffset: env.rightAnchorOffset,
    rightReserveBase: env.rightReserveBase,
    siteSearchTabHint: parts.modeTabHint,
    isElementVisible,
    setInputStyle: env.setInputStyle,
    config: env.config,
    configuredBaseInputPaddingLeft: env.configuredBaseInputPaddingLeft,
    prefixGap: env.prefixGap,
    modeMenu: parts.modeMenu,
    modeMenuContent: parts.modeMenuContent,
    modeMenuFooter: parts.modeMenuFooter,
    notifyModeMenuLayoutChange: prev.notifyModeMenuLayoutChange,
    inputModeState: env.inputModeState
  });
  const icons = createModeMenuIcons({
    getThemeForMode: env.getThemeForMode,
    defaultTheme: env.defaultTheme,
    parseCssColor: env.parseCssColor,
    defaultAccentColor: env.defaultAccentColor,
    mixRgb,
    isDarkMode: env.isDarkMode,
    getAccessibleThemeFocusRingRgb,
    rgbToCss: env.rgbToCss,
    getBuiltInSurfaceColor: visual.getBuiltInSurfaceColor,
    getThemeForProvider: env.getThemeForProvider,
    resolveProviderIconUrl: env.resolveProviderIconUrl,
    getProviderThemeHost: env.getProviderThemeHost,
    onProviderThemesChange: () => late().renderModeMenuView(),
    inputModeState: env.inputModeState
  });
  return { ...visual, ...icons };
}

function wirePrefixContent(env: InputModeEnv, prev: PrefixVisualApi, late: () => InputModeModules): PrefixContentApi & PrefixMotionApi {
  const { parts } = env;
  const content = createPrefixContent({
    siteSearchPrefix: parts.modePrefix,
    siteSearchPrefixLineIcon: parts.modePrefixLineIcon,
    siteSearchPrefixIconFrame: parts.modePrefixIconFrame,
    siteSearchPrefixGlyph: parts.modePrefixGlyph,
    siteSearchPrefixCurrent: parts.modePrefixCurrent,
    formatMessage: env.formatMessage,
    setStyle,
    shouldReduceInputModeMotion: prev.shouldReduceInputModeMotion,
    isElementVisible,
    DEFAULT_PREFIX_ICON_POP_DURATION,
    DEFAULT_PREFIX_ICON_POP_EASING,
    DEFAULT_PREFIX_ICON_EXIT_DURATION,
    DEFAULT_PREFIX_ICON_EXIT_EASING,
    resolveProviderIconUrl: env.resolveProviderIconUrl,
    updatePrefixLayout: prev.updatePrefixLayout,
    updateModeTag: env.updateModeTag,
    win: env.win,
    inputModeState: env.inputModeState
  });
  const motion = createPrefixMotion({
    siteSearchPrefixCurrent: parts.modePrefixCurrent,
    setStyle,
    shouldReduceInputModeMotion: prev.shouldReduceInputModeMotion,
    updatePrefixLayout: prev.updatePrefixLayout,
    DEFAULT_PREFIX_RESIZE_DURATION,
    DEFAULT_PREFIX_RESIZE_EASING,
    win: env.win,
    siteSearchPrefix: parts.modePrefix,
    prefixTransition: env.prefixTransition,
    DEFAULT_PREFIX_ENTER_DURATION,
    DEFAULT_PREFIX_ENTER_EASING,
    isElementVisible,
    getInputModePrefixCurrentVisualState: content.getInputModePrefixCurrentVisualState,
    DEFAULT_PREFIX_ITEM_GAP_PX: MODE_TAG_ITEM_GAP_PX,
    updateModeTag: env.updateModeTag,
    inputModeState: env.inputModeState
  });
  return { ...content, ...motion };
}

function wirePrefixText(env: InputModeEnv, prev: ModeMenuLifecycleApi & ModeTabKeysApi & PrefixVisualApi & PrefixContentApi & PrefixMotionApi, late: () => InputModeModules): PrefixTextApi {
  const text = createPrefixText({
    config: env.config,
    siteSearchPrefix: env.parts.modePrefix,
    updateModeTag: env.updateModeTag,
    updateTabHint: env.updateTabHint,
    resetModeMenuDoubleTab: prev.resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation: prev.resetModeTagRemovalConfirmation,
    isElementVisible,
    getInputModePrefixRenderedWidth: prev.getInputModePrefixRenderedWidth,
    cancelInputModePrefixAnimation: prev.cancelInputModePrefixAnimation,
    settleInputModePrefixMenuVisualState: prev.settleInputModePrefixMenuVisualState,
    setStyle,
    prefixTransition: env.prefixTransition,
    setInputModePrefixIdentity: prev.setInputModePrefixIdentity,
    applyInputModePrefixVisual: prev.applyInputModePrefixVisual,
    syncInputPlaceholder: env.syncInputPlaceholder,
    setInputStyle: env.setInputStyle,
    input: env.input,
    updatePrefixLayout: prev.updatePrefixLayout,
    measureInputModePrefixWidthForText: prev.measureInputModePrefixWidthForText,
    playInputModePrefixResizeAnimation: prev.playInputModePrefixResizeAnimation,
    setInputModePrefixContent: prev.setInputModePrefixContent,
    setInputModePrefixRestState: prev.setInputModePrefixRestState,
    playInputModePrefixEnterAnimation: prev.playInputModePrefixEnterAnimation,
    isAiSiteSearchProvider: env.isAiSiteSearchProvider,
    getProviderIcon: env.getProviderIcon,
    getProviderThemeHost: env.getProviderThemeHost,
    getSiteSearchPrefixText: env.getSiteSearchPrefixText,
    cancelInputModePrefixIconAnimation: prev.cancelInputModePrefixIconAnimation,
    closeModeMenu: prev.closeModeMenu,
    getDefaultPlaceholder: env.getDefaultPlaceholder,
    defaultCaretColor: env.defaultCaretColor,
    getSiteSearchDisplayName: env.getSiteSearchDisplayName,
    formatMessage: env.formatMessage,
    win: env.win,
    updateInputRightPadding: prev.updateInputRightPadding,
    inputModeState: env.inputModeState
  });
  return { ...text };
}

function wireModeMenuText(env: InputModeEnv, prev: ModeMenuRenderApi, late: () => InputModeModules): ModeMenuLanguageApi & ModeMenuSearchApi {
  const language = createModeMenuLanguage({
    formatMessage: env.formatMessage,
    shortcutDisplayApi: LumnoShortcutDisplay,
    config: env.config,
    win: env.win,
    syncInputPlaceholder: env.syncInputPlaceholder,
    renderModeMenuView: prev.renderModeMenuView,
    inputModeState: env.inputModeState
  });
  const search = createModeMenuSearch({
    getModeMenuPinyinApi: env.getModeMenuPinyinApi,
    MODE_MENU_PINYIN_FALLBACKS,
    modeMenuCursorTooltipController: env.modeMenuCursorTooltipController,
    modeMenu: env.parts.modeMenu
  });
  return { ...language, ...search };
}

// Builds every module, in the order each needs the ones before it.
function wireInputModeModules(env: InputModeEnv): InputModeModules {
  let modules: InputModeModules | null = null;
  const late = (): InputModeModules => {
    if (!modules) {
      throw new Error('The input mode modules are still being built.');
    }
    return modules;
  };
  const surface = wireModeMenuSurface(env, late);
  const lifecycle = wireModeMenuLifecycle(env, surface, late);
  const keys = wireModeMenuKeys(env, { ...surface, ...lifecycle }, late);
  const visual = wirePrefixVisual(env, surface, late);
  const content = wirePrefixContent(env, visual, late);
  const text = wirePrefixText(env, { ...lifecycle, ...keys, ...visual, ...content }, late);
  const menuText = wireModeMenuText(env, surface, late);
  modules = { ...surface, ...lifecycle, ...keys, ...visual, ...content, ...text, ...menuText };
  return modules;
}

export type { InputModeEnv, InputModeModules };
export { wireInputModeModules };
