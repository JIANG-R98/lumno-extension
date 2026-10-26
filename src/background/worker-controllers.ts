// The worker's long-lived controllers that message handlers use: progress
// tracking of pinned cards (Labs), the page context menu item that adds a
// page to the New Tab shortcuts, and the toolbar popup's recent-site pin.
//
// They are created here and started by background.ts, which wires the
// browser events, so starting them keeps its place in the worker's startup.
import * as FAVICON_UTILS from '../domain/favicon/favicon-utils';
import * as LumnoNewtabRecentSitesStore from '../domain/recent-sites-store';
import * as LumnoProgressHistory from '../domain/progress-history';
import * as LumnoProgressMatch from '../domain/progress-match';
import * as LumnoSettings from '../domain/settings';
import { pinnedRecentSites, themeMode } from '../domain/settings';
import * as LumnoPageShortcutMenu from './page-shortcut-menu';
import * as LumnoPopupRecentPin from './popup-recent-pin';
import * as LumnoProgressTracker from './progress-tracker';
import {
  isPrimaryStorageAreaName,
  loadLocaleMessages,
  localStorageArea,
  normalizeHost,
  providerStorageRuntime,
  storageArea
} from './worker-context';

// Labs: tracked pinned cards follow the episode or chapter the person is on.
// Mirrors the stored setting once startProgressTracking has read it.
let progressTrackingEnabled = false;

function isProgressTrackingEnabled(): boolean {
  return progressTrackingEnabled;
}

const progressTracker = LumnoProgressTracker.createProgressTracker({
  chromeApi: chrome,
  progressMatch: LumnoProgressMatch,
  progressHistory: LumnoProgressHistory,
  getPinnedArea: () => storageArea,
  historyArea: localStorageArea,
  pinnedKey: pinnedRecentSites.key,
  isEnabled: isProgressTrackingEnabled
});

// Attaches the tracker to tab events and follows the setting.
function startProgressTracking(): void {
  progressTracker.attach();
  storageArea.get([LumnoSettings.progressTrackingEnabled.key], (result) => {
    progressTrackingEnabled = LumnoSettings.progressTrackingEnabled.parse(
      result && result[LumnoSettings.progressTrackingEnabled.key]
    );
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[LumnoSettings.progressTrackingEnabled.key]) return;
    progressTrackingEnabled = LumnoSettings.progressTrackingEnabled.parse(
      changes[LumnoSettings.progressTrackingEnabled.key].newValue
    );
  });
}

// The page context menu item that adds the page to the New Tab shortcuts;
// null where the browser has no context menus.
const pageShortcutMenuController = chrome.contextMenus
  ? LumnoPageShortcutMenu.createController({ chrome, provider: providerStorageRuntime,
    loadLocaleMessages, themeStorageKey: themeMode.key }) : null;

// The popup's pin among the New Tab's recent sites; episodes and chapters
// start tracked while progress tracking (Labs) is on.
const popupRecentPin = LumnoPopupRecentPin.createController({
  store: LumnoNewtabRecentSitesStore,
  key: pinnedRecentSites.key,
  storeOptions: {
    normalizeHost,
    getCanonicalPageUrlForFavicon: FAVICON_UTILS.getCanonicalPageUrlForFavicon,
    maxPinned: 3
  },
  getArea: () => storageArea,
  ready: () => providerStorageRuntime.ready,
  probeSeries: (url) => (progressTrackingEnabled ? progressTracker.probeSeries(url) : Promise.resolve(false)),
  createProgressId: LumnoProgressHistory.createProgressId
});

export {
  isProgressTrackingEnabled,
  pageShortcutMenuController,
  popupRecentPin,
  progressTracker,
  startProgressTracking
};
