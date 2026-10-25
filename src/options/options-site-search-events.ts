// Click handlers for the site search and aggregate search lists and their
// add, reset and clear buttons.
import type { AggregateSearch } from '../domain/search/aggregate-search-store';
import type { SiteSearchProvider } from '../domain/search/types';
import type * as SiteSearch from './options-site-search';
import type { SiteSearchCategory } from './options-site-search-form';
import type { GetMessage } from './options-types';

interface SiteSearchEventsState {
  siteSearchFormExpanded: boolean;
  editingSiteSearchKey: string | null;
  siteSearchDraftCategory: SiteSearchCategory;
  customSiteSearchProviders: SiteSearchProvider[];
  customSiteSearchProviderIdsReady: boolean;
  disabledSiteSearchKeys: Set<string>;
}

interface SiteSearchEventsDeps {
  siteSearchCancelButton: HTMLElement | null;
  resetSiteSearchForm(): void;
  siteSearchFormTrigger: HTMLElement | null;
  setSiteSearchFormExpanded(expanded: boolean): void;
  siteSearchInsertQueryButton: HTMLElement | null;
  insertSiteSearchQueryToken(): void;
  siteSearchCategoryButtons: HTMLElement[];
  setLegacySiteSearchDraftCategory(category: string | undefined): void;
  siteSearchAddButton: HTMLElement | null;
  attachSaveButtonAnimation(button: HTMLElement | null): void;
  suspendSiteSearchRefresh(durationMs: number): void;
  setSiteSearchError(message: string): void;
  siteSearchKeyInput: HTMLInputElement | null;
  siteSearchNameInput: HTMLInputElement | null;
  siteSearchTemplateInput: HTMLInputElement | null;
  siteSearchAliasInput: HTMLInputElement | null;
  normalizeAliases: typeof SiteSearch.normalizeAliases;
  getMessage: GetMessage;
  findSiteSearchKeyConflict(key: string, allowedKey?: string): SiteSearchProvider | AggregateSearch | null;
  normalizeSiteSearchTemplate(template: unknown): string;
  getSiteSearchBuiltinKey: typeof SiteSearch.getSiteSearchBuiltinKey;
  normalizeSiteSearchProvider(
    item: Partial<SiteSearchProvider> | null | undefined,
    baseItem?: Partial<SiteSearchProvider> | null
  ): SiteSearchProvider | null;
  createPersistentId(prefix: string): string;
  saveSiteSearchProviderState(items: readonly SiteSearchProvider[], keys: Iterable<string>): Promise<unknown>;
  renderSiteSearchList(): void;
  refreshSiteSearchProviders(): unknown;
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
    siteSearchCancelButton,
    resetSiteSearchForm,
    siteSearchFormTrigger,
    setSiteSearchFormExpanded,
    siteSearchInsertQueryButton,
    insertSiteSearchQueryToken,
    siteSearchCategoryButtons,
    setLegacySiteSearchDraftCategory,
    siteSearchAddButton,
    attachSaveButtonAnimation,
    suspendSiteSearchRefresh,
    setSiteSearchError,
    siteSearchKeyInput,
    siteSearchNameInput,
    siteSearchTemplateInput,
    normalizeAliases,
    siteSearchAliasInput,
    getMessage,
    findSiteSearchKeyConflict,
    normalizeSiteSearchTemplate,
    getSiteSearchBuiltinKey,
    normalizeSiteSearchProvider,
    createPersistentId,
    saveSiteSearchProviderState,
    renderSiteSearchList,
    refreshSiteSearchProviders,
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

  if (siteSearchCancelButton) {
    siteSearchCancelButton.addEventListener('click', function() {
      resetSiteSearchForm();
    });
  }

  if (siteSearchFormTrigger) {
    siteSearchFormTrigger.addEventListener('click', () => {
      setSiteSearchFormExpanded(true);
    });
  }

  if (siteSearchInsertQueryButton) {
    siteSearchInsertQueryButton.addEventListener('click', () => {
      setSiteSearchFormExpanded(true);
      insertSiteSearchQueryToken();
    });
  }

  siteSearchCategoryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setLegacySiteSearchDraftCategory(button.dataset.siteSearchCategory);
    });
  });

  if (siteSearchAddButton) {
    attachSaveButtonAnimation(siteSearchAddButton);
    siteSearchAddButton.addEventListener('click', function() {
      if (!optionsState.siteSearchFormExpanded) {
        setSiteSearchFormExpanded(true);
        return;
      }
      suspendSiteSearchRefresh(260);
      setSiteSearchError('');
      const key = (siteSearchKeyInput ? siteSearchKeyInput.value : '').trim();
      const name = (siteSearchNameInput ? siteSearchNameInput.value : '').trim();
      const templateRaw = (siteSearchTemplateInput ? siteSearchTemplateInput.value : '').trim();
      const aliases = normalizeAliases(siteSearchAliasInput ? siteSearchAliasInput.value : '');
      if (!key) {
        setSiteSearchError(getMessage('shortcuts_error_key', '请填写触发词。'));
        return;
      }
      if (/\s/.test(key)) {
        setSiteSearchError(getMessage('shortcuts_error_key_space', '触发词不能包含空格。'));
        return;
      }
      if (findSiteSearchKeyConflict(key, optionsState.editingSiteSearchKey || '')) {
        setSiteSearchError(getMessage('shortcuts_error_key_duplicate', '该触发词已存在，请更换。'));
        return;
      }
      const template = normalizeSiteSearchTemplate(templateRaw);
      if (!template || !template.includes('{query}')) {
        setSiteSearchError(getMessage('toast_error_template', '搜索模板必须包含 {query}。'));
        return;
      }
      const normalizedKey = key.toLowerCase();
      const editingKey = (optionsState.editingSiteSearchKey || '').toLowerCase();
      const editingItem = optionsState.customSiteSearchProviders.find(
        (item) => item.key.toLowerCase() === editingKey
      );
      const builtinKey = getSiteSearchBuiltinKey(editingItem);
      let next = optionsState.customSiteSearchProviders.filter((item) => item.key.toLowerCase() !== normalizedKey);
      if (editingKey && editingKey !== normalizedKey) {
        next = next.filter((item) => item.key.toLowerCase() !== editingKey);
      }
      const nextItem = normalizeSiteSearchProvider({
        ...(editingItem || {}),
        id: String(editingItem && editingItem.id ? editingItem.id : '').trim() || createPersistentId('source'),
        key: key,
        name: name || key,
        template: template,
        aliases: aliases,
        category: optionsState.siteSearchDraftCategory === 'searchEngine' ? 'searchEngine' : 'site',
        ...(builtinKey ? { builtinKey } : {})
      });
      if (!nextItem) {
        setSiteSearchError(getMessage('toast_error', '操作失败，请重试。'));
        return;
      }
      next.unshift(nextItem);
      const lowerKey = normalizedKey;
      const nextDisabledKeys = new Set(optionsState.disabledSiteSearchKeys);
      if (builtinKey) {
        nextDisabledKeys.add(builtinKey);
      } else {
        nextDisabledKeys.delete(lowerKey);
      }
      saveSiteSearchProviderState(next, nextDisabledKeys).then(() => {
        optionsState.customSiteSearchProviders = next;
        optionsState.customSiteSearchProviderIdsReady = true;
        optionsState.disabledSiteSearchKeys = nextDisabledKeys;
        renderSiteSearchList();
        refreshSiteSearchProviders();
        resetSiteSearchForm();
        showToast(getMessage('toast_saved', '已保存'), false);
      }).catch(() => {
        setSiteSearchError(getMessage('toast_error', '操作失败，请重试。'));
        showToast(getMessage('toast_error', '操作失败，请重试。'), true);
      });
    });
  }

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
