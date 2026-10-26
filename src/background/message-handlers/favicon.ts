// Favicons, shortcut icons and site theme colors for the extension's pages.
import type { HandlersFor } from '../message-router';
import { isBlockedLocalFaviconUrl, logBlockedLocalFavicon, resolveFaviconCandidates, shouldBlockFaviconForHost } from '../favicon/candidates';
import { fetchFaviconData } from '../favicon/favicon-data';
import { loadFaviconRequestBlacklistItems } from '../favicon/request-policy';
import { fetchShortcutFaviconData } from '../favicon/shortcut-icons';
import { resolveSiteThemeColor } from '../favicon/site-theme-color';

type FaviconAction = 'resolveFaviconCandidates' | 'getFaviconData' | 'getShortcutFaviconData' | 'resolveSiteThemeColor';

// Favicons and site theme colors.
const FAVICON_MESSAGE_HANDLERS: HandlersFor<FaviconAction> = Object.freeze({
  resolveFaviconCandidates(request, sender, sendResponse) {
    const targetUrl = request.url || '';
    const hostOverride = request.host || '';
    const fallbackUrl = request.fallbackUrl || '';
    resolveFaviconCandidates(targetUrl, hostOverride, fallbackUrl).then((urls) => {
      sendResponse({ urls: Array.isArray(urls) ? urls : [] });
    }).catch(() => {
      sendResponse({ urls: [] });
    });
    return true;
  },
  getFaviconData(request, sender, sendResponse) {
    const targetUrl = request.url || '';
    const pageUrl = request.pageUrl || '';
    if (!targetUrl || typeof targetUrl !== 'string' || targetUrl.startsWith('data:')) {
      sendResponse({ data: '' });
      return;
    }
    loadFaviconRequestBlacklistItems().then(() => {
      if (isBlockedLocalFaviconUrl(targetUrl)) {
        logBlockedLocalFavicon(targetUrl, 'message:getFaviconData');
        sendResponse({ data: '' });
        return;
      }
      try {
        const targetHost = new URL(targetUrl).hostname;
        if (shouldBlockFaviconForHost(targetHost)) {
          sendResponse({ data: '' });
          return;
        }
      } catch (_error) {
        // Ignore parse failures and continue with non-local handling.
      }
      fetchFaviconData(targetUrl, pageUrl).then((dataUrl) => {
        sendResponse({ data: dataUrl || '' });
      }).catch(() => {
        sendResponse({ data: '' });
      });
    }).catch(() => {
      sendResponse({ data: '' });
    });
    return true;
  },
  getShortcutFaviconData(request, sender, sendResponse) {
    const pageUrl = request.pageUrl || '';
    const preferredTheme = request.preferredTheme || '';
    fetchShortcutFaviconData(pageUrl, preferredTheme, '', request.refresh === true, request.iconSource).then((result) => {
      sendResponse(result || {
        data: '',
        sourceUrl: '',
        width: 0,
        height: 0,
        vector: false
      });
    }).catch(() => {
      sendResponse({
        data: '',
        sourceUrl: '',
        width: 0,
        height: 0,
        vector: false
      });
    });
    return true;
  },
  resolveSiteThemeColor(request, sender, sendResponse) {
    const targetUrl = request.url || '';
    const hostOverride = request.host || '';
    const preferredTheme = request.preferredTheme || '';
    resolveSiteThemeColor(targetUrl, hostOverride, preferredTheme).then((result) => {
      sendResponse(result || { accentRgb: null, source: '' });
    }).catch(() => {
      sendResponse({ accentRgb: null, source: '' });
    });
    return true;
  }
});

export {
  FAVICON_MESSAGE_HANDLERS
};
export type {
  FaviconAction
};
