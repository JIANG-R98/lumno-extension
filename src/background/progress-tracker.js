(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoProgressTracker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  // Moves tracked pinned cards forward as the person watches or reads on.
  // Works from tab URLs and titles alone, so nothing is injected into pages.
  // A page counts once it has stayed in a tab the person is looking at (or
  // listening to) for the dwell time; passing through never moves a card.
  const DEFAULT_DWELL_MS = 15000;

  function createProgressTracker(options) {
    const config = options && typeof options === 'object' ? options : {};
    const chromeApi = config.chromeApi;
    const progressMatch = config.progressMatch;
    const progressHistory = config.progressHistory;
    const getPinnedArea = config.getPinnedArea;
    const historyArea = config.historyArea;
    const pinnedKey = config.pinnedKey;
    const isEnabled = typeof config.isEnabled === 'function' ? config.isEnabled : () => true;
    const dwellMs = Number.isFinite(Number(config.dwellMs)) ? Number(config.dwellMs) : DEFAULT_DWELL_MS;
    const now = typeof config.now === 'function' ? config.now : Date.now;
    const setTimer = typeof config.setTimer === 'function'
      ? config.setTimer
      : (callback, delay) => setTimeout(callback, delay);
    const clearTimer = typeof config.clearTimer === 'function'
      ? config.clearTimer
      : (timerId) => clearTimeout(timerId);
    // tabId → { url, timer, waiting, settled }
    const candidates = new Map();
    let queue = Promise.resolve();

    function readLastError() {
      return chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
    }

    function storageGet(area, key) {
      return new Promise((resolve) => {
        if (!area || typeof area.get !== 'function') {
          resolve({});
          return;
        }
        area.get([key], (result) => {
          resolve(readLastError() ? {} : (result || {}));
        });
      });
    }

    function storageSet(area, value) {
      return new Promise((resolve, reject) => {
        if (!area || typeof area.set !== 'function') {
          reject(new Error('storage-unavailable'));
          return;
        }
        area.set(value, () => {
          const error = readLastError();
          if (error) reject(new Error(error.message || 'storage-error'));
          else resolve();
        });
      });
    }

    function getTab(tabId) {
      return new Promise((resolve) => {
        if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.get !== 'function') {
          resolve(null);
          return;
        }
        chromeApi.tabs.get(tabId, (tab) => {
          resolve(readLastError() ? null : (tab || null));
        });
      });
    }

    function isTrackableTab(tab) {
      return Boolean(tab && Number.isInteger(tab.id) && !tab.incognito &&
        /^https?:\/\//i.test(String(tab.url || '')));
    }

    function isEngaged(tab) {
      return Boolean(tab && (tab.active || tab.audible));
    }

    function forget(tabId) {
      const candidate = candidates.get(tabId);
      if (candidate && candidate.timer) clearTimer(candidate.timer);
      candidates.delete(tabId);
    }

    function startDwell(tabId, url) {
      forget(tabId);
      const candidate = { url, timer: 0, waiting: false, settled: false };
      candidate.timer = setTimer(() => {
        candidate.timer = 0;
        void settle(tabId, candidate);
      }, dwellMs);
      candidates.set(tabId, candidate);
    }

    function observe(tab) {
      if (!isEnabled() || !isTrackableTab(tab)) {
        if (tab && Number.isInteger(tab.id)) forget(tab.id);
        return;
      }
      const candidate = candidates.get(tab.id);
      if (candidate && candidate.url === tab.url) {
        // The dwell ran out while the tab was in the background; it starts
        // over once the person comes back to it.
        if (candidate.waiting && isEngaged(tab)) startDwell(tab.id, tab.url);
        return;
      }
      startDwell(tab.id, tab.url);
    }

    function settle(tabId, candidate) {
      return getTab(tabId).then((tab) => {
        if (candidates.get(tabId) !== candidate) return null;
        if (!tab || tab.url !== candidate.url) {
          forget(tabId);
          return null;
        }
        if (!isEngaged(tab)) {
          candidate.waiting = true;
          return null;
        }
        candidate.settled = true;
        return enqueue(() => advance(tab));
      });
    }

    function enqueue(task) {
      const run = queue.then(task, task);
      queue = run.catch(() => {});
      return run;
    }

    function getPageTitle(tab) {
      const title = String(tab && tab.title || '').replace(/\s+/g, ' ').trim();
      return title && title !== tab.url ? title : '';
    }

    // Finds the tracked card this page continues and moves it forward. The
    // version it leaves goes into the history first, so it can be restored.
    async function advance(tab) {
      if (!isEnabled()) return { changed: false, reason: 'disabled' };
      const pinnedArea = typeof getPinnedArea === 'function' ? getPinnedArea() : null;
      const stored = await storageGet(pinnedArea, pinnedKey);
      const items = Array.isArray(stored[pinnedKey]) ? stored[pinnedKey] : [];
      const page = { url: tab.url, title: getPageTitle(tab) };
      // A site can have several tracked works; the URL pattern outranks a
      // title match when more than one card could continue here.
      let targetIndex = -1;
      let comparison = null;
      items.forEach((item, index) => {
        if (!item || item.progressTracking !== true) return;
        const result = progressMatch.compareProgressPages({ url: item.url, title: item.title }, page);
        if (!progressMatch.shouldAdvance(result)) return;
        if (!comparison || (comparison.confidence !== 'high' && result.confidence === 'high')) {
          targetIndex = index;
          comparison = result;
        }
      });
      if (targetIndex < 0) return { changed: false, reason: 'no-match' };
      if (items.some((item, index) => index !== targetIndex && item && item.url === page.url)) {
        return { changed: false, reason: 'url-conflict' };
      }

      const previous = items[targetIndex];
      const timestamp = Math.max(0, Number(now()) || 0);
      const historyId = progressHistory.getHistoryId(previous, progressMatch);
      const historyKey = progressHistory.STORAGE_KEY;
      const storedHistory = await storageGet(historyArea, historyKey);
      const nextHistory = progressHistory.recordVersion(storedHistory[historyKey], historyId, {
        url: previous.url,
        title: previous.title,
        updatedAt: timestamp
      });
      // The site name can come from the old title, so New Tab derives it again.
      const { siteName: _staleSiteName, ...card } = previous;
      const nextItems = items.slice();
      nextItems[targetIndex] = {
        ...card,
        url: page.url,
        title: page.title || previous.title,
        lastVisitTime: timestamp
      };
      try {
        await storageSet(historyArea, { [historyKey]: nextHistory });
        await storageSet(pinnedArea, { [pinnedKey]: nextItems });
      } catch (error) {
        return { changed: false, reason: 'storage-error' };
      }
      return { changed: true, reason: comparison.reason, confidence: comparison.confidence };
    }

    function attach() {
      const tabs = chromeApi && chromeApi.tabs;
      if (!tabs) return false;
      if (tabs.onUpdated && typeof tabs.onUpdated.addListener === 'function') {
        tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
          if (!changeInfo || !(changeInfo.url || changeInfo.status === 'complete' ||
              Object.prototype.hasOwnProperty.call(changeInfo, 'audible'))) {
            return;
          }
          observe({ ...tab, id: tabId });
        });
      }
      if (tabs.onActivated && typeof tabs.onActivated.addListener === 'function') {
        tabs.onActivated.addListener((activeInfo) => {
          const tabId = Number(activeInfo && activeInfo.tabId);
          if (!Number.isInteger(tabId) || !candidates.has(tabId)) return;
          void getTab(tabId).then((tab) => {
            if (tab) observe(tab);
          });
        });
      }
      if (tabs.onRemoved && typeof tabs.onRemoved.addListener === 'function') {
        tabs.onRemoved.addListener((tabId) => forget(tabId));
      }
      if (tabs.onReplaced && typeof tabs.onReplaced.addListener === 'function') {
        tabs.onReplaced.addListener((_addedTabId, removedTabId) => forget(removedTabId));
      }
      return true;
    }

    return Object.freeze({
      attach,
      observe,
      advance: (tab) => enqueue(() => advance(tab)),
      getPendingCount: () => candidates.size
    });
  }

  return Object.freeze({ DEFAULT_DWELL_MS, createProgressTracker });
});
