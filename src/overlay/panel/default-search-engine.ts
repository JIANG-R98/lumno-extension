import { readSearchEngineState } from '../../domain/search/search-engine-state-reader';
import type { SearchEngineState } from '../../domain/search/types';
import { defaultSearchEngine } from '../../domain/settings/search';
import type { OverlaySettings } from '../overlay-settings';
import type { Translate } from './types';
import * as SearchSiteSearchProviders from '../../domain/search/utils/site-search-providers';

interface DefaultSearchEngineState {
  // The engine the user chose, once read from storage.
  overlaySearchEngineState: SearchEngineState | null;
}

interface DefaultSearchEngineDeps {
  getOverlayFaviconUrlResolver(): { getPageFaviconCandidateUrl(url: string): string } | null;
  t: Translate;
  settings: Pick<OverlaySettings, 'loaded' | 'get'>;
  overlayState: DefaultSearchEngineState;
}

// The default search engine inside the overlay: its stored choice and
// the search URL, label, theme and favicon it contributes.
function createDefaultSearchEngine(deps: DefaultSearchEngineDeps) {
  const {
    getOverlayFaviconUrlResolver,
    t,
    settings
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
    return settings.loaded.then(() => {
      const stored = readSearchEngineState(settings.get(defaultSearchEngine));
      if (stored && stored.id && !SearchSiteSearchProviders.isRetiredSearchEngineState(stored)) {
        overlayState.overlaySearchEngineState = stored;
        if (typeof onReload === 'function') {
          onReload();
        }
      }
      return overlayState.overlaySearchEngineState;
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
