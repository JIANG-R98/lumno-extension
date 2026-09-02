(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoPinnedRecentTrackingStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const HOST_ID = '_x_extension_pinned_recent_tracking_status_2026_unique_';
  const FALLBACK_MESSAGES = Object.freeze({
    title: 'Tracking this tab',
    detail: 'Current page can update the pinned card',
    collapse: 'Collapse to the side',
    expand: 'Keep expanded'
  });

  function createTrackingStatusController(options) {
    const config = options && typeof options === 'object' ? options : {};
    const windowObj = config.windowObj || globalThis.window;
    const documentObj = config.documentObj || (windowObj && windowObj.document);
    const chromeApi = config.chromeApi || (windowObj && windowObj.chrome);
    let host = null;
    let badge = null;
    let toggle = null;

    function getMessage(key, fallback) {
      const localized = chromeApi && chromeApi.i18n &&
        typeof chromeApi.i18n.getMessage === 'function'
        ? chromeApi.i18n.getMessage(key)
        : '';
      return String(localized || fallback);
    }

    function getAssetUrl(path) {
      return chromeApi && chromeApi.runtime &&
        typeof chromeApi.runtime.getURL === 'function'
        ? String(chromeApi.runtime.getURL(path) || '')
        : '';
    }

    function updateToggleState(collapsed) {
      if (!badge || !toggle) return;
      badge.dataset.collapsed = collapsed ? 'true' : 'false';
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute(
        'aria-label',
        collapsed
          ? getMessage('recent_tracking_page_badge_expand', FALLBACK_MESSAGES.expand)
          : getMessage('recent_tracking_page_badge_collapse', FALLBACK_MESSAGES.collapse)
      );
    }

    function ensureSurface() {
      if (badge && badge.isConnected) return true;
      if (!documentObj || !documentObj.documentElement) return false;
      host = documentObj.getElementById(HOST_ID) || documentObj.createElement('div');
      host.id = HOST_ID;
      if (!host.isConnected) documentObj.documentElement.appendChild(host);
      const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
      shadow.textContent = '';
      const brandMarkUrl = getAssetUrl('assets/images/lumno-selection-mark.svg');
      const iconFontUrl = getAssetUrl('assets/remixicon/fonts/remixicon.woff2');
      const style = documentObj.createElement('style');
      style.textContent = `
        @font-face { font-family: "lumno-remixicon"; src: url("${iconFontUrl}") format("woff2"); font-style: normal; font-weight: 400; font-display: block; }
        :host { all: initial; position: fixed; top: 50%; right: 0; z-index: 2147483646; width: 0; height: 0; pointer-events: none; color-scheme: light dark; }
        .badge { --rail: #4389ff; position: absolute; top: 0; right: 0; display: flex; align-items: center; width: min(196px, calc(100vw - 16px)); height: 42px; box-sizing: border-box; padding: 5px 5px 5px 10px; border: 1px solid rgba(24,32,51,.10); border-right: 0; border-radius: 14px 0 0 14px; background: rgba(255,255,255,.91); box-shadow: 0 8px 28px rgba(24,32,51,.14), inset 0 1px 0 rgba(255,255,255,.76); color: #182033; font-family: "Open Sans","PingFang SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; transform: translateY(-50%) translateX(0); transform-origin: right center; transition: transform 220ms cubic-bezier(.22,1,.36,1), opacity 160ms ease, box-shadow 160ms ease; pointer-events: auto; backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); contain: layout style paint; }
        .badge[hidden] { display: none; }
        .badge::before { content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 4px; border-radius: 0 4px 4px 0; background: var(--rail); opacity: .82; }
        .badge[data-collapsed="true"] { opacity: .52; transform: translateY(-50%) translateX(calc(100% - 5px)); box-shadow: none; }
        .badge[data-collapsed="true"]:hover,
        .badge[data-collapsed="true"]:focus-within { opacity: 1; transform: translateY(-50%) translateX(0); box-shadow: 0 8px 28px rgba(24,32,51,.14), inset 0 1px 0 rgba(255,255,255,.76); }
        .symbols { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 3px; margin-right: 8px; color: var(--rail); }
        .brand-mark { display: block; width: 17px; height: 17px; background: currentColor; -webkit-mask: url("${brandMarkUrl}") center / contain no-repeat; mask: url("${brandMarkUrl}") center / contain no-repeat; }
        .tracking-mark { display: grid; place-items: center; width: 16px; height: 16px; font: 400 15px/1 "lumno-remixicon"; }
        .tracking-mark::before { content: "\\f04b"; }
        .copy { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
        .title, .detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .title { color: inherit; font-size: 12px; font-weight: 650; line-height: 1.25; letter-spacing: .005em; }
        .detail { color: #6b7280; font-size: 10px; font-weight: 500; line-height: 1.25; }
        .toggle { all: unset; flex: 0 0 auto; display: grid; place-items: center; width: 27px; height: 27px; border-radius: 9px; color: #778196; cursor: pointer; opacity: 0; transition: color 120ms ease, background-color 120ms ease, opacity 120ms ease; }
        .badge:hover .toggle, .toggle:focus-visible { opacity: 1; }
        .toggle:hover { color: #2f6fd6; background: rgba(67,137,255,.10); }
        .toggle:focus-visible { outline: 2px solid rgba(67,137,255,.54); outline-offset: 1px; }
        .toggle::before { content: "\\ea6e"; font: 400 16px/1 "lumno-remixicon"; }
        .badge[data-collapsed="true"] .toggle::before { content: "\\ea64"; }
        @media (prefers-color-scheme: dark) {
          .badge { border-color: rgba(255,255,255,.10); background: rgba(24,33,43,.91); box-shadow: 0 10px 32px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.08); color: #f3f6fb; }
          .detail { color: #a9b3c2; }
          .toggle { color: #aab4c3; }
          .toggle:hover { color: #91b8ff; background: rgba(99,153,255,.14); }
        }
        @media (prefers-reduced-motion: reduce) {
          .badge, .toggle { transition-duration: 1ms !important; }
        }
        @media print { :host { display: none !important; } }
      `;
      badge = documentObj.createElement('aside');
      badge.className = 'badge';
      badge.hidden = true;
      badge.dataset.collapsed = 'false';
      badge.dataset.trackingStatusBadge = '';
      badge.innerHTML = `
        <span class="symbols" aria-hidden="true"><span class="brand-mark"></span><span class="tracking-mark"></span></span>
        <span class="copy" role="status" aria-live="polite"><span class="title"></span><span class="detail"></span></span>
        <button class="toggle" data-tracking-status-toggle type="button"></button>`;
      badge.querySelector('.title').textContent = getMessage(
        'recent_tracking_page_badge_title',
        FALLBACK_MESSAGES.title
      );
      badge.querySelector('.detail').textContent = getMessage(
        'recent_tracking_page_badge_detail',
        FALLBACK_MESSAGES.detail
      );
      toggle = badge.querySelector('.toggle');
      toggle.addEventListener('click', () => {
        updateToggleState(badge.dataset.collapsed !== 'true');
      });
      updateToggleState(false);
      shadow.append(style, badge);
      return true;
    }

    function show(state) {
      if (!state || !state.cardId || !ensureSurface()) return false;
      badge.querySelector('.detail').textContent = String(state.cardTitle || '') || getMessage(
        'recent_tracking_page_badge_detail',
        FALLBACK_MESSAGES.detail
      );
      badge.hidden = false;
      return true;
    }

    function hide() {
      if (badge) badge.hidden = true;
    }

    return Object.freeze({ show, hide });
  }

  return Object.freeze({ HOST_ID, createTrackingStatusController });
});
