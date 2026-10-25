// Bookmark view mode and bookmark bar surface mode/color preferences:
// loading, legacy migration, persistence and applying them to the page.
import type { StorageAreaLike, StorageChanges, StorageItems } from '../../domain/storage-port';
import type { ShowToast, Translate } from '../newtab-types';
import type * as BookmarksTopbar from '../react/bookmarks-topbar';
import type { BookmarksTopbarRuntime } from '../react/bookmarks-topbar';
import type { StorageChangeRegistry } from '../storage-change-registry';

type BookmarkViewMode = 'folder' | 'list' | 'top';
type BookmarkTopbarLayout = ReturnType<typeof BookmarksTopbar.normalizeLayout>;
type BookmarkTopbarSurfaceMode = ReturnType<typeof BookmarksTopbar.normalizeSurfaceMode>;
type ResolvedTheme = 'light' | 'dark';

interface BookmarkDisplaySettingsState {
  // Settles the page's wait for the view mode, once.
  resolveInitialBookmarkViewModeReady: (() => void) | null;
  bookmarkViewModeRevision: number;
  bookmarkTopbarRuntime: BookmarksTopbarRuntime | null;
}

interface BookmarkDisplaySettingsDeps {
  storageArea: StorageAreaLike | null;
  BOOKMARK_VIEW_MODE_STORAGE_KEY: string;
  applyBookmarkViewMode(
    mode: BookmarkViewMode,
    options: { expectedRevision?: number; ensureLoaded?: boolean }
  ): { applied: boolean };
  localStorageArea: StorageAreaLike | null;
  isPrimaryStorageAreaName(areaName: string): boolean;
  NEWTAB_BOOKMARKS_TOPBAR: Pick<typeof BookmarksTopbar, 'normalizeLayout' | 'normalizeSurfaceColor' | 'normalizeSurfaceMode'>;
  // chrome.storage.local, where the bar's material and layout stay.
  bookmarkTopbarSurfaceStorageArea: StorageAreaLike | null;
  updateBookmarkModeMenu(): void;
  setNewtabTopLayout(layout: BookmarkTopbarLayout): void;
  scheduleWallpaperAdaptiveToneUpdate(): void;
  initialThemeReadyPromise: Promise<unknown>;
  showToast: ShowToast;
  t: Translate;
  BOOKMARK_TOPBAR_PICK_COLOR_ACTION: string;
  BOOKMARK_TOPBAR_SURFACE_MODE_ACTION: string;
  BOOKMARK_TOPBAR_LAYOUT_ACTION: string;
  pageState: BookmarkDisplaySettingsState;
}

interface SurfaceAppearanceOptions {
  updateMenu?: boolean;
  scheduleTone?: boolean;
}

interface ApplyOptions extends SurfaceAppearanceOptions {
  persist?: boolean;
  // Ignored when another change came since this one was asked for.
  expectedRevision?: number;
}

function createBookmarkDisplaySettings(deps: BookmarkDisplaySettingsDeps) {
  const {
    storageArea,
    BOOKMARK_VIEW_MODE_STORAGE_KEY,
    applyBookmarkViewMode,
    localStorageArea,
    isPrimaryStorageAreaName,
    NEWTAB_BOOKMARKS_TOPBAR,
    bookmarkTopbarSurfaceStorageArea,
    updateBookmarkModeMenu,
    setNewtabTopLayout,
    scheduleWallpaperAdaptiveToneUpdate,
    initialThemeReadyPromise,
    showToast,
    t,
    BOOKMARK_TOPBAR_PICK_COLOR_ACTION,
    BOOKMARK_TOPBAR_SURFACE_MODE_ACTION,
    BOOKMARK_TOPBAR_LAYOUT_ACTION
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY =
    '_x_extension_bookmark_topbar_surface_color_2026_unique_';

  const BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY =
    '_x_extension_bookmark_topbar_surface_color_light_2026_unique_';

  const BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY =
    '_x_extension_bookmark_topbar_surface_color_dark_2026_unique_';

  const BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY =
    '_x_extension_bookmark_topbar_surface_mode_2026_unique_';

  // Docked or floating, kept on this device with the bar's background.
  const BOOKMARK_TOPBAR_LAYOUT_STORAGE_KEY = '_x_extension_bookmark_topbar_layout_2026_unique_';

  const BOOKMARK_TOPBAR_RESET_COLOR_ACTION = 'reset-bookmark-topbar-color';
  let bookmarkTopbarLayout: BookmarkTopbarLayout = 'docked';
  let bookmarkTopbarSurfaceMode: BookmarkTopbarSurfaceMode = 'adaptive';
  let bookmarkTopbarSurfaceModeRevision = 0;
  let currentBookmarkTopbarSurfaceColor = '';
  const bookmarkTopbarSurfaceColors: Record<ResolvedTheme, string> = {
    light: '',
    dark: ''
  };

  const bookmarkTopbarSurfaceColorRevisions: Record<ResolvedTheme, number> = {
    light: 0,
    dark: 0
  };

  function normalizeBookmarkViewMode(value: unknown): BookmarkViewMode {
    return value === 'list' || value === 'top' ? value : 'folder';
  }

  function shouldRepairBookmarkViewModeStorageValue(rawValue: unknown, normalizedValue: string): boolean {
    return typeof rawValue !== 'undefined' && rawValue !== normalizedValue;
  }

  function persistBookmarkViewMode(value: unknown): boolean {
    const mode = normalizeBookmarkViewMode(value);
    if (!storageArea || typeof storageArea.set !== 'function') {
      return false;
    }
    storageArea.set({ [BOOKMARK_VIEW_MODE_STORAGE_KEY]: mode });
    return true;
  }

  // The page reveals after the view mode is ready; the bar's shape is read alongside it so the bar
  // never changes shape after it first appears.
  const initialBookmarkTopbarLayoutReady = new Promise<void>((resolve) => {
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.get !== 'function') {
      resolve();
      return;
    }
    try {
      bookmarkTopbarSurfaceStorageArea.get([BOOKMARK_TOPBAR_LAYOUT_STORAGE_KEY], (result) => {
        applyBookmarkTopbarLayout(result ? result[BOOKMARK_TOPBAR_LAYOUT_STORAGE_KEY] : undefined, {
          updateMenu: false
        });
        resolve();
      });
    } catch (_error) {
      resolve();
    }
  });

  function settleInitialBookmarkViewModeReady(): void {
    if (typeof pageState.resolveInitialBookmarkViewModeReady !== 'function') {
      return;
    }
    const resolveReady = pageState.resolveInitialBookmarkViewModeReady;
    pageState.resolveInitialBookmarkViewModeReady = null;
    initialBookmarkTopbarLayoutReady.then(resolveReady);
  }

  function applyInitialBookmarkViewModeValue(rawValue: unknown, source: 'primary' | 'local-fallback', expectedRevision: number): void {
    try {
      const mode = normalizeBookmarkViewMode(rawValue);
      const applyResult = applyBookmarkViewMode(mode, {
        expectedRevision,
        ensureLoaded: true
      });
      if (!applyResult.applied) {
        return;
      }
      if (shouldRepairBookmarkViewModeStorageValue(rawValue, mode) ||
          (source === 'local-fallback' && typeof rawValue !== 'undefined')) {
        persistBookmarkViewMode(mode);
      }
    } finally {
      settleInitialBookmarkViewModeReady();
    }
  }

  function loadInitialBookmarkViewMode(): void {
    if (!storageArea || typeof storageArea.get !== 'function') {
      settleInitialBookmarkViewModeReady();
      return;
    }
    const expectedRevision = pageState.bookmarkViewModeRevision;
    const readLocalFallback = () => {
      if (!localStorageArea || isPrimaryStorageAreaName('local') ||
          typeof localStorageArea.get !== 'function') {
        applyInitialBookmarkViewModeValue(undefined, 'primary', expectedRevision);
        return;
      }
      try {
        localStorageArea.get([BOOKMARK_VIEW_MODE_STORAGE_KEY], (localResult) => {
          const localValue = localResult
            ? localResult[BOOKMARK_VIEW_MODE_STORAGE_KEY]
            : undefined;
          applyInitialBookmarkViewModeValue(
            localValue,
            'local-fallback',
            expectedRevision
          );
        });
      } catch (_error) {
        applyInitialBookmarkViewModeValue(undefined, 'primary', expectedRevision);
      }
    };
    try {
      storageArea.get([BOOKMARK_VIEW_MODE_STORAGE_KEY], (result) => {
        const stored = result ? result[BOOKMARK_VIEW_MODE_STORAGE_KEY] : undefined;
        if (typeof stored === 'undefined' && !isPrimaryStorageAreaName('local')) {
          readLocalFallback();
          return;
        }
        applyInitialBookmarkViewModeValue(stored, 'primary', expectedRevision);
      });
    } catch (_error) {
      readLocalFallback();
    }
  }

  function getBookmarkTopbarLayout(): BookmarkTopbarLayout {
    return bookmarkTopbarLayout;
  }

  function applyBookmarkTopbarLayout(value: unknown, options?: { persist?: boolean; updateMenu?: boolean }): BookmarkTopbarLayout {
    const config = options || {};
    bookmarkTopbarLayout = NEWTAB_BOOKMARKS_TOPBAR.normalizeLayout(value);
    if (pageState.bookmarkTopbarRuntime) {
      pageState.bookmarkTopbarRuntime.setLayout(bookmarkTopbarLayout);
    }
    setNewtabTopLayout(bookmarkTopbarLayout);
    if (config.persist === true && bookmarkTopbarSurfaceStorageArea &&
        typeof bookmarkTopbarSurfaceStorageArea.set === 'function') {
      bookmarkTopbarSurfaceStorageArea.set({ [BOOKMARK_TOPBAR_LAYOUT_STORAGE_KEY]: bookmarkTopbarLayout });
    }
    if (config.updateMenu !== false) {
      updateBookmarkModeMenu();
    }
    return bookmarkTopbarLayout;
  }

  function handleBookmarkTopbarLayoutStorageChanges(changes: StorageChanges, areaName: string): boolean {
    if (areaName !== 'local' || !changes[BOOKMARK_TOPBAR_LAYOUT_STORAGE_KEY]) {
      return false;
    }
    applyBookmarkTopbarLayout(changes[BOOKMARK_TOPBAR_LAYOUT_STORAGE_KEY].newValue);
    return true;
  }

  function normalizeBookmarkTopbarSurfaceColor(value: unknown): string {
    return NEWTAB_BOOKMARKS_TOPBAR.normalizeSurfaceColor(value);
  }

  function isBookmarkTopbarSurfaceMode(value: unknown): value is BookmarkTopbarSurfaceMode {
    return value === 'adaptive' ||
      value === 'clear' ||
      value === 'transparent' ||
      value === 'custom';
  }

  function normalizeBookmarkTopbarSurfaceMode(value: unknown): BookmarkTopbarSurfaceMode {
    return NEWTAB_BOOKMARKS_TOPBAR.normalizeSurfaceMode(value, 'adaptive');
  }

  // The background picked in the menus: match the page's glass style, transparent or a custom
  // color. 'clear' (liquid glass) was a choice of its own before the style setting took it over.
  function getEffectiveBookmarkTopbarSurfaceMode(): BookmarkTopbarSurfaceMode {
    if (bookmarkTopbarSurfaceMode === 'clear') {
      return 'adaptive';
    }
    return bookmarkTopbarSurfaceMode === 'custom' && !currentBookmarkTopbarSurfaceColor
      ? 'adaptive'
      : bookmarkTopbarSurfaceMode;
  }

  // The surface the bar draws: matching the style means adaptive mist, frosted or liquid glass.
  function getAppliedBookmarkTopbarSurfaceMode(): BookmarkTopbarSurfaceMode | 'frosted' {
    const selected = getEffectiveBookmarkTopbarSurfaceMode();
    if (selected !== 'adaptive') {
      return selected;
    }
    const glassStyle = document.body ? document.body.getAttribute('data-glass-style') : '';
    if (glassStyle === 'liquid') {
      return 'clear';
    }
    return glassStyle === 'frosted' ? 'frosted' : 'adaptive';
  }

  function persistBookmarkTopbarSurfaceMode(value: unknown): boolean {
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.set !== 'function') {
      return false;
    }
    bookmarkTopbarSurfaceStorageArea.set({
      [BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY]: normalizeBookmarkTopbarSurfaceMode(value)
    });
    return true;
  }

  function syncBookmarkTopbarSurfaceAppearance(options?: SurfaceAppearanceOptions): BookmarkTopbarSurfaceMode | 'frosted' {
    const config = options || {};
    const effectiveMode = getAppliedBookmarkTopbarSurfaceMode();
    if (pageState.bookmarkTopbarRuntime) {
      pageState.bookmarkTopbarRuntime.setLayout(bookmarkTopbarLayout);
      pageState.bookmarkTopbarRuntime.setSurfaceMode(effectiveMode);
      pageState.bookmarkTopbarRuntime.setSurfaceColor(
        effectiveMode === 'custom' ? currentBookmarkTopbarSurfaceColor : ''
      );
    }
    if (config.updateMenu !== false) {
      updateBookmarkModeMenu();
    }
    if (config.scheduleTone !== false) {
      scheduleWallpaperAdaptiveToneUpdate();
    }
    return effectiveMode;
  }

  function applyBookmarkTopbarSurfaceMode(value: unknown, options?: ApplyOptions): BookmarkTopbarSurfaceMode {
    const config = options || {};
    if (Object.hasOwn(config, 'expectedRevision') &&
        config.expectedRevision !== bookmarkTopbarSurfaceModeRevision) {
      return bookmarkTopbarSurfaceMode;
    }
    const nextMode = normalizeBookmarkTopbarSurfaceMode(value);
    if (nextMode !== bookmarkTopbarSurfaceMode || config.persist === true) {
      bookmarkTopbarSurfaceModeRevision += 1;
    }
    bookmarkTopbarSurfaceMode = nextMode;
    syncBookmarkTopbarSurfaceAppearance({
      updateMenu: config.updateMenu !== false,
      scheduleTone: config.scheduleTone !== false
    });
    if (config.persist === true) {
      persistBookmarkTopbarSurfaceMode(nextMode);
    }
    return nextMode;
  }

  function loadInitialBookmarkTopbarSurfaceMode(): void {
    // Narrowed here, for the callback below.
    const surfaceArea = bookmarkTopbarSurfaceStorageArea;
    if (!surfaceArea || typeof surfaceArea.get !== 'function') {
      return;
    }
    const expectedRevision = bookmarkTopbarSurfaceModeRevision;
    initialThemeReadyPromise.then(() => {
      const currentThemeColorKey = getBookmarkTopbarSurfaceColorStorageKey(
        getCurrentBookmarkTopbarResolvedTheme()
      );
      surfaceArea.get([
        BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY,
        currentThemeColorKey,
        BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY
      ], (result) => {
        if (bookmarkTopbarSurfaceModeRevision !== expectedRevision) {
          return;
        }
        const rawMode = result && result[BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY];
        const storedColor = normalizeBookmarkTopbarSurfaceColor(
          result && (result[currentThemeColorKey] ||
            result[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY])
        );
        applyBookmarkTopbarSurfaceMode(
          isBookmarkTopbarSurfaceMode(rawMode)
            ? rawMode
            : (storedColor ? 'custom' : 'adaptive'),
          {
            expectedRevision,
            persist: !isBookmarkTopbarSurfaceMode(rawMode),
            updateMenu: true,
            scheduleTone: true
          }
        );
      });
    });
  }

  function normalizeBookmarkTopbarResolvedTheme(value: unknown): ResolvedTheme {
    return value === 'dark' ? 'dark' : 'light';
  }

  function getCurrentBookmarkTopbarResolvedTheme(): ResolvedTheme {
    return normalizeBookmarkTopbarResolvedTheme(
      document.body ? document.body.getAttribute('data-theme') : 'light'
    );
  }

  function getBookmarkTopbarSurfaceColorStorageKey(resolvedTheme: unknown): string {
    return normalizeBookmarkTopbarResolvedTheme(resolvedTheme) === 'dark'
      ? BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY
      : BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY;
  }

  function persistBookmarkTopbarSurfaceColor(value: unknown, resolvedTheme?: ResolvedTheme): boolean {
    const theme = normalizeBookmarkTopbarResolvedTheme(
      resolvedTheme || getCurrentBookmarkTopbarResolvedTheme()
    );
    const color = normalizeBookmarkTopbarSurfaceColor(value);
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.set !== 'function') {
      return false;
    }
    bookmarkTopbarSurfaceStorageArea.set({
      [getBookmarkTopbarSurfaceColorStorageKey(theme)]: color
    });
    return true;
  }

  function applyBookmarkTopbarSurfaceColor(value: unknown, options?: ApplyOptions & { resolvedTheme?: ResolvedTheme }): string {
    const config = options || {};
    const theme = normalizeBookmarkTopbarResolvedTheme(
      config.resolvedTheme || getCurrentBookmarkTopbarResolvedTheme()
    );
    if (Object.hasOwn(config, 'expectedRevision') &&
        config.expectedRevision !== bookmarkTopbarSurfaceColorRevisions[theme]) {
      return bookmarkTopbarSurfaceColors[theme];
    }
    const color = normalizeBookmarkTopbarSurfaceColor(value);
    if (color !== bookmarkTopbarSurfaceColors[theme]) {
      bookmarkTopbarSurfaceColorRevisions[theme] += 1;
    }
    bookmarkTopbarSurfaceColors[theme] = color;
    if (theme === getCurrentBookmarkTopbarResolvedTheme()) {
      currentBookmarkTopbarSurfaceColor = color;
      syncBookmarkTopbarSurfaceAppearance({
        updateMenu: config.updateMenu !== false,
        scheduleTone: false
      });
    }
    if (config.persist === true) {
      persistBookmarkTopbarSurfaceColor(color, theme);
    }
    return color;
  }

  function syncBookmarkTopbarSurfaceColorForTheme(resolvedTheme: unknown, options?: { updateMenu?: boolean }): string {
    const theme = normalizeBookmarkTopbarResolvedTheme(resolvedTheme);
    return applyBookmarkTopbarSurfaceColor(bookmarkTopbarSurfaceColors[theme], {
      resolvedTheme: theme,
      updateMenu: !options || options.updateMenu !== false
    });
  }

  function removeLegacyBookmarkTopbarSurfaceColor(): boolean {
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.remove !== 'function') {
      return false;
    }
    bookmarkTopbarSurfaceStorageArea.remove(BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY);
    return true;
  }

  // Moves a color saved for both themes to the theme on screen.
  function migrateLegacyBookmarkTopbarSurfaceColor(value: unknown): void {
    const color = normalizeBookmarkTopbarSurfaceColor(value);
    if (!color) {
      removeLegacyBookmarkTopbarSurfaceColor();
      return;
    }
    const theme = getCurrentBookmarkTopbarResolvedTheme();
    const storageKey = getBookmarkTopbarSurfaceColorStorageKey(theme);
    if (!bookmarkTopbarSurfaceStorageArea ||
        typeof bookmarkTopbarSurfaceStorageArea.get !== 'function') {
      applyBookmarkTopbarSurfaceColor(color, {
        resolvedTheme: theme,
        persist: true
      });
      removeLegacyBookmarkTopbarSurfaceColor();
      return;
    }
    bookmarkTopbarSurfaceStorageArea.get([storageKey], (result) => {
      if (!result || typeof result[storageKey] === 'undefined') {
        applyBookmarkTopbarSurfaceColor(color, {
          resolvedTheme: theme,
          persist: true
        });
      }
      removeLegacyBookmarkTopbarSurfaceColor();
    });
  }

  function getBookmarkTopbarSurfaceColorStorageKeys(): string[] {
    return [
      BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY
    ];
  }

  function applyInitialBookmarkTopbarSurfaceColors(
    result: StorageItems | null | undefined,
    readRevisions: Record<ResolvedTheme, number>
  ): void {
    const entries: { key: string; resolvedTheme: ResolvedTheme }[] = [
      {
        key: BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY,
        resolvedTheme: 'light'
      },
      {
        key: BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY,
        resolvedTheme: 'dark'
      }
    ];
    entries.forEach((entry) => {
      if (bookmarkTopbarSurfaceColorRevisions[entry.resolvedTheme] !==
          readRevisions[entry.resolvedTheme]) {
        return;
      }
      const rawColor = result ? result[entry.key] : undefined;
      const color = applyBookmarkTopbarSurfaceColor(rawColor, {
        resolvedTheme: entry.resolvedTheme,
        updateMenu: true
      });
      if (rawColor && rawColor !== color) {
        persistBookmarkTopbarSurfaceColor(color, entry.resolvedTheme);
      }
    });
  }

  function loadInitialBookmarkTopbarSurfaceColors(): void {
    const localArea = bookmarkTopbarSurfaceStorageArea;
    if (!localArea || typeof localArea.get !== 'function') {
      return;
    }
    const colorKeys = getBookmarkTopbarSurfaceColorStorageKeys();
    initialThemeReadyPromise.then(() => {
      localArea.get(colorKeys, (localResult) => {
        const resolvedLocalResult: StorageItems = Object.assign({}, localResult || {});
        const localUpdates: StorageItems = {};
        const hasLocalLegacyColor = Object.hasOwn(
          resolvedLocalResult,
          BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY
        );
        const localLegacyColor = resolvedLocalResult[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY];
        const currentThemeKey = getBookmarkTopbarSurfaceColorStorageKey(
          getCurrentBookmarkTopbarResolvedTheme()
        );
        if (typeof localLegacyColor !== 'undefined' &&
            typeof resolvedLocalResult[currentThemeKey] === 'undefined') {
          resolvedLocalResult[currentThemeKey] = localLegacyColor;
          localUpdates[currentThemeKey] = localLegacyColor;
        }
        delete resolvedLocalResult[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY];
        const readRevisions = {
          light: bookmarkTopbarSurfaceColorRevisions.light,
          dark: bookmarkTopbarSurfaceColorRevisions.dark
        };
        const finishLocalMigration = () => {
          if (hasLocalLegacyColor && typeof localArea.remove === 'function') {
            localArea.remove(BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY);
          }
          applyInitialBookmarkTopbarSurfaceColors(resolvedLocalResult, readRevisions);
        };
        if (Object.keys(localUpdates).length > 0 && typeof localArea.set === 'function') {
          localArea.set(localUpdates, finishLocalMigration);
          return;
        }
        finishLocalMigration();
      });
    });
  }

  // The top bar's material and layout live in local storage only.
  function registerStorageChangeHandlers(storageChanges: Pick<StorageChangeRegistry, 'on'>): void {
    storageChanges.on([
      BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY
    ], handleBookmarkTopbarSurfaceColorStorageChanges, { area: 'local' });
    storageChanges.on(BOOKMARK_TOPBAR_LAYOUT_STORAGE_KEY, handleBookmarkTopbarLayoutStorageChanges, { area: 'local' });
  }

  function handleBookmarkTopbarSurfaceColorStorageChanges(changes: StorageChanges, areaName: string): boolean {
    if (areaName !== 'local') {
      return false;
    }
    let handled = false;
    const colorEntries: { key: string; resolvedTheme: ResolvedTheme }[] = [
      {
        key: BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY,
        resolvedTheme: 'light'
      },
      {
        key: BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY,
        resolvedTheme: 'dark'
      }
    ];
    if (changes[BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY]) {
      handled = true;
      applyBookmarkTopbarSurfaceMode(
        changes[BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY].newValue,
        { updateMenu: true, scheduleTone: true }
      );
    }
    colorEntries.forEach((entry) => {
      if (!changes[entry.key]) {
        return;
      }
      handled = true;
      const rawColor = changes[entry.key].newValue;
      const color = applyBookmarkTopbarSurfaceColor(rawColor, {
        resolvedTheme: entry.resolvedTheme,
        updateMenu: true
      });
      if (rawColor && rawColor !== color) {
        persistBookmarkTopbarSurfaceColor(color, entry.resolvedTheme);
      }
    });
    const legacyChange = changes[BOOKMARK_TOPBAR_SURFACE_COLOR_STORAGE_KEY];
    if (legacyChange && typeof legacyChange.newValue !== 'undefined') {
      handled = true;
      initialThemeReadyPromise.then(() => {
        migrateLegacyBookmarkTopbarSurfaceColor(legacyChange.newValue);
      });
    }
    return handled;
  }

  function pickBookmarkTopbarSurfaceColor(): Promise<boolean> {
    const EyeDropperApi = window.EyeDropper;
    if (typeof EyeDropperApi !== 'function') {
      showToast(t(
        'bookmark_topbar_color_unsupported',
        'Screen color picking is not supported in this browser.'
      ), true);
      return Promise.resolve(false);
    }
    const openPicker = () => {
      try {
        return new EyeDropperApi().open();
      } catch {
        return null;
      }
    };
    const request = openPicker();
    if (!request) {
      showToast(t('bookmark_topbar_color_failed', 'Could not pick a color. Try again.'), true);
      return Promise.resolve(false);
    }
    return request.then((result) => {
      const color = normalizeBookmarkTopbarSurfaceColor(result && result.sRGBHex);
      if (!color) {
        showToast(t('bookmark_topbar_color_failed', 'Could not pick a color. Try again.'), true);
        return false;
      }
      applyBookmarkTopbarSurfaceColor(color, { persist: true, updateMenu: false });
      applyBookmarkTopbarSurfaceMode('custom', { persist: true });
      showToast(t('bookmark_topbar_color_picked', 'Color picked'));
      return true;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') {
        return false;
      }
      showToast(t('bookmark_topbar_color_failed', 'Could not pick a color. Try again.'), true);
      return false;
    });
  }

  function resetBookmarkTopbarSurfaceColor(): void {
    applyBookmarkTopbarSurfaceColor('', { persist: true, updateMenu: false });
    applyBookmarkTopbarSurfaceMode('adaptive', { persist: true });
    showToast(t('bookmark_topbar_color_reset_done', 'Automatic colors restored'));
  }

  function handleBookmarkModeMenuAction(action: string): void {
    if (action === BOOKMARK_TOPBAR_PICK_COLOR_ACTION) {
      pickBookmarkTopbarSurfaceColor();
      return;
    }
    if (action === BOOKMARK_TOPBAR_RESET_COLOR_ACTION) {
      resetBookmarkTopbarSurfaceColor();
      return;
    }
    const layoutPrefix = `${BOOKMARK_TOPBAR_LAYOUT_ACTION}:`;
    if (String(action || '').startsWith(layoutPrefix)) {
      applyBookmarkTopbarLayout(String(action).slice(layoutPrefix.length), { persist: true });
      return;
    }
    const surfaceModePrefix = `${BOOKMARK_TOPBAR_SURFACE_MODE_ACTION}:`;
    if (String(action || '').startsWith(surfaceModePrefix)) {
      const nextMode = String(action).slice(surfaceModePrefix.length);
      if (nextMode === 'adaptive' ||
          nextMode === 'clear' ||
          nextMode === 'transparent') {
        applyBookmarkTopbarSurfaceMode(nextMode, { persist: true });
      }
    }
  }

  return {
    // Keys whose changes alter the bar's shape or background.
    bookmarkTopbarStorageKeys: [
      BOOKMARK_TOPBAR_LAYOUT_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_MODE_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_COLOR_LIGHT_STORAGE_KEY,
      BOOKMARK_TOPBAR_SURFACE_COLOR_DARK_STORAGE_KEY
    ],
    normalizeBookmarkViewMode,
    shouldRepairBookmarkViewModeStorageValue,
    persistBookmarkViewMode,
    loadInitialBookmarkViewMode,
    getEffectiveBookmarkTopbarSurfaceMode,
    getBookmarkTopbarLayout,
    applyBookmarkTopbarLayout,
    handleBookmarkTopbarLayoutStorageChanges,
    syncBookmarkTopbarSurfaceAppearance,
    loadInitialBookmarkTopbarSurfaceMode,
    syncBookmarkTopbarSurfaceColorForTheme,
    loadInitialBookmarkTopbarSurfaceColors,
    handleBookmarkTopbarSurfaceColorStorageChanges,
    registerStorageChangeHandlers,
    handleBookmarkModeMenuAction
  };
}

type BookmarkDisplaySettings = ReturnType<typeof createBookmarkDisplaySettings>;

export { createBookmarkDisplaySettings };
export type {
  BookmarkDisplaySettings,
  BookmarkDisplaySettingsDeps,
  BookmarkDisplaySettingsState,
  BookmarkTopbarLayout,
  BookmarkViewMode
};
