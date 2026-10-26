import { readLocaleMessages } from '../domain/locale-messages';
import type { LocaleMessage } from '../domain/messages';
import * as LumnoMessaging from '../platform/messaging';
import type { MessageRuntime } from '../platform/messaging';

// What the overlay needs of the chrome API to find its own files.
interface RuntimeUrlApi {
  runtime?: { getURL?(path: string): string } | null;
}

interface LocaleMessagesOptions {
  chromeApi: { runtime?: (MessageRuntime & { getURL?(path: string): string }) | null } | null;
  locale: unknown;
  normalizeLocale?(locale: unknown): string;
}


function getRuntimeUrl(chromeApi: RuntimeUrlApi | null, path: string): string {
  const runtime = chromeApi ? chromeApi.runtime : null;
  return runtime && typeof runtime.getURL === 'function'
    ? runtime.getURL(path)
    : path;
}

function isInjectedBrowserExtensionProtocol(protocol: string): boolean {
  const normalized = String(protocol || '').toLowerCase();
  return normalized === 'chrome-extension:' ||
    normalized === 'moz-extension:' ||
    normalized === 'ms-browser-extension:';
}

// An extension address on the "invalid" host: the extension was reloaded
// and this page's copy of it can no longer reach its own files.
function isInvalidExtensionResourceUrl(url: string): boolean {
  if (!url) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return isInjectedBrowserExtensionProtocol(parsed.protocol) &&
      String(parsed.hostname || '').toLowerCase() === 'invalid';
  } catch (_error) {
    return false;
  }
}

// A locale's messages from its file, or through the worker when this page's
// copy of the extension can no longer fetch its files; {} when neither works.
function loadLocaleMessages(options: LocaleMessagesOptions): Promise<Record<string, LocaleMessage>> {
  const chromeApi = options.chromeApi;
  const locale = typeof options.normalizeLocale === 'function'
    ? options.normalizeLocale(options.locale)
    : String(options.locale || 'en');
  const runtime = chromeApi ? chromeApi.runtime : null;
  if (!chromeApi || !runtime || typeof runtime.getURL !== 'function') {
    return Promise.resolve({});
  }
  const loadViaMessage = (): Promise<Record<string, LocaleMessage>> => new Promise((resolve) => {
    if (typeof runtime.sendMessage !== 'function') {
      resolve({});
      return;
    }
    try {
      LumnoMessaging.sendBackgroundMessage(runtime, { action: 'getLocaleMessages', locale }, (response) => {
        resolve((response && response.messages) || {});
      });
    } catch (_error) {
      resolve({});
    }
  });
  const localePath = getRuntimeUrl(chromeApi, `_locales/${locale}/messages.json`);
  if (isInvalidExtensionResourceUrl(localePath)) {
    return loadViaMessage();
  }
  return fetch(localePath, { cache: 'no-store' })
    .then((response) => response.json())
    .then((value: unknown) => readLocaleMessages(value))
    .catch(loadViaMessage);
}

export {
  getRuntimeUrl,
  isInjectedBrowserExtensionProtocol,
  loadLocaleMessages
};
export type { LocaleMessagesOptions, RuntimeUrlApi };
