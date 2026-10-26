// Shift+click on a link opens it in a link preview; Shift held over a link
// prepares the preview early.
import { toPreviewFrameUrl } from '../domain/link-preview-frame-url';
import { isNavigateEvent, readPageNavigation } from '../platform/page-navigation';
import { claimContentScript } from '../platform/content-registry';
import { setupPreviewFrame } from './link-preview-frame-side';
import { findPreviewTarget, findPreviewTargetInPath, isPreviewGesture, readNodePath } from './link-preview-targets';
import { followEnabledSetting, isPreviewFrame, listenTarget, listenWindow, send, triggerEnabled } from './link-preview-trigger-runtime';
import type { HoverPrewarm, PrepareOptions, PreviewHandlers } from './link-preview-trigger-runtime';

// Once the preview takes a press, the page sees none of it. Sites open
// modified clicks themselves (window.open on Shift or Cmd, often on
// mouseup or pointerup), and preventing only the default left those
// handlers opening a tab next to the preview. These listeners are the
// window's first capture listeners (the script runs at document start), so
// stopping the events here keeps them from every page listener; a page
// that saw the press start would also wait for an end it never gets.
// A tab open before the extension was reloaded or updated gets this script
// late, after the page's own listeners, and a page that opens links
// through script then sees the press first and navigates under the
// preview. Navigations the page starts within a moment of a press the
// preview took are cancelled; going back or forward and reloading stay.
const NAVIGATION_GUARD_MS = 1500;

// In an ordinary frame a press prepares a preview and the click opens it.
// Inside the preview it opens the link in the preview itself, where Back
// returns; Chrome would open a new window for it.
const PREVIEW_HANDLERS: Readonly<PreviewHandlers> = Object.freeze({
  navigatesHere: false,
  prewarmsOnHover: true,
  prepare(href: string, prepareOptions?: PrepareOptions) {
    send({ action: 'linkPreviewPrepare', url: href, ...(prepareOptions && prepareOptions.hover ? { hover: true } : {}) });
  },
  cancel() {
    send({ action: 'linkPreviewCancel' });
  },
  open(href: string, event: MouseEvent) {
    send({
      action: 'linkPreviewOpen',
      url: href,
      origin: { x: event.clientX, y: event.clientY }
    });
  }
});
const IN_PREVIEW_HANDLERS: Readonly<PreviewHandlers> = Object.freeze({
  navigatesHere: true,
  prewarmsOnHover: false,
  prepare() {},
  cancel() {},
  open(href: string) {
    location.assign(toPreviewFrameUrl(href));
  }
});

function setupTrigger(handlers: Readonly<PreviewHandlers>): void {
  let pressedHref = '';
  let guardUntil = 0;
  // A prepared press waits for its click; released anywhere else (or with
  // Shift let go) it is cancelled, so the preview's header rule does not
  // outlive the press.
  let preparePending = false;
  const navigation = readPageNavigation(window);
  if (navigation) {
    listenTarget(navigation, 'navigate', (event) => {
      if (isNavigateEvent(event) && Date.now() < guardUntil && event.cancelable &&
          event.navigationType !== 'traverse' && event.navigationType !== 'reload') {
        event.preventDefault();
      }
    });
  }
  const claim = (event: Event): void => {
    guardUntil = Date.now() + NAVIGATION_GUARD_MS;
    event.stopImmediatePropagation();
  };
  const isClaimedPress = (event: MouseEvent): boolean => {
    const href = isPreviewGesture(event) ? findPreviewTarget(event) : '';
    return Boolean(href) && href === pressedHref;
  };
  listenWindow('pointerdown', (event) => {
    pressedHref = isPreviewGesture(event) ? findPreviewTarget(event) : '';
    if (pressedHref) {
      claim(event);
    }
  }, true);
  const hover = handlers.prewarmsOnHover
    ? setupHoverPrewarm(handlers, () => preparePending)
    : null;
  listenWindow('mousedown', (event) => {
    const href = isPreviewGesture(event) ? findPreviewTarget(event) : '';
    if (!href) {
      pressedHref = '';
      return;
    }
    pressedHref = href;
    claim(event);
    if (hover) {
      // The press takes the preparation over, and cancels it if it ends
      // away from the link.
      hover.release();
    }
    // Shift+mousedown would extend the text selection to the link.
    event.preventDefault();
    preparePending = true;
    handlers.prepare(href);
  }, true);
  const claimRelease = (event: MouseEvent): void => {
    if (isClaimedPress(event)) {
      claim(event);
    }
  };
  listenWindow('pointerup', claimRelease, true);
  listenWindow('mouseup', claimRelease, true);
  // The click, if any, is dispatched with the mouseup, ahead of this.
  listenWindow('mouseup', () => {
    if (!preparePending) {
      return;
    }
    setTimeout(() => {
      if (preparePending) {
        preparePending = false;
        pressedHref = '';
        handlers.cancel();
      }
    }, 0);
  }, true);
  // Preventing the click also stops Chrome's Shift+click new window.
  listenWindow('click', (event) => {
    const wasPressed = isClaimedPress(event);
    const href = pressedHref;
    pressedHref = '';
    if (!wasPressed) {
      return;
    }
    preparePending = false;
    claim(event);
    event.preventDefault();
    if (handlers.navigatesHere) {
      // The guard holds back the page's navigations, not this one.
      guardUntil = 0;
    }
    handlers.open(href, event);
  }, true);
}

// Shift held over a link starts the preview's page loading before the
// press, so the window opens on more of it. Shift must be held alone for a
// moment over the same link: a capital letter typed, a shortcut, or a
// pointer passing over links starts nothing. Releasing Shift, or leaving
// the link for longer than the grace, cancels it.
const HOVER_PREWARM_DELAY_MS = 150;
const HOVER_LEAVE_GRACE_MS = 250;

// Shift held over a link: the link being hovered and the one prepared.
interface HoverState {
  handlers: Readonly<PreviewHandlers>;
  isPressing: () => boolean;
  hoverNode: Node | null;
  shiftHeld: boolean;
  // Another key or modifier joined this Shift: it is a shortcut or typing.
  shiftChord: boolean;
  preparedHref: string;
  dwellTimer: ReturnType<typeof setTimeout> | undefined;
  leaveTimer: ReturnType<typeof setTimeout> | undefined;
}

function clearHoverTimers(hover: HoverState): void {
  clearTimeout(hover.dwellTimer);
  clearTimeout(hover.leaveTimer);
  hover.dwellTimer = undefined;
  hover.leaveTimer = undefined;
}

function dropHover(hover: HoverState): void {
  clearHoverTimers(hover);
  if (hover.preparedHref && !hover.isPressing()) {
    hover.handlers.cancel();
  }
  hover.preparedHref = '';
}

function readHoveredHref(hover: HoverState): string {
  return triggerEnabled && hover.shiftHeld && !hover.shiftChord && hover.hoverNode && !hover.isPressing()
    ? findPreviewTargetInPath(readNodePath(hover.hoverNode))
    : '';
}

// Prepares the hovered link once Shift has rested on it, and lets the
// prepared one go a moment after the pointer leaves it.
function syncHover(hover: HoverState): void {
  const href = readHoveredHref(hover);
  if (href && href === hover.preparedHref) {
    clearHoverTimers(hover);
    return;
  }
  clearTimeout(hover.dwellTimer);
  hover.dwellTimer = undefined;
  if (href) {
    hover.dwellTimer = setTimeout(() => {
      hover.dwellTimer = undefined;
      if (readHoveredHref(hover) !== href) {
        return;
      }
      // A new link replaces the one prepared before; its cancel must
      // not follow.
      clearTimeout(hover.leaveTimer);
      hover.leaveTimer = undefined;
      hover.preparedHref = href;
      hover.handlers.prepare(href, { hover: true });
    }, HOVER_PREWARM_DELAY_MS);
  }
  if (hover.preparedHref && hover.leaveTimer === undefined) {
    hover.leaveTimer = setTimeout(() => {
      hover.leaveTimer = undefined;
      if (readHoveredHref(hover) !== hover.preparedHref) {
        dropHover(hover);
      }
    }, HOVER_LEAVE_GRACE_MS);
  }
}

function readHoverModifiers(hover: HoverState, event: MouseEvent | KeyboardEvent): void {
  hover.shiftHeld = event.shiftKey === true;
  if (!hover.shiftHeld) {
    hover.shiftChord = false;
  } else if (event.ctrlKey || event.metaKey || event.altKey) {
    hover.shiftChord = true;
  }
}

function onHoverPointerOver(hover: HoverState, event: PointerEvent): void {
  if (!event.isTrusted || event.pointerType !== 'mouse') {
    return;
  }
  const target = event.composedPath()[0] || event.target;
  hover.hoverNode = target instanceof Node ? target : null;
  readHoverModifiers(hover, event);
  if (!hover.shiftHeld) {
    if (hover.preparedHref || hover.dwellTimer !== undefined) {
      dropHover(hover);
    }
    return;
  }
  syncHover(hover);
}

function onHoverKeyDown(hover: HoverState, event: KeyboardEvent): void {
  if (!event.isTrusted) {
    return;
  }
  if (event.key === 'Shift') {
    if (!event.repeat) {
      readHoverModifiers(hover, event);
      syncHover(hover);
    }
    return;
  }
  if (hover.shiftHeld && !hover.shiftChord) {
    hover.shiftChord = true;
    dropHover(hover);
  }
}

function releaseShift(hover: HoverState): void {
  hover.shiftHeld = false;
  hover.shiftChord = false;
  dropHover(hover);
}

function setupHoverPrewarm(handlers: Readonly<PreviewHandlers>, isPressing: () => boolean): HoverPrewarm {
  const hover: HoverState = {
    handlers,
    isPressing,
    hoverNode: null,
    shiftHeld: false,
    shiftChord: false,
    preparedHref: '',
    dwellTimer: undefined,
    leaveTimer: undefined
  };
  listenWindow('pointerover', (event) => onHoverPointerOver(hover, event), true);
  listenWindow('pointerout', (event) => {
    if (event.isTrusted && event.pointerType === 'mouse' && !event.relatedTarget) {
      hover.hoverNode = null;
      if (hover.shiftHeld) {
        syncHover(hover);
      }
    }
  }, true);
  listenWindow('keydown', (event) => onHoverKeyDown(hover, event), true);
  listenWindow('keyup', (event) => {
    if (event.isTrusted && event.key === 'Shift') {
      releaseShift(hover);
    }
  }, true);
  listenWindow('blur', () => releaseShift(hover));
  return {
    release() {
      clearHoverTimers(hover);
      hover.preparedHref = '';
    }
  };
}

// Runs in every frame. In an ordinary frame it turns Shift+click on a link
// into a link preview (see src/background/link-preview/). Inside the
// preview's own frame it tells the preview surface that a real page loaded
// there (a page refused for framing shows Chrome's error page, where no
// content script runs) and passes Escape up so the preview can close.
function startLinkPreviewTrigger(): void {
  // The manifest runs this in every frame, and the worker injects the same
  // script again into frames that may already run it; the first one listens.
  if (!claimContentScript('link-preview-trigger')) {
    return;
  }
  if (isPreviewFrame()) {
    setupPreviewFrame();
    setupTrigger(IN_PREVIEW_HANDLERS);
  } else {
    followEnabledSetting();
    setupTrigger(PREVIEW_HANDLERS);
  }
}

startLinkPreviewTrigger();
