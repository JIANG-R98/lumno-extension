// The confirmations behind the site search and aggregate search lists'
// reset and clear buttons.
import type { SiteSearchProvider } from '../domain/search/types';
import type * as SiteSearch from './options-site-search';
import type { GetMessage } from './options-types';

interface SiteSearchEventsState {
  customSiteSearchProviders: SiteSearchProvider[];
  customSiteSearchProviderIdsReady: boolean;
  disabledSiteSearchKeys: Set<string>;
}

interface SiteSearchEventsDeps {
  getMessage: GetMessage;
  getSiteSearchBuiltinKey: typeof SiteSearch.getSiteSearchBuiltinKey;
  saveSiteSearchProviderState(items: readonly SiteSearchProvider[], keys: Iterable<string>): Promise<unknown>;
  renderSiteSearchList(): void;
  showToast(message: string, isError?: boolean): void;
  builtinResetButton: HTMLElement | null;
  attachPopconfirm(trigger: HTMLElement | null, messageKey: string, fallbackMessage: string, onConfirm: () => unknown): void;
  loadDefaultSiteSearchProviders(): Promise<SiteSearchProvider[]>;
  loadCustomSiteSearchProviders(baseItems: readonly SiteSearchProvider[]): Promise<SiteSearchProvider[]>;
  renderAggregateSearchList(): void;
  customClearButton: HTMLButtonElement | null;
  aggregateSearchClearButton: HTMLButtonElement | null;
  handleAggregateSearchClear(): unknown;
  optionsState: SiteSearchEventsState;
}

function createSiteSearchEvents(deps: SiteSearchEventsDeps): void {
  const {
    getMessage,
    getSiteSearchBuiltinKey,
    saveSiteSearchProviderState,
    renderSiteSearchList,
    showToast,
    builtinResetButton,
    attachPopconfirm,
    loadDefaultSiteSearchProviders,
    loadCustomSiteSearchProviders,
    renderAggregateSearchList,
    customClearButton,
    aggregateSearchClearButton,
    handleAggregateSearchClear
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  if (builtinResetButton) {
    attachPopconfirm(
      builtinResetButton,
      'confirm_reset_builtin',
      '确认重置内置列表？',
      () => {
        loadDefaultSiteSearchProviders().then((defaults) => Promise.all([
          defaults,
          loadCustomSiteSearchProviders(defaults)
        ])).then(([defaults, custom]) => {
          const defaultKeys = new Set(defaults.map((item) => item.key.toLowerCase()));
          const filteredCustom = custom.filter((item) => {
            const key = item.key.toLowerCase();
            const builtinKey = getSiteSearchBuiltinKey(item);
            return Boolean(key) && !defaultKeys.has(key) && !defaultKeys.has(builtinKey);
          });
          saveSiteSearchProviderState(filteredCustom, new Set<string>()).then(() => {
            optionsState.customSiteSearchProviders = filteredCustom;
            optionsState.customSiteSearchProviderIdsReady = true;
            optionsState.disabledSiteSearchKeys = new Set<string>();
            renderSiteSearchList();
            renderAggregateSearchList();
          }).catch(() => {
            showToast(getMessage('toast_error', '操作失败，请重试。'), true);
          });
        }).catch(() => {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        });
      }
    );
  }

  if (customClearButton) {
    attachPopconfirm(
      customClearButton,
      'confirm_clear_custom',
      '确认清空自定义搜索？',
      () => {
        const nextDisabledKeys = new Set(optionsState.disabledSiteSearchKeys);
        optionsState.customSiteSearchProviders.forEach((item) => {
          const builtinKey = getSiteSearchBuiltinKey(item);
          if (builtinKey) {
            nextDisabledKeys.delete(builtinKey);
          }
        });
        saveSiteSearchProviderState([], nextDisabledKeys).then(() => {
          optionsState.customSiteSearchProviders = [];
          optionsState.customSiteSearchProviderIdsReady = true;
          optionsState.disabledSiteSearchKeys = nextDisabledKeys;
          renderSiteSearchList();
          renderAggregateSearchList();
          showToast(getMessage('toast_cleared', '已清空'), false);
        }).catch(() => {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        });
      }
    );
  }

  if (aggregateSearchClearButton) {
    attachPopconfirm(
      aggregateSearchClearButton,
      'confirm_clear_aggregate_search',
      '确认清空聚合搜索？',
      handleAggregateSearchClear
    );
  }
}

export { createSiteSearchEvents };
export type { SiteSearchEventsDeps, SiteSearchEventsState };
