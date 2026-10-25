// The Account tab: the browser sync card and the WebDAV card, drawn by one
// React view from the models their sections hand over.
import { queryHtmlTag } from '../shared/dom-lookup';
import { createSyncSection, type SyncSectionOptions } from './options-sync-section';
import type { AccountTabController, BrowserSyncCardModel, createAccountTabApi, WebDavCardModel } from './react/account-tab';
import { createController as createWebDavController, type WebDavControllerOptions } from './webdav-options';

interface AccountSectionDeps {
  host: HTMLElement | null;
  accountTabApi: Pick<ReturnType<typeof createAccountTabApi>, 'createAccountTabController'>;
  sync: Omit<SyncSectionOptions, 'onRender' | 'refreshSyncNowTooltip'>;
  webdav: Omit<WebDavControllerOptions, 'onRender'>;
  // Refreshes an element's floating tooltip while it shows.
  showTooltipFor(target: HTMLElement): void;
}

const SYNC_NOW_BUTTON_ID = '_x_extension_sync_now_2024_unique_';

function createAccountSection(deps: AccountSectionDeps) {
  const { host, accountTabApi, showTooltipFor } = deps;
  let browserSync: BrowserSyncCardModel | null = null;
  let webdav: WebDavCardModel | null = null;
  // Made once both sections exist; they report their first models before.
  let controller: AccountTabController | null = null;

  function render(): void {
    if (controller && browserSync && webdav) {
      controller.render({ browserSync, webdav });
    }
  }

  const syncSection = createSyncSection({
    ...deps.sync,
    onRender(model) {
      browserSync = model;
      render();
    },
    refreshSyncNowTooltip() {
      const button = host ? queryHtmlTag(host, `#${SYNC_NOW_BUTTON_ID}`, 'button') : null;
      if (button && (button.matches(':hover') || button.matches(':focus'))) {
        showTooltipFor(button);
      }
    }
  });
  const webDavController = createWebDavController({
    ...deps.webdav,
    onRender(model) {
      webdav = model;
      render();
    }
  });
  controller = accountTabApi.createAccountTabController(host, {
    browserSync: syncSection.handlers,
    webdav: { onAction: webDavController.onAction }
  });
  render();

  return { syncSection, webDavController };
}

export { createAccountSection };
export type { AccountSectionDeps };
