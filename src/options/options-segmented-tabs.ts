// The segmented controls: their state for each setting and what
// selecting a segment saves.
import type * as Settings from '../domain/settings';
import type {
  NewtabGlassStyle,
  NewtabGlassTheme,
  NewtabTimeInk,
  NewtabTopContentMode,
  NewtabWidthMode,
  OverlayEnterAnimation,
  OverlaySizeMode,
  RestrictedAction,
  SearchResultPriority
} from '../domain/settings';
import type { BatchedStorageArea } from '../platform/settings-storage';
import type { LayoutMutation } from './options-panel-motion';
import type { GetMessage } from './options-types';
import type { SegmentedControlController, SegmentedControlRenderModel } from './react/segmented-control';

type RecentMode = 'latest' | 'most';

type SegmentedControllerRef = Pick<SegmentedControlController, 'render'> | null;

interface SegmentedTabsState {
  storageArea: BatchedStorageArea | null;
  currentRecentMode: RecentMode;
  currentOverlaySizeMode: OverlaySizeMode;
  currentOverlayEnterAnimation: OverlayEnterAnimation;
  currentNewtabWidthMode: NewtabWidthMode;
  currentNewtabTopContentMode: NewtabTopContentMode;
  currentNewtabTimeInk: NewtabTimeInk;
  currentNewtabGlassTheme: NewtabGlassTheme;
  currentNewtabGlassStyle: NewtabGlassStyle;
  currentRestrictedAction: RestrictedAction;
  currentSearchResultPriority: SearchResultPriority;
  // Made once the page has mounted its React views.
  recentModeTabsController: SegmentedControllerRef;
  overlaySizeTabsController: SegmentedControllerRef;
  overlayEnterAnimationTabsController: SegmentedControllerRef;
  newtabWidthTabsController: SegmentedControllerRef;
  newtabTopContentTabsController: SegmentedControllerRef;
  newtabTimeInkTabsController: SegmentedControllerRef;
  newtabGlassThemeTabsController: SegmentedControllerRef;
  restrictedActionTabsController: SegmentedControllerRef;
  searchResultPriorityTabsController: SegmentedControllerRef;
}

interface SegmentedTabsDeps {
  getMessage: GetMessage;
  normalizeOverlaySizeMode(value: unknown): OverlaySizeMode;
  normalizeOverlayEnterAnimation(value: unknown): OverlayEnterAnimation;
  normalizeNewtabWidthMode(value: unknown): NewtabWidthMode;
  normalizeNewtabTopContentMode(value: unknown): NewtabTopContentMode;
  SETTINGS: Pick<typeof Settings, 'normalizeNewtabTimeInk' | 'normalizeNewtabGlassTheme' |
    'NEWTAB_GLASS_THEME_STORAGE_KEY' | 'NEWTAB_TIME_INK_STORAGE_KEY'>;
  animateOptionsPanelHeight(mutateLayout: LayoutMutation): boolean;
  setConditionalSettingsElementVisibility(element: HTMLElement | null, visible: boolean, visibleDisplay?: string): boolean;
  newtabGlassThemeRow: HTMLElement | null;
  newtabTimeFontRow: HTMLElement | null;
  newtabTimeFontWeightRow: HTMLElement | null;
  newtabTimeFontSizeRow: HTMLElement | null;
  newtabTimeOpacityRow: HTMLElement | null;
  newtabTimeInkRow: HTMLElement | null;
  newtabTimeSecondsRow: HTMLElement | null;
  newtabTime12HourRow: HTMLElement | null;
  recentModeTabsWrap: HTMLElement | null;
  RESTRICTED_ACTION_STORAGE_KEY: string;
  RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY: string;
  normalizeSearchResultPriority(value: unknown): SearchResultPriority;
  newtabWidthSelect: HTMLSelectElement | null;
  NEWTAB_WIDTH_MODE_STORAGE_KEY: string;
  notifyNewtabSectionsRefresh(section: string): void;
  OVERLAY_SIZE_MODE_STORAGE_KEY: string;
  OVERLAY_ENTER_ANIMATION_STORAGE_KEY: string;
  searchResultPrioritySelect: HTMLSelectElement | null;
  SEARCH_RESULT_PRIORITY_STORAGE_KEY: string;
  NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY: string;
  recentModeSelect: HTMLSelectElement | null;
  RECENT_MODE_STORAGE_KEY: string;
  restrictedActionSelect: HTMLSelectElement | null;
  optionsState: SegmentedTabsState;
}

function createSegmentedTabs(deps: SegmentedTabsDeps) {
  const {
    getMessage,
    normalizeOverlaySizeMode,
    normalizeOverlayEnterAnimation,
    normalizeNewtabWidthMode,
    normalizeNewtabTopContentMode,
    SETTINGS,
    animateOptionsPanelHeight,
    setConditionalSettingsElementVisibility,
    newtabGlassThemeRow,
    newtabTimeFontRow,
    newtabTimeFontWeightRow,
    newtabTimeFontSizeRow,
    newtabTimeOpacityRow,
    newtabTimeInkRow,
    newtabTimeSecondsRow,
    newtabTime12HourRow,
    recentModeTabsWrap,
    RESTRICTED_ACTION_STORAGE_KEY,
    RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY,
    normalizeSearchResultPriority,
    newtabWidthSelect,
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    notifyNewtabSectionsRefresh,
    OVERLAY_SIZE_MODE_STORAGE_KEY,
    OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
    searchResultPrioritySelect,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    recentModeSelect,
    RECENT_MODE_STORAGE_KEY,
    restrictedActionSelect
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function renderSegmentedControlState(controller: SegmentedControllerRef, model: SegmentedControlRenderModel): void {
    if (controller) {
      controller.render(model);
    }
  }

  function setRecentModeTabState(mode: unknown): void {
    const nextMode: RecentMode = mode === 'most' ? 'most' : 'latest';
    optionsState.currentRecentMode = nextMode;
    renderSegmentedControlState(
      optionsState.recentModeTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-recent-mode',
        items: [
          {
            value: 'latest',
            labelKey: 'recent_mode_latest',
            label: getMessage('recent_mode_latest', '最近访问')
          },
          {
            value: 'most',
            labelKey: 'recent_mode_most',
            label: getMessage('recent_mode_most', '最常访问')
          }
        ],
        select: {
          id: '_x_extension_recent_mode_select_2024_unique_'
        }
      }
    );
  }

  function setOverlaySizeTabState(mode: unknown): void {
    const nextMode = normalizeOverlaySizeMode(mode);
    optionsState.currentOverlaySizeMode = nextMode;
    renderSegmentedControlState(
      optionsState.overlaySizeTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-overlay-size',
        items: [
          {
            value: 'compact',
            labelKey: 'overlay_size_compact',
            label: getMessage('overlay_size_compact', '小')
          },
          {
            value: 'standard',
            labelKey: 'overlay_size_standard',
            label: getMessage('overlay_size_standard', '标准')
          },
          {
            value: 'large',
            labelKey: 'overlay_size_large',
            label: getMessage('overlay_size_large', '大')
          }
        ]
      }
    );
  }

  function setOverlayEnterAnimationTabState(mode: unknown): void {
    const nextMode = normalizeOverlayEnterAnimation(mode);
    optionsState.currentOverlayEnterAnimation = nextMode;
    renderSegmentedControlState(
      optionsState.overlayEnterAnimationTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-overlay-enter-animation',
        items: [
          {
            value: 'elastic',
            labelKey: 'overlay_enter_animation_elastic',
            label: getMessage('overlay_enter_animation_elastic', '弹性')
          },
          {
            value: 'fade',
            labelKey: 'overlay_enter_animation_fade',
            label: getMessage('overlay_enter_animation_fade', '淡入')
          }
        ]
      }
    );
  }

  function setNewtabWidthTabState(mode: unknown): void {
    const nextMode = normalizeNewtabWidthMode(mode);
    optionsState.currentNewtabWidthMode = nextMode;
    renderSegmentedControlState(
      optionsState.newtabWidthTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-newtab-width',
        items: [
          {
            value: 'standard',
            labelKey: 'newtab_width_standard',
            label: getMessage('newtab_width_standard', '标准')
          },
          {
            value: 'wide',
            labelKey: 'newtab_width_wide',
            label: getMessage('newtab_width_wide', '宽屏（推荐）')
          }
        ],
        select: {
          id: '_x_extension_newtab_width_select_2026_unique_'
        }
      }
    );
  }

  function setNewtabTopContentTabState(mode: unknown): void {
    const nextMode = normalizeNewtabTopContentMode(mode);
    optionsState.currentNewtabTopContentMode = nextMode;
    renderSegmentedControlState(
      optionsState.newtabTopContentTabsController,
      {
        activeValue: nextMode,
        dataAttribute: 'data-newtab-top-content',
        items: [
          {
            value: 'brand',
            labelKey: 'newtab_top_content_brand',
            label: getMessage('newtab_top_content_brand', '品牌标识')
          },
          {
            value: 'time',
            labelKey: 'newtab_top_content_time',
            label: getMessage('newtab_top_content_time', '时间')
          },
          {
            value: 'off',
            labelKey: 'newtab_top_content_off',
            label: getMessage('newtab_top_content_off', '隐藏')
          }
        ]
      }
    );
    syncNewtabTimeSecondsVisibility();
  }

  function setNewtabTimeInkTabState(ink: unknown): void {
    optionsState.currentNewtabTimeInk = SETTINGS.normalizeNewtabTimeInk(ink);
    renderSegmentedControlState(
      optionsState.newtabTimeInkTabsController,
      {
        activeValue: optionsState.currentNewtabTimeInk,
        dataAttribute: 'data-newtab-time-ink',
        items: [
          { value: 'auto', labelKey: 'newtab_time_ink_auto', label: getMessage('newtab_time_ink_auto', '自动') },
          { value: 'light', labelKey: 'newtab_time_ink_light', label: getMessage('newtab_time_ink_light', '浅色') },
          { value: 'dark', labelKey: 'newtab_time_ink_dark', label: getMessage('newtab_time_ink_dark', '深色') }
        ]
      }
    );
  }

  function setNewtabGlassThemeTabState(theme: unknown): void {
    optionsState.currentNewtabGlassTheme = SETTINGS.normalizeNewtabGlassTheme(theme);
    renderSegmentedControlState(
      optionsState.newtabGlassThemeTabsController,
      {
        activeValue: optionsState.currentNewtabGlassTheme,
        dataAttribute: 'data-newtab-glass-theme',
        items: [
          { value: 'follow', labelKey: 'settings_newtab_glass_theme_follow', label: getMessage('settings_newtab_glass_theme_follow', '自动') },
          { value: 'light', labelKey: 'settings_newtab_glass_theme_light', label: getMessage('settings_newtab_glass_theme_light', '浅色') },
          { value: 'dark', labelKey: 'settings_newtab_glass_theme_dark', label: getMessage('settings_newtab_glass_theme_dark', '深色') }
        ]
      }
    );
  }

  // The material's light/dark choice only matters while a glass material is on.
  function syncNewtabGlassThemeVisibility(): void {
    animateOptionsPanelHeight(() => setConditionalSettingsElementVisibility(
      newtabGlassThemeRow,
      optionsState.currentNewtabGlassStyle !== 'none'
    ));
  }

  function syncNewtabTimeSecondsVisibility(): void {
    const visible = optionsState.currentNewtabTopContentMode === 'time';
    animateOptionsPanelHeight(() => {
      let changed = false;
      [
        newtabTimeFontRow,
        newtabTimeFontWeightRow,
        newtabTimeFontSizeRow,
        newtabTimeOpacityRow,
        newtabTimeInkRow,
        newtabTimeSecondsRow,
        newtabTime12HourRow
      ].forEach((row) => {
        changed = setConditionalSettingsElementVisibility(row, visible) || changed;
      });
      return changed;
    });
  }

  function updateRecentModeTabsVisibility(countValue: unknown): void {
    if (!recentModeTabsWrap) {
      return;
    }
    const parsed = Number.parseInt(String(countValue), 10);
    const shouldHide = Number.isFinite(parsed) ? parsed <= 0 : false;
    animateOptionsPanelHeight(() =>
      setConditionalSettingsElementVisibility(recentModeTabsWrap, !shouldHide, 'flex')
    );
  }

  function setRestrictedActionTabState(action: unknown): void {
    const nextAction: RestrictedAction = action === 'none' ? 'none' : 'default';
    optionsState.currentRestrictedAction = nextAction;
    renderSegmentedControlState(
      optionsState.restrictedActionTabsController,
      {
        activeValue: nextAction,
        dataAttribute: 'data-restricted-action',
        items: [
          {
            value: 'default',
            labelKey: 'restricted_action_default',
            label: getMessage('restricted_action_default', '前往 Lumno 新标签页')
          },
          {
            value: 'none',
            labelKey: 'restricted_action_none',
            label: getMessage('restricted_action_none', '遵循浏览器设置')
          }
        ],
        select: {
          id: '_x_extension_restricted_action_select_2024_unique_'
        }
      }
    );
  }

  function createRestrictedActionStorageUpdate(action: RestrictedAction): Record<string, unknown> {
    return {
      [RESTRICTED_ACTION_STORAGE_KEY]: action === 'none' ? 'none' : 'default',
      [RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY]: true
    };
  }

  function setSearchResultPriorityTabState(priority: unknown): void {
    const nextPriority = normalizeSearchResultPriority(priority);
    optionsState.currentSearchResultPriority = nextPriority;
    renderSegmentedControlState(
      optionsState.searchResultPriorityTabsController,
      {
        activeValue: nextPriority,
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
        select: {
          id: '_x_extension_search_result_priority_select_2026_unique_'
        }
      }
    );
  }

  function handleNewtabWidthSelection(value: string): void {
    const nextMode = normalizeNewtabWidthMode(value);
    setNewtabWidthTabState(nextMode);
    if (newtabWidthSelect) {
      newtabWidthSelect.value = nextMode;
    }
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.set({ [NEWTAB_WIDTH_MODE_STORAGE_KEY]: nextMode });
    notifyNewtabSectionsRefresh('all');
  }

  function handleOverlaySizeSelection(value: string): void {
    const nextMode = normalizeOverlaySizeMode(value);
    setOverlaySizeTabState(nextMode);
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.set({ [OVERLAY_SIZE_MODE_STORAGE_KEY]: nextMode });
  }

  function handleOverlayEnterAnimationSelection(value: string): void {
    const nextMode = normalizeOverlayEnterAnimation(value);
    setOverlayEnterAnimationTabState(nextMode);
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.set({ [OVERLAY_ENTER_ANIMATION_STORAGE_KEY]: nextMode });
  }

  function handleSearchResultPrioritySelection(value: string): void {
    const nextPriority = normalizeSearchResultPriority(value);
    setSearchResultPriorityTabState(nextPriority);
    if (searchResultPrioritySelect) {
      searchResultPrioritySelect.value = nextPriority;
    }
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.set({ [SEARCH_RESULT_PRIORITY_STORAGE_KEY]: nextPriority });
  }

  function handleNewtabTopContentSelection(value: string): void {
    const nextMode = normalizeNewtabTopContentMode(value);
    setNewtabTopContentTabState(nextMode);
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.set({ [NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: nextMode });
  }

  function handleNewtabGlassThemeSelection(value: string): void {
    const nextTheme = SETTINGS.normalizeNewtabGlassTheme(value);
    setNewtabGlassThemeTabState(nextTheme);
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.set({ [SETTINGS.NEWTAB_GLASS_THEME_STORAGE_KEY]: nextTheme });
  }

  function handleNewtabTimeInkSelection(value: string): void {
    const nextInk = SETTINGS.normalizeNewtabTimeInk(value);
    setNewtabTimeInkTabState(nextInk);
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.set({ [SETTINGS.NEWTAB_TIME_INK_STORAGE_KEY]: nextInk });
  }

  function handleRecentModeSelection(value: string): void {
    const nextMode: RecentMode = value === 'most' ? 'most' : 'latest';
    setRecentModeTabState(nextMode);
    if (recentModeSelect) {
      recentModeSelect.value = nextMode;
    }
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.set({ [RECENT_MODE_STORAGE_KEY]: nextMode });
    notifyNewtabSectionsRefresh('recent');
  }

  function handleRestrictedActionSelection(value: string): void {
    const nextAction: RestrictedAction = value === 'none' ? 'none' : 'default';
    setRestrictedActionTabState(nextAction);
    if (restrictedActionSelect) {
      restrictedActionSelect.value = nextAction;
    }
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.set(createRestrictedActionStorageUpdate(nextAction));
  }

  return {
    setRecentModeTabState,
    setOverlaySizeTabState,
    setOverlayEnterAnimationTabState,
    setNewtabWidthTabState,
    setNewtabTopContentTabState,
    setNewtabTimeInkTabState,
    setNewtabGlassThemeTabState,
    syncNewtabGlassThemeVisibility,
    updateRecentModeTabsVisibility,
    setRestrictedActionTabState,
    setSearchResultPriorityTabState,
    handleNewtabWidthSelection,
    handleOverlaySizeSelection,
    handleOverlayEnterAnimationSelection,
    handleSearchResultPrioritySelection,
    handleNewtabTopContentSelection,
    handleNewtabGlassThemeSelection,
    handleNewtabTimeInkSelection,
    handleRecentModeSelection,
    handleRestrictedActionSelection
  };
}

export { createSegmentedTabs };
export type { RecentMode, SegmentedTabsDeps, SegmentedTabsState };
