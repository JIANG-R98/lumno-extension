// What each suggestion row offers to do: its action tags, its visit button,
// how modifier keys change the action, and whether a new slate needs a full
// render or only new highlights.
import type { SiteSearchProvider, SuggestionLike } from './types';

type SearchAction = 'switch' | 'search' | 'open' | 'openNewTab' | 'openBackgroundTab' | 'go';

type OpenDisposition = 'currentTab' | 'backgroundTab' | 'newTab';

// The keys held when a result is opened.
interface OpenModifiers {
  openInCurrentTab?: boolean;
  openSwitchInNewTab?: boolean;
  openInBackgroundTab?: boolean;
}

// A provider as rows carry it; command rows add display fields.
interface DisplayedProvider extends Partial<SiteSearchProvider> {
  label?: string;
  displayName?: string;
  favicon?: string;
}

// A row as the suggestion list shows it.
interface DisplayedSuggestion extends SuggestionLike {
  favicon?: string;
  path?: string;
  detail?: string;
  recommended?: boolean;
  commandText?: string;
  // The other words that type a command row's command.
  commandAliases?: string[];
  provider?: DisplayedProvider | null;
  searchQuery?: string;
  forceSearch?: boolean;
  nextMode?: string;
  nextEnabled?: boolean;
  reasons?: unknown[];
}

type MaybeSuggestion = DisplayedSuggestion | null | undefined;

interface ActionTag {
  action: string;
}

interface SearchActionModel {
  actionTags: ActionTag[];
  visitButtonAction: SearchAction | null;
  alwaysHideVisitButton: boolean;
  hasActionTags: boolean;
  hasSwitchAction: boolean;
  hideSourceTags: boolean;
}

interface SearchActionModelOptions {
  suggestion?: MaybeSuggestion;
  isPrimaryHighlight?: boolean;
  primaryHighlightReason?: string;
  onlyKeywordSuggestions?: boolean;
  isPrimarySearchSuggest?: boolean;
  isMergedHighlight?: boolean;
  shouldSwitchMatchedTab?: boolean;
  simpleMode?: boolean;
  // What Enter does on the primary row.
  enterAction?: string;
}

interface ActionContextOptions {
  primarySuggestion?: MaybeSuggestion;
  primaryHighlightIndex?: number;
  primaryHighlightReason?: string;
  onlyKeywordSuggestions?: boolean;
  mergedProvider?: { key?: string } | null;
}

type SuggestionUpdateKind = 'highlight' | 'content' | 'append' | 'structure';

interface UpdateKindOptions {
  forceFullRerender?: boolean;
  currentSuggestions?: unknown;
  allSuggestions?: unknown;
  actionContextKey?: string;
  lastRenderedActionContextKey?: string;
  includeDebugReasons?: boolean;
}

const SITE_SEARCH_TYPES = new Set([
  'siteSearch',
  'inlineSiteSearch',
  'siteSearchPrompt'
]);

const COMMAND_SUGGESTION_TYPES = new Set([
  'commandNewTab',
  'commandSettings',
  'modeSwitch',
  'zenSwitch',
  'webAppearanceSwitch',
  'commandOpenTabs',
  'commandCopyUrl',
  'commandDocumentPip'
]);

const PRIMARY_ACTION_REASONS = new Set<string>([
  'topSite',
  'inline',
  'autocomplete',
  'openTab',
  'currentOpenTab'
]);

function isDirectNavigationSuggestion(suggestion: MaybeSuggestion): boolean {
  return Boolean(
    suggestion &&
    (suggestion.type === 'directUrl' || suggestion.type === 'browserPage')
  );
}

function isSiteSearchSuggestion(suggestion: MaybeSuggestion): boolean {
  return Boolean(suggestion && SITE_SEARCH_TYPES.has(String(suggestion.type)));
}

function getVisitButtonAction(suggestion: MaybeSuggestion, options?: { shouldSwitchMatchedTab?: boolean } | null): SearchAction | null {
  const config = options || {};
  if (!suggestion) {
    return null;
  }
  if (COMMAND_SUGGESTION_TYPES.has(String(suggestion.type))) {
    return null;
  }
  if (suggestion.type === 'newtab') {
    return 'search';
  }
  if (config.shouldSwitchMatchedTab) {
    return 'switch';
  }
  if (isSiteSearchSuggestion(suggestion)) {
    return 'search';
  }
  if (isDirectNavigationSuggestion(suggestion)) {
    return 'open';
  }
  if (suggestion.type === 'googleSuggest') {
    return 'search';
  }
  return 'openNewTab';
}

function getModifierAdjustedAction(action: unknown, options?: OpenModifiers | null): string {
  const rawAction = String(action || '');
  const config = options || {};
  if (config.openSwitchInNewTab && rawAction === 'switch') {
    return config.openInBackgroundTab && !config.openInCurrentTab
      ? 'openBackgroundTab'
      : 'openNewTab';
  }
  if (config.openInCurrentTab && rawAction === 'openNewTab') {
    return 'go';
  }
  if (config.openInBackgroundTab && !config.openInCurrentTab &&
      (rawAction === 'openNewTab' || rawAction === 'go' || rawAction === 'switch')) {
    return 'openBackgroundTab';
  }
  return rawAction;
}

function shouldOpenNewTabActionInCurrentTab(
  suggestion: MaybeSuggestion,
  options?: (OpenModifiers & { action?: string; shouldSwitchMatchedTab?: boolean }) | null
): boolean {
  const config = options || {};
  if (!config.openInCurrentTab) {
    return false;
  }
  const action = config.action || getVisitButtonAction(suggestion, config);
  return action === 'openNewTab';
}

function shouldOpenSwitchActionInNewTab(
  suggestion: MaybeSuggestion,
  options?: (OpenModifiers & { action?: string; shouldSwitchMatchedTab?: boolean }) | null
): boolean {
  const config = options || {};
  if (!config.openSwitchInNewTab || !suggestion || !suggestion.url) {
    return false;
  }
  const action = config.action || getVisitButtonAction(suggestion, config);
  return action === 'switch';
}

function getSearchResultOpenDisposition(options?: OpenModifiers | null): OpenDisposition {
  const config = options || {};
  if (config.openInCurrentTab) {
    return 'currentTab';
  }
  if (config.openInBackgroundTab) {
    return 'backgroundTab';
  }
  return 'newTab';
}

function createSearchActionModel(options?: SearchActionModelOptions | null): SearchActionModel {
  const config: SearchActionModelOptions = options || {};
  const suggestion = config.suggestion || null;
  const isPrimaryHighlight = Boolean(config.isPrimaryHighlight);
  const primaryHighlightReason = String(config.primaryHighlightReason || '');
  const onlyKeywordSuggestions = Boolean(config.onlyKeywordSuggestions);
  const isPrimarySearchSuggest = Boolean(config.isPrimarySearchSuggest);
  const isMergedHighlight = Boolean(config.isMergedHighlight);
  const shouldSwitchMatchedTab = Boolean(config.shouldSwitchMatchedTab);
  const simpleMode = Boolean(config.simpleMode);
  const enterAction = config.enterAction || 'openNewTab';
  const actionTags: ActionTag[] = [];
  const isDirectHighlight = isPrimaryHighlight && isDirectNavigationSuggestion(suggestion);
  const shouldShowPrimaryActionTag = !isPrimarySearchSuggest &&
    isPrimaryHighlight &&
    !onlyKeywordSuggestions &&
    (
      PRIMARY_ACTION_REASONS.has(primaryHighlightReason) ||
      isDirectHighlight ||
      isMergedHighlight
    );

  if (shouldSwitchMatchedTab) {
    actionTags.push({ action: 'switch' });
  } else if (shouldShowPrimaryActionTag) {
    actionTags.push({ action: enterAction });
  }
  if (!simpleMode && isPrimaryHighlight && onlyKeywordSuggestions && suggestion && suggestion.type === 'newtab') {
    actionTags.push({ action: 'search' });
  }

  const visitButtonAction = getVisitButtonAction(suggestion, {
    shouldSwitchMatchedTab
  });
  const alwaysHideVisitButton = simpleMode || !visitButtonAction || Boolean(
    suggestion && (suggestion.type === 'modeSwitch' || suggestion.type === 'zenSwitch')
  );

  return {
    actionTags,
    visitButtonAction,
    alwaysHideVisitButton,
    hasActionTags: actionTags.length > 0,
    hasSwitchAction: shouldSwitchMatchedTab,
    hideSourceTags: shouldSwitchMatchedTab
  };
}

function shouldShowVisitButton(
  model: { alwaysHideVisitButton?: boolean; visitButtonAction?: string | null; hasActionTags?: boolean } | null | undefined,
  isActive: boolean
): boolean {
  if (!model || model.alwaysHideVisitButton || !model.visitButtonAction) {
    return false;
  }
  return !(isActive && model.hasActionTags);
}

function getProviderKey(provider: { key?: string } | null | undefined): string {
  return provider && provider.key ? String(provider.key) : '';
}

// What decides the primary row's actions; a change means the rows need
// their action tags rendered again.
function getActionContextKey(options?: ActionContextOptions | null): string {
  const config: ActionContextOptions = options || {};
  const primarySuggestion = config.primarySuggestion || null;
  const matchedTabId = primarySuggestion && typeof primarySuggestion._xMatchedTabId === 'number'
    ? String(primarySuggestion._xMatchedTabId)
    : '';
  return [
    Number.isInteger(config.primaryHighlightIndex) ? String(config.primaryHighlightIndex) : '-1',
    String(config.primaryHighlightReason || ''),
    config.onlyKeywordSuggestions ? 'keyword' : 'mixed',
    getProviderKey(config.mergedProvider),
    primarySuggestion && primarySuggestion.type ? String(primarySuggestion.type) : '',
    primarySuggestion && primarySuggestion.url ? String(primarySuggestion.url) : '',
    getProviderKey(primarySuggestion && primarySuggestion.provider),
    matchedTabId
  ].join('|');
}

function getSuggestionProviderIdentity(suggestion: MaybeSuggestion): string {
  const provider = suggestion && suggestion.provider;
  if (!provider || typeof provider !== 'object') {
    return '';
  }
  return String(
    provider.key ||
    provider.id ||
    provider.template ||
    provider.name ||
    ''
  );
}

// Everything a row shows; equal fingerprints render the same.
function getSuggestionPresentationFingerprint(
  suggestion: MaybeSuggestion,
  options?: { includeDebugReasons?: boolean } | null
): string {
  if (!suggestion || typeof suggestion !== 'object') {
    return '';
  }
  const config = options || {};
  const provider = suggestion.provider && typeof suggestion.provider === 'object'
    ? suggestion.provider
    : null;
  return JSON.stringify([
    String(suggestion.type || ''),
    String(suggestion.title || ''),
    String(suggestion.url || ''),
    String(suggestion.favicon || ''),
    String(suggestion.path || ''),
    String(suggestion.detail || ''),
    suggestion.recommended === true,
    String(suggestion.commandText || ''),
    suggestion.isTopSite === true,
    getSuggestionProviderIdentity(suggestion),
    provider ? String(provider.name || '') : '',
    provider ? String(provider.label || '') : '',
    provider ? String(provider.displayName || '') : '',
    provider ? String(provider.action || '') : '',
    provider ? String(provider.template || '') : '',
    provider ? String(provider.icon || provider.favicon || '') : '',
    String(suggestion.searchQuery || ''),
    suggestion.forceSearch === true,
    String(suggestion._xMatchedTabId ?? ''),
    String(suggestion.nextMode || ''),
    String(suggestion.nextEnabled ?? ''),
    config.includeDebugReasons === true && Array.isArray(suggestion.reasons)
      ? suggestion.reasons
          .map((reason) => String(reason || '').trim())
          .filter(Boolean)
      : []
  ]);
}

// Which row a suggestion is, across slates.
function getSuggestionStructureIdentity(suggestion: MaybeSuggestion): string {
  if (!suggestion || typeof suggestion !== 'object') {
    return '';
  }
  const matchedTabId = suggestion._xMatchedTabId;
  if (typeof matchedTabId === 'number' ||
      (typeof matchedTabId === 'string' && matchedTabId)) {
    return `matched-tab:${String(matchedTabId)}`;
  }
  const type = String(suggestion.type || 'suggestion');
  if (type === 'directUrl' || type === 'newtab') {
    return `${type}:query-action`;
  }
  const providerIdentity = getSuggestionProviderIdentity(suggestion);
  if (SITE_SEARCH_TYPES.has(type)) {
    return `${type}:provider:${providerIdentity || 'default'}`;
  }
  const url = String(suggestion.url || '');
  if (url) {
    return `${type}:url:${url}`;
  }
  const commandText = String(suggestion.commandText || '');
  if (commandText) {
    return `${type}:command:${commandText}`;
  }
  const searchQuery = String(suggestion.searchQuery || '');
  if (providerIdentity || searchQuery) {
    return `${type}:provider:${providerIdentity}:query:${searchQuery}`;
  }
  return `${type}:title:${String(suggestion.title || '')}`;
}

function hasSameSuggestionSequence(
  previous: unknown,
  next: unknown,
  compare: (previous: DisplayedSuggestion, next: DisplayedSuggestion) => boolean
): boolean {
  if (!Array.isArray(previous) || !Array.isArray(next) ||
      previous.length !== next.length) {
    return false;
  }
  return previous.every((item, index) => compare(item, next[index]));
}

function getSuggestionUpdateKind(options?: UpdateKindOptions | null): SuggestionUpdateKind {
  const config: UpdateKindOptions = options || {};
  if (config.forceFullRerender === true) {
    return 'structure';
  }
  const sameStructure = hasSameSuggestionSequence(
    config.currentSuggestions,
    config.allSuggestions,
    (previous, next) => {
      const identity = getSuggestionStructureIdentity(previous);
      return Boolean(identity && identity === getSuggestionStructureIdentity(next));
    }
  );
  const sameActionContext =
    config.actionContextKey === config.lastRenderedActionContextKey;
  if (sameStructure) {
    const sameContent = hasSameSuggestionSequence(
      config.currentSuggestions,
      config.allSuggestions,
      (previous, next) => getSuggestionPresentationFingerprint(previous, config) ===
        getSuggestionPresentationFingerprint(next, config)
    );
    return sameContent && sameActionContext ? 'highlight' : 'content';
  }
  const previous = config.currentSuggestions;
  const next = config.allSuggestions;
  const isStablePrefix = sameActionContext &&
    Array.isArray(previous) &&
    Array.isArray(next) &&
    previous.length > 0 &&
    previous.length < next.length &&
    previous.every((item: DisplayedSuggestion, index: number) => {
      const identity = getSuggestionStructureIdentity(item);
      return Boolean(identity && identity === getSuggestionStructureIdentity(next[index]));
    });
  return isStablePrefix ? 'append' : 'structure';
}

export {
  createSearchActionModel,
  getVisitButtonAction,
  getModifierAdjustedAction,
  getSearchResultOpenDisposition,
  shouldOpenSwitchActionInNewTab,
  shouldOpenNewTabActionInCurrentTab,
  shouldShowVisitButton,
  getActionContextKey,
  getSuggestionPresentationFingerprint,
  getSuggestionStructureIdentity,
  getSuggestionUpdateKind
};
export type {
  ActionTag,
  DisplayedSuggestion,
  OpenDisposition,
  OpenModifiers,
  SearchAction,
  SearchActionModel,
  SearchActionModelOptions,
  SuggestionUpdateKind
};
