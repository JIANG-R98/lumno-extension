// The site search form: validating providers and key conflicts, its
// expanded and editing state, inserting the query token, and the save
// button animation.
import type { AggregateSearch } from '../domain/search/aggregate-search-store';
import type * as SearchUtils from '../domain/search/search-utils';
import type { SiteSearchProvider } from '../domain/search/types';
import type { createSiteSearchModel } from './options-site-search';
import type { GetMessage } from './options-types';

type SiteSearchCategory = 'site' | 'searchEngine';

interface SiteSearchFormState {
  siteSearchModel: Pick<ReturnType<typeof createSiteSearchModel>, 'findSiteSearchKeyConflict'>;
  aggregateSearches: AggregateSearch[];
  defaultSiteSearchProviders: SiteSearchProvider[];
  customSiteSearchProviders: SiteSearchProvider[];
  siteSearchDraftCategory: SiteSearchCategory;
  siteSearchFormExpanded: boolean;
  // The provider the form edits; null while it adds one.
  editingSiteSearchKey: string | null;
  // Refreshes from storage wait until then, so a save does not redraw mid-animation.
  siteSearchRefreshSuppressUntil: number;
}

interface SiteSearchFormDeps {
  SEARCH_UTILS: Pick<typeof SearchUtils, 'normalizeSiteSearchTemplate' | 'isAiSiteSearchProvider' |
    'isSearchEngineSiteSearchProvider' | 'normalizeSiteSearchProvider'>;
  siteSearchError: HTMLElement | null;
  siteSearchCategoryButtons: HTMLElement[];
  siteSearchForm: Element | null;
  siteSearchFormTrigger: HTMLElement | null;
  siteSearchCancelButton: HTMLElement | null;
  getMessage: GetMessage;
  siteSearchKeyInput: HTMLInputElement | null;
  siteSearchAddButton: HTMLElement | null;
  siteSearchTemplateInput: HTMLInputElement | null;
  siteSearchNameInput: HTMLInputElement | null;
  siteSearchAliasInput: HTMLInputElement | null;
  optionsState: SiteSearchFormState;
}

function createSiteSearchForm(deps: SiteSearchFormDeps) {
  const {
    SEARCH_UTILS,
    siteSearchError,
    siteSearchCategoryButtons,
    siteSearchForm,
    siteSearchFormTrigger,
    siteSearchCancelButton,
    getMessage,
    siteSearchKeyInput,
    siteSearchAddButton,
    siteSearchTemplateInput,
    siteSearchNameInput,
    siteSearchAliasInput
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function normalizeSiteSearchTemplate(template: unknown): string {
    return SEARCH_UTILS.normalizeSiteSearchTemplate(template);
  }

  function isAiSiteSearchProvider(item: Partial<SiteSearchProvider> | null | undefined): boolean {
    return SEARCH_UTILS.isAiSiteSearchProvider(item);
  }

  function isSearchEngineSiteSearchProvider(item: Partial<SiteSearchProvider> | null | undefined): boolean {
    return SEARCH_UTILS.isSearchEngineSiteSearchProvider(item);
  }

  function normalizeSiteSearchProvider(
    item: Partial<SiteSearchProvider> | null | undefined,
    baseItem?: Partial<SiteSearchProvider> | null
  ): SiteSearchProvider | null {
    return SEARCH_UTILS.normalizeSiteSearchProvider(item, baseItem);
  }

  function findSiteSearchKeyConflict(
    key: string,
    allowedKey?: string,
    allowedAggregateId?: string
  ): SiteSearchProvider | AggregateSearch | null {
    return optionsState.siteSearchModel.findSiteSearchKeyConflict(key, allowedKey || '', allowedAggregateId || '', {
      aggregateSearches: optionsState.aggregateSearches,
      providers: optionsState.defaultSiteSearchProviders.concat(optionsState.customSiteSearchProviders)
    });
  }

  function setSiteSearchError(message: string): void {
    if (!siteSearchError) {
      return;
    }
    if (!message) {
      siteSearchError.textContent = '';
      siteSearchError.style.display = 'none';
      return;
    }
    siteSearchError.textContent = message;
    siteSearchError.style.display = 'block';
  }

  function setLegacySiteSearchDraftCategory(category: string | undefined): void {
    optionsState.siteSearchDraftCategory = category === 'searchEngine' ? 'searchEngine' : 'site';
    siteSearchCategoryButtons.forEach((button) => {
      const active = button.dataset.siteSearchCategory === optionsState.siteSearchDraftCategory;
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setSiteSearchFormExpanded(expanded: boolean): void {
    optionsState.siteSearchFormExpanded = expanded;
    if (siteSearchForm) {
      siteSearchForm.setAttribute('data-expanded', optionsState.siteSearchFormExpanded ? 'true' : 'false');
    }
    if (siteSearchFormTrigger) {
      siteSearchFormTrigger.setAttribute('aria-expanded', optionsState.siteSearchFormExpanded ? 'true' : 'false');
    }
    if (siteSearchCancelButton) {
      siteSearchCancelButton.style.display = optionsState.siteSearchFormExpanded ? 'inline-flex' : 'none';
      if (siteSearchCancelButton.textContent) {
        siteSearchCancelButton.textContent = getMessage('shortcuts_cancel', siteSearchCancelButton.textContent);
      }
    }
    if (optionsState.siteSearchFormExpanded && siteSearchKeyInput) {
      siteSearchKeyInput.focus();
    }
  }

  function setEditingState(key: string | null): void {
    optionsState.editingSiteSearchKey = key;
    if (siteSearchAddButton) {
      siteSearchAddButton.textContent = key
        ? getMessage('shortcuts_save', '保存修改')
        : getMessage('shortcuts_add', '添加自定义搜索');
      siteSearchAddButton.classList.add('_x_extension_shortcut_save_2024_unique_');
    }
  }

  function insertSiteSearchQueryToken(): void {
    if (!siteSearchTemplateInput) {
      return;
    }
    const token = '{query}';
    const currentValue = siteSearchTemplateInput.value;
    const existingIndex = currentValue.indexOf(token);
    if (existingIndex >= 0) {
      const nextCursor = existingIndex + token.length;
      siteSearchTemplateInput.focus();
      siteSearchTemplateInput.setSelectionRange(nextCursor, nextCursor);
      return;
    }
    const selectionStart = siteSearchTemplateInput.selectionStart ?? currentValue.length;
    const selectionEnd = siteSearchTemplateInput.selectionEnd ?? selectionStart;
    const safeStart = Math.max(0, Math.min(selectionStart, currentValue.length));
    const safeEnd = Math.max(safeStart, Math.min(selectionEnd, currentValue.length));
    const nextValue = `${currentValue.slice(0, safeStart)}${token}${currentValue.slice(safeEnd)}`;
    const nextCursor = safeStart + token.length;
    siteSearchTemplateInput.value = nextValue;
    siteSearchTemplateInput.focus();
    siteSearchTemplateInput.setSelectionRange(nextCursor, nextCursor);
    siteSearchTemplateInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function attachSaveButtonAnimation(button: HTMLElement | null): void {
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      if (!button.classList.contains('_x_extension_shortcut_save_2024_unique_')) {
        return;
      }
      button.classList.remove('_x_extension_shortcut_save_pulse_2024_unique_');
      // Reading the layout restarts the animation when the class returns.
      void button.offsetWidth;
      button.classList.add('_x_extension_shortcut_save_pulse_2024_unique_');
    });
    button.addEventListener('animationend', () => {
      button.classList.remove('_x_extension_shortcut_save_pulse_2024_unique_');
    });
  }

  function suspendSiteSearchRefresh(durationMs: number): void {
    const now = Date.now();
    optionsState.siteSearchRefreshSuppressUntil = Math.max(optionsState.siteSearchRefreshSuppressUntil, now + durationMs);
  }

  function resetSiteSearchForm(): void {
    if (siteSearchKeyInput) siteSearchKeyInput.value = '';
    if (siteSearchNameInput) siteSearchNameInput.value = '';
    if (siteSearchTemplateInput) siteSearchTemplateInput.value = '';
    if (siteSearchAliasInput) siteSearchAliasInput.value = '';
    setSiteSearchError('');
    setLegacySiteSearchDraftCategory('site');
    setEditingState(null);
    setSiteSearchFormExpanded(false);
  }

  return {
    normalizeSiteSearchTemplate,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    normalizeSiteSearchProvider,
    findSiteSearchKeyConflict,
    setSiteSearchError,
    setLegacySiteSearchDraftCategory,
    setSiteSearchFormExpanded,
    setEditingState,
    insertSiteSearchQueryToken,
    attachSaveButtonAnimation,
    suspendSiteSearchRefresh,
    resetSiteSearchForm
  };
}

export { createSiteSearchForm };
export type { SiteSearchCategory, SiteSearchFormDeps, SiteSearchFormState };
