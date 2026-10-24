// Slash commands in the overlay: their definitions, matching what is
// typed, the suggestion each builds, the theme mode command and the website
// appearance command.
import * as LumnoMessaging from '../../platform/messaging';
function createSlashCommands(deps) {
  const {
    t,
    formatMessage,
    updateInputRightPadding,
    detectPageTheme,
    SETTINGS,
    storageArea,
    applyOverlayTheme,
    THEME_STORAGE_KEY,
    updateSearchSuggestions
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;
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
      type: 'webAppearanceSwitch',
      primary: '/appearance',
      aliases: [],
      requiresWebAppearance: true
    },
    {
      type: 'commandOpenTabs',
      primary: '/tabs',
      aliases: ['/tab', '/t']
    },
    {
      type: 'commandCopyUrl',
      primary: '/copy',
      aliases: ['/c']
    },
    {
      type: 'commandDocumentPip',
      // legacy primary: 'clip'
      primary: '/clip',
      aliases: [],
      legacyExactAliases: ['clip', 'webclip', 'web clip'],
      requiresDocumentPipEnabled: true
    }
  ];

  function getCommandMatches(rawInput) {
    const input = String(rawInput || '').trim().toLowerCase();
    const matches = [];
    for (let i = 0; i < commandDefinitions.length; i += 1) {
      const command = commandDefinitions[i];
      // The setting may sync from a browser that has Document PiP (Firefox has none).
      if (command.requiresDocumentPipEnabled && !overlayState.documentPipEnabled) {
        continue;
      }
      // Only Firefox has a website appearance setting to switch.
      if (command.requiresWebAppearance && !webAppearanceState.supported) {
        continue;
      }
      const tokens = [command.primary].concat(command.aliases || []);
      if (command.legacyExactAliases) {
        if (command.legacyExactAliases.includes(input)) {
          matches.push(command);
        }
        if (!input.startsWith('/')) {
          continue;
        }
      }
      if (!input.startsWith('/')) {
        continue;
      }
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

  function isSlashCommandInput(input) {
    return String(input || '').trim().startsWith('/');
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
    } else if (command.type === 'commandOpenTabs') {
      titleText = t('command_tabs_title', '仅搜索已打开的标签页');
    } else if (command.type === 'commandCopyUrl') {
      titleText = t('command_copy_title', '复制当前页面链接');
    } else if (command.type === 'commandDocumentPip') {
      titleText = t('document_pip_command_title', '开启网页剪裁');
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
    if (!overlayState.modeBadge) {
      return;
    }
    const webAppearanceCommandActive = isWebAppearanceCommand(rawValue || '');
    const shouldShow = isModeCommand(rawValue || '') || webAppearanceCommandActive;
    if (!shouldShow) {
      overlayState.modeBadge.setAttribute('data-visible', 'false');
      updateInputRightPadding();
      return;
    }
    if (webAppearanceCommandActive) {
      overlayState.modeBadge.textContent = formatMessage('web_appearance_badge', '网站外观：{mode}', {
        mode: getWebAppearanceModeLabel(webAppearanceState.mode)
      });
    } else if (overlayState.overlayThemeMode === 'system') {
      const pageTheme = detectPageTheme();
      if (pageTheme) {
        overlayState.modeBadge.textContent = formatMessage('mode_badge_follow_site', '模式：{mode}（跟随网站）', {
          mode: getThemeModeLabel(pageTheme)
        });
      } else {
        const systemResolved = overlayState.overlayMediaQuery.matches ? 'dark' : 'light';
        overlayState.modeBadge.textContent = formatMessage('mode_badge_follow_system', '模式：{mode}（跟随系统）', {
          mode: getThemeModeLabel(systemResolved)
        });
      }
    } else {
      overlayState.modeBadge.textContent = formatMessage('mode_badge', '模式：{mode}', {
        mode: getThemeModeLabel(overlayState.overlayThemeMode)
      });
    }
    overlayState.modeBadge.setAttribute('data-visible', 'true');
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

  function buildModeSuggestion() {
    const nextMode = getNextThemeMode(overlayState.overlayThemeMode || 'system');
    return {
      type: 'modeSwitch',
      title: formatMessage('mode_switch_title', `Lumno：切换到${getThemeModeLabel(nextMode)}模式`, {
        name: 'Lumno',
        mode: getThemeModeLabel(nextMode)
      }),
      url: '',
      favicon: chrome.runtime.getURL('assets/images/lumno.png'),
      commandText: '/mode',
      commandAliases: [],
      nextMode: nextMode
    };
  }

  function getThemeStorageUpdate(mode) {
    return SETTINGS.createGlobalThemeModeStorageUpdate(mode);
  }

  function applyThemeModeChange(mode) {
    const updates = getThemeStorageUpdate(mode);
    if (storageArea) {
      storageArea.set(updates);
    }
    applyOverlayTheme(updates[THEME_STORAGE_KEY]);
    if (isModeCommand(overlayState.searchInput.value || '')) {
      updateSearchSuggestions([], (overlayState.searchInput.value || '').trim());
    }
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

  function isWebAppearanceCommand(input) {
    const raw = String(input || '').trim().toLowerCase();
    return webAppearanceState.supported &&
      (raw === '/appearance' || raw.startsWith('/appearance '));
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
    const rawValue = overlayState.searchInput ? (overlayState.searchInput.value || '') : '';
    updateModeBadge(rawValue);
    if (isSlashCommandInput(rawValue)) {
      updateSearchSuggestions([], rawValue.trim());
    }
  }

  function applyWebAppearanceState(response) {
    if (!response || response.supported === false || typeof response.mode !== 'string') {
      return;
    }
    webAppearanceState = { supported: true, mode: response.mode };
    refreshWebAppearanceCommand();
  }

  function loadWebAppearanceState() {
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      return;
    }
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'getWebAppearance' }, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
      applyWebAppearanceState(response);
    });
  }

  function applyWebAppearanceMode(mode) {
    // Show the choice at once; the reply carries what Firefox kept.
    webAppearanceState = { ...webAppearanceState, mode };
    refreshWebAppearanceCommand();
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'setWebAppearance', mode }, (response) => {
      if (!chrome.runtime.lastError && response && typeof response.mode === 'string') {
        applyWebAppearanceState(response);
        return;
      }
      loadWebAppearanceState();
    });
  }

  function applyNextWebAppearanceMode() {
    applyWebAppearanceMode(getNextWebAppearanceMode(webAppearanceState.mode));
  }

  loadWebAppearanceState();

  return {
    getCommandMatches,
    isSlashCommandInput,
    getCommandMatch,
    buildCommandSuggestion,
    updateModeBadge,
    getNextThemeMode,
    isModeCommand,
    buildModeSuggestion,
    applyThemeModeChange,
    applyWebAppearanceMode,
    applyNextWebAppearanceMode
  };
}

export { createSlashCommands };
