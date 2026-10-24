// @ts-nocheck
// Suggestions the ranking adds or reshapes: open tabs, brand direct
// navigation, host diversity, and limiting and filtering by source type.
function createBrandSuggestions(deps) {
  const {
    DEFAULT_SITE_SEARCH_PROVIDERS,
    findSiteSearchProvider,
    findSiteSearchProviderByKey,
    buildSearchDedupUrlKey,
    calculateSearchRelevanceScore,
    createSearchSuggestion,
    getSearchSuggestionClusterInfo,
    getSearchBrandHostMatchScore,
    getSearchNavigationRepresentativeSignal,
    hasSearchHomeTitle,
    getSearchDirectNavigationUrl,
    getSearchDirectNavigationTitle,
    buildSearchDedupEntryKey,
    getSearchSuggestionFamilyKey,
    SEARCH_POLICY,
    groupSearchSuggestionsByKind
  } = deps;

  function isSearchOpenTabSuggestion(suggestion) {
    return Boolean(
      suggestion &&
      (
        suggestion.type === 'openTab' ||
        typeof suggestion._xMatchedTabId === 'number'
      )
    );
  }

  function buildConfiguredSearchBrandDirectSuggestion(candidates, context, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const providers = Array.isArray(settings.siteSearchProviders)
      ? settings.siteSearchProviders
      : DEFAULT_SITE_SEARCH_PROVIDERS;
    const provider = findSiteSearchProvider(context.lookupQuery || context.queryLower, providers) ||
      findSiteSearchProviderByKey(context.lookupQuery || context.queryLower, providers);
    const directUrl = String(provider && provider.directNavigationUrl || '').trim();
    if (!provider || !directUrl) {
      return null;
    }
    const directUrlKey = buildSearchDedupUrlKey(directUrl);
    const alreadyPresent = (Array.isArray(candidates) ? candidates : []).some((suggestion) => (
      suggestion && suggestion.url && buildSearchDedupUrlKey(suggestion.url) === directUrlKey
    ));
    if (alreadyPresent) {
      return null;
    }
    const directItem = {
      title: String(provider.directNavigationTitle || context.lookupQuery || provider.name || '').trim(),
      url: directUrl
    };
    const baseScore = calculateSearchRelevanceScore(directItem, 'topSite', context, settings);
    if (baseScore <= 0) {
      return null;
    }
    const reasons = ['站点直达'];
    if (typeof settings.buildReasons === 'function') {
      reasons.push(...settings.buildReasons(directItem, 'topSite', context));
    }
    return createSearchSuggestion(directItem, 'topSite', baseScore + 36, {
      favicon: typeof settings.buildFavicon === 'function' ? settings.buildFavicon(directUrl) : '',
      reasons: reasons.slice(0, 3),
      isTopSite: true,
      isSyntheticDirect: true,
      isBrandRepresentative: true
    });
  }

  function buildSearchBrandDirectSuggestion(candidates, context, options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (context.intentType !== 'brand' || context.hasInformationalIntent) {
      return null;
    }
    const configuredDirectSuggestion = buildConfiguredSearchBrandDirectSuggestion(
      candidates,
      context,
      settings
    );
    if (configuredDirectSuggestion) {
      return configuredDirectSuggestion;
    }
    const hostGroups = new Map();
    (Array.isArray(candidates) ? candidates : []).forEach((suggestion) => {
      if (!suggestion || !suggestion.url || suggestion.type === 'googleSuggest') {
        return;
      }
      const info = getSearchSuggestionClusterInfo(suggestion.url);
      if (!info.host) {
        return;
      }
      const list = hostGroups.get(info.host) || [];
      list.push(suggestion);
      hostGroups.set(info.host, list);
    });

    let bestGroup = null;
    hostGroups.forEach((group, host) => {
      const hostScore = getSearchBrandHostMatchScore(host, context);
      if (hostScore <= 0) {
        return;
      }
      const sourceSuggestion = group
        .slice()
        .sort((a, b) => {
          const signalDiff = getSearchNavigationRepresentativeSignal(b, context) -
            getSearchNavigationRepresentativeSignal(a, context);
          if (signalDiff !== 0) {
            return signalDiff;
          }
          return (b.score || 0) - (a.score || 0);
        })[0];
      const hasRepresentative = group.some((suggestion) => {
        const info = getSearchSuggestionClusterInfo(suggestion && suggestion.url);
        return info.category === 'site-root' ||
          info.category === 'repo-root' ||
          info.category === 'section' ||
          info.category === 'landing' ||
          hasSearchHomeTitle(suggestion && suggestion.title);
      });
      const totalScore = hostScore +
        Math.max(0, getSearchNavigationRepresentativeSignal(sourceSuggestion, context)) +
        Math.min(8, group.length * 2);
      if (!bestGroup || totalScore > bestGroup.totalScore) {
        bestGroup = {
          host,
          sourceSuggestion,
          hasRepresentative,
          totalScore
        };
      }
    });

    if (!bestGroup || bestGroup.hasRepresentative || !bestGroup.sourceSuggestion) {
      return null;
    }

    const directUrl = getSearchDirectNavigationUrl(bestGroup.host);
    const directTitle = getSearchDirectNavigationTitle(
      bestGroup.host,
      bestGroup.sourceSuggestion.title || bestGroup.host
    );
    const sourceType = bestGroup.sourceSuggestion.type === 'bookmark'
      ? 'bookmark'
      : ((bestGroup.sourceSuggestion.type === 'topSite' || bestGroup.sourceSuggestion.isTopSite) ? 'topSite' : 'history');
    const directItem = {
      title: directTitle,
      url: directUrl,
      lastVisitTime: bestGroup.sourceSuggestion.lastVisitTime || 0,
      visitCount: Number(bestGroup.sourceSuggestion.visitCount) || 0,
      typedCount: Number(bestGroup.sourceSuggestion.typedCount) || 0
    };
    const baseScore = calculateSearchRelevanceScore(directItem, sourceType, context, settings);
    if (baseScore <= 0) {
      return null;
    }
    const reasons = ['站点直达'];
    if (typeof settings.buildReasons === 'function') {
      reasons.push(...settings.buildReasons(directItem, sourceType, context));
    }
    return createSearchSuggestion(directItem, sourceType, baseScore + 36, {
      favicon: typeof settings.buildFavicon === 'function' ? settings.buildFavicon(directUrl) : '',
      reasons: reasons.slice(0, 3),
      isTopSite: true,
      isSyntheticDirect: true
    });
  }

  function applySearchSuggestionHostDiversity(list, options) {
    const candidates = Array.isArray(list) ? list : [];
    const settings = options && typeof options === 'object' ? options : {};
    const context = settings.context && typeof settings.context === 'object'
      ? settings.context
      : null;
    const useBrandFamilyLimit = Boolean(
      context && context.intentType === 'brand' && !context.hasInformationalIntent
    );
    const selected = [];
    const selectedKeys = new Set();
    const hostCounts = new Map();
    const clusterCounts = new Map();
    const familyCounts = new Map();
    const hostHasTopSiteRepresentative = new Set();

    const tryTake = (suggestion, hostLimit, clusterLimit, familyLimit) => {
      if (!suggestion) {
        return false;
      }
      const dedupKey = buildSearchDedupEntryKey(suggestion);
      if (!dedupKey || selectedKeys.has(dedupKey)) {
        return false;
      }
      const info = getSearchSuggestionClusterInfo(suggestion.url);
      const isEngineSuggestion = suggestion.type === 'googleSuggest';
      const hostKey = isEngineSuggestion ? dedupKey : (info.host || '__nohost__');
      const clusterKey = isEngineSuggestion ? dedupKey : (info.clusterKey || dedupKey);
      const familyKey = isEngineSuggestion
        ? dedupKey
        : (getSearchSuggestionFamilyKey(info.host) || hostKey);
      const currentHostCount = hostCounts.get(hostKey) || 0;
      const currentClusterCount = clusterCounts.get(clusterKey) || 0;
      const currentFamilyCount = familyCounts.get(familyKey) || 0;
      if (
        currentHostCount >= hostLimit ||
        currentClusterCount >= clusterLimit ||
        currentFamilyCount >= familyLimit
      ) {
        return false;
      }
      selected.push(suggestion);
      selectedKeys.add(dedupKey);
      hostCounts.set(hostKey, currentHostCount + 1);
      clusterCounts.set(clusterKey, currentClusterCount + 1);
      familyCounts.set(familyKey, currentFamilyCount + 1);
      return true;
    };

    candidates.forEach((suggestion) => {
      if (!suggestion || !(suggestion.type === 'topSite' || suggestion.isTopSite)) {
        return;
      }
      const info = getSearchSuggestionClusterInfo(suggestion.url);
      const hostKey = info.host || '__nohost__';
      if (hostHasTopSiteRepresentative.has(hostKey)) {
        return;
      }
      const isRepresentativeCategory =
        info.category === 'site-root' ||
        info.category === 'repo-root' ||
        info.category === 'section' ||
        info.category === 'landing';
      if (!isRepresentativeCategory) {
        return;
      }
      if (tryTake(
        suggestion,
        SEARCH_POLICY.topSiteRepresentativeHostLimit,
        SEARCH_POLICY.topSiteRepresentativeClusterLimit,
        useBrandFamilyLimit ? SEARCH_POLICY.brandPrimaryFamilyLimit : Infinity
      )) {
        hostHasTopSiteRepresentative.add(hostKey);
      }
    });

    if (useBrandFamilyLimit) {
      let protectedOpenTabCount = 0;
      candidates.forEach((suggestion) => {
        if (
          protectedOpenTabCount >= SEARCH_POLICY.brandProtectedOpenTabLimit ||
          !isSearchOpenTabSuggestion(suggestion)
        ) {
          return;
        }
        if (tryTake(suggestion, Infinity, Infinity, Infinity)) {
          protectedOpenTabCount += 1;
        }
      });
    }

    candidates.forEach((suggestion) => {
      tryTake(
        suggestion,
        SEARCH_POLICY.primaryHostLimit,
        SEARCH_POLICY.primaryClusterLimit,
        useBrandFamilyLimit ? SEARCH_POLICY.brandPrimaryFamilyLimit : Infinity
      );
    });

    // The reserved passes above only guarantee a slot; they must not jump
    // ahead of stronger results. Restore the incoming rank order for every
    // primary pick, then let secondary picks fill the tail.
    const candidateIndex = new Map(candidates.map((suggestion, index) => [suggestion, index]));
    selected.sort((a, b) => candidateIndex.get(a) - candidateIndex.get(b));

    if (selected.length < SEARCH_POLICY.finalSuggestionLimit) {
      candidates.forEach((suggestion) => {
        tryTake(
          suggestion,
          SEARCH_POLICY.secondaryHostLimit,
          SEARCH_POLICY.secondaryClusterLimit,
          useBrandFamilyLimit ? SEARCH_POLICY.brandSecondaryFamilyLimit : Infinity
        );
      });
    }

    return selected.slice(0, SEARCH_POLICY.finalSuggestionLimit);
  }

  function composeSearchSuggestionSlate(list, context) {
    const suggestions = Array.isArray(list) ? list.slice() : [];
    if (!context || context.intentType !== 'brand' || context.hasInformationalIntent) {
      return suggestions;
    }
    return groupSearchSuggestionsByKind(suggestions);
  }

  function limitSearchSuggestionsForDisplay(list, options) {
    const suggestions = Array.isArray(list) ? list : [];
    const settings = options && typeof options === 'object' ? options : {};
    const rawLimit = Number(settings.limit);
    const fallbackLimit = Number(SEARCH_POLICY.displaySuggestionLimit) || 10;
    const limit = Number.isInteger(rawLimit) && rawLimit >= 5 && rawLimit <= 10
      ? rawLimit
      : fallbackLimit;
    return suggestions.slice(0, limit);
  }

  function normalizeSearchSuggestionSourceFilterType(value) {
    if (value === 'topSite' || value === 'topSites' || value === 'frequent' || value === 'common') {
      return 'topSite';
    }
    if (value === 'bookmark' || value === 'bookmarks') {
      return 'bookmark';
    }
    if (value === 'history') {
      return 'history';
    }
    return '';
  }

  function getSearchSuggestionFilterType(suggestion) {
    if (!suggestion) {
      return '';
    }
    if (suggestion.type === 'topSite' || suggestion.isTopSite) {
      return 'topSite';
    }
    if (suggestion.type === 'bookmark') {
      return 'bookmark';
    }
    if (suggestion.type === 'history') {
      return 'history';
    }
    return '';
  }

  function filterSearchSuggestionsBySourceTypes(list, sourceTypes) {
    const suggestions = Array.isArray(list) ? list : [];
    const selectedTypes = Array.isArray(sourceTypes)
      ? sourceTypes.map(normalizeSearchSuggestionSourceFilterType).filter(Boolean)
      : [];
    if (selectedTypes.length <= 0) {
      return suggestions.slice();
    }
    const selected = new Set(selectedTypes);
    return suggestions.filter((suggestion) => {
      const filterType = getSearchSuggestionFilterType(suggestion);
      return !filterType || selected.has(filterType);
    });
  }

  return {
    isSearchOpenTabSuggestion,
    buildSearchBrandDirectSuggestion,
    applySearchSuggestionHostDiversity,
    composeSearchSuggestionSlate,
    limitSearchSuggestionsForDisplay,
    filterSearchSuggestionsBySourceTypes
  };
}

export { createBrandSuggestions };
