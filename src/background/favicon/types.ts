// The shapes the worker's favicon modules share.
import type { CachedIconMap } from '../../domain/favicon/shortcut-favicon';
import type { SiteSearchProvider } from '../../domain/search/types';
import type { ShortcutIconMap } from '../../domain/shortcut-icon-map';
import type { GroupedShortcutItem } from '../../domain/shortcuts-store';
import type { ShortcutFaviconData } from '../../domain/messages';
import type { ShortcutFetchCandidateKind } from '../../domain/favicon/types';


// What the favicon policy allows for a page and its host.
type FaviconTargetPolicy =
  | { ok: false; inputUrl: string; parsed: URL | null }
  | {
    ok: true;
    inputUrl: string;
    parsed: URL;
    normalizedHost: string;
    hardBlocked: boolean;
    avoidDirect: boolean;
    // The person excluded the page from favicon requests.
    requestBlacklisted: boolean;
    directFetchBlocked: boolean;
  };

interface ScoredCandidate {
  url: string;
  score: number;
}

// A source a shortcut icon is downloaded from, as one attempt sees it.
interface ShortcutResourceCandidate {
  url: string;
  kind: ShortcutFetchCandidateKind;
  placeholderUrl?: string;
  refresh?: boolean;
  declaredSize?: number;
  vector?: boolean;
}

// A downloaded shortcut icon.
interface ShortcutIconResult extends ShortcutFaviconData {
  sourceUrl: string;
  width: number;
  height: number;
  vector: boolean;
  pageUrl: string;
}

// The New Tab shortcut data that picks site-search icons.
interface SiteSearchShortcutIconSources {
  shortcuts: GroupedShortcutItem[];
  shortcutIcons: ShortcutIconMap;
  shortcutFavicons: CachedIconMap;
}

interface SiteSearchIconWarmItem {
  provider: SiteSearchProvider;
  pageUrl: string;
  explicitIcon: string;
  preferredTheme: string;
}

export type {
  FaviconTargetPolicy,
  ScoredCandidate,
  ShortcutIconResult,
  ShortcutResourceCandidate,
  SiteSearchIconWarmItem,
  SiteSearchShortcutIconSources
};
