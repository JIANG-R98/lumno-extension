// Inline confirmations: opening and closing them, keeping the clear
// buttons in step with what they would clear, and removing a site search
// item after one.
function createPopconfirm(deps) {
  const {
    getMessage,
    popconfirmLanguageRefreshers,
    saveDisabledSiteSearchKeys,
    refreshSiteSearchProviders,
    resetSiteSearchForm,
    showToast,
    getSiteSearchBuiltinKey,
    saveSiteSearchProviderState
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  const optionsPopconfirmApi = globalThis.LumnoOptionsPopconfirm;

  function closeActivePopconfirm() {
    if (optionsState.activePopconfirm) {
      const popconfirm = optionsState.activePopconfirm;
      const closePopconfirm = popconfirm._xOptionsClosePopconfirm;
      if (typeof closePopconfirm === 'function') {
        closePopconfirm();
      } else {
        popconfirm.setAttribute('data-open', 'false');
        optionsState.activePopconfirm = null;
      }
    }
  }

  // A clear-all action has nothing to confirm on an empty list.
  function syncClearButtonAvailability(button, hasItems) {
    if (!button) {
      return;
    }
    const disabled = !hasItems;
    if (button.disabled === disabled) {
      return;
    }
    button.disabled = disabled;
    const popconfirm = button.getAttribute('aria-controls')
      ? document.getElementById(button.getAttribute('aria-controls'))
      : null;
    if (disabled && popconfirm && popconfirm === optionsState.activePopconfirm) {
      closeActivePopconfirm();
    }
  }

  function initializePopconfirmWrap(wrap, trigger, messageKey, fallbackMessage, onConfirm) {
    if (!wrap || !trigger) {
      return null;
    }
    const reactApi = typeof optionsPopconfirmApi !== 'undefined'
      ? optionsPopconfirmApi
      : {};
    wrap.className = '_x_extension_popconfirm_wrap_2024_unique_';
    const popconfirm = document.createElement('div');
    popconfirm.className = '_x_extension_popconfirm_2024_unique_';
    popconfirm.setAttribute('data-open', 'false');
    wrap.appendChild(trigger);
    wrap.appendChild(popconfirm);

    let popconfirmController = null;

    function getPopconfirmRenderModel(open) {
      return {
        open: Boolean(open),
        messageKey,
        message: getMessage(messageKey, fallbackMessage),
        cancelLabel: getMessage('confirm_cancel', '取消'),
        confirmLabel: getMessage('confirm_ok', '确认')
      };
    }

    function setPopconfirmOpen(open) {
      const nextOpen = Boolean(open);
      popconfirmController.render(getPopconfirmRenderModel(nextOpen));
      trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    }

    function closePopconfirm(closeOptions) {
      const shouldRestoreFocus = Boolean(closeOptions && closeOptions.restoreFocus);
      setPopconfirmOpen(false);
      if (optionsState.activePopconfirm === popconfirm) {
        optionsState.activePopconfirm = null;
      }
      if (shouldRestoreFocus && trigger.isConnected && typeof trigger.focus === 'function') {
        trigger.focus({ preventScroll: true });
      }
    }
    popconfirm._xOptionsClosePopconfirm = closePopconfirm;

    popconfirmController = reactApi.createPopconfirmController(popconfirm, {
      onCancel() {
        closePopconfirm({ restoreFocus: true });
      },
      onConfirm() {
        closePopconfirm({ restoreFocus: true });
        if (typeof onConfirm === 'function') {
          onConfirm();
        }
      }
    });
    const refreshPopconfirmLanguage = () => {
      popconfirmController.render(getPopconfirmRenderModel(popconfirm.getAttribute('data-open') === 'true'));
    };
    popconfirmLanguageRefreshers.add(refreshPopconfirmLanguage);
    popconfirm._xOptionsDestroyPopconfirm = () => {
      closePopconfirm();
      popconfirmLanguageRefreshers.delete(refreshPopconfirmLanguage);
      popconfirmController.destroy();
      popconfirmController = null;
    };
    setPopconfirmOpen(false);
    if (trigger.id) {
      popconfirm.id = `${trigger.id}_popconfirm`;
      trigger.setAttribute('aria-controls', popconfirm.id);
    }
    trigger.setAttribute('aria-haspopup', 'dialog');

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      if (optionsState.activePopconfirm && optionsState.activePopconfirm !== popconfirm) {
        closeActivePopconfirm();
      }
      const isOpen = popconfirm.getAttribute('data-open') === 'true';
      if (isOpen) {
        closePopconfirm();
      } else {
        setPopconfirmOpen(true);
        optionsState.activePopconfirm = popconfirm;
      }
    });
    return wrap;
  }

  function attachPopconfirm(trigger, messageKey, fallbackMessage, onConfirm) {
    if (!trigger || !trigger.parentNode) {
      return;
    }
    const parent = trigger.parentNode;
    const wrap = document.createElement('div');
    parent.insertBefore(wrap, trigger);
    initializePopconfirmWrap(wrap, trigger, messageKey, fallbackMessage, onConfirm);
  }

  function removeSiteSearchItem(key, isBuiltin) {
    if (isBuiltin) {
      const nextDisabledKeys = new Set(optionsState.disabledSiteSearchKeys);
      nextDisabledKeys.add(key.toLowerCase());
      return saveDisabledSiteSearchKeys(nextDisabledKeys).then(() => {
        optionsState.disabledSiteSearchKeys = nextDisabledKeys;
        refreshSiteSearchProviders();
        if (optionsState.editingSiteSearchKey === key) {
          resetSiteSearchForm();
        }
        showToast(getMessage('toast_removed', '已移除'), false);
      }).catch(() => {
        showToast(getMessage('toast_error', '操作失败，请重试。'), true);
      });
    }
    const removedItem = optionsState.customSiteSearchProviders.find(
      (item) => String(item.key || '') === key
    );
    const nextCustom = optionsState.customSiteSearchProviders.filter(
      (item) => String(item.key || '') !== key
    );
    const nextDisabledKeys = new Set(optionsState.disabledSiteSearchKeys);
    const builtinKey = getSiteSearchBuiltinKey(removedItem);
    if (builtinKey) {
      nextDisabledKeys.delete(builtinKey);
    }
    return saveSiteSearchProviderState(nextCustom, nextDisabledKeys).then(() => {
      optionsState.customSiteSearchProviders = nextCustom;
      optionsState.customSiteSearchProviderIdsReady = true;
      optionsState.disabledSiteSearchKeys = nextDisabledKeys;
      refreshSiteSearchProviders();
      if (optionsState.editingSiteSearchKey === key) {
        resetSiteSearchForm();
      }
      showToast(getMessage('toast_removed', '已移除'), false);
    }).catch(() => {
      showToast(getMessage('toast_error', '操作失败，请重试。'), true);
    });
  }

  return {
    closeActivePopconfirm,
    syncClearButtonAvailability,
    attachPopconfirm,
    removeSiteSearchItem
  };
}

export { createPopconfirm };
