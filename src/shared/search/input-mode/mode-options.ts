// The mode controller's defaults and the page helpers its modules share.
import type {
  AttachFaviconData,
  FormatMessage,
  GetThemeForProvider,
  InputModeProvider,
  InputModeTheme,
  ResolveProviderIconUrl,
  Rgb
} from './types';
import type { InputModeConfig, InputModeWindow } from './controller-types';
import { DEFAULT_ACCENT_RGB, defaultParseCssColor, defaultRgbToCss } from './theme-colors';

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

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return value !== undefined && value !== null && Number.isFinite(parsed) ? parsed : null;
}

type ProviderReader<T> = (provider: InputModeProvider | null | undefined) => T;

// The surface's options with their defaults filled in.
interface ControllerOptions {
  surface: 'newtab' | 'overlay';
  setInputStyle: (target: HTMLElement, property: string, value: string) => void;
  formatMessage: FormatMessage;
  getThemeForMode: (theme: InputModeTheme) => InputModeTheme | null | undefined;
  getSiteSearchPrefixText: ProviderReader<string>;
  getSiteSearchDisplayName: ProviderReader<string>;
  getProviderIcon: ProviderReader<string>;
  resolveProviderIconUrl: ResolveProviderIconUrl;
  getProviderThemeHost: ProviderReader<string>;
  getThemeForProvider: GetThemeForProvider | null;
  isAiSiteSearchProvider: ProviderReader<boolean>;
  attachFaviconData: AttachFaviconData | null;
  isDarkMode: () => unknown;
  parseCssColor: (color: unknown) => Rgb | null;
  rgbToCss: (rgb: Rgb) => string;
  defaultTheme: InputModeTheme;
  defaultAccentColor: Rgb;
  prefixGap: number;
  rightReserveBase: number;
  rightAnchorOffset: number;
  // Extra width taken by optional right-side actions (e.g. a clear button) shown beside the base icon.
  getExtraRightInset: (() => number) | null;
  configuredBaseInputPaddingLeft: number | null;
  prefixTransition: string;
  getDefaultPlaceholder: () => string;
  defaultCaretColor: string;
  canReorderModeMenu: boolean;
  canMoveModeMenuGroups: boolean;
}

function functionOr<F>(value: F | null | undefined, fallback: F): F {
  return typeof value === 'function' ? value : fallback;
}

function formatFallbackMessage(_key: string, fallback?: string, values?: Record<string, unknown>): string {
  return String(fallback || '').replace(/\{([^}]+)\}/g, (match, token: string) => (
    values && hasOwn(values, token) ? String(values[token]) : match
  ));
}

function readProviderName(provider: InputModeProvider | null | undefined): string {
  return provider && (provider.name || provider.key) ? (provider.name || provider.key) : '';
}

function readTextOptions(config: InputModeConfig, input: HTMLInputElement) {
  const getSiteSearchPrefixText = functionOr(config.getSiteSearchPrefixText, readProviderName);
  const defaultPlaceholder = hasOwn(config, 'defaultPlaceholder')
    ? String(config.defaultPlaceholder ?? '')
    : input.placeholder;
  return {
    formatMessage: functionOr<FormatMessage>(config.formatMessage, formatFallbackMessage),
    getSiteSearchPrefixText,
    getSiteSearchDisplayName: functionOr(config.getSiteSearchDisplayName, getSiteSearchPrefixText),
    getDefaultPlaceholder: functionOr(config.getDefaultPlaceholder, () => defaultPlaceholder),
    defaultCaretColor: hasOwn(config, 'defaultCaretColor')
      ? String(config.defaultCaretColor ?? '')
      : (input.style.caretColor || 'var(--x-ext-input-caret, #7DB7FF)')
  };
}

function readProviderOptions(config: InputModeConfig) {
  return {
    getProviderIcon: functionOr<ProviderReader<string>>(config.getProviderIcon, () => ''),
    resolveProviderIconUrl: functionOr<ResolveProviderIconUrl>(config.resolveProviderIconUrl, (_provider, iconUrl) => iconUrl),
    getProviderThemeHost: functionOr<ProviderReader<string>>(config.getProviderThemeHost, () => ''),
    getThemeForProvider: functionOr<GetThemeForProvider | null>(config.getThemeForProvider, null),
    isAiSiteSearchProvider: functionOr<ProviderReader<boolean>>(config.isAiSiteSearchProvider, () => false),
    attachFaviconData: functionOr<AttachFaviconData | null>(config.attachFaviconData, null)
  };
}

function readThemeOptions(config: InputModeConfig) {
  return {
    getThemeForMode: functionOr(config.getThemeForMode, (theme: InputModeTheme) => theme || config.defaultTheme || {}),
    isDarkMode: functionOr(config.isDarkMode, () => false),
    parseCssColor: functionOr(config.parseCssColor, defaultParseCssColor),
    rgbToCss: functionOr(config.rgbToCss, defaultRgbToCss),
    defaultTheme: config.defaultTheme || {},
    defaultAccentColor: Array.isArray(config.defaultAccentColor) ? config.defaultAccentColor : DEFAULT_ACCENT_RGB,
    prefixTransition: config.prefixTransition || DEFAULT_PREFIX_TRANSITION
  };
}

function readExtraRightInset(config: InputModeConfig): (() => number) | null {
  const configured = config.getExtraRightInset;
  if (typeof configured !== 'function') {
    return null;
  }
  return () => {
    const extra = Number(configured());
    return Number.isFinite(extra) && extra > 0 ? extra : 0;
  };
}

function readLayoutOptions(config: InputModeConfig) {
  const surface = config.surface === 'overlay' ? 'overlay' : 'newtab';
  return {
    surface,
    setInputStyle: functionOr(config.setInputStyle,
      (target: HTMLElement, property: string, value: string) => setStyle(target, property, value)),
    prefixGap: readNumber(config.prefixGap) ?? DEFAULT_PREFIX_GAP,
    rightReserveBase: readNumber(config.rightReserveBase) ?? (surface === 'overlay' ? 92 : 64),
    rightAnchorOffset: readNumber(config.rightAnchorOffset) ?? (surface === 'overlay' ? 86 : 52),
    getExtraRightInset: readExtraRightInset(config),
    configuredBaseInputPaddingLeft: readNumber(config.baseInputPaddingLeft),
    canReorderModeMenu: typeof config.onModeMenuReorder === 'function',
    canMoveModeMenuGroups: typeof config.onModeMenuGroupMove === 'function'
  } as const;
}

function readControllerOptions(config: InputModeConfig, input: HTMLInputElement): ControllerOptions {
  return {
    ...readLayoutOptions(config),
    ...readTextOptions(config, input),
    ...readProviderOptions(config),
    ...readThemeOptions(config)
  };
}

export type { ControllerOptions };
export {
  readControllerOptions,
  DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION,
  DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT,
  DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT,
  DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET,
  DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION,
  DEFAULT_PREFIX_ENTER_DURATION,
  DEFAULT_PREFIX_ENTER_EASING,
  DEFAULT_PREFIX_GAP,
  DEFAULT_PREFIX_ICON_EXIT_DURATION,
  DEFAULT_PREFIX_ICON_EXIT_EASING,
  DEFAULT_PREFIX_ICON_POP_DURATION,
  DEFAULT_PREFIX_ICON_POP_EASING,
  DEFAULT_PREFIX_RESIZE_DURATION,
  DEFAULT_PREFIX_RESIZE_EASING,
  DEFAULT_PREFIX_TRANSITION,
  getDocument,
  getWindow,
  hasInlineStyle,
  hasOwn,
  isElementVisible,
  readNumber,
  setStyle
};
