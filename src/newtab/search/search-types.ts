// Types and helpers the New Tab search modules share.
import type { LocalSearchScope, SiteSearchProvider } from '../../domain/search/types';
import type { Suggestion } from '../../shared/react/search/suggestion-list/types';

// What a suggestion request asks for besides the query.
interface RequestSuggestionsOptions {
  // Skip the wait before asking for remote suggestions.
  immediate?: boolean;
  // Show a direct address only once the open tabs have been matched.
  deferInitialDirectNavigationRender?: boolean;
}

type RequestSuggestions = (query: string, options?: RequestSuggestionsOptions) => unknown;

// Shows the suggestions for the query.
type RenderSuggestions = (suggestions: Suggestion[], query: string) => unknown;

// The local scope the input is narrowed to: a typed trigger's, or one
// picked in the mode menu, which has only its source.
type ActiveLocalScope = Pick<LocalSearchScope, 'sourceType'> & Partial<Pick<LocalSearchScope, 'trigger' | 'key'>>;

// The aggregate search a search mode stands for; '' for a site search.
function getAggregateSearchId(provider: SiteSearchProvider | null | undefined): string {
  if (!provider || !('aggregateId' in provider)) {
    return '';
  }
  const id = provider.aggregateId;
  return typeof id === 'string' ? id : '';
}

export { getAggregateSearchId };
export type { ActiveLocalScope, RenderSuggestions, RequestSuggestions, RequestSuggestionsOptions };
