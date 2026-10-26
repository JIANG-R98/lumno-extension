// Opening the clip window for a picked element, and closing it again.
import { setDocumentPipActiveState } from '../../platform/content-registry';
import { readDocumentPictureInPicture } from '../../platform/document-picture-in-picture';
import { containsBlockedMediaContent, isAllowedElement } from './candidates';
import { buildPiPContextChain, refreshPiPContent, schedulePiPContentRefresh, schedulePiPDocumentSync } from './clone';
import { createPiPDock, createPiPScaffold, getClipLayout } from './dock';
import { isElementTarget, readErrorText } from './dom';
import { getMessage } from './locale';
import { setHighlight } from './picker-ui';
import { state } from './state';
import { syncPiPRootAttributes } from './style-sync';
import { getOpenFailureMessage, getSupportFailureMessage, hasActiveVideoPiP, releaseDocumentPipOwnership, requestDocumentPipOwnership, sendRuntimeMessage } from './support';
import { getVisualTheme } from './theme';
import { showToast, showVideoPiPConflictToast } from './toast';
import type { ClipSession, OpenResult, PiPDock } from './types';

function restoreSession(options?: { closeWindow?: boolean }): boolean {
  const session = state.session;
  if (!session) {
    releaseDocumentPipOwnership();
    return false;
  }
  state.session = null;
  setDocumentPipActiveState(false);

  [session.documentObserver, session.contentObserver, session.resizeObserver].forEach((observer) => {
    if (observer) {
      observer.disconnect();
    }
  });
  [session.contentSyncTimer, session.documentSyncTimer].forEach((timer) => {
    if (timer != null) {
      window.clearTimeout(timer);
    }
  });
  session.contentSyncTimer = null;
  session.documentSyncTimer = null;
  window.removeEventListener('pagehide', session.onMainPageHide, true);
  try {
    session.dock.destroy();
  } catch (_error) {
    // The window may be gone already.
  }

  if (!options || options.closeWindow !== false) {
    try {
      if (!session.pipWindow.closed) {
        session.pipWindow.close();
      }
    } catch (_error) {
      // Ignore close failures.
    }
  }
  setHighlight(null);
  releaseDocumentPipOwnership();
  return true;
}

function getPiPLinkUrl(link: Element): URL | null {
  const rawHref = link.getAttribute('href') || '';
  try {
    return new URL(rawHref, document.baseURI || window.location.href);
  } catch (_error) {
    return null;
  }
}

// The clip is a copy without the page's scripts, so following a link inside
// the small window would replace the clip itself. Links open as tabs next
// to the page instead, and in-page anchors scroll the clip.
function handlePiPLinkClick(event: MouseEvent, session: ClipSession): void {
  if (event.defaultPrevented || event.button !== 0) {
    return;
  }
  const target = event.target;
  const link = isElementTarget(target) ? target.closest('a[href], area[href]') : null;
  if (!link) {
    return;
  }
  event.preventDefault();
  const url = getPiPLinkUrl(link);
  if (!url) {
    return;
  }
  const pageUrl = new URL(window.location.href);
  if (url.origin === pageUrl.origin && url.pathname === pageUrl.pathname &&
      url.search === pageUrl.search) {
    // href="#" is usually a script-driven button; it has nothing to open.
    if (!url.hash) {
      return;
    }
    let anchorTarget: HTMLElement | null = null;
    try {
      anchorTarget = session.pipDocument.getElementById(decodeURIComponent(url.hash.slice(1)));
    } catch (_error) {
      anchorTarget = null;
    }
    if (anchorTarget) {
      anchorTarget.scrollIntoView({ block: 'start' });
    }
    return;
  }
  if (!/^(https?|mailto|tel):$/.test(url.protocol)) {
    return;
  }
  void sendRuntimeMessage({
    action: 'createTab',
    url: url.href,
    disposition: event.metaKey || event.ctrlKey ? 'backgroundTab' : 'newTab'
  });
}

function attachPiPDocumentHandlers(session: ClipSession): void {
  const pipDocument = session.pipDocument;
  pipDocument.addEventListener('click', (event) => {
    handlePiPLinkClick(event, session);
  });
  pipDocument.addEventListener('submit', (event) => {
    event.preventDefault();
  }, true);
}

// The session for a freshly opened clip window; nothing observes yet.
function createClipSession(
  element: Element,
  pipWindow: Window,
  pipContent: HTMLDivElement,
  pipContentMount: HTMLElement,
  dock: PiPDock
): ClipSession {
  const opened: ClipSession = {
    element: element,
    pipWindow: pipWindow,
    pipDocument: pipWindow.document,
    pipContent,
    pipContentMount,
    pipElementClone: null,
    styleSignature: '',
    documentObserver: new MutationObserver(() => {
      schedulePiPDocumentSync(opened);
    }),
    contentObserver: new MutationObserver(() => {
      schedulePiPContentRefresh(opened);
    }),
    resizeObserver: typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        schedulePiPContentRefresh(opened);
      })
      : null,
    contentSyncTimer: null,
    documentSyncTimer: null,
    dock: dock,
    onMainPageHide: () => {
      if (state.session === opened) {
        restoreSession({ closeWindow: true });
      }
    }
  };
  return opened;
}

// Keeps the copy current with the page, and closes the session when either
// window goes away.
function watchClipSession(opened: ClipSession): void {
  const { element, pipWindow } = opened;
  opened.documentObserver.observe(document.documentElement, { attributes: true });
  if (document.body) {
    opened.documentObserver.observe(document.body, { attributes: true });
  }
  if (document.head) {
    opened.documentObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  opened.contentObserver.observe(element, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true
  });

  if (opened.resizeObserver) {
    opened.resizeObserver.observe(element);
  }

  pipWindow.addEventListener('pagehide', () => {
    if (state.session === opened) {
      restoreSession({ closeWindow: false });
    }
  }, { once: true });
  window.addEventListener('pagehide', opened.onMainPageHide, true);
  attachPiPDocumentHandlers(opened);
}

async function openDocumentPiP(element: Element, onReselect: () => void): Promise<OpenResult> {
  if (!isAllowedElement(element) || containsBlockedMediaContent(element)) {
    showToast(
      getMessage(
        'document_pip_picker_invalid',
        'This element cannot be opened in the floating window.'
      ),
      'error'
    );
    return { ok: false, reason: 'invalid-element' };
  }

  if (hasActiveVideoPiP()) {
    showVideoPiPConflictToast();
    return { ok: false, reason: 'video-pip-active' };
  }

  const pictureInPicture = readDocumentPictureInPicture(window);
  if (!pictureInPicture) {
    showToast(getSupportFailureMessage('api-unavailable'), 'error');
    return { ok: false, reason: 'api-unavailable' };
  }

  const visualTheme = getVisualTheme(element);
  const layout = getClipLayout(element);
  let pipWindow: Window;
  try {
    // Browsers only open PiP while the click's user activation is fresh, so
    // the window comes first; slow work like waking the background service
    // worker must not run before it.
    pipWindow = await pictureInPicture.requestWindow({
      width: layout.width,
      height: layout.height
    });
  } catch (error) {
    showToast(getOpenFailureMessage(error), 'error');
    return {
      ok: false,
      reason: 'request-window-failed',
      errorName: readErrorText(error, 'name'),
      errorMessage: readErrorText(error, 'message')
    };
  }

  let session: ClipSession | null = null;
  try {
    const pipDocument = pipWindow.document;
    const { shell, content } = createPiPScaffold(pipWindow, visualTheme, layout);
    const dock = createPiPDock({
      pipDocument,
      shell,
      visualTheme,
      onClose: () => restoreSession({ closeWindow: true }),
      onReselect
    });
    if (!dock) {
      throw new Error('The clip window dock could not be drawn.');
    }
    const contextChain = buildPiPContextChain(element, pipDocument);
    content.appendChild(contextChain.root);

    const opened = createClipSession(element, pipWindow, content, contextChain.mountPoint, dock);
    session = opened;
    watchClipSession(opened);
    state.session = opened;
    syncPiPRootAttributes(opened);
    refreshPiPContent(opened);
    setDocumentPipActiveState(true);

  } catch (error) {
    if (session && state.session === session) {
      restoreSession({ closeWindow: true });
    } else {
      pipWindow.close();
    }
    throw error;
  }

  // Opening the window already closed any other PiP; claiming ownership
  // lets Lumno in other tabs drop their stale sessions.
  await requestDocumentPipOwnership();
  if (state.session !== session) {
    releaseDocumentPipOwnership();
  }
  return { ok: true };
}

export {
  attachPiPDocumentHandlers,
  getPiPLinkUrl,
  handlePiPLinkClick,
  openDocumentPiP,
  restoreSession
};
