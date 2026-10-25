// The daily quote on the Options page: the same settings as the quote section
// of New Tab's appearance panel. Both edit one synced preference record
// (enabled, provider, category, position, font, font size); the custom collection
// lives in chrome.storage.local and travels with WebDAV, not browser sync.
import type * as CustomQuotes from '../domain/custom-quotes';
import type { QuoteLibrary } from '../domain/custom-quotes';
import type * as Settings from '../domain/settings';
import type { NewtabQuotePosition, NewtabQuotePrefs } from '../domain/settings';
import type { StorageAreaLike } from '../domain/storage-port';
import { isHtmlElement, isHtmlTag } from '../shared/dom-guards';
import type { LayoutMutation } from './options-panel-motion';
import type { GetMessage } from './options-types';
import type { SegmentedControlController } from './react/segmented-control';
import type { RangeSliderControlController, RangeSliderControlControllerOptions } from './react/settings-controls';

const POSITIONS: readonly NewtabQuotePosition[] = Object.freeze(['top', 'input', 'search', 'bottom']);

interface DailyQuoteOptions {
  documentObj?: Document;
  settings: Pick<typeof Settings, 'normalizeNewtabQuotePrefs' | 'NEWTAB_QUOTE_PREFS_STORAGE_KEY' |
    'NEWTAB_QUOTE_FONT_SIZE_MIN' | 'NEWTAB_QUOTE_FONT_SIZE_MAX' | 'NEWTAB_QUOTE_FONT_SIZE_DEFAULT'>;
  customQuotes: Pick<typeof CustomQuotes, 'KEY' | 'PICK_KEY' | 'readLibraryFile' | 'normalizeLibrary' | 'select' |
    'readQuotePick'>;
  getMessage: GetMessage;
  showToast?(message: string, isError?: boolean): void;
  // The synced area the preferences live in.
  syncArea: StorageAreaLike | null;
  // chrome.storage.local, for the custom collection.
  localArea: StorageAreaLike | null;
  createSegmented(host: HTMLElement | null, kind: string, onSelect: (value: string) => void): Pick<SegmentedControlController, 'render'>;
  createRangeSlider(host: HTMLElement | null, options: RangeSliderControlControllerOptions): Pick<RangeSliderControlController, 'render'>;
  registerToggle(input: HTMLInputElement, kind: string): unknown;
  setToggleState(input: HTMLInputElement, checked: boolean): void;
  registerSelect(select: HTMLSelectElement, kind: string): unknown;
  setSelectState(select: HTMLSelectElement, value: unknown): void;
  setRowVisible(row: HTMLElement | null, visible: boolean): boolean;
  animateHeight(mutateLayout: LayoutMutation): unknown;
}

function createDailyQuoteSettings(options: DailyQuoteOptions) {
  const doc = options.documentObj || globalThis.document;
  const settings = options.settings;
  const custom = options.customQuotes;
  const getMessage = options.getMessage;
  const byId = (id: string): HTMLElement | null => {
    const element = doc.getElementById(id);
    return isHtmlElement(element) ? element : null;
  };
  const toggle = doc.getElementById('_x_extension_newtab_quote_toggle_2026_unique_');
  const status = byId('_x_extension_newtab_quote_import_status_2026_unique_');
  const count = byId('_x_extension_newtab_quote_count_2026_unique_');
  const countText = byId('_x_extension_newtab_quote_count_text_2026_unique_');
  const shuffleButton = doc.getElementById('_x_extension_newtab_quote_shuffle_2026_unique_');
  const importButton = doc.getElementById('_x_extension_newtab_quote_import_2026_unique_');
  const file = doc.getElementById('_x_extension_newtab_quote_file_2026_unique_');
  const position = doc.getElementById('_x_extension_newtab_quote_position_select_2026_unique_');
  const font = doc.getElementById('_x_extension_newtab_quote_font_select_2026_unique_');
  if (!isHtmlTag(toggle, 'input') || !status || !count || !countText ||
      !isHtmlTag(shuffleButton, 'button') || !isHtmlTag(importButton, 'button') || !isHtmlTag(file, 'input') ||
      !isHtmlTag(position, 'select') || !isHtmlTag(font, 'select')) {
    return null;
  }
  const els = {
    toggle,
    info: byId('_x_extension_newtab_quote_info_2026_unique_'),
    sourceRow: byId('_x_extension_newtab_quote_source_row_2026_unique_'),
    sourceTabs: byId('_x_extension_newtab_quote_source_tabs_wrap_2026_unique_'),
    libraryRow: byId('_x_extension_newtab_quote_library_row_2026_unique_'),
    status,
    count,
    countText,
    shuffle: shuffleButton,
    importButton,
    file,
    categoryRow: byId('_x_extension_newtab_quote_category_row_2026_unique_'),
    categoryTabs: byId('_x_extension_newtab_quote_category_tabs_wrap_2026_unique_'),
    positionRow: byId('_x_extension_newtab_quote_position_row_2026_unique_'),
    position,
    fontRow: byId('_x_extension_newtab_quote_font_row_2026_unique_'),
    font,
    fontSizeRow: byId('_x_extension_newtab_quote_font_size_row_2026_unique_'),
    fontSizeHost: byId('_x_extension_newtab_quote_font_size_control_2026_unique_')
  };
  let prefs: NewtabQuotePrefs = settings.normalizeNewtabQuotePrefs(null);
  let library: QuoteLibrary | null = null;
  let importing = false;
  let shuffling = false;
  let importError = '';

  const sourceTabs = options.createSegmented(els.sourceTabs, 'newtab-quote-source', (value) => {
    persist({ provider: value === 'custom' ? 'custom' : 'hitokoto' });
  });
  const categoryTabs = options.createSegmented(els.categoryTabs, 'newtab-quote-category', (value) => {
    persist({ category: value === 'poetry' ? 'poetry' : 'literature' });
  });
  const fontSize = options.createRangeSlider(els.fontSizeHost, {
    kind: 'newtab-quote-font-size',
    onInput(value) {
      persist({ fontSize: Number(value) });
    }
  });
  options.registerToggle(els.toggle, 'newtab-quote');
  options.registerSelect(els.position, 'newtab-quote-position');
  options.registerSelect(els.font, 'newtab-quote-font');

  function persist(patch: Partial<NewtabQuotePrefs>): Promise<void> | void {
    const next = settings.normalizeNewtabQuotePrefs({ ...prefs, ...patch });
    prefs = next;
    render();
    return options.syncArea
      ? options.syncArea.set({ [settings.NEWTAB_QUOTE_PREFS_STORAGE_KEY]: next })
      : undefined;
  }

  function readLocal(keys: string[]): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const localArea = options.localArea;
      if (!localArea) {
        resolve({});
        return;
      }
      localArea.get(keys, (values) => resolve(values || {}));
    });
  }

  function writeLocal(values: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const localArea = options.localArea;
      if (!localArea) {
        reject(new Error('Local storage unavailable'));
        return;
      }
      localArea.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message)); else resolve();
      });
    });
  }

  function renderSegmented(): void {
    sourceTabs.render({
      activeValue: prefs.provider,
      dataAttribute: 'data-quote-provider',
      items: [
        { value: 'hitokoto', labelKey: 'newtab_quote_hitokoto', label: getMessage('newtab_quote_hitokoto', 'Hitokoto') },
        { value: 'custom', labelKey: 'newtab_quote_custom', label: getMessage('newtab_quote_custom', 'Custom') }
      ]
    });
    categoryTabs.render({
      activeValue: prefs.category,
      dataAttribute: 'data-quote-category',
      items: [
        { value: 'literature', labelKey: 'newtab_quote_literature', label: getMessage('newtab_quote_literature', 'Literature') },
        { value: 'poetry', labelKey: 'newtab_quote_poetry', label: getMessage('newtab_quote_poetry', 'Poetry') }
      ]
    });
  }

  function renderFontSize(): void {
    const min = settings.NEWTAB_QUOTE_FONT_SIZE_MIN;
    const max = settings.NEWTAB_QUOTE_FONT_SIZE_MAX;
    fontSize.render({
      ariaLabel: getMessage('newtab_quote_font_size_label', 'Quote font size'),
      defaultValue: settings.NEWTAB_QUOTE_FONT_SIZE_DEFAULT,
      id: '_x_extension_newtab_quote_font_size_slider_2026_unique_',
      min,
      max,
      resetAriaLabel: getMessage('newtab_quote_font_size_reset', 'Reset quote font size'),
      resetButtonId: '_x_extension_newtab_quote_font_size_reset_2026_unique_',
      step: 1,
      ticks: [
        { align: 'start', label: String(min) },
        { label: String(Math.round((min + max) / 2)) },
        { align: 'end', label: String(max) }
      ],
      value: prefs.fontSize
    });
  }

  function renderLibrary(): void {
    const count = library ? getMessage('newtab_quote_count', '{count} quotes').replace('{count}', String(library.quotes.length)) : '';
    els.count.hidden = !library;
    els.countText.textContent = count;
    els.count.setAttribute('data-tooltip', library ? library.filename : '');
    els.count.setAttribute('aria-label', library ? `${library.filename} · ${count}` : '');
    els.shuffle.hidden = !library || library.quotes.length < 2;
    els.shuffle.disabled = importing || shuffling;
    els.importButton.disabled = importing;
    // The page's language refresh rewrites labels from data-i18n, so the
    // attribute follows whichever label the button shows.
    const importKey = importing ? 'newtab_quote_importing' : (library ? 'newtab_quote_replace' : 'newtab_quote_import');
    const importFallback: Record<string, string> = {
      newtab_quote_importing: 'Importing…',
      newtab_quote_replace: 'Replace file',
      newtab_quote_import: 'Import file'
    };
    els.importButton.setAttribute('data-i18n', importKey);
    els.importButton.textContent = getMessage(importKey, importFallback[importKey]);
    els.status.textContent = importError;
    els.status.hidden = !importError;
    els.status.setAttribute('role', importError ? 'alert' : 'status');
  }

  function render(): void {
    options.setToggleState(els.toggle, prefs.enabled);
    options.setSelectState(els.position, POSITIONS.includes(prefs.position) ? prefs.position : 'search');
    options.setSelectState(els.font, prefs.font);
    const isCustom = prefs.provider === 'custom';
    const infoKey = isCustom ? 'newtab_quote_provider_custom' : 'newtab_quote_provider';
    const infoText = isCustom
      ? getMessage(infoKey, 'Custom collection · on this device, syncs with WebDAV')
      : getMessage(infoKey, 'Powered by Hitokoto');
    if (els.info) {
      els.info.setAttribute('data-i18n-tooltip', infoKey);
      els.info.setAttribute('data-tooltip', infoText);
      els.info.setAttribute('aria-label', infoText);
    }
    renderSegmented();
    renderFontSize();
    renderLibrary();
    options.animateHeight(() => {
      let changed = false;
      const rows: Array<[HTMLElement | null, boolean]> = [
        [els.sourceRow, prefs.enabled],
        [els.libraryRow, prefs.enabled && isCustom],
        [els.categoryRow, prefs.enabled && !isCustom],
        [els.positionRow, prefs.enabled],
        [els.fontRow, prefs.enabled],
        [els.fontSizeRow, prefs.enabled]
      ];
      rows.forEach(([row, visible]) => {
        changed = options.setRowVisible(row, visible) || changed;
      });
      return changed;
    });
  }

  async function importFile(file: File): Promise<void> {
    if (importing) return;
    importing = true;
    importError = '';
    renderLibrary();
    let saving = false;
    try {
      const next = await custom.readLibraryFile(file);
      saving = true;
      await writeLocal({ [custom.KEY]: next, [custom.PICK_KEY]: null });
      library = next;
      await persist({ provider: 'custom' });
    } catch (_error) {
      importError = saving
        ? getMessage('newtab_quote_collection_save_error', 'Couldn’t save on this device. Your previous collection is kept.')
        : getMessage('newtab_quote_import_error', 'Import failed: the file doesn’t meet the format or size limits. Your previous collection is kept.');
    } finally {
      importing = false;
      renderLibrary();
    }
  }

  // Moves today's pick on, the way Shuffle on New Tab does; an open New Tab
  // follows the stored pick.
  async function shuffle(): Promise<void> {
    if (shuffling || !library) return;
    shuffling = true;
    renderLibrary();
    try {
      const values = await readLocal([custom.KEY, custom.PICK_KEY]);
      const current = custom.normalizeLibrary(values[custom.KEY]);
      if (!current) return;
      const selected = custom.select(current, new Date(), custom.readQuotePick(values[custom.PICK_KEY]), true);
      await writeLocal({ [custom.PICK_KEY]: selected.pick });
      if (options.showToast) {
        options.showToast(selected.quote.text);
      }
    } catch (_error) {
      if (options.showToast) {
        options.showToast(getMessage('newtab_quote_shuffle_error', 'Could not load another quote'), true);
      }
    } finally {
      shuffling = false;
      renderLibrary();
    }
  }

  els.toggle.addEventListener('change', () => persist({ enabled: els.toggle.checked }));
  els.position.addEventListener('change', () => {
    persist({ position: POSITIONS.find((value) => value === els.position.value) || 'search' });
  });
  els.font.addEventListener('change', () => persist({ font: els.font.value }));
  els.importButton.addEventListener('click', () => els.file.click());
  els.file.addEventListener('change', () => {
    const file = els.file.files && els.file.files[0];
    els.file.value = '';
    if (file) importFile(file);
  });
  els.shuffle.addEventListener('click', () => { shuffle(); });

  function applyPrefs(value: unknown): void {
    prefs = settings.normalizeNewtabQuotePrefs(value);
    render();
  }

  function applyLibrary(value: unknown): void {
    library = custom.normalizeLibrary(value);
    renderLibrary();
  }

  function load(): Promise<void> {
    return readLocal([custom.KEY]).then((values) => applyLibrary(values[custom.KEY]));
  }

  render();
  return Object.freeze({
    applyLibrary,
    applyPrefs,
    load,
    updateLanguage: render
  });
}

export { createDailyQuoteSettings };
export type { DailyQuoteOptions };
