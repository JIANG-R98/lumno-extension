// The daily quote: its line on the page, its settings in the appearance
// panel, and the custom collection it can read from.
import * as LumnoSettings from '../../domain/settings';
import type { NewtabQuotePosition, NewtabQuotePrefs } from '../../domain/settings';
import type { StorageAreaLike, StorageChangeEventLike, StorageChanges, StorageItems } from '../../domain/storage-port';
import { isHtmlElement, isHtmlTag } from '../../shared/dom-guards';
import { queryHtmlElement, queryHtmlElements, queryHtmlTags } from '../../shared/dom-lookup';
import type { TooltipController } from '../../shared/ui/tooltip';
import type { ShowToast, Translate } from '../newtab-types';
import type { WallpaperViewController } from '../react/wallpaper-view';
import * as LumnoNewtabRemoteContent from '../remote-content';
import type { RemoteContentClient } from '../remote-content';
import type { DailyQuote } from '../remote-content-types';
import * as LumnoCustomQuotes from '../../domain/custom-quotes';
import type { QuoteFile, QuoteLibrary } from '../../domain/custom-quotes';

type QuoteStorageArea = Pick<StorageAreaLike, 'get' | 'set'>;

// The extension API parts the runtime reads.
interface QuoteChromeApi {
  runtime?: { lastError?: { message?: string } | null };
  storage?: { onChanged?: StorageChangeEventLike };
}

type QuoteTooltip = Pick<TooltipController, 'show' | 'hide'>;

// The panel view, which renders the position and font dropdowns.
type QuoteSettingsView = Partial<Pick<WallpaperViewController, 'renderQuotePositionSelect' | 'renderQuoteFontSelect'>>;

interface QuoteRuntimeOptions {
  documentObj?: Document;
  windowObj?: Window & typeof globalThis;
  chromeObj?: QuoteChromeApi | null;
  // Where the quote preferences are saved.
  storageArea?: QuoteStorageArea | null;
  // This device's storage: the quote cache and the custom collection.
  localStorageArea?: QuoteStorageArea | null;
  t: Translate;
  showToast?: ShowToast;
  getLocale?: () => string | null | undefined;
  getSearchRoot(): HTMLElement;
  getShortcutSection?: () => HTMLElement | null | undefined;
  getTooltipController?: () => QuoteTooltip | null | undefined;
  // Whether a storage area name is the one the preferences are saved in.
  isPreferenceArea?: (areaName: string) => boolean;
  onLayout?: () => void;
  client?: Pick<RemoteContentClient, 'getQuote'>;
}

// The quote section of the appearance panel. The first four are always
// rendered; the rest depend on the panel version.
interface QuoteSettingsRefs {
  quoteTitle: HTMLElement;
  quoteEnabledToggle: HTMLInputElement;
  quoteBody: HTMLElement;
  quoteCategory: HTMLElement;
  quoteSection: HTMLElement | null;
  quoteDivider: HTMLElement | null;
  quoteAccordionTrigger: HTMLButtonElement | null;
  quoteInfoButton: HTMLElement | null;
  quotePositionLabel: HTMLElement | null;
  quoteCategoryLabel: HTMLElement | null;
  quoteSourceLabel: HTMLElement | null;
  quoteSource: HTMLElement | null;
  quoteCustomBody: HTMLElement | null;
  quoteImportButton: HTMLButtonElement | null;
  quoteLibraryShuffleButton: HTMLButtonElement | null;
  quoteImportStatus: HTMLElement | null;
  quoteLibraryCount: HTMLElement | null;
  quoteLibraryCountText: HTMLElement | null;
  quoteFileInput: HTMLInputElement | null;
  quoteFontLabel: HTMLElement | null;
  // The font size slider with its title and number field.
  quoteFontSize: { title: HTMLElement; slider: HTMLInputElement; input: HTMLInputElement } | null;
}

// The panel's elements by data-wallpaper-ref name.
type PanelRefs = Readonly<Partial<Record<string, HTMLElement>>>;

function readQuoteSettingsRefs(refs: PanelRefs): QuoteSettingsRefs | null {
  const element = (name: string): HTMLElement | null => {
    const value = refs[name];
    return isHtmlElement(value) ? value : null;
  };
  const button = (name: string): HTMLButtonElement | null => {
    const value = refs[name];
    return isHtmlTag(value, 'button') ? value : null;
  };
  const input = (name: string): HTMLInputElement | null => {
    const value = refs[name];
    return isHtmlTag(value, 'input') ? value : null;
  };
  const quoteTitle = element('quoteTitle');
  const quoteEnabledToggle = input('quoteEnabledToggle');
  const quoteBody = element('quoteBody');
  const quoteCategory = element('quoteCategory');
  if (!quoteTitle || !quoteEnabledToggle || !quoteBody || !quoteCategory) return null;
  const fontSizeTitle = element('quoteFontSizeTitle');
  const fontSizeSlider = input('quoteFontSizeSlider');
  const fontSizeInput = input('quoteFontSizeSliderValueInput');
  return {
    quoteTitle,
    quoteEnabledToggle,
    quoteBody,
    quoteCategory,
    quoteSection: element('quoteSection'),
    quoteDivider: element('quoteDivider'),
    quoteAccordionTrigger: button('quoteAccordionTrigger'),
    quoteInfoButton: element('quoteInfoButton'),
    quotePositionLabel: element('quotePositionLabel'),
    quoteCategoryLabel: element('quoteCategoryLabel'),
    quoteSourceLabel: element('quoteSourceLabel'),
    quoteSource: element('quoteSource'),
    quoteCustomBody: element('quoteCustomBody'),
    quoteImportButton: button('quoteImportButton'),
    quoteLibraryShuffleButton: button('quoteLibraryShuffleButton'),
    quoteImportStatus: element('quoteImportStatus'),
    quoteLibraryCount: element('quoteLibraryCount'),
    quoteLibraryCountText: element('quoteLibraryCountText'),
    quoteFileInput: input('quoteFileInput'),
    quoteFontLabel: element('quoteFontLabel'),
    quoteFontSize: fontSizeTitle && fontSizeSlider && fontSizeInput
      ? { title: fontSizeTitle, slider: fontSizeSlider, input: fontSizeInput }
      : null
  };
}

function createRuntime(options: QuoteRuntimeOptions) {
  const config = options;
  const document = config.documentObj || globalThis.document;
  const window = config.windowObj || globalThis.window;
  const settings = LumnoSettings;
  const custom = LumnoCustomQuotes;
  const key = settings.NEWTAB_QUOTE_PREFS_STORAGE_KEY;
  const t = config.t;
  // Hitokoto only serves Chinese text, so the quote exists for Chinese UI languages only.
  const isLocaleSupported = () => !config.getLocale || /^zh_(CN|TW)$/.test(config.getLocale() || '');
  const client = config.client || LumnoNewtabRemoteContent.createClient({
    storageArea: config.localStorageArea,
    fallbackQuote: () => ({
      text: t('newtab_quote_fallback_text', 'A journey of a thousand miles begins with a single step.'),
      author: t('newtab_quote_fallback_author', 'Laozi'),
      source: t('newtab_quote_fallback_source', 'Tao Te Ching'),
      url: 'https://hitokoto.cn/'
    })
  });
  const element = document.createElement('div');
  element.className = 'x-nt-quote';
  element.hidden = true;
  // The whole line opens the quote's Hitokoto page; its origin lives in the shared tooltip.
  const button = document.createElement('a');
  button.className = 'x-nt-quote-text';
  button.target = '_blank';
  button.rel = 'noopener noreferrer';
  // The link spans the whole row; the inline line box marks where the glyphs
  // actually sit, so wallpaper tone sampling stays local to the text.
  const line = document.createElement('span');
  line.className = 'x-nt-quote-line';
  button.appendChild(line);
  // Revealed on hover; it hangs past the line's end so the quote stays centered.
  const shuffleButton = document.createElement('button');
  shuffleButton.type = 'button';
  shuffleButton.className = 'x-nt-quote-shuffle';
  const shuffleIcon = document.createElement('i');
  shuffleIcon.className = 'ri-icon ri-size-16 ri-shuffle-line';
  shuffleIcon.setAttribute('aria-hidden', 'true');
  shuffleButton.appendChild(shuffleIcon);
  const row = document.createElement('div');
  row.className = 'x-nt-quote-row';
  row.append(button, shuffleButton);
  element.append(row);
  // Resolved on use: the page creates its tooltip controllers after the quote runtime.
  const getTooltip = () => (config.getTooltipController ? config.getTooltipController() : null);
  let origin = '';
  let prefs = settings.normalizeNewtabQuotePrefs(null);
  let quote: DailyQuote | null = null;
  let revision = 0;
  let refs: QuoteSettingsRefs | null = null;
  let view: QuoteSettingsView | null = null;
  let settingsExpanded = true;
  let mounted = false;
  let dayTimer: number | undefined;
  let unsubscribe: (() => void) | undefined;
  let disposed = false;
  let draftFontSize: number | null = null;
  let shuffling = false;
  let library: QuoteLibrary | null = null;
  let importing = false;
  let importError = false;
  let importMessage = '';
  // Settles once the cached quote (if any) is painted; the network refresh is never awaited.
  let cachedQuoteRead: Promise<unknown> = Promise.resolve();
  let localeSupported = isLocaleSupported();
  const isActive = () => prefs.enabled && (prefs.provider === 'custom' || localeSupported);
  const area = config.storageArea;
  function syncBottomHeight(): void {
    const height = !element.hidden && prefs.position === 'bottom'
      ? Math.ceil(element.getBoundingClientRect().height) : 0;
    document.body.style.setProperty('--x-nt-quote-bottom-height', `${height}px`);
  }
  const resizeObserver = typeof window.ResizeObserver === 'function'
    ? new window.ResizeObserver(syncBottomHeight) : null;

  function syncFontSizeControls(forceValue: boolean): void {
    const fontSize = refs && refs.quoteFontSize;
    if (!fontSize) return;
    const size = draftFontSize === null ? prefs.fontSize : draftFontSize;
    const min = settings.NEWTAB_QUOTE_FONT_SIZE_MIN;
    const max = settings.NEWTAB_QUOTE_FONT_SIZE_MAX;
    const label = t('newtab_quote_font_size_label', 'Quote font size (px)');
    fontSize.title.textContent = t('newtab_quote_font_size', 'Font size');
    fontSize.slider.min = String(min);
    fontSize.slider.max = String(max);
    fontSize.slider.step = '1';
    fontSize.slider.value = String(size);
    fontSize.slider.setAttribute('aria-label', label);
    fontSize.slider.style.setProperty('--x-range-slider-percent', `${(size - min) / (max - min) * 100}%`);
    const input = fontSize.input;
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.setAttribute('aria-label', label);
    if (forceValue || document.activeElement !== input) input.value = String(size);
  }

  function previewFontSize(value: string): void {
    draftFontSize = settings.normalizeNewtabQuotePrefs({ ...prefs, fontSize: value }).fontSize;
    element.style.setProperty('--x-nt-quote-font-size', `${draftFontSize}px`);
    syncFontSizeControls(false);
    syncBottomHeight();
    if (config.onLayout) config.onLayout();
  }

  function commitFontSize(value: string): void {
    const raw = String(value).trim();
    if (!raw || !Number.isFinite(Number(raw))) {
      draftFontSize = null;
      render();
    } else {
      const size = settings.normalizeNewtabQuotePrefs({ ...prefs, fontSize: raw }).fontSize;
      if (size !== prefs.fontSize) {
        draftFontSize = size;
        persist({ fontSize: size });
      }
      else {
        draftFontSize = null;
        render();
      }
    }
    syncFontSizeControls(true);
  }

  function getFont() {
    return settings.NEWTAB_QUOTE_FONTS.find((font) => font.id === prefs.font) || settings.NEWTAB_QUOTE_FONTS[0];
  }

  // Listed in on-page order, top to bottom.
  const POSITIONS: readonly NewtabQuotePosition[] = ['top', 'input', 'search', 'bottom'];
  function labels(): Record<NewtabQuotePosition | NewtabQuotePrefs['category'], string> {
    return {
      top: t('newtab_quote_top', 'Above search box'),
      input: t('newtab_quote_input', 'Below search box'),
      search: t('newtab_quote_search', 'Below shortcuts'),
      bottom: t('newtab_quote_bottom', 'Page bottom'),
      literature: t('newtab_quote_literature', 'Literature'),
      poetry: t('newtab_quote_poetry', 'Poetry')
    };
  }
  function updateSettings(): void {
    // Narrowed here, for the callbacks below.
    const panelRefs = refs;
    if (!panelRefs) return;
    if (panelRefs.quoteSection) panelRefs.quoteSection.hidden = false;
    if (panelRefs.quoteDivider) panelRefs.quoteDivider.hidden = false;
    const text = labels();
    const title = t('newtab_quote_title', 'Daily quote');
    panelRefs.quoteTitle.textContent = title;
    panelRefs.quoteEnabledToggle.checked = prefs.enabled;
    panelRefs.quoteEnabledToggle.setAttribute('aria-label', title);
    panelRefs.quoteBody.hidden = !(prefs.enabled && settingsExpanded);
    if (panelRefs.quoteAccordionTrigger) {
      panelRefs.quoteAccordionTrigger.disabled = !prefs.enabled;
      panelRefs.quoteAccordionTrigger.setAttribute('aria-disabled', prefs.enabled ? 'false' : 'true');
      panelRefs.quoteAccordionTrigger.setAttribute(
        'aria-expanded',
        prefs.enabled && settingsExpanded ? 'true' : 'false'
      );
    }
    if (panelRefs.quoteInfoButton) panelRefs.quoteInfoButton.setAttribute('aria-label', getProviderLabel());
    panelRefs.quoteCategory.setAttribute('aria-label', t('newtab_quote_category', 'Quote category'));
    if (panelRefs.quotePositionLabel) panelRefs.quotePositionLabel.textContent = t('newtab_quote_position', 'Quote position');
    if (panelRefs.quoteCategoryLabel) panelRefs.quoteCategoryLabel.textContent = t('newtab_quote_category', 'Quote category');
    const customMode = prefs.provider === 'custom';
    if (panelRefs.quoteSourceLabel) panelRefs.quoteSourceLabel.textContent = t('newtab_quote_source', 'Source');
    if (panelRefs.quoteSource) {
      panelRefs.quoteSource.setAttribute('aria-label', t('newtab_quote_source', 'Source'));
      queryHtmlTags(panelRefs.quoteSource, '[data-quote-provider]', 'button').forEach(item => {
        const provider = item.dataset.quoteProvider;
        item.textContent = provider === 'custom' ? t('newtab_quote_custom', 'Custom') : t('newtab_quote_hitokoto', 'Hitokoto');
        item.setAttribute('aria-pressed', String(provider === prefs.provider));
        item.setAttribute('data-active', String(provider === prefs.provider));
        item.disabled = importing;
      });
    }
    if (panelRefs.quoteCustomBody) panelRefs.quoteCustomBody.hidden = !customMode;
    panelRefs.quoteCategory.hidden = customMode;
    if (panelRefs.quoteCategory.parentElement?.classList.contains('x-nt-appearance-setting-row')) panelRefs.quoteCategory.parentElement.hidden = customMode;
    if (panelRefs.quoteImportButton) {
      panelRefs.quoteImportButton.textContent = importing
        ? t('newtab_quote_importing', 'Importing…')
        : (library ? t('newtab_quote_replace', 'Replace file') : t('newtab_quote_import', 'Import file'));
      panelRefs.quoteImportButton.disabled = importing;
    }
    if (panelRefs.quoteLibraryShuffleButton) {
      panelRefs.quoteLibraryShuffleButton.hidden = !library || library.quotes.length < 2;
      panelRefs.quoteLibraryShuffleButton.disabled = importing;
    }
    // Under the title only when an import fails.
    if (panelRefs.quoteImportStatus) {
      panelRefs.quoteImportStatus.textContent = importMessage;
      panelRefs.quoteImportStatus.hidden = !importMessage;
      panelRefs.quoteImportStatus.setAttribute('data-error', importError ? 'true' : 'false');
      panelRefs.quoteImportStatus.setAttribute('role', importError ? 'alert' : 'status');
    }
    // Beside the actions: how many quotes; hovering it names the file.
    if (panelRefs.quoteLibraryCount) {
      const count = library ? t('newtab_quote_count', '{count} quotes').replace('{count}', String(library.quotes.length)) : '';
      panelRefs.quoteLibraryCount.hidden = !library;
      if (panelRefs.quoteLibraryCountText) panelRefs.quoteLibraryCountText.textContent = count;
      panelRefs.quoteLibraryCount.setAttribute('aria-label', library ? `${library.filename} · ${count}` : '');
    }
    syncFontSizeControls(false);
    queryHtmlElements(panelRefs.quoteCategory, '[data-quote-category]').forEach((item) => {
      const value = item.getAttribute('data-quote-category');
      item.textContent = value === 'poetry' || value === 'literature' ? text[value] : '';
      const selected = value === prefs.category;
      item.setAttribute('aria-pressed', selected ? 'true' : 'false');
      item.setAttribute('data-active', selected ? 'true' : 'false');
    });
    syncTabIndicator(panelRefs.quoteCategory);
    if (panelRefs.quoteSource) syncTabIndicator(panelRefs.quoteSource);
    if (view && view.renderQuotePositionSelect) {
      view.renderQuotePositionSelect({
        ariaLabel: t('newtab_quote_position', 'Quote position'),
        options: POSITIONS.map((value) => ({ value, label: text[value] })),
        value: prefs.position,
        onChange: (position) => persist({ position })
      });
    }
    if (panelRefs.quoteFontLabel) panelRefs.quoteFontLabel.textContent = t('newtab_quote_font', 'Font');
    if (view && view.renderQuoteFontSelect) {
      view.renderQuoteFontSelect({
        ariaLabel: t('newtab_quote_font_label', 'Quote font'),
        options: settings.NEWTAB_QUOTE_FONTS.map((font) => ({ value: font.id, label: t(font.labelKey, font.label) })),
        value: getFont().id,
        onChange: (font) => persist({ font })
      });
    }
  }
  // Tabs hug their labels, so the indicator follows the active button's measured box.
  function syncTabIndicator(group: ParentNode): void {
    const segmentedIndicator = globalThis.LumnoSegmentedIndicator;
    if (segmentedIndicator) segmentedIndicator.sync(queryHtmlElement(group, '.x-nt-segmented-tabs-indicator'));
  }
  const tabResizeObserver = typeof window.ResizeObserver === 'function'
    ? new window.ResizeObserver((entries) => entries.forEach((entry) => syncTabIndicator(entry.target)))
    : null;
  const shuffleLabel = () => t('newtab_quote_shuffle', 'Show another quote');
  // Full-width closing punctuation leaves half an em of blank space after its ink, which reads as
  // a lopsided gap at the end of the line, so the trailing run is set half-width.
  const TRAILING_PUNCTUATION = /[、。，．：；！？）〉》」』】〕〗”’]+$/;
  function renderLine(text: string): void {
    if (line.textContent === text) return;
    const tail = TRAILING_PUNCTUATION.exec(text);
    if (!tail) {
      line.textContent = text;
      return;
    }
    const tailElement = document.createElement('span');
    tailElement.className = 'x-nt-quote-tail';
    tailElement.textContent = tail[0];
    line.replaceChildren(document.createTextNode(text.slice(0, tail.index)), tailElement);
  }
  function updateText(): void {
    element.setAttribute('aria-label', t('newtab_quote_title', 'Daily quote'));
    shuffleButton.setAttribute('aria-label', shuffleLabel());
    if (!config.getTooltipController) shuffleButton.title = shuffleLabel();
    if (quote) {
      renderLine(quote.text);
      origin = [quote.author, quote.source ? `《${quote.source}》` : ''].filter(Boolean).join(' · ');
      if (!config.getTooltipController) button.title = origin;
      button.setAttribute('aria-label', [quote.text, origin].filter(Boolean).join(' — '));
      if (prefs.provider === 'custom') { button.removeAttribute('href'); button.tabIndex = -1; }
      else { button.href = /^https:\/\/hitokoto\.cn\//.test(quote.url || '') ? quote.url : 'https://hitokoto.cn/'; button.removeAttribute('tabindex'); }
    }
    updateSettings();
  }
  function render(): void {
    if (!mounted || disposed) return;
    element.dataset.position = prefs.position;
    document.body.dataset.quotePosition = isActive() ? prefs.position : 'off';
    element.style.setProperty('--x-nt-quote-font-size', `${draftFontSize === null ? prefs.fontSize : draftFontSize}px`);
    element.style.setProperty('--x-nt-quote-font-family', getFont().family);
    element.hidden = !isActive() || !quote;
    // Re-inserting a node restarts its entry animation, so only move it when its slot changed.
    const place = (parent: ParentNode | null, before: ChildNode | null) => {
      if (parent && (element.parentNode !== parent || element.nextSibling !== before)) parent.insertBefore(element, before);
    };
    if (prefs.position === 'top') {
      const anchor = config.getSearchRoot();
      place(anchor.parentNode, anchor);
    } else if (prefs.position === 'input') {
      const anchor = config.getSearchRoot();
      place(anchor.parentNode, anchor.nextSibling);
    } else if (prefs.position === 'search') {
      const shortcuts = config.getShortcutSection && config.getShortcutSection();
      const anchor = shortcuts && shortcuts.parentNode ? shortcuts : config.getSearchRoot();
      place(anchor.parentNode, anchor.nextSibling);
    } else if (element.parentNode !== document.body) document.body.appendChild(element);
    updateText();
    syncBottomHeight();
    if (config.onLayout) config.onLayout();
  }
  async function refresh(): Promise<void> {
    const current = ++revision;
    if (!isActive()) return render();
    if (prefs.provider === 'custom') {
      const values = await (cachedQuoteRead = readCustomValues());
      if (current !== revision || disposed || prefs.provider !== 'custom') return;
      library = custom.normalizeLibrary(values[custom.KEY]);
      quote = library ? custom.select(library, new Date(), custom.readQuotePick(values[custom.PICK_KEY]), false).quote : null;
      render(); scheduleDaily(); return;
    }
    const category = prefs.category;
    // Render the last successful response before making a network request.
    const localArea = config.localStorageArea;
    if (localArea) {
      await (cachedQuoteRead = new Promise<void>((resolve) => {
        void localArea.get([LumnoNewtabRemoteContent.QUOTE_CACHE_KEY], (values) => {
          const cached = LumnoNewtabRemoteContent.readCachedQuoteFor(
            values && values[LumnoNewtabRemoteContent.QUOTE_CACHE_KEY],
            category
          );
          if (current === revision && cached) {
            quote = cached;
            render();
          }
          resolve();
        });
      }));
    }
    const next = await client.getQuote(category);
    if (current !== revision || disposed || !isActive()) return;
    quote = next;
    render();
    scheduleDaily();
  }
  function scheduleDaily(): void {
    window.clearTimeout(dayTimer);
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 1, 0);
    dayTimer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, tomorrow.getTime() - Date.now());
  }
  function apply(value: unknown): void {
    const next = settings.normalizeNewtabQuotePrefs(value);
    const changedCategory = next.category !== prefs.category || next.provider !== prefs.provider;
    const activated = !isActive() && next.enabled && (next.provider === 'custom' || localeSupported);
    prefs = next;
    draftFontSize = null;
    if (changedCategory) quote = null;
    sync(changedCategory || activated);
  }
  function sync(shouldRefresh: boolean): void {
    if (!isActive()) {
      revision += 1;
      window.clearTimeout(dayTimer);
    }
    render();
    updateSettings();
    if (shouldRefresh) refresh().catch(() => {});
  }
  function updateLanguage(): void {
    const supported = isLocaleSupported();
    if (supported === localeSupported) return updateText();
    localeSupported = supported;
    sync(mounted && supported && prefs.enabled);
  }
  // Saves a preference change; each value is normalized like a stored one.
  function persist(change: Partial<Record<keyof NewtabQuotePrefs, unknown>>): void {
    const next = settings.normalizeNewtabQuotePrefs({ ...prefs, ...change });
    if (!area) return;
    void area.set({ [key]: next }, () => {
      const error = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
      if (error) {
        draftFontSize = null;
        render();
        if (config.showToast) config.showToast(t('newtab_quote_save_error', 'Failed to save quote settings'), true);
      } else apply(next);
    });
  }
  function handleStorageChange(changes: StorageChanges, areaName: string): void {
    if (disposed) return;
    const prefsChange = changes[key];
    if (prefsChange && (!config.isPreferenceArea || config.isPreferenceArea(areaName))) apply(prefsChange.newValue);
    const libraryChange = changes[custom.KEY];
    if (areaName === 'local' && (libraryChange || changes[custom.PICK_KEY])) {
      if (libraryChange) library = custom.normalizeLibrary(libraryChange.newValue);
      updateSettings();
      if (prefs.provider === 'custom') refresh().catch(() => {});
    }
    const cacheChange = changes[LumnoNewtabRemoteContent.QUOTE_CACHE_KEY];
    if (prefs.provider !== 'custom' && areaName === 'local' && cacheChange) {
      const cached = LumnoNewtabRemoteContent.readCachedQuoteFor(cacheChange.newValue, prefs.category);
      if (cached) {
        quote = cached;
        render();
      }
    }
  }
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && isActive()) refresh().catch(() => {});
  };
  // Open toward the free side of the page: away from the search box, and inward at the bottom edge.
  const showTooltip = (target: HTMLElement, text: string) => {
    const tooltip = getTooltip();
    if (tooltip && text) {
      tooltip.show(target, text, { placement: prefs.position === 'top' || prefs.position === 'bottom' ? 'top' : 'bottom' });
    }
  };
  const showOrigin = () => showTooltip(button, origin);
  const hideOrigin = () => {
    const tooltip = getTooltip();
    if (tooltip) tooltip.hide();
  };
  // The pick replaces today's cached quote, so it stays until the next daily update.
  async function shuffle(): Promise<void> {
    if (shuffling || !isActive()) return;
    const current = ++revision;
    const category = prefs.category;
    shuffling = true;
    shuffleButton.dataset.loading = 'true';
    shuffleButton.setAttribute('aria-busy', 'true');
    try {
      let next: DailyQuote;
      if (prefs.provider === 'custom') {
        const values = await readCustomValues();
        const currentLibrary = custom.normalizeLibrary(values[custom.KEY]);
        if (!currentLibrary) return;
        const selected = custom.select(currentLibrary, new Date(), custom.readQuotePick(values[custom.PICK_KEY]), true);
        await saveCustomValues({ [custom.PICK_KEY]: selected.pick });
        next = selected.quote;
      } else next = await client.getQuote(category, { reroll: true });
      if (current !== revision || disposed || !isActive()) return;
      quote = next;
      render();
      // Restart the swap fade even when two shuffles land back to back.
      line.removeAttribute('data-swap');
      void line.offsetWidth;
      line.setAttribute('data-swap', 'true');
    } catch {
      if (!disposed && config.showToast) config.showToast(t('newtab_quote_shuffle_error', 'Could not load another quote'), true);
    } finally {
      shuffling = false;
      delete shuffleButton.dataset.loading;
      shuffleButton.removeAttribute('aria-busy');
    }
  }
  const showShuffleLabel = () => showTooltip(shuffleButton, shuffleLabel());
  function getProviderLabel(): string {
    return prefs.provider === 'custom' ? t('newtab_quote_provider_custom', 'Custom collection · on this device, syncs with WebDAV') : t('newtab_quote_provider', 'Powered by Hitokoto');
  }
  function getLastError(): { message?: string } | null | undefined {
    return (config.chromeObj || globalThis.chrome)?.runtime?.lastError;
  }
  function readCustomValues(): Promise<StorageItems> {
    return new Promise((resolve, reject) => {
      const localArea = config.localStorageArea;
      if (!localArea) return resolve({});
      void localArea.get([custom.KEY, custom.PICK_KEY], values => {
        const error = getLastError();
        if (error) reject(new Error(error.message)); else resolve(values || {});
      });
    });
  }
  function saveCustomValues(values: StorageItems): Promise<void> {
    return new Promise((resolve, reject) => {
      const localArea = config.localStorageArea;
      if (!localArea) return reject(new Error('Local quote storage unavailable'));
      void localArea.set(values, () => {
        const error = getLastError();
        if (error) reject(new Error(error.message)); else resolve();
      });
    });
  }
  async function importQuoteFile(file: QuoteFile): Promise<boolean> {
    if (importing || disposed) return false;
    importing = true; importError = false; importMessage = ''; updateSettings();
    let saving = false;
    try {
      const next = await custom.readLibraryFile(file);
      saving = true;
      await saveCustomValues({ [custom.KEY]: next, [custom.PICK_KEY]: null });
      saving = false;
      if (disposed) return false;
      library = next;
      persist({ provider: 'custom' });
      if (prefs.provider === 'custom') await refresh();
      return true;
    } catch {
      if (!disposed) {
        importError = true;
        importMessage = saving
          ? t('newtab_quote_collection_save_error', 'Couldn’t save on this device. Your previous collection is kept.')
          : t('newtab_quote_import_error', 'Import failed: the file doesn’t meet the format or size limits. Your previous collection is kept.');
      }
      return false;
    } finally { importing = false; if (!disposed) updateSettings(); }
  }
  shuffleButton.addEventListener('click', () => { void shuffle(); });
  line.addEventListener('animationend', () => line.removeAttribute('data-swap'));
  shuffleButton.addEventListener('mouseenter', showShuffleLabel);
  shuffleButton.addEventListener('focus', showShuffleLabel);
  shuffleButton.addEventListener('mouseleave', hideOrigin);
  shuffleButton.addEventListener('blur', hideOrigin);
  button.addEventListener('mouseenter', showOrigin);
  button.addEventListener('focus', showOrigin);
  button.addEventListener('mouseleave', hideOrigin);
  button.addEventListener('blur', hideOrigin);
  button.addEventListener('click', hideOrigin);
  // The position select is a React island owned by the panel view, so the view renders it.
  function bindSettings(nextRefs: PanelRefs, nextView?: QuoteSettingsView | null): void {
    const panelRefs = readQuoteSettingsRefs(nextRefs);
    refs = panelRefs;
    view = nextView || null;
    if (!panelRefs) return;
    const toggle = panelRefs.quoteEnabledToggle;
    toggle.addEventListener('change', () => {
      if (toggle.checked) settingsExpanded = true;
      persist({ enabled: toggle.checked });
    });
    if (panelRefs.quoteSource) {
      queryHtmlTags(panelRefs.quoteSource, '[data-quote-provider]', 'button')
        .forEach(item => item.addEventListener('click', () => persist({ provider: item.dataset.quoteProvider })));
    }
    const fileInput = panelRefs.quoteFileInput;
    panelRefs.quoteImportButton?.addEventListener('click', () => fileInput?.click());
    panelRefs.quoteLibraryShuffleButton?.addEventListener('click', () => { void shuffle(); });
    const libraryCount = panelRefs.quoteLibraryCount;
    if (libraryCount) {
      const showFile = () => {
        const tooltip = getTooltip();
        if (tooltip && library) tooltip.show(libraryCount, library.filename, { placement: 'top' });
      };
      const hideFile = () => { const tooltip = getTooltip(); if (tooltip) tooltip.hide(); };
      libraryCount.addEventListener('mouseenter', showFile);
      libraryCount.addEventListener('focus', showFile);
      libraryCount.addEventListener('mouseleave', hideFile);
      libraryCount.addEventListener('blur', hideFile);
    }
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) void importQuoteFile(file);
    });
    if (panelRefs.quoteAccordionTrigger) {
      panelRefs.quoteAccordionTrigger.addEventListener('click', () => {
        if (!prefs.enabled) return;
        settingsExpanded = !settingsExpanded;
        updateSettings();
      });
    }
    queryHtmlElements(panelRefs.quoteCategory, '[data-quote-category]').forEach((item) => {
      item.addEventListener('click', () => persist({ category: item.dataset.quoteCategory }));
    });
    if (tabResizeObserver) {
      // Re-measure once the collapsed panel lays out, and when translated labels change width.
      tabResizeObserver.observe(panelRefs.quoteCategory);
      if (panelRefs.quoteSource) tabResizeObserver.observe(panelRefs.quoteSource);
    }
    if (panelRefs.quoteFontSize) {
      const { slider, input } = panelRefs.quoteFontSize;
      slider.addEventListener('input', () => previewFontSize(slider.value));
      slider.addEventListener('change', () => commitFontSize(slider.value));
      input.addEventListener('input', () => {
        if (input.value.trim() && Number.isFinite(Number(input.value))) previewFontSize(input.value);
      });
      input.addEventListener('blur', () => commitFontSize(input.value));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          input.blur();
        }
      });
    }
    // The body ships hidden and is bound on the panel's first open, so its first sync would
    // otherwise play the collapsible entry animation. Flush that state with transitions off.
    const body = panelRefs.quoteBody;
    body.style.transition = 'none';
    updateSettings();
    body.getBoundingClientRect();
    body.style.transition = '';
  }
  function mount(): Promise<void> {
    mounted = true;
    render();
    if (resizeObserver) resizeObserver.observe(element);
    document.addEventListener('visibilitychange', onVisibility);
    const onChanged = config.chromeObj && config.chromeObj.storage && config.chromeObj.storage.onChanged;
    if (onChanged) {
      onChanged.addListener(handleStorageChange);
      unsubscribe = () => onChanged.removeListener(handleStorageChange);
    }
    // Resolves after the saved preference and cached quote are rendered, so the page can
    // reveal with the quote already in its slot instead of shifting the layout afterwards.
    return new Promise((resolve, reject) => {
      if (!area) return resolve();
      void area.get([key], (values) => {
        if (!disposed) apply(values && values[key]);
        cachedQuoteRead.then(() => resolve(), reject);
      });
    });
  }
  return Object.freeze({ element, textElement: line, mount, bindSettings, updateLanguage, getProviderLabel,
    importQuoteFile,
    importMarkdown: importQuoteFile,
    destroy() {
      disposed = true;
      revision += 1;
      window.clearTimeout(dayTimer);
      if (resizeObserver) resizeObserver.disconnect();
      if (tabResizeObserver) tabResizeObserver.disconnect();
      if (unsubscribe) unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      hideOrigin();
      element.remove();
    } });
}

type QuoteRuntime = ReturnType<typeof createRuntime>;

export { createRuntime };
export type { QuoteRuntime, QuoteRuntimeOptions, QuoteSettingsRefs };
