import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFolderColorPicker } from './folder-color-picker';
import { parseFolderColor, folderColorToRgb } from './folder-color';

let picker: ReturnType<typeof createFolderColorPicker> | undefined;
afterEach(() => { act(() => picker?.destroy()); picker = undefined; document.body.innerHTML = ''; });

function setup(overrides: Parameters<typeof createFolderColorPicker>[0] = {}) {
  act(() => {
    picker = createFolderColorPicker({ ...overrides });
    picker.open({ folderId: '123', title: 'Design', color: '#5393FF' });
  });
  return picker!;
}
function input(index: number) { return document.querySelectorAll<HTMLInputElement>('input')[index]; }
function enter(index: number, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input(index), value);
    input(index).dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function chooseFormat(value: 'hex' | 'rgb') {
  act(() => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-format button')!.click());
  act(() => document.querySelector<HTMLElement>(`.x-nt-folder-color-format-menu [data-value="${value}"]`)!.click());
}
function button(text: string) {
  const result = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent === text);
  if (!result) throw new Error(`Missing button ${text}`);
  return result;
}
function swatch(group: 'presets' | 'saved', color: string) {
  return document.querySelector<HTMLButtonElement>(`.x-nt-folder-color-${group} .x-nt-folder-color-swatch[aria-label="${color}"]`)!;
}

describe('folder color values', () => {
  it('normalizes HEX and RGB while rejecting malformed and out-of-range values', () => {
    expect(parseFolderColor(' #a3f ')).toBe('#AA33FF');
    expect(parseFolderColor('aBcDeF')).toBe('#ABCDEF');
    expect(parseFolderColor('rgb(12, 34, 255)')).toBe('#0C22FF');
    expect(parseFolderColor('0, 0, 0')).toBe('#000000');
    expect(folderColorToRgb('#ffffff')).toBe('rgb(255, 255, 255)');
    for (const value of ['', '#abcd', '#ffffffff', 'rgb(256, 0, 0)', 'rgb(-1, 0, 0)', 'rgb(1.5, 0, 0)', 'rgb(1, 2, 3', '1, 2, 3)', 'red', 'rgba(1,2,3,0.5)']) {
      expect(parseFolderColor(value), value).toBeNull();
    }
  });
});

describe('folder color picker', () => {
  it('links both formats and previews only valid values', () => {
    const preview = vi.fn();
    setup({ onPreview: preview });
    enter(0, '#ef4444');
    expect(preview).toHaveBeenLastCalledWith('123', '#EF4444');
    expect(document.querySelectorAll('input')).toHaveLength(1);
    chooseFormat('rgb');
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('input')).map((element) => element.value)).toEqual(['239', '68', '68']);
    enter(0, '12'); enter(1, '34'); enter(2, '56');
    expect(preview).toHaveBeenLastCalledWith('123', '#0C2238');
    enter(1, '999');
    expect(button('Save').disabled).toBe(true);
    expect(input(1).getAttribute('aria-invalid')).toBe('true');
    expect(preview).toHaveBeenLastCalledWith('123', '#0C2238');
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="#5393FF"]')!.click());
    expect(button('Save').disabled).toBe(false);
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('input')).map((element) => element.value)).toEqual(['83', '147', '255']);
    enter(0, '12'); enter(1, '34'); enter(2, '56');
    chooseFormat('hex');
    expect(input(0).value).toBe('#0C2238');
    expect(document.querySelectorAll('input')).toHaveLength(1);
  });
  it('keeps invalid channel drafts until corrected and does not convert incomplete colors', () => {
    const preview = vi.fn();
    setup({ onPreview: preview });
    chooseFormat('rgb');
    enter(0, '');
    chooseFormat('hex');
    expect(document.querySelectorAll('input')).toHaveLength(3);
    expect(input(0).value).toBe('');
    expect(button('Save').disabled).toBe(true);
    expect(preview).toHaveBeenLastCalledWith('123', '#5393FF');
    for (const value of ['-1', '256', '1.5', 'abc', ' 32 ']) {
      enter(0, value);
      expect(input(0).getAttribute('aria-invalid')).toBe('true');
      expect(preview).toHaveBeenLastCalledWith('123', '#5393FF');
    }
    enter(0, '0'); enter(1, '0'); enter(2, '0');
    chooseFormat('hex');
    expect(input(0).value).toBe('#000000');
    expect(button('Save').disabled).toBe(false);
  });
  it('closes the format menu before the dialog when Escape is pressed', () => {
    setup();
    const trigger = document.querySelector<HTMLButtonElement>('.x-nt-folder-color-format button')!;
    act(() => trigger.click());
    act(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(picker!.isOpen()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(picker!.isOpen()).toBe(false);
  });
  it('saves normalized colors and resets by removing the customization', async () => {
    const submit = vi.fn(async () => {});
    setup({ onSubmit: submit });
    enter(0, '#f80');
    await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(submit).toHaveBeenLastCalledWith('123', '#FF8800');
    expect(picker!.isOpen()).toBe(false);
    act(() => picker!.open({ folderId: '123', title: 'Design', color: '#FF8800' }));
    act(() => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-stage button[aria-label="Restore default color"]')!.click());
    expect(input(0).value).toBe('#5393FF');
    await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(submit).toHaveBeenLastCalledWith('123', null);
  });
  it('cancels without saving and restores focus', () => {
    const submit = vi.fn();
    const onClose = vi.fn();
    const source = document.createElement('button'); document.body.append(source);
    setup({ onSubmit: submit, onClose });
    act(() => picker!.open({ folderId: '123', title: 'Design', sourceElement: source }));
    enter(0, '#22c55e');
    act(() => input(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(picker!.isOpen()).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(source);
  });
  it('keeps the picker open and allows retry when storage fails', async () => {
    setup({ onSubmit: async () => { throw new Error('Storage failed'); } });
    await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(picker!.isOpen()).toBe(true);
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Could not save');
    expect(button('Save').disabled).toBe(false);
  });
  it('animates the preview on hover while preserving its current color', () => {
    const animate = vi.fn();
    const preview = vi.fn();
    setup({ animateFolderIcon: animate, onPreview: preview });
    enter(0, '#22c55e');
    const icon = document.querySelector('.x-nt-folder-color-preview')!;
    act(() => icon.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    expect(animate).toHaveBeenLastCalledWith(icon, true);
    act(() => icon.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })));
    expect(animate).toHaveBeenLastCalledWith(icon, false);
    expect(preview).toHaveBeenLastCalledWith('123', '#22C55E');
    expect(input(0).value).toBe('#22c55e');
  });
  it('saves the current HEX and RGB colors for reuse across folders and picker instances', async () => {
    let stored: string[] = [];
    const saveSavedColors = vi.fn(async (colors: string[]) => { stored = [...colors]; });
    const onSubmit = vi.fn();
    const options = { readSavedColors: async () => stored, saveSavedColors, onSubmit };
    await act(async () => { setup(options); });
    enter(0, '#3a2a5f');
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.click());
    expect(saveSavedColors).toHaveBeenLastCalledWith(['#3A2A5F']);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.disabled).toBe(true);
    chooseFormat('rgb');
    enter(0, '12'); enter(1, '34'); enter(2, '56');
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.click());
    expect(stored).toEqual(['#3A2A5F', '#0C2238']);
    act(() => button('Cancel').click());
    await act(async () => picker!.open({ folderId: '456', title: 'Other folder' }));
    act(() => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-saved button[aria-label="#3A2A5F"]')!.click());
    expect(input(0).value).toBe('#3A2A5F');
    act(() => picker!.destroy());
    await act(async () => { setup(options); });
    expect(Array.from(document.querySelectorAll('.x-nt-folder-color-saved-item .x-nt-folder-color-swatch')).map((element) => element.getAttribute('aria-label'))).toEqual(stored);
  });
  it('treats a saved copy of a preset as an independent custom swatch', async () => {
    const preview = vi.fn();
    const saveSavedColors = vi.fn(async () => {});
    setup({ onPreview: preview, saveSavedColors });
    act(() => swatch('presets', '#8B5CF6').click());
    const previewCalls = preview.mock.calls.length;
    expect(swatch('presets', '#8B5CF6').getAttribute('aria-pressed')).toBe('true');
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.click());
    expect(saveSavedColors).toHaveBeenLastCalledWith(['#8B5CF6']);
    expect(swatch('saved', '#8B5CF6').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('presets', '#8B5CF6').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('.x-nt-folder-color-swatch[aria-pressed="true"]')).toHaveLength(1);
    chooseFormat('rgb');
    chooseFormat('hex');
    expect(swatch('saved', '#8B5CF6').getAttribute('aria-pressed')).toBe('true');
    act(() => swatch('presets', '#8B5CF6').click());
    expect(swatch('presets', '#8B5CF6').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('saved', '#8B5CF6').getAttribute('aria-pressed')).toBe('false');
    act(() => swatch('saved', '#8B5CF6').click());
    expect(swatch('saved', '#8B5CF6').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('presets', '#8B5CF6').getAttribute('aria-pressed')).toBe('false');
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-remove')!.click());
    expect(swatch('presets', '#8B5CF6').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('.x-nt-folder-color-swatch[aria-pressed="true"]')).toHaveLength(0);
    expect(input(0).value).toBe('#8B5CF6');
    expect(preview).toHaveBeenCalledTimes(previewCalls);
  });
  it('recognizes stored custom colors on reopen without linking manual edits to presets', async () => {
    await act(async () => { setup({ readSavedColors: async () => ['#5393FF'] }); });
    expect(swatch('saved', '#5393FF').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('presets', '#5393FF').getAttribute('aria-pressed')).toBe('false');
    enter(0, '#5393ff');
    expect(document.querySelectorAll('.x-nt-folder-color-swatch[aria-pressed="true"]')).toHaveLength(0);
    act(() => swatch('saved', '#5393FF').click());
    chooseFormat('rgb');
    enter(0, '083');
    expect(document.querySelectorAll('.x-nt-folder-color-swatch[aria-pressed="true"]')).toHaveLength(0);
    act(() => button('Cancel').click());
    await act(async () => picker!.open({ folderId: '123', title: 'Design', color: '#5393FF' }));
    expect(swatch('saved', '#5393FF').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('presets', '#5393FF').getAttribute('aria-pressed')).toBe('false');
  });
  it('switches from a preset to a custom color only after saving succeeds', async () => {
    const saveSavedColors = vi.fn().mockRejectedValueOnce(new Error('Storage failed')).mockResolvedValue(undefined);
    const onSubmit = vi.fn(async () => {});
    setup({ saveSavedColors, onSubmit });
    act(() => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-reset')!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.click());
    expect(swatch('presets', '#5393FF').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('.x-nt-folder-color-saved-item')).toHaveLength(0);
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.click());
    expect(swatch('saved', '#5393FF').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('presets', '#5393FF').getAttribute('aria-pressed')).toBe('false');
    await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onSubmit).toHaveBeenLastCalledWith('123', '#5393FF');
  });
  it('normalizes stored colors, removes duplicates and limits the saved row to eight colors', async () => {
    const saveSavedColors = vi.fn(async () => {});
    await act(async () => {
      setup({ readSavedColors: async () => ['bad value', '#abcd', '#ff0000', 'rgb(255, 0, 0)', null, '#010101', '#020202', '#030303', '#040404', '#050505', '#060606', '#070707', '#080808'], saveSavedColors });
    });
    const colors = Array.from(document.querySelectorAll('.x-nt-folder-color-saved-item .x-nt-folder-color-swatch')).map((element) => element.getAttribute('aria-label'));
    expect(colors).toEqual(['#FF0000', '#010101', '#020202', '#030303', '#040404', '#050505', '#060606', '#070707']);
    expect(document.querySelector('.x-nt-folder-color-add')).toBeNull();
    expect(saveSavedColors).not.toHaveBeenCalled();
  });
  it('does not save until the palette has loaded and the current color is valid', async () => {
    let resolveRead!: (colors: string[]) => void;
    const saveSavedColors = vi.fn(async () => {});
    setup({ readSavedColors: () => new Promise<string[]>((resolve) => { resolveRead = resolve; }), saveSavedColors });
    expect(document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.disabled).toBe(true);
    await act(async () => {});
    enter(0, 'invalid');
    await act(async () => { resolveRead(['#ABCDEF']); });
    expect(document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.disabled).toBe(true);
    act(() => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.click());
    expect(saveSavedColors).not.toHaveBeenCalled();
    enter(0, '#abc');
    expect(document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.disabled).toBe(false);
  });
  it('keeps failed palette writes out of the row and allows retry', async () => {
    const saveSavedColors = vi.fn().mockRejectedValueOnce(new Error('Storage failed')).mockResolvedValue(undefined);
    setup({ saveSavedColors });
    enter(0, '#123456');
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.click());
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Could not save this color');
    expect(document.querySelectorAll('.x-nt-folder-color-saved-item')).toHaveLength(0);
    expect(document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.disabled).toBe(false);
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.click());
    expect(saveSavedColors).toHaveBeenLastCalledWith(['#123456']);
    expect(document.querySelectorAll('.x-nt-folder-color-saved-item')).toHaveLength(1);
    expect(picker!.isOpen()).toBe(true);
  });
  it('prevents overwriting an unreadable saved palette with an empty row', async () => {
    const saveSavedColors = vi.fn(async () => {});
    await act(async () => { setup({ readSavedColors: async () => { throw new Error('Read failed'); }, saveSavedColors }); });
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Could not load saved colors');
    expect(document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.disabled).toBe(true);
    act(() => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.click());
    expect(saveSavedColors).not.toHaveBeenCalled();
    expect(button('Save').disabled).toBe(false);
  });
  it('deletes saved colors persistently without changing the preview and frees a full row', async () => {
    let stored = ['#123456', '#234567', '#345678', '#456789', '#56789A', '#6789AB', '#789ABC', '#89ABCD'];
    const preview = vi.fn();
    const saveSavedColors = vi.fn(async (colors: string[]) => { stored = [...colors]; });
    const options = { readSavedColors: async () => stored, saveSavedColors, onPreview: preview };
    await act(async () => { setup(options); });
    act(() => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-saved-item button[aria-label="#123456"]')!.click());
    const calls = preview.mock.calls.length;
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-saved-item[data-color="#123456"] .x-nt-folder-color-remove')!.click());
    expect(stored).toHaveLength(7);
    expect(stored).not.toContain('#123456');
    expect(input(0).value).toBe('#123456');
    expect(preview).toHaveBeenCalledTimes(calls);
    expect(document.querySelector('.x-nt-folder-color-saved-item[data-color="#123456"]')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('.x-nt-folder-color-add')!.disabled).toBe(false);
    act(() => button('Cancel').click());
    await act(async () => picker!.open({ folderId: '456', title: 'Other folder' }));
    expect(document.querySelector('.x-nt-folder-color-saved-item[data-color="#123456"]')).toBeNull();
    while (stored.length) {
      await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-remove')!.click());
    }
    expect(saveSavedColors).toHaveBeenLastCalledWith([]);
    expect(document.querySelectorAll('.x-nt-folder-color-saved-item')).toHaveLength(0);
    expect(document.activeElement).toBe(document.querySelector('.x-nt-folder-color-add'));
    expect(document.querySelectorAll('.x-nt-folder-color-presets .x-nt-folder-color-swatch')).toHaveLength(8);
  });
  it('retains a saved color when deletion fails and allows retry', async () => {
    const saveSavedColors = vi.fn().mockRejectedValueOnce(new Error('Storage failed')).mockResolvedValue(undefined);
    await act(async () => { setup({ readSavedColors: async () => ['#123456'], saveSavedColors }); });
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-remove')!.click());
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Could not delete this color');
    expect(document.querySelector('.x-nt-folder-color-saved-item[data-color="#123456"]')).not.toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('.x-nt-folder-color-remove')!.click());
    expect(saveSavedColors).toHaveBeenLastCalledWith([]);
    expect(document.querySelectorAll('.x-nt-folder-color-saved-item')).toHaveLength(0);
    expect(picker!.isOpen()).toBe(true);
  });
});
