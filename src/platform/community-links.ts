// Community links as pages use them: the website's current list, loaded
// once per page, and the store links of the store this install came from.
// The pure parts come from domain/community-links.ts.
import * as links from '../domain/community-links';
import type { CommunityLinks, StoreListing } from '../domain/community-links';

interface FetchResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
}

type FetchLike = (url: string, init: { cache: 'no-store'; signal?: AbortSignal }) => Promise<FetchResponseLike>;

interface TimerRuntime {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout?(id: unknown): void;
}

interface AbortControllerLike {
  signal: AbortSignal;
  abort(): void;
}

type AbortControllerConstructor = new () => AbortControllerLike;

interface CommunityLoaderOptions {
  fetchImpl?: FetchLike | null;
  windowObj?: TimerRuntime | null;
  AbortControllerImpl?: AbortControllerConstructor | null;
}

interface CommunityLoadOptions extends CommunityLoaderOptions {
  // Load again even after a load this page session.
  force?: boolean;
  timeoutMs?: number;
  url?: string;
}

interface CommunityLinksLoader {
  getLinks(): Readonly<CommunityLinks>;
  // Resolves with the website's list, or the fallbacks when it cannot load.
  load(loadOptions?: CommunityLoadOptions | null): Promise<Readonly<CommunityLinks>>;
}

interface RuntimeChromeApi {
  runtime?: { id?: string };
}

function getRuntimeExtensionId(): string {
  const chromeApi: RuntimeChromeApi | undefined = typeof globalThis !== 'undefined' ? globalThis.chrome : undefined;
  const runtime = chromeApi && chromeApi.runtime;
  return runtime && runtime.id ? String(runtime.id) : '';
}

// An explicit extension id, or this install's.
function resolveExtensionId(extensionId: unknown): string {
  return extensionId === undefined ? getRuntimeExtensionId() : String(extensionId || '');
}

function isEdgeAddonsInstall(extensionId?: string): boolean {
  return links.isEdgeAddonsInstall(resolveExtensionId(extensionId));
}

function isFirefoxInstall(extensionId?: string): boolean {
  return links.isFirefoxInstall(resolveExtensionId(extensionId));
}

function getReviewUrl(source: Partial<CommunityLinks> | null | undefined, extensionId?: string): string {
  return links.getReviewUrl(source, resolveExtensionId(extensionId));
}

function getStoreListing(extensionId?: string): Readonly<StoreListing> {
  return links.getStoreListing(resolveExtensionId(extensionId));
}

function getGlobalFetch(): FetchLike | null {
  return typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : null;
}

function getGlobalAbortController(): AbortControllerConstructor | null {
  return typeof globalThis !== 'undefined' && typeof globalThis.AbortController === 'function'
    ? globalThis.AbortController
    : null;
}

// Aborts the request after the timeout, when the page can abort requests.
function startAbortTimeout(
  settings: CommunityLoadOptions,
  config: CommunityLoaderOptions
): { signal: AbortSignal | undefined; clear(): void } {
  const timeoutRuntime: TimerRuntime | null = settings.windowObj || config.windowObj ||
    (typeof globalThis !== 'undefined' ? globalThis : null);
  const AbortControllerImpl = settings.AbortControllerImpl || config.AbortControllerImpl || getGlobalAbortController();
  const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
  const timeoutMs = Number.isFinite(Number(settings.timeoutMs))
    ? Math.max(0, Number(settings.timeoutMs))
    : links.FETCH_TIMEOUT_MS;
  const timeoutId = controller && timeoutRuntime
    ? timeoutRuntime.setTimeout(() => controller.abort(), timeoutMs)
    : 0;
  return {
    signal: controller ? controller.signal : undefined,
    clear() {
      if (timeoutId && timeoutRuntime && typeof timeoutRuntime.clearTimeout === 'function') {
        timeoutRuntime.clearTimeout(timeoutId);
      }
    }
  };
}

function createLoader(options?: CommunityLoaderOptions | null): Readonly<CommunityLinksLoader> {
  const config = options && typeof options === 'object' ? options : {};
  let currentLinks: Readonly<CommunityLinks> = links.FALLBACK_LINKS;
  let loaded = false;
  let loadingPromise: Promise<Readonly<CommunityLinks>> | null = null;

  function getLinks(): Readonly<CommunityLinks> {
    return currentLinks;
  }

  function load(loadOptions?: CommunityLoadOptions | null): Promise<Readonly<CommunityLinks>> {
    const settings = loadOptions && typeof loadOptions === 'object' ? loadOptions : {};
    const force = settings.force === true;
    if (!force && loaded) {
      return Promise.resolve(currentLinks);
    }
    if (loadingPromise) {
      return loadingPromise;
    }
    const fetchImpl = settings.fetchImpl || config.fetchImpl || getGlobalFetch();
    if (!fetchImpl) {
      return Promise.resolve(currentLinks);
    }
    const abort = startAbortTimeout(settings, config);
    loadingPromise = Promise.resolve(fetchImpl(settings.url || links.COMMUNITY_LINKS_URL, {
      cache: 'no-store',
      signal: abort.signal
    }))
      .then((response) => {
        if (!response || !response.ok || typeof response.json !== 'function') {
          throw new Error('community links unavailable');
        }
        return response.json();
      })
      .then((payload) => {
        currentLinks = links.normalizeLinksPayload(payload);
        loaded = true;
        return currentLinks;
      })
      .catch(() => {
        // Cache the fallback for this page session. A forced load remains
        // available for user-triggered refreshes without retrying on every
        // consumer after an offline or timed-out request.
        loaded = true;
        return currentLinks;
      })
      .finally(() => {
        abort.clear();
        loadingPromise = null;
      });
    return loadingPromise;
  }

  return Object.freeze({ getLinks, load });
}

const defaultLoader = createLoader();
const getLinks = defaultLoader.getLinks;
const load = defaultLoader.load;

export {
  COMMUNITY_LINKS_URL,
  EDGE_ADDONS_EXTENSION_ID,
  FALLBACK_LINKS,
  FETCH_TIMEOUT_MS,
  FIREFOX_ADDONS_URL,
  STORE_LISTINGS,
  WEB_ORIGIN,
  buildFreshQrUrl,
  getCommunityChannel,
  getCommunityUrl,
  getHelpSearchIndexUrl,
  getHelpSearchSynonymsUrl,
  getHelpUrl,
  normalizeHttpsUrl,
  normalizeLinksPayload,
  normalizeWebLocale
} from '../domain/community-links';
export {
  createLoader,
  getLinks,
  getReviewUrl,
  getRuntimeExtensionId,
  getStoreListing,
  isEdgeAddonsInstall,
  isFirefoxInstall,
  load
};
export type {
  AbortControllerConstructor,
  CommunityLinksLoader,
  CommunityLoadOptions,
  CommunityLoaderOptions,
  FetchLike,
  FetchResponseLike,
  TimerRuntime
};
