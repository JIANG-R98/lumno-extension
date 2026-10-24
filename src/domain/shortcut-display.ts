// Shortcut labels as each platform writes them.

type ShortcutPlatform = 'mac' | 'windows' | 'other';

// The navigator fields the platform is read from.
interface NavigatorLike {
  userAgentData?: { platform?: unknown } | null;
  platform?: unknown;
  userAgent?: unknown;
}

interface ShortcutDisplayOptions {
  // A platform name; read from navigatorLike when absent.
  platform?: string;
  navigatorLike?: NavigatorLike | null;
}

const MODIFIER_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  alt: 'Alt',
  cmd: 'Command',
  command: 'Command',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  macctrl: 'Ctrl',
  meta: 'Command',
  option: 'Alt',
  shift: 'Shift',
  super: 'Command'
});

const KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  esc: 'Escape',
  escape: 'Escape',
  left: 'ArrowLeft',
  return: 'Enter',
  right: 'ArrowRight',
  up: 'ArrowUp'
});

const ARROW_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑'
});

const MAC_KEY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ...ARROW_LABELS,
  Enter: '↩',
  Escape: '⎋',
  Tab: '⇥'
});

const MAC_MODIFIER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Alt: '⌥',
  Command: '⌘',
  Ctrl: '⌃',
  Shift: '⇧'
});

// An own entry of a label table, so "constructor" and its kin never match.
function lookup(table: Readonly<Record<string, string>>, key: string): string {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : '';
}

function getNavigatorPlatform(navigatorLike: NavigatorLike | null | undefined): ShortcutPlatform {
  const source = navigatorLike || {};
  const userAgentDataPlatform = source.userAgentData &&
    typeof source.userAgentData.platform === 'string'
    ? source.userAgentData.platform
    : '';
  const candidates = [
    userAgentDataPlatform,
    source.platform,
    source.userAgent
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim().toLowerCase();
    if (!value) {
      continue;
    }
    if (/(mac|iphone|ipad|ipod)/.test(value)) {
      return 'mac';
    }
    if (/win/.test(value)) {
      return 'windows';
    }
    if (/(linux|android|cros)/.test(value)) {
      return 'other';
    }
  }
  return 'other';
}

function resolvePlatform(options: ShortcutDisplayOptions | null | undefined): ShortcutPlatform {
  const config = options || {};
  const explicitPlatform = String(config.platform || '').trim().toLowerCase();
  if (explicitPlatform.includes('mac')) {
    return 'mac';
  }
  if (explicitPlatform.includes('win')) {
    return 'windows';
  }
  if (explicitPlatform) {
    return 'other';
  }
  return getNavigatorPlatform(config.navigatorLike);
}

function normalizeKeyToken(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  const alias = lookup(KEY_ALIASES, text.toLowerCase());
  return alias || text;
}

// "Ctrl+Shift+K" as the platform writes it: ⌃⇧K on a Mac.
function formatShortcutChord(shortcut: unknown, options?: ShortcutDisplayOptions | null): string {
  const text = String(shortcut || '').trim();
  if (!text) {
    return '';
  }
  const parts = text
    .split('+')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return '';
  }
  const keyToken = normalizeKeyToken(parts.pop());
  const modifiers = parts.map((part) => {
    return lookup(MODIFIER_ALIASES, String(part || '').trim().toLowerCase()) || part;
  });
  const platform = resolvePlatform(options);
  const keyLabel = platform === 'mac'
    ? (lookup(MAC_KEY_LABELS, keyToken) || keyToken)
    : (lookup(ARROW_LABELS, keyToken) || keyToken);
  if (platform === 'mac') {
    return `${modifiers.map((modifier) => lookup(MAC_MODIFIER_LABELS, modifier) || modifier).join('')}${keyLabel}`;
  }
  return modifiers.length > 0 ? `${modifiers.join('+')}+${keyLabel}` : keyLabel;
}

// One alternative of a reference: a chord, a sequence of chords, or one of
// the named gestures ("arrow keys", "release Alt").
function formatShortcutReferencePart(part: unknown, options?: ShortcutDisplayOptions | null): string {
  const text = String(part || '').trim();
  if (!text) {
    return '';
  }
  if (text.toLowerCase() === 'arrow keys') {
    return '↑↓←→';
  }
  if (text.toLowerCase() === 'release alt') {
    return resolvePlatform(options) === 'mac' ? '⌥↑' : 'Alt↑';
  }
  const sequence = text.split(/\s+/).filter(Boolean);
  if (sequence.length > 1) {
    return sequence
      .map((shortcut) => formatShortcutChord(shortcut, options))
      .join(' ');
  }
  return formatShortcutChord(text, options);
}

// Alternatives separated by "/".
function formatShortcutReference(shortcut: unknown, options?: ShortcutDisplayOptions | null): string {
  return String(shortcut || '')
    .split(/\s*\/\s*/)
    .map((part) => formatShortcutReferencePart(part, options))
    .filter(Boolean)
    .join(' / ');
}

// Puts the shortcut's label where the text says {shortcut}.
function formatShortcutTemplate(text: unknown, shortcut: unknown, options?: ShortcutDisplayOptions | null): string {
  const shortcutLabel = formatShortcutChord(shortcut, options);
  return String(text || '').replace(/\{shortcut\}/g, shortcutLabel);
}

export {
  formatShortcutChord,
  formatShortcutReference,
  formatShortcutReferencePart,
  formatShortcutTemplate,
  getNavigatorPlatform
};
export type { NavigatorLike, ShortcutDisplayOptions, ShortcutPlatform };
