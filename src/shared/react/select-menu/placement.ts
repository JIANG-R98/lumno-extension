// Where an open select menu sits: beside its trigger inside the viewport,
// above it when there is more room there, and in the coordinates of a
// positioned (possibly offset or scaled) portal container.

// Below this, a searchable menu would show too few rows under the trigger, so
// it is held against the bottom of the viewport instead. Its box never grows
// past the cap, however many fonts are installed.
const SEARCHABLE_MENU_MIN_HEIGHT = 280;
const SEARCHABLE_MENU_MAX_HEIGHT = 480;
const VIEWPORT_PADDING = 8;

type MenuAlign = 'left' | 'middle' | 'right';

interface MenuPlacementSettings {
  win: Window;
  doc: Document;
  // Placed in its positioned container rather than the viewport.
  absolute: boolean;
  matchTriggerWidth: boolean;
  align: MenuAlign;
  // The gap between the trigger and the menu.
  offset: number;
  zIndex: number;
  // Space kept free at the top of the viewport.
  topInset: number;
  searchable: boolean;
}

// The menu's positioned container: where its origin is on screen, and how
// much it is scaled.
interface ContainerFrame {
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
}

// The vertical box a menu takes, and whether it opens upward.
interface MenuBox {
  top: number;
  height: number;
  maxHeight: number;
  opensUp: boolean;
  scrolls: boolean;
}

function readContainerFrame(menu: HTMLElement): ContainerFrame {
  const parent = menu.offsetParent instanceof HTMLElement ? menu.offsetParent : null;
  if (!parent) {
    return { originX: 0, originY: 0, scaleX: 1, scaleY: 1 };
  }
  const rect = parent.getBoundingClientRect();
  const scaleX = parent.offsetWidth ? rect.width / parent.offsetWidth : 1;
  const scaleY = parent.offsetHeight ? rect.height / parent.offsetHeight : 1;
  return {
    originX: rect.left + (parent.clientLeft - parent.scrollLeft) * scaleX,
    originY: rect.top + (parent.clientTop - parent.scrollTop) * scaleY,
    scaleX,
    scaleY
  };
}

function readViewportSize(win: Window, doc: Document): { width: number; height: number } {
  return {
    width: Math.max(0, win.innerWidth || doc.documentElement.clientWidth || 0),
    height: Math.max(0, win.innerHeight || doc.documentElement.clientHeight || 0)
  };
}

function readMenuLeft(trigger: DOMRect, menuWidth: number, align: MenuAlign, viewportWidth: number): number {
  let left = trigger.left;
  if (align === 'right') {
    left = trigger.right - menuWidth;
  } else if (align === 'middle') {
    left = trigger.left + trigger.width / 2 - menuWidth / 2;
  }
  return Math.max(VIEWPORT_PADDING, Math.min(left, Math.max(VIEWPORT_PADDING, viewportWidth - menuWidth - VIEWPORT_PADDING)));
}

// Typing shrinks a searchable menu's list, so a menu anchored by its bottom
// edge (or one that flips once the rest fits below) would jump under the
// caret. The box is fixed instead: below the trigger when there is room,
// otherwise held against the bottom of the viewport. Its height never
// follows the filtered rows.
function readSearchableBox(trigger: DOMRect, naturalHeight: number, viewportHeight: number,
  settings: MenuPlacementSettings, frame: ContainerFrame): MenuBox {
  const below = trigger.bottom + settings.offset * frame.scaleY;
  const roomBelow = Math.max(0, viewportHeight - VIEWPORT_PADDING - below);
  const fullHeight = Math.min(
    naturalHeight,
    SEARCHABLE_MENU_MAX_HEIGHT * frame.scaleY,
    Math.max(0, viewportHeight - VIEWPORT_PADDING - settings.topInset)
  );
  const fitsBelow = roomBelow >= Math.min(fullHeight, SEARCHABLE_MENU_MIN_HEIGHT);
  const height = fitsBelow ? Math.min(fullHeight, roomBelow) : fullHeight;
  const top = fitsBelow ? below : Math.max(settings.topInset, viewportHeight - VIEWPORT_PADDING - height);
  return { top, height, maxHeight: height, opensUp: top < below, scrolls: false };
}

// Below the trigger, or above it when that has more room than below and the
// menu does not fit below.
function readListBox(trigger: DOMRect, naturalHeight: number, viewportHeight: number,
  settings: MenuPlacementSettings, frame: ContainerFrame): MenuBox {
  const visualOffset = settings.offset * frame.scaleY;
  const spaceBelow = Math.max(0, viewportHeight - VIEWPORT_PADDING - trigger.bottom - visualOffset);
  const spaceAbove = Math.max(0, trigger.top - visualOffset - settings.topInset);
  const opensUp = naturalHeight > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = opensUp ? spaceAbove : spaceBelow;
  const height = Math.min(naturalHeight, maxHeight);
  const top = opensUp ? trigger.top - visualOffset - height : trigger.bottom + visualOffset;
  return {
    top: Math.max(settings.topInset, Math.min(top, Math.max(settings.topInset, viewportHeight - height - VIEWPORT_PADDING))),
    height,
    maxHeight,
    opensUp,
    scrolls: true
  };
}

// The menu's height with all its rows; a searchable menu measures it once
// per open (`measured`), so filtering never changes its box.
function readNaturalHeight(menu: HTMLElement, frame: ContainerFrame, searchable: boolean, measured: number | null): number {
  if (searchable && measured !== null) {
    return measured;
  }
  if (searchable) {
    menu.style.height = '';
    menu.style.maxHeight = '';
  }
  // Layout dimensions stay stable while the shared opening animation scales the surface.
  return Math.max((menu.scrollHeight + menu.offsetHeight - menu.clientHeight) * frame.scaleY, 0);
}

// Places the menu for its trigger; returns the natural height it measured.
function placeSelectMenu(menu: HTMLElement, triggerElement: HTMLElement, settings: MenuPlacementSettings,
  measuredHeight: number | null): number {
  const { win, doc } = settings;
  const trigger = triggerElement.getBoundingClientRect();
  menu.style.position = settings.absolute ? 'absolute' : 'fixed';
  const frame = readContainerFrame(menu);
  if (settings.matchTriggerWidth) {
    menu.style.width = `${trigger.width / frame.scaleX}px`;
  }
  const viewport = readViewportSize(win, doc);
  const menuWidth = Math.max(
    menu.offsetWidth * frame.scaleX,
    trigger.width || 0,
    (Number.parseFloat(win.getComputedStyle(menu).minWidth) || 0) * frame.scaleX
  );
  const naturalHeight = readNaturalHeight(menu, frame, settings.searchable, measuredHeight);
  const left = readMenuLeft(trigger, menuWidth, settings.align, viewport.width);
  const box = settings.searchable
    ? readSearchableBox(trigger, naturalHeight, viewport.height, settings, frame)
    : readListBox(trigger, naturalHeight, viewport.height, settings, frame);
  if (settings.searchable) {
    menu.style.height = `${box.height / frame.scaleY}px`;
  }
  menu.style.maxHeight = `${box.maxHeight / frame.scaleY}px`;
  // A searchable menu scrolls only the listbox under its field.
  menu.style.overflowY = box.scrolls ? 'auto' : 'hidden';
  menu.style.overflowX = 'hidden';
  menu.style.transformOrigin = `${box.opensUp ? 'bottom' : 'top'} ${settings.align === 'middle' ? 'center' : settings.align}`;
  menu.style.left = `${(left - frame.originX) / frame.scaleX}px`;
  menu.style.right = 'auto';
  menu.style.top = `${(box.top - frame.originY) / frame.scaleY}px`;
  menu.style.zIndex = String(settings.zIndex);
  return naturalHeight;
}

export type { MenuAlign, MenuPlacementSettings };
export { VIEWPORT_PADDING, placeSelectMenu };
