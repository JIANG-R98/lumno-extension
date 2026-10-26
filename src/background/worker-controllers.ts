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
import * as LumnoPageShortcutMenu from './page-shortcut-menu';
import * as LumnoPopupRecentPin from './popup-recent-pin';
import * as LumnoProgressTracker from './progress-tracker';
import {
  loadLocaleMessages,
  normalizeHost,
  providerStorageRuntime,
  workerSettings
} from './worker-context';

// Labs: tracked pinned cards follow the episode or chapter the person is on.
function isProgressTrackingEnabled(): boolean {
  return workerSettings.get(LumnoSettings.progressTrackingEnabled);
}

const progressTracker = LumnoProgressTracker.createProgressTracker({
  chromeApi: chrome,
  progressMatch: LumnoProgressMatch,
  progressHistory: LumnoProgressHistory,
  settingsStore: workerSettings,
  isEnabled: isProgressTrackingEnabled
});

// Attaches the tracker to tab events.
function startProgressTracking(): void {
  progressTracker.attach();
}

// The page context menu item that adds the page to the New Tab shortcuts;
// null where the browser has no context menus.
const pageShortcutMenuController = chrome.contextMenus
  ? LumnoPageShortcutMenu.createController({ chrome, provider: providerStorageRuntime,
    settingsStore: workerSettings, loadLocaleMessages }) : null;

// The popup's pin among the New Tab's recent sites; episodes and chapters
// start tracked while progress tracking (Labs) is on.
const popupRecentPin = LumnoPopupRecentPin.createController({
  store: LumnoNewtabRecentSitesStore,
  settingsStore: workerSettings,
  storeOptions: {
    normalizeHost,
    getCanonicalPageUrlForFavicon: FAVICON_UTILS.getCanonicalPageUrlForFavicon,
    maxPinned: 3
  },
  probeSeries: (url) => (isProgressTrackingEnabled() ? progressTracker.probeSeries(url) : Promise.resolve(false)),
  createProgressId: LumnoProgressHistory.createProgressId
});

export {
  isProgressTrackingEnabled,
  pageShortcutMenuController,
  popupRecentPin,
  progressTracker,
  startProgressTracking
};
