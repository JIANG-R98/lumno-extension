// @ts-nocheck
// Notices on the page: the update notice and its session slot, the
// engagement notice, the help center ask hint and community QR dialog, the
// file access notice and the page notice banner, and the WebDAV hint.
import * as ENGAGEMENT_NOTICE from '../shared/engagement-notice';
import * as COMMUNITY_QR_DIALOG from '../shared/ui/community-qr-dialog';
import * as UPDATE_NOTICE from '../shared/update-notice';

function createPageNotices(deps) {
  const {
    pageSearchParams,
    bottomDock,
    t,
    getRiSvg,
    FEATURE_HINTS,
    getOpenDisposition,
    getFeedbackWebLocale,
    isFeedbackPopoverOpen,
    LUMNO_FEEDBACK_LINKS_FALLBACK,
    openFeedbackExternalUrl,
    COMMUNITY_LINKS,
    getSystemLocale,
    normalizeLocale,
    newtabEntryAnimationReadyPromise,
    activateSiteSearch,
    root,
    getSiteSearchProviders,
    SEARCH_UTILS
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const NEWTAB_PAGE_NOTICE = globalThis.LumnoNewtabPageNotice;

  function clearPageNoticeQueryParam() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('notice')) {
        return;
      }
      url.searchParams.delete('notice');
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      // Ignore URL rewrite failures.
    }
  }

  function openExtensionDetailsPage(detailsUrl) {
    if (chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      chrome.runtime.sendMessage({ action: 'openExtensionDetailsPage' }, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          if (detailsUrl) {
            window.open(detailsUrl, '_blank');
          }
          return;
        }
        if (!response || response.ok !== true) {
          const fallbackUrl = response && response.url ? response.url : detailsUrl;
          if (fallbackUrl) {
            window.open(fallbackUrl, '_blank');
          }
        }
      });
      return;
    }
    if (detailsUrl) {
      window.open(detailsUrl, '_blank');
    }
  }

  function showFileAccessNotice(detailsUrl) {
    NEWTAB_PAGE_NOTICE.renderPageNotice({
      params: pageSearchParams,
      chromeApi: chrome,
      document,
      windowObj: window,
      bottomDock,
      messages: {
        t,
        getRiSvg,
        detailsUrl
      },
      onClose: () => {
        clearPageNoticeQueryParam();
      },
      openExtensionDetailsPage
    });
  }

  function maybeShowFileAccessNotice() {
    const notice = String(pageSearchParams.get('notice') || '').trim();
    if (notice !== 'file-access') {
      return;
    }
    if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      clearPageNoticeQueryParam();
      return;
    }
    chrome.runtime.sendMessage({ action: 'getFileSchemeAccessStatus' }, (response) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        clearPageNoticeQueryParam();
        return;
      }
      if (!response || response.supported === false || response.allowed === true) {
        clearPageNoticeQueryParam();
        return;
      }
      showFileAccessNotice(response.detailsUrl || '');
    });
  }
  function updateNoticeClaimsSessionSlot() {
    return Boolean(
      pageState.updateNoticeController &&
      typeof pageState.updateNoticeController.hasSessionSlot === 'function' &&
      pageState.updateNoticeController.hasSessionSlot()
    );
  }
  pageState.updateNoticeController = UPDATE_NOTICE.createUpdateNotice({
    documentObj: document,
    featureHints: FEATURE_HINTS,
    chromeApi: chrome,
    surface: 'newtab',
    t,
    getRiSvg,
    onSessionSlotClaimed() {
      if (pageState.engagementNoticeController &&
          typeof pageState.engagementNoticeController.suppressForSession === 'function') {
        pageState.engagementNoticeController.suppressForSession();
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
  function createNewtabEngagementNoticeController() {
    return ENGAGEMENT_NOTICE.createEngagementNotice({
      documentObj: document,
      featureHints: FEATURE_HINTS,
      chromeApi: chrome,
      surface: 'newtab',
      locale: getFeedbackWebLocale(),
      t,
      getRiSvg,
      exposureGate: pageState.updateNoticeController && pageState.updateNoticeController.ready,
      canShow() {
        const updateNoticeVisible = Boolean(
          pageState.updateNoticeController &&
          pageState.updateNoticeController.element &&
          pageState.updateNoticeController.element.getAttribute('data-visible') === 'true'
        );
        return !updateNoticeVisible &&
          !updateNoticeClaimsSessionSlot() &&
          document.visibilityState === 'visible' &&
          !String(pageState.inputParts.input.value || '').trim() &&
          document.body.getAttribute('data-nt-suggestions-open') !== 'true' &&
          !isFeedbackPopoverOpen();
      },
      onReview(event) {
        const links = pageState.feedbackLinks || LUMNO_FEEDBACK_LINKS_FALLBACK;
        openFeedbackExternalUrl(
          COMMUNITY_LINKS.getReviewUrl(links),
          getOpenDisposition(event, 'newTab')
        );
      },
      onCommunity(event) {
        const disposition = getOpenDisposition(event, 'newTab');
        const locale = getFeedbackWebLocale();
        const isWechat = ENGAGEMENT_NOTICE.getCommunityChannel(locale) === 'wechat';
        const communityUrlPromise = ENGAGEMENT_NOTICE.loadCommunityUrl({
          force: true,
          locale
        });
        communityUrlPromise.then((url) => {
          if (isWechat) {
            openCommunityQrDialog(url);
            return;
          }
          openFeedbackExternalUrl(url, disposition);
        });
      }
    });
  }
  // Help Center results and the page the search row opens both follow the interface language.
  function getHelpCenterLocale() {
    return pageState.currentResolvedLocale ||
      (pageState.currentLanguageMode === 'system' ? getSystemLocale() : normalizeLocale(pageState.currentLanguageMode));
  }

  // The WeChat group QR opens in a dialog over the page, never in a new tab.
  function openCommunityQrDialog(qrUrl) {
    if (!COMMUNITY_QR_DIALOG) {
      return;
    }
    COMMUNITY_QR_DIALOG.open({
      documentObj: document,
      imageUrl: qrUrl || (pageState.feedbackLinks || LUMNO_FEEDBACK_LINKS_FALLBACK).wechatQr,
      title: t('newtab_feedback_wechat_panel_title', 'Bug 反馈 & 新功能提需'),
      alt: t('newtab_feedback_wechat_qr_alt', 'Lumno 微信群二维码'),
      closeLabel: t('newtab_feedback_wechat_close_tooltip', '关闭'),
      theme: document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      glass: document.body.hasAttribute('data-glass-style'),
      returnFocus: document.activeElement
    });
  }
  // Above the search input, new installs and people updating to this version learn that the
  // Help Center answers questions here (lm + Tab). It stays until closed or until they ask one,
  // and only while the Help Center site search is enabled. Resolves to whether it is showing.
  let helpCenterAskProvider = null;
  const helpCenterAskHintSettled = (() => {
    if (typeof FEATURE_HINTS.createFeatureHint !== 'function' ||
        document.documentElement.getAttribute('data-nt-focus-route-pending') === 'true') {
      return newtabEntryAnimationReadyPromise.then(() => false);
    }
    pageState.helpCenterAskHintController = FEATURE_HINTS.createFeatureHint({
      documentObj: document,
      windowObj: window,
      chromeApi: chrome,
      definition: 'newtab-help-center-ask',
      visibilityGate: newtabEntryAnimationReadyPromise,
      initiallyVisible: false,
      t,
      getRiSvg,
      onLinkClick() {
        dismissHelpCenterAskHint();
        if (helpCenterAskProvider) {
          activateSiteSearch(helpCenterAskProvider);
        }
        pageState.inputParts.input.focus({ preventScroll: true });
      }
    });
    if (!pageState.helpCenterAskHintController || !pageState.helpCenterAskHintController.element) {
      return newtabEntryAnimationReadyPromise.then(() => false);
    }
    // Beside the search plate, anchored to the input, where CSS anchors work: inside it, the plate's
    // own backdrop filter would keep the hint's glass from reaching the wallpaper.
    const helpCenterAskHint = pageState.helpCenterAskHintController.element;
    if (window.CSS && CSS.supports('anchor-name: --x-nt-search-input')) {
      helpCenterAskHint.setAttribute('data-search-anchored', 'true');
      root.after(helpCenterAskHint);
    } else {
      pageState.inputParts.container.appendChild(helpCenterAskHint);
    }
    const providerReady = getSiteSearchProviders()
      .then((items) => (Array.isArray(items) ? items : [])
        .find((item) => SEARCH_UTILS.isHelpCenterSiteSearchProvider(item)) || null)
      .catch(() => null);
    return Promise.all([providerReady, pageState.helpCenterAskHintController.ready]).then(([provider]) => {
      helpCenterAskProvider = provider;
      pageState.helpCenterAskHintController.setVisible(Boolean(provider));
      return pageState.helpCenterAskHintController.isVisible();
    });
  })();

  function dismissHelpCenterAskHint() {
    if (pageState.helpCenterAskHintController && !pageState.helpCenterAskHintController.isDismissed()) {
      pageState.helpCenterAskHintController.dismiss();
    }
  }

  function dismissWebdavFeatureHint() {
    if (pageState.webdavFeatureHintController && typeof pageState.webdavFeatureHintController.dismiss === 'function') {
      pageState.webdavFeatureHintController.dismiss();
    }
  }

  return {
    maybeShowFileAccessNotice,
    createNewtabEngagementNoticeController,
    getHelpCenterLocale,
    openCommunityQrDialog,
    helpCenterAskHintSettled,
    dismissHelpCenterAskHint,
    dismissWebdavFeatureHint
  };
}

export { createPageNotices };
