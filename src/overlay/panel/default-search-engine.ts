import { readSearchEngineState } from '../../domain/search/search-engine-state-reader';
import type * as SearchUtils from '../../domain/search/search-utils';
import type { SearchEngineState } from '../../domain/search/types';
import type { StorageAreaFacade } from '../../platform/settings-storage';
import type { Translate } from './types';

interface DefaultSearchEngineState {
  // The engine the user chose, once read from storage.
  overlaySearchEngineState: SearchEngineState | null;
}

interface DefaultSearchEngineDeps {
  getOverlayFaviconUrlResolver(): { getPageFaviconCandidateUrl(url: string): string } | null;
  t: Translate;
  storageArea: StorageAreaFacade | null;
  DEFAULT_SEARCH_ENGINE_STORAGE_KEY: string;
  SEARCH_UTILS: Pick<typeof SearchUtils, 'isRetiredSearchEngineState'>;
  overlayState: DefaultSearchEngineState;
}

// The default search engine inside the overlay: its stored choice and
// the search URL, label, theme and favicon it contributes.
function createDefaultSearchEngine(deps: DefaultSearchEngineDeps) {
  const {
    getOverlayFaviconUrlResolver,
    t,
    storageArea,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_UTILS
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  function buildSearchUrlFromTemplate(template: string, query: string): string {
    if (!template) {
      return '';
    }
    return template.replace(/\{query\}/g, encodeURIComponent(query || ''));
  }

  function getOverlaySearchEngineState(): SearchEngineState {
    return overlayState.overlaySearchEngineState || {};
  }

  function buildDefaultSearchUrlForOverlay(query: string): string {
    const state = getOverlaySearchEngineState();
    if (state.searchTemplate) {
      return buildSearchUrlFromTemplate(state.searchTemplate, query);
    }
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function getDefaultSearchEngineFaviconUrlForOverlay(): string {
    const resolver = getOverlayFaviconUrlResolver();
    return resolver ? resolver.getPageFaviconCandidateUrl(getDefaultSearchEngineThemeUrlForOverlay()) : '';
  }

  function getDefaultSearchEngineThemeUrlForOverlay(): string {
    const state = getOverlaySearchEngineState();
    if (state.searchTemplate) {
      return buildSearchUrlFromTemplate(state.searchTemplate, 'test');
    }
    if (state.host) {
      return `https://${state.host}`;
    }
    return 'https://www.google.com';
  }

  function getSearchActionLabel(): string {
    return t('action_search', '搜索');
  }

  // Reads the stored engine; onReload runs when one was found.
  function loadOverlaySearchEngineState(onReload?: () => void): Promise<SearchEngineState | null> {
    if (!storageArea || typeof storageArea.get !== 'function') {
      return Promise.resolve(overlayState.overlaySearchEngineState);
    }
    const area = storageArea;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: Record<string, unknown> | null | undefined): void => {
        if (settled) {
          return;
        }
        settled = true;
        const stored = readSearchEngineState(result ? result[DEFAULT_SEARCH_ENGINE_STORAGE_KEY] : null);
        if (stored && stored.id &&
            (!SEARCH_UTILS.isRetiredSearchEngineState(stored))) {
          overlayState.overlaySearchEngineState = stored;
          if (typeof onReload === 'function') {
            onReload();
          }
        }
        resolve(overlayState.overlaySearchEngineState);
      };
      try {
        const maybePromise = area.get([DEFAULT_SEARCH_ENGINE_STORAGE_KEY], finish);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish, () => finish(null));
        }
      } catch (_error) {
        finish(null);
      }
    });
  }

  return {
    buildDefaultSearchUrlForOverlay,
    getDefaultSearchEngineFaviconUrlForOverlay,
    getDefaultSearchEngineThemeUrlForOverlay,
    getSearchActionLabel,
    loadOverlaySearchEngineState
  };
}

export { createDefaultSearchEngine };
export type { DefaultSearchEngineDeps, DefaultSearchEngineState };
