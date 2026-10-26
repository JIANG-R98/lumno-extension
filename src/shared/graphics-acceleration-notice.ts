// The capsule under New Tab's search box and above the overlay that suggests
// turning on graphics acceleration, when the worker's probe found the browser
// drawing without the GPU and a fresh probe agrees. New installs and people
// updating keep seeing it until they close it; opening the setting only hides
// it for this page view. Its data lives in platform/graphics-acceleration.ts.
import * as LumnoFeatureHints from './ui/feature-hints';
import * as LumnoMessaging from '../platform/messaging';
import {
  GRAPHICS_PROBE_STORAGE_KEY,
  getStoredGraphicsProbe,
  normalizeGraphicsProbe,
  normalizeGraphicsRendering
} from '../platform/graphics-acceleration';
import type { GraphicsChromeApi, GraphicsRendering } from '../platform/graphics-acceleration';
import type { StorageChanges } from '../domain/storage-port';
import type { FeatureHintController, FeatureHintDefinition } from './ui/feature-hints';

type GraphicsNoticeSurface = 'newtab' | 'overlay';

type Translate = (key: string, fallback: string) => string;

interface GraphicsNoticeOptions {
  documentObj?: Document | null;
  chromeApi?: GraphicsChromeApi | null;
  featureHints?: Pick<typeof LumnoFeatureHints, 'createFeatureHint' | 'getFeatureHintLocalDismissKey'> | null;
  surface?: string;
  t?: Translate;
  getRiSvg?(id: string, sizeClass: string): string;
  // The notice waits for this (the update notice deciding whether to show).
  exposureGate?: unknown;
  // Return false while the page has something else to show.
  canShow?(): boolean;
  onOpenSettings?(event: MouseEvent): void;
  // Probes again before showing; the worker's by default.
  checkRendering?(): Promise<GraphicsRendering>;
  // The notice showed, so other notices this page view should wait.
  onSessionSlotClaimed?(): void;
}

interface GraphicsNoticeController extends Omit<FeatureHintController, 'ready'> {
  hasSessionSlot(): boolean;
  // Resolves to whether the notice claimed this page view's notice slot.
  ready: Promise<boolean>;
}

const GRAPHICS_NOTICE_ID = 'graphics-acceleration-notice';
const GRAPHICS_NOTICE_VERSION = '1';

function readSurface(surface: unknown): GraphicsNoticeSurface {
  return surface === 'overlay' ? 'overlay' : 'newtab';
}

function createGraphicsNoticeDefinition(surface: unknown): Readonly<FeatureHintDefinition> {
  const surfaceName = readSurface(surface);
  return Object.freeze({
    id: GRAPHICS_NOTICE_ID,
    introducedIn: GRAPHICS_NOTICE_VERSION,
    surface: surfaceName,
    placement: surfaceName === 'overlay' ? 'above search input' : 'below search input',
    className: [
      'x-lumno-feature-hint--update-notice',
      `x-lumno-feature-hint--update-notice-${surfaceName}`,
      'x-lumno-feature-hint--graphics-notice'
    ].join(' '),
    arrowSide: surfaceName === 'overlay' ? 'bottom' : 'top',
    arrowAlign: 'center',
    widthMode: 'container',
    alignMode: 'auto',
    // The GPU belongs to this computer, so closing it here keeps it on others.
    dismissStorage: 'local',
    rememberOnFirstShow: false,
    badgeIconText: '⚡',
    badgeKey: 'graphics_notice_badge',
    badgeFallback: 'Graphics acceleration is off',
    textKey: 'graphics_notice_text',
    textFallback: 'Turn it on for smoother pages; it takes a browser restart',
    linkKey: 'graphics_notice_link',
    linkFallback: 'Turn on',
    closeLabelKey: 'graphics_notice_close',
    closeLabelFallback: 'Dismiss graphics acceleration tip'
  });
}

// Asks the worker to probe now, so a stale answer (from a browser start
// before the GPU was ready, say) never shows the notice.
function askWorkerForRendering(): Promise<GraphicsRendering> {
  const runtime = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime : null;
  if (!runtime) {
    return Promise.resolve('unknown');
  }
  return new Promise((resolve) => {
    try {
      LumnoMessaging.sendBackgroundMessage(runtime, { action: 'checkGraphicsRendering' }, (reply) => {
        resolve(runtime.lastError || !reply ? 'unknown' : normalizeGraphicsRendering(reply.rendering));
      });
    } catch (_error) {
      resolve('unknown');
    }
  });
}

function createGraphicsNotice(options?: GraphicsNoticeOptions | null): GraphicsNoticeController | null {
  const config: GraphicsNoticeOptions = options || {};
  const documentObj = config.documentObj || (typeof document !== 'undefined' ? document : null);
  const featureHints = config.featureHints || LumnoFeatureHints;
  const chromeApi: GraphicsChromeApi | null = config.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
  if (!documentObj) {
    return null;
  }
  const definition = createGraphicsNoticeDefinition(config.surface);
  const dismissKey = featureHints.getFeatureHintLocalDismissKey(definition);
  let controller: FeatureHintController | null = null;
  let destroyed = false;
  let sessionSlotClaimed = false;

  const createdHint = featureHints.createFeatureHint({
    documentObj,
    definition,
    chromeApi,
    dismissKey,
    t: config.t,
    getRiSvg: config.getRiSvg,
    initiallyVisible: false,
    // Still drawing without the GPU after a restart, it comes back.
    onLinkClick(event) {
      if (controller) {
        controller.setVisible(false);
      }
      if (typeof config.onOpenSettings === 'function') {
        config.onOpenSettings(event);
      }
    }
  });
  if (!createdHint) {
    return null;
  }
  const hint: FeatureHintController = createdHint;
  controller = hint;

  function canShowNow(): boolean {
    if (destroyed) {
      return false;
    }
    return typeof config.canShow === 'function' ? config.canShow() !== false : true;
  }

  const readyPromise: Promise<boolean> = Promise.all([
    getStoredGraphicsProbe(chromeApi),
    hint.ready,
    Promise.resolve(config.exposureGate).catch(() => null)
  ]).then(([probe]) => {
    if (probe.rendering !== 'software' || hint.isDismissed()) {
      return false;
    }
    const checkRendering = typeof config.checkRendering === 'function' ? config.checkRendering : askWorkerForRendering;
    return checkRendering().then((rendering) => rendering === 'software', () => false);
  }).then((software) => {
    if (!software || hint.isDismissed() || !canShowNow()) {
      return false;
    }
    hint.setVisible(true);
    if (!hint.isVisible()) {
      return false;
    }
    sessionSlotClaimed = true;
    if (typeof config.onSessionSlotClaimed === 'function') {
      config.onSessionSlotClaimed();
    }
    return true;
  });

  // Closed or acted on in another tab, or the GPU is back after a restart.
  function handleStorageChanged(changes: StorageChanges, areaName: string): void {
    if (destroyed || areaName !== 'local' || !changes) {
      return;
    }
    const probeChange = changes[GRAPHICS_PROBE_STORAGE_KEY];
    const dismissChange = changes[dismissKey];
    if ((probeChange && normalizeGraphicsProbe(probeChange.newValue).rendering !== 'software') ||
        (dismissChange && dismissChange.newValue)) {
      hint.setVisible(false);
    }
  }

  const storageChanges = chromeApi && chromeApi.storage ? chromeApi.storage.onChanged : null;
  if (storageChanges) {
    storageChanges.addListener(handleStorageChanged);
  }

  return Object.freeze({
    ...hint,
    destroy() {
      destroyed = true;
      hint.destroy();
      if (storageChanges) {
        storageChanges.removeListener(handleStorageChanged);
      }
    },
    hasSessionSlot() {
      return sessionSlotClaimed;
    },
    ready: readyPromise
  });
}

export type { GraphicsNoticeController, GraphicsNoticeOptions, GraphicsNoticeSurface };
export {
  GRAPHICS_NOTICE_ID,
  GRAPHICS_NOTICE_VERSION,
  createGraphicsNotice,
  createGraphicsNoticeDefinition
};
