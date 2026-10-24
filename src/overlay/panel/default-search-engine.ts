// The default search engine inside the overlay: its stored choice and
// the search URL, label, theme and favicon it contributes.
function createDefaultSearchEngine(deps) {
  const {
    getOverlayFaviconUrlResolver,
    t,
    storageArea,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_UTILS
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  function buildSearchUrlFromTemplate(template, query) {
    if (!template) {
      return '';
    }
    return template.replace(/\{query\}/g, encodeURIComponent(query || ''));
  }

  function getOverlaySearchEngineState() {
    return overlayState.overlaySearchEngineState || {};
  }

  function buildDefaultSearchUrlForOverlay(query) {
    const state = getOverlaySearchEngineState();
    if (state.searchTemplate) {
      return buildSearchUrlFromTemplate(state.searchTemplate, query);
    }
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function getDefaultSearchEngineFaviconUrlForOverlay() {
    const resolver = getOverlayFaviconUrlResolver();
    return resolver ? resolver.getPageFaviconCandidateUrl(getDefaultSearchEngineThemeUrlForOverlay()) : '';
  }

  function getDefaultSearchEngineThemeUrlForOverlay() {
    const state = getOverlaySearchEngineState();
    if (state.searchTemplate) {
      return buildSearchUrlFromTemplate(state.searchTemplate, 'test');
    }
    if (state.host) {
      return `https://${state.host}`;
    }
    return 'https://www.google.com';
  }

  function getSearchActionLabel() {
    return t('action_search', '搜索');
  }

  function loadOverlaySearchEngineState(onReload) {
    if (!storageArea || typeof storageArea.get !== 'function') {
      return Promise.resolve(overlayState.overlaySearchEngineState);
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        const stored = result ? result[DEFAULT_SEARCH_ENGINE_STORAGE_KEY] : null;
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
        const maybePromise = storageArea.get([DEFAULT_SEARCH_ENGINE_STORAGE_KEY], finish);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish, () => finish(null));
        }
      } catch (error) {
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
