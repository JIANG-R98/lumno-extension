// @ts-nocheck
// URL classification for the tabs commands act on: restricted and browser-
// internal pages, Lumno's own pages and New Tab, other extensions, and which
// browser New Tab provider a fresh tab belongs to. Also opens search-result
// tabs next to the tab they came from, in its tab group.
//
// A module of the service worker; background.js imports it before its own code
// runs. Its functions use background.js bindings (EXTENSION_ROUTES,
// SEARCH_RESULT_TABS, storageArea, the restricted-action caches, ...) only when
// they run, never while this file loads, because background.js has not
// initialized its own top-level bindings yet at that point.

import * as LumnoUrlGuards from '../shared/url-guards';
import * as BACKGROUND_TAB_GROUPS from './tab-groups';
import * as EXTENSION_ROUTES from '../shared/extension-routes';
import * as SEARCH_RESULT_TABS from './search-result-tabs';
import * as SETTINGS from '../shared/settings';
import {
  BROWSER_NEWTAB_PROVIDER_DETECTION_MS,
  RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY,
  RESTRICTED_ACTION_STORAGE_KEY,
  backgroundSettingsLoaded,
  browserNewtabProviderCandidateTabIds,
  logHotkeyDebug,
  markRestrictedActionAutoSelected,
  restrictedActionAutoBrowserSettingDoneCache,
  storageArea,
  whenBackgroundSettingsReady
} from './background';

function isBrowserExtensionProtocol(protocol) {
  const guards = LumnoUrlGuards;
  return guards.isBrowserExtensionProtocol(protocol);
}

export function isBrowserInternalUrl(url) {
  const guards = LumnoUrlGuards;
  return guards.isBrowserInternalUrl(url);
}

export function isRestrictedUrl(url) {
  const guards = LumnoUrlGuards;
  return guards.isRestrictedUrl(url);
}

export function canOpenOverlayOnUrl(url) {
  const guards = LumnoUrlGuards;
  return guards.canOpenOverlayOnUrl(url);
}

export function canFetchPageForFavicon(url) {
  const guards = LumnoUrlGuards;
  return guards.canFetchPageForFavicon(url);
}

// Firefox hosts extension pages on a per-install UUID, not runtime.id. Compare
// protocol and host: URL.origin is "null" for these schemes outside browsers.
function getExtensionUrlKey(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname ? `${parsed.protocol}//${parsed.hostname}` : '';
  } catch (error) {
    return '';
  }
}

function getOwnExtensionOrigin() {
  return getExtensionUrlKey(chrome.runtime.getURL(''));
}

export function isOwnExtensionPageUrl(url) {
  if (!url || !chrome || !chrome.runtime || !chrome.runtime.id) {
    return false;
  }
  try {
    const origin = getOwnExtensionOrigin();
    return Boolean(origin) && getExtensionUrlKey(url) === origin;
  } catch (error) {
    return false;
  }
}

export function getResolvedTabUrl(tab) {
  if (!tab || typeof tab !== 'object') {
    return '';
  }
  const directUrl = typeof tab.url === 'string' ? String(tab.url).trim() : '';
  if (directUrl) {
    return directUrl;
  }
  const pendingUrl = typeof tab.pendingUrl === 'string' ? String(tab.pendingUrl).trim() : '';
  return pendingUrl;
}

export function getSourceTabGroupContext(tab) {
  return BACKGROUND_TAB_GROUPS.getSourceTabGroupContext(tab, chrome);
}

export function createTabWithSourceGroup(createProperties, sourceTab, callback) {
  const done = typeof callback === 'function' ? callback : () => {};
  BACKGROUND_TAB_GROUPS.createTabInSourceGroup(chrome, createProperties, sourceTab, done);
}

export function resolveSearchResultTabPlacement(sourceTab) {
  return SETTINGS.readStorageValue(storageArea, chrome, SETTINGS.SEARCH_RESULT_TAB_POSITION_STORAGE_KEY)
    .catch(() => undefined)
    .then((value) => SEARCH_RESULT_TABS.resolvePlacement(
      chrome,
      sourceTab,
      SETTINGS.normalizeSearchResultTabPosition(value)
    ));
}

export function createSearchResultTab(createProperties, sourceTab, callback, resolvedPlacement) {
  const placementTask = resolvedPlacement
    ? Promise.resolve(resolvedPlacement)
    : resolveSearchResultTabPlacement(sourceTab);
  placementTask.then((placement) => {
    const props = { ...createProperties };
    if (typeof placement.index === 'number') {
      props.index = placement.index;
      props.windowId = placement.windowId;
    }
    createTabWithSourceGroup(props, placement.sourceTab, callback);
  });
}

export function moveTabToSourceGroupContext(tab, sourceContext, callback, createProperties) {
  BACKGROUND_TAB_GROUPS.moveTabToSourceGroupContext(chrome, tab, sourceContext, callback, createProperties);
}

export function isLumnoNewtabUrl(url) {
  const value = String(url || '');
  if (!value || !chrome || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
    return false;
  }
  const routeType = EXTENSION_ROUTES.classifyExtensionUrl(value);
  if (routeType === 'newtab' && isOwnExtensionUrl(value)) {
    return true;
  }
  const routeBuilders = [
    EXTENSION_ROUTES.buildNewtabUrl,
    EXTENSION_ROUTES.buildLumnoNewtabUrl
  ].filter((builder) => typeof builder === 'function');
  const prefixes = routeBuilders.length > 0
    ? routeBuilders.map((builder) => builder(chrome))
    : [
        chrome.runtime.getURL('newtab.html'),
        chrome.runtime.getURL('src/newtab/lumno-newtab.html')
      ];
  return prefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}?`));
}

export function isBrowserNewtabUrl(url) {
  const lower = String(url || '').toLowerCase();
  return lower === 'chrome://newtab/' ||
    lower === 'chrome://new-tab-page/' ||
    lower === 'edge://newtab/' ||
    lower === 'brave://newtab/' ||
    lower === 'opera://startpage/' ||
    lower === 'about:newtab' ||
    lower === 'about:home';
}

export function isOwnExtensionUrl(url) {
  if (!url || !chrome || !chrome.runtime || !chrome.runtime.id) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const protocol = String(parsed.protocol || '').toLowerCase();
    const origin = getOwnExtensionOrigin();
    return isBrowserExtensionProtocol(protocol) && Boolean(origin) && getExtensionUrlKey(url) === origin;
  } catch (e) {
    return false;
  }
}

function isLumnoBrowserOverrideNewtabUrl(url) {
  const value = String(url || '');
  if (!value || !isOwnExtensionUrl(value) || !chrome || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
    return false;
  }
  const newtabPrefix = EXTENSION_ROUTES.buildNewtabUrl(chrome);
  return value === newtabPrefix || value.startsWith(`${newtabPrefix}?`);
}

function isOtherExtensionUrl(url) {
  if (!url || !chrome || !chrome.runtime || !chrome.runtime.id) {
    return false;
  }
  try {
    const parsed = new URL(String(url));
    return isBrowserExtensionProtocol(parsed.protocol) &&
      String(parsed.hostname || '') !== String(chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

function pruneBrowserNewtabProviderCandidates(now) {
  const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  browserNewtabProviderCandidateTabIds.forEach((createdAt, tabId) => {
    if (currentTime - Number(createdAt || 0) > BROWSER_NEWTAB_PROVIDER_DETECTION_MS) {
      browserNewtabProviderCandidateTabIds.delete(tabId);
    }
  });
}

function isPotentialBrowserNewtabProviderCandidate(tab) {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  const directUrl = typeof tab.url === 'string' ? tab.url : '';
  const pendingUrl = typeof tab.pendingUrl === 'string' ? tab.pendingUrl : '';
  const resolvedUrl = getResolvedTabUrl(tab);
  return isBrowserNewtabUrl(directUrl) ||
    isBrowserNewtabUrl(pendingUrl) ||
    isBrowserNewtabUrl(resolvedUrl) ||
    (!directUrl && !pendingUrl && tab.status === 'loading');
}

export function rememberBrowserNewtabProviderCandidate(tab) {
  pruneBrowserNewtabProviderCandidates();
  if (!isPotentialBrowserNewtabProviderCandidate(tab)) {
    return;
  }
  browserNewtabProviderCandidateTabIds.set(tab.id, Date.now());
}

function isRecentBrowserNewtabProviderCandidate(tab) {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  pruneBrowserNewtabProviderCandidates();
  return browserNewtabProviderCandidateTabIds.has(tab.id);
}

function getBrowserNewtabProviderType(tab) {
  const url = getResolvedTabUrl(tab);
  if (!url) {
    return '';
  }
  if (isLumnoBrowserOverrideNewtabUrl(url)) {
    return 'lumno';
  }
  if (isOtherExtensionUrl(url)) {
    return 'other-extension';
  }
  if (isBrowserNewtabUrl(url) && tab && tab.status === 'complete') {
    return 'browser';
  }
  return '';
}

function setRestrictedActionFromBrowserNewtabProvider(providerType, tab, stage) {
  if (providerType !== 'other-extension') {
    return;
  }
  if (!backgroundSettingsLoaded) {
    // The one-time auto choice must not overwrite a later manual choice just
    // because the done flag has not been read yet on this wake.
    whenBackgroundSettingsReady(() => {
      setRestrictedActionFromBrowserNewtabProvider(providerType, tab, stage);
    });
    return;
  }
  if (restrictedActionAutoBrowserSettingDoneCache) {
    return;
  }
  const url = getResolvedTabUrl(tab);
  markRestrictedActionAutoSelected();
  const payload = {
    [RESTRICTED_ACTION_STORAGE_KEY]: 'none',
    [RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY]: true
  };
  if (storageArea && typeof storageArea.set === 'function') {
    storageArea.set(payload);
  }
  logHotkeyDebug('restricted-action-auto-browser-setting', {
    providerType,
    stage: stage || '',
    url: String(url || '')
  });
}

export function maybeAutoSelectRestrictedBrowserSetting(tab, stage) {
  if (!tab || typeof tab.id !== 'number') {
    return;
  }
  if (restrictedActionAutoBrowserSettingDoneCache) {
    return;
  }
  const isCandidate = isRecentBrowserNewtabProviderCandidate(tab) ||
    isPotentialBrowserNewtabProviderCandidate(tab);
  if (!isCandidate) {
    return;
  }
  const providerType = getBrowserNewtabProviderType(tab);
  if (!providerType) {
    return;
  }
  if (providerType === 'lumno') {
    browserNewtabProviderCandidateTabIds.delete(tab.id);
    return;
  }
  if (providerType === 'other-extension') {
    setRestrictedActionFromBrowserNewtabProvider(providerType, tab, stage);
    browserNewtabProviderCandidateTabIds.delete(tab.id);
    return;
  }
}

export function isLumnoOnboardingUrl(url) {
  return EXTENSION_ROUTES.isOnboardingUrl(url) &&
    isOwnExtensionUrl(url);
}

export function getOwnExtensionFaviconUrl() {
  if (!chrome || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
    return '';
  }
  return chrome.runtime.getURL('assets/images/lumno.png');
}
