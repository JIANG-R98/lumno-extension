// Appearance panel controls for the bookmark and site-card sections. The page owns the
// values and stores them under the same keys as the Options page and the sections' own
// menus, so the panel reads through getters, writes through setters and re-reads whenever
// one of those keys changes elsewhere.
import type { StorageChanges } from '../domain/storage-port';
import { isHtmlElement, isHtmlTag } from '../shared/dom-guards';
import { queryHtmlElement } from '../shared/dom-lookup';
import type { SelectMenuOption } from '../shared/react/select-menu';
import type { BookmarkViewMode } from './bookmarks/bookmark-display-settings';
import type { Translate } from './newtab-types';
import type { WallpaperViewController } from './react/wallpaper-view';

// The bar backgrounds the panel offers; "custom" opens the color picker.
type PanelBookmarkTopbarSurfaceMode = 'adaptive' | 'transparent' | 'custom';
type PersistOptions = { persist: boolean };
type PersistedSetter<T> = (value: T, options: PersistOptions) => void;
type StorageChangeListener = (changes: StorageChanges) => void;

// Section counts are stored in multiples of four, one row each.
const ITEMS_PER_ROW = 4;
const BOOKMARK_ROWS_MIN = 1;
const BOOKMARK_ROWS_MAX = 8;
// Turning a section back on restores its last row count, or the stored defaults.
const BOOKMARK_COUNT_DEFAULT = 8;
const RECENT_COUNT_DEFAULT = 4;
const SLIDER_SAVE_DELAY_MS = 140;

// The page's section values, read through getters and changed through setters.
interface SectionPanelSettingsOptions {
  windowObj?: Window & typeof globalThis;
  chromeObj?: {
    storage?: {
      onChanged?: {
        addListener(listener: StorageChangeListener): void;
        removeListener(listener: StorageChangeListener): void;
      };
    };
  };
  t: Translate;
  // Storage keys whose changes elsewhere make the panel re-read the values.
  watchedKeys?: readonly string[];
  getBookmarkViewMode?(): string;
  setBookmarkViewMode?(mode: BookmarkViewMode): void;
  getBookmarkCount?(): number;
  setBookmarkCount?: PersistedSetter<number>;
  getBookmarkColumns?(): number;
  setBookmarkColumns?: PersistedSetter<number>;
  getBookmarkFolderIconsVisible?(): boolean;
  setBookmarkFolderIconsVisible?: PersistedSetter<boolean>;
  getBookmarkTopbarLayout?(): string;
  setBookmarkTopbarLayout?(layout: string): void;
  getBookmarkTopbarSurfaceMode?(): string;
  setBookmarkTopbarSurfaceMode?(mode: PanelBookmarkTopbarSurfaceMode): void;
  pickBookmarkTopbarSurfaceColor?(): void;
  getRecentMode?(): string;
  setRecentMode?(mode: string): void;
  getRecentCount?(): number;
  setRecentCount?: PersistedSetter<number>;
}

// The panel's elements by data-wallpaper-ref name.
type PanelRefs = Readonly<Partial<Record<string, HTMLElement>>>;

interface SectionSettingsRefs {
  bookmarkSettingsTitle: HTMLElement;
  bookmarkSettingsTrigger: HTMLButtonElement;
  bookmarkSettingsToggle: HTMLInputElement;
  bookmarkSettingsBody: HTMLElement;
  bookmarkViewModeLabel: HTMLElement;
  bookmarkGridSettings: HTMLElement;
  bookmarkRowsLabel: HTMLElement;
  bookmarkRowsSlider: HTMLInputElement;
  bookmarkColumnsLabel: HTMLElement;
  bookmarkColumnsSlider: HTMLInputElement;
  bookmarkFolderIconsTitle: HTMLElement;
  bookmarkFolderIconsToggle: HTMLInputElement;
  bookmarkTopbarSettings: HTMLElement;
  bookmarkTopbarLayoutLabel: HTMLElement;
  bookmarkTopbarLayoutTabs: HTMLElement;
  bookmarkTopbarSurfaceLabel: HTMLElement;
  recentSettingsTitle: HTMLElement;
  recentSettingsTrigger: HTMLButtonElement;
  recentSettingsToggle: HTMLInputElement;
  recentSettingsBody: HTMLElement;
  recentModeLabel: HTMLElement;
  recentModeTabs: HTMLElement;
  recentRowsLabel: HTMLElement;
  recentRowsTabs: HTMLElement;
}

type SectionSettingsView = Pick<WallpaperViewController,
  'renderBookmarkViewModeSelect' | 'renderBookmarkTopbarSurfaceSelect'>;

// The number boxes beside the range inputs.
interface SliderValueHelpers {
  bindSliderValueInput?(slider: HTMLInputElement): void;
  syncSliderValueInput?(slider: HTMLInputElement): void;
}

function isBookmarkViewMode(value: unknown): value is BookmarkViewMode {
  return value === 'folder' || value === 'list' || value === 'top';
}

function isBookmarkTopbarSurfaceMode(value: unknown): value is PanelBookmarkTopbarSurfaceMode {
  return value === 'adaptive' || value === 'transparent' || value === 'custom';
}

// Null when the panel has no section settings; a panel that has them must
// carry every element they use.
function readSectionSettingsRefs(refs: PanelRefs): SectionSettingsRefs | null {
  if (!refs.bookmarkSettingsSection || !refs.recentSettingsSection) {
    return null;
  }
  const element = (name: string): HTMLElement => {
    const value = refs[name];
    if (!isHtmlElement(value)) throw new Error(`Section settings element missing: ${name}`);
    return value;
  };
  const button = (name: string): HTMLButtonElement => {
    const value = refs[name];
    if (!isHtmlTag(value, 'button')) throw new Error(`Section settings button missing: ${name}`);
    return value;
  };
  const input = (name: string): HTMLInputElement => {
    const value = refs[name];
    if (!isHtmlTag(value, 'input')) throw new Error(`Section settings input missing: ${name}`);
    return value;
  };
  return {
    bookmarkSettingsTitle: element('bookmarkSettingsTitle'),
    bookmarkSettingsTrigger: button('bookmarkSettingsTrigger'),
    bookmarkSettingsToggle: input('bookmarkSettingsToggle'),
    bookmarkSettingsBody: element('bookmarkSettingsBody'),
    bookmarkViewModeLabel: element('bookmarkViewModeLabel'),
    bookmarkGridSettings: element('bookmarkGridSettings'),
    bookmarkRowsLabel: element('bookmarkRowsLabel'),
    bookmarkRowsSlider: input('bookmarkRowsSlider'),
    bookmarkColumnsLabel: element('bookmarkColumnsLabel'),
    bookmarkColumnsSlider: input('bookmarkColumnsSlider'),
    bookmarkFolderIconsTitle: element('bookmarkFolderIconsTitle'),
    bookmarkFolderIconsToggle: input('bookmarkFolderIconsToggle'),
    bookmarkTopbarSettings: element('bookmarkTopbarSettings'),
    bookmarkTopbarLayoutLabel: element('bookmarkTopbarLayoutLabel'),
    bookmarkTopbarLayoutTabs: element('bookmarkTopbarLayoutTabs'),
    bookmarkTopbarSurfaceLabel: element('bookmarkTopbarSurfaceLabel'),
    recentSettingsTitle: element('recentSettingsTitle'),
    recentSettingsTrigger: button('recentSettingsTrigger'),
    recentSettingsToggle: input('recentSettingsToggle'),
    recentSettingsBody: element('recentSettingsBody'),
    recentModeLabel: element('recentModeLabel'),
    recentModeTabs: element('recentModeTabs'),
    recentRowsLabel: element('recentRowsLabel'),
    recentRowsTabs: element('recentRowsTabs')
  };
}

function syncSegmentedIndicator(group: Element): void {
  const segmentedIndicator = globalThis.LumnoSegmentedIndicator;
  if (segmentedIndicator) segmentedIndicator.sync(queryHtmlElement(group, '.x-nt-segmented-tabs-indicator'));
}

function createRuntime(options: SectionPanelSettingsOptions) {
  const config = options;
  const window = config.windowObj || globalThis.window;
  const t = config.t;
  const watchedKeys = new Set(config.watchedKeys || []);
  let refs: SectionSettingsRefs | null = null;
  let view: SectionSettingsView | null = null;
  let helpers: SliderValueHelpers = {};
  let bookmarkExpanded = false;
  let recentExpanded = false;
  let lastBookmarkCount = 0;
  let lastRecentCount = 0;
  let updateTimer = 0;
  let unsubscribe: (() => void) | null = null;
  const saveTimers = new Map<HTMLInputElement, number>();
  let tabResizeObserver: ResizeObserver | null = null;

  const getBookmarkCount = () => Number(config.getBookmarkCount?.()) || 0;
  const getRecentCount = () => Number(config.getRecentCount?.()) || 0;

  function rememberCounts(): void {
    const bookmarkCount = getBookmarkCount();
    const recentCount = getRecentCount();
    if (bookmarkCount > 0) lastBookmarkCount = bookmarkCount;
    if (recentCount > 0) lastRecentCount = recentCount;
  }

  function syncTabs(group: HTMLElement | null, attribute: string, value: string | number): void {
    if (!group) return;
    group.querySelectorAll(`[${attribute}]`).forEach((button) => {
      const active = button.getAttribute(attribute) === String(value);
      button.setAttribute('data-active', active ? 'true' : 'false');
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    syncSegmentedIndicator(group);
  }

  function setSectionState(
    trigger: HTMLButtonElement,
    toggle: HTMLInputElement,
    body: HTMLElement,
    enabled: boolean,
    expanded: boolean
  ): void {
    toggle.checked = enabled;
    toggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
    trigger.disabled = !enabled;
    trigger.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    trigger.setAttribute('aria-expanded', enabled && expanded ? 'true' : 'false');
    body.hidden = !(enabled && expanded);
  }

  function setSlider(slider: HTMLInputElement | null, value: number, label: string): void {
    if (!slider) return;
    const min = Number(slider.min);
    const max = Number(slider.max);
    slider.value = String(value);
    slider.setAttribute('aria-label', label);
    slider.setAttribute('aria-valuenow', String(value));
    slider.setAttribute('aria-valuetext', String(value));
    slider.style.setProperty('--x-range-slider-percent', `${max > min ? (value - min) / (max - min) * 100 : 0}%`);
    if (helpers.syncSliderValueInput) helpers.syncSliderValueInput(slider);
  }

  function renderBookmarkSelects(viewMode: BookmarkViewMode, surfaceMode: PanelBookmarkTopbarSurfaceMode): void {
    if (!view) return;
    if (view.renderBookmarkViewModeSelect) {
      view.renderBookmarkViewModeSelect({
        ariaLabel: t('display_mode_title', 'Display mode'),
        options: [
          { value: 'folder', label: t('bookmark_view_mode_folder', 'Multi-layer folder view') },
          { value: 'list', label: t('bookmark_view_mode_list', 'Multi-level list view') },
          { value: 'top', label: t('bookmark_view_mode_top', 'Top bookmarks bar') }
        ],
        value: viewMode,
        onChange: (mode) => {
          if (isBookmarkViewMode(mode)) config.setBookmarkViewMode?.(mode);
          update();
        }
      });
    }
    if (view.renderBookmarkTopbarSurfaceSelect) {
      // Same choices as the bar's own menu; "Custom color" opens the screen color picker and
      // only becomes the selection once a color is picked.
      const surfaceOption = (
        value: PanelBookmarkTopbarSurfaceMode,
        labelKey: string,
        fallback: string,
        extra?: Partial<SelectMenuOption>
      ): SelectMenuOption => ({
        value,
        label: t(labelKey, fallback),
        radio: true,
        checked: surfaceMode === value,
        ...extra
      });
      view.renderBookmarkTopbarSurfaceSelect({
        ariaLabel: t('bookmark_topbar_surface_title', 'Bar background'),
        options: [
          surfaceOption('adaptive', 'bookmark_topbar_surface_follow', 'Match style'),
          surfaceOption('transparent', 'bookmark_topbar_surface_transparent', 'Transparent'),
          surfaceOption('custom', 'bookmark_topbar_surface_custom', 'Custom color', {
            trailingIconClass: 'ri-dropper-line'
          })
        ],
        value: surfaceMode,
        onChange: (mode) => {
          if (!isBookmarkTopbarSurfaceMode(mode)) return false;
          if (mode === 'custom') {
            config.pickBookmarkTopbarSurfaceColor?.();
            return false;
          }
          config.setBookmarkTopbarSurfaceMode?.(mode);
          update();
          return undefined;
        }
      });
    }
  }

  function update(): void {
    if (!refs) return;
    window.clearTimeout(updateTimer);
    updateTimer = 0;
    rememberCounts();
    const bookmarkCount = getBookmarkCount();
    const storedViewMode = config.getBookmarkViewMode?.();
    const viewMode = isBookmarkViewMode(storedViewMode) ? storedViewMode : 'folder';
    const topbarMode = viewMode === 'top';
    const bookmarkTitle = t('bookmarks_heading', 'Bookmarks');
    refs.bookmarkSettingsTitle.textContent = bookmarkTitle;
    refs.bookmarkSettingsToggle.setAttribute('aria-label', bookmarkTitle);
    refs.bookmarkSettingsTrigger.setAttribute('aria-label', bookmarkTitle);
    setSectionState(
      refs.bookmarkSettingsTrigger,
      refs.bookmarkSettingsToggle,
      refs.bookmarkSettingsBody,
      bookmarkCount > 0,
      bookmarkExpanded
    );
    refs.bookmarkViewModeLabel.textContent = t('display_mode_title', 'Display mode');
    refs.bookmarkGridSettings.hidden = topbarMode;
    refs.bookmarkTopbarSettings.hidden = !topbarMode;
    const rowsLabel = t('settings_bookmarks_title', 'Bookmark rows');
    const columnsLabel = t('settings_bookmark_columns_title', 'Bookmarks per row');
    const folderIconsLabel = t('settings_bookmark_folder_icons_visible_title', 'Show icons inside bookmark folders');
    refs.bookmarkRowsLabel.textContent = rowsLabel;
    refs.bookmarkColumnsLabel.textContent = columnsLabel;
    refs.bookmarkFolderIconsTitle.textContent = folderIconsLabel;
    // A drag in progress keeps its thumb; the page already previews that value.
    if (!saveTimers.has(refs.bookmarkRowsSlider)) {
      const rows = Math.round((bookmarkCount || lastBookmarkCount || BOOKMARK_COUNT_DEFAULT) / ITEMS_PER_ROW);
      setSlider(refs.bookmarkRowsSlider, Math.min(BOOKMARK_ROWS_MAX, Math.max(BOOKMARK_ROWS_MIN, rows)), rowsLabel);
    }
    if (!saveTimers.has(refs.bookmarkColumnsSlider)) {
      setSlider(refs.bookmarkColumnsSlider, Number(config.getBookmarkColumns?.()) || 6, columnsLabel);
    }
    const folderIconsVisible = config.getBookmarkFolderIconsVisible?.() !== false;
    refs.bookmarkFolderIconsToggle.checked = folderIconsVisible;
    refs.bookmarkFolderIconsToggle.setAttribute('aria-checked', folderIconsVisible ? 'true' : 'false');
    refs.bookmarkFolderIconsToggle.setAttribute('aria-label', folderIconsLabel);
    refs.bookmarkTopbarLayoutLabel.textContent = t('bookmark_topbar_layout_title', 'Bar style');
    refs.bookmarkTopbarLayoutTabs.setAttribute('aria-label', t('bookmark_topbar_layout_title', 'Bar style'));
    refs.bookmarkTopbarLayoutTabs.querySelectorAll('[data-bookmark-topbar-layout]').forEach((button) => {
      button.textContent = button.getAttribute('data-bookmark-topbar-layout') === 'floating'
        ? t('bookmark_topbar_layout_floating', 'Floating')
        : t('bookmark_topbar_layout_docked', 'Docked to top');
    });
    syncTabs(
      refs.bookmarkTopbarLayoutTabs,
      'data-bookmark-topbar-layout',
      config.getBookmarkTopbarLayout?.() === 'floating' ? 'floating' : 'docked'
    );
    refs.bookmarkTopbarSurfaceLabel.textContent = t('bookmark_topbar_surface_title', 'Bar background');
    const storedSurfaceMode = config.getBookmarkTopbarSurfaceMode?.();
    const surfaceMode = isBookmarkTopbarSurfaceMode(storedSurfaceMode) ? storedSurfaceMode : 'adaptive';
    renderBookmarkSelects(viewMode, surfaceMode);

    const recentCount = getRecentCount();
    const recentTitle = t('settings_recent_sites_title', 'Site cards');
    refs.recentSettingsTitle.textContent = recentTitle;
    refs.recentSettingsToggle.setAttribute('aria-label', recentTitle);
    refs.recentSettingsTrigger.setAttribute('aria-label', recentTitle);
    setSectionState(
      refs.recentSettingsTrigger,
      refs.recentSettingsToggle,
      refs.recentSettingsBody,
      recentCount > 0,
      recentExpanded
    );
    refs.recentModeLabel.textContent = t('display_mode_title', 'Display mode');
    refs.recentModeTabs.setAttribute('aria-label', t('display_mode_title', 'Display mode'));
    refs.recentModeTabs.querySelectorAll('[data-recent-mode]').forEach((button) => {
      button.textContent = button.getAttribute('data-recent-mode') === 'most'
        ? t('recent_mode_most', 'Most visited')
        : t('recent_mode_latest', 'Recent');
    });
    syncTabs(refs.recentModeTabs, 'data-recent-mode', config.getRecentMode?.() === 'most' ? 'most' : 'latest');
    const recentRowsLabel = t('newtab_recent_rows_title', 'Site card rows');
    refs.recentRowsLabel.textContent = recentRowsLabel;
    refs.recentRowsTabs.setAttribute('aria-label', recentRowsLabel);
    syncTabs(
      refs.recentRowsTabs,
      'data-recent-rows',
      Math.round((recentCount || lastRecentCount || RECENT_COUNT_DEFAULT) / ITEMS_PER_ROW)
    );
  }

  // Storage listeners run in registration order; reading after them sees the page's new values.
  function scheduleUpdate(): void {
    if (!refs || updateTimer) return;
    updateTimer = window.setTimeout(update, 0);
  }

  function handleStorageChange(changes: StorageChanges | null | undefined): void {
    if (changes && Object.keys(changes).some((key) => watchedKeys.has(key))) scheduleUpdate();
  }

  // The page previews each step; storage (and so sync) only sees where the thumb settles.
  function bindSlider(
    slider: HTMLInputElement,
    toValue: (value: string) => number,
    setter: PersistedSetter<number> | undefined
  ): void {
    const persist = () => {
      window.clearTimeout(saveTimers.get(slider));
      saveTimers.delete(slider);
      setter?.(toValue(slider.value), { persist: true });
      update();
    };
    slider.addEventListener('input', () => {
      setter?.(toValue(slider.value), { persist: false });
      setSlider(slider, Number(slider.value), slider.getAttribute('aria-label') || '');
      window.clearTimeout(saveTimers.get(slider));
      saveTimers.set(slider, window.setTimeout(persist, SLIDER_SAVE_DELAY_MS));
    });
    slider.addEventListener('change', persist);
    if (helpers.bindSliderValueInput) helpers.bindSliderValueInput(slider);
  }

  function bindSettings(
    nextRefs: PanelRefs | null | undefined,
    nextView?: SectionSettingsView | null,
    nextHelpers?: SliderValueHelpers | null
  ): void {
    const boundRefs = nextRefs ? readSectionSettingsRefs(nextRefs) : null;
    if (!boundRefs) return;
    refs = boundRefs;
    view = nextView || null;
    helpers = nextHelpers || {};
    boundRefs.bookmarkSettingsTrigger.addEventListener('click', () => {
      if (getBookmarkCount() <= 0) return;
      bookmarkExpanded = !bookmarkExpanded;
      update();
    });
    // Switching a section on opens its settings, like every other section.
    boundRefs.bookmarkSettingsToggle.addEventListener('change', () => {
      if (!refs) return;
      rememberCounts();
      if (refs.bookmarkSettingsToggle.checked) bookmarkExpanded = true;
      config.setBookmarkCount?.(
        refs.bookmarkSettingsToggle.checked ? lastBookmarkCount || BOOKMARK_COUNT_DEFAULT : 0,
        { persist: true }
      );
      update();
    });
    bindSlider(boundRefs.bookmarkRowsSlider, (value) => Number(value) * ITEMS_PER_ROW, config.setBookmarkCount);
    bindSlider(boundRefs.bookmarkColumnsSlider, Number, config.setBookmarkColumns);
    boundRefs.bookmarkFolderIconsToggle.addEventListener('change', () => {
      if (!refs) return;
      config.setBookmarkFolderIconsVisible?.(refs.bookmarkFolderIconsToggle.checked, { persist: true });
      update();
    });
    boundRefs.bookmarkTopbarLayoutTabs.querySelectorAll('[data-bookmark-topbar-layout]').forEach((button) => {
      button.addEventListener('click', () => {
        config.setBookmarkTopbarLayout?.(button.getAttribute('data-bookmark-topbar-layout') || '');
        update();
      });
    });
    boundRefs.recentSettingsTrigger.addEventListener('click', () => {
      if (getRecentCount() <= 0) return;
      recentExpanded = !recentExpanded;
      update();
    });
    boundRefs.recentSettingsToggle.addEventListener('change', () => {
      if (!refs) return;
      rememberCounts();
      if (refs.recentSettingsToggle.checked) recentExpanded = true;
      config.setRecentCount?.(
        refs.recentSettingsToggle.checked ? lastRecentCount || RECENT_COUNT_DEFAULT : 0,
        { persist: true }
      );
      update();
    });
    boundRefs.recentModeTabs.querySelectorAll('[data-recent-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        config.setRecentMode?.(button.getAttribute('data-recent-mode') || '');
        update();
      });
    });
    boundRefs.recentRowsTabs.querySelectorAll('[data-recent-rows]').forEach((button) => {
      button.addEventListener('click', () => {
        config.setRecentCount?.(Number(button.getAttribute('data-recent-rows')) * ITEMS_PER_ROW, { persist: true });
        update();
      });
    });
    if (typeof window.ResizeObserver === 'function') {
      // Re-measure the tab indicators once a collapsed body lays out, and when labels change width.
      const observer = new window.ResizeObserver((entries) => entries.forEach((entry) => {
        syncSegmentedIndicator(entry.target);
      }));
      [boundRefs.bookmarkTopbarLayoutTabs, boundRefs.recentModeTabs, boundRefs.recentRowsTabs]
        .forEach((group) => observer.observe(group));
      tabResizeObserver = observer;
    }
    const onChanged = config.chromeObj && config.chromeObj.storage && config.chromeObj.storage.onChanged;
    if (onChanged) {
      onChanged.addListener(handleStorageChange);
      unsubscribe = () => onChanged.removeListener(handleStorageChange);
    }
    // The bodies ship hidden and are bound on the panel's first open; flush their first state
    // with transitions off so it does not play the collapsible entry animation.
    const bodies = [
      boundRefs.bookmarkSettingsBody,
      boundRefs.bookmarkGridSettings,
      boundRefs.bookmarkTopbarSettings,
      boundRefs.recentSettingsBody
    ];
    bodies.forEach((body) => { body.style.transition = 'none'; });
    update();
    bodies.forEach((body) => body.getBoundingClientRect());
    bodies.forEach((body) => { body.style.transition = ''; });
  }

  return Object.freeze({
    bindSettings,
    update,
    updateLanguage: update,
    handleStorageChange,
    destroy() {
      window.clearTimeout(updateTimer);
      saveTimers.forEach((timer) => window.clearTimeout(timer));
      saveTimers.clear();
      if (tabResizeObserver) tabResizeObserver.disconnect();
      if (unsubscribe) unsubscribe();
      refs = null;
    }
  });
}

type SectionPanelSettingsRuntime = ReturnType<typeof createRuntime>;

export { createRuntime };
export type { SectionPanelSettingsOptions, SectionPanelSettingsRuntime };
