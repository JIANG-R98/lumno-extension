// The picker's element ids, layering and floating window limits.

const ROOT_ID = '__lumno_document_pip_picker_root_2026__';
const TOAST_HOST_ID = '__lumno_document_pip_toast_2026__';
const HIGHLIGHT_ID = '__lumno_document_pip_highlight_2026__';
const PICKER_HIGHLIGHT_PADDING = 4;
const PIP_DOCK_CLEARANCE = 56;
const PIP_CARD_GUTTER = 12;
const PIP_MIN_WIDTH = 320;
const PIP_MAX_WIDTH = 1200;
const PIP_MIN_HEIGHT = 180;
const PIP_MAX_HEIGHT = 900;
const PIP_SYNC_DELAY_MS = 80;
const PIP_STYLE_ANCHOR_ID = '__lumno_pip_style_anchor_2026__';
const PICKER_Z_INDEX = '2147483646';
const CONTEXT_LAYOUT_RESET: ReadonlyArray<readonly [string, string]> = [
  ['display', 'block'],
  ['position', 'static'],
  ['float', 'none'],
  ['width', 'auto'],
  ['min-width', '0'],
  ['max-width', 'none'],
  ['height', 'auto'],
  ['min-height', '0'],
  ['max-height', 'none'],
  ['margin', '0'],
  ['padding', '0'],
  ['border', '0'],
  ['box-shadow', 'none'],
  ['overflow', 'visible'],
  ['transform', 'none'],
  ['contain', 'none']
];

export {
  CONTEXT_LAYOUT_RESET,
  HIGHLIGHT_ID,
  PICKER_HIGHLIGHT_PADDING,
  PICKER_Z_INDEX,
  PIP_CARD_GUTTER,
  PIP_DOCK_CLEARANCE,
  PIP_MAX_HEIGHT,
  PIP_MAX_WIDTH,
  PIP_MIN_HEIGHT,
  PIP_MIN_WIDTH,
  PIP_STYLE_ANCHOR_ID,
  PIP_SYNC_DELAY_MS,
  ROOT_ID,
  TOAST_HOST_ID
};
