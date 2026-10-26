// Running an aggregate search: one tab per source (in a tab group when the
// setting asks), prompts typed into the AI sources' pages, and the first
// finished search brought to the front.
import { buildProviderPlans, createResult } from './plans';
import { ACTIVATION_FEEDBACK_DELAY_MS, activateTab, createBackgroundTab, getErrorMessage, groupTabs, hasOwn, submitInteractivePrompt, titleTabGroup } from './tabs';
import type { AggregateSearchOpenOptions, AggregateSearchResult, OpenedPlanTab, PlanTab, ProviderPlan, ScheduleActivation } from './types';

// The plans to open, or the result that ends the search before any tab opens.
function planAggregateSearch(
  chromeApi: typeof chrome | null | undefined,
  options: AggregateSearchOpenOptions,
  query: string,
  unavailableSourceCount: number
): { plans: ProviderPlan[]; tabsApi: typeof chrome } | { result: AggregateSearchResult } {
  if (!query) {
    return { result: createResult({ unavailableSourceCount, reason: 'invalid-query' }) };
  }
  if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.create !== 'function') {
    return { result: createResult({ unavailableSourceCount, reason: 'tabs-api-unavailable' }) };
  }
  const plans = buildProviderPlans(options, query);
  const requestedCount = plans.length;
  if (!requestedCount) {
    return { result: createResult({ requestedCount, unavailableSourceCount, reason: 'aggregate-sources-unavailable' }) };
  }
  const invalidPlanCount = plans.filter((plan) => !plan.url).length;
  if (invalidPlanCount > 0) {
    return { result: createResult({
      requestedCount,
      failedCount: invalidPlanCount,
      unavailableSourceCount,
      reason: 'provider-url-unavailable'
    }) };
  }
  return { plans, tabsApi: chromeApi };
}

async function openPlanTabs(
  chromeApi: typeof chrome,
  options: AggregateSearchOpenOptions,
  plans: readonly ProviderPlan[]
): Promise<PlanTab[]> {
  const windowId = Number(options.windowId);
  const insertIndex = typeof options.insertIndex === 'number' && Number.isInteger(options.insertIndex) &&
    options.insertIndex >= 0
    ? options.insertIndex
    : null;
  const createPlanTab = (plan: ProviderPlan, offset: number): Promise<PlanTab> => {
    const createProperties: chrome.tabs.CreateProperties = {
      url: plan.url,
      active: false
    };
    if (Number.isFinite(windowId)) {
      createProperties.windowId = windowId;
    }
    if (insertIndex !== null) {
      createProperties.index = insertIndex + offset;
    }
    return createBackgroundTab(chromeApi, createProperties)
      .then((result) => ({ ...result, plan }));
  };
  if (insertIndex === null) {
    return Promise.all(plans.map((plan) => createPlanTab(plan, 0)));
  }
  // Insert in source order; parallel insertion can reverse or interleave tabs.
  const creationResults: PlanTab[] = [];
  let openedOffset = 0;
  for (const plan of plans) {
    const result = await createPlanTab(plan, openedOffset);
    creationResults.push(result);
    if (result.tab && typeof result.tab.id === 'number') {
      openedOffset += 1;
    }
  }
  return creationResults;
}

function shouldGroupTabs(options: AggregateSearchOpenOptions): boolean {
  if (hasOwn(options, 'autoCreateTabGroup')) {
    return options.autoCreateTabGroup === true;
  }
  const definition = options.definition && typeof options.definition === 'object' ? options.definition : null;
  return definition && hasOwn(definition, 'autoCreateTabGroup') ? definition.autoCreateTabGroup === true : true;
}

type GroupOutcome = Pick<AggregateSearchResult, 'grouped' | 'groupId' | 'groupTitleApplied'>;

async function groupOpenedTabs(
  chromeApi: typeof chrome,
  options: AggregateSearchOpenOptions,
  openedItems: readonly OpenedPlanTab[],
  query: string,
  warnings: string[]
): Promise<GroupOutcome> {
  const outcome: GroupOutcome = { grouped: false, groupId: null, groupTitleApplied: false };
  if (!shouldGroupTabs(options)) {
    return outcome;
  }
  const [first, ...others] = openedItems;
  const groupResult = await groupTabs(chromeApi, [first.tab.id, ...others.map((item) => item.tab.id)]);
  if (groupResult.error || groupResult.groupId === null) {
    warnings.push(groupResult.error);
    return outcome;
  }
  const definition = options.definition && typeof options.definition === 'object' ? options.definition : null;
  const aggregateName = String(definition && definition.name || '').trim();
  const groupTitle = aggregateName ? `${aggregateName}：${query}` : query;
  const titleResult = await titleTabGroup(chromeApi, groupResult.groupId, groupTitle);
  if (titleResult.error) {
    warnings.push(titleResult.error);
  }
  return { grouped: true, groupId: groupResult.groupId, groupTitleApplied: titleResult.ok };
}

interface InteractiveOutcome {
  requestedCount: number;
  succeededCount: number;
  // The first tab whose search went through, to bring forward.
  firstSuccessfulItem: OpenedPlanTab | undefined;
}

async function submitInteractivePrompts(
  chromeApi: typeof chrome,
  options: AggregateSearchOpenOptions,
  openedItems: readonly OpenedPlanTab[],
  query: string,
  warnings: string[]
): Promise<InteractiveOutcome> {
  const interactiveItems = openedItems.filter((item) => item.plan.interactive);
  const outcomes = await Promise.all(interactiveItems.map((item) => (
    submitInteractivePrompt(chromeApi, options, item, query)
      .then((result) => ({ item, result }))
  )));
  const succeededTabIds = new Set(outcomes
    .filter((outcome) => outcome.result.ok)
    .map((outcome) => outcome.item.tab.id));
  if (outcomes.length > succeededTabIds.size) {
    warnings.push('interactive-submit-failed');
  }
  return {
    requestedCount: interactiveItems.length,
    succeededCount: succeededTabIds.size,
    firstSuccessfulItem: openedItems.find((item) => !item.plan.interactive || succeededTabIds.has(item.tab.id))
  };
}

async function activateNow(chromeApi: typeof chrome, tabId: number, warnings: string[]): Promise<number | null> {
  const activateResult = await activateTab(chromeApi, tabId);
  if (activateResult.ok) {
    return tabId;
  }
  if (activateResult.error) {
    warnings.push(activateResult.error);
  }
  return null;
}

type ActivationOutcome = Pick<AggregateSearchResult, 'activatedTabId' | 'activationDeferred'>;

// Brings the first finished tab forward. With warnings to show, it waits a
// moment so the page that started the search can show them first.
async function activateFirstTab(
  chromeApi: typeof chrome,
  options: AggregateSearchOpenOptions,
  tabId: number,
  warnings: string[]
): Promise<ActivationOutcome> {
  if (warnings.length === 0) {
    return { activatedTabId: await activateNow(chromeApi, tabId, warnings), activationDeferred: false };
  }
  const scheduleActivation: ScheduleActivation = typeof options.scheduleActivation === 'function'
    ? options.scheduleActivation
    : (task, delayMs) => setTimeout(task, delayMs);
  try {
    scheduleActivation(() => {
      activateTab(chromeApi, tabId).catch(() => {});
    }, ACTIVATION_FEEDBACK_DELAY_MS);
    return { activatedTabId: null, activationDeferred: true };
  } catch (error) {
    warnings.push(getErrorMessage(error, 'tab-activate-failed'));
    return { activatedTabId: await activateNow(chromeApi, tabId, warnings), activationDeferred: false };
  }
}

async function openAggregateSearch(
  chromeApi: typeof chrome | null | undefined,
  rawOptions: AggregateSearchOpenOptions | null | undefined
): Promise<AggregateSearchResult> {
  const options: AggregateSearchOpenOptions = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const query = String(options.query || '').trim();
  const unavailableSourceCount = Math.max(0, Number(options.unavailableSourceCount) || 0);
  const planned = planAggregateSearch(chromeApi, options, query, unavailableSourceCount);
  if ('result' in planned) {
    return planned.result;
  }
  const { plans, tabsApi } = planned;
  const requestedCount = plans.length;
  const openedItems = (await openPlanTabs(tabsApi, options, plans)).filter((result): result is OpenedPlanTab => (
    Boolean(result && result.tab && typeof result.tab.id === 'number')
  ));
  const openedCount = openedItems.length;
  const failedCount = requestedCount - openedCount;
  if (!openedItems.length) {
    return createResult({ requestedCount, openedCount, failedCount, unavailableSourceCount, reason: 'tab-create-failed' });
  }
  const warnings: string[] = failedCount > 0 ? ['partial-tab-create-failure'] : [];
  const group = await groupOpenedTabs(tabsApi, options, openedItems, query, warnings);
  const interactive = await submitInteractivePrompts(tabsApi, options, openedItems, query, warnings);
  const searchSucceeded = openedCount - interactive.requestedCount + interactive.succeededCount > 0;
  const activation = searchSucceeded && interactive.firstSuccessfulItem && options.disposition !== 'backgroundTab'
    ? await activateFirstTab(tabsApi, options, interactive.firstSuccessfulItem.tab.id, warnings)
    : { activatedTabId: null, activationDeferred: false };
  return createResult({
    ok: searchSucceeded,
    requestedCount,
    openedCount,
    failedCount,
    unavailableSourceCount,
    ...group,
    ...activation,
    activationDelayMs: activation.activationDeferred ? ACTIVATION_FEEDBACK_DELAY_MS : 0,
    interactiveRequestedCount: interactive.requestedCount,
    interactiveSucceededCount: interactive.succeededCount,
    interactiveFailedCount: interactive.requestedCount - interactive.succeededCount,
    reason: searchSucceeded ? (warnings[0] || '') : 'interactive-submit-failed',
    warnings
  });
}

export {
  activateFirstTab,
  activateNow,
  groupOpenedTabs,
  openAggregateSearch,
  openPlanTabs,
  planAggregateSearch,
  shouldGroupTabs,
  submitInteractivePrompts
};
export type {
  ActivationOutcome,
  GroupOutcome,
  InteractiveOutcome
};
