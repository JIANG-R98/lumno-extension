// Tooltips, toasts and the clear buttons' hover copy, the fallback
// shortcut field width, and refreshing the custom selects.
import { isHtmlElement } from '../shared/dom-guards';
import type { ToastController } from '../shared/react/toast';
import type { TooltipController } from '../shared/ui/tooltip';
import type { SelectControlRecord } from './options-select-controls';
import type { GetMessage, ToastTask } from './options-types';

interface TooltipsState {
  // While the startup read batch is pending, select refreshes wait for it.
  optionsStartupStorageBatchPending: boolean;
  optionsStartupRefreshCoalescing: boolean;
  optionsStartupRefreshDeferred: boolean;
  // Made once the page has mounted them.
  tooltipController: TooltipController | null;
  toastController: ToastController | null;
}

interface TooltipsDeps {
  renderSettingsForms(): void;
  fallbackShortcutWrap: HTMLElement | null;
  restrictedActionSelectWrap: HTMLElement | null;
  fallbackShortcutTokens: HTMLElement | null;
  builtinResetButton: HTMLElement | null;
  getMessage: GetMessage;
  customClearButton: HTMLButtonElement | null;
  aggregateSearchClearButton: HTMLButtonElement | null;
  toastElement: HTMLElement | null;
  optionsSelectControlRecords: ReadonlyMap<HTMLSelectElement, SelectControlRecord>;
  renderOptionsSelectControl(select: HTMLSelectElement): void;
  optionsState: TooltipsState;
}

const TOOLTIP_OPTIONS = Object.freeze({
  maxWidth: 'min(360px, calc(100vw - 24px))',
  spacing: 8
});

function createTooltips(deps: TooltipsDeps) {
  const {
    renderSettingsForms,
    fallbackShortcutWrap,
    restrictedActionSelectWrap,
    fallbackShortcutTokens,
    builtinResetButton,
    getMessage,
    customClearButton,
    aggregateSearchClearButton,
    toastElement,
    optionsSelectControlRecords,
    renderOptionsSelectControl
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  let optionsCustomSelectRefreshCount = 0;
  let fallbackShortcutBaseWidth = 0;
  let isFallbackWidthReady = false;

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
    if ((optionsState.optionsStartupStorageBatchPending || optionsState.optionsStartupRefreshCoalescing) && !force) {
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
    optionsSelectControlRecords.forEach((_record, select) => {
      renderOptionsSelectControl(select);
    });
    syncFallbackShortcutWrapWidth();
  }

  function syncFallbackShortcutWrapWidth(): void {
    if (!fallbackShortcutWrap || !restrictedActionSelectWrap) {
      return;
    }
    const width = Math.round(restrictedActionSelectWrap.getBoundingClientRect().width);
    if (!Number.isFinite(width) || width <= 0) {
      return;
    }
    fallbackShortcutBaseWidth = width;
    updateFallbackShortcutWrapWidthForContent();
  }

  function updateFallbackShortcutWrapWidthForContent(): void {
    if (!fallbackShortcutWrap) {
      return;
    }
    const fallbackBase = Math.max(120, Number.isFinite(fallbackShortcutBaseWidth) ? fallbackShortcutBaseWidth : 0);
    let nextWidth = fallbackBase || Math.round(fallbackShortcutWrap.getBoundingClientRect().width) || 180;
    if (fallbackShortcutTokens) {
      const tokenEls = Array.from(fallbackShortcutTokens.children);
      if (tokenEls.length > 0) {
        const style = window.getComputedStyle(fallbackShortcutTokens);
        const gap = Number.parseFloat(style.columnGap || style.gap) || 0;
        const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
        const paddingRight = Number.parseFloat(style.paddingRight) || 0;
        const contentWidth = tokenEls.reduce((sum, el) => sum + Math.ceil(el.getBoundingClientRect().width), 0)
          + Math.max(0, tokenEls.length - 1) * gap;
        const requiredWidth = Math.ceil(contentWidth + paddingLeft + paddingRight + 2);
        nextWidth = Math.max(nextWidth, requiredWidth);
      }
    }
    fallbackShortcutWrap.style.width = `${nextWidth}px`;
    if (!isFallbackWidthReady) {
      requestAnimationFrame(() => {
        isFallbackWidthReady = true;
        if (fallbackShortcutWrap) {
          fallbackShortcutWrap.setAttribute('data-width-ready', 'true');
        }
      });
    }
  }

  function updateBuiltinResetTooltip(): void {
    if (!builtinResetButton) {
      return;
    }
    const text = getMessage('shortcuts_reset_builtin', '重置为初始列表');
    builtinResetButton.removeAttribute('title');
    builtinResetButton.setAttribute('aria-label', text);
    builtinResetButton.setAttribute('data-tooltip', text);
  }

  function updateCustomClearTooltip(): void {
    if (!customClearButton) {
      return;
    }
    const text = getMessage('shortcuts_clear_custom', '清空自定义');
    customClearButton.removeAttribute('title');
    customClearButton.setAttribute('aria-label', text);
    customClearButton.setAttribute('data-tooltip', text);
  }

  function updateAggregateSearchClearTooltip(): void {
    if (!aggregateSearchClearButton) {
      return;
    }
    const text = getMessage('aggregate_search_clear', '清空聚合搜索');
    aggregateSearchClearButton.removeAttribute('title');
    aggregateSearchClearButton.setAttribute('aria-label', text);
    aggregateSearchClearButton.setAttribute('data-tooltip', text);
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
    syncFallbackShortcutWrapWidth,
    updateFallbackShortcutWrapWidthForContent,
    updateBuiltinResetTooltip,
    updateCustomClearTooltip,
    updateAggregateSearchClearTooltip,
    showToast,
    beginToast
  };
}

export { createTooltips };
export type { TooltipsDeps, TooltipsState };
