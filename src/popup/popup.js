(function() {
  'use strict';

  const root = document.getElementById('popup-root');
  const api = globalThis.LumnoPopupReact;
  if (!root || !api || typeof api.createPopupController !== 'function') return;

  const controller = api.createPopupController(root);
  let activeTabId = null;
  let state = null;
  let busy = '';
  let notice = null;
  let showUndo = false;

  function t(key, fallback) {
    return chrome.i18n.getMessage(key) || fallback;
  }

  const labels = {
    appName: 'Lumno',
    originalContent: t('popup_original_content', 'Previous content'),
    update: t('popup_update_action', 'Update link'),
    updating: t('popup_updating_action', 'Updating…'),
    link: t('popup_link_action', 'Link this page'),
    linking: t('popup_linking_action', 'Linking…'),
    undo: t('recent_undo_tracking_update', 'Undo current update'),
    undoing: t('popup_undoing_action', 'Undoing…'),
    settings: t('settings_title', 'Settings'),
    webClip: t('document_pip_command_action', 'Start clipping'),
    statuses: {
      loading: t('popup_status_loading', 'Reading current page…'),
      'update-available': t('popup_status_update_available', 'Update available'),
      'up-to-date': t('popup_status_up_to_date', 'Linked'),
      'not-linked': t('popup_status_not_linked', 'Ready to link'),
      unsupported: t('popup_status_unsupported', 'This page is not supported'),
      blocked: t('popup_status_blocked', "Can't update"),
      error: t('popup_status_error', 'Unable to read page status')
    },
    statusDetails: {
      loading: t('popup_status_loading_detail', 'Checking the active tab'),
      'update-available': t('popup_status_update_available_detail', 'Replace the previous content with the current page'),
      'up-to-date': t('popup_status_up_to_date_detail', 'The linked card already points to this page'),
      'not-linked': t('popup_status_not_linked_detail', 'Add this page to the New Tab page and link it'),
      unsupported: t('popup_status_unsupported_detail', 'Only regular web pages can be linked'),
      blocked: t('popup_status_blocked_detail', 'The current page does not match this linked card'),
      error: t('popup_status_error_detail', 'Close the panel and try again')
    }
  };

  function faviconUrl(page) {
    if (!page || !page.url) return '';
    return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(page.url)}&size=32`);
  }

  function render() {
    const status = state && state.status ? state.status : 'loading';
    const page = state && state.page ? { ...state.page, faviconUrl: faviconUrl(state.page) } : null;
    controller.render({
      status,
      busy,
      notice,
      page,
      linkedCard: state && state.linkedCard,
      canUpdate: Boolean(state && state.canUpdate),
      canLink: Boolean(state && state.status === 'not-linked' && state.page && state.page.url),
      canUndo: Boolean(showUndo && state && state.undo && state.undo.available),
      canClip: Number.isInteger(activeTabId),
      labels,
      onUpdate: update,
      onLink: link,
      onUndo: undo,
      onClip: openWebClip,
      onOpenSettings: openSettings
    });
  }

  function send(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, reason: 'runtime-error' });
        else resolve(response || { ok: false, reason: 'empty-response' });
      });
    });
  }

  async function refresh() {
    if (!Number.isInteger(activeTabId)) return;
    const result = await send({ action: 'getPinnedRecentToolbarState', tabId: activeTabId });
    state = result && result.status ? result : { ok: false, status: 'error' };
    render();
  }

  async function update() {
    if (!state || !state.canUpdate || busy) return;
    busy = 'update'; notice = null; render();
    const result = await send({
      action: 'updatePinnedRecentFromToolbar',
      tabId: activeTabId,
      guard: state.updateGuard
    });
    busy = '';
    notice = result && result.ok
      ? { kind: 'success', text: t('popup_update_success', 'Linked card updated'), celebrate: true }
      : { kind: 'error', text: t('popup_update_failed', 'Unable to update this link') };
    showUndo = Boolean(result && result.ok);
    await refresh();
  }

  async function link() {
    if (!state || state.status !== 'not-linked' || busy) return;
    busy = 'link'; notice = null; render();
    const result = await send({ action: 'linkPinnedRecentFromToolbar', tabId: activeTabId });
    busy = '';
    notice = result && result.ok
      ? { kind: 'success', text: t('popup_link_success', 'Page linked'), celebrate: true }
      : { kind: 'error', text: t('popup_link_failed', 'Unable to link this page') };
    await refresh();
  }

  async function undo() {
    if (!state || !state.linkedCard || !state.undo || !state.undo.available || busy) return;
    busy = 'undo'; notice = null; render();
    const result = await send({
      action: 'undoPinnedRecentTrackingUpdate',
      cardId: state.linkedCard.cardId,
      expectedUrl: state.undo.expectedUrl
    });
    busy = '';
    notice = result && result.ok
      ? { kind: 'success', text: t('popup_undo_success', 'Current update undone') }
      : { kind: 'error', text: t('recent_undo_tracking_update_failed', 'Unable to undo this update') };
    if (result && result.ok) showUndo = false;
    await refresh();
  }

  async function openSettings() {
    if (busy) return;
    busy = 'settings'; render();
    const result = await send({ action: 'openOptionsPage' });
    if (result && result.ok) window.close();
    else { busy = ''; notice = { kind: 'error', text: t('popup_settings_failed', 'Unable to open Settings') }; render(); }
  }

  async function openWebClip() {
    if (!Number.isInteger(activeTabId) || busy) return;
    busy = 'clip'; render();
    const result = await send({ action: 'openDocumentPipFromToolbar', tabId: activeTabId });
    if (result && result.ok) window.close();
    else { busy = ''; notice = { kind: 'error', text: t('document_pip_picker_open_failed', 'Unable to start web clipping') }; render(); }
  }

  render();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = Array.isArray(tabs) ? tabs[0] : null;
    activeTabId = tab && Number.isInteger(tab.id) ? tab.id : null;
    if (!Number.isInteger(activeTabId)) {
      state = { ok: false, status: 'error' };
      render();
      return;
    }
    void refresh();
  });
})();
