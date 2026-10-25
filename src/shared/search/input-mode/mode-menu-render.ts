// The mode menu's model: its items with the filter applied, moving and
// reordering groups and tiles, and history keys. The menu itself is drawn
// by the React view (react/search/mode-menu.tsx) from this model.
import type { ModeMenuHandlers, ModeMenuModel, ModeMenuView } from '../../react/search/mode-menu';
import type { AttachFaviconData, ModeMenuEntry, ModeMenuItem } from './types';
import type { ModeMenuIconsApi } from './mode-menu-icons';
import type { ModeMenuLanguageApi } from './mode-menu-language';
import type { ModeMenuNavigationApi } from './mode-menu-navigation';
import type { ModeMenuSearchApi } from './mode-menu-search';
import type { PrefixVisualApi } from './prefix-visual';

// The controller state search-input-mode.ts shares with its modules.
interface ModeMenuRenderState {
  modeMenuOpen: boolean;
  // The open motion has played; false while it waits for its frame.
  modeMenuRevealed: boolean;
  modeMenuBusy: boolean;
  modeMenuSearchActive: boolean;
  modeMenuHasQuery: boolean;
  // The tile that takes Tab focus; empty for none.
  modeMenuFocusId: string;
  modeMenuFilterQuery: string;
  modeMenuEntries: ModeMenuEntry[];
}

interface ModeMenuReorder {
  item: ModeMenuItem | null;
  list: string | undefined;
  // The moved list's items in their new order.
  movedItems: ModeMenuItem[];
  listItems: ModeMenuItem[];
}

interface ModeMenuRenderConfig {
  // Steps back or forth through the moves made in the panel; true when there was one.
  onModeMenuHistory?(direction: 'undo' | 'redo'): unknown;
  onModeMenuGroupMove?(details: { delta: number; group: string; groups: string[] }): void;
  onModeMenuReorder?(details: ModeMenuReorder): void;
}

interface ModeMenuRenderDeps {
  view: ModeMenuView;
  modeMenuContent: HTMLElement;
  canMoveModeMenuGroups: boolean;
  canReorderModeMenu: boolean;
  config: ModeMenuRenderConfig;
  buildModeMenuSearchIndex: ModeMenuSearchApi['buildModeMenuSearchIndex'];
  normalizeModeMenuSearchText: ModeMenuSearchApi['normalizeModeMenuSearchText'];
  getModeMenuItemMatch: ModeMenuSearchApi['getModeMenuItemMatch'];
  bindModeMenuLabelTooltip: ModeMenuSearchApi['bindModeMenuLabelTooltip'];
  getModeMenuTileIcon: ModeMenuIconsApi['getModeMenuTileIcon'];
  getModeMenuTileColors: ModeMenuIconsApi['getModeMenuTileColors'];
  requestModeMenuProviderThemes: ModeMenuIconsApi['requestModeMenuProviderThemes'];
  getModeMenuLabels: ModeMenuLanguageApi['getModeMenuLabels'];
  selectModeMenuItem: ModeMenuNavigationApi['selectModeMenuItem'];
  handleMenuKeydown: (event: KeyboardEvent) => unknown;
  handleModeMenuPointerDown: (event: PointerEvent) => void;
  attachFaviconData: AttachFaviconData | null;
  updateModeMenuFooterAlignment: PrefixVisualApi['updateModeMenuFooterAlignment'];
  notifyModeMenuLayoutChange: () => void;
  input: HTMLInputElement;
  inputModeState: ModeMenuRenderState;
}

function isModeMenuItem(item: ModeMenuItem | null | undefined): item is ModeMenuItem {
  return Boolean(item && item.id && item.label);
}

function createModeMenuRender(deps: ModeMenuRenderDeps) {
  const {
    view,
    modeMenuContent,
    canMoveModeMenuGroups,
    canReorderModeMenu,
    config,
    buildModeMenuSearchIndex,
    normalizeModeMenuSearchText,
    getModeMenuItemMatch,
    bindModeMenuLabelTooltip,
    getModeMenuTileIcon,
    getModeMenuTileColors,
    requestModeMenuProviderThemes,
    getModeMenuLabels,
    selectModeMenuItem,
    handleMenuKeydown,
    handleModeMenuPointerDown,
    attachFaviconData,
    updateModeMenuFooterAlignment,
    notifyModeMenuLayoutChange,
    input
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  function findEntry(id: string): ModeMenuEntry | undefined {
    return inputModeState.modeMenuEntries.find((entry) => String(entry.item.id) === id);
  }

  const handlers: ModeMenuHandlers = {
    onSelect(id) {
      const entry = findEntry(id);
      if (entry) {
        selectModeMenuItem(entry.item, { focusAfterSelect: 'input' });
      }
    },
    onGroupMove: (groupKey, delta) => moveModeMenuGroup(groupKey, delta),
    onReorder: (id, list, orderedIds) => reorderModeMenu(id, list, orderedIds),
    onKeyDown(event) {
      handleMenuKeydown(event);
    },
    onPointerDown: (event) => handleModeMenuPointerDown(event),
    bindLabelTooltip: (button, label) => bindModeMenuLabelTooltip(button, label),
    attachIconData(image, iconUrl, iconHost) {
      if (attachFaviconData) {
        attachFaviconData(image, iconUrl, iconHost);
      }
    }
  };

  // Takes the items to show; returns those that can be shown.
  function setModeMenuItems(items: ReadonlyArray<ModeMenuItem | null | undefined> | null | undefined): ModeMenuItem[] {
    const normalizedItems = Array.isArray(items) ? items.filter(isModeMenuItem) : [];
    inputModeState.modeMenuEntries = normalizedItems.map((item) => ({
      checked: Boolean(item.active),
      group: item.group ? String(item.group) : '',
      item,
      labelText: String(item.label),
      searchIndex: buildModeMenuSearchIndex(item)
    }));
    requestModeMenuProviderThemes(normalizedItems);
    return normalizedItems;
  }

  function buildModeMenuModel(): ModeMenuModel {
    const normalizedQuery = normalizeModeMenuSearchText(inputModeState.modeMenuFilterQuery);
    return {
      open: inputModeState.modeMenuOpen,
      revealed: inputModeState.modeMenuRevealed,
      busy: inputModeState.modeMenuBusy,
      searchActive: inputModeState.modeMenuSearchActive,
      hasQuery: inputModeState.modeMenuHasQuery,
      filtered: Boolean(normalizedQuery),
      focusId: inputModeState.modeMenuFocusId,
      canMoveGroups: canMoveModeMenuGroups,
      canReorder: canReorderModeMenu,
      labels: getModeMenuLabels(),
      tiles: inputModeState.modeMenuEntries.map((entry) => {
        const item = entry.item;
        const match = getModeMenuItemMatch(entry, normalizedQuery);
        return {
          id: String(item.id),
          label: entry.labelText,
          group: entry.group,
          groupKey: item.groupKey ? String(item.groupKey) : '',
          checked: entry.checked,
          // Items of one order list drag among themselves inside their group.
          sortList: canReorderModeMenu && item.orderList && item.orderList !== 'pinned'
            ? String(item.orderList)
            : '',
          hidden: !match.matched,
          ranges: match.ranges,
          icon: getModeMenuTileIcon(item),
          colors: getModeMenuTileColors(item)
        };
      })
    };
  }

  // Draws the menu from the state; returns the model drawn.
  function renderModeMenuView(): ModeMenuModel {
    const model = buildModeMenuModel();
    view.render(model, handlers);
    return model;
  }

  // While the panel is open, Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z step back and
  // forth through the moves made in it. The host answers whether it had a
  // step to take; when it had none, the keys keep their usual meaning.
  function handleModeMenuHistoryKeydown(event: KeyboardEvent): void {
    if (!inputModeState.modeMenuOpen || event.altKey || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    const key = String(event.key || '').toLowerCase();
    let direction: '' | 'undo' | 'redo' = '';
    if (key === 'z') {
      direction = event.shiftKey ? 'redo' : 'undo';
    } else if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
      direction = 'redo';
    }
    if (direction && typeof config.onModeMenuHistory === 'function' && config.onModeMenuHistory(direction) === true) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // The keys of the groups in the order their titles show.
  function getModeMenuGroupKeys(): string[] {
    const keys: string[] = [];
    let previousGroup = '';
    inputModeState.modeMenuEntries.forEach((entry) => {
      if (entry.group && entry.group !== previousGroup) {
        keys.push(entry.item.groupKey ? String(entry.item.groupKey) : '');
        previousGroup = entry.group;
      }
    });
    return keys.filter(Boolean);
  }

  // The host stores the new group order and refreshes the menu.
  function moveModeMenuGroup(groupKey: string, delta: number): void {
    if (typeof config.onModeMenuGroupMove !== 'function') {
      return;
    }
    config.onModeMenuGroupMove({
      delta,
      group: groupKey,
      groups: getModeMenuGroupKeys()
    });
  }

  // A tile dropped in a new place among its list's tiles: they take their
  // new order where the last of them was. The host stores the order through
  // `onModeMenuReorder` and may refresh the menu afterwards.
  function reorderModeMenu(id: string, list: string, orderedIds: string[]): void {
    const entries = inputModeState.modeMenuEntries;
    const moved = orderedIds
      .map((orderedId) => findEntry(orderedId))
      .filter((entry): entry is ModeMenuEntry => Boolean(entry));
    if (moved.length === 0) {
      return;
    }
    const movedSet = new Set(moved);
    let lastIndex = -1;
    entries.forEach((entry, index) => {
      if (movedSet.has(entry)) {
        lastIndex = index;
      }
    });
    inputModeState.modeMenuEntries = [
      ...entries.slice(0, lastIndex + 1).filter((entry) => !movedSet.has(entry)),
      ...moved,
      ...entries.slice(lastIndex + 1)
    ];
    renderModeMenuView();
    if (typeof config.onModeMenuReorder !== 'function') {
      return;
    }
    const entry = findEntry(id);
    config.onModeMenuReorder({
      item: entry ? entry.item : null,
      list,
      movedItems: moved.map((movedEntry) => movedEntry.item),
      listItems: inputModeState.modeMenuEntries
        .filter((candidate) => candidate.item.orderList === list)
        .map((candidate) => candidate.item)
    });
  }

  // Marks the mode as the selected one; false when the menu does not show it.
  function setModeMenuSelection(modeId: string): boolean {
    const selectedModeId = String(modeId || '');
    let matched = false;
    inputModeState.modeMenuEntries.forEach((entry) => {
      entry.checked = Boolean(selectedModeId && String(entry.item.id) === selectedModeId);
      matched = matched || entry.checked;
    });
    renderModeMenuView();
    return matched;
  }

  function refreshModeMenuSearchIndexes(): void {
    if (inputModeState.modeMenuEntries.length === 0) {
      return;
    }
    inputModeState.modeMenuEntries.forEach((entry) => {
      entry.searchIndex = buildModeMenuSearchIndex(entry.item);
    });
    if (normalizeModeMenuSearchText(inputModeState.modeMenuFilterQuery)) {
      applyModeMenuFilter(inputModeState.modeMenuFilterQuery, { preserveScroll: true });
    }
  }

  // Shows only the items that match; returns how many do.
  function applyModeMenuFilter(query: unknown, filterOptions?: { preserveScroll?: boolean } | null): number {
    inputModeState.modeMenuFilterQuery = String(query || '');
    const model = renderModeMenuView();
    if (!filterOptions || filterOptions.preserveScroll !== true) {
      modeMenuContent.scrollTop = 0;
    }
    updateModeMenuFooterAlignment();
    notifyModeMenuLayoutChange();
    return model.tiles.filter((tile) => !tile.hidden).length;
  }

  // The panel lifts a little while the input has text.
  function syncModeMenuQueryLift(): void {
    const hasQuery = Boolean(String(input.value || '').trim());
    if (hasQuery !== inputModeState.modeMenuHasQuery) {
      inputModeState.modeMenuHasQuery = hasQuery;
      renderModeMenuView();
    }
  }

  return {
    setModeMenuItems,
    renderModeMenuView,
    handleModeMenuHistoryKeydown,
    refreshModeMenuSearchIndexes,
    applyModeMenuFilter,
    syncModeMenuQueryLift,
    setModeMenuSelection
  };
}

type ModeMenuRenderApi = ReturnType<typeof createModeMenuRender>;

export { createModeMenuRender };
export type { ModeMenuReorder, ModeMenuRenderApi, ModeMenuRenderConfig, ModeMenuRenderDeps, ModeMenuRenderState };
