import * as TOAST from '../shared/ui/toast';
import type { ToastController, ToastStyleGate } from '../shared/ui/toast';
import type { PageShortcutToastOptions } from '../types/content-apis';

(function() {
  if (window.__lumnoPageShortcutToast2026) {
    return;
  }

  // Tells the page what the "Add to Lumno New Tab" menu item did. The shared
  // Toast lives in its own shadow root so page styles cannot reach it.
  const TOAST_HOST_ID = '__lumno_page_shortcut_toast_2026__';
  const TOAST_Z_INDEX = '2147483646';
  const state: {
    host: HTMLElement | null;
    element: HTMLElement | null;
    controller: Readonly<ToastController> | null;
    styleGate: Readonly<ToastStyleGate> | null;
  } = {
    host: null,
    element: null,
    controller: null,
    styleGate: null
  };

  function applyNoTranslate<T extends HTMLElement>(element: T): T {
    element.setAttribute('translate', 'no');
    element.setAttribute('lang', 'zxx');
    element.setAttribute('notranslate', '');
    element.setAttribute('data-no-translate', 'true');
    element.classList.add('notranslate');
    return element;
  }

  function isDarkTheme(themeMode: string | undefined): boolean {
    if (themeMode === 'dark' || themeMode === 'light') {
      return themeMode === 'dark';
    }
    return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function ensureToast(): boolean {
    if (state.host && state.host.isConnected && state.controller) {
      return true;
    }
    if (!document.documentElement) {
      return false;
    }
    if (state.controller) state.controller.destroy();
    if (state.styleGate) state.styleGate.destroy();
    const staleHost = document.getElementById(TOAST_HOST_ID);
    if (staleHost) {
      staleHost.remove();
    }
    const host = applyNoTranslate(document.createElement('div'));
    host.id = TOAST_HOST_ID;
    host.style.cssText = [
      'all: initial',
      'position: fixed',
      'inset: 0',
      `z-index: ${TOAST_Z_INDEX}`,
      'display: block',
      'pointer-events: none'
    ].map((rule) => `${rule} !important`).join(';');
    const shadow = host.attachShadow({ mode: 'closed' });
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('src/shared/ui/toast.css');
    const element = applyNoTranslate(document.createElement('div'));
    element.className = 'x-lumno-toast';
    element.setAttribute('data-show', 'false');
    element.style.setProperty('--x-lumno-toast-top', 'max(24px, calc(env(safe-area-inset-top) + 12px))');
    element.style.setProperty('--x-lumno-toast-z-index', TOAST_Z_INDEX);
    shadow.append(stylesheet, element);
    document.documentElement.appendChild(host);
    state.host = host;
    state.element = element;
    state.styleGate = TOAST.createToastStyleGate(element, { stylesheetElement: stylesheet, windowObj: window });
    state.controller = TOAST.createToastController(element, { windowObj: window });
    return true;
  }

  function show(message: string, options?: PageShortcutToastOptions | null): boolean {
    const text = String(message || '').trim();
    if (!text || !ensureToast() || !state.element || !state.controller) {
      return false;
    }
    const settings: PageShortcutToastOptions = options || {};
    const error = settings.error === true;
    if (isDarkTheme(settings.themeMode)) {
      state.element.setAttribute('data-theme', 'dark');
    } else {
      state.element.removeAttribute('data-theme');
    }
    state.element.setAttribute('role', error ? 'alert' : 'status');
    state.element.setAttribute('aria-live', error ? 'assertive' : 'polite');
    state.controller.show(text, {
      error,
      ...(Number.isFinite(Number(settings.duration)) ? { duration: Number(settings.duration) } : {})
    });
    return true;
  }

  window.__lumnoPageShortcutToast2026 = Object.freeze({ show });
})();
