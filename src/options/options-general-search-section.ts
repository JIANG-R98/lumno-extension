// The General tab's search results section, shared by the webpage overlay
// and the New Tab search box: where result tabs open, which result comes
// first, the browser content types shown and their order, how many results
// show, and fuzzy pinyin. One React view draws the rows; this keeps their
// values in step with storage.
import type { SearchSourceType } from '../domain/search/types';
import type * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createSectionSetting, type SectionSettingBinder } from './options-section-setting';
import type { SectionView } from './options-section-view';
import type { createSearchSourceOrderController } from './options-search-source-order';
import type { GetMessage } from './options-types';
import type { SettingsRowModel, SettingsRowsHandlers, SettingsSectionModel } from './react/settings-rows-view';

interface GeneralSearchSectionDeps {
  // Draws the section; the General tab hands over its part of the tab's view.
  view(handlers: SettingsRowsHandlers): SectionView<SettingsSectionModel>;
  storageArea: {
    get(keys: string[], callback: (items: StorageItems | undefined) => void): unknown;
    set(items: StorageItems): unknown;
  } | null;
  SETTINGS: Pick<typeof Settings,
    'SEARCH_RESULT_TAB_POSITION_STORAGE_KEY' | 'SEARCH_RESULT_PRIORITY_STORAGE_KEY' |
    'SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY' | 'SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY' |
    'SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY' |
    'normalizeSearchResultTabPosition' | 'normalizeSearchResultPriority' | 'normalizeSearchResultSourceTypes' |
    'normalizeSearchResultDisplayLimit' | 'normalizeSearchFuzzyPinyinEnabled'>;
  orderController: Pick<ReturnType<typeof createSearchSourceOrderController>,
    'sortLocalSourceTypes' | 'moveLocal' | 'resetLocal' | 'isLocalDefault' | 'attachLocalDrag'>;
  getMessage: GetMessage;
  getViewportTopInset(): number;
  // Hides the floating tooltip, for a button that hides itself.
  hideTooltip(): void;
}

// The browser content a search can show, by its type.
const SOURCE_TYPES: ReadonlyArray<{ value: SearchSourceType; id: string; labelKey: string }> = [
  { value: 'topSite', id: '_x_extension_search_result_source_top_site_2026_unique_', labelKey: 'search_tag_top_site' },
  { value: 'bookmark', id: '_x_extension_search_result_source_bookmark_2026_unique_', labelKey: 'search_tag_bookmark' },
  { value: 'history', id: '_x_extension_search_result_source_history_2026_unique_', labelKey: 'search_tag_history' }
];

function createGeneralSearchSection(deps: GeneralSearchSectionDeps) {
  const {
    view,
    storageArea,
    SETTINGS,
    orderController,
    getMessage,
    getViewportTopInset,
    hideTooltip
  } = deps;
  const SOURCE_TYPES_KEY = SETTINGS.SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY;

  const render = (): void => controller.render({ rows: getRows() });
  const tabPosition = createSectionSetting({
    storageKey: SETTINGS.SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
    normalize: SETTINGS.normalizeSearchResultTabPosition,
    refreshSelects: true,
    repairOnLoad: false,
    repairOnChange: false
  }, storageArea, () => render());
  const priority = createSectionSetting({
    storageKey: SETTINGS.SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    normalize: SETTINGS.normalizeSearchResultPriority,
    refreshSelects: true,
    repairOnChange: false
  }, storageArea, () => render());
  const displayLimit = createSectionSetting({
    storageKey: SETTINGS.SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    normalize: SETTINGS.normalizeSearchResultDisplayLimit
  }, storageArea, () => render());
  const fuzzyPinyin = createSectionSetting({
    storageKey: SETTINGS.SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY,
    normalize: SETTINGS.normalizeSearchFuzzyPinyinEnabled
  }, storageArea, () => render());
  let sourceTypes: SearchSourceType[] = SETTINGS.normalizeSearchResultSourceTypes(undefined);

  function saveSourceTypes(value: unknown): void {
    sourceTypes = SETTINGS.normalizeSearchResultSourceTypes(value);
    render();
    if (storageArea) {
      storageArea.set({ [SOURCE_TYPES_KEY]: sourceTypes });
    }
  }

  // The types in their shown order, which the search source order keeps.
  function getOrderedSourceTypes(): string[] {
    return orderController.sortLocalSourceTypes(SOURCE_TYPES.map((item) => item.value));
  }

  const controller = view({
    onToggle(key, checked) {
      if (key === fuzzyPinyin.storageKey) {
        fuzzyPinyin.change(checked);
      }
    },
    onSelect(key, value) {
      if (key === tabPosition.storageKey) {
        tabPosition.change(SETTINGS.normalizeSearchResultTabPosition(value));
      } else if (key === priority.storageKey) {
        priority.change(SETTINGS.normalizeSearchResultPriority(value));
      }
    },
    onSlide(key, value) {
      if (key === displayLimit.storageKey) {
        displayLimit.change(SETTINGS.normalizeSearchResultDisplayLimit(value));
      }
    },
    onCheck(key, values) {
      if (key === SOURCE_TYPES_KEY) {
        saveSourceTypes(values);
      }
    },
    onMove(key, fromIndex, toIndex) {
      if (key === SOURCE_TYPES_KEY) {
        orderController.moveLocal(getOrderedSourceTypes(), fromIndex, toIndex);
      }
    },
    // Every type back on and in its usual order; the order step can be undone.
    onReset(key) {
      if (key !== SOURCE_TYPES_KEY) {
        return;
      }
      orderController.resetLocal();
      saveSourceTypes(SOURCE_TYPES.map((item) => item.value));
      hideTooltip();
    },
    attachDrag: (key, dragHost) => (key === SOURCE_TYPES_KEY ? orderController.attachLocalDrag(dragHost) : () => {}),
    getViewportTopInset
  });

  function getRows(): SettingsRowModel[] {
    const selected = new Set<string>(sourceTypes);
    const ordered = getOrderedSourceTypes();
    const labels: Record<SearchSourceType, string> = {
      topSite: getMessage('search_tag_top_site', '常用'),
      bookmark: getMessage('search_tag_bookmark', '书签'),
      history: getMessage('search_tag_history', '历史')
    };
    return [
      { type: 'header', key: 'header', title: getMessage('settings_search_results_section_title', '搜索结果设置') },
      {
        type: 'select',
        key: tabPosition.storageKey,
        title: {
          text: getMessage('settings_search_result_tab_position_title', '搜索结果标签页打开位置'),
          id: '_x_extension_search_result_tab_position_select_2026_unique__title'
        },
        select: {
          id: '_x_extension_search_result_tab_position_select_2026_unique_',
          labelledBy: '_x_extension_search_result_tab_position_select_2026_unique__title',
          value: tabPosition.get(),
          items: [
            {
              value: 'end',
              labelKey: 'search_result_tab_position_end',
              label: getMessage('search_result_tab_position_end', '标签栏最右侧（最下方）')
            },
            {
              value: 'afterCurrent',
              labelKey: 'search_result_tab_position_after_current',
              label: getMessage('search_result_tab_position_after_current', '当前标签页右侧（下方）')
            },
            {
              value: 'beforeCurrent',
              labelKey: 'search_result_tab_position_before_current',
              label: getMessage('search_result_tab_position_before_current', '当前标签页左侧（上方）')
            }
          ]
        }
      },
      {
        type: 'segmented',
        key: priority.storageKey,
        title: { text: getMessage('settings_search_result_priority_title', '搜索结果首位优先级') },
        groupId: '_x_extension_search_result_priority_tabs_wrap_2026_unique_',
        ariaLabel: getMessage('settings_search_result_priority_title', '搜索结果首位优先级'),
        segmented: {
          activeValue: priority.get(),
          dataAttribute: 'data-search-result-priority',
          items: [
            {
              value: 'autocomplete',
              labelKey: 'search_result_priority_autocomplete',
              label: getMessage('search_result_priority_autocomplete', '补全优先')
            },
            {
              value: 'search',
              labelKey: 'search_result_priority_search',
              label: getMessage('search_result_priority_search', '搜索优先')
            }
          ],
          select: { id: '_x_extension_search_result_priority_select_2026_unique_' }
        }
      },
      {
        type: 'checkbox-group',
        key: SOURCE_TYPES_KEY,
        title: { text: getMessage('settings_search_result_sources_title', '显示结果类型') },
        groupId: '_x_extension_search_result_source_types_2026_unique_',
        ariaLabel: getMessage('settings_search_result_sources_title', '显示结果类型'),
        checkboxes: {
          required: true,
          sortable: true,
          items: ordered.flatMap((type) => {
            const item = SOURCE_TYPES.find((entry) => entry.value === type);
            return item ? [{
              value: item.value,
              id: item.id,
              checked: selected.has(item.value),
              label: labels[item.value],
              labelKey: item.labelKey
            }] : [];
          })
        },
        reset: {
          id: '_x_extension_search_result_source_types_reset_2026_unique_',
          label: getMessage('settings_search_result_sources_reset', '恢复默认'),
          hidden: selected.size >= SOURCE_TYPES.length && orderController.isLocalDefault()
        }
      },
      {
        type: 'slider',
        key: displayLimit.storageKey,
        rowId: '_x_extension_search_result_display_limit_setting_row_2026_unique_',
        title: { text: getMessage('settings_search_result_display_limit_title', '最多显示结果') },
        hostId: '_x_extension_search_result_display_limit_control_2026_unique_',
        slider: {
          ariaLabel: getMessage('settings_search_result_display_limit_title', '最多显示结果'),
          id: '_x_extension_search_result_display_limit_slider_2026_unique_',
          min: 5,
          max: 10,
          step: 1,
          ticks: [
            { align: 'start', label: '5' },
            { align: 'end', label: '10' }
          ],
          value: displayLimit.get()
        }
      },
      {
        type: 'toggle',
        key: fuzzyPinyin.storageKey,
        title: { text: getMessage('settings_search_fuzzy_pinyin_title', '拼音模糊音') },
        toggle: {
          id: '_x_extension_search_fuzzy_pinyin_toggle_2026_unique_',
          checked: fuzzyPinyin.get(),
          ariaLabel: getMessage('settings_search_fuzzy_pinyin_title', '拼音模糊音')
        }
      }
    ];
  }

  // The stored types are read once and written back when they were missing
  // or not in their normal form; later changes are only followed.
  function bindSettings(settingBinder: SectionSettingBinder): void {
    [tabPosition, priority, displayLimit, fuzzyPinyin].forEach((entry) => entry.bind(settingBinder));
    settingBinder.bindSetting({
      key: SOURCE_TYPES_KEY,
      normalize: SETTINGS.normalizeSearchResultSourceTypes,
      apply(value) {
        sourceTypes = value;
        render();
      },
      load: false,
      repairOnChange: false
    });
    if (!storageArea) {
      return;
    }
    storageArea.get([SOURCE_TYPES_KEY], (items) => {
      const stored = items ? items[SOURCE_TYPES_KEY] : undefined;
      sourceTypes = SETTINGS.normalizeSearchResultSourceTypes(stored);
      render();
      if (!Array.isArray(stored) || JSON.stringify(stored) !== JSON.stringify(sourceTypes)) {
        storageArea.set({ [SOURCE_TYPES_KEY]: sourceTypes });
      }
    });
  }

  render();

  return { render, bindSettings, destroy: () => controller.destroy() };
}

export { createGeneralSearchSection };
export type { GeneralSearchSectionDeps };
