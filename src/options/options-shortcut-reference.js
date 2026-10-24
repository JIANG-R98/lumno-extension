// The keyboard shortcut reference list and how shortcuts are shown.
import * as LumnoShortcutReference from '../shared/shortcut-reference.js';

function createShortcutReference(deps) {
  const {
    shortcutDisplay,
    shortcutReferenceList,
    shortcutReferenceController,
    getMessage,
    formatTemplate,
    getHelpUrl,
    tabSwitcherCtrlTabLink
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function formatShortcutForDisplay(shortcut) {
    return shortcutDisplay.formatShortcutChord(shortcut, {
      platform: optionsState.isMacPlatform ? 'mac' : 'windows'
    });
  }

  function getShortcutReferencePartLabel(part) {
    const text = String(part || '').trim();
    if (!text) {
      return '';
    }
    return shortcutDisplay.formatShortcutReferencePart(text, {
      platform: optionsState.isMacPlatform ? 'mac' : 'windows'
    });
  }

  function isCtrlTabShortcut(shortcut) {
    const value = String(shortcut || '').replace(/\s+/g, '').toLowerCase();
    return value === '⌃⇥' || value === 'ctrl+tab' || value === 'macctrl+tab';
  }

  // The browser's shortcuts page cannot take Ctrl+Tab, so the tab switcher row
  // links to the help center's console snippet; once bound, it links there as
  // the place to read how to change it back.
  function renderTabSwitcherCtrlTabLink(groups) {
    if (!tabSwitcherCtrlTabLink || typeof getHelpUrl !== 'function') {
      return;
    }
    const item = groups
      .flatMap((group) => group.items || [])
      .find((entry) => entry && entry.commandName === 'show-tab-switcher');
    const bound = isCtrlTabShortcut(item && item.shortcut);
    const label = formatTemplate(bound
      ? getMessage('settings_tab_switcher_ctrl_tab_guide', '{shortcut} 说明')
      : getMessage('settings_tab_switcher_ctrl_tab_link', '改用 {shortcut}'), {
      shortcut: optionsState.isMacPlatform ? '⌃Tab' : 'Ctrl+Tab'
    });
    tabSwitcherCtrlTabLink.href = getHelpUrl('tab-switcher', 'ctrl-tab');
    tabSwitcherCtrlTabLink.setAttribute('data-bound', bound ? 'true' : 'false');
    const labelNode = tabSwitcherCtrlTabLink.querySelector('.x-lumno-link-button__label');
    if (labelNode) {
      labelNode.textContent = label;
    }
    tabSwitcherCtrlTabLink.hidden = false;
  }

  function getShortcutReferenceParts(shortcut) {
    const value = String(shortcut || '').trim();
    if (!value) {
      return [];
    }
    return value
      .split(/\s+\/\s+/)
      .map(getShortcutReferencePartLabel)
      .filter(Boolean);
  }

  function renderShortcutReferenceGroups(groups) {
    if (!shortcutReferenceList) {
      return;
    }
    const visibleGroups = groups.map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => !(item && item.commandName === 'show-search'))
    })).filter((group) => group.items.length > 0);
    shortcutReferenceController.render({
      groups: visibleGroups.map((group) => ({
        id: group && group.id ? String(group.id) : '',
        titleKey: group && group.titleKey ? String(group.titleKey) : '',
        title: getMessage(group.titleKey, group.titleFallback || ''),
        // The search group hangs off the "show-search" row above the list.
        nested: group.id === 'search',
        items: group.items.map((item) => {
          const parts = getShortcutReferenceParts(item.shortcut || '');
          const customShortcutLabel = item.shortcutLabelKey
            ? formatTemplate(getMessage(
              item.shortcutLabelKey,
              item.shortcutLabelFallback || ''
            ), {
              modifier: optionsState.isMacPlatform ? '⌘' : 'Ctrl'
            })
            : '';
          return {
            id: item && item.id ? String(item.id) : '',
            commandName: item && item.commandName ? String(item.commandName) : '',
            editable: Boolean(item && item.editable),
            titleKey: item && item.titleKey ? String(item.titleKey) : '',
            title: getMessage(item.titleKey, item.titleFallback || ''),
            shortcutEmpty: !customShortcutLabel && parts.length === 0,
            shortcutLabel: customShortcutLabel || (parts.length > 0
              ? parts.join(' / ')
              : getMessage('shortcut_reference_unset', '未设置'))
          };
        })
      }))
    });
  }

  function renderShortcutReferenceList() {
    if (!shortcutReferenceList) {
      return;
    }
    const shortcutReference = LumnoShortcutReference;
    const platform = optionsState.isMacPlatform ? 'mac' : 'default';
    const renderWithCommands = (commands) => {
      const groups = shortcutReference.getShortcutReferenceGroups({
        commands,
        platform
      });
      renderShortcutReferenceGroups(groups);
      renderTabSwitcherCtrlTabLink(groups);
    };
    if (!chrome || !chrome.commands || typeof chrome.commands.getAll !== 'function') {
      renderWithCommands(null);
      return;
    }
    chrome.commands.getAll((commands) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        renderWithCommands(null);
        return;
      }
      renderWithCommands(Array.isArray(commands) ? commands : null);
    });
  }

  return {
    formatShortcutForDisplay,
    renderShortcutReferenceList
  };
}

export { createShortcutReference };
