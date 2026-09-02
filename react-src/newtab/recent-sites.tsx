import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { useExclusiveAsyncAction } from '../shared/use-exclusive-async-action';
import { isElementTextTruncated } from '../shared/text-overflow';

type Translate = (key: string, fallback: string) => string;
type ThemeValue = unknown;

export interface RecentSiteItem {
  cardId?: string;
  url?: string;
  title?: string;
  siteName?: string;
  host?: string;
  lastVisitTime?: string | number;
  visitCount?: string | number;
  trackingEnabled?: boolean;
  updatePending?: boolean;
  updateHistory?: Array<{
    url?: string;
    title?: string;
    updatedAt?: string | number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface OwnExtensionDisplay {
  siteName: string;
  titleText: string;
  urlText: string;
}

interface PinResult {
  pinned?: boolean;
  limitReached?: boolean;
  tracking?: boolean;
}

interface ThemeSuggestion {
  type: 'history';
  url: string;
  title: string;
}

export interface RecentCardElement extends HTMLDivElement {
  _xHost?: string;
  _xTheme?: ThemeValue;
  _xActionText?: HTMLSpanElement | null;
  _xTitleText?: string;
  _xPinButton?: HTMLButtonElement | null;
  _xTrackingButton?: HTMLButtonElement | null;
  _xDisposeRecentCard?: () => void;
}

export interface RecentSitesViewOptions {
  documentObj?: Document;
  windowObj?: Window;
  grid?: HTMLElement | null;
  cards?: RecentCardElement[];
  t?: Translate;
  formatMessage?: (
    key: string,
    fallback: string,
    values: Record<string, string>
  ) => string;
  sanitizeDisplayText?: (value: unknown) => string;
  getOwnExtensionPageDisplay?: (
    url: string,
    title?: string
  ) => OwnExtensionDisplay | null;
  getHostFromUrl?: (url: string) => string;
  getCanonicalPageUrlForFavicon?: (url: string) => string;
  getBrowserPageFaviconUrl?: (url: string) => string;
  getSiteDisplayName?: (host: string, title?: string) => string;
  getUrlDisplay?: (url: string) => string;
  getRiSvg?: (id: string, sizeClass?: string) => string;
  attachFaviconWithFallbacks?: (
    image: HTMLImageElement,
    pageUrl: string,
    host: string,
    options: { primaryUrl: string }
  ) => void;
  getImmediateThemeForSuggestion?: (
    suggestion: ThemeSuggestion
  ) => ThemeValue;
  queueThemeForTarget?: (
    target: RecentCardElement,
    suggestion: ThemeSuggestion,
    onTheme: (theme: ThemeValue) => void,
    options: { priority: number }
  ) => void;
  applyCardTheme?: (
    target: RecentCardElement,
    theme: ThemeValue,
    host: string
  ) => void;
  getCurrentRecentCount?: () => number;
  isPinned?: (item: RecentSiteItem) => boolean;
  isTracked?: (item: RecentSiteItem) => boolean;
  getPinnedCount?: () => number;
  getMaxPinnedCount?: () => number;
  updatePinButton?: (
    button: HTMLButtonElement,
    pinned: boolean,
    limitReached: boolean
  ) => void;
  updateTrackingButton?: (
    button: HTMLButtonElement,
    tracked: boolean,
    pinned: boolean,
    limitReached: boolean
  ) => void;
  showToast?: (message: string, isError: boolean) => void;
  showTopActionTooltip?: (
    target: HTMLElement,
    message: string
  ) => void;
  hideTopActionTooltip?: () => void;
  navigateToUrl?: (url: string) => void;
  openUrl?: (
    url: string,
    options: { openInBackgroundTab: boolean }
  ) => void;
  acknowledgeUpdate?: (
    item: RecentSiteItem
  ) => unknown | Promise<unknown>;
  rememberTrackingTarget?: (item: RecentSiteItem) => unknown;
  bindCursorTooltip?: (
    target: HTMLElement,
    getText: () => string,
    options: {
      maxWidth: number;
      shouldShow: () => boolean;
    }
  ) => unknown;
  hideCursorTooltip?: () => void;
  togglePinned?: (
    item: RecentSiteItem
  ) => PinResult | null | Promise<PinResult | null>;
  toggleTracking?: (
    item: RecentSiteItem
  ) => PinResult | null | Promise<PinResult | null>;
  onItemContextMenu?: (payload: {
    event: MouseEvent;
    item: RecentSiteItem;
    element: RecentCardElement;
  }) => void;
}

export interface RecentSitesRenderState {
  signature?: string;
}

export interface RecentSitesRenderResult {
  changed: boolean;
  count: number;
  signature: string;
}

export interface RecentSitesViewController {
  clear(): void;
  render(
    items: RecentSiteItem[],
    state?: RecentSitesRenderState
  ): RecentSitesRenderResult;
  getSignature(items: RecentSiteItem[]): string;
  getCards(): RecentCardElement[];
}

interface NormalizedRecentSitesOptions {
  documentObj: Document;
  windowObj: Window;
  grid: HTMLElement;
  cards: RecentCardElement[];
  t: Translate;
  formatMessage: NonNullable<RecentSitesViewOptions['formatMessage']>;
  sanitizeDisplayText: NonNullable<RecentSitesViewOptions['sanitizeDisplayText']>;
  getOwnExtensionPageDisplay: NonNullable<
    RecentSitesViewOptions['getOwnExtensionPageDisplay']
  >;
  getHostFromUrl: NonNullable<RecentSitesViewOptions['getHostFromUrl']>;
  getCanonicalPageUrlForFavicon: NonNullable<
    RecentSitesViewOptions['getCanonicalPageUrlForFavicon']
  >;
  getBrowserPageFaviconUrl: NonNullable<
    RecentSitesViewOptions['getBrowserPageFaviconUrl']
  >;
  getSiteDisplayName: NonNullable<RecentSitesViewOptions['getSiteDisplayName']>;
  getUrlDisplay: NonNullable<RecentSitesViewOptions['getUrlDisplay']>;
  getRiSvg: NonNullable<RecentSitesViewOptions['getRiSvg']>;
  attachFaviconWithFallbacks: NonNullable<
    RecentSitesViewOptions['attachFaviconWithFallbacks']
  >;
  getImmediateThemeForSuggestion: NonNullable<
    RecentSitesViewOptions['getImmediateThemeForSuggestion']
  >;
  queueThemeForTarget: NonNullable<
    RecentSitesViewOptions['queueThemeForTarget']
  >;
  applyCardTheme: NonNullable<RecentSitesViewOptions['applyCardTheme']>;
  getCurrentRecentCount: NonNullable<
    RecentSitesViewOptions['getCurrentRecentCount']
  >;
  isPinned: NonNullable<RecentSitesViewOptions['isPinned']>;
  isTracked: NonNullable<RecentSitesViewOptions['isTracked']>;
  getPinnedCount: NonNullable<RecentSitesViewOptions['getPinnedCount']>;
  getMaxPinnedCount: NonNullable<RecentSitesViewOptions['getMaxPinnedCount']>;
  updatePinButton: NonNullable<RecentSitesViewOptions['updatePinButton']>;
  updateTrackingButton: NonNullable<
    RecentSitesViewOptions['updateTrackingButton']
  >;
  showToast: NonNullable<RecentSitesViewOptions['showToast']>;
  showTopActionTooltip: NonNullable<
    RecentSitesViewOptions['showTopActionTooltip']
  >;
  hideTopActionTooltip: NonNullable<
    RecentSitesViewOptions['hideTopActionTooltip']
  >;
  openUrl: NonNullable<RecentSitesViewOptions['openUrl']>;
  acknowledgeUpdate: NonNullable<
    RecentSitesViewOptions['acknowledgeUpdate']
  >;
  rememberTrackingTarget: NonNullable<
    RecentSitesViewOptions['rememberTrackingTarget']
  >;
  bindCursorTooltip: NonNullable<
    RecentSitesViewOptions['bindCursorTooltip']
  >;
  hideCursorTooltip: NonNullable<
    RecentSitesViewOptions['hideCursorTooltip']
  >;
  togglePinned: NonNullable<RecentSitesViewOptions['togglePinned']>;
  toggleTracking: NonNullable<RecentSitesViewOptions['toggleTracking']>;
  onItemContextMenu: NonNullable<
    RecentSitesViewOptions['onItemContextMenu']
  >;
}

interface RecentSiteCardProps {
  item: RecentSiteItem;
  index: number;
  options: NormalizedRecentSitesOptions;
}

interface ActivationEvent {
  metaKey?: boolean;
  ctrlKey?: boolean;
  button?: number;
}

const ROLLBACK_ANIMATION_MS = 220;
const HOVER_REENABLE_DELAY_MS = 1000;
const ROLLBACK_CLASS_NAME = 'x-nt-recent-card--rollback';

function fallbackFormatMessage(
  key: string,
  fallback: string,
  values: Record<string, string>
): string {
  let text = fallback || key || '';
  Object.keys(values || {}).forEach((name) => {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), values[name]);
  });
  return text;
}

export function getRecentSitesSignature(items: RecentSiteItem[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }
  return items.map((item, index) => {
    const url = item?.url ? String(item.url) : '';
    const title = item?.title ? String(item.title) : '';
    const siteName = item?.siteName ? String(item.siteName) : '';
    const lastVisitTime = item?.lastVisitTime
      ? String(item.lastVisitTime)
      : '';
    const visitCount = item?.visitCount ? String(item.visitCount) : '';
    const trackingEnabled = item?.trackingEnabled === true ? 'tracked' : '';
    const updatePending = item?.updatePending === true ? 'updated' : '';
    const updateHistory = Array.isArray(item?.updateHistory)
      ? item.updateHistory.map((entry) => `${entry?.url || ''}@${entry?.updatedAt || ''}`).join('|')
      : '';
    return `${index}::${url}::${title}::${siteName}::${lastVisitTime}::${visitCount}::${trackingEnabled}::${updatePending}::${updateHistory}`;
  }).join('\n');
}

function shouldOpenUrlInBackground(event: ActivationEvent | null): boolean {
  return Boolean(
    event &&
    (event.metaKey || event.ctrlKey || Number(event.button) === 1)
  );
}

function isRecentTitleTruncated(
  titleElement: HTMLDivElement | null
): boolean {
  return isElementTextTruncated(titleElement, { vertical: true });
}

function normalizeOptions(
  rawOptions: RecentSitesViewOptions
): NormalizedRecentSitesOptions | null {
  const documentObj = rawOptions.documentObj || globalThis.document;
  const windowObj = rawOptions.windowObj || globalThis.window;
  const grid = rawOptions.grid || null;
  if (!documentObj || !windowObj || !grid) {
    return null;
  }
  const navigateToUrl = typeof rawOptions.navigateToUrl === 'function'
    ? rawOptions.navigateToUrl
    : () => {};
  return {
    documentObj,
    windowObj,
    grid,
    cards: Array.isArray(rawOptions.cards) ? rawOptions.cards : [],
    t: typeof rawOptions.t === 'function'
      ? rawOptions.t
      : (_key, fallback) => fallback || '',
    formatMessage: typeof rawOptions.formatMessage === 'function'
      ? rawOptions.formatMessage
      : fallbackFormatMessage,
    sanitizeDisplayText:
      typeof rawOptions.sanitizeDisplayText === 'function'
        ? rawOptions.sanitizeDisplayText
        : (value) => String(value || ''),
    getOwnExtensionPageDisplay:
      typeof rawOptions.getOwnExtensionPageDisplay === 'function'
        ? rawOptions.getOwnExtensionPageDisplay
        : () => null,
    getHostFromUrl:
      typeof rawOptions.getHostFromUrl === 'function'
        ? rawOptions.getHostFromUrl
        : () => '',
    getCanonicalPageUrlForFavicon:
      typeof rawOptions.getCanonicalPageUrlForFavicon === 'function'
        ? rawOptions.getCanonicalPageUrlForFavicon
        : (url) => url || '',
    getBrowserPageFaviconUrl:
      typeof rawOptions.getBrowserPageFaviconUrl === 'function'
        ? rawOptions.getBrowserPageFaviconUrl
        : () => '',
    getSiteDisplayName:
      typeof rawOptions.getSiteDisplayName === 'function'
        ? rawOptions.getSiteDisplayName
        : (host, title) => title || host || '',
    getUrlDisplay:
      typeof rawOptions.getUrlDisplay === 'function'
        ? rawOptions.getUrlDisplay
        : (url) => url || '',
    getRiSvg:
      typeof rawOptions.getRiSvg === 'function'
        ? rawOptions.getRiSvg
        : () => '',
    attachFaviconWithFallbacks:
      typeof rawOptions.attachFaviconWithFallbacks === 'function'
        ? rawOptions.attachFaviconWithFallbacks
        : () => {},
    getImmediateThemeForSuggestion:
      typeof rawOptions.getImmediateThemeForSuggestion === 'function'
        ? rawOptions.getImmediateThemeForSuggestion
        : () => null,
    queueThemeForTarget:
      typeof rawOptions.queueThemeForTarget === 'function'
        ? rawOptions.queueThemeForTarget
        : () => {},
    applyCardTheme:
      typeof rawOptions.applyCardTheme === 'function'
        ? rawOptions.applyCardTheme
        : () => {},
    getCurrentRecentCount:
      typeof rawOptions.getCurrentRecentCount === 'function'
        ? rawOptions.getCurrentRecentCount
        : () => 4,
    isPinned:
      typeof rawOptions.isPinned === 'function'
        ? rawOptions.isPinned
        : () => false,
    isTracked:
      typeof rawOptions.isTracked === 'function'
        ? rawOptions.isTracked
        : () => false,
    getPinnedCount:
      typeof rawOptions.getPinnedCount === 'function'
        ? rawOptions.getPinnedCount
        : () => 0,
    getMaxPinnedCount:
      typeof rawOptions.getMaxPinnedCount === 'function'
        ? rawOptions.getMaxPinnedCount
        : () => 3,
    updatePinButton:
      typeof rawOptions.updatePinButton === 'function'
        ? rawOptions.updatePinButton
        : () => {},
    updateTrackingButton:
      typeof rawOptions.updateTrackingButton === 'function'
        ? rawOptions.updateTrackingButton
        : () => {},
    showToast:
      typeof rawOptions.showToast === 'function'
        ? rawOptions.showToast
        : () => {},
    showTopActionTooltip:
      typeof rawOptions.showTopActionTooltip === 'function'
        ? rawOptions.showTopActionTooltip
        : () => {},
    hideTopActionTooltip:
      typeof rawOptions.hideTopActionTooltip === 'function'
        ? rawOptions.hideTopActionTooltip
        : () => {},
    openUrl: typeof rawOptions.openUrl === 'function'
      ? rawOptions.openUrl
      : (url) => navigateToUrl(url),
    acknowledgeUpdate:
      typeof rawOptions.acknowledgeUpdate === 'function'
        ? rawOptions.acknowledgeUpdate
        : () => Promise.resolve(false),
    rememberTrackingTarget:
      typeof rawOptions.rememberTrackingTarget === 'function'
        ? rawOptions.rememberTrackingTarget
        : () => false,
    bindCursorTooltip:
      typeof rawOptions.bindCursorTooltip === 'function'
        ? rawOptions.bindCursorTooltip
        : () => null,
    hideCursorTooltip:
      typeof rawOptions.hideCursorTooltip === 'function'
        ? rawOptions.hideCursorTooltip
        : () => {},
    togglePinned:
      typeof rawOptions.togglePinned === 'function'
        ? rawOptions.togglePinned
        : () => Promise.resolve(null),
    toggleTracking:
      typeof rawOptions.toggleTracking === 'function'
        ? rawOptions.toggleTracking
        : () => Promise.resolve(null),
    onItemContextMenu:
      typeof rawOptions.onItemContextMenu === 'function'
        ? rawOptions.onItemContextMenu
        : () => {}
  };
}

function RecentSiteCard({
  item,
  index,
  options
}: RecentSiteCardProps) {
  const cardRef = useRef<RecentCardElement>(null);
  const faviconRef = useRef<HTMLImageElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const actionTextRef = useRef<HTMLSpanElement>(null);
  const pinButtonRef = useRef<HTMLButtonElement>(null);
  const trackingButtonRef = useRef<HTMLButtonElement>(null);
  const updateAcknowledgedRef = useRef(false);
  const isCardPointerActiveRef = useRef(false);
  const hasNavigateAttemptedRef = useRef(false);
  const tooltipSuppressedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const hoverLockedRef = useRef(false);
  const rollbackTimerRef = useRef(0);
  const hoverUnlockTimerRef = useRef(0);
  const backgroundGuardTimerRef = useRef(0);
  const navigationCleanupRef = useRef<(() => void) | null>(null);

  const itemUrl = String(item.url || '');
  const itemTitle = String(item.title || '');
  const ownExtensionDisplay = options.getOwnExtensionPageDisplay(
    itemUrl,
    itemTitle
  );
  const faviconPageUrl =
    options.getCanonicalPageUrlForFavicon(itemUrl) || itemUrl;
  const browserPageFaviconUrl =
    options.getBrowserPageFaviconUrl(faviconPageUrl);
  const canonicalHost = options.getHostFromUrl(faviconPageUrl);
  const host = ownExtensionDisplay
    ? 'lumno.kubai.design'
    : (
        canonicalHost ||
        String(item.host || '') ||
        options.getHostFromUrl(itemUrl) ||
        ''
      );
  const siteName = ownExtensionDisplay
    ? ownExtensionDisplay.siteName
    : options.getSiteDisplayName(host, itemTitle);
  const titleText = ownExtensionDisplay
    ? ownExtensionDisplay.titleText
    : (itemTitle || siteName || itemUrl);
  const safeTitleText = options.sanitizeDisplayText(titleText);
  const shouldEager = index < options.getCurrentRecentCount();
  const initiallyPinned = options.isPinned(item);
  const initiallyTracked = options.isTracked(item);
  const updatePending = item.updatePending === true;
  const [updateBadgeVisible, setUpdateBadgeVisible] = useState(updatePending);
  const immediateTheme = options.getImmediateThemeForSuggestion({
    type: 'history',
    url: faviconPageUrl,
    title: itemTitle
  });
  const cardAction = useExclusiveAsyncAction(
    (action: 'pin' | 'tracking') => action === 'tracking'
      ? options.toggleTracking(item)
      : options.togglePinned(item)
  );

  useEffect(() => {
    updateAcknowledgedRef.current = false;
    setUpdateBadgeVisible(updatePending);
  }, [itemUrl, updatePending]);

  function clearRollbackTimer(): void {
    if (!rollbackTimerRef.current) {
      return;
    }
    options.windowObj.clearTimeout(rollbackTimerRef.current);
    rollbackTimerRef.current = 0;
  }

  function clearHoverUnlockTimer(): void {
    if (!hoverUnlockTimerRef.current) {
      return;
    }
    options.windowObj.clearTimeout(hoverUnlockTimerRef.current);
    hoverUnlockTimerRef.current = 0;
  }

  function clearNavigationSignals(): void {
    const cleanup = navigationCleanupRef.current;
    navigationCleanupRef.current = null;
    cleanup?.();
  }

  function markNavigationSuccess(): void {
    clearRollbackTimer();
    clearHoverUnlockTimer();
    clearNavigationSignals();
  }

  function lockHoverAfterRollback(): void {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    clearHoverUnlockTimer();
    hoverLockedRef.current = true;
    card.classList.add(ROLLBACK_CLASS_NAME);
    hoverUnlockTimerRef.current = options.windowObj.setTimeout(() => {
      hoverUnlockTimerRef.current = 0;
      hoverLockedRef.current = false;
      card.classList.remove(ROLLBACK_CLASS_NAME);
    }, ROLLBACK_ANIMATION_MS + HOVER_REENABLE_DELAY_MS);
  }

  function bindNavigationSignals(): void {
    clearNavigationSignals();
    let active = true;
    const finishNavigation = () => {
      if (active) {
        markNavigationSuccess();
      }
    };
    const onVisibilityChange = () => {
      if (options.documentObj.visibilityState === 'hidden') {
        finishNavigation();
      }
    };
    navigationCleanupRef.current = () => {
      if (!active) {
        return;
      }
      active = false;
      options.documentObj.removeEventListener(
        'visibilitychange',
        onVisibilityChange
      );
      options.windowObj.removeEventListener('pagehide', finishNavigation);
    };
    options.documentObj.addEventListener(
      'visibilitychange',
      onVisibilityChange
    );
    options.windowObj.addEventListener('pagehide', finishNavigation, {
      once: true
    });
  }

  function scheduleRollbackIfPending(): void {
    clearRollbackTimer();
    rollbackTimerRef.current = options.windowObj.setTimeout(() => {
      rollbackTimerRef.current = 0;
      if (options.documentObj.visibilityState === 'hidden') {
        return;
      }
      lockHoverAfterRollback();
      hasNavigateAttemptedRef.current = false;
      clearNavigationSignals();
    }, 180);
  }

  function resetBackgroundOpenGuard(): void {
    if (backgroundGuardTimerRef.current) {
      options.windowObj.clearTimeout(backgroundGuardTimerRef.current);
    }
    backgroundGuardTimerRef.current = options.windowObj.setTimeout(() => {
      backgroundGuardTimerRef.current = 0;
      hasNavigateAttemptedRef.current = false;
    }, 0);
  }

  function navigateFromCard(event: ActivationEvent): void {
    const card = cardRef.current;
    tooltipSuppressedRef.current = true;
    options.hideTopActionTooltip();
    options.hideCursorTooltip();
    if (!card || hasNavigateAttemptedRef.current) {
      return;
    }
    hasNavigateAttemptedRef.current = true;
    if (!hoverLockedRef.current) {
      card.classList.remove(ROLLBACK_CLASS_NAME);
    }
    if (initiallyTracked) {
      try {
        options.rememberTrackingTarget(item);
      } catch {
        // Navigation should still proceed if recording the source tab fails.
      }
    }
    if (updatePending && !updateAcknowledgedRef.current) {
      updateAcknowledgedRef.current = true;
      setUpdateBadgeVisible(false);
      try {
        void Promise.resolve(options.acknowledgeUpdate(item)).catch(() => {});
      } catch {
        // Navigation should still proceed if persisting the read state fails.
      }
    }
    const openInBackgroundTab = shouldOpenUrlInBackground(event);
    if (!openInBackgroundTab) {
      bindNavigationSignals();
    }
    options.openUrl(itemUrl, { openInBackgroundTab });
    if (openInBackgroundTab) {
      resetBackgroundOpenGuard();
    } else {
      scheduleRollbackIfPending();
    }
  }

  function stopCardActivation(
    event:
      | ReactPointerEvent<HTMLButtonElement>
      | ReactMouseEvent<HTMLButtonElement>
      | ReactKeyboardEvent<HTMLButtonElement>
  ): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function showPinTooltip(): void {
    const button = pinButtonRef.current;
    const label =
      button?.getAttribute('data-tooltip') ||
      button?.getAttribute('aria-label') ||
      '';
    if (button && label) {
      options.showTopActionTooltip(button, label);
    }
  }

  function showTrackingTooltip(): void {
    const button = trackingButtonRef.current;
    const label =
      button?.getAttribute('data-tooltip') ||
      button?.getAttribute('aria-label') ||
      '';
    if (button && label) {
      options.showTopActionTooltip(button, label);
    }
  }

  async function handlePin(): Promise<void> {
    const button = pinButtonRef.current;
    const card = cardRef.current;
    if (!button || !card) {
      return;
    }
    if (
      !initiallyPinned &&
      options.getPinnedCount() >= options.getMaxPinnedCount()
    ) {
      options.showToast(
        options.t('recent_pin_limit_toast', '最多只能置顶 3 个卡片'),
        false
      );
      options.updatePinButton(button, false, true);
      return;
    }
    const outcome = await cardAction.run('pin');
    if (outcome.status === 'skipped') {
      return;
    }
    if (outcome.status === 'rejected') {
      options.showToast(
        options.t('toast_error', '操作失败，请重试'),
        true
      );
      return;
    }
    const result = outcome.value;
    if (!result || !card.isConnected) {
      return;
    }
    if (result.limitReached) {
      options.showToast(
        options.t('recent_pin_limit_toast', '最多只能置顶 3 个卡片'),
        false
      );
    }
    options.updatePinButton(
      button,
      Boolean(result.pinned),
      Boolean(!result.pinned && result.limitReached)
    );
  }

  async function handleTracking(): Promise<void> {
    const button = trackingButtonRef.current;
    const pinButton = pinButtonRef.current;
    const card = cardRef.current;
    if (!button || !card) {
      return;
    }
    if (
      !initiallyPinned &&
      options.getPinnedCount() >= options.getMaxPinnedCount()
    ) {
      options.showToast(
        options.t('recent_pin_limit_toast', '最多只能置顶 3 个卡片'),
        false
      );
      options.updateTrackingButton(button, false, false, true);
      return;
    }
    const outcome = await cardAction.run('tracking');
    if (outcome.status === 'skipped') {
      return;
    }
    if (outcome.status === 'rejected') {
      options.showToast(options.t('toast_error', '操作失败，请重试'), true);
      return;
    }
    const result = outcome.value;
    if (!result || !card.isConnected) {
      return;
    }
    options.updateTrackingButton(
      button,
      Boolean(result.tracking),
      Boolean(result.pinned),
      Boolean(result.limitReached)
    );
    if (pinButton) {
      options.updatePinButton(
        pinButton,
        Boolean(result.pinned),
        Boolean(!result.pinned && result.limitReached)
      );
    }
  }

  function dispose(): void {
    clearRollbackTimer();
    clearHoverUnlockTimer();
    if (backgroundGuardTimerRef.current) {
      options.windowObj.clearTimeout(backgroundGuardTimerRef.current);
      backgroundGuardTimerRef.current = 0;
    }
    clearNavigationSignals();
  }

  useLayoutEffect(() => {
    const card = cardRef.current;
    const favicon = faviconRef.current;
    const pinButton = pinButtonRef.current;
    const trackingButton = trackingButtonRef.current;
    if (!card || !favicon || !pinButton || !trackingButton) {
      return;
    }
    card._xHost = host;
    card._xTheme = immediateTheme;
    card._xActionText = actionTextRef.current;
    card._xTitleText = safeTitleText;
    card._xPinButton = pinButton;
    card._xTrackingButton = trackingButton;
    card._xDisposeRecentCard = dispose;

    options.applyCardTheme(card, immediateTheme, host);
    options.attachFaviconWithFallbacks(favicon, faviconPageUrl, host, {
      primaryUrl: browserPageFaviconUrl
    });
    options.updatePinButton(
      pinButton,
      initiallyPinned,
      !initiallyPinned &&
        options.getPinnedCount() >= options.getMaxPinnedCount()
    );
    options.updateTrackingButton(
      trackingButton,
      initiallyTracked,
      initiallyPinned,
      !initiallyPinned &&
        options.getPinnedCount() >= options.getMaxPinnedCount()
    );
    options.bindCursorTooltip(
      card,
      () => card._xTitleText || safeTitleText,
      {
        maxWidth: 460,
        shouldShow: () =>
          !tooltipSuppressedRef.current &&
          isRecentTitleTruncated(titleRef.current)
      }
    );
    options.queueThemeForTarget(
      card,
      {
        type: 'history',
        url: faviconPageUrl,
        title: itemTitle
      },
      (theme) => {
        if (!card.isConnected) {
          return;
        }
        card._xTheme = theme || card._xTheme;
        options.applyCardTheme(card, theme, host);
      },
      { priority: shouldEager ? 0 : 2 }
    );

    return dispose;
  }, [
    faviconPageUrl,
    host,
    immediateTheme,
    index,
    initiallyPinned,
    initiallyTracked,
    item,
    itemTitle,
    options,
    safeTitleText,
    shouldEager
  ]);

  function handlePointerDown(
    event: ReactPointerEvent<RecentCardElement>
  ): void {
    if (event.button !== 0) {
      return;
    }
    isCardPointerActiveRef.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an optimization; navigation does not depend on it.
    }
    suppressClickRef.current = true;
    navigateFromCard(event);
  }

  function handlePointerLeave(): void {
    options.hideTopActionTooltip();
    options.hideCursorTooltip();
    tooltipSuppressedRef.current = false;
    const card = cardRef.current;
    if (
      card &&
      !hasNavigateAttemptedRef.current &&
      !hoverLockedRef.current
    ) {
      card.classList.remove(ROLLBACK_CLASS_NAME);
    }
  }

  function handleClick(event: ReactMouseEvent<RecentCardElement>): void {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      return;
    }
    navigateFromCard(event);
  }

  function handleAuxClick(event: ReactMouseEvent<RecentCardElement>): void {
    if (Number(event.button) !== 1) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    navigateFromCard(event);
  }

  function handleKeyDown(
    event: ReactKeyboardEvent<RecentCardElement>
  ): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    navigateFromCard(event);
  }

  function handleBlur(_event: ReactFocusEvent<RecentCardElement>): void {
    tooltipSuppressedRef.current = false;
  }

  return (
    <div
      ref={cardRef}
      className="x-nt-recent-card"
      tabIndex={0}
      role="button"
      aria-label={options.formatMessage('open_prefix', '打开 {title}', {
        title: titleText
      })}
      data-cursor-tooltip={safeTitleText}
      data-recent-update-pending={updateBadgeVisible ? 'true' : undefined}
      onPointerDown={handlePointerDown}
      onPointerCancel={() => {
        isCardPointerActiveRef.current = false;
        options.hideTopActionTooltip();
      }}
      onPointerUp={(event) => {
        if (event.button === 0 && isCardPointerActiveRef.current) {
          isCardPointerActiveRef.current = false;
        }
      }}
      onPointerLeave={handlePointerLeave}
      onBlur={handleBlur}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onContextMenu={(event) => {
        options.onItemContextMenu({
          event: event.nativeEvent,
          item,
          element: event.currentTarget
        });
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="x-nt-recent-card-visual">
        <div className="x-nt-recent-inner">
          {updateBadgeVisible ? (
            <span
              className="x-nt-recent-update-badge"
            >
              {options.t('recent_update_badge', '更新')}
            </span>
          ) : null}
          <div className="x-nt-recent-header">
            <img
              ref={faviconRef}
              className="x-nt-recent-favicon"
              alt={siteName || options.t('site_icon_alt', '站点')}
              width={25}
              height={25}
              decoding="async"
              loading={shouldEager ? 'eager' : 'lazy'}
              fetchPriority={shouldEager ? 'high' : undefined}
              data-favicon-placeholder={
                browserPageFaviconUrl ? 'true' : undefined
              }
              data-fallback-icon-name={
                browserPageFaviconUrl ? 'ri-link' : undefined
              }
            />
            {browserPageFaviconUrl ? (
              <span
                aria-hidden="true"
                className="x-nt-favicon-fallback _x_extension_favicon_fallback_2024_unique_"
                data-visible="true"
                dangerouslySetInnerHTML={{
                  __html: options.getRiSvg('ri-link', 'ri-size-16')
                }}
              />
            ) : null}
            <div className="x-nt-recent-name" title={siteName}>
              {siteName}
            </div>
          </div>
          <div ref={titleRef} className="x-nt-recent-title">
            {safeTitleText}
          </div>
        </div>
        <div className="x-nt-recent-url" title={itemUrl}>
          <div className="x-nt-recent-action">
            <span ref={actionTextRef}>
              {options.t('action_go_current_tab', '前往')}
            </span>
            <span
              dangerouslySetInnerHTML={{
                __html: options.getRiSvg(
                  'ri-arrow-right-line',
                  'ri-size-12'
                )
              }}
            />
          </div>
          <span className="x-nt-recent-url-text">
            {ownExtensionDisplay
              ? ownExtensionDisplay.urlText
              : options.getUrlDisplay(itemUrl)}
          </span>
          <button
            ref={pinButtonRef}
            aria-busy={cardAction.pending}
            disabled={cardAction.pending}
            type="button"
            className="x-nt-recent-pin"
            onPointerDown={stopCardActivation}
            onClick={(event) => {
              stopCardActivation(event);
              void handlePin();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                stopCardActivation(event);
                event.currentTarget.click();
              }
            }}
            onMouseEnter={showPinTooltip}
            onPointerLeave={options.hideTopActionTooltip}
            onPointerCancel={options.hideTopActionTooltip}
            onMouseLeave={options.hideTopActionTooltip}
            onFocus={showPinTooltip}
            onBlur={options.hideTopActionTooltip}
          >
            <i
              aria-hidden="true"
              className={`ri-icon ri-size-16 ${
                initiallyPinned ? 'ri-pushpin-fill' : 'ri-pushpin-line'
              }`}
              data-recent-pin-icon=""
            />
          </button>
          <button
            ref={trackingButtonRef}
            aria-busy={cardAction.pending}
            disabled={cardAction.pending}
            type="button"
            className="x-nt-recent-track"
            onPointerDown={stopCardActivation}
            onClick={(event) => {
              stopCardActivation(event);
              void handleTracking();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                stopCardActivation(event);
                event.currentTarget.click();
              }
            }}
            onMouseEnter={showTrackingTooltip}
            onPointerLeave={options.hideTopActionTooltip}
            onPointerCancel={options.hideTopActionTooltip}
            onMouseLeave={options.hideTopActionTooltip}
            onFocus={showTrackingTooltip}
            onBlur={options.hideTopActionTooltip}
          >
            <i
              aria-hidden="true"
              className={`ri-icon ri-size-16 ${
                initiallyTracked ? 'ri-radar-fill' : 'ri-radar-line'
              }`}
              data-recent-track-icon=""
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function RecentSitesList({
  items,
  options
}: {
  items: RecentSiteItem[];
  options: NormalizedRecentSitesOptions;
}) {
  const occurrences = new Map<string, number>();
  return items.map((item, index) => {
    const identity = String(item?.url || item?.host || item?.title || 'recent');
    const occurrence = occurrences.get(identity) || 0;
    occurrences.set(identity, occurrence + 1);
    return (
      <RecentSiteCard
        key={`${identity}::${occurrence}`}
        item={item}
        index={index}
        options={options}
      />
    );
  });
}

function createNoopController(
  rawOptions: RecentSitesViewOptions
): RecentSitesViewController {
  const cards = Array.isArray(rawOptions.cards) ? rawOptions.cards : [];
  return {
    clear() {
      cards.length = 0;
    },
    render(items) {
      const normalizedItems = Array.isArray(items) ? items : [];
      return {
        changed: false,
        count: normalizedItems.length,
        signature: getRecentSitesSignature(normalizedItems)
      };
    },
    getSignature: getRecentSitesSignature,
    getCards() {
      return cards;
    }
  };
}

export function createRecentSitesView(
  rawOptions: RecentSitesViewOptions = {}
): RecentSitesViewController {
  const normalizedOptions = normalizeOptions(rawOptions);
  if (!normalizedOptions) {
    return createNoopController(rawOptions);
  }
  const options: NormalizedRecentSitesOptions = normalizedOptions;
  const reactRoot: Root = createRoot(options.grid);
  options.grid.setAttribute('data-react-island', 'recent-sites');

  function syncCards(): void {
    options.cards.length = 0;
    options.grid
      .querySelectorAll<RecentCardElement>('.x-nt-recent-card')
      .forEach((card) => options.cards.push(card));
  }

  function clear(): void {
    options.hideTopActionTooltip();
    options.hideCursorTooltip();
    flushSync(() => {
      reactRoot.render(null);
    });
    options.cards.length = 0;
  }

  function render(
    items: RecentSiteItem[],
    state: RecentSitesRenderState = {}
  ): RecentSitesRenderResult {
    const normalizedItems = Array.isArray(items) ? items : [];
    const previousSignature =
      typeof state.signature === 'string' ? state.signature : '';
    const nextSignature = getRecentSitesSignature(normalizedItems);
    if (nextSignature === previousSignature) {
      return {
        changed: false,
        count: normalizedItems.length,
        signature: nextSignature
      };
    }
    options.hideTopActionTooltip();
    options.hideCursorTooltip();
    flushSync(() => {
      reactRoot.render(
        <RecentSitesList items={normalizedItems} options={options} />
      );
    });
    syncCards();
    return {
      changed: true,
      count: normalizedItems.length,
      signature: nextSignature
    };
  }

  return {
    clear,
    render,
    getSignature: getRecentSitesSignature,
    getCards() {
      return options.cards;
    }
  };
}

export function createRecentSitesViewApi() {
  return Object.freeze({
    implementation: 'react',
    createRecentSitesView(options?: RecentSitesViewOptions) {
      return createRecentSitesView(options);
    },
    getRecentSitesSignature
  });
}
