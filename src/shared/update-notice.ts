// The "updated to vX" notice under the search box of New Tab and the overlay.
// Its data (the published notice, the setting, display counts) lives in
// platform/update-notice.ts, re-exported here for the surfaces.
import * as LumnoFeatureHints from './ui/feature-hints';
import { createSettingsStore, getContextSettingsStore } from '../platform/settings-store';
import type { SettingsStore } from '../platform/settings-store';
import { UPDATE_NOTICE_MAX_DISPLAY_COUNT, RELEASE_DETAILS_URL, GITHUB_RELEASE_API_URL, GITHUB_RELEASE_PAGE_URL, normalizeVersionTag, formatVersionLabel, getReleaseTagCandidates, sanitizeText, extractReleaseTitleFromHtml, getCurrentVersionTag, buildReleaseDetailsUrl, normalizeUpdateNoticePayload, shouldShowUpdateNotice, normalizeUpdateNoticeEnabled, getUpdateNoticeDisplayCountKey, getUpdateNoticeDisplayCountSetting, normalizeUpdateNoticeDisplayCount, getStoredUpdateNotice, getStoredUpdateNoticeEnabled, getStoredUpdateNoticeDisplayCount, setStoredUpdateNotice, fetchReleaseTitle, publishUpdateNotice } from '../platform/update-notice';
import type { ReleaseFetch, UpdateNotice, UpdateNoticeChromeApi } from '../platform/update-notice';
import type { FeatureHintController, FeatureHintDefinition } from './ui/feature-hints';
import type { Setting } from '../domain/settings/define';
import { featureHintDismissedEverywhere, updateNoticeEnabled as updateNoticeEnabledSetting, updateNoticeState } from '../domain/settings/features';

type UpdateNoticeSurface = 'newtab' | 'overlay' | 'shared';

type Translate = (key: string, fallback: string) => string;

interface UpdateNoticeOptions {
  documentObj?: Document | null;
  windowObj?: Partial<Pick<Window, 'open'>> | null;
  chromeApi?: UpdateNoticeChromeApi | null;
  // The page's settings store; the context's shared one when absent.
  settingsStore?: SettingsStore | null;
  featureHints?: Pick<typeof LumnoFeatureHints, 'createFeatureHint' | 'getFeatureHintSyncDismissKey'> | null;
  // This version; the manifest's when absent.
  version?: string;
  surface?: string;
  t?: Translate;
  // The stored notice and setting when the page already read them.
  initialNotice?: unknown;
  updateNoticeEnabled?: unknown;
  fetchImpl?: ReleaseFetch | null;
  onDetailsClick?(notice: UpdateNotice | null, event: MouseEvent): void;
  onDismiss?(): void;
  // The notice showed, so other notices this page view should wait.
  onSessionSlotClaimed?(): void;
}

interface UpdateNoticeController extends Omit<FeatureHintController, 'ready'> {
  applyNoticePayload(payload: unknown): void;
  getNotice(): UpdateNotice | null;
  getDisplayCount(): number;
  hasSessionSlot(): boolean;
  // Counts this showing towards the limit; resolves to whether it counted.
  recordExposure(): Promise<boolean>;
  // Resolves to whether the notice claimed this page view's notice slot.
  ready: Promise<boolean>;
  getDetailsUrl(): string;
}

const UPDATE_NOTICE_ID = 'update-notice';

function formatTemplate(template: string, params: Record<string, string>): string {
  let text = String(template || '');
  Object.keys(params).forEach((key) => {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), params[key]);
  });
  return text;
}

function stripBadgeButterfly(value: string): string {
  return String(value || '').replace(/^(?:\s*🦋\s*)+/u, '').trim();
}

function readSurface(surface: unknown): UpdateNoticeSurface {
  return surface === 'overlay' ? 'overlay' : (surface === 'newtab' ? 'newtab' : 'shared');
}

function createUpdateNoticeDefinition(
  versionTag: unknown,
  options?: { surface?: string } | null
): Readonly<FeatureHintDefinition> {
  const surface = readSurface(options ? options.surface : undefined);
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

// The key that remembers the notice of this version was dismissed.
function getUpdateNoticeDismissKey(
  featureHints: Pick<typeof LumnoFeatureHints, 'getFeatureHintSyncDismissKey'> | null | undefined,
  versionTag: unknown
): string {
  return (featureHints || LumnoFeatureHints).getFeatureHintSyncDismissKey(createUpdateNoticeDefinition(versionTag));
}

function createUpdateNotice(options?: UpdateNoticeOptions | null): UpdateNoticeController | null {
  const config: UpdateNoticeOptions = options || {};
  const documentObj = config.documentObj || (typeof document !== 'undefined' ? document : null);
  const featureHints = config.featureHints || LumnoFeatureHints;
  const chromeApi: UpdateNoticeChromeApi | null = config.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
  const currentVersion = normalizeVersionTag(config.version || getCurrentVersionTag(chromeApi));
  if (!documentObj || !currentVersion) {
    return null;
  }

  const store = config.settingsStore ||
    (chromeApi ? getContextSettingsStore(chromeApi) : createSettingsStore({ chromeApi: null, settings: [] }));
  const surface = readSurface(config.surface);
  const definition = createUpdateNoticeDefinition(currentVersion, { surface });
  const dismissKey = getUpdateNoticeDismissKey(featureHints, currentVersion);
  const displayCountSetting = getUpdateNoticeDisplayCountSetting(currentVersion);
  const dismissId = featureHintDismissedEverywhere.idOf(dismissKey);
  const dismissSetting = dismissId ? featureHintDismissedEverywhere.member(dismissId) : null;
  const baseT: Translate = typeof config.t === 'function'
    ? config.t
    : (_key, fallback) => fallback || '';
  const displayVersion = formatVersionLabel(currentVersion);
  let notice = shouldShowUpdateNotice(config.initialNotice, currentVersion)
    ? normalizeUpdateNoticePayload(config.initialNotice)
    : null;
  let updateNoticeEnabled = normalizeUpdateNoticeEnabled(config.updateNoticeEnabled);
  let destroyed = false;
  let titleRefreshPromise: Promise<void> | null = null;
  let sessionSlotClaimed = false;
  let displayCount = 0;
  let displayCountLoaded = false;
  let exposureRequested = false;
  let exposureRecorded = false;
  let ignoreOwnAutoDismissChange = false;

  function translate(key: string, fallback: string): string {
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

  function getActiveNotice(): UpdateNotice | null {
    return notice || normalizeUpdateNoticePayload({
      version: currentVersion,
      reason: 'update',
      releaseUrl: buildReleaseDetailsUrl(currentVersion, { reason: 'update' })
    });
  }

  function openDetails(event: MouseEvent): void {
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

  const createdHint = featureHints.createFeatureHint({
    documentObj,
    definition,
    chromeApi,
    dismissKey,
    t: translate,
    initiallyVisible: false,
    onLinkClick: openDetails,
    onDismiss() {
      if (typeof config.onDismiss === 'function') {
        config.onDismiss();
      }
    }
  });
  if (!createdHint) {
    return null;
  }
  const hintController: FeatureHintController = createdHint;

  function isVisible(): boolean {
    return hintController.isVisible();
  }

  function claimSessionSlotIfVisible(): void {
    if (destroyed || sessionSlotClaimed || !isVisible()) {
      return;
    }
    sessionSlotClaimed = true;
    if (typeof config.onSessionSlotClaimed === 'function') {
      config.onSessionSlotClaimed();
    }
  }

  function syncDisplayCountAttribute(): void {
    hintController.element.setAttribute(
      'data-update-notice-display-count',
      String(displayCount)
    );
    hintController.element.setAttribute(
      'data-update-notice-display-limit',
      String(UPDATE_NOTICE_MAX_DISPLAY_COUNT)
    );
  }

  function recordExposureIfVisible(): boolean {
    if (destroyed || exposureRecorded || !exposureRequested || !displayCountLoaded || !isVisible()) {
      return false;
    }
    exposureRecorded = true;
    displayCount = normalizeUpdateNoticeDisplayCount(displayCount + 1);
    syncDisplayCountAttribute();
    const values: Array<[Setting<unknown>, unknown]> = [[displayCountSetting, displayCount]];
    if (displayCount >= UPDATE_NOTICE_MAX_DISPLAY_COUNT && dismissSetting) {
      // Persist the normal per-version dismissal while leaving this third
      // exposure visible. Any later newtab or overlay instance will start
      // dismissed, and already-open sibling instances close as it changes.
      values.push([dismissSetting, true]);
      ignoreOwnAutoDismissChange = true;
    }
    store.setMany(values).catch(() => {});
    ignoreOwnAutoDismissChange = false;
    return true;
  }

  function syncNoticeVisibility(): void {
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

  function applyNoticePayload(payload: unknown): void {
    if (destroyed) {
      return;
    }
    notice = shouldShowUpdateNotice(payload, currentVersion)
      ? normalizeUpdateNoticePayload(payload)
      : null;
    syncNoticeVisibility();
  }

  function refreshMissingTitle(): void {
    if (destroyed || !notice || notice.title || titleRefreshPromise) {
      return;
    }
    titleRefreshPromise = fetchReleaseTitle(notice.version, { fetchImpl: config.fetchImpl })
      .then((title) => {
        titleRefreshPromise = null;
        const sanitizedTitle = sanitizeText(title || '');
        if (destroyed || !sanitizedTitle || !notice || notice.title) {
          return;
        }
        const nextNotice = normalizeUpdateNoticePayload({ ...notice, title: sanitizedTitle });
        if (!nextNotice) {
          return;
        }
        notice = nextNotice;
        hintController.updateLanguage();
        void setStoredUpdateNotice(store, nextNotice);
      })
      .catch(() => {
        titleRefreshPromise = null;
      });
  }

  const storedNoticeReadyPromise = Promise.all([
    getStoredUpdateNotice(store),
    getStoredUpdateNoticeEnabled(store),
    getStoredUpdateNoticeDisplayCount(store, currentVersion)
  ]).then(([payload, enabled, storedDisplayCount]) => {
    updateNoticeEnabled = enabled;
    displayCount = storedDisplayCount;
    displayCountLoaded = true;
    syncDisplayCountAttribute();
    applyNoticePayload(payload);
  });
  const readyPromise: Promise<boolean> = Promise.all([
    storedNoticeReadyPromise,
    hintController.ready
  ]).then(() => {
    claimSessionSlotIfVisible();
    return sessionSlotClaimed;
  });

  const followed = dismissSetting
    ? [updateNoticeEnabledSetting, updateNoticeState, displayCountSetting, dismissSetting]
    : [updateNoticeEnabledSetting, updateNoticeState, displayCountSetting];
  const unsubscribe = store.subscribe(followed, (setting) => {
    if (destroyed) {
      return;
    }
    if (setting === updateNoticeEnabledSetting) {
      updateNoticeEnabled = normalizeUpdateNoticeEnabled(store.getStored(updateNoticeEnabledSetting));
      syncNoticeVisibility();
    } else if (setting === updateNoticeState) {
      applyNoticePayload(store.getStored(updateNoticeState));
    } else if (setting === displayCountSetting) {
      displayCount = normalizeUpdateNoticeDisplayCount(store.getStored(displayCountSetting));
      displayCountLoaded = true;
      syncDisplayCountAttribute();
      if (!exposureRecorded) {
        syncNoticeVisibility();
      }
    } else if (dismissSetting && store.get(dismissSetting) && !ignoreOwnAutoDismissChange && !hintController.isDismissed()) {
      hintController.dismiss();
    }
  });

  return Object.freeze({
    ...hintController,
    applyNoticePayload,
    destroy() {
      destroyed = true;
      hintController.destroy();
      unsubscribe();
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
      return readyPromise.then(() => (
        recordExposureIfVisible() || (!wasRecorded && exposureRecorded)
      ));
    },
    ready: readyPromise,
    getDetailsUrl() {
      const activeNotice = getActiveNotice();
      return activeNotice ? activeNotice.releaseUrl : '';
    }
  });
}

export type { UpdateNoticeController, UpdateNoticeOptions, UpdateNoticeSurface };

export {
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
