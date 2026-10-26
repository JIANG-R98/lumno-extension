// The notices the picker shows on the page.
import * as TOAST from '../../shared/ui/toast';
import type { ToastController } from '../../shared/ui/toast';
import { PICKER_Z_INDEX, TOAST_HOST_ID } from './constants';
import { applyNoTranslate, getMessage } from './locale';
import { applyPickerTheme, ensurePickerUi } from './picker-ui';
import { state } from './state';
import { getPickerTheme } from './theme';
import type { ToastKind } from './types';

function showVideoPiPConflictToast(): void {
  ensurePickerUi();
  applyPickerTheme(getPickerTheme(null));
  showToast(
    getMessage(
      'document_pip_picker_conflict_video_pip',
      'A video PiP is already active. Close it before starting content clipping.'
    ),
    'error'
  );
}


function clearToast(): void {
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
  state.toastElement = null;
  state.toastController = null;
  state.toastStyleGate = null;
}

// The shared Toast, in its own shadow root so page styles cannot reach it and
// outside the aria-hidden picker root so screen readers still hear it.
function ensureToast(): { element: HTMLDivElement; controller: Readonly<ToastController> } | null {
  if (state.toastHost && state.toastHost.isConnected && state.toastElement && state.toastController) {
    return { element: state.toastElement, controller: state.toastController };
  }
  clearToast();
  if (!document.documentElement) {
    return null;
  }
  const staleHost = document.getElementById(TOAST_HOST_ID);
  if (staleHost) {
    staleHost.remove();
  }
  const toastHost = document.createElement('div');
  toastHost.id = TOAST_HOST_ID;
  applyNoTranslate(toastHost);
  toastHost.style.cssText = [
    'all: initial',
    'position: fixed',
    'inset: 0',
    `z-index: ${PICKER_Z_INDEX}`,
    'display: block',
    'pointer-events: none'
  ].map((rule) => `${rule} !important`).join(';');
  const toastShadow = toastHost.attachShadow({ mode: 'closed' });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('src/shared/ui/toast.css');
  const toastElement = document.createElement('div');
  toastElement.className = 'x-lumno-toast';
  toastElement.setAttribute('data-show', 'false');
  toastElement.setAttribute('role', 'status');
  toastElement.setAttribute('aria-live', 'polite');
  toastElement.style.setProperty('--x-lumno-toast-top', 'max(24px, calc(env(safe-area-inset-top) + 12px))');
  toastElement.style.setProperty('--x-lumno-toast-z-index', PICKER_Z_INDEX);
  applyNoTranslate(toastElement);
  toastShadow.append(stylesheet, toastElement);
  document.documentElement.appendChild(toastHost);

  state.toastHost = toastHost;
  state.toastElement = toastElement;
  state.toastStyleGate = TOAST.createToastStyleGate(toastElement, {
    stylesheetElement: stylesheet,
    windowObj: window
  });
  const controller = TOAST.createToastController(toastElement, { windowObj: window });
  state.toastController = controller;
  return { element: toastElement, controller };
}

function hideToast(): void {
  if (state.toastController) {
    state.toastController.hide();
  }
}

function showToast(message: string, kind: ToastKind, options?: { persistent?: boolean }): void {
  const toast = ensureToast();
  if (!toast) {
    return;
  }
  applyPickerTheme(state.currentTheme || getPickerTheme(state.currentTarget));
  const errorToast = kind === 'error';
  toast.element.setAttribute('role', errorToast ? 'alert' : 'status');
  toast.element.setAttribute('aria-live', errorToast ? 'assertive' : 'polite');
  toast.controller.show(message, {
    error: errorToast,
    duration: options && options.persistent ? 0 : undefined
  });
}

export {
  clearToast,
  ensureToast,
  hideToast,
  showToast,
  showVideoPiPConflictToast
};
