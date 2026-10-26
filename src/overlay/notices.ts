// What the layer needs of an update, graphics or engagement notice controller.
interface LayerNotice {
  element: HTMLElement | null;
  // Counts one showing of the update notice.
  recordExposure?(): void;
}

interface NoticeLayerConfig {
  getUpdateNotice?(): LayerNotice | null;
  getGraphicsNotice?(): LayerNotice | null;
  getEngagementNotice?(): LayerNotice | null;
  // The panel's size preset, for its width before the panel has one.
  getSizePreset?(): { width?: number } | null;
  decorate?(element: HTMLElement): void;
}

function getNoticeElement(controller: LayerNotice | null): HTMLElement | null {
  return controller && controller.element ? controller.element : null;
}

// Hosts the update, graphics and engagement notices just above the overlay
// panel. They mount beside the panel (never inside it, so they take no part
// in its layout), follow its width, position, viewport scale and theme, and
// stop listening when the overlay closes.
function createNoticeLayer(win: Window, config?: NoticeLayerConfig | null) {
  const settings: NoticeLayerConfig = config && typeof config === 'object' ? config : {};
  const doc = win.document;
  let frameListener: (() => void) | null = null;
  let frameViewport: VisualViewport | null = null;
  let mountTimer: number | null = null;

  function getNotices(): { update: LayerNotice | null; graphics: LayerNotice | null; engagement: LayerNotice | null } {
    return {
      update: typeof settings.getUpdateNotice === 'function' ? settings.getUpdateNotice() : null,
      graphics: typeof settings.getGraphicsNotice === 'function' ? settings.getGraphicsNotice() : null,
      engagement: typeof settings.getEngagementNotice === 'function'
        ? settings.getEngagementNotice()
        : null
    };
  }

  function decorate(element: HTMLElement): void {
    if (typeof settings.decorate === 'function') {
      settings.decorate(element);
    }
  }

  // Matches the notices' frame and theme to the panel's.
  function sync(panel: HTMLElement | null): void {
    const notices = getNotices();
    const elements = [
      getNoticeElement(notices.update),
      getNoticeElement(notices.graphics),
      getNoticeElement(notices.engagement)
    ].filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0 || !panel) {
      return;
    }
    const sizePreset = typeof settings.getSizePreset === 'function'
      ? settings.getSizePreset()
      : null;
    const fallbackWidth = sizePreset && sizePreset.width ? `${sizePreset.width}px` : '';
    const width = panel.style.getPropertyValue('width') || fallbackWidth;
    const maxWidth = panel.style.getPropertyValue('max-width') || 'calc(100vw - 24px)';
    const left = panel.style.getPropertyValue('left') || '50%';
    const top = panel.style.getPropertyValue('top') || '20vh';
    const visibleScale = panel.style.getPropertyValue('--x-ov-visible-scale') || '1';
    elements.forEach((element) => {
      element.style.setProperty('width', width, 'important');
      element.style.setProperty('max-width', maxWidth, 'important');
      element.style.setProperty('left', left, 'important');
      element.style.setProperty('top', top, 'important');
      element.style.setProperty('--x-ov-visible-scale', visibleScale, 'important');
      element.style.removeProperty('zoom');
      element.setAttribute('data-theme', panel.getAttribute('data-theme') || '');
    });
  }

  function stopFrameSync(): void {
    if (!frameListener) {
      return;
    }
    win.removeEventListener('resize', frameListener);
    if (frameViewport) {
      frameViewport.removeEventListener('resize', frameListener);
    }
    frameListener = null;
    frameViewport = null;
  }

  function startFrameSync(panel: HTMLElement | null): void {
    stopFrameSync();
    if (!panel) {
      return;
    }
    const listener = (): void => {
      sync(panel);
    };
    frameListener = listener;
    win.addEventListener('resize', listener, { passive: true });
    if (win.visualViewport) {
      win.visualViewport.addEventListener('resize', listener, { passive: true });
      frameViewport = win.visualViewport;
    }
    sync(panel);
  }

  // Into the panel's style root, just before the panel; into the page's
  // body where there is none.
  function insertAbovePanel(element: HTMLElement, panel: HTMLElement, styleRoot: Node | null): void {
    decorate(element);
    if (styleRoot) {
      styleRoot.insertBefore(element, panel);
    } else if (doc.body) {
      doc.body.appendChild(element);
    }
  }

  function shouldAnimateMount(element: HTMLElement): boolean {
    if (element.getAttribute('data-visible') !== 'true') {
      return false;
    }
    return !win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Mounts the update notice (counting one exposure) and then the graphics
  // and engagement notices, which show themselves once they decide to. A
  // visible update notice blurs in: it carries data-overlay-mounting for two
  // frames after insertion.
  function mount(panel: HTMLElement, styleRoot: Node | null): void {
    const notices = getNotices();
    const update = notices.update;
    const noticeElement = getNoticeElement(update);
    if (!update || !noticeElement || noticeElement.parentNode) {
      return;
    }
    const animateMount = shouldAnimateMount(noticeElement);
    if (animateMount) {
      noticeElement.setAttribute('data-overlay-mounting', 'true');
    }
    insertAbovePanel(noticeElement, panel, styleRoot);
    if (typeof update.recordExposure === 'function') {
      update.recordExposure();
    }
    sync(panel);
    const finishMountAnimation = (): void => {
      noticeElement.removeAttribute('data-overlay-mounting');
    };
    if (animateMount) {
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(finishMountAnimation);
      });
    } else {
      finishMountAnimation();
    }
    [notices.graphics, notices.engagement].forEach((notice) => {
      const element = getNoticeElement(notice);
      if (element && !element.parentNode) {
        insertAbovePanel(element, panel, styleRoot);
        sync(panel);
      }
    });
  }

  function clearMountTimer(): void {
    if (mountTimer !== null) {
      win.clearTimeout(mountTimer);
      mountTimer = null;
    }
  }

  function scheduleMount(panel: HTMLElement | null, styleRoot: Node | null, delayMs: number): void {
    clearMountTimer();
    mountTimer = win.setTimeout(() => {
      mountTimer = null;
      if (!panel || !panel.isConnected) {
        return;
      }
      mount(panel, styleRoot);
    }, Math.max(0, Number(delayMs) || 0));
  }

  function stop(): void {
    stopFrameSync();
    clearMountTimer();
  }

  return Object.freeze({
    mount,
    scheduleMount,
    startFrameSync,
    stop,
    sync
  });
}

export { createNoticeLayer };
export type { LayerNotice, NoticeLayerConfig };
