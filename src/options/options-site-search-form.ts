// Site search provider checks shared by the lists and the add form:
// normalizing providers, finding key conflicts, and holding storage
// refreshes back while a save settles.
import type { AggregateSearch } from '../domain/search/aggregate-search-store';
import type { SiteSearchProvider } from '../domain/search/types';
import type { createSiteSearchModel } from './options-site-search';
import * as SearchSiteSearchProviders from '../domain/search/utils/site-search-providers';

interface SiteSearchFormState {
  siteSearchModel: Pick<ReturnType<typeof createSiteSearchModel>, 'findSiteSearchKeyConflict'>;
  aggregateSearches: AggregateSearch[];
  defaultSiteSearchProviders: SiteSearchProvider[];
  customSiteSearchProviders: SiteSearchProvider[];
  // Refreshes from storage wait until then, so a save does not redraw mid-animation.
  siteSearchRefreshSuppressUntil: number;
}

interface SiteSearchFormDeps {
  optionsState: SiteSearchFormState;
}

function createSiteSearchForm(deps: SiteSearchFormDeps) {

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function normalizeSiteSearchTemplate(template: unknown): string {
    return SearchSiteSearchProviders.normalizeSiteSearchTemplate(template);
  }

  function isAiSiteSearchProvider(item: Partial<SiteSearchProvider> | null | undefined): boolean {
    return SearchSiteSearchProviders.isAiSiteSearchProvider(item);
  }

  function isSearchEngineSiteSearchProvider(item: Partial<SiteSearchProvider> | null | undefined): boolean {
    return SearchSiteSearchProviders.isSearchEngineSiteSearchProvider(item);
  }

  function normalizeSiteSearchProvider(
    item: Partial<SiteSearchProvider> | null | undefined,
    baseItem?: Partial<SiteSearchProvider> | null
  ): SiteSearchProvider | null {
    return SearchSiteSearchProviders.normalizeSiteSearchProvider(item, baseItem);
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

  function suspendSiteSearchRefresh(durationMs: number): void {
    const now = Date.now();
    optionsState.siteSearchRefreshSuppressUntil = Math.max(optionsState.siteSearchRefreshSuppressUntil, now + durationMs);
  }

  return {
    normalizeSiteSearchTemplate,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    normalizeSiteSearchProvider,
    findSiteSearchKeyConflict,
    suspendSiteSearchRefresh
  };
}

export { createSiteSearchForm };
export type { SiteSearchFormDeps, SiteSearchFormState };
