// The switcher's light or dark theme while it is open: the page's own theme
// first, then the Lumno setting, then the system's. Under the system
// setting it follows the page's theme attributes and the system's
// preference as they change.
import * as PAGE_COLOR_SCHEME from '../page-color-scheme';
import { getContextSettingsStore } from '../../platform/settings-store';
import type { TabSwitcherViewController } from '../react/tab-switcher';
import { themeMode } from '../../domain/settings/appearance';

type SwitcherTheme = 'dark' | 'light';
type SwitcherThemeMode = SwitcherTheme | 'system';

// The attributes pages switch their theme with.
const THEME_ATTRIBUTES = [
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

const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
const systemDarkQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

function normalizeThemeMode(mode: unknown): SwitcherThemeMode {
  const value = String(mode || '').trim().toLowerCase();
  return value === 'dark' || value === 'light' ? value : 'system';
}

function resolveSwitcherTheme(mode: SwitcherThemeMode): SwitcherTheme {
  const pageTheme = PAGE_COLOR_SCHEME.detectPageTheme(document, window);
  if (pageTheme) {
    return pageTheme;
  }
  if (mode !== 'system') {
    return mode;
  }
  return systemDarkQuery && systemDarkQuery.matches ? 'dark' : 'light';
}

// Watches the page's theme attributes and the theme metadata in its head.
function observePageTheme(observer: MutationObserver): void {
  [document.documentElement, document.body].forEach((element) => {
    if (element) {
      observer.observe(element, { attributes: true, attributeFilter: THEME_ATTRIBUTES });
    }
  });
  if (document.head) {
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['name', 'content', 'media']
    });
  }
}

class SwitcherThemeFollower {
  private mode: SwitcherThemeMode = 'system';
  // Stops following the Lumno theme setting once the switcher closes.
  private unsubscribeSetting: (() => void) | null = null;
  private mediaListening = false;
  private observer: MutationObserver | null = null;
  private syncFrame: number | null = null;
  private destroyed = false;
  private started = false;
  private readonly view: Pick<TabSwitcherViewController, 'panel' | 'setTheme'>;
  private readonly toastElement: HTMLElement | null;

  constructor(view: Pick<TabSwitcherViewController, 'panel' | 'setTheme'>, toastElement: HTMLElement | null) {
    this.view = view;
    this.toastElement = toastElement;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.destroyed = false;
    this.setMode('system');
    if (chromeApi && chromeApi.storage) {
      const store = getContextSettingsStore(chromeApi);
      const loaded = store.include(themeMode);
      const apply = (): void => {
        if (!this.destroyed) {
          this.setMode(store.get(themeMode));
        }
      };
      void loaded.then(apply);
      this.unsubscribeSetting = store.subscribe(themeMode, apply);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.started = false;
    if (this.unsubscribeSetting) {
      this.unsubscribeSetting();
      this.unsubscribeSetting = null;
    }
    this.stopMediaListener();
    this.stopPageObserver();
  }

  readonly refresh = (): void => {
    if (this.destroyed) {
      return;
    }
    const resolved = resolveSwitcherTheme(this.mode);
    this.view.setTheme(resolved);
    if (!this.toastElement) {
      return;
    }
    if (resolved === 'dark') {
      this.toastElement.setAttribute('data-theme', 'dark');
    } else {
      this.toastElement.removeAttribute('data-theme');
    }
  };

  private setMode(mode: unknown): void {
    this.mode = normalizeThemeMode(mode);
    this.refresh();
    if (this.mode === 'system') {
      this.startPageObserver();
      this.startMediaListener();
      return;
    }
    this.stopPageObserver();
    this.stopMediaListener();
  }

  private readonly handleSystemChange = (): void => {
    if (this.mode === 'system') {
      this.refresh();
    }
  };

  private scheduleSync(): void {
    if (this.syncFrame !== null) {
      return;
    }
    this.syncFrame = requestAnimationFrame(() => {
      this.syncFrame = null;
      const panel = this.view.panel;
      if (!this.destroyed && panel && panel.isConnected && this.mode === 'system') {
        this.refresh();
      }
    });
  }

  private startPageObserver(): void {
    if (this.observer || this.mode !== 'system' || typeof MutationObserver !== 'function') {
      return;
    }
    this.observer = new MutationObserver(() => this.scheduleSync());
    observePageTheme(this.observer);
    this.scheduleSync();
  }

  private stopPageObserver(): void {
    if (this.syncFrame !== null) {
      cancelAnimationFrame(this.syncFrame);
      this.syncFrame = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private startMediaListener(): void {
    if (!systemDarkQuery || this.mediaListening) {
      return;
    }
    this.mediaListening = true;
    if (typeof systemDarkQuery.addEventListener === 'function') {
      systemDarkQuery.addEventListener('change', this.handleSystemChange);
    } else if (typeof systemDarkQuery.addListener === 'function') {
      systemDarkQuery.addListener(this.handleSystemChange);
    }
  }

  private stopMediaListener(): void {
    if (!this.mediaListening || !systemDarkQuery) {
      return;
    }
    if (typeof systemDarkQuery.removeEventListener === 'function') {
      systemDarkQuery.removeEventListener('change', this.handleSystemChange);
    } else if (typeof systemDarkQuery.removeListener === 'function') {
      systemDarkQuery.removeListener(this.handleSystemChange);
    }
    this.mediaListening = false;
  }
}

export { SwitcherThemeFollower };
