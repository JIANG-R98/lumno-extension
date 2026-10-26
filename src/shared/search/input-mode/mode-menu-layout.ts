// Placing the mode menu: its offset below results, fitting it in the
// viewport, and the frames that reveal and conceal it.
import type { SetStyle } from './types';

// The controller state search-input-mode.ts shares with its modules.
interface ModeMenuLayoutState {
  destroyed: boolean;
  modeMenuOpen: boolean;
  modeMenuRevealed: boolean;
}

interface ModeMenuLayoutConfig {
  onModeMenuLayoutChange?(details: { menuElement: HTMLElement; open: boolean }): void;
}

// The page window, or a stand-in with the members used here.
type ModeMenuLayoutWindow = Partial<Pick<Window,
  'visualViewport' | 'innerHeight' | 'requestAnimationFrame' | 'cancelAnimationFrame' | 'setTimeout' | 'clearTimeout'>>;

interface ModeMenuLayoutDeps {
  setStyle: SetStyle;
  modeMenu: HTMLElement;
  container: HTMLElement;
  win: ModeMenuLayoutWindow | null | undefined;
  doc: Document | null | undefined;
  DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET: number;
  config: ModeMenuLayoutConfig;
  renderModeMenuView: () => unknown;
  inputModeState: ModeMenuLayoutState;
}

interface FitModeMenuOptions {
  // The viewport's bottom edge, when the surface knows it better.
  viewportBottom?: number;
  bottomInset?: number;
}

interface ModeMenuLayoutContext {
  readonly setStyle: ModeMenuLayoutDeps['setStyle'];
  readonly modeMenu: ModeMenuLayoutDeps['modeMenu'];
  readonly container: ModeMenuLayoutDeps['container'];
  readonly win: ModeMenuLayoutDeps['win'];
  readonly doc: ModeMenuLayoutDeps['doc'];
  readonly DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET: ModeMenuLayoutDeps['DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET'];
  readonly config: ModeMenuLayoutDeps['config'];
  readonly renderModeMenuView: ModeMenuLayoutDeps['renderModeMenuView'];
  readonly inputModeState: ModeMenuLayoutDeps['inputModeState'];
  modeMenuRevealFrame: number;
  modeMenuRevealFrameKind: '' | 'animation' | 'timeout';
}

// Moves the menu down by the height of the results shown above it.
function setModeMenuResultOffset(ctx: ModeMenuLayoutContext, offset: unknown): void {
  const numericOffset = Number(offset);
  const nextOffset = Number.isFinite(numericOffset)
    ? Math.max(0, numericOffset)
    : 0;
  ctx.setStyle(
    ctx.modeMenu,
    '--x-lumno-search-mode-menu-result-offset',
    `${nextOffset}px`
  );
}

// The bottom edge of the visible viewport, unless the caller names one.
function readViewportBottom(ctx: ModeMenuLayoutContext, fitOptions: FitModeMenuOptions): number {
  const configuredViewportBottom = Number(fitOptions.viewportBottom);
  if (Number.isFinite(configuredViewportBottom)) {
    return configuredViewportBottom;
  }
  const visualViewport = ctx.win && ctx.win.visualViewport;
  if (visualViewport && Number.isFinite(Number(visualViewport.height))) {
    return Math.max(0, Number(visualViewport.offsetTop) || 0) + Math.max(0, Number(visualViewport.height) || 0);
  }
  return Math.max(
    0,
    Number(ctx.win && ctx.win.innerHeight) ||
      Number(ctx.doc && ctx.doc.documentElement && ctx.doc.documentElement.clientHeight) ||
      0
  );
}

// The container's vertical scale (a transformed ancestor), with its
// layout height and rect.
function readContainerScale(ctx: ModeMenuLayoutContext): { rect: DOMRect; layoutHeight: number; scaleY: number } {
  const rect = ctx.container.getBoundingClientRect();
  const layoutHeight = Math.max(0, Number(ctx.container.offsetHeight) || Number(rect.height) || 0);
  const renderedHeight = Math.max(0, Number(rect.height) || layoutHeight);
  return { rect, layoutHeight, scaleY: layoutHeight > 0 ? renderedHeight / layoutHeight : 1 };
}

// Caps the menu's height to the viewport below the input; returns the
// space left under the menu, or null while it is closed.
function fitModeMenuWithinViewport(ctx: ModeMenuLayoutContext, options?: FitModeMenuOptions | null): number | null {
  const fitOptions: FitModeMenuOptions = options || {};
  const viewportMaxHeightProperty =
    '--x-lumno-search-mode-menu-viewport-max-height';
  if (ctx.inputModeState.destroyed || !ctx.inputModeState.modeMenuOpen) {
    ctx.modeMenu.style.removeProperty(viewportMaxHeightProperty);
    return null;
  }
  const { rect: containerRect, layoutHeight: containerLayoutHeight, scaleY } = readContainerScale(ctx);
  if (!Number.isFinite(scaleY) || scaleY <= 0) {
    return null;
  }
  const viewportBottom = readViewportBottom(ctx, fitOptions);
  const configuredBottomInset = Number(fitOptions.bottomInset);
  const bottomInset = Number.isFinite(configuredBottomInset)
    ? Math.max(0, configuredBottomInset)
    : ctx.DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET;
  const menuGap = Math.max(
    0,
    (Number(ctx.modeMenu.offsetTop) || containerLayoutHeight) -
      containerLayoutHeight
  );
  const availableLayoutHeight = Math.max(
    0,
    ((viewportBottom - bottomInset - Number(containerRect.bottom || 0)) /
      scaleY) - menuGap
  );
  ctx.setStyle(
    ctx.modeMenu,
    viewportMaxHeightProperty,
    `${Math.floor(availableLayoutHeight)}px`
  );
  const menuLayoutHeight = Math.max(
    0,
    Number(ctx.modeMenu.offsetHeight) ||
      (Number(ctx.modeMenu.getBoundingClientRect().height) || 0) / scaleY
  );
  return Math.max(
    0,
    Math.floor(availableLayoutHeight - menuLayoutHeight)
  );
}

function notifyModeMenuLayoutChange(ctx: ModeMenuLayoutContext): void {
  if (typeof ctx.config.onModeMenuLayoutChange === 'function') {
    ctx.config.onModeMenuLayoutChange({
      menuElement: ctx.modeMenu,
      open: ctx.inputModeState.modeMenuOpen
    });
  }
}

function requestModeMenuFrame(ctx: ModeMenuLayoutContext, callback: () => void): number {
  if (ctx.win && typeof ctx.win.requestAnimationFrame === 'function') {
    return ctx.win.requestAnimationFrame(callback);
  }
  if (ctx.win && typeof ctx.win.setTimeout === 'function') {
    return ctx.win.setTimeout(callback, 0);
  }
  callback();
  return 0;
}

function cancelModeMenuRevealFrame(ctx: ModeMenuLayoutContext): void {
  if (!ctx.modeMenuRevealFrame || !ctx.win) {
    ctx.modeMenuRevealFrame = 0;
    ctx.modeMenuRevealFrameKind = '';
    return;
  }
  if (ctx.modeMenuRevealFrameKind === 'animation' &&
      typeof ctx.win.cancelAnimationFrame === 'function') {
    ctx.win.cancelAnimationFrame(ctx.modeMenuRevealFrame);
  } else if (ctx.modeMenuRevealFrameKind === 'timeout' &&
      typeof ctx.win.clearTimeout === 'function') {
    ctx.win.clearTimeout(ctx.modeMenuRevealFrame);
  }
  ctx.modeMenuRevealFrame = 0;
  ctx.modeMenuRevealFrameKind = '';
}

function requestModeMenuRevealFrame(ctx: ModeMenuLayoutContext, callback: () => void): number {
  cancelModeMenuRevealFrame(ctx);
  let completedSynchronously = false;
  const frame = requestModeMenuFrame(ctx, () => {
    completedSynchronously = true;
    ctx.modeMenuRevealFrame = 0;
    ctx.modeMenuRevealFrameKind = '';
    callback();
  });
  if (!completedSynchronously) {
    ctx.modeMenuRevealFrame = frame;
    ctx.modeMenuRevealFrameKind = ctx.win &&
      typeof ctx.win.requestAnimationFrame === 'function'
      ? 'animation'
      : 'timeout';
  }
  return frame;
}

function isModeMenuVisible(ctx: ModeMenuLayoutContext): boolean {
  return Boolean(!ctx.inputModeState.destroyed && ctx.inputModeState.modeMenuOpen);
}

// Draws the menu closed for a frame, then open, so the open motion
// plays; not if it closed by then.
function revealModeMenuSurface(ctx: ModeMenuLayoutContext): void {
  ctx.inputModeState.modeMenuRevealed = false;
  ctx.renderModeMenuView();
  requestModeMenuRevealFrame(ctx, () => {
    if (ctx.inputModeState.modeMenuOpen) {
      ctx.inputModeState.modeMenuRevealed = true;
      ctx.renderModeMenuView();
    }
  });
}

function concealModeMenuSurface(ctx: ModeMenuLayoutContext): void {
  ctx.inputModeState.modeMenuRevealed = false;
  ctx.renderModeMenuView();
}

function createModeMenuLayout(deps: ModeMenuLayoutDeps) {
  const {
    setStyle,
    modeMenu,
    container,
    win,
    doc,
    DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET,
    config,
    renderModeMenuView
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;
  const ctx: ModeMenuLayoutContext = {
    setStyle,
    modeMenu,
    container,
    win,
    doc,
    DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET,
    config,
    renderModeMenuView,
    inputModeState,
    modeMenuRevealFrame: 0,
    modeMenuRevealFrameKind: ''
  };

  return {
    setModeMenuResultOffset: (offset: unknown) => setModeMenuResultOffset(ctx, offset),
    fitModeMenuWithinViewport: (options?: FitModeMenuOptions | null) => fitModeMenuWithinViewport(ctx, options),
    notifyModeMenuLayoutChange: () => notifyModeMenuLayoutChange(ctx),
    cancelModeMenuRevealFrame: () => cancelModeMenuRevealFrame(ctx),
    isModeMenuVisible: () => isModeMenuVisible(ctx),
    revealModeMenuSurface: () => revealModeMenuSurface(ctx),
    concealModeMenuSurface: () => concealModeMenuSurface(ctx)
  };
}

type ModeMenuLayoutApi = ReturnType<typeof createModeMenuLayout>;

export { createModeMenuLayout };
export type { FitModeMenuOptions, ModeMenuLayoutApi, ModeMenuLayoutConfig, ModeMenuLayoutDeps, ModeMenuLayoutState };
