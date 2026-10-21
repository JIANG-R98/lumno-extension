// Setting the mode prefix for a provider or scope, clearing it, and the
// site search Tab hint.
function createPrefixText(deps) {
  const {
    config,
    siteSearchPrefix,
    siteSearchPrefixText,
    resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation,
    isElementVisible,
    getInputModePrefixRenderedWidth,
    cancelInputModePrefixAnimation,
    settleInputModePrefixMenuVisualState,
    setStyle,
    prefixTransition,
    useImportantStyles,
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
    siteSearchPrefixIcon,
    siteSearchPrefixIconFrame,
    siteSearchPrefixGlyph,
    siteSearchPrefixLineIcon,
    siteSearchPrefixChevron,
    closeModeMenu,
    getDefaultPlaceholder,
    defaultCaretColor,
    getSiteSearchDisplayName,
    formatMessage,
    siteSearchTabHintKey,
    cssText,
    vars,
    siteSearchTabHintText,
    siteSearchTabHint,
    win,
    updateInputRightPadding
  } = deps;

  // The controller state object shared with search-input-mode.js and the other modules.
  const inputModeState = deps.inputModeState;

  function setModeTagActive(active) {
    const nextActive = Boolean(active);
    if (inputModeState.modeTagActive === nextActive) {
      return;
    }
    inputModeState.modeTagActive = nextActive;
    if (typeof config.onModeTagActiveChange === 'function') {
      config.onModeTagActiveChange(nextActive);
    }
  }

  function setPrefixText(prefixText, theme, prefixOptions) {
    const nextOptions = prefixOptions || {};
    const nextPrefixText = String(prefixText || '');
    const shouldAnimate = Boolean(nextOptions.animate);
    const nextModeId = nextOptions.modeId ? String(nextOptions.modeId) : '';
    const previousModeId = String(siteSearchPrefix.getAttribute('data-mode-id') || '');
    const previousPrefixText = String(siteSearchPrefixText.textContent || '');
    if (previousModeId !== nextModeId || previousPrefixText !== nextPrefixText) {
      if (!nextOptions.preserveModeMenuDoubleTab) {
        resetModeMenuDoubleTab();
      }
      resetModeTagRemovalConfirmation();
    }
    const isSameMode = previousModeId === nextModeId;
    const isRepeatedMode = Boolean(previousModeId && isSameMode);
    const shouldAnimateResize = Boolean(
      shouldAnimate &&
      previousModeId &&
      !isSameMode &&
      isElementVisible(siteSearchPrefix)
    );
    const hasActivePrefixAnimation = Boolean(
      inputModeState.inputModePrefixAnimation ||
      inputModeState.inputModePrefixCurrentAnimation ||
      inputModeState.inputModePrefixAnimationFrame !== null ||
      inputModeState.inputModePrefixAnimationTimer
    );
    const shouldWaitForPendingText = Boolean(
      !shouldAnimate &&
      isSameMode &&
      hasActivePrefixAnimation &&
      inputModeState.inputModePrefixPendingText === nextPrefixText
    );
    const previousWidth = shouldAnimateResize
      ? getInputModePrefixRenderedWidth()
      : 0;
    if (shouldAnimateResize) {
      cancelInputModePrefixAnimation();
      settleInputModePrefixMenuVisualState();
    }
    const shouldPreserveAnimation = !shouldAnimate && isSameMode && Boolean(
      hasActivePrefixAnimation
    );
    if (shouldAnimateResize) {
      setStyle(siteSearchPrefix, 'transition', prefixTransition, useImportantStyles);
    } else if (!shouldAnimate && !shouldPreserveAnimation) {
      setStyle(siteSearchPrefix, 'transition', 'none', useImportantStyles);
    }
    setInputModePrefixIdentity(nextPrefixText, nextOptions);
    const visual = applyInputModePrefixVisual(theme, nextOptions);
    setStyle(siteSearchPrefix, 'display', 'inline-flex', useImportantStyles);
    setModeTagActive(true);
    if (shouldWaitForPendingText) {
      syncInputPlaceholder();
      setInputStyle(input, 'caret-color', visual.caretColor);
      updatePrefixLayout();
      return;
    }
    const contentOptions = {
      ...nextOptions,
      animateIcon: shouldAnimate && !isRepeatedMode,
      animateOutgoingIcon: shouldAnimateResize,
      preserveIconAnimation: !shouldAnimate && isSameMode
    };
    if (shouldAnimateResize) {
      const targetWidth = measureInputModePrefixWidthForText(nextPrefixText);
      if (targetWidth > previousWidth + 0.5) {
        inputModeState.inputModePrefixPendingText = nextPrefixText;
        syncInputPlaceholder();
        setInputStyle(input, 'caret-color', visual.caretColor);
        updatePrefixLayout();
        playInputModePrefixResizeAnimation(previousWidth, targetWidth, {
          preservePendingText: true,
          onFinish: () => {
            if (inputModeState.inputModePrefixPendingText !== nextPrefixText) {
              return;
            }
            inputModeState.inputModePrefixPendingText = '';
            setInputModePrefixContent(nextPrefixText, contentOptions);
            updatePrefixLayout();
          }
        });
        return;
      }
    }
    setInputModePrefixContent(nextPrefixText, contentOptions);
    const nextWidth = shouldAnimateResize
      ? Number(siteSearchPrefix.getBoundingClientRect().width) || 0
      : 0;
    if (!shouldAnimate && !shouldPreserveAnimation) {
      setInputModePrefixRestState({ transition: false });
    }
    syncInputPlaceholder();
    setInputStyle(input, 'caret-color', visual.caretColor);
    updatePrefixLayout();
    if (shouldAnimate && !isRepeatedMode) {
      if (shouldAnimateResize) {
        playInputModePrefixResizeAnimation(previousWidth, nextWidth);
      } else {
        playInputModePrefixEnterAnimation();
      }
    }
  }

  function setProviderPrefix(provider, theme, providerOptions) {
    const isAi = isAiSiteSearchProvider(provider);
    const isAggregate = Boolean(
      provider && (
        provider._xIsAggregateSearch === true ||
        String(provider.action || '') === 'aggregateSearch' ||
        String(provider.category || '') === 'aggregateSearch'
      )
    );
    const nextOptions = {
      ...(providerOptions || {}),
      iconUrl: isAggregate ? '' : getProviderIcon(provider),
      iconHost: isAggregate ? '' : getProviderThemeHost(provider),
      iconClass: isAggregate ? 'ri-stack-line' : (isAi ? 'ri-search-ai-line' : 'ri-global-line'),
      modeId: isAggregate
        ? `aggregate:${String(provider && provider.aggregateId ? provider.aggregateId : '')}`
        : `provider:${provider && (provider.key || provider.name) ? (provider.key || provider.name) : ''}`,
      provider,
      isAi: isAi && !isAggregate
    };
    setPrefixText(getSiteSearchPrefixText(provider), theme, nextOptions);
  }

  function clearProviderPrefix() {
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    cancelInputModePrefixIconAnimation();
    inputModeState.inputModePrefixContentRevision += 1;
    siteSearchPrefixText.textContent = '';
    siteSearchPrefix.removeAttribute('data-mode-id');
    siteSearchPrefix.removeAttribute('aria-label');
    setStyle(siteSearchPrefixIcon, 'display', 'none', useImportantStyles);
    setStyle(siteSearchPrefixIconFrame, 'display', 'none', useImportantStyles);
    siteSearchPrefixIcon.removeAttribute('src');
    setStyle(siteSearchPrefixGlyph, 'display', 'none', useImportantStyles);
    setStyle(siteSearchPrefixLineIcon, 'display', 'none', useImportantStyles);
    setStyle(siteSearchPrefixChevron, 'display', 'none', useImportantStyles);
    setInputModePrefixRestState({ transition: false });
    setStyle(siteSearchPrefix, 'display', 'none', useImportantStyles);
    setModeTagActive(false);
    closeModeMenu(false);
    input.placeholder = getDefaultPlaceholder();
    setInputStyle(input, 'caret-color', defaultCaretColor);
    updatePrefixLayout();
  }

  function removeProviderIconRuntimeFallbacks(parent) {
    if (!parent || typeof parent.querySelectorAll !== 'function') {
      return;
    }
    parent.querySelectorAll(
      '._x_extension_favicon_fallback_2024_unique_, ' +
      '._x_extension_overlay_favicon_fallback_2026_unique_, ' +
      '.x-nt-favicon-fallback, ' +
      '.x-ov-suggestion-favicon-fallback'
    ).forEach((node) => node.remove());
  }

  function renderTabHint(provider) {
    const site = getSiteSearchDisplayName(provider);
    const explicitLabel = provider && provider.tabHintLabel
      ? String(provider.tabHintLabel).trim()
      : '';
    const label = explicitLabel ||
      formatMessage('site_search_tab_hint', '使用 {site} 搜索', { site });
    const keyLabel = siteSearchTabHintKey;
    keyLabel.textContent = 'Tab';
    keyLabel.style.cssText = cssText([
      ['all', 'unset'],
      ['display', 'inline-flex'],
      ['align-items', 'center'],
      ['justify-content', 'center'],
      ['min-width', '32px'],
      ['height', '22px'],
      ['padding', '0 6px'],
      ['border-radius', '7px'],
      ['corner-shape', 'superellipse(1.25)'],
      ['border', `1px solid ${vars.panelBorder}`],
      ['background', vars.tagBg],
      ['color', vars.tagText],
      ['box-sizing', 'border-box'],
      ['font-size', '11px'],
      ['font-family', 'inherit'],
      ['font-weight', '700'],
      ['line-height', '14px'],
      ['letter-spacing', '0'],
      ['white-space', 'nowrap'],
      ['flex', '0 0 auto']
    ], useImportantStyles);
    const textLabel = siteSearchTabHintText;
    textLabel.textContent = label;
    textLabel.style.cssText = cssText([
      ['all', 'unset'],
      ['display', 'inline-block'],
      ['min-width', '0'],
      ['max-width', '220px'],
      ['overflow', 'hidden'],
      ['text-overflow', 'ellipsis'],
      ['white-space', 'nowrap'],
      ['color', vars.tagText],
      ['font-size', '13px'],
      ['font-family', 'inherit'],
      ['font-weight', '400'],
      ['line-height', '18px'],
      ['letter-spacing', '0'],
      ['flex', '1 1 auto']
    ], useImportantStyles);
    if (provider) {
      siteSearchTabHint.setAttribute('title', label);
    } else {
      siteSearchTabHint.removeAttribute('title');
    }
  }

  // Touch-only devices have no Tab key, so the hint would only crowd the query.
  function hasNoTabKeyPointer() {
    return Boolean(
      win &&
      typeof win.matchMedia === 'function' &&
      win.matchMedia('(hover: none) and (pointer: coarse)').matches
    );
  }

  function setTabHintVisible(visible, provider) {
    if (!visible || hasNoTabKeyPointer()) {
      setStyle(siteSearchTabHint, 'display', 'none', useImportantStyles);
      siteSearchTabHint.removeAttribute('title');
      updateInputRightPadding();
      return;
    }
    if (typeof config.isTabHintSuppressed === 'function' && config.isTabHintSuppressed()) {
      return;
    }
    renderTabHint(provider);
    setStyle(siteSearchTabHint, 'display', 'inline-flex', useImportantStyles);
    updateInputRightPadding();
  }

  return {
    setPrefixText,
    setProviderPrefix,
    clearProviderPrefix,
    removeProviderIconRuntimeFallbacks,
    setTabHintVisible
  };
}

export { createPrefixText };
