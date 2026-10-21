// Matching site search providers: provider hosts and path scopes, the
// provider for a page, for a key or typed prefix, and for a suggestion,
// and the trigger candidate for what is typed.
function createSiteSearchMatching(deps) {
  const {
    normalizeHost,
    normalizeSiteSearchTemplate,
    buildSearchUrlFromTemplate,
    isSearchEngineSiteSearchProvider,
    isAiSiteSearchProvider,
    normalizeSearchText,
    splitSearchTitleTokens,
    shouldAllowLooseTextContains
  } = deps;

  const SITE_SEARCH_QUERY_PROBE = '__lumno_site_search_query__';

  function getUrlHost(url) {
    if (!url) {
      return '';
    }
    try {
      return normalizeHost(new URL(String(url)).hostname);
    } catch (e) {
      return '';
    }
  }

  function getSearchSuggestionHost(suggestion) {
    return getUrlHost(suggestion && suggestion.url);
  }

  function getSiteSearchProviderHost(provider) {
    if (!provider || !provider.template) {
      return '';
    }
    try {
      const url = String(provider.template).replace(/\{query\}/g, 'test');
      return normalizeHost(new URL(url).hostname);
    } catch (e) {
      return '';
    }
  }

  function siteSearchHostsMatch(a, b) {
    const hostA = normalizeHost(a);
    const hostB = normalizeHost(b);
    if (!hostA || !hostB) {
      return false;
    }
    return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
  }

  function siteSearchPageHostMatchesProvider(pageHost, providerHost) {
    const normalizedPageHost = normalizeHost(pageHost);
    const normalizedProviderHost = normalizeHost(providerHost);
    if (!normalizedPageHost || !normalizedProviderHost) {
      return false;
    }
    return normalizedPageHost === normalizedProviderHost ||
      normalizedPageHost.endsWith(`.${normalizedProviderHost}`);
  }

  function getSiteSearchProviderPathScope(provider) {
    const template = normalizeSiteSearchTemplate(provider && provider.template);
    if (!template) {
      return '';
    }
    try {
      const url = new URL(buildSearchUrlFromTemplate(template, 'scope'));
      const firstPathSegment = url.pathname.split('/').filter(Boolean)[0] || '';
      return firstPathSegment ? `/${firstPathSegment}` : '';
    } catch (e) {
      return '';
    }
  }

  function findSiteSearchProviderForPageUrl(pageUrl, providers) {
    let parsedPageUrl;
    try {
      parsedPageUrl = new URL(String(pageUrl || ''));
    } catch (e) {
      return null;
    }
    const pageHost = normalizeHost(parsedPageUrl.hostname);
    if (!pageHost) {
      return null;
    }
    const providerItems = Array.isArray(providers) ? providers : [];
    const searchEngineHosts = new Set(
      providerItems
        .filter(isSearchEngineSiteSearchProvider)
        .map(getSiteSearchProviderHost)
        .filter(Boolean)
    );
    return providerItems.find((provider) => {
      if (isSearchEngineSiteSearchProvider(provider) || isAiSiteSearchProvider(provider)) {
        return false;
      }
      const providerHost = getSiteSearchProviderHost(provider);
      if (!siteSearchPageHostMatchesProvider(pageHost, providerHost)) {
        return false;
      }
      if (!searchEngineHosts.has(providerHost)) {
        return true;
      }
      if (pageHost !== providerHost) {
        return false;
      }
      const pathScope = getSiteSearchProviderPathScope(provider);
      const pagePath = parsedPageUrl.pathname || '/';
      return Boolean(
        pathScope &&
        (pagePath === pathScope || pagePath.startsWith(`${pathScope}/`))
      );
    }) || null;
  }

  function findSiteSearchProvider(trigger, providers) {
    const key = String(trigger || '').trim().toLowerCase();
    if (!key) {
      return null;
    }
    return (providers || []).find((provider) => {
      const providerKey = String(provider && provider.key || '').toLowerCase();
      if (providerKey === key) {
        return true;
      }
      if (provider && provider._xIsAggregateSearch === true) {
        return false;
      }
      const providerName = String(provider && provider.name || '').trim().toLowerCase();
      if (providerName === key) {
        return true;
      }
      const aliases = Array.isArray(provider && provider.aliases) ? provider.aliases : [];
      return aliases.some((alias) => String(alias).toLowerCase() === key);
    }) || null;
  }

  function findSiteSearchProviderByKey(trigger, providers) {
    const key = String(trigger || '').toLowerCase();
    if (!key) {
      return null;
    }
    return (providers || []).find((provider) => String(provider && provider.key || '').toLowerCase() === key) || null;
  }

  function findSiteSearchProviderKeyConflict(trigger, providers, allowedKey) {
    const key = String(trigger || '').trim().toLowerCase();
    const allowed = String(allowedKey || '').trim().toLowerCase();
    if (!key || key === allowed) {
      return null;
    }
    return findSiteSearchProviderByKey(key, providers);
  }

  function suggestionMatchesSiteSearchProvider(suggestion, provider) {
    if (!suggestion || !provider || !suggestion.url) {
      return false;
    }
    return siteSearchHostsMatch(getSearchSuggestionHost(suggestion), getSiteSearchProviderHost(provider));
  }

  function isAsciiProviderToken(token) {
    return /^[a-z0-9]+$/i.test(token || '');
  }

  function isSiteSearchProviderTokenEligible(token) {
    if (!token) {
      return false;
    }
    const normalized = String(token).trim();
    if (!normalized) {
      return false;
    }
    if (isAsciiProviderToken(normalized)) {
      return normalized.length >= 3;
    }
    return normalized.length >= 2;
  }

  function providerMatchesSiteSearchSuggestion(provider, suggestion) {
    if (!provider || !suggestion) {
      return false;
    }
    return suggestionMatchesSiteSearchProvider(suggestion, provider);
  }

  function findProviderForSiteSearchSuggestion(suggestion, providers) {
    if (!suggestion) {
      return null;
    }
    const eligibleTypes = new Set(['topSite', 'history', 'bookmark']);
    if (!eligibleTypes.has(suggestion.type) && !suggestion.isTopSite) {
      return null;
    }
    return (providers || []).find((provider) => providerMatchesSiteSearchSuggestion(provider, suggestion)) || null;
  }

  function findSiteSearchProviderByInput(input, providers) {
    const raw = String(input || '').trim();
    if (!raw) {
      return null;
    }
    const firstToken = raw.split(/\s+/)[0];
    const keyMatch = findSiteSearchProvider(firstToken, providers) ||
      findSiteSearchProviderByKey(firstToken, providers);
    if (keyMatch) {
      return keyMatch;
    }
    let host = '';
    if (/[./]/.test(firstToken)) {
      try {
        const url = firstToken.includes('://') ? firstToken : `https://${firstToken}`;
        host = new URL(url).hostname;
      } catch (e) {
        host = firstToken.split('/')[0] || '';
      }
    }
    if (!host) {
      return null;
    }
    const normalizedHost = normalizeHost(host);
    return (providers || []).find((provider) => siteSearchHostsMatch(
      normalizedHost,
      getSiteSearchProviderHost(provider)
    )) || null;
  }

  function getInlineSiteSearchCandidate(input, providers) {
    const raw = String(input || '').trim();
    if (!raw) {
      return null;
    }
    const tokens = raw.split(/\s+/);
    if (tokens.length < 2) {
      return null;
    }
    const provider = findSiteSearchProviderByInput(raw, providers);
    if (!provider) {
      return null;
    }
    const firstToken = tokens[0];
    const remainder = raw.slice(raw.indexOf(firstToken) + firstToken.length).trim();
    if (!remainder) {
      return null;
    }
    return { provider: provider, query: remainder };
  }

  function providerMatchesSiteSearchInputPrefix(provider, input) {
    const needle = String(input || '').toLowerCase();
    if (!needle || !provider) {
      return false;
    }
    const allowPrefix = needle.length >= 2;
    const tokens = provider._xIsAggregateSearch === true
      ? [provider.key]
      : [provider.key, provider.name].concat(provider.aliases || []);
    for (let i = 0; i < tokens.length; i += 1) {
      const token = String(tokens[i] || '').toLowerCase();
      if (!token) {
        continue;
      }
      if (token === needle || (allowPrefix && token.startsWith(needle))) {
        return true;
      }
    }
    const host = normalizeHost(getSiteSearchProviderHost(provider));
    if (host) {
      const hostToken = host.split('.')[0] || host;
      if (hostToken === needle || (allowPrefix && hostToken.startsWith(needle))) {
        return true;
      }
    }
    return false;
  }

  function siteSearchTemplatePartMatchesCandidate(candidatePart, probePart) {
    const candidateValue = String(candidatePart || '');
    const probeValue = String(probePart || '');
    if (!probeValue.includes(SITE_SEARCH_QUERY_PROBE)) {
      return candidateValue === probeValue;
    }
    const markerIndex = probeValue.indexOf(SITE_SEARCH_QUERY_PROBE);
    const prefix = probeValue.slice(0, markerIndex);
    const suffix = probeValue.slice(markerIndex + SITE_SEARCH_QUERY_PROBE.length);
    return candidateValue.startsWith(prefix) &&
      candidateValue.endsWith(suffix) &&
      candidateValue.length > prefix.length + suffix.length;
  }

  function isSiteSearchProviderSearchResultUrl(suggestion, provider) {
    const template = normalizeSiteSearchTemplate(provider && provider.template);
    if (!template || !template.includes('{query}') || !suggestion || !suggestion.url) {
      return false;
    }
    try {
      const candidateUrl = new URL(String(suggestion.url));
      const probeUrl = new URL(buildSearchUrlFromTemplate(template, SITE_SEARCH_QUERY_PROBE));
      if (!siteSearchHostsMatch(candidateUrl.hostname, probeUrl.hostname)) {
        return false;
      }
      if (!siteSearchTemplatePartMatchesCandidate(candidateUrl.pathname, probeUrl.pathname)) {
        return false;
      }
      if (probeUrl.pathname.includes(SITE_SEARCH_QUERY_PROBE)) {
        return true;
      }
      let queryParamMatches = false;
      probeUrl.searchParams.forEach((value, key) => {
        if (String(value || '').includes(SITE_SEARCH_QUERY_PROBE) && candidateUrl.searchParams.has(key)) {
          queryParamMatches = true;
        }
      });
      if (queryParamMatches) {
        return true;
      }
      return probeUrl.hash.includes(SITE_SEARCH_QUERY_PROBE) &&
        siteSearchTemplatePartMatchesCandidate(candidateUrl.hash, probeUrl.hash);
    } catch (e) {
      return false;
    }
  }

  function siteSearchSuggestionTitleMatchesInput(suggestion, input) {
    const needle = String(input || '').trim().toLowerCase();
    if (!isSiteSearchProviderTokenEligible(needle)) {
      return false;
    }
    const title = String(suggestion && suggestion.title || '').trim();
    const titleLower = normalizeSearchText(title);
    if (!titleLower) {
      return false;
    }
    if (titleLower === needle || titleLower.startsWith(needle)) {
      return true;
    }
    const titleTokens = splitSearchTitleTokens(title);
    return titleTokens.includes(needle) ||
      titleTokens.some((token) => token.startsWith(needle)) ||
      (shouldAllowLooseTextContains(needle) && titleLower.includes(needle));
  }

  function providerMatchesSiteSearchSuggestionTitle(provider, suggestion, input) {
    if (!provider || !suggestion || !suggestionMatchesSiteSearchProvider(suggestion, provider)) {
      return false;
    }
    if (isSiteSearchProviderSearchResultUrl(suggestion, provider)) {
      return false;
    }
    return siteSearchSuggestionTitleMatchesInput(suggestion, input);
  }

  function getSiteSearchTriggerCandidate(input, providers, topSiteMatch, options) {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
      return null;
    }
    const exactProvider = findSiteSearchProvider(trimmed, providers) ||
      findSiteSearchProviderByKey(trimmed, providers);
    if (/\s/.test(trimmed) && !exactProvider) {
      return null;
    }
    let provider = exactProvider ||
      findSiteSearchProviderByInput(trimmed, providers);
    if (!provider && topSiteMatch) {
      provider = (providers || []).find((candidate) => {
        if (!suggestionMatchesSiteSearchProvider(topSiteMatch, candidate)) {
          return false;
        }
        return providerMatchesSiteSearchInputPrefix(candidate, trimmed) ||
          providerMatchesSiteSearchSuggestionTitle(candidate, topSiteMatch, trimmed);
      }) || null;
    }
    if (!provider) {
      return null;
    }
    const matchesTopSitePrefix = options && typeof options.matchesTopSitePrefix === 'function'
      ? options.matchesTopSitePrefix
      : null;
    if (topSiteMatch && trimmed.length <= 2 && matchesTopSitePrefix && matchesTopSitePrefix(topSiteMatch, trimmed)) {
      const providerHost = getSiteSearchProviderHost(provider);
      const topHost = getSearchSuggestionHost(topSiteMatch);
      if (!siteSearchHostsMatch(providerHost, topHost)) {
        return null;
      }
    }
    return provider;
  }

  return {
    getUrlHost,
    getSearchSuggestionHost,
    getSiteSearchProviderHost,
    siteSearchHostsMatch,
    findSiteSearchProviderForPageUrl,
    findSiteSearchProvider,
    findSiteSearchProviderByKey,
    findSiteSearchProviderKeyConflict,
    suggestionMatchesSiteSearchProvider,
    isSiteSearchProviderTokenEligible,
    providerMatchesSiteSearchSuggestion,
    findProviderForSiteSearchSuggestion,
    findSiteSearchProviderByInput,
    getInlineSiteSearchCandidate,
    providerMatchesSiteSearchInputPrefix,
    getSiteSearchTriggerCandidate
  };
}

export { createSiteSearchMatching };
