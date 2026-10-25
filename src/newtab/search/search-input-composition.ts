// IME composition in the search input: holds suggestion updates while a
// composition is open and runs them once it commits.
import type { SuggestionLike } from '../../domain/search/types';
import type { createImeKeyGuard } from '../../domain/search/ime-key-guard';
import type { DirectNavigationSettleController } from './direct-navigation-settle';

interface SearchInputCompositionState {
  inputParts: { input: HTMLInputElement };
  // Bumped by each request, so an older one's results are dropped.
  suggestionRequestSeq: number;
  remoteSuggestionDebounceTimer: ReturnType<typeof setTimeout> | null;
  suggestionRequestWatchdogTimer: ReturnType<typeof setTimeout> | null;
  latestQuery: string;
  latestRawQuery: string;
}

interface RequestSuggestionsOptions {
  // Skip the wait before asking for remote suggestions.
  immediate?: boolean;
  // Show a direct address only once the open tabs have been matched.
  deferInitialDirectNavigationRender?: boolean;
}

interface SearchInputCompositionDeps {
  directNavigationSettleController: Pick<DirectNavigationSettleController<unknown>, 'cancel'>;
  imeKeyGuard: Pick<ReturnType<typeof createImeKeyGuard>, 'markCompositionStart' | 'markCompositionEnd' | 'markKeyUp'>;
  clearAutocomplete(): void;
  clearSearchSuggestions(): void;
  // The address the query is, as a suggestion; null when it is not one.
  getDirectUrlSuggestion(query: string): SuggestionLike | null;
  renderPendingSuggestions(query: string): unknown;
  requestSuggestions(query: string, options?: RequestSuggestionsOptions): unknown;
  pageState: SearchInputCompositionState;
}

function createSearchInputComposition(deps: SearchInputCompositionDeps): void {
  const {
    directNavigationSettleController,
    imeKeyGuard,
    clearAutocomplete,
    clearSearchSuggestions,
    getDirectUrlSuggestion,
    renderPendingSuggestions,
    requestSuggestions
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const input = pageState.inputParts.input;

  input.addEventListener('compositionstart', function(event) {
    pageState.suggestionRequestSeq += 1;
    directNavigationSettleController.cancel();
    if (pageState.remoteSuggestionDebounceTimer) {
      clearTimeout(pageState.remoteSuggestionDebounceTimer);
      pageState.remoteSuggestionDebounceTimer = null;
    }
    if (pageState.suggestionRequestWatchdogTimer) {
      clearTimeout(pageState.suggestionRequestWatchdogTimer);
      pageState.suggestionRequestWatchdogTimer = null;
    }
    imeKeyGuard.markCompositionStart(event);
    clearAutocomplete();
  });

  input.addEventListener('keyup', imeKeyGuard.markKeyUp, true);

  input.addEventListener('compositionend', function(event) {
    imeKeyGuard.markCompositionEnd(event);
    const rawValue = input.value;
    const query = rawValue.trim();
    pageState.latestQuery = query;
    pageState.latestRawQuery = rawValue;
    clearAutocomplete();
    if (!query) {
      if (pageState.remoteSuggestionDebounceTimer) {
        clearTimeout(pageState.remoteSuggestionDebounceTimer);
        pageState.remoteSuggestionDebounceTimer = null;
      }
      clearSearchSuggestions();
      return;
    }
    const directUrlSuggestion = getDirectUrlSuggestion(query);
    if (directUrlSuggestion) {
      const hasCachedOpenTabMatch =
        typeof directUrlSuggestion._xMatchedTabId === 'number';
      if (hasCachedOpenTabMatch) {
        renderPendingSuggestions(query);
      }
      requestSuggestions(query, {
        immediate: true,
        deferInitialDirectNavigationRender: !hasCachedOpenTabMatch
      });
      return;
    }
    requestSuggestions(query);
  });
}

export { createSearchInputComposition };
export type { RequestSuggestionsOptions, SearchInputCompositionDeps, SearchInputCompositionState };
