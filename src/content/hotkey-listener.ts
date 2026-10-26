// Answers the copy-page-URL command: copies the address and confirms it
// with a toast in the page, in the chosen language and the page's theme.
import * as PAGE_COLOR_SCHEME from '../shared/page-color-scheme';
import type { PageTheme } from '../shared/page-color-scheme';
import * as AppearanceSettings from '../domain/settings/appearance';
import * as LocaleSettings from '../domain/settings/locale';
import { readStartCommand } from '../domain/injected-commands';
import type { LocaleMessage, PageReply } from '../domain/messages';
import { createSettingsStore } from '../platform/settings-store';
import type { SettingsStore } from '../platform/settings-store';
import * as LumnoMessaging from '../platform/messaging';

type ToastMessages = Record<string, LocaleMessage>;

interface PageToastParts {
  host: HTMLElement;
  toast: HTMLElement;
  text: HTMLElement;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

(function() {
  // The background imports this module on the first copy-URL command in a
  // tab (src/platform/injection.ts); the browser keeps one instance per page
  // and extension context, so it listens once.
  const PAGE_TOAST_ID = '_x_extension_page_toast_2026_unique_';
  const PAGE_TOAST_FONT_FACE_STYLE_ID = '_x_extension_page_toast_font_face_2026_unique_';
  const PAGE_TOAST_SHOW_DURATION_MS = 2000;
  const PAGE_TOAST_MESSAGE_KEYS = Object.freeze([
    'copy_page_url_failed_retry',
    'copy_page_url_success',
    'copy_page_url_failed_permission'
  ]);
  // Made on the first toast: most pages never show one.
  let settingsStore: SettingsStore | null = null;
  let pageToastTimer: number | null = null;
  let pageToastParts: PageToastParts | null = null;
  // Toast strings by locale, fetched only when a toast in a user-chosen
  // language is first shown. chrome.i18n already serves the browser language.
  const toastMessagesByLocale = new Map<string, ToastMessages>();

  function applyNoTranslate<T extends Element>(element: T): T {
    element.setAttribute('translate', 'no');
    element.setAttribute('lang', 'zxx');
    element.setAttribute('notranslate', '');
    element.setAttribute('data-no-translate', 'true');
    element.classList.add('notranslate');
    return element;
  }

  function getMessage(messages: ToastMessages | null, key: string, fallback: string): string {
    const entry = messages && Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : null;
    if (entry && entry.message) {
      return entry.message;
    }
    try {
      if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
        const value = chrome.i18n.getMessage(key);
        if (value) {
          return value;
        }
      }
    } catch (_error) {
      // Ignore i18n failures in page context.
    }
    return fallback;
  }

  // Resolves 'system' when the setting is unset or storage is unavailable.
  async function readStoredMode(setting: typeof LocaleSettings.language | typeof AppearanceSettings.themeMode): Promise<string> {
    try {
      if (!settingsStore) {
        settingsStore = createSettingsStore({
          chromeApi: chrome,
          settings: [LocaleSettings.language, AppearanceSettings.themeMode]
        });
      }
      await settingsStore.ready;
      return settingsStore.get(setting);
    } catch (_error) {
      return 'system';
    }
  }

  function readLanguageMode(): Promise<string> {
    return readStoredMode(LocaleSettings.language);
  }

  // Like the tab switcher: the page's own light or dark look first, then the
  // Lumno theme setting, then the system.
  function resolvePageToastTheme(): Promise<PageTheme> {
    const pageTheme = PAGE_COLOR_SCHEME.detectPageTheme(document, window);
    if (pageTheme) {
      return Promise.resolve(pageTheme);
    }
    return readStoredMode(AppearanceSettings.themeMode).then((mode): PageTheme => {
      const normalized = String(mode || '').trim().toLowerCase();
      if (normalized === 'dark' || normalized === 'light') {
        return normalized;
      }
      return typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    });
  }

  function requestToastMessages(locale: string): Promise<ToastMessages | null> {
    return new Promise((resolve) => {
      try {
        LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
          action: 'getLocaleMessages',
          locale,
          keys: PAGE_TOAST_MESSAGE_KEYS.slice()
        }, (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response && response.messages ? response.messages : null);
        });
      } catch (_error) {
        resolve(null);
      }
    });
  }

  function loadToastMessages(): Promise<ToastMessages | null> {
    return readLanguageMode().then((languageMode) => {
      if (!languageMode || languageMode === 'system') {
        return null;
      }
      const locale = LocaleSettings.normalizeLocale(languageMode);
      const cached = toastMessagesByLocale.get(locale);
      if (cached) {
        return cached;
      }
      return requestToastMessages(locale).then((messages) => {
        if (messages) {
          toastMessagesByLocale.set(locale, messages);
        }
        return messages;
      });
    });
  }

  const PAGE_TOAST_STYLES = `
    .toast {
      position: fixed;
      top: max(24px, calc(env(safe-area-inset-top) + 12px));
      left: 50%;
      transform: translateX(-50%) translateY(-18px) scale(0.96);
      box-sizing: border-box;
      background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
      color: #1f2937;
      border: 1px solid rgba(214, 219, 227, 0.95);
      padding: 10px 16px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.35;
      max-width: min(560px, calc(100vw - 32px));
      box-shadow: 0 16px 36px rgba(17, 24, 39, 0.08), 0 3px 10px rgba(17, 24, 39, 0.05);
      opacity: 0;
      filter: blur(8px);
      pointer-events: none;
      transition: opacity 180ms ease, filter 220ms ease, transform 220ms ease;
      z-index: 2147483647;
      display: inline-flex;
      isolation: isolate;
      justify-content: center;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    /* The shared Toast's surfaces (src/shared/ui/toast.css): solid, light or dark with the page. */
    .toast[data-theme="dark"] {
      background: linear-gradient(180deg, #111827 0%, #0f172a 100%);
      color: #f8fafc;
      border-color: rgba(255, 255, 255, 0.2);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.45);
    }
    .toast[data-tone="error"] {
      background: #991b1b;
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.16);
    }
    .toast::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: -40%;
      width: 40%;
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0),
        rgba(255, 255, 255, 0.26),
        rgba(255, 255, 255, 0)
      );
      opacity: 0;
      transform: translateX(0);
      pointer-events: none;
    }
    .toast[data-show="true"] {
      opacity: 1;
      filter: blur(0);
      transform: translateX(-50%) translateY(0) scale(1);
    }
    .toast[data-show="true"]::after {
      animation: toast-sheen 900ms ease-out 120ms 1 both;
    }
    @keyframes toast-sheen {
      0% {
        opacity: 0;
        transform: translateX(0);
      }
      24% {
        opacity: 0.5;
      }
      100% {
        opacity: 0;
        transform: translateX(360%);
      }
    }
    .toast-icon {
      flex: 0 0 auto;
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 0;
      font-family: "lumno-remixicon";
      font-size: 16px;
      font-style: normal;
      line-height: 1;
      -webkit-font-smoothing: antialiased;
      transform: translateX(0);
    }
    .toast-icon::before {
      content: "\\f0f6";
    }
    .toast-text {
      display: inline-block;
      margin: 0;
      padding: 0;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transform: translateX(0);
    }
    .toast[data-show="true"] .toast-icon {
      animation: toast-icon-gather 320ms cubic-bezier(0.22, 1, 0.36, 1) 220ms 1 both;
    }
    .toast[data-show="true"] .toast-text {
      animation: toast-text-gather 320ms cubic-bezier(0.22, 1, 0.36, 1) 220ms 1 both;
    }
    @keyframes toast-icon-gather {
      0% {
        transform: translateX(-6px);
      }
      100% {
        transform: translateX(0);
      }
    }
    @keyframes toast-text-gather {
      0% {
        transform: translateX(6px);
      }
      100% {
        transform: translateX(0);
      }
    }
  `;

  // Chrome ignores @font-face inside shadow roots, so the icon face alone is
  // declared on the page, under a Lumno-only family name. Linking
  // remixicon.css instead would let its "[class^=ri-]" rule restyle the page's
  // own elements; the toast draws its one glyph inside its shadow root.
  function ensurePageToastFontFace(): void {
    const host = document.head || document.documentElement;
    if (!host || document.getElementById(PAGE_TOAST_FONT_FACE_STYLE_ID) ||
        !chrome || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
      return;
    }
    const fontUrl = String(chrome.runtime.getURL('assets/remixicon/fonts/remixicon.woff2'))
      .replace(/["\\\n\r\f]/g, '\\$&');
    const style = document.createElement('style');
    style.id = PAGE_TOAST_FONT_FACE_STYLE_ID;
    style.textContent = [
      '@font-face {',
      '  font-family: "lumno-remixicon";',
      `  src: url("${fontUrl}") format("woff2");`,
      '  font-display: swap;',
      '}'
    ].join('\n');
    host.appendChild(style);
  }

  function ensurePageToast(): PageToastParts | null {
    if (pageToastParts && pageToastParts.host.isConnected) {
      return pageToastParts;
    }
    const root = document.documentElement || document.body;
    if (!root) {
      return null;
    }
    ensurePageToastFontFace();
    const host = document.createElement('div');
    host.id = PAGE_TOAST_ID;
    const hostStyles: Array<[property: string, value: string]> = [
      ['all', 'initial'],
      ['position', 'fixed'],
      ['top', '0'],
      ['left', '0'],
      ['width', '0'],
      ['height', '0'],
      ['z-index', '2147483647']
    ];
    hostStyles.forEach(([property, value]) => {
      host.style.setProperty(property, value, 'important');
    });
    applyNoTranslate(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = PAGE_TOAST_STYLES;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('role', 'status');
    toast.setAttribute('data-show', 'false');
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'toast-text';
    toast.appendChild(icon);
    toast.appendChild(text);
    shadow.appendChild(style);
    shadow.appendChild(toast);
    root.appendChild(host);
    pageToastParts = { host, toast, text };
    return pageToastParts;
  }

  function showPageToast(message: string, isError: boolean, theme: PageTheme): void {
    const parts = ensurePageToast();
    if (!parts) {
      return;
    }
    const { toast, text } = parts;
    if (pageToastTimer) {
      window.clearTimeout(pageToastTimer);
      pageToastTimer = null;
    }
    text.textContent = String(message || '');
    if (theme === 'dark') {
      toast.setAttribute('data-theme', 'dark');
    } else {
      toast.removeAttribute('data-theme');
    }
    if (isError) {
      toast.setAttribute('data-tone', 'error');
    } else {
      toast.removeAttribute('data-tone');
    }
    toast.setAttribute('data-show', 'false');
    void toast.offsetWidth;
    toast.setAttribute('data-show', 'true');
    pageToastTimer = window.setTimeout(() => {
      toast.setAttribute('data-show', 'false');
      pageToastTimer = null;
    }, PAGE_TOAST_SHOW_DURATION_MS);
  }

  function showLocalizedPageToast(pickMessage: (messages: ToastMessages | null) => string, isError: boolean): Promise<void> {
    return Promise.all([
      loadToastMessages().catch(() => null),
      resolvePageToastTheme().catch((): PageTheme => 'light')
    ]).then(([messages, theme]) => {
      showPageToast(pickMessage(messages), isError, theme);
    });
  }

  function fallbackCopyText(text: string): boolean {
    const value = String(text || '');
    if (!value || !document.body) {
      return false;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_error) {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
  }

  async function copyCurrentPageUrl(): Promise<'copied' | 'failed-retry' | 'failed-permission'> {
    const url = location && location.href ? location.href : '';
    if (!url) {
      return 'failed-retry';
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
      } else if (!fallbackCopyText(url)) {
        throw new Error('fallback-copy-failed');
      }
      return 'copied';
    } catch (_error) {
      return fallbackCopyText(url) ? 'copied' : 'failed-permission';
    }
  }

  // The copy runs first, while the page still holds the command's focus; the
  // toast strings are resolved afterwards.
  async function copyCurrentPageUrlWithToast(): Promise<boolean> {
    const result = await copyCurrentPageUrl();
    if (result === 'copied') {
      await showLocalizedPageToast((messages) => getMessage(messages, 'copy_page_url_success', '已复制当前页面链接'), false);
      return true;
    }
    if (result === 'failed-retry') {
      await showLocalizedPageToast((messages) => getMessage(messages, 'copy_page_url_failed_retry', '复制失败，请重试。'), true);
      return false;
    }
    await showLocalizedPageToast((messages) => getMessage(messages, 'copy_page_url_failed_permission', '复制失败，请检查剪贴板权限。'), true);
    return false;
  }

  // This script only answers the copy-URL command: the search shortcut lives in
  // shortcut-key-observer.js and switcher thumbnails follow the browser's own
  // tab events, so nothing here messages the background on its own.
  const runtimeMessageListener = (
    request: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (reply: PageReply<'copyCurrentPageUrlFromCommand'>) => void
  ): boolean | void => {
    if (!isRecord(request) || request.action !== 'copyCurrentPageUrlFromCommand') {
      return;
    }
    copyCurrentPageUrlWithToast().then((ok) => {
      sendResponse({ ok: Boolean(ok) });
    }).catch(() => {
      sendResponse({ ok: false });
    });
    return true;
  };
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(runtimeMessageListener);
  }
})();

// Confirms the listener is in place.
function run(command: unknown): { ok: boolean; reason?: string } {
  return readStartCommand(command) ? { ok: true } : { ok: false, reason: 'invalid-command' };
}

export { run };
