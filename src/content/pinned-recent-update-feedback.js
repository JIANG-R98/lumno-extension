(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoPinnedRecentUpdateFeedback = api;
  if (root.document && root.chrome) {
    api.attach({ windowObj: root, chromeApi: root.chrome });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ACTION = 'showPinnedRecentUpdateFeedback';
  const PREVIEW_ACTION = 'showPinnedRecentUpdatePreview';
  const HOST_ID = '_x_extension_pinned_recent_update_feedback_2026_unique_';
  const FALLBACK_MESSAGES = Object.freeze({
    updated: 'Tracked card link updated',
    added: 'Page pinned and tracking enabled',
    'tracking-enabled': 'Tracking enabled for this pinned page',
    'already-tracked': 'This page is already pinned and tracked',
    'pin-limit': 'Remove a pinned card before adding another',
    'same-url': 'This page is already the tracked card link',
    'ambiguous-target': 'Cannot identify the tracked card',
    'source-not-found': 'The original tracked card no longer exists',
    'url-conflict': 'Another pinned card already uses this link',
    'no-tracked-target': 'No tracked card can be updated from this page',
    'save-failed': 'Could not update the tracked card'
  });
  const MESSAGE_KEYS = Object.freeze({
    updated: 'recent_update_feedback_success',
    added: 'recent_add_tracking_feedback_success',
    'tracking-enabled': 'recent_enable_tracking_feedback_success',
    'already-tracked': 'recent_add_tracking_feedback_already_tracked',
    'pin-limit': 'recent_add_tracking_feedback_limit',
    'same-url': 'recent_update_feedback_same_url',
    'ambiguous-target': 'recent_update_feedback_ambiguous',
    'source-not-found': 'recent_update_feedback_source_missing',
    'url-conflict': 'recent_update_feedback_url_conflict',
    'no-tracked-target': 'recent_update_feedback_not_tracked',
    'save-failed': 'recent_update_feedback_failed'
  });

  function createFeedbackController(options) {
    const config = options && typeof options === 'object' ? options : {};
    const windowObj = config.windowObj || globalThis.window;
    const documentObj = config.documentObj || (windowObj && windowObj.document);
    const chromeApi = config.chromeApi || (windowObj && windowObj.chrome);
    let host = null;
    let surface = null;
    let messageElement = null;
    let preview = null;
    let previewPanel = null;
    let previewOldTitle = null;
    let previewOldUrl = null;
    let previewNewTitle = null;
    let previewNewUrl = null;
    let previewCardSite = null;
    let previewCardTitle = null;
    let previewCardUrl = null;
    let previewCardIcon = null;
    let previewCancel = null;
    let previewConfirm = null;
    let previewResolve = null;
    let previousFocus = null;
    let previewTimers = [];
    let hideTimer = 0;
    const previewTimings = {
      enter: Math.max(0, Number(config.previewTimings && config.previewTimings.enter) || 220),
      commit: Math.max(0, Number(config.previewTimings && config.previewTimings.commit) || 520),
      hold: Math.max(0, Number(config.previewTimings && config.previewTimings.hold) || 420),
      exit: Math.max(0, Number(config.previewTimings && config.previewTimings.exit) || 240)
    };
    if (config.previewTimings && config.previewTimings.instant === true) {
      previewTimings.enter = 0;
      previewTimings.commit = 0;
      previewTimings.hold = 0;
      previewTimings.exit = 0;
    }

    function getMessage(reason) {
      const key = MESSAGE_KEYS[reason] || MESSAGE_KEYS['save-failed'];
      const localized = chromeApi && chromeApi.i18n &&
        typeof chromeApi.i18n.getMessage === 'function'
        ? chromeApi.i18n.getMessage(key)
        : '';
      return String(localized || FALLBACK_MESSAGES[reason] || FALLBACK_MESSAGES['save-failed']);
    }

    function getUiMessage(key, fallback) {
      const localized = chromeApi && chromeApi.i18n &&
        typeof chromeApi.i18n.getMessage === 'function'
        ? chromeApi.i18n.getMessage(key)
        : '';
      return String(localized || fallback);
    }

    function ensureSurface() {
      if (surface && surface.isConnected) return true;
      if (!documentObj || !documentObj.documentElement) return false;
      host = documentObj.getElementById(HOST_ID) || documentObj.createElement('div');
      host.id = HOST_ID;
      if (!host.isConnected) documentObj.documentElement.appendChild(host);
      const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
      shadow.textContent = '';
      const style = documentObj.createElement('style');
      style.textContent = `
        :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
        .feedback { position: absolute; inset: 0; overflow: hidden; opacity: 0; }
        .glow { position: absolute; inset: 0; opacity: 0; background:
          linear-gradient(to bottom, rgba(20,160,253,.46), rgba(133,205,254,.22) 36px, transparent 128px),
          linear-gradient(to top, rgba(20,160,253,.42), rgba(133,205,254,.20) 36px, transparent 128px),
          linear-gradient(to right, rgba(20,160,253,.42), rgba(133,205,254,.20) 36px, transparent 128px),
          linear-gradient(to left, rgba(20,160,253,.42), rgba(133,205,254,.20) 36px, transparent 128px);
          box-shadow: inset 0 0 34px rgba(20,160,253,.42), inset 0 0 112px rgba(133,205,254,.22);
          transform: scale(1.008);
        }
        .feedback[data-show="true"] { opacity: 1; }
        .feedback[data-show="true"] .glow { animation: viewport-breathe 1050ms cubic-bezier(.22,.61,.36,1) both; }
        .message { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        .preview { position: absolute; inset: 0; display: grid; place-items: center; padding: 12px; box-sizing: border-box; pointer-events: auto; background: rgba(15,23,42,.18); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color-scheme: light dark; font-family: "Open Sans","PingFang SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; opacity: 1; transition: opacity 220ms ease, background-color 220ms ease, backdrop-filter 220ms ease; }
        .preview[hidden] { display: none; }
        .preview[data-state="entering"], .preview[data-state="leaving"] { opacity: 0; background: rgba(7,18,30,0); backdrop-filter: blur(0); }
        .panel { --home-card-width: min(251px, calc((min(96vw, 1040px) - 36px) / 4)); width: min(720px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 24px; box-sizing: border-box; border: 0; border-radius: 30px; background: radial-gradient(120% 160% at 12% -24%, rgba(255,255,255,.78) 0%, rgba(255,255,255,.44) 38%, rgba(241,245,249,.26) 100%), linear-gradient(135deg, rgba(255,255,255,.48), rgba(226,232,240,.28)); box-shadow: 0 26px 82px rgba(15,23,42,.22), 0 5px 18px rgba(15,23,42,.08), inset 0 1px 0 rgba(255,255,255,.86), inset 0 -18px 44px rgba(255,255,255,.22), inset 0 0 0 1px rgba(255,255,255,.30); backdrop-filter: blur(56px) saturate(210%); -webkit-backdrop-filter: blur(56px) saturate(210%); color: #172033; opacity: 1; transform: translateY(0) scale(1); transition: opacity 220ms ease, transform 220ms cubic-bezier(.22,1,.36,1); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
        .preview[data-state="entering"] .panel { opacity: 0; transform: translateY(18px) scale(.965); }
        .preview[data-state="leaving"] .panel { opacity: 0; transform: translateY(-10px) scale(.98); }
        .preview-title { margin: 0 0 18px; font-size: 16px; line-height: 1.4; font-weight: 650; text-align: center; transition: opacity 180ms ease, transform 220ms ease; }
        .change { display: grid; grid-template-columns: minmax(0,1fr) 34px minmax(0,1fr); align-items: stretch; gap: 8px; position: relative; }
        .record { min-width: 0; padding: 13px 14px; border-radius: 18px; background: rgba(255,255,255,.42); box-shadow: inset 0 1px 0 rgba(255,255,255,.72), inset 0 0 0 1px rgba(15,23,42,.06); transition: opacity 240ms ease, transform 460ms cubic-bezier(.22,1,.36,1), filter 240ms ease; }
        .record--new { background: linear-gradient(135deg, rgba(37,99,235,.12), rgba(255,255,255,.46)); box-shadow: inset 0 1px 0 rgba(255,255,255,.78), inset 0 0 0 1px rgba(37,99,235,.16); }
        .record-label { margin-bottom: 5px; color: #547086; font-size: 11px; line-height: 1.3; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; }
        .record-title { overflow: hidden; color: #142535; font-size: 14px; line-height: 1.45; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .record-url { margin-top: 3px; overflow: hidden; color: #668095; font-size: 12px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
        .arrow { align-self: center; justify-self: center; color: #14a0fd; font-size: 18px; line-height: 1; transition: opacity 180ms ease, transform 260ms ease; }
        .card-stage { margin: 18px auto 0; width: min(var(--home-card-width), 100%); perspective: 900px; }
        .home-card { padding: 7px 7px 12px; border: 1px solid rgba(0,0,0,.10); border-radius: 28px; background: linear-gradient(145deg, rgba(37,99,235,.12), rgba(148,163,184,.20)); box-shadow: 0 12px 30px rgba(15,23,42,.14), inset 0 1px 0 rgba(255,255,255,.62); transform: scale(.965); transform-origin: center; transition: transform 420ms cubic-bezier(.22,1,.36,1), box-shadow 420ms ease; }
        .card-inner { position: relative; height: 104px; padding: 13px 13px 14px 15px; box-sizing: border-box; border: 1px solid rgba(20,72,109,.11); border-radius: 20px; background: rgba(255,255,255,.78); box-shadow: 0 12px 30px rgba(31,83,118,.10), inset 0 1px 0 rgba(255,255,255,.82); overflow: hidden; }
        .card-content { opacity: 0; transform: translateY(-12px) scale(.98); filter: blur(4px); transition: opacity 280ms ease, transform 420ms cubic-bezier(.22,1,.36,1), filter 300ms ease; }
        .card-header { display: grid; grid-template-columns: 25px minmax(0,1fr); align-items: center; gap: 7px; }
        .card-icon { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 6px; background: linear-gradient(135deg, #14a0fd, #85cdfe); color: #063755; font-size: 12px; font-weight: 750; }
        .card-site { overflow: hidden; color: #19364b; font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
        .card-title { margin: 5px 0 0 32px; color: #29485f; font-size: 12px; line-height: 16px; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
        .card-footer { display: flex; align-items: center; min-width: 0; gap: 8px; margin: 10px 5px 0 10px; color: #55758c; font-size: 13px; }
        .card-url { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .card-status { display: inline-flex; align-items: center; gap: 5px; color: #14a0fd; font-size: 12px; font-weight: 650; }
        .card-status::before { content: ""; width: 7px; height: 7px; border: 2px solid currentColor; border-radius: 50%; box-shadow: 0 0 0 2px rgba(20,160,253,.12); }
        .preview[data-phase="committing"] .record--old { opacity: 0; transform: translateX(-22px) scale(.96); filter: blur(3px); }
        .preview[data-phase="committing"] .record--new { opacity: 0; transform: translate(-48%, 112px) scale(.78); filter: blur(2px); }
        .preview[data-phase="committing"] .arrow { opacity: 0; transform: scale(.7); }
        .preview[data-phase="committing"] .preview-title, .preview[data-phase="complete"] .preview-title { opacity: .45; transform: translateY(-3px); }
        .preview[data-phase="committing"] .card-content, .preview[data-phase="complete"] .card-content { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        .preview[data-phase="complete"] .change { visibility: hidden; height: 0; }
        .preview[data-phase="complete"] .home-card { transform: rotate(-1.2deg) scale(1.025); box-shadow: 0 24px 58px rgba(20,103,158,.24), inset 0 1px 0 rgba(255,255,255,.7); }
        .preview[data-phase="complete"] .card-stage { animation: card-complete 420ms cubic-bezier(.22,1,.36,1) both; }
        .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; transition: opacity 160ms ease, transform 180ms ease; }
        .preview[data-phase="committing"] .actions, .preview[data-phase="complete"] .actions { opacity: 0; transform: translateY(8px); pointer-events: none; }
        .x-lumno-action-button { all: unset; position: relative; min-width: 84px; min-height: 36px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--action-border, transparent); background: var(--action-bg, transparent); background-clip: padding-box; color: var(--action-color, #1f2937); box-shadow: var(--action-shadow, none); display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; font: 600 13px/1 "Open Sans","PingFang SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; white-space: nowrap; cursor: pointer; transition: transform 120ms ease, filter 120ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease; }
        .x-lumno-action-button::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: var(--action-before-shadow, none); }
        .x-lumno-action-button:hover { background: var(--action-hover-bg, var(--action-bg)); box-shadow: var(--action-hover-shadow, var(--action-shadow)); }
        .x-lumno-action-button:active { transform: translateY(1px) scale(.98); filter: brightness(.96); }
        .x-lumno-action-button:focus-visible { outline: 2px solid rgba(75,84,95,.35); outline-offset: 2px; }
        .x-lumno-action-button:disabled { opacity: .62; cursor: not-allowed; transform: none; filter: none; }
        .x-lumno-action-button--primary { --action-border: #040404; --action-bg: linear-gradient(180deg,#404859 0%,#273042 100%); --action-color: #fff; --action-shadow: 0 3px 2px rgba(0,0,0,.035),0 2px 2px rgba(0,0,0,.065),0 0 1px rgba(0,0,0,.075); --action-before-shadow: inset 0 1px 1.6px rgba(255,255,255,.34); --action-hover-bg: linear-gradient(180deg,#4a5467 0%,#2f3a4f 100%); }
        .x-lumno-action-button--secondary { --action-border: rgba(15,23,42,.06); --action-bg: #fff; --action-color: #1f2937; --action-shadow: 0 2px 2px rgba(15,23,42,.025),0 1px 1px rgba(15,23,42,.035),0 0 1px rgba(15,23,42,.06),inset 0 1px 0 rgba(255,255,255,.75); --action-hover-bg: #f8fafc; }
        @media (prefers-color-scheme: dark) {
          .panel { background: radial-gradient(120% 160% at 12% -24%, rgba(71,85,105,.48) 0%, rgba(30,41,59,.50) 40%, rgba(15,23,42,.64) 100%), linear-gradient(135deg, rgba(30,41,59,.72), rgba(15,23,42,.64)); color: #edf7ff; box-shadow: 0 26px 82px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.12), inset 0 0 0 1px rgba(255,255,255,.08); }
          .record { background: rgba(133,205,254,.07); }
          .record--new { background: linear-gradient(135deg, rgba(20,160,253,.17), rgba(133,205,254,.09)); }
          .record-title { color: #edf7ff; }
          .record-label, .record-url { color: #9bb5c8; }
          .x-lumno-action-button--primary { --action-bg: linear-gradient(180deg,#4a566c 0%,#334157 100%); --action-color: #f8fafc; --action-hover-bg: linear-gradient(180deg,#56647c 0%,#3a4b66 100%); }
          .x-lumno-action-button--secondary { --action-border: rgba(148,163,184,.18); --action-bg: rgba(30,41,59,.90); --action-color: #f8fafc; --action-hover-bg: rgba(51,65,85,.96); }
          .home-card { border-color: rgba(255,255,255,.10); background: linear-gradient(145deg, rgba(20,160,253,.18), rgba(80,120,147,.22)); box-shadow: 0 18px 40px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.08); }
          .card-inner { border-color: rgba(255,255,255,.08); background: rgba(20,31,42,.82); box-shadow: 0 12px 30px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.06); }
          .card-site { color: #edf7ff; }
          .card-title { color: #c9dce9; }
          .card-footer { color: #9bb5c8; }
        }
        @media (max-width: 860px) {
          .panel { --home-card-width: min(360px, calc((96vw - 12px) / 2)); }
        }
        @media (max-width: 640px) {
          .panel { --home-card-width: 100%; padding: 18px; }
          .change { grid-template-columns: minmax(0,1fr); }
          .arrow { transform: rotate(90deg); }
          .actions { justify-content: stretch; }
          .x-lumno-action-button { flex: 1 1 0; }
        }
        @media (max-height: 620px) {
          .panel { padding-block: 16px; }
          .preview-title { margin-bottom: 12px; }
          .card-stage { margin-top: 12px; }
          .actions { margin-top: 14px; }
        }
        @keyframes card-complete { 0% { opacity: .7; transform: translateY(8px) scale(.97); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes viewport-breathe {
          0% { opacity: 0; transform: scale(1.008); filter: blur(2px); }
          42% { opacity: .95; transform: scale(1); filter: blur(0); }
          100% { opacity: 0; transform: scale(.996); filter: blur(1px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .feedback[data-show="true"] .glow { animation-duration: 180ms; }
          .preview, .panel, .record, .card-content, .home-card, .actions { transition-duration: 1ms !important; animation-duration: 1ms !important; }
        }
      `;
      surface = documentObj.createElement('div');
      surface.className = 'feedback';
      surface.setAttribute('role', 'status');
      surface.setAttribute('aria-live', 'polite');
      const glow = documentObj.createElement('div');
      glow.className = 'glow';
      glow.setAttribute('aria-hidden', 'true');
      messageElement = documentObj.createElement('span');
      messageElement.className = 'message';
      surface.append(glow, messageElement);
      preview = documentObj.createElement('div');
      preview.className = 'preview';
      preview.hidden = true;
      preview.innerHTML = `
        <section class="panel" role="dialog" aria-modal="true" aria-labelledby="preview-title" tabindex="-1">
          <h2 class="preview-title" id="preview-title"></h2>
          <div class="change">
            <div class="record record--old"><div class="record-label old-label"></div><div class="record-title old-title"></div><div class="record-url old-url"></div></div>
            <div class="arrow" aria-hidden="true">→</div>
            <div class="record record--new"><div class="record-label new-label"></div><div class="record-title new-title"></div><div class="record-url new-url"></div></div>
          </div>
          <div class="card-stage" aria-hidden="true">
            <div class="home-card">
              <div class="card-inner"><div class="card-content"><div class="card-header"><span class="card-icon"></span><span class="card-site"></span></div><div class="card-title"></div></div></div>
              <div class="card-footer"><span class="card-url"></span><span class="card-status"></span></div>
            </div>
          </div>
          <div class="actions"><button class="x-lumno-action-button x-lumno-action-button--secondary cancel" type="button"></button><button class="x-lumno-action-button x-lumno-action-button--primary confirm" type="button"></button></div>
        </section>`;
      preview.querySelector('.preview-title').textContent = getUiMessage('recent_update_preview_title', 'Confirm tracking update');
      previewPanel = preview.querySelector('.panel');
      preview.querySelector('.old-label').textContent = getUiMessage('recent_update_preview_original', 'Current tracked card');
      preview.querySelector('.new-label').textContent = getUiMessage('recent_update_preview_new', 'Replace with this page');
      previewCancel = preview.querySelector('.cancel');
      previewConfirm = preview.querySelector('.confirm');
      previewCancel.textContent = getUiMessage('recent_update_preview_cancel', 'Cancel');
      previewConfirm.textContent = getUiMessage('recent_update_preview_confirm', 'Update card');
      previewOldTitle = preview.querySelector('.old-title');
      previewOldUrl = preview.querySelector('.old-url');
      previewNewTitle = preview.querySelector('.new-title');
      previewNewUrl = preview.querySelector('.new-url');
      previewCardSite = preview.querySelector('.card-site');
      previewCardTitle = preview.querySelector('.card-title');
      previewCardUrl = preview.querySelector('.card-url');
      previewCardIcon = preview.querySelector('.card-icon');
      preview.querySelector('.card-status').textContent = getUiMessage('recent_track_add', 'Track link');
      previewCancel.addEventListener('click', () => startPreviewExit(false));
      previewConfirm.addEventListener('click', commitPreview);
      preview.addEventListener('click', (event) => {
        if (event.target === preview) startPreviewExit(false);
      });
      shadow.append(style, surface, preview);
      return true;
    }

    function clearPreviewTimers() {
      previewTimers.forEach((timer) => windowObj.clearTimeout(timer));
      previewTimers = [];
    }

    function schedulePreview(callback, delay) {
      if (delay <= 0) {
        callback();
        return;
      }
      previewTimers.push(windowObj.setTimeout(callback, delay));
    }

    function finishPreview(confirmed) {
      if (!previewResolve) return;
      clearPreviewTimers();
      const resolve = previewResolve;
      previewResolve = null;
      if (preview) preview.hidden = true;
      documentObj.removeEventListener('keydown', handlePreviewKeydown, true);
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
      previousFocus = null;
      resolve(Boolean(confirmed));
    }

    function startPreviewExit(confirmed) {
      if (!previewResolve || preview.dataset.state === 'leaving') return;
      preview.dataset.state = 'leaving';
      schedulePreview(() => finishPreview(confirmed), previewTimings.exit);
    }

    function commitPreview() {
      if (!previewResolve || preview.dataset.phase !== 'compare') return;
      preview.dataset.phase = 'committing';
      previewConfirm.disabled = true;
      if (previewPanel) previewPanel.focus();
      schedulePreview(() => {
        preview.dataset.phase = 'complete';
        schedulePreview(() => startPreviewExit(true), previewTimings.hold);
      }, previewTimings.commit);
    }

    function handlePreviewKeydown(event) {
      const handledKey = event && (event.key === 'Escape' || event.key === 'Tab');
      if (handledKey && preview && preview.dataset.phase !== 'compare') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        startPreviewExit(false);
        return;
      }
      if (!event || event.key !== 'Tab' || !previewCancel || !previewConfirm) return;
      const focusable = [previewCancel, previewConfirm].filter((button) => !button.disabled);
      if (focusable.length === 0) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
      const shadow = preview && preview.getRootNode ? preview.getRootNode() : null;
      const activeElement = shadow && shadow.activeElement;
      const activeIndex = focusable.indexOf(activeElement);
      const movingBeforeStart = event.shiftKey && activeIndex <= 0;
      const movingAfterEnd = !event.shiftKey && activeIndex === focusable.length - 1;
      if (activeIndex < 0 || movingBeforeStart || movingAfterEnd) {
        event.preventDefault();
        const target = event.shiftKey ? focusable[focusable.length - 1] : focusable[0];
        target.focus();
      }
    }

    function showPreview(payload) {
      if (!ensureSurface()) return Promise.resolve(false);
      if (previewResolve) finishPreview(false);
      previousFocus = documentObj.activeElement;
      const previous = payload && payload.previous || {};
      const current = payload && payload.current || {};
      let currentHost = '';
      try {
        currentHost = new URL(String(current.url || '')).hostname.replace(/^www\./i, '');
      } catch (error) {
        currentHost = '';
      }
      previewOldTitle.textContent = String(previous.title || previous.url || '');
      previewOldUrl.textContent = String(previous.url || '');
      previewNewTitle.textContent = String(current.title || current.url || '');
      previewNewUrl.textContent = String(current.url || '');
      previewCardSite.textContent = currentHost || String(current.title || '');
      previewCardTitle.textContent = String(current.title || current.url || '');
      previewCardUrl.textContent = String(current.url || '');
      previewCardIcon.textContent = String(currentHost || current.title || 'L').charAt(0).toUpperCase();
      preview.dataset.phase = 'compare';
      preview.dataset.state = 'entering';
      previewConfirm.disabled = false;
      preview.hidden = false;
      void preview.offsetWidth;
      schedulePreview(() => {
        if (preview && !preview.hidden) preview.dataset.state = 'active';
      }, previewTimings.enter);
      documentObj.addEventListener('keydown', handlePreviewKeydown, true);
      windowObj.setTimeout(() => previewConfirm && previewConfirm.focus(), 0);
      return new Promise((resolve) => {
        previewResolve = resolve;
      });
    }

    function show(result) {
      if (!ensureSurface()) return false;
      const ok = Boolean(result && result.ok);
      const reason = String(result && result.reason || 'save-failed');
      if (hideTimer) windowObj.clearTimeout(hideTimer);
      surface.dataset.kind = ok ? 'success' : 'error';
      surface.dataset.show = 'false';
      messageElement.textContent = getMessage(reason);
      void surface.offsetWidth;
      surface.dataset.show = 'true';
      hideTimer = windowObj.setTimeout(() => {
        hideTimer = 0;
        if (surface) surface.dataset.show = 'false';
      }, 1100);
      return true;
    }

    function attach() {
      const messages = chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage;
      if (!messages || typeof messages.addListener !== 'function') return false;
      messages.addListener((message, _sender, sendResponse) => {
        if (!message) return;
        if (message.action === ACTION) {
          show(message);
          return;
        }
        if (message.action === PREVIEW_ACTION) {
          showPreview(message).then((confirmed) => sendResponse({ confirmed }));
          return true;
        }
      });
      return true;
    }

    return Object.freeze({ attach, show, showPreview });
  }

  return Object.freeze({ ACTION, PREVIEW_ACTION, HOST_ID, createFeedbackController, attach: (options) => {
    const controller = createFeedbackController(options);
    controller.attach();
    return controller;
  } });
});
