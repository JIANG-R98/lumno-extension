// What the remote content module hands out: the daily quote and wallpapers
// from Bing or the bundled catalog.

// A quote from Hitokoto, or the stand-in shown without one.
interface DailyQuote {
  text: string;
  source: string;
  author: string;
  url: string;
}

// A wallpaper from Bing or the bundled catalog, as the panel lists it and
// the page shows it.
interface RemoteWallpaper {
  id: string;
  provider: 'bing' | 'curated';
  name: string;
  sourceUrl: string;
  // A curated photo's category; for a daily pick, the one it draws from.
  category?: string;
  // Stands for a photo picked anew each day.
  daily?: boolean;
  // The photo a daily pick shows today.
  dailyId?: string;
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  // Downscaled and cached once per device.
  cacheImage?: boolean;
  // A Bing photo's publishing date (YYYYMMDD) and image ID.
  date?: string;
  rawId?: string;
  copyright?: string;
}

export type { DailyQuote, RemoteWallpaper };
