// Slash commands for theme, zen mode and Firefox's website appearance, and
// the setters behind them.
import type { WebAppearanceMode } from '../domain/messages';
import type * as LumnoSettings from '../domain/settings';
import type { ThemeMode } from '../domain/settings';
import type { StorageAreaLike } from '../domain/storage-port';
import * as LumnoMessaging from '../platform/messaging';
import type { Suggestion } from '../shared/react/search/suggestion-list/types';
import type { FormatMessage, NewtabThemeMode, NewtabThemeScope, Translate } from './newtab-types';
import type { RenderSuggestions, SlashCommand } from './search/search-types';

interface ModeCommandsState {
  modeBadge: HTMLElement | null;
  zenModeEnabled: boolean;
  currentThemeMode: ThemeMode;
  inputParts: { input: HTMLInputElement } | null;
  bookmarkTopbarRuntime: { setVisible(visible: boolean): void } | null;
  currentBookmarkCount: number;
  newtabThemeScope: NewtabThemeScope;
  globalThemeMode: ThemeMode;
  newtabThemeMode: NewtabThemeMode;
}

interface ModeCommandsDeps {
  t: Translate;
  formatMessage: FormatMessage;
  updateInputRightPadding(): void;
  getExtensionResourceUrl(path: string): string;
  renderSuggestions: RenderSuggestions;
  applyNewtabTopContentVisibility(): void;
  applyNewtabShortcutsVisibility(): void;
  bookmarkSection: HTMLElement | null;
  recentSection: HTMLElement | null;
  isBookmarkTopbarMode(): boolean;
  bookmarkCards: readonly HTMLElement[];
  closeBookmarkCascadeMenu(): void;
  closeShortcutContextMenu(): void;
  closeRecentContextMenu(): void;
  closeShortcutDialog(): void;
  closeWallpaperPanel(): void;
  closeFeedbackPopover(): void;
  hideTopActionTooltip(): void;
  hideShortcutTooltip(): void;
  hideCursorTooltip(): void;
  updateBookmarkSectionPosition(): void;
  updateSearchEntryLayout(): void;
  scheduleWallpaperAdaptiveToneUpdate(): void;
  normalizeZenModeEnabled(value: unknown): boolean;
  storageArea: Pick<StorageAreaLike, 'get' | 'set'> | null;
  NEWTAB_ZEN_MODE_STORAGE_KEY: string;
  SETTINGS: Pick<typeof LumnoSettings, 'createGlobalThemeModeStorageUpdate'>;
  THEME_STORAGE_KEY: string;
  applyScopedThemeMode(): void;
  updateWallpaperLanguageStrings(): void;
  normalizeThemeMode(value: unknown): ThemeMode;
  NEWTAB_THEME_MODE_STORAGE_KEY: string;
  normalizeNewtabThemeMode(value: unknown): NewtabThemeMode;
  isNewtabThemeFollowingGlobal(): boolean;
  normalizeNewtabThemeScope(value: unknown): NewtabThemeScope;
  NEWTAB_THEME_SCOPE_STORAGE_KEY: string;
  pageState: ModeCommandsState;
}

const THEME_MODE_ORDER: readonly ThemeMode[] = ['system', 'light', 'dark'];
const WEB_APPEARANCE_ORDER: readonly WebAppearanceMode[] = ['auto', 'light', 'dark'];

function createModeCommands(deps: ModeCommandsDeps) {
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
  let webAppearanceState: { supported: boolean; mode: WebAppearanceMode } = { supported: false, mode: 'auto' };

  function getThemeModeLabel(mode: string): string {
    if (mode === 'dark') {
      return t('theme_label_dark', '深色');
    }
    if (mode === 'light') {
      return t('theme_label_light', '浅色');
    }
    return t('theme_label_system', '跟随系统');
  }

  const commandDefinitions: SlashCommand[] = [
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

  function getCommandMatches(rawInput: unknown): SlashCommand[] {
    const input = String(rawInput || '').trim().toLowerCase();
    if (!input.startsWith('/')) {
      return [];
    }
    const matches: SlashCommand[] = [];
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

  function getCommandMatch(rawInput: unknown): { command: SlashCommand; completion: string } | null {
    const matches = getCommandMatches(rawInput);
    return matches.length > 0
      ? {
          command: matches[0],
          completion: matches[0].primary
        }
      : null;
  }

  function buildCommandSuggestion(command: SlashCommand): Suggestion {
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

  function updateModeBadge(rawValue: string | null | undefined): void {
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

  function getNextThemeMode(mode: unknown): ThemeMode {
    const index = THEME_MODE_ORDER.findIndex((item) => item === mode);
    if (index === -1) {
      return 'light';
    }
    return THEME_MODE_ORDER[(index + 1) % THEME_MODE_ORDER.length];
  }

  function isModeCommand(input: unknown): boolean {
    const raw = String(input || '').trim().toLowerCase();
    return raw === '/mode' || raw.startsWith('/mode ');
  }

  function isZenCommand(input: unknown): boolean {
    const raw = String(input || '').trim().toLowerCase();
    return raw === '/zen' || raw.startsWith('/zen ');
  }

  function isSlashCommandInput(input: unknown): boolean {
    const raw = String(input || '').trim();
    return raw.startsWith('/');
  }

  function isWebAppearanceCommand(input: unknown): boolean {
    const raw = String(input || '').trim().toLowerCase();
    return webAppearanceState.supported &&
      (raw === '/appearance' || raw.startsWith('/appearance '));
  }

  function getWebAppearanceModeLabel(mode: WebAppearanceMode): string {
    return mode === 'auto'
      ? t('web_appearance_label_auto', '自动')
      : getThemeModeLabel(mode);
  }

  function getNextWebAppearanceMode(mode: WebAppearanceMode): WebAppearanceMode {
    return WEB_APPEARANCE_ORDER[(WEB_APPEARANCE_ORDER.indexOf(mode) + 1) % WEB_APPEARANCE_ORDER.length];
  }

  function buildModeSuggestion(): Suggestion {
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

  function buildZenSuggestion(): Suggestion {
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

  function buildWebAppearanceSuggestion(): Suggestion {
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

  function refreshWebAppearanceCommand(): void {
    const rawValue = pageState.inputParts && pageState.inputParts.input
      ? (pageState.inputParts.input.value || '')
      : '';
    updateModeBadge(rawValue);
    if (isSlashCommandInput(rawValue)) {
      renderSuggestions([], rawValue.trim());
    }
  }

  function applyWebAppearanceState(response: { supported?: boolean; mode?: WebAppearanceMode } | undefined): void {
    if (!response || response.supported === false || typeof response.mode !== 'string') {
      return;
    }
    webAppearanceState = { supported: true, mode: response.mode };
    refreshWebAppearanceCommand();
  }

  function loadWebAppearance(): void {
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

  function setWebAppearanceMode(mode: WebAppearanceMode): void {
    // Show the choice at once; the reply carries what Firefox kept.
    webAppearanceState = { ...webAppearanceState, mode };
    refreshWebAppearanceCommand();
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'setWebAppearance', mode }, (response) => {
      if (!chrome.runtime.lastError && response && typeof response.mode === 'string') {
        applyWebAppearanceState(response);
        return;
      }
      loadWebAppearance();
    });
  }

  function updateModeCommandSuggestions(): void {
    const input = pageState.inputParts && pageState.inputParts.input;
    if (input && isModeCommand(input.value)) {
      renderSuggestions([], (input.value || '').trim());
    }
  }

  function updateZenCommandSuggestions(): void {
    const input = pageState.inputParts && pageState.inputParts.input;
    if (input && isZenCommand(input.value)) {
      renderSuggestions([], (input.value || '').trim());
    }
  }

  function syncSectionZenVisibility(section: HTMLElement | null): void {
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

  function applyZenMode(): void {
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

  function setZenModeEnabled(enabled: unknown): void {
    const nextEnabled = normalizeZenModeEnabled(enabled);
    pageState.zenModeEnabled = nextEnabled;
    if (!storageArea) {
      applyZenMode();
      updateZenCommandSuggestions();
      return;
    }
    void storageArea.set({ [NEWTAB_ZEN_MODE_STORAGE_KEY]: nextEnabled }, () => {
      applyZenMode();
      updateZenCommandSuggestions();
    });
  }

  function loadZenMode(): Promise<boolean> {
    const area = storageArea;
    if (!area) {
      pageState.zenModeEnabled = false;
      applyZenMode();
      return Promise.resolve(pageState.zenModeEnabled);
    }
    return new Promise((resolve) => {
      void area.get([NEWTAB_ZEN_MODE_STORAGE_KEY], (result) => {
        pageState.zenModeEnabled = normalizeZenModeEnabled(result && result[NEWTAB_ZEN_MODE_STORAGE_KEY]);
        applyZenMode();
        resolve(pageState.zenModeEnabled);
      });
    });
  }

  function getThemeScope(): NewtabThemeScope {
    return pageState.newtabThemeScope;
  }

  function getGlobalThemeStorageUpdate(mode: unknown): Record<string, ThemeMode> {
    return SETTINGS.createGlobalThemeModeStorageUpdate(mode);
  }

  function setGlobalThemeMode(mode: ThemeMode): void {
    const updates = getGlobalThemeStorageUpdate(mode);
    pageState.globalThemeMode = updates[THEME_STORAGE_KEY];
    if (!storageArea) {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    void storageArea.set(updates, () => {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  function setThemeMode(mode: unknown): void {
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
    void storageArea.set({ [targetKey]: nextStoredMode }, () => {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  function setVisibleThemeMode(mode: unknown): void {
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
    void storageArea.set({ [NEWTAB_THEME_MODE_STORAGE_KEY]: nextStoredMode }, () => {
      applyScopedThemeMode();
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
    });
  }

  function setThemeScope(scope: unknown): void {
    const nextScope = normalizeNewtabThemeScope(scope);
    const updates = { [NEWTAB_THEME_SCOPE_STORAGE_KEY]: nextScope };
    pageState.newtabThemeScope = nextScope;
    if (!storageArea) {
      updateWallpaperLanguageStrings();
      updateModeCommandSuggestions();
      return;
    }
    void storageArea.set(updates, () => {
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

type ModeCommands = ReturnType<typeof createModeCommands>;

export { createModeCommands };
export type { ModeCommands, ModeCommandsDeps, ModeCommandsState };
