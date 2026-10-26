// Matching key presses against configured shortcuts.

interface ShortcutSpec {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  // A lowercase character, a function key ("F5") or a key name ("Enter").
  key: string;
}

// A key press reduced to its modifiers and key.
interface KeyDescriptor {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
}

// The fields of a keyboard event the matcher reads.
interface KeyboardEventLike {
  code?: string;
  key?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

const KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  tab: 'Tab',
  enter: 'Enter',
  return: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  space: ' ',
  spacebar: ' ',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  comma: ',',
  period: '.',
  slash: '/',
  semicolon: ';',
  quote: '\'',
  minus: '-',
  plus: '+',
  equal: '+',
  backslash: '\\',
  backquote: '`',
  bracketleft: '[',
  bracketright: ']'
});

const CODE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  Backquote: '`',
  Minus: '-',
  Equal: '+',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: ' ',
  Tab: 'Tab',
  Enter: 'Enter',
  Escape: 'Escape',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight'
});

// An own entry of an alias table, so "constructor" and its kin never match.
function lookup(table: Readonly<Record<string, string>>, key: string): string {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : '';
}

// A shortcut as Chrome writes it ("Ctrl+Shift+K", "⌘⇧K"), or null when it
// is not one.
type ModifierName = 'ctrl' | 'alt' | 'shift' | 'meta';

// Each modifier's spellings, by name and as a Mac symbol.
const MODIFIER_TOKENS: Readonly<Record<string, ModifierName>> = Object.freeze({
  ctrl: 'ctrl', control: 'ctrl', macctrl: 'ctrl', '⌃': 'ctrl',
  alt: 'alt', option: 'alt', '⌥': 'alt',
  shift: 'shift', '⇧': 'shift',
  command: 'meta', cmd: 'meta', meta: 'meta', super: 'meta', '⌘': 'meta'
});

// "⌘⇧K" spelled the long way, "⌘+⇧+K".
function expandCompactMacShortcut(value: string): string {
  const compactMacMatch = value.match(/^([⌘⇧⌃⌥]+)(.+)$/);
  return compactMacMatch ? `${Array.from(compactMacMatch[1]).join('+')}+${compactMacMatch[2]}` : value;
}

function readShortcutKey(keyToken: string): string {
  const normalizedKey = keyToken.toLowerCase();
  const alias = lookup(KEY_ALIASES, normalizedKey);
  if (alias) {
    return alias;
  }
  if (/^f\d{1,2}$/.test(normalizedKey)) {
    return normalizedKey.toUpperCase();
  }
  return normalizedKey.length === 1 ? normalizedKey : keyToken;
}

function parseShortcut(shortcut: unknown): ShortcutSpec | null {
  const value = expandCompactMacShortcut(String(shortcut || '').trim().replace(/\s*\+\s*/g, '+'));
  if (!value || value.includes('%')) {
    return null;
  }
  const parts = value
    .split('+')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const keyToken = parts.pop() || '';
  const spec: ShortcutSpec = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: ''
  };
  for (const token of parts) {
    const name = token.toLowerCase();
    const modifier = Object.prototype.hasOwnProperty.call(MODIFIER_TOKENS, name) ? MODIFIER_TOKENS[name] : null;
    if (!modifier) {
      return null;
    }
    spec[modifier] = true;
  }
  spec.key = readShortcutKey(keyToken);
  return spec.key ? spec : null;
}

// The key a KeyboardEvent.code stands for, independent of the layout.
function getKeyFromCode(rawCode: unknown): string {
  const code = String(rawCode || '').trim();
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  const alias = lookup(CODE_ALIASES, code);
  if (alias) {
    return alias;
  }
  return /^F\d{1,2}$/.test(code) ? code.toUpperCase() : '';
}

function describeKeyboardEvent(event: KeyboardEventLike | null | undefined): KeyDescriptor | null {
  if (!event) {
    return null;
  }
  const key = getKeyFromCode(event.code) || String(event.key || '');
  if (!key) {
    return null;
  }
  return {
    ctrlKey: Boolean(event.ctrlKey),
    altKey: Boolean(event.altKey),
    shiftKey: Boolean(event.shiftKey),
    metaKey: Boolean(event.metaKey),
    key
  };
}

function descriptorMatchesShortcut(
  descriptor: Partial<KeyDescriptor> | null | undefined,
  shortcutOrSpec: string | ShortcutSpec | null | undefined
): boolean {
  const spec = typeof shortcutOrSpec === 'string'
    ? parseShortcut(shortcutOrSpec)
    : shortcutOrSpec;
  if (!descriptor || !spec ||
      Boolean(descriptor.ctrlKey) !== spec.ctrl ||
      Boolean(descriptor.altKey) !== spec.alt ||
      Boolean(descriptor.shiftKey) !== spec.shift ||
      Boolean(descriptor.metaKey) !== spec.meta) {
    return false;
  }
  const eventKey = String(descriptor.key || '');
  if (spec.key.length === 1) {
    return eventKey.toLowerCase() === spec.key;
  }
  if (spec.key.startsWith('F')) {
    return eventKey.toUpperCase() === spec.key;
  }
  return eventKey === spec.key;
}

function eventMatchesShortcut(
  event: KeyboardEventLike | null | undefined,
  shortcutOrSpec: string | ShortcutSpec | null | undefined
): boolean {
  return descriptorMatchesShortcut(describeKeyboardEvent(event), shortcutOrSpec);
}

// Chrome commands need a modifier other than Shift, or a function key.
function canBeChromeCommandShortcut(descriptor: Partial<KeyDescriptor> | null | undefined): boolean {
  if (!descriptor || !String(descriptor.key || '')) {
    return false;
  }
  return Boolean(descriptor.ctrlKey || descriptor.altKey || descriptor.metaKey) ||
    /^F\d{1,2}$/.test(String(descriptor.key));
}

export {
  parseShortcut,
  getKeyFromCode,
  describeKeyboardEvent,
  descriptorMatchesShortcut,
  eventMatchesShortcut,
  canBeChromeCommandShortcut
};
export type { KeyDescriptor, KeyboardEventLike, ShortcutSpec };
