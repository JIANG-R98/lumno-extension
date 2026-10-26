// Tooltips, toasts, and refreshing the settings forms.
import { isHtmlElement } from '../shared/dom-guards';
import type { ToastController } from '../shared/react/toast';
import type { TooltipController } from '../shared/ui/tooltip';
import type { ToastTask } from './options-types';

interface TooltipsState {
  // While the startup read batch is pending, select refreshes wait for it.
  optionsStartupReadPending: boolean;
  optionsStartupRefreshCoalescing: boolean;
  optionsStartupRefreshDeferred: boolean;
  // Made once the page has mounted them.
  tooltipController: TooltipController | null;
  toastController: ToastController | null;
}

interface TooltipsDeps {
  renderSettingsForms(): void;
  toastElement: HTMLElement | null;
  optionsState: TooltipsState;
}

const TOOLTIP_OPTIONS = Object.freeze({
  maxWidth: 'min(360px, calc(100vw - 24px))',
  spacing: 8
});

function createTooltips(deps: TooltipsDeps) {
  const {
    renderSettingsForms,
    toastElement
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  let optionsCustomSelectRefreshCount = 0;

  function showTooltipFor(target: HTMLElement | null): void {
    if (!target || !optionsState.tooltipController) {
      return;
    }
    const text = target.getAttribute('data-tooltip');
    if (!text) {
      return;
    }
    optionsState.tooltipController.show(target, text, TOOLTIP_OPTIONS);
  }

  function initTooltips(): void {
    const tooltipController = optionsState.tooltipController;
    if (!tooltipController) {
      return;
    }
    document.querySelectorAll('[data-tooltip]').forEach((node) => {
      if (isHtmlElement(node)) {
        tooltipController.bind(node, () => node.getAttribute('data-tooltip'), TOOLTIP_OPTIONS);
      }
    });
  }

  function refreshCustomSelects(options?: { force?: boolean }): void {
    const force = Boolean(options && options.force);
    if ((optionsState.optionsStartupReadPending || optionsState.optionsStartupRefreshCoalescing) && !force) {
      optionsState.optionsStartupRefreshDeferred = true;
      return;
    }
    optionsCustomSelectRefreshCount += 1;
    if (document.documentElement) {
      document.documentElement.setAttribute(
        'data-lumno-options-control-refreshes',
        String(optionsCustomSelectRefreshCount)
      );
    }
    renderSettingsForms();
  }

  function setToastAnnouncement(errorToast: boolean): void {
    if (toastElement) {
      toastElement.setAttribute('role', errorToast ? 'alert' : 'status');
      toastElement.setAttribute('aria-live', errorToast ? 'assertive' : 'polite');
      toastElement.setAttribute('aria-atomic', 'true');
    }
  }

  function showToast(message: string, isError?: boolean): void {
    const errorToast = Boolean(isError);
    setToastAnnouncement(errorToast);
    if (optionsState.toastController) {
      optionsState.toastController.show(message, {
        error: errorToast
      });
    }
  }

  // A task that may run long: its loading Toast turns into the result in place.
  function beginToast(message: string): ToastTask {
    setToastAnnouncement(false);
    const task = optionsState.toastController ? optionsState.toastController.begin(message) : null;
    return {
      done(result) {
        setToastAnnouncement(false);
        if (task) task.done(result);
      },
      fail(result) {
        setToastAnnouncement(true);
        if (task) task.fail(result);
      },
      cancel() {
        if (task) task.cancel();
      }
    };
  }

  return {
    showTooltipFor,
    initTooltips,
    refreshCustomSelects,
    showToast,
    beginToast
  };
}

export { createTooltips };
export type { TooltipsDeps, TooltipsState };
