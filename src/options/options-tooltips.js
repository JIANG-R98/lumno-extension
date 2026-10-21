// Tooltips, toasts and the clear buttons' hover copy, the fallback
// shortcut field width, and refreshing the custom selects.
function createTooltips(deps) {
  const {
    renderSettingsForms,
    fallbackShortcutWrap,
    restrictedActionSelectWrap,
    fallbackShortcutTokens,
    builtinResetButton,
    getMessage,
    customClearButton,
    aggregateSearchClearButton,
    blacklistClearButton,
    toastElement
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  let optionsCustomSelectRefreshCount = 0;
  let fallbackShortcutBaseWidth = 0;
  let isFallbackWidthReady = false;

  function showTooltipFor(target) {
    if (!target) {
      return;
    }
    const text = target.getAttribute('data-tooltip');
    if (!text) {
      return;
    }
    optionsState.tooltipController.show(target, text, {
      maxWidth: 'min(360px, calc(100vw - 24px))',
      spacing: 8
    });
  }

  function initTooltips() {
    const nodes = Array.from(document.querySelectorAll('[data-tooltip]'));
    nodes.forEach((node) => {
      optionsState.tooltipController.bind(node, () => node.getAttribute('data-tooltip'), {
        maxWidth: 'min(360px, calc(100vw - 24px))',
        spacing: 8
      });
    });
  }

  function refreshCustomSelects(options) {
    const config = options && typeof options === 'object' ? options : {};
    if ((optionsState.optionsStartupStorageBatchPending || optionsState.optionsStartupRefreshCoalescing) && !config.force) {
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
    optionsState.optionsSelectControlRecords.forEach((record, select) => {
      optionsState.renderOptionsSelectControl(select);
    });
    syncFallbackShortcutWrapWidth();
  }

  function syncFallbackShortcutWrapWidth() {
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

  function updateFallbackShortcutWrapWidthForContent() {
    if (!fallbackShortcutWrap) {
      return;
    }
    const fallbackBase = Math.max(120, Number.isFinite(fallbackShortcutBaseWidth) ? fallbackShortcutBaseWidth : 0);
    let nextWidth = fallbackBase || Math.round(fallbackShortcutWrap.getBoundingClientRect().width) || 180;
    if (fallbackShortcutTokens) {
      const tokenEls = Array.from(fallbackShortcutTokens.children || []);
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

  function updateBuiltinResetTooltip() {
    if (!builtinResetButton) {
      return;
    }
    const text = getMessage('shortcuts_reset_builtin', '重置为初始列表');
    builtinResetButton.removeAttribute('title');
    builtinResetButton.setAttribute('aria-label', text);
    builtinResetButton.setAttribute('data-tooltip', text);
  }

  function updateCustomClearTooltip() {
    if (!customClearButton) {
      return;
    }
    const text = getMessage('shortcuts_clear_custom', '清空自定义');
    customClearButton.removeAttribute('title');
    customClearButton.setAttribute('aria-label', text);
    customClearButton.setAttribute('data-tooltip', text);
  }

  function updateAggregateSearchClearTooltip() {
    if (!aggregateSearchClearButton) {
      return;
    }
    const text = getMessage('aggregate_search_clear', '清空聚合搜索');
    aggregateSearchClearButton.removeAttribute('title');
    aggregateSearchClearButton.setAttribute('aria-label', text);
    aggregateSearchClearButton.setAttribute('data-tooltip', text);
  }

  function updateBlacklistClearTooltip() {
    if (!blacklistClearButton) {
      return;
    }
    const text = getMessage('blacklist_clear', '清空黑名单');
    blacklistClearButton.removeAttribute('title');
    blacklistClearButton.setAttribute('aria-label', text);
    blacklistClearButton.setAttribute('data-tooltip', text);
  }

  function setToastAnnouncement(errorToast) {
    if (toastElement) {
      toastElement.setAttribute('role', errorToast ? 'alert' : 'status');
      toastElement.setAttribute('aria-live', errorToast ? 'assertive' : 'polite');
      toastElement.setAttribute('aria-atomic', 'true');
    }
  }

  function showToast(message, isError) {
    const errorToast = Boolean(isError);
    setToastAnnouncement(errorToast);
    optionsState.toastController.show(message, {
      error: errorToast
    });
  }

  // A task that may run long: its loading Toast turns into the result in place.
  function beginToast(message) {
    setToastAnnouncement(false);
    const task = optionsState.toastController.begin(message);
    return {
      done(result) {
        setToastAnnouncement(false);
        task.done(result);
      },
      fail(result) {
        setToastAnnouncement(true);
        task.fail(result);
      },
      cancel() {
        task.cancel();
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
    updateBlacklistClearTooltip,
    showToast,
    beginToast
  };
}

export { createTooltips };
