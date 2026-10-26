// The key events that trigger, commit and release the switcher shortcut.

function getShortcutCommitModifierEventKey(shortcut: unknown): string {
  const shortcutText = String(shortcut || '').trim();
  const symbolModifiers = Array.from(shortcutText).map((token) => {
    if (token === '⌥') {
      return 'Alt';
    }
    if (token === '⌃') {
      return 'Control';
    }
    if (token === '⌘') {
      return 'Meta';
    }
    if (token === '⇧') {
      return 'Shift';
    }
    return '';
  }).filter(Boolean);
  if (symbolModifiers.length) {
    return symbolModifiers.find((key) => key !== 'Shift') || symbolModifiers[0] || '';
  }
  const parts = shortcutText
    .split('+')
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean);
  const modifiers = parts.slice(0, -1).map((token) => {
    if (token === 'alt' || token === 'option') {
      return 'Alt';
    }
    if (token === 'ctrl' || token === 'control' || token === 'macctrl') {
      return 'Control';
    }
    if (token === 'command' || token === 'cmd' || token === 'meta' || token === 'super') {
      return 'Meta';
    }
    if (token === 'shift') {
      return 'Shift';
    }
    return '';
  }).filter(Boolean);
  return modifiers.find((key) => key !== 'Shift') || modifiers[0] || '';
}

function getShortcutTriggerEventKey(shortcut: unknown): string {
  const shortcutText = String(shortcut || '').trim();
  const parts = shortcutText
    .split('+')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  const symbolTrigger = /[⌥⌃⌘⇧]/.test(shortcutText)
    ? shortcutText.replace(/[⌥⌃⌘⇧]/g, '').replace(/^\++/, '').trim()
    : '';
  const rawToken = symbolTrigger || String(parts[parts.length - 1] || '');
  const token = rawToken.toLowerCase();
  const aliases: Readonly<Record<string, string>> = {
    comma: ',',
    period: '.',
    slash: '/',
    backslash: '\\',
    return: 'Enter',
    esc: 'Escape',
    space: ' ',
    spacebar: ' ',
    tab: 'Tab',
    '⇥': 'Tab'
  };
  if (Object.prototype.hasOwnProperty.call(aliases, token)) {
    return aliases[token];
  }
  if (/^f\d{1,2}$/.test(token)) {
    return token.toUpperCase();
  }
  return token.length === 1 ? token : rawToken;
}

function getShortcutReleaseEventKeys(shortcut: unknown): string[] {
  const modifierKey = getShortcutCommitModifierEventKey(shortcut);
  if (!modifierKey) {
    return [];
  }
  return [modifierKey];
}

export {
  getShortcutCommitModifierEventKey,
  getShortcutReleaseEventKeys,
  getShortcutTriggerEventKey
};
