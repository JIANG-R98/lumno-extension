// Where each tab is, and the page it was on before: how a person got to a
// page weighs in on whether it continues a tracked card.
import type { Trail } from './types';

function isHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// Where each tab is, and the page it was on before.
class TabTrails {
  private readonly trails = new Map<number, Trail>();

  get(tabId: number): Trail | undefined {
    return this.trails.get(tabId);
  }

  remember(tabId: number, url: string | undefined, title: string | undefined): void {
    const entry = this.trails.get(tabId) || { url: '', title: '', previousUrl: '', previousTitle: '' };
    if (url && url !== entry.url) {
      // A blank or internal page in between (a new tab's first load) keeps
      // the page the tab really came from.
      const cameFrom = isHttpUrl(entry.url)
        ? { previousUrl: entry.url, previousTitle: entry.title }
        : { previousUrl: entry.previousUrl, previousTitle: entry.previousTitle };
      this.trails.set(tabId, { url, title: String(title || ''), ...cameFrom });
      return;
    }
    if (title) this.trails.set(tabId, { ...entry, title: String(title) });
  }

  // A tab opened from a page came from that page.
  openedFrom(tab: chrome.tabs.Tab | null | undefined): void {
    const openerTabId = Number(tab && tab.openerTabId);
    const opener = Number.isInteger(openerTabId) ? this.trails.get(openerTabId) : null;
    if (!tab || typeof tab.id !== 'number' || !Number.isInteger(tab.id) || !opener || !isHttpUrl(opener.url)) return;
    this.trails.set(tab.id, { url: '', title: '', previousUrl: opener.url, previousTitle: opener.title });
  }

  replace(addedTabId: number, removedTabId: number): void {
    const trail = this.trails.get(removedTabId);
    if (trail) this.trails.set(addedTabId, trail);
    this.trails.delete(removedTabId);
  }

  forget(tabId: number): void {
    this.trails.delete(tabId);
  }
}

export { TabTrails, isHttpUrl };
