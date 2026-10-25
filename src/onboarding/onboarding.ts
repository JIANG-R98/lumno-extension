import * as COMMUNITY_LINKS from '../platform/community-links';
import * as LumnoExtensionRoutes from '../domain/extension-routes';
import type { BackgroundRequest, OkReply, OverlayTab } from '../domain/messages';
import * as NAVIGATION_DISPOSITION from '../domain/navigation-disposition';
import type { Disposition } from '../domain/navigation-disposition';
import * as LumnoSettings from '../domain/settings';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import { isElementNode } from '../shared/dom-guards';
import { getHtmlElement, queryHtmlElement } from '../shared/dom-lookup';
import * as LumnoTooltip from '../shared/ui/tooltip';
import * as MODEL from './onboarding-content';
import type {
  OnboardingBlueprint,
  OnboardingEvent,
  OnboardingRuntimeCopy,
  OnboardingSlide,
  OnboardingState
} from './onboarding-content';
import type { CopyPanelModel, CopySwapPhase } from './react/copy-panel';
import type { InteractionBrowserAvatars, InteractionInfoTooltip } from './react/interactions';
import type { NewtabPreviewItem } from './react/newtab-preview';
import type { SiteSearchTheme } from './react/site-search-demo';
import type { VisualSurfaceRenderModel } from './react/visual-surface';
import * as LumnoMessaging from '../platform/messaging';

type RuntimeMiscKey = keyof OnboardingRuntimeCopy['misc'];
type SiteSearchCase = OnboardingRuntimeCopy['siteSearchDemo']['cases'][number];
type Rgb = readonly number[];
// The background messages the slide actions send.
type ActionMessage =
  | 'openExtensionShortcutsPage'
  | 'openExtensionDetailsPage'
  | 'openNewTab'
  | 'openOptionsPage'
  | 'openSiteSearchOptionsPage';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

(function() {

  const LANGUAGE_STORAGE_KEY = LumnoSettings.LANGUAGE_STORAGE_KEY;
  const SHOW_SEARCH_COMMAND_NAME = 'show-search';
  const ONBOARDING_SEARCH_OVERLAY_COMMAND_ACTION = 'triggerOnboardingSearchOverlayFromCommand';
  const SHORTCUT_PLACEHOLDER = '{shortcut}';
  const TITLE_CYCLE_INTERVAL_MS = 1900;
  const TITLE_CYCLE_FIRST_DELAY_MS = 520;
  const TEXT_SWAP_FALLBACK_DURATION_MS = 200;
  const SITE_SEARCH_OPTIONS_PAGE_PATH = 'src/options/options.html#shortcuts';
  const FOCUSED_NEWTAB_RELATIVE_PAGE_PATH = '../newtab/lumno-newtab.html?focus=1';
  // The demo recent-site card points at Lumno's own listing, so it follows the
  // store this copy was installed from.
  const STORE_ACCENT_RGB = Object.freeze({
    chrome: Object.freeze([66, 133, 244]),
    edge: Object.freeze([0, 120, 212]),
    firefox: Object.freeze([255, 113, 57])
  });
  const ACTION_MESSAGE_BY_ID: ReadonlyMap<string, ActionMessage> = new Map<string, ActionMessage>([
    ['openShortcuts', 'openExtensionShortcutsPage'],
    ['openExtensionDetails', 'openExtensionDetailsPage'],
    ['openNewtab', 'openNewTab'],
    ['openOptions', 'openOptionsPage'],
    ['openSiteSearchOptions', 'openSiteSearchOptionsPage']
  ]);
  let runtimeCopy = MODEL.getOnboardingRuntimeCopy('en');
  const LUMNO_WEB_WORDMARK_SRC = '../../assets/images/lumno-web-textlogo.svg';
  const LUMNO_WEB_BUTTERFLY_REST_PATH = 'M4.3248 17.7823C1.22382 14.6398 -0.116749 10.2475 0.824858 6.7097C1.02033 5.97529 1.95363 5.98287 2.27212 6.67289L4.16024 10.7637C4.38415 11.2488 4.50011 11.7767 4.50011 12.311L4.50011 16L6.24277 16C7.66705 16 9.01155 16.6576 9.88596 17.7819L11.0831 19.3211C11.5044 19.8627 11.2076 20.6668 10.5235 20.7201C8.63849 20.8671 6.85452 20.3459 4.3248 17.7823Z';
  const LUMNO_WEB_BUTTERFLY_FLUTTER_PATH = 'M4.32468 17.7823C-1.04106 11.6456 2.30784 4.56298 5.14393 1.13518C5.48929 0.717757 6.11849 0.734355 6.47527 1.14207L10.4328 5.66451C11.4105 6.78177 11.6239 8.37593 10.9745 9.71102L8.61264 14.567L11.5238 13.9636C13.2202 13.612 14.9706 14.24 16.0565 15.5899L18.7241 18.9056C19.0394 19.2975 18.9857 19.8717 18.5688 20.1531C15.6258 22.1399 9.6385 23.8596 4.32468 17.7823Z';
  const LUMNO_WEB_BUTTERFLY_D_VALUES = `${LUMNO_WEB_BUTTERFLY_FLUTTER_PATH};${LUMNO_WEB_BUTTERFLY_REST_PATH};${LUMNO_WEB_BUTTERFLY_FLUTTER_PATH}`;
  const ONBOARDING_OVERLAY_DEMO_PANEL_ID = '_x_extension_onboarding_overlay_demo_2026_unique_';
  const LUMNO_OVERLAY_HOVER_LEAD_MS = 1040;
  const LUMNO_OVERLAY_HOVER_START_MS = 4240 - LUMNO_OVERLAY_HOVER_LEAD_MS;
  const LUMNO_OVERLAY_HOVER_STEP_MS = 1600;
  const LUMNO_OVERLAY_HOVER_WRAP_STEP_MS = 1600;
  const NEWTAB_PREVIEW_HOVER_START_MS = 1500;
  const NEWTAB_PREVIEW_HOVER_HOLD_MS = 1200;
  const NEWTAB_PREVIEW_HOVER_MOVE_MS = 520;
  const NEWTAB_PREVIEW_HOVER_SETTLE_MS = 1140;
  const NEWTAB_PREVIEW_WORDMARK_SRC = '../../assets/images/lumno-wordmark.svg';
  const HOMEPAGE_PIP_ART_SRC = '../../assets/images/onboarding-auto-pip.svg';
  const NEWTAB_FILTERS_ART_SRC = '../../assets/images/onboarding-newtab-filters.webp';
  const ONBOARDING_FRAME_WIDTH = 1240;
  const ONBOARDING_FRAME_HEIGHT = 680;
  const VISUAL_CANVAS_WIDTH = 704;
  const VISUAL_CANVAS_HEIGHT = 680;

  function getRuntimeMiscText(key: RuntimeMiscKey, fallback: string): string {
    return String(runtimeCopy.misc[key] || '').trim() || fallback;
  }

  function formatRuntimeTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => (
      Object.hasOwn(values, key) ? String(values[key]) : match
    ));
  }

  function getLumnoOverlayQuery(): string {
    return String(runtimeCopy.lumnoOverlay.query || 'extension');
  }

  function getNewtabPreviewRecentSites(): NewtabPreviewItem[] {
    return runtimeCopy.newtabPreview.recentSites.map((item) => {
      if (item.url.trim() !== 'chromeWebStore') {
        return Object.assign({}, item);
      }
      const listing = COMMUNITY_LINKS.getStoreListing();
      return Object.assign({}, item, {
        title: `Lumno - ${listing.name}`,
        siteName: listing.name,
        url: listing.url,
        urlText: listing.host,
        accentRgb: STORE_ACCENT_RGB[listing.id]
      });
    });
  }

  function getNewtabPreviewSectionTitle(key: 'bookmarks' | 'recent', fallback: string): string {
    return String(runtimeCopy.newtabPreview.sections[key] || fallback);
  }

  const params = new URLSearchParams(window.location.search || '');
  const root = queryHtmlElement(document, '[data-onboarding-shell]');
  const copyPanel = getHtmlElement(document, 'onboarding-copy-panel');
  const visualSlot = getHtmlElement(document, 'onboarding-visual-slot');
  const visualPanel = getHtmlElement(document, 'onboarding-visual-panel');
  const visualCanvas = getHtmlElement(document, 'onboarding-visual-canvas');
  // Set by the React islands entry, which the page loads first.
  const onboardingCopyPanelApi = globalThis.LumnoOnboardingCopyPanel;
  const onboardingVisualPanelApi = globalThis.LumnoOnboardingVisualPanel;
  if (!onboardingCopyPanelApi || !onboardingVisualPanelApi) {
    return;
  }
  const copyPanelController = onboardingCopyPanelApi.createCopyPanelController(copyPanel, {
    onNavigate(slideIndex) {
      dispatch({ type: 'GOTO', index: slideIndex });
    },
    onTitleFitNeeded() {
      scheduleTitleFitUpdate();
    },
    onAction(actionId, event) {
      runExtensionAction(actionId, event);
    },
    onShowTooltip(button) {
      showActionButtonTooltip(button);
    },
    onHideTooltip() {
      hideActionButtonTooltip();
    },
    onToggleAccordion(accordionId) {
      toggleInteractionAccordion(accordionId);
    },
    onShowInfoTooltip(target, infoTooltip, browserAvatars) {
      showOnboardingInfoTooltip(target, infoTooltip, browserAvatars);
    },
    onHideInfoTooltip() {
      hideOnboardingInfoTooltip();
    }
  });
  const visualPanelController = onboardingVisualPanelApi.createVisualPanelController(visualCanvas);
  let blueprint: OnboardingBlueprint | null = null;
  let state: OnboardingState | null = null;
  let currentShortcutValue = getDefaultShortcutValue();
  let currentShortcutLabel = getDefaultShortcutLabel();
  let titleFitFrame = 0;
  let copySwapTimeout = 0;
  let visualScaleFrame = 0;
  let expandedInteractionAccordionId = '';
  // The title and body's place in a slide change.
  let copySwap: CopySwapPhase = null;
  // The visual blurs out ahead of some slide changes.
  let visualExiting = false;
  // The step strip shows from the second slide on and slides in when it
  // appears; this is the slide it last drew.
  let pageStripIndex = -1;
  let pageStripEntering = false;
  let visualResizeObserver: ResizeObserver | null = null;
  const onboardingInfoTooltipController = LumnoTooltip.createController({
    id: '_x_extension_onboarding_info_tooltip_2026_unique_',
    className: 'onboarding-info-tooltip',
    maxWidth: 360
  });
  const actionTooltipController = LumnoTooltip.createController({
    id: '_x_extension_onboarding_action_tooltip_2026_unique_',
    className: 'onboarding-info-tooltip',
    maxWidth: 360
  });

  function getChromeApi(): typeof chrome | null {
    return typeof chrome !== 'undefined' ? chrome : null;
  }

  function syncOnboardingSlideParam(index: number): void {
    if (!window.history || typeof window.history.replaceState !== 'function' || !window.location || !window.location.href) {
      return;
    }
    const numericIndex = Number(index);
    const safeIndex = Number.isFinite(numericIndex) ? Math.max(0, Math.floor(numericIndex)) : 0;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('slide', String(safeIndex));
      const nextUrl = url.toString();
      if (nextUrl === window.location.href) {
        return;
      }
      window.history.replaceState(window.history.state, '', nextUrl);
    } catch (error) {
      // Ignore URL sync failures; onboarding state should still render normally.
    }
  }

  function buildRuntimePageUrl(path: string): string {
    const value = path.trim();
    if (!value) {
      return '';
    }
    const chromeApi = getChromeApi();
    const hashIndex = value.indexOf('#');
    const pagePath = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    const hash = hashIndex >= 0 ? value.slice(hashIndex + 1) : '';
    const baseUrl = chromeApi &&
        chromeApi.runtime &&
        typeof chromeApi.runtime.getURL === 'function'
      ? chromeApi.runtime.getURL(pagePath)
      : pagePath;
    return hash ? `${baseUrl}#${hash}` : baseUrl;
  }

  function navigateOnboardingToNewtab(): boolean {
    const chromeApi = getChromeApi();
    const routes = LumnoExtensionRoutes;
    let url = '';
    url = routes.buildLumnoNewtabUrl(chromeApi, { focus: true });
    if (!url && chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function') {
      url = chromeApi.runtime.getURL('src/newtab/lumno-newtab.html?focus=1');
    }
    if (!url && typeof window !== 'undefined' && window.location) {
      try {
        url = new URL(FOCUSED_NEWTAB_RELATIVE_PAGE_PATH, window.location.href).toString();
      } catch (error) {
        url = FOCUSED_NEWTAB_RELATIVE_PAGE_PATH;
      }
    }
    if (!url || typeof window === 'undefined' || !window.location) {
      return false;
    }
    try {
      if (typeof window.location.assign === 'function') {
        window.location.assign(url);
        return true;
      }
      window.location.href = url;
      return true;
    } catch (error) {
      return false;
    }
  }

  function openExtensionPageTab(path: string, disposition: Disposition): boolean {
    const url = buildRuntimePageUrl(path);
    if (!url) {
      return false;
    }
    const chromeApi = getChromeApi();
    if (chromeApi && chromeApi.tabs && typeof chromeApi.tabs.create === 'function') {
      try {
        chromeApi.tabs.create({ url, active: disposition !== 'backgroundTab' });
        return true;
      } catch (error) {
        // Fall through to window.open when the tabs API is unavailable.
      }
    }
    if (typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener');
      return true;
    }
    return false;
  }

  function openSiteSearchOptionsFallback(disposition: Disposition): boolean {
    return openExtensionPageTab(SITE_SEARCH_OPTIONS_PAGE_PATH, disposition);
  }

  function openExternalTab(url: string, disposition: Disposition): boolean {
    const targetUrl = url.trim();
    if (!targetUrl) {
      return false;
    }
    const chromeApi = getChromeApi();
    if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.sendMessage === 'function') {
      try {
        LumnoMessaging.sendBackgroundMessage(chromeApi.runtime, { action: 'createTab', url: targetUrl, disposition }, (response) => {
          const lastError = chromeApi.runtime && chromeApi.runtime.lastError;
          if (!lastError && response && response.ok !== false) {
            return;
          }
          if (typeof window.open === 'function') {
            window.open(targetUrl, '_blank', 'noopener');
          }
        });
        return true;
      } catch (error) {
        // Fall through to window.open when extension messaging is unavailable.
      }
    }
    if (typeof window.open === 'function') {
      window.open(targetUrl, '_blank', 'noopener');
      return true;
    }
    return false;
  }

  function getCssTimeMs(value: string, fallback: number): number {
    const raw = value.trim();
    if (!raw) {
      return fallback;
    }
    const numeric = Number.parseFloat(raw);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return raw.endsWith('s') && !raw.endsWith('ms') ? numeric * 1000 : numeric;
  }

  function getTextSwapDurationMs(): number {
    if (typeof getComputedStyle !== 'function' || !document.documentElement) {
      return TEXT_SWAP_FALLBACK_DURATION_MS;
    }
    return getCssTimeMs(
      getComputedStyle(document.documentElement).getPropertyValue('--text-swap-dur'),
      TEXT_SWAP_FALLBACK_DURATION_MS
    );
  }

  function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMacPlatform(): boolean {
    return /Mac|iPhone|iPad|iPod/i.test(String(navigator.platform || ''));
  }

  function getDefaultShortcutValue(): string {
    return isMacPlatform() ? 'Command+Shift+K' : 'Ctrl+Shift+K';
  }

  function getDefaultShortcutLabel(): string {
    return formatShortcutForDisplay(getDefaultShortcutValue()) || getDefaultShortcutValue();
  }

  function normalizeShortcutValue(value: string): string {
    return value.trim().replace(/\s*\+\s*/g, '+');
  }

  function getShortcutDisplayTokens(shortcut: string): string[] {
    return MODEL.getShortcutDisplayTokens(shortcut, { preferSymbols: isMacPlatform() });
  }

  function formatShortcutForDisplay(shortcut: string): string {
    return MODEL.formatShortcutForDisplay(shortcut, { preferSymbols: isMacPlatform() });
  }

  function loadCurrentShortcut(callback: (shortcut: string) => void): void {
    const chromeApi = getChromeApi();
    const fallback = getDefaultShortcutValue();
    if (!chromeApi || !chromeApi.commands || typeof chromeApi.commands.getAll !== 'function') {
      callback(fallback);
      return;
    }
    try {
      chromeApi.commands.getAll((commands) => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          callback(fallback);
          return;
        }
        const items = Array.isArray(commands) ? commands : [];
        const command = items.find((item) => item && item.name === SHOW_SEARCH_COMMAND_NAME);
        const shortcut = command && typeof command.shortcut === 'string'
          ? command.shortcut
          : '';
        callback(shortcut || fallback);
      });
    } catch (error) {
      callback(fallback);
    }
  }

  function shortcutHotkeyMatchesEvent(shortcut: string, event: KeyboardEvent): boolean {
    return MODEL.shortcutHotkeyMatchesEvent(shortcut, event);
  }

  // Key events target elements, never text nodes.
  function isEditableTarget(target: EventTarget | null): boolean {
    return isElementNode(target) &&
      Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
  }

  function updateCurrentShortcut(shortcut: string, shouldRender: boolean): void {
    const value = shortcut || getDefaultShortcutValue();
    const nextShortcutLabel = formatShortcutForDisplay(value) || getDefaultShortcutLabel();
    const changed = value !== currentShortcutValue || nextShortcutLabel !== currentShortcutLabel;
    currentShortcutValue = value;
    currentShortcutLabel = nextShortcutLabel;
    if (changed && shouldRender && blueprint && state) {
      render();
    }
  }

  function refreshCurrentShortcut(shouldRender: boolean): void {
    loadCurrentShortcut((shortcut) => {
      updateCurrentShortcut(shortcut, shouldRender);
    });
  }

  function getCurrentOnboardingTab(done: (tab: chrome.tabs.Tab | null) => void): void {
    const chromeApi = getChromeApi();
    if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.getCurrent !== 'function') {
      done(null);
      return;
    }
    try {
      chromeApi.tabs.getCurrent((tab) => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          done(null);
          return;
        }
        done(tab || null);
      });
    } catch (error) {
      done(null);
    }
  }

  function getOnboardingTabZoomFactor(tabId: number | null, done: (zoomFactor: number) => void): void {
    const chromeApi = getChromeApi();
    if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.getZoom !== 'function' || typeof tabId !== 'number') {
      done(1);
      return;
    }
    try {
      chromeApi.tabs.getZoom(tabId, (zoomFactor) => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          done(1);
          return;
        }
        const zoom = Number(zoomFactor);
        done(Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
      });
    } catch (error) {
      done(1);
    }
  }

  function getOnboardingOverlayTabs(
    currentTabId: number | null,
    done: (tabs: readonly OverlayTab[], currentTabId: number | null) => void
  ): void {
    const chromeApi = getChromeApi();
    if (!chromeApi || !chromeApi.runtime || typeof chromeApi.runtime.sendMessage !== 'function') {
      done([], currentTabId);
      return;
    }
    const request: BackgroundRequest<'getTabsForOverlay'> = { action: 'getTabsForOverlay' };
    if (typeof currentTabId === 'number') {
      request.currentTabId = currentTabId;
    }
    try {
      LumnoMessaging.sendBackgroundMessage(chromeApi.runtime, request, (response) => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          done([], currentTabId);
          return;
        }
        const tabs = response && Array.isArray(response.tabs) ? response.tabs : [];
        const responseCurrentTabId = response && typeof response.currentTabId === 'number'
          ? response.currentTabId
          : currentTabId;
        done(tabs, responseCurrentTabId);
      });
    } catch (error) {
      done([], currentTabId);
    }
  }

  function triggerOnboardingSearchOverlay(): void {
    const toggleOverlay = window._x_extension_toggleSearchOverlay_2026_unique_;
    if (typeof toggleOverlay !== 'function') {
      return;
    }
    getCurrentOnboardingTab((tab) => {
      const currentTabId = tab && typeof tab.id === 'number' ? tab.id : null;
      getOnboardingTabZoomFactor(currentTabId, (tabZoomFactor) => {
        getOnboardingOverlayTabs(currentTabId, (tabs, responseCurrentTabId) => {
          toggleOverlay(tabs, {
            tabZoomFactor,
            currentTabId: typeof responseCurrentTabId === 'number' ? responseCurrentTabId : currentTabId,
            currentTabUrl: window.location && window.location.href ? window.location.href : ''
          });
        });
      });
    });
  }

  function handleOnboardingCommandMessage(
    request: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (reply: OkReply) => void
  ): boolean {
    if (!isRecord(request) || request.action !== ONBOARDING_SEARCH_OVERLAY_COMMAND_ACTION) {
      return false;
    }
    const requestedTabId = Number.isFinite(Number(request.tabId)) ? Number(request.tabId) : null;
    getCurrentOnboardingTab((tab) => {
      const currentTabId = tab && typeof tab.id === 'number' ? tab.id : null;
      if (typeof requestedTabId === 'number' && typeof currentTabId === 'number' && currentTabId !== requestedTabId) {
        if (typeof sendResponse === 'function') {
          sendResponse({ ok: false, reason: 'tab-mismatch' });
        }
        return;
      }
      triggerOnboardingSearchOverlay();
      if (typeof sendResponse === 'function') {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  // A translated language's copy ships as JSON beside this page; without
  // it the page falls back to English.
  function loadOnboardingLocaleText(locale: string): Promise<void> {
    if (!MODEL.needsOnboardingLocaleText(locale) || typeof fetch !== 'function') {
      return Promise.resolve();
    }
    return fetch(`locales/${locale}.json`)
      .then((response) => response.json())
      .then((translations: unknown) => MODEL.registerOnboardingLocaleText(locale, translations))
      .catch(() => {});
  }

  function getRuntimeLocale(callback: (locale: string) => void): void {
    const chromeApi = getChromeApi();
    const fromParam = params.get('locale') || params.get('lang') || '';
    if (fromParam) {
      callback(MODEL.normalizeLocale(fromParam));
      return;
    }
    if (!chromeApi || !chromeApi.storage) {
      callback(MODEL.normalizeLocale(getBrowserLocale()));
      return;
    }
    const storageArea = LumnoSettingsStorage.createProviderStorageRuntime(chromeApi).area;
    if (!storageArea || typeof storageArea.get !== 'function') {
      callback(MODEL.normalizeLocale(getBrowserLocale()));
      return;
    }
    try {
      storageArea.get([LANGUAGE_STORAGE_KEY], (result) => {
        const runtimeError = chromeApi.runtime ? chromeApi.runtime.lastError : null;
        const stored = !runtimeError && result ? result[LANGUAGE_STORAGE_KEY] : '';
        const locale = typeof stored === 'string' && stored && stored !== 'system'
          ? stored
          : getBrowserLocale();
        callback(MODEL.normalizeLocale(locale));
      });
    } catch (e) {
      callback(MODEL.normalizeLocale(getBrowserLocale()));
    }
  }

  function getBrowserLocale(): string {
    const chromeApi = getChromeApi();
    if (chromeApi && chromeApi.i18n && typeof chromeApi.i18n.getUILanguage === 'function') {
      try {
        return chromeApi.i18n.getUILanguage() || navigator.language || 'en';
      } catch (error) {
        return navigator.language || 'en';
      }
    }
    return navigator.language || 'en';
  }

  function getBrowserTooltipText(browserAvatars: InteractionBrowserAvatars | undefined): string {
    const browsers = browserAvatars && browserAvatars.browsers ? browserAvatars.browsers : [];
    return browsers.map((browser) => browser.name).filter(Boolean)
      .join(getRuntimeMiscText('browserNameSeparator', ', '));
  }

  function positionBrowserAvatarTooltip(element: HTMLElement | null, target: HTMLElement): void {
    if (!element) {
      return;
    }
    element.style.setProperty('max-width', '220px');
    element.style.setProperty('width', 'max-content');
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = element.getBoundingClientRect();
    const margin = 8;
    const spacing = 8;
    let left = targetRect.right + spacing;
    let top = targetRect.top + ((targetRect.height - tooltipRect.height) / 2);
    if (left + tooltipRect.width > window.innerWidth - margin) {
      left = targetRect.left - tooltipRect.width - spacing;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    element.style.setProperty('left', `${Math.round(left)}px`);
    element.style.setProperty('top', `${Math.round(top)}px`);
  }

  function renderInfoTooltipContent(
    element: HTMLElement | null,
    infoTooltip: InteractionInfoTooltip,
    browserAvatars: InteractionBrowserAvatars | undefined
  ): void {
    if (!element) {
      return;
    }
    const tooltipView = globalThis.LumnoTooltipView;
    const isBrowserAvatarTooltip = infoTooltip.type === 'browser-avatars';
    element.classList.toggle(
      'onboarding-browser-tooltip',
      isBrowserAvatarTooltip
    );
    if (!isBrowserAvatarTooltip || !tooltipView) {
      return;
    }
    element.dataset.reactIsland = 'onboarding-info-tooltip-content';
    tooltipView.renderBrowserAvatarTooltip(element, {
      browsers: browserAvatars && browserAvatars.browsers ? browserAvatars.browsers : [],
      browserNameSeparator: getRuntimeMiscText(
        'browserNameSeparator',
        ', '
      ),
      browserAvatarSuffix: getRuntimeMiscText(
        'browserAvatarSuffix',
        'and more'
      )
    });
  }

  function showOnboardingInfoTooltip(
    button: HTMLElement,
    infoTooltip: InteractionInfoTooltip,
    browserAvatars: InteractionBrowserAvatars | undefined
  ): void {
    const text = String(infoTooltip.text || getBrowserTooltipText(browserAvatars) || '').trim();
    if (!text) {
      return;
    }
    const options = {
      placement: 'top',
      maxWidth: 360,
      spacing: infoTooltip.type === 'browser-avatars' ? 24 : 8
    };
    const element = onboardingInfoTooltipController.show(button, text, options);
    renderInfoTooltipContent(element, infoTooltip, browserAvatars);
    if (infoTooltip.type === 'browser-avatars') {
      positionBrowserAvatarTooltip(element, button);
    } else {
      LumnoTooltip.position(element, button, options);
    }
  }

  function hideOnboardingInfoTooltip(): void {
    onboardingInfoTooltipController.hide();
  }

  function getActionButtonTooltipMaxWidth(button: HTMLElement): number {
    const value = Number.parseInt(button.dataset.tooltipMaxWidth || '', 10);
    return Number.isFinite(value) && value > 0 ? value : 360;
  }

  function showActionButtonTooltip(button: HTMLElement): void {
    const text = String(button.dataset.tooltip || '').trim();
    if (!text) {
      return;
    }
    const maxWidth = getActionButtonTooltipMaxWidth(button);
    actionTooltipController.show(button, text, {
      placement: 'top',
      maxWidth,
      spacing: 8
    });
  }

  function hideActionButtonTooltip(): void {
    actionTooltipController.hide();
  }



  function toggleInteractionAccordion(accordionId: string | undefined): void {
    const id = String(accordionId || '').trim();
    if (!id) {
      return;
    }
    expandedInteractionAccordionId = expandedInteractionAccordionId === id ? '' : id;
    renderCopyPanel();
  }


  function mixSiteSearchDemoColor(color: Rgb, target: Rgb, amount: number): number[] {
    return [
      Math.round(color[0] + (target[0] - color[0]) * amount),
      Math.round(color[1] + (target[1] - color[1]) * amount),
      Math.round(color[2] + (target[2] - color[2]) * amount)
    ];
  }

  function getSiteSearchDemoBrandAccentRgb(item: SiteSearchCase): Rgb {
    return item.brandAccentRgb.length === 3 ? item.brandAccentRgb : [59, 130, 246];
  }

  function getSiteSearchDemoLuminance(rgb: Rgb): number {
    if (rgb.length !== 3) {
      return 0;
    }
    const channels = rgb.map((value) => {
      const channel = Number(value) / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function getSiteSearchDemoReadableTextColor(bgRgb: Rgb): string {
    const darkText = [17, 24, 39];
    const lightText = [248, 250, 252];
    const bgLum = getSiteSearchDemoLuminance(bgRgb);
    const darkLum = getSiteSearchDemoLuminance(darkText);
    const lightLum = getSiteSearchDemoLuminance(lightText);
    const contrastWithDark = (Math.max(bgLum, darkLum) + 0.05) / (Math.min(bgLum, darkLum) + 0.05);
    const contrastWithLight = (Math.max(bgLum, lightLum) + 0.05) / (Math.min(bgLum, lightLum) + 0.05);
    return contrastWithDark >= contrastWithLight ? '#111827' : '#F8FAFC';
  }

  function normalizeSiteSearchDemoAccentRgb(rgb: Rgb): Rgb {
    const accentRgb = rgb.length === 3 ? rgb : [59, 130, 246];
    const luminance = getSiteSearchDemoLuminance(accentRgb);
    if (luminance < 0.12) {
      return mixSiteSearchDemoColor(accentRgb, [255, 255, 255], 0.55);
    }
    if (luminance > 0.9) {
      return mixSiteSearchDemoColor(accentRgb, [0, 0, 0], 0.2);
    }
    return accentRgb;
  }

  function getSiteSearchDemoTheme(item: SiteSearchCase): SiteSearchTheme {
    const accentRgb = normalizeSiteSearchDemoAccentRgb(getSiteSearchDemoBrandAccentRgb(item));
    const base = [255, 255, 255];
    const markBg = mixSiteSearchDemoColor(accentRgb, base, 0.78);
    const keyBg = mixSiteSearchDemoColor(accentRgb, base, 0.9);
    return {
      accentRgb,
      highlightBg: mixSiteSearchDemoColor(accentRgb, base, 0.86),
      highlightBorder: mixSiteSearchDemoColor(accentRgb, base, 0.62),
      markBg,
      markText: getSiteSearchDemoReadableTextColor(markBg),
      keyBg,
      keyText: getSiteSearchDemoReadableTextColor(keyBg),
      keyBorder: mixSiteSearchDemoColor(accentRgb, base, 0.18),
      buttonText: getSiteSearchDemoLuminance(accentRgb) > 0.8
        ? mixSiteSearchDemoColor(accentRgb, [0, 0, 0], 0.6)
        : accentRgb,
      buttonBg: mixSiteSearchDemoColor(accentRgb, base, 0.94),
      buttonBorder: mixSiteSearchDemoColor(accentRgb, base, 0.7)
    };
  }


  function getBookmarkFocusModel(): VisualSurfaceRenderModel['bookmarkFocus'] {
    return {
      hoverLeadMs: LUMNO_OVERLAY_HOVER_LEAD_MS,
      hoverStartMs: LUMNO_OVERLAY_HOVER_START_MS,
      hoverStepMs: LUMNO_OVERLAY_HOVER_STEP_MS,
      hoverWrapStepMs: LUMNO_OVERLAY_HOVER_WRAP_STEP_MS,
      openLabel: getRuntimeMiscText('openLabel', 'Open'),
      overlayAriaLabel: 'Lumno overlay demo',
      panelId: ONBOARDING_OVERLAY_DEMO_PANEL_ID,
      query: getLumnoOverlayQuery(),
      reducedMotion: prefersReducedMotion(),
      removeHistoryLabel: getRuntimeMiscText('removeHistoryLabel', 'Remove history item'),
      results: runtimeCopy.lumnoOverlay.results,
      searchAriaLabel: 'Search Lumno demo',
      settingsLabel: getRuntimeMiscText('settingsLabel', 'Settings')
    };
  }

  function getNewtabPreviewModel(): VisualSurfaceRenderModel['newtabPreview'] {
    return {
      ariaLabel: getRuntimeMiscText('newtabPreviewAriaLabel', 'Lumno new tab preview'),
      bookmarkManagerLabel: getRuntimeMiscText('bookmarkManagerLabel', 'Open bookmark manager'),
      bookmarks: runtimeCopy.newtabPreview.bookmarks,
      bookmarksSectionTitle: getNewtabPreviewSectionTitle('bookmarks', 'Bookmarks'),
      hoverHoldMs: NEWTAB_PREVIEW_HOVER_HOLD_MS,
      hoverMoveMs: NEWTAB_PREVIEW_HOVER_MOVE_MS,
      hoverSettleMs: NEWTAB_PREVIEW_HOVER_SETTLE_MS,
      hoverStartMs: NEWTAB_PREVIEW_HOVER_START_MS,
      nextLabelTemplate: getRuntimeMiscText('nextLabelTemplate', '{label} next'),
      openItemAriaTemplate: getRuntimeMiscText('openItemAriaTemplate', 'Open {title}'),
      previousLabelTemplate: getRuntimeMiscText('previousLabelTemplate', '{label} previous'),
      query: String(runtimeCopy.newtabPreview.query || ''),
      recentSectionTitle: getNewtabPreviewSectionTitle('recent', 'Recent'),
      recentSites: getNewtabPreviewRecentSites(),
      reducedMotion: prefersReducedMotion(),
      searchAriaLabel: getRuntimeMiscText('newtabSearchPreviewAriaLabel', 'Lumno new tab search preview'),
      searchPlaceholder: getRuntimeMiscText('newtabSearchPlaceholder', 'Search or enter URL…'),
      sectionModeBookmarksLabel: getRuntimeMiscText('sectionModeBookmarksLabel', 'Bookmarks display mode'),
      sectionModeRecentLabel: getRuntimeMiscText('sectionModeRecentLabel', 'Recent display mode'),
      settingsLabel: getRuntimeMiscText('settingsLabel', 'Settings'),
      visitLabel: getRuntimeMiscText('goLabel', 'Visit'),
      wordmarkSrc: NEWTAB_PREVIEW_WORDMARK_SRC
    };
  }

  function getVisualSurfaceModel(kind: string): VisualSurfaceRenderModel {
    return {
      ariaLabel: 'Lumno',
      bookmarkFocus: getBookmarkFocusModel(),
      butterflyDValues: LUMNO_WEB_BUTTERFLY_D_VALUES,
      butterflyRestPath: LUMNO_WEB_BUTTERFLY_REST_PATH,
      featureAwards: runtimeCopy.featureAwards,
      featureCardAriaJoiner: getRuntimeMiscText('featureCardAriaJoiner', ', '),
      featureCards: runtimeCopy.featureCards,
      homepagePipArtSrc: HOMEPAGE_PIP_ART_SRC,
      kind,
      newtabPreview: getNewtabPreviewModel(),
      newtabFiltersArtSrc: NEWTAB_FILTERS_ART_SRC,
      practicalFeaturesAriaLabel: getRuntimeMiscText('practicalFeaturesAriaLabel', 'Lumno practical features'),
      principlesAriaLabel: getRuntimeMiscText('principlesAriaLabel', 'Lumno principles'),
      siteSearchCases: runtimeCopy.siteSearchDemo.cases.map((item) => (
        Object.assign({}, item, { theme: getSiteSearchDemoTheme(item) })
      )),
      siteSearchDemoAriaLabel: getRuntimeMiscText('siteSearchDemoAriaLabel', 'Lumno site search demo'),
      siteSearchOpenLabel: getRuntimeMiscText('openLabel', 'Open'),
      siteSearchSettingsLabel: getRuntimeMiscText('settingsLabel', 'Settings'),
      siteSearchTabHintTemplate: String(
        runtimeCopy.siteSearchDemo.tabHintTemplate || 'Search with {provider}'
      ),
      wordmarkSrc: LUMNO_WEB_WORDMARK_SRC
    };
  }

  function renderVisualPanel(slide: OnboardingSlide): void {
    visualPanelController.render({
      slideId: slide.id,
      kind: slide.visual.kind,
      surface: slide.visual.visible ? getVisualSurfaceModel(slide.visual.kind) : null,
      cursor: {
        enabled: slide.cursor.enabled,
        mode: slide.cursor.enabled ? slide.id : ''
      },
      exiting: visualExiting
    });
  }

  function prepareVisualExit(nextState: OnboardingState): void {
    if (!blueprint || !state || !nextState || prefersReducedMotion()) {
      return;
    }
    const currentSlide = MODEL.getSlideByIndex(blueprint, state.index);
    const nextSlide = MODEL.getSlideByIndex(blueprint, nextState.index);
    const shouldBlurOut =
      currentSlide &&
      nextSlide &&
      currentSlide.visual &&
      nextSlide.visual &&
      currentSlide.visual.kind === 'bookmark-focus-surface' &&
      nextSlide.visual.kind === 'lumno-web-wordmark-surface';
    if (!shouldBlurOut || !currentSlide) {
      return;
    }
    visualExiting = true;
    renderVisualPanel(currentSlide);
  }

  function getCopyPanelModel(slide: OnboardingSlide, slideCount: number, index: number): CopyPanelModel {
    const pageCount = Math.max(1, slideCount - 1);
    const currentPageIndex = Math.max(0, index - 1);
    const pageStripHidden = index <= 0;
    if (index !== pageStripIndex) {
      pageStripEntering = !pageStripHidden && pageStripIndex <= 0;
      pageStripIndex = index;
    }
    return {
      slideId: slide.id,
      pageStrip: {
        pageCount,
        currentPageIndex,
        hidden: pageStripHidden,
        entering: pageStripEntering,
        ariaLabel: formatRuntimeTemplate(
          getRuntimeMiscText('pageStripAriaTemplate', 'Onboarding navigation, page {current} of {total}'),
          { current: currentPageIndex + 1, total: pageCount }
        ),
        segmentAriaLabels: Array.from({ length: pageCount }, (_, pageIndex) => formatRuntimeTemplate(
          getRuntimeMiscText('pageSegmentAriaTemplate', 'Page {page}'),
          { page: pageIndex + 1 }
        ))
      },
      heading: {
        cycleFirstDelayMs: TITLE_CYCLE_FIRST_DELAY_MS,
        cycleIntervalMs: TITLE_CYCLE_INTERVAL_MS,
        eyebrow: String(slide.copy.eyebrow || ''),
        reducedMotion: prefersReducedMotion(),
        swapDurationMs: getTextSwapDurationMs(),
        title: String(slide.copy.title || ''),
        titleCycle: slide.copy.titleCycle || null,
        titleLines: slide.copy.titleLines || [],
        titleLogo: slide.copy.titleLogo || null
      },
      body: {
        note: String(slide.copy.note || ''),
        shortcutLabel: currentShortcutLabel,
        shortcutPlaceholder: SHORTCUT_PLACEHOLDER,
        shortcutTokens: getShortcutDisplayTokens(currentShortcutValue),
        shortcutValue: normalizeShortcutValue(currentShortcutValue),
        value: String(slide.copy.body || '')
      },
      interactions: {
        slots: slide.left.interactionSlots,
        expandedAccordionId: expandedInteractionAccordionId
      },
      actions: slide.actions,
      copySwap
    };
  }

  // Redraws the copy column; an info tooltip left open would point at a
  // row that may have moved.
  function renderCopyPanel(): void {
    if (!blueprint || !state) {
      return;
    }
    const slide = MODEL.getSlideByIndex(blueprint, state.index);
    if (!slide) {
      return;
    }
    hideOnboardingInfoTooltip();
    copyPanelController.render(getCopyPanelModel(slide, blueprint.slides.length, state.index));
    scheduleTitleFitUpdate();
  }

  function getTitle(): HTMLElement | null {
    return getHtmlElement(document, 'onboarding-title');
  }

  function getTitleFitLines(): Element[] {
    const title = getTitle();
    if (!title) {
      return [];
    }
    const lines = Array.from(title.querySelectorAll('.title-line'));
    return lines.length > 0 ? lines : [title];
  }

  function updateTitleFitScale(): void {
    const title = getTitle();
    if (!title) {
      return;
    }
    title.style.setProperty('--title-fit-scale', '1');
    if (title.dataset.empty === 'true') {
      return;
    }
    const availableWidth = title.clientWidth;
    if (!availableWidth) {
      return;
    }
    const widestLine = getTitleFitLines().reduce((maxWidth, line) => {
      return Math.max(maxWidth, line.scrollWidth || line.getBoundingClientRect().width || 0);
    }, 0);
    if (!widestLine) {
      return;
    }
    // Translated titles can run much longer than the English or Chinese
    // ones, so the floor is low enough for them to still fit on one line.
    const scale = Math.max(0.6, Math.min(1, availableWidth / widestLine));
    title.style.setProperty('--title-fit-scale', scale.toFixed(3));
  }

  function scheduleTitleFitUpdate(): void {
    if (typeof window.requestAnimationFrame !== 'function') {
      updateTitleFitScale();
      return;
    }
    if (titleFitFrame) {
      window.cancelAnimationFrame(titleFitFrame);
    }
    titleFitFrame = window.requestAnimationFrame(() => {
      titleFitFrame = 0;
      updateTitleFitScale();
    });
  }

  function isFrameScaledOnboardingLayout(): boolean {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 1240px) and (min-width: 860px), (max-height: 760px) and (min-height: 560px) and (min-width: 860px)').matches;
  }

  function isStackedOnboardingLayout(): boolean {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 859px), (max-height: 559px)').matches;
  }

  function resetStackedLayoutScroll(): void {
    if (!root || !isStackedOnboardingLayout()) {
      return;
    }
    root.scrollTop = 0;
    if (typeof window.requestAnimationFrame !== 'function') {
      return;
    }
    window.requestAnimationFrame(() => {
      if (!root || !isStackedOnboardingLayout()) {
        return;
      }
      root.scrollTop = 0;
    });
  }

  function updateOnboardingFrameScale(): void {
    if (!root) {
      return;
    }
    const shouldScaleFrame = isFrameScaledOnboardingLayout();
    const viewportWidth = window.innerWidth || root.clientWidth || ONBOARDING_FRAME_WIDTH;
    const viewportHeight = window.innerHeight || root.clientHeight || ONBOARDING_FRAME_HEIGHT;
    const scale = shouldScaleFrame
      ? Math.max(0.1, Math.min(1, viewportWidth / ONBOARDING_FRAME_WIDTH, viewportHeight / ONBOARDING_FRAME_HEIGHT))
      : 1;
    root.style.setProperty('--onboarding-frame-scale', scale.toFixed(3));
    root.style.setProperty('--onboarding-frame-rendered-width', `${(ONBOARDING_FRAME_WIDTH * scale).toFixed(2)}px`);
    root.style.setProperty('--onboarding-frame-rendered-height', `${(ONBOARDING_FRAME_HEIGHT * scale).toFixed(2)}px`);
  }

  function getCompactCopyContentHeight(): number {
    if (!copyPanel) {
      return 0;
    }
    const panelStyle = window.getComputedStyle(copyPanel);
    const paddingTop = parseFloat(panelStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(panelStyle.paddingBottom) || 0;
    const rowGap = parseFloat(panelStyle.rowGap || panelStyle.gap) || 0;
    // The rows on screen.
    const rows: HTMLElement[] = [];
    ['.copy-block', '.interaction-slots', '.onboarding-copy-actions'].forEach((selector) => {
      const element = queryHtmlElement(copyPanel, selector);
      if (!element || element.hidden) {
        return;
      }
      const elementStyle = window.getComputedStyle(element);
      if (elementStyle.display !== 'none' && elementStyle.visibility !== 'hidden') {
        rows.push(element);
      }
    });
    const rowsHeight = rows.reduce((sum, element) => (
      sum + element.getBoundingClientRect().height
    ), 0);
    return paddingTop + paddingBottom + rowsHeight + (Math.max(0, rows.length - 1) * rowGap);
  }

  function updateVisualCanvasScale(): void {
    if (!root || !visualSlot || !visualPanel || !visualCanvas) {
      return;
    }
    updateOnboardingFrameScale();
    const rect = visualSlot.getBoundingClientRect();
    const isCompactLayout = isStackedOnboardingLayout();
    const viewportWidth = window.innerWidth || root.clientWidth || VISUAL_CANVAS_WIDTH;
    const viewportHeight = window.innerHeight || root.clientHeight || VISUAL_CANVAS_HEIGHT;
    const availableWidth = isCompactLayout
      ? Math.min(viewportWidth, visualSlot.clientWidth || rect.width || viewportWidth)
      : (visualSlot.clientWidth || rect.width || 0);
    if (isCompactLayout) {
      // A previous oversized visual squeezes the copy rows (min-height: 0), so
      // collapse it first and measure the copy at its natural height.
      root.style.setProperty('--onboarding-visual-rendered-height', '0px');
    }
    const compactVisualHeight = Math.max(0, viewportHeight - getCompactCopyContentHeight());
    const availableHeight = isCompactLayout
      ? compactVisualHeight
      : (visualSlot.clientHeight || rect.height || 0);
    if (!availableWidth || (!isCompactLayout && !availableHeight)) {
      return;
    }
    const scale = isCompactLayout
      ? Math.max(0.1, Math.min(availableWidth / VISUAL_CANVAS_WIDTH, availableHeight / VISUAL_CANVAS_HEIGHT))
      : Math.max(0.1, Math.min(1, availableWidth / VISUAL_CANVAS_WIDTH, availableHeight / VISUAL_CANVAS_HEIGHT));
    root.style.setProperty('--onboarding-visual-scale', scale.toFixed(3));
    root.style.setProperty('--onboarding-visual-rendered-width', `${(VISUAL_CANVAS_WIDTH * scale).toFixed(2)}px`);
    root.style.setProperty('--onboarding-visual-rendered-height', `${(VISUAL_CANVAS_HEIGHT * scale).toFixed(2)}px`);
  }

  function scheduleVisualCanvasScaleUpdate(): void {
    if (!visualCanvas || typeof window.requestAnimationFrame !== 'function') {
      updateVisualCanvasScale();
      return;
    }
    if (visualScaleFrame) {
      window.cancelAnimationFrame(visualScaleFrame);
    }
    visualScaleFrame = window.requestAnimationFrame(() => {
      visualScaleFrame = 0;
      updateVisualCanvasScale();
    });
  }


  function render(): void {
    if (!blueprint || !state) {
      return;
    }
    const slide = MODEL.getSlideByIndex(blueprint, state.index);
    if (!slide || !root) {
      return;
    }
    root.dataset.activeSlide = slide.id;
    root.dataset.activeIndex = String(state.index);
    root.dataset.direction = state.direction;
    root.dataset.cursorReady = slide.cursor.enabled ? 'true' : 'false';
    root.dataset.visualVisible = slide.visual.visible ? 'true' : 'false';
    document.documentElement.lang = blueprint.htmlLang || 'en';
    document.title = `${blueprint.brand} Onboarding`;

    renderCopyPanel();
    // A new slide brings its visual in whole.
    visualExiting = false;
    renderVisualPanel(slide);
    scheduleVisualCanvasScaleUpdate();
  }


  function clearCursorTransitionStart(): void {
    if (!root) {
      return;
    }
    root.style.removeProperty('--onboarding-cursor-transition-left');
    root.style.removeProperty('--onboarding-cursor-transition-top');
    root.style.removeProperty('--onboarding-cursor-transition-transform');
  }

  function captureCursorTransitionStart(nextState: OnboardingState): void {
    const cursorLayer = getHtmlElement(document, 'onboarding-cursor-layer');
    if (!root || !blueprint || !state || !nextState || !cursorLayer) {
      clearCursorTransitionStart();
      return;
    }
    const currentSlide = MODEL.getSlideByIndex(blueprint, state.index);
    const nextSlide = MODEL.getSlideByIndex(blueprint, nextState.index);
    const shouldCapture =
      currentSlide &&
      nextSlide &&
      (
        (currentSlide.id === 'intro' && nextSlide.id === 'setup') ||
        (currentSlide.id === 'setup' && nextSlide.id === 'search') ||
        (currentSlide.id === 'search' && nextSlide.id === 'newtab') ||
        (currentSlide.id === 'newtab' && nextSlide.id === 'finish')
      ) &&
      nextState.direction === 'forward';
    if (!shouldCapture) {
      clearCursorTransitionStart();
      return;
    }
    const cursor = cursorLayer.querySelector('.demo-cursor');
    if (!cursor) {
      clearCursorTransitionStart();
      return;
    }
    const style = getComputedStyle(cursor);
    const leftPx = Number.parseFloat(style.left);
    const topPx = Number.parseFloat(style.top);
    const layerWidth = cursorLayer.clientWidth;
    const layerHeight = cursorLayer.clientHeight;
    if (!Number.isFinite(leftPx) || !Number.isFinite(topPx) || !layerWidth || !layerHeight) {
      clearCursorTransitionStart();
      return;
    }
    const left = (leftPx / layerWidth) * 100;
    const top = (topPx / layerHeight) * 100;
    const transform = String(style.transform || '').trim();
    root.style.setProperty('--onboarding-cursor-transition-left', `${Math.max(0, Math.min(100, left)).toFixed(2)}%`);
    root.style.setProperty('--onboarding-cursor-transition-top', `${Math.max(0, Math.min(100, top)).toFixed(2)}%`);
    if (transform && transform !== 'none') {
      root.style.setProperty('--onboarding-cursor-transition-transform', transform);
    } else {
      root.style.removeProperty('--onboarding-cursor-transition-transform');
    }
  }

  function commitState(nextState: OnboardingState): void {
    state = nextState;
    syncOnboardingSlideParam(nextState.index);
    render();
    resetStackedLayoutScroll();
  }

  function animateCopySwap(nextState: OnboardingState): void {
    if (copySwapTimeout) {
      window.clearTimeout(copySwapTimeout);
      copySwapTimeout = 0;
    }
    if (prefersReducedMotion()) {
      copySwap = null;
      captureCursorTransitionStart(nextState);
      commitState(nextState);
      return;
    }
    prepareVisualExit(nextState);
    copySwap = 'exit';
    renderCopyPanel();
    copySwapTimeout = window.setTimeout(() => {
      copySwapTimeout = 0;
      captureCursorTransitionStart(nextState);
      // The new copy is placed where it slides in from, laid out there, then
      // released so it slides in.
      copySwap = 'enter-start';
      commitState(nextState);
      [getTitle(), getHtmlElement(document, 'onboarding-body')].forEach((element) => {
        if (element) {
          void element.offsetHeight;
        }
      });
      copySwap = 'enter';
      renderCopyPanel();
    }, getTextSwapDurationMs());
  }

  function dispatch(action: OnboardingEvent): void {
    if (!state || !blueprint) {
      return;
    }
    const nextState = MODEL.reduceOnboardingState(state, action);
    if (nextState.index === state.index || nextState.direction === 'none') {
      commitState(nextState);
      return;
    }
    animateCopySwap(nextState);
  }

  // Runs a slide action by its id; the click decides where a page opens.
  function runExtensionAction(id: string, event?: MouseEvent): void {
    if (!id) {
      return;
    }
    const disposition = NAVIGATION_DISPOSITION.getDisposition(event, 'newTab');
    if (id === 'next') {
      dispatch({ type: 'NEXT' });
      return;
    }
    if (id === 'prev') {
      dispatch({ type: 'PREV' });
      return;
    }
    if (id === 'openChromeWebStore') {
      openExternalTab(COMMUNITY_LINKS.getStoreListing().url, disposition);
      return;
    }
    if (id === 'openHelpCenter') {
      openExternalTab(COMMUNITY_LINKS.getHelpUrl(blueprint && blueprint.htmlLang), disposition);
      return;
    }
    if (id === 'openNewtab') {
      if (disposition !== 'backgroundTab') {
        if (navigateOnboardingToNewtab()) {
          return;
        }
      }
    }

    const chromeApi = getChromeApi();
    const messageAction = ACTION_MESSAGE_BY_ID.get(id);
    if (!messageAction || !chromeApi || !chromeApi.runtime || typeof chromeApi.runtime.sendMessage !== 'function') {
      if (id === 'openSiteSearchOptions') {
        openSiteSearchOptionsFallback(disposition);
      }
      return;
    }
    try {
      LumnoMessaging.sendBackgroundMessage(chromeApi.runtime, {
        action: messageAction,
        disposition
      }, (response) => {
        const lastError = chromeApi.runtime && chromeApi.runtime.lastError;
        if (id === 'openSiteSearchOptions' && (lastError || !response || response.ok === false)) {
          openSiteSearchOptionsFallback(disposition);
        }
      });
    } catch (error) {
      if (id === 'openSiteSearchOptions') {
        openSiteSearchOptionsFallback(disposition);
      }
    }
  }

  document.addEventListener('keydown', (event) => {
    if (!event || event.defaultPrevented) {
      return;
    }
    if (shortcutHotkeyMatchesEvent(currentShortcutValue, event)) {
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      triggerOnboardingSearchOverlay();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      dispatch({ type: 'NEXT' });
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      dispatch({ type: 'PREV' });
    } else if (event.key === 'Home') {
      event.preventDefault();
      dispatch({ type: 'HOME' });
    } else if (event.key === 'End') {
      event.preventDefault();
      dispatch({ type: 'END' });
    }
  });

  const initialChromeApi = getChromeApi();
  if (initialChromeApi &&
      initialChromeApi.runtime &&
      initialChromeApi.runtime.onMessage &&
      typeof initialChromeApi.runtime.onMessage.addListener === 'function') {
    initialChromeApi.runtime.onMessage.addListener(handleOnboardingCommandMessage);
  }

  scheduleTitleFitUpdate();
  scheduleVisualCanvasScaleUpdate();
  window.addEventListener('resize', () => {
    scheduleTitleFitUpdate();
    scheduleVisualCanvasScaleUpdate();
  });
  if (visualSlot && typeof ResizeObserver === 'function') {
    visualResizeObserver = new ResizeObserver(scheduleVisualCanvasScaleUpdate);
    visualResizeObserver.observe(visualSlot);
  }

  getRuntimeLocale((locale) => loadOnboardingLocaleText(locale).then(() => {
    blueprint = MODEL.getOnboardingBlueprint(locale);
    runtimeCopy = blueprint.runtimeCopy;
    const requestedIndex = Number(params.get('slide') || 0);
    state = MODEL.createOnboardingState(blueprint.slides.length, requestedIndex);
    render();
    refreshCurrentShortcut(true);
  }));

  window.addEventListener('focus', () => refreshCurrentShortcut(true), true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshCurrentShortcut(true);
    }
  }, true);
})();
