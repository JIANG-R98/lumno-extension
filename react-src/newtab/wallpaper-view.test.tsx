import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createWallpaperViewApi,
  createWallpaperViewController,
  type WallpaperViewController
} from './wallpaper-view';

let controller: WallpaperViewController | null = null;

afterEach(() => {
  if (controller) {
    act(() => controller?.destroy());
  }
  controller = null;
  document.body.innerHTML = '';
});

describe('New Tab React wallpaper view', () => {
  it('renders the complete appearance panel contract', () => {
    act(() => {
      controller = createWallpaperViewController({
        documentObj: document,
        model: {
          activeTab: 'built-in',
          appearanceOptions: [
            { mode: 'system', imageUrl: '/system.svg' },
            { mode: 'light', imageUrl: '/light.svg' },
            { mode: 'dark', imageUrl: '/dark.svg' }
          ],
          effectTypes: [
            { type: 'none', fallback: 'Off' },
            { type: 'grain', fallback: 'Grain' },
            { type: 'blocks', fallback: 'Blocks' },
            { type: 'blur', fallback: 'Glass blur' },
            { type: 'crt', fallback: 'CRT' }
          ],
          effectInkTones: [
            { tone: 'dark', fallback: 'Shadows' },
            { tone: 'light', fallback: 'Highlights' }
          ],
          favicons: [{ id: 'default', previewUrl: '/favicon.png' }],
          icons: { info: '<i class="ri-information-line"></i>' },
          moreSettingsUrl: '/options#appearance',
          searchWidth: {
            min: 720,
            max: 1040,
            ticks: []
          },
          shortcutColumns: {
            defaultValue: 10,
            min: 4,
            max: 16
          },
          shortcutSize: {
            defaultValue: 64,
            min: 48,
            max: 80
          },
          shortcutGap: {
            defaultValue: 4,
            min: 0,
            max: 24
          },
          topContentOptions: [
            { value: 'brand', label: 'Brand' },
            { value: 'time', label: 'Time' },
            { value: 'off', label: 'Hide' }
          ],
          wallpapers: [
            { id: 'coast', path: '/coast.webp', thumbnailUrl: '/coast-thumb.webp' }
          ]
        }
      });
    });
    if (!controller) {
      throw new Error('Expected wallpaper view controller');
    }
    expect(createWallpaperViewApi().implementation).toBe('react');
    expect(controller.control.dataset.reactIsland).toBe('newtab-wallpaper');
    expect(controller.getRefs().builtInGrid).toBeTruthy();
    expect(
      controller.control.querySelector('[data-wallpaper-id="coast"]')
    ).not.toBeNull();
    expect(
      controller.control.querySelectorAll('[data-wallpaper-effect-type]')
    ).toHaveLength(5);
    expect(
      controller.control.querySelector('[data-wallpaper-effect-type="blocks"]')
    ).not.toBeNull();
    expect(
      controller.control.querySelector('[data-wallpaper-effect-type="blur"]')
    ).not.toBeNull();
    expect(
      controller.control.querySelector('[data-wallpaper-effect-type="crt"]')
    ).not.toBeNull();
    expect(
      controller.control.querySelectorAll('[data-wallpaper-blur-style]')
    ).toHaveLength(0);
    expect(controller.getRefs().effectBlurStyleControl).toBeUndefined();
    expect(
      controller.control.querySelectorAll('[data-wallpaper-effect-ink-tone]')
    ).toHaveLength(2);
    expect(controller.getRefs().effectInkToneControl).toBeTruthy();
    expect(controller.getRefs().effectCrtGrainControl).toBeUndefined();
    expect(
      controller.getRefs().effectSpacingSlider?.dataset.wallpaperDynamicRange
    ).toBeUndefined();
    const sliderRows = controller.control.querySelectorAll<HTMLElement>(
      '.x-nt-range-slider-row'
    );
    expect(sliderRows).toHaveLength(13);
    sliderRows.forEach((row) => {
      const slider = row.querySelector<HTMLInputElement>('input[type="range"]');
      const valueInput = row.querySelector<HTMLInputElement>('input[type="number"]');
      expect(slider).not.toBeNull();
      expect(valueInput?.max).toBe(slider?.max);
      expect(valueInput?.style.width).toBe('56px');
      expect(valueInput?.classList.contains('_x_extension_shortcut_input_2024_unique_'))
        .toBe(true);
      expect(valueInput?.classList.contains(
        '_x_extension_range_slider_value_input_2026_unique_'
      )).toBe(true);
      expect(valueInput?.style.height).toBe('36px');
    });
    expect(controller.getRefs().effectSizeSlider?.dataset.wallpaperDynamicRange).toBeUndefined();
    expect(controller.getRefs().effectTextureSlider?.dataset.wallpaperDynamicRange).toBeUndefined();
    expect(controller.getRefs().effectStrengthSlider?.dataset.wallpaperDynamicRange).toBeUndefined();
    const segmentedGroups = [
      controller.getRefs().effectOptions,
      controller.getRefs().effectInkToneOptions
    ];
    segmentedGroups.forEach((group) => {
      expect(group?.classList.contains('x-nt-segmented-tabs')).toBe(true);
      expect(group?.querySelector('.x-nt-segmented-tabs-indicator')).not.toBeNull();
      group?.querySelectorAll('button').forEach((button) => {
        expect(button.classList.contains('x-nt-segmented-tab')).toBe(true);
      });
    });
    expect(controller.getRefs().effectInkToneIndicator).toBeTruthy();
    expect(controller.getRefs().effectCrtPresetIndicator).toBeUndefined();
    expect(
      controller.control.querySelectorAll('[data-wallpaper-effect-crt-preset]')
    ).toHaveLength(0);
    const topContentGroup = controller.getRefs().topContentTabs;
    expect(topContentGroup?.getAttribute('role')).toBe('group');
    const topContentButtons = topContentGroup?.querySelectorAll('button');
    expect(topContentButtons).toHaveLength(3);
    expect(topContentButtons?.[0]?.getAttribute('aria-pressed')).toBe('true');
    const inputAutoFocusToggle = controller.getRefs().inputAutoFocusToggle;
    expect(inputAutoFocusToggle?.getAttribute('role')).toBe('switch');
    expect(inputAutoFocusToggle?.getAttribute('aria-label')).toBe(
      'Automatically focus the search input'
    );
    const inputAutoFocusInfoButton = controller.getRefs().inputAutoFocusInfoButton;
    expect(inputAutoFocusInfoButton?.classList.contains('x-nt-appearance-info-button')).toBe(true);
    expect(inputAutoFocusInfoButton?.querySelector('.ri-information-line')).not.toBeNull();
  });

  it('renders the shortcuts accordion collapsed with editable slider ticks', () => {
    act(() => {
      controller = createWallpaperViewController({
        documentObj: document,
        model: {
          appearanceOptions: [],
          effectTypes: [],
          favicons: [],
          icons: { arrow: '<i class="ri-arrow-right-s-line"></i>' },
          searchWidth: { min: 720, max: 1040, ticks: [] },
          shortcutColumns: {
            defaultValue: 10,
            min: 4,
            max: 16
          },
          shortcutSize: {
            defaultValue: 64,
            min: 48,
            max: 80
          },
          shortcutGap: {
            defaultValue: 4,
            min: 0,
            max: 24
          },
          wallpapers: []
        }
      });
    });
    if (!controller) {
      throw new Error('Expected wallpaper view controller');
    }
    const refs = controller.getRefs();
    const trigger = refs.shortcutsAccordionTrigger as HTMLButtonElement;
    const details = refs.shortcutsDetails as HTMLDivElement;
    const slider = refs.shortcutColumnsSlider as HTMLInputElement;
    const valueInput = refs.shortcutColumnsSliderValueInput as HTMLInputElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(
      '_x_extension_newtab_shortcuts_settings_2026_unique_'
    );
    expect(details.getAttribute('role')).toBe('region');
    expect(details.hidden).toBe(true);
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('4');
    expect(slider.max).toBe('16');
    expect(slider.step).toBe('1');
    expect(slider.value).toBe('10');
    expect(valueInput.type).toBe('number');
    expect(valueInput.value).toBe('10');
    expect(valueInput.max).toBe(slider.max);
    expect(valueInput.max).toBe('16');
    expect(valueInput.style.width).toBe('56px');
    expect(valueInput.style.height).toBe('36px');
    expect(Array.from(
      details.querySelectorAll('.x-nt-shortcut-columns-scale .x-nt-overlay-tick')
    ).map((tick) => tick.textContent)).toEqual(['4', '8', '12', '16']);
    expect(details.querySelectorAll<HTMLElement>(
      '.x-nt-shortcut-columns-scale .x-nt-overlay-tick'
    )[1]?.style.getPropertyValue('--x-nt-overlay-tick-percent')).toBe(
      `${100 / 3}%`
    );
    const sizeSlider = refs.shortcutSizeSlider as HTMLInputElement;
    const sizeReset = refs.shortcutSizeResetButton as HTMLButtonElement;
    const gapSlider = refs.shortcutGapSlider as HTMLInputElement;
    const gapReset = refs.shortcutGapResetButton as HTMLButtonElement;
    expect([sizeSlider.min, sizeSlider.value, sizeSlider.max]).toEqual([
      '48', '64', '80'
    ]);
    expect([gapSlider.min, gapSlider.value, gapSlider.max]).toEqual([
      '0', '4', '24'
    ]);
    [sizeReset, gapReset].forEach((button) => {
      expect(button.querySelector('.ri-reset-left-line')).not.toBeNull();
      expect(button.querySelector('.ri-size-14')).not.toBeNull();
      expect(button.classList.contains(
        '_x_extension_shortcut_group_action_2024_unique_'
      )).toBe(true);
      expect(button.nextElementSibling?.matches('input[type="number"]')).toBe(true);
      expect(button.disabled).toBe(true);
    });
  });

  it('updates custom wallpaper tiles without replacing the panel', () => {
    act(() => {
      controller = createWallpaperViewController({
        documentObj: document,
        model: {
          appearanceOptions: [],
          effectTypes: [],
          favicons: [],
          icons: {},
          searchWidth: { min: 720, max: 1040, ticks: [] },
          wallpapers: []
        }
      });
    });
    if (!controller) {
      throw new Error('Expected wallpaper view controller');
    }
    const panel = controller.panel;
    let tiles: HTMLElement[] = [];
    act(() => {
      tiles = controller?.renderCustomWallpapers([
        { id: 'custom-1', thumbnailUrl: 'data:image/png;base64,AA==' }
      ]) || [];
    });
    expect(tiles).toHaveLength(1);
    expect(tiles[0].dataset.wallpaperId).toBe('custom-1');
    expect(controller.panel).toBe(panel);
  });

  it('preserves zero as an explicit shortcut spacing value', () => {
    act(() => {
      controller = createWallpaperViewController({
        documentObj: document,
        model: {
          appearanceOptions: [],
          effectTypes: [],
          favicons: [],
          icons: {},
          searchWidth: { min: 720, max: 1040, ticks: [] },
          shortcutGap: { defaultValue: 0, min: 0, max: 24 },
          wallpapers: []
        }
      });
    });
    const refs = controller?.getRefs();
    expect((refs?.shortcutGapSlider as HTMLInputElement)?.value).toBe('0');
    expect((refs?.shortcutGapSliderValueInput as HTMLInputElement)?.value).toBe('0');
  });
});
