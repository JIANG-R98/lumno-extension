// The toolbar popup: actions on the current page, two global switches and
// links to the rest of Lumno. React renders it from the model built here;
// this script owns the browser APIs and the settings it reads and writes.
import * as LumnoPipMainWorld from '../shared/pip-main-world';
import * as LumnoBrowserProfile from '../platform/browser-profile';
import * as AppearanceSettings from '../domain/settings/appearance';
import * as FeatureSettings from '../domain/settings/features';
import * as LocaleSettings from '../domain/settings/locale';
import * as OverlayPanelSettings from '../domain/settings/overlay-panel';
import * as PageCacheSettings from '../domain/settings/page-cache';
import * as SyncStateSettings from '../domain/settings/sync-state';
import { getContextSettingsStore } from '../platform/settings-store';
import * as LumnoShortcutDisplay from '../domain/shortcut-display';
import * as LumnoCursorTooltip from '../shared/ui/cursor-tooltip';
import * as LumnoToast from '../shared/ui/toast';
import * as LumnoTooltip from '../shared/ui/tooltip';
import * as LumnoUrlGuards from '../platform/url-guards';
import { readLocaleMessages } from '../domain/locale-messages';
import type { BackgroundAction, BackgroundReply, BackgroundRequest, LocaleMessage } from '../domain/messages';
import type { ThemeMode } from '../domain/settings/appearance';
import type { OverlaySizeMode } from '../domain/settings/overlay-panel';
import type { Setting } from '../domain/settings/define';
import * as LumnoMessaging from '../platform/messaging';
import { isHtmlElement } from '../shared/dom-guards';
import type {
  PopupActionId,
  PopupActionModel,
  PopupLinkId,
  PopupModel,
  PopupNoticeModel,
  PopupSyncModel
} from './react/popup-view';
import { getPopupApi } from './react/popup-view';
import type { RemixIconName } from '../shared/ui/remix-icon';
import { popupSettingsExpanded } from '../domain/settings/page-cache';

type Translate = (key: string, fallback: string) => string;

// The tab the popup was opened on.
interface PopupTab {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  iconUrl?: string;
  iconName?: RemixIconName | null;
  host?: string;
}

// The settings the popup shows, by row id.
interface PopupSettingValues {
  selectionQuickActions: boolean;
  overlaySize: OverlaySizeMode;
  overlayPageTheme: boolean;
  overlayOpenTabs: boolean;
  theme: ThemeMode;
  autoPip: boolean;
}

type PopupSettingId = keyof PopupSettingValues;

// WebDAV's status as the worker stores it, read as untrusted.
interface PopupSyncStatus {
  enabled: boolean;
  state: string;
  error: string;
  lastSyncAt: number | null;
}

interface PopupState {
  tab: PopupTab | null;
  // Browser, store and other pages scripts cannot reach.
  restricted: boolean;
  // The browser has Document Picture-in-Picture.
  documentPipSupported: boolean;
  // Web clip is turned on in Labs.
  documentPipEnabled: boolean;
  // Formatted key chords.
  shortcuts: { search: string; copy: string };
  // The page among the New Tab's pinned recent sites.
  recentPin: { pinned: boolean; full: boolean } | null;
  settings: PopupSettingValues;
  // The settings disclosure is open.
  settingsExpanded: boolean;
  // The page's video and the auto picture-in-picture switch.
  pip: { supported: boolean; hasVideo: boolean; active: boolean; menuExpanded: boolean };
  syncStatus: PopupSyncStatus | null;
  version: string;
  lang: string;
  now: number;
  busyAction: PopupActionId | '';
  notice: PopupNoticeModel | null;
}

interface PageDescription {
  kind: 'lumno' | 'browser' | 'extension' | 'file' | 'web';
  // Extension-relative.
  iconPath: string;
  // Pages with an icon image draw no glyph.
  iconName: RemixIconName | null;
  host: string;
}

interface PageContext {
  ownBase?: string;
  browserName?: string;
  isBrowserInternalUrl?(url: string): boolean;
}

const COMMAND_SHOW_SEARCH = 'show-search';
const COMMAND_COPY_URL = 'show-search-prefill-v';
// A success toast shown in the popup stays this long before the popup closes.
const CLOSE_AFTER_TOAST_MS = 1400;
const SYNC_ATTENTION_STATES: readonly string[] = Object.freeze(['conflict', 'choice']);
const SYNC_BUSY_STATES: readonly string[] = Object.freeze(['syncing', 'pending']);
// Rate limits the background waits out for minutes to hours before retrying.
const SYNC_THROTTLE_ERRORS: readonly string[] = Object.freeze(['http-429', 'http-503']);
const OVERFLOW_TOLERANCE_PX = 2;
const VIDEO_PROBE_TIMEOUT_MS = 250;

function getHost(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.hostname;
    }
  } catch (error) {
    return '';
  }
  return url;
}

function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(String(url || ''));
}

// Browser logos shipped in assets/images/browser-logos, matched against the
// browser's product name.
const BROWSER_LOGOS: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
  [/edge/i, 'microsoft-edge-2019.svg'],
  [/zen/i, 'zen.svg'],
  [/firefox/i, 'firefox.svg'],
  [/\bdia\b/i, 'dia.jpg'],
  [/comet/i, 'comet.jpg'],
  [/chrome/i, 'google-chrome-2022.svg']
]);

// How the page card shows a tab: Lumno's own pages carry the Lumno icon,
// browser pages the browser's logo, other pages their favicon.
function describePage(url: string, context?: PageContext | null): PageDescription {
  const config = context || {};
  if (config.ownBase && url.startsWith(config.ownBase)) {
    return { kind: 'lumno', iconPath: 'assets/images/lumno.png', iconName: null, host: 'Lumno' };
  }
  if (typeof config.isBrowserInternalUrl === 'function' && config.isBrowserInternalUrl(url)) {
    const logo = BROWSER_LOGOS.find(([pattern]) => pattern.test(String(config.browserName || '')));
    return {
      kind: 'browser',
      iconPath: logo ? `assets/images/browser-logos/${logo[1]}` : '',
      iconName: logo ? null : 'ri-window-line',
      host: url
    };
  }
  if (/^(?:chrome|moz|edge)-extension:/i.test(url)) {
    return { kind: 'extension', iconPath: '', iconName: 'ri-puzzle-line', host: getHost(url) };
  }
  if (/^file:/i.test(url)) {
    return { kind: 'file', iconPath: '', iconName: 'ri-file-line', host: url };
  }
  return { kind: 'web', iconPath: '', iconName: 'ri-global-line', host: getHost(url) };
}

// "3 minutes ago" in the popup's language, "now" under a minute.
function formatSyncTime(lastSyncAt: number, now: number, lang: string): string {
  const elapsedSeconds = Math.max(0, Math.round((now - lastSyncAt) / 1000));
  let format: Intl.RelativeTimeFormat;
  try {
    format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  } catch (error) {
    format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  }
  if (elapsedSeconds < 60) return format.format(0, 'second');
  const minutes = Math.round(elapsedSeconds / 60);
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, 'hour');
  return format.format(-Math.round(hours / 24), 'day');
}

function buildSyncModel(status: PopupSyncStatus | null, t: Translate, now: number, lang: string): PopupSyncModel | null {
  if (!status || status.enabled !== true) {
    return null;
  }
  if (status.state === 'error') {
    return { label: t('popup_sync_error', 'WebDAV sync failed'), tone: 'error' };
  }
  if (SYNC_ATTENTION_STATES.includes(status.state)) {
    return { label: t('popup_sync_attention', 'WebDAV sync needs you'), tone: 'error' };
  }
  // A throttled connection is pending too, but nothing runs until the server's
  // wait is over, so it must not look like a sync in progress.
  if (status.state === 'pending' && SYNC_THROTTLE_ERRORS.includes(status.error)) {
    return { label: t('popup_sync_waiting', 'WebDAV waiting to retry'), tone: 'waiting' };
  }
  if (SYNC_BUSY_STATES.includes(status.state)) {
    return { label: t('popup_sync_busy', 'WebDAV syncing'), tone: 'busy' };
  }
  if (status.lastSyncAt !== null && status.lastSyncAt > 0) {
    return {
      label: `${t('popup_sync_ready', 'WebDAV synced')} · ${formatSyncTime(status.lastSyncAt, now, lang)}`,
      tone: 'ok'
    };
  }
  return null;
}

function buildModel(state: PopupState, t: Translate): PopupModel {
  const tab = state.tab;
  const url = tab ? String(tab.url || '') : '';
  const restricted = !tab || state.restricted === true;
  // Shortcuts and pinned recent sites hold web pages only. They only store the
  // address, so a store page that takes no scripts can still be saved.
  const canSaveToNewTab = Boolean(tab) && isWebUrl(url);
  const recentPin = state.recentPin;
  const pinned = Boolean(recentPin && recentPin.pinned === true);
  const pinFull = !pinned && Boolean(recentPin && recentPin.full === true);
  const pip = state.pip;
  // Video picture-in-picture runs in the page, so browser pages never get it.
  const showPip = pip.supported === true && Boolean(tab) && !restricted;
  // Web clip is a Labs feature: it only shows once it is turned on.
  const showClip = state.documentPipSupported === true && state.documentPipEnabled === true;
  const values = state.settings;
  const action = (id: PopupActionId, base: Omit<PopupActionModel, 'id'>): PopupActionModel => ({
    ...base,
    id,
    disabled: base.disabled || state.busyAction === id
  });

  const actions: PopupActionModel[] = [
    action('search', {
      label: t('popup_open_command_bar', 'Open command bar'),
      tooltip: state.shortcuts.search,
      iconName: 'ri-search-line',
      disabled: !tab
    }),
    action('copy', {
      label: t('popup_action_copy', 'Copy link'),
      tooltip: state.shortcuts.copy,
      iconName: 'ri-link',
      disabled: !url
    }),
    action('shortcut', {
      label: t('popup_action_shortcut', 'Add shortcut'),
      tooltip: t('popup_action_shortcut_tooltip', 'Add to your New Tab shortcuts'),
      iconName: 'ri-apps-2-add-line',
      disabled: !canSaveToNewTab
    }),
    action('pin', {
      label: pinned
        ? t('popup_action_unpin_recent', 'Unpin from Recent')
        : t('popup_action_pin_recent', 'Pin to Recent'),
      tooltip: pinned
        ? t('popup_action_unpin_recent_tooltip', 'Unpin from Recent on New Tab')
        : (pinFull
          ? t('recent_pin_limit', 'You can pin up to 3 cards')
          : t('popup_action_pin_recent_tooltip', 'Pin to Recent on New Tab')),
      iconName: pinned ? 'ri-unpin-line' : 'ri-pushpin-line',
      disabled: !canSaveToNewTab || pinFull
    })
  ];
  // A disabled action says why in its tooltip.
  const unavailable = t('popup_action_unavailable', 'Not available on this page');
  if (!canSaveToNewTab) {
    actions.filter((item) => item.id === 'shortcut' || item.id === 'pin')
      .forEach((item) => { item.tooltip = unavailable; });
  }
  if (showClip) {
    actions.push(action('clip', {
      label: t('settings_document_pip_title', 'Web clip'),
      tooltip: restricted ? unavailable : t('popup_action_clip_tooltip', 'Clip part of the page into a floating window'),
      iconName: 'ri-screenshot-2-line',
      disabled: restricted
    }));
  }
  if (showPip) {
    actions.push(action('pip', {
      label: pip.active
        ? t('popup_action_pip_exit', 'Exit picture-in-picture')
        : t('popup_action_pip', 'Picture-in-picture'),
      // Without a video the button is simply off; it needs no explanation.
      tooltip: pip.hasVideo || pip.active
        ? t('popup_action_pip_tooltip', 'Float this page’s video in a small window')
        : '',
      iconName: 'ri-picture-in-picture-2-line',
      disabled: !pip.hasVideo && !pip.active,
      menu: {
        label: t('popup_action_pip_menu', 'Auto picture-in-picture'),
        expanded: pip.menuExpanded === true
      }
    }));
  }

  const notice = state.notice || null;

  const themeMode = values.theme;
  return {
    page: {
      title: tab ? String(tab.title || getHost(url) || url) : 'Lumno',
      host: tab ? (tab.host === undefined ? getHost(url) : String(tab.host)) : '',
      iconUrl: tab ? String(tab.iconUrl || '') : '',
      iconName: (tab && tab.iconName) || 'ri-global-line'
    },
    actionsLabel: t('popup_actions_label', 'Page actions'),
    actions,
    actionPanel: showPip
      ? {
        actionId: 'pip',
        expanded: pip.menuExpanded === true,
        rows: [{
          kind: 'switch',
          id: 'autoPip',
          label: t('popup_action_pip_menu', 'Auto picture-in-picture'),
          hint: t('popup_auto_pip_hint', 'Videos float when you switch tabs'),
          checked: values.autoPip === true
        }]
      }
      : null,
    notice,
    settings: {
      label: t('popup_settings_label', 'Quick settings'),
      expanded: state.settingsExpanded === true,
      sections: [
        {
          id: 'command-bar',
          title: t('popup_section_command_bar', 'Command bar'),
          rows: [
            {
              kind: 'segmented',
              id: 'overlaySize',
              label: t('settings_overlay_size_title', 'Size'),
              value: values.overlaySize,
              options: [
                { value: 'compact', label: t('overlay_size_compact', 'Compact') },
                { value: 'standard', label: t('overlay_size_standard', 'Standard') },
                { value: 'large', label: t('overlay_size_large', 'Large') }
              ]
            },
            {
              kind: 'switch',
              id: 'overlayPageTheme',
              label: t('popup_overlay_page_theme', 'Match page colors'),
              checked: values.overlayPageTheme === true
            },
            {
              kind: 'switch',
              id: 'overlayOpenTabs',
              label: t('popup_overlay_open_tabs', 'Show open tabs by default'),
              checked: values.overlayOpenTabs === true
            }
          ]
        },
        {
          id: 'general',
          title: t('settings_tab_general', 'General'),
          rows: [
            {
              kind: 'switch',
              id: 'selectionQuickActions',
              label: t('settings_selection_quick_actions_title', 'Selection quick actions'),
              checked: values.selectionQuickActions === true
            },
            {
              kind: 'segmented',
              id: 'theme',
              label: t('popup_theme_label', 'Theme'),
              value: themeMode,
              options: [
                { value: 'system', label: t('settings_theme_system', 'System') },
                { value: 'light', label: t('settings_theme_light', 'Light') },
                { value: 'dark', label: t('settings_theme_dark', 'Dark') }
              ]
            }
          ]
        }
      ]
    },
    links: [
      { id: 'release', label: t('popup_release_notes', 'What’s new'), iconName: 'ri-sparkling-2-line' },
      { id: 'feedback', label: t('popup_link_feedback', 'Feedback'), iconName: 'ri-chat-smile-2-line' },
      { id: 'shortcuts', label: t('popup_link_shortcuts', 'Set shortcuts'), iconName: 'ri-keyboard-box-line' },
      { id: 'settings', label: t('popup_link_settings', 'Settings'), iconName: 'ri-settings-3-line' }
    ],
    sync: buildSyncModel(state.syncStatus, t, state.now, state.lang),
    version: `Lumno ${state.version || ''}`.trim()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readSyncStatus(value: unknown): PopupSyncStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    enabled: value.enabled === true,
    state: typeof value.state === 'string' ? value.state : '',
    error: typeof value.error === 'string' ? value.error : '',
    lastSyncAt: typeof value.lastSyncAt === 'number' && Number.isFinite(value.lastSyncAt) ? value.lastSyncAt : null
  };
}

type PopupSettings = { [K in PopupSettingId]: Setting<PopupSettingValues[K]> };

function start(): void {
  const chromeApi = globalThis.chrome;
  const urlGuards = LumnoUrlGuards;
  const shortcutDisplay = LumnoShortcutDisplay;
  const reactApi = getPopupApi();
  const documentObj = globalThis.document;
  const rootElement = documentObj.getElementById('x-lumno-popup-root');
  if (!chromeApi || !reactApi || !isHtmlElement(rootElement)) {
    return;
  }
  // Narrowed here, for the functions below.
  const host = rootElement;
  // The settings the popup shows, by row id.
  const POPUP_SETTINGS: Readonly<PopupSettings> = Object.freeze({
    selectionQuickActions: FeatureSettings.selectionQuickActionsEnabled,
    overlaySize: OverlayPanelSettings.overlaySizeMode,
    overlayPageTheme: OverlayPanelSettings.overlayPageThemeAdaptationEnabled,
    overlayOpenTabs: OverlayPanelSettings.overlayOpenTabsDefaultVisible,
    theme: AppearanceSettings.themeMode,
    autoPip: FeatureSettings.autoPipEnabled
  });
  const settingIds: readonly PopupSettingId[] = Object.freeze([
    'selectionQuickActions', 'overlaySize', 'overlayPageTheme', 'overlayOpenTabs', 'theme', 'autoPip'
  ]);
  const isSettingId = (id: string): id is PopupSettingId => settingIds.some((settingId) => settingId === id);
  const settingsStore = getContextSettingsStore(chromeApi, globalThis);
  const settingsLoaded = settingsStore.include([
    ...settingIds.map((id) => POPUP_SETTINGS[id]),
    LocaleSettings.language,
    FeatureSettings.documentPipEnabled,
    SyncStateSettings.webdavStatus,
    popupSettingsExpanded,
    PageCacheSettings.optionsThemePreload
  ]);
  function readSettings(): PopupSettingValues {
    return {
      selectionQuickActions: settingsStore.get(POPUP_SETTINGS.selectionQuickActions),
      overlaySize: settingsStore.get(POPUP_SETTINGS.overlaySize),
      overlayPageTheme: settingsStore.get(POPUP_SETTINGS.overlayPageTheme),
      overlayOpenTabs: settingsStore.get(POPUP_SETTINGS.overlayOpenTabs),
      theme: settingsStore.get(POPUP_SETTINGS.theme),
      autoPip: settingsStore.get(POPUP_SETTINGS.autoPip)
    };
  }
  const darkQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const tooltip = LumnoTooltip.createController({
    documentObj,
    windowObj: globalThis,
    id: 'x-lumno-popup-tooltip',
    appendTo: documentObj.body,
    maxWidth: 272
  });
  // A page title or address cut short shows in full beside the pointer.
  const cursorTooltip = LumnoCursorTooltip.createController({
    documentObj,
    windowObj: globalThis,
    id: 'x-lumno-popup-cursor-tooltip',
    appendTo: documentObj.body,
    maxWidth: 280,
    offsetX: 12,
    offsetY: 16
  });
  let messages: Record<string, LocaleMessage> = {};
  let languageMode = 'system';
  let closeTimer = 0;
  let popupToast: { element: HTMLElement; controller: ReturnType<typeof LumnoToast.createToastController> } | null = null;
  const state: PopupState = {
    tab: null,
    restricted: true,
    documentPipSupported: 'documentPictureInPicture' in globalThis,
    documentPipEnabled: false,
    shortcuts: { search: '', copy: '' },
    recentPin: null,
    settings: readSettings(),
    syncStatus: null,
    version: '',
    lang: 'en',
    now: Date.now(),
    busyAction: '',
    notice: null,
    settingsExpanded: settingsStore.get(popupSettingsExpanded),
    pip: {
      // Firefox pages have no requestPictureInPicture.
      supported: typeof globalThis.HTMLVideoElement === 'function' &&
        typeof globalThis.HTMLVideoElement.prototype.requestPictureInPicture === 'function',
      hasVideo: false,
      active: false,
      menuExpanded: false
    }
  };

  function t(key: string, fallback: string): string {
    const entry = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : undefined;
    if (entry && typeof entry.message === 'string') {
      return entry.message;
    }
    if (languageMode === 'system' && chromeApi.i18n && chromeApi.i18n.getMessage) {
      const message = chromeApi.i18n.getMessage(key);
      if (message) return message;
    }
    return fallback;
  }

  // The worker's reply, or null when it did not answer.
  function sendMessage<A extends BackgroundAction>(
    payload: BackgroundRequest<A>
  ): Promise<BackgroundReply<A> | null> {
    return new Promise((resolve) => {
      try {
        LumnoMessaging.sendBackgroundMessage(chromeApi.runtime, payload, (reply) => {
          resolve(chromeApi.runtime.lastError || reply === undefined ? null : reply);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
    return new Promise((resolve) => {
      try {
        chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve(!chromeApi.runtime.lastError && tabs[0] ? tabs[0] : null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function loadMessages(locale: string): Promise<Record<string, LocaleMessage>> {
    return fetch(chromeApi.runtime.getURL(`_locales/${locale}/messages.json`))
      .then((response) => (response.ok ? response.json() : {}))
      .then((value: unknown) => readLocaleMessages(value))
      .catch(() => ({}));
  }

  // A web page's favicon, from the browser's cache where it offers one.
  function getFaviconUrl(tab: PopupTab, page: PageDescription): string {
    if (page.kind !== 'web') return '';
    const url = String(tab.url || '');
    const manifest = chromeApi.runtime.getManifest();
    if (isWebUrl(url) && Array.isArray(manifest.permissions) && manifest.permissions.includes('favicon')) {
      return chromeApi.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
    }
    return String(tab.favIconUrl || '');
  }

  function readCommands(): Promise<chrome.commands.Command[]> {
    return new Promise((resolve) => {
      // Not every browser has the commands API.
      if (!chromeApi.commands || typeof chromeApi.commands.getAll !== 'function') {
        resolve([]);
        return;
      }
      try {
        chromeApi.commands.getAll((commands) => {
          resolve(chromeApi.runtime.lastError ? [] : commands);
        });
      } catch (error) {
        resolve([]);
      }
    });
  }

  function readShortcuts(): Promise<PopupState['shortcuts']> {
    return readCommands().then((list) => {
      const find = (name: string): string => {
        const command = list.find((item) => item.name === name);
        return command && command.shortcut ? shortcutDisplay.formatShortcutChord(command.shortcut, { navigatorLike: globalThis.navigator }) : '';
      };
      return { search: find(COMMAND_SHOW_SEARCH), copy: find(COMMAND_COPY_URL) };
    });
  }

  function applyTheme(): void {
    const mode = state.settings.theme;
    const resolved = mode === 'system' ? (darkQuery.matches ? 'dark' : 'light') : mode;
    documentObj.body.setAttribute('data-theme', resolved);
    documentObj.documentElement.style.colorScheme = resolved;
  }

  // The next popup paints this theme before extension storage answers.
  function cacheThemeMode(mode: ThemeMode): void {
    void settingsStore.set(PageCacheSettings.optionsThemePreload, mode);
  }

  // Shows a value at once and stores it; the rest of Lumno follows the
  // storage change.
  function saveSetting(id: string, rawValue: unknown): void {
    if (!isSettingId(id)) return;
    const setting: Setting<unknown> = POPUP_SETTINGS[id];
    settingsStore.set(setting, setting.parse(rawValue)).catch(() => {});
  }

  // Applies a change made here or anywhere else in Lumno.
  function applyStoredSettings(): void {
    state.settings = readSettings();
    state.documentPipEnabled = settingsStore.get(FeatureSettings.documentPipEnabled);
    state.syncStatus = readSyncStatus(settingsStore.getStored(SyncStateSettings.webdavStatus));
    cacheThemeMode(state.settings.theme);
    applyTheme();
  }

  const controller = reactApi.createPopupController(host, {
    onAction: runAction,
    onSwitch: saveSetting,
    onSelect: saveSetting,
    // The settings and an action's options take turns being open, so the
    // popup stays inside the browser's 600px height limit.
    onSettingsToggle(expanded) {
      state.settingsExpanded = expanded;
      void settingsStore.set(popupSettingsExpanded, expanded);
      if (expanded) state.pip.menuExpanded = false;
      tooltip.hide();
      render();
    },
    onActionMenuToggle(id, expanded) {
      if (id !== 'pip') return;
      state.pip.menuExpanded = expanded;
      if (expanded && state.settingsExpanded) {
        state.settingsExpanded = false;
        void settingsStore.set(popupSettingsExpanded, false);
      }
      tooltip.hide();
      render();
    },
    onLink: openLink,
    onShowTooltip(target, text) {
      tooltip.show(target, text, { placement: 'top' });
    },
    onHideTooltip() {
      tooltip.hide();
    },
    bindTruncationTooltip(element) {
      cursorTooltip.bind(element, () => (element ? element.textContent || '' : ''), {
        shouldShow: (target) => LumnoCursorTooltip.isElementTextTruncated(target)
      });
    }
  });

  function render(): void {
    state.now = Date.now();
    controller.render(buildModel(state, t));
    globalThis.requestAnimationFrame(syncOverflow);
  }

  // The browser sizes the popup to the page, up to 600px tall. Fractional
  // line heights can leave the page a pixel taller than that window, which
  // should not draw a scrollbar; content past the limit still scrolls.
  function syncOverflow(): void {
    const page = documentObj.documentElement;
    page.style.overflowY = page.scrollHeight - globalThis.innerHeight > OVERFLOW_TOLERANCE_PX ? 'auto' : 'hidden';
  }

  // Lumno's top toast, at the top of the popup, for pages that cannot show
  // one themselves (browser pages, PDF viewers).
  function showPopupToast(message: string): void {
    if (!popupToast) {
      const element = documentObj.createElement('div');
      element.className = 'x-lumno-toast';
      element.setAttribute('data-show', 'false');
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      element.style.setProperty('--x-lumno-toast-top', '12px');
      documentObj.body.appendChild(element);
      popupToast = { element, controller: LumnoToast.createToastController(element, { windowObj: globalThis }) };
    }
    if (documentObj.body.getAttribute('data-theme') === 'dark') {
      popupToast.element.setAttribute('data-theme', 'dark');
    } else {
      popupToast.element.removeAttribute('data-theme');
    }
    popupToast.controller.show(message, { duration: CLOSE_AFTER_TOAST_MS });
  }

  // Every success is told by Lumno's top toast: the page's when it showed
  // one, so the popup gets out of the way, otherwise the popup's own.
  function announceSuccess(message: string, shownInPage: boolean): void {
    state.busyAction = '';
    if (shownInPage || !message) {
      globalThis.close();
      return;
    }
    render();
    showPopupToast(message);
    globalThis.clearTimeout(closeTimer);
    closeTimer = globalThis.setTimeout(() => globalThis.close(), CLOSE_AFTER_TOAST_MS);
  }

  function showError(text: string): void {
    state.busyAction = '';
    state.notice = { text, tone: 'error' };
    render();
  }

  // The script's result when it is an object; null otherwise.
  function executeInTab(
    tabId: number,
    details: { func: () => unknown; world?: `${chrome.scripting.ExecutionWorld}` }
  ): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      try {
        chromeApi.scripting.executeScript({ target: { tabId }, ...details }, (results) => {
          const first = !chromeApi.runtime.lastError && Array.isArray(results) ? results[0] : null;
          const result: unknown = first ? first.result : null;
          resolve(isRecord(result) ? result : null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  // Whether the page has a video picture-in-picture can show, and whether
  // one already floats. A page that does not answer in time counts as none.
  function probeVideo(tabId: number): Promise<Record<string, unknown> | null> {
    const probe = executeInTab(tabId, {
      func: () => ({
        hasVideo: Array.from(document.querySelectorAll('video')).some((video) => video.readyState >= 1),
        active: Boolean(document.pictureInPictureElement)
      })
    });
    const timeout = new Promise<null>((resolve) => globalThis.setTimeout(() => resolve(null), VIDEO_PROBE_TIMEOUT_MS));
    return Promise.race([probe, timeout]);
  }

  // Runs in the page from this click, so the request carries the popup's
  // user activation. Lumno's own helper picks the playing or largest video.
  async function runPictureInPicture(tab: PopupTab): Promise<void> {
    const mainWorld = LumnoPipMainWorld;
    const exiting = state.pip.active;
    const result = await executeInTab(tab.id, {
      world: 'MAIN',
      func: exiting ? mainWorld.forceExitPiPInMainWorld : mainWorld.siteTryEnterPiPInMainWorld
    });
    if (result && result.after === !exiting) {
      globalThis.close();
      return;
    }
    showError(t('popup_pip_failed', 'This video can’t play picture-in-picture.'));
  }

  // The page is the tab the popup showed, not whatever is active later.
  async function runAction(id: PopupActionId): Promise<void> {
    const tab = state.tab;
    if (!tab || state.busyAction) return;
    state.busyAction = id;
    state.notice = null;
    render();
    if (id === 'clip' || id === 'search') {
      await sendMessage({
        action: id === 'clip' ? 'popupOpenDocumentPipPicker' : 'popupShowSearch',
        tabId: tab.id
      });
      globalThis.close();
      return;
    }
    if (id === 'pip') {
      await runPictureInPicture(tab);
      return;
    }
    if (id === 'copy') {
      try {
        await globalThis.navigator.clipboard.writeText(String(tab.url || ''));
      } catch (error) {
        showError(t('popup_copy_failed', 'Couldn’t copy the link. Try again.'));
        return;
      }
      const message = t('copy_page_url_success', 'Current page URL copied');
      const shown = await sendMessage({ action: 'popupShowPageToast', tabId: tab.id, message });
      announceSuccess(message, Boolean(shown && shown.ok));
      return;
    }
    if (id === 'pin') {
      const result = await sendMessage({ action: 'popupToggleRecentPin', tabId: tab.id });
      const status = result && result.status;
      if (result && (status === 'pinned' || status === 'unpinned')) {
        state.recentPin = { full: state.recentPin ? state.recentPin.full : false, pinned: status === 'pinned' };
        let message = t('popup_recent_unpinned', 'Unpinned from Recent');
        if (status === 'pinned') {
          message = result.tracking === true
            ? t('recent_progress_auto_toast', 'Pinned and tracking progress. Click the radar icon on the card to stop.')
            : t('popup_recent_pinned', 'Pinned to Recent on your New Tab');
        }
        const shown = await sendMessage({ action: 'popupShowPageToast', tabId: tab.id, message });
        announceSuccess(message, Boolean(shown && shown.ok));
        return;
      }
      showError(status === 'limit'
        ? t('recent_pin_limit_toast', 'You can pin up to 3 cards.')
        : t('toast_error', 'Action failed. Try again.'));
      return;
    }
    if (id === 'shortcut') {
      const result = await sendMessage({ action: 'popupAddPageShortcut', tabId: tab.id });
      const status = result && result.status;
      if (result && (status === 'added' || status === 'exists')) {
        announceSuccess(result.message, result.toastShown === true);
        return;
      }
      showError((result && result.message) || t('toast_error', 'Action failed. Try again.'));
    }
  }

  function openLink(id: PopupLinkId): void {
    const reply = id === 'shortcuts'
      ? sendMessage({ action: 'openExtensionShortcutsPage' })
      : id === 'release'
        ? sendMessage({ action: 'openReleasePage', reason: 'manual' })
        : sendMessage({
          action: 'openOptionsPage',
          ...(id === 'feedback' ? { hash: 'general' } : id === 'sync' ? { hash: 'account' } : {})
        });
    reply.then(() => globalThis.close());
  }

  async function init(): Promise<void> {
    const [activeTab, shortcuts] = await Promise.all([
      queryActiveTab(),
      readShortcuts(),
      settingsLoaded
    ]);
    languageMode = settingsStore.get(LocaleSettings.language);
    const uiLanguage = chromeApi.i18n && chromeApi.i18n.getUILanguage ? chromeApi.i18n.getUILanguage() : 'en';
    const locale = LocaleSettings.normalizeLocale(languageMode === 'system' ? uiLanguage : languageMode);
    state.lang = LocaleSettings.localeToHtmlLang(locale);
    documentObj.documentElement.lang = state.lang;
    if (activeTab && typeof activeTab.id === 'number') {
      const url = String(activeTab.url || activeTab.pendingUrl || '');
      const tab: PopupTab = { id: activeTab.id, url, title: String(activeTab.title || ''), favIconUrl: activeTab.favIconUrl };
      const page = describePage(url, {
        ownBase: chromeApi.runtime.getURL(''),
        browserName: LumnoBrowserProfile.getBrowserInternalProfile(globalThis.navigator).name,
        isBrowserInternalUrl: urlGuards.isBrowserInternalUrl
      });
      tab.iconUrl = page.iconPath ? chromeApi.runtime.getURL(page.iconPath) : getFaviconUrl(tab, page);
      tab.iconName = page.iconName;
      tab.host = page.host;
      state.tab = tab;
      state.restricted = urlGuards.isRestrictedUrl(url);
    }
    const tab = state.tab;
    const canProbeVideo = Boolean(tab) && !state.restricted && state.pip.supported;
    const [loadedMessages, video, recentPin] = await Promise.all([
      loadMessages(locale),
      tab && canProbeVideo ? probeVideo(tab.id) : Promise.resolve(null),
      tab ? sendMessage({ action: 'popupGetRecentPin', tabId: tab.id }) : Promise.resolve(null)
    ]);
    messages = loadedMessages;
    if (recentPin) {
      state.recentPin = { pinned: recentPin.pinned === true, full: recentPin.full === true };
    }
    if (video) {
      state.pip.hasVideo = video.hasVideo === true;
      state.pip.active = video.active === true;
    }
    applyStoredSettings();
    state.shortcuts = shortcuts;
    state.version = chromeApi.runtime.getManifest().version || '';
    render();
    globalThis.addEventListener('resize', syncOverflow);
    // A folding panel changes height in one step, after its rows fade on
    // closing; measure once either settles.
    host.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'height' || event.propertyName === 'opacity') syncOverflow();
    });
    darkQuery.addEventListener('change', () => {
      if (state.settings.theme === 'system') applyTheme();
    });
    settingsStore.subscribe([
      ...settingIds.map((id) => POPUP_SETTINGS[id]),
      FeatureSettings.documentPipEnabled,
      SyncStateSettings.webdavStatus
    ], () => {
      applyStoredSettings();
      render();
    });
  }

  init().catch((error) => {
    console.error('[Lumno] The popup failed to start.', error);
  });
}

export { buildModel, describePage, formatSyncTime, start };
export type { PageContext, PageDescription, PopupSettingValues, PopupState, PopupSyncStatus, PopupTab };
