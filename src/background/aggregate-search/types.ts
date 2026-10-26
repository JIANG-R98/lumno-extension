// The shapes of an aggregate search run.
import type { AggregateSearch, AggregateSearchAvailability } from '../../domain/search/aggregate-search-store';
import type { SiteSearchProvider } from '../../domain/search/types';
import type { AggregateSearchReply, OpenDisposition } from '../../domain/messages';
import type { MessageSender } from '../message-router';
import type { SubmitResult } from '../../domain/ai-prompt-strategy';
import type { TabPlacement } from '../search-result-tabs';

type GetEntryUrl = (provider: SiteSearchProvider, query: string) => string;
type IsInteractiveProvider = (provider: SiteSearchProvider) => boolean;
type WaitForTabComplete = (tabId: number, timeoutMs?: number) => Promise<unknown>;
type SubmitPromptInTab = (
  chromeApi: typeof chrome,
  tabId: number,
  prompt: string,
  strategyName: string,
  expectedUrl: string
) => Promise<SubmitResult>;
type ScheduleActivation = (task: () => void, delayMs: number) => unknown;

interface AggregateSearchOpenOptions {
  definition?: AggregateSearch | null;
  query?: string;
  providers?: readonly SiteSearchProvider[];
  // Sources the definition names that are missing or disabled.
  unavailableSourceCount?: number;
  autoCreateTabGroup?: boolean;
  windowId?: number;
  // Where the first tab opens; at the end of the window without one.
  insertIndex?: number;
  disposition?: OpenDisposition;
  getEntryUrl?: GetEntryUrl;
  isInteractiveProvider?: IsInteractiveProvider;
  waitForTabComplete?: WaitForTabComplete;
  submitPromptInTab?: SubmitPromptInTab;
  scheduleActivation?: ScheduleActivation;
}

// openAggregateSearch's outcome, with every count set.
interface AggregateSearchResult extends AggregateSearchReply {
  requestedCount: number;
  openedCount: number;
  failedCount: number;
  unavailableSourceCount: number;
  grouped: boolean;
  groupId: number | null;
  groupTitleApplied: boolean;
  activatedTabId: number | null;
  activationDeferred: boolean;
  activationDelayMs: number;
  interactiveRequestedCount: number;
  interactiveSucceededCount: number;
  interactiveFailedCount: number;
  reason: string;
  warnings: string[];
}

type OpenAggregateSearch = (
  chromeApi: typeof chrome | null | undefined,
  options: AggregateSearchOpenOptions
) => Promise<AggregateSearchReply>;

interface AggregateSearchStoreLike {
  getAggregateSearchAvailability(
    definition: unknown,
    providers: readonly SiteSearchProvider[] | null | undefined
  ): AggregateSearchAvailability;
}

interface AggregateSearchQueryRunnerConfig {
  aggregateSearchStore?: AggregateSearchStoreLike | null;
  chromeApi?: typeof chrome | null;
  loadAggregateSearches?: () => Promise<AggregateSearch[]>;
  loadSiteSearchProviders?: () => Promise<SiteSearchProvider[]> | SiteSearchProvider[];
  // The grouping setting; anything but a boolean leaves it to the definitions.
  loadAggregateSearchAutoGroupEnabled?: () => Promise<unknown> | unknown;
  resolveTabPlacement?: (sourceTab: chrome.tabs.Tab | null) => Promise<Partial<TabPlacement>>;
  openAggregateSearch?: OpenAggregateSearch;
  getEntryUrl?: GetEntryUrl;
  isInteractiveProvider?: IsInteractiveProvider;
  waitForTabComplete?: WaitForTabComplete;
  submitPromptInTab?: SubmitPromptInTab;
  now?: () => number;
  dedupeWindowMs?: number;
}

type AggregateSearchQueryRunner = (
  aggregateId: unknown,
  query: unknown,
  sender: MessageSender | null | undefined,
  disposition?: OpenDisposition
) => Promise<AggregateSearchReply>;

interface ProviderPlan {
  provider: SiteSearchProvider;
  // '' when the provider has no safe address for the query.
  url: string;
  interactive: boolean;
}

interface CreatedTab {
  tab: chrome.tabs.Tab | null;
  error: string;
}

interface PlanTab extends CreatedTab {
  plan: ProviderPlan;
}

interface OpenedPlanTab extends PlanTab {
  tab: chrome.tabs.Tab & { id: number };
}

// A recent or running search, shared by identical requests.
interface RequestEntry {
  pending: boolean;
  expiresAt: number;
  promise: Promise<AggregateSearchReply>;
}

export type {
  AggregateSearchOpenOptions,
  AggregateSearchQueryRunner,
  AggregateSearchQueryRunnerConfig,
  AggregateSearchResult,
  AggregateSearchStoreLike,
  CreatedTab,
  GetEntryUrl,
  IsInteractiveProvider,
  OpenAggregateSearch,
  OpenedPlanTab,
  PlanTab,
  ProviderPlan,
  RequestEntry,
  ScheduleActivation,
  SubmitPromptInTab,
  WaitForTabComplete
};
