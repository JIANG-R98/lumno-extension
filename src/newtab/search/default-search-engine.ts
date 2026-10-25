// The default search engine: the built-in engine list, the stored choice,
// and the search URL, label, theme and favicon each engine contributes.
import type * as SearchUtils from '../../domain/search/search-utils';
import type { SearchEngineState } from '../../domain/search/types';
import type { StorageAreaLike } from '../../domain/storage-port';
import type { Translate } from '../newtab-types';

// The browser's default search engine as the background stores it.
interface DefaultSearchEngineState extends SearchEngineState {
  id: string;
  name: string;
  host: string;
  updatedAt: number;
}

interface SearchEngineDef {
  id: string;
  name: string;
  hostMatches: string[];
  searchUrl(query: string): string;
}

interface DefaultSearchEngineModuleState {
  defaultSearchEngineState: DefaultSearchEngineState;
}

interface DefaultSearchEngineDeps {
  getPageFaviconCandidateUrl(pageUrl: string): string;
  t: Translate;
  storageArea: StorageAreaLike | null;
  DEFAULT_SEARCH_ENGINE_STORAGE_KEY: string;
  SEARCH_UTILS: Pick<typeof SearchUtils, 'isRetiredSearchEngineState'>;
  pageState: DefaultSearchEngineModuleState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// A stored engine choice; null when it names no engine or one Lumno no
// longer offers.
function readStoredSearchEngineState(
  value: unknown,
  isRetired: (state: SearchEngineState) => boolean
): DefaultSearchEngineState | null {
  if (!isRecord(value) || !value.id) {
    return null;
  }
  const state: DefaultSearchEngineState = {
    id: String(value.id),
    name: typeof value.name === 'string' ? value.name : '',
    host: typeof value.host === 'string' ? value.host : '',
    updatedAt: Number(value.updatedAt) || 0,
    ...(typeof value.searchTemplate === 'string' ? { searchTemplate: value.searchTemplate } : {})
  };
  return isRetired(state) ? null : state;
}

function createDefaultSearchEngine(deps: DefaultSearchEngineDeps) {
  const {
    getPageFaviconCandidateUrl,
    t,
    storageArea,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_UTILS
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const SEARCH_ENGINE_DEFS: readonly SearchEngineDef[] = [
    {
      id: 'google',
      name: 'Google',
      hostMatches: ['google.'],
      searchUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
    },
    {
      id: 'kagi',
      name: 'Kagi',
      hostMatches: ['kagi.com'],
      searchUrl: (query) => `https://kagi.com/search?q=${encodeURIComponent(query)}`
    },
    {
      id: 'bing',
      name: 'Bing',
      hostMatches: ['bing.com'],
      searchUrl: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`
    },
    {
      id: 'baidu',
      name: '百度',
      hostMatches: ['baidu.com'],
      searchUrl: (query) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
    },
    {
      id: 'duckduckgo',
      name: 'DuckDuckGo',
      hostMatches: ['duckduckgo.com'],
      searchUrl: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
    },
    {
      id: 'yahoo',
      name: 'Yahoo',
      hostMatches: ['search.yahoo.com'],
      searchUrl: (query) => `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`
    },
    {
      id: 'yandex',
      name: 'Yandex',
      hostMatches: ['yandex.com'],
      searchUrl: (query) => `https://yandex.com/search/?text=${encodeURIComponent(query)}`
    },
    {
      id: 'sogou',
      name: '搜狗',
      hostMatches: ['sogou.com'],
      searchUrl: (query) => `https://www.sogou.com/web?query=${encodeURIComponent(query)}`
    },
    {
      id: 'shenma',
      name: '神马',
      hostMatches: ['sm.cn'],
      searchUrl: (query) => `https://m.sm.cn/s?q=${encodeURIComponent(query)}`
    }
  ];

  function getSearchEngineById(id: string): SearchEngineDef | null {
    if (!id) {
      return null;
    }
    return SEARCH_ENGINE_DEFS.find((engine) => engine.id === id) || null;
  }

  function buildDefaultSearchUrl(query: string): string {
    const engine = getSearchEngineById(pageState.defaultSearchEngineState.id);
    if (engine) {
      return engine.searchUrl(query);
    }
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function getDefaultSearchEngineThemeUrl(): string {
    const engine = getSearchEngineById(pageState.defaultSearchEngineState.id);
    if (engine) {
      return engine.searchUrl('test');
    }
    return 'https://www.google.com';
  }

  function getDefaultSearchEngineFaviconUrl(): string {
    return getPageFaviconCandidateUrl(getDefaultSearchEngineThemeUrl());
  }

  function getSearchActionLabel(): string {
    return t('action_search', '搜索');
  }

  function loadDefaultSearchEngineState(): void {
    if (!storageArea) {
      return;
    }
    void storageArea.get([DEFAULT_SEARCH_ENGINE_STORAGE_KEY], (result) => {
      const stored = readStoredSearchEngineState(
        result ? result[DEFAULT_SEARCH_ENGINE_STORAGE_KEY] : null,
        SEARCH_UTILS.isRetiredSearchEngineState
      );
      if (stored) {
        pageState.defaultSearchEngineState = stored;
      }
    });
  }

  return {
    buildDefaultSearchUrl,
    getDefaultSearchEngineThemeUrl,
    getDefaultSearchEngineFaviconUrl,
    getSearchActionLabel,
    loadDefaultSearchEngineState
  };
}

type DefaultSearchEngine = ReturnType<typeof createDefaultSearchEngine>;

export { createDefaultSearchEngine, readStoredSearchEngineState };
export type { DefaultSearchEngine, DefaultSearchEngineDeps, DefaultSearchEngineModuleState, DefaultSearchEngineState };
