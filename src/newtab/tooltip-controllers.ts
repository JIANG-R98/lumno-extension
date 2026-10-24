// The shared tooltip controllers the page's surfaces bind to: top actions,
// shortcuts, the shortcut dialog, bookmark cascade copy, bookmark cards and
// the search input's cursor tooltip.
import * as LumnoCursorTooltip from '../shared/ui/cursor-tooltip';
import * as LumnoTooltip from '../shared/ui/tooltip';

function createTooltipControllers(deps) {
  const topActionTooltipController = LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_top_action_tooltip_2026_unique_',
    appendTo: document.body,
    maxWidth: 420
  });
  const shortcutTooltipController = LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_shortcut_tooltip_2026_unique_',
    className: 'x-nt-shortcut-tooltip',
    appendTo: document.body,
    maxWidth: 360
  });
  const shortcutDialogTooltipController = LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_shortcut_dialog_tooltip_2026_unique_',
    className: 'x-nt-shortcut-dialog-tooltip',
    appendTo: document.body,
    maxWidth: 320
  });
  const bookmarkCascadeCopyTooltipController = LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_bookmark_cascade_copy_tooltip_2026_unique_',
    className: 'x-nt-bookmark-cascade-copy-tooltip',
    appendTo: document.body,
    maxWidth: 200
  });
  const bookmarkCursorTooltipController = LumnoCursorTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_bookmark_cursor_tooltip_2026_unique_',
    className: 'x-nt-bookmark-cursor-tooltip',
    appendTo: document.body,
    maxWidth: 460,
    offsetX: 14,
    offsetY: 16
  });
  const searchInputCursorTooltipController = LumnoCursorTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_newtab_search_input_cursor_tooltip_2026_unique_',
    appendTo: document.body,
    maxWidth: 520,
    offsetX: 14,
    offsetY: 16
  });

  return {
    topActionTooltipController,
    shortcutTooltipController,
    shortcutDialogTooltipController,
    bookmarkCascadeCopyTooltipController,
    bookmarkCursorTooltipController,
    searchInputCursorTooltipController
  };
}

export { createTooltipControllers };
