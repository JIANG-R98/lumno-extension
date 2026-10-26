// The daily quote on the Options page: the same settings as the quote section
// of New Tab's appearance panel. Both edit one synced preference record
// (enabled, provider, category, position, font, font size); the custom collection
// lives in chrome.storage.local and travels with WebDAV, not browser sync.
// One React view draws it.
import type * as CustomQuotes from '../domain/custom-quotes';
import type { QuoteLibrary } from '../domain/custom-quotes';
import type * as Settings from '../domain/settings';
import type { NewtabQuotePosition, NewtabQuotePrefs } from '../domain/settings/newtab-quote';
import type { StorageAreaLike, StorageItems } from '../domain/storage-port';
import type { SectionView } from './options-section-view';
import type { SectionSettingBinder } from './options-section-setting';
import type { StorageChangeRegistry } from './options-setting-bindings';
import type { GetMessage } from './options-types';
import type { DailyQuoteSectionHandlers, DailyQuoteSectionModel, QuoteLibraryRowModel } from './react/daily-quote-section';
import type { SelectControlItemModel } from './react/select-control';
import type { SettingsRowModel } from './react/settings-rows-view';
import * as NewtabQuoteSettings from '../domain/settings/newtab-quote';

const POSITIONS: readonly NewtabQuotePosition[] = Object.freeze(['top', 'input', 'search', 'bottom']);

interface DailyQuoteSectionDeps {
  view(handlers: DailyQuoteSectionHandlers): SectionView<DailyQuoteSectionModel>;
  settings: Pick<typeof Settings, 'newtabQuotePrefs' | 'newtabQuotePrefs' | 'NEWTAB_QUOTE_FONTS' |
    'NEWTAB_QUOTE_FONT_SIZE_MIN' | 'NEWTAB_QUOTE_FONT_SIZE_MAX' | 'NEWTAB_QUOTE_FONT_SIZE_DEFAULT'>;
  customQuotes: Pick<typeof CustomQuotes, 'KEY' | 'readLibraryFile' | 'normalizeLibrary' | 'select' |
    'readQuotePick'>;
  getMessage: GetMessage;
  showToast?(message: string, isError?: boolean): void;
  // The synced area the preferences live in.
  syncArea: { set(items: StorageItems): unknown } | null;
  // chrome.storage.local, for the custom collection.
  localArea: StorageAreaLike | null;
  getViewportTopInset(): number;
}

function createDailyQuoteSection(deps: DailyQuoteSectionDeps) {
  const { view, settings, customQuotes: custom, getMessage, getViewportTopInset } = deps;
  let prefs: NewtabQuotePrefs = settings.newtabQuotePrefs.parse(null);
  let library: QuoteLibrary | null = null;
  let importing = false;
  let shuffling = false;
  let importError = '';

  const render = (): void => controller.render({ rows: getRows(), library: getLibraryRow() });

  function persist(patch: Partial<NewtabQuotePrefs>): Promise<void> {
    const next = settings.newtabQuotePrefs.parse({ ...prefs, ...patch });
    prefs = next;
    render();
    return deps.syncArea
      ? Promise.resolve(deps.syncArea.set({ [settings.newtabQuotePrefs.key]: next })).then(() => {})
      : Promise.resolve();
  }

  function readLocal(keys: string[]): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const localArea = deps.localArea;
      if (!localArea) {
        resolve({});
        return;
      }
      localArea.get(keys, (values) => resolve(values || {}));
    });
  }

  function writeLocal(values: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const localArea = deps.localArea;
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

  async function importFile(file: File): Promise<void> {
    if (importing) return;
    importing = true;
    importError = '';
    render();
    let saving = false;
    try {
      const next = await custom.readLibraryFile(file);
      saving = true;
      await writeLocal({ [custom.KEY]: next, [NewtabQuoteSettings.customQuotePick.key]: null });
      library = next;
      await persist({ provider: 'custom' });
    } catch (_error) {
      importError = saving
        ? getMessage('newtab_quote_collection_save_error', 'Couldn’t save on this device. Your previous collection is kept.')
        : getMessage('newtab_quote_import_error', 'Import failed: the file doesn’t meet the format or size limits. Your previous collection is kept.');
    } finally {
      importing = false;
      render();
    }
  }

  // Moves today's pick on, the way Shuffle on New Tab does; an open New Tab
  // follows the stored pick.
  async function shuffle(): Promise<void> {
    if (shuffling || !library) return;
    shuffling = true;
    render();
    try {
      const values = await readLocal([custom.KEY, NewtabQuoteSettings.customQuotePick.key]);
      const current = custom.normalizeLibrary(values[custom.KEY]);
      if (!current) return;
      const selected = custom.select(current, new Date(), custom.readQuotePick(values[NewtabQuoteSettings.customQuotePick.key]), true);
      await writeLocal({ [NewtabQuoteSettings.customQuotePick.key]: selected.pick });
      if (deps.showToast) {
        deps.showToast(selected.quote.text);
      }
    } catch (_error) {
      if (deps.showToast) {
        deps.showToast(getMessage('newtab_quote_shuffle_error', 'Could not load another quote'), true);
      }
    } finally {
      shuffling = false;
      render();
    }
  }

  const controller = view({
    rows: {
      onToggle(key, checked) {
        if (key === 'enabled') {
          void persist({ enabled: checked });
        }
      },
      onSelect(key, value) {
        switch (key) {
          case 'provider':
            void persist({ provider: value === 'custom' ? 'custom' : 'hitokoto' });
            break;
          case 'category':
            void persist({ category: value === 'poetry' ? 'poetry' : 'literature' });
            break;
          case 'position':
            void persist({ position: POSITIONS.find((position) => position === value) || 'search' });
            break;
          case 'font':
            void persist({ font: value });
            break;
        }
      },
      onSlide(key, value) {
        if (key === 'fontSize') {
          void persist({ fontSize: value });
        }
      },
      getViewportTopInset
    },
    onImport: (file) => { void importFile(file); },
    onShuffle: () => { void shuffle(); }
  });

  function getPositionItems(): SelectControlItemModel[] {
    return POSITIONS.map((position) => {
      switch (position) {
        case 'top':
          return { value: position, labelKey: 'newtab_quote_top', label: getMessage('newtab_quote_top', '输入框上方') };
        case 'input':
          return { value: position, labelKey: 'newtab_quote_input', label: getMessage('newtab_quote_input', '输入框下方') };
        case 'search':
          return { value: position, labelKey: 'newtab_quote_search', label: getMessage('newtab_quote_search', '快捷方式下方') };
        case 'bottom':
          return { value: position, labelKey: 'newtab_quote_bottom', label: getMessage('newtab_quote_bottom', '页面底部') };
      }
    });
  }

  function getLibraryRow(): QuoteLibraryRowModel {
    // The import button names what it does now.
    const importLabel = importing
      ? getMessage('newtab_quote_importing', 'Importing…')
      : (library ? getMessage('newtab_quote_replace', 'Replace file') : getMessage('newtab_quote_import', 'Import file'));
    return {
      title: getMessage('newtab_quote_library', '句库'),
      hint: getMessage(
        'newtab_quote_import_hint',
        '每天自动换一句，也可以点「换一句」手动更换。支持 TXT / MD，每个非空正文行作为一句；文件最大 1 MB，最多 1,000 句，每句不超过 500 字。保存在本机，不走浏览器同步；开启 WebDAV 后会随之同步。'
      ),
      count: library
        ? {
          label: getMessage('newtab_quote_count', '{count} quotes').replace('{count}', String(library.quotes.length)),
          filename: library.filename
        }
        : null,
      canShuffle: Boolean(library && library.quotes.length >= 2),
      busy: importing || shuffling,
      importing,
      importLabel,
      shuffleLabel: getMessage('newtab_quote_shuffle_button', '换一句'),
      error: importError
    };
  }

  function getRows(): SettingsRowModel[] {
    const isCustom = prefs.provider === 'custom';
    const title = getMessage('newtab_quote_title', '每日名句');
    const sourceTitle = getMessage('newtab_quote_source', '句子来源');
    const categoryTitle = getMessage('newtab_quote_category', '名句类型');
    const min = settings.NEWTAB_QUOTE_FONT_SIZE_MIN;
    const max = settings.NEWTAB_QUOTE_FONT_SIZE_MAX;
    return [
      {
        type: 'toggle',
        key: 'enabled',
        title: {
          text: title,
          info: isCustom
            ? getMessage('newtab_quote_provider_custom', 'Custom collection · on this device, syncs with WebDAV')
            : getMessage('newtab_quote_provider', '由一言提供服务')
        },
        toggle: { id: '_x_extension_newtab_quote_toggle_2026_unique_', checked: prefs.enabled, ariaLabel: title, ariaLabelKey: 'newtab_quote_title' }
      },
      {
        type: 'reveal',
        key: 'quote-subrows',
        id: '_x_extension_newtab_quote_subrows_2026_unique_',
        expanded: prefs.enabled,
        rows: [
          {
            type: 'segmented',
            key: 'provider',
            rowId: '_x_extension_newtab_quote_source_row_2026_unique_',
            subrow: true,
            title: { text: sourceTitle },
            groupId: '_x_extension_newtab_quote_source_tabs_wrap_2026_unique_',
            ariaLabel: sourceTitle,
            segmented: {
              activeValue: prefs.provider,
              dataAttribute: 'data-quote-provider',
              items: [
                { value: 'hitokoto', labelKey: 'newtab_quote_hitokoto', label: getMessage('newtab_quote_hitokoto', '一言') },
                { value: 'custom', labelKey: 'newtab_quote_custom', label: getMessage('newtab_quote_custom', '自定义') }
              ]
            }
          },
          // The collection belongs to the custom source, the category to Hitokoto.
          {
            type: 'reveal',
            key: 'library-subrows',
            id: '_x_extension_newtab_quote_library_subrows_2026_unique_',
            expanded: isCustom,
            rows: [{ type: 'slot', key: 'library' }]
          },
          {
            type: 'reveal',
            key: 'category-subrows',
            id: '_x_extension_newtab_quote_category_subrows_2026_unique_',
            expanded: !isCustom,
            rows: [{
              type: 'segmented',
              key: 'category',
              rowId: '_x_extension_newtab_quote_category_row_2026_unique_',
              subrow: true,
              title: { text: categoryTitle },
              groupId: '_x_extension_newtab_quote_category_tabs_wrap_2026_unique_',
              ariaLabel: categoryTitle,
              segmented: {
                activeValue: prefs.category,
                dataAttribute: 'data-quote-category',
                items: [
                  { value: 'literature', labelKey: 'newtab_quote_literature', label: getMessage('newtab_quote_literature', '文学') },
                  { value: 'poetry', labelKey: 'newtab_quote_poetry', label: getMessage('newtab_quote_poetry', '诗词') }
                ]
              }
            }]
          },
          {
            type: 'select',
            key: 'position',
            rowId: '_x_extension_newtab_quote_position_row_2026_unique_',
            subrow: true,
            title: { id: '_x_extension_newtab_quote_position_select_2026_unique__title', text: getMessage('newtab_quote_position', '名句位置') },
            select: {
              id: '_x_extension_newtab_quote_position_select_2026_unique_',
              items: getPositionItems(),
              labelledBy: '_x_extension_newtab_quote_position_select_2026_unique__title',
              value: POSITIONS.includes(prefs.position) ? prefs.position : 'search'
            }
          },
          {
            type: 'select',
            key: 'font',
            rowId: '_x_extension_newtab_quote_font_row_2026_unique_',
            subrow: true,
            title: { id: '_x_extension_newtab_quote_font_select_2026_unique__title', text: getMessage('newtab_quote_font', '字体') },
            select: {
              id: '_x_extension_newtab_quote_font_select_2026_unique_',
              items: settings.NEWTAB_QUOTE_FONTS.map((font) => ({
                value: font.id,
                labelKey: font.labelKey,
                label: getMessage(font.labelKey, font.label)
              })),
              labelledBy: '_x_extension_newtab_quote_font_select_2026_unique__title',
              value: prefs.font
            }
          },
          {
            type: 'slider',
            key: 'fontSize',
            rowId: '_x_extension_newtab_quote_font_size_row_2026_unique_',
            subrow: true,
            title: { text: getMessage('newtab_quote_font_size', '字号') },
            hostId: '_x_extension_newtab_quote_font_size_control_2026_unique_',
            slider: {
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
            }
          }
        ]
      }
    ];
  }

  function applyLibrary(value: unknown): void {
    library = custom.normalizeLibrary(value);
    render();
  }

  // Follows the synced preferences and this device's collection.
  function bindSettings(settingBinder: SectionSettingBinder, storageChanges: Pick<StorageChangeRegistry, 'on'>): void {
    settingBinder.bindSetting({
      key: settings.newtabQuotePrefs.key,
      normalize: settings.newtabQuotePrefs.parse,
      apply(next) {
        prefs = next;
        render();
      },
      repairOnLoad: false,
      repairOnChange: false,
      refreshSelects: true
    });
    storageChanges.on(custom.KEY, (changes) => {
      applyLibrary(changes[custom.KEY].newValue);
    }, { area: 'local' });
    void readLocal([custom.KEY]).then((values) => applyLibrary(values[custom.KEY]));
  }

  render();

  return {
    render,
    bindSettings,
    destroy: () => controller.destroy()
  };
}

export { createDailyQuoteSection };
export type { DailyQuoteSectionDeps };
