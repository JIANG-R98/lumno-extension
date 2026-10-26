// The Shortcuts tab: the search panel group order, the custom, aggregate,
// site, AI and engine lists, and the add form, drawn by one React view.
// The list and form sections keep their own state and hand their models to
// the parts this returns; this adds the tab's own copy, the group order and
// the aggregate auto-group switch.
import type * as Settings from '../domain/settings';
import type { createSearchSourceOrderController } from './options-search-source-order';
import type { SectionSettingBinder, SectionSettingStorage } from './options-section-setting';
import type { GetMessage } from './options-types';
import type { AggregateSearchListRenderModel } from './react/aggregate-search-list';
import type { SiteSearchFormRenderModel } from './react/settings-forms';
import type {
  createShortcutsTabApi,
  ShortcutsListId,
  ShortcutsTabHandlers,
  ShortcutsTabModel
} from './react/shortcuts-tab';
import type { SiteSearchListRenderModel } from './react/site-search-list';

// A part of the tab one section draws, the way its own view used to be drawn.
interface ShortcutsTabPart<M> {
  render(model: M): void;
}

interface ShortcutsSectionDeps {
  host: HTMLElement | null;
  shortcutsTabApi: Pick<ReturnType<typeof createShortcutsTabApi>, 'createShortcutsTabController'>;
  getMessage: GetMessage;
  orderController: Pick<ReturnType<typeof createSearchSourceOrderController>,
    'getOrder' | 'getGroupLabel' | 'moveGroup' | 'attachGroupDrag' | 'attachListDrag'>;
  settingsStore: SectionSettingStorage;
  SETTINGS: Pick<typeof Settings,
    'aggregateSearchAutoGroupEnabled' | 'aggregateSearches' |
    'aggregateSearchAutoGroupEnabled'>;
  // Older installs have aggregate searches but no auto-group choice; it is
  // derived from those searches the first time.
  deriveLegacyAutoGroupEnabled(aggregateSearches: unknown): boolean;
  refreshCustomSelects(): void;
  // Binds the page's floating tooltips to newly drawn hints.
  initTooltips(): void;
  handlers: Omit<ShortcutsTabHandlers, 'onMoveGroup' | 'attachGroupDrag' | 'attachListDrag' | 'onAutoGroupChange'>;
}

// The key a dragged row is moved by, per list.
function getRowKey(listId: ShortcutsListId, row: HTMLElement): string {
  if (listId === 'aggregate') {
    return row.getAttribute('data-aggregate-id') || '';
  }
  return String(row.getAttribute('data-key') || '').toLowerCase();
}

function createShortcutsSection(deps: ShortcutsSectionDeps) {
  const {
    host,
    shortcutsTabApi,
    getMessage,
    orderController,
    settingsStore,
    SETTINGS,
    deriveLegacyAutoGroupEnabled,
    refreshCustomSelects,
    initTooltips
  } = deps;

  const lists: Record<'custom' | 'sites' | 'ai' | 'engines', SiteSearchListRenderModel | null> = {
    custom: null,
    sites: null,
    ai: null,
    engines: null
  };
  let aggregateList: AggregateSearchListRenderModel | null = null;
  let form: SiteSearchFormRenderModel | null = null;
  let autoGroupEnabled = SETTINGS.aggregateSearchAutoGroupEnabled.parse(undefined);

  function applyAutoGroup(enabled: boolean): void {
    autoGroupEnabled = enabled;
    render();
  }

  const controller = shortcutsTabApi.createShortcutsTabController(host, {
    ...deps.handlers,
    onMoveGroup: (fromIndex, toIndex) => {
      orderController.moveGroup(fromIndex, toIndex);
    },
    attachGroupDrag: (dragHost) => orderController.attachGroupDrag(dragHost),
    attachListDrag: (listId, dragHost) => orderController.attachListDrag(dragHost, listId, (row) => getRowKey(listId, row)),
    onAutoGroupChange(checked) {
      applyAutoGroup(checked);
      void settingsStore.set(SETTINGS.aggregateSearchAutoGroupEnabled, checked).catch(() => {});
    }
  });

  function getConfirmCopy(label: string, confirmMessageKey: string, confirmMessage: string) {
    return {
      label,
      confirmMessage,
      confirmMessageKey,
      cancelLabel: getMessage('confirm_cancel', '取消'),
      confirmLabel: getMessage('confirm_ok', '确认')
    };
  }

  function getModel(): ShortcutsTabModel {
    return {
      order: {
        title: getMessage('settings_search_source_group_order_title', '搜索面板顺序'),
        info: getMessage(
          'settings_search_source_group_order_desc',
          '拖动调整 Tab 搜索面板的分组顺序，不影响结果排序。Ctrl/⌘ + Z 撤销。'
        ),
        keyboardHint: getMessage('settings_search_source_order_keyboard_hint', '按 Alt + 左右方向键调整位置'),
        groups: orderController.getOrder().groups.map((group) => ({ group, label: orderController.getGroupLabel(group) }))
      },
      custom: {
        title: getMessage('shortcuts_group_custom', '自定义'),
        clear: getConfirmCopy(
          getMessage('shortcuts_clear_custom', '清空自定义'),
          'confirm_clear_custom',
          getMessage('confirm_clear_custom', '确认清空自定义搜索？')
        ),
        list: lists.custom
      },
      form,
      aggregate: {
        title: getMessage('aggregate_search_group_title', '聚合搜索'),
        clear: getConfirmCopy(
          getMessage('aggregate_search_clear', '清空聚合搜索'),
          'confirm_clear_aggregate_search',
          getMessage('confirm_clear_aggregate_search', '确认清空聚合搜索？')
        ),
        autoGroup: {
          title: getMessage('settings_aggregate_search_auto_group_short_title', '自动创建标签页组'),
          info: getMessage(
            'settings_aggregate_search_auto_group_desc',
            '开启后，聚合搜索打开的所有标签页会归入同一组，并以“聚合名称：搜索关键词”命名'
          ),
          toggle: {
            id: '_x_extension_aggregate_search_auto_group_toggle_2026_unique_',
            checked: autoGroupEnabled,
            ariaLabel: getMessage('settings_aggregate_search_auto_group_title', '聚合搜索自动创建标签页组')
          }
        },
        list: aggregateList
      },
      sites: {
        title: getMessage('search_scope_group_sites', '站内搜索'),
        reset: getConfirmCopy(
          getMessage('shortcuts_reset_builtin', '重置为初始列表'),
          'confirm_reset_builtin',
          getMessage('confirm_reset_builtin', '确认重置内置列表？')
        ),
        list: lists.sites
      },
      ai: {
        title: getMessage('shortcuts_group_ai', 'AI 搜索'),
        info: getMessage(
          'shortcuts_group_ai_desc',
          '输入关键词，按下 Tab 并键入内容（Prompt）后，可跳转至以下 AI 网站并自动填入（需先登录对应网站）'
        ),
        list: lists.ai
      },
      engines: {
        title: getMessage('search_scope_group_engines', '搜索引擎'),
        list: lists.engines
      }
    };
  }

  function render(): void {
    controller.render(getModel());
    initTooltips();
  }

  function listPart(name: keyof typeof lists): ShortcutsTabPart<SiteSearchListRenderModel> {
    return {
      render(model) {
        lists[name] = model;
        render();
      }
    };
  }

  // Follows the auto-group switch. Older installs never stored one: it is
  // derived from their aggregate searches and saved once.
  function bindSettings(settingBinder: SectionSettingBinder): void {
    settingBinder.bindSetting({
      setting: SETTINGS.aggregateSearchAutoGroupEnabled,
      apply: applyAutoGroup,
      refreshSelects: true
    });
    const settings = [SETTINGS.aggregateSearchAutoGroupEnabled, SETTINGS.aggregateSearches];
    void settingsStore.include(settings).then(() => {
      if (settingsStore.getStored(SETTINGS.aggregateSearchAutoGroupEnabled) !== undefined ||
          !settingsStore.isRead(SETTINGS.aggregateSearches)) {
        return;
      }
      const derived = deriveLegacyAutoGroupEnabled(settingsStore.getStored(SETTINGS.aggregateSearches));
      applyAutoGroup(derived);
      refreshCustomSelects();
      void settingsStore.set(SETTINGS.aggregateSearchAutoGroupEnabled, derived).catch(() => {});
    });
  }

  render();

  return {
    customList: listPart('custom'),
    sitesList: listPart('sites'),
    aiList: listPart('ai'),
    enginesList: listPart('engines'),
    aggregateList: {
      render(model: AggregateSearchListRenderModel) {
        aggregateList = model;
        render();
      }
    },
    form: {
      render(model: SiteSearchFormRenderModel) {
        form = model;
        render();
      }
    },
    render,
    bindSettings
  };
}

export { createShortcutsSection };
export type { ShortcutsSectionDeps, ShortcutsTabPart };
