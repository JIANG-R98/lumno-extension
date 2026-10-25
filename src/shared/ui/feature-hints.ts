// In-page feature hints ("New: ..." notes beside a control): their
// definitions, where each remembers that it was dismissed, and the
// controller that shows one through the React feature hint view
// (globalThis.LumnoFeatureHintView).
import '../../domain/navigation-disposition';
import * as LumnoShortcutDisplay from '../../domain/shortcut-display';
import { getRiSvg as getDefaultRiSvg } from './remix-icon';
import type { NavigatorLike } from '../../domain/shortcut-display';
import type { StorageAreaLike } from '../../domain/storage-port';
import type { FeatureHintViewController, FeatureHintViewLabels } from '../../types/view-apis';

type FeatureHintArrowSide = 'top' | 'right' | 'bottom' | 'left';
type FeatureHintArrowAlign = 'start' | 'center' | 'end';
// Where a dismissal is remembered; 'none' forgets it with the page.
type FeatureHintDismissStorage = 'none' | 'session' | 'local' | 'sync';
type FeatureHintWidthMode = 'fixed' | 'container' | 'content';
type FeatureHintAlignMode = 'center' | 'start' | 'auto';

// A button the hint offers besides its link.
interface FeatureHintAction {
  id?: string;
  actionId?: string;
  icon?: string;
  labelKey?: string;
  labelFallback?: string;
  variant?: string;
  onClick?(event: MouseEvent, definition: FeatureHintDefinition, action: FeatureHintActionItem): void;
}

interface FeatureHintActionItem {
  id: string;
  iconHtml: string;
  labelKey: string;
  labelFallback: string;
  onClick: FeatureHintAction['onClick'] | null;
  variant: 'primary' | 'secondary';
  order: number;
}

interface FeatureHintDefinition {
  id: string;
  // The version that introduced it; a later version's hint shows again.
  introducedIn?: string;
  surface?: string;
  placement?: string;
  className?: string;
  arrowSide?: string;
  arrowAlign?: string;
  widthMode?: string;
  alignMode?: string;
  dismissStorage?: string;
  // Count the first showing as a dismissal, so it shows only once.
  rememberOnFirstShow?: boolean;
  roundedArrowTip?: boolean;
  inlineActions?: boolean;
  badgeIcon?: string;
  badgeIconText?: string;
  badgeIconImageSrc?: string;
  badgeWordmarkImageSrc?: string;
  badgeWordmarkDarkImageSrc?: string;
  badgeKey: string;
  badgeFallback: string;
  textKey: string;
  textFallback: string;
  linkKey?: string;
  linkFallback?: string;
  linkUrl?: string;
  connectorKey?: string;
  connectorFallback?: string;
  trailingKey?: string;
  trailingFallback?: string;
  closeLabelKey: string;
  closeLabelFallback: string;
  actions?: FeatureHintAction[];
}

// The storage the dismissals use, from chrome or a test double.
interface FeatureHintChromeApi {
  runtime?: { lastError?: unknown } | null;
  storage?: {
    sync?: StorageAreaLike;
    local?: StorageAreaLike;
    session?: StorageAreaLike;
  } | null;
}

// The page window, or a stand-in with the members used here.
type FeatureHintWindow = Partial<Pick<Window,
  'getComputedStyle' | 'requestAnimationFrame' | 'cancelAnimationFrame' | 'navigator' | 'open' | 'location'>> & {
  ResizeObserver?: typeof ResizeObserver;
};

type Translate = (key: string, fallback: string) => string;

interface FeatureHintOptions {
  documentObj?: Document | null;
  windowObj?: FeatureHintWindow | null;
  chromeApi?: FeatureHintChromeApi | null;
  // The hint, by definition or by id (or FEATURE_HINTS key).
  definition?: FeatureHintDefinition | string | null;
  id?: string;
  hint?: FeatureHintDefinition | string | null;
  t?: Translate | null;
  // The markup of a Remix icon.
  getRiSvg?(id: string, sizeClass: string): string;
  arrowSide?: string;
  arrowAlign?: string;
  dismissStorage?: string;
  widthMode?: string;
  alignMode?: string;
  dismissKey?: string;
  syncDismissKey?: string;
  localDismissKey?: string;
  sessionDismissKey?: string;
  rememberOnFirstShow?: boolean;
  roundedArrowTip?: boolean;
  inlineActions?: boolean;
  actions?: FeatureHintAction[];
  onLinkClick?(event: MouseEvent, definition: FeatureHintDefinition): void;
  linkUrl?: string;
  getLinkUrl?(definition: FeatureHintDefinition): string;
  linkTarget?: string;
  linkKey?: string;
  linkFallback?: string;
  connectorKey?: string;
  connectorFallback?: string;
  trailingKey?: string;
  trailingFallback?: string;
  initiallyDismissed?: boolean;
  initiallyVisible?: boolean;
  // The hint stays hidden until this settles.
  visibilityGate?: PromiseLike<unknown> | null;
  badgeIconImageSrc?: string;
  badgeWordmarkImageSrc?: string;
  badgeWordmarkDarkImageSrc?: string;
  elementId?: string;
  textId?: string;
  navigatorLike?: NavigatorLike | null;
  onActionClick?(actionId: string, event: MouseEvent, definition: FeatureHintDefinition): void;
  onDismiss?(definition: FeatureHintDefinition): void;
}

interface FeatureHintController {
  definition: FeatureHintDefinition;
  element: HTMLElement;
  textId: string;
  destroy(): void;
  dismiss(): void;
  isDismissed(): boolean;
  isVisible(): boolean;
  // Whether the hint is showing once its dismissal and visibility gate are known.
  ready: Promise<boolean>;
  setVisible(visible: boolean): void;
  updateLanguage(): void;
}

const FEATURE_HINTS = Object.freeze({
  NEWTAB_WALLPAPER_SOURCES: Object.freeze({
    id: 'newtab-wallpaper-sources',
    introducedIn: '0.9.58',
    surface: 'newtab',
    placement: 'bottom-right wallpaper control',
    className: 'x-lumno-feature-hint--newtab-wallpaper',
    arrowSide: 'right',
    arrowAlign: 'center',
    widthMode: 'content',
    dismissStorage: 'sync',
    rememberOnFirstShow: false,
    roundedArrowTip: true,
    badgeIcon: 'ri-asterisk',
    badgeKey: 'newtab_wallpaper_sources_feature_hint_badge',
    badgeFallback: 'New',
    textKey: 'newtab_wallpaper_sources_feature_hint_text',
    textFallback: 'New wallpapers: curated nature, city and art collections that can update daily, or add one by image link.',
    closeLabelKey: 'newtab_wallpaper_sources_feature_hint_close',
    closeLabelFallback: 'Dismiss new wallpapers tip'
  }),
  NEWTAB_AI_QUICK_JUMP: Object.freeze({
    id: 'newtab-ai-quick-jump',
    introducedIn: '0.9.9',
    surface: 'newtab',
    placement: 'below search input',
    className: 'x-lumno-feature-hint--newtab-ai-quick-jump',
    arrowSide: 'top',
    arrowAlign: 'center',
    widthMode: 'container',
    alignMode: 'auto',
    dismissStorage: 'sync',
    rememberOnFirstShow: true,
    roundedArrowTip: true,
    badgeIcon: 'ri-asterisk',
    badgeKey: 'newtab_ai_quick_jump_feature_hint_badge',
    badgeFallback: 'New',
    textKey: 'newtab_ai_quick_jump_feature_hint_text',
    textFallback: 'Jump to popular AI sites with your prompt in one click. Try typing "gemini" and pressing Tab.',
    linkKey: 'newtab_ai_quick_jump_feature_hint_link',
    linkFallback: 'Support list',
    closeLabelKey: 'newtab_ai_quick_jump_feature_hint_close',
    closeLabelFallback: 'Dismiss AI quick jump tip'
  }),
  NEWTAB_TAB_SWITCHER: Object.freeze({
    id: 'newtab-tab-switcher',
    introducedIn: '0.9.13',
    surface: 'newtab',
    placement: 'newtab settings icon',
    className: 'x-lumno-feature-hint--newtab-tab-switcher',
    arrowSide: 'top',
    arrowAlign: 'end',
    widthMode: 'fixed',
    alignMode: 'auto',
    dismissStorage: 'sync',
    rememberOnFirstShow: true,
    roundedArrowTip: true,
    badgeIcon: 'ri-asterisk',
    badgeKey: 'newtab_tab_switcher_feature_hint_badge',
    badgeFallback: 'New',
    textKey: 'newtab_tab_switcher_feature_hint_text',
    textFallback: 'Press {shortcut} to open the tab switcher and jump through recent tabs without reaching for the mouse.',
    closeLabelKey: 'newtab_tab_switcher_feature_hint_close',
    closeLabelFallback: 'Dismiss tab switcher tip'
  }),
  NEWTAB_WEBDAV_SYNC: Object.freeze({
    id: 'newtab-webdav-sync',
    introducedIn: '0.9.58',
    surface: 'newtab',
    placement: 'above newtab settings button',
    className: 'x-lumno-feature-hint--newtab-webdav-sync',
    arrowSide: 'bottom',
    arrowAlign: 'end',
    widthMode: 'content',
    alignMode: 'auto',
    dismissStorage: 'sync',
    rememberOnFirstShow: false,
    roundedArrowTip: true,
    badgeIcon: 'ri-asterisk',
    badgeKey: 'newtab_webdav_feature_hint_badge',
    badgeFallback: 'Beta',
    textKey: 'newtab_webdav_feature_hint_text',
    textFallback: 'Try WebDAV sync: keep settings, icons and wallpapers in step through a WebDAV drive or NAS, even across browsers.',
    linkKey: 'newtab_webdav_feature_hint_link',
    linkFallback: 'Set up',
    closeLabelKey: 'newtab_webdav_feature_hint_close',
    closeLabelFallback: 'Dismiss WebDAV tip'
  }),
  // New installs and everyone updating to this version see it until they close it or ask a question.
  NEWTAB_HELP_CENTER_ASK: Object.freeze({
    id: 'newtab-help-center-ask',
    introducedIn: '1.0.0',
    surface: 'newtab',
    placement: 'above search input',
    className: 'x-lumno-feature-hint--newtab-help-center-ask',
    arrowSide: 'bottom',
    arrowAlign: 'start',
    widthMode: 'content',
    alignMode: 'auto',
    dismissStorage: 'sync',
    rememberOnFirstShow: false,
    roundedArrowTip: true,
    badgeIcon: 'ri-asterisk',
    badgeKey: 'newtab_help_center_ask_feature_hint_badge',
    badgeFallback: 'New',
    textKey: 'newtab_help_center_ask_feature_hint_text',
    textFallback: 'Not sure how something works? Type lm, press Tab and ask the Help Center.',
    linkKey: 'newtab_help_center_ask_feature_hint_link',
    linkFallback: 'Try it',
    closeLabelKey: 'newtab_help_center_ask_feature_hint_close',
    closeLabelFallback: 'Dismiss Help Center tip'
  })
} satisfies Record<string, FeatureHintDefinition>);

type FeatureHintKey = keyof typeof FEATURE_HINTS;

const FEATURE_HINT_ARROW_SIDES: readonly FeatureHintArrowSide[] = ['top', 'right', 'bottom', 'left'];
const FEATURE_HINT_ARROW_ALIGNS: readonly FeatureHintArrowAlign[] = ['start', 'center', 'end'];
const FEATURE_HINT_DISMISS_STORAGE_TYPES: readonly FeatureHintDismissStorage[] = ['none', 'session', 'local', 'sync'];
const FEATURE_HINT_WIDTH_MODES: readonly FeatureHintWidthMode[] = ['fixed', 'container', 'content'];
const FEATURE_HINT_ALIGN_MODES: readonly FeatureHintAlignMode[] = ['center', 'start', 'auto'];

const FEATURE_HINT_SESSION_DISMISS_PREFIX = '_x_lumno_feature_hint_session_dismissed_2026_';
const FEATURE_HINT_LOCAL_DISMISS_PREFIX = '_x_lumno_feature_hint_local_dismissed_2026_';
const FEATURE_HINT_SYNC_DISMISS_PREFIX = '_x_lumno_feature_hint_sync_dismissed_2026_';

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isFeatureHintKey(value: string): value is FeatureHintKey {
  return hasOwn(FEATURE_HINTS, value);
}

const FEATURE_HINTS_BY_ID: Readonly<Record<string, FeatureHintDefinition>> = Object.freeze(
  Object.keys(FEATURE_HINTS).filter(isFeatureHintKey).reduce<Record<string, FeatureHintDefinition>>((map, key) => {
    const hint = FEATURE_HINTS[key];
    map[hint.id] = hint;
    return map;
  }, {})
);

function getMessage(t: Translate | null, key: string | undefined, fallback: string | undefined): string {
  return t ? t(key || '', fallback || '') : (fallback || '');
}

function formatShortcutText(text: string, shortcut: string, navigatorLike: NavigatorLike | null): string {
  return LumnoShortcutDisplay.formatShortcutTemplate(text, shortcut, { navigatorLike });
}

function getDomIdPart(id: string | undefined): string {
  return String(id || 'feature-hint').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'feature_hint';
}

function normalizeFeatureHintValue<T extends string>(value: unknown, allowedValues: readonly T[], fallback: T): T {
  const normalized = String(value || '').toLowerCase();
  return allowedValues.find((allowed) => allowed === normalized) || fallback;
}

function normalizeArrowSide(value: unknown): FeatureHintArrowSide {
  return normalizeFeatureHintValue(value, FEATURE_HINT_ARROW_SIDES, 'bottom');
}

function normalizeArrowAlign(value: unknown): FeatureHintArrowAlign {
  return normalizeFeatureHintValue(value, FEATURE_HINT_ARROW_ALIGNS, 'center');
}

function normalizeDismissStorage(value: unknown): FeatureHintDismissStorage {
  return normalizeFeatureHintValue(value, FEATURE_HINT_DISMISS_STORAGE_TYPES, 'none');
}

function normalizeWidthMode(value: unknown): FeatureHintWidthMode {
  return normalizeFeatureHintValue(value, FEATURE_HINT_WIDTH_MODES, 'fixed');
}

function normalizeAlignMode(value: unknown): FeatureHintAlignMode {
  return normalizeFeatureHintValue(value, FEATURE_HINT_ALIGN_MODES, 'center');
}

type FeatureHintReference = FeatureHintDefinition | string | null | undefined;

function getFeatureHintStorageId(definition: FeatureHintReference): string {
  const hint = getFeatureHint(definition);
  const idPart = getDomIdPart(hint ? hint.id : '');
  const versionPart = getDomIdPart(hint && hint.introducedIn ? hint.introducedIn : 'unversioned');
  return `${idPart}_${versionPart}`;
}

function getFeatureHintDismissKey(definition: FeatureHintReference, storageType: FeatureHintDismissStorage): string {
  const prefix = storageType === 'sync'
    ? FEATURE_HINT_SYNC_DISMISS_PREFIX
    : (storageType === 'local'
      ? FEATURE_HINT_LOCAL_DISMISS_PREFIX
      : FEATURE_HINT_SESSION_DISMISS_PREFIX);
  return prefix + getFeatureHintStorageId(definition);
}

function getFeatureHintSessionDismissKey(definition: FeatureHintReference): string {
  return getFeatureHintDismissKey(definition, 'session');
}

function getFeatureHintLocalDismissKey(definition: FeatureHintReference): string {
  return getFeatureHintDismissKey(definition, 'local');
}

function getFeatureHintSyncDismissKey(definition: FeatureHintReference): string {
  return getFeatureHintDismissKey(definition, 'sync');
}

// Older versions kept sync-remembered dismissals in local storage.
function getLegacyLocalDismissKeyForSyncKey(key: string): string {
  const rawKey = String(key || '');
  if (!rawKey.startsWith(FEATURE_HINT_SYNC_DISMISS_PREFIX)) {
    return '';
  }
  return FEATURE_HINT_LOCAL_DISMISS_PREFIX + rawKey.slice(FEATURE_HINT_SYNC_DISMISS_PREFIX.length);
}

function getDismissStorageArea(
  chromeApi: FeatureHintChromeApi | null,
  storageType: FeatureHintDismissStorage
): StorageAreaLike | null {
  const storage = chromeApi ? chromeApi.storage : null;
  if (!storage) {
    return null;
  }
  if (storageType === 'sync') {
    return storage.sync || storage.local || null;
  }
  if (storageType === 'local') {
    return storage.local || null;
  }
  if (storageType === 'session') {
    return storage.session || null;
  }
  return null;
}

function getStoredDismissedFromArea(
  chromeApi: FeatureHintChromeApi | null,
  storageArea: StorageAreaLike | null,
  key: string
): Promise<boolean> {
  if (!storageArea) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    try {
      storageArea.get([key], (result) => {
        const runtimeError = chromeApi && chromeApi.runtime
          ? chromeApi.runtime.lastError
          : null;
        resolve(!runtimeError && Boolean(result && result[key]));
      });
    } catch (_error) {
      resolve(false);
    }
  });
}

function getStoredDismissed(
  chromeApi: FeatureHintChromeApi | null,
  key: string,
  storageType: FeatureHintDismissStorage
): Promise<boolean> {
  const storageArea = getDismissStorageArea(chromeApi, storageType);
  return getStoredDismissedFromArea(chromeApi, storageArea, key).then((isDismissed) => {
    if (isDismissed || storageType !== 'sync') {
      return isDismissed;
    }
    const localArea = chromeApi && chromeApi.storage ? chromeApi.storage.local || null : null;
    const legacyLocalKey = getLegacyLocalDismissKeyForSyncKey(key);
    if (!localArea || !legacyLocalKey) {
      return false;
    }
    return getStoredDismissedFromArea(chromeApi, localArea, legacyLocalKey).then((legacyDismissed) => {
      if (legacyDismissed) {
        setStoredDismissed(chromeApi, key, storageType);
      }
      return legacyDismissed;
    });
  });
}

function setStoredDismissed(
  chromeApi: FeatureHintChromeApi | null,
  key: string,
  storageType: FeatureHintDismissStorage
): void {
  const storageArea = getDismissStorageArea(chromeApi, storageType);
  if (!storageArea) {
    return;
  }
  try {
    storageArea.set({ [key]: true }, () => {});
  } catch (_error) {
    // Storage errors should not block the visible in-page dismissal.
  }
}

function getFeatureHint(definition: FeatureHintReference): FeatureHintDefinition | null {
  if (!definition) {
    return null;
  }
  if (typeof definition === 'string') {
    if (hasOwn(FEATURE_HINTS_BY_ID, definition)) {
      return FEATURE_HINTS_BY_ID[definition];
    }
    return isFeatureHintKey(definition) ? FEATURE_HINTS[definition] : null;
  }
  return definition;
}

// HTML, SVG and MathML elements have blur(); other elements do not.
function isBlurrable(element: Element): element is Element & HTMLOrSVGElement {
  return 'blur' in element && typeof element.blur === 'function';
}

function createFeatureHint(options?: FeatureHintOptions | null): FeatureHintController | null {
  const config: FeatureHintOptions = options || {};
  const documentObj = config.documentObj || (typeof document !== 'undefined' ? document : null);
  const definition = getFeatureHint(config.definition || config.id || config.hint);
  const featureHintView = globalThis.LumnoFeatureHintView;
  if (!definition || !documentObj || !featureHintView) {
    return null;
  }
  const hint = definition;
  const page = documentObj;
  const t = typeof config.t === 'function' ? config.t : null;
  const getRiSvg = typeof config.getRiSvg === 'function' ? config.getRiSvg : getDefaultRiSvg;
  const idPart = getDomIdPart(hint.id);
  const arrowSide = normalizeArrowSide(config.arrowSide || hint.arrowSide);
  const arrowAlign = normalizeArrowAlign(config.arrowAlign || hint.arrowAlign);
  const dismissStorage = normalizeDismissStorage(config.dismissStorage || hint.dismissStorage);
  const widthMode = normalizeWidthMode(config.widthMode || hint.widthMode);
  const alignMode = normalizeAlignMode(config.alignMode || hint.alignMode);
  const chromeApi: FeatureHintChromeApi | null = config.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
  const dismissKey = config.dismissKey ||
    (dismissStorage === 'sync'
      ? (config.syncDismissKey || getFeatureHintSyncDismissKey(hint))
      : (dismissStorage === 'local'
        ? (config.localDismissKey || getFeatureHintLocalDismissKey(hint))
        : (config.sessionDismissKey || getFeatureHintSessionDismissKey(hint))));
  const windowObj: FeatureHintWindow | null = config.windowObj || page.defaultView ||
    (typeof window !== 'undefined' ? window : null);
  const rememberOnFirstShow = typeof config.rememberOnFirstShow === 'boolean'
    ? config.rememberOnFirstShow
    : Boolean(hint.rememberOnFirstShow);
  const roundedArrowTip = typeof config.roundedArrowTip === 'boolean'
    ? config.roundedArrowTip
    : Boolean(hint.roundedArrowTip);
  const configuredActions = Array.isArray(config.actions)
    ? config.actions
    : (Array.isArray(hint.actions) ? hint.actions : []);
  const actions = configuredActions.reduce<FeatureHintActionItem[]>((items, action, index) => {
    const id = String(action && (action.id || action.actionId) || '').trim();
    if (!id || items.some((item) => item.id === id)) {
      return items;
    }
    items.push({
      id,
      iconHtml: action.icon ? getRiSvg(String(action.icon), 'ri-size-12') : '',
      labelKey: String(action.labelKey || '').trim(),
      labelFallback: String(action.labelFallback || '').trim(),
      onClick: typeof action.onClick === 'function' ? action.onClick : null,
      variant: action.variant === 'primary' ? 'primary' : 'secondary',
      order: index
    });
    return items;
  }, []);
  const hasLink = Boolean(
    config.onLinkClick ||
    config.linkUrl ||
    hint.linkKey ||
    hint.linkFallback
  );
  let dismissed = Boolean(config.initiallyDismissed);
  let requestedVisible = config.initiallyVisible !== false;
  let dismissStateLoaded = dismissStorage === 'none';
  const visibilityGate = config.visibilityGate && typeof config.visibilityGate.then === 'function'
    ? config.visibilityGate
    : null;
  let visibilityGateSettled = !visibilityGate;
  let firstShowRemembered = false;
  let destroyed = false;
  let readySettled = false;
  let resolveReady: ((visible: boolean) => void) | null = null;
  const ready = new Promise<boolean>((resolve) => {
    resolveReady = resolve;
  });
  const badgeIconText = String(hint.badgeIconText || '').trim();
  const activateLink = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof config.onLinkClick === 'function') {
      config.onLinkClick(event, hint);
      return;
    }
    const linkUrl = typeof config.getLinkUrl === 'function'
      ? config.getLinkUrl(hint)
      : (config.linkUrl || hint.linkUrl || '');
    const targetWindow: FeatureHintWindow | null = config.windowObj || (typeof window !== 'undefined' ? window : null);
    if (!linkUrl || !targetWindow) {
      return;
    }
    if (config.linkTarget === '_blank' && typeof targetWindow.open === 'function') {
      targetWindow.open(linkUrl, '_blank', 'noopener');
      return;
    }
    if (targetWindow.location) {
      targetWindow.location.assign(linkUrl);
    }
  };
  let controller: FeatureHintController | null = null;
  const viewController: FeatureHintViewController | null = featureHintView.createFeatureHintView({
    documentObj: page,
    model: {
      actions: actions.map((action) => ({
        iconHtml: action.iconHtml,
        id: action.id,
        variant: action.variant
      })),
      alignMode,
      arrowAlign,
      arrowSide,
      badgeIconHtml: hint.badgeIcon
        ? getRiSvg(hint.badgeIcon, 'ri-size-10')
        : '',
      badgeIconImageSrc: String(
        config.badgeIconImageSrc || hint.badgeIconImageSrc || ''
      ),
      badgeIconText,
      badgeWordmarkDarkImageSrc: String(
        config.badgeWordmarkDarkImageSrc ||
        hint.badgeWordmarkDarkImageSrc ||
        ''
      ),
      badgeWordmarkImageSrc: String(
        config.badgeWordmarkImageSrc || hint.badgeWordmarkImageSrc || ''
      ),
      className: hint.className || '',
      dismissStorage,
      elementId: config.elementId || `_x_lumno_feature_hint_${idPart}_2026_unique_`,
      hasLink,
      hintId: hint.id,
      inlineActions: Boolean(config.inlineActions || hint.inlineActions),
      placement: hint.placement || '',
      roundedArrowTip,
      surface: hint.surface || '',
      textId: config.textId || `_x_lumno_feature_hint_${idPart}_text_2026_unique_`,
      version: hint.introducedIn || '',
      widthMode
    },
    labels: {
      actions: {},
      badge: '',
      close: '',
      connector: '',
      link: '',
      text: '',
      trailing: ''
    },
    onDismiss() {
      if (controller) {
        controller.dismiss();
      }
    },
    onActionClick(actionId, event) {
      const action = actions.find((item) => item.id === actionId);
      if (action && action.onClick) {
        action.onClick(event, hint, action);
      }
      if (typeof config.onActionClick === 'function') {
        config.onActionClick(actionId, event, hint);
      }
    },
    onLinkClick: activateLink
  });
  if (!viewController) {
    return null;
  }
  const view = viewController;
  const element = view.element;
  const text = view.text;
  const badge = view.badge;
  const linkButton = view.linkButton;
  const actionButtons = Array.isArray(view.actionButtons) ? view.actionButtons : [];
  element.setAttribute('data-dismissed', dismissed ? 'true' : 'false');

  let alignUpdateFrame = 0;

  function getCssNumber(style: CSSStyleDeclaration, property: string): number {
    const value = Number.parseFloat(style.getPropertyValue(property));
    return Number.isFinite(value) ? value : 0;
  }

  // Marks the hint multiline when its text wraps or its row breaks, so its
  // content aligns to the top instead of the middle.
  function updateContentAlignment(): void {
    alignUpdateFrame = 0;
    if (alignMode !== 'auto' || !windowObj || typeof windowObj.getComputedStyle !== 'function') {
      return;
    }
    const readStyle = windowObj.getComputedStyle;
    const computeStyle = (target: Element): CSSStyleDeclaration => Reflect.apply(readStyle, windowObj, [target]);
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const elementStyle = computeStyle(element);
    const textStyle = computeStyle(text);
    const contentHeight = rect.height -
      getCssNumber(elementStyle, 'padding-top') -
      getCssNumber(elementStyle, 'padding-bottom') -
      getCssNumber(elementStyle, 'border-top-width') -
      getCssNumber(elementStyle, 'border-bottom-width');
    const contentWidth = rect.width -
      getCssNumber(elementStyle, 'padding-left') -
      getCssNumber(elementStyle, 'padding-right') -
      getCssNumber(elementStyle, 'border-left-width') -
      getCssNumber(elementStyle, 'border-right-width');
    const textRect = text.getBoundingClientRect();
    const badgeRect = badge.getBoundingClientRect();
    const linkHeight = hasLink && linkButton ? linkButton.getBoundingClientRect().height : 0;
    const actionHeight = actionButtons.reduce((height, actionButton) => (
      Math.max(height, actionButton.getBoundingClientRect().height || 0)
    ), 0);
    const lineHeight = getCssNumber(textStyle, 'line-height') ||
      ((getCssNumber(textStyle, 'font-size') || 12) * 1.45);
    const isEngagementNotice = element.classList.contains('x-lumno-feature-hint--engagement-notice');
    const inlineSentence = isEngagementNotice
      ? element.querySelector('.x-lumno-feature-hint__sentence')
      : null;
    if (inlineSentence) {
      const sentenceWidth = Array.from(inlineSentence.children).reduce((width, item) => {
        const itemRect = item.getBoundingClientRect();
        const itemStyle = computeStyle(item);
        const currentInlineMargin =
          getCssNumber(itemStyle, 'margin-left') +
          getCssNumber(itemStyle, 'margin-right');
        const reservedHoverMargin =
          getCssNumber(itemStyle, '--x-lumno-engagement-action-hover-margin') * 2;
        return width + itemRect.width +
          Math.max(currentInlineMargin, reservedHoverMargin);
      }, 0);
      const inlineGap = getCssNumber(elementStyle, 'column-gap') ||
        getCssNumber(elementStyle, 'gap');
      const requiredInlineWidth = badgeRect.width + inlineGap + sentenceWidth;
      element.setAttribute(
        'data-multiline',
        requiredInlineWidth > contentWidth + 1 ? 'true' : 'false'
      );
      return;
    }
    const maxChildHeight = Math.max(
      textRect.height,
      badgeRect.height,
      linkHeight,
      actionHeight
    );
    const textWrapped = textRect.height > lineHeight * 1.35;
    const rowWrapped = contentHeight > maxChildHeight + 6;
    element.setAttribute('data-multiline', (textWrapped || rowWrapped) ? 'true' : 'false');
  }

  function scheduleContentAlignmentUpdate(): void {
    if (alignMode !== 'auto') {
      return;
    }
    if (!windowObj || typeof windowObj.requestAnimationFrame !== 'function') {
      updateContentAlignment();
      return;
    }
    if (alignUpdateFrame) {
      return;
    }
    alignUpdateFrame = Reflect.apply(windowObj.requestAnimationFrame, windowObj, [updateContentAlignment]);
  }

  let alignResizeObserver: ResizeObserver | null = null;
  if (alignMode === 'auto' && windowObj && typeof windowObj.ResizeObserver === 'function') {
    const observer = new windowObj.ResizeObserver(scheduleContentAlignmentUpdate);
    observer.observe(element);
    observer.observe(text);
    if (hasLink && linkButton) {
      observer.observe(linkButton);
    }
    actionButtons.forEach((actionButton) => {
      observer.observe(actionButton);
    });
    alignResizeObserver = observer;
  }

  function setElementInert(inert: boolean): void {
    try {
      if ('inert' in element) {
        element.inert = inert;
      }
    } catch (_error) {
      // Some DOM test doubles expose readonly properties; inert is only a progressive enhancement.
    }
  }

  function blurFocusedChildIfNeeded(): void {
    const activeElement = page.activeElement;
    if (!activeElement || !isBlurrable(activeElement)) {
      return;
    }
    if (activeElement === element || element.contains(activeElement)) {
      activeElement.blur();
    }
  }

  function disconnectAlignmentObserver(): void {
    if (!alignResizeObserver) {
      return;
    }
    alignResizeObserver.disconnect();
    alignResizeObserver = null;
  }

  function syncVisibility(): void {
    const nextVisible = requestedVisible &&
      !dismissed &&
      dismissStateLoaded &&
      visibilityGateSettled;
    element.setAttribute('data-visible', nextVisible ? 'true' : 'false');
    element.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
    setElementInert(!nextVisible);
    if (nextVisible) {
      if (rememberOnFirstShow && !firstShowRemembered && dismissStorage !== 'none') {
        firstShowRemembered = true;
        setStoredDismissed(chromeApi, dismissKey, dismissStorage);
      }
      scheduleContentAlignmentUpdate();
    } else {
      blurFocusedChildIfNeeded();
      if (dismissed) {
        disconnectAlignmentObserver();
      }
    }
  }

  function settleReady(force?: boolean): void {
    if (readySettled || (!force && (!dismissStateLoaded || !visibilityGateSettled))) {
      return;
    }
    readySettled = true;
    if (resolveReady) {
      resolveReady(element.getAttribute('data-visible') === 'true');
    }
  }

  const hintController: FeatureHintController = {
    definition: hint,
    element,
    textId: text.id,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      settleReady(true);
      disconnectAlignmentObserver();
      if (alignUpdateFrame && windowObj && typeof windowObj.cancelAnimationFrame === 'function') {
        Reflect.apply(windowObj.cancelAnimationFrame, windowObj, [alignUpdateFrame]);
        alignUpdateFrame = 0;
      }
      view.destroy();
    },
    dismiss() {
      if (destroyed || dismissed) {
        return;
      }
      dismissed = true;
      element.setAttribute('data-dismissed', 'true');
      if (dismissStorage !== 'none') {
        setStoredDismissed(chromeApi, dismissKey, dismissStorage);
      }
      syncVisibility();
      if (typeof config.onDismiss === 'function') {
        config.onDismiss(hint);
      }
    },
    isDismissed() {
      return dismissed;
    },
    isVisible() {
      return element.getAttribute('data-visible') === 'true';
    },
    ready,
    setVisible(visible: boolean) {
      if (destroyed) {
        return;
      }
      requestedVisible = Boolean(visible);
      syncVisibility();
    },
    updateLanguage() {
      if (destroyed) {
        return;
      }
      const badgeLabel = getMessage(t, hint.badgeKey, hint.badgeFallback);
      const rawTextLabel = getMessage(t, hint.textKey, hint.textFallback);
      const navigatorLike = config.navigatorLike ||
        (windowObj && windowObj.navigator) ||
        globalThis.navigator ||
        null;
      const textLabel = formatShortcutText(rawTextLabel, 'Alt+Q', navigatorLike);
      const closeLabel = getMessage(t, hint.closeLabelKey, hint.closeLabelFallback);
      const connectorKey = config.connectorKey || hint.connectorKey || '';
      const connectorFallback =
        config.connectorFallback || hint.connectorFallback || '';
      const connectorLabel = connectorKey || connectorFallback
        ? getMessage(t, connectorKey, connectorFallback)
        : '';
      const trailingKey = config.trailingKey || hint.trailingKey || '';
      const trailingFallback =
        config.trailingFallback || hint.trailingFallback || '';
      const trailingLabel = trailingKey || trailingFallback
        ? getMessage(t, trailingKey, trailingFallback)
        : '';
      let linkLabel = '';
      const actionLabels: Record<string, string> = {};
      if (hasLink) {
        linkLabel = getMessage(t, config.linkKey || hint.linkKey, config.linkFallback || hint.linkFallback);
      }
      actions.forEach((action) => {
        actionLabels[action.id] = getMessage(t, action.labelKey, action.labelFallback);
      });
      const labels: FeatureHintViewLabels = {
        actions: actionLabels,
        badge: badgeLabel,
        close: closeLabel,
        connector: connectorLabel,
        link: linkLabel,
        text: textLabel,
        trailing: trailingLabel
      };
      view.updateLabels(labels);
      scheduleContentAlignmentUpdate();
    }
  };
  controller = hintController;

  hintController.updateLanguage();
  syncVisibility();
  if (visibilityGate) {
    const releaseVisibilityGate = (): void => {
      if (destroyed || visibilityGateSettled) {
        return;
      }
      visibilityGateSettled = true;
      syncVisibility();
      settleReady();
    };
    visibilityGate.then(releaseVisibilityGate, releaseVisibilityGate);
  }
  if (dismissStorage !== 'none') {
    getStoredDismissed(chromeApi, dismissKey, dismissStorage).then((isDismissed) => {
      if (destroyed) {
        return;
      }
      dismissStateLoaded = true;
      if (isDismissed && !dismissed) {
        dismissed = true;
        element.setAttribute('data-dismissed', 'true');
      }
      syncVisibility();
      settleReady();
    });
  } else {
    settleReady();
  }
  return hintController;
}

function listFeatureHints(): FeatureHintDefinition[] {
  return Object.keys(FEATURE_HINTS).filter(isFeatureHintKey).map((key) => FEATURE_HINTS[key]);
}

export type {
  FeatureHintAction,
  FeatureHintActionItem,
  FeatureHintAlignMode,
  FeatureHintArrowAlign,
  FeatureHintArrowSide,
  FeatureHintChromeApi,
  FeatureHintController,
  FeatureHintDefinition,
  FeatureHintDismissStorage,
  FeatureHintOptions,
  FeatureHintWidthMode,
  FeatureHintWindow
};
export {
  FEATURE_HINTS,
  getFeatureHint,
  normalizeArrowSide,
  normalizeArrowAlign,
  normalizeDismissStorage,
  normalizeWidthMode,
  normalizeAlignMode,
  getFeatureHintSessionDismissKey,
  getFeatureHintLocalDismissKey,
  getFeatureHintSyncDismissKey,
  createFeatureHint,
  listFeatureHints
};
