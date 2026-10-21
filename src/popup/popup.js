(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }
  root.LumnoPopup = api;
  api.start();
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  // The toolbar popup: actions on the current page, two global switches and
  // links to the rest of Lumno. React renders it from the model built here;
  // this script owns the browser APIs and the settings it reads and writes.
  const COMMAND_SHOW_SEARCH = 'show-search';
  const COMMAND_COPY_URL = 'show-search-prefill-v';
  // A success toast shown in the popup stays this long before the popup closes.
  const CLOSE_AFTER_TOAST_MS = 1400;
  const THEME_MODES = Object.freeze(['system', 'light', 'dark']);
  const SYNC_ATTENTION_STATES = Object.freeze(['conflict', 'choice']);
  const SYNC_BUSY_STATES = Object.freeze(['syncing', 'pending']);
  // Rate limits the background waits out for minutes to hours before retrying.
  const SYNC_THROTTLE_ERRORS = Object.freeze(['http-429', 'http-503']);
  const SETTINGS_EXPANDED_CACHE_KEY = 'lumno-popup-settings-expanded';
  const OVERFLOW_TOLERANCE_PX = 2;
  const VIDEO_PROBE_TIMEOUT_MS = 250;

  function getHost(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.hostname;
      }
    } catch (error) {
      return '';
    }
    return url;
  }

  function isWebUrl(url) {
    return /^https?:\/\//i.test(String(url || ''));
  }

  // Browser logos shipped in assets/images/browser-logos, matched against the
  // browser's product name.
  const BROWSER_LOGOS = Object.freeze([
    [/edge/i, 'microsoft-edge-2019.svg'],
    [/zen/i, 'zen.svg'],
    [/firefox/i, 'firefox.svg'],
    [/\bdia\b/i, 'dia.jpg'],
    [/comet/i, 'comet.jpg'],
    [/chrome/i, 'google-chrome-2022.svg']
  ]);

  // How the page card shows a tab: Lumno's own pages carry the Lumno icon,
  // browser pages the browser's logo, other pages their favicon.
  //   context: { ownBase, browserName, isBrowserInternalUrl(url) }
  // Returns { kind, iconPath, iconClass, host }; iconPath is extension-relative.
  function describePage(url, context) {
    const config = context || {};
    if (config.ownBase && url.startsWith(config.ownBase)) {
      return { kind: 'lumno', iconPath: 'assets/images/lumno.png', iconClass: '', host: 'Lumno' };
    }
    if (typeof config.isBrowserInternalUrl === 'function' && config.isBrowserInternalUrl(url)) {
      const logo = BROWSER_LOGOS.find(([pattern]) => pattern.test(String(config.browserName || '')));
      return {
        kind: 'browser',
        iconPath: logo ? `assets/images/browser-logos/${logo[1]}` : '',
        iconClass: logo ? '' : 'ri-window-line',
        host: url
      };
    }
    if (/^(?:chrome|moz|edge)-extension:/i.test(url)) {
      return { kind: 'extension', iconPath: '', iconClass: 'ri-puzzle-line', host: getHost(url) };
    }
    if (/^file:/i.test(url)) {
      return { kind: 'file', iconPath: '', iconClass: 'ri-file-line', host: url };
    }
    return { kind: 'web', iconPath: '', iconClass: 'ri-global-line', host: getHost(url) };
  }

  // "3 minutes ago" in the popup's language, "now" under a minute.
  function formatSyncTime(lastSyncAt, now, lang) {
    const elapsedSeconds = Math.max(0, Math.round((now - lastSyncAt) / 1000));
    let format = null;
    try {
      format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    } catch (error) {
      format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    }
    if (elapsedSeconds < 60) return format.format(0, 'second');
    const minutes = Math.round(elapsedSeconds / 60);
    if (minutes < 60) return format.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (hours < 24) return format.format(-hours, 'hour');
    return format.format(-Math.round(hours / 24), 'day');
  }

  function buildSyncModel(status, t, now, lang) {
    if (!status || status.enabled !== true) {
      return null;
    }
    if (status.state === 'error') {
      return { label: t('popup_sync_error', 'WebDAV sync failed'), tone: 'error' };
    }
    if (SYNC_ATTENTION_STATES.includes(status.state)) {
      return { label: t('popup_sync_attention', 'WebDAV sync needs you'), tone: 'error' };
    }
    // A throttled connection is pending too, but nothing runs until the server's
    // wait is over, so it must not look like a sync in progress.
    if (status.state === 'pending' && SYNC_THROTTLE_ERRORS.includes(status.error)) {
      return { label: t('popup_sync_waiting', 'WebDAV waiting to retry'), tone: 'waiting' };
    }
    if (SYNC_BUSY_STATES.includes(status.state)) {
      return { label: t('popup_sync_busy', 'WebDAV syncing'), tone: 'busy' };
    }
    if (typeof status.lastSyncAt === 'number' && status.lastSyncAt > 0) {
      return {
        label: `${t('popup_sync_ready', 'WebDAV synced')} · ${formatSyncTime(status.lastSyncAt, now, lang)}`,
        tone: 'ok'
      };
    }
    return null;
  }

  // state: {
  //   tab                  { id, url, title, iconUrl, iconClass, host } or null
  //   restricted           browser, store and other pages scripts cannot reach
  //   documentPipSupported the browser has Document Picture-in-Picture
  //   documentPipEnabled   web clip is turned on in Labs
  //   shortcuts            { search, copy } formatted key chords
  //   recentPin            { pinned, full } for the page among the New Tab's
  //                        pinned recent sites
  //   settings             { selectionQuickActions, overlaySize, overlayPageTheme,
  //                          overlayOpenTabs, theme } as stored, normalized
  //   settingsExpanded     the settings disclosure is open
  //   pip                  { supported, hasVideo, active, menuExpanded } for the
  //                        page's video and the auto picture-in-picture switch
  //   syncStatus, version, lang, now
  //   busyAction, notice
  // }
  function buildModel(state, t) {
    const tab = state.tab;
    const url = tab ? String(tab.url || '') : '';
    const restricted = !tab || state.restricted === true;
    // Shortcuts and pinned recent sites hold web pages only.
    const canSaveToNewTab = Boolean(tab) && isWebUrl(url) && !restricted;
    const recentPin = state.recentPin || {};
    const pinned = recentPin.pinned === true;
    const pinFull = !pinned && recentPin.full === true;
    const pip = state.pip || {};
    // Video picture-in-picture runs in the page, so browser pages never get it.
    const showPip = pip.supported === true && Boolean(tab) && !restricted;
    // Web clip is a Labs feature: it only shows once it is turned on.
    const showClip = state.documentPipSupported === true && state.documentPipEnabled === true;
    const values = state.settings;
    const action = (id, base) => ({
      ...base,
      id,
      disabled: base.disabled || state.busyAction === id
    });

    const actions = [
      action('search', {
        label: t('popup_open_command_bar', 'Open command bar'),
        tooltip: state.shortcuts.search,
        iconClass: 'ri-search-line',
        disabled: !tab
      }),
      action('copy', {
        label: t('popup_action_copy', 'Copy link'),
        tooltip: state.shortcuts.copy,
        iconClass: 'ri-link',
        disabled: !url
      }),
      action('shortcut', {
        label: t('popup_action_shortcut', 'Add shortcut'),
        tooltip: t('popup_action_shortcut_tooltip', 'Add to your New Tab shortcuts'),
        iconClass: 'ri-apps-2-add-line',
        disabled: !canSaveToNewTab
      }),
      action('pin', {
        label: pinned
          ? t('popup_action_unpin_recent', 'Unpin from Recent')
          : t('popup_action_pin_recent', 'Pin to Recent'),
        tooltip: pinned
          ? t('popup_action_unpin_recent_tooltip', 'Unpin from Recent on New Tab')
          : (pinFull
            ? t('recent_pin_limit', 'You can pin up to 3 cards')
            : t('popup_action_pin_recent_tooltip', 'Pin to Recent on New Tab')),
        iconClass: pinned ? 'ri-unpin-line' : 'ri-pushpin-line',
        disabled: !canSaveToNewTab || pinFull
      })
    ];
    // A disabled action says why in its tooltip.
    const unavailable = t('popup_action_unavailable', 'Not available on this page');
    if (!canSaveToNewTab) {
      actions.filter((item) => item.id === 'shortcut' || item.id === 'pin')
        .forEach((item) => { item.tooltip = unavailable; });
    }
    if (showClip) {
      actions.push(action('clip', {
        label: t('settings_document_pip_title', 'Web clip'),
        tooltip: restricted ? unavailable : t('popup_action_clip_tooltip', 'Clip part of the page into a floating window'),
        iconClass: 'ri-screenshot-2-line',
        disabled: restricted
      }));
    }
    if (showPip) {
      actions.push(action('pip', {
        label: pip.active
          ? t('popup_action_pip_exit', 'Exit picture-in-picture')
          : t('popup_action_pip', 'Picture-in-picture'),
        // Without a video the button is simply off; it needs no explanation.
        tooltip: pip.hasVideo || pip.active
          ? t('popup_action_pip_tooltip', 'Float this page’s video in a small window')
          : '',
        iconClass: 'ri-picture-in-picture-2-line',
        disabled: !pip.hasVideo && !pip.active,
        menu: {
          label: t('popup_action_pip_menu', 'Auto picture-in-picture'),
          expanded: pip.menuExpanded === true
        }
      }));
    }

    const notice = state.notice || null;

    const themeMode = THEME_MODES.includes(values.theme) ? values.theme : 'system';
    return {
      page: {
        title: tab ? String(tab.title || getHost(url) || url) : 'Lumno',
        host: tab ? (tab.host === undefined ? getHost(url) : String(tab.host)) : '',
        iconUrl: tab ? String(tab.iconUrl || '') : '',
        iconClass: tab ? String(tab.iconClass || 'ri-global-line') : 'ri-global-line'
      },
      actionsLabel: t('popup_actions_label', 'Page actions'),
      actions,
      actionPanel: showPip
        ? {
          actionId: 'pip',
          expanded: pip.menuExpanded === true,
          rows: [{
            kind: 'switch',
            id: 'autoPip',
            label: t('popup_action_pip_menu', 'Auto picture-in-picture'),
            hint: t('popup_auto_pip_hint', 'Videos float when you switch tabs'),
            checked: values.autoPip === true
          }]
        }
        : null,
      notice,
      settings: {
        label: t('popup_settings_label', 'Quick settings'),
        expanded: state.settingsExpanded === true,
        sections: [
          {
            id: 'command-bar',
            title: t('popup_section_command_bar', 'Command bar'),
            rows: [
              {
                kind: 'segmented',
                id: 'overlaySize',
                label: t('settings_overlay_size_title', 'Size'),
                value: values.overlaySize,
                options: [
                  { value: 'compact', label: t('overlay_size_compact', 'Compact') },
                  { value: 'standard', label: t('overlay_size_standard', 'Standard') },
                  { value: 'large', label: t('overlay_size_large', 'Large') }
                ]
              },
              {
                kind: 'switch',
                id: 'overlayPageTheme',
                label: t('popup_overlay_page_theme', 'Match page colors'),
                checked: values.overlayPageTheme === true
              },
              {
                kind: 'switch',
                id: 'overlayOpenTabs',
                label: t('popup_overlay_open_tabs', 'Show open tabs by default'),
                checked: values.overlayOpenTabs === true
              }
            ]
          },
          {
            id: 'general',
            title: t('settings_tab_general', 'General'),
            rows: [
              {
                kind: 'switch',
                id: 'selectionQuickActions',
                label: t('settings_selection_quick_actions_title', 'Selection quick actions'),
                checked: values.selectionQuickActions === true
              },
              {
                kind: 'segmented',
                id: 'theme',
                label: t('popup_theme_label', 'Theme'),
                value: themeMode,
                options: [
                  { value: 'system', label: t('settings_theme_system', 'System') },
                  { value: 'light', label: t('settings_theme_light', 'Light') },
                  { value: 'dark', label: t('settings_theme_dark', 'Dark') }
                ]
              }
            ]
          }
        ]
      },
      links: [
        { id: 'release', label: t('popup_release_notes', 'What’s new'), iconClass: 'ri-sparkling-2-line' },
        { id: 'feedback', label: t('popup_link_feedback', 'Feedback'), iconClass: 'ri-chat-smile-2-line' },
        { id: 'shortcuts', label: t('popup_link_shortcuts', 'Set shortcuts'), iconClass: 'ri-keyboard-box-line' },
        { id: 'settings', label: t('popup_link_settings', 'Settings'), iconClass: 'ri-settings-3-line' }
      ],
      sync: buildSyncModel(state.syncStatus, t, state.now, state.lang),
      version: `Lumno ${state.version || ''}`.trim()
    };
  }

  function start() {
    const chromeApi = root.chrome;
    const settings = root.LumnoSettings;
    const urlGuards = root.LumnoUrlGuards;
    const shortcutDisplay = root.LumnoShortcutDisplay;
    const reactApi = root.LumnoPopupReact;
    const documentObj = root.document;
    const host = documentObj.getElementById('x-lumno-popup-root');
    if (!chromeApi || !settings || !reactApi || !host) {
      return;
    }
    const provider = settings.createProviderStorageRuntime(chromeApi);
    // The settings the popup shows, by row id: where each is stored and how a
    // stored value reads.
    const SETTING_SPECS = Object.freeze({
      selectionQuickActions: {
        key: settings.SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY,
        normalize: settings.normalizeSelectionQuickActionsEnabled
      },
      overlaySize: {
        key: settings.OVERLAY_SIZE_MODE_STORAGE_KEY,
        normalize: settings.normalizeOverlaySizeMode
      },
      overlayPageTheme: {
        key: settings.OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY,
        normalize: settings.normalizeOverlayPageThemeAdaptationEnabled
      },
      overlayOpenTabs: {
        key: settings.OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
        normalize: settings.normalizeOverlayOpenTabsDefaultVisible
      },
      theme: {
        key: settings.THEME_STORAGE_KEY,
        normalize: settings.normalizeThemeMode
      },
      autoPip: {
        key: settings.AUTO_PIP_ENABLED_STORAGE_KEY,
        normalize: (value) => value !== false
      }
    });
    const settingIds = Object.keys(SETTING_SPECS);
    const darkQuery = root.matchMedia('(prefers-color-scheme: dark)');
    const tooltip = root.LumnoTooltip.createController({
      documentObj,
      windowObj: root,
      id: 'x-lumno-popup-tooltip',
      appendTo: documentObj.body,
      maxWidth: 272
    });
    // A page title or address cut short shows in full beside the pointer.
    const cursorTooltip = root.LumnoCursorTooltip.createController({
      documentObj,
      windowObj: root,
      id: 'x-lumno-popup-cursor-tooltip',
      appendTo: documentObj.body,
      maxWidth: 280,
      offsetX: 12,
      offsetY: 16
    });
    let messages = {};
    let languageMode = 'system';
    let closeTimer = 0;
    let popupToast = null;
    const state = {
      tab: null,
      restricted: true,
      documentPipSupported: 'documentPictureInPicture' in root,
      documentPipEnabled: false,
      shortcuts: { search: '', copy: '' },
      recentPin: null,
      settings: Object.fromEntries(settingIds.map((id) => [id, SETTING_SPECS[id].normalize(undefined)])),
      syncStatus: null,
      version: '',
      lang: 'en',
      now: Date.now(),
      busyAction: '',
      notice: null,
      settingsExpanded: readSettingsExpanded(),
      pip: {
        // Firefox pages have no requestPictureInPicture.
        supported: typeof root.HTMLVideoElement === 'function' &&
          typeof root.HTMLVideoElement.prototype.requestPictureInPicture === 'function',
        hasVideo: false,
        active: false,
        menuExpanded: false
      }
    };

    // Whether the settings were left open is this browser's own convenience.
    function readSettingsExpanded() {
      try {
        return root.localStorage.getItem(SETTINGS_EXPANDED_CACHE_KEY) === 'true';
      } catch (error) {
        return false;
      }
    }

    function writeSettingsExpanded(expanded) {
      try {
        root.localStorage.setItem(SETTINGS_EXPANDED_CACHE_KEY, expanded ? 'true' : 'false');
      } catch (error) {
        // The popup opens with the settings folded next time.
      }
    }

    function t(key, fallback) {
      const entry = messages[key];
      if (entry && typeof entry.message === 'string') {
        return entry.message;
      }
      if (languageMode === 'system' && chromeApi.i18n && chromeApi.i18n.getMessage) {
        const message = chromeApi.i18n.getMessage(key);
        if (message) return message;
      }
      return fallback;
    }

    function callback(method, ...args) {
      return new Promise((resolve) => {
        try {
          method(...args, (result) => {
            resolve(chromeApi.runtime.lastError ? null : result);
          });
        } catch (error) {
          resolve(null);
        }
      });
    }

    function sendMessage(payload) {
      return callback(chromeApi.runtime.sendMessage.bind(chromeApi.runtime), payload);
    }

    function loadMessages(locale) {
      return fetch(chromeApi.runtime.getURL(`_locales/${locale}/messages.json`))
        .then((response) => (response.ok ? response.json() : {}))
        .catch(() => ({}));
    }

    // A web page's favicon, from the browser's cache where it offers one.
    function getFaviconUrl(tab, page) {
      if (page.kind !== 'web') return '';
      const url = String(tab.url || '');
      const manifest = chromeApi.runtime.getManifest();
      if (isWebUrl(url) && Array.isArray(manifest.permissions) && manifest.permissions.includes('favicon')) {
        return chromeApi.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
      }
      return String(tab.favIconUrl || '');
    }

    function readShortcuts() {
      if (!chromeApi.commands || typeof chromeApi.commands.getAll !== 'function') {
        return Promise.resolve({ search: '', copy: '' });
      }
      return callback(chromeApi.commands.getAll.bind(chromeApi.commands)).then((commands) => {
        const list = Array.isArray(commands) ? commands : [];
        const find = (name) => {
          const command = list.find((item) => item && item.name === name);
          return command && command.shortcut ? shortcutDisplay.formatShortcutChord(command.shortcut, { navigatorLike: root.navigator }) : '';
        };
        return { search: find(COMMAND_SHOW_SEARCH), copy: find(COMMAND_COPY_URL) };
      });
    }

    function applyTheme() {
      const mode = state.settings.theme;
      const resolved = mode === 'system' ? (darkQuery.matches ? 'dark' : 'light') : mode;
      documentObj.body.setAttribute('data-theme', resolved);
      documentObj.documentElement.style.colorScheme = resolved;
    }

    function cacheThemeMode(mode) {
      try {
        root.localStorage.setItem(settings.OPTIONS_THEME_PRELOAD_STORAGE_KEY, mode);
      } catch (error) {
        // The next popup paints the system theme first instead.
      }
    }

    // Shows a value at once and stores it; the rest of Lumno follows the
    // storage change.
    function saveSetting(id, rawValue) {
      const spec = SETTING_SPECS[id];
      if (!spec) return;
      const updates = id === 'theme'
        ? settings.createGlobalThemeModeStorageUpdate(rawValue)
        : { [spec.key]: spec.normalize(rawValue) };
      state.settings[id] = updates[spec.key];
      if (id === 'theme') {
        cacheThemeMode(state.settings.theme);
        applyTheme();
      }
      render();
      provider.area.set(updates).catch(() => {});
    }

    const controller = reactApi.createPopupController(host, {
      onAction: runAction,
      onSwitch: saveSetting,
      onSelect: saveSetting,
      // The settings and an action's options take turns being open, so the
      // popup stays inside the browser's 600px height limit.
      onSettingsToggle(expanded) {
        state.settingsExpanded = expanded;
        writeSettingsExpanded(expanded);
        if (expanded) state.pip.menuExpanded = false;
        tooltip.hide();
        render();
      },
      onActionMenuToggle(id, expanded) {
        if (id !== 'pip') return;
        state.pip.menuExpanded = expanded;
        if (expanded && state.settingsExpanded) {
          state.settingsExpanded = false;
          writeSettingsExpanded(false);
        }
        tooltip.hide();
        render();
      },
      onLink: openLink
    });

    function render() {
      state.now = Date.now();
      controller.render(buildModel(state, t));
      tooltip.bindAll(host, { placement: 'top' });
      host.querySelectorAll('.x-lumno-popup__page-title, .x-lumno-popup__page-host').forEach((line) => {
        cursorTooltip.bind(line, () => line.textContent, {
          shouldShow: (target) => root.LumnoCursorTooltip.isElementTextTruncated(target)
        });
      });
      root.requestAnimationFrame(syncOverflow);
    }

    // The browser sizes the popup to the page, up to 600px tall. Fractional
    // line heights can leave the page a pixel taller than that window, which
    // should not draw a scrollbar; content past the limit still scrolls.
    function syncOverflow() {
      const page = documentObj.documentElement;
      page.style.overflowY = page.scrollHeight - root.innerHeight > OVERFLOW_TOLERANCE_PX ? 'auto' : 'hidden';
    }

    // Lumno's top toast, at the top of the popup, for pages that cannot show
    // one themselves (browser pages, PDF viewers).
    function showPopupToast(message) {
      if (!popupToast) {
        const element = documentObj.createElement('div');
        element.className = 'x-lumno-toast';
        element.setAttribute('data-show', 'false');
        element.setAttribute('role', 'status');
        element.setAttribute('aria-live', 'polite');
        element.style.setProperty('--x-lumno-toast-top', '12px');
        documentObj.body.appendChild(element);
        popupToast = { element, controller: root.LumnoToast.createToastController(element, { windowObj: root }) };
      }
      if (documentObj.body.getAttribute('data-theme') === 'dark') {
        popupToast.element.setAttribute('data-theme', 'dark');
      } else {
        popupToast.element.removeAttribute('data-theme');
      }
      popupToast.controller.show(message, { duration: CLOSE_AFTER_TOAST_MS });
    }

    // Every success is told by Lumno's top toast: the page's when it showed
    // one, so the popup gets out of the way, otherwise the popup's own.
    function announceSuccess(message, shownInPage) {
      state.busyAction = '';
      if (shownInPage || !message) {
        root.close();
        return;
      }
      render();
      showPopupToast(message);
      root.clearTimeout(closeTimer);
      closeTimer = root.setTimeout(() => root.close(), CLOSE_AFTER_TOAST_MS);
    }

    function showError(text) {
      state.busyAction = '';
      state.notice = { text, tone: 'error' };
      render();
    }

    function executeInTab(tabId, details) {
      return new Promise((resolve) => {
        try {
          chromeApi.scripting.executeScript({ target: { tabId }, ...details }, (results) => {
            const first = !chromeApi.runtime.lastError && Array.isArray(results) ? results[0] : null;
            resolve(first && first.result && typeof first.result === 'object' ? first.result : null);
          });
        } catch (error) {
          resolve(null);
        }
      });
    }

    // Whether the page has a video picture-in-picture can show, and whether
    // one already floats. A page that does not answer in time counts as none.
    function probeVideo(tabId) {
      const probe = executeInTab(tabId, {
        func: () => ({
          hasVideo: Array.from(document.querySelectorAll('video')).some((video) => video.readyState >= 1),
          active: Boolean(document.pictureInPictureElement)
        })
      });
      const timeout = new Promise((resolve) => root.setTimeout(() => resolve(null), VIDEO_PROBE_TIMEOUT_MS));
      return Promise.race([probe, timeout]);
    }

    // Runs in the page from this click, so the request carries the popup's
    // user activation. Lumno's own helper picks the playing or largest video.
    async function runPictureInPicture(tab) {
      const mainWorld = root.LumnoPipMainWorld;
      const exiting = state.pip.active;
      const result = await executeInTab(tab.id, {
        world: 'MAIN',
        func: exiting ? mainWorld.forceExitPiPInMainWorld : mainWorld.siteTryEnterPiPInMainWorld
      });
      if (result && result.after === !exiting) {
        root.close();
        return;
      }
      showError(t('popup_pip_failed', 'This video can’t play picture-in-picture.'));
    }

    // The page is the tab the popup showed, not whatever is active later.
    async function runAction(id) {
      const tab = state.tab;
      if (!tab || state.busyAction) return;
      state.busyAction = id;
      state.notice = null;
      render();
      if (id === 'clip' || id === 'search') {
        await sendMessage({
          action: id === 'clip' ? 'popupOpenDocumentPipPicker' : 'popupShowSearch',
          tabId: tab.id
        });
        root.close();
        return;
      }
      if (id === 'pip') {
        await runPictureInPicture(tab);
        return;
      }
      if (id === 'copy') {
        try {
          await root.navigator.clipboard.writeText(String(tab.url || ''));
        } catch (error) {
          showError(t('popup_copy_failed', 'Couldn’t copy the link. Try again.'));
          return;
        }
        const message = t('copy_page_url_success', 'Current page URL copied');
        const shown = await sendMessage({ action: 'popupShowPageToast', tabId: tab.id, message });
        announceSuccess(message, Boolean(shown && shown.ok));
        return;
      }
      if (id === 'pin') {
        const result = await sendMessage({ action: 'popupToggleRecentPin', tabId: tab.id });
        const status = result && result.status;
        if (status === 'pinned' || status === 'unpinned') {
          state.recentPin = { ...state.recentPin, pinned: status === 'pinned' };
          let message = t('popup_recent_unpinned', 'Unpinned from Recent');
          if (status === 'pinned') {
            message = result.tracking === true
              ? t('recent_progress_auto_toast', 'Pinned and tracking progress. Click the radar icon on the card to stop.')
              : t('popup_recent_pinned', 'Pinned to Recent on your New Tab');
          }
          const shown = await sendMessage({ action: 'popupShowPageToast', tabId: tab.id, message });
          announceSuccess(message, Boolean(shown && shown.ok));
          return;
        }
        showError(status === 'limit'
          ? t('recent_pin_limit_toast', 'You can pin up to 3 cards.')
          : t('toast_error', 'Action failed. Try again.'));
        return;
      }
      if (id === 'shortcut') {
        const result = await sendMessage({ action: 'popupAddPageShortcut', tabId: tab.id });
        const status = result && result.status;
        if (status === 'added' || status === 'exists') {
          announceSuccess(result.message, result.toastShown === true);
          return;
        }
        showError((result && result.message) || t('toast_error', 'Action failed. Try again.'));
      }
    }

    function openLink(id) {
      const requests = {
        settings: { action: 'openOptionsPage' },
        feedback: { action: 'openOptionsPage', hash: 'general' },
        sync: { action: 'openOptionsPage', hash: 'account' },
        shortcuts: { action: 'openExtensionShortcutsPage' },
        release: { action: 'openReleasePage', reason: 'manual' }
      };
      const request = requests[id];
      if (!request) return;
      sendMessage(request).then(() => root.close());
    }

    function onStorageChanged(changes, areaName) {
      if (areaName === 'local' && changes[settings.WEBDAV_STATUS_STORAGE_KEY]) {
        state.syncStatus = changes[settings.WEBDAV_STATUS_STORAGE_KEY].newValue || null;
        render();
      }
      if (!provider.isActiveAreaName(areaName)) return;
      let changed = false;
      settingIds.forEach((id) => {
        const change = changes[SETTING_SPECS[id].key];
        if (!change) return;
        state.settings[id] = SETTING_SPECS[id].normalize(change.newValue);
        changed = true;
      });
      if (changes[settings.THEME_STORAGE_KEY]) applyTheme();
      if (changes[settings.DOCUMENT_PIP_ENABLED_STORAGE_KEY]) {
        state.documentPipEnabled = changes[settings.DOCUMENT_PIP_ENABLED_STORAGE_KEY].newValue === true;
        changed = true;
      }
      if (changed) render();
    }

    async function init() {
      const [tabs, stored, local, shortcuts] = await Promise.all([
        callback(chromeApi.tabs.query.bind(chromeApi.tabs), { active: true, currentWindow: true }),
        provider.ready.then(() => provider.area.get([
          settings.LANGUAGE_STORAGE_KEY,
          settings.DOCUMENT_PIP_ENABLED_STORAGE_KEY,
          ...settingIds.map((id) => SETTING_SPECS[id].key)
        ])).catch(() => ({})),
        callback(chromeApi.storage.local.get.bind(chromeApi.storage.local), [settings.WEBDAV_STATUS_STORAGE_KEY]),
        readShortcuts()
      ]);
      const values = stored || {};
      languageMode = values[settings.LANGUAGE_STORAGE_KEY] || 'system';
      const uiLanguage = chromeApi.i18n && chromeApi.i18n.getUILanguage ? chromeApi.i18n.getUILanguage() : 'en';
      const locale = settings.normalizeLocale(languageMode === 'system' ? uiLanguage : languageMode);
      state.lang = settings.localeToHtmlLang(locale);
      documentObj.documentElement.lang = state.lang;
      const tab = Array.isArray(tabs) && tabs[0] && typeof tabs[0].id === 'number' ? tabs[0] : null;
      if (tab) {
        const url = String(tab.url || tab.pendingUrl || '');
        state.tab = { id: tab.id, url, title: String(tab.title || ''), favIconUrl: tab.favIconUrl };
        const page = describePage(url, {
          ownBase: chromeApi.runtime.getURL(''),
          browserName: root.LumnoBrowserProfile.getBrowserInternalProfile(root.navigator).name,
          isBrowserInternalUrl: urlGuards.isBrowserInternalUrl
        });
        state.tab.iconUrl = page.iconPath ? chromeApi.runtime.getURL(page.iconPath) : getFaviconUrl(state.tab, page);
        state.tab.iconClass = page.iconClass;
        state.tab.host = page.host;
        state.restricted = urlGuards.isRestrictedUrl(url);
      }
      const canProbeVideo = Boolean(state.tab) && !state.restricted && state.pip.supported;
      const [loadedMessages, video, recentPin] = await Promise.all([
        loadMessages(locale),
        canProbeVideo ? probeVideo(state.tab.id) : Promise.resolve(null),
        state.tab ? sendMessage({ action: 'popupGetRecentPin', tabId: state.tab.id }) : Promise.resolve(null)
      ]);
      messages = loadedMessages;
      if (recentPin) {
        state.recentPin = { pinned: recentPin.pinned === true, full: recentPin.full === true };
      }
      if (video) {
        state.pip.hasVideo = video.hasVideo === true;
        state.pip.active = video.active === true;
      }
      settingIds.forEach((id) => {
        state.settings[id] = SETTING_SPECS[id].normalize(values[SETTING_SPECS[id].key]);
      });
      cacheThemeMode(state.settings.theme);
      state.documentPipEnabled = values[settings.DOCUMENT_PIP_ENABLED_STORAGE_KEY] === true;
      state.syncStatus = local ? local[settings.WEBDAV_STATUS_STORAGE_KEY] || null : null;
      state.shortcuts = shortcuts;
      state.version = chromeApi.runtime.getManifest().version || '';
      applyTheme();
      render();
      root.addEventListener('resize', syncOverflow);
      // A folding panel changes height in one step, after its rows fade on
      // closing; measure once either settles.
      host.addEventListener('transitionend', (event) => {
        if (event.propertyName === 'height' || event.propertyName === 'opacity') syncOverflow();
      });
      darkQuery.addEventListener('change', () => {
        if (state.settings.theme === 'system') applyTheme();
      });
      settings.addStorageChangeListener(chromeApi, onStorageChanged);
    }

    init().catch((error) => {
      console.error('[Lumno] The popup failed to start.', error);
    });
  }

  return Object.freeze({ buildModel, describePage, formatSyncTime, start });
});
