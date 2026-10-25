import * as LumnoNewtabDismissStack from '../dismiss-stack';
import type { BlockedDropTarget, CascadeDropTarget } from '../cross-surface-drag';
import type { DismissStack } from '../dismiss-stack';
import type { BindCursorTooltip, Translate } from '../newtab-types';
import type { CascadeItemView, CascadeLevelView, createBookmarkCascadeViewApi } from '../react/bookmark-cascade-view';
import { isHtmlElement, isHtmlTag, isNode } from '../../shared/dom-guards';
import { queryHtmlElements } from '../../shared/dom-lookup';
import type * as MenuSurface from '../../shared/ui/menu-surface';
import type { TooltipController } from '../../shared/ui/tooltip';
import type * as CascadePosition from './bookmark-cascade-position';
import type { Point, PointLike, Rect, RootPlacement, SubmenuPlacement } from './bookmark-cascade-position';
import type { BookmarkItem } from './bookmarks-store';

// An element the menu opens from. The view that drew it may hook in to
// show it as active while its menu is open.
type BookmarkMenuAnchor = HTMLElement & {
  _xSetBookmarkMenuVisualActive?: (active: boolean, options?: { instant?: boolean }) => void;
};

// The parts of the window the menu uses; tests pass their own.
interface CascadeWindow {
  innerWidth?: number;
  innerHeight?: number;
  performance?: { now(): number };
  setTimeout?(callback: () => void, delay: number): number;
  clearTimeout?(timerId: number): void;
  requestAnimationFrame?(callback: () => void): number;
  matchMedia?(query: string): { matches: boolean };
  getComputedStyle?(element: Element): { transform: string };
}

// Pulling the rows on either side of an insertion point apart.
interface InsertionGapApi {
  getInsertionGapNeighbors(
    items: Element[],
    anchor: Element | null,
    markerPosition: string
  ): { before: Element | null; after: Element | null };
  setInsertionGap(owner: object, before: Element | null, after: Element | null): void;
}

interface CascadeItemEventDetail<E extends Event = Event> {
  event: E;
  item: BookmarkItem;
  element: HTMLButtonElement;
  parentFolderId: string;
}

interface CascadeOpenUrlOptions {
  openInBackgroundTab: boolean;
  anchor: BookmarkMenuAnchor | null;
}

interface FaviconFallbackOptions {
  primaryUrl: string;
  browserUrl: string;
}

interface BookmarkCascadeMenuOptions {
  documentObj?: Document | null;
  windowObj?: CascadeWindow | null;
  dismissStack?: DismissStack | null;
  positionUtils?: Partial<typeof CascadePosition>;
  crossSurfaceDrag?: InsertionGapApi | null;
  menuSurface?: Partial<Pick<typeof MenuSurface, 'applyContentWidth' | 'open' | 'close'>> | null;
  view?: ReturnType<typeof createBookmarkCascadeViewApi> | null;
  t?: Translate;
  sanitizeDisplayText?(value: unknown): string;
  getHostFromUrl?(url: string): string;
  getSiteDisplayName?(host: string, title: string): string;
  getUrlDisplay?(url: string): string;
  getRiSvg?(icon: string, className: string): string;
  getFigmaFolderSvg?(suffix: string, folderId?: string): string;
  initFolderPathMorph?(icon: Element): void;
  playFolderPathMorph?(icon: Element, toHover: boolean): void;
  attachFaviconWithFallbacks?(image: HTMLImageElement, url: string, host: string, options: FaviconFallbackOptions): void;
  // An icon chosen for the site, or ''.
  getItemIconUrl?(item: BookmarkItem, anchor: BookmarkMenuAnchor | null): string;
  isLocalNetworkHost?(host: string): boolean;
  getChromeFaviconUrl?(url: string): string;
  getBrowserPageFaviconUrl?(url: string): string;
  ensureReady?(forceReload: boolean): Promise<boolean>;
  getItems?(folderId: string): readonly BookmarkItem[];
  navigateToUrl?(url: string): void;
  openUrl?(url: string, options: CascadeOpenUrlOptions): void;
  bindCursorTooltip?: BindCursorTooltip;
  hideCursorTooltip?(): void;
  hideTopActionTooltip?(): void;
  copyTooltipController?: Pick<TooltipController, 'show' | 'hide'> | null;
  copyUrl?(url: string): unknown;
  shouldSuppressHover?(target: Element, event: Event | PointLike | null): boolean;
  onItemPointerDown?(detail: CascadeItemEventDetail<PointerEvent>): void;
  onItemContextMenu?(detail: CascadeItemEventDetail<MouseEvent> & { sourceKind: 'cascade' }): void;
  // True right after a press on an open context menu, so it does not open
  // the item underneath.
  isActivationSuppressed?(): boolean;
  shouldKeepOpenForExternalNode?(node: EventTarget | null): boolean;
  getViewportTopPadding?(): number;
}

interface CascadeLevelEntry {
  folderId: string;
  folderTitle: string;
  levelIndex: number;
  levelElement: HTMLElement;
  // The anchor for the root level; the folder row for a submenu.
  triggerElement: HTMLElement | null;
  parentLevelElement: HTMLElement | null;
  viewController: CascadeLevelView;
  activeButton?: HTMLElement | null;
  placement?: RootPlacement | SubmenuPlacement;
}

interface HoverIntentTask {
  levelIndex: number;
  triggerElement: HTMLElement;
  allowWhenSuppressed?: boolean;
  run: () => void;
  // Until then the pointer may still be on its way to an open submenu.
  safeUntil?: number;
}

// A pointer position and how it was given, for hover intent.
type HoverPointer = PointLike & { pointerType?: string };

interface CascadeItemAction {
  item: BookmarkItem;
  isFolder: boolean;
  openNestedLevel(options?: { focusChild?: boolean }): void;
  activateLeafItem(): void;
  navigateLeafItem(event: Event): void;
}

type CascadeMarkerPosition = 'before' | 'after';

interface CascadeRefreshOptions {
  // The row that was dragged slides from where it was dropped.
  draggedBookmarkId?: string;
  draggedRect?: Rect | null;
}

type CascadeDropMatch =
  | {
    kind: 'insertion';
    entry: CascadeLevelEntry;
    // The row the marker sits by; none in an empty level.
    button?: HTMLElement;
    folderId: string;
    index: number;
    element: HTMLElement | null;
    markerElement: HTMLElement | null;
    markerPosition: CascadeMarkerPosition;
  }
  | {
    kind: 'cascade';
    entry: CascadeLevelEntry;
    button: HTMLElement;
    folderId: string;
    title: string;
    element: HTMLElement;
  };

// Where a drag over the menu would drop: into a folder row, or between
// two rows; 'blocked' over the menu where nothing takes the drop.
type CascadeDragTarget = CascadeDropTarget | BlockedDropTarget;

const BOOKMARK_CASCADE_MENU_MIN_WIDTH_PX = 210;
const BOOKMARK_CASCADE_MENU_MAX_WIDTH_PX = 260;
const BOOKMARK_CASCADE_SUBMENU_GAP_PX = -8;
const BOOKMARK_CASCADE_HOVER_DELAY_MS = 220;
const BOOKMARK_CASCADE_CLOSE_DELAY_MS = 360;
const BOOKMARK_CASCADE_SAFE_RECHECK_MS = 80;
const BOOKMARK_CASCADE_SAFE_MAX_MS = 1200;
const BOOKMARK_CASCADE_SAFE_EDGE_ZONE_PX = 90;
const BOOKMARK_CASCADE_DRAG_OPEN_DELAY_MS = 420;
const BOOKMARK_CASCADE_FOLDER_DROP_MIN_RATIO = 0.38;
const BOOKMARK_CASCADE_FOLDER_DROP_MAX_RATIO = 0.62;
const BOOKMARK_CASCADE_REORDER_ANIMATION_MS = 180;
const BOOKMARK_CASCADE_REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

function noop(): void {}

const DISMISS_LAYER_KEY = 'bookmark-cascade-menu';

// The page passes its shared dismiss stack; on its own (tests) the menu
// keeps a stack of one for its document.
function createOwnDismissStack(documentObj: Document | null): DismissStack | null {
  return documentObj ? LumnoNewtabDismissStack.createDismissStack({ documentObj }) : null;
}

function createBookmarkCascadeMenuRuntime(options?: BookmarkCascadeMenuOptions) {
  const config = options || {};
  // An option given as null stays null; one left out takes the default.
  const documentObj = Object.hasOwn(config, 'documentObj')
    ? config.documentObj || null
    : (typeof document !== 'undefined' ? document : null);
  const windowObj: CascadeWindow | null = Object.hasOwn(config, 'windowObj')
    ? config.windowObj || null
    : (typeof window !== 'undefined' ? window : null);
  const dismissStack = config.dismissStack || createOwnDismissStack(documentObj);
  const positionUtils = config.positionUtils || {};
  const crossSurfaceDrag = config.crossSurfaceDrag || null;
  const insertionGapOwner = {};
  const menuSurface = config.menuSurface || null;
  const view = config.view || null;
  const t: Translate = config.t || ((_key, fallback) => fallback || '');
  const sanitizeDisplayText = config.sanitizeDisplayText || ((value: unknown) => String(value || ''));
  const getHostFromUrl = config.getHostFromUrl || (() => '');
  const getSiteDisplayName = config.getSiteDisplayName || ((_host: string, title: string) => title || '');
  const getUrlDisplay = config.getUrlDisplay || ((url: string) => url || '');
  const getRiSvg = config.getRiSvg || (() => '');
  const getFigmaFolderSvg = config.getFigmaFolderSvg || (() => '');
  const initFolderPathMorph = config.initFolderPathMorph || noop;
  const playFolderPathMorph = config.playFolderPathMorph || noop;
  const attachFaviconWithFallbacks = config.attachFaviconWithFallbacks || noop;
  const getItemIconUrl = config.getItemIconUrl || (() => '');
  const isLocalNetworkHost = config.isLocalNetworkHost || (() => false);
  const getChromeFaviconUrl = config.getChromeFaviconUrl || (() => '');
  const getBrowserPageFaviconUrl = config.getBrowserPageFaviconUrl || (() => '');
  const ensureReady = config.ensureReady || (() => Promise.resolve(false));
  const getItems = config.getItems || (() => []);
  const navigateToUrl = config.navigateToUrl || noop;
  const openUrl = config.openUrl || ((url: string) => navigateToUrl(url));
  const bindCursorTooltip: BindCursorTooltip = config.bindCursorTooltip || (() => null);
  const hideCursorTooltip = config.hideCursorTooltip || noop;
  const hideTopActionTooltip = config.hideTopActionTooltip || noop;
  const copyTooltipController = config.copyTooltipController || null;
  const copyUrl = config.copyUrl || (() => Promise.resolve(false));
  const shouldSuppressHover = config.shouldSuppressHover || (() => false);
  const onItemPointerDown = config.onItemPointerDown || noop;
  const onItemContextMenu = config.onItemContextMenu || noop;
  const isActivationSuppressed = config.isActivationSuppressed || (() => false);
  const shouldKeepOpenForExternalNode = config.shouldKeepOpenForExternalNode || (() => false);
  const getViewportTopPadding = config.getViewportTopPadding || (() => 8);

  let bookmarkCascadeMenu: HTMLElement | null = null;
  let bookmarkCascadeAnchor: BookmarkMenuAnchor | null = null;
  let bookmarkCascadeOpenRequest: { folderId: string; anchorElement: BookmarkMenuAnchor; dragMode: boolean } | null = null;
  let bookmarkCascadeLevels: CascadeLevelEntry[] = [];
  let bookmarkCascadePointer: Point | null = null;
  let bookmarkCascadePreviousPointer: Point | null = null;
  let bookmarkCascadeHoverIntentTimer = 0;
  let bookmarkCascadeHoverIntentTask: HoverIntentTask | null = null;
  let bookmarkCascadeCloseTimer = 0;
  let bookmarkCascadeKeyboardLevelIndex = 0;
  let bookmarkCascadeDragMode = false;
  let bookmarkCascadeRefreshInProgress = false;
  let bookmarkCascadeDragTargetButton: HTMLElement | null = null;
  let bookmarkCascadeDragInsertionElement: HTMLElement | null = null;
  const bookmarkCascadeItemActions = new WeakMap<Element, CascadeItemAction>();
  // The timer that ends each row's reorder animation.
  const rowLayoutAnimationTimers = new WeakMap<HTMLElement, number>();

  function setAnchorVisualActive(anchor: BookmarkMenuAnchor | null, active: boolean, visualOptions?: { instant?: boolean }): void {
    if (anchor && typeof anchor._xSetBookmarkMenuVisualActive === 'function') {
      anchor._xSetBookmarkMenuVisualActive(active, visualOptions);
    }
  }

  // A cascade row's wrapper around its button.
  function getRow(button: Element): HTMLElement | null {
    const row = button.closest('.x-nt-bookmark-cascade-row');
    return isHtmlElement(row) ? row : null;
  }

  function setBookmarkCascadeDragMode(enabled: boolean): boolean {
    bookmarkCascadeDragMode = enabled === true;
    if (bookmarkCascadeMenu) {
      if (bookmarkCascadeDragMode) {
        bookmarkCascadeMenu.setAttribute('data-drag-mode', 'true');
      } else {
        bookmarkCascadeMenu.removeAttribute('data-drag-mode');
      }
    }
    if (!bookmarkCascadeDragMode) {
      clearBookmarkCascadeDragTarget();
      cancelBookmarkCascadeHoverIntent();
      cancelBookmarkCascadeDelayedClose();
    }
    return bookmarkCascadeDragMode;
  }

  function getNow(): number {
    return windowObj && windowObj.performance && typeof windowObj.performance.now === 'function'
      ? windowObj.performance.now()
      : Date.now();
  }

  function requestFrame(callback: () => void): number {
    if (windowObj && typeof windowObj.requestAnimationFrame === 'function') {
      return windowObj.requestAnimationFrame(callback);
    }
    if (windowObj && typeof windowObj.setTimeout === 'function') {
      return windowObj.setTimeout(callback, 16);
    }
    return 0;
  }

  function setTimer(callback: () => void, delay: number): number {
    return windowObj && typeof windowObj.setTimeout === 'function'
      ? windowObj.setTimeout(callback, delay)
      : 0;
  }

  function clearTimer(timerId: number): void {
    if (timerId && windowObj && typeof windowObj.clearTimeout === 'function') {
      windowObj.clearTimeout(timerId);
    }
  }

  function getBookmarkCascadePointFromEvent(event: PointLike | null | undefined): Point | null {
    if (!event) {
      return null;
    }
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  function updateBookmarkCascadePointer(event: PointLike | null | undefined): Point | null {
    const point = getBookmarkCascadePointFromEvent(event);
    if (!point) {
      return bookmarkCascadePointer;
    }
    if (!bookmarkCascadePointer ||
        bookmarkCascadePointer.x !== point.x ||
        bookmarkCascadePointer.y !== point.y) {
      bookmarkCascadePreviousPointer = bookmarkCascadePointer;
      bookmarkCascadePointer = point;
    }
    return bookmarkCascadePointer;
  }

  function isBookmarkCascadeHoverSuppressed(target: Element, event: Event | PointLike | null): boolean {
    return shouldSuppressHover(target, event) === true;
  }

  function isPointInsideRect(
    point: Point | null,
    rect: Pick<Rect, 'left' | 'right' | 'top' | 'bottom'> | null
  ): boolean {
    return Boolean(
      point &&
      rect &&
      point.x >= rect.left &&
      point.x <= rect.right &&
      point.y >= rect.top &&
      point.y <= rect.bottom
    );
  }

  function getBookmarkCascadeLevelEntry(levelIndex: number): CascadeLevelEntry | null {
    const safeLevelIndex = Math.max(0, Math.floor(levelIndex) || 0);
    return bookmarkCascadeLevels.find((entry) => entry && entry.levelIndex === safeLevelIndex) || null;
  }

  function getBookmarkCascadeLevelEntryByElement(levelElement: Element | null): CascadeLevelEntry | null {
    if (!levelElement) {
      return null;
    }
    return bookmarkCascadeLevels.find((entry) => entry && entry.levelElement === levelElement) || null;
  }

  function getBookmarkCascadeSubmenuSide(entry: CascadeLevelEntry | null, childRect: Rect | null): 'left' | 'right' {
    if (!entry) {
      return 'right';
    }
    if (entry.placement && 'side' in entry.placement) {
      return entry.placement.side === 'left' ? 'left' : 'right';
    }
    const attrSide = entry.levelElement ? entry.levelElement.getAttribute('data-side') : '';
    if (attrSide === 'left' || attrSide === 'right') {
      return attrSide;
    }
    const parentEntry = getBookmarkCascadeLevelEntry(entry.levelIndex - 1);
    const parentRect = parentEntry ? getBookmarkCascadeElementRect(parentEntry.levelElement) : null;
    if (parentRect && childRect && childRect.left < parentRect.left) {
      return 'left';
    }
    return 'right';
  }

  function buildBookmarkCascadeSafeTriangleForLevel(levelIndex: number, pointer: Point | null): Point[] | null {
    if (typeof positionUtils.buildCascadeSafeTriangle !== 'function') {
      return null;
    }
    const parentEntry = getBookmarkCascadeLevelEntry(levelIndex);
    const childEntry = getBookmarkCascadeLevelEntry(levelIndex + 1);
    if (!parentEntry || !parentEntry.activeButton || !childEntry || !childEntry.levelElement) {
      return null;
    }
    const childRect = getBookmarkCascadeElementRect(childEntry.levelElement);
    if (!childRect) {
      return null;
    }
    return positionUtils.buildCascadeSafeTriangle({
      pointer,
      submenuRect: childRect,
      side: getBookmarkCascadeSubmenuSide(childEntry, childRect)
    });
  }

  function isBookmarkCascadePointNearSubmenuEdge(point: Point | null, parentRect: Rect | null, side: 'left' | 'right'): boolean {
    if (!point || !parentRect || parentRect.width <= 0) {
      return false;
    }
    const edgeZone = Math.min(
      BOOKMARK_CASCADE_SAFE_EDGE_ZONE_PX,
      Math.max(56, parentRect.width * 0.43)
    );
    return side === 'left'
      ? point.x <= parentRect.left + edgeZone
      : point.x >= parentRect.right - edgeZone;
  }

  // Whether the pointer may be on its way into the level's open submenu.
  function shouldProtectBookmarkCascadeLevel(levelIndex: number, point?: Point | null): boolean {
    if (typeof positionUtils.isPointInsideCascadeSafeTriangle !== 'function') {
      return false;
    }
    const currentPoint = point || bookmarkCascadePointer;
    if (!currentPoint) {
      return false;
    }
    const parentEntry = getBookmarkCascadeLevelEntry(levelIndex);
    const childEntry = getBookmarkCascadeLevelEntry(levelIndex + 1);
    if (!parentEntry || !parentEntry.activeButton || !childEntry || !childEntry.levelElement) {
      return false;
    }
    const childRect = getBookmarkCascadeElementRect(childEntry.levelElement);
    if (isPointInsideRect(currentPoint, childRect)) {
      return true;
    }
    const submenuSide = getBookmarkCascadeSubmenuSide(childEntry, childRect);
    const parentRect = getBookmarkCascadeElementRect(parentEntry.levelElement);
    if (!isBookmarkCascadePointNearSubmenuEdge(currentPoint, parentRect, submenuSide)) {
      return false;
    }
    const triangle = buildBookmarkCascadeSafeTriangleForLevel(
      levelIndex,
      bookmarkCascadePreviousPointer || bookmarkCascadePointer
    );
    return positionUtils.isPointInsideCascadeSafeTriangle(currentPoint, triangle);
  }

  function getBookmarkCascadeViewport(): { width: number; height: number } {
    const docElement = documentObj ? documentObj.documentElement : null;
    return {
      width: (windowObj && windowObj.innerWidth) || (docElement && docElement.clientWidth) || 0,
      height: (windowObj && windowObj.innerHeight) || (docElement && docElement.clientHeight) || 0
    };
  }

  function cancelBookmarkCascadeHoverIntent(): void {
    if (bookmarkCascadeHoverIntentTimer) {
      clearTimer(bookmarkCascadeHoverIntentTimer);
      bookmarkCascadeHoverIntentTimer = 0;
    }
    if (bookmarkCascadeHoverIntentTask && bookmarkCascadeHoverIntentTask.triggerElement) {
      setBookmarkCascadeItemHoverSuppressed(bookmarkCascadeHoverIntentTask.triggerElement, false);
    }
    bookmarkCascadeHoverIntentTask = null;
  }

  function cancelBookmarkCascadeHoverIntentFor(triggerElement: HTMLElement): void {
    if (bookmarkCascadeHoverIntentTask &&
        bookmarkCascadeHoverIntentTask.triggerElement === triggerElement) {
      cancelBookmarkCascadeHoverIntent();
    }
  }

  function runBookmarkCascadeHoverIntentTask(): void {
    const task = bookmarkCascadeHoverIntentTask;
    bookmarkCascadeHoverIntentTimer = 0;
    if (!task || !bookmarkCascadeMenu || !task.triggerElement || !task.triggerElement.isConnected) {
      cancelBookmarkCascadeHoverIntent();
      return;
    }
    if (!task.allowWhenSuppressed && isBookmarkCascadeHoverSuppressed(task.triggerElement, null)) {
      cancelBookmarkCascadeHoverIntent();
      setBookmarkCascadeItemHoverSuppressed(task.triggerElement, true);
      return;
    }
    const point = bookmarkCascadePointer;
    const triggerRect = getBookmarkCascadeElementRect(task.triggerElement);
    const triggerHovered = task.triggerElement.matches(':hover');
    const pointInsideTrigger = point && triggerRect && isPointInsideRect(point, triggerRect);
    const now = getNow();
    const safeRemaining = task.safeUntil !== undefined && Number.isFinite(task.safeUntil) ? task.safeUntil - now : 0;
    if (shouldProtectBookmarkCascadeLevel(task.levelIndex, point) && safeRemaining > 0) {
      const recheckDelay = Math.max(16, Math.min(BOOKMARK_CASCADE_SAFE_RECHECK_MS, safeRemaining));
      bookmarkCascadeHoverIntentTimer = setTimer(
        runBookmarkCascadeHoverIntentTask,
        recheckDelay
      );
      return;
    }
    if (point && triggerRect && !pointInsideTrigger && !triggerHovered) {
      cancelBookmarkCascadeHoverIntent();
      return;
    }
    const run = task.run;
    cancelBookmarkCascadeHoverIntent();
    run();
  }

  function scheduleBookmarkCascadeHoverIntent(task: HoverIntentTask, event: PointerEvent | HoverPointer | null): void {
    if (!task.allowWhenSuppressed && isBookmarkCascadeHoverSuppressed(task.triggerElement, event)) {
      cancelBookmarkCascadeHoverIntent();
      setBookmarkCascadeItemHoverSuppressed(task.triggerElement, true);
      return;
    }
    const pointerType = event && typeof event.pointerType === 'string' ? event.pointerType : '';
    if (pointerType === 'touch') {
      cancelBookmarkCascadeHoverIntent();
      task.run();
      return;
    }
    updateBookmarkCascadePointer(event);
    cancelBookmarkCascadeHoverIntent();
    const delayMs = BOOKMARK_CASCADE_HOVER_DELAY_MS;
    const scheduledAt = getNow();
    bookmarkCascadeHoverIntentTask = {
      ...task,
      safeUntil: scheduledAt + BOOKMARK_CASCADE_SAFE_MAX_MS
    };
    bookmarkCascadeHoverIntentTimer = setTimer(runBookmarkCascadeHoverIntentTask, delayMs);
  }

  function cancelBookmarkCascadeDelayedClose(): void {
    if (bookmarkCascadeCloseTimer) {
      clearTimer(bookmarkCascadeCloseTimer);
      bookmarkCascadeCloseTimer = 0;
    }
  }

  function scheduleBookmarkCascadeDelayedClose(): void {
    if (!bookmarkCascadeMenu || bookmarkCascadeDragMode || bookmarkCascadeCloseTimer) {
      return;
    }
    bookmarkCascadeCloseTimer = setTimer(() => {
      bookmarkCascadeCloseTimer = 0;
      close();
    }, BOOKMARK_CASCADE_CLOSE_DELAY_MS);
  }

  function isBookmarkCascadePointInsideInteractiveArea(point: Point | null): boolean {
    if (!point || !bookmarkCascadeMenu) {
      return false;
    }
    const anchorRect = getBookmarkCascadeElementRect(bookmarkCascadeAnchor, {
      ignoreElementTranslate: true
    });
    if (isPointInsideRect(point, anchorRect)) {
      return true;
    }
    const rootEntry = getBookmarkCascadeLevelEntry(0);
    const rootRect = rootEntry ? getBookmarkCascadeElementRect(rootEntry.levelElement) : null;
    if (bookmarkCascadeDragMode && anchorRect && rootRect) {
      const bridgePadding = 10;
      const bridgeRect = {
        left: Math.min(anchorRect.left, rootRect.left) - bridgePadding,
        right: Math.max(anchorRect.right, rootRect.right) + bridgePadding,
        top: Math.min(anchorRect.top, rootRect.top) - bridgePadding,
        bottom: Math.max(anchorRect.bottom, rootRect.bottom) + bridgePadding
      };
      if (isPointInsideRect(point, bridgeRect)) {
        return true;
      }
    }
    for (let index = 0; index < bookmarkCascadeLevels.length; index += 1) {
      const entry = bookmarkCascadeLevels[index];
      if (entry && isPointInsideRect(point, getBookmarkCascadeElementRect(entry.levelElement))) {
        return true;
      }
      if (entry && shouldProtectBookmarkCascadeLevel(entry.levelIndex, point)) {
        return true;
      }
    }
    return false;
  }

  function handleBookmarkCascadeDocumentPointerMove(event: PointerEvent): void {
    if (!bookmarkCascadeMenu) {
      return;
    }
    const point = updateBookmarkCascadePointer(event);
    if (isBookmarkCascadePointInsideInteractiveArea(point)) {
      cancelBookmarkCascadeDelayedClose();
      return;
    }
    scheduleBookmarkCascadeDelayedClose();
  }

  function cancelBookmarkCascadeOpenRequest(): void {
    const pendingAnchor = bookmarkCascadeOpenRequest && bookmarkCascadeOpenRequest.anchorElement;
    bookmarkCascadeOpenRequest = null;
    if (pendingAnchor && pendingAnchor !== bookmarkCascadeAnchor) {
      pendingAnchor.setAttribute('aria-expanded', 'false');
      setAnchorVisualActive(pendingAnchor, false);
    }
  }

  function prefersReducedMotion(): boolean {
    return Boolean(windowObj && typeof windowObj.matchMedia === 'function' &&
      windowObj.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // After a drop the menu folds back the way it opened instead of vanishing,
  // while the shortcuts settle around the site that left or joined it. It
  // takes no pointer and is no longer the open menu while it fades.
  const BOOKMARK_CASCADE_CLOSE_MS = 220;
  function foldBookmarkCascadeMenuAway(menu: HTMLElement): void {
    menu.setAttribute('data-closing', 'true');
    menu.setAttribute('aria-hidden', 'true');
    // A drag-mode or refreshing menu holds its levels still; this one moves.
    menu.removeAttribute('data-drag-mode');
    menu.removeAttribute('data-refreshing');
    menu.style.pointerEvents = 'none';
    queryHtmlElements(menu, '[data-open="true"]').forEach((level) => {
      if (menuSurface && typeof menuSurface.close === 'function') {
        menuSurface.close(level);
      } else {
        level.setAttribute('data-open', 'false');
      }
    });
    const remove = () => {
      if (menu.parentNode) menu.parentNode.removeChild(menu);
    };
    if (windowObj && typeof windowObj.setTimeout === 'function') {
      windowObj.setTimeout(remove, BOOKMARK_CASCADE_CLOSE_MS);
    } else {
      remove();
    }
  }

  // `{ animate: true }` folds the menu away rather than removing it at once.
  function close(closeOptions?: { animate?: boolean; restoreFocus?: boolean }): void {
    const optionsForClose = closeOptions || {};
    cancelBookmarkCascadeOpenRequest();
    cancelBookmarkCascadeHoverIntent();
    cancelBookmarkCascadeDelayedClose();
    hideCursorTooltip();
    hideTopActionTooltip();
    if (copyTooltipController) {
      copyTooltipController.hide();
    }
    bookmarkCascadeKeyboardLevelIndex = 0;
    const anchorToRestore = bookmarkCascadeAnchor;
    clearBookmarkCascadeDragTarget();
    bookmarkCascadeDragMode = false;
    if (anchorToRestore) {
      anchorToRestore.setAttribute('aria-expanded', 'false');
      setAnchorVisualActive(anchorToRestore, false);
    }
    bookmarkCascadeAnchor = null;
    bookmarkCascadeLevels = [];
    const menuToRemove = bookmarkCascadeMenu;
    bookmarkCascadeMenu = null;
    if (menuToRemove && menuToRemove.parentNode) {
      if (optionsForClose.animate && !prefersReducedMotion()) {
        foldBookmarkCascadeMenuAway(menuToRemove);
      } else {
        menuToRemove.parentNode.removeChild(menuToRemove);
      }
    }
    setDocumentListenersAttached(false);
    bookmarkCascadePointer = null;
    bookmarkCascadePreviousPointer = null;
    if (optionsForClose.restoreFocus && anchorToRestore) {
      try {
        anchorToRestore.focus({ preventScroll: true });
      } catch (error) {
        anchorToRestore.focus();
      }
    }
  }

  function getBookmarkCascadeElementRect(
    element: HTMLElement | null,
    rectOptions?: { ignoreElementTranslate?: boolean }
  ): Rect | null {
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const width = element.offsetWidth || rect.width || 0;
    const height = element.offsetHeight || rect.height || 0;
    const normalizeMeasuredRect = (sourceRect: Pick<Rect, 'left' | 'top'>): Rect => ({
      left: sourceRect.left,
      right: sourceRect.left + width,
      top: sourceRect.top,
      bottom: sourceRect.top + height,
      width,
      height
    });
    if (rectOptions &&
        rectOptions.ignoreElementTranslate &&
        typeof positionUtils.getTranslateNeutralRect === 'function') {
      const style = (windowObj && typeof windowObj.getComputedStyle === 'function')
        ? windowObj.getComputedStyle(element)
        : null;
      return normalizeMeasuredRect(positionUtils.getTranslateNeutralRect(
        rect,
        style && style.transform
      ));
    }
    return normalizeMeasuredRect(rect);
  }

  function applyBookmarkCascadeLevelSurface(levelElement: HTMLElement): void {
    if (!levelElement) {
      return;
    }
    if (menuSurface && typeof menuSurface.applyContentWidth === 'function') {
      menuSurface.applyContentWidth(levelElement, {
        minWidth: BOOKMARK_CASCADE_MENU_MIN_WIDTH_PX,
        maxWidth: BOOKMARK_CASCADE_MENU_MAX_WIDTH_PX
      });
      return;
    }
    levelElement.classList.add('_x_extension_menu_surface_2024_unique_');
    levelElement.setAttribute('data-menu-surface-width', 'content');
    levelElement.style.setProperty('--x-extension-menu-surface-min-width', `${BOOKMARK_CASCADE_MENU_MIN_WIDTH_PX}px`);
    levelElement.style.setProperty('--x-extension-menu-surface-max-width', `${BOOKMARK_CASCADE_MENU_MAX_WIDTH_PX}px`);
  }

  function lockBookmarkCascadeLevelWidth(levelElement: HTMLElement): number {
    const rect = levelElement.getBoundingClientRect();
    const measuredWidth = Number(levelElement.offsetWidth) || Number(rect.width) || 0;
    if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) {
      return 0;
    }
    const lockedWidth = Math.ceil(measuredWidth);
    levelElement.style.setProperty('width', `${lockedWidth}px`);
    return lockedWidth;
  }

  function openBookmarkCascadeLevelSurface(levelElement: HTMLElement): void {
    if (!levelElement) {
      return;
    }
    if (bookmarkCascadeRefreshInProgress) {
      levelElement.setAttribute('data-open', 'true');
      return;
    }
    if (menuSurface && typeof menuSurface.open === 'function') {
      menuSurface.open(levelElement, { requestAnimationFrame: requestFrame });
      return;
    }
    levelElement.setAttribute('data-open', 'true');
  }

  function applyBookmarkCascadePlacement(levelElement: HTMLElement, placement: RootPlacement | SubmenuPlacement): void {
    levelElement.style.setProperty('left', `${Math.round(placement.left)}px`);
    levelElement.style.setProperty('top', `${Math.round(placement.top)}px`);
    if ('side' in placement) {
      levelElement.setAttribute('data-side', placement.side);
    } else {
      levelElement.setAttribute('data-horizontal', placement.horizontal);
      levelElement.setAttribute('data-vertical', placement.vertical);
    }
  }

  function positionBookmarkCascadeLevel(entry: CascadeLevelEntry): void {
    if (!entry || !entry.levelElement || !bookmarkCascadeMenu) {
      return;
    }
    const levelRect = getBookmarkCascadeElementRect(entry.levelElement);
    if (!levelRect) {
      return;
    }
    const viewport = getBookmarkCascadeViewport();
    const viewportTopPadding = Math.max(8, Number(getViewportTopPadding()) || 8);
    if (entry.levelIndex <= 0) {
      const anchorRect = getBookmarkCascadeElementRect(bookmarkCascadeAnchor, {
        ignoreElementTranslate: true
      });
      if (!anchorRect || typeof positionUtils.placeRootCascadeMenu !== 'function') {
        return;
      }
      const placement = positionUtils.placeRootCascadeMenu({
        anchorRect,
        menuRect: levelRect,
        viewport,
        spacing: 8,
        viewportPadding: 8,
        viewportTopPadding
      });
      entry.placement = placement;
      applyBookmarkCascadePlacement(entry.levelElement, placement);
      return;
    }
    const parentLevelRect = getBookmarkCascadeElementRect(entry.parentLevelElement);
    const triggerRect = getBookmarkCascadeElementRect(entry.triggerElement);
    if (!parentLevelRect || !triggerRect || typeof positionUtils.placeCascadeSubmenu !== 'function') {
      return;
    }
    const placement = positionUtils.placeCascadeSubmenu({
      parentLevelRect,
      triggerRect,
      menuRect: levelRect,
      viewport,
      spacing: BOOKMARK_CASCADE_SUBMENU_GAP_PX,
      viewportPadding: 8,
      viewportTopPadding
    });
    entry.placement = placement;
    applyBookmarkCascadePlacement(entry.levelElement, placement);
  }

  function positionBookmarkCascadeLevels(): void {
    if (!bookmarkCascadeMenu || bookmarkCascadeLevels.length === 0) {
      return;
    }
    bookmarkCascadeLevels.forEach((entry) => {
      positionBookmarkCascadeLevel(entry);
    });
  }

  function getBookmarkCascadeItems(folderId: unknown): readonly BookmarkItem[] {
    const id = String(folderId || '');
    const items = id ? getItems(id) : [];
    return Array.isArray(items) ? items : [];
  }

  function clearBookmarkCascadeLevelsFrom(levelIndex: number): void {
    if (!bookmarkCascadeMenu) {
      return;
    }
    const safeLevelIndex = Math.max(0, Math.floor(levelIndex) || 0);
    bookmarkCascadeLevels = bookmarkCascadeLevels.filter((entry) => {
      const shouldRemove = entry.levelIndex >= safeLevelIndex;
      if (shouldRemove && entry.triggerElement &&
          entry.triggerElement.getAttribute('aria-haspopup') === 'menu') {
        entry.triggerElement.setAttribute('aria-expanded', 'false');
        const icon = entry.triggerElement.querySelector('.x-nt-bookmark-cascade-icon--folder');
        if (icon) playFolderPathMorph(icon, entry.triggerElement.getAttribute('data-active') === 'true');
      }
      if (shouldRemove && entry.levelElement.parentNode) {
        entry.viewController.destroy();
        entry.levelElement.parentNode.removeChild(entry.levelElement);
      }
      return !shouldRemove;
    });
    if (bookmarkCascadeKeyboardLevelIndex >= safeLevelIndex) {
      bookmarkCascadeKeyboardLevelIndex = Math.max(0, safeLevelIndex - 1);
    }
    if (bookmarkCascadeHoverIntentTask &&
        bookmarkCascadeHoverIntentTask.levelIndex >= safeLevelIndex) {
      cancelBookmarkCascadeHoverIntent();
    }
  }

  function getBookmarkCascadeLevelItems(levelElement: HTMLElement | null | undefined): HTMLElement[] {
    if (!levelElement) {
      return [];
    }
    return queryHtmlElements(levelElement, '.x-nt-bookmark-cascade-item');
  }

  function getBookmarkCascadeRowAnimationKey(entry: CascadeLevelEntry, button: HTMLElement): string {
    const folderId = String(entry.folderId || '');
    const bookmarkId = String(button.getAttribute('data-bookmark-id') || '');
    return folderId && bookmarkId ? `${folderId}::${bookmarkId}` : '';
  }

  function getBookmarkCascadeRowRectMap(): Map<string, Rect> {
    const rects = new Map<string, Rect>();
    bookmarkCascadeLevels.forEach((entry) => {
      getBookmarkCascadeLevelItems(entry.levelElement).forEach((button) => {
        const key = getBookmarkCascadeRowAnimationKey(entry, button);
        const row = getRow(button);
        const rect = getBookmarkCascadeElementRect(row || button);
        if (key && rect) {
          rects.set(key, rect);
        }
      });
    });
    return rects;
  }

  function clearBookmarkCascadeRowLayoutAnimation(row: HTMLElement): void {
    const timer = rowLayoutAnimationTimers.get(row);
    if (timer) {
      clearTimer(timer);
      rowLayoutAnimationTimers.delete(row);
    }
    row.style.removeProperty('transition');
    row.style.removeProperty('transform');
    row.style.removeProperty('will-change');
  }

  // Rows that moved slide from where they were; a dragged row from where it
  // was dropped.
  function playBookmarkCascadeRowLayoutAnimation(
    beforeRects: ReadonlyMap<string, Rect>,
    animationOptions?: CascadeRefreshOptions
  ): boolean {
    if (!bookmarkCascadeMenu) {
      return false;
    }
    const optionsForAnimation = animationOptions || {};
    const draggedBookmarkId = String(optionsForAnimation.draggedBookmarkId || '');
    const draggedRect = optionsForAnimation.draggedRect || null;
    const shifts: { row: HTMLElement; dx: number; dy: number }[] = [];
    bookmarkCascadeLevels.forEach((entry) => {
      getBookmarkCascadeLevelItems(entry.levelElement).forEach((button) => {
        const bookmarkId = String(button.getAttribute('data-bookmark-id') || '');
        const key = getBookmarkCascadeRowAnimationKey(entry, button);
        const row = getRow(button);
        const before = bookmarkId && bookmarkId === draggedBookmarkId && draggedRect
          ? draggedRect
          : beforeRects.get(key);
        const after = getBookmarkCascadeElementRect(row || button);
        if (!row || !before || !after) {
          return;
        }
        const dx = Number(before.left) - Number(after.left);
        const dy = Number(before.top) - Number(after.top);
        if (!Number.isFinite(dx) || !Number.isFinite(dy) ||
            (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)) {
          return;
        }
        clearBookmarkCascadeRowLayoutAnimation(row);
        shifts.push({ row, dx, dy });
      });
    });
    if (shifts.length === 0) {
      return false;
    }
    shifts.forEach(({ row, dx, dy }) => {
      row.style.setProperty('transition', 'none');
      row.style.setProperty('transform', `translate3d(${dx}px, ${dy}px, 0)`);
      row.style.setProperty('will-change', 'transform');
    });
    void bookmarkCascadeMenu.offsetHeight;
    requestFrame(() => {
      shifts.forEach(({ row }) => {
        if (!row.isConnected) {
          return;
        }
        row.style.setProperty(
          'transition',
          `transform ${BOOKMARK_CASCADE_REORDER_ANIMATION_MS}ms ${BOOKMARK_CASCADE_REORDER_EASING}`
        );
        row.style.setProperty('transform', 'translate3d(0, 0, 0)');
        rowLayoutAnimationTimers.set(row, setTimer(() => {
          rowLayoutAnimationTimers.delete(row);
          clearBookmarkCascadeRowLayoutAnimation(row);
        }, BOOKMARK_CASCADE_REORDER_ANIMATION_MS + 80));
      });
    });
    return true;
  }

  function getBookmarkCascadeActiveItem(levelElement: HTMLElement): HTMLElement | null {
    const item = levelElement.querySelector('.x-nt-bookmark-cascade-item[data-active="true"]');
    return isHtmlElement(item) ? item : null;
  }

  function setBookmarkCascadeItemHoverSuppressed(itemButton: HTMLElement | null, suppressed: boolean): void {
    if (!itemButton) {
      return;
    }
    if (suppressed) {
      itemButton.setAttribute('data-hover-suppressed', 'true');
      return;
    }
    itemButton.removeAttribute('data-hover-suppressed');
  }

  function clearBookmarkCascadeLevelHoverSuppression(levelElement: HTMLElement): void {
    getBookmarkCascadeLevelItems(levelElement).forEach((button) => {
      setBookmarkCascadeItemHoverSuppressed(button, false);
    });
  }

  function focusBookmarkCascadeItem(itemButton: HTMLElement): void {
    try {
      itemButton.focus({ preventScroll: true });
    } catch (error) {
      itemButton.focus();
    }
  }

  function setBookmarkCascadeLevelActiveItem(
    levelElement: HTMLElement,
    activeButton: HTMLElement | null,
    options?: { focus?: boolean }
  ): void {
    getBookmarkCascadeLevelItems(levelElement).forEach((button) => {
      const active = button === activeButton;
      const submenuOpen = bookmarkCascadeLevels.some((entry) => entry.triggerElement === button);
      setBookmarkCascadeItemHoverSuppressed(button, false);
      button.setAttribute('data-active', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
      const icon = button.querySelector('.x-nt-bookmark-cascade-icon--folder');
      if (icon) {
        playFolderPathMorph(icon, active || submenuOpen);
      }
      if (!active && !submenuOpen && button.getAttribute('aria-haspopup') === 'menu') {
        button.setAttribute('aria-expanded', 'false');
      }
    });
    const entry = getBookmarkCascadeLevelEntryByElement(levelElement);
    if (entry) {
      entry.activeButton = activeButton || null;
      if (activeButton && options && options.focus) {
        bookmarkCascadeKeyboardLevelIndex = entry.levelIndex;
      }
    }
    if (activeButton && options && options.focus) {
      focusBookmarkCascadeItem(activeButton);
    }
  }

  function clearBookmarkCascadePointerActiveItem(
    levelElement: HTMLElement,
    nextButton: HTMLElement | null,
    event: PointerEvent
  ): void {
    const entry = getBookmarkCascadeLevelEntryByElement(levelElement);
    const activeButton = entry ? entry.activeButton : null;
    if (!entry || !activeButton || activeButton === nextButton) {
      return;
    }
    const point = updateBookmarkCascadePointer(event);
    if (shouldProtectBookmarkCascadeLevel(entry.levelIndex, point)) {
      setBookmarkCascadeItemHoverSuppressed(nextButton, Boolean(nextButton));
      return;
    }
    clearBookmarkCascadeLevelHoverSuppression(levelElement);
    clearBookmarkCascadeLevelsFrom(entry.levelIndex + 1);
    activeButton.setAttribute('data-active', 'false');
    activeButton.tabIndex = -1;
    if (activeButton.getAttribute('aria-haspopup') === 'menu') {
      activeButton.setAttribute('aria-expanded', 'false');
    }
    const icon = activeButton.querySelector('.x-nt-bookmark-cascade-icon--folder');
    if (icon) {
      playFolderPathMorph(icon, false);
    }
    entry.activeButton = null;
  }

  function selectFirstBookmarkCascadeItemInLevel(levelIndex: number, options?: { focus?: boolean }): boolean {
    const entry = getBookmarkCascadeLevelEntry(levelIndex);
    const firstItem = entry ? getBookmarkCascadeLevelItems(entry.levelElement)[0] : null;
    if (!entry || !firstItem) {
      return false;
    }
    setBookmarkCascadeLevelActiveItem(entry.levelElement, firstItem, options);
    return true;
  }

  function getBookmarkCascadeKeyboardEntry(): CascadeLevelEntry | null {
    const activeElement = documentObj ? documentObj.activeElement : null;
    if (bookmarkCascadeMenu && activeElement && bookmarkCascadeMenu.contains(activeElement)) {
      for (let index = bookmarkCascadeLevels.length - 1; index >= 0; index -= 1) {
        const entry = bookmarkCascadeLevels[index];
        if (entry && entry.levelElement && entry.levelElement.contains(activeElement)) {
          return entry;
        }
      }
    }
    return getBookmarkCascadeLevelEntry(bookmarkCascadeKeyboardLevelIndex) ||
      bookmarkCascadeLevels[bookmarkCascadeLevels.length - 1] ||
      null;
  }

  function moveBookmarkCascadeKeyboardSelection(direction: number): boolean {
    const entry = getBookmarkCascadeKeyboardEntry();
    const items = entry ? getBookmarkCascadeLevelItems(entry.levelElement) : [];
    if (!entry || items.length === 0) {
      return false;
    }
    const currentItem = entry.activeButton && items.includes(entry.activeButton)
      ? entry.activeButton
      : getBookmarkCascadeActiveItem(entry.levelElement);
    const currentIndex = currentItem ? items.indexOf(currentItem) : -1;
    const offset = direction < 0 ? -1 : 1;
    const nextIndex = currentIndex < 0
      ? (offset > 0 ? 0 : items.length - 1)
      : (currentIndex + offset + items.length) % items.length;
    const nextItem = items[nextIndex];
    setBookmarkCascadeLevelActiveItem(entry.levelElement, nextItem, { focus: true });
    clearBookmarkCascadeLevelsFrom(entry.levelIndex + 1);
    return true;
  }

  function enterBookmarkCascadeKeyboardSubmenu(): boolean {
    const entry = getBookmarkCascadeKeyboardEntry();
    if (!entry) {
      return false;
    }
    const activeItem = entry.activeButton ||
      getBookmarkCascadeActiveItem(entry.levelElement) ||
      getBookmarkCascadeLevelItems(entry.levelElement)[0];
    const action = activeItem ? bookmarkCascadeItemActions.get(activeItem) : null;
    if (!action || !action.isFolder) {
      return false;
    }
    action.openNestedLevel({ focusChild: true });
    return true;
  }

  function leaveBookmarkCascadeKeyboardSubmenu(): boolean {
    const entry = getBookmarkCascadeKeyboardEntry();
    if (!entry || entry.levelIndex <= 0) {
      return false;
    }
    const parentEntry = getBookmarkCascadeLevelEntry(entry.levelIndex - 1);
    const parentItem = entry.triggerElement || (parentEntry && parentEntry.activeButton);
    clearBookmarkCascadeLevelsFrom(entry.levelIndex);
    if (parentEntry && parentItem) {
      setBookmarkCascadeLevelActiveItem(parentEntry.levelElement, parentItem, { focus: true });
      if (parentItem.getAttribute('aria-haspopup') === 'menu') {
        parentItem.setAttribute('aria-expanded', 'false');
      }
    }
    return true;
  }

  function isBookmarkCascadeKeyboardTarget(target: EventTarget | null): boolean {
    if (!target) {
      return true;
    }
    const node = isNode(target) ? target : null;
    if (bookmarkCascadeMenu && bookmarkCascadeMenu.contains(node)) {
      return true;
    }
    if (bookmarkCascadeAnchor &&
        (target === bookmarkCascadeAnchor || bookmarkCascadeAnchor.contains(node))) {
      return true;
    }
    return Boolean(documentObj && (target === documentObj.body || target === documentObj.documentElement));
  }

  function handleBookmarkCascadeKeyboardNavigation(event: KeyboardEvent): boolean {
    if (!event || !bookmarkCascadeMenu || !isBookmarkCascadeKeyboardTarget(event.target)) {
      return false;
    }
    let handled = false;
    if (event.key === 'ArrowDown') {
      handled = moveBookmarkCascadeKeyboardSelection(1);
    } else if (event.key === 'ArrowUp') {
      handled = moveBookmarkCascadeKeyboardSelection(-1);
    } else if (event.key === 'ArrowRight') {
      handled = enterBookmarkCascadeKeyboardSubmenu();
    } else if (event.key === 'ArrowLeft') {
      handled = leaveBookmarkCascadeKeyboardSubmenu();
    }
    if (!handled) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function getBrowserFaviconCandidateForBookmark(url: string, host: string): string {
    const pageUrl = String(url || '').trim();
    if (!pageUrl) {
      return '';
    }
    if (!/^https?:\/\//i.test(pageUrl)) {
      return /^[a-z][a-z0-9+.-]*:/i.test(pageUrl)
        ? getChromeFaviconUrl(pageUrl)
        : '';
    }
    return host && isLocalNetworkHost(host)
      ? getChromeFaviconUrl(pageUrl)
      : '';
  }

  function getPrimaryFaviconCandidateForBookmark(url: string): string {
    return getBrowserPageFaviconUrl(url);
  }

  function shouldOpenUrlInBackground(event: Event | { metaKey?: boolean; ctrlKey?: boolean } | null | undefined): boolean {
    if (!event) {
      return false;
    }
    const button = 'button' in event ? Number(event.button) : 0;
    return Boolean(('metaKey' in event && event.metaKey) || ('ctrlKey' in event && event.ctrlKey) || button === 1);
  }

  function openBookmarkCascadeUrl(url: string, event: Event, anchor: BookmarkMenuAnchor | null): void {
    openUrl(url, {
      openInBackgroundTab: shouldOpenUrlInBackground(event),
      anchor
    });
  }


  function createBookmarkCascadeCopyTrigger(
    itemRow: HTMLElement,
    item: BookmarkItem,
    activateLeafItem: () => void,
    copyButton: HTMLButtonElement | null
  ): HTMLButtonElement | null {
    if (!item.url || !copyButton) {
      return null;
    }
    const copyLabel = t('bookmarks_copy_url', 'Copy link');
    const showCopyTooltip = () => {
      cancelBookmarkCascadeHoverIntent();
      hideCursorTooltip();
      activateLeafItem();
      if (copyTooltipController) {
        copyTooltipController.show(copyButton, copyLabel, {
          placement: 'top',
          maxWidth: 200,
          spacing: 8
        });
      }
    };
    const hideCopyTooltip = () => {
      if (copyTooltipController) {
        copyTooltipController.hide();
      }
    };

    copyButton.addEventListener('pointerenter', showCopyTooltip);
    copyButton.addEventListener('pointerleave', hideCopyTooltip);
    copyButton.addEventListener('focus', showCopyTooltip);
    copyButton.addEventListener('blur', hideCopyTooltip);
    copyButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    copyButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      hideCursorTooltip();
      hideCopyTooltip();
      Promise.resolve().then(() => copyUrl(item.url)).catch(noop);
    });
    if (copyButton.parentNode !== itemRow) {
      itemRow.appendChild(copyButton);
    }
    return copyButton;
  }

  function renderBookmarkCascadeMenuLevel(
    folderId: string,
    levelIndex: number,
    triggerElement: HTMLElement | null,
    parentLevelElement: HTMLElement | null,
    folderTitle: string
  ): CascadeLevelEntry | null {
    // Narrowed here, for the item handlers below.
    const menu = bookmarkCascadeMenu;
    if (!menu || !documentObj || !view) {
      return null;
    }
    const safeLevelIndex = Math.max(0, Math.floor(levelIndex) || 0);
    clearBookmarkCascadeLevelsFrom(safeLevelIndex);
    const items = getBookmarkCascadeItems(folderId).filter((item) => {
      return Boolean(item && (item.url || item.type === 'folder'));
    });
    const viewController = view.createLevel({
        documentObj,
        levelIndex: safeLevelIndex,
        folderId,
        folderTitle,
        items,
        sanitizeDisplayText,
        getFigmaFolderSvg,
        getRiSvg,
        getUrlDisplay,
        copyLabel: t('bookmarks_copy_url', 'Copy link'),
        emptyLabel: t('bookmarks_empty_folder', 'No content'),
        siteIconAlt: t('site_icon_alt', '站点')
      });
    const levelElement = viewController.element;
    applyBookmarkCascadeLevelSurface(levelElement);
    levelElement.setAttribute('data-level', String(safeLevelIndex));
    levelElement.setAttribute('role', 'menu');
    const contentElement = viewController.content;

    items.forEach((item, index) => {
      if (!item || (!item.url && item.type !== 'folder')) {
        return;
      }
      const isFolder = item.type === 'folder';
      const titleText = item.title || (item.url ? getUrlDisplay(item.url) : t('bookmarks_heading', 'Bookmarks'));
      const itemView: CascadeItemView | undefined = viewController.items[index];
      if (!itemView) {
        return;
      }
      const itemRow = itemView.row;
      const itemButton = itemView.button;
      itemButton.addEventListener('dragstart', (event) => {
        event.preventDefault();
      });
      itemButton.addEventListener('pointerdown', (event) => {
        onItemPointerDown({
          event,
          item,
          element: itemButton,
          parentFolderId: String(item.parentId || folderId || '')
        });
      });
      itemButton.addEventListener('contextmenu', (event) => {
        onItemContextMenu({
          event,
          item,
          element: itemButton,
          sourceKind: 'cascade',
          parentFolderId: String(item.parentId || folderId || '')
        });
      });

      const icon = itemView.icon;
      if (icon) {
        if (isFolder) {
          initFolderPathMorph(icon);
        } else if (isHtmlTag(icon, 'img')) {
          const themeUrl = item.themeUrl || item.url || '';
          const host = item.host || getHostFromUrl(themeUrl) || '';
          const siteName = getSiteDisplayName(host, item.title);
          icon.alt = siteName || t('site_icon_alt', '站点');
          const chosenIconUrl = getItemIconUrl(item, bookmarkCascadeAnchor);
          if (chosenIconUrl) {
            icon.src = chosenIconUrl;
            // Lumno's black glyph icons need inverting on dark menus.
            if (/\/glyph-(?:gh|gpt|mdn|wk|zw)\.svg(?:[?#]|$)/.test(chosenIconUrl)) {
              icon.setAttribute('data-builtin-monochrome', 'true');
            }
          } else {
            attachFaviconWithFallbacks(icon, item.url, host, {
              primaryUrl: getPrimaryFaviconCandidateForBookmark(item.url),
              browserUrl: getBrowserFaviconCandidateForBookmark(item.url, host)
            });
          }
        }
      }

      const openNestedLevel = (openOptions?: { focusChild?: boolean }): void => {
        if (!isFolder) {
          return;
        }
        const existingChildEntry = getBookmarkCascadeLevelEntry(safeLevelIndex + 1);
        if (existingChildEntry &&
            String(existingChildEntry.folderId || '') === String(item.id || '')) {
          if (itemButton.getAttribute('data-active') !== 'true') {
            setBookmarkCascadeLevelActiveItem(levelElement, itemButton);
            itemButton.setAttribute('aria-expanded', 'true');
          }
          if (openOptions && openOptions.focusChild) {
            selectFirstBookmarkCascadeItemInLevel(existingChildEntry.levelIndex, { focus: true });
          }
          return;
        }
        setBookmarkCascadeLevelActiveItem(levelElement, itemButton);
        itemButton.setAttribute('aria-expanded', 'true');
        const childEntry = renderBookmarkCascadeMenuLevel(item.id, safeLevelIndex + 1, itemButton, levelElement, item.title);
        if (openOptions && openOptions.focusChild && childEntry) {
          selectFirstBookmarkCascadeItemInLevel(childEntry.levelIndex, { focus: true });
        }
      };

      const activateLeafItem = () => {
        setBookmarkCascadeLevelActiveItem(levelElement, itemButton);
        clearBookmarkCascadeLevelsFrom(safeLevelIndex + 1);
      };

      const navigateLeafItem = (event: Event): void => {
        cancelBookmarkCascadeHoverIntent();
        hideCursorTooltip();
        // Closing the menu clears its anchor.
        const anchor = bookmarkCascadeAnchor;
        if (!shouldOpenUrlInBackground(event)) {
          close();
        }
        openBookmarkCascadeUrl(item.url, event, anchor);
      };

      bookmarkCascadeItemActions.set(itemButton, {
        item,
        isFolder,
        openNestedLevel,
        activateLeafItem,
        navigateLeafItem
      });

      if (isFolder) {
        itemRow.classList.add('x-nt-bookmark-cascade-row--folder');
        itemButton.classList.add('x-nt-bookmark-cascade-item--folder');
        itemButton.setAttribute('aria-haspopup', 'menu');
        itemButton.setAttribute('aria-expanded', 'false');
        itemButton.addEventListener('pointerenter', (event) => {
          clearBookmarkCascadePointerActiveItem(levelElement, itemButton, event);
          scheduleBookmarkCascadeHoverIntent({
            levelIndex: safeLevelIndex,
            triggerElement: itemButton,
            run: () => openNestedLevel()
          }, event);
        });
        itemButton.addEventListener('pointerleave', (event) => {
          cancelBookmarkCascadeHoverIntentFor(itemButton);
          setBookmarkCascadeItemHoverSuppressed(itemButton, false);
          clearBookmarkCascadePointerActiveItem(levelElement, null, event);
        });
        itemButton.addEventListener('focus', () => {
          cancelBookmarkCascadeHoverIntent();
          setBookmarkCascadeLevelActiveItem(levelElement, itemButton);
          clearBookmarkCascadeLevelsFrom(safeLevelIndex + 1);
        });
        itemButton.addEventListener('click', () => {
          cancelBookmarkCascadeHoverIntent();
          openNestedLevel();
        });
        itemButton.addEventListener('keydown', (event) => {
          if (!event) {
            return;
          }
          if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            cancelBookmarkCascadeHoverIntent();
            openNestedLevel();
          }
        });
      } else {
        createBookmarkCascadeCopyTrigger(
          itemRow,
          item,
          activateLeafItem,
          itemView.copyButton
        );
        bindCursorTooltip(itemButton, () => titleText, {
          maxWidth: 460,
          shouldShow: (_target, event) => shouldOpenUrlInBackground(event)
        });
        itemButton.addEventListener('pointerenter', (event) => {
          clearBookmarkCascadePointerActiveItem(levelElement, itemButton, event);
          scheduleBookmarkCascadeHoverIntent({
            levelIndex: safeLevelIndex,
            triggerElement: itemButton,
            run: activateLeafItem
          }, event);
        });
        itemButton.addEventListener('pointerleave', (event) => {
          if (isNode(event.relatedTarget) && itemRow.contains(event.relatedTarget)) {
            return;
          }
          cancelBookmarkCascadeHoverIntentFor(itemButton);
          setBookmarkCascadeItemHoverSuppressed(itemButton, false);
          clearBookmarkCascadePointerActiveItem(levelElement, null, event);
        });
        itemButton.addEventListener('focus', () => {
          cancelBookmarkCascadeHoverIntent();
          activateLeafItem();
        });
        itemButton.addEventListener('click', (event) => {
          if (isActivationSuppressed()) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          navigateLeafItem(event);
        });
        itemButton.addEventListener('auxclick', (event) => {
          if (!event || Number(event.button) !== 1) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (isActivationSuppressed()) {
            return;
          }
          navigateLeafItem(event);
        });
        itemButton.addEventListener('keydown', (event) => {
          if (!event || (event.key !== 'Enter' && event.key !== ' ')) {
            return;
          }
          event.preventDefault();
          navigateLeafItem(event);
        });
      }
      if (itemRow.parentNode !== contentElement) {
        contentElement.appendChild(itemRow);
      }
    });

    menu.appendChild(levelElement);
    lockBookmarkCascadeLevelWidth(levelElement);
    const entry: CascadeLevelEntry = {
      folderId: String(folderId || ''),
      folderTitle: String(folderTitle || ''),
      levelIndex: safeLevelIndex,
      levelElement,
      triggerElement: safeLevelIndex > 0 ? triggerElement : bookmarkCascadeAnchor,
      parentLevelElement: safeLevelIndex > 0 ? parentLevelElement : null,
      viewController
    };
    bookmarkCascadeLevels.push(entry);
    positionBookmarkCascadeLevel(entry);
    openBookmarkCascadeLevelSurface(levelElement);
    return entry;
  }

  // Opens the folder's menu from the anchor; `toggle` closes it when it is
  // already open, `dragMode` opens it as a drop target, and `shouldOpen`
  // may still cancel it once the bookmarks are read.
  function open(
    item: { id?: unknown; title?: string } | null,
    anchorElement: BookmarkMenuAnchor | null,
    openOptions?: { dragMode?: boolean; toggle?: boolean; shouldOpen?: () => boolean }
  ): void {
    const optionsForOpen = openOptions || {};
    const dragMode = optionsForOpen.dragMode === true;
    const folderId = String(item && item.id || '').trim();
    const folderTitle = String(item && item.title || '');
    if (!folderId || !anchorElement || !documentObj || !documentObj.body) {
      return;
    }
    if (optionsForOpen.toggle === true && !dragMode &&
        (isBookmarkCascadeMenuOpenFor(folderId, anchorElement, dragMode) ||
         (bookmarkCascadeOpenRequest &&
          bookmarkCascadeOpenRequest.folderId === folderId &&
          bookmarkCascadeOpenRequest.anchorElement === anchorElement &&
          bookmarkCascadeOpenRequest.dragMode === dragMode))) {
      close({ restoreFocus: true });
      return;
    }
    if (isBookmarkCascadeMenuOpenFor(folderId, anchorElement, dragMode)) {
      cancelBookmarkCascadeHoverIntent();
      cancelBookmarkCascadeDelayedClose();
      positionBookmarkCascadeLevels();
      return;
    }
    if (!dragMode && isBookmarkCascadeHoverSuppressed(anchorElement, null)) {
      setAnchorVisualActive(anchorElement, false);
      return;
    }
    cancelBookmarkCascadeOpenRequest();
    const openRequest = { folderId, anchorElement, dragMode };
    bookmarkCascadeOpenRequest = openRequest;
    Promise.resolve(ensureReady(false)).then((ready) => {
      if (bookmarkCascadeOpenRequest !== openRequest) {
        return;
      }
      bookmarkCascadeOpenRequest = null;
      if (typeof optionsForOpen.shouldOpen === 'function' && !optionsForOpen.shouldOpen()) {
        return;
      }
      if (!dragMode && isBookmarkCascadeHoverSuppressed(anchorElement, null)) {
        setAnchorVisualActive(anchorElement, false);
        return;
      }
      if (!ready || !anchorElement.isConnected || !view || !documentObj.body) {
        setAnchorVisualActive(anchorElement, false);
        return;
      }
      if (isBookmarkCascadeMenuOpenFor(folderId, anchorElement, dragMode)) {
        cancelBookmarkCascadeHoverIntent();
        cancelBookmarkCascadeDelayedClose();
        positionBookmarkCascadeLevels();
        return;
      }
      close();
      bookmarkCascadeAnchor = anchorElement;
      anchorElement.setAttribute('aria-expanded', 'true');
      setAnchorVisualActive(anchorElement, true);
      const menu = view.createMenu(documentObj);
      bookmarkCascadeMenu = menu;
      menu.setAttribute('role', 'menu');
      setDocumentListenersAttached(true);
      setBookmarkCascadeDragMode(dragMode);
      documentObj.body.appendChild(menu);
      bookmarkCascadeKeyboardLevelIndex = 0;
      renderBookmarkCascadeMenuLevel(folderId, 0, anchorElement, null, folderTitle);
      if (!dragMode) {
        selectFirstBookmarkCascadeItemInLevel(0, { focus: true });
      }
    });
  }

  function getBookmarkCascadeRootFolderId(): string {
    const rootEntry = getBookmarkCascadeLevelEntry(0);
    return rootEntry ? String(rootEntry.folderId || '') : '';
  }

  function isBookmarkCascadeMenuOpenFor(folderId: string, anchorElement: HTMLElement, dragMode: boolean): boolean {
    return Boolean(
      bookmarkCascadeMenu &&
      bookmarkCascadeAnchor === anchorElement &&
      getBookmarkCascadeRootFolderId() === folderId &&
      bookmarkCascadeDragMode === dragMode
    );
  }

  // Moves the open menu to a new anchor for the same folder, e.g. once the
  // card it opened from was drawn again.
  function rebindBookmarkCascadeAnchor(
    anchorElement: BookmarkMenuAnchor | null,
    rebindOptions?: { instant?: boolean }
  ): boolean {
    if (!bookmarkCascadeMenu || !anchorElement || !anchorElement.isConnected) {
      return false;
    }
    const rootFolderId = getBookmarkCascadeRootFolderId();
    const anchorFolderId = String(anchorElement.getAttribute('data-bookmark-id') || '');
    if (!rootFolderId || anchorFolderId !== rootFolderId) {
      return false;
    }
    const visualOptions = {
      instant: !rebindOptions || rebindOptions.instant !== false
    };
    const previousAnchor = bookmarkCascadeAnchor;
    if (previousAnchor && previousAnchor !== anchorElement) {
      previousAnchor.setAttribute('aria-expanded', 'false');
      setAnchorVisualActive(previousAnchor, false, visualOptions);
    }
    bookmarkCascadeAnchor = anchorElement;
    anchorElement.setAttribute('aria-expanded', 'true');
    setAnchorVisualActive(anchorElement, true, visualOptions);
    const rootEntry = getBookmarkCascadeLevelEntry(0);
    if (rootEntry) {
      rootEntry.triggerElement = anchorElement;
    }
    positionBookmarkCascadeLevels();
    return true;
  }

  // Draws the open levels again from fresh bookmarks, keeping the open path.
  function refreshBookmarkCascadeMenu(refreshOptions?: CascadeRefreshOptions): Promise<boolean> {
    if (!bookmarkCascadeMenu || !bookmarkCascadeAnchor || bookmarkCascadeLevels.length === 0) {
      return Promise.resolve(false);
    }
    const menuAtRefreshStart = bookmarkCascadeMenu;
    const rowRectsBeforeRefresh = getBookmarkCascadeRowRectMap();
    const openPath = bookmarkCascadeLevels.map((entry) => ({
      folderId: entry.folderId,
      folderTitle: entry.folderTitle
    }));
    // The caller invalidates the shared runtime before refreshing. Reuse the
    // in-flight reload so the cascade and card surface cannot cancel each other.
    return Promise.resolve(ensureReady(false)).then((ready) => {
      const anchorAtRefresh = bookmarkCascadeAnchor;
      if (!ready ||
          bookmarkCascadeMenu !== menuAtRefreshStart ||
          !anchorAtRefresh ||
          !anchorAtRefresh.isConnected ||
          !openPath[0] ||
          !openPath[0].folderId) {
        return false;
      }
      cancelBookmarkCascadeHoverIntent();
      cancelBookmarkCascadeDelayedClose();
      clearBookmarkCascadeDragTarget();
      bookmarkCascadeRefreshInProgress = true;
      menuAtRefreshStart.setAttribute('data-refreshing', 'true');
      try {
        clearBookmarkCascadeLevelsFrom(0);
        anchorAtRefresh.setAttribute('aria-expanded', 'true');
        const rootEntry = renderBookmarkCascadeMenuLevel(
          openPath[0].folderId,
          0,
          anchorAtRefresh,
          null,
          openPath[0].folderTitle
        );
        if (!rootEntry) {
          return false;
        }
        for (let pathIndex = 1; pathIndex < openPath.length; pathIndex += 1) {
          const parentEntry = getBookmarkCascadeLevelEntry(pathIndex - 1);
          const pathItem = openPath[pathIndex];
          const triggerElement = parentEntry
            ? getBookmarkCascadeLevelItems(parentEntry.levelElement).find((button) =>
              String(button.getAttribute('data-bookmark-id') || '') === pathItem.folderId
            )
            : null;
          const action = triggerElement ? bookmarkCascadeItemActions.get(triggerElement) : null;
          if (!action || !action.isFolder) {
            break;
          }
          action.openNestedLevel();
        }
        positionBookmarkCascadeLevels();
        playBookmarkCascadeRowLayoutAnimation(rowRectsBeforeRefresh, refreshOptions);
        return true;
      } finally {
        bookmarkCascadeRefreshInProgress = false;
        requestFrame(() => {
          if (bookmarkCascadeMenu === menuAtRefreshStart) {
            menuAtRefreshStart.removeAttribute('data-refreshing');
          }
        });
      }
    });
  }

  function getBookmarkCascadeDragDropTargetAtPoint(point: Point | null): CascadeDropMatch | null {
    if (!point || !bookmarkCascadeMenu) {
      return null;
    }
    for (let levelIndex = bookmarkCascadeLevels.length - 1; levelIndex >= 0; levelIndex -= 1) {
      const entry = bookmarkCascadeLevels[levelIndex];
      const buttons = entry ? getBookmarkCascadeLevelItems(entry.levelElement) : [];
      if (entry && buttons.length === 0 && isPointInsideRect(point, getBookmarkCascadeElementRect(entry.levelElement))) {
        return { entry, kind: 'insertion', folderId: entry.folderId, index: 0,
          element: null, markerElement: null, markerPosition: 'before' };
      }
      const rows = buttons.map((button) => {
        const row = getRow(button);
        return {
          button,
          row,
          rect: getBookmarkCascadeElementRect(row || button)
        };
      });
      for (let itemIndex = 0; itemIndex < buttons.length; itemIndex += 1) {
        const rowEntry = rows[itemIndex];
        const button = rowEntry.button;
        const row = rowEntry.row;
        const rect = rowEntry.rect;
        if (!rect) {
          continue;
        }
        const previousRect = itemIndex > 0 ? rows[itemIndex - 1].rect : null;
        const nextRect = itemIndex < rows.length - 1 ? rows[itemIndex + 1].rect : null;
        const hitRect = {
          left: rect.left,
          right: rect.right,
          top: previousRect ? (previousRect.bottom + rect.top) / 2 : rect.top,
          bottom: nextRect ? (rect.bottom + nextRect.top) / 2 : rect.bottom
        };
        if (!isPointInsideRect(point, hitRect)) {
          continue;
        }
        const itemIndexValue = Number(button.getAttribute('data-bookmark-index'));
        if (!Number.isFinite(itemIndexValue)) {
          return null;
        }
        const relativeY = rect.height > 0
          ? Math.max(0, Math.min(1, (point.y - rect.top) / rect.height))
          : 0.5;
        const isFolder = button.getAttribute('data-type') === 'folder';
        if (isFolder &&
            relativeY >= BOOKMARK_CASCADE_FOLDER_DROP_MIN_RATIO &&
            relativeY <= BOOKMARK_CASCADE_FOLDER_DROP_MAX_RATIO) {
          return {
            button,
            entry,
            kind: 'cascade',
            folderId: button.getAttribute('data-bookmark-drop-folder-id') || '',
            title: button.getAttribute('data-bookmark-drop-folder-title') || '',
            element: button
          };
        }
        const markerPosition = isFolder
          ? (relativeY < BOOKMARK_CASCADE_FOLDER_DROP_MIN_RATIO ? 'before' : 'after')
          : (relativeY < 0.5 ? 'before' : 'after');
        return {
          button,
          entry,
          kind: 'insertion',
          folderId: String(entry.folderId || ''),
          index: itemIndexValue + (markerPosition === 'after' ? 1 : 0),
          element: row || button,
          markerElement: row || button,
          markerPosition
        };
      }
    }
    return null;
  }

  // Leans the rows above and below an insertion point apart.
  function syncBookmarkCascadeInsertionGap(
    row: HTMLElement | null,
    markerPosition: string,
    levelElement?: HTMLElement | null
  ): void {
    if (!crossSurfaceDrag) {
      return;
    }
    const rows = row && levelElement
      ? getBookmarkCascadeLevelItems(levelElement).map((button) => getRow(button) || button)
      : [];
    const { before, after } = crossSurfaceDrag.getInsertionGapNeighbors(rows, row, markerPosition);
    crossSurfaceDrag.setInsertionGap(insertionGapOwner, before, after);
  }

  function clearBookmarkCascadeDragTarget(): void {
    if (bookmarkCascadeDragTargetButton) {
      bookmarkCascadeDragTargetButton.removeAttribute('data-bookmark-drop-target');
    }
    if (bookmarkCascadeDragInsertionElement) {
      bookmarkCascadeDragInsertionElement.removeAttribute('data-bookmark-insert-position');
    }
    syncBookmarkCascadeInsertionGap(null, '');
    bookmarkCascadeDragTargetButton = null;
    bookmarkCascadeDragInsertionElement = null;
  }

  // Follows a drag over the open menu: marks the row it would drop on and
  // opens a folder it rests over.
  function updateBookmarkCascadeDragPointer(pointInput: PointLike | null | undefined): CascadeDragTarget | null {
    if (!bookmarkCascadeMenu || !bookmarkCascadeDragMode) {
      return null;
    }
    const point = getBookmarkCascadePointFromEvent(pointInput);
    if (!point) {
      return null;
    }
    updateBookmarkCascadePointer(pointInput);
    const match = getBookmarkCascadeDragDropTargetAtPoint(point);
    if (!match) {
      clearBookmarkCascadeDragTarget();
      const isInsideInteractiveArea = isBookmarkCascadePointInsideInteractiveArea(point);
      if (isInsideInteractiveArea) {
        cancelBookmarkCascadeDelayedClose();
      } else {
        scheduleBookmarkCascadeDelayedClose();
      }
      return isInsideInteractiveArea
        ? { kind: 'blocked', surface: 'cascade' }
        : null;
    }
    cancelBookmarkCascadeDelayedClose();
    const nextTargetButton = match.kind === 'cascade' ? match.button : null;
    const nextInsertionElement = match.kind === 'insertion' ? match.markerElement : null;
    const nextInsertionPosition = match.kind === 'insertion' ? match.markerPosition : '';
    const targetChanged = bookmarkCascadeDragTargetButton !== nextTargetButton ||
      bookmarkCascadeDragInsertionElement !== nextInsertionElement ||
      (nextInsertionElement &&
        nextInsertionElement.getAttribute('data-bookmark-insert-position') !== nextInsertionPosition);
    if (targetChanged) {
      clearBookmarkCascadeDragTarget();
      bookmarkCascadeDragTargetButton = nextTargetButton;
      bookmarkCascadeDragInsertionElement = nextInsertionElement;
      if (bookmarkCascadeDragTargetButton) {
        bookmarkCascadeDragTargetButton.setAttribute('data-bookmark-drop-target', 'true');
      }
      if (bookmarkCascadeDragInsertionElement) {
        bookmarkCascadeDragInsertionElement.setAttribute(
          'data-bookmark-insert-position',
          nextInsertionPosition
        );
      }
      syncBookmarkCascadeInsertionGap(
        bookmarkCascadeDragInsertionElement,
        nextInsertionPosition,
        match.entry.levelElement
      );
      const action = match.kind === 'cascade'
        ? bookmarkCascadeItemActions.get(match.button)
        : null;
      if (action && action.isFolder && match.kind === 'cascade') {
        scheduleBookmarkCascadeHoverIntent({
          levelIndex: match.entry.levelIndex,
          triggerElement: match.button,
          allowWhenSuppressed: true,
          run: () => action.openNestedLevel()
        }, {
          clientX: point.x,
          clientY: point.y,
          pointerType: 'mouse'
        });
        if (bookmarkCascadeHoverIntentTask) {
          clearTimer(bookmarkCascadeHoverIntentTimer);
          bookmarkCascadeHoverIntentTimer = setTimer(
            runBookmarkCascadeHoverIntentTask,
            BOOKMARK_CASCADE_DRAG_OPEN_DELAY_MS
          );
        }
      } else {
        cancelBookmarkCascadeHoverIntent();
      }
    }
    return match.kind === 'cascade'
      ? {
        folderId: match.folderId,
        title: match.title,
        element: match.element,
        markerElement: null,
        markerPosition: '',
        kind: match.kind,
        surface: 'cascade'
      }
      : {
        folderId: match.folderId,
        title: '',
        index: match.index,
        element: match.element,
        markerElement: match.markerElement,
        markerPosition: match.markerPosition,
        kind: match.kind,
        surface: 'cascade'
      };
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (!bookmarkCascadeMenu) {
      return;
    }
    const target = event.target;
    const node = isNode(target) ? target : null;
    if (bookmarkCascadeMenu.contains(node) ||
        (bookmarkCascadeAnchor && (target === bookmarkCascadeAnchor || bookmarkCascadeAnchor.contains(node))) ||
        shouldKeepOpenForExternalNode(target)) {
      return;
    }
    close();
  }

  // Escape goes through the page's dismiss stack, so it closes this menu
  // only when the menu is the top layer.
  function handleDocumentKeyDown(event: KeyboardEvent): void {
    if (!bookmarkCascadeMenu) {
      return;
    }
    handleBookmarkCascadeKeyboardNavigation(event);
  }

  if (dismissStack) {
    dismissStack.register(DISMISS_LAYER_KEY, {
      isOpen: () => Boolean(bookmarkCascadeMenu),
      close: () => close({ restoreFocus: true })
    });
  }

  // The document listeners exist only while a menu is open.
  let documentListenersAttached = false;
  function setDocumentListenersAttached(attached: boolean): void {
    if (attached === documentListenersAttached || !documentObj) {
      return;
    }
    documentListenersAttached = attached;
    if (attached) {
      documentObj.addEventListener('pointerdown', handleDocumentPointerDown, true);
      documentObj.addEventListener('pointermove', handleBookmarkCascadeDocumentPointerMove, true);
      documentObj.addEventListener('keydown', handleDocumentKeyDown, true);
    } else {
      documentObj.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      documentObj.removeEventListener('pointermove', handleBookmarkCascadeDocumentPointerMove, true);
      documentObj.removeEventListener('keydown', handleDocumentKeyDown, true);
    }
  }

  return Object.freeze({
    close,
    getRootFolderId: getBookmarkCascadeRootFolderId,
    getAnchor: () => bookmarkCascadeAnchor,
    isOpen: () => Boolean(bookmarkCascadeMenu),
    isDragMode: () => bookmarkCascadeDragMode,
    open,
    positionLevels: positionBookmarkCascadeLevels,
    rebindAnchor: rebindBookmarkCascadeAnchor,
    clearDragTarget: clearBookmarkCascadeDragTarget,
    refresh: refreshBookmarkCascadeMenu,
    setDragMode: setBookmarkCascadeDragMode,
    updateDragPointer: updateBookmarkCascadeDragPointer
  });
}

type BookmarkCascadeRuntime = ReturnType<typeof createBookmarkCascadeMenuRuntime>;

export { createBookmarkCascadeMenuRuntime };
export type {
  BookmarkCascadeMenuOptions,
  BookmarkCascadeRuntime,
  BookmarkMenuAnchor,
  CascadeDragTarget,
  CascadeItemEventDetail,
  CascadeRefreshOptions
};
