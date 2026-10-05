(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabCrossSurfaceDrag = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const BOOKMARK_TREE_ROOT_ID = '0';

  // Nearest-row insertion slot for a wrapping grid. `layoutItems` are
  // [{ rect }] in DOM order; the returned index is a position in that list.
  function getRowInsertionSlot(layoutItems, pointerX, pointerY) {
    const items = Array.isArray(layoutItems) ? layoutItems : [];
    if (!items.length || !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
      return { index: 0, anchorIndex: -1, markerPosition: 'before' };
    }
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    items.forEach((item, itemIndex) => {
      const rect = item.rect;
      const verticalDistance = pointerY < rect.top
        ? rect.top - pointerY
        : pointerY > rect.bottom
          ? pointerY - rect.bottom
          : 0;
      if (verticalDistance < nearestDistance) {
        nearestDistance = verticalDistance;
        nearestIndex = itemIndex;
      }
    });
    const nearestRect = items[nearestIndex].rect;
    const rowIndexes = items
      .map((item, itemIndex) => itemIndex)
      .filter((itemIndex) => {
        const rect = items[itemIndex].rect;
        return Math.abs(rect.centerY - nearestRect.centerY) <=
          Math.max(8, Math.min(rect.height, nearestRect.height) / 2);
      })
      .sort((first, second) => items[first].rect.left - items[second].rect.left);
    const anchorIndex = rowIndexes.find((itemIndex) => pointerX < items[itemIndex].rect.centerX);
    if (anchorIndex !== undefined) {
      return { index: anchorIndex, anchorIndex, markerPosition: 'before' };
    }
    const lastRowIndex = rowIndexes[rowIndexes.length - 1];
    return { index: lastRowIndex + 1, anchorIndex: lastRowIndex, markerPosition: 'after' };
  }

  function isBookmarkFolderDropTarget(folderId, nodeMap) {
    const id = String(folderId || '');
    const node = id && nodeMap && typeof nodeMap.get === 'function'
      ? nodeMap.get(id)
      : null;
    return Boolean(node && !node.url && id !== BOOKMARK_TREE_ROOT_ID);
  }

  // Inserts `record` at `index`, or moves the shortcut that already has its
  // URL there instead of duplicating it. Returns null when the list is full.
  function planBookmarkToShortcut(options) {
    const config = options && typeof options === 'object' ? options : {};
    const shortcuts = Array.isArray(config.shortcuts) ? config.shortcuts.filter(Boolean) : [];
    const record = config.record;
    const folderId = (item) => typeof config.getFolderId === 'function' ? config.getFolderId(item) : item.folderId;
    const index = Number(config.index);
    if (!record || !(record.url || (record.type === 'folder' && (record.folderId || record.folderRef))) || !Number.isFinite(index)) {
      return null;
    }
    const existingIndex = shortcuts.findIndex((item) => record.type === 'folder'
      ? item.type === 'folder' && (item.id === record.id || (folderId(record) && folderId(item) === folderId(record)))
      : item.type !== 'folder' && item.url === record.url);
    if (existingIndex < 0 && shortcuts.length >= Number(config.maxShortcuts)) {
      return null;
    }
    const nextShortcuts = shortcuts.slice();
    const shortcut = existingIndex < 0
      ? record
      : nextShortcuts.splice(existingIndex, 1)[0];
    const insertionIndex = existingIndex >= 0 && index > existingIndex ? index - 1 : index;
    nextShortcuts.splice(Math.max(0, Math.min(nextShortcuts.length, insertionIndex)), 0, shortcut);
    return {
      shortcuts: nextShortcuts,
      shortcutId: String(shortcut.id || '')
    };
  }

  function planTransferShortcuts(options) {
    const config = options || {};
    const next = Array.isArray(config.shortcuts) ? config.shortcuts.slice() : [];
    const source = config.source && config.source.snapshot;
    const destination = config.destination && config.destination.snapshot;
    if (source) {
      const index = next.findIndex((item) => item.id === source.id);
      if (index < 0 || next[index].type !== source.type ||
          (source.type !== 'folder' &&
            (next[index].url !== source.url || next[index].title !== source.title))) {
        return null;
      }
      next.splice(index, 1);
    }
    if (destination) {
      const duplicate = next.some((item) => item.id === destination.id ||
        (destination.type !== 'folder' && item.type !== 'folder' && item.url === destination.url) ||
        (destination.type === 'folder' && !destination.folderRef &&
          item.type === 'folder' && !item.folderRef && item.folderId === destination.folderId));
      if (duplicate || next.length >= Number(config.maxShortcuts)) {
        return null;
      }
      next.splice(Math.min(config.destination.index, next.length), 0, destination);
    }
    return next;
  }

  function planShortcutReorder(options) {
    const config = options || {};
    const shortcuts = Array.isArray(config.shortcuts) ? config.shortcuts : [];
    const order = Array.isArray(config.order) ? config.order : [];
    const ids = new Set(order);
    const byId = new Map(shortcuts.map((item) => [item.id, item]));
    if (!order.length || ids.size !== order.length || order.some((id) => !byId.has(id))) {
      return null;
    }
    const currentOrder = shortcuts.filter((item) => ids.has(item.id)).map((item) => item.id);
    if (config.sourceOrder && (config.sourceOrder.length !== currentOrder.length ||
        currentOrder.some((id, index) => id !== config.sourceOrder[index]))) {
      return null;
    }
    let index = 0;
    // Reorder the recorded entries in their current slots, preserving newer
    // shortcuts and the latest titles, icons and folder bindings.
    return shortcuts.map((item) => ids.has(item.id) ? byId.get(order[index++]) : item);
  }

  return Object.freeze({
    getRowInsertionSlot,
    isBookmarkFolderDropTarget,
    planBookmarkToShortcut,
    planTransferShortcuts,
    planShortcutReorder
  });
});
