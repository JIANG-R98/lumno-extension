// @ts-nocheck
// The "updated to vX" notice under the search box of New Tab and the overlay.
// Its data (the published notice, the setting, display counts) lives in
// platform/update-notice.ts, re-exported here for the surfaces.
import * as LumnoFeatureHints from './ui/feature-hints';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import {
  UPDATE_NOTICE_STORAGE_KEY,
  UPDATE_NOTICE_ENABLED_STORAGE_KEY,
  UPDATE_NOTICE_DISPLAY_COUNT_STORAGE_PREFIX,
  UPDATE_NOTICE_MAX_DISPLAY_COUNT,
  RELEASE_DETAILS_URL,
  GITHUB_RELEASE_API_URL,
  GITHUB_RELEASE_PAGE_URL,
  normalizeVersionTag,
  formatVersionLabel,
  getReleaseTagCandidates,
  sanitizeText,
  extractReleaseTitleFromHtml,
  getCurrentVersionTag,
  buildReleaseDetailsUrl,
  normalizeUpdateNoticePayload,
  shouldShowUpdateNotice,
  normalizeUpdateNoticeEnabled,
  getDomIdPart,
  getUpdateNoticeDisplayCountKey,
  normalizeUpdateNoticeDisplayCount,
  getStoredUpdateNotice,
  getStoredUpdateNoticeEnabled,
  getStoredUpdateNoticeDisplayCount,
  setStoredUpdateNotice,
  fetchReleaseTitle,
  publishUpdateNotice
} from '../platform/update-notice';

const UPDATE_NOTICE_ID = 'update-notice';

function getStorageRuntime(chromeApi) {
  const api = chromeApi || (globalThis && globalThis.chrome) || null;
  return LumnoSettingsStorage.createProviderStorageRuntime(api);
}

function formatTemplate(template, params) {
  let text = String(template || '');
  Object.keys(params || {}).forEach((key) => {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), params[key]);
  });
  return text;
}

function stripBadgeButterfly(value) {
  return String(value || '').replace(/^(?:\s*🦋\s*)+/u, '').trim();
}

function createUpdateNoticeDefinition(versionTag, options) {
  const surface = options && options.surface === 'overlay'
    ? 'overlay'
    : (options && options.surface === 'newtab' ? 'newtab' : 'shared');
  const className = surface === 'shared'
    ? 'x-lumno-feature-hint--update-notice'
    : `x-lumno-feature-hint--update-notice x-lumno-feature-hint--update-notice-${surface}`;
  return Object.freeze({
    id: UPDATE_NOTICE_ID,
    introducedIn: normalizeVersionTag(versionTag),
    surface,
    placement: surface === 'overlay' ? 'above search input' : 'below search input',
    className,
    arrowSide: surface === 'overlay' ? 'bottom' : 'top',
    arrowAlign: 'center',
    widthMode: 'container',
    alignMode: 'auto',
    dismissStorage: 'sync',
    rememberOnFirstShow: false,
    badgeIconText: '🦋',
    badgeKey: 'update_notice_badge',
    badgeFallback: '已更新至 {version}',
    textKey: 'update_notice_text',
    textFallback: '查看本次更新',
    linkKey: 'update_notice_link',
    linkFallback: '更新日志',
    closeLabelKey: 'update_notice_close',
    closeLabelFallback: '关闭更新提示'
  });
}

function getUpdateNoticeDismissKey(featureHints, versionTag) {
  const definition = createUpdateNoticeDefinition(versionTag);
  if (featureHints && typeof featureHints.getFeatureHintSyncDismissKey === 'function') {
    return featureHints.getFeatureHintSyncDismissKey(definition);
  }
  const idPart = getDomIdPart(definition.id);
  const versionPart = getDomIdPart(definition.introducedIn || 'unversioned');
  return `_x_lumno_feature_hint_sync_dismissed_2026_${idPart}_${versionPart}`;
}

function createUpdateNotice(options) {
  const config = options && typeof options === 'object' ? options : {};
  const documentObj = config.documentObj || (typeof document !== 'undefined' ? document : null);
  const featureHints = config.featureHints || LumnoFeatureHints;
  const chromeApi = config.chromeApi || (globalThis && globalThis.chrome) || null;
  const currentVersion = normalizeVersionTag(config.version || getCurrentVersionTag(chromeApi));
  if (!documentObj || !currentVersion || !featureHints || typeof featureHints.createFeatureHint !== 'function') {
    return null;
  }

  const storageRuntime = getStorageRuntime(chromeApi);
  const surface = config.surface === 'overlay'
    ? 'overlay'
    : (config.surface === 'newtab' ? 'newtab' : 'shared');
  const definition = createUpdateNoticeDefinition(currentVersion, { surface });
  const dismissKey = getUpdateNoticeDismissKey(featureHints, currentVersion);
  const displayCountKey = getUpdateNoticeDisplayCountKey(currentVersion);
  const baseT = typeof config.t === 'function'
    ? config.t
    : function(_key, fallback) { return fallback || ''; };
  const displayVersion = formatVersionLabel(currentVersion);
  let notice = shouldShowUpdateNotice(config.initialNotice, currentVersion)
    ? normalizeUpdateNoticePayload(config.initialNotice)
    : null;
  let updateNoticeEnabled = normalizeUpdateNoticeEnabled(config.updateNoticeEnabled);
  let destroyed = false;
  let titleRefreshPromise = null;
  let sessionSlotClaimed = false;
  let readyPromise = null;
  let displayCount = 0;
  let displayCountLoaded = false;
  let exposureRequested = false;
  let exposureRecorded = false;
  let ignoreOwnAutoDismissChange = false;

  function translate(key, fallback) {
    if (key === 'update_notice_badge') {
      return stripBadgeButterfly(
        formatTemplate(baseT(key, fallback || '已更新至 {version}'), { version: displayVersion })
      );
    }
    if (key === 'update_notice_text') {
      if (notice && notice.title) {
        return notice.title;
      }
      return formatTemplate(baseT('update_notice_text_fallback', fallback || '查看本次更新'), {
        version: displayVersion
      });
    }
    if (key === 'update_notice_link') {
      return baseT(key, fallback || '更新日志');
    }
    if (key === 'update_notice_close') {
      return baseT(key, fallback || '关闭更新提示');
    }
    return baseT(key, fallback);
  }

  function getActiveNotice() {
    return notice || normalizeUpdateNoticePayload({
      version: currentVersion,
      reason: 'update',
      releaseUrl: buildReleaseDetailsUrl(currentVersion, { reason: 'update' })
    });
  }

  function openDetails(event) {
    const activeNotice = getActiveNotice();
    if (typeof config.onDetailsClick === 'function') {
      config.onDetailsClick(activeNotice, event);
      return;
    }
    const url = activeNotice && activeNotice.releaseUrl ? activeNotice.releaseUrl : '';
    const windowObj = config.windowObj || (typeof window !== 'undefined' ? window : null);
    if (url && windowObj && typeof windowObj.open === 'function') {
      windowObj.open(url, '_blank', 'noopener');
    }
  }

  const hintController = featureHints.createFeatureHint({
    documentObj,
    definition,
    chromeApi,
    dismissKey,
    t: translate,
    getRiSvg: config.getRiSvg,
    initiallyVisible: false,
    onLinkClick: openDetails,
    onDismiss() {
      if (typeof config.onDismiss === 'function') {
        config.onDismiss();
      }
    }
  });
  if (!hintController) {
    return null;
  }

  function isVisible() {
    return typeof hintController.isVisible === 'function'
      ? hintController.isVisible()
      : hintController.element.getAttribute('data-visible') === 'true';
  }

  function claimSessionSlotIfVisible() {
    if (destroyed || sessionSlotClaimed || !isVisible()) {
      return;
    }
    sessionSlotClaimed = true;
    if (typeof config.onSessionSlotClaimed === 'function') {
      config.onSessionSlotClaimed();
    }
  }

  function syncDisplayCountAttribute() {
    hintController.element.setAttribute(
      'data-update-notice-display-count',
      String(displayCount)
    );
    hintController.element.setAttribute(
      'data-update-notice-display-limit',
      String(UPDATE_NOTICE_MAX_DISPLAY_COUNT)
    );
  }

  function recordExposureIfVisible() {
    if (destroyed || exposureRecorded || !exposureRequested || !displayCountLoaded || !isVisible()) {
      return false;
    }
    exposureRecorded = true;
    displayCount = normalizeUpdateNoticeDisplayCount(displayCount + 1);
    syncDisplayCountAttribute();
    if (!storageRuntime.area || typeof storageRuntime.area.set !== 'function') {
      return true;
    }
    const values = { [displayCountKey]: displayCount };
    if (displayCount >= UPDATE_NOTICE_MAX_DISPLAY_COUNT) {
      // Persist the normal per-version dismissal while leaving this third
      // exposure visible. Any later newtab or overlay instance will start
      // dismissed, and already-open sibling instances close via onChanged.
      values[dismissKey] = true;
      ignoreOwnAutoDismissChange = true;
    }
    try {
      storageRuntime.area.set(values, () => {
        const api = chromeApi || (globalThis && globalThis.chrome) || null;
        if (api && api.runtime && api.runtime.lastError) {
          ignoreOwnAutoDismissChange = false;
        }
      });
    } catch (e) {
      ignoreOwnAutoDismissChange = false;
    }
    return true;
  }

  function syncNoticeVisibility() {
    hintController.updateLanguage();
    const displayLimitReached = displayCountLoaded &&
      displayCount >= UPDATE_NOTICE_MAX_DISPLAY_COUNT &&
      !exposureRecorded;
    hintController.setVisible(Boolean(
      updateNoticeEnabled &&
      notice &&
      displayCountLoaded &&
      !displayLimitReached
    ));
    claimSessionSlotIfVisible();
    recordExposureIfVisible();
    if (updateNoticeEnabled) {
      refreshMissingTitle();
    }
  }

  function applyNoticePayload(payload) {
    if (destroyed) {
      return;
    }
    notice = shouldShowUpdateNotice(payload, currentVersion)
      ? normalizeUpdateNoticePayload(payload)
      : null;
    syncNoticeVisibility();
  }

  function refreshMissingTitle() {
    if (destroyed || !notice || notice.title || titleRefreshPromise) {
      return;
    }
    titleRefreshPromise = fetchReleaseTitle(notice.version, config)
      .then((title) => {
        titleRefreshPromise = null;
        const sanitizedTitle = sanitizeText(title || '');
        if (destroyed || !sanitizedTitle || !notice || notice.title) {
          return;
        }
        const nextNotice = normalizeUpdateNoticePayload(Object.assign({}, notice, {
          title: sanitizedTitle
        }));
        if (!nextNotice) {
          return;
        }
        notice = nextNotice;
        hintController.updateLanguage();
        setStoredUpdateNotice(chromeApi, nextNotice);
      })
      .catch(() => {
        titleRefreshPromise = null;
      });
  }

  const storedNoticeReadyPromise = Promise.all([
    getStoredUpdateNotice(chromeApi),
    getStoredUpdateNoticeEnabled(chromeApi),
    getStoredUpdateNoticeDisplayCount(chromeApi, currentVersion)
  ]).then(([payload, enabled, storedDisplayCount]) => {
    updateNoticeEnabled = enabled;
    displayCount = storedDisplayCount;
    displayCountLoaded = true;
    syncDisplayCountAttribute();
    applyNoticePayload(payload);
  });
  readyPromise = Promise.all([
    storedNoticeReadyPromise,
    hintController.ready || Promise.resolve(false)
  ]).then(() => {
    claimSessionSlotIfVisible();
    return sessionSlotClaimed;
  });

  function handleStorageChanged(changes, areaName) {
    if (destroyed || (storageRuntime.name && areaName && areaName !== storageRuntime.name)) {
      return;
    }
    if (changes && changes[UPDATE_NOTICE_ENABLED_STORAGE_KEY]) {
      updateNoticeEnabled = normalizeUpdateNoticeEnabled(
        changes[UPDATE_NOTICE_ENABLED_STORAGE_KEY].newValue
      );
      syncNoticeVisibility();
    }
    if (changes && changes[UPDATE_NOTICE_STORAGE_KEY]) {
      applyNoticePayload(changes[UPDATE_NOTICE_STORAGE_KEY].newValue);
    }
    if (changes && changes[displayCountKey]) {
      displayCount = normalizeUpdateNoticeDisplayCount(changes[displayCountKey].newValue);
      displayCountLoaded = true;
      syncDisplayCountAttribute();
      if (!exposureRecorded) {
        syncNoticeVisibility();
      }
    }
    if (changes && changes[dismissKey] && changes[dismissKey].newValue && !hintController.isDismissed()) {
      if (ignoreOwnAutoDismissChange) {
        ignoreOwnAutoDismissChange = false;
      } else {
        hintController.dismiss();
      }
    }
  }

  if (chromeApi &&
      chromeApi.storage &&
      chromeApi.storage.onChanged &&
      typeof chromeApi.storage.onChanged.addListener === 'function') {
    chromeApi.storage.onChanged.addListener(handleStorageChanged);
  }

  return Object.freeze(Object.assign({}, hintController, {
    applyNoticePayload,
    destroy() {
      destroyed = true;
      if (typeof hintController.destroy === 'function') {
        hintController.destroy();
      }
      if (chromeApi &&
          chromeApi.storage &&
          chromeApi.storage.onChanged &&
          typeof chromeApi.storage.onChanged.removeListener === 'function') {
        chromeApi.storage.onChanged.removeListener(handleStorageChanged);
      }
    },
    getNotice() {
      return notice;
    },
    getDisplayCount() {
      return displayCount;
    },
    hasSessionSlot() {
      return sessionSlotClaimed;
    },
    isVisible,
    recordExposure() {
      const wasRecorded = exposureRecorded;
      exposureRequested = true;
      if (!readyPromise) {
        return Promise.resolve(false);
      }
      return readyPromise.then(() => (
        recordExposureIfVisible() || (!wasRecorded && exposureRecorded)
      ));
    },
    ready: readyPromise,
    getDetailsUrl() {
      const activeNotice = getActiveNotice();
      return activeNotice ? activeNotice.releaseUrl : '';
    }
  }));
}

export {
  UPDATE_NOTICE_STORAGE_KEY,
  UPDATE_NOTICE_ENABLED_STORAGE_KEY,
  UPDATE_NOTICE_DISPLAY_COUNT_STORAGE_PREFIX,
  UPDATE_NOTICE_MAX_DISPLAY_COUNT,
  RELEASE_DETAILS_URL,
  GITHUB_RELEASE_API_URL,
  GITHUB_RELEASE_PAGE_URL,
  normalizeVersionTag,
  formatVersionLabel,
  getReleaseTagCandidates,
  extractReleaseTitleFromHtml,
  getCurrentVersionTag,
  buildReleaseDetailsUrl,
  normalizeUpdateNoticePayload,
  shouldShowUpdateNotice,
  normalizeUpdateNoticeEnabled,
  createUpdateNoticeDefinition,
  getUpdateNoticeDismissKey,
  getUpdateNoticeDisplayCountKey,
  normalizeUpdateNoticeDisplayCount,
  getStoredUpdateNotice,
  getStoredUpdateNoticeEnabled,
  getStoredUpdateNoticeDisplayCount,
  setStoredUpdateNotice,
  fetchReleaseTitle,
  publishUpdateNotice,
  createUpdateNotice
};
