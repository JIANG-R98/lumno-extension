(function(root) {
  // Folder accent colors: the per-folder color references kept in storage,
  // applying them to bookmark and shortcut folders, migrating the legacy
  // per-device map, and opening the color picker.
  function createFolderColors(deps) {
    const {
      folderColorApi,
      NEWTAB_BOOKMARK_FOLDER_ICON,
      storageArea,
      FOLDER_COLOR_REFS_STORAGE_KEY,
      bookmarksRuntime,
      localStorageArea,
      LEGACY_FOLDER_COLORS_STORAGE_KEY,
      closeBookmarkCascadeMenu,
      closeShortcutDialog,
      hideCursorTooltip,
      t,
      getFigmaFolderSvg,
      playFolderPathMorph,
      bindShortcutDialogTooltip,
      hideShortcutDialogTooltip,
      FOLDER_COLOR_PRESETS_STORAGE_KEY,
      showToast
    } = deps;

    // The page state object shared with newtab.js and the other modules.
    const pageState = deps.pageState;

    let folderColors = {};

    let folderColorPreview = null;
    pageState.folderColorPicker = null;

    function getFolderColor(folderId) {
      return folderColorPreview && folderColorPreview.folderId === String(folderId)
        ? folderColorPreview.color
        : folderColors[String(folderId)] || folderColorApi.DEFAULT_FOLDER_COLOR;
    }

    function applySavedFolderColor(icon) {
      if (!icon) return;
      const svg = icon.querySelector('svg[data-folder-color-id]');
      const folderId = svg && svg.getAttribute('data-folder-color-id');
      if (folderId) NEWTAB_BOOKMARK_FOLDER_ICON.applyFolderColor(icon, getFolderColor(folderId));
    }

    function refreshFolderColors() {
      document.querySelectorAll('svg[data-folder-color-id]').forEach((svg) => {
        applySavedFolderColor(svg.parentElement);
      });
    }

    function folderColorStorage(area, method, value) {
      return new Promise((resolve, reject) => {
        if (!area) { reject(new Error('Storage unavailable')); return; }
        area[method](value, (data) => {
          const error = chrome.runtime && chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(data || {});
        });
      });
    }

    function readFolderColorRefs() {
      return folderColorStorage(storageArea, 'get', [FOLDER_COLOR_REFS_STORAGE_KEY]).then((data) =>
        NEWTAB_BOOKMARK_FOLDER_ICON.normalizeFolderColorRefs(data[FOLDER_COLOR_REFS_STORAGE_KEY]));
    }

    function writeFolderColorRefs(refs) {
      return folderColorStorage(storageArea, 'set', { [FOLDER_COLOR_REFS_STORAGE_KEY]: refs });
    }

    // Bookmark ids and paths can change underneath the synced map; resolving
    // again also moves a renamed or moved folder's color to its new path.
    // Only this device's own load or bookmark changes write that move back.
    // A map arriving from another device whose bookmarks have not caught up
    // would otherwise move the entry back and forth between the two devices.
    function applyFolderColorRefs(persist) {
      const resolved = NEWTAB_BOOKMARK_FOLDER_ICON.resolveFolderColors(pageState.folderColorRefs, bookmarksRuntime.getNodeMap());
      folderColors = resolved.colors;
      refreshFolderColors();
      if (!resolved.changed || !persist) return Promise.resolve();
      pageState.folderColorRefs = resolved.refs;
      return writeFolderColorRefs(resolved.refs).catch((error) => {
        console.warn('[Lumno] Could not update folder color references.', error);
      });
    }

    function syncFolderColorsWithBookmarks(persist) {
      if (!Object.keys(pageState.folderColorRefs).length) {
        folderColors = {};
        refreshFolderColors();
        return Promise.resolve();
      }
      return bookmarksRuntime.ensureReady(false).then((ready) => {
        if (ready) return applyFolderColorRefs(persist);
        return undefined;
      });
    }

    // Bookmark sync can deliver many changes at once; resolve after they settle.
    let folderColorSyncTimer = 0;
    function scheduleFolderColorSync() {
      if (!Object.keys(pageState.folderColorRefs).length) return;
      clearTimeout(folderColorSyncTimer);
      folderColorSyncTimer = setTimeout(() => {
        folderColorSyncTimer = 0;
        syncFolderColorsWithBookmarks(true).catch(() => {});
      }, 200);
    }

    // Colors saved before they synced were keyed by this device's bookmark ids.
    async function migrateLegacyFolderColors() {
      const data = await folderColorStorage(localStorageArea, 'get', [LEGACY_FOLDER_COLORS_STORAGE_KEY]);
      const legacy = NEWTAB_BOOKMARK_FOLDER_ICON.normalizeFolderColorMap(data[LEGACY_FOLDER_COLORS_STORAGE_KEY]);
      if (!Object.keys(legacy).length) return;
      if (!await bookmarksRuntime.ensureReady(false)) return;
      const refs = await readFolderColorRefs();
      const next = NEWTAB_BOOKMARK_FOLDER_ICON.importFolderColorMap(legacy, refs, bookmarksRuntime.getNodeMap());
      if (JSON.stringify(next) !== JSON.stringify(refs)) await writeFolderColorRefs(next);
      await folderColorStorage(localStorageArea, 'remove', [LEGACY_FOLDER_COLORS_STORAGE_KEY]);
    }

    function loadFolderColors() {
      return migrateLegacyFolderColors().catch((error) => {
        console.warn('[Lumno] Could not migrate folder colors.', error);
      }).then(readFolderColorRefs).then((refs) => {
        pageState.folderColorRefs = refs;
        return syncFolderColorsWithBookmarks(true);
      }).catch(() => {});
    }

    async function saveFolderColor(folderId, color) {
      const [refs, ready] = await Promise.all([readFolderColorRefs(), bookmarksRuntime.ensureReady(false)]);
      const next = ready
        ? NEWTAB_BOOKMARK_FOLDER_ICON.setFolderColorRef(refs, folderId, color, bookmarksRuntime.getNodeMap())
        : null;
      if (!next) throw new Error('Folder is unavailable');
      await writeFolderColorRefs(next);
      pageState.folderColorRefs = next;
      await applyFolderColorRefs(true);
    }

    async function openFolderColorPicker(folderId, title, sourceElement) {
      closeBookmarkCascadeMenu();
      closeShortcutDialog();
      hideCursorTooltip();
      if (!pageState.folderColorPicker) {
        try {
          pageState.folderColorPicker = await folderColorApi.createFolderColorPicker({
            documentObj: document, t,
            getFolderSvg: getFigmaFolderSvg,
            initFolderIcon: NEWTAB_BOOKMARK_FOLDER_ICON.initFolderPathMorph,
            animateFolderIcon: playFolderPathMorph,
            applyFolderColor: NEWTAB_BOOKMARK_FOLDER_ICON.applyFolderColor,
            bindTooltip: bindShortcutDialogTooltip,
            hideTooltip: hideShortcutDialogTooltip,
            readSavedColors: () => folderColorStorage(storageArea, 'get', [FOLDER_COLOR_PRESETS_STORAGE_KEY])
              .then((data) => data[FOLDER_COLOR_PRESETS_STORAGE_KEY]),
            saveSavedColors: (colors) => folderColorStorage(storageArea, 'set', { [FOLDER_COLOR_PRESETS_STORAGE_KEY]: colors }),
            onPreview: (id, color) => {
              folderColorPreview = { folderId: id, color };
              refreshFolderColors();
            },
            onSubmit: saveFolderColor,
            onClose: () => { folderColorPreview = null; refreshFolderColors(); }
          });
        } catch {
          showToast(t('folder_color_save_failed', 'Could not save the folder color. Try again.'), true);
          return;
        }
      }
      pageState.folderColorPicker.open({ folderId: String(folderId), title, color: getFolderColor(folderId), sourceElement });
    }

    return {
      applySavedFolderColor,
      folderColorStorage,
      syncFolderColorsWithBookmarks,
      scheduleFolderColorSync,
      loadFolderColors,
      openFolderColorPicker
    };
  }

  root.LumnoNewtabFolderColors = { createFolderColors };
})(globalThis);
