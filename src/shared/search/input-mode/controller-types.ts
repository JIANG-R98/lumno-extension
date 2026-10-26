// The parts, options and shared state of the search box's mode controller.
import type { NavigatorLike } from '../../../domain/shortcut-display';
import type { CursorTooltipController } from '../../ui/cursor-tooltip-model';
import type { ModeMenuIconsState } from './mode-menu-icons';
import type { ModeMenuLanguageConfig, ModeMenuLanguageState } from './mode-menu-language';
import type { ModeMenuLayoutConfig, ModeMenuLayoutState } from './mode-menu-layout';
import type { ModeMenuLifecycleConfig, ModeMenuLifecycleState } from './mode-menu-lifecycle';
import type { ModeMenuNavigationConfig, ModeMenuNavigationState } from './mode-menu-navigation';
import type { ModeMenuRenderConfig, ModeMenuRenderState } from './mode-menu-render';
import type { PinyinApi } from '../../../domain/search/pinyin-api';
import type { ModeTabKeysConfig, ModeTabKeysState } from './mode-tab-keys';
import type { PrefixContentState } from './prefix-content';
import type { PrefixMotionState } from './prefix-motion';
import type { PrefixTextConfig, PrefixTextState } from './prefix-text';
import type { PrefixVisualConfig, PrefixVisualState } from './prefix-visual';
import type {
  AttachFaviconData,
  FormatMessage,
  GetThemeForProvider,
  InputModeProvider,
  InputModeTheme,
  ResolveProviderIconUrl,
  Rgb
} from './types';
import type { ModeMenuView } from '../../react/search/mode-menu';
import type { ModeTagView, TabHintView } from '../../react/search/mode-tag';


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
  // pinyin-pro for the menu's filter when the surface already has it; null
  // starts without it. By default the menu imports build/pinyin.js on first use.
  pinyinApi?: PinyinApi | null;
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

export type {
  InputModeConfig,
  InputModeOwnConfig,
  InputModeParts,
  InputModeState,
  InputModeWindow,
  ModeMenuTooltipController
};
