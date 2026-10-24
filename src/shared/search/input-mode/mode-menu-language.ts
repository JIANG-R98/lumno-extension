// @ts-nocheck
// The mode menu's copy: the filter query line and the footer hints in the
// current language, and the site search Tab hint element.
function createModeMenuLanguage(deps) {
  const {
    formatMessage,
    doc,
    shortcutDisplayApi,
    config,
    win,
    syncInputPlaceholder,
    siteSearchTabHint,
    tabHintId,
    siteSearchTabHintKey,
    siteSearchTabHintText,
    cssText,
    rightAnchorOffset,
    vars,
    INPUT_FONT_STACK,
    useImportantStyles
  } = deps;

  // The controller state object shared with search-input-mode.js and the other modules.
  const inputModeState = deps.inputModeState;

  function renderModeMenuFilterQuery(query) {
    const queryToken = '\uF8FFLUMNO_MODE_MENU_QUERY\uF8FF';
    const localizedQuery = formatMessage(
      'search_scope_menu_filter_query',
      'Search: {query}',
      { query: queryToken }
    );
    const queryIndex = localizedQuery.indexOf(queryToken);
    if (queryIndex < 0) {
      inputModeState.modeMenuFooterFilterText.textContent = formatMessage(
        'search_scope_menu_filter_query',
        'Search: {query}',
        { query }
      );
      return;
    }
    while (inputModeState.modeMenuFooterFilterText.firstChild) {
      inputModeState.modeMenuFooterFilterText.removeChild(inputModeState.modeMenuFooterFilterText.firstChild);
    }
    if (queryIndex > 0) {
      inputModeState.modeMenuFooterFilterText.appendChild(
        doc.createTextNode(localizedQuery.slice(0, queryIndex))
      );
    }
    const queryMark = doc.createElement('mark');
    queryMark.className = 'x-lumno-search-input-mode__menu-match';
    queryMark.textContent = query;
    inputModeState.modeMenuFooterFilterText.appendChild(queryMark);
    const queryEnd = queryIndex + queryToken.length;
    if (queryEnd < localizedQuery.length) {
      inputModeState.modeMenuFooterFilterText.appendChild(
        doc.createTextNode(localizedQuery.slice(queryEnd))
      );
    }
  }
  function refreshModeMenuFilterText() {
    if (inputModeState.modeMenuFilterQuery) {
      renderModeMenuFilterQuery(inputModeState.modeMenuFilterQuery);
    } else {
      inputModeState.modeMenuFooterFilterText.textContent = formatMessage(
        'search_scope_menu_filter_hint',
        'Type to filter'
      );
    }
  }
  function refreshModeMenuLanguage() {
    inputModeState.modeMenuFooterNavigationKey.textContent = '\u2190\u2191\u2193\u2192';
    inputModeState.modeMenuFooterNavigationText.textContent = formatMessage(
      'search_scope_menu_navigation_hint',
      'Move'
    );
    inputModeState.modeMenuFooterSelectKey.textContent = 'Enter';
    inputModeState.modeMenuFooterSelectText.textContent = formatMessage(
      'search_scope_menu_select_hint',
      'Switch'
    );
    inputModeState.modeMenuFooterInputKey.textContent = 'Tab';
    inputModeState.modeMenuFooterInputText.textContent = formatMessage(
      'search_scope_menu_focus_toggle_hint',
      'Switch focus'
    );
    inputModeState.modeMenuFooterKey.textContent =
      typeof shortcutDisplayApi.formatShortcutReference === 'function'
        ? shortcutDisplayApi.formatShortcutReference('Tab Tab', {
          navigatorLike: config.navigatorLike || (win && win.navigator)
        })
        : 'Tab Tab';
    inputModeState.modeMenuFooterText.textContent = formatMessage(
      'search_scope_menu_shortcut_hint',
      'Open panel'
    );
    refreshModeMenuFilterText();
    syncInputPlaceholder();
  }
  refreshModeMenuLanguage();
  siteSearchTabHint.id = tabHintId;
  siteSearchTabHint.className = 'x-lumno-search-input-mode__tab-hint';
  siteSearchTabHint.setAttribute('aria-hidden', 'true');
  siteSearchTabHintKey.textContent = '';
  siteSearchTabHintText.textContent = '';
  siteSearchTabHint.style.cssText = cssText([
    ['all', 'unset'],
    ['position', 'absolute'],
    ['right', `${rightAnchorOffset}px`],
    ['top', '50%'],
    ['transform', 'translateY(-50%)'],
    ['display', 'none'],
    ['align-items', 'center'],
    ['justify-content', 'center'],
    ['gap', '7px'],
    ['max-width', 'min(300px, 52%)'],
    ['min-width', '0'],
    ['height', '28px'],
    ['padding', '0'],
    ['border', 'none'],
    ['background', 'transparent'],
    ['color', vars.tagText],
    ['box-sizing', 'border-box'],
    ['font-size', '13px'],
    ['font-family', INPUT_FONT_STACK],
    ['font-weight', '700'],
    ['line-height', '18px'],
    ['letter-spacing', '0'],
    ['white-space', 'nowrap'],
    ['pointer-events', 'none'],
    ['user-select', 'none'],
    ['z-index', '1']
  ], useImportantStyles);

  return {
    refreshModeMenuFilterText,
    refreshModeMenuLanguage
  };
}

export { createModeMenuLanguage };
