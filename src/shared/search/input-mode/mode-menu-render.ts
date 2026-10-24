// @ts-nocheck
// Rendering the mode menu: its groups and items, history keys, moving and
// reordering groups, and applying the filter.
import * as LumnoSortableDrag from '../../ui/sortable-drag';
import {
  createEmptyStateArt,
  ensureEmptyStateArtStyles,
  resolveEmptyStateArtTheme
} from '../../ui/empty-state-art';

function createModeMenuRender(deps) {
  const {
    clearModeMenuContents,
    doc,
    canMoveModeMenuGroups,
    canReorderModeMenu,
    createModeMenuIcon,
    createModeMenuLabel,
    bindModeMenuLabelTooltip,
    selectModeMenuItem,
    buildModeMenuSearchIndex,
    applyNoTranslate,
    formatMessage,
    modeMenu,
    config,
    normalizeModeMenuSearchText,
    refreshModeMenuFilterText,
    getModeMenuItemMatch,
    renderModeMenuLabelMatch,
    updateModeMenuFooterAlignment,
    notifyModeMenuLayoutChange,
    input,
    setStyle,
    useImportantStyles
  } = deps;

  // The controller state object shared with search-input-mode.js and the other modules.
  const inputModeState = deps.inputModeState;

  let renderedModeMenuGroups = [];
  let modeMenuEmptyState = null;

  function renderModeMenu(items) {
    clearModeMenuContents();
    inputModeState.renderedModeMenuEntries = [];
    renderedModeMenuGroups = [];
    modeMenuEmptyState = null;
    const normalizedItems = Array.isArray(items)
      ? items.filter((item) => item && item.id && item.label)
      : [];
    let previousGroup = '';
    normalizedItems.forEach((item) => {
      const group = item.group ? String(item.group) : '';
      if (group && group !== previousGroup) {
        const groupLabel = doc.createElement('div');
        groupLabel.className = 'x-lumno-search-input-mode__menu-group';
        groupLabel.setAttribute('aria-hidden', 'true');
        groupLabel.setAttribute('role', 'presentation');
        const groupKey = item.groupKey ? String(item.groupKey) : '';
        if (canMoveModeMenuGroups && groupKey) {
          groupLabel.dataset.groupKey = groupKey;
          const title = doc.createElement('span');
          title.textContent = group;
          groupLabel.appendChild(title);
          groupLabel.appendChild(createModeMenuGroupMoveControls(groupKey));
        } else {
          groupLabel.textContent = group;
        }
        inputModeState.modeMenuContent.appendChild(groupLabel);
        renderedModeMenuGroups.push({
          element: groupLabel,
          group,
          groupKey,
          visibleCount: 0
        });
        previousGroup = group;
      }
      const button = doc.createElement('button');
      button.className = 'x-lumno-search-input-mode__menu-item';
      button.type = 'button';
      button.tabIndex = -1;
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', item.active ? 'true' : 'false');
      button.setAttribute('aria-label', String(item.label));
      button.setAttribute('data-label-truncated', 'false');
      button.dataset.modeId = String(item.id);
      // Items of one order list drag among themselves inside their group.
      if (canReorderModeMenu && item.orderList && item.orderList !== 'pinned') {
        button.dataset.sortList = String(item.orderList);
      }
      button.appendChild(createModeMenuIcon(item, button));
      const label = createModeMenuLabel(item.label);
      button.appendChild(label);
      bindModeMenuLabelTooltip(button, label, item.label);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectModeMenuItem(item, { focusAfterSelect: 'input' });
      });
      inputModeState.modeMenuContent.appendChild(button);
      inputModeState.renderedModeMenuEntries.push({
        button,
        group,
        item,
        label,
        labelText: String(item.label),
        searchIndex: buildModeMenuSearchIndex(item)
      });
    });
    syncModeMenuGroupMoveControls();
    modeMenuEmptyState = applyNoTranslate(doc.createElement('div'));
    modeMenuEmptyState.className = 'x-lumno-search-input-mode__menu-empty';
    modeMenuEmptyState.setAttribute('role', 'status');
    // The words sit in their own element, so relocalizing them keeps the art.
    const modeMenuEmptyText = doc.createElement('span');
    modeMenuEmptyText.setAttribute('data-i18n', 'overlay_empty_result');
    modeMenuEmptyText.textContent = formatMessage(
      'overlay_empty_result',
      'No matching results'
    );
    modeMenuEmptyState.append(
      createEmptyStateArt(doc, 'noResults', { size: 96 }),
      modeMenuEmptyText
    );
    modeMenuEmptyState.hidden = true;
    inputModeState.modeMenuContent.appendChild(modeMenuEmptyState);
    applyModeMenuFilter(inputModeState.modeMenuFilterQuery, { preserveScroll: true });
    return normalizedItems;
  }

  // While the panel is open, Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z step back and
  // forth through the moves made in it. The host answers whether it had a
  // step to take; when it had none, the keys keep their usual meaning.
  function handleModeMenuHistoryKeydown(event) {
    if (!inputModeState.modeMenuOpen || modeMenu.hidden || event.altKey || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    const key = String(event.key || '').toLowerCase();
    let direction = '';
    if (key === 'z') {
      direction = event.shiftKey ? 'redo' : 'undo';
    } else if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
      direction = 'redo';
    }
    if (direction && config.onModeMenuHistory(direction) === true) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // Hovering a group title shows move up and move down for the whole block.
  // The host stores the new group order and refreshes the menu.
  function createModeMenuGroupMoveControls(groupKey) {
    const controls = doc.createElement('span');
    controls.className = 'x-lumno-search-input-mode__menu-group-move';
    [['up', -1, 'ri-arrow-up-s-line', 'settings_search_source_move_up', 'Move up'],
      ['down', 1, 'ri-arrow-down-s-line', 'settings_search_source_move_down', 'Move down']]
      .forEach(([direction, delta, iconClass, messageKey, fallback]) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.className = 'x-lumno-search-input-mode__menu-group-move-button';
        button.dataset.groupMove = direction;
        const label = formatMessage(messageKey, fallback);
        button.setAttribute('aria-label', label);
        button.title = label;
        const icon = doc.createElement('i');
        icon.className = `ri-icon ri-size-14 ${iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (button.disabled) {
            return;
          }
          config.onModeMenuGroupMove({
            delta,
            group: groupKey,
            groups: renderedModeMenuGroups.map((entry) => entry.groupKey).filter(Boolean)
          });
        });
        controls.appendChild(button);
      });
    return controls;
  }

  function syncModeMenuGroupMoveControls() {
    const movable = renderedModeMenuGroups.filter((entry) => entry.groupKey);
    movable.forEach((entry, index) => {
      entry.element.querySelectorAll('[data-group-move]').forEach((button) => {
        button.disabled = button.dataset.groupMove === 'up'
          ? index === 0
          : index === movable.length - 1;
      });
    });
  }

  // Dragging a tile reorders it among the tiles of its own order list in its
  // group (custom searches among custom ones, built-ins among built-ins).
  // The tiles move at once; the host stores the order through
  // `onModeMenuReorder` and may refresh the menu afterwards.
  function attachModeMenuReorder() {
    const sortable = LumnoSortableDrag;
    if (!canReorderModeMenu || !sortable || typeof sortable.attach !== 'function') {
      return () => {};
    }
    const getEntry = (button) => inputModeState.renderedModeMenuEntries.find((entry) => entry.button === button);
    return sortable.attach(inputModeState.modeMenuContent, {
      itemSelector: '.x-lumno-search-input-mode__menu-item[data-sort-list]',
      canStart: () => inputModeState.modeMenuOpen && modeMenu.getAttribute('data-filtered') !== 'true',
      getPeers: (button) => {
        const entry = getEntry(button);
        if (!entry) {
          return [];
        }
        return inputModeState.renderedModeMenuEntries
          .filter((candidate) => (
            candidate.group === entry.group &&
            !candidate.button.hidden &&
            candidate.button.dataset.sortList === button.dataset.sortList
          ))
          .map((candidate) => candidate.button);
      },
      onReorder: (button, fromIndex, toIndex, peers) => {
        const moved = peers.slice();
        moved.splice(toIndex, 0, moved.splice(fromIndex, 1)[0]);
        const anchor = peers[peers.length - 1].nextSibling;
        moved.forEach((peer) => inputModeState.modeMenuContent.insertBefore(peer, anchor));
        inputModeState.renderedModeMenuEntries.sort((left, right) => (
          left.button.compareDocumentPosition(right.button) & 4 ? -1 : 1
        ));
        const entry = getEntry(button);
        const listId = button.dataset.sortList;
        config.onModeMenuReorder({
          item: entry ? entry.item : null,
          list: listId,
          movedItems: moved.map((peer) => getEntry(peer).item),
          listItems: inputModeState.renderedModeMenuEntries
            .filter((candidate) => candidate.button.dataset.sortList === listId)
            .map((candidate) => candidate.item)
        });
      }
    });
  }

  function refreshModeMenuSearchIndexes() {
    if (inputModeState.renderedModeMenuEntries.length === 0) {
      return;
    }
    inputModeState.renderedModeMenuEntries.forEach((entry) => {
      entry.searchIndex = buildModeMenuSearchIndex(entry.item);
    });
    if (normalizeModeMenuSearchText(inputModeState.modeMenuFilterQuery)) {
      applyModeMenuFilter(inputModeState.modeMenuFilterQuery, { preserveScroll: true });
    }
  }

  function applyModeMenuFilter(query, filterOptions) {
    inputModeState.modeMenuFilterQuery = String(query || '');
    refreshModeMenuFilterText();
    const normalizedQuery = normalizeModeMenuSearchText(inputModeState.modeMenuFilterQuery);
    modeMenu.setAttribute('data-filtered', normalizedQuery ? 'true' : 'false');
    renderedModeMenuGroups.forEach((group) => {
      group.visibleCount = 0;
    });
    let visibleCount = 0;
    inputModeState.renderedModeMenuEntries.forEach((entry) => {
      const match = getModeMenuItemMatch(entry, normalizedQuery);
      entry.button.hidden = !match.matched;
      entry.button.tabIndex = -1;
      renderModeMenuLabelMatch(
        entry.label,
        entry.labelText,
        match.ranges
      );
      if (!match.matched) {
        return;
      }
      visibleCount += 1;
      const groupRecord = renderedModeMenuGroups.find((group) => (
        group.group === entry.group
      ));
      if (groupRecord) {
        groupRecord.visibleCount += 1;
      }
    });
    renderedModeMenuGroups.forEach((group) => {
      group.element.hidden = group.visibleCount === 0;
    });
    if (modeMenuEmptyState) {
      modeMenuEmptyState.hidden = visibleCount > 0;
      const art = modeMenuEmptyState.firstElementChild;
      if (visibleCount === 0 && art) {
        // The page's theme may have changed since the menu was built.
        art.setAttribute('data-theme', resolveEmptyStateArtTheme(modeMenu || input));
        ensureEmptyStateArtStyles(art);
      }
    }
    if (!filterOptions || filterOptions.preserveScroll !== true) {
      inputModeState.modeMenuContent.scrollTop = 0;
    }
    updateModeMenuFooterAlignment();
    notifyModeMenuLayoutChange();
    return visibleCount;
  }

  function syncModeMenuQueryLift() {
    const hasQuery = Boolean(String(input.value || '').trim());
    modeMenu.setAttribute('data-has-query', hasQuery ? 'true' : 'false');
    setStyle(
      modeMenu,
      '--x-lumno-search-mode-menu-lift',
      hasQuery ? '-8px' : '0px',
      useImportantStyles
    );
  }

  return {
    renderModeMenu,
    handleModeMenuHistoryKeydown,
    attachModeMenuReorder,
    refreshModeMenuSearchIndexes,
    applyModeMenuFilter,
    syncModeMenuQueryLift
  };
}

export { createModeMenuRender };
