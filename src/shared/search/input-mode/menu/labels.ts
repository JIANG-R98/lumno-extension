// The mode menu's copy in the current language: the filter line (a hint,
// or the typed query marked in its sentence) and the footer hints.
import type { ModeMenuLabels, ModeMenuMarkedText } from '../mode-menu-model';
import { formatShortcutReference } from '../../../../domain/shortcut-display';
import type { NavigatorLike } from '../../../../domain/shortcut-display';
import type { FormatMessage } from '../types';

const QUERY_TOKEN = 'LUMNO_MODE_MENU_QUERY';

function getModeMenuFilterText(formatMessage: FormatMessage, query: string): ModeMenuMarkedText {
  if (!query) {
    return {
      before: formatMessage('search_scope_menu_filter_hint', 'Type to filter'),
      mark: '',
      after: ''
    };
  }
  const localizedQuery = formatMessage('search_scope_menu_filter_query', 'Search: {query}', { query: QUERY_TOKEN });
  const queryIndex = localizedQuery.indexOf(QUERY_TOKEN);
  if (queryIndex < 0) {
    return {
      before: formatMessage('search_scope_menu_filter_query', 'Search: {query}', { query }),
      mark: '',
      after: ''
    };
  }
  return {
    before: localizedQuery.slice(0, queryIndex),
    mark: query,
    after: localizedQuery.slice(queryIndex + QUERY_TOKEN.length)
  };
}

function getModeMenuLabels(
  formatMessage: FormatMessage,
  filterQuery: string,
  navigatorLike: NavigatorLike | null | undefined
): ModeMenuLabels {
  return {
    filter: getModeMenuFilterText(formatMessage, filterQuery),
    navigationKey: '←↑↓→',
    navigation: formatMessage('search_scope_menu_navigation_hint', 'Move'),
    selectKey: 'Enter',
    select: formatMessage('search_scope_menu_select_hint', 'Switch'),
    inputKey: 'Tab',
    input: formatMessage('search_scope_menu_focus_toggle_hint', 'Switch focus'),
    shortcutKey: formatShortcutReference('Tab Tab', { navigatorLike }),
    shortcut: formatMessage('search_scope_menu_shortcut_hint', 'Open panel'),
    empty: formatMessage('overlay_empty_result', 'No matching results'),
    moveUp: formatMessage('settings_search_source_move_up', 'Move up'),
    moveDown: formatMessage('settings_search_source_move_down', 'Move down')
  };
}

export { getModeMenuLabels };
