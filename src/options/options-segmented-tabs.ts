// The segmented controls: their state for each setting and what
// selecting a segment saves.
import type { BatchedStorageArea } from '../platform/settings-storage';
import type { LayoutMutation } from './options-panel-motion';
import type { GetMessage } from './options-types';
import type { SegmentedControlController, SegmentedControlRenderModel } from './react/segmented-control';

type RecentMode = 'latest' | 'most';

type SegmentedControllerRef = Pick<SegmentedControlController, 'render'> | null;

interface SegmentedTabsState {
  storageArea: BatchedStorageArea | null;
  currentRecentMode: RecentMode;
  // Made once the page has mounted its React views.
  recentModeTabsController: SegmentedControllerRef;
}

interface SegmentedTabsDeps {
  getMessage: GetMessage;
  animateOptionsPanelHeight(mutateLayout: LayoutMutation): boolean;
  setConditionalSettingsElementVisibility(element: HTMLElement | null, visible: boolean, visibleDisplay?: string): boolean;
  recentModeTabsWrap: HTMLElement | null;
  notifyNewtabSectionsRefresh(section: string): void;
  recentModeSelect: HTMLSelectElement | null;
  RECENT_MODE_STORAGE_KEY: string;
  optionsState: SegmentedTabsState;
}

function createSegmentedTabs(deps: SegmentedTabsDeps) {
  const {
    getMessage,
    animateOptionsPanelHeight,
    setConditionalSettingsElementVisibility,
    recentModeTabsWrap,
    notifyNewtabSectionsRefresh,
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
    updateRecentModeTabsVisibility,
    handleRecentModeSelection
  };
}

export { createSegmentedTabs };
export type { RecentMode, SegmentedTabsDeps, SegmentedTabsState };
