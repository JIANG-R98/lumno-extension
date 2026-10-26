// The look of New Tab in the Appearance tab: the material and its light or
// dark choice, the content width, what sits above the search box, and the
// clock's face, weight, size, opacity, color and format. One React view
// draws it; this keeps it in step with storage.
import type * as Settings from '../domain/settings';
import type { NewtabGlassStyle, NewtabGlassTheme, NewtabWidthMode } from '../domain/settings/newtab-page';
import type { NewtabTimeInk, NewtabTopContentMode } from '../domain/settings/newtab-time';
import type { StorageItems } from '../domain/storage-port';
import type { SectionView } from './options-section-view';
import { createSectionSetting, type SectionSettingBinder } from './options-section-setting';
import type { GetMessage } from './options-types';
import type { SegmentedControlItemModel } from './react/segmented-control';
import type { SelectControlItemModel } from './react/select-control';
import type { SettingsRowModel, SettingsRowsHandlers, SettingsSectionModel } from './react/settings-rows-view';

interface AppearanceNewtabLookSectionDeps {
  view(handlers: SettingsRowsHandlers): SectionView<SettingsSectionModel>;
  storageArea: { set(items: StorageItems): unknown } | null;
  SETTINGS: Pick<typeof Settings,
    'newtabGlassStyle' | 'newtabGlassTheme' | 'newtabWidthMode' |
    'newtabTopContentMode' | 'newtabTimeFont' | 'newtabTimeFontWeight' |
    'newtabTimeFontSize' | 'newtabTimeOpacity' | 'newtabTimeInk' |
    'newtabTimeSecondsVisible' | 'newtabTime12Hour' |
    'NEWTAB_TIME_FONTS' | 'NEWTAB_TIME_FONT_SIZE_MIN' | 'NEWTAB_TIME_FONT_SIZE_MAX' | 'NEWTAB_TIME_FONT_SIZE_DEFAULT' |
    'NEWTAB_TIME_OPACITY_MIN' | 'NEWTAB_TIME_OPACITY_MAX' | 'NEWTAB_TIME_OPACITY_DEFAULT' |
    'newtabGlassStyle' | 'newtabGlassTheme' | 'newtabWidthMode' |
    'newtabTopContentMode' | 'newtabTimeFont' | 'newtabTimeFontWeight' |
    'newtabTimeFontSize' | 'newtabTimeOpacity' | 'newtabTimeInk' |
    'newtabTimeSecondsVisible' | 'newtabTime12Hour' |
    'getNewtabTimeFont' | 'resolveNewtabTimeFontWeight'>;
  getMessage: GetMessage;
  // Asks open New Tab pages to redraw a part of themselves.
  notifyNewtabSectionsRefresh(section: string): void;
  getViewportTopInset(): number;
}

function createAppearanceNewtabLookSection(deps: AppearanceNewtabLookSectionDeps) {
  const { view, storageArea, SETTINGS, getMessage, notifyNewtabSectionsRefresh, getViewportTopInset } = deps;

  const render = (): void => controller.render({ rows: getRows() });
  const onChange = (): void => render();
  // Unset values stay unset, so opening Options does not write the defaults.
  const glassStyle = createSectionSetting({
    storageKey: SETTINGS.newtabGlassStyle.key,
    normalize: SETTINGS.newtabGlassStyle.parse,
    repairOnLoad: false,
    repairOnChange: false,
    refreshSelects: true
  }, storageArea, onChange);
  const glassTheme = createSectionSetting({
    storageKey: SETTINGS.newtabGlassTheme.key,
    normalize: SETTINGS.newtabGlassTheme.parse,
    repairOnLoad: false,
    repairOnChange: false
  }, storageArea, onChange);
  const widthMode = createSectionSetting({
    storageKey: SETTINGS.newtabWidthMode.key,
    normalize: SETTINGS.newtabWidthMode.parse,
    repairOnChange: false,
    refreshSelects: true
  }, storageArea, onChange);
  const topContent = createSectionSetting({
    storageKey: SETTINGS.newtabTopContentMode.key,
    normalize: SETTINGS.newtabTopContentMode.parse,
    refreshSelects: true
  }, storageArea, onChange);
  const timeFont = createSectionSetting({
    storageKey: SETTINGS.newtabTimeFont.key,
    normalize: SETTINGS.newtabTimeFont.parse,
    repairOnLoad: false,
    repairOnChange: false,
    refreshSelects: true
  }, storageArea, onChange);
  const timeFontWeight = createSectionSetting({
    storageKey: SETTINGS.newtabTimeFontWeight.key,
    normalize: SETTINGS.newtabTimeFontWeight.parse
  }, storageArea, onChange);
  const timeFontSize = createSectionSetting({
    storageKey: SETTINGS.newtabTimeFontSize.key,
    normalize: SETTINGS.newtabTimeFontSize.parse,
    repairOnLoad: false,
    repairOnChange: false
  }, storageArea, onChange);
  const timeOpacity = createSectionSetting({
    storageKey: SETTINGS.newtabTimeOpacity.key,
    normalize: SETTINGS.newtabTimeOpacity.parse,
    repairOnLoad: false,
    repairOnChange: false
  }, storageArea, onChange);
  const timeInk = createSectionSetting({
    storageKey: SETTINGS.newtabTimeInk.key,
    normalize: SETTINGS.newtabTimeInk.parse,
    repairOnLoad: false,
    repairOnChange: false
  }, storageArea, onChange);
  const timeSeconds = createSectionSetting({
    storageKey: SETTINGS.newtabTimeSecondsVisible.key,
    normalize: SETTINGS.newtabTimeSecondsVisible.parse,
    refreshSelects: true
  }, storageArea, onChange);
  const time12Hour = createSectionSetting({
    storageKey: SETTINGS.newtabTime12Hour.key,
    normalize: SETTINGS.newtabTime12Hour.parse,
    refreshSelects: true
  }, storageArea, onChange);
  const toggles = [timeSeconds, time12Hour];

  // Each face opens at its own default weight, as in New Tab's panel.
  function changeTimeFont(value: string): void {
    const font = SETTINGS.newtabTimeFont.parse(value);
    const weight = SETTINGS.getNewtabTimeFont(font).defaultWeight;
    timeFont.show(font);
    timeFontWeight.show(weight);
    if (storageArea) {
      storageArea.set({ [timeFont.storageKey]: font, [timeFontWeight.storageKey]: weight });
    }
  }

  const controller = view({
    onToggle(key, checked) {
      toggles.find((entry) => entry.storageKey === key)?.change(checked);
    },
    onSelect(key, value) {
      switch (key) {
        case glassStyle.storageKey:
          glassStyle.change(SETTINGS.newtabGlassStyle.parse(value));
          break;
        case glassTheme.storageKey:
          glassTheme.change(SETTINGS.newtabGlassTheme.parse(value));
          break;
        case widthMode.storageKey:
          widthMode.change(SETTINGS.newtabWidthMode.parse(value));
          notifyNewtabSectionsRefresh('all');
          break;
        case topContent.storageKey:
          topContent.change(SETTINGS.newtabTopContentMode.parse(value));
          break;
        case timeFont.storageKey:
          changeTimeFont(value);
          break;
        case timeInk.storageKey:
          timeInk.change(SETTINGS.newtabTimeInk.parse(value));
          break;
      }
    },
    onSlide(key, value) {
      switch (key) {
        case timeFontWeight.storageKey:
          timeFontWeight.change(SETTINGS.newtabTimeFontWeight.parse(value));
          break;
        case timeFontSize.storageKey:
          timeFontSize.change(SETTINGS.newtabTimeFontSize.parse(value));
          break;
        case timeOpacity.storageKey:
          timeOpacity.change(SETTINGS.newtabTimeOpacity.parse(value));
          break;
      }
    },
    getViewportTopInset
  });

  function getGlassStyleItems(): SelectControlItemModel[] {
    const styles: readonly NewtabGlassStyle[] = ['none', 'frosted', 'liquid'];
    return styles.map((style) => {
      switch (style) {
        case 'none':
          return { value: style, labelKey: 'settings_newtab_glass_style_none', label: getMessage('settings_newtab_glass_style_none', '默认') };
        case 'frosted':
          return {
            value: style,
            labelKey: 'settings_newtab_glass_style_frosted',
            label: getMessage('settings_newtab_glass_style_frosted', '亚克力'),
            badge: 'Beta'
          };
        case 'liquid':
          return {
            value: style,
            labelKey: 'settings_newtab_glass_style_liquid',
            label: getMessage('settings_newtab_glass_style_liquid', '液态玻璃'),
            badge: 'Beta'
          };
      }
    });
  }

  function getGlassThemeItems(): SegmentedControlItemModel[] {
    const themes: readonly NewtabGlassTheme[] = ['follow', 'light', 'dark'];
    return themes.map((theme) => {
      switch (theme) {
        case 'follow':
          return { value: theme, labelKey: 'settings_newtab_glass_theme_follow', label: getMessage('settings_newtab_glass_theme_follow', '自动') };
        case 'light':
          return { value: theme, labelKey: 'settings_newtab_glass_theme_light', label: getMessage('settings_newtab_glass_theme_light', '浅色') };
        case 'dark':
          return { value: theme, labelKey: 'settings_newtab_glass_theme_dark', label: getMessage('settings_newtab_glass_theme_dark', '深色') };
      }
    });
  }

  function getWidthItems(): SegmentedControlItemModel[] {
    const modes: readonly NewtabWidthMode[] = ['standard', 'wide'];
    return modes.map((mode) => (mode === 'standard'
      ? { value: mode, labelKey: 'newtab_width_standard', label: getMessage('newtab_width_standard', '标准') }
      : { value: mode, labelKey: 'newtab_width_wide', label: getMessage('newtab_width_wide', '宽屏（推荐）') }));
  }

  function getTopContentItems(): SegmentedControlItemModel[] {
    const modes: readonly NewtabTopContentMode[] = ['brand', 'time', 'off'];
    return modes.map((mode) => {
      switch (mode) {
        case 'brand':
          return { value: mode, labelKey: 'newtab_top_content_brand', label: getMessage('newtab_top_content_brand', '品牌标识') };
        case 'time':
          return { value: mode, labelKey: 'newtab_top_content_time', label: getMessage('newtab_top_content_time', '时间') };
        case 'off':
          return { value: mode, labelKey: 'newtab_top_content_off', label: getMessage('newtab_top_content_off', '隐藏') };
      }
    });
  }

  function getTimeInkItems(): SegmentedControlItemModel[] {
    const inks: readonly NewtabTimeInk[] = ['auto', 'light', 'dark'];
    return inks.map((ink) => {
      switch (ink) {
        case 'auto':
          return { value: ink, labelKey: 'newtab_time_ink_auto', label: getMessage('newtab_time_ink_auto', '自动') };
        case 'light':
          return { value: ink, labelKey: 'newtab_time_ink_light', label: getMessage('newtab_time_ink_light', '浅色') };
        case 'dark':
          return { value: ink, labelKey: 'newtab_time_ink_dark', label: getMessage('newtab_time_ink_dark', '深色') };
      }
    });
  }

  function getTimeRows(): SettingsRowModel[] {
    // The weight slider spans the range the chosen face draws well.
    const face = SETTINGS.getNewtabTimeFont(timeFont.get());
    const sizeMin = SETTINGS.NEWTAB_TIME_FONT_SIZE_MIN;
    const sizeMax = SETTINGS.NEWTAB_TIME_FONT_SIZE_MAX;
    const sizeDefault = SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT;
    const opacityMin = SETTINGS.NEWTAB_TIME_OPACITY_MIN;
    const opacityMax = SETTINGS.NEWTAB_TIME_OPACITY_MAX;
    const fontTitle = getMessage('newtab_time_font_title', '时间字体');
    const inkTitle = getMessage('newtab_time_ink_title', '时间颜色');
    const secondsTitle = getMessage('newtab_time_show_seconds_title', '显示秒数');
    const twelveHourTitle = getMessage('newtab_time_12_hour_title', '12 小时制');
    return [
      {
        type: 'select',
        key: timeFont.storageKey,
        rowId: '_x_extension_newtab_time_font_row_2026_unique_',
        subrow: true,
        title: { id: '_x_extension_newtab_time_font_select_2026_unique__title', text: fontTitle },
        select: {
          id: '_x_extension_newtab_time_font_select_2026_unique_',
          // Face names are proper names, so the list comes straight from settings.
          items: SETTINGS.NEWTAB_TIME_FONTS.map((font) => ({ value: font.id, label: font.label, labelKey: '' })),
          labelledBy: '_x_extension_newtab_time_font_select_2026_unique__title',
          value: timeFont.get()
        }
      },
      {
        type: 'slider',
        key: timeFontWeight.storageKey,
        rowId: '_x_extension_newtab_time_font_weight_row_2026_unique_',
        subrow: true,
        title: { text: getMessage('newtab_time_font_weight_title', '时间字重') },
        hostId: '_x_extension_newtab_time_font_weight_control_2026_unique_',
        slider: {
          ariaLabel: getMessage('newtab_time_font_weight_title', 'Time font weight'),
          defaultValue: face.defaultWeight,
          id: '_x_extension_newtab_time_font_weight_slider_2026_unique_',
          min: face.minWeight,
          max: face.maxWeight,
          resetAriaLabel: getMessage('newtab_time_font_weight_reset', 'Reset time font weight'),
          resetButtonId: '_x_extension_newtab_time_font_weight_reset_2026_unique_',
          step: 1,
          ticks: [
            { align: 'start', label: String(face.minWeight) },
            { label: String(Math.round((face.minWeight + face.maxWeight) / 2)) },
            { align: 'end', label: String(face.maxWeight) }
          ],
          value: SETTINGS.resolveNewtabTimeFontWeight(face.id, timeFontWeight.get())
        }
      },
      {
        type: 'slider',
        key: timeFontSize.storageKey,
        rowId: '_x_extension_newtab_time_font_size_row_2026_unique_',
        subrow: true,
        title: { text: getMessage('newtab_time_font_size_title', '时间字号') },
        hostId: '_x_extension_newtab_time_font_size_control_2026_unique_',
        slider: {
          ariaLabel: getMessage('newtab_time_font_size_title', 'Time size'),
          defaultValue: sizeDefault,
          id: '_x_extension_newtab_time_font_size_slider_2026_unique_',
          min: sizeMin,
          max: sizeMax,
          resetAriaLabel: getMessage('newtab_time_font_size_reset', 'Reset time size'),
          resetButtonId: '_x_extension_newtab_time_font_size_reset_2026_unique_',
          step: 1,
          ticks: [
            { align: 'start', label: String(sizeMin) },
            { label: String(sizeDefault), percent: ((sizeDefault - sizeMin) / (sizeMax - sizeMin)) * 100 },
            { align: 'end', label: String(sizeMax) }
          ],
          value: timeFontSize.get(),
          valueSuffix: ' px'
        }
      },
      {
        type: 'slider',
        key: timeOpacity.storageKey,
        rowId: '_x_extension_newtab_time_opacity_row_2026_unique_',
        subrow: true,
        title: { text: getMessage('newtab_time_opacity_title', '时间不透明度') },
        hostId: '_x_extension_newtab_time_opacity_control_2026_unique_',
        slider: {
          ariaLabel: getMessage('newtab_time_opacity_title', 'Time opacity'),
          defaultValue: SETTINGS.NEWTAB_TIME_OPACITY_DEFAULT,
          id: '_x_extension_newtab_time_opacity_slider_2026_unique_',
          min: opacityMin,
          max: opacityMax,
          resetAriaLabel: getMessage('newtab_time_opacity_reset', 'Reset time opacity'),
          resetButtonId: '_x_extension_newtab_time_opacity_reset_2026_unique_',
          step: 1,
          ticks: [
            { align: 'start', label: `${opacityMin}%` },
            { label: `${Math.round((opacityMin + opacityMax) / 2)}%` },
            { align: 'end', label: `${opacityMax}%` }
          ],
          value: timeOpacity.get(),
          valueSuffix: '%'
        }
      },
      {
        type: 'segmented',
        key: timeInk.storageKey,
        rowId: '_x_extension_newtab_time_ink_row_2026_unique_',
        subrow: true,
        title: { text: inkTitle },
        groupId: '_x_extension_newtab_time_ink_tabs_wrap_2026_unique_',
        ariaLabel: inkTitle,
        segmented: { activeValue: timeInk.get(), dataAttribute: 'data-newtab-time-ink', items: getTimeInkItems() }
      },
      {
        type: 'toggle',
        key: timeSeconds.storageKey,
        rowId: '_x_extension_newtab_time_seconds_row_2026_unique_',
        subrow: true,
        title: { text: secondsTitle },
        toggle: {
          id: '_x_extension_newtab_time_seconds_toggle_2026_unique_',
          checked: timeSeconds.get(),
          ariaLabel: secondsTitle,
          ariaLabelKey: 'newtab_time_show_seconds_title'
        }
      },
      {
        type: 'toggle',
        key: time12Hour.storageKey,
        rowId: '_x_extension_newtab_time_12_hour_row_2026_unique_',
        subrow: true,
        title: { text: twelveHourTitle },
        toggle: {
          id: '_x_extension_newtab_time_12_hour_toggle_2026_unique_',
          checked: time12Hour.get(),
          ariaLabel: twelveHourTitle,
          ariaLabelKey: 'newtab_time_12_hour_title'
        }
      }
    ];
  }

  function getRows(): SettingsRowModel[] {
    const glassThemeTitle = getMessage('settings_newtab_glass_theme_title', '材质深浅色');
    const widthTitle = getMessage('settings_newtab_width_title', '新标签页内容宽度');
    const topContentTitle = getMessage('settings_newtab_wordmark_title', '搜索框上方内容');
    return [
      { type: 'header', key: 'header', title: getMessage('settings_newtab_section_title', '新标签页') },
      {
        type: 'select',
        key: glassStyle.storageKey,
        compact: false,
        title: { id: '_x_extension_newtab_glass_style_select_2026_unique__title', text: getMessage('settings_newtab_glass_style_title', '材质') },
        description: getMessage('settings_newtab_glass_style_desc', '更换新标签页 UI 元素的材质'),
        select: {
          id: '_x_extension_newtab_glass_style_select_2026_unique_',
          items: getGlassStyleItems(),
          labelledBy: '_x_extension_newtab_glass_style_select_2026_unique__title',
          value: glassStyle.get()
        }
      },
      {
        // The material's light/dark choice only matters while a glass material is on.
        type: 'reveal',
        key: 'glass-theme',
        id: '_x_extension_newtab_glass_theme_subrows_2026_unique_',
        expanded: glassStyle.get() !== 'none',
        rows: [{
          type: 'segmented',
          key: glassTheme.storageKey,
          rowId: '_x_extension_newtab_glass_theme_row_2026_unique_',
          compact: false,
          subrow: true,
          title: { text: glassThemeTitle },
          description: getMessage(
            'settings_newtab_glass_theme_desc',
            '「自动」：跟随深浅色模式，壁纸较暗时改用深色材质，让文字保持清晰。\n「浅色」「深色」：固定材质，并让新标签页使用同样的深浅色。'
          ),
          groupId: '_x_extension_newtab_glass_theme_tabs_wrap_2026_unique_',
          ariaLabel: glassThemeTitle,
          segmented: { activeValue: glassTheme.get(), dataAttribute: 'data-newtab-glass-theme', items: getGlassThemeItems() }
        }]
      },
      {
        type: 'segmented',
        key: widthMode.storageKey,
        compact: false,
        title: { text: widthTitle },
        groupId: '_x_extension_newtab_width_tabs_wrap_2026_unique_',
        ariaLabel: widthTitle,
        segmented: {
          activeValue: widthMode.get(),
          dataAttribute: 'data-newtab-width',
          items: getWidthItems(),
          select: { id: '_x_extension_newtab_width_select_2026_unique_' }
        }
      },
      {
        type: 'segmented',
        key: topContent.storageKey,
        title: { text: topContentTitle },
        groupId: '_x_extension_newtab_top_content_tabs_wrap_2026_unique_',
        ariaLabel: topContentTitle,
        groupClassName: '_x_extension_top_content_tabs_2026_unique_',
        segmented: { activeValue: topContent.get(), dataAttribute: 'data-newtab-top-content', items: getTopContentItems() }
      },
      {
        // The clock's own options only matter while New Tab shows the time.
        type: 'reveal',
        key: 'time',
        id: '_x_extension_newtab_time_subrows_2026_unique_',
        expanded: topContent.get() === 'time',
        rows: getTimeRows()
      }
    ];
  }

  function bindSettings(settingBinder: SectionSettingBinder): void {
    [glassStyle, glassTheme, widthMode, topContent, timeFont, timeFontWeight, timeFontSize, timeOpacity, timeInk]
      .forEach((entry) => entry.bind(settingBinder));
    toggles.forEach((entry) => entry.bind(settingBinder));
  }

  render();

  return {
    render,
    bindSettings,
    destroy: () => controller.destroy()
  };
}

export { createAppearanceNewtabLookSection };
export type { AppearanceNewtabLookSectionDeps };
