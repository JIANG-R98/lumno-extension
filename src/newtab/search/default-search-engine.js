(function(root) {
  // The default search engine: the built-in engine list, the stored choice,
  // and the search URL, label, theme and favicon each engine contributes.
  function createDefaultSearchEngine(deps) {
    const {
      getPageFaviconCandidateUrl,
      t,
      storageArea,
      DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
      SEARCH_UTILS
    } = deps;

    // The page state object shared with newtab.js and the other modules.
    const pageState = deps.pageState;

    const SEARCH_ENGINE_DEFS = [
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

    function getSearchEngineById(id) {
      if (!id) {
        return null;
      }
      return SEARCH_ENGINE_DEFS.find((engine) => engine.id === id) || null;
    }

    function buildDefaultSearchUrl(query) {
      const engine = getSearchEngineById(pageState.defaultSearchEngineState.id);
      if (engine && typeof engine.searchUrl === 'function') {
        return engine.searchUrl(query);
      }
      return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }

    function getDefaultSearchEngineThemeUrl() {
      const engine = getSearchEngineById(pageState.defaultSearchEngineState.id);
      if (engine && typeof engine.searchUrl === 'function') {
        return engine.searchUrl('test');
      }
      return 'https://www.google.com';
    }

    function getDefaultSearchEngineFaviconUrl() {
      return getPageFaviconCandidateUrl(getDefaultSearchEngineThemeUrl());
    }

    function getSearchActionLabel() {
      return t('action_search', '搜索');
    }

    function loadDefaultSearchEngineState() {
      if (!storageArea) {
        return;
      }
      storageArea.get([DEFAULT_SEARCH_ENGINE_STORAGE_KEY], (result) => {
        const stored = result ? result[DEFAULT_SEARCH_ENGINE_STORAGE_KEY] : null;
        if (stored && stored.id &&
            (!SEARCH_UTILS.isRetiredSearchEngineState(stored))) {
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

  root.LumnoNewtabDefaultSearchEngine = { createDefaultSearchEngine };
})(globalThis);
