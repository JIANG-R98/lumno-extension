// How the mode prefix looks and where it sits: its colors on each surface,
// the input padding it takes, and the menu footer alignment.
import type { ModeTagModel } from './mode-tag-model';
import type { InputModeTheme, IsElementVisible, Rgb, SetStyle } from './types';
import { queryHtmlElement } from '../../dom-lookup';

// The controller state search-input-mode.ts shares with its modules.
interface PrefixVisualState {
  destroyed: boolean;
  modeMenuOpen: boolean;
}

interface PrefixVisualConfig {
  // The surface's own badge on the input's right (e.g. a keyboard hint).
  getModeBadgeElement?(): HTMLElement | null | undefined;
  modeBadgeElement?: HTMLElement | null;
}

// Which built-in line icon a mode shows, if any.
interface PrefixVisualOptions {
  menuIconName?: string;
}

// The prefix's colors.
interface PrefixVisual {
  accentColor: string;
  background: string;
  border: string;
  shadow: string;
  color: string;
  caretColor: string;
}

interface PrefixVisualDeps {
  win: Pick<Window, 'getComputedStyle'> & Partial<Pick<Window, 'matchMedia'>>;
  surface: 'newtab' | 'overlay';
  getModeMenuLineIconPaths: (iconName: string) => readonly string[] | null;
  isDarkMode: () => unknown;
  getThemeForMode: (theme: InputModeTheme) => InputModeTheme | null | undefined;
  defaultTheme: InputModeTheme;
  parseCssColor: (color: unknown) => Rgb | null;
  defaultAccentColor: Rgb;
  mixRgb: (source: Rgb, target: Rgb, targetWeight: number) => Rgb;
  getAccessibleThemeTextRgb: (accentRgb: Rgb, backgroundRgb: Rgb) => Rgb;
  rgbToCss: (rgb: Rgb) => string;
  setStyle: SetStyle;
  container: HTMLElement;
  siteSearchPrefix: HTMLElement;
  updateModeTag: (patch: Partial<ModeTagModel>) => void;
  input: HTMLInputElement;
  // Width taken by optional actions beside the input's right icon.
  getExtraRightInset: (() => number) | null;
  rightAnchorOffset: number;
  rightReserveBase: number;
  siteSearchTabHint: HTMLElement;
  isElementVisible: IsElementVisible;
  setInputStyle: (target: HTMLElement, property: string, value: string) => void;
  config: PrefixVisualConfig;
  configuredBaseInputPaddingLeft: number | null;
  prefixGap: number;
  modeMenu: HTMLElement;
  modeMenuContent: HTMLElement;
  modeMenuFooter: HTMLElement;
  notifyModeMenuLayoutChange: () => void;
  inputModeState: PrefixVisualState;
}

interface PrefixVisualContext {
  readonly win: PrefixVisualDeps['win'];
  readonly surface: PrefixVisualDeps['surface'];
  readonly getModeMenuLineIconPaths: PrefixVisualDeps['getModeMenuLineIconPaths'];
  readonly isDarkMode: PrefixVisualDeps['isDarkMode'];
  readonly getThemeForMode: PrefixVisualDeps['getThemeForMode'];
  readonly defaultTheme: PrefixVisualDeps['defaultTheme'];
  readonly parseCssColor: PrefixVisualDeps['parseCssColor'];
  readonly defaultAccentColor: PrefixVisualDeps['defaultAccentColor'];
  readonly mixRgb: PrefixVisualDeps['mixRgb'];
  readonly getAccessibleThemeTextRgb: PrefixVisualDeps['getAccessibleThemeTextRgb'];
  readonly rgbToCss: PrefixVisualDeps['rgbToCss'];
  readonly setStyle: PrefixVisualDeps['setStyle'];
  readonly container: PrefixVisualDeps['container'];
  readonly siteSearchPrefix: PrefixVisualDeps['siteSearchPrefix'];
  readonly updateModeTag: PrefixVisualDeps['updateModeTag'];
  readonly input: PrefixVisualDeps['input'];
  readonly getExtraRightInset: PrefixVisualDeps['getExtraRightInset'];
  readonly rightAnchorOffset: PrefixVisualDeps['rightAnchorOffset'];
  readonly rightReserveBase: PrefixVisualDeps['rightReserveBase'];
  readonly siteSearchTabHint: PrefixVisualDeps['siteSearchTabHint'];
  readonly isElementVisible: PrefixVisualDeps['isElementVisible'];
  readonly setInputStyle: PrefixVisualDeps['setInputStyle'];
  readonly config: PrefixVisualDeps['config'];
  readonly configuredBaseInputPaddingLeft: PrefixVisualDeps['configuredBaseInputPaddingLeft'];
  readonly prefixGap: PrefixVisualDeps['prefixGap'];
  readonly modeMenu: PrefixVisualDeps['modeMenu'];
  readonly modeMenuContent: PrefixVisualDeps['modeMenuContent'];
  readonly modeMenuFooter: PrefixVisualDeps['modeMenuFooter'];
  readonly notifyModeMenuLayoutChange: PrefixVisualDeps['notifyModeMenuLayoutChange'];
  readonly inputModeState: PrefixVisualDeps['inputModeState'];
  baseInputPaddingLeft: number | null;
}

function shouldReduceInputModeMotion(ctx: PrefixVisualContext): boolean {
  return Boolean(
    ctx.win &&
    typeof ctx.win.matchMedia === 'function' &&
    ctx.win.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function getBuiltInSurfaceColor(ctx: PrefixVisualContext): string {
  return ctx.surface === 'overlay'
    ? 'var(--x-ov-text, #111827)'
    : 'var(--x-nt-text, #111827)';
}

function getInputModePrefixVisual(
  ctx: PrefixVisualContext,
  theme: InputModeTheme | null | undefined,
  visualOptions: PrefixVisualOptions | null | undefined
): PrefixVisual {
  const lineIconName = visualOptions && visualOptions.menuIconName
    ? String(visualOptions.menuIconName).trim()
    : '';
  if (ctx.getModeMenuLineIconPaths(lineIconName)) {
    const surfaceColor = getBuiltInSurfaceColor(ctx);
    const isDark = Boolean(ctx.isDarkMode());
    return {
      accentColor: surfaceColor,
      background: `color-mix(in srgb, ${surfaceColor} ${isDark ? 14 : 9}%, transparent)`,
      border: 'none',
      shadow: 'none',
      color: surfaceColor,
      caretColor: surfaceColor
    };
  }
  const resolvedTheme = theme ? ctx.getThemeForMode(theme) : ctx.defaultTheme;
  const accentRgb = (resolvedTheme && (resolvedTheme.accentRgb || ctx.parseCssColor(resolvedTheme.accent))) ||
    ctx.defaultAccentColor;
  const isDark = Boolean(ctx.isDarkMode());
  const backgroundOpacity = isDark ? 0.14 : 0.075;
  const backgroundRgb = ctx.mixRgb(
    accentRgb,
    isDark ? [17, 24, 39] : [255, 255, 255],
    1 - backgroundOpacity
  );
  const themeTextRgb = ctx.getAccessibleThemeTextRgb(accentRgb, backgroundRgb);
  const themeTextColor = ctx.rgbToCss(themeTextRgb);
  return {
    accentColor: themeTextColor,
    background: `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${backgroundOpacity})`,
    border: 'none',
    shadow: 'none',
    color: themeTextColor,
    caretColor: resolvedTheme && resolvedTheme.placeholderText
      ? resolvedTheme.placeholderText
      : ctx.rgbToCss(accentRgb)
  };
}

function applyInputModePrefixVisual(
  ctx: PrefixVisualContext,
  theme: InputModeTheme | null | undefined,
  visualOptions?: PrefixVisualOptions | null
): PrefixVisual {
  const visual = getInputModePrefixVisual(ctx, theme, visualOptions);
  ctx.setStyle(ctx.container, '--x-lumno-search-mode-accent', visual.accentColor);
  ctx.setStyle(ctx.container, '--x-lumno-search-mode-selected-bg', visual.background);
  ctx.updateModeTag({
    colors: {
      accent: visual.accentColor,
      background: visual.background,
      color: visual.color,
      border: visual.border,
      shadow: visual.shadow
    }
  });
  return visual;
}

function updateInputRightPadding(ctx: PrefixVisualContext): void {
  const extraInset = ctx.getExtraRightInset ? ctx.getExtraRightInset() : 0;
  const anchorOffset = ctx.rightAnchorOffset + extraInset;
  let totalReserve = ctx.rightReserveBase + extraInset;
  const badgeElement = getModeBadgeElement(ctx);
  if (ctx.getExtraRightInset) {
    ctx.setStyle(ctx.siteSearchTabHint, 'right', `${anchorOffset}px`);
    if (badgeElement) {
      ctx.setStyle(badgeElement, 'right', `${anchorOffset}px`);
    }
  }
  if (badgeElement && ctx.isElementVisible(badgeElement)) {
    const badgeWidth = Math.ceil(badgeElement.getBoundingClientRect().width || 0);
    totalReserve = Math.max(totalReserve, anchorOffset + badgeWidth + 12);
  }
  if (ctx.isElementVisible(ctx.siteSearchTabHint)) {
    const hintWidth = Math.ceil(ctx.siteSearchTabHint.getBoundingClientRect().width || 0);
    totalReserve = Math.max(totalReserve, anchorOffset + hintWidth + 12);
  }
  ctx.setInputStyle(ctx.input, 'padding-right', `${totalReserve}px`);
}

function getModeBadgeElement(ctx: PrefixVisualContext): HTMLElement | null {
  return (typeof ctx.config.getModeBadgeElement === 'function'
    ? ctx.config.getModeBadgeElement()
    : ctx.config.modeBadgeElement) || null;
}

function getBaseInputPaddingLeft(ctx: PrefixVisualContext): number {
  if (ctx.baseInputPaddingLeft === null) {
    const computed = parseFloat(ctx.win.getComputedStyle(ctx.input).paddingLeft);
    ctx.baseInputPaddingLeft = Number.isFinite(computed) && computed > 0
      ? computed
      : (ctx.configuredBaseInputPaddingLeft || 50);
  }
  return ctx.baseInputPaddingLeft;
}

function updatePrefixLayout(ctx: PrefixVisualContext): void {
  const basePadding = getBaseInputPaddingLeft(ctx);
  ctx.setStyle(ctx.siteSearchPrefix, 'left', `${basePadding}px`);
  if (!ctx.isElementVisible(ctx.siteSearchPrefix)) {
    ctx.setInputStyle(ctx.input, 'padding-left', `${basePadding}px`);
    return;
  }
  const prefixWidth = Math.ceil(ctx.siteSearchPrefix.offsetWidth || ctx.siteSearchPrefix.getBoundingClientRect().width || 0);
  const paddedLeft = Math.max(basePadding + prefixWidth + ctx.prefixGap, basePadding);
  ctx.setInputStyle(ctx.input, 'padding-left', `${paddedLeft}px`);
}

// Lines the footer's hints up with the menu items' icons.
function updateModeMenuFooterAlignment(ctx: PrefixVisualContext): void {
  if (!ctx.inputModeState.modeMenuOpen) {
    return;
  }
  const firstIcon = queryHtmlElement(ctx.modeMenuContent, '.x-lumno-search-input-mode__menu-icon');
  if (!firstIcon || Number(firstIcon.offsetWidth) <= 0) {
    return;
  }
  const menuRect = ctx.modeMenu.getBoundingClientRect();
  const iconRect = firstIcon.getBoundingClientRect();
  const footerRect = ctx.modeMenuFooter.getBoundingClientRect();
  const menuLayoutWidth = Number(ctx.modeMenu.offsetWidth) || menuRect.width;
  const scaleX = menuLayoutWidth > 0 ? menuRect.width / menuLayoutWidth : 1;
  if (!Number.isFinite(scaleX) || scaleX <= 0) {
    return;
  }
  const inlineStart = Math.max(0, (iconRect.left - footerRect.left) / scaleX);
  ctx.setStyle(
    ctx.modeMenuFooter,
    '--x-lumno-search-mode-footer-inline-start',
    `${Math.round(inlineStart * 100) / 100}px`
  );
}

function updateLayout(ctx: PrefixVisualContext): void {
  if (ctx.inputModeState.destroyed) {
    return;
  }
  updateInputRightPadding(ctx);
  updatePrefixLayout(ctx);
  updateModeMenuFooterAlignment(ctx);
  if (ctx.inputModeState.modeMenuOpen) {
    ctx.notifyModeMenuLayoutChange();
  }
}

function createPrefixVisual(deps: PrefixVisualDeps) {
  const {
    win,
    surface,
    getModeMenuLineIconPaths,
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
    notifyModeMenuLayoutChange
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;
  const ctx: PrefixVisualContext = {
    win,
    surface,
    getModeMenuLineIconPaths,
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
    inputModeState,
    baseInputPaddingLeft: null
  };

  return {
    shouldReduceInputModeMotion: () => shouldReduceInputModeMotion(ctx),
    getBuiltInSurfaceColor: () => getBuiltInSurfaceColor(ctx),
    applyInputModePrefixVisual: (theme: InputModeTheme | null | undefined, visualOptions?: PrefixVisualOptions | null) => applyInputModePrefixVisual(ctx, theme, visualOptions),
    updateInputRightPadding: () => updateInputRightPadding(ctx),
    getModeBadgeElement: () => getModeBadgeElement(ctx),
    updatePrefixLayout: () => updatePrefixLayout(ctx),
    updateModeMenuFooterAlignment: () => updateModeMenuFooterAlignment(ctx),
    updateLayout: () => updateLayout(ctx)
  };
}

type PrefixVisualApi = ReturnType<typeof createPrefixVisual>;

export { createPrefixVisual };
export type { PrefixVisual, PrefixVisualApi, PrefixVisualConfig, PrefixVisualDeps, PrefixVisualOptions, PrefixVisualState };
