// The shortcut that opens the switcher, read from its text ("Alt+Q",
// "⌥Q"): the trigger key that moves the selection, and the modifier whose
// release switches to the selected tab.

type ModifierFlag = 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey';

interface ShortcutModifier {
  eventKey: string;
  flag: ModifierFlag;
}

// The shortcut that opens the switcher: its trigger key and the modifier
// whose release switches to the selected tab.
interface ParsedShortcut {
  triggerKey: string;
  // Shift is part of the chord, so pressing the key without it goes back.
  hasShift: boolean;
  commitModifierEventKey: string;
  commitModifierFlag: ModifierFlag | '';
}

const ALT: ShortcutModifier = { eventKey: 'Alt', flag: 'altKey' };
const CONTROL: ShortcutModifier = { eventKey: 'Control', flag: 'ctrlKey' };
const META: ShortcutModifier = { eventKey: 'Meta', flag: 'metaKey' };
const SHIFT: ShortcutModifier = { eventKey: 'Shift', flag: 'shiftKey' };

// Modifier names as written between plus signs.
const NAMED_MODIFIERS: Readonly<Record<string, ShortcutModifier>> = {
  alt: ALT,
  option: ALT,
  ctrl: CONTROL,
  control: CONTROL,
  macctrl: CONTROL,
  command: META,
  cmd: META,
  meta: META,
  super: META,
  shift: SHIFT
};

// Modifiers as macOS writes them.
const SYMBOL_MODIFIERS: Readonly<Record<string, ShortcutModifier>> = {
  '⌥': ALT,
  '⌃': CONTROL,
  '⌘': META,
  '⇧': SHIFT
};

const KEY_ALIASES: Readonly<Record<string, string>> = {
  comma: ',',
  period: '.',
  slash: '/',
  backslash: '\\',
  return: 'enter',
  esc: 'escape',
  space: ' ',
  spacebar: ' ',
  '⇥': 'tab'
};

const CODE_ALIASES: Readonly<Record<string, string>> = {
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Equal: '=',
  Minus: '-',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/'
};

function normalizeShortcutKey(value: unknown): string {
  const key = String(value || '').trim().toLowerCase();
  return KEY_ALIASES[key] || key;
}

// The key a physical key code types on a US layout; '' for others.
function normalizeShortcutCode(value: unknown): string {
  const code = String(value || '');
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  return CODE_ALIASES[code] || '';
}

function readNamedModifier(value: string): ShortcutModifier | null {
  const token = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(NAMED_MODIFIERS, token) ? NAMED_MODIFIERS[token] : null;
}

function readSymbolModifier(token: string): ShortcutModifier | null {
  return Object.prototype.hasOwnProperty.call(SYMBOL_MODIFIERS, token) ? SYMBOL_MODIFIERS[token] : null;
}

function parseTabSwitcherShortcut(value: unknown): ParsedShortcut {
  const shortcutText = String(value || 'Alt+Q').trim();
  const parts = shortcutText
    .split('+')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  const hasSymbolModifiers = /[⌥⌃⌘⇧]/.test(shortcutText);
  const symbolTrigger = hasSymbolModifiers
    ? shortcutText.replace(/[⌥⌃⌘⇧]/g, '').replace(/^\++/, '').trim()
    : '';
  const triggerKey = normalizeShortcutKey(symbolTrigger || parts.pop() || 'Q');
  const modifiers = (hasSymbolModifiers ? Array.from(shortcutText).map(readSymbolModifier) : parts.map(readNamedModifier))
    .filter((modifier): modifier is ShortcutModifier => modifier !== null);
  const commitModifier = modifiers.find((modifier) => modifier.eventKey !== 'Shift') || modifiers[0] || null;
  return {
    triggerKey,
    hasShift: modifiers.some((modifier) => modifier.eventKey === 'Shift'),
    commitModifierEventKey: commitModifier ? commitModifier.eventKey : '',
    commitModifierFlag: commitModifier ? commitModifier.flag : ''
  };
}

function isShortcutTriggerEvent(shortcut: ParsedShortcut, event: KeyboardEvent): boolean {
  const eventKeys = [
    normalizeShortcutKey(event && event.key),
    normalizeShortcutCode(event && event.code)
  ].filter(Boolean);
  return eventKeys.includes(shortcut.triggerKey);
}

function isCommitModifierPressed(shortcut: ParsedShortcut, event: KeyboardEvent): boolean {
  return Boolean(shortcut.commitModifierFlag && event && event[shortcut.commitModifierFlag] === true);
}

export type { ParsedShortcut };
export { isCommitModifierPressed, isShortcutTriggerEvent, parseTabSwitcherShortcut };
