// Types the shortcut modules share with the bookmark and recent-site
// surfaces that drop sites onto the shortcuts.
import type { LayoutRect, MarkerPosition } from '../cross-surface-drag';
import type { ShortcutGroup, ShortcutItem } from '../../domain/shortcuts/types';

// A change to a shortcut's own icon, saved with the shortcuts.
type ShortcutIconChange =
  | { shortcutId: string; action: 'replace'; dataUrl: string }
  | { shortcutId: string; action: 'remove' };

interface PersistShortcutsOptions {
  // The groups to save with the items; the current ones when left out.
  groups?: ShortcutGroup[];
  // A shortcut that may go to the local overflow when sync is full.
  syncOverflowShortcutId?: string;
  animateLayout?: boolean;
  // false saves without drawing the shortcuts again.
  render?: boolean;
}

// Saves the shortcuts and shows a toast with `toastMessage`; resolves
// whether they were saved.
type PersistShortcuts = (
  items: readonly ShortcutItem[],
  toastMessage?: string,
  iconChange?: ShortcutIconChange | readonly ShortcutIconChange[],
  options?: PersistShortcutsOptions
) => Promise<boolean>;

// Where a site would join the shortcuts under the pointer.
interface ShortcutInsertionSlot {
  // The position among the shortcuts.
  index: number;
  markerPosition: MarkerPosition;
  anchorRect: LayoutRect | null;
  anchorTile: HTMLElement | null;
  groupId: string;
}

// What a shortcut context menu was opened for: a tile, a group's title,
// or the add tile.
type ShortcutContextTarget =
  | { kind: 'shortcut'; shortcutId: string; tile: HTMLElement }
  | { kind: 'group'; groupId: string; tile: HTMLElement }
  | { kind: 'add'; tile: HTMLElement };

// A page to add as a shortcut.
interface ShortcutSite {
  title: string;
  url: string;
}

// The actions of the group and add-tile menus.
type ShortcutGroupMenuValues = Readonly<Record<
  'addShortcut' | 'create' | 'rename' | 'addSite' | 'moveUp' | 'moveDown' | 'delete' | 'deleteWithSites',
  string
>>;

export type {
  PersistShortcuts,
  PersistShortcutsOptions,
  ShortcutContextTarget,
  ShortcutGroupMenuValues,
  ShortcutIconChange,
  ShortcutInsertionSlot,
  ShortcutSite
};
