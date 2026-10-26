import * as PAGE_COLOR_SCHEME from '../page-color-scheme';
import { createSettingsStore } from '../../platform/settings-store';
import type { SettingsStore } from '../../platform/settings-store';
import { createTabSwitcherViewApi } from '../react/tab-switcher';
import type { TabSwitcherTab, TabSwitcherThumbnailUpdate, TabSwitcherViewController } from '../react/tab-switcher';
import * as TOAST from '../ui/toast';
import * as LumnoMessaging from '../../platform/messaging';
import { queryHtmlTags } from '../dom-lookup';
import { TAB_SWITCHER_HOST_ID, getTabSwitcherHost } from './host';
import type { TabSwitcherHost, TabSwitcherReply } from './host';
import { themeMode } from '../../domain/settings/appearance';

// The context the worker opens the switcher with, as read from its message.
interface OpenContext {
  tabs: TabSwitcherTab[];
  selectedIndex: unknown;
  // The page's zoom, which the switcher undoes to keep its size.
  tabZoomFactor: unknown;
  advanceOnExisting: boolean;
  suppressInitialShortcutAdvance: boolean;
  shortcut: unknown;
  // Opened by the reverse command, on the oldest tab.
  reverse: boolean;
}

type ModifierFlag = 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey';

interface ShortcutModifier {
  eventKey: string;
  flag: ModifierFlag;
}

// The shortcut that opens the switcher: its trigger key and the modifier
// whose release switches to the selected tab.
interface ParsedShortcut {
  triggerKey: string;
  // Shift is part of the chord, so pressing the key without it goes back.
  hasShift: boolean;
  commitModifierEventKey: string;
  commitModifierFlag: ModifierFlag | '';
}

interface SwitcherToast {
  element: HTMLDivElement;
  show(message: string, isError: boolean): void;
  destroy(): void;
}

type SwitcherTheme = 'dark' | 'light';

let tabSwitcherViewApi: ReturnType<typeof createTabSwitcherViewApi> | null = null;

// The React view the switcher draws through, made on first use.
function getTabSwitcherViewApi(): ReturnType<typeof createTabSwitcherViewApi> {
  if (!tabSwitcherViewApi) {
    tabSwitcherViewApi = createTabSwitcherViewApi();
  }
  return tabSwitcherViewApi;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readTab(value: unknown): TabSwitcherTab | null {
  if (!isRecord(value) || typeof value.id !== 'number') {
    return null;
  }
  const tab: TabSwitcherTab = { id: value.id, accentRgb: value.accentRgb };
  if (typeof value.windowId === 'number') {
    tab.windowId = value.windowId;
  } else if (value.windowId === null) {
    tab.windowId = null;
  }
  if (typeof value.title === 'string') {
    tab.title = value.title;
  }
  if (typeof value.url === 'string') {
    tab.url = value.url;
  }
  if (typeof value.favIconUrl === 'string') {
    tab.favIconUrl = value.favIconUrl;
  }
  if (typeof value.thumbnail === 'string') {
    tab.thumbnail = value.thumbnail;
  }
  if (typeof value.thumbnailStatus === 'string') {
    tab.thumbnailStatus = value.thumbnailStatus;
  }
  if (typeof value.thumbnailReason === 'string') {
    tab.thumbnailReason = value.thumbnailReason;
  }
  return tab;
}

// At most five tabs with an id; the rest of the context as sent.
function readOpenContext(value: unknown): OpenContext {
  const context = isRecord(value) ? value : {};
  const tabs = Array.isArray(context.tabs)
    ? context.tabs.map(readTab).filter((tab): tab is TabSwitcherTab => tab !== null).slice(0, 5)
    : [];
  return {
    tabs,
    selectedIndex: context.selectedIndex,
    tabZoomFactor: context.tabZoomFactor,
    advanceOnExisting: context.advanceOnExisting === true,
    suppressInitialShortcutAdvance: context.suppressInitialShortcutAdvance === true,
    shortcut: context.shortcut,
    reverse: context.reverse === true
  };
}

function readThumbnailUpdate(value: unknown): TabSwitcherThumbnailUpdate {
  const update: TabSwitcherThumbnailUpdate = {};
  if (!isRecord(value)) {
    return update;
  }
  if (typeof value.tabId === 'number') {
    update.tabId = value.tabId;
  }
  if (typeof value.url === 'string') {
    update.url = value.url;
  }
  if (typeof value.thumbnail === 'string') {
    update.thumbnail = value.thumbnail;
  }
  if (typeof value.thumbnailStatus === 'string') {
    update.thumbnailStatus = value.thumbnailStatus;
  }
  if (typeof value.thumbnailReason === 'string') {
    update.thumbnailReason = value.thumbnailReason;
  }
  return update;
}

const PANEL_ID = '_x_extension_tab_switcher_panel_2026_unique_';
const TAB_SWITCHER_ADVANCE_EVENT = '_x_extension_tab_switcher_advance_command_2026_unique_';
const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
const switcherThemeMediaQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

function handleExistingSwitcher(context: OpenContext): boolean {
  const existingHost = getTabSwitcherHost(document);
  if (!existingHost) {
    return false;
  }
  if (context.advanceOnExisting && typeof existingHost._lumnoTabSwitcherAdvance === 'function') {
    existingHost._lumnoTabSwitcherAdvance();
    return true;
  }
  const cleanup = existingHost._lumnoTabSwitcherCleanup;
  if (typeof cleanup === 'function') {
    cleanup();
  }
  existingHost.remove();
  return true;
}

function getMessage(key: string, fallback: string): string {
  try {
    if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
      return chrome.i18n.getMessage(key) || fallback;
    }
  } catch (_error) {
    // Ignore i18n failures in page context.
  }
  return fallback;
}

function sanitizeText(value: unknown, fallback?: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback || '';
}

function getHostLabel(url: string): string {
  try {
    const parsed = new URL(url);
    // An extension page's host is an opaque ID (a per-install UUID in Firefox).
    if (/^(?:chrome|moz)-extension:$/.test(parsed.protocol)) {
      return getMessage('extension_page_label', 'Extension page');
    }
    return parsed.hostname.replace(/^www\./i, '');
  } catch (_error) {
    return '';
  }
}

// Closing sits where the platform puts window controls: top-left on macOS,
// top-right on Windows.
function getCloseButtonPlacement(): 'left' | 'right' {
  const nav = window.navigator;
  const userAgentData: unknown = nav ? Reflect.get(nav, 'userAgentData') : null;
  const candidates = [
    isRecord(userAgentData) ? userAgentData.platform : '',
    nav ? nav.platform : '',
    nav ? nav.userAgent : ''
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const value = String(candidates[i] || '').toLowerCase();
    if (/(mac|iphone|ipad|ipod)/.test(value)) {
      return 'left';
    }
    if (/win/.test(value)) {
      return 'right';
    }
  }
  return 'left';
}

function isModalDialog(element: Element): boolean {
  try {
    return element.matches(':modal');
  } catch (_error) {
    return false;
  }
}

// Focus stays trapped in the topmost modal, so prefer the one holding it.
function findTopModalDialog(doc: Document): HTMLDialogElement | null {
  const active = doc.activeElement;
  const focusedDialog = active ? active.closest('dialog') : null;
  if (focusedDialog && isModalDialog(focusedDialog)) {
    return focusedDialog;
  }
  const dialogs = queryHtmlTags(doc, 'dialog[open]', 'dialog').filter(isModalDialog);
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
}

// Modal dialogs and fullscreen elements live in the browser's top layer,
// above any z-index (X's image viewer is a modal dialog). Mounting inside the
// modal keeps the switcher from being inert; the host then joins the top
// layer itself as a popover.
function getSwitcherMountParent(doc: Document): Element {
  const modalDialog = findTopModalDialog(doc);
  const fullscreenElement = doc.fullscreenElement || null;
  if (modalDialog && (!fullscreenElement || fullscreenElement.contains(modalDialog))) {
    return modalDialog;
  }
  return fullscreenElement || doc.documentElement || doc.body;
}

function showSwitcherHostInTopLayer(host: HTMLElement): void {
  if (!host.hasAttribute('popover')) {
    return;
  }
  try {
    host.showPopover();
  } catch (_error) {
    // Keep the fixed-position fallback visible if top-layer promotion fails.
    host.removeAttribute('popover');
  }
}

function updateOpenSwitcherThumbnailFromMessage(request: unknown): TabSwitcherReply {
  const host = getTabSwitcherHost(document);
  if (!host || typeof host._lumnoTabSwitcherUpdateThumbnail !== 'function') {
    return { ok: false, reason: 'tab_switcher_host_missing' };
  }
  return host._lumnoTabSwitcherUpdateThumbnail(request) || { ok: true };
}

function advanceOpenSwitcherFromMessage(request: Record<string, unknown>): TabSwitcherReply & {
  open: boolean;
  advanced: boolean;
  suppressed: boolean;
} {
  const host = getTabSwitcherHost(document);
  if (!host || typeof host._lumnoTabSwitcherAdvance !== 'function') {
    return {
      ok: true,
      open: false,
      advanced: false,
      suppressed: false
    };
  }
  const didAdvance = host._lumnoTabSwitcherAdvance(request.offset);
  return {
    ok: true,
    open: true,
    advanced: didAdvance === true,
    suppressed: didAdvance === false
  };
}

function commitOpenSwitcherFromShortcutReleaseMessage(): TabSwitcherReply & { committed: boolean } {
  const host = getTabSwitcherHost(document);
  if (!host || typeof host._lumnoTabSwitcherCommitFromShortcutRelease !== 'function') {
    return { ok: false, committed: false };
  }
  return {
    ok: true,
    committed: host._lumnoTabSwitcherCommitFromShortcutRelease() === true
  };
}

function openSwitcherFromMessage(request: Record<string, unknown>): TabSwitcherReply {
  return toggleTabSwitcher(request.context);
}

if (chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage) {
  const runtimeMessageListener = (
    request: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (reply: TabSwitcherReply) => void
  ): boolean => {
    if (!isRecord(request)) {
      return false;
    }
    if (request.action === 'updateTabSwitcherThumbnail') {
      sendResponse(updateOpenSwitcherThumbnailFromMessage(request));
      return true;
    }
    if (request.action === 'advanceOpenTabSwitcherFromCommand') {
      sendResponse(advanceOpenSwitcherFromMessage(request));
      return true;
    }
    if (request.action === 'commitOpenTabSwitcherFromShortcutRelease') {
      sendResponse(commitOpenSwitcherFromShortcutReleaseMessage());
      return true;
    }
    if (request.action !== 'openTabSwitcherFromCommand') {
      return false;
    }
    sendResponse(openSwitcherFromMessage(request));
    return true;
  };
  chromeApi.runtime.onMessage.addListener(runtimeMessageListener);
}

function clampSelectedIndex(index: unknown, length: number): number {
  if (length <= 0) {
    return 0;
  }
  const normalized = Number.isFinite(Number(index)) ? Number(index) : 0;
  return ((normalized % length) + length) % length;
}

function normalizeAdvanceOffset(value: unknown): number {
  const offset = Math.trunc(Number(value));
  return Number.isFinite(offset) && offset !== 0 ? offset : 1;
}

function normalizeTabSwitcherShortcutKey(value: unknown): string {
  const key = String(value || '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    comma: ',',
    period: '.',
    slash: '/',
    backslash: '\\',
    return: 'enter',
    esc: 'escape',
    space: ' ',
    spacebar: ' ',
    '⇥': 'tab'
  };
  return aliases[key] || key;
}

function normalizeTabSwitcherShortcutCode(value: unknown): string {
  const code = String(value || '');
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  const aliases: Record<string, string> = {
    Backquote: '`',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Comma: ',',
    Equal: '=',
    Minus: '-',
    Period: '.',
    Quote: "'",
    Semicolon: ';',
    Slash: '/'
  };
  return aliases[code] || '';
}

function getTabSwitcherShortcutModifier(value: string): ShortcutModifier | null {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'alt' || token === 'option') {
    return { eventKey: 'Alt', flag: 'altKey' };
  }
  if (token === 'ctrl' || token === 'control' || token === 'macctrl') {
    return { eventKey: 'Control', flag: 'ctrlKey' };
  }
  if (token === 'command' || token === 'cmd' || token === 'meta' || token === 'super') {
    return { eventKey: 'Meta', flag: 'metaKey' };
  }
  if (token === 'shift') {
    return { eventKey: 'Shift', flag: 'shiftKey' };
  }
  return null;
}

function parseTabSwitcherShortcut(value: unknown): ParsedShortcut {
  const shortcutText = String(value || 'Alt+Q').trim();
  const parts = shortcutText
    .split('+')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  const hasSymbolModifiers = /[⌥⌃⌘⇧]/.test(shortcutText);
  const symbolTrigger = hasSymbolModifiers
    ? shortcutText.replace(/[⌥⌃⌘⇧]/g, '').replace(/^\++/, '').trim()
    : '';
  const triggerKey = normalizeTabSwitcherShortcutKey(symbolTrigger || parts.pop() || 'Q');
  const modifiers: ShortcutModifier[] = (hasSymbolModifiers
    ? Array.from(shortcutText).map((token): ShortcutModifier | null => {
      if (token === '⌥') {
        return { eventKey: 'Alt', flag: 'altKey' };
      }
      if (token === '⌃') {
        return { eventKey: 'Control', flag: 'ctrlKey' };
      }
      if (token === '⌘') {
        return { eventKey: 'Meta', flag: 'metaKey' };
      }
      if (token === '⇧') {
        return { eventKey: 'Shift', flag: 'shiftKey' };
      }
      return null;
    })
    : parts.map(getTabSwitcherShortcutModifier)).filter((modifier): modifier is ShortcutModifier => modifier !== null);
  const commitModifier = modifiers.find((modifier) => modifier.eventKey !== 'Shift') || modifiers[0] || null;
  return {
    triggerKey,
    hasShift: modifiers.some((modifier) => modifier.eventKey === 'Shift'),
    commitModifierEventKey: commitModifier ? commitModifier.eventKey : '',
    commitModifierFlag: commitModifier ? commitModifier.flag : ''
  };
}

function isTabSwitcherShortcutTriggerEvent(shortcut: ParsedShortcut, event: KeyboardEvent): boolean {
  const eventKeys = [
    normalizeTabSwitcherShortcutKey(event && event.key),
    normalizeTabSwitcherShortcutCode(event && event.code)
  ].filter(Boolean);
  return eventKeys.includes(shortcut.triggerKey);
}

function isTabSwitcherCommitModifierPressed(shortcut: ParsedShortcut, event: KeyboardEvent): boolean {
  return Boolean(shortcut.commitModifierFlag && event && event[shortcut.commitModifierFlag] === true);
}

function normalizeSwitcherThemeMode(mode: unknown): 'dark' | 'light' | 'system' {
  const value = String(mode || '').trim().toLowerCase();
  return value === 'dark' || value === 'light' ? value : 'system';
}

function getSystemSwitcherTheme(): SwitcherTheme {
  return switcherThemeMediaQuery && switcherThemeMediaQuery.matches ? 'dark' : 'light';
}

// The page's own theme first, then the setting, then the system's.
function resolveSwitcherTheme(mode: unknown): SwitcherTheme {
  const normalized = normalizeSwitcherThemeMode(mode);
  const pageTheme = PAGE_COLOR_SCHEME.detectPageTheme(document, window);
  if (pageTheme) {
    return pageTheme;
  }
  if (normalized !== 'system') {
    return normalized;
  }
  return getSystemSwitcherTheme();
}

function applySwitcherTheme(
  view: Pick<TabSwitcherViewController, 'setTheme'>,
  mode: unknown,
  toastElement: HTMLElement | null
): void {
  const resolved = resolveSwitcherTheme(mode);
  view.setTheme(resolved);
  if (toastElement) {
    if (resolved === 'dark') {
      toastElement.setAttribute('data-theme', 'dark');
    } else {
      toastElement.removeAttribute('data-theme');
    }
  }
}

function createSwitcherThemeController(
  view: Pick<TabSwitcherViewController, 'panel' | 'setTheme'>,
  toastElement: HTMLElement | null
) {
  const themeAttrFilter = [
    'class',
    'style',
    'data-theme',
    'data-color-scheme',
    'data-color-mode',
    'data-mode',
    'data-appearance',
    'theme',
    'color-scheme',
    'dark',
    'light',
    'data-bs-theme'
  ];
  let switcherThemeMode: 'dark' | 'light' | 'system' = 'system';
  // The Lumno theme setting, followed while the switcher is open.
  let settingsStore: SettingsStore | null = null;
  let themeMediaListener: (() => void) | null = null;
  let pageThemeObserver: MutationObserver | null = null;
  let pageThemeSyncRaf: number | null = null;
  let destroyed = false;
  let started = false;

  function refreshSwitcherTheme(): void {
    if (!destroyed) {
      applySwitcherTheme(view, switcherThemeMode, toastElement);
    }
  }

  function schedulePageThemeSync(): void {
    if (pageThemeSyncRaf !== null) {
      return;
    }
    pageThemeSyncRaf = requestAnimationFrame(() => {
      pageThemeSyncRaf = null;
      const panel = view.panel;
      if (destroyed || !panel || !panel.isConnected || switcherThemeMode !== 'system') {
        return;
      }
      refreshSwitcherTheme();
    });
  }

  function stopPageThemeObserver(): void {
    if (pageThemeSyncRaf !== null) {
      cancelAnimationFrame(pageThemeSyncRaf);
      pageThemeSyncRaf = null;
    }
    if (pageThemeObserver) {
      pageThemeObserver.disconnect();
      pageThemeObserver = null;
    }
  }

  function startPageThemeObserver(): void {
    if (pageThemeObserver || switcherThemeMode !== 'system' || typeof MutationObserver !== 'function') {
      return;
    }
    const observer = new MutationObserver(() => {
      schedulePageThemeSync();
    });
    pageThemeObserver = observer;
    const docEl = document.documentElement;
    if (docEl) {
      observer.observe(docEl, {
        attributes: true,
        attributeFilter: themeAttrFilter
      });
    }
    const body = document.body;
    if (body) {
      observer.observe(body, {
        attributes: true,
        attributeFilter: themeAttrFilter
      });
    }
    const head = document.head;
    if (head) {
      observer.observe(head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['name', 'content', 'media']
      });
    }
    schedulePageThemeSync();
  }

  function removeThemeMediaListener(): void {
    if (!themeMediaListener || !switcherThemeMediaQuery) {
      return;
    }
    if (typeof switcherThemeMediaQuery.removeEventListener === 'function') {
      switcherThemeMediaQuery.removeEventListener('change', themeMediaListener);
    } else if (typeof switcherThemeMediaQuery.removeListener === 'function') {
      switcherThemeMediaQuery.removeListener(themeMediaListener);
    }
    themeMediaListener = null;
  }

  function installThemeMediaListener(): void {
    if (!switcherThemeMediaQuery || themeMediaListener) {
      return;
    }
    const listener = (): void => {
      if (switcherThemeMode === 'system') {
        refreshSwitcherTheme();
      }
    };
    themeMediaListener = listener;
    if (typeof switcherThemeMediaQuery.addEventListener === 'function') {
      switcherThemeMediaQuery.addEventListener('change', listener);
    } else if (typeof switcherThemeMediaQuery.addListener === 'function') {
      switcherThemeMediaQuery.addListener(listener);
    }
  }

  function setSwitcherThemeMode(mode: unknown): void {
    switcherThemeMode = normalizeSwitcherThemeMode(mode);
    refreshSwitcherTheme();
    if (switcherThemeMode === 'system') {
      startPageThemeObserver();
      installThemeMediaListener();
      return;
    }
    stopPageThemeObserver();
    removeThemeMediaListener();
  }

  function start(): void {
    if (started) {
      return;
    }
    started = true;
    destroyed = false;
    setSwitcherThemeMode('system');
    if (chromeApi && chromeApi.storage) {
      const store = createSettingsStore({ chromeApi, settings: [themeMode] });
      settingsStore = store;
      const apply = (): void => {
        if (!destroyed) {
          setSwitcherThemeMode(store.get(themeMode));
        }
      };
      void store.ready.then(apply);
      store.subscribe(themeMode, apply);
    }
  }

  function destroy(): void {
    destroyed = true;
    started = false;
    if (settingsStore) {
      settingsStore.destroy();
      settingsStore = null;
    }
    removeThemeMediaListener();
    stopPageThemeObserver();
  }

  return {
    start,
    destroy,
    refresh: refreshSwitcherTheme
  };
}

function getThumbnailStatus(tab: TabSwitcherTab, thumbnail: string): string {
  const status = String(tab && tab.thumbnailStatus ? tab.thumbnailStatus : '').trim().toLowerCase();
  if (status === 'ok' ||
      status === 'pending' ||
      status === 'failed' ||
      status === 'restricted' ||
      status === 'stale') {
    return status;
  }
  return thumbnail && thumbnail.startsWith('data:image/') ? 'ok' : 'missing';
}

function normalizeAccentCss(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 3) {
    return '';
  }
  const rgb = value.map((channel) => Math.round(Number(channel)));
  if (!rgb.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
    return '';
  }
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function formatSwitcherScale(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function getSwitcherVisualViewportScale(win: Window): number {
  const visualViewport = win && win.visualViewport ? win.visualViewport : null;
  const scale = visualViewport && Number.isFinite(Number(visualViewport.scale))
    ? Number(visualViewport.scale)
    : 1;
  return scale > 0 ? scale : 1;
}

function getSwitcherViewportComfortScale(win: Window): number {
  const visualViewport = win && win.visualViewport ? win.visualViewport : null;
  const width = visualViewport && Number.isFinite(Number(visualViewport.width))
    ? Number(visualViewport.width)
    : (win && Number.isFinite(Number(win.innerWidth)) ? Number(win.innerWidth) : 0);
  const height = visualViewport && Number.isFinite(Number(visualViewport.height))
    ? Number(visualViewport.height)
    : (win && Number.isFinite(Number(win.innerHeight)) ? Number(win.innerHeight) : 0);
  if (width >= 1440 && height >= 820) {
    return 1.08;
  }
  if (width >= 1180 && height >= 700) {
    return 1.045;
  }
  return 1;
}

// Centers the panel in the visual viewport, which pinch zoom moves.
function applySwitcherViewportPlacement(panel: HTMLElement | null, win: Window): void {
  if (!panel) {
    return;
  }
  const targetWindow = win || window;
  const visualViewport = targetWindow && targetWindow.visualViewport
    ? targetWindow.visualViewport
    : null;
  const viewportWidth = visualViewport && Number.isFinite(Number(visualViewport.width))
    ? Math.max(0, Number(visualViewport.width))
    : Math.max(0, Number(targetWindow && targetWindow.innerWidth) || 0);
  const viewportHeight = visualViewport && Number.isFinite(Number(visualViewport.height))
    ? Math.max(0, Number(visualViewport.height))
    : Math.max(0, Number(targetWindow && targetWindow.innerHeight) || 0);
  const offsetLeft = visualViewport && Number.isFinite(Number(visualViewport.offsetLeft))
    ? Math.max(0, Number(visualViewport.offsetLeft))
    : 0;
  const offsetTop = visualViewport && Number.isFinite(Number(visualViewport.offsetTop))
    ? Math.max(0, Number(visualViewport.offsetTop))
    : 0;
  panel.style.setProperty(
    '--x-tab-switcher-center-left',
    `${Math.round(offsetLeft + (viewportWidth / 2))}px`
  );
  panel.style.setProperty(
    '--x-tab-switcher-center-top',
    `${Math.round(offsetTop + (viewportHeight / 2))}px`
  );
}

// Keeps the panel's size at any page or pinch zoom.
function applySwitcherZoomCompensation(panel: HTMLElement | null, tabZoomFactor: unknown, visualViewportScale: number): void {
  if (!panel) {
    return;
  }
  const zoomRaw = Number(tabZoomFactor);
  const visualScale = Number.isFinite(Number(visualViewportScale)) && Number(visualViewportScale) > 0
    ? Number(visualViewportScale)
    : 1;
  const combinedScale = zoomRaw * visualScale;
  const baseVisibleScale = Number.isFinite(combinedScale) && combinedScale > 0 && combinedScale !== 1
    ? Math.max(0.35, Math.min(4, 1 / combinedScale))
    : 1;
  const viewportComfortScale = getSwitcherViewportComfortScale(window);
  const visibleScale = Math.max(0.35, Math.min(4, baseVisibleScale * viewportComfortScale));
  panel.style.setProperty('--x-tab-switcher-visible-scale', formatSwitcherScale(visibleScale));
}

function buildStyles(): string {
  return `
    :host {
      all: initial;
    }
    #${PANEL_ID},
    #${PANEL_ID} * {
      box-sizing: border-box;
      font-family: "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    #${PANEL_ID} {
      all: unset;
      --x-tab-switcher-accent: #2563eb;
      --x-tab-switcher-card-width: clamp(136px, calc((100vw - 68px) / 5), 204px);
      --x-tab-switcher-gap: 6px;
      --x-tab-switcher-padding-panel: 10px;
      --x-tab-switcher-padding-card: 7px;
      --x-tab-switcher-border-card: 1px;
      --x-tab-switcher-radius-panel: 30px;
      --x-tab-switcher-radius-card: calc(var(--x-tab-switcher-radius-panel) - var(--x-tab-switcher-padding-panel));
      --x-tab-switcher-radius-thumb: calc(var(--x-tab-switcher-radius-card) - var(--x-tab-switcher-padding-card) - var(--x-tab-switcher-border-card));
      --x-tab-switcher-radius-icon: 9px;
      --x-tab-switcher-radius-title-icon: 4px;
      --x-tab-switcher-meta-inline-padding: 3px;
      --x-tab-switcher-visible-scale: 1;
      --x-tab-switcher-motion-card: 180ms cubic-bezier(0.22, 1, 0.36, 1);
      --x-tab-switcher-motion-cover: 220ms cubic-bezier(0.22, 1, 0.36, 1);
      --x-tab-switcher-thumb-stroke-inset: -0.5px;
      --x-tab-switcher-thumb-stroke-radius-offset: 0.5px;
      --x-tab-switcher-thumb-stroke-color: rgba(15, 23, 42, 0.2);
      --x-tab-switcher-title-icon-size: 16px;
      --x-tab-switcher-title-icon-gap: 5px;
      color-scheme: light;
      position: fixed;
      left: var(--x-tab-switcher-center-left, 50%);
      top: var(--x-tab-switcher-center-top, 50%);
      transform: translate3d(-50%, -50%, 0) scale(var(--x-tab-switcher-visible-scale));
      transform-origin: center center;
      z-index: 2147483647;
      width: fit-content;
      max-width: calc(100vw - 24px);
      color: #172033;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(245, 247, 250, 0.88));
      border: 0;
      border-radius: var(--x-tab-switcher-radius-panel);
      box-shadow:
        0 0 0 0.5px rgba(15, 23, 42, 0.1),
        0 1px 2px rgba(15, 23, 42, 0.06),
        0 10px 24px -6px rgba(15, 23, 42, 0.12),
        0 36px 84px -12px rgba(15, 23, 42, 0.22),
        0 96px 220px -16px rgba(15, 23, 42, 0.3),
        0 0 140px 8px rgba(15, 23, 42, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.9),
        inset 0 0 0 1px rgba(255, 255, 255, 0.4);
      backdrop-filter: blur(40px) saturate(120%);
      -webkit-backdrop-filter: blur(40px) saturate(120%);
      padding: var(--x-tab-switcher-padding-panel);
      pointer-events: auto;
      opacity: 0;
      transition: opacity 90ms ease;
      will-change: opacity;
    }
    #${PANEL_ID}[data-visible="true"] {
      opacity: 1;
      transform: translate3d(-50%, -50%, 0) scale(var(--x-tab-switcher-visible-scale));
    }
    .x-tab-switcher-list {
      display: grid;
      grid-template-columns: repeat(var(--x-tab-count, 5), var(--x-tab-switcher-card-width));
      gap: var(--x-tab-switcher-gap);
      width: max-content;
      max-width: 100%;
    }
    .x-tab-switcher-item {
      position: relative;
      min-width: 0;
      transition: opacity 140ms ease;
    }
    .x-tab-switcher-item[data-closing="true"] {
      opacity: 0.45;
      pointer-events: none;
    }
    .x-tab-switcher-card {
      all: unset;
      width: var(--x-tab-switcher-card-width);
      min-width: var(--x-tab-switcher-card-width);
      max-width: var(--x-tab-switcher-card-width);
      display: flex;
      flex-direction: column;
      gap: 7px;
      border-radius: var(--x-tab-switcher-radius-card);
      border: var(--x-tab-switcher-border-card) solid transparent;
      outline: 0;
      background: transparent;
      padding: var(--x-tab-switcher-padding-card);
      color: #172033;
      cursor: pointer;
      box-shadow: none;
    }
    .x-tab-switcher-card[data-active="true"] {
      transform: none;
      border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 32%, rgba(15, 23, 42, 0.08));
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 16%, rgba(255, 255, 255, 0.88)),
          color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 8%, rgba(255, 255, 255, 0.78))
        );
      box-shadow:
        0 0 16px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 7%, transparent),
        0 4px 10px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 3%, transparent),
        inset 0 1px 0 rgba(255, 255, 255, 0.84),
        inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 12%, rgba(255, 255, 255, 0.72));
    }
    .x-tab-switcher-card:focus-visible {
      border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 42%, rgba(15, 23, 42, 0.1));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.84),
        inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 14%, rgba(255, 255, 255, 0.72));
    }
    .x-tab-switcher-thumb {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-radius: var(--x-tab-switcher-radius-thumb);
      background: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 14%, rgba(248, 250, 252, 0.94));
    }
    .x-tab-switcher-thumb::after {
      content: "";
      position: absolute;
      inset: var(--x-tab-switcher-thumb-stroke-inset);
      z-index: 2;
      border-radius: calc(var(--x-tab-switcher-radius-thumb) + var(--x-tab-switcher-thumb-stroke-radius-offset));
      box-sizing: border-box;
      border: 1px solid var(--x-tab-switcher-thumb-stroke-color);
      box-shadow: none;
      pointer-events: none;
    }
    .x-tab-switcher-thumb img[data-kind="thumbnail"] {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      object-position: top center;
      opacity: 1;
      transition: opacity var(--x-tab-switcher-motion-cover);
      will-change: opacity;
    }
    .x-tab-switcher-thumb img[data-kind="thumbnail"][data-entering="true"] {
      opacity: 0;
    }
    .x-tab-switcher-thumb img[data-kind="thumbnail"][data-exiting="true"] {
      opacity: 0;
    }
    .x-tab-switcher-thumb img[data-broken="true"] {
      display: none;
    }
    .x-tab-switcher-fallback {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .x-tab-switcher-favicon {
      width: 38px;
      height: 38px;
      border-radius: var(--x-tab-switcher-radius-icon);
    }
    .x-tab-switcher-favicon[data-broken="true"] {
      visibility: hidden;
    }
    .x-tab-switcher-close {
      all: unset;
      --x-tab-switcher-close-inset: calc(var(--x-tab-switcher-padding-card) + var(--x-tab-switcher-border-card) + 5px);
      position: absolute;
      top: var(--x-tab-switcher-close-inset);
      left: var(--x-tab-switcher-close-inset);
      z-index: 3;
      width: 20px;
      height: 20px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: rgba(23, 32, 51, 0.72);
      background: rgba(255, 255, 255, 0.9);
      box-shadow:
        0 1px 3px rgba(15, 23, 42, 0.16),
        0 0 0 0.5px rgba(15, 23, 42, 0.16);
      cursor: pointer;
      opacity: 0;
      transform: scale(0.7);
      pointer-events: none;
      transition:
        opacity 120ms ease,
        transform var(--x-tab-switcher-motion-card),
        color 120ms ease,
        background 120ms ease;
    }
    #${PANEL_ID}[data-close-placement="right"] .x-tab-switcher-close {
      left: auto;
      right: var(--x-tab-switcher-close-inset);
    }
    .x-tab-switcher-item:hover .x-tab-switcher-close {
      opacity: 1;
      transform: scale(1);
      pointer-events: auto;
    }
    .x-tab-switcher-close:hover {
      color: #0f172a;
      background: #ffffff;
    }
    .x-tab-switcher-close:active {
      transform: scale(0.9);
    }
    .x-tab-switcher-close svg {
      width: 10px;
      height: 10px;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
    }
    .x-tab-switcher-meta {
      min-width: 0;
      display: grid;
      gap: 1px;
      padding: 0 var(--x-tab-switcher-meta-inline-padding);
    }
    .x-tab-switcher-name-row {
      min-width: 0;
      display: grid;
      grid-template-columns: var(--x-tab-switcher-title-icon-size) minmax(0, 1fr);
      align-items: center;
      gap: var(--x-tab-switcher-title-icon-gap);
    }
    .x-tab-switcher-title-favicon {
      width: var(--x-tab-switcher-title-icon-size);
      height: var(--x-tab-switcher-title-icon-size);
      min-width: 0;
      border-radius: var(--x-tab-switcher-radius-title-icon);
      object-fit: cover;
      opacity: 1;
    }
    .x-tab-switcher-name {
      min-width: 0;
      display: block;
      color: #172033;
      font-size: 11.5px;
      font-weight: 500;
      line-height: 1.32;
      letter-spacing: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .x-tab-switcher-host {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: rgba(23, 32, 51, 0.58);
      font-size: 11px;
      font-weight: 560;
      line-height: 1.32;
    }
    @supports (corner-shape: superellipse(1.25)) {
      #${PANEL_ID},
      .x-tab-switcher-card,
      .x-tab-switcher-thumb,
      .x-tab-switcher-thumb::after,
      .x-tab-switcher-favicon,
      .x-tab-switcher-title-favicon {
        corner-shape: superellipse(1.25);
      }
    }
    @media (max-width: 860px) {
      #${PANEL_ID} {
        --x-tab-switcher-card-width: calc((100vw - 32px) / 5);
        --x-tab-switcher-gap: 3px;
        --x-tab-switcher-padding-panel: 5px;
        --x-tab-switcher-padding-card: 5px;
        --x-tab-switcher-radius-panel: 24px;
        --x-tab-switcher-radius-icon: 9px;
        --x-tab-switcher-radius-title-icon: 4px;
        --x-tab-switcher-meta-inline-padding: 2px;
        --x-tab-switcher-title-icon-size: 13px;
        --x-tab-switcher-title-icon-gap: 4px;
        top: 50%;
        max-width: calc(100vw - 10px);
        padding: var(--x-tab-switcher-padding-panel);
      }
      .x-tab-switcher-card {
        gap: 4px;
        padding: var(--x-tab-switcher-padding-card);
      }
      .x-tab-switcher-meta {
        gap: 0;
      }
      .x-tab-switcher-close {
        --x-tab-switcher-close-inset: calc(var(--x-tab-switcher-padding-card) + var(--x-tab-switcher-border-card) + 3px);
        width: 18px;
        height: 18px;
      }
      .x-tab-switcher-name {
        font-size: 10.5px;
        line-height: 1.3;
      }
      .x-tab-switcher-host {
        display: none;
      }
    }
    #${PANEL_ID}[data-theme="dark"] {
      --x-tab-switcher-thumb-stroke-color: rgba(255, 255, 255, 0.24);
      color-scheme: dark;
      color: #f8fafc;
      background: linear-gradient(180deg, rgba(36, 38, 44, 0.88), rgba(22, 24, 28, 0.9));
      box-shadow:
        0 0 0 0.5px rgba(0, 0, 0, 0.5),
        0 1px 3px rgba(0, 0, 0, 0.32),
        0 12px 26px -6px rgba(0, 0, 0, 0.4),
        0 40px 92px -12px rgba(0, 0, 0, 0.55),
        0 104px 236px -16px rgba(0, 0, 0, 0.66),
        0 0 150px 10px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-card {
      color: #f8fafc;
      background: transparent;
      box-shadow: none;
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-card[data-active="true"] {
      border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 34%, rgba(255, 255, 255, 0.12));
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 18%, rgba(30, 41, 59, 0.72)),
          color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 10%, rgba(8, 13, 24, 0.72))
        );
      box-shadow:
        0 0 18px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 10%, transparent),
        0 4px 10px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 5%, transparent),
        inset 0 1px 0 rgba(255, 255, 255, 0.13),
        inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 12%, rgba(255, 255, 255, 0.08));
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-card:focus-visible {
      border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 42%, rgba(255, 255, 255, 0.16));
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.13),
        inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 12%, rgba(255, 255, 255, 0.08));
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-name {
      color: #f8fafc;
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-host {
      color: rgba(248, 250, 252, 0.58);
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-close {
      color: rgba(248, 250, 252, 0.8);
      background: rgba(30, 41, 59, 0.92);
      box-shadow:
        0 1px 3px rgba(0, 0, 0, 0.32),
        0 0 0 0.5px rgba(255, 255, 255, 0.18);
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-close:hover {
      color: #ffffff;
      background: rgba(51, 65, 85, 0.96);
    }
    #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-thumb {
      background: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 18%, rgba(15, 23, 42, 0.92));
    }
    @media (prefers-reduced-motion: reduce) {
      .x-tab-switcher-thumb img[data-kind="thumbnail"],
      .x-tab-switcher-close {
        transition: none;
      }
    }
  `;
}

// The shared Toast at the top of the screen, inside the switcher's shadow
// root so it lives and goes with the switcher.
function createSwitcherToast(shadow: ShadowRoot | HTMLElement): SwitcherToast {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('src/shared/ui/toast.css');
  const element = document.createElement('div');
  element.className = 'x-lumno-toast';
  element.setAttribute('data-show', 'false');
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.style.setProperty('--x-lumno-toast-top', 'max(24px, calc(env(safe-area-inset-top) + 12px))');
  element.style.setProperty('--x-lumno-toast-z-index', '2147483647');
  shadow.append(stylesheet, element);
  const styleGate = TOAST.createToastStyleGate(element, {
    stylesheetElement: stylesheet,
    windowObj: window
  });
  const controller = TOAST.createToastController(element, { windowObj: window });
  return {
    element,
    show(message: string, isError: boolean): void {
      element.setAttribute('role', isError ? 'alert' : 'status');
      element.setAttribute('aria-live', isError ? 'assertive' : 'polite');
      controller.show(message, { error: Boolean(isError) });
    },
    destroy() {
      styleGate.destroy();
      controller.destroy();
    }
  };
}

// Opens the tab switcher with the context the worker or the page sends, read
// as untrusted, or moves an open one along.
function toggleTabSwitcher(rawContext: unknown): TabSwitcherReply {
  const context = readOpenContext(rawContext);
  if (handleExistingSwitcher(context)) {
    return { ok: true, reason: 'already-open' };
  }
  const tabs = context.tabs;
  if (!tabs.length) {
    return { ok: false, reason: 'empty' };
  }
  const tabSwitcherReactViewApi = getTabSwitcherViewApi();
  const shortcut = parseTabSwitcherShortcut(context.shortcut);

  const host: TabSwitcherHost = document.createElement('div');
  host.id = TAB_SWITCHER_HOST_ID;
  host.style.cssText = [
    'all: initial !important',
    'position: fixed !important',
    'inset: 0 !important',
    'z-index: 2147483647 !important',
    'pointer-events: none !important',
    'contain: layout style paint !important'
  ].join(';');
  if (typeof host.showPopover === 'function') {
    host.setAttribute('popover', 'manual');
  }
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = buildStyles();
  shadow.appendChild(style);

  let selectedIndex = clampSelectedIndex(context.selectedIndex, tabs.length);
  let allowRelayedShortcutReleaseActivation = false;
  let tabSwitcherReactView: ReturnType<typeof tabSwitcherReactViewApi.createTabSwitcherView> | null = tabSwitcherReactViewApi.createTabSwitcherView({
    document,
    root: shadow,
    panelId: PANEL_ID,
    tabs,
    selectedIndex,
    ariaLabel: getMessage('tab_switcher_title', 'Recent tabs'),
    closeButtonPlacement: getCloseButtonPlacement(),
    sanitizeText,
    getHostLabel,
    getMessage,
    normalizeAccentCss,
    getThumbnailStatus,
    onSelect(index) {
      selectedIndex = index;
      renderSelection();
    },
    onActivate(index, event) {
      if (!event || (event.isTrusted !== true && !allowRelayedShortcutReleaseActivation)) {
        return;
      }
      stopHandledKeyEvent(event);
      selectedIndex = index;
      switchToSelected();
    },
    onClose(index, event) {
      if (!event || event.isTrusted !== true) {
        return;
      }
      closeTabAt(index);
    }
  });
  const view = tabSwitcherReactView;
  const viewPanel = view.panel;
  if (!viewPanel) {
    host.remove();
    return { ok: false, reason: 'react-view-unavailable' };
  }
  // Narrowed here, for the functions below.
  const panel: HTMLElement = viewPanel;
  applySwitcherViewportPlacement(panel, window);
  applySwitcherZoomCompensation(panel, context.tabZoomFactor, getSwitcherVisualViewportScale(window));

  function syncSwitcherZoomCompensation(): void {
    applySwitcherViewportPlacement(panel, window);
    applySwitcherZoomCompensation(panel, context.tabZoomFactor, getSwitcherVisualViewportScale(window));
  }

  const switcherToast = createSwitcherToast(shadow);
  const switcherThemeController = createSwitcherThemeController(view, switcherToast.element);
  switcherThemeController.start();

  let didRequestSwitch = false;
  let suppressInitialShortcutAdvanceUntilTriggerKeyup = context.suppressInitialShortcutAdvance;

  function renderSelection(): void {
    if (tabSwitcherReactView) {
      tabSwitcherReactView.updateSelection(selectedIndex);
    }
  }

  function close(): void {
    const cleanup = host._lumnoTabSwitcherCleanup;
    if (typeof cleanup === 'function') {
      cleanup();
    }
    host.remove();
  }

  function switchToSelected(): boolean {
    if (didRequestSwitch) {
      return false;
    }
    const selected = tabs[selectedIndex];
    if (!selected || typeof selected.id !== 'number') {
      close();
      return false;
    }
    didRequestSwitch = true;
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
      action: 'switchToTab',
      tabId: selected.id,
      windowId: typeof selected.windowId === 'number' ? selected.windowId : null
    }, () => {
      close();
    });
    return true;
  }

  const closingTabIds = new Set<number>();

  function showSwitcherToast(message: string, isError: boolean): void {
    switcherToast.show(message, isError);
  }

  function closeTabAt(index: number): void {
    const tab = tabs[index];
    if (didRequestSwitch || !tab || typeof tab.id !== 'number' || closingTabIds.has(tab.id)) {
      return;
    }
    const tabId = tab.id;
    closingTabIds.add(tabId);
    view.setTabClosing(tabId, true);
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'closeTabFromTabSwitcher', tabId }, (response) => {
      const lastError = chrome.runtime && chrome.runtime.lastError;
      closingTabIds.delete(tabId);
      if (!tabSwitcherReactView) {
        return;
      }
      if (lastError || !response || response.ok !== true) {
        tabSwitcherReactView.setTabClosing(tabId, false);
        showSwitcherToast(getMessage('tab_switcher_close_failed', "Couldn't close this tab"), true);
        return;
      }
      const closedIndex = tabs.findIndex((item) => item.id === tabId);
      if (closedIndex >= 0) {
        tabs.splice(closedIndex, 1);
      }
      if (!tabs.length) {
        close();
        return;
      }
      if (closedIndex >= 0 && closedIndex < selectedIndex) {
        selectedIndex -= 1;
      }
      selectedIndex = Math.min(selectedIndex, tabs.length - 1);
      tabSwitcherReactView.removeTab(tabId);
      renderSelection();
      showSwitcherToast(getMessage('tab_switcher_tab_closed', 'Tab closed'), false);
    });
  }

  // Clicks the selected card, so the switch runs as a trusted click would.
  function clickSelectedCardFromShortcutRelease(): boolean {
    const buttons = tabSwitcherReactView && Array.isArray(tabSwitcherReactView.buttons)
      ? tabSwitcherReactView.buttons
      : [];
    const selectedButton = buttons[selectedIndex];
    if (!selectedButton || typeof selectedButton.click !== 'function') {
      return switchToSelected();
    }
    const wasRequested = didRequestSwitch;
    allowRelayedShortcutReleaseActivation = true;
    try {
      selectedButton.click();
    } finally {
      allowRelayedShortcutReleaseActivation = false;
    }
    return !wasRequested && didRequestSwitch;
  }

  function selectByOffset(offset: number): void {
    selectedIndex = clampSelectedIndex(selectedIndex + offset, tabs.length);
    renderSelection();
  }

  function shouldSuppressInitialShortcutAdvance(): boolean {
    return suppressInitialShortcutAdvanceUntilTriggerKeyup;
  }

  function advanceSelectionFromShortcut(offset: number): boolean {
    suppressInitialShortcutAdvanceUntilTriggerKeyup = false;
    selectByOffset(offset);
    return true;
  }

  host._lumnoTabSwitcherAdvance = function(offset?: unknown): boolean {
    return advanceSelectionFromShortcut(normalizeAdvanceOffset(offset));
  };
  host._lumnoTabSwitcherCommitFromShortcutRelease = function(): boolean {
    return clickSelectedCardFromShortcutRelease();
  };

  function handleExternalAdvance(event: Event): void {
    if (didRequestSwitch) {
      return;
    }
    const detail: unknown = 'detail' in event ? event.detail : null;
    advanceSelectionFromShortcut(normalizeAdvanceOffset(isRecord(detail) ? detail.offset : undefined));
  }

  function stopHandledKeyEvent(event: Event | null): void {
    if (!event) {
      return;
    }
    event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!event || event.isTrusted !== true) {
      return;
    }
    if (isTabSwitcherShortcutTriggerEvent(shortcut, event)) {
      stopHandledKeyEvent(event);
      // Only auto-repeat belongs to the press that opened the switcher; a
      // quick press can be released before the panel exists to see it.
      if (shouldSuppressInitialShortcutAdvance() && event.repeat === true &&
          isTabSwitcherCommitModifierPressed(shortcut, event)) {
        return;
      }
      suppressInitialShortcutAdvanceUntilTriggerKeyup = false;
      // Adding or dropping Shift relative to the opening shortcut reverses.
      const openedDirection = context.reverse ? -1 : 1;
      selectByOffset(event.shiftKey === shortcut.hasShift ? openedDirection : -openedDirection);
      return;
    }
    if (event.key === 'Tab') {
      stopHandledKeyEvent(event);
      selectByOffset(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      stopHandledKeyEvent(event);
      selectByOffset(1);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      stopHandledKeyEvent(event);
      selectByOffset(-1);
      return;
    }
    if (event.key === 'Enter') {
      stopHandledKeyEvent(event);
      switchToSelected();
      return;
    }
    if (event.key === 'Escape') {
      stopHandledKeyEvent(event);
      close();
    }
  }

  function handleKeyup(event: KeyboardEvent): void {
    if (!event || event.isTrusted !== true) {
      return;
    }
    if (isTabSwitcherShortcutTriggerEvent(shortcut, event)) {
      suppressInitialShortcutAdvanceUntilTriggerKeyup = false;
      stopHandledKeyEvent(event);
      return;
    }
    if (shortcut.commitModifierEventKey &&
        event.key === shortcut.commitModifierEventKey) {
      suppressInitialShortcutAdvanceUntilTriggerKeyup = false;
      stopHandledKeyEvent(event);
      clickSelectedCardFromShortcutRelease();
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    const path = event && typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = event.target;
    if (!path.includes(host) && !(target instanceof Node && panel.contains(target))) {
      close();
    }
  }

  host._lumnoTabSwitcherUpdateThumbnail = function(update: unknown): TabSwitcherReply {
    return view.updateThumbnail(readThumbnailUpdate(update));
  };
  getSwitcherMountParent(document).appendChild(host);
  showSwitcherHostInTopLayer(host);

  const switcherVisualViewport = window.visualViewport && typeof window.visualViewport.addEventListener === 'function'
    ? window.visualViewport
    : null;
  host._lumnoTabSwitcherCleanup = function() {
    window.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('keyup', handleKeyup, true);
    if (switcherVisualViewport && typeof switcherVisualViewport.removeEventListener === 'function') {
      switcherVisualViewport.removeEventListener('resize', syncSwitcherZoomCompensation);
      switcherVisualViewport.removeEventListener('scroll', syncSwitcherZoomCompensation);
    }
    document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener(TAB_SWITCHER_ADVANCE_EVENT, handleExternalAdvance, true);
    switcherThemeController.destroy();
    switcherToast.destroy();
    if (tabSwitcherReactView) {
      tabSwitcherReactView.destroy();
      tabSwitcherReactView = null;
    }
    delete host._lumnoTabSwitcherUpdateThumbnail;
    delete host._lumnoTabSwitcherCommitFromShortcutRelease;
  };
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('keyup', handleKeyup, true);
  if (switcherVisualViewport) {
    switcherVisualViewport.addEventListener('resize', syncSwitcherZoomCompensation, { passive: true });
    switcherVisualViewport.addEventListener('scroll', syncSwitcherZoomCompensation, { passive: true });
  }
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener(TAB_SWITCHER_ADVANCE_EVENT, handleExternalAdvance, true);

  renderSelection();
  return { ok: true };
}

export { toggleTabSwitcher };
