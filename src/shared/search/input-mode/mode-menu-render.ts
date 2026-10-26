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

interface ModeMenuRenderContext {
  readonly view: ModeMenuRenderDeps['view'];
  readonly modeMenuContent: ModeMenuRenderDeps['modeMenuContent'];
  readonly canMoveModeMenuGroups: ModeMenuRenderDeps['canMoveModeMenuGroups'];
  readonly canReorderModeMenu: ModeMenuRenderDeps['canReorderModeMenu'];
  readonly config: ModeMenuRenderDeps['config'];
  readonly buildModeMenuSearchIndex: ModeMenuRenderDeps['buildModeMenuSearchIndex'];
  readonly normalizeModeMenuSearchText: ModeMenuRenderDeps['normalizeModeMenuSearchText'];
  readonly getModeMenuItemMatch: ModeMenuRenderDeps['getModeMenuItemMatch'];
  readonly bindModeMenuLabelTooltip: ModeMenuRenderDeps['bindModeMenuLabelTooltip'];
  readonly getModeMenuTileIcon: ModeMenuRenderDeps['getModeMenuTileIcon'];
  readonly getModeMenuTileColors: ModeMenuRenderDeps['getModeMenuTileColors'];
  readonly requestModeMenuProviderThemes: ModeMenuRenderDeps['requestModeMenuProviderThemes'];
  readonly getModeMenuLabels: ModeMenuRenderDeps['getModeMenuLabels'];
  readonly selectModeMenuItem: ModeMenuRenderDeps['selectModeMenuItem'];
  readonly handleMenuKeydown: ModeMenuRenderDeps['handleMenuKeydown'];
  readonly handleModeMenuPointerDown: ModeMenuRenderDeps['handleModeMenuPointerDown'];
  readonly attachFaviconData: ModeMenuRenderDeps['attachFaviconData'];
  readonly updateModeMenuFooterAlignment: ModeMenuRenderDeps['updateModeMenuFooterAlignment'];
  readonly notifyModeMenuLayoutChange: ModeMenuRenderDeps['notifyModeMenuLayoutChange'];
  readonly input: ModeMenuRenderDeps['input'];
  readonly inputModeState: ModeMenuRenderDeps['inputModeState'];
  readonly handlers: ModeMenuHandlers;
}

function findEntry(ctx: ModeMenuRenderContext, id: string): ModeMenuEntry | undefined {
  return ctx.inputModeState.modeMenuEntries.find((entry) => String(entry.item.id) === id);
}

// Takes the items to show; returns those that can be shown.
function setModeMenuItems(ctx: ModeMenuRenderContext, items: ReadonlyArray<ModeMenuItem | null | undefined> | null | undefined): ModeMenuItem[] {
  const normalizedItems = Array.isArray(items) ? items.filter(isModeMenuItem) : [];
  ctx.inputModeState.modeMenuEntries = normalizedItems.map((item) => ({
    checked: Boolean(item.active),
    group: item.group ? String(item.group) : '',
    item,
    labelText: String(item.label),
    searchIndex: ctx.buildModeMenuSearchIndex(item)
  }));
  ctx.requestModeMenuProviderThemes(normalizedItems);
  return normalizedItems;
}

function buildModeMenuModel(ctx: ModeMenuRenderContext): ModeMenuModel {
  const normalizedQuery = ctx.normalizeModeMenuSearchText(ctx.inputModeState.modeMenuFilterQuery);
  return {
    open: ctx.inputModeState.modeMenuOpen,
    revealed: ctx.inputModeState.modeMenuRevealed,
    busy: ctx.inputModeState.modeMenuBusy,
    searchActive: ctx.inputModeState.modeMenuSearchActive,
    hasQuery: ctx.inputModeState.modeMenuHasQuery,
    filtered: Boolean(normalizedQuery),
    focusId: ctx.inputModeState.modeMenuFocusId,
    canMoveGroups: ctx.canMoveModeMenuGroups,
    canReorder: ctx.canReorderModeMenu,
    labels: ctx.getModeMenuLabels(),
    tiles: ctx.inputModeState.modeMenuEntries.map((entry) => {
      const item = entry.item;
      const match = ctx.getModeMenuItemMatch(entry, normalizedQuery);
      return {
        id: String(item.id),
        label: entry.labelText,
        group: entry.group,
        groupKey: item.groupKey ? String(item.groupKey) : '',
        checked: entry.checked,
        // Items of one order list drag among themselves inside their group.
        sortList: ctx.canReorderModeMenu && item.orderList && item.orderList !== 'pinned'
          ? String(item.orderList)
          : '',
        hidden: !match.matched,
        ranges: match.ranges,
        icon: ctx.getModeMenuTileIcon(item),
        colors: ctx.getModeMenuTileColors(item)
      };
    })
  };
}

// Draws the menu from the state; returns the model drawn.
function renderModeMenuView(ctx: ModeMenuRenderContext): ModeMenuModel {
  const model = buildModeMenuModel(ctx);
  ctx.view.render(model, ctx.handlers);
  return model;
}

// While the panel is open, Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z step back and
// forth through the moves made in it. The host answers whether it had a
// step to take; when it had none, the keys keep their usual meaning.
function handleModeMenuHistoryKeydown(ctx: ModeMenuRenderContext, event: KeyboardEvent): void {
  if (!ctx.inputModeState.modeMenuOpen || event.altKey || !(event.metaKey || event.ctrlKey)) {
    return;
  }
  const key = String(event.key || '').toLowerCase();
  let direction: '' | 'undo' | 'redo' = '';
  if (key === 'z') {
    direction = event.shiftKey ? 'redo' : 'undo';
  } else if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
    direction = 'redo';
  }
  if (direction && typeof ctx.config.onModeMenuHistory === 'function' && ctx.config.onModeMenuHistory(direction) === true) {
    event.preventDefault();
    event.stopPropagation();
  }
}

// The keys of the groups in the order their titles show.
function getModeMenuGroupKeys(ctx: ModeMenuRenderContext): string[] {
  const keys: string[] = [];
  let previousGroup = '';
  ctx.inputModeState.modeMenuEntries.forEach((entry) => {
    if (entry.group && entry.group !== previousGroup) {
      keys.push(entry.item.groupKey ? String(entry.item.groupKey) : '');
      previousGroup = entry.group;
    }
  });
  return keys.filter(Boolean);
}

// The host stores the new group order and refreshes the menu.
function moveModeMenuGroup(ctx: ModeMenuRenderContext, groupKey: string, delta: number): void {
  if (typeof ctx.config.onModeMenuGroupMove !== 'function') {
    return;
  }
  ctx.config.onModeMenuGroupMove({
    delta,
    group: groupKey,
    groups: getModeMenuGroupKeys(ctx)
  });
}

// A tile dropped in a new place among its list's tiles: they take their
// new order where the last of them was. The host stores the order through
// `onModeMenuReorder` and may refresh the menu afterwards.
function reorderModeMenu(ctx: ModeMenuRenderContext, id: string, list: string, orderedIds: string[]): void {
  const entries = ctx.inputModeState.modeMenuEntries;
  const moved = orderedIds
    .map((orderedId) => findEntry(ctx, orderedId))
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
  ctx.inputModeState.modeMenuEntries = [
    ...entries.slice(0, lastIndex + 1).filter((entry) => !movedSet.has(entry)),
    ...moved,
    ...entries.slice(lastIndex + 1)
  ];
  renderModeMenuView(ctx);
  if (typeof ctx.config.onModeMenuReorder !== 'function') {
    return;
  }
  const entry = findEntry(ctx, id);
  ctx.config.onModeMenuReorder({
    item: entry ? entry.item : null,
    list,
    movedItems: moved.map((movedEntry) => movedEntry.item),
    listItems: ctx.inputModeState.modeMenuEntries
      .filter((candidate) => candidate.item.orderList === list)
      .map((candidate) => candidate.item)
  });
}

// Marks the mode as the selected one; false when the menu does not show it.
function setModeMenuSelection(ctx: ModeMenuRenderContext, modeId: string): boolean {
  const selectedModeId = String(modeId || '');
  let matched = false;
  ctx.inputModeState.modeMenuEntries.forEach((entry) => {
    entry.checked = Boolean(selectedModeId && String(entry.item.id) === selectedModeId);
    matched = matched || entry.checked;
  });
  renderModeMenuView(ctx);
  return matched;
}

function refreshModeMenuSearchIndexes(ctx: ModeMenuRenderContext): void {
  if (ctx.inputModeState.modeMenuEntries.length === 0) {
    return;
  }
  ctx.inputModeState.modeMenuEntries.forEach((entry) => {
    entry.searchIndex = ctx.buildModeMenuSearchIndex(entry.item);
  });
  if (ctx.normalizeModeMenuSearchText(ctx.inputModeState.modeMenuFilterQuery)) {
    applyModeMenuFilter(ctx, ctx.inputModeState.modeMenuFilterQuery, { preserveScroll: true });
  }
}

// Shows only the items that match; returns how many do.
function applyModeMenuFilter(ctx: ModeMenuRenderContext, query: unknown, filterOptions?: { preserveScroll?: boolean } | null): number {
  ctx.inputModeState.modeMenuFilterQuery = String(query || '');
  const model = renderModeMenuView(ctx);
  if (!filterOptions || filterOptions.preserveScroll !== true) {
    ctx.modeMenuContent.scrollTop = 0;
  }
  ctx.updateModeMenuFooterAlignment();
  ctx.notifyModeMenuLayoutChange();
  return model.tiles.filter((tile) => !tile.hidden).length;
}

// The panel lifts a little while the input has text.
function syncModeMenuQueryLift(ctx: ModeMenuRenderContext): void {
  const hasQuery = Boolean(String(ctx.input.value || '').trim());
  if (hasQuery !== ctx.inputModeState.modeMenuHasQuery) {
    ctx.inputModeState.modeMenuHasQuery = hasQuery;
    renderModeMenuView(ctx);
  }
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

  const handlers: ModeMenuHandlers = {
    onSelect(id) {
      const entry = findEntry(ctx, id);
      if (entry) {
        ctx.selectModeMenuItem(entry.item, { focusAfterSelect: 'input' });
      }
    },
    onGroupMove: (groupKey, delta) => moveModeMenuGroup(ctx, groupKey, delta),
    onReorder: (id, list, orderedIds) => reorderModeMenu(ctx, id, list, orderedIds),
    onKeyDown(event) {
      ctx.handleMenuKeydown(event);
    },
    onPointerDown: (event) => ctx.handleModeMenuPointerDown(event),
    bindLabelTooltip: (button, label) => ctx.bindModeMenuLabelTooltip(button, label),
    attachIconData(image, iconUrl, iconHost) {
      if (ctx.attachFaviconData) {
        ctx.attachFaviconData(image, iconUrl, iconHost);
      }
    }
  };
  const ctx: ModeMenuRenderContext = {
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
    input,
    inputModeState,
    handlers
  };

  return {
    setModeMenuItems: (items: ReadonlyArray<ModeMenuItem | null | undefined> | null | undefined) => setModeMenuItems(ctx, items),
    renderModeMenuView: () => renderModeMenuView(ctx),
    handleModeMenuHistoryKeydown: (event: KeyboardEvent) => handleModeMenuHistoryKeydown(ctx, event),
    refreshModeMenuSearchIndexes: () => refreshModeMenuSearchIndexes(ctx),
    applyModeMenuFilter: (query: unknown, filterOptions?: { preserveScroll?: boolean } | null) => applyModeMenuFilter(ctx, query, filterOptions),
    syncModeMenuQueryLift: () => syncModeMenuQueryLift(ctx),
    setModeMenuSelection: (modeId: string) => setModeMenuSelection(ctx, modeId)
  };
}

type ModeMenuRenderApi = ReturnType<typeof createModeMenuRender>;

export { createModeMenuRender };
export type { ModeMenuReorder, ModeMenuRenderApi, ModeMenuRenderConfig, ModeMenuRenderDeps, ModeMenuRenderState };
