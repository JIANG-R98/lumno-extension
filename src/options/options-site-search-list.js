// The site search lists: built-in, custom and AI providers with their
// icons and copy, saving provider state and disabled keys, and refreshing
// the lists when providers change.
import * as SHORTCUT_FAVICON from '../shared/favicon/shortcut-favicon.js';

function createSiteSearchList(deps) {
  const {
    SEARCH_UTILS,
    getMessage,
    normalizeSiteSearchTemplate,
    isSearchEngineSiteSearchProvider,
    isAiSiteSearchProvider,
    renderedSearchSourceKeys,
    suspendSiteSearchRefresh,
    createPersistentId,
    findSiteSearchKeyConflict,
    getSiteSearchErrorMessage,
    applySavedSiteSearchProviders,
    renderAggregateSearchList,
    showToast,
    getActiveBuiltinSiteSearchProviders,
    renderFeedbackSupport,
    siteSearchEngineBuiltinList,
    siteSearchCustomList,
    siteSearchBuiltinList,
    syncClearButtonAvailability,
    customClearButton,
    siteSearchAiBuiltinList,
    initTooltips,
    scrollToOptionsTarget,
    normalizeSiteSearchProvider,
    SETTINGS,
    SITE_SEARCH_STORAGE_KEY,
    getSiteSearchBuiltinKey,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    SITE_SEARCH
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  const DEBUG_DUPLICATE_CUSTOM_KEY = 'dup';
  let siteSearchProviderRefreshCoordinator = null;

  function getLocalizedBuiltinProviderName(item) {
    if (!item || item._xIsCustom) {
      return item && (item.name || item.key) ? (item.name || item.key) : '';
    }
    const mapping = SEARCH_UTILS.getSiteSearchProviderDisplayNameMessage(item);
    if (!mapping) {
      return item.name || item.key;
    }
    return getMessage(mapping.messageKey, mapping.fallback);
  }

  function getSiteSearchItemIconUrl(item) {
    if (!item) {
      return '';
    }
    const localIconAsset = !item._xIsCustom
      ? SHORTCUT_FAVICON.getSiteSearchPinnedIconAssetPath(item)
      : '';
    if (localIconAsset) {
      return chrome.runtime.getURL(localIconAsset);
    }
    if (item.icon) {
      return String(item.icon || '').trim();
    }
    if (item.iconUrl) {
      return String(item.iconUrl || '').trim();
    }
    try {
      const template = normalizeSiteSearchTemplate(String(item.template || '').trim());
      const url = template.replace(/\{query\}/g, 'test');
      const hostname = new URL(url).hostname;
      return hostname
        ? `https://t2.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE%2CSIZE%2CURL&url=${encodeURIComponent(`https://${hostname}/`)}&size=64`
        : '';
    } catch (error) {
      return '';
    }
  }

  function getSiteSearchListCopy() {
    return {
      aliasLabel: getMessage('shortcuts_label_alias', '别名'),
      aliasPlaceholder: getMessage('shortcuts_placeholder_alias', '选填，例如 小破站、油管等'),
      cancelLabel: getMessage('shortcuts_cancel', '取消'),
      categoryLabel: getMessage('shortcuts_label_display_group', '显示位置'),
      confirmLabel: getMessage('confirm_ok', '确认'),
      confirmMessage: getMessage('confirm_remove_item', '确认移除该项？'),
      confirmMessageKey: 'confirm_remove_item',
      editLabel: getMessage('shortcuts_edit', '编辑'),
      keyLabel: getMessage('shortcuts_label_key', '触发词'),
      keyPlaceholder: getMessage(
        'shortcuts_placeholder_required',
        '必填，如有多个用英文逗号分隔，如 jd,bili'
      ),
      nameLabel: getMessage('shortcuts_label_name', '显示名称'),
      namePlaceholder: getMessage(
        'shortcuts_placeholder_optional_default',
        '选填，默认使用触发词'
      ),
      removeLabel: getMessage('shortcuts_remove', '移除'),
      saveLabel: getMessage('shortcuts_save', '保存修改'),
      searchEngineCategoryLabel: getMessage(
        'search_scope_group_engines',
        '搜索引擎'
      ),
      siteCategoryLabel: getMessage('search_scope_group_sites', '站内搜索'),
      templateHelp: getMessage(
        'shortcuts_template_help',
        '1.打开你想添加的网站\n2.输入任一搜索词，触发搜索\n3.将搜索结果页面 url 粘贴在此处\n4.将关键词替换为{query}'
      ),
      templateLabel: getMessage('shortcuts_label_template', '搜索模板')
    };
  }

  function getSiteSearchProviderItemModel(item, builtinTemplateSet) {
    const normalizedTemplate = normalizeSiteSearchTemplate(
      String(item && item.template ? item.template : '').trim()
    );
    const isCustom = Boolean(item && item._xIsCustom);
    const isSearchEngine = isSearchEngineSiteSearchProvider(item);
    const duplicate = isCustom && normalizedTemplate && builtinTemplateSet.has(normalizedTemplate);
    return {
      aliasesText: Array.isArray(item.aliases) ? item.aliases.join(',') : '',
      badgeText: isCustom
        ? getMessage('shortcuts_badge_custom', '自定义')
        : isSearchEngine
          ? getMessage('search_scope_group_engines', '搜索引擎')
          : isAiSiteSearchProvider(item)
            ? getMessage('shortcuts_badge_ai', 'AI 搜索')
            : getMessage('shortcuts_badge_builtin', '内置'),
      category: isSearchEngine ? 'searchEngine' : 'site',
      duplicateLabel: duplicate
        ? getMessage('shortcuts_duplicate_tag', '与内置重复')
        : '',
      duplicateTemplate: duplicate ? normalizedTemplate : '',
      duplicateTooltip: duplicate
        ? getMessage('shortcuts_duplicate_action', '定位内置项')
        : '',
      iconUrl: getSiteSearchItemIconUrl(item),
      id: `${isCustom ? 'custom' : 'builtin'}:${String(item.key || '')}`,
      isBuiltin: !isCustom,
      key: String(item.key || ''),
      meta: `${item.key || ''} · ${item.template || ''}`,
      name: getLocalizedBuiltinProviderName(item),
      normalizedTemplate,
      secondaryBadgeText: isCustom
        ? (isSearchEngine
            ? getMessage('search_scope_group_engines', '搜索引擎')
            : getMessage('search_scope_group_sites', '站内搜索'))
        : isSearchEngine
          ? getMessage('shortcuts_badge_builtin', '内置')
          : '',
      template: String(item.template || ''),
      templateEditable: isCustom
    };
  }

  function getSearchSourceReorderCopy() {
    return {
      moveDownLabel: getMessage('settings_search_source_move_down', '下移'),
      moveUpLabel: getMessage('settings_search_source_move_up', '上移')
    };
  }

  function renderSiteSearchListController(
    controller,
    items,
    placeholder,
    builtinTemplateSet,
    listId
  ) {
    if (!controller || typeof controller.render !== 'function') {
      return false;
    }
    const ordered = optionsState.searchSourceOrderController.sortList(
      Array.isArray(items) ? items : [],
      listId,
      (item) => item && item.key
    );
    renderedSearchSourceKeys[listId] = ordered.map((item) => String(item.key || '').toLowerCase());
    controller.render({
      copy: getSiteSearchListCopy(),
      items: ordered.map(
        (item) => getSiteSearchProviderItemModel(item, builtinTemplateSet)
      ),
      placeholder: placeholder || '',
      reorder: getSearchSourceReorderCopy()
    });
    return true;
  }

  function locateBuiltinSiteSearchProvider(normalizedTemplate) {
    const targetRow = Array.from(document.querySelectorAll(
      '[data-type="builtin"][data-template]'
    )).find((row) => row.getAttribute('data-template') === normalizedTemplate);
    if (!targetRow) {
      return;
    }
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetRow.removeAttribute('data-flash');
    void targetRow.offsetWidth;
    targetRow.setAttribute('data-flash', 'true');
    const onFlashEnd = () => {
      targetRow.removeAttribute('data-flash');
      targetRow.removeEventListener('animationend', onFlashEnd);
    };
    targetRow.addEventListener('animationend', onFlashEnd);
  }

  function handleSiteSearchProviderSave(key, isBuiltin, draft) {
    suspendSiteSearchRefresh(260);
    const item = (isBuiltin ? optionsState.defaultSiteSearchProviders : optionsState.customSiteSearchProviders)
      .find((entry) => String(entry.key || '') === key);
    const result = item
      ? optionsState.siteSearchModel.editSiteSearchProvider(item, isBuiltin, draft, {
        createId: () => createPersistentId('source'),
        custom: optionsState.customSiteSearchProviders,
        defaults: optionsState.defaultSiteSearchProviders,
        disabledKeys: optionsState.disabledSiteSearchKeys,
        hasKeyConflict: (value, allowedKey) => Boolean(findSiteSearchKeyConflict(value, allowedKey))
      })
      : { ok: false, error: 'toast_error' };
    if (!result.ok) {
      return Promise.resolve({ ok: false, error: getSiteSearchErrorMessage(result.error) });
    }
    return saveSiteSearchProviderState(result.custom, result.disabledKeys).then(() => {
      applySavedSiteSearchProviders(result.custom, result.disabledKeys);
      renderAggregateSearchList();
      return { ok: true };
    }).catch(() => {
      const error = getMessage('toast_error', '操作失败，请重试。');
      showToast(error, true);
      return { ok: false, error };
    });
  }

  function syncHelpCenterSearchEnabled() {
    if (!optionsState.siteSearchProvidersLoaded) {
      return;
    }
    const enabled = [
      ...getActiveBuiltinSiteSearchProviders(
        optionsState.defaultSiteSearchProviders,
        optionsState.customSiteSearchProviders,
        optionsState.disabledSiteSearchKeys
      ),
      ...optionsState.customSiteSearchProviders
    ].some((item) => SEARCH_UTILS.isHelpCenterSiteSearchProvider(item));
    if (enabled !== optionsState.helpCenterSearchEnabled) {
      optionsState.helpCenterSearchEnabled = enabled;
      renderFeedbackSupport();
    }
  }

  function renderSiteSearchList() {
    syncHelpCenterSearchEnabled();
    if (!siteSearchEngineBuiltinList || !siteSearchCustomList || !siteSearchBuiltinList) {
      return;
    }
    const customKeys = new Set(
      optionsState.customSiteSearchProviders.map((item) =>
        String(item.key || '').toLowerCase()
      )
    );
    const displayDefaults = optionsState.defaultSiteSearchProviders.filter((item) => {
      const key = String(item.key || '').toLowerCase();
      return key && !customKeys.has(key) && !optionsState.disabledSiteSearchKeys.has(key);
    });
    const displayEngineDefaults = displayDefaults.filter(isSearchEngineSiteSearchProvider);
    const displayAiDefaults = displayDefaults.filter(isAiSiteSearchProvider);
    const displaySearchDefaults = displayDefaults.filter(
      (item) => (
        !isSearchEngineSiteSearchProvider(item) && !isAiSiteSearchProvider(item)
      )
    );
    const builtinTemplateSet = new Set(
      getActiveBuiltinSiteSearchProviders(
        optionsState.defaultSiteSearchProviders,
        optionsState.customSiteSearchProviders,
        optionsState.disabledSiteSearchKeys
      )
        .map((item) =>
          normalizeSiteSearchTemplate(String(item.template || '').trim())
        )
        .filter(Boolean)
    );
    const customItems = optionsState.customSiteSearchProviders.map((item) => ({
      ...item,
      _xIsCustom: true
    }));
    const engineItems = displayEngineDefaults.map((item) => ({
      ...item,
      _xIsCustom: false
    }));
    const searchItems = displaySearchDefaults.map((item) => ({
      ...item,
      _xIsCustom: false
    }));
    const aiItems = displayAiDefaults.map((item) => ({
      ...item,
      _xIsCustom: false
    }));

    renderSiteSearchListController(
      optionsState.siteSearchEngineBuiltinListController,
      engineItems,
      getMessage('shortcuts_empty_engines', '暂无内置搜索引擎'),
      builtinTemplateSet,
      'engine'
    );
    syncClearButtonAvailability(customClearButton, customItems.length > 0);
    renderSiteSearchListController(
      optionsState.siteSearchCustomListController,
      customItems,
      '',
      builtinTemplateSet,
      'custom'
    );
    renderSiteSearchListController(
      optionsState.siteSearchBuiltinListController,
      searchItems,
      getMessage('shortcuts_empty_builtin', '暂无内置站内搜索'),
      builtinTemplateSet,
      'site'
    );
    if (siteSearchAiBuiltinList) {
      renderSiteSearchListController(
        optionsState.siteSearchAiBuiltinListController,
        aiItems,
        getMessage('shortcuts_empty_ai', '暂无内置 AI 搜索'),
        builtinTemplateSet,
        'ai'
      );
    }
    initTooltips();
    if (
      optionsState.pendingOptionsScrollTarget &&
      scrollToOptionsTarget(optionsState.pendingOptionsScrollTarget, { behavior: 'auto' })
    ) {
      optionsState.pendingOptionsScrollTarget = '';
    }
  }

  function loadDefaultSiteSearchProviders() {
    const localUrl = chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL('assets/data/site-search.json')
      : '../../assets/data/site-search.json';
    return fetch(localUrl)
      .then((resp) => resp.json())
      .then((data) => {
        const items = data && Array.isArray(data.items) ? data.items : [];
        const source = items.length > 0 ? items : optionsState.fallbackSiteSearchProviders;
        return source.map((item) => normalizeSiteSearchProvider(item)).filter(Boolean);
      })
      .catch(() => new Promise((resolve) => {
        if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
          resolve(optionsState.fallbackSiteSearchProviders.slice());
          return;
        }
        chrome.runtime.sendMessage({ action: 'getSiteSearchProviders' }, (response) => {
          const items = response && Array.isArray(response.items) ? response.items : [];
          const source = items.length > 0 ? items : optionsState.fallbackSiteSearchProviders;
          resolve(source.map((item) => normalizeSiteSearchProvider(item)).filter(Boolean));
        });
      }));
  }

  function loadCustomSiteSearchProviders(baseItems) {
    return SETTINGS.readStorageValue(
      optionsState.storageArea,
      chrome,
      SITE_SEARCH_STORAGE_KEY
    ).then((value) => {
      const items = Array.isArray(value) ? value : [];
      const baseMap = new Map((baseItems || []).map((item) => [
        String(item && item.key ? item.key : '').toLowerCase(),
        item
      ]));
      return items.map((item) => {
        const key = String(item && item.key ? item.key : '').toLowerCase();
        const builtinKey = getSiteSearchBuiltinKey(item);
        return normalizeSiteSearchProvider(item, baseMap.get(builtinKey || key));
      }).filter(Boolean);
    });
  }

  function loadDisabledSiteSearchKeys() {
    return SETTINGS.readStorageValue(
      optionsState.storageArea,
      chrome,
      SITE_SEARCH_DISABLED_STORAGE_KEY
    ).then((value) => {
      const items = Array.isArray(value) ? value : [];
      return items.map((item) => String(item).toLowerCase()).filter(Boolean);
    });
  }

  function writeDisabledSiteSearchKeys(keys) {
    const payload = Array.from(keys || [])
      .map((item) => String(item).toLowerCase())
      .filter(Boolean);
    return SETTINGS.writeStorageValue(
      optionsState.rawStorageArea,
      chrome,
      SITE_SEARCH_DISABLED_STORAGE_KEY,
      payload
    );
  }

  function writeSiteSearchProviderState(items, keys) {
    const providersPayload = (items || [])
      .map((item) => normalizeSiteSearchProvider(item))
      .filter(Boolean);
    const disabledPayload = Array.from(keys || [])
      .map((item) => String(item).toLowerCase())
      .filter(Boolean);
    const payload = {
      [SITE_SEARCH_STORAGE_KEY]: providersPayload,
      [SITE_SEARCH_DISABLED_STORAGE_KEY]: disabledPayload
    };
    return SETTINGS.writeStorageValues(optionsState.rawStorageArea, chrome, payload);
  }

  function saveDisabledSiteSearchKeys(keys) {
    return optionsState.enqueueSiteSearchProviderStorageOperation(
      () => writeDisabledSiteSearchKeys(keys)
    );
  }

  function saveSiteSearchProviderState(items, keys) {
    return optionsState.enqueueSiteSearchProviderStorageOperation(
      () => writeSiteSearchProviderState(items, keys)
    );
  }

  function prepareSiteSearchProviderSnapshot(snapshot) {
    return optionsState.siteSearchModel.prepareSiteSearchProviderSnapshot(snapshot, {
      debugDuplicateKey: DEBUG_DUPLICATE_CUSTOM_KEY
    });
  }

  async function loadSiteSearchProviderSnapshot() {
    const defaults = await loadDefaultSiteSearchProviders();
    const [custom, disabled] = await Promise.all([
      loadCustomSiteSearchProviders(defaults),
      loadDisabledSiteSearchKeys()
    ]);
    return { custom, defaults, disabled };
  }

  function getSiteSearchProviderRefreshCoordinator() {
    if (!siteSearchProviderRefreshCoordinator) {
      siteSearchProviderRefreshCoordinator = SITE_SEARCH.createSiteSearchProviderRefreshCoordinator({
        apply(prepared) {
          optionsState.defaultSiteSearchProviders = prepared.defaults;
          optionsState.customSiteSearchProviders = prepared.custom;
          optionsState.customSiteSearchProviderIdsReady = true;
          optionsState.disabledSiteSearchKeys = prepared.disabledKeys;
          optionsState.siteSearchProvidersLoaded = true;
          renderSiteSearchList();
          renderAggregateSearchList();
        },
        load: loadSiteSearchProviderSnapshot,
        onError(error) {
          optionsState.customSiteSearchProviderIdsReady = false;
          renderAggregateSearchList();
          console.warn('[Lumno] Could not load site search providers.', error);
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        },
        persist: SITE_SEARCH.createSnapshotPersister({
          enqueue: optionsState.enqueueSiteSearchProviderStorageOperation,
          load: loadSiteSearchProviderSnapshot,
          prepare: prepareSiteSearchProviderSnapshot,
          write: writeSiteSearchProviderState
        }),
        prepare: prepareSiteSearchProviderSnapshot
      });
    }
    return siteSearchProviderRefreshCoordinator;
  }

  function invalidateSiteSearchProviderRefresh() {
    if (siteSearchProviderRefreshCoordinator) {
      siteSearchProviderRefreshCoordinator.invalidate();
    }
  }

  function refreshSiteSearchProviders() {
    syncHelpCenterSearchEnabled();
    if (!siteSearchEngineBuiltinList || !siteSearchCustomList || !siteSearchBuiltinList) {
      return Promise.resolve();
    }
    if (optionsState.defaultSiteSearchProviders.length === 0) {
      optionsState.defaultSiteSearchProviders = optionsState.fallbackSiteSearchProviders.slice();
      renderSiteSearchList();
    }
    optionsState.customSiteSearchProviderIdsReady = false;
    renderAggregateSearchList();
    // A failed refresh was already reported through onError; one overtaken by
    // a newer refresh is dropped on purpose.
    return getSiteSearchProviderRefreshCoordinator().refresh().catch(() => {});
  }

  function handleSiteSearchListClick(event) {
      if (event.currentTarget &&
          event.currentTarget.getAttribute('data-react-island') === 'options-site-search-list') {
        return;
      }
      const target = event.target;
      if (!target) {
        return;
      }
      const editTarget = target.closest ? target.closest('button[data-edit-key]') : null;
      if (editTarget) {
        const key = String(editTarget.dataset.editKey || '');
        const isBuiltin = editTarget.dataset.editType === 'builtin';
        const match = isBuiltin
          ? optionsState.defaultSiteSearchProviders.find((item) => String(item.key || '') === key)
          : optionsState.customSiteSearchProviders.find((item) => String(item.key || '') === key);
        if (match) {
          const row = editTarget.closest('._x_extension_shortcut_item_2024_unique_');
          if (row) {
            row.setAttribute('data-expanded', row.getAttribute('data-expanded') === 'true' ? 'false' : 'true');
          }
          return;
        }
        return;
      }
      if (target.closest && target.closest('._x_extension_popconfirm_2024_unique_')) {
        return;
      }
    }

  return {
    getLocalizedBuiltinProviderName,
    getSiteSearchItemIconUrl,
    getSearchSourceReorderCopy,
    locateBuiltinSiteSearchProvider,
    handleSiteSearchProviderSave,
    renderSiteSearchList,
    loadDefaultSiteSearchProviders,
    loadCustomSiteSearchProviders,
    saveDisabledSiteSearchKeys,
    saveSiteSearchProviderState,
    invalidateSiteSearchProviderRefresh,
    refreshSiteSearchProviders,
    handleSiteSearchListClick
  };
}

export { createSiteSearchList };
