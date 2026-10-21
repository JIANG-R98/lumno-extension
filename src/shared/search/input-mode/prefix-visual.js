(function(root) {
  'use strict';

  // How the mode prefix looks and where it sits: its colors on each surface,
  // the input padding it takes, and the menu footer alignment.
  function createPrefixVisual(deps) {
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

    // The controller state object shared with search-input-mode.js and the other modules.
    const inputModeState = deps.inputModeState;

    let baseInputPaddingLeft = null;

    function shouldReduceInputModeMotion() {
      return Boolean(
        win &&
        typeof win.matchMedia === 'function' &&
        win.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    }

    function getBuiltInSurfaceColor() {
      return surface === 'overlay'
        ? 'var(--x-ov-text, #111827)'
        : 'var(--x-nt-text, #111827)';
    }

    function getInputModePrefixVisual(theme, visualOptions) {
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

    function applyInputModePrefixVisual(theme, visualOptions) {
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

    function updateInputRightPadding() {
      if (!input) {
        return;
      }
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
      if (isElementVisible(badgeElement)) {
        const badgeWidth = Math.ceil(badgeElement.getBoundingClientRect().width || 0);
        totalReserve = Math.max(totalReserve, anchorOffset + badgeWidth + 12);
      }
      if (isElementVisible(siteSearchTabHint)) {
        const hintWidth = Math.ceil(siteSearchTabHint.getBoundingClientRect().width || 0);
        totalReserve = Math.max(totalReserve, anchorOffset + hintWidth + 12);
      }
      setInputStyle(input, 'padding-right', `${totalReserve}px`);
    }

    function getModeBadgeElement() {
      return typeof config.getModeBadgeElement === 'function'
        ? config.getModeBadgeElement()
        : config.modeBadgeElement;
    }

    function getBaseInputPaddingLeft() {
      if (baseInputPaddingLeft === null) {
        const computed = parseFloat(win.getComputedStyle(input).paddingLeft);
        baseInputPaddingLeft = Number.isFinite(computed) && computed > 0
          ? computed
          : (configuredBaseInputPaddingLeft || 50);
      }
      return baseInputPaddingLeft;
    }

    function updatePrefixLayout() {
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

    function updateModeMenuFooterAlignment() {
      if (modeMenu.hidden || !inputModeState.modeMenuFooter || !inputModeState.modeMenuContent) {
        return;
      }
      const firstIcon = inputModeState.modeMenuContent.querySelector(
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

    function updateLayout() {
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

  const api = Object.freeze({ createPrefixVisual });
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchInputModePrefixVisual = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
