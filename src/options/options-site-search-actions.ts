// What the site search lists' remove, reset and clear actions do to the
// stored providers and disabled keys.
import type { SiteSearchProvider } from '../domain/search/types';
import type * as SiteSearch from './options-site-search';
import type { GetMessage } from './options-types';

interface SiteSearchActionsState {
  customSiteSearchProviders: SiteSearchProvider[];
  customSiteSearchProviderIdsReady: boolean;
  disabledSiteSearchKeys: Set<string>;
}

interface SiteSearchActionsDeps {
  getMessage: GetMessage;
  getSiteSearchBuiltinKey: typeof SiteSearch.getSiteSearchBuiltinKey;
  saveSiteSearchProviderState(items: readonly SiteSearchProvider[], keys: Iterable<string>): Promise<unknown>;
  saveDisabledSiteSearchKeys(keys: Iterable<string>): Promise<unknown>;
  refreshSiteSearchProviders(): unknown;
  renderSiteSearchList(): void;
  renderAggregateSearchList(): void;
  showToast(message: string, isError?: boolean): void;
  loadDefaultSiteSearchProviders(): Promise<SiteSearchProvider[]>;
  loadCustomSiteSearchProviders(baseItems: readonly SiteSearchProvider[]): Promise<SiteSearchProvider[]>;
  optionsState: SiteSearchActionsState;
}

function createSiteSearchActions(deps: SiteSearchActionsDeps) {
  const {
    getMessage,
    getSiteSearchBuiltinKey,
    saveSiteSearchProviderState,
    saveDisabledSiteSearchKeys,
    refreshSiteSearchProviders,
    renderSiteSearchList,
    renderAggregateSearchList,
    showToast,
    loadDefaultSiteSearchProviders,
    loadCustomSiteSearchProviders
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  const showError = (): void => showToast(getMessage('toast_error', '操作失败，请重试。'), true);

  // A built-in provider is hidden by its disabled key; a custom one is
  // dropped, and the built-in it replaced comes back.
  function removeSiteSearchItem(key: string, isBuiltin: boolean): Promise<void> {
    if (isBuiltin) {
      const nextDisabledKeys = new Set(optionsState.disabledSiteSearchKeys);
      nextDisabledKeys.add(key.toLowerCase());
      return saveDisabledSiteSearchKeys(nextDisabledKeys).then(() => {
        optionsState.disabledSiteSearchKeys = nextDisabledKeys;
        refreshSiteSearchProviders();
        showToast(getMessage('toast_removed', '已移除'), false);
      }).catch(showError);
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
      showToast(getMessage('toast_removed', '已移除'), false);
    }).catch(showError);
  }

  // Brings every built-in provider back and drops custom ones that copy one.
  function resetBuiltinSiteSearches(): Promise<void> {
    return loadDefaultSiteSearchProviders().then((defaults) => Promise.all([
      defaults,
      loadCustomSiteSearchProviders(defaults)
    ])).then(([defaults, custom]) => {
      const defaultKeys = new Set(defaults.map((item) => item.key.toLowerCase()));
      const filteredCustom = custom.filter((item) => {
        const key = item.key.toLowerCase();
        const builtinKey = getSiteSearchBuiltinKey(item);
        return Boolean(key) && !defaultKeys.has(key) && !defaultKeys.has(builtinKey);
      });
      return saveSiteSearchProviderState(filteredCustom, new Set<string>()).then(() => {
        optionsState.customSiteSearchProviders = filteredCustom;
        optionsState.customSiteSearchProviderIdsReady = true;
        optionsState.disabledSiteSearchKeys = new Set<string>();
        renderSiteSearchList();
        renderAggregateSearchList();
      });
    }).catch(showError);
  }

  // Drops every custom provider; built-ins they replaced come back.
  function clearCustomSiteSearches(): Promise<void> {
    const nextDisabledKeys = new Set(optionsState.disabledSiteSearchKeys);
    optionsState.customSiteSearchProviders.forEach((item) => {
      const builtinKey = getSiteSearchBuiltinKey(item);
      if (builtinKey) {
        nextDisabledKeys.delete(builtinKey);
      }
    });
    return saveSiteSearchProviderState([], nextDisabledKeys).then(() => {
      optionsState.customSiteSearchProviders = [];
      optionsState.customSiteSearchProviderIdsReady = true;
      optionsState.disabledSiteSearchKeys = nextDisabledKeys;
      renderSiteSearchList();
      renderAggregateSearchList();
      showToast(getMessage('toast_cleared', '已清空'), false);
    }).catch(showError);
  }

  return { removeSiteSearchItem, resetBuiltinSiteSearches, clearCustomSiteSearches };
}

export { createSiteSearchActions };
export type { SiteSearchActionsDeps, SiteSearchActionsState };
