// Graphics acceleration: a fresh check of whether the browser draws with the
// GPU, and the browser settings page that turns it on.
import { createTabWithSourceGroup } from '../browser-urls-service';
import { getGraphicsSettingsUrl, refreshGraphicsProbe } from '../graphics-probe';
import type { HandlersFor } from '../message-router';

type GraphicsAction = 'checkGraphicsRendering' | 'openGraphicsSettings';

const GRAPHICS_MESSAGE_HANDLERS: HandlersFor<GraphicsAction> = Object.freeze({
  checkGraphicsRendering(request, sender, sendResponse) {
    refreshGraphicsProbe().then((rendering) => {
      sendResponse({ rendering });
    });
    return true;
  },
  openGraphicsSettings(request, sender, sendResponse) {
    createTabWithSourceGroup({
      url: getGraphicsSettingsUrl(),
      active: request.disposition !== 'backgroundTab'
    }, sender && sender.tab ? sender.tab : null, (_tab, info) => {
      sendResponse({ ok: Boolean(info && info.ok) });
    });
    return true;
  }
});

export { GRAPHICS_MESSAGE_HANDLERS };
