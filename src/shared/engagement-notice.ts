// The invitation to rate Lumno and join its community, shown as a feature
// hint once someone has used the New Tab or the overlay for a while: at
// most twice, a fortnight apart, and never again once they act on it.
import * as COMMUNITY_LINKS from '../platform/community-links';
import type { CommunityLoadOptions } from '../platform/community-links';
import type { CommunityChannel } from '../domain/community-links';
import { getContextSettingsStore } from '../platform/settings-store';
import type { SettingsStoreChromeApi } from '../platform/settings-areas';
import * as LumnoFeatureHints from './ui/feature-hints';
import type { FeatureHintController, FeatureHintDefinition } from './ui/feature-hint-catalog';
import { engagementNoticeState } from '../domain/settings/features';

type EngagementSurface = 'newtab' | 'overlay';

interface EngagementSurfaceState {
  // Local dates (YYYY-MM-DD) the surface was used, the latest 32.
  activeDays: string[];
  firstSeenAt: number;
  meaningfulUses: number;
  opens: number;
}

interface EngagementState {
  completedAt: number;
  exposureCount: number;
  lastShownAt: number;
  newtab: EngagementSurfaceState;
  overlay: EngagementSurfaceState;
}

// How much use a surface needs before it may invite.
interface SurfaceThreshold {
  activeDays: number;
  ageMs: number;
  meaningfulUses: number;
  opens: number;
}

// The storage and asset URLs the notice uses, from chrome or a test double.
interface EngagementChromeApi extends SettingsStoreChromeApi {
  runtime?: SettingsStoreChromeApi['runtime'] & { getURL?(path: string): string };
}

type EngagementAction = 'review' | 'community';

interface EngagementNoticeOptions {
  documentObj?: Document | null;
  windowObj?: Partial<Pick<Window, 'setTimeout' | 'clearTimeout'>> | null;
  chromeApi?: EngagementChromeApi | null;
  featureHints?: Pick<typeof LumnoFeatureHints, 'createFeatureHint'> | null;
  surface?: string;
  locale?: string;
  t?: (key: string, fallback: string) => string;
  now?(): number;
  // How long after the page opens the invitation may appear.
  delayMs?: number;
  // The invitation waits for this (another notice deciding whether to show).
  exposureGate?: unknown;
  // Return false while the page has something else to show.
  canShow?(): boolean;
  onReview?(event: MouseEvent): void;
  onCommunity?(event: MouseEvent): void;
  onAction?(actionId: EngagementAction, event: MouseEvent): void;
  onDismiss?(): void;
  forceEnabledForTesting?: boolean;
}

interface EngagementNoticeController extends FeatureHintController {
  getState(): EngagementState;
  // A search or another real use: this page view never invites.
  recordMeaningfulUse(): void;
  suppressForSession(): void;
}

const ENGAGEMENT_NOTICE_ID = 'engagement-notice';
const ENGAGEMENT_NOTICE_VERSION = '1';
const ENGAGEMENT_NOTICE_ENABLED = true;
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_COOLDOWN_MS = 14 * DAY_MS;
const MAX_EXPOSURES = 2;
const X_URL = COMMUNITY_LINKS.FALLBACK_LINKS.x;
const WECHAT_QR_URL = COMMUNITY_LINKS.FALLBACK_LINKS.wechatQr;

const SURFACE_THRESHOLDS: Readonly<Record<EngagementSurface, Readonly<SurfaceThreshold>>> = Object.freeze({
  newtab: Object.freeze({
    activeDays: 4,
    ageMs: 7 * DAY_MS,
    meaningfulUses: 5,
    opens: 8
  }),
  overlay: Object.freeze({
    activeDays: 4,
    ageMs: 7 * DAY_MS,
    meaningfulUses: 0,
    opens: 10
  })
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readSurface(surface: unknown): EngagementSurface {
  return surface === 'overlay' ? 'overlay' : 'newtab';
}

function getDayKey(timestamp: unknown): string {
  const date = new Date(Number(timestamp) || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDays(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value : [];
  return items
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => (
      /^\d{4}-\d{2}-\d{2}$/.test(item) &&
      list.indexOf(item) === index
    ))
    .slice(-32);
}

function normalizeSurfaceState(value: unknown): EngagementSurfaceState {
  const source = isRecord(value) ? value : {};
  return {
    activeDays: normalizeDays(source.activeDays),
    firstSeenAt: Math.max(0, Number(source.firstSeenAt) || 0),
    meaningfulUses: Math.max(0, Math.floor(Number(source.meaningfulUses) || 0)),
    opens: Math.max(0, Math.floor(Number(source.opens) || 0))
  };
}

function normalizeEngagementState(value: unknown): EngagementState {
  const source = isRecord(value) ? value : {};
  return {
    completedAt: Math.max(0, Number(source.completedAt) || 0),
    exposureCount: Math.max(0, Math.floor(Number(source.exposureCount) || 0)),
    lastShownAt: Math.max(0, Number(source.lastShownAt) || 0),
    newtab: normalizeSurfaceState(source.newtab),
    overlay: normalizeSurfaceState(source.overlay)
  };
}

function recordSurfaceOpenInState(value: unknown, surface: unknown, timestamp: unknown): EngagementState {
  const state = normalizeEngagementState(value);
  const surfaceName = readSurface(surface);
  const now = Math.max(1, Number(timestamp) || Date.now());
  const surfaceState = state[surfaceName];
  surfaceState.firstSeenAt = surfaceState.firstSeenAt || now;
  surfaceState.opens += 1;
  const dayKey = getDayKey(now);
  if (!surfaceState.activeDays.includes(dayKey)) {
    surfaceState.activeDays.push(dayKey);
    surfaceState.activeDays = surfaceState.activeDays.slice(-32);
  }
  return state;
}

function recordMeaningfulUseInState(value: unknown, surface: unknown, timestamp: unknown): EngagementState {
  const state = recordSurfaceOpenInState(value, surface, timestamp);
  const surfaceName = readSurface(surface);
  state[surfaceName].opens = Math.max(0, state[surfaceName].opens - 1);
  state[surfaceName].meaningfulUses += 1;
  return state;
}

function shouldShowEngagementNotice(value: unknown, surface: unknown, timestamp: unknown): boolean {
  const state = normalizeEngagementState(value);
  const surfaceName = readSurface(surface);
  const threshold = SURFACE_THRESHOLDS[surfaceName];
  const surfaceState = state[surfaceName];
  const now = Math.max(1, Number(timestamp) || Date.now());
  if (state.completedAt || state.exposureCount >= MAX_EXPOSURES) {
    return false;
  }
  if (state.lastShownAt && now - state.lastShownAt < RETRY_COOLDOWN_MS) {
    return false;
  }
  if (!surfaceState.firstSeenAt ||
      now - surfaceState.firstSeenAt < threshold.ageMs) {
    return false;
  }
  return surfaceState.opens >= threshold.opens &&
    surfaceState.meaningfulUses >= threshold.meaningfulUses &&
    surfaceState.activeDays.length >= threshold.activeDays;
}

async function getStoredEngagementState(chromeApi: EngagementChromeApi | null | undefined): Promise<EngagementState> {
  if (!chromeApi || !chromeApi.storage) {
    return normalizeEngagementState(null);
  }
  const store = getContextSettingsStore(chromeApi);
  await store.include(engagementNoticeState);
  return normalizeEngagementState(store.getStored(engagementNoticeState));
}

async function setStoredEngagementState(chromeApi: EngagementChromeApi | null | undefined, value: unknown): Promise<EngagementState> {
  const state = normalizeEngagementState(value);
  if (chromeApi && chromeApi.storage) {
    const store = getContextSettingsStore(chromeApi);
    await store.include(engagementNoticeState);
    await store.set(engagementNoticeState, state).catch(() => {});
  }
  return state;
}

function getCommunityUrl(locale: unknown): string {
  return COMMUNITY_LINKS.getCommunityUrl(COMMUNITY_LINKS.getLinks(), locale);
}

function getCommunityChannel(locale: unknown): CommunityChannel {
  return COMMUNITY_LINKS.getCommunityChannel(COMMUNITY_LINKS.getLinks(), locale);
}

function getReviewUrl(): string {
  return COMMUNITY_LINKS.getReviewUrl(COMMUNITY_LINKS.getLinks());
}

function loadReviewUrl(options?: CommunityLoadOptions | null): Promise<string> {
  return COMMUNITY_LINKS.load(options)
    .then((links) => COMMUNITY_LINKS.getReviewUrl(links))
    .catch(() => getReviewUrl());
}

function loadCommunityUrl(options?: (CommunityLoadOptions & { locale?: string }) | null): Promise<string> {
  const settings = options || {};
  return COMMUNITY_LINKS.load(settings)
    .then((links) => COMMUNITY_LINKS.getCommunityUrl(links, settings.locale))
    .catch(() => getCommunityUrl(settings.locale));
}

function getExtensionAssetUrl(chromeApi: EngagementChromeApi | null | undefined, path: string, fallback: string): string {
  const runtime = chromeApi && chromeApi.runtime ? chromeApi.runtime : null;
  if (runtime && typeof runtime.getURL === 'function') {
    try {
      return runtime.getURL(path);
    } catch (_error) {
      // Relative fallbacks keep standalone previews and tests usable.
    }
  }
  return fallback;
}

function createEngagementNoticeDefinition(surface: unknown): Readonly<FeatureHintDefinition> {
  const surfaceName = readSurface(surface);
  return Object.freeze({
    id: ENGAGEMENT_NOTICE_ID,
    introducedIn: ENGAGEMENT_NOTICE_VERSION,
    surface: surfaceName,
    placement: surfaceName === 'overlay' ? 'above search input' : 'below search input',
    className: [
      'x-lumno-feature-hint--update-notice',
      `x-lumno-feature-hint--update-notice-${surfaceName}`,
      'x-lumno-feature-hint--engagement-notice'
    ].join(' '),
    arrowSide: surfaceName === 'overlay' ? 'bottom' : 'top',
    arrowAlign: 'center',
    widthMode: 'container',
    alignMode: 'auto',
    dismissStorage: 'sync',
    rememberOnFirstShow: false,
    inlineActions: true,
    badgeKey: 'engagement_notice_badge',
    badgeFallback: 'Lumno',
    textKey: 'engagement_notice_text',
    textFallback: 'Like Lumno? Why not',
    connectorKey: 'engagement_notice_connector',
    connectorFallback: 'or',
    trailingKey: 'engagement_notice_trailing',
    trailingFallback: 'and say hi.',
    closeLabelKey: 'engagement_notice_close',
    closeLabelFallback: 'Dismiss rating and community prompt'
  });
}

// One invitation on one page, from its first scheduling to destroy().
interface EngagementNoticeContext {
  config: EngagementNoticeOptions;
  chromeApi: EngagementChromeApi | null;
  surface: EngagementSurface;
  now: () => number;
  windowObj: Partial<Pick<Window, 'setTimeout' | 'clearTimeout'>> | null;
  delayMs: number;
  state: EngagementState;
  destroyed: boolean;
  suppressed: boolean;
  meaningfulUseRecorded: boolean;
  stateLoaded: boolean;
  showTimer: number;
  hint: FeatureHintController | null;
}

function createEngagementNoticeContext(config: EngagementNoticeOptions, documentObj: Document): EngagementNoticeContext {
  const surface = readSurface(config.surface);
  const delayMs = typeof config.delayMs === 'number' && Number.isFinite(config.delayMs)
    ? Math.max(0, config.delayMs)
    : (surface === 'overlay' ? 1200 : 1800);
  return {
    config,
    chromeApi: config.chromeApi || (typeof chrome !== 'undefined' ? chrome : null),
    surface,
    now: typeof config.now === 'function' ? config.now : () => Date.now(),
    windowObj: config.windowObj || documentObj.defaultView || (typeof window !== 'undefined' ? window : null),
    delayMs,
    state: normalizeEngagementState(null),
    destroyed: false,
    suppressed: false,
    meaningfulUseRecorded: false,
    stateLoaded: false,
    showTimer: 0,
    hint: null
  };
}

function clearShowTimer(ctx: EngagementNoticeContext): void {
  const windowObj = ctx.windowObj;
  if (ctx.showTimer && windowObj && typeof windowObj.clearTimeout === 'function') {
    windowObj.clearTimeout(ctx.showTimer);
  }
  ctx.showTimer = 0;
}

function canShowNow(ctx: EngagementNoticeContext): boolean {
  if (ctx.destroyed || ctx.suppressed) {
    return false;
  }
  // The invitation is built around rating Lumno; skip it if there is no
  // store page to rate.
  if (!getReviewUrl()) {
    return false;
  }
  return typeof ctx.config.canShow === 'function'
    ? ctx.config.canShow() !== false
    : true;
}

function markCompleted(ctx: EngagementNoticeContext): Promise<EngagementState> {
  ctx.state.completedAt = Math.max(1, Number(ctx.now()) || Date.now());
  return setStoredEngagementState(ctx.chromeApi, ctx.state);
}

function finishAction(ctx: EngagementNoticeContext, actionId: EngagementAction, event: MouseEvent): void {
  const config = ctx.config;
  if (ctx.hint) {
    ctx.hint.dismiss();
  }
  markCompleted(ctx);
  if (actionId === 'review' && typeof config.onReview === 'function') {
    config.onReview(event);
  }
  if (actionId === 'community' && typeof config.onCommunity === 'function') {
    config.onCommunity(event);
  }
  if (typeof config.onAction === 'function') {
    config.onAction(actionId, event);
  }
}

function createNoticeHint(ctx: EngagementNoticeContext, documentObj: Document): FeatureHintController | null {
  const { config, chromeApi } = ctx;
  const featureHints = config.featureHints || LumnoFeatureHints;
  const communityChannel = getCommunityChannel(config.locale);
  const wordmarkSrc = getExtensionAssetUrl(
    chromeApi,
    'assets/images/lumno-wordmark-mask.svg',
    '../../assets/images/lumno-wordmark-mask.svg'
  );
  return featureHints.createFeatureHint({
    documentObj,
    definition: createEngagementNoticeDefinition(ctx.surface),
    chromeApi,
    t: config.t,
    badgeIconImageSrc: getExtensionAssetUrl(
      chromeApi,
      'assets/images/lumno.png',
      '../../assets/images/lumno.png'
    ),
    badgeWordmarkImageSrc: wordmarkSrc,
    badgeWordmarkDarkImageSrc: wordmarkSrc,
    initiallyVisible: false,
    actions: [
      {
        id: 'review',
        icon: 'ri-external-link-line',
        labelKey: 'engagement_notice_review',
        labelFallback: 'leave 5 stars',
        variant: 'primary',
        onClick(event) {
          finishAction(ctx, 'review', event);
        }
      },
      {
        id: 'community',
        icon: communityChannel === 'wechat' ? 'ri-wechat-fill' : 'ri-twitter-x-line',
        labelKey: 'engagement_notice_community',
        labelFallback: communityChannel === 'wechat' ? 'join WeChat group' : 'find us on X',
        variant: 'secondary',
        onClick(event) {
          finishAction(ctx, 'community', event);
        }
      }
    ],
    onDismiss() {
      markCompleted(ctx);
      if (typeof config.onDismiss === 'function') {
        config.onDismiss();
      }
    }
  });
}

function exposeIfEligible(ctx: EngagementNoticeContext, hint: FeatureHintController): void {
  ctx.showTimer = 0;
  if (!shouldShowEngagementNotice(ctx.state, ctx.surface, ctx.now()) || !canShowNow(ctx)) {
    return;
  }
  ctx.state.exposureCount += 1;
  ctx.state.lastShownAt = Math.max(1, Number(ctx.now()) || Date.now());
  setStoredEngagementState(ctx.chromeApi, ctx.state);
  hint.setVisible(true);
}

function scheduleExposure(ctx: EngagementNoticeContext, hint: FeatureHintController): void {
  clearShowTimer(ctx);
  if (!shouldShowEngagementNotice(ctx.state, ctx.surface, ctx.now()) || !canShowNow(ctx)) {
    return;
  }
  const windowObj = ctx.windowObj;
  if (!windowObj || typeof windowObj.setTimeout !== 'function') {
    exposeIfEligible(ctx, hint);
    return;
  }
  ctx.showTimer = windowObj.setTimeout(() => exposeIfEligible(ctx, hint), ctx.delayMs);
}

// Counts this open, then waits for the exposure gate before scheduling.
function loadStateAndSchedule(ctx: EngagementNoticeContext, hint: FeatureHintController): void {
  getStoredEngagementState(ctx.chromeApi)
    .then((storedState) => {
      if (ctx.destroyed) {
        return null;
      }
      ctx.state = recordSurfaceOpenInState(storedState, ctx.surface, ctx.now());
      ctx.stateLoaded = true;
      if (ctx.meaningfulUseRecorded) {
        ctx.state = recordMeaningfulUseInState(ctx.state, ctx.surface, ctx.now());
      }
      return setStoredEngagementState(ctx.chromeApi, ctx.state);
    })
    .then(() => {
      if (ctx.destroyed) {
        return null;
      }
      return Promise.resolve(ctx.config.exposureGate).catch(() => null);
    })
    .then(() => {
      if (!ctx.destroyed) {
        scheduleExposure(ctx, hint);
      }
    });
}

function recordMeaningfulUse(ctx: EngagementNoticeContext, hint: FeatureHintController): void {
  if (ctx.destroyed || ctx.meaningfulUseRecorded) {
    return;
  }
  ctx.meaningfulUseRecorded = true;
  ctx.suppressed = true;
  clearShowTimer(ctx);
  hint.setVisible(false);
  if (!ctx.stateLoaded) {
    return;
  }
  ctx.state = recordMeaningfulUseInState(ctx.state, ctx.surface, ctx.now());
  setStoredEngagementState(ctx.chromeApi, ctx.state);
}

function createEngagementNotice(options?: EngagementNoticeOptions | null): EngagementNoticeController | null {
  const config: EngagementNoticeOptions = options || {};
  if (!ENGAGEMENT_NOTICE_ENABLED && config.forceEnabledForTesting !== true) {
    return null;
  }
  const documentObj = config.documentObj || (typeof document !== 'undefined' ? document : null);
  if (!documentObj) {
    return null;
  }
  const ctx = createEngagementNoticeContext(config, documentObj);
  const hint = createNoticeHint(ctx, documentObj);
  if (!hint) {
    return null;
  }
  ctx.hint = hint;
  hint.element.setAttribute('data-engagement-surface', ctx.surface);
  loadStateAndSchedule(ctx, hint);

  return Object.freeze({
    ...hint,
    destroy() {
      ctx.destroyed = true;
      clearShowTimer(ctx);
      hint.destroy();
    },
    getState() {
      return normalizeEngagementState(ctx.state);
    },
    recordMeaningfulUse() {
      recordMeaningfulUse(ctx, hint);
    },
    suppressForSession() {
      ctx.suppressed = true;
      clearShowTimer(ctx);
      hint.setVisible(false);
    }
  });
}

export type {
  EngagementAction,
  EngagementChromeApi,
  EngagementNoticeController,
  EngagementNoticeOptions,
  EngagementState,
  EngagementSurface,
  EngagementSurfaceState,
  SurfaceThreshold
};
export {
  DAY_MS,
  X_URL,
  ENGAGEMENT_NOTICE_ENABLED,
  ENGAGEMENT_NOTICE_ID,
  ENGAGEMENT_NOTICE_VERSION,
  MAX_EXPOSURES,
  RETRY_COOLDOWN_MS,
  SURFACE_THRESHOLDS,
  WECHAT_QR_URL,
  createEngagementNotice,
  createEngagementNoticeDefinition,
  getCommunityChannel,
  getCommunityUrl,
  loadCommunityUrl,
  getReviewUrl,
  loadReviewUrl,
  getDayKey,
  getStoredEngagementState,
  normalizeEngagementState,
  recordMeaningfulUseInState,
  recordSurfaceOpenInState,
  setStoredEngagementState,
  shouldShowEngagementNotice
};
