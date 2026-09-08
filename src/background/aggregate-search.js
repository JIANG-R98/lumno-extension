(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoBackgroundAggregateSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_DEDUPE_WINDOW_MS = 1000;
  const ACTIVATION_FEEDBACK_DELAY_MS = 2300;

  function getLastErrorMessage(chromeApi, fallback) {
    const runtime = chromeApi && chromeApi.runtime;
    return runtime && runtime.lastError
      ? String(runtime.lastError.message || fallback)
      : '';
  }

  function createBackgroundTab(chromeApi, createProperties) {
    return new Promise((resolve) => {
      try {
        chromeApi.tabs.create(createProperties, (tab) => {
          const error = getLastErrorMessage(chromeApi, 'tab-create-failed');
          if (error || !tab || typeof tab.id !== 'number') {
            resolve({ tab: null, error: error || 'tab-create-failed' });
            return;
          }
          resolve({ tab, error: '' });
        });
      } catch (error) {
        resolve({
          tab: null,
          error: error && error.message ? error.message : 'tab-create-failed'
        });
      }
    });
  }

  function groupTabs(chromeApi, tabIds) {
    return new Promise((resolve) => {
      if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.group !== 'function') {
        resolve({ groupId: null, error: 'tab-group-api-unavailable' });
        return;
      }
      try {
        chromeApi.tabs.group({ tabIds }, (groupId) => {
          const error = getLastErrorMessage(chromeApi, 'tab-group-failed');
          if (error || typeof groupId !== 'number') {
            resolve({ groupId: null, error: error || 'tab-group-failed' });
            return;
          }
          resolve({ groupId, error: '' });
        });
      } catch (error) {
        resolve({
          groupId: null,
          error: error && error.message ? error.message : 'tab-group-failed'
        });
      }
    });
  }

  function titleTabGroup(chromeApi, groupId, title) {
    return new Promise((resolve) => {
      if (!chromeApi || !chromeApi.tabGroups ||
          typeof chromeApi.tabGroups.update !== 'function') {
        resolve({ ok: false, error: 'tab-group-api-unavailable' });
        return;
      }
      try {
        chromeApi.tabGroups.update(groupId, { title }, () => {
          const error = getLastErrorMessage(chromeApi, 'tab-group-title-failed');
          resolve({ ok: !error, error });
        });
      } catch (error) {
        resolve({
          ok: false,
          error: error && error.message ? error.message : 'tab-group-title-failed'
        });
      }
    });
  }

  function activateTab(chromeApi, tabId) {
    return new Promise((resolve) => {
      if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.update !== 'function') {
        resolve({ ok: false, error: 'tab-activate-api-unavailable' });
        return;
      }
      try {
        chromeApi.tabs.update(tabId, { active: true }, (tab) => {
          const error = getLastErrorMessage(chromeApi, 'tab-activate-failed');
          resolve({ ok: !error, tab: tab || null, error });
        });
      } catch (error) {
        resolve({
          ok: false,
          tab: null,
          error: error && error.message ? error.message : 'tab-activate-failed'
        });
      }
    });
  }

  function createResult(overrides) {
    return Object.assign({
      ok: false,
      requestedCount: 0,
      openedCount: 0,
      failedCount: 0,
      unavailableSourceCount: 0,
      grouped: false,
      groupId: null,
      groupTitleApplied: false,
      activatedTabId: null,
      activationDeferred: false,
      activationDelayMs: 0,
      interactiveRequestedCount: 0,
      interactiveSucceededCount: 0,
      interactiveFailedCount: 0,
      reason: '',
      warnings: []
    }, overrides || {});
  }

  function isSafeSearchUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return false;
    }
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (_error) {
      return false;
    }
  }

  function buildProviderPlans(options, query) {
    const providers = Array.isArray(options.providers) ? options.providers : [];
    const getEntryUrl = typeof options.getEntryUrl === 'function'
      ? options.getEntryUrl
      : () => '';
    const isInteractiveProvider = typeof options.isInteractiveProvider === 'function'
      ? options.isInteractiveProvider
      : () => false;
    return providers.map((provider) => {
      let url = '';
      try {
        url = String(getEntryUrl(provider, query) || '').trim();
      } catch (_error) {
        url = '';
      }
      if (!isSafeSearchUrl(url)) {
        url = '';
      }
      return {
        provider,
        url,
        interactive: Boolean(isInteractiveProvider(provider))
      };
    });
  }

  function submitInteractivePrompt(chromeApi, options, openedItem, query) {
    const waitForTabComplete = typeof options.waitForTabComplete === 'function'
      ? options.waitForTabComplete
      : null;
    const submitPromptInTab = typeof options.submitPromptInTab === 'function'
      ? options.submitPromptInTab
      : null;
    if (!submitPromptInTab) {
      return Promise.resolve({ ok: false, reason: 'submit-runtime-unavailable' });
    }
    const tab = openedItem && openedItem.tab;
    const plan = openedItem && openedItem.plan;
    if (!tab || typeof tab.id !== 'number' || !plan) {
      return Promise.resolve({ ok: false, reason: 'tab-unavailable' });
    }
    const ready = waitForTabComplete
      ? Promise.resolve()
        .then(() => waitForTabComplete(tab.id, 15000))
        .catch(() => tab)
      : Promise.resolve(tab);
    return ready
      .then(() => submitPromptInTab(
        chromeApi,
        tab.id,
        query,
        String(plan.provider && plan.provider.submitStrategy || '').trim(),
        plan.url
      ))
      .then((result) => ({
        ok: Boolean(result && result.ok),
        reason: result && result.reason ? String(result.reason) : ''
      }))
      .catch((error) => ({
        ok: false,
        reason: error && error.message ? error.message : 'interactive-site-search-failed'
      }));
  }

  async function openAggregateSearch(chromeApi, rawOptions) {
    const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
    const query = String(options.query || '').trim();
    const unavailableSourceCount = Math.max(0, Number(options.unavailableSourceCount) || 0);
    if (!query) {
      return createResult({ unavailableSourceCount, reason: 'invalid-query' });
    }
    if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.create !== 'function') {
      return createResult({ unavailableSourceCount, reason: 'tabs-api-unavailable' });
    }

    const plans = buildProviderPlans(options, query);
    const requestedCount = plans.length;
    if (!requestedCount) {
      return createResult({
        requestedCount,
        unavailableSourceCount,
        reason: 'aggregate-sources-unavailable'
      });
    }
    const invalidPlanCount = plans.filter((plan) => !plan.url).length;
    if (invalidPlanCount > 0) {
      return createResult({
        requestedCount,
        failedCount: invalidPlanCount,
        unavailableSourceCount,
        reason: 'provider-url-unavailable'
      });
    }

    const windowId = Number(options.windowId);
    const creationResults = await Promise.all(plans.map((plan) => {
      const createProperties = {
        url: plan.url,
        active: false
      };
      if (Number.isFinite(windowId)) {
        createProperties.windowId = windowId;
      }
      return createBackgroundTab(chromeApi, createProperties)
        .then((result) => ({ ...result, plan }));
    }));
    const openedItems = creationResults.filter((result) => (
      result && result.tab && typeof result.tab.id === 'number'
    ));
    const openedCount = openedItems.length;
    const failedCount = requestedCount - openedCount;
    if (!openedCount) {
      return createResult({
        requestedCount,
        openedCount,
        failedCount,
        unavailableSourceCount,
        reason: 'tab-create-failed'
      });
    }

    const warnings = [];
    if (failedCount > 0) {
      warnings.push('partial-tab-create-failure');
    }

    const hasExplicitGroupSetting = Object.prototype.hasOwnProperty.call(
      options,
      'autoCreateTabGroup'
    );
    const definition = options.definition && typeof options.definition === 'object'
      ? options.definition
      : null;
    const hasLegacyGroupSetting = Boolean(definition) && Object.prototype.hasOwnProperty.call(
      definition,
      'autoCreateTabGroup'
    );
    const shouldCreateGroup = hasExplicitGroupSetting
      ? options.autoCreateTabGroup === true
      : (hasLegacyGroupSetting ? definition.autoCreateTabGroup === true : true);
    let groupId = null;
    let grouped = false;
    let groupTitleApplied = false;
    if (shouldCreateGroup) {
      const groupResult = await groupTabs(
        chromeApi,
        openedItems.map((item) => item.tab.id)
      );
      if (groupResult.error) {
        warnings.push(groupResult.error);
      } else {
        groupId = groupResult.groupId;
        grouped = true;
        const titleResult = await titleTabGroup(chromeApi, groupId, query);
        groupTitleApplied = titleResult.ok;
        if (titleResult.error) {
          warnings.push(titleResult.error);
        }
      }
    }

    const interactiveItems = openedItems.filter((item) => item.plan.interactive);
    const interactiveOutcomes = await Promise.all(interactiveItems.map((item) => (
      submitInteractivePrompt(chromeApi, options, item, query)
        .then((result) => ({ item, result }))
    )));
    const interactiveSucceededCount = interactiveOutcomes.filter(
      (outcome) => outcome.result.ok
    ).length;
    const interactiveFailedCount = interactiveOutcomes.length - interactiveSucceededCount;
    if (interactiveFailedCount > 0) {
      warnings.push('interactive-submit-failed');
    }
    const nonInteractiveOpenedCount = openedItems.length - interactiveItems.length;
    const completedSearchCount = nonInteractiveOpenedCount + interactiveSucceededCount;
    const searchSucceeded = completedSearchCount > 0;
    const successfulInteractiveTabIds = new Set(interactiveOutcomes
      .filter((outcome) => outcome.result.ok)
      .map((outcome) => outcome.item.tab.id));
    const firstSuccessfulItem = openedItems.find((item) => (
      !item.plan.interactive || successfulInteractiveTabIds.has(item.tab.id)
    ));
    let activatedTabId = null;
    let activationDeferred = false;
    if (searchSucceeded && firstSuccessfulItem && options.disposition !== 'backgroundTab') {
      const firstTabId = firstSuccessfulItem.tab.id;
      if (warnings.length > 0) {
        const scheduleActivation = typeof options.scheduleActivation === 'function'
          ? options.scheduleActivation
          : (task, delayMs) => setTimeout(task, delayMs);
        try {
          scheduleActivation(() => {
            activateTab(chromeApi, firstTabId).catch(() => {});
          }, ACTIVATION_FEEDBACK_DELAY_MS);
          activationDeferred = true;
        } catch (error) {
          warnings.push(error && error.message ? error.message : 'tab-activate-failed');
          const activateResult = await activateTab(chromeApi, firstTabId);
          if (activateResult.ok) {
            activatedTabId = firstTabId;
          } else if (activateResult.error) {
            warnings.push(activateResult.error);
          }
        }
      } else {
        const activateResult = await activateTab(chromeApi, firstTabId);
        if (activateResult.ok) {
          activatedTabId = firstTabId;
        } else if (activateResult.error) {
          warnings.push(activateResult.error);
        }
      }
    }

    return createResult({
      ok: searchSucceeded,
      requestedCount,
      openedCount,
      failedCount,
      unavailableSourceCount,
      grouped,
      groupId,
      groupTitleApplied,
      activatedTabId,
      activationDeferred,
      activationDelayMs: activationDeferred ? ACTIVATION_FEEDBACK_DELAY_MS : 0,
      interactiveRequestedCount: interactiveItems.length,
      interactiveSucceededCount,
      interactiveFailedCount,
      reason: searchSucceeded
        ? (warnings[0] || '')
        : 'interactive-submit-failed',
      warnings
    });
  }

  function getAggregateRequestSenderKey(sender) {
    const tab = sender && sender.tab ? sender.tab : null;
    if (tab && typeof tab.id === 'number') {
      return `tab:${tab.id}`;
    }
    if (tab && typeof tab.windowId === 'number') {
      return `window:${tab.windowId}`;
    }
    return 'extension';
  }

  function resolveAggregateSearchAutoGroupEnabled(value, definitions, fallbackDefinition) {
    if (typeof value === 'boolean') {
      return value;
    }
    const items = Array.isArray(definitions) ? definitions : [];
    const legacyItems = items.filter((item) => (
      item && Object.prototype.hasOwnProperty.call(item, 'autoCreateTabGroup')
    ));
    if (legacyItems.length > 0) {
      return legacyItems.some((item) => item.autoCreateTabGroup === true);
    }
    if (fallbackDefinition && Object.prototype.hasOwnProperty.call(
      fallbackDefinition,
      'autoCreateTabGroup'
    )) {
      return fallbackDefinition.autoCreateTabGroup === true;
    }
    return true;
  }

  function createAggregateSearchQueryRunner(rawConfig) {
    const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    const store = config.aggregateSearchStore || {};
    const loadSiteSearchProviders = config.loadSiteSearchProviders;
    const loadAggregateSearchAutoGroupEnabled =
      config.loadAggregateSearchAutoGroupEnabled;
    const openSearch = typeof config.openAggregateSearch === 'function'
      ? config.openAggregateSearch
      : openAggregateSearch;
    const now = typeof config.now === 'function' ? config.now : Date.now;
    const dedupeWindowMs = Math.max(
      0,
      Number(config.dedupeWindowMs) || DEFAULT_DEDUPE_WINDOW_MS
    );
    const requests = new Map();

    function pruneRequests(timestamp) {
      requests.forEach((entry, key) => {
        if (!entry.pending && entry.expiresAt <= timestamp) {
          requests.delete(key);
        }
      });
    }

    function execute(aggregateId, query, sender, disposition) {
      const normalizedId = String(aggregateId || '').trim().toLowerCase();
      const normalizedQuery = String(query || '').trim();
      if (!normalizedId || !normalizedQuery) {
        return Promise.resolve({ ok: false, reason: 'invalid-aggregate-search-request' });
      }
      if (typeof store.loadAggregateSearches !== 'function' ||
          typeof store.getAggregateSearchAvailability !== 'function' ||
          typeof loadSiteSearchProviders !== 'function' ||
          typeof openSearch !== 'function') {
        return Promise.resolve({ ok: false, reason: 'aggregate-search-runtime-unavailable' });
      }

      const timestamp = now();
      pruneRequests(timestamp);
      const requestKey = [
        getAggregateRequestSenderKey(sender),
        normalizedId,
        normalizedQuery,
        String(disposition || 'currentTab')
      ].join('\n');
      const existing = requests.get(requestKey);
      if (existing && (existing.pending || existing.expiresAt > timestamp)) {
        return existing.promise;
      }

      const autoGroupSettingTask = typeof loadAggregateSearchAutoGroupEnabled === 'function'
        ? Promise.resolve()
          .then(() => loadAggregateSearchAutoGroupEnabled())
          .then(
            (value) => typeof value === 'boolean' ? value : undefined,
            () => undefined
          )
        : Promise.resolve(undefined);
      const task = Promise.all([
        store.loadAggregateSearches(config.storageArea, config.storageKey, config.chromeApi),
        Promise.resolve().then(() => loadSiteSearchProviders()),
        autoGroupSettingTask
      ]).then(([definitions, providers, autoGroupSetting]) => {
        const definition = (Array.isArray(definitions) ? definitions : []).find((item) => (
          String(item && item.id || '').trim().toLowerCase() === normalizedId
        ));
        if (!definition) {
          return { ok: false, reason: 'aggregate-search-not-found' };
        }
        const availability = store.getAggregateSearchAvailability(definition, providers);
        const requiredSourceCount = Math.max(
          0,
          Number(availability && availability.requiredSourceCount) || 0
        );
        const availableSourceCount = Math.max(
          0,
          Number(availability && availability.availableSourceCount) || 0
        );
        const unavailableSourceCount = Math.max(
          0,
          Number(availability && availability.unavailableSourceCount) || 0
        );
        if (!availability || availability.available !== true) {
          return {
            ok: false,
            reason: 'aggregate-search-sources-unavailable',
            requiredSourceCount,
            availableSourceCount,
            unavailableSourceCount
          };
        }
        const sourceTab = sender && sender.tab ? sender.tab : null;
        return openSearch(config.chromeApi, {
          definition: availability.definition,
          query: normalizedQuery,
          providers: availability.providers,
          unavailableSourceCount,
          autoCreateTabGroup: resolveAggregateSearchAutoGroupEnabled(
            autoGroupSetting,
            definitions,
            availability.definition
          ),
          windowId: sourceTab && typeof sourceTab.windowId === 'number'
            ? sourceTab.windowId
            : undefined,
          disposition,
          getEntryUrl: config.getEntryUrl,
          isInteractiveProvider: config.isInteractiveProvider,
          waitForTabComplete: config.waitForTabComplete,
          submitPromptInTab: config.submitPromptInTab
        });
      });

      const entry = {
        pending: true,
        expiresAt: Number.POSITIVE_INFINITY,
        promise: null
      };
      entry.promise = task.then((result) => {
        entry.pending = false;
        entry.expiresAt = now() + dedupeWindowMs;
        return result;
      }, (error) => {
        if (requests.get(requestKey) === entry) {
          requests.delete(requestKey);
        }
        throw error;
      });
      requests.set(requestKey, entry);
      return entry.promise;
    }

    return execute;
  }

  return Object.freeze({
    ACTIVATION_FEEDBACK_DELAY_MS,
    DEFAULT_DEDUPE_WINDOW_MS,
    createAggregateSearchQueryRunner,
    isSafeSearchUrl,
    openAggregateSearch,
    resolveAggregateSearchAutoGroupEnabled
  });
});
