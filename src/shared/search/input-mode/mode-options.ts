// The surface's options for the search box's mode with their defaults
// filled in, and the page helpers the mode's parts share.
import type {
  AttachFaviconData,
  FormatMessage,
  GetThemeForProvider,
  InputModeProvider,
  InputModeTheme,
  ResolveProviderIconUrl,
  Rgb
} from './types';
import type { NavigatorLike } from '../../../domain/shortcut-display';
import type { PinyinApi } from '../../../domain/search/pinyin-api';
import type { CursorTooltipController } from '../../ui/cursor-tooltip-model';
import { hasOwn, readNumber, setStyle } from './page';
import type { InputModeWindow } from './page';
import { DEFAULT_ACCENT_RGB, defaultParseCssColor, defaultRgbToCss } from './theme-colors';

const DEFAULT_PREFIX_GAP = 8;
const DEFAULT_PREFIX_TRANSITION = 'background-color 140ms ease, color 140ms ease';

type ModeMenuTooltipController = Pick<CursorTooltipController, 'bind' | 'hide'>;

// The surface's options for the controller itself.
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
  // pinyin-pro for the menu's filter when the surface already has it; null
  // starts without it. By default the menu imports build/pinyin.js on first use.
  pinyinApi?: PinyinApi | null;
  // The surface's cursor tooltip for cut-off menu labels; the menu makes its own without one.
  modeMenuCursorTooltipController?: ModeMenuTooltipController | null;
  modeMenuTooltipController?: ModeMenuTooltipController | null;
  navigatorLike?: NavigatorLike | null;
}

// What the options are read from: the controller's own, and whether the
// surface lets the menu's groups and tiles move.
type ControllerOptionsSource = InputModeOwnConfig & {
  onModeMenuReorder?: unknown;
  onModeMenuGroupMove?: unknown;
};

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

function readTextOptions(config: ControllerOptionsSource, input: HTMLInputElement) {
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

function readProviderOptions(config: ControllerOptionsSource) {
  return {
    getProviderIcon: functionOr<ProviderReader<string>>(config.getProviderIcon, () => ''),
    resolveProviderIconUrl: functionOr<ResolveProviderIconUrl>(config.resolveProviderIconUrl, (_provider, iconUrl) => iconUrl),
    getProviderThemeHost: functionOr<ProviderReader<string>>(config.getProviderThemeHost, () => ''),
    getThemeForProvider: functionOr<GetThemeForProvider | null>(config.getThemeForProvider, null),
    isAiSiteSearchProvider: functionOr<ProviderReader<boolean>>(config.isAiSiteSearchProvider, () => false),
    attachFaviconData: functionOr<AttachFaviconData | null>(config.attachFaviconData, null)
  };
}

function readThemeOptions(config: ControllerOptionsSource) {
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

function readExtraRightInset(config: ControllerOptionsSource): (() => number) | null {
  const configured = config.getExtraRightInset;
  if (typeof configured !== 'function') {
    return null;
  }
  return () => {
    const extra = Number(configured());
    return Number.isFinite(extra) && extra > 0 ? extra : 0;
  };
}

function readLayoutOptions(config: ControllerOptionsSource) {
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

function readControllerOptions(config: ControllerOptionsSource, input: HTMLInputElement): ControllerOptions {
  return {
    ...readLayoutOptions(config),
    ...readTextOptions(config, input),
    ...readProviderOptions(config),
    ...readThemeOptions(config)
  };
}

export type { ControllerOptions, InputModeOwnConfig, ModeMenuTooltipController };
export { readControllerOptions };
