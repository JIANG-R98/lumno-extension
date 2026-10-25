// How the mode prefix looks and where it sits: its colors on each surface,
// the input padding it takes, and the menu footer alignment.
import type { InputModeTheme, IsElementVisible, Rgb, SetStyle } from './types';

// The controller state search-input-mode.ts shares with its modules.
interface PrefixVisualState {
  destroyed: boolean;
  modeMenuOpen: boolean;
  modeMenuContent: HTMLElement;
  modeMenuFooter: HTMLElement;
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
  useImportantStyles: boolean;
  siteSearchPrefix: HTMLElement;
  siteSearchPrefixLineIcon: SVGElement;
  siteSearchPrefixChevron: HTMLElement;
  siteSearchPrefixCurrent: HTMLElement;
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
  notifyModeMenuLayoutChange: () => void;
  inputModeState: PrefixVisualState;
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
    useImportantStyles,
    siteSearchPrefix,
    siteSearchPrefixLineIcon,
    siteSearchPrefixChevron,
    siteSearchPrefixCurrent,
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
    notifyModeMenuLayoutChange
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  let baseInputPaddingLeft: number | null = null;

  function shouldReduceInputModeMotion(): boolean {
    return Boolean(
      win &&
      typeof win.matchMedia === 'function' &&
      win.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function getBuiltInSurfaceColor(): string {
    return surface === 'overlay'
      ? 'var(--x-ov-text, #111827)'
      : 'var(--x-nt-text, #111827)';
  }

  function getInputModePrefixVisual(
    theme: InputModeTheme | null | undefined,
    visualOptions: PrefixVisualOptions | null | undefined
  ): PrefixVisual {
    const lineIconName = visualOptions && visualOptions.menuIconName
      ? String(visualOptions.menuIconName).trim()
      : '';
    if (getModeMenuLineIconPaths(lineIconName)) {
      const surfaceColor = getBuiltInSurfaceColor();
      const isDark = Boolean(isDarkMode());
      return {
        accentColor: surfaceColor,
        background: `color-mix(in srgb, ${surfaceColor} ${isDark ? 14 : 9}%, transparent)`,
        border: 'none',
        shadow: 'none',
        color: surfaceColor,
        caretColor: surfaceColor
      };
    }
    const resolvedTheme = theme ? getThemeForMode(theme) : defaultTheme;
    const accentRgb = (resolvedTheme && (resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent))) ||
      defaultAccentColor;
    const isDark = Boolean(isDarkMode());
    const backgroundOpacity = isDark ? 0.14 : 0.075;
    const backgroundRgb = mixRgb(
      accentRgb,
      isDark ? [17, 24, 39] : [255, 255, 255],
      1 - backgroundOpacity
    );
    const themeTextRgb = getAccessibleThemeTextRgb(accentRgb, backgroundRgb);
    const themeTextColor = rgbToCss(themeTextRgb);
    return {
      accentColor: themeTextColor,
      background: `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${backgroundOpacity})`,
      border: 'none',
      shadow: 'none',
      color: themeTextColor,
      caretColor: resolvedTheme && resolvedTheme.placeholderText
        ? resolvedTheme.placeholderText
        : rgbToCss(accentRgb)
    };
  }

  function applyInputModePrefixVisual(
    theme: InputModeTheme | null | undefined,
    visualOptions?: PrefixVisualOptions | null
  ): PrefixVisual {
    const visual = getInputModePrefixVisual(theme, visualOptions);
    setStyle(container, '--x-lumno-search-mode-accent', visual.accentColor, useImportantStyles);
    setStyle(container, '--x-lumno-search-mode-selected-bg', visual.background, useImportantStyles);
    setStyle(siteSearchPrefix, 'background', visual.background, useImportantStyles);
    setStyle(siteSearchPrefix, 'border', visual.border, useImportantStyles);
    setStyle(siteSearchPrefix, 'box-shadow', visual.shadow, useImportantStyles);
    setStyle(siteSearchPrefix, 'color', visual.color, useImportantStyles);
    setStyle(siteSearchPrefix, '--x-lumno-search-mode-accent', visual.accentColor, useImportantStyles);
    setStyle(siteSearchPrefixLineIcon, 'color', visual.accentColor, useImportantStyles);
    setStyle(siteSearchPrefixChevron, 'color', visual.accentColor, useImportantStyles);
    setStyle(siteSearchPrefixCurrent, 'color', visual.accentColor, useImportantStyles);
    return visual;
  }

  function updateInputRightPadding(): void {
    const extraInset = getExtraRightInset ? getExtraRightInset() : 0;
    const anchorOffset = rightAnchorOffset + extraInset;
    let totalReserve = rightReserveBase + extraInset;
    const badgeElement = getModeBadgeElement();
    if (getExtraRightInset) {
      setStyle(siteSearchTabHint, 'right', `${anchorOffset}px`, useImportantStyles);
      if (badgeElement) {
        setStyle(badgeElement, 'right', `${anchorOffset}px`, useImportantStyles);
      }
    }
    if (badgeElement && isElementVisible(badgeElement)) {
      const badgeWidth = Math.ceil(badgeElement.getBoundingClientRect().width || 0);
      totalReserve = Math.max(totalReserve, anchorOffset + badgeWidth + 12);
    }
    if (isElementVisible(siteSearchTabHint)) {
      const hintWidth = Math.ceil(siteSearchTabHint.getBoundingClientRect().width || 0);
      totalReserve = Math.max(totalReserve, anchorOffset + hintWidth + 12);
    }
    setInputStyle(input, 'padding-right', `${totalReserve}px`);
  }

  function getModeBadgeElement(): HTMLElement | null {
    return (typeof config.getModeBadgeElement === 'function'
      ? config.getModeBadgeElement()
      : config.modeBadgeElement) || null;
  }

  function getBaseInputPaddingLeft(): number {
    if (baseInputPaddingLeft === null) {
      const computed = parseFloat(win.getComputedStyle(input).paddingLeft);
      baseInputPaddingLeft = Number.isFinite(computed) && computed > 0
        ? computed
        : (configuredBaseInputPaddingLeft || 50);
    }
    return baseInputPaddingLeft;
  }

  function updatePrefixLayout(): void {
    const basePadding = getBaseInputPaddingLeft();
    setStyle(siteSearchPrefix, 'left', `${basePadding}px`, useImportantStyles);
    if (!isElementVisible(siteSearchPrefix)) {
      setInputStyle(input, 'padding-left', `${basePadding}px`);
      return;
    }
    const prefixWidth = Math.ceil(siteSearchPrefix.offsetWidth || siteSearchPrefix.getBoundingClientRect().width || 0);
    const paddedLeft = Math.max(basePadding + prefixWidth + prefixGap, basePadding);
    setInputStyle(input, 'padding-left', `${paddedLeft}px`);
  }

  // Lines the footer's hints up with the menu items' icons.
  function updateModeMenuFooterAlignment(): void {
    if (modeMenu.hidden || !inputModeState.modeMenuFooter || !inputModeState.modeMenuContent) {
      return;
    }
    const firstIcon = inputModeState.modeMenuContent.querySelector<HTMLElement>(
      '.x-lumno-search-input-mode__menu-icon'
    );
    if (!firstIcon || Number(firstIcon.offsetWidth) <= 0) {
      return;
    }
    const menuRect = modeMenu.getBoundingClientRect();
    const iconRect = firstIcon.getBoundingClientRect();
    const footerRect = inputModeState.modeMenuFooter.getBoundingClientRect();
    const menuLayoutWidth = Number(modeMenu.offsetWidth) || menuRect.width;
    const scaleX = menuLayoutWidth > 0 ? menuRect.width / menuLayoutWidth : 1;
    if (!Number.isFinite(scaleX) || scaleX <= 0) {
      return;
    }
    const inlineStart = Math.max(0, (iconRect.left - footerRect.left) / scaleX);
    setStyle(
      inputModeState.modeMenuFooter,
      '--x-lumno-search-mode-footer-inline-start',
      `${Math.round(inlineStart * 100) / 100}px`,
      useImportantStyles
    );
  }

  function updateLayout(): void {
    if (inputModeState.destroyed) {
      return;
    }
    updateInputRightPadding();
    updatePrefixLayout();
    updateModeMenuFooterAlignment();
    if (inputModeState.modeMenuOpen && !modeMenu.hidden) {
      notifyModeMenuLayoutChange();
    }
  }

  return {
    shouldReduceInputModeMotion,
    getBuiltInSurfaceColor,
    applyInputModePrefixVisual,
    updateInputRightPadding,
    getModeBadgeElement,
    updatePrefixLayout,
    updateModeMenuFooterAlignment,
    updateLayout
  };
}

type PrefixVisualApi = ReturnType<typeof createPrefixVisual>;

export { createPrefixVisual };
export type { PrefixVisual, PrefixVisualApi, PrefixVisualConfig, PrefixVisualDeps, PrefixVisualOptions, PrefixVisualState };
