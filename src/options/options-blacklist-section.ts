// The Blacklist tab: the rules that hide sites from search results and the
// New Tab, the switch for enhanced icon fetching, and the rules for sites
// whose icons are not fetched. One React view draws it; this keeps its rules
// in step with storage and saves what the view changes.
import type { BlacklistRule, MatchMode } from '../domain/blacklist-utils';
import type * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import type { BlacklistRuleDraft, createBlacklistModel } from './options-blacklist';
import type { SettingSpec } from './options-setting-bindings';
import type { GetMessage } from './options-types';
import type { BlacklistListCopyModel, BlacklistListItemModel, BlacklistSaveResult } from './react/blacklist-list';
import type { BlacklistClearModel, BlacklistGroupModel, BlacklistTabModel, createBlacklistTabApi } from './react/blacklist-tab';
import type { BlacklistFormModeCopyModel, BlacklistFormRenderModel, BlacklistFormSaveResult } from './react/settings-forms';

type BlacklistModel = ReturnType<typeof createBlacklistModel>;

// The storage area the rules are read from and saved to.
interface BlacklistStorageArea {
  get(keys: string[], callback: (items: StorageItems | undefined) => void): unknown;
  set(items: StorageItems, callback?: () => void): unknown;
}

interface BlacklistSectionDeps {
  host: HTMLElement | null;
  blacklistTabApi: Pick<ReturnType<typeof createBlacklistTabApi>, 'createBlacklistTabController'>;
  storageArea: BlacklistStorageArea | null;
  SETTINGS: Pick<typeof Settings,
    'SEARCH_BLACKLIST_STORAGE_KEY' | 'FAVICON_REQUEST_BLACKLIST_STORAGE_KEY' |
    'FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY' | 'normalizeFaviconEnhancedFetchEnabled'>;
  blacklistModel: BlacklistModel;
  getMessage: GetMessage;
  showToast(message: string, isError?: boolean): void;
  // Asks open New Tab pages to redraw a section.
  notifyNewtabSectionsRefresh(section: string): void;
  // Binds the page's floating tooltips to newly drawn hints.
  initTooltips(): void;
}

// A rule list and the add form beside it.
interface RuleListState {
  storageKey: string;
  items: BlacklistRule[];
  formResetVersion: number;
}

// A match mode's name and what it hides, with the message keys they come from.
interface BlacklistModeCopy {
  mode: MatchMode;
  labelKey: string;
  label: string;
  tooltipKey: string;
  tooltip: string;
}

// The edit form offers the widest match first, the add form the narrowest.
const LIST_MODE_ORDER: readonly MatchMode[] = ['suffix', 'exact', 'prefix'];
const FORM_MODE_ORDER: readonly MatchMode[] = ['exact', 'prefix', 'suffix'];

function createBlacklistSection(deps: BlacklistSectionDeps) {
  const {
    host,
    blacklistTabApi,
    storageArea,
    SETTINGS,
    blacklistModel,
    getMessage,
    showToast,
    notifyNewtabSectionsRefresh,
    initTooltips
  } = deps;

  const search: RuleListState = {
    storageKey: SETTINGS.SEARCH_BLACKLIST_STORAGE_KEY,
    items: [],
    formResetVersion: 0
  };
  const favicon: RuleListState = {
    storageKey: SETTINGS.FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    items: [],
    formResetVersion: 0
  };
  let enhancedFetchEnabled = SETTINGS.normalizeFaviconEnhancedFetchEnabled(undefined);

  const getErrorMessage = (): string => getMessage('toast_error', '操作失败，请重试。');

  function getModeCopy(mode: MatchMode): BlacklistModeCopy {
    switch (mode) {
      case 'exact':
        return {
          mode,
          labelKey: 'blacklist_match_exact',
          label: getMessage('blacklist_match_exact', '当前页面'),
          tooltipKey: 'blacklist_match_exact_tooltip',
          tooltip: getMessage(
            'blacklist_match_exact_tooltip',
            '只屏蔽这一页\n────────\n例如，填 x.com/home 后，只有这一页不会出现，其他页面不受影响。'
          )
        };
      case 'suffix':
        return {
          mode,
          labelKey: 'blacklist_match_suffix',
          label: getMessage('blacklist_match_suffix', '整个网站'),
          tooltipKey: 'blacklist_match_suffix_tooltip',
          tooltip: getMessage(
            'blacklist_match_suffix_tooltip',
            '屏蔽这个网站的所有页面，也包括它的子网站\n────────\n例如，填 baidu.com 后，baidu.com/search 和 tieba.baidu.com 都不会出现。'
          )
        };
      default:
        return {
          mode,
          labelKey: 'blacklist_match_prefix',
          label: getMessage('blacklist_match_prefix', '当前站点路径'),
          tooltipKey: 'blacklist_match_prefix_tooltip',
          tooltip: getMessage(
            'blacklist_match_prefix_tooltip',
            '只屏蔽这个站点下这一路径的页面\n────────\n例如，填 baidu.com/search 后，baidu.com/search 和 baidu.com/search/1 不会出现，但 baidu.com/news 不受影响。'
          )
        };
    }
  }

  function saveItems(list: RuleListState, items: BlacklistRule[]): Promise<void> {
    const normalized = blacklistModel.normalizeItems(items);
    return new Promise<void>((resolve) => {
      if (!storageArea) {
        resolve();
        return;
      }
      storageArea.set({ [list.storageKey]: normalized }, () => resolve());
    }).then(() => {
      list.items = normalized;
      render();
    });
  }

  function getMatchBadge(modes: unknown): { tone: MatchMode; text: string } {
    const tone = blacklistModel.getMatchTone(modes);
    return { tone, text: getModeCopy(tone).label };
  }

  // The rule an input makes, or the translated reason it makes none.
  function buildRuleDraft(inputValue: string, matchModes: MatchMode[]): BlacklistRuleDraft {
    const draft = blacklistModel.buildRuleDraft(inputValue, matchModes);
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

  // Saves the search rules; open New Tab pages redraw the sites they hide.
  function saveSearchItems(items: BlacklistRule[], successMessage: string): Promise<void> {
    return saveItems(search, items).then(() => {
      notifyNewtabSectionsRefresh('recent');
      showToast(successMessage, false);
    });
  }

  function removeRule(list: RuleListState, itemKey: string, successMessage: string): Promise<void> {
    const nextItems = list.items.filter((entry) => blacklistModel.buildItemKey(entry) !== itemKey);
    const saved = list === search
      ? saveSearchItems(nextItems, successMessage)
      : saveItems(list, nextItems).then(() => showToast(successMessage, false));
    return saved.catch(() => showToast(getErrorMessage(), true));
  }

  function clearRules(list: RuleListState): Promise<void> {
    const cleared = getMessage('toast_cleared', '已清空');
    list.formResetVersion += 1;
    const saved = list === search
      ? saveSearchItems([], cleared)
      : saveItems(list, []).then(() => showToast(cleared, false));
    return saved.catch(() => showToast(getErrorMessage(), true));
  }

  async function addSearchRule(value: string, modes: MatchMode[]): Promise<BlacklistFormSaveResult> {
    const draft = buildRuleDraft(value, modes);
    if (!draft.item) {
      return { ok: false, error: draft.error };
    }
    try {
      await saveSearchItems(blacklistModel.upsertItems(search.items, draft.item, ''), getMessage('toast_saved', '已保存'));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getErrorMessage() };
    }
  }

  async function editSearchRule(itemKey: string, inputValue: string, matchModes: MatchMode[]): Promise<BlacklistSaveResult> {
    const draft = buildRuleDraft(inputValue, matchModes);
    if (!draft.item) {
      return { ok: false, error: draft.error };
    }
    try {
      await saveSearchItems(blacklistModel.upsertItems(search.items, draft.item, itemKey), getMessage('toast_saved', '已保存'));
      return { ok: true };
    } catch (error) {
      const message = getErrorMessage();
      showToast(message, true);
      return { ok: false, error: message };
    }
  }

  // A favicon rule goes first and replaces one that matches the same way.
  async function addFaviconRule(value: string, modes: MatchMode[]): Promise<BlacklistFormSaveResult> {
    const draft = buildRuleDraft(value, modes);
    if (!draft.item) {
      return { ok: false, error: draft.error };
    }
    const nextKey = blacklistModel.buildItemKey(draft.item);
    const nextItems = [
      draft.item,
      ...favicon.items.filter((item) => blacklistModel.buildItemKey(item) !== nextKey)
    ];
    try {
      await saveItems(favicon, nextItems);
      showToast(getMessage('toast_saved', '已保存'), false);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getErrorMessage() };
    }
  }

  // Turning enhanced fetching off locks the favicon rules and closes their form.
  function applyEnhancedFetch(enabled: boolean): void {
    if (enhancedFetchEnabled && !enabled) {
      favicon.formResetVersion += 1;
    }
    enhancedFetchEnabled = enabled;
    render();
  }

  const controller = blacklistTabApi.createBlacklistTabController(host, {
    search: {
      onRemove: (itemKey) => removeRule(search, itemKey, getMessage('blacklist_removed_toast', '已从黑名单移除')),
      onEdit: editSearchRule,
      onAdd: addSearchRule,
      onClear: () => clearRules(search)
    },
    favicon: {
      onRemove: (itemKey) => removeRule(favicon, itemKey, getMessage('favicon_blacklist_removed_toast', '已移除排除规则')),
      onAdd: addFaviconRule,
      onClear: () => clearRules(favicon)
    },
    onEnhancedFetchChange(checked) {
      applyEnhancedFetch(checked);
      if (storageArea) {
        storageArea.set({ [SETTINGS.FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY]: checked });
      }
    }
  });

  function getListCopy(): BlacklistListCopyModel {
    return {
      cancelLabel: getMessage('shortcuts_cancel', '取消'),
      confirmLabel: getMessage('confirm_ok', '确认'),
      confirmMessage: getMessage('confirm_remove_item', '确认移除该项？'),
      confirmMessageKey: 'confirm_remove_item',
      editLabel: getMessage('shortcuts_edit', '编辑'),
      matchLabel: getMessage('blacklist_match_label', '匹配方式'),
      modeOptions: LIST_MODE_ORDER.map((mode) => {
        const copy = getModeCopy(mode);
        return { mode, label: copy.label, tooltip: copy.tooltip };
      }),
      placeholderDomain: getMessage('blacklist_placeholder_domain', 'baidu.com'),
      placeholderExact: getMessage('blacklist_placeholder_exact', 'example.com/path'),
      placeholderPrefix: getMessage('blacklist_placeholder_prefix', 'baidu.com or baidu.com/search'),
      removeLabel: getMessage('shortcuts_remove', '移除'),
      saveLabel: getMessage('shortcuts_save', '保存修改'),
      urlLabel: getMessage('blacklist_label_url', 'URL rule')
    };
  }

  function getListItem(item: BlacklistRule): BlacklistListItemModel {
    const badge = getMatchBadge(item.matchModes);
    return {
      key: blacklistModel.buildItemKey(item),
      badgeText: badge.text,
      badgeTone: badge.tone,
      displayPattern: blacklistModel.formatPatternForDisplay(item),
      inputValue: blacklistModel.getPatternInputValue(item),
      matchModes: blacklistModel.normalizeMatchModes(item.matchModes)
    };
  }

  function getFormModel(addLabel: string): BlacklistFormRenderModel {
    return {
      copy: {
        addLabel,
        cancelLabel: getMessage('shortcuts_cancel', '取消'),
        matchLabel: getMessage('blacklist_match_label', '匹配方式'),
        modes: FORM_MODE_ORDER.map((mode): BlacklistFormModeCopyModel => {
          const copy = getModeCopy(mode);
          const presentation = blacklistModel.getInputConfig([mode]);
          return {
            label: copy.label,
            labelKey: copy.labelKey,
            mode,
            placeholder: getMessage(presentation.placeholderKey, presentation.placeholderFallback),
            prefix: presentation.prefixText,
            tooltip: copy.tooltip,
            tooltipKey: copy.tooltipKey,
            urlLabel: getMessage(presentation.labelKey, presentation.labelFallback),
            urlLabelKey: presentation.labelKey
          };
        })
      }
    };
  }

  function getClearModel(label: string, confirmMessageKey: string, confirmMessage: string): BlacklistClearModel {
    return {
      label,
      confirmMessage,
      confirmMessageKey,
      cancelLabel: getMessage('confirm_cancel', '取消'),
      confirmLabel: getMessage('confirm_ok', '确认')
    };
  }

  function getGroupModel(
    list: RuleListState,
    editable: boolean,
    description: string,
    form: BlacklistFormRenderModel,
    clear: BlacklistClearModel
  ): BlacklistGroupModel {
    return {
      description,
      list: { copy: getListCopy(), editable, items: list.items.map(getListItem) },
      form,
      formResetVersion: list.formResetVersion,
      clear
    };
  }

  function getModel(): BlacklistTabModel {
    return {
      search: {
        title: getMessage('blacklist_group_custom', '全局禁用'),
        ...getGroupModel(
          search,
          true,
          getMessage('blacklist_section_desc', '添加需要从搜索结果和新标签页中隐藏的网址。'),
          getFormModel(getMessage('blacklist_add', '添加')),
          getClearModel(
            getMessage('blacklist_clear', '清空隐藏规则'),
            'confirm_clear_blacklist',
            getMessage('confirm_clear_blacklist', '确认清空隐藏规则？')
          )
        )
      },
      favicon: {
        enabled: enhancedFetchEnabled,
        ...getGroupModel(
          favicon,
          false,
          getMessage('favicon_blacklist_section_desc', '按网站排除'),
          getFormModel(getMessage('favicon_blacklist_add', '添加排除规则')),
          getClearModel(
            getMessage('favicon_blacklist_clear', '清空排除规则'),
            'confirm_clear_favicon_blacklist',
            getMessage('confirm_clear_favicon_blacklist', '确认清空排除规则？')
          )
        )
      },
      enhancedFetch: {
        title: getMessage('settings_favicon_enhanced_fetch_title', '增强图标与主题色获取'),
        info: getMessage(
          'settings_favicon_enhanced_fetch_desc',
          '若遇到本地网络访问权限提示，可关闭此功能。关闭后不直接加载网站图片，仍可使用浏览器缓存、内置图标和第三方图标服务。'
        ),
        toggle: { id: '_x_extension_favicon_enhanced_fetch_toggle_2026_unique_', checked: enhancedFetchEnabled }
      }
    };
  }

  function render(): void {
    controller.render(getModel());
    initTooltips();
  }

  // Reads the rules and the switch and follows their changes. A stored rule
  // list is shown as normalized and never written back on its own.
  function bindSettings(settingBinder: { bindSetting<V>(spec: SettingSpec<V>): void }): void {
    [search, favicon].forEach((list) => {
      settingBinder.bindSetting({
        key: list.storageKey,
        normalize: blacklistModel.normalizeItems,
        apply(items) {
          list.items = items;
          render();
        },
        repairOnLoad: false,
        repairOnChange: false
      });
    });
    settingBinder.bindSetting({
      key: SETTINGS.FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
      normalize: SETTINGS.normalizeFaviconEnhancedFetchEnabled,
      apply: applyEnhancedFetch
    });
  }

  render();

  return { render, bindSettings };
}

export { createBlacklistSection };
export type { BlacklistSectionDeps, BlacklistStorageArea };
