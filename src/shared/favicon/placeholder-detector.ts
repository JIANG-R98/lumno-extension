// Tells the browser's blank stand-in for a page without an icon from a real
// icon: the extension favicon URL of a page that cannot have one draws the
// stand-in, and an image that draws the same pixels is that stand-in.
import * as BoundedCache from '../../domain/bounded-cache';
import { readImageSignature } from './favicon-pixels';

type PlaceholderCheck = (img: HTMLImageElement, faviconUrl: string) => unknown;

// The browser's favicon URL for a page that has no icon, to learn what its
// blank stand-in looks like.
function buildPlaceholderProbeUrl(faviconUrl: string): string {
  try {
    const parsed = new URL(String(faviconUrl || ''));
    if (parsed.protocol !== 'chrome-extension:' || !parsed.pathname.startsWith('/_favicon/')) {
      return '';
    }
    parsed.searchParams.set('pageUrl', 'https://lumno.invalid/__favicon_placeholder_probe__');
    return parsed.toString();
  } catch (_error) {
    return '';
  }
}

class PlaceholderDetector {
  // The stand-in's signature by probe URL.
  private readonly probes = new Map<string, Promise<string>>();
  private readonly doc: Document | null;
  private readonly createImage: () => HTMLImageElement | null;
  private readonly maxEntries: number;
  private readonly check: PlaceholderCheck | null;

  constructor(doc: Document | null, createImage: () => HTMLImageElement | null, maxEntries: number, check: PlaceholderCheck | null) {
    this.doc = doc;
    this.createImage = createImage;
    this.maxEntries = maxEntries;
    this.check = check;
  }

  // Whether the image is the browser's blank stand-in for a missing icon.
  readonly detect = (img: HTMLImageElement, faviconUrl: string): Promise<boolean> => {
    if (this.check) {
      return Promise.resolve(this.check(img, faviconUrl))
        .then(Boolean)
        .catch(() => false);
    }
    const currentSignature = readImageSignature(this.doc, img);
    if (!currentSignature) {
      return Promise.resolve(false);
    }
    return this.readPlaceholderSignature(faviconUrl)
      .then((placeholderSignature) => Boolean(placeholderSignature && placeholderSignature === currentSignature))
      .catch(() => false);
  };

  private readPlaceholderSignature(faviconUrl: string): Promise<string> {
    const probeUrl = buildPlaceholderProbeUrl(faviconUrl);
    if (!probeUrl) {
      return Promise.resolve('');
    }
    const cached = this.probes.get(probeUrl);
    if (cached) {
      return cached;
    }
    return BoundedCache.setBoundedCacheEntry(this.probes, probeUrl, this.loadSignature(probeUrl), this.maxEntries);
  }

  private loadSignature(url: string): Promise<string> {
    return new Promise((resolve) => {
      const probe = this.createImage();
      if (!probe) {
        resolve('');
        return;
      }
      probe.onload = () => resolve(readImageSignature(this.doc, probe));
      probe.onerror = () => resolve('');
      probe.src = url;
    });
  }
}

export type { PlaceholderCheck };
export { PlaceholderDetector };
