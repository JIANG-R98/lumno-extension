// Folder accent colors: the per-folder color references kept in storage,
// applying them to bookmark and shortcut folders, migrating the legacy
// per-device map, and opening the color picker.
import type { StorageAreaLike, StorageItems } from '../../domain/storage-port';
import type { createFolderColorPicker } from '../react/folder-color-picker';
import type { createFolderColorPickerApi } from '../react/folder-color-picker-lazy';
import type { BindTooltip, ShowToast, Translate } from '../newtab-types';
import type * as FolderIcon from './bookmark-folder-icon';
import type { FolderColorMap, FolderColorRefs } from './bookmark-folder-icon';
import type { BookmarksRuntime } from './bookmarks-runtime';

type FolderColorPicker = ReturnType<typeof createFolderColorPicker>;

interface FolderColorsState {
  // Made the first time a folder's color is changed.
  folderColorPicker: FolderColorPicker | null;
  // Synced colors keyed by folder path.
  folderColorRefs: FolderColorRefs;
}

interface FolderColorsDeps {
  folderColorApi: ReturnType<typeof createFolderColorPickerApi> | undefined;
  NEWTAB_BOOKMARK_FOLDER_ICON: typeof FolderIcon;
  storageArea: StorageAreaLike | null;
  FOLDER_COLOR_REFS_STORAGE_KEY: string;
  bookmarksRuntime: BookmarksRuntime;
  localStorageArea: StorageAreaLike | null;
  LEGACY_FOLDER_COLORS_STORAGE_KEY: string;
  closeBookmarkCascadeMenu(): void;
  closeShortcutDialog(): void;
  hideCursorTooltip(): void;
  t: Translate;
  getFigmaFolderSvg: typeof FolderIcon.getFigmaFolderSvg;
  playFolderPathMorph: typeof FolderIcon.playFolderPathMorph;
  bindShortcutDialogTooltip: BindTooltip;
  hideShortcutDialogTooltip(): void;
  FOLDER_COLOR_PRESETS_STORAGE_KEY: string;
  showToast: ShowToast;
  pageState: FolderColorsState;
}

function createFolderColors(deps: FolderColorsDeps) {
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

  let folderColors: FolderColorMap = {};

  let folderColorPreview: { folderId: string; color: string } | null = null;
  pageState.folderColorPicker = null;

  function getFolderColor(folderId: unknown): string {
    return folderColorPreview && folderColorPreview.folderId === String(folderId)
      ? folderColorPreview.color
      : folderColors[String(folderId)] || NEWTAB_BOOKMARK_FOLDER_ICON.DEFAULT_FOLDER_COLOR;
  }

  function applySavedFolderColor(icon: Element | null): void {
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

  // Settles once the storage call ends; rejects with runtime.lastError.
  function settleStorageCall<T>(
    area: StorageAreaLike | null,
    call: (area: StorageAreaLike, done: (result?: T) => void) => void,
    fallback: T
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!area) { reject(new Error('Storage unavailable')); return; }
      call(area, (result) => {
        const error = chrome.runtime && chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result === undefined ? fallback : result);
      });
    });
  }

  function readStorage(area: StorageAreaLike | null, keys: string[]): Promise<StorageItems> {
    return settleStorageCall<StorageItems>(area, (target, done) => { void target.get(keys, done); }, {});
  }

  function writeStorage(area: StorageAreaLike | null, items: StorageItems): Promise<void> {
    return settleStorageCall<void>(area, (target, done) => { void target.set(items, done); }, undefined);
  }

  function removeStorage(area: StorageAreaLike | null, keys: string[]): Promise<void> {
    return settleStorageCall<void>(area, (target, done) => {
      if (typeof target.remove === 'function') void target.remove(keys, done);
      else done();
    }, undefined);
  }

  function readFolderColorRefs(): Promise<FolderColorRefs> {
    return readStorage(storageArea, [FOLDER_COLOR_REFS_STORAGE_KEY]).then((data) =>
      NEWTAB_BOOKMARK_FOLDER_ICON.normalizeFolderColorRefs(data[FOLDER_COLOR_REFS_STORAGE_KEY]));
  }

  function writeFolderColorRefs(refs: FolderColorRefs): Promise<void> {
    return writeStorage(storageArea, { [FOLDER_COLOR_REFS_STORAGE_KEY]: refs });
  }

  // The colors saved in the picker, read as untrusted.
  function readSavedFolderColors(): Promise<unknown> {
    return readStorage(storageArea, [FOLDER_COLOR_PRESETS_STORAGE_KEY])
      .then((data) => data[FOLDER_COLOR_PRESETS_STORAGE_KEY]);
  }

  function saveSavedFolderColors(colors: string[]): Promise<void> {
    return writeStorage(storageArea, { [FOLDER_COLOR_PRESETS_STORAGE_KEY]: colors });
  }

  // Bookmark ids and paths can change underneath the synced map; resolving
  // again also moves a renamed or moved folder's color to its new path.
  // Only this device's own load or bookmark changes write that move back.
  // A map arriving from another device whose bookmarks have not caught up
  // would otherwise move the entry back and forth between the two devices.
  function applyFolderColorRefs(persist: boolean): Promise<void> {
    const resolved = NEWTAB_BOOKMARK_FOLDER_ICON.resolveFolderColors(pageState.folderColorRefs, bookmarksRuntime.getNodeMap());
    folderColors = resolved.colors;
    refreshFolderColors();
    if (!resolved.changed || !persist) return Promise.resolve();
    pageState.folderColorRefs = resolved.refs;
    return writeFolderColorRefs(resolved.refs).catch((error) => {
      console.warn('[Lumno] Could not update folder color references.', error);
    });
  }

  function syncFolderColorsWithBookmarks(persist: boolean): Promise<void> {
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
  function scheduleFolderColorSync(): void {
    if (!Object.keys(pageState.folderColorRefs).length) return;
    window.clearTimeout(folderColorSyncTimer);
    folderColorSyncTimer = window.setTimeout(() => {
      folderColorSyncTimer = 0;
      syncFolderColorsWithBookmarks(true).catch(() => {});
    }, 200);
  }

  // Colors saved before they synced were keyed by this device's bookmark ids.
  async function migrateLegacyFolderColors(): Promise<void> {
    const data = await readStorage(localStorageArea, [LEGACY_FOLDER_COLORS_STORAGE_KEY]);
    const legacy = NEWTAB_BOOKMARK_FOLDER_ICON.normalizeFolderColorMap(data[LEGACY_FOLDER_COLORS_STORAGE_KEY]);
    if (!Object.keys(legacy).length) return;
    if (!await bookmarksRuntime.ensureReady(false)) return;
    const refs = await readFolderColorRefs();
    const next = NEWTAB_BOOKMARK_FOLDER_ICON.importFolderColorMap(legacy, refs, bookmarksRuntime.getNodeMap());
    if (JSON.stringify(next) !== JSON.stringify(refs)) await writeFolderColorRefs(next);
    await removeStorage(localStorageArea, [LEGACY_FOLDER_COLORS_STORAGE_KEY]);
  }

  function loadFolderColors(): Promise<void> {
    return migrateLegacyFolderColors().catch((error) => {
      console.warn('[Lumno] Could not migrate folder colors.', error);
    }).then(readFolderColorRefs).then((refs) => {
      pageState.folderColorRefs = refs;
      return syncFolderColorsWithBookmarks(true);
    }).catch(() => {});
  }

  async function saveFolderColor(folderId: string, color: string | null): Promise<void> {
    const [refs, ready] = await Promise.all([readFolderColorRefs(), bookmarksRuntime.ensureReady(false)]);
    const next = ready
      ? NEWTAB_BOOKMARK_FOLDER_ICON.setFolderColorRef(refs, folderId, color, bookmarksRuntime.getNodeMap())
      : null;
    if (!next) throw new Error('Folder is unavailable');
    await writeFolderColorRefs(next);
    pageState.folderColorRefs = next;
    await applyFolderColorRefs(true);
  }

  async function createPicker(): Promise<FolderColorPicker | null> {
    if (!folderColorApi) {
      return null;
    }
    try {
      return await folderColorApi.createFolderColorPicker({
        documentObj: document, t,
        getFolderSvg: getFigmaFolderSvg,
        initFolderIcon: NEWTAB_BOOKMARK_FOLDER_ICON.initFolderPathMorph,
        animateFolderIcon: playFolderPathMorph,
        applyFolderColor: NEWTAB_BOOKMARK_FOLDER_ICON.applyFolderColor,
        bindTooltip: bindShortcutDialogTooltip,
        hideTooltip: hideShortcutDialogTooltip,
        readSavedColors: readSavedFolderColors,
        saveSavedColors: saveSavedFolderColors,
        onPreview: (id, color) => {
          folderColorPreview = { folderId: id, color };
          refreshFolderColors();
        },
        onSubmit: saveFolderColor,
        onClose: () => { folderColorPreview = null; refreshFolderColors(); }
      });
    } catch {
      return null;
    }
  }

  async function openFolderColorPicker(folderId: unknown, title: string, sourceElement?: HTMLElement | null): Promise<void> {
    closeBookmarkCascadeMenu();
    closeShortcutDialog();
    hideCursorTooltip();
    const picker = pageState.folderColorPicker || await createPicker();
    if (!picker) {
      showToast(t('folder_color_save_failed', 'Could not save the folder color. Try again.'), true);
      return;
    }
    pageState.folderColorPicker = picker;
    picker.open({ folderId: String(folderId), title, color: getFolderColor(folderId), sourceElement });
  }

  return {
    applySavedFolderColor,
    readSavedFolderColors,
    saveSavedFolderColors,
    syncFolderColorsWithBookmarks,
    scheduleFolderColorSync,
    loadFolderColors,
    openFolderColorPicker
  };
}

export { createFolderColors };
export type { FolderColorPicker, FolderColorsDeps, FolderColorsState };
