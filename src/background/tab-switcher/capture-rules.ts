// Which tabs the worker can capture a thumbnail of.
import { getResolvedTabUrl } from '../browser-urls-service';
import { isFirefoxPrivilegedPageUrl } from './appearance';
import { shouldTrackSwitcherTab } from './state-store';
import type { SwitcherTab } from './types';

function canCaptureSwitcherThumbnail(tab: SwitcherTab | null | undefined): boolean {
  return getSwitcherThumbnailCaptureFailureReason(tab) === '';
}

function getSwitcherThumbnailCaptureFailureReason(tab: SwitcherTab | null | undefined): string {
  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    return 'invalid-tab';
  }
  if (!shouldTrackSwitcherTab(tab)) {
    return 'untracked-tab';
  }
  const url = getResolvedTabUrl(tab);
  try {
    const parsed = new URL(url);
    const protocol = String(parsed.protocol || '').toLowerCase();
    if (!protocol || protocol === 'javascript:') {
      return 'unsupported-protocol';
    }
    // Firefox only returns a small, deliberately blurred capture of its
    // privileged pages; show the icon fallback instead, as for chrome:// pages.
    if (isFirefoxPrivilegedPageUrl(url)) {
      return 'restricted-browser-page';
    }
    return '';
  } catch (_error) {
    return 'invalid-url';
  }
}

export { canCaptureSwitcherThumbnail, getSwitcherThumbnailCaptureFailureReason };
