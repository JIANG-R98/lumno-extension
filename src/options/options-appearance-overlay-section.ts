// The Appearance tab's webpage overlay section: the panel's size, width and
// opening animation, its local fonts, and whether it adapts to each page's
// colors. One React view draws it; this keeps it in step with storage.
import type * as Settings from '../domain/settings';
import type { OverlayEnterAnimation, OverlaySizeMode } from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import type { SectionView } from './options-section-view';
import { createSectionSetting, type SectionSettingBinder } from './options-section-setting';
import type { FormatTemplate, GetMessage } from './options-types';
import type {
  AppearanceOverlaySectionHandlers,
  AppearanceOverlaySectionModel,
  OverlayFontRowModel
} from './react/appearance-overlay-section';
import type { SegmentedControlItemModel } from './react/segmented-control';
import type { SelectControlItemModel } from './react/select-control';
import type { ThemeMode } from './react/theme-picker';

interface AppearanceOverlaySectionDeps {
  view(handlers: AppearanceOverlaySectionHandlers): SectionView<AppearanceOverlaySectionModel>;
  storageArea: { set(items: StorageItems): unknown; remove?(keys: string): unknown } | null;
  // The fonts are this device's own, so they stay out of browser sync.
  localStorageArea: { set(items: StorageItems): unknown } | null;
  SETTINGS: Pick<typeof Settings,
    'OVERLAY_SIZE_MODE_STORAGE_KEY' | 'OVERLAY_WIDTH_STORAGE_KEY' | 'OVERLAY_ENTER_ANIMATION_STORAGE_KEY' |
    'OVERLAY_FONT_FAMILY_STORAGE_KEY' | 'OVERLAY_FONT_FALLBACK_STORAGE_KEY' | 'OVERLAY_FONT_LABELS_STORAGE_KEY' |
    'OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY' | 'OVERLAY_WIDTH_MIN' | 'OVERLAY_WIDTH_MAX' |
    'getOverlaySizePreset' | 'normalizeOverlaySizeMode' | 'normalizeOverlayWidth' | 'normalizeOverlayEnterAnimation' |
    'normalizeOverlayFontFamily' | 'normalizeOverlayFontLabels' | 'normalizeOverlayPageThemeAdaptationEnabled'>;
  getMessage: GetMessage;
  formatTemplate: FormatTemplate;
  // The browser family the page runs in, as data-browser-family names it.
  browserFamily: string;
  listInstalledFonts(): Promise<readonly chrome.fontSettings.FontName[]>;
  getViewportTopInset(): number;
}

const SIZE_MODES: readonly OverlaySizeMode[] = ['compact', 'standard', 'large'];

function createAppearanceOverlaySection(deps: AppearanceOverlaySectionDeps) {
  const {
    view,
    storageArea,
    localStorageArea,
    SETTINGS,
    getMessage,
    formatTemplate,
    browserFamily,
    listInstalledFonts,
    getViewportTopInset
  } = deps;
  const FAMILY_KEY = SETTINGS.OVERLAY_FONT_FAMILY_STORAGE_KEY;
  const FALLBACK_KEY = SETTINGS.OVERLAY_FONT_FALLBACK_STORAGE_KEY;
  const LABELS_KEY = SETTINGS.OVERLAY_FONT_LABELS_STORAGE_KEY;
  const WIDTH_KEY = SETTINGS.OVERLAY_WIDTH_STORAGE_KEY;

  const render = (): void => controller.render(getModel());
  const sizeMode = createSectionSetting({
    storageKey: SETTINGS.OVERLAY_SIZE_MODE_STORAGE_KEY,
    normalize: SETTINGS.normalizeOverlaySizeMode,
    repairOnChange: false,
    refreshSelects: true
  }, storageArea, () => render());
  const enterAnimation = createSectionSetting({
    storageKey: SETTINGS.OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
    normalize: SETTINGS.normalizeOverlayEnterAnimation,
    repairOnChange: false
  }, storageArea, () => render());
  const pageThemeAdaptation = createSectionSetting({
    storageKey: SETTINGS.OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY,
    normalize: SETTINGS.normalizeOverlayPageThemeAdaptationEnabled,
    refreshSelects: true
  }, storageArea, () => render());
  // Null follows the size's own width.
  let width: number | null = null;
  let fontFamily = '';
  let fontFallback = '';
  // The fonts' names as the device that chose them showed them, by family.
  let fontLabels: Record<string, string> = {};
  // The installed fonts by name; null until read, and when the read failed.
  let installedFonts: Map<string, string> | null = null;
  // Adaptation only applies while the color mode follows the system.
  let themeMode: ThemeMode = 'system';
  const unsupportedFonts = browserFamily === 'firefox';

  const getSizeWidth = (): number => SETTINGS.getOverlaySizePreset(sizeMode.get()).width;
  const getFontLabel = (family: string): string =>
    (installedFonts && installedFonts.get(family)) || fontLabels[family] || family;

  function changeWidth(value: number): void {
    const next = SETTINGS.normalizeOverlayWidth(value);
    // The size's own width (also what reset picks) clears the custom value,
    // so the panel follows the size again.
    width = next === getSizeWidth() ? null : next;
    render();
    if (!storageArea) {
      return;
    }
    if (width === null) {
      storageArea.remove?.(WIDTH_KEY);
    } else {
      storageArea.set({ [WIDTH_KEY]: width });
    }
  }

  // A font is saved with its display name beside it, so another page (or a
  // device without the font) can still name it.
  function changeFont(key: string, value: string): void {
    const family = SETTINGS.normalizeOverlayFontFamily(value);
    const label = family ? getFontLabel(family) : '';
    if (key === FAMILY_KEY) {
      fontFamily = family;
    } else if (key === FALLBACK_KEY) {
      fontFallback = family;
    } else {
      return;
    }
    fontLabels = SETTINGS.normalizeOverlayFontLabels(
      family ? { ...fontLabels, [family]: label } : fontLabels,
      [fontFamily, fontFallback]
    );
    render();
    if (localStorageArea) {
      localStorageArea.set({ [key]: family, [LABELS_KEY]: fontLabels });
    }
  }

  const controller = view({
    rows: {
      onToggle(key, checked) {
        if (key === pageThemeAdaptation.storageKey) {
          pageThemeAdaptation.change(checked);
        }
      },
      onSelect(key, value) {
        if (key === sizeMode.storageKey) {
          sizeMode.change(SETTINGS.normalizeOverlaySizeMode(value));
        } else if (key === enterAnimation.storageKey) {
          enterAnimation.change(SETTINGS.normalizeOverlayEnterAnimation(value));
        }
      },
      onSlide(key, value) {
        if (key === WIDTH_KEY) {
          changeWidth(value);
        }
      },
      getViewportTopInset
    },
    onFont: changeFont,
    onFontReset: (key) => changeFont(key, '')
  });

  function getSizeItems(): SegmentedControlItemModel[] {
    return SIZE_MODES.map((mode) => {
      switch (mode) {
        case 'compact':
          return { value: mode, labelKey: 'overlay_size_compact', label: getMessage('overlay_size_compact', '小') };
        case 'standard':
          return { value: mode, labelKey: 'overlay_size_standard', label: getMessage('overlay_size_standard', '标准') };
        case 'large':
          return { value: mode, labelKey: 'overlay_size_large', label: getMessage('overlay_size_large', '大') };
      }
    });
  }

  function getAnimationItems(): SegmentedControlItemModel[] {
    const modes: readonly OverlayEnterAnimation[] = ['elastic', 'fade'];
    return modes.map((mode) => (mode === 'elastic'
      ? { value: mode, labelKey: 'overlay_enter_animation_elastic', label: getMessage('overlay_enter_animation_elastic', '弹性') }
      : { value: mode, labelKey: 'overlay_enter_animation_fade', label: getMessage('overlay_enter_animation_fade', '淡入') }));
  }

  // The default first, then the installed fonts by name. A chosen family
  // missing from the list (synced from another device, or the list not read
  // yet) still shows, rather than reading as the default.
  function getFontItems(current: string, defaultItem: SelectControlItemModel): SelectControlItemModel[] {
    const installed = installedFonts ? Array.from(installedFonts) : [];
    installed.sort((left, right) => left[1].localeCompare(right[1], undefined, { sensitivity: 'base' }));
    const items: SelectControlItemModel[] = [
      defaultItem,
      // The menu previews each face with the face itself.
      ...installed.map(([family, label]) => ({ value: family, label, labelKey: '', fontFamily: family }))
    ];
    if (current && !items.some((item) => item.value === current)) {
      items.push({ value: current, label: getFontLabel(current), labelKey: '', fontFamily: current });
    }
    return items;
  }

  // A chosen face this device does not have: the overlay already falls back,
  // and the row says which font is missing.
  function isFontMissing(family: string): boolean {
    return Boolean(installedFonts && family && !installedFonts.has(family));
  }

  function getFontRows(): OverlayFontRowModel[] {
    const unsupported = {
      browser: 'firefox',
      reasonKey: 'settings_overlay_font_unsupported_tooltip',
      active: unsupportedFonts
    };
    const family = '_x_extension_overlay_font_select_2026_unique_';
    const fallback = '_x_extension_overlay_font_fallback_select_2026_unique_';
    return [
      {
        key: FAMILY_KEY,
        rowId: '_x_extension_overlay_font_row_2026_unique_',
        title: { id: `${family}_title`, text: getMessage('settings_overlay_font_title', '本地字体') },
        description: getMessage('settings_overlay_font_desc', '读取这台电脑已安装的字体，只对这台设备生效，不会同步'),
        unsupported,
        select: {
          disabled: unsupportedFonts,
          emptyLabel: getMessage('settings_overlay_font_no_results', ''),
          id: family,
          items: getFontItems(fontFamily, {
            value: '',
            label: getMessage('settings_overlay_font_default', '默认'),
            labelKey: 'settings_overlay_font_default'
          }),
          labelledBy: `${family}_title`,
          searchPlaceholder: getMessage('settings_overlay_font_search_placeholder', ''),
          value: fontFamily
        },
        missing: {
          id: '_x_extension_overlay_font_missing_2026_unique_',
          text: isFontMissing(fontFamily)
            ? formatTemplate(getMessage('settings_overlay_font_missing', ''), { font: getFontLabel(fontFamily) })
            : '',
          actionLabel: getMessage('settings_overlay_font_missing_reset', '恢复默认'),
          hidden: !isFontMissing(fontFamily)
        }
      },
      {
        key: FALLBACK_KEY,
        rowId: '_x_extension_overlay_font_fallback_row_2026_unique_',
        title: { id: `${fallback}_title`, text: getMessage('settings_overlay_font_fallback_title', '本地回退字体') },
        description: getMessage('settings_overlay_font_fallback_desc', '主字体缺少字形时使用，例如英文字体下的中文'),
        unsupported,
        select: {
          disabled: unsupportedFonts,
          emptyLabel: getMessage('settings_overlay_font_no_results', ''),
          id: fallback,
          items: getFontItems(fontFallback, {
            value: '',
            label: getMessage('settings_overlay_font_fallback_none', '无'),
            labelKey: 'settings_overlay_font_fallback_none'
          }),
          labelledBy: `${fallback}_title`,
          searchPlaceholder: getMessage('settings_overlay_font_search_placeholder', ''),
          value: fontFallback
        },
        missing: {
          id: '_x_extension_overlay_font_fallback_missing_2026_unique_',
          text: isFontMissing(fontFallback)
            ? formatTemplate(getMessage('settings_overlay_font_fallback_missing', ''), { font: getFontLabel(fontFallback) })
            : '',
          actionLabel: getMessage('settings_overlay_font_fallback_missing_reset', '清除'),
          hidden: !isFontMissing(fontFallback)
        }
      }
    ];
  }

  function getModel(): AppearanceOverlaySectionModel {
    const sizeTitle = getMessage('settings_overlay_size_title', '尺寸');
    const animationTitle = getMessage('settings_overlay_enter_animation_title', '进入动画');
    const min = SETTINGS.OVERLAY_WIDTH_MIN;
    const max = SETTINGS.OVERLAY_WIDTH_MAX;
    const sizeWidth = getSizeWidth();
    // Like the New Tab search width, the marks are the named widths (each
    // size's own) and a drag settles on them.
    const sizeWidths = SIZE_MODES.map((mode) => SETTINGS.getOverlaySizePreset(mode).width);
    return {
      rows: [
        {
          type: 'header',
          key: 'header',
          title: getMessage('settings_webpage_focus_overlay_section_title', '网页聚焦搜索浮层')
        },
        {
          type: 'segmented',
          key: sizeMode.storageKey,
          compact: false,
          title: { text: sizeTitle },
          groupId: '_x_extension_overlay_size_tabs_wrap_2026_unique_',
          ariaLabel: sizeTitle,
          segmented: { activeValue: sizeMode.get(), dataAttribute: 'data-overlay-size', items: getSizeItems() }
        },
        {
          type: 'slider',
          key: WIDTH_KEY,
          rowId: '_x_extension_overlay_width_setting_row_2026_unique_',
          title: { text: getMessage('settings_overlay_width_title', '宽度') },
          hostId: '_x_extension_overlay_width_control_2026_unique_',
          slider: {
            ariaLabel: getMessage('settings_overlay_width_title', '宽度'),
            defaultValue: sizeWidth,
            id: '_x_extension_overlay_width_slider_2026_unique_',
            min,
            max,
            resetAriaLabel: getMessage('settings_overlay_width_reset', 'Match the size setting'),
            resetButtonId: '_x_extension_overlay_width_reset_2026_unique_',
            snapPoints: sizeWidths,
            snapThreshold: 14,
            step: 1,
            ticks: sizeWidths.map((value) => ({ label: String(value), percent: ((value - min) / (max - min)) * 100 })),
            value: width || sizeWidth,
            valueSuffix: ' px'
          }
        },
        {
          type: 'segmented',
          key: enterAnimation.storageKey,
          compact: false,
          title: { text: animationTitle },
          groupId: '_x_extension_overlay_enter_animation_tabs_wrap_2026_unique_',
          ariaLabel: animationTitle,
          segmented: {
            activeValue: enterAnimation.get(),
            dataAttribute: 'data-overlay-enter-animation',
            items: getAnimationItems()
          }
        },
        { type: 'slot', key: FAMILY_KEY },
        { type: 'slot', key: FALLBACK_KEY },
        {
          type: 'toggle',
          key: pageThemeAdaptation.storageKey,
          rowId: '_x_extension_overlay_page_theme_adaptation_row_2026_unique_',
          hidden: themeMode !== 'system',
          title: {
            text: getMessage('settings_overlay_page_theme_adaptation_title', '基于网页色彩自动变更主题色'),
            info: getMessage(
              'settings_overlay_page_theme_adaptation_tooltip',
              '仅在“深浅色模式”=“跟随系统”时显示，关闭后将不再基于网页主题色变更深浅模式。'
            )
          },
          toggle: {
            id: '_x_extension_overlay_page_theme_adaptation_toggle_2026_unique_',
            checked: pageThemeAdaptation.get()
          }
        }
      ],
      fonts: getFontRows()
    };
  }

  function bindSettings(settingBinder: SectionSettingBinder, localSettingBinder: SectionSettingBinder): void {
    sizeMode.bind(settingBinder);
    settingBinder.bindSetting({
      key: WIDTH_KEY,
      normalize: SETTINGS.normalizeOverlayWidth,
      apply(next) {
        width = next;
        render();
      },
      // Unset is a valid state (follow the size), so nothing is written back.
      repairOnLoad: false,
      repairOnChange: false
    });
    enterAnimation.bind(settingBinder);
    pageThemeAdaptation.bind(settingBinder);
    localSettingBinder.bindSetting({
      key: FAMILY_KEY,
      normalize: SETTINGS.normalizeOverlayFontFamily,
      apply(family) {
        fontFamily = family;
        render();
      },
      repairOnChange: false,
      refreshSelects: true
    });
    localSettingBinder.bindSetting({
      key: LABELS_KEY,
      // Families may load after the names, so nothing is pruned on read.
      normalize: (value) => SETTINGS.normalizeOverlayFontLabels(value),
      apply(labels) {
        fontLabels = labels;
        render();
      },
      repairOnLoad: false,
      repairOnChange: false,
      refreshSelects: true
    });
    localSettingBinder.bindSetting({
      key: FALLBACK_KEY,
      normalize: SETTINGS.normalizeOverlayFontFamily,
      apply(family) {
        fontFallback = family;
        render();
      },
      repairOnChange: false,
      refreshSelects: true
    });
  }

  // Shows or hides the adaptation row for the color mode; reports whether
  // the row's visibility changed.
  function showThemeMode(mode: ThemeMode): boolean {
    const wasHidden = themeMode !== 'system';
    themeMode = mode;
    render();
    return wasHidden !== (mode !== 'system');
  }

  render();
  void listInstalledFonts().then((fonts) => {
    const entries = new Map<string, string>();
    fonts.forEach((font) => {
      const family = font.fontId.trim();
      if (family && !entries.has(family)) {
        entries.set(family, font.displayName.trim() || family);
      }
    });
    // An empty list means the read failed, not that no font is installed.
    installedFonts = entries.size ? entries : null;
    render();
  });

  return {
    render,
    bindSettings,
    showThemeMode,
    destroy: () => controller.destroy()
  };
}

export { createAppearanceOverlaySection };
export type { AppearanceOverlaySectionDeps };
