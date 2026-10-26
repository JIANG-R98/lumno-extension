// Opening the extension's own pages (settings, onboarding, the release
// notes, the browser's shortcut and bookmark managers).
import * as LumnoExtensionRoutes from '../domain/extension-routes';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import type { OpenDisposition } from '../domain/messages';
import type { StorageAreaLike } from '../domain/storage-port';
import { releasePageOpened } from '../domain/settings/features';

interface PageOpenOptions {
  disposition?: OpenDisposition;
  // The settings section to show.
  hash?: string;
  // Why the page opens ('install', 'update', 'manual', ...).
  reason?: string;
  // Open the release notes only once per version.
  oncePerVersion?: boolean;
}

type OpenCallback = (opened: boolean) => void;

// The release notes opened for a version, so they open once.
interface ReleasePageOpen {
  version: string;
  reason: string;
  openedAt: number;
}

// The options argument, or the callback when it comes first.
function readOpenArguments(
  options: PageOpenOptions | OpenCallback | null | undefined,
  callback: OpenCallback | null | undefined
): { openOptions: PageOpenOptions; done: OpenCallback } {
  if (typeof options === 'function') {
    return { openOptions: {}, done: options };
  }
  return { openOptions: options || {}, done: typeof callback === 'function' ? callback : () => {} };
}

const ONBOARDING_WEB_URL = 'https://lumno.kubai.design/onboarding/';
const ONBOARDING_ROUTE_PATH = 'src/onboarding/onboarding.html';
const ONBOARDING_UPDATE_MIGRATION_VERSION = 'v0.9.11';
const RELEASE_URL = 'https://lumno.kubai.design/release/';

function getChromeApi(): typeof chrome | null {
  return typeof chrome !== 'undefined' ? chrome : null;
}

function getExtensionDetailsUrl(): string {
  const chromeApi = getChromeApi();
  if (!chromeApi || !chromeApi.runtime || !chromeApi.runtime.id) {
    return 'chrome://extensions/';
  }
  return `chrome://extensions/?id=${encodeURIComponent(chromeApi.runtime.id)}`;
}

// Opens the settings page; a section (hash) or a background tab opens a
// new tab, otherwise the browser's own settings page entry is used.
function openExtensionOptionsPage(options?: PageOpenOptions | OpenCallback | null, callback?: OpenCallback | null): void {
  const chromeApi = getChromeApi();
  const { openOptions, done } = readOpenArguments(options, callback);
  const hash = typeof openOptions.hash === 'string' ? openOptions.hash.trim() : '';
  const active = openOptions.disposition !== 'backgroundTab';
  if (!chromeApi || !chromeApi.tabs || !chromeApi.runtime) {
    done(false);
    return;
  }
  const fallbackOpen = (): void => {
    const optionsUrl = LumnoExtensionRoutes.buildOptionsUrl(chromeApi, hash);
    chromeApi.tabs.create({ url: optionsUrl, active }, () => {
      done(!(chromeApi.runtime && chromeApi.runtime.lastError));
    });
  };

  if (hash || !active) {
    fallbackOpen();
    return;
  }

  if (typeof chromeApi.runtime.openOptionsPage !== 'function') {
    fallbackOpen();
    return;
  }

  chromeApi.runtime.openOptionsPage(() => {
    if (chromeApi.runtime && chromeApi.runtime.lastError) {
      fallbackOpen();
      return;
    }
    done(true);
  });
}

function openSiteSearchOptionsPage(options?: PageOpenOptions | OpenCallback | null, callback?: OpenCallback | null): void {
  const { openOptions, done } = readOpenArguments(options, callback);
  openExtensionOptionsPage({ ...openOptions, hash: 'shortcuts' }, done);
}

function buildExtensionPageUrl(path: string): string {
  return LumnoExtensionRoutes.buildExtensionUrl(getChromeApi(), path);
}

function buildOnboardingUrl(options?: PageOpenOptions | null): string {
  const params = new URLSearchParams();
  params.set('entry', 'ext');
  const reason = options && typeof options.reason === 'string'
    ? String(options.reason).trim().toLowerCase()
    : '';
  if (reason) {
    params.set('reason', reason);
  }
  const version = getExtensionVersionTag();
  if (version) {
    params.set('version', version);
  }
  const url = new URL(
    buildExtensionPageUrl(ONBOARDING_ROUTE_PATH),
    'chrome-extension://lumno/'
  );
  params.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function openOnboardingPage(options?: PageOpenOptions | OpenCallback | null, callback?: OpenCallback | null): void {
  const chromeApi = getChromeApi();
  const { openOptions, done } = readOpenArguments(options, callback);
  if (!chromeApi || !chromeApi.tabs) {
    done(false);
    return;
  }
  chromeApi.tabs.create({
    url: buildOnboardingUrl(openOptions),
    active: openOptions.disposition !== 'backgroundTab'
  }, () => {
    done(!(chromeApi.runtime && chromeApi.runtime.lastError));
  });
}

function normalizeExtensionVersionTag(value: unknown): string {
  const version = String(value || '').trim();
  if (!version) {
    return '';
  }
  return /^v/i.test(version) ? `v${version.slice(1)}` : `v${version}`;
}

// The update that introduced onboarding shows it once.
function shouldOpenOnboardingForUpdate(
  details: { reason?: string; previousVersion?: string } | null | undefined,
  currentVersion?: string
): boolean {
  const reason = details && typeof details.reason === 'string'
    ? String(details.reason).trim().toLowerCase()
    : '';
  if (reason !== 'update') {
    return false;
  }
  const version = normalizeExtensionVersionTag(currentVersion || getExtensionVersionTag());
  if (version !== ONBOARDING_UPDATE_MIGRATION_VERSION) {
    return false;
  }
  const previousVersion = normalizeExtensionVersionTag(details && details.previousVersion);
  return previousVersion !== ONBOARDING_UPDATE_MIGRATION_VERSION;
}

function getExtensionVersionTag(): string {
  const chromeApi = getChromeApi();
  const manifest = chromeApi && chromeApi.runtime && chromeApi.runtime.getManifest
    ? chromeApi.runtime.getManifest()
    : null;
  return normalizeExtensionVersionTag(manifest ? String(manifest.version || '').trim() : '');
}

function getLocalStorageArea(chromeApi: typeof chrome): StorageAreaLike | null {
  return chromeApi && chromeApi.storage && chromeApi.storage.local
    ? chromeApi.storage.local
    : null;
}

function getSyncableStorageArea(chromeApi: typeof chrome): StorageAreaLike | null {
  if (!chromeApi || !chromeApi.storage) {
    return null;
  }
  return LumnoSettingsStorage.createProviderStorageRuntime(chromeApi).area;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getStoredReleasePageOpen(payload: unknown): ReleasePageOpen | null {
  if (!isRecord(payload)) {
    return null;
  }
  const version = typeof payload.version === 'string' ? payload.version.trim() : '';
  if (!version) {
    return null;
  }
  return {
    version,
    reason: typeof payload.reason === 'string' ? payload.reason : '',
    openedAt: Number(payload.openedAt) || 0
  };
}

function getReleaseOpenReason(options: PageOpenOptions | null | undefined): string {
  return options && typeof options.reason === 'string'
    ? String(options.reason).trim().toLowerCase()
    : '';
}

function buildReleaseUrl(options?: PageOpenOptions | null): string {
  const params = new URLSearchParams();
  params.set('entry', 'ext');
  const reason = options && typeof options.reason === 'string' ? String(options.reason).trim().toLowerCase() : '';
  if (reason) {
    params.set('reason', reason);
  }
  const version = getExtensionVersionTag();
  if (version) {
    params.set('version', version);
  }
  return `${RELEASE_URL}?${params.toString()}`;
}

function openReleasePage(options?: PageOpenOptions | null, callback?: OpenCallback | null): void {
  const chromeApi = getChromeApi();
  const done = typeof callback === 'function' ? callback : () => {};
  if (!chromeApi || !chromeApi.tabs) {
    done(false);
    return;
  }
  const releaseUrl = buildReleaseUrl(options);
  const active = !(options && options.disposition === 'backgroundTab');
  const oncePerVersion = Boolean(options && options.oncePerVersion);
  const version = getExtensionVersionTag();
  const storageArea = getSyncableStorageArea(chromeApi);
  const localStorageArea = getLocalStorageArea(chromeApi);
  const openTab = (afterOpen: (() => void) | null): void => {
    chromeApi.tabs.create({ url: releaseUrl, active }, () => {
      const opened = !(chromeApi.runtime && chromeApi.runtime.lastError);
      if (opened && typeof afterOpen === 'function') {
        afterOpen();
      }
      done(opened);
    });
  };
  const markOpened = (): void => {
    if (!storageArea || !version) {
      return;
    }
    try {
      storageArea.set({
        [releasePageOpened.key]: {
          version,
          reason: getReleaseOpenReason(options),
          openedAt: Date.now()
        }
      }, () => {});
    } catch (_error) {
      // A failed marker should not block the user from seeing the release page.
    }
  };

  if (!oncePerVersion || !version || !storageArea) {
    openTab(oncePerVersion ? markOpened : null);
    return;
  }
  try {
    storageArea.get([releasePageOpened.key], (result) => {
      const runtimeError = chromeApi.runtime ? chromeApi.runtime.lastError : null;
      const stored = runtimeError
        ? null
        : getStoredReleasePageOpen(result && result[releasePageOpened.key]);
      if (stored && stored.version === version) {
        done(false);
        return;
      }
      if (storageArea !== localStorageArea && localStorageArea) {
        localStorageArea.get([releasePageOpened.key], (localResult) => {
          const localRuntimeError = chromeApi.runtime ? chromeApi.runtime.lastError : null;
          const legacyStored = localRuntimeError
            ? null
            : getStoredReleasePageOpen(localResult && localResult[releasePageOpened.key]);
          if (legacyStored && legacyStored.version === version) {
            markOpened();
            done(false);
            return;
          }
          openTab(markOpened);
        });
        return;
      }
      openTab(markOpened);
    });
  } catch (_error) {
    openTab(markOpened);
  }
}

// The bookmark manager addresses of this browser, best first.
function getBookmarkManagerUrls(): string[] {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent)
    ? String(navigator.userAgent).toLowerCase()
    : '';
  const candidates: string[] = [];
  const pushUnique = (url: string): void => {
    const value = String(url || '').trim();
    if (!value || candidates.includes(value)) {
      return;
    }
    candidates.push(value);
  };

  if (ua.includes('firefox/')) {
    pushUnique('about:bookmarks');
    pushUnique('chrome://bookmarks/');
    return candidates;
  }
  if (ua.includes('edg/')) {
    pushUnique('edge://favorites/');
    pushUnique('edge://bookmarks/');
  } else if (ua.includes('vivaldi/')) {
    pushUnique('vivaldi://bookmarks/');
  } else if (ua.includes('opr/') || ua.includes('opera')) {
    pushUnique('opera://bookmarks/');
  } else if (ua.includes('brave/')) {
    pushUnique('brave://bookmarks/');
  }
  pushUnique('chrome://bookmarks/');
  return candidates;
}

// Resolves with the address that opened.
function openBookmarkManagerPage(): Promise<string> {
  const chromeApi = getChromeApi();
  const urls = getBookmarkManagerUrls();
  return new Promise((resolve, reject) => {
    if (!chromeApi || !chromeApi.tabs) {
      reject(new Error('tabs-api-unavailable'));
      return;
    }
    const tryOpen = (index: number): void => {
      if (index >= urls.length) {
        reject(new Error('no-bookmark-manager-url'));
        return;
      }
      const targetUrl = urls[index];
      chromeApi.tabs.create({ url: targetUrl }, () => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          tryOpen(index + 1);
          return;
        }
        resolve(targetUrl);
      });
    };
    tryOpen(0);
  });
}

function openExtensionShortcutsPage(options?: PageOpenOptions | OpenCallback | null, callback?: OpenCallback | null): void {
  const chromeApi = getChromeApi();
  const { openOptions, done } = readOpenArguments(options, callback);
  // Firefox cannot open about:addons from an extension; it offers this
  // dedicated API for its shortcut manager instead.
  const commands = chromeApi && chromeApi.commands;
  const openShortcutSettings: unknown = commands && 'openShortcutSettings' in commands ? commands.openShortcutSettings : null;
  if (commands && typeof openShortcutSettings === 'function') {
    Promise.resolve()
      .then(() => openShortcutSettings.call(commands))
      .then(() => done(true), () => done(false));
    return;
  }
  if (!chromeApi || !chromeApi.tabs) {
    done(false);
    return;
  }
  chromeApi.tabs.create({
    url: 'chrome://extensions/shortcuts',
    active: openOptions.disposition !== 'backgroundTab'
  }, () => {
    done(!(chromeApi.runtime && chromeApi.runtime.lastError));
  });
}

export {
  buildReleaseUrl,
  buildOnboardingUrl,
  shouldOpenOnboardingForUpdate,
  ONBOARDING_WEB_URL,
  ONBOARDING_UPDATE_MIGRATION_VERSION,
  ONBOARDING_ROUTE_PATH,
  getBookmarkManagerUrls,
  getExtensionDetailsUrl,
  getExtensionVersionTag,
  openBookmarkManagerPage,
  openExtensionOptionsPage,
  openExtensionShortcutsPage,
  openSiteSearchOptionsPage,
  openOnboardingPage,
  openReleasePage
};
export type { OpenCallback, PageOpenOptions, ReleasePageOpen };
