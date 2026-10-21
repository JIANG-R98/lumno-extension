(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SEARCH_POLICY = Object.freeze({
    lookupWindowDays: 180,
    fallbackHistoryWindowDays: 365,
    lookupMaxResults: 120,
    fallbackHistoryMaxResults: 600,
    // Pinyin and initials can only match titles already in hand, since the
    // browser's history search reads typed text; this many recent pages are
    // scanned for titles with Han characters.
    hanTitleHistoryScanLimit: 5000,
    maxEngineSuggestions: 5,
    maxEngineSuggestionsWithLocalResults: 3,
    candidatePoolLimit: 20,
    finalSuggestionLimit: 12,
    displaySuggestionLimit: 10,
    fallbackTopSiteLimit: 5,
    topSiteRepresentativeHostLimit: 1,
    topSiteRepresentativeClusterLimit: 1,
    primaryHostLimit: 3,
    primaryClusterLimit: 1,
    secondaryHostLimit: 5,
    secondaryClusterLimit: 2,
    brandPrimaryFamilyLimit: 2,
    brandSecondaryFamilyLimit: 3,
    brandProtectedOpenTabLimit: 1,
    brandDeepSelectionBoostLimit: 64,
    genericBrandDeepTitlePenalty: 180
  });

  const SEARCH_SELECTION_POLICY = Object.freeze({
    retentionDays: 45,
    maxQueries: 80,
    maxEntriesPerQuery: 12,
    maxSelectionBoost: 320
  });

  const DEFAULT_SITE_SEARCH_PROVIDERS = Object.freeze([
    { key: 'yt', aliases: ['youtube'], name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}' },
    { key: 'bb', aliases: ['bilibili', 'bili'], name: 'Bilibili', template: 'https://search.bilibili.com/all?keyword={query}' },
    { key: 'gh', aliases: ['github'], name: 'GitHub', template: 'https://github.com/search?q={query}' },
    { key: 'sf', aliases: ['stackoverflow', 'stack overflow'], name: 'Stack Overflow', template: 'https://stackoverflow.com/search?q={query}' },
    { key: 'mdn', aliases: ['mdn web docs'], name: 'MDN', template: 'https://developer.mozilla.org/en-US/search?q={query}' },
    { key: 'npm', aliases: ['npmjs'], name: 'npm', template: 'https://www.npmjs.com/search?q={query}' },
    { key: 'hf', aliases: ['huggingface', 'hugging face'], name: 'Hugging Face', template: 'https://huggingface.co/search/full-text?q={query}' },
    { key: 'gs', aliases: ['scholar', 'google scholar'], name: 'Google Scholar', template: 'https://scholar.google.com/scholar?q={query}' },
    { key: 'ss', aliases: ['semantic', 'semantic scholar'], name: 'Semantic Scholar', template: 'https://www.semanticscholar.org/search?q={query}' },
    { key: 'maps', aliases: ['map', 'google maps'], name: 'Google Maps', template: 'https://www.google.com/maps/search/?api=1&query={query}' },
    { key: 'gpt', aliases: ['chatgpt', 'openai'], name: 'ChatGPT', template: 'https://chatgpt.com/?hints=search&ref=ext&q={query}', action: 'openAndSubmit', submitStrategy: 'chatgptPrompt' },
    { key: 'gm', aliases: ['gemini'], name: 'Gemini', template: 'https://gemini.google.com/app', action: 'openAndSubmit', submitStrategy: 'geminiPrompt' },
    { key: 'dbai', aliases: ['doubao', '豆包'], name: '豆包', template: 'https://www.doubao.com/chat/', action: 'openAndSubmit', submitStrategy: 'doubaoPrompt' },
    { key: 'qw', aliases: ['qianwen', 'qwen', '千问'], name: '千问', template: 'https://www.qianwen.com/?q={query}', action: 'openAndSubmit', submitStrategy: 'qianwenQuery' },
    { key: 'yb', aliases: ['yuanbao', 'tencent', '腾讯元宝', '元宝'], name: '元宝', template: 'https://yuanbao.tencent.com/chat/', action: 'openAndSubmit', submitStrategy: 'yuanbaoPrompt' },
    { key: 'mx', aliases: ['minimax', 'mini max'], name: 'MiniMax', template: 'https://chat.minimax.io/', action: 'openAndSubmit', submitStrategy: 'minimaxPrompt' },
    { key: 'ds', aliases: ['deepseek', 'deep seek', '深度求索'], name: 'DeepSeek', template: 'https://chat.deepseek.com/', action: 'openAndSubmit', submitStrategy: 'deepseekPrompt' },
    { key: 'kimi', aliases: ['moonshot', '月之暗面'], name: 'Kimi', template: 'https://www.kimi.com/', action: 'openAndSubmit', submitStrategy: 'kimiPrompt' },
    { key: 'pplx', aliases: ['perplexity'], name: 'Perplexity', template: 'https://www.perplexity.ai/search?q={query}', category: 'aiSearch' },
    { key: 'metaso', aliases: ['秘塔', '秘塔ai', '秘塔搜索'], name: 'Metaso AI Search', template: 'https://metaso.cn/?q={query}', category: 'aiSearch' },
    { key: 'felo', aliases: ['felo search'], name: 'Felo', template: 'https://felo.ai/search?q={query}', category: 'aiSearch' },
    { key: 'bd', aliases: ['baidu', '百度'], name: 'Baidu', template: 'https://www.baidu.com/s?wd={query}', category: 'searchEngine' },
    { key: 'bi', aliases: ['bing'], name: 'Bing', template: 'https://www.bing.com/search?q={query}', category: 'searchEngine' },
    { key: 'gg', aliases: ['google'], name: 'Google', template: 'https://www.google.com/search?q={query}', category: 'searchEngine' },
    { key: 'kg', aliases: ['kagi'], name: 'Kagi', template: 'https://kagi.com/search?q={query}', category: 'searchEngine' },
    { key: 'ddg', aliases: ['duckduckgo', 'duck'], name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q={query}', category: 'searchEngine' },
    { key: 'br', aliases: ['brave', 'brave search'], name: 'Brave Search', template: 'https://search.brave.com/search?q={query}', category: 'searchEngine' },
    { key: 'eco', aliases: ['ecosia'], name: 'Ecosia', template: 'https://www.ecosia.org/search?q={query}', category: 'searchEngine' },
    { key: 'sg', aliases: ['sogou', '搜狗'], name: 'Sogou', template: 'https://www.sogou.com/web?query={query}', category: 'searchEngine' },
    { key: 'yh', aliases: ['yahoo'], name: 'Yahoo', template: 'https://search.yahoo.com/search?p={query}', category: 'searchEngine' },
    { key: 'yx', aliases: ['yandex'], name: 'Yandex', template: 'https://yandex.com/search/?text={query}', category: 'searchEngine' },
    { key: 'sm', aliases: ['shenma', '神马'], name: 'Shenma', template: 'https://m.sm.cn/s?q={query}', category: 'searchEngine' },
    { key: 'zh', aliases: ['zhihu'], name: 'Zhihu', template: 'https://www.zhihu.com/search?q={query}' },
    { key: 'db', aliases: ['douban'], name: 'Douban', template: 'https://www.douban.com/search?q={query}' },
    { key: 'jj', aliases: ['juejin'], name: 'Juejin', template: 'https://juejin.cn/search?query={query}' },
    { key: 'tb', aliases: ['taobao'], name: 'Taobao', template: 'https://s.taobao.com/search?q={query}' },
    { key: 'tm', aliases: ['tmall'], name: 'Tmall', template: 'https://list.tmall.com/search_product.htm?q={query}' },
    { key: 'wx', aliases: ['weixin', 'wechat'], name: 'WeChat Official Accounts', template: 'https://weixin.sogou.com/weixin?query={query}' },
    { key: 'tw', aliases: ['twitter', 'x'], name: 'X', template: 'https://x.com/search?q={query}' },
    { key: 'rd', aliases: ['reddit'], name: 'Reddit', template: 'https://www.reddit.com/search/?q={query}' },
    { key: 'wb', aliases: ['weibo', '微博'], name: 'Weibo', template: 'https://s.weibo.com/weibo?q={query}' },
    { key: 'xhs', aliases: ['rednote', '小红书'], name: 'Xiaohongshu', template: 'https://www.xiaohongshu.com/search_result?keyword={query}', directNavigationUrl: 'https://www.xiaohongshu.com/', directNavigationTitle: '小红书' },
    { key: 'dy', aliases: ['douyin', '抖音'], name: 'Douyin', template: 'https://www.douyin.com/search/{query}' },
    { key: 'jd', aliases: ['jingdong', '京东'], name: 'JD.com', template: 'https://search.jd.com/Search?keyword={query}' },
    { key: 'wk', aliases: ['wiki', 'wikipedia'], name: 'Wikipedia', template: 'https://en.wikipedia.org/wiki/Special:Search?search={query}' },
    { key: 'zw', aliases: ['zhwiki'], name: 'Wikipedia', template: 'https://zh.wikipedia.org/wiki/Special:Search?search={query}' },
    { key: 'lm', aliases: ['lumno', 'lumno help', '帮助中心', '說明中心', 'ヘルプセンター'], name: 'Lumno Help Center', template: 'https://lumno.kubai.design/help/what-is-lumno/?entry=ext&q={query}' }
  ]);

  const SEARCH_UTILS_DIRECT_NAVIGATION = globalThis.LumnoSearchUtilsDirectNavigation ||
    (typeof require === 'function' ? require('./utils/direct-navigation.js') : null);
  const {
    normalizeHost,
    normalizeHostIdentity,
    sanitizeDisplayText,
    getSearchSuggestionFamilyKey,
    getSearchSiteConfig,
    getSearchDirectNavigationUrl,
    getSearchDirectNavigationTitle,
    getDirectNavigationUrl,
    isUrlLikeSearchQuery
  } = SEARCH_UTILS_DIRECT_NAVIGATION.createDirectNavigation({

  });

  const SEARCH_UTILS_TEXT_NORMALIZE = globalThis.LumnoSearchUtilsTextNormalize ||
    (typeof require === 'function' ? require('./utils/text-normalize.js') : null);
  const {
    SEARCH_HAN_PATTERN,
    SEARCH_TEXT_MATCHER_CACHE_MAX_ENTRIES,
    SEARCH_LETTER_ALTERNATES,
    foldSearchCharacter,
    hasSearchHanCharacters,
    normalizeSearchText,
    compactSearchQuery,
    splitSearchTerms,
    SEARCH_WORD_CHARACTERS_PATTERN,
    SEARCH_WORD_PART_PATTERN,
    splitSearchTitleTokens,
    normalizeSearchHanReadings,
    expandSearchFuzzyPinyinReadings
  } = SEARCH_UTILS_TEXT_NORMALIZE.createTextNormalize({

  });

  const SEARCH_UTILS_TEXT_INDEX = globalThis.LumnoSearchUtilsTextIndex ||
    (typeof require === 'function' ? require('./utils/text-index.js') : null);
  const {
    SEARCH_UNIT_WORD,
    SEARCH_UNIT_DIGIT,
    SEARCH_UNIT_HAN,
    SEARCH_UNIT_CHAR,
    buildSearchTextIndex,
    resolveSearchTextIndexReadings
  } = SEARCH_UTILS_TEXT_INDEX.createTextIndex({
    SEARCH_WORD_PART_PATTERN,
    SEARCH_HAN_PATTERN,
    foldSearchCharacter,
    SEARCH_WORD_CHARACTERS_PATTERN,
    SEARCH_LETTER_ALTERNATES,
    normalizeSearchHanReadings
  });

  const SEARCH_UTILS_KEYBOARD_LAYOUTS = globalThis.LumnoSearchUtilsKeyboardLayouts ||
    (typeof require === 'function' ? require('./utils/keyboard-layouts.js') : null);
  const {
    HANGUL_INITIAL_JAMO,
    getHangulParts,
    addHangulSteps,
    getHangulCarriedQuery,
    hasSearchKeyboardLayoutScript,
    getSearchKeyboardLayoutQueries
  } = SEARCH_UTILS_KEYBOARD_LAYOUTS.createKeyboardLayouts({
    isUrlLikeSearchQuery
  });

  const SEARCH_UTILS_RESULT_DEDUP = globalThis.LumnoSearchUtilsResultDedup ||
    (typeof require === 'function' ? require('./utils/result-dedup.js') : null);
  const {
    buildSearchDedupUrlKey,
    getSearchSuggestionDisplayTitle,
    buildSearchDedupEntryKey,
    mergeItemsByUrl
  } = SEARCH_UTILS_RESULT_DEDUP.createResultDedup({
    normalizeHost,
    getSearchSiteConfig,
    getSearchDirectNavigationTitle,
    getSearchDirectNavigationUrl
  });

  const SEARCH_UTILS_TEXT_MATCHING = globalThis.LumnoSearchUtilsTextMatching ||
    (typeof require === 'function' ? require('./utils/text-matching.js') : null);
  const {
    matchSearchTextIndex,
    createSearchTextMatcher,
    isSearchUnitQueryEligible,
    getSearchTitleUnitMatch,
    getSearchTitleHighlightRanges
  } = SEARCH_UTILS_TEXT_MATCHING.createTextMatching({
    SEARCH_UNIT_HAN,
    SEARCH_UNIT_CHAR,
    addHangulSteps,
    SEARCH_UNIT_WORD,
    SEARCH_UNIT_DIGIT,
    getHangulParts,
    HANGUL_INITIAL_JAMO,
    SEARCH_HAN_PATTERN,
    compactSearchQuery,
    resolveSearchTextIndexReadings,
    getHangulCarriedQuery,
    normalizeSearchText,
    SEARCH_LETTER_ALTERNATES,
    foldSearchCharacter,
    SEARCH_TEXT_MATCHER_CACHE_MAX_ENTRIES,
    buildSearchTextIndex,
    shouldAllowLooseTextContains: (...args) => shouldAllowLooseTextContains(...args)
  });

  const SEARCH_UTILS_QUERY_INTENT = globalThis.LumnoSearchUtilsQueryIntent ||
    (typeof require === 'function' ? require('./utils/query-intent.js') : null);
  const {
    getSearchSuggestionClusterInfo,
    classifySearchIntent,
    getSearchSourceAdjustment,
    matchesSearchHostSpelling,
    matchesSearchQueryText,
    isShortWordSearchTerm,
    shouldAllowLooseTextContains,
    getSearchTermCoverageStats,
    getSearchSuggestionCategoryAdjustment,
    getOwnExtensionUtilityPenalty
  } = SEARCH_UTILS_QUERY_INTENT.createQueryIntent({
    normalizeHost,
    getSearchSiteConfig,
    normalizeSearchText,
    splitSearchTitleTokens,
    getSearchTitleUnitMatch,
    SEARCH_WORD_CHARACTERS_PATTERN,
    SEARCH_HAN_PATTERN,
    splitSearchTerms
  });

  const SEARCH_UTILS_NAVIGATION_MATCHING = globalThis.LumnoSearchUtilsNavigationMatching ||
    (typeof require === 'function' ? require('./utils/navigation-matching.js') : null);
  const {
    collectSearchMatches,
    buildComparableNavigationUrl,
    buildTabMatchUrl,
    isDirectNavigationMatch,
    findSearchOpenTabMatchIndex,
    getStrongNavigationMatchScore,
    promoteStrongNavigationMatch
  } = SEARCH_UTILS_NAVIGATION_MATCHING.createNavigationMatching({
    matchesSearchQueryText,
    normalizeHost,
    normalizeSearchText,
    splitSearchTerms
  });

  const SEARCH_UTILS_SELECTION_STATS = globalThis.LumnoSearchUtilsSelectionStats ||
    (typeof require === 'function' ? require('./utils/selection-stats.js') : null);
  const {
    buildSearchQueryContext,
    normalizeSearchSelectionQuery,
    normalizeSearchSelectionStats,
    recordSearchSelectionInStats
  } = SEARCH_UTILS_SELECTION_STATS.createSelectionStats({
    normalizeSearchText,
    isSearchUnitQueryEligible,
    compactSearchQuery,
    splitSearchTerms,
    classifySearchIntent,
    getNow: (...args) => getNow(...args),
    SEARCH_SELECTION_POLICY,
    buildSearchDedupUrlKey
  });

  const SEARCH_UTILS_SUGGESTION_SLATE = globalThis.LumnoSearchUtilsSuggestionSlate ||
    (typeof require === 'function' ? require('./utils/suggestion-slate.js') : null);
  const {
    hasSearchHomeTitle,
    isSearchLikelyBrandProductQuery,
    isSearchLikelyDirectNavigationQuery,
    getSearchBrandHostMatchScore,
    getSearchNavigationRepresentativeSignal,
    getSearchDirectNavigationAdjustment,
    getSearchEngineSuggestionScore,
    normalizeSearchEngineSuggestions,
    isSearchEngineSuggestion,
    isKeywordSearchSuggestion,
    groupSearchSuggestionsByKind,
    composeSearchFirstSuggestionSlate,
    pinExactSearchActionSecond,
    rankSearchSuggestionSlate,
    areOnlyKeywordSearchSuggestions,
    getAutocompleteSearchSuggestionPool,
    getKeywordSearchSuggestionState,
    getSearchEngineSuggestionPolicy
  } = SEARCH_UTILS_SUGGESTION_SLATE.createSuggestionSlate({
    splitSearchTerms,
    normalizeHost,
    getSearchSuggestionClusterInfo,
    normalizeSearchText,
    getSearchTermCoverageStats,
    splitSearchTitleTokens,
    getSearchTitleUnitMatch,
    SEARCH_POLICY,
    findSearchOpenTabMatchIndex,
    findProviderForSiteSearchSuggestion: (...args) => findProviderForSiteSearchSuggestion(...args)
  });

  const SEARCH_UTILS_RELEVANCE_SCORE = globalThis.LumnoSearchUtilsRelevanceScore ||
    (typeof require === 'function' ? require('./utils/relevance-score.js') : null);
  const {
    getNow,
    calculateSearchRelevanceScore,
    getSearchSelectionBoost,
    getSearchSuggestionSourceRank,
    compareSearchSuggestions,
    createSearchSuggestion
  } = SEARCH_UTILS_RELEVANCE_SCORE.createRelevanceScore({
    normalizeSearchText,
    getSearchSuggestionClusterInfo,
    splitSearchTitleTokens,
    getSearchTitleUnitMatch,
    shouldAllowLooseTextContains,
    normalizeHost,
    matchesSearchHostSpelling,
    getSearchTermCoverageStats,
    getSearchSourceAdjustment,
    getSearchSuggestionCategoryAdjustment,
    getSearchDirectNavigationAdjustment,
    SEARCH_POLICY,
    getOwnExtensionUtilityPenalty,
    normalizeSearchSelectionQuery,
    buildSearchDedupUrlKey,
    SEARCH_SELECTION_POLICY,
    getSearchSuggestionDisplayTitle
  });

  const SEARCH_UTILS_BRAND_SUGGESTIONS = globalThis.LumnoSearchUtilsBrandSuggestions ||
    (typeof require === 'function' ? require('./utils/brand-suggestions.js') : null);
  const {
    isSearchOpenTabSuggestion,
    buildSearchBrandDirectSuggestion,
    applySearchSuggestionHostDiversity,
    composeSearchSuggestionSlate,
    limitSearchSuggestionsForDisplay,
    filterSearchSuggestionsBySourceTypes
  } = SEARCH_UTILS_BRAND_SUGGESTIONS.createBrandSuggestions({
    DEFAULT_SITE_SEARCH_PROVIDERS,
    findSiteSearchProvider: (...args) => findSiteSearchProvider(...args),
    findSiteSearchProviderByKey: (...args) => findSiteSearchProviderByKey(...args),
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
  });

  const SEARCH_UTILS_SITE_SEARCH_PROVIDERS = globalThis.LumnoSearchUtilsSiteSearchProviders ||
    (typeof require === 'function' ? require('./utils/site-search-providers.js') : null);
  const {
    normalizeSiteSearchTemplate,
    findLocalSearchScope,
    getSiteSearchProviderDisplayNameMessage,
    isHelpCenterSiteSearchProvider,
    withHelpCenterLocale,
    getDefaultSiteSearchProviders,
    isInteractiveSiteSearchSubmitStrategy,
    hasOpenAndSubmitSiteSearchAction,
    isAiSiteSearchProvider,
    isRetiredSearchEngineState,
    isSearchEngineSiteSearchProvider,
    getSearchEngineSiteSearchProvider,
    isInteractiveSiteSearchProvider,
    normalizeSiteSearchProvider,
    sanitizeSiteSearchProviders,
    inheritSiteSearchProviderBehavior,
    mergeCustomProviders,
    buildSearchUrlFromTemplate,
    buildBlacklistProbeUrlFromTemplate
  } = SEARCH_UTILS_SITE_SEARCH_PROVIDERS.createSiteSearchProviders({
    normalizeHost,
    DEFAULT_SITE_SEARCH_PROVIDERS,
    getUrlHost: (...args) => getUrlHost(...args),
    findSiteSearchProvider: (...args) => findSiteSearchProvider(...args),
    siteSearchHostsMatch: (...args) => siteSearchHostsMatch(...args),
    getSiteSearchProviderHost: (...args) => getSiteSearchProviderHost(...args)
  });

  const SEARCH_UTILS_SITE_SEARCH_MATCHING = globalThis.LumnoSearchUtilsSiteSearchMatching ||
    (typeof require === 'function' ? require('./utils/site-search-matching.js') : null);
  const {
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
  } = SEARCH_UTILS_SITE_SEARCH_MATCHING.createSiteSearchMatching({
    normalizeHost,
    normalizeSiteSearchTemplate,
    buildSearchUrlFromTemplate,
    isSearchEngineSiteSearchProvider,
    isAiSiteSearchProvider,
    normalizeSearchText,
    splitSearchTitleTokens,
    shouldAllowLooseTextContains
  });

  return Object.freeze({
    SEARCH_POLICY,
    SEARCH_SELECTION_POLICY,
    applySearchSuggestionHostDiversity,
    buildBlacklistProbeUrlFromTemplate,
    buildSearchBrandDirectSuggestion,
    buildSearchDedupEntryKey,
    buildSearchDedupUrlKey,
    buildSearchQueryContext,
    buildSearchUrlFromTemplate,
    buildComparableNavigationUrl,
    buildTabMatchUrl,
    calculateSearchRelevanceScore,
    classifySearchIntent,
    collectSearchMatches,
    compareSearchSuggestions,
    composeSearchFirstSuggestionSlate,
    composeSearchSuggestionSlate,
    createSearchSuggestion,
    areOnlyKeywordSearchSuggestions,
    getAutocompleteSearchSuggestionPool,
    getKeywordSearchSuggestionState,
    getSearchEngineSuggestionScore,
    getSearchKeyboardLayoutQueries,
    hasSearchKeyboardLayoutScript,
    getSearchEngineSuggestionPolicy,
    getSearchEngineSiteSearchProvider,
    getSearchNavigationRepresentativeSignal,
    getSearchSuggestionCategoryAdjustment,
    getSearchSuggestionClusterInfo,
    getSearchSuggestionFamilyKey,
    groupSearchSuggestionsByKind,
    pinExactSearchActionSecond,
    rankSearchSuggestionSlate,
    isSearchOpenTabSuggestion,
    getSearchSuggestionSourceRank,
    getSearchSelectionBoost,
    getSearchTermCoverageStats,
    getStrongNavigationMatchScore,
    getDirectNavigationUrl,
    isUrlLikeSearchQuery,
    getDefaultSiteSearchProviders,
    findSearchOpenTabMatchIndex,
    findSiteSearchProviderForPageUrl,
    isDirectNavigationMatch,
    getInlineSiteSearchCandidate,
    getSearchSuggestionHost,
    getSiteSearchProviderDisplayNameMessage,
    isHelpCenterSiteSearchProvider,
    withHelpCenterLocale,
    getSiteSearchProviderHost,
    getSiteSearchTriggerCandidate,
    getUrlHost,
    hasOpenAndSubmitSiteSearchAction,
    inheritSiteSearchProviderBehavior,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    isRetiredSearchEngineState,
    isInteractiveSiteSearchProvider,
    isInteractiveSiteSearchSubmitStrategy,
    isKeywordSearchSuggestion,
    isSearchLikelyBrandProductQuery,
    isSearchLikelyDirectNavigationQuery,
    isSearchEngineSuggestion,
    isShortWordSearchTerm,
    isSiteSearchProviderTokenEligible,
    limitSearchSuggestionsForDisplay,
    findProviderForSiteSearchSuggestion,
    findLocalSearchScope,
    findSiteSearchProvider,
    findSiteSearchProviderByInput,
    findSiteSearchProviderByKey,
    findSiteSearchProviderKeyConflict,
    filterSearchSuggestionsBySourceTypes,
    mergeCustomProviders,
    mergeItemsByUrl,
    matchesSearchQueryText,
    matchSearchTextIndex,
    normalizeSearchEngineSuggestions,
    normalizeSearchSelectionQuery,
    normalizeSearchSelectionStats,
    normalizeHost,
    normalizeHostIdentity,
    normalizeSiteSearchProvider,
    normalizeSiteSearchTemplate,
    providerMatchesSiteSearchInputPrefix,
    providerMatchesSiteSearchSuggestion,
    promoteStrongNavigationMatch,
    recordSearchSelectionInStats,
    sanitizeDisplayText,
    normalizeSearchText,
    compactSearchQuery,
    buildSearchTextIndex,
    createSearchTextMatcher,
    getSearchTitleHighlightRanges,
    getSearchTitleUnitMatch,
    hasSearchHanCharacters,
    expandSearchFuzzyPinyinReadings,
    sanitizeSiteSearchProviders,
    shouldAllowLooseTextContains,
    siteSearchHostsMatch,
    splitSearchTitleTokens,
    splitSearchTerms,
    suggestionMatchesSiteSearchProvider
  });
});
