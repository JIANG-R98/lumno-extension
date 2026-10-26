// The shapes of shortcut and site-search icons.
import type { SiteSearchProvider } from '../../search/types';

// What the icon helpers read from a site search provider.
type IconProvider = Partial<Pick<SiteSearchProvider, 'key' | 'builtinKey' | 'template' | 'icon' | 'iconUrl'>>;

// A saved icon for one page.
interface CachedIcon {
  dataUrl: string;
  // Where the image came from: the page's own icon, a favicon service or
  // the browser's favicon cache.
  sourceUrl: string;
  updatedAt: number;
  // Copied from the icon chosen for a shortcut to the same site.
  fromShortcut?: true;
}

// Saved icons keyed by page URL (getCacheKey).
type CachedIconMap = Record<string, CachedIcon>;

interface IconCacheOptions {
  // 0 keeps icons until their page is removed.
  cacheTtlMs: number;
  cacheMaxEntries: number;
  maxDataUrlLength: number;
}

// How a saved icon was obtained, as the shortcut editor names it.
type CachedIconSource = 'favicon-is' | 'service' | 'cache';

// Where a page declares an icon, or a well-known address tried without one.
type IconCandidateSource = 'icon' | 'apple-touch-icon' | 'manifest' | 'root-svg' | 'root';

interface IconCandidate {
  url: string;
  source: IconCandidateSource;
  // The largest square size declared; Infinity for a vector or "any".
  declaredSize: number;
  vector: boolean;
  // A manifest icon's purpose ('any', 'maskable', ...), or ''.
  purpose: string;
  // How well the icon matches the preferred light or dark theme.
  themeScore: number;
  score: number;
}

interface IconCandidateOptions {
  source?: IconCandidateSource;
  declaredSize?: number;
  vector?: boolean;
  purpose?: string;
  themeScore?: number;
}

interface IconDimensions {
  width: number;
  height: number;
}

// What a downloaded icon file turned out to be.
interface IconResourceInfo {
  // Large enough to show crisply.
  usable: boolean;
  vector: boolean;
  width: number;
  height: number;
  mimeType: string;
}

interface IconInspectOptions {
  // Smallest longer side accepted, between 16 and MIN_ICON_DIMENSION.
  minDimension?: number;
}

interface SiteSearchIconOptions extends Partial<IconCacheOptions> {
  // The extension URL of a bundled asset path.
  resolveAssetUrl?: (assetPath: string) => string;
}

export type {
  CachedIcon,
  CachedIconMap,
  CachedIconSource,
  IconCacheOptions,
  IconCandidate,
  IconCandidateOptions,
  IconCandidateSource,
  IconDimensions,
  IconInspectOptions,
  IconProvider,
  IconResourceInfo,
  SiteSearchIconOptions
};
