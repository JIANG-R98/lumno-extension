(function(root) {
  // The controls inside the search box: the settings menu button, the clear
  // button, close other tabs, the input's right padding, and which action
  // buttons the page shows.
  function createSearchBoxControls(deps) {
    const {
      SEARCH_UTILS,
      dismissHelpCenterAskHint,
      rightIcon,
      formatMessage,
      onLanguageChange,
      bindSearchInputCursorTooltip,
      hideSearchInputCursorTooltip,
      dismissWebdavFeatureHint,
      EXTENSION_ROUTES,
      getExtensionResourceUrl,
      FEATURE_HINTS,
      helpCenterAskHintSettled,
      t,
      getRiSvg,
      getOpenDisposition,
      searchInput,
      closeFeedbackPopover,
      closeWallpaperPanel,
      storageArea,
      NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
      NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
      normalizeNewtabFeedbackButtonVisible,
      normalizeNewtabAppearanceButtonVisible
    } = deps;

    // The page state object shared with newtab.js and the other modules.
    const pageState = deps.pageState;

    pageState.inputParts.input.addEventListener('input', function() {
      // Typing a question in the Help Center search means the tip has done its job.
      if (pageState.siteSearchState && SEARCH_UTILS.isHelpCenterSiteSearchProvider(pageState.siteSearchState)) {
        dismissHelpCenterAskHint();
      }
    });

    pageState.inputParts.input.addEventListener('input', function() {
      if (!String(pageState.inputParts.input.value || '').trim() ||
          !pageState.engagementNoticeController ||
          typeof pageState.engagementNoticeController.recordMeaningfulUse !== 'function') {
        return;
      }
      pageState.engagementNoticeController.recordMeaningfulUse();
    });

    if (rightIcon) {
      const settingsTooltipText = () => formatMessage(
        'command_settings',
        '打开设置',
        { name: 'Lumno' }
      );
      const applySettingsTooltip = () => {
        rightIcon.setAttribute('aria-label', settingsTooltipText());
        rightIcon.setAttribute('data-tooltip', settingsTooltipText());
      };
      applySettingsTooltip();
      onLanguageChange(applySettingsTooltip);
      bindSearchInputCursorTooltip(rightIcon, settingsTooltipText);
      rightIcon.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        hideSearchInputCursorTooltip();
        dismissWebdavFeatureHint();
        const runtime = typeof chrome !== 'undefined' && chrome && chrome.runtime
          ? chrome.runtime
          : null;
        if (runtime && typeof runtime.openOptionsPage === 'function') {
          runtime.openOptionsPage();
          return;
        }
        const optionsUrl = runtime &&
            typeof runtime.getURL === 'function'
          ? EXTENSION_ROUTES.buildOptionsUrl(chrome)
          : getExtensionResourceUrl('src/options/options.html');
        window.open(optionsUrl, '_blank');
      });
      // Above the settings icon, point to WebDAV sync under Account & sync until it is dismissed.
      // It shares the space above the input with the Help Center tip, so it waits its turn.
      if (typeof FEATURE_HINTS.createFeatureHint === 'function' &&
          document.documentElement.getAttribute('data-nt-focus-route-pending') !== 'true') {
        pageState.webdavFeatureHintController = FEATURE_HINTS.createFeatureHint({
          documentObj: document,
          windowObj: window,
          chromeApi: chrome,
          definition: 'newtab-webdav-sync',
          visibilityGate: helpCenterAskHintSettled,
          initiallyVisible: false,
          t,
          getRiSvg,
          onLinkClick(event) {
            dismissWebdavFeatureHint();
            chrome.runtime.sendMessage({
              action: 'openOptionsPage',
              hash: 'account',
              disposition: getOpenDisposition(event, 'newTab')
            });
          }
        });
        if (pageState.webdavFeatureHintController && pageState.webdavFeatureHintController.element) {
          pageState.inputParts.container.appendChild(pageState.webdavFeatureHintController.element);
          helpCenterAskHintSettled.then((helpTipShowing) => {
            if (!helpTipShowing && pageState.webdavFeatureHintController) {
              pageState.webdavFeatureHintController.setVisible(true);
            }
          });
        }
      }
    }

    const searchClearButton = pageState.inputParts.clearAction;
    // Width the clear button adds left of the close-other-tabs button: 30px button + 6px gap.
    const SEARCH_CLEAR_BUTTON_INSET = 36;
    if (searchClearButton) {
      const searchClearTooltipText = () => t('search_input_clear', '清空');
      const applySearchClearTooltip = () => {
        searchClearButton.setAttribute('aria-label', searchClearTooltipText());
        searchClearButton.setAttribute('data-tooltip', searchClearTooltipText());
      };
      applySearchClearTooltip();
      onLanguageChange(applySearchClearTooltip);
      bindSearchInputCursorTooltip(searchClearButton, searchClearTooltipText);
      searchClearButton.addEventListener('click', hideSearchInputCursorTooltip);
      searchInput.addEventListener('input', updateInputRightPadding);
    }

    const closeOtherTabsButton = pageState.inputParts.secondaryAction;
    if (closeOtherTabsButton) {
      const closeOtherTabsTooltipText = () => t('overlay_close_other_tabs_tooltip', '关闭其他标签页');
      const applyCloseOtherTabsTooltip = () => {
        closeOtherTabsButton.setAttribute('aria-label', closeOtherTabsTooltipText());
        closeOtherTabsButton.setAttribute('data-tooltip', closeOtherTabsTooltipText());
      };
      const resetCloseOtherTabsButtonVisualState = () => {
        closeOtherTabsButton.removeAttribute('data-hover-active');
      };
      applyCloseOtherTabsTooltip();
      onLanguageChange(applyCloseOtherTabsTooltip);
      bindSearchInputCursorTooltip(closeOtherTabsButton, closeOtherTabsTooltipText);
      closeOtherTabsButton.addEventListener('mouseenter', () => {
        closeOtherTabsButton.setAttribute('data-hover-active', 'true');
      });
      closeOtherTabsButton.addEventListener('mouseleave', resetCloseOtherTabsButtonVisualState);
      closeOtherTabsButton.addEventListener('blur', resetCloseOtherTabsButtonVisualState);
      closeOtherTabsButton.addEventListener('pointerup', resetCloseOtherTabsButtonVisualState);
      closeOtherTabsButton.addEventListener('pointercancel', resetCloseOtherTabsButtonVisualState);
      // The click opens the popconfirm; closeOtherTabs runs once it is confirmed.
      closeOtherTabsButton.addEventListener('click', hideSearchInputCursorTooltip);
    }

    function updateInputRightPadding() {
      if (pageState.inputModeController) {
        pageState.inputModeController.updateLayout();
      }
    }

    function setNewtabActionControlVisibility(element, visible) {
      if (!element) {
        return;
      }
      const nextVisible = visible !== false;
      element.hidden = !nextVisible;
      element.style.setProperty('display', nextVisible ? '' : 'none');
      element.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
      element.inert = !nextVisible;
      if (nextVisible) {
        element.removeAttribute('inert');
      } else {
        element.setAttribute('inert', '');
      }
    }

    function applyNewtabActionButtonVisibility() {
      if (!pageState.newtabFeedbackButtonVisible && pageState.feedbackReactController) {
        closeFeedbackPopover();
      }
      if (!pageState.newtabAppearanceButtonVisible && pageState.wallpaperRuntime) {
        closeWallpaperPanel();
      }
      setNewtabActionControlVisibility(pageState.feedbackControl, pageState.newtabFeedbackButtonVisible);
      setNewtabActionControlVisibility(pageState.wallpaperControl, pageState.newtabAppearanceButtonVisible);
    }

    function loadNewtabActionButtonVisibility() {
      if (!storageArea) {
        pageState.newtabFeedbackButtonVisible = true;
        pageState.newtabAppearanceButtonVisible = true;
        applyNewtabActionButtonVisibility();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        storageArea.get([
          NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
          NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY
        ], (result) => {
          const stored = result || {};
          const rawFeedback = stored[NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY];
          const rawAppearance = stored[NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY];
          pageState.newtabFeedbackButtonVisible = normalizeNewtabFeedbackButtonVisible(rawFeedback);
          pageState.newtabAppearanceButtonVisible = normalizeNewtabAppearanceButtonVisible(rawAppearance);
          const repairs = {};
          if (rawFeedback !== pageState.newtabFeedbackButtonVisible) {
            repairs[NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY] = pageState.newtabFeedbackButtonVisible;
          }
          if (rawAppearance !== pageState.newtabAppearanceButtonVisible) {
            repairs[NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY] = pageState.newtabAppearanceButtonVisible;
          }
          applyNewtabActionButtonVisibility();
          if (Object.keys(repairs).length > 0) {
            storageArea.set(repairs);
          }
          resolve();
        });
      });
    }

    return {
      SEARCH_CLEAR_BUTTON_INSET,
      updateInputRightPadding,
      applyNewtabActionButtonVisibility,
      loadNewtabActionButtonVisibility
    };
  }

  root.LumnoNewtabSearchBoxControls = { createSearchBoxControls };
})(globalThis);
