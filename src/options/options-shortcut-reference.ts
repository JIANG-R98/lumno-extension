// The keyboard shortcut reference list and how shortcuts are shown.
import * as LumnoShortcutReference from '../domain/shortcut-reference';
import type { ShortcutReferenceGroup } from '../domain/shortcut-reference';
import type * as ShortcutDisplay from '../domain/shortcut-display';
import type { FormatTemplate, GetMessage } from './options-types';
import type { ShortcutReferenceController } from './react/shortcut-reference';

interface ShortcutReferenceState {
  isMacPlatform: boolean;
}

interface ShortcutReferenceDeps {
  shortcutDisplay: Pick<typeof ShortcutDisplay, 'formatShortcutChord' | 'formatShortcutReferencePart'>;
  shortcutReferenceList: HTMLElement | null;
  shortcutReferenceController: Pick<ShortcutReferenceController, 'render'>;
  getMessage: GetMessage;
  formatTemplate: FormatTemplate;
  // The help center page for a slug and section (getHelpUrl in community-links).
  getHelpUrl?: (slug: string, anchor: string) => string;
  // Hands the tab switcher row its link to the Ctrl+Tab guide.
  onTabSwitcherCtrlTabLinkChange?(link: { href: string; label: string; bound: boolean }): void;
  optionsState: ShortcutReferenceState;
}

function createShortcutReference(deps: ShortcutReferenceDeps) {
  const {
    shortcutDisplay,
    shortcutReferenceList,
    shortcutReferenceController,
    getMessage,
    formatTemplate,
    getHelpUrl,
    onTabSwitcherCtrlTabLinkChange
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function formatShortcutForDisplay(shortcut: string): string {
    return shortcutDisplay.formatShortcutChord(shortcut, {
      platform: optionsState.isMacPlatform ? 'mac' : 'windows'
    });
  }

  function getShortcutReferencePartLabel(part: string): string {
    const text = part.trim();
    if (!text) {
      return '';
    }
    return shortcutDisplay.formatShortcutReferencePart(text, {
      platform: optionsState.isMacPlatform ? 'mac' : 'windows'
    });
  }

  function isCtrlTabShortcut(shortcut: string | undefined): boolean {
    const value = String(shortcut || '').replace(/\s+/g, '').toLowerCase();
    return value === '⌃⇥' || value === 'ctrl+tab' || value === 'macctrl+tab';
  }

  // The browser's shortcuts page cannot take Ctrl+Tab, so the tab switcher row
  // links to the help center's console snippet; once bound, it links there as
  // the place to read how to change it back.
  function renderTabSwitcherCtrlTabLink(groups: readonly ShortcutReferenceGroup[]): void {
    if (!onTabSwitcherCtrlTabLinkChange || typeof getHelpUrl !== 'function') {
      return;
    }
    const item = groups
      .flatMap((group) => group.items)
      .find((entry) => entry.commandName === 'show-tab-switcher');
    const bound = isCtrlTabShortcut(item && item.shortcut);
    const label = formatTemplate(bound
      ? getMessage('settings_tab_switcher_ctrl_tab_guide', 'Arc 式 {shortcut} 切换说明')
      : getMessage('settings_tab_switcher_ctrl_tab_link', '像 Arc 一样用 {shortcut} 切换'), {
      shortcut: optionsState.isMacPlatform ? '⌃Tab' : 'Ctrl+Tab'
    });
    onTabSwitcherCtrlTabLinkChange({ href: getHelpUrl('tab-switcher', 'ctrl-tab'), label, bound });
  }

  function getShortcutReferenceParts(shortcut: string): string[] {
    const value = shortcut.trim();
    if (!value) {
      return [];
    }
    return value
      .split(/\s+\/\s+/)
      .map(getShortcutReferencePartLabel)
      .filter(Boolean);
  }

  function renderShortcutReferenceGroups(groups: ShortcutReferenceGroup[]): void {
    if (!shortcutReferenceList) {
      return;
    }
    const visibleGroups = groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.commandName !== 'show-search')
    })).filter((group) => group.items.length > 0);
    shortcutReferenceController.render({
      groups: visibleGroups.map((group) => ({
        id: group.id,
        titleKey: group.titleKey,
        title: getMessage(group.titleKey, group.titleFallback),
        // The search group hangs off the "show-search" row above the list.
        nested: group.id === 'search',
        items: group.items.map((item) => {
          const parts = getShortcutReferenceParts(item.shortcut);
          const customShortcutLabel = item.shortcutLabelKey
            ? formatTemplate(getMessage(
              item.shortcutLabelKey,
              item.shortcutLabelFallback || ''
            ), {
              modifier: optionsState.isMacPlatform ? '⌘' : 'Ctrl'
            })
            : '';
          return {
            id: item.id,
            commandName: item.commandName || '',
            editable: item.editable,
            titleKey: item.titleKey,
            title: getMessage(item.titleKey, item.titleFallback),
            shortcutEmpty: !customShortcutLabel && parts.length === 0,
            shortcutLabel: customShortcutLabel || (parts.length > 0
              ? parts.join(' / ')
              : getMessage('shortcut_reference_unset', '未设置'))
          };
        })
      }))
    });
  }

  function renderShortcutReferenceList(): void {
    if (!shortcutReferenceList) {
      return;
    }
    const shortcutReference = LumnoShortcutReference;
    const platform = optionsState.isMacPlatform ? 'mac' : 'default';
    const renderWithCommands = (commands: chrome.commands.Command[] | undefined): void => {
      const groups = shortcutReference.getShortcutReferenceGroups({
        commands,
        platform
      });
      renderShortcutReferenceGroups(groups);
      renderTabSwitcherCtrlTabLink(groups);
    };
    // Not every browser has the commands API.
    if (!chrome.commands || typeof chrome.commands.getAll !== 'function') {
      renderWithCommands(undefined);
      return;
    }
    chrome.commands.getAll((commands) => {
      renderWithCommands(chrome.runtime.lastError ? undefined : commands);
    });
  }

  return {
    formatShortcutForDisplay,
    renderShortcutReferenceList
  };
}

export { createShortcutReference };
export type { ShortcutReferenceDeps, ShortcutReferenceState };
