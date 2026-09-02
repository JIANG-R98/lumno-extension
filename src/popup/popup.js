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

  function t(key, fallback) {
    return chrome.i18n.getMessage(key) || fallback;
  }

  const labels = {
    appName: t('ext_name', 'Lumno'),
    currentPage: t('popup_current_page', 'Current page'),
    linkedCard: t('popup_linked_card', 'Linked card'),
    update: t('popup_update_action', 'Update link'),
    updating: t('popup_updating_action', 'Updating…'),
    undo: t('recent_undo_tracking_update', 'Undo current update'),
    undoing: t('popup_undoing_action', 'Undoing…'),
    pip: t('popup_pip_action', 'Choose Picture-in-Picture content'),
    statuses: {
      loading: t('popup_status_loading', 'Reading current page…'),
      'update-available': t('popup_status_update_available', 'Update available'),
      'up-to-date': t('popup_status_up_to_date', 'Linked and up to date'),
      'not-linked': t('popup_status_not_linked', 'This page is not linked'),
      unsupported: t('popup_status_unsupported', 'This page is not supported'),
      blocked: t('popup_status_blocked', 'This link cannot be updated'),
      error: t('popup_status_error', 'Unable to read page status')
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
      canUndo: Boolean(state && state.undo && state.undo.available),
      canPip: Number.isInteger(activeTabId),
      labels,
      onUpdate: update,
      onUndo: undo,
      onPip: openPip
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
      ? { kind: 'success', text: t('popup_update_success', 'Linked card updated') }
      : { kind: 'error', text: t('popup_update_failed', 'Unable to update this link') };
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
    await refresh();
  }

  async function openPip() {
    if (!Number.isInteger(activeTabId) || busy) return;
    busy = 'pip'; render();
    const result = await send({ action: 'openDocumentPipFromToolbar', tabId: activeTabId });
    if (result && result.ok) window.close();
    else { busy = ''; notice = { kind: 'error', text: t('popup_pip_failed', 'Unable to open Picture-in-Picture') }; render(); }
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
