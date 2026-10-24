import * as SEARCH_UTILS_BRAND_SUGGESTIONS from './utils/brand-suggestions';
import * as SEARCH_UTILS_DIRECT_NAVIGATION from './utils/direct-navigation';
import * as SEARCH_UTILS_KEYBOARD_LAYOUTS from './utils/keyboard-layouts';
import * as SEARCH_UTILS_NAVIGATION_MATCHING from './utils/navigation-matching';
import * as SEARCH_UTILS_QUERY_INTENT from './utils/query-intent';
import * as SEARCH_UTILS_RELEVANCE_SCORE from './utils/relevance-score';
import * as SEARCH_UTILS_RESULT_DEDUP from './utils/result-dedup';
import * as SEARCH_UTILS_SELECTION_STATS from './utils/selection-stats';
import * as SEARCH_UTILS_SITE_SEARCH_MATCHING from './utils/site-search-matching';
import * as SEARCH_UTILS_SITE_SEARCH_PROVIDERS from './utils/site-search-providers';
import * as SEARCH_UTILS_SUGGESTION_SLATE from './utils/suggestion-slate';
import * as SEARCH_UTILS_TEXT_INDEX from './utils/text-index';
import * as SEARCH_UTILS_TEXT_MATCHING from './utils/text-matching';
import * as SEARCH_UTILS_TEXT_NORMALIZE from './utils/text-normalize';
import type { SearchPolicy, SearchSelectionPolicy, SiteSearchProvider } from './types';

const SEARCH_POLICY: Readonly<SearchPolicy> = Object.freeze({
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

const SEARCH_SELECTION_POLICY: Readonly<SearchSelectionPolicy> = Object.freeze({
  retentionDays: 45,
  maxQueries: 80,
  maxEntriesPerQuery: 12,
  maxSelectionBoost: 320
});

const DEFAULT_SITE_SEARCH_PROVIDERS: readonly SiteSearchProvider[] = Object.freeze([
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
  { key: 'qw', aliases: ['qianwen', '千问'], name: '千问', template: 'https://www.qianwen.com/?q={query}', action: 'openAndSubmit', submitStrategy: 'qianwenQuery' },
  { key: 'yb', aliases: ['yuanbao', 'tencent', '腾讯元宝', '元宝'], name: '元宝', template: 'https://yuanbao.tencent.com/chat/', action: 'openAndSubmit', submitStrategy: 'yuanbaoPrompt' },
  { key: 'mx', aliases: ['minimax', 'mini max'], name: 'MiniMax', template: 'https://chat.minimax.io/', action: 'openAndSubmit', submitStrategy: 'minimaxPrompt' },
  { key: 'ds', aliases: ['deepseek', 'deep seek', '深度求索'], name: 'DeepSeek', template: 'https://chat.deepseek.com/', action: 'openAndSubmit', submitStrategy: 'deepseekPrompt' },
  { key: 'kimi', aliases: ['moonshot', '月之暗面'], name: 'Kimi', template: 'https://www.kimi.com/', action: 'openAndSubmit', submitStrategy: 'kimiPrompt' },
  { key: 'cp', aliases: ['copilot', 'microsoft copilot'], name: 'Copilot', template: 'https://copilot.com/chat', action: 'openAndSubmit', submitStrategy: 'copilotPrompt' },
  { key: 'grok', aliases: ['xai'], name: 'Grok', template: 'https://grok.com/', action: 'openAndSubmit', submitStrategy: 'grokPrompt' },
  { key: 'qwen', aliases: ['qwen chat', 'qwenchat'], name: 'Qwen Chat', template: 'https://chat.qwen.ai/', action: 'openAndSubmit', submitStrategy: 'qwenChatPrompt' },
  { key: 'ais', aliases: ['aistudio', 'ai studio', 'google ai studio'], name: 'Google AI Studio', template: 'https://aistudio.google.com/prompts/new_chat', action: 'openAndSubmit', submitStrategy: 'aiStudioPrompt' },
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
} = SEARCH_UTILS_DIRECT_NAVIGATION.createDirectNavigation();
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
} = SEARCH_UTILS_TEXT_NORMALIZE.createTextNormalize();
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
  shouldAllowLooseTextContains: (term) => shouldAllowLooseTextContains(term)
});
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
  getNow: (options) => getNow(options),
  SEARCH_SELECTION_POLICY,
  buildSearchDedupUrlKey
});
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
  findProviderForSiteSearchSuggestion: (suggestion, providers) => findProviderForSiteSearchSuggestion(suggestion, providers)
});
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
const {
  isSearchOpenTabSuggestion,
  buildSearchBrandDirectSuggestion,
  applySearchSuggestionHostDiversity,
  composeSearchSuggestionSlate,
  limitSearchSuggestionsForDisplay,
  filterSearchSuggestionsBySourceTypes
} = SEARCH_UTILS_BRAND_SUGGESTIONS.createBrandSuggestions({
  DEFAULT_SITE_SEARCH_PROVIDERS,
  findSiteSearchProvider: (trigger, providers) => findSiteSearchProvider(trigger, providers),
  findSiteSearchProviderByKey: (trigger, providers) => findSiteSearchProviderByKey(trigger, providers),
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
  getUrlHost: (url) => getUrlHost(url),
  findSiteSearchProvider: (trigger, providers) => findSiteSearchProvider(trigger, providers),
  siteSearchHostsMatch: (a, b) => siteSearchHostsMatch(a, b),
  getSiteSearchProviderHost: (provider) => getSiteSearchProviderHost(provider)
});
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

export {
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
};
