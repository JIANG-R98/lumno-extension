// The controller that shows one feature hint through the React feature hint
// view (getFeatureHintViewApi()): its visibility, dismissal, labels and
// alignment.
import type { FeatureHintViewController, FeatureHintViewLabels, FeatureHintViewModel } from '../../types/view-apis';
import { createFeatureHintAlignment, destroyAlignment, disconnectAlignmentObserver, scheduleContentAlignmentUpdate } from './feature-hint-alignment';
import type { FeatureHintAlignment } from './feature-hint-alignment';
import type { NavigatorLike } from '../../domain/shortcut-display';
import { getFeatureHintViewApi } from '../react/feature-hint-view';
import { formatShortcutText, getDomIdPart, getFeatureHint, getMessage, normalizeAlignMode, normalizeArrowAlign, normalizeArrowSide, normalizeDismissStorage, normalizeWidthMode } from './feature-hint-catalog';
import type {
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
  FeatureHintWindow,
  Translate
} from './feature-hint-catalog';
import { getFeatureHintLocalDismissKey, getFeatureHintSessionDismissKey, getFeatureHintSyncDismissKey, getStoredDismissed, setStoredDismissed } from './feature-hint-dismiss';

// HTML, SVG and MathML elements have blur(); other elements do not.
function isBlurrable(element: Element): element is Element & HTMLOrSVGElement {
  return 'blur' in element && typeof element.blur === 'function';
}

// One hint on one page, from its view's creation to destroy().
interface FeatureHintContext {
  config: FeatureHintOptions;
  hint: FeatureHintDefinition;
  page: Document;
  t: Translate | null;
  windowObj: FeatureHintWindow | null;
  chromeApi: FeatureHintChromeApi | null;
  dismissStorage: FeatureHintDismissStorage;
  dismissKey: string;
  rememberOnFirstShow: boolean;
  hasLink: boolean;
  actions: FeatureHintActionItem[];
  view: FeatureHintViewController;
  element: HTMLSpanElement;
  alignment: FeatureHintAlignment;
  dismissed: boolean;
  requestedVisible: boolean;
  dismissStateLoaded: boolean;
  visibilityGateSettled: boolean;
  firstShowRemembered: boolean;
  destroyed: boolean;
  readySettled: boolean;
  resolveReady: ((visible: boolean) => void) | null;
}

// What the options and the definition settle before the view is made.
interface FeatureHintSetup {
  config: FeatureHintOptions;
  hint: FeatureHintDefinition;
  page: Document;
  arrowSide: FeatureHintArrowSide;
  arrowAlign: FeatureHintArrowAlign;
  dismissStorage: FeatureHintDismissStorage;
  widthMode: FeatureHintWidthMode;
  alignMode: FeatureHintAlignMode;
  hasLink: boolean;
  actions: FeatureHintActionItem[];
}

function chooseDismissKey(config: FeatureHintOptions, hint: FeatureHintDefinition, storage: FeatureHintDismissStorage): string {
  if (config.dismissKey) {
    return config.dismissKey;
  }
  if (storage === 'sync') {
    return config.syncDismissKey || getFeatureHintSyncDismissKey(hint);
  }
  if (storage === 'local') {
    return config.localDismissKey || getFeatureHintLocalDismissKey(hint);
  }
  return config.sessionDismissKey || getFeatureHintSessionDismissKey(hint);
}

function readBooleanOption(value: boolean | undefined, fallback: boolean | undefined): boolean {
  return typeof value === 'boolean' ? value : Boolean(fallback);
}

// The actions in order, the first of each id kept.
function readActions(config: FeatureHintOptions, hint: FeatureHintDefinition): FeatureHintActionItem[] {
  const configuredActions = Array.isArray(config.actions)
    ? config.actions
    : (Array.isArray(hint.actions) ? hint.actions : []);
  return configuredActions.reduce<FeatureHintActionItem[]>((items, action, index) => {
    const id = String(action && (action.id || action.actionId) || '').trim();
    if (!id || items.some((item) => item.id === id)) {
      return items;
    }
    items.push({
      id,
      icon: action.icon ? { name: action.icon, size: 12 } : null,
      labelKey: String(action.labelKey || '').trim(),
      labelFallback: String(action.labelFallback || '').trim(),
      onClick: typeof action.onClick === 'function' ? action.onClick : null,
      variant: action.variant === 'primary' ? 'primary' : 'secondary',
      order: index
    });
    return items;
  }, []);
}

function readSetup(config: FeatureHintOptions, hint: FeatureHintDefinition, page: Document): FeatureHintSetup {
  return {
    config,
    hint,
    page,
    arrowSide: normalizeArrowSide(config.arrowSide || hint.arrowSide),
    arrowAlign: normalizeArrowAlign(config.arrowAlign || hint.arrowAlign),
    dismissStorage: normalizeDismissStorage(config.dismissStorage || hint.dismissStorage),
    widthMode: normalizeWidthMode(config.widthMode || hint.widthMode),
    alignMode: normalizeAlignMode(config.alignMode || hint.alignMode),
    hasLink: Boolean(config.onLinkClick || config.linkUrl || hint.linkKey || hint.linkFallback),
    actions: readActions(config, hint)
  };
}

function activateLink(config: FeatureHintOptions, hint: FeatureHintDefinition, event: MouseEvent): void {
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
}

function readBadgeImages(
  config: FeatureHintOptions,
  hint: FeatureHintDefinition
): Pick<FeatureHintViewModel, 'badgeIconImageSrc' | 'badgeWordmarkDarkImageSrc' | 'badgeWordmarkImageSrc'> {
  return {
    badgeIconImageSrc: String(config.badgeIconImageSrc || hint.badgeIconImageSrc || ''),
    badgeWordmarkDarkImageSrc: String(config.badgeWordmarkDarkImageSrc || hint.badgeWordmarkDarkImageSrc || ''),
    badgeWordmarkImageSrc: String(config.badgeWordmarkImageSrc || hint.badgeWordmarkImageSrc || '')
  };
}

function buildViewModel(setup: FeatureHintSetup): FeatureHintViewModel {
  const { config, hint } = setup;
  const idPart = getDomIdPart(hint.id);
  return {
    actions: setup.actions.map((action) => ({
      icon: action.icon || undefined,
      id: action.id,
      variant: action.variant
    })),
    alignMode: setup.alignMode,
    arrowAlign: setup.arrowAlign,
    arrowSide: setup.arrowSide,
    badgeIcon: hint.badgeIcon ? { name: hint.badgeIcon } : undefined,
    ...readBadgeImages(config, hint),
    badgeIconText: String(hint.badgeIconText || '').trim(),
    className: hint.className || '',
    dismissStorage: setup.dismissStorage,
    elementId: config.elementId || `_x_lumno_feature_hint_${idPart}_2026_unique_`,
    hasLink: setup.hasLink,
    hintId: hint.id,
    inlineActions: Boolean(config.inlineActions || hint.inlineActions),
    placement: hint.placement || '',
    roundedArrowTip: readBooleanOption(config.roundedArrowTip, hint.roundedArrowTip),
    surface: hint.surface || '',
    textId: config.textId || `_x_lumno_feature_hint_${idPart}_text_2026_unique_`,
    version: hint.introducedIn || '',
    widthMode: setup.widthMode
  };
}

function createHintView(setup: FeatureHintSetup, onDismiss: () => void): FeatureHintViewController | null {
  const featureHintView = getFeatureHintViewApi();
  const { config, hint, actions } = setup;
  return featureHintView.createFeatureHintView({
    documentObj: setup.page,
    model: buildViewModel(setup),
    labels: { actions: {}, badge: '', close: '', connector: '', link: '', text: '', trailing: '' },
    onDismiss,
    onActionClick(actionId, event) {
      const action = actions.find((item) => item.id === actionId);
      if (action && action.onClick) {
        action.onClick(event, hint, action);
      }
      if (typeof config.onActionClick === 'function') {
        config.onActionClick(actionId, event, hint);
      }
    },
    onLinkClick: (event) => activateLink(config, hint, event)
  });
}

function setElementInert(element: HTMLElement, inert: boolean): void {
  try {
    if ('inert' in element) {
      element.inert = inert;
    }
  } catch (_error) {
    // Some DOM test doubles expose readonly properties; inert is only a progressive enhancement.
  }
}

function blurFocusedChildIfNeeded(ctx: FeatureHintContext): void {
  const activeElement = ctx.page.activeElement;
  if (!activeElement || !isBlurrable(activeElement)) {
    return;
  }
  if (activeElement === ctx.element || ctx.element.contains(activeElement)) {
    activeElement.blur();
  }
}

function syncVisibility(ctx: FeatureHintContext): void {
  const element = ctx.element;
  const nextVisible = ctx.requestedVisible && !ctx.dismissed && ctx.dismissStateLoaded && ctx.visibilityGateSettled;
  element.setAttribute('data-visible', nextVisible ? 'true' : 'false');
  element.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
  setElementInert(element, !nextVisible);
  if (nextVisible) {
    if (ctx.rememberOnFirstShow && !ctx.firstShowRemembered && ctx.dismissStorage !== 'none') {
      ctx.firstShowRemembered = true;
      setStoredDismissed(ctx.chromeApi, ctx.dismissKey);
    }
    scheduleContentAlignmentUpdate(ctx.alignment);
  } else {
    blurFocusedChildIfNeeded(ctx);
    if (ctx.dismissed) {
      disconnectAlignmentObserver(ctx.alignment);
    }
  }
}

function settleReady(ctx: FeatureHintContext, force?: boolean): void {
  if (ctx.readySettled || (!force && (!ctx.dismissStateLoaded || !ctx.visibilityGateSettled))) {
    return;
  }
  ctx.readySettled = true;
  if (ctx.resolveReady) {
    ctx.resolveReady(ctx.element.getAttribute('data-visible') === 'true');
  }
}

function destroyHint(ctx: FeatureHintContext): void {
  if (ctx.destroyed) {
    return;
  }
  ctx.destroyed = true;
  settleReady(ctx, true);
  destroyAlignment(ctx.alignment);
  ctx.view.destroy();
}

function dismissHint(ctx: FeatureHintContext): void {
  if (ctx.destroyed || ctx.dismissed) {
    return;
  }
  ctx.dismissed = true;
  ctx.element.setAttribute('data-dismissed', 'true');
  if (ctx.dismissStorage !== 'none') {
    setStoredDismissed(ctx.chromeApi, ctx.dismissKey);
  }
  syncVisibility(ctx);
  if (typeof ctx.config.onDismiss === 'function') {
    ctx.config.onDismiss(ctx.hint);
  }
}

// A label from the options or the definition; empty when neither names one.
function readOptionalLabel(t: Translate | null, key: string, fallback: string): string {
  return key || fallback ? getMessage(t, key, fallback) : '';
}

function readNavigator(ctx: FeatureHintContext): NavigatorLike | null {
  return ctx.config.navigatorLike || (ctx.windowObj && ctx.windowObj.navigator) || globalThis.navigator || null;
}

function readLabels(ctx: FeatureHintContext): FeatureHintViewLabels {
  const { config, hint, t } = ctx;
  const actionLabels: Record<string, string> = {};
  ctx.actions.forEach((action) => {
    actionLabels[action.id] = getMessage(t, action.labelKey, action.labelFallback);
  });
  return {
    actions: actionLabels,
    badge: getMessage(t, hint.badgeKey, hint.badgeFallback),
    close: getMessage(t, hint.closeLabelKey, hint.closeLabelFallback),
    connector: readOptionalLabel(t, config.connectorKey || hint.connectorKey || '',
      config.connectorFallback || hint.connectorFallback || ''),
    link: ctx.hasLink
      ? getMessage(t, config.linkKey || hint.linkKey, config.linkFallback || hint.linkFallback)
      : '',
    text: formatShortcutText(getMessage(t, hint.textKey, hint.textFallback), 'Alt+Q', readNavigator(ctx)),
    trailing: readOptionalLabel(t, config.trailingKey || hint.trailingKey || '',
      config.trailingFallback || hint.trailingFallback || '')
  };
}

function updateHintLanguage(ctx: FeatureHintContext): void {
  if (ctx.destroyed) {
    return;
  }
  ctx.view.updateLabels(readLabels(ctx));
  scheduleContentAlignmentUpdate(ctx.alignment);
}

function waitForVisibilityGate(ctx: FeatureHintContext, visibilityGate: PromiseLike<unknown>): void {
  const releaseVisibilityGate = (): void => {
    if (ctx.destroyed || ctx.visibilityGateSettled) {
      return;
    }
    ctx.visibilityGateSettled = true;
    syncVisibility(ctx);
    settleReady(ctx);
  };
  visibilityGate.then(releaseVisibilityGate, releaseVisibilityGate);
}

function loadDismissState(ctx: FeatureHintContext): void {
  if (ctx.dismissStorage === 'none') {
    settleReady(ctx);
    return;
  }
  getStoredDismissed(ctx.chromeApi, ctx.dismissKey).then((isDismissed) => {
    if (ctx.destroyed) {
      return;
    }
    ctx.dismissStateLoaded = true;
    if (isDismissed && !ctx.dismissed) {
      ctx.dismissed = true;
      ctx.element.setAttribute('data-dismissed', 'true');
    }
    syncVisibility(ctx);
    settleReady(ctx);
  });
}

function createFeatureHintContext(setup: FeatureHintSetup, view: FeatureHintViewController): FeatureHintContext {
  const { config, hint, page, dismissStorage } = setup;
  const windowObj: FeatureHintWindow | null = config.windowObj || page.defaultView ||
    (typeof window !== 'undefined' ? window : null);
  return {
    config,
    hint,
    page,
    t: typeof config.t === 'function' ? config.t : null,
    windowObj,
    chromeApi: config.chromeApi || (typeof chrome !== 'undefined' ? chrome : null),
    dismissStorage,
    dismissKey: chooseDismissKey(config, hint, dismissStorage),
    rememberOnFirstShow: readBooleanOption(config.rememberOnFirstShow, hint.rememberOnFirstShow),
    hasLink: setup.hasLink,
    actions: setup.actions,
    view,
    element: view.element,
    alignment: createFeatureHintAlignment(setup.alignMode, windowObj, view, setup.hasLink),
    dismissed: Boolean(config.initiallyDismissed),
    requestedVisible: config.initiallyVisible !== false,
    dismissStateLoaded: dismissStorage === 'none',
    visibilityGateSettled: true,
    firstShowRemembered: false,
    destroyed: false,
    readySettled: false,
    resolveReady: null
  };
}

function createFeatureHint(options?: FeatureHintOptions | null): FeatureHintController | null {
  const config: FeatureHintOptions = options || {};
  const documentObj = config.documentObj || (typeof document !== 'undefined' ? document : null);
  const definition = getFeatureHint(config.definition || config.id || config.hint);
  if (!definition || !documentObj || !getFeatureHintViewApi()) {
    return null;
  }
  const setup = readSetup(config, definition, documentObj);
  let controller: FeatureHintController | null = null;
  const view = createHintView(setup, () => {
    if (controller) {
      controller.dismiss();
    }
  });
  if (!view) {
    return null;
  }
  const ctx = createFeatureHintContext(setup, view);
  const visibilityGate = config.visibilityGate && typeof config.visibilityGate.then === 'function'
    ? config.visibilityGate
    : null;
  ctx.visibilityGateSettled = !visibilityGate;
  const ready = new Promise<boolean>((resolve) => {
    ctx.resolveReady = resolve;
  });
  ctx.element.setAttribute('data-dismissed', ctx.dismissed ? 'true' : 'false');

  const hintController: FeatureHintController = {
    definition,
    element: ctx.element,
    textId: view.text.id,
    destroy: () => destroyHint(ctx),
    dismiss: () => dismissHint(ctx),
    isDismissed: () => ctx.dismissed,
    isVisible: () => ctx.element.getAttribute('data-visible') === 'true',
    ready,
    setVisible(visible: boolean) {
      if (ctx.destroyed) {
        return;
      }
      ctx.requestedVisible = Boolean(visible);
      syncVisibility(ctx);
    },
    updateLanguage: () => updateHintLanguage(ctx)
  };
  controller = hintController;

  hintController.updateLanguage();
  syncVisibility(ctx);
  if (visibilityGate) {
    waitForVisibilityGate(ctx, visibilityGate);
  }
  loadDismissState(ctx);
  return hintController;
}

export {
  createFeatureHint,
  isBlurrable
};
