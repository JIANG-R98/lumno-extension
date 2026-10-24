// @ts-nocheck
// Slash commands for theme, zen mode and Firefox's website appearance, and
// the setters behind them.
function createModeCommands(deps) {
  const {
    t,
    formatMessage,
    updateInputRightPadding,
    getExtensionResourceUrl,
    renderSuggestions,
    applyNewtabTopContentVisibility,
    applyNewtabShortcutsVisibility,
    bookmarkSection,
    recentSection,
    isBookmarkTopbarMode,
    bookmarkCards,
    closeBookmarkCascadeMenu,
    closeShortcutContextMenu,
    closeRecentContextMenu,
    closeShortcutDialog,
    closeWallpaperPanel,
    closeFeedbackPopover,
    hideTopActionTooltip,
    hideShortcutTooltip,
    hideCursorTooltip,
    updateBookmarkSectionPosition,
    updateSearchEntryLayout,
    scheduleWallpaperAdaptiveToneUpdate,
    normalizeZenModeEnabled,
    storageArea,
    NEWTAB_ZEN_MODE_STORAGE_KEY,
    SETTINGS,
    THEME_STORAGE_KEY,
    applyScopedThemeMode,
    updateWallpaperLanguageStrings,
    normalizeThemeMode,
    NEWTAB_THEME_MODE_STORAGE_KEY,
    normalizeNewtabThemeMode,
    isNewtabThemeFollowingGlobal,
    normalizeNewtabThemeScope,
    NEWTAB_THEME_SCOPE_STORAGE_KEY
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;
  // Firefox's website appearance setting (the color scheme pages see), read
  // and switched through the background for the /appearance command.
  let webAppearanceState = { supported: false, mode: 'auto' };

  function getThemeModeLabel(mode) {
    if (mode === 'dark') {
      return t('theme_label_dark', '深色');
    }
    if (mode === 'light') {
      return t('theme_label_light', '浅色');
    }
    return t('theme_label_system', '跟随系统');
  }

  const commandDefinitions = [
    {
      type: 'commandNewTab',
      primary: '/new',
      aliases: ['/n', '/newtab', '/nt']
    },
    {
      type: 'commandSettings',
      primary: '/settings',
      aliases: ['/set', '/settings', '/s']
    },
    {
      type: 'modeSwitch',
      primary: '/mode',
      aliases: []
    },
    {
      type: 'zenSwitch',
      primary: '/zen',
      aliases: []
    },
    {
      type: 'webAppearanceSwitch',
      primary: '/appearance',
      aliases: [],
      requiresWebAppearance: true
    }
  ];

  function getCommandMatches(rawInput) {
    const input = String(rawInput || '').trim().toLowerCase();
    if (!input.startsWith('/')) {
      return [];
    }
    const matches = [];
    for (let i = 0; i < commandDefinitions.length; i += 1) {
      const command = commandDefinitions[i];
      // Only Firefox has a website appearance setting to switch.
      if (command.requiresWebAppearance && !webAppearanceState.supported) {
        continue;
      }
      const tokens = [command.primary].concat(command.aliases || []);
      for (let j = 0; j < tokens.length; j += 1) {
        const token = String(tokens[j] || '').trim().toLowerCase();
        if (token.startsWith(input)) {
          matches.push(command);
          break;
        }
      }
    }
    return matches;
  }

  function getCommandMatch(rawInput) {
    const matches = getCommandMatches(rawInput);
    return matches.length > 0
      ? {
          command: matches[0],
          completion: matches[0].primary
        }
      : null;
  }

  function buildCommandSuggestion(command) {
    if (command.type === 'modeSwitch') {
      return {
        ...buildModeSuggestion(),
        commandText: command.primary,
        commandAliases: command.aliases || []
      };
    }
    if (command.type === 'zenSwitch') {
      return {
        ...buildZenSuggestion(),
        commandText: command.primary,
        commandAliases: command.aliases || []
      };
    }
    if (command.type === 'webAppearanceSwitch') {
      return {
        ...buildWebAppearanceSuggestion(),
        commandText: command.primary,
        commandAliases: command.aliases || []
      };
    }
    let titleText = '';
    if (command.type === 'commandSettings') {
      titleText = formatMessage('command_settings', '打开设置', {
        name: 'Lumno'
      });
    } else {
      titleText = t('command_newtab', '新建标签页');
    }
    return {
      type: command.type,
      title: titleText,
      url: '',
      commandText: command.primary,
      commandAliases: command.aliases || []
    };
  }

  function updateModeBadge(rawValue) {
    if (!pageState.modeBadge) {
      return;
    }
    const zenCommandActive = isZenCommand(rawValue || '');
    const webAppearanceCommandActive = isWebAppearanceCommand(rawValue || '');
    const shouldShow = isModeCommand(rawValue || '') || zenCommandActive || webAppearanceCommandActive;
    if (!shouldShow) {
      pageState.modeBadge.setAttribute('data-visible', 'false');
      updateInputRightPadding();
      return;
    }
    if (webAppearanceCommandActive) {
      pageState.modeBadge.textContent = formatMessage('web_appearance_badge', '网站外观：{mode}', {
        mode: getWebAppearanceModeLabel(webAppearanceState.mode)
      });
    } else {
      pageState.modeBadge.textContent = zenCommandActive
        ? t(
          pageState.zenModeEnabled ? 'zen_badge_on' : 'zen_badge_off',
          pageState.zenModeEnabled ? 'Zen：已开启' : 'Zen：已关闭'
        )
        : formatMessage('mode_badge', '模式：{mode}', {
          mode: getThemeModeLabel(pageState.currentThemeMode)
        });
    }
    pageState.modeBadge.setAttribute('data-visible', 'true');
    updateInputRightPadding();
  }

  function getNextThemeMode(mode) {
    const order = ['system', 'light', 'dark'];
    const index = order.indexOf(mode);
    if (index === -1) {
      return 'light';
    }
    return order[(index + 1) % order.length];
  }

  function isModeCommand(input) {
    const raw = String(input || '').trim().toLowerCase();
    return raw === '/mode' || raw.startsWith('/mode ');
  }

  function isZenCommand(input) {
    const raw = String(input || '').trim().toLowerCase();
    return raw === '/zen' || raw.startsWith('/zen ');
  }

  function isSlashCommandInput(input) {
    const raw = String(input || '').trim();
    return raw.startsWith('/');
  }

  function isWebAppearanceCommand(input) {
    const raw = String(input || '').trim().toLowerCase();
    return webAppearanceState.supported &&
      (raw === '/appearance' || raw.startsWith('/appearance '));
  }

  function getWebAppearanceModeLabel(mode) {
    return mode === 'auto'
      ? t('web_appearance_label_auto', '自动')
      : getThemeModeLabel(mode);
  }

  function getNextWebAppearanceMode(mode) {
    const order = ['auto', 'light', 'dark'];
    return order[(order.indexOf(mode) + 1) % order.length];
  }

  function buildModeSuggestion() {
    const nextMode = getNextThemeMode(pageState.currentThemeMode);
    return {
      type: 'modeSwitch',
      title: formatMessage('mode_switch_title', `Lumno：切换到${getThemeModeLabel(nextMode)}模式`, {
        name: 'Lumno',
        mode: getThemeModeLabel(nextMode)
      }),
      url: '',
      favicon: getExtensionResourceUrl('assets/images/lumno.png'),
      commandText: '/mode',
      commandAliases: [],
      nextMode: nextMode
    };
  }

  function buildZenSuggestion() {
    return {
      type: 'zenSwitch',
      title: pageState.zenModeEnabled
        ? formatMessage('zen_disable_title', '{name}：退出 Zen 模式', { name: 'Lumno' })
        : formatMessage('zen_enable_title', '{name}：进入 Zen 模式', { name: 'Lumno' }),
      url: '',
      favicon: getExtensionResourceUrl('assets/images/lumno.png'),
      commandText: '/zen',
      commandAliases: [],
      nextEnabled: !pageState.zenModeEnabled
    };
  }

  function buildWebAppearanceSuggestion() {
    const nextMode = getNextWebAppearanceMode(webAppearanceState.mode);
    return {
      type: 'webAppearanceSwitch',
      title: formatMessage('web_appearance_switch_title', '网站外观：切换到{mode}', {
        mode: getWebAppearanceModeLabel(nextMode)
      }),
      url: '',
      commandText: '/appearance',
      commandAliases: [],
      nextMode: nextMode
    };
  }

  function refreshWebAppearanceCommand() {
    const rawValue = pageState.inputParts && pageState.inputParts.input
      ? (pageState.inputParts.input.value || '')
      : '';
    updateModeBadge(rawValue);
    if (isSlashCommandInput(rawValue)) {
      renderSuggestions([], rawValue.trim());
    }
  }

  function applyWebAppearanceState(response) {
    if (!response || response.supported === false || typeof response.mode !== 'string') {
      return;
    }
    webAppearanceState = { supported: true, mode: response.mode };
    refreshWebAppearanceCommand();
  }

  function loadWebAppearance() {
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      return;
    }
    chrome.runtime.sendMessage({ action: 'getWebAppearance' }, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
      applyWebAppearanceState(response);
    });
  }

  function setWebAppearanceMode(mode) {
    // Show the choice at once; the reply carries what Firefox kept.
    webAppearanceState = { ...webAppearanceState, mode };
    refreshWebAppearanceCommand();
    chrome.runtime.sendMessage({ action: 'setWebAppearance', mode }, (response) => {
      if (!chrome.runtime.lastError && response && typeof response.mode === 'string') {
        applyWebAppearanceState(response);
        return;
      }
      loadWebAppearance();
    });
  }

  function updateModeCommandSuggestions() {
    if (isModeCommand(pageState.inputParts && pageState.inputParts.input ? pageState.inputParts.input.value : '')) {
      renderSuggestions([], (pageState.inputParts.input.value || '').trim());
    }
  }

  function updateZenCommandSuggestions() {
    if (isZenCommand(pageState.inputParts && pageState.inputParts.input ? pageState.inputParts.input.value : '')) {
      renderSuggestions([], (pageState.inputParts.input.value || '').trim());
    }
  }

  function syncSectionZenVisibility(section) {
    if (!section) {
      return;
    }
    let configuredVisible = section.getAttribute('data-content-visible');
    if (configuredVisible !== 'true' && configuredVisible !== 'false') {
      configuredVisible = section.getAttribute('data-visible') === 'true' ? 'true' : 'false';
      section.setAttribute('data-content-visible', configuredVisible);
    }
    section.setAttribute(
      'data-visible',
      configuredVisible === 'true' && !pageState.zenModeEnabled ? 'true' : 'false'
    );
  }

  function applyZenMode() {
    if (document.body) {
      document.body.setAttribute('data-zen-mode', pageState.zenModeEnabled ? 'true' : 'false');
    }
    applyNewtabTopContentVisibility();
    applyNewtabShortcutsVisibility();
    syncSectionZenVisibility(bookmarkSection);
    syncSectionZenVisibility(recentSection);
    if (pageState.bookmarkTopbarRuntime && isBookmarkTopbarMode()) {
      pageState.bookmarkTopbarRuntime.setVisible(
        !pageState.zenModeEnabled && bookmarkCards.length > 0 && pageState.currentBookmarkCount > 0
      );
    }
    if (pageState.zenModeEnabled) {
      closeBookmarkCascadeMenu();
      closeShortcutContextMenu();
      closeRecentContextMenu();
      closeShortcutDialog();
      closeWallpaperPanel();
      closeFeedbackPopover();
      hideTopActionTooltip();
      hideShortcutTooltip();
      hideCursorTooltip();
    }
    updateBookmarkSectionPosition();
    updateSearchEntryLayout();
    scheduleWallpaperAdaptiveToneUpdate();
    updateModeBadge(pageState.inputParts && pageState.inputParts.input ? pageState.inputParts.input.value : '');
  }

  function setZenModeEnabled(enabled) {
    const nextEnabled = normalizeZenModeEnabled(enabled);
    pageState.zenModeEnabled = nextEnabled;
    if (!storageArea) {
      applyZenMode();
      updateZenCommandSuggestions();
      return;
    }
    storageArea.set({ [NEWTAB_ZEN_MODE_STORAGE_KEY]: nextEnabled }, () => {
      applyZenMode();
      updateZenCommandSuggestions();
    });
  }

  function loadZenMode() {
    if (!storageArea) {
      pageState.zenModeEnabled = false;
      applyZenMode();
      return Promise.resolve(pageState.zenModeEnabled);
    }
    return new Promise((resolve) => {
      storageArea.get([NEWTAB_ZEN_MODE_STORAGE_KEY], (result) => {
        pageState.zenModeEnabled = normalizeZenModeEnabled(result && result[NEWTAB_ZEN_MODE_STORAGE_KEY]);
        applyZenMode();
        resolve(pageState.zenModeEnabled);
      });
    });
  }

  function getThemeScope() {
    return pageState.newtabThemeScope;
  }

  function getGlobalThemeStorageUpdate(mode) {
    return SETTINGS.createGlobalThemeModeStorageUpdate(mode);
  }

  function setGlobalThemeMode(mode) {
    const updates = getGlobalThemeStorageUpdate(mode);
    pageState.globalThemeMode = updates[THEME_STORAGE_KEY];
    if (!storageArea) {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    storageArea.set(updates, () => {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  function setThemeMode(mode) {
    const nextMode = normalizeThemeMode(mode);
    const isEditingNewtabTheme = pageState.newtabThemeScope === 'home';
    const targetKey = isEditingNewtabTheme
      ? NEWTAB_THEME_MODE_STORAGE_KEY
      : THEME_STORAGE_KEY;
    const nextStoredMode = isEditingNewtabTheme && nextMode === 'system'
      ? 'global'
      : nextMode;
    if (!isEditingNewtabTheme) {
      setGlobalThemeMode(nextMode);
      return;
    }
    pageState.newtabThemeMode = normalizeNewtabThemeMode(nextStoredMode);
    if (!storageArea) {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    storageArea.set({ [targetKey]: nextStoredMode }, () => {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  function setVisibleThemeMode(mode) {
    const nextMode = normalizeThemeMode(mode);
    if (isNewtabThemeFollowingGlobal()) {
      setGlobalThemeMode(nextMode);
      return;
    }
    const nextStoredMode = nextMode === 'system' ? 'global' : nextMode;
    pageState.newtabThemeMode = normalizeNewtabThemeMode(nextStoredMode);
    if (!storageArea) {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    storageArea.set({ [NEWTAB_THEME_MODE_STORAGE_KEY]: nextStoredMode }, () => {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  function setThemeScope(scope) {
    const nextScope = normalizeNewtabThemeScope(scope);
    const updates = { [NEWTAB_THEME_SCOPE_STORAGE_KEY]: nextScope };
    pageState.newtabThemeScope = nextScope;
    if (!storageArea) {
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    storageArea.set(updates, () => {
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  return {
    getCommandMatches,
    getCommandMatch,
    buildCommandSuggestion,
    updateModeBadge,
    getNextThemeMode,
    isModeCommand,
    isZenCommand,
    isSlashCommandInput,
    buildModeSuggestion,
    buildZenSuggestion,
    loadWebAppearance,
    setWebAppearanceMode,
    updateModeCommandSuggestions,
    updateZenCommandSuggestions,
    applyZenMode,
    setZenModeEnabled,
    loadZenMode,
    getThemeScope,
    setThemeMode,
    setVisibleThemeMode,
    setThemeScope
  };
}

export { createModeCommands };
