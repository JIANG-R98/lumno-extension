// @ts-nocheck
// The mode prefix's content: its identity, the icon swap with a ghost of
// the previous icon, and measuring and setting its text and icon.
function createPrefixContent(deps) {
  const {
    siteSearchPrefix,
    formatMessage,
    setStyle,
    useImportantStyles,
    shouldReduceInputModeMotion,
    siteSearchPrefixLineIcon,
    siteSearchPrefixIconFrame,
    siteSearchPrefixGlyph,
    isElementVisible,
    DEFAULT_PREFIX_ICON_POP_DURATION,
    DEFAULT_PREFIX_ICON_POP_EASING,
    DEFAULT_PREFIX_ICON_EXIT_DURATION,
    DEFAULT_PREFIX_ICON_EXIT_EASING,
    siteSearchPrefixText,
    resolveProviderIconUrl,
    renderModeLineIconSvg,
    siteSearchPrefixIcon,
    cssText,
    removeProviderIconRuntimeFallbacks,
    updatePrefixLayout,
    attachProviderIcon,
    preferDirectProviderIcons,
    attachFaviconData,
    siteSearchPrefixCurrentText,
    siteSearchPrefixCurrent,
    siteSearchPrefixChevron,
    win
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  let inputModePrefixIconAnimation = null;
  let inputModePrefixIconAnimationElement = null;
  let inputModePrefixIconGhost = null;
  let inputModePrefixOutgoingIconAnimation = null;

  function setInputModePrefixIdentity(prefixText, contentOptions) {
    siteSearchPrefix.setAttribute(
      'data-mode-id',
      contentOptions && contentOptions.modeId ? String(contentOptions.modeId) : ''
    );
    siteSearchPrefix.setAttribute('aria-label', formatMessage(
      'search_scope_switcher_label',
      '搜索范围：{scope}。选择即可切换。',
      { scope: prefixText }
    ));
  }

  function cancelInputModePrefixIconAnimation() {
    const incomingAnimation = inputModePrefixIconAnimation;
    const incomingElement = inputModePrefixIconAnimationElement;
    const outgoingAnimation = inputModePrefixOutgoingIconAnimation;
    const outgoingIcon = inputModePrefixIconGhost;
    inputModePrefixIconAnimation = null;
    inputModePrefixIconAnimationElement = null;
    inputModePrefixIconGhost = null;
    inputModePrefixOutgoingIconAnimation = null;
    if (incomingAnimation && typeof incomingAnimation.cancel === 'function') {
      incomingAnimation.cancel();
    }
    if (outgoingAnimation && typeof outgoingAnimation.cancel === 'function') {
      outgoingAnimation.cancel();
    }
    if (incomingElement) {
      setStyle(incomingElement, 'opacity', '1', useImportantStyles);
      setStyle(incomingElement, 'filter', 'none', useImportantStyles);
      setStyle(incomingElement, 'transform', 'none', useImportantStyles);
      setStyle(incomingElement, 'will-change', 'auto', useImportantStyles);
    }
    if (outgoingIcon && outgoingIcon.parentNode) {
      outgoingIcon.parentNode.removeChild(outgoingIcon);
    }
  }

  function createInputModePrefixIconGhost(animateIcon) {
    if (!animateIcon || shouldReduceInputModeMotion()) {
      return null;
    }
    const activeIcon = [
      siteSearchPrefixLineIcon,
      siteSearchPrefixIconFrame,
      siteSearchPrefixGlyph
    ].find((element) => isElementVisible(element));
    if (!activeIcon || typeof activeIcon.cloneNode !== 'function') {
      return null;
    }
    const ghost = activeIcon.cloneNode(true);
    const prefixRect = siteSearchPrefix.getBoundingClientRect();
    const iconRect = activeIcon.getBoundingClientRect();
    const iconWidth = Number(iconRect.width) || Number(activeIcon.offsetWidth) || 16;
    const iconHeight = Number(iconRect.height) || Number(activeIcon.offsetHeight) || 16;
    const iconLeft = Number(iconRect.left) - Number(prefixRect.left);
    const iconTop = Number(iconRect.top) - Number(prefixRect.top);
    ghost.removeAttribute('id');
    ghost.removeAttribute('data-search-input-mode-line-icon');
    ghost.removeAttribute('data-search-input-mode-prefix-glyph');
    ghost.removeAttribute('data-search-input-mode-prefix-icon');
    ghost.removeAttribute('data-search-input-mode-prefix-icon-frame');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-search-input-mode-icon-ghost', '');
    setStyle(ghost, 'position', 'absolute', useImportantStyles);
    setStyle(ghost, 'left', `${Number.isFinite(iconLeft) ? iconLeft : 0}px`, useImportantStyles);
    setStyle(ghost, 'top', `${Number.isFinite(iconTop) ? iconTop : 0}px`, useImportantStyles);
    setStyle(ghost, 'width', `${iconWidth}px`, useImportantStyles);
    setStyle(ghost, 'height', `${iconHeight}px`, useImportantStyles);
    setStyle(ghost, 'display', 'inline-flex', useImportantStyles);
    setStyle(ghost, 'align-items', 'center', useImportantStyles);
    setStyle(ghost, 'justify-content', 'center', useImportantStyles);
    setStyle(ghost, 'pointer-events', 'none', useImportantStyles);
    setStyle(ghost, 'opacity', '1', useImportantStyles);
    setStyle(ghost, 'filter', 'none', useImportantStyles);
    setStyle(ghost, 'transform', 'none', useImportantStyles);
    setStyle(ghost, 'transform-origin', 'center', useImportantStyles);
    setStyle(ghost, 'will-change', 'opacity, transform', useImportantStyles);
    setStyle(ghost, 'z-index', '2', useImportantStyles);
    siteSearchPrefix.appendChild(ghost);
    return ghost;
  }

  function playInputModePrefixIconSwap(animateIcon, outgoingIcon) {
    const activeIcon = [
      siteSearchPrefixLineIcon,
      siteSearchPrefixIconFrame,
      siteSearchPrefixGlyph
    ].find((element) => isElementVisible(element));
    if (!activeIcon) {
      if (outgoingIcon && outgoingIcon.parentNode) {
        outgoingIcon.parentNode.removeChild(outgoingIcon);
      }
      return;
    }
    setStyle(activeIcon, 'opacity', '1', useImportantStyles);
    setStyle(activeIcon, 'filter', 'none', useImportantStyles);
    setStyle(activeIcon, 'transform', 'none', useImportantStyles);
    setStyle(activeIcon, 'transform-origin', 'center', useImportantStyles);
    setStyle(activeIcon, 'will-change', 'auto', useImportantStyles);
    if (!animateIcon || shouldReduceInputModeMotion() ||
        typeof activeIcon.animate !== 'function') {
      if (outgoingIcon && outgoingIcon.parentNode) {
        outgoingIcon.parentNode.removeChild(outgoingIcon);
      }
      return;
    }
    activeIcon.style.setProperty('opacity', '1');
    activeIcon.style.setProperty('filter', 'none');
    activeIcon.style.setProperty('transform', 'none');
    const animation = activeIcon.animate([
      {
        opacity: 0.45,
        offset: 0,
        transform: 'scale(0.84)'
      },
      {
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: 1,
        offset: 0.62,
        transform: 'scale(1.05)'
      },
      {
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        opacity: 1,
        offset: 0.84,
        transform: 'scale(0.99)'
      },
      { opacity: 1, offset: 1, transform: 'scale(1)' }
    ], {
      duration: DEFAULT_PREFIX_ICON_POP_DURATION,
      easing: DEFAULT_PREFIX_ICON_POP_EASING
    });
    inputModePrefixIconAnimation = animation;
    inputModePrefixIconAnimationElement = activeIcon;
    setStyle(activeIcon, 'will-change', 'opacity, transform', useImportantStyles);
    animation.onfinish = () => {
      if (inputModePrefixIconAnimation !== animation) {
        return;
      }
      inputModePrefixIconAnimation = null;
      inputModePrefixIconAnimationElement = null;
      setStyle(activeIcon, 'opacity', '1', useImportantStyles);
      setStyle(activeIcon, 'filter', 'none', useImportantStyles);
      setStyle(activeIcon, 'transform', 'none', useImportantStyles);
      setStyle(activeIcon, 'will-change', 'auto', useImportantStyles);
    };
    animation.oncancel = () => {
      if (inputModePrefixIconAnimation === animation) {
        inputModePrefixIconAnimation = null;
        inputModePrefixIconAnimationElement = null;
      }
    };
    if (!outgoingIcon || typeof outgoingIcon.animate !== 'function') {
      if (outgoingIcon && outgoingIcon.parentNode) {
        outgoingIcon.parentNode.removeChild(outgoingIcon);
      }
      return;
    }
    outgoingIcon.style.setProperty('opacity', '1');
    outgoingIcon.style.setProperty('transform', 'none');
    const outgoingAnimation = outgoingIcon.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.84)' }
    ], {
      duration: DEFAULT_PREFIX_ICON_EXIT_DURATION,
      easing: DEFAULT_PREFIX_ICON_EXIT_EASING
    });
    inputModePrefixIconGhost = outgoingIcon;
    inputModePrefixOutgoingIconAnimation = outgoingAnimation;
    const removeOutgoingIcon = () => {
      if (inputModePrefixOutgoingIconAnimation === outgoingAnimation) {
        inputModePrefixOutgoingIconAnimation = null;
      }
      if (inputModePrefixIconGhost === outgoingIcon) {
        inputModePrefixIconGhost = null;
      }
      if (outgoingIcon.parentNode) {
        outgoingIcon.parentNode.removeChild(outgoingIcon);
      }
    };
    outgoingAnimation.onfinish = removeOutgoingIcon;
    outgoingAnimation.oncancel = removeOutgoingIcon;
  }

  function measureInputModePrefixWidthForText(prefixText) {
    const previousText = String(siteSearchPrefixText.textContent || '');
    siteSearchPrefixText.textContent = String(prefixText || '');
    const width = Number(siteSearchPrefix.getBoundingClientRect().width) || 0;
    siteSearchPrefixText.textContent = previousText;
    return width;
  }

  function setInputModePrefixContent(prefixText, contentOptions) {
    const preserveIconAnimation = Boolean(
      contentOptions && contentOptions.preserveIconAnimation
    );
    const animateIcon = Boolean(contentOptions && contentOptions.animateIcon);
    const animateOutgoingIcon = Boolean(
      contentOptions && contentOptions.animateOutgoingIcon
    );
    let outgoingIcon = null;
    if (!preserveIconAnimation) {
      cancelInputModePrefixIconAnimation();
      outgoingIcon = createInputModePrefixIconGhost(animateOutgoingIcon);
    }
    const contentRevision = ++inputModeState.inputModePrefixContentRevision;
    const iconUrl = String(resolveProviderIconUrl(
      contentOptions && contentOptions.provider,
      contentOptions && contentOptions.iconUrl || ''
    ) || '').trim();
    const iconClass = contentOptions && contentOptions.iconClass
      ? String(contentOptions.iconClass).trim()
      : (contentOptions && contentOptions.isAi ? 'ri-search-ai-line' : 'ri-search-line');
    const lineIconName = contentOptions && contentOptions.menuIconName
      ? String(contentOptions.menuIconName).trim()
      : '';
    const hasBuiltInLineIcon = renderModeLineIconSvg(
      siteSearchPrefixLineIcon,
      lineIconName,
      '2'
    );
    if (hasBuiltInLineIcon) {
      setStyle(siteSearchPrefixLineIcon, 'display', 'inline-flex', useImportantStyles);
      setStyle(siteSearchPrefixGlyph, 'display', 'none', useImportantStyles);
      setStyle(siteSearchPrefixIconFrame, 'display', 'none', useImportantStyles);
      setStyle(siteSearchPrefixIcon, 'display', 'none', useImportantStyles);
      siteSearchPrefixIcon.removeAttribute('src');
    } else {
      setStyle(siteSearchPrefixLineIcon, 'display', 'none', useImportantStyles);
      siteSearchPrefixGlyph.className = `ri-icon ri-size-16 ${iconClass}`;
      setStyle(siteSearchPrefixGlyph, 'display', 'inline-flex', useImportantStyles);
      setStyle(siteSearchPrefixGlyph, 'flex', '0 0 auto', useImportantStyles);
    }
    if (!hasBuiltInLineIcon && iconUrl) {
      const icon = siteSearchPrefixIcon;
      siteSearchPrefixIconFrame.style.cssText = cssText([
        ['all', 'unset'],
        ['position', 'relative'],
        ['width', '20px'],
        ['height', '20px'],
        ['border-radius', '6px'],
        ['clip-path', 'inset(0 round 6px)'],
        ['overflow', 'hidden'],
        ['isolation', 'isolate'],
        ['flex', '0 0 20px'],
        ['display', 'inline-flex']
      ], useImportantStyles);
      icon.alt = '';
      icon.decoding = 'async';
      icon.referrerPolicy = 'no-referrer';
      icon.style.cssText = cssText([
        ['all', 'unset'],
        ['width', '20px'],
        ['height', '20px'],
        ['border-radius', '6px'],
        ['clip-path', 'inset(0 round 6px)'],
        ['overflow', 'hidden'],
        ['object-fit', 'contain'],
        ['flex', '0 0 auto'],
        ['display', 'block']
      ], useImportantStyles);
      setStyle(siteSearchPrefixGlyph, 'display', 'none', useImportantStyles);
      const removeUnavailableIcon = () => {
        if (contentRevision !== inputModeState.inputModePrefixContentRevision) {
          return;
        }
        removeProviderIconRuntimeFallbacks(siteSearchPrefix);
        setStyle(siteSearchPrefixIconFrame, 'display', 'none', useImportantStyles);
        setStyle(icon, 'display', 'none', useImportantStyles);
        icon.removeAttribute('src');
        setStyle(siteSearchPrefixGlyph, 'display', 'inline-flex', useImportantStyles);
        updatePrefixLayout();
      };
      const iconHost = contentOptions && contentOptions.iconHost ? String(contentOptions.iconHost || '').trim() : '';
      let handledByProviderIconRuntime = false;
      if (attachProviderIcon && !preferDirectProviderIcons) {
        try {
          handledByProviderIconRuntime = attachProviderIcon(icon, {
            iconHost,
            iconUrl,
            onIconUnavailable: removeUnavailableIcon,
            prefixText,
            provider: contentOptions && contentOptions.provider ? contentOptions.provider : null
          }) === true;
        } catch (e) {
          handledByProviderIconRuntime = false;
        }
      }
      if (!handledByProviderIconRuntime) {
        icon.addEventListener('error', removeUnavailableIcon, { once: true });
        icon.src = iconUrl;
        if (attachFaviconData && !iconUrl.startsWith('data:')) {
          attachFaviconData(icon, iconUrl, iconHost);
        }
      }
    } else if (!hasBuiltInLineIcon) {
      setStyle(siteSearchPrefixIconFrame, 'display', 'none', useImportantStyles);
      setStyle(siteSearchPrefixIcon, 'display', 'none', useImportantStyles);
      siteSearchPrefixIcon.removeAttribute('src');
    }
    setStyle(siteSearchPrefixIcon, 'transition', 'none', useImportantStyles);
    setStyle(siteSearchPrefixIconFrame, 'transition', 'none', useImportantStyles);
    setStyle(siteSearchPrefixGlyph, 'transition', 'none', useImportantStyles);
    setStyle(siteSearchPrefixLineIcon, 'transition', 'none', useImportantStyles);
    const text = siteSearchPrefixText;
    text.textContent = prefixText;
    text.style.cssText = cssText([
      ['all', 'unset'],
      ['display', 'block'],
      ['flex', '0 1 auto'],
      ['min-width', '0'],
      ['overflow', 'hidden'],
      ['text-overflow', 'ellipsis'],
      ['white-space', 'nowrap'],
      ['line-height', '18px']
    ], useImportantStyles);
    siteSearchPrefixCurrentText.textContent = formatMessage(
      'search_scope_current',
      '当前'
    );
    const currentLabelVisible = siteSearchPrefix.getAttribute(
      'data-current-visible'
    ) === 'true';
    siteSearchPrefixCurrent.style.cssText = cssText([
      ['all', 'unset'],
      ['display', currentLabelVisible ? 'inline-flex' : 'none'],
      ['align-items', 'center'],
      ['font-size', '13px'],
      ['font-weight', '600'],
      ['line-height', '18px'],
      ['letter-spacing', '0.04em'],
      ['white-space', 'nowrap'],
      ['overflow', 'hidden'],
      ['flex', '0 0 auto']
    ], useImportantStyles);
    setInputModePrefixIdentity(prefixText, contentOptions);
    setStyle(siteSearchPrefixChevron, 'display', 'inline-flex', useImportantStyles);
    setStyle(siteSearchPrefixChevron, 'flex', '0 0 auto', useImportantStyles);
    if (!preserveIconAnimation) {
      playInputModePrefixIconSwap(animateIcon, outgoingIcon);
    }
  }

  function getInputModePrefixRenderedWidth() {
    if (!isElementVisible(siteSearchPrefix) ||
        typeof siteSearchPrefix.getBoundingClientRect !== 'function') {
      return 0;
    }
    return Math.max(
      0,
      Number(siteSearchPrefix.getBoundingClientRect().width) || 0
    );
  }

  function getInputModePrefixCurrentVisualState() {
    if (!isElementVisible(siteSearchPrefix) ||
        typeof siteSearchPrefixCurrent.getBoundingClientRect !== 'function') {
      return { marginLeft: 0, width: 0 };
    }
    const width = Math.max(
      0,
      Number(siteSearchPrefixCurrent.getBoundingClientRect().width) || 0
    );
    const computedStyle = win && typeof win.getComputedStyle === 'function'
      ? win.getComputedStyle(siteSearchPrefixCurrent)
      : null;
    const marginLeft = computedStyle
      ? Number.parseFloat(computedStyle.marginLeft) || 0
      : 0;
    return { marginLeft, width };
  }

  return {
    setInputModePrefixIdentity,
    cancelInputModePrefixIconAnimation,
    measureInputModePrefixWidthForText,
    setInputModePrefixContent,
    getInputModePrefixRenderedWidth,
    getInputModePrefixCurrentVisualState
  };
}

export { createPrefixContent };
