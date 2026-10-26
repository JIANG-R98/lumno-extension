// The page context menu item that adds the page it was opened on to the
// New Tab shortcuts, saved the same way the New Tab saves one: browser sync
// first, this device's overflow record for whatever does not fit.
import * as LumnoNewtabShortcutsStore from '../domain/shortcuts-store';
import * as LumnoSettings from '../domain/settings';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import * as LumnoSiteDisplayName from '../domain/site-display-name';
import * as LumnoShortcutStorage from '../platform/shortcut-storage';
import { callStorage, isRecord } from '../platform/storage-call';
import type { ProviderStorageRuntime } from '../platform/settings-storage';
import type { LocaleMessage, PageShortcutResult } from '../domain/messages';
import type { StorageItems, StorageKeys } from '../domain/storage-port';
import { createInjectedAppRun } from '../platform/injection';
import type { PageShortcutToastCommand } from '../domain/injected-commands';
import * as NewtabShortcutSettings from '../domain/settings/newtab-shortcuts';

interface PageShortcutMenuOptions {
  chrome?: typeof chrome;
  settings?: typeof LumnoSettings;
  shortcuts?: typeof LumnoNewtabShortcutsStore;
  siteDisplayName?: typeof LumnoSiteDisplayName;
  provider?: ProviderStorageRuntime | null;
  loadLocaleMessages?: (locale: string) => Promise<Record<string, LocaleMessage>>;
  // The theme the page toast follows.
  themeStorageKey?: string;
}

// An area that reads like chrome.storage.
interface StorageReader {
  get(keys: StorageKeys, callback: (items: StorageItems | undefined) => void): unknown;
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

function createController(options?: PageShortcutMenuOptions | null): PageShortcutMenu {
  const opts = options || {};
  const chromeApi = opts.chrome || globalThis.chrome;
  const settings = opts.settings || LumnoSettings;
  const store = opts.shortcuts || LumnoNewtabShortcutsStore;
  const siteDisplayName = opts.siteDisplayName || LumnoSiteDisplayName;
  const provider = opts.provider || LumnoSettingsStorage.createProviderStorageRuntime(chromeApi);
  const loadLocaleMessages = typeof opts.loadLocaleMessages === 'function'
    ? opts.loadLocaleMessages
    : () => Promise.resolve({});
  const themeStorageKey = String(opts.themeStorageKey || '');
  const overflowKey = NewtabShortcutSettings.newtabShortcutsLocalOverflow.key;
  let chain: Promise<unknown> = Promise.resolve();

  function getLastError(): chrome.runtime.LastError | null {
    return chromeApi.runtime && chromeApi.runtime.lastError ? chromeApi.runtime.lastError : null;
  }

  // Reads keys from an area; rejects with the storage error.
  async function read(area: StorageReader, keys: StorageKeys): Promise<StorageItems> {
    const result = await callStorage(chromeApi, (done) => area.get(keys, done));
    return isRecord(result) ? result : {};
  }

  async function readProviderValue(key: string): Promise<unknown> {
    await provider.ready;
    const values = await read(provider.area, [key]).catch((): StorageItems => ({}));
    return values[key];
  }

  async function getMessages(): Promise<Record<string, LocaleMessage>> {
    const mode = await readProviderValue(settings.language.key);
    const uiLanguage = chromeApi.i18n && typeof chromeApi.i18n.getUILanguage === 'function'
      ? chromeApi.i18n.getUILanguage()
      : 'en';
    const locale = settings.normalizeLocale(!mode || mode === 'system' ? uiLanguage : mode);
    return (await loadLocaleMessages(locale)) || {};
  }

  function translate(
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
  async function syncMenu(): Promise<void> {
    const menus = chromeApi.contextMenus;
    if (!menus) return;
    const messages = await getMessages().catch((): Record<string, LocaleMessage> => ({}));
    const properties: { title: string; contexts: ['page']; documentUrlPatterns: string[] } = {
      title: translate(messages, 'context_menu_add_page_shortcut', MENU_TITLE_FALLBACK),
      contexts: ['page'],
      documentUrlPatterns: DOCUMENT_URL_PATTERNS.slice()
    };
    await new Promise<void>((resolve) => {
      menus.update(MENU_ITEM_ID, properties, () => {
        if (!getLastError()) {
          resolve();
          return;
        }
        menus.create({ id: MENU_ITEM_ID, ...properties }, () => {
          const error = getLastError();
          if (error) console.warn('[Lumno] Could not create the page shortcut menu item.', error.message);
          resolve();
        });
      });
    });
  }

  function getShortcutTitle(url: string, pageTitle: string, messages: Record<string, LocaleMessage>): string {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch (_error) {
      host = '';
    }
    const name = siteDisplayName.getSiteDisplayName(host, pageTitle, {
      getBrandName(brandHost: string, fallback: string): string {
        if (brandHost === 'mp.weixin.qq.com') return translate(messages, 'site_brand_wechat_official', fallback);
        if (brandHost === 'weibo.com') return translate(messages, 'site_search_name_weibo', fallback);
        return fallback;
      }
    });
    return name || pageTitle || host;
  }

  async function isWebDavSyncEnabled(): Promise<boolean> {
    const key = settings.webdavStatus.key;
    if (!key || !chromeApi.storage.local) return false;
    const values = await read(chromeApi.storage.local, [key]).catch((): StorageItems => ({}));
    const status = values[key];
    return isRecord(status) && status.enabled === true;
  }

  // Adds the page to the end of the last group, as the New Tab does for a
  // site added from its context menus.
  async function addPage(page: PageToShortcut, messages: Record<string, LocaleMessage>): Promise<AddResult> {
    await provider.ready;
    const sync = provider.getActiveAreaName() === 'sync';
    const values = await read(provider.area, store.SHORTCUT_STORAGE_KEYS.slice());
    const local = sync ? await read(chromeApi.storage.local, [overflowKey]) : {};
    const state = store.readShortcutState(values, local[overflowKey]);
    const shortcut = store.createShortcutRecord({
      title: getShortcutTitle(page.url, page.title, messages),
      url: page.url
    });
    if (!shortcut) return { status: 'invalid' };
    const shortcutUrl = store.isShortcutFolder(shortcut) ? '' : shortcut.url;
    if (state.items.some((item) => !store.isShortcutFolder(item) && item.url === shortcutUrl)) return { status: 'exists' };
    if (state.items.length >= store.DEFAULT_MAX_SHORTCUTS) return { status: 'limit' };
    const groupId = state.groups.length ? state.groups[state.groups.length - 1].id : '';
    const nextState = {
      groups: state.groups,
      items: [...state.items, groupId ? { ...shortcut, groupId } : shortcut],
      migratedAt: state.migratedAt
    };
    if (!sync) {
      await LumnoShortcutStorage.persistShortcutState(provider.area, nextState);
      return { status: 'added', localOnly: false };
    }
    const usage = store.measureShortcutSyncUsage(await read(chromeApi.storage.sync, null));
    const result = await LumnoShortcutStorage.persistShortcutState(chromeApi.storage.sync, nextState, {
      overflowArea: chromeApi.storage.local,
      maxTotalBytes: store.getShortcutSyncBudget({ ...usage, quotaBytes: chromeApi.storage.sync.QUOTA_BYTES }),
      legacyKeysPresent: usage.legacyBytes > 0,
      getLastError
    });
    return { status: 'added', localOnly: result.localOnlyIds.includes(shortcut.id) };
  }

  async function describeResult(result: AddResult, messages: Record<string, LocaleMessage>): Promise<PageToast> {
    if (result.status === 'exists') {
      return { message: translate(messages, 'newtab_shortcuts_already_added', 'Already in shortcuts') };
    }
    if (result.status === 'limit') {
      return {
        message: translate(messages, 'newtab_shortcuts_limit_reached', 'You can add up to {count} shortcuts.', {
          count: store.DEFAULT_MAX_SHORTCUTS
        }),
        error: true
      };
    }
    if (result.status !== 'added') {
      return { message: translate(messages, 'toast_error', 'Action failed. Try again.'), error: true };
    }
    // With WebDAV on, a shortcut past the browser's sync space still
    // reaches other devices, so there is nothing to warn about.
    if (result.localOnly && !(await isWebDavSyncEnabled())) {
      return {
        message: translate(
          messages,
          'newtab_shortcuts_sync_limit_reached',
          'Shortcuts exceed the browser’s sync space, so new ones stay on this device. Turn on WebDAV in Settings to sync them too.'
        ),
        duration: 5200
      };
    }
    return { message: translate(messages, 'page_shortcut_added', 'Added to Lumno New Tab shortcuts') };
  }

  // Shows Lumno's top toast in a page. A page that does not take scripts (a
  // store page, a PDF viewer) shows none; resolves to whether it showed.
  async function showToast(tabId: unknown, toast: PageToast | null | undefined): Promise<boolean> {
    if (!chromeApi.scripting || typeof tabId !== 'number' || !toast || !toast.message) return false;
    const themeMode = themeStorageKey ? await readProviderValue(themeStorageKey) : '';
    try {
      const command: PageShortcutToastCommand = {
        type: 'show',
        message: toast.message,
        error: toast.error === true,
        duration: toast.duration,
        themeMode: String(themeMode || 'system')
      };
      const results = await chromeApi.scripting.executeScript(
        createInjectedAppRun(chromeApi.runtime, { tabId }, ['page-shortcut-toast'], command)
      );
      return Boolean(Array.isArray(results) && results[0] && results[0].result === true);
    } catch (_error) {
      return false;
    }
  }

  // One add at a time, so two quick adds both land. Resolves to the result
  // and the message that describes it.
  function enqueueAdd(page: PageToShortcut): Promise<{ result: AddResult; toast: PageToast }> {
    const job = chain.catch(() => {}).then(async () => {
      const messages = await getMessages().catch((): Record<string, LocaleMessage> => ({}));
      const result = await addPage(page, messages).catch((error: unknown): AddResult => {
        console.warn('[Lumno] Could not add the page to shortcuts.', error);
        return { status: 'failed' };
      });
      return { result, toast: await describeResult(result, messages) };
    });
    chain = job;
    return job;
  }

  function handleClick(info: chrome.contextMenus.OnClickData | null | undefined, tab: chrome.tabs.Tab | undefined): Promise<AddResult | null> {
    if (!info || info.menuItemId !== MENU_ITEM_ID) return Promise.resolve(null);
    const page = {
      url: String(info.pageUrl || (tab && tab.url) || ''),
      title: String((tab && tab.title) || '')
    };
    const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
    return enqueueAdd(page).then(async ({ result, toast }) => {
      await showToast(tabId, toast);
      return result;
    });
  }

  // From the toolbar popup: a page that was added (or already there) says so
  // in the page's top toast; the popup shows failures itself.
  function addTabPage(tab: chrome.tabs.Tab | null): Promise<PageShortcutResult> {
    const url = String((tab && tab.url) || '');
    if (!tab || !/^https?:\/\//i.test(url)) return Promise.resolve({ status: 'invalid', message: '', error: true, toastShown: false });
    return enqueueAdd({ url, title: String(tab.title || '') }).then(async ({ result, toast }): Promise<PageShortcutResult> => ({
      status: result.status,
      message: toast.message,
      error: toast.error === true,
      toastShown: toast.error === true ? false : await showToast(tab.id, toast)
    }));
  }

  function start(): void {
    if (!chromeApi.contextMenus) return;
    chromeApi.contextMenus.onClicked.addListener((info, tab) => {
      handleClick(info, tab);
    });
    chromeApi.storage.onChanged.addListener((changes, area) => {
      if (changes[settings.localPrimary.key] ||
          (provider.isActiveAreaName(area) && changes[settings.language.key])) {
        syncMenu().catch(() => {});
      }
    });
    syncMenu().catch(() => {});
  }

  return { start, syncMenu, handleClick, addTabPage, showToast };
}

export { MENU_ITEM_ID, DOCUMENT_URL_PATTERNS, createController };
export type { AddResult, PageShortcutMenu, PageShortcutMenuOptions, PageToast };
