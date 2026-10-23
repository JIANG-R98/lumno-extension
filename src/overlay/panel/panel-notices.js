// Notices in the overlay: the update notice and its session slot, the
// engagement notice and the community QR dialog.
import * as ENGAGEMENT_NOTICE from '../../shared/engagement-notice.js';
import * as COMMUNITY_QR_DIALOG from '../../shared/ui/community-qr-dialog.js';
import * as FEATURE_HINTS from '../../shared/ui/feature-hints.js';
import * as UPDATE_NOTICE from '../../shared/update-notice.js';

function createPanelNotices(deps) {
  const {
    removeOverlay,
    COMMUNITY_LINKS,
    t,
    getRiSvg,
    getOpenDisposition,
    getSystemLocale,
    SETTINGS
  } = deps;

  // The panel state object shared with search-panel.js and the other modules.
  const overlayState = deps.overlayState;

  // The WeChat group QR opens in a dialog over the page, never in a new tab.
  // The overlay closes first, as it does for any result it opens.
  function openOverlayCommunityQrDialog(qrUrl) {
    const theme = overlayState.overlay && overlayState.overlay.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    removeOverlay(overlayState.overlay);
    if (!COMMUNITY_QR_DIALOG) {
      return;
    }
    COMMUNITY_QR_DIALOG.open({
      documentObj: document,
      imageUrl: qrUrl || COMMUNITY_LINKS.FALLBACK_LINKS.wechatQr,
      title: t('newtab_feedback_wechat_panel_title', 'Bug 反馈 & 新功能提需'),
      alt: t('newtab_feedback_wechat_qr_alt', 'Lumno 微信群二维码'),
      closeLabel: t('newtab_feedback_wechat_close_tooltip', '关闭'),
      theme
    });
  }
  function overlayUpdateNoticeClaimsSessionSlot() {
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
    getRiSvg,
    onSessionSlotClaimed() {
      if (overlayState.overlayEngagementNoticeController &&
          typeof overlayState.overlayEngagementNoticeController.suppressForSession === 'function') {
        overlayState.overlayEngagementNoticeController.suppressForSession();
      }
    },
    onDetailsClick(_notice, event) {
      chrome.runtime.sendMessage({
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
      getRiSvg,
      exposureGate: overlayState.overlayUpdateNoticeController && overlayState.overlayUpdateNoticeController.ready,
      canShow() {
        const updateNoticeVisible = Boolean(
          overlayState.overlayUpdateNoticeController &&
          overlayState.overlayUpdateNoticeController.element &&
          overlayState.overlayUpdateNoticeController.element.getAttribute('data-visible') === 'true'
        );
        return !updateNoticeVisible &&
          !overlayUpdateNoticeClaimsSessionSlot() &&
          document.visibilityState === 'visible' &&
          overlayState.overlay &&
          overlayState.overlay.isConnected &&
          !String(overlayState.searchInput.value || '').trim();
      },
      onReview(event) {
        const disposition = getOpenDisposition(event, 'newTab');
        ENGAGEMENT_NOTICE.loadReviewUrl().then((url) => {
          if (!url) {
            return;
          }
          chrome.runtime.sendMessage({
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
        communityUrlPromise.then((url) => {
          if (isWechat) {
            openOverlayCommunityQrDialog(url);
            return;
          }
          chrome.runtime.sendMessage({
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
