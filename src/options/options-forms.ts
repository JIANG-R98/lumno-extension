// The site search and blacklist forms: their render models, saving
// what they submit, error copy, and the blacklist rule drafts.
import type { BlacklistRule, MatchMode } from '../domain/blacklist-utils';
import type { AggregateSearch } from '../domain/search/aggregate-search-store';
import type { SiteSearchProvider } from '../domain/search/types';
import type { BlacklistRuleDraft, createBlacklistModel } from './options-blacklist';
import type { createSiteSearchModel } from './options-site-search';
import type { GetMessage } from './options-types';
import type { SiteSearchProviderDraft, SiteSearchSaveResult } from './react/site-search-list';
import type {
  BlacklistFormController,
  BlacklistFormModeCopyModel,
  BlacklistFormRenderModel,
  BlacklistFormSaveResult,
  SiteSearchFormController,
  SiteSearchFormRenderModel
} from './react/settings-forms';

type BlacklistModel = ReturnType<typeof createBlacklistModel>;

interface FormsState {
  // Made once the page has mounted its React views.
  siteSearchFormController: Pick<SiteSearchFormController, 'render'> | null;
  searchBlacklistFormController: Pick<BlacklistFormController, 'render' | 'reset'> | null;
  faviconBlacklistFormController: Pick<BlacklistFormController, 'render' | 'reset'> | null;
  siteSearchModel: Pick<ReturnType<typeof createSiteSearchModel>, 'addCustomSiteSearchProvider'>;
  blacklistModel: Pick<BlacklistModel, 'getMatchTone' | 'buildRuleDraft' | 'upsertItems'>;
  getBlacklistInputConfig: BlacklistModel['getInputConfig'];
  buildBlacklistItemKey: BlacklistModel['buildItemKey'];
  customSiteSearchProviders: SiteSearchProvider[];
  customSiteSearchProviderIdsReady: boolean;
  disabledSiteSearchKeys: Set<string>;
  searchBlacklistItems: BlacklistRule[];
  faviconRequestBlacklistItems: BlacklistRule[];
}

interface FormsDeps {
  getMessage: GetMessage;
  suspendSiteSearchRefresh(durationMs: number): void;
  createPersistentId(prefix: string): string;
  findSiteSearchKeyConflict(key: string, allowedKey?: string): SiteSearchProvider | AggregateSearch | null;
  saveSiteSearchProviderState(items: readonly SiteSearchProvider[], keys: Iterable<string>): Promise<unknown>;
  refreshSiteSearchProviders(): unknown;
  renderSiteSearchList(): void;
  showToast(message: string, isError?: boolean): void;
  saveFaviconRequestBlacklistItems(items: BlacklistRule[]): Promise<BlacklistRule[]>;
  renderFaviconRequestBlacklistList(): void;
  faviconBlacklistEditor: HTMLElement | null;
  saveSearchBlacklistItems(items: BlacklistRule[]): Promise<BlacklistRule[]>;
  renderSearchBlacklistList(): void;
  notifyNewtabSectionsRefresh(section: string): void;
  optionsState: FormsState;
}

interface BlacklistModeCopy {
  labelFallback: string;
  labelKey: string;
  mode: MatchMode;
  tooltipFallback: string;
  tooltipKey: string;
}

function createForms(deps: FormsDeps) {
  const {
    getMessage,
    suspendSiteSearchRefresh,
    createPersistentId,
    findSiteSearchKeyConflict,
    saveSiteSearchProviderState,
    refreshSiteSearchProviders,
    renderSiteSearchList,
    showToast,
    saveFaviconRequestBlacklistItems,
    renderFaviconRequestBlacklistList,
    faviconBlacklistEditor,
    saveSearchBlacklistItems,
    renderSearchBlacklistList,
    notifyNewtabSectionsRefresh
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function formatTemplate(text: string, params: Record<string, string | number>): string {
    return String(text || '').replace(/\{(\w+)\}/g, (match, key: string) => {
      if (params && Object.prototype.hasOwnProperty.call(params, key)) {
        return String(params[key]);
      }
      return match;
    });
  }

  function getSiteSearchFormRenderModel(): SiteSearchFormRenderModel {
    return {
      copy: {
        addLabel: getMessage('shortcuts_add', '添加自定义搜索'),
        aliasLabel: getMessage('shortcuts_label_alias', '别名'),
        aliasPlaceholder: getMessage(
          'shortcuts_placeholder_alias',
          '选填，例如 小破站、油管等'
        ),
        cancelLabel: getMessage('shortcuts_cancel', '取消'),
        categoryLabel: getMessage('shortcuts_label_display_group', '显示位置'),
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
        queryInsertLabel: getMessage('shortcuts_insert_query', '插入查询变量'),
        searchEngineCategoryLabel: getMessage(
          'search_scope_group_engines',
          '搜索引擎'
        ),
        siteCategoryLabel: getMessage('search_scope_group_sites', '站内搜索'),
        templateHelp: getMessage(
          'shortcuts_template_help',
          '1.打开你想添加的网站\n2.输入任一搜索词，触发搜索\n3.将搜索结果页面 url 粘贴在此处\n4.将关键词替换为{query}'
        ),
        templateLabel: getMessage('shortcuts_label_template', '搜索模板'),
        templatePlaceholder: getMessage(
          'shortcuts_placeholder_template',
          'https://example.com/search?q={query}'
        )
      }
    };
  }

  function getBlacklistFormRenderModel(addKey: string, addFallback: string): BlacklistFormRenderModel {
    const modeCopy: BlacklistModeCopy[] = [
      {
        labelFallback: '\u5f53\u524d\u9875\u9762',
        labelKey: 'blacklist_match_exact',
        mode: 'exact',
        tooltipFallback: '\u53ea\u5c4f\u853d\u8fd9\u4e00\u9875',
        tooltipKey: 'blacklist_match_exact_tooltip'
      },
      {
        labelFallback: '\u5f53\u524d\u7ad9\u70b9\u8def\u5f84',
        labelKey: 'blacklist_match_prefix',
        mode: 'prefix',
        tooltipFallback: '\u53ea\u5c4f\u853d\u8fd9\u4e2a\u7ad9\u70b9\u4e0b\u8fd9\u4e00\u8def\u5f84\u7684\u9875\u9762',
        tooltipKey: 'blacklist_match_prefix_tooltip'
      },
      {
        labelFallback: '\u6574\u4e2a\u7f51\u7ad9',
        labelKey: 'blacklist_match_suffix',
        mode: 'suffix',
        tooltipFallback: '\u5c4f\u853d\u8fd9\u4e2a\u7f51\u7ad9\u7684\u6240\u6709\u9875\u9762\uff0c\u4e5f\u5305\u62ec\u5b83\u7684\u5b50\u7f51\u7ad9',
        tooltipKey: 'blacklist_match_suffix_tooltip'
      }
    ];
    return {
      copy: {
        addLabel: getMessage(addKey, addFallback),
        cancelLabel: getMessage('shortcuts_cancel', '取消'),
        matchLabel: getMessage('blacklist_match_label', '匹配方式'),
        modes: modeCopy.map((item): BlacklistFormModeCopyModel => {
          const presentation = optionsState.getBlacklistInputConfig([item.mode]);
          return {
            label: getMessage(item.labelKey, item.labelFallback),
            labelKey: item.labelKey,
            mode: item.mode,
            placeholder: getMessage(
              presentation.placeholderKey,
              presentation.placeholderFallback
            ),
            prefix: presentation.prefixText,
            tooltip: getMessage(item.tooltipKey, item.tooltipFallback),
            tooltipKey: item.tooltipKey,
            urlLabel: getMessage(
              presentation.labelKey,
              presentation.labelFallback
            ),
            urlLabelKey: presentation.labelKey
          };
        })
      }
    };
  }

  function renderSettingsForms(): void {
    if (optionsState.siteSearchFormController) {
      optionsState.siteSearchFormController.render(getSiteSearchFormRenderModel());
    }
    if (optionsState.searchBlacklistFormController) {
      optionsState.searchBlacklistFormController.render(
        getBlacklistFormRenderModel('blacklist_add', '\u6dfb\u52a0')
      );
    }
    if (optionsState.faviconBlacklistFormController) {
      optionsState.faviconBlacklistFormController.render(
        getBlacklistFormRenderModel(
          'favicon_blacklist_add',
          '\u6dfb\u52a0\u6392\u9664\u89c4\u5219'
        )
      );
    }
  }

  async function handleReactSiteSearchFormSave(draft: SiteSearchProviderDraft): Promise<SiteSearchSaveResult> {
    suspendSiteSearchRefresh(260);
    const result = optionsState.siteSearchModel.addCustomSiteSearchProvider(draft, {
      createId: () => createPersistentId('source'),
      custom: optionsState.customSiteSearchProviders,
      disabledKeys: optionsState.disabledSiteSearchKeys,
      hasKeyConflict: (key, allowedKey) => Boolean(findSiteSearchKeyConflict(key, allowedKey))
    });
    if (result.ok === false) {
      return { ok: false, error: getSiteSearchErrorMessage(result.error) };
    }
    try {
      await saveSiteSearchProviderState(result.custom, result.disabledKeys);
      applySavedSiteSearchProviders(result.custom, result.disabledKeys);
      refreshSiteSearchProviders();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getMessage('toast_error', '操作失败，请重试。') };
    }
  }

  function getSiteSearchErrorMessage(errorKey: string): string {
    switch (errorKey) {
      case 'shortcuts_error_key':
        return getMessage('shortcuts_error_key', '请填写触发词。');
      case 'shortcuts_error_key_space':
        return getMessage('shortcuts_error_key_space', '触发词不能包含空格。');
      case 'shortcuts_error_key_duplicate':
        return getMessage('shortcuts_error_key_duplicate', '该触发词已存在，请更换。');
      case 'toast_error_template':
        return getMessage('toast_error_template', '搜索模板必须包含 {query}。');
      default:
        return getMessage('toast_error', '操作失败，请重试。');
    }
  }

  function applySavedSiteSearchProviders(custom: SiteSearchProvider[], disabledKeys: Set<string>): void {
    optionsState.customSiteSearchProviders = custom;
    optionsState.customSiteSearchProviderIdsReady = true;
    optionsState.disabledSiteSearchKeys = disabledKeys;
    renderSiteSearchList();
    showToast(getMessage('toast_saved', '已保存'), false);
  }

  async function handleReactSearchBlacklistFormSave(value: string, modes: MatchMode[]): Promise<BlacklistFormSaveResult> {
    const draft = buildBlacklistRuleDraft(value, modes);
    if (!draft.item) {
      return { ok: false, error: draft.error || '' };
    }
    try {
      await persistBlacklistItems(
        upsertBlacklistItems(draft.item, ''),
        getMessage('toast_saved', '已保存')
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getMessage('toast_error', '操作失败，请重试。') };
    }
  }

  async function handleReactFaviconBlacklistFormSave(value: string, modes: MatchMode[]): Promise<BlacklistFormSaveResult> {
    const draft = buildBlacklistRuleDraft(value, modes);
    if (!draft.item) {
      return { ok: false, error: draft.error || '' };
    }
    const nextKey = optionsState.buildBlacklistItemKey(draft.item);
    const nextItems = [
      draft.item,
      ...optionsState.faviconRequestBlacklistItems.filter(
        (item) => optionsState.buildBlacklistItemKey(item) !== nextKey
      )
    ];
    try {
      optionsState.faviconRequestBlacklistItems = await saveFaviconRequestBlacklistItems(nextItems);
      renderFaviconRequestBlacklistList();
      showToast(getMessage('toast_saved', '已保存'), false);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getMessage('toast_error', '操作失败，请重试。') };
    }
  }

  function resetBlacklistForm(): void {
    optionsState.searchBlacklistFormController?.reset();
  }

  function resetFaviconBlacklistForm(): void {
    optionsState.faviconBlacklistFormController?.reset();
  }

  function setFaviconBlacklistEditorEnabled(enabled: boolean): void {
    const editable = enabled;
    if (!faviconBlacklistEditor) {
      return;
    }
    faviconBlacklistEditor.setAttribute('aria-disabled', editable ? 'false' : 'true');
    faviconBlacklistEditor.inert = !editable;
    if (editable) {
      faviconBlacklistEditor.removeAttribute('inert');
    } else {
      faviconBlacklistEditor.setAttribute('inert', '');
      resetFaviconBlacklistForm();
    }
  }

  function getBlacklistMatchBadgeConfig(modes: unknown): { tone: MatchMode; text: string } {
    const tone = optionsState.blacklistModel.getMatchTone(modes);
    if (tone === 'exact') {
      return { tone, text: getMessage('blacklist_match_exact', '当前页面') };
    }
    if (tone === 'suffix') {
      return { tone, text: getMessage('blacklist_match_suffix', '整个网站') };
    }
    return { tone, text: getMessage('blacklist_match_prefix', '当前站点路径') };
  }

  function buildBlacklistRuleDraft(inputValue: string, matchModes: MatchMode[]): BlacklistRuleDraft {
    const draft = optionsState.blacklistModel.buildRuleDraft(inputValue, matchModes);
    if (draft.item) {
      return draft;
    }
    if (draft.error === 'blacklist_error_match_mode') {
      return { error: getMessage('blacklist_error_match_mode', '请选择至少一种匹配方式') };
    }
    return {
      error: draft.error === 'blacklist_error_domain'
        ? getMessage('blacklist_error_domain', '请输入网站域名。')
        : getMessage('blacklist_error_url', '请输入站点域名或完整 URL。')
    };
  }

  function upsertBlacklistItems(nextItem: BlacklistRule, replacedRuleKey: string): BlacklistRule[] {
    return optionsState.blacklistModel.upsertItems(optionsState.searchBlacklistItems, nextItem, replacedRuleKey);
  }

  function persistBlacklistItems(nextItems: BlacklistRule[], successMessage: string): Promise<BlacklistRule[]> {
    return saveSearchBlacklistItems(nextItems).then((savedItems) => {
      optionsState.searchBlacklistItems = savedItems;
      renderSearchBlacklistList();
      notifyNewtabSectionsRefresh('recent');
      if (successMessage) {
        showToast(successMessage, false);
      }
      return savedItems;
    });
  }

  return {
    formatTemplate,
    renderSettingsForms,
    handleReactSiteSearchFormSave,
    getSiteSearchErrorMessage,
    applySavedSiteSearchProviders,
    handleReactSearchBlacklistFormSave,
    handleReactFaviconBlacklistFormSave,
    resetBlacklistForm,
    resetFaviconBlacklistForm,
    setFaviconBlacklistEditorEnabled,
    getBlacklistMatchBadgeConfig,
    buildBlacklistRuleDraft,
    upsertBlacklistItems,
    persistBlacklistItems
  };
}

export { createForms };
export type { FormsDeps, FormsState };
