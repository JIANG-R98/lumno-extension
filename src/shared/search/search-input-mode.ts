// The search box's mode: the tag at the input's start that says where a
// search goes (a site, an AI, bookmarks, history), its Tab hint, and the
// mode menu (the search scope panel). The parts live in search/input-mode/;
// this file builds them around one shared state.
import * as LumnoShortcutDisplay from '../../domain/shortcut-display';
import { getHanVariantPairs, installHanVariantPairs, readHanVariantModule } from '../../domain/search/han-variants';
import * as LumnoCursorTooltip from '../ui/cursor-tooltip';
import * as INPUT_MODE_MODE_MENU_ICONS from './input-mode/mode-menu-icons';
import * as INPUT_MODE_MODE_MENU_LANGUAGE from './input-mode/mode-menu-language';
import * as INPUT_MODE_MODE_MENU_LAYOUT from './input-mode/mode-menu-layout';
import * as INPUT_MODE_MODE_MENU_LIFECYCLE from './input-mode/mode-menu-lifecycle';
import * as INPUT_MODE_MODE_MENU_NAVIGATION from './input-mode/mode-menu-navigation';
import * as INPUT_MODE_MODE_MENU_RENDER from './input-mode/mode-menu-render';
import * as INPUT_MODE_MODE_MENU_SEARCH from './input-mode/mode-menu-search';
import * as INPUT_MODE_MODE_TAB_KEYS from './input-mode/mode-tab-keys';
import * as INPUT_MODE_PREFIX_CONTENT from './input-mode/prefix-content';
import * as INPUT_MODE_PREFIX_MOTION from './input-mode/prefix-motion';
import * as INPUT_MODE_PREFIX_TEXT from './input-mode/prefix-text';
import * as INPUT_MODE_PREFIX_VISUAL from './input-mode/prefix-visual';
import type { NavigatorLike } from '../../domain/shortcut-display';
import type { CursorTooltipController } from '../ui/cursor-tooltip';
import type { ModeMenuIconsState } from './input-mode/mode-menu-icons';
import type { ModeMenuLanguageConfig, ModeMenuLanguageState } from './input-mode/mode-menu-language';
import type { ModeMenuLayoutConfig, ModeMenuLayoutState } from './input-mode/mode-menu-layout';
import type { ModeMenuLifecycleConfig, ModeMenuLifecycleState } from './input-mode/mode-menu-lifecycle';
import type { ModeMenuNavigationConfig, ModeMenuNavigationState } from './input-mode/mode-menu-navigation';
import type { ModeMenuRenderConfig, ModeMenuRenderState } from './input-mode/mode-menu-render';
import type { PinyinApi } from './input-mode/mode-menu-search';
import type { ModeTabKeysConfig, ModeTabKeysState } from './input-mode/mode-tab-keys';
import type { PrefixContentState } from './input-mode/prefix-content';
import type { PrefixMotionState } from './input-mode/prefix-motion';
import type { PrefixTextConfig, PrefixTextState } from './input-mode/prefix-text';
import type { PrefixVisualConfig, PrefixVisualState } from './input-mode/prefix-visual';
import type {
  AttachFaviconData,
  FormatMessage,
  GetThemeForProvider,
  InputModeProvider,
  InputModeTheme,
  ResolveProviderIconUrl,
  Rgb
} from './input-mode/types';
import { getModeLineIconPaths } from './input-mode/line-icons';
import type { ModeMenuView } from '../react/search/mode-menu';
import type { ModeTagHandlers, ModeTagView, TabHintView } from '../react/search/mode-tag';
import { EMPTY_MODE_TAG, MODE_TAG_ITEM_GAP_PX } from './input-mode/mode-tag-model';
import type { ModeTagModel, TabHintModel } from './input-mode/mode-tag-model';

// The elements the surface's React view draws for the mode, and the views
// the controller draws them through. The controller animates and measures
// the elements.
interface InputModeParts {
  container: HTMLElement;
  input: HTMLInputElement;
  modePrefix: HTMLElement;
  modePrefixIconFrame: HTMLElement;
  modePrefixGlyph: HTMLElement;
  modePrefixLineIcon: SVGElement;
  modePrefixCurrent: HTMLElement;
  modeTabHint: HTMLElement;
  modeTagView: ModeTagView;
  tabHintView: TabHintView;
  // The mode menu, with its scrolling content and footer.
  modeMenu: HTMLElement;
  modeMenuContent: HTMLElement;
  modeMenuFooter: HTMLElement;
  modeMenuView: ModeMenuView;
}

type ModeMenuTooltipController = Pick<CursorTooltipController, 'bind' | 'hide'>;

// The page window, with the resize observer the layout follows.
type InputModeWindow = Window & { ResizeObserver?: typeof ResizeObserver };

// The surface's options; the modules read their own parts of them.
interface InputModeOwnConfig {
  document?: Document | null;
  windowObj?: InputModeWindow | null;
  surface?: 'newtab' | 'overlay';
  setInputStyle?: (target: HTMLElement, property: string, value: string) => void;
  formatMessage?: FormatMessage;
  getThemeForMode?: (theme: InputModeTheme) => InputModeTheme | null | undefined;
  getSiteSearchPrefixText?: (provider: InputModeProvider | null | undefined) => string;
  getSiteSearchDisplayName?: (provider: InputModeProvider | null | undefined) => string;
  getProviderIcon?: (provider: InputModeProvider | null | undefined) => string;
  resolveProviderIconUrl?: ResolveProviderIconUrl;
  getProviderThemeHost?: (provider: InputModeProvider | null | undefined) => string;
  getThemeForProvider?: GetThemeForProvider;
  isAiSiteSearchProvider?: (provider: InputModeProvider | null | undefined) => boolean;
  attachFaviconData?: AttachFaviconData;
  isDarkMode?: () => unknown;
  parseCssColor?: (color: unknown) => Rgb | null;
  rgbToCss?: (rgb: Rgb) => string;
  defaultTheme?: InputModeTheme;
  defaultAccentColor?: Rgb;
  // The gap between the tag and the typed text.
  prefixGap?: number;
  // Space kept at the input's right, and where its right-side hints sit.
  rightReserveBase?: number;
  rightAnchorOffset?: number;
  getExtraRightInset?: () => unknown;
  baseInputPaddingLeft?: number;
  prefixTransition?: string;
  defaultPlaceholder?: string;
  getDefaultPlaceholder?: () => string;
  defaultCaretColor?: string;
  // Loads pinyin-pro for the menu's filter; the bundled copy by default.
  loadPinyinRuntime?: () => unknown;
  // The surface's cursor tooltip for cut-off menu labels; the menu makes its own without one.
  modeMenuCursorTooltipController?: ModeMenuTooltipController | null;
  modeMenuTooltipController?: ModeMenuTooltipController | null;
  navigatorLike?: NavigatorLike | null;
}

type InputModeConfig = InputModeOwnConfig &
  ModeTabKeysConfig &
  ModeMenuLanguageConfig &
  ModeMenuLayoutConfig &
  ModeMenuLifecycleConfig &
  ModeMenuNavigationConfig &
  ModeMenuRenderConfig &
  PrefixTextConfig &
  PrefixVisualConfig;

// The state this controller shares with its modules: each takes it as
// `inputModeState` and reads and writes the same properties.
type InputModeState = ModeMenuIconsState &
  ModeMenuLanguageState &
  ModeMenuLayoutState &
  ModeMenuLifecycleState &
  ModeMenuNavigationState &
  ModeMenuRenderState &
  ModeTabKeysState &
  PrefixContentState &
  PrefixMotionState &
  PrefixTextState &
  PrefixVisualState;

// The traditional-to-simplified table, built as its own module so pages load
// it only when the scope panel's filter first needs it.
const HAN_VARIANTS_MODULE_PATH = 'build/han-variants.js';
const DEFAULT_ACCENT_RGB: Rgb = [59, 130, 246];
const DEFAULT_PREFIX_GAP = 8;
const DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION = 700;
const DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION = 2200;
const DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET = 24;
const DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT = 44;
const DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT = 16;
const DEFAULT_PREFIX_ICON_POP_DURATION = 180;
const DEFAULT_PREFIX_ICON_POP_EASING = 'linear';
const DEFAULT_PREFIX_ICON_EXIT_DURATION = 100;
const DEFAULT_PREFIX_ICON_EXIT_EASING = 'cubic-bezier(0.4, 0, 1, 1)';
const DEFAULT_PREFIX_RESIZE_DURATION = 140;
const DEFAULT_PREFIX_RESIZE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DEFAULT_PREFIX_ENTER_DURATION = 180;
const DEFAULT_PREFIX_ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const DEFAULT_PREFIX_TRANSITION = 'background-color 140ms ease, color 140ms ease';
const MIN_PREFIX_TEXT_CONTRAST = 4.5;
const MODE_MENU_PINYIN_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
  书: 'shu',
  信: 'xin',
  元: 'yuan',
  众: 'zhong',
  包: 'bao',
  千: 'qian',
  历: 'li',
  号: 'hao',
  天: 'tian',
  常: 'chang',
  已: 'yi',
  开: 'kai',
  微: 'wei',
  打: 'da',
  搜: 'sou',
  掘: 'jue',
  标: 'biao',
  淘: 'tao',
  猫: 'mao',
  用: 'yong',
  百: 'bai',
  知: 'zhi',
  签: 'qian',
  索: 'suo',
  维: 'wei',
  翻: 'fan',
  豆: 'dou',
  金: 'jin',
  问: 'wen',
  页: 'ye',
  度: 'du',
  乎: 'hu',
  瓣: 'ban',
  公: 'gong',
  基: 'ji',
  科: 'ke',
  史: 'shi'
});

function getDocument(options: InputModeConfig): Document | null {
  return options.document || globalThis.document || null;
}

function getWindow(options: InputModeConfig): InputModeWindow {
  return options.windowObj || globalThis.window;
}

function setStyle(
  element: ElementCSSInlineStyle | null | undefined,
  property: string,
  value: string
): void {
  if (!element || !element.style) {
    return;
  }
  element.style.setProperty(property, value);
}

function hasInlineStyle(element: Element): element is Element & ElementCSSInlineStyle {
  return 'style' in element;
}

function isElementVisible(element: Element | null | undefined): boolean {
  if (!element) {
    return false;
  }
  const visibleState = element.getAttribute('data-visible');
  if (visibleState === 'true') {
    return true;
  }
  if (visibleState === 'false') {
    return false;
  }
  return hasInlineStyle(element) && element.style.getPropertyValue('display') !== 'none';
}

function defaultRgbToCss(rgb: Rgb): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function defaultParseCssColor(color: unknown): Rgb | null {
  if (!color || typeof color !== 'string') {
    return null;
  }
  const trimmed = color.trim().toLowerCase();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : null;
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : null;
    }
    return null;
  }
  const rgbMatch = trimmed.match(/^rgb\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)$/);
  if (!rgbMatch) {
    return null;
  }
  const rgb = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  return rgb.every((value) => Number.isFinite(value)) ? rgb : null;
}

function mixRgb(source: Rgb | null | undefined, target: Rgb | null | undefined, targetWeight: number): Rgb {
  const weight = Math.min(1, Math.max(0, Number(targetWeight) || 0));
  return [0, 1, 2].map((index) => {
    const sourceValue = Number(source && source[index]);
    const targetValue = Number(target && target[index]);
    const from = Number.isFinite(sourceValue) ? sourceValue : DEFAULT_ACCENT_RGB[index];
    const to = Number.isFinite(targetValue) ? targetValue : from;
    return Math.round(from + ((to - from) * weight));
  });
}

function getRelativeLuminance(rgb: Rgb): number {
  const channels = [0, 1, 2].map((index) => {
    const value = Math.min(255, Math.max(0, Number(rgb && rgb[index]) || 0)) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function getContrastRatio(firstRgb: Rgb, secondRgb: Rgb): number {
  const firstLuminance = getRelativeLuminance(firstRgb);
  const secondLuminance = getRelativeLuminance(secondRgb);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

// The accent, moved towards dark or light until it reads on the background.
function getAccessibleThemeColorRgb(accentRgb: Rgb, backgroundRgb: Rgb, minimumContrast: number): Rgb {
  const darkTarget: Rgb = [15, 23, 42];
  const lightTarget: Rgb = [248, 250, 252];
  const requiredContrast = Number(minimumContrast) || MIN_PREFIX_TEXT_CONTRAST;
  if (getContrastRatio(accentRgb, backgroundRgb) >= requiredContrast) {
    return accentRgb.slice();
  }
  const target = getContrastRatio(darkTarget, backgroundRgb) >=
    getContrastRatio(lightTarget, backgroundRgb)
    ? darkTarget
    : lightTarget;
  let lowerWeight = 0;
  let upperWeight = 1;
  let readableColor = target.slice();
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const weight = (lowerWeight + upperWeight) / 2;
    const candidate = mixRgb(accentRgb, target, weight);
    if (getContrastRatio(candidate, backgroundRgb) >= requiredContrast) {
      readableColor = candidate;
      upperWeight = weight;
    } else {
      lowerWeight = weight;
    }
  }
  return readableColor;
}

function getAccessibleThemeTextRgb(accentRgb: Rgb, backgroundRgb: Rgb): Rgb {
  return getAccessibleThemeColorRgb(
    accentRgb,
    backgroundRgb,
    MIN_PREFIX_TEXT_CONTRAST
  );
}

function getAccessibleThemeFocusRingRgb(accentRgb: Rgb, backgroundRgb: Rgb): Rgb {
  return getAccessibleThemeColorRgb(accentRgb, backgroundRgb, 3);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return value !== undefined && value !== null && Number.isFinite(parsed) ? parsed : null;
}

// pinyin-pro sets globalThis.pinyinPro when its script runs.
function getModeMenuPinyinApi(): PinyinApi | null {
  const api: unknown = Reflect.get(globalThis, 'pinyinPro');
  if (!api || typeof api !== 'object') {
    return null;
  }
  const pinyin: unknown = Reflect.get(api, 'pinyin');
  if (typeof pinyin !== 'function') {
    return null;
  }
  return {
    pinyin: (text, options) => Reflect.apply(pinyin, api, [text, options])
  };
}

function isPinyinApiLike(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && value !== null &&
    typeof Reflect.get(value, 'pinyin') === 'function';
}

function createInputModeController(parts: InputModeParts, options?: InputModeConfig | null) {
  const config: InputModeConfig = options || {};
  const pageDocument = getDocument(config);
  const win = getWindow(config);
  if (!pageDocument || !parts || !parts.container || !parts.input) {
    throw new Error('createInputModeController requires input parts');
  }
  const doc: Document = pageDocument;

  const input = parts.input;
  const container = parts.container;
  const surface = config.surface === 'overlay' ? 'overlay' : 'newtab';
  const setInputStyle = typeof config.setInputStyle === 'function'
    ? config.setInputStyle
    : (target: HTMLElement, property: string, value: string) => setStyle(target, property, value);
  const formatMessage: FormatMessage = typeof config.formatMessage === 'function'
    ? config.formatMessage
    : (_key, fallback, values) => String(fallback || '').replace(/\{([^}]+)\}/g, (match, token: string) => {
      return values && hasOwn(values, token)
        ? String(values[token])
        : match;
    });
  const getThemeForMode = typeof config.getThemeForMode === 'function'
    ? config.getThemeForMode
    : (theme: InputModeTheme) => theme || config.defaultTheme || {};
  const getSiteSearchPrefixText = typeof config.getSiteSearchPrefixText === 'function'
    ? config.getSiteSearchPrefixText
    : (provider: InputModeProvider | null | undefined) => (provider && (provider.name || provider.key) ? (provider.name || provider.key) : '');
  const getSiteSearchDisplayName = typeof config.getSiteSearchDisplayName === 'function'
    ? config.getSiteSearchDisplayName
    : getSiteSearchPrefixText;
  const getProviderIcon = typeof config.getProviderIcon === 'function'
    ? config.getProviderIcon
    : () => '';
  const resolveProviderIconUrl: ResolveProviderIconUrl = typeof config.resolveProviderIconUrl === 'function'
    ? config.resolveProviderIconUrl
    : (_provider, iconUrl) => iconUrl;
  const getProviderThemeHost = typeof config.getProviderThemeHost === 'function'
    ? config.getProviderThemeHost
    : () => '';
  const getThemeForProvider = typeof config.getThemeForProvider === 'function'
    ? config.getThemeForProvider
    : null;
  const isAiSiteSearchProvider = typeof config.isAiSiteSearchProvider === 'function'
    ? config.isAiSiteSearchProvider
    : () => false;
  const attachFaviconData = typeof config.attachFaviconData === 'function'
    ? config.attachFaviconData
    : null;
  const isDarkMode = typeof config.isDarkMode === 'function'
    ? config.isDarkMode
    : () => false;
  const parseCssColor = typeof config.parseCssColor === 'function'
    ? config.parseCssColor
    : defaultParseCssColor;
  const rgbToCss = typeof config.rgbToCss === 'function'
    ? config.rgbToCss
    : defaultRgbToCss;
  const defaultTheme: InputModeTheme = config.defaultTheme || {};
  const cursorTooltipApi = LumnoCursorTooltip;
  const shortcutDisplayApi = LumnoShortcutDisplay;
  const defaultAccentColor = Array.isArray(config.defaultAccentColor)
    ? config.defaultAccentColor
    : DEFAULT_ACCENT_RGB;
  const prefixGap = readNumber(config.prefixGap) ?? DEFAULT_PREFIX_GAP;
  const rightReserveBase = readNumber(config.rightReserveBase) ?? (surface === 'overlay' ? 92 : 64);
  const rightAnchorOffset = readNumber(config.rightAnchorOffset) ?? (surface === 'overlay' ? 86 : 52);
  // Extra width taken by optional right-side actions (e.g. a clear button) shown beside the base icon.
  const configuredExtraRightInset = config.getExtraRightInset;
  const getExtraRightInset = typeof configuredExtraRightInset === 'function'
    ? () => {
      const extra = Number(configuredExtraRightInset());
      return Number.isFinite(extra) && extra > 0 ? extra : 0;
    }
    : null;
  const configuredBaseInputPaddingLeft = readNumber(config.baseInputPaddingLeft);
  const prefixTransition = config.prefixTransition || DEFAULT_PREFIX_TRANSITION;
  const defaultPlaceholder = hasOwn(config, 'defaultPlaceholder')
    ? String(config.defaultPlaceholder ?? '')
    : input.placeholder;
  const getDefaultPlaceholder = typeof config.getDefaultPlaceholder === 'function'
    ? config.getDefaultPlaceholder
    : () => defaultPlaceholder;
  const defaultCaretColor = hasOwn(config, 'defaultCaretColor')
    ? String(config.defaultCaretColor ?? '')
    : (input.style.caretColor || 'var(--x-ext-input-caret, #7DB7FF)');
  let layoutResizeObserver: ResizeObserver | null = null;
  const canReorderModeMenu = typeof config.onModeMenuReorder === 'function';
  const canMoveModeMenuGroups = typeof config.onModeMenuGroupMove === 'function';

  function getModeMenuPlaceholder(): string {
    return formatMessage(
      'search_scope_panel_placeholder',
      'Search specific site content…'
    );
  }

  function getModeActivePlaceholder(): string {
    return formatMessage(
      'search_scope_active_placeholder',
      'Search within this scope; press Tab again to open the scope panel…'
    );
  }

  function hasVisibleModePrefix(): boolean {
    return siteSearchPrefix.style.getPropertyValue('display') !== 'none';
  }

  function syncInputPlaceholder(): void {
    if (inputModeState.modeMenuOpen) {
      input.placeholder = getModeMenuPlaceholder();
      return;
    }
    input.placeholder = hasVisibleModePrefix()
      ? getModeActivePlaceholder()
      : getDefaultPlaceholder();
  }

  function ensureModeMenuPinyinRuntime(): Promise<unknown> | null {
    const existingApi = getModeMenuPinyinApi();
    if (existingApi && typeof existingApi.pinyin === 'function') {
      return null;
    }
    if (typeof config.loadPinyinRuntime === 'function') {
      return Promise.resolve(config.loadPinyinRuntime()).catch(() => null);
    }
    const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
    if (!chromeApi || !chromeApi.runtime ||
        typeof chromeApi.runtime.getURL !== 'function') {
      return null;
    }
    try {
      return import(chromeApi.runtime.getURL('assets/vendor/pinyin-pro.js'))
        .then(() => getModeMenuPinyinApi())
        .catch(() => null);
    } catch (_error) {
      return null;
    }
  }
  // The traditional-to-simplified table the shared matcher folds with, so
  // 臺灣 finds a card named 台湾 and the other way round.
  function ensureModeMenuHanVariants(): Promise<boolean | null> | null {
    const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
    if (getHanVariantPairs() || !chromeApi || !chromeApi.runtime ||
        typeof chromeApi.runtime.getURL !== 'function') {
      return null;
    }
    try {
      return import(chromeApi.runtime.getURL(HAN_VARIANTS_MODULE_PATH))
        .then((loaded: unknown) => {
          const pairs = readHanVariantModule(loaded);
          if (pairs) {
            installHanVariantPairs(pairs);
          }
          return Boolean(pairs);
        })
        .catch(() => null);
    } catch (_error) {
      return null;
    }
  }
  // Only the scope panel's filter reads pinyin, so the runtime loads on the first typed
  // character or the first panel open, not while the page is opening.
  let modeMenuPinyinRuntimeRequested = false;
  function requestModeMenuPinyinRuntime(): PromiseLike<unknown> | null | undefined {
    if (!modeMenuPinyinRuntimeRequested) {
      modeMenuPinyinRuntimeRequested = true;
      const runtimeReady = ensureModeMenuPinyinRuntime();
      inputModeState.modeMenuPinyinRuntimeReady = runtimeReady;
      // Cards indexed from the fallback table pick up every reading, and
      // the simplified forms, once the runtime and the table arrive.
      Promise.all([runtimeReady, ensureModeMenuHanVariants()])
        .then(([api, variantsLoaded]) => {
          if (isPinyinApiLike(api) || variantsLoaded) {
            refreshModeMenuSearchIndexes();
          }
        });
    }
    return inputModeState.modeMenuPinyinRuntimeReady;
  }
  const providedModeMenuCursorTooltipController =
    config.modeMenuCursorTooltipController || config.modeMenuTooltipController || null;
  const ownedModeMenuCursorTooltipController = providedModeMenuCursorTooltipController
    ? null
    : cursorTooltipApi.createController({
      documentObj: doc,
      windowObj: win,
      appendTo: doc.body,
      id: `${parts.modePrefix.id}-label-cursor-tooltip`,
      maxWidth: 320,
      offsetX: 14,
      offsetY: 16
    });
  const modeMenuCursorTooltipController: ModeMenuTooltipController | null =
    providedModeMenuCursorTooltipController || ownedModeMenuCursorTooltipController;

  const siteSearchPrefix = parts.modePrefix;
  const siteSearchPrefixGlyph = parts.modePrefixGlyph;
  const siteSearchPrefixLineIcon = parts.modePrefixLineIcon;
  const siteSearchPrefixIconFrame = parts.modePrefixIconFrame;
  const siteSearchPrefixCurrent = parts.modePrefixCurrent;
  const siteSearchTabHint = parts.modeTabHint;
  const modeMenu = parts.modeMenu;
  const modeMenuContent = parts.modeMenuContent;
  const modeMenuFooter = parts.modeMenuFooter;

  // Where the tag sits and how it moves are the controller's: these start
  // its place and rest motion, and the Tab hint's distance from the right.
  setStyle(siteSearchPrefix, 'left', '50px');
  setStyle(siteSearchPrefix, 'transform', 'translateY(-50%)');
  setStyle(siteSearchPrefix, 'opacity', '1');
  setStyle(siteSearchPrefix, 'transition', prefixTransition);
  setStyle(siteSearchPrefix, 'will-change', 'auto');
  setStyle(siteSearchTabHint, 'right', `${rightAnchorOffset}px`);

  const inputModeState: InputModeState = {
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

  const modeTagHandlers: ModeTagHandlers = {
    onClick: (event) => handlePrefixClick(event),
    onKeyDown: (event) => handlePrefixKeydown(event),
    onIconError: () => handleModeTagIconError(),
    attachIconData(image, iconUrl, iconHost) {
      if (attachFaviconData) {
        attachFaviconData(image, iconUrl, iconHost);
      }
    }
  };

  function updateModeTag(patch: Partial<ModeTagModel>): void {
    inputModeState.modeTag = { ...inputModeState.modeTag, ...patch };
    parts.modeTagView.render(inputModeState.modeTag, modeTagHandlers);
  }

  function updateTabHint(patch: Partial<TabHintModel>): void {
    inputModeState.tabHint = { ...inputModeState.tabHint, ...patch };
    parts.tabHintView.render(inputModeState.tabHint);
  }

  const {
    setModeMenuResultOffset,
    fitModeMenuWithinViewport,
    notifyModeMenuLayoutChange,
    cancelModeMenuRevealFrame,
    isModeMenuVisible,
    revealModeMenuSurface,
    concealModeMenuSurface
  } = INPUT_MODE_MODE_MENU_LAYOUT.createModeMenuLayout({
    setStyle,
    modeMenu,
    container,
    win,
    doc,
    DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET,
    config,
    renderModeMenuView: () => renderModeMenuView(),
    inputModeState
  });



  const {
    setModeMenuItems,
    renderModeMenuView,
    handleModeMenuHistoryKeydown,
    refreshModeMenuSearchIndexes,
    applyModeMenuFilter,
    syncModeMenuQueryLift,
    setModeMenuSelection
  } = INPUT_MODE_MODE_MENU_RENDER.createModeMenuRender({
    view: parts.modeMenuView,
    modeMenuContent,
    canMoveModeMenuGroups,
    canReorderModeMenu,
    config,
    buildModeMenuSearchIndex: (...args) => buildModeMenuSearchIndex(...args),
    normalizeModeMenuSearchText: (...args) => normalizeModeMenuSearchText(...args),
    getModeMenuItemMatch: (...args) => getModeMenuItemMatch(...args),
    bindModeMenuLabelTooltip: (...args) => bindModeMenuLabelTooltip(...args),
    getModeMenuTileIcon: (...args) => getModeMenuTileIcon(...args),
    getModeMenuTileColors: (...args) => getModeMenuTileColors(...args),
    requestModeMenuProviderThemes: (...args) => requestModeMenuProviderThemes(...args),
    getModeMenuLabels: (...args) => getModeMenuLabels(...args),
    selectModeMenuItem: (...args) => selectModeMenuItem(...args),
    handleMenuKeydown: (...args) => handleMenuKeydown(...args),
    handleModeMenuPointerDown: (...args) => handleModeMenuPointerDown(...args),
    attachFaviconData,
    updateModeMenuFooterAlignment: (...args) => updateModeMenuFooterAlignment(...args),
    notifyModeMenuLayoutChange,
    input,
    inputModeState
  });

  const {
    openModeMenu,
    refreshModeMenu,
    closeModeMenu,
    handlePrefixClick,
    handlePrefixKeydown,
    handleMenuKeydown,
    handleModeMenuKeyEvent,
    handleModeMenuPointerDown,
    handleDocumentPointerDown
  } = INPUT_MODE_MODE_MENU_LIFECYCLE.createModeMenuLifecycle({
    config,
    refreshModeMenuLanguage: (...args) => refreshModeMenuLanguage(...args),
    resetModeMenuDoubleTab: (...args) => resetModeMenuDoubleTab(...args),
    resetModeTagRemovalConfirmation: (...args) => resetModeTagRemovalConfirmation(...args),
    setModeMenuItems,
    renderModeMenuView,
    clearModeMenuProviderThemes: () => clearModeMenuProviderThemes(),
    modeMenu,
    input,
    syncInputPlaceholder,
    updateModeMenuFooterAlignment: (...args) => updateModeMenuFooterAlignment(...args),
    revealModeMenuSurface,
    container,
    siteSearchPrefix,
    updateModeTag,
    setInputModePrefixMenuOpen: (...args) => setInputModePrefixMenuOpen(...args),
    notifyModeMenuLayoutChange,
    focusModeInput: (...args) => focusModeInput(...args),
    focusModeMenuSearch: (...args) => focusModeMenuSearch(...args),
    focusModeMenuButton: (...args) => focusModeMenuButton(...args),
    requestModeMenuPinyinRuntime,
    getModeMenuButtons: (...args) => getModeMenuButtons(...args),
    cancelModeMenuRevealFrame,
    modeMenuCursorTooltipController,
    setModeMenuSearchActive: (...args) => setModeMenuSearchActive(...args),
    concealModeMenuSurface,
    getModeMenuActiveElement: (...args) => getModeMenuActiveElement(...args),
    applyModeMenuFilter,
    focusFirstModeMenuFilterResult: (...args) => focusFirstModeMenuFilterResult(...args),
    getModeMenuDirectionalIndex: (...args) => getModeMenuDirectionalIndex(...args),
    selectModeMenuItem: (...args) => selectModeMenuItem(...args),
    handleModeMenuTabFocusToggle: (...args) => handleModeMenuTabFocusToggle(...args),
    shouldHandleModeMenuKeyEvent: (...args) => shouldHandleModeMenuKeyEvent(...args),
    inputModeState
  });

  const {
    getModeMenuButtons,
    getModeMenuActiveElement,
    setModeMenuSearchActive,
    focusModeMenuSearch,
    focusModeInput,
    shouldHandleModeMenuKeyEvent,
    focusModeMenuButton,
    focusFirstModeMenuFilterResult,
    getModeMenuDirectionalIndex,
    selectModeMenuItem
  } = INPUT_MODE_MODE_MENU_NAVIGATION.createModeMenuNavigation({
    modeMenu,
    modeMenuContent,
    doc,
    input,
    DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT,
    DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT,
    win,
    normalizeModeMenuSearchText: (...args) => normalizeModeMenuSearchText(...args),
    config,
    refreshModeMenu,
    renderModeMenuView,
    setModeMenuSelection,
    inputModeState
  });

  const {
    resetModeTagRemovalConfirmation,
    resetModeMenuDoubleTab,
    shouldOpenModeMenuOnDoubleTab,
    shouldCompleteModeMenuDoubleTab,
    handleModeMenuTabFocusToggle,
    shouldOpenModeMenuForActiveModeOnTab,
    shouldRemoveModeTagOnBackspace
  } = INPUT_MODE_MODE_TAB_KEYS.createModeTabKeys({
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
    inputModeState
  });

  const {
    shouldReduceInputModeMotion,
    getBuiltInSurfaceColor,
    applyInputModePrefixVisual,
    updateInputRightPadding,
    getModeBadgeElement,
    updatePrefixLayout,
    updateModeMenuFooterAlignment,
    updateLayout
  } = INPUT_MODE_PREFIX_VISUAL.createPrefixVisual({
    win,
    surface,
    getModeMenuLineIconPaths: getModeLineIconPaths,
    isDarkMode,
    getThemeForMode,
    defaultTheme,
    parseCssColor,
    defaultAccentColor,
    mixRgb,
    getAccessibleThemeTextRgb,
    rgbToCss,
    setStyle,
    container,
    siteSearchPrefix,
    updateModeTag,
    input,
    getExtraRightInset,
    rightAnchorOffset,
    rightReserveBase,
    siteSearchTabHint,
    isElementVisible,
    setInputStyle,
    config,
    configuredBaseInputPaddingLeft,
    prefixGap,
    modeMenu,
    modeMenuContent,
    modeMenuFooter,
    notifyModeMenuLayoutChange,
    inputModeState
  });


  const {
    clearModeMenuProviderThemes,
    requestModeMenuProviderThemes,
    getModeMenuTileColors,
    getModeMenuTileIcon
  } = INPUT_MODE_MODE_MENU_ICONS.createModeMenuIcons({
    getThemeForMode,
    defaultTheme,
    parseCssColor,
    defaultAccentColor,
    mixRgb,
    isDarkMode,
    getAccessibleThemeFocusRingRgb,
    rgbToCss,
    getBuiltInSurfaceColor,
    getThemeForProvider,
    resolveProviderIconUrl,
    getProviderThemeHost,
    onProviderThemesChange: () => renderModeMenuView(),
    inputModeState
  });

  const {
    setInputModePrefixIdentity,
    cancelInputModePrefixIconAnimation,
    measureInputModePrefixWidthForText,
    setInputModePrefixContent,
    handleModeTagIconError,
    getInputModePrefixRenderedWidth,
    getInputModePrefixCurrentVisualState
  } = INPUT_MODE_PREFIX_CONTENT.createPrefixContent({
    siteSearchPrefix,
    siteSearchPrefixLineIcon,
    siteSearchPrefixIconFrame,
    siteSearchPrefixGlyph,
    siteSearchPrefixCurrent,
    formatMessage,
    setStyle,
    shouldReduceInputModeMotion,
    isElementVisible,
    DEFAULT_PREFIX_ICON_POP_DURATION,
    DEFAULT_PREFIX_ICON_POP_EASING,
    DEFAULT_PREFIX_ICON_EXIT_DURATION,
    DEFAULT_PREFIX_ICON_EXIT_EASING,
    resolveProviderIconUrl,
    updatePrefixLayout,
    updateModeTag,
    win,
    inputModeState
  });

  const {
    cancelInputModePrefixAnimation,
    setInputModePrefixRestState,
    playInputModePrefixEnterAnimation,
    playInputModePrefixResizeAnimation,
    settleInputModePrefixMenuVisualState,
    setInputModePrefixMenuOpen
  } = INPUT_MODE_PREFIX_MOTION.createPrefixMotion({
    siteSearchPrefixCurrent,
    setStyle,
    shouldReduceInputModeMotion,
    updatePrefixLayout,
    DEFAULT_PREFIX_RESIZE_DURATION,
    DEFAULT_PREFIX_RESIZE_EASING,
    win,
    siteSearchPrefix,
    prefixTransition,
    DEFAULT_PREFIX_ENTER_DURATION,
    DEFAULT_PREFIX_ENTER_EASING,
    isElementVisible,
    getInputModePrefixCurrentVisualState,
    DEFAULT_PREFIX_ITEM_GAP_PX: MODE_TAG_ITEM_GAP_PX,
    updateModeTag,
    inputModeState
  });

  const {
    setPrefixText,
    setProviderPrefix,
    clearProviderPrefix,
    setTabHintVisible
  } = INPUT_MODE_PREFIX_TEXT.createPrefixText({
    config,
    siteSearchPrefix,
    updateModeTag,
    updateTabHint,
    resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation,
    isElementVisible,
    getInputModePrefixRenderedWidth,
    cancelInputModePrefixAnimation,
    settleInputModePrefixMenuVisualState,
    setStyle,
    prefixTransition,
    setInputModePrefixIdentity,
    applyInputModePrefixVisual,
    syncInputPlaceholder,
    setInputStyle,
    input,
    updatePrefixLayout,
    measureInputModePrefixWidthForText,
    playInputModePrefixResizeAnimation,
    setInputModePrefixContent,
    setInputModePrefixRestState,
    playInputModePrefixEnterAnimation,
    isAiSiteSearchProvider,
    getProviderIcon,
    getProviderThemeHost,
    getSiteSearchPrefixText,
    cancelInputModePrefixIconAnimation,
    closeModeMenu,
    getDefaultPlaceholder,
    defaultCaretColor,
    getSiteSearchDisplayName,
    formatMessage,
    win,
    updateInputRightPadding,
    inputModeState
  });


  const {
    getModeMenuLabels,
    refreshModeMenuLanguage
  } = INPUT_MODE_MODE_MENU_LANGUAGE.createModeMenuLanguage({
    formatMessage,
    shortcutDisplayApi,
    config,
    win,
    syncInputPlaceholder,
    renderModeMenuView,
    inputModeState
  });

  const {
    normalizeModeMenuSearchText,
    buildModeMenuSearchIndex,
    getModeMenuItemMatch,
    bindModeMenuLabelTooltip
  } = INPUT_MODE_MODE_MENU_SEARCH.createModeMenuSearch({
    getModeMenuPinyinApi,
    MODE_MENU_PINYIN_FALLBACKS,
    modeMenuCursorTooltipController,
    cursorTooltipApi,
    modeMenu
  });

  function handleModeInput(): void {
    requestModeMenuPinyinRuntime();
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    syncModeMenuQueryLift();
  }

  function handleModeInputKeydown(event: KeyboardEvent): void {
    if (event && event.key !== 'Tab') {
      resetModeMenuDoubleTab();
    }
    if (event && event.key !== 'Backspace' &&
        !event.metaKey && !event.ctrlKey && !event.altKey) {
      resetModeTagRemovalConfirmation();
    }
  }

  function handleModeInputBlur(): void {
    resetModeMenuDoubleTab();
  }

  function handleModeInputFocus(): void {
    setModeMenuSearchActive(false);
  }

  const modePointerEventRoot = container.getRootNode();

  input.addEventListener('input', handleModeInput);
  input.addEventListener('keydown', handleModeInputKeydown);
  input.addEventListener('blur', handleModeInputBlur);
  input.addEventListener('focus', handleModeInputFocus);
  if (typeof config.onModeMenuHistory === 'function') {
    container.addEventListener('keydown', handleModeMenuHistoryKeydown, true);
  }
  doc.addEventListener('pointerdown', handleDocumentPointerDown, true);
  if (modePointerEventRoot !== doc) {
    modePointerEventRoot.addEventListener(
      'pointerdown',
      handleDocumentPointerDown,
      true
    );
  }

  function onResize(): void {
    updateLayout();
  }

  if (win && typeof win.ResizeObserver === 'function') {
    const observer = new win.ResizeObserver(updateLayout);
    observer.observe(siteSearchPrefix);
    observer.observe(siteSearchTabHint);
    observer.observe(modeMenuContent);
    const badgeElement = getModeBadgeElement();
    if (badgeElement) {
      observer.observe(badgeElement);
    }
    layoutResizeObserver = observer;
  }

  win.addEventListener('resize', onResize);
  renderModeMenuView();

  function destroy(): void {
    inputModeState.destroyed = true;
    container.removeEventListener('keydown', handleModeMenuHistoryKeydown, true);
    inputModeState.modeMenuRequestId += 1;
    inputModeState.modeMenuPending = false;
    cancelModeMenuRevealFrame();
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    cancelInputModePrefixAnimation();
    cancelInputModePrefixIconAnimation();
    win.removeEventListener('resize', onResize);
    if (layoutResizeObserver) {
      layoutResizeObserver.disconnect();
      layoutResizeObserver = null;
    }
    input.removeEventListener('input', handleModeInput);
    input.removeEventListener('keydown', handleModeInputKeydown);
    input.removeEventListener('blur', handleModeInputBlur);
    input.removeEventListener('focus', handleModeInputFocus);
    doc.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    if (modePointerEventRoot !== doc) {
      modePointerEventRoot.removeEventListener(
        'pointerdown',
        handleDocumentPointerDown,
        true
      );
    }
    clearProviderPrefix();
    setTabHintVisible(false);
    if (ownedModeMenuCursorTooltipController) {
      ownedModeMenuCursorTooltipController.destroy();
    } else if (modeMenuCursorTooltipController) {
      modeMenuCursorTooltipController.hide();
    }
  }

  return Object.freeze({
    prefixElement: siteSearchPrefix,
    tabHintElement: siteSearchTabHint,
    setProviderPrefix,
    setPrefixText,
    clearProviderPrefix,
    closeModeMenu,
    fitModeMenuWithinViewport,
    isModeMenuVisible,
    menuElement: modeMenu,
    getModeMenuFilterQuery: () => inputModeState.modeMenuFilterQuery,
    hasActiveModeTag: () => inputModeState.modeTagActive,
    openModeMenu,
    refreshModeMenuLanguage,
    refreshModeMenu,
    resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation,
    setModeMenuResultOffset,
    setTabHintVisible,
    shouldCompleteModeMenuDoubleTab,
    handleModeMenuTabFocusToggle,
    handleModeMenuKeyEvent,
    shouldHandleModeMenuKeyEvent,
    shouldOpenModeMenuForActiveModeOnTab,
    shouldOpenModeMenuOnDoubleTab,
    shouldRemoveModeTagOnBackspace,
    updateLayout,
    destroy
  });
}

type InputModeController = ReturnType<typeof createInputModeController>;

export { createInputModeController };
export type { InputModeConfig, InputModeController, InputModeParts, InputModeState, InputModeWindow };
