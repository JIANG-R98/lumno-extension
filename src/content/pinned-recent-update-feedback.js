(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LumnoPinnedRecentUpdateFeedback = api;
  if (root.document && root.chrome && !root.LumnoDisablePinnedRecentUpdateAutoAttach) {
    api.attach({ windowObj: root, chromeApi: root.chrome });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ACTION = 'showPinnedRecentUpdateFeedback';
  const PREVIEW_ACTION = 'showPinnedRecentUpdatePreview';
  const UNDO_ACTION = 'undoPinnedRecentTrackingUpdate';
  const HOST_ID = '_x_extension_pinned_recent_update_feedback_2026_unique_';
  const FALLBACK_MESSAGES = Object.freeze({
    updated: 'Tracked card link updated',
    undone: 'Last tracking update undone',
    added: 'Page pinned and tracking enabled',
    'tracking-enabled': 'Tracking enabled for this pinned page',
    'already-tracked': 'This page is already pinned and tracked',
    'pin-limit': 'Remove a pinned card before adding another',
    'same-url': 'This page is already the tracked card link',
    'source-not-found': 'The original tracked card no longer exists',
    'url-conflict': 'Another pinned card already uses this link',
    'no-tracked-target': 'No tracked card can be updated from this page',
    'save-failed': 'Could not update the tracked card'
  });
  const MESSAGE_KEYS = Object.freeze({
    updated: 'recent_update_feedback_success',
    undone: 'recent_undo_tracking_update_success',
    added: 'recent_add_tracking_feedback_success',
    'tracking-enabled': 'recent_enable_tracking_feedback_success',
    'already-tracked': 'recent_add_tracking_feedback_already_tracked',
    'pin-limit': 'recent_add_tracking_feedback_limit',
    'same-url': 'recent_update_feedback_same_url',
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
    const embedded = config.embedded === true;
    const mountTarget = config.mountTarget || (documentObj && documentObj.documentElement);
    const manualPlayback = config.manualPlayback === true;
    const visualVariant = config.visualVariant === 'homepage-card' ? 'homepage-card' : 'default';
    const confirmBeforeSwap = config.confirmBeforeSwap === true;
    const directUndo = config.directUndo === true;
    const fadeAfterUndo = config.fadeAfterUndo === true;
    const undoFadeDelay = Math.max(0, Number(config.undoFadeDelay) || 560);
    const baseTimings = {
      breathe: Math.max(0, Number(config.previewTimings && config.previewTimings.breathe) || 1050),
      enter: Math.max(0, Number(config.previewTimings && config.previewTimings.enter) || 240),
      swap: Math.max(0, Number(config.previewTimings && config.previewTimings.commit) || 560),
      exit: Math.max(0, Number(config.previewTimings && config.previewTimings.exit) || 220)
    };
    if (config.previewTimings && config.previewTimings.instant === true) {
      baseTimings.breathe = 0;
      baseTimings.enter = 0;
      baseTimings.swap = 0;
      baseTimings.exit = 0;
    }
    const timings = { ...baseTimings };
    let host;
    let surface;
    let title;
    let oldTitle;
    let oldUrl;
    let newTitle;
    let newUrl;
    let cardSite;
    let cardTitle;
    let cardUrl;
    let cardIcon;
    let secondary;
    let primary;
    let pendingReady;
    let activeChange = null;
    let flowRevision = 0;
    let previousFocus = null;
    let timerIds = [];

    function ui(key, fallback) {
      const value = chromeApi && chromeApi.i18n && chromeApi.i18n.getMessage
        ? chromeApi.i18n.getMessage(key)
        : '';
      return String(value || fallback);
    }

    function reasonMessage(reason) {
      return ui(MESSAGE_KEYS[reason] || MESSAGE_KEYS['save-failed'],
        FALLBACK_MESSAGES[reason] || FALLBACK_MESSAGES['save-failed']);
    }

    function clearTimers() {
      timerIds.forEach((id) => windowObj.clearTimeout(id));
      timerIds = [];
    }

    function later(callback, delay) {
      if (delay <= 0) callback();
      else timerIds.push(windowObj.setTimeout(callback, delay));
    }

    function syncTimingStyles() {
      if (!host || !host.style) return;
      host.style.setProperty('--lumno-flow-breathe', `${timings.breathe}ms`);
      host.style.setProperty('--lumno-flow-enter', `${timings.enter}ms`);
      host.style.setProperty('--lumno-flow-swap', `${timings.swap}ms`);
      host.style.setProperty('--lumno-flow-exit', `${timings.exit}ms`);
      host.style.setProperty('--lumno-flow-undo-fade', `${undoFadeDelay}ms`);
    }

    function setPlaybackRate(value) {
      const rate = Math.min(4, Math.max(.1, Number(value) || 1));
      Object.keys(baseTimings).forEach((key) => {
        timings[key] = Math.round(baseTimings[key] / rate);
      });
      syncTimingStyles();
      return rate;
    }

    function ensureSurface() {
      if (surface && surface.isConnected) return true;
      if (!documentObj || !documentObj.documentElement || !mountTarget) return false;
      host = documentObj.getElementById(HOST_ID) || documentObj.createElement('div');
      host.id = HOST_ID;
      if (!host.isConnected) mountTarget.appendChild(host);
      syncTimingStyles();
      const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
      shadow.textContent = '';
      const style = documentObj.createElement('style');
      style.textContent = `
        :host { all: initial; position: ${embedded ? 'absolute' : 'fixed'}; inset: 0; z-index: ${embedded ? '2' : '2147483647'}; pointer-events: none; }
        .surface { position: absolute; inset: 0; display: grid; place-items: center; padding: 12px; box-sizing: border-box; pointer-events: auto; background: rgba(15,23,42,.18); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); font-family: "Open Sans","PingFang SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; opacity: 1; transition: opacity 220ms ease, background 220ms ease; }
        .surface[hidden] { display: none; }
        .surface[data-state="entering"], .surface[data-state="leaving"] { opacity: 0; background: transparent; transition-duration: var(--lumno-flow-exit,220ms); }
        .glow { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: linear-gradient(to bottom,rgba(20,160,253,.46),transparent 128px),linear-gradient(to top,rgba(20,160,253,.42),transparent 128px),linear-gradient(to right,rgba(20,160,253,.42),transparent 128px),linear-gradient(to left,rgba(20,160,253,.42),transparent 128px); box-shadow: inset 0 0 34px rgba(20,160,253,.42),inset 0 0 112px rgba(133,205,254,.22); }
        .surface[data-phase="breathing"] .glow { animation: viewport-breathe var(--lumno-flow-breathe,1050ms) cubic-bezier(.22,.61,.36,1) both; }
        .surface[data-phase="breathing"] .panel { opacity: 0; transform: translateY(20px) scale(.96); }
        .surface[data-phase="card-enter"] .panel { animation: panel-enter var(--lumno-flow-enter,240ms) cubic-bezier(.22,1,.36,1) both; }
        .surface[data-phase="transient"] { pointer-events: none; background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; }
        .surface[data-phase="transient"] .panel { display: none; }
        .surface[data-phase="transient"] .glow { animation: viewport-breathe var(--lumno-flow-breathe,1050ms) cubic-bezier(.22,.61,.36,1) both; }
        .panel { --home-card-width: min(251px, calc((min(96vw, 1040px) - 36px) / 4)); position: relative; width: min(720px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 24px; box-sizing: border-box; border-radius: 30px; overflow-x: hidden; overflow-y: auto; color: #172033; background: radial-gradient(120% 160% at 12% -24%,rgba(255,255,255,.78),rgba(255,255,255,.44) 38%,rgba(241,245,249,.26)),linear-gradient(135deg,rgba(255,255,255,.48),rgba(226,232,240,.28)); box-shadow: 0 26px 82px rgba(15,23,42,.22),0 5px 18px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.86),inset 0 0 0 1px rgba(255,255,255,.30); backdrop-filter: blur(56px) saturate(210%); -webkit-backdrop-filter: blur(56px) saturate(210%); transform: translateY(0) scale(1); transition: opacity 220ms ease,transform 420ms cubic-bezier(.22,1,.36,1); }
        .surface[data-state="entering"] .panel { opacity: 0; transform: translateY(20px) scale(.96); }
        .surface[data-state="leaving"] .panel { opacity: 0; transform: translateY(-12px) scale(.98); }
        h2 { margin: 0 0 18px; text-align: center; font-size: 16px; line-height: 1.4; font-weight: 650; }
        .change { display: grid; grid-template-columns: minmax(0,1fr) 34px minmax(0,1fr); align-items: stretch; gap: 8px; }
        .record { min-width: 0; padding: 13px 14px; border-radius: 18px; background: rgba(255,255,255,.42); box-shadow: inset 0 1px 0 rgba(255,255,255,.72),inset 0 0 0 1px rgba(15,23,42,.06); transition: opacity var(--lumno-flow-swap,560ms) ease,transform var(--lumno-flow-swap,560ms) cubic-bezier(.22,1,.36,1),filter var(--lumno-flow-swap,560ms) ease; }
        .record--new { position: relative; z-index: 2; background: linear-gradient(135deg,rgba(37,99,235,.12),rgba(255,255,255,.46)); }
        .record-label { margin-bottom: 5px; color: #547086; font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; }
        .record-title,.record-url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .record-title { color: #142535; font-size: 14px; line-height: 1.45; font-weight: 600; }
        .record-url { margin-top: 3px; color: #668095; font-size: 12px; }
        .arrow { align-self: center; justify-self: center; color: #14a0fd; font-size: 18px; transition: opacity 180ms ease,transform 260ms ease; }
        .card-stage { margin: 18px auto 0; width: min(var(--home-card-width), 100%); perspective: 900px; }
        .home-card { padding: 7px 7px 12px; border: 1px solid rgba(0,0,0,.10); border-radius: 28px; background: linear-gradient(145deg,rgba(37,99,235,.12),rgba(148,163,184,.20)); box-shadow: 0 12px 30px rgba(15,23,42,.14),inset 0 1px 0 rgba(255,255,255,.62); transform: scale(.965); transition: transform 420ms cubic-bezier(.22,1,.36,1),box-shadow 420ms ease; }
        .card-inner { height: 104px; padding: 13px 13px 14px 15px; box-sizing: border-box; border-radius: 20px; background: rgba(255,255,255,.78); overflow: hidden; }
        .card-content { opacity: 0; transform: translateY(18px) scale(.98); filter: blur(4px); transition: opacity 300ms ease,transform 480ms cubic-bezier(.22,1,.36,1),filter 300ms ease; }
        .card-header { display: grid; grid-template-columns: 25px minmax(0,1fr); align-items: center; gap: 7px; }
        .card-icon { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 6px; background: linear-gradient(135deg,#14a0fd,#85cdfe); color: #063755; font-size: 12px; font-weight: 750; }
        .card-site,.card-title,.card-url { overflow: hidden; text-overflow: ellipsis; }
        .card-site { color: #19364b; font-size: 14px; white-space: nowrap; }
        .card-title { margin: 5px 0 0 32px; color: #29485f; font-size: 12px; line-height: 16px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
        .card-footer { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 10px 5px 0 10px; color: #55758c; font-size: 13px; }
        .card-url { flex: 1; white-space: nowrap; }
        .card-status { color: #14a0fd; font-size: 12px; font-weight: 650; }
        .surface[data-phase="old-out"] .record--old,.surface[data-phase="new-in"] .record--old,.surface[data-phase="saving"] .record--old { opacity: 0; transform: translateX(-80px) rotate(-4deg) scale(.9); filter: blur(4px); }
        .surface[data-phase="old-out"] .record--new { opacity: 0; transform: translateX(54px) scale(.92); }
        .surface[data-phase="new-in"] .record--new { transform: translate(-48%,112px) scale(.78); opacity: 1; }
        .surface[data-phase="saving"] .record--new { transform: translate(-48%,112px) scale(.78); opacity: 0; }
        .surface[data-phase="old-out"] .arrow,.surface[data-phase="new-in"] .arrow,.surface[data-phase="saving"] .arrow { opacity: 0; transform: scale(.7); }
        .surface[data-phase="saving"] .card-content,.surface[data-phase="success"] .card-content,.surface[data-phase="undo-confirm"] .card-content,.surface[data-phase="undone"] .card-content { opacity: 1; transform: translateY(0) scale(1); filter: none; }
        .surface[data-phase="success"] .change,.surface[data-phase="undone"] .change { display: none; }
        .surface[data-phase="success"] .home-card,.surface[data-phase="undone"] .home-card { transform: rotate(-1deg) scale(1.025); box-shadow: 0 24px 58px rgba(20,103,158,.24),inset 0 1px 0 rgba(255,255,255,.7); animation: card-complete 420ms cubic-bezier(.22,1,.36,1) both; }
        .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; opacity: 1; transition: opacity 180ms ease,transform 180ms ease; }
        .surface[data-phase="breathing"] .actions,.surface[data-phase="card-enter"] .actions,.surface[data-phase="old-out"] .actions,.surface[data-phase="new-in"] .actions,.surface[data-phase="saving"] .actions { opacity: 0; transform: translateY(8px); pointer-events: none; }
        .x-lumno-action-button { all: unset; min-width: 84px; min-height: 36px; padding: 0 16px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; font: 600 13px/1 "Open Sans","PingFang SC",sans-serif; cursor: pointer; transition: transform 120ms ease,filter 120ms ease; }
        .x-lumno-action-button:active { transform: translateY(1px) scale(.98); }
        .x-lumno-action-button:focus-visible { outline: 2px solid rgba(75,84,95,.35); outline-offset: 2px; }
        .x-lumno-action-button:disabled { opacity: .6; cursor: wait; }
        .x-lumno-action-button--primary { border: 1px solid #040404; background: linear-gradient(180deg,#404859,#273042); color: #fff; box-shadow: inset 0 1px 1.6px rgba(255,255,255,.34),0 2px 2px rgba(0,0,0,.065); }
        .x-lumno-action-button--secondary { border: 1px solid rgba(15,23,42,.06); background: #fff; color: #1f2937; box-shadow: 0 2px 2px rgba(15,23,42,.025),0 1px 1px rgba(15,23,42,.035); }
        .x-lumno-action-button--warning { border-color:#c86b12; background:linear-gradient(180deg,#f2a94b,#dc7b1f); color:#351801; box-shadow:inset 0 1px 1.6px rgba(255,255,255,.4),0 2px 6px rgba(180,83,9,.18); }
        .surface[data-visual-variant="homepage-card"] { background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; pointer-events:none; }
        .surface[data-visual-variant="homepage-card"] .panel { pointer-events:auto; }
        .surface[data-visual-variant="homepage-card"] .glow { inset:calc(50% - 154px) calc(50% - 154px); border-radius:42px; background:radial-gradient(circle,rgba(20,160,253,.3),transparent 68%); box-shadow:none; }
        .surface[data-visual-variant="homepage-card"] .panel { --home-card-width: 248px; width:248px; max-height:none; padding:0; overflow:visible; border-radius:28px; background:transparent; box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none; }
        .surface[data-visual-variant="homepage-card"] h2 { margin:0 0 10px; color:#25384a; font-size:13px; text-shadow:0 1px 0 rgba(255,255,255,.7); }
        .surface[data-visual-variant="homepage-card"] .change { position:relative; z-index:3; display:block; width:234px; margin:0 auto -4px; }
        .surface[data-visual-variant="homepage-card"] .record--old,
        .surface[data-visual-variant="homepage-card"] .arrow { display:none; }
        .surface[data-visual-variant="homepage-card"] .record--new { width:100%; min-height:104px; padding:13px 13px 14px 15px; border:1px solid rgba(0,0,0,.1); border-radius:20px; box-sizing:border-box; background:#fff; box-shadow:0 58px 16px rgba(199,199,199,0),0 37px 15px rgba(199,199,199,.01),0 21px 12px rgba(199,199,199,.05),0 9px 9px rgba(199,199,199,.09),0 2px 5px rgba(199,199,199,.1); transform-origin:center bottom; }
        .surface[data-visual-variant="homepage-card"] .record-label { color:#68788a; }
        .surface[data-visual-variant="homepage-card"] .card-stage { width:var(--home-card-width); margin:0; }
        .surface[data-visual-variant="homepage-card"] .home-card { padding:7px 7px 12px; border-radius:28px; background:#dcebfe; border-color:rgba(255,255,255,.1); box-shadow:0 52px 15px rgba(199,199,199,0),0 33px 13px rgba(199,199,199,.01),0 19px 11px rgba(199,199,199,.05),0 8px 8px rgba(199,199,199,.09),0 2px 5px rgba(199,199,199,.1); transform:none; transition:transform 220ms cubic-bezier(.2,.8,.2,1),box-shadow 220ms ease; }
        .surface[data-visual-variant="homepage-card"] .card-inner { position:relative; width:100%; height:104px; border:1px solid rgba(0,0,0,.1); background:#fff; box-shadow:0 58px 16px rgba(199,199,199,0),0 37px 15px rgba(199,199,199,.01),0 21px 12px rgba(199,199,199,.05),0 9px 9px rgba(199,199,199,.09),0 2px 5px rgba(199,199,199,.1); transition:height 220ms ease,transform 220ms ease,margin-bottom 220ms ease,opacity 180ms ease; }
        .surface[data-visual-variant="homepage-card"] .card-content { opacity:1; transform:none; filter:none; }
        .surface[data-visual-variant="homepage-card"] .card-footer { width:100%; margin:10px 0 0; }
        .surface[data-visual-variant="homepage-card"][data-phase="ready"] .card-inner { height:124px; transform:translateY(-20px); margin-bottom:-20px; }
        .surface[data-visual-variant="homepage-card"][data-phase="old-out"] .card-inner { height:124px; margin-bottom:-20px; opacity:0; transform:translate(-72px,-20px) rotate(-4deg); }
        .surface[data-visual-variant="homepage-card"][data-phase="old-out"] .record--new { opacity:1; transform:translateY(-8px); }
        .surface[data-visual-variant="homepage-card"][data-phase="new-in"] .record--new { opacity:0; transform:translateY(116px) scale(.98); }
        .surface[data-visual-variant="homepage-card"][data-phase="new-in"] .card-inner,
        .surface[data-visual-variant="homepage-card"][data-phase="saving"] .card-inner { opacity:1; height:124px; transform:translateY(-20px); margin-bottom:-20px; }
        .surface[data-visual-variant="homepage-card"][data-phase="success"] .change,
        .surface[data-visual-variant="homepage-card"][data-phase="undone"] .change { display:none; }
        .surface[data-visual-variant="homepage-card"][data-phase="success"] .home-card { transform:none; box-shadow:0 70px 19px rgba(199,199,199,0),0 44px 18px rgba(199,199,199,.02),0 25px 15px rgba(199,199,199,.08),0 11px 11px rgba(199,199,199,.13),0 3px 6px rgba(199,199,199,.15); }
        .surface[data-visual-variant="homepage-card"][data-phase="undone"] .panel { animation:restored-fade var(--lumno-flow-undo-fade,560ms) ease both; }
        @keyframes viewport-breathe { 0%{opacity:0;transform:scale(1.008)} 42%{opacity:.95;transform:scale(1)} 100%{opacity:0;transform:scale(.996)} }
        @keyframes panel-enter { from{opacity:0;transform:translateY(20px) scale(.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes card-complete { from{opacity:.7;transform:translateY(8px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes restored-fade { 0%,55%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-8px)} }
        @media (max-width:860px) { .panel { --home-card-width:min(360px,calc((96vw - 12px) / 2)); } }
        @media (max-width:640px) { .panel { --home-card-width:100%;padding:18px; } .change { grid-template-columns:minmax(0,1fr); } .arrow { transform:rotate(90deg); } .actions { justify-content:stretch; } .x-lumno-action-button { flex:1; } }
        @media (prefers-color-scheme:dark) { .panel { color:#edf7ff;background:linear-gradient(135deg,rgba(30,41,59,.86),rgba(15,23,42,.82)); } .record{background:rgba(133,205,254,.07)} .record-title,.card-site{color:#edf7ff}.record-label,.record-url,.card-title,.card-footer{color:#9bb5c8}.card-inner{background:rgba(20,31,42,.82)}.x-lumno-action-button--secondary{background:#1e293b;color:#f8fafc;border-color:rgba(148,163,184,.18)} }
        @media (prefers-reduced-motion:reduce) { .glow,.panel,.record,.card-content,.home-card,.actions { animation-duration:1ms!important;transition-duration:1ms!important; } }
        ${embedded ? '.panel { width:min(720px,calc(100% - 24px));max-height:calc(100% - 24px); }' : ''}
      `;
      surface = documentObj.createElement('div');
      surface.className = 'surface';
      surface.dataset.visualVariant = visualVariant;
      surface.hidden = true;
      surface.innerHTML = `<div class="glow" aria-hidden="true"></div><section class="panel" role="dialog" aria-modal="true" aria-labelledby="flow-title" tabindex="-1"><h2 id="flow-title"></h2><div class="change"><div class="record record--old"><div class="record-label old-label"></div><div class="record-title old-title"></div><div class="record-url old-url"></div></div><div class="arrow" aria-hidden="true">→</div><div class="record record--new"><div class="record-label new-label"></div><div class="record-title new-title"></div><div class="record-url new-url"></div></div></div><div class="card-stage" aria-hidden="true"><div class="home-card"><div class="card-inner"><div class="card-content"><div class="card-header"><span class="card-icon"></span><span class="card-site"></span></div><div class="card-title"></div></div></div><div class="card-footer"><span class="card-url"></span><span class="card-status"></span></div></div></div><div class="actions"><button class="x-lumno-action-button x-lumno-action-button--secondary secondary" type="button"></button><button class="x-lumno-action-button x-lumno-action-button--primary primary" type="button"></button></div></section>`;
      title = surface.querySelector('h2');
      oldTitle = surface.querySelector('.old-title'); oldUrl = surface.querySelector('.old-url');
      newTitle = surface.querySelector('.new-title'); newUrl = surface.querySelector('.new-url');
      cardSite = surface.querySelector('.card-site'); cardTitle = surface.querySelector('.card-title');
      cardUrl = surface.querySelector('.card-url'); cardIcon = surface.querySelector('.card-icon');
      secondary = surface.querySelector('.secondary'); primary = surface.querySelector('.primary');
      surface.querySelector('.old-label').textContent = ui('recent_update_preview_original','Current tracked card');
      surface.querySelector('.new-label').textContent = ui('recent_update_preview_new','Replace with');
      surface.querySelector('.card-status').textContent = ui('recent_mode_tracking','Linked');
      secondary.addEventListener('click', handleSecondary);
      primary.addEventListener('click', handlePrimary);
      documentObj.addEventListener('keydown', handleKeydown, true);
      shadow.append(style, surface);
      return true;
    }

    function fillCard(item) {
      const value = item || {};
      let hostname = '';
      try { hostname = new URL(String(value.url || '')).hostname.replace(/^www\./i, ''); } catch (_error) {}
      cardSite.textContent = hostname || String(value.title || '');
      cardTitle.textContent = String(value.title || value.url || ''); cardUrl.textContent = String(value.url || '');
      cardIcon.textContent = String(hostname || value.title || 'L').charAt(0).toUpperCase();
    }

    function fill(previous, current) {
      const before = previous || {};
      const after = current || {};
      oldTitle.textContent = String(before.title || before.url || ''); oldUrl.textContent = String(before.url || '');
      newTitle.textContent = String(after.title || after.url || ''); newUrl.textContent = String(after.url || '');
      fillCard(visualVariant === 'homepage-card' ? before : after);
    }

    function setButtons(secondaryText, primaryText, primaryVisible) {
      secondary.textContent = secondaryText;
      primary.textContent = primaryText || '';
      primary.hidden = primaryVisible === false;
      primary.classList.toggle('x-lumno-action-button--warning', directUndo && surface.dataset.phase === 'success');
    }

    function close() {
      if (!surface || surface.hidden) return;
      flowRevision += 1;
      clearTimers();
      if (pendingReady) {
        const resolveReady = pendingReady;
        pendingReady = null;
        resolveReady(false);
      }
      surface.dataset.state = 'leaving';
      later(() => {
        surface.hidden = true;
        activeChange = null;
        if (previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus();
        previousFocus = null;
      }, timings.exit);
    }

    function handleSecondary() {
      if (surface.dataset.phase === 'ready') {
        close();
        return;
      }
      if (surface.dataset.phase === 'undo-confirm') {
        surface.dataset.phase = 'success';
        title.textContent = reasonMessage('updated');
        fill(activeChange.previous, activeChange.current);
        setButtons(ui('recent_update_close','Close'),ui('recent_undo_tracking_update','Undo'),true);
        primary.focus();
        return;
      }
      close();
    }

    function requestUndo() {
      if (!activeChange || !chromeApi || !chromeApi.runtime || !chromeApi.runtime.sendMessage) return;
      const requestRevision = flowRevision;
      surface.dataset.phase = 'saving';
      secondary.disabled = true; primary.disabled = true;
      chromeApi.runtime.sendMessage({
        action: UNDO_ACTION,
        cardId: activeChange.cardId,
        expectedUrl: activeChange.current && activeChange.current.url
      }, (result) => {
        if (requestRevision !== flowRevision) return;
        secondary.disabled = false; primary.disabled = false;
        if (chromeApi.runtime.lastError || !result || result.ok !== true) {
          surface.dataset.phase = 'error';
          title.textContent = reasonMessage(result && result.reason || 'save-failed');
          setButtons(ui('recent_update_close','Close'),'',false);
          secondary.focus();
          return;
        }
        activeChange = { ...activeChange, previous: result.previous, current: result.current };
        fill(result.previous, result.current);
        fillCard(result.current);
        surface.dataset.phase = 'undone';
        title.textContent = reasonMessage('undone');
        setButtons(ui('recent_update_close','Close'),'',false);
        if (fadeAfterUndo) later(close, undoFadeDelay);
        else secondary.focus();
      });
    }

    function handlePrimary() {
      if (!activeChange) return;
      if (surface.dataset.phase === 'ready') {
        setButtons('', '', false);
        surface.dataset.phase = 'old-out';
        later(() => {
          fillCard(activeChange.current);
          surface.dataset.phase = 'new-in';
          later(() => {
            surface.dataset.phase = 'saving';
            resolvePreviewReady(true);
          }, timings.swap);
        }, Math.round(timings.swap * .45));
        return;
      }
      if (surface.dataset.phase === 'success') {
        if (directUndo) {
          requestUndo();
          return;
        }
        fill(activeChange.current, activeChange.previous);
        title.textContent = ui('recent_undo_tracking_update_confirm_title','Undo this tracking update?');
        surface.dataset.phase = 'undo-confirm';
        setButtons(ui('recent_update_preview_cancel','Cancel'),ui('recent_undo_tracking_update_confirm','Confirm undo'),true);
        return;
      }
      if (surface.dataset.phase === 'undo-confirm') requestUndo();
    }

    function handleKeydown(event) {
      if (!surface || surface.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); handleSecondary(); return; }
      if (event.key !== 'Tab') return;
      const buttons = [secondary, primary].filter((button) => button && !button.hidden && !button.disabled);
      if (!buttons.length) { event.preventDefault(); return; }
      const root = surface.getRootNode();
      const index = buttons.indexOf(root.activeElement);
      if (index < 0 || (!event.shiftKey && index === buttons.length - 1) || (event.shiftKey && index === 0)) {
        event.preventDefault();
        buttons[event.shiftKey ? buttons.length - 1 : 0].focus();
      }
    }

    function resolvePreviewReady(value) {
      const done = pendingReady;
      pendingReady = null;
      if (done) done(Boolean(value));
    }

    function getPhase() {
      return surface && !surface.hidden ? String(surface.dataset.phase || '') : '';
    }

    function advancePreview() {
      if (!surface || surface.hidden || !activeChange) return '';
      clearTimers();
      const phase = getPhase();
      if (phase === 'breathing') surface.dataset.phase = 'card-enter';
      else if (phase === 'card-enter' && confirmBeforeSwap) {
        surface.dataset.phase = 'ready';
        title.textContent = ui('recent_update_preview_title','Update linked card?');
        setButtons(ui('recent_update_preview_cancel','Cancel'),ui('recent_update_preview_confirm','Update'),true);
      }
      else if (phase === 'card-enter') surface.dataset.phase = 'old-out';
      else if (phase === 'ready') {
        setButtons('', '', false);
        surface.dataset.phase = 'old-out';
      }
      else if (phase === 'old-out') {
        fillCard(activeChange.current);
        surface.dataset.phase = 'new-in';
      }
      else if (phase === 'new-in') {
        surface.dataset.phase = 'saving';
        resolvePreviewReady(true);
      } else if (phase === 'saving') {
        show({
          action: ACTION,
          ok: true,
          reason: 'updated',
          cardId: activeChange.cardId,
          previous: activeChange.previous,
          current: activeChange.current
        });
      } else if (phase === 'success') handlePrimary();
      else if (phase === 'undo-confirm') requestUndo();
      return getPhase();
    }

    function showPreview(payload, playbackOptions) {
      if (!ensureSurface()) return Promise.resolve(false);
      flowRevision += 1;
      clearTimers();
      if (pendingReady) pendingReady(false);
      previousFocus = documentObj.activeElement;
      activeChange = { previous: payload.previous || {}, current: payload.current || {}, cardId: String(payload.cardId || '') };
      fill(activeChange.previous, activeChange.current);
      title.textContent = ui('recent_update_progress_title','Updating tracked card');
      setButtons('', '', false);
      surface.hidden = false;
      surface.dataset.state = 'active';
      surface.dataset.phase = 'breathing';
      void surface.offsetWidth;
      return new Promise((resolve) => {
        pendingReady = resolve;
        const useManualPlayback = playbackOptions && typeof playbackOptions.manual === 'boolean'
          ? playbackOptions.manual
          : manualPlayback;
        if (useManualPlayback) return;
        later(() => {
          surface.dataset.phase = 'card-enter';
          later(() => {
            if (confirmBeforeSwap) {
              surface.dataset.phase = 'ready';
              title.textContent = ui('recent_update_preview_title','Update linked card?');
              setButtons(ui('recent_update_preview_cancel','Cancel'),ui('recent_update_preview_confirm','Update'),true);
              return;
            }
            surface.dataset.phase = 'old-out';
            later(() => {
              fillCard(activeChange.current);
              surface.dataset.phase = 'new-in';
              later(() => {
                surface.dataset.phase = 'saving';
                resolvePreviewReady(true);
              }, timings.swap);
            }, Math.round(timings.swap * .45));
          }, timings.enter);
        }, timings.breathe);
      });
    }

    function show(result) {
      if (!ensureSurface()) return false;
      if (!result || result.reason !== 'updated' || !result.previous || !result.current) {
        if (!activeChange) {
          previousFocus = documentObj.activeElement;
          surface.hidden = false;
          surface.dataset.state = 'active';
          surface.dataset.phase = 'transient';
          title.textContent = reasonMessage(String(result && result.reason || 'save-failed'));
          clearTimers();
          later(close, 1100);
          return true;
        }
        surface.dataset.phase = result && result.ok ? 'success' : 'error';
        title.textContent = reasonMessage(String(result && result.reason || 'save-failed'));
        setButtons(ui('recent_update_close','Close'),'',false);
        secondary.focus();
        return true;
      }
      activeChange = {
        cardId: String(result.cardId || activeChange && activeChange.cardId || ''),
        previous: result.previous,
        current: result.current
      };
      fill(activeChange.previous, activeChange.current);
      fillCard(activeChange.current);
      surface.dataset.phase = 'success';
      title.textContent = reasonMessage('updated');
      setButtons(ui('recent_update_close','Close'),ui('recent_undo_tracking_update','Undo'),true);
      primary.focus();
      return true;
    }

    function attach() {
      const messages = chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage;
      if (!messages || !messages.addListener) return false;
      messages.addListener((message, _sender, sendResponse) => {
        if (!message) return;
        if (message.action === ACTION) { show(message); return; }
        if (message.action === PREVIEW_ACTION) {
          showPreview(message).then((ready) => sendResponse({ ready }));
          return true;
        }
      });
      return true;
    }

    return Object.freeze({
      attach,
      show,
      showPreview,
      close,
      advancePreview,
      getPhase,
      setPlaybackRate
    });
  }

  return Object.freeze({ ACTION, PREVIEW_ACTION, UNDO_ACTION, HOST_ID, createFeedbackController, attach(options) { const controller = createFeedbackController(options); controller.attach(); return controller; } });
});
