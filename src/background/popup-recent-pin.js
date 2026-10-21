(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoPopupRecentPin = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  // Pins the toolbar popup's page among the New Tab's recent sites, in the
  // list the New Tab keeps (one card per site, a tracked card per work). An
  // episode or chapter starts tracked, as when it is pinned on the New Tab.
  function createController(options) {
    const opts = options || {};
    const store = opts.store;
    const key = String(opts.key || '');
    const storeOptions = opts.storeOptions || {};
    const maxPinned = Number(storeOptions.maxPinned) || 3;
    const getArea = typeof opts.getArea === 'function' ? opts.getArea : () => null;
    const ready = typeof opts.ready === 'function' ? opts.ready : () => Promise.resolve();
    const probeSeries = typeof opts.probeSeries === 'function' ? opts.probeSeries : () => Promise.resolve(false);
    const createProgressId = typeof opts.createProgressId === 'function'
      ? opts.createProgressId
      : (now) => `p${Number(now).toString(36)}`;
    let chain = Promise.resolve();

    function toItem(page) {
      const url = String((page && page.url) || '');
      if (!/^https?:\/\//i.test(url)) return null;
      return store.normalizeRecentSiteItem({ url, title: String(page.title || '') }, {
        ...storeOptions,
        ignoreBlacklist: true
      });
    }

    async function readPinned() {
      await ready();
      return store.loadPinnedRecentSites(getArea(), { ...storeOptions, key });
    }

    function findPinned(pinned, item) {
      return pinned.findIndex((pinnedItem) => store.isSamePinnedRecentSite(pinnedItem, item, storeOptions));
    }

    // available: the page can be pinned at all; pinned: it (or its site) is;
    // full: nothing more fits.
    async function getStatus(page) {
      const item = toItem(page);
      if (!item) return { available: false, pinned: false, full: false };
      const pinned = await readPinned();
      return {
        available: true,
        pinned: findPinned(pinned, item) >= 0,
        full: pinned.length >= maxPinned
      };
    }

    // Unpins what the popup showed as pinned, otherwise pins the page in
    // front. One toggle at a time, so two quick clicks read each other's list.
    function toggle(page) {
      const job = chain.catch(() => {}).then(async () => {
        const item = toItem(page);
        if (!item) return { status: 'invalid' };
        const pinned = await readPinned();
        const index = findPinned(pinned, item);
        const save = (items) => store.savePinnedRecentSites(getArea(), items, { ...storeOptions, key });
        if (index >= 0) {
          await save(pinned.filter((_, position) => position !== index));
          return { status: 'unpinned' };
        }
        if (pinned.length >= maxPinned) return { status: 'limit' };
        const tracking = await probeSeries(item.url).then((series) => series === true, () => false);
        const now = Date.now();
        await save([{
          ...item,
          pinnedAt: now,
          ...(tracking ? { progressTracking: true, progressId: createProgressId(now) } : {})
        }].concat(pinned));
        return { status: 'pinned', tracking };
      });
      chain = job;
      return job.catch((error) => {
        console.warn('[Lumno] Could not pin the page to recent sites.', error);
        return { status: 'failed' };
      });
    }

    return { getStatus, toggle };
  }

  return Object.freeze({ createController });
});
