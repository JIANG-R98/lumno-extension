// The segmented controls: their state for each setting and what
// selecting a segment saves.
import type * as Settings from '../domain/settings';
import type {
  NewtabGlassStyle,
  NewtabGlassTheme,
  NewtabTimeInk,
  NewtabTopContentMode,
  NewtabWidthMode
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
  currentNewtabWidthMode: NewtabWidthMode;
  currentNewtabTopContentMode: NewtabTopContentMode;
  currentNewtabTimeInk: NewtabTimeInk;
  currentNewtabGlassTheme: NewtabGlassTheme;
  currentNewtabGlassStyle: NewtabGlassStyle;
  // Made once the page has mounted its React views.
  recentModeTabsController: SegmentedControllerRef;
  newtabWidthTabsController: SegmentedControllerRef;
  newtabTopContentTabsController: SegmentedControllerRef;
  newtabTimeInkTabsController: SegmentedControllerRef;
  newtabGlassThemeTabsController: SegmentedControllerRef;
}

interface SegmentedTabsDeps {
  getMessage: GetMessage;
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
  newtabWidthSelect: HTMLSelectElement | null;
  NEWTAB_WIDTH_MODE_STORAGE_KEY: string;
  notifyNewtabSectionsRefresh(section: string): void;
  NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY: string;
  recentModeSelect: HTMLSelectElement | null;
  RECENT_MODE_STORAGE_KEY: string;
  optionsState: SegmentedTabsState;
}

function createSegmentedTabs(deps: SegmentedTabsDeps) {
  const {
    getMessage,
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
    newtabWidthSelect,
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    notifyNewtabSectionsRefresh,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    recentModeSelect,
    RECENT_MODE_STORAGE_KEY
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

  return {
    setRecentModeTabState,
    setNewtabWidthTabState,
    setNewtabTopContentTabState,
    setNewtabTimeInkTabState,
    setNewtabGlassThemeTabState,
    syncNewtabGlassThemeVisibility,
    updateRecentModeTabsVisibility,
    handleNewtabWidthSelection,
    handleNewtabTopContentSelection,
    handleNewtabGlassThemeSelection,
    handleNewtabTimeInkSelection,
    handleRecentModeSelection
  };
}

export { createSegmentedTabs };
export type { RecentMode, SegmentedTabsDeps, SegmentedTabsState };
