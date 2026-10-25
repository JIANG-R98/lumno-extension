// Inline confirmations: opening and closing them, keeping the clear
// buttons in step with what they would clear, and removing a site search
// item after one.
import type { SiteSearchProvider } from '../domain/search/types';
import type * as SiteSearch from './options-site-search';
import type { GetMessage } from './options-types';
import type { PopconfirmController, PopconfirmRenderModel } from './react/popconfirm';

interface PopconfirmState {
  // The open confirmation, if any.
  activePopconfirm: HTMLElement | null;
  disabledSiteSearchKeys: Set<string>;
  customSiteSearchProviders: SiteSearchProvider[];
  customSiteSearchProviderIdsReady: boolean;
  editingSiteSearchKey: string | null;
}

interface PopconfirmDeps {
  getMessage: GetMessage;
  // Re-render each confirmation's copy after a language change.
  popconfirmLanguageRefreshers: Set<() => void>;
  saveDisabledSiteSearchKeys(keys: Iterable<string>): Promise<unknown>;
  refreshSiteSearchProviders(): unknown;
  resetSiteSearchForm(): void;
  showToast(message: string, isError?: boolean): void;
  getSiteSearchBuiltinKey: typeof SiteSearch.getSiteSearchBuiltinKey;
  saveSiteSearchProviderState(items: readonly SiteSearchProvider[], keys: Iterable<string>): Promise<unknown>;
  optionsState: PopconfirmState;
}

interface CloseOptions {
  // Put focus back on the button that opened it.
  restoreFocus?: boolean;
}

function createPopconfirm(deps: PopconfirmDeps) {
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
  // How each confirmation closes, by its element.
  const popconfirmClosers = new WeakMap<HTMLElement, (closeOptions?: CloseOptions) => void>();

  function closeActivePopconfirm(closeOptions?: CloseOptions): void {
    const popconfirm = optionsState.activePopconfirm;
    if (!popconfirm) {
      return;
    }
    const closePopconfirm = popconfirmClosers.get(popconfirm);
    if (closePopconfirm) {
      closePopconfirm(closeOptions);
    } else {
      popconfirm.setAttribute('data-open', 'false');
      optionsState.activePopconfirm = null;
    }
  }

  // A clear-all action has nothing to confirm on an empty list.
  function syncClearButtonAvailability(button: HTMLButtonElement | null, hasItems: boolean): void {
    if (!button) {
      return;
    }
    const disabled = !hasItems;
    if (button.disabled === disabled) {
      return;
    }
    button.disabled = disabled;
    const controlsId = button.getAttribute('aria-controls');
    const popconfirm = controlsId ? document.getElementById(controlsId) : null;
    if (disabled && popconfirm && popconfirm === optionsState.activePopconfirm) {
      closeActivePopconfirm();
    }
  }

  function initializePopconfirmWrap(
    wrap: HTMLElement,
    trigger: HTMLElement,
    messageKey: string,
    fallbackMessage: string,
    onConfirm: () => unknown
  ): HTMLElement | null {
    if (!optionsPopconfirmApi) {
      return null;
    }
    wrap.className = '_x_extension_popconfirm_wrap_2024_unique_';
    const popconfirm = document.createElement('div');
    popconfirm.className = '_x_extension_popconfirm_2024_unique_';
    popconfirm.setAttribute('data-open', 'false');
    wrap.appendChild(trigger);
    wrap.appendChild(popconfirm);

    function getPopconfirmRenderModel(open: boolean): PopconfirmRenderModel {
      return {
        open,
        messageKey,
        message: getMessage(messageKey, fallbackMessage),
        cancelLabel: getMessage('confirm_cancel', '取消'),
        confirmLabel: getMessage('confirm_ok', '确认')
      };
    }

    function setPopconfirmOpen(open: boolean): void {
      popconfirmController.render(getPopconfirmRenderModel(open));
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function closePopconfirm(closeOptions?: CloseOptions): void {
      const shouldRestoreFocus = Boolean(closeOptions && closeOptions.restoreFocus);
      setPopconfirmOpen(false);
      if (optionsState.activePopconfirm === popconfirm) {
        optionsState.activePopconfirm = null;
      }
      if (shouldRestoreFocus && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    }
    popconfirmClosers.set(popconfirm, closePopconfirm);

    const popconfirmController: PopconfirmController = optionsPopconfirmApi.createPopconfirmController(popconfirm, {
      onCancel() {
        closePopconfirm({ restoreFocus: true });
      },
      onConfirm() {
        closePopconfirm({ restoreFocus: true });
        onConfirm();
      }
    });
    popconfirmLanguageRefreshers.add(() => {
      popconfirmController.render(getPopconfirmRenderModel(popconfirm.getAttribute('data-open') === 'true'));
    });
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

  function attachPopconfirm(
    trigger: HTMLElement | null,
    messageKey: string,
    fallbackMessage: string,
    onConfirm: () => unknown
  ): void {
    if (!trigger || !trigger.parentNode) {
      return;
    }
    const parent = trigger.parentNode;
    const wrap = document.createElement('div');
    parent.insertBefore(wrap, trigger);
    initializePopconfirmWrap(wrap, trigger, messageKey, fallbackMessage, onConfirm);
  }

  function removeSiteSearchItem(key: string, isBuiltin: boolean): Promise<void> {
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
export type { CloseOptions, PopconfirmDeps, PopconfirmState };
