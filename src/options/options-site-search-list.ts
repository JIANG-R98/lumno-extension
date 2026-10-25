// The site search lists: built-in, custom and AI providers with their
// icons and copy, saving provider state and disabled keys, and refreshing
// the lists when providers change.
import * as SHORTCUT_FAVICON from '../domain/favicon/shortcut-favicon';
import type { AggregateSearch } from '../domain/search/aggregate-search-store';
import type * as SearchUtils from '../domain/search/search-utils';
import { readSiteSearchProviders } from '../domain/search/site-search-provider-reader';
import type { SiteSearchProvider } from '../domain/search/types';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import type { BatchedStorageArea, StorageAreaFacade } from '../platform/settings-storage';
import * as LumnoMessaging from '../platform/messaging';
import type { ScrollToTargetOptions } from './options-navigation';
import type { createSearchSourceOrderController } from './options-search-source-order';
import type * as SiteSearch from './options-site-search';
import type { EnqueueOperation, PreparedSiteSearchProviders, SiteSearchProviderSnapshot } from './options-site-search';
import type { GetMessage } from './options-types';
import type { ReorderCopyModel } from './react/reorder-buttons';
import type {
  SiteSearchListController,
  SiteSearchListCopyModel,
  SiteSearchProviderDraft,
  SiteSearchProviderItemModel,
  SiteSearchSaveResult
} from './react/site-search-list';

// A provider as a list shows it: built-in or custom.
type ListedSiteSearchProvider = SiteSearchProvider & { _xIsCustom: boolean };

type SiteSearchListControllerRef = Pick<SiteSearchListController, 'render'> | null;

interface SiteSearchListState {
  searchSourceOrderController: Pick<ReturnType<typeof createSearchSourceOrderController>, 'sortList'>;
  siteSearchModel: Pick<ReturnType<typeof SiteSearch.createSiteSearchModel>,
    'editSiteSearchProvider' | 'prepareSiteSearchProviderSnapshot'>;
  defaultSiteSearchProviders: SiteSearchProvider[];
  customSiteSearchProviders: SiteSearchProvider[];
  // Shown until the bundled list loads, and when it cannot.
  fallbackSiteSearchProviders: SiteSearchProvider[];
  disabledSiteSearchKeys: Set<string>;
  siteSearchProvidersLoaded: boolean;
  customSiteSearchProviderIdsReady: boolean;
  helpCenterSearchEnabled: boolean;
  siteSearchEngineBuiltinListController: SiteSearchListControllerRef;
  siteSearchCustomListController: SiteSearchListControllerRef;
  siteSearchBuiltinListController: SiteSearchListControllerRef;
  siteSearchAiBuiltinListController: SiteSearchListControllerRef;
  // A linked setting to scroll to once the lists have rendered.
  pendingOptionsScrollTarget: string;
  storageArea: BatchedStorageArea | null;
  rawStorageArea: StorageAreaFacade | null;
  enqueueSiteSearchProviderStorageOperation: EnqueueOperation;
}

interface SiteSearchListDeps {
  SEARCH_UTILS: Pick<typeof SearchUtils, 'getSiteSearchProviderDisplayNameMessage' | 'isHelpCenterSiteSearchProvider'>;
  getMessage: GetMessage;
  normalizeSiteSearchTemplate(template: unknown): string;
  isSearchEngineSiteSearchProvider(item: Partial<SiteSearchProvider> | null | undefined): boolean;
  isAiSiteSearchProvider(item: Partial<SiteSearchProvider> | null | undefined): boolean;
  // The keys each list shows right now, in order, for the move buttons.
  renderedSearchSourceKeys: Record<string, string[]>;
  suspendSiteSearchRefresh(durationMs: number): void;
  createPersistentId(prefix: string): string;
  findSiteSearchKeyConflict(key: string, allowedKey?: string): SiteSearchProvider | AggregateSearch | null;
  getSiteSearchErrorMessage(errorKey: string): string;
  applySavedSiteSearchProviders(custom: SiteSearchProvider[], disabledKeys: Set<string>): void;
  renderAggregateSearchList(): void;
  showToast(message: string, isError?: boolean): void;
  getActiveBuiltinSiteSearchProviders: typeof SiteSearch.getActiveBuiltinSiteSearchProviders;
  renderFeedbackSupport(): void;
  siteSearchEngineBuiltinList: HTMLElement | null;
  siteSearchCustomList: HTMLElement | null;
  siteSearchBuiltinList: HTMLElement | null;
  siteSearchAiBuiltinList: HTMLElement | null;
  syncClearButtonAvailability(button: HTMLElement | null, hasItems: boolean): void;
  customClearButton: HTMLElement | null;
  initTooltips(): void;
  scrollToOptionsTarget(targetKey: string, options?: ScrollToTargetOptions): boolean;
  normalizeSiteSearchProvider(
    item: Partial<SiteSearchProvider> | null | undefined,
    baseItem?: Partial<SiteSearchProvider> | null
  ): SiteSearchProvider | null;
  SITE_SEARCH_STORAGE_KEY: string;
  getSiteSearchBuiltinKey: typeof SiteSearch.getSiteSearchBuiltinKey;
  SITE_SEARCH_DISABLED_STORAGE_KEY: string;
  SITE_SEARCH: Pick<typeof SiteSearch, 'createSiteSearchProviderRefreshCoordinator' | 'createSnapshotPersister'>;
  optionsState: SiteSearchListState;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function createSiteSearchList(deps: SiteSearchListDeps) {
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
    SITE_SEARCH_STORAGE_KEY,
    getSiteSearchBuiltinKey,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    SITE_SEARCH
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  const DEBUG_DUPLICATE_CUSTOM_KEY = 'dup';
  let siteSearchProviderRefreshCoordinator: ReturnType<typeof SiteSearch.createSiteSearchProviderRefreshCoordinator<
    SiteSearchProviderSnapshot,
    PreparedSiteSearchProviders
  >> | null = null;

  function getLocalizedBuiltinProviderName(item: SiteSearchProvider | null): string {
    if (!item || item._xIsCustom) {
      return item ? (item.name || item.key) : '';
    }
    const mapping = SEARCH_UTILS.getSiteSearchProviderDisplayNameMessage(item);
    if (!mapping) {
      return item.name || item.key;
    }
    return getMessage(mapping.messageKey, mapping.fallback);
  }

  function getSiteSearchItemIconUrl(item: SiteSearchProvider | null): string {
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
      return item.icon.trim();
    }
    if (item.iconUrl) {
      return item.iconUrl.trim();
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

  function getSiteSearchListCopy(): SiteSearchListCopyModel {
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

  function getSiteSearchProviderItemModel(
    item: ListedSiteSearchProvider,
    builtinTemplateSet: ReadonlySet<string>
  ): SiteSearchProviderItemModel {
    const normalizedTemplate = normalizeSiteSearchTemplate(String(item.template || '').trim());
    const isCustom = item._xIsCustom;
    const isSearchEngine = isSearchEngineSiteSearchProvider(item);
    const duplicate = isCustom && Boolean(normalizedTemplate) && builtinTemplateSet.has(normalizedTemplate);
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

  function getSearchSourceReorderCopy(): ReorderCopyModel {
    return {
      moveDownLabel: getMessage('settings_search_source_move_down', '下移'),
      moveUpLabel: getMessage('settings_search_source_move_up', '上移')
    };
  }

  function renderSiteSearchListController(
    controller: SiteSearchListControllerRef,
    items: ListedSiteSearchProvider[],
    placeholder: string,
    builtinTemplateSet: ReadonlySet<string>,
    listId: string
  ): boolean {
    if (!controller) {
      return false;
    }
    const ordered = optionsState.searchSourceOrderController.sortList(items, listId, (item) => item.key);
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

  function locateBuiltinSiteSearchProvider(normalizedTemplate: string): void {
    const targetRow = Array.from(document.querySelectorAll(
      '[data-type="builtin"][data-template]'
    )).find((row) => row.getAttribute('data-template') === normalizedTemplate);
    if (!targetRow) {
      return;
    }
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetRow.removeAttribute('data-flash');
    // Reading the layout restarts the animation when the attribute returns.
    void targetRow.getBoundingClientRect();
    targetRow.setAttribute('data-flash', 'true');
    const onFlashEnd = () => {
      targetRow.removeAttribute('data-flash');
      targetRow.removeEventListener('animationend', onFlashEnd);
    };
    targetRow.addEventListener('animationend', onFlashEnd);
  }

  function handleSiteSearchProviderSave(
    key: string,
    isBuiltin: boolean,
    draft: SiteSearchProviderDraft
  ): Promise<SiteSearchSaveResult> {
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
      : null;
    if (!result) {
      return Promise.resolve({ ok: false, error: getSiteSearchErrorMessage('toast_error') });
    }
    if (result.ok === false) {
      return Promise.resolve({ ok: false, error: getSiteSearchErrorMessage(result.error) });
    }
    const { custom, disabledKeys } = result;
    return saveSiteSearchProviderState(custom, disabledKeys).then(() => {
      applySavedSiteSearchProviders(custom, disabledKeys);
      renderAggregateSearchList();
      return { ok: true };
    }).catch(() => {
      const error = getMessage('toast_error', '操作失败，请重试。');
      showToast(error, true);
      return { ok: false, error };
    });
  }

  function syncHelpCenterSearchEnabled(): void {
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

  function renderSiteSearchList(): void {
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
      return Boolean(key) && !customKeys.has(key) && !optionsState.disabledSiteSearchKeys.has(key);
    });
    const displayEngineDefaults = displayDefaults.filter((item) => isSearchEngineSiteSearchProvider(item));
    const displayAiDefaults = displayDefaults.filter((item) => isAiSiteSearchProvider(item));
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
    const customItems: ListedSiteSearchProvider[] = optionsState.customSiteSearchProviders.map((item) => ({
      ...item,
      _xIsCustom: true
    }));
    const engineItems: ListedSiteSearchProvider[] = displayEngineDefaults.map((item) => ({
      ...item,
      _xIsCustom: false
    }));
    const searchItems: ListedSiteSearchProvider[] = displaySearchDefaults.map((item) => ({
      ...item,
      _xIsCustom: false
    }));
    const aiItems: ListedSiteSearchProvider[] = displayAiDefaults.map((item) => ({
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

  // The bundled providers, or the fallbacks when the list is empty.
  function normalizeDefaultProviders(items: SiteSearchProvider[]): SiteSearchProvider[] {
    const source = items.length > 0 ? items : optionsState.fallbackSiteSearchProviders;
    return source.map((item) => normalizeSiteSearchProvider(item)).filter(isPresent);
  }

  function loadDefaultSiteSearchProviders(): Promise<SiteSearchProvider[]> {
    const localUrl = chrome.runtime.getURL('assets/data/site-search.json');
    return fetch(localUrl)
      .then((resp) => resp.json())
      .then((data: unknown) => normalizeDefaultProviders(
        readSiteSearchProviders(data && typeof data === 'object' && 'items' in data ? data.items : null)
      ))
      .catch(() => new Promise<SiteSearchProvider[]>((resolve) => {
        LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'getSiteSearchProviders' }, (response) => {
          resolve(normalizeDefaultProviders(response ? readSiteSearchProviders(response.items) : []));
        });
      }));
  }

  function loadCustomSiteSearchProviders(baseItems: readonly SiteSearchProvider[]): Promise<SiteSearchProvider[]> {
    return LumnoSettingsStorage.readStorageValue(
      optionsState.storageArea,
      chrome,
      SITE_SEARCH_STORAGE_KEY
    ).then((value) => {
      const baseMap = new Map(baseItems.map((item) => [item.key.toLowerCase(), item]));
      return readSiteSearchProviders(value).map((item) => {
        const builtinKey = getSiteSearchBuiltinKey(item);
        return normalizeSiteSearchProvider(item, baseMap.get(builtinKey || item.key.toLowerCase()));
      }).filter(isPresent);
    });
  }

  function loadDisabledSiteSearchKeys(): Promise<string[]> {
    return LumnoSettingsStorage.readStorageValue(
      optionsState.storageArea,
      chrome,
      SITE_SEARCH_DISABLED_STORAGE_KEY
    ).then((value) => {
      const items: unknown[] = Array.isArray(value) ? value : [];
      return items.map((item) => String(item).toLowerCase()).filter(Boolean);
    });
  }

  function writeDisabledSiteSearchKeys(keys: Iterable<string>): Promise<string[]> {
    const payload = Array.from(keys)
      .map((item) => item.toLowerCase())
      .filter(Boolean);
    return LumnoSettingsStorage.writeStorageValue(
      optionsState.rawStorageArea,
      chrome,
      SITE_SEARCH_DISABLED_STORAGE_KEY,
      payload
    );
  }

  function writeSiteSearchProviderState(items: readonly SiteSearchProvider[], keys: Iterable<string>): Promise<unknown> {
    const providersPayload = items
      .map((item) => normalizeSiteSearchProvider(item))
      .filter(isPresent);
    const disabledPayload = Array.from(keys)
      .map((item) => item.toLowerCase())
      .filter(Boolean);
    const payload = {
      [SITE_SEARCH_STORAGE_KEY]: providersPayload,
      [SITE_SEARCH_DISABLED_STORAGE_KEY]: disabledPayload
    };
    return LumnoSettingsStorage.writeStorageValues(optionsState.rawStorageArea, chrome, payload);
  }

  function saveDisabledSiteSearchKeys(keys: Iterable<string>): Promise<string[]> {
    return optionsState.enqueueSiteSearchProviderStorageOperation(
      () => writeDisabledSiteSearchKeys(keys)
    );
  }

  function saveSiteSearchProviderState(items: readonly SiteSearchProvider[], keys: Iterable<string>): Promise<unknown> {
    return optionsState.enqueueSiteSearchProviderStorageOperation(
      () => writeSiteSearchProviderState(items, keys)
    );
  }

  function prepareSiteSearchProviderSnapshot(snapshot: SiteSearchProviderSnapshot): PreparedSiteSearchProviders {
    return optionsState.siteSearchModel.prepareSiteSearchProviderSnapshot(snapshot, {
      debugDuplicateKey: DEBUG_DUPLICATE_CUSTOM_KEY
    });
  }

  async function loadSiteSearchProviderSnapshot(): Promise<SiteSearchProviderSnapshot> {
    const defaults = await loadDefaultSiteSearchProviders();
    const [custom, disabled] = await Promise.all([
      loadCustomSiteSearchProviders(defaults),
      loadDisabledSiteSearchKeys()
    ]);
    return { custom, defaults, disabled };
  }

  function getSiteSearchProviderRefreshCoordinator() {
    if (!siteSearchProviderRefreshCoordinator) {
      siteSearchProviderRefreshCoordinator = SITE_SEARCH.createSiteSearchProviderRefreshCoordinator<
        SiteSearchProviderSnapshot,
        PreparedSiteSearchProviders
      >({
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

  function invalidateSiteSearchProviderRefresh(): void {
    if (siteSearchProviderRefreshCoordinator) {
      siteSearchProviderRefreshCoordinator.invalidate();
    }
  }

  function refreshSiteSearchProviders(): Promise<unknown> {
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
    refreshSiteSearchProviders
  };
}

export { createSiteSearchList };
export type { ListedSiteSearchProvider, SiteSearchListDeps, SiteSearchListState };
