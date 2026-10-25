// The mode menu's copy: the filter query line and the footer hints in the
// current language.
import type { ModeMenuLabels, ModeMenuMarkedText } from '../../react/search/mode-menu';
import type * as LumnoShortcutDisplay from '../../../domain/shortcut-display';
import type { NavigatorLike } from '../../../domain/shortcut-display';
import type { FormatMessage } from './types';

// The controller state search-input-mode.ts shares with its modules.
interface ModeMenuLanguageState {
  modeMenuFilterQuery: string;
}

interface ModeMenuLanguageConfig {
  navigatorLike?: NavigatorLike | null;
}

interface ModeMenuLanguageDeps {
  formatMessage: FormatMessage;
  shortcutDisplayApi: Pick<typeof LumnoShortcutDisplay, 'formatShortcutReference'>;
  config: ModeMenuLanguageConfig;
  win: { navigator?: NavigatorLike } | null | undefined;
  syncInputPlaceholder: () => void;
  renderModeMenuView: () => unknown;
  inputModeState: ModeMenuLanguageState;
}

function createModeMenuLanguage(deps: ModeMenuLanguageDeps) {
  const {
    formatMessage,
    shortcutDisplayApi,
    config,
    win,
    syncInputPlaceholder,
    renderModeMenuView
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  // The filter line: a hint, or the typed query marked in its sentence.
  function getModeMenuFilterText(): ModeMenuMarkedText {
    const query = inputModeState.modeMenuFilterQuery;
    if (!query) {
      return {
        before: formatMessage('search_scope_menu_filter_hint', 'Type to filter'),
        mark: '',
        after: ''
      };
    }
    const queryToken = '\uF8FFLUMNO_MODE_MENU_QUERY\uF8FF';
    const localizedQuery = formatMessage(
      'search_scope_menu_filter_query',
      'Search: {query}',
      { query: queryToken }
    );
    const queryIndex = localizedQuery.indexOf(queryToken);
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
      after: localizedQuery.slice(queryIndex + queryToken.length)
    };
  }

  function getModeMenuLabels(): ModeMenuLabels {
    return {
      filter: getModeMenuFilterText(),
      navigationKey: '\u2190\u2191\u2193\u2192',
      navigation: formatMessage('search_scope_menu_navigation_hint', 'Move'),
      selectKey: 'Enter',
      select: formatMessage('search_scope_menu_select_hint', 'Switch'),
      inputKey: 'Tab',
      input: formatMessage('search_scope_menu_focus_toggle_hint', 'Switch focus'),
      shortcutKey: shortcutDisplayApi.formatShortcutReference('Tab Tab', {
        navigatorLike: config.navigatorLike || (win && win.navigator)
      }),
      shortcut: formatMessage('search_scope_menu_shortcut_hint', 'Open panel'),
      empty: formatMessage('overlay_empty_result', 'No matching results'),
      moveUp: formatMessage('settings_search_source_move_up', 'Move up'),
      moveDown: formatMessage('settings_search_source_move_down', 'Move down')
    };
  }

  function refreshModeMenuLanguage(): void {
    renderModeMenuView();
    syncInputPlaceholder();
  }

  syncInputPlaceholder();

  return {
    getModeMenuLabels,
    refreshModeMenuLanguage
  };
}

type ModeMenuLanguageApi = ReturnType<typeof createModeMenuLanguage>;

export { createModeMenuLanguage };
export type { ModeMenuLanguageApi, ModeMenuLanguageConfig, ModeMenuLanguageDeps, ModeMenuLanguageState };
