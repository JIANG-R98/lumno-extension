import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as CustomQuotes from '../domain/custom-quotes';
import type { QuoteLibrary } from '../domain/custom-quotes';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createDailyQuoteSection } from './options-appearance-daily-quote-section';
import type { SettingSpec } from './options-setting-bindings';
import { createDailyQuoteSectionController } from './react/daily-quote-section';
import { getElement, getTag } from '../../tests/react/dom';
import { customQuotePick } from '../domain/settings/newtab-quote';

const sections: Array<{ destroy(): void }> = [];
const PREFS_KEY = Settings.newtabQuotePrefs.key;
const LIBRARY: QuoteLibrary = {
  version: 1,
  filename: 'quotes.txt',
  revision: 1,
  quotes: [{ text: 'First', author: '' }, { text: 'Second', author: '' }]
};

async function setUp({ local = {}, readLibraryFile = vi.fn(() => Promise.resolve(LIBRARY)) }: {
  local?: StorageItems;
  readLibraryFile?: () => Promise<QuoteLibrary>;
} = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  const localWrites: StorageItems[] = [];
  const localData: StorageItems = { ...local };
  const showToast = vi.fn();
  const section = createDailyQuoteSection({
    view: (handlers) => createDailyQuoteSectionController(host, handlers),
    settings: Settings,
    customQuotes: { ...CustomQuotes, readLibraryFile },
    getMessage: (_key, fallback) => fallback,
    showToast,
    syncArea: { set: (items) => writes.push(items) },
    localArea: {
      get(keys, callback) {
        const list = Array.isArray(keys) ? keys : [String(keys)];
        callback?.(Object.fromEntries(list.filter((key) => key in localData).map((key) => [key, localData[key]])));
      },
      set(items, callback) {
        localWrites.push(items);
        Object.assign(localData, items);
        callback?.();
      }
    },
    getViewportTopInset: () => 0
  });
  sections.push(section);
  const changes = new Map<string, (raw: unknown) => void>();
  const localListeners = new Map<string, (changes: Record<string, { newValue?: unknown }>) => void>();
  section.bindSettings({
    bindSetting<V>(spec: SettingSpec<V>): void {
      changes.set(spec.key, (raw) => spec.apply(spec.normalize(raw), raw));
    }
  }, {
    on(keys, listener) {
      (typeof keys === 'string' ? [keys] : Array.from(keys || [])).forEach((key) => {
        localListeners.set(key, (next) => listener(next, 'local'));
      });
    }
  });
  await act(async () => {});
  const store = (raw: unknown) => act(() => changes.get(PREFS_KEY)?.(raw));
  return { host, writes, localWrites, showToast, changes, localListeners, store };
}

const expanded = (host: HTMLElement, id: string) => getElement(host, `#_x_extension_newtab_quote_${id}_2026_unique_`).dataset.expanded;
const prefs = (patch: Partial<Settings.NewtabQuotePrefs>) => ({ ...Settings.newtabQuotePrefs.parse(null), ...patch });

beforeEach(() => {
  vi.stubGlobal('chrome', { runtime: { lastError: undefined } });
});

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
  vi.unstubAllGlobals();
});

describe('Options Appearance daily quote section', () => {
  it('follows the synced preferences and this device\'s collection', async () => {
    const { host, changes, localListeners } = await setUp();
    expect(Array.from(changes.keys())).toEqual([PREFS_KEY]);
    expect(Array.from(localListeners.keys())).toEqual([CustomQuotes.KEY]);
    expect(getElement(host, '#_x_extension_newtab_quote_count_2026_unique_').hidden).toBe(true);
    act(() => localListeners.get(CustomQuotes.KEY)?.({ [CustomQuotes.KEY]: { newValue: LIBRARY } }));
    const count = getElement(host, '#_x_extension_newtab_quote_count_2026_unique_');
    expect([count.hidden, count.dataset.tooltip, count.textContent]).toEqual([false, 'quotes.txt', '2 quotes']);
  });

  it('opens its options with the switch and saves the record', async () => {
    const { host, writes } = await setUp();
    expect(expanded(host, 'subrows')).toBe('false');
    act(() => getTag(host, '#_x_extension_newtab_quote_toggle_2026_unique_', 'input').click());
    expect(writes).toEqual([{ [PREFS_KEY]: prefs({ enabled: true }) }]);
    expect(expanded(host, 'subrows')).toBe('true');
  });

  it('shows the collection for the custom source and the category for Hitokoto', async () => {
    const { host, writes, store } = await setUp();
    store(prefs({ enabled: true }));
    expect([expanded(host, 'library_subrows'), expanded(host, 'category_subrows')]).toEqual(['false', 'true']);
    act(() => getElement(host, '[data-quote-provider="custom"]').click());
    expect(writes.at(-1)).toEqual({ [PREFS_KEY]: prefs({ enabled: true, provider: 'custom' }) });
    expect([expanded(host, 'library_subrows'), expanded(host, 'category_subrows')]).toEqual(['true', 'false']);
    act(() => getElement(host, '[data-quote-provider="hitokoto"]').click());
    act(() => getElement(host, '[data-quote-category="poetry"]').click());
    expect(writes.at(-1)).toEqual({ [PREFS_KEY]: prefs({ enabled: true, category: 'poetry' }) });
  });

  it('saves the font size from its slider', async () => {
    const { host, writes } = await setUp();
    const slider = getTag(host, '#_x_extension_newtab_quote_font_size_slider_2026_unique_', 'input');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(slider, '20');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(writes).toEqual([{ [PREFS_KEY]: prefs({ fontSize: 20 }) }]);
  });

  it('imports a file into this device\'s collection and switches to it', async () => {
    const { host, writes, localWrites } = await setUp();
    const input = getTag(host, '#_x_extension_newtab_quote_file_2026_unique_', 'input');
    const file = new File(['First\nSecond'], 'quotes.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(localWrites).toEqual([{ [CustomQuotes.KEY]: LIBRARY, [customQuotePick.key]: null }]);
    expect(writes).toEqual([{ [PREFS_KEY]: prefs({ provider: 'custom' }) }]);
    expect(getTag(host, '#_x_extension_newtab_quote_import_2026_unique_', 'button').textContent).toBe('Replace file');
    expect(getTag(host, '#_x_extension_newtab_quote_shuffle_2026_unique_', 'button').hidden).toBe(false);
  });

  it('keeps the previous collection and says why an import failed', async () => {
    const { host, localWrites } = await setUp({ readLibraryFile: () => Promise.reject(new Error('type')) });
    const input = getTag(host, '#_x_extension_newtab_quote_file_2026_unique_', 'input');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'quotes.pdf')] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(localWrites).toEqual([]);
    const status = getElement(host, '#_x_extension_newtab_quote_import_status_2026_unique_');
    expect([status.hidden, status.getAttribute('role')]).toEqual([false, 'alert']);
    expect(status.textContent).toContain('Import failed');
  });

  it('moves today\'s quote on and shows it', async () => {
    const { host, localWrites, showToast } = await setUp({ local: { [CustomQuotes.KEY]: LIBRARY } });
    await act(async () => {
      getTag(host, '#_x_extension_newtab_quote_shuffle_2026_unique_', 'button').click();
    });
    expect(Object.keys(localWrites[0] || {})).toEqual([customQuotePick.key]);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(['First', 'Second']).toContain(showToast.mock.calls[0]?.[0]);
  });
});
