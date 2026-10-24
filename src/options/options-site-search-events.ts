// @ts-nocheck
// Click handlers for the site search, aggregate search and blacklist
// lists and their add, reset and clear buttons.
function createSiteSearchEvents(deps) {
  const {
    siteSearchCustomList,
    handleSiteSearchListClick,
    siteSearchEngineBuiltinList,
    siteSearchBuiltinList,
    siteSearchAiBuiltinList,
    siteSearchCancelButton,
    resetSiteSearchForm,
    siteSearchFormTrigger,
    setSiteSearchFormExpanded,
    siteSearchInsertQueryButton,
    insertSiteSearchQueryToken,
    siteSearchCategoryButtons,
    setLegacySiteSearchDraftCategory,
    siteSearchAddButton,
    attachSaveButtonAnimation,
    suspendSiteSearchRefresh,
    setSiteSearchError,
    siteSearchKeyInput,
    siteSearchNameInput,
    siteSearchTemplateInput,
    normalizeAliases,
    siteSearchAliasInput,
    getMessage,
    findSiteSearchKeyConflict,
    normalizeSiteSearchTemplate,
    getSiteSearchBuiltinKey,
    normalizeSiteSearchProvider,
    createPersistentId,
    saveSiteSearchProviderState,
    renderSiteSearchList,
    refreshSiteSearchProviders,
    showToast,
    builtinResetButton,
    attachPopconfirm,
    loadDefaultSiteSearchProviders,
    loadCustomSiteSearchProviders,
    renderAggregateSearchList,
    customClearButton,
    aggregateSearchClearButton,
    handleAggregateSearchClear,
    blacklistClearButton,
    saveSearchBlacklistItems,
    renderSearchBlacklistList,
    resetBlacklistForm,
    notifyNewtabSectionsRefresh,
    faviconBlacklistClearButton,
    saveFaviconRequestBlacklistItems,
    renderFaviconRequestBlacklistList,
    resetFaviconBlacklistForm
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  if (siteSearchCustomList) {
    siteSearchCustomList.addEventListener('click', handleSiteSearchListClick);
  }
  if (siteSearchEngineBuiltinList) {
    siteSearchEngineBuiltinList.addEventListener('click', handleSiteSearchListClick);
  }
  if (siteSearchBuiltinList) {
    siteSearchBuiltinList.addEventListener('click', handleSiteSearchListClick);
  }
  if (siteSearchAiBuiltinList) {
    siteSearchAiBuiltinList.addEventListener('click', handleSiteSearchListClick);
  }

  if (siteSearchCancelButton) {
    siteSearchCancelButton.addEventListener('click', function() {
      resetSiteSearchForm();
    });
  }

  if (siteSearchFormTrigger) {
    siteSearchFormTrigger.addEventListener('click', () => {
      setSiteSearchFormExpanded(true);
    });
  }

  if (siteSearchInsertQueryButton) {
    siteSearchInsertQueryButton.addEventListener('click', () => {
      setSiteSearchFormExpanded(true);
      insertSiteSearchQueryToken();
    });
  }

  siteSearchCategoryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setLegacySiteSearchDraftCategory(button.dataset.siteSearchCategory);
    });
  });

  if (siteSearchAddButton) {
    attachSaveButtonAnimation(siteSearchAddButton);
    siteSearchAddButton.addEventListener('click', function() {
      if (!optionsState.siteSearchFormExpanded) {
        setSiteSearchFormExpanded(true);
        return;
      }
      suspendSiteSearchRefresh(260);
      setSiteSearchError('');
      const key = String(siteSearchKeyInput ? siteSearchKeyInput.value : '').trim();
      const name = String(siteSearchNameInput ? siteSearchNameInput.value : '').trim();
      const templateRaw = String(siteSearchTemplateInput ? siteSearchTemplateInput.value : '').trim();
      const aliases = normalizeAliases(siteSearchAliasInput ? siteSearchAliasInput.value : '');
      if (!key) {
        setSiteSearchError(getMessage('shortcuts_error_key', '请填写触发词。'));
        return;
      }
      if (/\s/.test(key)) {
        setSiteSearchError(getMessage('shortcuts_error_key_space', '触发词不能包含空格。'));
        return;
      }
      if (findSiteSearchKeyConflict(key, optionsState.editingSiteSearchKey || '')) {
        setSiteSearchError(getMessage('shortcuts_error_key_duplicate', '该触发词已存在，请更换。'));
        return;
      }
      const template = normalizeSiteSearchTemplate(templateRaw);
      if (!template || !template.includes('{query}')) {
        setSiteSearchError(getMessage('toast_error_template', '搜索模板必须包含 {query}。'));
        return;
      }
      const normalizedKey = key.toLowerCase();
      const editingItem = optionsState.customSiteSearchProviders.find(
        (item) => String(item.key || '').toLowerCase() === String(optionsState.editingSiteSearchKey || '').toLowerCase()
      );
      const builtinKey = getSiteSearchBuiltinKey(editingItem);
      let next = optionsState.customSiteSearchProviders.filter((item) => String(item.key || '').toLowerCase() !== normalizedKey);
      if (optionsState.editingSiteSearchKey && optionsState.editingSiteSearchKey.toLowerCase() !== normalizedKey) {
        next = next.filter((item) => String(item.key || '').toLowerCase() !== optionsState.editingSiteSearchKey.toLowerCase());
      }
      const nextItem = normalizeSiteSearchProvider({
        ...(editingItem || {}),
        id: String(editingItem && editingItem.id ? editingItem.id : '').trim() || createPersistentId('source'),
        key: key,
        name: name || key,
        template: template,
        aliases: aliases,
        category: optionsState.siteSearchDraftCategory === 'searchEngine' ? 'searchEngine' : 'site',
        ...(builtinKey ? { builtinKey } : {})
      });
      if (!nextItem) {
        setSiteSearchError(getMessage('toast_error', '操作失败，请重试。'));
        return;
      }
      next.unshift(nextItem);
      const lowerKey = normalizedKey;
      const nextDisabledKeys = new Set(optionsState.disabledSiteSearchKeys);
      if (builtinKey) {
        nextDisabledKeys.add(builtinKey);
      } else {
        nextDisabledKeys.delete(lowerKey);
      }
      saveSiteSearchProviderState(next, nextDisabledKeys).then(() => {
        optionsState.customSiteSearchProviders = next;
        optionsState.customSiteSearchProviderIdsReady = true;
        optionsState.disabledSiteSearchKeys = nextDisabledKeys;
        renderSiteSearchList();
        refreshSiteSearchProviders();
        resetSiteSearchForm();
        showToast(getMessage('toast_saved', '已保存'), false);
      }).catch(() => {
        setSiteSearchError(getMessage('toast_error', '操作失败，请重试。'));
        showToast(getMessage('toast_error', '操作失败，请重试。'), true);
      });
    });
  }

  if (builtinResetButton) {
    attachPopconfirm(
      builtinResetButton,
      'confirm_reset_builtin',
      '确认重置内置列表？',
      () => {
        loadDefaultSiteSearchProviders().then((defaults) => Promise.all([
          Promise.resolve(defaults),
          loadCustomSiteSearchProviders(defaults)
        ])).then(([defaults, custom]) => {
          const defaultKeys = new Set((defaults || []).map((item) => String(item.key || '').toLowerCase()));
          const filteredCustom = (custom || []).filter((item) => {
            const key = String(item && item.key ? item.key : '').toLowerCase();
            const builtinKey = getSiteSearchBuiltinKey(item);
            return key && !defaultKeys.has(key) && !defaultKeys.has(builtinKey);
          });
          saveSiteSearchProviderState(filteredCustom, new Set()).then(() => {
            optionsState.customSiteSearchProviders = filteredCustom;
            optionsState.customSiteSearchProviderIdsReady = true;
            optionsState.disabledSiteSearchKeys = new Set();
            renderSiteSearchList();
            renderAggregateSearchList();
          }).catch(() => {
            showToast(getMessage('toast_error', '操作失败，请重试。'), true);
          });
        }).catch(() => {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        });
      }
    );
  }

  if (customClearButton) {
    attachPopconfirm(
      customClearButton,
      'confirm_clear_custom',
      '确认清空自定义搜索？',
      () => {
        const nextDisabledKeys = new Set(optionsState.disabledSiteSearchKeys);
        optionsState.customSiteSearchProviders.forEach((item) => {
          const builtinKey = getSiteSearchBuiltinKey(item);
          if (builtinKey) {
            nextDisabledKeys.delete(builtinKey);
          }
        });
        saveSiteSearchProviderState([], nextDisabledKeys).then(() => {
          optionsState.customSiteSearchProviders = [];
          optionsState.customSiteSearchProviderIdsReady = true;
          optionsState.disabledSiteSearchKeys = nextDisabledKeys;
          renderSiteSearchList();
          renderAggregateSearchList();
          showToast(getMessage('toast_cleared', '已清空'), false);
        }).catch(() => {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        });
      }
    );
  }

  if (aggregateSearchClearButton) {
    attachPopconfirm(
      aggregateSearchClearButton,
      'confirm_clear_aggregate_search',
      '确认清空聚合搜索？',
      handleAggregateSearchClear
    );
  }

  if (blacklistClearButton) {
    attachPopconfirm(
      blacklistClearButton,
      'confirm_clear_blacklist',
      '确认清空黑名单？',
      () => {
        saveSearchBlacklistItems([]).then((savedItems) => {
          optionsState.searchBlacklistItems = savedItems;
          renderSearchBlacklistList();
          resetBlacklistForm();
          notifyNewtabSectionsRefresh('recent');
          showToast(getMessage('toast_cleared', '已清空'), false);
        }).catch(() => {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        });
      }
    );
  }
  if (faviconBlacklistClearButton) {
    attachPopconfirm(
      faviconBlacklistClearButton,
      'confirm_clear_favicon_blacklist',
      '确认清空排除规则？',
      () => {
        saveFaviconRequestBlacklistItems([]).then((savedItems) => {
          optionsState.faviconRequestBlacklistItems = savedItems;
          renderFaviconRequestBlacklistList();
          resetFaviconBlacklistForm();
          showToast(getMessage('toast_cleared', '已清空'), false);
        }).catch(() => showToast(getMessage('toast_error', '操作失败，请重试。'), true));
      }
    );
  }

  return {};
}

export { createSiteSearchEvents };
