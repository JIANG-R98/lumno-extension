// The site search form: its render model, saving what it submits, and its
// error copy.
import type { AggregateSearch } from '../domain/search/aggregate-search-store';
import type { SiteSearchProvider } from '../domain/search/types';
import type { createSiteSearchModel } from './options-site-search';
import type { GetMessage } from './options-types';
import type { SiteSearchProviderDraft, SiteSearchSaveResult } from './react/site-search-list';
import type { SiteSearchFormController, SiteSearchFormRenderModel } from './react/settings-forms';

interface FormsState {
  // Made once the page has mounted its React views.
  siteSearchFormController: Pick<SiteSearchFormController, 'render'> | null;
  siteSearchModel: Pick<ReturnType<typeof createSiteSearchModel>, 'addCustomSiteSearchProvider'>;
  customSiteSearchProviders: SiteSearchProvider[];
  customSiteSearchProviderIdsReady: boolean;
  disabledSiteSearchKeys: Set<string>;
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
  optionsState: FormsState;
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
    showToast
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

  function renderSettingsForms(): void {
    if (optionsState.siteSearchFormController) {
      optionsState.siteSearchFormController.render(getSiteSearchFormRenderModel());
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

  return {
    formatTemplate,
    renderSettingsForms,
    handleReactSiteSearchFormSave,
    getSiteSearchErrorMessage,
    applySavedSiteSearchProviders
  };
}

export { createForms };
export type { FormsDeps, FormsState };
