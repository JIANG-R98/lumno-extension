// The shapes the favicon modules share: candidates, resolver options and
// dependencies, decision log entries and theme colors.

type FaviconTheme = 'dark' | 'light';

// An icon URL with how strongly it is preferred.
interface ScoredFaviconUrl {
  url: string;
  score: number;
}

// The extension URL of a path (chrome.runtime.getURL).
type RuntimeUrlGetter = (path: string) => string;

interface FaviconUrlOptions {
  getRuntimeUrl?: RuntimeUrlGetter | null;
  // Pixel size requested from the source.
  size?: number;
  // Keep the _favicon URL where it does not load (Firefox), as the marker
  // the background resolves from the browser's own icons.
  browserCacheRequest?: boolean;
  // The Gstatic host to ask.
  host?: string;
}

// The parts of the extension API the favicon helpers read.
interface FaviconChromeApi {
  runtime?: {
    id?: string;
    getURL?: RuntimeUrlGetter;
  };
}

interface EnhancedFetchPolicyOptions {
  chromeApi?: FaviconChromeApi | null;
  ownExtensionId?: string;
  // False when the site is excluded from icon services.
  allowThirdPartyFetch?: boolean;
  // A remote image the user configured explicitly.
  allowRemoteImage?: boolean;
}

interface FaviconDecisionDetails {
  pageUrl?: string;
  candidateKind?: string;
}

// Records why a candidate was blocked; true when it logged something new.
type FaviconDecisionLogger = (candidateUrl: unknown, reason: unknown, details?: FaviconDecisionDetails) => boolean | void;

interface FaviconDecisionLoggerOptions {
  surface?: string;
  consoleObj?: { debug?: (...values: unknown[]) => void } | null;
}

// The extension's own URL host and protocol.
interface ExtensionRuntimeInfo {
  id: string;
  protocol: string;
}

interface FaviconHostPolicy {
  // Never request an icon for the host.
  hardBlocked: boolean;
  // Do not contact the host directly; a service may still answer for it.
  avoidDirect: boolean;
}

interface FaviconHostPolicyOptions {
  shouldBlockFaviconForHost?: (hostname: string) => boolean;
  shouldAvoidDirectFaviconForHost?: (hostname: string) => boolean;
  // A service URL for an avoided host stays allowed.
  allowProxyAvoidDirect?: boolean;
}

type ThemeRgb = [number, number, number];

type ThemeColorConfidence = 'neutral' | 'color';

interface ThemeColorCandidate {
  accentRgb: ThemeRgb;
  source: string;
  neutral: boolean;
  confidence: ThemeColorConfidence;
  score: number;
}

// A manifest whose theme_color is still to be read.
interface ManifestThemeColorCandidate {
  manifestUrl: string;
  source: 'manifest';
  score: number;
}

type ThemeCandidate = ThemeColorCandidate | ManifestThemeColorCandidate;

interface ThemeFaviconUrlOptions {
  includeProxy?: boolean;
  includeChrome?: boolean;
}

interface FaviconResolverOptions {
  getRuntimeUrl?: RuntimeUrlGetter;
  chromeApi?: FaviconChromeApi | null;
  size?: number;
  isEnhancedFaviconFetchEnabled?: (pageUrl: string) => boolean;
  shouldBlockFaviconForHost?: (hostname: string) => boolean;
  shouldAvoidDirectFaviconForHost?: (hostname: string) => boolean;
  isBlockedLocalFaviconUrl?: (url: string, pageUrl?: string) => boolean;
  getExtensionFaviconUrl?: (pageUrl: string) => string;
  getBrowserPageFaviconUrl?: (pageUrl: string) => string;
  getGstaticFaviconUrl?: (pageUrl: string) => string;
  getChromeFaviconUrl?: (pageUrl: string) => string;
  // Why icon services are off for a page: 'global-off', 'exclusion', or ''.
  getStrictFaviconReason?: (pageUrl: string) => string;
  logFaviconDecision?: FaviconDecisionLogger;
}

interface FaviconResolverDependencies {
  config: FaviconResolverOptions;
  size: number;
  getRuntimeUrl: RuntimeUrlGetter | null;
  ownExtensionRuntime: ExtensionRuntimeInfo;
  hostPolicyOptions: Readonly<Required<Pick<FaviconHostPolicyOptions, 'shouldBlockFaviconForHost' | 'shouldAvoidDirectFaviconForHost'>>>;
  isBlockedLocalFaviconUrl: (url: string, pageUrl?: string) => boolean;
  customExtensionFaviconUrl: ((pageUrl: string) => string) | null;
  customBrowserPageFaviconUrl: ((pageUrl: string) => string) | null;
  customGstaticFaviconUrl: ((pageUrl: string) => string) | null;
  customChromeFaviconUrl: ((pageUrl: string) => string) | null;
  isEnhancedFaviconFetchEnabled: (pageUrl: string) => boolean;
  getStrictFaviconReason: (pageUrl: string) => string;
  logFaviconDecision: FaviconDecisionLogger;
}

interface FaviconSourceOptions {
  allowRemoteImage?: boolean;
  // Accept favicon.is for another page of the same host.
  allowDomainProxy?: boolean;
}

interface FaviconSourcePolicy {
  isBlockedFaviconPageUrl(pageUrl: unknown): boolean;
  isBlockedFaviconUrl(url: unknown, pageUrl?: unknown, candidateKind?: string, sourceOptions?: FaviconSourceOptions | null): boolean;
  // The URL as the page may load it, or '' when it is not allowed.
  getSafeFaviconCandidateUrl(value: unknown, pageUrl?: unknown, candidateKind?: string, sourceOptions?: FaviconSourceOptions | null): string;
}

interface FaviconSourceUrls {
  getExtensionFaviconUrl(pageUrl: unknown, options?: { browserCacheRequest?: boolean } | null): string;
  getBrowserPageFaviconUrl(pageUrl: unknown): string;
  getGstaticFaviconUrl(pageUrl: unknown): string;
  getChromeFaviconUrl(pageUrl: unknown): string;
  getOwnExtensionFaviconUrl(pageUrl: unknown): string;
}

interface PageFaviconCandidateOptions extends FaviconSourceOptions {
  includeChromeForHttp?: boolean;
  includeChromeForNonHttp?: boolean;
  includeChromeFallback?: boolean;
}

interface PageFaviconRenderCandidates {
  primaryUrl: string;
  // The browser's icon to fall back to, or ''.
  browserUrl: string;
}

interface PageFaviconCandidates {
  getPageFaviconCandidateUrl(pageUrl: unknown, candidateOptions?: PageFaviconCandidateOptions | null): string;
  getPageFaviconRenderCandidates(pageUrl: unknown, explicitUrl?: unknown, candidateOptions?: PageFaviconCandidateOptions | null): PageFaviconRenderCandidates;
  resolveFaviconSource(value: unknown, pageUrl: unknown, sourceOptions?: PageFaviconCandidateOptions | null): string;
  getProviderFaviconUrl(pageUrl: unknown, iconUrl: unknown): string;
}

type ShortcutFetchCandidateKind = 'favicon-is' | 'browser-cache' | 'proxy';

// A source a shortcut's icon is downloaded from, with the address of the
// placeholder that source answers for a site it has no icon for.
interface ShortcutFetchCandidate {
  kind: ShortcutFetchCandidateKind;
  url: string;
  placeholderUrl: string;
}

interface ShortcutFaviconCandidates {
  getShortcutFaviconCandidateUrl(pageUrl: unknown, localIconUrl?: unknown): string;
  getShortcutFaviconFetchUrl(pageUrl: unknown): string;
  getShortcutFaviconFetchCandidates(pageUrl: unknown, iconSource?: unknown): ShortcutFetchCandidate[];
}

type FaviconPlanCandidateKind = 'page-specific' | 'persisted-data' | 'persisted-url' | 'primary' | 'extension' | 'browser' | 'gstatic';

interface FaviconPlanCandidate {
  kind: FaviconPlanCandidateKind;
  url: string;
}

// What a surface knows about an icon to resolve.
interface FaviconPlanState {
  pageUrl?: string;
  url?: string;
  allowRemoteImage?: boolean;
  browserUrl?: string;
  skipPersisted?: boolean;
  persistedDataUrl?: string;
  persistedUrl?: string;
  pageSpecificUrl?: string;
  primaryUrl?: string;
  fallbackUrl?: string;
  extensionFavicon?: string;
  extensionUrl?: string;
  gstaticFavicon?: string;
  gstaticUrl?: string;
  // 'shortcut': live web sources are left to the shortcut icon snapshot.
  sourceProfile?: string;
}

type FaviconProxyCheckKind = 'extension' | 'gstatic' | '';

interface BrowserIconIndex {
  // Records a data: icon the browser reported for a page.
  add(pageUrl: unknown, iconUrl: unknown): void;
  // The page's icon, else the latest one for its host, else ''.
  get(pageUrl: unknown): string;
}

export type {
  BrowserIconIndex,
  EnhancedFetchPolicyOptions,
  ExtensionRuntimeInfo,
  FaviconChromeApi,
  FaviconDecisionDetails,
  FaviconDecisionLogger,
  FaviconDecisionLoggerOptions,
  FaviconHostPolicy,
  FaviconHostPolicyOptions,
  FaviconPlanCandidate,
  FaviconPlanCandidateKind,
  FaviconPlanState,
  FaviconProxyCheckKind,
  FaviconResolverDependencies,
  FaviconResolverOptions,
  FaviconSourceOptions,
  FaviconSourcePolicy,
  FaviconSourceUrls,
  FaviconTheme,
  FaviconUrlOptions,
  ManifestThemeColorCandidate,
  PageFaviconCandidateOptions,
  PageFaviconCandidates,
  PageFaviconRenderCandidates,
  RuntimeUrlGetter,
  ScoredFaviconUrl,
  ShortcutFaviconCandidates,
  ShortcutFetchCandidate,
  ShortcutFetchCandidateKind,
  ThemeCandidate,
  ThemeColorCandidate,
  ThemeColorConfidence,
  ThemeFaviconUrlOptions,
  ThemeRgb
};
