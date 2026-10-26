// The toolbar's ids, timings, host isolation styles and fixed actions.
import type { SelectionAction } from '../../domain/selection-intent';

const HOST_ID = '_x_extension_selection_quick_actions_host_2026_unique_';
const DEVELOPMENT_EXTENSION_ID = 'kkcjcneagmlhpeaafngjdlpcfjakejgb';
const RUNTIME_REVISION = 'selection-toolbar-v32';
const RUNTIME_VERSION = 32;
const RUNTIME_ID = chrome && chrome.runtime && chrome.runtime.id
  ? String(chrome.runtime.id)
  : '';
const RUNTIME_PRIORITY = RUNTIME_ID === DEVELOPMENT_EXTENSION_ID ? 2 : 1;
const TOAST_HOST_ID = '_x_extension_selection_quick_actions_toast_host_2026_unique_';
const TOAST_STYLE_ID = '_x_extension_selection_quick_actions_toast_style_2026_unique_';
const ENTRY_DELAY_MS = 320;
const SELECTION_CHANGE_DELAY_MS = 80;
const SELECTION_GESTURE_TIMEOUT_MS = 1600;
const ENTRY_DISMISS_MS = 2200;
const TOOLBAR_DISMISS_MS = 3600;
const ACTION_SUCCESS_DISMISS_MS = 900;
const ACTION_FAILURE_DISMISS_MS = 2200;
const VIEWPORT_SAFE_MARGIN_PX = 12;

const HOST_ISOLATION_STYLES = Object.freeze({
  all: 'initial',
  position: 'fixed',
  'z-index': '2147483647',
  'box-sizing': 'border-box',
  width: 'max-content',
  height: 'max-content',
  'min-width': '0',
  'min-height': '0',
  'max-width': 'none',
  'max-height': 'none',
  margin: '0',
  padding: '0',
  border: '0',
  outline: '0',
  bottom: 'auto',
  opacity: '1',
  visibility: 'visible',
  'pointer-events': 'auto',
  transform: 'none',
  translate: 'none',
  rotate: 'none',
  scale: 'none',
  filter: 'none',
  '-webkit-filter': 'none',
  perspective: 'none',
  clip: 'auto',
  'clip-path': 'none',
  '-webkit-clip-path': 'none',
  mask: 'none',
  '-webkit-mask': 'none',
  overflow: 'visible',
  isolation: 'isolate',
  'mix-blend-mode': 'normal',
  contain: 'layout style',
  'content-visibility': 'visible',
  'writing-mode': 'horizontal-tb',
  direction: 'ltr',
  zoom: '1',
  animation: 'none',
  transition: 'none'
});

const ACTION_COPY: Readonly<Record<SelectionAction, readonly [string, string]>> = Object.freeze({
  ask: ['selection_quick_action_ask', 'Answer'],
  translate: ['selection_quick_action_translate', 'Translate'],
  explain: ['selection_quick_action_explain', 'Explain'],
  summarize: ['selection_quick_action_summarize', 'Summarize'],
  search: ['selection_quick_action_search', 'Research'],
  calculate: ['selection_quick_action_calculate', 'Calculate']
});
const TOOLBAR_FALLBACK_ACTIONS: readonly SelectionAction[] = Object.freeze(['explain', 'search', 'translate'] as const);

export {
  ACTION_COPY,
  ACTION_FAILURE_DISMISS_MS,
  ACTION_SUCCESS_DISMISS_MS,
  DEVELOPMENT_EXTENSION_ID,
  ENTRY_DELAY_MS,
  ENTRY_DISMISS_MS,
  HOST_ID,
  HOST_ISOLATION_STYLES,
  RUNTIME_ID,
  RUNTIME_PRIORITY,
  RUNTIME_REVISION,
  RUNTIME_VERSION,
  SELECTION_CHANGE_DELAY_MS,
  SELECTION_GESTURE_TIMEOUT_MS,
  TOAST_HOST_ID,
  TOAST_STYLE_ID,
  TOOLBAR_DISMISS_MS,
  TOOLBAR_FALLBACK_ACTIONS,
  VIEWPORT_SAFE_MARGIN_PX
};
