// The search and favicon blacklist lists: loading and saving them, their
// item models and copy, and removing or saving a rule.
function createBlacklistLists(deps) {
  const {
    SEARCH_BLACKLIST_STORAGE_KEY,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    getMessage,
    getBlacklistMatchBadgeConfig,
    initTooltips,
    showToast,
    notifyNewtabSectionsRefresh,
    buildBlacklistRuleDraft,
    upsertBlacklistItems,
    persistBlacklistItems,
    faviconBlacklistList,
    syncClearButtonAvailability,
    faviconBlacklistClearButton,
    faviconBlacklistListController,
    blacklistList,
    blacklistClearButton,
    searchBlacklistListController
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function loadSearchBlacklistItems() {
    return new Promise((resolve) => {
      if (!optionsState.storageArea) {
        resolve([]);
        return;
      }
      optionsState.storageArea.get([SEARCH_BLACKLIST_STORAGE_KEY], (result) => {
        resolve(optionsState.normalizeBlacklistItems(result && result[SEARCH_BLACKLIST_STORAGE_KEY]));
      });
    });
  }

  function saveSearchBlacklistItems(items) {
    return new Promise((resolve) => {
      if (!optionsState.storageArea) {
        resolve([]);
        return;
      }
      const normalized = optionsState.normalizeBlacklistItems(items);
      optionsState.storageArea.set({ [SEARCH_BLACKLIST_STORAGE_KEY]: normalized }, () => resolve(normalized));
    });
  }

  function loadFaviconRequestBlacklistItems() {
    return new Promise((resolve) => {
      if (!optionsState.storageArea) {
        resolve([]);
        return;
      }
      optionsState.storageArea.get([FAVICON_REQUEST_BLACKLIST_STORAGE_KEY], (result) => {
        resolve(optionsState.normalizeBlacklistItems(result && result[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY]));
      });
    });
  }

  function saveFaviconRequestBlacklistItems(items) {
    return new Promise((resolve) => {
      const normalized = optionsState.normalizeBlacklistItems(items);
      if (!optionsState.storageArea) {
        resolve(normalized);
        return;
      }
      optionsState.storageArea.set({ [FAVICON_REQUEST_BLACKLIST_STORAGE_KEY]: normalized }, () => resolve(normalized));
    });
  }

  function getBlacklistListCopy() {
    return {
      cancelLabel: getMessage('shortcuts_cancel', '取消'),
      confirmLabel: getMessage('confirm_ok', '确认'),
      confirmMessage: getMessage('confirm_remove_item', '确认移除该项？'),
      confirmMessageKey: 'confirm_remove_item',
      editLabel: getMessage('shortcuts_edit', '编辑'),
      matchLabel: getMessage('blacklist_match_label', '匹配方式'),
      modeOptions: [
        {
          mode: 'suffix',
          label: getMessage('blacklist_match_suffix', '整个网站'),
          tooltip: getMessage(
            'blacklist_match_suffix_tooltip',
            '屏蔽这个网站的所有页面，也包括它的子网站\n────────\n例如，填 baidu.com 后，baidu.com/search 和 tieba.baidu.com 都不会出现。'
          )
        },
        {
          mode: 'exact',
          label: getMessage('blacklist_match_exact', '当前页面'),
          tooltip: getMessage(
            'blacklist_match_exact_tooltip',
            '只屏蔽这一页\n────────\n例如，填 x.com/home 后，只有这一页不会出现，其他页面不受影响。'
          )
        },
        {
          mode: 'prefix',
          label: getMessage('blacklist_match_prefix', '当前站点路径'),
          tooltip: getMessage(
            'blacklist_match_prefix_tooltip',
            '只屏蔽这个站点下这一路径的页面\n────────\n例如，填 baidu.com/search 后，baidu.com/search 和 baidu.com/search/1 不会出现，但 baidu.com/news 不受影响。'
          )
        }
      ],
      placeholderDomain: getMessage('blacklist_placeholder_domain', 'baidu.com'),
      placeholderExact: getMessage('blacklist_placeholder_exact', 'example.com/path'),
      placeholderPrefix: getMessage(
        'blacklist_placeholder_prefix',
        'baidu.com or baidu.com/search'
      ),
      removeLabel: getMessage('shortcuts_remove', '移除'),
      saveLabel: getMessage('shortcuts_save', '保存修改'),
      urlLabel: getMessage('blacklist_label_url', 'URL rule')
    };
  }

  function getBlacklistListItemModel(item) {
    const badgeConfig = getBlacklistMatchBadgeConfig(item.matchModes);
    return {
      key: optionsState.buildBlacklistItemKey(item),
      badgeText: badgeConfig.text,
      badgeTone: badgeConfig.tone,
      displayPattern: optionsState.formatBlacklistPatternForDisplay(item),
      inputValue: optionsState.getBlacklistPatternInputValue(item),
      matchModes: optionsState.normalizeBlacklistMatchModes(item.matchModes)
    };
  }

  function renderBlacklistListWithReact(controller, items, editable) {
    if (!controller || typeof controller.render !== 'function') {
      return false;
    }
    controller.render({
      copy: getBlacklistListCopy(),
      editable: Boolean(editable),
      items: (Array.isArray(items) ? items : []).map(getBlacklistListItemModel)
    });
    initTooltips();
    return true;
  }

  function handleFaviconBlacklistRemove(itemKey) {
    const nextItems = optionsState.faviconRequestBlacklistItems.filter(
      (entry) => optionsState.buildBlacklistItemKey(entry) !== itemKey
    );
    return saveFaviconRequestBlacklistItems(nextItems).then((savedItems) => {
      optionsState.faviconRequestBlacklistItems = savedItems;
      renderFaviconRequestBlacklistList();
      showToast(getMessage('favicon_blacklist_removed_toast', '已移除排除规则'), false);
    }).catch(() => {
      showToast(getMessage('toast_error', '操作失败，请重试。'), true);
    });
  }

  function handleSearchBlacklistRemove(itemKey) {
    const nextItems = optionsState.searchBlacklistItems.filter(
      (entry) => optionsState.buildBlacklistItemKey(entry) !== itemKey
    );
    return saveSearchBlacklistItems(nextItems).then((savedItems) => {
      optionsState.searchBlacklistItems = savedItems;
      renderSearchBlacklistList();
      notifyNewtabSectionsRefresh('recent');
      showToast(getMessage('blacklist_removed_toast', '已从黑名单移除'), false);
    }).catch(() => {
      showToast(getMessage('toast_error', '操作失败，请重试。'), true);
    });
  }

  function handleSearchBlacklistSave(itemKey, inputValue, matchModes) {
    const draft = buildBlacklistRuleDraft(inputValue, matchModes);
    if (!draft.item) {
      return Promise.resolve({
        ok: false,
        error: draft.error || getMessage('toast_error', '操作失败，请重试。')
      });
    }
    const nextItems = upsertBlacklistItems(draft.item, itemKey);
    return persistBlacklistItems(
      nextItems,
      getMessage('toast_saved', '已保存')
    ).then(() => ({
      ok: true
    })).catch(() => {
      const error = getMessage('toast_error', '操作失败，请重试。');
      showToast(error, true);
      return {
        ok: false,
        error
      };
    });
  }

  function renderFaviconRequestBlacklistList() {
    if (!faviconBlacklistList) {
      return;
    }
    syncClearButtonAvailability(faviconBlacklistClearButton, optionsState.faviconRequestBlacklistItems.length > 0);
    renderBlacklistListWithReact(
      faviconBlacklistListController,
      optionsState.faviconRequestBlacklistItems,
      false
    );
  }

  function renderSearchBlacklistList() {
    if (!blacklistList) {
      return;
    }
    syncClearButtonAvailability(blacklistClearButton, optionsState.searchBlacklistItems.length > 0);
    renderBlacklistListWithReact(
      searchBlacklistListController,
      optionsState.searchBlacklistItems,
      true
    );
  }

  return {
    loadSearchBlacklistItems,
    saveSearchBlacklistItems,
    loadFaviconRequestBlacklistItems,
    saveFaviconRequestBlacklistItems,
    handleFaviconBlacklistRemove,
    handleSearchBlacklistRemove,
    handleSearchBlacklistSave,
    renderFaviconRequestBlacklistList,
    renderSearchBlacklistList
  };
}

export { createBlacklistLists };
