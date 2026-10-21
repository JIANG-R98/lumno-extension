(function(root) {
  // Wallpapers the user adds: imported files and URLs, link wallpapers,
  // saving an online wallpaper locally, caching wallpaper images (including
  // tomorrow's daily ones), the online wallpaper menu, and deleting.
  function createCustomWallpapers(deps) {
    const {
      showToast,
      formatMessage,
      renderWallpaperPanelState,
      beginToast,
      t,
      buildCustomWallpaperRecordFromFile,
      writeCustomWallpaperRecord,
      normalizeCustomWallpaperRecord,
      persistNewtabWallpaper,
      options,
      windowObj,
      getCachedWallpaperImage,
      cachedWallpaperImages,
      mergeCustomWallpaperRecords,
      wallpaperImageCache,
      warnWallpaperStoreFailure,
      NEWTAB_WALLPAPER_MODES,
      applyResolvedNewtabWallpaper,
      getEffectiveWallpaperIdForMode,
      REMOTE_CONTENT,
      getWallpaperById,
      window,
      writeWallpaperPreloadCache,
      waitForDocumentLoad,
      getShownWallpaperCopy,
      dailyWallpaperStandIns,
      writeStorageValue,
      storageArea,
      NEWTAB_LINK_WALLPAPERS_STORAGE_KEY,
      hideTopActionTooltip,
      getWritableWallpaperPrefs,
      NEWTAB_WALLPAPER_DEFAULT_ID,
      setWallpaperPrefs,
      getWritableLocalWallpaperOverrides,
      writeCurrentWallpaperPrefs,
      remoteClient,
      loadCustomWallpapers,
      document,
      getWallpaperPanelRefs,
      getCustomWallpaperById,
      deleteCustomWallpaperRecord,
      NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE,
      writeLocalWallpaperValue,
      buildLocalWallpaperStorageValue
    } = deps;

    // The runtime state object shared with wallpaper.js and the other modules.
    const wallpaperState = deps.wallpaperState;

    // Tomorrow's curated photo downloads once the page idles, or after this long at the latest.
    const UPCOMING_WALLPAPER_IDLE_TIMEOUT_MS = 30000;
    const wallpaperImageCaching = new Map();
    // The upcoming photos the page has scheduled to cache, so repeated applies do not queue them again.
    let upcomingWallpaperCacheKey = '';
    const LINK_WALLPAPER_ID_PATTERN = /^link-[a-z0-9]{4,32}$/;
    const LINK_WALLPAPER_URL_MAX_LENGTH = 2048;
    // chrome.storage.sync holds 8 KB per item; normalized URLs are ASCII, so length counts bytes.
    const LINK_WALLPAPERS_MAX_BYTES = 8000;
    // Uploads and links together. A library already past this keeps every wallpaper; only adding stops.
    const LOCAL_WALLPAPER_LIMIT = 30;
    // The online photo the save menu is open for.
    let onlineWallpaperMenu = null;
    let onlineWallpaperMenuTarget = null;

    function isLocalWallpaperLibraryFull() {
      return wallpaperState.customWallpapers.length + wallpaperState.linkWallpapers.length >= LOCAL_WALLPAPER_LIMIT;
    }

    function showLocalWallpaperLimitToast() {
      showToast(formatMessage('newtab_wallpaper_local_limit',
        'You can keep up to {count} local wallpapers. Delete some and try again.',
        { count: LOCAL_WALLPAPER_LIMIT }), true);
    }

    function importCustomWallpaperFile(file) {
      if (!file || wallpaperState.customWallpaperImporting) {
        return;
      }
      if (isLocalWallpaperLibraryFull()) {
        showLocalWallpaperLimitToast();
        return;
      }
      wallpaperState.customWallpaperImporting = true;
      renderWallpaperPanelState();
      const toastTask = beginToast(t('newtab_wallpaper_importing', 'Importing wallpaper…'));
      buildCustomWallpaperRecordFromFile(file).then((record) => {
        return writeCustomWallpaperRecord(record).then(() => record);
      }).then((record) => {
        const nextWallpaper = normalizeCustomWallpaperRecord(record);
        if (!nextWallpaper) {
          throw new Error('Invalid wallpaper record.');
        }
        wallpaperState.customWallpapers = wallpaperState.customWallpapers.concat(nextWallpaper);
        persistNewtabWallpaper(nextWallpaper.id);
        renderWallpaperPanelState();
        toastTask.done(t('newtab_wallpaper_import_done', 'Wallpaper imported'));
      }).catch(() => {
        toastTask.fail(t('newtab_wallpaper_import_error', 'Failed to import wallpaper'));
      }).finally(() => {
        wallpaperState.customWallpaperImporting = false;
        renderWallpaperPanelState();
      });
    }

    function normalizeCustomWallpaperUrl(value) {
      try {
        const url = new URL(String(value || '').trim());
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
      } catch (_error) {
        return '';
      }
    }

    function getCustomWallpaperUrlName(url) {
      try {
        const parsed = new URL(url);
        const file = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
        return (file.replace(/\.[^.]+$/, '') || parsed.hostname).slice(0, 80);
      } catch (_error) {
        return '';
      }
    }

    // Some hosts label images as generic binaries; the file extension then names the type.
    function getCustomWallpaperUrlMimeType(url, type) {
      const mime = String(type || '').split(';')[0].trim().toLowerCase();
      if (mime.startsWith('image/')) return mime === 'image/jpg' ? 'image/jpeg' : mime;
      const extension = (/\.([a-z0-9]{3,4})$/i.exec(new URL(url).pathname) || [])[1] || '';
      return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension.toLowerCase()] || mime;
    }

    async function fetchCustomWallpaperFile(url) {
      const fetcher = typeof options.fetchRemoteContent === 'function'
        ? options.fetchRemoteContent
        : windowObj.fetch.bind(windowObj);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetcher(url, {
          signal: controller.signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer'
        });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status}).`);
        }
        const blob = await response.blob();
        return new File([blob], getCustomWallpaperUrlName(response.url || url), {
          type: getCustomWallpaperUrlMimeType(response.url || url, blob.type)
        });
      } finally {
        clearTimeout(timer);
      }
    }

    function setCustomWallpaperUrlFormOpen(open) {
      const nextOpen = Boolean(open);
      if (wallpaperState.customWallpaperUrlFormOpen !== nextOpen) {
        wallpaperState.customWallpaperUrlFormOpen = nextOpen;
        wallpaperState.customWallpaperUrlInvalid = false;
        renderWallpaperPanelState();
      }
      if (nextOpen && wallpaperState.wallpaperViewController) {
        wallpaperState.wallpaperViewController.focus('urlInput');
      }
    }
    function isLinkWallpaperId(id) {
      return LINK_WALLPAPER_ID_PATTERN.test(String(id || ''));
    }

    function normalizeLinkWallpapers(value) {
      const ids = new Set();
      return (Array.isArray(value) ? value : []).map((entry) => ({
        id: String(entry && entry.id || ''),
        url: normalizeCustomWallpaperUrl(entry && entry.url),
        addedAt: Number(entry && entry.addedAt) || 0
      })).filter((entry) => {
        if (!isLinkWallpaperId(entry.id) || !entry.url || ids.has(entry.id)) return false;
        ids.add(entry.id);
        return true;
      });
    }

    function setLinkWallpapers(value) {
      const next = normalizeLinkWallpapers(value);
      const changed = JSON.stringify(next) !== JSON.stringify(wallpaperState.linkWallpapers);
      wallpaperState.linkWallpapers = next;
      return changed;
    }

    function getLinkWallpaperById(id) {
      const entry = wallpaperState.linkWallpapers.find((item) => item.id === id);
      if (!entry) return null;
      const cached = getCachedWallpaperImage(id, entry.url);
      return {
        id,
        url: entry.url,
        name: getCustomWallpaperUrlName(entry.url),
        imageDataUrl: cached ? cached.imageDataUrl : '',
        thumbnailDataUrl: cached ? cached.thumbnailDataUrl : '',
        updatedAt: entry.addedAt
      };
    }

    // The preload already reads the shown photo's copy; take it instead of opening the cache again.
    function takePreloadedWallpaperImage() {
      const wallpaperPreload = globalThis.LumnoNewtabWallpaperPreload;
      const ready = wallpaperPreload && !wallpaperPreload.customImageId && wallpaperPreload.imageReady;
      if (!ready || typeof ready.then !== 'function') return Promise.resolve();
      wallpaperPreload.imageReady = null;
      return ready.then(() => {
        const record = wallpaperPreload.cachedImageRecord;
        if (record && record.id && record.imageDataUrl && !cachedWallpaperImages.has(record.id)) {
          cachedWallpaperImages.set(record.id, record);
        }
      }, () => {
        // The preload found no copy; the runtime reads the cache itself next.
      });
    }

    // Likewise for an upload: the preload read its record from the local wallpaper library.
    function takePreloadedCustomWallpaper() {
      const wallpaperPreload = globalThis.LumnoNewtabWallpaperPreload;
      const ready = wallpaperPreload && wallpaperPreload.customImageId && wallpaperPreload.imageReady;
      if (!ready || typeof ready.then !== 'function') return Promise.resolve();
      wallpaperPreload.imageReady = null;
      return ready.then(() => {
        const record = wallpaperPreload.cachedImageRecord;
        if (record) {
          mergeCustomWallpaperRecords([record]);
        }
      }, () => {
        // The preload found no record; the runtime reads the library itself next.
      });
    }

    function readCachedWallpaperImages(ids) {
      return takePreloadedWallpaperImage().then(() => readStoredCachedWallpaperImages(ids));
    }

    function readStoredCachedWallpaperImages(ids) {
      const missing = ids.filter((id) => !cachedWallpaperImages.has(id));
      if (!wallpaperImageCache || !missing.length) return Promise.resolve();
      return wallpaperImageCache.readByIds(missing).then((records) => {
        records.forEach((record) => {
          if (record && record.imageDataUrl) cachedWallpaperImages.set(record.id, record);
        });
      }).catch(warnWallpaperStoreFailure('Could not read cached wallpaper images.'));
    }

    function rememberCachedWallpaperImage(id, url, record) {
      const image = { id, url, imageDataUrl: record.imageDataUrl, thumbnailDataUrl: record.thumbnailDataUrl,
        cachedAt: Date.now() };
      cachedWallpaperImages.set(id, image);
      if (wallpaperImageCache) {
        wallpaperImageCache.write(image).catch(warnWallpaperStoreFailure('Could not cache a wallpaper image.'));
      }
    }

    // A link names a single image. Each device downloads it, or a curated photo or print, once and
    // keeps a downscaled copy, so new tabs skip the network and the wallpaper keeps showing if the
    // link later breaks.
    function cacheWallpaperImage(photoId, url) {
      if (getCachedWallpaperImage(photoId, url)) return Promise.resolve(true);
      if (wallpaperImageCaching.has(photoId)) return wallpaperImageCaching.get(photoId);
      const task = readCachedWallpaperImages([photoId]).then(() => getCachedWallpaperImage(photoId, url) ||
        fetchCustomWallpaperFile(url).then(buildCustomWallpaperRecordFromFile).then((record) => {
          rememberCachedWallpaperImage(photoId, url, record);
          pruneCachedWallpaperImages();
        }))
        .then(() => {
          const showing = NEWTAB_WALLPAPER_MODES.some((mode) => getEffectiveWallpaperPhotoId(mode) === photoId);
          if (showing) applyResolvedNewtabWallpaper();
          if (wallpaperState.customWallpaperCatalogLoaded && isLinkWallpaperId(photoId)) renderWallpaperPanelState();
          return true;
        })
        .catch(() => false)
        .finally(() => wallpaperImageCaching.delete(photoId));
      wallpaperImageCaching.set(photoId, task);
      return task;
    }

    function cacheLinkWallpaper(id) {
      const entry = wallpaperState.linkWallpapers.find((item) => item.id === id);
      return entry ? cacheWallpaperImage(id, entry.url) : Promise.resolve(false);
    }

    // The photo a mode shows: the link itself, or the photo or print a curated or daily pick resolves to.
    function getEffectiveWallpaperPhotoId(mode) {
      const id = getEffectiveWallpaperIdForMode(mode);
      if (isLinkWallpaperId(id)) return id;
      const item = id && REMOTE_CONTENT.wallpaperFromId(id) ? getWallpaperById(id) : null;
      return item && item.cacheImage ? item.dailyId || item.id : '';
    }

    function cacheShownWallpaperImages() {
      NEWTAB_WALLPAPER_MODES.forEach((mode) => {
        const id = getEffectiveWallpaperIdForMode(mode);
        if (isLinkWallpaperId(id)) {
          cacheLinkWallpaper(id);
          return;
        }
        const item = id && REMOTE_CONTENT.wallpaperFromId(id) ? getWallpaperById(id) : null;
        if (item && item.cacheImage) cacheWallpaperImage(item.dailyId || item.id, item.imageUrl);
      });
      scheduleUpcomingDailyWallpaperCache();
    }

    // Noon of the next local day, which stays on that date across a daylight-saving change.
    function getNextLocalDayTimestamp(timestamp) {
      const date = new Date(timestamp);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12).getTime();
    }

    // A curated daily slot follows the date alone, so tomorrow's photo is known today. Bing publishes
    // tomorrow's only tomorrow; its slot keeps today's copy until then.
    function getUpcomingDailyWallpaper(id) {
      if (!REMOTE_CONTENT.isDailyWallpaperId(id) || id === REMOTE_CONTENT.BING_DAILY_ID) return null;
      const slot = REMOTE_CONTENT.wallpaperFromId(id);
      const pick = slot && REMOTE_CONTENT.getCuratedDailyWallpaper(slot.category,
        getNextLocalDayTimestamp(Date.now()));
      return pick && pick.cacheImage ? pick : null;
    }

    function getUpcomingDailyWallpapers() {
      const items = [];
      NEWTAB_WALLPAPER_MODES.forEach((mode) => {
        const item = getUpcomingDailyWallpaper(getEffectiveWallpaperIdForMode(mode));
        if (item && !items.some((existing) => existing.id === item.id)) items.push(item);
      });
      return items;
    }

    // Caches tomorrow's curated photo once the page is idle, so the first tab after midnight opens
    // on the new photo from this device's copy instead of waiting on Picsum. The copy is one more
    // download a day and, like every cached photo, stays on this device: sync and WebDAV never see it.
    function scheduleUpcomingDailyWallpaperCache() {
      const upcoming = getUpcomingDailyWallpapers()
        .filter((item) => !getCachedWallpaperImage(item.id, item.imageUrl));
      const key = upcoming.map((item) => item.id).join(' ');
      // Without idle callbacks the download could compete with the page, so it waits for the next tab.
      if (!key || key === upcomingWallpaperCacheKey || !wallpaperImageCache ||
          typeof window.requestIdleCallback !== 'function') {
        return;
      }
      upcomingWallpaperCacheKey = key;
      const cacheUpcoming = () => {
        // Today's copies go first, and open tabs take turns, so one tab downloads and the others
        // find its copy in IndexedDB.
        const task = () => Promise.all(upcoming.map((item) => cacheWallpaperImage(item.id, item.imageUrl)));
        const locks = window.navigator && window.navigator.locks;
        return Promise.all(Array.from(wallpaperImageCaching.values()))
          .then(() => locks && typeof locks.request === 'function'
            ? locks.request('lumno-newtab-upcoming-wallpaper', task)
            : task())
          .then((results) => {
            if (results.every(Boolean)) {
              writeWallpaperPreloadCache();
            } else if (upcomingWallpaperCacheKey === key) {
              // Offline or the photo failed: the next apply or tab tries again.
              upcomingWallpaperCacheKey = '';
            }
          });
      };
      waitForDocumentLoad().then(() => {
        window.requestIdleCallback(() => {
          cacheUpcoming().catch(() => {
            if (upcomingWallpaperCacheKey === key) upcomingWallpaperCacheKey = '';
          });
        }, { timeout: UPCOMING_WALLPAPER_IDLE_TIMEOUT_MS });
      });
    }

    // Saved links keep their copies; a curated photo or print stays only while a mode shows it, or
    // stands in for it, or is tomorrow's, so daily picks do not pile up one image per day.
    function pruneCachedWallpaperImages() {
      if (!wallpaperImageCache || !wallpaperState.hasStoredWallpaperStateLoaded) return;
      const shownCopyIds = NEWTAB_WALLPAPER_MODES.map((mode) => {
        const id = getEffectiveWallpaperIdForMode(mode);
        const copy = id && REMOTE_CONTENT.wallpaperFromId(id) ? getShownWallpaperCopy(getWallpaperById(id)) : null;
        return copy ? copy.id : '';
      });
      const keep = new Set(wallpaperState.linkWallpapers.map((item) => item.id)
        .concat(NEWTAB_WALLPAPER_MODES.map(getEffectiveWallpaperPhotoId), shownCopyIds,
          getUpcomingDailyWallpapers().map((item) => item.id)));
      wallpaperImageCache.keys().then((keys) => keys.filter((key) => !keep.has(key)).forEach((key) => {
        cachedWallpaperImages.delete(key);
        dailyWallpaperStandIns.forEach((copy, slotId) => {
          if (copy.id === key) dailyWallpaperStandIns.delete(slotId);
        });
        wallpaperImageCache.remove(key).catch(warnWallpaperStoreFailure('Could not prune a cached wallpaper image.'));
      })).catch(warnWallpaperStoreFailure('Could not list cached wallpaper images.'));
    }

    function cacheListedLinkWallpapers() {
      wallpaperState.linkWallpapers.forEach((item) => cacheLinkWallpaper(item.id));
    }

    function writeLinkWallpapers(list) {
      wallpaperState.linkWallpapers = list;
      writeStorageValue(storageArea, NEWTAB_LINK_WALLPAPERS_STORAGE_KEY, list, () => {
        showToast(t('newtab_wallpaper_save_error', 'Failed to save wallpaper'), true);
      });
    }

    // Deleting a link removes it from every synced device, like the other synced settings.
    function deleteLinkWallpaper(id) {
      hideTopActionTooltip();
      // Read the selection while the link still resolves.
      const prefs = getWritableWallpaperPrefs();
      const selected = NEWTAB_WALLPAPER_MODES.filter((mode) => prefs[mode] === id);
      selected.forEach((mode) => { prefs[mode] = NEWTAB_WALLPAPER_DEFAULT_ID; });
      writeLinkWallpapers(wallpaperState.linkWallpapers.filter((item) => item.id !== id));
      cachedWallpaperImages.delete(id);
      if (wallpaperImageCache) {
        wallpaperImageCache.remove(id).catch(warnWallpaperStoreFailure('Could not remove a cached link wallpaper.'));
      }
      if (selected.length) {
        setWallpaperPrefs(prefs, getWritableLocalWallpaperOverrides());
        applyResolvedNewtabWallpaper();
        writeCurrentWallpaperPrefs({ showError: true });
      }
      renderWallpaperPanelState();
      showToast(t('newtab_wallpaper_delete_done', 'Deleted'), false);
    }

    // A new synced link entry, or null after telling the user the link no longer fits sync storage.
    function createLinkWallpaperEntry(url) {
      const entry = {
        id: `link-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        url,
        addedAt: Date.now()
      };
      if (url.length > LINK_WALLPAPER_URL_MAX_LENGTH ||
          JSON.stringify(wallpaperState.linkWallpapers.concat(entry)).length > LINK_WALLPAPERS_MAX_BYTES) {
        showToast(t('newtab_wallpaper_url_limit',
          'This link is too long, or too many links are saved. Remove some and try again.'), true);
        return null;
      }
      return entry;
    }

    function getOnlineWallpaperUrl(id) {
      const wallpaper = remoteClient.getWallpaper(id);
      return normalizeCustomWallpaperUrl(wallpaper && wallpaper.imageUrl);
    }

    function isOnlineWallpaperSaved(id) {
      const url = getOnlineWallpaperUrl(id);
      return Boolean(url) && wallpaperState.linkWallpapers.some((item) => item.url === url);
    }

    // A Bing or curated photo joins the local library as a link, so it syncs like one; the copy this
    // device already keeps for the photo becomes the link's copy.
    function saveOnlineWallpaperToLocal(id) {
      const url = getOnlineWallpaperUrl(id);
      if (!url || wallpaperState.customWallpaperImporting) {
        return;
      }
      wallpaperState.customWallpaperImporting = true;
      renderWallpaperPanelState();
      let toastTask = null;
      loadCustomWallpapers().then(() => {
        if (wallpaperState.linkWallpapers.some((item) => item.url === url)) {
          showToast(t('newtab_wallpaper_in_local', 'Already in local wallpapers'), false);
          return null;
        }
        if (isLocalWallpaperLibraryFull()) {
          showLocalWallpaperLimitToast();
          return null;
        }
        const entry = createLinkWallpaperEntry(url);
        if (!entry) {
          return null;
        }
        toastTask = beginToast(t('newtab_wallpaper_saving_local', 'Saving to local wallpapers…'));
        return readCachedWallpaperImages([id]).then(() => getCachedWallpaperImage(id, url) ||
          fetchCustomWallpaperFile(url).then(buildCustomWallpaperRecordFromFile)).then((record) => {
          rememberCachedWallpaperImage(entry.id, url, record);
          writeLinkWallpapers(wallpaperState.linkWallpapers.concat(entry));
          toastTask.done(t('newtab_wallpaper_saved_local', 'Saved to local wallpapers'));
        });
      }).catch(() => {
        if (toastTask) {
          toastTask.fail(t('newtab_wallpaper_save_error', 'Failed to save wallpaper'));
        } else {
          showToast(t('newtab_wallpaper_save_error', 'Failed to save wallpaper'), true);
        }
      }).finally(() => {
        wallpaperState.customWallpaperImporting = false;
        renderWallpaperPanelState();
      });
    }

    function isOnlineWallpaperMenuOpen() {
      return Boolean(onlineWallpaperMenu && onlineWallpaperMenu.controller.isOpen(onlineWallpaperMenu.control));
    }

    function isOnlineWallpaperMenuNode(node) {
      return Boolean(node && onlineWallpaperMenu &&
        (onlineWallpaperMenu.control.contains(node) || onlineWallpaperMenu.menu.contains(node)));
    }

    function closeOnlineWallpaperMenu() {
      const wasOpen = Boolean(onlineWallpaperMenuTarget);
      if (onlineWallpaperMenuTarget) {
        onlineWallpaperMenuTarget.element.removeAttribute('data-context-menu-open');
        onlineWallpaperMenuTarget = null;
      }
      if (isOnlineWallpaperMenuOpen()) {
        onlineWallpaperMenu.controller.setOpen(onlineWallpaperMenu.control, false);
      }
      return wasOpen;
    }

    function getOnlineWallpaperMenuOptions(id) {
      const saved = isOnlineWallpaperSaved(id);
      return [{
        action: 'save-local',
        value: 'save-local',
        label: saved
          ? t('newtab_wallpaper_in_local', 'Already in local wallpapers')
          : t('newtab_wallpaper_save_to_local', 'Save to local wallpapers'),
        disabled: saved
      }];
    }

    function createOnlineWallpaperMenu() {
      const selectMenuApi = globalThis.LumnoNewtabSelectMenu;
      if (!selectMenuApi || typeof selectMenuApi.createController !== 'function') {
        return null;
      }
      const controller = selectMenuApi.createController({
        documentObj: document,
        windowObj,
        onBeforeOpen: () => hideTopActionTooltip()
      });
      const created = controller.createSelect({
        id: '_x_extension_newtab_wallpaper_context_menu_2026_unique_',
        selectId: '_x_extension_newtab_wallpaper_context_menu_select_2026_unique_',
        className: 'x-nt-shortcut-context-menu',
        iconOnly: true,
        triggerIconClass: 'ri-more-line',
        menuClassName: 'x-nt-shortcut-context-menu-portal',
        menuAlign: 'middle',
        menuWidth: 'content',
        menuMinWidth: 124,
        menuMaxWidth: 220,
        menuPortal: true,
        menuPortalZIndex: 10050,
        menuPortalOffset: -6,
        value: 'save-local',
        ariaLabel: t('newtab_wallpaper_context_menu_label', 'Wallpaper actions'),
        options: [],
        onAction(payload) {
          const target = onlineWallpaperMenuTarget;
          closeOnlineWallpaperMenu();
          if (target && payload && payload.action === 'save-local') {
            saveOnlineWallpaperToLocal(target.id);
          }
        }
      });
      if (!created) {
        return null;
      }
      created.trigger.tabIndex = -1;
      [created.wrapper, created.menu].forEach((element) => {
        element.addEventListener('contextmenu', (event) => event.preventDefault());
      });
      document.addEventListener('pointerdown', (event) => {
        if (onlineWallpaperMenuTarget && !isOnlineWallpaperMenuNode(event.target)) {
          closeOnlineWallpaperMenu();
        }
      }, true);
      globalThis.LumnoNewtabDismissStack.getDismissStack().register('wallpaper-context-menu', {
        isOpen: () => Boolean(onlineWallpaperMenuTarget || isOnlineWallpaperMenuOpen()),
        close: () => closeOnlineWallpaperMenu()
      });
      (document.body || document.documentElement).appendChild(created.wrapper);
      return { controller, control: created.wrapper, menu: created.menu };
    }

    function openOnlineWallpaperMenu(id, element, point) {
      if (!getOnlineWallpaperUrl(id) || !element) {
        return;
      }
      if (!onlineWallpaperMenu) {
        onlineWallpaperMenu = createOnlineWallpaperMenu();
      }
      if (!onlineWallpaperMenu) {
        return;
      }
      closeOnlineWallpaperMenu();
      hideTopActionTooltip();
      onlineWallpaperMenuTarget = { id, element };
      element.setAttribute('data-context-menu-open', 'true');
      onlineWallpaperMenu.control.style.left = `${Math.round(point.x)}px`;
      onlineWallpaperMenu.control.style.top = `${Math.round(point.y)}px`;
      onlineWallpaperMenu.controller.setOptions(onlineWallpaperMenu.control, getOnlineWallpaperMenuOptions(id), 'save-local');
      onlineWallpaperMenu.controller.setOpen(onlineWallpaperMenu.control, true);
    }

    function finishCustomWallpaperUrlEntry() {
      wallpaperState.customWallpaperUrlClearToken += 1;
      setCustomWallpaperUrlFormOpen(false);
    }

    function submitCustomWallpaperUrl(value) {
      const url = normalizeCustomWallpaperUrl(value);
      if (!url) {
        wallpaperState.customWallpaperUrlInvalid = true;
        renderWallpaperPanelState();
        showToast(t('newtab_wallpaper_url_invalid', 'Enter a link that starts with http:// or https://'), true);
        wallpaperState.wallpaperViewController.focus('urlInput');
        return;
      }
      if (wallpaperState.customWallpaperUrlInvalid) {
        wallpaperState.customWallpaperUrlInvalid = false;
        renderWallpaperPanelState();
      }
      const existing = wallpaperState.linkWallpapers.find((item) => item.url === url);
      if (existing) {
        persistNewtabWallpaper(existing.id);
        finishCustomWallpaperUrlEntry();
        return;
      }
      if (isLocalWallpaperLibraryFull()) {
        showLocalWallpaperLimitToast();
        return;
      }
      const entry = createLinkWallpaperEntry(url);
      if (!entry) {
        return;
      }
      wallpaperState.customWallpaperImporting = true;
      renderWallpaperPanelState();
      const toastTask = beginToast(t('newtab_wallpaper_importing', 'Importing wallpaper…'));
      // Load the image before saving the link, so a broken link never reaches other devices.
      fetchCustomWallpaperFile(url).then(buildCustomWallpaperRecordFromFile).then((record) => {
        rememberCachedWallpaperImage(entry.id, url, record);
        writeLinkWallpapers(wallpaperState.linkWallpapers.concat(entry));
        persistNewtabWallpaper(entry.id);
        renderWallpaperPanelState();
        finishCustomWallpaperUrlEntry();
        toastTask.done(t('newtab_wallpaper_import_done', 'Wallpaper imported'));
      }).catch(() => {
        toastTask.fail(t('newtab_wallpaper_url_import_error', 'Could not add an image from this link'));
        if (wallpaperState.customWallpaperUrlFormOpen) wallpaperState.wallpaperViewController.focus('urlInput');
      }).finally(() => {
        wallpaperState.customWallpaperImporting = false;
        renderWallpaperPanelState();
      });
    }

    function closeCustomWallpaperUrlForm() {
      if (!wallpaperState.customWallpaperUrlFormOpen || wallpaperState.activeWallpaperTab !== 'local') {
        return false;
      }
      const urlForm = getWallpaperPanelRefs().urlForm;
      const hadFocus = Boolean(urlForm && urlForm.contains(document.activeElement));
      setCustomWallpaperUrlFormOpen(false);
      if (hadFocus) wallpaperState.wallpaperViewController.focus('urlTile');
      return true;
    }
    function deleteCustomWallpaper(id) {
      if (isLinkWallpaperId(id)) {
        deleteLinkWallpaper(id);
        return;
      }
      const targetWallpaper = getCustomWallpaperById(id);
      if (!targetWallpaper || wallpaperState.customWallpaperImporting) {
        return;
      }
      hideTopActionTooltip();
      deleteCustomWallpaperRecord(targetWallpaper).then(() => {
        wallpaperState.customWallpapers = wallpaperState.customWallpapers.filter((item) => item && item.id !== targetWallpaper.id);
        renderWallpaperPanelState();
        const overrides = getWritableLocalWallpaperOverrides();
        let changed = false;
        NEWTAB_WALLPAPER_MODES.forEach((mode) => {
          if (overrides[mode] !== targetWallpaper.id) {
            return;
          }
          overrides[mode] = NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE;
          changed = true;
        });
        if (changed) {
          setWallpaperPrefs(wallpaperState.currentWallpaperPrefs, overrides);
          applyResolvedNewtabWallpaper();
          renderWallpaperPanelState();
          writeLocalWallpaperValue(buildLocalWallpaperStorageValue(
            wallpaperState.currentLocalWallpaperOverrides,
            wallpaperState.currentWallpaperPrefs.sameForModes
          ), { showError: true });
        } else {
          renderWallpaperPanelState();
        }
        showToast(t('newtab_wallpaper_delete_done', 'Deleted'), false);
      }).catch(() => {
        showToast(t('newtab_wallpaper_delete_error', 'Failed to delete wallpaper'), true);
      });
    }

    return {
      isLocalWallpaperLibraryFull,
      showLocalWallpaperLimitToast,
      importCustomWallpaperFile,
      fetchCustomWallpaperFile,
      setCustomWallpaperUrlFormOpen,
      isLinkWallpaperId,
      setLinkWallpapers,
      getLinkWallpaperById,
      takePreloadedCustomWallpaper,
      readCachedWallpaperImages,
      cacheShownWallpaperImages,
      getNextLocalDayTimestamp,
      getUpcomingDailyWallpaper,
      cacheListedLinkWallpapers,
      isOnlineWallpaperMenuNode,
      closeOnlineWallpaperMenu,
      openOnlineWallpaperMenu,
      submitCustomWallpaperUrl,
      closeCustomWallpaperUrlForm,
      deleteCustomWallpaper
    };
  }

  root.LumnoWallpaperRuntimeCustomWallpapers = { createCustomWallpapers };
})(globalThis);
