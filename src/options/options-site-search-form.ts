// @ts-nocheck
// The site search form: validating providers and key conflicts, its
// expanded and editing state, inserting the query token, and the save
// button animation.
function createSiteSearchForm(deps) {
  const {
    SEARCH_UTILS,
    siteSearchError,
    siteSearchCategoryButtons,
    siteSearchForm,
    siteSearchFormTrigger,
    siteSearchCancelButton,
    getMessage,
    siteSearchKeyInput,
    siteSearchAddButton,
    siteSearchTemplateInput,
    siteSearchNameInput,
    siteSearchAliasInput
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function normalizeSiteSearchTemplate(template) {
    return SEARCH_UTILS.normalizeSiteSearchTemplate(template);
  }

  function isAiSiteSearchProvider(item) {
    return SEARCH_UTILS.isAiSiteSearchProvider(item);
  }

  function isSearchEngineSiteSearchProvider(item) {
    return SEARCH_UTILS.isSearchEngineSiteSearchProvider(item);
  }

  function normalizeSiteSearchProvider(item, baseItem) {
    return SEARCH_UTILS.normalizeSiteSearchProvider(item, baseItem);
  }

  function findSiteSearchKeyConflict(key, allowedKey, allowedAggregateId) {
    return optionsState.siteSearchModel.findSiteSearchKeyConflict(key, allowedKey, allowedAggregateId, {
      aggregateSearches: optionsState.aggregateSearches,
      providers: optionsState.defaultSiteSearchProviders.concat(optionsState.customSiteSearchProviders)
    });
  }

  function setSiteSearchError(message) {
    if (!siteSearchError) {
      return;
    }
    if (!message) {
      siteSearchError.textContent = '';
      siteSearchError.style.display = 'none';
      return;
    }
    siteSearchError.textContent = message;
    siteSearchError.style.display = 'block';
  }

  function setLegacySiteSearchDraftCategory(category) {
    optionsState.siteSearchDraftCategory = category === 'searchEngine' ? 'searchEngine' : 'site';
    siteSearchCategoryButtons.forEach((button) => {
      const active = button.dataset.siteSearchCategory === optionsState.siteSearchDraftCategory;
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setSiteSearchFormExpanded(expanded) {
    optionsState.siteSearchFormExpanded = Boolean(expanded);
    if (siteSearchForm) {
      siteSearchForm.setAttribute('data-expanded', optionsState.siteSearchFormExpanded ? 'true' : 'false');
    }
    if (siteSearchFormTrigger) {
      siteSearchFormTrigger.setAttribute('aria-expanded', optionsState.siteSearchFormExpanded ? 'true' : 'false');
    }
    if (siteSearchCancelButton) {
      siteSearchCancelButton.style.display = optionsState.siteSearchFormExpanded ? 'inline-flex' : 'none';
      if (siteSearchCancelButton.textContent) {
        siteSearchCancelButton.textContent = getMessage('shortcuts_cancel', siteSearchCancelButton.textContent);
      }
    }
    if (optionsState.siteSearchFormExpanded && siteSearchKeyInput) {
      siteSearchKeyInput.focus();
    }
  }

  function setEditingState(key) {
    optionsState.editingSiteSearchKey = key;
    if (siteSearchAddButton) {
      siteSearchAddButton.textContent = key
        ? getMessage('shortcuts_save', '保存修改')
        : getMessage('shortcuts_add', '添加自定义搜索');
      siteSearchAddButton.classList.add('_x_extension_shortcut_save_2024_unique_');
    }
  }

  function insertSiteSearchQueryToken() {
    if (!siteSearchTemplateInput) {
      return;
    }
    const token = '{query}';
    const currentValue = String(siteSearchTemplateInput.value || '');
    const existingIndex = currentValue.indexOf(token);
    if (existingIndex >= 0) {
      const nextCursor = existingIndex + token.length;
      siteSearchTemplateInput.focus();
      if (typeof siteSearchTemplateInput.setSelectionRange === 'function') {
        siteSearchTemplateInput.setSelectionRange(nextCursor, nextCursor);
      }
      return;
    }
    const selectionStart = Number.isInteger(siteSearchTemplateInput.selectionStart)
      ? siteSearchTemplateInput.selectionStart
      : currentValue.length;
    const selectionEnd = Number.isInteger(siteSearchTemplateInput.selectionEnd)
      ? siteSearchTemplateInput.selectionEnd
      : selectionStart;
    const safeStart = Math.max(0, Math.min(selectionStart, currentValue.length));
    const safeEnd = Math.max(safeStart, Math.min(selectionEnd, currentValue.length));
    const nextValue = `${currentValue.slice(0, safeStart)}${token}${currentValue.slice(safeEnd)}`;
    const nextCursor = safeStart + token.length;
    siteSearchTemplateInput.value = nextValue;
    siteSearchTemplateInput.focus();
    if (typeof siteSearchTemplateInput.setSelectionRange === 'function') {
      siteSearchTemplateInput.setSelectionRange(nextCursor, nextCursor);
    }
    siteSearchTemplateInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function attachSaveButtonAnimation(button) {
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      if (!button.classList.contains('_x_extension_shortcut_save_2024_unique_')) {
        return;
      }
      button.classList.remove('_x_extension_shortcut_save_pulse_2024_unique_');
      void button.offsetWidth;
      button.classList.add('_x_extension_shortcut_save_pulse_2024_unique_');
    });
    button.addEventListener('animationend', () => {
      button.classList.remove('_x_extension_shortcut_save_pulse_2024_unique_');
    });
  }

  function suspendSiteSearchRefresh(durationMs) {
    const now = Date.now();
    optionsState.siteSearchRefreshSuppressUntil = Math.max(optionsState.siteSearchRefreshSuppressUntil, now + durationMs);
  }

  function resetSiteSearchForm() {
    if (siteSearchKeyInput) siteSearchKeyInput.value = '';
    if (siteSearchNameInput) siteSearchNameInput.value = '';
    if (siteSearchTemplateInput) siteSearchTemplateInput.value = '';
    if (siteSearchAliasInput) siteSearchAliasInput.value = '';
    setSiteSearchError('');
    setLegacySiteSearchDraftCategory('site');
    setEditingState(null);
    setSiteSearchFormExpanded(false);
  }

  return {
    normalizeSiteSearchTemplate,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    normalizeSiteSearchProvider,
    findSiteSearchKeyConflict,
    setSiteSearchError,
    setLegacySiteSearchDraftCategory,
    setSiteSearchFormExpanded,
    setEditingState,
    insertSiteSearchQueryToken,
    attachSaveButtonAnimation,
    suspendSiteSearchRefresh,
    resetSiteSearchForm
  };
}

export { createSiteSearchForm };
