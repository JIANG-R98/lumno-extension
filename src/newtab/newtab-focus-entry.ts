// Routes a New Tab to the focus route, where the search box can take
// keyboard focus from the address bar, when input auto-focus is on.
import * as LumnoSettings from '../domain/settings';
import * as LumnoNewtabFocusResume from './focus-resume';
import * as LumnoMessaging from '../platform/messaging';
import { newtabInputAutoFocusEnabled } from '../domain/settings/newtab-page';
import * as ProviderStorage from '../platform/provider-storage';
import * as SettingsStorage from '../platform/settings-storage';

(function() {
  const locationUrl = new URL(window.location.href);
  // Firefox marks its swapped-in tab with #focus (see swapNewtabForFocus).
  if (locationUrl.searchParams.get('focus') === '1' || locationUrl.hash === '#focus') {
    const documentElement = document.documentElement;
    if (documentElement) {
      documentElement.setAttribute('data-nt-focus-route', 'true');
      // When the search shortcut reloaded the page, keep the old frame up
      // until the search it carries is back on screen.
      const focusResume = LumnoNewtabFocusResume;
      if (focusResume) {
        focusResume.prepareResumeLoad();
      }
    }
    return;
  }

  const documentElement = document.documentElement;
  if (documentElement) {
    documentElement.setAttribute('data-nt-focus-route-pending', 'true');
  }

  const settings = LumnoSettings;
  const storageKey = settings.newtabInputAutoFocusEnabled.key ||
    newtabInputAutoFocusEnabled.key;
  const normalizeEnabled = settings.newtabInputAutoFocusEnabled.parse;
  const chromeApi = window.chrome || null;

  function revealPage(): void {
    if (documentElement) {
      documentElement.removeAttribute('data-nt-focus-route-pending');
    }
  }

  // Firefox keeps URL-bar focus through same-tab navigation on the New Tab
  // page, so the background swaps in a fresh #focus tab instead. Wait until
  // shown: Firefox preloads this page hidden before it becomes a tab.
  function swapTabWhenVisible(): void {
    const requestSwap = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      document.removeEventListener('visibilitychange', requestSwap);
      if (!chromeApi) {
        revealPage();
        return;
      }
      try {
        LumnoMessaging.sendBackgroundMessage(chromeApi.runtime, { action: 'swapNewtabForFocus' }, (response) => {
          if (chromeApi.runtime.lastError || !response || !response.ok || !response.removed) {
            revealPage();
          }
        });
      } catch {
        revealPage();
      }
    };
    document.addEventListener('visibilitychange', requestSwap);
    requestSwap();
  }

  function redirectToFocusRoute(): void {
    if (locationUrl.protocol === 'moz-extension:') {
      swapTabWhenVisible();
      return;
    }
    locationUrl.searchParams.set('focus', '1');
    window.location.replace(locationUrl.href);
  }

  function settle(enabled: unknown): void {
    SettingsStorage.cacheNewtabInputAutoFocusEnabled(enabled);
    if (!normalizeEnabled(enabled)) {
      revealPage();
      return;
    }
    redirectToFocusRoute();
  }

  // The choice the last New Tab saw routes this one at once, before the page loads any further. The
  // focused page reads storage and corrects the copy if the setting changed on another device.
  let cachedEnabled: string | null = null;
  try {
    cachedEnabled = window.localStorage
      ? window.localStorage.getItem(settings.newtabInputAutoFocusCache.key)
      : null;
  } catch {
    cachedEnabled = null;
  }
  if (cachedEnabled === 'true') {
    redirectToFocusRoute();
    return;
  }

  const providerRuntime = ProviderStorage.createProviderStorageRuntime(chromeApi);
  const storage = providerRuntime.area;
  if (!storage || typeof storage.get !== 'function') {
    settle(false);
    return;
  }

  try {
    void storage.get([storageKey], (result) => {
      settle(result && result[storageKey]);
    });
  } catch {
    settle(false);
  }
})();
