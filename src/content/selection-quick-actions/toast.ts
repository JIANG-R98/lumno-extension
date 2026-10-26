// The toast that reports what an action did.
import * as TOAST from '../../shared/ui/toast';
import type { ToastController, ToastShowOptions } from '../../shared/ui/toast';
import { ACTION_FAILURE_DISMISS_MS, TOAST_HOST_ID, TOAST_STYLE_ID } from './constants';
import { applyNoTranslate } from './host';
import { state } from './state';

function clearSelectionToast(): void {
  if (state.toastController) {
    state.toastController.destroy();
  }
  if (state.toastStyleGate) {
    state.toastStyleGate.destroy();
  }
  if (state.toastHost && state.toastHost.isConnected) {
    state.toastHost.remove();
  }
  state.toastHost = null;
  state.toastController = null;
  state.toastStyleGate = null;
}

function ensureSelectionToast(): Readonly<ToastController> {
  if (state.toastHost && state.toastHost.isConnected && state.toastController) {
    return state.toastController;
  }
  clearSelectionToast();
  const staleHost = document.getElementById(TOAST_HOST_ID);
  if (staleHost) {
    staleHost.remove();
  }
  const newHost = document.createElement('div');
  state.toastHost = newHost;
  newHost.id = TOAST_HOST_ID;
  applyNoTranslate(newHost);
  const hostStyles = {
    all: 'initial',
    position: 'fixed',
    inset: '0',
    'z-index': '2147483647',
    display: 'block',
    width: 'auto',
    height: 'auto',
    margin: '0',
    padding: '0',
    border: '0',
    opacity: '1',
    visibility: 'visible',
    'pointer-events': 'none',
    transform: 'none',
    filter: 'none',
    overflow: 'visible',
    isolation: 'isolate',
    contain: 'none'
  };
  Object.entries(hostStyles).forEach(([property, value]) => {
    newHost.style.setProperty(property, value, 'important');
  });

  const toastShadow = newHost.attachShadow({ mode: 'closed' });
  const stylesheet = document.createElement('link');
  stylesheet.id = TOAST_STYLE_ID;
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('src/shared/ui/toast.css');
  const toastElement = document.createElement('div');
  toastElement.className = 'x-lumno-toast';
  toastElement.setAttribute('data-show', 'false');
  toastElement.setAttribute('role', 'status');
  toastElement.setAttribute('aria-live', 'polite');
  toastElement.style.setProperty(
    '--x-lumno-toast-top',
    'max(24px, calc(env(safe-area-inset-top) + 12px))'
  );
  toastElement.style.setProperty('--x-lumno-toast-z-index', '2147483647');
  applyNoTranslate(toastElement);
  toastShadow.append(stylesheet, toastElement);
  (document.documentElement || document.body).appendChild(newHost);

  state.toastStyleGate = TOAST.createToastStyleGate(toastElement, {
    stylesheetElement: stylesheet,
    windowObj: window
  });
  const controller = TOAST.createToastController(toastElement, {
    duration: ACTION_FAILURE_DISMISS_MS,
    windowObj: window
  });
  state.toastController = controller;
  return controller;
}

function showSelectionToast(message: string, options?: ToastShowOptions): void {
  ensureSelectionToast().show(message, options || {});
}

function hideSelectionToast(): void {
  if (state.toastController) {
    state.toastController.hide();
  }
}

export {
  clearSelectionToast,
  ensureSelectionToast,
  hideSelectionToast,
  showSelectionToast
};
