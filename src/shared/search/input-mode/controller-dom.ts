// @ts-nocheck
// Builds the controller's elements: the mode prefix with its icon, glyph
// and chevron, the mode menu surface with its content and footer hints.
function createControllerDom(deps) {
  const {
    siteSearchPrefix,
    siteSearchPrefixIcon,
    siteSearchPrefixText,
    siteSearchTabHint,
    siteSearchTabHintKey,
    siteSearchTabHintText,
    prefixId,
    siteSearchPrefixIconFrame,
    siteSearchPrefixGlyph,
    siteSearchPrefixLineIcon,
    cssText,
    useImportantStyles,
    siteSearchPrefixChevron,
    siteSearchPrefixCurrent,
    siteSearchPrefixCurrentText,
    DEFAULT_PREFIX_ITEM_GAP_PX,
    INPUT_FONT_STACK,
    prefixTransition,
    setStyle,
    modeMenu,
    menuSurfaceClass,
    menuSurface,
    surface,
    vars,
    container,
    applyNoTranslate,
    doc
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  if (!siteSearchPrefix || !siteSearchPrefixIcon || !siteSearchPrefixText ||
      !siteSearchTabHint || !siteSearchTabHintKey || !siteSearchTabHintText) {
    throw new Error('createInputModeController requires React input mode parts');
  }
  siteSearchPrefix.id = prefixId;
  siteSearchPrefix.className = 'x-lumno-search-input-mode__prefix';
  siteSearchPrefix.setAttribute('type', 'button');
  siteSearchPrefix.setAttribute('aria-haspopup', 'menu');
  siteSearchPrefix.setAttribute('aria-expanded', 'false');
  siteSearchPrefix.setAttribute('aria-controls', `${prefixId}-menu`);
  siteSearchPrefix.setAttribute('data-menu-open', 'false');
  siteSearchPrefix.setAttribute('data-current-visible', 'false');
  siteSearchPrefix.setAttribute('data-current-measuring', 'false');
  siteSearchPrefixIconFrame.className = 'x-lumno-search-input-mode__prefix-icon-frame';
  siteSearchPrefixIconFrame.setAttribute('data-search-input-mode-prefix-icon-frame', '');
  if (!siteSearchPrefixIconFrame.parentNode) {
    if (siteSearchPrefixIcon.parentNode) {
      const iconParent = siteSearchPrefixIcon.parentNode;
      if (typeof iconParent.insertBefore === 'function') {
        iconParent.insertBefore(siteSearchPrefixIconFrame, siteSearchPrefixIcon);
      } else {
        if (typeof iconParent.removeChild === 'function') {
          iconParent.removeChild(siteSearchPrefixIcon);
        }
        iconParent.appendChild(siteSearchPrefixIconFrame);
      }
    } else if (typeof siteSearchPrefix.insertBefore === 'function') {
      siteSearchPrefix.insertBefore(siteSearchPrefixIconFrame, siteSearchPrefixText);
    } else {
      siteSearchPrefix.appendChild(siteSearchPrefixIconFrame);
    }
  }
  if (siteSearchPrefixIcon.parentNode !== siteSearchPrefixIconFrame) {
    siteSearchPrefixIconFrame.appendChild(siteSearchPrefixIcon);
  }
  if (!siteSearchPrefixGlyph.parentNode) {
    if (typeof siteSearchPrefix.insertBefore === 'function') {
      siteSearchPrefix.insertBefore(siteSearchPrefixGlyph, siteSearchPrefixText);
    } else {
      siteSearchPrefix.appendChild(siteSearchPrefixGlyph);
    }
  }
  siteSearchPrefixLineIcon.setAttribute('aria-hidden', 'true');
  siteSearchPrefixLineIcon.setAttribute('class', 'x-lumno-search-input-mode__prefix-line-icon');
  siteSearchPrefixLineIcon.setAttribute('data-search-input-mode-line-icon', '');
  siteSearchPrefixLineIcon.style.cssText = cssText([
    ['display', 'none'],
    ['width', '16px'],
    ['height', '16px'],
    ['flex', '0 0 16px']
  ], useImportantStyles);
  if (!siteSearchPrefixLineIcon.parentNode) {
    if (typeof siteSearchPrefix.insertBefore === 'function') {
      siteSearchPrefix.insertBefore(siteSearchPrefixLineIcon, siteSearchPrefixText);
    } else {
      siteSearchPrefix.appendChild(siteSearchPrefixLineIcon);
    }
  }
  if (!siteSearchPrefixChevron.parentNode) {
    siteSearchPrefix.appendChild(siteSearchPrefixChevron);
  }
  if (!siteSearchPrefixCurrent.parentNode) {
    if (typeof siteSearchPrefix.insertBefore === 'function') {
      siteSearchPrefix.insertBefore(siteSearchPrefixCurrent, siteSearchPrefixChevron);
    } else {
      siteSearchPrefix.appendChild(siteSearchPrefixCurrent);
    }
  }
  if (!siteSearchPrefixCurrentText.parentNode) {
    siteSearchPrefixCurrent.appendChild(siteSearchPrefixCurrentText);
  }
  if (siteSearchPrefixCurrentText.style &&
      typeof siteSearchPrefixCurrentText.style.setProperty === 'function') {
    siteSearchPrefixCurrentText.style.setProperty('display', 'inline-block');
  }
  siteSearchPrefixCurrent.setAttribute('aria-hidden', 'true');
  siteSearchPrefixCurrent.setAttribute('data-search-input-mode-current', '');
  siteSearchPrefixCurrentText.setAttribute('data-search-input-mode-current-text', '');
  siteSearchPrefixGlyph.setAttribute('aria-hidden', 'true');
  siteSearchPrefixChevron.setAttribute('aria-hidden', 'true');
  siteSearchPrefixChevron.className = 'ri-icon ri-size-16 ri-arrow-down-s-line';
  siteSearchPrefix.style.cssText = cssText([
    ['all', 'unset'],
    ['position', 'absolute'],
    ['top', '50%'],
    ['transform', 'translateY(-50%)'],
    ['transform-origin', 'left center'],
    ['left', '50px'],
    ['display', 'none'],
    ['align-items', 'center'],
    ['justify-content', 'flex-start'],
    ['gap', `${DEFAULT_PREFIX_ITEM_GAP_PX}px`],
    ['max-width', 'min(220px, 48%)'],
    ['min-width', '0'],
    ['box-sizing', 'border-box'],
    ['height', '32px'],
    ['padding', '0 6px'],
    ['white-space', 'nowrap'],
    ['overflow', 'hidden'],
    ['text-overflow', 'ellipsis'],
    ['font-size', '13px'],
    ['font-family', INPUT_FONT_STACK],
    ['font-weight', '700'],
    ['line-height', '1'],
    ['letter-spacing', '0'],
    ['color', '#F8FAFC'],
    ['background', '#3B82F6'],
    ['border', 'none'],
    ['border-radius', '10px'],
    ['corner-shape', 'superellipse(1.25)'],
    ['box-shadow', 'none'],
    ['opacity', '1'],
    ['transition', prefixTransition],
    ['will-change', 'auto'],
    ['cursor', 'pointer'],
    ['pointer-events', 'auto'],
    ['z-index', '1'],
    ['user-select', 'none']
  ], useImportantStyles);
  setStyle(siteSearchPrefix, 'justify-content', 'flex-start', useImportantStyles);
  setStyle(siteSearchPrefix, 'height', '32px', useImportantStyles);
  setStyle(siteSearchPrefix, 'padding', '0 6px', useImportantStyles);
  modeMenu.id = `${prefixId}-menu`;
  modeMenu.className = `x-lumno-search-input-mode__menu ${menuSurfaceClass}`;
  if (typeof menuSurface.apply === 'function') {
    menuSurface.apply(modeMenu);
  }
  modeMenu.setAttribute('data-surface', surface);
  modeMenu.setAttribute('data-filtered', 'false');
  modeMenu.setAttribute('data-search-active', 'false');
  modeMenu.setAttribute('role', 'menu');
  modeMenu.setAttribute('aria-labelledby', prefixId);
  modeMenu.tabIndex = -1;
  modeMenu.hidden = true;
  const modeMenuEdgeOffset = surface === 'newtab' ? '-6px' : '-1px';
  const modeMenuPositionTransform = 'translateY(calc(var(--x-lumno-search-mode-menu-result-offset, 0px) + var(--x-lumno-search-mode-menu-lift, 0px)))';
  const modeMenuClosedTransform = surface === 'newtab'
    ? `${modeMenuPositionTransform} scale(0.96, 0.86)`
    : 'translateY(calc(var(--x-lumno-search-mode-menu-result-offset, 0px) + var(--x-lumno-search-mode-menu-lift, 0px) - 6px)) scale(0.96, 0.86)';
  const modeMenuStyles = [
    ['position', 'absolute'],
    ['left', modeMenuEdgeOffset],
    ['right', modeMenuEdgeOffset],
    ['top', `calc(100% + ${vars.panelGap})`],
    ['width', 'auto'],
    ['height', 'min(360px, 62vh, var(--x-lumno-search-mode-menu-viewport-max-height, 360px))'],
    ['max-height', 'min(360px, 62vh, var(--x-lumno-search-mode-menu-viewport-max-height, 360px))'],
    ['overflow', 'hidden'],
    ['padding', '0'],
    ['border', `1px solid ${vars.panelBorder}`],
    ['border-radius', vars.panelRadius],
    ['background', vars.panelBg],
    ['box-shadow', vars.panelShadow],
    ['box-sizing', 'border-box'],
    ['font-family', INPUT_FONT_STACK],
    ['font-size', '13px'],
    ['color', vars.panelText],
    ['z-index', '40'],
    ['--x-lumno-search-mode-menu-lift', '0px'],
    ['--x-lumno-search-mode-menu-result-offset', '0px'],
    ['--x-extension-menu-surface-closed-transform', modeMenuClosedTransform],
    ['--x-extension-menu-surface-open-transform', `${modeMenuPositionTransform} scale(1, 1)`],
    ['overscroll-behavior', 'contain']
  ];
  modeMenu.style.cssText = '';
  modeMenuStyles.forEach((pair) => {
    setStyle(modeMenu, pair[0], pair[1], useImportantStyles);
  });
  if (!modeMenu.parentNode) {
    container.appendChild(modeMenu);
  }
  inputModeState.modeMenuContent = typeof modeMenu.querySelector === 'function'
    ? modeMenu.querySelector('[data-search-input-mode-menu-content]')
    : null;
  inputModeState.modeMenuFooter = typeof modeMenu.querySelector === 'function'
    ? modeMenu.querySelector('[data-search-input-mode-menu-footer]')
    : null;
  if (!inputModeState.modeMenuContent || !inputModeState.modeMenuFooter) {
    while (modeMenu.firstChild) {
      modeMenu.removeChild(modeMenu.firstChild);
    }
    inputModeState.modeMenuContent = applyNoTranslate(doc.createElement('div'));
    inputModeState.modeMenuContent.className = 'x-lumno-search-input-mode__menu-content';
    inputModeState.modeMenuContent.setAttribute('data-search-input-mode-menu-content', '');
    inputModeState.modeMenuContent.setAttribute('role', 'presentation');
    inputModeState.modeMenuFooter = applyNoTranslate(doc.createElement('div'));
    inputModeState.modeMenuFooter.className = 'x-lumno-search-input-mode__menu-footer';
    inputModeState.modeMenuFooter.setAttribute('data-search-input-mode-menu-footer', '');
    inputModeState.modeMenuFooter.setAttribute('role', 'presentation');
    inputModeState.modeMenuFooter.setAttribute('aria-hidden', 'true');
    modeMenu.appendChild(inputModeState.modeMenuContent);
    modeMenu.appendChild(inputModeState.modeMenuFooter);
  }
  inputModeState.modeMenuFooterKey = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-key]')
    : null;
  inputModeState.modeMenuFooterText = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-text]')
    : null;
  inputModeState.modeMenuFooterFilterText = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-filter-text]')
    : null;
  let modeMenuFooterActions = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-actions]')
    : null;
  let modeMenuFooterNavigationHint = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-navigation-hint]')
    : null;
  let modeMenuFooterSelectHint = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-select-hint]')
    : null;
  inputModeState.modeMenuFooterNavigationKey = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-navigation-key]')
    : null;
  inputModeState.modeMenuFooterNavigationText = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-navigation-text]')
    : null;
  inputModeState.modeMenuFooterSelectKey = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-select-key]')
    : null;
  inputModeState.modeMenuFooterSelectText = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-select-text]')
    : null;
  let modeMenuFooterShortcutHint = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-shortcut-hint]')
    : null;
  let modeMenuFooterInputHint = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-input-hint]')
    : null;
  inputModeState.modeMenuFooterInputKey = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-input-key]')
    : null;
  inputModeState.modeMenuFooterInputText = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-input-text]')
    : null;
  if (!inputModeState.modeMenuFooterKey || !inputModeState.modeMenuFooterText || !inputModeState.modeMenuFooterFilterText ||
      !modeMenuFooterActions || !modeMenuFooterNavigationHint ||
      !modeMenuFooterSelectHint ||
      !inputModeState.modeMenuFooterNavigationKey || !inputModeState.modeMenuFooterNavigationText ||
      !inputModeState.modeMenuFooterSelectKey || !inputModeState.modeMenuFooterSelectText ||
      !modeMenuFooterShortcutHint || !modeMenuFooterInputHint ||
      !inputModeState.modeMenuFooterInputKey || !inputModeState.modeMenuFooterInputText) {
    while (inputModeState.modeMenuFooter.firstChild) {
      inputModeState.modeMenuFooter.removeChild(inputModeState.modeMenuFooter.firstChild);
    }
    inputModeState.modeMenuFooterFilterText = applyNoTranslate(doc.createElement('span'));
    inputModeState.modeMenuFooterFilterText.className =
      'x-lumno-search-input-mode__menu-footer-filter-text';
    inputModeState.modeMenuFooterFilterText.setAttribute(
      'data-search-input-mode-menu-footer-filter-text',
      ''
    );
    modeMenuFooterActions = applyNoTranslate(doc.createElement('span'));
    modeMenuFooterActions.className =
      'x-lumno-search-input-mode__menu-footer-actions';
    modeMenuFooterActions.setAttribute(
      'data-search-input-mode-menu-footer-actions',
      ''
    );
    modeMenuFooterNavigationHint = applyNoTranslate(doc.createElement('span'));
    modeMenuFooterNavigationHint.className =
      'x-lumno-search-input-mode__menu-footer-hint x-lumno-search-input-mode__menu-footer-hint--navigation';
    modeMenuFooterNavigationHint.setAttribute(
      'data-search-input-mode-menu-footer-navigation-hint',
      ''
    );
    inputModeState.modeMenuFooterNavigationKey = applyNoTranslate(doc.createElement('span'));
    inputModeState.modeMenuFooterNavigationKey.className =
      'x-lumno-search-input-mode__menu-footer-key x-lumno-search-input-mode__menu-footer-key--arrows';
    inputModeState.modeMenuFooterNavigationKey.setAttribute(
      'data-search-input-mode-menu-footer-navigation-key',
      ''
    );
    inputModeState.modeMenuFooterNavigationText = applyNoTranslate(doc.createElement('span'));
    inputModeState.modeMenuFooterNavigationText.className =
      'x-lumno-search-input-mode__menu-footer-text';
    inputModeState.modeMenuFooterNavigationText.setAttribute(
      'data-search-input-mode-menu-footer-navigation-text',
      ''
    );
    modeMenuFooterSelectHint = applyNoTranslate(doc.createElement('span'));
    modeMenuFooterSelectHint.className =
      'x-lumno-search-input-mode__menu-footer-hint x-lumno-search-input-mode__menu-footer-hint--select';
    modeMenuFooterSelectHint.setAttribute(
      'data-search-input-mode-menu-footer-select-hint',
      ''
    );
    inputModeState.modeMenuFooterSelectKey = applyNoTranslate(doc.createElement('span'));
    inputModeState.modeMenuFooterSelectKey.className =
      'x-lumno-search-input-mode__menu-footer-key';
    inputModeState.modeMenuFooterSelectKey.setAttribute(
      'data-search-input-mode-menu-footer-select-key',
      ''
    );
    inputModeState.modeMenuFooterSelectText = applyNoTranslate(doc.createElement('span'));
    inputModeState.modeMenuFooterSelectText.className =
      'x-lumno-search-input-mode__menu-footer-text';
    inputModeState.modeMenuFooterSelectText.setAttribute(
      'data-search-input-mode-menu-footer-select-text',
      ''
    );
    modeMenuFooterInputHint = applyNoTranslate(doc.createElement('span'));
    modeMenuFooterInputHint.className =
      'x-lumno-search-input-mode__menu-footer-hint x-lumno-search-input-mode__menu-footer-hint--input';
    modeMenuFooterInputHint.setAttribute(
      'data-search-input-mode-menu-footer-input-hint',
      ''
    );
    inputModeState.modeMenuFooterInputKey = applyNoTranslate(doc.createElement('span'));
    inputModeState.modeMenuFooterInputKey.className =
      'x-lumno-search-input-mode__menu-footer-key';
    inputModeState.modeMenuFooterInputKey.setAttribute(
      'data-search-input-mode-menu-footer-input-key',
      ''
    );
    inputModeState.modeMenuFooterInputText = applyNoTranslate(doc.createElement('span'));
    inputModeState.modeMenuFooterInputText.className =
      'x-lumno-search-input-mode__menu-footer-text';
    inputModeState.modeMenuFooterInputText.setAttribute(
      'data-search-input-mode-menu-footer-input-text',
      ''
    );
    modeMenuFooterShortcutHint = applyNoTranslate(doc.createElement('span'));
    modeMenuFooterShortcutHint.className =
      'x-lumno-search-input-mode__menu-footer-hint x-lumno-search-input-mode__menu-footer-hint--shortcut';
    modeMenuFooterShortcutHint.setAttribute(
      'data-search-input-mode-menu-footer-shortcut-hint',
      ''
    );
    inputModeState.modeMenuFooterKey = applyNoTranslate(doc.createElement('span'));
    inputModeState.modeMenuFooterKey.className = 'x-lumno-search-input-mode__menu-footer-key';
    inputModeState.modeMenuFooterKey.setAttribute(
      'data-search-input-mode-menu-footer-key',
      ''
    );
    inputModeState.modeMenuFooterText = applyNoTranslate(doc.createElement('span'));
    inputModeState.modeMenuFooterText.className = 'x-lumno-search-input-mode__menu-footer-text';
    inputModeState.modeMenuFooterText.setAttribute(
      'data-search-input-mode-menu-footer-text',
      ''
    );
    inputModeState.modeMenuFooter.appendChild(inputModeState.modeMenuFooterFilterText);
    modeMenuFooterNavigationHint.appendChild(inputModeState.modeMenuFooterNavigationKey);
    modeMenuFooterNavigationHint.appendChild(inputModeState.modeMenuFooterNavigationText);
    modeMenuFooterSelectHint.appendChild(inputModeState.modeMenuFooterSelectKey);
    modeMenuFooterSelectHint.appendChild(inputModeState.modeMenuFooterSelectText);
    modeMenuFooterInputHint.appendChild(inputModeState.modeMenuFooterInputKey);
    modeMenuFooterInputHint.appendChild(inputModeState.modeMenuFooterInputText);
    modeMenuFooterShortcutHint.appendChild(inputModeState.modeMenuFooterKey);
    modeMenuFooterShortcutHint.appendChild(inputModeState.modeMenuFooterText);
    modeMenuFooterActions.appendChild(modeMenuFooterNavigationHint);
    modeMenuFooterActions.appendChild(modeMenuFooterSelectHint);
    modeMenuFooterActions.appendChild(modeMenuFooterInputHint);
    modeMenuFooterActions.appendChild(modeMenuFooterShortcutHint);
    inputModeState.modeMenuFooter.appendChild(modeMenuFooterActions);
  }
  const legacyModeMenuFooterDivider = typeof inputModeState.modeMenuFooter.querySelector === 'function'
    ? inputModeState.modeMenuFooter.querySelector('.x-lumno-search-input-mode__menu-footer-divider')
    : null;
  if (legacyModeMenuFooterDivider) {
    legacyModeMenuFooterDivider.remove();
  }
  inputModeState.modeMenuFooter.appendChild(inputModeState.modeMenuFooterFilterText);
  modeMenuFooterNavigationHint.appendChild(inputModeState.modeMenuFooterNavigationKey);
  modeMenuFooterNavigationHint.appendChild(inputModeState.modeMenuFooterNavigationText);
  modeMenuFooterSelectHint.appendChild(inputModeState.modeMenuFooterSelectKey);
  modeMenuFooterSelectHint.appendChild(inputModeState.modeMenuFooterSelectText);
  modeMenuFooterInputHint.appendChild(inputModeState.modeMenuFooterInputKey);
  modeMenuFooterInputHint.appendChild(inputModeState.modeMenuFooterInputText);
  modeMenuFooterShortcutHint.appendChild(inputModeState.modeMenuFooterKey);
  modeMenuFooterShortcutHint.appendChild(inputModeState.modeMenuFooterText);
  modeMenuFooterActions.appendChild(modeMenuFooterNavigationHint);
  modeMenuFooterActions.appendChild(modeMenuFooterSelectHint);
  modeMenuFooterActions.appendChild(modeMenuFooterInputHint);
  modeMenuFooterActions.appendChild(modeMenuFooterShortcutHint);
  inputModeState.modeMenuFooter.appendChild(modeMenuFooterActions);

  return {};
}

export { createControllerDom };
