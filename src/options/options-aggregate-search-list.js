(function(root) {
  // The aggregate search list: available providers, item models, saving,
  // removing and clearing aggregate searches, and their error copy.
  function createAggregateSearchList(deps) {
    const {
      AGGREGATE_SEARCH_STORE,
      aggregateSearchModel,
      SEARCH_UTILS,
      isAiSiteSearchProvider,
      getMessage,
      isSearchEngineSiteSearchProvider,
      getSiteSearchItemIconUrl,
      getLocalizedBuiltinProviderName,
      formatTemplate,
      aggregateSearchListController,
      syncClearButtonAvailability,
      aggregateSearchClearButton,
      renderedSearchSourceKeys,
      getSearchSourceReorderCopy,
      AGGREGATE_SEARCH_STORAGE_KEY,
      getActivePrimaryAreaName,
      SETTINGS,
      AGGREGATE_SEARCH,
      showToast,
      createPersistentId,
      findSiteSearchKeyConflict,
      getSiteSearchErrorMessage
    } = deps;

    // The page state object shared with options.js and the other modules.
    const optionsState = deps.optionsState;

    let aggregateSearchesReady = false;
    let aggregateSearchStateCoordinator = null;

    function normalizeAggregateSearches(value) {
      return AGGREGATE_SEARCH_STORE.normalizeAggregateSearches(value);
    }

    function deriveLegacyAggregateSearchAutoGroupEnabled(value) {
      return aggregateSearchModel.deriveLegacyAutoGroupEnabled(value);
    }

    function getAggregateSearchProviderSourceRef(provider) {
      return AGGREGATE_SEARCH_STORE.getProviderSourceRef(provider);
    }

    function getAggregateSearchAvailableProviders() {
      const activeDefaults = optionsState.defaultSiteSearchProviders.filter((item) => {
        const key = String(item && item.key ? item.key : '').trim().toLowerCase();
        return key && !optionsState.disabledSiteSearchKeys.has(key);
      });
      const aggregateCustomProviders = optionsState.customSiteSearchProviderIdsReady
        ? optionsState.customSiteSearchProviders
        : optionsState.customSiteSearchProviders.filter((item) => String(item && item.id ? item.id : '').trim());
      return SEARCH_UTILS.mergeCustomProviders(activeDefaults, aggregateCustomProviders);
    }

    function getAggregateSearchProviderGroup(provider) {
      if (isAiSiteSearchProvider(provider)) {
        return {
          group: 'aiSearch',
          label: getMessage('shortcuts_group_ai', 'AI 搜索')
        };
      }
      if (isSearchEngineSiteSearchProvider(provider)) {
        return {
          group: 'searchEngine',
          label: getMessage('search_scope_group_engines', '搜索引擎')
        };
      }
      return {
        group: 'site',
        label: getMessage('search_scope_group_sites', '站内搜索')
      };
    }

    function getAggregateSearchListCopy() {
      return {
        addLabel: getMessage('aggregate_search_add', '添加聚合搜索'),
        cancelLabel: getMessage('shortcuts_cancel', '取消'),
        confirmLabel: getMessage('confirm_ok', '确认'),
        confirmMessage: getMessage('confirm_remove_item', '确认移除该项？'),
        confirmMessageKey: 'confirm_remove_item',
        defaultNameBase: getMessage('aggregate_search_default_name', '聚合搜索'),
        editLabel: getMessage('shortcuts_edit', '编辑'),
        groupBadge: getMessage('aggregate_search_badge', '聚合'),
        keyLabel: getMessage('shortcuts_label_key', '触发词'),
        keyPlaceholder: getMessage('aggregate_search_key_placeholder', '例如 tech'),
        keyRequiredError: getMessage('shortcuts_error_key', '请填写触发词。'),
        keySpaceError: getMessage('shortcuts_error_key_space', '触发词不能包含空格。'),
        maxSourcesError: getMessage(
          'aggregate_search_max_sources_error',
          '最多可选择 10 个搜索源。'
        ),
        minSourcesError: getMessage(
          'aggregate_search_min_sources_error',
          '请至少选择 2 个搜索源。'
        ),
        nameLabel: getMessage('aggregate_search_name_label', '名称'),
        nameRequiredError: getMessage(
          'aggregate_search_name_required_error',
          '请填写聚合搜索名称。'
        ),
        removeLabel: getMessage('shortcuts_remove', '移除'),
        saveLabel: getMessage('shortcuts_save', '保存修改'),
        selectedCountLabel: getMessage('aggregate_search_selected_count', '已选 {count}/{max}'),
        sourcesLabel: getMessage('aggregate_search_sources_label', '搜索源'),
        unavailableGroupLabel: getMessage(
          'aggregate_search_unavailable_group',
          '不可用的搜索源'
        ),
        unavailableSourceLabel: getMessage(
          'aggregate_search_unavailable_name',
          '不可用的搜索源（{source}）'
        )
      };
    }

    function getAggregateSearchProviderModels() {
      const providers = getAggregateSearchAvailableProviders();
      const availableRefs = new Set();
      const models = providers.map((provider) => {
        const sourceRef = getAggregateSearchProviderSourceRef(provider);
        if (!sourceRef) {
          return null;
        }
        availableRefs.add(sourceRef);
        const grouping = getAggregateSearchProviderGroup(provider);
        return {
          available: true,
          group: grouping.group,
          groupLabel: grouping.label,
          iconUrl: getSiteSearchItemIconUrl(provider),
          name: getLocalizedBuiltinProviderName(provider),
          sourceRef
        };
      }).filter(Boolean);
      const unavailableRefs = Array.from(new Set(
        optionsState.aggregateSearches.flatMap((item) => Array.isArray(item.sourceRefs) ? item.sourceRefs : [])
      )).filter((ref) => !availableRefs.has(ref));
      unavailableRefs.forEach((sourceRef) => {
        models.push({
          available: false,
          group: 'unavailable',
          groupLabel: getMessage('aggregate_search_unavailable_group', '不可用的搜索源'),
          name: formatTemplate(
            getMessage('aggregate_search_unavailable_name', '不可用的搜索源（{source}）'),
            { source: sourceRef }
          ),
          sourceRef
        });
      });
      return models;
    }

    function getAggregateSearchItemModel(item) {
      const count = Array.isArray(item && item.sourceRefs) ? item.sourceRefs.length : 0;
      const providers = getAggregateSearchAvailableProviders();
      const availability = AGGREGATE_SEARCH_STORE.getAggregateSearchAvailability(item, providers);
      if (!availability.available) {
        return {
          id: String(item && item.id ? item.id : ''),
          key: String(item && item.key ? item.key : ''),
          name: String(item && item.name ? item.name : ''),
          sourceRefs: Array.isArray(item && item.sourceRefs) ? item.sourceRefs.slice() : [],
          sourceSummary: formatTemplate(
            getMessage(
              'aggregate_search_source_summary_unavailable',
              '{count} sources · {unavailable} unavailable · Update required'
            ),
            {
              count,
              unavailable: Number(availability.unavailableSourceCount) || 0
            }
          )
        };
      }
      return {
        id: String(item && item.id ? item.id : ''),
        key: String(item && item.key ? item.key : ''),
        name: String(item && item.name ? item.name : ''),
        sourceRefs: Array.isArray(item && item.sourceRefs) ? item.sourceRefs.slice() : [],
        sourceSummary: formatTemplate(
          getMessage('aggregate_search_source_summary', '{count} sources'),
          { count }
        )
      };
    }

    function renderAggregateSearchList() {
      if (!aggregateSearchListController || typeof aggregateSearchListController.render !== 'function') {
        return;
      }
      syncClearButtonAvailability(aggregateSearchClearButton, optionsState.aggregateSearches.length > 0);
      const ordered = optionsState.searchSourceOrderController.sortList(
        optionsState.aggregateSearches,
        'aggregate',
        (item) => item && item.id
      );
      renderedSearchSourceKeys.aggregate = ordered.map((item) => String(item.id || ''));
      aggregateSearchListController.render({
        copy: getAggregateSearchListCopy(),
        items: ordered.map(getAggregateSearchItemModel),
        reorder: getSearchSourceReorderCopy(),
        maxKeyLength: aggregateSearchModel.limits.maxKeyLength,
        maxNameLength: aggregateSearchModel.limits.maxNameLength,
        maxSourceCount: aggregateSearchModel.limits.maxSources,
        minSourceCount: aggregateSearchModel.limits.minSources,
        providers: getAggregateSearchProviderModels()
      });
    }

    function saveAggregateSearches(items) {
      const serialized = AGGREGATE_SEARCH_STORE.serializeAggregateSearches(items);
      const serializedBytes = AGGREGATE_SEARCH_STORE.getSerializedStorageByteLength(
        serialized,
        AGGREGATE_SEARCH_STORAGE_KEY
      );
      const byteBudget = Number(AGGREGATE_SEARCH_STORE.SYNC_ITEM_BYTE_BUDGET) || 7800;
      if (getActivePrimaryAreaName() === 'sync' && serializedBytes > byteBudget) {
        return Promise.reject(new Error('aggregate-search-sync-item-quota-exceeded'));
      }
      return SETTINGS.writeStorageValue(
        optionsState.rawStorageArea,
        chrome,
        AGGREGATE_SEARCH_STORAGE_KEY,
        serialized
      ).then(() => serialized.items);
    }

    function getAggregateSearchStateCoordinator() {
      if (!aggregateSearchStateCoordinator) {
        aggregateSearchStateCoordinator = AGGREGATE_SEARCH.createAggregateSearchStateCoordinator({
          apply(items) {
            optionsState.aggregateSearches = items;
            aggregateSearchesReady = true;
            renderAggregateSearchList();
          },
          getCurrent() {
            return optionsState.aggregateSearches;
          },
          load() {
            const loader = AGGREGATE_SEARCH_STORE.loadAggregateSearches;
            if (typeof loader !== 'function') {
              throw new Error('aggregate-search-runtime-unavailable');
            }
            return loader(optionsState.rawStorageArea, AGGREGATE_SEARCH_STORAGE_KEY, chrome);
          },
          normalize: normalizeAggregateSearches,
          onLoadError(error) {
            aggregateSearchesReady = false;
            console.warn('[Lumno] Could not load aggregate searches.', error);
            showToast(getMessage('toast_error', '操作失败，请重试。'), true);
          },
          save: saveAggregateSearches
        });
      }
      return aggregateSearchStateCoordinator;
    }

    function refreshAggregateSearches() {
      return getAggregateSearchStateCoordinator().refresh();
    }

    function handleAggregateSearchSave(id, draft) {
      if (!aggregateSearchesReady) {
        return Promise.resolve({ ok: false, error: getAggregateSearchErrorMessage('storage_unavailable') });
      }
      const built = aggregateSearchModel.buildAggregateSearchItem(id, draft, {
        availableProviders: getAggregateSearchAvailableProviders(),
        createId: () => createPersistentId('aggregate'),
        hasKeyConflict: (key, currentId) => Boolean(findSiteSearchKeyConflict(key, '', currentId)),
        items: optionsState.aggregateSearches
      });
      if (!built.ok) {
        return Promise.resolve({ ok: false, error: getAggregateSearchErrorMessage(built.error) });
      }
      return getAggregateSearchStateCoordinator().enqueueMutation((items) => {
        const merged = aggregateSearchModel.mergeAggregateSearchItem(items, built.item, id);
        return merged.ok ? merged : { ok: false, error: getAggregateSearchErrorMessage(merged.error) };
      }).then((result) => {
        if (!result || !result.ok) {
          return result;
        }
        showToast(getMessage('toast_saved', '已保存'), false);
        return { ok: true };
      }).catch(() => {
        const error = getMessage('toast_error', '操作失败，请重试。');
        showToast(error, true);
        return { ok: false, error };
      });
    }

    function getAggregateSearchErrorMessage(errorKey) {
      switch (errorKey) {
        case 'storage_unavailable':
          return getMessage(
            'aggregate_search_storage_unavailable_error',
            'Aggregate searches could not be loaded. Reload Settings and try again.'
          );
        case 'aggregate_search_name_required_error':
          return getMessage('aggregate_search_name_required_error', '请填写聚合搜索名称。');
        case 'aggregate_search_min_sources_error':
          return getMessage('aggregate_search_min_sources_error', '请至少选择 2 个搜索源。');
        case 'aggregate_search_max_sources_error':
          return getMessage('aggregate_search_max_sources_error', '最多可选择 10 个搜索源。');
        case 'aggregate_search_source_selection_unavailable_error':
          return getMessage(
            'aggregate_search_source_selection_unavailable_error',
            'Remove unavailable sources and select at least two available sources.'
          );
        case 'aggregate_search_max_items_error':
          return getMessage('aggregate_search_max_items_error', '最多可创建 8 个聚合搜索。');
        case 'aggregate_search_name_duplicate_error':
          return getMessage('aggregate_search_name_duplicate_error', '已存在同名的聚合搜索。');
        default:
          return getSiteSearchErrorMessage(errorKey);
      }
    }

    function handleAggregateSearchRemove(id) {
      if (!aggregateSearchesReady) {
        showToast(getAggregateSearchErrorMessage('storage_unavailable'), true);
        return Promise.resolve();
      }
      return getAggregateSearchStateCoordinator().enqueueMutation((items) => ({
        items: items.filter((item) => String(item.id || '') !== String(id || '')),
        ok: true
      })).then(() => {
        showToast(getMessage('toast_removed', '已移除'), false);
      }).catch(() => {
        showToast(getMessage('toast_error', '操作失败，请重试。'), true);
      });
    }

    function handleAggregateSearchClear() {
      if (!aggregateSearchesReady) {
        showToast(getAggregateSearchErrorMessage('storage_unavailable'), true);
        return Promise.resolve();
      }
      return getAggregateSearchStateCoordinator().enqueueMutation(() => ({
        items: [],
        ok: true
      })).then(() => {
        showToast(getMessage('toast_cleared', '已清空'), false);
      }).catch(() => {
        showToast(getMessage('toast_error', '操作失败，请重试。'), true);
      });
    }

    return {
      deriveLegacyAggregateSearchAutoGroupEnabled,
      renderAggregateSearchList,
      getAggregateSearchStateCoordinator,
      refreshAggregateSearches,
      handleAggregateSearchSave,
      handleAggregateSearchRemove,
      handleAggregateSearchClear
    };
  }

  root.LumnoOptionsPageAggregateSearchList = { createAggregateSearchList };
})(globalThis);
