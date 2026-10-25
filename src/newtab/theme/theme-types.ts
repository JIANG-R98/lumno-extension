// Types the New Tab theme modules share.
import type { SiteSearchProvider } from '../../domain/search/types';

// What a theme is resolved for: a suggestion row, a card or a tile.
interface ThemeSubject {
  type?: string;
  url?: string;
  title?: string;
  favicon?: string;
  provider?: Partial<SiteSearchProvider> | null;
  // A shortcut's uploaded icon, which its tint comes from.
  customIconDataUrl?: string;
}

// Where a theme came from, from the strongest to the weakest.
type ThemeSource = 'brand' | 'mask-icon' | 'meta' | 'manifest' | 'favicon' | 'url' | 'fallback';

type ThemeConfidence = 'color' | 'neutral';

export type { ThemeConfidence, ThemeSource, ThemeSubject };
