// The page context menu item that adds the page it was opened on to the
// New Tab shortcuts, saved the same way the New Tab saves one: browser sync
// first, this device's overflow record for whatever does not fit.
import * as LumnoSettings from '../domain/settings';
import * as LumnoSiteDisplayName from '../domain/site-display-name';
import { isRecord } from '../platform/storage-call';
import { createShortcutListStorage } from '../platform/shortcut-list-storage';
import type { ShortcutListStorage } from '../platform/shortcut-list-storage';
import type { SettingsStore } from '../platform/settings-store';
import type { LocaleMessage, PageShortcutResult } from '../domain/messages';
import { createInjectedAppRun } from '../platform/injection';
import type { PageShortcutToastCommand } from '../domain/injected-commands';
import { themeMode } from '../domain/settings/appearance';
import { language } from '../domain/settings/locale';
import { webdavStatus } from '../domain/settings/sync-state';
import type { ShortcutsStoreApi } from '../domain/shortcuts/api';
import { SHORTCUTS_STORE_API } from '../domain/shortcuts/api';
import type { ProviderStorageRuntime } from '../platform/settings-storage';

interface PageShortcutMenuOptions {
  chrome?: typeof chrome;
  // The worker's settings: the language, the theme the page toast follows,
  // and the WebDAV status.
  settingsStore: SettingsStore;
  shortcuts?: ShortcutsStoreApi;
  siteDisplayName?: typeof LumnoSiteDisplayName;
  provider: ProviderStorageRuntime;
  loadLocaleMessages?: (locale: string) => Promise<Record<string, LocaleMessage>>;
}

interface PageToShortcut {
  url: string;
  title: string;
}

type AddStatus = PageShortcutResult['status'];

interface AddResult {
  status: AddStatus;
  // The shortcut did not fit browser sync and stays on this device.
  localOnly?: boolean;
}

interface PageToast {
  message: string;
  error?: boolean;
  duration?: number;
}

interface PageShortcutMenu {
  start(): void;
  syncMenu(): Promise<void>;
  handleClick(info: chrome.contextMenus.OnClickData | null | undefined, tab: chrome.tabs.Tab | undefined): Promise<AddResult | null>;
  addTabPage(tab: chrome.tabs.Tab | null): Promise<PageShortcutResult>;
  showToast(tabId: unknown, toast: PageToast | null | undefined): Promise<boolean>;
}

const MENU_ITEM_ID = 'lumno-add-page-shortcut';
// Shortcuts hold http and https pages; browser pages never show the menu.
const DOCUMENT_URL_PATTERNS: readonly string[] = Object.freeze(['http://*/*', 'https://*/*']);
const MENU_TITLE_FALLBACK = 'Add to Lumno New Tab shortcuts';

interface PageShortcutMenuContext {
  readonly opts: PageShortcutMenuOptions;
  readonly chromeApi: typeof chrome;
  readonly settingsStore: SettingsStore;
  readonly store: ShortcutsStoreApi;
  readonly siteDisplayName: typeof LumnoSiteDisplayName;
  readonly provider: ProviderStorageRuntime;
  readonly shortcutList: ShortcutListStorage;
  readonly loadLocaleMessages: (locale: string) => Promise<Record<string, LocaleMessage>>;
  chain: Promise<unknown>;
}

function getLastError(ctx: PageShortcutMenuContext): chrome.runtime.LastError | null {
  return ctx.chromeApi.runtime && ctx.chromeApi.runtime.lastError ? ctx.chromeApi.runtime.lastError : null;
}

async function getMessages(ctx: PageShortcutMenuContext): Promise<Record<string, LocaleMessage>> {
  await ctx.settingsStore.ready;
  const mode = ctx.settingsStore.get(language);
  const uiLanguage = ctx.chromeApi.i18n && typeof ctx.chromeApi.i18n.getUILanguage === 'function'
    ? ctx.chromeApi.i18n.getUILanguage()
    : 'en';
  const locale = LumnoSettings.normalizeLocale(!mode || mode === 'system' ? uiLanguage : mode);
  return (await ctx.loadLocaleMessages(locale)) || {};
}

function translate(
  ctx: PageShortcutMenuContext,
  messages: Record<string, LocaleMessage>,
  key: string,
  fallback: string,
  params?: Record<string, string | number>
): string {
  const entry = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : null;
  let text = entry && entry.message ? String(entry.message) : fallback;
  Object.entries(params || {}).forEach(([token, value]) => {
    text = text.split(`{${token}}`).join(String(value));
  });
  return text;
}

// Context menu items outlive the worker, so this updates the item and
// creates it only when it is missing.
async function syncMenu(ctx: PageShortcutMenuContext): Promise<void> {
  const menus = ctx.chromeApi.contextMenus;
  if (!menus) return;
  const messages = await getMessages(ctx).catch((): Record<string, LocaleMessage> => ({}));
  const properties: { title: string; contexts: ['page']; documentUrlPatterns: string[] } = {
    title: translate(ctx, messages, 'context_menu_add_page_shortcut', MENU_TITLE_FALLBACK),
    contexts: ['page'],
    documentUrlPatterns: DOCUMENT_URL_PATTERNS.slice()
  };
  await new Promise<void>((resolve) => {
    menus.update(MENU_ITEM_ID, properties, () => {
      if (!getLastError(ctx)) {
        resolve();
        return;
      }
      menus.create({ id: MENU_ITEM_ID, ...properties }, () => {
        const error = getLastError(ctx);
        if (error) console.warn('[Lumno] Could not create the page shortcut menu item.', error.message);
        resolve();
      });
    });
  });
}

function getShortcutTitle(ctx: PageShortcutMenuContext, url: string, pageTitle: string, messages: Record<string, LocaleMessage>): string {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch (_error) {
    host = '';
  }
  const name = ctx.siteDisplayName.getSiteDisplayName(host, pageTitle, {
    getBrandName(brandHost: string, fallback: string): string {
      if (brandHost === 'mp.weixin.qq.com') return translate(ctx, messages, 'site_brand_wechat_official', fallback);
      if (brandHost === 'weibo.com') return translate(ctx, messages, 'site_search_name_weibo', fallback);
      return fallback;
    }
  });
  return name || pageTitle || host;
}

async function isWebDavSyncEnabled(ctx: PageShortcutMenuContext): Promise<boolean> {
  await ctx.settingsStore.ready;
  const status = ctx.settingsStore.get(webdavStatus);
  return isRecord(status) && status.enabled === true;
}

// Adds the page to the end of the last group, as the New Tab does for a
// site added from its context menus.
async function addPage(ctx: PageShortcutMenuContext, page: PageToShortcut, messages: Record<string, LocaleMessage>): Promise<AddResult> {
  const { state } = await ctx.shortcutList.read();
  const shortcut = ctx.store.createShortcutRecord({
    title: getShortcutTitle(ctx, page.url, page.title, messages),
    url: page.url
  });
  if (!shortcut) return { status: 'invalid' };
  const shortcutUrl = ctx.store.isShortcutFolder(shortcut) ? '' : shortcut.url;
  if (state.items.some((item) => !ctx.store.isShortcutFolder(item) && item.url === shortcutUrl)) return { status: 'exists' };
  if (state.items.length >= ctx.store.DEFAULT_MAX_SHORTCUTS) return { status: 'limit' };
  const groupId = state.groups.length ? state.groups[state.groups.length - 1].id : '';
  const nextState = {
    groups: state.groups,
    items: [...state.items, groupId ? { ...shortcut, groupId } : shortcut],
    migratedAt: state.migratedAt
  };
  const result = await ctx.shortcutList.write(nextState);
  return { status: 'added', localOnly: result.localOnlyIds.includes(shortcut.id) };
}

async function describeResult(ctx: PageShortcutMenuContext, result: AddResult, messages: Record<string, LocaleMessage>): Promise<PageToast> {
  if (result.status === 'exists') {
    return { message: translate(ctx, messages, 'newtab_shortcuts_already_added', 'Already in shortcuts') };
  }
  if (result.status === 'limit') {
    return {
      message: translate(ctx, messages, 'newtab_shortcuts_limit_reached', 'You can add up to {count} shortcuts.', {
        count: ctx.store.DEFAULT_MAX_SHORTCUTS
      }),
      error: true
    };
  }
  if (result.status !== 'added') {
    return { message: translate(ctx, messages, 'toast_error', 'Action failed. Try again.'), error: true };
  }
  // With WebDAV on, a shortcut past the browser's sync space still
  // reaches other devices, so there is nothing to warn about.
  if (result.localOnly && !(await isWebDavSyncEnabled(ctx))) {
    return {
      message: translate(ctx, 
        messages,
        'newtab_shortcuts_sync_limit_reached',
        'Shortcuts exceed the browser’s sync space, so new ones stay on this device. Turn on WebDAV in Settings to sync them too.'
      ),
      duration: 5200
    };
  }
  return { message: translate(ctx, messages, 'page_shortcut_added', 'Added to Lumno New Tab shortcuts') };
}

// Shows Lumno's top toast in a page. A page that does not take scripts (a
// store page, a PDF viewer) shows none; resolves to whether it showed.
async function showToast(ctx: PageShortcutMenuContext, tabId: unknown, toast: PageToast | null | undefined): Promise<boolean> {
  if (!ctx.chromeApi.scripting || typeof tabId !== 'number' || !toast || !toast.message) return false;
  await ctx.settingsStore.ready;
  const theme = ctx.settingsStore.get(themeMode);
  try {
    const command: PageShortcutToastCommand = {
      type: 'show',
      message: toast.message,
      error: toast.error === true,
      duration: toast.duration,
      themeMode: theme
    };
    const results = await ctx.chromeApi.scripting.executeScript(
      createInjectedAppRun(ctx.chromeApi.runtime, { tabId }, ['page-shortcut-toast'], command)
    );
    return Boolean(Array.isArray(results) && results[0] && results[0].result === true);
  } catch (_error) {
    return false;
  }
}

// One add at a time, so two quick adds both land. Resolves to the result
// and the message that describes it.
function enqueueAdd(ctx: PageShortcutMenuContext, page: PageToShortcut): Promise<{ result: AddResult; toast: PageToast }> {
  const job = ctx.chain.catch(() => {}).then(async () => {
    const messages = await getMessages(ctx).catch((): Record<string, LocaleMessage> => ({}));
    const result = await addPage(ctx, page, messages).catch((error: unknown): AddResult => {
      console.warn('[Lumno] Could not add the page to shortcuts.', error);
      return { status: 'failed' };
    });
    return { result, toast: await describeResult(ctx, result, messages) };
  });
  ctx.chain = job;
  return job;
}

function handleClick(ctx: PageShortcutMenuContext, info: chrome.contextMenus.OnClickData | null | undefined, tab: chrome.tabs.Tab | undefined): Promise<AddResult | null> {
  if (!info || info.menuItemId !== MENU_ITEM_ID) return Promise.resolve(null);
  const page = {
    url: String(info.pageUrl || (tab && tab.url) || ''),
    title: String((tab && tab.title) || '')
  };
  const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
  return enqueueAdd(ctx, page).then(async ({ result, toast }) => {
    await showToast(ctx, tabId, toast);
    return result;
  });
}

// From the toolbar popup: a page that was added (or already there) says so
// in the page's top toast; the popup shows failures itself.
function addTabPage(ctx: PageShortcutMenuContext, tab: chrome.tabs.Tab | null): Promise<PageShortcutResult> {
  const url = String((tab && tab.url) || '');
  if (!tab || !/^https?:\/\//i.test(url)) return Promise.resolve({ status: 'invalid', message: '', error: true, toastShown: false });
  return enqueueAdd(ctx, { url, title: String(tab.title || '') }).then(async ({ result, toast }): Promise<PageShortcutResult> => ({
    status: result.status,
    message: toast.message,
    error: toast.error === true,
    toastShown: toast.error === true ? false : await showToast(ctx, tab.id, toast)
  }));
}

function start(ctx: PageShortcutMenuContext): void {
  if (!ctx.chromeApi.contextMenus) return;
  ctx.chromeApi.contextMenus.onClicked.addListener((info, tab) => {
    handleClick(ctx, info, tab);
  });
  ctx.settingsStore.subscribe(language, () => {
    syncMenu(ctx).catch(() => {});
  });
  syncMenu(ctx).catch(() => {});
}

function createController(options: PageShortcutMenuOptions): PageShortcutMenu {
  const opts = options;
  const chromeApi = opts.chrome || globalThis.chrome;
  const settingsStore = opts.settingsStore;
  const store = opts.shortcuts || SHORTCUTS_STORE_API;
  const siteDisplayName = opts.siteDisplayName || LumnoSiteDisplayName;
  const provider = opts.provider;
  const shortcutList = createShortcutListStorage({ chromeApi, provider });
  const loadLocaleMessages: PageShortcutMenuContext['loadLocaleMessages'] = typeof opts.loadLocaleMessages === 'function'
    ? opts.loadLocaleMessages
    : () => Promise.resolve({});
  const ctx: PageShortcutMenuContext = {
    opts,
    chromeApi,
    settingsStore,
    store,
    siteDisplayName,
    provider,
    shortcutList,
    loadLocaleMessages,
    chain: Promise.resolve()
  };

  return { start: () => start(ctx), syncMenu: () => syncMenu(ctx), handleClick: (info: chrome.contextMenus.OnClickData | null | undefined, tab: chrome.tabs.Tab | undefined) => handleClick(ctx, info, tab), addTabPage: (tab: chrome.tabs.Tab | null) => addTabPage(ctx, tab), showToast: (tabId: unknown, toast: PageToast | null | undefined) => showToast(ctx, tabId, toast) };
}

export { MENU_ITEM_ID, DOCUMENT_URL_PATTERNS, createController };
export type { AddResult, PageShortcutMenu, PageShortcutMenuOptions, PageToast };
