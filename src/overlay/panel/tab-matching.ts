// @ts-nocheck
// Matching open tabs: the text a tab is searched by, filtering them for
// the query, and finding the tab a suggestion already has open.
function createTabMatching(deps) {
  const {
    SEARCH_UTILS
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  function isEnglishQuery(query) {
    if (!query) {
      return false;
    }
    return /^[A-Za-z0-9\s._/-]+$/.test(query);
  }

  function getUrlDisplay(url) {
    if (!url) {
      return '';
    }
    try {
      const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '');
      const path = parsed.pathname === '/' ? '' : parsed.pathname;
      return `${host}${path}${parsed.search || ''}${parsed.hash || ''}`;
    } catch (e) {
      return url;
    }
  }

  function normalizeTabSearchToken(value) {
    return String(value || '').trim().toLowerCase();
  }

  function buildTabSearchText(tab) {
    if (!tab) {
      return '';
    }
    const parts = [];
    if (tab.title) {
      parts.push(String(tab.title));
    }
    if (tab.url) {
      parts.push(String(tab.url));
    }
    try {
      const parsed = new URL(tab.url || '');
      if (parsed.hostname) {
        parts.push(parsed.hostname);
      }
      if (parsed.pathname) {
        parts.push(parsed.pathname);
      }
    } catch (e) {
      // Ignore malformed URLs.
    }
    return parts.join(' ').toLowerCase();
  }

  function filterTabsForOverlay(tabList, queryText) {
    const list = Array.isArray(tabList) ? tabList : [];
    const normalized = normalizeTabSearchToken(queryText);
    if (!normalized) {
      if (list.length < 2 || typeof overlayState.currentOverlayTabId !== 'number') {
        return list.slice();
      }
      if (!list[0] || list[0].id !== overlayState.currentOverlayTabId) {
        return list.slice();
      }
      const reordered = list.slice();
      const currentTab = reordered.shift();
      if (currentTab) {
        reordered.splice(1, 0, currentTab);
      }
      return reordered;
    }
    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return list.slice();
    }
    return list.filter((tab) => {
      const haystack = buildTabSearchText(tab);
      if (!haystack) {
        return false;
      }
      return tokens.every((token) => haystack.includes(token));
    });
  }

  function normalizeTabMatchUrl(url) {
    return SEARCH_UTILS.buildTabMatchUrl(url);
  }

  function normalizeTabMatchUrlWithoutSearch(url) {
    return SEARCH_UTILS.buildTabMatchUrl(url, { includeSearch: false });
  }

  function getMatchedOpenTabIdForSuggestion(suggestion) {
    if (!suggestion || !suggestion.url || !Array.isArray(overlayState.tabs) || overlayState.tabs.length === 0) {
      return null;
    }
    const target = normalizeTabMatchUrl(suggestion.url);
    if (!target) {
      return null;
    }
    for (let i = 0; i < overlayState.tabs.length; i += 1) {
      const tab = overlayState.tabs[i];
      if (!tab || typeof tab.id !== 'number' || !tab.url) {
        continue;
      }
      const current = normalizeTabMatchUrl(tab.url);
      if (current && current === target) {
        return tab.id;
      }
    }
    if (overlayState.prioritizeCurrentPageMatch && typeof overlayState.currentOverlayTabId === 'number') {
      const currentTab = overlayState.tabs.find((tab) => tab && tab.id === overlayState.currentOverlayTabId) || null;
      const targetNoSearch = normalizeTabMatchUrlWithoutSearch(suggestion.url);
      const currentNoSearch = currentTab ? normalizeTabMatchUrlWithoutSearch(currentTab.url) : '';
      if (targetNoSearch && currentNoSearch && targetNoSearch === currentNoSearch) {
        return overlayState.currentOverlayTabId;
      }
    }
    return null;
  }

  function isCurrentOverlayTabUrl(url) {
    if (!overlayState.prioritizeCurrentPageMatch || !url) {
      return false;
    }
    const currentTab = typeof overlayState.currentOverlayTabId === 'number'
      ? (overlayState.tabs.find((tab) => tab && tab.id === overlayState.currentOverlayTabId) || null)
      : null;
    const currentUrl = currentTab && currentTab.url
      ? currentTab.url
      : overlayState.initialContextTabUrl;
    if (!currentUrl) {
      return false;
    }
    const targetFull = normalizeTabMatchUrl(url);
    const currentFull = normalizeTabMatchUrl(currentUrl);
    if (targetFull && currentFull && targetFull === currentFull) {
      return true;
    }
    const targetNoSearch = normalizeTabMatchUrlWithoutSearch(url);
    const currentNoSearch = normalizeTabMatchUrlWithoutSearch(currentUrl);
    return Boolean(targetNoSearch && currentNoSearch && targetNoSearch === currentNoSearch);
  }

  return {
    isEnglishQuery,
    getUrlDisplay,
    filterTabsForOverlay,
    getMatchedOpenTabIdForSuggestion,
    isCurrentOverlayTabUrl
  };
}

export { createTabMatching };
