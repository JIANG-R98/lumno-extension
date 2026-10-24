// @ts-nocheck
// Settings navigation: the tab list, the active tab, the sticky header,
// scroll and resize refreshes, and scrolling to a linked setting.
function createNavigation(deps) {
  const {
    getMessage,
    SETTINGS_TAB_KEYS,
    tabContents,
    syncFallbackShortcutWrapWidth,
    updateFallbackShortcutWrapWidthForContent,
    refreshSiteSearchProviders,
    tabsRow,
    siteSearchAiGroup,
    siteSearchAiBuiltinList
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  const OPTIONS_TARGET_SITE_SEARCH_AI = 'site-search-ai';
  const OPTIONS_TARGET_DOCUMENT_PIP = 'document-pip';

  function getSettingsNavigationItems() {
    return [
      {
        key: 'general',
        labelKey: 'settings_tab_general',
        label: getMessage('settings_tab_general', '常规'),
        iconClass: 'ri-icon ri-command-fill'
      },
      {
        key: 'account',
        labelKey: 'settings_tab_account',
        label: getMessage('settings_tab_account', '账号与同步'),
        iconClass: 'ri-icon ri-user-3-line'
      },
      {
        key: 'appearance',
        labelKey: 'settings_tab_appearance',
        label: getMessage('settings_tab_appearance', '外观'),
        iconClass: 'ri-icon ri-moon-clear-fill'
      },
      {
        key: 'shortcuts',
        labelKey: 'settings_tab_shortcuts',
        label: getMessage('settings_tab_shortcuts', '搜索源'),
        iconClass: 'ri-icon ri-search-line'
      },
      {
        key: 'blacklist',
        labelKey: 'settings_tab_blacklist',
        label: getMessage('settings_tab_blacklist', '黑名单'),
        iconClass: 'ri-icon ri-forbid-2-fill'
      },
      {
        key: 'labs',
        labelKey: 'settings_tab_labs',
        label: getMessage('settings_tab_labs', '实验室功能'),
        iconClass: 'ri-icon ri-test-tube-fill'
      }
    ];
  }

  function renderSettingsNavigation(tabKey) {
    optionsState.settingsNavigationController.render({
      activeKey: tabKey,
      items: getSettingsNavigationItems()
    });
  }

  function normalizeSettingsTabKey(tabKey) {
    return SETTINGS_TAB_KEYS.includes(tabKey) ? tabKey : 'general';
  }

  function setActiveTab(tabKey) {
    const nextTabKey = normalizeSettingsTabKey(tabKey);
    optionsState.panelHeightAnimator.cancel();
    optionsState.currentActiveSettingsTab = nextTabKey;
    renderSettingsNavigation(nextTabKey);
    tabContents.forEach((content) => {
      const isActive = content.getAttribute('data-content') === nextTabKey;
      content.setAttribute('data-active', isActive ? 'true' : 'false');
    });
    if (nextTabKey === 'general') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncFallbackShortcutWrapWidth();
          updateFallbackShortcutWrapWidthForContent();
        });
      });
    }
    if (nextTabKey) {
      const nextHash = `#${nextTabKey}`;
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
    }
  }

  function handleSettingsTabSelection(value) {
    const tabKey = normalizeSettingsTabKey(value);
    const currentTabKey = optionsState.currentActiveSettingsTab;
    setActiveTab(tabKey);
    if (tabKey !== currentTabKey) {
      resetPageScrollToDefault();
    }
    if (tabKey === 'shortcuts') {
      refreshSiteSearchProviders();
    }
  }

  function updateTabsStickyVisualState() {
    if (!tabsRow) return;
    const stickyTop = parseFloat(window.getComputedStyle(tabsRow).top || '0') || 0;
    const isStuck = tabsRow.getBoundingClientRect().top <= stickyTop + 0.5;
    tabsRow.setAttribute('data-stuck', isStuck ? 'true' : 'false');
  }

  let optionsScrollFrame = 0;
  let optionsResizeFrame = 0;
  function scheduleOptionsScrollRefresh() {
    if (optionsScrollFrame) {
      return;
    }
    optionsScrollFrame = window.requestAnimationFrame(() => {
      optionsScrollFrame = 0;
      updateTabsStickyVisualState();
    });
  }

  function scheduleOptionsViewportLayoutRefresh() {
    if (optionsResizeFrame) {
      return;
    }
    optionsResizeFrame = window.requestAnimationFrame(() => {
      optionsResizeFrame = 0;
      updateTabsStickyVisualState();
      syncFallbackShortcutWrapWidth();
    });
  }

  function resetPageScrollToDefault() {
    window.scrollTo({ top: 0, behavior: 'auto' });
    updateTabsStickyVisualState();
  }

  function getOptionsRouteState() {
    const rawHash = window.location.hash.replace('#', '').trim();
    if (!rawHash) {
      return {
        tabKey: '',
        targetKey: ''
      };
    }
    const parts = rawHash.split(':').map((part) => String(part || '').trim()).filter(Boolean);
    return {
      tabKey: parts[0] || '',
      targetKey: parts.slice(1).join(':')
    };
  }

  function getOptionsTargetElement(targetKey) {
    if (targetKey === OPTIONS_TARGET_DOCUMENT_PIP) {
      return document.getElementById('_x_extension_document_pip_row_2026_unique_');
    }
    if (targetKey !== OPTIONS_TARGET_SITE_SEARCH_AI) {
      return null;
    }
    return siteSearchAiGroup || (siteSearchAiBuiltinList
      ? siteSearchAiBuiltinList.closest('._x_extension_shortcut_group_2024_unique_')
      : null);
  }

  function scrollToOptionsTarget(targetKey, options) {
    const target = getOptionsTargetElement(targetKey);
    if (!target || typeof target.scrollIntoView !== 'function') {
      return false;
    }
    const behavior = options && options.behavior ? options.behavior : 'smooth';
    const block = options && options.block ? options.block : 'start';
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior, block });
      updateTabsStickyVisualState();
      if (options && options.flash) {
        flashOptionsTarget(target);
      }
    });
    return true;
  }

  // Points the eye at the row a deep link opened, e.g. the web clip switch
  // that the toolbar button leads to while web clip is off.
  function flashOptionsTarget(target) {
    target.removeAttribute('data-flash');
    void target.offsetWidth;
    target.setAttribute('data-flash', 'true');
    const onFlashEnd = () => {
      target.removeAttribute('data-flash');
      target.removeEventListener('animationend', onFlashEnd);
    };
    target.addEventListener('animationend', onFlashEnd);
  }

  return {
    renderSettingsNavigation,
    setActiveTab,
    handleSettingsTabSelection,
    updateTabsStickyVisualState,
    scheduleOptionsScrollRefresh,
    scheduleOptionsViewportLayoutRefresh,
    getOptionsRouteState,
    scrollToOptionsTarget
  };
}

export { createNavigation };
