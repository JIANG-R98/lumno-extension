// @ts-nocheck
// Search requests from New Tab and the overlay: interactive site-search
// providers, aggregate search across several engines, the help center index,
// and the search and site-search message handlers.
//
// A module of the service worker; background.js imports it before its own code
// runs. Its functions use background.js bindings (storageArea,
// AGGREGATE_SEARCH, AI_PROVIDER_SUBMIT, waitForTabComplete, ...) only when they
// run, never while this file loads, because background.js has not initialized
// its own top-level bindings yet at that point.

import * as AGGREGATE_SEARCH from './aggregate-search';
import * as AGGREGATE_SEARCH_STORE from '../domain/search/aggregate-search-store';
import * as LumnoAggregateSearchStorage from '../platform/aggregate-search-storage';
import * as AI_PROVIDER_SUBMIT from './ai-provider-submit';
import * as COMMUNITY_LINKS from '../domain/community-links';
import * as HELP_CENTER_SEARCH from '../domain/search/help-center-search';
import * as SEARCH_RESULT_TABS from './search-result-tabs';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import {
  AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY,
  AGGREGATE_SEARCH_STORAGE_KEY,
  getShortcutUrl,
  loadShortcutRules,
  storageArea,
  waitForTabComplete
} from './background';
import {
  abortSearchEngineSuggestionRequest,
  buildDefaultSearchUrl,
  clearPendingSearch,
  consumeSearchEngineSuggestionRequest,
  deleteHistoryUrlFromSearch,
  getDirectNavigationUrl,
  getSearchEngineSuggestionRequestKey,
  getSearchEngineSuggestions,
  getSearchSuggestions,
  getSiteSearchProviderEntryUrl,
  isInteractiveSiteSearchProvider,
  loadSiteSearchProviders,
  markPendingSearchTab,
  pendingSearchTabId,
  recordSearchSuggestionSelection,
  releaseSearchEngineSuggestionRequest,
  scheduleSearchEngineSuggestionPrefetch,
  searchEngineSuggestionRequests,
  shouldPrefetchSearchEngineSuggestions,
  startSearchEngineSuggestionRequest
} from './search-suggestions-service';
import { createSearchResultTab, resolveSearchResultTabPlacement } from './browser-urls-service';

function runInteractiveSiteSearchProvider(provider, query, sender, disposition) {
  const prompt = String(query || '').trim();
  const entryUrl = getSiteSearchProviderEntryUrl(provider, prompt);
  const submitStrategy = String((provider && provider.submitStrategy) || '').trim();
  const targetDisposition = disposition === 'currentTab'
    ? 'currentTab'
    : (disposition === 'backgroundTab' ? 'backgroundTab' : 'newTab');
  return new Promise((resolve) => {
    if (!entryUrl || !prompt || !isInteractiveSiteSearchProvider(provider)) {
      resolve({ ok: false, reason: 'invalid-provider-request' });
      return;
    }
    const finish = (result) => {
      resolve(result && typeof result === 'object' ? result : { ok: false, reason: 'unknown' });
    };
    const handleReadyTab = (tab) => {
      if (!tab || typeof tab.id !== 'number') {
        finish({ ok: false, reason: 'tab-unavailable' });
        return;
      }
      waitForTabComplete(tab.id, 15000)
        .catch(() => tab)
        .then(() => AI_PROVIDER_SUBMIT.submitPromptInTab(
          chrome,
          tab.id,
          prompt,
          submitStrategy,
          entryUrl
        ))
        .then((result) => {
          finish({
            ok: Boolean(result && result.ok),
            tabId: tab.id,
            url: entryUrl,
            strategy: submitStrategy,
            method: result && result.method ? result.method : '',
            reason: result && result.reason ? result.reason : ''
          });
        })
        .catch((error) => {
          finish({
            ok: false,
            tabId: tab.id,
            url: entryUrl,
            reason: error && error.message ? error.message : 'interactive-site-search-failed'
          });
        });
    };
    const updateTab = (tabId) => {
      chrome.tabs.update(tabId, { url: entryUrl, active: true }, (tab) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          finish({ ok: false, reason: chrome.runtime.lastError.message || 'tab-update-failed' });
          return;
        }
        handleReadyTab(tab);
      });
    };
    if (targetDisposition === 'currentTab') {
      if (sender && sender.tab && typeof sender.tab.id === 'number') {
        updateTab(sender.tab.id);
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          finish({ ok: false, reason: chrome.runtime.lastError.message || 'active-tab-unavailable' });
          return;
        }
        const activeTab = Array.isArray(tabs) && tabs.length > 0 ? tabs[0] : null;
        if (activeTab && typeof activeTab.id === 'number') {
          updateTab(activeTab.id);
          return;
        }
        finish({ ok: false, reason: 'active-tab-unavailable' });
      });
      return;
    }
    const sourceTab = sender && sender.tab ? sender.tab : null;
    createSearchResultTab({ url: entryUrl, active: targetDisposition !== 'backgroundTab' }, sourceTab, (tab, info) => {
      if (!info || info.ok === false) {
        finish({ ok: false, reason: (info && info.reason) || 'tab-create-failed' });
        return;
      }
      handleReadyTab(tab);
    });
  });
}

let aggregateSearchQueryRunner = null;
function runAggregateSearchQuery(aggregateId, query, sender, disposition) {
  if (!aggregateSearchQueryRunner) {
    aggregateSearchQueryRunner = AGGREGATE_SEARCH.createAggregateSearchQueryRunner({
      aggregateSearchStore: AGGREGATE_SEARCH_STORE,
      chromeApi: chrome,
      loadAggregateSearches: () => LumnoAggregateSearchStorage.loadAggregateSearches(
        storageArea,
        AGGREGATE_SEARCH_STORAGE_KEY,
        chrome
      ),
      loadSiteSearchProviders,
      resolveTabPlacement: resolveSearchResultTabPlacement,
      loadAggregateSearchAutoGroupEnabled() {
        return LumnoSettingsStorage.readStorageValue(
          storageArea,
          chrome,
          AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY
        );
      },
      openAggregateSearch: AGGREGATE_SEARCH.openAggregateSearch,
      getEntryUrl: getSiteSearchProviderEntryUrl,
      isInteractiveProvider: isInteractiveSiteSearchProvider,
      waitForTabComplete,
      submitPromptInTab: AI_PROVIDER_SUBMIT.submitPromptInTab
    });
  }
  return aggregateSearchQueryRunner(aggregateId, query, sender, disposition);
}

// Search, suggestions and history.
export const SEARCH_MESSAGE_HANDLERS = Object.freeze({
  searchOrNavigate(request, sender, sendResponse) {
    const query = request.query ? String(request.query) : '';
    const forceSearch = Boolean(request.forceSearch);
    const openInBackgroundTab = request.disposition === 'backgroundTab';
    const sourceTab = sender && sender.tab ? sender.tab : null;
    Promise.all([loadShortcutRules(), resolveSearchResultTabPlacement(sourceTab)]).then(([rules, placement]) => {
      const createResolvedTab = (url, callback) => {
        createSearchResultTab({
          url,
          active: !openInBackgroundTab
        }, sourceTab, callback, placement);
      };
      const shortcutUrl = getShortcutUrl(query, rules);
      if (shortcutUrl) {
        createResolvedTab(shortcutUrl, () => {
          sendResponse({ ok: true, url: shortcutUrl });
        });
        return;
      }
      const directUrl = !forceSearch ? getDirectNavigationUrl(query) : '';
      if (directUrl) {
        createResolvedTab(directUrl, () => {
          sendResponse({ ok: true, url: directUrl });
        });
      } else {
        // It's a search query - use browser default search engine
        const fallbackUrl = buildDefaultSearchUrl(query);
        // Preserve the original browser search path unless an adjacent position is selected.
        if (typeof placement.index !== 'number') {
          if (openInBackgroundTab) {
            createResolvedTab(fallbackUrl, () => {
              sendResponse({ ok: true, url: fallbackUrl });
            });
            return;
          }
          if (chrome && chrome.search && typeof chrome.search.query === 'function') {
            markPendingSearchTab(null, sourceTab);
            try {
              chrome.search.query({ text: query, disposition: 'NEW_TAB' }, () => {
                if (chrome.runtime && chrome.runtime.lastError) {
                  clearPendingSearch();
                  createResolvedTab(fallbackUrl, () => {
                    sendResponse({ ok: true, url: fallbackUrl });
                  });
                  return;
                }
                sendResponse({ ok: true, url: fallbackUrl });
              });
              return;
            } catch (error) {
              clearPendingSearch();
            }
          }
          createResolvedTab(fallbackUrl, () => {
            sendResponse({ ok: true, url: fallbackUrl });
          });
          return;
        }
        if (chrome && chrome.search && typeof chrome.search.query === 'function') {
          createResolvedTab('about:blank', (tab, info) => {
            if (!tab || typeof tab.id !== 'number' || !info || !info.ok) {
              sendResponse({ ok: false, reason: (info && info.reason) || 'tab-create-failed' });
              return;
            }
            markPendingSearchTab(tab.id, sourceTab);
            SEARCH_RESULT_TABS.searchInTab(chrome, {
              query,
              tabId: tab.id,
              fallbackUrl,
              onFallback() {
                if (pendingSearchTabId === tab.id) {
                  clearPendingSearch();
                }
              }
            }, (result) => {
              sendResponse({ ...result, url: fallbackUrl });
            });
          });
          return;
        }
        createResolvedTab(fallbackUrl, () => {
          sendResponse({ ok: true, url: fallbackUrl });
        });
      }
    });
    return true;
  },
  getSearchSuggestions(request, sender, sendResponse) {
    const query = request.query;
    const requestKey = getSearchEngineSuggestionRequestKey(request, sender);
    if (shouldPrefetchSearchEngineSuggestions(request, query)) {
      scheduleSearchEngineSuggestionPrefetch(requestKey, query);
    } else {
      abortSearchEngineSuggestionRequest(requestKey);
    }
    getSearchSuggestions(query, {
      sourceTypes: request.sourceTypes,
      includeOpenTabs: request.includeOpenTabs
    }).then(suggestions => {
      sendResponse({ suggestions: suggestions });
    }).catch(() => {
      sendResponse({ suggestions: [] });
    });
    return true; // Keep the message channel open for async response
  },
  getSearchEngineSuggestions(request, sender, sendResponse) {
    const query = request.query;
    const requestKey = getSearchEngineSuggestionRequestKey(request, sender);
    const requestRecord = consumeSearchEngineSuggestionRequest(requestKey, query);
    if (!requestRecord) {
      sendResponse({ suggestions: [], aborted: false, hasRemoteSuggestions: false });
      return;
    }
    const controller = requestRecord.controller;
    getSearchEngineSuggestions(query, request.localSuggestions, {
      signal: controller.signal,
      rawEngineSuggestionsPromise: startSearchEngineSuggestionRequest(requestRecord),
      searchFirst: request.searchFirst === true
    }).then((suggestions) => {
      const isCurrent = searchEngineSuggestionRequests.get(requestKey) === requestRecord;
      const hasRemoteSuggestions = isCurrent && !controller.signal.aborted && suggestions.some((suggestion) => (
        suggestion && suggestion.type === 'googleSuggest'
      ));
      sendResponse({
        suggestions: isCurrent && !controller.signal.aborted ? suggestions : [],
        aborted: !isCurrent || controller.signal.aborted,
        hasRemoteSuggestions
      });
    }).catch(() => {
      sendResponse({ suggestions: [], aborted: controller.signal.aborted, hasRemoteSuggestions: false });
    }).finally(() => {
      if (searchEngineSuggestionRequests.get(requestKey) === requestRecord) {
        releaseSearchEngineSuggestionRequest(requestKey, requestRecord);
      }
    });
    return true;
  },
  recordSearchSuggestionSelection(request, sender, sendResponse) {
    recordSearchSuggestionSelection(request)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          reason: error && error.message ? error.message : 'record-selection-failed'
        });
      });
    return true;
  },
  deleteHistoryUrl(request, sender, sendResponse) {
    const targetUrl = typeof request.url === 'string' ? request.url : '';
    return deleteHistoryUrlFromSearch(targetUrl, sendResponse);
  }
});

let helpCenterIndexLoader = null;
let helpCenterSynonymsLoader = null;

// Help center pages matching the query, read from the index and synonym list of the given
// interface language. Without synonyms the search still runs, only more literally.
function getHelpCenterSearchResults(query, locale) {
  if (!String(query || '').trim()) {
    return Promise.resolve([]);
  }
  if (!helpCenterIndexLoader) {
    const fetchImpl = (url, init) => fetch(url, init);
    helpCenterIndexLoader = HELP_CENTER_SEARCH.createIndexLoader({ fetchImpl });
    // A language with no synonym list (404) is cached as empty rather than asked for on every key.
    helpCenterSynonymsLoader = HELP_CENTER_SEARCH.createIndexLoader({
      fetchImpl: (url, init) => fetch(url, init).then((response) => (
        response.status === 404 ? { ok: true, json: () => [] } : response
      )),
      parse: HELP_CENTER_SEARCH.normalizeSynonyms
    });
  }
  return Promise.all([
    helpCenterIndexLoader.load(COMMUNITY_LINKS.getHelpSearchIndexUrl(locale)),
    helpCenterSynonymsLoader.load(COMMUNITY_LINKS.getHelpSearchSynonymsUrl(locale)).catch(() => [])
  ]).then(([index, synonyms]) => HELP_CENTER_SEARCH.searchIndex(index, query, {
    origin: COMMUNITY_LINKS.WEB_ORIGIN,
    synonyms
  }));
}

// Site search, help center and aggregate search.
export const SITE_SEARCH_MESSAGE_HANDLERS = Object.freeze({
  getSiteSearchProviders(request, sender, sendResponse) {
    loadSiteSearchProviders().then((items) => {
      sendResponse({ items: items });
    }).catch(() => {
      sendResponse({
        items: [],
        reason: 'site-search-provider-load-failed'
      });
    });
    return true;
  },
  getHelpCenterSearchResults(request, sender, sendResponse) {
    getHelpCenterSearchResults(request.query, request.locale).then((items) => {
      sendResponse({ items });
    }).catch(() => {
      sendResponse({ items: [], reason: 'help-center-index-unavailable' });
    });
    return true;
  },
  runSiteSearchProviderQuery(request, sender, sendResponse) {
    runInteractiveSiteSearchProvider(
      request.provider,
      request.query,
      sender,
      request.disposition
    ).then((result) => {
      sendResponse(result);
    }).catch((error) => {
      sendResponse({
        ok: false,
        reason: error && error.message ? error.message : 'interactive-site-search-failed'
      });
    });
    return true;
  },
  runAggregateSearchQuery(request, sender, sendResponse) {
    runAggregateSearchQuery(
      request.aggregateId,
      request.query,
      sender,
      request.disposition
    ).then(sendResponse).catch((error) => {
      sendResponse({
        ok: false,
        reason: error && error.message ? error.message : 'aggregate-search-failed'
      });
    });
    return true;
  }
});
