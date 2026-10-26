// Functions the worker runs in a tab that hosts the switcher, through
// chrome.scripting when the page does not answer messages.
import type { OpenSwitcherState } from '../../domain/tab-switcher-model';

// The functions below run in the page on their own: everything they use is
// defined inside them.
function setTabSwitcherCaptureVisibilityInPage(hidden: boolean, hostId: string): { ok: boolean; reason?: string } {
  const host = document.getElementById(hostId);
  if (!host) {
    return { ok: true, reason: 'tab_switcher_host_missing' };
  }
  const markerKey = 'lumnoCaptureVisibilityHidden';
  const valueKey = 'lumnoCapturePreviousVisibility';
  const priorityKey = 'lumnoCapturePreviousVisibilityPriority';
  const hadValueKey = 'lumnoCaptureHadVisibility';
  if (hidden) {
    if (host.dataset[markerKey] !== 'true') {
      const previousValue = host.style.getPropertyValue('visibility');
      host.dataset[markerKey] = 'true';
      host.dataset[valueKey] = previousValue || '';
      host.dataset[priorityKey] = host.style.getPropertyPriority('visibility') || '';
      host.dataset[hadValueKey] = previousValue ? 'true' : 'false';
    }
    host.style.setProperty('visibility', 'hidden', 'important');
    return { ok: true };
  }
  if (host.dataset[markerKey] === 'true') {
    if (host.dataset[hadValueKey] === 'true') {
      host.style.setProperty(
        'visibility',
        host.dataset[valueKey] || '',
        host.dataset[priorityKey] || ''
      );
    } else {
      host.style.removeProperty('visibility');
    }
    delete host.dataset[markerKey];
    delete host.dataset[valueKey];
    delete host.dataset[priorityKey];
    delete host.dataset[hadValueKey];
  }
  return { ok: true };
}

function getOpenTabSwitcherStateInPage(hostId: string): OpenSwitcherState {
  const host = document.getElementById(hostId);
  return {
    ok: true,
    open: Boolean(host)
  };
}

function updateTabSwitcherThumbnailInPage(update: unknown, hostId: string): unknown {
  const host = document.getElementById(hostId);
  const updateThumbnail: unknown = host ? Reflect.get(host, '_lumnoTabSwitcherUpdateThumbnail') : null;
  if (!host || typeof updateThumbnail !== 'function') {
    return { ok: false, reason: 'tab_switcher_host_missing' };
  }
  const result: unknown = Reflect.apply(updateThumbnail, host, [update]);
  return result || { ok: true };
}

function commitOpenTabSwitcherFromShortcutReleaseInPage(hostId: string): { ok: boolean; committed: boolean } {
  const host = document.getElementById(hostId);
  const commit: unknown = host ? Reflect.get(host, '_lumnoTabSwitcherCommitFromShortcutRelease') : null;
  if (!host || typeof commit !== 'function') {
    return { ok: false, committed: false };
  }
  return {
    ok: true,
    committed: Reflect.apply(commit, host, []) === true
  };
}

export {
  commitOpenTabSwitcherFromShortcutReleaseInPage,
  getOpenTabSwitcherStateInPage,
  setTabSwitcherCaptureVisibilityInPage,
  updateTabSwitcherThumbnailInPage
};
