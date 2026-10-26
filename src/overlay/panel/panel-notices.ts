// Notices in the overlay: the update notice and its session slot, the
// engagement notice and the community QR dialog.
import type { Disposition } from '../../domain/navigation-disposition';
import type * as Settings from '../../domain/settings';
import type * as CommunityLinks from '../../platform/community-links';
import * as ENGAGEMENT_NOTICE from '../../shared/engagement-notice';
import type { EngagementNoticeController } from '../../shared/engagement-notice';
import * as COMMUNITY_QR_DIALOG from '../../shared/ui/community-qr-dialog';
import * as FEATURE_HINTS from '../../shared/ui/feature-hints';
import * as UPDATE_NOTICE from '../../shared/update-notice';
import type { UpdateNoticeController } from '../../shared/update-notice';
import * as LumnoMessaging from '../../platform/messaging';
import type { ActivationEvent } from './result-activation';
import type { Translate } from './types';

interface PanelNoticesState {
  overlay: HTMLElement | null;
  searchInput: HTMLInputElement | null;
  overlayLanguageMode: string;
  overlayUpdateNoticeController: UpdateNoticeController | null;
  overlayEngagementNoticeController: EngagementNoticeController | null;
}

interface PanelNoticesDeps {
  removeOverlay(overlay: HTMLElement | null): void;
  COMMUNITY_LINKS: Pick<typeof CommunityLinks, 'FALLBACK_LINKS'>;
  t: Translate;
  getOpenDisposition(event: ActivationEvent | null, fallback?: Disposition): Disposition;
  getSystemLocale(): string;
  SETTINGS: Pick<typeof Settings, 'normalizeLocale'>;
  overlayState: PanelNoticesState;
}

function createPanelNotices(deps: PanelNoticesDeps) {
  const {
    removeOverlay,
    COMMUNITY_LINKS,
    t,
    getOpenDisposition,
    getSystemLocale,
    SETTINGS
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  // The WeChat group QR opens in a dialog over the page, never in a new tab.
  // The overlay closes first, as it does for any result it opens.
  function openOverlayCommunityQrDialog(qrUrl: string): void {
    const theme = overlayState.overlay && overlayState.overlay.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    removeOverlay(overlayState.overlay);
    COMMUNITY_QR_DIALOG.open({
      documentObj: document,
      imageUrl: qrUrl || COMMUNITY_LINKS.FALLBACK_LINKS.wechatQr,
      title: t('newtab_feedback_wechat_panel_title', 'Bug 反馈 & 新功能提需'),
      alt: t('newtab_feedback_wechat_qr_alt', 'Lumno 微信群二维码'),
      closeLabel: t('newtab_feedback_wechat_close_tooltip', '关闭'),
      theme
    });
  }
  function overlayUpdateNoticeClaimsSessionSlot(): boolean {
    return Boolean(
      overlayState.overlayUpdateNoticeController &&
      typeof overlayState.overlayUpdateNoticeController.hasSessionSlot === 'function' &&
      overlayState.overlayUpdateNoticeController.hasSessionSlot()
    );
  }
  overlayState.overlayUpdateNoticeController = UPDATE_NOTICE.createUpdateNotice({
    documentObj: document,
    featureHints: FEATURE_HINTS,
    chromeApi: chrome,
    surface: 'overlay',
    t,
    onSessionSlotClaimed() {
      if (overlayState.overlayEngagementNoticeController &&
          typeof overlayState.overlayEngagementNoticeController.suppressForSession === 'function') {
        overlayState.overlayEngagementNoticeController.suppressForSession();
      }
    },
    onDetailsClick(_notice, event) {
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
        action: 'openReleasePage',
        reason: 'notice',
        disposition: getOpenDisposition(event, 'newTab')
      });
    }
  });
  overlayState.overlayEngagementNoticeController =
    ENGAGEMENT_NOTICE.createEngagementNotice({
      documentObj: document,
      featureHints: FEATURE_HINTS,
      chromeApi: chrome,
      surface: 'overlay',
      locale: overlayState.overlayLanguageMode === 'system'
        ? getSystemLocale()
        : SETTINGS.normalizeLocale(overlayState.overlayLanguageMode),
      t,
      exposureGate: overlayState.overlayUpdateNoticeController && overlayState.overlayUpdateNoticeController.ready,
      // Waits until no update notice shows, the page is in view and the
      // input is empty.
      canShow() {
        const updateNotice = overlayState.overlayUpdateNoticeController;
        const updateNoticeVisible = Boolean(
          updateNotice &&
          updateNotice.element &&
          updateNotice.element.getAttribute('data-visible') === 'true'
        );
        const overlay = overlayState.overlay;
        const input = overlayState.searchInput;
        return !updateNoticeVisible &&
          !overlayUpdateNoticeClaimsSessionSlot() &&
          document.visibilityState === 'visible' &&
          Boolean(overlay && overlay.isConnected) &&
          !String(input ? input.value || '' : '').trim();
      },
      onReview(event) {
        const disposition = getOpenDisposition(event, 'newTab');
        void ENGAGEMENT_NOTICE.loadReviewUrl().then((url) => {
          if (!url) {
            return;
          }
          LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
            action: 'createTab',
            url,
            disposition
          });
        });
      },
      onCommunity(event) {
        const disposition = getOpenDisposition(event, 'newTab');
        const locale = overlayState.overlayLanguageMode === 'system'
          ? getSystemLocale()
          : SETTINGS.normalizeLocale(overlayState.overlayLanguageMode);
        const isWechat = ENGAGEMENT_NOTICE.getCommunityChannel(locale) === 'wechat';
        const communityUrlPromise =
          ENGAGEMENT_NOTICE.loadCommunityUrl({
            force: true,
            locale
          });
        void communityUrlPromise.then((url) => {
          if (isWechat) {
            openOverlayCommunityQrDialog(url);
            return;
          }
          LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
            action: 'createTab',
            url,
            disposition
          });
        });
      }
    });

  return {
    openOverlayCommunityQrDialog
  };
}

export { createPanelNotices };
export type { PanelNoticesDeps, PanelNoticesState };
